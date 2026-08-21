import { useMemo } from 'react';
import type {
  DsDatasetColumn,
  DsDatasetRow,
  DsDerivedColumn,
} from '@/pages/data-studio/dataStudioApis';
import { evaluateFormula } from '@/pages/data-studio/lib/formula';

export type AugmentedResult = {
  columns: DsDatasetColumn[];
  rows: DsDatasetRow[];
};

/**
 * Merges a sheet's computed columns into the grid — but only the ones the
 * server has not already answered.
 *
 * `getSheetData` evaluates EVERY computed column server-side, over the whole
 * population, and declares each one in `columns`. Those values are
 * authoritative and are left exactly as they arrived: recomputing them here
 * would be the one way the browser and the server could ever disagree about
 * what a cell says, and a client that only holds the loaded rows cannot get a
 * z-score right in the first place.
 *
 * What is left for this hook is the gap between adding a column and the
 * refetch landing. A CLIENT column — row-local arithmetic — is evaluated in
 * the browser so the new column appears instantly. A SERVER column cannot be,
 * so it shows a placeholder for the moment until the refetch replaces it.
 *
 * The base rows are never mutated; every row is shallow-copied first.
 */
export const SERVER_PENDING = '— computing…';

export function useDerivedColumns(
  baseColumns: DsDatasetColumn[],
  baseRows: DsDatasetRow[],
  derived: DsDerivedColumn[],
): AugmentedResult {
  return useMemo(() => {
    if (!derived.length) return { columns: baseColumns, rows: baseRows };

    // Same order the server evaluates in, so a column that references an
    // earlier one sees it — the optimistic pass has to agree with the real one.
    const ordered = [...derived].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.colKey.localeCompare(b.colKey),
    );

    const serverProvided = new Set(
      baseColumns.filter((c) => ordered.some((d) => d.colKey === c.key)).map((c) => c.key),
    );

    // Nothing to fill in: the common case, once a refetch has landed.
    if (ordered.every((col) => serverProvided.has(col.colKey))) {
      return { columns: baseColumns, rows: baseRows };
    }

    const rows: DsDatasetRow[] = baseRows.map((r) => ({ ...r }));

    for (const col of ordered) {
      if (serverProvided.has(col.colKey)) continue; // authoritative already
      if (col.evalTarget === 'SERVER') {
        for (const row of rows) row[col.colKey] = SERVER_PENDING;
        continue;
      }
      for (const row of rows) {
        row[col.colKey] = evaluateFormula(col.expr, (key) => row[key]);
      }
    }

    const derivedCols: DsDatasetColumn[] = ordered
      .filter((col) => !serverProvided.has(col.colKey))
      .map((col) => ({
        key: col.colKey,
        label: col.label,
        type: col.resultType === 'number' ? 'number' : 'string',
        group: 'derived',
      }));

    return { columns: [...baseColumns, ...derivedCols], rows };
  }, [baseColumns, baseRows, derived]);
}
