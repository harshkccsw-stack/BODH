import { useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
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

const calibrationJobs: CalibrationJob[] = [];
const itemParams: ItemParam[] = [];

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
