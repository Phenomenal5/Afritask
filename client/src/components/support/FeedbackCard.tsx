"use client";

// The overview's feedback box: one click, a few lines, sent. It's stored as a support
// ticket with the "feedback" topic, so it reaches the admin console's support queue and any
// reply comes back like any other support reply. No subject to think up: it's made from
// the kind of feedback and its first words.
import { useState, type FormEvent } from "react";
import { MessageSquareHeart, Send } from "lucide-react";
import toast from "react-hot-toast";
import { openTicket } from "@/lib/services/supportService";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { failureMessage } from "@/lib/errors";
import { cx } from "@/lib/cx";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";

const FEEDBACK_KINDS = [
  { value: "like", label: "Something I like" },
  { value: "improve", label: "Something to improve" },
  { value: "idea", label: "An idea" },
] as const;
type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];

const MESSAGE_MIN_LENGTH = 5;
const MESSAGE_MAX_LENGTH = 5000;

// "An idea: Let me pin a project to the top of..." (support subjects are 3 to 150 characters).
const subjectFor = (kind: FeedbackKind, message: string) => {
  const kindLabel = FEEDBACK_KINDS.find((option) => option.value === kind)!.label;
  const firstLine = message.trim().split("\n")[0]!.replace(/\s+/g, " ");
  const preview = firstLine.length > 80 ? `${firstLine.slice(0, 80).trimEnd()}...` : firstLine;
  return `${kindLabel}: ${preview}`;
};

export default function FeedbackCard() {
  const { activeWorkspace } = useWorkspaces();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("improve");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const close = () => {
    if (sending) return;
    setOpen(false);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (message.trim().length < MESSAGE_MIN_LENGTH) return setError("Write a few words first.");
    setSending(true);
    setError(null);
    try {
      await openTicket({ subject: subjectFor(kind, message), category: "feedback", message: message.trim(), workspaceId: activeWorkspace?.id });
      toast.success("Thanks for the feedback. It's with the team now.");
      setMessage("");
      setOpen(false);
    } catch (failure) {
      // The text stays in the box so nothing is lost.
      setError(failureMessage(failure, "Your feedback didn't send. Try again in a moment."));
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="feedback-heading" className="flex items-start gap-4 rounded-[14px] border border-line bg-surface p-5">
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime/60 text-forest-deep">
        <MessageSquareHeart size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="feedback-heading" className="text-[17px] font-semibold text-ink">
          How is Afritask working for you?
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-muted">Tell us what works, what gets in your way, or what you wish it did.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Share feedback
        </Button>
      </div>

      <Dialog open={open} onClose={close} title="Share feedback" description="It goes straight to the Afritask team. If we have a question, we'll reply in Support.">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-[14px] font-medium text-ink">What kind of feedback?</legend>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_KINDS.map((option) => (
                <label
                  key={option.value}
                  className={cx(
                    "inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-[14px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-forest",
                    kind === option.value ? "border-forest bg-forest text-on-forest" : "border-line bg-surface text-ink hover:bg-surface-muted"
                  )}
                >
                  <input type="radio" name="feedback-kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className="sr-only" />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <TextAreaField
            label="Your feedback"
            rows={5}
            maxLength={MESSAGE_MAX_LENGTH}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              setError(null);
            }}
            error={error}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" loading={sending} icon={<Send size={16} aria-hidden="true" />}>
              Send feedback
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
