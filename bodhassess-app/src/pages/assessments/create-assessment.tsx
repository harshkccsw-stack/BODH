import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardCheck,
  Loader2,
  Search,
  Settings2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor, isBlankHtml, normalizeEditorHtml } from '@/components/rich-text-editor';
import { cn } from '@/lib/utils';
import {
  assessmentsApi,
  type AssessmentPayload,
  type AssessmentStatus,
} from './assessmentApis';
import {
  questionnairesApi,
  type QuestionnaireResponse,
} from '../questionnaires/questionnairesApi';

// Full-page Create/Edit Assessment, replacing the modal the Assessment
// Library used to open. Same page serves both modes, the way the
// questionnaire editor does: no `?edit=` is a create, `?edit=<id>` loads that
// assessment and PUTs. `?questionnaire=<id>` preselects the questionnaire —
// the questionnaire wizard's finish screen links here with it.

interface AssessmentForm {
  name: string;
  questionnaireId: string; // '' = not picked yet
  status: AssessmentStatus;
  showTermsAndConditions: boolean;
  autoNext: boolean;
  showQuestionIndex: boolean;
  startDate: string; // '' = not set; otherwise 'YYYY-MM-DD'
  endDate: string;
  /** Consent body as the editor's HTML. Kept even while the toggle is off. */
  termsAndConditions: string;
}

const EMPTY_FORM: AssessmentForm = {
  name: '',
  questionnaireId: '',
  status: 'INACTIVE',
  showTermsAndConditions: true,
  autoNext: false,
  showQuestionIndex: true,
  startDate: '',
  endDate: '',
  termsAndConditions: '', // replaced by the server's template once loaded
};

const LIBRARY_PATH = '/assessment-library/assessments';

