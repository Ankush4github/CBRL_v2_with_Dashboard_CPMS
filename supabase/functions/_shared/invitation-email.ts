/**
 * The staff invitation email.
 *
 * Same look as the attendance reminders (_shared/attendance-email.ts): the
 * CPMS palette, sharp corners and hard shadows. The colours are repeated here
 * rather than imported because that file keeps them private to its template.
 *
 * The one thing this email must get across is the address rule: the
 * invitation is matched on the exact Google address it was sent to, so signing
 * in with any other account silently turns them into an ordinary uninvited
 * signup.
 */

const TEAL = "#16A186";
const INK = "#0F172A";
const PAPER = "#F8FAFC";
const CARD = "#FFFFFF";
const MUTED = "#64748B";
const SHADOW = "#000000";
const FONT_STACK =
  "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface InvitationEmailInput {
  email: string;
  /** "Administrator" or "User (Standard Staff)". */
  roleLabel: string;
  hospitals: string[];
  inviterName: string | null;
  /** CPMS sign-in URL, including its base path. Null leaves the button out. */
  appUrl: string | null;
  /** Already formatted for display, e.g. "27 October 2026". Null if unknown. */
  expiresOn: string | null;
}

export function buildInvitationEmail(input: InvitationEmailInput): { subject: string; html: string; text: string } {
  const subject = "You're invited to CBRL CPMS";
  const inviter = input.inviterName ? `${input.inviterName} has` : "An administrator has";
  const link = input.appUrl ? input.appUrl.replace(/\/+$/, "") : null;

  const facts: Array<[string, string]> = [
    ["Sign in with", input.email],
    ["Role", input.roleLabel],
    [input.hospitals.length > 1 ? "Hospitals" : "Hospital", input.hospitals.join(", ")],
  ];
  if (input.expiresOn) facts.push(["Invitation valid until", input.expiresOn]);

  const steps = [
    `Open CPMS${link ? "" : " (ask your administrator for the link)"} and choose "Sign in with Google".`,
    `Use the Google account ${input.email} - exactly this address. Signing in with any other account will not pick up this invitation.`,
    "You will see a \"Pending activation\" screen. An administrator will switch your account on shortly after.",
  ];

  const text = [
    "Hi,",
    "",
    `${inviter} invited you to the CBRL Clinical Patient Management System (CPMS).`,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    "To get started:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    ...(link ? ["", `Open CPMS: ${link}`] : []),
    "",
    "If you were not expecting this, you can ignore this email.",
    "",
    "— CBRL Clinical Patient Management System",
  ].join("\n");

  const factRows = facts
    .map(([label, value]) => `
              <tr>
                <td style="padding:5px 18px 5px 0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${INK};white-space:nowrap;vertical-align:top;">${
      escapeHtml(label)
    }</td>
                <td style="padding:5px 0;font-size:14px;line-height:1.5;color:${MUTED};word-break:break-all;">${
      escapeHtml(value)
    }</td>
              </tr>`)
    .join("");

  const stepItems = steps
    .map((s) => `<li style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(s)}</li>`)
    .join("");

  const linkBlock = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr>
              <td style="background:${TEAL};border:2px solid ${INK};box-shadow:4px 4px 0 0 ${SHADOW};">
                <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;">Open CPMS &rarr;</a>
              </td>
            </tr>
          </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:${PAPER};font-family:${FONT_STACK};color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:collapse;">
            <tr>
              <td style="padding-bottom:20px;">
                <span style="display:inline-block;padding:6px 12px;background:${INK};color:#ffffff;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;border:2px solid ${INK};box-shadow:4px 4px 0 0 ${TEAL};">CPMS</span>
              </td>
            </tr>
            <tr>
              <td style="background:${CARD};border:2px solid ${INK};box-shadow:8px 8px 0 0 ${SHADOW};padding:36px 32px;">
                <div style="width:40px;height:4px;background:${TEAL};margin-bottom:20px;font-size:0;line-height:0;">&nbsp;</div>
                <h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.5px;color:${INK};">You&rsquo;re invited to CPMS</h1>
                <p style="margin:0 0 12px;font-size:15px;color:${INK};">Hi,</p>
                <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:${MUTED};">${
    escapeHtml(`${inviter} invited you to the CBRL Clinical Patient Management System.`)
  }</p>
                <div style="margin-top:24px;padding:16px 18px;background:${PAPER};border:2px solid ${INK};">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${factRows}
                  </table>
                </div>
                <h2 style="margin:28px 0 10px;font-size:15px;font-weight:700;color:${INK};">To get started</h2>
                <ol style="margin:0;padding-left:20px;">${stepItems}</ol>
                ${linkBlock}
                <p style="margin:24px 0 0;padding-top:20px;border-top:2px solid ${PAPER};font-size:12px;line-height:1.5;color:${MUTED};">
                  If you were not expecting this, you can ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;font-size:11px;letter-spacing:0.5px;color:${MUTED};">
                CPMS &middot; CBRL Clinical Patient Management System
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
