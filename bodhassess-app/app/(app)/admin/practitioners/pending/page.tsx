'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, X, Pencil, CheckCircle2, Trash2, UserCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getPractitioners, updatePractitioner, deletePractitioner,
  getRoles,
  type StoredPractitioner, type Role,
} from '@/lib/data-store';

const VERTICALS = ['Clinical', 'Industrial', 'Counselling', 'Experiments', 'White-Label'];

type FormState = {
  roles: string[];
  verticals: string[];
};

const emptyForm: FormState = { roles: [], verticals: [] };

export default function PendingPractitionersPage() {
  const [practitioners, setPractitioners] = useState<StoredPractitioner[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<StoredPractitioner | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmReject, setConfirmReject] = useState<StoredPractitioner | null>(null);

  const roleNames = useMemo(() => roles.map((r) => r.name), [roles]);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [list, roleList] = await Promise.all([getPractitioners(), getRoles()]);
      setPractitioners(list.filter((p) => (p.status || '').toLowerCase() === 'pending'));
      setRoles(roleList);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load pending requests');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const openReview = (p: StoredPractitioner) => {
    setEditing(p);
    setForm({
      roles: p.roles && p.roles.length > 0 ? p.roles : (roleNames.includes('Practitioner') ? ['Practitioner'] : []),
      verticals: p.verticals || [],
    });
    setError('');
  };

  const closeModal = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
  };

  const toggleVertical = (v: string) => {
    setForm((f) => ({ ...f, verticals: f.verticals.includes(v) ? f.verticals.filter((x) => x !== v) : [...f.verticals, v] }));
  };
  const toggleRole = (r: string) => {
    setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));
  };

  const approve = async () => {
    if (!editing) return;
    if (form.roles.length === 0) { setError('Assign at least one role'); return; }
    if (form.verticals.length === 0) { setError('Assign at least one vertical'); return; }
    setSaving(true);
    const updated = await updatePractitioner(editing.id, {
      roles: form.roles,
      verticals: form.verticals,
      status: 'Active',
    });
    setSaving(false);
    if (!updated) { setError('Failed to save — check that the API is running'); return; }
    closeModal();
    await refresh();
  };

  const allRolesForForm = useMemo(() => {
    if (!editing) return roleNames;
    const extra = (editing.roles || []).filter((r) => !roleNames.includes(r));
    return [...roleNames, ...extra];
  }, [editing, roleNames]);

  const reject = async () => {
    if (!confirmReject) return;
    const ok = await deletePractitioner(confirmReject.id);
    setConfirmReject(null);
    if (ok) await refresh();
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span>Practitioners</span><span>/</span>
          <span className="text-foreground font-medium">Pending Requests</span>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pending Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Practitioners who signed up and are awaiting admin approval. Assign roles and verticals to activate their accounts.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            Pending Practitioner Requests ({practitioners.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">PID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">DOB</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && practitioners.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading from database…</td></tr>
                ) : practitioners.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">No pending requests.</td></tr>
                ) : practitioners.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{p.id}</td>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.email}</td>
                    <td className="px-5 py-3 text-muted-foreground">{p.dob || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Pending
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => openReview(p)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit & Approve
                        </button>
                        <button
                          onClick={() => setConfirmReject(p)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Reject
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={closeModal}>
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserCheck className="h-4 w-4" /> Review — {editing.id}
              </CardTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>}

              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span className="font-medium">{editing.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Email:</span><span className="font-mono text-xs">{editing.email}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">DOB:</span><span className="font-mono text-xs">{editing.dob || '—'}</span></div>
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
                <Button variant="outline" onClick={closeModal}>Cancel</Button>
                <Button variant="primary" onClick={approve} disabled={saving}>
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? 'Approving…' : 'Approve & Activate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {confirmReject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmReject(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Reject Request</CardTitle>
              <button onClick={() => setConfirmReject(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">Reject and remove the request from <strong>{confirmReject.name}</strong> ({confirmReject.id})?</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmReject(null)}>Cancel</Button>
                <Button variant="primary" onClick={reject} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
