import { CheckCircle2, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Terminal state of the take flow (folds in the old /portal/complete route).
export function CompleteStep({
  assessmentName,
  questionnaireName,
  mappingId,
  respondentName,
  onBackToList,
}: {
  assessmentName: string;
  questionnaireName?: string;
  mappingId: number;
  respondentName?: string;
  onBackToList: () => void;
}) {
  return (
    <div className="flex-1 min-h-dvh w-full flex items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-10 bg-linear-to-br from-primary/10 via-background to-green-100/40 dark:to-green-950/20">
      <div className="w-full max-w-lg space-y-6">
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
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                {respondentName ? `${respondentName}, your` : 'Your'} responses have been submitted securely. Your
                administrator will review them and share the report separately.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-sm space-y-2">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Questionnaire</span>
                <span className="font-medium text-right break-words max-w-[65%]">
                  {questionnaireName || assessmentName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">Assessment</span>
                <span className="font-mono text-xs">#{mappingId}</span>
              </div>
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
