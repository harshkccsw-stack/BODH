'use client';

import { FileText, Search, Clock, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const logs = [
  { timestamp: '2026-04-09 11:23:15', user: 'Dr. Meera Krishnan', action: 'View Report', resource: 'SESS-0047 (PHQ-9)', ip: '203.0.113.42', details: 'Viewed T-score report for Arjun Patel' },
  { timestamp: '2026-04-09 10:45:02', user: 'Kavitha Nair', action: 'Create Session', resource: 'SESS-0048', ip: '198.51.100.14', details: 'Created Big Five assessment for batch upload' },
  { timestamp: '2026-04-09 09:30:44', user: 'Dr. Arun Mehta', action: 'Update Tenant', resource: 'Apollo Hospital', ip: '192.0.2.88', details: 'Updated branding colors and logo' },
  { timestamp: '2026-04-09 09:15:10', user: 'System', action: 'Consent Recorded', resource: 'Arjun Patel', ip: '—', details: 'Digital signature consent for PHQ-9 evaluation' },
  { timestamp: '2026-04-08 17:22:33', user: 'Dr. Rajesh Iyer', action: 'Export Data', resource: 'Cohort Report Q1', ip: '203.0.113.55', details: 'Exported CSV with 45 respondent records' },
  { timestamp: '2026-04-08 16:10:05', user: 'Ananya Reddy', action: 'Withdraw Consent', resource: 'Self', ip: '198.51.100.77', details: 'Withdrew consent via Data Principal Portal' },
  { timestamp: '2026-04-08 14:55:21', user: 'System', action: 'Erasure Initiated', resource: 'ERA-002', ip: '—', details: 'Automated erasure pipeline started for Vikram Singh' },
  { timestamp: '2026-04-08 12:00:00', user: 'Dr. Meera Krishnan', action: 'Login', resource: 'Auth', ip: '203.0.113.42', details: 'Keycloak SSO login successful' },
];

const actionColors: Record<string, string> = {
  'View Report': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Create Session': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Update Tenant': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'Consent Recorded': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  'Export Data': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  'Withdraw Consent': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Erasure Initiated': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Login': 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function AuditPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Compliance</span>
          <span>/</span>
          <span className="text-foreground font-medium">Audit Trail</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">Comprehensive log of all platform activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Events</p>
                <p className="text-2xl font-semibold mt-1">8</p>
                <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Latest Event</p>
                <p className="text-2xl font-semibold mt-1">11:23</p>
                <p className="text-xs text-muted-foreground mt-1">View Report by Dr. Meera</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Activity Log</CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8 h-7 text-xs w-48" placeholder="Search logs..." />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-3.5 w-3.5" />
                Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">User</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Resource</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">IP Address</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {log.timestamp}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">{log.user}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3">{log.resource}</td>
                    <td className="px-5 py-3 font-mono text-xs">{log.ip}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs max-w-xs truncate">{log.details}</td>
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
