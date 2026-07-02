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
 * Merge a sheet's derived columns into the dataset for display. When rows come
 * from {@code GET /sheets/{id}/data} the backend has already computed every
 * derived column, so we keep those authoritative values. As a fallback (e.g.
 * an optimistic add before the next refetch), CLIENT columns are evaluated
 * in-browser and SERVER columns show a placeholder. The base dataset is never
 * mutated.
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

    // Derived columns the server already computed need no client work.
    const serverProvided = new Set(
      baseColumns.filter((c) => ordered.some((d) => d.colKey === c.key)).map((c) => c.key),
    );

    // Work on shallow row copies so computed values don't leak into the source.
    const rows: DatasetRow[] = baseRows.map((r) => ({ ...r }));

    for (const col of ordered) {
      if (serverProvided.has(col.colKey)) continue; // authoritative value already present
      if (col.evalTarget === 'SERVER') {
        for (const row of rows) row[col.colKey] = SERVER_PENDING;
        continue;
      }
      for (const row of rows) {
        row[col.colKey] = evaluateFormula(col.expr, (key) => row[key]);
      }
    }

    // Only add defs for columns the server didn't already declare.
    const derivedCols: DatasetColumn[] = ordered
      .filter((col) => !serverProvided.has(col.colKey))
      .map((col) => ({
        key: col.colKey,
        label: col.label,
        type: col.resultType === 'number' ? 'number' : 'string',
        group: 'scores',
        editable: 'none',
      }));

    return { columns: [...baseColumns, ...derivedCols], rows };
  }, [baseColumns, baseRows, derived]);
}
