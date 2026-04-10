'use client';

import {
  Eye,
  ShieldCheck,
  AlertTriangle,
  Monitor,
  Video,
  Users,
  Clock,
  Activity,
  Wifi,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const statsData = [
  { label: 'Active Sessions', value: '3', icon: Activity, change: 'Live now' },
  { label: 'Avg Trust Score', value: '94%', icon: ShieldCheck, change: '+2% from last week' },
  { label: 'Flagged Today', value: '4', icon: AlertTriangle, change: '2 under review' },
  { label: 'BPaaS API Calls', value: '1,247', icon: Wifi, change: 'Today\'s usage' },
];

const activeSessions = [
  {
    id: 'PROC-091',
    candidate: 'Arjun Mehta',
    assessment: 'Cognitive Ability Test',
    trustScore: 97,
    flags: 0,
    elapsed: '18:42',
    faceDetection: 'Active',
    gazeTracking: 'Active',
    browserLockdown: 'Active',
    multiPerson: 'Clear',
  },
  {
    id: 'PROC-092',
    candidate: 'Sneha Kapoor',
    assessment: 'Big Five (IPIP-NEO)',
    trustScore: 88,
    flags: 2,
    elapsed: '32:15',
    faceDetection: 'Active',
    gazeTracking: 'Warning',
    browserLockdown: 'Active',
    multiPerson: 'Clear',
  },
  {
    id: 'PROC-093',
    candidate: 'Rohan Das',
    assessment: 'AI Adaptability Index',
    trustScore: 92,
    flags: 1,
    elapsed: '11:08',
    faceDetection: 'Active',
    gazeTracking: 'Active',
    browserLockdown: 'Active',
    multiPerson: 'Alert',
  },
];

const completedSessions = [
  {
    id: 'PROC-088',
    candidate: 'Kavita Reddy',
    assessment: 'HEXACO-PI-R',
    trustScore: 99,
    flags: 0,
    flagTypes: [],
    duration: '45:12',
    status: 'Approved',
  },
  {
    id: 'PROC-087',
    candidate: 'Deepak Sharma',
    assessment: 'Cognitive Ability Test',
    trustScore: 72,
    flags: 5,
    flagTypes: ['Gaze deviation', 'Tab switch', 'Multi-person detected'],
    duration: '38:45',
    status: 'Flagged',
  },
  {
    id: 'PROC-086',
    candidate: 'Anita Verma',
    assessment: 'Emotional Intelligence Scale',
    trustScore: 85,
    flags: 2,
    flagTypes: ['Gaze deviation'],
    duration: '28:33',
    status: 'Under Review',
  },
  {
    id: 'PROC-085',
    candidate: 'Suresh Patel',
    assessment: 'Work Personality Index',
    trustScore: 96,
    flags: 1,
    flagTypes: ['Brief face occlusion'],
    duration: '41:07',
    status: 'Approved',
  },
  {
    id: 'PROC-084',
    candidate: 'Meera Iyer',
    assessment: 'Big Five (IPIP-NEO)',
    trustScore: 91,
    flags: 1,
    flagTypes: ['Browser resize'],
    duration: '35:22',
    status: 'Approved',
  },
  {
    id: 'PROC-083',
    candidate: 'Vikram Sinha',
    assessment: 'Leadership Potential Index',
    trustScore: 68,
    flags: 7,
    flagTypes: ['Multi-person detected', 'Tab switch', 'Gaze deviation', 'Audio anomaly'],
    duration: '52:18',
    status: 'Flagged',
  },
];

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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {statsData.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
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
