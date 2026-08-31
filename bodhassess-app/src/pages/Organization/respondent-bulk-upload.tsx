import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  organizationApis,
  type BulkRespondentIssue,
  type BulkRespondentReport,
  type BulkRespondentRow,
  type CreatedRespondentDetail,
} from './organizationApis';

/**
 * Bulk-register respondents into one organization from a spreadsheet —
 * step 3's "Upload" tab.
 *
 * Three steps, and the middle one is the point:
 *
 *   pick → review → done
 *
 * The sheet is parsed in the browser (SheetJS, dynamically imported so it
 * stays out of the main bundle) and then sent to /respondents/bulk-validate,
 * which writes nothing and reports EVERY bad row at once. Only when the report
 * is clean does /respondents/bulk-create commit, all-or-nothing.
 *
 * Why the extra round trip: the browser can check a row against itself and
 * against the rest of the sheet, but only the server knows whether an email is
 * already taken or an employee ID is already used in this organization. And
 * failing on the first bad row — the shape /questions/bulk-create uses — turns
 * a 300-line sheet into fix-one, re-upload, repeat.
 *
 * This registers people and nothing else: no assessment is allotted. Members
 * first, assignment afterwards, the same as the organization-wide link.
 */

/** Canonical column keys, in template order. */
const COLUMNS = [
  'name',
  'email',
  'dob',
  'phoneCountryCode',
  'phone',
  'gender',
  'employeeId',
] as const;
// phone and gender joined this list on 2026-08-24, when both became required
// on every respondent form; phoneCountryCode joined on 2026-08-31, when a
// number became a country code plus exactly ten digits. A sheet without those
// columns is rejected here, before upload, with the column named — better than
// the server answering with one "required" issue per line for a column that
// simply is not there. It does mean a sheet written before either date has to
// gain a column before it will upload, which is the intended trade.
const REQUIRED_COLUMNS = ['name', 'email', 'dob', 'phoneCountryCode', 'phone', 'gender'] as const;

/** Headers are matched case- and space-insensitively: "Employee ID" → employeeid. */
const normalizeHeader = (header: string) => header.toLowerCase().replace(/[\s_-]/g, '');
const HEADER_ALIASES: Record<string, (typeof COLUMNS)[number]> = {
  name: 'name',
  fullname: 'name',
  email: 'email',
  emailaddress: 'email',
  dob: 'dob',
  dateofbirth: 'dob',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  phonecountrycode: 'phoneCountryCode',
  countrycode: 'phoneCountryCode',
  dialcode: 'phoneCountryCode',
  isdcode: 'phoneCountryCode',
  callingcode: 'phoneCountryCode',
  employeeid: 'employeeId',
  empid: 'employeeId',
  gender: 'gender',
};

/**
 * Excel dates → dd-MM-yyyy.
 *
 * SheetJS with cellDates:true hands back JS Dates anchored at UTC midnight, so
 * the UTC accessors are mandatory — getFullYear/getMonth/getDate would shift
 * every birthday back a day for anyone in a UTC-negative timezone. dob is the
 * portal password, so that silent shift would lock people out of their own
 * accounts.
 *
 * Text cells are passed through with only the obvious separators normalised;
 * anything stranger is left alone for the server to reject by row.
 */
