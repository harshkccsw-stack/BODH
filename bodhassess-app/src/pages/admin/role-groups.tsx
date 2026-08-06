'use client';

// Role Groups — the bundle of roles a person actually holds.
//
// A user holds exactly one group, and their access is the union of the paths
// of every role inside it. There are no deny rules, so nothing has to be
// resolved: adding a role can only widen a group. The modal shows that union
// live, because "which roles are in it" is not the question an admin is
// really asking — "what will they be able to open" is.

import { useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Pencil, Trash2, X, Search, Users, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { labelForPath } from '@/config/page-catalog';
import { rolesApi, type RoleResponse, type RoleGroupResponse } from './rolesApi';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

type FormState = { name: string; description: string; roleIds: number[] };

const EMPTY: FormState = { name: '', description: '', roleIds: [] };

export default function RoleGroupsPage() {
  const [groups, setGroups] = useState<RoleGroupResponse[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleGroupResponse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<RoleGroupResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [groupRes, roleRes] = await Promise.all([
        rolesApi.getAllRoleGroups(),
        rolesApi.getAllRoles(),
      ]);
      setGroups(groupRes.data);
      setRoles(roleRes.data);
    } catch (e: any) {
      setLoadError(errorText(e, 'Failed to load role groups'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      (g.description ?? '').toLowerCase().includes(q) ||
      g.roles.some((r) => r.name.toLowerCase().includes(q)));
  }, [groups, search]);

  const assignedMembers = useMemo(
    () => groups.reduce((acc, g) => acc + g.memberCount, 0),
    [groups],
  );

  // What the group being edited would open, recomputed from the ticked roles
  // so it updates before anything is saved.
  const previewPaths = useMemo(() => {
    const picked = roles.filter((r) => form.roleIds.includes(r.id));
    return Array.from(new Set(picked.flatMap((r) => r.urlPaths))).sort();
  }, [roles, form.roleIds]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (group: RoleGroupResponse) => {
    setEditing(group);
    setForm({
      name: group.name,
      description: group.description ?? '',
      roleIds: group.roles.map((r) => r.id),
    });
    setError('');
    setModalOpen(true);
  };

  const toggleRole = (id: number) => {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter((r) => r !== id) : [...f.roleIds, id],
    }));
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { setError('Group name is required'); return; }
    if (form.roleIds.length === 0) { setError('Select at least one role for this group'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        description: form.description.trim() || null,
        roleIds: form.roleIds,
      };
      if (editing) await rolesApi.updateRoleGroup(editing.roleGroupId, payload);
      else await rolesApi.createRoleGroup(payload);
      setModalOpen(false);
      await refresh();
    } catch (e: any) {
      setError(errorText(e, 'Failed to save group'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await rolesApi.deleteRoleGroup(confirmDelete.roleGroupId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(errorText(e, 'Failed to delete group'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span className="text-foreground font-medium">Role Groups</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </span>
              Role Groups
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bundle roles into the one group a person holds. Access is the union of every role inside.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate} disabled={roles.length === 0}>
            <Plus className="h-4 w-4" /> Add Group
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      {!loading && roles.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
          There are no roles yet — create some under Roles &amp; Permissions first, since a group is made of them.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Groups</div>
            <div className="text-2xl font-semibold mt-1">{groups.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Roles available</div>
            <div className="text-2xl font-semibold mt-1">{roles.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">People assigned</div>
            <div className="text-2xl font-semibold mt-1">{assignedMembers}</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups by name, description or role..."
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Groups
            <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
              {filtered.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {loading && groups.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                {groups.length === 0
                  ? 'No groups yet — click "Add Group" to bundle some roles.'
                  : 'No groups match your search.'}
              </div>
            ) : filtered.map((group) => (
              <div key={group.roleGroupId} className="group px-5 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{group.name}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        <KeyRound className="h-3 w-3" />
                        {group.roles.length} role{group.roles.length === 1 ? '' : 's'}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {group.urlPaths.length} page{group.urlPaths.length === 1 ? '' : 's'}
                      </span>
                      {group.memberCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-0.5 text-xs">
                          <Users className="h-3 w-3" />
                          {group.memberCount} assigned
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs">
                          nobody assigned
                        </span>
                      )}
                    </div>
                    {group.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{group.description}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {group.roles.map((r) => (
                        <span key={r.id} className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs">
                          {r.name}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {group.urlPaths.map((p) => (
                        <span key={p} title={labelForPath(p)} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="inline-flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(group)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30 transition-colors"
                      aria-label="Edit group"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(group); setDeleteError(''); }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 transition-colors"
                      aria-label="Delete group"
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
              <CardTitle className="text-base">{editing ? 'Edit Group' : 'Add Group'}</CardTitle>
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
                  <label className="text-sm font-medium">Group Name * <span className="text-muted-foreground font-normal">(max 50)</span></label>
                  <input
                    value={form.name}
                    maxLength={50}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Clinical Practitioner"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Description</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Who this group is for"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Roles *</label>
                  <span className="text-xs text-muted-foreground">{form.roleIds.length} selected</span>
                </div>
                <div className="rounded-lg border border-border divide-y divide-border max-h-56 overflow-y-auto">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-start gap-2 p-3 text-sm cursor-pointer hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={form.roleIds.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-border"
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{role.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {role.urlPaths.length} page{role.urlPaths.length === 1 ? '' : 's'}
                        </span>
                        {role.description && (
                          <span className="block text-xs text-muted-foreground">{role.description}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  This group opens <span className="text-muted-foreground font-normal">({previewPaths.length} page{previewPaths.length === 1 ? '' : 's'})</span>
                </label>
                <div className="rounded-lg border border-border p-3 max-h-28 overflow-y-auto">
                  {previewPaths.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Nothing yet — tick a role above.</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {previewPaths.map((p) => (
                        <span key={p} title={labelForPath(p)} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Everyone holding this group also gets the Dashboard, whether or not a role lists it.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submit} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Group'}
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
              <CardTitle className="text-base">Delete Group</CardTitle>
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
                Delete <strong>{confirmDelete.name}</strong>? The roles inside are shared and stay untouched.
                {confirmDelete.memberCount > 0 && ` ${confirmDelete.memberCount} person(s) still hold it, so this will be refused until they are reassigned.`}
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
