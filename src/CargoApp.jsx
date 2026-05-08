import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import * as XLSX from "xlsx";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Globe from "react-globe.gl";
import { supabase } from "./supabaseClient";
import AIDocReader from "./AIDocReader";

// --- THEME CONSTANTS ---
const NAVY = "#0d1e3c";
const NAVY2 = "#1a3a6a";
const OFFWHITE = "#f0edf0";
const BORDER = "#d0cad8";
const MUTED = "#5a6a7a";
const TEXT = "#0d1e3c";

// --- Dynamic Glassmorphism Styles ---
const getGlassStyle = (isDark) => ({
  background: isDark ? "rgba(13, 30, 60, 0.45)" : "rgba(255, 255, 255, 0.65)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(255, 255, 255, 0.6)",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
  color: isDark ? "#f0edf0" : "#0d1e3c",
  transition: "all 0.3s ease"
});

const DARK_GLASS_STYLE = {
  background: "rgba(13, 30, 60, 0.85)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "3px solid #f59e3c",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
};

const STATUSES = [
  { id: "stuffing", label: "Stuffing", color: "#a85c00", bg: "#fef3e0", border: "#f5d090", icon: "📦" },
  { id: "loaded", label: "Loaded", color: "#1e40af", bg: "#e0e8f7", border: "#a8b8e0", icon: "🏗️" },
  { id: "sailed", label: "Sailed", color: "#6b21a8", bg: "#f3e8f7", border: "#d0b0e0", icon: "🚢" },
  { id: "delivered", label: "Delivered", color: "#15803d", bg: "#dcf5e3", border: "#9eddb8", icon: "✅" },
];

const VESSEL_EVENTS = [
  { id: "loading", label: "Loading", icon: "🏗️", color: "#1e40af" },
  { id: "sailed", label: "Sailed", icon: "🚢", color: "#6b21a8" },
  { id: "in_transit", label: "In Transit", icon: "🌊", color: "#0e7490" },
  { id: "berthed", label: "Berthed", icon: "⚓", color: "#a85c00" },
  { id: "discharging", label: "Discharging", icon: "📤", color: "#a85c00" },
  { id: "discharged", label: "Discharged", icon: "✅", color: "#15803d" },
  { id: "delayed", label: "Delayed", icon: "⏰", color: "#c0392b" },
  { id: "other", label: "Other", icon: "📝", color: "#5a6a7a" },
];

const CONTAINER_SIZES = ["20'", "40'", "40HC", "45HC"];

const FREIGHT_STATUSES = [
  { id: "to_pay", label: "To Pay", color: "#a85c00", bg: "#fef3e0", border: "#f5d090" },
  { id: "prepaid", label: "Prepaid", color: "#1e40af", bg: "#e0e8f7", border: "#a8b8e0" },
  { id: "paid", label: "Paid", color: "#15803d", bg: "#dcf5e3", border: "#9eddb8" },
];

const PAYMENT_STATUSES = [
  { id: "pending", label: "Pending", color: "#a85c00", bg: "#fef3e0", border: "#f5d090" },
  { id: "partial", label: "Partial", color: "#1e40af", bg: "#e0e8f7", border: "#a8b8e0" },
  { id: "paid", label: "Paid", color: "#15803d", bg: "#dcf5e3", border: "#9eddb8" },
];

const initialForm = {
  shipper: "", consignee: "", gst_number: "", eway_bill: "",
  quantity: "", goods_description: "", container_no: "", vehicle_number: "",
  booking_date: "", vessel_name: "", voyage_number: "", remarks: "",
  load_type: "", container_size: "", seal_no: "", cargo_weight: "",
  eway_valid_till: "", freight_status: "", payment_status: "",
};

// --- HELPER FUNCTIONS ---
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return dateStr; }
}

function formatDateTime(d) {
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(d) {
  const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return formatDate(d);
}

function getStatusInfo(id) { return STATUSES.find(s => s.id === id) || STATUSES[0]; }
function getVesselEvent(id) { return VESSEL_EVENTS.find(e => e.id === id) || VESSEL_EVENTS[VESSEL_EVENTS.length - 1]; }
function getFreightInfo(id) { return FREIGHT_STATUSES.find(s => s.id === id); }
function getPaymentInfo(id) { return PAYMENT_STATUSES.find(s => s.id === id); }

function getContainerLoadType(entries, meta) {
  if (meta?.load_type_override) return meta.load_type_override.toUpperCase();
  const types = entries.map(e => e.load_type).filter(Boolean);
  if (types.some(t => t.toUpperCase() === "LCL")) return "LCL";
  if (entries.length === 1 && types[0]?.toUpperCase() === "FCL") return "FCL";
  return entries.length === 1 ? "FCL" : "LCL";
}

function checkEwayExpiry(validTill) {
  if (!validTill) return null;
  try {
    const now = new Date();
    const expiry = new Date(validTill);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLeft = Math.ceil((expiry - now) / msPerDay);
    if (daysLeft < 0) return { state: "expired", daysLeft, message: `Expired ${Math.abs(daysLeft)}d ago` };
    if (daysLeft === 0) return { state: "today", daysLeft, message: "Expires today!" };
    if (daysLeft <= 1) return { state: "critical", daysLeft, message: "Expires tomorrow" };
    if (daysLeft <= 3) return { state: "warning", daysLeft, message: `${daysLeft}d left` };
    return null;
  } catch { return null; }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, c => c.charCodeAt(0));
}

async function logActivity({ action, entityType, entityId, containerNo, details, userEmail }) {
  try {
    await supabase.from("activity_log").insert({
      action, entity_type: entityType, entity_id: entityId,
      container_no: containerNo, details, user_email: userEmail,
    });
  } catch (err) { console.error("Activity log failed:", err); }
}

async function sendPushNotification(title, body, excludeUserId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ title, body, excludeUserId }),
    });
  } catch (err) { console.error("Push send failed:", err); }
}

// --- SHARED UI COMPONENTS ---
function Badge({ children, color = "navy" }) {
  const colors = {
    navy: { bg: "rgba(13,30,60,0.1)", text: NAVY, border: "rgba(13,30,60,0.2)" },
    amber: { bg: "rgba(168,92,0,0.1)", text: "#7a4f00", border: "rgba(168,92,0,0.2)" },
    green: { bg: "rgba(21,128,61,0.1)", text: "#1a5c32", border: "rgba(21,128,61,0.2)" },
    slate: { bg: "rgba(90,106,122,0.1)", text: MUTED, border: "rgba(90,106,122,0.2)" },
  };
  const c = colors[color];
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "4px",
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em",
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      fontFamily: "'DM Mono', monospace",
    }}>{children}</span>
  );
}

function StatusBadge({ status }) {
  const s = getStatusInfo(status);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "3px 9px", borderRadius: "6px",
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontFamily: "'DM Mono', monospace", textTransform: "uppercase",
    }}>{s.icon} {s.label}</span>
  );
}

const monoFields = new Set(["container_no", "vehicle_number", "gst_number", "eway_bill", "voyage_number"]);

const Field = memo(({ label, field, placeholder, required, half, value, error, onChange, type = "text", listId, list, isDarkMode }) => (
  <div style={{ gridColumn: half ? "span 1" : "span 2" }}>
    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", textAlign: "center" }}>
      {label} {required && <span style={{ color: "#c0392b" }}>*</span>}
    </label>
    <input type={type} list={listId} value={value || ""} onChange={e => onChange(field, e.target.value)} placeholder={placeholder}
      onFocus={(e) => { e.target.style.borderColor = error ? "#e74c3c" : "#f59e3c"; e.target.style.boxShadow = "0 0 0 3px rgba(245,158,60,0.15)"; }}
      onBlur={(e) => { e.target.style.borderColor = error ? "#e74c3c" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"); e.target.style.boxShadow = "none"; }}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: "8px",
        background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
        border: `1px solid ${error ? "#e74c3c" : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)")}`,
        color: isDarkMode ? "#fff" : TEXT, fontSize: "14px", outline: "none", boxSizing: "border-box",
        fontFamily: monoFields.has(field) ? "'DM Mono', monospace" : "inherit",
        transition: "all 0.2s ease"
      }}
    />
    {listId && list && <datalist id={listId}>{list.map(opt => <option key={opt} value={opt} />)}</datalist>}
    {error && <div style={{ fontSize: "11px", color: "#c0392b", marginTop: "4px", textAlign: "center" }}>{error}</div>}
  </div>
));

