'use client';

import { useEffect, useState } from 'react';
import { Brain, LogIn, AlertTriangle, ShieldCheck, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { adminApi, practitionersApi } from '@/lib/api';
import { usePractitionerAuth } from '@/lib/practitioner-auth';
import { getAdminToken, getPractitionerToken } from '@/lib/practitioner-auth-utils';
import { useRouter } from '@/src/lib/router-helpers';

type Mode = 'practitioner' | 'admin';

export default function LoginPage() {
  const router = useRouter();
  const { loginAsPractitioner, loginAsAdmin } = usePractitionerAuth();

  const [mode, setMode] = useState<Mode>('practitioner');

  // Practitioner fields
  const [loginId, setLoginId] = useState('');
  const [dob, setDob] = useState('');

  // Admin fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If a stored token already validates, skip the form. Try practitioner
  // first, then admin — either lands the user in /dashboard via the
  // react-router push, no full-page reload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ptoken = getPractitionerToken();
      if (ptoken) {
        try {
          const me = await practitionersApi.me(ptoken);
          if (!cancelled) {
            loginAsPractitioner(ptoken, me);
            router.replace('/dashboard');
          }
          return;
        } catch { /* stale token — fall through */ }
      }
      const atoken = getAdminToken();
      if (atoken) {
        try {
          const info = await adminApi.me(atoken);
          if (!cancelled) {
            loginAsAdmin(atoken, info.username);
            router.replace('/dashboard');
          }
          return;
        } catch { /* stale token — leave on form */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'practitioner') {
        const id = loginId.trim().toUpperCase();
        const pwd = dob.trim();
        if (!id || !pwd) {
          setError('Enter your Practitioner ID and Date of Birth.');
          setLoading(false);
          return;
        }
        const res = await practitionersApi.login(id, pwd);
        loginAsPractitioner(res.token, res.practitioner);
      } else {
        const u = username.trim();
        const p = password;
        if (!u || !p) {
          setError('Enter the admin username and password.');
          setLoading(false);
          return;
        }
        const res = await adminApi.login(u, p);
        loginAsAdmin(res.token, res.admin.username);
      }
      // Soft navigation — the auth context already has the new identity.
      router.replace('/dashboard');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401')) {
        setError(mode === 'admin'
          ? 'Invalid admin username or password.'
          : 'Invalid Practitioner ID or Date of Birth.');
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
          <h1 className="text-2xl font-semibold tracking-tight">
            BodhAssess {mode === 'admin' ? 'Admin' : 'Practitioner'} Login
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'admin'
              ? 'Sign in with your administrator credentials.'
              : 'Sign in to access your dashboard.'}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mode toggle */}
            <div role="tablist" aria-label="Login mode" className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 mb-4">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'practitioner'}
                onClick={() => switchMode('practitioner')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'practitioner'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <User className="h-3.5 w-3.5" />
                Practitioner
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'admin'}
                onClick={() => switchMode('admin')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === 'admin'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {mode === 'practitioner' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Practitioner ID</label>
                    <input
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="e.g., P-001"
                      autoComplete="username"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Date of Birth (password)</label>
                    <input
                      type="date"
                      value={dob}
                      onChange={(e) => setDob(e.target.value)}
                      autoComplete="current-password"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Username</label>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      autoComplete="username"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </>
              )}

              <Button type="submit" variant="primary" size="md" className="w-full" disabled={loading}>
                <LogIn className="h-4 w-4" />
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {mode === 'practitioner'
            ? 'Your Practitioner ID and password (date of birth) were set up by your administrator.'
            : 'Admin credentials are configured server-side via environment variables.'}
        </p>
      </div>
    </div>
  );
}
