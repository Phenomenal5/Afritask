/**
 * Support tickets: writing to Afritask support and following up.
 */
import api from "@/lib/api";
import type { SupportTicket, SupportTicketCategory } from "@/types/models";

export interface NewTicketInput {
  subject: string;
  category: SupportTicketCategory;
  message: string;
  workspaceId?: string;
}

export const listMyTickets = () => api.get<{ data: { tickets: SupportTicket[] } }>("/support/tickets");

export const getMyTicket = (ticketId: string) => api.get<{ data: { ticket: SupportTicket } }>(`/support/tickets/${ticketId}`);

export const openTicket = (input: NewTicketInput) => api.post<{ data: { ticket: SupportTicket } }>("/support/tickets", input);

export const replyToTicket = (ticketId: string, body: string) => api.post<{ data: { ticket: SupportTicket } }>(`/support/tickets/${ticketId}/messages`, { body });

export const resolveTicket = (ticketId: string) => api.post<{ data: { ticket: SupportTicket } }>(`/support/tickets/${ticketId}/resolve`);
