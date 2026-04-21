'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FolderTree,
  Pencil,
  Plus,
  Search as SearchIcon,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getGroups, createGroup, updateGroup, deleteGroup as deleteGroupApi,
  getRespondents, getAllMembersRecursive,
  type Group, type StoredRespondent,
} from '@/lib/data-store';
import { questionnairesApi, portalSessionsApi, type PublishedQuestionnaire } from '@/lib/api';

function newGroupId() {
  return `grp-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeVertical(v: unknown): string {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('indust')) return 'Industrial';
  if (s.startsWith('coun')) return 'Counselling';
  if (s.startsWith('exper')) return 'Experiments';
  if (s.startsWith('clin')) return 'Clinical';
  return 'Clinical';
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [respondents, setRespondents] = useState<StoredRespondent[]>([]);
  const [instruments, setInstruments] = useState<PublishedQuestionnaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const [groupForm, setGroupForm] = useState<{ id: string | null; parentId: string | null; name: string; description: string }>({
    id: null, parentId: null, name: '', description: '',
  });
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [saving, setSaving] = useState(false);

  const [memberTargetId, setMemberTargetId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPicked, setMemberPicked] = useState<Set<string>>(new Set());

  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);
  const [instrumentSearch, setInstrumentSearch] = useState('');
  const [instrumentPicked, setInstrumentPicked] = useState<Set<string>>(new Set());
  const [assignFeedback, setAssignFeedback] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<Group | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [g, r, i] = await Promise.all([getGroups(), getRespondents(), questionnairesApi.list()]);
      setGroups(g);
      setRespondents(r);
      setInstruments(i);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const respondentById = useMemo(() => {
    const map: Record<string, StoredRespondent> = {};
    respondents.forEach((r) => { map[r.id] = r; });
    return map;
  }, [respondents]);

  const rootGroups = useMemo(() => groups.filter((g) => !g.parentId), [groups]);
  const childrenOf = (id: string) => groups.filter((g) => g.parentId === id);

  const matchesSearch = (g: Group): boolean => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q) ||
      g.memberIds.some((mid) => {
        const r = respondentById[mid];
        return r && (r.name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
      })
    );
  };

  const isVisibleInTree = (g: Group): boolean => {
    if (matchesSearch(g)) return true;
    return childrenOf(g.id).some((c) => isVisibleInTree(c));
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // ---- Group CRUD ----
  const openNewGroup = (parentId: string | null) => {
    setGroupForm({ id: null, parentId, name: '', description: '' });
    setGroupError('');
    setGroupModalOpen(true);
  };
  const openEditGroup = (g: Group) => {
    setGroupForm({ id: g.id, parentId: g.parentId, name: g.name, description: g.description || '' });
    setGroupError('');
    setGroupModalOpen(true);
  };
  const submitGroup = async () => {
    const name = groupForm.name.trim();
    if (!name) { setGroupError('Name is required'); return; }
    const dup = groups.find((g) =>
      g.name.toLowerCase() === name.toLowerCase() &&
      g.parentId === groupForm.parentId &&
      g.id !== groupForm.id,
    );
    if (dup) { setGroupError('A group with this name already exists at this level'); return; }
    setSaving(true);
    if (groupForm.id) {
      const existing = groups.find((g) => g.id === groupForm.id);
      if (existing) {
        await updateGroup(groupForm.id, { ...existing, name, description: groupForm.description.trim() });
      }
    } else {
      await createGroup({
        id: newGroupId(),
        name,
        description: groupForm.description.trim(),
        parentId: groupForm.parentId,
        memberIds: [],
        assignedInstruments: [],
      });
      if (groupForm.parentId) setExpanded((p) => new Set(p).add(groupForm.parentId!));
    }
    setSaving(false);
    setGroupModalOpen(false);
    await refresh();
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    await deleteGroupApi(confirmDelete.id);
    setConfirmDelete(null);
    await refresh();
  };

  // ---- Members ----
  const openMembers = (groupId: string) => {
    const g = groups.find((x) => x.id === groupId);
    setMemberPicked(new Set(g?.memberIds || []));
    setMemberSearch('');
    setMemberTargetId(groupId);
  };
  const toggleMemberPick = (id: string) =>
    setMemberPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const saveMembers = async () => {
    if (!memberTargetId) return;
    const g = groups.find((x) => x.id === memberTargetId);
    if (!g) return;
    await updateGroup(memberTargetId, { ...g, memberIds: [...memberPicked] });
    setMemberTargetId(null);
    await refresh();
  };

  // ---- Assign instruments ----
  const openAssign = (groupId: string) => {
    setInstrumentSearch('');
    setInstrumentPicked(new Set());
    setAssignFeedback('');
    setAssignTargetId(groupId);
  };
  const toggleInstrumentPick = (name: string) =>
    setInstrumentPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  const submitAssign = async () => {
    if (!assignTargetId) return;
    const group = groups.find((g) => g.id === assignTargetId);
    if (!group) return;
    if (instrumentPicked.size === 0) { setAssignFeedback('Pick at least one instrument'); return; }
    const memberIds = getAllMembersRecursive(assignTargetId, groups);
    if (memberIds.length === 0) { setAssignFeedback('This group has no members yet'); return; }

    try {
      const newSessions: any[] = [];
      memberIds.forEach((mid) => {
        const r = respondentById[mid];
        if (!r) return;
        instrumentPicked.forEach((name) => {
          const inst = instruments.find((i) => i.name === name);
          const sid = `SESS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          newSessions.push({
            id: sid,
            respondentId: r.id,
            respondent: r.name,
            respondentEmail: r.email,
            instrument: name.split(' (')[0],
            instrumentFullName: name,
            vertical: normalizeVertical(inst?.vertical),
            language: 'English',
            status: 'Active',
            score: '--',
            groupId: assignTargetId,
            groupName: group.name,
          });
        });
      });
      const res = await portalSessionsApi.bulk(newSessions);
      const createdCount = res?.created ?? newSessions.length;
      await updateGroup(assignTargetId, {
        ...group,
        assignedInstruments: Array.from(new Set([...(group.assignedInstruments || []), ...instrumentPicked])),
      });
      setAssignFeedback(`Created ${createdCount} session${createdCount !== 1 ? 's' : ''} across ${memberIds.length} respondent${memberIds.length !== 1 ? 's' : ''}.`);
      await refresh();
    } catch (e: any) {
      setAssignFeedback(`Failed: ${e?.message || 'unknown error'}`);
    }
  };

  // ---- Tree render ----
  const GroupNode: React.FC<{ g: Group; depth: number }> = ({ g, depth }) => {
    if (!isVisibleInTree(g)) return null;
    const kids = childrenOf(g.id);
    const isOpen = expanded.has(g.id);
    const directMembers = g.memberIds.length;
    const totalMembers = getAllMembersRecursive(g.id, groups).length;
    return (
      <div>
        <div className="rounded-lg border border-border bg-background hover:bg-muted/40 transition-colors" style={{ marginLeft: depth * 20 }}>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <button type="button" onClick={() => toggleExpand(g.id)} className="shrink-0 p-0.5 rounded hover:bg-muted">
              {kids.length > 0 ? (isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />) : <span className="inline-block h-4 w-4" />}
            </button>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderTree className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{g.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {directMembers} direct member{directMembers !== 1 ? 's' : ''}
                {totalMembers !== directMembers && ` · ${totalMembers} total`}
                {kids.length > 0 && ` · ${kids.length} subgroup${kids.length !== 1 ? 's' : ''}`}
                {(g.assignedInstruments?.length || 0) > 0 && ` · ${g.assignedInstruments!.length} questionnaire${g.assignedInstruments!.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => openNewGroup(g.id)}><Plus className="h-3.5 w-3.5" />Subgroup</Button>
              <Button variant="outline" size="sm" onClick={() => openMembers(g.id)}><UserPlus className="h-3.5 w-3.5" />Members</Button>
              <Button variant="primary" size="sm" onClick={() => openAssign(g.id)}><ClipboardCheck className="h-3.5 w-3.5" />Assign</Button>
              <Button variant="ghost" size="sm" mode="icon" onClick={() => openEditGroup(g)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" mode="icon" onClick={() => setConfirmDelete(g)}>
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </div>
          </div>
          {isOpen && directMembers > 0 && (
            <div className="px-3 pb-3 pt-1 flex flex-wrap gap-1.5">
              {g.memberIds.map((mid) => {
                const r = respondentById[mid];
                return (
                  <span key={mid} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {r ? r.name : <span className="text-muted-foreground italic">(unknown {mid})</span>}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {isOpen && kids.length > 0 && (
          <div className="mt-2 space-y-2">
            {kids.map((k) => <GroupNode key={k.id} g={k} depth={depth + 1} />)}
          </div>
        )}
      </div>
    );
  };

  const totalMembers = new Set(groups.flatMap((g) => g.memberIds)).size;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span><span className="text-foreground font-medium">Groups</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <FolderTree className="h-6 w-6 text-primary" /> Groups
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Organise respondents into groups and nested subgroups. Assign one or more instruments to a group to bulk-create sessions for every member (direct + descendants).
            </p>
          </div>
          <Button variant="primary" onClick={() => openNewGroup(null)}>
            <Plus className="h-4 w-4" /> New Group
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Groups</p><p className="text-2xl font-semibold mt-1">{groups.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Respondents assigned</p><p className="text-2xl font-semibold mt-1">{totalMembers}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Available instruments</p><p className="text-2xl font-semibold mt-1">{instruments.length}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" autoComplete="off" spellCheck={false} placeholder="Search groups or members..."
          value={search} onChange={(e) => setSearch(e.currentTarget.value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading from database…</p>
      ) : groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <FolderTree className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">No groups yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Create a top-level group (e.g., "Grade 9 Students") and add respondents, or nest subgroups.
            </p>
            <Button variant="primary" className="mt-4" onClick={() => openNewGroup(null)}>
              <Plus className="h-4 w-4" /> Create your first group
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rootGroups.filter(isVisibleInTree).map((g) => <GroupNode key={g.id} g={g} depth={0} />)}
        </div>
      )}

      {/* Group modal */}
      {groupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setGroupModalOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">
                {groupForm.id ? 'Rename Group' : groupForm.parentId ? 'Add Subgroup' : 'Add Group'}
              </CardTitle>
              <button onClick={() => setGroupModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>{groupError}</span>
                </div>
              )}
              {groupForm.parentId && (
                <p className="text-xs text-muted-foreground">
                  Under: <span className="font-medium text-foreground">{groups.find((g) => g.id === groupForm.parentId)?.name}</span>
                </p>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.currentTarget.value })}
                  placeholder="e.g., Grade 9 Students"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea rows={2} value={groupForm.description} onChange={(e) => setGroupForm({ ...groupForm, description: e.currentTarget.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setGroupModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submitGroup} disabled={saving}>{saving ? 'Saving…' : groupForm.id ? 'Save' : 'Create'}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Members modal */}
      {memberTargetId && (() => {
        const g = groups.find((x) => x.id === memberTargetId);
        const q = memberSearch.trim().toLowerCase();
        const list = respondents.filter((r) =>
          !q || r.name.toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setMemberTargetId(null)}>
            <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
                <CardTitle className="text-base">Members — {g?.name}</CardTitle>
                <button onClick={() => setMemberTargetId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 flex flex-col gap-3 pb-4">
                <div className="relative shrink-0">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input autoFocus type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.currentTarget.value)}
                    placeholder="Search respondents..."
                    className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
                  {list.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      {respondents.length === 0 ? 'No respondents in the database yet.' : 'No matches.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {list.map((r) => {
                        const picked = memberPicked.has(r.id);
                        return (
                          <li key={r.id}>
                            <label className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50', picked && 'bg-primary/5')}>
                              <input type="checkbox" checked={picked} onChange={() => toggleMemberPick(r.id)} className="rounded" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{r.name}</p>
                                <p className="text-xs text-muted-foreground truncate font-mono">{r.id} · {r.email}</p>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="flex items-center justify-between shrink-0 pt-1">
                  <p className="text-xs text-muted-foreground">{memberPicked.size} selected</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setMemberTargetId(null)}>Cancel</Button>
                    <Button variant="primary" onClick={saveMembers}>Save Members</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Assign instruments modal */}
      {assignTargetId && (() => {
        const g = groups.find((x) => x.id === assignTargetId);
        const targetMemberIds = getAllMembersRecursive(assignTargetId, groups);
        const q = instrumentSearch.trim().toLowerCase();
        const instList = instruments.filter((i) => {
          if (!q) return true;
          return (i.name || '').toLowerCase().includes(q) || (i.shortName || '').toLowerCase().includes(q) || (i.vertical || '').toLowerCase().includes(q);
        });
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setAssignTargetId(null)}>
            <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
                <div>
                  <CardTitle className="text-base">Assign Questionnaires — {g?.name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {targetMemberIds.length} respondent{targetMemberIds.length !== 1 ? 's' : ''} in this group (incl. subgroups)
                  </p>
                </div>
                <button onClick={() => setAssignTargetId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 flex flex-col gap-3 pb-4">
                {assignFeedback && (
                  <div className={cn(
                    'rounded-lg border px-3 py-2 text-xs flex items-start gap-2',
                    assignFeedback.startsWith('Created')
                      ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
                  )}>
                    {assignFeedback.startsWith('Created') ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                    <span>{assignFeedback}</span>
                  </div>
                )}
                <div className="relative shrink-0">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input autoFocus type="text" value={instrumentSearch} onChange={(e) => setInstrumentSearch(e.currentTarget.value)}
                    placeholder="Search instruments..."
                    className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
                  {instList.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      {instruments.length === 0 ? 'No instruments published yet. Use Question Bank → Create Questionnaire first.' : 'No matches.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {instList.map((i) => {
                        const picked = instrumentPicked.has(i.name);
                        return (
                          <li key={i.id || i.name}>
                            <label className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50', picked && 'bg-primary/5')}>
                              <input type="checkbox" checked={picked} onChange={() => toggleInstrumentPick(i.name)} className="rounded" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{i.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {i.shortName ? `${i.shortName} · ` : ''}{String(i.vertical || '').toLowerCase()} · {Array.isArray(i.questions) ? i.questions.length : 0} Q
                                </p>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="flex items-center justify-between shrink-0 pt-1">
                  <p className="text-xs text-muted-foreground">
                    {instrumentPicked.size} questionnaire{instrumentPicked.size !== 1 ? 's' : ''} selected — {instrumentPicked.size * targetMemberIds.length} assessment{instrumentPicked.size * targetMemberIds.length !== 1 ? 's' : ''} will be created
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAssignTargetId(null)}>Close</Button>
                    <Button variant="primary" onClick={submitAssign} disabled={instrumentPicked.size === 0 || targetMemberIds.length === 0}>
                      <ClipboardCheck className="h-3.5 w-3.5" /> Create Assessments
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Delete Group
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Remove <strong>{confirmDelete.name}</strong> and all its subgroups? (Respondents themselves are preserved.)
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
