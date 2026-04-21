'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getAnalyticsOverview,
  getSessionsByVertical,
  getSessionsTimeseries,
  type AnalyticsOverview,
  type SessionsByVerticalRow,
  type SessionsTimeseriesRow,
} from '@/lib/api/analytics';

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function formatMinutes(v: number): string {
  if (!v || !isFinite(v)) return '—';
  if (v < 1) return `${Math.round(v * 60)}s`;
  if (v >= 60) {
    const h = Math.floor(v / 60);
    const m = Math.round(v % 60);
    return `${h}h ${m}m`;
  }
  return `${v.toFixed(1)} min`;
}

function formatNumber(v: number): string {
  return new Intl.NumberFormat('en-IN').format(v);
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [byVertical, setByVertical] = useState<SessionsByVerticalRow[]>([]);
  const [timeseries, setTimeseries] = useState<SessionsTimeseriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [ov, bv, ts] = await Promise.all([
          getAnalyticsOverview(),
          getSessionsByVertical(),
          getSessionsTimeseries(30),
        ]);
        if (cancelled) return;
        setOverview(ov);
        setByVertical(bv);
        setTimeseries(ts);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const topStats = [
    {
      label: 'Total Sessions',
      value: overview ? formatNumber(overview.total_sessions) : '—',
      icon: Activity,
      hint: overview ? `${formatNumber(overview.completed_sessions)} completed` : '',
    },
    {
      label: 'Completion Rate',
      value: overview ? formatPercent(overview.completion_rate) : '—',
      icon: CheckCircle2,
      hint: overview
        ? `${formatNumber(overview.completed_sessions)} / ${formatNumber(overview.total_sessions)}`
        : '',
    },
    {
      label: 'In Progress',
      value: overview ? formatNumber(overview.in_progress) : '—',
      icon: TrendingUp,
      hint: 'Active sessions',
    },
    {
      label: 'Risk-Flagged Responses',
      value: overview ? formatNumber(overview.risk_flagged_responses) : '—',
      icon: AlertTriangle,
      hint: 'Requires attention',
    },
  ];

  const secondaryStats = [
    {
      label: 'Total Respondents',
      value: overview ? formatNumber(overview.total_respondents) : '—',
      icon: Users,
    },
    {
      label: 'Total Reports',
      value: overview ? formatNumber(overview.total_reports) : '—',
      icon: FileText,
    },
    {
      label: 'Total Instruments',
      value: overview ? formatNumber(overview.total_instruments) : '—',
      icon: ClipboardList,
    },
    {
      label: 'Avg Completion Time',
      value: overview ? formatMinutes(overview.avg_completion_minutes) : '—',
      icon: Clock,
    },
  ];

  const tsMax = timeseries.reduce((m, d) => (d.total > m ? d.total : m), 0);

  const verticalMax = byVertical.reduce((m, v) => (v.total > m ? v.total : m), 0);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span className="text-foreground font-medium">Analytics</span>
        </div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <Badge variant="info" appearance="light" size="sm">
            <BarChart3 className="h-3 w-3" />
            Platform-wide
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Platform overview: session counts, completion rates, risk flags, and recent activity.
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3 text-destructive">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Failed to load analytics</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {topStats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  {loading ? (
                    <Skeleton className="h-8 w-20 mt-2" />
                  ) : (
                    <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  )}
                  {stat.hint && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{stat.hint}</p>
                  )}
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sessions by Vertical + Last 30 Days */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sessions by Vertical */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sessions by Vertical</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : byVertical.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            ) : (
              <div className="space-y-4">
                {byVertical.map((row) => {
                  const totalPct = verticalMax > 0 ? (row.total / verticalMax) * 100 : 0;
                  const completionPct = row.total > 0 ? (row.completed / row.total) * 100 : 0;
                  return (
                    <div key={row.vertical} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">{row.vertical}</span>
                        <span className="text-muted-foreground">
                          <span className="text-foreground font-medium">{formatNumber(row.total)}</span>{' '}
                          total · {formatNumber(row.completed)} completed ({completionPct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-primary/30"
                          style={{ width: `${totalPct}%` }}
                        />
                        <div
                          className="absolute left-0 top-0 h-full bg-primary"
                          style={{
                            width: `${verticalMax > 0 ? (row.completed / verticalMax) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last 30 Days Sparkline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : timeseries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No session activity in the last 30 days.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex h-32 items-end gap-1">
                  {timeseries.map((d) => {
                    const heightPct = tsMax > 0 ? (d.total / tsMax) * 100 : 0;
                    return (
                      <div
                        key={d.day}
                        className="flex-1 flex flex-col justify-end min-w-0"
                        title={`${d.day}: ${d.total} total, ${d.completed} completed`}
                      >
                        <div
                          className="w-full bg-primary rounded-sm"
                          style={{ height: `${Math.max(heightPct, d.total > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{timeseries[0]?.day}</span>
                  <span>
                    Peak:{' '}
                    <span className="text-foreground font-medium">{formatNumber(tsMax)}</span> sessions/day
                  </span>
                  <span>{timeseries[timeseries.length - 1]?.day}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Additional Metrics</CardTitle>
        </CardHeader>
<<<<<<< HEAD
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {secondaryStats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <stat.icon className="h-4.5 w-4.5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  {loading ? (
                    <Skeleton className="h-6 w-16 mt-1" />
                  ) : (
                    <p className="text-lg font-semibold">{stat.value}</p>
                  )}
                </div>
              </div>
            ))}
=======
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Percentile</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {mockResults.map((r) => (
                  <tr key={r.name} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3">{r.instrument}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.score}</td>
                    <td className="px-5 py-3">{r.percentile}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
>>>>>>> 8390f94fe2e576279e937e9972afbf6bff638992
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
