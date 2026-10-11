import prisma from "../config/prisma.js";
import CLIENT_URL from "../config/clientUrl.js";
import { Prisma, type NewsletterPost, type NewsletterSubscriber } from "../generated/prisma/client.js";
import { sendNewsletterConfirmationEmail, sendNewsletterPostEmail } from "../utils/email.js";
import logger, { errorMessage } from "../utils/logger.js";
import { signLink } from "../utils/signedLink.js";

// ─── Newsletter subscriptions ─────────────────────
// One NewsletterSubscriber row per email address, with or without an account:
//   - account holders opt in at signup (pending until the email is verified) or from
//     Settings → Profile (instantly — the address is already verified);
//   - visitors subscribe from the website and confirm by email (double opt-in, so nobody
//     can sign someone else up).
// Only "subscribed" rows ever get newsletter email, and every one of those emails carries a
// one-click unsubscribe link plus a pointer to the settings toggle.

const CONFIRMATION_LINK_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export type SubscriptionSource = "signup" | "profile" | "website";

// ─── Links ─────────────────────
export const unsubscribeLinksFor = (subscriberId: string) => {
    const { signature } = signLink("newsletter-unsubscribe", subscriberId);
    const query = `subscriber=${encodeURIComponent(subscriberId)}&signature=${encodeURIComponent(signature)}`;
    return {
        // A page that asks for a click — mail scanners pre-open links, and a GET must not unsubscribe.
        pageUrl: `${CLIENT_URL}/newsletter/unsubscribe?${query}`,
        // RFC 8058 one-click: mail apps POST here directly (List-Unsubscribe-Post header).
        oneClickUrl: `${CLIENT_URL}/api/v1/newsletter/unsubscribe?${query}`,
    };
};

const confirmationUrlFor = (subscriberId: string) => {
    const { expires, signature } = signLink("newsletter-confirm", subscriberId, new Date(Date.now() + CONFIRMATION_LINK_LIFETIME_MS));
    return `${CLIENT_URL}/newsletter/confirm?subscriber=${encodeURIComponent(subscriberId)}&expires=${expires}&signature=${encodeURIComponent(signature)}`;
};

// ─── Account holders ─────────────────────
// The account's subscription row: linked by userId, or an earlier website sign-up with the
// same address (which gets linked to the account now).
const findAccountSubscriber = (db: Prisma.TransactionClient | typeof prisma, user: { id: string; email: string }) =>
    db.newsletterSubscriber.findFirst({ where: { OR: [{ userId: user.id }, { email: user.email }] } });

export const isAccountSubscribed = async (user: { id: string; email: string }) =>
    (await findAccountSubscriber(prisma, user))?.status === "subscribed";

// Turn the newsletter on or off for a signed-in account (the settings toggle).
export const setAccountSubscription = async (user: { id: string; email: string }, subscribed: boolean) => {
    const existing = await findAccountSubscriber(prisma, user);
    const now = new Date();
    const changes = subscribed
        ? { status: "subscribed" as const, confirmedAt: existing?.confirmedAt ?? now, unsubscribedAt: null }
        : { status: "unsubscribed" as const, unsubscribedAt: now };

    if (existing) {
        await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { ...changes, userId: user.id } });
    } else if (subscribed) {
        await prisma.newsletterSubscriber.create({ data: { email: user.email, userId: user.id, source: "profile", ...changes } });
    }
    return subscribed;
};

// Signup's optional "send me the newsletter" box: pending until the email is verified.
export const recordSignupOptIn = (db: Prisma.TransactionClient | typeof prisma, user: { id: string; email: string }) =>
    db.newsletterSubscriber.upsert({
        where: { email: user.email },
        create: { email: user.email, userId: user.id, source: "signup", status: "pending" },
        update: { userId: user.id },
    });

