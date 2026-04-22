'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  ExternalLink,
  XCircle,
  Clock,
  Activity,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type AlertLevel = 'critical' | 'high';
type AlertAction = 'active' | 'acknowledged' | 'referred' | 'dismissed';

interface RiskAlert {
  id: string;
  client: string;
  clientId: string;
  instrument: string;
  item: string;
  response: string;
  description: string;
  level: AlertLevel;
  timestamp: string;
  practitioner: string;
  status: AlertAction;
}

const activeAlerts: RiskAlert[] = [
  {
    id: 'ALR-001',
    client: 'Ananya Reddy',
    clientId: 'CLT-0004',
    instrument: 'PHQ-9',
    item: 'Item 9',
    response: '"More than half the days" (Score: 2)',
    description: 'Suicidal ideation flagged — "Thoughts that you would be better off dead, or of hurting yourself"',
    level: 'critical',
    timestamp: '2026-04-09 09:15',
    practitioner: 'Dr. Meena Iyer',
    status: 'active',
  },
  {
    id: 'ALR-002',
    client: 'Rahul Verma',
    clientId: 'CLT-0003',
    instrument: 'DASS-21',
    item: 'Depression Subscale',
    response: 'Total: 32 (Extremely Severe)',
    description: 'DASS-21 Depression subscale — Extremely Severe range exceeded',
    level: 'critical',
    timestamp: '2026-04-09 08:42',
    practitioner: 'Dr. Sanjay Kulkarni',
    status: 'active',
  },
  {
    id: 'ALR-003',
    client: 'Deepak Joshi',
    clientId: 'CLT-0007',
    instrument: 'GAD-7',
    item: 'Total Score',
    response: 'Total: 19 (Severe Anxiety)',
    description: 'GAD-7 total score in Severe range — immediate clinical review recommended',
    level: 'high',
    timestamp: '2026-04-09 07:30',
    practitioner: 'Dr. Meena Iyer',
    status: 'active',
  },
];

const alertHistory: RiskAlert[] = [
  {
    id: 'ALR-004',
    client: 'Priya Sharma',
    clientId: 'CLT-0002',
    instrument: 'PHQ-9',
    item: 'Item 9',
    response: '"Several days" (Score: 1)',
    description: 'Suicidal ideation flagged — low frequency but flagged per protocol',
    level: 'high',
    timestamp: '2026-04-08 14:20',
    practitioner: 'Dr. Sanjay Kulkarni',
    status: 'acknowledged',
  },
  {
    id: 'ALR-005',
    client: 'Kavitha Nair',
    clientId: 'CLT-0006',
    instrument: 'Beck BDI-II',
    item: 'Item 9 (Suicidal Thoughts)',
    response: '"I have thoughts of killing myself but would not carry them out" (Score: 1)',
    description: 'BDI-II suicidality item endorsed',
    level: 'critical',
    timestamp: '2026-04-07 11:05',
    practitioner: 'Dr. Meena Iyer',
    status: 'referred',
  },
  {
    id: 'ALR-006',
    client: 'Vikram Singh',
    clientId: 'CLT-0005',
    instrument: 'DASS-21',
    item: 'Stress Subscale',
    response: 'Total: 28 (Severe)',
    description: 'DASS-21 Stress subscale in Severe range',
    level: 'high',
    timestamp: '2026-04-06 16:30',
    practitioner: 'Dr. Sanjay Kulkarni',
    status: 'dismissed',
  },
  {
    id: 'ALR-007',
    client: 'Arjun Mehta',
    clientId: 'CLT-0001',
    instrument: 'PHQ-9',
    item: 'Item 9',
    response: '"Nearly every day" (Score: 3)',
    description: 'PHQ-9 Item 9 — high-frequency suicidal ideation',
    level: 'critical',
    timestamp: '2026-04-05 09:45',
    practitioner: 'Dr. Meena Iyer',
    status: 'referred',
  },
  {
    id: 'ALR-008',
    client: 'Shalini Gupta',
    clientId: 'CLT-0008',
    instrument: 'GAD-7',
    item: 'Total Score',
    response: 'Total: 16 (Severe)',
    description: 'GAD-7 Severe anxiety range',
    level: 'high',
    timestamp: '2026-04-04 13:15',
    practitioner: 'Dr. Sanjay Kulkarni',
    status: 'acknowledged',
  },
];

