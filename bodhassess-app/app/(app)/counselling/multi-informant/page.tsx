'use client';

import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  GitMerge,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ReportStatus = 'Completed' | 'In Progress' | 'Not Started';
type Triangulation = 'Convergent' | 'Divergent' | 'Pending';

interface MultiInformantSession {
  id: string;
  studentName: string;
  instrument: string;
  selfReport: ReportStatus;
  parentReport: ReportStatus;
  teacherReport: ReportStatus;
  triangulation: Triangulation;
}

const sessions: MultiInformantSession[] = [
  { id: 'MI-001', studentName: 'Aarav Mehta', instrument: 'SCAS (Spence Child Anxiety Scale)', selfReport: 'Completed', parentReport: 'Completed', teacherReport: 'Completed', triangulation: 'Convergent' },
  { id: 'MI-002', studentName: 'Ishita Sharma', instrument: 'CDI-2 (Child Depression Inventory)', selfReport: 'Completed', parentReport: 'Completed', teacherReport: 'Completed', triangulation: 'Divergent' },
  { id: 'MI-003', studentName: 'Vihaan Reddy', instrument: 'ADHD Rating Scale-5', selfReport: 'Completed', parentReport: 'In Progress', teacherReport: 'Not Started', triangulation: 'Pending' },
  { id: 'MI-004', studentName: 'Kabir Singh', instrument: 'SCAS (Spence Child Anxiety Scale)', selfReport: 'Completed', parentReport: 'Completed', teacherReport: 'In Progress', triangulation: 'Pending' },
  { id: 'MI-005', studentName: 'Diya Patel', instrument: 'CDI-2 (Child Depression Inventory)', selfReport: 'Completed', parentReport: 'Completed', teacherReport: 'Completed', triangulation: 'Convergent' },
];

const reportStatusStyle = (status: ReportStatus) => {
  switch (status) {
    case 'Completed':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'In Progress':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'Not Started':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400';
  }
};

const triangulationStyle = (t: Triangulation) => {
  switch (t) {
    case 'Convergent':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Divergent':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
};

const reportIcon = (status: ReportStatus) => {
  switch (status) {
    case 'Completed':
      return <CheckCircle2 className="h-3 w-3" />;
    case 'In Progress':
      return <Clock className="h-3 w-3" />;
    case 'Not Started':
      return <AlertTriangle className="h-3 w-3" />;
  }
};

export default function MultiInformantPage() {
  const completedCount = sessions.filter((s) => s.selfReport === 'Completed' && s.parentReport === 'Completed' && s.teacherReport === 'Completed').length;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Counselling &amp; Child</span>
          <span>/</span>
          <span className="text-foreground font-medium">Multi-Informant Sessions</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Multi-Informant Sessions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track sessions where multiple raters (self, parent, teacher) assess the same child for cross-informant triangulation.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Sessions</p>
                <p className="text-2xl font-semibold mt-1">{sessions.length}</p>
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
                <p className="text-sm text-muted-foreground">Fully Completed</p>
                <p className="text-2xl font-semibold mt-1">{completedCount}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Divergent Results</p>
                <p className="text-2xl font-semibold mt-1">{sessions.filter((s) => s.triangulation === 'Divergent').length}</p>
                <p className="text-xs text-muted-foreground mt-1">Needs clinical review</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-500/10">
                <GitMerge className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Multi-Informant Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Student Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Self-Report</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Parent Report</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Teacher Report</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Triangulation</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{session.studentName}</td>
                    <td className="px-5 py-3 text-xs">{session.instrument}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', reportStatusStyle(session.selfReport))}>
                        {reportIcon(session.selfReport)}
                        {session.selfReport}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', reportStatusStyle(session.parentReport))}>
                        {reportIcon(session.parentReport)}
                        {session.parentReport}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', reportStatusStyle(session.teacherReport))}>
                        {reportIcon(session.teacherReport)}
                        {session.teacherReport}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', triangulationStyle(session.triangulation))}>
                        <GitMerge className="h-3 w-3" />
                        {session.triangulation}
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
