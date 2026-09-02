/**
 * Serves the VAPID public key to the browser.
 *
 * subscribeToPush() in src/lib/cpms/push.ts needs this value as the
 * `applicationServerKey` for pushManager.subscribe(). It is the half of the
 * VAPID pair that is meant to travel — it ends up in the browser and is handed
 * on to the push service — so there is nothing to protect here. It lives in a
 * function rather than NEXT_PUBLIC_ env only because the pair is set with
 * `supabase secrets set` alongside VAPID_PRIVATE_KEY, and keeping both in one
 * place is what stops the two drifting apart.
 *
 * VAPID_PRIVATE_KEY sits next to it in that same secret store and must never
 * be read here. Only the sender signing a push payload has any use for it.
 *
 * Secrets, set with `supabase secrets set --project-ref <ref>`:
 *   VAPID_PUBLIC_KEY   required. Base64url, 87 characters, decoding to the 65
 *                      bytes of an uncompressed P-256 point (leading 0x04).
 *
 * Rotating the pair invalidates every row in push_subscriptions: a browser's
 * subscription is bound to the key it was created with, so each client has to
 * subscribe again. Nothing here is cached, so a rotation takes effect on the
 * next subscribe.
 */

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

/**
 * Catches a mis-pasted secret at the source. Without this the key reaches
 * urlBase64ToUint8Array(), whose atob() throws on a stray character, and the
 * whole thing surfaces in the UI as "Subscribe failed." — with no indication
 * that the deployed secret is the problem. The reply stays generic; the log
 * line is where the operator finds out which way it is malformed.
 */
function describeIfInvalid(key: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    return "contains characters outside the base64url alphabet (a raw base64 key needs + / = replaced with - _ and no padding)";
  }
  let bytes: Uint8Array;
  try {
    const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
    bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return "is not decodable base64url";
  }
  if (bytes.length !== 65) {
    return `decodes to ${bytes.length} bytes, not the 65 of an uncompressed P-256 point (a 32-byte value here is the private key, not the public one)`;
  }
  if (bytes[0] !== 0x04) {
    return `decodes to 65 bytes but starts with 0x${bytes[0].toString(16).padStart(2, "0")}, not the 0x04 of an uncompressed point`;
  }
  return null;
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // functions.invoke() sends POST with no body. GET is accepted too, so the
  // deployment can be checked with curl and a JWT.
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Trimmed: `supabase secrets set` from a file is an easy way to pick up a
  // trailing newline, and that alone would fail the base64url test below.
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  if (!publicKey) {
    console.error("[vapid-public-key] VAPID_PUBLIC_KEY is not set");
    return json({ error: "Push notifications are not configured on this project." }, 500);
  }

  const problem = describeIfInvalid(publicKey);
  if (problem) {
    console.error(`[vapid-public-key] VAPID_PUBLIC_KEY ${problem}`);
    return json({ error: "Push notifications are not configured on this project." }, 500);
  }

  return json({ publicKey });
});
