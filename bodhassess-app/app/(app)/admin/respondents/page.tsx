'use client';

<<<<<<< HEAD
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Plus, X, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  createRespondent,
  getRespondents,
  setUserActive,
  type CreateRespondentRequest,
  type LanguageCode,
  type Respondent,
} from '@/lib/api/admin';

const LANGUAGES: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'kn', label: 'Kannada' },
  { value: 'bn', label: 'Bengali' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'or', label: 'Odia' },
  { value: 'pa', label: 'Punjabi' },
];
=======
import { useEffect, useMemo, useState } from 'react';
import { Users, Plus, ClipboardCheck, ShieldCheck, X, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getRespondents, createRespondent, deleteRespondent, type StoredRespondent } from '@/lib/data-store';

type Consent = 'Granted' | 'Withdrawn' | 'Pending';
>>>>>>> 8390f94fe2e576279e937e9972afbf6bff638992

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

type FormState = {
  name: string;
  email: string;
  primary_language: LanguageCode;
  date_of_birth: string;
};

<<<<<<< HEAD
const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  primary_language: 'en',
  date_of_birth: '',
};

export default function RespondentsPage() {
  const [respondents, setRespondents] = useState<Respondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRespondents();
      setRespondents(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load respondents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(() => respondents.filter((r) => r.is_active).length, [respondents]);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required');
      return;
    }
    setSubmitting(true);
    try {
      const body: CreateRespondentRequest = {
        name: form.name.trim(),
        email: form.email.trim(),
        primary_language: form.primary_language,
      };
      if (form.date_of_birth) body.date_of_birth = form.date_of_birth;
      await createRespondent(body);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add respondent');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (r: Respondent) => {
    setTogglingId(r.id);
    try {
      await setUserActive(r.id, !r.is_active);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setTogglingId(null);
    }
=======
export default function RespondentsPage() {
  const [respondents, setRespondents] = useState<StoredRespondent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', dob: '', consent: 'Granted' as Consent });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdCred, setCreatedCred] = useState<{ id: string; dob: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StoredRespondent | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await getRespondents();
      setRespondents(list);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load respondents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

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
    setForm({ name: '', email: '', dob: '', consent: 'Granted' });
    setError('');
    setCreatedCred(null);
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    const dob = form.dob.trim();
    if (!name || !email || !dob) { setError('Name, email and date of birth are required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) { setError('Date of birth must be in YYYY-MM-DD format'); return; }
    if (respondents.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      setError('A respondent with this email already exists');
      return;
    }
    const nums = respondents.map((r) => parseInt(r.id.replace(/^R-/, ''), 10)).filter((n) => !Number.isNaN(n));
    const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
    const id = `R-${String(nextNum).padStart(3, '0')}`;
    setSaving(true);
    const created = await createRespondent({ id, name, email, dob, consent: form.consent, sessions_count: 0, last_assessment: '—' });
    setSaving(false);
    if (!created) { setError('Failed to save — check that the API is running'); return; }
    await refresh();
    setCreatedCred({ id, dob });
  };

  const confirmDeletion = async () => {
    if (!confirmDelete) return;
    const ok = await deleteRespondent(confirmDelete.id);
    setConfirmDelete(null);
    if (ok) await refresh();
>>>>>>> 8390f94fe2e576279e937e9972afbf6bff638992
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
<<<<<<< HEAD
          <Button
            variant="primary"
            onClick={() => {
              setShowForm((s) => !s);
              setFormError(null);
            }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Respondent'}
=======
          <Button variant="primary" onClick={openModal}>
            <Plus className="h-4 w-4" />
            Add Respondent
>>>>>>> 8390f94fe2e576279e937e9972afbf6bff638992
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running at {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'}?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Respondents</p>
                <p className="text-2xl font-semibold mt-1">{respondents.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{activeCount} active</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-semibold mt-1">{activeCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Currently enabled</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-2xl font-semibold mt-1">{respondents.length - activeCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Suspended accounts</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Respondent</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitForm} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Name</label>
                  <input
                    type="text"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Arjun Patel"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
                  <input
                    type="email"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="arjun@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Primary Language</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                    value={form.primary_language}
                    onChange={(e) => setForm({ ...form, primary_language: e.target.value as LanguageCode })}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Date of Birth <span className="text-muted-foreground/70">(optional)</span>
                  </label>
                  <input
                    type="date"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                    value={form.date_of_birth}
                    onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                  />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Saving...' : 'Add Respondent'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">All Respondents</CardTitle></CardHeader>
        <CardContent className="p-0">
<<<<<<< HEAD
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading respondents...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : respondents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              No respondents yet. Add your first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Language</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">DOB</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
=======
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
                {loading && respondents.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">Loading from database…</td></tr>
                ) : respondents.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">No respondents yet. Click "Add Respondent" to create one.</td></tr>
                ) : respondents.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{r.id}</td>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.email}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.dob || '—'}</td>
                    <td className="px-5 py-3">{r.sessions_count || 0}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${consentColors[r.consent || 'Pending']}`}>
                        {r.consent || 'Pending'}
                      </span>
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
>>>>>>> 8390f94fe2e576279e937e9972afbf6bff638992
                  </tr>
                </thead>
                <tbody>
                  {respondents.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3 font-medium">{r.name}</td>
                      <td className="px-5 py-3 font-mono text-xs">{r.email}</td>
                      <td className="px-5 py-3 uppercase text-xs">{r.primary_language}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{formatDate(r.date_of_birth)}</td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(r)}
                          disabled={togglingId === r.id}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                            r.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}
                        >
                          {togglingId === r.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          {r.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Login ID</span><span className="font-semibold">{createdCred.id}</span></div>
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Password (DOB)</span><span className="font-semibold">{createdCred.dob}</span></div>
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
                    <label className="text-sm font-medium">Date of Birth *</label>
                    <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                    <p className="text-[0.6875rem] text-muted-foreground">Used as the respondent's login password on the portal.</p>
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
