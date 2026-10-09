"use client";

// WorkspaceSwitcher shows the active workspace and lets the user move between theirs.
// Switching changes what every task screen shows; the server still checks membership.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { ROLE_LABELS } from "@/utils/roles";

export default function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close when clicking anywhere outside the menu.
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!activeWorkspace) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-medium px-2.5 py-1.5 rounded-md cursor-pointer max-w-44"
        style={{ color: "var(--ink)", border: "1px solid var(--line)", background: "var(--paper-raised)" }}
      >
        <span className="truncate">{activeWorkspace.name}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 mt-2 w-64 rounded-xl overflow-hidden py-1 shadow-lg z-30"
          style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}
        >
          <p className="px-3.5 pt-2 pb-1 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--ink-soft)" }}>
            Workspaces
          </p>
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              role="option"
              aria-selected={workspace.id === activeWorkspace.id}
              onClick={() => {
                switchWorkspace(workspace.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-sm text-left cursor-pointer hover:bg-[var(--line-soft)]"
              style={{ color: "var(--ink)", fontWeight: workspace.id === activeWorkspace.id ? 600 : 400 }}
            >
              <span className="truncate">{workspace.name}</span>
              <span className="text-xs shrink-0" style={{ color: "var(--ink-soft)" }}>
                {ROLE_LABELS[workspace.role]}
              </span>
            </button>
          ))}
          <div style={{ borderTop: "1px solid var(--line-soft)" }} className="mt-1 pt-1">
            <Link
              href="/workspace"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm hover:bg-[var(--line-soft)]"
              style={{ color: "var(--ink)" }}
            >
              Workspace settings
            </Link>
            <Link
              href="/workspace/new"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm hover:bg-[var(--line-soft)]"
              style={{ color: "var(--moss)" }}
            >
              + New workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
