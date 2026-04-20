'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Plus, Clock, X, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  createPractitioner,
  getPractitioners,
  setUserActive,
  type CreatePractitionerRequest,
  type Practitioner,
  type UserRole,
  type Vertical,
} from '@/lib/api/admin';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'PRACTITIONER', label: 'Practitioner' },
  { value: 'SENIOR_PRACTITIONER', label: 'Senior Practitioner' },
  { value: 'TENANT_ADMIN', label: 'Tenant Admin' },
  { value: 'PLATFORM_ADMIN', label: 'Platform Admin' },
  { value: 'BODHLENS_VIEWER', label: 'BodhLens Viewer' },
];

const VERTICALS: Vertical[] = ['CLINICAL', 'INDUSTRIAL', 'COUNSELLING', 'EXPERIMENTS', 'WHITELABEL'];

const roleColors: Record<string, string> = {
  PRACTITIONER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  SENIOR_PRACTITIONER: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  TENANT_ADMIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  PLATFORM_ADMIN: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  BODHLENS_VIEWER: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

type FormState = {
  name: string;
  email: string;
  role: UserRole;
  verticals: Vertical[];
};

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  role: 'PRACTITIONER',
  verticals: [],
};

export default function PractitionersPage() {
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
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
      const res = await getPractitioners();
      setPractitioners(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load practitioners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(() => practitioners.filter((p) => p.is_active).length, [practitioners]);

  const toggleVertical = (v: Vertical) => {
    setForm((prev) => ({
      ...prev,
      verticals: prev.verticals.includes(v) ? prev.verticals.filter((x) => x !== v) : [...prev.verticals, v],
    }));
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required');
      return;
    }
    setSubmitting(true);
    try {
      const body: CreatePractitionerRequest = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        verticals: form.verticals,
      };
      await createPractitioner(body);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to invite practitioner');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (p: Practitioner) => {
    setTogglingId(p.id);
    try {
      await setUserActive(p.id, !p.is_active);
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
          <span className="text-foreground font-medium">Practitioners</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Practitioners</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage practitioners, clinicians, and HR professionals.</p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setShowForm((s) => !s);
              setFormError(null);
            }}
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Cancel' : 'Invite Practitioner'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Practitioners</p>
                <p className="text-2xl font-semibold mt-1">{practitioners.length}</p>
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
                <p className="text-sm text-muted-foreground">Inactive</p>
                <p className="text-2xl font-semibold mt-1">{practitioners.length - activeCount}</p>
                <p className="text-xs text-muted-foreground mt-1">Suspended or disabled accounts</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Invite Practitioner</CardTitle>
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
                    placeholder="Dr. Meera Krishnan"
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
                    placeholder="name@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Vertical Access</label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {VERTICALS.map((v) => (
                      <label
                        key={v}
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs cursor-pointer select-none ${
                          form.verticals.includes(v)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input bg-background text-foreground'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={form.verticals.includes(v)}
                          onChange={() => toggleVertical(v)}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
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
                  {submitting ? 'Inviting...' : 'Send Invite'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Practitioners</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading practitioners...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : practitioners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              No practitioners yet. Invite your first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Role</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Verticals</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {practitioners.map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-5 py-3 font-mono text-xs">{p.email}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            roleColors[p.role] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}
                        >
                          {p.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {p.verticals.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            p.verticals.map((v) => (
                              <span
                                key={v}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              >
                                {v}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          disabled={togglingId === p.id}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                            p.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}
                        >
                          {togglingId === p.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          {p.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(p.last_login)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">{formatDate(p.created_at)}</td>
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
