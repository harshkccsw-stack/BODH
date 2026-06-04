'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, Loader2, Pencil, Plus, RefreshCw, Sigma, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { DataGrid } from '@/src/components/data-grid/DataGrid';
import { useDerivedColumns } from '@/src/components/data-studio/useDerivedColumns';
import {
  dataStudioApi,
  type DatasetResponse,
  type DerivedColumn,
  type Sheet,
  type ValidateExprResult,
} from '@/lib/api';

interface SheetViewProps {
  sheet: Sheet;
  canEdit: boolean;
  onColumnsChanged?: (columns: DerivedColumn[]) => void;
}

export function SheetView({ sheet, canEdit, onColumnsChanged }: SheetViewProps) {
  const [data, setData] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [derived, setDerived] = useState<DerivedColumn[]>(sheet.derivedColumns ?? []);
  // null = closed; { editing: null } = add; { editing: col } = edit in place.
  const [columnDialog, setColumnDialog] = useState<{ editing: DerivedColumn | null } | null>(null);

  // Re-seed local derived columns whenever a different sheet is shown.
  useEffect(() => {
    setDerived(sheet.derivedColumns ?? []);
  }, [sheet.id, sheet.derivedColumns]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Server computes every derived column (CLIENT + SERVER) over the full
      // population and returns the merged rows.
      setData(await dataStudioApi.getSheetData(sheet.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [sheet.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const baseColumns = data?.columns ?? [];
  const baseRows = data?.rows ?? [];
  const { columns, rows } = useDerivedColumns(baseColumns, baseRows, derived);

  const availableKeys = useMemo(
    () => [
      ...baseColumns.map((c) => ({ key: c.key, label: c.label })),
      ...derived.map((c) => ({ key: c.colKey, label: c.label })),
    ],
    [baseColumns, derived],
  );

  const commitColumns = (next: DerivedColumn[]) => {
    setDerived(next);
    onColumnsChanged?.(next);
  };

  const handleSaved = (col: DerivedColumn) => {
    const next = derived.some((c) => c.colKey === col.colKey)
      ? derived.map((c) => (c.colKey === col.colKey ? col : c))
      : [...derived, col];
    commitColumns(next);
    setColumnDialog(null);
    loadData(); // pull server-computed values (esp. SERVER columns)
  };

  const handleDelete = async (colKey: string) => {
    try {
      await dataStudioApi.deleteColumn(sheet.id, colKey);
      commitColumns(derived.filter((c) => c.colKey !== colKey));
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete column');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${rows.length} rows · ${columns.length} columns`}
          </span>
          {derived.map((c) => (
            <span
              key={c.colKey}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              <Sigma className="h-3 w-3 text-primary" />
              {c.label}
              <Badge variant={c.evalTarget === 'SERVER' ? 'warning' : 'info'} size="sm" appearance="light">
                {c.evalTarget === 'SERVER' ? 'server' : 'client'}
              </Badge>
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => setColumnDialog({ editing: c })}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${c.label}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.colKey)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Delete ${c.label}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="primary" size="sm" onClick={() => setColumnDialog({ editing: null })} disabled={loading}>
              <Plus className="h-4 w-4" />
              Add computed column
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading from database…
        </div>
      ) : (
        <DataGrid columns={columns} rows={rows} height={560} />
      )}

      {columnDialog && (
        <ColumnDialog
          sheetId={sheet.id}
          editing={columnDialog.editing}
          // Exclude the column being edited so it can't reference itself.
          availableKeys={availableKeys.filter((k) => k.key !== columnDialog.editing?.colKey)}
          onClose={() => setColumnDialog(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

/* ---------------- add / edit column dialog ---------------- */

interface ColumnDialogProps {
  sheetId: number;
  editing: DerivedColumn | null;
  availableKeys: { key: string; label: string }[];
  onClose: () => void;
  onSaved: (col: DerivedColumn) => void;
}

function ColumnDialog({ sheetId, editing, availableKeys, onClose, onSaved }: ColumnDialogProps) {
  const [label, setLabel] = useState(editing?.label ?? '');
  const [expr, setExpr] = useState(editing?.expr ?? '');
  const [result, setResult] = useState<ValidateExprResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const exprRef = useRef<HTMLTextAreaElement>(null);

  // Live-validate the formula against the sheet's column set (debounced).
  useEffect(() => {
    if (!expr.trim()) {
      setResult(null);
      return;
    }
    setValidating(true);
    const t = setTimeout(async () => {
      try {
        setResult(await dataStudioApi.validateExpr(sheetId, expr));
      } catch {
        setResult(null);
      } finally {
        setValidating(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [expr, sheetId]);

  const insertKey = (key: string) => {
    // Always bracket-quote: column keys can contain '-'/':' (e.g. mqt ids).
    const token = `[${key}]`;
    const el = exprRef.current;
    if (!el) {
      setExpr((e) => `${e}${token}`);
      return;
    }
    const start = el.selectionStart ?? expr.length;
    const end = el.selectionEnd ?? expr.length;
    setExpr(`${expr.slice(0, start)}${token}${expr.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const canSave = !!label.trim() && !!expr.trim() && result?.ok === true && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError('');
    try {
      const body = { label: label.trim(), expr };
      const col = editing
        ? await dataStudioApi.updateColumn(sheetId, editing.colKey, body)
        : await dataStudioApi.addColumn(sheetId, body);
      onSaved(col);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save column');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit computed column' : 'Add computed column'}</DialogTitle>
          <DialogDescription>
            Click a column below to insert it (wrapped in <code>[ ]</code>), then build a
            formula — e.g. <code>([score:anx] + [score:dep]) / 2</code> or{' '}
            <code>ZSCORE([score:anx])</code>. Population functions (ZSCORE, PERCENTILE, …)
            run on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ds-col-label">Column name</Label>
            <Input
              id="ds-col-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Wellbeing index"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ds-col-expr">Formula</Label>
            <Textarea
              id="ds-col-expr"
              ref={exprRef}
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder="(mqt:ANX + mqt:DEP) / 2"
              className="font-mono text-sm"
              rows={3}
            />
          </div>

          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">Insert a column:</p>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {availableKeys.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => insertKey(c.key)}
                  title={c.key}
                  className="rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/70"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-10 rounded-md border border-border px-3 py-2 text-sm">
            {validating ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
              </span>
            ) : result?.ok ? (
              <span className="flex flex-wrap items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" /> Valid
                <Badge variant={result.evalTarget === 'SERVER' ? 'warning' : 'info'} size="sm" appearance="light">
                  {result.evalTarget === 'SERVER' ? 'server' : 'client'}
                </Badge>
                <Badge variant="secondary" size="sm" appearance="light">{result.resultType}</Badge>
              </span>
            ) : result && !result.ok ? (
              <span className="flex items-start gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{result.errors.join(' ')}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Enter a formula to validate.</span>
            )}
          </div>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Save changes' : 'Add column'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SheetView;
