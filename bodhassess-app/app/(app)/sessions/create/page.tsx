'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ClipboardCheck,
  Eye,
  Languages,
  Link,
  Monitor,
  Search,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { portalSessionsApi, respondentsApi, questionnairesApi } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Vertical = 'Clinical' | 'Industrial' | 'Counselling' | 'Experiments';

interface InstrumentOption {
  name: string;
  vertical: Vertical;
  items: number;
  duration: string;
}

// Catalog covers every instrument shown across the Library pages
// (Clinical, Industrial, Counselling) plus Experiments — merged with
// user-published assessments from localStorage on mount.
const catalogInstruments: InstrumentOption[] = [
  // Clinical
  { name: 'PHQ-9 (Patient Health Questionnaire)', vertical: 'Clinical', items: 9, duration: '5 min' },
  { name: 'PHQ-2 (Ultra-Brief Depression Screen)', vertical: 'Clinical', items: 2, duration: '2 min' },
  { name: 'GAD-7 (Generalized Anxiety Disorder)', vertical: 'Clinical', items: 7, duration: '4 min' },
  { name: 'DASS-21 (Depression Anxiety Stress)', vertical: 'Clinical', items: 21, duration: '10 min' },
  { name: 'Beck BDI-II (Beck Depression Inventory)', vertical: 'Clinical', items: 21, duration: '10 min' },
  { name: 'Beck Anxiety Inventory (BAI)', vertical: 'Clinical', items: 21, duration: '10 min' },
  { name: 'PCL-5 (PTSD Checklist)', vertical: 'Clinical', items: 20, duration: '10 min' },
  { name: 'AUDIT (Alcohol Use Disorders Test)', vertical: 'Clinical', items: 10, duration: '5 min' },
  { name: 'SCID-5 (Structured Clinical Interview)', vertical: 'Clinical', items: 45, duration: '30 min' },
  // Industrial
  { name: 'Big Five Personality (IPIP-NEO-120)', vertical: 'Industrial', items: 120, duration: '25 min' },
  { name: 'HEXACO Personality Inventory', vertical: 'Industrial', items: 100, duration: '20 min' },
  { name: 'Learning Agility Assessment', vertical: 'Industrial', items: 80, duration: '18 min' },
  { name: 'Situational Judgment Tests (SJTs)', vertical: 'Industrial', items: 40, duration: '30 min' },
  { name: 'Cognitive Aptitude Battery (CAB)', vertical: 'Industrial', items: 60, duration: '35 min' },
  { name: 'AI Adaptability Index', vertical: 'Industrial', items: 56, duration: '20 min' },
  { name: 'Digital Diet Assessment', vertical: 'Industrial', items: 45, duration: '15 min' },
  // Counselling & Child
  { name: "Spence Children's Anxiety Scale (SCAS)", vertical: 'Counselling', items: 45, duration: '15 min' },
  { name: "Children's Depression Inventory-2 (CDI-2)", vertical: 'Counselling', items: 28, duration: '12 min' },
  { name: 'ADHD Rating Scale-5', vertical: 'Counselling', items: 18, duration: '10 min' },
  { name: 'Developmental Milestones Tracker', vertical: 'Counselling', items: 60, duration: '20 min' },
  { name: 'School Adjustment Scale', vertical: 'Counselling', items: 35, duration: '12 min' },
  { name: 'Academic Stress Inventory', vertical: 'Counselling', items: 40, duration: '15 min' },
  { name: 'SDQ (Strengths & Difficulties)', vertical: 'Counselling', items: 25, duration: '10 min' },
  { name: 'Career Interest Inventory (CII)', vertical: 'Counselling', items: 60, duration: '20 min' },
  // Experiments
  { name: 'Digital Literacy Assessment', vertical: 'Experiments', items: 24, duration: '12 min' },
];

const languages = [
  'English', 'Hindi', 'Bengali', 'Telugu', 'Marathi',
  'Tamil', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi',
];

interface RespondentRow {
  id: string;
  name: string;
  email: string;
}

