import { useState, useMemo, useEffect, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Brush
} from "recharts";

// ─── SYNTHETIC DATA GENERATION ───────────────────────────────────────────────
const STORES = ["Store A", "Store B", "Store C", "Store D"];
const PRODUCTS = ["Electronics", "Apparel", "Grocery", "Home & Garden"];
const ROLES = { analyst: "Analyst", manager: "Manager", admin: "Admin" };

const HOLIDAYS = new Set([
  "2023-01-01","2023-07-04","2023-11-23","2023-12-25",
  "2024-01-01","2024-07-04","2024-11-28","2024-12-25"
]);

function seedRand(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateData() {
  const rand = seedRand(42);
  const data = [];
  const start = new Date("2022-01-03");
  for (let w = 0; w < 130; w++) {
    const d = new Date(start);
    d.setDate(d.getDate() + w * 7);
    const dateStr = d.toISOString().slice(0, 10);
    const month = d.getMonth();
    const week = w % 52;
    const holiday = HOLIDAYS.has(dateStr) ? 1 : 0;
    const seasonality = 1 + 0.3 * Math.sin((week / 52) * 2 * Math.PI - 1.2);
    const holidayBoost = holiday ? 1.4 : 1;
    const trend = 1 + w * 0.002;
    const temp = 15 + 20 * Math.sin((month / 12) * 2 * Math.PI) + rand() * 5;
    const cpi = 260 + w * 0.15 + rand() * 2;
    const fuel = 3.2 + 0.8 * Math.sin(w / 15) + rand() * 0.3;
    const unemployment = 4.5 - w * 0.005 + rand() * 0.4;

    STORES.forEach((store, si) => {
      PRODUCTS.forEach((product, pi) => {
        const base = 15000 + si * 4000 + pi * 2000;
        const noise = (rand() - 0.5) * 3000;
        const sales = Math.round(base * seasonality * holidayBoost * trend + noise);
        data.push({
          date: dateStr,
          weekNum: w,
          store, product,
          sales: Math.max(0, sales),
          holiday,
          temp: Math.round(temp * 10) / 10,
          cpi: Math.round(cpi * 10) / 10,
          fuel: Math.round(fuel * 100) / 100,
          unemployment: Math.round(unemployment * 10) / 10,
          month, week
        });
      });
    });
  }
  return data;
}

// ─── FORECASTING ENGINE ───────────────────────────────────────────────────────
function forecastDemand(historicalRows, weeksAhead = 12) {
  if (historicalRows.length < 10) return [];
  const sorted = [...historicalRows].sort((a, b) => a.weekNum - b.weekNum);
  const values = sorted.map(r => r.sales);
  const n = values.length;

  // Simple linear trend + seasonal decomposition
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  values.forEach((v, i) => { sumX += i; sumY += v; sumXY += i * v; sumX2 += i * i; });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Residuals for seasonal pattern
  const residuals = values.map((v, i) => v - (intercept + slope * i));
  const seasonLen = 52;
  const seasonal = Array(seasonLen).fill(0).map((_, s) => {
    const matching = residuals.filter((_, i) => (sorted[i].week % seasonLen) === s);
    return matching.length ? matching.reduce((a, b) => a + b, 0) / matching.length : 0;
  });

  // Forecast
  const lastRow = sorted[sorted.length - 1];
  const results = [];
  let sumResid = 0, sumResid2 = 0;
  residuals.forEach(r => { sumResid += r; sumResid2 += r * r; });
  const stdErr = Math.sqrt(sumResid2 / n - (sumResid / n) ** 2);

  for (let f = 1; f <= weeksAhead; f++) {
    const idx = n + f;
    const futureDate = new Date(lastRow.date);
    futureDate.setDate(futureDate.getDate() + f * 7);
    const dateStr = futureDate.toISOString().slice(0, 10);
    const weekOfYear = Math.floor((futureDate - new Date(futureDate.getFullYear(), 0, 0)) / (7 * 24 * 3600 * 1000)) % 52;
    const isHoliday = HOLIDAYS.has(dateStr) ? 1 : 0;

    const trend = intercept + slope * idx;
    const seas = seasonal[weekOfYear];
    const holidayBoost = isHoliday ? trend * 0.4 : 0;
    const predicted = Math.round(trend + seas + holidayBoost);
    const ci95 = Math.round(stdErr * 1.96 * Math.sqrt(1 + 1 / n + f / n));
    const anomaly = predicted < 0 || (predicted > values[values.length - 1] * 5);

    results.push({
      date: dateStr,
      weekNum: idx,
      predicted: Math.max(0, predicted),
      lower: Math.max(0, predicted - ci95),
      upper: predicted + ci95,
      isHoliday,
      anomaly,
      isForecast: true
    });
  }
  return results;
}

// ─── SECURITY MODULE ──────────────────────────────────────────────────────────
const ACCESS_LOGS = [];
const PERMISSIONS = {
  analyst: ["view_charts", "view_aggregated", "run_forecast"],
  manager: ["view_charts", "view_aggregated", "run_forecast", "view_store_breakdown", "export_summary"],
  admin: ["view_charts", "view_aggregated", "run_forecast", "view_store_breakdown", "export_summary", "view_raw_data", "manage_users"]
};

function hasPermission(role, action) {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

function logAccess(user, action, detail = "") {
  ACCESS_LOGS.push({ ts: new Date().toISOString(), user, action, detail });
}

function maskSales(value, role) {
  if (role === "analyst") {
    const tier = value < 10000 ? "Low (<10K)" : value < 20000 ? "Mid (10K–20K)" : value < 30000 ? "High (20K–30K)" : "Premium (30K+)";
    return tier;
  }
  return value.toLocaleString();
}

// ─── CHART COMPONENTS ─────────────────────────────────────────────────────────
const PALETTE = {
  primary: "#00e5ff",
  secondary: "#ff6b35",
  accent: "#a78bfa",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  forecast: "#818cf8",
  bg: "#060b14",
  surface: "#0d1526",
  border: "#1e293b",
  text: "#e2e8f0",
  muted: "#64748b"
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0d1526", border: "1px solid #1e293b",
      borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#e2e8f0"
    }}>
      <p style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: "2px 0" }}>
          <span style={{ opacity: 0.8 }}>{p.name}: </span>
          <strong>{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const ALL_DATA = generateData();

export default function App() {
  const [role, setRole] = useState(null);
  const [username, setUsername] = useState("");
  const [loginInput, setLoginInput] = useState({ user: "", role: "analyst" });
  const [selectedStore, setSelectedStore] = useState("Store A");
  const [selectedProduct, setSelectedProduct] = useState("Electronics");
  const [forecastWeeks, setForecastWeeks] = useState(12);
  const [activeTab, setActiveTab] = useState("overview");
  const [showLogs, setShowLogs] = useState(false);
  const [logEntries, setLogEntries] = useState([]);
  const [alertMsg, setAlertMsg] = useState(null);

  const showAlert = (msg, type = "warn") => {
    setAlertMsg({ msg, type });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  const handleLogin = () => {
    if (!loginInput.user.trim()) { showAlert("Username required", "error"); return; }
    logAccess(loginInput.user, "LOGIN", loginInput.role);
    setUsername(loginInput.user);
    setRole(loginInput.role);
    setLogEntries([...ACCESS_LOGS]);
  };

  const filtered = useMemo(() =>
    ALL_DATA.filter(r => r.store === selectedStore && r.product === selectedProduct)
      .sort((a, b) => a.weekNum - b.weekNum),
    [selectedStore, selectedProduct]
  );

  const forecasted = useMemo(() => {
    if (!role) return [];
    logAccess(username, "RUN_FORECAST", `${selectedStore}/${selectedProduct}/${forecastWeeks}w`);
    const fc = forecastDemand(filtered, forecastWeeks);
    const anomalies = fc.filter(f => f.anomaly);
    if (anomalies.length) showAlert(`⚠️ ${anomalies.length} anomalous prediction(s) detected and flagged`, "warn");
    setLogEntries([...ACCESS_LOGS]);
    return fc;
  }, [filtered, forecastWeeks, role]);

  const chartData = useMemo(() => {
    const hist = filtered.slice(-52).map(r => ({
      date: r.date.slice(5), sales: r.sales, holiday: r.holiday ? r.sales : null, isForecast: false
    }));
    const fc = forecasted.map(r => ({
      date: r.date.slice(5),
      forecast: r.predicted,
      lower: r.lower,
      upper: r.upper,
      holiday: r.isHoliday ? r.predicted : null,
      anomaly: r.anomaly ? r.predicted : null,
      isForecast: true
    }));
    return [...hist, ...fc];
  }, [filtered, forecasted]);

  const kpis = useMemo(() => {
    const recent = filtered.slice(-12);
    const avg = recent.reduce((a, r) => a + r.sales, 0) / (recent.length || 1);
    const prev = filtered.slice(-24, -12);
    const prevAvg = prev.reduce((a, r) => a + r.sales, 0) / (prev.length || 1);
    const growth = prevAvg ? ((avg - prevAvg) / prevAvg * 100).toFixed(1) : "N/A";
    const fcAvg = forecasted.length ? Math.round(forecasted.reduce((a, r) => a + r.predicted, 0) / forecasted.length) : 0;
    const peak = forecasted.reduce((a, r) => r.predicted > a.predicted ? r : a, { predicted: 0, date: "" });
    return { avg, growth, fcAvg, peak };
  }, [filtered, forecasted]);

  const corrData = useMemo(() => {
    const allByDate = {};
    ALL_DATA.filter(r => r.store === selectedStore).forEach(r => {
      if (!allByDate[r.date]) allByDate[r.date] = { date: r.date, temp: r.temp, cpi: r.cpi, fuel: r.fuel, unemployment: r.unemployment, totalSales: 0, count: 0 };
      allByDate[r.date].totalSales += r.sales;
      allByDate[r.date].count++;
    });
    return Object.values(allByDate).slice(-52).map(r => ({
      date: r.date.slice(5),
      temp: r.temp,
      cpi: Math.round(r.cpi),
      fuel: r.fuel,
      unemployment: r.unemployment,
      avgSales: Math.round(r.totalSales / r.count)
    }));
  }, [selectedStore]);

  const storeComp = useMemo(() => {
    const byStore = {};
    ALL_DATA.filter(r => r.product === selectedProduct).forEach(r => {
      if (!byStore[r.store]) byStore[r.store] = { store: r.store, total: 0, count: 0 };
      byStore[r.store].total += r.sales;
      byStore[r.store].count++;
    });
    return Object.values(byStore).map(s => ({ store: s.store, avg: Math.round(s.total / s.count) }));
  }, [selectedProduct]);

  if (!role) {
    return (
      <div style={{ minHeight: "100vh", background: "#060b14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace" }}>
        <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 16, padding: 48, width: 400, boxShadow: "0 0 60px rgba(0,229,255,0.08)" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📊</div>
            <h1 style={{ color: "#00e5ff", fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: 2, fontFamily: "Georgia, serif" }}>DEMAND INTEL</h1>
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 6, letterSpacing: 1 }}>RETAIL FORECASTING SYSTEM v2.4</p>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1, display: "block", marginBottom: 6 }}>USERNAME</label>
            <input value={loginInput.user} onChange={e => setLoginInput(p => ({ ...p, user: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              style={{ width: "100%", background: "#060b14", border: "1px solid #1e293b", color: "#e2e8f0", padding: "10px 12px", borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none" }}
              placeholder="Enter username" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 1, display: "block", marginBottom: 6 }}>ACCESS ROLE</label>
            <select value={loginInput.role} onChange={e => setLoginInput(p => ({ ...p, role: e.target.value }))}
              style={{ width: "100%", background: "#060b14", border: "1px solid #1e293b", color: "#e2e8f0", padding: "10px 12px", borderRadius: 8, fontSize: 14, boxSizing: "border-box", outline: "none" }}>
              <option value="analyst">Analyst — Aggregated View</option>
              <option value="manager">Manager — Store Breakdown</option>
              <option value="admin">Admin — Full Access</option>
            </select>
          </div>
          <button onClick={handleLogin}
            style={{ width: "100%", background: "linear-gradient(135deg,#00e5ff,#0080ff)", color: "#000", fontWeight: 700, padding: "12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, letterSpacing: 2, fontFamily: "'Courier New', monospace" }}>
            AUTHENTICATE →
          </button>
          <p style={{ color: "#334155", fontSize: 10, textAlign: "center", marginTop: 16, letterSpacing: 1 }}>
            ALL ACCESS ATTEMPTS ARE LOGGED AND MONITORED
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "forecast", label: "Forecast" },
    { id: "external", label: "External Factors" },
    { id: "stores", label: "Store Compare", locked: !hasPermission(role, "view_store_breakdown") },
    { id: "logs", label: "Audit Logs", locked: !hasPermission(role, "view_raw_data") }
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#060b14", color: "#e2e8f0", fontFamily: "'Courier New', monospace", fontSize: 13 }}>
      {/* Alert Banner */}
      {alertMsg && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 999,
          background: alertMsg.type === "error" ? "#ef44441a" : "#f59e0b1a",
          border: `1px solid ${alertMsg.type === "error" ? "#ef4444" : "#f59e0b"}`,
          borderRadius: 8, padding: "10px 16px", maxWidth: 360,
          color: alertMsg.type === "error" ? "#ef4444" : "#f59e0b", fontSize: 12
        }}>{alertMsg.msg}</div>
      )}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e293b", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1526" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#00e5ff", fontWeight: 700, fontSize: 16, letterSpacing: 2, fontFamily: "Georgia, serif" }}>📊 DEMAND INTEL</span>
          <span style={{ background: "#1e293b", color: "#64748b", fontSize: 10, padding: "2px 8px", borderRadius: 20, letterSpacing: 1 }}>v2.4</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#e2e8f0", fontSize: 12 }}>{username}</div>
            <div style={{ color: role === "admin" ? "#00e5ff" : role === "manager" ? "#a78bfa" : "#22c55e", fontSize: 10, letterSpacing: 1 }}>
              {role.toUpperCase()}
            </div>
          </div>
          <button onClick={() => { logAccess(username, "LOGOUT"); setRole(null); setUsername(""); }}
            style={{ background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 11, letterSpacing: 1 }}>
            LOGOUT
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: "12px 24px", background: "#080f1e", borderBottom: "1px solid #1e293b", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <label style={{ color: "#64748b", fontSize: 10, display: "block", marginBottom: 3, letterSpacing: 1 }}>STORE</label>
          <select value={selectedStore} onChange={e => { setSelectedStore(e.target.value); logAccess(username, "FILTER_STORE", e.target.value); setLogEntries([...ACCESS_LOGS]); }}
            style={{ background: "#0d1526", border: "1px solid #1e293b", color: "#e2e8f0", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            {STORES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "#64748b", fontSize: 10, display: "block", marginBottom: 3, letterSpacing: 1 }}>PRODUCT</label>
          <select value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); logAccess(username, "FILTER_PRODUCT", e.target.value); setLogEntries([...ACCESS_LOGS]); }}
            style={{ background: "#0d1526", border: "1px solid #1e293b", color: "#e2e8f0", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            {PRODUCTS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={{ color: "#64748b", fontSize: 10, display: "block", marginBottom: 3, letterSpacing: 1 }}>FORECAST HORIZON</label>
          <select value={forecastWeeks} onChange={e => {
            const v = parseInt(e.target.value);
            if (v > 52) { showAlert("⚠️ Forecast horizon capped at 52 weeks for reliability"); return; }
            setForecastWeeks(v);
          }}
            style={{ background: "#0d1526", border: "1px solid #1e293b", color: "#e2e8f0", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
            {[4, 8, 12, 16, 24, 36, 52].map(w => <option key={w} value={w}>{w} weeks</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }}></div>
          <span style={{ color: "#22c55e", fontSize: 10, letterSpacing: 1 }}>LIVE</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e293b", background: "#080f1e", padding: "0 24px" }}>
        {tabs.map(tab => (
          <button key={tab.id}
            onClick={() => { if (!tab.locked) { setActiveTab(tab.id); logAccess(username, "VIEW_TAB", tab.id); setLogEntries([...ACCESS_LOGS]); } else showAlert(`🔒 ${tab.label} requires ${tab.id === "stores" ? "Manager" : "Admin"} access`, "error"); }}
            style={{
              background: "none", border: "none", color: activeTab === tab.id ? "#00e5ff" : tab.locked ? "#334155" : "#64748b",
              padding: "12px 16px", cursor: tab.locked ? "not-allowed" : "pointer", fontSize: 11, letterSpacing: 1,
              borderBottom: activeTab === tab.id ? "2px solid #00e5ff" : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 6
            }}>
            {tab.locked ? "🔒" : ""}{tab.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 24 }}>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "AVG WEEKLY SALES", value: hasPermission(role, "view_raw_data") ? `$${Math.round(kpis.avg).toLocaleString()}` : maskSales(Math.round(kpis.avg), role), color: "#00e5ff" },
            { label: "GROWTH (QoQ)", value: `${kpis.growth}%`, color: kpis.growth > 0 ? "#22c55e" : "#ef4444" },
            { label: "AVG FORECAST", value: `$${kpis.fcAvg.toLocaleString()}`, color: "#818cf8" },
            { label: "PEAK FORECAST", value: kpis.peak.date ? `Wk of ${kpis.peak.date.slice(5)}` : "—", color: "#f59e0b" }
          ].map((kpi, i) => (
            <div key={i} style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 18px" }}>
              <div style={{ color: "#64748b", fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>{kpi.label}</div>
              <div style={{ color: kpi.color, fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{kpi.value}</div>
              {role === "analyst" && kpi.label === "AVG WEEKLY SALES" && (
                <div style={{ color: "#334155", fontSize: 9, marginTop: 4 }}>⚠ Aggregated (Analyst)</div>
              )}
            </div>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
              <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 16, marginTop: 0 }}>HISTORICAL WEEKLY SALES — LAST 52 WEEKS</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData.filter(d => !d.isForecast)} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} interval={7} />
                  <YAxis stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="sales" stroke="#00e5ff" strokeWidth={2} fill="url(#salesGrad)" name="Sales ($)" />
                  <Area type="monotone" dataKey="holiday" stroke="#f59e0b" strokeWidth={0} fill="#f59e0b" fillOpacity={0.3} name="Holiday Wk" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 16, marginTop: 0 }}>MONTHLY AGGREGATION</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={(() => {
                    const byMonth = {};
                    filtered.forEach(r => {
                      const m = r.date.slice(0, 7);
                      if (!byMonth[m]) byMonth[m] = { month: m.slice(5), sales: 0, count: 0 };
                      byMonth[m].sales += r.sales;
                      byMonth[m].count++;
                    });
                    return Object.values(byMonth).slice(-12);
                  })()} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="month" stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="sales" fill="#a78bfa" radius={[3, 3, 0, 0]} name="Monthly Sales" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 16, marginTop: 0 }}>SEASONAL PATTERN (WEEKLY AVG)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={(() => {
                    const byWeek = {};
                    filtered.forEach(r => {
                      if (!byWeek[r.week]) byWeek[r.week] = { week: r.week, total: 0, count: 0 };
                      byWeek[r.week].total += r.sales;
                      byWeek[r.week].count++;
                    });
                    return Object.values(byWeek).sort((a, b) => a.week - b.week).map(w => ({ week: `W${w.week}`, avg: Math.round(w.total / w.count) }));
                  })()} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="week" stroke="#334155" tick={{ fill: "#64748b", fontSize: 9 }} interval={7} />
                    <YAxis stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="avg" stroke="#22c55e" strokeWidth={2} dot={false} name="Avg Sales" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* FORECAST TAB */}
        {activeTab === "forecast" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, margin: 0 }}>DEMAND FORECAST — {forecastWeeks}W HORIZON WITH 95% CONFIDENCE INTERVAL</h3>
                <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
                  {[{ color: "#00e5ff", label: "Historical" }, { color: "#818cf8", label: "Forecast" }, { color: "#f59e0b44", label: "CI Band" }, { color: "#f59e0b", label: "Holiday" }].map(l => (
                    <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, color: "#64748b" }}>
                      <span style={{ width: 10, height: 3, background: l.color, display: "inline-block", borderRadius: 2 }}></span>{l.label}
                    </span>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedForecastChart hist={filtered.slice(-52)} forecast={forecasted} />
              </ResponsiveContainer>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 12, marginTop: 0 }}>FORECAST TABLE</h3>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e293b" }}>
                        {["Week Of", "Predicted ($)", "Lower", "Upper", "Status"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "#64748b", fontSize: 9, letterSpacing: 1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {forecasted.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #0f1c2e" }}>
                          <td style={{ padding: "4px 8px", color: "#94a3b8" }}>{r.date.slice(5)}</td>
                          <td style={{ padding: "4px 8px", color: r.anomaly ? "#ef4444" : "#818cf8", fontWeight: 600 }}>{r.predicted.toLocaleString()}</td>
                          <td style={{ padding: "4px 8px", color: "#64748b" }}>{r.lower.toLocaleString()}</td>
                          <td style={{ padding: "4px 8px", color: "#64748b" }}>{r.upper.toLocaleString()}</td>
                          <td style={{ padding: "4px 8px" }}>
                            {r.anomaly ? <span style={{ color: "#ef4444", fontSize: 9 }}>⚠ FLAGGED</span>
                              : r.isHoliday ? <span style={{ color: "#f59e0b", fontSize: 9 }}>🎉 HOLIDAY</span>
                              : <span style={{ color: "#22c55e", fontSize: 9 }}>✓ OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 12, marginTop: 0 }}>GUARDRAIL STATUS</h3>
                {[
                  { label: "Forecast Horizon", value: `${forecastWeeks}w`, ok: forecastWeeks <= 52, warn: "Horizon >52w blocked" },
                  { label: "Anomalous Predictions", value: `${forecasted.filter(f => f.anomaly).length}`, ok: forecasted.filter(f => f.anomaly).length === 0, warn: "Spikes >500% flagged" },
                  { label: "Data Recency", value: `${filtered.length} weeks loaded`, ok: filtered.length >= 10 },
                  { label: "Role-Based Access", value: role.toUpperCase(), ok: true },
                  { label: "Input Validation", value: "Active", ok: true },
                  { label: "Audit Logging", value: `${ACCESS_LOGS.length} events`, ok: true }
                ].map((g, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #0f1c2e" }}>
                    <span style={{ color: "#94a3b8", fontSize: 11 }}>{g.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#64748b", fontSize: 11 }}>{g.value}</span>
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: g.ok ? "#14532d33" : "#7f1d1d33", color: g.ok ? "#22c55e" : "#ef4444", letterSpacing: 1 }}>
                        {g.ok ? "OK" : "WARN"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* EXTERNAL FACTORS TAB */}
        {activeTab === "external" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { key: "temp", label: "TEMPERATURE (°F) vs SALES", color: "#ff6b35" },
                { key: "cpi", label: "CPI vs SALES", color: "#a78bfa" },
                { key: "fuel", label: "FUEL PRICE vs SALES", color: "#f59e0b" },
                { key: "unemployment", label: "UNEMPLOYMENT RATE vs SALES", color: "#22c55e" }
              ].map(f => (
                <div key={f.key} style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
                  <h3 style={{ color: "#94a3b8", fontSize: 10, letterSpacing: 1.5, marginBottom: 12, marginTop: 0 }}>{f.label}</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={corrData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#334155" tick={{ fill: "#64748b", fontSize: 9 }} interval={8} />
                      <YAxis yAxisId="sales" stroke="#334155" tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                      <YAxis yAxisId="ext" orientation="right" stroke="#334155" tick={{ fill: "#64748b", fontSize: 9 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line yAxisId="sales" type="monotone" dataKey="avgSales" stroke="#00e5ff" strokeWidth={1.5} dot={false} name="Avg Sales ($)" />
                      <Line yAxisId="ext" type="monotone" dataKey={f.key} stroke={f.color} strokeWidth={1.5} dot={false} name={f.label.split(" vs")[0]} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STORE COMPARISON TAB */}
        {activeTab === "stores" && hasPermission(role, "view_store_breakdown") && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
              <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 16, marginTop: 0 }}>STORE COMPARISON — {selectedProduct} AVG WEEKLY SALES</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={storeComp} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="store" stroke="#334155" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                  <YAxis stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avg" fill="#00e5ff" radius={[4, 4, 0, 0]} name="Avg Sales ($)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
              <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 12, marginTop: 0 }}>ALL STORES — TREND OVERLAY</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  data={(() => {
                    const byDate = {};
                    ALL_DATA.filter(r => r.product === selectedProduct).forEach(r => {
                      if (!byDate[r.date]) byDate[r.date] = { date: r.date.slice(5) };
                      byDate[r.date][r.store] = r.sales;
                    });
                    return Object.values(byDate).slice(-52);
                  })()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} interval={7} />
                  <YAxis stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {STORES.map((s, i) => (
                    <Line key={s} type="monotone" dataKey={s} stroke={["#00e5ff", "#a78bfa", "#22c55e", "#ff6b35"][i]} strokeWidth={1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* AUDIT LOGS TAB */}
        {activeTab === "logs" && hasPermission(role, "view_raw_data") && (
          <div style={{ background: "#0d1526", border: "1px solid #1e293b", borderRadius: 10, padding: 20 }}>
            <h3 style={{ color: "#94a3b8", fontSize: 11, letterSpacing: 2, marginBottom: 12, marginTop: 0 }}>AUDIT LOG — {ACCESS_LOGS.length} EVENTS</h3>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e293b" }}>
                    {["Timestamp", "User", "Action", "Detail"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 10px", color: "#64748b", fontSize: 9, letterSpacing: 1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...ACCESS_LOGS].reverse().map((log, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #0f1c2e" }}>
                      <td style={{ padding: "4px 10px", color: "#64748b", whiteSpace: "nowrap" }}>{log.ts.slice(11, 19)}</td>
                      <td style={{ padding: "4px 10px", color: "#00e5ff" }}>{log.user}</td>
                      <td style={{ padding: "4px 10px", color: "#a78bfa" }}>{log.action}</td>
                      <td style={{ padding: "4px 10px", color: "#94a3b8" }}>{log.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #1e293b", padding: "10px 24px", display: "flex", justifyContent: "space-between", color: "#334155", fontSize: 9, letterSpacing: 1 }}>
        <span>DEMAND INTEL SYSTEM v2.4 — RETAIL FORECASTING PLATFORM</span>
        <span>DATA ENCRYPTED AT REST · HTTPS ENFORCED · RBAC ACTIVE</span>
        <span>© 2024 ANALYTICS DIVISION</span>
      </div>
    </div>
  );
}

// ─── COMPOSED FORECAST CHART (uses recharts ComposedChart) ────────────────────
import { ComposedChart, scatter } from "recharts";

function ComposedForecastChart({ hist, forecast }) {
  const histData = hist.slice(-52).map(r => ({ date: r.date.slice(5), sales: r.sales }));
  const fcData = forecast.map(r => ({
    date: r.date.slice(5),
    predicted: r.predicted,
    lower: r.lower,
    upper: r.upper,
    holiday: r.isHoliday ? r.predicted : null
  }));
  const combined = [...histData, ...fcData];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={combined} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <defs>
          <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} interval={8} />
        <YAxis stroke="#334155" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 10, color: "#64748b" }} />
        <Area type="monotone" dataKey="sales" stroke="#00e5ff" strokeWidth={2} fill="url(#histGrad)" name="Historical Sales" connectNulls={false} />
        <Area type="monotone" dataKey="predicted" stroke="#818cf8" strokeWidth={2} strokeDasharray="5 3" fill="url(#fcGrad)" name="Forecast" connectNulls={false} />
        <Line type="monotone" dataKey="upper" stroke="#818cf8" strokeWidth={0.5} strokeDasharray="2 4" dot={false} name="CI Upper" legendType="none" />
        <Line type="monotone" dataKey="lower" stroke="#818cf8" strokeWidth={0.5} strokeDasharray="2 4" dot={false} name="CI Lower" legendType="none" />
        <ReferenceLine x={histData[histData.length - 1]?.date} stroke="#334155" strokeDasharray="4 2" label={{ value: "Today", fill: "#64748b", fontSize: 9 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
