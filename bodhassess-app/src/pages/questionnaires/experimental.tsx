import { useState, useMemo } from 'react';
import {
  Brain,
  Clock,
  Code2,
  Download,
  FlaskConical,
  Gauge,
  ListChecks,
  Play,
  Search,
  Timer,
  Zap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface ExperimentalParadigm {
  name: string;
  shortName: string;
  category: string;
  description: string;
  trials: number;
  duration: string;
  timingPrecision: string;
  scoringAlgorithm: string;
  trialDataExport: string;
  keyMetrics: string[];
}

const paradigms: ExperimentalParadigm[] = [];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExperimentalInstrumentsPage() {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return paradigms;
    const q = search.toLowerCase();
    return paradigms.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.shortName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>BodhAssess</span>
            <span>/</span>
            <span>Questionnaires</span>
            <span>/</span>
            <span className="text-foreground font-medium">Experimental Paradigms</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            Experimental Paradigms
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            RT-based cognitive and behavioral paradigms powered by jsPsych. Millisecond-precision timing with trial-level data export.
          </p>
        </div>
        <Badge variant="info" appearance="light" size="lg">
          <FlaskConical className="h-3.5 w-3.5" />
          Experimental Vertical
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Paradigms Available', value: '6', icon: FlaskConical, change: 'RT-based tasks' },
          { label: 'Timing Precision', value: '~16ms', icon: Timer, change: 'At 60fps refresh rate' },
          { label: 'Avg Trial Count', value: '115', icon: ListChecks, change: 'Per paradigm' },
          { label: 'Data Points / Session', value: '~690', icon: Gauge, change: 'Trial-level granularity' },
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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search experimental paradigms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-8.5 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} paradigm{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Paradigm Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">No paradigms found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search query.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map((paradigm) => (
            <Card
              key={paradigm.shortName}
              className="hover:shadow-md transition-shadow flex flex-col"
            >
              <CardContent className="p-5 flex flex-col flex-1 gap-4">
                {/* Top badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    Experimental
                  </span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium bg-secondary text-secondary-foreground">
                    {paradigm.category}
                  </span>
                  <Badge variant="info" appearance="light" size="sm" className="ml-auto">
                    <Code2 className="h-3 w-3" />
                    jsPsych Runtime
                  </Badge>
                </div>

                {/* Name & Description */}
                <div>
                  <h3 className="text-sm font-semibold leading-snug">{paradigm.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{paradigm.description}</p>
                </div>

                {/* Key info */}
                <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 shrink-0" />
                    <span>{paradigm.trials} trials</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{paradigm.duration}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                    <span className="font-medium text-foreground">{paradigm.timingPrecision}</span>
                  </div>
                </div>

                {/* RT Scoring Algorithm */}
                <div className="rounded-md bg-muted/50 border border-border px-3 py-2.5 space-y-2">
                  <p className="text-[0.6875rem] font-medium text-muted-foreground flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    RT-Based Scoring Algorithm
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">{paradigm.scoringAlgorithm}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {paradigm.keyMetrics.map((metric) => (
                      <span
                        key={metric}
                        className="inline-flex items-center rounded bg-background border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {metric}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Trial-level data export */}
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Download className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-foreground">Trial-level data export: </span>
                    {paradigm.trialDataExport}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-auto pt-1 flex gap-2">
                  <Button variant="primary" size="sm" className="flex-1">
                    <Play className="h-3.5 w-3.5" />
                    Launch Paradigm
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Sample Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
