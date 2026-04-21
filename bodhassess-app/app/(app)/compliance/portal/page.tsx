'use client';

import { Eye, Download, Trash2, ShieldOff, User, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const actions = [
  {
    title: 'View My Data',
    description: 'See all personal data we hold about you, including assessment results, consent records, and session history.',
    icon: Eye,
    buttonLabel: 'View Data',
    buttonVariant: 'outline' as const,
  },
  {
    title: 'Download My Data',
    description: 'Export a complete copy of your data in a portable format (JSON/CSV) as per your right to data portability.',
    icon: Download,
    buttonLabel: 'Download',
    buttonVariant: 'outline' as const,
  },
  {
    title: 'Request Erasure',
    description: 'Submit a request to permanently delete all your personal data from our systems under the DPDP Act 2023.',
    icon: Trash2,
    buttonLabel: 'Request Erasure',
    buttonVariant: 'destructive' as const,
  },
  {
    title: 'Withdraw Consent',
    description: 'Revoke previously granted consent for data processing. This will stop future assessments but not affect past records.',
    icon: ShieldOff,
    buttonLabel: 'Withdraw Consent',
    buttonVariant: 'outline' as const,
  },
];

export default function PortalPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Compliance</span>
          <span>/</span>
          <span className="text-foreground font-medium">Data Principal Portal</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Data Principal Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">Exercise your data rights under the DPDP Act 2023.</p>
      </div>

      {/* Profile Summary */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold">Arjun Patel</p>
              <p className="text-sm text-muted-foreground">arjun.p@gmail.com</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <ShieldCheck className="h-3 w-3" />
                  Consent Active
                </span>
                <span className="text-xs text-muted-foreground">8 sessions completed</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {actions.map((action) => (
          <Card key={action.title} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{action.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.description}</p>
                  <Button variant={action.buttonVariant} size="sm" className="mt-3">
                    {action.buttonLabel}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground">2026-04-07</td>
                  <td className="px-5 py-3">Consent Granted</td>
                  <td className="px-5 py-3 text-muted-foreground">PHQ-9 Clinical Evaluation</td>
                </tr>
                <tr className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground">2026-04-05</td>
                  <td className="px-5 py-3">Data Downloaded</td>
                  <td className="px-5 py-3 text-muted-foreground">Full data export (JSON)</td>
                </tr>
                <tr className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-5 py-3 text-muted-foreground">2026-04-01</td>
                  <td className="px-5 py-3">Assessment Completed</td>
                  <td className="px-5 py-3 text-muted-foreground">DASS-21 Assessment SESS-0039</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
