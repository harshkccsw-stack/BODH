'use client';

import {
  Brain,
  Sparkles,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  Eye,
  Scale,
  Zap,
  Rocket,
  BarChart3,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const dimensions = [
  {
    name: 'AI Trust Calibration',
    icon: ShieldCheck,
    description: 'Ability to appropriately calibrate trust in AI outputs — neither over-relying nor dismissing.',
    sampleScore: 72,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    name: 'Cognitive Flexibility',
    icon: Brain,
    description: 'Capacity to shift mental models and adapt workflows when AI tools change or improve.',
    sampleScore: 68,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
  },
  {
    name: 'Collaboration Orientation',
    icon: Users,
    description: 'Willingness to treat AI as a collaborative partner rather than a threat or simple tool.',
    sampleScore: 81,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-900/30',
  },
  {
    name: 'AI Anxiety',
    icon: AlertTriangle,
    description: 'Level of anxiety or apprehension about AI replacing human roles and judgment.',
    sampleScore: 34,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-900/30',
  },
  {
    name: 'Prompt Thinking',
    icon: MessageSquare,
    description: 'Ability to formulate effective prompts and decompose tasks for AI-augmented execution.',
    sampleScore: 59,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  {
    name: 'Critical Evaluation',
    icon: Eye,
    description: 'Skill in evaluating AI-generated content for accuracy, bias, and contextual relevance.',
    sampleScore: 75,
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
  },
  {
    name: 'Ethical AI Orientation',
    icon: Scale,
    description: 'Awareness of and commitment to ethical considerations in AI-augmented decision-making.',
    sampleScore: 83,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
];

const stats = [
  { label: 'Respondents Assessed', value: '847', icon: Users, change: 'Pilot phase' },
  { label: 'Avg Composite Score', value: '67.4', icon: BarChart3, change: 'Out of 100' },
  { label: 'Dimensions Measured', value: '7', icon: Brain, change: 'Validated subscales' },
  { label: 'Cronbach\'s Alpha', value: '0.89', icon: Zap, change: 'Internal consistency' },
];

export default function AIAdaptabilityPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Industrial</span>
          <span>/</span>
          <span className="text-foreground font-medium">AI Adaptability Index</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Adaptability Index</h1>
      </div>

      {/* Hero Section */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-6 lg:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">
                The only validated instrument measuring psychological readiness for AI-augmented work
              </h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                The AI Adaptability Index (AAI) is a 42-item psychometric instrument developed through
                factor analysis on Indian working professionals. It measures seven distinct dimensions of
                psychological readiness for working alongside AI systems, providing actionable insights
                for talent development and selection.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <Button variant="primary" size="sm">
                  <Rocket className="h-4 w-4 mr-2" />
                  Launch Assessment
                </Button>
                <Button variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Pilot Results
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat) => (
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

      {/* Pilot badge */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          Pilot Phase
        </Badge>
        <span className="text-sm text-muted-foreground">
          n=847 respondents assessed across 12 organizations
        </span>
      </div>

      {/* Dimension Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {dimensions.map((dim) => (
          <Card key={dim.name} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${dim.bg}`}>
                  <dim.icon className={`h-5 w-5 ${dim.color}`} />
                </div>
                <h3 className="text-sm font-semibold">{dim.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {dim.description}
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Sample Score</span>
                  <span className="font-mono font-medium">{dim.sampleScore}/100</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      dim.sampleScore >= 70
                        ? 'bg-green-500 dark:bg-green-400'
                        : dim.sampleScore >= 50
                          ? 'bg-amber-500 dark:bg-amber-400'
                          : 'bg-red-500 dark:bg-red-400'
                    }`}
                    style={{ width: `${dim.sampleScore}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
