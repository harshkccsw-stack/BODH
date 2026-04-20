'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
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
import { getReports, type ReportListItem, type ReportStatus } from '@/lib/api/reports';

const statusBadgeProps: Record<ReportStatus, { variant: 'success' | 'primary' | 'warning' | 'secondary'; appearance: 'light' }> = {
  FINALIZED: { variant: 'success', appearance: 'light' },
  APPROVED: { variant: 'primary', appearance: 'light' },
  PENDING_REVIEW: { variant: 'secondary', appearance: 'light' },
  DRAFT: { variant: 'warning', appearance: 'light' },
};

const verticalBadgeProps: Record<string, { variant: 'info' | 'secondary' | 'primary'; appearance: 'outline' }> = {
  CLINICAL: { variant: 'info', appearance: 'outline' },
  INDUSTRIAL: { variant: 'secondary', appearance: 'outline' },
  COUNSELLING: { variant: 'primary', appearance: 'outline' },
  EXPERIMENTS: { variant: 'secondary', appearance: 'outline' },
  WHITELABEL: { variant: 'primary', appearance: 'outline' },
};

function shortId(id: string): string {
  if (!id) return '';
  return id.split('-')[0].toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function titleCase(v: string): string {
  if (!v) return '';
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verticalFilter, setVerticalFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getReports();
        if (!cancelled) {
          setReports(res.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load reports');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesSearch =
        searchQuery === '' ||
        report.respondent_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (report.instrument_short ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.instrument_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || report.status === statusFilter;
      const matchesVertical = verticalFilter === 'all' || report.vertical === verticalFilter;
      return matchesSearch && matchesStatus && matchesVertical;
    });
  }, [reports, searchQuery, statusFilter, verticalFilter]);

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
              <Select value={verticalFilter} onValueChange={setVerticalFilter}>
                <SelectTrigger className="w-40" size="md">
                  <Filter className="size-3.5 opacity-60" />
                  <SelectValue placeholder="Vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verticals</SelectItem>
                  <SelectItem value="CLINICAL">Clinical</SelectItem>
                  <SelectItem value="INDUSTRIAL">Industrial</SelectItem>
                  <SelectItem value="COUNSELLING">Counselling</SelectItem>
                  <SelectItem value="EXPERIMENTS">Experiments</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" size="md">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="FINALIZED">Finalized</SelectItem>
                </SelectContent>
              </Select>
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
              {loading
                ? 'Loading...'
                : `Showing ${filteredReports.length} of ${reports.length} reports`}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Report ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">T-Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                      Loading reports...
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-destructive">
                      {error}
                    </td>
                  </tr>
                )}
                {!loading && !error && filteredReports.map((report) => {
                  const vBadge = verticalBadgeProps[report.vertical] ?? { variant: 'secondary' as const, appearance: 'outline' as const };
                  const sBadge = statusBadgeProps[report.status] ?? { variant: 'secondary' as const, appearance: 'light' as const };
                  const tScore = report.scores?.t_score;
                  return (
                    <tr
                      key={report.id}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs">{shortId(report.id)}</td>
                      <td className="px-5 py-3 font-medium">{report.respondent_name}</td>
                      <td className="px-5 py-3">{report.instrument_short ?? report.instrument_name}</td>
                      <td className="px-5 py-3">
                        <Badge size="sm" shape="circle" {...vBadge}>
                          {titleCase(report.vertical)}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge size="sm" shape="circle" {...sBadge}>
                          {titleCase(report.status.replace('_', ' '))}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {typeof tScore === 'number' ? tScore.toFixed(1) : '—'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(report.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            mode="icon"
                            onClick={() => router.push(`/reports/${report.id}`)}
                            aria-label="View report"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && !error && filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                      {reports.length === 0
                        ? 'No reports yet. Complete an assessment session to generate one.'
                        : 'No reports found matching your filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && !error && filteredReports.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing 1-{filteredReports.length} of {reports.length} reports
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" mode="icon" disabled>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="primary" size="sm" className="min-w-7">1</Button>
            <Button variant="outline" size="sm" mode="icon" disabled>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
