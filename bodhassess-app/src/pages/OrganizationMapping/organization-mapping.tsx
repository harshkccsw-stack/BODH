import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardCheck,
  Copy,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  organizationApis,
  registrationLinkUrl,
  type AssessmentRef,
  type OrgAssessmentRef,
  type OrganizationResponse,
  type OrgMemberRef,
  type RegistrationLinkRef,
} from '@/pages/Organization/organizationApis';
import {
  respondentMappingApis,
  type RespondentAssessmentResponse,
} from '@/pages/RespondentMapping/respondentMappingApis';

// Organization-level assessment mapping in one place: which assessments an
// organization may use (its catalog), the self-registration links that hang
// off those entries, and the per-respondent allotments inside the org.
//
// The two kinds of mapping are NOT the same thing, which is why the table
// carries a Level column:
//   ORGANIZATION → a catalog entry (OrganizationAssessmentMapping). The org
//                  MAY use the assessment; nobody is assigned anything yet.
//                  This is the row a registration link belongs to.
//   RESPONDENT   → an allotment (RespondentAssessmentMapping). One named
//                  person will take it. No registration link is possible —
//                  the respondent already exists.
//
// Both api modules are imported rather than re-wrapped: every endpoint this
// page needs already has a typed wrapper, and a second copy would be a second
// thing to keep in step with the DTOs.

type MappingLevel = 'ORGANIZATION' | 'RESPONDENT' | 'GROUP';

const LEVEL_LABEL: Record<MappingLevel, string> = {
  ORGANIZATION: 'Whole Organization',
  RESPONDENT: 'Individual Respondent',
  GROUP: 'Group',
};

/** One row of the Existing Mappings table, from either source. */
interface MappingRow {
  key: string;
  level: MappingLevel;
  assessmentId: number;
  assessmentName: string;
  details: string;
  status: string;
  /** Catalog rows only — an allotment can never carry one. */
  link: RegistrationLinkRef | null;
  /** Allotment rows only — what delete addresses. */
  allotmentId?: number;
}

