import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileBarChart2,
  Info,
  Loader2,
  Mail,
  Phone,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reportApis,
  type AttemptStatus,
  type ReportPage,
  type RespondentAssessmentRow,
  type RespondentDetail,
  type RespondentRow,
} from './reportApis';

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
// One reusable control for both filters: a trigger button showing the current
// selection (a placeholder when none), opening a panel with its own search
// box, a paged option list fed by the server, and prev/next paging in the
// footer. `open` is controlled by the page, which is what lets it hold the
// options query back until the dropdown is actually opened — landing on the
// page fires no dropdown request at all.

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
            {/* Only offered once something is picked — nothing selected is
                already the unfiltered state. */}
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

// ── Attempt status ──────────────────────────────────────────────────────────

const ATTEMPT_LABEL: Record<AttemptStatus, string> = {
  NOT_STARTED: 'Not started',
  ONGOING: 'In progress',
  COMPLETED: 'Completed',
};

const ATTEMPT_STYLE: Record<AttemptStatus, string> = {
  NOT_STARTED: 'border-border bg-muted/40 text-muted-foreground',
  ONGOING: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
  COMPLETED: 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400',
};

/** Untouched allotment — a reset would have nothing to wipe. */
function isUntouched(row: RespondentAssessmentRow) {
  return row.attemptStatus === 'NOT_STARTED'
    && row.answeredQuestions === 0
    && row.demographicResponses === 0;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ReportsHubPage() {
  // Organization dropdown state. Both filters start unselected and unloaded:
  // `opened` flips on the first open and is what unblocks the options query,
  // so landing on the page costs one request (the listing) instead of three.
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgOpened, setOrgOpened] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgPage, setOrgPage] = useState(0);
  const [orgData, setOrgData] = useState<ReportPage<DropdownItem> | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<DropdownItem | null>(null);
  const debouncedOrgSearch = useDebounced(orgSearch, 300);

  // Assessment dropdown state.
  const [asmtOpen, setAsmtOpen] = useState(false);
  const [asmtOpened, setAsmtOpened] = useState(false);
  const [asmtSearch, setAsmtSearch] = useState('');
  const [asmtPage, setAsmtPage] = useState(0);
  const [asmtData, setAsmtData] = useState<ReportPage<DropdownItem> | null>(null);
  const [asmtLoading, setAsmtLoading] = useState(false);
  const [asmtError, setAsmtError] = useState('');
  const [selectedAsmt, setSelectedAsmt] = useState<DropdownItem | null>(null);
  const debouncedAsmtSearch = useDebounced(asmtSearch, 300);

  // Respondent listing state.
  const [respSearch, setRespSearch] = useState('');
  const [respPage, setRespPage] = useState(0);
  const [respSize, setRespSize] = useState(LIST_PAGE_SIZES[0]);
  const [respData, setRespData] = useState<ReportPage<RespondentRow> | null>(null);
  const [respLoading, setRespLoading] = useState(true);
  const [respError, setRespError] = useState('');
  const debouncedRespSearch = useDebounced(respSearch, 350);
  // Bumped after a reset so the listing's tallies re-read.
  const [respReload, setRespReload] = useState(0);

  // Info popup state — the row it was opened from, its detail payload, and
  // the reset confirmation layered on top.
  const [detailFor, setDetailFor] = useState<RespondentRow | null>(null);
  const [detail, setDetail] = useState<RespondentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [confirmReset, setConfirmReset] = useState<RespondentAssessmentRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  // Opening a dropdown for the first time is what loads its options; after
  // that the panel keeps what it has and only re-queries on search/paging.
  const openOrgDropdown = (next: boolean) => {
    setOrgOpen(next);
    if (next) setOrgOpened(true);
  };
  const openAsmtDropdown = (next: boolean) => {
    setAsmtOpen(next);
    if (next) setAsmtOpened(true);
  };

  // New dropdown search → back to its first page.
  useEffect(() => { setOrgPage(0); }, [debouncedOrgSearch]);
  useEffect(() => { setAsmtPage(0); }, [debouncedAsmtSearch]);
  // New filter combination → back to the listing's first page.
  useEffect(() => { setRespPage(0); }, [selectedOrg, selectedAsmt, debouncedRespSearch, respSize]);

  useEffect(() => {
    if (!orgOpened) return;
    let cancelled = false;
    setOrgLoading(true);
    setOrgError('');
    reportApis.getOrganizations({
      search: debouncedOrgSearch.trim() || undefined,
      page: orgPage,
      size: DROPDOWN_PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setOrgData({
          ...res.data,
          items: res.data.items.map((o) => ({ id: o.organizationId, label: o.name })),
        });
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
    reportApis.getAssessments({
      search: debouncedAsmtSearch.trim() || undefined,
      page: asmtPage,
      size: DROPDOWN_PAGE_SIZE,
    })
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

  // The listing waits for a filter too: no organization, no assessment and no
  // search means no query at all, so opening the page costs nothing and never
  // dumps every respondent in the system.
  const filtersApplied = selectedOrg !== null || selectedAsmt !== null
    || debouncedRespSearch.trim() !== '';

  useEffect(() => {
    if (!filtersApplied) {
      // Back to the resting state — drop whatever the last filter listed.
      setRespData(null);
      setRespError('');
      setRespLoading(false);
      return;
    }
    let cancelled = false;
    setRespLoading(true);
    setRespError('');
    reportApis.getRespondents({
      organizationId: selectedOrg?.id,
      assessmentId: selectedAsmt?.id,
      search: debouncedRespSearch.trim() || undefined,
      page: respPage,
      size: respSize,
    })
      .then((res) => { if (!cancelled) setRespData(res.data); })
      .catch((e: any) => {
        if (!cancelled) setRespError(e?.response?.data?.message || e?.message || 'Failed to load respondents');
      })
      .finally(() => { if (!cancelled) setRespLoading(false); });
    return () => { cancelled = true; };
  }, [filtersApplied, selectedOrg, selectedAsmt, debouncedRespSearch, respPage, respSize, respReload]);

  // Info popup: (re)fetch whenever a respondent is opened. Reset writes its
  // own row back into state, so nothing else re-fetches this.
  const loadDetail = (respondentUserId: number) => {
    setDetailLoading(true);
    setDetailError('');
    reportApis.getRespondentDetail(respondentUserId)
      .then((res) => setDetail(res.data))
      .catch((e: any) => {
        setDetailError(e?.response?.data?.message || e?.message || 'Failed to load this respondent');
      })
      .finally(() => setDetailLoading(false));
  };

  const openDetail = (row: RespondentRow) => {
    setDetailFor(row);
    setDetail(null);
    setConfirmReset(null);
    setResetError('');
    loadDetail(row.respondentUserId);
  };

  const closeDetail = () => {
    if (resetting) return;
    setDetailFor(null);
    setDetail(null);
    setDetailError('');
    setConfirmReset(null);
    setResetError('');
  };

  const doReset = () => {
    if (!confirmReset) return;
    setResetting(true);
    setResetError('');
    reportApis.resetAssessment(confirmReset.respondentAssessmentMappingId)
      .then((res) => {
        // Swap the reset row in place rather than re-fetching the popup, then
        // let the listing behind it re-read its completed tally.
        setDetail((current) => current && {
          ...current,
          assessments: current.assessments.map((a) =>
            a.respondentAssessmentMappingId === res.data.respondentAssessmentMappingId ? res.data : a),
        });
        setConfirmReset(null);
        setRespReload((n) => n + 1);
      })
      .catch((e: any) => {
        setResetError(e?.response?.data?.message || e?.message || 'Failed to reset this assessment');
      })
      .finally(() => setResetting(false));
  };

  const hasFilters = selectedOrg !== null || selectedAsmt !== null || respSearch.trim() !== '';
  const clearFilters = () => {
    setSelectedOrg(null);
    setSelectedAsmt(null);
    setRespSearch('');
  };

  // "Showing a–b of n" for the footer.
  const shownRange = useMemo(() => {
    if (!respData || respData.totalItems === 0) return null;
    const from = respData.page * respData.size + 1;
    const to = respData.page * respData.size + respData.items.length;
    return { from, to };
  }, [respData]);

  const emptyMessage = 'No respondents match the current filters.';

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Reports</span><span>/</span>
          <span className="text-foreground font-medium">Reports Hub</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <FileBarChart2 className="h-6 w-6 text-primary" />
              Reports Hub
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Pick an organization or an assessment, or search by name or
              email, to list the respondents behind it — then drill into their
              assessments. Exports land here next.
            </p>
          </div>
          <Button variant="outline" disabled title="Export is coming soon">
            <Download /> Export
          </Button>
        </div>
      </div>

      {respError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {respError} — is the API running?
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Respondents in View</p>
            <p className={cn('text-2xl font-semibold mt-1', !filtersApplied && 'text-muted-foreground')}>
              {!filtersApplied ? '—' : respLoading && !respData ? '…' : respData?.totalItems ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Organization Filter</p>
            <p className={cn('text-2xl font-semibold mt-1 truncate', !selectedOrg && 'text-muted-foreground')}>
              {selectedOrg ? selectedOrg.label : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Assessment Filter</p>
            <p className={cn('text-2xl font-semibold mt-1 truncate', !selectedAsmt && 'text-muted-foreground')}>
              {selectedAsmt ? selectedAsmt.label : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FilterDropdown
              icon={Building2}
              placeholder="Select an organization…"
              searchPlaceholder="Search organizations…"
              selected={selectedOrg}
              onSelect={setSelectedOrg}
              open={orgOpen}
              onOpenChange={openOrgDropdown}
              data={orgData}
              loading={orgLoading}
              error={orgError}
              search={orgSearch}
              onSearch={setOrgSearch}
              onPage={setOrgPage}
            />
            <FilterDropdown
              icon={ClipboardList}
              placeholder="Select an assessment…"
              searchPlaceholder="Search assessments…"
              selected={selectedAsmt}
              onSelect={setSelectedAsmt}
              open={asmtOpen}
              onOpenChange={openAsmtDropdown}
              data={asmtData}
              loading={asmtLoading}
              error={asmtError}
              search={asmtSearch}
              onSearch={setAsmtSearch}
              onPage={setAsmtPage}
            />
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={respSearch}
                onChange={(e) => setRespSearch(e.target.value)}
                placeholder="Search respondents by name or email…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X /> Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Respondent listing */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-muted-foreground" />
              Respondents
              {respLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows per page</span>
              <select
                value={respSize}
                onChange={(e) => setRespSize(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
              >
                {LIST_PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Resting state — nothing is fetched, and nothing is listed. */}
          {!filtersApplied && (
            <div className="flex flex-col items-center gap-2 py-14 px-5 text-center">
              <Search className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">Choose what to report on</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Select an organization or an assessment above, or search by name or email.
                Respondents are listed once one of those narrows it down.
              </p>
            </div>
          )}

          {filtersApplied && respLoading && !respData && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading respondents…
            </div>
          )}

          {filtersApplied && respData && respData.items.length === 0 && !respLoading && (
            <div className="py-14 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          )}

          {respData && respData.items.length > 0 && (
            <div className="divide-y divide-border">
              {respData.items.map((r) => (
                <div key={r.respondentUserId} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(r.name || r.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{r.name || '—'}</span>
                      {r.serialId && (
                        <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                          {r.serialId}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</span>
                      {r.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</span>}
                    </div>
                  </div>
                  <span className={cn(
                    'hidden md:inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs shrink-0',
                    r.organizationName
                      ? 'border-border bg-muted/40 text-foreground'
                      : 'border-dashed border-border text-muted-foreground',
                  )}>
                    <Building2 className="h-3 w-3" />
                    {r.organizationName ?? 'No organization'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                      {r.assignedAssessments} assigned
                    </span>
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
                      r.completedAssessments > 0
                        ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                        : 'border-border bg-muted/40 text-muted-foreground',
                    )}>
                      {r.completedAssessments > 0 && <CheckCircle2 className="h-3 w-3" />}
                      {r.completedAssessments} completed
                    </span>
                    {/* What they were assigned, how far they got, and the
                        reset that hands an assessment back to them. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDetail(r)}
                      title={`Assessment details for ${r.name || r.email}`}
                    >
                      <Info /> Info
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {!filtersApplied
                ? 'No filter applied'
                : shownRange
                  ? `Showing ${shownRange.from}–${shownRange.to} of ${respData?.totalItems}`
                  : 'Showing 0 of 0'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!respData || respData.page === 0 || respLoading}
                onClick={() => respData && setRespPage(respData.page - 1)}
              >
                <ChevronLeft /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {respData && respData.totalPages > 0
                  ? `Page ${respData.page + 1} of ${respData.totalPages}`
                  : 'Page 1'}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!respData || respData.page + 1 >= respData.totalPages || respLoading}
                onClick={() => respData && setRespPage(respData.page + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Respondent info popup — what this person was assigned, how far each
          attempt got, and the reset that hands one back to them. */}
      {detailFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={closeDetail}>
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {(detailFor.name || detailFor.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{detailFor.name || '—'}</h2>
                  {detailFor.serialId && (
                    <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {detailFor.serialId}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{detailFor.email}</span>
                  {detailFor.phone && (
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{detailFor.phone}</span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />{detailFor.organizationName ?? 'No organization'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {detailLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading assessments…
                </div>
              )}

              {!detailLoading && detailError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                  {detailError}
                </div>
              )}

              {!detailLoading && !detailError && detail && detail.assessments.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No assessments assigned to this respondent yet.
                </div>
              )}

              {!detailLoading && !detailError && detail?.assessments.map((a) => (
                <div key={a.respondentAssessmentMappingId} className="rounded-lg border border-border p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{a.assessmentName}</span>
                        <span className={cn(
                          'inline-flex items-center rounded-md border px-2 py-0.5 text-xs',
                          ATTEMPT_STYLE[a.attemptStatus],
                        )}>
                          {ATTEMPT_LABEL[a.attemptStatus]}
                        </span>
                        {a.assessmentStatus === 'INACTIVE' && (
                          <span className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                            Assessment inactive
                          </span>
                        )}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ClipboardList className="h-3 w-3 shrink-0" />
                        <span className="truncate">{a.questionnaireName}</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={isUntouched(a)}
                      title={isUntouched(a)
                        ? 'Nothing to reset — this attempt has not been started'
                        : 'Wipe the answers and let this respondent take it again'}
                      onClick={() => { setConfirmReset(a); setResetError(''); }}
                    >
                      <RotateCcw /> Reset
                    </Button>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Answered <span className="font-medium text-foreground">{a.answeredQuestions}</span> of{' '}
                      {a.totalQuestions} question{a.totalQuestions === 1 ? '' : 's'}
                    </span>
                    <span>
                      {a.demographicResponses} demographic answer{a.demographicResponses === 1 ? '' : 's'}
                    </span>
                    <span>{a.isPersisted ? 'Answers saved' : 'Answers not saved yet'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">
                {detail
                  ? `${detail.assessments.length} assessment${detail.assessments.length === 1 ? '' : 's'} assigned`
                  : ' '}
              </span>
              <Button variant="outline" size="sm" onClick={closeDetail}>Close</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Layered over the info popup — the reset is not undoable. */}
      {confirmReset && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4"
          onClick={() => !resetting && setConfirmReset(null)}
        >
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Reset assessment
              </div>
              <p className="text-sm">
                Reset <strong>{confirmReset.assessmentName}</strong> for{' '}
                <strong>{detailFor?.name || detailFor?.email}</strong>? Their{' '}
                {confirmReset.answeredQuestions} answer{confirmReset.answeredQuestions === 1 ? '' : 's'} and{' '}
                {confirmReset.demographicResponses} demographic
                {confirmReset.demographicResponses === 1 ? ' answer' : ' answers'} for it are deleted
                permanently and the assessment goes back to <em>Not started</em>, so they take it again
                from scratch. This cannot be undone.
              </p>
              {resetError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {resetError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmReset(null)} disabled={resetting}>
                  Cancel
                </Button>
                <Button
                  onClick={doReset}
                  disabled={resetting}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetting ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  {resetting ? 'Resetting…' : 'Reset'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
