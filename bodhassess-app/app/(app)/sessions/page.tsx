'use client';

import { useEffect, useMemo, useState } from 'react';
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
  respondent: string;
  instrument: string;
  vertical: Vertical;
  language: string;
  status: SessionStatus;
  score: string;
  createdAt: string;
}

const seedMockSessions: Session[] = [
  { id: 'SESS-0047', respondent: 'Arjun Patel', instrument: 'PHQ-9', vertical: 'Clinical', language: 'Hindi', status: 'Completed', score: 'T=62', createdAt: '2026-04-09' },
  { id: 'SESS-0046', respondent: 'Priya Sharma', instrument: 'GAD-7', vertical: 'Clinical', language: 'English', status: 'Active', score: '--', createdAt: '2026-04-09' },
  { id: 'SESS-0045', respondent: 'Rahul Verma', instrument: 'DASS-21', vertical: 'Clinical', language: 'English', status: 'Completed', score: 'T=55', createdAt: '2026-04-08' },
  { id: 'SESS-0044', respondent: 'Ananya Reddy', instrument: 'Beck BDI-II', vertical: 'Clinical', language: 'Telugu', status: 'Pending Review', score: 'T=71', createdAt: '2026-04-08' },
  { id: 'SESS-0043', respondent: 'Vikram Singh', instrument: 'Big Five IPIP-NEO', vertical: 'Industrial', language: 'English', status: 'Completed', score: 'Profile Ready', createdAt: '2026-04-07' },
  { id: 'SESS-0042', respondent: 'Meera Nair', instrument: 'HEXACO', vertical: 'Industrial', language: 'Malayalam', status: 'Active', score: '--', createdAt: '2026-04-07' },
  { id: 'SESS-0041', respondent: 'Karthik Iyer', instrument: 'SCAS', vertical: 'Counselling', language: 'Tamil', status: 'Completed', score: 'T=48', createdAt: '2026-04-06' },
  { id: 'SESS-0040', respondent: 'Shreya Gupta', instrument: 'CDI-2', vertical: 'Counselling', language: 'Hindi', status: 'Pending Review', score: 'T=64', createdAt: '2026-04-06' },
  { id: 'SESS-0039', respondent: 'Aditya Joshi', instrument: 'Learning Agility', vertical: 'Industrial', language: 'English', status: 'Completed', score: 'T=59', createdAt: '2026-04-05' },
  { id: 'SESS-0038', respondent: 'Neha Kulkarni', instrument: 'AI Adaptability Index', vertical: 'Experiments', language: 'Marathi', status: 'Active', score: '--', createdAt: '2026-04-05' },
  { id: 'SESS-0037', respondent: 'Rohan Deshmukh', instrument: 'PHQ-9', vertical: 'Clinical', language: 'English', status: 'Completed', score: 'T=44', createdAt: '2026-04-04' },
  { id: 'SESS-0036', respondent: 'Divya Menon', instrument: 'GAD-7', vertical: 'Clinical', language: 'Kannada', status: 'Completed', score: 'T=52', createdAt: '2026-04-04' },
];

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

