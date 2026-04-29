'use client';

import { useEffect, useState } from 'react';
import { Brain, LogIn, AlertTriangle, UserPlus, CheckCircle2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { practitionersApi } from '@/lib/api';
import { getPractitionerToken, setPractitionerToken } from '@/lib/practitioner-auth';

type Mode = 'login' | 'signup';

interface SignupSuccess {
  pid: string;
  dobPassword: string; // DDMMYYYY
}

function formatDobAsPassword(dobIso: string): string {
  // Convert YYYY-MM-DD → DDMMYYYY for display.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobIso);
  if (!m) return dobIso;
  return `${m[3]}${m[2]}${m[1]}`;
}

export default function PractitionerLoginPage() {
  const [mode, setMode] = useState<Mode>('login');

  // Login state
  const [loginId, setLoginId] = useState('');
  const [loginDob, setLoginDob] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginPending, setLoginPending] = useState(false); // awaiting-approval message
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [signupDob, setSignupDob] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState<SignupSuccess | null>(null);
  const [copied, setCopied] = useState(false);

  // If a session token already validates, skip the form and go to the dashboard.
  useEffect(() => {
    const token = getPractitionerToken();
    if (!token) return;
    practitionersApi.me(token)
      .then(() => { window.location.href = '/dashboard'; })
      .catch(() => { /* stale token — leave them on the login form */ });
  }, []);

  const submitLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoginError('');
    setLoginPending(false);
    const id = loginId.trim().toUpperCase();
    const password = loginDob.trim();
    if (!id || !password) {
      setLoginError('Enter your Practitioner ID and Date of Birth.');
      return;
    }
    setLoginLoading(true);
    try {
      const res = await practitionersApi.login(id, password);
      setPractitionerToken(res.token);
      window.location.href = '/dashboard';
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('403') && msg.toLowerCase().includes('awaiting')) {
        setLoginPending(true);
      } else if (msg.includes('403')) {
        setLoginError('Your account is inactive. Contact your administrator.');
      } else if (msg.includes('401')) {
        setLoginError('Invalid Practitioner ID or Date of Birth.');
      } else {
        setLoginError('Login failed — the API may be unreachable.');
      }
      setLoginLoading(false);
    }
  };

  const submitSignup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSignupError('');
    const n = name.trim();
    const em = email.trim();
    const d = signupDob.trim();
    if (!n || !em || !d) {
      setSignupError('Name, email, and date of birth are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setSignupError('Enter a valid email address.');
      return;
    }
    setSignupLoading(true);
    try {
      const res = await practitionersApi.signup(n, em, d);
      setSignupSuccess({ pid: res.id, dobPassword: formatDobAsPassword(res.dob || d) });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('409')) setSignupError('An account with this email already exists.');
      else setSignupError('Signup failed — the API may be unreachable.');
      setSignupLoading(false);
      return;
    }
    setSignupLoading(false);
  };

  const copyCredentials = async () => {
    if (!signupSuccess) return;
    const text = `PID: ${signupSuccess.pid}\nPassword: ${signupSuccess.dobPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const goToLogin = () => {
    if (signupSuccess) {
      setLoginId(signupSuccess.pid);
    }
    setSignupSuccess(null);
    setName('');
    setEmail('');
    setSignupDob('');
    setSignupError('');
    setMode('login');
  };

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">BodhAssess Practitioner Portal</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Sign in to access your dashboard.' : 'Create a new practitioner account.'}
          </p>
        </div>

        {/* Tab toggle (hidden once signup succeeds — confirmation card takes over) */}
        {!signupSuccess && (
          <div className="grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'login' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'signup' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Sign Up
            </button>
          </div>
        )}

        {signupSuccess ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Account Request Sent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>Your account request has been sent to admin.</p>
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Your login credentials</p>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">PID:</span>
                  <span className="font-mono font-semibold">{signupSuccess.pid}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Password:</span>
                  <span className="font-mono font-semibold">Your DOB ({signupSuccess.dobPassword})</span>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                You will be able to sign in once an admin approves your account.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="md" className="flex-1" onClick={copyCredentials}>
                  <Copy className="h-4 w-4" /> {copied ? 'Copied!' : 'Copy Credentials'}
                </Button>
                <Button variant="primary" size="md" className="flex-1" onClick={goToLogin}>
                  Go to Sign In
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : mode === 'login' ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sign In</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitLogin} className="space-y-4">
                {loginError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}
                {loginPending && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Your account is awaiting admin approval.</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Practitioner ID (PID)</label>
                  <input
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="e.g., P-001"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth (password)</label>
                  <input
                    type="date"
                    value={loginDob}
                    onChange={(e) => setLoginDob(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={loginLoading}>
                  <LogIn className="h-4 w-4" />
                  {loginLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create Account</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitSignup} className="space-y-4">
                {signupError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{signupError}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth</label>
                  <input
                    type="date"
                    value={signupDob}
                    onChange={(e) => setSignupDob(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-xs text-muted-foreground">Your DOB will be your initial password (format: DDMMYYYY).</p>
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={signupLoading}>
                  <UserPlus className="h-4 w-4" />
                  {signupLoading ? 'Submitting...' : 'Sign Up'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!signupSuccess && (
          <p className="text-center text-xs text-muted-foreground">
            {mode === 'login'
              ? 'Use the Practitioner ID and DOB you received after signup.'
              : 'Your account will require admin approval before you can sign in.'}
          </p>
        )}
      </div>
    </div>
  );
}
