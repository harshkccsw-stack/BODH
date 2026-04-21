'use client';

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

const paradigms: ExperimentalParadigm[] = [
  {
    name: 'IAT -- Implicit Association Test',
    shortName: 'IAT',
    category: 'Implicit Bias',
    description: 'Measures implicit attitudes by comparing response latencies when pairing target concepts with evaluative attributes. Used widely in social cognition research.',
    trials: 120,
    duration: '7-10 min',
    timingPrecision: '~16ms at 60fps',
    scoringAlgorithm: 'D-score algorithm (Greenwald et al., 2003): Mean difference of compatible vs. incompatible blocks divided by pooled SD. Penalty for errors via built-in 600ms delay.',
    trialDataExport: 'Per-trial: stimulus, category, response key, RT (ms), accuracy, block type, trial number',
    keyMetrics: ['D-score', 'Mean RT', 'Error rate', 'Block effects'],
  },
  {
    name: 'Dot Probe Task',
    shortName: 'DotProbe',
    category: 'Attentional Bias',
    description: 'Assesses attentional bias toward threat-related or emotionally salient stimuli by measuring detection latency for probes replacing neutral vs. emotional cues.',
    trials: 160,
    duration: '10-15 min',
    timingPrecision: '~16ms at 60fps',
    scoringAlgorithm: 'Attentional Bias Score (ABS): Mean RT for congruent trials minus mean RT for incongruent trials. Positive = vigilance; negative = avoidance. Reliability-corrected via split-half.',
    trialDataExport: 'Per-trial: cue type, probe location, congruency, RT (ms), accuracy, SOA condition',
    keyMetrics: ['Bias score', 'Vigilance index', 'Avoidance index', 'Mean RT'],
  },
  {
    name: 'Stroop Colour-Word Task',
    shortName: 'Stroop',
    category: 'Cognitive Inhibition',
    description: 'Classic interference paradigm measuring executive control and inhibition. Participants name the ink colour of colour words, creating congruent/incongruent conflict.',
    trials: 100,
    duration: '5-8 min',
    timingPrecision: '~16ms at 60fps',
    scoringAlgorithm: 'Stroop Interference = Mean RT(incongruent) - Mean RT(congruent). Facilitation = Mean RT(neutral) - Mean RT(congruent). Inverse efficiency score (IES) = RT/accuracy.',
    trialDataExport: 'Per-trial: word, ink colour, condition (C/I/N), RT (ms), accuracy, response key',
    keyMetrics: ['Interference score', 'Facilitation score', 'IES', 'Error rate'],
  },
  {
    name: 'Go/No-Go Task',
    shortName: 'GNG',
    category: 'Response Inhibition',
    description: 'Measures ability to withhold a prepotent motor response. Go trials require a response; No-Go trials require inhibition. Maps to prefrontal inhibitory control.',
    trials: 200,
    duration: '8-12 min',
    timingPrecision: '~16ms at 60fps',
    scoringAlgorithm: 'Commission errors (false alarms on No-Go) index inhibitory failure. d-prime computed from hit rate and false alarm rate. Mean Go RT reflects processing speed.',
    trialDataExport: 'Per-trial: stimulus type, trial type (Go/NoGo), RT (ms), response (hit/miss/FA/CR), ISI',
    keyMetrics: ['d-prime', 'Commission errors', 'Omission errors', 'Mean Go RT'],
  },
  {
    name: 'N-Back Working Memory Task',
    shortName: 'N-Back',
    category: 'Working Memory',
    description: 'Continuous performance task where participants indicate whether the current stimulus matches the one N steps back. Tests working memory updating and maintenance.',
    trials: 80,
    duration: '10-15 min',
    timingPrecision: '~16ms at 60fps',
    scoringAlgorithm: 'Accuracy per N-level (1-back, 2-back, 3-back). d-prime per level. RT for correct responses. Working memory capacity estimated from accuracy slope across levels.',
    trialDataExport: 'Per-trial: stimulus, N-level, match/non-match, RT (ms), response, accuracy, sequence position',
    keyMetrics: ['d-prime (per level)', 'Accuracy slope', 'Mean RT', 'Lure false alarms'],
  },
  {
    name: 'Delay Discounting Task',
    shortName: 'DDT',
    category: 'Impulsivity / Decision Making',
    description: 'Measures temporal discounting rate by presenting choices between smaller-sooner and larger-later rewards. Hyperbolic discounting parameter k indexes impulsivity.',
    trials: 27,
    duration: '5-8 min',
    timingPrecision: '~16ms at 60fps',
    scoringAlgorithm: 'Hyperbolic discounting: V = A / (1 + kD), where k = discount rate. Estimated via adjusting-amount procedure or logistic regression. AUC (area under the curve) as model-free index.',
    trialDataExport: 'Per-trial: immediate amount, delayed amount, delay period, choice, RT (ms), indifference point',
    keyMetrics: ['k value (log)', 'AUC', 'Median RT', 'Consistency index'],
  },
];

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
