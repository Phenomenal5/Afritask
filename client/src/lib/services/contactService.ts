/**
 * The public Contact page: anyone can write, signed in or not. Support answers by email.
 */
import api from "@/lib/api";
import type { SupportTicketCategory } from "@/types/models";

export interface ContactInput {
  name: string;
  email: string;
  topic: SupportTicketCategory;
  message: string;
  // The hidden field a person never fills in (see ContactForm).
  website: string;
}

export const sendContactMessage = (input: ContactInput) => api.post<{ data: { ticket: { number: number | null } } }>("/contact", input);
