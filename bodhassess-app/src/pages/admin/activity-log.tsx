import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Loader2,
  RefreshCcw,
  ScrollText,
  Search,
  ShieldAlert,
  User,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  activityApis,
  type ActivityOutcome,
  type ActivityPage,
  type ActivityRow,
} from './activityApis';

const PAGE_SIZES = [25, 50, 100];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Debounce a fast-changing value (search inputs) before it hits the API. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const OUTCOME_LABEL: Record<ActivityOutcome, string> = {
  SUCCESS: 'Success',
  CLIENT_ERROR: 'Client error',
  SERVER_ERROR: 'Server error',
};

const OUTCOME_STYLE: Record<ActivityOutcome, string> = {
  SUCCESS: 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400',
  CLIENT_ERROR: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
  SERVER_ERROR: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400',
};

// Writes are what an audit trail is really for, so they read differently from
// the reads that surround them.
const METHOD_STYLE: Record<string, string> = {
  GET: 'text-muted-foreground',
  POST: 'text-blue-600 dark:text-blue-400 font-semibold',
  PUT: 'text-blue-600 dark:text-blue-400 font-semibold',
  PATCH: 'text-blue-600 dark:text-blue-400 font-semibold',
  DELETE: 'text-red-600 dark:text-red-400 font-semibold',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function ActivityLogPage() {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<ActivityOutcome | ''>('');
  const [method, setMethod] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [reload, setReload] = useState(0);

  const [data, setData] = useState<ActivityPage<ActivityRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ActivityRow | null>(null);

  const debouncedSearch = useDebounced(search, 350);

  // Any new filter combination starts again at the first page.
  useEffect(() => { setPage(0); }, [debouncedSearch, outcome, method, from, to, size]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    activityApis.getAll({
      search: debouncedSearch.trim() || undefined,
      outcome: outcome || undefined,
      method: method || undefined,
      // <input type="datetime-local"> gives "2026-08-10T09:30" — the backend
      // parses ISO_DATE_TIME, which wants seconds.
      from: from ? `${from}:00` : undefined,
      to: to ? `${to}:00` : undefined,
      page,
      size,
    })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.response?.status === 403
            ? 'The activity log is restricted to super admins.'
            : e?.response?.data?.message || e?.message || 'Failed to load activity');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch, outcome, method, from, to, page, size, reload]);

  const hasFilters = debouncedSearch.trim() !== '' || outcome !== '' || method !== '' || from !== '' || to !== '';
  const clearFilters = () => {
    setSearch(''); setOutcome(''); setMethod(''); setFrom(''); setTo('');
  };

  const shownRange = useMemo(() => {
    if (!data || data.totalItems === 0) return null;
    return {
      from: data.page * data.size + 1,
      to: data.page * data.size + data.items.length,
    };
  }, [data]);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Admin</span><span>/</span>
          <span className="text-foreground font-medium">Activity Log</span>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ScrollText className="h-6 w-6 text-primary" />
              Activity Log
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Every request the API answers — who made it, what they touched, and
              whether it worked. Super admins only.
            </p>
          </div>
          <Button variant="outline" onClick={() => setReload((n) => n + 1)} disabled={loading}>
            <RefreshCcw /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by path or who did it…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ActivityOutcome | '')}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">All outcomes</option>
              <option value="SUCCESS">Success</option>
              <option value="CLIENT_ERROR">Client errors (4xx)</option>
              <option value="SERVER_ERROR">Server errors (5xx)</option>
            </select>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">All methods</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              From
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              To
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
            </label>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X /> Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Listing */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {data ? `${data.totalItems.toLocaleString()} requests` : 'Requests'}
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows per page</span>
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {loading && !data && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
            </div>
          )}

          {data && data.items.length === 0 && !loading && (
            <div className="py-14 text-center text-sm text-muted-foreground">
              {hasFilters ? 'No requests match the current filters.' : 'Nothing recorded yet.'}
            </div>
          )}

          {data && data.items.length > 0 && (
            <div className="divide-y divide-border">
              {data.items.map((r) => (
                <button
                  key={r.activityLogId}
                  type="button"
                  onClick={() => setDetail(r)}
                  className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="w-36 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatWhen(r.occurredAt)}
                  </span>

                  <span className="w-44 shrink-0 truncate text-sm">
                    {r.actorEmail ? (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r.actorEmail}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">anonymous</span>
                    )}
                  </span>

                  <span className={cn('w-16 shrink-0 font-mono text-xs', METHOD_STYLE[r.method] ?? '')}>
                    {r.method}
                  </span>

                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={r.path}>
                    {r.pathTemplate ?? r.path}
                  </span>

                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {r.durationMs} ms
                  </span>

                  <span className={cn(
                    'inline-flex w-16 shrink-0 items-center justify-center gap-1 rounded-md border px-2 py-1 text-xs tabular-nums',
                    OUTCOME_STYLE[r.outcome],
                  )}>
                    {r.outcome === 'SUCCESS'
                      ? <CircleCheck className="h-3 w-3" />
                      : <AlertTriangle className="h-3 w-3" />}
                    {r.httpStatus}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {shownRange
                ? `Showing ${shownRange.from.toLocaleString()}–${shownRange.to.toLocaleString()} of ${data?.totalItems.toLocaleString()}`
                : 'Showing 0 of 0'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!data || data.page === 0 || loading}
                onClick={() => data && setPage(data.page - 1)}
              >
                <ChevronLeft /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">
                {data && data.totalPages > 0 ? `Page ${data.page + 1} of ${data.totalPages}` : 'Page 1'}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || data.page + 1 >= data.totalPages || loading}
                onClick={() => data && setPage(data.page + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row detail — the full request, including the reference a user quotes
          when they report an error. */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setDetail(null)}>
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('font-mono text-sm', METHOD_STYLE[detail.method] ?? '')}>
                    {detail.method}
                  </span>
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
                    OUTCOME_STYLE[detail.outcome],
                  )}>
                    {detail.httpStatus} · {OUTCOME_LABEL[detail.outcome]}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{detail.path}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <Field label="When" value={formatWhen(detail.occurredAt)} />
                <Field label="Duration" value={`${detail.durationMs} ms`} />
                <Field label="Who" value={detail.actorEmail ?? 'anonymous'} />
                <Field
                  label="User id"
                  value={detail.actorUserId === null
                    ? '—'
                    : `${detail.actorUserId}${detail.actorSuperAdmin ? ' (super admin)' : ''}`}
                />
                <Field label="Endpoint" value={detail.pathTemplate ?? 'no match (404)'} mono />
                <Field label="Query" value={detail.queryString ?? '—'} mono />
                <Field label="IP" value={detail.ip ?? '—'} mono />
                {/* The value that ties this row to the server log lines and to
                    the reference returned in a 500 body. */}
                <Field label="Request id" value={detail.requestId ?? '—'} mono />
              </dl>

              {detail.errorMessage && (
                <div className="mt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Error</p>
                  <pre className="overflow-x-auto rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap break-words">
                    {detail.errorMessage}
                  </pre>
                </div>
              )}

              {detail.userAgent && (
                <div className="mt-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">User agent</p>
                  <p className="break-all font-mono text-xs text-muted-foreground">{detail.userAgent}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => setDetail(null)}>Close</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 break-all', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
