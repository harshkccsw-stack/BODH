import type { ReactNode } from 'react';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { RichText } from '@/lib/rich-text';
import { cn } from '@/lib/utils';

/** One label/value line of the summary box. */
function SummaryRow({ label, children, muted = false }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
      <span className={cn('shrink-0 max-w-[45%] text-xs uppercase tracking-wider', muted ? 'text-muted-foreground/70' : 'text-muted-foreground')}>
        {label}
      </span>
      <div className={cn('min-w-0 text-right break-words', muted ? 'text-xs text-muted-foreground/70' : 'font-medium')}>
        {children}
      </div>
    </div>
  );
}

// Terminal state of the take flow (folds in the old /portal/complete route).
// What it says is the assessment author's: the message under the respondent's
// name and the contact person come from the assessment (V46), the
// organization from the respondent's session. A row with nothing to show is
// left out rather than printed blank.
export function CompleteStep({
  assessmentName,
  mappingId,
  respondentName,
  organizationName,
  thankYouMessage,
  contactName,
  contactEmail,
  onBackToList,
}: {
  assessmentName: string;
  mappingId: number;
  respondentName?: string;
  organizationName?: string | null;
  /** Editor HTML; the server always sends one (its default when unset). */
  thankYouMessage: string;
  contactName?: string | null;
  contactEmail?: string | null;
  onBackToList: () => void;
}) {
  const { user } = useAuth();
  const logo = user?.organizationCoBrandLogoBase64 ?? null;

  return (
    <div className="flex-1 min-h-dvh w-full flex items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-10 bg-linear-to-br from-primary/10 via-background to-green-100/40 dark:to-green-950/20">
      <div className="w-full max-w-lg space-y-6">
        {/* The one screen in the flow with no BrandHeader — it is a centred
            card, and a sticky bar would break that. The logo is centred above
            the tick instead, so the assessment still closes co-branded.
            Rendered only when there is one: no logo, no gap, and the layout is
            exactly what it was before. */}
        {logo && (
          <div className="flex justify-center">
            <img
              src={logo}
              alt={organizationName ?? ''}
              className="h-10 w-auto max-w-48 rounded-md bg-white object-contain p-1"
            />
          </div>
        )}
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
          <CardContent className="space-y-5 p-6 text-center sm:p-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Thank you!</h1>
              {/* Smaller than the heading, larger than the message. Not part
                  of the authored text, so no author ever has to template it. */}
              {respondentName && (
                <p className="text-lg font-medium text-foreground/90 break-words sm:text-xl">{respondentName}</p>
              )}
              {/* Lists are left-aligned inside the centred block — centred
                  bullets read as a mistake. */}
              <RichText
                value={thankYouMessage}
                className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground [&_ol]:inline-block [&_ol]:text-left [&_ul]:inline-block [&_ul]:text-left"
              />
            </div>

            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-sm space-y-2">
              {organizationName && <SummaryRow label="Organization">{organizationName}</SummaryRow>}
              <SummaryRow label="Assessment">{assessmentName}</SummaryRow>
              {contactName && <SummaryRow label="Contact Person">{contactName}</SummaryRow>}
              {contactEmail && (
                <SummaryRow label="Contact Email">
                  <a href={`mailto:${contactEmail}`} className="text-primary break-all hover:underline">
                    {contactEmail}
                  </a>
                </SummaryRow>
              )}
              {/* The attempt's own id — what support asks for. Last and grey:
                  a reference, not part of the message. */}
              <SummaryRow label="Submission ID" muted>
                <span className="font-mono">#{mappingId}</span>
              </SummaryRow>
            </div>

            <div className="flex justify-center pt-2">
              <Button
                variant="primary"
                size="md"
                className="h-11 w-full sm:h-8.5 sm:w-auto sm:min-w-[14rem]"
                onClick={onBackToList}
              >
                <ClipboardList className="h-4 w-4" />
                My Assessments
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
