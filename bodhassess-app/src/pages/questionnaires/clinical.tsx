import { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  Globe,
  ListChecks,
  Pencil,
  Play,
  Search,
  Stethoscope,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { loadOverrides, saveOverride, applyOverride, type InstrumentOverride } from '@/lib/instrument-overrides';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface ClinicalInstrument {
  name: string;
  shortName: string;
  category: string;
  items: number;
  duration: string;
  languages: string[];
  indianNormsStatus: 'Available' | 'In Progress' | 'Licensed';
  severityCutoffs: string;
  tier: number;
}

const instruments: ClinicalInstrument[] = [];

const normsStatusStyles: Record<ClinicalInstrument['indianNormsStatus'], { variant: 'success' | 'warning' | 'info'; label: string }> = {
  'Available':   { variant: 'success', label: 'Indian Norms Available' },
  'In Progress': { variant: 'warning', label: 'Indian Norms In Progress' },
  'Licensed':    { variant: 'info', label: 'Licensed / Indian Norms' },
};

const tierColors: Record<number, string> = {
  1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  3: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

async function loadUserInstrumentsForVertical(vertical: string): Promise<ClinicalInstrument[]> {
  try {
    const { questionnairesApi } = await import('@/lib/api');
    const list = await questionnairesApi.list(vertical);
    return list.map((i): ClinicalInstrument => ({
      name: i.name || i.shortName || 'Untitled',
      shortName: i.shortName || (i.name ? String(i.name).split(' ')[0] : 'CUSTOM'),
      category: i.category || 'Custom Assessment',
      items: Array.isArray(i.questions) ? i.questions.length : 0,
      duration: i.duration ? `${i.duration} min` : '—',
      languages: Array.isArray(i.languages) ? i.languages.map((c) => c.toUpperCase()) : ['EN'],
      indianNormsStatus: 'In Progress',
      severityCutoffs: i.description || 'Custom-authored scoring — review results with the administrator.',
      tier: typeof i.tier === 'string' ? parseInt(i.tier.replace('T', ''), 10) || 1 : 1,
    }));
  } catch {
    return [];
  }
}

export default function ClinicalInstrumentsPage() {
  const [search, setSearch] = useState('');
  const [overrides, setOverrides] = useState<Record<string, InstrumentOverride>>({});
  const [userInstruments, setUserInstruments] = useState<ClinicalInstrument[]>([]);
  const [editing, setEditing] = useState<ClinicalInstrument | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', category: '', items: 0, duration: '',
    languages: '', severityCutoffs: '', tier: 1,
  });

  useEffect(() => {
    setOverrides(loadOverrides());
    loadUserInstrumentsForVertical('CLINICAL').then(setUserInstruments).catch(() => setUserInstruments([]));
  }, []);

  const mergedInstruments = useMemo(() => {
    const seenShort = new Set(instruments.map((i) => i.shortName.toLowerCase()));
    const uniqueUser = userInstruments.filter((u) => !seenShort.has(u.shortName.toLowerCase()));
    return [...uniqueUser, ...instruments].map((i) => applyOverride(i as any, overrides) as ClinicalInstrument);
  }, [overrides, userInstruments]);

  const toStr = (v: unknown): string => (v == null ? '' : String(v)).toLowerCase();
  const query = search.trim().toLowerCase();
  const filtered = !query
    ? mergedInstruments
    : mergedInstruments.filter((inst) => {
        const hay = [inst?.name, inst?.shortName, inst?.category, inst?.severityCutoffs]
          .map(toStr).join(' ');
        return hay.includes(query);
      });

  const openEdit = (inst: ClinicalInstrument) => {
    setEditing(inst);
    setEditForm({
      name: inst.name,
      category: inst.category,
      items: inst.items,
      duration: inst.duration,
      languages: inst.languages.join(', '),
      severityCutoffs: inst.severityCutoffs,
      tier: inst.tier,
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const patch: InstrumentOverride & { severityCutoffs?: string } = {
      name: editForm.name.trim() || editing.name,
      category: editForm.category.trim(),
      items: Number(editForm.items) || 0,
      duration: editForm.duration.trim(),
      languages: editForm.languages.split(',').map((s) => s.trim()).filter(Boolean),
      tier: Number(editForm.tier) || 1,
    };
    (patch as any).severityCutoffs = editForm.severityCutoffs.trim();
    setOverrides(saveOverride(editing.shortName || editing.name, patch));
    setEditing(null);
  };

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
            <span className="text-foreground font-medium">Clinical</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            Clinical Questionnaires
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Standardised screening and assessment tools for clinical psychology practice with Indian norms.
          </p>
        </div>
        <Badge variant="primary" appearance="light" size="lg">
          <Stethoscope className="h-3.5 w-3.5" />
          Clinical Vertical
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Clinical Questionnaires', value: '8', icon: ListChecks, change: 'Screening & assessment' },
          { label: 'With Indian Norms', value: '6', icon: Globe, change: '2 in progress / licensed' },
          { label: 'Languages Covered', value: '7', icon: Brain, change: 'EN, HI, TA, BN, MR, KN, TE' },
          { label: 'Risk-Flag Items', value: '4', icon: AlertTriangle, change: 'PHQ-9 Item 9, PCL-5 items' },
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
                  stat.label === 'Risk-Flag Items' ? 'bg-destructive/10' : 'bg-primary/10'
                )}>
                  <stat.icon className={cn(
                    'h-5 w-5',
                    stat.label === 'Risk-Flag Items' ? 'text-destructive' : 'text-primary'
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search clinical questionnaires..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onInput={(e) => setSearch((e.currentTarget as HTMLInputElement).value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} clinical questionnaire{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Instrument Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Stethoscope className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">No questionnaires found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search query.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((inst, idx) => {
            const normsStyle = normsStatusStyles[inst.indianNormsStatus];
            return (
              <Card
                key={`${inst.name}-${inst.shortName}-${idx}`}
                className="hover:shadow-md transition-shadow flex flex-col"
              >
                <CardContent className="p-5 flex flex-col flex-1 gap-3.5">
                  {/* Top badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      Clinical
                    </span>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium bg-secondary text-secondary-foreground">
                      {inst.category}
                    </span>
                    <span className={cn(
                      'ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold',
                      tierColors[inst.tier],
                    )}>
                      T{inst.tier}
                    </span>
                  </div>

                  {/* Name */}
                  <h3 className="text-sm font-semibold leading-snug">{inst.name}</h3>

                  {/* Indian Norms Status */}
                  <Badge variant={normsStyle.variant} appearance="light" size="sm">
                    <CheckCircle2 className="h-3 w-3" />
                    {normsStyle.label}
                  </Badge>

                  {/* Key info */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <ListChecks className="h-3.5 w-3.5 shrink-0" />
                      <span>{inst.items} items</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>{inst.duration}</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Globe className="h-3.5 w-3.5 shrink-0" />
                      <span>{inst.languages.join(', ')}</span>
                    </div>
                  </div>

                  {/* Severity Cutoffs */}
                  <div className="rounded-md bg-muted/50 border border-border px-3 py-2">
                    <p className="text-[0.6875rem] font-medium text-muted-foreground mb-0.5">Severity Cutoffs</p>
                    <p className="text-xs text-foreground leading-relaxed">{inst.severityCutoffs}</p>
                  </div>

                  {/* Action */}
                  <div className="mt-auto pt-1 flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.location.href = `/assessments/create?instrument=${encodeURIComponent(inst.shortName || inst.name)}`}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Allot Assessment
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(inst)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditing(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Edit Questionnaire</CardTitle>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">Short name: <span className="font-mono">{editing.shortName}</span></div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Category</label>
                  <input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Duration</label>
                  <input value={editForm.duration} onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Items</label>
                  <input type="number" value={editForm.items} onChange={(e) => setEditForm({ ...editForm, items: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tier</label>
                  <select value={editForm.tier} onChange={(e) => setEditForm({ ...editForm, tier: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                    {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>T{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Languages (comma-separated)</label>
                <input value={editForm.languages} onChange={(e) => setEditForm({ ...editForm, languages: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Severity Cutoffs</label>
                <textarea rows={2} value={editForm.severityCutoffs} onChange={(e) => setEditForm({ ...editForm, severityCutoffs: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
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
