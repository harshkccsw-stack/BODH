'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Hourglass,
  Loader2,
  RefreshCw,
  Search,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { reportApis, type ReportPage } from '../Reports/reportApis';
import {
  liveTrackingApis,
  type LiveTrackingResult,
  type LiveTrackingRow,
  type LiveTrackingState,
} from './liveTrackingApis';

// Live view of every allotment under the chosen filters: who is answering
// right now (heartbeats in Redis), who went quiet, whose submission is staged
// in Redis awaiting the MySQL digest, and whose answers are durably saved.
// Polls /reports/liveTracking every 5s while the tab is visible — the server
// bounds its own MySQL cost behind a short cache, so the poll is cheap by
// design; this page's job is only to not poll a hidden tab.

const POLL_MS = 5000;
const DROPDOWN_PAGE_SIZE = 8;
const LIST_PAGE_SIZES = [10, 25, 50];

/** Debounce a fast-changing value (search inputs) before it hits the API. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// ── Paginated filter dropdown ───────────────────────────────────────────────
// Same control as the Reports Hub's, duplicated deliberately: both pages keep
// their chrome self-contained, and extracting it would touch a page another
// flow may be editing. Nothing selected IS a valid state here — it means
// "all organizations" / "any assessment", and the page polls either way.

interface DropdownItem {
  id: number;
  label: string;
  sub?: string;
}

interface FilterDropdownProps {
  icon: LucideIcon;
  placeholder: string;
  searchPlaceholder: string;
  selected: DropdownItem | null;
  onSelect: (item: DropdownItem | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ReportPage<DropdownItem> | null;
  loading: boolean;
  error: string;
  search: string;
  onSearch: (value: string) => void;
  onPage: (page: number) => void;
}

function FilterDropdown({
  icon: Icon, placeholder, searchPlaceholder, selected, onSelect, open, onOpenChange,
  data, loading, error, search, onSearch, onPage,
}: FilterDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onOpenChange]);

  const pick = (item: DropdownItem | null) => {
    onSelect(item);
    onOpenChange(false);
  };

  return (
    <div className="relative flex-1 min-w-56" ref={containerRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 flex items-center gap-2"
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={cn('flex-1 truncate text-left', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); pick(null); }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-border bg-background shadow-lg">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {selected && (
              <button
                type="button"
                onClick={() => pick(null)}
                className="w-full border-b border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60"
              >
                Clear selection
              </button>
            )}
            {loading && (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            )}
            {!loading && error && (
              <div className="px-3 py-3 text-xs text-red-600 dark:text-red-400">{error}</div>
            )}
            {!loading && !error && data && data.items.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">No matches.</div>
            )}
            {!loading && !error && data?.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm hover:bg-muted/60',
                  selected?.id === item.id && 'bg-primary/5 font-medium text-primary',
                )}
              >
                <span className="block truncate">{item.label}</span>
                {item.sub && <span className="block truncate text-xs text-muted-foreground">{item.sub}</span>}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={!data || data.page === 0 || loading}
              onClick={() => data && onPage(data.page - 1)}
            >
              <ChevronLeft /> Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              {data && data.totalPages > 0 ? `Page ${data.page + 1} of ${data.totalPages}` : 'Page 1'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!data || data.page + 1 >= data.totalPages || loading}
              onClick={() => data && onPage(data.page + 1)}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── State rendering ─────────────────────────────────────────────────────────

const STATE_META: Record<LiveTrackingState, { label: string; badge: string; caption?: string }> = {
  LIVE: {
    label: 'Live',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  NO_SIGNAL: {
    label: 'No signal',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  DISCONNECTED: {
    label: 'Disconnected',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  OFFLINE: {
    label: 'In progress — offline',
    badge: 'bg-muted text-muted-foreground',
  },
  PROCESSING: {
    label: 'Processing',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    caption: 'answers in Redis — saving to database',
  },
  COMPLETED: {
    label: 'Completed',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    caption: 'saved to database',
  },
  NOT_STARTED: {
    label: 'Not started',
    badge: 'bg-muted text-muted-foreground',
  },
};

function relativeFromMillis(millis: number | null): string {
  if (millis == null) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - millis) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function LiveTrackingPage() {
  // ── Organization dropdown state (Reports Hub pattern: the page owns it) ──
  const [selectedOrg, setSelectedOrg] = useState<DropdownItem | null>(null);
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgOpened, setOrgOpened] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgPage, setOrgPage] = useState(0);
  const [orgData, setOrgData] = useState<ReportPage<DropdownItem> | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState('');
  const debouncedOrgSearch = useDebounced(orgSearch, 300);

  // ── Assessment dropdown state ──
  const [selectedAsmt, setSelectedAsmt] = useState<DropdownItem | null>(null);
  const [asmtOpen, setAsmtOpen] = useState(false);
  const [asmtOpened, setAsmtOpened] = useState(false);
  const [asmtSearch, setAsmtSearch] = useState('');
  const [asmtPage, setAsmtPage] = useState(0);
  const [asmtData, setAsmtData] = useState<ReportPage<DropdownItem> | null>(null);
  const [asmtLoading, setAsmtLoading] = useState(false);
  const [asmtError, setAsmtError] = useState('');
  const debouncedAsmtSearch = useDebounced(asmtSearch, 300);

  // ── Tracking data ──
  const [result, setResult] = useState<LiveTrackingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  // Bumps every 1s — re-renders relative timestamps without re-fetching.
  const [, setNowTick] = useState(0);
  const inflight = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const openOrgDropdown = (next: boolean) => { setOrgOpen(next); if (next) setOrgOpened(true); };
  const openAsmtDropdown = (next: boolean) => { setAsmtOpen(next); if (next) setAsmtOpened(true); };

  useEffect(() => {
    if (!orgOpened) return;
    let cancelled = false;
    setOrgLoading(true);
    setOrgError('');
    reportApis
      .getOrganizations({ search: debouncedOrgSearch.trim() || undefined, page: orgPage, size: DROPDOWN_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setOrgData({ ...res.data, items: res.data.items.map((o) => ({ id: o.organizationId, label: o.name })) });
      })
      .catch((e: any) => {
        if (!cancelled) setOrgError(e?.response?.data?.message || e?.message || 'Failed to load organizations');
      })
      .finally(() => { if (!cancelled) setOrgLoading(false); });
    return () => { cancelled = true; };
  }, [orgOpened, debouncedOrgSearch, orgPage]);

  useEffect(() => {
    if (!asmtOpened) return;
    let cancelled = false;
    setAsmtLoading(true);
    setAsmtError('');
    reportApis
      .getAssessments({ search: debouncedAsmtSearch.trim() || undefined, page: asmtPage, size: DROPDOWN_PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setAsmtData({
          ...res.data,
          items: res.data.items.map((a) => ({
            id: a.assessmentId,
            label: a.name,
            sub: a.status === 'ACTIVE' ? 'Active' : 'Inactive',
          })),
        });
      })
      .catch((e: any) => {
        if (!cancelled) setAsmtError(e?.response?.data?.message || e?.message || 'Failed to load assessments');
      })
      .finally(() => { if (!cancelled) setAsmtLoading(false); });
    return () => { cancelled = true; };
  }, [asmtOpened, debouncedAsmtSearch, asmtPage]);

  // ── The poll ──
  // 5s while the tab is visible, paused entirely while hidden (a hidden
  // dashboard asking every 5s would be pure waste), refreshed immediately on
  // return. `inflight` skips a tick rather than piling requests; `cancelled`
  // stops a late response from clobbering fresher state.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const fetchRows = async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        const res = await liveTrackingApis.getLiveTracking({
          organizationId: selectedOrg?.id,
          assessmentId: selectedAsmt?.id,
          page,
          size,
        });
        if (cancelled) return;
        setResult(res.data);
        setError('');
        setLastUpdated(Date.now());
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || 'Failed to load live tracking');
      } finally {
        inflight.current = false;
        if (!cancelled) setLoading(false);
      }
    };
    const stop = () => { if (timer !== null) { window.clearInterval(timer); timer = null; } };
    const start = () => { if (timer === null) timer = window.setInterval(fetchRows, POLL_MS); };
    const onVisibility = () => {
      if (document.hidden) stop();
      else { fetchRows(); start(); }
    };
    setLoading(true);
    fetchRows();
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selectedOrg?.id, selectedAsmt?.id, page, size]);

  const pickOrg = (item: DropdownItem | null) => { setSelectedOrg(item); setPage(0); };
  const pickAsmt = (item: DropdownItem | null) => { setSelectedAsmt(item); setPage(0); };

  const summary = result?.summary;
  const rows: LiveTrackingRow[] = result?.page.items ?? [];
  const totalItems = result?.page.totalItems ?? 0;
  const totalPages = result?.page.totalPages ?? 0;
  const from = totalItems === 0 ? 0 : page * size + 1;
  const to = totalItems === 0 ? 0 : Math.min(totalItems, page * size + rows.length);

  const statCards = [
    { label: 'Total', value: summary?.total, icon: Users, accent: 'bg-primary/10 text-primary' },
    { label: 'Live', value: summary?.live, icon: Activity, accent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    { label: 'No signal', value: summary?.noSignal, icon: Hourglass, accent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Disconnected', value: summary?.disconnected, icon: WifiOff, accent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    { label: 'In progress · offline', value: summary?.offline, icon: Clock, accent: 'bg-muted text-muted-foreground' },
    { label: 'Processing', value: summary?.processing, icon: Loader2, accent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Completed', value: summary?.completed, icon: CheckCircle2, accent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    { label: 'Not started', value: summary?.notStarted, icon: ClipboardCheck, accent: 'bg-muted text-muted-foreground' },
  ];

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span className="text-foreground font-medium">Live Tracking</span>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Live Tracking</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Watch respondents progress through assessments in real time — live position,
              lost signals, submissions being saved, and completed attempts.
            </p>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Updated {relativeFromMillis(lastUpdated)}
            </div>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <FilterDropdown
              icon={Building2}
              placeholder="All organizations"
              searchPlaceholder="Search organizations…"
              selected={selectedOrg}
              onSelect={pickOrg}
              open={orgOpen}
              onOpenChange={openOrgDropdown}
              data={orgData}
              loading={orgLoading}
              error={orgError}
              search={orgSearch}
              onSearch={(v) => { setOrgSearch(v); setOrgPage(0); }}
              onPage={setOrgPage}
            />
            <FilterDropdown
              icon={ClipboardCheck}
              placeholder="Any assessment"
              searchPlaceholder="Search assessments…"
              selected={selectedAsmt}
              onSelect={pickAsmt}
              open={asmtOpen}
              onOpenChange={openAsmtDropdown}
              data={asmtData}
              loading={asmtLoading}
              error={asmtError}
              search={asmtSearch}
              onSearch={(v) => { setAsmtSearch(v); setAsmtPage(0); }}
              onPage={setAsmtPage}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2.5">
            Refreshes every {POLL_MS / 1000}s while this tab is open. Respondents ping every 10s
            from the questions screen — a row shows “No signal” after ~25s of silence and
            “Disconnected” after a minute.
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Whole-filter state totals ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value ?? '—'}</p>
                </div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.accent}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Respondents, most alive first ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Respondents
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            <span className="ml-auto flex items-center gap-2 text-xs font-normal text-muted-foreground">
              Rows per page
              <select
                value={size}
                onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
                className="rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
              >
                {LIST_PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Organization</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Assessment</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Question</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground w-48">Progress</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      {loading ? 'Loading respondents…' : 'No allotted respondents match these filters.'}
                    </td>
                  </tr>
                ) : rows.map((r) => {
                  const meta = STATE_META[r.state] ?? STATE_META.NOT_STARTED;
                  const pct = r.totalQuestions > 0 && r.answeredCount != null
                    ? Math.min(100, Math.round((r.answeredCount / r.totalQuestions) * 100))
                    : null;
                  const qLabel = r.currentQuestion != null && r.totalQuestions > 0
                    ? `Q ${Math.min(r.currentQuestion, r.totalQuestions)} / ${r.totalQuestions}`
                    : r.totalQuestions > 0 ? `— / ${r.totalQuestions}` : '—';
                  return (
                    <tr
                      key={r.respondentAssessmentMappingId}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{r.respondentName}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {r.serialId} · {r.respondentEmail}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {r.organizationName ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-xs">{r.assessmentName}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badge}`}>
                          {r.state === 'LIVE' && (
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                            </span>
                          )}
                          {r.state === 'PROCESSING' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {meta.label}
                        </span>
                        {meta.caption && (
                          <div className="text-[0.6875rem] text-muted-foreground mt-0.5">{meta.caption}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">{qLabel}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                r.state === 'COMPLETED' ? 'bg-blue-500'
                                  : r.state === 'PROCESSING' ? 'bg-amber-500'
                                    : 'bg-primary',
                              )}
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                            {pct == null ? '—' : `${pct}%`}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">
                        {relativeFromMillis(r.lastSeenMillis)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>{totalItems === 0 ? 'No rows' : `Showing ${from}–${to} of ${totalItems}`}</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>
                <ChevronLeft /> Prev
              </Button>
              <span>{totalPages > 0 ? `Page ${page + 1} of ${totalPages}` : 'Page 1'}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage(page + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
