import { useState } from 'react';
import {
  Search,
  Plus,
  Users,
  X,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type RiskStatus = 'Low' | 'Moderate' | 'High' | 'Critical';

interface Client {
  id: string;
  name: string;
  dob: string;
  primaryLanguage: string;
  lastAssessment: string;
  activeSessions: number;
  riskStatus: RiskStatus;
}

const clients: Client[] = [];

const riskColors: Record<RiskStatus, { badge: string; variant: 'success' | 'warning' | 'destructive' | 'info' }> = {
  Low: { badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', variant: 'success' },
  Moderate: { badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', variant: 'warning' },
  High: { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', variant: 'warning' },
  Critical: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', variant: 'destructive' },
};

const riskFilters: RiskStatus[] = ['Low', 'Moderate', 'High', 'Critical'];

export default function ClientRecordsPage() {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskStatus | 'All'>('All');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', dob: '', primaryLanguage: 'Hindi' });

  const filtered = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase());
    const matchesRisk = riskFilter === 'All' || c.riskStatus === riskFilter;
    return matchesSearch && matchesRisk;
  });

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Clinical</span>
          <span>/</span>
          <span className="text-foreground font-medium">Client Records</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Client Records</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage client profiles, view assessment history, and monitor risk status.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-2xl font-semibold mt-1">{clients.length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        {(['Critical', 'High', 'Moderate'] as RiskStatus[]).map((status) => (
          <Card key={status}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{status} Risk</p>
                  <p className="text-2xl font-semibold mt-1">
                    {clients.filter((c) => c.riskStatus === status).length}
                  </p>
                </div>
                <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', {
                  'bg-red-100 dark:bg-red-900/30': status === 'Critical',
                  'bg-orange-100 dark:bg-orange-900/30': status === 'High',
                  'bg-yellow-100 dark:bg-yellow-900/30': status === 'Moderate',
                })}>
                  <span className={cn('text-lg font-bold', {
                    'text-red-600 dark:text-red-400': status === 'Critical',
                    'text-orange-600 dark:text-orange-400': status === 'High',
                    'text-yellow-600 dark:text-yellow-400': status === 'Moderate',
                  })}>!</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or client ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={riskFilter === 'All' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setRiskFilter('All')}
          >
            All
          </Button>
          {riskFilters.map((status) => (
            <Button
              key={status}
              variant={riskFilter === status ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setRiskFilter(status)}
            >
              {status}
            </Button>
          ))}
        </div>
        <Button variant="primary" size="md" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddForm ? 'Cancel' : 'Add Client'}
        </Button>
      </div>

      {/* Add Client Form */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add New Client</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Full Name</label>
                <Input
                  placeholder="e.g. Rohan Kapoor"
                  value={newClient.name}
                  onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Date of Birth</label>
                <Input
                  type="date"
                  value={newClient.dob}
                  onChange={(e) => setNewClient({ ...newClient, dob: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Primary Language</label>
                <select
                  className="flex h-8.5 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs"
                  value={newClient.primaryLanguage}
                  onChange={(e) => setNewClient({ ...newClient, primaryLanguage: e.target.value })}
                >
                  <option>Hindi</option>
                  <option>English</option>
                  <option>Telugu</option>
                  <option>Malayalam</option>
                  <option>Tamil</option>
                  <option>Kannada</option>
                  <option>Bengali</option>
                  <option>Marathi</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <Button variant="primary" size="md" onClick={() => setShowAddForm(false)}>
                Save Client
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Client List</CardTitle>
            <span className="text-sm text-muted-foreground">{filtered.length} client{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Client ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date of Birth</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Primary Language</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Assessment</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Active Assessments</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Risk Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr key={client.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{client.id}</td>
                    <td className="px-5 py-3 font-medium">{client.name}</td>
                    <td className="px-5 py-3">{client.dob}</td>
                    <td className="px-5 py-3">{client.primaryLanguage}</td>
                    <td className="px-5 py-3">{client.lastAssessment}</td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {client.activeSessions}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={riskColors[client.riskStatus].variant}
                        appearance="light"
                        size="sm"
                      >
                        {client.riskStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                      No clients found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
