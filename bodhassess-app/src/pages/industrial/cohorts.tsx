import {
  Users,
  Plus,
  Download,
  Calendar,
  ClipboardCheck,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const cohorts = [
  {
    id: 'COH-001',
    name: 'Q1 2026 Campus Hiring — IIT Delhi',
    candidateCount: 128,
    instruments: ['Big Five (IPIP-NEO)', 'Cognitive Ability Test', 'AI Adaptability Index'],
    completionRate: 78,
    dateRange: 'Jan 15 – Mar 30, 2026',
    status: 'Active',
    candidates: [
      { name: 'Arjun Mehta', email: 'arjun.mehta@iitd.ac.in', status: 'Completed', score: 82, roleFit: 91, rank: 1 },
      { name: 'Sneha Kapoor', email: 'sneha.k@iitd.ac.in', status: 'Completed', score: 79, roleFit: 87, rank: 2 },
      { name: 'Rahul Joshi', email: 'rahul.j@iitd.ac.in', status: 'In Progress', score: 0, roleFit: 0, rank: 0 },
      { name: 'Priya Nair', email: 'priya.n@iitd.ac.in', status: 'Completed', score: 76, roleFit: 84, rank: 3 },
      { name: 'Vikram Sinha', email: 'vikram.s@iitd.ac.in', status: 'Pending', score: 0, roleFit: 0, rank: 0 },
    ],
  },
  {
    id: 'COH-002',
    name: 'Leadership Pipeline — Senior Managers',
    candidateCount: 42,
    instruments: ['HEXACO-PI-R', 'Emotional Intelligence Scale', 'Leadership Potential Index'],
    completionRate: 95,
    dateRange: 'Feb 1 – Feb 28, 2026',
    status: 'Completed',
    candidates: [
      { name: 'Deepak Sharma', email: 'deepak.s@corp.in', status: 'Completed', score: 88, roleFit: 94, rank: 1 },
      { name: 'Kavita Reddy', email: 'kavita.r@corp.in', status: 'Completed', score: 85, roleFit: 92, rank: 2 },
      { name: 'Anil Gupta', email: 'anil.g@corp.in', status: 'Completed', score: 83, roleFit: 89, rank: 3 },
      { name: 'Meera Iyer', email: 'meera.i@corp.in', status: 'Completed', score: 80, roleFit: 86, rank: 4 },
      { name: 'Suresh Patel', email: 'suresh.p@corp.in', status: 'Completed', score: 78, roleFit: 83, rank: 5 },
    ],
  },
  {
    id: 'COH-003',
    name: 'Lateral Hiring — Product Engineering',
    candidateCount: 67,
    instruments: ['Cognitive Ability Test', 'Work Personality Index', 'AI Adaptability Index'],
    completionRate: 52,
    dateRange: 'Mar 10 – Apr 30, 2026',
    status: 'Active',
    candidates: [
      { name: 'Rohan Das', email: 'rohan.d@gmail.com', status: 'Completed', score: 91, roleFit: 96, rank: 1 },
      { name: 'Anita Verma', email: 'anita.v@gmail.com', status: 'In Progress', score: 0, roleFit: 0, rank: 0 },
      { name: 'Karthik Rao', email: 'karthik.r@gmail.com', status: 'Completed', score: 74, roleFit: 80, rank: 2 },
      { name: 'Sonal Mishra', email: 'sonal.m@gmail.com', status: 'Pending', score: 0, roleFit: 0, rank: 0 },
      { name: 'Amit Bose', email: 'amit.b@gmail.com', status: 'Completed', score: 70, roleFit: 77, rank: 3 },
    ],
  },
];

export default function CandidateCohortsPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Industrial</span>
          <span>/</span>
          <span className="text-foreground font-medium">Candidate Cohorts</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Candidate Cohorts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage assessment cohorts, track completion, and export candidate rankings.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export Rankings
            </Button>
            <Button variant="primary" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Cohort
            </Button>
          </div>
        </div>
      </div>

      {/* Cohort Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {cohorts.map((cohort) => (
          <Card key={cohort.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold leading-snug">
                  {cohort.name}
                </CardTitle>
                <Badge
                  variant={cohort.status === 'Active' ? 'primary' : 'secondary'}
                >
                  {cohort.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {cohort.candidateCount} candidates
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {cohort.dateRange}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cohort.instruments.map((inst) => (
                  <Badge key={inst} variant="outline" className="text-xs">
                    {inst}
                  </Badge>
                ))}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Completion</span>
                  <span className="font-medium">{cohort.completionRate}%</span>
                </div>
                <Progress value={cohort.completionRate} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Candidate Tables per Cohort */}
      {cohorts.map((cohort) => (
        <Card key={cohort.id + '-table'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                {cohort.name}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{cohort.id}</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Score</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Role Fit %</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {cohort.candidates.map((c) => (
                    <tr
                      key={c.email}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium">{c.name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{c.email}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.status === 'Completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : c.status === 'In Progress'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {c.score > 0 ? c.score : '--'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {c.roleFit > 0 ? `${c.roleFit}%` : '--'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {c.rank > 0 ? `#${c.rank}` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
