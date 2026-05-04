import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, LogOut } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { portalSessionsApi, respondentsApi, type PortalSession } from '@/lib/api';
import { config } from '@/lib/config';

const AUTH_KEY = config.authStorageKey;

export default function PortalCompletePage() {
  const [respondentName, setRespondentName] = useState('');
  const [session, setSession] = useState<PortalSession | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = sessionStorage.getItem(AUTH_KEY);
        if (token) {
          try {
            const me = await respondentsApi.me(token);
            setRespondentName(me.name || '');
          } catch {}
        }
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('id');
        if (sid) {
          try {
            const s = await portalSessionsApi.get(sid);
            setSession(s);
          } catch {}
        }
      } catch {}
    })();
  }, []);

  const logout = async () => {
    const token = sessionStorage.getItem(AUTH_KEY);
    if (token) { try { await respondentsApi.logout(token); } catch {} }
    sessionStorage.removeItem(AUTH_KEY);
    window.location.href = '/portal/login';
  };

  return (
    <div className="flex-1 min-h-screen w-full flex items-center justify-center px-4 py-10 bg-linear-to-br from-primary/10 via-background to-green-100/40 dark:to-green-950/20">
      <div className="w-full max-w-lg space-y-6">
        {/* Decorative check tile */}
        <div className="text-center">
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-green-500/15 animate-pulse" />
            <div className="absolute inset-2 rounded-full bg-green-500/25" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30">
              <CheckCircle2 className="h-9 w-9" />
            </div>
          </div>
        </div>

        <Card className="border-border/70 shadow-xl shadow-black/5">
          <CardContent className="p-8 text-center space-y-5">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Thank you!</h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                {respondentName ? `${respondentName}, your` : 'Your'} responses have been submitted securely.
                Your administrator will review them and share the report separately.
              </p>
            </div>

            {session && (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Questionnaire</span>
                  <span className="font-medium text-right break-words max-w-[65%]">{session.instrumentFullName || session.instrument}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">Assessment</span>
                  <span className="font-mono text-xs">{session.id}</span>
                </div>
                {session.completedAt && (
                  <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Submitted</span>
                    <span className="text-xs">{new Date(session.completedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
              <Button variant="outline" size="md" className="sm:flex-1" onClick={() => window.location.href = '/portal/assessments'}>
                <ClipboardList className="h-4 w-4" />
                My Assessments
              </Button>
              <Button variant="primary" size="md" className="sm:flex-1" onClick={logout}>
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Keep your Login ID and date of birth safe — you may be asked to log in again for follow-up assessments.
        </p>
      </div>
    </div>
  );
}
