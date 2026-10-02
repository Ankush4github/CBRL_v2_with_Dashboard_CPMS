import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { CBRL_LOGO_PNG_BASE64 } from "./cbrl-logo.ts";
import { pdfSafeText, wrapText } from "./text.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Medicine {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
}

interface AdditionalDocument {
  name: string;
  url: string;
  type: string;
  docType?: string;
}

interface PatientRecord {
  id: string;
  patient_id: string;
  patient_name: string;
  age: number | null;
  gender: string | null;
  diagnosis: string | null;
  medicines: Medicine[] | null;
  visit_date: string | null;
  doctor_name: string | null;
  hospital: string;
  prescription_image_url: string | null;
  additional_documents: AdditionalDocument[] | null;
  created_at: string | null;
  reference_number: string | null;
  uhid: string | null;
  height_cm: number | null;
  weight_kg: number | null;
}

async function fetchImageAsBytes(supabase: any, filePath: string): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage.from("prescriptions").download(filePath);
    if (error) {
      console.error("Error downloading file:", filePath, error);
      return null;
    }
    const arrayBuffer = await data.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    console.error("Error fetching image:", err);
    return null;
  }
}

/**
 * The bundled CBRL mark, as PNG bytes pdf-lib can embed.
 *
 * Decoded once per isolate rather than once per export: the constant is ~100 KB
 * of base64, so every call re-ran a whole-string replace, an atob, and a
 * charCodeAt loop over 100k characters before a single line of the PDF was
 * drawn.
 */
