/**
 * Attendance notification worker.
 *
 * Invoked by pg_cron with { event: <notification_type> }. One run handles one
 * moment in the shift for every user scheduled today; the six real events are
 * exactly the notification_type enum (20260830120400_notifications.sql).
 *
 * Deployed with verify_jwt = false. The platform's JWT gate cannot authorise
 * pg_cron, which holds no user session, so the gate here is CRON_SECRET. That
 * makes the secret the only thing standing in front of a service-role worker:
 * if it is unset the function refuses every request rather than running open.
 *
 * Secrets, set with `supabase secrets set --project-ref <ref>`:
 *   CRON_SECRET            required. Unset means every call is refused.
 *   RESEND_API_KEY         required for the shift_start / shift_end mails.
 *   VAPID_*                required for push. The pair vapid-public-key serves.
 *   APP_URL                deep-link base including the /cpms sub-path.
 *   ATTENDANCE_EMAIL_FROM  optional sender override, as in the test function.
 */

import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import webpush from "npm:web-push@3.6.7";
import {
  ATTENDANCE_COPY,
  type AttendanceEvent,
  buildAttendanceEmail,
} from "../_shared/attendance-email.ts";

// Defined locally, as in the three sibling functions. There is no `cors`
// subpath on @supabase/supabase-js to import this from.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- IST helpers ----------

/**
 * Today in IST: the date the shift belongs to, plus its ISO weekday.
 *
 * hospitals.work_days is 1-based with Monday at 1 — the convention
 * getIstParts() uses in Attendance.tsx — so the weekday is returned in that
 * form rather than JavaScript's Sunday-at-0.
 */
function istToday(): { date: string; isoWeekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const isoByLabel: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    isoWeekday: isoByLabel[get("weekday")] ?? 0,
  };
}

