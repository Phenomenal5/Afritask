"use client";

// From the "confirm your subscription" email (website sign-ups are double opt-in).
import NewsletterLinkAction from "@/components/newsletter/NewsletterLinkAction";
import { confirmNewsletter } from "@/lib/services/newsletterService";

// Module-level so the page's effect sees the same array every render.
const CONFIRM_PARAMS = ["subscriber", "expires", "signature"];

export default function ConfirmNewsletterPage() {
  return (
    <NewsletterLinkAction
      title="Confirm your subscription"
      description="One click and you'll start getting the Afritask newsletter. You can unsubscribe any time."
      actionLabel="Yes, subscribe me"
      requiredParams={CONFIRM_PARAMS}
      perform={(params) => confirmNewsletter({ subscriber: params.subscriber!, expires: params.expires!, signature: params.signature! })}
    />
  );
}
