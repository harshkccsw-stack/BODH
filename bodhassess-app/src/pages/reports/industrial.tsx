import { useEffect, useMemo, useState } from 'react';
import { getSessions, getSessionById, sessionsToReports, downloadJson } from '@/lib/data-store';
import { X } from 'lucide-react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  Search,
  TrendingUp,
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

interface CompetencyScore {
  name: string;
  score: number;
}

interface IndustrialReport {
  id: string;
  sessionId: string;
  respondent: string;
  instrument: string;
  format: ReportFormat;
  status: ReportStatus;
  generatedAt: string;
  roleFitScore: number;
  competencies: CompetencyScore[];
}

const mockReports: IndustrialReport[] = [
  {
    id: 'RPT-0078',
    sessionId: 'SESS-0043',
    respondent: 'Vikram Singh',
    instrument: 'Big Five IPIP-NEO',
    format: 'PDF',
    status: 'Finalized',
    generatedAt: '2026-04-07',
    roleFitScore: 87,
    competencies: [
      { name: 'Openness', score: 82 },
      { name: 'Conscientiousness', score: 91 },
      { name: 'Extraversion', score: 76 },
      { name: 'Agreeableness', score: 88 },
      { name: 'Neuroticism', score: 34 },
    ],
  },
  {
    id: 'RPT-0076',
    sessionId: 'SESS-0039',
    respondent: 'Aditya Joshi',
    instrument: 'Learning Agility Scale',
    format: 'PDF',
    status: 'Finalized',
    generatedAt: '2026-04-05',
    roleFitScore: 72,
    competencies: [
      { name: 'Mental Agility', score: 78 },
      { name: 'People Agility', score: 65 },
      { name: 'Change Agility', score: 80 },
      { name: 'Results Agility', score: 68 },
    ],
  },
  {
    id: 'RPT-0070',
    sessionId: 'SESS-0042',
    respondent: 'Meera Nair',
    instrument: 'HEXACO',
    format: 'Interactive',
    status: 'Approved',
    generatedAt: '2026-04-07',
    roleFitScore: 91,
    competencies: [
      { name: 'Honesty-Humility', score: 94 },
      { name: 'Emotionality', score: 62 },
      { name: 'Extraversion', score: 85 },
      { name: 'Agreeableness', score: 88 },
      { name: 'Conscientiousness', score: 92 },
      { name: 'Openness', score: 79 },
    ],
  },
  {
    id: 'RPT-0069',
    sessionId: 'SESS-0035',
    respondent: 'Suresh Menon',
    instrument: 'Cognitive Ability Battery (CAB)',
    format: 'PDF',
    status: 'Finalized',
    generatedAt: '2026-04-03',
    roleFitScore: 65,
    competencies: [
      { name: 'Verbal Reasoning', score: 72 },
      { name: 'Numerical Reasoning', score: 58 },
      { name: 'Abstract Reasoning', score: 68 },
      { name: 'Spatial Reasoning', score: 61 },
    ],
  },
  {
    id: 'RPT-0068',
    sessionId: 'SESS-0034',
    respondent: 'Deepa Krishnan',
    instrument: 'Situational Judgement Test (SJT)',
    format: 'Interactive',
    status: 'Draft',
    generatedAt: '2026-04-02',
    roleFitScore: 78,
    competencies: [
      { name: 'Leadership', score: 82 },
      { name: 'Teamwork', score: 85 },
      { name: 'Problem Solving', score: 71 },
      { name: 'Communication', score: 74 },
    ],
  },
  {
    id: 'RPT-0067',
    sessionId: 'SESS-0032',
    respondent: 'Ravi Shankar',
    instrument: 'Big Five IPIP-NEO',
    format: 'PDF',
    status: 'Approved',
    generatedAt: '2026-04-01',
    roleFitScore: 54,
    competencies: [
      { name: 'Openness', score: 45 },
      { name: 'Conscientiousness', score: 58 },
      { name: 'Extraversion', score: 42 },
      { name: 'Agreeableness', score: 71 },
      { name: 'Neuroticism', score: 62 },
    ],
  },
  {
    id: 'RPT-0066',
    sessionId: 'SESS-0030',
    respondent: 'Nisha Agarwal',
    instrument: 'Learning Agility Scale',
    format: 'PDF',
    status: 'Finalized',
    generatedAt: '2026-03-31',
    roleFitScore: 83,
    competencies: [
      { name: 'Mental Agility', score: 88 },
      { name: 'People Agility', score: 79 },
      { name: 'Change Agility', score: 85 },
      { name: 'Results Agility', score: 81 },
    ],
  },
  {
    id: 'RPT-0065',
    sessionId: 'SESS-0028',
    respondent: 'Karan Malhotra',
    instrument: 'HEXACO',
    format: 'Interactive',
    status: 'Draft',
    generatedAt: '2026-03-30',
    roleFitScore: 69,
    competencies: [
      { name: 'Honesty-Humility', score: 75 },
      { name: 'Emotionality', score: 55 },
      { name: 'Extraversion', score: 70 },
      { name: 'Agreeableness', score: 68 },
      { name: 'Conscientiousness', score: 72 },
      { name: 'Openness', score: 64 },
    ],
  },
];

