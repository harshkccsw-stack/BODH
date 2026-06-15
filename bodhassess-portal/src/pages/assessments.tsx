import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardCheck, Clock, LogOut, Play, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandHeader } from '@/components/brand-header';
import { portalSessionsApi, type PortalSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { config } from '@/config';
import { formatDDMMYYYY } from '@/lib/helpers';

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sessions, setSessions] = useState<PortalSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    portalSessionsApi
      .list(user.id)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoaded(true));
  }, [user]);

  const logout = async () => {
    await signOut();
    navigate('/portal/login', { replace: true });
  };

  // RequireAuth guarantees user is present here.
  if (!user) return null;

  const active = sessions.filter((s) => s.status !== 'Completed');
  const completed = sessions.filter((s) => s.status === 'Completed');

  // "Started" once at least one answer or demographic field is filled — every
  // freshly-allotted session begins in 'Active', so status alone isn't enough.
  const hasStarted = (s: PortalSession): boolean => {
    const answerCount = s.answers ? Object.keys(s.answers).length : 0;
    const demoCount = s.demographics ? Object.keys(s.demographics).length : 0;
    return answerCount + demoCount > 0;
  };

  return (
    <div className="flex-1 min-h-screen w-full bg-linear-to-b from-muted/30 via-background to-background">
      <BrandHeader
        title={`${config.appName} Portal`}
        subtitle={`${user.name} · ${user.id}`}
        maxWidth="5xl"
        right={
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        }
      />

      <main className="max-w-5xl mx-auto px-5 lg:px-8 py-10 space-y-10">
        <section className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary/80">Respondent dashboard</p>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">Welcome back, {user.name}.</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              {loaded && sessions.length === 0
                ? 'You have no assessments assigned yet. When an administrator assigns one, it will appear below.'
                : 'These assessments have been assigned to you. Pick one to launch — your answers are saved automatically.'}
            </p>
          </div>

          {sessions.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-2">
              <div className="rounded-xl border border-border bg-background px-4 py-3 min-w-[140px]">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-2xl font-semibold text-primary">{active.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3 min-w-[140px]">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {active.map((s) => {
                const started = hasStarted(s);
                return (
                  <Card key={s.id} className="group overflow-hidden hover:shadow-md transition-shadow border-border/70">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <ClipboardCheck className="h-5 w-5" />
                        </div>
                        {started ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[0.6875rem] font-medium">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[0.6875rem] font-medium">
                            Not started
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-semibold leading-snug text-[0.9375rem]">
                          {s.name || s.instrumentFullName || s.instrument}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-mono">{s.id}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDDMMYYYY(s.createdAt)}
                          </span>
                          {s.language && <span>· {s.language}</span>}
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full"
                        onClick={() => navigate(`/portal/assessment/${encodeURIComponent(s.id)}`)}
                      >
                        <Play className="h-4 w-4" />
                        {started ? 'Resume Assessment' : 'Launch Assessment'}
                      </Button>
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
                  key={s.id}
                  className={`flex items-center gap-4 px-5 py-4 ${i < completed.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/30">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.name || s.instrumentFullName || s.instrument}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{s.id}</p>
                  </div>
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">Submitted</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {loaded && sessions.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-14 text-center">
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

      <footer className="border-t border-border/60 mt-16">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 py-5 text-xs text-muted-foreground flex items-center justify-between">
          <span>© {config.appName} — Respondent Portal</span>
          <span>Need help? Contact your administrator.</span>
        </div>
      </footer>
    </div>
  );
}
