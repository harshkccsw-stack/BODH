import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileBarChart2,
  Loader2,
  Mail,
  Phone,
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
  type ReportPage,
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
// selection ("All …" when none), opening a panel with its own search box, a
// paged option list fed by the server, and prev/next paging in the footer.

interface DropdownItem {
  id: number;
  label: string;
  sub?: string;
}

interface FilterDropdownProps {
  icon: LucideIcon;
  allLabel: string;
  searchPlaceholder: string;
  selected: DropdownItem | null;
  onSelect: (item: DropdownItem | null) => void;
  data: ReportPage<DropdownItem> | null;
  loading: boolean;
  error: string;
  search: string;
  onSearch: (value: string) => void;
  onPage: (page: number) => void;
}

function FilterDropdown({
  icon: Icon, allLabel, searchPlaceholder, selected, onSelect,
  data, loading, error, search, onSearch, onPage,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (item: DropdownItem | null) => {
    onSelect(item);
    setOpen(false);
  };

  return (
    <div className="relative flex-1 min-w-56" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 flex items-center gap-2"
      >
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={cn('flex-1 truncate text-left', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : allLabel}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); pick(null); }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={`Reset to ${allLabel}`}
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
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-muted/60',
                !selected && 'bg-primary/5 font-medium text-primary',
              )}
            >
              {allLabel}
            </button>
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

// ── Page ────────────────────────────────────────────────────────────────────

export default function ReportsHubPage() {
  // Organization dropdown state.
  const [orgSearch, setOrgSearch] = useState('');
  const [orgPage, setOrgPage] = useState(0);
  const [orgData, setOrgData] = useState<ReportPage<DropdownItem> | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<DropdownItem | null>(null);
  const debouncedOrgSearch = useDebounced(orgSearch, 300);

  // Assessment dropdown state.
  const [asmtSearch, setAsmtSearch] = useState('');
  const [asmtPage, setAsmtPage] = useState(0);
  const [asmtData, setAsmtData] = useState<ReportPage<DropdownItem> | null>(null);
  const [asmtLoading, setAsmtLoading] = useState(true);
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

  // New dropdown search → back to its first page.
  useEffect(() => { setOrgPage(0); }, [debouncedOrgSearch]);
  useEffect(() => { setAsmtPage(0); }, [debouncedAsmtSearch]);
  // New filter combination → back to the listing's first page.
  useEffect(() => { setRespPage(0); }, [selectedOrg, selectedAsmt, debouncedRespSearch, respSize]);

  useEffect(() => {
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
  }, [debouncedOrgSearch, orgPage]);

  useEffect(() => {
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
  }, [debouncedAsmtSearch, asmtPage]);

  useEffect(() => {
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
  }, [selectedOrg, selectedAsmt, debouncedRespSearch, respPage, respSize]);

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

  const emptyMessage = hasFilters
    ? 'No respondents match the current filters.'
    : 'No respondents yet — they appear here once registered.';

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
              Every respondent in one place. Narrow by organization and
              assessment (or keep "All"), search by name or email, then drill
              into their assessments. Exports land here next.
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
            <p className="text-2xl font-semibold mt-1">{respLoading && !respData ? '…' : respData?.totalItems ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Organization Filter</p>
            <p className="text-2xl font-semibold mt-1 truncate">{selectedOrg ? selectedOrg.label : 'All'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Assessment Filter</p>
            <p className="text-2xl font-semibold mt-1 truncate">{selectedAsmt ? selectedAsmt.label : 'All'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FilterDropdown
              icon={Building2}
              allLabel="All organizations"
              searchPlaceholder="Search organizations…"
              selected={selectedOrg}
              onSelect={setSelectedOrg}
              data={orgData}
              loading={orgLoading}
              error={orgError}
              search={orgSearch}
              onSearch={setOrgSearch}
              onPage={setOrgPage}
            />
            <FilterDropdown
              icon={ClipboardList}
              allLabel="All assessments"
              searchPlaceholder="Search assessments…"
              selected={selectedAsmt}
              onSelect={setSelectedAsmt}
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

          {respLoading && !respData && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading respondents…
            </div>
          )}

          {respData && respData.items.length === 0 && !respLoading && (
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
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {shownRange
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
    </div>
  );
}
