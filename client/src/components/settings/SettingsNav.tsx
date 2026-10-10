"use client";

// Separates what's YOURS (profile, timezone, password — the same in every workspace) from
// what belongs to THIS workspace (name, labels, history).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, UserRound } from "lucide-react";
import { cx } from "@/lib/cx";

const TABS = [
  { href: "/settings", label: "Your account", detail: "Applies everywhere", icon: UserRound },
  { href: "/settings/workspace", label: "This workspace", detail: "Shared with members", icon: Building2 },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="mb-8 grid grid-cols-2 gap-2 sm:inline-grid sm:w-auto">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-[12px] border px-4 py-3 transition-colors",
              active ? "border-forest bg-lime/50" : "border-line bg-surface hover:border-forest/40"
            )}
          >
            <Icon size={19} aria-hidden="true" className="shrink-0 text-forest" />
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink">{tab.label}</span>
              <span className="block text-[13px] text-muted">{tab.detail}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
