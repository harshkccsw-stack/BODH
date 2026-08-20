import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardCheck, LogOut, Play, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandHeader } from '@/components/brand-header';
import { useAuth } from '@/lib/auth';
import { config } from '@/config';

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const { user, signOut, refresh } = useAuth();

  // The allotted list rides on the auth payload — refetch /me on every visit
  // so assessments allotted (or completed) since login show up.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = async () => {
    await signOut();
    navigate('/portal/login', { replace: true });
  };

  // RequireAuth guarantees user is present here.
  if (!user) return null;

  const sessions = user.allottedAssessments;
  const active = sessions.filter((s) => s.assessmentStatus !== 'COMPLETED');
  const completed = sessions.filter((s) => s.assessmentStatus === 'COMPLETED');

  return (
    <div className="flex-1 min-h-dvh w-full bg-linear-to-b from-muted/30 via-background to-background">
      <BrandHeader
        title={`${config.appName} Portal`}
        subtitle={`${user.name} · ${user.serialId}`}
        maxWidth="5xl"
        right={
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        }
      />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:space-y-10 sm:px-5 sm:py-10 lg:px-8">
        <section className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary/80">Respondent dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {user.name}.</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              {sessions.length === 0
                ? 'You have no assessments assigned yet. When an administrator assigns one, it will appear below.'
                : 'These assessments have been assigned to you. Pick one to launch — your answers are saved automatically.'}
            </p>
          </div>

          {sessions.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-2">
              {/* basis-0 + grow: the two cards split a phone row evenly rather
                  than leaving a stranded 140px stub on the second line. */}
              <div className="min-w-[8.75rem] grow basis-0 rounded-xl border border-border bg-background px-4 py-3 sm:grow-0">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-2xl font-semibold text-primary">{active.length}</p>
              </div>
              <div className="min-w-[8.75rem] grow basis-0 rounded-xl border border-border bg-background px-4 py-3 sm:grow-0">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-semibold text-green-600">{completed.length}</p>
              </div>
            </div>
          )}
        </section>

        {active.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pending</h2>
              <span className="text-xs text-muted-foreground">{active.length} to complete</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {active.map((s) => {
                const started = s.assessmentStatus === 'ONGOING';
                // Submitted and staged — the backend digest is landing it in
                // the database. Finished as far as the respondent is
                // concerned, so no button leads back into the take flow (the
                // server would 409 it anyway).
                const processing = s.submissionPending;
                return (
                  <Card
                    key={s.respondentAssessmentMappingId}
                    className="group overflow-hidden hover:shadow-md transition-shadow border-border/70"
                  >
                    <CardContent className="space-y-4 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <ClipboardCheck className="h-5 w-5" />
                        </div>
                        {processing ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[0.6875rem] font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processing
                          </span>
                        ) : started ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[0.6875rem] font-medium">
                            In progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[0.6875rem] font-medium">
                            Not started
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-semibold leading-snug text-[0.9375rem]">{s.assessmentName}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-mono">#{s.respondentAssessmentMappingId}</span>
                        </div>
                      </div>
                      {processing ? (
                        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                          Your submission for this assessment is being processed — kindly
                          wait. It will move to Completed shortly.
                        </div>
                      ) : (
                        <Button
                          variant="primary"
                          size="md"
                          className="h-11 w-full sm:h-8.5"
                          onClick={() => navigate(`/portal/assessment/${s.respondentAssessmentMappingId}`)}
                        >
                          <Play className="h-4 w-4" />
                          {started ? 'Resume Assessment' : 'Launch Assessment'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Completed</h2>
              <span className="text-xs text-muted-foreground">{completed.length} submitted</span>
            </div>
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              {completed.map((s, i) => (
                <div
                  key={s.respondentAssessmentMappingId}
                  className={`flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-5 sm:py-4 ${i < completed.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.assessmentName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      #{s.respondentAssessmentMappingId}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-400">Submitted</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {sessions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center sm:p-14">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <ClipboardCheck className="h-7 w-7 text-muted-foreground/60" />
              </div>
              <p className="text-base font-semibold">Nothing here yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                When an administrator assigns you an assessment, you will see it here.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="mt-12 border-t border-border/60 sm:mt-16">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-8">
          <span>© {config.appName} — Respondent Portal</span>
          <span>Need help? Contact your administrator.</span>
        </div>
      </footer>
    </div>
  );
}
