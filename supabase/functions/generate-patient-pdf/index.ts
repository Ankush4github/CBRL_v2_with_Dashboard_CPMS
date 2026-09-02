import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Medicine {
  name: string;
  dosage?: string;
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

async function fetchLogoFromUrl(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("Error fetching logo:", response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    console.error("Error fetching logo:", err);
    return null;
  }
}

function wrapText(text: string, maxWidth: number, font: any, fontSize: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth header from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's auth token to verify access
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
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

    // Use service role client for accessing storage
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

    console.log("Generating PDF for patient:", patient.patient_name);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = 595; // A4 width in points
    const pageHeight = 842; // A4 height in points
    const margin = 50;
    const contentWidth = pageWidth - 2 * margin;

    // Add first page with patient details
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Try to add CBRL logo from storage
    let logoWidth = 0;
    try {
      const logoBytes = await fetchImageAsBytes(supabaseAdmin, "cbrl-logo.png");
      if (logoBytes) {
        const logoImage = await pdfDoc.embedPng(logoBytes);
        const logoHeight = 50;
        logoWidth = (logoImage.width / logoImage.height) * logoHeight;
        page.drawImage(logoImage, {
          x: margin,
          y: y - logoHeight + 15,
          width: logoWidth,
          height: logoHeight,
        });
        console.info("CBRL logo added successfully");
      } else {
        console.warn("Logo not found in storage, skipping");
      }
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
      ["Hospital", patient.hospital],
      ["Reference No", patient.reference_number || "N/A"],
      ["UHID", patient.uhid || patient.patient_id || "N/A"],
      ["Created At", patient.created_at ? formatIST(new Date(patient.created_at)) + " IST" : "N/A"],
    ];

    for (const [label, value] of metadata) {
      page.drawText(`${label}:`, { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(String(value), { x: margin + 100, y, size: 10, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
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
      ["Age", patient.age ? `${patient.age} years` : "N/A"],
      ["Gender", patient.gender || "N/A"],
      ["Height", patient.height_cm ? `${patient.height_cm} cm` : "N/A"],
      ["Weight", patient.weight_kg ? `${patient.weight_kg} kg` : "N/A"],
      ["Visit Date", patient.visit_date || "N/A"],
      ["Doctor", patient.doctor_name || "N/A"],
    ];

    for (const [label, value] of patientDetails) {
      page.drawText(`${label}:`, { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) });
      page.drawText(String(value), { x: margin + 100, y, size: 10, font: helvetica, color: rgb(0.1, 0.1, 0.1) });
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

    const diagnosisText = patient.diagnosis || "No diagnosis recorded";
    const diagnosisLines = wrapText(diagnosisText, contentWidth, helvetica, 10);
    for (const line of diagnosisLines) {
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
        const medName = typeof med === "string" ? med : med.name || "Unknown";
        const medDosage = typeof med === "object" ? med.dosage || "" : "";
        const medDuration = typeof med === "object" ? med.duration || "" : "";

        page.drawText(`• ${medName}`, { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.1, 0.1, 0.1) });
        y -= 14;

        if (medDosage || medDuration) {
          const details = [medDosage, medDuration].filter(Boolean).join(" • ");
          page.drawText(`  ${details}`, { x: margin + 10, y, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) });
          y -= 12;
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
        page.drawText(`${docIndex}. ${docLabel}`, {
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
    firstPage.drawText(`Generated on ${formatIST(new Date())} IST | Audit-Ready Document`, {
      x: margin,
      y: margin - 20,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Add prescription image if exists
    if (patient.prescription_image_url) {
      console.log("Adding prescription image:", patient.prescription_image_url);
      const imageBytes = await fetchImageAsBytes(supabaseAdmin, patient.prescription_image_url);

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
      const docBytes = await fetchImageAsBytes(supabaseAdmin, doc.url);

      if (!docBytes) continue;

      const detectedFormat = detectImageFormat(docBytes);

      if (detectedFormat === "png" || detectedFormat === "jpg") {
        try {
          const docPage = pdfDoc.addPage([pageWidth, pageHeight]);
          let yPos = pageHeight - margin;

          docPage.drawText(`DOCUMENT: ${docLabel}`, {
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
    const fileName = `${patient.patient_name.replace(/\s+/g, "_")}_${patient.reference_number || patient.patient_id}_record.pdf`;

    return new Response(new Uint8Array(pdfBytes).buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
