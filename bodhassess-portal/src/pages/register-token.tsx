import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AlertTriangle, Brain, ClipboardList, Loader2, Lock, UserPlus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScreenLoader } from '@/components/screen-loader';
import { ErrorCard } from '@/components/error-card';
import { ApiError, registrationTokensApi, type RegistrationTokenDetail } from '@/lib/api';
import { config } from '@/config';
import { useAuth } from '@/lib/auth';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const INPUT =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
const INPUT_LOCKED =
  'w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground outline-none cursor-not-allowed';

/**
 * /register/{token} — self-registration from a link an admin shared.
 *
 * The token in the path is the whole credential: it decides which organization
 * the respondent joins and, on an assessment-scoped link, which assessment
 * they get. Nothing here is chosen by the visitor except their own details and
 * — on an org-wide link — which assessment to take.
 *
 * Submitting is the next step; this page resolves the link and draws the form.
 */
export default function RegisterTokenPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [detail, setDetail] = useState<RegistrationTokenDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    dob: '',
    phone: '',
    employeeId: '',
    assessmentId: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await registrationTokensApi.getByToken(token);
        if (cancelled) return;
        setDetail(t);
        // Assessment-scoped links arrive with the choice already made. An
        // org-wide link with exactly one open assessment is pre-selected too —
        // a dropdown of one is a decision the visitor cannot get wrong.
        const preselected =
          t.assessmentId ?? (t.assessments.length === 1 ? t.assessments[0].assessmentId : null);
        if (preselected !== null) {
          setForm((f) => ({ ...f, assessmentId: String(preselected) }));
        }
      } catch (e) {
        if (cancelled) return;
        setLoadError(
          e instanceof ApiError
            ? e.serverMessage
            : 'We could not open this registration link. Please try again.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  /**
   * Register and land signed in. The reply carries the same bearer that
   * /portal/login issues, so storing it and refreshing the auth context is a
   * real sign-in — /portal/assessment is behind RequireAuth and will let us
   * through on the strength of it. `replace` so Back cannot return to a link
   * that has now been spent.
   */
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!detail) return;
    setSubmitError('');

    // Derived here rather than read from the `locked` below: that const is
    // declared after the early returns, so reading it from this closure would
    // depend on render order to be initialised.
    const isLocked = detail.scope === 'ASSESSMENT';

    // Client-side checks are only to save a round trip — the backend
    // re-validates all of it, and owns the rules the form cannot see.
    const assessmentId = isLocked ? detail.assessmentId : Number(form.assessmentId) || null;
    if (!assessmentId) {
      setSubmitError('Choose an assessment to continue.');
      return;
    }
    if (!form.name.trim()) {
      setSubmitError('Name is required.');
      return;
    }
    const email = form.email.trim();
    if (!EMAIL_RE.test(email)) {
      setSubmitError('Enter a valid email address.');
      return;
    }
    const isoDob = ddmmyyyyToIso(form.dob);
    if (!isoDob) {
      setSubmitError('Date of birth must be a real date in DD/MM/YYYY.');
      return;
    }
    const employeeId = form.employeeId.trim();
    if (employeeId && !/^[A-Za-z0-9]+$/.test(employeeId)) {
      setSubmitError('Employee ID must contain only letters and numbers.');
      return;
    }

    setSaving(true);
    try {
      const result = await registrationTokensApi.register(token, {
        name: form.name.trim(),
        email,
        dob: isoDob,
        phone: form.phone.trim() || undefined,
        employeeId: employeeId || undefined,
        // Omitted on a locked link: the link fixes the assessment, and
        // sending a different one there is rejected rather than honoured.
        assessmentId: isLocked ? undefined : assessmentId,
      });
      localStorage.setItem(config.authStorageKey, result.token);
      await refresh();
      navigate('/portal/assessment', { replace: true });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError
          ? err.serverMessage
          : 'Registration failed — the server may be unreachable. Please try again.',
      );
      setSaving(false);
    }
  };

  if (loading) return <ScreenLoader />;
  if (loadError || !detail) {
    return (
      <ErrorCard
        message={loadError || 'This registration link is not valid or has expired.'}
        actionLabel="Go to sign in"
        onAction={() => {
          window.location.href = '/portal/login';
        }}
      />
    );
  }

  const locked = detail.scope === 'ASSESSMENT';

  return (
    // min-h-dvh, not min-h-screen: on mobile browsers 100vh includes the
    // retracting address bar, which is exactly the overflow this layout is
    // trying to avoid.
    <div className="flex-1 min-h-dvh w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-6">
      <div className="w-full max-w-2xl space-y-4">
        {/* Who they are registering with. Laid out on ONE line rather than a
            centred stack — the stacked version cost ~60px of height for no
            extra information, and the org name is the only thing that has to
            read as theirs. It also replaces the separate "You're registering
            with X" banner, which said the same thing a second time. */}
        <div className="flex items-center gap-3">
          {detail.organizationLogoBase64 ? (
            <img
              src={detail.organizationLogoBase64}
              alt={detail.organizationName}
              className="h-12 w-12 shrink-0 rounded-xl border border-border bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Brain className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {detail.organizationName}
            </h1>
            <p className="text-sm text-muted-foreground">Register to take your assessment</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-5">
            <form onSubmit={submit}>
              {/* One grid holds every field. Two columns from `sm` up, which
                  is what keeps the whole form on screen without scrolling;
                  below that it collapses to one column and is allowed to
                  scroll, because clipping inputs to fit a phone would be
                  worse than a scrollbar. Fields that read as a full sentence
                  (the assessment, the optional code) span both columns. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <Field
                  className="sm:col-span-2"
                  label="Assessment *"
                  hint={locked ? 'Set by the link you followed.' : undefined}
                >
                  {locked ? (
                    <div className="relative">
                      <input value={detail.assessmentName ?? ''} readOnly className={INPUT_LOCKED} />
                      <Lock className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  ) : (
                    <select
                      value={form.assessmentId}
                      onChange={(e) => setForm({ ...form, assessmentId: e.target.value })}
                      className={INPUT}
                    >
                      <option value="">Select an assessment…</option>
                      {detail.assessments.map((a) => (
                        <option key={a.assessmentId} value={a.assessmentId}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Field label="Full Name *">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Your name"
                    autoComplete="name"
                    className={INPUT}
                  />
                </Field>

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

                {/* The one hint that has to stay: the dob is the password. */}
                <Field label="Date of Birth *" hint="Also your sign-in password — keep it safe.">
                  <input
                    inputMode="numeric"
                    value={form.dob}
                    onChange={(e) => setForm({ ...form, dob: autoFormatDdmmyyyy(e.target.value) })}
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    className={INPUT}
                  />
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

                {/* "(optional)" in the label and the rest in the placeholder,
                    so this needs no hint line of its own. */}
                <Field className="sm:col-span-2" label="Employee ID (optional)">
                  <input
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    placeholder="EMP1042 — if your organization issued you one, you can sign in with it"
                    className={INPUT}
                  />
                </Field>
              </div>

              {/* Only rendered on failure, so the resting layout keeps its
                  height and the form still fits without scrolling. */}
              {submitError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Already registered?{' '}
                  <a href="/portal/login" className="font-medium text-primary hover:underline">
                    Sign in
                  </a>
                </p>
                <Button type="submit" variant="primary" size="md" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {saving ? 'Registering…' : 'Register & begin assessment'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  /** Grid placement — e.g. "sm:col-span-2" for a full-width row. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[0.6875rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}
