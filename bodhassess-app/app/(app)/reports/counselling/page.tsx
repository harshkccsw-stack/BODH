'use client';

import { useState } from 'react';
import {
  Search,
  FileText,
  Download,
  Clock,
  Users,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type AgeBand = '6-9' | '10-13' | '14-18';
type Informant = 'Self' | 'Parent' | 'Teacher';
type ReportStatus = 'Completed' | 'Pending Review' | 'Draft';

interface CounsellingReport {
  id: string;
  student: string;
  studentId: string;
  ageBand: AgeBand;
  instrument: string;
  informants: Informant[];
  score: string;
  severity: string;
  status: ReportStatus;
  counsellor: string;
  date: string;
}

const reports: CounsellingReport[] = [
  {
    id: 'RPT-C001',
    student: 'Aarav Deshmukh',
    studentId: 'STU-0101',
    ageBand: '10-13',
    instrument: 'SDQ (Strengths & Difficulties)',
    informants: ['Self', 'Parent', 'Teacher'],
    score: 'Total: 22',
    severity: 'Abnormal',
    status: 'Completed',
    counsellor: 'Ms. Sunita Pillai',
    date: '2026-04-09',
  },
  {
    id: 'RPT-C002',
    student: 'Ishita Banerjee',
    studentId: 'STU-0102',
    ageBand: '14-18',
    instrument: 'PHQ-A (Adolescent)',
    informants: ['Self'],
    score: 'Total: 14',
    severity: 'Moderate',
    status: 'Completed',
    counsellor: 'Dr. Ramesh Tiwari',
    date: '2026-04-08',
  },
  {
    id: 'RPT-C003',
    student: 'Kabir Malhotra',
    studentId: 'STU-0103',
    ageBand: '6-9',
    instrument: 'CBCL (Child Behavior Checklist)',
    informants: ['Parent', 'Teacher'],
    score: 'T=68',
    severity: 'Borderline Clinical',
    status: 'Pending Review',
    counsellor: 'Ms. Sunita Pillai',
    date: '2026-04-08',
  },
  {
    id: 'RPT-C004',
    student: 'Myra Choudhary',
    studentId: 'STU-0104',
    ageBand: '14-18',
    instrument: 'RCADS (Revised Child Anxiety)',
    informants: ['Self', 'Parent'],
    score: 'T=72',
    severity: 'Clinical',
    status: 'Completed',
    counsellor: 'Dr. Ramesh Tiwari',
    date: '2026-04-07',
  },
  {
    id: 'RPT-C005',
    student: 'Reyansh Saxena',
    studentId: 'STU-0105',
    ageBand: '10-13',
    instrument: 'SDQ (Strengths & Difficulties)',
    informants: ['Self', 'Teacher'],
    score: 'Total: 16',
    severity: 'Borderline',
    status: 'Draft',
    counsellor: 'Ms. Sunita Pillai',
    date: '2026-04-07',
  },
  {
    id: 'RPT-C006',
    student: 'Anvi Patil',
    studentId: 'STU-0106',
    ageBand: '6-9',
    instrument: 'Conners 3 (ADHD)',
    informants: ['Parent', 'Teacher'],
    score: 'T=75',
    severity: 'Very Elevated',
    status: 'Completed',
    counsellor: 'Dr. Ramesh Tiwari',
    date: '2026-04-06',
  },
  {
    id: 'RPT-C007',
    student: 'Vivaan Nambiar',
    studentId: 'STU-0107',
    ageBand: '14-18',
    instrument: 'PHQ-A (Adolescent)',
    informants: ['Self'],
    score: 'Total: 8',
    severity: 'Mild',
    status: 'Completed',
    counsellor: 'Ms. Sunita Pillai',
    date: '2026-04-05',
  },
  {
    id: 'RPT-C008',
    student: 'Saanvi Hegde',
    studentId: 'STU-0108',
    ageBand: '10-13',
    instrument: 'RCADS (Revised Child Anxiety)',
    informants: ['Self', 'Parent', 'Teacher'],
    score: 'T=65',
    severity: 'Borderline Clinical',
    status: 'Pending Review',
    counsellor: 'Dr. Ramesh Tiwari',
    date: '2026-04-04',
  },
];

const ageBands: AgeBand[] = ['6-9', '10-13', '14-18'];

const statusColor = (status: ReportStatus) => {
  switch (status) {
    case 'Completed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Pending Review': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'Draft': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
};

const severityVariant = (severity: string) => {
  if (severity.includes('Clinical') || severity === 'Abnormal' || severity.includes('Very')) return 'destructive';
  if (severity === 'Moderate' || severity === 'Borderline') return 'warning';
  if (severity === 'Mild') return 'success';
  return 'secondary';
};

const informantColor = (informant: Informant) => {
  switch (informant) {
    case 'Self': return 'primary';
    case 'Parent': return 'info';
    case 'Teacher': return 'warning';
  }
};

export default function CounsellingReportsPage() {
  const [search, setSearch] = useState('');
  const [ageBandFilter, setAgeBandFilter] = useState<AgeBand | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'All'>('All');

  const filtered = reports.filter((r) => {
    const matchesSearch =
      r.student.toLowerCase().includes(search.toLowerCase()) ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.instrument.toLowerCase().includes(search.toLowerCase());
    const matchesAge = ageBandFilter === 'All' || r.ageBand === ageBandFilter;
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchesSearch && matchesAge && matchesStatus;
  });

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Reports</span>
          <span>/</span>
          <span className="text-foreground font-medium">Counselling</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Counselling Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Assessment reports for the Counselling & Child vertical with multi-informant tracking.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reports</p>
                <p className="text-2xl font-semibold mt-1">{reports.length}</p>
                <p className="text-xs text-muted-foreground mt-1">This week</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        {ageBands.map((band) => (
          <Card key={band}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Age {band}</p>
                  <p className="text-2xl font-semibold mt-1">{reports.filter((r) => r.ageBand === band).length}</p>
                  <p className="text-xs text-muted-foreground mt-1">students</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by student, report ID, or instrument..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Age Band:</span>
          <Button variant={ageBandFilter === 'All' ? 'primary' : 'outline'} size="sm" onClick={() => setAgeBandFilter('All')}>All</Button>
          {ageBands.map((band) => (
            <Button key={band} variant={ageBandFilter === band ? 'primary' : 'outline'} size="sm" onClick={() => setAgeBandFilter(band)}>{band}</Button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          <Button variant={statusFilter === 'All' ? 'primary' : 'outline'} size="sm" onClick={() => setStatusFilter('All')}>All</Button>
          {(['Completed', 'Pending Review', 'Draft'] as ReportStatus[]).map((s) => (
            <Button key={s} variant={statusFilter === s ? 'primary' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>{s}</Button>
          ))}
        </div>
      </div>

      {/* Reports Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Counselling Reports</CardTitle>
            <span className="text-sm text-muted-foreground">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Report ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Student</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Age Band</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Informants</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Severity</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((report) => (
                  <tr key={report.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{report.id}</td>
                    <td className="px-5 py-3">
                      <div>
                        <p className="font-medium">{report.student}</p>
                        <p className="text-xs text-muted-foreground">{report.studentId} &middot; {report.counsellor}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant="secondary" appearance="outline" size="sm">{report.ageBand}</Badge>
                    </td>
                    <td className="px-5 py-3">{report.instrument}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {report.informants.map((inf) => (
                          <Badge
                            key={inf}
                            variant={informantColor(inf)}
                            appearance="light"
                            size="xs"
                          >
                            {inf}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{report.score}</td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={severityVariant(report.severity) as any}
                        appearance="light"
                        size="sm"
                      >
                        {report.severity}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        statusColor(report.status)
                      )}>
                        {report.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {report.date}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {report.status === 'Completed' && (
                        <Button variant="ghost" size="sm">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-8 text-center text-muted-foreground">
                      No reports found matching your criteria.
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
