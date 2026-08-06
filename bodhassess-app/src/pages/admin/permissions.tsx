'use client';

// Roles & Permissions — authoring the reusable pieces of dashboard access.
//
// A role is a named set of frontend routes. Nobody is given a role directly:
// roles go into a group (/admin/role-groups) and the group is what a person
// holds (/admin/assign-role-group).
//
// Paths are picked from PAGE_CATALOG rather than typed, because a typo grants
// nothing and fails silently. The paste box is still here for bulk entry — it
// merges into the same selection, and anything it adds that the catalog does
// not know about is shown as a removable chip so it can never hide.

import { useEffect, useMemo, useState } from 'react';
import { KeyRound, Plus, Pencil, Trash2, X, Search, Layers, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PAGE_CATALOG, CATALOG_PATHS, labelForPath } from '@/config/page-catalog';
import { rolesApi, type RoleResponse } from './rolesApi';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

type FormState = { name: string; description: string; paths: string[] };

const EMPTY: FormState = { name: '', description: '', paths: [] };

/** Does an already-selected prefix cover this page path? */
function coveredByPrefix(path: string, selected: string[]): string | null {
  for (const s of selected) {
    if (!s.endsWith('/*')) continue;
    const base = s.slice(0, -2);
    if (path !== s && (path === base || path.startsWith(base + '/'))) return s;
  }
  return null;
}

