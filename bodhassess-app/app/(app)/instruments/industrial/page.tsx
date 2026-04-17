'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Briefcase,
  Clock,
  Globe,
  Hash,
  Search,
  BarChart3,
  ShieldCheck,
  Pencil,
  X,
} from 'lucide-react';
import { loadOverrides, saveOverride, applyOverrideById, type InstrumentOverride } from '@/lib/instrument-overrides';

const instruments = [
  {
    id: 'big5',
    name: 'Big Five Personality (IPIP-NEO-120)',
    category: 'Personality',
    items: 120,
    duration: '25 min',
    languages: ['EN', 'HI', 'TA', 'TE', 'MR', 'KN'],
    tier: 'T1',
    norms: 'Indian working population norms by industry sector and function',
    description: 'Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism. Role-specific profiles for selection and development.',
  },
  {
    id: 'hexaco',
    name: 'HEXACO Personality Inventory',
    category: 'Personality',
    items: 100,
    duration: '20 min',
    languages: ['EN', 'HI'],
    tier: 'T1',
    norms: 'Indian professional population norms. BFSI, government, healthcare sector norms',
    description: 'Six dimensions including Honesty-Humility — more predictive for integrity-critical roles.',
  },
  {
    id: 'learning-agility',
    name: 'Learning Agility Assessment',
    category: 'Development',
    items: 80,
    duration: '18 min',
    languages: ['EN', 'HI', 'TA', 'TE'],
    tier: 'T2',
    norms: 'Indian managerial population norms. HiPo identification cutoffs by level',
    description: 'Mental agility, people agility, change agility, results agility, self-awareness. Normed for leadership selection.',
  },
  {
    id: 'sjt',
    name: 'Situational Judgment Tests (SJTs)',
    category: 'Behavioral',
    items: 40,
    duration: '30 min',
    languages: ['EN', 'HI'],
    tier: 'T2',
    norms: 'Industry-specific norms. Concurrent validity against job performance studies',
    description: 'Role-specific: sales, customer service, people management, analytical roles. Behavioural tendency scoring.',
  },
  {
    id: 'cab',
    name: 'Cognitive Aptitude Battery',
    category: 'Aptitude',
    items: 60,
    duration: '35 min',
    languages: ['EN', 'HI', 'TA', 'TE', 'MR'],
    tier: 'T1',
    norms: 'Indian graduate and post-graduate population norms. Score bands by educational level',
    description: 'Verbal reasoning, numerical reasoning, abstract reasoning, spatial reasoning, attention to detail.',
  },
  {
    id: 'ai-adapt',
    name: 'AI Adaptability Index',
    category: 'AI Readiness',
    items: 56,
    duration: '20 min',
    languages: ['EN', 'HI'],
    tier: 'T3',
    norms: 'Validation study in progress — target n=5,000. Phase 1: pilot with early adopters',
    description: '7 dimensions: AI Trust Calibration, Cognitive Flexibility, Collaboration Orientation, AI Anxiety, Prompt Thinking, Critical Evaluation, Ethical AI Orientation.',
  },
  {
    id: 'digital-diet',
    name: 'Digital Diet Assessment',
    category: 'Wellbeing',
    items: 45,
    duration: '15 min',
    languages: ['EN', 'HI'],
    tier: 'T2',
    norms: 'Initial norms from pilot organisations. CBT-based intervention trigger built in',
    description: '5 dimensions: Screen Time Volume, Problematic Use Patterns, Cognitive Impact, Social Displacement, Physical Impact.',
  },
];

