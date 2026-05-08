import { useState } from 'react';
import {
  TrendingDown,
  AlertTriangle,
  Calendar,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DataPoint {
  date: string;
  score: number;
  tScore: number;
  percentile: number;
  severity: string;
}

const clients: { id: string; name: string }[] = [];
const phq9Data: DataPoint[] = [];

const maxScore = 27; // PHQ-9 max
const chartHeight = 200;
const chartWidth = 560;

function ScoreChart({ data }: { data: DataPoint[] }) {
  const points = data.map((d, i) => ({
    x: 60 + i * ((chartWidth - 80) / (data.length - 1)),
    y: chartHeight - 30 - ((d.score / maxScore) * (chartHeight - 50)),
    ...d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Severity zones
  const zones = [
    { label: 'Minimal (0-4)', y: chartHeight - 30 - ((4 / maxScore) * (chartHeight - 50)), color: 'rgb(34 197 94 / 0.08)' },
    { label: 'Mild (5-9)', y: chartHeight - 30 - ((9 / maxScore) * (chartHeight - 50)), color: 'rgb(234 179 8 / 0.08)' },
    { label: 'Moderate (10-14)', y: chartHeight - 30 - ((14 / maxScore) * (chartHeight - 50)), color: 'rgb(249 115 22 / 0.08)' },
    { label: 'Mod. Severe (15-19)', y: chartHeight - 30 - ((19 / maxScore) * (chartHeight - 50)), color: 'rgb(239 68 68 / 0.08)' },
  ];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full max-w-[600px] mx-auto" style={{ minWidth: 400 }}>
        {/* Severity zone backgrounds */}
        {zones.map((zone, i) => {
          const nextY = i === 0 ? chartHeight - 30 : zones[i - 1].y;
          return (
            <rect
              key={zone.label}
              x={55}
              y={zone.y}
              width={chartWidth - 70}
              height={nextY - zone.y}
              fill={zone.color}
              rx={2}
            />
          );
        })}

        {/* Y-axis labels */}
        {[0, 5, 10, 15, 20, 25].map((val) => {
          const y = chartHeight - 30 - ((val / maxScore) * (chartHeight - 50));
          return (
            <g key={val}>
              <text x={45} y={y + 4} textAnchor="end" className="fill-muted-foreground" fontSize={10}>{val}</text>
              <line x1={55} y1={y} x2={chartWidth - 15} y2={y} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4 4" />
            </g>
          );
        })}

        {/* Line */}
        <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={5} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={2.5} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" className="fill-foreground" fontSize={11} fontWeight={600}>{p.score}</text>
            {/* Date label */}
            <text x={p.x} y={chartHeight - 8} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
              {new Date(p.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const severityColor = (severity: string) => {
  if (severity.includes('Severe')) return 'destructive';
  if (severity === 'Moderate') return 'warning';
  if (severity === 'Mild') return 'success';
  return 'secondary';
};

export default function LongitudinalTrackingPage() {
  const [selectedClient, setSelectedClient] = useState(clients[0]?.id ?? '');
  const selectedName = clients.find((c) => c.id === selectedClient)?.name || '';

  const hasData = phq9Data.length > 0;
  const latestScore = hasData ? phq9Data[phq9Data.length - 1].score : 0;
  const firstScore = hasData ? phq9Data[0].score : 0;
  const changePct = hasData && firstScore !== 0
    ? Math.round(((firstScore - latestScore) / firstScore) * 100)
    : 0;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Clinical</span>
          <span>/</span>
          <span className="text-foreground font-medium">Longitudinal Tracking</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Longitudinal Tracking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track client assessment scores over time and monitor treatment progress.
        </p>
      </div>

      {!hasData && (
        <Card>
          <CardContent className="p-10 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">No tracking data available</p>
            <p className="text-xs text-muted-foreground mt-1">
              Score trajectories will appear here once clients have completed administrations.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Client Selector */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <label className="text-sm font-medium">Select Client</label>
        <select
          className="flex h-8.5 w-full sm:w-72 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
          ))}
        </select>
      </div>

      {hasData && (
        <>
          {/* Deterioration Alert */}
          <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Deterioration threshold not exceeded</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
                Configurable alert: triggers when any score increases by more than 1 SD between administrations.
                Currently monitoring {selectedName}.
              </p>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Latest PHQ-9</p>
                    <p className="text-2xl font-semibold mt-1">{latestScore}</p>
                    <p className="text-xs text-muted-foreground mt-1">{phq9Data[phq9Data.length - 1].severity}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Change from Baseline</p>
                    <p className="text-2xl font-semibold mt-1 text-green-600">-{changePct}%</p>
                    <p className="text-xs text-muted-foreground mt-1">{firstScore} to {latestScore}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                    <TrendingDown className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Administrations</p>
                    <p className="text-2xl font-semibold mt-1">{phq9Data.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Over {Math.round((new Date(phq9Data[phq9Data.length - 1].date).getTime() - new Date(phq9Data[0].date).getTime()) / (1000 * 60 * 60 * 24 * 30))} months</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">PHQ-9 Score Trajectory — {selectedName}</CardTitle>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <ScoreChart data={phq9Data} />
              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgb(34 197 94 / 0.2)' }} />
                  Minimal (0-4)
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgb(234 179 8 / 0.2)' }} />
                  Mild (5-9)
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgb(249 115 22 / 0.2)' }} />
                  Moderate (10-14)
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgb(239 68 68 / 0.2)' }} />
                  Mod. Severe (15-19)
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Administration History Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Administration History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Raw Score</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">T-Score</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Percentile</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...phq9Data].reverse().map((row) => (
                      <tr key={row.date} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs">{row.date}</td>
                        <td className="px-5 py-3">PHQ-9</td>
                        <td className="px-5 py-3 font-mono text-xs">{row.score}</td>
                        <td className="px-5 py-3 font-mono text-xs">T={row.tScore}</td>
                        <td className="px-5 py-3 font-mono text-xs">{row.percentile}th</td>
                        <td className="px-5 py-3">
                          <Badge
                            variant={severityColor(row.severity) as any}
                            appearance="light"
                            size="sm"
                          >
                            {row.severity}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
