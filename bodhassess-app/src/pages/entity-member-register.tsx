import { useEffect, useState } from 'react';
import { Brain, UserPlus, AlertTriangle, Check, Building2, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { publicEntityApi, type PublicEntityInfo } from '@/lib/api';
import { config } from '@/lib/config';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';
import { useParams } from '@/src/lib/router-helpers';

/**
 * Entity member self-registration — reached anonymously via an entity's
 * shareable member link (/entity/:entityId/register). The link is the same
 * for every member of a company; whoever opens it registers themselves into
 * that entity.
 *
 * Flow:
 *   1. Resolve the entity name to title the form ("Register to <name>").
 *   2. Collect the member's details (dob doubles as the portal password).
 *   3. POST creates the respondent, links them into the entity, and mirrors
 *      them into the identity table.
 *   4. Redirect to the portal login (with email prefilled) so they sign in
 *      with email + dob and reach their assessments.
 *
 * A returning person (server returns 409) is prompted to log in instead.
 */
export default function EntityMemberRegisterPage() {
  const params = useParams();
  const entityId = (params.entityId as string | undefined) || '';

  const [entity, setEntity] = useState<PublicEntityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', companyId: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  // Portal login on the standalone portal app, email prefilled when known.
  const portalLoginHref = `${config.portalUrl}/portal/login${
    form.email.trim() ? `?email=${encodeURIComponent(form.email.trim())}` : ''
  }`;

  useEffect(() => {
    if (!entityId) {
      setLoadError('This link is missing its entity. Ask your administrator for a new link.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const e = await publicEntityApi.resolve(entityId);
        setEntity(e);
      } catch (e: any) {
        setLoadError(e?.message || 'This registration link is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    })();
  }, [entityId]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.dob.trim()) { setError('Date of birth is required.'); return; }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) { setError('Date of birth must be in DD/MM/YYYY format.'); return; }
    setSaving(true);
    try {
      await publicEntityApi.registerMember(entityId, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        dob: isoDob,
        companyId: form.companyId.trim() || undefined,
      });
      setDone(true);
      // Hand off to the portal so they log in with email + dob.
      setTimeout(() => { window.location.href = portalLoginHref; }, 1200);
    } catch (err: any) {
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
  if (loadError) {
    return <CenterCard title="Link unavailable" message={loadError} error />;
  }

  const entityName = entity?.name || 'your organization';

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Register to {entityName}</h1>
          <p className="text-sm text-muted-foreground">
            Join {entityName} to take your assigned assessments.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">
            You're registering with <span className="font-medium text-foreground">{entityName}</span>
          </span>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {done ? 'Registered' : alreadyExists ? 'Account found' : 'Your details'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-3 text-sm text-green-700 dark:text-green-400">
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">You're registered.</p>
                  <p className="text-xs mt-1">Taking you to the portal to log in…</p>
                </div>
              </div>
            ) : alreadyExists ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">You already have an account.</p>
                    <p className="text-xs mt-1">These details match an existing account. Log in to the portal with your email and date of birth.</p>
                  </div>
                </div>
                <a href={portalLoginHref} className="block">
                  <Button variant="primary" size="md" className="w-full">
                    <LogIn className="h-4 w-4" /> Go to portal login
                  </Button>
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
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Format DD/MM/YYYY. Your date of birth is your password to log in to the assessment portal.
                  </p>
                </div>
                <Button type="submit" variant="primary" size="md" className="w-full" disabled={saving}>
                  <UserPlus className="h-4 w-4" /> {saving ? 'Registering…' : 'Register & continue to portal'}
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Already registered?{' '}
                  <a href={portalLoginHref} className="font-medium text-primary hover:underline">Log in</a>
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
