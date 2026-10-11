import { BrevoClient } from "@getbrevo/brevo";
import { emailTemplate, escapeHtml } from "./emailTemplates.js";
import logger, { errorMessage } from "./logger.js";
import env from "../config/env.js";
import type { NewsletterPost, Task } from "../generated/prisma/client.js";
import CLIENT_URL from "../config/clientUrl.js";

const brevo = new BrevoClient({
  apiKey: env.brevoApiKey,
});

interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  // Extra headers, e.g. List-Unsubscribe on newsletters.
  headers?: Record<string, string>;
}

// Only the fields a reminder email shows.
type ReminderTask = Pick<Task, "title" | "description" | "dueAt"> & { id?: string };

// "reminder": the chosen reminder time arrived. "overdue": the deadline passed while open.
// "starting": the task is planned to start tomorrow.
export type TaskEmailKind = "reminder" | "overdue" | "starting";

const TASK_EMAIL_COPY: Record<TaskEmailKind, { subject: string; title: string; badge: string; lead: string }> = {
  reminder: { subject: "Task Reminder", title: "Task Reminder", badge: "⏰ Reminder", lead: "You have a task coming up in AfriTask." },
  overdue: {
    subject: "Overdue",
    title: "Task Overdue",
    badge: "⚠️ Overdue",
    lead: "This AfriTask task has passed its deadline and is still open. Finish it, move the date, or hand it to someone else.",
  },
  starting: { subject: "Starting tomorrow", title: "Starting Tomorrow", badge: "🗓️ Starting soon", lead: "You planned to start this task tomorrow — a good moment to get ready." },
};

// ─── Test mailbox ─────────────────────
// NOTE: test seam. Under NODE_ENV=test nothing goes to Brevo: messages are captured here so
// the suite can follow real verification/reset/invitation links, and `failNextSend`
// simulates a provider outage. It is never consulted outside tests.
export const testMailbox = {
  sent: [] as OutgoingEmail[],
  failNextSend: false,
};

