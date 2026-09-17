import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Copy,
  FileText,
  Loader2,
  Lock,
  Send,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  IMPLEMENTED_BINDERS,
  reportTemplatesApi,
  STARTER_HTML,
  type BinderType,
  type ReportTemplateResponse,
  type TagBinding,
} from './reportTemplatesApi';

/**
 * Writing a report template: the HTML, its ${placeholder} checklist, preview
 * and publish — as a modal that can be opened from anywhere.
 *
 * Extracted from the Templates page so **Report Setup can create and publish a
 * template without leaving the flow**. A person setting up an assessment
 * discovers they need a layout at the moment they reach the Layout step, and
 * sending them to another page to make one — then back, to find it — was the
 * one remaining forced switch in a flow built to remove them.
 *
 * One implementation, two callers, on purpose: a second editor would drift,
 * and the rules it enforces (published is frozen, a new version is a new row,
 * a shape is answered per assessment) are exactly the rules nobody should have
 * to learn twice.
 */

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

const INPUT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow';

/** What each binder type means, in the author's language. */
export const BINDER_LABEL: Record<BinderType, string> = {
  UNBOUND: 'Not answered yet',
  CORE: 'A respondent detail',
  LITERAL: 'Fixed text',
  COMPUTED: 'A value, from a rule chosen per assessment',
  VALUE: 'A value, from a rule chosen per assessment',
  NARRATIVE: 'A paragraph, written by AI under instructions chosen per assessment',
  TABLE: 'A table of scores (needs the scoring engine)',
  CHART: 'A chart (needs the scoring engine)',
};

/**
 * Name it first, then open the editor on the real row.
 *
 * Creating first and letting people rename afterwards is what produced a
 * library of "Untitled report 3" — the name is the only thing anyone
 * identifies a template by, so it is asked for once, at the moment the thing
 * is brought into being.
 */
