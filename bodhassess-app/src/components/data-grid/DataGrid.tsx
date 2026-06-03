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
import type { DatasetColumn, DatasetRow } from '@/lib/api';

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export interface DataGridProps {
  columns: DatasetColumn[];
  rows: DatasetRow[];
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

function isEditable(col: DatasetColumn): boolean {
  return col.editable === 'field';
}

function defaultWidth(col: DatasetColumn): number {
  if (col.type === 'datetime') return 170;
  if (col.type === 'number') return 120;
  if (col.key === 'respondentEmail') return 220;
  return 160;
}

function formatValue(col: DatasetColumn, raw: unknown): string {
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
      onCellEdited?.(String(row.rowId), col.key, newCell.data, row._updatedAt ?? null);
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
