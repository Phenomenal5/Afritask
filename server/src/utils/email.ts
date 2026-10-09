import { BrevoClient } from "@getbrevo/brevo";
import { emailTemplate, escapeHtml } from "./emailTemplates.js";
import logger, { errorMessage } from "./logger.js";
import env from "../config/env.js";
import type { Task } from "../generated/prisma/client.js";
import CLIENT_URL from "../config/clientUrl.js";

const brevo = new BrevoClient({
  apiKey: env.brevoApiKey,
});

interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Only the fields a reminder email shows.
type ReminderTask = Pick<Task, "title" | "description" | "dueAt">;

const emailService = {
  sendEmail: async ({ to, subject, text, html }: OutgoingEmail) => {
    await brevo.transactionalEmails.sendTransacEmail({
      to: [{ email: to }],
      sender: {
        name: env.emailFromName,
        email: env.emailFromAddress,
      },
      subject,
      textContent: text,
      htmlContent: html,
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

const buildTaskReminderMessage = (task: ReminderTask) => {
  const title = escapeHtml(task?.title || "Untitled task");
  const deadline = escapeHtml(formatTaskDeadline(task?.dueAt));
  const description = task?.description ? escapeHtml(task.description) : "";

  return `
    <p>You have a task coming up in AfriTask.</p>
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

export const sendTaskReminderEmail = async (to: string, task: ReminderTask) => {
  const deadline = formatTaskDeadline(task?.dueAt);
  const taskTitle = task?.title || "Untitled task";
  const dashboardUrl = CLIENT_URL;

  await emailService.sendEmail({
    to,
    subject: `Task Reminder: ${taskTitle}`,
    text: [
      `Reminder for task: ${taskTitle}.`,
      `Deadline: ${deadline}.`,
      task?.description ? `Description: ${task.description}` : null,
    ]
      .filter(Boolean)
      .join(" "),
    html: emailTemplate({
      title: "Task Reminder",
      badge: "⏰ Reminder",
      message: buildTaskReminderMessage(task),
      buttonText: "Open Dashboard",
      buttonUrl: dashboardUrl,
    }),
  });
};
