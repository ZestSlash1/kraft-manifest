import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import * as XLSX from "xlsx";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "./supabaseClient";

const NAVY = "#0d1e3c";
const NAVY2 = "#1a3a6a";
const OFFWHITE = "#f0edf0";
const BORDER = "#d0cad8";
const MUTED = "#5a6a7a";
const TEXT = "#0d1e3c";

const STATUSES = [
  { id: "stuffing", label: "Stuffing", color: "#a85c00", bg: "#fef3e0", border: "#f5d090", icon: "📦" },
  { id: "loaded", label: "Loaded", color: "#1e40af", bg: "#e0e8f7", border: "#a8b8e0", icon: "🏗️" },
  { id: "sailed", label: "Sailed", color: "#6b21a8", bg: "#f3e8f7", border: "#d0b0e0", icon: "🚢" },
  { id: "delivered", label: "Delivered", color: "#15803d", bg: "#dcf5e3", border: "#9eddb8", icon: "✅" },
];

const initialForm = {
  shipper: "", consignee: "", gst_number: "", eway_bill: "",
  quantity: "", goods_description: "", container_no: "", vehicle_number: "",
  booking_date: "", vessel_name: "", voyage_number: "", remarks: "",
};

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

function getStatusInfo(id) {
  return STATUSES.find(s => s.id === id) || STATUSES[0];
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Badge({ children, color = "navy" }) {
  const colors = {
    navy: { bg: "#e8eef8", text: NAVY, border: "#b8c8e0" },
    amber: { bg: "#fef3e0", text: "#7a4f00", border: "#f5d090" },
    green: { bg: "#e6f7ed", text: "#1a5c32", border: "#9eddb8" },
    slate: { bg: "#f0edf0", text: MUTED, border: BORDER },
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

function ContainerCard({ containerNo, entries, meta, onEdit, onDelete, onUpdateStatus, onPrint, onExportContainer }) {
  const [expanded, setExpanded] = useState(true);
  const [statusMenu, setStatusMenu] = useState(false);
  const status = meta?.status || "stuffing";
  const vehicle = entries[0]?.vehicle_number || "—";

  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "12px",
      overflow: "hidden", marginBottom: "16px",
      boxShadow: "0 2px 12px rgba(13,30,60,0.08)",
    }}>
      <div onClick={() => setExpanded(!expanded)} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        background: `linear-gradient(90deg, ${NAVY} 0%, ${NAVY2} 100%)`,
        cursor: "pointer", userSelect: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "8px",
            background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0,
          }}>🚢</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "15px", fontWeight: 700, color: OFFWHITE, letterSpacing: "0.1em" }}>
              {containerNo}
            </div>
            <div style={{ fontSize: "11px", color: "rgba(240,237,240,0.6)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {meta?.vessel_name ? `🛳 ${meta.vessel_name}${meta.voyage_number ? ` · V-${meta.voyage_number}` : ""} · ` : ""}Vehicle: {vehicle}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <Badge color="amber">{entries.length}</Badge>
          <span style={{ color: "rgba(240,237,240,0.7)", fontSize: "18px", display: "inline-block", transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "14px 16px", background: OFFWHITE }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <button onClick={(e) => { e.stopPropagation(); setStatusMenu(!statusMenu); }}
                style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
                <StatusBadge status={status} />
              </button>
              {statusMenu && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, marginTop: "4px",
                  background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "8px",
                  boxShadow: "0 4px 16px rgba(13,30,60,0.15)", zIndex: 50, minWidth: "150px",
                }}>
                  {STATUSES.map(s => (
                    <button key={s.id}
                      onClick={(e) => { e.stopPropagation(); onUpdateStatus(containerNo, s.id); setStatusMenu(false); }}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "8px 12px", border: "none", background: status === s.id ? s.bg : "#fff",
                        color: s.color, fontWeight: 600, fontSize: "12px", cursor: "pointer",
                      }}>{s.icon} {s.label}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={(e) => { e.stopPropagation(); onExportContainer(containerNo); }}
              style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "6px", color: NAVY, padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>
              📊 Excel
            </button>
            <button onClick={(e) => { e.stopPropagation(); onPrint(containerNo); }}
              style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "6px", color: NAVY, padding: "5px 10px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>
              🖨 Print
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {entries.map((entry, idx) => (
              <div key={entry.id} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "8px", padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: MUTED }}>#{String(idx + 1).padStart(2, "0")}</span>
                    <Badge color="slate">LCL</Badge>
                    {entry.booking_date && <Badge color="navy">{formatDate(entry.booking_date)}</Badge>}
                    {entry.created_by_email && <Badge color="slate">👤 {entry.created_by_email.split("@")[0]}</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => onEdit(entry)} style={{ background: "#e8eef8", border: "1px solid #b8c8e0", borderRadius: "6px", color: NAVY, padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Edit</button>
                    <button onClick={() => onDelete(entry.id)} style={{ background: "#fdecea", border: "1px solid #f5b8b0", borderRadius: "6px", color: "#c0392b", padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontWeight: 600 }}>Delete</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    ["Shipper", entry.shipper], ["Consignee", entry.consignee],
                    ["GST No.", entry.gst_number || "—"], ["E-Way Bill", entry.eway_bill || "—"],
                    ["Quantity", entry.quantity || "—"], ["Goods", entry.goods_description],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div style={{ fontSize: "10px", color: MUTED, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>{label}</div>
                      <div style={{ fontSize: "13px", color: TEXT, fontWeight: 500, wordBreak: "break-word" }}>{value}</div>
                    </div>
                  ))}
                </div>
                {entry.remarks && (
                  <div style={{ marginTop: "8px", padding: "8px 10px", background: "#fef9e7", border: "1px solid #f5e090", borderRadius: "6px" }}>
                    <div style={{ fontSize: "10px", color: "#7a5500", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "2px" }}>📝 Remarks</div>
                    <div style={{ fontSize: "12px", color: "#5a4400" }}>{entry.remarks}</div>
                  </div>
                )}
                <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: `1px solid ${BORDER}`, fontSize: "10px", color: MUTED }}>
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

const monoFields = new Set(["container_no", "vehicle_number", "gst_number", "eway_bill", "voyage_number"]);

const Field = memo(({ label, field, placeholder, required, half, value, error, onChange, type = "text", listId, list }) => (
  <div style={{ gridColumn: half ? "span 1" : "span 2" }}>
    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
      {label} {required && <span style={{ color: "#c0392b" }}>*</span>}
    </label>
    <input
      type={type}
      list={listId}
      value={value || ""}
      onChange={e => onChange(field, e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "10px 14px", borderRadius: "8px",
        background: error ? "#fef8f8" : "#fff",
        border: `1px solid ${error ? "#e74c3c" : BORDER}`,
        color: TEXT, fontSize: "14px", outline: "none", boxSizing: "border-box",
        fontFamily: monoFields.has(field) ? "'DM Mono', monospace" : "inherit",
        transition: "border-color 0.2s",
      }}
      onFocus={e => e.target.style.borderColor = NAVY}
      onBlur={e => e.target.style.borderColor = error ? "#e74c3c" : BORDER}
    />
    {listId && list && (
      <datalist id={listId}>
        {list.map(opt => <option key={opt} value={opt} />)}
      </datalist>
    )}
    {error && <div style={{ fontSize: "11px", color: "#c0392b", marginTop: "4px" }}>{error}</div>}
  </div>
));

function Dashboard({ entries, containerMeta }) {
  const stats = useMemo(() => {
    const containers = {};
    entries.forEach(e => {
      const k = e.container_no.trim().toUpperCase();
      if (!containers[k]) containers[k] = [];
      containers[k].push(e);
    });

    const statusCounts = STATUSES.map(s => ({
      name: s.label,
      value: Object.keys(containers).filter(k => (containerMeta[k]?.status || "stuffing") === s.id).length,
      color: s.color,
    }));

    const shipperCounts = {};
    const consigneeCounts = {};
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

    return {
      totalContainers: Object.keys(containers).length,
      totalCargos: entries.length,
      statusCounts, topShippers, topConsignees, monthlyData,
    };
  }, [entries, containerMeta]);

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", border: `1px dashed ${BORDER}`, borderRadius: "14px", background: "#fff" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>📊</div>
        <div style={{ fontSize: "16px", color: NAVY, fontWeight: 600 }}>No data to display</div>
        <div style={{ fontSize: "13px", color: MUTED, marginTop: "6px" }}>Add cargo entries to see your dashboard.</div>
      </div>
    );
  }

  const statCard = (label, value) => (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px", textAlign: "center", boxShadow: "0 2px 8px rgba(13,30,60,0.05)" }}>
      <div style={{ fontSize: "11px", color: MUTED, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 700, color: NAVY, fontFamily: "'DM Mono', monospace" }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        {statCard("Containers", stats.totalContainers)}
        {statCard("Total Cargos", stats.totalCargos)}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: NAVY, marginBottom: "12px" }}>📦 Containers by Status</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {stats.statusCounts.map(s => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "90px", fontSize: "12px", color: MUTED, fontWeight: 600 }}>{s.name}</div>
              <div style={{ flex: 1, height: "20px", background: "#f0edf0", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(s.value / Math.max(stats.totalContainers, 1)) * 100}%`, background: s.color, transition: "width 0.3s" }} />
              </div>
              <div style={{ width: "30px", textAlign: "right", fontSize: "13px", fontWeight: 700, color: NAVY, fontFamily: "'DM Mono', monospace" }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {stats.monthlyData.length > 1 && (
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: NAVY, marginBottom: "12px" }}>📅 Cargos Per Month</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={stats.monthlyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0d8e0" />
              <XAxis dataKey="month" stroke={MUTED} style={{ fontSize: "11px" }} />
              <YAxis stroke={MUTED} style={{ fontSize: "11px" }} />
              <Tooltip contentStyle={{ borderRadius: "8px", border: `1px solid ${BORDER}`, fontSize: "12px" }} />
              <Line type="monotone" dataKey="count" stroke={NAVY} strokeWidth={2} dot={{ fill: NAVY, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: NAVY, marginBottom: "12px" }}>🏢 Top Shippers</div>
        {stats.topShippers.map((s, i) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < stats.topShippers.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: MUTED, minWidth: "20px" }}>#{i + 1}</span>
              <span style={{ fontSize: "13px", color: TEXT, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            </div>
            <Badge color="navy">{s.count}</Badge>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "12px", padding: "16px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: NAVY, marginBottom: "12px" }}>🎯 Top Consignees</div>
        {stats.topConsignees.map((s, i) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: i < stats.topConsignees.length - 1 ? `1px solid ${BORDER}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: MUTED, minWidth: "20px" }}>#{i + 1}</span>
              <span style={{ fontSize: "13px", color: TEXT, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            </div>
            <Badge color="navy">{s.count}</Badge>
          </div>
        ))}
      </div>
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
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: "20px", padding: "10px", background: OFFWHITE, borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "13px", color: MUTED }}>Print preview — use Print to save as PDF</div>
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
        <div style={{ textAlign: "right", fontSize: "11px", color: MUTED }}>
          <div>Generated: {new Date().toLocaleString("en-IN")}</div>
        </div>
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
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>#</th>
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>Shipper</th>
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>Consignee</th>
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>GST No.</th>
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>E-Way Bill</th>
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>Qty</th>
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>Goods</th>
            <th style={{ padding: "8px", textAlign: "left", border: `1px solid ${NAVY}` }}>Date</th>
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

      {entries.some(e => e.remarks) && (
        <div style={{ marginTop: "20px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: NAVY, marginBottom: "6px" }}>REMARKS:</div>
          {entries.map((e, i) => e.remarks && (
            <div key={e.id} style={{ fontSize: "11px", marginBottom: "4px" }}>
              <strong>#{i + 1}:</strong> {e.remarks}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "60px", display: "flex", justifyContent: "space-between", fontSize: "11px", color: MUTED }}>
        <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px", textAlign: "center" }}>Authorized Signatory</div>
        <div style={{ borderTop: "1px solid #000", width: "180px", paddingTop: "4px", textAlign: "center" }}>Stamp & Seal</div>
      </div>
    </div>
  );
}

export default function CargoApp({ session }) {
  const [entries, setEntries] = useState([]);
  const [containerMeta, setContainerMeta] = useState({});
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

  const userEmail = session?.user?.email || "";

  // Load all data and subscribe to real-time updates
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      const { data: cargoData } = await supabase.from("cargo_entries").select("*").order("created_at", { ascending: false });
      const { data: metaData } = await supabase.from("container_meta").select("*");
      if (!mounted) return;
      setEntries(cargoData || []);
      const metaMap = {};
      (metaData || []).forEach(m => { metaMap[m.container_no] = m; });
      setContainerMeta(metaMap);
      setLoading(false);
    }
    loadAll();

    // Real-time sync: cargo_entries
    const cargoSub = supabase.channel("cargo-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cargo_entries" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setEntries(prev => prev.find(e => e.id === payload.new.id) ? prev : [payload.new, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setEntries(prev => prev.map(e => e.id === payload.new.id ? payload.new : e));
        } else if (payload.eventType === "DELETE") {
          setEntries(prev => prev.filter(e => e.id !== payload.old.id));
        }
      })
      .subscribe();

    // Real-time sync: container_meta
    const metaSub = supabase.channel("meta-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "container_meta" }, (payload) => {
        if (payload.eventType === "DELETE") {
          setContainerMeta(prev => {
            const next = { ...prev };
            delete next[payload.old.container_no];
            return next;
          });
        } else {
          setContainerMeta(prev => ({ ...prev, [payload.new.container_no]: payload.new }));
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(cargoSub);
      supabase.removeChannel(metaSub);
    };
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
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
      shipper: form.shipper.trim(),
      consignee: form.consignee.trim(),
      gst_number: form.gst_number || null,
      eway_bill: form.eway_bill || null,
      quantity: form.quantity || null,
      goods_description: form.goods_description.trim(),
      container_no: containerKey,
      vehicle_number: form.vehicle_number || null,
      booking_date: form.booking_date || null,
      vessel_name: form.vessel_name || null,
      voyage_number: form.voyage_number || null,
      remarks: form.remarks || null,
      created_by_email: userEmail,
    };

    if (editId) {
      const { error } = await supabase.from("cargo_entries").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editId);
      if (error) { showToast(error.message, "error"); return; }
      showToast("Cargo entry updated.");
    } else {
      const { error } = await supabase.from("cargo_entries").insert(payload);
      if (error) { showToast(error.message, "error"); return; }
      const existing = entries.find(e => e.container_no === containerKey);
      showToast(existing ? `Added to container ${containerKey} (LCL grouped).` : "New cargo entry logged.");
    }

    // Upsert container meta
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
    setForm({
      ...entry,
      vessel_name: entry.vessel_name || meta.vessel_name || "",
      voyage_number: entry.voyage_number || meta.voyage_number || "",
    });
    setEditId(entry.id);
    setActiveTab("entry");
  };

  const handleDelete = (id) => setDeleteConfirm(id);

  const confirmDelete = async () => {
    const { error } = await supabase.from("cargo_entries").delete().eq("id", deleteConfirm);
    if (error) { showToast(error.message, "error"); return; }
    setDeleteConfirm(null);
    showToast("Entry deleted.", "error");
  };

  const updateContainerStatus = async (containerNo, status) => {
    const existing = containerMeta[containerNo] || { container_no: containerNo };
    const { error } = await supabase.from("container_meta").upsert({
      ...existing, container_no: containerNo, status, updated_at: new Date().toISOString(),
    });
    if (error) { showToast(error.message, "error"); return; }
    showToast(`Status updated to ${getStatusInfo(status).label}.`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const grouped = useMemo(() => {
    return entries.reduce((acc, entry) => {
      const key = entry.container_no;
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    }, {});
  }, [entries]);

  const uniqueShippers = useMemo(() => [...new Set(entries.map(e => e.shipper).filter(Boolean))].sort(), [entries]);
  const uniqueConsignees = useMemo(() => [...new Set(entries.map(e => e.consignee).filter(Boolean))].sort(), [entries]);
  const uniqueVessels = useMemo(() => [...new Set(Object.values(containerMeta).map(m => m?.vessel_name).filter(Boolean))].sort(), [containerMeta]);

  const filteredKeys = useMemo(() => {
    return Object.keys(grouped).filter(key => {
      if (search) {
        const q = search.toUpperCase();
        const matches = key.includes(q) || grouped[key].some(e =>
          (e.vehicle_number || "").toUpperCase().includes(q) ||
          e.shipper.toUpperCase().includes(q) ||
          e.consignee.toUpperCase().includes(q)
        );
        if (!matches) return false;
      }
      if (statusFilter !== "all") {
        if ((containerMeta[key]?.status || "stuffing") !== statusFilter) return false;
      }
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

  const lclBannerEntry = form.container_no ? entries.find(e =>
    e.container_no === form.container_no.trim().toUpperCase() && e.id !== editId
  ) : null;

  const exportAllExcel = () => {
    if (entries.length === 0) { showToast("No data to export.", "error"); return; }
    const rows = entries.map(e => {
      const m = containerMeta[e.container_no] || {};
      return {
        "Container No.": e.container_no,
        "Status": getStatusInfo(m.status || "stuffing").label,
        "Shipper": e.shipper,
        "Consignee": e.consignee,
        "GST No.": e.gst_number || "",
        "E-Way Bill": e.eway_bill || "",
        "Quantity": e.quantity || "",
        "Goods Description": e.goods_description,
        "Vehicle No.": e.vehicle_number || "",
        "Vessel": m.vessel_name || "",
        "Voyage": m.voyage_number || "",
        "Booking Date": e.booking_date || "",
        "Remarks": e.remarks || "",
        "Logged By": e.created_by_email || "",
        "Logged At": new Date(e.created_at).toLocaleString("en-IN"),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Manifest");
    XLSX.writeFile(wb, `Kraft_Manifest_${todayStr()}.xlsx`);
    showToast("Excel exported.");
  };

  const exportContainerExcel = (containerNo) => {
    const cargos = grouped[containerNo] || [];
    if (cargos.length === 0) return;
    const rows = cargos.map((e, i) => ({
      "#": i + 1,
      "Shipper": e.shipper,
      "Consignee": e.consignee,
      "GST No.": e.gst_number || "",
      "E-Way Bill": e.eway_bill || "",
      "Quantity": e.quantity || "",
      "Goods Description": e.goods_description,
      "Booking Date": formatDate(e.booking_date),
      "Remarks": e.remarks || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, containerNo.slice(0, 30));
    XLSX.writeFile(wb, `${containerNo}_${todayStr()}.xlsx`);
    showToast("Excel exported.");
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: OFFWHITE, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <img src="/kraft-logo.png" alt="Kraft" style={{ width: "56px", height: "56px", marginBottom: "12px", objectFit: "contain" }} />
          <div style={{ color: MUTED }}>Loading Kraft Manifest...</div>
        </div>
      </div>
    );
  }

  if (printContainer) {
    return <PrintView containerNo={printContainer} entries={grouped[printContainer] || []} meta={containerMeta[printContainer]} onClose={() => setPrintContainer(null)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: OFFWHITE, color: TEXT, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: #b0a8b8; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{
        background: `linear-gradient(90deg, ${NAVY} 0%, ${NAVY2} 100%)`,
        padding: "0 16px", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: "64px",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 12px rgba(13,30,60,0.3)",
      }}>
       <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
          <img src="/kraft-logo.png" alt="Kraft" style={{ width: "40px", height: "40px", objectFit: "contain", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: OFFWHITE }}>Cargo Manifest</div>
            <div style={{ fontSize: "10px", color: "rgba(240,237,240,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
          </div>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setShowMenu(!showMenu)} style={{
            padding: "8px 12px", borderRadius: "8px", fontSize: "18px", cursor: "pointer",
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)",
            color: OFFWHITE, fontWeight: 700,
          }}>⋮</button>
          {showMenu && (
            <div style={{ position: "absolute", right: 0, top: "100%", marginTop: "8px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "10px", boxShadow: "0 4px 20px rgba(13,30,60,0.2)", zIndex: 200, minWidth: "220px", overflow: "hidden" }}>
              <button onClick={() => { exportAllExcel(); setShowMenu(false); }} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", border: "none", background: "#fff", color: NAVY, fontSize: "13px", fontWeight: 600, cursor: "pointer", textAlign: "left" }}>📊 Export All to Excel</button>
              <button onClick={() => { handleLogout(); setShowMenu(false); }} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "12px 14px", border: "none", background: "#fff", color: "#c0392b", fontSize: "13px", fontWeight: 600, cursor: "pointer", textAlign: "left", borderTop: `1px solid ${BORDER}` }}>🚪 Log Out</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "4px", padding: "10px 16px 0", background: OFFWHITE, position: "sticky", top: "64px", zIndex: 90, borderBottom: `1px solid ${BORDER}` }}>
        {[["entry", "📋 Entry"], ["log", `📦 Log (${Object.keys(grouped).length})`], ["dashboard", "📊 Stats"]].map(([tab, label]) => (
          <button key={tab} onClick={() => { setActiveTab(tab); if (tab === "entry" && !editId) { setForm(initialForm); setErrors({}); } }}
            style={{
              flex: 1, padding: "10px 8px", borderRadius: "8px 8px 0 0", fontSize: "12px", fontWeight: 600, cursor: "pointer",
              background: activeTab === tab ? "#fff" : "transparent",
              border: `1px solid ${activeTab === tab ? BORDER : "transparent"}`,
              borderBottom: activeTab === tab ? "1px solid #fff" : "none",
              marginBottom: "-1px",
              color: activeTab === tab ? NAVY : MUTED,
            }}>{label}</button>
        ))}
      </div>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px 16px" }}>

        {activeTab === "entry" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: NAVY, margin: 0 }}>
                {editId ? "✏️ Edit Cargo Entry" : "📋 New Cargo Entry"}
              </h2>
              <p style={{ fontSize: "12px", color: MUTED, margin: "4px 0 0" }}>
                {editId ? "Update the details below and save." : "Same container number will be grouped automatically as LCL cargo."}
              </p>
            </div>

            <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "20px", boxShadow: "0 2px 12px rgba(13,30,60,0.07)" }}>
              {lclBannerEntry && (
                <div style={{ background: "#e6f7ed", border: "1px solid #9eddb8", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "18px" }}>📦</span>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#1a5c32" }}>LCL Container Detected</div>
                    <div style={{ fontSize: "11px", color: "#2a7a4a" }}>
                      Container <strong style={{ fontFamily: "'DM Mono', monospace" }}>{form.container_no.toUpperCase()}</strong> already has cargo. New entry will be grouped under it.
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <Field label="Shipper" field="shipper" placeholder="Shipper name" required half value={form.shipper} error={errors.shipper} onChange={handleFieldChange} listId="shippers-list" list={uniqueShippers} />
                <Field label="Consignee" field="consignee" placeholder="Consignee name" required half value={form.consignee} error={errors.consignee} onChange={handleFieldChange} listId="consignees-list" list={uniqueConsignees} />
                <Field label="GST Number" field="gst_number" placeholder="e.g. 19AABCK1234A1Z5" half value={form.gst_number} error={errors.gst_number} onChange={handleFieldChange} />
                <Field label="E-Way Bill Number" field="eway_bill" placeholder="e.g. 331234567890" half value={form.eway_bill} error={errors.eway_bill} onChange={handleFieldChange} />
                <Field label="Quantity" field="quantity" placeholder="e.g. 10 Boxes / 500 Kgs" half value={form.quantity} error={errors.quantity} onChange={handleFieldChange} />
                <Field label="Booking Date" field="booking_date" type="date" half value={form.booking_date} error={errors.booking_date} onChange={handleFieldChange} />
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                    Goods Description <span style={{ color: "#c0392b" }}>*</span>
                  </label>
                  <textarea
                    value={form.goods_description || ""}
                    onChange={e => handleFieldChange("goods_description", e.target.value)}
                    placeholder="Describe the goods..."
                    rows={2}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", background: errors.goods_description ? "#fef8f8" : "#fff", border: `1px solid ${errors.goods_description ? "#e74c3c" : BORDER}`, color: TEXT, fontSize: "14px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
                  />
                  {errors.goods_description && <div style={{ fontSize: "11px", color: "#c0392b", marginTop: "4px" }}>{errors.goods_description}</div>}
                </div>
                <Field label="Container No." field="container_no" placeholder="e.g. MSCU1234567" required half value={form.container_no} error={errors.container_no} onChange={handleFieldChange} />
                <Field label="Vehicle Number" field="vehicle_number" placeholder="e.g. WB12AB3456" half value={form.vehicle_number} error={errors.vehicle_number} onChange={handleFieldChange} />
                <Field label="Vessel Name" field="vessel_name" placeholder="e.g. MV APJ Karan 2" half value={form.vessel_name} error={errors.vessel_name} onChange={handleFieldChange} listId="vessels-list" list={uniqueVessels} />
                <Field label="Voyage Number" field="voyage_number" placeholder="e.g. 024" half value={form.voyage_number} error={errors.voyage_number} onChange={handleFieldChange} />
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                    📝 Remarks (Optional)
                  </label>
                  <textarea
                    value={form.remarks || ""}
                    onChange={e => handleFieldChange("remarks", e.target.value)}
                    placeholder="e.g. Fragile, hold for inspection, advance paid..."
                    rows={2}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", background: "#fff", border: `1px solid ${BORDER}`, color: TEXT, fontSize: "14px", outline: "none", resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button onClick={handleSubmit} style={{
                  flex: 1, padding: "12px", borderRadius: "10px", fontSize: "14px", fontWeight: 700,
                  background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`,
                  border: "none", color: OFFWHITE, cursor: "pointer", letterSpacing: "0.03em",
                }}>{editId ? "✅ Update Entry" : "💾 Save Cargo Entry"}</button>
                {editId && (
                  <button onClick={() => { setForm(initialForm); setEditId(null); setErrors({}); }} style={{
                    padding: "12px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
                    background: "#fff", border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer",
                  }}>Cancel</button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: NAVY, margin: 0 }}>Manifest Log</h2>
                <p style={{ fontSize: "12px", color: MUTED, margin: "4px 0 0" }}>
                  {filteredKeys.length} of {Object.keys(grouped).length} containers shown
                </p>
              </div>
              <button onClick={() => { setForm(initialForm); setEditId(null); setErrors({}); setActiveTab("entry"); }} style={{
                padding: "9px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
                background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`, border: "none", color: OFFWHITE, cursor: "pointer",
              }}>+ New Entry</button>
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: MUTED, fontSize: "14px" }}>🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search container, vehicle, shipper..."
                  style={{ width: "100%", padding: "11px 14px 11px 38px", borderRadius: "10px", background: "#fff", border: `1px solid ${BORDER}`, color: TEXT, fontSize: "14px", outline: "none" }}
                />
              </div>
              <button onClick={() => setShowFilters(!showFilters)} style={{
                padding: "11px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
                background: showFilters ? NAVY : "#fff",
                border: `1px solid ${showFilters ? NAVY : BORDER}`,
                color: showFilters ? "#fff" : NAVY, cursor: "pointer", whiteSpace: "nowrap",
              }}>🔧 {(statusFilter !== "all" || dateFromFilter || dateToFilter) ? "•" : ""} Filters</button>
            </div>

            {showFilters && (
              <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>From Date</label>
                    <input type="date" value={dateFromFilter} onChange={e => setDateFromFilter(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: `1px solid ${BORDER}`, fontSize: "13px", color: TEXT, background: "#fff" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>To Date</label>
                    <input type="date" value={dateToFilter} onChange={e => setDateToFilter(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: `1px solid ${BORDER}`, fontSize: "13px", color: TEXT, background: "#fff" }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: NAVY2, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Status</label>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button onClick={() => setStatusFilter("all")} style={{
                      padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                      background: statusFilter === "all" ? NAVY : "#fff",
                      color: statusFilter === "all" ? "#fff" : NAVY,
                      border: `1px solid ${statusFilter === "all" ? NAVY : BORDER}`, cursor: "pointer",
                    }}>All</button>
                    {STATUSES.map(s => (
                      <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{
                        padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                        background: statusFilter === s.id ? s.color : s.bg,
                        color: statusFilter === s.id ? "#fff" : s.color,
                        border: `1px solid ${statusFilter === s.id ? s.color : s.border}`, cursor: "pointer",
                      }}>{s.icon} {s.label}</button>
                    ))}
                  </div>
                </div>
                {(dateFromFilter || dateToFilter || statusFilter !== "all") && (
                  <button onClick={() => { setDateFromFilter(""); setDateToFilter(""); setStatusFilter("all"); }} style={{
                    marginTop: "10px", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                    background: "#fff", border: `1px solid ${BORDER}`, color: MUTED, cursor: "pointer",
                  }}>✕ Clear filters</button>
                )}
              </div>
            )}

            {filteredKeys.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", border: `1px dashed ${BORDER}`, borderRadius: "14px", background: "#fff" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>📭</div>
                <div style={{ fontSize: "16px", color: NAVY, fontWeight: 600 }}>
                  {search || statusFilter !== "all" || dateFromFilter || dateToFilter ? "No results found" : "No cargo entries yet"}
                </div>
                <div style={{ fontSize: "13px", color: MUTED, marginTop: "6px" }}>
                  {search || statusFilter !== "all" || dateFromFilter || dateToFilter ? "Try changing filters." : "Click '+ New Entry' to log your first cargo."}
                </div>
              </div>
            ) : (
              filteredKeys.map(key => (
                <ContainerCard key={key} containerNo={key} entries={grouped[key]} meta={containerMeta[key]}
                  onEdit={handleEdit} onDelete={handleDelete}
                  onUpdateStatus={updateContainerStatus}
                  onPrint={setPrintContainer}
                  onExportContainer={exportContainerExcel}
                />
              ))
            )}
          </div>
        )}

        {activeTab === "dashboard" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: NAVY, margin: 0 }}>📊 Dashboard</h2>
              <p style={{ fontSize: "12px", color: MUTED, margin: "4px 0 0" }}>Operations overview · Live across all staff</p>
            </div>
            <Dashboard entries={entries} containerMeta={containerMeta} />
          </div>
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          background: toast.type === "error" ? "#fdecea" : "#e6f7ed",
          border: `1px solid ${toast.type === "error" ? "#f5b8b0" : "#9eddb8"}`,
          color: toast.type === "error" ? "#c0392b" : "#1a5c32",
          padding: "12px 20px", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
          boxShadow: "0 4px 16px rgba(13,30,60,0.15)", zIndex: 1000,
          animation: "fadeUp 0.2s ease",
        }}>
          {toast.type === "error" ? "🗑️" : "✅"} {toast.msg}
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(13,30,60,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "20px" }}>
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "14px", padding: "28px", maxWidth: "360px", width: "100%", textAlign: "center", boxShadow: "0 8px 32px rgba(13,30,60,0.2)" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>⚠️</div>
            <div style={{ fontSize: "17px", fontWeight: 700, color: NAVY, marginBottom: "8px" }}>Delete Entry?</div>
            <div style={{ fontSize: "13px", color: MUTED, marginBottom: "24px" }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: "10px 20px", borderRadius: "8px", border: `1px solid ${BORDER}`, background: "#fff", color: MUTED, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={confirmDelete} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #f5b8b0", background: "#fdecea", color: "#c0392b", cursor: "pointer", fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}