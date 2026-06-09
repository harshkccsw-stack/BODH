import { useEffect, useState } from 'react';
import { Brain, UserPlus, AlertTriangle, Check, Building2, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  publicTokensApi,
  authApi,
  type AssessmentToken,
} from '@/lib/api';
import { config } from '@/lib/config';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';
import { PublicRoute } from '@/src/components/public-route';
import PortalRegisterPage from './register';

/**
 * Entry component for /register. When the URL carries a ?token=… the link
 * came from an admin invite, so we run the token flow (no account-type
 * picker — the entity is fixed by the token) and stay reachable even for a
 * signed-in user, since the link targets a specific assessment. Without a
 * token it's an ordinary self-signup, so we render the standard register
 * page behind PublicRoute (signed-in users bounce to /dashboard).
 */
export default function RegisterEntry() {
  const hasToken =
    typeof window !== 'undefined' &&
    !!new URLSearchParams(window.location.search).get('token');
  if (hasToken) return <RegisterWithTokenPage />;
  return (
    <PublicRoute>
      <PortalRegisterPage />
    </PublicRoute>
  );
}

/**
 * Public token registration entry point. Reachable anonymously via
 * /register?token=XYZ. Always shows the registration form (per the
 * "always re-register" decision). Token carries:
 *   - assessmentId (always)
 *   - entityId (optional) → registrant joins this entity on submit
 *   - groupId  (optional) → registrant joins this group
 *   - respondentId (optional) → pre-bound; we re-use that respondent id
 *
 * After registration:
 *   1. Respondent row created
 *   2. If entityId is on the token, member is appended to that entity
 *   3. PortalSession created for (assessment, respondent, optional entityId)
 *   4. Token consumed (usedCount++)
 *   5. Server returns a RESPONDENT token; we store it and open
 *      /portal/take?id=<sessionId> so the assessment starts immediately.
 */
