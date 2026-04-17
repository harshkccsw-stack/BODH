'use client';

import { useState } from 'react';
import { Brain, LogIn, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StoredRespondent {
  id: string;
  name: string;
  email: string;
  dob: string;
}

const RESPONDENT_KEY = 'bodhassess.respondents';
const AUTH_KEY = 'bodhassess.auth.respondent';

export default function PortalLoginPage() {
  const [loginId, setLoginId] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    const id = loginId.trim().toUpperCase();
    const password = dob.trim();
    if (!id || !password) {
      setError('Enter your Login ID and Date of Birth.');
      return;
    }
    setLoading(true);
    try {
      const raw = localStorage.getItem(RESPONDENT_KEY);
      const list: StoredRespondent[] = raw ? JSON.parse(raw) : [];
      const match = list.find((r) => r.id.toUpperCase() === id && r.dob === password);
      if (!match) {
        setError('Login failed. Check your Login ID and Date of Birth.');
        setLoading(false);
        return;
      }
      sessionStorage.setItem(AUTH_KEY, JSON.stringify({ id: match.id, name: match.name, email: match.email }));
      window.location.href = '/portal/assessments';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">BodhAssess Respondent Portal</h1>
          <p className="text-sm text-muted-foreground">Sign in to take your assigned assessments.</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Login ID</label>
                <input
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="e.g., R-007"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date of Birth (password)</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <Button type="submit" variant="primary" size="md" className="w-full" disabled={loading}>
                <LogIn className="h-4 w-4" />
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Your Login ID and password (date of birth) were shared by your assessment administrator.
        </p>
      </div>
    </div>
  );
}
