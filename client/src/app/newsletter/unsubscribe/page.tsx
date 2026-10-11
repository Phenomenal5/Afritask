"use client";

// From the unsubscribe link at the bottom of every newsletter email.
import NewsletterLinkAction from "@/components/newsletter/NewsletterLinkAction";
import { unsubscribeFromNewsletter } from "@/lib/services/newsletterService";

// Module-level so the page's effect sees the same array every render.
const UNSUBSCRIBE_PARAMS = ["subscriber", "signature"];

export default function UnsubscribeNewsletterPage() {
  return (
    <NewsletterLinkAction
      title="Unsubscribe from the newsletter"
      description="You'll stop getting the Afritask newsletter. Account emails (sign-in, reminders, invitations) aren't affected. You can turn it back on from the Profile section in Settings."
      actionLabel="Unsubscribe"
      requiredParams={UNSUBSCRIBE_PARAMS}
      perform={(params) => unsubscribeFromNewsletter({ subscriber: params.subscriber!, signature: params.signature! })}
    />
  );
}
