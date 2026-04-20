'use client';

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
          <Button
            variant="primary"
            onClick={() => {
              setShowForm((s) => !s);
              setFormError(null);
            }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Add Respondent'}
          </Button>
        </div>
      </div>

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
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Respondents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
    </div>
  );
}
