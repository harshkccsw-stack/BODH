import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Link2,
  Plus,
  Save,
  Search as SearchIcon,
  Trash2,
  Upload as UploadIcon,
  Video,
  X,
  Youtube,
} from 'lucide-react';
import { getMQs, getQuestionnaires, type MQ as StoredMQ, type StoredQuestionnaire } from '@/lib/data-store';
import { API_BASE } from '@/lib/api';
import { questionnairesApi, type SectionResponse } from '@/pages/questionnaires/questionnairesApi';
import { demographicsApi, type DemographicFieldResponse } from '@/pages/questionnaires/demographicsApi';
import { questionApis, type QuestionResponse as BankQuestion } from './questionApis';

// --- Types ---

type MediaType = 'none' | 'image' | 'video' | 'youtube' | 'audio';

interface MQT {
  id: string;
  name: string;
  children?: MQT[];
}

interface MQ {
  id: string;
  name: string;
  mqts: MQT[];
}

// Flatten the MQT tree under each MQ into one row per MQT with a breadcrumb
// path ("MQ > Parent > Leaf") for the option-score picker.
// When an MQ has a single trait with the same name (the "MQ-level scoring"
// shape produced by bulk imports that only specify MQ), the path collapses
// to just the MQ name so the user sees and operates at the MQ level.
function flattenMqtsForPicker(
  mqs: MQ[],
): Array<{ mq: MQ; mqt: MQT; path: string }> {
  const out: Array<{ mq: MQ; mqt: MQT; path: string }> = [];
  const walk = (mq: MQ, nodes: MQT[], parentLabels: string[]) => {
    for (const n of nodes) {
      const isMqLevel =
        parentLabels.length === 0 &&
        mq.mqts.length === 1 &&
        n.name.toLowerCase() === mq.name.toLowerCase() &&
        !n.children?.length;
      const label = isMqLevel
        ? mq.name
        : [mq.name, ...parentLabels, n.name].join(' > ');
      out.push({ mq, mqt: n, path: label });
      if (n.children?.length) walk(mq, n.children, [...parentLabels, n.name]);
    }
  };
  mqs.forEach((mq) => walk(mq, mq.mqts, []));
  return out;
}

interface OptionMqtScore {
  mqt_id: string;
  score: number;
}

// Stable, case-insensitive map key for a nested trait path under an MQ —
// e.g. ("Wellbeing", ["Stress", "Acute"]). Used by the bulk importer to match
// a parsed scoring entry to the leaf-trait id created while walking the tree.
function scorePathKey(mq: string, path: string[]): string {
  return [mq, ...path].map((s) => s.toLowerCase()).join('›');
}

// MQ/MQT coverage tags for a question. Which qualities/traits the question
// measures, independent of the option/question scoring above.
interface Coverage {
  mqs: string[];
  mqts: string[];
}

interface QuestionOption {
  text: string;
  scores: OptionMqtScore[];
  media_url?: string;
  media_type?: MediaType;
}

interface Question {
  id: string;
  stem: string;
  format: string;
  media_url: string;
  media_type: MediaType;
  options: QuestionOption[];
  // Question-level scores, applied on any answer regardless of which option
  // (or free-text response) was given. Stored at the same shape as option
  // scores so the picker UI and resolver can be reused.
  question_scores: OptionMqtScore[];
  coverage: Coverage;
  clinical_risk_flag: boolean;
  risk_flag_rule: string;
  sectionId?: string;
  sectionTitle?: string;
}

// Normalize a possibly-missing coverage object from stored/imported data.
function normalizeCoverage(c: any): Coverage {
  return {
    mqs: Array.isArray(c?.mqs) ? c.mqs.map(String) : [],
    mqts: Array.isArray(c?.mqts) ? c.mqts.map(String) : [],
  };
}

const FORMATS = ['MCQ', 'RATING_SCALE', 'LIKERT', 'SJT', 'FREE_TEXT', 'IMAGE_CHOICE', 'RANKING', 'MATRIX'];
const VERTICALS = ['CLINICAL', 'INDUSTRIAL', 'COUNSELLING', 'EXPERIMENTS'];
const TIERS = ['T1', 'T2', 'T3', 'T4', 'T5'];
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'mr', label: 'Marathi' },
  { code: 'kn', label: 'Kannada' },
  { code: 'bn', label: 'Bengali' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'or', label: 'Odia' },
  { code: 'pa', label: 'Punjabi' },
];

