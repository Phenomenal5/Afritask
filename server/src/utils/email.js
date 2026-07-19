import { BrevoClient } from "@getbrevo/brevo";
import { emailTemplate, escapeHtml } from "./emailTemplates.js";
import logger from "./logger.js";

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

const emailService = {
  sendEmail: async ({ to, subject, text, html }) => {
    await brevo.transactionalEmails.sendTransacEmail({
      to: [{ email: to }],
      sender: {
        name: process.env.EMAIL_FROM_NAME || "AfriTask",
        email: process.env.EMAIL_FROM_ADDRESS,
      },
      subject,
      textContent: text,
      htmlContent: html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  },
};

const formatTaskDeadline = (deadline) => {
  if (!deadline) {
    return "No deadline set";
  }

  const parsed = new Date(deadline);
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

const buildTaskReminderMessage = (task) => {
  const title = escapeHtml(task?.title || "Untitled task");
  const deadline = escapeHtml(formatTaskDeadline(task?.deadline));
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

export const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

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

export const sendEmailVerificationCode = async (to, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;

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

export const sendWelcomeEmail = async (to, name = "there") => {
  const dashboardUrl = `${process.env.FRONTEND_URL}`;

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

export const sendPasswordChangedEmail = async (to) => {
  const dashboardUrl = `${process.env.FRONTEND_URL}`;

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

export const sendTaskReminderEmail = async (to, task) => {
  const deadline = formatTaskDeadline(task?.deadline);
  const taskTitle = task?.title || "Untitled task";
  const dashboardUrl = `${process.env.FRONTEND_URL}`;

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
