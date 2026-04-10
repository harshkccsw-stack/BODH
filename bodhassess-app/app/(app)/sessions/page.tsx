'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Plus,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, InputWrapper } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type SessionStatus = 'Active' | 'Completed' | 'Pending Review';
type Vertical = 'Clinical' | 'Industrial' | 'Counselling' | 'Experiments';

interface Session {
  id: string;
  respondent: string;
  instrument: string;
  vertical: Vertical;
  language: string;
  status: SessionStatus;
  score: string;
  createdAt: string;
}

const mockSessions: Session[] = [
  { id: 'SESS-0047', respondent: 'Arjun Patel', instrument: 'PHQ-9', vertical: 'Clinical', language: 'Hindi', status: 'Completed', score: 'T=62', createdAt: '2026-04-09' },
  { id: 'SESS-0046', respondent: 'Priya Sharma', instrument: 'GAD-7', vertical: 'Clinical', language: 'English', status: 'Active', score: '--', createdAt: '2026-04-09' },
  { id: 'SESS-0045', respondent: 'Rahul Verma', instrument: 'DASS-21', vertical: 'Clinical', language: 'English', status: 'Completed', score: 'T=55', createdAt: '2026-04-08' },
  { id: 'SESS-0044', respondent: 'Ananya Reddy', instrument: 'Beck BDI-II', vertical: 'Clinical', language: 'Telugu', status: 'Pending Review', score: 'T=71', createdAt: '2026-04-08' },
  { id: 'SESS-0043', respondent: 'Vikram Singh', instrument: 'Big Five IPIP-NEO', vertical: 'Industrial', language: 'English', status: 'Completed', score: 'Profile Ready', createdAt: '2026-04-07' },
  { id: 'SESS-0042', respondent: 'Meera Nair', instrument: 'HEXACO', vertical: 'Industrial', language: 'Malayalam', status: 'Active', score: '--', createdAt: '2026-04-07' },
  { id: 'SESS-0041', respondent: 'Karthik Iyer', instrument: 'SCAS', vertical: 'Counselling', language: 'Tamil', status: 'Completed', score: 'T=48', createdAt: '2026-04-06' },
  { id: 'SESS-0040', respondent: 'Shreya Gupta', instrument: 'CDI-2', vertical: 'Counselling', language: 'Hindi', status: 'Pending Review', score: 'T=64', createdAt: '2026-04-06' },
  { id: 'SESS-0039', respondent: 'Aditya Joshi', instrument: 'Learning Agility', vertical: 'Industrial', language: 'English', status: 'Completed', score: 'T=59', createdAt: '2026-04-05' },
  { id: 'SESS-0038', respondent: 'Neha Kulkarni', instrument: 'AI Adaptability Index', vertical: 'Experiments', language: 'Marathi', status: 'Active', score: '--', createdAt: '2026-04-05' },
  { id: 'SESS-0037', respondent: 'Rohan Deshmukh', instrument: 'PHQ-9', vertical: 'Clinical', language: 'English', status: 'Completed', score: 'T=44', createdAt: '2026-04-04' },
  { id: 'SESS-0036', respondent: 'Divya Menon', instrument: 'GAD-7', vertical: 'Clinical', language: 'Kannada', status: 'Completed', score: 'T=52', createdAt: '2026-04-04' },
];

const statusBadgeProps: Record<SessionStatus, { variant: 'success' | 'primary' | 'warning'; appearance: 'light' }> = {
  'Completed': { variant: 'success', appearance: 'light' },
  'Active': { variant: 'primary', appearance: 'light' },
  'Pending Review': { variant: 'warning', appearance: 'light' },
};

const verticalBadgeProps: Record<Vertical, { variant: 'info' | 'secondary' | 'primary' | 'warning'; appearance: 'outline' }> = {
  'Clinical': { variant: 'info', appearance: 'outline' },
  'Industrial': { variant: 'secondary', appearance: 'outline' },
  'Counselling': { variant: 'primary', appearance: 'outline' },
  'Experiments': { variant: 'warning', appearance: 'outline' },
};

export default function SessionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verticalFilter, setVerticalFilter] = useState('all');

  const filteredSessions = mockSessions.filter((session) => {
    const matchesSearch =
      searchQuery === '' ||
      session.respondent.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.instrument.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    const matchesVertical = verticalFilter === 'all' || session.vertical === verticalFilter;
    return matchesSearch && matchesStatus && matchesVertical;
  });

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>BodhAssess</span>
            <span>/</span>
            <span className="text-foreground font-medium">Sessions</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage assessment sessions, track progress, and view reports.
          </p>
        </div>
        <Button variant="primary" size="md">
          <Plus className="size-4" />
          Create Session
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <InputWrapper variant="md" className="w-full sm:w-72">
              <Search className="size-4" />
              <Input
                placeholder="Search sessions, respondents, instruments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </InputWrapper>

            <div className="flex items-center gap-3 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" size="md">
                  <Filter className="size-3.5 opacity-60" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Pending Review">Pending Review</SelectItem>
                </SelectContent>
              </Select>

              <Select value={verticalFilter} onValueChange={setVerticalFilter}>
                <SelectTrigger className="w-40" size="md">
                  <SelectValue placeholder="Vertical" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Verticals</SelectItem>
                  <SelectItem value="Clinical">Clinical</SelectItem>
                  <SelectItem value="Industrial">Industrial</SelectItem>
                  <SelectItem value="Counselling">Counselling</SelectItem>
                  <SelectItem value="Experiments">Experiments</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="date"
                variant="md"
                className="w-40"
                defaultValue="2026-04-01"
              />
              <span className="text-muted-foreground text-sm">to</span>
              <Input
                type="date"
                variant="md"
                className="w-40"
                defaultValue="2026-04-09"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Sessions</CardTitle>
            <span className="text-sm text-muted-foreground">
              Showing {filteredSessions.length} of 47 sessions
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Session ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Respondent</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Instrument</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Language</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Score</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr
                    key={session.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs">{session.id}</td>
                    <td className="px-5 py-3 font-medium">{session.respondent}</td>
                    <td className="px-5 py-3">{session.instrument}</td>
                    <td className="px-5 py-3">
                      <Badge size="sm" shape="circle" {...verticalBadgeProps[session.vertical]}>
                        {session.vertical}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{session.language}</td>
                    <td className="px-5 py-3">
                      <Badge size="sm" shape="circle" {...statusBadgeProps[session.status]}>
                        {session.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{session.score}</td>
                    <td className="px-5 py-3 text-muted-foreground">{session.createdAt}</td>
                    <td className="px-5 py-3">
                      <Button variant="ghost" size="sm" mode="default">
                        <Eye className="size-3.5" />
                        View Report
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredSessions.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">
                      No sessions found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing 1-{Math.min(filteredSessions.length, 10)} of 47 sessions
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" mode="icon" disabled>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="primary" size="sm" className="min-w-7">1</Button>
          <Button variant="outline" size="sm" className="min-w-7">2</Button>
          <Button variant="outline" size="sm" className="min-w-7">3</Button>
          <Button variant="outline" size="sm" className="min-w-7">4</Button>
          <Button variant="outline" size="sm" className="min-w-7">5</Button>
          <Button variant="outline" size="sm" mode="icon">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
