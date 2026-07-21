import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
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
  type OrganizationDetailResponse,
  type OrganizationPayload,
  type OrganizationResponse,
  type UnassignedPeopleResponse,
} from './organizationApis';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400',
  INACTIVE: 'border-border bg-muted/40 text-muted-foreground',
  SUSPENDED:
    'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400',
};

interface OrganizationForm {
  id: number | null;
  name: string;
  orgEmail: string;
  description: string;
}

const EMPTY_FORM: OrganizationForm = { id: null, name: '', orgEmail: '', description: '' };

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<OrganizationForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<OrganizationResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Drill-in modal: staff (practitioners) + members (respondents) of one org.
  const [detailTarget, setDetailTarget] = useState<OrganizationResponse | null>(null);
  const [detail, setDetail] = useState<OrganizationDetailResponse | null>(null);
  const [detailError, setDetailError] = useState('');
  // Which detail row's unassign is in flight — 'p-3' / 'r-5' style keys.
  const [unassignBusy, setUnassignBusy] = useState<string | null>(null);

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
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (o: OrganizationResponse) => {
    setForm({
      id: o.organizationId,
      name: o.name,
      orgEmail: o.orgEmail || '',
      description: o.description || '',
    });
    setFormError('');
    setModalOpen(true);
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

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { setFormError('Name is required'); return; }
    const orgEmail = form.orgEmail.trim();
    if (orgEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(orgEmail)) {
      setFormError('That does not look like a valid email address');
      return;
    }
    // Payload mirrors the backend's OrganizationRequest.
    const payload: OrganizationPayload = {
      name,
      orgEmail: orgEmail || null,
      description: form.description.trim() || null,
    };
    setSaving(true);
    try {
      if (form.id != null) {
        await organizationApis.updateOrganization(form.id, payload);
      } else {
        await organizationApis.createOrganization(payload);
      }
      await refresh();
      setModalOpen(false);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
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
              Schools, clinics and companies. Staff (practitioners) run the
              org's assessments; members (respondents) take them. People are
              attached from their own pages — this catalog owns the org itself.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Organization
          </Button>
        </div>
      </div>

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
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
                    <Stethoscope className="h-3 w-3" />
                    {o.staffCount} staff
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
                    <Users className="h-3 w-3" />
                    {o.memberCount} member{o.memberCount !== 1 ? 's' : ''}
                  </span>
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

      {/* Create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base">{form.id != null ? 'Edit Organization' : 'Add Organization'}</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Apollo Hospitals"
                  maxLength={200}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Organization Email</label>
                <input
                  type="email"
                  value={form.orgEmail}
                  onChange={(e) => setForm({ ...form, orgEmail: e.target.value })}
                  placeholder="contact@organization.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What this organization is — school, clinic, company…"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y"
                />
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                Staff and members are attached from the Practitioners and
                Respondents pages via their Organization picker.
              </p>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {form.id != null ? 'Save' : 'Add Organization'}
              </Button>
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
                <Building2 className="h-4 w-4 text-primary" />
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
