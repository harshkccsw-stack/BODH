import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardList,
  Link2,
  Loader2,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  assessmentMappingApis,
  type AssessmentRef,
  type OrganizationRef,
  type RespondentAssessmentResponse,
  type RespondentRef,
  type RespondentAssessmentStatus,
} from './assessmentMappingApis';

const ATTEMPT_BADGE: Record<RespondentAssessmentStatus, string> = {
  NOT_STARTED: 'border-border bg-muted/40 text-muted-foreground',
  ONGOING:
    'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
  COMPLETED:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400',
};

const attemptLabel = (s: RespondentAssessmentStatus) =>
  s === 'NOT_STARTED' ? 'Not started' : s === 'ONGOING' ? 'Ongoing' : 'Completed';

/**
 * The allotment surface. Audience dropdown decides who is listed AND which
 * assessments are offered: "Unassigned" = respondents with no org × ALL
 * active assessments (direct assignment); a specific org = its members ×
 * only the assessments MAPPED to that org (segregation rule, also enforced
 * server-side). Pick an assessment, tick respondents, assign.
 */
export default function AssessmentMappingPage() {
  const [respondents, setRespondents] = useState<RespondentRef[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRef[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRef[]>([]);
  const [assignments, setAssignments] = useState<RespondentAssessmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  // '' = the Unassigned audience (respondents with no organization).
  const [selectedOrgId, setSelectedOrgId] = useState<number | ''>('');
  // The selected org's mapped catalog; null while loading.
  const [orgAssessments, setOrgAssessments] = useState<AssessmentRef[] | null>(null);

  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | ''>('');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [assignError, setAssignError] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignedFlash, setAssignedFlash] = useState('');

  // Per-respondent assignments viewer.
  const [viewTarget, setViewTarget] = useState<RespondentRef | null>(null);
  const [viewError, setViewError] = useState('');
  const [removeBusy, setRemoveBusy] = useState<number | null>(null);

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const [resp, assess, orgs, assigns] = await Promise.all([
        assessmentMappingApis.getAllRespondents(),
        assessmentMappingApis.getAllAssessments(),
        assessmentMappingApis.getAllOrganizations(),
        assessmentMappingApis.getAllAssignments(),
      ]);
      setRespondents(resp.data);
      setAssessments(assess.data);
      setOrganizations(orgs.data);
      setAssignments(assigns.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => { refresh(true); }, []);

  const changeOrg = async (value: string) => {
    const orgId = value ? Number(value) : '';
    setSelectedOrgId(orgId);
    setSelectedAssessmentId('');
    setChecked(new Set());
    setAssignError('');
    setAssignedFlash('');
    setOrgAssessments(null);
    if (orgId !== '') {
      try {
        const res = await assessmentMappingApis.getOrganizationAssessments(orgId);
        setOrgAssessments(res.data);
      } catch (e: any) {
        setOrgAssessments([]);
        setAssignError(e?.response?.data?.message || e?.message || "Failed to load the org's assessments");
      }
    }
  };

  // Audience: the selected org's members, or everyone without an org.
  const audience = useMemo(
    () => selectedOrgId === ''
      ? respondents.filter((r) => r.organizationId == null)
      : respondents.filter((r) => r.organizationId === selectedOrgId),
    [respondents, selectedOrgId],
  );

  const assignmentsByRespondent = useMemo(() => {
    const map = new Map<number, RespondentAssessmentResponse[]>();
    for (const a of assignments) {
      const list = map.get(a.respondentUserId) ?? [];
      list.push(a);
      map.set(a.respondentUserId, list);
    }
    return map;
  }, [assignments]);

  const filtered = useMemo(() => {
    if (!search) return audience;
    const s = search.toLowerCase();
    return audience.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        (r.serialId || '').toLowerCase().includes(s),
    );
  }, [audience, search]);

  // Unassigned audience → the whole active catalog; an org → only its
  // mapped (and active) assessments.
  const assignableAssessments = useMemo(
    () => (selectedOrgId === '' ? assessments : (orgAssessments ?? []))
      .filter((a) => a.status === 'ACTIVE'),
    [assessments, orgAssessments, selectedOrgId],
  );

  const selectedOrg = selectedOrgId === '' ? null
    : organizations.find((o) => o.organizationId === selectedOrgId) ?? null;

  // Respondents already holding the selected assessment can't be re-ticked.
  const alreadyAssigned = useMemo(() => {
    if (selectedAssessmentId === '') return new Set<number>();
    return new Set(assignments
      .filter((a) => a.assessmentId === selectedAssessmentId)
      .map((a) => a.respondentUserId));
  }, [assignments, selectedAssessmentId]);

  const toggle = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doAssign = async () => {
    setAssignError('');
    setAssignedFlash('');
    if (selectedAssessmentId === '') { setAssignError('Pick an assessment first'); return; }
    if (checked.size === 0) { setAssignError('Tick at least one respondent'); return; }
    setAssignSaving(true);
    try {
      const res = await assessmentMappingApis.assignAssessment({
        assessmentId: selectedAssessmentId,
        respondentUserIds: Array.from(checked),
      });
      setChecked(new Set());
      setAssignedFlash(`Assigned to ${res.data.length} respondent${res.data.length !== 1 ? 's' : ''}.`);
      await refresh();
    } catch (e: any) {
      setAssignError(e?.response?.data?.message || e?.message || 'Failed to assign');
    } finally {
      setAssignSaving(false);
    }
  };

  const doRemove = async (assignment: RespondentAssessmentResponse) => {
    setViewError('');
    setRemoveBusy(assignment.respondentAssessmentMappingId);
    try {
      await assessmentMappingApis.deleteAssignment(assignment.respondentAssessmentMappingId);
      await refresh();
    } catch (e: any) {
      setViewError(e?.response?.data?.message || e?.message || 'Failed to remove');
    } finally {
      setRemoveBusy(null);
    }
  };

  // Assignments held by the current audience.
  const audienceAssignments = useMemo(() => {
    const ids = new Set(audience.map((r) => r.respondentUserId));
    return assignments.filter((a) => ids.has(a.respondentUserId)).length;
  }, [assignments, audience]);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Assessment Library</span><span>/</span>
          <span className="text-foreground font-medium">Assessment Mapping</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Link2 className="h-6 w-6 text-primary" />
              Assessment Mapping
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Allot assessments to respondents. Pick the audience first:
              "Unassigned" offers every active assessment directly; picking an
              organization lists its members and only the assessments mapped
              to that org (manage the mapping on the Organizations page).
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{selectedOrg ? `Members — ${selectedOrg.name}` : 'Unassigned Respondents'}</p><p className="text-2xl font-semibold mt-1">{audience.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Assignable Assessments</p><p className="text-2xl font-semibold mt-1">{selectedOrgId !== '' && orgAssessments === null ? '…' : assignableAssessments.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Assignments in View</p><p className="text-2xl font-semibold mt-1">{audienceAssignments}</p></CardContent></Card>
      </div>

      {/* Assign bar: assessment picker + assign button */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {assignError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{assignError}</span>
            </div>
          )}
          {assignedFlash && (
            <div className="rounded-lg border border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400 flex items-start gap-2">
              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{assignedFlash}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              value={selectedOrgId}
              onChange={(e) => changeOrg(e.target.value)}
              className="flex-1 min-w-48 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Unassigned — no organization</option>
              {organizations.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.name} ({o.memberCount} member{o.memberCount !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
            <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
            <select
              value={selectedAssessmentId}
              onChange={(e) => { setSelectedAssessmentId(e.target.value ? Number(e.target.value) : ''); setChecked(new Set()); }}
              disabled={selectedOrgId !== '' && orgAssessments === null}
              className="flex-1 min-w-56 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
            >
              <option value="">
                {selectedOrgId !== '' && orgAssessments === null
                  ? 'Loading mapped assessments…'
                  : assignableAssessments.length === 0
                    ? (selectedOrgId === '' ? 'No active assessments' : 'No assessments mapped to this org')
                    : 'Pick an assessment to assign…'}
              </option>
              {assignableAssessments.map((a) => (
                <option key={a.assessmentId} value={a.assessmentId}>
                  {a.name} — {a.questionnaireName}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">{checked.size} selected</span>
            <Button
              variant="primary"
              onClick={doAssign}
              disabled={assignSaving || selectedAssessmentId === '' || checked.size === 0}
            >
              {assignSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Link2 className="h-3.5 w-3.5" />
              Assign {checked.size > 0 ? `to ${checked.size}` : ''}
            </Button>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            {selectedOrgId === ''
              ? 'Unassigned respondents can receive any ACTIVE assessment directly.'
              : "Org members can only receive assessments mapped to their organization — map more on the Organizations page."}
            {' '}Respondents already holding the picked assessment are marked and can't be ticked again.
          </p>
        </CardContent>
      </Card>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search name, email or serial..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {audience.length === 0
                ? (selectedOrg ? `No members in ${selectedOrg.name}` : 'No unassigned respondents')
                : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {audience.length === 0
                ? (selectedOrg
                  ? 'Assign respondents to this organization first — people icon on its row in the Organizations page.'
                  : 'Every respondent belongs to an organization — pick one from the dropdown above.')
                : 'Try a different search term.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const own = assignmentsByRespondent.get(r.respondentUserId) ?? [];
              const holds = alreadyAssigned.has(r.respondentUserId);
              const isChecked = checked.has(r.respondentUserId);
              const selectable = selectedAssessmentId !== '' && !holds;
              return (
                <li
                  key={r.respondentUserId}
                  className={cn(
                    'flex items-center justify-between gap-4 px-4 py-3 transition-colors',
                    selectable ? 'hover:bg-muted/40 cursor-pointer' : 'hover:bg-muted/20',
                  )}
                  onClick={() => selectable && toggle(r.respondentUserId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isChecked ? 'border-primary bg-primary text-primary-foreground'
                        : selectable ? 'border-border bg-background' : 'border-border bg-muted/60 opacity-50',
                    )}>
                      {isChecked && <Check className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        {r.serialId && (
                          <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                            {r.serialId}
                          </span>
                        )}
                        {holds && (
                          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[0.6875rem] font-medium shrink-0">
                            already assigned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setViewError(''); setViewTarget(r); }}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium hover:border-primary/40 hover:text-primary transition-colors"
                      title="View this respondent's assignments"
                    >
                      <ClipboardList className="h-3 w-3" />
                      {own.length} assigned
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Per-respondent assignments viewer */}
      {viewTarget && (() => {
        const own = assignmentsByRespondent.get(viewTarget.respondentUserId) ?? [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setViewTarget(null)}>
            <Card className="w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Assignments — {viewTarget.name}
                </CardTitle>
                <button onClick={() => setViewTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </CardHeader>
              <CardContent className="space-y-4 overflow-y-auto">
                {viewError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{viewError}</span>
                  </div>
                )}
                {own.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No assessments assigned yet.</p>
                ) : (
                  <ul className="divide-y divide-border border border-border rounded-lg">
                    {own.map((a) => (
                      <li key={a.respondentAssessmentMappingId} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{a.assessmentName}</p>
                          <p className="text-xs text-muted-foreground">Attempt {a.attemptNumber}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
                            ATTEMPT_BADGE[a.assessmentStatus],
                          )}>
                            {attemptLabel(a.assessmentStatus)}
                          </span>
                          {a.assessmentStatus === 'NOT_STARTED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => doRemove(a)}
                              disabled={removeBusy !== null}
                              title="Remove this assignment"
                            >
                              {removeBusy === a.respondentAssessmentMappingId
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Trash2 className="h-3 w-3 text-red-600" />}
                              Remove
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[0.6875rem] text-muted-foreground">
                  Only not-started attempts can be removed — anything the
                  respondent has begun is frozen history.
                </p>
              </CardContent>
              <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
                <Button variant="outline" onClick={() => setViewTarget(null)}>Close</Button>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