const statusBadgeProps: Record<ReportStatus, { variant: 'success' | 'primary' | 'warning'; appearance: 'light' }> = {
  'Finalized': { variant: 'success', appearance: 'light' },
  'Approved': { variant: 'primary', appearance: 'light' },
  'Draft': { variant: 'warning', appearance: 'light' },
};

function RoleFitIndicator({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'text-green-600 dark:text-green-400'
      : score >= 60
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-red-600 dark:text-red-400';
  const bgColor =
    score >= 80
      ? 'bg-green-100 dark:bg-green-900/30'
      : score >= 60
        ? 'bg-yellow-100 dark:bg-yellow-900/30'
        : 'bg-red-100 dark:bg-red-900/30';

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center justify-center h-7 w-12 rounded-md text-xs font-semibold ${color} ${bgColor}`}>
        {score}%
      </div>
    </div>
  );
}

function CompetencyBars({ competencies }: { competencies: CompetencyScore[] }) {
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      {competencies.slice(0, 3).map((c) => (
        <div key={c.name} className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-20 truncate" title={c.name}>
            {c.name}
          </span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                c.score >= 80
                  ? 'bg-green-500'
                  : c.score >= 60
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
              }`}
              style={{ width: `${c.score}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-7 text-right">{c.score}</span>
        </div>
      ))}
      {competencies.length > 3 && (
        <span className="text-[10px] text-muted-foreground">
          +{competencies.length - 3} more
        </span>
      )}
    </div>
  );
}

function deriveRoleFitFromScores(mqt?: Record<string, number>): number {
  if (!mqt) return 70;
  const values = Object.values(mqt);
  if (!values.length) return 70;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  // Scale rough 0-4 Likert totals into a 0-100 fit score; clamp to sane range.
  const scaled = Math.min(100, Math.max(35, Math.round(55 + avg * 8)));
  return scaled;
}

export default function IndustrialReportsPage() {
  const [liveReports, setLiveReports] = useState<IndustrialReport[]>([]);
  const [viewReport, setViewReport] = useState<IndustrialReport | null>(null);

  const handleDownload = (r: IndustrialReport) => {
    const session = getSessionById(r.sessionId);
    downloadJson(`${r.id}-${r.sessionId}.json`, { ...r, session, exportedAt: new Date().toISOString() });
  };

  useEffect(() => {
    const generated = sessionsToReports(getSessions(), { vertical: 'Industrial' }).map((r): IndustrialReport => ({
      id: r.id,
      sessionId: r.sessionId,
      respondent: r.respondent,
      instrument: r.instrument,
      format: r.format as ReportFormat,
      status: r.status as ReportStatus,
      generatedAt: r.generatedAt,
      roleFitScore: deriveRoleFitFromScores(r.mqtScores),
      competencies: r.mqtScores
        ? Object.entries(r.mqtScores).slice(0, 5).map(([name, score]) => ({
            name,
            score: Math.min(100, Math.max(0, Math.round(Number(score) * 10))),
          }))
        : [],
    }));
    setLiveReports(generated);
  }, []);

  const allReports = useMemo(() => {
    const seen = new Set(liveReports.map((r) => r.sessionId));
    const seedTail = mockReports.filter((r) => !seen.has(r.sessionId));
    return [...liveReports, ...seedTail];
  }, [liveReports]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [fitFilter, setFitFilter] = useState('all');

  const filteredReports = allReports.filter((report) => {
    const matchesSearch =
      searchQuery === '' ||
      report.respondent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.instrument.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
    const matchesFormat = formatFilter === 'all' || report.format === formatFilter;
    const matchesFit =
      fitFilter === 'all' ||
      (fitFilter === 'high' && report.roleFitScore >= 80) ||
      (fitFilter === 'medium' && report.roleFitScore >= 60 && report.roleFitScore < 80) ||
      (fitFilter === 'low' && report.roleFitScore < 60);
    return matchesSearch && matchesStatus && matchesFormat && matchesFit;
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
          <span className="text-foreground font-medium">Industrial</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Industrial Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Industrial psychology assessment reports with role fit scores and competency profiles.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Average Role Fit</p>
                <p className="text-2xl font-semibold mt-1">
                  {Math.round(allReports.reduce((a, r) => a + r.roleFitScore, 0) / Math.max(1, allReports.length))}%
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Fit (80%+)</p>
                <p className="text-2xl font-semibold mt-1">
                  {allReports.filter((r) => r.roleFitScore >= 80).length}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Fit (&lt;60%)</p>
                <p className="text-2xl font-semibold mt-1">
                  {allReports.filter((r) => r.roleFitScore < 60).length}
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <TrendingUp className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <InputWrapper variant="md" className="w-full sm:w-72">
              <Search className="size-4" />
              <Input
                placeholder="Search reports, candidates..."
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

              <Select value={fitFilter} onValueChange={setFitFilter}>
                <SelectTrigger className="w-40" size="md">
                  <TrendingUp className="size-3.5 opacity-60" />
                  <SelectValue placeholder="Role Fit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fit Levels</SelectItem>
                  <SelectItem value="high">High (80%+)</SelectItem>
                  <SelectItem value="medium">Medium (60-79%)</SelectItem>
                  <SelectItem value="low">Low (&lt;60%)</SelectItem>
                </SelectContent>
              </Select>

              <Input type="date" variant="md" className="w-40" defaultValue="2026-03-25" />
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
            <CardTitle className="text-base">Industrial Reports</CardTitle>
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
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Assessment ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Candidate</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Role Fit</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Competency Profile</th>
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
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs">{report.id}</td>
                    <td className="px-5 py-3 font-mono text-xs">{report.sessionId}</td>
                    <td className="px-5 py-3 font-medium">{report.respondent}</td>
                    <td className="px-5 py-3">{report.instrument}</td>
                    <td className="px-5 py-3">
                      <RoleFitIndicator score={report.roleFitScore} />
                    </td>
                    <td className="px-5 py-3">
                      <CompetencyBars competencies={report.competencies} />
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
                      No industrial reports found matching your filters.
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
                <div className="flex justify-between"><span className="text-muted-foreground">Role Fit</span><span className="font-semibold text-primary">{viewReport.roleFitScore}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{viewReport.status}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Generated</span><span>{viewReport.generatedAt}</span></div>
              </div>
              {viewReport.competencies.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Competencies</p>
                  <div className="space-y-2">
                    {viewReport.competencies.map((c) => (
                      <div key={c.name} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>{c.name}</span>
                          <span className="font-mono">{c.score}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-1.5 bg-primary rounded-full" style={{ width: `${Math.min(100, c.score)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
