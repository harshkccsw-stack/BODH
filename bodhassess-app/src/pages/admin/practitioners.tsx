import { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Clock, X, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getPractitioners, createPractitioner, updatePractitioner, deletePractitioner,
  getRoles,
  type StoredPractitioner, type Role,
} from '@/lib/data-store';
import { autoFormatDdmmyyyy, ddmmyyyyToIso, formatDDMMYYYYTime, isoToDdmmyyyy } from '@/lib/helpers';

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

const VERTICALS = ['Clinical', 'Industrial', 'Counselling', 'Experiments', 'White-Label'];

type FormState = {
  name: string;
  email: string;
  phone: string;
  dob: string;
  roles: string[];
  verticals: string[];
  status: 'Active' | 'Inactive';
};

const emptyForm: FormState = { name: '', email: '', phone: '', dob: '', roles: [], verticals: [], status: 'Active' };

export default function PractitionersPage() {
  const [practitioners, setPractitioners] = useState<StoredPractitioner[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StoredPractitioner | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StoredPractitioner | null>(null);

  const roleNames = useMemo(() => roles.map((r) => r.name), [roles]);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [list, roleList] = await Promise.all([getPractitioners(), getRoles()]);
      setPractitioners(list);
      setRoles(roleList);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load practitioners');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const stats = useMemo(() => {
    const active = practitioners.filter((p) => p.status === 'Active').length;
    return {
      total: practitioners.length,
      active,
      lastLogin: formatDDMMYYYYTime(practitioners[0]?.last_login) || '—',
    };
  }, [practitioners]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, roles: roleNames.includes('Practitioner') ? ['Practitioner'] : [] });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (p: StoredPractitioner) => {
    setEditing(p);
    setForm({
      name: p.name,
      email: p.email,
      phone: p.phone || '',
      dob: isoToDdmmyyyy(p.dob),
      roles: p.roles || [],
      verticals: p.verticals || [],
      status: (p.status as 'Active' | 'Inactive') || 'Active',
    });
    setError('');
    setModalOpen(true);
  };

  const toggleVertical = (v: string) => {
    setForm((f) => ({ ...f, verticals: f.verticals.includes(v) ? f.verticals.filter((x) => x !== v) : [...f.verticals, v] }));
  };

  const toggleRole = (r: string) => {
    setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));
  };

  const submit = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const dobInput = form.dob.trim();
    if (!name || !email) { setError('Name and email are required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    let isoDob: string | undefined = undefined;
    if (dobInput) {
      const parsed = ddmmyyyyToIso(dobInput);
      if (!parsed) { setError('Enter date of birth as DD/MM/YYYY'); return; }
      isoDob = parsed;
    }
    if (form.roles.length === 0) { setError('Assign at least one role'); return; }
    if (form.verticals.length === 0) { setError('Assign at least one vertical'); return; }

    setSaving(true);
    if (editing) {
      const updated = await updatePractitioner(editing.id, {
        name, email,
        phone: phone || undefined,
        dob: isoDob,
        roles: form.roles,
        verticals: form.verticals,
        status: form.status,
      });
      setSaving(false);
      if (!updated) { setError('Failed to save — check that the API is running'); return; }
    } else {
      if (practitioners.some((p) => p.email.toLowerCase() === email.toLowerCase())) {
        setSaving(false); setError('A practitioner with this email already exists'); return;
      }
      const nums = practitioners.map((p) => parseInt(p.id.replace(/^P-/, ''), 10)).filter((n) => !Number.isNaN(n));
      const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
      const id = `P-${String(nextNum).padStart(3, '0')}`;
      const today = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const created = await createPractitioner({
        id, name, email,
        phone: phone || undefined,
        dob: isoDob,
        roles: form.roles,
        verticals: form.verticals,
        status: form.status,
        last_login: today,
      });
      setSaving(false);
      if (!created) { setError('Failed to save — check that the API is running'); return; }
    }
    await refresh();
    setModalOpen(false);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const ok = await deletePractitioner(confirmDelete.id);
    setConfirmDelete(null);
    if (ok) await refresh();
  };

  const allRolesForForm = useMemo(() => {
    if (!editing) return roleNames;
    const extra = (editing.roles || []).filter((r) => !roleNames.includes(r));
    return [...roleNames, ...extra];
  }, [editing, roleNames]);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span><span className="text-foreground font-medium">Practitioners</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Practitioners</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage practitioners, clinicians, and HR professionals.</p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Practitioner
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Practitioners</p>
                <p className="text-2xl font-semibold mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.active} active</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Most Recent Login</p>
                <p className="text-2xl font-semibold mt-1 truncate">{stats.lastLogin}</p>
                <p className="text-xs text-muted-foreground mt-1">{practitioners[0]?.name || '—'}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10"><Clock className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">All Practitioners</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Roles</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical Access</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && practitioners.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading from database…</td></tr>
                ) : practitioners.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">No practitioners yet.</td></tr>
                ) : practitioners.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{p.id}</td>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.email}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(p.roles || []).length === 0 ? <span className="text-xs text-muted-foreground">—</span> :
                          (p.roles || []).map((r) => (
                            <span key={r} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">{r}</span>
                          ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(p.verticals || []).map((v) => (
                          <span key={v} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{v}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDDMMYYYYTime(p.last_login) || '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(p)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{editing ? `Edit Practitioner — ${editing.id}` : 'Add Practitioner'}</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Dr. Meera Krishnan" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="practitioner@example.com" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <p className="text-[0.6875rem] text-muted-foreground">Either email or phone can be used to sign in.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth</label>
                  <input
                    inputMode="numeric"
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })}
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-[0.6875rem] text-muted-foreground">Used as login password.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Roles *</label>
                {allRolesForForm.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No roles defined yet — create roles in Permissions first.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allRolesForForm.map((r) => (
                      <button key={r} type="button" onClick={() => toggleRole(r)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.roles.includes(r) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Pick one or more. Roles are managed in Permissions.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Vertical Access *</label>
                <div className="flex flex-wrap gap-2">
                  {VERTICALS.map((v) => (
                    <button key={v} type="button" onClick={() => toggleVertical(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.verticals.includes(v) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submit} disabled={saving}>
                  {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Practitioner')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Delete Practitioner</CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">Remove <strong>{confirmDelete.name}</strong> ({confirmDelete.id})?</p>
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
