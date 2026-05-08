import {
  Brain,
  Sparkles,
  ShieldCheck,
  MessageSquare,
  AlertTriangle,
  Eye,
  Scale,
  Rocket,
  BarChart3,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const dimensions = [
  {
    name: 'AI Trust Calibration',
    icon: ShieldCheck,
    description: 'Ability to appropriately calibrate trust in AI outputs — neither over-relying nor dismissing.',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
  },
  {
    name: 'Cognitive Flexibility',
    icon: Brain,
    description: 'Capacity to shift mental models and adapt workflows when AI tools change or improve.',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-100 dark:bg-purple-900/30',
  },
  {
    name: 'Collaboration Orientation',
    icon: Users,
    description: 'Willingness to treat AI as a collaborative partner rather than a threat or simple tool.',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-900/30',
  },
  {
    name: 'AI Anxiety',
    icon: AlertTriangle,
    description: 'Level of anxiety or apprehension about AI replacing human roles and judgment.',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-900/30',
  },
  {
    name: 'Prompt Thinking',
    icon: MessageSquare,
    description: 'Ability to formulate effective prompts and decompose tasks for AI-augmented execution.',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
  },
  {
    name: 'Critical Evaluation',
    icon: Eye,
    description: 'Skill in evaluating AI-generated content for accuracy, bias, and contextual relevance.',
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
  },
  {
    name: 'Ethical AI Orientation',
    icon: Scale,
    description: 'Awareness of and commitment to ethical considerations in AI-augmented decision-making.',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