const statusChip = (status: string) => {
  switch (status) {
    case 'ACTIVE':
    case 'COMPLETED':
      return 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400';
    case 'ONGOING':
      return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
};

const pretty = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export default function OrganizationMappingPage() {
  // ── Organization picker ──────────────────────────────────────────────
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgId, setOrgId] = useState<number | null>(null);

  // ── Everything below is per-organization ─────────────────────────────
  const [members, setMembers] = useState<OrgMemberRef[]>([]);
  const [catalog, setCatalog] = useState<OrgAssessmentRef[]>([]);
  const [links, setLinks] = useState<{
    organizationLink: RegistrationLinkRef | null;
    byAssessmentId: Map<number, RegistrationLinkRef | null>;
  }>({ organizationLink: null, byAssessmentId: new Map() });
  const [allotments, setAllotments] = useState<RespondentAssessmentResponse[]>([]);
  const [allAssessments, setAllAssessments] = useState<AssessmentRef[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(''); // a key naming the action in flight
  const [copied, setCopied] = useState('');

  // ── Create-mapping form ──────────────────────────────────────────────
  const [formAssessmentId, setFormAssessmentId] = useState('');
  const [formLevel, setFormLevel] = useState<MappingLevel>('ORGANIZATION');
  const [assignAllMembers, setAssignAllMembers] = useState(false);
  const [pickedRespondents, setPickedRespondents] = useState<Set<number>>(new Set());
  const [respondentSearch, setRespondentSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [formNote, setFormNote] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<MappingRow | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [orgs, assessments] = await Promise.all([
          organizationApis.getAllOrganizations(),
          organizationApis.getAllAssessments(),
        ]);
        setOrganizations(orgs.data);
        setAllAssessments(assessments.data);
      } catch (e: any) {
        setLoadError(e?.response?.data?.message || e?.message || 'Failed to load organizations');
      }
    })();
  }, []);

  const loadOrganization = async (id: number, showLoading = true) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const [detail, cat, linkRes, assignments] = await Promise.all([
        organizationApis.getOrganizationById(id),
        organizationApis.getOrganizationAssessments(id),
        organizationApis.getOrganizationRegistrationLinks(id),
        // One call for every allotment, filtered here — cheaper than one
        // request per catalog entry, and it carries respondent names.
        respondentMappingApis.getAllAssignments(),
      ]);
      setMembers(detail.data.members);
      setCatalog(cat.data);
      setLinks({
        organizationLink: linkRes.data.organizationLink,
        byAssessmentId: new Map(linkRes.data.assessments.map((a) => [a.assessmentId, a.link])),
      });
      setAllotments(assignments.data.filter((a) => a.organizationId === id));
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || e?.message || 'Failed to load this organization');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const selectOrganization = (id: number | null) => {
    setOrgId(id);
    setFormAssessmentId('');
    setFormLevel('ORGANIZATION');
    setAssignAllMembers(false);
    setPickedRespondents(new Set());
    setFormError('');
    setFormNote('');
    if (id != null) loadOrganization(id);
  };

  const filteredOrganizations = useMemo(() => {
    if (!orgSearch) return organizations;
    const s = orgSearch.toLowerCase();
    return organizations.filter((o) => o.name.toLowerCase().includes(s));
  }, [organizations, orgSearch]);

  const org = organizations.find((o) => o.organizationId === orgId) ?? null;
  const mappedIds = useMemo(() => new Set(catalog.map((c) => c.assessmentId)), [catalog]);

  // Existing Mappings — catalog entries first, then the allotments inside
  // this organization. One table, one Level column (see the note above).
  const rows: MappingRow[] = useMemo(() => {
    const catalogRows: MappingRow[] = [...catalog]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        key: `org-${c.assessmentId}`,
        level: 'ORGANIZATION',
        assessmentId: c.assessmentId,
        assessmentName: c.name,
        details: `Whole organization · ${c.assignedMemberCount} member assignment${c.assignedMemberCount !== 1 ? 's' : ''}`,
        status: c.status,
        link: links.byAssessmentId.get(c.assessmentId) ?? null,
      }));
    const allotmentRows: MappingRow[] = [...allotments]
      .sort((a, b) => a.assessmentName.localeCompare(b.assessmentName) || a.respondentName.localeCompare(b.respondentName))
      .map((a) => ({
        key: `res-${a.respondentAssessmentMappingId}`,
        level: 'RESPONDENT',
        assessmentId: a.assessmentId,
        assessmentName: a.assessmentName,
        details: `${a.respondentName} · ${a.respondentEmail}`,
        status: a.assessmentStatus,
        link: null,
        allotmentId: a.respondentAssessmentMappingId,
      }));
    return [...catalogRows, ...allotmentRows];
  }, [catalog, allotments, links]);

  const filteredMembers = useMemo(() => {
    if (!respondentSearch) return members;
    const s = respondentSearch.toLowerCase();
    return members.filter(
      (m) => m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s),
    );
  }, [members, respondentSearch]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard blocked — the URL is on screen to select manually */
    }
  };

  // ── Registration link actions ────────────────────────────────────────
  const generateLink = async (assessmentId: number | null) => {
    if (orgId == null) return;
    setBusy(`gen-${assessmentId ?? 'org'}`);
    setLoadError('');
    try {
      await organizationApis.generateRegistrationLink({
        organizationId: orgId,
        assessmentId,
        maxUses: null,
        expiresAt: null,
      });
      await loadOrganization(orgId, false);
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || e?.message || 'Failed to generate the link');
    } finally {
      setBusy('');
    }
  };

  const rotateLink = async (link: RegistrationLinkRef) => {
    if (orgId == null) return;
    setBusy(`rot-${link.registrationTokenId}`);
    try {
      await organizationApis.rotateRegistrationLink(link.registrationTokenId);
      await loadOrganization(orgId, false);
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || e?.message || 'Failed to rotate the link');
    } finally {
      setBusy('');
    }
  };

  /** Pause / resume — the URL survives, it just stops accepting registrations. */
  const toggleLink = async (link: RegistrationLinkRef) => {
    if (orgId == null) return;
    setBusy(`tog-${link.registrationTokenId}`);
    try {
      await organizationApis.setRegistrationLinkStatus(
        link.registrationTokenId,
        link.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      );
      await loadOrganization(orgId, false);
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || e?.message || 'Failed to update the link');
    } finally {
      setBusy('');
    }
  };

  const deleteLink = async (link: RegistrationLinkRef) => {
    if (orgId == null) return;
    setBusy(`del-${link.registrationTokenId}`);
    try {
      await organizationApis.deleteRegistrationLink(link.registrationTokenId);
      await loadOrganization(orgId, false);
    } catch (e: any) {
      setLoadError(e?.response?.data?.message || e?.message || 'Failed to delete the link');
    } finally {
      setBusy('');
    }
  };

  // ── Create mapping ───────────────────────────────────────────────────
  const createMapping = async () => {
    if (orgId == null) return;
    setFormError('');
    setFormNote('');
    const assessmentId = Number(formAssessmentId);
    if (!formAssessmentId) { setFormError('Pick an assessment to map'); return; }
    if (formLevel === 'GROUP') { setFormError('Groups do not exist yet — map to the whole organization or to individual respondents'); return; }
    if (formLevel === 'RESPONDENT' && pickedRespondents.size === 0) {
      setFormError('Pick at least one respondent');
      return;
    }

    setBusy('create');
    try {
      if (formLevel === 'ORGANIZATION') {
        if (!mappedIds.has(assessmentId)) {
          await organizationApis.assignAssessments(orgId, [assessmentId]);
        }
        if (assignAllMembers) {
          // The assign endpoint is all-or-nothing and 409s on a repeat, so
          // members who already hold this assessment are filtered out here
          // rather than failing the whole batch.
          const already = new Set(
            allotments.filter((a) => a.assessmentId === assessmentId).map((a) => a.respondentUserId),
          );
          const targets = members.map((m) => m.respondentUserId).filter((id) => !already.has(id));
          if (targets.length > 0) {
            await organizationApis.assignAssessmentToMembers(assessmentId, targets);
            setFormNote(`Mapped, and assigned to ${targets.length} member${targets.length !== 1 ? 's' : ''}.`);
          } else {
            setFormNote('Mapped. Every current member already held this assessment.');
          }
        }
      } else {
        // An org member may only receive an assessment already in their org's
        // catalog — the API refuses otherwise. Map it first rather than
        // handing back a 409 the admin has to decode.
        const autoMapped = !mappedIds.has(assessmentId);
        if (autoMapped) {
          await organizationApis.assignAssessments(orgId, [assessmentId]);
        }
        const already = new Set(
          allotments.filter((a) => a.assessmentId === assessmentId).map((a) => a.respondentUserId),
        );
        const targets = [...pickedRespondents].filter((id) => !already.has(id));
        if (targets.length === 0) {
          setFormError('Everyone picked already holds this assessment');
          setBusy('');
          return;
        }
        await organizationApis.assignAssessmentToMembers(assessmentId, targets);
        setFormNote(
          autoMapped
            ? `Assigned to ${targets.length} respondent${targets.length !== 1 ? 's' : ''}. The assessment was added to this organization's catalog first, as members can only be given assessments it holds.`
            : `Assigned to ${targets.length} respondent${targets.length !== 1 ? 's' : ''}.`,
        );
      }
      setFormAssessmentId('');
      setPickedRespondents(new Set());
      setAssignAllMembers(false);
      await loadOrganization(orgId, false);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to create the mapping');
    } finally {
      setBusy('');
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────
  const doDelete = async () => {
    if (!confirmDelete || orgId == null) return;
    setDeleteError('');
    setBusy('delete');
    try {
      if (confirmDelete.level === 'ORGANIZATION') {
        // Refuses while members hold allotments for it, and takes the
        // catalog entry's registration link with it.
        await organizationApis.unassignAssessments(orgId, [confirmDelete.assessmentId]);
      } else {
        await respondentMappingApis.deleteAssignment(confirmDelete.allotmentId!);
      }
      setConfirmDelete(null);
      await loadOrganization(orgId, false);
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to remove the mapping');
    } finally {
      setBusy('');
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  /**
   * Link controls — the same block serves the org-wide card and every table
   * row, and deliberately mirrors the organization wizard's registration-link
   * row: a Paused/Active pill, the use count, then pause/resume, regenerate
   * and delete as icon buttons, with the full URL on its own line. Admins
   * paste these into emails, so the URL is shown rather than hidden behind a
   * copy button.
   */
  const LinkControls = ({ link, assessmentId }: { link: RegistrationLinkRef | null; assessmentId: number | null }) => {
    const genKey = `gen-${assessmentId ?? 'org'}`;
    if (!link) {
      return (
        <Button variant="outline" size="sm" onClick={() => generateLink(assessmentId)} disabled={busy === genKey}>
          {busy === genKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Generate link
        </Button>
      );
    }
    const url = registrationLinkUrl(link.token);
    const key = String(link.registrationTokenId);
    const paused = link.status !== 'ACTIVE';
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
            paused
              ? 'bg-muted text-muted-foreground'
              : 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
          )}>
            {paused ? 'Paused' : 'Active'}
          </span>
          <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
            {link.usedCount}
            {link.maxUses !== null && `/${link.maxUses}`} used
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleLink(link)}
            disabled={busy === `tog-${key}`}
            title={paused ? 'Resume registrations' : 'Pause registrations'}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => rotateLink(link)}
            disabled={busy === `rot-${key}`}
            title="Regenerate — the current URL stops working immediately"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy === `rot-${key}` && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => deleteLink(link)}
            disabled={busy === `del-${key}`}
            title="Delete this link"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
            {url}
          </code>
          <Button variant="outline" size="sm" onClick={() => copy(url, key)}>
            {copied === key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied === key ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Assessment Library</span><span>/</span>
          <span className="text-foreground font-medium">Organization Mapping</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Organization Mapping
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Manage an organization's assessment catalog, its self-registration
          links, and the assessments allotted to its respondents. Mapping to the
          whole organization decides what the organization <em>may</em> use and is
          what a registration link hangs off; mapping to a respondent allots the
          assessment to that person.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      {/* ── Organization picker ─────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Search Organization</label>
            <div className="relative mt-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Type to filter…"
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                className={cn(inputClass, 'pl-9')}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Organization</label>
            <select
              value={orgId ?? ''}
              onChange={(e) => selectOrganization(e.target.value ? Number(e.target.value) : null)}
              className={cn(inputClass, 'mt-1.5')}
            >
              <option value="">-- Select an organization --</option>
              {filteredOrganizations.map((o) => (
                <option key={o.organizationId} value={o.organizationId}>
                  {o.name} ({o.memberCount} member{o.memberCount !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {orgId == null ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Building2 className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">Pick an organization</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Its mapped assessments, registration links and existing mappings appear here.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading {org?.name}…</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Mapped assessments ───────────────────────────────────── */}
          <Card>
            <CardHeader className="py-3.5">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" />
                  Mapped Assessments
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {catalog.length} mapped · removing one takes it out of this organization's catalog
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {catalog.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No assessments mapped yet — add one below.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {catalog.map((c) => (
                    <span
                      key={c.assessmentId}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-green-300 bg-green-50 py-1 pl-3 pr-2 text-xs font-medium text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400"
                    >
                      <span className="truncate">{c.name}</span>
                      <button
                        type="button"
                        title="Remove from this organization"
                        onClick={() =>
                          setConfirmDelete({
                            key: `org-${c.assessmentId}`,
                            level: 'ORGANIZATION',
                            assessmentId: c.assessmentId,
                            assessmentName: c.name,
                            details: 'Whole organization',
                            status: c.status,
                            link: links.byAssessmentId.get(c.assessmentId) ?? null,
                          })
                        }
                        className="shrink-0 rounded-full p-0.5 text-red-600 transition-colors hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/40"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Organization-wide link ───────────────────────────────── */}
          <Card>
            <CardHeader className="py-3.5">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4 shrink-0 text-primary" />
                  Organization-wide Registration Link
                </CardTitle>
                <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
                  Whoever opens this joins <strong>{org?.name}</strong> as a respondent.
                  It grants no assessment on its own — allot one afterwards, or share a
                  per-assessment link from the table below.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-w-2xl">
                <LinkControls link={links.organizationLink} assessmentId={null} />
              </div>
            </CardContent>
          </Card>

          {/* ── Create new mapping ───────────────────────────────────── */}
          <Card>
            <CardHeader className="py-3.5">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Create New Mapping
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Assessment</label>
                  <select
                    value={formAssessmentId}
                    onChange={(e) => { setFormAssessmentId(e.target.value); setFormError(''); setFormNote(''); }}
                    className={cn(inputClass, 'mt-1.5')}
                  >
                    <option value="">-- Select an assessment --</option>
                    {allAssessments.map((a) => (
                      <option key={a.assessmentId} value={a.assessmentId}>
                        {a.name}
                        {mappedIds.has(a.assessmentId) ? ' (already mapped)' : ''}
                        {a.status !== 'ACTIVE' ? ' — inactive' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Mapping Level</label>
                  <select
                    value={formLevel}
                    onChange={(e) => { setFormLevel(e.target.value as MappingLevel); setFormError(''); setFormNote(''); }}
                    className={cn(inputClass, 'mt-1.5')}
                  >
                    <option value="ORGANIZATION">{LEVEL_LABEL.ORGANIZATION}</option>
                    <option value="RESPONDENT">{LEVEL_LABEL.RESPONDENT}</option>
                    {/* Respondent groups do not exist in the backend yet —
                        offered so the level is visible, disabled so it cannot
                        be chosen until they do. */}
                    <option value="GROUP" disabled>{LEVEL_LABEL.GROUP} (not set up yet)</option>
                  </select>
                </div>
              </div>

              {formLevel === 'ORGANIZATION' && (
                <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignAllMembers}
                    onChange={(e) => setAssignAllMembers(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <span>
                    Also assign it to every current member now
                    <span className="block text-xs text-muted-foreground">
                      Mapping alone only puts the assessment in the catalog. This
                      allots it to the {members.length} member{members.length !== 1 ? 's' : ''} who
                      belong to the organization today — anyone who joins later is not included.
                    </span>
                  </span>
                </label>
              )}

              {formLevel === 'RESPONDENT' && (
                <div>
                  <label className="text-sm font-medium">
                    Respondents
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {pickedRespondents.size} selected
                    </span>
                  </label>
                  <div className="mt-1.5 rounded-lg border border-border">
                    <div className="relative border-b border-border p-2">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search by name or email…"
                        value={respondentSearch}
                        onChange={(e) => setRespondentSearch(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring"
                      />
                    </div>
                    <ul className="max-h-64 overflow-y-auto divide-y divide-border">
                      {filteredMembers.length === 0 ? (
                        <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                          {members.length === 0
                            ? 'This organization has no respondents yet.'
                            : 'No respondent matches that search.'}
                        </li>
                      ) : (
                        filteredMembers.map((m) => {
                          const picked = pickedRespondents.has(m.respondentUserId);
                          return (
                            <li key={m.respondentUserId}>
                              <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                                <input
                                  type="checkbox"
                                  checked={picked}
                                  onChange={() => {
                                    const next = new Set(pickedRespondents);
                                    if (picked) next.delete(m.respondentUserId);
                                    else next.add(m.respondentUserId);
                                    setPickedRespondents(next);
                                  }}
                                  className="rounded"
                                />
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium truncate">{m.name}</span>
                                  <span className="block text-xs text-muted-foreground truncate">{m.email}</span>
                                </span>
                              </label>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {formError}
                </div>
              )}
              {formNote && (
                <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                  {formNote}
                </div>
              )}

              <Button variant="primary" onClick={createMapping} disabled={busy === 'create'}>
                {busy === 'create' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create Mapping
              </Button>
            </CardContent>
          </Card>

          {/* ── Existing mappings ────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 py-3.5">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-primary" />
                Existing Mappings
              </CardTitle>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {rows.length} total
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">
                  Nothing mapped to this organization yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  {/* Fixed widths on every column but Details: the link cell
                      is the tall one, and letting it size itself made each
                      row a different shape. */}
                  <table className="w-full min-w-5xl text-sm">
                    <colgroup>
                      <col className="w-64" />
                      <col className="w-34" />
                      <col />
                      <col className="w-30" />
                      <col className="w-96" />
                      <col className="w-20" />
                    </colgroup>
                    <thead>
                      <tr className="border-y border-border bg-muted/40 text-left text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2.5 font-medium">Assessment</th>
                        <th className="px-4 py-2.5 font-medium">Level</th>
                        <th className="px-4 py-2.5 font-medium">Details</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 font-medium">Registration Link</th>
                        <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <tr key={r.key} className="align-top hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <span className="block truncate font-medium" title={r.assessmentName}>
                              {r.assessmentName}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
                              r.level === 'ORGANIZATION'
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border bg-muted/40 text-muted-foreground',
                            )}>
                              {r.level === 'ORGANIZATION' ? 'Organization' : 'Respondent'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <span className="block truncate" title={r.details}>{r.details}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium', statusChip(r.status))}>
                              {pretty(r.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {r.level === 'ORGANIZATION' ? (
                              <LinkControls link={r.link} assessmentId={r.assessmentId} />
                            ) : (
                              <span
                                className="text-xs text-muted-foreground"
                                title="Registration links create respondents — this one already exists"
                              >
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setDeleteError(''); setConfirmDelete(r); }}
                                title="Remove this mapping"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Delete confirmation ─────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Remove Mapping
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {confirmDelete.level === 'ORGANIZATION' ? (
                <p className="text-sm">
                  Take <strong>{confirmDelete.assessmentName}</strong> out of{' '}
                  <strong>{org?.name}</strong>'s catalog? Its registration link is
                  deleted with it, and the URL stops working. Members already
                  holding this assessment must be removed first.
                </p>
              ) : (
                <p className="text-sm">
                  Remove <strong>{confirmDelete.assessmentName}</strong> from{' '}
                  <strong>{confirmDelete.details.split(' · ')[0]}</strong>? A
                  completed attempt cannot be removed.
                </p>
              )}
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {deleteError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} disabled={busy === 'delete'} className="bg-red-600 hover:bg-red-700 text-white">
                  {busy === 'delete' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
