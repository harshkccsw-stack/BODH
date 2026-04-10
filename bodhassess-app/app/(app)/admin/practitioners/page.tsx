'use client';

import { Users, Plus, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const practitioners = [
  { name: 'Dr. Meera Krishnan', email: 'meera.k@apollo.in', role: 'Senior Practitioner', verticals: ['Clinical', 'Counselling'], status: 'Active', lastLogin: '2026-04-09 09:15' },
  { name: 'Dr. Rajesh Iyer', email: 'rajesh.i@stmarys.edu', role: 'Practitioner', verticals: ['Counselling'], status: 'Active', lastLogin: '2026-04-08 14:30' },
  { name: 'Kavitha Nair', email: 'kavitha.n@infosys.com', role: 'HR Professional', verticals: ['Industrial'], status: 'Active', lastLogin: '2026-04-09 11:00' },
  { name: 'Dr. Arun Mehta', email: 'arun.m@mindmetrics.in', role: 'Platform Admin', verticals: ['Clinical', 'Industrial', 'Counselling'], status: 'Active', lastLogin: '2026-04-09 08:45' },
  { name: 'Sneha Gupta', email: 'sneha.g@apollo.in', role: 'Practitioner', verticals: ['Clinical'], status: 'Inactive', lastLogin: '2026-03-20 16:22' },
  { name: 'Prof. Venkat Rao', email: 'venkat.r@university.edu', role: 'Researcher', verticals: ['Experiments'], status: 'Active', lastLogin: '2026-04-07 10:10' },
];

const statusColors: Record<string, string> = {
  Active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function PractitionersPage() {
  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Admin</span>
          <span>/</span>
          <span className="text-foreground font-medium">Practitioners</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Practitioners</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage practitioners, clinicians, and HR professionals.</p>
          </div>
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Add Practitioner
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Practitioners</p>
                <p className="text-2xl font-semibold mt-1">6</p>
                <p className="text-xs text-muted-foreground mt-1">5 active</p>
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
                <p className="text-sm text-muted-foreground">Last Login Activity</p>
                <p className="text-2xl font-semibold mt-1">Today</p>
                <p className="text-xs text-muted-foreground mt-1">3 practitioners logged in</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Practitioners</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Role</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Vertical Access</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {practitioners.map((p) => (
                  <tr key={p.email} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{p.email}</td>
                    <td className="px-5 py-3">{p.role}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {p.verticals.map((v) => (
                          <span key={v} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {v}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[p.status]}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {p.lastLogin}
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
