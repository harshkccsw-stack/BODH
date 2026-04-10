'use client';

import { useState } from 'react';
import {
  Activity,
  Brain,
  Hand,
  MessageCircle,
  Users,
  Footprints,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DomainStatus = 'On Track' | 'Monitor' | 'Concern';

interface DomainData {
  domain: string;
  icon: React.ElementType;
  status: DomainStatus;
  percentile: number;
  lastChecked: string;
  notes: string;
}

interface MilestoneEvent {
  date: string;
  domain: string;
  milestone: string;
  status: 'Achieved' | 'Delayed' | 'Emerging';
}

interface StudentProfile {
  id: string;
  name: string;
  age: number;
  grade: string;
  domains: DomainData[];
  milestones: MilestoneEvent[];
}

const studentProfiles: StudentProfile[] = [
  {
    id: 'STU-001',
    name: 'Aarav Mehta',
    age: 8,
    grade: 'Class 3',
    domains: [
      { domain: 'Gross Motor', icon: Footprints, status: 'On Track', percentile: 72, lastChecked: '2026-04-01', notes: 'Age-appropriate motor skills' },
      { domain: 'Fine Motor', icon: Hand, status: 'On Track', percentile: 68, lastChecked: '2026-04-01', notes: 'Good pencil grip, adequate writing speed' },
      { domain: 'Language', icon: MessageCircle, status: 'Monitor', percentile: 40, lastChecked: '2026-03-28', notes: 'Expressive vocabulary slightly below peers' },
      { domain: 'Social', icon: Users, status: 'On Track', percentile: 65, lastChecked: '2026-03-28', notes: 'Good peer interactions' },
      { domain: 'Cognitive', icon: Brain, status: 'On Track', percentile: 78, lastChecked: '2026-04-01', notes: 'Strong reasoning and problem-solving' },
    ],
    milestones: [
      { date: '2026-04-01', domain: 'Cognitive', milestone: 'Abstract reasoning tasks completed at grade level', status: 'Achieved' },
      { date: '2026-03-28', domain: 'Language', milestone: 'Narrative retelling with 5+ sentences', status: 'Emerging' },
      { date: '2026-03-15', domain: 'Social', milestone: 'Cooperative play with rule-following', status: 'Achieved' },
      { date: '2026-03-10', domain: 'Fine Motor', milestone: 'Cursive writing legibility', status: 'Achieved' },
      { date: '2026-02-20', domain: 'Gross Motor', milestone: 'Ball-catching coordination', status: 'Achieved' },
    ],
  },
  {
    id: 'STU-003',
    name: 'Vihaan Reddy',
    age: 15,
    grade: 'Class 10',
    domains: [
      { domain: 'Gross Motor', icon: Footprints, status: 'On Track', percentile: 60, lastChecked: '2026-03-30', notes: 'Normal motor development' },
      { domain: 'Fine Motor', icon: Hand, status: 'On Track', percentile: 55, lastChecked: '2026-03-30', notes: 'Adequate dexterity' },
      { domain: 'Language', icon: MessageCircle, status: 'Concern', percentile: 25, lastChecked: '2026-03-25', notes: 'Written expression below expected level' },
      { domain: 'Social', icon: Users, status: 'Concern', percentile: 20, lastChecked: '2026-03-25', notes: 'Social withdrawal noted by teacher' },
      { domain: 'Cognitive', icon: Brain, status: 'Monitor', percentile: 42, lastChecked: '2026-03-30', notes: 'Attention difficulties affecting performance' },
    ],
    milestones: [
      { date: '2026-03-30', domain: 'Cognitive', milestone: 'Sustained attention task (15 min)', status: 'Delayed' },
      { date: '2026-03-25', domain: 'Social', milestone: 'Peer group participation', status: 'Delayed' },
      { date: '2026-03-20', domain: 'Language', milestone: 'Essay composition at grade level', status: 'Emerging' },
      { date: '2026-03-10', domain: 'Fine Motor', milestone: 'Typing speed 30+ WPM', status: 'Achieved' },
    ],
  },
  {
    id: 'STU-004',
    name: 'Ananya Gupta',
    age: 7,
    grade: 'Class 2',
    domains: [
      { domain: 'Gross Motor', icon: Footprints, status: 'On Track', percentile: 80, lastChecked: '2026-04-02', notes: 'Excellent balance and coordination' },
      { domain: 'Fine Motor', icon: Hand, status: 'On Track', percentile: 75, lastChecked: '2026-04-02', notes: 'Good scissor skills and drawing' },
      { domain: 'Language', icon: MessageCircle, status: 'On Track', percentile: 85, lastChecked: '2026-04-02', notes: 'Advanced vocabulary for age' },
      { domain: 'Social', icon: Users, status: 'On Track', percentile: 70, lastChecked: '2026-04-02', notes: 'Engages well in group activities' },
      { domain: 'Cognitive', icon: Brain, status: 'On Track', percentile: 82, lastChecked: '2026-04-02', notes: 'Strong pattern recognition' },
    ],
    milestones: [
      { date: '2026-04-02', domain: 'Cognitive', milestone: 'Number sequences up to 100', status: 'Achieved' },
      { date: '2026-04-02', domain: 'Language', milestone: 'Reading fluency at Class 3 level', status: 'Achieved' },
      { date: '2026-03-20', domain: 'Social', milestone: 'Turn-taking in conversations', status: 'Achieved' },
    ],
  },
];

const statusStyle = (status: DomainStatus) => {
  switch (status) {
    case 'On Track':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Monitor':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'Concern':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }
};

const milestoneStatusStyle = (status: string) => {
  switch (status) {
    case 'Achieved':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Emerging':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'Delayed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:
      return '';
  }
};

const progressBarColor = (status: DomainStatus) => {
  switch (status) {
    case 'On Track':
      return 'bg-green-500';
    case 'Monitor':
      return 'bg-yellow-500';
    case 'Concern':
      return 'bg-red-500';
  }
};

// Age-band comparison data (mock averages)
const ageBandComparison = [
  { domain: 'Gross Motor', studentPct: 0, ageBandAvg: 65 },
  { domain: 'Fine Motor', studentPct: 0, ageBandAvg: 60 },
  { domain: 'Language', studentPct: 0, ageBandAvg: 58 },
  { domain: 'Social', studentPct: 0, ageBandAvg: 62 },
  { domain: 'Cognitive', studentPct: 0, ageBandAvg: 64 },
];

export default function DevelopmentalTrackingPage() {
  const [selectedStudentId, setSelectedStudentId] = useState(studentProfiles[0].id);
  const selectedStudent = studentProfiles.find((s) => s.id === selectedStudentId) || studentProfiles[0];

  const comparisonData = ageBandComparison.map((item, i) => ({
    ...item,
    studentPct: selectedStudent.domains[i]?.percentile || 0,
  }));

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Counselling &amp; Child</span>
          <span>/</span>
          <span className="text-foreground font-medium">Developmental Tracking</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Developmental Tracking</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track developmental milestones and domain progress for individual students.
        </p>
      </div>

      {/* Student Selector */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-muted-foreground">Select Student:</label>
            <select
              className="h-8.5 rounded-md border border-input bg-background px-3 text-sm flex-1 max-w-sm"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              {studentProfiles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} - Age {s.age}, {s.grade}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              <span>Age: {selectedStudent.age} | {selectedStudent.grade}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Developmental Domains Grid */}
      <div>
        <h2 className="text-base font-semibold mb-4">Developmental Domains</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {selectedStudent.domains.map((domain) => {
            const Icon = domain.icon;
            return (
              <Card key={domain.domain}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusStyle(domain.status))}>
                      {domain.status}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{domain.domain}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{domain.notes}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Percentile</span>
                      <span className="font-medium">{domain.percentile}th</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', progressBarColor(domain.status))}
                        style={{ width: `${domain.percentile}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Checked: {domain.lastChecked}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Milestone Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Milestone Timeline</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="space-y-4">
            {selectedStudent.milestones.map((milestone, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full shrink-0',
                    milestone.status === 'Achieved' ? 'bg-green-100 dark:bg-green-900/30' :
                    milestone.status === 'Emerging' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    'bg-red-100 dark:bg-red-900/30'
                  )}>
                    {milestone.status === 'Achieved' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : milestone.status === 'Emerging' ? (
                      <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                  </div>
                  {i < selectedStudent.milestones.length - 1 && (
                    <div className="w-px h-6 bg-border mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{milestone.milestone}</p>
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', milestoneStatusStyle(milestone.status))}>
                      {milestone.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{milestone.domain}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {milestone.date}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Age-Band Comparison Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Age-Band Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-xs text-muted-foreground mb-4">
            Comparing {selectedStudent.name}&apos;s percentile scores against the average for the {selectedStudent.age <= 9 ? '6-9' : selectedStudent.age <= 13 ? '10-13' : '14-18'} age band.
          </p>
          <div className="space-y-4">
            {comparisonData.map((item) => (
              <div key={item.domain} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{item.domain}</span>
                  <span className="text-muted-foreground">Student: {item.studentPct}th | Avg: {item.ageBandAvg}th</span>
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 space-y-1">
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.studentPct}%` }} />
                    </div>
                    <div className="h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-muted-foreground/30 transition-all" style={{ width: `${item.ageBandAvg}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary inline-block" /> Student</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30 inline-block" /> Age-Band Avg</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
