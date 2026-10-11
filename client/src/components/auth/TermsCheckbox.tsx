// "I agree to the Terms of Service and Privacy Policy" — used at signup and on the
// accept-terms step. The links open in a new tab so a half-filled form isn't lost.
import Link from "next/link";
import { cx } from "@/lib/cx";

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
}

const linkClasses = "font-semibold text-forest underline underline-offset-4";

export default function TermsCheckbox({ checked, onChange, error }: TermsCheckboxProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={cx("flex cursor-pointer items-start gap-3 rounded-[10px] border px-4 py-3 text-[14.5px] leading-relaxed text-ink", error ? "border-brick/50 bg-brick-tint" : "border-line")}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={!!error}
          aria-describedby={error ? "terms-error" : undefined}
          className="mt-1 size-[18px] shrink-0 accent-[var(--forest)]"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className={linkClasses}>
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className={linkClasses}>
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {error && (
        <p id="terms-error" className="text-[13.5px] text-brick">
          {error}
        </p>
      )}
    </div>
  );
}
