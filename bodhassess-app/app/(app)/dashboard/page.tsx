'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  Clock,
  Database,
  FileText,
  Server,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getHealth, type HealthStatus } from '@/lib/api';

const verticalLabels: Record<string, string> = {
  clinical: 'Clinical Psychology',
  industrial: 'Industrial Psychology',
  counselling: 'Counselling & Child',
  experiments: 'Designing Experiments',
  whitelabel: 'White-Label',
};

const verticalTerminology: Record<string, { respondent: string; practitioner: string }> = {
  clinical: { respondent: 'Clients', practitioner: 'Clinicians' },
  industrial: { respondent: 'Candidates', practitioner: 'HR Professionals' },
  counselling: { respondent: 'Students', practitioner: 'Counsellors' },
  experiments: { respondent: 'Participants', practitioner: 'Researchers' },
  whitelabel: { respondent: 'Users', practitioner: 'Administrators' },
};

const stats = [
  { label: 'Active Sessions', value: '47', icon: Activity, change: '+12 this week' },
  { label: 'Completed Today', value: '23', icon: ClipboardCheck, change: '+5 from yesterday' },
  { label: 'Pending Reports', value: '8', icon: FileText, change: '3 high priority' },
  { label: 'Risk Alerts', value: '2', icon: AlertTriangle, change: 'PHQ-9 Item 9 flagged' },
];

const recentSessions = [
  { id: 'SESS-0047', respondent: 'Arjun Patel', instrument: 'PHQ-9', status: 'Completed', score: 'T=62', time: '12 min ago' },
  { id: 'SESS-0046', respondent: 'Priya Sharma', instrument: 'GAD-7', status: 'In Progress', score: '—', time: '18 min ago' },
  { id: 'SESS-0045', respondent: 'Rahul Verma', instrument: 'DASS-21', status: 'Completed', score: 'T=55', time: '1 hr ago' },
  { id: 'SESS-0044', respondent: 'Ananya Reddy', instrument: 'Beck BDI-II', status: 'Pending Review', score: 'T=71', time: '2 hr ago' },
  { id: 'SESS-0043', respondent: 'Vikram Singh', instrument: 'Big Five (IPIP-NEO)', status: 'Completed', score: 'Profile Ready', time: '3 hr ago' },
];

function DashboardContent() {
  const searchParams = useSearchParams();
  const vertical = searchParams.get('vertical') || 'clinical';
  const label = verticalLabels[vertical] || 'Clinical Psychology';
  const terms = verticalTerminology[vertical] || verticalTerminology.clinical;
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* API Status Banner */}
      {health && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3">
          <Server className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700 dark:text-green-400">
            <strong>API Connected</strong> — {health.service} {health.version}
          </span>
          <span className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1 ml-auto">
            <Database className="h-3 w-3" /> PostgreSQL {health.database ? 'healthy' : 'down'}
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse ml-1" />
          </span>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span className="text-foreground font-medium">{label}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of assessment sessions, reports, and {terms.respondent.toLowerCase()} activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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

      {/* Recent Sessions Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Sessions</CardTitle>
            <a href="/sessions" className="text-sm text-primary hover:underline">View all</a>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Session ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">{terms.respondent.slice(0, -1)}</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((session) => (
                  <tr key={session.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{session.id}</td>
                    <td className="px-5 py-3 font-medium">{session.respondent}</td>
                    <td className="px-5 py-3">{session.instrument}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        session.status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        session.status === 'In Progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{session.score}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.time}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Create Session</p>
              <p className="text-xs text-muted-foreground">Start a new assessment</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Batch Upload</p>
              <p className="text-xs text-muted-foreground">Upload CSV for cohort</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">BodhLens</p>
              <p className="text-xs text-muted-foreground">Ask a question in plain English</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-5 lg:p-7.5">Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
