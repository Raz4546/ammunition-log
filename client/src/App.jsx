import { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || '/api';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const BATTERIES = [
  { id: "A", name: "Battery Alpha",   callsign: "ALPHA-6",  color: "#e85d04" },
  { id: "B", name: "Battery Bravo",   callsign: "BRAVO-6",  color: "#38bdf8" },
  { id: "C", name: "Battery Charlie", callsign: "CHARLIE-6",color: "#a3e635" },
  { id: "D", name: "Battery Delta",   callsign: "DELTA-6",  color: "#f472b6" },
];

const CATEGORY_META = {
  shell:      { label: "SHELL",      icon: "💥", color: "#e85d04" },
  propellant: { label: "PROPELLANT", icon: "🔥", color: "#facc15" },
  fuze:       { label: "FUZE",       icon: "⚡", color: "#38bdf8" },
};

// ─── HOOKS ────────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

// ─── API CALLS ───────────────────────────────────────────────────────────────
async function fetchAmmoTypes() {
  try {
    const res = await fetch(`${API_URL}/ammo-types`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch ammo types:', err);
    return [];
  }
}

async function apiCreateAmmoType(label, category) {
  const res = await fetch(`${API_URL}/ammo-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, category }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create ammo type');
  }
  return res.json();
}

async function apiDeleteAmmoType(id) {
  const res = await fetch(`${API_URL}/ammo-types/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete ammo type');
  }
}

async function fetchAmmunition() {
  try {
    const res = await fetch(`${API_URL}/ammunition`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch ammunition:', err);
    return [];
  }
}

async function fetchTransactions(limit = 100) {
  try {
    const res = await fetch(`${API_URL}/transactions?limit=${limit}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch transactions:', err);
    return [];
  }
}

async function submitTransaction(transactionData) {
  const res = await fetch(`${API_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transactionData),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Transaction failed');
  }
  return res.json();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function ts() {
  const d = new Date();
  return d.toLocaleTimeString("en-GB", { hour12: false }) + " " +
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }).toUpperCase();
}

function statusColor(pct) {
  if (pct > 60) return "#4ade80";
  if (pct > 30) return "#facc15";
  return "#ef4444";
}

function statusLabel(pct) {
  if (pct > 60) return "GREEN";
  if (pct > 30) return "AMBER";
  return "RED";
}

// Return color for an ammo type based on its category
function ammoColor(ammoType) {
  return CATEGORY_META[ammoType?.category]?.color || "#94a3b8";
}

function ammoIcon(ammoType) {
  return CATEGORY_META[ammoType?.category]?.icon || "🔹";
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole] = useState(null);
  const [selectedBattery, setSelectedBattery] = useState("A");
  const [ammoTypes, setAmmoTypes] = useState([]);
  const [stock, setStock] = useState({});
  const [log, setLog] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [txAmmoId, setTxAmmoId] = useState("");
  const [txQty, setTxQty] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txType, setTxType] = useState("ADD");
  const [flash, setFlash] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [typesData, ammoData, transactionData] = await Promise.all([
          fetchAmmoTypes(),
          fetchAmmunition(),
          fetchTransactions(100),
        ]);

        setAmmoTypes(typesData);
        if (typesData.length > 0) setTxAmmoId(typesData[0].id);

        const stockMap = {};
        BATTERIES.forEach(b => {
          stockMap[b.id] = {};
          typesData.forEach(a => {
            const ammo = ammoData.find(am => am.batteryId === b.id && am.ammoId === a.id);
            stockMap[b.id][a.id] = ammo?.quantity || 0;
          });
        });
        setStock(stockMap);
        setLog(transactionData);
      } catch (err) {
        showFlash("Failed to load data", "error");
      }
      setLoading(false);
    };
    loadData();
  }, []);

  async function handleAddAmmoType(label, category) {
    try {
      const newType = await apiCreateAmmoType(label, category);
      setAmmoTypes(prev => [...prev, newType].sort((a, b) =>
        a.category.localeCompare(b.category) || a.label.localeCompare(b.label)
      ));
      // Initialize stock entries for new type
      setStock(prev => {
        const next = { ...prev };
        BATTERIES.forEach(b => {
          next[b.id] = { ...(next[b.id] || {}), [newType.id]: 0 };
        });
        return next;
      });
      if (!txAmmoId) setTxAmmoId(newType.id);
      showFlash(`${newType.label} ADDED`, "success");
    } catch (err) {
      showFlash(err.message, "error");
    }
  }

  async function handleDeleteAmmoType(id) {
    try {
      await apiDeleteAmmoType(id);
      setAmmoTypes(prev => prev.filter(a => a.id !== id));
      setStock(prev => {
        const next = {};
        BATTERIES.forEach(b => {
          const btyStock = { ...(prev[b.id] || {}) };
          delete btyStock[id];
          next[b.id] = btyStock;
        });
        return next;
      });
      if (txAmmoId === id) {
        const remaining = ammoTypes.filter(a => a.id !== id);
        setTxAmmoId(remaining.length > 0 ? remaining[0].id : "");
      }
      showFlash("AMMO TYPE REMOVED", "success");
    } catch (err) {
      showFlash(err.message, "error");
    }
  }

  async function submitTx() {
    const qty = parseInt(txQty, 10);
    if (!txAmmoId) return showFlash("NO AMMO TYPE SELECTED", "error");
    if (!qty || qty <= 0) return showFlash("INVALID QTY", "error");

    const bty = selectedBattery;
    const current = stock[bty]?.[txAmmoId] || 0;
    if (txType === "SUB" && current < qty) return showFlash("INSUFFICIENT ROUNDS", "error");

    const ammoType = ammoTypes.find(a => a.id === txAmmoId);

    try {
      const transaction = await submitTransaction({
        batteryId: bty,
        ammoId: txAmmoId,
        type: txType,
        quantity: qty,
        note: txNote,
        batteryName: BATTERIES.find(b => b.id === bty).name,
        ammoLabel: ammoType?.label || txAmmoId,
      });

      const newQty = txType === "ADD" ? current + qty : current - qty;
      setStock(prev => ({ ...prev, [bty]: { ...prev[bty], [txAmmoId]: newQty } }));
      setLog(prev => [transaction, ...prev]);
      setTxQty("");
      setTxNote("");
      showFlash(`${txType === "ADD" ? "+" : "-"}${qty} ROUNDS LOGGED`, "success");
    } catch (err) {
      showFlash(err.message || "Transaction failed", "error");
    }
  }

  function showFlash(msg, kind) {
    setFlash({ msg, kind });
    setTimeout(() => setFlash(null), 2500);
  }

  const bnTotals = useMemo(() => {
    const t = {};
    ammoTypes.forEach(a => {
      t[a.id] = BATTERIES.reduce((sum, b) => sum + (stock[b.id]?.[a.id] || 0), 0);
    });
    return t;
  }, [stock, ammoTypes]);

  const MAX_PER_BTY = 400;

  if (loading) {
    return (
      <div style={{ ...s.screen, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 24, color: '#6b7280' }}>📡 Loading...</div>
      </div>
    );
  }

  if (!role) return <RoleSelect onSelect={setRole} />;

  if (role === "BN") return (
    <BNDashboard
      stock={stock} log={log} bnTotals={bnTotals}
      ammoTypes={ammoTypes}
      maxPerBty={MAX_PER_BTY} activeTab={activeTab}
      setActiveTab={setActiveTab} onLogout={() => setRole(null)}
      onAddAmmoType={handleAddAmmoType}
      onDeleteAmmoType={handleDeleteAmmoType}
    />
  );

  return (
    <BtyCommander
      battery={BATTERIES.find(b => b.id === selectedBattery)}
      batteries={BATTERIES}
      selectedBattery={selectedBattery}
      setSelectedBattery={setSelectedBattery}
      ammoTypes={ammoTypes}
      stock={stock[selectedBattery] || {}}
      log={log.filter(e => e.batteryId === selectedBattery)}
      txAmmoId={txAmmoId} setTxAmmoId={setTxAmmoId}
      txQty={txQty} setTxQty={setTxQty}
      txNote={txNote} setTxNote={setTxNote}
      txType={txType} setTxType={setTxType}
      onSubmit={submitTx} flash={flash}
      maxPerBty={MAX_PER_BTY}
      onLogout={() => setRole(null)}
    />
  );
}

