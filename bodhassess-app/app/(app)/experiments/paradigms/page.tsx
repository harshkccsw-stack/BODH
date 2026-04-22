'use client';

import {
  Brain,
  Target,
  Layers,
  Hand,
  Monitor,
  Clock,
  Eye,
  Search,
  Zap,
  FlaskConical,
  Briefcase,
  Calculator,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ParadigmCard {
  id: string;
  name: string;
  icon: React.ElementType;
  measures: string;
  clinicalUse: string;
  industrialUse: string;
  scoringAlgorithm: string;
  outputMetric: string;
  color: string;
}

const paradigms: ParadigmCard[] = [
  {
    id: 'iat',
    name: 'Implicit Association Test (IAT)',
    icon: Brain,
    measures: 'Implicit attitudes and automatic associations between concepts',
    clinicalUse: 'Detecting implicit self-harm associations, implicit anxiety toward stimuli, substance-use attitudes',
    industrialUse: 'Measuring implicit organizational commitment, leadership bias, diversity attitudes',
    scoringAlgorithm: 'D-score (Greenwald et al., 2003)',
    outputMetric: 'D-score (-2 to +2)',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    id: 'dot-probe',
    name: 'Dot Probe Task',
    icon: Target,
    measures: 'Attentional bias toward threat, reward, or emotionally salient stimuli',
    clinicalUse: 'Anxiety disorder assessment, PTSD attentional vigilance, depression-related attentional avoidance',
    industrialUse: 'Stress reactivity screening, attentional focus under cognitive load',
    scoringAlgorithm: 'Attentional Bias Score (congruent vs incongruent RT difference)',
    outputMetric: 'Bias score (ms)',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  {
    id: 'stroop',
    name: 'Stroop Task',
    icon: Layers,
    measures: 'Cognitive interference, selective attention, and executive control',
    clinicalUse: 'ADHD executive dysfunction, frontal lobe assessment, emotional Stroop for trauma',
    industrialUse: 'Cognitive flexibility screening, multitasking aptitude, attention under pressure',
    scoringAlgorithm: 'Stroop Interference Score (incongruent RT - congruent RT)',
    outputMetric: 'Interference score (ms)',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  {
    id: 'go-nogo',
    name: 'Go/No-Go Task',
    icon: Hand,
    measures: 'Response inhibition, impulsivity, and motor control',
    clinicalUse: 'ADHD impulsivity assessment, substance abuse disinhibition, OCD compulsive responding',
    industrialUse: 'Safety-critical role screening, impulse control in high-stakes decision-making',
    scoringAlgorithm: 'Commission Error Rate + Signal Detection (d-prime)',
    outputMetric: 'Commission errors (%), d-prime',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  {
    id: 'nback',
    name: 'N-Back Task',
    icon: Monitor,
    measures: 'Working memory capacity, updating, and cognitive load tolerance',
    clinicalUse: 'Cognitive decline monitoring, ADHD working memory deficits, TBI recovery tracking',
    industrialUse: 'Cognitive capacity assessment for complex roles, training effectiveness measurement',
    scoringAlgorithm: 'Hit Rate, False Alarm Rate, d-prime per N level',
    outputMetric: 'd-prime, accuracy (%)',
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
  {
    id: 'affective-priming',
    name: 'Affective Priming',
    icon: Zap,
    measures: 'Automatic affective evaluation and emotional processing speed',
    clinicalUse: 'Phobia assessment, implicit mood measurement, emotional processing in depression',
    industrialUse: 'Brand attitude measurement, consumer sentiment analysis',
    scoringAlgorithm: 'Priming Effect Score (congruent vs incongruent RT)',
    outputMetric: 'Priming effect (ms)',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  },
  {
    id: 'visual-search',
    name: 'Visual Search',
    icon: Eye,
    measures: 'Attentional capture, search efficiency, and threat detection speed',
    clinicalUse: 'Anxiety-related threat detection, ADHD visual attention, autism perceptual processing',
    industrialUse: 'Vigilance and monitoring aptitude, quality control screening',
    scoringAlgorithm: 'Search Slope (RT per set size), Target-Present/Absent RT',
    outputMetric: 'Search slope (ms/item)',
    color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  },
  {
    id: 'delay-discounting',
    name: 'Delay Discounting',
    icon: Clock,
    measures: 'Temporal discounting rate, impulsive vs. deliberative decision-making',
    clinicalUse: 'Addiction risk assessment, ADHD impulsivity profiling, gambling disorder screening',
    industrialUse: 'Financial decision-making aptitude, long-term planning capacity',
    scoringAlgorithm: 'Hyperbolic Discounting (k-value, Mazur 1987)',
    outputMetric: 'k-value (discounting rate)',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
];

export default function ParadigmLibraryPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Designing Experiments</span>
          <span>/</span>
          <span className="text-foreground font-medium">Paradigm Library</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Paradigm Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse experimental paradigms available for assessment design. Each paradigm includes clinical and industrial applications.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paradigms</p>
                <p className="text-2xl font-semibold mt-1">{paradigms.length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <FlaskConical className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clinical Applications</p>
                <p className="text-2xl font-semibold mt-1">24+</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-500/10">
                <Brain className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Industrial Applications</p>
                <p className="text-2xl font-semibold mt-1">16+</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500/10">
                <Briefcase className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Paradigm Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {paradigms.map((paradigm) => {
          const Icon = paradigm.icon;
          return (
            <Card key={paradigm.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg shrink-0', paradigm.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{paradigm.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{paradigm.measures}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Brain className="h-3 w-3 text-green-600 dark:text-green-400" />
                      <p className="text-xs font-medium text-green-700 dark:text-green-400">Clinical Use</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{paradigm.clinicalUse}</p>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Briefcase className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-400">Industrial Use</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{paradigm.industrialUse}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-1 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <Calculator className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Scoring:</span>
                    <span className="text-xs font-medium">{paradigm.scoringAlgorithm}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Output:</span>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                    {paradigm.outputMetric}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
