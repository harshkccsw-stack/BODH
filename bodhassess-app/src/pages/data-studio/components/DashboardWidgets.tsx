'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import {
  analyticsApi,
  type AnalyticsMeasure,
  type DatasetResponse,
  type Sheet,
  type Widget,
} from '@/lib/api';

// Config shapes stored in widget.config (JSON). Kept loose; the editor writes
// only the fields a given widget type needs.
export type MeasureCfg = { expr: string; agg: AnalyticsMeasure['agg']; label: string };
export type WidgetConfig = {
  title?: string;
  chartType?: 'bar' | 'line' | 'pie';
  dimension?: string;
  dimensions?: string[];
  measure?: MeasureCfg;
  measures?: MeasureCfg[];
};

function filtersOf(sheet?: Sheet): Record<string, unknown> | undefined {
  return sheet?.sourceFilters ?? undefined;
}

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : v == null || v === '' ? null : Number(v);
}

function fmtNum(v: unknown): string {
  const n = num(v);
  if (n == null || Number.isNaN(n)) return '—';
  return Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 1 })
    : String(Math.round(n * 100) / 100);
}

/** Renders the data body of a widget. The card chrome lives in DashboardView. */
export function WidgetBody({ widget, sheet }: { widget: Widget; sheet?: Sheet }) {
  const cfg = widget.config as WidgetConfig;
  const [data, setData] = useState<DatasetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Build the analytics query for this widget from its config.
  const query = useMemo(() => {
    const sourceFilters = filtersOf(sheet);
    if (widget.type === 'KPI') {
      return cfg.measure ? { sourceFilters, measures: [cfg.measure] } : null;
    }
    if (widget.type === 'CHART') {
      return cfg.measure && cfg.dimension
        ? { sourceFilters, dimensions: [cfg.dimension], measures: [cfg.measure] }
        : null;
    }
    // TABLE / PIVOT
    const measures = cfg.measures ?? (cfg.measure ? [cfg.measure] : []);
    return measures.length
      ? { sourceFilters, dimensions: cfg.dimensions ?? [], measures }
      : null;
  }, [widget.type, cfg, sheet]);

  useEffect(() => {
    let alive = true;
    if (!query) { setLoading(false); setData(null); return; }
    setLoading(true); setError('');
    analyticsApi.query(query)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Query failed'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query]);

  if (!query) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">Not configured.</div>;
  }
  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (error) {
    return <div className="flex h-full items-center justify-center p-4 text-center text-sm text-red-600">{error}</div>;
  }
  if (!data) return null;

  if (widget.type === 'KPI') return <KpiBody data={data} cfg={cfg} />;
  if (widget.type === 'CHART') return <ChartBody data={data} cfg={cfg} />;
  return <TableBody data={data} />;
}

function KpiBody({ data, cfg }: { data: DatasetResponse; cfg: WidgetConfig }) {
  const key = cfg.measure?.label ?? data.columns.find((c) => c.group === 'measure')?.key;
  const value = key && data.rows[0] ? data.rows[0][key] : null;
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="text-3xl font-semibold tabular-nums">{fmtNum(value)}</div>
      <div className="mt-1 text-xs text-muted-foreground">{cfg.measure?.label}</div>
    </div>
  );
}

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16'];

function ChartBody({ data, cfg }: { data: DatasetResponse; cfg: WidgetConfig }) {
  const dimKey = cfg.dimension!;
  const measKey = cfg.measure?.label ?? data.columns.find((c) => c.group === 'measure')?.key ?? '';
  const type = cfg.chartType ?? 'bar';
  const chartData = data.rows.map((r) => ({ name: String(r[dimKey] ?? '—'), value: num(r[measKey]) ?? 0 }));

  if (chartData.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === 'pie' ? (
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" outerRadius="80%" label>
            {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      ) : type === 'line' ? (
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Line type="monotone" dataKey="value" name={cfg.measure?.label ?? 'value'} stroke="#6366f1" strokeWidth={2} dot={false} />
        </LineChart>
      ) : (
        <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <Tooltip />
          <Bar dataKey="value" name={cfg.measure?.label ?? 'value'} fill="#6366f1" radius={[3, 3, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

function TableBody({ data }: { data: DatasetResponse }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/60">
          <tr>
            {data.columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-left font-medium text-muted-foreground">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {data.columns.map((c) => (
                <td key={c.key} className="px-3 py-1.5 tabular-nums">
                  {c.group === 'measure' ? fmtNum(r[c.key]) : String(r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {data.rows.length === 0 && (
            <tr><td className="px-3 py-3 text-muted-foreground" colSpan={data.columns.length}>No data.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
