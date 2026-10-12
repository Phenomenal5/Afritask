// Words for support ticket states and topics, shared by the support page and the dashboard.
import type { SupportTicketCategory, SupportTicketStatus } from "@/types/models";

export const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  question: "A question",
  problem: "Something isn't working",
  account: "My account",
  billing: "Billing",
  feedback: "Feedback or an idea",
};

// From the customer's point of view.
export const STATUS_LABELS: Record<SupportTicketStatus, { label: string; tone: "open" | "waiting" | "done" }> = {
  open: { label: "With support", tone: "open" },
  waiting_on_customer: { label: "Support replied", tone: "waiting" },
  resolved: { label: "Solved", tone: "done" },
  closed: { label: "Closed", tone: "done" },
};
