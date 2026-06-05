import { useEffect, useState } from 'react';
import { useParams } from '@/src/lib/router-helpers';
import { Brain, Check, ChevronLeft, ChevronRight, AlertTriangle, FlaskConical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { questionnairesApi } from '@/lib/api';

/**
 * Public, no-login PREVIEW of a single questionnaire version.
 *
 * Route: /preview/:versionId — reachable without authentication so authors
 * can share a "test link" (see the Test link button on the versions page).
 * It renders the exact content of a version (draft or committed) and lets
 * you click through the questions, but NOTHING is persisted: there is no
 * session, no respondent, no answers saved, and no scoring submitted.
 *
 * Content is resolved by version id via the already-public
 * GET /questionnaires/{id}, so any version row works.
 */

interface QOption { text: string; media_url?: string; media_type?: string; }
interface Question {
  id: string;
  stem: string;
  format: string;
  media_url: string;
  media_type: string;
  options: QOption[];
}
interface StoredQuestionnaire {
  id: string;
  name: string;
  shortName?: string;
  questions: Question[];
  instructions?: string;
  showInstructions?: boolean;
}

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

export default function PreviewQuestionnairePage() {
  const params = useParams();
  const versionId = params.versionId as string | undefined;

  const [instrument, setInstrument] = useState<StoredQuestionnaire | null>(null);
  const [loadError, setLoadError] = useState('');
  const [index, setIndex] = useState(0);
  // Local-only answers — never sent anywhere.
  const [answers, setAnswers] = useState<Record<string, number | string>>({});

  useEffect(() => {
    (async () => {
      if (!versionId) { setLoadError('No questionnaire version specified.'); return; }
      try {
        const res = await questionnairesApi.get(versionId);
        if (!res) { setLoadError('This questionnaire version was not found.'); return; }
        setInstrument(res as any);
      } catch {
        setLoadError('This questionnaire version was not found.');
      }
    })();
  }, [versionId]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Preview unavailable</p>
              <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!instrument) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading preview…</div>;
  }

  const total = instrument.questions.length;
  if (total === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20 p-6">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            This version has no questions yet.
          </CardContent>
        </Card>
      </div>
    );
  }

  const q = instrument.questions[index];
  const selected = answers[q.id];
  const isFreeText = String(q.format || '').toUpperCase().replace(/_/g, '') === 'FREETEXT';
  const isLast = index === total - 1;
  const progress = Math.round(((index + 1) / total) * 100);

  return (
    <div className="flex-1 min-h-screen w-full bg-muted/20">
      {/* Unmissable banner so a preview is never mistaken for a live assessment. */}
      <div className="bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-300">
        <div className="mx-auto max-w-3xl px-5 py-2 flex items-center gap-2 text-xs font-medium">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" />
          Preview mode — this is a test walkthrough. Your responses are not saved.
        </div>
      </div>

      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{instrument.name}</p>
              <p className="text-xs text-muted-foreground">Preview · {instrument.id}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">Question {index + 1} of {total}</div>
        </div>
        <div className="h-1 bg-muted">
          <div className="h-1 bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-8">
        <main>
          <Card>
            <CardContent className="p-6 space-y-5">
              {q.stem && <p className="text-base font-medium leading-relaxed">{q.stem}</p>}
              <Media url={q.media_url} type={q.media_type} />

              {isFreeText ? (
                <textarea
                  rows={7}
                  value={typeof selected === 'string' ? selected : ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="Type your answer here…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y"
                />
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
              <Button variant="primary" disabled title="Preview only — nothing is submitted">
                End of preview
                <Check className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setIndex(index + 1)}>
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
