'use client';

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
import { getMQs, getInstruments, getVerticals, BUILT_IN_VERTICALS, type MQ as StoredMQ, type StoredInstrument, type Vertical as StoredVertical } from '@/lib/data-store';
import { demographicFieldsApi, type DemographicField } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

// --- Types ---

type MediaType = 'none' | 'image' | 'video' | 'youtube' | 'audio';

interface MQT {
  id: string;
  name: string;
}

interface MQ {
  id: string;
  name: string;
  mqts: MQT[];
}

interface OptionMqtScore {
  mqt_id: string;
  score: number;
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
  clinical_risk_flag: boolean;
  risk_flag_rule: string;
  sectionId?: string;
  sectionTitle?: string;
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

  // Instrument
  const [instName, setInstName] = useState('');
  const [instShortName, setInstShortName] = useState('');
  const [instVertical, setInstVertical] = useState('CLINICAL');
  const [instCategory, setInstCategory] = useState('');
  const [instDescription, setInstDescription] = useState('');
  const [instDisclaimer, setInstDisclaimer] = useState('');
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

  // Demographic field catalog — fetched once so Step 1 can offer a per-questionnaire subset.
  const [demoFieldCatalog, setDemoFieldCatalog] = useState<DemographicField[]>([]);
  const [demoFieldKeys, setDemoFieldKeys] = useState<string[]>([]);

  useEffect(() => {
    demographicFieldsApi.list(true).then(setDemoFieldCatalog).catch(() => setDemoFieldCatalog([]));
  }, []);