const SESSION_STORAGE_KEY = 'bodhassess.sessions';
const DELETED_SEED_KEY = 'bodhassess.deletedSeedSessions';
const LANGUAGES = ['English', 'Hindi', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi'];

export default function SessionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verticalFilter, setVerticalFilter] = useState('all');

  const [storedSessions, setStoredSessions] = useState<any[]>([]);
  const [deletedSeedIds, setDeletedSeedIds] = useState<string[]>([]);

  const [editSession, setEditSession] = useState<Session | null>(null);
  const [editForm, setEditForm] = useState<{ language: string; status: SessionStatus; score: string }>({
    language: 'English',
    status: 'Active',
    score: '--',
  });
  const [confirmReset, setConfirmReset] = useState<Session | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Session | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setStoredSessions(parsed);
      }
    } catch {}
    try {
      const d = localStorage.getItem(DELETED_SEED_KEY);
      if (d) {
        const parsed = JSON.parse(d);
        if (Array.isArray(parsed)) setDeletedSeedIds(parsed);
      }
    } catch {}
  }, []);

  const persistStored = (next: any[]) => {
    setStoredSessions(next);
    try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next)); } catch {}
  };

  const persistDeletedSeeds = (next: string[]) => {
    setDeletedSeedIds(next);
    try { localStorage.setItem(DELETED_SEED_KEY, JSON.stringify(next)); } catch {}
  };

  const allSessions: Session[] = useMemo(() => {
    const stored: Session[] = storedSessions.map((s: any) => ({
      id: s.id,
      respondent: s.respondent,
      instrument: s.instrument,
      vertical: s.vertical,
      language: s.language,
      status: s.status,
      score: s.score ?? '--',
      createdAt: s.createdAt,
    }));
    const storedIds = new Set(stored.map((s) => s.id));
    // If a stored record exists with the same id as a seed, prefer the stored (edited) version
    const seeds = seedMockSessions
      .filter((s) => !deletedSeedIds.includes(s.id))
      .filter((s) => !storedIds.has(s.id));
    return [...stored, ...seeds];
  }, [storedSessions, deletedSeedIds]);

  const filteredSessions = allSessions.filter((session) => {
    const matchesSearch =
      searchQuery === '' ||
      session.respondent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.instrument.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    const matchesVertical = verticalFilter === 'all' || session.vertical === verticalFilter;
    return matchesSearch && matchesStatus && matchesVertical;
  });

  const openEdit = (s: Session) => {
    setEditForm({ language: s.language, status: s.status, score: s.score });
    setEditSession(s);
  };

  // Pull the full stored record (if any) or synthesize one from a seed row
  const findFullRecord = (s: Session) => {
    const existing = storedSessions.find((x: any) => x.id === s.id);
    if (existing) return existing;
    return { ...s };
  };

  const saveEdit = () => {
    if (!editSession) return;
    const record = findFullRecord(editSession);
    const updated = { ...record, language: editForm.language, status: editForm.status, score: editForm.score };
    const rest = storedSessions.filter((x: any) => x.id !== updated.id);
    persistStored([updated, ...rest]);
    setEditSession(null);
  };

  const doReset = () => {
    if (!confirmReset) return;
    const record = findFullRecord(confirmReset);
    const resetRecord = {
      ...record,
      status: 'Active',
      score: '--',
      answers: undefined,
      mqtScores: undefined,
      completedAt: undefined,
    };
    const rest = storedSessions.filter((x: any) => x.id !== resetRecord.id);
    persistStored([resetRecord, ...rest]);
    setConfirmReset(null);
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    // Remove from stored (if present)
    const rest = storedSessions.filter((x: any) => x.id !== id);
    if (rest.length !== storedSessions.length) persistStored(rest);
    // If it was a seed row, remember to hide it across refreshes
    const isSeed = seedMockSessions.some((s) => s.id === id);
    if (isSeed && !deletedSeedIds.includes(id)) {
      persistDeletedSeeds([...deletedSeedIds, id]);
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
            <span className="text-foreground font-medium">Sessions</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage assessment sessions, track progress, and view reports.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => { window.location.href = '/sessions/create'; }}>
          <Plus className="size-4" />
          Create Session
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <InputWrapper variant="md" className="w-full sm:w-72">
              <Search className="size-4" />
              <Input
                placeholder="Search sessions, respondents, instruments..."
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
            <CardTitle className="text-base">All Sessions</CardTitle>
            <span className="text-sm text-muted-foreground">
              Showing {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Session ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
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
                          <Button variant="ghost" size="sm" mode="icon" aria-label="Session actions">
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
                    <td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">
                      No sessions found matching your filters.
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
          Showing 1-{Math.min(filteredSessions.length, 10)} of {filteredSessions.length} sessions
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
              <CardTitle className="text-base">Update Session</CardTitle>
              <button onClick={() => setEditSession(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono">
                <div className="flex justify-between"><span className="text-muted-foreground">Session</span><span>{editSession.id}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Respondent</span><span>{editSession.respondent}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Instrument</span><span className="truncate ml-2">{editSession.instrument}</span></div>
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
                Delete Session
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Permanently remove session <strong>{confirmDelete.id}</strong> for <strong>{confirmDelete.respondent}</strong>?
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
