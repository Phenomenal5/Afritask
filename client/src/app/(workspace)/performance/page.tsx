"use client";

// Performance: your monthly summary — how deadlines went, extensions, and how often you
// planned your work — with a six-month trend, plus links to share a month with someone.
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Link2, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createPerformanceShare, getMyPerformance, listPerformanceShares, revokePerformanceShare } from "@/lib/services/performanceService";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import PageHeader from "@/components/layout/PageHeader";
import PerformanceView, { monthLabel } from "@/components/performance/PerformanceView";
import Button from "@/components/ui/Button";
import { FailurePanel, SkeletonRows } from "@/components/ui/States";
import type { MonthSummary, PerformanceShare, TrendPoint } from "@/types/models";

const shiftMonth = (month: string, by: number) => {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

const shareUrlFor = (token: string) => `${window.location.origin}/performance/shared/${token}`;

export default function PerformancePage() {
  const [month, setMonth] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [report, setReport] = useState<{ summary: MonthSummary; trend: TrendPoint[] } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [shares, setShares] = useState<PerformanceShare[]>([]);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async (requestedMonth?: string) => {
    setFailure(null);
    try {
      const res = await getMyPerformance(requestedMonth);
      setReport(res.data.data);
      setMonth(res.data.data.summary.month);
      // The server decides "this month" in your timezone; remember it to stop at the present.
      if (!requestedMonth) setCurrentMonth(res.data.data.summary.month);
    } catch (error) {
      setFailure(describeFailure(error, "We couldn't load your summary."));
    }
  }, []);

  const loadShares = useCallback(async () => {
    try {
      const res = await listPerformanceShares();
      setShares(res.data.data.shares);
    } catch {
      // The summary still works; the share list just stays as it was.
    }
  }, []);

  useEffect(() => {
    load();
    loadShares();
  }, [load, loadShares]);

  const goTo = (nextMonth: string) => {
    setReport(null);
    load(nextMonth);
  };

  const share = async () => {
    if (!month) return;
    setSharing(true);
    try {
      const res = await createPerformanceShare(month);
      const created = res.data.data.share;
      const url = shareUrlFor(created.token!);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied. Anyone with it can see this month's numbers.");
      } catch {
        window.prompt("Copy this link:", url);
      }
      setShares((current) => [created, ...current]);
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't create a link."));
    } finally {
      setSharing(false);
    }
  };

  const revoke = async (shareToRevoke: PerformanceShare) => {
    try {
      await revokePerformanceShare(shareToRevoke.id);
      setShares((current) => current.filter((item) => item.id !== shareToRevoke.id));
      toast.success("Link revoked. It no longer opens.");
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't revoke the link."));
    }
  };

  const atCurrentMonth = !!month && month === currentMonth;

  return (
    <>
      <title>Performance · Afritask</title>
      <PageHeader
        eyebrow="Your month"
        title="Performance"
        description="How your deadlines went, how often you extended them, and how often you planned your work."
        actions={
          <>
            <div className="flex items-center rounded-[10px] border border-line bg-surface">
              <button type="button" aria-label="Previous month" onClick={() => month && goTo(shiftMonth(month, -1))} disabled={!month} className="flex h-11 w-11 items-center justify-center rounded-l-[10px] hover:bg-surface-muted disabled:opacity-50">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className="min-w-[9.5rem] px-2 text-center text-[15px] font-medium text-ink" aria-live="polite">
                {month ? monthLabel(month) : "…"}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => month && goTo(shiftMonth(month, 1))}
                disabled={!month || atCurrentMonth}
                className="flex h-11 w-11 items-center justify-center rounded-r-[10px] hover:bg-surface-muted disabled:opacity-50"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <Button variant="secondary" icon={<Link2 size={16} aria-hidden="true" />} loading={sharing} disabled={!report} onClick={share}>
              Share this month
            </Button>
          </>
        }
      />

      {failure ? <FailurePanel failure={failure} onRetry={() => load(month ?? undefined)} /> : !report ? <SkeletonRows rows={4} label="Loading your summary" /> : <PerformanceView summary={report.summary} trend={report.trend} />}

      {shares.length > 0 && (
        <section aria-labelledby="shares-heading" className="mt-8 max-w-2xl">
          <h2 id="shares-heading" className="text-[16px] font-semibold text-ink">
            Shared links
          </h2>
          <p className="mt-1 text-[14px] text-muted">Each link shows one month&apos;s numbers and your name. Links can&apos;t be shown again after they&apos;re made — revoke and make a new one if you lose it.</p>
          <ul className="mt-3 divide-y divide-line-soft rounded-[12px] border border-line bg-surface">
            {shares.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <span className="flex-1 text-ink">
                  {monthLabel(item.month)}
                  <span className="ml-2 text-muted">made {new Date(item.createdAt).toLocaleDateString()}</span>
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
