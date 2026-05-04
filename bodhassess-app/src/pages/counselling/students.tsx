import { useState } from 'react';
import {
  Search,
  Filter,
  Users,
  GraduationCap,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Student {
  id: string;
  name: string;
  age: number;
  grade: string;
  school: string;
  parentGuardian: string;
  lastAssessment: string;
  activeSessions: number;
  status: 'On Track' | 'Monitor' | 'Concern';
}

const students: Student[] = [
  { id: 'STU-001', name: 'Aarav Mehta', age: 8, grade: 'Class 3', school: 'DPS Noida', parentGuardian: 'Sunita Mehta', lastAssessment: '2 days ago', activeSessions: 2, status: 'On Track' },
  { id: 'STU-002', name: 'Ishita Sharma', age: 12, grade: 'Class 7', school: 'Ryan International', parentGuardian: 'Rajesh Sharma', lastAssessment: '1 week ago', activeSessions: 1, status: 'Monitor' },
  { id: 'STU-003', name: 'Vihaan Reddy', age: 15, grade: 'Class 10', school: 'Kendriya Vidyalaya', parentGuardian: 'Lakshmi Reddy', lastAssessment: '3 days ago', activeSessions: 3, status: 'Concern' },
  { id: 'STU-004', name: 'Ananya Gupta', age: 7, grade: 'Class 2', school: 'The Shri Ram School', parentGuardian: 'Priya Gupta', lastAssessment: '5 days ago', activeSessions: 1, status: 'On Track' },
  { id: 'STU-005', name: 'Kabir Singh', age: 10, grade: 'Class 5', school: 'DPS Noida', parentGuardian: 'Harpreet Singh', lastAssessment: '1 day ago', activeSessions: 2, status: 'On Track' },
  { id: 'STU-006', name: 'Diya Patel', age: 14, grade: 'Class 9', school: 'Sanskriti School', parentGuardian: 'Meena Patel', lastAssessment: '4 days ago', activeSessions: 1, status: 'Monitor' },
  { id: 'STU-007', name: 'Reyansh Joshi', age: 9, grade: 'Class 4', school: 'Ryan International', parentGuardian: 'Amit Joshi', lastAssessment: '6 days ago', activeSessions: 0, status: 'On Track' },
  { id: 'STU-008', name: 'Saanvi Krishnan', age: 16, grade: 'Class 11', school: 'Kendriya Vidyalaya', parentGuardian: 'Deepa Krishnan', lastAssessment: '2 weeks ago', activeSessions: 2, status: 'Concern' },
];

const ageBands = [
  { label: 'All Ages', value: 'all' },
  { label: '6-9 years', value: '6-9' },
  { label: '10-13 years', value: '10-13' },
  { label: '14-18 years', value: '14-18' },
];

const schools = ['All Schools', 'DPS Noida', 'Ryan International', 'Kendriya Vidyalaya', 'The Shri Ram School', 'Sanskriti School'];

const statusStyle = (status: string) => {
  switch (status) {
    case 'On Track':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'Monitor':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'Concern':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    default:
      return '';
  }
};

export default function StudentRecordsPage() {
  const [search, setSearch] = useState('');
  const [ageBand, setAgeBand] = useState('all');
  const [school, setSchool] = useState('All Schools');

  const filtered = students.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.id.toLowerCase().includes(search.toLowerCase());
    const matchesAge =
      ageBand === 'all' ||
      (ageBand === '6-9' && s.age >= 6 && s.age <= 9) ||
      (ageBand === '10-13' && s.age >= 10 && s.age <= 13) ||
      (ageBand === '14-18' && s.age >= 14 && s.age <= 18);
    const matchesSchool = school === 'All Schools' || s.school === school;
    return matchesSearch && matchesAge && matchesSchool;
  });

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Counselling &amp; Child</span>
          <span>/</span>
          <span className="text-foreground font-medium">Student Records</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Student Records</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage and view all student profiles, assessment history, and developmental status.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Students</p>
                <p className="text-2xl font-semibold mt-1">{students.length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Assessments</p>
                <p className="text-2xl font-semibold mt-1">{students.reduce((a, s) => a + s.activeSessions, 0)}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Needing Attention</p>
                <p className="text-2xl font-semibold mt-1">{students.filter((s) => s.status === 'Concern').length}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-500/10">
                <Clock className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {ageBands.map((band) => (
                <Button
                  key={band.value}
                  variant={ageBand === band.value ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setAgeBand(band.value)}
                >
                  {band.label}
                </Button>
              ))}
            </div>
            <select
              className="h-7 rounded-md border border-input bg-background px-2.5 text-xs"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
            >
              {schools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Students ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Student ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Age</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Class/Grade</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">School</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Parent/Guardian</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Assessment</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Active Assessments</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Dev. Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => (
                  <tr key={student.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs">{student.id}</td>
                    <td className="px-5 py-3 font-medium">{student.name}</td>
                    <td className="px-5 py-3">{student.age}</td>
                    <td className="px-5 py-3">{student.grade}</td>
                    <td className="px-5 py-3">{student.school}</td>
                    <td className="px-5 py-3">{student.parentGuardian}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {student.lastAssessment}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">{student.activeSessions}</td>
                    <td className="px-5 py-3">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', statusStyle(student.status))}>
                        {student.status}
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
