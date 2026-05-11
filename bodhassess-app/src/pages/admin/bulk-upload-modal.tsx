'use client';

// Bulk-upload modal for respondents. Accepts CSV and XLSX; parses in the
// browser with SheetJS; shows a preview with per-row validation; on confirm
// posts to POST /respondents/bulk which re-validates and inserts everything
// inside a single transaction with a MySQL named lock (GET_LOCK/RELEASE_LOCK,
// so no two uploads can collide on R-NNN id generation).
//
// Trust boundary: client validation is purely for preview UX. The server
// re-runs every check and is the authority.

import { useCallback, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  bulkCreateRespondents,
  type BulkRespondentResult,
} from '@/lib/data-store';

type Consent = 'Granted' | 'Pending' | 'Withdrawn';

interface ParsedRow {
  rowNum: number; // 1-indexed within the uploaded file, matches server error.row
  name: string;
  email: string;
  dob: string;
  consent: Consent;
  error?: string; // client-side validation failure for preview UX only
}

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 1000;
const REQUIRED_HEADERS = ['name', 'email', 'dob'] as const;
const VALID_CONSENTS: Consent[] = ['Granted', 'Pending', 'Withdrawn'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Props {
  onClose: () => void;
  onImported: () => void; // parent calls refresh()
  existingEmails: Set<string>; // lowercased
}

export default function BulkUploadModal({ onClose, onImported, existingEmails }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<BulkRespondentResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const validRows = useMemo(() => rows.filter((r) => !r.error), [rows]);
  const invalidCount = rows.length - validRows.length;

  const reset = () => {
    setPhase('idle');
    setFileName('');
    setRows([]);
    setParseError('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const normaliseDOB = (raw: unknown): string => {
    if (raw == null) return '';
    // SheetJS with cellDates:true gives us JS Date objects for date-formatted
    // cells. Dates are anchored to UTC midnight (SheetJS default), so we MUST
    // use the UTC accessors — getFullYear/getMonth/getDate would shift by a
    // day for users in UTC-negative timezones.
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      const y = raw.getUTCFullYear();
      const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
      const d = String(raw.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(raw).trim();
    if (!s) return '';
    // Already canonical.
    if (DOB_RE.test(s)) return s;
    // Common Excel/user formats: dd/mm/yyyy or dd-mm-yyyy. Anything more
    // exotic is the user's problem — row gets flagged in preview.
    const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return s; // let validation catch it
  };

  const parseFile = useCallback(
    async (file: File) => {
      setParseError('');
      setFileName(file.name);
      if (file.size > MAX_FILE_BYTES) {
        setParseError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
        return;
      }
      const lower = file.name.toLowerCase();
      if (!/\.(csv|xlsx|xls)$/.test(lower)) {
        setParseError('Unsupported file type. Upload a .csv, .xlsx or .xls file.');
        return;
      }

      setPhase('parsing');
      try {
        const buf = await file.arrayBuffer();
        // cellDates:true converts Excel date serials to JS Date objects so we
        // don't deal with float serials. SheetJS 0.18 anchors those Date
        // objects to UTC midnight — normaliseDOB uses UTC accessors to match.
        const wb = XLSX.read(buf, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          setParseError('No sheet found in the file.');
          setPhase('idle');
          return;
        }
        const sheet = wb.Sheets[sheetName];
        // defval:'' so missing cells become empty strings (not undefined).
        // raw:true (default) preserves string cells as strings and date cells
        // as JS Date objects — `raw:false` would reformat everything to
        // locale-dependent strings and mangle YYYY-MM-DD CSV values.
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          defval: '',
          raw: true,
        });

        if (json.length === 0) {
          setParseError('The file is empty (no data rows).');
          setPhase('idle');
          return;
        }
        if (json.length > MAX_ROWS) {
          setParseError(`File has ${json.length} rows. Max ${MAX_ROWS} per upload.`);
          setPhase('idle');
          return;
        }

        // Normalise headers: trim + lowercase for lookup, keep original payloads.
        const first = json[0];
        const headerMap = new Map<string, string>();
        Object.keys(first).forEach((k) => headerMap.set(k.trim().toLowerCase(), k));
        const missing = REQUIRED_HEADERS.filter((h) => !headerMap.has(h));
        if (missing.length) {
          setParseError(
            `Missing required column(s): ${missing.join(', ')}. Expected: name, email, dob (consent is optional).`,
          );
          setPhase('idle');
          return;
        }

        // Within-file email dedup so preview flags client-side; server also checks.
        const seenEmails = new Map<string, number>();
        const parsed: ParsedRow[] = json.map((raw, i) => {
          const get = (key: string) => {
            const orig = headerMap.get(key);
            return orig ? raw[orig] : '';
          };
          const name = String(get('name') ?? '').trim();
          const email = String(get('email') ?? '').trim().toLowerCase();
          const dobRaw = get('dob');
          const dob = normaliseDOB(dobRaw);
          const consentRaw = String(get('consent') ?? '').trim();
          const consent: Consent =
            consentRaw === '' ? 'Pending'
            : (VALID_CONSENTS.find((c) => c.toLowerCase() === consentRaw.toLowerCase()) ?? (consentRaw as Consent));

          const rowNum = i + 1;
          let error: string | undefined;
          if (!name) error = 'Name is required';
          else if (!EMAIL_RE.test(email)) error = 'Invalid email';
          else if (!DOB_RE.test(dob)) error = 'DOB must be YYYY-MM-DD';
          else if (existingEmails.has(email)) error = 'Email already exists';
          else if (seenEmails.has(email))
            error = `Duplicate email (also row ${seenEmails.get(email)})`;
          else if (!VALID_CONSENTS.includes(consent))
            error = 'Consent must be Granted / Pending / Withdrawn';

          if (!error && email) seenEmails.set(email, rowNum);

          return { rowNum, name, email, dob, consent, error };
        });

        setRows(parsed);
        setPhase('preview');
      } catch (e: any) {
        setParseError(e?.message || 'Failed to parse file');
        setPhase('idle');
      }
    },
    [existingEmails],
  );

  const handlePick = () => inputRef.current?.click();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setPhase('importing');
    try {
      const res = await bulkCreateRespondents(
        validRows.map((r) => ({
          name: r.name,
          email: r.email,
          dob: r.dob,
          consent: r.consent,
        })),
      );
      setResult(res);
      setPhase('done');
      if (res.created > 0) onImported();
    } catch (e: any) {
      setParseError(e?.message || 'Import failed');
      setPhase('preview');
    }
  };

  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = '/respondents-template.csv';
    a.download = 'respondents-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={phase === 'importing' ? undefined : onClose}
    >
      <Card
        className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Bulk Upload Respondents
          </CardTitle>
          <button
            onClick={onClose}
            disabled={phase === 'importing'}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="p-5 space-y-4 overflow-y-auto">
          {/* ---------- idle ---------- */}
          {phase === 'idle' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={handlePick}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      Drop a .csv or .xlsx file here, or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Max 5 MB, up to {MAX_ROWS} rows per file.
                    </p>
                  </div>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleChange}
                  className="hidden"
                />
              </div>
              {parseError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
                <p className="font-medium">Expected columns</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li><span className="font-mono">name</span> — required</li>
                  <li><span className="font-mono">email</span> — required, must be unique</li>
                  <li><span className="font-mono">dob</span> — required, YYYY-MM-DD (also used as portal password)</li>
                  <li><span className="font-mono">consent</span> — optional: Granted / Pending / Withdrawn (defaults to Pending)</li>
                </ul>
                <p className="text-muted-foreground">
                  IDs like <span className="font-mono">R-001</span> are assigned by the server.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-3.5 w-3.5" />
                  Download CSV Template
                </Button>
              </div>
            </div>
          )}

          {/* ---------- parsing ---------- */}
          {phase === 'parsing' && (
            <div className="py-12 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Parsing {fileName}…</span>
            </div>
          )}

          {/* ---------- preview ---------- */}
          {phase === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="font-mono">{fileName}</span>
                  <span>·</span>
                  <span>{rows.length} rows</span>
                  <span>·</span>
                  <span className="text-green-600 dark:text-green-400">{validRows.length} valid</span>
                  {invalidCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-red-600 dark:text-red-400">{invalidCount} will be skipped</span>
                    </>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={reset}>
                  Choose another file
                </Button>
              </div>

              {parseError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {parseError}
                </div>
              )}

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">DOB</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Consent</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.rowNum}
                          className={`border-b border-border last:border-0 ${
                            row.error ? 'bg-red-50/50 dark:bg-red-950/10' : ''
                          }`}
                        >
                          <td className="px-3 py-2 text-muted-foreground">{row.rowNum}</td>
                          <td className="px-3 py-2">{row.name || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2 font-mono">{row.email || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2 font-mono">{row.dob || <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-3 py-2">{row.consent}</td>
                          <td className="px-3 py-2">
                            {row.error ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-[0.6875rem] font-medium text-red-700 dark:text-red-400">
                                <AlertCircle className="h-3 w-3" />
                                {row.error}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[0.6875rem] font-medium text-green-700 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  variant="primary"
                  onClick={handleImport}
                  disabled={validRows.length === 0}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import {validRows.length} {validRows.length === 1 ? 'respondent' : 'respondents'}
                </Button>
              </div>
            </div>
          )}

          {/* ---------- importing ---------- */}
          {phase === 'importing' && (
            <div className="py-12 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Importing {validRows.length} respondents…</span>
            </div>
          )}

          {/* ---------- done ---------- */}
          {phase === 'done' && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3">
                  <p className="text-xs text-green-700 dark:text-green-400">Created</p>
                  <p className="text-2xl font-semibold text-green-700 dark:text-green-400">{result.created}</p>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 p-3">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400">Skipped</p>
                  <p className="text-2xl font-semibold text-yellow-700 dark:text-yellow-400">{result.skipped}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3">
                  <p className="text-xs text-red-700 dark:text-red-400">Errors</p>
                  <p className="text-2xl font-semibold text-red-700 dark:text-red-400">
                    {Math.max(result.errors.length - result.skipped, 0)}
                  </p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-muted/40 text-xs font-medium">
                    Issues ({result.errors.length})
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/20 sticky top-0">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Row</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((e, i) => (
                          <tr key={i} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 text-muted-foreground">{e.row}</td>
                            <td className="px-3 py-2 font-mono">{e.email || '—'}</td>
                            <td className="px-3 py-2">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={reset}>
                  Upload another file
                </Button>
                <Button variant="primary" onClick={onClose}>Done</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
