import { useRef, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Info, Loader2, Upload, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RULE_STAGES,
  downloadSheetTemplate,
  reportRulesApi,
  type SheetPreview,
} from '@/pages/Reports/reportRulesApi';
import { readWorkbook, type WorkbookRead } from '@/pages/Reports/workbookSheets';
import { itemBindingsApi, type BindingPreview } from '@/pages/Reports/itemBindingsApi';
import { ReportItemBindingStep } from './report-item-binding-step';

/**
 * Import a psychometrician's scoring workbook.
 *
 * Pick a file, then review what it would create before anything is written.
 * The review step is not politeness — rule names are unique across the whole
 * installation, so a clash is far cheaper to see here than to hit partway
 * through writing twenty-two rows.
 *
 * A three-tab workbook reviews TWO things, because it contains two. Its
 * Items_Master tab is not rules: it is the dictionary the rules are written in,
 * saying that `I1` is a question in this bank and `Internal Drive` is a
 * measured quality. Without it a rule reading `IF V3 <= 3` names something no
 * part of this product has ever heard of. Bindings are written first and rules
 * second, so a rule never lands referring to a code that was not stored.
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
  const [read, setRead] = useState<WorkbookRead | null>(null);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [bindings, setBindings] = useState<BindingPreview | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
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
      const workbook = await readWorkbook(file);
      const result = await reportRulesApi.importPreview(
        workbook.csv, assessmentId, organizationId);
      setCsv(workbook.csv);
      setRead(workbook);
      setFileName(file.name);
      setPreview(result);
      setOverrides({});
      // Bindings need an assessment to belong to — an item code says what `I1`
      // means in ONE instrument, so there is no global version of it. A rule
      // import without an assessment simply skips this half.
      setBindings(
        workbook.itemsCsv && assessmentId != null
          ? await itemBindingsApi.preview(workbook.itemsCsv, assessmentId)
          : null,
      );
    } catch (e: any) {
      setPreview(null);
      setRead(null);
      setBindings(null);
      setError(e?.response?.data?.message || e?.message || 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  /** Re-match with the reviewer's choice folded in. */
  async function override(itemCode: string, questionId: number | null) {
    if (!read?.itemsCsv || assessmentId == null) return;
    const next = { ...overrides };
    if (questionId == null) {
      delete next[itemCode];
    } else {
      next[itemCode] = questionId;
    }
    setOverrides(next);
    setBusy(true);
    setError('');
    try {
      setBindings(await itemBindingsApi.preview(read.itemsCsv, assessmentId, next));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not re-check the item list.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setError('');
    setBusy(true);
    try {
      // Bindings first. They are the dictionary, and a rule stored before its
      // item codes exist is a rule that cannot be translated. Both halves are
      // all-or-nothing on their own; if the rules half fails, the bindings
      // stand, which is harmless — they are read at authoring time and mean
      // nothing until a rule names them.
      if (read?.itemsCsv && assessmentId != null) {
        await itemBindingsApi.importSheet(read.itemsCsv, assessmentId, overrides);
      }
      const created = await reportRulesApi.importSheet(csv, assessmentId, organizationId);
      onImported(created.length);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not import that sheet.');
    } finally {
      setBusy(false);
    }
  }

  const blocked =
    (preview?.blocking.length ?? 0) > 0 || (bindings?.blocking.length ?? 0) > 0;

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

          {/*
            Which tab was read, stated rather than assumed. The importer used to
            take the first sheet, which in a three-tab workbook is the item list
            — and the rules it produced from it looked entirely normal. Naming
            the tab is what makes that class of mistake visible at a glance.
          */}
          {read && read.sheetName && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div>
                Read the <span className="font-medium text-foreground">{read.sheetName}</span> tab.
                {read.ignored.length > 0 && <> Skipped {read.ignored.join(', ')}.</>}
              </div>
              {read.itemsSheetName && !bindings && (
                <div className="mt-1 flex items-start gap-1.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    This workbook has an item list ({read.itemsSheetName}), but item codes are
                    bound per assessment and this import is not tied to one. Rules naming a code
                    — such as <code>V3</code> — will import as text and cannot become a formula
                    until the items are bound.
                  </span>
                </div>
              )}
            </div>
          )}

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

          {/* ── step 2: the item dictionary ───────────────────────────── */}
          {bindings && (
            <>
              {bindings.blocking.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" /> The item list cannot be imported yet
                  </div>
                  <ul className="list-disc space-y-1 pl-5">
                    {bindings.blocking.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}
              <ReportItemBindingStep
                preview={bindings}
                overrides={overrides}
                onOverride={(code, questionId) => void override(code, questionId)}
                busy={busy}
                itemsSheetName={read?.itemsSheetName ?? 'item'}
              />
            </>
          )}

          {/* ── step 3: review the rules ──────────────────────────────── */}
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
