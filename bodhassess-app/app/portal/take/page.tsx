'use client';

import { useEffect, useState } from 'react';
import { Brain, Check, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { portalSessionsApi, questionnairesApi, respondentsApi, type PortalSession, type Respondent } from '@/lib/api';

type AuthUser = Respondent;
interface MQT { id: string; name: string; }
interface MQ { id: string; name: string; mqts: MQT[]; }
interface OptionScore { mqt_id: string; score: number; }
interface QOption { text: string; scores: OptionScore[]; media_url?: string; media_type?: string; }
interface Question {
  id: string;
  stem: string;
  format: string;
  media_url: string;
  media_type: string;
  options: QOption[];
}
interface StoredInstrument {
  id: string;
  name: string;
  shortName?: string;
  mqs: MQ[];
  questions: Question[];
}
type StoredSession = PortalSession;

const AUTH_KEY = 'bodhassess.auth.token';

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
  const [instrument, setInstrument] = useState<StoredInstrument | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        if (!sid) { setLoadError('No session specified.'); return; }

        let s: PortalSession;
        try {
          s = await portalSessionsApi.get(sid);
        } catch {
          setLoadError('Session not found.');
          return;
        }
        if (s.respondentId !== u.id) { setLoadError('This assessment is not assigned to you.'); return; }
        if (s.status === 'Completed') { setLoadError('This assessment has already been submitted.'); return; }
        setSession(s);

      const target = (s.instrumentFullName || s.instrument || '').trim();
      const shortTarget = (s.instrument || '').trim();
      let inst: StoredInstrument | null = null;
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
        setInstrument(inst);
      } catch (e) {
        setLoadError('Failed to load the assessment.');
      }
    })();
  }, []);

  const submit = async () => {
    if (!instrument || !session) return;
    setSubmitting(true);

    const mqtName: Record<string, string> = {};
    const totals: Record<string, number> = {};
    instrument.mqs.forEach((mq) => mq.mqts.forEach((t) => {
      mqtName[t.id] = t.name;
      totals[t.id] = 0;
    }));

    instrument.questions.forEach((q) => {
      const optIdx = answers[q.id];
      if (optIdx === undefined) return;
      const opt = q.options[optIdx];
      if (!opt) return;
      (opt.scores || []).forEach((s) => {
        totals[s.mqt_id] = (totals[s.mqt_id] || 0) + s.score;
      });
    });

    const byName: Record<string, number> = {};
    Object.entries(totals).forEach(([id, v]) => { byName[mqtName[id] || id] = v; });
    const summary = Object.entries(byName).map(([k, v]) => `${k}=${v}`).join(', ') || 'Submitted';

    try {
      await portalSessionsApi.update(session.id, {
        status: 'Completed',
        score: summary,
        answers,
        mqtScores: byName,
        completedAt: new Date().toISOString(),
      });
    } catch {
      // fall through — still navigate; session will remain Active if the write failed
    }

    window.location.href = `/portal/complete?id=${encodeURIComponent(session.id)}`;
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
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
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading assessment...</div>;
  }

  const total = instrument.questions.length;
  if (total === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
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
  const selected = answers[q.id];
  const answered = selected !== undefined;
  const isLast = index === total - 1;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{instrument.name}</p>
              <p className="text-xs text-muted-foreground">{user?.name} · Session {session.id}</p>
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

      <main className="max-w-3xl mx-auto px-5 py-8">
        <Card>
          <CardContent className="p-6 space-y-5">
            {q.stem && <p className="text-base font-medium leading-relaxed">{q.stem}</p>}
            <Media url={q.media_url} type={q.media_type} />

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
  );
}
