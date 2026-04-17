'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  GripVertical,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

// --- Types ---

interface QuestionOption {
  text: string;
  value: number;
  is_correct?: boolean;
}

interface Question {
  id: string;
  stem: string;
  format: string;
  options: QuestionOption[];
  sub_domain: string;
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

// --- Component ---

export default function CreateAssessmentPage() {
  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Instrument state
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

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);

  // Status
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // --- Step 1: Create instrument ---
  const handleCreateInstrument = async () => {
    if (!instName || !instVertical) {
      setError('Name and vertical are required');
      return;
    }
    setSaving(true);
    setError('');
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create instrument');
      setInstrumentId(data.id);
      setStep(2);
      setSuccess(`Instrument "${instName}" created. Now add your questions.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // --- Step 2: Add questions ---
  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        id: crypto.randomUUID(),
        stem: '',
        format: 'MCQ',
        options: [
          { text: '', value: 0 },
          { text: '', value: 1 },
          { text: '', value: 2 },
          { text: '', value: 3 },
        ],
        sub_domain: '',
        clinical_risk_flag: false,
        risk_flag_rule: '',
      },
    ]);
  };

  const updateQuestion = (id: string, field: string, value: any) => {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)));
  };

  const updateOption = (qId: string, optIdx: number, field: string, value: any) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        const opts = [...q.options];
        opts[optIdx] = { ...opts[optIdx], [field]: value };
        return { ...q, options: opts };
      }),
    );
  };

  const addOption = (qId: string) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        return { ...q, options: [...q.options, { text: '', value: q.options.length }] };
      }),
    );
  };

  const removeOption = (qId: string, optIdx: number) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q;
        return { ...q, options: q.options.filter((_, i) => i !== optIdx) };
      }),
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  // --- Step 3: Save all questions ---
  const handleSaveQuestions = async () => {
    if (questions.length === 0) {
      setError('Add at least one question');
      return;
    }
    const empty = questions.find((q) => !q.stem.trim());
    if (empty) {
      setError('All questions must have question text');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const items = questions.map((q, i) => ({
        stem: q.stem,
        format: q.format,
        options: q.options.filter((o) => o.text.trim()),
        sub_domain: q.sub_domain || `${instShortName || instName}:Q${i + 1}`,
        clinical_risk_flag: q.clinical_risk_flag,
        risk_flag_rule: q.risk_flag_rule,
        sequence_order: i + 1,
        languages: instLanguages,
      }));

      const res = await fetch(`${API_BASE}/instruments/${instrumentId}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save questions');
      setStep(3);
      setSuccess(`${data.created} questions saved to "${instName}". Your assessment is ready.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleLanguage = (code: string) => {
    setInstLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code],
    );
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7 max-w-4xl">
      {/* Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Question Bank</span><span>/</span>
          <span className="text-foreground font-medium">Create Assessment</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Assessment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define your instrument, add questions, and publish.
        </p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-3">
        {[
          { n: 1, label: 'Define Instrument' },
          { n: 2, label: 'Add Questions' },
          { n: 3, label: 'Published' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {step > s.n ? <Check className="h-4 w-4" /> : s.n}
            </div>
            <span className={cn('text-sm', step >= s.n ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
            {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Error/Success */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="h-3 w-3" /></button>
        </div>
      )}
      {success && step !== 2 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}

      {/* ===================== STEP 1: Instrument ===================== */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instrument Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Assessment Name *</label>
                <input value={instName} onChange={(e) => setInstName(e.target.value)} placeholder="e.g., Workplace Wellbeing Scale" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Short Name</label>
                <input value={instShortName} onChange={(e) => setInstShortName(e.target.value)} placeholder="e.g., WWS" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Vertical *</label>
                <select value={instVertical} onChange={(e) => setInstVertical(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
                  {VERTICALS.map((v) => <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Category</label>
                <input value={instCategory} onChange={(e) => setInstCategory(e.target.value)} placeholder="e.g., Depression Screening" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
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
              <textarea value={instDescription} onChange={(e) => setInstDescription(e.target.value)} placeholder="Brief description of what this assessment measures..." rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-vertical" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Languages</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => toggleLanguage(l.code)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      instLanguages.includes(l.code)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50',
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={instIsAdaptive} onChange={(e) => setInstIsAdaptive(e.target.checked)} className="rounded" />
                Adaptive (CAT)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={instIsFixed} onChange={(e) => setInstIsFixed(e.target.checked)} className="rounded" />
                Fixed sequence
              </label>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={handleCreateInstrument} disabled={saving}>
                {saving ? 'Creating...' : 'Create Instrument & Add Questions'}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===================== STEP 2: Questions ===================== */}
      {step === 2 && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{instName}</h2>
              <p className="text-sm text-muted-foreground">{questions.length} question{questions.length !== 1 ? 's' : ''} added</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={addQuestion}>
                <Plus className="h-4 w-4" /> Add Question
              </Button>
              <Button variant="primary" onClick={handleSaveQuestions} disabled={saving || questions.length === 0}>
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : `Save ${questions.length} Questions`}
              </Button>
            </div>
          </div>

          {questions.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground mb-4">No questions yet. Click "Add Question" to start building your assessment.</p>
                <Button variant="outline" onClick={addQuestion}>
                  <Plus className="h-4 w-4" /> Add First Question
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {questions.map((q, idx) => (
              <Card key={q.id}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">{idx + 1}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={q.format}
                        onChange={(e) => updateQuestion(q.id, 'format', e.target.value)}
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                      >
                        {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={q.clinical_risk_flag}
                          onChange={(e) => updateQuestion(q.id, 'clinical_risk_flag', e.target.checked)}
                          className="rounded"
                        />
                        <AlertTriangle className="h-3 w-3 text-red-500" /> Risk flag
                      </label>
                      <button onClick={() => removeQuestion(q.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Question text */}
                  <textarea
                    value={q.stem}
                    onChange={(e) => updateQuestion(q.id, 'stem', e.target.value)}
                    placeholder={`Question ${idx + 1}: Enter your question text here...`}
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-vertical"
                  />

                  {/* Sub-domain */}
                  <input
                    value={q.sub_domain}
                    onChange={(e) => updateQuestion(q.id, 'sub_domain', e.target.value)}
                    placeholder="Sub-domain (e.g., Depression:Somatic)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />

                  {/* Risk flag rule */}
                  {q.clinical_risk_flag && (
                    <input
                      value={q.risk_flag_rule}
                      onChange={(e) => updateQuestion(q.id, 'risk_flag_rule', e.target.value)}
                      placeholder="Risk rule (e.g., value >= 2 triggers suicidality alert)"
                      className="w-full rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20 px-3 py-2 text-xs outline-none focus:border-red-500"
                    />
                  )}

                  {/* Options (for MCQ, RATING_SCALE, LIKERT) */}
                  {['MCQ', 'RATING_SCALE', 'LIKERT', 'SJT'].includes(q.format) && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Answer Options</p>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-6 text-right">{oi + 1}.</span>
                          <input
                            value={opt.text}
                            onChange={(e) => updateOption(q.id, oi, 'text', e.target.value)}
                            placeholder={`Option ${oi + 1}`}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <input
                            type="number"
                            value={opt.value}
                            onChange={(e) => updateOption(q.id, oi, 'value', Number(e.target.value))}
                            className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-center outline-none focus:border-primary"
                            title="Score value"
                          />
                          {q.options.length > 2 && (
                            <button onClick={() => removeOption(q.id, oi)} className="text-muted-foreground hover:text-red-500">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => addOption(q.id)} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Add option
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ===================== STEP 3: Done ===================== */}
      {step === 3 && (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">Assessment Published</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              <strong>{instName}</strong> with {questions.length} questions is now available in your instrument library.
              You can start creating sessions with it immediately.
            </p>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={() => window.location.href = '/instruments'}>
                View in Library
              </Button>
              <Button variant="primary" onClick={() => window.location.href = '/sessions/create'}>
                Create Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
