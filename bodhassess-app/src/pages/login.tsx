'use client';

import { useState } from 'react';
import { Brain, LogIn, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api';
import { config } from '@/lib/config';
import { usePractitionerAuth } from '@/lib/practitioner-auth';
import { useRouter } from '@/lib/router-helpers';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';

// Session restore for a stored token lives in PractitionerAuthProvider (it
// resolves /auth/me once on mount and bounces authenticated visitors off
// /login) — this page deliberately makes no identity call of its own.
export default function LoginPage() {
  const router = useRouter();
  const { login } = usePractitionerAuth();

  const [identifier, setIdentifier] = useState('');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const id = identifier.trim();
      if (!id || !dob) {
        setError('Enter your email and date of birth.');
        setLoading(false);
        return;
      }
      const isoDob = ddmmyyyyToIso(dob);
      if (!isoDob) {
        setError('Date of birth must be in DD/MM/YYYY format.');
        setLoading(false);
        return;
      }
      // Unified login against the single User identity table via /auth.
      const res = await authApi.login(id, isoDob);
      // This app is the admin + practitioner surface; the server decides
      // whether the identity belongs here. Respondent-only accounts sign in
      // at the assessment portal, which is its own frontend.
      if (res.user?.dashboardAccess) {
        login(res.token, res.user);
        router.replace('/dashboard');
      } else {
        // Authenticated, but not a dashboard account — their surface is the
        // assessment portal, which is now a separate app (config.portalUrl).
        localStorage.setItem(config.authStorageKey, res.token);
        window.location.href = `${config.portalUrl}/portal/assessment`;
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401')) {
        setError('Invalid email/phone or date of birth.');
      } else if (msg.includes('403')) {
        // Server-side gate: dashboard tokens are only issued to practitioner
        // (or superadmin) accounts — respondent-only accounts belong to the
        // assessment portal.
        setError(msg.includes('disabled')
          ? 'This account is disabled.'
          : 'Only practitioner accounts can sign in to the dashboard.');
      } else {
        setError('Login failed — the API may be unreachable.');
      }
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
          <h1 className="text-2xl font-semibold tracking-tight">BodhAssess Login</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access your dashboard.
          </p>
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
                <label className="text-sm font-medium">Email or Phone</label>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@example.com or +91 98765 43210"
                  autoComplete="username"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date of Birth (password)</label>
                <input
                  inputMode="numeric"
                  value={dob}
                  onChange={(e) => setDob(autoFormatDdmmyyyy(e.target.value))}
                  placeholder="DD/MM/YYYY"
                  autoComplete="current-password"
                  maxLength={10}
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
          Use the email or phone your administrator recorded. Your date of birth is your password.
        </p>
      </div>
    </div>
  );
}