/** '09:00:00' -> '09:00 AM'. */
function fmt12(t: string | null | undefined, fallback: string): string {
  const hhmm = (t ?? fallback).slice(0, 5);
  const [hStr, m] = hhmm.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${m} ${suffix}`;
}

// ---------- Hospital schedule ----------

interface HospitalSchedule {
  /** ISO weekdays this hospital operates, Monday at 1. */
  workDays: number[];
  /** Check-in is due by the start of the working day, check-out by its end. */
  checkInBy: string;
  checkOutBy: string;
}

/**
 * There are no checkin_deadline / checkout_deadline columns on `hospitals`.
 * What it stores is work_days plus work_start_time and work_end_time, which
 * send-test-attendance-email renders as "Working hours". The deadlines are
 * read off those: in by the start of the day, out by its end.
 */
async function loadSchedules(admin: any): Promise<Map<string, HospitalSchedule>> {
  const { data, error } = await admin
    .from("hospitals")
    .select("name, work_days, work_start_time, work_end_time");
  if (error) throw error;
  const map = new Map<string, HospitalSchedule>();
  for (const h of data ?? []) {
    map.set(h.name, {
      workDays: Array.isArray(h.work_days) ? h.work_days : [1, 2, 3, 4, 5],
      checkInBy: fmt12(h.work_start_time, "09:00"),
      checkOutBy: fmt12(h.work_end_time, "17:00"),
    });
  }
  return map;
}

/**
 * The deadline shown to a user. One hospital, or several that agree, reads as
 * a single time; genuinely different times are named per hospital, so the text
 * cannot state a deadline that applies to only one of them.
 */
function deadlineFor(
  hospitals: string[],
  schedules: Map<string, HospitalSchedule>,
  kind: "in" | "out",
): string {
  const pick = (h: string) => {
    const s = schedules.get(h);
    return s ? (kind === "in" ? s.checkInBy : s.checkOutBy) : null;
  };
  const values = Array.from(new Set(hospitals.map(pick).filter(Boolean) as string[]));
  if (values.length === 0) return kind === "in" ? "09:00 AM IST" : "05:00 PM IST";
  if (values.length === 1) return `${values[0]} IST`;
  return hospitals
    .map((h) => {
      const v = pick(h);
      return v ? `${h}: ${v} IST` : null;
    })
    .filter(Boolean)
    .join(" · ");
}

// ---------- Events ----------

/**
 * `absence_cutoff` is not a notification_type value and has no copy: it reports
 * a count and writes nothing. Keeping it out of AttendanceEvent is what stops
 * it ever reaching an insert.
 */
type EventKey = AttendanceEvent | "absence_cutoff";

// ---------- Delivery ----------

interface Config {
  supabaseUrl: string;
  serviceRole: string;
  resendApiKey: string | null;
  appUrl: string | null;
  emailFrom: string;
  cronSecret: string;
  vapid: { subject: string; publicKey: string; privateKey: string } | null;
}

async function sendEmail(
  cfg: Config,
  to: string,
  email: { subject: string; html: string; text: string },
): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.emailFrom,
      to: [to],
      subject: email.subject,
      html: email.html,
      // Sent with both parts: a message with no text/plain alternative scores
      // worse with spam filters, and these have to arrive.
      text: email.text,
    }),
  });
  if (!res.ok) {
    // The body names the sending account, so it stays in the logs.
    console.error(
      `[attendance-notifications] Resend rejected the send: ${res.status} ${await res.text()}`,
    );
    return false;
  }
  return true;
}

async function sendPush(
  admin: any,
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: object,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: any) {
    const status = err?.statusCode;
    // 404/410 is the push service saying this subscription is gone for good.
    // Anything else may be transient, so the row is left alone.
    if (status === 404 || status === 410) {
      await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    } else {
      console.error("[attendance-notifications] Push error", status, err?.body ?? err?.message);
    }
    return false;
  }
}

// ---------- Recipients ----------

interface Recipient {
  id: string;
  email: string | null;
  full_name: string | null;
  hospitals: string[];
}

/**
 * Everyone assigned to a hospital that operates today, whose account is
 * enabled.
 *
 * The enabled check is the gate send-test-attendance-email applies before
 * spending the Resend quota: a signup nobody has approved yet holds a profile
 * and can hold an assignment, and must not be mailed as though they were staff.
 */
async function getScheduledUsers(
  admin: any,
  isoWeekday: number,
  schedules: Map<string, HospitalSchedule>,
): Promise<Recipient[]> {
  const { data: assignments, error } = await admin
    .from("hospital_assignments")
    .select("user_id, hospital");
  if (error) throw error;

  const byUser = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    if (!a.hospital) continue;
    // A hospital closed today contributes nothing; the user is scheduled only
    // if at least one hospital they are assigned to operates.
    if (!schedules.get(a.hospital)?.workDays.includes(isoWeekday)) continue;
    const list = byUser.get(a.user_id) ?? [];
    if (!list.includes(a.hospital)) list.push(a.hospital);
    byUser.set(a.user_id, list);
  }

  const ids = Array.from(byUser.keys());
  if (!ids.length) return [];

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids);
  if (pErr) throw pErr;

  const checked = await Promise.all(
    (profiles ?? []).map(async (p: any) => {
      const { data, error: rpcErr } = await admin.rpc("user_is_enabled", { _user_id: p.id });
      if (rpcErr) {
        console.error(
          "[attendance-notifications] user_is_enabled failed for",
          p.id,
          rpcErr.message,
        );
        return null;
      }
      return data ? p : null;
    }),
  );

  return checked
    .filter((p: any) => p !== null && !!p.email)
    .map((p: any) => ({ ...p, hospitals: (byUser.get(p.id) ?? []).slice().sort() }));
}

/** The IST day as a half-open range, so a 23:59:59 check-in is not dropped. */
function istDayRange(date: string): { start: string; end: string } {
  const next = new Date(`${date}T00:00:00+05:30`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start: `${date}T00:00:00+05:30`, end: next.toISOString() };
}

async function getUsersMissingCheckIn(
  admin: any,
  date: string,
  scheduled: Recipient[],
): Promise<Recipient[]> {
  if (!scheduled.length) return [];
  const { start, end } = istDayRange(date);
  const { data, error } = await admin
    .from("attendance_records")
    .select("user_id")
    .gte("check_in_at", start)
    .lt("check_in_at", end)
    .in("user_id", scheduled.map((u) => u.id));
  if (error) throw error;
  const checked = new Set((data ?? []).map((r: any) => r.user_id));
  return scheduled.filter((u) => !checked.has(u.id));
}

async function getUsersMissingCheckOut(
  admin: any,
  date: string,
  scheduled: Recipient[],
): Promise<Recipient[]> {
  if (!scheduled.length) return [];
  const { start, end } = istDayRange(date);
  const { data, error } = await admin
    .from("attendance_records")
    .select("user_id, check_out_at")
    .gte("check_in_at", start)
    .lt("check_in_at", end)
    .in("user_id", scheduled.map((u) => u.id));
  if (error) throw error;
  // Any row still open leaves the user open, whatever their other rows say.
  const open = new Set(
    (data ?? []).filter((r: any) => !r.check_out_at).map((r: any) => r.user_id),
  );
  return scheduled.filter((u) => open.has(u.id));
}

// ---------- Config ----------

/**
 * Read once per request rather than at module scope. A missing secret then
 * produces a 500 that names it, instead of a boot-time crash on a bare `!`
 * whose only trace is an unhelpful module-evaluation error.
 */
function readConfig(): { config?: Config; missing?: string[] } {
  const env = (k: string) => Deno.env.get(k)?.trim() || null;
  const supabaseUrl = env("SUPABASE_URL");
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SECRET_KEY");
  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRole) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) return { missing };

  const pub = env("VAPID_PUBLIC_KEY");
  const priv = env("VAPID_PRIVATE_KEY");
  return {
    config: {
      supabaseUrl: supabaseUrl!,
      serviceRole: serviceRole!,
      resendApiKey: env("RESEND_API_KEY"),
      appUrl: env("APP_URL"),
      emailFrom: env("ATTENDANCE_EMAIL_FROM") ?? "CPMS <cpms@mail.cbrliitkgp.online>",
      cronSecret: env("CRON_SECRET") ?? "",
      vapid: pub && priv
        ? {
          subject: env("VAPID_SUBJECT") ?? "mailto:cpms@cbrliitkgp.online",
          publicKey: pub,
          privateKey: priv,
        }
        : null,
    },
  };
}

/** Length-independent comparison, so the secret cannot be probed byte by byte. */
function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

// ---------- Dispatcher ----------

async function dispatch(cfg: Config, admin: any, event: EventKey) {
  const { date, isoWeekday } = istToday();
  const schedules = await loadSchedules(admin);
  const scheduled = await getScheduledUsers(admin, isoWeekday, schedules);

  if (!scheduled.length) {
    // No hospital operates today, or nobody enabled is assigned to one that does.
    return { event, date, iso_weekday: isoWeekday, skipped: "nobody scheduled" };
  }

  if (event === "absence_cutoff") {
    // Reports only. `absence_cutoff` is not a notification_type value, so it
    // must not insert; absence is implicit in the lack of an attendance row.
    const missing = await getUsersMissingCheckIn(admin, date, scheduled);
    return { event, date, absent_count: missing.length, writes: "none" };
  }

  let recipients: Recipient[];
  switch (event) {
    case "shift_start":
      recipients = scheduled;
      break;
    case "checkin_reminder":
    case "checkin_final_reminder":
      recipients = await getUsersMissingCheckIn(admin, date, scheduled);
      break;
    default:
      recipients = await getUsersMissingCheckOut(admin, date, scheduled);
      break;
  }

  const copy = ATTENDANCE_COPY[event];
  const isCheckIn = event === "shift_start" ||
    event === "checkin_reminder" ||
    event === "checkin_final_reminder";
  // Only the two bracketing events mail. The four chasing reminders are push
  // and an in-app notification, so a missed check-in does not fill an inbox.
  const emailThisEvent = event === "shift_start" || event === "shift_end";

  let sent = 0, dedup = 0, pushed = 0, emailed = 0;

  for (const u of recipients) {
    const deadline = deadlineFor(u.hospitals, schedules, isCheckIn ? "in" : "out");
    const message = copy.message(deadline);

    // Idempotency rests on the unique index over
    // (user_id, notification_type, event_date): a second run for the same
    // shift moment collides and is counted as a duplicate rather than
    // re-delivered. 23505 is the only code that means that — anything else is
    // a real failure and must not be swallowed as one.
    const { data: inserted, error: insErr } = await admin
      .from("notifications")
      .insert({
        user_id: u.id,
        title: copy.title,
        message,
        notification_type: event,
        event_date: date,
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      if (insErr.code === "23505") {
        dedup++;
        continue;
      }
      console.error("[attendance-notifications] notification insert failed", insErr);
      continue;
    }
    if (!inserted) {
      dedup++;
      continue;
    }
    sent++;

    if (cfg.vapid) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", u.id);
      const results = await Promise.all(
        (subs ?? []).map((s: any) =>
          sendPush(admin, s, {
            title: copy.title,
            body: message,
            url: `${(cfg.appUrl ?? "").replace(/\/+$/, "")}/attendance`,
            tag: `${event}-${date}`,
          })
        ),
      );
      pushed += results.filter(Boolean).length;
    }

    if (emailThisEvent && u.email && cfg.resendApiKey) {
      const ok = await sendEmail(
        cfg,
        u.email,
        buildAttendanceEmail({
          event,
          recipientName: u.full_name,
          hospitals: u.hospitals,
          deadline,
          appUrl: cfg.appUrl,
        }),
      );
      if (ok) emailed++;
    }
  }

  return { event, date, total_recipients: recipients.length, sent, dedup, pushed, emailed };
}

const VALID_EVENTS: EventKey[] = [
  "shift_start",
  "checkin_reminder",
  "checkin_final_reminder",
  "shift_end",
  "checkout_reminder",
  "checkout_final_reminder",
  "absence_cutoff",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { config, missing } = readConfig();
    if (!config) {
      console.error("[attendance-notifications] missing configuration:", missing?.join(", "));
      return json({ error: "Service configuration error" }, 500);
    }

    // Checked before anything else runs. An unset CRON_SECRET closes the
    // function rather than opening it — this endpoint holds service role.
    // x-cron-secret only, as ops-alerts and sweep-orphan-uploads take it.
    // Accepting it as a Bearer token too invited callers to put the secret
    // in Authorization, which gateways and tooling are far likelier to log.
    // The pg_cron caller (private.invoke_attendance_notifications) sends
    // x-cron-secret.
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (!config.cronSecret || !secretsMatch(provided, config.cronSecret)) {
      if (!config.cronSecret) {
        console.error(
          "[attendance-notifications] CRON_SECRET is not set; refusing every request",
        );
      }
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const event = body?.event as EventKey;
    if (!VALID_EVENTS.includes(event)) {
      return json({ error: `invalid event. Expected one of: ${VALID_EVENTS.join(", ")}` }, 400);
    }

    if (!config.appUrl) {
      console.warn(
        "[attendance-notifications] APP_URL is not set; deep links will be broken",
      );
    }

    if (config.vapid) {
      webpush.setVapidDetails(
        config.vapid.subject,
        config.vapid.publicKey,
        config.vapid.privateKey,
      );
    } else {
      console.warn("[attendance-notifications] VAPID keys absent; sending email only");
    }

    const admin = createClient(config.supabaseUrl, config.serviceRole, {
      auth: { persistSession: false },
    });

    return json(await dispatch(config, admin, event));
  } catch (e: any) {
    console.error("[attendance-notifications] Unhandled error:", e);
    // The real reason is in the log line above; the response, which lands
    // in net._http_response, does not need Postgres's wording.
    return json({ error: "Internal error" }, 500);
  }
});
