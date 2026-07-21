import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  practitionerApis,
  type OrganizationResponse,
  type PractitionerPayload,
  type PractitionerResponse,
  type PractitionerStatus,
  type Vertical,
} from './practitionerApis';

const STATUSES: Array<{ value: PractitionerStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const STATUS_BADGE: Record<PractitionerStatus, string> = {
  ACTIVE:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400',
  INACTIVE: 'border-border bg-muted/40 text-muted-foreground',
  SUSPENDED:
    'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400',
};

const VERTICALS: Array<{ value: Vertical; label: string }> = [
  { value: 'CLINICAL', label: 'Clinical' },
  { value: 'INDUSTRIAL', label: 'Industrial' },
  { value: 'COUNSELLING', label: 'Counselling' },
  { value: 'EXPERIMENTS', label: 'Experiments' },
  { value: 'WHITELABEL', label: 'White-Label' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'OTHER', label: 'Other' },
];

const statusLabel = (s: PractitionerStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;
const verticalLabel = (v: Vertical | null) => VERTICALS.find((x) => x.value === v)?.label ?? null;

// DOB is dd-mm-yyyy everywhere — display, input and wire — so the form keeps
// the raw string and only auto-inserts the dashes while typing.
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

interface PractitionerForm {
  id: number | null;
  name: string;
  email: string;
  dob: string;
  phone: string;
  practitionerStatus: PractitionerStatus;
  vertical: Vertical | '';
  organizationId: number | null;
}

const EMPTY_FORM: PractitionerForm = {
  id: null,
  name: '',
  email: '',
  dob: '',
  phone: '',
  practitionerStatus: 'ACTIVE',
  vertical: '',
  organizationId: null,
};

export default function PractitionersPage() {
  const [practitioners, setPractitioners] = useState<PractitionerResponse[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PractitionerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<PractitionerResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [confirmSuper, setConfirmSuper] = useState<PractitionerResponse | null>(null);
  const [superError, setSuperError] = useState('');
  const [superSaving, setSuperSaving] = useState(false);

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const res = await practitionerApis.getAllPractitioners();
      setPractitioners(res.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load practitioners');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => {
    refresh(true);
    // The org picker failing shouldn't block the list — load it best-effort.
    practitionerApis
      .getAllOrganizations()
      .then((res) => setOrganizations(res.data))
      .catch(() => setOrganizations([]));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return practitioners;
    const s = search.toLowerCase();
    return practitioners.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.email.toLowerCase().includes(s) ||
        (p.serialId || '').toLowerCase().includes(s) ||
        (p.phone || '').toLowerCase().includes(s) ||
        (p.organizationName || '').toLowerCase().includes(s) ||
        (verticalLabel(p.vertical) || '').toLowerCase().includes(s),
    );
  }, [practitioners, search]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (p: PractitionerResponse) => {
    setForm({
      id: p.practitionerUserId,
      name: p.name,
      email: p.email,
      dob: p.dob,
      phone: p.phone || '',
      practitionerStatus: p.practitionerStatus,
      vertical: p.vertical || '',
      organizationId: p.organizationId,
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) { setFormError('Name is required'); return; }
    if (name.length > 20) { setFormError('Name must be at most 20 characters'); return; }
    if (!email) { setFormError('Email is required'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFormError('That does not look like a valid email address');
      return;
    }
    if (!form.dob) { setFormError('Date of birth is required'); return; }
    if (!isValidDob(form.dob)) {
      setFormError('Date of birth must be a real date in DD-MM-YYYY format');
      return;
    }
    // Payload mirrors the backend's PractitionerRequest — dob is the login
    // credential, so it is required even though phone/vertical/org are not.
    const payload: PractitionerPayload = {
      name,
      email,
      dob: form.dob,
      phone: form.phone.trim() || null,
      practitionerStatus: form.practitionerStatus,
      vertical: form.vertical || null,
      organizationId: form.organizationId,
    };
    setSaving(true);
    try {
      if (form.id != null) {
        await practitionerApis.updatePractitioner(form.id, payload);
      } else {
        await practitionerApis.createPractitioner(payload);
      }
      await refresh();
      setModalOpen(false);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const doToggleSuperAdmin = async () => {
    if (!confirmSuper) return;
    setSuperError('');
    setSuperSaving(true);
    try {
      if (confirmSuper.superAdmin) {
        await practitionerApis.revokeSuperAdmin(confirmSuper.practitionerUserId);
      } else {
        await practitionerApis.assignSuperAdmin(confirmSuper.practitionerUserId);
      }
      setConfirmSuper(null);
      await refresh();
    } catch (e: any) {
      setSuperError(e?.response?.data?.message || e?.message || 'Failed to update superadmin');
    } finally {
      setSuperSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError('');
    try {
      await practitionerApis.deletePractitioner(confirmDelete.practitionerUserId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to delete');
    }
  };

  const activeCount = practitioners.filter((p) => p.practitionerStatus === 'ACTIVE').length;
  const inOrgCount = practitioners.filter((p) => p.organizationId != null).length;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Users</span><span>/</span>
          <span className="text-foreground font-medium">Practitioners</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Stethoscope className="h-6 w-6 text-primary" />
              Practitioners
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The professionals who run assessments. A practitioner signs in
              with their email and date of birth — the DOB entered here doubles
              as their password.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Practitioner
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Practitioners</p><p className="text-2xl font-semibold mt-1">{practitioners.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-semibold mt-1">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">In an Organization</p><p className="text-2xl font-semibold mt-1">{inOrgCount}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search name, email, serial, vertical or organization..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading practitioners…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Stethoscope className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {practitioners.length === 0 ? 'No practitioners yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {practitioners.length === 0
                ? 'Add the professionals who will run assessments — each gets a login of email + date of birth.'
                : 'Try a different search term.'}
            </p>
            {practitioners.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Add your first practitioner
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li
                key={p.practitionerUserId}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => openEdit(p)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.serialId && (
                      <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                        {p.serialId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="truncate">{p.email}</span>
                    {p.phone && <span className="shrink-0">{p.phone}</span>}
                    <span className="shrink-0">DOB {p.dob}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.superAdmin && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                      <Crown className="h-3 w-3" />
                      Superadmin
                    </span>
                  )}
                  {verticalLabel(p.vertical) && (
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
                      {verticalLabel(p.vertical)}
                    </span>
                  )}
                  {p.organizationName && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium max-w-40">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{p.organizationName}</span>
                    </span>
                  )}
                  <span className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    STATUS_BADGE[p.practitionerStatus],
                  )}>
                    {statusLabel(p.practitionerStatus)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); setSuperError(''); setConfirmSuper(p); }}
                    title={p.superAdmin ? 'Remove superadmin' : 'Assign superadmin'}
                  >
                    <Crown className={p.superAdmin ? 'h-3.5 w-3.5 text-amber-500' : 'h-3.5 w-3.5'} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                    title="Edit practitioner"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(p); }}
                    title="Delete practitioner"
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
              <CardTitle className="text-base">{form.id != null ? 'Edit Practitioner' : 'Add Practitioner'}</CardTitle>
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
                <label className="text-sm font-medium">Full Name * <span className="text-muted-foreground font-normal">(max 20 chars)</span></label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Dr. Meera Iyer"
                  maxLength={20}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="practitioner@example.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth *</label>
                  <input
                    inputMode="numeric"
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: autoFormatDobDashes(e.target.value) })}
                    placeholder="DD-MM-YYYY"
                    maxLength={10}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <p className="text-[0.6875rem] text-muted-foreground -mt-2">
                Email + date of birth are the practitioner's sign-in credentials.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status *</label>
                  <select
                    value={form.practitionerStatus}
                    onChange={(e) => setForm({ ...form, practitionerStatus: e.target.value as PractitionerStatus })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Vertical</label>
                  <select
                    value={form.vertical}
                    onChange={(e) => setForm({ ...form, vertical: e.target.value as Vertical | '' })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Not specified</option>
                    {VERTICALS.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Organization</label>
                  <select
                    value={form.organizationId ?? ''}
                    onChange={(e) => setForm({ ...form, organizationId: e.target.value ? Number(e.target.value) : null })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">None — independent</option>
                    {organizations.map((o) => (
                      <option key={o.organizationId} value={o.organizationId}>{o.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {form.id != null ? 'Save' : 'Add Practitioner'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Assign / revoke superadmin confirmation */}
      {confirmSuper && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmSuper(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                {confirmSuper.superAdmin ? 'Remove Superadmin' : 'Assign Superadmin'}
              </CardTitle>
              <button onClick={() => setConfirmSuper(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {superError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{superError}</span>
                </div>
              )}
              <p className="text-sm">
                {confirmSuper.superAdmin ? (
                  <>Remove the superadmin flag from <strong>{confirmSuper.name}</strong> ({confirmSuper.email})?
                  They keep dashboard access as a practitioner, but pages will again be limited by their roles.</>
                ) : (
                  <>Make <strong>{confirmSuper.name}</strong> ({confirmSuper.email}) a superadmin?
                  Superadmins bypass every permission check and see the entire dashboard.</>
                )}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmSuper(null)}>Cancel</Button>
                <Button variant="primary" onClick={doToggleSuperAdmin} disabled={superSaving}>
                  {superSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <Crown className="h-3.5 w-3.5" />
                  {confirmSuper.superAdmin ? 'Remove' : 'Assign'}
                </Button>
              </div>
            </CardContent>
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
                Delete Practitioner
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
                Remove <strong>{confirmDelete.name}</strong> ({confirmDelete.email})?
                Their account is removed too. If you only want to block access,
                set their status to Suspended instead.
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
