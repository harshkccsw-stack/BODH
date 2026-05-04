import { useState } from 'react';
import { Building2, Plus, Users, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Tenant {
  name: string;
  domain: string;
  vertical: string;
  tier: string;
  users: number;
  status: string;
  created: string;
}

const defaultTenants: Tenant[] = [
  { name: "St. Mary's School", domain: 'stmarys.bodhassess.in', vertical: 'Counselling & Child', tier: 'T3', users: 245, status: 'Active', created: '2026-01-10' },
  { name: 'Apollo Hospital', domain: 'apollo.bodhassess.in', vertical: 'Clinical Psychology', tier: 'T5', users: 89, status: 'Active', created: '2025-11-20' },
  { name: 'Infosys L&D', domain: 'infosys.bodhassess.in', vertical: 'Industrial Psychology', tier: 'T4', users: 1204, status: 'Active', created: '2025-09-05' },
  { name: 'MindMetrics Consulting', domain: 'mindmetrics.bodhassess.in', vertical: 'White-Label', tier: 'T2', users: 32, status: 'Suspended', created: '2026-02-14' },
];

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const verticals = ['Clinical Psychology', 'Industrial Psychology', 'Counselling & Child', 'Designing Experiments'];
const tiers = ['T1', 'T2', 'T3', 'T4', 'T5'];

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>(defaultTenants);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    subdomain: '',
    vertical: 'Clinical Psychology',
    tier: 'T1',
    contactEmail: '',
    contactName: '',
  });

  const handleSubmit = () => {
    if (!form.name || !form.subdomain) return;
    const newTenant: Tenant = {
      name: form.name,
      domain: `${form.subdomain}.bodhassess.in`,
      vertical: form.vertical,
      tier: form.tier,
      users: 0,
      status: 'Active',
      created: new Date().toISOString().split('T')[0],
    };
    setTenants([newTenant, ...tenants]);
    setShowForm(false);
    setForm({ name: '', subdomain: '', vertical: 'Clinical Psychology', tier: 'T1', contactEmail: '', contactName: '' });
  };

  const totalUsers = tenants.reduce((sum, t) => sum + t.users, 0);
  const activeCount = tenants.filter((t) => t.status === 'Active').length;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>White-Label</span><span>/</span>
          <span className="text-foreground font-medium">Tenants</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tenant Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage white-label tenant organizations.</p>
          </div>
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add Tenant
          </Button>
        </div>
      </div>

      {/* Add Tenant Form */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Add New Tenant</CardTitle>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Organization Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Delhi Public School"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subdomain *</label>
                <div className="flex">
                  <input
                    type="text"
                    placeholder="dps"
                    value={form.subdomain}
                    onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className="w-full rounded-l-lg border border-r-0 border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <span className="inline-flex items-center rounded-r-lg border border-border bg-muted px-3 text-xs text-muted-foreground">.bodhassess.in</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Underlying Vertical</label>
                <select
                  value={form.vertical}
                  onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {verticals.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Access Tier</label>
                <select
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {tiers.map((t) => <option key={t} value={t}>{t} {t === 'T1' ? '— Run library instruments' : t === 'T2' ? '— Upload your own' : t === 'T3' ? '— Full engine access' : t === 'T4' ? '— Standardisation partnership' : '— Full AI integration'}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contact Name</label>
                <input
                  type="text"
                  placeholder="Dr. Priya Sharma"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Contact Email</label>
                <input
                  type="email"
                  placeholder="admin@school.edu.in"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">What happens next:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>A Keycloak realm will be provisioned for this tenant</li>
                <li>Custom domain <strong>{form.subdomain || 'subdomain'}.bodhassess.in</strong> will be configured</li>
                <li>A mandatory Data Processing Agreement (DPA) will be sent to the contact email</li>
                <li>The tenant becomes the data controller; Bodh is the data processor under DPDP Act 2023</li>
              </ul>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={!form.name || !form.subdomain}
              >
                Create Tenant
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tenants</p>
                <p className="text-2xl font-semibold mt-1">{tenants.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{activeCount} active</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-semibold mt-1">{totalUsers.toLocaleString('en-IN')}</p>
                <p className="text-xs text-muted-foreground mt-1">Across all tenants</p>
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
                <p className="text-sm text-muted-foreground">DPDP Status</p>
                <p className="text-2xl font-semibold mt-1">Compliant</p>
                <p className="text-xs text-muted-foreground mt-1">All DPAs signed</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-500/10">
                <Building2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenants Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Tenants</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Tenant Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Domain</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Tier</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Users</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.domain} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{t.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-primary">{t.domain}</td>
                    <td className="px-5 py-3">{t.vertical}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {t.tier}
                      </span>
                    </td>
                    <td className="px-5 py-3">{t.users.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusColors[t.status])}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{t.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