const tierColors: Record<string, string> = {
  T1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  T2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  T3: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

type IndInstrument = typeof instruments[number];

function loadUserInstrumentsForVertical(vertical: string): IndInstrument[] {
  try {
    const raw = localStorage.getItem('bodhassess.instruments');
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((i: any) => String(i.vertical || '').toUpperCase() === vertical.toUpperCase())
      .map((i: any): IndInstrument => ({
        id: i.id || `custom-${(i.name || 'x').toLowerCase().replace(/\s+/g, '-')}`,
        name: i.name || i.shortName || 'Untitled',
        category: i.category || 'Custom Assessment',
        items: Array.isArray(i.questions) ? i.questions.length : (i.items || 0),
        duration: i.duration ? `${i.duration} min` : '—',
        languages: Array.isArray(i.languages) ? i.languages.map((c: string) => String(c).toUpperCase()) : ['EN'],
        tier: typeof i.tier === 'string' ? i.tier : `T${i.tier || 1}`,
        norms: i.norms || 'Custom-authored — no standard norms applied.',
        description: i.description || 'User-published assessment.',
      }));
  } catch {
    return [];
  }
}

export default function IndustrialInstrumentsPage() {
  const [search, setSearch] = useState('');
  const [overrides, setOverrides] = useState<Record<string, InstrumentOverride>>({});
  const [userInstruments, setUserInstruments] = useState<IndInstrument[]>([]);
  const [editing, setEditing] = useState<IndInstrument | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', category: '', items: 0, duration: '',
    languages: '', tier: 'T1', norms: '', description: '',
  });

  useEffect(() => {
    setOverrides(loadOverrides());
    setUserInstruments(loadUserInstrumentsForVertical('INDUSTRIAL'));
  }, []);

  const mergedInstruments = useMemo(() => {
    const seenIds = new Set(instruments.map((i) => i.id));
    const uniqueUser = userInstruments.filter((u) => !seenIds.has(u.id));
    return [...uniqueUser, ...instruments].map((i) => applyOverrideById(i, overrides));
  }, [overrides, userInstruments]);

  const filtered = useMemo(() => {
    if (!search) return mergedInstruments;
    const q = search.toLowerCase();
    return mergedInstruments.filter(
      (i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q),
    );
  }, [search, mergedInstruments]);

  const openEdit = (inst: IndInstrument) => {
    setEditing(inst);
    setEditForm({
      name: inst.name,
      category: inst.category,
      items: inst.items,
      duration: inst.duration,
      languages: inst.languages.join(', '),
      tier: inst.tier,
      norms: inst.norms,
      description: inst.description,
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const patch: any = {
      name: editForm.name.trim() || editing.name,
      category: editForm.category.trim(),
      items: Number(editForm.items) || 0,
      duration: editForm.duration.trim(),
      languages: editForm.languages.split(',').map((s) => s.trim()).filter(Boolean),
      tier: editForm.tier,
      norms: editForm.norms.trim(),
      description: editForm.description.trim(),
    };
    setOverrides(saveOverride(editing.id, patch));
    setEditing(null);
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Instruments</span><span>/</span>
          <span className="text-foreground font-medium">Industrial Psychology</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Industrial Instruments</h1>
            <p className="text-sm text-muted-foreground mt-1">Validated psychometric batteries for talent selection, development, and AI readiness.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <Card><CardContent className="p-5 text-center"><p className="text-2xl font-semibold">{instruments.length}</p><p className="text-xs text-muted-foreground mt-1">Instruments</p></CardContent></Card>
        <Card><CardContent className="p-5 text-center"><p className="text-2xl font-semibold">5</p><p className="text-xs text-muted-foreground mt-1">Categories</p></CardContent></Card>
        <Card><CardContent className="p-5 text-center"><p className="text-2xl font-semibold">6</p><p className="text-xs text-muted-foreground mt-1">Languages</p></CardContent></Card>
        <Card><CardContent className="p-5 text-center"><p className="text-2xl font-semibold">AI Proctoring</p><p className="text-xs text-muted-foreground mt-1">Default for Selection</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search instruments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-10 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((inst) => (
          <Card key={inst.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Briefcase className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Industrial
                  </span>
                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tierColors[inst.tier])}>
                    {inst.tier}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm">{inst.name}</h3>
                <span className="inline-block mt-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{inst.category}</span>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">{inst.description}</p>

              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Hash className="h-3 w-3" />{inst.items} items</span>
                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />{inst.duration}</span>
                <span className="flex items-center gap-1.5"><Globe className="h-3 w-3" />{inst.languages.join(', ')}</span>
                <span className="flex items-center gap-1.5"><BarChart3 className="h-3 w-3" />IRT Scored</span>
              </div>

              <div className="border-t border-border pt-3">
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0 text-green-600" />
                  {inst.norms}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="primary" size="sm" className="flex-1" onClick={() => window.location.href = `/sessions/create?instrument=${encodeURIComponent(inst.name)}`}>Start Session</Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(inst)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditing(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Edit Instrument</CardTitle>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground">ID: <span className="font-mono">{editing.id}</span></div>
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
                  <select value={editForm.tier} onChange={(e) => setEditForm({ ...editForm, tier: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                    {['T1', 'T2', 'T3', 'T4', 'T5'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Languages (comma-separated)</label>
                <input value={editForm.languages} onChange={(e) => setEditForm({ ...editForm, languages: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Norms / Validation</label>
                <textarea rows={2} value={editForm.norms} onChange={(e) => setEditForm({ ...editForm, norms: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button variant="primary" onClick={saveEdit}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
