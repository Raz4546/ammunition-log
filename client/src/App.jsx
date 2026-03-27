import { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, CartesianGrid
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || '/api';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const AMMO_TYPES = [
  { id: "HE",   label: "HE 155mm",      color: "#e85d04", icon: "💥" },
  { id: "SMK",  label: "Smoke 155mm",   color: "#6b7280", icon: "🌫️" },
  { id: "ILLUM",label: "Illum 155mm",   color: "#facc15", icon: "💡" },
  { id: "WP",   label: "WP 155mm",      color: "#a3e635", icon: "⚗️" },
  { id: "DPICM",label: "DPICM 155mm",   color: "#f97316", icon: "🎯" },
  { id: "EXCAL",label: "Excalibur",     color: "#38bdf8", icon: "🔵" },
];

const BATTERIES = [
  { id: "A", name: "Battery Alpha",   callsign: "ALPHA-6",  color: "#e85d04" },
  { id: "B", name: "Battery Bravo",   callsign: "BRAVO-6",  color: "#38bdf8" },
  { id: "C", name: "Battery Charlie", callsign: "CHARLIE-6",color: "#a3e635" },
  { id: "D", name: "Battery Delta",   callsign: "DELTA-6",  color: "#f472b6" },
];

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
  try {
    const res = await fetch(`${API_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transactionData)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Transaction failed');
    }
    return await res.json();
  } catch (err) {
    throw err;
  }
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole] = useState(null);
  const [selectedBattery, setSelectedBattery] = useState("A");
  const [stock, setStock] = useState({});
  const [log, setLog] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [txAmmoId, setTxAmmoId] = useState("HE");
  const [txQty, setTxQty] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txType, setTxType] = useState("ADD");
  const [flash, setFlash] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load data from server on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [ammoData, transactionData] = await Promise.all([
          fetchAmmunition(),
          fetchTransactions(100)
        ]);

        // Build stock from ammo data
        const stockMap = {};
        BATTERIES.forEach(b => {
          stockMap[b.id] = {};
          AMMO_TYPES.forEach(a => {
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

  async function submitTx() {
    const qty = parseInt(txQty, 10);
    if (!qty || qty <= 0) return showFlash("INVALID QTY", "error");

    const bty = selectedBattery;
    const current = stock[bty][txAmmoId];
    if (txType === "SUB" && current < qty) return showFlash("INSUFFICIENT ROUNDS", "error");

    try {
      const transaction = await submitTransaction({
        batteryId: bty,
        ammoId: txAmmoId,
        type: txType,
        quantity: qty,
        note: txNote,
        batteryName: BATTERIES.find(b => b.id === bty).name,
        ammoLabel: AMMO_TYPES.find(a => a.id === txAmmoId).label
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
    AMMO_TYPES.forEach(a => {
      t[a.id] = BATTERIES.reduce((sum, b) => sum + (stock[b.id]?.[a.id] || 0), 0);
    });
    return t;
  }, [stock]);

  const MAX_PER_BTY = 400;

  if (loading) {
    return <div style={{...s.screen, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontSize: 24, color: '#6b7280'}}>📡 Loading...</div>
    </div>;
  }

  if (!role) return <RoleSelect onSelect={setRole} />;
  if (role === "BN") return (
    <BNDashboard
      stock={stock} log={log} bnTotals={bnTotals}
      maxPerBty={MAX_PER_BTY} activeTab={activeTab}
      setActiveTab={setActiveTab} onLogout={() => setRole(null)}
    />
  );
  return (
    <BtyCommander
      battery={BATTERIES.find(b => b.id === selectedBattery)}
      batteries={BATTERIES}
      selectedBattery={selectedBattery}
      setSelectedBattery={setSelectedBattery}
      stock={stock[selectedBattery] || {}}
      log={log.filter(e => e.batteryId === selectedBattery)}
      allLog={log}
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
  ammoRowLabel: { width: 60, fontWeight: "bold", color: "#cbd5e1" },
  inlineBar: { flex: 1, height: 4, background: "#334155", borderRadius: 2, margin: "0 12px" },
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
  logTable: { marginTop: 16, fontSize: 12 },
  logRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, padding: "8px 0", borderBottom: "1px solid #334155", alignItems: "center" },
  logHeader: { fontWeight: "bold", color: "#94a3b8", fontSize: 11 },
  flashBar: { position: "fixed", bottom: 20, right: 20, padding: "12px 20px", borderRadius: 4, fontWeight: "bold", fontSize: 13, animation: "slideIn 0.3s", zIndex: 9999 }
};

// ─── ROLE SELECT ──────────────────────────────────────────────────────────────
function RoleSelect({ onSelect }) {
  const isMobile = useIsMobile();
  return (
    <div style={s.screen}>
      <div style={s.roleWrap}>
        <div style={{
          ...s.roleHeader,
          padding: isMobile ? "32px 20px 24px" : "60px 40px 40px",
        }}>
          <div style={{...s.roleIcon, fontSize: isMobile ? 44 : 64, marginBottom: isMobile ? 16 : 24}}>🎯</div>
          <div style={{...s.roleTitle, fontSize: isMobile ? 26 : 48, letterSpacing: isMobile ? 2 : 3}}>ARTY AMMO TRACKER</div>
          <div style={{...s.roleSubtitle, fontSize: isMobile ? 11 : 14}}>BATTALION AMMUNITION MANAGEMENT SYSTEM</div>
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
          <button style={{...s.roleCard, borderColor:"#e85d04", padding: isMobile ? 20 : 32}} onClick={() => onSelect("BN")}>
            <div style={{...s.roleCardBadge, background:"#e85d04"}}>BN CDR</div>
            <div style={{...s.roleCardIcon, fontSize: isMobile ? 40 : 56}}>🏛️</div>
            <div style={{...s.roleCardName, fontSize: isMobile ? 17 : 20}}>BATTALION COMMANDER</div>
            <div style={{...s.roleCardDesc, fontSize: isMobile ? 12 : 13}}>Full situational awareness dashboard — view all battery stocks, transaction history, and ammo status reports across the battalion.</div>
            <div style={{...s.roleCardEnter, color:"#e85d04"}}>ENTER COMMAND →</div>
          </button>
          <button style={{...s.roleCard, borderColor:"#38bdf8", padding: isMobile ? 20 : 32}} onClick={() => onSelect("BTY")}>
            <div style={{...s.roleCardBadge, background:"#38bdf8", color:"#0f172a"}}>BTY CDR</div>
            <div style={{...s.roleCardIcon, fontSize: isMobile ? 40 : 56}}>⚡</div>
            <div style={{...s.roleCardName, fontSize: isMobile ? 17 : 20}}>BATTERY COMMANDER</div>
            <div style={{...s.roleCardDesc, fontSize: isMobile ? 12 : 13}}>Manage ammunition transactions for your battery — log resupply, expenditures, and transfers with real-time updates to HQ.</div>
            <div style={{...s.roleCardEnter, color:"#38bdf8"}}>ENTER COMMAND →</div>
          </button>
        </div>
        <div style={{...s.roleFooter, padding: isMobile ? "16px 20px" : "20px 40px", gap: 8, flexWrap: "wrap", justifyContent: "center"}}>
          <span style={{color:"#4ade80"}}>● SYSTEM ONLINE</span>
          <span style={{color:"#6b7280", marginLeft: isMobile ? 8 : 16}}>v2.4 // SECURE CHANNEL</span>
        </div>
      </div>
    </div>
  );
}

// ─── BN DASHBOARD ─────────────────────────────────────────────────────────────
function BNDashboard({ stock, log, bnTotals, maxPerBty, activeTab, setActiveTab, onLogout }) {
  const isMobile = useIsMobile();
  const tabs = ["DASHBOARD", "BATTERIES", "TRANSACTIONS", "ANALYTICS"];

  const barData = AMMO_TYPES.map(a => {
    const row = { name: a.id };
    BATTERIES.forEach(b => { row[b.name.split(" ")[1]] = stock[b.id]?.[a.id] || 0; });
    return row;
  });

  return (
    <div style={s.screen}>
      <div style={s.bnWrap}>
        <div style={{
          ...s.bnHeader,
          padding: isMobile ? "12px 16px" : "20px 32px",
          gap: isMobile ? 8 : 0,
        }}>
          <div style={{...s.bnHeaderLeft, gap: isMobile ? 10 : 16}}>
            <div style={{...s.bnHeaderIcon, fontSize: isMobile ? 24 : 32}}>🏛️</div>
            <div>
              <div style={{...s.bnHeaderTitle, fontSize: isMobile ? 16 : 24}}>BATTALION COMMAND</div>
              {!isMobile && <div style={s.bnHeaderSub}>AMMUNITION STATUS BOARD // {ts()}</div>}
            </div>
          </div>
          <div style={{...s.bnHeaderRight, gap: isMobile ? 8 : 16}}>
            <div style={{...s.liveTag, padding: isMobile ? "3px 8px" : "4px 12px", fontSize: 10}}>● LIVE</div>
            <button style={{...s.logoutBtn, padding: isMobile ? "6px 10px" : "8px 16px", fontSize: isMobile ? 10 : 12}} onClick={onLogout}>LOGOUT</button>
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
              ...(activeTab===t.toLowerCase() ? s.tabActive : {}),
              padding: isMobile ? "10px 14px" : "12px 24px",
              fontSize: isMobile ? 10 : 12,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
              onClick={() => setActiveTab(t.toLowerCase())}>{t}</button>
          ))}
        </div>

        <div style={{...s.bnBody, padding: isMobile ? 12 : 32}}>
          {activeTab === "dashboard" && (
            <div style={{
              ...s.dashGrid,
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
              gap: isMobile ? 12 : 20,
            }}>
              {AMMO_TYPES.map(a => {
                const total = bnTotals[a.id] || 0;
                const maxTotal = maxPerBty * BATTERIES.length;
                const pct = Math.round((total / maxTotal) * 100);
                return (
                  <div key={a.id} style={{...s.ammoCard, borderColor: a.color, padding: isMobile ? 14 : 24}}>
                    <div style={s.ammoCardTop}>
                      <span style={{fontSize: isMobile ? 18 : 22}}>{a.icon}</span>
                      <span style={{...s.statusBadge, background: statusColor(pct)+"22", color: statusColor(pct), border: `1px solid ${statusColor(pct)}`, fontSize: isMobile ? 9 : 11}}>
                        {statusLabel(pct)}
                      </span>
                    </div>
                    <div style={{...s.ammoCardLabel, fontSize: isMobile ? 11 : 14}}>{a.label}</div>
                    <div style={{...s.ammoCardQty, color: a.color, fontSize: isMobile ? 22 : 32}}>{total.toLocaleString()}</div>
                    <div style={s.ammoCardUnit}>ROUNDS</div>
                    <div style={s.progressBar}>
                      <div style={{...s.progressFill, width:`${pct}%`, background: a.color}} />
                    </div>
                    <div style={s.progressPct}>{pct}%</div>
                  </div>
                );
              })}

              <div style={{...s.fullRow, ...s.sectionCard, padding: isMobile ? 14 : 24}}>
                <div style={{...s.sectionTitle, fontSize: isMobile ? 13 : 16}}>⚡ BATTERY STATUS OVERVIEW</div>
                <div style={{
                  ...s.btyStatusGrid,
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: isMobile ? 10 : 16,
                }}>
                  {BATTERIES.map(b => {
                    const totalRounds = AMMO_TYPES.reduce((sum, a) => sum + (stock[b.id]?.[a.id] || 0), 0);
                    const maxRounds = AMMO_TYPES.length * maxPerBty;
                    const pct = Math.round((totalRounds / maxRounds) * 100);
                    const recent = log.filter(l => l.batteryId === b.id).slice(0, 1)[0];
                    return (
                      <div key={b.id} style={{...s.btyStatusCard, borderColor: b.color, padding: isMobile ? 12 : 16}}>
                        <div style={{...s.btyCallsign, color: b.color, fontSize: isMobile ? 12 : 14}}>{b.callsign}</div>
                        <div style={{...s.btyName, fontSize: isMobile ? 10 : 12}}>{b.name}</div>
                        <div style={{...s.btyTotal, fontSize: isMobile ? 16 : 20}}>{totalRounds.toLocaleString()} RDS</div>
                        <div style={s.progressBar}>
                          <div style={{...s.progressFill, width:`${pct}%`, background: b.color}} />
                        </div>
                        <div style={{...s.statusBadge, marginTop:8, background: statusColor(pct)+"22", color: statusColor(pct), border: `1px solid ${statusColor(pct)}`, fontSize: isMobile ? 9 : 11}}>
                          {statusLabel(pct)} // {pct}%
                        </div>
                        {recent && !isMobile && <div style={s.recentLog}>LAST TX: {recent.timestamp}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{...s.fullRow, ...s.sectionCard, padding: isMobile ? 14 : 24}}>
                <div style={{...s.sectionTitle, fontSize: isMobile ? 13 : 16}}>📋 RECENT TRANSACTIONS</div>
                <LogTable log={log.slice(0, 5)} compact isMobile={isMobile} />
              </div>
            </div>
          )}

          {activeTab === "batteries" && (
            <div style={{
              ...s.dashGrid,
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
              gap: isMobile ? 12 : 20,
            }}>
              {BATTERIES.map(b => (
                <div key={b.id} style={{...s.btyDetailCard, borderColor: b.color, padding: isMobile ? 14 : 24}}>
                  <div style={{...s.btyDetailHeader, borderBottomColor: b.color}}>
                    <span style={{...s.btyCallsign, color: b.color, fontSize: isMobile ? 15 : 18}}>{b.callsign}</span>
                    <span style={s.btyName}>{b.name}</span>
                  </div>
                  {AMMO_TYPES.map(a => {
                    const qty = stock[b.id]?.[a.id] || 0;
                    const pct = Math.round((qty / maxPerBty) * 100);
                    return (
                      <div key={a.id} style={{...s.ammoRow, fontSize: isMobile ? 12 : 13}}>
                        <span style={{...s.ammoRowIcon, fontSize: isMobile ? 15 : 18}}>{a.icon}</span>
                        <span style={{...s.ammoRowLabel, width: isMobile ? 48 : 60}}>{a.id}</span>
                        <div style={{...s.inlineBar, margin: isMobile ? "0 8px" : "0 12px"}}>
                          <div style={{height:"100%", width:`${pct}%`, background: a.color, borderRadius:2, transition:"width 0.3s"}} />
                        </div>
                        <span style={{fontSize: isMobile ? 11 : 12, color: a.color, fontWeight:"bold"}}>{qty}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {activeTab === "transactions" && (
            <div style={{...s.sectionCard, ...s.fullRow, padding: isMobile ? 14 : 24}}>
              <div style={{...s.sectionTitle, fontSize: isMobile ? 13 : 16}}>📋 COMPLETE TRANSACTION LOG</div>
              <LogTable log={log} isMobile={isMobile} />
            </div>
          )}

          {activeTab === "analytics" && (
            <div style={{...s.sectionCard, ...s.fullRow, padding: isMobile ? 14 : 24}}>
              <div style={{...s.sectionTitle, fontSize: isMobile ? 13 : 16}}>📊 AMMUNITION DISTRIBUTION</div>
              <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{fontSize: isMobile ? 10 : 12}} />
                  <YAxis stroke="#94a3b8" tick={{fontSize: isMobile ? 10 : 12}} width={isMobile ? 30 : 40} />
                  <Tooltip contentStyle={{background:"#1e293b", border:"1px solid #334155", fontSize: isMobile ? 11 : 13}} />
                  {!isMobile && <Legend />}
                  {BATTERIES.map(b => (
                    <Bar key={b.id} dataKey={b.name.split(" ")[1]} fill={b.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BATTERY COMMANDER ─────────────────────────────────────────────────────────
function BtyCommander({ battery, batteries, selectedBattery, setSelectedBattery, stock, log, txAmmoId, setTxAmmoId, txQty, setTxQty, txNote, setTxNote, txType, setTxType, onSubmit, flash, maxPerBty, onLogout }) {
  const isMobile = useIsMobile();
  return (
    <div style={s.screen}>
      <div style={s.btyWrap}>
        <div style={{
          ...s.btyHeader,
          padding: isMobile ? "12px 16px" : "20px 32px",
        }}>
          <div style={{...s.btyLeft, gap: isMobile ? 10 : 16}}>
            <div style={{...s.btyIcon, fontSize: isMobile ? 22 : 28}}>⚡</div>
            <div>
              <div style={{...s.btyName2, fontSize: isMobile ? 15 : 20}}>{battery.name.toUpperCase()}</div>
              {!isMobile && <div style={s.btySub}>{battery.callsign} // AMMUNITION MANAGEMENT</div>}
            </div>
          </div>
          <div style={{...s.btyRight, gap: isMobile ? 8 : 12}}>
            <select style={{...s.btySwitch, padding: isMobile ? "5px 8px" : "6px 12px", fontSize: isMobile ? 10 : 11}} value={selectedBattery} onChange={(e) => setSelectedBattery(e.target.value)}>
              {batteries.map(b => <option key={b.id} value={b.id}>{b.callsign}</option>)}
            </select>
            <button style={{...s.logoutBtn, padding: isMobile ? "5px 10px" : "8px 16px", fontSize: isMobile ? 10 : 12}} onClick={onLogout}>LOGOUT</button>
          </div>
        </div>

        <div style={{
          ...s.btyBody,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr",
          overflow: isMobile ? "auto" : "hidden",
          padding: isMobile ? 12 : 20,
          gap: isMobile ? 12 : 20,
        }}>
          <div style={{...s.btyLeftpanel, paddingRight: isMobile ? 0 : 12, overflow: isMobile ? "visible" : "auto"}}>
            <div style={{...s.txCard, borderColor: battery.color, borderWidth: 2, padding: isMobile ? 16 : 20}}>
              <div style={{fontSize: isMobile ? 13 : 14, fontWeight:"bold", marginBottom:16}}>📝 LOG TRANSACTION</div>
              <div style={s.txField}>
                <label style={s.txLabel}>AMMUNITION TYPE</label>
                <select style={{...s.txSelect, fontSize: isMobile ? 12 : 13}} value={txAmmoId} onChange={(e) => setTxAmmoId(e.target.value)}>
                  {AMMO_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16}}>
                <div style={s.txField}>
                  <label style={s.txLabel}>TYPE</label>
                  <select style={{...s.txSelect, fontSize: isMobile ? 12 : 13}} value={txType} onChange={(e) => setTxType(e.target.value)}>
                    <option value="ADD">➕ ADD</option>
                    <option value="SUB">➖ EXPEND</option>
                  </select>
                </div>
                <div style={s.txField}>
                  <label style={s.txLabel}>QUANTITY</label>
                  <input style={{...s.txInput, fontSize: isMobile ? 12 : 13}} type="number" value={txQty} onChange={(e) => setTxQty(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div style={s.txField}>
                <label style={s.txLabel}>NOTE (OPTIONAL)</label>
                <input style={{...s.txInput, fontSize: isMobile ? 12 : 13}} type="text" value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="Resupply from HQ..." />
              </div>
              <button style={{...s.txButton, padding: isMobile ? 14 : 12, fontSize: isMobile ? 14 : 13}} onClick={onSubmit}>SUBMIT TRANSACTION</button>
            </div>

            <div style={{...s.txCard, marginTop: isMobile ? 0 : 16, padding: isMobile ? 16 : 20}}>
              <div style={{fontSize: isMobile ? 13 : 14, fontWeight:"bold", marginBottom:12}}>📊 CURRENT STOCK</div>
              {AMMO_TYPES.map(a => {
                const qty = stock[a.id] || 0;
                const pct = Math.round((qty / maxPerBty) * 100);
                return (
                  <div key={a.id} style={{marginBottom:12}}>
                    <div style={{display:"flex", justifyContent:"space-between", marginBottom:4, fontSize: isMobile ? 11 : 12}}>
                      <span>{a.icon} {a.label}</span>
                      <span style={{color: a.color, fontWeight:"bold"}}>{qty}</span>
                    </div>
                    <div style={s.progressBar}>
                      <div style={{...s.progressFill, width:`${pct}%`, background: a.color}} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{display:"flex", flexDirection:"column", overflow: isMobile ? "visible" : "auto", paddingRight: isMobile ? 0 : 12}}>
            <div style={{...s.sectionCard, padding: isMobile ? 16 : 24}}>
              <div style={{...s.sectionTitle, fontSize: isMobile ? 13 : 16}}>📋 BATTERY TRANSACTION LOG</div>
              <LogTable log={log} isMobile={isMobile} />
            </div>
          </div>
        </div>
      </div>

      {flash && <div style={{...s.flashBar, background: flash.kind === "success" ? "#4ade80" : "#ef4444", bottom: isMobile ? 16 : 20, right: isMobile ? 12 : 20, left: isMobile ? 12 : "auto", textAlign: isMobile ? "center" : "left", fontSize: isMobile ? 12 : 13}}>{flash.msg}</div>}
    </div>
  );
}

// ─── LOG TABLE ─────────────────────────────────────────────────────────────────
function LogTable({ log, compact, isMobile }) {
  return (
    <div>
      <div style={{...s.logRow, ...s.logHeader, fontSize: isMobile ? 10 : 11}}>
        <span>TIME</span>
        <span>AMMO</span>
        <span>TX</span>
        <span>QTY</span>
      </div>
      {(log || []).map((entry) => (
        <div key={entry._id || entry.id} style={{...s.logRow, fontSize: isMobile ? 11 : 12}}>
          <span style={{color:"#94a3b8"}}>{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-GB', {hour12: false}) : entry.time}</span>
          <span style={{color:"#cbd5e1"}}>{entry.ammoId}</span>
          <span style={{color: entry.type === "ADD" ? "#4ade80" : "#ef4444"}}>{entry.type}</span>
          <span style={{fontWeight:"bold"}}>{entry.quantity}</span>
        </div>
      ))}
    </div>
  );
}