const statusBadge = (status: AlertAction) => {
  switch (status) {
    case 'active': return { variant: 'destructive' as const, label: 'Active' };
    case 'acknowledged': return { variant: 'warning' as const, label: 'Acknowledged' };
    case 'referred': return { variant: 'info' as const, label: 'Referred' };
    case 'dismissed': return { variant: 'secondary' as const, label: 'Dismissed' };
  }
};

export default function RiskAlertsPage() {
  const [alerts, setAlerts] = useState(activeAlerts);

  const handleAction = (id: string, action: AlertAction) => {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, status: action } : a));
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Clinical</span>
          <span>/</span>
          <span className="text-foreground font-medium">Risk Alerts</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Risk Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor and respond to flagged clinical risk indicators across all active clients.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Alerts</p>
                <p className="text-2xl font-semibold mt-1">3</p>
                <p className="text-xs text-muted-foreground mt-1">Requires immediate attention</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Acknowledged Today</p>
                <p className="text-2xl font-semibold mt-1">5</p>
                <p className="text-xs text-muted-foreground mt-1">Reviewed by practitioner</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                <CheckCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved This Week</p>
                <p className="text-2xl font-semibold mt-1">12</p>
                <p className="text-xs text-muted-foreground mt-1">Referred or dismissed</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Alerts */}
      <div>
        <h2 className="text-base font-semibold mb-4">Active Alerts</h2>
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={cn(
                'border-l-4',
                alert.level === 'critical'
                  ? 'border-l-red-500'
                  : 'border-l-orange-500'
              )}
            >
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertTriangle className={cn(
                        'h-4 w-4 shrink-0',
                        alert.level === 'critical' ? 'text-red-600' : 'text-orange-600'
                      )} />
                      <span className="font-medium text-sm">{alert.description}</span>
                      <Badge
                        variant={alert.level === 'critical' ? 'destructive' : 'warning'}
                        appearance="light"
                        size="xs"
                      >
                        {alert.level === 'critical' ? 'Critical' : 'High'}
                      </Badge>
                      {alert.status !== 'active' && (
                        <Badge
                          variant={statusBadge(alert.status).variant}
                          appearance="light"
                          size="xs"
                        >
                          {statusBadge(alert.status).label}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-muted-foreground">
                      <div>
                        <span className="block font-medium text-foreground">{alert.client}</span>
                        <span>{alert.clientId}</span>
                      </div>
                      <div>
                        <span className="block font-medium text-foreground">{alert.instrument}</span>
                        <span>{alert.item}</span>
                      </div>
                      <div>
                        <span className="block font-medium text-foreground">Response</span>
                        <span>{alert.response}</span>
                      </div>
                      <div>
                        <span className="block font-medium text-foreground">{alert.practitioner}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{alert.timestamp}</span>
                      </div>
                    </div>
                  </div>
                  {alert.status === 'active' && (
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleAction(alert.id, 'acknowledged')}>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Acknowledge
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => handleAction(alert.id, 'referred')}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Refer
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleAction(alert.id, 'dismissed')}>
                        <XCircle className="h-3.5 w-3.5" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Alert History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Alert History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Alert ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Client</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Description</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Level</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Timestamp</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {alertHistory.map((alert) => {
                  const sb = statusBadge(alert.status);
                  return (
                    <tr key={alert.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs">{alert.id}</td>
                      <td className="px-5 py-3 font-medium">{alert.client}</td>
                      <td className="px-5 py-3">{alert.instrument}</td>
                      <td className="px-5 py-3 text-muted-foreground max-w-[250px] truncate">{alert.description}</td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={alert.level === 'critical' ? 'destructive' : 'warning'}
                          appearance="light"
                          size="sm"
                        >
                          {alert.level === 'critical' ? 'Critical' : 'High'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {alert.timestamp}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={sb.variant} appearance="light" size="sm">{sb.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
