// A titled settings block: what it is on the left, the controls on the right (stacked on phones).
import type { ReactNode } from "react";

export default function SettingsSection({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  const headingId = `${id ?? title.toLowerCase().replace(/\W+/g, "-")}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="grid scroll-mt-24 grid-cols-1 gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 id={headingId} className="text-[17px] font-semibold text-ink">
          {title}
        </h2>
        {description && <div className="mt-1 text-[14px] leading-relaxed text-muted">{description}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
