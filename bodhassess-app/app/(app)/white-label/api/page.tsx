'use client';

import { Key, Plus, Activity, Clock, Shield, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const apiKeys = [
  { name: 'Production Key', key: 'bodh_live_****************************3kf9', created: '2026-01-15', lastUsed: '2026-04-09', status: 'Active' },
  { name: 'Staging Key', key: 'bodh_test_****************************7xm2', created: '2026-02-20', lastUsed: '2026-04-08', status: 'Active' },
  { name: 'Legacy Integration', key: 'bodh_live_****************************1abc', created: '2025-06-10', lastUsed: '2026-03-01', status: 'Revoked' },
];

const stats = [
  { label: 'Requests Today', value: '2,847', icon: Activity, change: '+12% from yesterday' },
  { label: 'Proctoring Sessions', value: '156', icon: Shield, change: '23 active now' },
  { label: 'Avg Response Time', value: '142ms', icon: Clock, change: '-8ms from last week' },
];

const endpoints = [
  { method: 'POST', path: '/api/v1/proctoring/sessions', description: 'Create a new proctoring session with trust scoring' },
  { method: 'GET', path: '/api/v1/proctoring/trust-report', description: 'Retrieve trust score report for a session' },
  { method: 'POST', path: '/api/v1/assessments/deliver', description: 'Deliver an assessment via WhatsApp/SMS/Email' },
  { method: 'GET', path: '/api/v1/assessments/:id/results', description: 'Get assessment results with T-scores' },
];

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Revoked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function ApiPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>White-Label</span>
          <span>/</span>
          <span className="text-foreground font-medium">BPaaS API</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">BPaaS API Keys</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage API keys for platform integrations.</p>
          </div>
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Generate New Key
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
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Key</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Used</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((k) => (
                  <tr key={k.name} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{k.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{k.key}</td>
                    <td className="px-5 py-3 text-muted-foreground">{k.created}</td>
                    <td className="px-5 py-3 text-muted-foreground">{k.lastUsed}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[k.status]}`}>
                        {k.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Button variant="ghost" size="sm">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Endpoint Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {endpoints.map((ep) => (
            <div key={ep.path} className="flex items-start gap-3 p-3 rounded-lg border border-border">
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-bold ${
                ep.method === 'POST' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {ep.method}
              </span>
              <div>
                <p className="font-mono text-sm">{ep.path}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ep.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