// Best-effort display name for a vertical when only its code is known
// (e.g. orphan verticals recovered from questionnaires whose original name
// was lost because the POST to /verticals silently failed).
function humanizeVerticalCode(code: string): string {
  const lowered = code.toLowerCase().replace(/_/g, ' ');
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

// --- Upload helper ---
async function uploadFile(file: File): Promise<{ url: string; media_type: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
}

function MediaPreview({ url, type }: { url: string; type: MediaType }) {
  if (!url || type === 'none') return null;
  if (type === 'image') return <img src={url} alt="" className="max-h-40 rounded-lg border border-border" />;
  if (type === 'video') return <video src={url} controls className="max-h-40 rounded-lg border border-border" />;
  if (type === 'youtube') {
    const id = extractYouTubeId(url);
    if (!id) return <p className="text-xs text-red-500">Invalid YouTube URL</p>;
    return (
      <iframe
        src={`https://www.youtube.com/embed/${id}`}
        className="w-full max-w-md aspect-video rounded-lg border border-border"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (type === 'audio') return <audio src={url} controls className="w-full max-w-md" />;
  return null;
}

function MediaPicker({
  url,
  type,
  onChange,
}: {
  url: string;
  type: MediaType;
  onChange: (url: string, type: MediaType) => void;
}) {
  const [mode, setMode] = useState<MediaType>(type);
  const [youtubeUrl, setYoutubeUrl] = useState(type === 'youtube' ? url : '');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadFile(file);
      onChange(res.url, res.media_type as MediaType);
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 p-3 border border-dashed border-border rounded-lg bg-muted/30">
      <div className="flex items-center gap-1 flex-wrap">
        <button type="button" onClick={() => { setMode('none'); onChange('', 'none'); }} className={cn('px-2 py-1 text-xs rounded border', mode === 'none' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border')}>
          No Media
        </button>
        <button type="button" onClick={() => setMode('image')} className={cn('px-2 py-1 text-xs rounded border flex items-center gap-1', mode === 'image' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border')}>
          <ImageIcon className="h-3 w-3" /> Image
        </button>
        <button type="button" onClick={() => setMode('video')} className={cn('px-2 py-1 text-xs rounded border flex items-center gap-1', mode === 'video' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border')}>
          <Video className="h-3 w-3" /> Video
        </button>
        <button type="button" onClick={() => setMode('youtube')} className={cn('px-2 py-1 text-xs rounded border flex items-center gap-1', mode === 'youtube' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border')}>
          <Youtube className="h-3 w-3" /> YouTube
        </button>
        <button type="button" onClick={() => setMode('audio')} className={cn('px-2 py-1 text-xs rounded border flex items-center gap-1', mode === 'audio' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border')}>
          🎵 Audio
        </button>
      </div>

      {(mode === 'image' || mode === 'video' || mode === 'audio') && (
        <div className="flex items-center gap-2">
          <input type="file" ref={inputRef} onChange={handleFileChange} accept={mode === 'image' ? 'image/*' : mode === 'video' ? 'video/*' : 'audio/*'} className="hidden" />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <UploadIcon className="h-3 w-3" />
            {uploading ? 'Uploading...' : `Upload ${mode}`}
          </Button>
          {url && mode === type && <span className="text-xs text-muted-foreground truncate">✓ Uploaded</span>}
        </div>
      )}

      {mode === 'youtube' && (
        <div className="flex gap-2">
          <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
          <Button variant="outline" size="sm" onClick={() => onChange(youtubeUrl, 'youtube')}>
            <Link2 className="h-3 w-3" /> Attach
          </Button>
        </div>
      )}

      {url && type === mode && type !== 'none' && (
        <div className="mt-2"><MediaPreview url={url} type={type} /></div>
      )}
    </div>
  );
}

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
  const [instDisclaimer, setInstDisclaimer] = useState('');
  const [instShowInstructions, setInstShowInstructions] = useState(false);
  const [instInstructions, setInstInstructions] = useState('');
  const [instDuration, setInstDuration] = useState(10);
  const [instTier, setInstTier] = useState('T1');
  const [instLanguages, setInstLanguages] = useState<string[]>(['en']);
  const [instIsAdaptive, setInstIsAdaptive] = useState(false);
  const [instIsFixed, setInstIsFixed] = useState(true);
  const [useSections, setUseSections] = useState(false);
  const [sections, setSections] = useState<Array<{ id: string; title: string }>>([]);

  // Measured Qualities are managed on the /qualities page. Every defined MQ
  // and its MQTs are made available here automatically — no per-assessment
  // selection step.
  const [catalog, setCatalog] = useState<StoredMQ[]>([]);

  useEffect(() => {
    getMQs().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  // Demographic field registry (spring-social) — Step 1 maps a subset onto
  // this questionnaire. Selection order becomes the form's sortOrder.
  const [demoFieldCatalog, setDemoFieldCatalog] = useState<DemographicFieldResponse[]>([]);
  const [demoSelection, setDemoSelection] = useState<Array<{ demographicFieldId: number; required: boolean }>>([]);

  useEffect(() => {
    demographicsApi.getDemographicFields()
      .then((r) => setDemoFieldCatalog(r.data))
      .catch(() => setDemoFieldCatalog([]));
  }, []);

  // ── Step 2: question bank + placement ─────────────────────────────────
  // placement: questionId → where it sits (sectionId null on flat
  // questionnaires) and its position within that scope.
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState('');
  const [qSections, setQSections] = useState<SectionResponse[]>([]);
  const [placement, setPlacement] = useState<Record<number, { sectionId: number | null; sortOrder: number }>>({});
  const [newSectionName, setNewSectionName] = useState('');
  const [addQOpen, setAddQOpen] = useState(false);
  const [newQStem, setNewQStem] = useState('');
  const [newQOptions, setNewQOptions] = useState<string[]>(['', '']);
  const [newQError, setNewQError] = useState('');
  const [newQSaving, setNewQSaving] = useState(false);

  const loadBank = async (qid: number) => {
    setBankLoading(true);
    setBankError('');
    try {
      const [qs, secs, mine] = await Promise.all([
        questionApis.getAllQuestions(),
        questionnairesApi.getQuestionnaireSections(qid),
        questionApis.getQuestionsByQuestionnaireId(qid),
      ]);
      setBankQuestions(qs.data);
      setQSections(secs.data);
      const p: Record<number, { sectionId: number | null; sortOrder: number }> = {};
      mine.data.forEach((q, i) => {
        p[q.questionId] = { sectionId: q.sectionId, sortOrder: q.sortOrder ?? i };
      });
      setPlacement(p);
    } catch (e: any) {
      setBankError(e?.message || 'Failed to load the question bank');
    } finally {
      setBankLoading(false);
    }
  };

  useEffect(() => {
    if (step === 2 && backendQid != null) loadBank(backendQid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, backendQid]);

  /** Selected question ids of one scope (section or flat root), in order. */
  const scopeOf = (
    map: Record<number, { sectionId: number | null; sortOrder: number }>,
    sectionId: number | null,
  ) =>
    Object.entries(map)
      .filter(([, p]) => p.sectionId === sectionId)
      .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
      .map(([qid]) => Number(qid));

  const scopeList = (sectionId: number | null) => scopeOf(placement, sectionId);

  const toggleQuestion = (questionId: number, sectionId: number | null) => {
    setPlacement((prev) => {
      const next = { ...prev };
      const existing = next[questionId];
      if (existing && existing.sectionId === sectionId) {
        delete next[questionId];
        scopeOf(next, sectionId).forEach((qid, idx) => {
          next[qid] = { ...next[qid], sortOrder: idx };
        });
      } else if (!existing) {
        next[questionId] = { sectionId, sortOrder: scopeOf(next, sectionId).length };
      }
      // Selected in another section: no-op — the row is disabled there.
      return next;
    });
  };

  const moveQuestionTo = (questionId: number, position: number) => {
    setPlacement((prev) => {
      const p = prev[questionId];
      if (!p) return prev;
      const ids = scopeOf(prev, p.sectionId).filter((id) => id !== questionId);
      ids.splice(position, 0, questionId);
      const next = { ...prev };
      ids.forEach((id, idx) => {
        next[id] = { ...next[id], sortOrder: idx };
      });
      return next;
    });
  };

  const addQSection = async () => {
    const name = newSectionName.trim();
    if (!name || backendQid == null) return;
    try {
      const res = await questionnairesApi.createQuestionnaireSection(backendQid, { name, instruction: null });
      setQSections((prev) => [...prev, res.data]);
      setNewSectionName('');
    } catch (e: any) {
      setBankError(e?.response?.data?.message || e?.message || 'Failed to create section');
    }
  };

  const removeQSection = async (sectionId: number) => {
    if (backendQid == null) return;
    try {
      await questionnairesApi.deleteQuestionnaireSection(backendQid, sectionId);
      setQSections((prev) => prev.filter((s) => s.sectionId !== sectionId));
      // Its selections leave the mapping; re-place them in another section.
      setPlacement((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          if (next[Number(k)].sectionId === sectionId) delete next[Number(k)];
        });
        return next;
      });
    } catch (e: any) {
      setBankError(e?.response?.data?.message || e?.message || 'Failed to remove section');
    }
  };

  const submitNewQuestion = async () => {
    const stem = newQStem.trim();
    if (!stem) { setNewQError('Question text is required'); return; }
    const opts = newQOptions.map((o) => o.trim()).filter(Boolean);
    setNewQSaving(true);
    try {
      const res = await questionApis.createQuestion({
        contentType: 'TEXT',
        stem,
        mediaUrl: null,
        riskFlag: false,
        options: opts.map((t) => ({ optionText: t, contentType: 'TEXT', mediaUrl: null, mqtScores: [] })),
        mqtScores: [],
      });
      setBankQuestions((prev) => [...prev, res.data]);
      setAddQOpen(false);
      setNewQStem('');
      setNewQOptions(['', '']);
      setNewQError('');
    } catch (e: any) {
      setNewQError(e?.response?.data?.message || e?.message || 'Failed to create question');
    } finally {
      setNewQSaving(false);
    }
  };

  /** Flatten placement into the PUT payload; per-scope order = sortOrder. */
  const buildMappingEntries = () => {
    const entries: Array<{ questionId: number; sectionId: number | null; sortOrder: number }> = [];
    const scopes: Array<number | null> = useSections ? qSections.map((s) => s.sectionId) : [null];
    scopes.forEach((sec) => {
      scopeList(sec).forEach((qid, idx) => entries.push({ questionId: qid, sectionId: sec, sortOrder: idx }));
    });
    return entries;
  };

  const renderBankRow = (q: BankQuestion, sectionId: number | null) => {
    const p = placement[q.questionId];
    const selectedHere = !!p && p.sectionId === sectionId;
    const selectedElsewhere = !!p && p.sectionId !== sectionId;
    const attachedElsewhere = q.questionnaireId != null && q.questionnaireId !== backendQid;
    const disabled = attachedElsewhere || selectedElsewhere;
    const scope = scopeList(sectionId);
    return (
      <div
        key={q.questionId}
        className={cn(
          'flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors',
          selectedHere ? 'border-primary bg-primary/5' : 'border-border',
          disabled && 'opacity-50',
        )}
      >
        <input
          type="checkbox"
          checked={selectedHere}
          disabled={disabled}
          onChange={() => toggleQuestion(q.questionId, sectionId)}
          className="rounded shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate">{q.stem || <span className="italic text-muted-foreground">(media question)</span>}</p>
          <p className="text-[0.6875rem] text-muted-foreground truncate">
            {q.options.length} option{q.options.length !== 1 ? 's' : ''}
            {attachedElsewhere && ` · in "${q.questionnaireName}"`}
            {selectedElsewhere && ' · placed in another section'}
          </p>
        </div>
        {selectedHere && (
          <select
            value={scope.indexOf(q.questionId)}
            onChange={(e) => moveQuestionTo(q.questionId, Number(e.target.value))}
            className="shrink-0 rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
            title="Position in order"
          >
            {scope.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
          </select>
        )}
      </div>
    );
  };

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
        setQuestionnaireId(String(q.questionnaireId));
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

  const mqs: MQ[] = useMemo(
    () => catalog.map((m) => ({
      id: m.id,
      name: m.name,
      mqts: m.mqts as MQT[], // already-recursive shape from /qualities
    })),
    [catalog],
  );

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [instrumentId, setQuestionnaireId] = useState<string | null>(null);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Flat row per MQT (across the whole tree) for the option-score picker.
  // Each row carries the breadcrumb path so the dropdown can render it.
  const allMqts = useMemo(() => flattenMqtsForPicker(mqs), [mqs]);

  const mqtIndex = useMemo(() => {
    const map: Record<string, { mq: MQ; mqt: MQT; path: string }> = {};
    allMqts.forEach((row) => { map[row.mqt.id] = row; });
    return map;
  }, [allMqts]);

  const mqNameById = useMemo(() => {
    const map: Record<string, string> = {};
    mqs.forEach((m) => { map[m.id] = m.name; });
    return map;
  }, [mqs]);

  // Traits grouped under their parent MQ, each carrying an outline number
  // (1, 1.1, 1.1.1 …) and depth so the coverage UI can render the
  // MQ › MQT › sub-MQT hierarchy instead of a flat wall of full-path pills.
  type MqtRow = { mqt: MQT; path: string; label: string; number: string; depth: number };
  const mqtsByMq = useMemo(() => {
    const map: Record<string, MqtRow[]> = {};
    mqs.forEach((mq) => {
      const rows: MqtRow[] = [];
      const walk = (nodes: MQT[], parentLabels: string[], parentNumber: string, depth: number) => {
        nodes.forEach((n, i) => {
          const number = parentNumber ? `${parentNumber}.${i + 1}` : `${i + 1}`;
          // The MQ-level single trait (same name as its MQ, no children) is
          // represented by the MQ chip itself, so label it "Overall".
          const isMqLevel =
            depth === 0 && mq.mqts.length === 1 &&
            n.name.toLowerCase() === mq.name.toLowerCase() && !n.children?.length;
          const path = isMqLevel ? mq.name : [mq.name, ...parentLabels, n.name].join(' > ');
          rows.push({ mqt: n, path, label: isMqLevel ? 'Overall' : n.name, number, depth });
          if (n.children?.length) walk(n.children, [...parentLabels, n.name], number, depth + 1);
        });
      };
      walk(mq.mqts, [], '', 0);
      map[mq.id] = rows;
    });
    return map;
  }, [mqs]);

  // Which MQ groups are collapsed in the coverage UI (shared across every
  // question's selector and the Coverage Map so the view stays consistent).
  const [collapsedMqs, setCollapsedMqs] = useState<Set<string>>(new Set());
  const toggleMqCollapse = (id: string) =>
    setCollapsedMqs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Per-question accordion: which question cards are expanded. Empty by
  // default so every card starts collapsed; the side navigator and the card
  // header chevron toggle membership.
  const [expandedQs, setExpandedQs] = useState<Set<string>>(new Set());
  const toggleQuestionExpand = (id: string) =>
    setExpandedQs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  // Expand a question (if collapsed) and scroll its card into view.
  const goToQuestion = (id: string) => {
    setExpandedQs((prev) => new Set(prev).add(id));
    // Defer so the body is mounted before we scroll to it.
    requestAnimationFrame(() => {
      document.getElementById(`question-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Coverage summary: how many questions tag each MQ and each MQT.
  const coverageSummary = useMemo(() => {
    const mqCounts: Record<string, number> = {};
    const mqtCounts: Record<string, number> = {};
    questions.forEach((q) => {
      q.coverage.mqs.forEach((id) => { mqCounts[id] = (mqCounts[id] || 0) + 1; });
      q.coverage.mqts.forEach((id) => { mqtCounts[id] = (mqtCounts[id] || 0) + 1; });
    });
    const taggedCount = questions.filter((q) => q.coverage.mqs.length > 0 || q.coverage.mqts.length > 0).length;
    return { mqCounts, mqtCounts, taggedCount };
  }, [questions]);

  // ---- Preview (whole questionnaire review) ----

  const [previewOpen, setPreviewOpen] = useState(false);

  const openPreview = () => {
    if (questions.length === 0) {
      setError('Add at least one question before previewing.');
      return;
    }
    setPreviewOpen(true);
  };

  // ---- Import questions from another questionnaire ----

  const [importOpen, setImportOpen] = useState(false);
  const [importStage, setImportStage] = useState<'instrument' | 'questions'>('instrument');
  const [importQuestionnaireSearch, setImportQuestionnaireSearch] = useState('');
  const [importQuestionSearch, setImportQuestionSearch] = useState('');
  const [importSource, setImportSource] = useState<StoredQuestionnaire | null>(null);
  const [importPicked, setImportPicked] = useState<Set<string>>(new Set());
  const [importLibrary, setImportLibrary] = useState<StoredQuestionnaire[]>([]);

  const openImport = async () => {
    setImportSource(null);
    setImportPicked(new Set());
    setImportQuestionnaireSearch('');
    setImportQuestionSearch('');
    setImportStage('instrument');
    setImportOpen(true);
    try {
      const { questionnairesApi } = await import('@/lib/api');
      const list = await questionnairesApi.list();
      setImportLibrary(list.filter((i) => Array.isArray(i.questions) && i.questions.length > 0) as any);
    } catch {
      setImportLibrary([]);
    }
  };

  const filteredImportQuestionnaires = useMemo(() => {
    const q = importQuestionnaireSearch.trim().toLowerCase();
    if (!q) return importLibrary;
    return importLibrary.filter(
      (i) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.shortName || '').toLowerCase().includes(q) ||
        (i.vertical || '').toLowerCase().includes(q),
    );
  }, [importLibrary, importQuestionnaireSearch]);

  const filteredImportQuestions = useMemo(() => {
    if (!importSource?.questions) return [];
    const q = importQuestionSearch.trim().toLowerCase();
    if (!q) return importSource.questions as any[];
    return (importSource.questions as any[]).filter((qq) => String(qq.stem || '').toLowerCase().includes(q));
  }, [importSource, importQuestionSearch]);

  const toggleImportPick = (qid: string) => {
    setImportPicked((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  };

  const confirmImport = () => {
    if (!importSource?.questions || importPicked.size === 0) { setImportOpen(false); return; }
    const toCopy = (importSource.questions as any[]).filter((qq) => importPicked.has(qq.id));
    const cloned: Question[] = toCopy.map((q) => ({
      id: crypto.randomUUID(),
      stem: String(q.stem || ''),
      format: String(q.format || 'MCQ'),
      media_url: String(q.media_url || ''),
      media_type: (q.media_type || 'none') as MediaType,
      options: Array.isArray(q.options)
        ? q.options.map((o: any) => ({
            text: String(o.text || ''),
            scores: Array.isArray(o.scores) ? o.scores.map((s: any) => ({ mqt_id: s.mqt_id, score: Number(s.score) || 0 })) : [],
            media_url: o.media_url,
            media_type: o.media_type,
          }))
        : [],
      question_scores: Array.isArray(q.question_scores)
        ? q.question_scores.map((s: any) => ({ mqt_id: s.mqt_id, score: Number(s.score) || 0 }))
        : [],
      coverage: normalizeCoverage(q.coverage),
      clinical_risk_flag: !!q.clinical_risk_flag,
      risk_flag_rule: String(q.risk_flag_rule || ''),
    }));
    setQuestions((prev) => [...prev, ...cloned]);
    setImportOpen(false);
  };

  // ---- Bulk import from CSV / XLSX ----
  // Expected columns (case-insensitive):
  //   stem (required), format, section, risk_flag, risk_rule,
  //   coverage_mqs, coverage_mqts (semicolon-separated names; tags only)
  //
  // Scoring uses NUMBERED MQ BLOCKS per scope — each block is one MQ and its
  // trait path, one value per cell:
  //   question_mq1, question_mqt1, question_submqt1, question_subsubmqt1, question_score1
  //   question_mq2, …  (add _mq2/_mq3… to score the question against more MQs)
  //   option1..option8
  //   option{n}_mq1, option{n}_mqt1, option{n}_submqt1, option{n}_subsubmqt1, option{n}_score1
  //   option{n}_mq2, …  (per option, per MQ block)
  //
  // Each block is the four-level trait hierarchy MQ › MQT › sub-MQT › sub-sub-MQT.
  // The score attaches to the DEEPEST level filled in (so leave sub-MQT /
  // sub-sub-MQT blank for a shallow trait). Every level below the MQ that
  // doesn't exist yet is created in the catalog on import; the MQ itself is
  // created too. Filling a sub-level while its parent is blank is flagged.
  //
  // Back-compat: the legacy un-numbered columns (question_mq, option{n}_mq, …)
  // are still read as an extra block, and each such cell may carry a ';'- (or
  // '|'-) separated list whose items pair up positionally.
  //
  // Coverage names are resolved against the catalog for tagging only and
  // dropped if they don't match.

  // A single scoring entry: an MQ and the trait path beneath it
  // (mqt → submqt → subsubmqt), plus the score. mqtPath holds that hierarchy —
  // e.g. ["Stress", "Acute", "Panic"]. An empty mqtPath with a present mq
  // defaults to a single trait named after the MQ; an empty mq with only a
  // score is a bare score that falls back to the first catalog trait.
  interface ParsedScore {
    mq: string;
    mqtPath: string[];
    score: number | null;
  }
  interface ParsedOption {
    text: string;
    // One option can score against several MQTs at once — the source cells
    // option{n}_mq / _mqt / _score may each carry a ';'-separated list.
    scores: ParsedScore[];
  }
  interface ParsedRow {
    stem: string;
    format: string;
    section: string;
    risk_flag: boolean;
    risk_rule: string;
    options: ParsedOption[];
    // Question-level scores — applied to the MQT totals whenever the question
    // is answered, regardless of which option was picked. Like options, the
    // question_mq / _mqt / _score columns may carry ';'-separated lists.
    question_scores: ParsedScore[];
    // Coverage tags (names; resolved to ids on import). Semicolon-separated
    // in the source columns coverage_mqs / coverage_mqts.
    coverage_mqs: string[];
    coverage_mqts: string[];
    errors: string[];
  }

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkRows, setBulkRows] = useState<ParsedRow[]>([]);
  const [bulkError, setBulkError] = useState('');
  const [bulkParsing, setBulkParsing] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);

  const openBulkImport = () => {
    setBulkFileName('');
    setBulkRows([]);
    setBulkError('');
    setBulkOpen(true);
  };

  const parseBulkFile = async (file: File) => {
    setBulkParsing(true);
    setBulkError('');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      if (!firstSheet) throw new Error('The file has no sheets.');

      // Read as array-of-arrays so we can find the real header row ourselves.
      // sheet_to_json's default (row 1 = headers) breaks on XLSX files that
      // have a title row, merged cells, or empty leading cells — those make
      // every "stem" lookup return undefined and we report a sea of "stem is
      // empty" errors. CSVs from the same data usually don't hit this because
      // they have no merged cells and the header is row 1.
      const aoa: any[][] = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false,
      }) as any[][];
      if (aoa.length === 0) throw new Error('No rows found in the first sheet.');

      const normalizeKey = (k: any) =>
        String(k ?? '')
          .replace(/^﻿/, '') // BOM
          .replace(/ /g, ' ') // non-breaking space → space
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      // Find the first row that looks like a header — must contain "stem"
      // (or "question"/"text" as common synonyms).
      const headerRowIdx = aoa.findIndex((row) =>
        Array.isArray(row) && row.some((cell) => {
          const k = normalizeKey(cell);
          return k === 'stem' || k === 'question' || k === 'text';
        }),
      );
      if (headerRowIdx === -1) {
        throw new Error('Could not find a header row. The sheet must include a column named "stem" (or "question"/"text").');
      }
      const headers: string[] = (aoa[headerRowIdx] || []).map(normalizeKey);

      const rows = aoa
        .slice(headerRowIdx + 1)
        .map((arr) => {
          const norm: Record<string, any> = {};
          headers.forEach((h, i) => {
            if (!h) return; // skip empty header cells
            const v = arr?.[i];
            norm[h] = typeof v === 'string' ? v.trim() : v;
          });
          return norm;
        })
        // Skip fully-blank rows — Excel often pads the bottom of a sheet with
        // empty rows, and we don't want to flag each one as "stem is empty".
        .filter((row) => Object.values(row).some((v) => v !== '' && v !== undefined && v !== null));

      // Split a scoring cell into a list on ';' or '|' (mirrors coverage cols).
      const splitCell = (raw: any) => String(raw ?? '').split(/[;|]/).map((s) => s.trim());
      // Build the scoring entries for one scope from its explicit trait-hierarchy
      // columns (mq → mqt → submqt → subsubmqt) and the score. Each cell may hold
      // a ';'-separated list whose items pair up positionally (one option can
      // score several traits); a single mq broadcasts to every entry. The score
      // attaches to the DEEPEST trait given, and every missing level below the MQ
      // is created on import. requireScore=true (question scope) flags an mq with
      // no score as an error rather than silently skipping it.
      const parseScoreCells = (
        cells: { mq: any; mqt: any; submqt: any; subsubmqt: any; score: any },
        label: string,
        requireScore: boolean,
        errors: string[],
      ): ParsedScore[] => {
        const mqList = splitCell(cells.mq);
        const mqtList = splitCell(cells.mqt);
        const submqtList = splitCell(cells.submqt);
        const subsubmqtList = splitCell(cells.subsubmqt);
        const scoreList = splitCell(cells.score);
        const present = (l: string[]) => l.some((s) => s !== '');
        const lists = [mqList, mqtList, submqtList, subsubmqtList, scoreList];
        if (!lists.some(present)) return [];
        const count = Math.max(...lists.map((l) => (present(l) ? l.length : 0)));
        const out: ParsedScore[] = [];
        for (let i = 0; i < count; i++) {
          // A single MQ broadcasts across every entry; otherwise pair by index.
          const mq = (mqList.length === 1 ? mqList[0] : mqList[i] ?? '').trim();
          // Trait hierarchy below the MQ, deepest-last. A level may itself use
          // '>' for extra depth (back-compat with the older path syntax).
          const rawLevels = [mqtList[i] ?? '', submqtList[i] ?? '', subsubmqtList[i] ?? ''].map((s) => s.trim());
          let gap = false;
          for (let k = 1; k < rawLevels.length; k++) {
            if (!rawLevels[k - 1] && rawLevels[k]) { gap = true; break; }
          }
          if (gap) { errors.push(`${label}: a sub-level is filled without its parent trait`); continue; }
          const mqtPath: string[] = [];
          for (const lvl of rawLevels) {
            if (!lvl) break; // stop at the first empty level
            mqtPath.push(...lvl.split('>').map((s) => s.trim()).filter(Boolean));
          }
          // MQ given but no trait → default to a single trait named after the MQ.
          if (mqtPath.length === 0 && mq) mqtPath.push(mq);
          const sStr = (scoreList[i] ?? '').trim();
          const sNum = sStr === '' ? null : Number(sStr);
          const score = sStr !== '' && Number.isFinite(sNum as number) ? (sNum as number) : null;
          if (sStr !== '' && score === null) {
            errors.push(`${label}: invalid score "${sStr}"`);
          }
          if (!mq && rawLevels.some(Boolean)) {
            errors.push(`${label}: trait given without MQ`);
            continue;
          }
          if (requireScore && mq && score === null) {
            errors.push(`${label}: MQ given without score`);
            continue;
          }
          // Skip an entirely-empty positional slot (e.g. from a trailing ';').
          if (!mq && mqtPath.length === 0 && score === null) continue;
          out.push({ mq, mqtPath, score });
        }
        return out;
      };
      // Resolve the trait-hierarchy columns for one scope + block suffix,
      // accepting a few header spellings (sub_mqt / sub-sub-mqt etc.). The
      // suffix is the numbered block ('1', '2', …) or '' for the legacy
      // un-numbered columns.
      const scoreCellsForBlock = (row: Record<string, any>, prefix: string, suffix: string) => ({
        mq: row[`${prefix}_mq${suffix}`],
        mqt: row[`${prefix}_mqt${suffix}`],
        submqt: row[`${prefix}_submqt${suffix}`] ?? row[`${prefix}_sub_mqt${suffix}`],
        subsubmqt:
          row[`${prefix}_subsubmqt${suffix}`] ??
          row[`${prefix}_subsub_mqt${suffix}`] ??
          row[`${prefix}_sub_sub_mqt${suffix}`],
        score: row[`${prefix}_score${suffix}`],
      });
      // Gather every scoring block for one scope. Each MQ gets its own numbered
      // column group — {prefix}_mq1 / _mqt1 / _submqt1 / _subsubmqt1 / _score1,
      // then _mq2…, and so on — so one value lives in one cell (no ';' lists
      // needed). We read block 1, 2, 3… for as long as a {prefix}_mq{n} column
      // exists, plus the legacy un-numbered {prefix}_mq columns for back-compat.
      const collectScores = (
        row: Record<string, any>,
        prefix: string,
        label: string,
        requireScore: boolean,
        errors: string[],
      ): ParsedScore[] => {
        const suffixes: string[] = [];
        if (`${prefix}_mq` in row) suffixes.push(''); // legacy un-numbered block
        for (let n = 1; `${prefix}_mq${n}` in row; n++) suffixes.push(String(n));
        const out: ParsedScore[] = [];
        for (const suffix of suffixes) {
          const blockLabel = suffix ? `${label} (mq${suffix})` : label;
          out.push(...parseScoreCells(scoreCellsForBlock(row, prefix, suffix), blockLabel, requireScore, errors));
        }
        return out;
      };

      const parsed: ParsedRow[] = rows.map((row) => {
        const errors: string[] = [];
        const stem = String(row.stem ?? row.question ?? row.text ?? '').trim();
        if (!stem) errors.push('stem is empty');
        const formatRaw = String(row.format ?? 'MCQ').toUpperCase().trim();
        const format = FORMATS.includes(formatRaw) ? formatRaw : 'MCQ';
        const section = String(row.section ?? row.section_title ?? '').trim();
        const riskFlagRaw = String(row.risk_flag ?? row.clinical_risk_flag ?? '').toLowerCase().trim();
        const risk_flag = ['1', 'true', 'yes', 'y'].includes(riskFlagRaw);
        const risk_rule = String(row.risk_rule ?? row.risk_flag_rule ?? '').trim();
        const options: ParsedOption[] = [];
        for (let n = 1; n <= 8; n++) {
          const text = String(row[`option${n}`] ?? '').trim();
          if (!text) continue;
          const scores = collectScores(row, `option${n}`, `option${n}`, false, errors);
          options.push({ text, scores });
        }
        if (format !== 'FREE_TEXT' && options.length < 2) {
          errors.push(`format ${format} needs at least 2 options`);
        }
        // Optional question-level scores (applied on any answer).
        const question_scores = collectScores(row, 'question', 'question_score', true, errors);
        const splitNames = (raw: any) =>
          String(raw ?? '')
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean);
        const coverage_mqs = splitNames(row.coverage_mqs ?? row.coverage_mq);
        const coverage_mqts = splitNames(row.coverage_mqts ?? row.coverage_mqt);
        return { stem, format, section, risk_flag, risk_rule, options, question_scores, coverage_mqs, coverage_mqts, errors };
      });

      setBulkRows(parsed);
      setBulkFileName(file.name);
    } catch (e: any) {
      setBulkError(e?.message || 'Failed to parse file.');
    } finally {
      setBulkParsing(false);
    }
  };

  // Collect every distinct (MQ, nested MQT path) reference from valid rows.
  // `mqt` is the path rendered as a breadcrumb for display; `path` drives
  // resolution/creation; `isNew` is true when the full path doesn't yet exist.
  const bulkPendingPairs = useMemo(() => {
    const pairs = new Map<string, { mq: string; mqt: string; path: string[]; isNew: boolean }>();
    // Walk the catalog tree to see if a nested trait path already resolves.
    const pathExists = (mqName: string, path: string[]): boolean => {
      const mq = mqs.find((m) => m.name.toLowerCase() === mqName.toLowerCase());
      if (!mq) return false;
      let level: MQT[] | undefined = mq.mqts;
      let node: MQT | undefined;
      for (const seg of path) {
        node = level?.find((t) => t.name.toLowerCase() === seg.toLowerCase());
        if (!node) return false;
        level = node.children;
      }
      return !!node;
    };
    const addEntry = (mq: string, path: string[]) => {
      if (!mq || path.length === 0) return;
      const key = scorePathKey(mq, path);
      if (pairs.has(key)) return;
      pairs.set(key, { mq, mqt: path.join(' › '), path, isNew: !pathExists(mq, path) });
    };
    bulkRows
      .filter((r) => r.errors.length === 0)
      .forEach((r) => {
        r.question_scores.forEach((s) => addEntry(s.mq, s.mqtPath));
        r.options.forEach((o) => o.scores.forEach((s) => addEntry(s.mq, s.mqtPath)));
      });
    return Array.from(pairs.values());
  }, [bulkRows, mqs]);

  const confirmBulkImport = async () => {
    const valid = bulkRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) { setBulkError('No valid rows to import.'); return; }
    setBulkImporting(true);
    setBulkError('');
    try {
      // Resolve / create MQs and nested MQTs against the database before
      // building questions. Deep-clone the catalog so we can grow trait trees
      // in place; later paths then find the nodes earlier ones created.
      const cloneMqt = (t: any): any => ({
        id: t.id,
        name: t.name,
        ...(Array.isArray(t.children) ? { children: t.children.map(cloneMqt) } : {}),
      });
      let catalogCopy: StoredMQ[] = catalog.map((m) => ({ ...m, mqts: m.mqts.map(cloneMqt) }));
      const findMq = (name: string) => catalogCopy.find((m) => m.name.toLowerCase() === name.toLowerCase());
      const genMqtId = () => `mqt-${Math.random().toString(36).slice(2, 10)}`;

      // resolved: scorePathKey -> leaf-trait id. created/changed track which MQs
      // need a create vs. an update call so we persist each MQ exactly once.
      const resolved = new Map<string, string>();
      const createdMqIds = new Set<string>();
      const changedMqIds = new Set<string>();
      const { qualitiesApi } = await import('@/lib/api');

      for (const pending of bulkPendingPairs) {
        let mq = findMq(pending.mq);
        if (!mq) {
          mq = { id: `mq-${Math.random().toString(36).slice(2, 10)}`, name: pending.mq, mqts: [] };
          catalogCopy = [...catalogCopy, mq];
          createdMqIds.add(mq.id);
        }
        // Walk the path under the MQ, creating each missing segment. The last
        // segment is the leaf trait that scores actually attach to.
        let level: any[] = mq.mqts;
        let leafId = '';
        pending.path.forEach((seg, d) => {
          let node = level.find((t: any) => t.name.toLowerCase() === seg.toLowerCase());
          if (!node) {
            node = { id: genMqtId(), name: seg };
            level.push(node);
            if (!createdMqIds.has(mq!.id)) changedMqIds.add(mq!.id);
          }
          leafId = node.id;
          if (d < pending.path.length - 1) {
            if (!node.children) node.children = [];
            level = node.children;
          }
        });
        if (leafId) resolved.set(scorePathKey(pending.mq, pending.path), leafId);
      }

      // Persist: brand-new MQs via create, existing MQs that gained traits via update.
      for (const id of createdMqIds) {
        const mq = catalogCopy.find((m) => m.id === id);
        if (mq) await qualitiesApi.create(mq);
      }
      for (const id of changedMqIds) {
        const mq = catalogCopy.find((m) => m.id === id);
        if (mq) await qualitiesApi.update(mq.id, mq);
      }
      // Push the updated catalog into state so downstream code (MQT pickers,
      // upsert payload) sees the newly-created MQs/MQTs without a round-trip.
      setCatalog(catalogCopy);

      // Sections (created on-the-fly when sections mode is on).
      const nextSections = [...sections];
      const sectionIdByTitle = new Map<string, string>();
      nextSections.forEach((s) => sectionIdByTitle.set(s.title.toLowerCase(), s.id));

      // Fallback: if a row has a score but no MQ/MQT, we default to the first
      // MQT in the resolved catalog so the score isn't silently dropped.
      const firstMqtInCatalog = catalogCopy[0]?.mqts[0];

      // Resolve coverage tag names against the (post-creation) catalog.
      // Coverage-only names that don't match anything are dropped — coverage
      // is metadata, so we don't auto-create phantom qualities for it.
      const resolveCoverageMqId = (name: string): string | null =>
        catalogCopy.find((m) => m.name.toLowerCase() === name.toLowerCase())?.id ?? null;
      const resolveCoverageMqtId = (name: string): string | null => {
        const lower = name.toLowerCase();
        const walk = (nodes: Array<{ id: string; name: string; children?: any[] }>): string | null => {
          for (const n of nodes) {
            if (n.name.toLowerCase() === lower) return n.id;
            if (Array.isArray(n.children)) {
              const hit = walk(n.children);
              if (hit) return hit;
            }
          }
          return null;
        };
        for (const m of catalogCopy) {
          const hit = walk(m.mqts as any[]);
          if (hit) return hit;
        }
        return null;
      };

      const newQuestions: Question[] = valid.map((r) => {
        let sectionId: string | undefined;
        let sectionTitle: string | undefined;
        if (useSections && r.section) {
          const sKey = r.section.toLowerCase();
          let id = sectionIdByTitle.get(sKey);
          if (!id) {
            id = `sec-${Math.random().toString(36).slice(2, 8)}`;
            sectionIdByTitle.set(sKey, id);
            nextSections.push({ id, title: r.section });
          }
          sectionId = id;
          sectionTitle = nextSections.find((s) => s.id === id)?.title;
        }
        return {
          id: crypto.randomUUID(),
          stem: r.stem,
          format: r.format,
          media_url: '',
          media_type: 'none',
          options: r.options.map((o) => {
            const scores: Array<{ mqt_id: string; score: number }> = [];
            const seen = new Set<string>();
            o.scores.forEach((s) => {
              if (s.score === null) return;
              let mqtId: string | undefined;
              if (s.mq && s.mqtPath.length) {
                mqtId = resolved.get(scorePathKey(s.mq, s.mqtPath));
              } else if (!s.mq && s.mqtPath.length === 0 && firstMqtInCatalog) {
                // Bare score with no MQ/MQT — fall back to the first trait.
                mqtId = firstMqtInCatalog.id;
              }
              if (mqtId && !seen.has(mqtId)) {
                seen.add(mqtId);
                scores.push({ mqt_id: mqtId, score: s.score });
              }
            });
            return { text: o.text, scores };
          }),
          question_scores: (() => {
            const out: Array<{ mqt_id: string; score: number }> = [];
            const seen = new Set<string>();
            r.question_scores.forEach((s) => {
              if (s.score === null || !s.mq || !s.mqtPath.length) return;
              const mqtId = resolved.get(scorePathKey(s.mq, s.mqtPath));
              if (mqtId && !seen.has(mqtId)) {
                seen.add(mqtId);
                out.push({ mqt_id: mqtId, score: s.score });
              }
            });
            return out;
          })(),
          coverage: {
            mqs: Array.from(new Set(r.coverage_mqs.map(resolveCoverageMqId).filter((id): id is string => !!id))),
            mqts: Array.from(new Set(r.coverage_mqts.map(resolveCoverageMqtId).filter((id): id is string => !!id))),
          },
          clinical_risk_flag: r.risk_flag,
          risk_flag_rule: r.risk_rule,
          sectionId,
          sectionTitle,
        };
      });

      if (nextSections.length !== sections.length) setSections(nextSections);
      setQuestions((prev) => [...prev, ...newQuestions]);
      setBulkOpen(false);
    } catch (e: any) {
      setBulkError(`Import failed: ${e?.message || 'unknown error'}. Some MQs/MQTs may not have been created.`);
    } finally {
      setBulkImporting(false);
    }
  };

  const downloadBulkTemplate = () => {
    // Each MQ gets its own numbered block of columns (block 1, block 2, …) so
    // one value lives in one cell. Add _mq3 / _mqt3 / … to score a scope
    // against a third MQ, and so on.
    const block = (prefix: string, n: number) =>
      [`${prefix}_mq${n}`, `${prefix}_mqt${n}`, `${prefix}_submqt${n}`, `${prefix}_subsubmqt${n}`, `${prefix}_score${n}`];
    const header = [
      'stem', 'format', 'section', 'risk_flag', 'risk_rule',
      'coverage_mqs', 'coverage_mqts',
      ...block('question', 1), ...block('question', 2),
      'option1', ...block('option1', 1), ...block('option1', 2),
      'option2', ...block('option2', 1), ...block('option2', 2),
      'option3', ...block('option3', 1), ...block('option3', 2),
      'option4', ...block('option4', 1), ...block('option4', 2),
    ];
    // Scoring uses numbered MQ blocks: each block is one MQ and its trait path
    // (MQ › MQT › sub-MQT › sub-sub-MQT), and the score lands on the DEEPEST
    // level filled in — leave the deeper columns blank for a shallower trait.
    // The sample row scores the question against two MQs (block 1 four levels
    // deep, block 2 only to MQT); option1 also uses two MQs; options 2-4 each
    // use a single MQ to the MQT level.
    const sample = [
      ["My exams are near but I haven't studied much. What would I most likely do?", 'MCQ', 'Coping', 'false', '',
        'Coping Strategies', 'Coping Style',  // coverage tags
        // question block 1 (to sub-sub-MQT) + block 2 (to MQT)
        'Coping Strategies', 'Problem-focused Coping', 'Active problem-focused', 'Planning', '2',
        'Cognitive Appraisal', 'Challenge', '', '', '1',
        // option1: block 1 (to sub-sub-MQT) + block 2 (to sub-MQT)
        'I would plan a schedule, talk to my teacher, and try my best to get good marks.',
        'Coping Strategies', 'Problem-focused Coping', 'Active problem-focused', 'Instrumental support', '2',
        'Coping Style', 'Adaptive', 'Engagement', '', '1',
        // option2: single MQ, to MQT
        'I would ask a friend or classmate to help me prepare.',
        'Coping Strategies', 'Social Support', '', '', '1', '', '', '', '', '',
        // option3: single MQ, to MQT
        'I would avoid thinking about the exam altogether.',
        'Coping Strategies', 'Avoidant Coping', '', '', '0', '', '', '', '', '',
        // option4: single MQ, to MQT
        'I would panic and assume I will fail.',
        'Coping Style', 'Maladaptive', '', '', '0', '', '', '', '', ''],
    ];
    const csv = [header, ...sample]
      .map((row) => row.map((cell) => {
        const s = String(cell);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'questionnaire-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Question handlers ----

  const addQuestion = (sectionId?: string, sectionTitle?: string) => {
    const id = crypto.randomUUID();
    setQuestions((prev) => [
      ...prev,
      {
        id,
        stem: '',
        format: 'MCQ',
        media_url: '',
        media_type: 'none',
        options: [
          { text: '', scores: [] },
          { text: '', scores: [] },
          { text: '', scores: [] },
          { text: '', scores: [] },
        ],
        question_scores: [],
        coverage: { mqs: [], mqts: [] },
        clinical_risk_flag: false,
        risk_flag_rule: '',
        sectionId,
        sectionTitle,
      },
    ]);
    // Open the freshly added question so it's ready to edit.
    setExpandedQs((prev) => new Set(prev).add(id));
  };

  const addSection = () => {
    const id = `sec-${Math.random().toString(36).slice(2, 8)}`;
    const title = `Section ${sections.length + 1}`;
    setSections((prev) => [...prev, { id, title }]);
  };

  const renameSection = (sectionId: string, title: string) => {
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, title } : s));
    // Keep the denormalized title on each question in sync, so it persists through save.
    setQuestions((prev) => prev.map((q) => q.sectionId === sectionId ? { ...q, sectionTitle: title } : q));
  };

  const deleteSection = (sectionId: string) => {
    if (!confirm('Remove this section and all questions in it?')) return;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    setQuestions((prev) => prev.filter((q) => q.sectionId !== sectionId));
  };

  const moveQuestionToSection = (qId: string, sectionId?: string) => {
    const title = sectionId ? (sections.find((s) => s.id === sectionId)?.title || '') : undefined;
    setQuestions((prev) => prev.map((q) => q.id === qId ? { ...q, sectionId, sectionTitle: sectionId ? title : undefined } : q));
  };

  // renderQuestionCard is reused by both the flat list and the per-section groups.
  const renderQuestionCard = (q: Question, idx: number) => {
    const expanded = expandedQs.has(q.id);
    return (
      <Card key={q.id} id={`question-${q.id}`} className="scroll-mt-24">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => toggleQuestionExpand(q.id)}
                className="text-muted-foreground hover:text-foreground shrink-0"
                title={expanded ? 'Collapse question' : 'Expand question'}
              >
                <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
              </button>
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">{idx + 1}</span>
              {!expanded && (
                <button
                  type="button"
                  onClick={() => toggleQuestionExpand(q.id)}
                  className="truncate text-left text-sm text-muted-foreground hover:text-foreground"
                  title="Expand question"
                >
                  {q.stem?.trim() || <span className="italic">Untitled question</span>}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {useSections && sections.length > 0 && (
                <select
                  value={q.sectionId || ''}
                  onChange={(e) => moveQuestionToSection(q.id, e.target.value || undefined)}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                  title="Section"
                >
                  <option value="">— No section —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.title || 'Untitled section'}</option>
                  ))}
                </select>
              )}
              <select value={q.format} onChange={(e) => updateQuestion(q.id, { format: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary">
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={q.clinical_risk_flag} onChange={(e) => updateQuestion(q.id, { clinical_risk_flag: e.target.checked })} className="rounded" />
                <AlertTriangle className="h-3 w-3 text-red-500" /> Risk flag
              </label>
              <button onClick={() => removeQuestion(q.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          {expanded && (
          <>
          <textarea
            value={q.stem}
            onChange={(e) => updateQuestion(q.id, { stem: e.target.value })}
            placeholder={`Question ${idx + 1}: Enter question text...`}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Question Media (optional)</p>
            <MediaPicker
              url={q.media_url}
              type={q.media_type}
              onChange={(url, type) => updateQuestion(q.id, { media_url: url, media_type: type })}
            />
          </div>

          {q.clinical_risk_flag && (
            <input
              value={q.risk_flag_rule}
              onChange={(e) => updateQuestion(q.id, { risk_flag_rule: e.target.value })}
              placeholder="Risk rule (e.g., value >= 2 triggers suicidality alert)"
              className="w-full rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 px-3 py-2 text-xs outline-none focus:border-red-500"
            />
          )}

          {allMqts.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-2">
              <p className="text-[0.6875rem] font-medium text-muted-foreground">
                Question-level scores &mdash; added to these MQs whenever the question is answered, regardless of which option is chosen.
              </p>
              {q.question_scores.length === 0 ? (
                <p className="text-[0.6875rem] text-muted-foreground italic">None &mdash; click "+ Add MQ score" below to attach one.</p>
              ) : (
                <div className="space-y-1.5">
                  {q.question_scores.map((sc) => {
                    const entry = mqtIndex[sc.mqt_id];
                    const usedIds = new Set(q.question_scores.map((s) => s.mqt_id).filter((id) => id !== sc.mqt_id));
                    return (
                      <div key={sc.mqt_id} className="flex items-center gap-2">
                        <select
                          value={sc.mqt_id}
                          onChange={(e) => {
                            const newId = e.target.value;
                            if (newId !== sc.mqt_id) replaceQuestionMqt(q.id, sc.mqt_id, newId);
                          }}
                          className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                        >
                          {!entry && <option value={sc.mqt_id}>(missing MQT)</option>}
                          {allMqts.map(({ mqt, path }) => (
                            <option key={mqt.id} value={mqt.id} disabled={usedIds.has(mqt.id)}>
                              {path}{usedIds.has(mqt.id) ? ' (already used)' : ''}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="1"
                          value={sc.score}
                          onChange={(e) => setQuestionMqtScore(q.id, sc.mqt_id, Number(e.target.value))}
                          className="w-16 shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-center outline-none focus:border-primary"
                          title="Score added on any answer"
                        />
                        <button
                          type="button"
                          onClick={() => toggleQuestionMqt(q.id, sc.mqt_id)}
                          className="shrink-0 text-muted-foreground hover:text-red-500"
                          title="Remove this MQ score"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {(() => {
                const unused = allMqts.filter((row) => !q.question_scores.some((s) => s.mqt_id === row.mqt.id));
                if (unused.length === 0) return null;
                return (
                  <button
                    type="button"
                    onClick={() => toggleQuestionMqt(q.id, unused[0].mqt.id)}
                    className="text-[0.6875rem] text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add MQ score
                  </button>
                );
              })()}
            </div>
          )}

          {(mqs.length > 0 || allMqts.length > 0) && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-2">
              <p className="text-[0.6875rem] font-medium text-muted-foreground">
                Coverage &mdash; which MQs/MQTs this question measures. Used for filtering and reporting; not scored.
              </p>
              {mqs.length > 0 && (
                <div className="space-y-1.5">
                  {mqs.map((m) => {
                    const mqOn = q.coverage.mqs.includes(m.id);
                    const traits = mqtsByMq[m.id] || [];
                    const collapsed = collapsedMqs.has(m.id);
                    const selectedCount = traits.filter((t) => q.coverage.mqts.includes(t.mqt.id)).length;
                    return (
                      <div key={m.id} className="rounded-md border border-border bg-background/50 px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {/* Collapse toggle for the trait list */}
                          {traits.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleMqCollapse(m.id)}
                              className="text-muted-foreground hover:text-foreground shrink-0"
                              title={collapsed ? 'Expand traits' : 'Collapse traits'}
                            >
                              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', !collapsed && 'rotate-90')} />
                            </button>
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          {/* Measured Quality — the group header chip */}
                          <button
                            type="button"
                            onClick={() => toggleCoverageMq(q.id, m.id)}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] font-medium rounded-full border transition-colors',
                              mqOn
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:border-primary',
                            )}
                          >
                            {mqOn && <Check className="h-3 w-3" />}
                            {m.name}
                          </button>
                          {traits.length > 0 && (
                            <span className="text-[0.625rem] text-muted-foreground/70">
                              {selectedCount}/{traits.length} traits
                            </span>
                          )}
                        </div>
                        {/* Traits (MQTs / sub-MQTs) — outline-numbered, indented by depth */}
                        {traits.length > 0 && !collapsed && (
                          <div className="mt-1.5 flex flex-wrap gap-1 pl-5">
                            {traits.map(({ mqt, path, label, number, depth }) => {
                              const on = q.coverage.mqts.includes(mqt.id);
                              return (
                                <button
                                  type="button"
                                  key={mqt.id}
                                  onClick={() => toggleCoverageMqt(q.id, mqt.id)}
                                  title={path}
                                  style={{ marginLeft: depth * 12 }}
                                  className={cn(
                                    'inline-flex items-center gap-1 px-2 py-0.5 text-[0.6875rem] rounded-full border transition-colors',
                                    on
                                      ? 'bg-primary/15 text-primary border-primary/40'
                                      : 'bg-muted/40 text-muted-foreground border-transparent hover:border-primary/40',
                                  )}
                                >
                                  {on && <Check className="h-2.5 w-2.5" />}
                                  <span className="font-mono text-[0.625rem] opacity-70">{number}</span>
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {['MCQ', 'RATING_SCALE', 'LIKERT', 'SJT', 'IMAGE_CHOICE'].includes(q.format) && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                Answer Options &mdash; check MQTs this option maps to and assign a score. Any option may carry any score for any MQT.
              </p>
              {q.options.map((opt, oi) => (
                <div key={oi} className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-6 text-right">{oi + 1}.</span>
                    <input
                      value={opt.text}
                      onChange={(e) => updateOption(q.id, oi, { text: e.target.value })}
                      placeholder={`Option ${oi + 1}`}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {q.options.length > 2 && (
                      <button onClick={() => removeOption(q.id, oi)} className="text-muted-foreground hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {allMqts.length > 0 && (
                    <div className="rounded-md bg-muted/40 border border-border px-3 py-2 space-y-2">
                      <p className="text-[0.6875rem] font-medium text-muted-foreground">Scores per MQT</p>
                      {opt.scores.length === 0 ? (
                        <p className="text-[0.6875rem] text-muted-foreground italic">No MQT scores yet — click "+ Add MQT score" below.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {opt.scores.map((sc) => {
                            const entry = mqtIndex[sc.mqt_id];
                            const usedIds = new Set(opt.scores.map((s) => s.mqt_id).filter((id) => id !== sc.mqt_id));
                            return (
                              <div key={sc.mqt_id} className="flex items-center gap-2">
                                <select
                                  value={sc.mqt_id}
                                  onChange={(e) => {
                                    const newId = e.target.value;
                                    if (newId === sc.mqt_id) return;
                                    setQuestions((prev) => prev.map((qq) => {
                                      if (qq.id !== q.id) return qq;
                                      const opts = [...qq.options];
                                      opts[oi] = {
                                        ...opts[oi],
                                        scores: opts[oi].scores.map((s) => s.mqt_id === sc.mqt_id ? { ...s, mqt_id: newId } : s),
                                      };
                                      return { ...qq, options: opts };
                                    }));
                                  }}
                                  className="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                                >
                                  {!entry && <option value={sc.mqt_id}>(missing MQT)</option>}
                                  {allMqts.map(({ mqt, path }) => (
                                    <option key={mqt.id} value={mqt.id} disabled={usedIds.has(mqt.id)}>
                                      {path}{usedIds.has(mqt.id) ? ' (already used)' : ''}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="1"
                                  value={sc.score}
                                  onChange={(e) => setOptionMqtScore(q.id, oi, sc.mqt_id, Number(e.target.value))}
                                  className="w-16 shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-center outline-none focus:border-primary"
                                  title="Score for this MQT"
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleOptionMqt(q.id, oi, sc.mqt_id)}
                                  className="shrink-0 text-muted-foreground hover:text-red-500"
                                  title="Remove this MQT score"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(() => {
                        const unusedMqts = allMqts.filter((row) => !opt.scores.some((s) => s.mqt_id === row.mqt.id));
                        if (unusedMqts.length === 0) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => toggleOptionMqt(q.id, oi, unusedMqts[0].mqt.id)}
                            className="text-[0.6875rem] text-primary hover:underline inline-flex items-center gap-1"
                          >
                            <Plus className="h-3 w-3" /> Add MQT score
                          </button>
                        );
                      })()}
                    </div>
                  )}

                  <div>
                    <MediaPicker
                      url={opt.media_url || ''}
                      type={opt.media_type || 'none'}
                      onChange={(url, type) => updateOption(q.id, oi, { media_url: url, media_type: type })}
                    />
                  </div>
                </div>
              ))}
              <button onClick={() => addOption(q.id)} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add option
              </button>
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>
    );
  };

  const updateQuestion = (id: string, patch: Partial<Question>) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const updateOption = (qId: string, optIdx: number, patch: Partial<QuestionOption>) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options];
        opts[optIdx] = { ...opts[optIdx], ...patch };
        return { ...q, options: opts };
      }),
    );
  };

  const toggleOptionMqt = (qId: string, optIdx: number, mqtId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options];
        const existing = opts[optIdx].scores.find((s) => s.mqt_id === mqtId);
        if (existing) {
          opts[optIdx] = { ...opts[optIdx], scores: opts[optIdx].scores.filter((s) => s.mqt_id !== mqtId) };
        } else {
          opts[optIdx] = { ...opts[optIdx], scores: [...opts[optIdx].scores, { mqt_id: mqtId, score: 0 }] };
        }
        return { ...q, options: opts };
      }),
    );
  };

  const setOptionMqtScore = (qId: string, optIdx: number, mqtId: string, score: number) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options];
        opts[optIdx] = {
          ...opts[optIdx],
          scores: opts[optIdx].scores.map((s) => (s.mqt_id === mqtId ? { ...s, score } : s)),
        };
        return { ...q, options: opts };
      }),
    );
  };

  // Question-level scores: applied on any answer, independent of options.
  const toggleQuestionMqt = (qId: string, mqtId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const existing = q.question_scores.find((s) => s.mqt_id === mqtId);
        if (existing) {
          return { ...q, question_scores: q.question_scores.filter((s) => s.mqt_id !== mqtId) };
        }
        return { ...q, question_scores: [...q.question_scores, { mqt_id: mqtId, score: 0 }] };
      }),
    );
  };

  const setQuestionMqtScore = (qId: string, mqtId: string, score: number) => {
    setQuestions(
      questions.map((q) =>
        q.id === qId
          ? { ...q, question_scores: q.question_scores.map((s) => (s.mqt_id === mqtId ? { ...s, score } : s)) }
          : q,
      ),
    );
  };

  const replaceQuestionMqt = (qId: string, oldMqtId: string, newMqtId: string) => {
    setQuestions(
      questions.map((q) =>
        q.id === qId
          ? { ...q, question_scores: q.question_scores.map((s) => (s.mqt_id === oldMqtId ? { ...s, mqt_id: newMqtId } : s)) }
          : q,
      ),
    );
  };

  // Coverage tags: which MQs/MQTs the question measures (independent of scoring).
  const toggleCoverageMq = (qId: string, mqId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const has = q.coverage.mqs.includes(mqId);
        return {
          ...q,
          coverage: {
            ...q.coverage,
            mqs: has ? q.coverage.mqs.filter((id) => id !== mqId) : [...q.coverage.mqs, mqId],
          },
        };
      }),
    );
  };

  const toggleCoverageMqt = (qId: string, mqtId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const has = q.coverage.mqts.includes(mqtId);
        return {
          ...q,
          coverage: {
            ...q.coverage,
            mqts: has ? q.coverage.mqts.filter((id) => id !== mqtId) : [...q.coverage.mqts, mqtId],
          },
        };
      }),
    );
  };

  const addOption = (qId: string) => {
    setQuestions(questions.map((q) => (q.id === qId ? { ...q, options: [...q.options, { text: '', scores: [] }] } : q)));
  };

  const removeOption = (qId: string, optIdx: number) => {
    setQuestions(questions.map((q) => (q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== optIdx) } : q)));
  };

  const removeQuestion = (id: string) => setQuestions(questions.filter((q) => q.id !== id));

  // ---- Create/Save ----

  const handleCreateQuestionnaire = async () => {
    if (!instName.trim() || !instVertical) {
      setError('Name and vertical are required');
      return;
    }
    // Refresh the catalog so Step 2's MQT scoring picks up any new MQs.
    // Non-fatal — the existing in-memory catalog is fine if this fails.
    try {
      const freshCatalog = await getMQs();
      if (freshCatalog.length !== catalog.length) setCatalog(freshCatalog);
    } catch (e) {
      console.warn('[create-questionnaire] catalog refresh failed:', e);
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
      generalInstruction: instInstructions.trim() || null,
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
        setQuestionnaireId(String(qid));
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

  const handleSaveQuestions = async () => {
    if (backendQid == null) {
      setError('Save Step 1 first — the questionnaire must exist before questions attach to it.');
      return;
    }
    const entries = buildMappingEntries();
    if (entries.length === 0) {
      setError('Select at least one question');
      return;
    }
    setSaving(true);
    try {
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

  const toggleLanguage = (code: string) => {
    setInstLanguages((prev) => (prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]));
  };

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
                <textarea
                  value={instInstructions}
                  onChange={(e) => setInstInstructions(e.target.value)}
                  rows={4}
                  placeholder="Optional — shown to the respondent before the first question. e.g. Read each question carefully. Answer honestly — there are no right or wrong answers."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {useSections ? 'Assign Questions to Sections' : 'Select Questions'}
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {Object.keys(placement).length} selected · {bankQuestions.length} in bank
                </span>
                <Button variant="outline" size="sm" onClick={() => { setNewQError(''); setAddQOpen(true); }}>
                  <Plus className="h-3.5 w-3.5" /> Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {bankError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  {bankError}
                </div>
              )}
              {bankLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Loading question bank…</p>
              ) : !useSections ? (
                bankQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    The question bank is empty — add your first question.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {bankQuestions.map((q) => renderBankRow(q, null))}
                  </div>
                )
              ) : (
                <>
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
                  {qSections.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      This questionnaire uses sections — add the first section to start placing questions.
                    </p>
                  ) : (
                    qSections.map((sec) => (
                      <div key={sec.sectionId} className="rounded-lg border border-border">
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                          <p className="text-sm font-medium">{sec.name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[0.6875rem] text-muted-foreground">
                              {scopeList(sec.sectionId).length} question{scopeList(sec.sectionId).length !== 1 ? 's' : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeQSection(sec.sectionId)}
                              className="text-muted-foreground hover:text-red-500"
                              title="Remove section (its selected questions go back to unplaced)"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="p-3 space-y-1.5">
                          {bankQuestions.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-3">Question bank is empty.</p>
                          ) : (
                            bankQuestions.map((q) => renderBankRow(q, sec.sectionId))
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setStep(1); setError(''); }}>
              <ChevronLeft className="h-4 w-4" /> Previous Step
            </Button>
            <Button variant="primary" onClick={handleSaveQuestions} disabled={saving || Object.keys(placement).length === 0}>
              {saving ? 'Saving…' : 'Save Questions & Continue'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Add-question-to-bank modal */}
          {addQOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setAddQOpen(false)}>
              <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <CardTitle className="text-base">Add Question to Bank</CardTitle>
                  <button onClick={() => setAddQOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {newQError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                      {newQError}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Question text *</label>
                    <textarea
                      rows={2}
                      value={newQStem}
                      onChange={(e) => setNewQStem(e.target.value)}
                      placeholder="e.g., I enjoy meeting new people."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Options</label>
                      <button type="button" onClick={() => setNewQOptions((p) => [...p, ''])} className="text-[0.6875rem] font-medium text-primary hover:underline">+ Add option</button>
                    </div>
                    {newQOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={opt}
                          onChange={(e) => setNewQOptions((p) => p.map((o, j) => (j === i ? e.target.value : o)))}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
                        />
                        {newQOptions.length > 2 && (
                          <button type="button" onClick={() => setNewQOptions((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                        )}
                      </div>
                    ))}
                    <p className="text-[0.6875rem] text-muted-foreground">
                      Text-only quick add. Media and MQT scoring live in the Question Bank page.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="outline" onClick={() => setAddQOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={submitNewQuestion} disabled={newQSaving}>
                      {newQSaving ? 'Adding…' : 'Add to Bank'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
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
              <strong>{instName}</strong> is live with {Object.keys(placement).length} question{Object.keys(placement).length !== 1 ? 's' : ''}
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
              <Button variant="primary" onClick={() => window.location.href = '/assessments/create'}>Create Assessment</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== Bulk import from CSV/XLSX ===== */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setBulkOpen(false)}>
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base">Import Questions from CSV or Excel</CardTitle>
              <button onClick={() => setBulkOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Expected columns (case-insensitive)</p>
                <p>
                  <code className="font-mono">stem</code> (required),{' '}
                  <code className="font-mono">format</code>,{' '}
                  <code className="font-mono">section</code>,{' '}
                  <code className="font-mono">risk_flag</code>,{' '}
                  <code className="font-mono">risk_rule</code>,{' '}
                  <code className="font-mono">option1</code>…<code className="font-mono">option8</code>,{' '}
                  <code className="font-mono">option1_mq1</code>,{' '}
                  <code className="font-mono">option1_mqt1</code>,{' '}
                  <code className="font-mono">option1_submqt1</code>,{' '}
                  <code className="font-mono">option1_subsubmqt1</code>,{' '}
                  <code className="font-mono">option1_score1</code> (repeat per option; add{' '}
                  <code className="font-mono">_mq2</code>… to score against more than one MQ)
                </p>
                <p className="mt-2">
                  Format defaults to <strong>MCQ</strong>. Sections mode must be on for the{' '}
                  <code className="font-mono">section</code> column to take effect. Each numbered MQ block
                  (<code className="font-mono">_mq1</code>, <code className="font-mono">_mq2</code>, …) maps one MQ ›
                  MQT › sub-MQT › sub-sub-MQT path; the score lands on the deepest level filled in. Missing MQs/MQTs are
                  created in the database on import. If no MQ/MQT is given but a score is, it applies to the first MQT in
                  the catalog (backward-compatible).
                </p>
                <div className="mt-2">
                  <button onClick={downloadBulkTemplate} className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                    <UploadIcon className="h-3 w-3 rotate-180" /> Download CSV template
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Choose file</label>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) parseBulkFile(f);
                  }}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:border-primary/50"
                />
                {bulkFileName && (
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Parsed <strong>{bulkFileName}</strong> — {bulkRows.length} row{bulkRows.length !== 1 ? 's' : ''} found,{' '}
                    {bulkRows.filter((r) => r.errors.length === 0).length} valid.
                  </p>
                )}
              </div>

              {bulkError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              {bulkParsing && (
                <p className="text-xs text-muted-foreground">Parsing…</p>
              )}

              {bulkRows.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr className="text-left">
                          <th className="px-2 py-1.5 w-8">#</th>
                          <th className="px-2 py-1.5">Stem</th>
                          <th className="px-2 py-1.5 w-20">Format</th>
                          <th className="px-2 py-1.5 w-24">Section</th>
                          <th className="px-2 py-1.5 w-16">Options</th>
                          <th className="px-2 py-1.5 w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.map((r, i) => (
                          <tr key={i} className={cn('border-t border-border', r.errors.length > 0 && 'bg-red-50 dark:bg-red-950/20')}>
                            <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                            <td className="px-2 py-1.5 truncate max-w-xs" title={r.stem}>{r.stem || <em className="text-muted-foreground">(empty)</em>}</td>
                            <td className="px-2 py-1.5 font-mono">{r.format}</td>
                            <td className="px-2 py-1.5 truncate" title={r.section}>{r.section || '—'}</td>
                            <td className="px-2 py-1.5">{r.options.length}</td>
                            <td className="px-2 py-1.5">
                              {r.errors.length === 0 ? (
                                <span className="text-green-600">Ready</span>
                              ) : (
                                <span className="text-red-600" title={r.errors.join('; ')}>{r.errors[0]}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {bulkPendingPairs.length > 0 && (
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-xs font-medium">MQ / MQT references ({bulkPendingPairs.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bulkPendingPairs.map((p, i) => (
                      <span
                        key={i}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.6875rem]',
                          p.isNew
                            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
                            : 'border-border bg-muted/40 text-muted-foreground',
                        )}
                        title={p.isNew ? 'Will be created in the database on import' : 'Already exists in the catalog'}
                      >
                        <strong className="font-mono">{p.mq}</strong>
                        <span className="opacity-60">›</span>
                        <span className="font-mono">{p.mqt}</span>
                        {p.isNew && <span className="ml-1 opacity-80">new</span>}
                      </span>
                    ))}
                  </div>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Amber = will be created on import. Plain = already in the catalog.
                  </p>
                </div>
              )}
            </CardContent>
            <div className="shrink-0 border-t border-border px-5 py-3 flex items-center justify-between gap-2">
              <p className="text-[0.6875rem] text-muted-foreground">
                {useSections ? 'Sections will be created from the section column.' : 'Turn on sections in Step 1 to use the section column.'}
                {bulkPendingPairs.some((p) => p.isNew) && (
                  <>
                    {' '}
                    <span className="text-amber-700 dark:text-amber-400">
                      {bulkPendingPairs.filter((p) => p.isNew).length} new MQ/MQT entr
                      {bulkPendingPairs.filter((p) => p.isNew).length === 1 ? 'y' : 'ies'} will be created in the catalog.
                    </span>
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkImporting}>Cancel</Button>
                <Button
                  variant="primary"
                  onClick={confirmBulkImport}
                  disabled={bulkImporting || bulkRows.length === 0 || bulkRows.every((r) => r.errors.length > 0)}
                >
                  {bulkImporting
                    ? 'Importing…'
                    : `Import ${bulkRows.filter((r) => r.errors.length === 0).length} Question${bulkRows.filter((r) => r.errors.length === 0).length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
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
