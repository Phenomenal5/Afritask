const colors = {
  paper: "#F6F0E7",
  paperRaised: "#FFF9F2",
  ink: "#2A2019",
  inkSoft: "#6A5B4C",
  line: "#E6D7C7",
  moss: "#49644B",
  mossLight: "#DDE8D8",
  mossDark: "#314535",
  clay: "#B55E32",
  clayTint: "#F4E0D3",
  gold: "#B1872E",
  goldTint: "#F4E7BF",
  stone: "#8E8278",
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getLogoUrl = () =>
  process.env.EMAIL_LOGO_URL ||
  process.env.AFRITASK_LOGO_URL ||
  process.env.EMAIL_LOGO ||
  "📝";

export const emailTemplate = ({
  title,
  message,
  buttonText,
  buttonUrl,
  badge,
}) => {
  const year = new Date().getFullYear();
  const logoUrl = getLogoUrl();
  const hasButton = Boolean(buttonText && buttonUrl);
  const hasBadge = Boolean(badge);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="x-ua-compatible" content="ie=edge" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${colors.paper}; font-family:Arial, Helvetica, sans-serif; color:${colors.ink};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${colors.paper}; margin:0; padding:0; width:100%;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; width:100%; margin:0 auto;">
            <tr>
              <td style="background-color:${colors.moss}; border-radius:28px 28px 0 0; padding:28px 32px; text-align:center;">
                ${logoUrl ? `<div style="margin:0 0 12px;"><img src="${escapeHtml(logoUrl)}" alt="AfriTask logo" style="display:block; margin:0 auto; max-width:120px; width:auto; height:auto; border:0; outline:none; text-decoration:none;" /></div>` : ""}
                <div style="font-family:Georgia, 'Times New Roman', serif; font-size:30px; line-height:1.1; font-weight:700; color:${colors.paper}; letter-spacing:0.2px;">AfriTask</div>
                <div style="margin-top:10px; font-size:14px; line-height:1.5; color:${colors.paper}; opacity:0.92;">Organize your work. Focus on what matters.</div>
              </td>
            </tr>
            <tr>
              <td style="background-color:${colors.paperRaised}; border-left:1px solid ${colors.line}; border-right:1px solid ${colors.line}; padding:0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:40px 36px 28px;">
                      ${hasBadge ? `<div style="display:inline-block; background-color:${colors.mossLight}; color:${colors.mossDark}; border:1px solid ${colors.line}; border-radius:999px; padding:8px 14px; font-size:12px; line-height:1; font-weight:700; letter-spacing:0.3px; margin-bottom:18px;">${escapeHtml(badge)}</div>` : ""}
                      <div style="font-family:Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.25; font-weight:700; color:${colors.ink}; margin:0 0 18px;">${escapeHtml(title)}</div>
                      <div style="font-size:16px; line-height:1.7; color:${colors.inkSoft};">
                        ${message}
                      </div>
                      ${hasButton ? `<div style="margin-top:30px; text-align:left;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block; background-color:${colors.clay}; color:${colors.paper}; text-decoration:none; font-size:16px; line-height:1; font-weight:700; padding:16px 26px; border-radius:14px; border:1px solid ${colors.clay};">${escapeHtml(buttonText)}</a></div>` : ""}
                      ${hasButton ? `<div style="margin-top:18px; font-size:14px; line-height:1.6; color:${colors.stone};">If the button doesn't work, copy and paste this link into your browser:<br /><a href="${escapeHtml(buttonUrl)}" style="color:${colors.moss}; word-break:break-all;">${escapeHtml(buttonUrl)}</a></div>` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:${colors.paperRaised}; border:1px solid ${colors.line}; border-top:1px solid ${colors.line}; border-radius:0 0 28px 28px; padding:0 36px 28px;">
                <div style="border-top:1px solid ${colors.line}; padding-top:20px; font-size:13px; line-height:1.7; color:${colors.stone}; text-align:center;">
                  <div>&copy; ${year} AfriTask. All rights reserved.</div>
                  <div style="margin-top:4px;">Built for thoughtful productivity.</div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export { colors, escapeHtml };
