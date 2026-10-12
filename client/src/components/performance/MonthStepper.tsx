"use client";

// Previous / next month, stopping at the current month.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftMonth } from "@/utils/months";
import { monthLabel } from "./PerformanceView";

interface MonthStepperProps {
  month: string | null;
  // The latest month that can be shown (this month in the viewer's timezone).
  latestMonth: string | null;
  onChange: (month: string) => void;
}

export default function MonthStepper({ month, latestMonth, onChange }: MonthStepperProps) {
  const atLatest = !!month && month === latestMonth;
  const step = "flex h-11 w-11 items-center justify-center hover:bg-surface-muted disabled:opacity-50";
  return (
    <div className="flex items-center rounded-[10px] border border-line bg-surface">
      <button type="button" aria-label="Previous month" onClick={() => month && onChange(shiftMonth(month, -1))} disabled={!month} className={`${step} rounded-l-[10px]`}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="min-w-[9.5rem] px-2 text-center text-[15px] font-medium text-ink" aria-live="polite">
        {month ? monthLabel(month) : "Loading..."}
      </span>
      <button type="button" aria-label="Next month" onClick={() => month && onChange(shiftMonth(month, 1))} disabled={!month || atLatest} className={`${step} rounded-r-[10px]`}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
