import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
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
import { portalSessionsApi, respondentsApi, questionnairesApi, groupsApi, verticalsApi, API_BASE, type Group } from '@/lib/api';
import { Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Vertical is a free-form string so user-created verticals (from Question
// Bank → Create Questionnaire) flow through the dropdown automatically. The
// page seeds the four built-ins below and merges in /verticals on mount.
type Vertical = string;
const BUILTIN_VERTICALS: Vertical[] = ['Clinical', 'Industrial', 'Counselling', 'Experiments'];

interface QuestionnaireOption {
  name: string;
  vertical: Vertical;
  items: number;
  duration: string;
}

// Catalog covers every instrument shown across the Library pages
// (Clinical, Industrial, Counselling) plus Experiments — merged with
// user-published assessments from localStorage on mount.
const catalogQuestionnaires: QuestionnaireOption[] = [
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

// Map a stored vertical (could be a built-in keyword OR an arbitrary user
// vertical code/name) to the display string used in the dropdown.
//   - Built-in prefixes ("clin", "indust", "coun", "exper") canonicalise to
//     their pretty names so existing data still groups correctly.
//   - Anything else is returned untouched (case preserved) so a user vertical
//     named "Education" stays "Education".
function normalizeVertical(v: unknown): Vertical {
  const raw = String(v || '').trim();
  if (!raw) return 'Clinical';
  const lower = raw.toLowerCase();
  if (lower.startsWith('clin')) return 'Clinical';
  if (lower.startsWith('indust')) return 'Industrial';
  if (lower.startsWith('coun')) return 'Counselling';
  if (lower.startsWith('exper')) return 'Experiments';
  return raw;
}

export default function CreateSessionPage() {
  const [assessmentName, setAssessmentName] = useState<string>('');
  const [vertical, setVertical] = useState<string>('all');
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<string>('');
  const [respondentSearch, setRespondentSearch] = useState('');
  const [selectedRespondent, setSelectedRespondent] = useState<string>('');
  const [assignMode, setAssignMode] = useState<'respondent' | 'group'>('respondent');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [groupSearch, setGroupSearch] = useState('');
  const [language, setLanguage] = useState('English');
  const [consentId, setConsentId] = useState('');
  const [proctoring, setProctoring] = useState(false);
  const [respondents, setRespondents] = useState<RespondentRow[]>([]);
  const [questionnaireList, setQuestionnaireList] = useState<QuestionnaireOption[]>(catalogQuestionnaires);
  // Loaded from /verticals so user-created verticals show up in the
  // "Vertical" dropdown without requiring a code change.
  const [verticalCatalog, setVerticalCatalog] = useState<Array<{ code: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Collects which catalog fetches failed so we can surface a single banner
  // rather than leaving dropdowns silently empty.
  const [loadFailures, setLoadFailures] = useState<string[]>([]);
  const noteFailure = (what: string, err: unknown) => {
    console.error(`[create-assessment] failed to load ${what}:`, err);
    setLoadFailures((prev) => (prev.includes(what) ? prev : [...prev, what]));
  };

  // Load respondents + instrument catalog from localStorage and backend,
  // then pre-select instrument from ?instrument= query param.
  useEffect(() => {
    (async () => {
      try {
        const list = await respondentsApi.list();
        if (Array.isArray(list)) {
          setRespondents(list.map((r) => ({ id: r.id, name: r.name, email: r.email })));
        }
      } catch (e) { noteFailure('respondents', e); }
    })();

    (async () => {
      try {
        const list = await verticalsApi.list();
        if (Array.isArray(list)) setVerticalCatalog(list);
      } catch (e) { noteFailure('verticals', e); }
    })();

    (async () => {
      try {
        const list = await groupsApi.list();
        if (Array.isArray(list)) setGroups(list);
      } catch (e) { noteFailure('groups', e); }
    })();

    // Merge catalog with published questionnaires from the database
    let merged: QuestionnaireOption[] = [...catalogQuestionnaires];
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
      } catch (e) { noteFailure('published questionnaires', e); }
      const seen = new Set<string>();
      merged = merged.filter((i) => {
        const key = i.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setQuestionnaireList(merged);
    })();

    // Optional: also surface built-in /instruments endpoint rows (if any exist there)
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/questionnaires-catalog`);
        if (!res.ok) {
          // 404/5xx here is non-fatal — the catalog mirror is optional.
          console.warn(`[create-assessment] /questionnaires-catalog returned ${res.status}`);
          return;
        }
        const data = await res.json();
        const list: any[] = Array.isArray(data) ? data : (data.instruments || []);
        if (list.length === 0) return;
        setQuestionnaireList((prev) => {
          const existing = new Set(prev.map((i) => i.name.toLowerCase()));
          const add: QuestionnaireOption[] = [];
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
      } catch (e) {
        // Catalog mirror failure shouldn't block the page; just log it.
        console.warn('[create-assessment] catalog mirror fetch failed:', e);
      }
    })();

    // Pre-select questionnaire from ?questionnaire= query param (with
    // ?instrument= as a back-compat alias for old bookmarks), matched
    // against the merged list.
    try {
      const params = new URLSearchParams(window.location.search);
      const qInst = params.get('questionnaire') || params.get('instrument');
      if (qInst) {
        const match = merged.find(
          (i) => i.name === qInst || i.name.toLowerCase().startsWith(qInst.toLowerCase()),
        );
        if (match) {
          setSelectedQuestionnaire(match.name);
          setVertical(match.vertical);
        } else {
          setSelectedQuestionnaire(qInst);
        }
      }
    } catch {}
  }, []);

  // Vertical dropdown options: built-ins + any vertical seen in the API
  // catalog or in the actual instruments we loaded (covers verticals just
  // created but not yet propagated to the catalog).
  const verticalOptions = useMemo<Vertical[]>(() => {
    const seen = new Set<string>(BUILTIN_VERTICALS);
    verticalCatalog.forEach((v) => {
      const norm = normalizeVertical(v.name || v.code);
      if (norm) seen.add(norm);
    });
    questionnaireList.forEach((i) => seen.add(i.vertical));
    return Array.from(seen);
  }, [verticalCatalog, questionnaireList]);

  const filteredQuestionnaires = questionnaireList.filter(
    (i) => vertical === 'all' || i.vertical === vertical
  );

  const filteredRespondents = respondents.filter(
    (r) =>
      respondentSearch === '' ||
      r.name.toLowerCase().includes(respondentSearch.toLowerCase()) ||
      r.email.toLowerCase().includes(respondentSearch.toLowerCase())
  );

  const selectedQuestionnaireData = questionnaireList.find((i) => i.name === selectedQuestionnaire);
  const selectedRespondentData = respondents.find((r) => r.id === selectedRespondent);
  const selectedGroupData = groups.find((g) => g.id === selectedGroup);
  const filteredGroups = groups.filter(
    (g) =>
      groupSearch === '' ||
      g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
      (g.description || '').toLowerCase().includes(groupSearch.toLowerCase())
  );

  // Verify a real questionnaire is published under this name. If not, fail
  // the allotment loudly instead of fabricating demo content — that was the
  // source of "my questions changed" bugs.
  const ensureQuestionnaireAvailable = async (name: string): Promise<boolean> => {
    try {
      const existing = await questionnairesApi.getByName(name);
      return !!(existing && existing.id);
    } catch {
      return false;
    }
  };

  const handleCreate = async (opts: { sendInvite?: boolean; copyLink?: boolean } = {}) => {
    const { sendInvite = false, copyLink = false } = opts;
    setError('');
    if (!selectedQuestionnaire) {
      setError('Please select a questionnaire.');
      return;
    }
    if (assignMode === 'respondent' && !selectedRespondent) {
      setError('Please select a respondent.');
      return;
    }
    if (assignMode === 'group') {
      if (!selectedGroup) { setError('Please select a group.'); return; }
      if (!selectedGroupData || selectedGroupData.memberIds.length === 0) {
        setError('The selected group has no members. Add respondents to it in Admin → Groups.');
        return;
      }
    }
    setSaving(true);
    try {
      const fullName = selectedQuestionnaireData?.name || selectedQuestionnaire;
      const vert = selectedQuestionnaireData?.vertical || 'Clinical';
      const isAvailable = await ensureQuestionnaireAvailable(fullName);
      if (!isAvailable) {
        setError(`"${fullName}" isn't published yet. Open Question Bank → Create Questionnaire to publish it before allotting.`);
        setSaving(false);
        return;
      }

      if (assignMode === 'group' && selectedGroupData) {
        // One session per member via bulk endpoint
        const sessions = selectedGroupData.memberIds
          .map((memberId) => respondents.find((r) => r.id === memberId))
          .filter((r): r is RespondentRow => !!r)
          .map((r) => ({
            id: `SESS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            name: assessmentName.trim(),
            respondentId: r.id,
            respondent: r.name,
            respondentEmail: r.email,
            instrument: fullName.split(' (')[0],
            instrumentFullName: fullName,
            vertical: vert,
            language,
            status: 'Active',
            score: '--',
            consentId,
            proctoring,
            groupId: selectedGroupData.id,
            groupName: selectedGroupData.name,
            invitationSent: sendInvite,
          }));
        if (sessions.length === 0) {
          setError('None of the group members match known respondents.');
          return;
        }
        const res = await portalSessionsApi.bulk(sessions);
        if (!res) throw new Error('Failed to create sessions via API');
        const errs = res.errors || [];
        if (res.created === 0 && errs.length > 0) {
          throw new Error(`No sessions created. First failure: ${errs[0].reason}`);
        }
        const failedNote = errs.length > 0
          ? ` (${errs.length} row${errs.length === 1 ? '' : 's'} skipped: ${errs[0].reason}${errs.length > 1 ? '; …' : ''})`
          : '';
        setCreated({ id: `${res.created} sessions for "${selectedGroupData.name}"${failedNote}` });
        if (copyLink) {
          try {
            const loginUrl = `${window.location.origin}/portal/login`;
            await navigator.clipboard.writeText(loginUrl);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 3000);
          } catch {
            setError('Sessions created, but failed to copy link to clipboard.');
          }
        }
        return;
      }

      const id = `SESS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const entry = {
        id,
        name: assessmentName.trim(),
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
            onClick={() => { window.location.href = '/assessments'; }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Assessments
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <a href="/assessments" className="hover:text-foreground transition-colors">Assessments</a>
          <span>/</span>
          <span className="text-foreground font-medium">Create</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Assessment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure and launch a new assessment for a respondent.
        </p>
      </div>

      {loadFailures.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Some catalog data couldn't load: {loadFailures.join(', ')}. Dropdowns may be incomplete — check that the API is reachable.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Vertical & Questionnaire */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="size-4 text-primary" />
                Select Questionnaire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Assessment Name <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  variant="md"
                  placeholder="e.g., Q1 2026 Depression Screening"
                  value={assessmentName}
                  onChange={(e) => setAssessmentName(e.target.value)}
                />
                <p className="text-[0.6875rem] text-muted-foreground mt-1">
                  A label shown alongside the auto-generated ID. Useful for batches or named campaigns.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Vertical</label>
                <Select value={vertical} onValueChange={setVertical}>
                  <SelectTrigger className="w-full" size="md">
                    <SelectValue placeholder="Select vertical" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Verticals</SelectItem>
                    {verticalOptions.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Questionnaire</label>
                <Select value={selectedQuestionnaire} onValueChange={setSelectedQuestionnaire}>
                  <SelectTrigger className="w-full" size="md">
                    <SelectValue placeholder="Choose a questionnaire" />
                  </SelectTrigger>
                  <SelectContent>
                    {vertical === 'all' ? (
                      <>
                        {verticalOptions.map((v) => {
                          const group = filteredQuestionnaires.filter((i) => i.vertical === v);
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
                      filteredQuestionnaires.map((inst) => (
                        <SelectItem key={inst.name} value={inst.name}>
                          {inst.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedQuestionnaireData && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <Badge size="sm" shape="circle" variant="info" appearance="light">
                    {selectedQuestionnaireData.items} items
                  </Badge>
                  <Badge size="sm" shape="circle" variant="secondary" appearance="light">
                    ~{selectedQuestionnaireData.duration}
                  </Badge>
                  <Badge size="sm" shape="circle" variant="primary" appearance="outline">
                    {selectedQuestionnaireData.vertical}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Respondent or Group */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {assignMode === 'group' ? <Users className="size-4 text-primary" /> : <User className="size-4 text-primary" />}
                Assign To
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => setAssignMode('respondent')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    assignMode === 'respondent' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <User className="inline size-3.5 -mt-0.5 mr-1" />
                  Single Respondent
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('group')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    assignMode === 'group' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="inline size-3.5 -mt-0.5 mr-1" />
                  Group
                </button>
              </div>

              {assignMode === 'respondent' ? (
                <>
                  <InputWrapper variant="md" className="w-full">
                    <Search className="size-4" />
                    <Input
                      placeholder="Search by name or email..."
                      value={respondentSearch}
                      onChange={(e) => setRespondentSearch(e.target.value)}
                    />
                  </InputWrapper>

                  <div className="border border-border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
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
                </>
              ) : (
                <>
                  <InputWrapper variant="md" className="w-full">
                    <Search className="size-4" />
                    <Input
                      placeholder="Search groups by name or description..."
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                    />
                  </InputWrapper>

                  <div className="border border-border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                    {filteredGroups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedGroup(g.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-sm text-left border-b border-border last:border-0 transition-colors ${
                          selectedGroup === g.id
                            ? 'bg-primary/5 text-primary'
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{g.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {g.memberIds.length} member{g.memberIds.length !== 1 ? 's' : ''}
                            {g.description ? ` · ${g.description}` : ''}
                          </p>
                        </div>
                        {selectedGroup === g.id && (
                          <Badge size="sm" shape="circle" variant="success" appearance="light">Selected</Badge>
                        )}
                      </button>
                    ))}
                    {filteredGroups.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {groups.length === 0 ? 'No groups yet. Create one in Admin → Groups.' : 'No groups match your search.'}
                      </div>
                    )}
                  </div>
                  {selectedGroupData && (
                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                      A session will be created for each of the <strong className="text-foreground">{selectedGroupData.memberIds.length}</strong> member{selectedGroupData.memberIds.length !== 1 ? 's' : ''} of "{selectedGroupData.name}".
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="size-4 text-primary" />
                Assessment Settings
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
                Assessment Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium text-right max-w-[60%] truncate">
                    {assessmentName.trim() || <em className="text-muted-foreground font-normal">Untitled</em>}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Questionnaire</span>
                  <span className="font-medium text-right max-w-[60%] truncate">
                    {selectedQuestionnaireData?.name || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Vertical</span>
                  <span className="font-medium">
                    {selectedQuestionnaireData?.vertical || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Items</span>
                  <span className="font-medium">
                    {selectedQuestionnaireData?.items || '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">
                    {selectedQuestionnaireData ? `~${selectedQuestionnaireData.duration}` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">
                    {assignMode === 'group' ? 'Group' : 'Respondent'}
                  </span>
                  <span className="font-medium text-right max-w-[60%] truncate">
                    {assignMode === 'group'
                      ? selectedGroupData
                        ? `${selectedGroupData.name} (${selectedGroupData.memberIds.length})`
                        : '--'
                      : selectedRespondentData?.name || '--'}
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
                    Assessment <strong>{created.id}</strong> created.{' '}
                    {linkCopied && (
                      <>Login URL copied to clipboard. </>
                    )}
                    <a href="/assessments" className="underline">View in Assessments</a>
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
                  {saving
                    ? 'Creating...'
                    : assignMode === 'group' && selectedGroupData
                    ? `Create ${selectedGroupData.memberIds.length} Assessments`
                    : 'Create Assessment'}
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
