import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Library,
  Loader2,
  Pencil,
  Plus,
  Search as SearchIcon,
  Trash2,
  Upload as UploadIcon,
  X,
} from 'lucide-react';
import {
  questionnairesApi,
  type QuestionnaireResponse,
  type SectionResponse,
} from '@/pages/questionnaires/questionnairesApi';
import {
  RichTextEditor,
  isBlankHtml,
  normalizeEditorHtml,
  toPlainText,
} from '@/components/rich-text-editor';
import { demographicsApi, type DemographicFieldResponse } from '@/pages/questionnaires/demographicsApi';
import { questionApis, type QuestionResponse } from './questionApis';
import { qualitiesApi } from '@/pages/MeasuredQuality/qualitiesApi';
// Step 2 authors questions INLINE with the same field set the Questions page
// shows in its modal — stem type, media URL, risk flag, options and both MQT
// score levels — so the whole question is editable on the page.
import {
  QuestionFormFields,
  choicesFromQualities,
  effectiveOptions,
  liveRows,
  formFrom,
  questionPayloadFrom,
  validateQuestionForm,
  type MqtChoice,
  type QuestionForm,
} from './question-form-modal';
import { QUESTION_TYPES } from './questionApis';
// Same XLSX template as the Questions page — here the `section` column maps
// each row onto one of THIS questionnaire's existing sections by name.
import { BulkUploadModal } from './question-bulk-upload';
// The Preview popup renders exactly what /questionnaires/:id/preview renders,
// but fed from the editor's current (possibly unsaved) state.
import {
  QuestionnairePreviewView,
  type PreviewQuestion,
} from '@/pages/questionnaires/questionnaire-preview-view';

/**
 * An instruction as it should be SENT: null when the editor holds nothing
 * visible, otherwise its markup reduced to the tags the API accepts.
 *
 * The editor already normalizes on blur, and clicking Save blurs it first —
 * this is the guarantee that does not depend on that ordering, because the
 * only thing the API does with a stray <div> is reject the whole save.
 */
function instructionPayload(html: string): string | null {
  return isBlankHtml(html) ? null : normalizeEditorHtml(html);
}

// ── Draft model ────────────────────────────────────────────────────────────
/**
 * One question as it sits in THIS questionnaire while authoring.
 *
 * `questionId` null means it does not exist in the bank yet — it is created
 * on save. A non-null id is a real bank question: edits go out as a PUT, and
 * because questions are shared bank items, those edits land in every other
 * questionnaire using it (`usedIn` says which).
 *
 * `baseline` is the JSON of `form` as last written to the backend, so a save
 * only PUTs questions the user actually touched.
 */
interface DraftQuestion {
  key: string;
  questionId: number | null;
  sectionId: number | null;
  form: QuestionForm;
  baseline: string;
  usedIn: Array<{ questionnaireId: number; name: string }>;
  expanded: boolean;
}

const newDraft = (sectionId: number | null): DraftQuestion => ({
  key: crypto.randomUUID(),
  questionId: null,
  sectionId,
  form: formFrom(null),
  baseline: '',
  usedIn: [],
  expanded: true,
});

/**
 * A bank question as a draft. `copy` clones the content into a brand-new bank
 * question (created on save) instead of linking the shared original.
 */
const draftFromQuestion = (
  q: QuestionResponse,
  sectionId: number | null,
  copy = false,
): DraftQuestion => {
  const form = formFrom(q);
  if (copy) form.id = null;
  return {
    key: crypto.randomUUID(),
    questionId: copy ? null : q.questionId,
    sectionId,
    form,
    baseline: copy ? '' : JSON.stringify(form),
    usedIn: copy ? [] : q.usedIn,
    expanded: false,
  };
};

// --- Component ---

