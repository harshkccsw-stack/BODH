import { useMemo } from 'react';
import type { DatasetColumn, DatasetRow, DerivedColumn } from '@/lib/api';
import { evaluateFormula } from '@/lib/data-studio/formula';

// Sentinel value placed in SERVER-derived cells until Phase 2 computes them.
export const SERVER_PENDING = '— (server)';

export type AugmentedResult = {
  columns: DatasetColumn[];
  rows: DatasetRow[];
};

/**
 * Merge a sheet's derived columns into the live dataset. CLIENT columns are
 * evaluated in-browser per row (in sortOrder, so a column may reference an
 * earlier derived column); SERVER columns are appended as placeholders pending
 * backend evaluation. The base dataset is never mutated.
 */
export function useDerivedColumns(
  baseColumns: DatasetColumn[],
  baseRows: DatasetRow[],
  derived: DerivedColumn[],
): AugmentedResult {
  return useMemo(() => {
    if (!derived.length) return { columns: baseColumns, rows: baseRows };

    const ordered = [...derived].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.colKey.localeCompare(b.colKey),
    );

    // Work on shallow row copies so computed values don't leak into the source.
    const rows: DatasetRow[] = baseRows.map((r) => ({ ...r }));

    for (const col of ordered) {
      if (col.evalTarget === 'SERVER') {
        for (const row of rows) row[col.colKey] = SERVER_PENDING;
        continue;
      }
      for (const row of rows) {
        row[col.colKey] = evaluateFormula(col.expr, (key) => row[key]);
      }
    }

    const derivedCols: DatasetColumn[] = ordered.map((col) => ({
      key: col.colKey,
      label: col.label,
      // SERVER columns hold a placeholder until Phase 2 computes them, so render
      // them as text; CLIENT numeric columns use the number cell.
      type: col.evalTarget === 'CLIENT' && col.resultType === 'number' ? 'number' : 'string',
      group: 'scores',
      editable: 'none',
    }));

    return { columns: [...baseColumns, ...derivedCols], rows };
  }, [baseColumns, baseRows, derived]);
}
