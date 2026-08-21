import { useEffect, useState, useCallback } from "react";
import Login from "../components/Login";
import DetailModal from "../components/DetailModal";
import { PageProps, Expense } from "../types";
import ContextHelp from "../components/ContextHelp";

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExpenseRow {
  id: string;
  orderCode: string;
  date: string;
  productName: string;
  storeName: string;
  quantity: number;          // chargeable qty (after subtracting returns)
  rawQuantity: number;       // original sold qty
  returnedQty: number;
  type: "COGS" | "Commission" | "Shipment" | "BusinessExpense";
  unitCost: number;
  total: number;
  detail: string;            // e.g. "2 units × Rs 200" or "10% on 2 units"
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type TabKey = "all" | "cogs" | "commission" | "shipment" | "business";

const TAB_LABELS: Record<TabKey, string> = {
  all: "All",
  cogs: "COGS",
  commission: "Commission",
  shipment: "Shipment",
  business: "Business",
};

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  COGS:            { bg: "#eff6ff", color: "#1d4ed8" },
  Commission:      { bg: "#fdf4ff", color: "#7c3aed" },
  Shipment:        { bg: "#f0fdf4", color: "#15803d" },
  BusinessExpense: { bg: "#fff7ed", color: "#d97706" },
};

function Badge({ label }: { label: string }) {
  const s = TYPE_STYLE[label] || { bg: "var(--surface-2)", color: "var(--text-muted)" };
  return (
    <span style={{ display: "inline-block", background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExpensesPage({ user, onLogin }: PageProps) {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [storeFilter, setStoreFilter] = useState("All");
  const [sortKey, setSortKey] = useState<keyof ExpenseRow>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailRow, setDetailRow] = useState<any | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, expensesRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/expenses"),
      ]);
      const ordersJson = await ordersRes.json();
      const expensesJson = await expensesRes.json();
      const orders: any[] = ordersJson.orders || [];
      const expenses: Expense[] = expensesJson.expenses || [];

      const built: ExpenseRow[] = [];

      for (const o of orders) {
        const soldQty     = Number(o.quantity) || 0;
        const returnedQty = Math.min(Number(o.returnQuantity) || 0, soldQty);
        const chargeableQty = soldQty - returnedQty;

        // ── COGS row (only if items not fully returned)
        if (chargeableQty > 0 && (o.costPrice || 0) > 0) {
          built.push({
            id: `${o.id}-cogs`,
            orderCode: o.orderCode || "—",
            date: o.date,
            productName: o.productName,
            storeName: o.storeName,
            quantity: chargeableQty,
            rawQuantity: soldQty,
            returnedQty,
            type: "COGS",
            unitCost: o.costPrice,
            total: chargeableQty * o.costPrice,
            detail: `${chargeableQty} unit${chargeableQty !== 1 ? "s" : ""} × ${Rs(o.costPrice)}`,
          });
        }

        // ── Commission row
        if ((o.commissionAmount || 0) > 0) {
          built.push({
            id: `${o.id}-comm`,
            orderCode: o.orderCode || "—",
            date: o.date,
            productName: o.productName,
            storeName: o.storeName,
            quantity: chargeableQty,
            rawQuantity: soldQty,
            returnedQty,
            type: "Commission",
            unitCost: o.commissionAmount / (soldQty || 1),
            total: o.commissionAmount,
            detail: `${o.commissionPercent}% on ${soldQty} unit${soldQty !== 1 ? "s" : ""}`,
          });
        }

        // ── Shipment row
        if ((o.shipmentCost || 0) > 0) {
          built.push({
            id: `${o.id}-ship`,
            orderCode: o.orderCode || "—",
            date: o.date,
            productName: o.productName,
            storeName: o.storeName,
            quantity: soldQty,
            rawQuantity: soldQty,
            returnedQty,
            type: "Shipment",
            unitCost: o.shipmentCost,
            total: o.shipmentCost,
            detail: `Flat shipment charge`,
          });
        }
      }

      // ── Business Expense rows (from the expenses table)
      for (const e of expenses) {
        built.push({
          id: `biz-${e.id}`,
          orderCode: "—",
          date: e.expense_date || e.created_at || "",
          productName: e.title,
          storeName: e.from_acc || "—",
          quantity: 0,
          rawQuantity: 0,
          returnedQty: 0,
          type: "BusinessExpense",
          unitCost: Number(e.amount) || 0,
          total: Number(e.amount) || 0,
          detail: e.category ? `Category: ${e.category}` : "Operational expense",
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
      || r.orderCode.toLowerCase().includes(q)
      || r.detail.toLowerCase().includes(q);
    const matchTab   = tab === "all" || (tab === "business" ? r.type === "BusinessExpense" : r.type.toLowerCase() === tab);
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

  const toggleSort = (key: keyof ExpenseRow) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  // ── Summary totals (from ALL rows, not filtered)
  const totalCOGS           = rows.filter(r => r.type === "COGS").reduce((s, r) => s + r.total, 0);
  const totalCommission     = rows.filter(r => r.type === "Commission").reduce((s, r) => s + r.total, 0);
  const totalShipment       = rows.filter(r => r.type === "Shipment").reduce((s, r) => s + r.total, 0);
  const totalBusinessExp    = rows.filter(r => r.type === "BusinessExpense").reduce((s, r) => s + r.total, 0);
  const grandTotal          = totalCOGS + totalCommission + totalShipment + totalBusinessExp;

  // ── Filtered total
  const filteredTotal   = sorted.reduce((s, r) => s + r.total, 0);

  const SortIcon = ({ k }: { k: keyof ExpenseRow }) => (
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

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1300, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--danger-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/>
              <line x1="2" x2="2.01" y1="20" y2="20"/>
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Expenses</h1>
          <ContextHelp id="expenses.page" />
        </div>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
          All costs derived from orders — COGS, store commissions, and shipment charges
        </p>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Grand Total",        value: Rs(grandTotal),        color: "var(--danger)",    bg: "var(--danger-soft)" },
          { label: "COGS",               value: Rs(totalCOGS),         color: "#1d4ed8",          bg: "#eff6ff" },
          { label: "Commissions",        value: Rs(totalCommission),   color: "#7c3aed",          bg: "#fdf4ff" },
          { label: "Shipment",           value: Rs(totalShipment),     color: "var(--success)",   bg: "var(--success-soft)" },
          { label: "Business Expenses",  value: Rs(totalBusinessExp),  color: "#d97706",          bg: "#fff7ed" },
        ].map(c => (
          <div key={c.label} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "18px 20px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Proportion Bar ── */}
      {grandTotal > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "14px 18px", marginBottom: 20, boxShadow: "var(--shadow-xs)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Breakdown</div>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 10, background: "var(--surface-2)" }}>
            {totalCOGS > 0        && <div style={{ width: `${(totalCOGS / grandTotal * 100).toFixed(1)}%`,        background: "#3b82f6", transition: "width 0.3s" }} title={`COGS: ${Rs(totalCOGS)}`} />}
            {totalCommission > 0  && <div style={{ width: `${(totalCommission / grandTotal * 100).toFixed(1)}%`,  background: "#a855f7", transition: "width 0.3s" }} title={`Commission: ${Rs(totalCommission)}`} />}
            {totalShipment > 0    && <div style={{ width: `${(totalShipment / grandTotal * 100).toFixed(1)}%`,    background: "#10b981", transition: "width 0.3s" }} title={`Shipment: ${Rs(totalShipment)}`} />}
            {totalBusinessExp > 0 && <div style={{ width: `${(totalBusinessExp / grandTotal * 100).toFixed(1)}%`, background: "#d97706", transition: "width 0.3s" }} title={`Business: ${Rs(totalBusinessExp)}`} />}
          </div>
          <div style={{ display: "flex", gap: "6px 18px", marginTop: 8, flexWrap: "wrap" }}>
            {[
              { label: "COGS",       val: totalCOGS,       color: "#3b82f6" },
              { label: "Commission", val: totalCommission, color: "#a855f7" },
              { label: "Shipment",   val: totalShipment,   color: "#10b981" },
              { label: "Business",   val: totalBusinessExp, color: "#d97706" },
            ].filter(x => x.val > 0).map(x => (
              <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: x.color }} />
                <span style={{ fontWeight: 600, color: "var(--text-body)" }}>{x.label}</span>
                <span style={{ color: "var(--text-muted)" }}>{Rs(x.val)} ({(x.val / grandTotal * 100).toFixed(0)}%)</span>
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
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Loading expenses…</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.35 }}>
              <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" x2="2.01" y1="20" y2="20"/>
            </svg>
            <div style={{ fontSize: 14 }}>No expense rows match the current filters.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="desktop-table-view" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {([
                    { label: "Date",        key: "date"        },
                    { label: "Code",  key: "orderCode"   },
                    { label: "Product",     key: "productName" },
                    { label: "Store",       key: "storeName"   },
                    { label: "Type",        key: "type"        },
                    { label: "Detail",      key: null          },
                    { label: "Qty Sold",    key: "rawQuantity" },
                    { label: "Returned",    key: "returnedQty" },
                    { label: "Chargeable",  key: "quantity"    },
                    { label: "Amount",      key: "total"       },
                    { label: "",            key: null          },
                  ] as { label: string; key: keyof ExpenseRow | null }[]).map(col => (
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
                    <td style={TD}><span style={{ color: "var(--acc)", fontWeight: 600 }}>{r.storeName}</span></td>
                    <td style={TD}><Badge label={r.type} /></td>
                    <td style={{ ...TD, color: "var(--text-muted)", fontSize: 12 }}>{r.detail}</td>
                    <td style={{ ...TD, textAlign: "center", fontWeight: 600 }}>{r.rawQuantity}</td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      {r.returnedQty > 0
                        ? <span style={{ color: "var(--warning)", fontWeight: 700 }}>-{r.returnedQty}</span>
                        : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td style={{ ...TD, textAlign: "center", fontWeight: 700 }}>{r.quantity}</td>
                    <td style={{ ...TD, fontWeight: 800, color: "var(--danger)", whiteSpace: "nowrap" }}>-{Rs(r.total)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailRow(r)}>Detail</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface-2)", borderTop: "2px solid var(--border-2)" }}>
                  <td colSpan={10} style={{ ...TD, fontWeight: 700, fontSize: 13, color: "var(--text-head)", borderBottom: "none" }}>
                    Total ({sorted.length} row{sorted.length !== 1 ? "s" : ""}{tab !== "all" ? ` · ${TAB_LABELS[tab]}` : ""}{storeFilter !== "All" ? ` · ${storeFilter}` : ""})
                  </td>
                  <td style={{ ...TD, fontWeight: 800, fontSize: 15, color: "var(--danger)", whiteSpace: "nowrap", borderBottom: "none" }}>
                    -{Rs(filteredTotal)}
                  </td>
                </tr>
              </tfoot>
              </table>
              {/* ── Mobile card view ── */}
              <div className="mobile-card-view">
                {sorted.map((r, i) => (
                  <div className="mobile-card" key={r.id}>
                    <div className="mobile-card-header">
                      <span className="mobile-card-title">{r.productName}</span>
                      <Badge label={r.type} />
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
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Detail</span>
                      <span className="mobile-card-value text-muted" style={{ fontSize: 12 }}>{r.detail}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
                      <div style={{ padding: '4px 0' }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Sold</span><div style={{ fontWeight: 700, fontSize: 13 }}>{r.rawQuantity}</div></div>
                      <div style={{ padding: '4px 0', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Chargeable</span><div style={{ fontWeight: 700, fontSize: 13 }}>{r.quantity}</div></div>
                      <div style={{ padding: '4px 0' }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Returned</span><div style={{ fontWeight: 700, fontSize: 13, color: r.returnedQty > 0 ? 'var(--warning)' : 'inherit' }}>{r.returnedQty > 0 ? `-${r.returnedQty}` : '—'}</div></div>
                      <div style={{ padding: '4px 0', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Amount</span><div style={{ fontWeight: 800, fontSize: 13, color: 'var(--danger)' }}>-{Rs(r.total)}</div></div>
                    </div>
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
        title={detailRow ? `Expense Details — ${detailRow.productName || detailRow.id}` : undefined}
        data={detailRow || {}}
      />
    </div>
  );
}
