/**
 * The attendance reminder email, sent to the caller on demand.
 *
 * `notification_type` (20260830120400_notifications.sql) names six moments in a
 * shift: the two that bracket it, and the four reminders that chase a missing
 * check-in or check-out. This function renders any one of them and mails it to
 * the signed-in account. That is what the "Test email" button on the attendance
 * screen calls — it proves the whole path (Resend key, sender domain, template,
 * deep link) works before anyone relies on the scheduled reminders.
 *
 * The template itself lives in ../_shared/attendance-email.ts, which
 * attendance-notifications also uses. That is the point of the test: a mail
 * that looked different from the real reminder would prove very little.
 *
 * It only ever mails the caller. There is no recipient field in the request
 * body; the address comes from the verified JWT, so this cannot be turned into
 * a way to send mail to somebody else.
 *
 * Secrets, set with `supabase secrets set --project-ref <ref>`:
 *   RESEND_API_KEY         required.
 *   APP_URL                the deep-link base, including the /cpms sub-path.
 *                          Without it the mail still sends, minus its button.
 *   ATTENDANCE_EMAIL_FROM  optional override for the sender. The default below
 *                          is the project's own address; mail.cbrliitkgp.online
 *                          has to stay verified in Resend, or every send is
 *                          refused with a 403 that shows up in the logs.
 */

import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  ATTENDANCE_EVENTS,
  buildAttendanceEmail,
  isAttendanceEvent,
} from "../_shared/attendance-email.ts";

