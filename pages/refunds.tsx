import { useEffect, useState, useCallback } from "react";
import Login from "../components/Login";
import DetailModal from "../components/DetailModal";
import { PageProps } from "../types";

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

interface RefundOrder {
  id: string;
  orderCode?: string;
  productName: string;
  storeName: string;
  clientName: string;
  date: string;
  refundedAt: string | null;
  quantity: number;
  refundQuantity: number;
  refundAmount: number;
  refundReason: string | null;
  refundProofUrl?: string | null;
  sellingPrice: number;
  costPrice: number;
  refundVariantQuantities?: Record<string, Record<string, number>> | null;
  refundSizeQuantities?: Record<string, number> | null;
  refundColorQuantities?: Record<string, number> | null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.4 }}>
        <path d="M12 22V12M3.5 6l8.5 5 8.5-5M2 12.05A9 9 0 0 0 9.95 20"/>
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
        <span key={i} style={{ background: "var(--acc-soft)", color: "var(--acc)", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(99,102,241,0.2)" }}>{p}</span>
      ))}
    </div>
  );
}

export default function RefundsPage({ user, onLogin, onLogout }: PageProps) {
  const [orders, setOrders] = useState<RefundOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("All");
  const [sortKey, setSortKey] = useState<"refundedAt" | "productName" | "refundQuantity" | "refundAmount" | "storeName">("refundedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailRow, setDetailRow] = useState<any | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      const json = await res.json();
      const refunded: RefundOrder[] = (json.orders || [])
        .filter((o: any) => o.refundQuantity && o.refundQuantity > 0)
        .map((o: any) => ({
          id: o.id,
          orderCode: o.orderCode,
          productName: o.productName,
          storeName: o.storeName,
          clientName: o.clientName,
          date: o.date,
          refundedAt: o.refundedAt,
          quantity: o.quantity,
          refundQuantity: o.refundQuantity || 0,
          refundAmount: o.refundAmount || 0,
          refundReason: o.refundReason,
          refundProofUrl: o.refundProofUrl || null,
          sellingPrice: o.sellingPrice,
          costPrice: o.costPrice,
          refundVariantQuantities: o.refundVariantQuantities,
          refundSizeQuantities: o.refundSizeQuantities,
          refundColorQuantities: o.refundColorQuantities,
        }));
      setOrders(refunded);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) fetchOrders(); }, [user, fetchOrders]);

  if (!user) return <Login onLogin={onLogin!} />;

  const stores = ["All", ...Array.from(new Set(orders.map(o => o.storeName).filter(Boolean)))];

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.productName.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q) || (o.orderCode || "").toLowerCase().includes(q) || (o.refundReason || "").toLowerCase().includes(q);
    const matchStore = storeFilter === "All" || o.storeName === storeFilter;
    return matchSearch && matchStore;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: any = a[sortKey] ?? "";
    let vb: any = b[sortKey] ?? "";
    if (typeof va === "string") {
      return sortDir === "asc" ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
    }
    return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const totalRefundQty = sorted.reduce((s, o) => s + o.refundQuantity, 0);
  const totalRefundAmt = sorted.reduce((s, o) => s + o.refundAmount, 0);
  const totalCOGSLost = sorted.reduce((s, o) => s + o.refundQuantity * o.costPrice, 0);

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === k ? 1 : 0.3, fontSize: 10 }}>
      {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const TH: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", background: "var(--surface-2)", cursor: "pointer", userSelect: "none" };
  const TD: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: "var(--text-body)", verticalAlign: "top", borderBottom: "1px solid var(--border)" };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1300, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--acc-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--acc)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12"/><path d="m9 5 3-3 3 3"/><path d="M3 7h18"/><path d="M5 7c0 7.73 6 11 7 11s7-3.27 7-11"/></svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Refunds</h1>
        </div>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>Orders where money was refunded (item kept by customer)</p>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Refunded Units", value: `${totalRefundQty} units`, color: "var(--acc)", bg: "var(--acc-soft)" },
          { label: "Total Refund Amount", value: Rs(totalRefundAmt), color: "var(--danger)", bg: "var(--danger-soft)" },
          { label: "COGS Lost", value: Rs(totalCOGSLost), color: "var(--warning)", bg: "var(--warning-soft)" },
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
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading refunds…</div>
        ) : sorted.length === 0 ? (
          <EmptyState message="No refunded orders found." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    { label: "Order Code", key: null },
                    { label: "Product", key: "productName" },
                    { label: "Store", key: "storeName" },
                    { label: "Client", key: null },
                    { label: "Sale Date", key: null },
                    { label: "Refunded On", key: "refundedAt" },
                    { label: "Qty Sold", key: null },
                    { label: "Qty Refunded", key: "refundQuantity" },
                    { label: "Variants", key: null },
                    { label: "Selling Price", key: null },
                    { label: "Refund Amount", key: "refundAmount" },
                    { label: "COGS Lost", key: null },
                    { label: "Refund Reason", key: null },
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
                  const isFullRefund = o.refundQuantity >= o.quantity;
                  return (
                    <tr key={o.id} style={{ background: i % 2 === 1 ? "var(--surface-2)" : "var(--surface)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--acc-soft)")}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 1 ? "var(--surface-2)" : "var(--surface)")}
                    >
                      <td style={TD}><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--text-muted)" }}>{o.orderCode || "—"}</span></td>
                      <td style={TD}><span style={{ fontWeight: 600, color: "var(--text-head)" }}>{o.productName}</span></td>
                      <td style={TD}><span style={{ color: "var(--acc)", fontWeight: 600 }}>{o.storeName}</span></td>
                      <td style={TD}>{o.clientName || "—"}</td>
                      <td style={TD}><span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtDate(o.date)}</span></td>
                      <td style={TD}><span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{o.refundedAt ? fmtDate(o.refundedAt) : "—"}</span></td>
                      <td style={{ ...TD, textAlign: "center" }}><span style={{ fontWeight: 700 }}>{o.quantity}</span></td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        <span style={{ display: "inline-block", background: isFullRefund ? "var(--danger-soft)" : "var(--acc-soft)", color: isFullRefund ? "var(--danger)" : "var(--acc)", fontWeight: 700, fontSize: 12, padding: "3px 10px", borderRadius: 20 }}>
                          {o.refundQuantity} {isFullRefund ? "• Full" : "• Partial"}
                        </span>
                      </td>
                      <td style={TD}>
                        {o.refundVariantQuantities ? (
                          <VariantPills vq={o.refundVariantQuantities} />
                        ) : o.refundSizeQuantities ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {Object.entries(o.refundSizeQuantities).filter(([,q]) => q > 0).map(([s, q]) => (
                              <span key={s} style={{ background: "var(--acc-soft)", color: "var(--acc)", fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 20 }}>{s} ×{q}</span>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td style={TD}>{Rs(o.sellingPrice)}</td>
                      <td style={{ ...TD, fontWeight: 800, color: "var(--danger)" }}>{Rs(o.refundAmount)}</td>
                      <td style={{ ...TD, fontWeight: 600, color: "var(--warning)" }}>{Rs(o.refundQuantity * o.costPrice)}</td>
                      <td style={{ ...TD, maxWidth: 200 }}>
                        {o.refundReason ? (
                          <span style={{ display: "inline-block", background: "rgba(99,102,241,0.07)", color: "var(--acc)", fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 8, lineHeight: 1.4 }}>{o.refundReason}</span>
                        ) : <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No reason given</span>}
                      </td>
                      <td style={TD}>
                        {o.refundProofUrl ? (
                          <ProofImage src={o.refundProofUrl} />
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
                  <td style={{ ...TD, textAlign: "center", fontWeight: 800, color: "var(--danger)", borderBottom: "none" }}>{totalRefundQty}</td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, fontWeight: 800, color: "var(--danger)", borderBottom: "none" }}>{Rs(totalRefundAmt)}</td>
                  <td style={{ ...TD, fontWeight: 800, color: "var(--warning)", borderBottom: "none" }}>{Rs(totalCOGSLost)}</td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, borderBottom: "none" }} />
                  <td style={{ ...TD, borderBottom: "none" }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <DetailModal
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `Refund Details — ${detailRow.productName || detailRow.id}` : undefined}
        data={detailRow || {}}
      />
    </div>
  );
}
