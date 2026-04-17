'use client';

import { useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Link2,
  Plus,
  Save,
  Trash2,
  Upload as UploadIcon,
  Video,
  X,
  Youtube,
} from 'lucide-react';

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
  const [instDuration, setInstDuration] = useState(10);
  const [instTier, setInstTier] = useState('T1');
  const [instLanguages, setInstLanguages] = useState<string[]>(['en']);
  const [instIsAdaptive, setInstIsAdaptive] = useState(false);
  const [instIsFixed, setInstIsFixed] = useState(true);

  // Measured Quality hierarchy (MQ > MQT). 1 MQ can have multiple MQTs.
  const [mqs, setMqs] = useState<MQ[]>([
    { id: crypto.randomUUID(), name: 'Default MQ', mqts: [{ id: crypto.randomUUID(), name: 'Default MQT' }] },
  ]);

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

  // ---- MQ/MQT management ----

  const addMQ = () => {
    const name = prompt('Measured Quality (MQ) name — e.g., "Personality", "Cognitive Ability":');
    if (!name) return;
    if (mqs.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      alert('An MQ with that name already exists');
      return;
    }
    setMqs([...mqs, { id: crypto.randomUUID(), name, mqts: [] }]);
  };

  const removeMQ = (mqId: string) => {
    if (mqs.length <= 1) return;
    const mq = mqs.find((m) => m.id === mqId);
    const mqtIds = new Set(mq?.mqts.map((t) => t.id) || []);
    setMqs(mqs.filter((m) => m.id !== mqId));
    // Strip any option scores referencing this MQ's MQTs
    setQuestions(questions.map((q) => ({
      ...q,
      options: q.options.map((o) => ({
        ...o,
        scores: o.scores.filter((s) => !mqtIds.has(s.mqt_id)),
      })),
    })));
  };

  const addMQT = (mqId: string) => {
    const mq = mqs.find((m) => m.id === mqId);
    const name = prompt(`MQT name under "${mq?.name}" — e.g., "Extraversion", "Verbal Reasoning":`);
    if (!name) return;
    if (mq?.mqts.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      alert('An MQT with that name already exists under this MQ');
      return;
    }
    setMqs(mqs.map((m) => (m.id === mqId ? { ...m, mqts: [...m.mqts, { id: crypto.randomUUID(), name }] } : m)));
  };

  const removeMQT = (mqId: string, mqtId: string) => {
    setMqs(mqs.map((m) => (m.id === mqId ? { ...m, mqts: m.mqts.filter((t) => t.id !== mqtId) } : m)));
    setQuestions(questions.map((q) => ({
      ...q,
      options: q.options.map((o) => ({ ...o, scores: o.scores.filter((s) => s.mqt_id !== mqtId) })),
    })));
  };

  // ---- Question handlers ----

  const addQuestion = () => {
    setQuestions([
      ...questions,
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
      },
    ]);
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
    if (mqs.length === 0 || mqs.every((m) => m.mqts.length === 0)) {
      setError('Define at least one Measured Quality with at least one MQT before continuing');
      return;
    }
    setSaving(true);
    setError('');
    const scoring_config = {
      model: 'MQ_MQT',
      mqs: mqs.map((m) => ({ id: m.id, name: m.name, mqts: m.mqts.map((t) => ({ id: t.id, name: t.name })) })),
    };
    let id: string | null = null;
    try {
      const res = await fetch(`${API_BASE}/instruments`, {
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
      if (res.ok) {
        const data = await res.json();
        id = data.id;
      }
    } catch {
      // Backend unavailable — proceed with local-only flow
    }
    setInstrumentId(id || crypto.randomUUID());
    setStep(2);
    setSuccess(`Instrument "${instName}" created. Add questions below.`);
    setSaving(false);
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

    // Save a local copy so respondents can take the assessment in the browser
    // (the take page reads from localStorage['bodhassess.instruments'])
    try {
      const localInstrument = {
        id: instrumentId || crypto.randomUUID(),
        name: instName,
        shortName: instShortName,
        vertical: instVertical,
        category: instCategory,
        description: instDescription,
        duration: instDuration,
        tier: instTier,
        languages: instLanguages,
        mqs,
        questions,
        createdAt: new Date().toISOString(),
      };
      const raw = localStorage.getItem('bodhassess.instruments');
      const existing: any[] = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter((i) => i.name !== instName);
      localStorage.setItem('bodhassess.instruments', JSON.stringify([localInstrument, ...filtered]));
    } catch {}

    const items = questions.map((q, i) => {
      const mqtNames = Array.from(
        new Set(q.options.flatMap((o) => o.scores.map((s) => mqtIndex[s.mqt_id]?.mqt.name).filter(Boolean) as string[])),
      );
      return {
        stem: q.stem,
        format: q.format,
        media_url: q.media_type === 'none' ? '' : q.media_url,
        media_type: q.media_type === 'none' ? '' : q.media_type,
        options: q.options
          .filter((o) => o.text.trim() || o.media_url || o.scores.length > 0)
          .map((o) => ({
            text: o.text,
            value: o.scores[0]?.score ?? 0,
            mqt_scores: o.scores,
            media_url: o.media_url,
            media_type: o.media_type,
          })),
        sub_domains: mqtNames.map((n) => ({ domain: n, weight: 1 })),
        sub_domain: mqtNames[0] || `${instShortName || instName}:Q${i + 1}`,
        clinical_risk_flag: q.clinical_risk_flag,
        risk_flag_rule: q.risk_flag_rule,
        sequence_order: i + 1,
        languages: instLanguages,
      };
    });

    let backendSynced = 0;
    try {
      const res = await fetch(`${API_BASE}/instruments/${instrumentId}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        const data = await res.json();
        backendSynced = data.created || 0;
      }
    } catch {
      // Backend unavailable; local copy is still saved and playable
    }

    setStep(3);
    setSuccess(
      `"${instName}" published with ${questions.length} question${questions.length !== 1 ? 's' : ''}. ` +
      (backendSynced > 0 ? `${backendSynced} synced to backend.` : 'Saved locally — ready for respondents.'),
    );
    setSaving(false);
  };

  const toggleLanguage = (code: string) => {
    setInstLanguages((prev) => (prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]));
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Question Bank</span><span>/</span>
          <span className="text-foreground font-medium">Create Assessment</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Assessment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define your instrument with Measured Qualities (MQ) and their MQTs, then score each option against one or more MQTs.
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
                  <label className="text-sm font-medium">Assessment Name *</label>
                  <input value={instName} onChange={(e) => setInstName(e.target.value)} placeholder="e.g., Engineering Graduate Aptitude Test" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Short Name</label>
                  <input value={instShortName} onChange={(e) => setInstShortName(e.target.value)} placeholder="e.g., EGAT" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Vertical *</label>
                  <select value={instVertical} onChange={(e) => setInstVertical(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                    {VERTICALS.map((v) => <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>)}
                  </select>
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
                <label className="text-sm font-medium">Languages</label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => (
                    <button key={l.code} onClick={() => toggleLanguage(l.code)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors', instLanguages.includes(l.code) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50')}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={instIsAdaptive} onChange={(e) => setInstIsAdaptive(e.target.checked)} className="rounded" /> Adaptive (CAT)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={instIsFixed} onChange={(e) => setInstIsFixed(e.target.checked)} className="rounded" /> Fixed sequence
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Measured Qualities + MQTs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Measured Qualities (MQ) &amp; MQTs
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Define the Measured Qualities (MQ) for this instrument. Each MQ can have multiple Measured Quality Types (MQTs). Each answer option will score against one or more MQTs.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addMQ}><Plus className="h-3 w-3" /> Add MQ</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {mqs.map((mq) => (
                <div key={mq.id} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide">MQ</span>
                      <input
                        value={mq.name}
                        onChange={(e) => setMqs(mqs.map((m) => (m.id === mq.id ? { ...m, name: e.target.value } : m)))}
                        className="rounded-md border border-border bg-background px-2 py-1 text-sm font-medium outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => addMQT(mq.id)}>
                        <Plus className="h-3 w-3" /> Add MQT
                      </Button>
                      {mqs.length > 1 && (
                        <button onClick={() => removeMQ(mq.id)} className="text-muted-foreground hover:text-red-500" title="Remove MQ">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {mq.mqts.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No MQTs yet — add at least one.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {mq.mqts.map((mqt) => (
                        <span key={mqt.id} className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium">
                          <span className="text-muted-foreground text-[0.625rem]">MQT</span>
                          <input
                            value={mqt.name}
                            onChange={(e) => setMqs(mqs.map((m) => (m.id === mq.id ? { ...m, mqts: m.mqts.map((t) => (t.id === mqt.id ? { ...t, name: e.target.value } : t)) } : m)))}
                            className="rounded bg-transparent outline-none focus:ring-1 focus:ring-primary px-1"
                            size={Math.max(mqt.name.length, 8)}
                          />
                          <button onClick={() => removeMQT(mq.id, mqt.id)} className="text-muted-foreground hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleCreateInstrument} disabled={saving}>
              {saving ? 'Creating...' : 'Continue to Questions'}
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
              <Button variant="outline" onClick={addQuestion}><Plus className="h-4 w-4" /> Add Question</Button>
              <Button variant="primary" onClick={handleSaveQuestions} disabled={saving || questions.length === 0}>
                <Save className="h-4 w-4" /> {saving ? 'Publishing...' : `Publish ${questions.length} Questions`}
              </Button>
            </div>
          </div>

          {questions.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground mb-4">No questions yet. Click "Add Question" to start.</p>
                <Button variant="outline" onClick={addQuestion}><Plus className="h-4 w-4" /> Add First Question</Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {questions.map((q, idx) => {
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

                            {/* MQT scoring matrix for this option */}
                            {allMqts.length > 0 && (
                              <div className="rounded-md bg-muted/40 border border-border px-3 py-2 space-y-1.5">
                                <p className="text-[0.6875rem] font-medium text-muted-foreground">Scores per MQT</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                                  {allMqts.map(({ mqt, mq }) => {
                                    const score = opt.scores.find((s) => s.mqt_id === mqt.id);
                                    const isOn = !!score;
                                    const isDup = isOn && dupKey(mqt.id, score!.score);
                                    return (
                                      <div key={mqt.id} className="flex items-center gap-2">
                                        <label className="flex items-center gap-1.5 text-xs flex-1 min-w-0">
                                          <input type="checkbox" checked={isOn} onChange={() => toggleOptionMqt(q.id, oi, mqt.id)} className="rounded" />
                                          <span className="truncate">
                                            <span className="text-muted-foreground">{mq.name}:</span>{' '}
                                            <span className={cn(isOn && 'font-medium')}>{mqt.name}</span>
                                          </span>
                                        </label>
                                        {isOn && (
                                          <input
                                            type="number"
                                            step="1"
                                            value={score!.score}
                                            onChange={(e) => setOptionMqtScore(q.id, oi, mqt.id, Number(e.target.value))}
                                            className={cn(
                                              'w-16 rounded-md border bg-background px-2 py-1 text-xs text-center outline-none focus:border-primary',
                                              isDup ? 'border-red-400 text-red-600' : 'border-border',
                                            )}
                                            title="Score for this MQT"
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Option media */}
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
            })}
          </div>
        </>
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
    </div>
  );
}
