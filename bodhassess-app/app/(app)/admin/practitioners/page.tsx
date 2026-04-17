'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Clock, X, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getPractitioners, savePractitioners, type StoredPractitioner } from '@/lib/data-store';

const seedPractitioners: StoredPractitioner[] = [
  { id: 'P-001', name: 'Dr. Meera Krishnan', email: 'meera.k@apollo.in', role: 'Senior Practitioner', verticals: ['Clinical', 'Counselling'], status: 'Active', lastLogin: '2026-04-09 09:15' },
  { id: 'P-002', name: 'Dr. Rajesh Iyer', email: 'rajesh.i@stmarys.edu', role: 'Practitioner', verticals: ['Counselling'], status: 'Active', lastLogin: '2026-04-08 14:30' },
  { id: 'P-003', name: 'Kavitha Nair', email: 'kavitha.n@infosys.com', role: 'HR Professional', verticals: ['Industrial'], status: 'Active', lastLogin: '2026-04-09 11:00' },
  { id: 'P-004', name: 'Dr. Arun Mehta', email: 'arun.m@mindmetrics.in', role: 'Platform Admin', verticals: ['Clinical', 'Industrial', 'Counselling'], status: 'Active', lastLogin: '2026-04-09 08:45' },
  { id: 'P-005', name: 'Sneha Gupta', email: 'sneha.g@apollo.in', role: 'Practitioner', verticals: ['Clinical'], status: 'Inactive', lastLogin: '2026-03-20 16:22' },
  { id: 'P-006', name: 'Prof. Venkat Rao', email: 'venkat.r@university.edu', role: 'Researcher', verticals: ['Experiments'], status: 'Active', lastLogin: '2026-04-07 10:10' },
];

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

const ROLES = ['Practitioner', 'Senior Practitioner', 'HR Professional', 'Researcher', 'Platform Admin'];
const VERTICALS = ['Clinical', 'Industrial', 'Counselling', 'Experiments', 'White-Label'];

export default function PractitionersPage() {
  const [practitioners, setPractitioners] = useState<StoredPractitioner[]>(seedPractitioners);
  const [hydrated, setHydrated] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'Practitioner', verticals: [] as string[], status: 'Active' as 'Active' | 'Inactive' });
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<StoredPractitioner | null>(null);

  useEffect(() => {
    const stored = getPractitioners();
    if (stored.length > 0) setPractitioners(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePractitioners(practitioners);
  }, [practitioners, hydrated]);

  const stats = useMemo(() => {
    const active = practitioners.filter((p) => p.status === 'Active').length;
    return {
      total: practitioners.length,
      active,
      lastLogin: practitioners.length > 0 ? practitioners[0].lastLogin : '—',
    };
  }, [practitioners]);

  const openModal = () => {
    setForm({ name: '', email: '', role: 'Practitioner', verticals: [], status: 'Active' });
    setError('');
    setModalOpen(true);
  };

  const toggleVertical = (v: string) => {
    setForm((f) => ({ ...f, verticals: f.verticals.includes(v) ? f.verticals.filter((x) => x !== v) : [...f.verticals, v] }));
  };

  const submit = () => {
    const name = form.name.trim();
    const email = form.email.trim();
    if (!name || !email) { setError('Name and email are required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    if (form.verticals.length === 0) { setError('Assign at least one vertical'); return; }
    if (practitioners.some((p) => p.email.toLowerCase() === email.toLowerCase())) { setError('A practitioner with this email already exists'); return; }
    const nums = practitioners.map((p) => parseInt(p.id.replace(/^P-/, ''), 10)).filter((n) => !Number.isNaN(n));
    const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
    const id = `P-${String(nextNum).padStart(3, '0')}`;
    const today = new Date().toISOString().slice(0, 16).replace('T', ' ');
    setPractitioners([
      { id, name, email, role: form.role, verticals: form.verticals, status: form.status, lastLogin: today },
      ...practitioners,
    ]);
    setModalOpen(false);
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    setPractitioners(practitioners.filter((p) => p.id !== confirmDelete.id));
    setConfirmDelete(null);
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span><span className="text-foreground font-medium">Practitioners</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Practitioners</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage practitioners, clinicians, and HR professionals.</p>
          </div>
          <Button variant="primary" onClick={openModal}>
            <Plus className="h-4 w-4" />
            Add Practitioner
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Practitioners</p>
                <p className="text-2xl font-semibold mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.active} active</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Most Recent Login</p>
                <p className="text-2xl font-semibold mt-1 truncate">{stats.lastLogin}</p>
                <p className="text-xs text-muted-foreground mt-1">{practitioners[0]?.name || '—'}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10"><Clock className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">All Practitioners</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical Access</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {practitioners.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{p.id}</td>
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.email}</td>
                    <td className="px-5 py-3">{p.role}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {p.verticals.map((v) => (
                          <span key={v} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{v}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>{p.status}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{p.lastLogin}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setConfirmDelete(p)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Add Practitioner</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</div>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Dr. Meera Krishnan"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="practitioner@example.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Vertical Access</label>
                <div className="flex flex-wrap gap-2">
                  {VERTICALS.map((v) => (
                    <button key={v} type="button" onClick={() => toggleVertical(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.verticals.includes(v) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submit}>Add Practitioner</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Delete Practitioner</CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">Remove <strong>{confirmDelete.name}</strong> ({confirmDelete.id})?</p>
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
