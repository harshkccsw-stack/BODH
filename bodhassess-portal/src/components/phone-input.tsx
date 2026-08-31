import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import {
  DIAL_CODES,
  findDialCode,
  flagEmoji,
  onlyPhoneDigits,
} from '@/lib/phone';

/**
 * Country code + mobile number as ONE control. Same component as the
 * dashboard's (bodhassess-app/src/components/phone-input.tsx) — separate
 * packages, no shared module, so change both together. They differ only in how
 * the box sizes itself, each matching the fields around it.
 *
 * Two inputs sitting in one bordered box, not two boxes: they are halves of a
 * single answer, and the box lights up as a whole on focus so it reads as one
 * field. The left segment shows a flag and the dial code — short enough that
 * the number, which is the part being typed, keeps nearly all the width.
 *
 * The native <select> is transparent and laid over that segment rather than
 * being the visible control. A <select> renders its selected option's full
 * text, so showing "+91" closed while offering "🇮🇳 +91 India" open is only
 * possible by separating the two. The dropdown itself stays native, which is
 * what makes it a proper wheel on a phone.
 */

/** Mirrors the INPUT class the rest of the registration form uses, so this
 *  control sits at the same height and weight as the fields around it. */
const BOX =
  'flex h-11 w-full items-stretch rounded-lg border border-border bg-background text-sm ' +
  'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:h-10';

export interface PhoneInputProps {
  /** Dial code with the '+', e.g. "+91". */
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  /** National number, digits only. */
  phone: string;
  onPhoneChange: (phone: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Tooltip for the number input, where a page has no room for a hint line. */
  title?: string;
}

export function PhoneInput({
  countryCode,
  onCountryCodeChange,
  phone,
  onPhoneChange,
  placeholder = 'Mobile number',
  disabled,
  title,
}: PhoneInputProps) {
  /**
   * Which ENTRY is picked, not just which code. Several countries share a code
   * (+1, +7), so a code alone cannot say whose flag to draw — looking it up
   * would show Canada to someone who picked the United States. Seeded from the
   * code for a value that arrived from the server, then owned by the select.
   */
  const [iso, setIso] = useState(() => findDialCode(countryCode)?.iso ?? '');

  const selected = DIAL_CODES.find((d) => d.iso === iso && d.code === countryCode);

  return (
    <div className={BOX}>
      <div className="relative flex shrink-0 items-center gap-1.5 pl-3 pr-2">
        {selected ? (
          <>
            {/* aria-hidden: the flag is decoration — the dial code beside it is
                what a screen reader should read, and the select carries the
                real accessible name. */}
            <span aria-hidden="true" className="text-base leading-none">
              {flagEmoji(selected.iso)}
            </span>
            <span className="tabular-nums">{selected.code}</span>
          </>
        ) : (
          // Only reachable for a stored code this list does not know, or one
          // that could not be recovered from an old free-text number.
          <span className="text-muted-foreground">Code</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        <select
          value={iso}
          onChange={(e) => {
            const next = DIAL_CODES.find((d) => d.iso === e.target.value);
            if (!next) return;
            setIso(next.iso);
            onCountryCodeChange(next.code);
          }}
          disabled={disabled}
          aria-label="Country code"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        >
          {!selected && <option value="">Select a country code</option>}
          {DIAL_CODES.map((d) => (
            <option key={d.iso} value={d.iso}>
              {flagEmoji(d.iso)} {d.code} {d.country}
            </option>
          ))}
        </select>
      </div>

      {/* Full-height hairline rather than a bordered neighbour, so the two
          halves stay one box. my-2 keeps it clear of the rounded corners. */}
      <div className="my-2 w-px shrink-0 bg-border" />

      <input
        type="tel"
        inputMode="numeric"
        value={phone}
        // Stripped as they type, so the field can never hold something the
        // rule rejects — pasting "+91 98765 43210" leaves visible digits to
        // fix rather than failing silently at submit.
        onChange={(e) => onPhoneChange(onlyPhoneDigits(e.target.value))}
        placeholder={placeholder}
        autoComplete="tel-national"
        maxLength={14}
        disabled={disabled}
        title={title}
        className="w-full min-w-0 rounded-r-lg bg-transparent px-3 outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
