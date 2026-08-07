import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardList,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  organizationApis,
  type AssessmentRef,
  type OrgAssessmentRef,
  type OrgMemberRef,
  type OrganizationDetailResponse,
  type OrganizationResponse,
  type UnassignedPeopleResponse,
} from './organizationApis';
import OrganizationWizard from './OrganizationWizard';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400',
  INACTIVE: 'border-border bg-muted/40 text-muted-foreground',
  SUSPENDED:
    'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400',
};

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  /**
   * The inline 3-step flow — replaces the list while it is open. Both adding
   * and editing go through it: `null` in the wizard's `existing` slot means
   * add, an organization means edit. `wizard` itself being null means closed.
   */
  const [wizard, setWizard] = useState<{ existing: OrganizationResponse | null } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<OrganizationResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Drill-in modal: staff (practitioners) + members (respondents) of one org.
  const [detailTarget, setDetailTarget] = useState<OrganizationResponse | null>(null);
  const [detail, setDetail] = useState<OrganizationDetailResponse | null>(null);
  const [detailError, setDetailError] = useState('');
  // Which detail row's unassign is in flight — 'p-3' / 'r-5' style keys.
  const [unassignBusy, setUnassignBusy] = useState<string | null>(null);

  // Full assessment catalog — lazily loaded for the map-assessments modal.
  const [allAssessments, setAllAssessments] = useState<AssessmentRef[] | null>(null);
  const loadAllAssessments = async () => {
    try {
      const res = await organizationApis.getAllAssessments();
      setAllAssessments(res.data);
    } catch {
      setAllAssessments([]);
    }
  };

  // Map-assessments modal: the org's catalog + picker for unmapped ones.
  const [catalogTarget, setCatalogTarget] = useState<OrganizationResponse | null>(null);
  const [catalog, setCatalog] = useState<OrgAssessmentRef[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [mapChecked, setMapChecked] = useState<Set<number>>(new Set());
  const [mapSearch, setMapSearch] = useState('');
  const [mapSaving, setMapSaving] = useState(false);
  const [unmapBusy, setUnmapBusy] = useState<number | null>(null);

  // Assign-members step (stacked over the catalog modal): give one mapped
  // assessment to the org's members.
  const [memberAssignTarget, setMemberAssignTarget] = useState<OrgAssessmentRef | null>(null);
  const [orgMembersForAssign, setOrgMembersForAssign] = useState<OrgMemberRef[] | null>(null);
  const [holdersOfTarget, setHoldersOfTarget] = useState<Set<number> | null>(null);
  const [memberAssignChecked, setMemberAssignChecked] = useState<Set<number>>(new Set());
  const [memberAssignError, setMemberAssignError] = useState('');
  const [memberAssignSaving, setMemberAssignSaving] = useState(false);

  // Assign modal: bulk-attach unassigned people into one org.
  const [assignTarget, setAssignTarget] = useState<OrganizationResponse | null>(null);
  const [unassigned, setUnassigned] = useState<UnassignedPeopleResponse | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [checkedPractitioners, setCheckedPractitioners] = useState<Set<number>>(new Set());
  const [checkedRespondents, setCheckedRespondents] = useState<Set<number>>(new Set());
  const [assignError, setAssignError] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const res = await organizationApis.getAllOrganizations();
      setOrganizations(res.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load organizations');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => { refresh(true); }, []);

  const filtered = useMemo(() => {
    if (!search) return organizations;
    const s = search.toLowerCase();
    return organizations.filter(
      (o) =>
        o.name.toLowerCase().includes(s) ||
        (o.orgEmail || '').toLowerCase().includes(s) ||
        (o.description || '').toLowerCase().includes(s),
    );
  }, [organizations, search]);

  const openCreate = () => {
    setSearch('');
    setWizard({ existing: null });
  };
  const openEdit = (o: OrganizationResponse) => setWizard({ existing: o });

  const openCatalog = async (o: OrganizationResponse) => {
    setCatalogTarget(o);
    setCatalog(null);
    setCatalogError('');
    setMapChecked(new Set());
    setMapSearch('');
    if (!allAssessments) loadAllAssessments();
    try {
      const res = await organizationApis.getOrganizationAssessments(o.organizationId);
      setCatalog(res.data);
    } catch (e: any) {
      setCatalogError(e?.response?.data?.message || e?.message || 'Failed to load mapped assessments');
    }
  };

  const doMapAssessments = async () => {
    if (!catalogTarget || mapChecked.size === 0) return;
    setCatalogError('');
    setMapSaving(true);
    try {
      const res = await organizationApis.assignAssessments(
        catalogTarget.organizationId, Array.from(mapChecked));
      setCatalog(res.data);
      setMapChecked(new Set());
      await refresh();
    } catch (e: any) {
      setCatalogError(e?.response?.data?.message || e?.message || 'Failed to map assessments');
    } finally {
      setMapSaving(false);
    }
  };

  const openMemberAssign = async (assessment: OrgAssessmentRef) => {
    if (!catalogTarget) return;
    setMemberAssignTarget(assessment);
    setOrgMembersForAssign(null);
    setHoldersOfTarget(null);
    setMemberAssignChecked(new Set());
    setMemberAssignError('');
    try {
      const [detailRes, holdersRes] = await Promise.all([
        organizationApis.getOrganizationById(catalogTarget.organizationId),
        organizationApis.getAssessmentAssignments(assessment.assessmentId),
      ]);
      setOrgMembersForAssign(detailRes.data.members);
      setHoldersOfTarget(new Set(holdersRes.data.map((h) => h.respondentUserId)));
    } catch (e: any) {
      setMemberAssignError(e?.response?.data?.message || e?.message || 'Failed to load members');
    }
  };

  const doMemberAssign = async () => {
    if (!catalogTarget || !memberAssignTarget || memberAssignChecked.size === 0) return;
    setMemberAssignError('');
    setMemberAssignSaving(true);
    try {
      await organizationApis.assignAssessmentToMembers(
        memberAssignTarget.assessmentId, Array.from(memberAssignChecked));
      setMemberAssignTarget(null);
      // Refresh the catalog so assignedMemberCount reflects the new rows.
      const res = await organizationApis.getOrganizationAssessments(catalogTarget.organizationId);
      setCatalog(res.data);
      await refresh();
    } catch (e: any) {
      setMemberAssignError(e?.response?.data?.message || e?.message || 'Failed to assign');
    } finally {
      setMemberAssignSaving(false);
    }
  };

  const doUnmapAssessment = async (assessmentId: number) => {
    if (!catalogTarget) return;
    setCatalogError('');
    setUnmapBusy(assessmentId);
    try {
      const res = await organizationApis.unassignAssessments(
        catalogTarget.organizationId, [assessmentId]);
      setCatalog(res.data);
      await refresh();
    } catch (e: any) {
      setCatalogError(e?.response?.data?.message || e?.message || 'Failed to unmap');
    } finally {
      setUnmapBusy(null);
    }
  };

  const openDetail = async (o: OrganizationResponse) => {
    setDetailTarget(o);
    setDetail(null);
    setDetailError('');
    try {
      const res = await organizationApis.getOrganizationById(o.organizationId);
      setDetail(res.data);
    } catch (e: any) {
      setDetailError(e?.response?.data?.message || e?.message || 'Failed to load members');
    }
  };

  const doUnassign = async (kind: 'practitioner' | 'respondent', profileId: number) => {
    if (!detailTarget) return;
    const key = `${kind === 'practitioner' ? 'p' : 'r'}-${profileId}`;
    setDetailError('');
    setUnassignBusy(key);
    try {
      const res = await organizationApis.unassignPeople(detailTarget.organizationId, {
        practitionerIds: kind === 'practitioner' ? [profileId] : [],
        respondentIds: kind === 'respondent' ? [profileId] : [],
      });
      setDetail(res.data);
      await refresh();
    } catch (e: any) {
      setDetailError(e?.response?.data?.message || e?.message || 'Failed to unassign');
    } finally {
      setUnassignBusy(null);
    }
  };

  const openAssign = async (o: OrganizationResponse) => {
    setAssignTarget(o);
    setUnassigned(null);
    setAssignSearch('');
    setCheckedPractitioners(new Set());
    setCheckedRespondents(new Set());
    setAssignError('');
    try {
      const res = await organizationApis.getUnassignedPeople();
      setUnassigned(res.data);
    } catch (e: any) {
      setAssignError(e?.response?.data?.message || e?.message || 'Failed to load unassigned people');
    }
  };

  const toggleChecked = (set: Set<number>, id: number, apply: (next: Set<number>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const doAssign = async () => {
    if (!assignTarget) return;
    if (checkedPractitioners.size === 0 && checkedRespondents.size === 0) {
      setAssignError('Pick at least one person to assign');
      return;
    }
    setAssignError('');
    setAssignSaving(true);
    try {
      await organizationApis.assignPeople(assignTarget.organizationId, {
        practitionerIds: Array.from(checkedPractitioners),
        respondentIds: Array.from(checkedRespondents),
      });
      setAssignTarget(null);
      await refresh();
    } catch (e: any) {
      setAssignError(e?.response?.data?.message || e?.message || 'Failed to assign');
    } finally {
      setAssignSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError('');
    try {
      await organizationApis.deleteOrganization(confirmDelete.organizationId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to delete');
    }
  };

  const staffTotal = organizations.reduce((n, o) => n + o.staffCount, 0);
  const memberTotal = organizations.reduce((n, o) => n + o.memberCount, 0);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Users</span><span>/</span>
          <span className="text-foreground font-medium">Organizations</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Organizations
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {wizard
                ? 'Three steps: the organization itself, the assessments it may use, then the respondents who belong to it. Each step saves on its own.'
                : "Schools, clinics and companies. Staff (practitioners) run the org's assessments; members (respondents) take them. People are attached from their own pages — this catalog owns the org itself."}
            </p>
          </div>
          {!wizard && (
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Organization
            </Button>
          )}
        </div>
      </div>

      {/* Add and edit both take over the page — the list comes back on exit.
          Keying on the org id remounts the wizard when you switch rows, so it
          never carries the previous org's step or form state across. */}
      {wizard && (
        <OrganizationWizard
          key={wizard.existing?.organizationId ?? 'new'}
          existing={wizard.existing}
          onChanged={() => refresh()}
          onExit={() => setWizard(null)}
        />
      )}

      {!wizard && (<>
      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Organizations</p><p className="text-2xl font-semibold mt-1">{organizations.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Staff (Practitioners)</p><p className="text-2xl font-semibold mt-1">{staffTotal}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Members (Respondents)</p><p className="text-2xl font-semibold mt-1">{memberTotal}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search name, email or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading organizations…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Building2 className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {organizations.length === 0 ? 'No organizations yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {organizations.length === 0
                ? 'Add a school, clinic or company — then attach its staff and members from the Practitioners and Respondents pages.'
                : 'Try a different search term.'}
            </p>
            {organizations.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Add your first organization
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((o) => (
              <li
                key={o.organizationId}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-md border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
                    {o.logoBase64 ? (
                      <img src={o.logoBase64} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <Building2 className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{o.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {o.orgEmail && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        {o.orgEmail}
                      </span>
                    )}
                    {o.description && <span className="truncate">{o.description}</span>}
                  </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
                    <Stethoscope className="h-3 w-3" />
                    {o.staffCount} staff
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
                    <Users className="h-3 w-3" />
                    {o.memberCount} member{o.memberCount !== 1 ? 's' : ''}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
                    <ClipboardList className="h-3 w-3" />
                    {o.assessmentCount} assessment{o.assessmentCount !== 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openCatalog(o); }}
                    title="Map assessments"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openAssign(o); }}
                    title="Assign staff & members"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openDetail(o); }}
                    title="View staff & members"
                  >
                    <Users className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openEdit(o); }}
                    title="Edit organization"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(o); }}
                    title="Delete organization"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      </>)}

      {/* Map assessments (org catalog) — quick action from a row; the same
          job also lives as step 2 of the wizard. */}
      {catalogTarget && (() => {
        const mappedIds = new Set((catalog ?? []).map((c) => c.assessmentId));
        const q = mapSearch.trim().toLowerCase();
        const candidates = (allAssessments ?? [])
          .filter((a) => !mappedIds.has(a.assessmentId))
          .filter((a) => !q
            || a.name.toLowerCase().includes(q)
            || a.questionnaireName.toLowerCase().includes(q));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !mapSaving && setCatalogTarget(null)}>
            <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Assessments — {catalogTarget.name}
                </CardTitle>
                <button onClick={() => setCatalogTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </CardHeader>
              <CardContent className="space-y-5 overflow-y-auto flex-1">
                {catalogError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{catalogError}</span>
                  </div>
                )}
                {!catalog && !catalogError ? (
                  <div className="py-10 flex flex-col items-center justify-center text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground mt-2">Loading mapped assessments…</p>
                  </div>
                ) : catalog && (
                  <>
                    <div>
                      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                        <ClipboardList className="h-3.5 w-3.5" /> Mapped assessments
                        <span className="ml-auto normal-case tracking-normal">{catalog.length}</span>
                      </div>
                      {catalog.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          Nothing mapped yet — members can't be assigned any assessment until one is.
                        </p>
                      ) : (
                        <ul className="divide-y divide-border border border-border rounded-lg">
                          {catalog.map((c) => (
                            <li key={c.assessmentId} className="flex items-center justify-between gap-3 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{c.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {c.questionnaireName} · {c.assignedMemberCount} member{c.assignedMemberCount !== 1 ? 's' : ''} assigned
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={cn(
                                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
                                  c.status === 'ACTIVE'
                                    ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                                    : 'border-border bg-muted/40 text-muted-foreground',
                                )}>
                                  {c.status}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openMemberAssign(c)}
                                  disabled={c.status !== 'ACTIVE'}
                                  title={c.status === 'ACTIVE'
                                    ? 'Assign this assessment to members'
                                    : 'Activate the assessment before assigning'}
                                >
                                  <UserPlus className="h-3 w-3" />
                                  Assign members
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => doUnmapAssessment(c.assessmentId)}
                                  disabled={unmapBusy !== null}
                                  title="Remove from this organization's catalog"
                                >
                                  {unmapBusy === c.assessmentId
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <X className="h-3 w-3" />}
                                  Unmap
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                        <Plus className="h-3.5 w-3.5" /> Map more
                        <span className="ml-auto normal-case tracking-normal">{mapChecked.size} selected</span>
                      </div>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search assessments..."
                          value={mapSearch}
                          onChange={(e) => setMapSearch(e.target.value)}
                          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
                        />
                      </div>
                      {!allAssessments ? (
                        <p className="text-xs text-muted-foreground italic">Loading assessments…</p>
                      ) : candidates.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          {(allAssessments.length - mappedIds.size) === 0
                            ? 'Every assessment is already mapped.'
                            : 'No assessments match your search.'}
                        </p>
                      ) : (
                        <div className="border border-border rounded-lg max-h-56 overflow-y-auto">
                          {candidates.map((a) => {
                            const checked = mapChecked.has(a.assessmentId);
                            return (
                              <button
                                key={a.assessmentId}
                                type="button"
                                onClick={() => {
                                  const next = new Set(mapChecked);
                                  if (checked) next.delete(a.assessmentId);
                                  else next.add(a.assessmentId);
                                  setMapChecked(next);
                                }}
                                className={cn(
                                  'w-full flex items-center gap-3 px-3 py-2 text-sm text-left border-b border-border last:border-0 transition-colors',
                                  checked ? 'bg-primary/5' : 'hover:bg-muted/50',
                                )}
                              >
                                <span className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
                                )}>
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{a.name}</p>
                                  <p className="text-[0.6875rem] text-muted-foreground truncate">
                                    {a.questionnaireName} · {a.status}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
              <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
                <Button variant="outline" onClick={() => setCatalogTarget(null)} disabled={mapSaving}>Close</Button>
                <Button variant="primary" onClick={doMapAssessments} disabled={mapSaving || mapChecked.size === 0}>
                  {mapSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <ClipboardList className="h-3.5 w-3.5" />
                  Map {mapChecked.size > 0 ? mapChecked.size : ''}
                </Button>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Assign a mapped assessment to members — stacked over the catalog modal */}
      {memberAssignTarget && catalogTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" onClick={() => !memberAssignSaving && setMemberAssignTarget(null)}>
          <Card className="w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Assign "{memberAssignTarget.name}" to members
              </CardTitle>
              <button onClick={() => setMemberAssignTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-3 overflow-y-auto flex-1">
              {memberAssignError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{memberAssignError}</span>
                </div>
              )}
              {(!orgMembersForAssign || !holdersOfTarget) && !memberAssignError ? (
                <div className="py-8 flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Loading members…</p>
                </div>
              ) : orgMembersForAssign && holdersOfTarget && (
                orgMembersForAssign.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    This organization has no members yet — assign respondents to
                    it first (people icon on the org row).
                  </p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {orgMembersForAssign.map((m) => {
                      const holds = holdersOfTarget.has(m.respondentUserId);
                      const isChecked = memberAssignChecked.has(m.respondentUserId);
                      return (
                        <button
                          key={m.respondentUserId}
                          type="button"
                          disabled={holds}
                          onClick={() => {
                            const next = new Set(memberAssignChecked);
                            if (isChecked) next.delete(m.respondentUserId);
                            else next.add(m.respondentUserId);
                            setMemberAssignChecked(next);
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 text-sm text-left border-b border-border last:border-0 transition-colors',
                            holds ? 'opacity-60 cursor-not-allowed'
                              : isChecked ? 'bg-primary/5' : 'hover:bg-muted/50',
                          )}
                        >
                          <span className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            isChecked ? 'border-primary bg-primary text-primary-foreground'
                              : holds ? 'border-border bg-muted/60' : 'border-border bg-background',
                          )}>
                            {isChecked && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{m.name}</p>
                              {m.serialId && (
                                <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                  {m.serialId}
                                </span>
                              )}
                              {holds && (
                                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[0.6875rem] font-medium shrink-0">
                                  already assigned
                                </span>
                              )}
                            </div>
                            <p className="text-[0.6875rem] text-muted-foreground truncate">{m.email}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </CardContent>
            <div className="flex items-center justify-between gap-2 p-4 border-t border-border shrink-0">
              <span className="text-xs text-muted-foreground">{memberAssignChecked.size} selected</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMemberAssignTarget(null)} disabled={memberAssignSaving}>Cancel</Button>
                <Button variant="primary" onClick={doMemberAssign} disabled={memberAssignSaving || memberAssignChecked.size === 0}>
                  {memberAssignSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <UserPlus className="h-3.5 w-3.5" />
                  Assign {memberAssignChecked.size > 0 ? memberAssignChecked.size : ''}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Bulk-assign unassigned people */}
      {assignTarget && (() => {
        const q = assignSearch.trim().toLowerCase();
        const matches = (name: string, email: string, serial: string | null) =>
          !q || name.toLowerCase().includes(q) || email.toLowerCase().includes(q) ||
          (serial || '').toLowerCase().includes(q);
        const practitioners = (unassigned?.practitioners ?? []).filter((p) =>
          matches(p.name, p.email, p.serialId));
        const respondents = (unassigned?.respondents ?? []).filter((r) =>
          matches(r.name, r.email, r.serialId));
        const selectedCount = checkedPractitioners.size + checkedRespondents.size;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !assignSaving && setAssignTarget(null)}>
            <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  Assign to {assignTarget.name}
                </CardTitle>
                <button onClick={() => setAssignTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </CardHeader>
              <CardContent className="space-y-4 overflow-y-auto flex-1">
                {assignError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{assignError}</span>
                  </div>
                )}
                {!unassigned && !assignError ? (
                  <div className="py-10 flex flex-col items-center justify-center text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground mt-2">Loading unassigned people…</p>
                  </div>
                ) : unassigned && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Only people without an organization are listed. Moving
                      someone between organizations is done from their own page.
                    </p>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search by name, email or serial..."
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                        <Stethoscope className="h-3.5 w-3.5" /> Staff — practitioners
                        <span className="ml-auto normal-case tracking-normal">{checkedPractitioners.size} selected</span>
                      </div>
                      {practitioners.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          {(unassigned.practitioners.length === 0)
                            ? 'No unassigned practitioners.'
                            : 'No practitioners match your search.'}
                        </p>
                      ) : (
                        <div className="border border-border rounded-lg overflow-hidden">
                          {practitioners.map((p) => {
                            const checked = checkedPractitioners.has(p.practitionerUserId);
                            return (
                              <button
                                key={p.practitionerUserId}
                                type="button"
                                onClick={() => toggleChecked(checkedPractitioners, p.practitionerUserId, setCheckedPractitioners)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-3 py-2 text-sm text-left border-b border-border last:border-0 transition-colors',
                                  checked ? 'bg-primary/5' : 'hover:bg-muted/50',
                                )}
                              >
                                <span className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
                                )}>
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium truncate">{p.name}</p>
                                    {p.serialId && (
                                      <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                        {p.serialId}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[0.6875rem] text-muted-foreground truncate">{p.email}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                        <Users className="h-3.5 w-3.5" /> Members — respondents
                        <span className="ml-auto normal-case tracking-normal">{checkedRespondents.size} selected</span>
                      </div>
                      {respondents.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          {(unassigned.respondents.length === 0)
                            ? 'No unassigned respondents.'
                            : 'No respondents match your search.'}
                        </p>
                      ) : (
                        <div className="border border-border rounded-lg overflow-hidden">
                          {respondents.map((r) => {
                            const checked = checkedRespondents.has(r.respondentUserId);
                            return (
                              <button
                                key={r.respondentUserId}
                                type="button"
                                onClick={() => toggleChecked(checkedRespondents, r.respondentUserId, setCheckedRespondents)}
                                className={cn(
                                  'w-full flex items-center gap-3 px-3 py-2 text-sm text-left border-b border-border last:border-0 transition-colors',
                                  checked ? 'bg-primary/5' : 'hover:bg-muted/50',
                                )}
                              >
                                <span className={cn(
                                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
                                )}>
                                  {checked && <Check className="h-3 w-3" />}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium truncate">{r.name}</p>
                                    {r.serialId && (
                                      <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                        {r.serialId}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[0.6875rem] text-muted-foreground truncate">{r.email}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
              <div className="flex items-center justify-between gap-2 p-4 border-t border-border shrink-0">
                <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assignSaving}>Cancel</Button>
                  <Button variant="primary" onClick={doAssign} disabled={assignSaving || selectedCount === 0}>
                    {assignSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <UserPlus className="h-3.5 w-3.5" />
                    Assign {selectedCount > 0 ? selectedCount : ''}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* Staff & members drill-in */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setDetailTarget(null)}>
          <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                {detailTarget.logoBase64 ? (
                  <img src={detailTarget.logoBase64} alt="" className="h-5 w-5 rounded object-contain" />
                ) : (
                  <Building2 className="h-4 w-4 text-primary" />
                )}
                {detailTarget.name}
              </CardTitle>
              <button onClick={() => setDetailTarget(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-5 overflow-y-auto">
              {detailError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{detailError}</span>
                </div>
              )}
              {!detail && !detailError ? (
                <div className="py-10 flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Loading staff & members…</p>
                </div>
              ) : detail && (
                <>
                  <div>
                    <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                      <Stethoscope className="h-3.5 w-3.5" /> Staff — practitioners
                      <span className="ml-auto normal-case tracking-normal">{detail.staff.length}</span>
                    </div>
                    {detail.staff.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No staff yet — assign practitioners to this organization from the Practitioners page.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border border border-border rounded-lg">
                        {detail.staff.map((s) => (
                          <li key={s.practitionerUserId} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{s.name}</p>
                                {s.serialId && (
                                  <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                    {s.serialId}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn(
                                'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
                                STATUS_BADGE[s.practitionerStatus] || STATUS_BADGE.INACTIVE,
                              )}>
                                {s.practitionerStatus.charAt(0) + s.practitionerStatus.slice(1).toLowerCase()}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => doUnassign('practitioner', s.practitionerUserId)}
                                disabled={unassignBusy !== null}
                                title="Remove from this organization"
                              >
                                {unassignBusy === `p-${s.practitionerUserId}`
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <UserMinus className="h-3 w-3" />}
                                Unassign
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                      <Users className="h-3.5 w-3.5" /> Members — respondents
                      <span className="ml-auto normal-case tracking-normal">{detail.members.length}</span>
                    </div>
                    {detail.members.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No members yet — assign respondents to this organization from the Respondents page.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border border border-border rounded-lg">
                        {detail.members.map((m) => (
                          <li key={m.respondentUserId} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{m.name}</p>
                                {m.serialId && (
                                  <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                                    {m.serialId}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {m.isConsented ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-2 py-0.5 text-[0.6875rem] font-medium text-green-700 dark:text-green-400">
                                  <ShieldCheck className="h-3 w-3" />
                                  Consented
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                                  No consent
                                </span>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => doUnassign('respondent', m.respondentUserId)}
                                disabled={unassignBusy !== null}
                                title="Remove from this organization"
                              >
                                {unassignBusy === `r-${m.respondentUserId}`
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <UserMinus className="h-3 w-3" />}
                                Unassign
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setDetailTarget(null)}>Close</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete Organization
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
              <p className="text-sm">
                Remove <strong>{confirmDelete.name}</strong>? An organization
                that still has staff or members cannot be deleted — move them
                out first.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
