import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
  Edit3,
  FileEdit,
  Filter,
  FlaskConical,
  Globe,
  Library,
  MoreVertical,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Vertical is now an open string so user-created verticals (e.g. "education")
// are first-class. We seed the page with the three built-ins and merge in
// anything the API returns from /verticals on mount.
type Vertical = string;
type ItemFormat = 'MCQ' | 'Rating Scale' | 'Likert' | 'SJT' | 'Free Text' | 'Image Choice' | 'Ranking' | 'Matrix';
type ValidationStatus = 'Draft' | 'Piloting' | 'Calibrated' | 'Validated' | 'Deprecated';
type Language = 'en' | 'hi' | 'ta' | 'bn' | 'mr' | 'te' | 'kn' | 'ml' | 'gu' | 'pa' | 'or';

interface IRTParams {
  a: number; // discrimination
  b: number; // difficulty
  c: number; // guessing (only meaningful for MCQ-like)
}

interface QuestionItem {
  id: string;
  subDomain: string;
  vertical: Vertical;
  format: ItemFormat;
  irt: IRTParams;
  languages: Language[];
  status: ValidationStatus;
  riskFlag: boolean;
  stem: string;
  options?: string[];
  normSets: string[];
  lastCalibrated: string;
  sampleN: number;
  reliabilityAlpha: number;
  instrumentName?: string;
  instrumentShortName?: string;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const ITEMS: QuestionItem[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LANG_LABELS: Record<Language, string> = {
  en: 'EN', hi: 'HI', ta: 'TA', bn: 'BN', mr: 'MR',
  te: 'TE', kn: 'KN', ml: 'ML', gu: 'GU', pa: 'PA', or: 'OR',
};

const STATUS_STYLES: Record<ValidationStatus, { variant: 'success' | 'primary' | 'info' | 'warning' | 'destructive'; appearance: 'light' }> = {
  Validated:  { variant: 'success', appearance: 'light' },
  Calibrated: { variant: 'primary', appearance: 'light' },
  Piloting:   { variant: 'info', appearance: 'light' },
  Draft:      { variant: 'warning', appearance: 'light' },
  Deprecated: { variant: 'destructive', appearance: 'light' },
};

// Built-in vertical labels (extended at runtime by the API catalog below).
const BUILTIN_VERTICAL_LABELS: Record<string, string> = {
  clinical: 'Clinical',
  industrial: 'Industrial',
  counselling: 'Counselling',
};

const ALL_FORMATS: ItemFormat[] = ['MCQ', 'Rating Scale', 'Likert', 'SJT', 'Free Text', 'Image Choice', 'Ranking', 'Matrix'];
const ALL_STATUSES: ValidationStatus[] = ['Draft', 'Piloting', 'Calibrated', 'Validated', 'Deprecated'];
const BUILTIN_VERTICALS: Vertical[] = ['clinical', 'industrial', 'counselling'];
const ALL_LANGUAGES: Language[] = ['en', 'hi', 'ta', 'bn', 'mr', 'te', 'kn', 'ml', 'gu', 'pa', 'or'];

function truncateUUID(uuid: string) {
  return uuid.slice(0, 8) + '...';
}

// Map vertical strings from stored questionnaires to a stable lowercase key.
// Built-ins get canonicalised; anything else passes through so custom
// verticals created by the user surface in the Item Explorer too.
function normalizeStoredVertical(v: unknown): Vertical | null {
  const s = String(v || '').toLowerCase().trim();
  if (!s) return null;
  if (s.startsWith('clin')) return 'clinical';
  if (s.startsWith('indust')) return 'industrial';
  if (s.startsWith('coun')) return 'counselling';
  return s;
}

// Map the Create Questionnaire format code to the Item Explorer format label.
function normalizeStoredFormat(f: unknown): ItemFormat {
  const s = String(f || '').toUpperCase().replace(/[\s_-]/g, '');
  switch (s) {
    case 'MCQ': return 'MCQ';
    case 'RATINGSCALE': return 'Rating Scale';
    case 'LIKERT': return 'Likert';
    case 'SJT': return 'SJT';
    case 'FREETEXT': return 'Free Text';
    case 'IMAGECHOICE': return 'Image Choice';
    case 'RANKING': return 'Ranking';
    case 'MATRIX': return 'Matrix';
    default: return 'MCQ';
  }
}

function normalizeLanguageCodes(codes: unknown): Language[] {
  if (!Array.isArray(codes)) return ['en'];
  const valid: Language[] = ['en', 'hi', 'ta', 'bn', 'mr', 'te', 'kn', 'ml', 'gu', 'pa', 'or'];
  const out: Language[] = [];
  codes.forEach((c) => {
    const lc = String(c || '').toLowerCase().slice(0, 2) as Language;
    if (valid.includes(lc) && !out.includes(lc)) out.push(lc);
  });
  return out.length ? out : ['en'];
}

interface ItemOverride {
  subDomain?: string;
  format?: ItemFormat;
  stem?: string;
  options?: string[];
  riskFlag?: boolean;
  status?: ValidationStatus;
}

// Load overrides + soft-delete flags from the backend in one pass.
async function loadItemDisplayState(): Promise<{
  overrides: Record<string, ItemOverride>;
  deletedIds: string[];
}> {
  try {
    const { itemDisplayApi } = await import('@/lib/api');
    const rows = await itemDisplayApi.list();
    const overrides: Record<string, ItemOverride> = {};
    const deletedIds: string[] = [];
    rows.forEach((row) => {
      if (row.override) overrides[row.itemId] = row.override as ItemOverride;
      if (row.deleted) deletedIds.push(row.itemId);
    });
    return { overrides, deletedIds };
  } catch {
    return { overrides: {}, deletedIds: [] };
  }
}

// Update the question matching `qid` inside the stored instruments catalog.

// Load user-published questionnaires from the backend and flatten into
// QuestionItems for the Item Explorer table.
async function loadUserItems(): Promise<QuestionItem[]> {
  if (typeof window === 'undefined') return [];
  try {
    const { questionnairesApi } = await import('@/lib/api');
    const list = await questionnairesApi.list();
    const items: QuestionItem[] = [];
    list.forEach((inst) => {
      // Drop demo/seed rows — they were generated by the old auto-seed in
      // create-assessment and never represent real authored content.
      if (inst.isDemo === true) return;
      const vertical = normalizeStoredVertical(inst.vertical);
      if (!vertical) return;
      const mqtNameById: Record<string, string> = {};
      if (Array.isArray(inst.mqs)) {
        inst.mqs.forEach((mq) => {
          if (Array.isArray(mq.mqts)) mq.mqts.forEach((t) => { mqtNameById[t.id] = t.name; });
        });
      }
      const instLangs = normalizeLanguageCodes(inst.languages);
      const shortName = inst.shortName || (inst.name ? String(inst.name).split(' ')[0] : 'CUSTOM');
      const questions = Array.isArray(inst.questions) ? inst.questions : [];
      questions.forEach((q: any, idx: number) => {
        if (!q) return;
        const firstScore = Array.isArray(q.options)
          ? q.options.flatMap((o: any) => Array.isArray(o?.scores) ? o.scores : []).find((s: any) => s?.mqt_id)
          : null;
        const mqtName = firstScore ? (mqtNameById[firstScore.mqt_id] || 'Custom') : 'Custom';
        const options = Array.isArray(q.options)
          ? q.options.map((o: any) => String(o?.text || '')).filter((t: string) => t.length > 0)
          : undefined;
        items.push({
          id: q.id || `${inst.id || shortName}-q${idx + 1}`,
          subDomain: `${shortName}:${mqtName}`,
          vertical,
          format: normalizeStoredFormat(q.format),
          irt: { a: 0, b: 0, c: 0 },
          languages: instLangs,
          status: 'Draft',
          riskFlag: !!q.clinical_risk_flag,
          stem: String(q.stem || '').trim() || `(${inst.name || 'Untitled'}) — item ${idx + 1}`,
          options,
          normSets: [],
          lastCalibrated: '',
          sampleN: 0,
          reliabilityAlpha: 0,
          instrumentName: inst.name || shortName,
          instrumentShortName: shortName,
        });
      });
    });
    return items;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Component: FilterPill
// ---------------------------------------------------------------------------

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors border',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:bg-muted'
      )}
    >
      {label}
      {active && <X className="h-3 w-3" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component: DropdownFilter
// ---------------------------------------------------------------------------

function DropdownFilter<T extends string>({
  label,
  options,
  selected,
  onToggle,
  renderLabel,
}: {
  label: string;
  options: T[];
  selected: Set<T>;
  onToggle: (val: T) => void;
  renderLabel?: (val: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const display = renderLabel || ((v: T) => v);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Filter className="h-3 w-3 text-muted-foreground" />
        {label}
        {selected.size > 0 && (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {selected.size}
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-background p-1 shadow-lg">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                  selected.has(opt) ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted'
                )}
              >
                <span className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px]',
                  selected.has(opt) ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                )}>
                  {selected.has(opt) && '\u2713'}
                </span>
                {display(opt)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component: DetailPanel
// ---------------------------------------------------------------------------

function DetailPanel({ item }: { item: QuestionItem }) {
  return (
    <tr>
      <td colSpan={10} className="bg-muted/30 px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Stem & Options */}
          <div className="md:col-span-2 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Item Stem</p>
              <p className="text-sm">{item.stem}</p>
            </div>
            {item.options && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Response Options</p>
                <ol className="list-decimal list-inside text-sm space-y-0.5">
                  {item.options.map((opt, i) => (
                    <li key={i} className="text-muted-foreground">
                      <span className="text-foreground">{opt}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Full Item ID</p>
              <p className="font-mono text-xs break-all">{item.id}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">IRT Parameters</p>
              <div className="flex gap-4 font-mono text-xs">
                <span>a = {item.irt.a.toFixed(2)}</span>
                <span>b = {item.irt.b.toFixed(2)}</span>
                <span>c = {item.irt.c.toFixed(2)}</span>
              </div>
            </div>
            {item.lastCalibrated && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Last Calibrated</p>
                <p className="text-xs">{item.lastCalibrated}</p>
              </div>
            )}
            {item.sampleN > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Calibration Sample</p>
                <p className="text-xs">N = {item.sampleN.toLocaleString()}</p>
              </div>
            )}
            {item.reliabilityAlpha > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Reliability (Cronbach alpha)</p>
                <p className="text-xs font-mono">{item.reliabilityAlpha.toFixed(2)}</p>
              </div>
            )}
            {item.normSets.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Available Norm Sets</p>
                <ul className="text-xs space-y-0.5">
                  {item.normSets.map((norm, i) => (
                    <li key={i} className="text-muted-foreground">{norm}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function QuestionBankPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVerticals, setSelectedVerticals] = useState<Set<Vertical>>(new Set());
  const [selectedFormats, setSelectedFormats] = useState<Set<ItemFormat>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ValidationStatus>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<Set<Language>>(new Set());
  const [userItems, setUserItems] = useState<QuestionItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ItemOverride>>({});
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  // Verticals catalog, loaded from the API so user-created verticals show up
  // in the filter pills automatically. Falls back to the built-ins on error.
  const [verticalCatalog, setVerticalCatalog] = useState<Array<{ code: string; name: string }>>([]);

  // Combined list of all vertical *keys* (lowercase) seen across:
  //   - the built-in catalog
  //   - the verticalsApi result
  //   - any item we actually loaded (covers the case where a questionnaire's
  //     vertical isn't yet in the catalog due to a race condition).
  const allVerticals = useMemo<Vertical[]>(() => {
    const out = new Set<string>(BUILTIN_VERTICALS);
    verticalCatalog.forEach((v) => {
      const code = String(v.code || '').toLowerCase().trim();
      if (code) out.add(code);
    });
    userItems.forEach((it) => out.add(it.vertical));
    return Array.from(out);
  }, [verticalCatalog, userItems]);

  // Display labels — built-ins first, API names second, code as last resort.
  const verticalLabels = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = { ...BUILTIN_VERTICAL_LABELS };
    verticalCatalog.forEach((v) => {
      const code = String(v.code || '').toLowerCase().trim();
      if (code && !out[code]) out[code] = v.name || v.code || code;
    });
    return out;
  }, [verticalCatalog]);

  const renderVerticalLabel = (v: Vertical) =>
    verticalLabels[v] ?? (v.charAt(0).toUpperCase() + v.slice(1));

  // Action modal state
  const [editItem, setEditItem] = useState<QuestionItem | null>(null);
  const [editForm, setEditForm] = useState({
    stem: '', subDomain: '', format: 'MCQ' as ItemFormat,
    options: '', riskFlag: false, status: 'Draft' as ValidationStatus,
  });
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<QuestionItem | null>(null);

  // Edit Question modal — edits the actual question inside its parent questionnaire in the backend
  interface EditQuestionOption {
    text: string;
    scores: Array<{ mqt_id: string; score: number }>;
    media_url?: string;
    media_type?: string;
  }
  interface EditQuestionState {
    item: QuestionItem;
    questionnaireId: string;
    questionnaireName: string;
    questionIdx: number;
    allMqts: Array<{ mqId: string; mqName: string; mqtId: string; mqtName: string }>;
    form: {
      stem: string;
      format: string;
      clinical_risk_flag: boolean;
      risk_flag_rule: string;
      options: EditQuestionOption[];
    };
  }
  const [editQuestion, setEditQuestion] = useState<EditQuestionState | null>(null);
  const [editQuestionLoading, setEditQuestionLoading] = useState(false);
  const [editQuestionError, setEditQuestionError] = useState('');
  const [editQuestionSaving, setEditQuestionSaving] = useState(false);

  const openEditQuestion = async (item: QuestionItem) => {
    const target = item.instrumentName || item.instrumentShortName || item.subDomain.split(':')[0];
    if (!target) { setEditQuestionError('Could not identify this item\'s parent questionnaire.'); return; }
    setEditQuestionError('');
    setEditQuestionLoading(true);
    try {
      const { questionnairesApi } = await import('@/lib/api');
      const qn = await questionnairesApi.getByName(target);
      const idx = (qn.questions || []).findIndex((q: any) => q.id === item.id);
      if (idx < 0) {
        setEditQuestionError(`Question "${item.id}" not found inside "${qn.name}". It may have been removed.`);
        setEditQuestionLoading(false);
        return;
      }
      const q = (qn.questions || [])[idx];
      const allMqts = (qn.mqs || []).flatMap((mq: any) =>
        (mq.mqts || []).map((t: any) => ({ mqId: mq.id, mqName: mq.name, mqtId: t.id, mqtName: t.name })),
      );
      setEditQuestion({
        item,
        questionnaireId: qn.id,
        questionnaireName: qn.name,
        questionIdx: idx,
        allMqts,
        form: {
          stem: String(q.stem || ''),
          format: String(q.format || 'MCQ'),
          clinical_risk_flag: !!q.clinical_risk_flag,
          risk_flag_rule: String(q.risk_flag_rule || ''),
          options: Array.isArray(q.options)
            ? q.options.map((o: any) => ({
                text: String(o.text || ''),
                scores: Array.isArray(o.scores)
                  ? o.scores.map((s: any) => ({ mqt_id: s.mqt_id, score: Number(s.score) || 0 }))
                  : [],
                media_url: o.media_url,
                media_type: o.media_type,
              }))
            : [],
        },
      });
    } catch (e: any) {
      setEditQuestionError(e?.message || 'Failed to load the parent questionnaire');
    } finally {
      setEditQuestionLoading(false);
    }
  };

  const updateEditOption = (oi: number, patch: Partial<EditQuestionOption>) => {
    setEditQuestion((prev) => {
      if (!prev) return prev;
      const opts = [...prev.form.options];
      opts[oi] = { ...opts[oi], ...patch };
      return { ...prev, form: { ...prev.form, options: opts } };
    });
  };
  const addEditOption = () => {
    setEditQuestion((prev) => prev ? {
      ...prev,
      form: { ...prev.form, options: [...prev.form.options, { text: '', scores: [] }] },
    } : prev);
  };
  const removeEditOption = (oi: number) => {
    setEditQuestion((prev) => prev ? {
      ...prev,
      form: { ...prev.form, options: prev.form.options.filter((_, i) => i !== oi) },
    } : prev);
  };
  const setEditOptionScore = (oi: number, mqtId: string, score: number | null) => {
    setEditQuestion((prev) => {
      if (!prev) return prev;
      const opts = [...prev.form.options];
      const existing = opts[oi].scores.find((s) => s.mqt_id === mqtId);
      if (score === null) {
        opts[oi] = { ...opts[oi], scores: opts[oi].scores.filter((s) => s.mqt_id !== mqtId) };
      } else if (existing) {
        opts[oi] = { ...opts[oi], scores: opts[oi].scores.map((s) => s.mqt_id === mqtId ? { ...s, score } : s) };
      } else {
        opts[oi] = { ...opts[oi], scores: [...opts[oi].scores, { mqt_id: mqtId, score }] };
      }
      return { ...prev, form: { ...prev.form, options: opts } };
    });
  };

  const saveEditQuestion = async () => {
    if (!editQuestion) return;
    setEditQuestionSaving(true);
    setEditQuestionError('');
    try {
      const { questionnairesApi } = await import('@/lib/api');
      const qn = await questionnairesApi.get(editQuestion.questionnaireId);
      const questions = Array.isArray(qn.questions) ? [...qn.questions] : [];
      const target = questions[editQuestion.questionIdx];
      if (!target) {
        setEditQuestionError('The question no longer exists in the questionnaire.');
        setEditQuestionSaving(false);
        return;
      }
      questions[editQuestion.questionIdx] = {
        ...target,
        stem: editQuestion.form.stem,
        format: editQuestion.form.format,
        clinical_risk_flag: editQuestion.form.clinical_risk_flag,
        risk_flag_rule: editQuestion.form.risk_flag_rule,
        options: editQuestion.form.options.map((o) => ({
          text: o.text,
          scores: o.scores,
          media_url: o.media_url,
          media_type: o.media_type,
        })),
      };
      await questionnairesApi.upsert({ ...qn, questions });
      setEditQuestion(null);
      loadUserItems().then(setUserItems).catch(() => {});
    } catch (e: any) {
      setEditQuestionError(e?.message || 'Failed to save — is the API running?');
    } finally {
      setEditQuestionSaving(false);
    }
  };

  useEffect(() => {
    loadUserItems().then(setUserItems).catch(() => setUserItems([]));
    loadItemDisplayState().then(({ overrides: o, deletedIds: d }) => {
      setOverrides(o);
      setDeletedIds(d);
    });
    // Pull the verticals catalog so the filter row shows user-created ones.
    (async () => {
      try {
        const { verticalsApi } = await import('@/lib/api');
        const list = await verticalsApi.list();
        setVerticalCatalog(Array.isArray(list) ? list : []);
      } catch {
        setVerticalCatalog([]);
      }
    })();
  }, []);


  // Unified item pool: user-published questions surface first, then mocks.
  // Deduplicate by id, apply overrides, filter out deleted.
  const allItems = useMemo(() => {
    const seen = new Set<string>();
    const deleted = new Set(deletedIds);
    const out: QuestionItem[] = [];
    [...userItems, ...ITEMS].forEach((i) => {
      if (seen.has(i.id) || deleted.has(i.id)) return;
      seen.add(i.id);
      const o = overrides[i.id];
      out.push(o ? { ...i, ...o, options: o.options ?? i.options } : i);
    });
    return out;
  }, [userItems, overrides, deletedIds]);

  const openEditItem = (item: QuestionItem) => {
    setEditItem(item);
    setEditForm({
      stem: item.stem,
      subDomain: item.subDomain,
      format: item.format,
      options: (item.options || []).join('\n'),
      riskFlag: item.riskFlag,
      status: item.status,
    });
  };

  const saveItemEdit = async () => {
    if (!editItem) return;
    const options = editForm.options
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const patch: ItemOverride = {
      stem: editForm.stem.trim() || editItem.stem,
      subDomain: editForm.subDomain.trim() || editItem.subDomain,
      format: editForm.format,
      options: options.length ? options : undefined,
      riskFlag: editForm.riskFlag,
      status: editForm.status,
    };
    const nextOverrides = { ...overrides, [editItem.id]: { ...(overrides[editItem.id] || {}), ...patch } };
    setOverrides(nextOverrides);
    try {
      const { itemDisplayApi } = await import('@/lib/api');
      await itemDisplayApi.upsertOverride(editItem.id, nextOverrides[editItem.id] as any);
    } catch {}
    setEditItem(null);
  };

  const deleteItem = async () => {
    if (!confirmDeleteItem) return;
    const id = confirmDeleteItem.id;
    const next = deletedIds.includes(id) ? deletedIds : [...deletedIds, id];
    setDeletedIds(next);
    try {
      const { itemDisplayApi } = await import('@/lib/api');
      await itemDisplayApi.markDeleted(id);
    } catch {}
    if (expandedId === id) setExpandedId(null);
    setConfirmDeleteItem(null);
  };

  // Toggle helpers
  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  // Filtering
  const filtered = allItems.filter((item) => {
    if (selectedVerticals.size > 0 && !selectedVerticals.has(item.vertical)) return false;
    if (selectedFormats.size > 0 && !selectedFormats.has(item.format)) return false;
    if (selectedStatuses.size > 0 && !selectedStatuses.has(item.status)) return false;
    if (selectedLanguages.size > 0 && !item.languages.some((l) => selectedLanguages.has(l))) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.subDomain.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.stem.toLowerCase().includes(q) ||
        (item.instrumentName || '').toLowerCase().includes(q) ||
        (item.instrumentShortName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Computed stats from full list
  const totalItems = allItems.length;
  const calibratedItems = allItems.filter((i) => i.status === 'Calibrated' || i.status === 'Validated').length;
  const indianNormItems = allItems.filter((i) => i.normSets.length > 0).length;
  const riskFlaggedItems = allItems.filter((i) => i.riskFlag).length;

  const hasActiveFilters = selectedVerticals.size > 0 || selectedFormats.size > 0 || selectedStatuses.size > 0 || selectedLanguages.size > 0 || searchQuery;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span>Item Management</span>
          <span>/</span>
          <span className="text-foreground font-medium">Question Bank</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Question Bank &mdash; Item Explorer
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse, filter, and inspect psychometric items across 100,000+ items, 18 formats, and 11 languages.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Total Items', value: '1,00,847', icon: Database, change: '+1,204 this month' },
          { label: 'Calibrated Items', value: '68,312', icon: FlaskConical, change: '67.7% of total' },
          { label: 'Items with Indian Norms', value: '42,580', icon: Globe, change: 'Across 11 languages' },
          { label: 'Risk-Flagged Items', value: '1,247', icon: AlertTriangle, change: '312 pending review' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
                <div className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-lg',
                  stat.label === 'Risk-Flagged Items' ? 'bg-destructive/10' : 'bg-primary/10'
                )}>
                  <stat.icon className={cn(
                    'h-5 w-5',
                    stat.label === 'Risk-Flagged Items' ? 'text-destructive' : 'text-primary'
                  )} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by questionnaire, ID, sub-domain, or stem..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-shadow"
              />
            </div>

            {/* Vertical pills — built-ins + any user-created verticals */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {allVerticals.map((v) => (
                <FilterPill
                  key={v}
                  label={renderVerticalLabel(v)}
                  active={selectedVerticals.has(v)}
                  onClick={() => setSelectedVerticals(toggleSet(selectedVerticals, v))}
                />
              ))}
            </div>

            {/* Dropdown filters */}
            <DropdownFilter
              label="Format"
              options={ALL_FORMATS}
              selected={selectedFormats}
              onToggle={(v) => setSelectedFormats(toggleSet(selectedFormats, v))}
            />
            <DropdownFilter
              label="Status"
              options={ALL_STATUSES}
              selected={selectedStatuses}
              onToggle={(v) => setSelectedStatuses(toggleSet(selectedStatuses, v))}
            />
            <DropdownFilter
              label="Language"
              options={ALL_LANGUAGES}
              selected={selectedLanguages}
              onToggle={(v) => setSelectedLanguages(toggleSet(selectedLanguages, v))}
              renderLabel={(v) => LANG_LABELS[v]}
            />

            {/* Clear all */}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSelectedVerticals(new Set());
                  setSelectedFormats(new Set());
                  setSelectedStatuses(new Set());
                  setSelectedLanguages(new Set());
                  setSearchQuery('');
                }}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Library className="h-4 w-4" />
              Items
              <Badge variant="secondary" size="sm">{filtered.length} shown</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">Click a row to expand details</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground w-8"></th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Item ID</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Questionnaire</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Question</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Sub-domain</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Format</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">IRT (a / b / c)</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Languages</th>
                  <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isExpanded = expandedId === item.id;
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className={cn(
                          'border-b border-border cursor-pointer transition-colors',
                          isExpanded ? 'bg-muted/40' : 'hover:bg-muted/50'
                        )}
                      >
                        {/* Expand icon + risk flag */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            }
                            {item.riskFlag && (
                              <span className="flex h-2.5 w-2.5 rounded-full bg-red-500" title="Risk-flagged item" />
                            )}
                          </div>
                        </td>

                        {/* Item ID */}
                        <td className="px-5 py-3 font-mono text-xs">{truncateUUID(item.id)}</td>

                        {/* Questionnaire */}
                        <td className="px-5 py-3 text-xs">
                          {item.instrumentName || item.subDomain.split(':')[0] || '—'}
                        </td>

                        {/* Question (stem) — truncated; full text shown when row is expanded */}
                        <td className="px-5 py-3 text-xs max-w-md">
                          <p className="line-clamp-2" title={item.stem}>
                            {item.stem || '—'}
                          </p>
                        </td>

                        {/* Sub-domain */}
                        <td className="px-5 py-3 font-medium text-xs">{item.subDomain}</td>

                        {/* Format */}
                        <td className="px-5 py-3">
                          <Badge variant="secondary" appearance="light" size="sm">{item.format}</Badge>
                        </td>

                        {/* IRT */}
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.irt.a.toFixed(2)}{' / '}
                            <span className={cn(
                              item.irt.b > 1.5 ? 'text-red-500' : item.irt.b < -1.5 ? 'text-blue-500' : ''
                            )}>
                              {item.irt.b >= 0 ? '+' : ''}{item.irt.b.toFixed(2)}
                            </span>
                            {' / '}{item.irt.c.toFixed(2)}
                          </span>
                        </td>

                        {/* Languages */}
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {item.languages.slice(0, 3).map((lang) => (
                              <span key={lang} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                {LANG_LABELS[lang]}
                              </span>
                            ))}
                            {item.languages.length > 3 && (
                              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                +{item.languages.length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3">
                          <Badge
                            variant={STATUS_STYLES[item.status].variant}
                            appearance={STATUS_STYLES[item.status].appearance}
                            size="sm"
                          >
                            {item.riskFlag && <ShieldCheck className="h-3 w-3 mr-0.5" />}
                            {item.status}
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" mode="icon" aria-label="Item actions">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => openEditItem(item)}>
                                <Edit3 className="size-3.5" /> Update
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  openEditQuestion(item);
                                }}
                              >
                                <FileEdit className="size-3.5" /> Edit Question
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setConfirmDeleteItem(item)}
                                className="text-red-600 focus:text-red-700 focus:bg-red-50 dark:focus:bg-red-950/30"
                              >
                                <Trash2 className="size-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && <DetailPanel key={`${item.id}-detail`} item={item} />}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-muted-foreground text-sm">
                      No items match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Update item modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditItem(null)}>
          <Card className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Update Item</CardTitle>
              <button onClick={() => setEditItem(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs font-mono">
                <div className="flex justify-between"><span className="text-muted-foreground">Item ID</span><span className="break-all ml-2">{editItem.id}</span></div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sub-domain</label>
                <input
                  value={editForm.subDomain}
                  onChange={(e) => setEditForm({ ...editForm, subDomain: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Stem</label>
                <textarea
                  rows={3}
                  value={editForm.stem}
                  onChange={(e) => setEditForm({ ...editForm, stem: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Format</label>
                  <select
                    value={editForm.format}
                    onChange={(e) => setEditForm({ ...editForm, format: e.target.value as ItemFormat })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {ALL_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ValidationStatus })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Response Options (one per line)</label>
                <textarea
                  rows={4}
                  value={editForm.options}
                  onChange={(e) => setEditForm({ ...editForm, options: e.target.value })}
                  placeholder={'Option 1\nOption 2\nOption 3'}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.riskFlag}
                  onChange={(e) => setEditForm({ ...editForm, riskFlag: e.target.checked })}
                  className="rounded"
                />
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                Clinical risk flag
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
                <Button variant="primary" onClick={saveItemEdit}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Question (source) — single-question editor that writes back to the parent questionnaire */}
      {(editQuestion || editQuestionLoading || (editQuestionError && !editItem && !confirmDeleteItem)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => { if (!editQuestionSaving) { setEditQuestion(null); setEditQuestionError(''); } }}>
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <div className="min-w-0">
                <CardTitle className="text-base">Edit Question</CardTitle>
                {editQuestion && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    In <span className="font-medium text-foreground">{editQuestion.questionnaireName}</span>
                  </p>
                )}
              </div>
              <button onClick={() => { if (!editQuestionSaving) { setEditQuestion(null); setEditQuestionError(''); } }} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto space-y-4">
              {editQuestionError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{editQuestionError}</span>
                </div>
              )}
              {editQuestionLoading && (
                <p className="text-sm text-muted-foreground">Loading question from database…</p>
              )}
              {editQuestion && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Stem</label>
                    <textarea
                      rows={3}
                      value={editQuestion.form.stem}
                      onChange={(e) => setEditQuestion((prev) => prev ? { ...prev, form: { ...prev.form, stem: e.target.value } } : prev)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Format</label>
                      <select
                        value={editQuestion.form.format}
                        onChange={(e) => setEditQuestion((prev) => prev ? { ...prev, form: { ...prev.form, format: e.target.value } } : prev)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      >
                        {['MCQ', 'RATING_SCALE', 'LIKERT', 'SJT', 'FREE_TEXT', 'IMAGE_CHOICE', 'RANKING', 'MATRIX'].map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm mt-6">
                      <input
                        type="checkbox"
                        checked={editQuestion.form.clinical_risk_flag}
                        onChange={(e) => setEditQuestion((prev) => prev ? { ...prev, form: { ...prev.form, clinical_risk_flag: e.target.checked } } : prev)}
                        className="rounded"
                      />
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Clinical risk flag
                    </label>
                  </div>
                  {editQuestion.form.clinical_risk_flag && (
                    <input
                      value={editQuestion.form.risk_flag_rule}
                      onChange={(e) => setEditQuestion((prev) => prev ? { ...prev, form: { ...prev.form, risk_flag_rule: e.target.value } } : prev)}
                      placeholder="Risk rule (e.g., value >= 2 triggers alert)"
                      className="w-full rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 px-3 py-2 text-xs outline-none focus:border-red-500"
                    />
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Options</p>
                      <button
                        type="button"
                        onClick={addEditOption}
                        className="text-xs text-primary hover:underline"
                      >
                        + Add option
                      </button>
                    </div>
                    {editQuestion.form.options.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No options. Click "+ Add option" above.</p>
                    ) : (
                      editQuestion.form.options.map((opt, oi) => (
                        <div key={oi} className="rounded-md border border-border p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-6 text-right">{oi + 1}.</span>
                            <input
                              value={opt.text}
                              onChange={(e) => updateEditOption(oi, { text: e.target.value })}
                              placeholder={`Option ${oi + 1}`}
                              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                            />
                            {editQuestion.form.options.length > 1 && (
                              <button onClick={() => removeEditOption(oi)} className="text-muted-foreground hover:text-red-500">
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          {editQuestion.allMqts.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1.5 pl-8">
                              {editQuestion.allMqts.map(({ mqId, mqName, mqtId, mqtName }) => {
                                const score = opt.scores.find((s) => s.mqt_id === mqtId);
                                const isOn = !!score;
                                return (
                                  <div key={mqtId} className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 text-xs flex-1 min-w-0">
                                      <input
                                        type="checkbox"
                                        checked={isOn}
                                        onChange={() => setEditOptionScore(oi, mqtId, isOn ? null : 0)}
                                        className="rounded"
                                      />
                                      <span className="truncate">
                                        <span className="text-muted-foreground">{mqName}:</span> {mqtName}
                                      </span>
                                    </label>
                                    {isOn && (
                                      <input
                                        type="number"
                                        step="1"
                                        value={score!.score}
                                        onChange={(e) => setEditOptionScore(oi, mqtId, Number(e.target.value))}
                                        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs text-center outline-none focus:border-primary"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </CardContent>
            {editQuestion && (
              <div className="shrink-0 border-t border-border px-5 py-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => { if (!editQuestionSaving) setEditQuestion(null); }}>Cancel</Button>
                <Button variant="primary" onClick={saveEditQuestion} disabled={editQuestionSaving}>
                  {editQuestionSaving ? 'Saving…' : 'Save Question'}
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Delete item confirm */}
      {confirmDeleteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDeleteItem(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete Item
              </CardTitle>
              <button onClick={() => setConfirmDeleteItem(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Remove item <span className="font-mono text-xs">{truncateUUID(confirmDeleteItem.id)}</span> ({confirmDeleteItem.subDomain})?
                If this item belongs to a published assessment, it is removed from that assessment's question set as well.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDeleteItem(null)}>Cancel</Button>
                <Button variant="primary" onClick={deleteItem} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
