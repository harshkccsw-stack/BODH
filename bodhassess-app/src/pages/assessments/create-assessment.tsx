import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  ClipboardCheck,
  Search,
  User,
  Users as UsersIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  assessmentRecordsApi,
  entityRegistrationsApi,
  groupsApi,
  questionnaireRecordsApi,
  questionnaireVersionsApi,
  respondentsApi,
  type AssessmentEntityAllotment,
  type EntityRegistration,
  type Group,
  type QuestionnaireParent,
  type QuestionnaireVersionSummary,
  type Respondent,
} from '@/lib/api';

const LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Telugu', 'Marathi',
  'Tamil', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi',
];

export default function CreateAssessmentPage() {
  const [name, setName] = useState('');
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireParent[]>([]);
  const [pickedQuestionnaire, setPickedQuestionnaire] = useState('');
  // Versions of the currently-picked questionnaire. Loaded lazily when
  // the questionnaire selection changes.
  const [versions, setVersions] = useState<QuestionnaireVersionSummary[]>([]);
  const [pickedVersion, setPickedVersion] = useState('');
  const [language, setLanguage] = useState('English');

  const [entities, setEntities] = useState<EntityRegistration[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [respondents, setRespondents] = useState<Respondent[]>([]);

  // Initial allotments — admin picks on this form.
  // Each entity carries its own cap.
  const [entityAllotments, setEntityAllotments] = useState<AssessmentEntityAllotment[]>([]);
  const [groupAllotments, setGroupAllotments] = useState<Set<string>>(new Set());
  const [respondentAllotments, setRespondentAllotments] = useState<Set<string>>(new Set());

  // Search filters for the three pickers.
  const [entitySearch, setEntitySearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [respondentSearch, setRespondentSearch] = useState('');

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { setQuestionnaires(await questionnaireRecordsApi.list()); } catch {}
      try { setEntities((await entityRegistrationsApi.list()).filter((e) => e.active)); } catch {}
      try { setGroups(await groupsApi.list()); } catch {}
      try { setRespondents(await respondentsApi.list()); } catch {}
    })();
  }, []);

  const selectedQ = questionnaires.find((q) => q.id === pickedQuestionnaire);
  const selectedVersion = versions.find((v) => v.id === pickedVersion);

  // When the questionnaire selection changes, fetch its COMMITTED
  // versions and default the version picker to the current pointer.
  useEffect(() => {
    if (!pickedQuestionnaire) { setVersions([]); setPickedVersion(''); return; }
    (async () => {
      try {
        const list = await questionnaireVersionsApi.list(pickedQuestionnaire, true);
        setVersions(list);
        const parent = questionnaires.find((q) => q.id === pickedQuestionnaire);
        const defaultVid = parent?.currentVersionId && list.some((v) => v.id === parent.currentVersionId)
          ? parent.currentVersionId
          : (list[0]?.id || '');
        setPickedVersion(defaultVid);
      } catch {
        setVersions([]);
        setPickedVersion('');
      }
    })();
  }, [pickedQuestionnaire, questionnaires]);

  const toggleEntity = (e: EntityRegistration) => {
    if (!e.id) return;
    setEntityAllotments((prev) => {
      const found = prev.find((a) => a.entityId === e.id);
      if (found) return prev.filter((a) => a.entityId !== e.id);
      return [...prev, { assessmentId: '', entityId: e.id!, entityName: e.companyName || e.name, cap: null }];
    });
  };

  const updateCap = (entityId: string, capStr: string) => {
    const trimmed = capStr.trim();
    const cap = trimmed === '' ? null : Math.max(0, Number(trimmed) || 0);
    setEntityAllotments((prev) =>
      prev.map((a) => (a.entityId === entityId ? { ...a, cap } : a)),
    );
  };

  const toggleGroup = (gid: string) => {
    setGroupAllotments((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const toggleRespondent = (rid: string) => {
    setRespondentAllotments((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });
  };

  const filteredEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase();
    return entities.filter(
      (e) =>
        !q ||
        (e.companyName || '').toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q),
    );
  }, [entities, entitySearch]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return groups.filter(
      (g) => !q || g.name.toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q),
    );
  }, [groups, groupSearch]);

  const filteredRespondents = useMemo(() => {
    const q = respondentSearch.trim().toLowerCase();
    return respondents.filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [respondents, respondentSearch]);

  const totalAllotees = entityAllotments.length + groupAllotments.size + respondentAllotments.size;

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!pickedQuestionnaire) { setError('Pick a questionnaire.'); return; }
    if (!pickedVersion) { setError('Pick a version. Commit at least one version of this questionnaire first.'); return; }
    if (totalAllotees === 0) { setError('Allot the assessment to at least one entity, group, or individual.'); return; }
    setSaving(true);
    try {
      const created = await assessmentRecordsApi.create({
        name: name.trim(),
        questionnaireId: pickedQuestionnaire,
        questionnaireVersionId: pickedVersion,
        questionnaireName: selectedQ?.name,
        vertical: selectedQ?.vertical,
        language,
        status: 'ACTIVE',
        entityAllotments,
        groupAllotments: Array.from(groupAllotments),
        respondentAllotments: Array.from(respondentAllotments),
      });
      window.location.href = `/assessments/edit/${encodeURIComponent(created.id)}`;
    } catch (e: any) {
      setError(e?.message || 'Failed to create assessment.');
      setSaving(false);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button onClick={() => { window.location.href = '/assessments'; }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Assessments
          </button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Assessment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a questionnaire and allot it to entities, groups, and/or individuals.
          You can add more allotees later from the edit page.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Name *</label>
            <Input variant="md" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Q1 2026 Hiring Round" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Questionnaire *</label>
            <Select value={pickedQuestionnaire} onValueChange={setPickedQuestionnaire}>
              <SelectTrigger className="w-full" size="md"><SelectValue placeholder="Pick a questionnaire" /></SelectTrigger>
              <SelectContent>
                {questionnaires.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}{q.vertical ? ` · ${q.vertical}` : ''}{q.versionCount ? ` · ${q.versionCount} version${q.versionCount === 1 ? '' : 's'}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedQ && (
              <p className="text-[0.6875rem] text-muted-foreground mt-1">
                Vertical will be set to <strong>{selectedQ.vertical || '—'}</strong> from this questionnaire.
              </p>
            )}
          </div>

          {pickedQuestionnaire && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Version *</label>
              {versions.length === 0 ? (
                <p className="text-xs text-red-600 dark:text-red-400">
                  No committed versions for this questionnaire yet. Open <a className="underline" href={`/questionnaires/${encodeURIComponent(pickedQuestionnaire)}/versions`}>the version history</a> to commit a draft first.
                </p>
              ) : (
                <>
                  <Select value={pickedVersion} onValueChange={setPickedVersion}>
                    <SelectTrigger className="w-full" size="md"><SelectValue placeholder="Pick a version" /></SelectTrigger>
                    <SelectContent>
                      {versions.map((v) => {
                        const isCurrent = v.id === selectedQ?.currentVersionId;
                        return (
                          <SelectItem key={v.id} value={v.id}>
                            {v.versionLabel}{v.versionName ? ` — ${v.versionName}` : ''}{isCurrent ? ' · current' : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[0.6875rem] text-muted-foreground mt-1">
                    {selectedVersion ? (
                      <>This assessment will be permanently pinned to <strong>{selectedVersion.versionLabel}</strong>. Future edits to the questionnaire won't affect respondents on this version.</>
                    ) : 'Defaulted to the questionnaire\'s current version.'}
                  </p>
                </>
              )}
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Delivery Language</label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full" size="md"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Entities <span className="text-red-500" aria-hidden="true">*</span>
            <Badge size="sm" shape="circle" variant="secondary" appearance="light">{entityAllotments.length} picked</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Each entity carries a per-(entity, assessment) cap. Blank = unlimited.
            Sessions are created for each entity member when you send the invitation.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputWrapper variant="md" className="w-full">
            <Search className="size-4" />
            <Input placeholder="Search active entities…" value={entitySearch} onChange={(e) => setEntitySearch(e.target.value)} />
          </InputWrapper>
          <div className="border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
            {filteredEntities.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {entities.length === 0 ? 'No active entities. Activate one in /admin/entity-registrations.' : 'No entities match.'}
              </div>
            ) : filteredEntities.map((e) => {
              const allotment = entityAllotments.find((a) => a.entityId === e.id);
              const checked = !!allotment;
              return (
                <div key={e.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b border-border last:border-0 ${checked ? 'bg-primary/5' : ''}`}>
                  <button type="button" onClick={() => toggleEntity(e)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{e.companyName || <span className="italic text-muted-foreground">(no company)</span>}</p>
                      <p className="text-[0.6875rem] text-muted-foreground truncate">
                        Contact: {e.name} · {e.email} · {(e.member_ids || []).length} member{(e.member_ids || []).length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </button>
                  {checked && (
                    <div className="flex items-center gap-1">
                      <label className="text-[0.6875rem] text-muted-foreground">Cap</label>
                      <Input
                        variant="sm"
                        inputMode="numeric"
                        placeholder="∞"
                        className="w-16"
                        value={allotment?.cap == null ? '' : String(allotment.cap)}
                        onChange={(ev) => e.id && updateCap(e.id, ev.target.value.replace(/[^0-9]/g, ''))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UsersIcon className="size-4 text-primary" />
            Groups
            <Badge size="sm" shape="circle" variant="secondary" appearance="light">{groupAllotments.size} picked</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputWrapper variant="md" className="w-full">
            <Search className="size-4" />
            <Input placeholder="Search groups…" value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
          </InputWrapper>
          <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No groups.</div>
            ) : filteredGroups.map((g) => {
              const checked = groupAllotments.has(g.id);
              return (
                <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left border-b border-border last:border-0 ${checked ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{g.name}</p>
                    <p className="text-[0.6875rem] text-muted-foreground truncate">{g.memberIds.length} member{g.memberIds.length === 1 ? '' : 's'}{g.description ? ` · ${g.description}` : ''}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="size-4 text-primary" />
            Individual respondents
            <Badge size="sm" shape="circle" variant="secondary" appearance="light">{respondentAllotments.size} picked</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InputWrapper variant="md" className="w-full">
            <Search className="size-4" />
            <Input placeholder="Search respondents…" value={respondentSearch} onChange={(e) => setRespondentSearch(e.target.value)} />
          </InputWrapper>
          <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            {filteredRespondents.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No respondents.</div>
            ) : filteredRespondents.slice(0, 200).map((r) => {
              const checked = respondentAllotments.has(r.id);
              return (
                <button key={r.id} type="button" onClick={() => toggleRespondent(r.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left border-b border-border last:border-0 ${checked ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-[0.6875rem] text-muted-foreground truncate">{r.email}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => { window.location.href = '/assessments'; }} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={saving || totalAllotees === 0 || !pickedQuestionnaire || !pickedVersion || !name.trim()}>
          <ClipboardCheck className="size-4" />
          {saving ? 'Creating…' : `Create Assessment (${totalAllotees} allotee${totalAllotees === 1 ? '' : 's'})`}
        </Button>
      </div>
    </div>
  );
}
