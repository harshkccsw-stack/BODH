'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  Upload,
  Clock,
  Globe,
  ListChecks,
  Play,
  Brain,
  Stethoscope,
  Briefcase,
  Heart,
  FlaskConical,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Vertical = 'all' | 'clinical' | 'industrial' | 'counselling' | 'experimental';
type InstrumentType = 'all' | 'screening' | 'personality' | 'aptitude' | 'behavioral' | 'experimental';

interface Instrument {
  name: string;
  shortName: string;
  category: string;
  vertical: Exclude<Vertical, 'all'>;
  type: Exclude<InstrumentType, 'all'>;
  items: number;
  duration: string;
  languages: string[];
  normStatus: string;
  tier: number;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const instruments: Instrument[] = [
  // Clinical
  { name: 'PHQ-9 — Patient Health Questionnaire', shortName: 'PHQ-9', category: 'Depression Screening', vertical: 'clinical', type: 'screening', items: 9, duration: '3-5 min', languages: ['English', 'Hindi', 'Tamil'], normStatus: 'Indian norms available', tier: 1 },
  { name: 'PHQ-2 — Ultra-Brief Depression Screen', shortName: 'PHQ-2', category: 'Depression Screening', vertical: 'clinical', type: 'screening', items: 2, duration: '1-2 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms available', tier: 1 },
  { name: 'GAD-7 — Generalized Anxiety Disorder', shortName: 'GAD-7', category: 'Anxiety Screening', vertical: 'clinical', type: 'screening', items: 7, duration: '3-5 min', languages: ['English', 'Hindi', 'Kannada'], normStatus: 'Indian norms available', tier: 1 },
  { name: 'DASS-21 — Depression Anxiety Stress Scales', shortName: 'DASS-21', category: 'Emotional Distress', vertical: 'clinical', type: 'screening', items: 21, duration: '5-10 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms available', tier: 2 },
  { name: 'Beck BDI-II — Beck Depression Inventory', shortName: 'BDI-II', category: 'Depression Assessment', vertical: 'clinical', type: 'screening', items: 21, duration: '5-10 min', languages: ['English', 'Hindi'], normStatus: 'Licensed / Indian norms', tier: 3 },
  { name: 'Beck Anxiety Inventory', shortName: 'BAI', category: 'Anxiety Assessment', vertical: 'clinical', type: 'screening', items: 21, duration: '5-10 min', languages: ['English', 'Hindi'], normStatus: 'Licensed / Indian norms', tier: 3 },
  { name: 'PCL-5 — PTSD Checklist', shortName: 'PCL-5', category: 'Trauma Screening', vertical: 'clinical', type: 'screening', items: 20, duration: '5-10 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms in progress', tier: 2 },
  { name: 'AUDIT — Alcohol Use Disorders Test', shortName: 'AUDIT', category: 'Substance Use Screening', vertical: 'clinical', type: 'screening', items: 10, duration: '2-5 min', languages: ['English', 'Hindi', 'Marathi'], normStatus: 'WHO norms', tier: 1 },

  // Industrial
  { name: 'Big Five (IPIP-NEO-120)', shortName: 'IPIP-120', category: 'Personality Profiling', vertical: 'industrial', type: 'personality', items: 120, duration: '15-20 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms available', tier: 2 },
  { name: 'HEXACO Personality Inventory', shortName: 'HEXACO', category: 'Personality Profiling', vertical: 'industrial', type: 'personality', items: 100, duration: '15-20 min', languages: ['English'], normStatus: 'Global norms', tier: 2 },
  { name: 'Learning Agility Assessment', shortName: 'LAA', category: 'Potential Assessment', vertical: 'industrial', type: 'aptitude', items: 60, duration: '20-25 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms available', tier: 3 },
  { name: 'Cognitive Aptitude Battery', shortName: 'CAB', category: 'Cognitive Assessment', vertical: 'industrial', type: 'aptitude', items: 45, duration: '30-40 min', languages: ['English'], normStatus: 'Indian norms available', tier: 3 },
  { name: 'Situational Judgement Tests (SJTs)', shortName: 'SJT', category: 'Behavioral Assessment', vertical: 'industrial', type: 'behavioral', items: 30, duration: '20-30 min', languages: ['English', 'Hindi'], normStatus: 'Role-specific norms', tier: 3 },
  { name: 'AI Adaptability Index', shortName: 'AIAI', category: 'Future-Readiness', vertical: 'industrial', type: 'behavioral', items: 40, duration: '10-15 min', languages: ['English'], normStatus: 'Pilot norms (India)', tier: 4 },
  { name: 'Digital Diet Assessment', shortName: 'DDA', category: 'Digital Wellness', vertical: 'industrial', type: 'behavioral', items: 25, duration: '5-10 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms in progress', tier: 2 },

  // Counselling
  { name: 'SCAS — Spence Children\'s Anxiety Scale', shortName: 'SCAS', category: 'Child Anxiety', vertical: 'counselling', type: 'screening', items: 44, duration: '10-15 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms available', tier: 2 },
  { name: 'CDI-2 — Children\'s Depression Inventory', shortName: 'CDI-2', category: 'Child Depression', vertical: 'counselling', type: 'screening', items: 28, duration: '10-15 min', languages: ['English', 'Hindi'], normStatus: 'Licensed / Indian norms', tier: 3 },
  { name: 'ADHD Rating Scale-5', shortName: 'ADHD-RS', category: 'Attention & Hyperactivity', vertical: 'counselling', type: 'screening', items: 18, duration: '5-10 min', languages: ['English', 'Hindi'], normStatus: 'DSM-5 based norms', tier: 2 },
  { name: 'Developmental Milestones Tracker', shortName: 'DMT', category: 'Child Development', vertical: 'counselling', type: 'screening', items: 35, duration: '10-15 min', languages: ['English', 'Hindi', 'Tamil'], normStatus: 'Indian norms available', tier: 1 },
  { name: 'School Adjustment Scale', shortName: 'SAS', category: 'School Readiness', vertical: 'counselling', type: 'behavioral', items: 30, duration: '10-15 min', languages: ['English', 'Hindi'], normStatus: 'Indian norms available', tier: 2 },
  { name: 'Academic Stress Inventory', shortName: 'ASI', category: 'Academic Wellbeing', vertical: 'counselling', type: 'screening', items: 40, duration: '10-15 min', languages: ['English', 'Hindi', 'Kannada'], normStatus: 'Indian norms available', tier: 2 },

  // Experimental
  { name: 'IAT — Implicit Association Test', shortName: 'IAT', category: 'Implicit Bias', vertical: 'experimental', type: 'experimental', items: 120, duration: '7-10 min', languages: ['English'], normStatus: 'Research norms', tier: 4 },
  { name: 'Dot Probe Task', shortName: 'DotProbe', category: 'Attentional Bias', vertical: 'experimental', type: 'experimental', items: 160, duration: '10-15 min', languages: ['English'], normStatus: 'Research norms', tier: 4 },
  { name: 'Stroop Colour-Word Task', shortName: 'Stroop', category: 'Cognitive Inhibition', vertical: 'experimental', type: 'experimental', items: 100, duration: '5-8 min', languages: ['English', 'Hindi'], normStatus: 'Research norms', tier: 4 },
  { name: 'Go/No-Go Task', shortName: 'GNG', category: 'Response Inhibition', vertical: 'experimental', type: 'experimental', items: 200, duration: '8-12 min', languages: ['English'], normStatus: 'Research norms', tier: 4 },
  { name: 'N-Back Working Memory Task', shortName: 'N-Back', category: 'Working Memory', vertical: 'experimental', type: 'experimental', items: 80, duration: '10-15 min', languages: ['English'], normStatus: 'Research norms', tier: 4 },
  { name: 'Delay Discounting Task', shortName: 'DDT', category: 'Impulsivity / Decision Making', vertical: 'experimental', type: 'experimental', items: 27, duration: '5-8 min', languages: ['English'], normStatus: 'Research norms', tier: 5 },
];

const verticals: { key: Vertical; label: string; icon: typeof Brain }[] = [
  { key: 'all', label: 'All', icon: ListChecks },
  { key: 'clinical', label: 'Clinical', icon: Stethoscope },
  { key: 'industrial', label: 'Industrial', icon: Briefcase },
  { key: 'counselling', label: 'Counselling', icon: Heart },
  { key: 'experimental', label: 'Experimental', icon: FlaskConical },
];

const instrumentTypes: { key: InstrumentType; label: string }[] = [
  { key: 'all', label: 'All Types' },
  { key: 'screening', label: 'Screening' },
  { key: 'personality', label: 'Personality' },
  { key: 'aptitude', label: 'Aptitude' },
  { key: 'behavioral', label: 'Behavioral' },
  { key: 'experimental', label: 'Experimental' },
];

const verticalColors: Record<Exclude<Vertical, 'all'>, string> = {
  clinical: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  industrial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  counselling: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  experimental: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const tierColors: Record<number, string> = {
  1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  3: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  4: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  5: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InstrumentsPage() {
  const [activeVertical, setActiveVertical] = useState<Vertical>('all');
  const [activeType, setActiveType] = useState<InstrumentType>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return instruments.filter((inst) => {
      if (activeVertical !== 'all' && inst.vertical !== activeVertical) return false;
      if (activeType !== 'all' && inst.type !== activeType) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          inst.name.toLowerCase().includes(q) ||
          inst.shortName.toLowerCase().includes(q) ||
          inst.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeVertical, activeType, search]);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>BodhAssess</span>
            <span>/</span>
            <span className="text-foreground font-medium">Instrument Library</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Instrument Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, search, and launch standardised assessments across all verticals.
          </p>
        </div>
        <Button variant="primary" size="md">
          <Upload className="h-4 w-4" />
          Upload Instrument
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Vertical filter sidebar */}
        <div className="flex lg:flex-col gap-1.5 lg:w-48 shrink-0">
          {verticals.map((v) => {
            const isActive = activeVertical === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setActiveVertical(v.key)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors text-left cursor-pointer',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <v.icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{v.label}</span>
                <span className="lg:hidden">{v.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-5 min-w-0">
          {/* Search & type filter bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search instruments by name, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8.5 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {instrumentTypes.map((t) => {
                const isActive = activeType === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveType(t.key)}
                    className={cn(
                      'rounded-md px-3 h-8.5 text-xs font-medium transition-colors cursor-pointer border',
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results count */}
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} instrument{filtered.length !== 1 ? 's' : ''}
          </p>

          {/* Instrument grid */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <Brain className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-medium">No instruments found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try adjusting your filters or search query.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((inst) => (
                <Card
                  key={inst.shortName}
                  className="hover:shadow-md transition-shadow flex flex-col"
                >
                  <CardContent className="p-5 flex flex-col flex-1 gap-3.5">
                    {/* Top badges row */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                          verticalColors[inst.vertical],
                        )}
                      >
                        {inst.vertical.charAt(0).toUpperCase() + inst.vertical.slice(1)}
                      </span>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium bg-secondary text-secondary-foreground">
                        {inst.category}
                      </span>
                      <span
                        className={cn(
                          'ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
                          tierColors[inst.tier],
                        )}
                      >
                        T{inst.tier}
                      </span>
                    </div>

                    {/* Instrument name */}
                    <div>
                      <h3 className="text-sm font-semibold leading-snug">{inst.name}</h3>
                    </div>

                    {/* Key info grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5 shrink-0" />
                        <span>{inst.items} items</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>{inst.duration}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span>{inst.languages.join(', ')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2">
                        <Brain className="h-3.5 w-3.5 shrink-0" />
                        <span>{inst.normStatus}</span>
                      </div>
                    </div>

                    {/* Action */}
                    <div className="mt-auto pt-1">
                      <Button variant="primary" size="sm" className="w-full">
                        <Play className="h-3.5 w-3.5" />
                        Start Session
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
