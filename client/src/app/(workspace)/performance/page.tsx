"use client";

// Performance: your monthly summary — what you did, how your deadlines went, extensions,
// and how often you planned your work — with a six-month trend. It covers every workspace,
// or only the ones you pick, and any month can be shared for a chosen list of workspaces.
// Owners and Admins also get a link to their workspace's team performance.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers, Link2, Trash2, Users } from "lucide-react";
import toast from "react-hot-toast";
import { createPerformanceShare, getMyPerformance, listPerformanceShares, revokePerformanceShare } from "@/lib/services/performanceService";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import { useWorkspaces } from "@/context/WorkspaceContext";
import PageHeader from "@/components/layout/PageHeader";
import PerformanceView, { monthLabel } from "@/components/performance/PerformanceView";
import WorkspacePicker, { describeSelection } from "@/components/performance/WorkspacePicker";
import Button, { ButtonLink } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { FailurePanel, SkeletonRows } from "@/components/ui/States";
import { shiftMonth } from "@/utils/months";
import type { MonthSummary, PerformanceShare, TrendPoint } from "@/types/models";

const shareUrlFor = (token: string) => `${window.location.origin}/performance/shared/${token}`;

// What a share link covers, in the list of your links.
const shareCoverage = (share: PerformanceShare) => {
  if (share.allWorkspaces) return "All your workspaces";
  const names = share.workspaces.map((workspace) => workspace.name).join(", ");
  return `${names}${share.showWorkspaceNames ? " (names shown)" : " (names hidden)"}`;
};

