import { useState, useRef } from "react";
import { supabase } from "./supabaseClient";

const NAVY = "#0d1e3c";
const ORANGE = "#f59e3c";
const BORDER = "#d0cad8";
const MUTED = "#5a6a7a";

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Compress image before sending (saves API tokens & speeds up)
async function compressImage(file, maxWidth = 1800, quality = 0.85) {
  if (!file.type.startsWith("image/") || file.type === "image/heic") return file;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxWidth / img.width);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        }, "image/jpeg", quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const FIELD_LABELS = {
  shipper: "Shipper",
  consignee: "Consignee",
  gst_number: "GST Number",
  eway_bill: "E-Way Bill",
  eway_valid_till: "Valid Till",
  quantity: "Quantity",
  cargo_weight: "Weight",
  goods_description: "Goods",
  container_no: "Container No.",
  container_size: "Container Size",
  seal_no: "Seal No.",
  vehicle_number: "Vehicle No.",
  booking_date: "Booking Date",
  vessel_name: "Vessel",
  voyage_number: "Voyage",
};

export default function AIDocReader({ onExtracted }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Max 10 MB.");
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      alert("Only photos (JPG/PNG) or PDF files are supported.");
      return;
    }

    setExtracting(true);
    setError(null);

    try {
      const compressed = await compressImage(file);
      const base64 = await fileToBase64(compressed);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            fileBase64: base64,
            mimeType: compressed.type,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error || "Extraction failed");

      setPreview(result.extracted);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const acceptExtraction = () => {
    if (!preview) return;
    // Filter to only fields with values, and exclude internal fields
    const filtered = {};
    Object.entries(preview).forEach(([k, v]) => {
      if (v && k !== "doc_type" && k !== "confidence" && k !== "total_value" && FIELD_LABELS[k]) {
        filtered[k] = v;
      }
    });
    onExtracted(filtered);
    setPreview(null);
  };

  const cancel = () => {
    setPreview(null);
    setError(null);
  };

  return (
    <div style={{
      background: "linear-gradient(135deg, #fff8f0 0%, #fef0dc 100%)",
      border: `1px solid #f5d090`,
      borderRadius: "10px", padding: "12px 14px", marginBottom: "16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <div style={{
          width: "32px", height: "32px", borderRadius: "8px",
          background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "16px",
        }}>✨</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: NAVY }}>Auto-fill from document</div>
          <div style={{ fontSize: "11px", color: "#7a4f00" }}>Upload an E-Way Bill, Invoice, or BL — AI fills the form for you.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} style={{ display: "none" }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />

        <button onClick={() => fileInputRef.current?.click()} disabled={extracting} style={{
          flex: 1, padding: "8px 12px", borderRadius: "8px",
          background: "#fff", border: "1px solid #f5d090",
          color: "#7a4f00", fontWeight: 600, fontSize: "12px",
          cursor: extracting ? "not-allowed" : "pointer",
          opacity: extracting ? 0.6 : 1,
          fontFamily: "inherit",
        }}>📎 Upload File</button>

        <button onClick={() => cameraInputRef.current?.click()} disabled={extracting} style={{
          flex: 1, padding: "8px 12px", borderRadius: "8px",
          background: "#fff", border: "1px solid #f5d090",
          color: "#7a4f00", fontWeight: 600, fontSize: "12px",
          cursor: extracting ? "not-allowed" : "pointer",
          opacity: extracting ? 0.6 : 1,
          fontFamily: "inherit",
        }}>📷 Take Photo</button>
      </div>

      {extracting && (
        <div style={{ marginTop: "12px", padding: "10px 12px", background: "#fff", borderRadius: "8px", border: "1px solid #f5d090", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "18px", height: "18px", border: "2px solid #f5d090", borderTopColor: ORANGE, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: "12px", color: NAVY, fontWeight: 600 }}>Reading document with AI...</div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: "12px", padding: "10px 12px", background: "#fdecea", borderRadius: "8px", border: "1px solid #f5b8b0", fontSize: "12px", color: "#c0392b" }}>
          ❌ {error}
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(13,30,60,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: "20px" }}>
          <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "440px", width: "100%", maxHeight: "85vh", overflow: "auto", boxShadow: "0 12px 40px rgba(13,30,60,0.3)" }}>
            <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ fontSize: "20px" }}>✨</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: NAVY }}>AI Extracted</div>
                <div style={{ fontSize: "11px", color: MUTED }}>Review the data, then accept or cancel.</div>
              </div>
              {preview.confidence && (
                <span style={{
                  padding: "3px 8px", borderRadius: "100px",
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                  background: preview.confidence === "high" ? "#dcf5e3" : preview.confidence === "medium" ? "#fef3e0" : "#fdecea",
                  color: preview.confidence === "high" ? "#15803d" : preview.confidence === "medium" ? "#a85c00" : "#c0392b",
                  fontFamily: "'DM Mono', monospace",
                }}>{preview.confidence}</span>
              )}
            </div>

            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {Object.entries(FIELD_LABELS).map(([key, label]) => {
                const value = preview[key];
                if (!value) return null;
                return (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", padding: "8px 10px", background: "#f8f6f3", borderRadius: "6px" }}>
                    <div style={{ fontSize: "10px", color: MUTED, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: "100px" }}>{label}</div>
                    <div style={{ fontSize: "12px", color: NAVY, fontWeight: 500, textAlign: "right", flex: 1, wordBreak: "break-word" }}>{value}</div>
                  </div>
                );
              })}
              {Object.keys(preview).every(k => !preview[k] || k === "doc_type" || k === "confidence") && (
                <div style={{ textAlign: "center", padding: "20px", color: MUTED, fontSize: "13px" }}>
                  AI couldn't extract any clear fields from this document. Try a clearer photo or different document.
                </div>
              )}
            </div>

            <div style={{ padding: "14px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: "8px" }}>
              <button onClick={cancel} style={{ flex: 1, padding: "10px", borderRadius: "8px", background: "#fff", border: `1px solid ${BORDER}`, color: MUTED, fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={acceptExtraction} style={{ flex: 2, padding: "10px", borderRadius: "8px", background: NAVY, color: "#fff", border: "none", fontWeight: 700, fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>✓ Use This Data</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}