import { ErrorCard } from '@/components/error-card';
import { ScreenLoader } from '@/components/screen-loader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { config } from '@/config';
import {
  ApiError,
  registrationTokensApi,
  type RegistrationGender,
  type RegistrationTokenDetail,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { autoFormatDdmmyyyy, ddmmyyyyToIso } from '@/lib/helpers';
import { AlertTriangle, Brain, ClipboardList, Loader2, Lock, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Mirrors PHONE_PATTERN on the backend exactly. Deliberately loose — digits
// plus the punctuation people actually type — because this form is filled in
// from every country and a stricter rule rejects real numbers.
const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;

// PREFER_NOT_TO_SAY is what makes "required" fair: the answer is mandatory,
// declining to give one is a valid answer, and it is stored as such rather
// than as a blank the reports cannot tell apart from "never asked".
const GENDERS: Array<{ value: RegistrationGender; label: string }> = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

// h-11 on a phone: a 44px control is the smallest that is comfortable to tap,
// and the base stylesheet lifts the font to 16px at the same widths so
// focusing one never makes iOS zoom the page. Back to the designed height
// from `sm` up.
const INPUT =
  'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-auto sm:py-2';
const INPUT_LOCKED =
  'h-11 w-full cursor-not-allowed rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground outline-none sm:h-auto sm:py-2';

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
    /**
     * '' means "nothing picked yet" and is rejected on submit — it is NOT an
     * answer. Someone declining picks PREFER_NOT_TO_SAY, which is stored.
     */
    gender: '' as RegistrationGender | '',
    employeeId: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await registrationTokensApi.getByToken(token);
        if (cancelled) return;
        setDetail(t);
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
   * real sign-in — the destination is behind RequireAuth and will let us
   * through on the strength of it. `replace` so Back cannot return to a link
   * that has now been used.
   */
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!detail) return;
    setSubmitError('');

    // Client-side checks are only to save a round trip — the backend
    // re-validates all of it, and owns the rules the form cannot see.
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
    const phone = form.phone.trim();
    if (!phone) {
      setSubmitError('Phone number is required.');
      return;
    }
    if (!PHONE_RE.test(phone)) {
      setSubmitError('Enter a valid phone number.');
      return;
    }
    // '' is the placeholder, not an answer — "Prefer not to say" is how
    // someone declines, and that is a value the server stores.
    if (!form.gender) {
      setSubmitError('Please select a gender.');
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
        phone,
        gender: form.gender,
        employeeId: employeeId || undefined,
      });
      localStorage.setItem(config.authStorageKey, result.token);
      await refresh();
      // An assessment-scoped link granted exactly one thing to do, so open it
      // rather than making them find it on a dashboard of one. An org-wide
      // link granted nothing yet — the dashboard's empty state explains that
      // an administrator will assign something.
      navigate(
        result.respondentAssessmentMappingId
          ? `/portal/assessment/${result.respondentAssessmentMappingId}`
          : '/portal/assessment',
        { replace: true },
      );
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
    <div className="flex-1 min-h-dvh w-full flex items-center justify-center bg-linear-to-br from-primary/10 via-background to-primary/5 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
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
            {/* Two lines on a phone, one truncated line from sm up: this is
                the respondent's confirmation of WHOSE assessment they are
                about to take, so a long organization name is worth the second
                line. */}
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight line-clamp-2 sm:truncate">
              {detail.organizationName}
            </h1>
            {/* An org-wide link grants no assessment, so promising one would
                be a lie — it says what the link actually does. */}
            <p className="text-sm text-muted-foreground truncate">
              {locked
                ? 'Register to take your assessment'
                : `Register to join ${detail.organizationName}`}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={submit}>
              {/* One grid holds every field. Two columns from `sm` up, which
                  is what keeps the whole form on screen without scrolling;
                  below that it collapses to one column and is allowed to
                  scroll, because clipping inputs to fit a phone would be
                  worse than a scrollbar. Fields that read as a full sentence
                  (the assessment, the optional code) span both columns. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {/* Only on an assessment-scoped link, and read-only even then
                    — the link fixed the choice. An org-wide link shows no
                    assessment field at all: it grants none, so offering one
                    would promise something this form cannot deliver. */}
                {locked && (
                  <Field
                    className="sm:col-span-2"
                    label="Assessment"
                    hint="Set by the link you followed."
                  >
                    <div className="relative">
                      <input value={detail.assessmentName ?? ''} readOnly className={INPUT_LOCKED} />
                      <Lock className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </Field>
                )}

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

                {/* Paired with the date of birth rather than given a row of
                    its own: both are personal details, and it keeps the form
                    at four rows so it still fits without scrolling. */}
                <Field label="Gender *">
                  <select
                    value={form.gender}
                    onChange={(e) =>
                      setForm({ ...form, gender: e.target.value as RegistrationGender | '' })
                    }
                    className={INPUT}
                  >
                    {/* This option is load-bearing. Without it the select's
                        value ('') matched nothing, so the browser displayed
                        the first option — "Male" — while the state stayed
                        empty: anyone who trusted what they saw submitted no
                        gender at all. */}
                    <option value="">Select…</option>
                    {GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Phone *">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    className={INPUT}
                  />
                </Field>

                {/* Half-width now that gender took the other half of its row,
                    so the explanation moves from the placeholder to a hint. */}
                <Field
                  label="Employee ID"
                  hint="Optional — sign in with it instead of your email."
                >
                  <input
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    placeholder="EMP1042"
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

              <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Already registered?{' '}
                  <a href="/portal/login" className="font-medium text-primary hover:underline">
                    Sign in
                  </a>
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={saving}
                  className="h-11 w-full sm:h-8.5 sm:w-auto"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {saving
                    ? 'Registering…'
                    : locked
                      ? 'Register & begin assessment'
                      : 'Register'}
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
