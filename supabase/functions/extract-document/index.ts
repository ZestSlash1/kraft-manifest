import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EXTRACTION_PROMPT = `You are an expert at extracting structured data from Indian shipping/logistics documents (E-Way Bills, GST Invoices, Bills of Lading, Packing Lists).

Extract the following fields from this document. If a field is not present or unclear, use null. Always return ONLY valid JSON, no markdown, no explanation.

Required JSON shape:
{
  "doc_type": "eway_bill" | "invoice" | "bl" | "packing_list" | "other",
  "shipper": "string or null (the consignor/seller/from party — full company name)",
  "consignee": "string or null (the buyer/to party — full company name)",
  "gst_number": "string or null (15-character GSTIN of shipper, e.g. 19AABCK1234A1Z5)",
  "eway_bill": "string or null (12-digit E-Way Bill number)",
  "eway_valid_till": "string or null (E-Way Bill valid until date in YYYY-MM-DD format)",
  "quantity": "string or null (e.g. '50 Boxes' or '1200 Kgs' — combine count + unit)",
  "cargo_weight": "string or null (gross weight, e.g. '1200 Kgs')",
  "goods_description": "string or null (description of goods being shipped)",
  "container_no": "string or null (4 letters + 7 digits, e.g. MSCU1234567)",
  "container_size": "string or null (one of: 20', 40', 40HC, 45HC)",
  "seal_no": "string or null (container seal number)",
  "vehicle_number": "string or null (Indian vehicle registration like WB12AB3456)",
  "booking_date": "string or null (YYYY-MM-DD format only)",
  "vessel_name": "string or null",
  "voyage_number": "string or null",
  "total_value": "string or null (invoice total amount with currency)",
  "confidence": "high | medium | low (your confidence in this extraction)"
}

IMPORTANT:
- Return ONLY the JSON object, nothing else. No \`\`\`json fences.
- For shipper/consignee, prefer full registered company names over abbreviations.
- For GSTIN, validate it's exactly 15 alphanumeric characters.
- Container numbers are always 4 letters + 7 digits (e.g. MSCU1234567).
- Dates must be YYYY-MM-DD. If you see "15/04/2026" output "2026-04-15".`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      throw new Error("Missing fileBase64 or mimeType");
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            { inline_data: { mime_type: mimeType, data: fileBase64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini API error (${geminiResponse.status}): ${errText}`);
    }

    const data = await geminiResponse.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Empty response from Gemini");

    // Parse the JSON Gemini returned
    let extracted;
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      throw new Error("Could not parse Gemini response as JSON: " + text.slice(0, 200));
    }

    return new Response(
      JSON.stringify({ success: true, extracted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});