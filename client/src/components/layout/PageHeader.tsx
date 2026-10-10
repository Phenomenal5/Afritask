// The top of every workspace page: where you are (eyebrow + title), what this place is
// for (description), and the main things you can do here (actions).
import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export default function PageHeader({ eyebrow, title, description, actions, children }: PageHeaderProps) {
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{eyebrow}</div>}
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[32px]">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
