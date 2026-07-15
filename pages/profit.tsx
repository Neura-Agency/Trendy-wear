import { useEffect, useState, useCallback } from "react";
import Login from "../components/Login";
import DetailModal from "../components/DetailModal";
import { PageProps, Order } from "../types";
import { formatItemCode } from "../lib/catalog";

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const pct = (n: number) => (Number(n) || 0).toFixed(1) + "%";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProfitRow {
  id: string;
  orderCode: string;
  date: string;
  productName: string;
  storeName: string;
  rawQuantity: number;
  returnedQty: number;
  refundedQty: number;
  chargeableQty: number;
  sellingPrice: number;
  grossRevenue: number;
  totalDeductions: number;
  commissionAmount: number;
  adminTake: number;
  costOfGoods: number;
  netProfit: number;
  profitMargin: number;
  category: "high" | "low" | "loss" | "zero";
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type TabKey = "all" | "high" | "low" | "loss";

const TAB_LABELS: Record<TabKey, string> = {
  all: "All",
  high: "High Margin",
  low: "Low Margin",
  loss: "Loss",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-block", background: `${color}18`, color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function ProfitBadge({ margin }: { margin: number }) {
  if (margin >= 30) return <Badge label={pct(margin)} color="#15803d" />;
  if (margin < 0) return <Badge label={pct(margin)} color="#dc2626" />;
  if (margin < 10) return <Badge label={pct(margin)} color="#d97706" />;
  return <Badge label={pct(margin)} color="#6366f1" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfitPage({ user, onLogin }: PageProps) {
  const [rows, setRows] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [storeFilter, setStoreFilter] = useState("All");
  const [sortKey, setSortKey] = useState<keyof ProfitRow>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailRow, setDetailRow] = useState<any | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      const json = await res.json();
      const orders: any[] = json.orders || [];

      const built: ProfitRow[] = [];

      for (const o of orders) {
        const soldQty        = Number(o.quantity) || 0;
        const returnedQty    = Math.min(Number(o.returnQuantity) || 0, soldQty);
        const refundedQty    = Math.min(Number(o.refundQuantity) || 0, soldQty - returnedQty);
        const chargeableQty  = soldQty - returnedQty - refundedQty;

        if (chargeableQty <= 0) continue;

        const sellingPrice   = Number(o.sellingPrice) || 0;
        const grossRevenue   = sellingPrice * chargeableQty;
        const deductions     = Number(o.shipmentCost) || 0;
        const commissionAmt  = Number(o.commissionAmount) || 0;
        const adminTake      = grossRevenue - deductions - commissionAmt;
        const costPrice      = Number(o.costPrice) || 0;
        const costOfGoods    = costPrice * chargeableQty;
        const netProfit      = adminTake - costOfGoods;
        const profitMargin   = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

        let category: ProfitRow["category"] = "zero";
        if (netProfit < 0) category = "loss";
        else if (profitMargin >= 30) category = "high";
        else if (profitMargin < 10) category = "low";
        else category = "zero";

        built.push({
          id: `${o.id}-profit`,
          orderCode: o.orderCode || "—",
          date: o.date,
          productName: o.productName,
          storeName: o.storeName,
          rawQuantity: soldQty,
          returnedQty,
          refundedQty,
          chargeableQty,
          sellingPrice,
          grossRevenue,
          totalDeductions: deductions,
          commissionAmount: commissionAmt,
          adminTake,
          costOfGoods,
          netProfit,
          profitMargin,
          category,
        });
      }

      setRows(built);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  if (!user) return <Login onLogin={onLogin!} />;

  // ── Derived lists
  const stores = ["All", ...Array.from(new Set(rows.map(r => r.storeName).filter(Boolean))).sort()];

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || r.productName.toLowerCase().includes(q)
      || r.storeName.toLowerCase().includes(q)
      || r.orderCode.toLowerCase().includes(q);
    const matchTab = tab === "all"
      || (tab === "high" && r.category === "high")
      || (tab === "low"  && r.category === "low")
      || (tab === "loss" && r.category === "loss");
    const matchStore = storeFilter === "All" || r.storeName === storeFilter;
    return matchSearch && matchTab && matchStore;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = (a as any)[sortKey] ?? "";
    const vb = (b as any)[sortKey] ?? "";
    if (typeof va === "number") return sortDir === "asc" ? va - vb : vb - va;
    return sortDir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });

  const toggleSort = (key: keyof ProfitRow) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  // ── Summary totals (from ALL rows, not filtered)
  const totalRevenue      = rows.reduce((s, r) => s + r.grossRevenue, 0);
  const totalDeductions   = rows.reduce((s, r) => s + r.totalDeductions, 0);
  const totalCommission   = rows.reduce((s, r) => s + r.commissionAmount, 0);
  const totalCOGS         = rows.reduce((s, r) => s + r.costOfGoods, 0);
  const totalProfit       = rows.reduce((s, r) => s + r.netProfit, 0);
  const overallMargin     = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // ── Filtered totals
  const filteredRevenue   = sorted.reduce((s, r) => s + r.grossRevenue, 0);
  const filteredProfit    = sorted.reduce((s, r) => s + r.netProfit, 0);

  const SortIcon = ({ k }: { k: keyof ProfitRow }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === k ? 1 : 0.3, fontSize: 10 }}>
      {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const TH: React.CSSProperties = {
    padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
    color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em",
    whiteSpace: "nowrap", background: "var(--surface-2)", cursor: "pointer", userSelect: "none",
  };
  const TD: React.CSSProperties = {
    padding: "12px 14px", fontSize: 13, color: "var(--text-body)",
    verticalAlign: "middle", borderBottom: "1px solid var(--border)",
  };
  const TDNum: React.CSSProperties = { ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Profit Analysis</h1>
        </div>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
          Detailed breakdown of revenue, costs, and net profit across all orders
        </p>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Revenue",      value: Rs(totalRevenue),    color: "#6366f1", bg: "#eef2ff" },
          { label: "Deductions",         value: Rs(totalDeductions), color: "#d97706", bg: "#fff7ed" },
          { label: "Commissions",        value: Rs(totalCommission), color: "#7c3aed", bg: "#fdf4ff" },
          { label: "COGS",               value: Rs(totalCOGS),       color: "#1d4ed8", bg: "#eff6ff" },
          { label: "Net Profit",         value: Rs(totalProfit),     color: totalProfit >= 0 ? "var(--success)" : "#dc2626", bg: totalProfit >= 0 ? "rgba(16,185,129,0.08)" : "rgba(220,38,38,0.08)" },
          { label: "Profit Margin",      value: pct(overallMargin),  color: overallMargin >= 30 ? "var(--success)" : overallMargin >= 0 ? "#d97706" : "#dc2626", bg: "var(--surface-2)" },
        ].map(c => (
          <div key={c.label} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "16px 18px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Proportion Bar ── */}
      {totalRevenue > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "14px 18px", marginBottom: 20, boxShadow: "var(--shadow-xs)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Revenue Breakdown</div>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 10, background: "var(--surface-2)" }}>
            {totalProfit > 0      && <div style={{ width: `${Math.max((totalProfit / totalRevenue * 100), 1).toFixed(1)}%`, background: "#10b981", transition: "width 0.3s" }} title={`Profit: ${Rs(totalProfit)}`} />}
            {totalCommission > 0  && <div style={{ width: `${(totalCommission / totalRevenue * 100).toFixed(1)}%`, background: "#a855f7", transition: "width 0.3s" }} title={`Commission: ${Rs(totalCommission)}`} />}
            {totalDeductions > 0  && <div style={{ width: `${(totalDeductions / totalRevenue * 100).toFixed(1)}%`, background: "#d97706", transition: "width 0.3s" }} title={`Deductions: ${Rs(totalDeductions)}`} />}
            {totalCOGS > 0        && <div style={{ width: `${(totalCOGS / totalRevenue * 100).toFixed(1)}%`, background: "#3b82f6", transition: "width 0.3s" }} title={`COGS: ${Rs(totalCOGS)}`} />}
            {totalProfit < 0      && <div style={{ width: `${Math.abs(totalProfit / totalRevenue * 100).toFixed(1)}%`, background: "#dc2626", transition: "width 0.3s" }} title={`Loss: ${Rs(Math.abs(totalProfit))}`} />}
          </div>
          <div style={{ display: "flex", gap: "6px 18px", marginTop: 8, flexWrap: "wrap" }}>
            {[
              { label: "Net Profit",  val: totalProfit,     color: totalProfit >= 0 ? "#10b981" : "#dc2626" },
              { label: "Commissions", val: totalCommission, color: "#a855f7" },
              { label: "Deductions",  val: totalDeductions, color: "#d97706" },
              { label: "COGS",        val: totalCOGS,       color: "#3b82f6" },
            ].filter(x => x.val > 0).map(x => (
              <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: x.color }} />
                <span style={{ fontWeight: 600, color: "var(--text-body)" }}>{x.label}</span>
                <span style={{ color: "var(--text-muted)" }}>{Rs(x.val)} ({(Math.abs(x.val) / totalRevenue * 100).toFixed(0)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs + Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {/* Type tabs */}
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--radius)", padding: 3, gap: 2 }}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", borderRadius: 7, transition: "var(--trans)",
              background: tab === t ? "var(--surface)" : "transparent",
              color:      tab === t ? "var(--acc)"     : "var(--text-muted)",
              boxShadow:  tab === t ? "var(--shadow-xs)" : "none",
            }}>{TAB_LABELS[t]}</button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, store, order code…"
            style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, background: "var(--surface)", outline: "none", color: "var(--text-body)" }} />
        </div>

        {/* Store filter */}
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, background: "var(--surface)", color: "var(--text-body)", cursor: "pointer" }}>
          {stores.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Loading profit data…</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.35 }}>
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            <div style={{ fontSize: 14 }}>No profit rows match the current filters.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="desktop-table-view" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {([
                    { label: "Date",        key: "date"            },
                    { label: "Code",        key: "orderCode"       },
                    { label: "Product",     key: "productName"     },
                    { label: "Item ID",     key: null              },
                    { label: "Store",       key: "storeName"       },
                    { label: "Sold",        key: "rawQuantity"     },
                    { label: "Ret",         key: "returnedQty"     },
                    { label: "Refd",        key: "refundedQty"     },
                    { label: "Chrg",        key: "chargeableQty"   },
                    { label: "Sell Price",  key: "sellingPrice"    },
                    { label: "Revenue",     key: "grossRevenue"    },
                    { label: "Deductions",  key: "totalDeductions" },
                    { label: "Commission",  key: "commissionAmount"},
                    { label: "Admin Take",  key: "adminTake"       },
                    { label: "COGS",        key: "costOfGoods"     },
                    { label: "Net Profit",  key: "netProfit"       },
                    { label: "Margin",      key: "profitMargin"    },
                    { label: "",            key: null              },
                  ] as { label: string; key: keyof ProfitRow | null }[]).map(col => (
                    <th key={col.label} style={TH} onClick={() => col.key && toggleSort(col.key)}>
                      {col.label}
                      {col.key && <SortIcon k={col.key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={r.id}
                    style={{ background: i % 2 === 1 ? "var(--surface-2)" : "var(--surface)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--acc-soft)")}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? "var(--surface-2)" : "var(--surface)")}
                  >
                    <td style={TD}><span style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(r.date)}</span></td>
                    <td style={TD}><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--text-muted)" }}>{r.orderCode}</span></td>
                    <td style={TD}><span style={{ fontWeight: 600, color: "var(--text-head)" }}>{r.productName}</span></td>
                    <td style={TD}><span className="muted" style={{fontWeight:600, fontFamily:'monospace', fontSize:11}}>{formatItemCode((r as any).batchNumber || (r as any).id)}</span></td>
                    <td style={TD}><span style={{ color: "var(--acc)", fontWeight: 600 }}>{r.storeName}</span></td>
                    <td style={{ ...TD, textAlign: "center", fontWeight: 600 }}>{r.rawQuantity}</td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      {r.returnedQty > 0
                        ? <span style={{ color: "var(--warning)", fontWeight: 700 }}>{r.returnedQty}</span>
                        : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      {r.refundedQty > 0
                        ? <span style={{ color: "var(--danger)", fontWeight: 700 }}>{r.refundedQty}</span>
                        : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td style={{ ...TD, textAlign: "center", fontWeight: 700 }}>{r.chargeableQty}</td>
                    <td style={TDNum}>{Rs(r.sellingPrice)}</td>
                    <td style={{ ...TDNum, fontWeight: 600, color: "#6366f1" }}>{Rs(r.grossRevenue)}</td>
                    <td style={{ ...TDNum, color: "var(--text-muted)" }}>{r.totalDeductions > 0 ? `-${Rs(r.totalDeductions)}` : "—"}</td>
                    <td style={{ ...TDNum, color: "#7c3aed" }}>{r.commissionAmount > 0 ? `-${Rs(r.commissionAmount)}` : "—"}</td>
                    <td style={{ ...TDNum, fontWeight: 600 }}>{Rs(r.adminTake)}</td>
                    <td style={{ ...TDNum, color: "#1d4ed8" }}>{`-${Rs(r.costOfGoods)}`}</td>
                    <td style={{ ...TDNum, fontWeight: 800, color: r.netProfit >= 0 ? "var(--success)" : "var(--danger)" }}>{r.netProfit >= 0 ? Rs(r.netProfit) : `-${Rs(Math.abs(r.netProfit))}`}</td>
                    <td style={{ ...TD, textAlign: "right" }}><ProfitBadge margin={r.profitMargin} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailRow(r)}>Detail</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface-2)", borderTop: "2px solid var(--border-2)" }}>
                  <td colSpan={4} style={{ ...TD, fontWeight: 700, fontSize: 13, color: "var(--text-head)", borderBottom: "none" }}>
                    Total ({sorted.length} row{sorted.length !== 1 ? "s" : ""}{tab !== "all" ? ` · ${TAB_LABELS[tab]}` : ""}{storeFilter !== "All" ? ` · ${storeFilter}` : ""})
                  </td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, borderBottom: "none" }}>{sorted.reduce((s, r) => s + r.rawQuantity, 0)}</td>
                  <td style={{ ...TD, textAlign: "center", borderBottom: "none" }}>{sorted.reduce((s, r) => s + r.returnedQty, 0) || "—"}</td>
                  <td style={{ ...TD, textAlign: "center", borderBottom: "none" }}>{sorted.reduce((s, r) => s + r.refundedQty, 0) || "—"}</td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, borderBottom: "none" }}>{sorted.reduce((s, r) => s + r.chargeableQty, 0)}</td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TDNum, fontWeight: 800, color: "#6366f1", borderBottom: "none" }}>{Rs(filteredRevenue)}</td>
                  <td style={{ ...TDNum, fontWeight: 600, borderBottom: "none" }}>{Rs(sorted.reduce((s, r) => s + r.totalDeductions, 0))}</td>
                  <td style={{ ...TDNum, borderBottom: "none" }}>{Rs(sorted.reduce((s, r) => s + r.commissionAmount, 0))}</td>
                  <td style={{ ...TDNum, fontWeight: 700, borderBottom: "none" }}>{Rs(sorted.reduce((s, r) => s + r.adminTake, 0))}</td>
                  <td style={{ ...TDNum, borderBottom: "none" }}>{Rs(sorted.reduce((s, r) => s + r.costOfGoods, 0))}</td>
                  <td style={{ ...TDNum, fontWeight: 900, fontSize: 15, color: filteredProfit >= 0 ? "var(--success)" : "var(--danger)", borderBottom: "none" }}>{filteredProfit >= 0 ? Rs(filteredProfit) : `-${Rs(Math.abs(filteredProfit))}`}</td>
                  <td style={{ ...TD, textAlign: "right", borderBottom: "none" }}>
                    <ProfitBadge margin={filteredRevenue > 0 ? (filteredProfit / filteredRevenue) * 100 : 0} />
                  </td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                </tr>
              </tfoot>
              </table>
              {/* ── Mobile card view ── */}
              <div className="mobile-card-view">
                {sorted.map((r, i) => (
                  <div className="mobile-card" key={r.id}>
                    <div className="mobile-card-header">
                      <span className="mobile-card-title">{r.productName}</span>
                      <ProfitBadge margin={r.profitMargin} />
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Date</span>
                      <span className="mobile-card-value" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(r.date)}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Order Code</span>
                      <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.orderCode}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Store</span>
                      <span className="mobile-card-value" style={{ color: 'var(--acc)' }}>{r.storeName}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
                      <div style={{ padding: '4px 0' }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Sold</span><div style={{ fontWeight: 700, fontSize: 13 }}>{r.rawQuantity}</div></div>
                      <div style={{ padding: '4px 0', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Chargeable</span><div style={{ fontWeight: 700, fontSize: 13 }}>{r.chargeableQty}</div></div>
                      <div style={{ padding: '4px 0' }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Revenue</span><div style={{ fontWeight: 700, fontSize: 13, color: '#6366f1' }}>{Rs(r.grossRevenue)}</div></div>
                      <div style={{ padding: '4px 0', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Net Profit</span><div style={{ fontWeight: 800, fontSize: 13, color: r.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{r.netProfit >= 0 ? Rs(r.netProfit) : `-${Rs(Math.abs(r.netProfit))}`}</div></div>
                    </div>
                    {(r.returnedQty > 0 || r.refundedQty > 0) && (
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Returns / Refunds</span>
                        <span className="mobile-card-value" style={{ color: 'var(--warning)' }}>
                          {r.returnedQty > 0 && `↩ ${r.returnedQty}`}{r.returnedQty > 0 && r.refundedQty > 0 && ' · '}{r.refundedQty > 0 && `💸 ${r.refundedQty}`}
                        </span>
                      </div>
                    )}
                    <div className="mobile-card-actions">
                      <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailRow(r)}>Detail</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
        )}
      </div>

      <DetailModal
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `Profit Details — ${detailRow.productName || detailRow.id}` : undefined}
        data={detailRow || {}}
      />
    </div>
  );
}