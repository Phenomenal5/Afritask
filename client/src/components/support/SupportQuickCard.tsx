"use client";

// The overview's "Need help?" box: a subject and a message straight to support, without
// leaving the dashboard. The full page (topics, past requests) is one link away.
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import NewTicketForm from "./NewTicketForm";

export default function SupportQuickCard() {
  const router = useRouter();
  return (
    <section aria-labelledby="quick-support-heading" className="rounded-[14px] border border-line bg-surface p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="quick-support-heading" className="text-[17px] font-semibold text-ink">
          Need help?
        </h2>
        <Link href="/support" className="text-[14px] font-medium text-forest hover:underline">
          Your requests
        </Link>
      </div>
      <NewTicketForm
        compact
        onOpened={(ticket) => {
          toast.success(`Sent. Your request is #${ticket.number}.`);
          router.push(`/support?ticket=${ticket.id}`);
        }}
      />
    </section>
  );
}
