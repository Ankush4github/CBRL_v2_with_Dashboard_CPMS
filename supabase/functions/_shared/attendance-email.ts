/**
 * The attendance reminder email, and the copy behind it.
 *
 * Shared by the two functions that send one: attendance-notifications, which
 * pg_cron drives, and send-test-attendance-email, which the "Test email"
 * button calls. They had drifted into two different designs for the same
 * system — the test used the public site's teal on a soft card, the worker used
 * the CPMS theme — so a clinician's test mail looked nothing like the reminder
 * it was meant to be proving. One template settles that.
 *
 * The palette is [data-app="cpms"] in src/app/globals.css, converted from HSL:
 *
 *   --primary          168 76% 36%   #16A186   teal
 *   --foreground       222 47% 11%   #0F172A   ink
 *   --background       210 20% 98%   #F8FAFC   paper
 *   --muted-foreground 215 16% 47%   #64748B
 *   --border           214 32% 91%   #E2E8F0
 *   --warning           38 92% 50%   #F49F0A   final reminders
 *   --shadow-md        8px 8px 0 0 #000000     hard, unblurred
 *
 * Sharp corners and hard black shadows are the CPMS look, not an accident:
 * every --shadow-* token in that block has a zero blur radius. Space Grotesk
 * is the app's typeface and is named first, but no email client will have it,
 * so the stack falls through to the same system fonts the app does.
 */

export const ATTENDANCE_EVENTS = [
  "shift_start",
  "checkin_reminder",
  "checkin_final_reminder",
  "shift_end",
  "checkout_reminder",
  "checkout_final_reminder",
] as const;

export type AttendanceEvent = (typeof ATTENDANCE_EVENTS)[number];

export function isAttendanceEvent(value: unknown): value is AttendanceEvent {
  return typeof value === "string" &&
    (ATTENDANCE_EVENTS as readonly string[]).includes(value);
}

/**
 * One entry per notification_type value. `title` and `message` are what the
 * notifications row and the push payload carry; `subject` and `body` are the
 * longer forms the email uses. Keeping them together is the point — the push a
 * clinician taps and the mail they open should not say different things.
 *
 * `urgent` moves the accent to amber and is set on the two final reminders:
 * the last thing sent before a shift is recorded as missed, or an attendance
 * record is left open for an administrator to close.
 */
export const ATTENDANCE_COPY: Record<AttendanceEvent, {
  title: string;
  message: (deadline: string) => string;
  subject: string;
  heading: string;
  body: (deadline: string) => string;
  urgent: boolean;
}> = {
  shift_start: {
    title: "Shift started",
    message: (d) => `Your shift has started. Please check in before ${d}.`,
    subject: "Attendance reminder – check in required",
    heading: "Your shift has started",
    body: (d) =>
      `Your working day has started. Please check in through the attendance screen before ${d} to mark your attendance. Check-in records where you are, so it has to be done on site.`,
    urgent: false,
  },
  checkin_reminder: {
    title: "Check-in reminder",
    message: () => "You haven't checked in yet. Please check in soon.",
    subject: "Attendance reminder – you have not checked in",
    heading: "You have not checked in yet",
    body: (d) =>
      `Your shift has started and there is no check-in against your name. Open the attendance screen and check in before ${d}.`,
    urgent: false,
  },
  checkin_final_reminder: {
    title: "Final check-in reminder",
    message: (d) => `Last reminder — check in before ${d} to avoid being marked late.`,
    subject: "Final reminder – check in required",
    heading: "Last reminder to check in",
    body: (d) =>
      `This is the final reminder for this shift. Without a check-in before ${d}, the shift is recorded as missed.`,
    urgent: true,
  },
  shift_end: {
    title: "Shift ended",
    message: (d) => `Your shift has ended. Don't forget to check out before ${d}.`,
    subject: "Attendance reminder – check out required",
    heading: "Your shift has ended",
    body: (d) =>
      `Your working hours have ended. Please check out through the attendance screen before ${d}. A shift with no check-out stays open and has to be corrected by an administrator.`,
    urgent: false,
  },
  checkout_reminder: {
    title: "Check-out reminder",
    message: () => "You haven't checked out yet. Please check out.",
    subject: "Attendance reminder – you have not checked out",
    heading: "You have not checked out",
    body: (d) =>
      `Your shift has ended and your attendance record is still open. Open the attendance screen and check out before ${d}.`,
    urgent: false,
  },
  checkout_final_reminder: {
    title: "Final check-out reminder",
    message: (d) => `Last reminder — check out before ${d}.`,
    subject: "Final reminder – check out required",
    heading: "Last reminder to check out",
    body: (d) =>
      `This is the final reminder for this shift. An attendance record left open past ${d} has to be closed by an administrator.`,
    urgent: true,
  },
};

