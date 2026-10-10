// A form-level message (e.g. "Email or password is incorrect"), announced on appearance.
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cx } from "@/lib/cx";

export default function FormAlert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-3 rounded-[10px] border px-4 py-3 text-[14.5px] leading-relaxed text-ink",
        tone === "error" && "border-brick/30 bg-brick-tint",
        tone === "success" && "border-lime-deep bg-lime/60",
        tone === "info" && "border-line bg-surface-muted"
      )}
    >
      <Icon size={18} aria-hidden="true" className={cx("mt-0.5 shrink-0", tone === "error" ? "text-brick" : "text-forest")} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
