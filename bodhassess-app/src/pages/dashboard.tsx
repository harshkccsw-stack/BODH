import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '@/lib/router-helpers';
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  Database,
  Library,
  Server,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressCircle } from '@/components/ui/progress';
import { dashboardApis, type DashboardAllotment } from './dashboardApis';

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

const statusStyles: Record<string, string> = {
  Completed: 'bg-green-500',
  'In progress': 'bg-blue-500',
  'Not started': 'bg-muted-foreground/50',
};

/** One allotment, tagged with its questionnaire's vertical for the filter. */
type Session = DashboardAllotment & { vertical: string | null };

function DashboardContent() {
  const searchParams = useSearchParams();
  // Default to the white-label (all-verticals) view so the dashboard
  // aggregates every vertical out of the box — landing on a single empty
  // vertical (e.g. clinical with no sessions) read as "broken" to admins.
  const vertical = searchParams.get('vertical') || 'whitelabel';
  const label = verticalLabels[vertical] || 'Clinical Psychology';
  const terms = verticalTerminology[vertical] || verticalTerminology.clinical;

  // null = still loading, false = the API did not answer.
  const [connected, setConnected] = useState<boolean | null>(null);
  const [respondentCount, setRespondentCount] = useState(0);
  const [practitionerCount, setPractitionerCount] = useState(0);
  const [questionnaireCount, setQuestionnaireCount] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [respondents, practitioners, questionnaires, assessments, allotments] = await Promise.all([
          dashboardApis.getRespondents(),
          dashboardApis.getPractitioners(),
          dashboardApis.getQuestionnaires(),
          dashboardApis.getAssessments(),
          dashboardApis.getAllotments(),
        ]);
        if (cancelled) return;

        // An allotment has no vertical of its own: it inherits its
        // questionnaire's, through the assessment.
        const verticalByQuestionnaire = new Map(
          questionnaires.data.map((q) => [q.questionnaireId, q.vertical]));
        const verticalByAssessment = new Map(assessments.data.map((a) =>
          [a.assessmentId, verticalByQuestionnaire.get(a.questionnaireId) ?? null]));
        const all: Session[] = allotments.data.map((m) => ({
          ...m,
          vertical: verticalByAssessment.get(m.assessmentId)?.toLowerCase() ?? null,
        }));

        const inVertical = <T extends { vertical: string | null }>(items: T[]) =>
          vertical === 'whitelabel' ? items : items.filter((i) => i.vertical?.toLowerCase() === vertical);

        setSessions(inVertical(all));
        setQuestionnaireCount(inVertical(questionnaires.data.map((q) => ({ vertical: q.vertical }))).length);
        // Respondents carry no vertical — every view counts them all.
        setRespondentCount(respondents.data.length);
        setPractitionerCount(
          vertical === 'whitelabel'
            ? practitioners.data.length
            : practitioners.data.filter((p) => !p.vertical || p.vertical.toLowerCase() === vertical).length,
        );
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vertical]);

  const metrics = useMemo(() => {
    const total = sessions.length;
    const ongoingCount = sessions.filter((s) => s.assessmentStatus === 'ONGOING').length;
    const completedCount = sessions.filter((s) => s.assessmentStatus === 'COMPLETED').length;
    const notStartedCount = sessions.filter((s) => s.assessmentStatus === 'NOT_STARTED').length;
    const completionRate = total ? Math.round((completedCount / total) * 100) : 0;
    return { total, ongoingCount, completedCount, notStartedCount, completionRate };
  }, [sessions]);

  const topInstruments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const key = s.assessmentName || 'Unspecified';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [sessions]);

  const stats = [
    { label: 'In Progress', value: metrics.ongoingCount, icon: Activity, change: `${metrics.notStartedCount} not started · ${metrics.total} assigned` },
    { label: 'Completed', value: metrics.completedCount, icon: ClipboardCheck, change: `${metrics.completionRate}% completion rate` },
    { label: `${terms.respondent} Registered`, value: respondentCount, icon: Users, change: `${practitionerCount} ${terms.practitioner.toLowerCase()}` },
    { label: 'Questionnaires Available', value: questionnaireCount, icon: Library, change: 'In the questionnaire library' },
  ];

  const statusBreakdown = [
    { label: 'Completed', count: metrics.completedCount },
    { label: 'In progress', count: metrics.ongoingCount },
    { label: 'Not started', count: metrics.notStartedCount },
  ];

  const maxInstrumentCount = Math.max(1, ...topInstruments.map((i) => i.count));

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* API Status Banner — the page's own reads are the health check. */}
      {connected === true && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3">
          <Server className="h-4 w-4 text-green-600" />
          <span className="text-sm text-green-700 dark:text-green-400">
            <strong>API Connected</strong> — live data from the server
          </span>
          <span className="text-xs text-green-600 dark:text-green-500 flex items-center gap-1 ml-auto">
            <Database className="h-3 w-3" /> MySQL healthy
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse ml-1" />
          </span>
        </div>
      )}
      {connected === false && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3">
          <Server className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700 dark:text-red-400">
            <strong>API unreachable</strong> — the figures below could not be loaded.
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

        {/* Assignment progress. Allotments carry no completion date yet, so
            this is the overall split rather than a per-day trend. */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assignment Progress</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : metrics.total === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                No assessments assigned yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
                  {statusBreakdown.map((row) => (
                    <div
                      key={row.label}
                      className={statusStyles[row.label]}
                      style={{ width: `${(row.count / metrics.total) * 100}%` }}
                      title={`${row.label}: ${row.count}`}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{metrics.completedCount}</span> of{' '}
                  <span className="tabular-nums">{metrics.total}</span> assigned assessments completed,{' '}
                  <span className="tabular-nums">{metrics.ongoingCount}</span> in progress.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top assessments, by how many people they are assigned to */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Most Assigned Assessments</CardTitle>
            <a href="/assessment-library/assessments" className="text-sm text-primary hover:underline">View all</a>
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
        <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { window.location.href = '/assessment-library/assessments/create'; }}>
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