const PillSelector = memo(({ label, value, onChange, options, isDarkMode }) => (
  <div style={{ gridColumn: "span 1" }}>
    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", textAlign: "center" }}>{label}</label>
    <div style={{ display: "flex", gap: "4px" }}>
      {options.map(opt => (
        <button key={opt.value} type="button" onClick={() => onChange(opt.value === value ? "" : opt.value)}
          onMouseEnter={(e) => { if (value !== opt.value) { e.target.style.borderColor = "#f59e3c"; e.target.style.transform = "translateY(-1px)"; } }}
          onMouseLeave={(e) => { if (value !== opt.value) { e.target.style.borderColor = isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"; e.target.style.transform = "translateY(0)"; } }}
          style={{
            flex: 1, padding: "9px 4px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
            background: value === opt.value ? (opt.color || NAVY) : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)"),
            color: value === opt.value ? "#fff" : (isDarkMode ? "#cbd5e0" : NAVY),
            border: `1px solid ${value === opt.value ? (opt.color || NAVY) : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)")}`,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.2s ease"
          }}>{opt.label}</button>
      ))}
    </div>
  </div>
));

// --- SUB-COMPONENTS ---
function ContainerCard({ containerNo, entries, meta, userEmail, onEdit, onDelete, onUpdateStatus, onPrint, onExportContainer, onUpdateLoadType, isAdmin, glassStyle, isDarkMode }) {
  const [expanded, setExpanded] = useState(true);
  const [statusMenu, setStatusMenu] = useState(false);
  const status = meta?.status || "stuffing";
  const vehicle = entries[0]?.vehicle_number || "—";
  const statusInfo = getStatusInfo(status);

  return (
    <div style={{
      ...glassStyle,
      borderLeft: `5px solid ${statusInfo.color}`,
      borderRadius: "14px",
      overflow: "hidden",
      marginBottom: "16px",
      boxShadow: isDarkMode ? "0 4px 20px rgba(0,0,0,0.3)" : "0 2px 12px rgba(13,30,60,0.08)",
    }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`, cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>🚢</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "16px", fontWeight: 700, color: OFFWHITE, letterSpacing: "0.1em" }}>{containerNo}</div>
            <div style={{ fontSize: "12px", color: "rgba(240,237,240,0.65)", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {meta?.vessel_name ? `🛳 ${meta.vessel_name}${meta.voyage_number ? ` · V-${meta.voyage_number}` : ""} · ` : ""}🚛 {vehicle}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <div style={{ padding: "4px 10px", borderRadius: "20px", background: getContainerLoadType(entries, meta) === "FCL" ? "rgba(21,128,61,0.2)" : "rgba(168,92,0,0.2)", border: `1px solid ${getContainerLoadType(entries, meta) === "FCL" ? "rgba(21,128,61,0.4)" : "rgba(168,92,0,0.4)"}` }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: getContainerLoadType(entries, meta) === "FCL" ? "#4ade80" : "#fbbf24", letterSpacing: "0.08em" }}>{getContainerLoadType(entries, meta)}</span>
          </div>
          <div style={{ padding: "4px 10px", borderRadius: "20px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, color: OFFWHITE, letterSpacing: "0.05em" }}>{entries.length}</span>
          </div>
          <span style={{ color: "rgba(240,237,240,0.7)", fontSize: "18px", display: "inline-block", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", marginLeft: "4px" }}>▾</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <button onClick={(e) => { e.stopPropagation(); setStatusMenu(!statusMenu); }} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                <StatusBadge status={status} />
              </button>
              {statusMenu && (
                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: "6px", background: isDarkMode ? "rgba(13,30,60,0.95)" : "#fff", border: `1px solid ${BORDER}`, borderRadius: "10px", boxShadow: "0 6px 24px rgba(13,30,60,0.2)", zIndex: 50, minWidth: "160px", overflow: "hidden" }}>
                  {STATUSES.map(s => (
                    <button key={s.id} onClick={(e) => { e.stopPropagation(); onUpdateStatus(containerNo, s.id); setStatusMenu(false); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: status === s.id ? s.bg : "transparent", color: isDarkMode && status !== s.id ? "#fff" : s.color, fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>{s.icon} {s.label}</button>
                  ))}
                </div>
              )}
            </div>
            <select value={meta?.load_type_override || "auto"}
              onChange={(e) => { e.stopPropagation(); onUpdateLoadType(containerNo, e.target.value); }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.8)"}`, borderRadius: "6px", color: isDarkMode ? "#cbd5e0" : NAVY, padding: "6px 10px", fontSize: "11px", fontWeight: 600, fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>
              <option value="auto">AUTO ({getContainerLoadType(entries, meta)})</option>
              <option value="FCL">FCL</option>
              <option value="LCL">LCL</option>
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={(e) => { e.stopPropagation(); onExportContainer(containerNo); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(13,30,60,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: isDarkMode ? "#fff" : NAVY, padding: "6px 12px", fontSize: "11px", cursor: "pointer", fontWeight: 600, transition: "all 0.2s" }}>📊 Excel</button>
            <button onClick={(e) => { e.stopPropagation(); onPrint(containerNo); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(13,30,60,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: isDarkMode ? "#fff" : NAVY, padding: "6px 12px", fontSize: "11px", cursor: "pointer", fontWeight: 600, transition: "all 0.2s" }}>🖨 Print</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {entries.map((entry, idx) => (
              <div key={entry.id} style={{ background: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.8)"}`, borderRadius: "10px", padding: "16px", transition: "all 0.2s", ":hover": { background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.8)" } }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: MUTED, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)", padding: "2px 8px", borderRadius: "4px" }}>#{String(idx + 1).padStart(2, "0")}</span>
                    {entry.load_type && <Badge color={entry.load_type.toUpperCase() === "FCL" ? "green" : "amber"}>{entry.load_type.toUpperCase()}</Badge>}
                    {entry.booking_date && <Badge color="navy">{formatDate(entry.booking_date)}</Badge>}
                    {entry.created_by_email && <Badge color="slate">{entry.created_by_email.split("@")[0]}</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <button onClick={() => onEdit(entry)} onMouseEnter={(e) => { e.currentTarget.style.color = "#f59e3c"; }} onMouseLeave={(e) => { e.currentTarget.style.color = isDarkMode ? "#cbd5e0" : NAVY; }} style={{ background: "none", border: "none", color: isDarkMode ? "#cbd5e0" : NAVY, fontSize: "12px", cursor: "pointer", fontWeight: 600, padding: "4px 8px", borderRadius: "4px", transition: "all 0.2s" }}>✏️ Edit</button>
                    {isAdmin && (
                      <button onClick={() => onDelete(entry.id)} onMouseEnter={(e) => { e.currentTarget.style.color = "#e74c3c"; }} onMouseLeave={(e) => { e.currentTarget.style.color = "#c0392b"; }} style={{ background: "none", border: "none", color: "#c0392b", fontSize: "12px", cursor: "pointer", fontWeight: 600, padding: "4px 8px", borderRadius: "4px", transition: "all 0.2s" }}>🗑️ Delete</button>
                    )}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    ["Shipper", entry.shipper], ["Consignee", entry.consignee],
                    ["GST No.", entry.gst_number || "—"], ["E-Way Bill", entry.eway_bill || "—"],
                    ["Quantity", entry.quantity || "—"], ["Goods", entry.goods_description],
                    entry.container_size && ["Size", entry.container_size],
                    entry.seal_no && ["Seal No.", entry.seal_no],
                    entry.cargo_weight && ["Weight", entry.cargo_weight],
                  ].filter(Boolean).map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: "10px", color: MUTED, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>{label}</div>
                      <div style={{ fontSize: "13px", fontWeight: 500, wordBreak: "break-word" }}>{value}</div>
                    </div>
                  ))}
                </div>

                {(entry.freight_status || entry.payment_status) && (
                  <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
                    {entry.freight_status && (() => {
                      const f = getFreightInfo(entry.freight_status);
                      return f ? <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", background: f.bg, color: f.color, border: `1px solid ${f.border}`, fontFamily: "'DM Mono', monospace", textTransform: "uppercase" }}>💰 Freight {f.label}</span> : null;
                    })()}
                    {entry.payment_status && (() => {
                      const p = getPaymentInfo(entry.payment_status);
                      return p ? <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", background: p.bg, color: p.color, border: `1px solid ${p.border}`, fontFamily: "'DM Mono', monospace", textTransform: "uppercase" }}>💳 Payment {p.label}</span> : null;
                    })()}
                  </div>
                )}

                {(() => {
                  const expiry = checkEwayExpiry(entry.eway_valid_till);
                  if (!expiry) return null;
                  const colors = {
                    expired: { bg: "rgba(192,57,43,0.1)", border: "rgba(192,57,43,0.2)", color: "#c0392b", icon: "🚨" },
                    today: { bg: "rgba(192,57,43,0.1)", border: "rgba(192,57,43,0.2)", color: "#c0392b", icon: "🚨" },
                    critical: { bg: "rgba(168,92,0,0.1)", border: "rgba(168,92,0,0.2)", color: "#a85c00", icon: "⚠️" },
                    warning: { bg: "rgba(168,92,0,0.1)", border: "rgba(168,92,0,0.2)", color: "#a85c00", icon: "⏰" },
                  };
                  const c = colors[expiry.state];
                  return (
                    <div style={{ marginTop: "8px", padding: "8px 10px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px" }}>{c.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "11px", color: c.color, fontWeight: 700 }}>E-Way Bill {expiry.message}</div>
                        <div style={{ fontSize: "10px", color: c.color, opacity: 0.75 }}>Valid till {formatDate(entry.eway_valid_till)}</div>
                      </div>
                    </div>
                  );
                })()}

                {entry.remarks && (
                  <div style={{ marginTop: "8px", padding: "8px 10px", background: "rgba(245,158,60,0.1)", border: "1px solid rgba(245,158,60,0.3)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "10px", color: "#a85c00", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>📝 Remarks</div>
                    <div style={{ fontSize: "12px", color: "#7a4f00" }}>{entry.remarks}</div>
                  </div>
                )}
                <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: `1px solid rgba(0,0,0,0.05)`, fontSize: "10px", color: MUTED }}>
                  Logged: {new Date(entry.created_at).toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({ entries, containerMeta, glassStyle, isDarkMode }) {
  const stats = useMemo(() => {
    const containers = {};
    entries.forEach(e => {
      const k = e.container_no.trim().toUpperCase();
      if (!containers[k]) containers[k] = [];
      containers[k].push(e);
    });
    const statusCounts = STATUSES.map(s => ({ name: s.label, value: Object.keys(containers).filter(k => (containerMeta[k]?.status || "stuffing") === s.id).length, color: s.color, icon: s.icon }));
    const shipperCounts = {}, consigneeCounts = {};
    entries.forEach(e => {
      shipperCounts[e.shipper] = (shipperCounts[e.shipper] || 0) + 1;
      consigneeCounts[e.consignee] = (consigneeCounts[e.consignee] || 0) + 1;
    });
    const topShippers = Object.entries(shipperCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    const topConsignees = Object.entries(consigneeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    const monthly = {};
    entries.forEach(e => {
      const d = e.booking_date ? new Date(e.booking_date) : new Date(e.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[k] = (monthly[k] || 0) + 1;
    });
    const monthlyData = Object.entries(monthly).sort().slice(-6).map(([k, v]) => ({ month: k.slice(2), count: v }));
    return { totalContainers: Object.keys(containers).length, totalCargos: entries.length, statusCounts, topShippers, topConsignees, monthlyData };
  }, [entries, containerMeta]);

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", ...glassStyle, borderRadius: "14px" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>📊</div>
        <div style={{ fontSize: "16px", color: isDarkMode ? "#fff" : NAVY, fontWeight: 600 }}>No data to display</div>
      </div>
    );
  }

  const statCard = (label, value, icon, color) => (
    <div style={{ ...glassStyle, borderRadius: "14px", padding: "18px 16px", textAlign: "center", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: "-10px", right: "-10px", fontSize: "40px", opacity: 0.1 }}>{icon}</div>
      <div style={{ fontSize: "10px", color: color || MUTED, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "32px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, fontFamily: "'DM Mono', monospace", lineHeight: 1.2 }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        {statCard("Containers", stats.totalContainers, "🚢", "#f59e3c")}
        {statCard("Total Cargos", stats.totalCargos, "📦", "#1e40af")}
      </div>

      {/* Status Bar Chart */}
      <div style={{ ...glassStyle, borderRadius: "14px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>📊</span> Containers by Status
        </div>
        {stats.statusCounts.map(s => {
          const pct = (s.value / Math.max(stats.totalContainers, 1)) * 100;
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <div style={{ width: "80px", fontSize: "11px", color: s.color, fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                {s.icon} {s.name}
              </div>
              <div style={{ flex: 1, height: "24px", background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)", borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${s.color} 0%, ${s.color}cc 100%)`, transition: "width 0.5s ease", borderRadius: "6px" }} />
              </div>
              <div style={{ width: "36px", textAlign: "right", fontSize: "14px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Monthly Line Chart */}
      {stats.monthlyData.length > 1 && (
        <div style={{ ...glassStyle, borderRadius: "14px", padding: "18px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>📈</span> Cargo Trend (Last 6 Months)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stats.monthlyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={isDarkMode ? "#f59e3c" : NAVY} />
                  <stop offset="100%" stopColor={isDarkMode ? "#fbbf24" : NAVY2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"} vertical={false} />
              <XAxis dataKey="month" stroke={MUTED} style={{ fontSize: "11px" }} tickLine={false} axisLine={false} />
              <YAxis stroke={MUTED} style={{ fontSize: "11px" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: "10px", background: isDarkMode ? "rgba(13, 30, 60, 0.95)" : "rgba(255,255,255,0.95)", border: "none", color: isDarkMode ? "#fff" : NAVY, fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }} />
              <Line type="monotone" dataKey="count" stroke="url(#colorCount)" strokeWidth={3} dot={{ fill: isDarkMode ? "#f59e3c" : NAVY, r: 5, strokeWidth: 2, stroke: isDarkMode ? "rgba(13,30,60,0.3)" : "#fff" }} activeDot={{ r: 7, fill: isDarkMode ? "#fbbf24" : NAVY2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Shippers */}
      <div style={{ ...glassStyle, borderRadius: "14px", padding: "18px", marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>🏢</span> Top Shippers
        </div>
        {stats.topShippers.map((s, i) => {
          const maxCount = stats.topShippers[0]?.count || 1;
          const barWidth = (s.count / maxCount) * 100;
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: MUTED, minWidth: "18px" }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "4px", color: isDarkMode ? "#fff" : NAVY }}>{s.name}</div>
                <div style={{ height: "6px", background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barWidth}%`, background: isDarkMode ? "linear-gradient(90deg, #f59e3c, #fbbf24)" : "linear-gradient(90deg, #0d1e3c, #1a3a6a)", borderRadius: "3px" }} />
                </div>
              </div>
              <Badge color="amber">{s.count}</Badge>
            </div>
          );
        })}
      </div>

      {/* Top Consignees */}
      <div style={{ ...glassStyle, borderRadius: "14px", padding: "18px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "16px" }}>🎯</span> Top Consignees
        </div>
        {stats.topConsignees.map((s, i) => {
          const maxCount = stats.topConsignees[0]?.count || 1;
          const barWidth = (s.count / maxCount) * 100;
          return (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: MUTED, minWidth: "18px" }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "4px", color: isDarkMode ? "#fff" : NAVY }}>{s.name}</div>
                <div style={{ height: "6px", background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barWidth}%`, background: isDarkMode ? "linear-gradient(90deg, #1e40af, #3b82f6)" : "linear-gradient(90deg, #0d1e3c, #1a3a6a)", borderRadius: "3px" }} />
                </div>
              </div>
              <Badge color="navy">{s.count}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActivityTab({ activities, glassStyle, isDarkMode }) {
  if (activities.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", ...glassStyle, borderRadius: "14px" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>📜</div>
        <div style={{ fontSize: "16px", color: isDarkMode ? "#fff" : NAVY, fontWeight: 600 }}>No activity yet</div>
      </div>
    );
  }
  const actionIcons = {
    cargo_created: { icon: "➕", color: "#15803d", label: "Cargo Added" },
    cargo_updated: { icon: "✏️", color: "#1e40af", label: "Cargo Updated" },
    cargo_deleted: { icon: "🗑️", color: "#c0392b", label: "Cargo Deleted" },
    status_changed: { icon: "🔄", color: "#a85c00", label: "Status Changed" },
    vessel_movement: { icon: "🚢", color: "#6b21a8", label: "Vessel Movement" },
  };
  return (
    <div style={{ ...glassStyle, borderRadius: "14px", padding: "6px" }}>
      {activities.map((a, i) => {
        const info = actionIcons[a.action] || { icon: "📝", color: MUTED, label: a.action };
        const userName = a.user_email ? a.user_email.split("@")[0] : "Someone";
        return (
          <div key={a.id} style={{ padding: "14px 12px", borderBottom: i < activities.length - 1 ? `1px solid ${isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"}` : "none", display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: isDarkMode ? `${info.color}20` : `${info.color}15`, color: info.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>{info.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ color: isDarkMode ? "#fff" : NAVY }}>{userName}</span>
                <span style={{ color: MUTED, fontWeight: 400 }}>·</span>
                <span style={{ color: info.color }}>{info.label}</span>
                {a.container_no && <span style={{ fontFamily: "'DM Mono', monospace", color: MUTED, fontSize: "11px", background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)", padding: "2px 6px", borderRadius: "4px" }}>{a.container_no}</span>}
              </div>
              {a.details && (
                <div style={{ fontSize: "12px", color: isDarkMode ? "#cbd5e0" : MUTED, marginTop: "4px" }}>
                  {a.details.summary || (a.details.shipper && `${a.details.shipper} → ${a.details.consignee}`) || (a.details.from && `${a.details.from} → ${a.details.to}`)}
                </div>
              )}
              <div style={{ fontSize: "11px", color: MUTED, marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                <span>🕐</span> {timeAgo(a.created_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VesselGlobe({ vesselMovements, isDarkMode }) {
  const globeEl = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 0, height: 400 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: 400
        });
      }
    };
    updateSize(); 
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const latestMovements = useMemo(() => {
    const map = {};
    const sorted = [...vesselMovements].sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
    
    sorted.forEach(m => {
      if (m.latitude && m.longitude && !map[m.vessel_name]) {
        map[m.vessel_name] = {
          name: m.vessel_name,
          lat: parseFloat(m.latitude),
          lng: parseFloat(m.longitude),
          color: "#f59e3c" 
        };
      }
    });
    return Object.values(map);
  }, [vesselMovements]);

  useEffect(() => {
    if (globeEl.current) {
      globeEl.current.controls().autoRotate = true;
      globeEl.current.controls().autoRotateSpeed = 0.5;
      
      if (latestMovements.length > 0) {
        globeEl.current.pointOfView({ lat: latestMovements[0].lat, lng: latestMovements[0].lng, altitude: 1.5 });
      } else {
        globeEl.current.pointOfView({ lat: 22.57, lng: 88.36, altitude: 1.5 }); 
      }
    }
  }, [latestMovements]);

  return (
    <div ref={containerRef} style={{ height: "400px", width: "100%", borderRadius: "12px", overflow: "hidden", border: isDarkMode ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.6)", boxShadow: "0 8px 32px rgba(13, 30, 60, 0.15)", marginBottom: "16px", backgroundColor: "#0d1e3c" }}>
      {dimensions.width > 0 && (
        <Globe
          ref={globeEl}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          backgroundColor="#0d1e3c"
          pointsData={latestMovements}
          pointColor="color"
          pointAltitude={0.05}
          pointRadius={0.5}
          labelsData={latestMovements}
          labelLabel="name"
          labelColor={() => "white"}
          labelDotRadius={0.5}
          labelAltitude={0.1}
        />
      )}
    </div>
  );
}

function VesselTab({ vesselMovements, uniqueVessels, onAdd, onDelete, isAdmin, showToast, glassStyle, isDarkMode }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ vessel_name: "", voyage_number: "", event_type: "sailed", event_date: "", location: "", notes: "", latitude: "", longitude: "" });
  const [submitting, setSubmitting] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  const grouped = useMemo(() => {
    const g = {};
    vesselMovements.forEach(m => {
      const key = `${m.vessel_name}|${m.voyage_number || "-"}`;
      if (!g[key]) g[key] = { vessel_name: m.vessel_name, voyage_number: m.voyage_number, events: [] };
      g[key].events.push(m);
    });
    Object.values(g).forEach(v => v.events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date)));
    return Object.values(g).sort((a, b) => {
      const aLatest = a.events[0]?.event_date || 0;
      const bLatest = b.events[0]?.event_date || 0;
      return new Date(bLatest) - new Date(aLatest);
    });
  }, [vesselMovements]);

  const handleSubmit = async () => {
    if (!form.vessel_name.trim() || !form.event_date) return;
    setSubmitting(true);
    await onAdd({ ...form });
    setForm({ vessel_name: "", voyage_number: "", event_type: "sailed", event_date: "", location: "", notes: "", latitude: "", longitude: "" });
    setShowForm(false);
    setSubmitting(false);
  };

  const fetchLiveLocation = async () => {
    if (!form.location) {
      showToast("Please enter a Location Name first (e.g., 'Kolkata Port').", "error");
      return;
    }

    setFetchingLocation(true);
    try {
      const searchQuery = encodeURIComponent(form.location);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=1`);
      const data = await res.json();

      if (data && data.length > 0) {
        const place = data[0];
        setForm(f => ({
          ...f,
          latitude: parseFloat(place.lat).toFixed(4),
          longitude: parseFloat(place.lon).toFixed(4),
        }));
        showToast(`Coordinates found for ${place.display_name.split(',')[0]}!`);
      } else {
        showToast("Location not found on the map. Try being more specific.", "error");
      }
    } catch (err) {
      showToast("Failed to fetch coordinates.", "error");
      console.error(err);
    }
    setFetchingLocation(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, margin: 0 }}>🚢 Vessel Movements</h2>
          <p style={{ fontSize: "12px", color: isDarkMode ? "#a0aec0" : MUTED, margin: "4px 0 0" }}>{grouped.length} voyage{grouped.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: "9px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
          background: showForm ? (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)") : (isDarkMode ? "#f59e3c" : `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`),
          border: isDarkMode ? "none" : "1px solid rgba(255,255,255,0.6)",
          color: showForm ? (isDarkMode ? "#fff" : NAVY) : OFFWHITE, cursor: "pointer",
        }}>{showForm ? "✕ Cancel" : "+ Add Movement"}</button>
      </div>

      <VesselGlobe vesselMovements={vesselMovements} isDarkMode={isDarkMode} />

      {showForm && (
        <div style={{ ...glassStyle, borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Vessel Name *</label>
              <input list="vessels-list-mov" value={form.vessel_name} onChange={e => setForm({ ...form, vessel_name: e.target.value })} placeholder="e.g. MV APJ Karan 2"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", color: isDarkMode ? "#fff" : "#000" }} />
              <datalist id="vessels-list-mov">{uniqueVessels.map(v => <option key={v} value={v} />)}</datalist>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Voyage No.</label>
              <input value={form.voyage_number} onChange={e => setForm({ ...form, voyage_number: e.target.value })} placeholder="e.g. 024"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", fontFamily: "'DM Mono', monospace", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", color: isDarkMode ? "#fff" : "#000" }} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Event Type *</label>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {VESSEL_EVENTS.map(ev => (
                  <button key={ev.id} onClick={() => setForm({ ...form, event_type: ev.id })} style={{
                    padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                    background: form.event_type === ev.id ? ev.color : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)"),
                    color: form.event_type === ev.id ? "#fff" : ev.color,
                    border: `1px solid ${form.event_type === ev.id ? ev.color : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)")}`, cursor: "pointer", transition: "all 0.2s"
                  }}>{ev.icon} {ev.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Date & Time *</label>
              <input type="datetime-local" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", color: isDarkMode ? "#fff" : "#000" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Location Name</label>
              <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Kolkata Port"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", color: isDarkMode ? "#fff" : "#000" }} />
            </div>
            
            <div style={{ gridColumn: "span 2", display: "flex", gap: "12px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Latitude</label>
                <input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="e.g. 22.57"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", fontFamily: "'DM Mono', monospace", color: isDarkMode ? "#fff" : "#000" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Longitude</label>
                <input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="e.g. 88.36"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", fontFamily: "'DM Mono', monospace", color: isDarkMode ? "#fff" : "#000" }} />
              </div>
              <button onClick={fetchLiveLocation} disabled={fetchingLocation} type="button" style={{
                height: "37px", padding: "0 16px", borderRadius: "8px", background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)", color: isDarkMode ? "#fff" : NAVY, border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)"}`, fontWeight: 600, fontSize: "12px", cursor: fetchingLocation ? "not-allowed" : "pointer", whiteSpace: "nowrap"
              }}>
                {fetchingLocation ? "⏳ Searching..." : "📍 Get Coordinates from Location"}
              </button>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional details..." rows={2}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", fontFamily: "inherit", resize: "vertical", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", color: isDarkMode ? "#fff" : "#000" }} />
            </div>
          </div>
          <button onClick={handleSubmit} disabled={submitting || !form.vessel_name.trim() || !form.event_date}
            style={{ marginTop: "14px", width: "100%", padding: "10px", borderRadius: "8px", background: isDarkMode ? "#f59e3c" : NAVY, color: "#fff", border: "none", fontWeight: 700, fontSize: "13px", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Saving..." : "💾 Log Movement"}
          </button>
        </div>
      )}

      {grouped.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", ...glassStyle, borderRadius: "14px" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚢</div>
          <div style={{ fontSize: "16px", fontWeight: 600 }}>No vessel movements logged</div>
        </div>
      ) : grouped.map(v => (
        <div key={`${v.vessel_name}-${v.voyage_number}`} style={{ ...glassStyle, borderRadius: "12px", marginBottom: "12px", overflow: "hidden" }}>
          <div style={{ background: `linear-gradient(90deg, ${NAVY} 0%, ${NAVY2} 100%)`, padding: "12px 16px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: OFFWHITE }}>🛳 {v.vessel_name}</div>
            {v.voyage_number && <div style={{ fontSize: "11px", color: "rgba(240,237,240,0.7)", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>Voyage {v.voyage_number}</div>}
          </div>
          <div style={{ padding: "8px" }}>
            {v.events.map((e, i) => {
              const ev = getVesselEvent(e.event_type);
              return (
                <div key={e.id} style={{ display: "flex", gap: "10px", padding: "10px", alignItems: "flex-start", borderBottom: i < v.events.length - 1 ? `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"}` : "none" }}>
                  <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: `${ev.color}15`, color: ev.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>{ev.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: ev.color }}>{ev.label}</span>
                      {e.location && <span style={{ fontSize: "12px", color: isDarkMode ? "#cbd5e0" : MUTED }}>· 📍 {e.location}</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: isDarkMode ? "#cbd5e0" : MUTED, marginTop: "2px" }}>
                      {formatDateTime(e.event_date)} 
                      {e.latitude && e.longitude && <span style={{ fontFamily: "'DM Mono', monospace", marginLeft: "6px" }}>(Lat: {e.latitude}, Lng: {e.longitude})</span>}
                    </div>
                    {e.notes && <div style={{ fontSize: "12px", marginTop: "4px", padding: "6px 8px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.5)", borderRadius: "4px" }}>{e.notes}</div>}
                    {e.created_by_email && <div style={{ fontSize: "10px", color: isDarkMode ? "#cbd5e0" : MUTED, marginTop: "4px" }}>Logged by {e.created_by_email.split("@")[0]} • {timeAgo(e.created_at)}</div>}
                  </div>
                  {isAdmin && (
                    <button onClick={() => onDelete(e.id)} style={{ background: "transparent", border: "none", color: "#c0392b", cursor: "pointer", fontSize: "12px", padding: "4px" }}>🗑️</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrintView({ containerNo, entries, meta, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ background: "#fff", color: "#000", padding: "32px", fontFamily: "'DM Sans', sans-serif", minHeight: "100vh" }}>
      <style>{`@media print { @page { size: A4; margin: 15mm; } body { background: #fff !important; } .no-print { display: none !important; } }`}</style>
      <div className="no-print" style={{ marginBottom: "20px", padding: "10px", background: OFFWHITE, borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "13px", color: MUTED }}>Print preview</div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => window.print()} style={{ padding: "8px 16px", background: NAVY, color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, cursor: "pointer" }}>🖨 Print</button>
          <button onClick={onClose} style={{ padding: "8px 16px", background: "#fff", color: NAVY, border: `1px solid ${BORDER}`, borderRadius: "6px", fontWeight: 600, cursor: "pointer" }}>✕ Close</button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", borderBottom: `2px solid ${NAVY}`, paddingBottom: "16px", marginBottom: "20px" }}>
        <img src="/kraft-logo.png" alt="Kraft" style={{ width: "70px", height: "70px", objectFit: "contain" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: NAVY }}>Kraft Shipping & Logistics Pvt. Ltd.</div>
          <div style={{ fontSize: "13px", color: MUTED }}>Container Manifest</div>
        </div>
        <div style={{ textAlign: "right", fontSize: "11px", color: MUTED }}><div>Generated: {new Date().toLocaleString("en-IN")}</div></div>
      </div>
      <table style={{ width: "100%", marginBottom: "20px", fontSize: "13px" }}>
        <tbody>
          <tr><td style={{ padding: "6px 0", fontWeight: 600, color: MUTED, width: "150px" }}>CONTAINER NO.</td><td style={{ padding: "6px 0", fontFamily: "'DM Mono', monospace", fontWeight: 700, color: NAVY }}>{containerNo}</td></tr>
          <tr><td style={{ padding: "6px 0", fontWeight: 600, color: MUTED }}>STATUS</td><td style={{ padding: "6px 0" }}>{getStatusInfo(meta?.status || "stuffing").label}</td></tr>
          {meta?.vessel_name && <tr><td style={{ padding: "6px 0", fontWeight: 600, color: MUTED }}>VESSEL</td><td style={{ padding: "6px 0" }}>{meta.vessel_name}{meta.voyage_number ? ` · Voyage ${meta.voyage_number}` : ""}</td></tr>}
          <tr><td style={{ padding: "6px 0", fontWeight: 600, color: MUTED }}>VEHICLE</td><td style={{ padding: "6px 0", fontFamily: "'DM Mono', monospace" }}>{entries[0]?.vehicle_number || "—"}</td></tr>
          <tr><td style={{ padding: "6px 0", fontWeight: 600, color: MUTED }}>TOTAL CARGOS</td><td style={{ padding: "6px 0" }}>{entries.length}</td></tr>
        </tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ background: NAVY, color: "#fff" }}>
            {["#", "Shipper", "Consignee", "GST No.", "E-Way Bill", "Qty", "Goods", "Date"].map(h => <th key={h} style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id} style={{ background: i % 2 ? "#f8f6f8" : "#fff" }}>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}` }}>{i + 1}</td>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}` }}>{e.shipper}</td>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}` }}>{e.consignee}</td>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}`, fontFamily: "'DM Mono', monospace" }}>{e.gst_number || ""}</td>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}`, fontFamily: "'DM Mono', monospace" }}>{e.eway_bill || ""}</td>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}` }}>{e.quantity || "—"}</td>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}` }}>{e.goods_description}</td>
              <td style={{ padding: "6px 8px", border: `1px solid ${BORDER}` }}>{formatDate(e.booking_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: "60px", display: "flex", justifyContent: "space-between", fontSize: "11px", color: MUTED }}>
        <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px", textAlign: "center" }}>Authorized Signatory</div>
        <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px", textAlign: "center" }}>Stamp & Seal</div>
      </div>
    </div>
  );
}

// --- TEAM MANAGEMENT TAB COMPONENT ---
function TeamTab({ isAdmin, userEmail, glassStyle, isDarkMode }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchTeam(); }, []);

  const fetchTeam = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: roles } = await supabase.from('user_roles').select('*');
    if (profiles && roles) {
      setTeam(profiles.map(p => ({
        ...p,
        role: roles.find(r => r.user_id === p.id)?.role || 'staff'
      })));
    }
    setLoading(false);
  };

  const handlePasswordReset = async (targetUserId, email) => {
    const newPassword = prompt(`Enter a new temporary password for ${email}:`);
    if (!newPassword || newPassword.length < 6) return alert("Password must be at least 6 characters.");
    try {
      const { error } = await supabase.functions.invoke('admin-user-manager', {
        body: { action: 'reset_password', targetUserId, newPassword }
      });
      if (error) throw error;
      alert(`Password successfully updated for ${email}.`);
    } catch (err) { alert(err.message); }
  };

  const handleRemoveUser = async (targetUserId, email) => {
    if (!window.confirm(`Are you sure you want to delete ${email}?`)) return;
    try {
      const { error } = await supabase.functions.invoke('admin-user-manager', {
        body: { action: 'delete_user', targetUserId }
      });
      if (error) throw error;
      setTeam(prev => prev.filter(u => u.id !== targetUserId));
      alert(`${email} has been removed.`);
    } catch (err) { alert(err.message); }
  };

  // --- NEW FUNCTION: CHANGE ROLE ---
  const handleRoleChange = async (targetUserId, email, newRole) => {
    if (!window.confirm(`Change ${email}'s role to ${newRole.toUpperCase()}?`)) return;
    try {
      const { error } = await supabase.functions.invoke('admin-user-manager', {
        body: { action: 'update_role', targetUserId, newRole }
      });
      if (error) throw error;
      setTeam(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));
      alert(`${email} is now a ${newRole}.`);
    } catch (err) { alert(err.message); }
  };

  if (!isAdmin) return <div style={{ padding: "40px", textAlign: "center" }}>🔒 Access Denied</div>;

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, marginBottom: "4px" }}>👥 Team Management</h2>
      <p style={{ fontSize: "12px", color: isDarkMode ? "#cbd5e0" : MUTED, marginBottom: "16px" }}>Admin only: Reset passwords, change roles, or remove staff access.</p>
      
      {loading ? <div style={{ textAlign: "center", padding: "20px" }}>Loading team members...</div> : (
        <div style={{ ...glassStyle, borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: NAVY, color: OFFWHITE, textAlign: "left" }}>
                <th style={{ padding: "12px 16px" }}>Email</th>
                <th style={{ padding: "12px 16px" }}>Role</th>
                <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {team.map((user, i) => (
                <tr key={user.id} style={{ borderBottom: i < team.length - 1 ? `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : BORDER}` : "none" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{user.email}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {/* UPDATED ROLE CELL */}
                    {user.email === userEmail ? (
                       <Badge color="amber">ADMIN (YOU)</Badge>
                    ) : (
                      <select 
                        value={user.role} 
                        onChange={(e) => handleRoleChange(user.id, user.email, e.target.value)}
                        style={{ 
                          padding: "4px 8px", 
                          borderRadius: "4px", 
                          fontSize: "11px", 
                          fontWeight: 700, 
                          border: `1px solid ${user.role === 'admin' ? '#f5d090' : '#a8b8e0'}`, 
                          background: user.role === 'admin' ? 'rgba(168,92,0,0.1)' : 'rgba(13,30,60,0.1)', 
                          color: user.role === 'admin' ? '#7a4f00' : NAVY,
                          cursor: "pointer",
                          outline: "none",
                          textTransform: "uppercase",
                          fontFamily: "'DM Mono', monospace"
                        }}>
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    {user.email !== userEmail && (
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button onClick={() => handlePasswordReset(user.id, user.email)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: isDarkMode ? "rgba(255,255,255,0.1)" : "#fff", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.2)" : BORDER}`, color: isDarkMode ? "#fff" : NAVY, cursor: "pointer" }}>🔑 Reset</button>
                        <button onClick={() => handleRemoveUser(user.id, user.email)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "rgba(192,57,43,0.1)", border: "1px solid rgba(192,57,43,0.2)", color: "#c0392b", cursor: "pointer" }}>🗑️ Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- PRICING & MARGIN CALCULATOR COMPONENT ---
function PricingCalculator({ glassStyle, isDarkMode }) {
  const [calcForm, setCalcForm] = useState({
    route: "",
    containerType: "20'",
    buyOceanFreight: 0,
    buyOriginCharges: 0,
    buyDestCharges: 0,
    buyCustoms: 0,
    sellOceanFreight: 0,
    sellOriginCharges: 0,
    sellDestCharges: 0,
    sellCustoms: 0,
  });

  const handleCalcChange = (field, value) => {
    setCalcForm(prev => ({ ...prev, [field]: parseFloat(value) || 0 }));
  };

  const totalBuy = calcForm.buyOceanFreight + calcForm.buyOriginCharges + calcForm.buyDestCharges + calcForm.buyCustoms;
  const totalSell = calcForm.sellOceanFreight + calcForm.sellOriginCharges + calcForm.sellDestCharges + calcForm.sellCustoms;
  const netProfit = totalSell - totalBuy;
  const marginPercent = totalSell > 0 ? ((netProfit / totalSell) * 100).toFixed(2) : 0;

  const inputStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "6px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
    background: isDarkMode ? "rgba(255,255,255,0.05)" : "#fff", color: isDarkMode ? "#fff" : "#000", fontFamily: "'DM Mono', monospace"
  };

  const labelStyle = { display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, textTransform: "uppercase", marginBottom: "4px" };

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, margin: 0 }}>💰 Pricing & Margins</h2>
        <p style={{ fontSize: "12px", color: isDarkMode ? "#cbd5e0" : MUTED, margin: "4px 0 0" }}>Calculate route profitability and quotes.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", alignItems: "start" }}>
        
        {/* LEFT COLUMN: INPUTS */}
        <div style={{ ...glassStyle, borderRadius: "14px", padding: "20px" }}>
          
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Route Reference</label>
            <input type="text" placeholder="e.g. Kolkata to Jebel Ali" style={{...inputStyle, fontFamily: "inherit"}} 
              onChange={e => setCalcForm(prev => ({ ...prev, route: e.target.value }))} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ padding: "12px", background: "rgba(192,57,43,0.05)", borderRadius: "8px", border: "1px solid rgba(192,57,43,0.1)" }}>
               <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#c0392b", marginBottom: "12px", borderBottom: "1px solid rgba(192,57,43,0.1)", paddingBottom: "4px" }}>Buy Rates (Costs)</h4>
               <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div><label style={labelStyle}>Ocean Freight</label><input type="number" style={inputStyle} value={calcForm.buyOceanFreight || ''} onChange={e => handleCalcChange("buyOceanFreight", e.target.value)} /></div>
                  <div><label style={labelStyle}>Origin THC/Fees</label><input type="number" style={inputStyle} value={calcForm.buyOriginCharges || ''} onChange={e => handleCalcChange("buyOriginCharges", e.target.value)} /></div>
                  <div><label style={labelStyle}>Dest. THC/Fees</label><input type="number" style={inputStyle} value={calcForm.buyDestCharges || ''} onChange={e => handleCalcChange("buyDestCharges", e.target.value)} /></div>
                  <div><label style={labelStyle}>Customs/Misc</label><input type="number" style={inputStyle} value={calcForm.buyCustoms || ''} onChange={e => handleCalcChange("buyCustoms", e.target.value)} /></div>
               </div>
            </div>

            <div style={{ padding: "12px", background: "rgba(21,128,61,0.05)", borderRadius: "8px", border: "1px solid rgba(21,128,61,0.1)" }}>
               <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#15803d", marginBottom: "12px", borderBottom: "1px solid rgba(21,128,61,0.1)", paddingBottom: "4px" }}>Sell Rates (Revenue)</h4>
               <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div><label style={labelStyle}>Ocean Freight</label><input type="number" style={inputStyle} value={calcForm.sellOceanFreight || ''} onChange={e => handleCalcChange("sellOceanFreight", e.target.value)} /></div>
                  <div><label style={labelStyle}>Origin THC/Fees</label><input type="number" style={inputStyle} value={calcForm.sellOriginCharges || ''} onChange={e => handleCalcChange("sellOriginCharges", e.target.value)} /></div>
                  <div><label style={labelStyle}>Dest. THC/Fees</label><input type="number" style={inputStyle} value={calcForm.sellDestCharges || ''} onChange={e => handleCalcChange("sellDestCharges", e.target.value)} /></div>
                  <div><label style={labelStyle}>Customs/Misc</label><input type="number" style={inputStyle} value={calcForm.sellCustoms || ''} onChange={e => handleCalcChange("sellCustoms", e.target.value)} /></div>
               </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RESULTS */}
        <div style={{ ...glassStyle, borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
           <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY }}>{calcForm.route || "Summary"}</h3>
           
           <div style={{ background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)", padding: "16px", borderRadius: "8px", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "11px", color: MUTED, textTransform: "uppercase", fontWeight: 700 }}>Total Cost</div>
                <div style={{ fontSize: "20px", color: "#c0392b", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>${totalBuy.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: MUTED, textTransform: "uppercase", fontWeight: 700 }}>Total Revenue</div>
                <div style={{ fontSize: "20px", color: "#15803d", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>${totalSell.toFixed(2)}</div>
              </div>
           </div>

           <div style={{ background: netProfit >= 0 ? "rgba(21,128,61,0.1)" : "rgba(192,57,43,0.1)", border: `1px solid ${netProfit >= 0 ? "rgba(21,128,61,0.2)" : "rgba(192,57,43,0.2)"}`, padding: "20px", borderRadius: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "12px", color: netProfit >= 0 ? "#15803d" : "#c0392b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "4px" }}>
                Estimated Net Profit
              </div>
              <div style={{ fontSize: "36px", color: netProfit >= 0 ? "#1a5c32" : "#991b1b", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>
                ${netProfit.toFixed(2)}
              </div>
              <div style={{ fontSize: "14px", color: netProfit >= 0 ? "#15803d" : "#c0392b", fontWeight: 600, marginTop: "4px", opacity: 0.8 }}>
                Margin: {marginPercent}%
              </div>
           </div>

           <button style={{ padding: "14px", background: NAVY, color: "#fff", borderRadius: "8px", border: "none", fontWeight: 700, cursor: "pointer", marginTop: "10px" }}>
             💾 Save Quote
           </button>
        </div>

      </div>
    </div>
  );
}

export default function CargoApp({ session }) {
  // --- ADDED: Theme & EasyPost State ---
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [fetchingRates, setFetchingRates] = useState(false);

  // --- ORIGINAL STATES ---
  const [entries, setEntries] = useState([]);
  const [containerMeta, setContainerMeta] = useState({});
  const [activities, setActivities] = useState([]);
  const [vesselMovements, setVesselMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState(null);
  const [activeTab, setActiveTab] = useState("log");
  const [search, setSearch] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);
  const [errors, setErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [printContainer, setPrintContainer] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPrompt, setPushPrompt] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const userEmail = session?.user?.email || "";
  const userId = session?.user?.id;
  
  const fullName = userEmail 
    ? userEmail.split('@')[0].split('.').map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(' ') 
    : "User";

  // --- ADDED: Theme Persistence Effect & Dynamic Style ---
  const currentGlassStyle = useMemo(() => getGlassStyle(isDarkMode), [isDarkMode]);
  
  useEffect(() => {
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  // --- ADDED: EasyPost Fetch Function ---
  const fetchEasyPostRates = async () => {
    if (!form.shipper || !form.consignee) return alert("Please enter Shipper and Consignee info first.");
    setFetchingRates(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-easypost-rates', {
        body: { to_address: form.consignee, from_address: form.shipper, weight: parseFloat(form.cargo_weight) || 100 }
      });
      if (error) throw error;
      setForm(f => ({ ...f, remarks: `${f.remarks || ''} [Auto-Rate: ${data.rate} ${data.currency}]`.trim() }));
      showToast(`Fetched cheapest rate: ${data.rate} ${data.currency}`);
    } catch (err) {
      alert("EasyPost Error: " + err.message);
    }
    setFetchingRates(false);
  };

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      const { data: cargoData } = await supabase.from("cargo_entries").select("*").order("created_at", { ascending: false });
      const { data: metaData } = await supabase.from("container_meta").select("*");
      const { data: activityData } = await supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200);
      const { data: vesselData } = await supabase.from("vessel_movements").select("*").order("event_date", { ascending: false });
      
      if (userId) {
        const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();
        if (roleData && roleData.role === "admin") {
          setIsAdmin(true);
        }
      }

      if (!mounted) return;

      setEntries(cargoData || []);
      const metaMap = {};
      (metaData || []).forEach(m => { metaMap[m.container_no] = m; });
      setContainerMeta(metaMap);
      setActivities(activityData || []);
      setVesselMovements(vesselData || []);
      setLoading(false);
    }
    loadAll();

    const cargoSub = supabase.channel("cargo-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cargo_entries" }, (payload) => {
        if (payload.eventType === "INSERT") setEntries(prev => prev.find(e => e.id === payload.new.id) ? prev : [payload.new, ...prev]);
        else if (payload.eventType === "UPDATE") setEntries(prev => prev.map(e => e.id === payload.new.id ? payload.new : e));
        else if (payload.eventType === "DELETE") setEntries(prev => prev.filter(e => e.id !== payload.old.id));
      }).subscribe();

    const metaSub = supabase.channel("meta-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "container_meta" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setContainerMeta(prev => { const next = { ...prev }; delete next[payload.old.container_no]; return next; });
        } else {
          setContainerMeta(prev => ({ ...prev, [payload.new.container_no]: payload.new }));
        }
      }).subscribe();

    const activitySub = supabase.channel("activity-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, (payload) => {
        setActivities(prev => [payload.new, ...prev].slice(0, 200));
      }).subscribe();

    const vesselSub = supabase.channel("vessel-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "vessel_movements" }, (payload) => {
        if (payload.eventType === "INSERT") setVesselMovements(prev => [payload.new, ...prev]);
        else if (payload.eventType === "DELETE") setVesselMovements(prev => prev.filter(v => v.id !== payload.old.id));
      }).subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(cargoSub);
      supabase.removeChannel(metaSub);
      supabase.removeChannel(activitySub);
      supabase.removeChannel(vesselSub);
    };
  }, [userId]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setPushEnabled(true);
      else {
        const dismissed = localStorage.getItem("push-prompt-dismissed");
        if (!dismissed && Notification.permission === "default") {
          setTimeout(() => setPushPrompt(true), 3000);
        }
      }
    }).catch(err => console.error("SW registration failed:", err));
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const enablePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { showToast("Notifications blocked.", "error"); setPushPrompt(false); return; }
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) { showToast("Push not configured.", "error"); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert({
        user_id: userId, user_email: userEmail,
        endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
        user_agent: navigator.userAgent,
      }, { onConflict: "endpoint" });
      setPushEnabled(true); setPushPrompt(false);
      showToast("Notifications enabled! 🔔");
    } catch (err) { showToast("Could not enable: " + err.message, "error"); }
  };

  const dismissPushPrompt = () => {
    localStorage.setItem("push-prompt-dismissed", "1");
    setPushPrompt(false);
  };

  const handleFieldChange = useCallback((field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(er => ({ ...er, [field]: undefined }));
  }, []);

  const validate = () => {
    const e = {};
    if (!form.shipper?.trim()) e.shipper = "Required";
    if (!form.consignee?.trim()) e.consignee = "Required";
    if (!form.goods_description?.trim()) e.goods_description = "Required";
    if (!form.container_no?.trim()) e.container_no = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const containerKey = form.container_no.trim().toUpperCase();
    const payload = {
      shipper: form.shipper.trim(), consignee: form.consignee.trim(),
      gst_number: form.gst_number || null, eway_bill: form.eway_bill || null,
      quantity: form.quantity || null, goods_description: form.goods_description.trim(),
      container_no: containerKey, vehicle_number: form.vehicle_number || null,
      booking_date: form.booking_date || null, vessel_name: form.vessel_name || null,
      voyage_number: form.voyage_number || null, remarks: form.remarks || null,
      load_type: form.load_type || null,
      container_size: form.container_size || null,
      seal_no: form.seal_no || null,
      cargo_weight: form.cargo_weight || null,
      eway_valid_till: form.eway_valid_till || null,
      freight_status: form.freight_status || null,
      payment_status: form.payment_status || null,
      created_by_email: userEmail,
    };

    if (editId) {
      const { error } = await supabase.from("cargo_entries").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editId);
      if (error) { showToast(error.message, "error"); return; }
      showToast("Cargo entry updated.");
      logActivity({ action: "cargo_updated", entityType: "cargo", entityId: editId, containerNo: containerKey, details: { shipper: payload.shipper, consignee: payload.consignee }, userEmail });
    } else {
      const { data: inserted, error } = await supabase.from("cargo_entries").insert(payload).select().single();
      if (error) { showToast(error.message, "error"); return; }
      const existing = entries.find(e => e.container_no === containerKey);
      showToast(existing ? `Added to container ${containerKey} (LCL grouped).` : "New cargo entry logged.");
      logActivity({ action: "cargo_created", entityType: "cargo", entityId: inserted?.id, containerNo: containerKey, details: { shipper: payload.shipper, consignee: payload.consignee }, userEmail });
      sendPushNotification(`📦 New cargo: ${containerKey}`, `${payload.shipper} → ${payload.consignee} (logged by ${userEmail.split("@")[0]})`, userId);
    }

    const existingMeta = containerMeta[containerKey];
    const metaPayload = {
      container_no: containerKey,
      status: existingMeta?.status || "stuffing",
      vessel_name: form.vessel_name || existingMeta?.vessel_name || null,
      voyage_number: form.voyage_number || existingMeta?.voyage_number || null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("container_meta").upsert(metaPayload);

    setForm(initialForm);
    setEditId(null);
    setErrors({});
    setActiveTab("log");
  };

  const handleEdit = (entry) => {
    const meta = containerMeta[entry.container_no] || {};
    setForm({ ...entry, vessel_name: entry.vessel_name || meta.vessel_name || "", voyage_number: entry.voyage_number || meta.voyage_number || "" });
    setEditId(entry.id);
    setActiveTab("entry");
  };

  const handleDelete = (id) => setDeleteConfirm(id);

  const confirmDelete = async () => {
    const entry = entries.find(e => e.id === deleteConfirm);
    const { error } = await supabase.from("cargo_entries").delete().eq("id", deleteConfirm);
    if (error) { showToast(error.message, "error"); return; }
    if (entry) logActivity({ action: "cargo_deleted", entityType: "cargo", entityId: deleteConfirm, containerNo: entry.container_no, details: { shipper: entry.shipper }, userEmail });
    setDeleteConfirm(null);
    showToast("Entry deleted.", "error");
  };

  const updateContainerStatus = async (containerNo, status) => {
    const existing = containerMeta[containerNo] || { container_no: containerNo };
    const oldStatus = existing.status || "stuffing";
    const { error } = await supabase.from("container_meta").upsert({ ...existing, container_no: containerNo, status, updated_at: new Date().toISOString() });
    if (error) { showToast(error.message, "error"); return; }
    showToast(`Status updated to ${getStatusInfo(status).label}.`);
    logActivity({ action: "status_changed", entityType: "container", containerNo, details: { from: getStatusInfo(oldStatus).label, to: getStatusInfo(status).label }, userEmail });
  };

  const updateContainerLoadType = async (containerNo, value) => {
    const existing = containerMeta[containerNo] || { container_no: containerNo };
    const override = value === "auto" ? null : value;
    const { error } = await supabase.from("container_meta").upsert({ ...existing, container_no: containerNo, load_type_override: override, updated_at: new Date().toISOString() });
    if (error) { showToast(error.message, "error"); return; }
    showToast(value === "auto" ? "Set to auto-detect." : `Marked as ${value}.`);
  };

  const addVesselMovement = async (data) => {
    const payload = {
      vessel_name: data.vessel_name.trim(),
      voyage_number: data.voyage_number?.trim() || null,
      event_type: data.event_type,
      event_date: new Date(data.event_date).toISOString(),
      location: data.location?.trim() || null,
      latitude: data.latitude ? parseFloat(data.latitude) : null,
      longitude: data.longitude ? parseFloat(data.longitude) : null,
      notes: data.notes?.trim() || null,
      created_by_email: userEmail,
    };
    const { error } = await supabase.from("vessel_movements").insert(payload);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Vessel movement logged.");
    logActivity({ action: "vessel_movement", entityType: "vessel", details: { summary: `${data.vessel_name} · ${getVesselEvent(data.event_type).label}${data.location ? ` at ${data.location}` : ""}` }, userEmail });
  };

  const deleteVesselMovement = async (id) => {
    if (!confirm("Delete this movement?")) return;
    const { error } = await supabase.from("vessel_movements").delete().eq("id", id);
    if (error) { showToast(error.message, "error"); return; }
    showToast("Movement deleted.", "error");
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const grouped = useMemo(() => entries.reduce((acc, entry) => { const key = entry.container_no; if (!acc[key]) acc[key] = []; acc[key].push(entry); return acc; }, {}), [entries]);
  const uniqueShippers = useMemo(() => [...new Set(entries.map(e => e.shipper).filter(Boolean))].sort(), [entries]);
  const uniqueConsignees = useMemo(() => [...new Set(entries.map(e => e.consignee).filter(Boolean))].sort(), [entries]);
  const uniqueVessels = useMemo(() => {
    const a = Object.values(containerMeta).map(m => m?.vessel_name).filter(Boolean);
    const b = vesselMovements.map(v => v.vessel_name).filter(Boolean);
    return [...new Set([...a, ...b])].sort();
  }, [containerMeta, vesselMovements]);

  const filteredKeys = useMemo(() => {
    return Object.keys(grouped).filter(key => {
      if (search) {
        const q = search.toUpperCase();
        const matches = key.includes(q) || grouped[key].some(e =>
          (e.vehicle_number || "").toUpperCase().includes(q) ||
          e.shipper.toUpperCase().includes(q) || e.consignee.toUpperCase().includes(q)
        );
        if (!matches) return false;
      }
      if (statusFilter !== "all" && (containerMeta[key]?.status || "stuffing") !== statusFilter) return false;
      if (dateFromFilter || dateToFilter) {
        const hasMatch = grouped[key].some(e => {
          const d = e.booking_date || new Date(e.created_at).toISOString().slice(0, 10);
          if (dateFromFilter && d < dateFromFilter) return false;
          if (dateToFilter && d > dateToFilter) return false;
          return true;
        });
        if (!hasMatch) return false;
      }
      return true;
    }).sort();
  }, [grouped, containerMeta, search, statusFilter, dateFromFilter, dateToFilter]);

  const lclBannerEntry = form.container_no ? entries.find(e => e.container_no === form.container_no.trim().toUpperCase() && e.id !== editId) : null;

  const exportAllExcel = () => {
    if (entries.length === 0) { showToast("No data to export.", "error"); return; }
    const rows = entries.map((e, index) => {
      const m = containerMeta[e.container_no] || {};
      return {
        "SL NO": index + 1,
        "SHIPPER": e.shipper,
        "CONSIGNEE": e.consignee,
        "CONT. NO": e.container_no,
        "SIZE": e.container_size || "",
        "WT": e.cargo_weight || "",
        "SEAL NO": e.seal_no || "",
        "KOL TRUCK": e.vehicle_number || "",
        "COMMODITY": e.goods_description || "",
        "PKGS": e.quantity || "",
        "E WAY BILL DT": e.eway_bill || "",
        "VALID TILL": e.eway_valid_till ? formatDate(e.eway_valid_till) : "",
        "FRT P/ FRT TO PAY": e.freight_status ? getFreightInfo(e.freight_status)?.label || e.freight_status : "",
        "PYMENT ST": e.payment_status ? getPaymentInfo(e.payment_status)?.label || e.payment_status : "",
        "DELIVERY STATUS": getStatusInfo(m.status || "stuffing").label,
        "GST No.": e.gst_number || "",
        "Load Type": e.load_type || "—",
        "Vessel": m.vessel_name || "",
        "Voyage": m.voyage_number || "",
        "Booking Date": e.booking_date ? formatDate(e.booking_date) : "",
        "Remarks": e.remarks || "",
        "Logged By": e.created_by_email || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Manifest");
    XLSX.writeFile(wb, `Kraft_Manifest_${todayStr()}.xlsx`);
    showToast("Excel exported.");
  };

  const exportContainerExcel = (containerNo) => {
    const cargos = grouped[containerNo] || [];
    if (cargos.length === 0) return;
    const rows = cargos.map((e, index) => {
      const m = containerMeta[containerNo] || {};
      return {
        "SL NO": index + 1,
        "SHIPPER": e.shipper,
        "CONSIGNEE": e.consignee,
        "CONT. NO": e.container_no,
        "SIZE": e.container_size || "",
        "WT": e.cargo_weight || "",
        "SEAL NO": e.seal_no || "",
        "KOL TRUCK": e.vehicle_number || "",
        "COMMODITY": e.goods_description || "",
        "PKGS": e.quantity || "",
        "E WAY BILL DT": e.eway_bill || "",
        "VALID TILL": e.eway_valid_till ? formatDate(e.eway_valid_till) : "",
        "FRT P/ FRT TO PAY": e.freight_status ? getFreightInfo(e.freight_status)?.label || e.freight_status : "",
        "PYMENT ST": e.payment_status ? getPaymentInfo(e.payment_status)?.label || e.payment_status : "",
        "DELIVERY STATUS": getStatusInfo(m.status || "stuffing").label,
        "GST No.": e.gst_number || "",
        "Remarks": e.remarks || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, containerNo.slice(0, 30));
    XLSX.writeFile(wb, `${containerNo}_${todayStr()}.xlsx`);
    showToast("Excel exported.");
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0edf0", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: "sans-serif" }}>
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            <filter id="gooey-filter">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
          </defs>
        </svg>
        <div style={{ textAlign: "center" }}>
          <div className="goo-container">
            <div className="goo-blob blob-1"></div>
            <div className="goo-blob blob-2"></div>
            <div className="goo-blob blob-3"></div>
          </div>
          <div style={{ color: "#5a6a7a", fontSize: "14px", fontWeight: 600, letterSpacing: "0.05em" }}>Loading Manifest...</div>
        </div>
      </div>
    );
  }

  if (printContainer) return <PrintView containerNo={printContainer} entries={grouped[printContainer] || []} meta={containerMeta[printContainer]} onClose={() => setPrintContainer(null)} />;

  return (
    <div style={{ 
      minHeight: "100vh", 
      // Dynamic Background for Dark Mode
      background: isDarkMode ? "radial-gradient(circle at top left, #0d1e3c, #050a18)" : "radial-gradient(circle at top left, #e8eef8, transparent 40%), radial-gradient(circle at bottom right, #d0b0e0, transparent 40%), linear-gradient(135deg, #f0edf0 0%, #e0e8f7 100%)",
      color: isDarkMode ? "#f0edf0" : TEXT, 
      transition: "all 0.3s ease",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif" 
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: #b0a8b8; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* --- STICKY NAV WRAPPER --- */}
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        
        {/* 1. The Header */}
        <div style={{
          ...DARK_GLASS_STYLE,
          padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "relative",
          zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
            <img src="/kraft-logo.png" alt="Kraft" style={{ width: "44px", height: "44px", objectFit: "contain", flexShrink: 0, borderRadius: "8px", background: "rgba(255,255,255,0.1)" }} />

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "17px", fontWeight: 800, color: OFFWHITE, letterSpacing: "0.02em", lineHeight: "1.2", fontFamily: "'DM Sans', sans-serif" }}>
                  Kraft Manifest
                </div>
                {isAdmin ? (
                  <span style={{ background: "linear-gradient(135deg, #f59e3c 0%, #d87c1e 100%)", color: "#fff", padding: "2px 8px", borderRadius: "4px", fontSize: "9px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", boxShadow: "0 2px 8px rgba(245,158,60,0.3)" }}>Admin</span>
                ) : (
                  <span style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)", padding: "2px 8px", borderRadius: "4px", fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>Staff</span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {fullName}
                </div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>•</span>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", fontFamily: "'DM Mono', monospace" }}>
                  {entries.length} cargo{entries.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          </div>

          {/* DARK MODE TOGGLE & MENU */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <button onClick={() => setIsDarkMode(!isDarkMode)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              style={{ background: "rgba(255,255,255,0.1)", border: "none", fontSize: "18px", cursor: "pointer", padding: "10px", borderRadius: "10px", transition: "all 0.2s ease", width: "42px", height: "42px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isDarkMode ? "🌙" : "☀️"}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowMenu(!showMenu)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
                style={{ padding: "10px 14px", borderRadius: "10px", fontSize: "18px", cursor: "pointer", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: OFFWHITE, fontWeight: 700, transition: "all 0.2s ease" }}>⋮</button>
              {showMenu && (
                <div style={{ position: "absolute", right: 0, top: "100%", marginTop: "8px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "10px", boxShadow: "0 4px 20px rgba(13,30,60,0.2)", zIndex: 200, minWidth: "240px", overflow: "hidden" }}>
                  <button onClick={() => { exportAllExcel(); setShowMenu(false); }} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", border: "none", background: "#fff", color: NAVY, fontSize: "13px", fontWeight: 600, cursor: "pointer", textAlign: "left" }}>📊 Export All to Excel</button>
                  {!pushEnabled && <button onClick={() => { enablePush(); setShowMenu(false); }} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", border: "none", background: "#fff", color: NAVY, fontSize: "13px", fontWeight: 600, cursor: "pointer", textAlign: "left", borderTop: `1px solid ${BORDER}` }}>🔔 Enable Push Notifications</button>}
                  {pushEnabled && <div style={{ padding: "12px 14px", fontSize: "12px", color: "#15803d", borderTop: `1px solid ${BORDER}`, fontWeight: 600 }}>🔔 Notifications: ON</div>}
                  <button onClick={() => { handleLogout(); setShowMenu(false); }} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", border: "none", background: "#fff", color: "#c0392b", fontSize: "13px", fontWeight: 600, cursor: "pointer", textAlign: "left", borderTop: `1px solid ${BORDER}` }}>🚪 Log Out</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TABS NAVIGATION */}
        <div style={{
          ...currentGlassStyle,
          borderRadius: "0 0 16px 16px",
          margin: "0 16px",
          display: "flex", gap: "4px", padding: "6px 16px 0", overflowX: "auto",
          borderTop: isDarkMode ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.05)"
        }}>
          {[
            ["entry", "📋 New Entry"],
            ["log", `📦 Manifest (${Object.keys(grouped).length})`],
            ["vessel", "🚢 Vessels"],
            ["activity", "📜 Activity"],
            ["dashboard", "📊 Dashboard"],
            ["pricing", "💰 Pricing"]
          ].concat(isAdmin ? [["team", "👥 Team"]] : []).map(([tab, label]) => (
            <button key={tab} onClick={() => { setActiveTab(tab); if (tab === "entry" && !editId) { setForm(initialForm); setErrors({}); } }}
              onMouseEnter={(e) => { if (activeTab !== tab) e.currentTarget.style.opacity = "0.9"; }}
              onMouseLeave={(e) => { if (activeTab !== tab) e.currentTarget.style.opacity = "0.6"; }}
              style={{
                padding: "10px 8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", background: "transparent", border: "none",
                borderBottom: activeTab === tab ? "3px solid #f59e3c" : "3px solid transparent",
                color: activeTab === tab ? (isDarkMode ? "#f59e3c" : NAVY) : MUTED,
                whiteSpace: "nowrap", transition: "all 0.2s ease-in-out", opacity: activeTab === tab ? 1 : 0.6, marginBottom: "-1px",
                borderRadius: "6px 6px 0 0",
              }}>{label}</button>
          ))}
        </div>
      </div>
      {/* --- END STICKY NAV WRAPPER --- */}

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 16px" }}>

        {activeTab === "entry" && (
          <div>
            <div style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, margin: 0 }}>{editId ? "✏️ Edit Cargo Entry" : "📋 New Cargo Entry"}</h2>
              
              {/* EASYPOST BUTTON */}
              <button onClick={fetchEasyPostRates} disabled={fetchingRates} style={{ background: isDarkMode ? "#f59e3c" : NAVY, color: "#fff", padding: "8px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
                {fetchingRates ? "⌛ Fetching Rates..." : "💰 Auto-Fetch Rates"}
              </button>
            </div>
            
            <div style={{ ...(isDarkMode ? { ...currentGlassStyle, background: "rgba(13, 30, 60, 0.45)", border: "1px solid rgba(255, 255, 255, 0.1)" } : currentGlassStyle), borderRadius: "14px", padding: "20px" }}>
              {!editId && <AIDocReader onExtracted={(data) => setForm(f => ({ ...f, ...data }))} />}
              {lclBannerEntry && (
                <div style={{ background: "rgba(230,247,237,0.8)", border: "1px solid #9eddb8", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "18px" }}>📦</span>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#1a5c32" }}>LCL Container Detected</div>
                    <div style={{ fontSize: "11px", color: "#2a7a4a" }}>Container <strong style={{ fontFamily: "'DM Mono', monospace" }}>{form.container_no.toUpperCase()}</strong> already has cargo. New entry will be grouped under it.</div>
                  </div>
                </div>
              )}

              {/* Section: Basic Info */}
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 700, color: isDarkMode ? "#f59e3c" : NAVY2, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "4px", height: "16px", background: isDarkMode ? "#f59e3c" : NAVY2, borderRadius: "2px" }}></span>
                  Basic Information
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label="Container No." field="container_no" placeholder="e.g. MSCU1234567" required half value={form.container_no} error={errors.container_no} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <Field label="Shipper" field="shipper" placeholder="Shipper name" required half value={form.shipper} error={errors.shipper} onChange={handleFieldChange} listId="shippers-list" list={uniqueShippers} isDarkMode={isDarkMode} />
                  <Field label="Consignee" field="consignee" placeholder="Consignee name" required half value={form.consignee} error={errors.consignee} onChange={handleFieldChange} listId="consignees-list" list={uniqueConsignees} isDarkMode={isDarkMode} />
                  <Field label="Goods Description" field="goods_description" placeholder="Describe goods" required half value={form.goods_description} error={errors.goods_description} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                </div>
              </div>

              {/* Section: Cargo Details */}
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 700, color: isDarkMode ? "#f59e3c" : NAVY2, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "4px", height: "16px", background: isDarkMode ? "#f59e3c" : NAVY2, borderRadius: "2px" }}></span>
                  Cargo Details
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label="Quantity" field="quantity" placeholder="e.g. 10 Boxes" half value={form.quantity} error={errors.quantity} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <Field label="Cargo Weight" field="cargo_weight" placeholder="e.g. 1200 Kgs" half value={form.cargo_weight} error={errors.cargo_weight} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <div style={{ gridColumn: "span 1" }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", textAlign: "center" }}>Container Size</label>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {CONTAINER_SIZES.map(opt => (
                        <button key={opt} type="button" onClick={() => handleFieldChange("container_size", form.container_size === opt ? "" : opt)}
                          style={{
                            flex: 1, padding: "9px 2px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
                            background: form.container_size === opt ? NAVY : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)"),
                            color: form.container_size === opt ? "#fff" : (isDarkMode ? "#cbd5e0" : NAVY),
                            border: `1px solid ${form.container_size === opt ? NAVY : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)")}`,
                            cursor: "pointer", fontFamily: "'DM Mono', monospace", transition: "all 0.2s"
                          }}>{opt}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ gridColumn: "span 1" }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", textAlign: "center" }}>Load Type</label>
                    <div style={{ display: "flex", gap: "4px" }}>
                      {["", "FCL", "LCL"].map(opt => (
                        <button key={opt} type="button" onClick={() => handleFieldChange("load_type", opt)}
                          style={{
                            flex: 1, padding: "9px 4px", borderRadius: "8px", fontSize: "11px", fontWeight: 600,
                            background: form.load_type === opt ? NAVY : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)"),
                            color: form.load_type === opt ? "#fff" : (isDarkMode ? "#cbd5e0" : NAVY),
                            border: `1px solid ${form.load_type === opt ? NAVY : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)")}`,
                            cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s"
                          }}>{opt || "Auto"}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Transport & Legal */}
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 700, color: isDarkMode ? "#f59e3c" : NAVY2, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "4px", height: "16px", background: isDarkMode ? "#f59e3c" : NAVY2, borderRadius: "2px" }}></span>
                  Transport & Legal
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <Field label="Vehicle Number" field="vehicle_number" placeholder="e.g. WB12AB3456" half value={form.vehicle_number} error={errors.vehicle_number} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <Field label="Seal No." field="seal_no" placeholder="e.g. SL123456" half value={form.seal_no} error={errors.seal_no} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <Field label="GST Number" field="gst_number" placeholder="e.g. 19AABCK..." half value={form.gst_number} error={errors.gst_number} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <Field label="E-Way Bill Number" field="eway_bill" placeholder="e.g. 331234..." half value={form.eway_bill} error={errors.eway_bill} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <Field label="Booking Date" field="booking_date" type="date" half value={form.booking_date} error={errors.booking_date} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                  <Field label="E-Way Valid Till" field="eway_valid_till" type="date" half value={form.eway_valid_till} error={errors.eway_valid_till} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                </div>
              </div>

              {/* Section: Payment & Vessel */}
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 700, color: isDarkMode ? "#f59e3c" : NAVY2, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "4px", height: "16px", background: isDarkMode ? "#f59e3c" : NAVY2, borderRadius: "2px" }}></span>
                  Payment & Vessel
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                  <PillSelector label="Freight" value={form.freight_status} isDarkMode={isDarkMode}
                    onChange={(v) => handleFieldChange("freight_status", v)}
                    options={FREIGHT_STATUSES.map(s => ({ value: s.id, label: s.label, color: s.color }))} />
                  <PillSelector label="Payment" value={form.payment_status} isDarkMode={isDarkMode}
                    onChange={(v) => handleFieldChange("payment_status", v)}
                    options={PAYMENT_STATUSES.map(s => ({ value: s.id, label: s.label, color: s.color }))} />
                  <Field label="Vessel Name" field="vessel_name" placeholder="e.g. MV APJ Karan 2" half value={form.vessel_name} error={errors.vessel_name} onChange={handleFieldChange} listId="vessels-list" list={uniqueVessels} isDarkMode={isDarkMode} />
                  <Field label="Voyage Number" field="voyage_number" placeholder="e.g. 024" half value={form.voyage_number} error={errors.voyage_number} onChange={handleFieldChange} isDarkMode={isDarkMode} />
                </div>
              </div>

              {/* Section: Remarks */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px", textAlign: "center" }}>Remarks (Optional)</label>
                  <textarea value={form.remarks || ""} onChange={e => handleFieldChange("remarks", e.target.value)} placeholder="e.g. Fragile, hold for inspection..." rows={2}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, color: isDarkMode ? "#fff" : TEXT, fontSize: "14px", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button onClick={handleSubmit} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(245, 158, 60, 0.4)"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(245, 158, 60, 0.3)"; }}
                  style={{ flex: 1, padding: "14px", borderRadius: "10px", fontSize: "15px", fontWeight: 700, background: "linear-gradient(135deg, #f59e3c 0%, #d87c1e 100%)", border: "none", color: "#fff", cursor: "pointer", letterSpacing: "0.03em", boxShadow: "0 4px 12px rgba(245, 158, 60, 0.3)", transition: "all 0.2s ease" }}>
                  {editId ? "✅ Update Entry" : "💾 Save Cargo Entry"}
                </button>
                {editId && <button onClick={() => { setForm(initialForm); setEditId(null); setErrors({}); }} style={{ padding: "14px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)"}`, color: isDarkMode ? "#fff" : MUTED, cursor: "pointer" }}>Cancel</button>}
              </div>
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, margin: 0 }}>Manifest Log</h2>
                <p style={{ fontSize: "12px", color: isDarkMode ? "#a0aec0" : MUTED, margin: "4px 0 0" }}>{filteredKeys.length} of {Object.keys(grouped).length} containers shown</p>
              </div>
              <button onClick={() => { setForm(initialForm); setEditId(null); setErrors({}); setActiveTab("entry"); }} style={{ padding: "9px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`, border: "none", color: OFFWHITE, cursor: "pointer", boxShadow: "0 4px 12px rgba(13,30,60,0.15)" }}>+ New Entry</button>
            </div>

            {(() => {
              const expiringEntries = entries.filter(e => {
                const exp = checkEwayExpiry(e.eway_valid_till);
                return exp && (exp.state === "expired" || exp.state === "today" || exp.state === "critical");
              });
              if (expiringEntries.length === 0) return null;
              return (
                <div style={{ background: "rgba(253,236,234,0.8)", border: "1px solid #f5b8b0", borderRadius: "10px", padding: "12px 14px", marginBottom: "12px", display: "flex", gap: "10px", alignItems: "flex-start", backdropFilter: "blur(8px)" }}>
                  <span style={{ fontSize: "20px" }}>🚨</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#c0392b" }}>E-Way Bills Need Attention</div>
                    <div style={{ fontSize: "11px", color: "#c0392b", opacity: 0.8, marginTop: "2px" }}>
                      {expiringEntries.length} cargo{expiringEntries.length > 1 ? "s have" : " has"} an expired or critical e-way bill. Check: {[...new Set(expiringEntries.map(e => e.container_no))].join(", ")}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: MUTED, fontSize: "14px" }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search container, vehicle, shipper..." style={{ width: "100%", padding: "11px 14px 11px 38px", borderRadius: "10px", background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.9)"}`, color: isDarkMode ? "#fff" : TEXT, fontSize: "14px", outline: "none", backdropFilter: "blur(4px)" }} />
              </div>
              <button onClick={() => setShowFilters(!showFilters)} style={{ padding: "11px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: showFilters ? NAVY : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.7)"), border: `1px solid ${showFilters ? NAVY : (isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)")}`, color: showFilters ? "#fff" : (isDarkMode ? "#fff" : NAVY), cursor: "pointer", whiteSpace: "nowrap" }}>🔧 {(statusFilter !== "all" || dateFromFilter || dateToFilter) ? "•" : ""} Filters</button>
            </div>

            {showFilters && (
              <div style={{ ...currentGlassStyle, borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>From Date</label>
                    <input type="date" value={dateFromFilter} onChange={e => setDateFromFilter(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", color: isDarkMode ? "#fff" : TEXT, background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>To Date</label>
                    <input type="date" value={dateToFilter} onChange={e => setDateToFilter(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)"}`, fontSize: "13px", color: isDarkMode ? "#fff" : TEXT, background: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)" }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: isDarkMode ? "#cbd5e0" : NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Status</label>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button onClick={() => setStatusFilter("all")} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: statusFilter === "all" ? NAVY : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)"), color: statusFilter === "all" ? "#fff" : (isDarkMode ? "#cbd5e0" : NAVY), border: `1px solid ${statusFilter === "all" ? NAVY : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)")}`, cursor: "pointer" }}>All</button>
                    {STATUSES.map(s => (
                      <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: statusFilter === s.id ? s.color : (isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)"), color: statusFilter === s.id ? "#fff" : s.color, border: `1px solid ${statusFilter === s.id ? s.color : (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)")}`, cursor: "pointer" }}>{s.icon} {s.label}</button>
                    ))}
                  </div>
                </div>
                {(dateFromFilter || dateToFilter || statusFilter !== "all") && <button onClick={() => { setDateFromFilter(""); setDateToFilter(""); setStatusFilter("all"); }} style={{ marginTop: "10px", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)"}`, color: isDarkMode ? "#fff" : MUTED, cursor: "pointer" }}>✕ Clear filters</button>}
              </div>
            )}

            {filteredKeys.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", ...currentGlassStyle, borderRadius: "14px" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>📭</div>
                <div style={{ fontSize: "16px", color: isDarkMode ? "#fff" : NAVY, fontWeight: 600 }}>{search || statusFilter !== "all" || dateFromFilter || dateToFilter ? "No results found" : "No cargo entries yet"}</div>
              </div>
            ) : filteredKeys.map(key => (
              <ContainerCard key={key} containerNo={key} entries={grouped[key]} meta={containerMeta[key]}
                userEmail={userEmail} isAdmin={isAdmin} glassStyle={currentGlassStyle} isDarkMode={isDarkMode}
                onEdit={handleEdit} onDelete={handleDelete} onUpdateStatus={updateContainerStatus}
                onPrint={setPrintContainer} onExportContainer={exportContainerExcel}
                onUpdateLoadType={updateContainerLoadType} />
            ))}
          </div>
        )}

        {activeTab === "vessel" && <VesselTab vesselMovements={vesselMovements} uniqueVessels={uniqueVessels} onAdd={addVesselMovement} onDelete={deleteVesselMovement} isAdmin={isAdmin} showToast={showToast} glassStyle={currentGlassStyle} isDarkMode={isDarkMode} />}

        {activeTab === "activity" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, margin: 0 }}>📜 Activity Log</h2>
              <p style={{ fontSize: "12px", color: isDarkMode ? "#a0aec0" : MUTED, margin: "4px 0 0" }}>Live timeline of all team actions</p>
            </div>
            <ActivityTab activities={activities} glassStyle={currentGlassStyle} isDarkMode={isDarkMode} />
          </div>
        )}

        {activeTab === "dashboard" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, margin: 0 }}>📊 Dashboard</h2>
              <p style={{ fontSize: "12px", color: isDarkMode ? "#a0aec0" : MUTED, margin: "4px 0 0" }}>Operations overview · Live across all staff</p>
            </div>
            <Dashboard entries={entries} containerMeta={containerMeta} glassStyle={currentGlassStyle} isDarkMode={isDarkMode} />
          </div>
        )}

        {activeTab === "team" && isAdmin && <TeamTab isAdmin={isAdmin} userEmail={userEmail} glassStyle={currentGlassStyle} isDarkMode={isDarkMode} />}
      </div>
      {/* --- ADDED THIS BLOCK --- */}
        {activeTab === "pricing" && <PricingCalculator glassStyle={currentGlassStyle} isDarkMode={isDarkMode} />}

      {pushPrompt && (
        <div style={{ position: "fixed", bottom: "16px", left: "16px", right: "16px", maxWidth: "440px", margin: "0 auto", ...currentGlassStyle, borderRadius: "12px", padding: "16px", zIndex: 500, animation: "fadeUp 0.3s ease" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <div style={{ fontSize: "24px" }}>🔔</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, marginBottom: "4px" }}>Get notified instantly</div>
              <div style={{ fontSize: "12px", color: isDarkMode ? "#cbd5e0" : MUTED, marginBottom: "10px" }}>Be alerted when teammates add new cargo, even when the app is closed.</div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={enablePush} style={{ padding: "7px 14px", borderRadius: "6px", background: NAVY, color: "#fff", border: "none", fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>Enable</button>
                <button onClick={dismissPushPrompt} style={{ padding: "7px 14px", borderRadius: "6px", background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.8)", color: isDarkMode ? "#fff" : MUTED, border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)"}`, fontWeight: 600, fontSize: "12px", cursor: "pointer" }}>Not now</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "rgba(253,236,234,0.9)" : "rgba(230,247,237,0.9)", border: `1px solid ${toast.type === "error" ? "#f5b8b0" : "#9eddb8"}`, backdropFilter: "blur(8px)", color: toast.type === "error" ? "#c0392b" : "#1a5c32", padding: "12px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: 600, boxShadow: "0 4px 16px rgba(13,30,60,0.15)", zIndex: 1000, animation: "fadeUp 0.2s ease" }}>
          {toast.type === "error" ? "🗑️" : "✅"} {toast.msg}
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(13,30,60,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "20px" }}>
          <div style={{ ...currentGlassStyle, borderRadius: "14px", padding: "28px", maxWidth: "360px", width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
            <div style={{ fontSize: "17px", fontWeight: 700, color: isDarkMode ? "#fff" : NAVY, marginBottom: "8px" }}>Delete Entry?</div>
            <div style={{ fontSize: "13px", color: isDarkMode ? "#cbd5e0" : MUTED, marginBottom: "24px" }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: "10px 20px", borderRadius: "8px", border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.8)"}`, background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.7)", color: isDarkMode ? "#fff" : MUTED, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={confirmDelete} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #f5b8b0", background: "rgba(253,236,234,0.9)", color: "#c0392b", cursor: "pointer", fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}