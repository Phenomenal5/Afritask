"use client";

// WorkspaceSwitcher: always shows WHICH workspace you're in and your role there, and
// moves you between them. Switching changes what every screen shows; the server still
// checks membership on every request.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Settings2 } from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { ROLE_LABELS } from "@/utils/roles";
import { cx } from "@/lib/cx";
import type { WorkspaceSummary } from "@/types/models";

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || "W";

export default function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspaces();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!activeWorkspace) return null;
  const current = activeWorkspace as WorkspaceSummary;

  const handleSwitch = (workspaceId: string) => {
    setOpen(false);
    onNavigate?.();
    if (workspaceId === current.id) return;
    switchWorkspace(workspaceId);
    // A project page belongs to the old workspace — land on the new one's project list.
    // Other pages simply reload for the new workspace (and an open task closes).
    if (pathname.startsWith("/projects/")) router.push("/projects");
    else router.push(pathname);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Workspace: ${current.name}, your role ${ROLE_LABELS[current.role]}. Switch workspace`}
        className="flex w-full min-h-14 cursor-pointer items-center gap-3 rounded-[12px] border border-white/10 bg-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.11]"
      >
        <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-harvest font-display text-lg font-semibold text-forest-deep">
          {initialOf(current.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium uppercase tracking-[0.08em] text-sidebar-muted">Workspace</span>
          <span className="block truncate text-[15px] font-semibold text-sidebar-text">{current.name}</span>
        </span>
        <ChevronsUpDown size={18} aria-hidden="true" className="shrink-0 text-sidebar-muted" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-40 mt-2 overflow-hidden rounded-[12px] border border-line bg-surface py-1.5 text-ink shadow-lg animate-rise-in">
          <p className="px-3.5 pb-1 pt-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Your workspaces</p>
          <ul>
            {workspaces.map((workspace: WorkspaceSummary) => {
              const isCurrent = workspace.id === current.id;
              return (
                <li key={workspace.id}>
                  <button
                    type="button"
                    onClick={() => handleSwitch(workspace.id)}
                    aria-current={isCurrent ? "true" : undefined}
                    className={cx(
                      "flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-[15px] hover:bg-surface-muted",
                      isCurrent && "font-semibold"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                    <span className="shrink-0 text-[13px] font-normal text-muted">{ROLE_LABELS[workspace.role]}</span>
                    <Check size={16} aria-hidden="true" className={cx("shrink-0 text-forest", !isCurrent && "invisible")} />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1.5 border-t border-line-soft pt-1.5">
            <Link
              href="/settings/workspace"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex min-h-11 items-center gap-2.5 px-3.5 text-[15px] hover:bg-surface-muted"
            >
              <Settings2 size={17} aria-hidden="true" className="text-muted" />
              Workspace settings
            </Link>
            <Link
              href="/workspace/new"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className="flex min-h-11 items-center gap-2.5 px-3.5 text-[15px] font-medium text-forest hover:bg-surface-muted"
            >
              <Plus size={17} aria-hidden="true" />
              Create another workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
