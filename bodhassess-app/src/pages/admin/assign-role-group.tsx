'use client';

// Assign Role Group — hand a group to a person.
//
// Deliberately its own screen rather than a field on the practitioner form:
// creating an account and granting it pages are separate decisions, so a new
// practitioner starts with the Dashboard and nothing else until someone comes
// here on purpose.
//
// The list is everyone who can sign in to the dashboard — practitioners, plus
// any superadmin. Superadmin rows are shown but not assignable: the flag
// already opens everything, so a group on that row would describe access the
// person does not depend on.

import { useEffect, useMemo, useState } from 'react';
import { UserCog, Search, ShieldCheck, Check, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { rolesApi, type DashboardUserResponse, type RoleGroupResponse } from './rolesApi';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

export default function AssignRoleGroupPage() {
  const [users, setUsers] = useState<DashboardUserResponse[]>([]);
  const [groups, setGroups] = useState<RoleGroupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  // Per-row state, keyed by userId, so one row saving or failing never blanks
  // the others.
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ userId: number; message: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [userRes, groupRes] = await Promise.all([
        rolesApi.getDashboardUsers(),
        rolesApi.getAllRoleGroups(),
      ]);
      setUsers(userRes.data);
      setGroups(groupRes.data);
    } catch (e: any) {
      setLoadError(errorText(e, 'Failed to load dashboard users'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.name ?? '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.serialId ?? '').toLowerCase().includes(q) ||
      (u.roleGroupName ?? '').toLowerCase().includes(q));
  }, [users, search]);

  const withGroup = useMemo(
    () => users.filter((u) => u.roleGroupId !== null).length,
    [users],
  );
  const dashboardOnly = useMemo(
    () => users.filter((u) => !u.superAdmin && u.roleGroupId === null).length,
    [users],
  );

  const assign = async (user: DashboardUserResponse, value: string) => {
    const roleGroupId = value === '' ? null : Number(value);
    setSavingId(user.userId);
    setRowError(null);
    setSavedId(null);
    try {
      const res = await rolesApi.assignRoleGroup(user.userId, roleGroupId);
      setUsers((list) => list.map((u) => (u.userId === user.userId ? res.data : u)));
      setSavedId(user.userId);
    } catch (e: any) {
      setRowError({ userId: user.userId, message: errorText(e, 'Failed to assign group') });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span className="text-foreground font-medium">Assign Role Group</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <UserCog className="h-5 w-5 text-primary" />
          </span>
          Assign Role Group
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Give a dashboard user the one group they hold. Changes apply on their next page load.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
          There are no role groups yet — create one under Role Groups before assigning.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Dashboard users</div>
            <div className="text-2xl font-semibold mt-1">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Holding a group</div>
            <div className="text-2xl font-semibold mt-1">{withGroup}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Dashboard only</div>
            <div className="text-2xl font-semibold mt-1">{dashboardOnly}</div>
            <div className="text-xs text-muted-foreground mt-1">Can sign in, but the menu is empty</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, serial or group..."
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-4 w-4 text-primary" />
            People
            <span className="ml-1 inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
              {filtered.length}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {loading && users.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                {users.length === 0 ? 'No dashboard users yet.' : 'Nobody matches your search.'}
              </div>
            ) : filtered.map((user) => (
              <div key={user.userId} className="px-5 py-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">
                        {user.name || (user.superAdmin ? 'Administrator' : user.email)}
                      </span>
                      {user.serialId && (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {user.serialId}
                        </span>
                      )}
                      {user.superAdmin && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 text-xs">
                          <ShieldCheck className="h-3 w-3" /> Super admin
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{user.email}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    {savingId === user.userId && (
                      <span className="text-xs text-muted-foreground">Saving…</span>
                    )}
                    {savedId === user.userId && savingId !== user.userId && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <Check className="h-3.5 w-3.5" /> Saved
                      </span>
                    )}
                    <select
                      value={user.roleGroupId ?? ''}
                      disabled={user.superAdmin || savingId === user.userId || groups.length === 0}
                      onChange={(e) => assign(user, e.target.value)}
                      className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 disabled:opacity-60"
                    >
                      <option value="">
                        {user.superAdmin ? 'Full access (super admin)' : 'None — dashboard only'}
                      </option>
                      {groups.map((g) => (
                        <option key={g.roleGroupId} value={g.roleGroupId}>
                          {g.name} ({g.urlPaths.length} pages)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {rowError?.userId === user.userId && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertCircle className="h-3.5 w-3.5" /> {rowError.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
