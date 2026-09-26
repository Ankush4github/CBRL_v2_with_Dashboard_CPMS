import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      "duration": "e.g., 5 days"
    }
  ],
  "visit_date": "YYYY-MM-DD or null",
  "uhid": "string or null",
  "reference_number": "string or null",
  "confidence_score": 85
}`;

serve(async (req) => {
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
    const { imageBase64, ocrText } = await req.json();

    if (!imageBase64 && !ocrText) {
      return new Response(JSON.stringify({ error: "Either image or text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate imageBase64 if provided
    if (imageBase64) {
      if (typeof imageBase64 !== "string") {
        return new Response(JSON.stringify({ error: "Invalid image format" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check size (max 10MB base64 ≈ 13.5MB encoded)
      if (imageBase64.length > 14000000) {
        return new Response(JSON.stringify({ error: "Image size exceeds 10MB limit" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate base64 image format
      if (!imageBase64.match(/^data:image\/(jpeg|png|jpg|webp);base64,/) && !imageBase64.match(/^[A-Za-z0-9+/=]+$/)) {
        return new Response(JSON.stringify({ error: "Invalid image format. Only JPEG, PNG, and WebP allowed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    } else if (imageBase64) {
      // Vision-based extraction using multimodal
      messages = [
        {
          role: "system",
          content: EXTRACTION_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this prescription image and extract all patient information. Return ONLY the JSON object, no other text.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
              },
            },
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

    // Gemini's OpenAI-compatible endpoint, so the messages above (including
    // the image_url data URI) are sent as-is.
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[SERVER] AI service error:", response.status, errorText);

      // Return generic error messages to client
      if (response.status === 429) {
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
      if (extractedData.confidence_score && typeof extractedData.confidence_score === "string") {
        const confNum = parseInt(extractedData.confidence_score, 10);
        extractedData.confidence_score = isNaN(confNum) ? 0 : Math.min(100, Math.max(0, confNum));
      }
    } catch (parseError) {
      console.error("[SERVER] Failed to parse AI response:", parseError);
      // The model's reply is transcribed prescription text (names, diagnoses),
      // so only its shape goes to the logs, never its content.
      console.error("[SERVER] Unparseable AI reply, length:", content.length, "fenced:", /```/.test(content));
      
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
    
    // Return generic error - don't expose internal details
    return new Response(
      JSON.stringify({
        error: "An error occurred processing your request. Please try again.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
