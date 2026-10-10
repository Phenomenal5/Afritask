"use client";

// Phones and tablets: a compact top bar (menu, where you are, alerts, new task) and the
// full sidebar in a slide-in drawer.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Bell, Menu, Plus, X } from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useMyWork } from "@/context/MyWorkContext";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { LogoMark } from "@/components/ui/Logo";
import { SidebarContent } from "./Sidebar";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { activeWorkspace } = useWorkspaces();
  const { attentionCount } = useMyWork();
  const { openComposer } = useTaskPanels();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehavior(open, panelRef, () => setOpen(false));

  // Navigating closes the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-1 border-b border-line bg-surface/95 px-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[10px] text-ink hover:bg-surface-muted"
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-1">
          <LogoMark size={26} />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Workspace</span>
            <span className="block truncate text-[15px] font-semibold leading-tight text-ink">{activeWorkspace?.name}</span>
          </span>
        </Link>
        <Link
          href="/notifications"
          aria-label={attentionCount ? `Notifications, ${attentionCount} need attention` : "Notifications"}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-ink hover:bg-surface-muted"
        >
          <Bell size={21} aria-hidden="true" />
          {attentionCount > 0 && (
            <span aria-hidden="true" className="absolute right-1.5 top-1.5 min-w-5 rounded-full bg-brick px-1 text-center text-[11px] font-bold leading-5 text-white">
              {attentionCount}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => openComposer()}
          aria-label="New task"
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[10px] bg-forest text-on-forest hover:bg-forest-deep"
        >
          <Plus size={22} aria-hidden="true" />
        </button>
      </header>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden">
            <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-forest-deep/50" onClick={() => setOpen(false)} />
            <div
              ref={panelRef}
              data-modal-panel
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              tabIndex={-1}
              className="relative h-full w-[min(320px,88vw)] animate-slide-in-left bg-sidebar shadow-lg outline-none"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="absolute right-2 top-3 z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-[10px] text-sidebar-text hover:bg-sidebar-hover"
              >
                <X size={22} aria-hidden="true" />
              </button>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
