import { Calendar } from 'lucide-react';
import { useRef } from 'react';

/**
 * Date-of-birth field that can be TYPED or PICKED.
 *
 * The visible control stays a plain text input, auto-formatting digits into
 * DD/MM/YYYY as they are entered — for a birthday, typing is nearly always
 * faster than paging a calendar back thirty years, and this is the field most
 * respondents fill in on a phone. The calendar button beside it opens the
 * browser's own date picker for anyone who would rather point at a date, and
 * writes the result back into the same text.
 *
 * Both routes end at one string in one piece of state, so validation has a
 * single thing to check and the parent form is unchanged either way.
 *
 * The native picker carries `min`/`max`, so the calendar cannot even offer a
 * date the rule would reject. That is a convenience, not the enforcement —
 * typing bypasses it entirely, which is why the form still validates and the
 * server still validates after that.
 *
 * Duplicated verbatim between bodhassess-app and bodhassess-portal (separate
 * packages, no shared module) — the only difference between the two is the
 * separator each app already displays, which is a prop.
 */

const EARLIEST_ISO = '1900-01-01';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
};

export interface DobInputProps {
  /** Display text, e.g. "15/08/1994". Owned by the parent form. */
  value: string;
  onChange: (next: string) => void;
  /** '/' in the portal, '-' on the dashboard — each app's existing format. */
  separator?: string;
  /** Classes for the text input, so each page keeps its own field styling. */
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Digits only, separators inserted as they type. Caps at 8 digits. */
export function formatDobDigits(raw: string, separator: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}${separator}${digits.slice(2)}`;
  return `${digits.slice(0, 2)}${separator}${digits.slice(2, 4)}${separator}${digits.slice(4)}`;
}

/** Display text → ISO for the picker's initial value. '' when incomplete. */
function toIso(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 8) return '';
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4);
  return `${yyyy}-${mm}-${dd}`;
}

export function DobInput({
  value,
  onChange,
  separator = '/',
  className,
  placeholder,
  id,
  disabled,
  'aria-label': ariaLabel,
}: DobInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    // showPicker is the supported way to open a date picker from another
    // control. Where it is missing or refuses (older browsers, or a call the
    // engine does not count as user-initiated), .click() still opens it in
    // most of them — and if nothing opens, the text input beside it is a
    // complete way to answer, so this stays a convenience rather than a
    // dependency.
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
        return;
      }
    } catch {
      /* fall through to click */
    }
    el.click();
  };

  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(formatDobDigits(e.target.value, separator))}
        placeholder={placeholder ?? `DD${separator}MM${separator}YYYY`}
        // 8 digits + 2 separators. The formatter caps it too; this stops the
        // browser accepting keystrokes it would then silently discard.
        maxLength={10}
        disabled={disabled}
        aria-label={ariaLabel}
        // Room for the button, so a typed date never sits under it.
        className={`${className ?? ''} pr-10`}
      />

      {/* The real date control, kept out of sight: it exists to be opened by
          the button and to hand back an ISO value. Not `display:none` and not
          `hidden` — a picker cannot be opened on an element the browser is not
          laying out at all. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={toIso(value)}
        min={EARLIEST_ISO}
        max={todayIso()}
        onChange={(e) => {
          const iso = e.target.value;
          if (!iso) return;
          const [yyyy, mm, dd] = iso.split('-');
          onChange(`${dd}${separator}${mm}${separator}${yyyy}`);
        }}
        className="pointer-events-none absolute right-2 top-1/2 h-0 w-0 -translate-y-1/2 opacity-0"
      />

      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open calendar"
        title="Pick a date"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <Calendar className="h-4 w-4" />
      </button>
    </div>
  );
}
