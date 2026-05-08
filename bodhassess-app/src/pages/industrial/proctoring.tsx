import {
  AlertTriangle,
  Monitor,
  Video,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ActiveSession {
  id: string;
  candidate: string;
  assessment: string;
  trustScore: number;
  flags: number;
  elapsed: string;
  faceDetection: string;
  gazeTracking: string;
  browserLockdown: string;
  multiPerson: string;
}

interface CompletedSession {
  id: string;
  candidate: string;
  assessment: string;
  trustScore: number;
  flags: number;
  flagTypes: string[];
  duration: string;
  status: string;
}

const activeSessions: ActiveSession[] = [];
const completedSessions: CompletedSession[] = [];

function TrustScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : score >= 75
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium font-mono ${color}`}>
      {score}%
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'Active') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === 'Warning') return <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />;
  if (status === 'Alert') return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
}

export default function ProctoringDashboardPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Industrial</span>
          <span>/</span>
          <span className="text-foreground font-medium">Proctoring Dashboard</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Proctoring Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time monitoring, trust score analytics, and session integrity management.
        </p>
      </div>

      {/* Live Monitoring */}
      <div>
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          Live Monitoring — {activeSessions.length} Active Sessions
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {activeSessions.length === 0 && (
            <Card className="lg:col-span-3">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No active proctoring sessions.
              </CardContent>
            </Card>
          )}
          {activeSessions.map((session) => (
            <Card key={session.id} className="border-primary/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Video className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{session.candidate}</CardTitle>
                      <p className="text-xs text-muted-foreground">{session.assessment}</p>
                    </div>
                  </div>
                  <TrustScoreBadge score={session.trustScore} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Elapsed: {session.elapsed}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {session.flags} flags
                  </span>
                </div>

                {/* Trust Score Breakdown */}
                <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Trust Score Breakdown</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={session.faceDetection} />
                      <span>Face Detection</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={session.gazeTracking} />
                      <span>Gaze Tracking</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={session.browserLockdown} />
                      <span>Browser Lockdown</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={session.multiPerson} />
                      <span>Multi-person</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Completed Sessions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4 text-primary" />
              Recent Completed Sessions
            </CardTitle>
            <span className="text-xs text-muted-foreground">{completedSessions.length} sessions</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Candidate</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Assessment</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Trust Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Flags</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Duration</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {completedSessions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      No completed sessions yet.
                    </td>
                  </tr>
                )}
                {completedSessions.map((session) => (
                  <tr
                    key={session.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium">{session.candidate}</td>
                    <td className="px-5 py-3">{session.assessment}</td>
                    <td className="px-5 py-3">
                      <TrustScoreBadge score={session.trustScore} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{session.flags}</span>
                        {session.flagTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {session.flagTypes.map((type) => (
                              <Badge key={type} variant="outline" className="text-[10px] px-1.5 py-0">
                                {type}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {session.duration}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          session.status === 'Approved'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : session.status === 'Flagged'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        }`}
                      >
                        {session.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
