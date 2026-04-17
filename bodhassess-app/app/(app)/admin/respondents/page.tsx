'use client';

import { useState, useMemo, useEffect } from 'react';
import { Users, Plus, ClipboardCheck, ShieldCheck, X, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getRespondents, saveRespondents } from '@/lib/data-store';

interface Respondent {
  id: string;
  name: string;
  email: string;
  dob: string; // YYYY-MM-DD — used as login password
  sessions: number;
  lastAssessment: string;
  consent: 'Granted' | 'Withdrawn' | 'Pending';
}

const STORAGE_KEY = 'bodhassess.respondents';

const seedRespondents: Respondent[] = [
  { id: 'R-001', name: 'Arjun Patel', email: 'arjun.p@gmail.com', dob: '1995-03-14', sessions: 8, lastAssessment: 'PHQ-9 (2026-04-07)', consent: 'Granted' },
  { id: 'R-002', name: 'Priya Sharma', email: 'priya.s@outlook.com', dob: '1998-07-22', sessions: 3, lastAssessment: 'GAD-7 (2026-04-06)', consent: 'Granted' },
  { id: 'R-003', name: 'Rahul Verma', email: 'rahul.v@yahoo.com', dob: '1990-11-05', sessions: 12, lastAssessment: 'DASS-21 (2026-04-05)', consent: 'Granted' },
  { id: 'R-004', name: 'Ananya Reddy', email: 'ananya.r@gmail.com', dob: '1997-01-30', sessions: 5, lastAssessment: 'Beck BDI-II (2026-04-04)', consent: 'Withdrawn' },
  { id: 'R-005', name: 'Vikram Singh', email: 'vikram.s@hotmail.com', dob: '1993-09-12', sessions: 1, lastAssessment: 'Big Five (2026-04-03)', consent: 'Pending' },
  { id: 'R-006', name: 'Deepa Menon', email: 'deepa.m@gmail.com', dob: '1992-05-18', sessions: 6, lastAssessment: 'MMPI-2 (2026-04-02)', consent: 'Granted' },
];

const consentColors: Record<string, string> = {
  Granted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Withdrawn: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function RespondentsPage() {
  const [respondents, setRespondents] = useState<Respondent[]>(seedRespondents);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', dob: '', consent: 'Granted' as Respondent['consent'] });
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [createdCred, setCreatedCred] = useState<{ id: string; dob: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Respondent | null>(null);

  // Load persisted respondents via the shared data-store so all pages share state
  useEffect(() => {
    const stored = getRespondents();
    if (stored.length > 0) setRespondents(stored as Respondent[]);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveRespondents(respondents);
  }, [respondents, hydrated]);

  const stats = useMemo(() => {
    const granted = respondents.filter((r) => r.consent === 'Granted').length;
    const totalSessions = respondents.reduce((a, r) => a + r.sessions, 0);
    const pct = respondents.length ? Math.round((granted / respondents.length) * 100) : 0;
    return [
      { label: 'Total Respondents', value: String(respondents.length), icon: Users, change: `${granted} with consent` },
      { label: 'Sessions Completed', value: String(totalSessions), icon: ClipboardCheck, change: 'Across all respondents' },
      { label: 'Consent Granted', value: `${pct}%`, icon: ShieldCheck, change: `${granted} of ${respondents.length} respondents` },
    ];
  }, [respondents]);

  const openModal = () => {
    setForm({ name: '', email: '', dob: '', consent: 'Granted' });
    setError('');
    setCreatedCred(null);
    setModalOpen(true);
  };

  const submit = () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const dob = form.dob.trim();
    if (!name || !email || !dob) {
      setError('Name, email and date of birth are required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setError('Date of birth must be in YYYY-MM-DD format');
      return;
    }
    if (respondents.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      setError('A respondent with this email already exists');
      return;
    }
    // Generate next available R-ID (avoid collisions with existing)
    const nums = respondents
      .map((r) => parseInt(r.id.replace(/^R-/, ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
    const id = `R-${String(nextNum).padStart(3, '0')}`;
    setRespondents([
      { id, name, email, dob, sessions: 0, lastAssessment: '—', consent: form.consent },
      ...respondents,
    ]);
    setCreatedCred({ id, dob });
  };

  const confirmDeletion = () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setRespondents(respondents.filter((r) => r.id !== target.id));
    // Cascade: drop sessions assigned to this respondent so the portal doesn't orphan them
    try {
      const sraw = localStorage.getItem('bodhassess.sessions');
      if (sraw) {
        const all = JSON.parse(sraw) as any[];
        const remaining = all.filter((s) => s.respondentId !== target.id);
        localStorage.setItem('bodhassess.sessions', JSON.stringify(remaining));
      }
    } catch {}
    setConfirmDelete(null);
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Admin</span>
          <span>/</span>
          <span className="text-foreground font-medium">Respondents</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Respondents</h1>
            <p className="text-sm text-muted-foreground mt-1">View and manage assessment respondents.</p>
          </div>
          <Button variant="primary" onClick={openModal}>
            <Plus className="h-4 w-4" />
            Add Respondent
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Respondents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Login ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">DOB (password)</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Sessions</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Consent</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {respondents.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{r.id}</td>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.email}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.dob || '—'}</td>
                    <td className="px-5 py-3">{r.sessions}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${consentColors[r.consent]}`}>
                        {r.consent}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setConfirmDelete(r)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                        title={`Delete ${r.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Delete Respondent</CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Permanently remove <strong>{confirmDelete.name}</strong> ({confirmDelete.id})? This also deletes all assessment sessions assigned to them.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={confirmDeletion} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Add Respondent</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {createdCred ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400">
                    <p className="font-medium">Respondent created.</p>
                    <p className="mt-1 text-xs">Share these login credentials with the respondent:</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Portal URL</span>
                      <span>/portal/login</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Login ID</span>
                      <span className="font-semibold">{createdCred.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Password (DOB)</span>
                      <span className="font-semibold">{createdCred.dob}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
                    <Button variant="primary" onClick={() => window.open('/portal/login', '_blank')}>Open Portal</Button>
                  </div>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                      {error}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Name *</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g., Arjun Patel"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="respondent@example.com"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Date of Birth *</label>
                    <input
                      type="date"
                      value={form.dob}
                      onChange={(e) => setForm({ ...form, dob: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[0.6875rem] text-muted-foreground">Used as the respondent's login password on the portal.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Consent Status</label>
                    <select
                      value={form.consent}
                      onChange={(e) => setForm({ ...form, consent: e.target.value as Respondent['consent'] })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Granted">Granted</option>
                      <option value="Pending">Pending</option>
                      <option value="Withdrawn">Withdrawn</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={submit}>Add Respondent</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
