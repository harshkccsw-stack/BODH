import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronRight,
  Copy as CopyIcon,
  Edit3,
  Filter,
  Link as LinkIcon,
  MoreVertical,
  Plus,
  Search,
  Send,
  Trash2,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  assessmentRecordsApi,
  assessmentAllotmentsApi,
  type AssessmentRecord,
  type AssessmentStatus,
  type AssessmentAllotees,
} from '@/lib/api';
import { formatDDMMYYYY } from '@/lib/helpers';

const statusOptions: AssessmentStatus[] = ['ACTIVE', 'CLOSED', 'PAUSED', 'TEST'];

const statusBadge = (s: AssessmentStatus) => {
  if (s === 'ACTIVE') return { variant: 'success' as const, appearance: 'light' as const };
  if (s === 'CLOSED') return { variant: 'secondary' as const, appearance: 'light' as const };
  if (s === 'TEST') return { variant: 'info' as const, appearance: 'light' as const };
  return { variant: 'warning' as const, appearance: 'light' as const };
};

export default function AllAssessmentsPage() {
  const [rows, setRows] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created-desc');

  const [allotteesOpen, setAllotteesOpen] = useState<AssessmentRecord | null>(null);
  const [allotteesData, setAllotteesData] = useState<AssessmentAllotees | null>(null);
  const [allotteesLoading, setAllotteesLoading] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<AssessmentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await assessmentRecordsApi.list());
    } catch (e: any) {
      setError(e?.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.name || '').toLowerCase().includes(q) ||
        (r.questionnaireName || '').toLowerCase().includes(q) ||
        (r.vertical || '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const byName = (a: AssessmentRecord, b: AssessmentRecord) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    const ts = (r: AssessmentRecord) => (r.createdAt ? new Date(r.createdAt).getTime() : 0);
    switch (sortBy) {
      case 'created-asc': arr.sort((a, b) => ts(a) - ts(b)); break;
      case 'name-asc': arr.sort(byName); break;
      case 'name-desc': arr.sort((a, b) => byName(b, a)); break;
      case 'sessions-desc': arr.sort((a, b) => (b.sessionsCount || 0) - (a.sessionsCount || 0)); break;
      case 'created-desc':
      default: arr.sort((a, b) => ts(b) - ts(a)); break;
    }
    return arr;
  }, [filtered, sortBy]);

  const openAllotees = async (row: AssessmentRecord) => {
    setAllotteesOpen(row);
    setAllotteesData(null);
    setAllotteesLoading(true);
    try {
      setAllotteesData(await assessmentAllotmentsApi.list(row.id));
    } catch (e: any) {
      setError(e?.message || 'Failed to load allotees');
    } finally {
      setAllotteesLoading(false);
    }
  };

  const changeStatus = async (row: AssessmentRecord, status: AssessmentStatus) => {
    setSavingStatusId(row.id);
    try {
      const updated = await assessmentRecordsApi.updateStatus(row.id, status);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e: any) {
      setError(e?.message || 'Failed to update status');
    } finally {
      setSavingStatusId(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await assessmentRecordsApi.delete(confirmDelete.id);
      setRows((prev) => prev.filter((r) => r.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>BodhAssess</span><span>/</span>
            <span className="text-foreground font-medium">Assessments</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One row per assessment. Allotees shows the people, groups, and entities each assessment is mapped to.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => { window.location.href = '/assessments/create'; }}>
          <Plus className="size-4" /> Create Assessment
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <InputWrapper variant="md" className="w-full sm:w-72">
              <Search className="size-4" />
              <Input
                placeholder="Search assessments…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputWrapper>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" size="md">
                <Filter className="size-3.5 opacity-60" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44" size="md">
                <ArrowUpDown className="size-3.5 opacity-60" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created-desc">Newest first</SelectItem>
                <SelectItem value="created-asc">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name A–Z</SelectItem>
                <SelectItem value="name-desc">Name Z–A</SelectItem>
                <SelectItem value="sessions-desc">Most sessions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Assessments</CardTitle>
            <span className="text-sm text-muted-foreground">{filtered.length} assessment{filtered.length === 1 ? '' : 's'}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Allotees</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Sessions</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">No assessments yet.</td></tr>
                ) : sorted.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.name || <em className="italic text-muted-foreground text-xs">Untitled</em>}</div>
                      <div className="font-mono text-[0.6875rem] text-muted-foreground mt-0.5">{r.id}</div>
                    </td>
                    <td className="px-5 py-3 max-w-[16rem] truncate">{r.questionnaireName || '—'}</td>
                    <td className="px-5 py-3">
                      {r.vertical ? <Badge size="sm" shape="circle" variant="info" appearance="outline">{r.vertical}</Badge> : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => openAllotees(r)}
                        className="text-left hover:underline"
                        title="Click to see who this assessment has been allotted to"
                      >
                        <AllotteesSummary record={r} />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-semibold">{r.sessionsCount || 0}</span>
                      {r.completedCount ? <span className="text-xs text-muted-foreground"> · {r.completedCount} done</span> : null}
                    </td>
                    <td className="px-5 py-3">
                      <Select value={r.status} onValueChange={(v) => changeStatus(r, v as AssessmentStatus)} disabled={savingStatusId === r.id}>
                        <SelectTrigger className="w-32" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s} value={s}>
                              <Badge size="sm" shape="circle" {...statusBadge(s)}>{s}</Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDDMMYYYY(r.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" mode="icon" aria-label="Assessment actions">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => { window.location.href = `/assessments/edit/${encodeURIComponent(r.id)}`; }}>
                            <Edit3 className="size-3.5" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { window.location.href = `/assessments/${encodeURIComponent(r.id)}/respondents`; }}>
                            <UsersIcon className="size-3.5" /> View Respondents
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => { window.location.href = `/assessments/${encodeURIComponent(r.id)}/invite`; }}>
                            <Send className="size-3.5" /> Send Invitation
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { window.location.href = `/assessments/${encodeURIComponent(r.id)}/copy-link`; }}>
                            <LinkIcon className="size-3.5" /> Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setConfirmDelete(r)} className="text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950/30">
                            <Trash2 className="size-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Allotees popup */}
      {allotteesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setAllotteesOpen(null)}>
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Allotees · {allotteesOpen.name || allotteesOpen.id}</CardTitle>
              <button onClick={() => setAllotteesOpen(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 overflow-y-auto">
              {allotteesLoading || !allotteesData ? (
                <div className="p-4 text-sm text-muted-foreground">Loading…</div>
              ) : (
                <>
                  <Section title={`Entities (${allotteesData.entities.length})`}>
                    {allotteesData.entities.length === 0 ? <Empty msg="No entities allotted." /> : (
                      <ul className="space-y-1.5">
                        {allotteesData.entities.map((e) => (
                          <li key={e.entityId} className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{e.entityName || e.entityId}</div>
                              <div className="text-[0.6875rem] text-muted-foreground">
                                {e.sessionsCount ?? 0} session{e.sessionsCount === 1 ? '' : 's'}
                                {e.cap != null ? ` of ${e.cap}` : ' · no cap'}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  <Section title={`Groups (${allotteesData.groups.length})`}>
                    {allotteesData.groups.length === 0 ? <Empty msg="No groups allotted." /> : (
                      <ul className="space-y-1.5">
                        {allotteesData.groups.map((g) => (
                          <li key={g.groupId} className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2">
                            <div className="font-medium truncate">{g.groupName || g.groupId}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  <Section title={`Individual respondents (${allotteesData.respondents.length})`}>
                    {allotteesData.respondents.length === 0 ? <Empty msg="No individuals allotted directly." /> : (
                      <ul className="space-y-1.5">
                        {allotteesData.respondents.map((r) => (
                          <li key={r.respondentId} className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{r.respondentName || r.respondentId}</div>
                              {r.respondentEmail && <div className="text-[0.6875rem] text-muted-foreground truncate">{r.respondentEmail}</div>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  <div className="flex justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => { if (allotteesOpen) window.location.href = `/assessments/edit/${encodeURIComponent(allotteesOpen.id)}`; }}>
                      Manage Allotees <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Delete Assessment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Permanently remove <strong>{confirmDelete.name || confirmDelete.id}</strong>? Allotments will be removed too.
                Existing sessions and their answers are preserved.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
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

function AllotteesSummary({ record }: { record: AssessmentRecord }) {
  const e = record.entityCount || 0;
  const g = record.groupCount || 0;
  const r = record.respondentCount || 0;
  const parts: string[] = [];
  if (e > 0) parts.push(`${e} entit${e === 1 ? 'y' : 'ies'}`);
  if (g > 0) parts.push(`${g} group${g === 1 ? '' : 's'}`);
  if (r > 0) parts.push(`${r} individual${r === 1 ? '' : 's'}`);
  return (
    <span className="text-sm">
      {parts.length === 0
        ? <span className="text-muted-foreground italic">None allotted</span>
        : parts.join(' · ')}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-xs text-muted-foreground italic">{msg}</p>;
}

// Re-export CopyIcon so the import doesn't get tree-shaken before the
// invite/copy popup wires it in. Harmless no-op.
void CopyIcon;
