import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Brain, LogIn, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api';
import { config } from '@/config';
import { useAuth } from '@/lib/auth';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  // Prefill email when arriving from a registration "Log in" link (?email=).
  const initialEmail =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('email') || ''
      : '';

  const [identifier, setIdentifier] = useState(initialEmail);
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    const id = identifier.trim();
    if (!id || !dob) {
      setError('Enter your email or phone, and date of birth.');
      return;
    }
    const isoDob = ddmmyyyyToIso(dob);
    if (!isoDob) {
      setError('Date of birth must be in DD/MM/YYYY format.');
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.login(id, isoDob);
      localStorage.setItem(config.authStorageKey, res.token);
      await refresh();
      navigate('/portal/assessment', { replace: true });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('401')) setError('Invalid email/phone or date of birth.');
      else setError('Login failed — the API may be unreachable.');
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
          <h1 className="text-2xl font-semibold tracking-tight">{config.appName} Respondent Portal</h1>
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
          Use the email or phone you registered with. Your date of birth is your password.
        </p>
      </div>
    </div>
  );
}
