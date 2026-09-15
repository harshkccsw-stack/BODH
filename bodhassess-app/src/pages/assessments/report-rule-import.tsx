import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Info, Loader2, Upload, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RULE_STAGES,
  downloadSheetTemplate,
  reportRulesApi,
  workbookToCsv,
  type SheetPreview,
} from '@/pages/Reports/reportRulesApi';

/**
 * Import a psychometrician's scoring workbook.
 *
 * Two steps, the same shape as the question sheet's wizard: pick a file, then
 * review what it would create before anything is written. The review step is
 * not politeness — rule names are unique across the whole installation, so a
 * clash is far cheaper to see here than to hit partway through writing
 * twenty-two rows.
 *
 * Everything imports as a STATEMENT holding the sheet's own words. Nothing
 * imported is runnable, which is the property that makes this safe to offer to
 * a non-technical practitioner: an import can file a rule in the wrong step,
 * and that is visible and one click to fix, but it cannot put a wrong number
 * in anybody's report.
 */
export function ReportRuleImport({
  assessmentId,
  organizationId,
  onClose,
  onImported,
}: {
  assessmentId: number | null;
  organizationId?: number | null;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const stageLabel = (key: string) =>
    RULE_STAGES.find((s) => s.key === key)?.label ?? key;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const text = await workbookToCsv(file);
      const result = await reportRulesApi.importPreview(text, assessmentId, organizationId);
      setCsv(text);
      setFileName(file.name);
      setPreview(result);
    } catch (e: any) {
      setPreview(null);
      setError(e?.response?.data?.message || e?.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setError('');
    setBusy(true);
    try {
      const created = await reportRulesApi.importSheet(csv, assessmentId, organizationId);
      onImported(created.length);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not import that sheet.');
    } finally {
      setBusy(false);
    }
  }

  const blocked = (preview?.blocking.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <Card className="w-full max-w-4xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Import a scoring workbook</h2>
              <p className="text-sm text-muted-foreground">
                Every rule arrives as plain text, filed under the step its heading names.
                Nothing imported can run until you turn it into a formula.
              </p>
            </div>
            <Button variant="ghost" size="sm" mode="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── step 1: pick ──────────────────────────────────────────── */}
          <div className="flex items-center gap-3 rounded-md border border-dashed p-4">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              {fileName || 'Choose a .csv or .xlsx workbook'}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                // Let the same file be chosen again after a failed read.
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {fileName ? 'Choose another' : 'Choose file'}
            </Button>
          </div>

          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Expected shape: a heading row naming the step
              (<code>STEP 4 — INTERPRETATION BANDS</code>), then one row per rule with the code in
              column A, its name in column B and the logic in column C.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => void downloadSheetTemplate()}
            >
              <Download className="h-4 w-4" /> Sample workbook
            </Button>
          </div>

          {/* ── step 2: review ────────────────────────────────────────── */}
          {preview && (
            <>
              {preview.blocking.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" /> This sheet cannot be imported yet
                  </div>
                  <ul className="list-disc space-y-1 pl-5">
                    {preview.blocking.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <ul className="list-disc space-y-1 pl-5">
                    {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/*
                The Selection question. Sheet order is the priority order, so
                the list is shown in it — the first rule that produces text is
                the one FIRST() answers with.
              */}
              {preview.groups.length > 0 && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <Info className="h-4 w-4" /> Some of these rules compete for the same placeholder
                  </div>
                  {preview.groups.map((g) => (
                    <p key={`${g.stage}-${g.writesTo}`} className="mt-1">
                      <b>{g.ruleNames.length}</b> rules under {stageLabel(g.stage)} all set{' '}
                      <code>{g.writesTo}</code>: {g.ruleNames.join(', ')}. More than one can match
                      the same respondent — after importing, wrap them in{' '}
                      <code>FIRST(…)</code> to pick a winner, or leave them separate to show every
                      match.
                    </p>
                  ))}
                </div>
              )}

              <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
                {preview.rules.map((r) => (
                  <div
                    key={r.sheetRow}
                    className={cn('p-3 text-sm', r.nameTaken && 'bg-red-50')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        {stageLabel(r.stage)}
                      </span>
                      {r.writesTo && (
                        <span className="text-xs text-muted-foreground">sets {r.writesTo}</span>
                      )}
                      {r.nameTaken && (
                        <span className="text-xs font-medium text-red-700">name already used</span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">row {r.sheetRow}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{r.logicText}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2">
            {preview && !blocked && (
              <span className="mr-auto text-sm text-muted-foreground">
                {preview.rules.length} rules will be created.
              </span>
            )}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={commit} disabled={!preview || blocked || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Import {preview ? `${preview.rules.length} rules` : ''}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
