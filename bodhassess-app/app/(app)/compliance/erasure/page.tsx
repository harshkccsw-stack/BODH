'use client';

import { Trash2, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const requests = [
  { id: 'ERA-001', respondent: 'Ananya Reddy', reason: 'Withdrawal of consent', status: 'Completed', filed: '2026-03-28', completed: '2026-04-02' },
  { id: 'ERA-002', respondent: 'Vikram Singh', reason: 'Data no longer needed', status: 'Processing', filed: '2026-04-05', completed: '—' },
  { id: 'ERA-003', respondent: 'Ravi Kumar', reason: 'Personal request', status: 'Pending', filed: '2026-04-08', completed: '—' },
  { id: 'ERA-004', respondent: 'Sunita Devi', reason: 'Account closure', status: 'Completed', filed: '2026-03-15', completed: '2026-03-20' },
  { id: 'ERA-005', respondent: 'Amit Shah', reason: 'Withdrawal of consent', status: 'Pending', filed: '2026-04-09', completed: '—' },
];

const statusColors: Record<string, string> = {
  Completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Processing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const stats = [
  { label: 'Pending Requests', value: '2', icon: AlertTriangle, change: 'Requires action' },
  { label: 'Processing', value: '1', icon: Clock, change: 'In progress' },
  { label: 'Completed', value: '2', icon: Trash2, change: 'Data erased' },
];

export default function ErasurePage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Compliance</span>
          <span>/</span>
          <span className="text-foreground font-medium">Erasure Requests</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Erasure Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Right to erasure under DPDP Act 2023.</p>
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
          <CardTitle className="text-base">All Erasure Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Request ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Reason</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Filed Date</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Completed Date</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{r.id}</td>
                    <td className="px-5 py-3 font-medium">{r.respondent}</td>
                    <td className="px-5 py-3">{r.reason}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{r.filed}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.completed}</td>
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