const emailService = {
  sendEmail: async ({ to, subject, text, html, headers }: OutgoingEmail) => {
    if (env.isTest) {
      if (testMailbox.failNextSend) {
        testMailbox.failNextSend = false;
        throw new Error("Simulated email provider failure");
      }
      testMailbox.sent.push({ to, subject, text, html, headers });
      return;
    }

    await brevo.transactionalEmails.sendTransacEmail({
      to: [{ email: to }],
      sender: {
        name: env.emailFromName,
        email: env.emailFromAddress,
      },
      subject,
      textContent: text,
      htmlContent: html,
      ...(headers && { headers }),
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  },
};

const formatTaskDeadline = (dueAt?: Date | string | null) => {
  if (!dueAt) {
    return "No deadline set";
  }

  const parsed = new Date(dueAt);
  return Number.isNaN(parsed.getTime())
    ? "No deadline set"
    : parsed.toDateString();
};

const buildPasswordResetMessage = () => `
  <p>We received a request to reset your AfriTask password.</p>
  <p>This secure link will expire soon, so please complete the reset as soon as possible.</p>
  <p>If you did not request this change, you can safely ignore this email and your password will stay the same.</p>
  <p style="margin:24px 0 0; color:#6A5B4C;">You can reset your password using the button below.</p>
`;

const buildVerificationMessage = () => `
  <p>Welcome to AfriTask. Please verify your email address to activate your account.</p>
  <p>Verification helps keep your account secure and ensures we can send you important updates.</p>
  <p>Once verified, you will be ready to start organizing your tasks.</p>
`;

const buildWelcomeMessage = (name = "there") => `
  <p>Welcome to AfriTask, ${escapeHtml(name)}.</p>
  <p>Your account is ready, and we're glad to have you here.</p>
  <p>With AfriTask, you can:</p>
  <ul style="margin:14px 0 0; padding-left:20px;">
    <li style="margin:0 0 8px;">Create and manage tasks</li>
    <li style="margin:0 0 8px;">Set reminders and deadlines</li>
    <li style="margin:0 0 8px;">Track progress</li>
    <li style="margin:0;">Stay focused on priorities</li>
  </ul>
`;

const buildPasswordChangedMessage = () => `
  <p>Your AfriTask password has been updated successfully.</p>
  <p>If you made this change, no further action is needed.</p>
  <p>If you did not authorize this update, please secure your account immediately by resetting your password again.</p>
`;

const buildTaskReminderMessage = (task: ReminderTask, kind: TaskEmailKind = "reminder") => {
  const title = escapeHtml(task?.title || "Untitled task");
  const deadline = escapeHtml(formatTaskDeadline(task?.dueAt));
  const description = task?.description ? escapeHtml(task.description) : "";

  return `
    <p>${TASK_EMAIL_COPY[kind].lead}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 10px;">
      <tr>
        <td style="background-color:#FFF9F2; border:1px solid #E6D7C7; border-radius:18px; padding:22px 22px 18px;">
          <div style="font-family:Georgia, 'Times New Roman', serif; font-size:22px; line-height:1.35; font-weight:700; color:#2A2019; margin:0 0 14px;">${title}</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="font-size:15px; line-height:1.6; color:#6A5B4C;">
            <tr>
              <td style="padding:0 0 10px; vertical-align:top; width:96px; color:#8E8278; font-weight:700;">Deadline</td>
              <td style="padding:0 0 10px;">${deadline}</td>
            </tr>
            ${
              description
                ? `<tr><td style="padding:0; vertical-align:top; width:96px; color:#8E8278; font-weight:700;">Details</td><td style="padding:0;">${description}</td></tr>`
                : ""
            }
          </table>
        </td>
      </tr>
    </table>
  `;
};

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const resetUrl = `${CLIENT_URL}/reset-password?token=${token}`;

  await emailService.sendEmail({
    to,
    subject: "Reset Your Password",
    text: `We received a password reset request for your AfriTask account. Reset it here: ${resetUrl}. This link expires soon. If you did not request this, you can ignore this email.`,
    html: emailTemplate({
      title: "Reset Your Password",
      badge: "🔐 Security",
      message: buildPasswordResetMessage(),
      buttonText: "Reset Password",
      buttonUrl: resetUrl,
    }),
  });
};

export const sendEmailVerificationCode = async (to: string, token: string) => {
  const verificationUrl = `${CLIENT_URL}/verify-email/${token}`;

  await emailService.sendEmail({
    to,
    subject: "Verify Your Email",
    text: `Welcome to AfriTask. Verify your email here: ${verificationUrl}. Verification helps protect your account.`,
    html: emailTemplate({
      title: "Verify Your Email",
      badge: "✨ Welcome",
      message: buildVerificationMessage(),
      buttonText: "Verify Email",
      buttonUrl: verificationUrl,
    }),
  });
};

export const sendWelcomeEmail = async (to: string, name = "there") => {
  const dashboardUrl = CLIENT_URL;

  await emailService.sendEmail({
    to,
    subject: "Welcome to AfriTask 🎉",
    text: `Welcome to AfriTask, ${name}. Your account is ready. You can create and manage tasks, set reminders and deadlines, track progress, and stay focused on priorities.`,
    html: emailTemplate({
      title: `Welcome to AfriTask, ${name}!`,
      badge: "🎉 Account Ready",
      message: buildWelcomeMessage(name),
      buttonText: "Open AfriTask",
      buttonUrl: dashboardUrl,
    }),
  });
};

// ─── One-time welcome email, shared by every signup path ──────────────────
// Both signup routes funnel through here so the greeting can never be
// implemented twice and drift: local signups call it once the email is
// verified, Google signups call it the moment the account is created.
// NOTE: it deliberately swallows delivery errors. A welcome email is a
// courtesy, never a gate — letting a Brevo outage bubble up would 500 the
// email-verification request or abort an otherwise successful Google
// sign-in, which is a far worse failure than a missing greeting.
export const deliverWelcomeEmail = async (to: string, name?: string) => {
  try {
    await sendWelcomeEmail(to, name);
  } catch (error) {
    logger.error(`Welcome email could not be delivered to ${to}: ${errorMessage(error)}`);
  }
};

export const sendPasswordChangedEmail = async (to: string) => {
  const dashboardUrl = CLIENT_URL;

  await emailService.sendEmail({
    to,
    subject: "Password Changed Successfully",
    text: "Your AfriTask password was changed successfully. If this was not you, reset your password immediately.",
    html: emailTemplate({
      title: "Password Changed Successfully",
      badge: "🛡️ Security Alert",
      message: buildPasswordChangedMessage(),
      buttonText: "Secure Account",
      buttonUrl: dashboardUrl,
    }),
  });
};

// NOTE: like the welcome email, the "password changed" notice is sent AFTER the change
// has committed. Letting a Brevo failure throw here used to turn a successful reset into
// a 500 — the user saw an error and retried with a link that was already used.
export const deliverPasswordChangedEmail = async (to: string) => {
  try {
    await sendPasswordChangedEmail(to);
  } catch (error) {
    logger.error(`Password-changed email could not be delivered to ${to}: ${errorMessage(error)}`);
  }
};

interface InvitationEmailDetails {
  workspaceName: string;
  inviterName: string;
  role: "admin" | "member";
  token: string;
}

// Sent for every new invitation and every resend. The link opens the client's /invite page,
// which works for people with or without an account (PRD journeys J2/J3).
export const sendInvitationEmail = async (to: string, { workspaceName, inviterName, role, token }: InvitationEmailDetails) => {
  const inviteUrl = `${CLIENT_URL}/invite/${token}`;
  const roleLabel = role === "admin" ? "an Admin" : "a Member";

  await emailService.sendEmail({
    to,
    subject: `${inviterName} invited you to ${workspaceName} on AfriTask`,
    text: `${inviterName} invited you to join ${workspaceName} on AfriTask as ${roleLabel}. Open this link to accept or decline: ${inviteUrl}. The invitation expires in 7 days. If you weren't expecting it, you can ignore this email.`,
    html: emailTemplate({
      title: `Join ${workspaceName}`,
      badge: "🤝 Invitation",
      message: `
        <p>${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(workspaceName)}</strong> on AfriTask as ${roleLabel}.</p>
        <p>You'll be able to see the workspace's projects and tasks once you accept. If you don't have an AfriTask account yet, you can create one with this email address.</p>
        <p style="margin:24px 0 0; color:#6A5B4C;">The invitation expires in 7 days. If you weren't expecting it, you can safely ignore this email.</p>
      `,
      buttonText: "View invitation",
      buttonUrl: inviteUrl,
    }),
  });
};

export const sendTaskReminderEmail = async (to: string, task: ReminderTask, kind: TaskEmailKind = "reminder") => {
  const deadline = formatTaskDeadline(task?.dueAt);
  const taskTitle = task?.title || "Untitled task";
  // Straight to the task (the app re-checks access when it opens).
  const taskUrl = task?.id ? `${CLIENT_URL}/tasks?task=${encodeURIComponent(task.id)}` : CLIENT_URL;
  const copy = TASK_EMAIL_COPY[kind];

  await emailService.sendEmail({
    to,
    subject: `${copy.subject}: ${taskTitle}`,
    text: [
      `${copy.title}: ${taskTitle}.`,
      `Deadline: ${deadline}.`,
      task?.description ? `Description: ${task.description}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    html: emailTemplate({
      title: copy.title,
      badge: copy.badge,
      message: buildTaskReminderMessage(task, kind),
      buttonText: "Open Task",
      buttonUrl: taskUrl,
    }),
  });
};

// ─── Newsletter ─────────────────────
const paragraphsOf = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

// Double opt-in for the website form: nothing is sent to an address until it confirms.
export const sendNewsletterConfirmationEmail = async (to: string, confirmUrl: string) => {
  await emailService.sendEmail({
    to,
    subject: "Confirm your AfriTask newsletter subscription",
    text: `Someone (hopefully you) asked to get the AfriTask newsletter at this address. Confirm here: ${confirmUrl} — if it wasn't you, ignore this email and nothing will be sent.`,
    html: emailTemplate({
      title: "Confirm your subscription",
      badge: "📰 Newsletter",
      message: `
        <p>Someone (hopefully you) asked to get the AfriTask newsletter at this address.</p>
        <p>Confirm and you'll get product news and tips now and then. You can unsubscribe any time with one click.</p>
        <p>If it wasn't you, ignore this email — nothing will be sent.</p>
      `,
      buttonText: "Confirm subscription",
      buttonUrl: confirmUrl,
    }),
  });
};

// NOTE: every newsletter tells the reader how to stop getting it — a one-click unsubscribe
// link, the settings toggle, and List-Unsubscribe headers so mail apps show their own
// "Unsubscribe" button (Gmail and Yahoo require these for bulk mail).
export const sendNewsletterPostEmail = async (
  to: string,
  post: Pick<NewsletterPost, "id" | "title" | "summary" | "body">,
  unsubscribe: { pageUrl: string; oneClickUrl: string },
) => {
  const postUrl = `${CLIENT_URL}/news/${encodeURIComponent(post.id)}`;
  const optOutText = `You're getting this because you subscribed to the AfriTask newsletter. To stop, unsubscribe here: ${unsubscribe.pageUrl} — or, if you have an account, turn off "Afritask newsletter" in Settings → Profile.`;

  await emailService.sendEmail({
    to,
    subject: post.title,
    text: [post.summary, ...paragraphsOf(post.body), `Read it on AfriTask: ${postUrl}`, optOutText].filter(Boolean).join("\n\n"),
    html: emailTemplate({
      title: post.title,
      badge: "📰 AfriTask news",
      message: [
        post.summary ? `<p style="font-weight:700;">${escapeHtml(post.summary)}</p>` : "",
        ...paragraphsOf(post.body).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`),
      ].join(""),
      buttonText: "Read on AfriTask",
      buttonUrl: postUrl,
      footerNote: `You're getting this because you subscribed to the AfriTask newsletter.<br /><a href="${escapeHtml(unsubscribe.pageUrl)}" style="color:inherit; font-weight:700;">Unsubscribe</a> with one click, or turn off &ldquo;Afritask newsletter&rdquo; in Settings → Profile.`,
    }),
    headers: {
      "List-Unsubscribe": `<${unsubscribe.oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
};
