/**
 * Emails the masters when prescription scanning or the nightly upload sweep is
 * failing.
 *
 * Invoked every 30 minutes by pg_cron (private.invoke_ops_alerts, migration
 * 20260927100000). Reads what extract-prescription and sweep-orphan-uploads
 * noted in public.service_failures / public.service_heartbeats, and sends one
 * email listing every problem found -- each problem at most once per 6 hours,
 * via public.ops_alert_log, so an outage produces a few emails, not dozens.
 *
 * Deployed with verify_jwt = false, like the other cron workers: pg_cron has no
 * user session, so CRON_SECRET is the gate in front of the service role.
 *
 * Secrets:
 *   CRON_SECRET            required. Unset means every call is refused.
 *   RESEND_API_KEY         required to send; without it the run only reports.
 *   ATTENDANCE_EMAIL_FROM  optional sender, shared with the attendance mails.
 *   OPS_ALERT_TO           optional comma-separated recipients instead of the
 *                          enabled masters.
 */

import { createClient } from "npm:@supabase/supabase-js@2.111.0";

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

const env = (name: string) => {
  const value = Deno.env.get(name);
  return value && value.trim() !== "" ? value : undefined;
};

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Slightly more than the 30-minute schedule, so a late run misses nothing.
const WINDOW_MINUTES = 35;
const THROTTLE_HOURS = 6;
// The sweep runs daily at 21:30 UTC; a day and two hours without a clean run
// means it has stopped or keeps failing.
const SWEEP_STALE_HOURS = 26;

