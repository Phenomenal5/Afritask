// ─── Reading the emails the app "sent" (captured by testMailbox in utils/email.ts) ─────────────────────
import { testMailbox } from "../../src/utils/email.js";

export const clearMailbox = () => {
    testMailbox.sent.length = 0;
    testMailbox.failNextSend = false;
};

export const emailsTo = (address: string) => testMailbox.sent.filter((email) => email.to === address.toLowerCase() || email.to === address);

export const lastEmailTo = (address: string) => {
    const emails = emailsTo(address);
    const lastEmail = emails[emails.length - 1];
    if (!lastEmail) throw new Error(`No email was sent to ${address}`);
    return lastEmail;
};

// Pull the token out of the link in an email's plain-text body, e.g.
// ".../verify-email/<token>", ".../reset-password?token=<token>", ".../invite/<token>".
export const tokenFromEmail = (address: string, linkPattern: RegExp) => {
    const match = lastEmailTo(address).text.match(linkPattern);
    if (!match?.[1]) throw new Error(`No link matching ${linkPattern} in the last email to ${address}`);
    return match[1];
};

export const VERIFY_LINK = /\/verify-email\/([0-9a-f]+)/;
export const RESET_LINK = /reset-password\?token=([0-9a-f]+)/;
export const INVITE_LINK = /\/invite\/([0-9a-f]+)/;

export { testMailbox };
