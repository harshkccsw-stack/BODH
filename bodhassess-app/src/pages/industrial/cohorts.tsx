import {
  Users,
  Plus,
  Download,
  Calendar,
  ClipboardCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface CohortCandidate {
  name: string;
  email: string;
  status: string;
  score: number;
  roleFit: number;
  rank: number;
}

interface Cohort {
  id: string;
  name: string;
  candidateCount: number;
  instruments: string[];
  completionRate: number;
  dateRange: string;
  status: string;
  candidates: CohortCandidate[];
}

const cohorts: Cohort[] = [];

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
        {cohorts.length === 0 && (
          <Card className="lg:col-span-3">
            <CardContent className="p-10 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">No cohorts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a cohort to start tracking candidate assessments.
              </p>
            </CardContent>
          </Card>
        )}
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
