import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { cn } from '@/lib/utils';

// A small contentEditable editor for the places that need formatted prose: an
// assessment's terms & conditions, a questionnaire's general instruction, a
// section's instruction. No editor library: the output has to stay inside the
// tag subset the backend accepts — p, br, b/strong, i/em, u,
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

/** True when the markup carries no visible text — mirrors RichTextHtml.isBlank. */
export function isBlankHtml(html: string): boolean {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-zA-Z]+;|&#\d+;/g, ' ')
    .trim().length === 0;
}

// Questionnaire and section instructions existed as PLAIN TEXT long before
// this editor did, and nothing rewrites those rows — so every reader has to
// cope with both shapes. One allowed tag anywhere is the tell: the editor
// always wraps its output in blocks, and plain prose has no tags at all.
const HAS_MARKUP = /<\/?(p|br|b|strong|i|em|u|ul|ol|li|h2|h3)\s*\/?>/i;

/**
 * A stored value as renderable markup. Authored HTML passes through; legacy
 * prose is ESCAPED and its newlines become <br>, which both keeps it looking
 * exactly as `whitespace-pre-wrap` used to render it and makes a stray '<' in
 * someone's wording harmless. A value only turns into HTML in the database
 * when an author edits that field and saves.
 */
export function toRichHtml(value: string | null | undefined): string {
  if (!value) return '';
  if (HAS_MARKUP.test(value)) return value;
  return (
    '<p>' +
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\r\n|\r|\n/g, '<br>') +
    '</p>'
  );
}

/**
 * Read-only counterpart of the editor — the same `.rte-content` styling, so a
 * preview cannot drift from what the author saw while typing.
 *
 * Safe by construction: the server stores only the tag subset above and
 * rejects anything else, and toRichHtml escapes anything that is not already
 * markup, so no attributes and no scripts can reach this string.
 */
export function RichTextView({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn('rte-content', className)}
      dangerouslySetInnerHTML={{ __html: toRichHtml(value) }}
    />
  );
}

// Tag names as the DOM reports them. The API's allowlist, in the one form the
// normalizer below can compare against.
const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'H2', 'H3']);

// Elements that hold a line of prose and can therefore become a <p>. Anything
// else unknown (span, font, a) is unwrapped instead, keeping its text.
const REWRITABLE_BLOCKS = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'PRE', 'ADDRESS', 'FIGURE', 'FIGCAPTION',
  'H1', 'H4', 'H5', 'H6', 'TABLE', 'TBODY', 'TR', 'TD', 'TH',
]);

// A <p> may not contain another <p>, so a block sitting inside one of these
// gets unwrapped rather than renamed.
const TEXT_BLOCKS = new Set(['P', 'LI', 'H2', 'H3']);

function normalizeChildren(parent: Element) {
  // Snapshot: the child list mutates as elements are renamed and unwrapped.
  for (const el of Array.from(parent.children)) {
    normalizeChildren(el); // depth-first, so anything unwrapped is already clean
    const tag = el.tagName;
    // A heading or paragraph with nothing in it at all is parser debris —
    // re-parsing "<p>a<div>b</div></p>" leaves one behind — and it renders as
    // a stray blank line. A deliberate blank line is "<p><br></p>", which has
    // a child and survives.
    if (TEXT_BLOCKS.has(tag) && tag !== 'LI' && el.childNodes.length === 0) {
      el.remove();
      continue;
    }
    if (ALLOWED_TAGS.has(tag)) {
      // Allowed spelling, but the API refuses every attribute — and this is
      // where pasted or browser-added class/style/dir attributes turn up.
      while (el.attributes.length > 0) {
        el.removeAttribute(el.attributes[0].name);
      }
      continue;
    }
    if (REWRITABLE_BLOCKS.has(tag) && !TEXT_BLOCKS.has(parent.tagName)) {
      const p = document.createElement('p');
      while (el.firstChild) p.appendChild(el.firstChild);
      el.replaceWith(p);
    } else {
      el.replaceWith(...Array.from(el.childNodes));
    }
  }
}

/**
 * contentEditable output, reduced to the tag subset the API accepts.
 *
 * Chrome wraps each line of an EMPTY editor in a <div> rather than a <p> —
 * defaultParagraphSeparator below asks it not to, but Safari ignores that and
 * a browser update could change any of it, so nothing reaches the API without
 * passing through here. Blocks that hold a line of prose become <p>; anything
 * else is unwrapped, keeping its text; attributes are stripped.
 *
 * Plain text passes through untouched — it parses to a text node with no
 * elements at all, which is what keeps a legacy instruction legacy until its
 * author actually formats something.
 */
export function normalizeEditorHtml(html: string): string {
  if (!html || html.indexOf('<') < 0) return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  normalizeChildren(root);
  return root.innerHTML;
}

/** Plain text of a stored value, for list rows and summaries too tight for markup. */
export function toPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return toRichHtml(value)
    .replace(/<\/(p|h2|h3|li)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function RichTextEditor({
  value,
  onChange,
  className,
  contentClassName,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  /** Overrides the height of the typing area — instruction boxes are shorter than terms. */
  contentClassName?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Write incoming HTML in only when it differs from what is already on
  // screen. Assigning innerHTML on every keystroke would drop the caret to
  // the start of the field on each character typed.
  //
  // Compare the CONVERTED value, not the raw one: a legacy plain-text
  // instruction is never equal to the markup shown for it, so comparing the
  // raw string would rewrite innerHTML on every render and make the field
  // impossible to type in.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const incoming = toRichHtml(value);
    if (incoming !== el.innerHTML) el.innerHTML = incoming;
  }, [value]);

  // Ask the browser for <p> line breaks instead of <div>. Chrome's default is
  // <div> whenever the field starts empty — which every instruction box does —
  // and a <div> is not on the API's allowlist, so saving 400ed. Set once here
  // and again in exec(), since the setting is per-document and another editor
  // on the page could have changed it.
  useEffect(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }, []);

  const emit = () => {
    const el = ref.current;
    if (el) onChange(el.innerHTML);
  };

  // Rewrite what the browser produced into the allowed subset. Deliberately
  // NOT done on every keystroke: replacing innerHTML mid-typing drops the
  // caret to the start of the field. Blur is early enough, because clicking
  // Save blurs the editor before the click lands — and the save paths
  // normalize once more, so a save can never carry raw browser markup.
  const normalize = () => {
    const el = ref.current;
    if (!el) return;
    const clean = normalizeEditorHtml(el.innerHTML);
    if (clean !== el.innerHTML) el.innerHTML = clean;
    onChange(clean);
  };

  const exec = (command: string, argument?: string) => {
    ref.current?.focus();
    // Ask for tags rather than inline styles. Firefox needs the argument as
    // the string 'false'; Chrome accepts either.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('defaultParagraphSeparator', false, 'p');
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
        onBlur={normalize}
        onPaste={(e) => {
          // Flatten pasted content: Word and web pages carry spans, styles
          // and classes the API refuses, and the author would only see the
          // rejection at save time.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        className={cn(
          'rte-content min-h-[12rem] max-h-[28rem] overflow-y-auto px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/20',
          contentClassName,
        )}
      />
    </div>
  );
}