function toDdMmYyyy(raw: unknown): string {
  if (raw == null) return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const d = String(raw.getUTCDate()).padStart(2, '0');
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${raw.getUTCFullYear()}`;
  }
  const text = String(raw).trim();
  if (!text) return '';
  // dd/mm/yyyy or dd.mm.yyyy → dd-MM-yyyy.
  const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
  }
  // yyyy-mm-dd, which is what a lot of exports produce.
  const ymd = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
  }
  return text;
}

const cell = (value: unknown) => (value == null ? '' : String(value).trim());

/**
 * Country-code cells → "+91".
 *
 * Lenient because a spreadsheet mangles this one predictably: a cell typed as
 * `+91` may arrive as the number 91 with the '+' gone, and people write the
 * international prefix as `0091` as often as `+91`. All three mean the same
 * country, so all three are accepted rather than reported as a bad row.
 * Anything else is passed through untouched for the server to reject by line.
 */
const dialCode = (value: unknown) => {
  const raw = cell(value).replace(/[\s()-]/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  return /^[0-9]+$/.test(raw) ? `+${raw}` : raw;
};

/** Parsed sheet, or the reason it could not be read at all. */
interface ParseOutcome {
  rows: BulkRespondentRow[];
  error?: string;
}

async function parseSheet(file: File): Promise<ParseOutcome> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  // The template ships a sheet named "respondents"; anything else falls back
  // to the first sheet so a hand-made file still works.
  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase() === 'respondents') ?? workbook.SheetNames[0];
  if (!sheetName) return { rows: [], error: 'That file has no sheets in it.' };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: '',
  });
  if (raw.length === 0) {
    return { rows: [], error: 'That sheet has no data rows — only headers, or nothing at all.' };
  }

  // Map the file's headers onto our canonical keys once, then reuse.
  const headerMap = new Map<string, (typeof COLUMNS)[number]>();
  for (const header of Object.keys(raw[0])) {
    const alias = HEADER_ALIASES[normalizeHeader(header)];
    if (alias) headerMap.set(header, alias);
  }
  const present = new Set(headerMap.values());
  const missing = REQUIRED_COLUMNS.filter((c) => !present.has(c));
  if (missing.length > 0) {
    return {
      rows: [],
      error: `Missing required column(s): ${missing.join(', ')}. The sheet needs ${REQUIRED_COLUMNS.join(', ')} — download the template if you are unsure.`,
    };
  }

  const rows = raw.map((source, index) => {
    const picked: Record<string, unknown> = {};
    for (const [header, key] of headerMap) picked[key] = source[header];
    return {
      // +2: the header occupies line 1, so the first data row is line 2 —
      // which is the number the admin sees in their spreadsheet.
      row: index + 2,
      name: cell(picked.name),
      email: cell(picked.email),
      dob: toDdMmYyyy(picked.dob),
      phoneCountryCode: dialCode(picked.phoneCountryCode) || undefined,
      phone: cell(picked.phone) || undefined,
      employeeId: cell(picked.employeeId) || undefined,
      gender: cell(picked.gender) || undefined,
    } satisfies BulkRespondentRow;
  });

  // A trailing blank row is normal in a spreadsheet and is not an error.
  const meaningful = rows.filter((r) => r.name || r.email || r.dob);
  if (meaningful.length === 0) {
    return { rows: [], error: 'Every row in that sheet is empty.' };
  }
  return { rows: meaningful };
}

async function downloadTemplate() {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet(
    [
      {
        name: 'Arjun Patel',
        email: 'arjun.patel@example.com',
        dob: '15-08-1994',
        phoneCountryCode: '+91',
        // Digits only — no country code, no trunk prefix.
        phone: '9876543210',
        gender: 'MALE',
        employeeId: 'EMP1042',
      },
    ],
    { header: [...COLUMNS] },
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'respondents');
  XLSX.writeFile(workbook, 'respondents-template.xlsx');
}

/** The credentials the uploaded people need — nothing emails this to them. */
async function downloadCredentials(created: CreatedRespondentDetail[], orgName: string) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet(
    created.map((r) => ({
      'Serial ID': r.serialId ?? '',
      Name: r.name,
      'Sign-in email': r.email,
      'Employee ID': r.employeeId ?? '',
      'Password (date of birth)': r.dob,
    })),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'credentials');
  const safeOrg = orgName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  XLSX.writeFile(workbook, `${safeOrg || 'organization'}-credentials.xlsx`);
}

interface RespondentBulkUploadProps {
  organizationId: number;
  organizationName: string;
  /** Fired after a successful import so the wizard and list behind refresh. */
  onImported: () => void | Promise<void>;
}

export function RespondentBulkUpload({
  organizationId,
  organizationName,
  onImported,
}: RespondentBulkUploadProps) {
  const [step, setStep] = useState<'pick' | 'review' | 'done'>('pick');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BulkRespondentRow[]>([]);
  const [report, setReport] = useState<BulkRespondentReport | null>(null);
  const [created, setCreated] = useState<CreatedRespondentDetail[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('pick');
    setFileName('');
    setRows([]);
    setReport(null);
    setCreated([]);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPick = async (file: File | null) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const parsed = await parseSheet(file);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      setFileName(file.name);
      setRows(parsed.rows);
      // Straight into validation — a parsed sheet the admin cannot act on yet
      // is not worth a screen of its own.
      const res = await organizationApis.bulkValidateRespondents({
        organizationId,
        rows: parsed.rows,
      });
      setReport(res.data);
      setStep('review');
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
          e?.message ||
          'Could not read that file — is it a .xlsx or .csv spreadsheet?',
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const commit = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await organizationApis.bulkCreateRespondents({ organizationId, rows });
      setCreated(res.data);
      setStep('done');
      await onImported();
    } catch (e: any) {
      // 422 means the sheet stopped being valid between validate and commit —
      // someone took an email in the meantime. Show the fresh report.
      const body = e?.response?.data;
      if (e?.response?.status === 422 && body?.issues) {
        setReport(body as BulkRespondentReport);
        setError('Something changed since the check — the rows below still need fixing.');
      } else {
        setError(body?.message || e?.message || 'Import failed. Nothing was saved.');
      }
    } finally {
      setBusy(false);
    }
  };

  // Issues grouped by row, so each bad line is reported once with everything
  // wrong with it rather than appearing four times.
  const issuesByRow = new Map<number, BulkRespondentIssue[]>();
  for (const issue of report?.issues ?? []) {
    const list = issuesByRow.get(issue.row);
    if (list) list.push(issue);
    else issuesByRow.set(issue.row, [issue]);
  }
  const clean = !!report && report.issues.length === 0;

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'pick' && (
        <>
          <p className="text-xs text-muted-foreground">
            Registers people straight into{' '}
            <span className="font-medium text-foreground">{organizationName}</span>. Their date of
            birth is their portal password, so it is required. No assessment is assigned — do that
            once they are members.
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
            <li>
              <span className="font-mono text-foreground">name</span>,{' '}
              <span className="font-mono text-foreground">email</span>,{' '}
              <span className="font-mono text-foreground">dob</span>,{' '}
              <span className="font-mono text-foreground">phoneCountryCode</span>,{' '}
              <span className="font-mono text-foreground">phone</span>,{' '}
              <span className="font-mono text-foreground">gender</span> are required.
            </li>
            <li>
              <span className="font-mono text-foreground">phoneCountryCode</span> is the dial code —
              write it as +91, 0091 or just 91.{' '}
              <span className="font-mono text-foreground">phone</span> is the rest of the number,
              digits only: no spaces or brackets, no country code, and no leading 0. The two
              together cannot exceed 15 digits (the E.164 standard).
            </li>
            <li>
              <span className="font-mono text-foreground">gender</span> is one of MALE, FEMALE,
              OTHER or PREFER NOT TO SAY — spelling and capitalisation do not matter.
            </li>
            <li>
              <span className="font-mono text-foreground">employeeId</span> is optional.
            </li>
            <li>
              Dates read as DD-MM-YYYY. Real date cells from Excel are understood too.
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy ? 'Checking…' : 'Choose spreadsheet'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void downloadTemplate()} disabled={busy}>
              <Download className="h-3.5 w-3.5" /> Download template
            </Button>
          </div>
        </>
      )}

      {step === 'review' && report && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm font-medium truncate">{fileName}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              <X className="h-3.5 w-3.5" /> Choose another
            </Button>
          </div>

          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-xs flex items-start gap-2',
              clean
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
            )}
          >
            {clean ? (
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <span>
              {clean
                ? `All ${report.totalRows} row(s) are ready to import.`
                : `${report.validRows} of ${report.totalRows} row(s) are ready. Fix the ${issuesByRow.size} row(s) below in your sheet and upload it again — nothing has been saved.`}
            </span>
          </div>

          <div className="border border-border rounded-lg max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium w-12">Row</th>
                  <th className="px-2 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 font-medium">Email</th>
                  <th className="px-2 py-1.5 font-medium">DOB</th>
                  <th className="px-2 py-1.5 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const problems = issuesByRow.get(r.row);
                  return (
                    <tr key={r.row} className={cn(problems && 'bg-red-50/60 dark:bg-red-950/20')}>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.row}</td>
                      <td className="px-2 py-1.5 truncate max-w-[10rem]">{r.name || '—'}</td>
                      <td className="px-2 py-1.5 truncate max-w-[14rem]">{r.email || '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{r.dob || '—'}</td>
                      <td className="px-2 py-1.5 text-red-700 dark:text-red-400">
                        {problems ? problems.map((p) => p.message).join('; ') : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Button variant="primary" size="sm" onClick={commit} disabled={busy || !clean}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {busy ? 'Importing…' : `Import ${report.totalRows} respondent(s)`}
          </Button>
        </>
      )}

      {step === 'done' && (
        <>
          <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{created.length} respondent(s) registered.</p>
              <p className="text-xs mt-1">
                Nothing tells them their sign-in details — download the list and pass it on. Their
                password is their date of birth.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void downloadCredentials(created, organizationName)}
            >
              <Download className="h-3.5 w-3.5" /> Download credentials
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              Close
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