// Defined locally, as in the sibling functions. There is no `cors` subpath on
// @supabase/supabase-js to import this from.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** '09:00:00' -> '09:00 AM'. Every stored time is IST. */
function fmt12(t: string | null | undefined, fallback: string): string {
  const hhmm = (t ?? fallback).slice(0, 5);
  const [hStr, m] = hhmm.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${m} ${suffix}`;
}

/** work_days is 1-based with Monday at 1, matching getIstParts() in Attendance.tsx. */
function dayNames(days: number[] | null): string | null {
  if (!days || days.length === 0) return null;
  const names = days.map((d) => DAY_LABELS[d - 1]).filter(Boolean);
  return names.length ? names.join(", ") : null;
}

/**
 * Best-effort cooldown, one minute per account.
 *
 * Edge Functions run as more than one short-lived instance, so this is not a
 * guarantee and is not meant as a security control — the mail only ever goes to
 * the caller's own inbox. It is here so a stuck button, or a double click on a
 * slow connection, does not spend the Resend quota twice.
 */
const COOLDOWN_MS = 60_000;
const lastSentAt = new Map<string, number>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const env = (k: string) => Deno.env.get(k)?.trim() || null;
    const supabaseUrl = env("SUPABASE_URL");
    // The publishable key replaces the anon key; the platform still injects the
    // old name, so read the new one first and fall back.
    const supabaseAnonKey = env("SUPABASE_PUBLISHABLE_KEY") ?? env("SUPABASE_ANON_KEY");
    const resendApiKey = env("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[send-test-attendance-email] Missing Supabase configuration");
      return json({ error: "Service configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);

    // Scoped to the caller's own JWT rather than the service role: this
    // function has no reason to reach past the person who invoked it.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Invalid authentication" }, 401);

    // The same gate every clinical policy uses. A signup nobody has approved
    // yet can reach this screen, and should not be able to spend the quota.
    const { data: enabled, error: enabledError } = await supabase.rpc("user_is_enabled", {
      _user_id: user.id,
    });
    if (enabledError || !enabled) {
      return json({ error: "Your account is not enabled for attendance." }, 403);
    }

    if (!resendApiKey) {
      // Checked after the caller is known, not with the Supabase config above:
      // whether this project can send email is not something an anonymous
      // caller holding only the publishable key should be able to probe. It is
      // still the check an operator forgets — the function deploys without the
      // secret and fails here.
      console.error("[send-test-attendance-email] RESEND_API_KEY is not set");
      return json({ error: "Email sending is not configured on this project." }, 500);
    }

    const previous = lastSentAt.get(user.id);
    if (previous && Date.now() - previous < COOLDOWN_MS) {
      return json(
        { error: "A test email was just sent. Please wait a minute before trying again." },
        429,
      );
    }

    // An empty body is fine — the button sends one, a curl by hand may not.
    let payload: Record<string, unknown> = {};
    try {
      const raw = await req.text();
      if (raw) payload = JSON.parse(raw);
    } catch {
      return json({ error: "Request body must be JSON." }, 400);
    }

    const event = payload.event === undefined ? "shift_start" : payload.event;
    if (!isAttendanceEvent(event)) {
      return json({ error: `Unknown event. Expected one of: ${ATTENDANCE_EVENTS.join(", ")}.` }, 400);
    }

    // The JWT's email is the delivery address. profiles.email is only a
    // fallback for an account created before that column was populated.
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const recipient = user.email ?? profile?.email ?? null;
    if (!recipient) return json({ error: "Your account has no email address to send to." }, 400);

    // Whichever hospitals the account is assigned to, for the shift details in
    // the body. A master holds no assignments and reaches every hospital, so
    // there is nothing to name — the mail drops those rows and still sends.
    const { data: assignments } = await supabase
      .from("hospital_assignments")
      .select("hospital")
      .eq("user_id", user.id);
    const hospitals = Array.from(
      new Set((assignments ?? []).map((a) => a.hospital).filter(Boolean) as string[]),
    ).sort();

    const isCheckIn = event === "shift_start" ||
      event === "checkin_reminder" ||
      event === "checkin_final_reminder";

    // The deadline is the hospital's checkin_deadline / checkout_deadline, or,
    // when that is empty, the start / end of its working day -- the same rule
    // attendance-notifications uses.
    let deadline = isCheckIn ? "09:00 AM IST" : "05:00 PM IST";
    let workingHours: string | null = null;
    let workingDays: string | null = null;

    if (hospitals.length) {
      const { data: rows, error: hErr } = await supabase
        .from("hospitals")
        .select("name, work_days, work_start_time, work_end_time, checkin_deadline, checkout_deadline")
        .in("name", hospitals);
      if (hErr) {
        console.error("[send-test-attendance-email] hospitals lookup failed:", hErr.message);
      }
      const entries = (rows ?? []).map((r) => ({
        name: r.name as string,
        value: fmt12(
          isCheckIn
            ? r.checkin_deadline ?? r.work_start_time
            : r.checkout_deadline ?? r.work_end_time,
          isCheckIn ? "09:00" : "17:00",
        ),
      }));
      const unique = Array.from(new Set(entries.map((e) => e.value)));
      if (unique.length === 1) deadline = `${unique[0]} IST`;
      else if (unique.length > 1) {
        deadline = entries.map((e) => `${e.name}: ${e.value} IST`).join(" · ");
      }

      // The shift itself, shown only when every assigned hospital agrees on it.
      const first = rows?.[0];
      if (first && rows!.length === 1) {
        const start = fmt12(first.work_start_time, "09:00");
        const end = fmt12(first.work_end_time, "17:00");
        workingHours = `${start} – ${end} IST`;
        workingDays = dayNames(first.work_days as number[] | null);
      }
    }

    const email = buildAttendanceEmail({
      event,
      recipientName: profile?.full_name ?? null,
      hospitals,
      deadline,
      workingHours,
      workingDays,
      appUrl: env("APP_URL"),
      isTest: true,
    });

    if (!env("APP_URL")) {
      console.warn("[send-test-attendance-email] APP_URL is not set; sending without a deep link");
    }

    const from = env("ATTENDANCE_EMAIL_FROM") ?? "CPMS <cpms@mail.cbrliitkgp.online>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!response.ok) {
      // Resend explains refusals — an unverified sender domain, a recipient the
      // shared onboarding sender may not write to — in the body. That belongs in
      // the logs, not in the reply: it names the sending account.
      console.error(
        "[send-test-attendance-email] Resend rejected the send:",
        response.status,
        await response.text(),
      );
      return json({ error: "The email could not be sent. Please try again later." }, 502);
    }

    lastSentAt.set(user.id, Date.now());
    return json({ sent_to: recipient, event });
  } catch (error) {
    console.error("[send-test-attendance-email] Unhandled error:", error);
    return json({ error: "Something went wrong sending the email." }, 500);
  }
});
