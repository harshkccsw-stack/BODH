'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, FileText, Loader2, Send, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createSurvey,
  listSurveys,
  publishSurvey,
  type Survey,
} from '@/lib/api/surveys';

const DELIVERY_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'qr', label: 'QR Code' },
  { value: 'link', label: 'Shareable Link' },
];

const statusColors: Record<string, string> = {
  PUBLISHED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  DRAFT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  CLOSED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  COMPLETED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

const deliveryColors: Record<string, string> = {
  whatsapp: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  sms: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  email: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  qr: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  link: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function SurveyPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questionsText, setQuestionsText] = useState('');
  const [deliverySet, setDeliverySet] = useState<Set<string>>(new Set(['email']));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [publishingId, setPublishingId] = useState<string | null>(null);

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSurveys();
      setSurveys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  const stats = useMemo(() => {
    const total = surveys.length;
    const published = surveys.filter((s) => s.status === 'PUBLISHED').length;
    const totalResponses = surveys.reduce((acc, s) => acc + (s.response_count || 0), 0);
    return { total, published, totalResponses };
  }, [surveys]);

  function toggleDelivery(value: string) {
    setDeliverySet((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setQuestionsText('');
    setDeliverySet(new Set(['email']));
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (deliverySet.size === 0) {
      setFormError('Select at least one delivery method.');
      return;
    }

    const questions = questionsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => ({ text: line, type: 'short_text' }));

    setSubmitting(true);
    try {
      await createSurvey({
        title: title.trim(),
        description: description.trim(),
        questions,
        delivery_methods: Array.from(deliverySet),
      });
      resetForm();
      setShowForm(false);
      await fetchSurveys();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create survey');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id: string) {
    setPublishingId(id);
    try {
      await publishSurvey(id);
      await fetchSurveys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish survey');
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span>
          <span>/</span>
          <span className="text-foreground font-medium">BodhSurvey</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Surveys</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage multi-channel surveys.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setShowForm((v) => !v);
              if (showForm) resetForm();
            }}
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create Survey
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Surveys</p>
                <p className="text-2xl font-semibold mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.published} published
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Responses</p>
                <p className="text-2xl font-semibold mt-1">{stats.totalResponses}</p>
                <p className="text-xs text-muted-foreground mt-1">Across all surveys</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <Send className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Published</p>
                <p className="text-2xl font-semibold mt-1">{stats.published}</p>
                <p className="text-xs text-muted-foreground mt-1">Currently live</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Survey</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-5">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Title <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Employee Wellbeing Q2"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Description</label>
                  <textarea
                    className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs shadow-black/5 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short internal description (optional)."
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Delivery Methods</label>
                  <div className="flex flex-wrap gap-3">
                    {DELIVERY_OPTIONS.map((opt) => {
                      const checked = deliverySet.has(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm cursor-pointer transition-colors ${
                            checked
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-input bg-background text-muted-foreground hover:bg-accent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={checked}
                            onChange={() => toggleDelivery(opt.value)}
                            disabled={submitting}
                          />
                          {opt.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Questions <span className="text-muted-foreground font-normal">(one per line)</span>
                  </label>
                  <textarea
                    className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-xs shadow-black/5 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                    value={questionsText}
                    onChange={(e) => setQuestionsText(e.target.value)}
                    placeholder={`How satisfied are you with your role?\nWhat could be improved?\nAny other feedback?`}
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Each line becomes a short-text question. You can refine types later.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Survey
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">All Surveys</CardTitle>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="mx-5 mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && surveys.length === 0 && !error && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No surveys yet. Click <span className="font-medium">Create Survey</span> to get started.
            </div>
          )}

          {surveys.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Title</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Responses</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Delivery</th>
                    <th className="px-5 py-3 text-left font-medium text-muted-foreground">Created</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {surveys.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{s.title}</div>
                        {s.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {s.description}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusColors[s.status] || 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">{s.response_count}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(s.delivery_methods || []).map((d) => (
                            <span
                              key={d}
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                deliveryColors[d] || 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{formatDate(s.created_at)}</td>
                      <td className="px-5 py-3 text-right">
                        {s.status === 'DRAFT' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={publishingId === s.id}
                            onClick={() => handlePublish(s.id)}
                          >
                            {publishingId === s.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Publish
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
