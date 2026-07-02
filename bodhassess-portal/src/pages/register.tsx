import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Brain,
  UserPlus,
  AlertTriangle,
  Check,
  Building2,
  LogIn,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { publicTokensApi, authApi, respondentsApi, type AssessmentToken } from '@/lib/api';
import { config } from '@/config';
import { useAuth } from '@/lib/auth';
import { autoFormatDdmmyyyy, ddmmyyyyToIso, formatDDMMYYYY } from '@/lib/helpers';

const INPUT =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

/**
 * /portal/register. With ?token=… the link came from an admin invite, so we
 * run the token flow (the entity is fixed by the token). Without a token it's
 * an ordinary self-signup.
 */
export default function RegisterPage() {
  const token =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '';
  return token ? <TokenRegister token={token} /> : <SelfSignup />;
}

// ── Token-link registration ────────────────────────────────────────────────
function TokenRegister({ token }: { token: string }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [tokenInfo, setTokenInfo] = useState<AssessmentToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState('');

  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', companyId: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  const loginHref = `/portal/login${form.email.trim() ? `?email=${encodeURIComponent(form.email.trim())}` : ''}`;
  const orgName = tokenInfo?.entityName || tokenInfo?.groupName || '';

  useEffect(() => {
    if (!token) {
      setTokenError('No token in URL. The registration link must include ?token=…');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const t = await publicTokensApi.resolve(token);
        setTokenInfo(t);
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

  // Land the just-authenticated respondent in their assessment (or the list).
  const enter = async (target: string) => {
    await refresh();
    setDone(true);
    setTimeout(() => navigate(target, { replace: true }), 1000);
  };

  const signIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!tokenInfo) return;
    const email = (tokenInfo.loginEmail || form.email).trim();
    if (!email) {
      setError('This link has no email on file. Please contact your administrator.');
      return;
    }
    if (!form.dob.trim()) {
      setError('Date of birth is required.');
      return;
    }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) {
      setError('Date of birth must be in DD/MM/YYYY format.');
      return;
    }
    setSaving(true);
    try {
      const res = await authApi.login(email, isoDob);
      localStorage.setItem(config.authStorageKey, res.token);
      await enter(
        tokenInfo.sessionId ? `/portal/assessment/${encodeURIComponent(tokenInfo.sessionId)}` : '/portal/assessment',
      );
    } catch (err: any) {
      if (/\[API 401\]|unauthor/i.test(err?.message || '')) {
        setError("Email or date of birth doesn't match our records.");
      } else {
        setError(err?.message || 'Failed to sign in.');
      }
      setSaving(false);
    }
  };

  const claimExisting = async () => {
    setError('');
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) {
      setError('Date of birth must be in DD/MM/YYYY format.');
      return;
    }
    setSaving(true);
    try {
      const result = await publicTokensApi.loginExisting(token, { email: form.email.trim(), dob: isoDob });
      localStorage.setItem(config.authStorageKey, result.token);
      setAlreadyExists(false);
      await enter(`/portal/assessment/${encodeURIComponent(result.sessionId)}`);
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
    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!form.dob.trim()) {
      setError('Date of birth is required.');
      return;
    }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) {
      setError('Date of birth must be in DD/MM/YYYY format.');
      return;
    }
    setSaving(true);
    try {
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
      const result = await publicTokensApi.register(token, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        dob: isoDob,
        companyId: form.companyId.trim() || undefined,
      });
      localStorage.setItem(config.authStorageKey, result.token);
      await enter(`/portal/assessment/${encodeURIComponent(result.sessionId)}`);
    } catch (err: any) {
      if (/\[API 409\]|already exists/i.test(err?.message || '')) {
        setAlreadyExists(true);
      } else {
        setError(err?.message || 'Failed to register.');
      }
      setSaving(false);
    }
  };

  if (loading) return <CenterCard title="Loading…" message="Verifying your link…" />;
  if (tokenError) return <CenterCard title="Link unavailable" message={tokenError} error />;

  const isLogin = tokenInfo?.kind === 'login';
  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? 'Sign in to begin' : 'Register to begin'}</h1>
          {tokenInfo?.assessmentName && <p className="text-sm text-muted-foreground">{tokenInfo.assessmentName}</p>}
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
            <CardTitle className="text-base">
              {done ? "You're in" : isLogin ? "Confirm it's you" : alreadyExists ? 'Account found' : 'Your details'}
            </CardTitle>
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
                {error && <FormError msg={error} />}
                <p className="text-sm text-muted-foreground">
                  You're already registered. Confirm your date of birth to start your assessment.
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    value={tokenInfo?.loginEmail || form.email}
                    readOnly
                    className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground outline-none cursor-not-allowed"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth *</label>
                  <input
                    inputMode="numeric"
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })}
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    className={INPUT}
                  />
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
                {error && <FormError msg={error} />}
                <Button variant="primary" size="md" className="w-full" onClick={claimExisting} disabled={saving}>
                  <LogIn className="h-4 w-4" /> {saving ? 'Signing in…' : 'Log in & begin assessment'}
                </Button>
                <a href={loginHref} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
                  Use the standard login page instead
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setAlreadyExists(false);
                    setError('');
                  }}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Use different details
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                {error && <FormError msg={error} />}
                <Field label="Email *">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className={INPUT}
                  />
                </Field>
                <Field label="Name *">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className={INPUT} />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    className={INPUT}
                  />
                </Field>
                <Field label="Company ID" hint="Optional. Helps us recognise a returning account.">
                  <input
                    value={form.companyId}
                    onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                    placeholder="Company identification number"
                    className={INPUT}
                  />
                </Field>
                <Field label="Date of Birth *" hint="Format DD/MM/YYYY.">
                  <input
                    inputMode="numeric"
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })}
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    className={INPUT}
                  />
                </Field>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={saving}>
                  <UserPlus className="h-4 w-4" /> {saving ? 'Registering…' : 'Register & begin assessment'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already registered?{' '}
                  <a href={loginHref} className="font-medium text-primary hover:underline">
                    Log in
                  </a>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Self-signup (no token) ──────────────────────────────────────────────────
type AccountType = 'individual' | 'organization';

function generateRespondentId(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `R-${yy}${mm}${dd}-${rand}`;
}

function SelfSignup() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ email: string; dobDisplay: string; autoSignedIn: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedDob = dob.trim();
    const trimmedOrg = orgName.trim();
    const trimmedWebsite = orgWebsite.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone || !trimmedDob) {
      setError('Please fill in your name, email, phone and date of birth.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setError('That does not look like a valid email address.');
      return;
    }
    const phoneDigits = trimmedPhone.replace(/\D/g, '');
    if (!/^\+?[\d\s()-]{7,}$/.test(trimmedPhone) || phoneDigits.length < 7) {
      setError('Please enter a valid phone number (at least 7 digits).');
      return;
    }
    const isoDob = ddmmyyyyToIso(trimmedDob);
    if (!isoDob) {
      setError('Please enter your date of birth as DD/MM/YYYY.');
      return;
    }
    if (accountType === 'organization') {
      if (!trimmedOrg) {
        setError('Organization name is required.');
        return;
      }
      if (trimmedWebsite && !/^https?:\/\/.+\..+/i.test(trimmedWebsite)) {
        setError('Website must start with http:// or https:// and look like a URL.');
        return;
      }
    }

    setSubmitting(true);
    const id = generateRespondentId();
    try {
      await respondentsApi.create({
        id,
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        dob: isoDob,
        consent: 'Granted',
        accountType,
        orgName: accountType === 'organization' ? trimmedOrg : undefined,
        orgWebsite: accountType === 'organization' ? trimmedWebsite : undefined,
      });

      let autoSignedIn = false;
      try {
        const loginRes = await respondentsApi.login(trimmedEmail, isoDob);
        localStorage.setItem(config.authStorageKey, loginRes.token);
        await refresh();
        autoSignedIn = true;
      } catch {
        /* not fatal — user can sign in manually */
      }

      setCreated({ email: trimmedEmail, dobDisplay: formatDDMMYYYY(isoDob), autoSignedIn });
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('409') || msg.toLowerCase().includes('duplicate')) {
        setError('An account with that ID or email already exists. Please sign in instead.');
      } else {
        setError('Registration failed — the API may be unreachable. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const copyId = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Create your {config.appName} account</h1>
          <p className="text-sm text-muted-foreground">Register to take assessments online. No admin needed.</p>
        </div>

        {created ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Account Created
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sign in next time with your email (or phone) and date of birth.
              </p>
              <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">Email (Login)</p>
                    <p className="font-mono text-sm font-semibold truncate">{created.email}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyId}>
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="border-t border-border/60 pt-2">
                  <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">Password (DOB)</p>
                  <p className="font-mono text-sm font-semibold">{created.dobDisplay}</p>
                </div>
              </div>
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={() => navigate(created.autoSignedIn ? '/portal/assessment' : '/portal/login', { replace: true })}
              >
                {created.autoSignedIn ? 'Continue to My Assessments' : 'Go to Sign In'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Register</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                {error && <FormError msg={error} />}
                <Field label="Account Type *">
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} className={INPUT}>
                    <option value="individual">Individual</option>
                    <option value="organization">Organization</option>
                  </select>
                </Field>

                {accountType === 'organization' && (
                  <>
                    <Field label="Organization Name *">
                      <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g., Apollo Hospitals" className={INPUT} />
                    </Field>
                    <Field label="Website (optional)">
                      <input type="url" value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} placeholder="https://example.com" className={INPUT} />
                    </Field>
                  </>
                )}

                <Field label={accountType === 'organization' ? 'Primary Contact Name *' : 'Full Name *'}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={accountType === 'organization' ? 'e.g., Admin contact at your org' : 'e.g., Arjun Patel'}
                    className={INPUT}
                  />
                </Field>
                <Field label="Email *">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={INPUT} />
                </Field>
                <Field label="Phone *">
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={INPUT} />
                </Field>
                <Field label="Date of Birth *" hint="Your date of birth (DD/MM/YYYY) doubles as your sign-in password. Keep it safe.">
                  <input
                    inputMode="numeric"
                    value={dob}
                    onChange={(e) => setDob(autoFormatDdmmyyyy(e.target.value))}
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    className={INPUT}
                  />
                </Field>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={submitting}>
                  <UserPlus className="h-4 w-4" />
                  {submitting ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {!created && (
          <p className="text-center text-xs text-muted-foreground">
            Already registered?{' '}
            <a href="/portal/login" className="text-primary hover:underline font-medium">
              Sign in here
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Small shared bits ───────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FormError({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

function CenterCard({ title, message, error }: { title: string; message: string; error?: boolean }) {
  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-sm ${error ? 'text-red-600' : 'text-muted-foreground'}`}>{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
