import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertTriangle,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  respondentApis,
  type Gender,
  type OrganizationResponse,
  type RespondentPayload,
  type RespondentResponse,
} from './respondentApis';

const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

const genderLabel = (g: Gender | null) => GENDERS.find((x) => x.value === g)?.label ?? null;

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

interface RespondentForm {
  id: number | null;
  name: string;
  email: string;
  dob: string;
  phone: string;
  employeeId: string;
  gender: Gender | '';
  isConsented: boolean;
  organizationId: number | null;
}

const EMPTY_FORM: RespondentForm = {
  id: null,
  name: '',
  email: '',
  dob: '',
  phone: '',
  employeeId: '',
  gender: '',
  isConsented: false,
  organizationId: null,
};

export default function RespondentsPage() {
  const [respondents, setRespondents] = useState<RespondentResponse[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RespondentForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<RespondentResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const res = await respondentApis.getAllRespondents();
      setRespondents(res.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load respondents');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => {
    refresh(true);
    // The org picker failing shouldn't block the list — load it best-effort.
    respondentApis
      .getAllOrganizations()
      .then((res) => setOrganizations(res.data))
      .catch(() => setOrganizations([]));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return respondents;
    const s = search.toLowerCase();
    return respondents.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.email.toLowerCase().includes(s) ||
        (r.serialId || '').toLowerCase().includes(s) ||
        (r.phone || '').toLowerCase().includes(s) ||
        (r.employeeId || '').toLowerCase().includes(s) ||
        (r.organizationName || '').toLowerCase().includes(s),
    );
  }, [respondents, search]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (r: RespondentResponse) => {
    setForm({
      id: r.respondentUserId,
      name: r.name,
      email: r.email,
      dob: r.dob,
      phone: r.phone || '',
      employeeId: r.employeeId || '',
      gender: r.gender || '',
      isConsented: r.isConsented,
      organizationId: r.organizationId,
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name) { setFormError('Name is required'); return; }
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
    // Optional, but when present it must match the backend's @Pattern. The
    // alphanumeric rule is what guarantees no '@', which is how the portal
    // tells an employee ID from an email at login.
    // Stored in capital letters (the backend upper-cases it too); alphanumeric
    // is what guarantees no '@', which is how the portal tells an employee ID
    // from an email at login.
    const employeeId = form.employeeId.trim().toUpperCase();
    if (employeeId && !/^[A-Z0-9]+$/.test(employeeId)) {
      setFormError('Employee ID must contain only letters and numbers');
      return;
    }
    // Payload mirrors the backend's RespondentRequest — dob is the login
    // credential, so it is required even though phone/gender/org are not.
    const payload: RespondentPayload = {
      name,
      email,
      dob: form.dob,
      phone: form.phone.trim() || null,
      employeeId: employeeId || null,
      gender: form.gender || null,
      isConsented: form.isConsented,
      organizationId: form.organizationId,
    };
    setSaving(true);
    try {
      if (form.id != null) {
        await respondentApis.updateRespondent(form.id, payload);
      } else {
        await respondentApis.createRespondent(payload);
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
      await respondentApis.deleteRespondent(confirmDelete.respondentUserId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to delete');
    }
  };

  const consentedCount = respondents.filter((r) => r.isConsented).length;
  const inOrgCount = respondents.filter((r) => r.organizationId != null).length;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Users</span><span>/</span>
          <span className="text-foreground font-medium">Respondents</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Respondents
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              People who take assessments. A respondent signs in with their
              email and date of birth — the DOB entered here doubles as their
              password.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Respondent
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Respondents</p><p className="text-2xl font-semibold mt-1">{respondents.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Consented</p><p className="text-2xl font-semibold mt-1">{consentedCount}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">In an Organization</p><p className="text-2xl font-semibold mt-1">{inOrgCount}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search name, email, serial, employee ID, phone or organization..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading respondents…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {respondents.length === 0 ? 'No respondents yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {respondents.length === 0
                ? 'Add the people who will take assessments — each gets a login of email + date of birth.'
                : 'Try a different search term.'}
            </p>
            {respondents.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Add your first respondent
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((r) => (
              <li
                key={r.respondentUserId}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => openEdit(r)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    {r.serialId && (
                      <span className="font-mono text-[0.6875rem] text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                        {r.serialId}
                      </span>
                    )}
                    {r.employeeId && (
                      <span
                        title="Employee ID — can be used to sign in"
                        className="font-mono text-[0.6875rem] text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0"
                      >
                        {r.employeeId}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="truncate">{r.email}</span>
                    {r.phone && <span className="shrink-0">{r.phone}</span>}
                    <span className="shrink-0">DOB {r.dob}</span>
                    {genderLabel(r.gender) && <span className="shrink-0">{genderLabel(r.gender)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.organizationName && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium max-w-40">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{r.organizationName}</span>
                    </span>
                  )}
                  {r.isConsented ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                      <ShieldCheck className="h-3 w-3" />
                      Consented
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      No consent
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                    title="Edit respondent"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(r); }}
                    title="Delete respondent"
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
              <CardTitle className="text-base">{form.id != null ? 'Edit Respondent' : 'Add Respondent'}</CardTitle>
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
                <label className="text-sm font-medium">Full Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Arjun Patel"
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
                    placeholder="respondent@example.com"
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
                Email + date of birth are the respondent's sign-in credentials. An Employee ID, if
                set below, works in place of the email.
              </p>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Employee ID 
                </label>
                <input
                  type="text"
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value.toUpperCase() })}
                  placeholder="EMP1042"
                  maxLength={32}
                  style={{ textTransform: 'uppercase' }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[0.6875rem] text-muted-foreground">
                  Letters and numbers only. Must be unique within the respondent's organization.
                </p>
              </div>
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
                  <label className="text-sm font-medium">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value as Gender | '' })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Not specified</option>
                    {GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Organization</label>
                <select
                  value={form.organizationId ?? ''}
                  onChange={(e) => setForm({ ...form, organizationId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">None — unaffiliated</option>
                  {organizations.map((o) => (
                    <option key={o.organizationId} value={o.organizationId}>{o.name}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isConsented}
                  onChange={(e) => setForm({ ...form, isConsented: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-sm">
                  Consent granted
                  <span className="block text-xs text-muted-foreground">
                    The respondent has agreed to data processing. First grant
                    stamps the consent time; unticking clears it.
                  </span>
                </span>
              </label>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {form.id != null ? 'Save' : 'Add Respondent'}
              </Button>
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
                Delete Respondent
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
                Their account is removed too. Respondents who already have
                assessment attempts cannot be deleted.
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
