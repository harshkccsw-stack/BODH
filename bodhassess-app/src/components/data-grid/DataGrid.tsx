'use client';

// Reusable, spreadsheet-like grid built on Glide Data Grid. It is purely
// presentational + interaction (sort, resize, range-select, copy) and is
// driven entirely by the backend's self-describing column metadata, so any
// dataset view (sessions, respondents, answers) renders without changes.
// See docs/data-grid-spec.md.

import { useCallback, useMemo, useState } from 'react';
import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type Item,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/**
 * The minimum a column has to declare for this grid to render it.
 *
 * Deliberately declared here rather than imported from an api file. Two
 * different backends feed this grid — the datasets view and Data Studio —
 * and each has its own column type with its own `group` values; typing the
 * grid against one of them made the other's columns a compile error for no
 * reason the grid cares about. It reads `key`, `label`, `type` and
 * `editable`, so those are what it asks for.
 */
export interface GridColumnMeta {
  key: string;
  label: string;
  type: string;
  editable?: string;
}

/**
 * A row is a flat map keyed by column key. `rowId` may be a string or a
 * number — it is only ever passed back out through `onCellEdited`, never
 * compared — and `_updatedAt` is the optimistic-concurrency stamp the
 * editable views carry and Data Studio does not.
 */
export type GridRow = Record<string, unknown> & { rowId: string | number };

export interface DataGridProps {
  columns: GridColumnMeta[];
  rows: GridRow[];
  height?: number;
  // Called when an editable cell is committed. The page owns persistence
  // (PATCH + optimistic update + conflict handling); the grid just reports.
  onCellEdited?: (
    rowId: string,
    columnKey: string,
    newValue: string,
    rowUpdatedAt?: string | null,
  ) => void;
}

function isEditable(col: GridColumnMeta): boolean {
  return col.editable === 'field';
}

function defaultWidth(col: GridColumnMeta): number {
  if (col.type === 'datetime') return 170;
  if (col.type === 'number') return 120;
  if (col.key === 'respondentEmail') return 220;
  return 160;
}

function formatValue(col: GridColumnMeta, raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (col.type === 'datetime') {
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime())
      ? String(raw)
      : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  return String(raw);
}

function roundish(n: number): number {
  return Math.round(n * 100) / 100;
}

export function DataGrid({ columns, rows, height = 600, onCellEdited }: DataGridProps) {
  const [sort, setSort] = useState<SortState>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const { key, dir } = sort;
    const mult = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
      return String(av).localeCompare(String(bv)) * mult;
    });
  }, [rows, sort]);

  const gridColumns: GridColumn[] = useMemo(
    () =>
      columns.map((c) => {
        const arrow = sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
        return { title: c.label + arrow, id: c.key, width: colWidths[c.key] ?? defaultWidth(c) };
      }),
    [columns, colWidths, sort],
  );

  const getCellContent = useCallback(
    ([colIdx, rowIdx]: Item): GridCell => {
      const col = columns[colIdx];
      const row = sortedRows[rowIdx];
      const raw = row?.[col.key];

      if (col.type === 'number') {
        const num = typeof raw === 'number' ? raw : raw == null || raw === '' ? NaN : Number(raw);
        const ok = Number.isFinite(num);
        return {
          kind: GridCellKind.Number,
          data: ok ? num : undefined,
          displayData: ok ? String(roundish(num)) : '',
          allowOverlay: false,
          contentAlign: 'right',
        };
      }

      const text = formatValue(col, raw);
      const editable = isEditable(col);
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: editable,
        readonly: !editable,
      };
    },
    [columns, sortedRows],
  );

  const handleCellEdited = useCallback(
    ([colIdx, rowIdx]: Item, newCell: EditableGridCell) => {
      const col = columns[colIdx];
      const row = sortedRows[rowIdx];
      if (!col || !row || !isEditable(col)) return;
      if (newCell.kind !== GridCellKind.Text) return;
      const stamp = typeof row._updatedAt === 'string' ? row._updatedAt : null;
      onCellEdited?.(String(row.rowId), col.key, newCell.data, stamp);
    },
    [columns, sortedRows, onCellEdited],
  );

  const onHeaderClicked = useCallback(
    (colIdx: number) => {
      const key = columns[colIdx]?.key;
      if (!key) return;
      setSort((s) =>
        s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
      );
    },
    [columns],
  );

  const onColumnResize = useCallback((col: GridColumn, newSize: number) => {
    const id = col.id;
    if (id) setColWidths((w) => ({ ...w, [id]: newSize }));
  }, []);

  if (columns.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No columns to display.
      </div>
    );
  }

  return (
    <div style={{ height }} className="overflow-hidden rounded-lg border border-border">
      <DataEditor
        columns={gridColumns}
        rows={sortedRows.length}
        getCellContent={getCellContent}
        onCellEdited={onCellEdited ? handleCellEdited : undefined}
        onHeaderClicked={onHeaderClicked}
        onColumnResize={onColumnResize}
        getCellsForSelection
        rowMarkers="number"
        smoothScrollX
        smoothScrollY
        width="100%"
        height={height}
      />
    </div>
  );
}

export default DataGrid;