export default function PermissionsPage() {
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleResponse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<RoleResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setRoles((await rolesApi.getAllRoles()).data);
    } catch (e: any) {
      setLoadError(errorText(e, 'Failed to load roles'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      r.urlPaths.some((p) => p.toLowerCase().includes(q)));
  }, [roles, search]);

  const distinctPaths = useMemo(
    () => new Set(roles.flatMap((r) => r.urlPaths)).size,
    [roles],
  );
  const unbundled = useMemo(() => roles.filter((r) => r.groupCount === 0).length, [roles]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setPasteText('');
    setError('');
    setModalOpen(true);
  };

  const openEdit = (role: RoleResponse) => {
    setEditing(role);
    setForm({ name: role.name, description: role.description ?? '', paths: [...role.urlPaths] });
    setPasteText('');
    setError('');
    setModalOpen(true);
  };

  const togglePath = (path: string) => {
    setForm((f) => {
      if (f.paths.includes(path)) {
        return { ...f, paths: f.paths.filter((p) => p !== path) };
      }
      // Ticking a whole section absorbs the individual pages under it, so the
      // stored set stays the shortest thing that means the same access.
      const base = path.endsWith('/*') ? path.slice(0, -2) : null;
      const kept = base
        ? f.paths.filter((p) => !(p === base || p.startsWith(base + '/')))
        : f.paths;
      return { ...f, paths: [...kept, path] };
    });
  };

  const addPastedPaths = () => {
    const parsed = pasteText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const bad = parsed.find((p) => !p.startsWith('/'));
    if (bad) { setError(`Paths must start with "/": ${bad}`); return; }
    setForm((f) => ({ ...f, paths: Array.from(new Set([...f.paths, ...parsed])) }));
    setPasteText('');
    setError('');
  };

  const customPaths = form.paths.filter((p) => !CATALOG_PATHS.includes(p));

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { setError('Role name is required'); return; }
    if (form.paths.length === 0) { setError('Select at least one page for this role'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        description: form.description.trim() || null,
        urlPaths: form.paths,
      };
      if (editing) await rolesApi.updateRole(editing.id, payload);
      else await rolesApi.createRole(payload);
      setModalOpen(false);
      await refresh();
    } catch (e: any) {
      setError(errorText(e, 'Failed to save role'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await rolesApi.deleteRole(confirmDelete.id);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(errorText(e, 'Failed to delete role'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span className="text-foreground font-medium">Roles &amp; Permissions</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <KeyRound className="h-5 w-5 text-primary" />
              </span>
              Roles &amp; Permissions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              A role is a named set of pages. Bundle roles into a group, then assign the group to a person.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Role
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Roles</div>
            <div className="text-2xl font-semibold mt-1">{roles.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Distinct pages granted</div>
            <div className="text-2xl font-semibold mt-1">{distinctPaths}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Not in any group</div>
            <div className="text-2xl font-semibold mt-1">{unbundled}</div>
            <div className="text-xs text-muted-foreground mt-1">These grant nobody anything yet</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search roles by name, description or path..."
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Roles
            <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
              {filtered.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {loading && roles.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                {roles.length === 0
                  ? 'No roles yet — click "Add Role" to create one.'
                  : 'No roles match your search.'}
              </div>
            ) : filtered.map((role) => (
              <div key={role.id} className="group px-5 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{role.name}</span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {role.urlPaths.length} page{role.urlPaths.length === 1 ? '' : 's'}
                      </span>
                      {role.groupCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 text-xs">
                          <Layers className="h-3 w-3" />
                          {role.groupCount} group{role.groupCount === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs">
                          unused
                        </span>
                      )}
                    </div>
                    {role.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{role.description}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {role.urlPaths.map((p) => (
                        <span
                          key={p}
                          title={labelForPath(p)}
                          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="inline-flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(role)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30 transition-colors"
                      aria-label="Edit role"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(role); setDeleteError(''); }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 transition-colors"
                      aria-label="Delete role"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">{editing ? 'Edit Role' : 'Add Role'}</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role Name * <span className="text-muted-foreground font-normal">(max 50)</span></label>
                  <input
                    value={form.name}
                    maxLength={50}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Report Viewer"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="What this role is for"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Pages *</label>
                  <span className="text-xs text-muted-foreground">{form.paths.length} selected</span>
                </div>
                <div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
                  {PAGE_CATALOG.map((section) => {
                    const prefixOn = section.prefix ? form.paths.includes(section.prefix) : false;
                    return (
                      <div key={section.label} className="p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{section.label}</span>
                          {section.prefix && (
                            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={prefixOn}
                                onChange={() => togglePath(section.prefix!)}
                                className="h-3.5 w-3.5 rounded border-border"
                              />
                              <span className="font-mono">{section.prefix}</span>
                              <span>whole section</span>
                            </label>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2">
                          {section.pages.map((page) => {
                            const covering = coveredByPrefix(page.path, form.paths);
                            const checked = form.paths.includes(page.path) || !!covering;
                            return (
                              <label
                                key={page.path}
                                className={`inline-flex items-start gap-2 text-sm cursor-pointer ${covering ? 'text-muted-foreground' : ''}`}
                                title={covering ? `Already covered by ${covering}` : page.path}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!!covering}
                                  onChange={() => togglePath(page.path)}
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-border"
                                />
                                <span className="min-w-0">
                                  {page.label}
                                  <span className="block font-mono text-[11px] text-muted-foreground truncate">{page.path}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {customPaths.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Custom paths</label>
                  <div className="flex flex-wrap gap-1.5">
                    {customPaths.map((p) => (
                      <span key={p} className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 px-2 py-0.5 font-mono text-xs">
                        {p}
                        <button onClick={() => togglePath(p)} aria-label={`Remove ${p}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Not in the page list — check the spelling, since a path no route serves grants nothing.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Paste paths</label>
                <div className="flex gap-2">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="/reports/*, /dashboard"
                    rows={2}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <Button variant="outline" onClick={addPastedPaths} disabled={!pasteText.trim()}>Add</Button>
                </div>
                <p className="text-xs text-muted-foreground">Comma or newline separated — merges into the selection above.</p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submit} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Role'}
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
              <CardTitle className="text-base">Delete Role</CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {deleteError}
                </div>
              )}
              <p className="text-sm">
                Delete <strong>{confirmDelete.name}</strong>?
                {confirmDelete.groupCount > 0 && ' It is still bundled into a group, so this will be refused until you remove it there.'}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> {deleting ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
