import { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || '/api';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
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

// ─── API ─────────────────────────────────────────────────────────────────────
const api = {
  get: (path) => fetch(`${API_URL}${path}`).then(r => r.json()).catch(() => []),

  post: async (path, body) => {
    const r = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Request failed'); }
    return r.json();
  },

  del: async (path) => {
    const r = await fetch(`${API_URL}${path}`, { method: 'DELETE' });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Delete failed'); }
    return r.json();
  },

  put: async (path, body) => {
    const r = await fetch(`${API_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Request failed'); }
    return r.json();
  },
};

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

function catColor(ammoType) { return CATEGORY_META[ammoType?.category]?.color || "#94a3b8"; }
function catIcon(ammoType)  { return CATEGORY_META[ammoType?.category]?.icon  || "🔹"; }

function groupFireMissions(logEntries) {
  const fmEntries = [...logEntries]
    .filter(e => e.note?.startsWith('FM:') && e.type === 'SUB')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const missions = [];
  fmEntries.forEach(entry => {
    const name = entry.note.slice(3);
    const t = new Date(entry.timestamp).getTime();
    const m = missions.find(x => x.name === name && Math.abs(new Date(x.time).getTime() - t) <= 30000);
    if (m) m.items.push(entry);
    else missions.push({ name, time: entry.timestamp, items: [entry] });
  });
  return missions.slice(0, 8);
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole] = useState(null);          // null | "BN" | "TEAM"
  const [batteries, setBatteries] = useState([]);
  const [teams, setTeams] = useState([]);
  const [ammoTypes, setAmmoTypes] = useState([]);
  const [stock, setStock] = useState({});           // { teamId: { ammoId: qty } }
  const [log, setLog] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [bnTab, setBnTab] = useState("dashboard");
  // Ammunition-tab form state
  const [txAmmoId, setTxAmmoId] = useState("");
  const [txQty, setTxQty]     = useState("");
  const [txNote, setTxNote]   = useState("");
  const [txType, setTxType]   = useState("ADD");
  const [flash, setFlash]     = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Load ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [bats, tms, types, ammoData, txData] = await Promise.all([
          api.get('/batteries'),
          api.get('/teams'),
          api.get('/ammo-types'),
          api.get('/ammunition'),
          api.get('/transactions?limit=200'),
        ]);
        setBatteries(bats);
        setTeams(tms);
        setAmmoTypes(types);
        if (types.length) setTxAmmoId(types[0].id);

        const stockMap = {};
        tms.forEach(t => {
          stockMap[t.id] = {};
          types.forEach(a => {
            const entry = ammoData.find(x => x.teamId === t.id && x.ammoId === a.id);
            stockMap[t.id][a.id] = entry?.quantity || 0;
          });
        });
        setStock(stockMap);
        setLog(txData);
      } catch (e) { showFlash("Failed to load data", "error"); }
      setLoading(false);
    })();
  }, []);

  // ── Battery management ──
  async function handleAddBattery(name) {
    try {
      const b = await api.post('/batteries', { name });
      setBatteries(prev => [...prev, b]);
      showFlash(`${b.name} CREATED`, "success");
      return b;
    } catch (err) { showFlash(err.message || "Failed to create battery", "error"); throw err; }
  }

  async function handleDeleteBattery(id) {
    try {
      await api.del(`/batteries/${id}`);
      setBatteries(prev => prev.filter(b => b.id !== id));
      const removedTeams = teams.filter(t => t.batteryId === id).map(t => t.id);
      setTeams(prev => prev.filter(t => t.batteryId !== id));
      setStock(prev => {
        const next = { ...prev };
        removedTeams.forEach(tid => delete next[tid]);
        return next;
      });
      showFlash("BATTERY DELETED", "success");
    } catch (err) { showFlash(err.message || "Failed to delete battery", "error"); }
  }

  // ── Team management ──
  async function handleAddTeam(name, batteryId) {
    try {
      const t = await api.post('/teams', { name, batteryId });
      setTeams(prev => [...prev, t]);
      setStock(prev => {
        const teamStock = {};
        ammoTypes.forEach(a => { teamStock[a.id] = 0; });
        return { ...prev, [t.id]: teamStock };
      });
      showFlash(`${t.name} CREATED`, "success");
      return t;
    } catch (err) { showFlash(err.message || "Failed to create team", "error"); throw err; }
  }

  async function handleDeleteTeam(id) {
    try {
      await api.del(`/teams/${id}`);
      setTeams(prev => prev.filter(t => t.id !== id));
      setStock(prev => { const n = { ...prev }; delete n[id]; return n; });
      if (selectedTeamId === id) setSelectedTeamId(null);
      showFlash("TEAM DELETED", "success");
    } catch (err) { showFlash(err.message || "Failed to delete team", "error"); }
  }

  // ── Battery red line ──
  async function handleSetRedLines(batteryId, redLines) {
    try {
      const updated = await api.put(`/batteries/${batteryId}/redline`, { redLines });
      setBatteries(prev => prev.map(b => b.id === batteryId ? { ...b, redLines: updated.redLines } : b));
      showFlash("RED LINES SAVED", "success");
    } catch (err) { showFlash(err.message || "Failed to save red lines", "error"); throw err; }
  }

  // ── Ammo type management ──
  async function handleAddAmmoType(label, category) {
    try {
      const newType = await api.post('/ammo-types', { label, category });
      setAmmoTypes(prev => [...prev, newType].sort((a, b) =>
        a.category.localeCompare(b.category) || a.label.localeCompare(b.label)));
      setStock(prev => {
        const next = { ...prev };
        teams.forEach(t => { next[t.id] = { ...(next[t.id] || {}), [newType.id]: 0 }; });
        return next;
      });
      if (!txAmmoId) setTxAmmoId(newType.id);
      showFlash(`${newType.label} ADDED`, "success");
    } catch (err) { showFlash(err.message || "Failed to add ammo type", "error"); throw err; }
  }

  async function handleDeleteAmmoType(id) {
    try {
      await api.del(`/ammo-types/${id}`);
      setAmmoTypes(prev => prev.filter(a => a.id !== id));
      setStock(prev => {
        const next = {};
        teams.forEach(t => { const s = { ...(prev[t.id] || {}) }; delete s[id]; next[t.id] = s; });
        return next;
      });
      if (txAmmoId === id) {
        const rem = ammoTypes.filter(a => a.id !== id);
        setTxAmmoId(rem.length ? rem[0].id : "");
      }
      showFlash("AMMO TYPE REMOVED", "success");
    } catch (err) { showFlash(err.message || "Failed to delete ammo type", "error"); }
  }

  // ── Transactions ──
  async function submitTx() {
    const qty = parseInt(txQty, 10);
    if (!txAmmoId) return showFlash("NO AMMO TYPE SELECTED", "error");
    if (!qty || qty <= 0) return showFlash("INVALID QTY", "error");
    const current = stock[selectedTeamId]?.[txAmmoId] || 0;
    if (txType === "SUB" && current < qty) return showFlash("INSUFFICIENT ROUNDS", "error");
    const team = teams.find(t => t.id === selectedTeamId);
    const bat  = batteries.find(b => b.id === team?.batteryId);
    const aType = ammoTypes.find(a => a.id === txAmmoId);
    try {
      const tx = await api.post('/transactions', {
        teamId: selectedTeamId, batteryId: bat?.id,
        ammoId: txAmmoId, type: txType, quantity: qty, note: txNote,
        teamName: team?.name, batteryName: bat?.name, ammoLabel: aType?.label || txAmmoId,
      });
      const newQty = txType === "ADD" ? current + qty : current - qty;
      const newStock = { ...stock, [selectedTeamId]: { ...stock[selectedTeamId], [txAmmoId]: newQty } };
      setStock(newStock);
      checkRedLineAlerts(newStock, stock);
      setLog(prev => [tx, ...prev]);
      setTxQty(""); setTxNote("");
      showFlash(`${txType === "ADD" ? "+" : "-"}${qty} ROUNDS LOGGED`, "success");
    } catch (err) { showFlash(err.message || "Failed", "error"); }
  }

  async function submitFireMission(missionName, ammoQtys) {
    const items = Object.entries(ammoQtys)
      .map(([id, v]) => ({ id, qty: parseInt(v, 10) || 0 }))
      .filter(x => x.qty > 0);
    if (!items.length) return showFlash("ENTER AT LEAST ONE QUANTITY", "error"), false;
    for (const { id, qty } of items) {
      const avail = stock[selectedTeamId]?.[id] || 0;
      if (qty > avail) {
        const a = ammoTypes.find(t => t.id === id);
        return showFlash(`INSUFFICIENT ${a?.label || id}`, "error"), false;
      }
    }
    const noteTag = `FM:${missionName.trim() || "FIRE MISSION"}`;
    const team = teams.find(t => t.id === selectedTeamId);
    const bat  = batteries.find(b => b.id === team?.batteryId);
    try {
      const newTxs = [];
      const updates = {};
      for (const { id, qty } of items) {
        const current = stock[selectedTeamId]?.[id] || 0;
        const aType = ammoTypes.find(a => a.id === id);
        const tx = await api.post('/transactions', {
          teamId: selectedTeamId, batteryId: bat?.id,
          ammoId: id, type: "SUB", quantity: qty, note: noteTag,
          teamName: team?.name, batteryName: bat?.name, ammoLabel: aType?.label || id,
        });
        newTxs.push(tx);
        updates[id] = current - qty;
      }
      const newStock = { ...stock, [selectedTeamId]: { ...stock[selectedTeamId], ...updates } };
      setStock(newStock);
      checkRedLineAlerts(newStock, stock);
      setLog(prev => [...newTxs.reverse(), ...prev]);
      showFlash(`FIRE MISSION LOGGED — ${items.length} TYPE${items.length > 1 ? "S" : ""}`, "success");
      return true;
    } catch (err) { showFlash(err.message || "Failed", "error"); return false; }
  }

  // Direct inventory adjustment — sets absolute qty, creates ADD or SUB transaction
  async function submitAdjust(ammoId, targetQty) {
    const current = stock[selectedTeamId]?.[ammoId] || 0;
    const diff = targetQty - current;
    if (diff === 0) return;
    const type = diff > 0 ? "ADD" : "SUB";
    const qty  = Math.abs(diff);
    const team  = teams.find(t => t.id === selectedTeamId);
    const bat   = batteries.find(b => b.id === team?.batteryId);
    const aType = ammoTypes.find(a => a.id === ammoId);
    try {
      const tx = await api.post('/transactions', {
        teamId: selectedTeamId, batteryId: bat?.id,
        ammoId, type, quantity: qty, note: "INVENTORY ADJUSTMENT",
        teamName: team?.name, batteryName: bat?.name, ammoLabel: aType?.label || ammoId,
      });
      const newStock = { ...stock, [selectedTeamId]: { ...stock[selectedTeamId], [ammoId]: targetQty } };
      setStock(newStock);
      checkRedLineAlerts(newStock, stock);
      setLog(prev => [tx, ...prev]);
      showFlash(`${aType?.label || ammoId} → ${targetQty} RDS`, "success");
    } catch (err) { showFlash(err.message || "Adjust failed", "error"); }
  }

  // ── WhatsApp alerts ──
  async function sendWhatsAppAlert(text) {
    const phone  = localStorage.getItem('ammo_wb_phone');
    const apikey = localStorage.getItem('ammo_wb_apikey');
    if (!phone || !apikey) return;
    try { await api.post('/notify/whatsapp', { phone, apikey, text }); } catch (_) {}
  }

  function checkRedLineAlerts(newStock, oldStock) {
    batteries.forEach(b => {
      const bTeams = teams.filter(t => t.batteryId === b.id);
      (b.redLines || []).forEach(rl => {
        if (!rl.ammoIds?.length || !rl.threshold) return;
        const calcSum = (s) => bTeams.reduce((sum, t) =>
          sum + rl.ammoIds.reduce((s2, id) => s2 + (s[t.id]?.[id] || 0), 0), 0);
        const oldSum = calcSum(oldStock);
        const newSum = calcSum(newStock);
        if (oldSum >= rl.threshold && newSum < rl.threshold) {
          const rlLabels = rl.ammoIds.map(id => ammoTypes.find(a => a.id === id)?.label || id).join(' + ');
          const now = new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12: false });
          const msg = `🔴 RED LINE BREACH\n━━━━━━━━━━━━━━━━━━━━\nBattery: ${b.name} (${b.callsign})\n${rl.label ? rl.label + ': ' : ''}${rlLabels}\nCurrent: ${newSum} / ${rl.threshold} RDS\nTime: ${now}`;
          sendWhatsAppAlert(msg);
        }
      });
    });
  }

  function showFlash(msg, kind) {
    setFlash({ msg, kind });
    setTimeout(() => setFlash(null), 2500);
  }

  // ── Aggregations ──
  const bnTotals = useMemo(() => {
    const t = {};
    ammoTypes.forEach(a => {
      t[a.id] = teams.reduce((sum, tm) => sum + (stock[tm.id]?.[a.id] || 0), 0);
    });
    return t;
  }, [stock, ammoTypes, teams]);

  const batteryTotals = useMemo(() => {
    const bt = {};
    batteries.forEach(b => {
      bt[b.id] = {};
      const bTeams = teams.filter(t => t.batteryId === b.id);
      ammoTypes.forEach(a => {
        bt[b.id][a.id] = bTeams.reduce((sum, t) => sum + (stock[t.id]?.[a.id] || 0), 0);
      });
    });
    return bt;
  }, [stock, ammoTypes, batteries, teams]);

  const MAX_PER_TEAM = 400;

  if (loading) {
    return <div style={{ ...s.screen, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 24, color: '#6b7280' }}>📡 Loading...</div>
    </div>;
  }

  if (!role) return (
    <RoleSelect
      batteries={batteries}
      teams={teams}
      onSelectBN={() => setRole("BN")}
      onSelectTeam={(teamId) => { setSelectedTeamId(teamId); setRole("TEAM"); }}
    />
  );

  if (role === "BN") return (
    <BNDashboard
      batteries={batteries} teams={teams} ammoTypes={ammoTypes}
      stock={stock} log={log} bnTotals={bnTotals} batteryTotals={batteryTotals}
      maxPerTeam={MAX_PER_TEAM} activeTab={bnTab} setActiveTab={setBnTab}
      onLogout={() => setRole(null)}
      onAddBattery={handleAddBattery} onDeleteBattery={handleDeleteBattery}
      onAddTeam={handleAddTeam}       onDeleteTeam={handleDeleteTeam}
      onAddAmmoType={handleAddAmmoType} onDeleteAmmoType={handleDeleteAmmoType}
      onSetRedLines={handleSetRedLines}
    />
  );

  const selectedTeam    = teams.find(t => t.id === selectedTeamId);
  const selectedBattery = batteries.find(b => b.id === selectedTeam?.batteryId);

  return (
    <TeamCommander
      team={selectedTeam}
      battery={selectedBattery}
      teams={teams}
      batteries={batteries}
      selectedTeamId={selectedTeamId}
      setSelectedTeamId={setSelectedTeamId}
      ammoTypes={ammoTypes}
      stock={stock[selectedTeamId] || {}}
      log={log.filter(e => e.teamId === selectedTeamId)}
      txAmmoId={txAmmoId} setTxAmmoId={setTxAmmoId}
      txQty={txQty} setTxQty={setTxQty}
      txNote={txNote} setTxNote={setTxNote}
      txType={txType} setTxType={setTxType}
      onSubmit={submitTx} onFireMission={submitFireMission} onAdjust={submitAdjust}
      flash={flash} maxPerTeam={MAX_PER_TEAM}
      onLogout={() => { setRole(null); setSelectedTeamId(null); }}
    />
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const s = {
  screen:   { minHeight: "100vh", background: "#0f172a", color: "#fff", overflow: "hidden" },
  liveTag:  { padding: "4px 12px", background: "#ef4444", borderRadius: 4, fontSize: 11, fontWeight: "bold" },
  logoutBtn:{ padding: "8px 16px", background: "#334155", color: "#fff", border: "1px solid #475569", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: "bold" },
  tabs:     { flexShrink: 0, display: "flex", borderBottom: "1px solid #1e293b", background: "#0f172a", overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" },
  tab:      { flexShrink: 0, padding: "12px 24px", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontWeight: "bold", borderBottom: "3px solid transparent", transition: "all 0.2s", whiteSpace: "nowrap" },
  tabActive:{ color: "#fff", borderBottomColor: "#38bdf8" },
  sectionCard:{ padding: 24, border: "1px solid #334155", background: "#1e293b", borderRadius: 6 },
  progressBar:{ height: 6, background: "#0f172a", borderRadius: 2, overflow: "hidden", marginBottom: 4 },
  progressFill:{ height: "100%", transition: "width 0.3s" },
  statusBadge:{ padding: "4px 8px", fontSize: 11, fontWeight: "bold", borderRadius: 3 },
  txCard:   { padding: 20, border: "1px solid #334155", background: "#1e293b", borderRadius: 6 },
  txField:  { marginBottom: 16 },
  txLabel:  { fontSize: 12, color: "#94a3b8", marginBottom: 6, display: "block", fontWeight: "bold" },
  txSelect: { width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #334155", color: "#fff", borderRadius: 4, fontSize: 13, cursor: "pointer" },
  txInput:  { width: "100%", padding: "8px 12px", background: "#0f172a", border: "1px solid #334155", color: "#fff", borderRadius: 4, fontSize: 13 },
  txButton: { width: "100%", padding: 12, background: "#38bdf8", color: "#000", border: "none", borderRadius: 4, fontWeight: "bold", cursor: "pointer", fontSize: 13 },
  logRow:   { display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr 0.6fr", gap: 8, padding: "8px 0", borderBottom: "1px solid #334155", alignItems: "center" },
  logHeader:{ fontWeight: "bold", color: "#94a3b8", fontSize: 11 },
  flashBar: { position: "fixed", bottom: 20, right: 20, padding: "12px 20px", borderRadius: 4, fontWeight: "bold", fontSize: 13, animation: "slideIn 0.3s", zIndex: 9999 },
};

// ─── ROLE SELECT ──────────────────────────────────────────────────────────────
function RoleSelect({ batteries, teams, onSelectBN, onSelectTeam }) {
  const isMobile = useIsMobile();
  const [pickingTeam, setPickingTeam] = useState(false);
  const [chosenTeamId, setChosenTeamId] = useState("");

  const hasTeams = teams.length > 0;

  if (pickingTeam) {
    return (
      <div style={s.screen}>
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          <div style={{ padding: isMobile ? "24px 20px" : "40px 60px 32px", borderBottom: "2px solid #1e293b", textAlign: "center" }}>
            <div style={{ fontSize: isMobile ? 36 : 48, marginBottom: 12 }}>⚡</div>
            <div style={{ fontSize: isMobile ? 22 : 32, fontWeight: "bold", letterSpacing: 2, marginBottom: 6 }}>SELECT YOUR TEAM</div>
            <div style={{ fontSize: 12, color: "#94a3b8", letterSpacing: 1 }}>TEAM COMMANDER ACCESS</div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "20px 16px" : "32px 60px" }}>
            {batteries.length === 0 ? (
              <div style={{ textAlign: "center", color: "#64748b", padding: 40, fontSize: 14 }}>
                No units have been configured yet.<br />Contact your Battalion Commander.
              </div>
            ) : (
              batteries.map(b => {
                const bTeams = teams.filter(t => t.batteryId === b.id);
                if (!bTeams.length) return null;
                return (
                  <div key={b.id} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, color: b.color, fontWeight: "bold", letterSpacing: 2, marginBottom: 10 }}>
                      ▸ {b.name.toUpperCase()} — {b.callsign}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                      {bTeams.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setChosenTeamId(t.id)}
                          style={{
                            padding: "14px 16px",
                            background: chosenTeamId === t.id ? b.color + "22" : "#1e293b",
                            border: `2px solid ${chosenTeamId === t.id ? b.color : "#334155"}`,
                            color: "#fff",
                            borderRadius: 6,
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "all 0.2s",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: "bold", color: chosenTeamId === t.id ? b.color : "#e2e8f0", marginBottom: 3 }}>{t.name}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{t.callsign}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ padding: isMobile ? "16px" : "24px 60px", borderTop: "1px solid #1e293b", display: "flex", gap: 12 }}>
            <button
              onClick={() => setPickingTeam(false)}
              style={{ padding: "12px 24px", background: "#334155", color: "#fff", border: "1px solid #475569", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: "bold" }}
            >← BACK</button>
            <button
              onClick={() => chosenTeamId && onSelectTeam(chosenTeamId)}
              disabled={!chosenTeamId}
              style={{ flex: 1, padding: "12px 24px", background: chosenTeamId ? "#38bdf8" : "#334155", color: chosenTeamId ? "#000" : "#64748b", border: "none", borderRadius: 4, cursor: chosenTeamId ? "pointer" : "default", fontSize: 13, fontWeight: "bold", letterSpacing: 1, transition: "all 0.2s" }}
            >ENTER COMMAND →</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.screen}>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ flex: 0, padding: isMobile ? "32px 20px 24px" : "60px 40px 40px", borderBottom: "2px solid #1e293b", textAlign: "center" }}>
          <div style={{ fontSize: isMobile ? 44 : 64, marginBottom: isMobile ? 16 : 24 }}>🎯</div>
          <div style={{ fontSize: isMobile ? 26 : 48, fontWeight: "bold", letterSpacing: isMobile ? 2 : 3, marginBottom: 8 }}>ARTY AMMO TRACKER</div>
          <div style={{ fontSize: isMobile ? 11 : 14, color: "#94a3b8", letterSpacing: 2, marginBottom: 24 }}>BATTALION AMMUNITION MANAGEMENT SYSTEM</div>
          <div style={{ height: 1, background: "#334155", margin: "0 auto", maxWidth: 400 }} />
          <div style={{ fontSize: 11, color: "#64748b", letterSpacing: 3, fontWeight: "600", marginTop: 16 }}>SELECT AUTHENTICATION LEVEL</div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 24, padding: isMobile ? "20px 16px" : "40px", maxWidth: 900, margin: "0 auto", width: "100%" }}>
          <button
            style={{ padding: isMobile ? 20 : 32, border: "3px solid #e85d04", background: "#1e293b", cursor: "pointer", borderRadius: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 0 }}
            onClick={onSelectBN}
          >
            <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: "bold", borderRadius: 4, marginBottom: 16, color: "#fff", background: "#e85d04" }}>BN CDR</div>
            <div style={{ fontSize: isMobile ? 40 : 56, marginBottom: 16 }}>🏛️</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: "bold", marginBottom: 12, color: "#fff" }}>BATTALION COMMANDER</div>
            <div style={{ fontSize: isMobile ? 12 : 13, color: "#cbd5e1", lineHeight: 1.6, marginBottom: 20 }}>Full situational awareness — manage units, ammunition types, and monitor all team stocks.</div>
            <div style={{ fontSize: 12, fontWeight: "bold", letterSpacing: 1, color: "#e85d04" }}>ENTER COMMAND →</div>
          </button>

          <button
            style={{ padding: isMobile ? 20 : 32, border: "3px solid #38bdf8", background: "#1e293b", cursor: "pointer", borderRadius: 0, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 0, opacity: hasTeams ? 1 : 0.6 }}
            onClick={() => hasTeams && setPickingTeam(true)}
          >
            <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: "bold", borderRadius: 4, marginBottom: 16, color: "#0f172a", background: "#38bdf8" }}>TEAM CDR</div>
            <div style={{ fontSize: isMobile ? 40 : 56, marginBottom: 16 }}>⚡</div>
            <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: "bold", marginBottom: 12, color: "#fff" }}>TEAM COMMANDER</div>
            <div style={{ fontSize: isMobile ? 12 : 13, color: "#cbd5e1", lineHeight: 1.6, marginBottom: 20 }}>
              {hasTeams
                ? "Log fire missions and manage ammunition for your team with real-time updates to HQ."
                : "No teams configured yet. Battalion Commander must create units first."}
            </div>
            <div style={{ fontSize: 12, fontWeight: "bold", letterSpacing: 1, color: "#38bdf8" }}>
              {hasTeams ? "SELECT TEAM →" : "UNAVAILABLE"}
            </div>
          </button>
        </div>

        <div style={{ flex: 0, padding: isMobile ? "16px 20px" : "20px 40px", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "center", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#4ade80" }}>● SYSTEM ONLINE</span>
          <span style={{ color: "#6b7280" }}>v3.0 // SECURE CHANNEL</span>
        </div>
      </div>
    </div>
  );
}

// ─── BN DASHBOARD ─────────────────────────────────────────────────────────────
function BNDashboard({ batteries, teams, ammoTypes, stock, log, bnTotals, batteryTotals, maxPerTeam, activeTab, setActiveTab, onLogout, onAddBattery, onDeleteBattery, onAddTeam, onDeleteTeam, onAddAmmoType, onDeleteAmmoType, onSetRedLines }) {
  const isMobile = useIsMobile();
  const TABS = ["UNITS", "AMMO TYPES", "DASHBOARD", "BATTERIES", "SUMMARY", "TRANSACTIONS", "ANALYTICS"];

  const barData = ammoTypes.map(a => {
    const row = { name: a.id };
    batteries.forEach(b => { row[b.name] = batteryTotals[b.id]?.[a.id] || 0; });
    return row;
  });

  const hasUnits = batteries.length > 0 && teams.length > 0;
  const hasAmmo  = ammoTypes.length > 0;

  return (
    <div style={{ ...s.screen, display: "flex", flexDirection: "column", height: "100vh" }}>
        {/* Header */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "12px 16px" : "16px 32px", borderBottom: "2px solid #1e293b", background: "#0f172a" }}>
          <div style={{ display: "flex", gap: isMobile ? 10 : 16, alignItems: "center" }}>
            <div style={{ fontSize: isMobile ? 24 : 32 }}>🏛️</div>
            <div>
              <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: "bold" }}>BATTALION COMMAND</div>
              {!isMobile && <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1 }}>AMMUNITION STATUS BOARD // {ts()}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 8 : 16, alignItems: "center" }}>
            <div style={{ ...s.liveTag, padding: isMobile ? "3px 8px" : "4px 12px", fontSize: 10 }}>● LIVE</div>
            <button style={{ ...s.logoutBtn, padding: isMobile ? "6px 10px" : "8px 16px", fontSize: isMobile ? 10 : 12 }} onClick={onLogout}>LOGOUT</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ ...s.tabs, paddingLeft: isMobile ? 4 : 24 }}>
          {TABS.map(t => {
            const key = t.toLowerCase().replace(/\s+/g, '_');
            const isActive = activeTab === key;
            return (
              <button key={t} style={{
                ...s.tab,
                ...(isActive ? s.tabActive : {}),
                ...(t === "UNITS" && isActive ? { borderBottomColor: "#a3e635", color: "#a3e635" } : {}),
                ...(t === "AMMO TYPES" && isActive ? { borderBottomColor: "#facc15", color: "#facc15" } : {}),
                padding: isMobile ? "10px 12px" : "12px 20px",
                fontSize: isMobile ? 10 : 12,
              }} onClick={() => setActiveTab(key)}>{t}</button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", minHeight: 0, padding: isMobile ? 12 : 28 }}>

          {activeTab === "dashboard" && (
            (!hasUnits || !hasAmmo) ? (
              <EmptySetupPrompt isMobile={isMobile} hasUnits={hasUnits} hasAmmo={hasAmmo}
                onUnits={() => setActiveTab("units")} onAmmo={() => setActiveTab("ammo_types")} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: isMobile ? 12 : 20 }}>
                {/* Red line alerts banner */}
                {(() => {
                  const alerts = [];
                  batteries.forEach(b => {
                    const bTeams = teams.filter(t => t.batteryId === b.id);
                    (b.redLines || []).forEach(rl => {
                      if (!rl.ammoIds?.length || !rl.threshold) return;
                      const sum = bTeams.reduce((s, t) => s + rl.ammoIds.reduce((s2, id) => s2 + (stock[t.id]?.[id] || 0), 0), 0);
                      if (sum < rl.threshold) alerts.push({ b, rl, sum });
                    });
                  });
                  if (!alerts.length) return null;
                  return (
                    <div style={{ gridColumn: "1 / -1", padding: isMobile ? 12 : 16, background: "#ef444415", border: "2px solid #ef4444", borderRadius: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: "bold", color: "#ef4444", marginBottom: 10 }}>🔴 RED LINE ALERTS</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {alerts.map(({ b, rl, sum }, i) => (
                          <div key={i} style={{ padding: "6px 12px", background: "#0f172a", border: `1px solid ${b.color}`, borderRadius: 4 }}>
                            <span style={{ color: b.color, fontWeight: "bold", fontSize: 12 }}>{b.callsign}</span>
                            {rl.label && <span style={{ color: "#64748b", fontSize: 11, marginLeft: 6 }}>{rl.label}</span>}
                            <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: 6 }}>{rl.ammoIds.map(id => ammoTypes.find(a => a.id === id)?.label || id).join(' + ')}</span>
                            <span style={{ color: "#ef4444", fontWeight: "bold", fontSize: 12, marginLeft: 6 }}>{sum.toLocaleString()} / {rl.threshold.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {ammoTypes.map(a => {
                  const total = bnTotals[a.id] || 0;
                  const maxTotal = maxPerTeam * teams.length;
                  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                  const color = catColor(a);
                  return (
                    <div key={a.id} style={{ padding: isMobile ? 14 : 20, border: `2px solid ${color}`, background: "#1e293b", borderRadius: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: isMobile ? 16 : 20 }}>{catIcon(a)}</span>
                        <span style={{ fontSize: 10, color: "#64748b", fontWeight: "bold" }}>{CATEGORY_META[a.category]?.label}</span>
                        <span style={{ ...s.statusBadge, background: statusColor(pct) + "22", color: statusColor(pct), border: `1px solid ${statusColor(pct)}`, fontSize: isMobile ? 9 : 11 }}>{statusLabel(pct)}</span>
                      </div>
                      <div style={{ fontSize: isMobile ? 11 : 13, color: "#94a3b8", marginBottom: 4 }}>{a.label}</div>
                      <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: "bold", color, marginBottom: 2 }}>{total.toLocaleString()}</div>
                      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 10, letterSpacing: 1 }}>ROUNDS TOTAL</div>
                      <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${pct}%`, background: color }} /></div>
                      <div style={{ fontSize: 10, color: "#64748b", textAlign: "right", marginBottom: 12 }}>{pct}%</div>
                      {/* Per-battery breakdown */}
                      {batteries.length > 0 && (
                        <div style={{ borderTop: "1px solid #334155", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                          {batteries.map(b => {
                            const bQty = batteryTotals[b.id]?.[a.id] || 0;
                            const bPct = total > 0 ? Math.round((bQty / total) * 100) : 0;
                            return (
                              <div key={b.id}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                  <span style={{ fontSize: 10, color: b.color, fontWeight: "bold" }}>{b.callsign}</span>
                                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{bQty.toLocaleString()} <span style={{ color: "#475569" }}>({bPct}%)</span></span>
                                </div>
                                <div style={{ height: 3, background: "#0f172a", borderRadius: 2 }}>
                                  <div style={{ height: "100%", width: `${bPct}%`, background: b.color, borderRadius: 2, transition: "width 0.3s" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Battery status cards */}
                <div style={{ gridColumn: "1 / -1", ...s.sectionCard, padding: isMobile ? 14 : 20 }}>
                  <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: "bold", marginBottom: 16, letterSpacing: 1 }}>⚡ BATTERY STATUS</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: isMobile ? 10 : 14 }}>
                    {batteries.map(b => {
                      const bTeams = teams.filter(t => t.batteryId === b.id);
                      const totalRounds = bTeams.reduce((sum, t) =>
                        sum + ammoTypes.reduce((s2, a) => s2 + (stock[t.id]?.[a.id] || 0), 0), 0);
                      const maxRounds = bTeams.length * ammoTypes.length * maxPerTeam;
                      const pct = maxRounds > 0 ? Math.round((totalRounds / maxRounds) * 100) : 0;
                      return (
                        <div key={b.id} style={{ padding: isMobile ? 12 : 14, border: `2px solid ${b.color}`, background: "#0f172a", borderRadius: 6 }}>
                          <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: "bold", color: b.color }}>{b.callsign}</div>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6 }}>{bTeams.length} team{bTeams.length !== 1 ? "s" : ""}</div>
                          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: "bold", marginBottom: 6 }}>{totalRounds.toLocaleString()} RDS</div>
                          <div style={s.progressBar}><div style={{ ...s.progressFill, width: `${pct}%`, background: b.color }} /></div>
                          <div style={{ ...s.statusBadge, marginTop: 6, background: statusColor(pct) + "22", color: statusColor(pct), border: `1px solid ${statusColor(pct)}`, fontSize: 10 }}>{statusLabel(pct)} {pct}%</div>
                          {(b.redLines || []).filter(rl => rl.ammoIds?.length && rl.threshold).map((rl, i) => {
                            const rlSum = bTeams.reduce((sum, t) => sum + rl.ammoIds.reduce((s, id) => s + (stock[t.id]?.[id] || 0), 0), 0);
                            const below = rlSum < rl.threshold;
                            const rlLabels = rl.ammoIds.map(id => ammoTypes.find(a => a.id === id)?.label || id).join(' + ');
                            return (
                              <div key={i} style={{ marginTop: 6, padding: "5px 7px", background: below ? "#ef444420" : "#22c55e15", border: `1px solid ${below ? "#ef4444" : "#22c55e"}`, borderRadius: 4, fontSize: 10 }}>
                                <div style={{ color: below ? "#ef4444" : "#22c55e", fontWeight: "bold", marginBottom: 1 }}>{below ? "🔴" : "🟢"} {rl.label || rlLabels}</div>
                                {rl.label && <div style={{ color: "#64748b" }}>{rlLabels}</div>}
                                <div style={{ color: below ? "#ef4444" : "#22c55e", fontWeight: "bold" }}>{rlSum.toLocaleString()} / {rl.threshold.toLocaleString()} RDS</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1", ...s.sectionCard, padding: isMobile ? 14 : 20 }}>
                  <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: "bold", marginBottom: 14 }}>📋 RECENT TRANSACTIONS</div>
                  <LogTable log={log.slice(0, 8)} isMobile={isMobile} showTeam />
                </div>
              </div>
            )
          )}

          {activeTab === "batteries" && (
            (!hasUnits || !hasAmmo) ? (
              <EmptySetupPrompt isMobile={isMobile} hasUnits={hasUnits} hasAmmo={hasAmmo}
                onUnits={() => setActiveTab("units")} onAmmo={() => setActiveTab("ammo_types")} />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))", gap: isMobile ? 14 : 20 }}>
                {batteries.map(b => {
                  const bTeams = teams.filter(t => t.batteryId === b.id);
                  return (
                    <div key={b.id} style={{ padding: isMobile ? 14 : 20, border: `2px solid ${b.color}`, background: "#1e293b", borderRadius: 6 }}>
                      <div style={{ borderBottom: `2px solid ${b.color}`, paddingBottom: 12, marginBottom: 14 }}>
                        <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: "bold", color: b.color }}>{b.callsign}</div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>{b.name} — {bTeams.length} team{bTeams.length !== 1 ? "s" : ""}</div>
                      </div>
                      {bTeams.length === 0 && <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>No teams in this battery</div>}
                      {bTeams.map(t => (
                        <div key={t.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #334155" }}>
                          <div style={{ fontSize: 12, fontWeight: "bold", color: "#e2e8f0", marginBottom: 8 }}>
                            ⚡ {t.name} <span style={{ color: "#64748b", fontSize: 11 }}>({t.callsign})</span>
                          </div>
                          {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                            const catTypes = ammoTypes.filter(a => a.category === cat);
                            if (!catTypes.length) return null;
                            return (
                              <div key={cat} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 10, color: meta.color, fontWeight: "bold", marginBottom: 4 }}>{meta.icon} {meta.label}</div>
                                {catTypes.map(a => {
                                  const qty = stock[t.id]?.[a.id] || 0;
                                  const pct = Math.round((qty / maxPerTeam) * 100);
                                  return (
                                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                      <span style={{ flex: 1, fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                                      <div style={{ width: 60, height: 4, background: "#334155", borderRadius: 2, flexShrink: 0 }}>
                                        <div style={{ height: "100%", width: `${pct}%`, background: meta.color, borderRadius: 2, transition: "width 0.3s" }} />
                                      </div>
                                      <span style={{ fontSize: 11, color: meta.color, fontWeight: "bold", minWidth: 28, textAlign: "right" }}>{qty}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === "transactions" && (
            <div style={{ ...s.sectionCard, padding: isMobile ? 14 : 20 }}>
              <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: "bold", marginBottom: 14 }}>📋 ALL TRANSACTIONS</div>
              <LogTable log={log} isMobile={isMobile} showTeam />
            </div>
          )}

          {activeTab === "summary" && (
            <SummaryTab batteries={batteries} teams={teams} ammoTypes={ammoTypes} log={log} isMobile={isMobile} />
          )}

          {activeTab === "analytics" && (
            ammoTypes.length === 0 || batteries.length === 0 ? (
              <EmptySetupPrompt isMobile={isMobile} hasUnits={hasUnits} hasAmmo={hasAmmo}
                onUnits={() => setActiveTab("units")} onAmmo={() => setActiveTab("ammo_types")} />
            ) : (
              <div style={{ ...s.sectionCard, padding: isMobile ? 14 : 20 }}>
                <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: "bold", marginBottom: 14 }}>📊 DISTRIBUTION BY BATTERY</div>
                <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: isMobile ? 10 : 12 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 30 : 40} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", fontSize: 12 }} />
                    {!isMobile && <Legend />}
                    {batteries.map(b => <Bar key={b.id} dataKey={b.name} fill={b.color} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          )}

          {activeTab === "ammo_types" && (
            <AmmoTypeManager ammoTypes={ammoTypes} onAdd={onAddAmmoType} onDelete={onDeleteAmmoType} isMobile={isMobile} />
          )}

          {activeTab === "units" && (
            <UnitsManager
              batteries={batteries} teams={teams} ammoTypes={ammoTypes}
              onAddBattery={onAddBattery} onDeleteBattery={onDeleteBattery}
              onAddTeam={onAddTeam} onDeleteTeam={onDeleteTeam}
              onSetRedLines={onSetRedLines}
              isMobile={isMobile}
            />
          )}
        </div>
    </div>
  );
}

// ─── UNITS MANAGER ────────────────────────────────────────────────────────────
function UnitsManager({ batteries, teams, ammoTypes, onAddBattery, onDeleteBattery, onAddTeam, onDeleteTeam, onSetRedLines, isMobile }) {
  const [newBatName, setNewBatName] = useState("");
  const [newTeamNames, setNewTeamNames] = useState({});
  const [busy, setBusy] = useState(false);
  // newRl: { [batteryId]: { label, ammoIds, threshold } }
  const [newRl, setNewRl] = useState({});
  const [rlBusy, setRlBusy] = useState({});

  function getNewRl(batteryId) {
    return newRl[batteryId] || { label: "", ammoIds: [], threshold: "" };
  }
  function setNewRlField(batteryId, field, val) {
    setNewRl(p => ({ ...p, [batteryId]: { ...getNewRl(batteryId), [field]: val } }));
  }
  function toggleNewRlAmmo(batteryId, ammoId) {
    const cur = getNewRl(batteryId);
    const ammoIds = cur.ammoIds.includes(ammoId)
      ? cur.ammoIds.filter(x => x !== ammoId)
      : [...cur.ammoIds, ammoId];
    setNewRl(p => ({ ...p, [batteryId]: { ...cur, ammoIds } }));
  }

  async function addRedLine(batteryId) {
    const rl = getNewRl(batteryId);
    const threshold = parseInt(rl.threshold, 10);
    if (!rl.ammoIds.length || isNaN(threshold) || threshold <= 0) return;
    const b = batteries.find(x => x.id === batteryId);
    const existing = b?.redLines || [];
    const updated = [...existing, { id: `rl_${Date.now()}`, label: rl.label.trim(), ammoIds: rl.ammoIds, threshold }];
    setRlBusy(p => ({ ...p, [batteryId]: true }));
    try {
      await onSetRedLines(batteryId, updated);
      setNewRl(p => ({ ...p, [batteryId]: { label: "", ammoIds: [], threshold: "" } }));
    } catch (_) {}
    setRlBusy(p => ({ ...p, [batteryId]: false }));
  }

  async function deleteRedLine(batteryId, rlId) {
    const b = batteries.find(x => x.id === batteryId);
    const updated = (b?.redLines || []).filter(r => r.id !== rlId);
    setRlBusy(p => ({ ...p, [batteryId]: true }));
    try { await onSetRedLines(batteryId, updated); } catch (_) {}
    setRlBusy(p => ({ ...p, [batteryId]: false }));
  }

  async function handleAddBattery() {
    if (!newBatName.trim()) return;
    setBusy(true);
    try { await onAddBattery(newBatName.trim()); setNewBatName(""); }
    catch (e) { /* flash shown by parent */ }
    setBusy(false);
  }

  async function handleAddTeam(batteryId) {
    const name = (newTeamNames[batteryId] || "").trim();
    if (!name) return;
    setBusy(true);
    try { await onAddTeam(name, batteryId); setNewTeamNames(p => ({ ...p, [batteryId]: "" })); }
    catch (e) {}
    setBusy(false);
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>🏗️ MANAGE UNITS</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>Create batteries and assign teams. Each team can sign in as a Team Commander.</div>
      </div>

      {/* Add Battery */}
      <div style={{ ...s.txCard, marginBottom: 24, border: "2px solid #a3e635" }}>
        <div style={{ fontSize: 13, fontWeight: "bold", color: "#a3e635", marginBottom: 14 }}>+ CREATE NEW BATTERY</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            style={{ ...s.txInput, flex: 1 }}
            placeholder='Battery name, e.g. "Battery Alpha"'
            value={newBatName}
            onChange={e => setNewBatName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddBattery()}
          />
          <button
            onClick={handleAddBattery}
            disabled={busy || !newBatName.trim()}
            style={{ padding: "8px 20px", background: newBatName.trim() ? "#a3e635" : "#334155", color: newBatName.trim() ? "#000" : "#64748b", border: "none", borderRadius: 4, cursor: newBatName.trim() ? "pointer" : "default", fontWeight: "bold", fontSize: 13, whiteSpace: "nowrap", transition: "all 0.2s" }}
          >{busy ? "..." : "+ ADD"}</button>
        </div>
      </div>

      {/* Battery list */}
      {batteries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569", fontSize: 14 }}>
          No batteries created yet. Create the first one above.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(320px, 1fr))", gap: isMobile ? 14 : 20 }}>
          {batteries.map(b => {
            const bTeams = teams.filter(t => t.batteryId === b.id);
            return (
              <div key={b.id} style={{ padding: isMobile ? 16 : 20, border: `2px solid ${b.color}`, background: "#1e293b", borderRadius: 6 }}>
                {/* Battery header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: `2px solid ${b.color}` }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: "bold", color: b.color }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>ID: {b.id} · {b.callsign} · {bTeams.length} team{bTeams.length !== 1 ? "s" : ""}</div>
                  </div>
                  <button
                    onClick={async () => { try { await onDeleteBattery(b.id); } catch (_) {} }}
                    title="Delete battery and all its teams"
                    style={{ padding: "4px 10px", background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: "bold", flexShrink: 0 }}
                  >✕ DEL</button>
                </div>

                {/* Teams list */}
                <div style={{ marginBottom: 14 }}>
                  {bTeams.length === 0
                    ? <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", padding: "6px 0" }}>No teams yet</div>
                    : bTeams.map(t => (
                      <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #334155" }}>
                        <div>
                          <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: "bold" }}>{t.name}</div>
                          <div style={{ fontSize: 10, color: "#64748b" }}>{t.callsign}</div>
                        </div>
                        <button
                          onClick={async () => { try { await onDeleteTeam(t.id); } catch (_) {} }}
                          style={{ padding: "3px 10px", background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: "bold" }}
                        >✕</button>
                      </div>
                    ))
                  }
                </div>

                {/* Add team form */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ flex: 1, padding: "7px 10px", background: "#0f172a", border: `1px solid ${b.color}55`, color: "#fff", borderRadius: 4, fontSize: 12 }}
                    placeholder="New team name..."
                    value={newTeamNames[b.id] || ""}
                    onChange={e => setNewTeamNames(p => ({ ...p, [b.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleAddTeam(b.id)}
                  />
                  <button
                    onClick={() => handleAddTeam(b.id)}
                    disabled={!(newTeamNames[b.id] || "").trim()}
                    style={{ padding: "7px 12px", background: (newTeamNames[b.id] || "").trim() ? b.color : "#334155", color: (newTeamNames[b.id] || "").trim() ? "#000" : "#64748b", border: "none", borderRadius: 4, cursor: (newTeamNames[b.id] || "").trim() ? "pointer" : "default", fontSize: 12, fontWeight: "bold", whiteSpace: "nowrap", transition: "all 0.2s" }}
                  >+ TEAM</button>
                </div>

                {/* Red Line Thresholds */}
                {ammoTypes.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #334155" }}>
                    <div style={{ fontSize: 11, color: "#ef4444", fontWeight: "bold", letterSpacing: 1, marginBottom: 10 }}>🔴 RED LINE THRESHOLDS</div>

                    {/* Existing red lines */}
                    {(b.redLines || []).length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                        {(b.redLines || []).map(rl => {
                          const rlLabels = rl.ammoIds.map(id => ammoTypes.find(a => a.id === id)?.label || id).join(' + ');
                          return (
                            <div key={rl.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", background: "#0f172a", border: "1px solid #ef444440", borderRadius: 4 }}>
                              <div>
                                {rl.label && <div style={{ fontSize: 11, fontWeight: "bold", color: "#ef4444", marginBottom: 2 }}>{rl.label}</div>}
                                <div style={{ fontSize: 10, color: "#94a3b8" }}>{rlLabels}</div>
                                <div style={{ fontSize: 10, color: "#ef4444", fontWeight: "bold" }}>≥ {rl.threshold.toLocaleString()} RDS</div>
                              </div>
                              <button
                                onClick={() => deleteRedLine(b.id, rl.id)}
                                style={{ padding: "3px 8px", background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: "bold", flexShrink: 0 }}
                              >✕</button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add new red line form */}
                    <div style={{ background: "#0f172a", border: "1px dashed #ef444440", borderRadius: 4, padding: "10px" }}>
                      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>+ ADD RED LINE</div>
                      {/* Label */}
                      <input
                        placeholder="Label (optional)..."
                        value={getNewRl(b.id).label}
                        onChange={e => setNewRlField(b.id, "label", e.target.value)}
                        style={{ width: "100%", padding: "5px 8px", background: "#1e293b", border: "1px solid #334155", color: "#fff", borderRadius: 4, fontSize: 11, marginBottom: 8, boxSizing: "border-box" }}
                      />
                      {/* Ammo toggles */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                        {ammoTypes.map(a => {
                          const checked = getNewRl(b.id).ammoIds.includes(a.id);
                          const col = catColor(a);
                          return (
                            <div key={a.id} onClick={() => toggleNewRlAmmo(b.id, a.id)}
                              style={{ fontSize: 10, cursor: "pointer", padding: "3px 7px", border: `1px solid ${checked ? col : "#334155"}`, borderRadius: 3, background: checked ? col + "22" : "transparent", color: checked ? col : "#64748b", userSelect: "none", transition: "all 0.15s" }}>
                              {catIcon(a)} {a.label}
                            </div>
                          );
                        })}
                      </div>
                      {/* Threshold + add button */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="number" min="1" placeholder="Min rounds..."
                          value={getNewRl(b.id).threshold}
                          onChange={e => setNewRlField(b.id, "threshold", e.target.value)}
                          style={{ flex: 1, padding: "5px 8px", background: "#1e293b", border: "1px solid #ef444455", color: "#fff", borderRadius: 4, fontSize: 11 }}
                        />
                        <button
                          onClick={() => addRedLine(b.id)}
                          disabled={rlBusy[b.id] || !getNewRl(b.id).ammoIds.length || !getNewRl(b.id).threshold}
                          style={{ padding: "5px 12px", background: (getNewRl(b.id).ammoIds.length && getNewRl(b.id).threshold) ? "#ef4444" : "#334155", color: (getNewRl(b.id).ammoIds.length && getNewRl(b.id).threshold) ? "#fff" : "#64748b", border: "none", borderRadius: 4, fontSize: 11, fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s" }}
                        >{rlBusy[b.id] ? "..." : "+ ADD"}</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AMMO TYPE MANAGER ────────────────────────────────────────────────────────
function AmmoTypeManager({ ammoTypes, onAdd, onDelete, isMobile }) {
  const [inputs, setInputs] = useState({ shell: "", propellant: "", fuze: "" });
  const [busy, setBusy] = useState({ shell: false, propellant: false, fuze: false });
  const grouped = {
    shell:      ammoTypes.filter(a => a.category === "shell"),
    propellant: ammoTypes.filter(a => a.category === "propellant"),
    fuze:       ammoTypes.filter(a => a.category === "fuze"),
  };

  async function handleAdd(cat) {
    const label = inputs[cat].trim();
    if (!label) return;
    setBusy(p => ({ ...p, [cat]: true }));
    try { await onAdd(label, cat); setInputs(p => ({ ...p, [cat]: "" })); }
    catch (e) {}
    setBusy(p => ({ ...p, [cat]: false }));
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>⚙️ CONFIGURE AMMUNITION TYPES</div>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>Define available ammunition types for all team commanders, organised by category.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: isMobile ? 14 : 20 }}>
        {Object.entries(CATEGORY_META).map(([cat, meta]) => (
          <div key={cat} style={{ padding: isMobile ? 16 : 20, border: `2px solid ${meta.color}`, background: "#1e293b", borderRadius: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 22 }}>{meta.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: "bold", color: meta.color }}>{meta.label}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{grouped[cat].length} defined</div>
              </div>
            </div>
            <div style={{ minHeight: 40, marginBottom: 14 }}>
              {grouped[cat].length === 0
                ? <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>No types yet</div>
                : grouped[cat].map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #334155" }}>
                    <span style={{ fontSize: 13, color: "#e2e8f0" }}>{a.label}</span>
                    <button onClick={async () => { try { await onDelete(a.id); } catch (_) {} }} style={{ padding: "3px 10px", background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: "bold" }}>✕</button>
                  </div>
                ))
              }
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1, padding: "7px 10px", background: "#0f172a", border: `1px solid ${meta.color}55`, color: "#fff", borderRadius: 4, fontSize: 12 }}
                placeholder={`New ${meta.label.toLowerCase()}...`}
                value={inputs[cat]}
                onChange={e => setInputs(p => ({ ...p, [cat]: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleAdd(cat)}
              />
              <button
                onClick={() => handleAdd(cat)}
                disabled={busy[cat] || !inputs[cat].trim()}
                style={{ padding: "7px 12px", background: inputs[cat].trim() ? meta.color : "#334155", color: inputs[cat].trim() ? "#000" : "#64748b", border: "none", borderRadius: 4, cursor: inputs[cat].trim() ? "pointer" : "default", fontSize: 12, fontWeight: "bold", whiteSpace: "nowrap", transition: "all 0.2s" }}
              >{busy[cat] ? "..." : "+ ADD"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EMPTY SETUP PROMPT ───────────────────────────────────────────────────────
function EmptySetupPrompt({ isMobile, hasUnits, hasAmmo, onUnits, onAmmo }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "50px 20px", textAlign: "center", gap: 14 }}>
      <div style={{ fontSize: 44 }}>⚙️</div>
      <div style={{ fontSize: isMobile ? 17 : 20, fontWeight: "bold" }}>SETUP REQUIRED</div>
      <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 400, lineHeight: 1.7 }}>
        Complete setup before this view is available.
      </div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, marginTop: 8 }}>
        {!hasUnits && <button onClick={onUnits} style={{ padding: "10px 22px", background: "#a3e635", color: "#000", border: "none", borderRadius: 4, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>🏗️ CREATE UNITS →</button>}
        {!hasAmmo  && <button onClick={onAmmo}  style={{ padding: "10px 22px", background: "#facc15", color: "#000", border: "none", borderRadius: 4, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>⚙️ CONFIGURE AMMO →</button>}
      </div>
    </div>
  );
}

// ─── TEAM COMMANDER ────────────────────────────────────────────────────────────
function TeamCommander({ team, battery, teams, batteries, selectedTeamId, setSelectedTeamId, ammoTypes, stock, log, txAmmoId, setTxAmmoId, txQty, setTxQty, txNote, setTxNote, txType, setTxType, onSubmit, onFireMission, onAdjust, flash, maxPerTeam, onLogout }) {
  const isMobile = useIsMobile();
  const [btyTab, setBtyTab] = useState("ammunition");
  const hasTypes = ammoTypes.length > 0;

  if (!team) {
    return (
      <div style={{ ...s.screen, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 32 }}>
        <div style={{ fontSize: 40 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: "bold" }}>TEAM NOT FOUND</div>
        <button style={s.logoutBtn} onClick={onLogout}>BACK TO LOGIN</button>
      </div>
    );
  }

  return (
    <div style={{ ...s.screen, display: "flex", flexDirection: "column", height: "100vh" }}>
        {/* Header */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: isMobile ? "12px 16px" : "16px 28px", borderBottom: `2px solid ${battery?.color || "#1e293b"}`, background: "#0f172a" }}>
          <div style={{ display: "flex", gap: isMobile ? 10 : 14, alignItems: "center" }}>
            <div style={{ fontSize: isMobile ? 22 : 28 }}>⚡</div>
            <div>
              <div style={{ fontSize: isMobile ? 14 : 19, fontWeight: "bold" }}>
                {team.name.toUpperCase()}
                {battery && <span style={{ color: battery.color, marginLeft: 8, fontSize: isMobile ? 11 : 14 }}>/ {battery.name}</span>}
              </div>
              {!isMobile && <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1, marginTop: 2 }}>{team.callsign} // AMMUNITION MANAGEMENT</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: isMobile ? 6 : 10, alignItems: "center" }}>
            {/* Team switcher */}
            <select
              value={selectedTeamId}
              onChange={e => setSelectedTeamId(e.target.value)}
              style={{ ...s.txSelect, width: "auto", padding: isMobile ? "5px 8px" : "6px 12px", fontSize: isMobile ? 10 : 11 }}
            >
              {batteries.map(b => {
                const bTeams = teams.filter(t => t.batteryId === b.id);
                if (!bTeams.length) return null;
                return (
                  <optgroup key={b.id} label={b.name}>
                    {bTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
            <button style={{ ...s.logoutBtn, padding: isMobile ? "5px 10px" : "7px 14px", fontSize: isMobile ? 10 : 11 }} onClick={onLogout}>LOGOUT</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ ...s.tabs, paddingLeft: isMobile ? 4 : 16 }}>
          {[
            { id: "ammunition",  label: "📦 AMMUNITION",   ac: battery?.color || "#38bdf8" },
            { id: "firemission", label: "🎯 FIRE MISSION", ac: "#ef4444" },
          ].map(t => (
            <button key={t.id} style={{ ...s.tab, ...(btyTab === t.id ? { color: "#fff", borderBottomColor: t.ac } : {}), padding: isMobile ? "10px 14px" : "12px 22px", fontSize: isMobile ? 11 : 13 }}
              onClick={() => setBtyTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        {!hasTypes ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center", gap: 12 }}>
            <div style={{ fontSize: 40 }}>⚙️</div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: "bold" }}>AWAITING CONFIGURATION</div>
            <div style={{ fontSize: 13, color: "#94a3b8", maxWidth: 340, lineHeight: 1.7 }}>No ammunition types defined. Contact your Battalion Commander.</div>
          </div>
        ) : btyTab === "firemission" ? (
          <FireMissionTab ammoTypes={ammoTypes} stock={stock} log={log} onFireMission={onFireMission} maxPerTeam={maxPerTeam} isMobile={isMobile} accentColor={battery?.color || "#38bdf8"} />
        ) : (
          <AmmunitionTab ammoTypes={ammoTypes} stock={stock} log={log} txAmmoId={txAmmoId} setTxAmmoId={setTxAmmoId} txQty={txQty} setTxQty={setTxQty} txNote={txNote} setTxNote={setTxNote} txType={txType} setTxType={setTxType} onSubmit={onSubmit} onAdjust={onAdjust} maxPerTeam={maxPerTeam} isMobile={isMobile} accentColor={battery?.color || "#38bdf8"} />
        )}

      {flash && (
        <div style={{ ...s.flashBar, background: flash.kind === "success" ? "#4ade80" : "#ef4444", color: flash.kind === "success" ? "#000" : "#fff", bottom: isMobile ? 16 : 20, right: isMobile ? 12 : 20, left: isMobile ? 12 : "auto", textAlign: isMobile ? "center" : "left" }}>
          {flash.msg}
        </div>
      )}
    </div>
  );
}

// ─── FIRE MISSION TAB ─────────────────────────────────────────────────────────
function FireMissionTab({ ammoTypes, stock, log, onFireMission, maxPerTeam, isMobile, accentColor }) {
  const [missionName, setMissionName] = useState("");
  const [ammoQtys, setAmmoQtys] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const missions = useMemo(() => groupFireMissions(log), [log]);
  const hasAnyQty = Object.values(ammoQtys).some(v => parseInt(v, 10) > 0);

  async function handleSubmit() {
    setSubmitting(true);
    const ok = await onFireMission(missionName, ammoQtys);
    if (ok) { setMissionName(""); setAmmoQtys({}); }
    setSubmitting(false);
  }

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0, padding: isMobile ? 12 : 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 12 : 20, maxWidth: 1000 }}>
        {/* Form */}
        <div style={{ ...s.txCard, borderColor: "#ef4444", borderWidth: 2, padding: isMobile ? 16 : 20 }}>
          <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: "bold", color: "#ef4444", letterSpacing: 1, marginBottom: 16 }}>🎯 LOG FIRE MISSION</div>
          <div style={s.txField}>
            <label style={s.txLabel}>MISSION IDENTIFIER (OPTIONAL)</label>
            <input style={{ ...s.txInput }} placeholder="e.g. ATLAS-01, GRID 456789..." value={missionName} onChange={e => setMissionName(e.target.value)} />
          </div>
          {Object.entries(CATEGORY_META).map(([cat, meta]) => {
            const catTypes = ammoTypes.filter(a => a.category === cat);
            if (!catTypes.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: meta.color, fontWeight: "bold", letterSpacing: 1, marginBottom: 10 }}>{meta.icon} {meta.label}</div>
                {catTypes.map(a => {
                  const onHand = stock[a.id] || 0;
                  const entered = parseInt(ammoQtys[a.id] || "0", 10);
                  const over = entered > onHand;
                  return (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: isMobile ? 11 : 12, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
                        <div style={{ fontSize: 10, color: over ? "#ef4444" : "#64748b" }}>{over ? `⚠ ONLY ${onHand}` : `${onHand} on hand`}</div>
                      </div>
                      <input type="number" min="0"
                        style={{ width: 76, padding: "7px 8px", background: "#0f172a", border: `1px solid ${over ? "#ef4444" : entered > 0 ? meta.color : "#334155"}`, color: over ? "#ef4444" : "#fff", borderRadius: 4, fontSize: 14, textAlign: "center", flexShrink: 0 }}
                        placeholder="0"
                        value={ammoQtys[a.id] || ""}
                        onChange={e => setAmmoQtys(p => ({ ...p, [a.id]: e.target.value }))}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
          <button
            onClick={handleSubmit} disabled={submitting || !hasAnyQty}
            style={{ width: "100%", padding: isMobile ? 14 : 12, background: hasAnyQty && !submitting ? "#ef4444" : "#334155", color: hasAnyQty && !submitting ? "#fff" : "#64748b", border: "none", borderRadius: 4, fontWeight: "bold", cursor: hasAnyQty && !submitting ? "pointer" : "default", fontSize: isMobile ? 14 : 13, letterSpacing: 1, transition: "all 0.2s" }}
          >{submitting ? "SUBMITTING..." : "🎯 SUBMIT FIRE MISSION"}</button>
        </div>

        {/* Recent missions */}
        <div style={{ ...s.sectionCard, padding: isMobile ? 14 : 20 }}>
          <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: "bold", marginBottom: 14 }}>📋 RECENT FIRE MISSIONS</div>
          {missions.length === 0
            ? <div style={{ fontSize: 13, color: "#475569", textAlign: "center", padding: "24px 0" }}>No fire missions logged yet</div>
            : missions.map((m, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #334155" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: "bold", color: "#ef4444" }}>🎯 {m.name}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{new Date(m.time).toLocaleTimeString('en-GB', { hour12: false })}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {m.items.map((item, j) => (
                    <span key={j} style={{ padding: "2px 8px", background: "#0f172a", border: "1px solid #334155", borderRadius: 3, fontSize: 11, color: "#cbd5e1" }}>
                      {item.ammoLabel || item.ammoId} × {item.quantity}
                    </span>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// ─── AMMUNITION TAB ───────────────────────────────────────────────────────────
function AmmunitionTab({ ammoTypes, stock, log, txAmmoId, setTxAmmoId, txQty, setTxQty, txNote, setTxNote, txType, setTxType, onSubmit, onAdjust, maxPerTeam, isMobile, accentColor }) {
  const [editingId, setEditingId] = useState(null);   // ammoId being edited
  const [editValue, setEditValue] = useState("");      // raw input during edit

  function startEdit(ammoId, currentQty) {
    setEditingId(ammoId);
    setEditValue(String(currentQty));
  }

  async function confirmEdit(ammoId) {
    const newQty = parseInt(editValue, 10);
    if (isNaN(newQty) || newQty < 0) return;
    setEditingId(null);
    await onAdjust(ammoId, newQty);
  }

  function cancelEdit() { setEditingId(null); setEditValue(""); }

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0, padding: isMobile ? 10 : 20, display: "flex", flexDirection: "column", gap: isMobile ? 12 : 18 }}>

      {/* ── Top row: Stock table + Quick form ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: isMobile ? 12 : 18 }}>

        {/* Stock overview with EDIT */}
        <div style={{ ...s.sectionCard, padding: isMobile ? 14 : 20 }}>
          <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: "bold", marginBottom: 14, letterSpacing: 1 }}>
            📊 CURRENT STOCK
          </div>

          {Object.entries(CATEGORY_META).map(([cat, meta]) => {
            const catTypes = ammoTypes.filter(a => a.category === cat);
            if (!catTypes.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: meta.color, fontWeight: "bold", letterSpacing: 1, marginBottom: 10 }}>
                  {meta.icon} {meta.label}
                </div>
                {catTypes.map(a => {
                  const qty = stock[a.id] || 0;
                  const pct = Math.round((qty / maxPerTeam) * 100);
                  const isEditing = editingId === a.id;
                  return (
                    <div key={a.id} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        {/* Label */}
                        <span style={{ flex: 1, fontSize: isMobile ? 11 : 12, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.label}
                        </span>

                        {isEditing ? (
                          /* ── Inline edit mode ── */
                          <>
                            <input
                              type="number"
                              min="0"
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") confirmEdit(a.id); if (e.key === "Escape") cancelEdit(); }}
                              style={{ width: 72, padding: "4px 8px", background: "#0f172a", border: `1px solid ${accentColor}`, color: "#fff", borderRadius: 4, fontSize: 13, textAlign: "center" }}
                            />
                            <button
                              onClick={() => confirmEdit(a.id)}
                              style={{ padding: "4px 10px", background: "#4ade80", color: "#000", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11, fontWeight: "bold" }}
                            >✓ SAVE</button>
                            <button
                              onClick={cancelEdit}
                              style={{ padding: "4px 8px", background: "#334155", color: "#94a3b8", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 11 }}
                            >✕</button>
                          </>
                        ) : (
                          /* ── Normal display mode ── */
                          <>
                            <span style={{ fontSize: isMobile ? 13 : 14, color: meta.color, fontWeight: "bold", minWidth: 32, textAlign: "right" }}>{qty}</span>
                            <button
                              onClick={() => startEdit(a.id, qty)}
                              style={{ padding: "3px 10px", background: accentColor + "20", color: accentColor, border: `1px solid ${accentColor}60`, borderRadius: 3, cursor: "pointer", fontSize: 10, fontWeight: "bold", letterSpacing: 0.5, flexShrink: 0 }}
                            >✏ EDIT</button>
                          </>
                        )}
                      </div>

                      {/* Progress bar */}
                      {!isEditing && (
                        <div style={s.progressBar}>
                          <div style={{ ...s.progressFill, width: `${pct}%`, background: meta.color }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Quick add / remove form */}
        <div style={{ ...s.txCard, borderColor: accentColor, borderWidth: 2, padding: isMobile ? 14 : 20, display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: "bold", marginBottom: 16 }}>➕ ADD / REMOVE</div>

          <div style={s.txField}>
            <label style={s.txLabel}>AMMO TYPE</label>
            <select style={{ ...s.txSelect, fontSize: isMobile ? 12 : 13 }} value={txAmmoId} onChange={e => setTxAmmoId(e.target.value)}>
              {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                const catTypes = ammoTypes.filter(a => a.category === cat);
                if (!catTypes.length) return null;
                return (
                  <optgroup key={cat} label={`${meta.icon} ${meta.label}`}>
                    {catTypes.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 0 }}>
            <div style={s.txField}>
              <label style={s.txLabel}>ACTION</label>
              <select style={{ ...s.txSelect, fontSize: isMobile ? 12 : 13 }} value={txType} onChange={e => setTxType(e.target.value)}>
                <option value="ADD">➕ ADD</option>
                <option value="SUB">➖ EXPEND</option>
              </select>
            </div>
            <div style={s.txField}>
              <label style={s.txLabel}>QTY</label>
              <input style={{ ...s.txInput, fontSize: isMobile ? 12 : 13 }} type="number" value={txQty} onChange={e => setTxQty(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div style={s.txField}>
            <label style={s.txLabel}>NOTE</label>
            <input style={{ ...s.txInput, fontSize: isMobile ? 12 : 13 }} type="text" value={txNote} onChange={e => setTxNote(e.target.value)} placeholder="Resupply from HQ..." />
          </div>

          <button style={{ ...s.txButton, marginTop: "auto", padding: isMobile ? 13 : 12 }} onClick={onSubmit}>
            SUBMIT
          </button>
        </div>
      </div>

      {/* ── Logistics / Transaction log (main bottom section) ── */}
      <div style={{ ...s.sectionCard, padding: isMobile ? 14 : 20, flex: 1, minHeight: isMobile ? 220 : 280 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: "bold", letterSpacing: 1 }}>
            📋 LOGISTICS
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{log.length} RECORD{log.length !== 1 ? "S" : ""}</div>
        </div>
        <LogTable log={log} isMobile={isMobile} />
      </div>
    </div>
  );
}

// ─── SUMMARY TAB ──────────────────────────────────────────────────────────────
function SummaryTab({ batteries, teams, ammoTypes, log, isMobile }) {
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 16);

  const [start, setStart] = useState(fmt(yesterday));
  const [end,   setEnd]   = useState(fmt(now));
  const [copied, setCopied]   = useState(false);
  const [waSent, setWaSent]   = useState(false);
  const [waError, setWaError] = useState(null);
  const [wbPhone, setWbPhone] = useState(() => localStorage.getItem('ammo_wb_phone')  || '');
  const [wbKey,   setWbKey]   = useState(() => localStorage.getItem('ammo_wb_apikey') || '');
  const [showWbSettings, setShowWbSettings] = useState(false);

  function updateWbPhone(v) { setWbPhone(v); localStorage.setItem('ammo_wb_phone', v); }
  function updateWbKey(v)   { setWbKey(v);   localStorage.setItem('ammo_wb_apikey', v); }

  async function handleSendWhatsApp() {
    if (!wbPhone || !wbKey) { setShowWbSettings(true); return; }
    setWaError(null);
    try {
      await api.post('/notify/whatsapp', { phone: wbPhone, apikey: wbKey, text: generateText() });
      setWaSent(true);
      setTimeout(() => setWaSent(false), 3000);
    } catch (e) { setWaError(e.message || 'Failed to send'); }
  }

  const startMs = new Date(start).getTime();
  const endMs   = new Date(end).getTime();

  const filteredLog = log.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t >= startMs && t <= endMs;
  });

  function fmtDT(ts) {
    return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function groupFMs(entries) {
    const fmEntries = entries.filter(e => e.note?.startsWith('FM:') && e.type === 'SUB');
    const missions = [];
    fmEntries.forEach(entry => {
      const name = entry.note.slice(3);
      const t = new Date(entry.timestamp).getTime();
      const m = missions.find(x => x.name === name && Math.abs(new Date(x.time).getTime() - t) <= 30000);
      if (m) m.items.push(entry);
      else missions.push({ name, time: entry.timestamp, items: [entry] });
    });
    return missions;
  }

  const batteryData = batteries.map(b => {
    const bTeams = teams.filter(t => t.batteryId === b.id);
    const bLog   = filteredLog.filter(e => bTeams.some(t => t.id === e.teamId));
    const fms    = groupFMs(bLog);
    const other  = bLog.filter(e => !e.note?.startsWith('FM:'));
    const netChanges = ammoTypes.map(a => {
      const net = bLog.reduce((sum, e) => sum + (e.ammoId === a.id ? (e.type === 'ADD' ? e.quantity : -e.quantity) : 0), 0);
      return { ...a, net };
    }).filter(a => a.net !== 0);
    return { b, bLog, fms, other, netChanges };
  }).filter(({ bLog }) => bLog.length > 0);

  function generateText() {
    const fmtFull = d => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    let t = "══════════════════════════════════════════\n";
    t += "        AMMUNITION SUMMARY REPORT\n";
    t += "══════════════════════════════════════════\n";
    t += `From     : ${fmtFull(start)}\n`;
    t += `To       : ${fmtFull(end)}\n`;
    t += `Generated: ${fmtFull(new Date())}\n`;
    t += `Total txs: ${filteredLog.length}\n\n`;

    if (batteryData.length === 0) {
      t += "No transactions in selected period.\n";
      return t;
    }

    batteryData.forEach(({ b, fms, other, netChanges }) => {
      t += `──────────────────────────────────────────\n`;
      t += ` ${b.name.toUpperCase()}  /  ${b.callsign}\n`;
      t += `──────────────────────────────────────────\n`;

      if (fms.length) {
        t += "\n  FIRE MISSIONS:\n";
        fms.forEach(fm => {
          t += `    ▸ ${fm.name}  [${fmtDT(fm.time)}]\n`;
          fm.items.forEach(item => {
            t += `        -${item.quantity} ${item.ammoLabel || item.ammoId}  (${item.teamName || item.teamId})\n`;
          });
        });
      }

      if (other.length) {
        t += "\n  TRANSACTIONS:\n";
        other.forEach(e => {
          const sign = e.type === 'ADD' ? '+' : '-';
          const note = e.note ? `  [${e.note}]` : '';
          t += `    ${sign}${e.quantity} ${e.ammoLabel || e.ammoId}  ${e.type}  ${e.teamName || e.teamId}  ${fmtDT(e.timestamp)}${note}\n`;
        });
      }

      if (netChanges.length) {
        t += "\n  NET CHANGE:\n";
        netChanges.forEach(a => {
          t += `    ${a.label}: ${a.net > 0 ? '+' : ''}${a.net} rds\n`;
        });
      }
      t += "\n";
    });
    return t;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generateText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  }

  return (
    <div>
      {/* WhatsApp settings panel */}
      <div style={{ ...s.sectionCard, marginBottom: 16, border: "1px solid #25d36620" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: "bold", color: "#25d366" }}>📱 WHATSAPP GROUP</div>
          <button onClick={() => setShowWbSettings(p => !p)}
            style={{ fontSize: 11, color: "#64748b", background: "none", border: "none", cursor: "pointer" }}>
            {showWbSettings ? "▲ HIDE" : "▼ CONFIGURE"}
          </button>
        </div>
        {showWbSettings && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={s.txLabel}>GROUP PHONE / ID</label>
              <input placeholder="+972501234567" value={wbPhone} onChange={e => updateWbPhone(e.target.value)}
                style={{ ...s.txInput, width: "100%", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={s.txLabel}>CALLMEBOT API KEY</label>
              <input placeholder="API key from CallMeBot..." value={wbKey} onChange={e => updateWbKey(e.target.value)}
                style={{ ...s.txInput, width: "100%", boxSizing: "border-box" }} />
            </div>
          </div>
        )}
        {!showWbSettings && (
          <div style={{ marginTop: 6, fontSize: 11, color: wbPhone && wbKey ? "#4ade80" : "#ef4444" }}>
            {wbPhone && wbKey ? `✓ Configured — ${wbPhone}` : "Not configured — click CONFIGURE to set up"}
          </div>
        )}
        {waError && <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444" }}>⚠ {waError}</div>}
      </div>

      {/* Controls */}
      <div style={{ ...s.sectionCard, marginBottom: 20, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: isMobile ? "stretch" : "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...s.txLabel }}>FROM</label>
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
            style={{ ...s.txInput, width: "100%", boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...s.txLabel }}>TO</label>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}
            style={{ ...s.txInput, width: "100%", boxSizing: "border-box" }} />
        </div>
        <button onClick={handleCopy} style={{ padding: isMobile ? "10px 16px" : "10px 24px", background: copied ? "#4ade80" : "#38bdf8", color: "#000", border: "none", borderRadius: 4, fontWeight: "bold", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s", flexShrink: 0 }}>
          {copied ? "✓ COPIED!" : "📋 COPY TEXT"}
        </button>
        <button onClick={handleSendWhatsApp} style={{ padding: isMobile ? "10px 16px" : "10px 24px", background: waSent ? "#4ade80" : "#25d366", color: "#000", border: "none", borderRadius: 4, fontWeight: "bold", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s", flexShrink: 0 }}>
          {waSent ? "✓ SENT!" : "📱 SEND TO WHATSAPP"}
        </button>
      </div>

      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
        {filteredLog.length} transaction{filteredLog.length !== 1 ? "s" : ""} in period
      </div>

      {batteryData.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569", fontSize: 14 }}>
          No transactions found in the selected time period.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {batteryData.map(({ b, fms, other, netChanges }) => (
            <div key={b.id} style={{ ...s.sectionCard, border: `2px solid ${b.color}`, padding: isMobile ? 14 : 20 }}>
              {/* Battery header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${b.color}40`, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: isMobile ? 14 : 16, fontWeight: "bold", color: b.color }}>{b.name} <span style={{ fontSize: 11, color: "#64748b" }}>/ {b.callsign}</span></div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{fms.length} fire mission{fms.length !== 1 ? "s" : ""}  ·  {other.length} transaction{other.length !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {netChanges.map(a => (
                    <div key={a.id} style={{ padding: "3px 8px", background: a.net > 0 ? "#4ade8020" : "#ef444420", border: `1px solid ${a.net > 0 ? "#4ade80" : "#ef4444"}`, borderRadius: 3, fontSize: 11, fontWeight: "bold", color: a.net > 0 ? "#4ade80" : "#ef4444" }}>
                      {a.net > 0 ? "+" : ""}{a.net} {a.label}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : (fms.length && other.length ? "1fr 1fr" : "1fr"), gap: 16 }}>
                {/* Fire missions */}
                {fms.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: "#ef4444", marginBottom: 10 }}>🎯 FIRE MISSIONS ({fms.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {fms.map((fm, i) => (
                        <div key={i} style={{ padding: "8px 10px", background: "#0f172a", borderRadius: 4, border: "1px solid #334155" }}>
                          <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>
                            {fm.name}
                            <span style={{ fontSize: 10, color: "#64748b", fontWeight: "normal", marginLeft: 8 }}>{fmtDT(fm.time)}</span>
                          </div>
                          {fm.items.map((item, j) => (
                            <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#ef4444", padding: "1px 0" }}>
                              <span style={{ color: "#94a3b8" }}>{item.ammoLabel || item.ammoId}</span>
                              <span style={{ fontWeight: "bold" }}>-{item.quantity} rds</span>
                            </div>
                          ))}
                          <div style={{ fontSize: 10, color: "#475569", marginTop: 5 }}>
                            {[...new Set(fm.items.map(x => x.teamName || x.teamId))].join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Other transactions */}
                {other.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: "bold", color: "#38bdf8", marginBottom: 10 }}>📦 TRANSACTIONS ({other.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {other.map((e, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "#0f172a", borderRadius: 3, gap: 8 }}>
                          <div style={{ fontSize: 11, minWidth: 0 }}>
                            <span style={{ color: e.type === 'ADD' ? "#4ade80" : "#ef4444", fontWeight: "bold" }}>{e.type === 'ADD' ? '+' : '-'}{e.quantity}</span>
                            <span style={{ color: "#cbd5e1", marginLeft: 5 }}>{e.ammoLabel || e.ammoId}</span>
                            {e.note && <span style={{ color: "#475569", marginLeft: 5, fontSize: 10 }}>· {e.note}</span>}
                            <div style={{ fontSize: 10, color: "#475569" }}>{e.teamName || e.teamId}</div>
                          </div>
                          <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>{fmtDT(e.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LOG TABLE ────────────────────────────────────────────────────────────────
function LogTable({ log, isMobile, showTeam }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: showTeam ? (isMobile ? "1fr 1fr 1fr 0.5fr" : "1fr 1.2fr 1.2fr 1fr 0.6fr") : "1fr 1.4fr 1fr 0.6fr", gap: 8, padding: "7px 0", borderBottom: "1px solid #334155", fontWeight: "bold", color: "#94a3b8", fontSize: isMobile ? 10 : 11 }}>
        <span>TIME</span>
        {showTeam && !isMobile && <span>TEAM</span>}
        <span>AMMO</span>
        <span>TX</span>
        <span>QTY</span>
      </div>
      {(log || []).map(entry => (
        <div key={entry._id || entry.id} style={{ display: "grid", gridTemplateColumns: showTeam ? (isMobile ? "1fr 1fr 1fr 0.5fr" : "1fr 1.2fr 1.2fr 1fr 0.6fr") : "1fr 1.4fr 1fr 0.6fr", gap: 8, padding: "8px 0", borderBottom: "1px solid #1e293b", fontSize: isMobile ? 11 : 12, alignItems: "center" }}>
          <span style={{ color: "#94a3b8" }}>{entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString('en-GB', { hour12: false }) : ""}</span>
          {showTeam && !isMobile && <span style={{ color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.teamName || entry.teamId}</span>}
          <span style={{ color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.ammoLabel || entry.ammoId}</span>
          <span style={{ color: entry.type === "ADD" ? "#4ade80" : "#ef4444" }}>{entry.type}</span>
          <span style={{ fontWeight: "bold" }}>{entry.quantity}</span>
        </div>
      ))}
      {(!log || !log.length) && <div style={{ padding: "16px 0", fontSize: 12, color: "#475569", textAlign: "center" }}>No transactions yet</div>}
    </div>
  );
}
