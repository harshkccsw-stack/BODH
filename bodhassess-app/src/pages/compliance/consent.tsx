import { ShieldCheck, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const records = [
  { respondent: 'Arjun Patel', type: 'Assessment Data', purpose: 'PHQ-9 Clinical Evaluation', status: 'Active', timestamp: '2026-04-07 09:15', method: 'Digital Signature' },
  { respondent: 'Priya Sharma', type: 'Data Processing', purpose: 'GAD-7 Screening', status: 'Active', timestamp: '2026-04-06 14:30', method: 'OTP Verification' },
  { respondent: 'Rahul Verma', type: 'Data Sharing', purpose: 'Research Study Participation', status: 'Active', timestamp: '2026-04-05 11:00', method: 'Written Consent' },
  { respondent: 'Ananya Reddy', type: 'Assessment Data', purpose: 'Beck BDI-II Evaluation', status: 'Withdrawn', timestamp: '2026-04-04 16:22', method: 'Digital Signature' },
  { respondent: 'Vikram Singh', type: 'Data Processing', purpose: 'Big Five Personality Assessment', status: 'Pending', timestamp: '2026-04-03 10:10', method: 'WhatsApp Consent' },
  { respondent: 'Deepa Menon', type: 'Data Retention', purpose: 'Longitudinal Clinical Study', status: 'Active', timestamp: '2026-04-02 08:45', method: 'Digital Signature' },
];

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Withdrawn: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function ConsentPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Compliance</span>
          <span>/</span>
          <span className="text-foreground font-medium">Consent Records</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Consent Records</h1>
        <p className="text-sm text-muted-foreground mt-1">DPDP Act 2023 compliant consent tracking.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Consents</p>
                <p className="text-2xl font-semibold mt-1">4</p>
                <p className="text-xs text-muted-foreground mt-1">1 withdrawn, 1 pending</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-2xl font-semibold mt-1">Today</p>
                <p className="text-xs text-muted-foreground mt-1">2026-04-07 09:15</p>
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
          <CardTitle className="text-base">All Consent Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Consent Type</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Purpose</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Method</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{r.respondent}</td>
                    <td className="px-5 py-3">{r.type}</td>
                    <td className="px-5 py-3">{r.purpose}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {r.timestamp}
                      </span>
                    </td>
                    <td className="px-5 py-3">{r.method}</td>
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
