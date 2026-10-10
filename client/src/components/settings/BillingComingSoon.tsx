// Billing placeholder (PRD: billing is deferred; monetization is a later decision).
// Frontend only and deliberately inert: no prices, plans, forms or buttons that look like
// they do something — just an honest "not yet".
import { CreditCard } from "lucide-react";

export default function BillingComingSoon() {
  return (
    <div className="flex max-w-lg items-start gap-3 rounded-[12px] border border-dashed border-line bg-surface p-4">
      <CreditCard size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
      <div className="min-w-0 text-[14.5px]">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
          Plans and billing
          <span className="rounded-full bg-harvest-tint px-2.5 py-0.5 text-[12px] font-semibold text-forest-deep">Coming soon</span>
        </p>
        <p className="mt-1 text-muted">
          Billing isn&apos;t available yet, so there&apos;s nothing to set up and no payment details to add. Everything in Afritask works for
          this workspace as it is.
        </p>
      </div>
    </div>
  );
}
