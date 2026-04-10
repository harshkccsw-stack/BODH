'use client';

import { Users, Plus, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const respondents = [
  { name: 'Arjun Patel', email: 'arjun.p@gmail.com', sessions: 8, lastAssessment: 'PHQ-9 (2026-04-07)', consent: 'Granted' },
  { name: 'Priya Sharma', email: 'priya.s@outlook.com', sessions: 3, lastAssessment: 'GAD-7 (2026-04-06)', consent: 'Granted' },
  { name: 'Rahul Verma', email: 'rahul.v@yahoo.com', sessions: 12, lastAssessment: 'DASS-21 (2026-04-05)', consent: 'Granted' },
  { name: 'Ananya Reddy', email: 'ananya.r@gmail.com', sessions: 5, lastAssessment: 'Beck BDI-II (2026-04-04)', consent: 'Withdrawn' },
  { name: 'Vikram Singh', email: 'vikram.s@hotmail.com', sessions: 1, lastAssessment: 'Big Five (2026-04-03)', consent: 'Pending' },
  { name: 'Deepa Menon', email: 'deepa.m@gmail.com', sessions: 6, lastAssessment: 'MMPI-2 (2026-04-02)', consent: 'Granted' },
];

const consentColors: Record<string, string> = {
  Granted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Withdrawn: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const stats = [
  { label: 'Total Respondents', value: '6', icon: Users, change: '5 with consent' },
  { label: 'Sessions Completed', value: '35', icon: ClipboardCheck, change: 'Across all respondents' },
  { label: 'Consent Granted', value: '83%', icon: ShieldCheck, change: '5 of 6 respondents' },
];

export default function RespondentsPage() {
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
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Add Respondent
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
          <CardTitle className="text-base">All Respondents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Sessions</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Assessment</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Consent</th>
                </tr>
              </thead>
              <tbody>
                {respondents.map((r) => (
                  <tr key={r.email} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{r.email}</td>
                    <td className="px-5 py-3">{r.sessions}</td>
                    <td className="px-5 py-3">{r.lastAssessment}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${consentColors[r.consent]}`}>
                        {r.consent}
                      </span>
                    </td>
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
