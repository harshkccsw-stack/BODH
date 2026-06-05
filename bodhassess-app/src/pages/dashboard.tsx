import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '@/src/lib/router-helpers';
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  Database,
  Library,
  Server,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressCircle } from '@/components/ui/progress';
import { getHealth, type HealthStatus, type AssessmentSummary } from '@/lib/api';
import {
  getRespondents,
  getPractitioners,
  countByVertical,
} from '@/lib/data-store';
import { assessmentsApi, getQuestionnairesCatalog as fetchQuestionnaires } from '@/lib/api';

const verticalLabels: Record<string, string> = {
  clinical: 'Clinical Psychology',
  industrial: 'Industrial Psychology',
  counselling: 'Counselling & Child',
  experiments: 'Designing Experiments',
  whitelabel: 'White-Label',
};

const verticalTerminology: Record<string, { respondent: string; practitioner: string }> = {
  clinical: { respondent: 'Clients', practitioner: 'Clinicians' },
  industrial: { respondent: 'Candidates', practitioner: 'HR Professionals' },
  counselling: { respondent: 'Students', practitioner: 'Counsellors' },
  experiments: { respondent: 'Participants', practitioner: 'Researchers' },
  whitelabel: { respondent: 'Users', practitioner: 'Administrators' },
};

const ACTIVITY_WINDOW_DAYS = 14;

/** Bucket a list of ISO dates into the last `days` calendar days (oldest → newest). */
function buildDailyBuckets(dates: Array<string | undefined>, days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return { date: d, count: 0 };
  });
  const indexByDay = new Map(buckets.map((b, i) => [b.date.toDateString(), i]));

  for (const raw of dates) {
    if (!raw) continue;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) continue;
    dt.setHours(0, 0, 0, 0);
    const idx = indexByDay.get(dt.toDateString());
    if (idx !== undefined) buckets[idx].count += 1;
  }
  return buckets;
}

/**
 * Lightweight inline-SVG area sparkline. Matches the hand-rolled chart
 * convention used elsewhere in the app (theme tokens, no chart library).
 */
