"use client";

// Help & support: write to Afritask support, see your requests, and keep the conversation
// going in each one. ?ticket=<id> opens a request (links from emails and notifications).
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CircleCheck, LifeBuoy } from "lucide-react";
import toast from "react-hot-toast";
import { getMyTicket, listMyTickets, replyToTicket, resolveTicket } from "@/lib/services/supportService";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import PageHeader from "@/components/layout/PageHeader";
import NewTicketForm from "@/components/support/NewTicketForm";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/components/support/supportLabels";
import Button from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { EmptyState, FailurePanel, SkeletonRows } from "@/components/ui/States";
import { cx } from "@/lib/cx";
import type { SupportTicket } from "@/types/models";

const formatWhen = (instant: string) => new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(instant));

function StatusPill({ status }: { status: SupportTicket["status"] }) {
  const { label, tone } = STATUS_LABELS[status];
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold",
        tone === "waiting" && "bg-harvest-tint text-forest-deep",
        tone === "open" && "bg-surface-muted text-muted",
        tone === "done" && "bg-lime text-forest-deep"
      )}
    >
      {label}
    </span>
  );
}

// ─── One request, as a conversation ─────────────────────
function TicketThread({ ticketId, onBack, onChanged }: { ticketId: string; onBack: () => void; onChanged: () => void }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getMyTicket(ticketId)
      .then((response) => setTicket(response.data.data.ticket))
      .catch((error) => setFailure(describeFailure(error, "We couldn't open this request.")));
  }, [ticketId]);

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const response = await replyToTicket(ticketId, reply.trim());
      setTicket(response.data.data.ticket);
      setReply("");
      onChanged();
    } catch (error) {
      toast.error(failureMessage(error, "Your reply didn't send. Try again."));
    } finally {
      setSending(false);
    }
  };

  const markSolved = async () => {
    try {
      const response = await resolveTicket(ticketId);
      setTicket(response.data.data.ticket);
      onChanged();
      toast.success("Glad that's sorted. Thanks for letting us know.");
    } catch (error) {
      toast.error(failureMessage(error, "That didn't save. Try again."));
    }
  };

  if (failure) return <FailurePanel failure={failure} />;
  if (!ticket) return <SkeletonRows rows={3} label="Loading your request" />;

  const closed = ticket.status === "closed";
  return (
    <section aria-labelledby="ticket-heading" className="rounded-[14px] border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-1 inline-flex items-center gap-1 text-[13.5px] font-medium text-forest hover:underline">
            <ArrowLeft size={14} aria-hidden="true" /> All requests
          </button>
          <h2 id="ticket-heading" className="text-[18px] font-semibold text-ink">
            {ticket.subject}
          </h2>
          <p className="text-[13px] text-muted">
            #{ticket.number} · {CATEGORY_LABELS[ticket.category]} · opened {formatWhen(ticket.createdAt)}
          </p>
        </div>
        <StatusPill status={ticket.status} />
      </div>

      <ol className="flex flex-col gap-4 px-5 py-5">
        {ticket.messages?.map((message) => (
          <li key={message.id} className={cx("max-w-[42rem] rounded-[12px] px-4 py-3", message.fromSupport ? "border border-line bg-surface-muted" : "ml-auto bg-lime/60")}>
            <p className="mb-1 text-[12.5px] font-semibold text-muted">
              {message.fromSupport ? "Afritask support" : "You"} · {formatWhen(message.createdAt)}
            </p>
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{message.body}</p>
          </li>
        ))}
      </ol>

      {closed ? (
        <p className="border-t border-line-soft px-5 py-4 text-[14px] text-muted">This request is closed. If you need more help, start a new one.</p>
      ) : (
        <form onSubmit={sendReply} className="flex flex-col gap-3 border-t border-line-soft px-5 py-4">
          <TextAreaField label="Reply" hideLabel rows={3} maxLength={5000} placeholder="Write a reply" value={reply} onChange={(event) => setReply(event.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={sending} disabled={!reply.trim()}>
              Send reply
            </Button>
            {ticket.status !== "resolved" && (
              <Button variant="ghost" icon={<CircleCheck size={16} aria-hidden="true" />} onClick={markSolved}>
                Mark as solved
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

// ─── The page ─────────────────────
export default function SupportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openTicketId = searchParams.get("ticket");
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      const response = await listMyTickets();
      setTickets(response.data.data.tickets);
      setFailure(null);
    } catch (error) {
      setFailure(describeFailure(error, "We couldn't load your requests."));
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const showTicket = (ticketId: string | null) => router.push(ticketId ? `/support?ticket=${ticketId}` : "/support");

  return (
    <>
      <title>Help and support · Afritask</title>
      <PageHeader eyebrow="Afritask" title="Help and support" description="Ask a question, report a problem or send an idea. Replies from support show up here and in your email." />

      {openTicketId ? (
        <TicketThread ticketId={openTicketId} onBack={() => showTicket(null)} onChanged={loadTickets} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-labelledby="new-ticket-heading" className="rounded-[14px] border border-line bg-surface p-5">
            <h2 id="new-ticket-heading" className="mb-3 text-[17px] font-semibold text-ink">
              Write to support
            </h2>
            <NewTicketForm
              onOpened={(ticket) => {
                toast.success(`Sent. Your request is #${ticket.number}.`);
                loadTickets();
                showTicket(ticket.id);
              }}
            />
          </section>

          <section aria-labelledby="my-tickets-heading" className="rounded-[14px] border border-line bg-surface">
            <h2 id="my-tickets-heading" className="border-b border-line-soft px-5 py-4 text-[17px] font-semibold text-ink">
              Your requests
            </h2>
            {failure ? (
              <FailurePanel compact failure={failure} onRetry={loadTickets} />
            ) : !tickets ? (
              <div className="p-5">
                <SkeletonRows rows={3} label="Loading your requests" />
              </div>
            ) : tickets.length === 0 ? (
              <EmptyState compact icon={LifeBuoy} title="No requests yet" body="When you write to support, the conversation shows up here." />
            ) : (
              <ul>
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="border-t border-line-soft first:border-t-0">
                    <button type="button" onClick={() => showTicket(ticket.id)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-muted/60">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-ink">{ticket.subject}</span>
                        <span className="block text-[13px] text-muted">
                          #{ticket.number} · last activity {formatWhen(ticket.lastMessageAt)}
                        </span>
                      </span>
                      <StatusPill status={ticket.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
