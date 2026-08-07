import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardList,
  Copy,
  ImagePlus,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  organizationApis,
  registrationLinkUrl,
  type AssessmentRef,
  type Gender,
  type OrgAssessmentRef,
  type OrgMemberRef,
  type OrgRespondentCreatePayload,
  type OrganizationPayload,
  type OrganizationRegistrationLinks,
  type OrganizationResponse,
  type RegistrationLinkRef,
} from './organizationApis';

/**
 * Three-step organization flow, rendered inline on the organizations page in
 * place of the list (not a modal). One component serves both ADD and EDIT —
 * pass `existing` to edit. The only real difference is where step 1 starts:
 * add posts a new row, edit puts to the one it was handed, and from there
 * both are the same screens over the same org.
 *
 * Every step owns exactly ONE piece of server state and fires its own
 * request — nothing is batched up and submitted at the end:
 *
 *   1. Details      → POST /api/organizations/create  (add)
 *                     PUT  /api/organizations/update/{id}  (edit, or re-save)
 *   2. Assessments  → PUT  /api/organizations/assign-assessments/{id}
 *                     PUT  /api/organizations/unassign-assessments/{id}
 *   3. Respondents  → PUT  /api/organizations/assign/{id}    (existing people)
 *                     PUT  /api/organizations/unassign/{id}  (remove a member)
 *                     POST /api/respondents/create           (brand-new people)
 *
 * Consequence of that design, surfaced in the UI rather than hidden: the
 * organization is REAL from the end of step 1 onwards (and from the outset
 * when editing). Bailing out at step 2 or 3 leaves whatever the earlier steps
 * already saved, which is a valid state — the list's own map/assign actions
 * finish the job later.
 */

const STEPS = [
  { n: 1 as const, title: 'Details', hint: 'Name, email, description, logo' },
  { n: 2 as const, title: 'Assessments', hint: "The org's catalog" },
  { n: 3 as const, title: 'Respondents', hint: 'Members of the org' },
];

type StepNumber = 1 | 2 | 3;

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

// Client-side guard: reject anything that isn't a reasonable logo before we
// base64-encode it into the row. 2 MB matches the backend's @Size cap once
// base64 inflates the bytes by ~⅓.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

// DOB is dd-mm-yyyy everywhere — display, input and wire — so the form keeps
// the raw string and only auto-inserts the dashes while typing. Same rule as
// the Respondents page.
const autoFormatDobDashes = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('-');
};

const isValidDob = (dob: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dob);
  if (!m) return false;
  const [, dd, mm, yyyy] = m.map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  return date.getFullYear() === yyyy && date.getMonth() === mm - 1 && date.getDate() === dd;
};

const apiError = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

/** One row of the "create new respondents" table in step 3. */
interface NewRespondentRow {
  key: number;
  name: string;
  email: string;
  dob: string;
  phone: string;
  employeeId: string;
  gender: Gender | '';
  isConsented: boolean;
}

const emptyRow = (key: number): NewRespondentRow => ({
  key,
  name: '',
  email: '',
  dob: '',
  phone: '',
  employeeId: '',
  gender: '',
  isConsented: false,
});

interface OrganizationWizardProps {
  /** The org being edited, or null/undefined to add a new one. */
  existing?: OrganizationResponse | null;
  /** Fired after any step writes to the server, so the list behind refreshes. */
  onChanged: () => void | Promise<void>;
  /** Leave the wizard — cancel or finish. */
  onExit: () => void;
}

