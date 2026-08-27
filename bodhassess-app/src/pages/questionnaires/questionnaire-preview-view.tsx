import { useMemo } from 'react';
import { Circle, Clock, ExternalLink, Layers, ListChecks, Shuffle, Square } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { RichTextView } from '@/components/rich-text-editor';
import { selectionLabel, type QuestionType, type SelectionRule } from '../question-bank/questionApis';

// The respondent-view rendering of a questionnaire, with no data fetching of
// its own. The preview PAGE (/questionnaires/:id/preview) feeds it what the
// backend has; the create/edit wizard feeds it what is currently on screen —
// so "Preview" during authoring shows unsaved edits too.

/** Structural subset of QuestionOptionResponse this view needs. */
export interface PreviewOption {
  optionId: number;
  optionText: string | null;
  /** Optional help text under the label. Absent on callers written before it. */
  description?: string | null;
  contentType: string;
  mediaUrl: string | null;
}

/** Structural subset of QuestionResponse this view needs. */
export interface PreviewQuestion {
  questionId: number;
  sectionId: number | null;
  sortOrder: number | null;
  contentType: string;
  /** Absent = MCQ, so a caller written before question types still works. */
  questionType?: QuestionType;
  stem: string;
  /** Optional help text under the stem. Absent on callers written before it. */
  description?: string | null;
  mediaUrl: string | null;
  /** Both null = single choice; otherwise how many options may be picked. */
  selectionRule?: SelectionRule | null;
  selectionCount?: number | null;
  /**
   * MCQ only — the respondent gets these options in a random order. The
   * preview cannot show one: the order is per attempt, so it stays authored
   * and says so instead of pretending to be a particular respondent's screen.
   */
  shuffleOptions?: boolean;
  /** LINEAR_SCALE only — the ends of the slider. Null means 1—5. */
  scaleFrom?: number | null;
  scaleTo?: number | null;
  scaleLowLabel?: string | null;
  scaleHighLabel?: string | null;
  /** LIKERT_GRID only — the statements rated against `options`. */
  rows?: PreviewRow[];
  options: PreviewOption[];
}

/** Structural subset of QuestionRowResponse this view needs. */
export interface PreviewRow {
  questionRowId: number;
  rowText: string | null;
}

/** Structural subset of QuestionnaireResponse this view needs. */
export interface PreviewMeta {
  name: string;
  shortName: string | null;
  category: string | null;
  vertical: string | null;
  description: string | null;
  durationMinutes: number | null;
  generalInstruction: string | null;
  hasSections: boolean;
}

export interface PreviewSection {
  sectionId: number;
  name: string;
  instruction: string | null;
}

export interface PreviewDemographicField {
  demographicFieldId: number;
  label: string;
  fieldType: string;
  required: boolean;
}

