'use client';

import { useState, useMemo, useEffect } from 'react';
import { getInstruments, type Instrument as ApiInstrument } from '@/lib/api';
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
  Pencil,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { loadOverrides, saveOverride, applyOverride, type InstrumentOverride } from '@/lib/instrument-overrides';
import { getVerticals, BUILT_IN_VERTICALS, getInstruments as getLocalInstruments, type Vertical as StoredVertical } from '@/lib/data-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Vertical = string;
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

const builtInVerticals: { key: Vertical; label: string; icon: typeof Brain }[] = [
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

const verticalColors: Record<string, string> = {
  clinical: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  industrial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  counselling: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  experimental: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};
const fallbackVerticalColor = 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400';

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
  const [apiInstruments, setApiInstruments] = useState<Instrument[]>([]);
  const [apiSource, setApiSource] = useState<'api' | 'mock'>('mock');
  const [overrides, setOverrides] = useState<Record<string, InstrumentOverride>>({});
  const [editing, setEditing] = useState<Instrument | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', category: '', duration: '', items: 0, tier: 1,
    languages: '', normStatus: '', vertical: '',
  });
  const [customVerticals, setCustomVerticals] = useState<StoredVertical[]>([]);
  const [localInstruments, setLocalInstruments] = useState<Instrument[]>([]);

  useEffect(() => { setOverrides(loadOverrides()); }, []);

  useEffect(() => {
    const reload = async () => {
      const all = await getVerticals();
      const builtInCodes = new Set(BUILT_IN_VERTICALS.map((v) => v.code));
      setCustomVerticals(all.filter((v) => !builtInCodes.has(v.code)));

      const stored = getLocalInstruments();
      const mapped: Instrument[] = stored.map((s): Instrument => ({
        name: s.name || s.shortName || 'Untitled',
        shortName: s.shortName || (s.name ? s.name.split(' ')[0] : 'CUSTOM'),
        category: s.category || 'Custom',
        vertical: String(s.vertical || 'clinical').toLowerCase(),
        type: 'screening',
        items: Array.isArray(s.questions) ? s.questions.length : 0,
        duration: s.duration ? `${s.duration} min` : '—',
        languages: Array.isArray(s.languages) ? s.languages.map((l) => String(l).toUpperCase()) : ['EN'],
        normStatus: 'User-published',
        tier: typeof s.tier === 'string' ? parseInt(String(s.tier).replace('T', ''), 10) || 1 : (s.tier || 1),
      }));
      setLocalInstruments(mapped);
    };
    reload();

    // Refresh whenever the tab regains focus or localStorage changes in
    // another tab — so newly-published instruments show up immediately.
    const onFocus = () => reload();
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('bodhassess.')) reload();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Filter pill list = built-ins + any user-created verticals picked up from
  // /question-bank/create. Keys are stored lowercased to match instrument records.
  const verticals = useMemo(() => [
    ...builtInVerticals,
    ...customVerticals.map((v) => ({
      key: v.code.toLowerCase(),
      label: v.name,
      icon: ListChecks,
    })),
  ], [customVerticals]);

  useEffect(() => {
    getInstruments()
      .then((data) => {
        // Map API data to the local Instrument shape
        const mapped: Instrument[] = data.map((i: ApiInstrument) => ({
          name: i.name,
          shortName: i.short_name || i.name.slice(0, 10),
          category: i.category || 'Custom',
          vertical: (i.vertical.toLowerCase() as Exclude<Vertical, 'all'>),
          type: 'screening',
          items: i.item_count,
          duration: i.duration_minutes ? `${i.duration_minutes} min` : '—',
          languages: i.languages.map((l) => l.toUpperCase()),
          normStatus: i.norm_status === 'AVAILABLE' ? 'Indian norms available' : i.norm_status,
          tier: parseInt(i.tier_required.replace('T', ''), 10) || 1,
        }));
        setApiInstruments(mapped);
        setApiSource('api');
      })
      .catch(() => setApiSource('mock'));
  }, []);

  // Merge user-published (localStorage) + backend API + mock. Dedupe by name so
  // a user questionnaire that was also synced to the backend doesn't double up.
  // Also re-read localStorage inline on every render so a newly-published
  // instrument shows up without needing a focus/storage event.
  const freshLocal: Instrument[] = typeof window === 'undefined'
    ? localInstruments
    : getLocalInstruments().map((s): Instrument => ({
        name: s.name || s.shortName || 'Untitled',
        shortName: s.shortName || (s.name ? s.name.split(' ')[0] : 'CUSTOM'),
        category: s.category || 'Custom',
        vertical: String(s.vertical || 'clinical').toLowerCase(),
        type: 'screening',
        items: Array.isArray(s.questions) ? s.questions.length : 0,
        duration: s.duration ? `${s.duration} min` : '—',
        languages: Array.isArray(s.languages) ? s.languages.map((l) => String(l).toUpperCase()) : ['EN'],
        normStatus: 'User-published',
        tier: typeof s.tier === 'string' ? parseInt(String(s.tier).replace('T', ''), 10) || 1 : (s.tier || 1),
      }));

  const allInstruments = useMemo(() => {
    const seen = new Set<string>();
    const out: Instrument[] = [];
    const push = (arr: Instrument[]) => {
      arr.forEach((i) => {
        const key = (i.name || '').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(i);
      });
    };
    push(freshLocal);
    push(apiInstruments);
    push(instruments);
    return out.map((i) => applyOverride(i, overrides));
  }, [freshLocal, apiInstruments, overrides]);

  const openEdit = (inst: Instrument) => {
    setEditing(inst);
    setEditForm({
      name: inst.name,
      category: inst.category,
      duration: inst.duration,
      items: inst.items,
      tier: inst.tier,
      languages: inst.languages.join(', '),
      normStatus: inst.normStatus,
      vertical: String(inst.vertical || '').toLowerCase(),
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const key = editing.shortName || editing.name;
    const patch: InstrumentOverride = {
      name: editForm.name.trim() || editing.name,
      category: editForm.category.trim(),
      duration: editForm.duration.trim(),
      items: Number(editForm.items) || 0,
      tier: Number(editForm.tier) || 1,
      languages: editForm.languages.split(',').map((s) => s.trim()).filter(Boolean),
      normStatus: editForm.normStatus.trim(),
      vertical: editForm.vertical.trim().toLowerCase() || editing.vertical,
    };
    setOverrides(saveOverride(key, patch));
    setEditing(null);
  };

  // Direct filter (no useMemo) so every keystroke re-renders cleanly.
  const toStr = (v: unknown): string => (v == null ? '' : String(v)).toLowerCase();
  const query = search.trim().toLowerCase();
  const activeV = toStr(activeVertical);
  const activeT = toStr(activeType);
  const filtered = allInstruments.filter((inst) => {
    if (!inst) return false;
    if (activeV !== 'all' && toStr(inst.vertical) !== activeV) return false;
    if (activeT !== 'all' && toStr(inst.type) !== activeT) return false;
    if (!query) return true;
    const hay = [
      inst.name,
      inst.shortName,
      inst.category,
      inst.normStatus,
      inst.vertical,
    ].map(toStr).join(' ');
    return hay.includes(query);
  });

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
            {apiSource === 'api' && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" /> Live API — {apiInstruments.length} custom instruments
              </span>
            )}
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => window.location.href = '/question-bank/create'}>
          <Upload className="h-4 w-4" />
          Create Questionnaire
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
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Search instruments by name, short name, category..."
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
                className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
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
            Showing {filtered.length} of {allInstruments.length} instrument{allInstruments.length !== 1 ? 's' : ''}
            {search && <span className="ml-1">for "<span className="font-medium text-foreground">{search}</span>"</span>}
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
              {filtered.map((inst, idx) => (
                <Card
                  key={`${inst.name}-${inst.shortName}-${idx}`}
                  className="hover:shadow-md transition-shadow flex flex-col"
                >
                  <CardContent className="p-5 flex flex-col flex-1 gap-3.5">
                    {/* Top badges row */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                          verticalColors[inst.vertical] || fallbackVerticalColor,
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
                    <div className="mt-auto pt-1 flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          window.location.href = `/sessions/create?instrument=${encodeURIComponent(inst.shortName)}`;
                        }}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Start Session
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(inst)} title="Edit instrument">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditing(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Edit Instrument</CardTitle>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Short name: <span className="font-mono">{editing.shortName}</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Category</label>
                  <input
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Duration</label>
                  <input
                    value={editForm.duration}
                    onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                    placeholder="e.g., 5-10 min"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Items</label>
                  <input
                    type="number"
                    value={editForm.items}
                    onChange={(e) => setEditForm({ ...editForm, items: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tier</label>
                  <select
                    value={editForm.tier}
                    onChange={(e) => setEditForm({ ...editForm, tier: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>T{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Vertical</label>
                <select
                  value={editForm.vertical}
                  onChange={(e) => setEditForm({ ...editForm, vertical: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {verticals
                    .filter((v) => v.key !== 'all')
                    .map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Languages (comma-separated)</label>
                <input
                  value={editForm.languages}
                  onChange={(e) => setEditForm({ ...editForm, languages: e.target.value })}
                  placeholder="English, Hindi, Tamil"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Norm Status</label>
                <input
                  value={editForm.normStatus}
                  onChange={(e) => setEditForm({ ...editForm, normStatus: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    const key = editing?.shortName || editing?.name || '';
                    if (key) window.location.href = `/question-bank/create?edit=${encodeURIComponent(key)}`;
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit Questionnaire
                </Button>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button variant="primary" onClick={saveEdit}>Save Changes</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