export default function CreateAssessmentPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Numeric id of the catalog row Step 1 created/updated in spring-social.
  const [backendQid, setBackendQid] = useState<number | null>(null);

  // Questionnaire
  const [instName, setInstName] = useState('');
  const [instShortName, setInstShortName] = useState('');
  const [instVertical, setInstVertical] = useState('CLINICAL');
  const [instCategory, setInstCategory] = useState('');
  const [instDescription, setInstDescription] = useState('');
  const [instInstructions, setInstInstructions] = useState('');
  const [instDuration, setInstDuration] = useState(10);
  const [useSections, setUseSections] = useState(false);

  // Demographic field registry (spring-social) — Step 1 maps a subset onto
  // this questionnaire. Selection order becomes the form's sortOrder.
  const [demoFieldCatalog, setDemoFieldCatalog] = useState<DemographicFieldResponse[]>([]);
  const [demoSelection, setDemoSelection] = useState<Array<{ demographicFieldId: number; required: boolean }>>([]);

  useEffect(() => {
    demographicsApi.getDemographicFields()
      .then((r) => setDemoFieldCatalog(r.data))
      .catch(() => setDemoFieldCatalog([]));
  }, []);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Step 2: inline question authoring ─────────────────────────────────
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [qSections, setQSections] = useState<SectionResponse[]>([]);
  const [mqtChoices, setMqtChoices] = useState<MqtChoice[]>([]);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error, setStep2Error] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  // Optional per-section instruction, shown above the section's questions.
  const [newSectionInstruction, setNewSectionInstruction] = useState('');
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  // Which questionnaire's questions are already loaded — going back to Step 1
  // and forward again must NOT wipe unsaved authoring.
  const [loadedForQid, setLoadedForQid] = useState<number | null>(null);

  const loadStep2 = async (qid: number) => {
    setStep2Loading(true);
    setStep2Error('');
    try {
      const [secs, mine, mq] = await Promise.all([
        questionnairesApi.getQuestionnaireSections(qid),
        questionApis.getQuestionsByQuestionnaireId(qid),
        qualitiesApi.getQualities(),
      ]);
      setQSections(secs.data);
      setMqtChoices(choicesFromQualities(mq.data));
      // Kept in the order the server sent — section by section, positions
      // inside each. Re-sorting by sortOrder here would BRAID the sections
      // back together: sortOrder is per-section, so every section's first
      // question shares the value 0.
      setDrafts(mine.data.map((q) => draftFromQuestion(q, q.sectionId)));
      setLoadedForQid(qid);
    } catch (e: any) {
      setStep2Error(e?.response?.data?.message || e?.message || 'Failed to load this questionnaire’s questions');
    } finally {
      setStep2Loading(false);
    }
  };

  useEffect(() => {
    if (step === 2 && backendQid != null && loadedForQid !== backendQid) loadStep2(backendQid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, backendQid, loadedForQid]);

  // --- Draft list helpers ---

  const patchDraft = (key: string, patch: Partial<DraftQuestion>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const setDraftForm = (key: string, form: QuestionForm) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, form } : d)));

  const addDraft = (sectionId: number | null) =>
    setDrafts((prev) => [...prev, newDraft(sectionId)]);

  const removeDraft = (key: string) => {
    const d = drafts.find((x) => x.key === key);
    if (d?.form.stem.trim() && !window.confirm(
      d.questionId == null
        ? 'Discard this question? It has not been saved to the question bank yet.'
        : 'Remove this question from the questionnaire? It stays in the question bank.',
    )) return;
    setDrafts((prev) => prev.filter((x) => x.key !== key));
  };

  /**
   * Swap with the neighbouring draft in the same scope — the same section
   * when sections are on, the whole list when they are off (which is also
   * how the list renders, so the arrows always move what the user sees).
   */
  const moveDraft = (key: string, dir: -1 | 1) => {
    setDrafts((prev) => {
      const i = prev.findIndex((d) => d.key === key);
      if (i < 0) return prev;
      const scope = prev[i].sectionId;
      let j = i + dir;
      while (j >= 0 && j < prev.length && useSections && prev[j].sectionId !== scope) j += dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const setExpandedAll = (expanded: boolean) =>
    setDrafts((prev) => prev.map((d) => ({ ...d, expanded })));

  /** Drafts of one scope, in list order. */
  const scopeDrafts = (sectionId: number | null) =>
    drafts.filter((d) => (useSections ? d.sectionId === sectionId : true));

  /** 0 → A … 25 → Z, 26 → AA — mirrors the backend's spreadsheet lettering. */
  const sectionLetter = (index: number) => {
    let s = '';
    for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
      s = String.fromCharCode(65 + (n % 26)) + s;
    }
    return s;
  };

  /**
   * The report tag this placement gets on save. Computed exactly like the
   * backend stamps it (per-section 1-based counters; sections with no
   * questions claim no letter) so preview and stored tag agree.
   */
  const tagPreview = (sectionId: number | null, position: number) => {
    if (!useSections) return `Q_${position + 1}`;
    const lettered = qSections.filter((s) => drafts.some((d) => d.sectionId === s.sectionId));
    const idx = lettered.findIndex((s) => s.sectionId === sectionId);
    if (idx < 0) return `Q_${position + 1}`;
    return `Section_${sectionLetter(idx)}_Q_${position + 1}`;
  };

  // --- Sections (created/removed on the backend immediately) ---

  const addQSection = async () => {
    const name = newSectionName.trim();
    if (!name || backendQid == null) return;
    // Blankness is decided on the TEXT, not with trim(): an editor the author
    // typed in and cleared leaves "<p><br></p>" behind.
    const instruction = instructionPayload(newSectionInstruction);
    try {
      const res = await questionnairesApi.createQuestionnaireSection(backendQid, { name, instruction });
      setQSections((prev) => [...prev, res.data]);
      setNewSectionName('');
      setNewSectionInstruction('');
    } catch (e: any) {
      setStep2Error(e?.response?.data?.message || e?.message || 'Failed to create section');
    }
  };

  /**
   * Inline section editing. Sections are persisted the moment they are
   * created, so the header edits the live row: Save PUTs immediately and
   * there is no draft to lose. `editingSection` null means nobody is editing.
   */
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editSectionInstruction, setEditSectionInstruction] = useState('');
  const [sectionBusy, setSectionBusy] = useState(false);

  const startEditSection = (sec: SectionResponse) => {
    setEditingSection(sec.sectionId);
    setEditSectionName(sec.name);
    setEditSectionInstruction(sec.instruction || '');
    setStep2Error('');
  };

  const saveQSection = async () => {
    const name = editSectionName.trim();
    if (!name || backendQid == null || editingSection == null) return;
    setSectionBusy(true);
    try {
      const res = await questionnairesApi.updateQuestionnaireSection(backendQid, editingSection, {
        name,
        instruction: instructionPayload(editSectionInstruction),
      });
      setQSections((prev) => prev.map((s) => (s.sectionId === res.data.sectionId ? res.data : s)));
      setEditingSection(null);
    } catch (e: any) {
      setStep2Error(e?.response?.data?.message || e?.message || 'Failed to rename section');
    } finally {
      setSectionBusy(false);
    }
  };

  /**
   * Move a section one place up/down. The backend PUT takes the COMPLETE id
   * list, so it is sent from the swapped array; the list is applied optimistically
   * (the arrows have to feel instant) and rolled back if the PUT fails.
   *
   * Section order drives the Section_A/B/C report tags, which the backend
   * re-stamps on every placement — so `tagPreview` here and the stored tag
   * stay in step without re-saving the questions.
   */
  const moveQSection = async (sectionId: number, dir: -1 | 1) => {
    if (backendQid == null) return;
    const i = qSections.findIndex((s) => s.sectionId === sectionId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= qSections.length) return;
    const before = qSections;
    const next = [...qSections];
    [next[i], next[j]] = [next[j], next[i]];
    setQSections(next);
    setSectionBusy(true);
    try {
      const res = await questionnairesApi.reorderQuestionnaireSections(
        backendQid,
        next.map((s) => s.sectionId),
      );
      setQSections(res.data);
    } catch (e: any) {
      setQSections(before);
      setStep2Error(e?.response?.data?.message || e?.message || 'Failed to reorder sections');
    } finally {
      setSectionBusy(false);
    }
  };

  const removeQSection = async (sectionId: number) => {
    if (backendQid == null) return;
    try {
      await questionnairesApi.deleteQuestionnaireSection(backendQid, sectionId);
      if (editingSection === sectionId) setEditingSection(null);
      setQSections((prev) => prev.filter((s) => s.sectionId !== sectionId));
      // Its questions survive — they fall back to unassigned until re-placed.
      setDrafts((prev) => prev.map((d) => (d.sectionId === sectionId ? { ...d, sectionId: null } : d)));
    } catch (e: any) {
      setStep2Error(e?.response?.data?.message || e?.message || 'Failed to remove section');
    }
  };

  /**
   * XLSX import finished: the questions already exist in the bank — append
   * them as linked drafts in their matched section (all null on flat
   * questionnaires, where the sheet's section column is ignored).
   */
  const handleBulkCreated = (created: QuestionResponse[], sectionIds: (number | null)[]) => {
    setDrafts((prev) => [
      ...prev,
      ...created.map((q, i) => draftFromQuestion(q, useSections ? sectionIds[i] : null)),
    ]);
    setBulkUploadOpen(false);
  };

  // ---- Import questions from another questionnaire ----

  const [importOpen, setImportOpen] = useState(false);
  const [importStage, setImportStage] = useState<'questionnaire' | 'questions'>('questionnaire');
  const [importLibrary, setImportLibrary] = useState<QuestionnaireResponse[]>([]);
  const [importSource, setImportSource] = useState<QuestionnaireResponse | null>(null);
  const [importQuestions, setImportQuestions] = useState<QuestionResponse[]>([]);
  const [importPicked, setImportPicked] = useState<Set<number>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSearch, setImportSearch] = useState('');
  const [importQSearch, setImportQSearch] = useState('');
  // Link = attach the shared bank question (edits apply everywhere it is
  // used). Copy = duplicate it into a new, independent bank question.
  const [importMode, setImportMode] = useState<'link' | 'copy'>('link');
  const [importSection, setImportSection] = useState<number | null>(null);

  const openImport = async () => {
    setImportOpen(true);
    setImportStage('questionnaire');
    setImportSource(null);
    setImportQuestions([]);
    setImportPicked(new Set());
    setImportSearch('');
    setImportQSearch('');
    setImportError('');
    setImportSection(qSections[0]?.sectionId ?? null);
    setImportLoading(true);
    try {
      const res = await questionnairesApi.getQuestionnaires();
      setImportLibrary(res.data.filter((q) => q.questionnaireId !== backendQid && q.questionCount > 0));
    } catch (e: any) {
      setImportError(e?.response?.data?.message || e?.message || 'Failed to load the questionnaire library');
    } finally {
      setImportLoading(false);
    }
  };

  const pickImportSource = async (q: QuestionnaireResponse) => {
    setImportSource(q);
    setImportStage('questions');
    setImportPicked(new Set());
    setImportQSearch('');
    setImportError('');
    setImportLoading(true);
    try {
      // Server order (section by section) — see loadStep2 for why this must
      // not be re-sorted by sortOrder. The source questionnaire's sections are
      // not loaded here, so its own order is the only one available anyway.
      const res = await questionApis.getQuestionsByQuestionnaireId(q.questionnaireId);
      setImportQuestions(res.data);
    } catch (e: any) {
      setImportError(e?.response?.data?.message || e?.message || 'Failed to load that questionnaire’s questions');
    } finally {
      setImportLoading(false);
    }
  };

  const filteredImportLibrary = useMemo(() => {
    const s = importSearch.trim().toLowerCase();
    if (!s) return importLibrary;
    return importLibrary.filter(
      (q) =>
        q.name.toLowerCase().includes(s) ||
        (q.shortName || '').toLowerCase().includes(s) ||
        (q.category || '').toLowerCase().includes(s) ||
        (q.vertical || '').toLowerCase().includes(s),
    );
  }, [importLibrary, importSearch]);

  const filteredImportQuestions = useMemo(() => {
    const s = importQSearch.trim().toLowerCase();
    if (!s) return importQuestions;
    return importQuestions.filter(
      (q) =>
        q.stem.toLowerCase().includes(s) ||
        q.options.some((o) => (o.optionText || '').toLowerCase().includes(s)),
    );
  }, [importQuestions, importQSearch]);

  /** Bank ids already in this questionnaire — linking one twice is rejected. */
  const linkedIds = useMemo(
    () => new Set(drafts.map((d) => d.questionId).filter((id): id is number => id != null)),
    [drafts],
  );

  const confirmImport = () => {
    const picked = importQuestions.filter((q) => importPicked.has(q.questionId));
    if (picked.length === 0) { setImportOpen(false); return; }
    const section = useSections ? importSection : null;
    setDrafts((prev) => [...prev, ...picked.map((q) => draftFromQuestion(q, section, importMode === 'copy'))]);
    setImportOpen(false);
  };

  // ---- Preview (respondent view of what's on screen right now) ----

  const [previewOpen, setPreviewOpen] = useState(false);

  const previewMeta = useMemo(
    () => ({
      name: instName.trim(),
      shortName: instShortName.trim() || null,
      category: instCategory.trim() || null,
      vertical: instVertical || null,
      description: instDescription.trim() || null,
      durationMinutes: Number.isFinite(instDuration) ? instDuration : null,
      generalInstruction: instructionPayload(instInstructions),
      hasSections: useSections,
    }),
    [instName, instShortName, instCategory, instVertical, instDescription, instDuration, instInstructions, useSections],
  );

  const previewDemoFields = useMemo(
    () =>
      demoSelection
        .map((e) => {
          const f = demoFieldCatalog.find((c) => c.demographicFieldId === e.demographicFieldId);
          return f ? { demographicFieldId: f.demographicFieldId, label: f.label, fieldType: f.fieldType, required: e.required } : null;
        })
        .filter((f): f is NonNullable<typeof f> => f != null),
    [demoSelection, demoFieldCatalog],
  );

  const previewQuestions = useMemo<PreviewQuestion[]>(() => {
    const counters = new Map<string, number>();
    return drafts.map((d, i) => {
      const scope = String(useSections ? d.sectionId ?? 'none' : 'flat');
      const position = counters.get(scope) ?? 0;
      counters.set(scope, position + 1);
      return {
        questionId: d.questionId ?? -(i + 1),
        sectionId: useSections ? d.sectionId : null,
        sortOrder: position,
        contentType: d.form.contentType,
        questionType: d.form.questionType,
        stem: d.form.stem.trim(),
        // Gated on showDescription exactly as the payload is, so the preview
        // shows what will actually be saved rather than what is still typed
        // into a box the author has since unticked.
        description: d.form.showDescription ? d.form.description.trim() || null : null,
        mediaUrl: d.form.mediaUrl.trim() || null,
        // Straight off the draft form, so Preview shows the selection rule of
        // an unsaved edit too — the whole point of previewing here.
        selectionRule: d.form.selectionRule || null,
        selectionCount: d.form.selectionRule ? Number(d.form.selectionCount) || null : null,
        shuffleOptions: d.form.shuffleOptions,
        scaleLowLabel: d.form.scaleLowLabel || null,
        scaleHighLabel: d.form.scaleHighLabel || null,
        // Draft rows have no id yet — index is enough for a preview key.
        rows: liveRows(d.form).map((r, ri) => ({ questionRowId: ri, rowText: r.rowText })),
        // effectiveOptions, not form.options: a scale's points are generated
        // on save, so they exist nowhere on the draft — the preview has to
        // show them anyway.
        options: effectiveOptions(d.form).map((o, oi) => ({
          optionId: oi,
          optionText: o.optionText || null,
          description: o.showDescription ? o.description.trim() || null : null,
          contentType: o.contentType,
          mediaUrl: o.mediaUrl || null,
        })),
      };
    });
  }, [drafts, useSections]);

  // ---- Edit mode: ?edit=<id> loads the catalog entry from the new API ----
  const [editMode, setEditMode] = useState(false);
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const editKey = params.get('edit');
      if (!editKey) return;
      const id = Number(editKey);
      if (!Number.isInteger(id)) {
        setError(`Invalid questionnaire id "${editKey}".`);
        return;
      }
      try {
        const res = await questionnairesApi.getQuestionnaireById(id);
        const q = res.data;
        setInstName(q.name || '');
        setInstShortName(q.shortName || '');
        setInstVertical((q.vertical || 'CLINICAL').toUpperCase());
        setInstCategory(q.category || '');
        setInstDescription(q.description || '');
        setInstInstructions(q.generalInstruction || '');
        setInstDuration(q.durationMinutes ?? 10);
        setUseSections(q.hasSections);
        setBackendQid(q.questionnaireId);
        try {
          const m = await questionnairesApi.getQuestionnaireDemographicFields(id);
          setDemoSelection(m.data.map((e) => ({ demographicFieldId: e.demographicFieldId, required: e.required })));
        } catch { /* mapping is optional — an empty form is valid */ }
        setEditMode(true);
        setSuccess(`Editing "${q.name}" — Step 1 saves to the catalog when you continue.`);
      } catch (e: any) {
        setError(`Failed to load questionnaire ${id}: ${e?.message || 'unknown error'}`);
      }
    })();
  }, []);

  // ---- Verticals: fixed backend enum — custom verticals are gone ----
  const VERTICAL_OPTIONS = [
    { code: 'CLINICAL', name: 'Clinical' },
    { code: 'INDUSTRIAL', name: 'Industrial' },
    { code: 'COUNSELLING', name: 'Counselling' },
    { code: 'EXPERIMENTS', name: 'Experiments' },
    { code: 'WHITELABEL', name: 'Whitelabel' },
    { code: 'RESEARCH', name: 'Research' },
    { code: 'OTHER', name: 'Other' },
  ];

  // ---- Create/Save ----

  const handleCreateQuestionnaire = async () => {
    if (!instName.trim() || !instVertical) {
      setError('Name and vertical are required');
      return;
    }
    // Step 1 persists the catalog entry (payload mirrors QuestionnaireRequest
    // 1:1); Steps 2-3 attach questions and scoring to it.
    const payload = {
      name: instName.trim(),
      shortName: instShortName.trim() || null,
      category: instCategory.trim() || null,
      vertical: instVertical,
      description: instDescription.trim() || null,
      durationMinutes: Number.isFinite(instDuration) ? instDuration : null,
      generalInstruction: instructionPayload(instInstructions),
      hasSections: useSections,
    };
    setSaving(true);
    try {
      let qid = backendQid;
      if (qid != null) {
        await questionnairesApi.updateQuestionnaire(qid, payload);
      } else {
        const res = await questionnairesApi.createQuestionnaire(payload);
        qid = res.data.questionnaireId;
        setBackendQid(qid);
      }
      // Persist the demographic form mapping (replace-all; order = sortOrder).
      await questionnairesApi.setQuestionnaireDemographicFields(qid, demoSelection);
      setError('');
      setSuccess('');
      setStep(2);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save questionnaire');
    } finally {
      setSaving(false);
    }
  };

  /** Flatten drafts into the placement payload; per-scope order = sortOrder. */
  const buildMappingEntries = (list: DraftQuestion[]) => {
    const counters = new Map<string, number>();
    return list.map((d) => {
      const scope = String(useSections ? d.sectionId : 'flat');
      const sortOrder = counters.get(scope) ?? 0;
      counters.set(scope, sortOrder + 1);
      return { questionId: d.questionId as number, sectionId: useSections ? d.sectionId : null, sortOrder };
    });
  };

  /**
   * Writes everything Step 2 owns, in an order that is safe to retry:
   *   1. PUT each edited bank question (a 409 on a locked question aborts
   *      before anything else is written),
   *   2. bulk-create the new ones (all-or-nothing) and record their ids in
   *      state immediately, so a retry never creates them twice,
   *   3. PUT the placement mapping.
   */
  const handleSaveQuestions = async () => {
    if (backendQid == null) {
      setError('Save Step 1 first — the questionnaire must exist before questions attach to it.');
      return;
    }
    if (drafts.length === 0) {
      setError('Add at least one question');
      return;
    }
    // Pass 1 — validate everything before writing anything.
    const seen = new Set<number>();
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const problem = validateQuestionForm(d.form);
      if (problem) {
        patchDraft(d.key, { expanded: true });
        setError(`Question ${i + 1}: ${problem}`);
        return;
      }
      if (useSections && d.sectionId == null) {
        setError(`Question ${i + 1} has no section — assign one (this questionnaire uses sections).`);
        return;
      }
      if (d.questionId != null && !seen.add(d.questionId)) {
        setError(`Question ${i + 1} is already in this questionnaire — a question can appear only once.`);
        return;
      }
    }
    setSaving(true);
    try {
      const next = [...drafts];
      // 1 — edited bank questions.
      for (let i = 0; i < next.length; i++) {
        const d = next[i];
        if (d.questionId == null) continue;
        const snapshot = JSON.stringify(d.form);
        if (snapshot === d.baseline) continue;
        const res = await questionApis.updateQuestion(d.questionId, questionPayloadFrom(d.form));
        next[i] = { ...d, baseline: snapshot, usedIn: res.data.usedIn };
      }
      // 2 — brand-new questions, in one all-or-nothing call.
      const newIdx = next.map((d, i) => (d.questionId == null ? i : -1)).filter((i) => i >= 0);
      if (newIdx.length > 0) {
        const res = await questionApis.bulkCreateQuestions(newIdx.map((i) => questionPayloadFrom(next[i].form)));
        res.data.forEach((created, k) => {
          const i = newIdx[k];
          const form = { ...next[i].form, id: created.questionId };
          next[i] = {
            ...next[i],
            questionId: created.questionId,
            form,
            baseline: JSON.stringify(form),
            usedIn: created.usedIn,
          };
        });
      }
      setDrafts(next);
      // 3 — placement.
      const entries = buildMappingEntries(next);
      await questionnairesApi.setQuestionnaireQuestions(backendQid, entries);
      setError('');
      setSuccess(`Saved ${entries.length} question${entries.length === 1 ? '' : 's'} to "${instName}".`);
      setStep(3);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save questions');
    } finally {
      setSaving(false);
    }
  };

  // --- Step 2 rendering ---

  const renderDraftCard = (d: DraftQuestion, position: number) => {
    const stem = d.form.stem.trim();
    // What the respondent will see: authored options on an MCQ, the generated
    // points on a scale — so the summary never reads "0 options" on a scale.
    const optionCount = effectiveOptions(d.form).length;
    const rowCount = liveRows(d.form).length;
    const typeLabel = QUESTION_TYPES.find((t) => t.value === d.form.questionType)?.label;
    const sharedWith = d.usedIn.filter((u) => u.questionnaireId !== backendQid);
    return (
      <Card key={d.key} className="overflow-hidden">
        <div className="flex items-start gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <button
            type="button"
            onClick={() => patchDraft(d.key, { expanded: !d.expanded })}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            title={d.expanded ? 'Collapse question' : 'Expand question'}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', d.expanded && 'rotate-90')} />
          </button>
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {position + 1}
          </span>
          <button
            type="button"
            onClick={() => patchDraft(d.key, { expanded: !d.expanded })}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-sm font-medium">
              {stem || <span className="italic text-muted-foreground">Untitled question</span>}
            </p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">
              <span className="font-mono" title="Auto-generated report tag — saved with the questionnaire">
                {tagPreview(d.sectionId, position)}
              </span>
              {d.form.questionType !== 'MCQ' && <>{' · '}{typeLabel}</>}
              {d.form.questionType === 'LIKERT_GRID'
                ? <>{' · '}{rowCount} row{rowCount !== 1 ? 's' : ''} × {optionCount} column{optionCount !== 1 ? 's' : ''}</>
                : d.form.questionType === 'SHORT_ANSWER'
                  ? <>{' · '}typed answer</>
                  : <>{' · '}{optionCount} option{optionCount !== 1 ? 's' : ''}</>}
              {d.questionId == null
                ? ' · new — added to the question bank when you save'
                : ` · bank question #${d.questionId}`}
              {sharedWith.length > 0 && ` · shared with ${sharedWith.length} other questionnaire${sharedWith.length !== 1 ? 's' : ''} — edits apply there too`}
            </p>
          </button>
          {useSections && qSections.length > 0 && (
            <select
              value={d.sectionId ?? ''}
              onChange={(e) => patchDraft(d.key, { sectionId: e.target.value ? Number(e.target.value) : null })}
              className="h-7 shrink-0 rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
              title="Section"
            >
              <option value="">— no section —</option>
              {qSections.map((s) => (
                <option key={s.sectionId} value={s.sectionId}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => moveDraft(d.key, -1)}
            className="mt-0.5 shrink-0 p-1 text-muted-foreground hover:text-foreground"
            title="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveDraft(d.key, 1)}
            className="mt-0.5 shrink-0 p-1 text-muted-foreground hover:text-foreground"
            title="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => removeDraft(d.key)}
            className="mt-0.5 shrink-0 p-1 text-muted-foreground hover:text-red-500"
            title={d.questionId == null ? 'Discard this question' : 'Remove from this questionnaire (stays in the bank)'}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {d.expanded && (
          <CardContent className="p-4">
            {sharedWith.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[0.6875rem] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This is a shared bank question — editing it also changes{' '}
                  {sharedWith.map((u) => u.name).join(', ')}. Import it as a copy instead if you need
                  an independent version.
                </span>
              </div>
            )}
            <QuestionFormFields
              form={d.form}
              onChange={(form) => setDraftForm(d.key, form)}
              choices={mqtChoices}
            />
          </CardContent>
        )}
      </Card>
    );
  };

  const addQuestionButton = (sectionId: number | null) => (
    <Button variant="outline" size="sm" onClick={() => addDraft(sectionId)}>
      <Plus className="h-3.5 w-3.5" /> Add Question
    </Button>
  );

  const unassigned = useSections ? drafts.filter((d) => d.sectionId == null) : [];

  return (
    <div className="p-5 lg:p-7.5 space-y-7 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button
            onClick={() => {
              if (step === 2) { setStep(1); setError(''); return; }
              if (step === 3) { window.location.href = '/questionnaires'; return; }
              if (window.history.length > 1) window.history.back();
              else window.location.href = '/question-bank';
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === 2 ? 'Back to Questionnaire Details' : step === 3 ? 'View Library' : 'Back'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Question Bank</span><span>/</span>
          <span className="text-foreground font-medium">{editMode ? 'Edit Questionnaire' : 'Create Questionnaire'}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{editMode ? 'Edit Questionnaire' : 'Create Questionnaire'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {editMode
            ? 'Update questions, options, media, and scoring. Publishing will replace the existing version in the Questionnaire Library.'
            : 'Define your instrument with Measured Qualities (MQ) and their MQTs, then score each option against one or more MQTs.'}
        </p>
      </div>

      <DraftBanner />

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {[
          { n: 1, label: 'Define Questionnaire' },
          { n: 2, label: 'Add Questions' },
          { n: 3, label: 'Published' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold', step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              {step > s.n ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span className={cn('text-sm', step >= s.n ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
            {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="h-3 w-3" /></button>
        </div>
      )}
      {success && step !== 2 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          <Check className="h-4 w-4" /> {success}
        </div>
      )}

      {/* ===== STEP 1 ===== */}
      {step === 1 && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Questionnaire Details</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Questionnaire Name *</label>
                  <input value={instName} onChange={(e) => setInstName(e.target.value)} placeholder="e.g., Engineering Graduate Aptitude Test" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Short Name</label>
                  <input value={instShortName} onChange={(e) => setInstShortName(e.target.value)} placeholder="e.g., EGAT" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Vertical *</label>
                  <select
                    value={instVertical}
                    onChange={(e) => setInstVertical(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {VERTICAL_OPTIONS.map((v) => (
                      <option key={v.code} value={v.code}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Category</label>
                  <input value={instCategory} onChange={(e) => setInstCategory(e.target.value)} placeholder="e.g., Cognitive Aptitude" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Duration (minutes)</label>
                  <input type="number" min={0} value={instDuration} onChange={(e) => setInstDuration(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea value={instDescription} onChange={(e) => setInstDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">General Instruction</label>
                <RichTextEditor
                  ariaLabel="General instruction"
                  value={instInstructions}
                  onChange={setInstInstructions}
                  contentClassName="min-h-[9rem]"
                />
                <p className="text-xs text-muted-foreground">
                  Optional — shown to the respondent before the first question.
                  Bold, italics, underline, lists and headings are supported;
                  other formatting and pasted styling are stripped.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">Demographic Fields</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {demoSelection.length === 0
                        ? 'None selected — respondents skip the demographic form'
                        : `${demoSelection.length} selected`}
                    </span>
                    {demoFieldCatalog.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDemoSelection(demoFieldCatalog.map((f) => {
                            const prev = demoSelection.find((e) => e.demographicFieldId === f.demographicFieldId);
                            return { demographicFieldId: f.demographicFieldId, required: prev?.required ?? false };
                          }))}
                          className="text-[0.6875rem] font-medium text-primary hover:underline"
                        >
                          Select all
                        </button>
                        <span className="text-[0.6875rem] text-muted-foreground">·</span>
                        <button
                          type="button"
                          onClick={() => setDemoSelection([])}
                          className="text-[0.6875rem] font-medium text-primary hover:underline"
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {demoFieldCatalog.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
                    No demographic fields defined yet. Manage them at <a href="/questionnaires/demographics" className="text-primary hover:underline">Questionnaire Library → Demographic Fields</a>.
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {demoFieldCatalog.map((f) => {
                        const entry = demoSelection.find((e) => e.demographicFieldId === f.demographicFieldId);
                        return (
                          <div
                            key={f.demographicFieldId}
                            className={cn(
                              'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors',
                              entry ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={!!entry}
                              onChange={(e) => {
                                setDemoSelection((prev) =>
                                  e.target.checked
                                    ? [...prev, { demographicFieldId: f.demographicFieldId, required: false }]
                                    : prev.filter((x) => x.demographicFieldId !== f.demographicFieldId),
                                );
                              }}
                              className="mt-0.5 rounded"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="font-medium truncate block">{f.label}</span>
                              <span className="text-[0.625rem] text-muted-foreground truncate block">{f.fieldType.toLowerCase()}</span>
                            </div>
                            {entry && (
                              <button
                                type="button"
                                onClick={() => setDemoSelection((prev) =>
                                  prev.map((x) => x.demographicFieldId === f.demographicFieldId
                                    ? { ...x, required: !x.required }
                                    : x),
                                )}
                                className={cn(
                                  'shrink-0 rounded border px-1.5 py-0.5 text-[0.625rem] font-medium transition-colors',
                                  entry.required
                                    ? 'border-primary text-primary bg-primary/10'
                                    : 'border-border text-muted-foreground hover:text-foreground',
                                )}
                                title="Toggle whether respondents must fill this field"
                              >
                                {entry.required ? 'Required' : 'Optional'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="text-[0.6875rem] text-muted-foreground">
                  Respondents fill the selected fields before starting this questionnaire. Selection order becomes the form order.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm" title="Organize questions into labelled sections (e.g., Part A, Part B)">
                <input type="checkbox" checked={useSections} onChange={(e) => setUseSections(e.target.checked)} className="rounded" /> Organize into sections
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleCreateQuestionnaire} disabled={saving}>
              {saving ? 'Saving…' : editMode || backendQid != null ? 'Save & Continue to Questions' : 'Create & Continue to Questions'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* ===== STEP 2 ===== */}
      {step === 2 && (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                {useSections ? 'Add Questions to Sections' : 'Add Questions'}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {drafts.length} question{drafts.length !== 1 ? 's' : ''}
                </span>
                {drafts.length > 0 && (
                  <>
                    <button type="button" onClick={() => setExpandedAll(true)} className="text-[0.6875rem] font-medium text-primary hover:underline">
                      Expand all
                    </button>
                    <span className="text-[0.6875rem] text-muted-foreground">·</span>
                    <button type="button" onClick={() => setExpandedAll(false)} className="text-[0.6875rem] font-medium text-primary hover:underline">
                      Collapse all
                    </button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={openImport}>
                  <Library className="h-3.5 w-3.5" /> Import from Questionnaire
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkUploadOpen(true)}>
                  <UploadIcon className="h-3.5 w-3.5" /> Upload XLSX
                </Button>
                {!useSections && addQuestionButton(null)}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {step2Error && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {step2Error}
                </div>
              )}

              {step2Loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading questions…
                </p>
              ) : !useSections ? (
                <div className="space-y-3">
                  {drafts.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
                      <p className="text-sm text-muted-foreground">No questions yet.</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Write one here, import from another questionnaire, or upload an XLSX.
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        {addQuestionButton(null)}
                        <Button variant="outline" size="sm" onClick={openImport}>
                          <Library className="h-3.5 w-3.5" /> Import from Questionnaire
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {drafts.map((d, i) => renderDraftCard(d, i))}
                      <div className="flex justify-center pt-1">{addQuestionButton(null)}</div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex gap-2">
                      <input
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addQSection(); }}
                        placeholder="New section name — e.g., Part A"
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <Button variant="outline" onClick={addQSection} disabled={!newSectionName.trim()}>
                        <Plus className="h-4 w-4" /> Add Section
                      </Button>
                    </div>
                    <RichTextEditor
                      ariaLabel="New section instruction"
                      value={newSectionInstruction}
                      onChange={setNewSectionInstruction}
                      contentClassName="min-h-[5rem] max-h-[16rem]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Section instruction (optional) — shown above this section's questions.
                    </p>
                  </div>
                  {qSections.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      This questionnaire uses sections — add the first section to start writing questions.
                    </p>
                  ) : (
                    qSections.map((sec, secIndex) => {
                      const list = scopeDrafts(sec.sectionId);
                      const editing = editingSection === sec.sectionId;
                      return (
                        <div key={sec.sectionId} className="rounded-lg border border-border">
                          {editing ? (
                            /* Same two fields as the Add Section box, filled in. */
                            <div className="space-y-2 border-b border-border bg-muted/40 px-3 py-2.5">
                              <input
                                value={editSectionName}
                                onChange={(e) => setEditSectionName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveQSection();
                                  if (e.key === 'Escape') setEditingSection(null);
                                }}
                                autoFocus
                                placeholder="Section name"
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                              />
                              <RichTextEditor
                                ariaLabel="Section instruction"
                                value={editSectionInstruction}
                                onChange={setEditSectionInstruction}
                                contentClassName="min-h-[5rem] max-h-[16rem]"
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setEditingSection(null)} disabled={sectionBusy}>
                                  Cancel
                                </Button>
                                <Button variant="primary" size="sm" onClick={saveQSection} disabled={sectionBusy || !editSectionName.trim()}>
                                  {sectionBusy ? 'Saving…' : 'Save Section'}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{sec.name}</p>
                                {/* One tight line in a header row — bullets and
                                    headings would break the layout, so the
                                    instruction is flattened to its words here
                                    and rendered properly in the preview. */}
                                {sec.instruction && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {toPlainText(sec.instruction)}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[0.6875rem] text-muted-foreground">
                                  {list.length} question{list.length !== 1 ? 's' : ''}
                                </span>
                                {addQuestionButton(sec.sectionId)}
                                <button
                                  type="button"
                                  onClick={() => moveQSection(sec.sectionId, -1)}
                                  disabled={secIndex === 0 || sectionBusy}
                                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                                  title="Move section up"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveQSection(sec.sectionId, 1)}
                                  disabled={secIndex === qSections.length - 1 || sectionBusy}
                                  className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                                  title="Move section down"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditSection(sec)}
                                  className="p-1 text-muted-foreground hover:text-foreground"
                                  title="Edit section name and instruction"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeQSection(sec.sectionId)}
                                  className="text-muted-foreground hover:text-red-500"
                                  title="Remove section (its questions become unassigned)"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="space-y-3 p-3">
                            {list.length === 0 ? (
                              <p className="py-3 text-center text-xs text-muted-foreground">
                                No questions in this section yet.
                              </p>
                            ) : (
                              list.map((d, i) => renderDraftCard(d, i))
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {unassigned.length > 0 && (
                    <div className="rounded-lg border border-amber-300 dark:border-amber-900">
                      <div className="flex items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-300">Unassigned</p>
                        <span className="text-[0.6875rem] text-amber-800 dark:text-amber-400">
                          Pick a section for each — saving needs every question placed.
                        </span>
                      </div>
                      <div className="space-y-3 p-3">
                        {unassigned.map((d, i) => renderDraftCard(d, i))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" onClick={() => { setStep(1); setError(''); }}>
              <ChevronLeft className="h-4 w-4" /> Previous Step
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={drafts.length === 0}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button variant="primary" onClick={handleSaveQuestions} disabled={saving || drafts.length === 0}>
                {saving ? 'Saving…' : 'Save Questions & Continue'}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Bulk XLSX upload — same modal/template as the Questions page,
              plus section matching. Unmounts on close so its state resets. */}
          {bulkUploadOpen && (
            <BulkUploadModal
              choices={mqtChoices}
              onClose={() => setBulkUploadOpen(false)}
              questionnaire={{
                hasSections: useSections,
                sections: qSections.map((s) => ({ sectionId: s.sectionId, name: s.name })),
                onCreated: handleBulkCreated,
              }}
            />
          )}
        </>
      )}

      {/* ===== STEP 3 ===== */}
      {step === 3 && (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">Saved to Questionnaire Library</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              <strong>{instName}</strong> is live with {drafts.length} question{drafts.length !== 1 ? 's' : ''}
              {useSections ? ` across ${qSections.length} section${qSections.length !== 1 ? 's' : ''}` : ''}
              {demoSelection.length > 0 ? ` and ${demoSelection.length} demographic field${demoSelection.length !== 1 ? 's' : ''}` : ''}.
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={() => window.location.href = '/questionnaires'}>View in Library</Button>
              <Button
                variant="outline"
                onClick={() => { if (backendQid != null) window.location.href = `/questionnaires/${backendQid}/preview`; }}
                disabled={backendQid == null}
              >
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  // The create form is its own page now; ?questionnaire=<id>
                  // preselects the questionnaire just saved.
                  window.location.href = backendQid != null
                    ? `/assessment-library/assessments/create?questionnaire=${backendQid}`
                    : '/assessment-library/assessments/create';
                }}
              >
                Create Assessment
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Preview popup — respondent view of the current draft ===== */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setPreviewOpen(false)}>
          <Card className="my-auto flex max-h-[90vh] w-full max-w-3xl flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex shrink-0 flex-row items-center justify-between border-b border-border pb-3">
              <div>
                <CardTitle className="text-base">Preview</CardTitle>
                <p className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
                  Respondent view · unsaved edits included
                </p>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto p-5">
              <QuestionnairePreviewView
                meta={previewMeta}
                sections={qSections}
                demoFields={previewDemoFields}
                questions={previewQuestions}
              />
            </CardContent>
            <div className="flex shrink-0 justify-end border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
            </div>
          </Card>
        </div>
      )}

      {/* ===== Import questions from another questionnaire ===== */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setImportOpen(false)}>
          <Card className="flex max-h-[85vh] w-full max-w-3xl flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex shrink-0 flex-row items-center justify-between pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base">
                  {importStage === 'questionnaire' ? 'Import from another questionnaire' : importSource?.name}
                </CardTitle>
                <p className="truncate text-[0.6875rem] text-muted-foreground">
                  {importStage === 'questionnaire'
                    ? 'Pick the questionnaire to take questions from.'
                    : 'Tick the questions to add to this questionnaire.'}
                </p>
              </div>
              <button onClick={() => setImportOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {importError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                  {importError}
                </div>
              )}

              {importStage === 'questionnaire' ? (
                <>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={importSearch}
                      onChange={(e) => setImportSearch(e.target.value)}
                      placeholder="Search questionnaires…"
                      className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
                    />
                  </div>
                  {importLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading library…
                    </p>
                  ) : filteredImportLibrary.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {importLibrary.length === 0
                        ? 'No other questionnaire has questions yet.'
                        : `No questionnaire matches “${importSearch.trim()}”.`}
                    </p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border">
                      {filteredImportLibrary.map((q) => (
                        <button
                          key={q.questionnaireId}
                          type="button"
                          onClick={() => pickImportSource(q)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {q.name}
                              {q.shortName && (
                                <span className="ml-2 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
                                  {q.shortName}
                                </span>
                              )}
                            </p>
                            <p className="truncate text-[0.6875rem] text-muted-foreground">
                              {q.questionCount} question{q.questionCount !== 1 ? 's' : ''}
                              {q.vertical && ` · ${q.vertical.charAt(0) + q.vertical.slice(1).toLowerCase()}`}
                              {q.category && ` · ${q.category}`}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setImportStage('questionnaire')}>
                      <ChevronLeft className="h-3.5 w-3.5" /> Other questionnaire
                    </Button>
                    <div className="relative flex-1 min-w-48">
                      <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={importQSearch}
                        onChange={(e) => setImportQSearch(e.target.value)}
                        placeholder="Search questions…"
                        className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setImportPicked(new Set(
                        filteredImportQuestions
                          .filter((q) => importMode === 'copy' || !linkedIds.has(q.questionId))
                          .map((q) => q.questionId),
                      ))}
                      className="text-[0.6875rem] font-medium text-primary hover:underline"
                    >
                      Select all
                    </button>
                    <span className="text-[0.6875rem] text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={() => setImportPicked(new Set())}
                      className="text-[0.6875rem] font-medium text-primary hover:underline"
                    >
                      Clear
                    </button>
                  </div>

                  {importLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading questions…
                    </p>
                  ) : filteredImportQuestions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {importQuestions.length === 0
                        ? 'That questionnaire has no questions.'
                        : `No question matches “${importQSearch.trim()}”.`}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredImportQuestions.map((q) => {
                        const already = importMode === 'link' && linkedIds.has(q.questionId);
                        const checked = importPicked.has(q.questionId);
                        return (
                          <label
                            key={q.questionId}
                            className={cn(
                              'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors',
                              checked ? 'border-primary bg-primary/5' : 'border-border',
                              already && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={already}
                              onChange={() => setImportPicked((prev) => {
                                const next = new Set(prev);
                                if (next.has(q.questionId)) next.delete(q.questionId);
                                else next.add(q.questionId);
                                return next;
                              })}
                              className="mt-1 shrink-0 rounded"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm">
                                {q.stem || <span className="italic text-muted-foreground">(media question)</span>}
                              </p>
                              <p className="text-[0.6875rem] text-muted-foreground">
                                {q.options.length} option{q.options.length !== 1 ? 's' : ''}
                                {q.mqtScores.length > 0 && ` · ${q.mqtScores.length} question-level score${q.mqtScores.length !== 1 ? 's' : ''}`}
                                {q.riskFlag && ' · risk flag'}
                                {already && ' · already in this questionnaire'}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>

            {importStage === 'questions' && (
              <div className="shrink-0 space-y-2 border-t border-border px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-medium">Add as</span>
                  <div className="flex overflow-hidden rounded-md border border-border">
                    {(['link', 'copy'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setImportMode(m)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium transition-colors',
                          importMode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {m === 'link' ? 'Linked' : 'Copy'}
                      </button>
                    ))}
                  </div>
                  <span className="flex-1 text-[0.6875rem] text-muted-foreground">
                    {importMode === 'link'
                      ? 'The same bank question — later edits change it in every questionnaire that uses it.'
                      : 'An independent duplicate — added to the question bank as a new question when you save.'}
                  </span>
                  {useSections && (
                    <label className="flex items-center gap-1.5 text-xs">
                      Into section
                      <select
                        value={importSection ?? ''}
                        onChange={(e) => setImportSection(e.target.value ? Number(e.target.value) : null)}
                        className="h-8 rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
                      >
                        <option value="">— unassigned —</option>
                        {qSections.map((s) => (
                          <option key={s.sectionId} value={s.sectionId}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {importPicked.size} selected
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={confirmImport} disabled={importPicked.size === 0}>
                      Add {importPicked.size > 0 ? importPicked.size : ''} Question{importPicked.size !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Inline banner that surfaces the Git-style versioning model whenever
 * the editor was opened from the new Versions page. Reads
 *   ?draftMode=1&parentId=<pid>
 * (set by the Edit button on /questionnaires/:id/versions) and tells
 * the admin that saves go to a draft and a commit is required before
 * the change is available to assessments.
 *
 * Renders nothing when those params are absent, so the legacy edit
 * flow is unchanged.
 */
function DraftBanner() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const draftMode = params.get('draftMode') === '1';
  const parentId = params.get('parentId') || '';
  if (!draftMode || !parentId) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm flex items-start gap-3 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-amber-900 dark:text-amber-300">You're editing a draft.</p>
        <p className="text-xs text-amber-800/80 dark:text-amber-400/80 mt-0.5">
          Saves stay on this draft. When you're done, head back to the version history
          and use <strong>Commit</strong> to materialize a new committed version.
          Committed versions are locked — admins can't edit them, only branch new
          drafts from them.
        </p>
      </div>
      <a
        href={`/questionnaires/${encodeURIComponent(parentId)}/versions`}
        className="inline-flex items-center gap-1 rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
      >
        Back to Versions →
      </a>
    </div>
  );
}
