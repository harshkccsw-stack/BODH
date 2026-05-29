import { useEffect, useState } from 'react';
import { Brain, UserPlus, AlertTriangle, Check, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  publicTokensApi,
  type AssessmentToken,
} from '@/lib/api';
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
 *   5. Redirect to /portal/login with prefilled email (admin can configure
 *      the password flow externally)
 */
function RegisterWithTokenPage() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const token = params.get('token') || '';

  const [tokenInfo, setTokenInfo] = useState<AssessmentToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState('');

  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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
      } catch (e: any) {
        setTokenError(e?.message || 'Invalid or expired link.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!tokenInfo) return;
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!form.dob.trim()) { setError('Date of birth is required.'); return; }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) { setError('Date of birth must be in DD/MM/YYYY format.'); return; }
    setSaving(true);
    try {
      // Single anonymous call — the server creates/reuses the
      // respondent, links into entity members if scoped, enforces the
      // cap, builds the session, and consumes the token. Avoids the
      // per-step auth failures we'd hit calling /respondents or
      // /assessments directly without a logged-in admin token.
      const result = await publicTokensApi.register(token, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        dob: isoDob,
      });
      setDone(true);
      setTimeout(() => { window.location.href = `/assessments/${encodeURIComponent(result.sessionId)}/take`; }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to register.');
      setSaving(false);
    }
  };

  if (loading) {
    return <CenterCard title="Loading…" message="Verifying your link…" />;
  }
  if (tokenError) {
    return <CenterCard title="Link unavailable" message={tokenError} error />;
  }
  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Register to begin</h1>
          {tokenInfo?.assessmentName && (
            <p className="text-sm text-muted-foreground">{tokenInfo.assessmentName}</p>
          )}
        </div>
        {orgName && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              You're registering with <span className="font-medium text-foreground">{orgName}</span>
            </span>
          </div>
        )}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{done ? 'You\'re in' : 'Your details'}</CardTitle>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Registered.</p>
                  <p className="text-xs mt-1">Loading your assessment…</p>
                </div>
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
                  <label className="text-sm font-medium">Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" autoComplete="tel" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date of Birth *</label>
                  <input inputMode="numeric" value={form.dob} onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })} placeholder="DD/MM/YYYY" maxLength={10} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  <p className="text-[0.6875rem] text-muted-foreground">Format DD/MM/YYYY.</p>
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={saving}>
                  <UserPlus className="h-4 w-4" /> {saving ? 'Registering…' : 'Register & begin assessment'}
                </Button>
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