export function NewTemplateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: ReportTemplateResponse) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the template a name');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onCreated(await reportTemplatesApi.create({
        name: trimmed,
        description: description.trim() || null,
        html: STARTER_HTML,
      }));
    } catch (e: any) {
      // A duplicate name comes back 409 with a usable message. Shown HERE, on
      // the field that caused it, rather than behind the editor that would
      // otherwise have opened.
      setError(errorText(e, 'Could not create the template'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold">New template</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The name is how everyone finds this template afterwards. You can change it
          later while it is still a draft.
        </p>

        <label className="mt-4 block">
          <span className="text-sm font-medium">Name</span>
          <input
            className={cn(INPUT_CLASS, 'mt-1')}
            value={name}
            autoFocus
            placeholder="Counselling summary"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
            aria-label="New template name"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-sm font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <input
            className={cn(INPUT_CLASS, 'mt-1')}
            value={description}
            placeholder="What this report is for"
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create(); }}
            aria-label="New template description"
          />
        </label>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The editor itself. Loads the template by id, so a caller holding only a
 * listing row (whose `html` is null) can open it.
 *
 * @param onChanged told after every write with the saved template, so a
 *        caller's list stays right without refetching everything.
 * @param onClosed  told when the editor closes, with the last saved template
 *        if there was one — Report Setup uses it to attach a newly published
 *        template to the assessment.
 */
export function TemplateEditor({
  templateId,
  onClosed,
  onChanged,
}: {
  templateId: number;
  onClosed: (last: ReportTemplateResponse | null) => void;
  onChanged?: (saved: ReportTemplateResponse) => void;
}) {
  const [open, setOpen] = useState<ReportTemplateResponse | null>(null);
  const [coreFields, setCoreFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const apply = useCallback((full: ReportTemplateResponse) => {
    setOpen(full);
    setHtml(full.html ?? '');
    setName(full.name);
    setDescription(full.description ?? '');
    onChanged?.(full);
  }, [onChanged]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([
      reportTemplatesApi.getById(templateId),
      reportTemplatesApi.coreFields().catch(() => ({} as Record<string, string>)),
    ])
      .then(([full, fields]) => {
        if (!live) return;
        apply(full);
        setCoreFields(fields);
      })
      .catch((e) => { if (live) setError(errorText(e, 'Could not open that template')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // apply is stable enough for this: re-running on a new id is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Blob URLs leak until revoked, and a preview is regenerated on every save.
  useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const readOnly = open?.status !== 'DRAFT';

  /**
   * Whether the editor holds anything the server has not been told about.
   *
   * The name and description live in the header while the only save button
   * used to sit above the HTML box, so typing a name and closing threw it away
   * without a word. This is what makes that impossible.
   */
  const dirty = !!open && !readOnly && (
    name.trim() !== open.name
    || description.trim() !== (open.description ?? '')
    || html !== (open.html ?? '')
  );

  /**
   * A pending rename on a template that cannot otherwise be edited. Kept apart
   * from `dirty`: that guards unsaved CONTENT and drives the close
   * confirmation, and a published template has none to lose.
   */
  const renameDirty = !!open && readOnly && name.trim() !== '' && name.trim() !== open.name;

  /**
   * Saving re-parses the HTML server-side; the checklist comes back changed.
   * Reports whether it worked, because "save and close" must not close over a
   * failed save — a duplicate name is refused with a 409, and swallowing that
   * would discard the very edit the person was trying to keep.
   */
  const save = async (): Promise<boolean> => {
    if (!open) return false;
    setError(null);
    setSaving(true);
    try {
      apply(await reportTemplatesApi.update(open.reportTemplateId, {
        name: name.trim(),
        description: description.trim() || null,
        html,
      }));
      return true;
    } catch (e: any) {
      setError(errorText(e, 'Could not save the template'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const act = async (what: string, call: () => Promise<ReportTemplateResponse>) => {
    setError(null);
    setSaving(true);
    try {
      apply(await call());
    } catch (e: any) {
      setError(errorText(e, `Could not ${what} this template`));
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    if (!open) return;
    setError(null);
    setPreviewing(true);
    try {
      const url = await reportTemplatesApi.previewPdfUrl(open.reportTemplateId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e: any) {
      setError(errorText(e, 'Could not render a preview'));
    } finally {
      setPreviewing(false);
    }
  };

  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClosed(open);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-6 w-full max-w-6xl rounded-xl bg-background shadow-xl">
        {loading || !open ? (
          <div className="flex items-center justify-between gap-3 p-8 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening the template…
            </span>
            {error && <span className="text-red-700">{error}</span>}
            <button
              type="button"
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              onClick={() => onClosed(null)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div className="min-w-0 flex-1">
                {/* Editable even when published, unlike everything else here.
                    Publishing freezes the CONTENT a delivered report was built
                    from; the name is a label on the shelf, and a template stuck
                    as "Untitled report 2" leaves every report it produces
                    citing a placeholder. */}
                <input
                  className={cn(INPUT_CLASS, 'h-10 text-base font-medium')}
                  value={name}
                  disabled={saving}
                  placeholder="Template name"
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Template name"
                />
                <input
                  className={cn(INPUT_CLASS, 'mt-2')}
                  placeholder="Short description (optional)"
                  value={description}
                  disabled={readOnly}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-label="Template description"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {renameDirty && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={saving}
                    onClick={() => void act('rename',
                      () => reportTemplatesApi.rename(open.reportTemplateId, name.trim()))}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Rename
                  </Button>
                )}
                {!readOnly && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={save}
                    disabled={saving || !dirty || !name.trim()}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {dirty ? 'Save changes' : 'Saved'}
                  </Button>
                )}
                <button
                  type="button"
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                  onClick={requestClose}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {readOnly && (
              <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">
                  This template is {open.status.toLowerCase()} and cannot be edited —
                  reports already produced from it must keep meaning what they said.
                  {open.status === 'PUBLISHED'
                    && ' A new version is a separate template that starts as a copy of this one, answers included.'}
                </span>
                {open.status === 'PUBLISHED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void act('open a new version of',
                      () => reportTemplatesApi.newVersion(open.reportTemplateId))}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    Edit as new version
                  </Button>
                )}
              </div>
            )}

            {error && (
              <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            {open.lint.length > 0 && (
              <div className="mx-6 mt-4 space-y-2">
                {open.lint.map((f) => (
                  <div
                    key={f.rule}
                    className={cn(
                      'flex gap-2 rounded-lg border px-4 py-3 text-sm',
                      f.severity === 'ERROR'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400'
                        : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
                    )}
                  >
                    {f.severity === 'ERROR'
                      ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span>{f.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Template HTML</p>
                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={save} disabled={saving || !name.trim()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save &amp; re-read placeholders
                    </Button>
                  )}
                </div>
                <textarea
                  className="h-[420px] w-full rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                  value={html}
                  disabled={readOnly}
                  onChange={(e) => setHtml(e.target.value)}
                  spellCheck={false}
                  aria-label="Template HTML"
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Saving re-reads the HTML: new placeholders appear in the checklist,
                  removed ones disappear, and answers you already gave are kept.
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Placeholders — {open.boundCount} of {open.tagCount} answered
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={preview} disabled={previewing}>
                      {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Preview
                    </Button>
                    {open.status === 'DRAFT' && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={saving}
                        onClick={() => void act('publish',
                          () => reportTemplatesApi.publish(open.reportTemplateId))}
                      >
                        <Send className="h-4 w-4" /> Publish
                      </Button>
                    )}
                  </div>
                </div>

                <div className="max-h-[420px] divide-y overflow-y-auto rounded-md border">
                  {open.bindings.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      No placeholders in this template yet. Add{' '}
                      <code className="text-xs">{'${something}'}</code> to the HTML and save.
                    </p>
                  ) : (
                    open.bindings.map((b) => (
                      <TagRow
                        key={b.tag}
                        binding={b}
                        coreFields={coreFields}
                        readOnly={readOnly}
                        onSave={(payload) => void act('answer that placeholder on',
                          () => reportTemplatesApi.bindTag(open.reportTemplateId, b.tag, payload))}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {previewUrl && (
              <div className="px-6 pb-6">
                <p className="mb-2 text-sm font-medium">Preview (sample respondent)</p>
                <iframe
                  title="Report preview"
                  src={previewUrl}
                  className="h-[560px] w-full rounded-md border bg-white"
                />
              </div>
            )}
          </>
        )}
      </div>

      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Close without saving?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The name, description and HTML you changed have not been saved. Closing
              now discards them.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button>
              <Button
                variant="destructive"
                onClick={() => { setConfirmClose(false); onClosed(open); }}
              >
                Discard changes
              </Button>
              <Button
                variant="primary"
                disabled={saving || !name.trim()}
                onClick={async () => {
                  // Only close if it actually saved — a refused name must keep
                  // the editor open, with the error visible behind this dialog.
                  const saved = await save();
                  setConfirmClose(false);
                  if (saved) onClosed(open);
                }}
              >
                Save and close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One row of the checklist: a placeholder and the answer to "what fills this?".
 *
 * The template answers only what it can answer for EVERY assessment: a
 * respondent detail, fixed text, or the SHAPE of something computed — a value
 * or a paragraph. Which rule prints a value, and what a paragraph should say,
 * is a per-assessment question and is answered on Report Setup, so one
 * published template serves any number of assessments. COMPUTED is an older
 * spelling of VALUE and is kept readable, not offered.
 */
function TagRow({
  binding,
  coreFields,
  readOnly,
  onSave,
}: {
  binding: TagBinding;
  coreFields: Record<string, string>;
  readOnly: boolean;
  onSave: (payload: {
    binderType: BinderType;
    coreField?: string | null;
    literalText?: string | null;
    fallbackText?: string | null;
  }) => void;
}) {
  const [type, setType] = useState<BinderType>(binding.binderType);
  const [coreField, setCoreField] = useState(binding.coreField ?? '');
  const [literalText, setLiteralText] = useState(binding.literalText ?? '');
  const [fallbackText, setFallbackText] = useState(binding.fallbackText ?? '');

  // The server is the source of truth — a save returns the whole template.
  useEffect(() => {
    setType(binding.binderType);
    setCoreField(binding.coreField ?? '');
    setLiteralText(binding.literalText ?? '');
    setFallbackText(binding.fallbackText ?? '');
  }, [binding]);

  const isShape = type === 'VALUE' || type === 'COMPUTED' || type === 'NARRATIVE';

  const dirty =
    type !== binding.binderType ||
    coreField !== (binding.coreField ?? '') ||
    literalText !== (binding.literalText ?? '') ||
    fallbackText !== (binding.fallbackText ?? '');

  const canSave =
    dirty &&
    (type === 'CORE'
      ? coreField !== ''
      : type === 'LITERAL'
        ? literalText.trim() !== ''
        // A shape is the whole answer on its own.
        : isShape);

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        {binding.bound
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {'${' + binding.tag + '}'}
        </code>
        {!binding.bound && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">needs an answer</span>
        )}
      </div>

      {!readOnly && (
        <div className="mt-2 space-y-2 pl-6">
          <select
            className={INPUT_CLASS}
            value={type}
            onChange={(e) => setType(e.target.value as BinderType)}
            aria-label={`What fills ${binding.tag}`}
          >
            <option value="UNBOUND" disabled>{BINDER_LABEL.UNBOUND}</option>
            {IMPLEMENTED_BINDERS.filter((b) => b !== 'COMPUTED' || type === 'COMPUTED').map((b) => (
              <option key={b} value={b}>{BINDER_LABEL[b]}</option>
            ))}
            {(['TABLE', 'CHART'] as BinderType[]).map((b) => (
              <option key={b} value={b} disabled>{BINDER_LABEL[b]}</option>
            ))}
          </select>

          {type === 'CORE' && (
            <select
              className={INPUT_CLASS}
              value={coreField}
              onChange={(e) => setCoreField(e.target.value)}
              aria-label="Which respondent detail"
            >
              <option value="">Choose a detail…</option>
              {Object.entries(coreFields).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}

          {(type === 'VALUE' || type === 'COMPUTED') && (
            <p className="text-xs text-muted-foreground">
              A number or a term computed by a rule. <b>Which</b> rule is chosen per
              assessment, on Report Setup → Layout — so this template can serve any
              assessment whose rules produce such a value.
            </p>
          )}

          {type === 'NARRATIVE' && (
            <div className="space-y-1 rounded-md border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
              <p>
                A model writes this paragraph from the values the rules already produced. It
                never scores anything — every number on the report still comes from a rule.
              </p>
              <p>
                It is sent the rule names and this respondent’s scores, and nothing that
                says who they are: no name, email, or id. What it should say is written per
                assessment, on Report Setup → Layout.
              </p>
            </div>
          )}

          {isShape && (
            <input
              className={INPUT_CLASS}
              placeholder="If nothing can be printed here, print… (optional)"
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              aria-label="Fallback text"
            />
          )}

          {type === 'LITERAL' && (
            <textarea
              className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
              rows={2}
              placeholder="The text this placeholder should print"
              value={literalText}
              onChange={(e) => setLiteralText(e.target.value)}
              aria-label="Fixed text"
            />
          )}

          {dirty && (
            <Button
              size="sm"
              variant="primary"
              disabled={!canSave}
              onClick={() =>
                onSave({
                  binderType: type,
                  coreField: type === 'CORE' ? coreField : null,
                  literalText: type === 'LITERAL' ? literalText : null,
                  fallbackText: isShape ? (fallbackText.trim() || null) : null,
                })
              }
            >
              Save answer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