/** Media block for a question or option whose contentType is not TEXT. */
export function MediaView({ contentType, mediaUrl, compact }: { contentType: string; mediaUrl: string | null; compact?: boolean }) {
  if (!mediaUrl) return null;
  if (contentType === 'IMAGE') {
    return <img src={mediaUrl} alt="" className={cn('rounded-md border border-border object-contain', compact ? 'max-h-24' : 'max-h-64')} />;
  }
  if (contentType === 'VIDEO') {
    return <video src={mediaUrl} controls className={cn('rounded-md border border-border', compact ? 'max-h-24' : 'max-h-64')} />;
  }
  if (contentType === 'URL') {
    return (
      <a href={mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ExternalLink className="h-3.5 w-3.5" /> {mediaUrl}
      </a>
    );
  }
  return null;
}

/** One question exactly as the respondent will meet it. */
export function QuestionView({ q, number }: { q: PreviewQuestion; number: number }) {
  // Multi-select questions get checkboxes and the same instruction line the
  // portal shows, so the preview is not quietly kinder than the real thing.
  const rule = q.selectionRule ?? null;
  const Marker = rule ? Square : Circle;
  // A linear scale is laid out the way the portal lays it out — a row of
  // points between the two labels — not as a stack of options called "1".."5".
  const isScale = q.questionType === 'LINEAR_SCALE';
  const isText = q.questionType === 'SHORT_ANSWER';
  // A grid is rows x columns, one pick per row — shown as the table the
  // respondent meets, so the preview is not quietly kinder than the portal.
  const gridRows = q.questionType === 'LIKERT_GRID' ? q.rows ?? [] : [];
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary shrink-0 mt-0.5">
          {number}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          {q.stem && <p className="text-sm font-medium">{q.stem}</p>}
          {q.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{q.description}</p>
          )}
          <MediaView contentType={q.contentType} mediaUrl={q.mediaUrl} />
        </div>
      </div>
      {rule && (
        <p className="pl-9 text-xs font-medium text-primary">
          {selectionLabel(rule, q.selectionCount ?? null, q.options.length)}
        </p>
      )}
      {q.shuffleOptions && !isScale && gridRows.length === 0 && (
        <p className="pl-9 text-xs text-muted-foreground inline-flex items-center gap-1">
          <Shuffle className="h-3 w-3" />
          Each respondent sees these options in a different order — shown here as authored.
        </p>
      )}
      {gridRows.length > 0 ? (
        <div className="pl-9 overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="text-left font-normal text-xs text-muted-foreground pb-2 pr-3" />
                {q.options.map((o) => (
                  <th key={o.optionId} className="font-normal text-xs text-muted-foreground pb-2 px-2 text-center whitespace-nowrap">
                    {o.optionText}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridRows.map((r) => (
                <tr key={r.questionRowId} className="border-t border-border">
                  <td className="py-2 pr-3 border-t border-border">{r.rowText}</td>
                  {q.options.map((o) => (
                    <td key={o.optionId} className="py-2 px-2 text-center border-t border-border">
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/50 inline-block" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : isText ? (
        <div className="pl-9">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Their answer…
          </div>
        </div>
      ) : isScale ? (
        /* The respondent drags a slider, so the preview is one — and unset,
           which is how they first meet it. */
        <div className="pl-9 space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="max-w-[40%] truncate">{q.scaleLowLabel}</span>
            <span className="max-w-[40%] truncate text-right">{q.scaleHighLabel}</span>
          </div>
          <div className="h-1.5 rounded-full bg-border" />
          <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
            <span>{q.scaleFrom ?? q.options[0]?.optionText ?? 1}</span>
            <span>{q.scaleTo ?? q.options[q.options.length - 1]?.optionText ?? 5}</span>
          </div>
        </div>
      ) : q.options.length > 0 && (
        <div className="space-y-1.5 pl-9">
          {q.options.map((o) => (
            // items-start, not items-center: an option with a description is
            // two lines tall and the marker belongs beside the label, not
            // floating in the middle of the pair.
            <div key={o.optionId} className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2">
              <Marker className={cn('h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5', rule && 'rounded-[3px]')} />
              <div className="min-w-0 flex-1 space-y-1">
                {o.optionText && <p className="text-sm">{o.optionText}</p>}
                {o.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{o.description}</p>
                )}
                <MediaView contentType={o.contentType} mediaUrl={o.mediaUrl} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function QuestionnairePreviewView({
  meta,
  sections,
  demoFields,
  questions,
}: {
  meta: PreviewMeta;
  sections: PreviewSection[];
  demoFields: PreviewDemographicField[];
  questions: PreviewQuestion[];
}) {
  // Questions grouped the way the respondent sees them. Global numbering runs
  // continuously across sections; questions left sectionless on a sectioned
  // questionnaire surface in their own group so nothing is silently hidden.
  const grouped = useMemo(() => {
    const bySort = (a: PreviewQuestion, b: PreviewQuestion) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.questionId - b.questionId;
    if (!meta.hasSections) {
      return [{ section: null as PreviewSection | null, questions: [...questions].sort(bySort) }];
    }
    const groups = sections.map((section) => ({
      section: section as PreviewSection | null,
      questions: questions.filter((q) => q.sectionId === section.sectionId).sort(bySort),
    }));
    const stray = questions.filter((q) => q.sectionId == null).sort(bySort);
    if (stray.length > 0) groups.push({ section: null, questions: stray });
    return groups;
  }, [meta.hasSections, sections, questions]);

  let running = 0;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
                {meta.name || <span className="italic text-muted-foreground">Untitled questionnaire</span>}
                {meta.shortName && (
                  <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {meta.shortName}
                  </span>
                )}
              </h1>
              {meta.description && <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>}
            </div>
            {meta.vertical && (
              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium shrink-0">
                {meta.vertical.charAt(0) + meta.vertical.slice(1).toLowerCase()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {meta.category && <span>{meta.category}</span>}
            {meta.durationMinutes != null && (
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {meta.durationMinutes} min</span>
            )}
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3 w-3" /> {questions.length} question{questions.length !== 1 ? 's' : ''}
            </span>
            {meta.hasSections && (
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" /> {sections.length} section{sections.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {meta.generalInstruction && (
            <RichTextView
              value={meta.generalInstruction}
              className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
            />
          )}
        </CardContent>
      </Card>

      {/* ── Demographic form ────────────────────────────────────────────── */}
      {demoFields.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Before you start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {demoFields.map((f) => (
              <div key={f.demographicFieldId} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <p className="text-sm">
                  {f.label}
                  {f.required && <span className="text-red-500 ml-0.5">*</span>}
                </p>
                <span className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{f.fieldType.toLowerCase()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Questions ───────────────────────────────────────────────────── */}
      {questions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No questions attached yet.
          </CardContent>
        </Card>
      ) : (
        grouped.map((group, gi) => (
          <Card key={group.section ? group.section.sectionId : `flat-${gi}`}>
            {(group.section || meta.hasSections) && (
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {group.section ? group.section.name : 'Without a section'}
                </CardTitle>
                {group.section?.instruction && (
                  <RichTextView
                    value={group.section.instruction}
                    className="text-sm text-muted-foreground"
                  />
                )}
              </CardHeader>
            )}
            <CardContent className="space-y-3">
              {group.questions.map((q) => {
                running += 1;
                return <QuestionView key={q.questionId} q={q} number={running} />;
              })}
              {group.questions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No questions in this section.</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