export default function PerformancePage() {
  const { workspaces, activeWorkspace } = useWorkspaces();
  const [month, setMonth] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  // Empty = every workspace.
  const [scope, setScope] = useState<string[]>([]);
  const [report, setReport] = useState<{ summary: MonthSummary; trend: TrendPoint[] } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [shares, setShares] = useState<PerformanceShare[]>([]);
  const [choosingScope, setChoosingScope] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);

  const load = useCallback(async (requestedMonth: string | undefined, workspaceIds: string[]) => {
    setFailure(null);
    try {
      const response = await getMyPerformance(requestedMonth, workspaceIds);
      setReport(response.data.data);
      setMonth(response.data.data.summary.month);
      // The server decides "this month" in your timezone; remember it to stop at the present.
      if (!requestedMonth) setCurrentMonth(response.data.data.summary.month);
    } catch (error) {
      setFailure(describeFailure(error, "We couldn't load your summary."));
    }
  }, []);

  const loadShares = useCallback(async () => {
    try {
      const response = await listPerformanceShares();
      setShares(response.data.data.shares);
    } catch {
      // The summary still works; the share list just stays as it was.
    }
  }, []);

  useEffect(() => {
    load(undefined, []);
    loadShares();
  }, [load, loadShares]);

  const show = (nextMonth: string | undefined, nextScope: string[]) => {
    setReport(null);
    load(nextMonth, nextScope);
  };

  const revoke = async (shareToRevoke: PerformanceShare) => {
    try {
      await revokePerformanceShare(shareToRevoke.id);
      setShares((current) => current.filter((item) => item.id !== shareToRevoke.id));
      toast.success("Link revoked. It no longer opens.");
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't turn off that link. Try again."));
    }
  };

  const atCurrentMonth = !!month && month === currentMonth;
  const scopeLabel = scope.length === 0 || scope.length === workspaces.length ? "All workspaces" : scope.length === 1 ? workspaces.find((workspace) => workspace.id === scope[0])?.name ?? "1 workspace" : `${scope.length} workspaces`;
  const canSeeTeam = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  return (
    <>
      <title>Performance · Afritask</title>
      <PageHeader
        eyebrow="Your month"
        title="Performance"
        description="What you did, how your deadlines went, how often you extended them, and how often you planned your work."
        actions={
          <>
            <div className="flex items-center rounded-[10px] border border-line bg-surface">
              <button type="button" aria-label="Previous month" onClick={() => month && show(shiftMonth(month, -1), scope)} disabled={!month} className="flex h-11 w-11 items-center justify-center rounded-l-[10px] hover:bg-surface-muted disabled:opacity-50">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="min-w-[9.5rem] px-2 text-center text-[15px] font-medium text-ink" aria-live="polite">
                {month ? monthLabel(month) : "Loading..."}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => month && show(shiftMonth(month, 1), scope)}
                disabled={!month || atCurrentMonth}
                className="flex h-11 w-11 items-center justify-center rounded-r-[10px] hover:bg-surface-muted disabled:opacity-50"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <Button variant="secondary" icon={<Layers size={16} aria-hidden="true" />} onClick={() => setChoosingScope(true)} disabled={workspaces.length === 0}>
              {scopeLabel}
            </Button>
            <Button variant="secondary" icon={<Link2 size={16} aria-hidden="true" />} disabled={!report} onClick={() => setSharingOpen(true)}>
              Share
            </Button>
            {canSeeTeam && activeWorkspace && (
              <ButtonLink href="/performance/team" variant="secondary" icon={<Users size={16} aria-hidden="true" />}>
                Team performance
              </ButtonLink>
            )}
          </>
        }
      />

      {failure ? (
        <FailurePanel failure={failure} onRetry={() => load(month ?? undefined, scope)} />
      ) : !report ? (
        <SkeletonRows rows={4} label="Loading your summary" />
      ) : (
        <PerformanceView summary={report.summary} trend={report.trend} scopeNote={describeSelection(scope, workspaces)} />
      )}

      {/* NOTE: mounted only while open, so each opening starts from the current choice
          (and typing/ticking isn't reset by a re-render of this page). */}
      {choosingScope && (
        <ScopeDialog
          initial={scope.length ? scope : workspaces.map((workspace) => workspace.id)}
          onClose={() => setChoosingScope(false)}
          onApply={(nextScope) => {
            setChoosingScope(false);
            setScope(nextScope);
            show(month ?? undefined, nextScope);
          }}
        />
      )}

      {sharingOpen && month && (
        <ShareDialog
          month={month}
          initial={scope.length ? scope : workspaces.map((workspace) => workspace.id)}
          onClose={() => setSharingOpen(false)}
          onCreated={(created) => setShares((current) => [created, ...current])}
        />
      )}

      {shares.length > 0 && (
        <section aria-labelledby="shares-heading" className="mt-8 max-w-2xl">
          <h2 id="shares-heading" className="text-[16px] font-semibold text-ink">
            Shared links
          </h2>
          <p className="mt-1 text-[14px] text-muted">
            Each link shows one month&apos;s numbers for the workspaces you chose, and your name. Links can&apos;t be shown again after they&apos;re made. If you lose one,
            revoke it and make a new one.
          </p>
          <ul className="mt-3 divide-y divide-line-soft rounded-[12px] border border-line bg-surface">
            {shares.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="min-w-0 flex-1">
                  <span className="text-ink">{monthLabel(item.month)}</span>
                  <span className="ml-2 text-muted">made {new Date(item.createdAt).toLocaleDateString()}</span>
                  <span className="block truncate text-[13px] text-muted">{shareCoverage(item)}</span>
                </span>
                <Button size="sm" variant="ghost" icon={<Trash2 size={15} aria-hidden="true" />} onClick={() => revoke(item)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// ─── Which workspaces to show ─────────────────────
function ScopeDialog({ initial, onClose, onApply }: { initial: string[]; onClose: () => void; onApply: (scope: string[]) => void }) {
  const { workspaces } = useWorkspaces();
  const [selected, setSelected] = useState(initial);

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Show performance for"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={selected.length === 0} onClick={() => onApply(selected.length === workspaces.length ? [] : selected)}>
            Show
          </Button>
        </>
      }
    >
      <WorkspacePicker workspaces={workspaces} selectedIds={selected} onChange={setSelected} />
      {selected.length === 0 && <p className="mt-3 text-[13px] text-muted">Tick at least one workspace.</p>}
    </Dialog>
  );
}

// ─── Share a month for chosen workspaces ─────────────────────
function ShareDialog({ month, initial, onClose, onCreated }: { month: string; initial: string[]; onClose: () => void; onCreated: (share: PerformanceShare) => void }) {
  const { workspaces } = useWorkspaces();
  const [selected, setSelected] = useState(initial);
  const [showNames, setShowNames] = useState(false);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const response = await createPerformanceShare({ month, workspaceIds: selected, showWorkspaceNames: showNames });
      const created = response.data.data.share;
      const url = shareUrlFor(created.token!);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied. Anyone with it can see these numbers.");
      } catch {
        window.prompt("Copy this link:", url);
      }
      onCreated(created);
      onClose();
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't create a share link. Try again."));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`Share ${monthLabel(month)}`}
      description="Anyone with the link sees your name and your numbers for the workspaces you tick. Never task titles or details."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button icon={<Link2 size={16} aria-hidden="true" />} loading={creating} disabled={selected.length === 0} onClick={create}>
            Create link
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <WorkspacePicker workspaces={workspaces} selectedIds={selected} onChange={setSelected} />
        <label className="flex cursor-pointer items-start gap-3 text-[14px] text-ink">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--forest)]" checked={showNames} onChange={(event) => setShowNames(event.target.checked)} />
          <span>
            Show the workspaces&apos; names
            <span className="block text-[13px] text-muted">Off: the link only says how many workspaces it covers.</span>
          </span>
        </label>
        {selected.length === 0 && <p className="text-[13px] text-muted">Tick at least one workspace to share.</p>}
      </div>
    </Dialog>
  );
}
