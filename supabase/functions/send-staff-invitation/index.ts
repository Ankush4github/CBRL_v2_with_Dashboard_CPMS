/**
 * Emails a staff invitation to the person invited.
 *
 * Called by User Management right after an invitation is created, and by its
 * "Resend email" button. The invitation itself was always only a database row
 * that handle_new_user() applies on first sign-in -- nobody was told it
 * existed, so a master had to reach each person separately.
 *
 * The caller's own JWT does the reading: RLS already limits staff_invitations
 * to masters (and admins, for their hospitals), and this function additionally
 * requires an enabled master, matching who may create one. Service role is not
 * used at all.
 *
 * Secrets:
 *   RESEND_API_KEY         required.
 *   APP_URL                CPMS base URL for the "Open CPMS" button.
 *   ATTENDANCE_EMAIL_FROM  optional sender, shared with the other CPMS mail.
 */

import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { buildInvitationEmail } from "../_shared/invitation-email.ts";

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

const env = (name: string) => {
  const value = Deno.env.get(name);
  return value && value.trim() !== "" ? value : undefined;
};

// Resending is for a lost email, not a way to flood someone's inbox.
const RESEND_COOLDOWN_MS = 2 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_PUBLISHABLE_KEY") ?? env("SUPABASE_ANON_KEY");
  const resendApiKey = env("RESEND_API_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[send-staff-invitation] missing Supabase configuration");
    return json({ error: "Service configuration error" }, 500);
  }
  if (!resendApiKey) {
    console.error("[send-staff-invitation] RESEND_API_KEY is not set");
    return json({ error: "Email is not set up for CPMS yet." }, 503);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentication required" }, 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Invalid authentication" }, 401);

  // Fail closed: only an explicit true passes.
  const [{ data: isMaster, error: masterError }, { data: enabled, error: enabledError }] = await Promise.all([
    supabase.rpc("is_master", { _user_id: user.id }),
    supabase.rpc("user_is_enabled", { _user_id: user.id }),
  ]);
  if (masterError || enabledError) {
    console.error("[send-staff-invitation] permission check failed:", masterError?.code ?? enabledError?.code);
    return json({ error: "Could not verify your permissions. Please try again." }, 503);
  }
  if (isMaster !== true || enabled !== true) {
    return json({ error: "Only a master administrator can send invitations." }, 403);
  }

  let invitationId: unknown;
  try {
    ({ invitationId } = await req.json());
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (typeof invitationId !== "string" || !/^[0-9a-f-]{36}$/i.test(invitationId)) {
    return json({ error: "Invalid request" }, 400);
  }

  // select("*"): expires_at / last_emailed_at arrive with migration
  // 20260927140000 and are optional until then.
  const { data: invite, error: inviteError } = await supabase
    .from("staff_invitations")
    .select("*")
    .eq("id", invitationId)
    .maybeSingle();
  if (inviteError) {
    console.error("[send-staff-invitation] could not read invitation:", inviteError.code);
    return json({ error: "Could not read that invitation. Please try again." }, 503);
  }
  if (!invite) return json({ error: "That invitation was not found." }, 404);
  if (invite.accepted_at) return json({ error: "This person has already signed in." }, 409);
  if (invite.revoked_at) return json({ error: "This invitation was revoked." }, 409);
  if (invite.expires_at && Date.parse(invite.expires_at) <= Date.now()) {
    return json({ error: "This invitation has expired. Edit it to extend it, then send it again." }, 409);
  }
  if (invite.last_emailed_at && Date.now() - Date.parse(invite.last_emailed_at) < RESEND_COOLDOWN_MS) {
    return json({ error: "It was emailed moments ago. Wait a couple of minutes before resending." }, 429);
  }

  const { data: inviter } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const email = buildInvitationEmail({
    email: invite.email,
    roleLabel: invite.role === "admin" ? "Administrator" : "User (Standard Staff)",
    hospitals: Array.isArray(invite.hospitals) ? invite.hospitals : [],
    inviterName: inviter?.full_name || null,
    appUrl: env("APP_URL") ?? null,
    expiresOn: invite.expires_at
      ? new Date(invite.expires_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      })
      : null,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("ATTENDANCE_EMAIL_FROM") ?? "CPMS <cpms@mail.cbrliitkgp.online>",
      to: [invite.email],
      // Replies go to whoever sent the invitation, not the no-reply sender.
      ...(inviter?.email ? { reply_to: inviter.email } : {}),
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  if (!res.ok) {
    // The body names the sending account, so it stays in the logs.
    console.error(`[send-staff-invitation] Resend rejected the send: ${res.status} ${await res.text()}`);
    return json({ error: "The email could not be sent. Please try again later." }, 502);
  }

  // Best-effort: the columns exist only once migration 20260927140000 is in.
  if ("last_emailed_at" in invite) {
    await supabase
      .from("staff_invitations")
      .update({ last_emailed_at: new Date().toISOString(), email_count: (invite.email_count ?? 0) + 1 })
      .eq("id", invite.id);
  }

  console.log("[send-staff-invitation] sent invitation", invite.id);
  return json({ sent: true });
});
