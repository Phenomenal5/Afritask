/**
 * Newsletter: the public news feed, the signed-in account's subscription toggle, and the
 * signed links from newsletter emails (confirm, unsubscribe).
 */
import api from "@/lib/api";
import type { NewsletterPost, Page } from "@/types/models";

export const listNewsletterPosts = (page = 1) =>
  api.get<{ data: Page<NewsletterPost> }>("/newsletter/posts", { params: { page, limit: 10 } });

export const getNewsletterPost = (postId: string) => api.get<{ data: { post: NewsletterPost } }>(`/newsletter/posts/${postId}`);

export const getMySubscription = () => api.get<{ data: { subscribed: boolean } }>("/newsletter/subscription");

export const updateMySubscription = (subscribed: boolean) =>
  api.put<{ message: string; data: { subscribed: boolean } }>("/newsletter/subscription", { subscribed });

// Visitors (landing page): sends a confirmation email.
export const subscribeToNewsletter = (email: string) => api.post<{ message: string }>("/newsletter/subscribe", { email });

export const confirmNewsletter = (link: { subscriber: string; expires: string; signature: string }) =>
  api.post<{ message: string }>("/newsletter/confirm", link);

export const unsubscribeFromNewsletter = (link: { subscriber: string; signature: string }) =>
  api.post<{ message: string }>("/newsletter/unsubscribe", link);
