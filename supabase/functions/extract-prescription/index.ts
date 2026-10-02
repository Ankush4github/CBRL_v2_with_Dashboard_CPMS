import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Note a failure for ops-alerts, which emails the masters when scanning keeps
 * failing (migration 20260927100000). Best-effort: a missing table or a
 * network blip must never turn into a failed scan, so errors are swallowed.
 * `detail` is a status code and the provider's error code -- never its free
 * text, and never patient data.
 *
 *   config   -- a required secret is missing; every scan fails
 *   model    -- Gemini refused the key or the model (401/403/404); every scan fails
 *   rejected -- Gemini refused this request (other 4xx), e.g. an unreadable image
 *   busy     -- still overloaded after the retries (429/5xx)
 *   parse    -- the reply was not usable JSON
 *   error    -- anything else that reached the catch-all
 */
/**
 * The models to try, in order of preference.
 *
 * GEMINI_MODELS is a comma-separated list, so a third model can be added or
 * the order changed without a code change. Without it, the older
 * GEMINI_MODEL / GEMINI_FALLBACK_MODEL pair is used, and without those, the
 * defaults below. Google retires Flash models for new keys (2.5 went this way),
 * which is why none of this is fixed in code.
 */
function configuredModels(): string[] {
  const list = (Deno.env.get("GEMINI_MODELS") ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (list.length) return [...new Set(list)];
  return [...new Set([
    Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash",
    Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-3.7-flash",
  ])];
}

/**
 * When each model last answered "busy", in this function instance.
 *
 * Overload comes in bursts lasting minutes, so a model that was busy a moment
 * ago will probably still be busy for the next scan. Starting that scan on a
 * model that is not saves it a failed attempt and a pause. This lives only as
 * long as the instance does; a cold start simply begins from the preferred
 * order again, which is the right default.
 */
const busySince = new Map<string, number>();
const BUSY_MEMORY_MS = 2 * 60 * 1000;

/** The configured models, the ones not recently busy first, order otherwise kept. */
function modelsInTryOrder(): string[] {
  const now = Date.now();
  const recentlyBusy = (m: string) => now - (busySince.get(m) ?? -Infinity) < BUSY_MEMORY_MS;
  const models = configuredModels();
  return [...models.filter((m) => !recentlyBusy(m)), ...models.filter(recentlyBusy)];
}

/**
 * What to keep of a provider error body: its machine-readable code and status
 * (Gemini's OpenAI-compatible endpoint answers with {error: {code, status,
 * message}} or a list of those), never the free-text message. That text goes
 * to the function log, to service_failures and on to the masters' alert email,
 * and a provider is free to echo parts of the request back in it.
 */
function summarizeProviderError(text: string): string {
  try {
    const parsed = JSON.parse(text);
    const err = (Array.isArray(parsed) ? parsed[0] : parsed)?.error ?? {};
    const parts = [err.code, err.status, err.type].filter(
      (v) => typeof v === "string" || typeof v === "number",
    );
    if (parts.length) return parts.join(" ").slice(0, 80);
  } catch {
    // Not JSON: fall through to the length only.
  }
  return `unparsed body (${text.length} chars)`;
}

async function recordFailure(kind: string, detail: string): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/service_failures`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ service: "extract-prescription", kind, detail: detail.slice(0, 300) }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Alerting is a help; the scan's own response is what matters here.
  }
}

const EXTRACTION_PROMPT = `You are a medical prescription extraction AI specialized in reading handwritten and printed medical documents.

You are given an IMAGE of a medical prescription. Your job is to accurately extract patient and prescription data.

EXTRACTION RULES:
1. Read all visible text carefully - both printed and handwritten
2. Expand common medical abbreviations:
   - OD = Once daily, BD = Twice daily, TDS = Three times daily
   - QID = Four times daily, SOS = As needed, HS = At bedtime
   - AC = Before meals, PC = After meals
3. Normalize medicine names to proper spelling
4. Extract measurements in standard units (cm for height, kg for weight)
5. If a field is not visible or unreadable, return null (not empty string)
6. Do NOT invent or assume values that are not visible

CONFIDENCE SCORE CALCULATION (IMPORTANT - Be generous with scoring):
Score based on what you CAN read, not what's missing. Calculate as follows:

- Start with 40 as base score if you can read the prescription at all
- Add points for clarity:
  +5 if patient name is clearly readable
  +5 if doctor name or hospital is visible
  +5 if medicines are clearly listed
- Subtract points only for actual reading difficulties:
  -10 if handwriting is very difficult to read
  -10 if image is blurry or low quality
  -5 if some text is partially obscured

Typical scores should be:
- 85-100: Clear prescription, most fields readable
- 70-84: Some handwriting challenges but main content readable  
- 50-69: Significant reading difficulties
- Below 50: Very poor quality, mostly unreadable

IMPORTANT: If you can extract patient name and at least one medicine, score should be at least 70.

UNCERTAIN READINGS (be honest here, unlike the score above):
A human checks your reading against the image. Tell them where to look hardest.
- "uncertain_fields": list the top-level fields whose value you returned but could
  not read with certainty -- ambiguous handwriting, a letter or digit that could be
  another, text that is smudged, cut off or partly hidden. Use only these names:
  patient_name, age, gender, height_cm, weight_kg, doctor_name, diagnosis,
  visit_date, uhid.
- Each medicine has its own "uncertain" list naming which of its parts you are
  unsure of: name, dosage, frequency, duration. A medicine name you had to guess
  between look-alike drugs is always uncertain.
- Do not list a field you returned as null. Use [] when you are sure of everything.

Return ONLY valid JSON. No explanations or markdown.

{
  "patient_name": "string or null",
  "age": "number or null",
  "gender": "M/F or null",
  "height_cm": "number or null",
  "weight_kg": "number or null",
  "hospital_name": "string or null",
  "doctor_name": "string or null",
  "diagnosis": "string or null",
  "medicines": [
    {
      "name": "medicine name",
      "dosage": "e.g., 500mg",
      "frequency": "e.g., twice daily",
      "duration": "e.g., 5 days",
      "uncertain": ["dosage"]
    }
  ],
  "uncertain_fields": ["patient_name"],
  "visit_date": "YYYY-MM-DD or null",
  "uhid": "string or null",
  "reference_number": "string or null",
  "confidence_score": 85
}`;

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION CHECK ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[AUTH] Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth token
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[SERVER] Missing Supabase configuration");
      await recordFailure("config", "SUPABASE_URL or SUPABASE_ANON_KEY missing");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user's authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.log("[AUTH] Invalid authentication:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[AUTH] User authenticated:", user.id);

    // Check user permissions using RPC function
    // Fail closed: a failed lookup leaves data null, and null must not fall
    // through to the paid model call. Only an explicit `true` passes.
    const { data: canScan, error: canScanError } = await supabaseClient.rpc("user_can_scan", { _user_id: user.id });

    if (canScanError) {
      console.error("[AUTH] Scan permission check failed:", canScanError.message);
      return new Response(
        JSON.stringify({ error: "Could not verify scan permission. Please try again." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (canScan !== true) {
      console.log("[AUTH] User does not have scan permission:", user.id);
      return new Response(
        JSON.stringify({ error: "You do not have permission to scan prescriptions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== INPUT VALIDATION ==========
    const { imageBase64, imagesBase64, ocrText } = await req.json();

    // A prescription can run to several pages. `imagesBase64` carries them in
    // page order; the single `imageBase64` is still accepted for older clients.
    const MAX_PAGES = 4;
    const images: unknown[] = Array.isArray(imagesBase64)
      ? imagesBase64
      : imageBase64
      ? [imageBase64]
      : [];

    if (images.length === 0 && !ocrText) {
      return new Response(JSON.stringify({ error: "Either image or text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (images.length > MAX_PAGES) {
      return new Response(JSON.stringify({ error: `A prescription can have at most ${MAX_PAGES} pages` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalImageLength = 0;
    for (const image of images) {
      if (typeof image !== "string" || image === "") {
        return new Response(JSON.stringify({ error: "Invalid image format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate base64 image format
      if (!image.match(/^data:image\/(jpeg|png|jpg|webp);base64,/) && !image.match(/^[A-Za-z0-9+/=]+$/)) {
        return new Response(JSON.stringify({ error: "Invalid image format. Only JPEG, PNG, and WebP allowed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      totalImageLength += image.length;
    }

    // The 10MB budget (≈ 14M base64 characters) covers all pages together; the
    // client downscales each to 1600px, so real pages are a few hundred KB.
    if (totalImageLength > 14000000) {
      return new Response(JSON.stringify({ error: "Images exceed the 10MB limit" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pages = images as string[];

    // Validate ocrText if provided
    if (ocrText) {
      if (typeof ocrText !== "string") {
        return new Response(JSON.stringify({ error: "Invalid text format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Limit text length (max 50KB)
      if (ocrText.length > 50000) {
        return new Response(JSON.stringify({ error: "Text exceeds maximum length" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("[SERVER] GEMINI_API_KEY is not configured");
      await recordFailure("config", "GEMINI_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-user hourly cap on paid model calls. Counted after validation, so a
    // rejected upload costs nothing, and once per request however many retries
    // the call below makes. Fails closed like the can_scan check: an unreadable
    // quota must not become an unlimited one.
    const hourlyLimit = Number.parseInt(Deno.env.get("SCAN_HOURLY_LIMIT") ?? "", 10) || 30;
    const { data: withinQuota, error: quotaError } = await supabaseClient.rpc("consume_scan_extraction", {
      _hourly_limit: hourlyLimit,
    });
    if (quotaError) {
      console.error("[AUTH] Scan quota check failed:", quotaError.code, quotaError.message);
      return new Response(
        JSON.stringify({ error: "Could not verify your scan allowance. Please try again." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (withinQuota !== true) {
      console.log("[AUTH] Scan quota reached:", user.id);
      return new Response(
        JSON.stringify({
          error: `You've reached the limit of ${hourlyLimit} extractions per hour. Please try again later.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SERVER] Processing prescription extraction for user:", user.id);

    // Build messages based on input type
    let messages;

    if (ocrText) {
      // Text-based extraction
      messages = [
        {
          role: "system",
          content: EXTRACTION_PROMPT,
        },
        {
          role: "user",
          content: `Extract structured patient information from the following prescription text. Return only valid JSON.\n\nText:\n${ocrText}`,
        },
      ];
    } else if (pages.length > 0) {
      // Vision-based extraction using multimodal
      const instruction = pages.length === 1
        ? "Analyze this prescription image and extract all patient information. Return ONLY the JSON object, no other text."
        : `These ${pages.length} images are the pages of ONE prescription, in order. Read all of them and ` +
          "return a single JSON object that combines them: list every medicine from every page once, and " +
          "take patient details from whichever page shows them. Return ONLY the JSON object, no other text.";

      messages = [
        {
          role: "system",
          content: EXTRACTION_PROMPT,
        },
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            ...pages.map((page) => ({
              type: "image_url",
              image_url: {
                url: page.startsWith("data:") ? page : `data:image/jpeg;base64,${page}`,
              },
            })),
          ],
        },
      ];
    } else {
      return new Response(
        JSON.stringify({ error: "Either image or text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SERVER] Sending request to AI service");

    // Healthy models first: one that answered "busy" in the last couple of
    // minutes goes to the back of the line (see modelsInTryOrder).
    const models = modelsInTryOrder();

    // Models answer 503 "high demand" in bursts -- on 2026-10-01 six scans in
    // five minutes failed on all three of the old attempts (primary, primary,
    // fallback, 1.5s apart), which together gave Google about ten seconds to
    // recover. Overload is per model, so a busy answer switches straight to
    // the next model, cycling through the list and backing off further each
    // full round, until one succeeds or the time budget runs out. The budget keeps the operator's wait bounded:
    // past it, "busy, try again" is a better answer than a longer spinner.
    const transient = new Set([429, 500, 503]);
    const RETRY_BUDGET_MS = 40_000;
    const MAX_ATTEMPTS = 6;
    const startedAt = Date.now();
    let response!: Response;
    let errorText = "";
    // JSON mode stops the model wrapping its answer in prose, which is what
    // ends in the 422 "Unable to extract" below. Google's OpenAI-compatibility
    // docs do not spell out json_object support, so a 400 turns it off and the
    // same attempt is repeated rather than letting the option fail every scan.
    let jsonMode = true;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Cycle through the models: a busy answer moves straight to the next.
      const model = models[attempt % models.length];

      // Gemini's OpenAI-compatible endpoint, so the messages above (including
      // the image_url data URI) are sent as-is.
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (response.ok) {
        // Answering again: new scans may start on it.
        busySince.delete(model);
        break;
      }

      errorText = await response.text();
      console.error(
        "[SERVER] AI service error:", model, response.status, summarizeProviderError(errorText),
      );
      if (response.status === 400 && jsonMode && !errorText.includes("API_KEY_INVALID")) {
        jsonMode = false;
        attempt--;
        continue;
      }
      if (!transient.has(response.status)) break;
      busySince.set(model, Date.now());
      if (attempt === MAX_ATTEMPTS - 1) break;

      // Moving to another model needs only a short pause; coming back round to
      // the first one after every model was busy waits longer each round --
      // about 2.5s, then 5s. Jitter keeps a burst of operators from retrying
      // in lockstep, and a Retry-After from Google wins when it asks for
      // longer, up to 8s. Worst case, six busy answers take ~30s in all.
      const round = Math.floor(attempt / models.length);
      const nextStartsRound = (attempt + 1) % models.length === 0;
      const base = nextStartsRound ? [2500, 5000][Math.min(round, 1)] : 500;
      let delay = base * (0.75 + Math.random() * 0.5);
      const retryAfter = Number(response.headers.get("retry-after"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        delay = Math.max(delay, Math.min(retryAfter * 1000, 8000));
      }
      // Stop rather than start an attempt that would end past the budget; a
      // vision call itself takes several seconds.
      if (Date.now() - startedAt + delay > RETRY_BUDGET_MS - 8000) break;
      await new Promise((r) => setTimeout(r, delay));
    }

    if (!response.ok) {
      const status = response.status;
      await recordFailure(
        transient.has(status) ? "busy"
          : status === 401 || status === 403 || status === 404 || errorText.includes("API_KEY_INVALID") ? "model"
          : "rejected",
        `${status} ${summarizeProviderError(errorText)}`,
      );

      // Return generic error messages to client
      if (response.status === 429 || response.status === 503) {
        return new Response(
          JSON.stringify({ error: "Service temporarily busy. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Gemini answers a bad or unauthorised key with 400/403; the caller
      // can't fix either, so treat them like a billing failure.
      if (response.status === 402 || response.status === 403 ||
          (response.status === 400 && errorText.includes("API_KEY_INVALID"))) {
        return new Response(
          JSON.stringify({ error: "Service unavailable. Please contact support." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Unable to process prescription. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("[SERVER] No content in AI response");
      await recordFailure("parse", "reply had no content");
      return new Response(
        JSON.stringify({ error: "Unable to extract data from prescription. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SERVER] AI Response received, length:", content.length);

    // Parse the JSON from the response
    let extractedData;
    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      extractedData = JSON.parse(jsonStr);

      // Normalize numeric fields
      if (extractedData.height_cm && typeof extractedData.height_cm === "string") {
        const heightNum = parseFloat(extractedData.height_cm.replace(/[^\d.]/g, ""));
        extractedData.height_cm = isNaN(heightNum) ? null : heightNum;
      }
      if (extractedData.weight_kg && typeof extractedData.weight_kg === "string") {
        const weightNum = parseFloat(extractedData.weight_kg.replace(/[^\d.]/g, ""));
        extractedData.weight_kg = isNaN(weightNum) ? null : weightNum;
      }
      if (extractedData.age && typeof extractedData.age === "string") {
        const ageNum = parseInt(extractedData.age.replace(/[^\d]/g, ""), 10);
        extractedData.age = isNaN(ageNum) ? null : ageNum;
      }
      // Uncertainty flags drive highlighting in Review, so only known names get
      // through: anything else would highlight nothing or break the check.
      const TOP_FIELDS = ["patient_name", "age", "gender", "height_cm", "weight_kg",
        "doctor_name", "diagnosis", "visit_date", "uhid"];
      const MED_FIELDS = ["name", "dosage", "frequency", "duration"];
      const onlyKnown = (value: unknown, allowed: string[]) =>
        Array.isArray(value)
          ? [...new Set(value.filter((v): v is string => typeof v === "string" && allowed.includes(v)))]
          : [];
      extractedData.uncertain_fields = onlyKnown(extractedData.uncertain_fields, TOP_FIELDS);
      if (Array.isArray(extractedData.medicines)) {
        for (const med of extractedData.medicines) {
          if (med && typeof med === "object") med.uncertain = onlyKnown(med.uncertain, MED_FIELDS);
        }
      }

      // The prompt asks for M/F; records and the review form use the full words.
      // Mapped here so the stored extraction_raw agrees and provenance does not
      // log every "M" as a human correction to "Male".
      if (typeof extractedData.gender === "string") {
        const g = extractedData.gender.trim().toLowerCase();
        extractedData.gender = g === "m" || g === "male" ? "Male"
          : g === "f" || g === "female" ? "Female"
          : g === "o" || g === "other" ? "Other"
          : null;
      }
      if (extractedData.confidence_score && typeof extractedData.confidence_score === "string") {
        const confNum = parseInt(extractedData.confidence_score, 10);
        extractedData.confidence_score = isNaN(confNum) ? 0 : Math.min(100, Math.max(0, confNum));
      }
    } catch (parseError) {
      console.error("[SERVER] Failed to parse AI response:", parseError);
      // The model's reply is transcribed prescription text (names, diagnoses),
      // so only its shape goes to the logs, never its content.
      console.error("[SERVER] Unparseable AI reply, length:", content.length, "fenced:", /```/.test(content));
      await recordFailure("parse", `unparseable reply, length ${content.length}`);
      
      // Return generic error - don't expose raw AI content
      return new Response(
        JSON.stringify({
          error: "Unable to extract data from prescription. Please ensure image is clear and try again.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[SERVER] Successfully extracted prescription data for user:", user.id, "confidence:", extractedData.confidence_score);

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[SERVER] Function error:", error);
    await recordFailure("error", error instanceof Error ? `${error.name}: ${error.message}` : "unknown error");
    
    // Return generic error - don't expose internal details
    return new Response(
      JSON.stringify({
        error: "An error occurred processing your request. Please try again.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
