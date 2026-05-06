import { useEffect, useState } from 'react';
import { Brain, ClipboardCheck, Clock, LogOut, Play, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { portalSessionsApi, respondentsApi, type PortalSession, type Respondent } from '@/lib/api';
import { formatDDMMYYYY } from '@/lib/helpers';
import { config } from '@/lib/config';

const AUTH_KEY = config.authStorageKey;

export default function PortalAssessmentsPage() {
  const [user, setUser] = useState<Respondent | null>(null);
  const [sessions, setSessions] = useState<PortalSession[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const token = sessionStorage.getItem(AUTH_KEY);
      if (!token) { window.location.href = '/portal/login'; return; }
      try {
        const me = await respondentsApi.me(token);
        setUser(me);
        try {
          const list = await portalSessionsApi.list(me.id);
          setSessions(list);
        } catch {
          setSessions([]);
        }
      } catch {
        // Token invalid/expired
        sessionStorage.removeItem(AUTH_KEY);
        window.location.href = '/portal/login';
      }
      setChecked(true);
    })();
  }, []);

  const logout = async () => {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (token) {
      try { await respondentsApi.logout(token); } catch {}
    }
    sessionStorage.removeItem(AUTH_KEY);
    window.location.href = '/portal/login';
  };

  if (!checked || !user) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const active = sessions.filter((s) => s.status !== 'Completed');
  const completed = sessions.filter((s) => s.status === 'Completed');

  return (
    <div className="flex-1 min-h-screen w-full bg-linear-to-b from-muted/30 via-background to-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Brain className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">BodhAssess Portal</p>
              <p className="text-xs text-muted-foreground">{user.name} · <span className="font-mono">{user.id}</span></p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 lg:px-8 py-10 space-y-10">
        <section className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary/80">Respondent dashboard</p>
            <h1 className="text-3xl font-semibold tracking-tight mt-1">Welcome back, {user.name.split(' ')[0]}.</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              {sessions.length === 0
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
              {active.map((s) => (
                <Card key={s.id} className="group overflow-hidden hover:shadow-md transition-shadow border-border/70">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <ClipboardCheck className="h-5 w-5" />
                      </div>
                      <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[0.6875rem] font-medium">
                        Pending
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <p className="font-semibold leading-snug text-[0.9375rem]">{s.instrumentFullName || s.instrument}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{s.id}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDDMMYYYY(s.createdAt)}</span>
                        <span>· {s.language}</span>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="md"
                      className="w-full"
                      onClick={() => { window.location.href = `/portal/take?id=${encodeURIComponent(s.id)}`; }}
                    >
                      <Play className="h-4 w-4" />
                      Launch Assessment
                    </Button>
                  </CardContent>
                </Card>
              ))}
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
                    <p className="font-medium truncate">{s.instrumentFullName || s.instrument}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{s.id}</p>
                  </div>
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">Submitted</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {sessions.length === 0 && (
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
          <span>© BodhAssess — Respondent Portal</span>
          <span>Need help? Contact your administrator.</span>
        </div>
      </footer>
    </div>
  );
}
