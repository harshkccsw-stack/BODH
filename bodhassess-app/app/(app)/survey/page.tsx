import { Plus, FileText, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const surveys = [
  { name: 'Employee Wellbeing Q1', status: 'Active', responses: 234, delivery: ['Email', 'WhatsApp'], language: 'English', created: '2026-03-15' },
  { name: 'Student Mental Health Screening', status: 'Active', responses: 189, delivery: ['WhatsApp'], language: 'Hindi', created: '2026-03-20' },
  { name: 'Patient Satisfaction Survey', status: 'Draft', responses: 0, delivery: ['SMS', 'Email'], language: 'English', created: '2026-04-01' },
  { name: 'Leadership Assessment Feedback', status: 'Completed', responses: 56, delivery: ['Email'], language: 'English', created: '2026-02-10' },
  { name: 'Counselling Intake Form', status: 'Active', responses: 412, delivery: ['WhatsApp', 'SMS'], language: 'Marathi', created: '2026-03-01' },
];

const stats = [
  { label: 'Total Surveys', value: '5', icon: FileText, change: '2 active' },
  { label: 'Total Responses', value: '891', icon: FileText, change: '+47 this week' },
  { label: 'Avg Completion Time', value: '4.2m', icon: Clock, change: '-0.3m from last month' },
];

const deliveryColors: Record<string, string> = {
  WhatsApp: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  SMS: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Email: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Completed: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function SurveyPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span className="text-foreground font-medium">BodhSurvey</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">BodhSurvey</h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage multi-channel surveys.</p>
          </div>
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Create Survey
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
          <CardTitle className="text-base">All Surveys</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Survey Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Responses</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Delivery</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Language</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {surveys.map((s) => (
                  <tr key={s.name} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{s.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s.status]}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">{s.responses}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1.5">
                        {s.delivery.map((d) => (
                          <span key={d} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${deliveryColors[d]}`}>
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">{s.language}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.created}</td>
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
