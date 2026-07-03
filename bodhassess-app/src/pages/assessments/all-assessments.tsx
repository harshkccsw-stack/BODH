import { useEffect, useMemo, useState } from 'react';
import { portalSessionsApi, type PortalSession } from '@/lib/api';
import { formatDDMMYYYY } from '@/lib/helpers';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Filter,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  Trash2,
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

type SessionStatus = 'Active' | 'Completed' | 'Pending Review';
type Vertical = 'Clinical' | 'Industrial' | 'Counselling' | 'Experiments';

interface Session {
  id: string;
  name?: string;
  respondent: string;
  instrument: string;
  vertical: Vertical;
  language: string;
  status: SessionStatus;
  score: string;
  createdAt: string;
}

const statusBadgeProps: Record<SessionStatus, { variant: 'success' | 'primary' | 'warning'; appearance: 'light' }> = {
  'Completed': { variant: 'success', appearance: 'light' },
  'Active': { variant: 'primary', appearance: 'light' },
  'Pending Review': { variant: 'warning', appearance: 'light' },
};

const verticalBadgeProps: Record<Vertical, { variant: 'info' | 'secondary' | 'primary' | 'warning'; appearance: 'outline' }> = {
  'Clinical': { variant: 'info', appearance: 'outline' },
  'Industrial': { variant: 'secondary', appearance: 'outline' },
  'Counselling': { variant: 'primary', appearance: 'outline' },
  'Experiments': { variant: 'warning', appearance: 'outline' },
};

