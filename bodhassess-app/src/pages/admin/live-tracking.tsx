'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckCircle2, Clock, Hourglass, RefreshCw, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  liveTrackingApi,
  type LiveAssessmentSummary,
  type LiveSessionRow,
  type LiveStatus,
} from '@/lib/api';

const POLL_MS = 5000;

const liveStatusStyles: Record<LiveStatus, { label: string; className: string }> = {
  live: {
    label: 'Live',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  idle: {
    label: 'Idle',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  completed: {
    label: 'Completed',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  not_started: {
    label: 'Not started',
    className: 'bg-muted text-muted-foreground',
  },
};

function relativeFromIso(iso?: string): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function formatStartedAt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

// Encode (instrument, groupId) as one selector value since groupId may be null/undefined.
function selectorKey(s: { instrument: string; groupId?: string | null }): string {
  return `${s.instrument}::${s.groupId ?? ''}`;
}

export default function LiveTrackingPage() {
  const [assessments, setAssessments] = useState<LiveAssessmentSummary[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentsError, setAssessmentsError] = useState('');
  const [selected, setSelected] = useState<string>('');

  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  // Used by the "Updated Xs ago" indicator so it ticks without re-fetching.
  const [, setNowTick] = useState(0);

  // Bumps every 1s — re-renders relative timestamps without re-fetching.
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const refreshAssessments = async () => {
    try {
      const list = await liveTrackingApi.listAssessments();
      setAssessments(list);
      setAssessmentsError('');
    } catch (e: any) {
      setAssessmentsError(e?.message || 'Failed to load assessments');
    } finally {
      setAssessmentsLoading(false);
    }
  };

  useEffect(() => {
    refreshAssessments();
    const t = setInterval(refreshAssessments, POLL_MS);
    return () => clearInterval(t);
  }, []);

  const selectedAssessment = useMemo(
    () => assessments.find((a) => selectorKey(a) === selected) || null,
    [assessments, selected],
  );

  const inflight = useRef(false);

  useEffect(() => {
    if (!selectedAssessment) {
      setSessions([]);
      setLastUpdated(null);
      return;
    }
    let cancelled = false;
    const fetchSessions = async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        const rows = await liveTrackingApi.listSessions(
          selectedAssessment.instrument,
          selectedAssessment.groupId ?? undefined,
        );
        if (cancelled) return;
        setSessions(rows);
        setSessionsError('');
        setLastUpdated(Date.now());
      } catch (e: any) {
        if (!cancelled) setSessionsError(e?.message || 'Failed to load participants');
      } finally {
        inflight.current = false;
        if (!cancelled) setSessionsLoading(false);
      }
    };
    setSessionsLoading(true);
    fetchSessions();
    const t = setInterval(fetchSessions, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [selectedAssessment?.instrument, selectedAssessment?.groupId]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const live = sessions.filter((s) => s.liveStatus === 'live').length;
    const idle = sessions.filter((s) => s.liveStatus === 'idle').length;
    const completed = sessions.filter((s) => s.liveStatus === 'completed').length;
    const notStarted = sessions.filter((s) => s.liveStatus === 'not_started').length;
    return [
      { label: 'Total', value: total, icon: Users, accent: 'bg-primary/10 text-primary' },
      { label: 'Live', value: live, icon: Activity, accent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      { label: 'Idle', value: idle, icon: Hourglass, accent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
      { label: 'Completed', value: completed, icon: CheckCircle2, accent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
      { label: 'Not started', value: notStarted, icon: Clock, accent: 'bg-muted text-muted-foreground' },
    ];
  }, [sessions]);

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
              Watch respondents progress through an assessment in real time.
            </p>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className={`h-3.5 w-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
              Updated {relativeFromIso(new Date(lastUpdated).toISOString())}
            </div>
          )}
        </div>
      </div>

      {assessmentsError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {assessmentsError}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pick an assessment</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-full md:max-w-xl" size="md">
              <SelectValue placeholder={assessmentsLoading ? 'Loading…' : 'Select an assessment'} />
            </SelectTrigger>
            <SelectContent>
              {assessments.length === 0 ? (
                <SelectItem value="__none" disabled>No assessments found</SelectItem>
              ) : (
                assessments.map((a) => {
                  const k = selectorKey(a);
                  const label = a.instrumentFullName || a.instrument;
                  const grp = a.groupName ? ` — ${a.groupName}` : '';
                  return (
                    <SelectItem key={k} value={k}>
                      {label}{grp} &nbsp;·&nbsp; {a.activeNow} live / {a.totalSessions} total
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
          {selectedAssessment && (
            <p className="text-xs text-muted-foreground">
              Polling every {POLL_MS / 1000}s. Heartbeats from in-progress respondents arrive every 5s; rows go idle after 15s of silence.
            </p>
          )}
        </CardContent>
      </Card>

      {!selectedAssessment ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Pick an assessment above to see participants.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                    </div>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.accent}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Participants</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sessionsError && (
                <div className="px-5 py-3 text-sm text-red-700 dark:text-red-400">{sessionsError}</div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Question</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground w-48">Progress</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last seen</th>
                      <th className="px-5 py-3 text-left font-medium text-muted-foreground">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                        {sessionsLoading ? 'Loading participants…' : 'No participants yet.'}
                      </td></tr>
                    ) : sessions.map((s) => {
                      const style = liveStatusStyles[s.liveStatus] ?? liveStatusStyles.not_started;
                      const pct = s.percentComplete ?? 0;
                      const qLabel = (s.currentIndex !== undefined && s.totalQuestions !== undefined)
                        // currentIndex is 0-based; show as 1-based for humans
                        ? `${Math.min(s.currentIndex + 1, s.totalQuestions)} / ${s.totalQuestions}`
                        : '—';
                      return (
                        <tr key={s.sessionId} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="font-medium">{s.respondentName}</div>
                            {s.respondentEmail && (
                              <div className="text-xs text-muted-foreground font-mono">{s.respondentEmail}</div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}>
                              {style.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs">{qLabel}</td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${s.liveStatus === 'completed' ? 100 : pct}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                                {s.liveStatus === 'completed' ? 100 : pct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">{relativeFromIso(s.lastSeen)}</td>
                          <td className="px-5 py-3 text-xs text-muted-foreground">{formatStartedAt(s.startedAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
