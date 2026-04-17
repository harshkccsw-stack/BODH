'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSessions, getSessionById, sessionsToReports, downloadJson } from '@/lib/data-store';
import { X } from 'lucide-react';
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
  const [liveReports, setLiveReports] = useState<ClinicalReport[]>([]);
  const [viewReport, setViewReport] = useState<ClinicalReport | null>(null);

  const handleDownload = (r: ClinicalReport) => {
    const session = getSessionById(r.sessionId);
    downloadJson(`${r.id}-${r.sessionId}.json`, { ...r, session, exportedAt: new Date().toISOString() });
  };

  useEffect(() => {
    const generated = sessionsToReports(getSessions(), { vertical: 'Clinical' }).map((r): ClinicalReport => ({
      id: r.id,
      sessionId: r.sessionId,
      respondent: r.respondent,
      instrument: r.instrument,
      format: r.format as ReportFormat,
      status: r.status as ReportStatus,
      generatedAt: r.generatedAt,
      diagnosticCodes: r.diagnosticCodes,
      riskFlag: r.riskFlag,
      riskNote: r.riskNote,
    }));
    setLiveReports(generated);
  }, []);

  const allReports = useMemo(() => {
    const seen = new Set(liveReports.map((r) => r.sessionId));
    const seedTail = mockReports.filter((r) => !seen.has(r.sessionId));
    return [...liveReports, ...seedTail];
  }, [liveReports]);

  const filteredReports = allReports.filter((report) => {
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
                  {allReports.filter((r) => r.riskFlag).length} report(s) flagged for risk indicators
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
              Showing {filteredReports.length} of {allReports.length} reports
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
                        <Button variant="ghost" size="sm" mode="icon" aria-label="View report" onClick={() => setViewReport(report)}>
                          <Eye className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" mode="icon" aria-label="Download report" onClick={() => handleDownload(report)}>
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
          Showing 1-{filteredReports.length} of {allReports.length} reports
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

      {viewReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setViewReport(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {viewReport.id}
              </CardTitle>
              <button onClick={() => setViewReport(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">Session</span><span className="font-mono text-xs">{viewReport.sessionId}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Respondent</span><span className="font-medium">{viewReport.respondent}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Instrument</span><span className="text-right max-w-[60%]">{viewReport.instrument}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{viewReport.status}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Generated</span><span>{viewReport.generatedAt}</span></div>
              </div>
              {viewReport.riskFlag && viewReport.riskNote && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{viewReport.riskNote}</span>
                </div>
              )}
              {viewReport.diagnosticCodes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Diagnostic Codes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {viewReport.diagnosticCodes.map((c) => (
                      <Badge key={c} size="sm" shape="circle" variant="secondary" appearance="outline">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const session = getSessionById(viewReport.sessionId);
                if (!session?.mqtScores || Object.keys(session.mqtScores).length === 0) return null;
                return (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">MQT Scores</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      {Object.entries(session.mqtScores).map(([k, v], i, arr) => (
                        <div key={k} className={`flex justify-between px-3 py-2 text-xs ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                          <span>{k}</span>
                          <span className="font-mono">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setViewReport(null)}>Close</Button>
                <Button variant="primary" onClick={() => handleDownload(viewReport)}><Download className="h-4 w-4" />Download</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