export default function OrganizationWizard({
  existing,
  onChanged,
  onExit,
}: OrganizationWizardProps) {
  const isEdit = !!existing;
  const [step, setStep] = useState<StepNumber>(1);
  /**
   * The org every step after 1 works on: handed in when editing, set the
   * moment step 1's create succeeds when adding. Null means "nothing exists
   * yet", which is what gates steps 2 and 3.
   */
  const [org, setOrg] = useState<OrganizationResponse | null>(existing ?? null);

  // ── Step 1 — details ────────────────────────────────────────────────────
  const [name, setName] = useState(existing?.name ?? '');
  const [orgEmail, setOrgEmail] = useState(existing?.orgEmail ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [logoBase64, setLogoBase64] = useState(existing?.logoBase64 ?? '');
  const [detailsError, setDetailsError] = useState('');
  const [detailsSaving, setDetailsSaving] = useState(false);

  // ── Step 2 — assessment catalog ─────────────────────────────────────────
  const [allAssessments, setAllAssessments] = useState<AssessmentRef[] | null>(null);
  const [catalog, setCatalog] = useState<OrgAssessmentRef[] | null>(null);
  const [mapChecked, setMapChecked] = useState<Set<number>>(new Set());
  const [mapSearch, setMapSearch] = useState('');
  const [mapError, setMapError] = useState('');
  const [mapSaving, setMapSaving] = useState(false);
  /** Which mapped row's unmap is in flight. */
  const [unmapBusy, setUnmapBusy] = useState<number | null>(null);

  // ── Step 3 — respondents ────────────────────────────────────────────────
  const [peopleTab, setPeopleTab] = useState<'existing' | 'new'>('existing');
  /** The org's CURRENT members — what edit mode mostly came here to change. */
  const [members, setMembers] = useState<OrgMemberRef[] | null>(null);
  const [unassigned, setUnassigned] = useState<OrgMemberRef[] | null>(null);
  const [checkedRespondents, setCheckedRespondents] = useState<Set<number>>(new Set());
  const [peopleSearch, setPeopleSearch] = useState('');
  const [newRows, setNewRows] = useState<NewRespondentRow[]>([]);
  const [peopleError, setPeopleError] = useState('');
  /** Which member's unassign is in flight. */
  const [memberBusy, setMemberBusy] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  // ── Step 3 — self-registration links ────────────────────────────────────
  // Every link the org COULD have, minted or not — the server sends the
  // un-minted rows too, so this is the whole list to draw.
  const [links, setLinks] = useState<OrganizationRegistrationLinks | null>(null);
  const [linkError, setLinkError] = useState('');
  /** Which row has an action in flight — 'org' or an assessment id. */
  const [linkBusy, setLinkBusy] = useState<'org' | number | null>(null);
  /** Last token copied, so only that row shows the confirmation. */
  const [copiedToken, setCopiedToken] = useState('');
  // Row keys only need to be unique within this mount — a counter beats a
  // timestamp (two rows added in the same millisecond would collide).
  const rowKey = useRef(0);

  // ── Step 1 ──────────────────────────────────────────────────────────────

  // Read a picked image into a base64 data URL for inline storage. Validates
  // type + size here so an oversized file never reaches the API.
  const onLogoPick = (file: File | null) => {
    if (!file) return;
    if (!LOGO_ACCEPT.split(',').includes(file.type)) {
      setDetailsError('Logo must be a PNG, JPG, SVG or WebP image');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setDetailsError('Logo image is too large — use one under 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDetailsError('');
      setLogoBase64(String(reader.result));
    };
    reader.onerror = () => setDetailsError('Could not read that image — try another file');
    reader.readAsDataURL(file);
  };

  /**
   * Step 1 holds the only edits that are NOT saved the moment you make them,
   * so anything that navigates away from it has to save first. This is how
   * those paths know whether there is anything to save.
   */
  const detailsDirty = !org
    || name.trim() !== org.name
    || (orgEmail.trim() || null) !== org.orgEmail
    || (description.trim() || null) !== org.description
    || (logoBase64 || null) !== org.logoBase64;

  /**
   * Step 1's request. Creates when there is no org yet; otherwise updates —
   * which covers both editing an existing org and coming BACK to step 1
   * mid-add, so a re-save never creates a second organization.
   *
   * `next` is where to land afterwards: a step number, or 'exit' to save and
   * leave the wizard entirely (the "Save" button, which skips steps 2 and 3).
   */
  const saveDetails = async (next: StepNumber | 'exit' = 2) => {
    const land = () => (next === 'exit' ? onExit() : setStep(next));

    const trimmedName = name.trim();
    if (!trimmedName) {
      setDetailsError('Name is required');
      return;
    }
    const trimmedEmail = orgEmail.trim();
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      setDetailsError('That does not look like a valid email address');
      return;
    }
    // Nothing changed — an identical PUT would be pure noise, so just move on.
    if (org && !detailsDirty) {
      setDetailsError('');
      land();
      return;
    }
    // assessmentIds stays null — step 2 owns the catalog, one request each.
    const payload: OrganizationPayload = {
      name: trimmedName,
      orgEmail: trimmedEmail || null,
      description: description.trim() || null,
      logoBase64: logoBase64 || null,
      assessmentIds: null,
    };
    setDetailsError('');
    setDetailsSaving(true);
    try {
      const res = org
        ? await organizationApis.updateOrganization(org.organizationId, payload)
        : await organizationApis.createOrganization(payload);
      setOrg(res.data);
      await onChanged();
      land();
    } catch (e: any) {
      setDetailsError(apiError(e, 'Failed to save the organization'));
    } finally {
      setDetailsSaving(false);
    }
  };

  // ── Step 2 ──────────────────────────────────────────────────────────────

  // Load the catalog lazily, once the org exists and step 2 is on screen.
  useEffect(() => {
    if (step !== 2 || !org) return;
    let cancelled = false;
    setMapError('');
    (async () => {
      try {
        const [all, mapped] = await Promise.all([
          organizationApis.getAllAssessments(),
          organizationApis.getOrganizationAssessments(org.organizationId),
        ]);
        if (cancelled) return;
        setAllAssessments(all.data);
        setCatalog(mapped.data);
      } catch (e: any) {
        if (!cancelled) setMapError(apiError(e, 'Failed to load assessments'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, org]);

  /**
   * Step 2's request. Nothing picked is a legitimate outcome — the endpoint
   * 400s on an empty list, so we skip the call entirely instead.
   */
  const saveAssessments = async () => {
    if (!org) return;
    if (mapChecked.size === 0) {
      setStep(3);
      return;
    }
    setMapError('');
    setMapSaving(true);
    try {
      const res = await organizationApis.assignAssessments(
        org.organizationId, Array.from(mapChecked));
      setCatalog(res.data);
      setMapChecked(new Set());
      await onChanged();
      setStep(3);
    } catch (e: any) {
      setMapError(apiError(e, 'Failed to map assessments'));
    } finally {
      setMapSaving(false);
    }
  };

  /**
   * Take an assessment back out of the catalog. Fires immediately rather than
   * on Next — it is a removal, so batching it up behind a "continue" button
   * would be a nasty surprise. The backend refuses (409) while any of this
   * org's members still hold attempt rows for it.
   */
  const unmapAssessment = async (assessmentId: number) => {
    if (!org) return;
    setMapError('');
    setUnmapBusy(assessmentId);
    try {
      const res = await organizationApis.unassignAssessments(org.organizationId, [assessmentId]);
      setCatalog(res.data);
      await onChanged();
    } catch (e: any) {
      setMapError(apiError(e, 'Failed to unmap that assessment'));
    } finally {
      setUnmapBusy(null);
    }
  };

  // ── Step 3 ──────────────────────────────────────────────────────────────

  // Current members plus the pool that can be added: only people with no
  // organization at all are attachable, so moving someone between orgs still
  // happens from their own page.
  useEffect(() => {
    if (step !== 3 || !org) return;
    let cancelled = false;
    (async () => {
      try {
        const [detail, pool, linkRows] = await Promise.all([
          organizationApis.getOrganizationById(org.organizationId),
          organizationApis.getUnassignedPeople(),
          organizationApis.getOrganizationRegistrationLinks(org.organizationId),
        ]);
        if (cancelled) return;
        setMembers(detail.data.members);
        setUnassigned(pool.data.respondents);
        setLinks(linkRows.data);
      } catch (e: any) {
        if (!cancelled) setPeopleError(apiError(e, 'Failed to load respondents'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, org]);

  /**
   * Detach a member. Like unmap, this happens on click rather than on Finish
   * — removals should never be queued up behind a navigation button.
   */
  const unassignMember = async (respondentUserId: number) => {
    if (!org) return;
    setPeopleError('');
    setMemberBusy(respondentUserId);
    try {
      const res = await organizationApis.unassignPeople(org.organizationId, {
        practitionerIds: [],
        respondentIds: [respondentUserId],
      });
      setMembers(res.data.members);
      // They are unaffiliated again, so they belong back in the add pool.
      const pool = await organizationApis.getUnassignedPeople();
      setUnassigned(pool.data.respondents);
      await onChanged();
    } catch (e: any) {
      setPeopleError(apiError(e, 'Failed to remove that member'));
    } finally {
      setMemberBusy(null);
    }
  };

  /**
   * Every link action ends by re-reading the whole set rather than patching
   * one row: generate, rotate and delete all change what the OTHER rows may
   * do (a target with a link cannot be generated again), and the list is
   * small enough that one round trip beats keeping two copies in step.
   */
  const runLinkAction = async (
    row: 'org' | number,
    action: () => Promise<unknown>,
    fallback: string,
  ) => {
    if (!org) return;
    setLinkError('');
    setLinkBusy(row);
    try {
      await action();
      const fresh = await organizationApis.getOrganizationRegistrationLinks(org.organizationId);
      setLinks(fresh.data);
    } catch (e: any) {
      setLinkError(apiError(e, fallback));
    } finally {
      setLinkBusy(null);
    }
  };

  /** assessmentId null mints the org-wide link. Limits stay unset for now. */
  const generateLink = (assessmentId: number | null) =>
    runLinkAction(assessmentId ?? 'org', () => organizationApis.generateRegistrationLink({
      organizationId: org!.organizationId,
      assessmentId,
      maxUses: null,
      expiresAt: null,
    }), 'Failed to generate the registration link');

  const rotateLink = (row: 'org' | number, link: RegistrationLinkRef) =>
    runLinkAction(row, () => organizationApis.rotateRegistrationLink(link.registrationTokenId),
      'Failed to regenerate the link');

  const toggleLink = (row: 'org' | number, link: RegistrationLinkRef) =>
    runLinkAction(row, () => organizationApis.setRegistrationLinkStatus(
      link.registrationTokenId, link.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'),
      'Failed to change the link status');

  const deleteLink = (row: 'org' | number, link: RegistrationLinkRef) =>
    runLinkAction(row, () => organizationApis.deleteRegistrationLink(link.registrationTokenId),
      'Failed to delete the link');

  /** Clipboard needs a secure context — fall back to a readable message. */
  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(registrationLinkUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((current) => (current === token ? '' : current)), 2000);
    } catch {
      setLinkError('Could not copy automatically — select the URL and copy it manually.');
    }
  };

  const patchRow = (key: number, patch: Partial<NewRespondentRow>) =>
    setNewRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /**
   * Validate the whole batch before a single request goes out — the backend
   * creates respondents one at a time, so a bad row 3 would otherwise only
   * surface after rows 1 and 2 were already committed. Duplicates WITHIN the
   * batch are checked here too for the same reason.
   */
  const validateNewRows = (rows: NewRespondentRow[]): string | null => {
    const emails = new Set<string>();
    const employeeIds = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const at = `Respondent ${i + 1}`;
      if (!row.name.trim()) return `${at}: name is required`;
      const email = row.email.trim().toLowerCase();
      if (!email) return `${at}: email is required`;
      if (!EMAIL_RE.test(email)) return `${at}: "${row.email.trim()}" is not a valid email address`;
      if (emails.has(email)) return `${at}: the email "${row.email.trim()}" is repeated in this batch`;
      emails.add(email);
      if (!row.dob.trim()) return `${at}: date of birth is required`;
      if (!isValidDob(row.dob.trim())) return `${at}: date of birth must be a real date in DD-MM-YYYY`;
      const employeeId = row.employeeId.trim().toUpperCase();
      if (employeeId) {
        if (!/^[A-Za-z0-9]+$/.test(employeeId)) {
          return `${at}: employee ID must contain only letters and numbers`;
        }
        if (employeeId.length > 32) return `${at}: employee ID must be at most 32 characters`;
        if (employeeIds.has(employeeId)) {
          return `${at}: the employee ID "${employeeId}" is repeated in this batch`;
        }
        employeeIds.add(employeeId);
      }
    }
    return null;
  };

  const toPayload = (row: NewRespondentRow, organizationId: number): OrgRespondentCreatePayload => ({
    name: row.name.trim(),
    email: row.email.trim(),
    dob: row.dob.trim(),
    phone: row.phone.trim() || null,
    employeeId: row.employeeId.trim() || null,
    gender: row.gender || null,
    isConsented: row.isConsented,
    organizationId,
  });

  /**
   * Step 3's request(s). Existing people go in one atomic call; new people
   * are created one at a time because the backend has no bulk endpoint —
   * so a mid-batch failure reports exactly how far it got and leaves the
   * uncreated rows in the form to fix and retry.
   */
  const finish = async () => {
    if (!org) return;
    const rows = newRows;
    const problem = validateNewRows(rows);
    if (problem) {
      setPeopleTab('new');
      setPeopleError(problem);
      return;
    }

    setPeopleError('');
    setFinishing(true);
    try {
      if (checkedRespondents.size > 0) {
        await organizationApis.assignPeople(org.organizationId, {
          practitionerIds: [],
          respondentIds: Array.from(checkedRespondents),
        });
        // Cleared so a retry after a later failure cannot assign them twice.
        setCheckedRespondents(new Set());
      }

      let done = 0;
      for (const row of rows) {
        try {
          await organizationApis.createRespondent(toPayload(row, org.organizationId));
          done++;
        } catch (e: any) {
          setNewRows(rows.slice(done));
          setPeopleTab('new');
          setPeopleError(
            `Added ${done} of ${rows.length} — "${row.email.trim()}" failed: ${apiError(e, 'could not be created')}. ` +
            'The rows below were not created; fix the first one and try again.',
          );
          await onChanged();
          return;
        }
      }

      await onChanged();
      onExit();
    } catch (e: any) {
      setPeopleError(apiError(e, 'Failed to add respondents'));
      setPeopleTab('existing');
    } finally {
      setFinishing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const busy = detailsSaving || mapSaving || finishing
    || unmapBusy !== null || memberBusy !== null;

  const goToStep = (target: StepNumber) => {
    if (target === step) return;
    if (step === 1 && detailsDirty) {
      saveDetails(target);
      return;
    }
    setStep(target);
  };

  const mappedIds = new Set((catalog ?? []).map((c) => c.assessmentId));
  const mapQuery = mapSearch.trim().toLowerCase();
  const mapCandidates = (allAssessments ?? [])
    .filter((a) => !mappedIds.has(a.assessmentId))
    .filter((a) => !mapQuery
      || a.name.toLowerCase().includes(mapQuery)
      || a.questionnaireName.toLowerCase().includes(mapQuery));

  const peopleQuery = peopleSearch.trim().toLowerCase();
  const peopleCandidates = (unassigned ?? []).filter((r) => !peopleQuery
    || r.name.toLowerCase().includes(peopleQuery)
    || r.email.toLowerCase().includes(peopleQuery)
    || (r.serialId || '').toLowerCase().includes(peopleQuery));

  const errorBox = (message: string) => (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <ol className="flex items-center gap-2 sm:gap-4">
            {STEPS.map((s, i) => {
              const state = s.n === step ? 'current' : s.n < step ? 'done' : 'todo';
              // Any step is reachable once the org exists — always true when
              // editing, true after step 1 when adding. Before that there is
              // no id for steps 2 and 3 to work on, so they stay locked.
              const reachable = !!org && !busy;
              return (
                <li key={s.n} className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 last:flex-none">
                  <button
                    type="button"
                    disabled={!reachable || s.n === step}
                    onClick={() => goToStep(s.n)}
                    title={!reachable ? undefined
                      : step === 1 && detailsDirty
                        ? `Save details and go to ${s.title}`
                        : `Go to ${s.title}`}
                    className={cn(
                      'flex items-center gap-2.5 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors',
                      reachable && s.n !== step && 'hover:bg-muted/50 cursor-pointer',
                      (!reachable || s.n === step) && 'cursor-default',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                        state === 'current' && 'border-primary bg-primary text-primary-foreground',
                        state === 'done' && 'border-primary/40 bg-primary/10 text-primary',
                        state === 'todo' && 'border-border bg-muted/40 text-muted-foreground',
                      )}
                    >
                      {state === 'done' ? <Check className="h-3.5 w-3.5" /> : s.n}
                    </span>
                    <div className="min-w-0 hidden sm:block">
                      <p className={cn(
                        'text-sm font-medium truncate',
                        state === 'todo' && 'text-muted-foreground',
                      )}>
                        {s.title}
                      </p>
                      <p className="text-[0.6875rem] text-muted-foreground truncate">{s.hint}</p>
                    </div>
                    <p className={cn(
                      'text-sm font-medium sm:hidden',
                      state === 'todo' && 'text-muted-foreground',
                    )}>
                      {s.title}
                    </p>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className={cn(
                      'h-px flex-1 min-w-4',
                      s.n < step ? 'bg-primary/40' : 'bg-border',
                    )} />
                  )}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Nothing here is one transaction — say so rather than letting the
          wizard framing imply a single submit at the end. */}
      {org && (isEdit || step > 1) && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-2.5 text-xs text-green-700 dark:text-green-400 flex items-start gap-2">
          <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            {isEdit ? 'Editing ' : null}
            <strong>{org.name}</strong>
            {isEdit ? '. ' : ' has been created. '}
            Each step saves on its own — jump between them with the numbers
            above, and leave whenever you like.
          </span>
        </div>
      )}

      {/* ── Step 1 — details ─────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-4 max-w-2xl">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Basic details
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isEdit
                  ? 'Who this organization is. Saving updates it and moves you on to its assessment catalog.'
                  : 'Who this organization is. Saving creates it and moves you on to its assessment catalog.'}
              </p>
            </div>

            {detailsError && errorBox(detailsError)}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Apollo Hospitals"
                maxLength={200}
                className={INPUT_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Organization Email</label>
              <input
                type="email"
                value={orgEmail}
                onChange={(e) => setOrgEmail(e.target.value)}
                placeholder="contact@organization.com"
                maxLength={200}
                className={INPUT_CLASS}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this organization is — school, clinic, company…"
                rows={3}
                className={cn(INPUT_CLASS, 'resize-y')}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Logo <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
                  {logoBase64 ? (
                    <img src={logoBase64} alt="Logo preview" className="h-full w-full object-contain" />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors w-fit">
                    <ImagePlus className="h-3.5 w-3.5" />
                    {logoBase64 ? 'Change logo' : 'Upload logo'}
                    <input
                      type="file"
                      accept={LOGO_ACCEPT}
                      className="hidden"
                      onChange={(e) => { onLogoPick(e.target.files?.[0] ?? null); e.target.value = ''; }}
                    />
                  </label>
                  {logoBase64 && (
                    <button
                      type="button"
                      onClick={() => setLogoBase64('')}
                      className="text-xs text-red-600 hover:underline w-fit"
                    >
                      Remove logo
                    </button>
                  )}
                  <p className="text-[0.6875rem] text-muted-foreground">PNG, JPG, SVG or WebP · up to 2 MB.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2 — assessments ─────────────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Map assessments
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                The org's catalog. Its members can only ever be given
                assessments mapped here — optional now, extendable later.
              </p>
            </div>

            {mapError && errorBox(mapError)}

            {catalog && catalog.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  <ClipboardList className="h-3.5 w-3.5" /> Already mapped
                  <span className="ml-auto normal-case tracking-normal">{catalog.length}</span>
                </div>
                <ul className="divide-y divide-border border border-border rounded-lg">
                  {catalog.map((c) => (
                    <li key={c.assessmentId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.questionnaireName} · {c.assignedMemberCount} member
                          {c.assignedMemberCount !== 1 ? 's' : ''} assigned
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
                          onClick={() => unmapAssessment(c.assessmentId)}
                          disabled={busy}
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
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                <Plus className="h-3.5 w-3.5" /> Pick assessments
                <span className="ml-auto normal-case tracking-normal">{mapChecked.size} selected</span>
              </div>
              <div className="relative mb-2 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search assessments..."
                  value={mapSearch}
                  onChange={(e) => setMapSearch(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
                />
              </div>
              {!allAssessments && !mapError ? (
                <div className="py-8 flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Loading assessments…</p>
                </div>
              ) : mapCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {(allAssessments ?? []).length === 0
                    ? 'No assessments in the catalog yet — you can map them later from the organization list.'
                    : mappedIds.size === (allAssessments ?? []).length
                      ? 'Every assessment is already mapped.'
                      : 'No assessments match your search.'}
                </p>
              ) : (
                <div className="border border-border rounded-lg max-h-80 overflow-y-auto">
                  {mapCandidates.map((a) => {
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
          </CardContent>
        </Card>
      )}

      {/* ── Step 3 — respondents ─────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Respondents
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Members of this organization — attach people who already exist,
                create brand-new ones, or both.
              </p>
            </div>

            {peopleError && errorBox(peopleError)}

            {/* ── Self-registration links ────────────────────────────────
                The third way into the org: instead of adding people here,
                share a URL and let them register themselves. Each link acts
                the moment it is generated — nothing waits for Finish. */}
            <div>
              <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                <Link2 className="h-3.5 w-3.5" /> Registration links
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Share a link and respondents register themselves straight into
                this organization. The organization-wide link lets them pick
                any active assessment; a per-assessment link fixes the choice.
              </p>

              {linkError && errorBox(linkError)}

              {!links ? (
                <div className="py-6 flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Loading registration links…</p>
                </div>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-lg">
                  <RegistrationLinkRow
                    title="Organization-wide link"
                    subtitle="Respondent picks any active assessment in the catalog"
                    link={links.organizationLink}
                    busy={linkBusy === 'org'}
                    disabled={busy || linkBusy !== null}
                    copied={!!links.organizationLink && copiedToken === links.organizationLink.token}
                    onGenerate={() => generateLink(null)}
                    onCopy={copyLink}
                    onRotate={(l) => rotateLink('org', l)}
                    onToggle={(l) => toggleLink('org', l)}
                    onDelete={(l) => deleteLink('org', l)}
                  />
                  {links.assessments.map((a) => (
                    <RegistrationLinkRow
                      key={a.assessmentId}
                      title={a.assessmentName}
                      subtitle={a.assessmentStatus === 'ACTIVE'
                        ? 'Assessment fixed by the link'
                        : 'Assessment is INACTIVE — this link will not open until it is activated'}
                      warn={a.assessmentStatus !== 'ACTIVE'}
                      link={a.link}
                      busy={linkBusy === a.assessmentId}
                      disabled={busy || linkBusy !== null}
                      copied={!!a.link && copiedToken === a.link.token}
                      onGenerate={() => generateLink(a.assessmentId)}
                      onCopy={copyLink}
                      onRotate={(l) => rotateLink(a.assessmentId, l)}
                      onToggle={(l) => toggleLink(a.assessmentId, l)}
                      onDelete={(l) => deleteLink(a.assessmentId, l)}
                    />
                  ))}
                </ul>
              )}
              {links && links.assessments.length === 0 && (
                <p className="text-xs text-muted-foreground italic mt-2">
                  Map assessments in step 2 to get a per-assessment link for each.
                </p>
              )}
            </div>

            {/* Current members. Removing one takes effect immediately — it is
                a removal, so it must not hide behind the Finish button. */}
            {members && members.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  <Users className="h-3.5 w-3.5" /> Current members
                  <span className="ml-auto normal-case tracking-normal">{members.length}</span>
                </div>
                <ul className="divide-y divide-border border border-border rounded-lg max-h-72 overflow-y-auto">
                  {members.map((m) => (
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unassignMember(m.respondentUserId)}
                        disabled={busy}
                        title="Remove from this organization"
                      >
                        {memberBusy === m.respondentUserId
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <UserMinus className="h-3 w-3" />}
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium">
              <UserPlus className="h-3.5 w-3.5" /> Add members
            </div>

            <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30 -mt-2">
              {([
                { id: 'existing' as const, label: 'Existing', count: checkedRespondents.size },
                { id: 'new' as const, label: 'New', count: newRows.length },
              ]).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPeopleTab(t.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    peopleTab === t.id
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-1.5 text-[0.6875rem] font-semibold">
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {peopleTab === 'existing' ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Only respondents without an organization are listed. Moving
                  someone between organizations is done from their own page.
                </p>
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search by name, email or serial..."
                    value={peopleSearch}
                    onChange={(e) => setPeopleSearch(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
                  />
                </div>
                {!unassigned && !peopleError ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground mt-2">Loading unassigned respondents…</p>
                  </div>
                ) : peopleCandidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    {(unassigned ?? []).length === 0
                      ? 'No unassigned respondents — create new ones on the "New" tab.'
                      : 'No respondents match your search.'}
                  </p>
                ) : (
                  <div className="border border-border rounded-lg max-h-96 overflow-y-auto">
                    {peopleCandidates.map((r) => {
                      const checked = checkedRespondents.has(r.respondentUserId);
                      return (
                        <button
                          key={r.respondentUserId}
                          type="button"
                          onClick={() => {
                            const next = new Set(checkedRespondents);
                            if (checked) next.delete(r.respondentUserId);
                            else next.add(r.respondentUserId);
                            setCheckedRespondents(next);
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
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  New respondents are created directly into this organization.
                  Date of birth doubles as their portal password; the employee
                  ID is an optional employer code, unique within the org, that
                  they can log in with instead of their email.
                </p>
                {newRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                      <UserPlus className="h-6 w-6 text-muted-foreground/60" />
                    </div>
                    <p className="text-sm font-medium">No new respondents yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add a row for each person you want to create.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {newRows.map((row, i) => (
                      <li key={row.key} className="rounded-lg border border-border p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium">
                            Respondent {i + 1}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            mode="icon"
                            onClick={() => setNewRows((rows) => rows.filter((r) => r.key !== row.key))}
                            title="Remove this row"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Name *</label>
                            <input
                              value={row.name}
                              onChange={(e) => patchRow(row.key, { name: e.target.value })}
                              placeholder="e.g., Arjun Patel"
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Email *</label>
                            <input
                              type="email"
                              value={row.email}
                              onChange={(e) => patchRow(row.key, { email: e.target.value })}
                              placeholder="arjun@company.com"
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Date of Birth *</label>
                            <input
                              inputMode="numeric"
                              value={row.dob}
                              onChange={(e) => patchRow(row.key, { dob: autoFormatDobDashes(e.target.value) })}
                              placeholder="DD-MM-YYYY"
                              maxLength={10}
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Phone</label>
                            <input
                              type="tel"
                              value={row.phone}
                              onChange={(e) => patchRow(row.key, { phone: e.target.value })}
                              placeholder="+91 98765 43210"
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Employee ID</label>
                            <input
                              value={row.employeeId}
                              onChange={(e) => patchRow(row.key, { employeeId: e.target.value })}
                              placeholder="e.g., EMP1042"
                              maxLength={32}
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Gender</label>
                            <select
                              value={row.gender}
                              onChange={(e) => patchRow(row.key, { gender: e.target.value as Gender | '' })}
                              className={INPUT_CLASS}
                            >
                              <option value="">Not specified</option>
                              {GENDERS.map((g) => (
                                <option key={g.value} value={g.value}>{g.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                          <input
                            type="checkbox"
                            checked={row.isConsented}
                            onChange={(e) => patchRow(row.key, { isConsented: e.target.checked })}
                            className="h-4 w-4 rounded border-border accent-primary"
                          />
                          Consent already given
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="outline"
                  onClick={() => setNewRows((rows) => [...rows, emptyRow(rowKey.current++)])}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add {newRows.length > 0 ? 'another ' : ''}respondent
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onExit} disabled={busy}>
          {org ? 'Close' : 'Cancel'}
        </Button>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => goToStep(step === 3 ? 2 : 1)}
              disabled={busy}
            >
              Back
            </Button>
          )}
          {step === 1 && (
            <>
              <Button variant="primary" onClick={() => saveDetails()} disabled={busy}>
                {detailsSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {org ? 'Save & continue' : 'Create & continue'}
              </Button>
              {/* Same request, but done afterwards — for when the details are
                  all you came to change and steps 2 and 3 are noise. */}
              <Button
                variant="outline"
                onClick={() => saveDetails('exit')}
                disabled={busy}
                title="Save and close — skip assessments and respondents"
              >
                <Check className="h-3.5 w-3.5" />
                {org ? 'Save' : 'Create'}
              </Button>
            </>
          )}
          {step === 2 && (
            <Button variant="primary" onClick={() => saveAssessments()} disabled={busy}>
              {mapSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <ClipboardList className="h-3.5 w-3.5" />
              {mapChecked.size > 0
                ? `Map ${mapChecked.size} & continue`
                : isEdit ? 'Continue' : 'Skip for now'}
            </Button>
          )}
          {step === 3 && (
            <Button variant="primary" onClick={() => finish()} disabled={busy}>
              {finishing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <UserPlus className="h-3.5 w-3.5" />
              {checkedRespondents.size + newRows.length > 0
                ? `Add ${checkedRespondents.size + newRows.length} & finish`
                : 'Finish'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One registration-link row: either a "Generate link" button, or the URL with
 * copy / regenerate / pause / delete. The same row serves the org-wide link
 * and every per-assessment one — the only difference is the text above it.
 *
 * The full URL is shown rather than hidden behind a copy button: an admin
 * pasting it into an email or a print job needs to see what they are sharing,
 * and the origin (portal.bodh.biz in production) is the part they will check.
 */
function RegistrationLinkRow({
  title,
  subtitle,
  warn,
  link,
  busy,
  disabled,
  copied,
  onGenerate,
  onCopy,
  onRotate,
  onToggle,
  onDelete,
}: {
  title: string;
  subtitle: string;
  /** Amber the subtitle — the link exists but will not currently open. */
  warn?: boolean;
  link: RegistrationLinkRef | null;
  busy: boolean;
  disabled: boolean;
  copied: boolean;
  onGenerate: () => void;
  onCopy: (token: string) => void;
  onRotate: (link: RegistrationLinkRef) => void;
  onToggle: (link: RegistrationLinkRef) => void;
  onDelete: (link: RegistrationLinkRef) => void;
}) {
  const paused = link?.status !== 'ACTIVE';
  return (
    <li className="px-3 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          <p className={cn('text-xs', warn ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground')}>
            {subtitle}
          </p>
        </div>

        {!link ? (
          <Button variant="outline" size="sm" onClick={onGenerate} disabled={disabled}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
            Generate link
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                paused
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
              )}
            >
              {paused ? 'Paused' : 'Active'}
            </span>
            <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
              {link.usedCount}
              {link.maxUses !== null && `/${link.maxUses}`} used
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggle(link)}
              disabled={disabled}
              title={paused ? 'Resume registrations' : 'Pause registrations'}
            >
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRotate(link)}
              disabled={disabled}
              title="Regenerate — the current URL stops working immediately"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(link)}
              disabled={disabled}
              title="Delete this link"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {link && (
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
            {registrationLinkUrl(link.token)}
          </code>
          <Button variant="outline" size="sm" onClick={() => onCopy(link.token)} disabled={disabled}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}
    </li>
  );
}
