/**
 * Orphaned upload sweeper for the prescriptions bucket.
 *
 * Invoked daily by pg_cron (private.invoke_orphan_sweep, migration
 * 20260926151740). Finds objects no patient record references that are older
 * than SWEEP_MIN_AGE_DAYS, via public.list_orphan_prescription_objects(), and
 * removes them through the Storage API -- deleting storage.objects rows in SQL
 * would leave the files themselves behind.
 *
 * Report-only unless SWEEP_APPLY is "true". These are patient documents and a
 * removal cannot be undone, so the first runs only log what they would remove,
 * and someone turns deletion on after reading that.
 *
 * A record deleted from the app keeps its files (the delete removes only the
 * row), so once enabled this also removes those, after the age floor.
 *
 * Deployed with verify_jwt = false, like attendance-notifications: pg_cron has
 * no user session, so CRON_SECRET is the gate in front of the service role.
 *
 * Secrets:
 *   CRON_SECRET          required. Unset means every call is refused.
 *   SWEEP_APPLY          "true" to delete; anything else only reports.
 *   SWEEP_MIN_AGE_DAYS   optional, default 7, never below 1.
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

/**
 * For ops-alerts (migration 20260927100000): failures are noted, and every
 * completed run stamps a heartbeat so a sweep that silently stops running is
 * noticed too. Best-effort -- a missing table must not fail the sweep.
 */
async function recordFailure(admin: any, kind: string, detail: string) {
  try {
    await admin.from("service_failures").insert({
      service: "sweep-orphan-uploads",
      kind,
      detail: detail.slice(0, 300),
    });
  } catch {
    // Nothing more to do; the run's own log line carries the reason.
  }
}

async function recordSuccess(admin: any) {
  try {
    await admin
      .from("service_heartbeats")
      .upsert({ service: "sweep-orphan-uploads", last_ok_at: new Date().toISOString() });
  } catch {
    // As above.
  }
}

const BATCH = 100;
// One run's ceiling. Anything past it is picked up the next night.
const MAX_PER_RUN = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = env("CRON_SECRET") ?? "";
  if (!supabaseUrl || !serviceRole) {
    console.error("[sweep-orphan-uploads] missing Supabase configuration");
    return json({ error: "Service configuration error" }, 500);
  }

  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || !secretsMatch(provided, cronSecret)) {
    if (!cronSecret) console.error("[sweep-orphan-uploads] CRON_SECRET is not set; refusing every request");
    return json({ error: "Unauthorized" }, 401);
  }

  const apply = env("SWEEP_APPLY") === "true";
  const minAgeDays = Math.max(1, Number.parseInt(env("SWEEP_MIN_AGE_DAYS") ?? "7", 10) || 7);

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc("list_orphan_prescription_objects", {
    _min_age: `${minAgeDays} days`,
    _limit: MAX_PER_RUN,
  });
  if (error) {
    console.error("[sweep-orphan-uploads] listing failed:", error.code, error.message);
    await recordFailure(admin, "list", `${error.code} ${error.message}`);
    return json({ error: "Listing failed" }, 500);
  }

  const orphans = (data ?? []) as Array<{ name: string; size_bytes: number | null; created_at: string }>;
  const totalBytes = orphans.reduce((sum, o) => sum + (o.size_bytes ?? 0), 0);
  // Paths are <uploader uuid>/<timestamp>.<ext> -- no patient data -- so the
  // oldest few are logged to make a report-only run checkable by hand.
  const summary = {
    mode: apply ? "apply" : "report-only",
    minAgeDays,
    found: orphans.length,
    totalBytes,
    oldest: orphans.slice(0, 5).map((o) => ({ name: o.name, created_at: o.created_at })),
  };

  if (!apply || orphans.length === 0) {
    console.log("[sweep-orphan-uploads]", JSON.stringify(summary));
    await recordSuccess(admin);
    return json({ ...summary, removed: 0 });
  }

  let removed = 0;
  const failures: string[] = [];
  for (let i = 0; i < orphans.length; i += BATCH) {
    const names = orphans.slice(i, i + BATCH).map((o) => o.name);
    const { data: gone, error: removeError } = await admin.storage.from("prescriptions").remove(names);
    if (removeError) {
      console.error("[sweep-orphan-uploads] remove failed:", removeError.message);
      failures.push(...names);
      continue;
    }
    removed += gone?.length ?? 0;
  }

  console.log("[sweep-orphan-uploads]", JSON.stringify({ ...summary, removed, failed: failures.length }));
  if (failures.length > 0) {
    await recordFailure(admin, "remove", `${failures.length} of ${orphans.length} files could not be removed`);
  } else {
    await recordSuccess(admin);
  }
  return json({ ...summary, removed, failed: failures.length });
});
