import { useEffect, useMemo, useState } from 'react';
import { assessmentsApi, readMqtScores, type Assessment } from '@/lib/api';
import { formatDDMMYYYY, formatDDMMYYYYTime } from '@/lib/helpers';
import { X } from 'lucide-react';
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  FlaskConical,
  Heart,
  ListChecks,
  Search,
  Stethoscope,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ReportStatus = 'Draft' | 'Approved' | 'Finalized';
type ReportFormat = 'PDF' | 'Interactive';
// Vertical is open — accepts any string the questionnaire was published with,
// so custom verticals (e.g. "B") show up. The verticalBadgeProps map below
// has a fallback for unknown verticals.
type Vertical = string;

interface Report {
  id: string;
  sessionId: string;
  respondent: string;
  instrument: string;
  vertical: Vertical;
  format: ReportFormat;
  status: ReportStatus;
  generatedAt: string;
}

// Build the vertical label that gets rendered in the table (capitalized).
// Empty/missing → "—" so the row still has something readable.
function verticalLabel(raw?: string): string {
  const v = (raw || '').trim();
  if (!v) return '—';
  const lowered = v.toLowerCase().replace(/_/g, ' ');
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

// Built-in verticals shown in the sidebar. `key` is the value the row uses
// in its `vertical` field (already passed through `verticalLabel`), so the
// keys here are the post-humanization label form.
const builtInVerticals: { key: string; label: string; icon: typeof Stethoscope }[] = [
  { key: 'all', label: 'All', icon: ListChecks },
  { key: 'Clinical', label: 'Clinical', icon: Stethoscope },
  { key: 'Industrial', label: 'Industrial', icon: Briefcase },
  { key: 'Counselling', label: 'Counselling', icon: Heart },
  { key: 'Experimental', label: 'Experimental', icon: FlaskConical },
];

// All reports come from real sessions (via sessionsToReports). No seed data.

const statusBadgeProps: Record<ReportStatus, { variant: 'success' | 'primary' | 'warning'; appearance: 'light' }> = {
  'Finalized': { variant: 'success', appearance: 'light' },
  'Approved': { variant: 'primary', appearance: 'light' },
  'Draft': { variant: 'warning', appearance: 'light' },
};

const verticalBadgeDefaults: { variant: 'info' | 'secondary' | 'primary'; appearance: 'outline' } = {
  variant: 'secondary',
  appearance: 'outline',
};
const verticalBadgeProps: Record<string, { variant: 'info' | 'secondary' | 'primary'; appearance: 'outline' }> = {
  'Clinical': { variant: 'info', appearance: 'outline' },
  'Industrial': { variant: 'secondary', appearance: 'outline' },
  'Counselling': { variant: 'primary', appearance: 'outline' },
};

export default function ReportsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verticalFilter, setVerticalFilter] = useState('all');
  const [formatFilter, setFormatFilter] = useState('all');
  const [liveReports, setLiveReports] = useState<Report[]>([]);
  const [sessionsById, setSessionsById] = useState<Record<string, Assessment>>({});
  const [loadError, setLoadError] = useState('');
  const [viewReport, setViewReport] = useState<Report | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await assessmentsApi.list();
        const completed = list.filter((s) => String(s.status || '').toLowerCase() === 'completed');
        const reports: Report[] = completed.map((s) => ({
          id: `RPT-${s.id}`,
          sessionId: s.id,
          respondent: s.respondent || '—',
          instrument: s.instrumentFullName || s.instrument || '—',
          vertical: verticalLabel(s.vertical),
          // Format is a UI-only concept — every completed session is browsable as Interactive.
          format: 'Interactive',
          // Status starts at Draft — workflow for Approved/Finalized lives elsewhere.
          status: 'Draft',
          generatedAt: formatDDMMYYYY(s.completedAt || s.createdAt),
        }));
        const byId: Record<string, Assessment> = {};
        completed.forEach((s) => { byId[s.id] = s; });
        setLiveReports(reports);
        setSessionsById(byId);
      } catch (e: any) {
        setLoadError(e?.message || 'Failed to load assessments');
      }
    })();
  }, []);

  const allReports = useMemo(() => liveReports, [liveReports]);

  // Sidebar verticals = built-ins + any vertical that actually appears on
  // a loaded report (so e.g. "B" shows up if a session uses that vertical).
  const verticals = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; label: string; icon: typeof Stethoscope }[] = [];
    builtInVerticals.forEach((v) => { seen.add(v.key); out.push(v); });
    allReports.forEach((r) => {
      const key = r.vertical || '—';
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ key, label: key, icon: ListChecks });
    });
    return out;
  }, [allReports]);

  const handleDownload = async (report: Report) => {
    const session = sessionsById[report.sessionId];
    // xlsx is ~430 kB — lazy-load so the reports bundle stays slim.
    const XLSX = await import('xlsx');

    // Sheet 1 — Report summary as key/value rows.
    const summary: Array<[string, string | number]> = [
      ['Report ID', report.id],
      ['Session ID', report.sessionId],
      ['Respondent', report.respondent],
      ['Respondent Email', session?.respondentEmail || ''],
      ['Questionnaire', report.instrument],
      ['Vertical', report.vertical],
      ['Format', report.format],
      ['Status', report.status],
      ['Generated At', report.generatedAt],
      ['Session Status', session?.status || ''],
      ['Created At', formatDDMMYYYYTime(session?.createdAt)],
      ['Completed At', formatDDMMYYYYTime(session?.completedAt)],
      ['Score Summary', session?.score || ''],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...summary]);
    summarySheet['!cols'] = [{ wch: 20 }, { wch: 60 }];

    // Sheet 2 — Per-MQT scores. Tolerant of legacy + new shapes via readMqtScores.
    const mqtRows = readMqtScores(session?.mqtScores);
    const scoresSheet = XLSX.utils.aoa_to_sheet([
      ['MQT ID', 'MQT Name', 'Score'],
      ...mqtRows.map((r) => [r.key, r.name, r.score] as [string, string, number]),
    ]);
    scoresSheet['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 10 }];

    // Sheet 3 — Demographics (if any), key/value.
    const demoEntries = Object.entries(session?.demographics || {});
    const demoSheet = XLSX.utils.aoa_to_sheet([
      ['Field', 'Value'],
      ...demoEntries.map(([k, v]) => [k, String(v ?? '')] as [string, string]),
    ]);
    demoSheet['!cols'] = [{ wch: 20 }, { wch: 40 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Report');
    XLSX.utils.book_append_sheet(wb, scoresSheet, 'MQT Scores');
    if (demoEntries.length > 0) {
      XLSX.utils.book_append_sheet(wb, demoSheet, 'Demographics');
    }

    XLSX.writeFile(wb, `${report.id}-${report.sessionId}.xlsx`);
  };

  const filteredReports = allReports.filter((report) => {
    const matchesSearch =
      searchQuery === '' ||
      report.respondent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.instrument.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
    const matchesVertical = verticalFilter === 'all' || report.vertical === verticalFilter;
    const matchesFormat = formatFilter === 'all' || report.format === formatFilter;
    return matchesSearch && matchesStatus && matchesVertical && matchesFormat;
  });

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span className="text-foreground font-medium">Reports</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View, manage, and download assessment reports across all verticals.
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Vertical sidebar — built-ins + any vertical found on loaded reports */}
        <aside className="lg:w-56 shrink-0">
          <div className="lg:sticky lg:top-4 space-y-1">
            <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground px-2 mb-2">
              Verticals
            </p>
            {verticals.map((v) => {
              const Icon = v.icon;
              const isActive = verticalFilter === v.key;
              const count =
                v.key === 'all'
                  ? allReports.length
                  : allReports.filter((r) => r.vertical === v.key).length;
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVerticalFilter(v.key)}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{v.label}</span>
                  <span
                    className={cn(
                      'inline-flex items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-medium min-w-5',
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 space-y-5 min-w-0">

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <InputWrapper variant="md" className="w-full sm:w-72">
              <Search className="size-4" />
              <Input
                placeholder="Search reports, respondents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </InputWrapper>

            <div className="flex items-center gap-3 flex-wrap">
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

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" size="md">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Finalized">Finalized</SelectItem>
                </SelectContent>
              </Select>

              <Input type="date" variant="md" className="w-40" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="date" variant="md" className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Reports</CardTitle>
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
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical</th>
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
                      <Badge size="sm" shape="circle" {...(verticalBadgeProps[report.vertical] || verticalBadgeDefaults)}>
                        {report.vertical}
                      </Badge>
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
                    <td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">
                      No reports found matching your filters.
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
        </div>{/* /main content */}
      </div>{/* /sidebar+content row */}

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
                <div className="flex justify-between"><span className="text-muted-foreground">Questionnaire</span><span className="text-right max-w-[60%]">{viewReport.instrument}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Vertical</span><span>{viewReport.vertical}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{viewReport.status}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Generated</span><span>{viewReport.generatedAt}</span></div>
              </div>
              {(() => {
                const session = sessionsById[viewReport.sessionId];
                const rows = readMqtScores(session?.mqtScores);
                if (rows.length === 0) {
                  return <p className="text-xs text-muted-foreground">No MQT scores captured for this session.</p>;
                }
                return (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">MQT Scores</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      {rows.map((r, i) => (
                        <div key={r.key} className={`flex justify-between px-3 py-2 text-xs ${i < rows.length - 1 ? 'border-b border-border' : ''}`}>
                          <span>{r.name}</span>
                          <span className="font-mono">{r.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2">
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