const seedRespondents: RespondentRow[] = [
  { id: 'R-001', name: 'Arjun Patel', email: 'arjun.p@gmail.com' },
  { id: 'R-002', name: 'Priya Sharma', email: 'priya.s@outlook.com' },
  { id: 'R-003', name: 'Rahul Verma', email: 'rahul.v@yahoo.com' },
  { id: 'R-004', name: 'Ananya Reddy', email: 'ananya.r@gmail.com' },
  { id: 'R-005', name: 'Vikram Singh', email: 'vikram.s@hotmail.com' },
  { id: 'R-006', name: 'Deepa Menon', email: 'deepa.m@gmail.com' },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

function normalizeVertical(v: unknown): Vertical {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('indust')) return 'Industrial';
  if (s.startsWith('coun')) return 'Counselling';
  if (s.startsWith('exper')) return 'Experiments';
  return 'Clinical';
}

export default function CreateSessionPage() {
  const [vertical, setVertical] = useState<string>('all');
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [respondentSearch, setRespondentSearch] = useState('');
  const [selectedRespondent, setSelectedRespondent] = useState<string>('');
  const [language, setLanguage] = useState('English');
  const [consentId, setConsentId] = useState('');
  const [proctoring, setProctoring] = useState(false);
  const [respondents, setRespondents] = useState<RespondentRow[]>(seedRespondents);
  const [instrumentList, setInstrumentList] = useState<InstrumentOption[]>(catalogInstruments);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load respondents + instrument catalog from localStorage and backend,
  // then pre-select instrument from ?instrument= query param.
  useEffect(() => {
    (async () => {
      try {
        const list = await respondentsApi.list();
        if (Array.isArray(list) && list.length > 0) {
          setRespondents(list.map((r) => ({ id: r.id, name: r.name, email: r.email })));
        }
      } catch {}
    })();

    // Merge catalog with published questionnaires from the database
    let merged: InstrumentOption[] = [...catalogInstruments];
    (async () => {
      try {
        const list = await questionnairesApi.list();
        list.forEach((i) => {
          const name: string = i.name || i.shortName || '';
          if (!name) return;
          const items = Array.isArray(i.questions) ? i.questions.length : 0;
          const duration = i.duration ? `${i.duration} min` : '—';
          merged.push({ name, vertical: normalizeVertical(i.vertical), items, duration });
        });
      } catch {}
      const seen = new Set<string>();
      merged = merged.filter((i) => {
        const key = i.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setInstrumentList(merged);
    })();

    // Optional: also surface built-in /instruments endpoint rows (if any exist there)
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/instruments`);
        if (!res.ok) return;
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : (data.instruments || []);
        if (list.length === 0) return;
        setInstrumentList((prev) => {
          const existing = new Set(prev.map((i) => i.name.toLowerCase()));
          const add: InstrumentOption[] = [];
          list.forEach((i) => {
            const name: string = i.name || i.short_name;
            if (!name || existing.has(name.toLowerCase())) return;
            add.push({
              name,
              vertical: normalizeVertical(i.vertical),
              items: i.item_count ?? i.items ?? 0,
              duration: i.duration_minutes ? `${i.duration_minutes} min` : '—',
            });
          });
          return add.length ? [...prev, ...add] : prev;
        });
      } catch {}
    })();

    // Pre-select instrument from ?instrument= query param, matched against the merged list
    try {
      const params = new URLSearchParams(window.location.search);
      const qInst = params.get('instrument');
      if (qInst) {
        const match = merged.find(
          (i) => i.name === qInst || i.name.toLowerCase().startsWith(qInst.toLowerCase()),
        );
        if (match) {
          setSelectedInstrument(match.name);
          setVertical(match.vertical);
        } else {
          setSelectedInstrument(qInst);
        }
      }
    } catch {}
  }, []);

  const filteredInstruments = instrumentList.filter(
    (i) => vertical === 'all' || i.vertical === vertical
  );

  const filteredRespondents = respondents.filter(
    (r) =>
      respondentSearch === '' ||
      r.name.toLowerCase().includes(respondentSearch.toLowerCase()) ||
      r.email.toLowerCase().includes(respondentSearch.toLowerCase())
  );

  const selectedInstrumentData = instrumentList.find((i) => i.name === selectedInstrument);
  const selectedRespondentData = respondents.find((r) => r.id === selectedRespondent);

  // Ensure a playable questionnaire exists in Postgres for the chosen catalog
  // name. If nobody has published it via Create Questionnaire yet, seed a
  // demo Likert-5 questionnaire so Launch works end-to-end.
  const ensureInstrumentAvailable = async (name: string, vert: string) => {
    try {
      const existing = await questionnairesApi.getByName(name).catch(() => null);
      if (existing && existing.id) return;
    } catch {}

    const mqtId = 'mqt-' + Math.random().toString(36).slice(2, 10);
    const mqId = 'mq-' + Math.random().toString(36).slice(2, 10);
    const likert = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
    const stems = [
      `I have felt this statement applies to me over the past two weeks.`,
      `I find it easy to respond calmly under pressure.`,
      `I can concentrate on tasks without getting distracted.`,
      `I feel confident about the way I make decisions.`,
      `I generally feel positive about my day-to-day life.`,
    ];
    const questions = stems.map((stem, qi) => ({
      id: `q-${qi + 1}-${Math.random().toString(36).slice(2, 7)}`,
      stem: `(${name}) ${stem}`,
      format: 'LIKERT',
      media_url: '',
      media_type: 'none',
      clinical_risk_flag: false,
      risk_flag_rule: '',
      options: likert.map((text, oi) => ({
        text,
        scores: [{ mqt_id: mqtId, score: oi }],
      })),
    }));

    try {
      await questionnairesApi.upsert({
        id: 'demo-' + Math.random().toString(36).slice(2, 10),
        name,
        shortName: name.split(' ')[0],
        vertical: vert.toUpperCase(),
        category: '',
        description: 'Demo assessment generated for flow testing. Replace via Question Bank → Create Questionnaire.',
        duration: 5,
        tier: 'T1',
        languages: ['en'],
        mqs: [{ id: mqId, name: 'General', mqts: [{ id: mqtId, name: name }] }],
        questions: questions as any,
        isDemo: true,
      });
    } catch {}
  };

  const handleCreate = async (opts: { sendInvite?: boolean; copyLink?: boolean } = {}) => {
    const { sendInvite = false, copyLink = false } = opts;
    setError('');
    if (!selectedInstrument) {
      setError('Please select an instrument.');
      return;
    }
    if (!selectedRespondent) {
      setError('Please select a respondent.');
      return;
    }
    setSaving(true);
    try {
      const fullName = selectedInstrumentData?.name || selectedInstrument;
      const vert = selectedInstrumentData?.vertical || 'Clinical';
      await ensureInstrumentAvailable(fullName, vert);

      const id = `SESS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const entry = {
        id,
        respondentId: selectedRespondentData?.id || '',
        respondent: selectedRespondentData?.name || '',
        respondentEmail: selectedRespondentData?.email || '',
        instrument: fullName.split(' (')[0],
        instrumentFullName: fullName,
        vertical: vert,
        language,
        status: 'Active',
        score: '--',
        consentId,
        proctoring,
        invitationSent: sendInvite,
      };
      const res = await portalSessionsApi.create(entry);
      if (!res) throw new Error('Failed to create session via API');
      setCreated({ id });
      if (copyLink) {
        try {
          const loginUrl = `${window.location.origin}/portal/login`;
          await navigator.clipboard.writeText(loginUrl);
          setLinkCopied(true);
          setTimeout(() => setLinkCopied(false), 3000);
        } catch {
          setError('Session created, but failed to copy link to clipboard.');
        }
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to create session — is the API running?');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button
            onClick={() => { window.location.href = '/sessions'; }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Sessions
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <a href="/sessions" className="hover:text-foreground transition-colors">Sessions</a>
          <span>/</span>
          <span className="text-foreground font-medium">Create</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Session</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and launch a new assessment session for a respondent.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Vertical & Instrument */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="size-4 text-primary" />
                Select Instrument
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Vertical</label>
                <Select value={vertical} onValueChange={setVertical}>
                  <SelectTrigger className="w-full" size="md">
                    <SelectValue placeholder="Select vertical" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Verticals</SelectItem>
                    <SelectItem value="Clinical">Clinical Psychology</SelectItem>
                    <SelectItem value="Industrial">Industrial Psychology</SelectItem>
                    <SelectItem value="Counselling">Counselling &amp; Child</SelectItem>
                    <SelectItem value="Experiments">Designing Experiments</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Instrument</label>
                <Select value={selectedInstrument} onValueChange={setSelectedInstrument}>
                  <SelectTrigger className="w-full" size="md">
                    <SelectValue placeholder="Choose an instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    {vertical === 'all' ? (
                      <>
                        {(['Clinical', 'Industrial', 'Counselling', 'Experiments'] as Vertical[]).map((v) => {
                          const group = filteredInstruments.filter((i) => i.vertical === v);
                          if (group.length === 0) return null;
                          return (
                            <div key={v}>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                {v}
                              </div>
                              {group.map((inst) => (
                                <SelectItem key={inst.name} value={inst.name}>
                                  {inst.name}
                                </SelectItem>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      filteredInstruments.map((inst) => (
                        <SelectItem key={inst.name} value={inst.name}>
                          {inst.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedInstrumentData && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <Badge size="sm" shape="circle" variant="info" appearance="light">
                    {selectedInstrumentData.items} items
                  </Badge>
                  <Badge size="sm" shape="circle" variant="secondary" appearance="light">
                    ~{selectedInstrumentData.duration}
                  </Badge>
                  <Badge size="sm" shape="circle" variant="primary" appearance="outline">
                    {selectedInstrumentData.vertical}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Respondent */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="size-4 text-primary" />
                Select Respondent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InputWrapper variant="md" className="w-full">
                <Search className="size-4" />
                <Input
                  placeholder="Search by name or email..."
                  value={respondentSearch}
                  onChange={(e) => setRespondentSearch(e.target.value)}
                />
              </InputWrapper>

              <div className="border border-border rounded-lg overflow-hidden">
                {filteredRespondents.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRespondent(r.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm text-left border-b border-border last:border-0 transition-colors ${
                      selectedRespondent === r.id
                        ? 'bg-primary/5 text-primary'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </div>
                    {selectedRespondent === r.id && (
                      <Badge size="sm" shape="circle" variant="success" appearance="light">Selected</Badge>
                    )}
                  </button>
                ))}
                {filteredRespondents.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No respondents found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="size-4 text-primary" />
                Session Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <Languages className="size-3.5 text-muted-foreground" />
                    Delivery Language
                  </label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="w-full" size="md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-muted-foreground" />
                    Consent Record ID
                  </label>
                  <Input
                    variant="md"
                    placeholder="e.g. CONSENT-2026-0012"
                    value={consentId}
                    onChange={(e) => setConsentId(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Proctoring</p>
                  <p className="text-xs text-muted-foreground">
                    Enable webcam and screen monitoring during assessment
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProctoring(!proctoring)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    proctoring ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      proctoring ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Panel */}
        <div className="space-y-5">
          <Card className="sticky top-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="size-4 text-primary" />
                Session Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Instrument</span>
                  <span className="font-medium text-right max-w-[60%] truncate">
                    {selectedInstrumentData?.name || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Vertical</span>
                  <span className="font-medium">
                    {selectedInstrumentData?.vertical || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Items</span>
                  <span className="font-medium">
                    {selectedInstrumentData?.items || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">
                    {selectedInstrumentData ? `~${selectedInstrumentData.duration}` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Respondent</span>
                  <span className="font-medium">
                    {selectedRespondentData?.name || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Language</span>
                  <span className="font-medium">{language}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Consent ID</span>
                  <span className="font-medium font-mono text-xs">
                    {consentId || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Proctoring</span>
                  <Badge
                    size="sm"
                    shape="circle"
                    variant={proctoring ? 'success' : 'secondary'}
                    appearance="light"
                  >
                    {proctoring ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {created && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400">
                  <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Session <strong>{created.id}</strong> created.{' '}
                    {linkCopied && (
                      <>Login URL copied to clipboard. </>
                    )}
                    <a href="/sessions" className="underline">View in Sessions</a>
                  </span>
                </div>
              )}
              <div className="space-y-2 pt-2">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  disabled={saving}
                  onClick={() => handleCreate({})}
                >
                  <ClipboardCheck className="size-4" />
                  {saving ? 'Creating...' : 'Create Session'}
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  className="w-full"
                  disabled={saving}
                  onClick={() => handleCreate({ sendInvite: true })}
                >
                  <Send className="size-4" />
                  Create &amp; Send Invitation
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  className="w-full"
                  disabled={saving}
                  onClick={() => handleCreate({ copyLink: true })}
                >
                  <Link className="size-4" />
                  {linkCopied ? 'Link copied!' : 'Create & Copy Link'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