function decodeLogoBytes(): Uint8Array {
  const binary = atob(CBRL_LOGO_PNG_BASE64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const CBRL_LOGO_BYTES = decodeLogoBytes();

/**
 * Noto Sans from the function's bundled files (config.toml static_files), or
 * Helvetica if they cannot be read -- a degraded PDF beats no PDF, and
 * pdfSafeText() keeps Helvetica's narrower character set from throwing.
 */
async function embedTextFont(pdfDoc: any, file: string, fallback: string): Promise<any> {
  try {
    const bytes = await Deno.readFile(new URL(`./fonts/${file}`, import.meta.url));
    return await pdfDoc.embedFont(bytes, { subset: true });
  } catch (err) {
    console.error(`Could not load ${file}; falling back to ${fallback}:`, err);
    return await pdfDoc.embedFont(fallback);
  }
}

/**
 * A `Content-Disposition` value that suggests `stem`.pdf as the download name.
 *
 * Every part of that name comes from the patient record, which is to say from
 * Gemini's reading of whatever was on the prescription, or from an operator
 * typing over it on the review screen. `patient_name`, `reference_number` and
 * `patient_id` are all plain `text` with no constraints, so three separate
 * things go wrong when the value reaches the header as-is:
 *
 *   - a `"` closes the quoted string early. `Asha" ; filename="x` yields
 *     `filename="Asha"; filename="x_record.pdf"`, so the caller decides both
 *     the download name and what other parameters are present.
 *   - a CR or LF is rejected by the Headers constructor, which throws - and
 *     that throw lands in the catch-all below, turning a download into a 500.
 *   - a character above U+00FF cannot go in a header value at all ("Cannot
 *     convert argument to a ByteString"), so it throws the same way. Patient
 *     names in Bengali or Devanagari are routine here, which means those
 *     records could not be exported at all.
 *
 * So the name is sent twice, which is what RFC 6266 prescribes: a plain
 * `filename` reduced to characters every client can parse, and a
 * `filename*=UTF-8''...` carrying the real one for clients that understand it -
 * all current browsers. A name with nothing left after reduction falls back to
 * a fixed stem rather than an empty `filename=""`.
 */
function pdfContentDisposition(stem: string): string {
  // One line, bounded length: the pieces below are free text of any size, and a
  // header is not the place to discover that. Path separators go here rather
  // than in the ASCII pass below so that the percent-encoded `filename*` cannot
  // carry a traversal either.
  const clean =
    stem
      .replace(/[\\/]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "patient_record";

  const ascii =
    clean
      // Decompose first, so an accented "Jose" reduces to "Jose", not "Jos_".
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      // Anything else - quotes, backslashes, semicolons, path separators, every
      // non-Latin script - collapses to a single underscore.
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      // No leading dot or dash: a name must not read as hidden, relative, or as
      // a flag to whatever the file is later handed to.
      .replace(/^[._-]+/, "")
      .replace(/[._-]+$/, "") || "patient_record";

  // encodeURIComponent leaves !'()* alone, which RFC 5987's ext-value grammar
  // does not permit, so they are escaped too.
  const encoded = encodeURIComponent(clean).replace(
    /['()!*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encoded}.pdf`;
}

function getDocTypeLabel(docType?: string): string {
  switch (docType) {
    case "PIS": return "Patient Information Sheet (PIS)";
    case "ICF": return "Signed Informed Consent Form (ICF)";
    case "TRF": return "Test Requisition Form (TRF)";
    case "ADD_RX": return "Additional Prescription";
    default: return docType || "Document";
  }
}

function formatIST(date: Date): string {
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function detectImageFormat(bytes: Uint8Array): "png" | "jpg" | "pdf" | null {
  if (bytes.length < 4) return null;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "png";
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "jpg";
  // PDF: 25 50 44 46 (%PDF)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  return null;
}

async function embedImageByBytes(pdfDoc: any, imageBytes: Uint8Array): Promise<any | null> {
  const format = detectImageFormat(imageBytes);
  if (format === "png") return await pdfDoc.embedPng(imageBytes);
  if (format === "jpg") return await pdfDoc.embedJpg(imageBytes);
  return null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Checked rather than asserted with `!`: an absent variable used to reach
    // createClient() and throw "supabaseKey is required", which the catch below
    // then reported to the caller. Naming the failure here keeps the response
    // generic and puts the real reason in the logs.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[SERVER] Missing Supabase configuration");
      return new Response(JSON.stringify({ error: "Service configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get auth header from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's auth token to verify access
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user and verify role
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin or master
    const { data: isAdminOrHigher, error: roleError } = await supabaseUser.rpc("is_admin_or_higher", {
      _user_id: user.id,
    });

    if (roleError || !isAdminOrHigher) {
      return new Response(JSON.stringify({ error: "Access denied. Admin or Master role required." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get patient ID from request
    const { patientId } = await req.json();
    if (!patientId) {
      return new Response(JSON.stringify({ error: "Patient ID required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Everything below runs as the caller — the record and its files alike.
    // Files used to be fetched with the service role, which ignores storage
    // RLS: a record saved before create_patient_record checked file ownership
    // could point at another hospital's document, and the export would have
    // embedded it. The caller's own "read at assigned hospitals" policy is
    // exactly the right test, so there is no service-role client at all.
    //
    // Fetch patient record (using user's client to respect RLS)
    const { data: patient, error: patientError } = await supabaseUser
      .from("patient_records")
      .select("*")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      console.error("Error fetching patient:", patientError);
      return new Response(JSON.stringify({ error: "Patient record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the record id, never the name: function logs are not patient storage.
    console.log("Generating PDF for record:", patient.id);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    // Named for what they replaced; they are Noto Sans unless the bundled
    // files could not be read.
    const helvetica = await embedTextFont(pdfDoc, "NotoSans-Regular.ttf", StandardFonts.Helvetica);
    const helveticaBold = await embedTextFont(pdfDoc, "NotoSans-Bold.ttf", StandardFonts.HelveticaBold);
    // Every record value goes through this before it is drawn. Characters must
    // be drawable in both faces, so the set is their intersection.
    const boldSet = new Set<number>(helveticaBold.getCharacterSet());
    const charset = new Set<number>(
      (helvetica.getCharacterSet() as number[]).filter((cp) => boldSet.has(cp)),
    );
    const safe = (value: unknown) => pdfSafeText(charset, String(value ?? ""));
    // Single-line fields: a stray newline would draw over the next row.
    const safeLine = (value: unknown) => safe(value).replace(/\s+/g, " ").trim();

    const pageWidth = 595; // A4 width in points
    const pageHeight = 842; // A4 height in points
    const margin = 50;
    const contentWidth = pageWidth - 2 * margin;

    // Add first page with patient details
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // CBRL mark, left of the letterhead. 46pt tall and offset so its top sits
    // on the cap line of "CPMS" across the page and its foot lands just above
    // the title: the two halves of the header read as one band, and nothing
    // reaches into "PATIENT RECORD" below. A logo that will not embed is not
    // worth failing an export over, so the header simply goes out plain.
    try {
      const logoImage = await pdfDoc.embedPng(CBRL_LOGO_BYTES);
      const logoHeight = 42;
      page.drawImage(logoImage, {
        x: margin,
        y: y - logoHeight + 20,
        width: (logoImage.width / logoImage.height) * logoHeight,
        height: logoHeight,
      });
    } catch (logoErr) {
      console.error("Error embedding logo:", logoErr);
    }

    // CPMS Header (right aligned)
    page.drawText("CPMS", {
      x: pageWidth - margin - 100,
      y,
      size: 28,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    y -= 12;

    page.drawText("CBRL Patient", {
      x: pageWidth - margin - 100,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 12;

    page.drawText("Management System", {
      x: pageWidth - margin - 100,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 25;

    // Title
    page.drawText("PATIENT RECORD", {
      x: margin,
      y,
      size: 20,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 8;

    // Underline
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 2,
      color: rgb(0.2, 0.4, 0.8),
    });
    y -= 25;

    // System Metadata Section
    page.drawText("SYSTEM INFORMATION", {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    y -= 20;

    const metadata = [
      ["Hospital Name", patient.hospital],
      ["CPMS No.", patient.reference_number || "N/A"],
      // patient_id is the hospital UHID the operator typed and reconciled against
      // the scan; uhid is only what the model read off the page. Preferring the
      // verified reading means a misread the operator deliberately overrode does
      // not resurface on the PDF.
      ["Hospital UHID", patient.patient_id || patient.uhid || "N/A"],
      ["Created At", patient.created_at ? formatIST(new Date(patient.created_at)) + " IST" : "N/A"],
    ];

    for (const [label, value] of metadata) {
      page.drawText(`${label}:`, { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(safeLine(value), { x: margin + 100, y, size: 10, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    }
    y -= 15;

    // Patient Details Section
    page.drawText("PATIENT DETAILS", {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    y -= 20;

    const patientDetails = [
      ["Name", patient.patient_name],
      ["Age", patient.age != null ? `${patient.age} years` : "N/A"],
      ["Gender", patient.gender || "N/A"],
      ["Height", patient.height_cm ? `${patient.height_cm} cm` : "N/A"],
      ["Weight", patient.weight_kg ? `${patient.weight_kg} kg` : "N/A"],
      ["Visit Date", patient.visit_date || "N/A"],
      ["Doctor", patient.doctor_name || "N/A"],
    ];

    for (const [label, value] of patientDetails) {
      page.drawText(`${label}:`, { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(safeLine(value), { x: margin + 100, y, size: 10, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    }
    y -= 15;

    // Diagnosis Section
    page.drawText("DIAGNOSIS", {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    y -= 20;

    const diagnosisText = safe(patient.diagnosis || "No diagnosis recorded");
    const diagnosisLines = wrapText(diagnosisText, contentWidth, helvetica, 10);
    for (const line of diagnosisLines) {
      // A long diagnosis used to run off the foot of the page.
      if (y < margin + 30) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size: 10, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
      y -= 14;
    }
    y -= 15;

    // Medicines Section
    page.drawText("MEDICINES", {
      x: margin,
      y,
      size: 12,
      font: helveticaBold,
      color: rgb(0.2, 0.4, 0.8),
    });
    y -= 20;

    const medicines: Medicine[] = Array.isArray(patient.medicines) ? patient.medicines : [];
    if (medicines.length > 0) {
      for (const med of medicines) {
        const medName = safeLine(typeof med === "string" ? med : med.name || "Unknown");
        const medDosage = typeof med === "object" ? med.dosage || "" : "";
        // Frequency ("1-0-1", "twice daily") was left off this "Audit-Ready"
        // document entirely, though every scan saves it.
        const medFrequency = typeof med === "object" ? med.frequency || "" : "";
        const medDuration = typeof med === "object" ? med.duration || "" : "";

        for (const line of wrapText(`• ${medName}`, contentWidth, helveticaBold, 10)) {
          page.drawText(line, { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
          y -= 14;
        }

        if (medDosage || medFrequency || medDuration) {
          const details = safeLine([medDosage, medFrequency, medDuration].filter(Boolean).join(" • "));
          for (const line of wrapText(details, contentWidth - 10, helvetica, 9)) {
            page.drawText(line, { x: margin + 10, y, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
            y -= 12;
          }
        }

        // Check if we need a new page
        if (y < margin + 50) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
      }
    } else {
      page.drawText("No medicines recorded", { x: margin, y, size: 10, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
      y -= 14;
    }
    y -= 15;

    // Documents List Section
    const additionalDocs: AdditionalDocument[] = Array.isArray(patient.additional_documents)
      ? patient.additional_documents
      : [];
    const hasDocuments = patient.prescription_image_url || additionalDocs.length > 0;

    if (hasDocuments) {
      if (y < margin + 80) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      page.drawText("ATTACHED DOCUMENTS", {
        x: margin,
        y,
        size: 12,
        font: helveticaBold,
        color: rgb(0.2, 0.4, 0.8),
      });
      y -= 20;

      let docIndex = 1;
      if (patient.prescription_image_url) {
        page.drawText(`${docIndex}. Prescription Image`, {
          x: margin,
          y,
          size: 10,
          font: helvetica,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= 14;
        docIndex++;
      }

      for (const doc of additionalDocs) {
        const docLabel = getDocTypeLabel(doc.docType);
        page.drawText(safeLine(`${docIndex}. ${docLabel}`), {
          x: margin,
          y,
          size: 10,
          font: helvetica,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= 14;
        docIndex++;

        if (y < margin + 50) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
      }
    }

    // Footer on first page
    const firstPage = pdfDoc.getPage(0);
    firstPage.drawText(safeLine(`Generated on ${formatIST(new Date())} IST | Audit-Ready Document`), {
      x: margin,
      y: margin - 20,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Add prescription image if exists
    if (patient.prescription_image_url) {
      console.log("Adding prescription image:", patient.prescription_image_url);
      const imageBytes = await fetchImageAsBytes(supabaseUser, patient.prescription_image_url);

      if (imageBytes) {
        try {
          const imagePage = pdfDoc.addPage([pageWidth, pageHeight]);
          let yPos = pageHeight - margin;

          imagePage.drawText("PRESCRIPTION IMAGE", {
            x: margin,
            y: yPos,
            size: 14,
            font: helveticaBold,
            color: rgb(0.2, 0.4, 0.8),
          });
          yPos -= 30;

          // Determine image type and embed
          const image = await embedImageByBytes(pdfDoc, imageBytes);

          if (image) {
            const maxWidth = contentWidth;
            const maxHeight = pageHeight - margin * 2 - 50;
            const { width, height } = image.scaleToFit(maxWidth, maxHeight);

            imagePage.drawImage(image, {
              x: margin + (contentWidth - width) / 2,
              y: yPos - height,
              width,
              height,
            });
          }
        } catch (imgErr) {
          console.error("Error embedding prescription image:", imgErr);
        }
      }
    }

    // Add additional documents (images only - PDFs would need merging)
    for (let i = 0; i < additionalDocs.length; i++) {
      const doc = additionalDocs[i];
      const docLabel = getDocTypeLabel(doc.docType);

      console.log("Adding additional document:", docLabel);
      const docBytes = await fetchImageAsBytes(supabaseUser, doc.url);

      if (!docBytes) continue;

      const detectedFormat = detectImageFormat(docBytes);

      if (detectedFormat === "png" || detectedFormat === "jpg") {
        try {
          const docPage = pdfDoc.addPage([pageWidth, pageHeight]);
          let yPos = pageHeight - margin;

          docPage.drawText(safeLine(`DOCUMENT: ${docLabel}`), {
            x: margin,
            y: yPos,
            size: 14,
            font: helveticaBold,
            color: rgb(0.2, 0.4, 0.8),
          });
          yPos -= 30;

          const image = await embedImageByBytes(pdfDoc, docBytes);

          if (image) {
            const maxWidth = contentWidth;
            const maxHeight = pageHeight - margin * 2 - 50;
            const { width, height } = image.scaleToFit(maxWidth, maxHeight);

            docPage.drawImage(image, {
              x: margin + (contentWidth - width) / 2,
              y: yPos - height,
              width,
              height,
            });
          }
        } catch (imgErr) {
          console.error("Error embedding document image:", imgErr);
        }
      } else if (detectedFormat === "pdf") {
        try {
          const externalPdf = await PDFDocument.load(docBytes);
          const copiedPages = await pdfDoc.copyPages(externalPdf, externalPdf.getPageIndices());

          for (const copiedPage of copiedPages) {
            pdfDoc.addPage(copiedPage);
          }
        } catch (pdfErr) {
          console.error("Error merging PDF document:", pdfErr);
        }
      } else {
        console.warn("Unknown file format for document:", docLabel, "url:", doc.url);
      }
    }

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    console.log("PDF generated successfully, size:", pdfBytes.length);

    // Return PDF
    const stem = [patient.patient_name, patient.reference_number || patient.patient_id, "record"]
      .filter((part) => typeof part === "string" && part.trim() !== "")
      .join("_");

    return new Response(new Uint8Array(pdfBytes).buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": pdfContentDisposition(stem),
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return new Response(JSON.stringify({ error: "Failed to generate PDF. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