  // ---- Edit mode: load an existing questionnaire from the API ----
  const [editMode, setEditMode] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const editKey = params.get('edit');
        if (!editKey) return;
        const { questionnairesApi } = await import('@/lib/api');
        let match;
        try { match = await questionnairesApi.getByName(editKey); } catch {}
        if (!match) {
          try { match = await questionnairesApi.get(editKey); } catch {}
        }
        if (!match) {
          setError(`Could not find "${editKey}" in the Instrument Library.`);
          return;
        }
        setInstName(match.name || '');
        setInstShortName(match.shortName || '');
        setInstVertical(String(match.vertical || 'CLINICAL').toUpperCase());
        setInstCategory(match.category || '');
        setInstDescription(match.description || '');
        setInstDisclaimer((match as any).disclaimer || '');
        if (Array.isArray((match as any).demographicFieldKeys)) {
          setDemoFieldKeys((match as any).demographicFieldKeys as string[]);
        }
        setInstDuration(typeof match.duration === 'number' ? match.duration : 10);
        setInstTier(typeof match.tier === 'string' && match.tier ? match.tier : 'T1');
        if (Array.isArray(match.languages)) setInstLanguages(match.languages);
        setInstrumentId(match.id || crypto.randomUUID());
        if (Array.isArray(match.questions)) {
          const loaded = match.questions.map((q: any) => ({
            id: q.id || crypto.randomUUID(),
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
            clinical_risk_flag: !!q.clinical_risk_flag,
            risk_flag_rule: String(q.risk_flag_rule || ''),
            sectionId: q.sectionId || undefined,
            sectionTitle: q.sectionTitle || undefined,
          }));
          setQuestions(loaded);
          // Rebuild sections state from the loaded questions, preserving order.
          const seen = new Map<string, string>();
          const order: string[] = [];
          loaded.forEach((q: Question) => {
            if (!q.sectionId) return;
            if (!seen.has(q.sectionId)) {
              seen.set(q.sectionId, q.sectionTitle || '');
              order.push(q.sectionId);
            }
          });
          if (order.length > 0) {
            setSections(order.map((id) => ({ id, title: seen.get(id) || '' })));
            setUseSections(true);
          }
        }
        setEditMode(true);
        setStep(2);
        setSuccess(`Editing "${match.name}" — changes will replace the existing questionnaire on publish.`);
      } catch {}
    })();
  }, []);

  // ---- Verticals (built-in + user-created, synced with backend) ----
  const [verticals, setVerticals] = useState<StoredVertical[]>(BUILT_IN_VERTICALS);
  const [verticalOpen, setVerticalOpen] = useState(false);
  const [verticalSearch, setVerticalSearch] = useState('');
  const [newVerticalOpen, setNewVerticalOpen] = useState(false);
  const [newVerticalForm, setNewVerticalForm] = useState({ name: '', code: '', description: '' });
  const [newVerticalError, setNewVerticalError] = useState('');

  useEffect(() => {
    getVerticals().then(setVerticals).catch(() => setVerticals(BUILT_IN_VERTICALS));
  }, []);

  const filteredVerticals = useMemo(() => {
    const q = verticalSearch.trim().toLowerCase();
    if (!q) return verticals;
    return verticals.filter(
      (v) => v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q),
    );
  }, [verticals, verticalSearch]);

  const selectedVertical = useMemo(
    () => verticals.find((v) => v.code === instVertical) || null,
    [verticals, instVertical],
  );

  const openNewVertical = () => {
    setNewVerticalForm({ name: '', code: '', description: '' });
    setNewVerticalError('');
    setNewVerticalOpen(true);
  };

  const submitNewVertical = async () => {
    const name = newVerticalForm.name.trim();
    const code = newVerticalForm.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64);
    if (!name) { setNewVerticalError('Name is required'); return; }
    if (!code) { setNewVerticalError('Code is required (A-Z, 0-9, underscore)'); return; }
    if (verticals.some((v) => v.code === code)) { setNewVerticalError('A vertical with this code already exists'); return; }
    const vertical: StoredVertical = {
      id: `v-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`,
      code,
      name,
      description: newVerticalForm.description.trim(),
    };
    const next = [...verticals, vertical];
    setVerticals(next);
    setInstVertical(code);
    setNewVerticalOpen(false);
    setVerticalOpen(false);
    setVerticalSearch('');
    try {
      await fetch(`${API_BASE}/verticals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vertical),
      });
    } catch {}
  };

  const mqs: MQ[] = useMemo(
    () => catalog.map((m) => ({
      id: m.id,
      name: m.name,
      mqts: m.mqts.map((t) => ({ id: t.id, name: t.name })),
    })),
    [catalog],
  );

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Flat list of { mqt, mq } for iteration
  const allMqts = useMemo(
    () => mqs.flatMap((mq) => mq.mqts.map((mqt) => ({ mqt, mq }))),
    [mqs],
  );

  const mqtIndex = useMemo(() => {
    const map: Record<string, { mq: MQ; mqt: MQT }> = {};
    mqs.forEach((mq) => mq.mqts.forEach((mqt) => { map[mqt.id] = { mq, mqt }; }));
    return map;
  }, [mqs]);

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
  const [importInstrumentSearch, setImportInstrumentSearch] = useState('');
  const [importQuestionSearch, setImportQuestionSearch] = useState('');
  const [importSource, setImportSource] = useState<StoredInstrument | null>(null);
  const [importPicked, setImportPicked] = useState<Set<string>>(new Set());
  const [importLibrary, setImportLibrary] = useState<StoredInstrument[]>([]);

  const openImport = async () => {
    setImportSource(null);
    setImportPicked(new Set());
    setImportInstrumentSearch('');
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

  const filteredImportInstruments = useMemo(() => {
    const q = importInstrumentSearch.trim().toLowerCase();
    if (!q) return importLibrary;
    return importLibrary.filter(
      (i) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.shortName || '').toLowerCase().includes(q) ||
        (i.vertical || '').toLowerCase().includes(q),
    );
  }, [importLibrary, importInstrumentSearch]);

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
      clinical_risk_flag: !!q.clinical_risk_flag,
      risk_flag_rule: String(q.risk_flag_rule || ''),
    }));
    setQuestions((prev) => [...prev, ...cloned]);
    setImportOpen(false);
  };

  // ---- Bulk import from CSV / XLSX ----
  // Expected columns (case-insensitive):
  //   stem (required), format, section, risk_flag, risk_rule,
  //   option1..option8
  //   option1_mq, option1_mqt, option1_score ... (per option)
  // MQ/MQT names are resolved against the catalog; missing ones are
  // created in the database on import.
  interface ParsedOption {
    text: string;
    mq: string;
    mqt: string;
    score: number | null;
  }
  interface ParsedRow {
    stem: string;
    format: string;
    section: string;
    risk_flag: boolean;
    risk_rule: string;
    options: ParsedOption[];
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
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false });
      if (raw.length === 0) throw new Error('No rows found in the first sheet.');

      const rows = raw.map((row) => {
        const norm: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
          norm[String(k).trim().toLowerCase()] = typeof v === 'string' ? v.trim() : v;
        });
        return norm;
      });

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
          const mq = String(row[`option${n}_mq`] ?? '').trim();
          const mqt = String(row[`option${n}_mqt`] ?? '').trim();
          const scoreRaw = row[`option${n}_score`];
          const scoreStr = scoreRaw === '' || scoreRaw === undefined || scoreRaw === null ? '' : String(scoreRaw).trim();
          const score = scoreStr === '' ? null : Number(scoreStr);
          if (!text) continue;
          if ((mq && !mqt) || (!mq && mqt)) {
            errors.push(`option${n}: provide both MQ and MQT (or neither)`);
          }
          options.push({ text, mq, mqt, score: Number.isFinite(score as number) ? (score as number) : null });
        }
        if (format !== 'FREE_TEXT' && options.length < 2) {
          errors.push(`format ${format} needs at least 2 options`);
        }
        return { stem, format, section, risk_flag, risk_rule, options, errors };
      });

      setBulkRows(parsed);
      setBulkFileName(file.name);
    } catch (e: any) {
      setBulkError(e?.message || 'Failed to parse file.');
    } finally {
      setBulkParsing(false);
    }
  };

  // Collect every distinct (MQ name, MQT name) pair from valid rows.
  const bulkPendingPairs = useMemo(() => {
    const pairs = new Map<string, { mq: string; mqt: string; isNew: boolean }>();
    bulkRows
      .filter((r) => r.errors.length === 0)
      .forEach((r) => {
        r.options.forEach((o) => {
          if (!o.mq || !o.mqt) return;
          const key = `${o.mq.toLowerCase()}|${o.mqt.toLowerCase()}`;
          if (pairs.has(key)) return;
          const existingMq = mqs.find((m) => m.name.toLowerCase() === o.mq.toLowerCase());
          const existingMqt = existingMq?.mqts.find((t) => t.name.toLowerCase() === o.mqt.toLowerCase());
          pairs.set(key, { mq: o.mq, mqt: o.mqt, isNew: !existingMqt });
        });
      });
    return Array.from(pairs.values());
  }, [bulkRows, mqs]);

  const confirmBulkImport = async () => {
    const valid = bulkRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) { setBulkError('No valid rows to import.'); return; }
    setBulkImporting(true);
    setBulkError('');
    try {
      // Resolve / create MQs and MQTs against the database before building questions.
      // Working copy of the catalog that we mutate as we create things so later
      // pairs can find them without another API round-trip.
      let catalogCopy: StoredMQ[] = catalog.map((m) => ({ ...m, mqts: m.mqts.map((t) => ({ ...t })) }));
      const findMq = (name: string) => catalogCopy.find((m) => m.name.toLowerCase() === name.toLowerCase());
      const findMqt = (mq: StoredMQ, name: string) => mq.mqts.find((t) => t.name.toLowerCase() === name.toLowerCase());

      // Track resolved mqt_id for each (mq,mqt) key.
      const resolved = new Map<string, string>();
      const { qualitiesApi } = await import('@/lib/api');

      for (const pair of bulkPendingPairs) {
        const key = `${pair.mq.toLowerCase()}|${pair.mqt.toLowerCase()}`;
        let mq = findMq(pair.mq);
        if (!mq) {
          const newMqtId = `mqt-${Math.random().toString(36).slice(2, 10)}`;
          const newMq: StoredMQ = {
            id: `mq-${Math.random().toString(36).slice(2, 10)}`,
            name: pair.mq,
            mqts: [{ id: newMqtId, name: pair.mqt }],
          };
          await qualitiesApi.create(newMq as any);
          catalogCopy = [...catalogCopy, newMq];
          resolved.set(key, newMqtId);
          continue;
        }
        let mqt = findMqt(mq, pair.mqt);
        if (!mqt) {
          const newMqtId = `mqt-${Math.random().toString(36).slice(2, 10)}`;
          mqt = { id: newMqtId, name: pair.mqt };
          const updated: StoredMQ = { ...mq, mqts: [...mq.mqts, mqt] };
          await qualitiesApi.update(mq.id, { mqts: updated.mqts } as any);
          catalogCopy = catalogCopy.map((m) => (m.id === mq!.id ? updated : m));
        }
        resolved.set(key, mqt.id);
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
            if (o.mq && o.mqt && o.score !== null) {
              const key = `${o.mq.toLowerCase()}|${o.mqt.toLowerCase()}`;
              const mqtId = resolved.get(key);
              if (mqtId) scores.push({ mqt_id: mqtId, score: o.score });
            } else if (!o.mq && !o.mqt && o.score !== null && firstMqtInCatalog) {
              scores.push({ mqt_id: firstMqtInCatalog.id, score: o.score });
            }
            return { text: o.text, scores };
          }),
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
    const header = [
      'stem', 'format', 'section', 'risk_flag', 'risk_rule',
      'option1', 'option1_mq', 'option1_mqt', 'option1_score',
      'option2', 'option2_mq', 'option2_mqt', 'option2_score',
      'option3', 'option3_mq', 'option3_mqt', 'option3_score',
      'option4', 'option4_mq', 'option4_mqt', 'option4_score',
    ];
    const sample = [
      ['How often do you feel overwhelmed by work?', 'LIKERT', 'Stress', 'false', '',
        'Never',      'Wellbeing', 'Stress Level', '0',
        'Sometimes',  'Wellbeing', 'Stress Level', '1',
        'Often',      'Wellbeing', 'Stress Level', '2',
        'Always',     'Wellbeing', 'Stress Level', '3'],
      ['I find it easy to focus for long periods.', 'LIKERT', 'Focus', 'false', '',
        'Strongly disagree', 'Cognitive', 'Attention', '0',
        'Disagree',          'Cognitive', 'Attention', '1',
        'Agree',             'Cognitive', 'Attention', '2',
        'Strongly agree',    'Cognitive', 'Attention', '3'],
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
    setQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
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
        clinical_risk_flag: false,
        risk_flag_rule: '',
        sectionId,
        sectionTitle,
      },
    ]);
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
    const dupes = duplicateMqtsForQuestion(q);
    const dupKey = (mqtId: string, score: number) => dupes.some((d) => d.mqtId === mqtId && d.score === score);
    return (
      <Card key={q.id} className={cn(dupes.length > 0 && 'border-red-300')}>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">{idx + 1}</span>
            </div>
            <div className="flex items-center gap-2">
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

          {dupes.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Two or more options share the same score for:{' '}
                {dupes.map((d, i) => (
                  <span key={`${d.mqtId}-${d.score}`}>
                    <strong>{mqtIndex[d.mqtId]?.mqt.name}</strong> = {d.score}
                    {i < dupes.length - 1 ? ', ' : ''}
                  </span>
                ))}
                . Scores must be unique per MQT within a question.
              </span>
            </div>
          )}

          {['MCQ', 'RATING_SCALE', 'LIKERT', 'SJT', 'IMAGE_CHOICE'].includes(q.format) && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                Answer Options &mdash; check MQTs this option maps to and assign a score. No two options may share a score for the same MQT.
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
                            const isDup = dupKey(sc.mqt_id, sc.score);
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
                                  {allMqts.map(({ mqt, mq }) => (
                                    <option key={mqt.id} value={mqt.id} disabled={usedIds.has(mqt.id)}>
                                      {mq.name}: {mqt.name}{usedIds.has(mqt.id) ? ' (already used)' : ''}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  step="1"
                                  value={sc.score}
                                  onChange={(e) => setOptionMqtScore(q.id, oi, sc.mqt_id, Number(e.target.value))}
                                  className={cn(
                                    'w-16 shrink-0 rounded-md border bg-background px-2 py-1 text-xs text-center outline-none focus:border-primary',
                                    isDup ? 'border-red-400 text-red-600' : 'border-border',
                                  )}
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
                        const unusedMqts = allMqts.filter(({ mqt }) => !opt.scores.some((s) => s.mqt_id === mqt.id));
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

  const addOption = (qId: string) => {
    setQuestions(questions.map((q) => (q.id === qId ? { ...q, options: [...q.options, { text: '', scores: [] }] } : q)));
  };

  const removeOption = (qId: string, optIdx: number) => {
    setQuestions(questions.map((q) => (q.id === qId ? { ...q, options: q.options.filter((_, i) => i !== optIdx) } : q)));
  };

  const removeQuestion = (id: string) => setQuestions(questions.filter((q) => q.id !== id));

  // ---- Validation: per-MQT, no two options share the same score within a question ----

  const duplicateMqtsForQuestion = (q: Question): { mqtId: string; score: number }[] => {
    const dupes: { mqtId: string; score: number }[] = [];
    const byMqt: Record<string, number[]> = {};
    q.options.forEach((opt) => {
      opt.scores.forEach((s) => {
        byMqt[s.mqt_id] = byMqt[s.mqt_id] || [];
        byMqt[s.mqt_id].push(s.score);
      });
    });
    Object.entries(byMqt).forEach(([mqtId, scores]) => {
      const seen = new Set<number>();
      for (const sc of scores) {
        if (seen.has(sc)) {
          if (!dupes.find((d) => d.mqtId === mqtId && d.score === sc)) {
            dupes.push({ mqtId, score: sc });
          }
        }
        seen.add(sc);
      }
    });
    return dupes;
  };

  // ---- Create/Save ----

  const handleCreateInstrument = async () => {
    if (!instName || !instVertical) {
      setError('Name and vertical are required');
      return;
    }
    // Refresh the catalog so Step 2's MQT scoring picks up any new MQs.
    try {
      const freshCatalog = await getMQs();
      if (freshCatalog.length !== catalog.length) setCatalog(freshCatalog);
    } catch {}
    // No DB write here — the instrument is only persisted when the user
    // clicks Publish in Step 2. This avoids leaving orphan rows behind if
    // the user abandons the flow halfway.
    setError('');
    if (!instrumentId) setInstrumentId(crypto.randomUUID());
    setStep(2);
    setSuccess('');
  };

  const handleSaveQuestions = async () => {
    if (questions.length === 0) {
      setError('Add at least one question');
      return;
    }
    const empty = questions.find((q) => !q.stem.trim() && q.media_type === 'none');
    if (empty) {
      setError('Every question needs either text or media');
      return;
    }

    // Uniqueness check: no two options may share the same score for the same MQT.
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const dupes = duplicateMqtsForQuestion(q);
      if (dupes.length > 0) {
        const d = dupes[0];
        setError(`Question ${i + 1}: options share score ${d.score} for MQT "${mqtIndex[d.mqtId]?.mqt.name}". Scores must be unique per MQT.`);
        return;
      }
    }

    setSaving(true);
    setError('');

    const qid = instrumentId || `qn-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const { questionnairesApi } = await import('@/lib/api');
      await questionnairesApi.upsert({
        id: qid,
        name: instName,
        shortName: instShortName,
        vertical: instVertical,
        category: instCategory,
        description: instDescription,
        disclaimer: instDisclaimer,
        duration: Number(instDuration) || 0,
        tier: instTier,
        languages: instLanguages,
        mqs: mqs.map((m) => ({
          id: m.id,
          name: m.name,
          mqts: m.mqts.map((t) => ({ id: t.id, name: t.name })),
        })),
        questions: questions.map((q) => ({
          id: q.id,
          stem: q.stem,
          format: q.format,
          media_url: q.media_type === 'none' ? '' : q.media_url,
          media_type: q.media_type === 'none' ? 'none' : q.media_type,
          options: q.options
            .filter((o) => o.text.trim() || o.media_url || o.scores.length > 0)
            .map((o) => ({
              text: o.text,
              scores: o.scores.map((s) => ({ mqt_id: s.mqt_id, score: Number(s.score) || 0 })),
              media_url: o.media_url,
              media_type: o.media_type,
            })),
          clinical_risk_flag: q.clinical_risk_flag,
          risk_flag_rule: q.risk_flag_rule,
          ...(useSections && q.sectionId ? { sectionId: q.sectionId, sectionTitle: q.sectionTitle || '' } : {}),
        })),
        isDemo: false,
        demographicFieldKeys: demoFieldKeys,
      });

      // Also register the instrument in the /instruments catalog so it
      // shows up in the Instrument Library. Best-effort — if this fails we
      // keep the published_questionnaires write.
      try {
        const scoring_config = {
          model: 'MQ_MQT',
          mqs: mqs.map((m) => ({ id: m.id, name: m.name, mqts: m.mqts.map((t) => ({ id: t.id, name: t.name })) })),
        };
        await fetch(`${API_BASE}/instruments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: instName,
            short_name: instShortName,
            vertical: instVertical,
            category: instCategory,
            description: instDescription,
            duration_minutes: instDuration,
            tier_required: instTier,
            languages: instLanguages,
            is_adaptive: instIsAdaptive,
            is_fixed_sequence: instIsFixed,
            uses_weighted_scoring: true,
            scoring_config,
          }),
        });
      } catch {}

      setInstrumentId(qid);
      setStep(3);
      setSuccess(
        `"${instName}" published with ${questions.length} question${questions.length !== 1 ? 's' : ''}. Saved to Postgres and ready for respondents.`,
      );
    } catch (e: any) {
      setError(`Failed to publish: ${e?.message || 'API error'}. Is the backend running?`);
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
              if (step === 3) { window.location.href = '/instruments'; return; }
              if (window.history.length > 1) window.history.back();
              else window.location.href = '/question-bank';
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {step === 2 ? 'Back to Instrument Details' : step === 3 ? 'View Library' : 'Back'}
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Question Bank</span><span>/</span>
          <span className="text-foreground font-medium">{editMode ? 'Edit Questionnaire' : 'Create Questionnaire'}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{editMode ? 'Edit Questionnaire' : 'Create Questionnaire'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {editMode
            ? 'Update questions, options, media, and scoring. Publishing will replace the existing version in the Instrument Library.'
            : 'Define your instrument with Measured Qualities (MQ) and their MQTs, then score each option against one or more MQTs.'}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {[
          { n: 1, label: 'Define Instrument' },
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
            <CardHeader><CardTitle className="text-base">Instrument Details</CardTitle></CardHeader>
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
                <div className="space-y-1.5 relative">
                  <label className="text-sm font-medium">Vertical *</label>
                  <button
                    type="button"
                    onClick={() => setVerticalOpen((v) => !v)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 flex items-center justify-between text-left"
                  >
                    <span className={cn(!selectedVertical && 'text-muted-foreground')}>
                      {selectedVertical ? selectedVertical.name : 'Select a vertical'}
                    </span>
                    <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', verticalOpen && 'rotate-90')} />
                  </button>
                  {verticalOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setVerticalOpen(false)} />
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-background shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-border">
                          <div className="relative">
                            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              autoFocus
                              value={verticalSearch}
                              onChange={(e) => setVerticalSearch(e.target.value)}
                              placeholder="Search verticals..."
                              className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary"
                            />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {filteredVerticals.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-muted-foreground text-center">No verticals match your search.</p>
                          ) : (
                            filteredVerticals.map((v) => {
                              const selected = v.code === instVertical;
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => { setInstVertical(v.code); setVerticalOpen(false); setVerticalSearch(''); }}
                                  className={cn(
                                    'w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2',
                                    selected && 'bg-primary/5',
                                  )}
                                >
                                  <div className="min-w-0">
                                    <p className={cn('font-medium truncate', selected && 'text-primary')}>{v.name}</p>
                                    <p className="text-[0.6875rem] text-muted-foreground truncate font-mono">
                                      {v.code}{v.isBuiltIn ? ' · built-in' : ''}
                                    </p>
                                  </div>
                                  {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                                </button>
                              );
                            })
                          )}
                        </div>
                        <div className="border-t border-border p-1.5">
                          <button
                            type="button"
                            onClick={() => { setNewVerticalOpen(true); setVerticalOpen(false); }}
                            className="w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Create new vertical
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Category</label>
                  <input value={instCategory} onChange={(e) => setInstCategory(e.target.value)} placeholder="e.g., Cognitive Aptitude" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Duration (minutes)</label>
                  <input type="number" value={instDuration} onChange={(e) => setInstDuration(Number(e.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tier Required</label>
                  <select value={instTier} onChange={(e) => setInstTier(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                    {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea value={instDescription} onChange={(e) => setInstDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">Disclaimer / Terms &amp; Conditions</label>
                  <span className="text-[0.6875rem] text-muted-foreground">Optional — shown to respondents before they start</span>
                </div>
                <textarea
                  value={instDisclaimer}
                  onChange={(e) => setInstDisclaimer(e.target.value)}
                  rows={6}
                  placeholder="Paste or write any terms, confidentiality notes, or participation conditions here. If left empty, respondents go straight to the first question."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[0.6875rem] text-muted-foreground">
                  When present, the respondent must tick <em>I agree &amp; continue</em> before the assessment starts.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium">Pre-Assessment Demographic Fields</label>
                  <div className="flex items-center gap-2">
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {demoFieldKeys.length === 0
                        ? `Empty = all ${demoFieldCatalog.length} active fields`
                        : `${demoFieldKeys.length} selected`}
                    </span>
                    {demoFieldCatalog.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setDemoFieldKeys(demoFieldCatalog.map((f) => f.fieldKey))}
                          className="text-[0.6875rem] font-medium text-primary hover:underline"
                        >
                          Select all
                        </button>
                        <span className="text-[0.6875rem] text-muted-foreground">·</span>
                        <button
                          type="button"
                          onClick={() => setDemoFieldKeys([])}
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
                    No demographic fields defined yet. Manage them at <a href="/instruments/demographics" className="text-primary hover:underline">Instrument Library → Demographic Fields</a>.
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {demoFieldCatalog.map((f) => {
                        const checked = demoFieldKeys.includes(f.fieldKey);
                        return (
                          <label
                            key={f.id}
                            className={cn(
                              'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs cursor-pointer transition-colors',
                              checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setDemoFieldKeys((prev) =>
                                  e.target.checked
                                    ? [...prev, f.fieldKey]
                                    : prev.filter((k) => k !== f.fieldKey),
                                );
                              }}
                              className="mt-0.5 rounded"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">{f.label}</span>
                                {f.required && <span className="text-[0.625rem] text-destructive">*</span>}
                              </div>
                              <div className="text-[0.625rem] text-muted-foreground truncate">
                                {f.fieldKey} · {f.type}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="text-[0.6875rem] text-muted-foreground">
                  Respondents fill these in before starting this questionnaire. Leave empty to use every active field from the catalog.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Languages</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => (
                    <button key={l.code} onClick={() => toggleLanguage(l.code)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', instLanguages.includes(l.code) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-6 flex-wrap">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={instIsAdaptive} onChange={(e) => setInstIsAdaptive(e.target.checked)} className="rounded" /> Adaptive (CAT)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={instIsFixed} onChange={(e) => setInstIsFixed(e.target.checked)} className="rounded" /> Fixed sequence
                </label>
                <label className="flex items-center gap-2 text-sm" title="Organize questions into labelled sections (e.g., Part A, Part B)">
                  <input type="checkbox" checked={useSections} onChange={(e) => setUseSections(e.target.checked)} className="rounded" /> Organize into sections
                </label>
              </div>
            </CardContent>
          </Card>


          <div className="flex justify-end">
            <Button variant="primary" onClick={handleCreateInstrument} disabled={saving}>
              Continue to Questions
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* ===== STEP 2 ===== */}
      {step === 2 && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{instName}</h2>
              <p className="text-sm text-muted-foreground">
                {questions.length} questions · {allMqts.length} MQT{allMqts.length !== 1 ? 's' : ''} across {mqs.length} MQ{mqs.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setStep(1); setError(''); }}>
                <ChevronLeft className="h-4 w-4" /> Previous Step
              </Button>
              <Button variant="primary" onClick={handleSaveQuestions} disabled={saving || questions.length === 0}>
                <Save className="h-4 w-4" /> {saving ? (editMode ? 'Saving...' : 'Publishing...') : editMode ? `Save ${questions.length} Questions` : `Publish ${questions.length} Questions`}
              </Button>
            </div>
          </div>

          {/* Empty state — varies based on sections mode */}
          {!useSections && questions.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center space-y-4">
                <p className="text-muted-foreground">No questions yet. Click "Add Question" below to start.</p>
                <Button variant="outline" onClick={() => addQuestion()}><Plus className="h-4 w-4" /> Add First Question</Button>
              </CardContent>
            </Card>
          )}
          {useSections && sections.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center space-y-4">
                <p className="text-muted-foreground">
                  Sections mode is on. Start by creating a section — you can then add questions inside each section.
                </p>
                <Button variant="outline" onClick={addSection}><Layers className="h-4 w-4" /> Add First Section</Button>
              </CardContent>
            </Card>
          )}

          {/* Flat rendering — when sections toggle is off */}
          {!useSections && questions.length > 0 && (
            <div className="space-y-4">
              {questions.map((q, idx) => renderQuestionCard(q, idx))}
            </div>
          )}

          {/* Grouped rendering — when sections toggle is on */}
          {useSections && sections.length > 0 && (
            <div className="space-y-6">
              {sections.map((section) => {
                const sectionQuestions = questions.filter((q) => q.sectionId === section.id);
                return (
                  <div key={section.id} className="rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3 rounded-t-xl">
                      <Layers className="h-4 w-4 text-primary shrink-0" />
                      <input
                        value={section.title}
                        onChange={(e) => renameSection(section.id, e.target.value)}
                        placeholder="Section title"
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <span className="text-[0.6875rem] text-muted-foreground shrink-0">
                        {sectionQuestions.length} question{sectionQuestions.length !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => deleteSection(section.id)}
                        className="text-muted-foreground hover:text-red-500 shrink-0"
                        title="Delete section (removes all questions inside)"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="p-4 space-y-4">
                      {sectionQuestions.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic text-center py-4">
                          No questions in this section yet.
                        </p>
                      ) : (
                        sectionQuestions.map((q) => renderQuestionCard(q, questions.indexOf(q)))
                      )}
                      <div className="pt-1">
                        <Button variant="outline" size="sm" onClick={() => addQuestion(section.id, section.title)}>
                          <Plus className="h-4 w-4" /> Add Question to this Section
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Ungrouped questions (sectionId not in sections list) */}
              {(() => {
                const sectionIds = new Set(sections.map((s) => s.id));
                const ungrouped = questions.filter((q) => !q.sectionId || !sectionIds.has(q.sectionId));
                if (ungrouped.length === 0) return null;
                return (
                  <div className="rounded-xl border border-dashed border-border bg-muted/10">
                    <div className="px-4 py-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Unassigned ({ungrouped.length})
                    </div>
                    <div className="p-4 space-y-4">
                      {ungrouped.map((q) => renderQuestionCard(q, questions.indexOf(q)))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===== Bottom toolbar: add/preview/copy (sticky) ===== */}
          <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 backdrop-blur px-4 py-3 shadow-lg mt-6">
            <div className="flex flex-wrap gap-2">
              {useSections ? (
                <Button variant="outline" onClick={addSection}>
                  <Layers className="h-4 w-4" /> Add Section
                </Button>
              ) : (
                <Button variant="outline" onClick={() => addQuestion()}>
                  <Plus className="h-4 w-4" /> Add Question
                </Button>
              )}
              <Button variant="outline" onClick={openImport}>
                <Copy className="h-4 w-4" /> Copy from Questionnaire
              </Button>
              <Button variant="outline" onClick={openBulkImport}>
                <UploadIcon className="h-4 w-4" /> Import CSV/Excel
              </Button>
              <Button variant="outline" onClick={openPreview} disabled={questions.length === 0}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
            </div>
            <Button variant="primary" onClick={handleSaveQuestions} disabled={saving || questions.length === 0}>
              <Save className="h-4 w-4" /> {saving ? (editMode ? 'Saving...' : 'Publishing...') : editMode ? `Save ${questions.length} Questions` : `Publish ${questions.length} Questions`}
            </Button>
          </div>
        </>
      )}

      {/* ===== Create new vertical modal ===== */}
      {newVerticalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setNewVerticalOpen(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Create Vertical</CardTitle>
              <button onClick={() => setNewVerticalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {newVerticalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{newVerticalError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input
                  value={newVerticalForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setNewVerticalForm((f) => ({
                      ...f,
                      name,
                      // Auto-fill the code from name if the user hasn't typed their own code yet
                      code: f.code ? f.code : name.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 64),
                    }));
                  }}
                  placeholder="e.g., Sports Psychology"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Code *</label>
                <input
                  value={newVerticalForm.code}
                  onChange={(e) => setNewVerticalForm({ ...newVerticalForm, code: e.target.value.toUpperCase() })}
                  placeholder="SPORTS_PSYCH"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="text-[0.6875rem] text-muted-foreground">Stable identifier used on records. A-Z, 0-9, underscore only.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  rows={2}
                  value={newVerticalForm.description}
                  onChange={(e) => setNewVerticalForm({ ...newVerticalForm, description: e.target.value })}
                  placeholder="Optional"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setNewVerticalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submitNewVertical}>Create</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Preview: whole questionnaire at once ===== */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch bg-black/60" onClick={() => setPreviewOpen(false)}>
          <div className="m-auto w-full max-w-3xl bg-background rounded-xl border border-border shadow-xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="shrink-0 border-b border-border px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-primary">
                  Preview · not saved
                </p>
                <h3 className="text-lg font-semibold truncate">{instName || 'Untitled questionnaire'}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {questions.length} question{questions.length !== 1 ? 's' : ''}
                  {instShortName ? ` · ${instShortName}` : ''}
                  {instVertical ? ` · ${instVertical}` : ''}
                  {instDuration ? ` · ~${instDuration} min` : ''}
                </p>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Whole questionnaire in a single scrollable view */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-5 py-6 space-y-6">
                {instDescription && (
                  <p className="text-sm text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-3">
                    {instDescription}
                  </p>
                )}

                {questions.map((q, idx) => (
                  <div key={q.id} className="rounded-xl border border-border bg-background overflow-hidden">
                    <div className="flex items-start gap-3 px-4 py-3 bg-muted/40 border-b border-border">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug">
                          {q.stem || <span className="text-muted-foreground italic">(no stem)</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[0.6875rem] text-muted-foreground">
                          <span className="font-mono">{q.format}</span>
                          {q.clinical_risk_flag && (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <AlertTriangle className="h-3 w-3" /> Risk flag
                            </span>
                          )}
                          {q.options.length > 0 && <span>· {q.options.length} options</span>}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      {q.media_type !== 'none' && q.media_url && (
                        <MediaPreview url={q.media_url} type={q.media_type} />
                      )}

                      {String(q.format || '').toUpperCase().replace(/_/g, '') === 'FREETEXT' ? (
                        <div className="space-y-1.5">
                          <textarea
                            rows={5}
                            disabled
                            placeholder="Respondent will type their answer here…"
                            className="w-full rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm outline-none resize-none"
                          />
                          <p className="text-[0.6875rem] text-muted-foreground italic">
                            Free-text response — no MQT scoring; stored on the session for admin review.
                          </p>
                        </div>
                      ) : q.options.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No options on this question yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {q.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className="rounded-lg border border-border px-3 py-2"
                            >
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[0.6875rem] font-semibold text-muted-foreground">
                                  {String.fromCharCode(65 + oi)}
                                </span>
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  <p className="text-sm">
                                    {opt.text || <span className="text-muted-foreground italic">Option {oi + 1} (no text)</span>}
                                  </p>
                                  {opt.media_url && opt.media_type && opt.media_type !== 'none' && (
                                    <MediaPreview url={opt.media_url} type={opt.media_type} />
                                  )}
                                  {opt.scores.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {opt.scores.map((s) => (
                                        <span key={s.mqt_id} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] font-mono text-muted-foreground">
                                          {mqtIndex[s.mqt_id]?.mqt.name || s.mqt_id}: {s.score}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {q.clinical_risk_flag && q.risk_flag_rule && (
                        <p className="text-[0.6875rem] text-red-600 flex items-start gap-1.5">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{q.risk_flag_rule}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border px-5 py-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                This preview is not saved. Close to keep editing, or publish to make it available in the Instrument Library.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button
                  variant="primary"
                  onClick={() => { setPreviewOpen(false); handleSaveQuestions(); }}
                  disabled={saving || questions.length === 0}
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Publishing...' : 'Publish'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Import from questionnaire modal ===== */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setImportOpen(false)}>
          <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <div className="flex items-center gap-2">
                {importStage === 'questions' && (
                  <Button variant="ghost" size="sm" mode="icon" onClick={() => { setImportStage('instrument'); setImportPicked(new Set()); setImportQuestionSearch(''); }}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <CardTitle className="text-base">
                  {importStage === 'instrument' ? 'Pick a Questionnaire' : `Pick Questions — ${importSource?.name}`}
                </CardTitle>
              </div>
              <button onClick={() => setImportOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col gap-3 pb-4">
              {/* Search bar (sticky at top of the list panel) */}
              <div className="relative shrink-0">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                {importStage === 'instrument' ? (
                  <input
                    autoFocus
                    type="text"
                    value={importInstrumentSearch}
                    onChange={(e) => setImportInstrumentSearch(e.target.value)}
                    placeholder="Search questionnaires by name, short name, or vertical..."
                    className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                ) : (
                  <input
                    autoFocus
                    type="text"
                    value={importQuestionSearch}
                    onChange={(e) => setImportQuestionSearch(e.target.value)}
                    placeholder="Search questions by text..."
                    className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                )}
              </div>

              {/* Scrollable list */}
              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border">
                {importStage === 'instrument' ? (
                  filteredImportInstruments.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {importLibrary.length === 0
                        ? 'No published questionnaires yet. Create one first, then you can copy from it later.'
                        : 'No questionnaires match your search.'}
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {filteredImportInstruments.map((inst) => {
                        const qCount = Array.isArray(inst.questions) ? inst.questions.length : 0;
                        return (
                          <li key={inst.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setImportSource(inst);
                                setImportPicked(new Set());
                                setImportQuestionSearch('');
                                setImportStage('questions');
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{inst.name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {inst.shortName ? `${inst.shortName} · ` : ''}
                                  {String(inst.vertical || '—').toLowerCase()} · {qCount} question{qCount !== 1 ? 's' : ''}
                                </p>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : (
                  filteredImportQuestions.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {(importSource?.questions?.length || 0) === 0
                        ? 'This questionnaire has no questions.'
                        : 'No questions match your search.'}
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {filteredImportQuestions.map((qq: any, idx: number) => {
                        const picked = importPicked.has(qq.id);
                        return (
                          <li key={qq.id || idx}>
                            <label className={cn(
                              'flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors',
                              picked && 'bg-primary/5',
                            )}>
                              <input
                                type="checkbox"
                                checked={picked}
                                onChange={() => toggleImportPick(qq.id)}
                                className="mt-0.5 rounded"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-snug">
                                  {idx + 1}. {qq.stem || <span className="text-muted-foreground italic">(no text)</span>}
                                </p>
                                {Array.isArray(qq.options) && qq.options.length > 0 && (
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {qq.options.map((o: any) => o.text).filter(Boolean).join(' · ') || `${qq.options.length} options`}
                                  </p>
                                )}
                                <p className="text-[0.6875rem] text-muted-foreground mt-1">
                                  {String(qq.format || '').toLowerCase()} · {Array.isArray(qq.options) ? qq.options.length : 0} options
                                </p>
                              </div>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )
                )}
              </div>

              <div className="flex items-center justify-between gap-3 shrink-0 pt-1">
                <p className="text-xs text-muted-foreground">
                  {importStage === 'instrument'
                    ? `${filteredImportInstruments.length} questionnaire${filteredImportInstruments.length !== 1 ? 's' : ''} found`
                    : `${importPicked.size} selected · ${filteredImportQuestions.length} shown`}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                  {importStage === 'questions' && (
                    <Button variant="primary" onClick={confirmImport} disabled={importPicked.size === 0}>
                      <Plus className="h-4 w-4" />
                      Add {importPicked.size > 0 ? `${importPicked.size} ` : ''}Question{importPicked.size === 1 ? '' : 's'}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== STEP 3 ===== */}
      {step === 3 && (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">Published to Instrument Library</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              <strong>{instName}</strong> with {questions.length} questions, {mqs.length} MQ{mqs.length !== 1 ? 's' : ''} and {allMqts.length} MQT{allMqts.length !== 1 ? 's' : ''} is now live.
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={() => window.location.href = '/instruments'}>View in Library</Button>
              <Button variant="primary" onClick={() => window.location.href = '/sessions/create'}>Create Session</Button>
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
                  <code className="font-mono">option1_mq</code>,{' '}
                  <code className="font-mono">option1_mqt</code>,{' '}
                  <code className="font-mono">option1_score</code> (repeat per option)
                </p>
                <p className="mt-2">
                  Format defaults to <strong>MCQ</strong>. Sections mode must be on for the{' '}
                  <code className="font-mono">section</code> column to take effect. Each option can map to an MQ / MQT —
                  missing ones are created in the database on import. If no MQ/MQT is given but a score is, the score is
                  applied to the first MQT in the catalog (backward-compatible).
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
