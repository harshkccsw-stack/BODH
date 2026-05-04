'use client';

import { useEffect, useMemo, useState } from 'react';
import { Shield, Plus, Pencil, Trash2, X, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getRoles, createRole, updateRole, deleteRole, type Role } from '@/lib/data-store';

type FormState = { id: string; name: string; description: string; pathsText: string };

const empty: FormState = { id: '', name: '', description: '', pathsText: '' };

export default function PermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await getRoles();
      setRoles(list);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const totalPaths = useMemo(
    () => roles.reduce((acc, r) => acc + (r.url_paths?.length || 0), 0),
    [roles],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    setForm({
      id: r.id,
      name: r.name,
      description: r.description || '',
      pathsText: (r.url_paths || []).join(', '),
    });
    setError('');
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { setError('Role name is required'); return; }
    const paths = form.pathsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (paths.length === 0) { setError('Add at least one URL path (e.g. /admin/*)'); return; }
    const bad = paths.find((p) => !p.startsWith('/'));
    if (bad) { setError(`URL paths must start with "/": ${bad}`); return; }

    setSaving(true);
    let ok: Role | null;
    if (editing) {
      ok = await updateRole(editing.id, { name, description: form.description.trim(), url_paths: paths });
    } else {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'role';
      let id = `ROLE-${slug.toUpperCase()}`;
      const taken = new Set(roles.map((r) => r.id));
      let n = 2;
      while (taken.has(id)) { id = `ROLE-${slug.toUpperCase()}-${n++}`; }
      ok = await createRole({ id, name, description: form.description.trim(), url_paths: paths });
    }
    setSaving(false);
    if (!ok) { setError('Failed to save — check that the API is running'); return; }
    await refresh();
    setModalOpen(false);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const ok = await deleteRole(confirmDelete.id);
    setConfirmDelete(null);
    if (ok) await refresh();
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span className="text-foreground font-medium">Permissions</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </span>
              Roles &amp; Permissions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Define roles (page access) and bundle them into groups for easy user assignment.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Role
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Roles
            <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{roles.length}</span>
          </CardTitle>
          <span className="text-xs text-muted-foreground">{totalPaths} URL paths configured</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground uppercase text-xs tracking-wider">Role Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground uppercase text-xs tracking-wider">URL Path</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground uppercase text-xs tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && roles.length === 0 ? (
                  <tr><td colSpan={3} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading from database…</td></tr>
                ) : roles.length === 0 ? (
                  <tr><td colSpan={3} className="px-5 py-10 text-center text-sm text-muted-foreground">No roles defined yet — click "Add Role" to create one.</td></tr>
                ) : roles.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 align-top">
                      <div className="font-semibold">{r.name}</div>
                      {r.description && <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>}
                    </td>
                    <td className="px-5 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {(r.url_paths || []).map((p) => (
                          <span key={p} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => openEdit(r)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30 transition-colors"
                          aria-label="Edit role"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(r)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 transition-colors"
                          aria-label="Delete role"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{editing ? 'Edit Role' : 'Add Role'}</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Role Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., School Admin" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short summary of what this role can do" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">URL Paths *</label>
                <textarea
                  value={form.pathsText}
                  onChange={(e) => setForm({ ...form, pathsText: e.target.value })}
                  placeholder={'/admin/*\n/dashboard\n/reports/*'}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-xs text-muted-foreground">One per line or comma-separated. Use <code className="font-mono">/*</code> as a wildcard suffix.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Role')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Delete Role</CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">Remove role <strong>{confirmDelete.name}</strong>? Users currently assigned to this role will keep the role name but it will no longer appear in the dropdown.</p>
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
