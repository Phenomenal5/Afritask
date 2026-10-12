"use client";

// A shared month of someone's performance summary — public, read-only. Shows their name
// and the numbers only (never task titles); the owner can revoke the link any time.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSharedPerformance } from "@/lib/services/performanceService";
import { describeFailure, type Failure } from "@/lib/errors";
import ThemeToggle from "@/components/layout/ThemeToggle";
import PerformanceView, { monthLabel } from "@/components/performance/PerformanceView";
import Avatar from "@/components/ui/Avatar";
import Logo from "@/components/ui/Logo";
import { FailurePanel, SkeletonRows } from "@/components/ui/States";
import type { MonthSummary, TrendPoint } from "@/types/models";

export default function SharedPerformancePage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<{ owner: { name: string; photo: string | null }; summary: MonthSummary; trend: TrendPoint[] } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    getSharedPerformance(token)
      .then((response) => setReport(response.data.data))
      .catch((error) => setFailure(describeFailure(error, "This link isn't available. Ask the person who shared it for a new one.")));
  }, [token]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-[8px]" aria-label="Afritask home">
            <Logo />
          </Link>
          <ThemeToggle className="h-11 rounded-[10px] px-3 text-[14px] text-muted hover:bg-surface-muted hover:text-ink" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <title>{report ? `${report.owner.name} · ${monthLabel(report.summary.month)} · Afritask` : "Shared summary · Afritask"}</title>
        {failure ? (
          <FailurePanel failure={failure} />
        ) : !report ? (
          <SkeletonRows rows={4} label="Loading the summary" />
        ) : (
          <>
            <div className="mb-8 flex items-center gap-4">
              <Avatar user={report.owner} size={52} />
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Monthly summary</p>
                <h1 className="text-[26px] font-semibold leading-tight text-ink">
                  {report.owner.name} · {monthLabel(report.summary.month)}
                </h1>
              </div>
            </div>
            <PerformanceView summary={report.summary} trend={report.trend} />
          </>
        )}
      </main>
    </div>
  );
}
