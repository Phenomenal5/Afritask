"use client";

// The forest-green workspace sidebar: identity, workspace switcher, the one primary action
// (New task), navigation, project shortcuts, contextual help and the account menu.
// The same content renders in the mobile drawer (MobileNav).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronUp, Folder, Lightbulb, LogOut, Plus, Shield, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyWork } from "@/context/MyWorkContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { PAGE_HELP, WORKSPACE_NAV, isNavItemActive } from "@/constants/navigation";
import { cx } from "@/lib/cx";
import Logo from "@/components/ui/Logo";
import Avatar from "@/components/ui/Avatar";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import ThemeToggle from "./ThemeToggle";

const PROJECT_SHORTCUT_LIMIT = 6;

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { unreadNotifications } = useMyWork();
  const { projects, status: resourcesStatus } = useWorkspaceResources();
  const { openComposer } = useTaskPanels();

  const helpKey = Object.keys(PAGE_HELP).find((key) => pathname === key || pathname.startsWith(`${key}/`));
  const help = helpKey ? PAGE_HELP[helpKey] : null;
  const shortcutProjects = projects.filter((project) => project.state !== "archived").slice(0, PROJECT_SHORTCUT_LIMIT);

  return (
    <div className="on-forest flex h-full flex-col gap-5 overflow-y-auto px-4 pb-4 pt-5 text-sidebar-text">
      <Link href="/dashboard" onClick={onNavigate} className="inline-flex self-start rounded-[8px] px-1">
        <Logo onDark />
      </Link>

      <WorkspaceSwitcher onNavigate={onNavigate} />

      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          openComposer();
        }}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-lime text-[15px] font-semibold text-forest-deep transition-colors hover:bg-lime-deep"
      >
        <Plus size={18} aria-hidden="true" />
        New task
      </button>

      <nav aria-label="Workspace">
        <ul className="flex flex-col gap-0.5">
          {WORKSPACE_NAV.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;
            const showBadge = item.href === "/notifications" && unreadNotifications > 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium transition-colors",
                    active ? "bg-sidebar-active text-sidebar-active-text" : "text-sidebar-text/90 hover:bg-sidebar-hover hover:text-sidebar-text"
                  )}
                >
                  <Icon size={19} aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span className={cx("min-w-6 rounded-full px-1.5 text-center text-[12px] font-bold leading-6", active ? "bg-forest text-on-forest" : "bg-harvest text-forest-deep")}>
                      {unreadNotifications}
                      <span className="sr-only"> unread</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="sidebar-projects-heading">
        <div className="mb-1.5 flex items-center justify-between px-3">
          <h2 id="sidebar-projects-heading" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">
            Projects
          </h2>
          <Link href="/projects" onClick={onNavigate} className="rounded px-1 text-[13px] text-sidebar-muted hover:text-sidebar-text">
            All
          </Link>
        </div>
        {resourcesStatus === "loading" ? (
          <div className="flex flex-col gap-2 px-3 py-1" aria-hidden="true">
            <span className="h-3 w-3/4 rounded bg-white/10" />
            <span className="h-3 w-1/2 rounded bg-white/10" />
          </div>
        ) : shortcutProjects.length === 0 ? (
          <p className="px-3 text-[14px] leading-snug text-sidebar-muted">No projects yet. Tasks can live in the workspace without one.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shortcutProjects.map((project) => {
              const href = `/projects/${project.id}`;
              const active = pathname === href;
              return (
                <li key={project.id}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-[14px] transition-colors",
                      active ? "bg-white/[0.12] font-semibold text-sidebar-text" : "text-sidebar-text/85 hover:bg-sidebar-hover"
                    )}
                  >
                    <Folder size={16} aria-hidden="true" className="shrink-0 text-harvest" />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="shrink-0 text-[12px] text-sidebar-muted">
                      {project.taskCounts.open}
                      <span className="sr-only"> open tasks</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {help && (
        <aside aria-label="Help for this page" className="mt-auto rounded-[12px] border border-white/10 bg-white/[0.05] p-3.5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-sidebar-text">
            <Lightbulb size={16} aria-hidden="true" className="text-harvest" />
            {help.title}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-sidebar-muted">{help.body}</p>
        </aside>
      )}

      <AccountMenu onNavigate={onNavigate} pushedToBottom={!help} />
    </div>
  );
}

function AccountMenu({ onNavigate, pushedToBottom }: { onNavigate?: () => void; pushedToBottom: boolean }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const menuItem = "flex min-h-11 w-full items-center gap-2.5 px-3.5 text-left text-[15px] text-ink hover:bg-surface-muted";

  return (
    <div ref={containerRef} className={cx("relative border-t border-white/10 pt-3", pushedToBottom && "mt-auto")}>
      {open && (
        <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-[12px] border border-line bg-surface py-1.5 shadow-lg animate-pop-in-up">
          <Link href="/settings" onClick={() => { setOpen(false); onNavigate?.(); }} className={menuItem}>
            <UserRound size={17} aria-hidden="true" className="text-muted" />
            Profile &amp; preferences
          </Link>
          <ThemeToggle className={menuItem} />
          <Link href="/privacy" onClick={() => { setOpen(false); onNavigate?.(); }} className={menuItem}>
            <Shield size={17} aria-hidden="true" className="text-muted" />
            Privacy policy
          </Link>
          <button type="button" onClick={logout} className={cx(menuItem, "cursor-pointer border-t border-line-soft text-brick")}>
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-[10px] px-2 text-left hover:bg-sidebar-hover"
      >
        <Avatar user={user} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-sidebar-text">{user?.name}</span>
          <span className="block truncate text-[13px] text-sidebar-muted">{user?.email}</span>
        </span>
        <ChevronUp size={17} aria-hidden="true" className={cx("shrink-0 text-sidebar-muted transition-transform", !open && "rotate-180")} />
        <span className="sr-only">Account menu</span>
      </button>
    </div>
  );
}

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] bg-sidebar lg:block">
      <SidebarContent />
    </aside>
  );
}