export interface AttendanceEmailInput {
  event: AttendanceEvent;
  /** From profiles.full_name. Null falls back to a plain greeting. */
  recipientName?: string | null;
  /** Every hospital the account is assigned to that is open today. */
  hospitals?: string[];
  /** Rendered deadline, e.g. "09:00 AM IST". Drives the copy, so it is required. */
  deadline: string;
  /** Optional extra rows, used by the test mail where the shift is the subject. */
  workingHours?: string | null;
  workingDays?: string | null;
  /** Deep-link base including the /cpms sub-path. Without it the button is dropped. */
  appUrl?: string | null;
  /** Marks the subject so a test is never mistaken for the real thing. */
  isTest?: boolean;
}

export interface AttendanceEmail {
  subject: string;
  html: string;
  text: string;
}

const TEAL = "#16A186";
const INK = "#0F172A";
const PAPER = "#F8FAFC";
const CARD = "#FFFFFF";
const MUTED = "#64748B";
const AMBER = "#F49F0A";
const SHADOW = "#000000";

const FONT_STACK =
  "'Space Grotesk',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The reminder, as both HTML and plain text.
 *
 * The text part is not optional padding: a message sent with no text/plain
 * alternative scores worse with spam filters, and these have to arrive.
 */
export function buildAttendanceEmail(input: AttendanceEmailInput): AttendanceEmail {
  const copy = ATTENDANCE_COPY[input.event];
  const accent = copy.urgent ? AMBER : TEAL;
  const hospitals = input.hospitals ?? [];
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : "Hi,";
  const body = copy.body(input.deadline);
  const subject = input.isTest ? `[Test] ${copy.subject}` : copy.subject;
  const link = input.appUrl ? `${input.appUrl.replace(/\/+$/, "")}/attendance` : null;

  // Rows are dropped rather than shown empty. A master account holds no
  // assignment and reaches every hospital, so there is nothing to name.
  const facts: Array<[string, string]> = [["Deadline", input.deadline]];
  if (hospitals.length) {
    facts.unshift([hospitals.length > 1 ? "Hospitals" : "Hospital", hospitals.join(", ")]);
  }
  if (input.workingHours) facts.push(["Working hours", input.workingHours]);
  if (input.workingDays) facts.push(["Working days", input.workingDays]);

  const text = [
    greeting,
    "",
    body,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    ...(hospitals.length > 1
      ? ["", "You can mark your attendance from any of these hospitals."]
      : []),
    ...(link ? ["", `Open attendance: ${link}`] : []),
    "",
    "This is an automated reminder — no action is needed if you have already",
    "completed this step.",
    "",
    "— CBRL Clinical Patient Management System",
  ].join("\n");

  const factRows = facts
    .map(([label, value]) => `
              <tr>
                <td style="padding:5px 18px 5px 0;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${INK};white-space:nowrap;vertical-align:top;">${
    escapeHtml(label)
  }</td>
                <td style="padding:5px 0;font-size:14px;line-height:1.5;color:${MUTED};">${
    escapeHtml(value)
  }</td>
              </tr>`)
    .join("");

  const multiHospitalNote = hospitals.length > 1
    ? `<p style="margin:10px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">You can mark your attendance from any of these hospitals.</p>`
    : "";

  const linkBlock = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;">
            <tr>
              <td style="background:${accent};border:2px solid ${INK};box-shadow:4px 4px 0 0 ${SHADOW};">
                <a href="${
      escapeHtml(link)
    }" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#ffffff;text-decoration:none;">Open attendance &rarr;</a>
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
                <span style="display:inline-block;padding:6px 12px;background:${INK};color:#ffffff;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;border:2px solid ${INK};box-shadow:4px 4px 0 0 ${accent};">CPMS${
    input.isTest ? " &middot; Test" : ""
  }</span>
              </td>
            </tr>
            <tr>
              <td style="background:${CARD};border:2px solid ${INK};box-shadow:8px 8px 0 0 ${SHADOW};padding:36px 32px;">
                <div style="width:40px;height:4px;background:${accent};margin-bottom:20px;font-size:0;line-height:0;">&nbsp;</div>
                <h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.5px;color:${INK};">${
    escapeHtml(copy.heading)
  }</h1>
                <p style="margin:0 0 12px;font-size:15px;color:${INK};">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 4px;font-size:15px;line-height:1.6;color:${MUTED};">${
    escapeHtml(body)
  }</p>
                ${linkBlock}
                <div style="margin-top:28px;padding:16px 18px;background:${PAPER};border:2px solid ${INK};">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${factRows}
                  </table>
                  ${multiHospitalNote}
                </div>
                <p style="margin:24px 0 0;padding-top:20px;border-top:2px solid ${PAPER};font-size:12px;line-height:1.5;color:${MUTED};">
                  This is an automated reminder &mdash; no action is needed if you have already completed this step.
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
