import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  ClipboardList,
  Hash,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  demographicsApi,
  type DemographicFieldPayload,
  type DemographicFieldResponse,
  type DemographicFieldType,
} from './demographicsApi';

const FIELD_TYPES: Array<{ value: DemographicFieldType; label: string; icon: typeof Type }> = [
  { value: 'TEXT', label: 'Text', icon: Type },
  { value: 'NUMBER', label: 'Number', icon: Hash },
  { value: 'DATE', label: 'Date', icon: Calendar },
  { value: 'DROPDOWN', label: 'Dropdown', icon: ChevronDown },
];

const typeMeta = (t: DemographicFieldType) => FIELD_TYPES.find((f) => f.value === t) ?? FIELD_TYPES[0];

interface FieldForm {
  id: number | null;
  label: string;
  fieldType: DemographicFieldType;
  placeholder: string;
  options: string[];
}

const EMPTY_FORM: FieldForm = { id: null, label: '', fieldType: 'TEXT', placeholder: '', options: [] };

export default function DemographicsPage() {
  const [fields, setFields] = useState<DemographicFieldResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FieldForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<DemographicFieldResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const res = await demographicsApi.getDemographicFields();
      setFields(res.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load demographic fields');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => { refresh(true); }, []);

  const filtered = useMemo(() => {
    if (!search) return fields;
    const s = search.toLowerCase();
    return fields.filter(
      (f) => f.label.toLowerCase().includes(s) || f.options.some((o) => o.toLowerCase().includes(s)),
    );
  }, [fields, search]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (f: DemographicFieldResponse) => {
    setForm({
      id: f.demographicFieldId,
      label: f.label,
      fieldType: f.fieldType,
      placeholder: f.placeholder || '',
      options: [...f.options],
    });
    setFormError('');
    setModalOpen(true);
  };

  // --- Option list editing (DROPDOWN only) ---
  const setOption = (i: number, value: string) =>
    setForm((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? value : o)) }));
  const addOption = () => setForm((p) => ({ ...p, options: [...p.options, ''] }));
  const removeOption = (i: number) =>
    setForm((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }));
  const moveOption = (i: number, dir: -1 | 1) =>
    setForm((p) => {
      const next = [...p.options];
      const j = i + dir;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...p, options: next };
    });

  const submit = async () => {
    const label = form.label.trim();
    if (!label) { setFormError('Label is required'); return; }
    const options = form.options.map((o) => o.trim()).filter(Boolean);
    if (form.fieldType === 'DROPDOWN' && options.length === 0) {
      setFormError('A dropdown needs at least one option');
      return;
    }
    // Payload mirrors the backend's DemographicFieldRequest; options are only
    // read for DROPDOWN fields.
    const payload: DemographicFieldPayload = {
      label,
      fieldType: form.fieldType,
      placeholder: form.placeholder.trim() || null,
      options,
    };
    setSaving(true);
    try {
      if (form.id != null) {
        await demographicsApi.updateDemographicField(form.id, payload);
      } else {
        await demographicsApi.createDemographicField(payload);
      }
      await refresh();
      setModalOpen(false);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError('');
    try {
      await demographicsApi.deleteDemographicField(confirmDelete.demographicFieldId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to delete');
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Questionnaires</span><span>/</span>
          <span className="text-foreground font-medium">Demographic Fields</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary" />
              Demographic Fields
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The registry of custom fields respondents can be asked to fill in.
              Define a field once here, then attach it to questionnaires — order
              and required-ness are chosen per questionnaire, not on the field.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Fields Defined</p><p className="text-2xl font-semibold mt-1">{fields.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Dropdowns</p><p className="text-2xl font-semibold mt-1">{fields.filter((f) => f.fieldType === 'DROPDOWN').length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Free Inputs</p><p className="text-2xl font-semibold mt-1">{fields.filter((f) => f.fieldType !== 'DROPDOWN').length}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search fields or options..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading demographic fields…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ClipboardList className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {fields.length === 0 ? 'No demographic fields yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {fields.length === 0
                ? 'Add fields like "Grade", "School Name" or "City" that assessments can ask respondents to fill.'
                : 'Try a different search term.'}
            </p>
            {fields.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Add your first field
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((f) => {
              const meta = typeMeta(f.fieldType);
              const Icon = meta.icon;
              return (
                <li
                  key={f.demographicFieldId}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => openEdit(f)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.label}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {f.placeholder && <span className="truncate italic">"{f.placeholder}"</span>}
                      {f.fieldType === 'DROPDOWN' && (
                        <span className="truncate shrink-0">
                          {f.options.length} option{f.options.length !== 1 ? 's' : ''}: {f.options.slice(0, 4).join(', ')}{f.options.length > 4 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      mode="icon"
                      onClick={(e) => { e.stopPropagation(); openEdit(f); }}
                      title="Edit field"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      mode="icon"
                      onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(f); }}
                      title="Delete field"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base">{form.id != null ? 'Edit Field' : 'Add Field'}</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Label *</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder='e.g., "Grade", "School Name", "City"'
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FIELD_TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setForm({ ...form, fieldType: t.value })}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                          form.fieldType === t.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Placeholder</label>
                <input
                  value={form.placeholder}
                  onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                  placeholder="Optional hint shown inside the empty input"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {form.fieldType === 'DROPDOWN' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Options *</label>
                    <Button variant="outline" size="sm" onClick={addOption}>
                      <Plus className="h-3 w-3" /> Add option
                    </Button>
                  </div>
                  {form.options.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No options yet — a dropdown needs at least one.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {form.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            value={opt}
                            onChange={(e) => setOption(i, e.target.value)}
                            placeholder={`Option ${i + 1}`}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          />
                          <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move up">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => moveOption(i, 1)} disabled={i === form.options.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move down">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => removeOption(i)} className="text-muted-foreground hover:text-red-500 p-1" title="Remove option">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {form.id != null ? 'Save' : 'Add Field'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete Field
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
              <p className="text-sm">
                Remove <strong>{confirmDelete.label}</strong> from the registry?
                Fields that are attached to a questionnaire or already have
                responses cannot be deleted.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} className="bg-red-600 hover:bg-red-700 text-white">
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
