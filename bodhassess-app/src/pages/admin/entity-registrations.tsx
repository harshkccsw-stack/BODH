import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardList,
  Link2,
  Mail,
  Phone,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  entityRegistrationsApi,
  respondentsApi,
  assessmentRecordsApi,
  type EntityRegistration,
  type Respondent,
  type AssessmentRecord,
} from '@/lib/api';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';
import { config } from '@/lib/config';

// Shareable member-registration link for an entity. Members who open it
// self-register into the company and are sent to the portal to log in.
// Strip any trailing slash from the base path so a basePath of "/" doesn't
// produce a double slash (".../entity/…" not "...//entity/…"), which would
// break route matching and the public-path guard.
const memberLink = (id: string) => {
  const base = config.basePath.replace(/\/+$/, '');
  return `${window.location.origin}${base}/entity/${encodeURIComponent(id)}/register`;
};

const EMPTY_REGISTER_FORM = {
  name: '',
  companyName: '',
  email: '',
  phone: '',
  dob: '',
};

export default function AdminEntityRegistrationsPage() {
  const [rows, setRows] = useState<EntityRegistration[]>([]);
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<EntityRegistration | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Per-row pending state — keyed by entity id so toggling one row doesn't
  // disable the whole table.
  const [savingId, setSavingId] = useState<string | null>(null);
  // Transient "Copied!" feedback for the per-row member-link button.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Register flow
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({ ...EMPTY_REGISTER_FORM });
  const [registerError, setRegisterError] = useState('');
  const [registerSaving, setRegisterSaving] = useState(false);

  // Members dialog state
  const [membersTarget, setMembersTarget] = useState<EntityRegistration | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberChecked, setMemberChecked] = useState<Set<string>>(new Set());
  const [membersSaving, setMembersSaving] = useState(false);

  // Access dialog state — assign assessments to the entity's members.
  const [assessmentRecords, setAssessmentRecords] = useState<AssessmentRecord[]>([]);
  const [provisionTarget, setProvisionTarget] = useState<EntityRegistration | null>(null);
  const [provAssessments, setProvAssessments] = useState<Set<string>>(new Set());
  const [provAssessmentSearch, setProvAssessmentSearch] = useState('');
  const [provisionSaving, setProvisionSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [ents, reps, records] = await Promise.all([
        entityRegistrationsApi.list(),
        respondentsApi.list().catch(() => [] as Respondent[]),
        assessmentRecordsApi.list().catch(() => [] as AssessmentRecord[]),
      ]);
      setRows(ents);
      setRespondents(reps);
      setAssessmentRecords(records);
    } catch (e: any) {
      setError(e?.message || 'Failed to load entity registrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const patchRow = (id: string, fields: Partial<EntityRegistration>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));

  const toggleActive = async (row: EntityRegistration) => {
    if (!row.id) return;
    const next = !row.active;
    setSavingId(row.id);
    patchRow(row.id, { active: next });
    try {
      await entityRegistrationsApi.update(row.id, { active: next });
    } catch (e: any) {
      patchRow(row.id, { active: !next });
      setError(e?.message || 'Failed to update active state');
    } finally {
      setSavingId(null);
    }
  };

  const copyMemberLink = async (row: EntityRegistration) => {
    if (!row.id) return;
    const link = memberLink(row.id);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API can be blocked (insecure origin/permissions) — fall
      // back to a prompt so the admin can still copy the link manually.
      window.prompt('Copy this member registration link:', link);
    }
    setCopiedId(row.id);
    setTimeout(() => setCopiedId((cur) => (cur === row.id ? null : cur)), 1800);
  };

  const doDelete = async () => {
    if (!confirmDelete?.id) return;
    setDeleting(true);
    try {
      await entityRegistrationsApi.delete(confirmDelete.id);
      setRows((prev) => prev.filter((r) => r.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const submitRegister = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setRegisterError('');
    if (!registerForm.name.trim()) { setRegisterError('Name is required.'); return; }
    if (!registerForm.companyName.trim()) { setRegisterError('Company name is required.'); return; }
    if (!registerForm.email.trim()) { setRegisterError('Email is required.'); return; }
    if (!registerForm.phone.trim()) { setRegisterError('Phone is required.'); return; }
    if (!registerForm.dob.trim()) { setRegisterError('Date of birth is required.'); return; }
    const isoDob = ddmmyyyyToIso(registerForm.dob);
    if (!isoDob) { setRegisterError('Date of birth must be in DD/MM/YYYY format.'); return; }
    setRegisterSaving(true);
    try {
      const created = await entityRegistrationsApi.create({
        name: registerForm.name.trim(),
        companyName: registerForm.companyName.trim(),
        email: registerForm.email.trim(),
        phone: registerForm.phone.trim(),
        dob: isoDob,
      });
      setRows((prev) => [created, ...prev]);
      setRegisterOpen(false);
      setRegisterForm({ ...EMPTY_REGISTER_FORM });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.toLowerCase().includes('already registered')) {
        setRegisterError('This email is already registered.');
      } else {
        setRegisterError(e?.message || 'Failed to register entity.');
      }
    } finally {
      setRegisterSaving(false);
    }
  };

  const openMembers = (row: EntityRegistration) => {
    setMembersTarget(row);
    setMemberChecked(new Set(row.member_ids || []));
    setMemberSearch('');
  };

  const toggleMember = (id: string) => {
    setMemberChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveMembers = async () => {
    if (!membersTarget?.id) return;
    setMembersSaving(true);
    try {
      const ids = Array.from(memberChecked);
      await entityRegistrationsApi.update(membersTarget.id, { member_ids: ids });
      patchRow(membersTarget.id, { member_ids: ids });
      setMembersTarget(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to save members');
    } finally {
      setMembersSaving(false);
    }
  };

  const openProvision = (row: EntityRegistration) => {
    setProvisionTarget(row);
    setProvAssessments(new Set(row.assessments || []));
    setProvAssessmentSearch('');
    setError('');
  };

  const toggleProvAssessment = (id: string) => {
    setProvAssessments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveProvision = async () => {
    if (!provisionTarget?.id) return;
    setProvisionSaving(true);
    setError('');
    try {
      const assessments = Array.from(provAssessments);
      // Reconciled server-side: newly-ticked assessments are allotted to the
      // entity (a session is created for every member); un-ticked ones drop
      // the allotment and remove members' not-yet-started sessions.
      const updated = await entityRegistrationsApi.update(provisionTarget.id, { assessments });
      patchRow(provisionTarget.id, { assessments: updated.assessments ?? assessments });
      setProvisionTarget(null);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (/not active/i.test(msg)) {
        setError('Activate the entity before assigning assessments to its members.');
      } else {
        setError(msg || 'Failed to save assessment assignments');
      }
    } finally {
      setProvisionSaving(false);
    }
  };

  const filteredAssessmentRecords = useMemo(() => {
    const q = provAssessmentSearch.trim().toLowerCase();
    if (!q) return assessmentRecords;
    return assessmentRecords.filter(
      (a) =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.questionnaireName || '').toLowerCase().includes(q) ||
        (a.vertical || '').toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [assessmentRecords, provAssessmentSearch]);

  const filteredRespondentsForMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return respondents;
    return respondents.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [respondents, memberSearch]);

  return (
    <div className="p-5 lg:p-7.5 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entity Registrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The entity is the company; the name/email/phone on each row
            are its contact person. Activate and manage members here;
            per-assessment caps live on each assessment's allotment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => { setRegisterForm({ ...EMPTY_REGISTER_FORM }); setRegisterError(''); setRegisterOpen(true); }}>
            <UserPlus className="h-3.5 w-3.5" /> Register Entity
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{rows.length} registration{rows.length === 1 ? '' : 's'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-sm text-muted-foreground">No registrations yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Company (Entity)</th>
                    <th className="px-4 py-2.5 font-medium">Contact Person</th>
                    <th className="px-4 py-2.5 font-medium">Active</th>
                    <th className="px-4 py-2.5 font-medium">Members</th>
                    <th className="px-4 py-2.5 font-medium">Access</th>
                    <th className="px-4 py-2.5 font-medium">Member Link</th>
                    <th className="px-4 py-2.5 font-medium">Submitted</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const memberCount = (r.member_ids || []).length;
                    const assessmentCount = (r.assessments || []).length;
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 align-top">
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.companyName || <span className="italic text-muted-foreground">(no company)</span>}</div>
                          <div className="font-mono text-[0.6875rem] text-muted-foreground mt-0.5">{r.id}</div>
                        </td>
                        <td className="px-4 py-3 space-y-1">
                          <div className="text-sm font-medium">{r.name}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span>{r.email}</span>
                          </div>
                          {r.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span>{r.phone}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleActive(r)}
                            aria-pressed={!!r.active}
                            disabled={savingId === r.id}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              r.active ? 'bg-primary' : 'bg-muted-foreground/30'
                            } disabled:opacity-50`}
                            title={r.active ? 'Deactivate' : 'Activate'}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                                r.active ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <Badge size="sm" shape="circle" variant={memberCount > 0 ? 'success' : 'secondary'} appearance="light">
                            {memberCount} member{memberCount === 1 ? '' : 's'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <Badge size="sm" shape="circle" variant={assessmentCount > 0 ? 'info' : 'secondary'} appearance="light" title="Assessments assigned to this entity's members">
                            {assessmentCount} assessment{assessmentCount === 1 ? '' : 's'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyMemberLink(r)}
                            disabled={!r.id}
                            title="Copy the shareable member registration link"
                          >
                            {copiedId === r.id ? (
                              <><Check className="h-3.5 w-3.5" /> Copied</>
                            ) : (
                              <><Link2 className="h-3.5 w-3.5" /> Copy link</>
                            )}
                          </Button>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <Button variant="outline" size="sm" onClick={() => openMembers(r)} title="Manage members">
                              <Users className="h-3.5 w-3.5" /> Members
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openProvision(r)} title="Manage access (verticals, platform, assessments)">
                              <SlidersHorizontal className="h-3.5 w-3.5" /> Access
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (r.id) window.location.href = `/admin/entity-registrations/${encodeURIComponent(r.id)}`;
                              }}
                              title="View details"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(r)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register Entity modal */}
      {registerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !registerSaving && setRegisterOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">Register Entity</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submitRegister} className="space-y-4">
                {registerError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{registerError}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Company Name *</label>
                  <Input variant="md" value={registerForm.companyName} onChange={(e) => setRegisterForm({ ...registerForm, companyName: e.target.value })} placeholder="e.g., Bodh Psychometric Pvt. Ltd." />
                  <p className="text-[0.6875rem] text-muted-foreground">This is the entity.</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <p className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium">Contact Person</p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Name *</label>
                    <Input variant="md" value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} placeholder="e.g., Arjun Patel" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Email *</label>
                    <Input variant="md" type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="contact@company.com" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Phone *</label>
                    <Input variant="md" type="tel" value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} placeholder="+91 98765 43210" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Date of Birth *</label>
                    <Input variant="md" inputMode="numeric" value={registerForm.dob} onChange={(e) => setRegisterForm({ ...registerForm, dob: autoFormatDdmmyyyy(e.target.value) })} placeholder="DD/MM/YYYY" maxLength={10} />
                    <p className="text-[0.6875rem] text-muted-foreground">Format DD/MM/YYYY.</p>
                  </div>
                </div>
                <p className="text-[0.6875rem] text-muted-foreground">
                  Entities start inactive. Activate the company and add its members (respondents) before allotting any assessment to it.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setRegisterOpen(false)} disabled={registerSaving}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={registerSaving}>
                    {registerSaving ? 'Registering…' : 'Register'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Members dialog */}
      {membersTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !membersSaving && setMembersTarget(null)}>
          <Card className="w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">Members of {membersTarget.companyName || membersTarget.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Link respondents to this entity (company). Each member gets a session when the entity is allotted to an Assessment.
                To invite someone new, register them as a respondent first in /admin/respondents.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 flex-1 overflow-hidden flex flex-col">
              <InputWrapper variant="md" className="w-full">
                <Search className="size-4" />
                <Input placeholder="Search respondents by name or email…" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
              </InputWrapper>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{memberChecked.size} selected</span>
                {memberChecked.size > 0 && (
                  <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMemberChecked(new Set())}>
                    Clear
                  </button>
                )}
              </div>
              <div className="border border-border rounded-lg overflow-y-auto flex-1 min-h-0">
                {filteredRespondentsForMembers.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">
                    {respondents.length === 0 ? 'No respondents in the system yet.' : 'No respondents match your search.'}
                  </div>
                ) : (
                  filteredRespondentsForMembers.map((r) => {
                    const checked = memberChecked.has(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleMember(r.id)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left border-b border-border last:border-0 transition-colors ${
                          checked ? 'bg-primary/5 text-primary' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                          }`}>
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{r.name}</p>
                            <p className="text-[0.6875rem] text-muted-foreground truncate">{r.email}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setMembersTarget(null)} disabled={membersSaving}>Cancel</Button>
                <Button variant="primary" onClick={saveMembers} disabled={membersSaving}>
                  {membersSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Access provisioning dialog */}
      {provisionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !provisionSaving && setProvisionTarget(null)}>
          <Card className="w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base">Assign Assessments — {provisionTarget.companyName || provisionTarget.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Ticking an assessment assigns it to every member of this entity — each member gets a
                session in their portal. Un-ticking removes the assignment and any member sessions that
                haven't been started yet. The entity must be active.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 flex-1 overflow-y-auto">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {!provisionTarget.active && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>This entity is inactive. Activate it on the list before assigning assessments.</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground font-medium">
                <ClipboardList className="h-3.5 w-3.5" /> Assessments
                <span className="ml-auto normal-case tracking-normal">{provAssessments.size} assigned</span>
              </div>
              <InputWrapper variant="md" className="w-full">
                <Search className="size-4" />
                <Input placeholder="Search assessments by name, questionnaire, or vertical…" value={provAssessmentSearch} onChange={(e) => setProvAssessmentSearch(e.target.value)} />
              </InputWrapper>
              <div className="border border-border rounded-lg max-h-72 overflow-y-auto">
                {filteredAssessmentRecords.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">
                    {assessmentRecords.length === 0 ? 'No assessments in the system yet.' : 'No assessments match your search.'}
                  </div>
                ) : (
                  filteredAssessmentRecords.map((a) => {
                    const checked = provAssessments.has(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleProvAssessment(a.id)}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left border-b border-border last:border-0 transition-colors ${
                          checked ? 'bg-primary/5 text-primary' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                          }`}>
                            {checked && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{a.name || a.questionnaireName || a.id}</p>
                            <p className="text-[0.6875rem] text-muted-foreground truncate">
                              {a.questionnaireName || '—'}{a.vertical ? ` · ${a.vertical}` : ''}
                            </p>
                          </div>
                        </div>
                        <Badge size="sm" shape="circle" variant={a.status === 'ACTIVE' ? 'success' : 'secondary'} appearance="light">
                          {a.status}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={() => setProvisionTarget(null)} disabled={provisionSaving}>Cancel</Button>
              <Button variant="primary" onClick={saveProvision} disabled={provisionSaving || !provisionTarget.active}>
                {provisionSaving ? 'Saving…' : 'Save Assignments'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader><CardTitle className="text-base">Delete registration?</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Permanently remove <strong>{confirmDelete.companyName || confirmDelete.name}</strong>
                <span className="text-xs"> (contact: {confirmDelete.name} · {confirmDelete.email})</span>
                from the registrations list. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
