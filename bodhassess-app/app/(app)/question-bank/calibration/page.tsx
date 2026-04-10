'use client';

import { useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  Play,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types & Data
// ---------------------------------------------------------------------------

interface CalibrationJob {
  id: string;
  instrument: string;
  itemsCount: number;
  sampleN: number;
  status: 'Running' | 'Completed' | 'Failed';
  startTime: string;
  duration: string;
  rmsea: number | null;
}

interface ItemParam {
  itemId: string;
  label: string;
  a: number;
  b: number;
  c: number;
  iccDescription: string;
}

const calibrationJobs: CalibrationJob[] = [
  { id: 'CAL-0051', instrument: 'PHQ-9', itemsCount: 9, sampleN: 16450, status: 'Completed', startTime: '2026-04-08 14:32', duration: '4m 12s', rmsea: 0.028 },
  { id: 'CAL-0050', instrument: 'GAD-7', itemsCount: 7, sampleN: 12800, status: 'Completed', startTime: '2026-04-08 11:05', duration: '3m 47s', rmsea: 0.031 },
  { id: 'CAL-0049', instrument: 'DASS-21', itemsCount: 21, sampleN: 9200, status: 'Running', startTime: '2026-04-09 09:15', duration: '—', rmsea: null },
  { id: 'CAL-0048', instrument: 'Big Five (IPIP-NEO-120)', itemsCount: 120, sampleN: 8400, status: 'Completed', startTime: '2026-04-07 22:00', duration: '18m 34s', rmsea: 0.042 },
  { id: 'CAL-0047', instrument: 'PCL-5', itemsCount: 20, sampleN: 3100, status: 'Failed', startTime: '2026-04-07 16:45', duration: '2m 08s', rmsea: null },
];

const itemParams: ItemParam[] = [
  { itemId: 'PHQ9-01', label: 'Little interest or pleasure', a: 1.62, b: -0.81, c: 0.00, iccDescription: 'Steep curve, easy item — discriminates well at lower theta' },
  { itemId: 'PHQ9-02', label: 'Feeling down, depressed', a: 1.89, b: -0.45, c: 0.00, iccDescription: 'High discrimination, moderate difficulty' },
  { itemId: 'PHQ9-03', label: 'Trouble falling asleep', a: 1.21, b: 0.12, c: 0.00, iccDescription: 'Moderate discrimination, average difficulty' },
  { itemId: 'PHQ9-04', label: 'Feeling tired or little energy', a: 1.45, b: -0.33, c: 0.00, iccDescription: 'Good discrimination, slightly easy' },
  { itemId: 'PHQ9-05', label: 'Poor appetite or overeating', a: 1.08, b: 0.44, c: 0.00, iccDescription: 'Moderate slope, slightly harder item' },
  { itemId: 'PHQ9-06', label: 'Feeling bad about yourself', a: 1.73, b: 0.22, c: 0.00, iccDescription: 'High discrimination near average difficulty' },
  { itemId: 'PHQ9-07', label: 'Trouble concentrating', a: 1.34, b: 0.58, c: 0.00, iccDescription: 'Good discrimination, moderately difficult' },
  { itemId: 'PHQ9-08', label: 'Moving or speaking slowly', a: 0.92, b: 1.15, c: 0.00, iccDescription: 'Lower discrimination, harder item — less informative at low theta' },
  { itemId: 'PHQ9-09', label: 'Thoughts of self-harm', a: 1.45, b: 1.42, c: 0.00, iccDescription: 'Good discrimination at high theta — critical severity marker' },
];

const instruments = [
  'PHQ-9', 'GAD-7', 'DASS-21', 'Big Five (IPIP-NEO-120)', 'PCL-5',
  'AUDIT', 'Beck BDI-II', 'SCAS', 'HEXACO',
];

const statusStyles: Record<CalibrationJob['status'], { variant: 'success' | 'primary' | 'destructive'; icon: typeof CheckCircle2 }> = {
  Completed: { variant: 'success', icon: CheckCircle2 },
  Running:   { variant: 'primary', icon: Loader2 },
  Failed:    { variant: 'destructive', icon: XCircle },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CalibrationPage() {
  const [selectedInstrument, setSelectedInstrument] = useState('PHQ-9');

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Question Bank</span>
          <span>/</span>
          <span className="text-foreground font-medium">IRT Calibration</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">IRT Calibration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Run and monitor Item Response Theory calibration jobs across instruments.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Total Jobs Run', value: '51', icon: Activity, change: '+3 this week' },
          { label: 'Instruments Calibrated', value: '14', icon: FlaskConical, change: '9 fully validated' },
          { label: 'Avg RMSEA', value: '0.034', icon: TrendingUp, change: 'Good model fit' },
          { label: 'Last Calibration', value: '2h ago', icon: Clock, change: 'DASS-21 running' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 3PL Model Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            3-Parameter Logistic Model (3PL)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 border border-border p-5">
            <p className="text-xs font-medium text-muted-foreground mb-2">IRT Model Formula</p>
            <p className="font-mono text-sm md:text-base leading-relaxed">
              P(&theta;) = c + (1 &minus; c) &middot; [1 / (1 + e<sup>&minus;1.7a(&theta; &minus; b)</sup>)]
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-semibold">a &mdash; Discrimination</p>
              <p className="text-xs text-muted-foreground">
                Slope of the ICC at the inflection point. Higher values indicate better differentiation between ability levels.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">b &mdash; Difficulty</p>
              <p className="text-xs text-muted-foreground">
                Location on the theta scale where P(&theta;) = (1+c)/2. Positive = harder, negative = easier.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold">c &mdash; Guessing (Pseudo-chance)</p>
              <p className="text-xs text-muted-foreground">
                Lower asymptote of the ICC. For Likert scales this is typically 0; for MCQs it represents chance performance.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run Calibration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run New Calibration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="space-y-1.5 flex-1 max-w-xs">
              <label className="text-xs font-medium text-muted-foreground">Select Instrument</label>
              <select
                value={selectedInstrument}
                onChange={(e) => setSelectedInstrument(e.target.value)}
                className="w-full h-8.5 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              >
                {instruments.map((inst) => (
                  <option key={inst} value={inst}>{inst}</option>
                ))}
              </select>
            </div>
            <Button variant="primary" size="md">
              <Play className="h-4 w-4" />
              Run Calibration
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calibration Jobs Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Calibration Jobs
              <Badge variant="secondary" size="sm">{calibrationJobs.length}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Job ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Items</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Sample N</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Start Time</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Duration</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">RMSEA</th>
                </tr>
              </thead>
              <tbody>
                {calibrationJobs.map((job) => {
                  const style = statusStyles[job.status];
                  const StatusIcon = style.icon;
                  return (
                    <tr key={job.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs">{job.id}</td>
                      <td className="px-5 py-3 font-medium">{job.instrument}</td>
                      <td className="px-5 py-3 text-center">{job.itemsCount}</td>
                      <td className="px-5 py-3 font-mono text-xs">{job.sampleN.toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <Badge variant={style.variant} appearance="light" size="sm">
                          <StatusIcon className={cn('h-3 w-3', job.status === 'Running' && 'animate-spin')} />
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{job.startTime}</td>
                      <td className="px-5 py-3 text-xs">{job.duration}</td>
                      <td className="px-5 py-3">
                        {job.rmsea !== null ? (
                          <span className={cn(
                            'font-mono text-xs',
                            job.rmsea <= 0.05 ? 'text-green-600 dark:text-green-400' :
                            job.rmsea <= 0.08 ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-red-600 dark:text-red-400'
                          )}>
                            {job.rmsea.toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Item Parameter Visualization */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Item Parameters &mdash; PHQ-9 (Last Calibration)
            </CardTitle>
            <Badge variant="success" appearance="light" size="sm">RMSEA = 0.028</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Item</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Label</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">a (Discrim.)</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">b (Difficulty)</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">c (Guessing)</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">ICC Description</th>
                </tr>
              </thead>
              <tbody>
                {itemParams.map((item) => (
                  <tr key={item.itemId} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs font-semibold">{item.itemId}</td>
                    <td className="px-5 py-3 text-xs">{item.label}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'font-mono text-xs font-semibold',
                        item.a >= 1.5 ? 'text-green-600 dark:text-green-400' :
                        item.a >= 1.0 ? 'text-blue-600 dark:text-blue-400' :
                        'text-yellow-600 dark:text-yellow-400'
                      )}>
                        {item.a.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'font-mono text-xs',
                        item.b > 1.0 ? 'text-red-500' : item.b < -0.5 ? 'text-blue-500' : ''
                      )}>
                        {item.b >= 0 ? '+' : ''}{item.b.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{item.c.toFixed(2)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground max-w-xs">{item.iccDescription}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
