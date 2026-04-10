'use client';

import { Fragment, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Filter,
  FlaskConical,
  Globe,
  Library,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Vertical = 'clinical' | 'industrial' | 'counselling';
type ItemFormat = 'MCQ' | 'Rating Scale' | 'Likert' | 'SJT' | 'Free Text' | 'Image Choice' | 'Ranking' | 'Matrix';
type ValidationStatus = 'Draft' | 'Piloting' | 'Calibrated' | 'Validated' | 'Deprecated';
type Language = 'en' | 'hi' | 'ta' | 'bn' | 'mr' | 'te' | 'kn' | 'ml' | 'gu' | 'pa' | 'or';

interface IRTParams {
  a: number; // discrimination
  b: number; // difficulty
  c: number; // guessing (only meaningful for MCQ-like)
}

interface QuestionItem {
  id: string;
  subDomain: string;
  vertical: Vertical;
  format: ItemFormat;
  irt: IRTParams;
  languages: Language[];
  status: ValidationStatus;
  riskFlag: boolean;
  stem: string;
  options?: string[];
  normSets: string[];
  lastCalibrated: string;
  sampleN: number;
  reliabilityAlpha: number;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const ITEMS: QuestionItem[] = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    subDomain: 'GAD-7:Item3',
    vertical: 'clinical',
    format: 'Likert',
    irt: { a: 1.82, b: -0.45, c: 0.0 },
    languages: ['en', 'hi', 'ta', 'bn'],
    status: 'Validated',
    riskFlag: false,
    stem: 'Worrying too much about different things',
    options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
    normSets: ['India Urban Adults (N=12,450)', 'India Rural Adults (N=4,200)'],
    lastCalibrated: '2025-11-14',
    sampleN: 16650,
    reliabilityAlpha: 0.91,
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    subDomain: 'PHQ-9:Item9',
    vertical: 'clinical',
    format: 'Likert',
    irt: { a: 1.45, b: 1.12, c: 0.0 },
    languages: ['en', 'hi', 'mr', 'te', 'bn'],
    status: 'Validated',
    riskFlag: true,
    stem: 'Thoughts that you would be better off dead, or of hurting yourself',
    options: ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'],
    normSets: ['India Urban Adults (N=12,450)', 'India College Students (N=8,100)'],
    lastCalibrated: '2025-10-28',
    sampleN: 20550,
    reliabilityAlpha: 0.88,
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    subDomain: 'Big5:Conscientiousness:Orderliness',
    vertical: 'industrial',
    format: 'Rating Scale',
    irt: { a: 1.23, b: 0.34, c: 0.0 },
    languages: ['en', 'hi'],
    status: 'Calibrated',
    riskFlag: false,
    stem: 'I keep my belongings neat and organized',
    options: ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'],
    normSets: ['India Corporate Professionals (N=9,800)'],
    lastCalibrated: '2025-09-03',
    sampleN: 9800,
    reliabilityAlpha: 0.84,
  },
  {
    id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
    subDomain: 'SJT:Leadership:ConflictRes',
    vertical: 'industrial',
    format: 'SJT',
    irt: { a: 0.89, b: 0.78, c: 0.18 },
    languages: ['en', 'hi', 'ta'],
    status: 'Piloting',
    riskFlag: false,
    stem: 'Two team members are in a heated disagreement about project priorities. As their manager, you would most likely...',
    options: [
      'Schedule a mediation meeting',
      'Let them resolve it themselves',
      'Assign a compromise solution',
      'Escalate to senior management',
    ],
    normSets: [],
    lastCalibrated: '2026-01-15',
    sampleN: 1200,
    reliabilityAlpha: 0.72,
  },
  {
    id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
    subDomain: 'DASS-21:Depression:Anhedonia',
    vertical: 'clinical',
    format: 'Likert',
    irt: { a: 1.67, b: -0.22, c: 0.0 },
    languages: ['en', 'hi', 'bn', 'gu', 'mr'],
    status: 'Validated',
    riskFlag: false,
    stem: 'I could not seem to experience any positive feeling at all',
    options: ['Did not apply', 'Applied some of the time', 'Applied a good part of the time', 'Applied most of the time'],
    normSets: ['India Urban Adults (N=12,450)', 'India Rural Adults (N=4,200)', 'India Adolescents (N=6,300)'],
    lastCalibrated: '2025-12-01',
    sampleN: 22950,
    reliabilityAlpha: 0.89,
  },
  {
    id: 'f6a7b8c9-d0e1-2345-fabc-456789012345',
    subDomain: 'Career:Interest:Realistic',
    vertical: 'counselling',
    format: 'MCQ',
    irt: { a: 1.05, b: -0.88, c: 0.22 },
    languages: ['en', 'hi', 'ta', 'kn'],
    status: 'Calibrated',
    riskFlag: false,
    stem: 'Which of the following activities would you most enjoy?',
    options: ['Building a model structure', 'Writing a short story', 'Analysing a data set', 'Organising a team event'],
    normSets: ['India School Students Gr.9-12 (N=15,200)'],
    lastCalibrated: '2025-08-20',
    sampleN: 15200,
    reliabilityAlpha: 0.81,
  },
  {
    id: 'a7b8c9d0-e1f2-3456-abcd-567890123456',
    subDomain: 'Burnout:EE:EmotionalExhaustion',
    vertical: 'industrial',
    format: 'Rating Scale',
    irt: { a: 1.94, b: 0.56, c: 0.0 },
    languages: ['en', 'hi'],
    status: 'Draft',
    riskFlag: false,
    stem: 'I feel emotionally drained from my work',
    options: ['Never', 'A few times a year', 'Monthly', 'Weekly', 'Daily'],
    normSets: [],
    lastCalibrated: '',
    sampleN: 0,
    reliabilityAlpha: 0,
  },
  {
    id: 'b8c9d0e1-f2a3-4567-bcde-678901234567',
    subDomain: 'ASD:SocialComm:EyeContact',
    vertical: 'clinical',
    format: 'Image Choice',
    irt: { a: 0.95, b: 1.45, c: 0.12 },
    languages: ['en', 'hi', 'ta', 'te', 'ml'],
    status: 'Piloting',
    riskFlag: false,
    stem: 'Select the image where the person is making appropriate eye contact during a conversation',
    normSets: ['India Children 6-12 (N=2,800)'],
    lastCalibrated: '2026-02-10',
    sampleN: 2800,
    reliabilityAlpha: 0.76,
  },
  {
    id: 'c9d0e1f2-a3b4-5678-cdef-789012345678',
    subDomain: 'Wellbeing:PERMA:Engagement',
    vertical: 'counselling',
    format: 'Ranking',
    irt: { a: 0.78, b: -1.20, c: 0.0 },
    languages: ['en', 'hi', 'mr'],
    status: 'Calibrated',
    riskFlag: false,
    stem: 'Rank the following activities by how "absorbed" or "in the zone" they make you feel (1 = most absorbed)',
    options: ['Playing a sport', 'Solving a puzzle', 'Painting or drawing', 'Coding a program', 'Playing music'],
    normSets: ['India College Students (N=8,100)'],
    lastCalibrated: '2025-07-11',
    sampleN: 8100,
    reliabilityAlpha: 0.79,
  },
  {
    id: 'd0e1f2a3-b4c5-6789-defa-890123456789',
    subDomain: 'Stress:PSS:PerceivedOverwhelm',
    vertical: 'clinical',
    format: 'Matrix',
    irt: { a: 1.38, b: 0.02, c: 0.0 },
    languages: ['en', 'hi', 'bn', 'pa', 'or'],
    status: 'Deprecated',
    riskFlag: true,
    stem: 'In the last month, how often have you felt that you were unable to control the important things in your life?',
    options: ['Never', 'Almost never', 'Sometimes', 'Fairly often', 'Very often'],
    normSets: ['India Urban Adults (N=12,450)'],
    lastCalibrated: '2024-03-22',
    sampleN: 12450,
    reliabilityAlpha: 0.86,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LANG_LABELS: Record<Language, string> = {
  en: 'EN', hi: 'HI', ta: 'TA', bn: 'BN', mr: 'MR',
  te: 'TE', kn: 'KN', ml: 'ML', gu: 'GU', pa: 'PA', or: 'OR',
};

const STATUS_STYLES: Record<ValidationStatus, { variant: 'success' | 'primary' | 'info' | 'warning' | 'destructive'; appearance: 'light' }> = {
  Validated:  { variant: 'success', appearance: 'light' },
  Calibrated: { variant: 'primary', appearance: 'light' },
  Piloting:   { variant: 'info', appearance: 'light' },
  Draft:      { variant: 'warning', appearance: 'light' },
  Deprecated: { variant: 'destructive', appearance: 'light' },
};

const VERTICAL_LABELS: Record<Vertical, string> = {
  clinical: 'Clinical',
  industrial: 'Industrial',
  counselling: 'Counselling',
};

const ALL_FORMATS: ItemFormat[] = ['MCQ', 'Rating Scale', 'Likert', 'SJT', 'Free Text', 'Image Choice', 'Ranking', 'Matrix'];
const ALL_STATUSES: ValidationStatus[] = ['Draft', 'Piloting', 'Calibrated', 'Validated', 'Deprecated'];
const ALL_VERTICALS: Vertical[] = ['clinical', 'industrial', 'counselling'];
const ALL_LANGUAGES: Language[] = ['en', 'hi', 'ta', 'bn', 'mr', 'te', 'kn', 'ml', 'gu', 'pa', 'or'];

function truncateUUID(uuid: string) {
  return uuid.slice(0, 8) + '...';
}

// ---------------------------------------------------------------------------
// Component: FilterPill
// ---------------------------------------------------------------------------

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-muted'
      )}
    >
      {label}
      {active && <X className="h-3 w-3" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component: DropdownFilter
// ---------------------------------------------------------------------------

function DropdownFilter<T extends string>({
  label,
  options,
  selected,
  onToggle,
  renderLabel,
}: {
  label: string;
  options: T[];
  selected: Set<T>;
  onToggle: (val: T) => void;
  renderLabel?: (val: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const display = renderLabel || ((v: T) => v);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Filter className="h-3 w-3 text-muted-foreground" />
        {label}
        {selected.size > 0 && (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {selected.size}
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-background p-1 shadow-lg">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                  selected.has(opt) ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                )}
              >
                <span className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]',
                  selected.has(opt) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                )}>
                  {selected.has(opt) && '\u2713'}
                </span>
                {display(opt)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: DetailPanel
// ---------------------------------------------------------------------------

function DetailPanel({ item }: { item: QuestionItem }) {
  return (
    <tr>
      <td colSpan={7} className="bg-muted/30 px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stem & Options */}
          <div className="md:col-span-2 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Item Stem</p>
              <p className="text-sm">{item.stem}</p>
            </div>
            {item.options && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Response Options</p>
                <ol className="list-decimal list-inside text-sm space-y-0.5">
                  {item.options.map((opt, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="text-foreground">{opt}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Full Item ID</p>
              <p className="font-mono text-xs break-all">{item.id}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">IRT Parameters</p>
              <div className="flex gap-4 font-mono text-xs">
                <span>a = {item.irt.a.toFixed(2)}</span>
                <span>b = {item.irt.b.toFixed(2)}</span>
                <span>c = {item.irt.c.toFixed(2)}</span>
              </div>
            </div>
            {item.lastCalibrated && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Last Calibrated</p>
                <p className="text-xs">{item.lastCalibrated}</p>
              </div>
            )}
            {item.sampleN > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Calibration Sample</p>
                <p className="text-xs">N = {item.sampleN.toLocaleString()}</p>
              </div>
            )}
            {item.reliabilityAlpha > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Reliability (Cronbach alpha)</p>
                <p className="text-xs font-mono">{item.reliabilityAlpha.toFixed(2)}</p>
              </div>
            )}
            {item.normSets.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Available Norm Sets</p>
                <ul className="text-xs space-y-0.5">
                  {item.normSets.map((norm, i) => (
                    <li key={i} className="text-muted-foreground">{norm}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuestionBankPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVerticals, setSelectedVerticals] = useState<Set<Vertical>>(new Set());
  const [selectedFormats, setSelectedFormats] = useState<Set<ItemFormat>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ValidationStatus>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(new Set());

  // Toggle helpers
  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  // Filtering
  const filtered = ITEMS.filter((item) => {
    if (selectedVerticals.size > 0 && !selectedVerticals.has(item.vertical)) return false;
    if (selectedFormats.size > 0 && !selectedFormats.has(item.format)) return false;
    if (selectedStatuses.size > 0 && !selectedStatuses.has(item.status)) return false;
    if (selectedLanguages.size > 0 && !item.languages.some((l) => selectedLanguages.has(l))) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.subDomain.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.stem.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Computed stats from full list
  const totalItems = ITEMS.length;
  const calibratedItems = ITEMS.filter((i) => i.status === 'Calibrated' || i.status === 'Validated').length;
  const indianNormItems = ITEMS.filter((i) => i.normSets.length > 0).length;
  const riskFlaggedItems = ITEMS.filter((i) => i.riskFlag).length;

  const hasActiveFilters = selectedVerticals.size > 0 || selectedFormats.size > 0 || selectedStatuses.size > 0 || selectedLanguages.size > 0 || searchQuery;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Item Management</span>
          <span>/</span>
          <span className="text-foreground font-medium">Question Bank</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Question Bank &mdash; Item Explorer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse, filter, and inspect psychometric items across 100,000+ items, 18 formats, and 11 languages.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Total Items', value: '1,00,847', icon: Database, change: '+1,204 this month' },
          { label: 'Calibrated Items', value: '68,312', icon: FlaskConical, change: '67.7% of total' },
          { label: 'Items with Indian Norms', value: '42,580', icon: Globe, change: 'Across 11 languages' },
          { label: 'Risk-Flagged Items', value: '1,247', icon: AlertTriangle, change: '312 pending review' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
                <div className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-lg',
                  stat.label === 'Risk-Flagged Items' ? 'bg-destructive/10' : 'bg-primary/10'
                )}>
                  <stat.icon className={cn(
                    'h-5 w-5',
                    stat.label === 'Risk-Flagged Items' ? 'text-destructive' : 'text-primary'
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by ID, sub-domain, or stem..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-shadow"
              />
            </div>

            {/* Vertical pills */}
            <div className="flex items-center gap-1.5">
              {ALL_VERTICALS.map((v) => (
                <FilterPill
                  key={v}
                  label={VERTICAL_LABELS[v]}
                  active={selectedVerticals.has(v)}
                  onClick={() => setSelectedVerticals(toggleSet(selectedVerticals, v))}
                />
              ))}
            </div>

            {/* Dropdown filters */}
            <DropdownFilter
              label="Format"
              options={ALL_FORMATS}
              selected={selectedFormats}
              onToggle={(v) => setSelectedFormats(toggleSet(selectedFormats, v))}
            />
            <DropdownFilter
              label="Status"
              options={ALL_STATUSES}
              selected={selectedStatuses}
              onToggle={(v) => setSelectedStatuses(toggleSet(selectedStatuses, v))}
            />
            <DropdownFilter
              label="Language"
              options={ALL_LANGUAGES}
              selected={selectedLanguages}
              onToggle={(v) => setSelectedLanguages(toggleSet(selectedLanguages, v))}
              renderLabel={(v) => LANG_LABELS[v]}
            />

            {/* Clear all */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSelectedVerticals(new Set());
                  setSelectedFormats(new Set());
                  setSelectedStatuses(new Set());
                  setSelectedLanguages(new Set());
                  setSearchQuery('');
                }}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Library className="h-4 w-4" />
              Items
              <Badge variant="secondary" size="sm">{filtered.length} shown</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">Click a row to expand details</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground w-8"></th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Item ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Sub-domain</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Format</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">IRT (a / b / c)</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Languages</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className={cn(
                          'border-b border-border cursor-pointer transition-colors',
                          isExpanded ? 'bg-muted/40' : 'hover:bg-muted/50'
                        )}
                      >
                        {/* Expand icon + risk flag */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            }
                            {item.riskFlag && (
                              <span className="flex h-2.5 w-2.5 rounded-full bg-red-500" title="Risk-flagged item" />
                            )}
                          </div>
                        </td>

                        {/* Item ID */}
                        <td className="px-5 py-3 font-mono text-xs">{truncateUUID(item.id)}</td>

                        {/* Sub-domain */}
                        <td className="px-5 py-3 font-medium text-xs">{item.subDomain}</td>

                        {/* Format */}
                        <td className="px-5 py-3">
                          <Badge variant="secondary" appearance="light" size="sm">{item.format}</Badge>
                        </td>

                        {/* IRT */}
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.irt.a.toFixed(2)}{' / '}
                            <span className={cn(
                              item.irt.b > 1.5 ? 'text-red-500' : item.irt.b < -1.5 ? 'text-blue-500' : ''
                            )}>
                              {item.irt.b >= 0 ? '+' : ''}{item.irt.b.toFixed(2)}
                            </span>
                            {' / '}{item.irt.c.toFixed(2)}
                          </span>
                        </td>

                        {/* Languages */}
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.languages.slice(0, 3).map((lang) => (
                              <span key={lang} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {LANG_LABELS[lang]}
                              </span>
                            ))}
                            {item.languages.length > 3 && (
                              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                +{item.languages.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <Badge
                            variant={STATUS_STYLES[item.status].variant}
                            appearance={STATUS_STYLES[item.status].appearance}
                            size="sm"
                          >
                            {item.riskFlag && <ShieldCheck className="h-3 w-3 mr-0.5" />}
                            {item.status}
                          </Badge>
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && <DetailPanel key={`${item.id}-detail`} item={item} />}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground text-sm">
                      No items match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
