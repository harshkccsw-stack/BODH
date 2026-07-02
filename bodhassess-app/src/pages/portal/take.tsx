import { useEffect, useState } from 'react';
import { Brain, Check, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { portalSessionsApi, questionnairesApi, respondentsApi, demographicFieldsApi, type PortalSession, type Respondent, type DemographicField } from '@/lib/api';
import { config } from '@/lib/config';

type AuthUser = Respondent;
interface MQT { id: string; name: string; children?: MQT[]; }
interface MQ { id: string; name: string; mqts: MQT[]; }

// Walk every MQT in the tree (depth-first) so we can build a complete id→name
// map for scoring at any depth.
function walkMqts(nodes: MQT[] = [], visit: (n: MQT) => void): void {
  for (const n of nodes) {
    visit(n);
    if (n.children?.length) walkMqts(n.children, visit);
  }
}
interface OptionScore { mqt_id: string; score: number; }
interface QOption { text: string; scores: OptionScore[]; media_url?: string; media_type?: string; }
interface Question {
  id: string;
  stem: string;
  format: string;
  media_url: string;
  media_type: string;
  options: QOption[];
  // Question-level scores added to the total whenever the question is
  // answered, regardless of which option (or free-text response) was given.
  question_scores?: OptionScore[];
}
interface StoredQuestionnaire {
  id: string;
  name: string;
  shortName?: string;
  mqs: MQ[];
  questions: Question[];
  disclaimer?: string;
  demographicFieldKeys?: string[];
}
type StoredSession = PortalSession;

const AUTH_KEY = config.authStorageKey;

function extractYoutubeId(url: string): string | null {
  const m = url?.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return m ? m[1] : null;
}

function Media({ url, type }: { url?: string; type?: string }) {
  if (!url || !type || type === 'none') return null;
  if (type === 'image') return <img src={url} alt="" className="max-h-72 rounded-lg border border-border" />;
  if (type === 'video') return <video src={url} controls className="max-h-72 rounded-lg border border-border" />;
  if (type === 'youtube') {
    const id = extractYoutubeId(url);
    return id ? (
      <iframe src={`https://www.youtube.com/embed/${id}`} className="w-full aspect-video rounded-lg border border-border" allowFullScreen />
    ) : null;
  }
  if (type === 'audio') return <audio src={url} controls className="w-full" />;
  return null;
}

export default function PortalTakePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [instrument, setQuestionnaire] = useState<StoredQuestionnaire | null>(null);
  const [index, setIndex] = useState(0);
  // Number for selected-option indexes (MCQ/Likert/etc), string for FREE_TEXT answers
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [agreedToDisclaimer, setAgreedToDisclaimer] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);

  // Demographics gate — fields come from the admin-managed catalog, filtered per-questionnaire.
  const [demographicsSubmitted, setDemographicsSubmitted] = useState(false);
  const [savingDemographics, setSavingDemographics] = useState(false);
  const [demographicsError, setDemographicsError] = useState('');
  const [demographics, setDemographics] = useState<Record<string, string>>({});
  const [demoFieldCatalog, setDemoFieldCatalog] = useState<DemographicField[]>([]);

  useEffect(() => {
    demographicFieldsApi.list(true).then(setDemoFieldCatalog).catch(() => setDemoFieldCatalog([]));
  }, []);

  // Pre-fill what we can from the authenticated user + mark as already
  // submitted if the session already has demographics captured.
  useEffect(() => {
    if (user && !demographics.fullName) {
      setDemographics((prev) => ({ ...prev, fullName: prev.fullName || user.name || '' }));
    }
  }, [user]);
  useEffect(() => {
    if (session?.demographics && Object.keys(session.demographics).length > 0) {
      setDemographicsSubmitted(true);
    }
  }, [session]);

  // Heartbeat — keep the admin Live Tracking page informed of where this
  // respondent currently is. Best-effort; failures are swallowed so a flaky
  // network never blocks the assessment itself.
  useEffect(() => {
    if (!session?.id || !instrument || submitting) return;
    const total = instrument.questions.length;
    const ping = () => {
      portalSessionsApi
        .heartbeat(session.id, { currentIndex: index, totalQuestions: total })
        .catch(() => { /* swallow */ });
    };
    ping();
    const t = setInterval(ping, 5000);
    return () => clearInterval(t);
  }, [session?.id, instrument, index, submitting]);

  // Fire a single partial-save the moment the respondent records their
  // first non-empty answer. The backend stamps started_at on that write,
  // which feeds the 24h/48h overdue buckets on the respondents dashboard.
  const [startedPinged, setStartedPinged] = useState(false);
  useEffect(() => {
    if (startedPinged || !session?.id || submitting) return;
    const hasAny = Object.values(answers).some((v) =>
      typeof v === 'string' ? v.trim() !== '' : v !== undefined && v !== null,
    );
    if (!hasAny) return;
    setStartedPinged(true);
    portalSessionsApi.update(session.id, { answers }).catch(() => { /* best-effort */ });
  }, [answers, session?.id, submitting, startedPinged]);

  useEffect(() => {
    (async () => {
      try {
        const token = sessionStorage.getItem(AUTH_KEY);
        if (!token) { window.location.href = '/portal/login'; return; }
        let u: AuthUser;
        try {
          u = await respondentsApi.me(token);
        } catch {
          sessionStorage.removeItem(AUTH_KEY);
          window.location.href = '/portal/login';
          return;
        }
        setUser(u);

        const params = new URLSearchParams(window.location.search);
        const sid = params.get('id');
        if (!sid) { setLoadError('No assessment specified.'); return; }

        let s: PortalSession;
        try {
          s = await portalSessionsApi.get(sid);
        } catch {
          setLoadError('Assessment not found.');
          return;
        }
        if (s.respondentId !== u.id) { setLoadError('This assessment is not assigned to you.'); return; }
        if (s.status === 'Completed') { setLoadError('This assessment has already been submitted.'); return; }
        setSession(s);

      const target = (s.instrumentFullName || s.instrument || '').trim();
      const shortTarget = (s.instrument || '').trim();
      let inst: StoredQuestionnaire | null = null;
      for (const candidate of [target, shortTarget]) {
        if (!candidate) continue;
        try {
          const res = await questionnairesApi.getByName(candidate);
          if (res) { inst = res as any; break; }
        } catch {}
      }
      if (!inst) {
        setLoadError(`The assessment "${target}" isn't available in the database. Ask your administrator to publish it via Question Bank → Create Questionnaire.`);
        return;
      }
        setQuestionnaire(inst);
      } catch (e) {
        setLoadError('Failed to load the assessment.');
      }
    })();
  }, []);

  const submit = async () => {
    if (!instrument || !session) return;
    setSubmitting(true);

    // Build id→name and id→0 maps over the *whole* MQT tree (any depth).
    // Only MQTs that an option actually scored against will appear in the
    // saved result — auto roll-ups for parent MQTs are intentionally not
    // computed.
    const mqtName: Record<string, string> = {};
    const totals: Record<string, number> = {};
    instrument.mqs.forEach((mq) => walkMqts(mq.mqts, (t) => {
      mqtName[t.id] = t.name;
      totals[t.id] = 0;
    }));

    const scored = new Set<string>();
    instrument.questions.forEach((q) => {
      const ans = answers[q.id];
      if (ans === undefined) return;
      // Treat empty free-text as unanswered so we don't credit question-level
      // scores for blank responses.
      if (typeof ans === 'string' && ans.trim() === '') return;
      // Question-level scores apply on any non-empty answer.
      (q.question_scores || []).forEach((s) => {
        totals[s.mqt_id] = (totals[s.mqt_id] || 0) + s.score;
        scored.add(s.mqt_id);
      });
      if (typeof ans !== 'number') return; // free-text — no per-option contribution
      const opt = q.options[ans];
      if (!opt) return;
      (opt.scores || []).forEach((s) => {
        totals[s.mqt_id] = (totals[s.mqt_id] || 0) + s.score;
        scored.add(s.mqt_id);
      });
    });

    // Persist keyed by MQT id, carrying the resolved name so reports can
    // render labels without needing the questionnaire's MQ tree handy.
    const mqtScores: Record<string, { name: string; score: number }> = {};
    scored.forEach((id) => {
      mqtScores[id] = { name: mqtName[id] || id, score: totals[id] };
    });
    const summary =
      Object.values(mqtScores)
        .map((v) => `${v.name}=${v.score}`)
        .join(', ') || 'Submitted';

    try {
      await portalSessionsApi.update(session.id, {
        status: 'Completed',
        score: summary,
        answers,
        mqtScores,
        completedAt: new Date().toISOString(),
      });
    } catch {
      // fall through — still navigate; session will remain Active if the write failed
    }

    window.location.href = `/portal/complete?id=${encodeURIComponent(session.id)}`;
  };

  if (loadError) {
    return (
      <div className="flex-1 min-h-screen w-full flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-4 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="text-sm">{loadError}</p>
            <Button variant="outline" onClick={() => window.location.href = '/portal/assessments'}>
              Back to Assessments
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session || !instrument) {
    return <div className="flex-1 min-h-screen w-full flex items-center justify-center text-sm text-muted-foreground">Loading assessment...</div>;
  }

  // Disclaimer gate — only shown if the questionnaire has one and the
  // respondent hasn't agreed yet this session.
  const hasDisclaimer = !!(instrument.disclaimer && instrument.disclaimer.trim().length > 0);
  if (hasDisclaimer && !agreedToDisclaimer) {
    return (
      <div className="flex-1 min-h-screen w-full bg-linear-to-b from-muted/30 via-background to-background">
        <header className="border-b border-border bg-background">
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{instrument.name}</p>
              <p className="text-xs text-muted-foreground">{user?.name} · Assessment {session.id}</p>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-5 py-8">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div>
                <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-primary">Before you begin</p>
                <h2 className="text-xl font-semibold tracking-tight mt-1">Terms &amp; Conditions</h2>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4 whitespace-pre-wrap text-sm leading-relaxed max-h-[50vh] overflow-y-auto">
                {instrument.disclaimer}
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={disclaimerChecked}
                  onChange={(e) => setDisclaimerChecked(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span className="text-sm">
                  I have read and understood the terms above, and I agree to continue with this assessment.
                </span>
              </label>
              <div className="flex items-center justify-between gap-3 pt-1">
                <Button variant="outline" onClick={() => window.location.href = '/portal/assessments'}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setAgreedToDisclaimer(true)}
                  disabled={!disclaimerChecked}
                >
                  <Check className="h-4 w-4" />
                  Agree &amp; Continue
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Demographics gate — after disclaimer, before questions. Skipped if already captured on this session.
  // Fields resolved from the catalogue, filtered by the questionnaire's opt-in list (empty = all active).
  const activeDemoFields = (() => {
    const keys = instrument.demographicFieldKeys || [];
    if (keys.length === 0) return demoFieldCatalog;
    const keySet = new Set(keys);
    return demoFieldCatalog.filter((f) => keySet.has(f.fieldKey));
  })();

  const submitDemographics = async () => {
    const missing = activeDemoFields
      .filter((f) => f.required)
      .filter((f) => !(demographics[f.fieldKey] || '').trim());
    if (missing.length > 0) {
      setDemographicsError(`Please fill: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    if (!session) return;
    setSavingDemographics(true);
    setDemographicsError('');
    try {
      const clean: Record<string, string> = {};
      activeDemoFields.forEach((f) => {
        const v = (demographics[f.fieldKey] || '').trim();
        if (v) clean[f.fieldKey] = v;
      });
      await portalSessionsApi.update(session.id, { demographics: clean });
      setDemographicsSubmitted(true);
    } catch (e: any) {
      setDemographicsError(`Failed to save: ${e?.message || 'unknown error'}`);
    } finally {
      setSavingDemographics(false);
    }
  };

  // When a DOB is entered, auto-compute age if an "age" field exists in the active subset.
  const handleDemoFieldChange = (field: DemographicField, value: string) => {
    setDemographics((prev) => {
      const next = { ...prev, [field.fieldKey]: value };
      if (field.fieldKey === 'dob' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const today = new Date();
        const d = new Date(value);
        let a = today.getFullYear() - d.getFullYear();
        const m = today.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
        if (a >= 0 && a < 130 && activeDemoFields.some((f) => f.fieldKey === 'age')) {
          next.age = String(a);
        }
      }
      return next;
    });
  };

  if (!demographicsSubmitted) {
    return (
      <div className="flex-1 min-h-screen w-full bg-linear-to-b from-muted/30 via-background to-background">
        <header className="border-b border-border bg-background">
          <div className="max-w-3xl mx-auto px-5 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{instrument.name}</p>
              <p className="text-xs text-muted-foreground">{user?.name} · Assessment {session.id}</p>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-5 py-8">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div>
                <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-primary">About you</p>
                <h2 className="text-xl font-semibold tracking-tight mt-1">Demographic Details</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  We collect this once before the assessment so your results can be interpreted in context. All fields marked * are required.
                </p>
              </div>

              {demographicsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{demographicsError}</span>
                </div>
              )}

              {activeDemoFields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                  No demographic fields configured. Ask your administrator to add some in the Questionnaire Library.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeDemoFields.map((f) => {
                    const value = demographics[f.fieldKey] || '';
                    const wide = f.type === 'textarea';
                    const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
                    return (
                      <div key={f.id} className={cn('space-y-1.5', wide && 'md:col-span-2')}>
                        <label className="text-sm font-medium">
                          {f.label}{f.required && ' *'}
                        </label>
                        {f.type === 'select' ? (
                          <select
                            value={value}
                            onChange={(e) => handleDemoFieldChange(f, e.target.value)}
                            className={inputClass}
                          >
                            <option value="">Select…</option>
                            {f.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : f.type === 'textarea' ? (
                          <textarea
                            rows={3}
                            value={value}
                            placeholder={f.placeholder}
                            onChange={(e) => handleDemoFieldChange(f, e.target.value)}
                            className={inputClass}
                          />
                        ) : f.type === 'date' ? (
                          <input
                            type="date"
                            value={value}
                            onChange={(e) => handleDemoFieldChange(f, e.target.value)}
                            className={inputClass}
                          />
                        ) : f.type === 'number' ? (
                          <input
                            type="number"
                            value={value}
                            placeholder={f.placeholder}
                            onChange={(e) => handleDemoFieldChange(f, e.target.value)}
                            className={inputClass}
                          />
                        ) : (
                          <input
                            value={value}
                            placeholder={f.placeholder}
                            onChange={(e) => handleDemoFieldChange(f, e.target.value)}
                            className={inputClass}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <Button variant="outline" onClick={() => window.location.href = '/portal/assessments'}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={submitDemographics} disabled={savingDemographics}>
                  <Check className="h-4 w-4" />
                  {savingDemographics ? 'Saving…' : 'Continue to Assessment'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const total = instrument.questions.length;
  if (total === 0) {
    return (
      <div className="flex-1 min-h-screen w-full flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-4 text-center">
            <p className="text-sm">This assessment has no questions yet.</p>
            <Button variant="outline" onClick={() => window.location.href = '/portal/assessments'}>Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const q = instrument.questions[index];
  const progress = Math.round(((index + 1) / total) * 100);
  const isFreeText = String(q.format || '').toUpperCase().replace(/_/g, '') === 'FREETEXT';
  const selected = answers[q.id];
  const answered = isFreeText
    ? typeof selected === 'string' && selected.trim().length > 0
    : selected !== undefined;
  const isLast = index === total - 1;
  const showIndex = !!session.showQuestionIndex;

  // Build a quick lookup of which questions have answers — drives the green
  // "attempted" colour in the sidebar.
  const isQuestionAnswered = (qi: number): boolean => {
    const qq = instrument.questions[qi];
    if (!qq) return false;
    const a = answers[qq.id];
    if (a === undefined) return false;
    if (typeof a === 'string') return a.trim().length > 0;
    return true;
  };
  const answeredCount = instrument.questions.reduce((n, _, i) => n + (isQuestionAnswered(i) ? 1 : 0), 0);

  return (
    <div className="flex-1 min-h-screen w-full bg-muted/20">
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className={cn(
          'mx-auto px-5 py-4 flex items-center justify-between',
          showIndex ? 'max-w-6xl' : 'max-w-3xl',
        )}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{instrument.name}</p>
              <p className="text-xs text-muted-foreground">{user?.name} · Assessment {session.id}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Question {index + 1} of {total}
          </div>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-1 bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className={cn(
        'mx-auto px-5 py-8',
        showIndex ? 'max-w-6xl grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-6' : 'max-w-3xl',
      )}>
        {showIndex && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions</p>
                  <span className="text-[0.6875rem] text-muted-foreground">{answeredCount}/{total}</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {instrument.questions.map((qq, qi) => {
                    const isCurrent = qi === index;
                    const isAnswered = isQuestionAnswered(qi);
                    return (
                      <button
                        key={qq.id}
                        type="button"
                        onClick={() => setIndex(qi)}
                        title={`Question ${qi + 1}${isAnswered ? ' — answered' : ''}`}
                        className={cn(
                          'h-8 w-full rounded-md text-xs font-medium border transition-colors',
                          isCurrent
                            ? 'border-primary bg-primary text-primary-foreground'
                            : isAnswered
                              ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                        )}
                      >
                        {qi + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-[0.6875rem] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-primary" /> Current
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-green-500/20 border border-green-500/40" /> Answered
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm border border-border bg-background" /> Not answered
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        )}

        <main>
        <Card>
          <CardContent className="p-6 space-y-5">
            {q.stem && <p className="text-base font-medium leading-relaxed">{q.stem}</p>}
            <Media url={q.media_url} type={q.media_type} />

            {isFreeText ? (
              <div className="space-y-1.5">
                <textarea
                  rows={7}
                  value={typeof selected === 'string' ? selected : ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="Type your answer here…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {typeof selected === 'string' ? selected.length : 0} characters
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const on = selected === oi;
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => setAnswers({ ...answers, [q.id]: oi })}
                      className={cn(
                        'w-full text-left rounded-lg border p-4 transition-colors',
                        on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <div className="flex-1 space-y-2">
                          <p className="text-sm">{opt.text || `Option ${oi + 1}`}</p>
                          <Media url={opt.media_url} type={opt.media_type} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-5">
          <Button variant="outline" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {isLast ? (
            <Button variant="primary" onClick={submit} disabled={!answered || submitting}>
              {submitting ? 'Submitting...' : 'Submit Assessment'}
              <Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setIndex(index + 1)} disabled={!answered}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        </main>
      </div>
    </div>
  );
}