// ─── STYLE OBJECT ─────────────────────────────────────────────────────────────
const s = {
  screen: { minHeight: "100vh", background: "#0f172a", color: "#fff", overflow: "hidden" },
  roleWrap: { display: "flex", flexDirection: "column", height: "100vh", padding: 0 },
  roleHeader: { flex: 0, padding: "60px 40px 40px", borderBottom: "2px solid #1e293b", textAlign: "center" },
  roleIcon: { fontSize: 64, marginBottom: 24 },
  roleTitle: { fontSize: 48, fontWeight: "bold", letterSpacing: 3, marginBottom: 8, color: "#fff" },
  roleSubtitle: { fontSize: 14, color: "#94a3b8", letterSpacing: 2, marginBottom: 24 },
  roleDivider: { height: 1, background: "#334155", margin: "24px 0" },
  roleClassified: { fontSize: 11, color: "#64748b", letterSpacing: 3, fontWeight: "600" },
  roleCards: { flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: "40px", maxWidth: "900px", margin: "0 auto" },
  roleCard: { padding: 32, border: "3px solid", background: "#1e293b", cursor: "pointer", transition: "all 0.3s", borderRadius: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" },
  roleCardBadge: { padding: "6px 12px", fontSize: 12, fontWeight: "bold", borderRadius: 4, marginBottom: 16, color: "#fff" },
  roleCardIcon: { fontSize: 56, marginBottom: 16 },
  roleCardName: { fontSize: 20, fontWeight: "bold", marginBottom: 12, color: "#fff" },
  roleCardDesc: { fontSize: 13, color: "#cbd5e1", lineHeight: 1.6, marginBottom: 20 },
  roleCardEnter: { fontSize: 12, fontWeight: "bold", letterSpacing: 1 },
  roleFooter: { flex: 0, padding: "20px 40px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "center", fontSize: 12 },
  bnWrap: { display: "flex", flexDirection: "column", height: "100vh" },
  bnHeader: { flex: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", borderBottom: "2px solid #1e293b", background: "#0f172a" },
  bnHeaderLeft: { display: "flex", gap: 16, alignItems: "center" },
  bnHeaderIcon: { fontSize: 32 },
  bnHeaderTitle: { fontSize: 24, fontWeight: "bold" },
  bnHeaderSub: { fontSize: 12, color: "#94a3b8", letterSpacing: 1 },
  bnHeaderRight: { display: "flex", gap: 16, alignItems: "center" },
  liveTag: { padding: "4px 12px", background: "#ef4444", borderRadius: 4, fontSize: 11, fontWeight: "bold" },
  logoutBtn: { padding: "8px 16px", background: "#334155", color: "#fff", border: "1px solid #475569", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: "bold" },
  tabs: { flex: 0, display: "flex", borderBottom: "1px solid #1e293b", background: "#0f172a", paddingLeft: 32 },
  tab: { flex: 0, padding: "12px 24px", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: "bold", borderBottom: "3px solid transparent", transition: "all 0.3s" },
  tabActive: { color: "#fff", borderBottomColor: "#38bdf8" },
  bnBody: { flex: 1, overflow: "auto", padding: 32 },
  dashGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 },
  fullRow: { gridColumn: "1 / -1" },
  ammoCard: { padding: 24, border: "2px solid", background: "#1e293b", borderRadius: 4 },
  ammoCardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  statusBadge: { padding: "4px 8px", fontSize: 11, fontWeight: "bold", borderRadius: 3 },
  ammoCardLabel: { fontSize: 14, color: "#cbd5e1", marginBottom: 8 },
  ammoCardQty: { fontSize: 32, fontWeight: "bold", marginBottom: 4 },
  ammoCardUnit: { fontSize: 11, color: "#64748b", marginBottom: 12, letterSpacing: 1 },
  progressBar: { height: 6, background: "#0f172a", borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  progressFill: { height: "100%", transition: "width 0.3s" },
  progressPct: { fontSize: 11, color: "#94a3b8", textAlign: "right" },
  sectionCard: { padding: 24, border: "1px solid #334155", background: "#1e293b", borderRadius: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 20, letterSpacing: 1 },
  btyStatusGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 },
  btyStatusCard: { padding: 16, border: "2px solid", background: "#0f172a", borderRadius: 4 },
  btyCallsign: { fontSize: 14, fontWeight: "bold" },
  btyName: { fontSize: 12, color: "#94a3b8", marginTop: 4, marginBottom: 12 },
  btyTotal: { fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  recentLog: { fontSize: 10, color: "#64748b", marginTop: 8, textAlign: "center" },
  btyDetailCard: { padding: 24, border: "2px solid", background: "#1e293b", borderRadius: 4 },
  btyDetailHeader: { paddingBottom: 16, borderBottom: "2px solid", marginBottom: 16 },
  ammoRow: { display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #334155", fontSize: 13 },
  ammoRowIcon: { fontSize: 18, marginRight: 12, width: 24 },
  ammoRowLabel: { flex: 1, fontWeight: "bold", color: "#cbd5e1" },
  inlineBar: { width: 80, height: 4, background: "#334155", borderRadius: 2, margin: "0 12px", flexShrink: 0 },
  btyWrap: { display: "flex", flexDirection: "column", height: "100vh" },
  btyHeader: { flex: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", borderBottom: "2px solid #1e293b", background: "#0f172a" },
  btyLeft: { display: "flex", gap: 16, alignItems: "center" },
  btyIcon: { fontSize: 28 },
  btyName2: { fontSize: 20, fontWeight: "bold" },
  btySub: { fontSize: 11, color: "#94a3b8", letterSpacing: 1, marginTop: 2 },
  btyRight: { display: "flex", gap: 12 },
  btySwitch: { padding: "6px 12px", background: "#334155", border: "1px solid #475569", color: "#cbd5e1", borderRadius: 4, cursor: "pointer", fontSize: 11 },
  btyBody: { flex: 1, display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20, padding: 20, overflow: "hidden" },
  btyLeftpanel: { display: "flex", flexDirection: "column", gap: 16, overflow: "auto", paddingRight: 12 },
  txCard: { padding: 20, border: "1px solid #334155", background: "#1e293b", borderRadius: 4 },
  txField: { marginBottom: 16 },
  txLabel: { fontSize: 12, color: "#94a3b8", marginBottom: 6, display: "block", fontWeight: "bold" },
  txSelect: { width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #334155", color: "#fff", borderRadius: 4, fontSize: 13, cursor: "pointer" },
  txInput: { width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #334155", color: "#fff", borderRadius: 4, fontSize: 13 },
  txButton: { width: "100%", padding: 12, background: "#38bdf8", color: "#000", border: "none", borderRadius: 4, fontWeight: "bold", cursor: "pointer", fontSize: 13, transition: "opacity 0.3s" },
  logRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, padding: "8px 0", borderBottom: "1px solid #334155", alignItems: "center" },
  logHeader: { fontWeight: "bold", color: "#94a3b8", fontSize: 11 },
  flashBar: { position: "fixed", bottom: 20, right: 20, padding: "12px 20px", borderRadius: 4, fontWeight: "bold", fontSize: 13, animation: "slideIn 0.3s", zIndex: 9999 },
};

// ─── ROLE SELECT ──────────────────────────────────────────────────────────────
function RoleSelect({ onSelect }) {
  const isMobile = useIsMobile();
  return (
    <div style={s.screen}>
      <div style={s.roleWrap}>
        <div style={{ ...s.roleHeader, padding: isMobile ? "32px 20px 24px" : "60px 40px 40px" }}>
          <div style={{ ...s.roleIcon, fontSize: isMobile ? 44 : 64, marginBottom: isMobile ? 16 : 24 }}>🎯</div>
          <div style={{ ...s.roleTitle, fontSize: isMobile ? 26 : 48, letterSpacing: isMobile ? 2 : 3 }}>ARTY AMMO TRACKER</div>
          <div style={{ ...s.roleSubtitle, fontSize: isMobile ? 11 : 14 }}>BATTALION AMMUNITION MANAGEMENT SYSTEM</div>
          <div style={s.roleDivider} />
          <div style={s.roleClassified}>SELECT AUTHENTICATION LEVEL</div>
        </div>
        <div style={{
          ...s.roleCards,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          padding: isMobile ? "20px 16px" : "40px",
          gap: isMobile ? 16 : 24,
          width: "100%",
          maxWidth: isMobile ? "100%" : "900px",
        }}>
          <button style={{ ...s.roleCard, borderColor: "#e85d04", padding: isMobile ? 20 : 32 }} onClick={() => onSelect("BN")}>
            <div style={{ ...s.roleCardBadge, background: "#e85d04" }}>BN CDR</div>
            <div style={{ ...s.roleCardIcon, fontSize: isMobile ? 40 : 56 }}>🏛️</div>
            <div style={{ ...s.roleCardName, fontSize: isMobile ? 17 : 20 }}>BATTALION COMMANDER</div>
            <div style={{ ...s.roleCardDesc, fontSize: isMobile ? 12 : 13 }}>Full situational awareness — view all battery stocks, manage ammunition types, and monitor battalion-wide status.</div>
            <div style={{ ...s.roleCardEnter, color: "#e85d04" }}>ENTER COMMAND →</div>
          </button>
          <button style={{ ...s.roleCard, borderColor: "#38bdf8", padding: isMobile ? 20 : 32 }} onClick={() => onSelect("BTY")}>
            <div style={{ ...s.roleCardBadge, background: "#38bdf8", color: "#0f172a" }}>BTY CDR</div>
            <div style={{ ...s.roleCardIcon, fontSize: isMobile ? 40 : 56 }}>⚡</div>
            <div style={{ ...s.roleCardName, fontSize: isMobile ? 17 : 20 }}>BATTERY COMMANDER</div>
            <div style={{ ...s.roleCardDesc, fontSize: isMobile ? 12 : 13 }}>Log ammunition transactions for your battery — resupply, expenditures, and transfers with real-time updates to HQ.</div>
            <div style={{ ...s.roleCardEnter, color: "#38bdf8" }}>ENTER COMMAND →</div>
          </button>
        </div>
        <div style={{ ...s.roleFooter, padding: isMobile ? "16px 20px" : "20px 40px", flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ color: "#4ade80" }}>● SYSTEM ONLINE</span>
          <span style={{ color: "#6b7280", marginLeft: isMobile ? 8 : 16 }}>v2.4 // SECURE CHANNEL</span>
        </div>
      </div>
    </div>
  );
}

// ─── BN DASHBOARD ─────────────────────────────────────────────────────────────
function BNDashboard({ stock, log, bnTotals, ammoTypes, maxPerBty, activeTab, setActiveTab, onLogout, onAddAmmoType, onDeleteAmmoType }) {
  const isMobile = useIsMobile();
  const tabs = ["DASHBOARD", "BATTERIES", "TRANSACTIONS", "ANALYTICS", "CONFIGURE"];

  const barData = ammoTypes.map(a => {
    const row = { name: a.id };
    BATTERIES.forEach(b => { row[b.name.split(" ")[1]] = stock[b.id]?.[a.id] || 0; });
    return row;
  });

  return (
    <div style={s.screen}>
      <div style={s.bnWrap}>
        <div style={{ ...s.bnHeader, padding: isMobile ? "12px 16px" : "20px 32px" }}>
          <div style={{ ...s.bnHeaderLeft, gap: isMobile ? 10 : 16 }}>
            <div style={{ ...s.bnHeaderIcon, fontSize: isMobile ? 24 : 32 }}>🏛️</div>
            <div>
              <div style={{ ...s.bnHeaderTitle, fontSize: isMobile ? 16 : 24 }}>BATTALION COMMAND</div>
              {!isMobile && <div style={s.bnHeaderSub}>AMMUNITION STATUS BOARD // {ts()}</div>}
            </div>
          </div>
          <div style={{ ...s.bnHeaderRight, gap: isMobile ? 8 : 16 }}>
            <div style={{ ...s.liveTag, padding: isMobile ? "3px 8px" : "4px 12px", fontSize: 10 }}>● LIVE</div>
            <button style={{ ...s.logoutBtn, padding: isMobile ? "6px 10px" : "8px 16px", fontSize: isMobile ? 10 : 12 }} onClick={onLogout}>LOGOUT</button>
          </div>
        </div>

        <div style={{
          ...s.tabs,
          paddingLeft: isMobile ? 4 : 32,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}>
          {tabs.map(t => (
            <button key={t} style={{
              ...s.tab,
              ...(activeTab === t.toLowerCase() ? s.tabActive : {}),
              ...(t === "CONFIGURE" && activeTab === "configure" ? { borderBottomColor: "#a3e635", color: "#a3e635" } : {}),
              padding: isMobile ? "10px 12px" : "12px 24px",
              fontSize: isMobile ? 10 : 12,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
              onClick={() => setActiveTab(t.toLowerCase())}>{t}</button>
          ))}
        </div>

        <div style={{ ...s.bnBody, padding: isMobile ? 12 : 32 }}>

          {activeTab === "dashboard" && (
            ammoTypes.length === 0 ? (
              <EmptyAmmoPrompt isMobile={isMobile} onConfigure={() => setActiveTab("configure")} />
            ) : (
              <div style={{ ...s.dashGrid, gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: isMobile ? 12 : 20 }}>
                {ammoTypes.map(a => {
                  const total = bnTotals[a.id] || 0;
                  const maxTotal = maxPerBty * BATTERIES.length;
                  const pct = Math.round((total / maxTotal) * 100);
                  const color = ammoColor(a);
                  return (
                    <div key={a.id} style={{ ...s.ammoCard, borderColor: color, padding: isMobile ? 14 : 24 }}>
                      <div style={s.ammoCardTop}>
                        <span style={{ fontSize: isMobile ? 16 : 20 }}>{ammoIcon(a)}</span>
                        <span style={{ fontSize: isMobile ? 9 : 10, color: "#94a3b8", fontWeight: "bold", letterSpacing: 1 }}>
                          {CATEGORY_META[a.category]?.label}
                        </span>
                        <span style={{ ...s.statusBadge, background: statusColor(pct) + "22", color: statusColor(pct), border: `1px solid ${statusColor(pct)}`, fontSize: isMobile ? 9 : 11 }}>
                          {statusLabel(pct)}
                        </span>
                      </div>
                      <div style={{ ...s.ammoCardLabel, fontSize: isMobile ? 11 : 14 }}>{a.label}</div>
                      <div style={{ ...s.ammoCardQty, color, fontSize: isMobile ? 22 : 32 }}>{total.toLocaleString()}</div>
                      <div style={s.ammoCardUnit}>ROUNDS TOTAL</div>
                      <div style={s.progressBar}>
                        <div style={{ ...s.progressFill, width: `${pct}%`, background: color }} />
                      </div>
                      <div style={s.progressPct}>{pct}% OF CAPACITY</div>
                    </div>
                  );
                })}

                <div style={{ ...s.fullRow, ...s.sectionCard, padding: isMobile ? 14 : 24 }}>
                  <div style={{ ...s.sectionTitle, fontSize: isMobile ? 13 : 16 }}>⚡ BATTERY STATUS OVERVIEW</div>
                  <div style={{ ...s.btyStatusGrid, gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: isMobile ? 10 : 16 }}>
                    {BATTERIES.map(b => {
                      const totalRounds = ammoTypes.reduce((sum, a) => sum + (stock[b.id]?.[a.id] || 0), 0);
                      const maxRounds = ammoTypes.length * maxPerBty;
                      const pct = maxRounds > 0 ? Math.round((totalRounds / maxRounds) * 100) : 0;
                      const recent = log.filter(l => l.batteryId === b.id)[0];
                      return (
                        <div key={b.id} style={{ ...s.btyStatusCard, borderColor: b.color, padding: isMobile ? 12 : 16 }}>
                          <div style={{ ...s.btyCallsign, color: b.color, fontSize: isMobile ? 12 : 14 }}>{b.callsign}</div>
                          <div style={{ ...s.btyName, fontSize: isMobile ? 10 : 12 }}>{b.name}</div>
                          <div style={{ ...s.btyTotal, fontSize: isMobile ? 16 : 20 }}>{totalRounds.toLocaleString()} RDS</div>
                          <div style={s.progressBar}>
                            <div style={{ ...s.progressFill, width: `${pct}%`, background: b.color }} />
                          </div>
                          <div style={{ ...s.statusBadge, marginTop: 8, background: statusColor(pct) + "22", color: statusColor(pct), border: `1px solid ${statusColor(pct)}`, fontSize: isMobile ? 9 : 11 }}>
                            {statusLabel(pct)} // {pct}%
                          </div>
                          {recent && !isMobile && <div style={s.recentLog}>LAST TX: {recent.timestamp}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ ...s.fullRow, ...s.sectionCard, padding: isMobile ? 14 : 24 }}>
                  <div style={{ ...s.sectionTitle, fontSize: isMobile ? 13 : 16 }}>📋 RECENT TRANSACTIONS</div>
                  <LogTable log={log.slice(0, 5)} isMobile={isMobile} />
                </div>
              </div>
            )
          )}

          {activeTab === "batteries" && (
            ammoTypes.length === 0 ? (
              <EmptyAmmoPrompt isMobile={isMobile} onConfigure={() => setActiveTab("configure")} />
            ) : (
              <div style={{ ...s.dashGrid, gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))", gap: isMobile ? 12 : 20 }}>
                {BATTERIES.map(b => (
                  <div key={b.id} style={{ ...s.btyDetailCard, borderColor: b.color, padding: isMobile ? 14 : 24 }}>
                    <div style={{ ...s.btyDetailHeader, borderBottomColor: b.color }}>
                      <span style={{ ...s.btyCallsign, color: b.color, fontSize: isMobile ? 15 : 18 }}>{b.callsign}</span>
                      <span style={s.btyName}>{b.name}</span>
                    </div>
                    {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                      const catTypes = ammoTypes.filter(a => a.category === cat);
                      if (catTypes.length === 0) return null;
                      return (
                        <div key={cat}>
                          <div style={{ fontSize: 10, color: meta.color, fontWeight: "bold", letterSpacing: 1, marginTop: 10, marginBottom: 4 }}>
                            {meta.icon} {meta.label}
                          </div>
                          {catTypes.map(a => {
                            const qty = stock[b.id]?.[a.id] || 0;
                            const pct = Math.round((qty / maxPerBty) * 100);
                            return (
                              <div key={a.id} style={{ ...s.ammoRow, fontSize: isMobile ? 12 : 13 }}>
                                <span style={{ ...s.ammoRowLabel }}>{a.label}</span>
                                <div style={{ ...s.inlineBar }}>
                                  <div style={{ height: "100%", width: `${pct}%`, background: meta.color, borderRadius: 2, transition: "width 0.3s" }} />
                                </div>
                                <span style={{ fontSize: isMobile ? 11 : 12, color: meta.color, fontWeight: "bold", minWidth: 30, textAlign: "right" }}>{qty}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === "transactions" && (
            <div style={{ ...s.sectionCard, padding: isMobile ? 14 : 24 }}>
              <div style={{ ...s.sectionTitle, fontSize: isMobile ? 13 : 16 }}>📋 COMPLETE TRANSACTION LOG</div>
              <LogTable log={log} isMobile={isMobile} />
            </div>
          )}

          {activeTab === "analytics" && (
            ammoTypes.length === 0 ? (
              <EmptyAmmoPrompt isMobile={isMobile} onConfigure={() => setActiveTab("configure")} />
            ) : (
              <div style={{ ...s.sectionCard, padding: isMobile ? 14 : 24 }}>
                <div style={{ ...s.sectionTitle, fontSize: isMobile ? 13 : 16 }}>📊 AMMUNITION DISTRIBUTION BY BATTERY</div>
                <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 30 : 40} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: isMobile ? 11 : 13 }} />
                    {!isMobile && <Legend />}
                    {BATTERIES.map(b => (
                      <Bar key={b.id} dataKey={b.name.split(" ")[1]} fill={b.color} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          )}

          {activeTab === "configure" && (
            <AmmoTypeManager
              ammoTypes={ammoTypes}
              onAdd={onAddAmmoType}
              onDelete={onDeleteAmmoType}
              isMobile={isMobile}
            />
          )}

        </div>
      </div>
    </div>
  );
}

// ─── AMMO TYPE MANAGER ────────────────────────────────────────────────────────
function AmmoTypeManager({ ammoTypes, onAdd, onDelete, isMobile }) {
  const [inputs, setInputs] = useState({ shell: "", propellant: "", fuze: "" });
  const [busy, setBusy] = useState({ shell: false, propellant: false, fuze: false });

  const grouped = {
    shell: ammoTypes.filter(a => a.category === "shell"),
    propellant: ammoTypes.filter(a => a.category === "propellant"),
    fuze: ammoTypes.filter(a => a.category === "fuze"),
  };

  async function handleAdd(cat) {
    const label = inputs[cat].trim();
    if (!label) return;
    setBusy(p => ({ ...p, [cat]: true }));
    await onAdd(label, cat);
    setInputs(p => ({ ...p, [cat]: "" }));
    setBusy(p => ({ ...p, [cat]: false }));
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>⚙️ CONFIGURE AMMUNITION TYPES</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          Define available ammunition types for all battery commanders. Types are organised by category.
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
        gap: isMobile ? 16 : 24,
      }}>
        {Object.entries(CATEGORY_META).map(([cat, meta]) => (
          <div key={cat} style={{
            padding: isMobile ? 16 : 24,
            border: `2px solid ${meta.color}`,
            background: "#1e293b",
            borderRadius: 6,
          }}>
            {/* Category Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 24 }}>{meta.icon}</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: "bold", color: meta.color, letterSpacing: 1 }}>{meta.label}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{grouped[cat].length} type{grouped[cat].length !== 1 ? "s" : ""} defined</div>
              </div>
            </div>

            {/* Type List */}
            <div style={{ minHeight: 40, marginBottom: 16 }}>
              {grouped[cat].length === 0 ? (
                <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", padding: "8px 0" }}>
                  No {meta.label.toLowerCase()} types yet
                </div>
              ) : (
                grouped[cat].map(a => (
                  <div key={a.id} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "9px 0",
                    borderBottom: "1px solid #334155",
                  }}>
                    <span style={{ fontSize: 13, color: "#e2e8f0" }}>{a.label}</span>
                    <button
                      onClick={() => onDelete(a.id)}
                      style={{
                        padding: "3px 10px",
                        background: "#ef444415",
                        color: "#ef4444",
                        border: "1px solid #ef444440",
                        borderRadius: 3,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: "bold",
                        letterSpacing: 0.5,
                      }}
                    >
                      ✕ DEL
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Form */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  background: "#0f172a",
                  border: `1px solid ${meta.color}55`,
                  color: "#fff",
                  borderRadius: 4,
                  fontSize: 13,
                  outline: "none",
                }}
                placeholder={`New ${meta.label.toLowerCase()} name...`}
                value={inputs[cat]}
                onChange={e => setInputs(p => ({ ...p, [cat]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleAdd(cat)}
              />
              <button
                onClick={() => handleAdd(cat)}
                disabled={busy[cat] || !inputs[cat].trim()}
                style={{
                  padding: "8px 14px",
                  background: inputs[cat].trim() ? meta.color : "#334155",
                  color: inputs[cat].trim() ? "#000" : "#64748b",
                  border: "none",
                  borderRadius: 4,
                  cursor: inputs[cat].trim() ? "pointer" : "default",
                  fontSize: 12,
                  fontWeight: "bold",
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
              >
                {busy[cat] ? "..." : "+ ADD"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EMPTY STATE PROMPT ───────────────────────────────────────────────────────
function EmptyAmmoPrompt({ isMobile, onConfigure }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", textAlign: "center", gap: 16 }}>
      <div style={{ fontSize: 48 }}>⚙️</div>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: "bold" }}>NO AMMUNITION TYPES CONFIGURED</div>
      <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 380, lineHeight: 1.7 }}>
        The Battalion Commander must define ammunition types before batteries can log transactions.
      </div>
      <button
        onClick={onConfigure}
        style={{ marginTop: 8, padding: "12px 28px", background: "#a3e635", color: "#000", border: "none", borderRadius: 4, fontWeight: "bold", cursor: "pointer", fontSize: 13, letterSpacing: 1 }}
      >
        CONFIGURE AMMO TYPES →
      </button>
    </div>
  );
}

// ─── BATTERY COMMANDER ─────────────────────────────────────────────────────────
function BtyCommander({ battery, batteries, selectedBattery, setSelectedBattery, ammoTypes, stock, log, txAmmoId, setTxAmmoId, txQty, setTxQty, txNote, setTxNote, txType, setTxType, onSubmit, flash, maxPerBty, onLogout }) {
  const isMobile = useIsMobile();

  const hasTypes = ammoTypes.length > 0;

  return (
    <div style={s.screen}>
      <div style={s.btyWrap}>
        <div style={{ ...s.btyHeader, padding: isMobile ? "12px 16px" : "20px 32px" }}>
          <div style={{ ...s.btyLeft, gap: isMobile ? 10 : 16 }}>
            <div style={{ ...s.btyIcon, fontSize: isMobile ? 22 : 28 }}>⚡</div>
            <div>
              <div style={{ ...s.btyName2, fontSize: isMobile ? 15 : 20 }}>{battery.name.toUpperCase()}</div>
              {!isMobile && <div style={s.btySub}>{battery.callsign} // AMMUNITION MANAGEMENT</div>}
            </div>
          </div>
          <div style={{ ...s.btyRight, gap: isMobile ? 8 : 12 }}>
            <select style={{ ...s.btySwitch, padding: isMobile ? "5px 8px" : "6px 12px", fontSize: isMobile ? 10 : 11 }} value={selectedBattery} onChange={e => setSelectedBattery(e.target.value)}>
              {batteries.map(b => <option key={b.id} value={b.id}>{b.callsign}</option>)}
            </select>
            <button style={{ ...s.logoutBtn, padding: isMobile ? "5px 10px" : "8px 16px", fontSize: isMobile ? 10 : 12 }} onClick={onLogout}>LOGOUT</button>
          </div>
        </div>

        {!hasTypes ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", gap: 12 }}>
            <div style={{ fontSize: 40 }}>⚙️</div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: "bold" }}>AWAITING CONFIGURATION</div>
            <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 340, lineHeight: 1.7 }}>
              No ammunition types have been defined yet. Contact your Battalion Commander to configure available ammo types.
            </div>
          </div>
        ) : (
          <div style={{
            ...s.btyBody,
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr",
            overflow: isMobile ? "auto" : "hidden",
            padding: isMobile ? 12 : 20,
            gap: isMobile ? 12 : 20,
          }}>
            <div style={{ ...s.btyLeftpanel, paddingRight: isMobile ? 0 : 12, overflow: isMobile ? "visible" : "auto" }}>
              {/* Transaction Form */}
              <div style={{ ...s.txCard, borderColor: battery.color, borderWidth: 2, padding: isMobile ? 16 : 20 }}>
                <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: "bold", marginBottom: 16 }}>📝 LOG TRANSACTION</div>

                <div style={s.txField}>
                  <label style={s.txLabel}>AMMUNITION TYPE</label>
                  <select style={{ ...s.txSelect, fontSize: isMobile ? 12 : 13 }} value={txAmmoId} onChange={e => setTxAmmoId(e.target.value)}>
                    {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                      const catTypes = ammoTypes.filter(a => a.category === cat);
                      if (catTypes.length === 0) return null;
                      return (
                        <optgroup key={cat} label={`${meta.icon} ${meta.label}`}>
                          {catTypes.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={s.txField}>
                    <label style={s.txLabel}>TYPE</label>
                    <select style={{ ...s.txSelect, fontSize: isMobile ? 12 : 13 }} value={txType} onChange={e => setTxType(e.target.value)}>
                      <option value="ADD">➕ ADD</option>
                      <option value="SUB">➖ EXPEND</option>
                    </select>
                  </div>
                  <div style={s.txField}>
                    <label style={s.txLabel}>QUANTITY</label>
                    <input style={{ ...s.txInput, fontSize: isMobile ? 12 : 13 }} type="number" value={txQty} onChange={e => setTxQty(e.target.value)} placeholder="0" />
                  </div>
                </div>

                <div style={s.txField}>
                  <label style={s.txLabel}>NOTE (OPTIONAL)</label>
                  <input style={{ ...s.txInput, fontSize: isMobile ? 12 : 13 }} type="text" value={txNote} onChange={e => setTxNote(e.target.value)} placeholder="Resupply from HQ..." />
                </div>

                <button style={{ ...s.txButton, padding: isMobile ? 14 : 12, fontSize: isMobile ? 14 : 13 }} onClick={onSubmit}>
                  SUBMIT TRANSACTION
                </button>
              </div>

              {/* Current Stock grouped by category */}
              <div style={{ ...s.txCard, padding: isMobile ? 16 : 20 }}>
                <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: "bold", marginBottom: 12 }}>📊 CURRENT STOCK</div>
                {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                  const catTypes = ammoTypes.filter(a => a.category === cat);
                  if (catTypes.length === 0) return null;
                  return (
                    <div key={cat} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, color: meta.color, fontWeight: "bold", letterSpacing: 1, marginBottom: 8 }}>
                        {meta.icon} {meta.label}
                      </div>
                      {catTypes.map(a => {
                        const qty = stock[a.id] || 0;
                        const pct = Math.round((qty / maxPerBty) * 100);
                        return (
                          <div key={a.id} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: isMobile ? 11 : 12 }}>
                              <span style={{ color: "#cbd5e1" }}>{a.label}</span>
                              <span style={{ color: meta.color, fontWeight: "bold" }}>{qty}</span>
                            </div>
                            <div style={s.progressBar}>
                              <div style={{ ...s.progressFill, width: `${pct}%`, background: meta.color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transaction Log */}
            <div style={{ display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "auto", paddingRight: isMobile ? 0 : 12 }}>
              <div style={{ ...s.sectionCard, padding: isMobile ? 16 : 24 }}>
                <div style={{ ...s.sectionTitle, fontSize: isMobile ? 13 : 16 }}>📋 BATTERY TRANSACTION LOG</div>
                <LogTable log={log} isMobile={isMobile} />
              </div>
            </div>
          </div>
        )}
      </div>

      {flash && (
        <div style={{
          ...s.flashBar,
          background: flash.kind === "success" ? "#4ade80" : "#ef4444",
          color: flash.kind === "success" ? "#000" : "#fff",
          bottom: isMobile ? 16 : 20,
          right: isMobile ? 12 : 20,
          left: isMobile ? 12 : "auto",
          textAlign: isMobile ? "center" : "left",
          fontSize: isMobile ? 12 : 13,
        }}>
          {flash.msg}
        </div>
      )}
    </div>
  );
}

// ─── LOG TABLE ─────────────────────────────────────────────────────────────────
function LogTable({ log, isMobile }) {
  return (
    <div>
      <div style={{ ...s.logRow, ...s.logHeader, fontSize: isMobile ? 10 : 11 }}>
        <span>TIME</span>
        <span>AMMO</span>
        <span>TX</span>
        <span>QTY</span>
      </div>
      {(log || []).map((entry) => (
        <div key={entry._id || entry.id} style={{ ...s.logRow, fontSize: isMobile ? 11 : 12 }}>
          <span style={{ color: "#94a3b8" }}>
            {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false }) : entry.time}
          </span>
          <span style={{ color: "#cbd5e1" }}>{entry.ammoLabel || entry.ammoId}</span>
          <span style={{ color: entry.type === "ADD" ? "#4ade80" : "#ef4444" }}>{entry.type}</span>
          <span style={{ fontWeight: "bold" }}>{entry.quantity}</span>
        </div>
      ))}
      {(!log || log.length === 0) && (
        <div style={{ padding: "16px 0", fontSize: 12, color: "#475569", textAlign: "center" }}>No transactions yet</div>
      )}
    </div>
  );
}
