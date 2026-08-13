import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { cn } from '@/lib/utils';

// A small contentEditable editor for the one place that needs formatted prose
// (an assessment's terms & conditions). No editor library: the output has to
// stay inside the tag subset the backend accepts — p, br, b/strong, i/em, u,
// ul/ol/li, h2, h3, none of them carrying attributes — and a full editor
// would emit spans, styles and classes that the API rejects.
//
// execCommand is deprecated but implemented in every browser, and it is the
// only API that edits a selection in place. Two habits keep its output clean:
// styleWithCSS is forced off (so bold is <b>, not <span style>), and pastes
// are flattened to plain text (so Word markup never reaches the field).

const ALLOWED_BLOCKS = [
  { label: 'Normal text', tag: '<p>' },
  { label: 'Medium heading', tag: '<h3>' },
  { label: 'Large heading', tag: '<h2>' },
];

/** True when the markup carries no visible text — mirrors AssessmentTerms.isBlank. */
export function isBlankHtml(html: string): boolean {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-zA-Z]+;|&#\d+;/g, ' ')
    .trim().length === 0;
}

export function RichTextEditor({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Write incoming HTML in only when it differs from what is already on
  // screen. Assigning innerHTML on every keystroke would drop the caret to
  // the start of the field on each character typed.
  useEffect(() => {
    const el = ref.current;
    if (el && value !== el.innerHTML) el.innerHTML = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  };

  const exec = (command: string, argument?: string) => {
    ref.current?.focus();
    // Ask for tags rather than inline styles. Firefox needs the argument as
    // the string 'false'; Chrome accepts either.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false, argument);
    emit();
  };

  const buttonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors';

  return (
    <div className={cn('rounded-lg border border-border bg-background overflow-hidden', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/40 px-2 py-1.5">
        {/* preventDefault on mousedown, or clicking a button blurs the
            editor and the selection execCommand needs disappears. */}
        <button type="button" title="Bold" aria-label="Bold" className={buttonClass}
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" title="Italic" aria-label="Italic" className={buttonClass}
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" title="Underline" aria-label="Underline" className={buttonClass}
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>
          <Underline className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" title="Bulleted list" aria-label="Bulleted list" className={buttonClass}
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>
          <List className="h-4 w-4" />
        </button>
        <button type="button" title="Numbered list" aria-label="Numbered list" className={buttonClass}
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}>
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <select
          aria-label="Text size"
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (!e.target.value) return;
            exec('formatBlock', e.target.value);
            e.target.value = ''; // a label, not a state — the caret decides the real block
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
        >
          <option value="" disabled>Text size…</option>
          {ALLOWED_BLOCKS.map((b) => (
            <option key={b.tag} value={b.tag}>{b.label}</option>
          ))}
        </select>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Flatten pasted content: Word and web pages carry spans, styles
          // and classes the API refuses, and the author would only see the
          // rejection at save time.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        className="rte-content min-h-[12rem] max-h-[28rem] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