interface Problem {
  kind: string;
  title: string;
  lines: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = env("CRON_SECRET") ?? "";
  if (!supabaseUrl || !serviceRole) {
    console.error("[ops-alerts] missing Supabase configuration");
    return json({ error: "Service configuration error" }, 500);
  }

  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || !secretsMatch(provided, cronSecret)) {
    if (!cronSecret) console.error("[ops-alerts] CRON_SECRET is not set; refusing every request");
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { data: failures, error: failuresError } = await admin
    .from("service_failures")
    .select("service, kind, detail, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (failuresError) {
    console.error("[ops-alerts] could not read failures:", failuresError.code, failuresError.message);
    return json({ error: "Could not read failures" }, 500);
  }

  const rows = (failures ?? []) as Array<{ service: string; kind: string; detail: string | null; created_at: string }>;
  const of = (service: string, kinds: string[]) =>
    rows.filter((r) => r.service === service && kinds.includes(r.kind));
  const latest = (list: typeof rows) => (list[0]?.detail ?? "").slice(0, 200);

  const problems: Problem[] = [];

  // Any config failure, or repeated key/model refusals: every scan is failing.
  const broken = of("extract-prescription", ["config"]);
  const refused = of("extract-prescription", ["model"]);
  if (broken.length > 0 || refused.length >= 2) {
    const list = broken.length > 0 ? broken : refused;
    problems.push({
      kind: "extract-broken",
      title: "Prescription scanning is failing for everyone",
      lines: [
        `${broken.length + refused.length} scan(s) failed in the last ${WINDOW_MINUTES} minutes because of the AI setup.`,
        `Latest reason: ${latest(list) || "(none recorded)"}`,
        "Check the GEMINI_API_KEY, GEMINI_MODEL and GEMINI_FALLBACK_MODEL secrets in Supabase.",
      ],
    });
  }

  // Many ordinary failures at once: Gemini overloaded, or replies unusable.
  const degraded = of("extract-prescription", ["busy", "parse", "rejected", "error"]);
  if (degraded.length >= 5) {
    const counts = degraded.reduce<Record<string, number>>((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1;
      return acc;
    }, {});
    problems.push({
      kind: "extract-degraded",
      title: "Many prescription scans are failing",
      lines: [
        `${degraded.length} scans failed in the last ${WINDOW_MINUTES} minutes (${
          Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(", ")
        }).`,
        `Latest reason: ${latest(degraded) || "(none recorded)"}`,
        "\"busy\" usually means Google's AI is overloaded and passes on its own; the others are worth a look in the extract-prescription logs.",
      ],
    });
  }

  const sweepFailed = of("sweep-orphan-uploads", ["list", "remove"]);
  if (sweepFailed.length > 0) {
    problems.push({
      kind: "sweep-failed",
      title: "The nightly file cleanup failed",
      lines: [
        `Reason: ${latest(sweepFailed) || "(none recorded)"}`,
        "Check the sweep-orphan-uploads logs in Supabase. Patient records are not affected.",
      ],
    });
  }

  // Only once a heartbeat exists: before its first run there is nothing to miss.
  const { data: beat } = await admin
    .from("service_heartbeats")
    .select("last_ok_at")
    .eq("service", "sweep-orphan-uploads")
    .maybeSingle();
  if (beat?.last_ok_at && Date.now() - Date.parse(beat.last_ok_at) > SWEEP_STALE_HOURS * 3_600_000) {
    problems.push({
      kind: "sweep-stale",
      title: "The nightly file cleanup has not run",
      lines: [
        `Last successful run: ${new Date(beat.last_ok_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.`,
        "Check that the sweep-orphan-uploads cron job is active and the function is deployed.",
      ],
    });
  }

  // Keep the failure table small. Alerts look back 35 minutes; a month is kept
  // for looking into an incident afterwards.
  await admin
    .from("service_failures")
    .delete()
    .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());

  // Throttle: drop problems already emailed in the last few hours.
  const throttleSince = new Date(Date.now() - THROTTLE_HOURS * 3_600_000).toISOString();
  const { data: recent } = await admin
    .from("ops_alert_log")
    .select("kind")
    .gte("sent_at", throttleSince);
  const alreadySent = new Set(((recent ?? []) as Array<{ kind: string }>).map((r) => r.kind));
  const toSend = problems.filter((p) => !alreadySent.has(p.kind));

  const summary = {
    found: problems.map((p) => p.kind),
    throttled: problems.filter((p) => alreadySent.has(p.kind)).map((p) => p.kind),
  };
  if (toSend.length === 0) {
    console.log("[ops-alerts]", JSON.stringify({ ...summary, sent: 0 }));
    return json({ ...summary, sent: 0 });
  }

  // Recipients: OPS_ALERT_TO if set, otherwise every enabled master.
  let recipients = (env("OPS_ALERT_TO") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    const { data: masters } = await admin.from("user_roles").select("user_id").eq("role", "master");
    const ids = ((masters ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    if (ids.length > 0) {
      const [{ data: profiles }, { data: perms }] = await Promise.all([
        admin.from("profiles").select("id, email").in("id", ids),
        admin.from("user_permissions").select("user_id, is_enabled").in("user_id", ids),
      ]);
      const enabled = new Set(
        ((perms ?? []) as Array<{ user_id: string; is_enabled: boolean | null }>)
          .filter((p) => p.is_enabled)
          .map((p) => p.user_id),
      );
      recipients = ((profiles ?? []) as Array<{ id: string; email: string | null }>)
        .filter((p) => enabled.has(p.id) && p.email)
        .map((p) => p.email!);
    }
  }

  const resendApiKey = env("RESEND_API_KEY");
  if (!resendApiKey || recipients.length === 0) {
    console.error("[ops-alerts] problems found but cannot email:", JSON.stringify({
      ...summary,
      resendConfigured: !!resendApiKey,
      recipients: recipients.length,
    }));
    return json({ ...summary, sent: 0, reason: !resendApiKey ? "RESEND_API_KEY not set" : "no recipients" });
  }

  const subject = toSend.length === 1 ? `CPMS alert: ${toSend[0].title}` : `CPMS alert: ${toSend.length} problems`;
  const text = [
    ...toSend.flatMap((p) => [p.title, ...p.lines.map((l) => `  ${l}`), ""]),
    `You will not be emailed about the same problem again for ${THROTTLE_HOURS} hours.`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">${
    toSend.map((p) =>
      `<h3 style="margin:16px 0 6px">${escapeHtml(p.title)}</h3><ul style="margin:0;padding-left:18px">${
        p.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")
      }</ul>`
    ).join("")
  }<p style="color:#666;margin-top:18px">You will not be emailed about the same problem again for ${THROTTLE_HOURS} hours.</p></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("ATTENDANCE_EMAIL_FROM") ?? "CPMS <cpms@mail.cbrliitkgp.online>",
      to: recipients,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    // The body names the sending account, so it stays in the logs.
    console.error(`[ops-alerts] Resend rejected the send: ${res.status} ${await res.text()}`);
    return json({ ...summary, sent: 0, reason: "email rejected" }, 502);
  }

  await admin.from("ops_alert_log").insert(toSend.map((p) => ({ kind: p.kind })));
  console.log("[ops-alerts]", JSON.stringify({ ...summary, sent: toSend.length, recipients: recipients.length }));
  return json({ ...summary, sent: toSend.length });
});
