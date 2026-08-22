import { useEffect, useState, useCallback } from "react";
import Login from "../components/Login";
import DetailModal from "../components/DetailModal";
import { PageProps } from "../types";
import ContextHelp from "../components/ContextHelp";
import { TableSkeleton } from "../components/Skeletons";

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

interface ReturnOrder {
  id: string;
  orderCode?: string;
  productName: string;
  storeName: string;
  clientName: string;
  date: string;
  returnedAt: string | null;
  quantity: number;
  returnQuantity: number;
  returnReason: string | null;
  returnProofUrl?: string | null;
  sellingPrice: number;
  costPrice: number;
  returnVariantQuantities?: Record<string, Record<string, number>> | null;
  returnSizeQuantities?: Record<string, number> | null;
  returnColorQuantities?: Record<string, number> | null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.4 }}>
        <path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
      </svg>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  );
}

function ProofImage({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);
  return (
    <>
      <img src={src} alt="proof" onClick={() => setOpen(true)} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer" }} />
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={src} alt="proof full" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} />
        </div>
      )}
    </>
  );
}

function VariantPills({ vq }: { vq: Record<string, Record<string, number>> }) {
  const pills: string[] = [];
  for (const [size, colors] of Object.entries(vq)) {
    for (const [color, qty] of Object.entries(colors)) {
      if (qty > 0) pills.push(`${size}/${color} ×${qty}`);
    }
  }
  if (!pills.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {pills.map((p, i) => (
        <span key={i} style={{ background: "var(--warning-soft)", color: "var(--warning)", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(217,119,6,0.2)" }}>{p}</span>
      ))}
    </div>
  );
}

export default function ReturnsPage({ user, onLogin, onLogout }: PageProps) {
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("All");
  const [sortKey, setSortKey] = useState<"returnedAt" | "productName" | "returnQuantity" | "storeName">("returnedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailRow, setDetailRow] = useState<any | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      const json = await res.json();
      const returned: ReturnOrder[] = (json.orders || [])
        .filter((o: any) => (o.returnQuantity && o.returnQuantity > 0) || o.orderReturned)
        .map((o: any) => ({
          id: o.id,
          orderCode: o.orderCode,
          productName: o.productName,
          storeName: o.storeName,
          clientName: o.clientName,
          date: o.date,
          returnedAt: o.returnedAt,
          quantity: o.quantity,
          returnQuantity: o.returnQuantity || 0,
          returnReason: o.returnReason,
          returnProofUrl: o.returnProofUrl || null,
          sellingPrice: o.sellingPrice,
          costPrice: o.costPrice,
          returnVariantQuantities: o.returnVariantQuantities,
          returnSizeQuantities: o.returnSizeQuantities,
          returnColorQuantities: o.returnColorQuantities,
        }));
      setOrders(returned);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) fetchOrders(); }, [user, fetchOrders]);

  if (!user) return <Login onLogin={onLogin!} />;

  const stores = ["All", ...Array.from(new Set(orders.map(o => o.storeName).filter(Boolean)))];

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.productName.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q) || (o.orderCode || "").toLowerCase().includes(q) || (o.returnReason || "").toLowerCase().includes(q);
    const matchStore = storeFilter === "All" || o.storeName === storeFilter;
    return matchSearch && matchStore;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: any = a[sortKey] ?? "";
    let vb: any = b[sortKey] ?? "";
    if (sortKey === "returnedAt" || sortKey === "productName" || sortKey === "storeName") {
      va = String(va); vb = String(vb);
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const totalReturned = sorted.reduce((s, o) => s + o.returnQuantity, 0);
  const totalValue = sorted.reduce((s, o) => s + o.returnQuantity * o.sellingPrice, 0);
  const totalCOGSRecovered = sorted.reduce((s, o) => s + o.returnQuantity * o.costPrice, 0);

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === k ? 1 : 0.3, fontSize: 10 }}>
      {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const TH: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", background: "var(--surface-2)", cursor: "pointer", userSelect: "none" };
  const TD: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: "var(--text-body)", verticalAlign: "top", borderBottom: "1px solid var(--border)" };

  return (
    <div className="page-shell">
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--warning-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--warning)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Returns</h1>
          <ContextHelp id="returns.page" />
        </div>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>All orders where items were returned to warehouse</p>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Returns", value: `${totalReturned} units`, color: "var(--warning)", bg: "var(--warning-soft)" },
          { label: "Gross Value Returned", value: Rs(totalValue), color: "var(--danger)", bg: "var(--danger-soft)" },
          { label: "COGS Recovered", value: Rs(totalCOGSRecovered), color: "var(--success)", bg: "var(--success-soft)" },
        ].map(c => (
          <div key={c.label} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "18px 20px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, client, reason…" style={{ width: "100%", padding: "9px 12px 9px 32px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, background: "var(--surface)", outline: "none", color: "var(--text-body)" }} />
        </div>
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, background: "var(--surface)", color: "var(--text-body)", cursor: "pointer" }}>
          {stores.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        {loading ? (
          <TableSkeleton label="Loading returns" />
        ) : sorted.length === 0 ? (
          <EmptyState message="No returned orders found." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="desktop-table-view" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    { label: "Order Code", key: null },
                    { label: "Product", key: "productName" },
                    { label: "Store", key: "storeName" },
                    { label: "Client", key: null },
                    { label: "Sale Date", key: null },
                    { label: "Returned On", key: "returnedAt" },
                    { label: "Qty Sold", key: null },
                    { label: "Qty Returned", key: "returnQuantity" },
                    { label: "Variants", key: null },
                    { label: "Selling Price", key: null },
                    { label: "Value Recovered", key: null },
                    { label: "Return Reason", key: null },
                    { label: "Proof", key: null },
                    { label: "", key: null },
                  ].map(col => (
                    <th key={col.label} style={TH} onClick={() => col.key && toggleSort(col.key as any)}>
                      {col.label}{col.key && <SortIcon k={col.key as any} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((o, i) => {
                  const isFullReturn = o.returnQuantity >= o.quantity;
                  return (
                    <tr key={o.id} style={{ background: i % 2 === 1 ? "var(--surface-2)" : "var(--surface)", transition: "background 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--acc-soft)")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? "var(--surface-2)" : "var(--surface)")}
                    >
                      <td style={TD}><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--text-muted)" }}>{o.orderCode || "—"}</span></td>
                      <td style={TD}><span style={{ fontWeight: 600, color: "var(--text-head)" }}>{o.productName}</span></td>
                      <td style={TD}><span style={{ color: "var(--acc)", fontWeight: 600 }}>{o.storeName}</span></td>
                      <td style={TD}>{o.clientName || "—"}</td>
                      <td style={TD}><span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(o.date)}</span></td>
                      <td style={TD}><span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{o.returnedAt ? fmtDate(o.returnedAt) : "—"}</span></td>
                      <td style={{ ...TD, textAlign: "center" }}><span style={{ fontWeight: 700 }}>{o.quantity}</span></td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        <span style={{ display: "inline-block", background: isFullReturn ? "var(--danger-soft)" : "var(--warning-soft)", color: isFullReturn ? "var(--danger)" : "var(--warning)", fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 20 }}>
                          {o.returnQuantity} {isFullReturn ? "• Full" : "• Partial"}
                        </span>
                      </td>
                      <td style={TD}>
                        {o.returnVariantQuantities ? (
                          <VariantPills vq={o.returnVariantQuantities} />
                        ) : o.returnSizeQuantities ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {Object.entries(o.returnSizeQuantities).filter(([,q]) => q > 0).map(([s, q]) => (
                              <span key={s} style={{ background: "var(--warning-soft)", color: "var(--warning)", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>{s} ×{q}</span>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td style={TD}>{Rs(o.sellingPrice)}</td>
                      <td style={{ ...TD, fontWeight: 700, color: "var(--success)" }}>{Rs(o.returnQuantity * o.sellingPrice)}</td>
                      <td style={{ ...TD, maxWidth: 200 }}>
                        {o.returnReason ? (
                          <span style={{ display: "inline-block", background: "rgba(220,38,38,0.07)", color: "var(--danger)", fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 8, lineHeight: 1.4 }}>{o.returnReason}</span>
                        ) : <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No reason given</span>}
                      </td>
                      <td style={TD}>
                        {o.returnProofUrl ? (
                          <ProofImage src={o.returnProofUrl} />
                        ) : <span style={{ color: "var(--text-faint)", fontStyle: "italic", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailRow(o)}>Detail</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface-2)", borderTop: "2px solid var(--border-2)" }}>
                  <td colSpan={7} style={{ ...TD, fontWeight: 700, fontSize: 13, color: "var(--text-head)", borderBottom: "none" }}>Totals ({sorted.length} order{sorted.length !== 1 ? "s" : ""})</td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 700, borderBottom: "none" }}>{sorted.reduce((s, o) => s + o.quantity, 0)}</td>
                  <td style={{ ...TD, textAlign: "center", fontWeight: 800, color: "var(--danger)", borderBottom: "none" }}>{totalReturned}</td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, fontWeight: 800, color: "var(--success)", borderBottom: "none" }}>{Rs(totalValue)}</td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, borderBottom: "none" }} />
                </tr>
              </tfoot>
              </table>
              {/* ── Mobile card view ── */}
              <div className="mobile-card-view">
                {sorted.map((o, i) => {
                  const isFullReturn = o.returnQuantity >= o.quantity;
                  return (
                    <div className="mobile-card" key={o.id}>
                      <div className="mobile-card-header">
                        <span className="mobile-card-title">{o.productName}</span>
                        <span style={{ display: 'inline-block', background: isFullReturn ? 'var(--danger-soft)' : 'var(--warning-soft)', color: isFullReturn ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, fontSize: 11, padding: '3px 10px', borderRadius: 20 }}>{o.returnQuantity} {isFullReturn ? '• Full' : '• Partial'}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Order Code</span>
                        <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 11 }}>{o.orderCode || '—'}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Store</span>
                        <span className="mobile-card-value" style={{ color: 'var(--acc)' }}>{o.storeName}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Client</span>
                        <span className="mobile-card-value">{o.clientName || '—'}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Sale Date</span>
                        <span className="mobile-card-value" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(o.date)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Returned On</span>
                        <span className="mobile-card-value" style={{ fontWeight: 600 }}>{o.returnedAt ? fmtDate(o.returnedAt) : '—'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
                        <div style={{ padding: '4px 0' }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Qty Sold</span><div style={{ fontWeight: 700, fontSize: 13 }}>{o.quantity}</div></div>
                        <div style={{ padding: '4px 0', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Qty Returned</span><div style={{ fontWeight: 700, fontSize: 13, color: 'var(--danger)' }}>{o.returnQuantity}</div></div>
                        <div style={{ padding: '4px 0' }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Price</span><div style={{ fontWeight: 700, fontSize: 13 }}>{Rs(o.sellingPrice)}</div></div>
                        <div style={{ padding: '4px 0', borderLeft: '1px solid var(--border)', paddingLeft: 8 }}><span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Value Recovered</span><div style={{ fontWeight: 800, fontSize: 13, color: 'var(--success)' }}>{Rs(o.returnQuantity * o.sellingPrice)}</div></div>
                      </div>
                      {o.returnReason && (
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">Reason</span>
                          <span className="mobile-card-value" style={{ fontSize: 12, color: 'var(--danger)', background: 'rgba(220,38,38,0.07)', padding: '4px 8px', borderRadius: 6 }}>{o.returnReason}</span>
                        </div>
                      )}
                      <div className="mobile-card-actions">
                        <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailRow(o)}>Detail</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
        )}
      </div>

      <DetailModal
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `Return Details — ${detailRow.productName || detailRow.id}` : undefined}
        data={detailRow || {}}
      />
    </div>
  );
}