function ActivitySparkline({ buckets }: { buckets: Array<{ date: Date; count: number }> }) {
  const W = 100;
  const H = 36;
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const n = buckets.length;

  const points = buckets.map((b, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * W;
    const y = H - (b.count / max) * H;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-24 w-full"
      role="img"
      aria-label={`${total} assessments completed over the last ${n} days`}
    >
      <path d={area} fill="hsl(var(--primary))" fillOpacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const statusStyles: Record<string, string> = {
  Completed: 'bg-green-500',
  Active: 'bg-blue-500',
  'Pending Review': 'bg-yellow-500',
};

function DashboardContent() {
  const searchParams = useSearchParams();
  // Default to the white-label (all-verticals) view so the dashboard
  // aggregates every vertical out of the box — landing on a single empty
  // vertical (e.g. clinical with no sessions) read as "broken" to admins.
  const vertical = searchParams.get('vertical') || 'whitelabel';
  const label = verticalLabels[vertical] || 'Clinical Psychology';
  const terms = verticalTerminology[vertical] || verticalTerminology.clinical;

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [respondentCount, setRespondentCount] = useState(0);
  const [practitionerCount, setPractitionerCount] = useState(0);
  const [questionnaireCount, setQuestionnaireCount] = useState(0);
  const [sessions, setSessions] = useState<AssessmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Dashboard reads only the slim /assessments/summaries projection
      // (id, respondent, instrument, vertical, status, score, createdAt) —
      // enough for the KPI cards and overview charts, without pulling the
      // full session payload (answers, mqt scores, demographics).
      const [allRespondents, allPractitioners, allQuestionnaires, allSummaries] = await Promise.all([
        getRespondents(),
        getPractitioners(),
        fetchQuestionnaires().catch(() => []),
        assessmentsApi.listSummaries().catch(() => []),
      ]);
      if (cancelled) return;

      const verticalSessions = vertical === 'whitelabel'
        ? allSummaries
        : allSummaries.filter((s) => String(s.vertical || '').toLowerCase() === vertical);
      setSessions(verticalSessions);

      if (vertical === 'whitelabel') {
        setRespondentCount(allRespondents.length);
        setPractitionerCount(allPractitioners.length);
        setQuestionnaireCount(allQuestionnaires.length);
      } else {
        setQuestionnaireCount(countByVertical(allQuestionnaires as any, vertical));
        setRespondentCount(allRespondents.length);
        setPractitionerCount(
          allPractitioners.filter((p) =>
            !p.verticals?.length || p.verticals.map((v) => v.toLowerCase()).some((v) => v.startsWith(vertical.slice(0, 4))),
          ).length,
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [vertical]);

  const metrics = useMemo(() => {
    const total = sessions.length;
    const activeCount = sessions.filter((s) => s.status === 'Active').length;
    const completedCount = sessions.filter((s) => s.status === 'Completed').length;
    const pendingReviewCount = sessions.filter((s) => s.status === 'Pending Review').length;
    const completionRate = total ? Math.round((completedCount / total) * 100) : 0;
    return { total, activeCount, completedCount, pendingReviewCount, completionRate };
  }, [sessions]);

  // Completions over time — bucket each completed session by its completedAt
  // (created sessions that aren't finished yet don't carry one).
  const activityBuckets = useMemo(
    () => buildDailyBuckets(sessions.map((s) => s.completedAt), ACTIVITY_WINDOW_DAYS),
    [sessions],
  );
  const activityTotal = useMemo(
    () => activityBuckets.reduce((sum, b) => sum + b.count, 0),
    [activityBuckets],
  );

  const topInstruments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const key = s.instrument || 'Unspecified';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [sessions]);

  const stats = [
    { label: 'Active Assessments', value: metrics.activeCount, icon: Activity, change: `${metrics.total} total in this vertical` },
    { label: 'Completed', value: metrics.completedCount, icon: ClipboardCheck, change: `${metrics.completionRate}% completion rate` },
    { label: `${terms.respondent} Registered`, value: respondentCount, icon: Users, change: `${practitionerCount} ${terms.practitioner.toLowerCase()}` },
    { label: 'Questionnaires Available', value: questionnaireCount || 0, icon: Library, change: metrics.pendingReviewCount > 0 ? `${metrics.pendingReviewCount} pending review` : 'Includes library + custom' },
  ];

  const statusBreakdown = [
    { label: 'Completed', count: metrics.completedCount },
    { label: 'Active', count: metrics.activeCount },
    { label: 'Pending Review', count: metrics.pendingReviewCount },
  ];

  const maxInstrumentCount = Math.max(1, ...topInstruments.map((i) => i.count));

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* API Status Banner */}
      {health && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3">
          <Server className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700 dark:text-green-400">
            <strong>API Connected</strong> — {health.service} {health.version}
          </span>
          <span className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1 ml-auto">
            <Database className="h-3 w-3" /> MySQL {health.database ? 'healthy' : 'down'}
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse ml-1" />
          </span>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span className="text-foreground font-medium">{label}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of assessments, reports, and {terms.respondent.toLowerCase()} activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  {loading ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-semibold mt-1 tabular-nums">{stat.value}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Completion Rate */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            {loading ? (
              <Skeleton className="h-[120px] w-[120px] rounded-full" />
            ) : (
              <ProgressCircle value={metrics.completionRate} size={120} strokeWidth={10}>
                <span className="text-xl font-semibold">{metrics.completionRate}%</span>
              </ProgressCircle>
            )}
            <ul className="space-y-2 text-sm">
              {statusBreakdown.map((row) => (
                <li key={row.label} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusStyles[row.label] || 'bg-muted-foreground'}`} />
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="ml-auto font-medium tabular-nums">{row.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Activity Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Completions</CardTitle>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Last {ACTIVITY_WINDOW_DAYS} days
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : activityTotal === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                No completions in the last {ACTIVITY_WINDOW_DAYS} days.
              </div>
            ) : (
              <>
                <ActivitySparkline buckets={activityBuckets} />
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{activityBuckets[0]?.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <span>{activityBuckets[activityBuckets.length - 1]?.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Questionnaires */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Top Questionnaires</CardTitle>
            <a href="/assessments" className="text-sm text-primary hover:underline">View all</a>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : topInstruments.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No assessments to summarise yet.</p>
          ) : (
            <ul className="space-y-3">
              {topInstruments.map((item) => (
                <li key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate pr-3 font-medium">{item.name}</span>
                    <span className="tabular-nums text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${(item.count / maxInstrumentCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { window.location.href = '/assessments/create'; }}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Create Assessment</p>
              <p className="text-xs text-muted-foreground">Start a new assessment</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { window.location.href = '/assessments/batch'; }}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Batch Upload</p>
              <p className="text-xs text-muted-foreground">Upload CSV for cohort</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { window.location.href = '/platform/bodhlens'; }}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">BodhLens</p>
              <p className="text-xs text-muted-foreground">Ask a question in plain English</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-5 lg:p-7.5">Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
