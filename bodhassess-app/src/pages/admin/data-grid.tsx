'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, Table2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataGrid } from '@/src/components/data-grid/DataGrid';
import {
  datasetsApi,
  type DatasetColumn,
  type DatasetResponse,
  type DatasetRow,
} from '@/lib/api';

const GROUP_LABELS: Record<DatasetColumn['group'], string> = {
  core: 'Core',
  scores: 'Scores',
  demographics: 'Demographics',
};

function toCsvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv(columns: DatasetColumn[], rows: DatasetRow[]) {
  const header = columns.map((c) => toCsvCell(c.label)).join(',');
  const body = rows
    .map((r) => columns.map((c) => toCsvCell(r[c.key])).join(','))
    .join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sessions.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataGridPage() {
  const [data, setData] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await datasetsApi.sessions();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dataset');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const columns = data?.columns ?? [];

  const editableColumns = useMemo(
    () => columns.filter((c) => c.editable === 'field').map((c) => c.label),
    [columns],
  );

  const handleCellEdited = async (
    rowId: string,
    columnKey: string,
    newValue: string,
    rowUpdatedAt?: string | null,
  ) => {
    setNotice('');
    // Optimistic: reflect the new value immediately.
    setData((prev) =>
      prev
        ? { ...prev, rows: prev.rows.map((r) => (r.rowId === rowId ? { ...r, [columnKey]: newValue } : r)) }
        : prev,
    );
    try {
      const res = await datasetsApi.patchSessionCells([{ rowId, columnKey, newValue, rowUpdatedAt }]);
      // Replace edited rows with the authoritative server versions (fresh _updatedAt).
      if (res.rows.length) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                rows: prev.rows.map((r) => res.rows.find((u) => u.rowId === r.rowId) ?? r),
              }
            : prev,
        );
      }
      if (res.errors.length) {
        const e = res.errors[0];
        setNotice(
          e.conflict
            ? 'That row changed elsewhere — reloading the latest values.'
            : `Edit rejected: ${e.message}`,
        );
        await refresh();
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Edit failed — reloading.');
      await refresh();
    }
  };

  const filteredRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      columns.some((c) => {
        const v = r[c.key];
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }, [data, columns, search]);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of columns) counts[c.group] = (counts[c.group] ?? 0) + 1;
    return counts;
  }, [columns]);

  return (
    <div className="space-y-7 p-5 lg:p-7.5">
      {/* Breadcrumb & header */}
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Data Grid</span>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Table2 className="h-6 w-6 text-primary" />
          Sessions Data Grid
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Spreadsheet-style view of assessment sessions. Click a column header to sort, drag to
          resize, and select a range to copy. Score and demographic columns are generated
          automatically from the data.
          {editableColumns.length > 0 && (
            <>
              {' '}Double-click an editable cell ({editableColumns.join(', ')}) to change it — edits
              are saved with an audit trail.
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          {notice}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Sessions</CardTitle>
            <span className="text-sm text-muted-foreground">
              {loading ? 'Loading…' : `${filteredRows.length} of ${data?.rowCount ?? 0} rows`}
            </span>
            {Object.entries(groupCounts).map(([group, count]) => (
              <span
                key={group}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {GROUP_LABELS[group as DatasetColumn['group']] ?? group}: {count}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rows…"
                className="h-9 w-48 rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => exportCsv(columns, filteredRows)}
              disabled={filteredRows.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Loading from database…
            </div>
          ) : (
            <DataGrid
              columns={columns}
              rows={filteredRows}
              height={620}
              onCellEdited={handleCellEdited}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