/** One labelled toggle row inside the settings card. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="mt-0.5 shrink-0"
      />
    </label>
  );
}

export default function CreateAssessmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const editIdParam = searchParams.get('edit');
  const editId = editIdParam && /^\d+$/.test(editIdParam) ? Number(editIdParam) : null;
  const preselectQid = searchParams.get('questionnaire');

  const [form, setForm] = useState<AssessmentForm>(() => ({
    ...EMPTY_FORM,
    questionnaireId: preselectQid && /^\d+$/.test(preselectQid) ? preselectQid : '',
  }));
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [qSearch, setQSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Load the questionnaire catalog, plus the assessment itself in edit mode.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError('');
      setLoading(true);
      try {
        const [qn, existing, template] = await Promise.all([
          questionnairesApi.getQuestionnaires(),
          editId != null ? assessmentsApi.getAssessmentById(editId) : Promise.resolve(null),
          // Only a new assessment needs the starting text; an existing one
          // always carries its own (the server substitutes the same default
          // for rows saved before the field existed).
          editId != null ? Promise.resolve(null) : assessmentsApi.getTermsTemplate(),
        ]);
        if (cancelled) return;
        setQuestionnaires(qn.data);
        if (template) {
          setForm((f) => ({ ...f, termsAndConditions: template.data.termsAndConditions }));
        }
        if (existing) {
          const a = existing.data;
          setForm({
            name: a.name,
            questionnaireId: String(a.questionnaireId),
            status: a.status,
            showTermsAndConditions: a.showTermsAndConditions,
            autoNext: a.autoNext,
            showQuestionIndex: a.showQuestionIndex,
            startDate: a.startDate ?? '',
            endDate: a.endDate ?? '',
            termsAndConditions: a.termsAndConditions,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(
            e?.response?.data?.message || e?.message || 'Failed to load this page',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const filteredQuestionnaires = useMemo(() => {
    if (!qSearch) return questionnaires;
    const s = qSearch.toLowerCase();
    return questionnaires.filter(
      (q) =>
        q.name.toLowerCase().includes(s) ||
        (q.shortName ?? '').toLowerCase().includes(s),
    );
  }, [questionnaires, qSearch]);

  const picked = questionnaires.find(
    (q) => String(q.questionnaireId) === form.questionnaireId,
  );

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { setFormError('Assessment name is required'); return; }
    if (!form.questionnaireId) { setFormError('Pick the questionnaire this assessment offers'); return; }
    if (form.showTermsAndConditions && isBlankHtml(form.termsAndConditions)) {
      setFormError('Terms & conditions cannot be empty while the terms gate is on');
      return;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      // Both are 'YYYY-MM-DD', so a string compare is a date compare.
      setFormError('End date must be on or after the start date');
      return;
    }
    const payload: AssessmentPayload = {
      name,
      questionnaireId: Number(form.questionnaireId),
      status: form.status,
      showTermsAndConditions: form.showTermsAndConditions,
      // Sent whether the gate is on or off — that is what preserves the text
      // across a toggle off/on round trip. Normalized first: an author who
      // cleared the box and retyped it gets the browser's own <div> line
      // breaks, which the API refuses.
      termsAndConditions: normalizeEditorHtml(form.termsAndConditions),
      autoNext: form.autoNext,
      showQuestionIndex: form.showQuestionIndex,
      // Empty input clears the stored date — send null, not ''.
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    };
    setFormError('');
    setSaving(true);
    try {
      if (editId != null) {
        await assessmentsApi.updateAssessment(editId, payload);
      } else {
        await assessmentsApi.createAssessment(payload);
      }
      navigate(LIBRARY_PATH);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Assessment Library</span><span>/</span>
          <span className="text-foreground font-medium">
            {editId != null ? 'Edit Assessment' : 'Create Assessment'}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" />
              {editId != null ? 'Edit Assessment' : 'Create Assessment'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              An assessment offers one questionnaire under a chosen
              configuration. The same questionnaire can back many assessments.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(LIBRARY_PATH)}>
            <ArrowLeft className="h-4 w-4" /> Back to Assessments
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading…</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Name ─────────────────────────────────────────────────── */}
          <Card>
            <CardContent className="p-5">
              <label className="text-sm font-medium">
                Assessment Name <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Engineering Intake 2026 — Batch A"
                className={cn(inputClass, 'mt-1.5')}
              />
            </CardContent>
          </Card>

          {/* ── Settings ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="py-3.5">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                Assessment Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className={cn(inputClass, 'mt-1.5')}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className={cn(inputClass, 'mt-1.5')}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Both dates are optional and are recorded for reference — access
                is controlled by the Active toggle below, not by the window.
              </p>

              <div className="mt-3 divide-y divide-border border-t border-border">
                <ToggleRow
                  label="Active"
                  hint="Only active assessments can be allotted and taken."
                  checked={form.status === 'ACTIVE'}
                  onChange={(v) => setForm({ ...form, status: v ? 'ACTIVE' : 'INACTIVE' })}
                />
                <div>
                  <ToggleRow
                    label="Show terms & conditions before starting"
                    hint="Respondents must read them to the end and accept before the first question."
                    checked={form.showTermsAndConditions}
                    onChange={(v) => setForm({ ...form, showTermsAndConditions: v })}
                  />
                  {/* Editing only appears with the gate on, but the text is
                      kept either way — switching off and on again must not
                      cost the author their wording. */}
                  {form.showTermsAndConditions && (
                    <div className="pb-4">
                      <RichTextEditor
                        ariaLabel="Terms and conditions"
                        value={form.termsAndConditions}
                        onChange={(html) => setForm((f) => ({ ...f, termsAndConditions: html }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        This is what respondents see and agree to. Bold, lists
                        and headings are supported; other formatting and pasted
                        styling are stripped.
                      </p>
                    </div>
                  )}
                </div>
                <ToggleRow
                  label="Auto-advance to the next question"
                  hint="Moves on as soon as an option is selected."
                  checked={form.autoNext}
                  onChange={(v) => setForm({ ...form, autoNext: v })}
                />
                <ToggleRow
                  label="Show question index"
                  hint="The navigator panel that lets respondents jump between questions."
                  checked={form.showQuestionIndex}
                  onChange={(v) => setForm({ ...form, showQuestionIndex: v })}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Questionnaire ────────────────────────────────────────── */}
          <Card>
            <CardHeader className="py-3.5">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Select Questionnaire <span className="text-red-500">*</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search questionnaires..."
                  value={qSearch}
                  onChange={(e) => setQSearch(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
                />
              </div>

              {filteredQuestionnaires.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <p className="text-sm font-medium">
                    {questionnaires.length === 0 ? 'No questionnaires yet' : 'No matches'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {questionnaires.length === 0
                      ? 'Build one in the Questionnaire Library first — an assessment must offer one.'
                      : 'Try a different search term.'}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
                  {filteredQuestionnaires.map((q) => {
                    const value = String(q.questionnaireId);
                    const isPicked = form.questionnaireId === value;
                    return (
                      <li key={q.questionnaireId}>
                        <label
                          className={cn(
                            'flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                            isPicked
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-muted/40',
                          )}
                        >
                          <input
                            type="radio"
                            name="questionnaire"
                            value={value}
                            checked={isPicked}
                            onChange={() => setForm({ ...form, questionnaireId: value })}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{q.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {q.questionCount} question{q.questionCount !== 1 ? 's' : ''}
                              {q.category ? ` · ${q.category}` : ''}
                            </p>
                          </div>
                          {isPicked && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {picked && picked.questionCount === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  This questionnaire has no questions yet — respondents would see an empty assessment.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Footer ───────────────────────────────────────────────── */}
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {formError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate(LIBRARY_PATH)}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editId != null ? 'Save Changes' : 'Create Assessment'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