// Verifying the email address is the confirmation for a signup opt-in.
export const confirmSignupOptIn = (userId: string) =>
    prisma.newsletterSubscriber.updateMany({
        where: { userId, status: "pending" },
        data: { status: "subscribed", confirmedAt: new Date() },
    });

// ─── Visitors (website form) ─────────────────────
// Always answers the same way (doesn't reveal who's subscribed). Sends a confirmation
// email unless the address is already subscribed.
export const subscribeVisitor = async (email: string) => {
    const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
    if (existing?.status === "subscribed") return;

    const subscriber = existing
        ? await prisma.newsletterSubscriber.update({ where: { id: existing.id }, data: { status: "pending" } })
        : await prisma.newsletterSubscriber.create({ data: { email, source: "website", status: "pending" } });

    await sendNewsletterConfirmationEmail(email, confirmationUrlFor(subscriber.id));
};

export const confirmSubscriber = async (subscriberId: string) => {
    const { count } = await prisma.newsletterSubscriber.updateMany({
        where: { id: subscriberId },
        data: { status: "subscribed", confirmedAt: new Date(), unsubscribedAt: null },
    });
    return count === 1;
};

// Idempotent: unsubscribing twice (or a removed subscriber) is still "you're unsubscribed".
export const unsubscribe = (subscriberId: string) =>
    prisma.newsletterSubscriber.updateMany({
        where: { id: subscriberId, status: { not: "unsubscribed" } },
        data: { status: "unsubscribed", unsubscribedAt: new Date() },
    });

export const subscriberSummary = async () => {
    const counts = await prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } });
    const countOf = (status: NewsletterSubscriber["status"]) => counts.find((group) => group.status === status)?._count._all ?? 0;
    return { subscribed: countOf("subscribed"), pending: countOf("pending"), unsubscribed: countOf("unsubscribed") };
};

// ─── Sending a published post ─────────────────────
// Called by the minute sweep. A post published with "email subscribers" goes out in
// batches; each (post, subscriber) pair is claimed by inserting its NewsletterDelivery row
// (unique), so overlapping sweeps or a retry never email anyone twice.
export const NEWSLETTER_BATCH_SIZE = 100;

const sendPostToBatch = async (post: NewsletterPost) => {
    const recipients = await prisma.newsletterSubscriber.findMany({
        where: { status: "subscribed", deliveries: { none: { postId: post.id } } },
        orderBy: { id: "asc" },
        take: NEWSLETTER_BATCH_SIZE,
    });

    let sent = 0;
    for (const recipient of recipients) {
        let deliveryId: string;
        try {
            deliveryId = (await prisma.newsletterDelivery.create({ data: { postId: post.id, subscriberId: recipient.id, attempts: 1 } })).id;
        } catch (error) {
            // Another sweep claimed this recipient first.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
            throw error;
        }
        try {
            await sendNewsletterPostEmail(recipient.email, post, unsubscribeLinksFor(recipient.id));
            await prisma.newsletterDelivery.update({ where: { id: deliveryId }, data: { status: "sent", sentAt: new Date() } });
            sent += 1;
        } catch (error) {
            // NOTE: not retried — a newsletter is not worth a duplicate if the provider did send it.
            await prisma.newsletterDelivery.update({ where: { id: deliveryId }, data: { status: "failed", lastError: errorMessage(error).slice(0, 500) } });
            logger.error(`Newsletter ${post.id} to subscriber ${recipient.id} failed: ${errorMessage(error)}`);
        }
    }

    if (recipients.length < NEWSLETTER_BATCH_SIZE) {
        await prisma.newsletterPost.update({ where: { id: post.id }, data: { emailCompletedAt: new Date() } });
    }
    return sent;
};

export const runNewsletterSweep = async () => {
    const posts = await prisma.newsletterPost.findMany({
        where: { status: "published", emailRequested: true, emailCompletedAt: null },
        orderBy: { publishedAt: "asc" },
    });
    let sent = 0;
    for (const post of posts) sent += await sendPostToBatch(post);
    return sent;
};
