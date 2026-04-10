'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ReportStatus = 'Draft' | 'Approved' | 'Finalized';
type ReportFormat = 'PDF' | 'Interactive';

interface ClinicalReport {
  id: string;
  sessionId: string;
  respondent: string;
  instrument: string;
  format: ReportFormat;
  status: ReportStatus;
  generatedAt: string;
  diagnosticCodes: string[];
  riskFlag: boolean;
  riskNote?: string;
}

const mockReports: ClinicalReport[] = [
  {
    id: 'RPT-0081',
    sessionId: 'SESS-0047',
    respondent: 'Arjun Patel',
    instrument: 'PHQ-9',
    format: 'PDF',
    status: 'Finalized',
    generatedAt: '2026-04-09',
    diagnosticCodes: ['F32.1 (ICD-10)', '296.22 (DSM-5)'],
    riskFlag: true,
    riskNote: 'Item 9 flagged: suicidality ideation',
  },
  {
    id: 'RPT-0080',
    sessionId: 'SESS-0045',
    respondent: 'Rahul Verma',
    instrument: 'DASS-21',
    format: 'Interactive',
    status: 'Approved',
    generatedAt: '2026-04-08',
    diagnosticCodes: ['F41.1 (ICD-10)'],
    riskFlag: false,
  },
  {
    id: 'RPT-0079',
    sessionId: 'SESS-0044',
    respondent: 'Ananya Reddy',
    instrument: 'Beck BDI-II',
    format: 'PDF',
    status: 'Draft',
    generatedAt: '2026-04-08',
    diagnosticCodes: ['F33.0 (ICD-10)', '296.31 (DSM-5)'],
    riskFlag: true,
    riskNote: 'Elevated hopelessness subscale',
  },
  {
    id: 'RPT-0075',
    sessionId: 'SESS-0037',
    respondent: 'Rohan Deshmukh',
    instrument: 'PHQ-9',
    format: 'PDF',
    status: 'Finalized',
    generatedAt: '2026-04-04',
    diagnosticCodes: ['F32.0 (ICD-10)'],
    riskFlag: false,
  },
  {
    id: 'RPT-0074',
    sessionId: 'SESS-0036',
    respondent: 'Divya Menon',
    instrument: 'GAD-7',
    format: 'Interactive',
    status: 'Approved',
    generatedAt: '2026-04-04',
    diagnosticCodes: ['F41.1 (ICD-10)', '300.02 (DSM-5)'],
    riskFlag: false,
  },
  {
    id: 'RPT-0073',
    sessionId: 'SESS-0033',
    respondent: 'Sanjay Kumar',
    instrument: 'PCL-5',
    format: 'PDF',
    status: 'Finalized',
    generatedAt: '2026-04-03',
    diagnosticCodes: ['F43.10 (ICD-10)', '309.81 (DSM-5)'],
    riskFlag: true,
    riskNote: 'PTSD criteria met; hyperarousal cluster elevated',
  },
  {
    id: 'RPT-0072',
    sessionId: 'SESS-0031',
    respondent: 'Lakshmi Rao',
    instrument: 'SCID-5',
    format: 'PDF',
    status: 'Approved',
    generatedAt: '2026-04-02',
    diagnosticCodes: ['F31.1 (ICD-10)', '296.42 (DSM-5)'],
    riskFlag: false,
  },
  {
    id: 'RPT-0071',
    sessionId: 'SESS-0029',
    respondent: 'Amit Desai',
    instrument: 'DASS-21',
    format: 'Interactive',
    status: 'Draft',
    generatedAt: '2026-04-01',
    diagnosticCodes: ['F41.0 (ICD-10)'],
    riskFlag: false,
  },
];

const statusBadgeProps: Record<ReportStatus, { variant: 'success' | 'primary' | 'warning'; appearance: 'light' }> = {
  'Finalized': { variant: 'success', appearance: 'light' },
  'Approved': { variant: 'primary', appearance: 'light' },
  'Draft': { variant: 'warning', appearance: 'light' },
};

export default function ClinicalReportsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');

  const filteredReports = mockReports.filter((report) => {
    const matchesSearch =
      searchQuery === '' ||
      report.respondent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.instrument.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.diagnosticCodes.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
    const matchesFormat = formatFilter === 'all' || report.format === formatFilter;
    const matchesRisk =
      riskFilter === 'all' ||
      (riskFilter === 'flagged' && report.riskFlag) ||
      (riskFilter === 'clear' && !report.riskFlag);
    return matchesSearch && matchesStatus && matchesFormat && matchesRisk;
  });

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <a href="/reports" className="hover:text-foreground transition-colors">Reports</a>
          <span>/</span>
          <span className="text-foreground font-medium">Clinical</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Clinical Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clinical psychology assessment reports with diagnostic codes and risk indicators.
        </p>
      </div>

      {/* Risk Alert Banner */}
      {mockReports.filter((r) => r.riskFlag).length > 0 && (
        <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/40">
                <AlertTriangle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {mockReports.filter((r) => r.riskFlag).length} report(s) flagged for risk indicators
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  Review flagged reports for suicidality and elevated risk markers immediately.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <InputWrapper variant="md" className="w-full sm:w-72">
              <Search className="size-4" />
              <Input
                placeholder="Search reports, codes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </InputWrapper>

            <div className="flex items-center gap-3 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" size="md">
                  <Filter className="size-3.5 opacity-60" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Finalized">Finalized</SelectItem>
                </SelectContent>
              </Select>

              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="w-40" size="md">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Formats</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="Interactive">Interactive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-40" size="md">
                  <AlertTriangle className="size-3.5 opacity-60" />
                  <SelectValue placeholder="Risk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                  <SelectItem value="clear">Clear</SelectItem>
                </SelectContent>
              </Select>

              <Input type="date" variant="md" className="w-40" defaultValue="2026-04-01" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="date" variant="md" className="w-40" defaultValue="2026-04-09" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Clinical Reports</CardTitle>
            <span className="text-sm text-muted-foreground">
              Showing {filteredReports.length} of {mockReports.length} reports
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Report ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Session ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Diagnostic Codes</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Risk</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Format</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Generated</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
                  <tr
                    key={report.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/50 transition-colors ${
                      report.riskFlag ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                    }`}
                  >
                    <td className="px-5 py-3 font-mono text-xs">{report.id}</td>
                    <td className="px-5 py-3 font-mono text-xs">{report.sessionId}</td>
                    <td className="px-5 py-3 font-medium">{report.respondent}</td>
                    <td className="px-5 py-3">{report.instrument}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {report.diagnosticCodes.map((code) => (
                          <Badge key={code} size="sm" shape="circle" variant="secondary" appearance="outline">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {report.riskFlag ? (
                        <div className="flex items-center gap-1.5" title={report.riskNote}>
                          <AlertTriangle className="size-4 text-red-500" />
                          <span className="text-xs text-red-600 dark:text-red-400 font-medium max-w-[120px] truncate">
                            {report.riskNote}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Clear</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        size="sm"
                        shape="circle"
                        variant={report.format === 'PDF' ? 'secondary' : 'info'}
                        appearance="outline"
                      >
                        <FileText className="size-3" />
                        {report.format}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge size="sm" shape="circle" {...statusBadgeProps[report.status]}>
                        {report.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{report.generatedAt}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" mode="icon">
                          <Eye className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" mode="icon">
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-muted-foreground">
                      No clinical reports found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing 1-{filteredReports.length} of {mockReports.length} reports
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" mode="icon" disabled>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="primary" size="sm" className="min-w-7">1</Button>
          <Button variant="outline" size="sm" mode="icon">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