const LANGUAGES = ['English', 'Hindi', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi'];

export default function SessionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verticalFilter, setVerticalFilter] = useState('all');

  const [apiSessions, setApiSessions] = useState<PortalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; language: string; status: SessionStatus; score: string }>({
    name: '',
    language: 'English',
    status: 'Active',
    score: '--',
  });
  const [confirmReset, setConfirmReset] = useState<Session | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await portalSessionsApi.list();
      setApiSessions(list);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const allSessions: Session[] = useMemo(() => {
    return apiSessions.map((s) => ({
      id: s.id,
      name: s.name,
      respondent: s.respondent,
      instrument: s.instrument,
      vertical: (s.vertical || 'Clinical') as Vertical,
      language: s.language || 'English',
      status: (s.status || 'Active') as SessionStatus,
      score: s.score || '--',
      createdAt: formatDDMMYYYY(s.createdAt),
    }));
  }, [apiSessions]);

  const filteredSessions = allSessions.filter((session) => {
    const matchesSearch =
      searchQuery === '' ||
      session.respondent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (session.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.instrument.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    const matchesVertical = verticalFilter === 'all' || session.vertical === verticalFilter;
    return matchesSearch && matchesStatus && matchesVertical;
  });

  const openEdit = (s: Session) => {
    setEditForm({ name: s.name || '', language: s.language, status: s.status, score: s.score });
    setEditSession(s);
  };

  const isLiveSession = (id: string) => apiSessions.some((s) => s.id === id);

  const saveEdit = async () => {
    if (!editSession) return;
    if (isLiveSession(editSession.id)) {
      await portalSessionsApi.update(editSession.id, {
        name: editForm.name,
        language: editForm.language,
        status: editForm.status,
        score: editForm.score,
      });
      await refresh();
    }
    setEditSession(null);
  };

  const doReset = async () => {
    if (!confirmReset) return;
    if (isLiveSession(confirmReset.id)) {
      await portalSessionsApi.update(confirmReset.id, {
        status: 'Active',
        score: '--',
        answers: {},
        mqtScores: {},
      });
      await refresh();
    }
    setConfirmReset(null);
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    if (isLiveSession(confirmDelete.id)) {
      await portalSessionsApi.delete(confirmDelete.id);
      await refresh();
    }
    setConfirmDelete(null);
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>BodhAssess</span>
            <span>/</span>
            <span className="text-foreground font-medium">Assessments</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage assessments, track progress, and view reports.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => { window.location.href = '/assessments/create'; }}>
          <Plus className="size-4" />
          Create Assessment
        </Button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <InputWrapper variant="md" className="w-full sm:w-72">
              <Search className="size-4" />
              <Input
                placeholder="Search assessments, respondents, questionnaires..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </InputWrapper>

            <div className="flex items-center gap-3 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" size="md">
                  <Filter className="size-3.5 opacity-60" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Pending Review">Pending Review</SelectItem>
                </SelectContent>
              </Select>

              <Select value={verticalFilter} onValueChange={setVerticalFilter}>
                <SelectTrigger className="w-40" size="md">
                  <SelectValue placeholder="Vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verticals</SelectItem>
                  <SelectItem value="Clinical">Clinical</SelectItem>
                  <SelectItem value="Industrial">Industrial</SelectItem>
                  <SelectItem value="Counselling">Counselling</SelectItem>
                  <SelectItem value="Experiments">Experiments</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Assessments</CardTitle>
            <span className="text-sm text-muted-foreground">
              Showing {filteredSessions.length} assessment{filteredSessions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Assessment ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Language</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs">{session.id}</td>
                    <td className="px-5 py-3">
                      {session.name
                        ? <span className="font-medium">{session.name}</span>
                        : <span className="text-muted-foreground italic text-xs">Untitled</span>}
                    </td>
                    <td className="px-5 py-3 font-medium">{session.respondent}</td>
                    <td className="px-5 py-3">{session.instrument}</td>
                    <td className="px-5 py-3">
                      <Badge size="sm" shape="circle" {...verticalBadgeProps[session.vertical]}>
                        {session.vertical}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{session.language}</td>
                    <td className="px-5 py-3">
                      <Badge size="sm" shape="circle" {...statusBadgeProps[session.status]}>
                        {session.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{session.score}</td>
                    <td className="px-5 py-3 text-muted-foreground">{session.createdAt}</td>
                    <td className="px-5 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" mode="icon" aria-label="Assessment actions">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEdit(session)}>
                            <Edit3 className="size-3.5" /> Update
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConfirmReset(session)}>
                            <RotateCcw className="size-3.5" /> Reset Assessment
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setConfirmDelete(session)}
                            className="text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950/30"
                          >
                            <Trash2 className="size-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filteredSessions.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-muted-foreground">
                      No assessments found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing 1-{Math.min(filteredSessions.length, 10)} of {filteredSessions.length} assessments
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" mode="icon" disabled>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="primary" size="sm" className="min-w-7">1</Button>
          <Button variant="outline" size="sm" mode="icon">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* ===== Update modal ===== */}
      {editSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditSession(null)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Update Assessment</CardTitle>
              <button onClick={() => setEditSession(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono">
                <div className="flex justify-between"><span className="text-muted-foreground">Assessment</span><span>{editSession.id}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Respondent</span><span>{editSession.respondent}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Questionnaire</span><span className="truncate ml-2">{editSession.instrument}</span></div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Assessment Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Optional label"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Language</label>
                <select
                  value={editForm.language}
                  onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as SessionStatus })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="Active">Active</option>
                  <option value="Pending Review">Pending Review</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Score</label>
                <input
                  value={editForm.score}
                  onChange={(e) => setEditForm({ ...editForm, score: e.target.value })}
                  placeholder="--"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditSession(null)}>Cancel</Button>
                <Button variant="primary" onClick={saveEdit}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Reset confirmation ===== */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmReset(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-500" />
                Reset Assessment
              </CardTitle>
              <button onClick={() => setConfirmReset(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Clear responses and scores for <strong>{confirmReset.id}</strong> ({confirmReset.respondent})?
                The respondent will be able to retake <strong>{confirmReset.instrument}</strong> from the portal.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmReset(null)}>Cancel</Button>
                <Button variant="primary" onClick={doReset}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Delete confirmation ===== */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete Assessment
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Permanently remove assessment <strong>{confirmDelete.id}</strong> for <strong>{confirmDelete.respondent}</strong>?
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
