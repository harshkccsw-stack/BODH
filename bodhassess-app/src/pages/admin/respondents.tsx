'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE, assessmentsApi, type Assessment } from '@/lib/api';
import { createRespondent, deleteRespondent, getRespondents, type StoredRespondent } from '@/lib/data-store';
import { autoFormatDdmmyyyy, ddmmyyyyToIso, formatDDMMYYYY } from '@/lib/helpers';
import { Bell, ClipboardCheck, Plus, ShieldCheck, Trash2, Upload, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import BulkUploadModal from './bulk-upload-modal';

// Buckets for "assigned but not completed" assessments — drives the
// notification bell and the filter chips on this page.
type OverdueBucket = '24-48h' | '48h+';
const HOUR_MS = 60 * 60 * 1000;

function bucketForAssignment(a: Assessment, now: number): OverdueBucket | null {
  if (!a.createdAt) return null;
  if ((a.status || '').toLowerCase() === 'completed') return null;
  const assignedAt = new Date(a.createdAt).getTime();
  if (!Number.isFinite(assignedAt)) return null;
  const ageH = (now - assignedAt) / HOUR_MS;
  if (ageH >= 48) return '48h+';
  if (ageH >= 24) return '24-48h';
  return null;
}

// Compact human duration: "12m", "3h 20m", "2d 4h".
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rmins = mins % 60;
  if (hours < 24) return rmins ? `${hours}h ${rmins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const rhours = hours % 24;
  return rhours ? `${days}d ${rhours}h` : `${days}d`;
}

type Consent = 'Granted' | 'Withdrawn' | 'Pending';

const consentColors: Record<string, string> = {
  Granted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Withdrawn: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function RespondentsPage() {
  const [respondents, setRespondents] = useState<StoredRespondent[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [overdueFilter, setOverdueFilter] = useState<OverdueBucket | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', consent: 'Granted' as Consent });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdCred, setCreatedCred] = useState<{ id: string; dob: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StoredRespondent | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const existingEmails = useMemo(
    () => new Set(respondents.map((r) => r.email.toLowerCase())),
    [respondents],
  );

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [list, asmts] = await Promise.all([
        getRespondents(),
        assessmentsApi.list().catch(() => [] as Assessment[]),
      ]);
      setRespondents(list);
      setAssessments(asmts);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load respondents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  // Per-respondent worst overdue bucket (48h+ wins over 24-48h). A respondent
  // appears in the bucket of their most-stale assignment; once any of their
  // assignments tips past 48h they're treated as 48h+.
  const overdueByRespondent = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, OverdueBucket>();
    for (const a of assessments) {
      if (!a.respondentId) continue;
      const b = bucketForAssignment(a, now);
      if (!b) continue;
      const prev = map.get(a.respondentId);
      if (prev === '48h+' || b === '48h+') map.set(a.respondentId, '48h+');
      else map.set(a.respondentId, b);
    }
    return map;
  }, [assessments]);

  const overdueCounts = useMemo(() => {
    let a = 0, b = 0;
    overdueByRespondent.forEach((v) => { if (v === '24-48h') a++; else b++; });
    return { '24-48h': a, '48h+': b, total: a + b };
  }, [overdueByRespondent]);

  // For each respondent, find the most recently assigned assessment so we can
  // surface its time-to-start (started_at - created_at) on the table. If the
  // latest is unstarted, show how long they've been waiting instead.
  const latestByRespondent = useMemo(() => {
    const map = new Map<string, Assessment>();
    for (const a of assessments) {
      if (!a.respondentId || !a.createdAt) continue;
      const prev = map.get(a.respondentId);
      if (!prev || new Date(a.createdAt).getTime() > new Date(prev.createdAt!).getTime()) {
        map.set(a.respondentId, a);
      }
    }
    return map;
  }, [assessments]);

  // Apply the active filter chip to the table rows.
  const visibleRespondents = useMemo(() => {
    if (!overdueFilter) return respondents;
    return respondents.filter((r) => overdueByRespondent.get(r.id) === overdueFilter);
  }, [respondents, overdueByRespondent, overdueFilter]);

  const stats = useMemo(() => {
    const granted = respondents.filter((r) => r.consent === 'Granted').length;
    const totalSessions = respondents.reduce((a, r) => a + (r.sessions_count || 0), 0);
    const pct = respondents.length ? Math.round((granted / respondents.length) * 100) : 0;
    return [
      { label: 'Total Respondents', value: String(respondents.length), icon: Users, change: `${granted} with consent` },
      { label: 'Assessments Completed', value: String(totalSessions), icon: ClipboardCheck, change: 'Across all respondents' },
      { label: 'Consent Granted', value: `${pct}%`, icon: ShieldCheck, change: `${granted} of ${respondents.length} respondents` },
    ];
  }, [respondents]);

  const openModal = () => {
    setForm({ name: '', email: '', phone: '', dob: '', consent: 'Granted' });
    setError('');
    setCreatedCred(null);
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const dobInput = form.dob.trim();
    if (!name || !email || !dobInput) { setError('Name, email and date of birth are required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    const isoDob = ddmmyyyyToIso(dobInput);
    if (!isoDob) { setError('Date of birth must be in DD/MM/YYYY format'); return; }
    if (respondents.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      setError('A respondent with this email already exists');
      return;
    }
    const nums = respondents.map((r) => parseInt(r.id.replace(/^R-/, ''), 10)).filter((n) => !Number.isNaN(n));
    const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
    const id = `R-${String(nextNum).padStart(3, '0')}`;
    setSaving(true);
    const created = await createRespondent({
      id, name, email,
      phone: phone || undefined,
      dob: isoDob,
      consent: form.consent,
      sessions_count: 0,
      last_assessment: '—',
    });
    setSaving(false);
    if (!created) { setError('Failed to save — check that the API is running'); return; }
    await refresh();
    setCreatedCred({ id, dob: isoDob });
  };

  const confirmDeletion = async () => {
    if (!confirmDelete) return;
    const ok = await deleteRespondent(confirmDelete.id);
    setConfirmDelete(null);
    if (ok) await refresh();
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span className="text-foreground font-medium">Respondents</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Respondents</h1>
            <p className="text-sm text-muted-foreground mt-1">View and manage assessment respondents.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="outline"
                onClick={() => setNotificationsOpen((v) => !v)}
                title="Overdue assignment notifications"
              >
                <Bell className="h-4 w-4" />
                Notifications
                {overdueCounts.total > 0 && (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[0.6875rem] font-semibold text-white">
                    {overdueCounts.total}
                  </span>
                )}
              </Button>
              {notificationsOpen && (
                <div
                  className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-border bg-background shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium">Overdue assignments</p>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <button
                      onClick={() => { setOverdueFilter('24-48h'); setNotificationsOpen(false); }}
                      className="w-full flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span>Not completed in 24&ndash;48h</span>
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-[0.6875rem] font-semibold text-white">
                        {overdueCounts['24-48h']}
                      </span>
                    </button>
                    <button
                      onClick={() => { setOverdueFilter('48h+'); setNotificationsOpen(false); }}
                      className="w-full flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <span>Not completed in 48h+</span>
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[0.6875rem] font-semibold text-white">
                        {overdueCounts['48h+']}
                      </span>
                    </button>
                    <p className="text-[0.6875rem] text-muted-foreground pt-1">
                      Click a bucket to filter the table. Auto-reminders coming later.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Upload className="h-4 w-4" />
              Bulk Upload
            </Button>
            <Button variant="primary" onClick={openModal}>
              <Plus className="h-4 w-4" />
              Add Respondent
            </Button>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running at {API_BASE}?
        </div>
      )}

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
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">All Respondents</CardTitle>
          {overdueFilter && (
            <button
              onClick={() => setOverdueFilter(null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
              title="Clear filter"
            >
              Filter: overdue {overdueFilter}
              <X className="h-3 w-3" />
            </button>
          )}
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
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground" title="Time between assignment and first answer on the most recently assigned assessment">Time to start</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Overdue</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && respondents.length === 0 ? (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading from database…</td></tr>
                ) : visibleRespondents.length === 0 ? (
                  <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {overdueFilter
                      ? `No respondents are overdue ${overdueFilter}.`
                      : 'No respondents yet. Click "Add Respondent" to create one.'}
                  </td></tr>
                ) : visibleRespondents.map((r) => {
                  const ov = overdueByRespondent.get(r.id);
                  const latest = latestByRespondent.get(r.id);
                  const assignedMs = latest?.createdAt ? new Date(latest.createdAt).getTime() : null;
                  const startedMs = latest?.startedAt ? new Date(latest.startedAt).getTime() : null;
                  const timeToStart =
                    assignedMs && startedMs ? formatDuration(startedMs - assignedMs) : null;
                  const waitingFor =
                    assignedMs && !startedMs ? formatDuration(Date.now() - assignedMs) : null;
                  return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{r.id}</td>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.email}</td>
                    <td className="px-5 py-3 font-mono text-xs">{formatDDMMYYYY(r.dob) || '—'}</td>
                    <td className="px-5 py-3">{r.sessions_count || 0}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${consentColors[r.consent || 'Pending']}`}>
                        {r.consent || 'Pending'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {timeToStart ? (
                        <span className="text-foreground" title="Time between assignment and first answer">{timeToStart}</span>
                      ) : waitingFor ? (
                        <span className="text-muted-foreground italic" title="Assigned but not yet started">not started &middot; waiting {waitingFor}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {ov === '48h+' ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">48h+</span>
                      ) : ov === '24-48h' ? (
                        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">24&ndash;48h</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setConfirmDelete(r)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                        title={`Delete ${r.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {bulkOpen && (
        <BulkUploadModal
          onClose={() => setBulkOpen(false)}
          onImported={refresh}
          existingEmails={existingEmails}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Delete Respondent</CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Permanently remove <strong>{confirmDelete.name}</strong> ({confirmDelete.id})?
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={confirmDeletion} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
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
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {createdCred ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400">
                    <p className="font-medium">Respondent created in the database.</p>
                    <p className="mt-1 text-xs">Share these login credentials with the respondent:</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Portal URL</span><span>/portal/login</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Email (login)</span><span className="font-semibold truncate ml-2">{form.email.trim()}</span></div>
                    {form.phone.trim() && (
                      <div className="flex items-center justify-between"><span className="text-muted-foreground">Phone (also accepted)</span><span className="font-semibold">{form.phone.trim()}</span></div>
                    )}
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Password (DOB)</span><span className="font-semibold">{formatDDMMYYYY(createdCred.dob)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Reference ID</span><span className="font-semibold">{createdCred.id}</span></div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
                    <Button variant="primary" onClick={() => window.open('/portal/login', '_blank')}>Open Portal</Button>
                  </div>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Name *</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Arjun Patel" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Email *</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="respondent@example.com" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Phone</label>
                    <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    <p className="text-[0.6875rem] text-muted-foreground">Either email or phone can be used to sign in.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Date of Birth *</label>
                    <input
                      inputMode="numeric"
                      value={form.dob}
                      onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })}
                      placeholder="DD/MM/YYYY"
                      maxLength={10}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[0.6875rem] text-muted-foreground">Format DD/MM/YYYY. Used as the respondent's login password on the portal.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Consent Status</label>
                    <select value={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.value as Consent })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                      <option value="Granted">Granted</option>
                      <option value="Pending">Pending</option>
                      <option value="Withdrawn">Withdrawn</option>
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Add Respondent'}</Button>
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