function RegisterWithTokenPage() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const token = params.get('token') || '';

  const [tokenInfo, setTokenInfo] = useState<AssessmentToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState('');

  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', companyId: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  // Set when the dedup check (email/phone/companyId + dob) finds an existing
  // account — we prompt the person to log in instead of registering again.
  const [alreadyExists, setAlreadyExists] = useState(false);

  const loginHref = `/portal/login${form.email.trim() ? `?email=${encodeURIComponent(form.email.trim())}` : ''}`;

  // The entity/group this invite binds the registrant to — shown instead of
  // an account-type picker so it's clear who they're joining.
  const orgName = tokenInfo?.entityName || tokenInfo?.groupName || '';

  useEffect(() => {
    if (!token) {
      setTokenError('No token in URL. The registration link must include ?token=…');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // resolve() returns the assessment + entity/group display names, so
        // we don't need a second (auth-gated) call to render the context.
        const t = await publicTokensApi.resolve(token);
        setTokenInfo(t);
        // Login token → the person already has an account; prefill their email
        // so they only need to confirm their DOB to sign in.
        if (t.kind === 'login' && t.loginEmail) {
          setForm((f) => ({ ...f, email: t.loginEmail! }));
        }
      } catch (e: any) {
        setTokenError(e?.message || 'Invalid or expired link.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Login-token path: the recipient is a known account, so we don't register —
  // they confirm their DOB (the portal "password"), we sign them in, and open
  // the already-assigned session.
  const signIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!tokenInfo) return;
    const email = (tokenInfo.loginEmail || form.email).trim();
    if (!email) { setError('This link has no email on file. Please contact your administrator.'); return; }
    if (!form.dob.trim()) { setError('Date of birth is required.'); return; }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) { setError('Date of birth must be in DD/MM/YYYY format.'); return; }
    setSaving(true);
    try {
      const res = await authApi.login(email, isoDob);
      localStorage.setItem(config.authStorageKey, res.token);
      setDone(true);
      setTimeout(() => {
        window.location.href = tokenInfo.sessionId
          ? `/portal/take?id=${encodeURIComponent(tokenInfo.sessionId)}`
          : '/portal/assessments';
      }, 1000);
    } catch (err: any) {
      if (/\[API 401\]|unauthor/i.test(err?.message || '')) {
        setError("Email or date of birth doesn't match our records.");
      } else {
        setError(err?.message || 'Failed to sign in.');
      }
      setSaving(false);
    }
  };

  // Existing-account path off the register form: the person was recognised, so
  // confirm their email + dob, link them into the entity/group, assign the
  // session, and open it — landing in the assessment, not the dashboard.
  const claimExisting = async () => {
    setError('');
    if (!form.email.trim()) { setError('Email is required.'); return; }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) { setError('Date of birth must be in DD/MM/YYYY format.'); return; }
    setSaving(true);
    try {
      const result = await publicTokensApi.loginExisting(token, { email: form.email.trim(), dob: isoDob });
      localStorage.setItem(config.authStorageKey, result.token);
      setAlreadyExists(false);
      setDone(true);
      setTimeout(() => { window.location.href = `/portal/take?id=${encodeURIComponent(result.sessionId)}`; }, 1000);
    } catch (err: any) {
      if (/\[API 401\]|unauthor|doesn't match/i.test(err?.message || '')) {
        setError("Email or date of birth doesn't match. Try the standard login page below.");
      } else {
        setError(err?.message || 'Failed to sign in.');
      }
      setSaving(false);
    }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!tokenInfo) return;
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.dob.trim()) { setError('Date of birth is required.'); return; }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) { setError('Date of birth must be in DD/MM/YYYY format.'); return; }
    setSaving(true);
    try {
      // Dedup gate: if a person with this dob + (email/phone/companyId)
      // already exists, send them to login rather than creating a second
      // account. The register endpoint enforces this too (409), but checking
      // first lets us show a friendly prompt without a failed POST.
      const { exists } = await publicTokensApi.registrationCheck({
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        companyId: form.companyId.trim() || undefined,
        dob: isoDob,
      });
      if (exists) {
        setAlreadyExists(true);
        setSaving(false);
        return;
      }

      // Single anonymous call — the server creates the respondent, links
      // into entity members if scoped, enforces the cap, builds the
      // session, and consumes the token. Avoids the per-step auth failures
      // we'd hit calling /respondents or /assessments directly.
      const result = await publicTokensApi.register(token, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        dob: isoDob,
        companyId: form.companyId.trim() || undefined,
      });
      // Store the RESPONDENT token the server minted so the portal take flow
      // authenticates the just-registered person — then open the portal take
      // page for this session. (The /assessments/:id/take route is behind the
      // dashboard's PrivateRoute and would bounce an anonymous registrant to
      // /login, which is why the assessment never started.)
      localStorage.setItem(config.authStorageKey, result.token);
      setDone(true);
      setTimeout(() => { window.location.href = `/portal/take?id=${encodeURIComponent(result.sessionId)}`; }, 1200);
    } catch (err: any) {
      // 409 from the server's own dedup guard → same login prompt.
      if (/\[API 409\]|already exists/i.test(err?.message || '')) {
        setAlreadyExists(true);
      } else {
        setError(err?.message || 'Failed to register.');
      }
      setSaving(false);
    }
  };

  if (loading) {
    return <CenterCard title="Loading…" message="Verifying your link…" />;
  }
  if (tokenError) {
    return <CenterCard title="Link unavailable" message={tokenError} error />;
  }
  const isLogin = tokenInfo?.kind === 'login';
  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? 'Sign in to begin' : 'Register to begin'}</h1>
          {tokenInfo?.assessmentName && (
            <p className="text-sm text-muted-foreground">{tokenInfo.assessmentName}</p>
          )}
        </div>
        {orgName && !isLogin && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              You're registering with <span className="font-medium text-foreground">{orgName}</span>
            </span>
          </div>
        )}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{done ? 'You\'re in' : isLogin ? 'Confirm it\'s you' : alreadyExists ? 'Account found' : 'Your details'}</CardTitle>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">{isLogin ? 'Signed in.' : 'Registered.'}</p>
                  <p className="text-xs mt-1">Loading your assessment…</p>
                </div>
              </div>
            ) : isLogin ? (
              <form onSubmit={signIn} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  You're already registered. Confirm your date of birth to start your assessment.
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <input type="email" value={tokenInfo?.loginEmail || form.email} readOnly className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground outline-none cursor-not-allowed" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth *</label>
                  <input inputMode="numeric" value={form.dob} onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })} placeholder="DD/MM/YYYY" maxLength={10} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  <p className="text-[0.6875rem] text-muted-foreground">Enter your date of birth to verify it's you.</p>
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={saving}>
                  <LogIn className="h-4 w-4" /> {saving ? 'Signing in…' : 'Sign in & begin assessment'}
                </Button>
              </form>
            ) : alreadyExists ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">You already have an account.</p>
                    <p className="text-xs mt-1">These details match an existing account. Log in to start your assessment.</p>
                  </div>
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button variant="primary" size="md" className="w-full" onClick={claimExisting} disabled={saving}>
                  <LogIn className="h-4 w-4" /> {saving ? 'Signing in…' : 'Log in & begin assessment'}
                </Button>
                <a href={loginHref} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
                  Use the standard login page instead
                </a>
                <button type="button" onClick={() => { setAlreadyExists(false); setError(''); }} className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
                  Use different details
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" autoComplete="tel" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Company ID</label>
                  <input value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} placeholder="Company identification number" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  <p className="text-[0.6875rem] text-muted-foreground">Optional. Helps us recognise a returning account.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth *</label>
                  <input inputMode="numeric" value={form.dob} onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })} placeholder="DD/MM/YYYY" maxLength={10} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  <p className="text-[0.6875rem] text-muted-foreground">Format DD/MM/YYYY.</p>
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={saving}>
                  <UserPlus className="h-4 w-4" /> {saving ? 'Registering…' : 'Register & begin assessment'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already registered?{' '}
                  <a href={loginHref} className="font-medium text-primary hover:underline">Log in</a>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CenterCard({ title, message, error }: { title: string; message: string; error?: boolean }) {
  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent>
          <p className={`text-sm ${error ? 'text-red-600' : 'text-muted-foreground'}`}>{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
