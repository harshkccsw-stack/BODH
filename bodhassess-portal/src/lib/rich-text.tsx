import { cn } from '@/lib/utils';

/**
 * Rendering for the prose a practitioner authors in the dashboard: an
 * assessment's terms & conditions, a questionnaire's general instruction, a
 * section's instruction.
 *
 * Deliberately a COPY of the same helpers in the dashboard's
 * components/rich-text-editor.tsx (this is a separate app with its own
 * dependencies — the two share no code). The rules are the ones the backend
 * enforces in RichTextHtml.java, so all three have to move together; keep them
 * in step, as with .rich-text in styles.css.
 */

// Instructions existed as PLAIN TEXT long before the editor did, and nothing
// rewrites those rows — so a value arriving here is either markup or prose.
// One allowed tag anywhere is the tell: the editor always wraps its output in
// blocks, and plain prose has no tags at all.
const HAS_MARKUP = /<\/?(p|br|b|strong|i|em|u|ul|ol|li|h2|h3)\s*\/?>/i;

/**
 * A stored value as renderable markup. Authored HTML passes through; legacy
 * prose is ESCAPED and its newlines become <br>, which both keeps it looking
 * exactly as `whitespace-pre-line` used to render it and makes a stray '<' in
 * someone's wording harmless.
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
 * True when a value carries no visible text — "", "<p><br></p>", "&nbsp;".
 *
 * The gates need this rather than a trim(): an author who empties the editor
 * leaves "<p><br></p>" behind, and a truthy-but-blank instruction would open
 * an empty Instructions step in front of the respondent.
 */
export function isBlankRichText(value: string | null | undefined): boolean {
  if (!value) return true;
  return (
    value
      .replace(/<[^>]*>/g, '')
      .replace(/&[a-zA-Z]+;|&#\d+;/g, ' ')
      .trim().length === 0
  );
}

/**
 * Authored prose, rendered.
 *
 * Safe by construction: the server stores only a small tag subset (p, br,
 * b/strong, i/em, u, ul/ol/li, h2, h3 — never attributes) and rejects
 * anything else, and toRichHtml escapes anything that is not already markup,
 * so no attributes and no scripts can reach this string.
 */
export function RichText({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn('rich-text', className)}
      dangerouslySetInnerHTML={{ __html: toRichHtml(value) }}
    />
  );
}
