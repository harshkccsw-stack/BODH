import { useState } from 'react';
import {
  ShieldCheck,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ConsentStatus = 'Pending' | 'Granted' | 'Withdrawn';
type ConsentType = 'Assessment' | 'Data Storage' | 'Research';
type ConsentMethod = 'WhatsApp' | 'Email' | 'In-person';

interface ConsentRecord {
  id: string;
  studentName: string;
  parentName: string;
  consentType: ConsentType;
  status: ConsentStatus;
  date: string;
  method: ConsentMethod;
}

const consentRecords: ConsentRecord[] = [
  { id: 'CON-001', studentName: 'Aarav Mehta', parentName: 'Sunita Mehta', consentType: 'Assessment', status: 'Granted', date: '2026-04-01', method: 'WhatsApp' },
  { id: 'CON-002', studentName: 'Ishita Sharma', parentName: 'Rajesh Sharma', consentType: 'Data Storage', status: 'Granted', date: '2026-03-28', method: 'Email' },
  { id: 'CON-003', studentName: 'Vihaan Reddy', parentName: 'Lakshmi Reddy', consentType: 'Research', status: 'Pending', date: '2026-04-05', method: 'WhatsApp' },
  { id: 'CON-004', studentName: 'Ananya Gupta', parentName: 'Priya Gupta', consentType: 'Assessment', status: 'Granted', date: '2026-03-20', method: 'In-person' },
  { id: 'CON-005', studentName: 'Kabir Singh', parentName: 'Harpreet Singh', consentType: 'Data Storage', status: 'Withdrawn', date: '2026-04-03', method: 'Email' },
  { id: 'CON-006', studentName: 'Diya Patel', parentName: 'Meena Patel', consentType: 'Assessment', status: 'Pending', date: '2026-04-07', method: 'WhatsApp' },
  { id: 'CON-007', studentName: 'Reyansh Joshi', parentName: 'Amit Joshi', consentType: 'Research', status: 'Granted', date: '2026-03-15', method: 'In-person' },
  { id: 'CON-008', studentName: 'Saanvi Krishnan', parentName: 'Deepa Krishnan', consentType: 'Data Storage', status: 'Pending', date: '2026-04-08', method: 'Email' },
];

const statusStyle = (status: ConsentStatus) => {
  switch (status) {
    case 'Granted':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'Withdrawn':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
};

const statusIcon = (status: ConsentStatus) => {
  switch (status) {
    case 'Granted':
      return <CheckCircle2 className="h-3 w-3" />;
    case 'Pending':
      return <Clock className="h-3 w-3" />;
    case 'Withdrawn':
      return <XCircle className="h-3 w-3" />;
  }
};

const consentTypeStyle = (type: ConsentType) => {
  switch (type) {
    case 'Assessment':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'Data Storage':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'Research':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  }
};

const methodStyle = (method: ConsentMethod) => {
  switch (method) {
    case 'WhatsApp':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Email':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'In-person':
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400';
  }
};

export default function ConsentPage() {
  const granted = consentRecords.filter((r) => r.status === 'Granted').length;
  const pending = consentRecords.filter((r) => r.status === 'Pending').length;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Counselling &amp; Child</span>
          <span>/</span>
          <span className="text-foreground font-medium">Parent Consent</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Parent Consent</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage parental consent records for assessments, data storage, and research participation.
            </p>
          </div>
          <Button variant="primary" size="sm">
            <Send className="h-4 w-4" />
            Send Consent Request
          </Button>
        </div>
      </div>

      {/* DPDP Notice */}
      <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10 shrink-0">
              <ShieldCheck className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-yellow-800 dark:text-yellow-300">DPDP Act 2023 Compliance</p>
              <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                Parental consent is mandatory for all assessments of minors under the Digital Personal Data Protection (DPDP) Act 2023.
                All consent records must be verifiable, time-stamped, and withdrawable at any time. Data processing of children&apos;s
                information without valid parental consent is a punishable offence.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Consent Granted</p>
                <p className="text-2xl font-semibold mt-1">{granted}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Requests</p>
                <p className="text-2xl font-semibold mt-1">{pending}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-500/10">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Records</p>
                <p className="text-2xl font-semibold mt-1">{consentRecords.length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Consent Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Student Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Parent Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Consent Type</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Method</th>
                </tr>
              </thead>
              <tbody>
                {consentRecords.map((record) => (
                  <tr key={record.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{record.studentName}</td>
                    <td className="px-5 py-3">{record.parentName}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', consentTypeStyle(record.consentType))}>
                        {record.consentType}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', statusStyle(record.status))}>
                        {statusIcon(record.status)}
                        {record.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{record.date}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', methodStyle(record.method))}>
                        {record.method}
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
