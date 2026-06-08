import { useEffect, useState, useCallback } from "react";
import Login from "../components/Login";
import { PageProps, Expense } from "../types";

const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const CATEGORIES = ["All", "Rent", "Utilities", "Salaries", "Marketing", "Supplies", "Transport", "Misc"];

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-muted)" }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.4 }}>
        <path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" x2="2.01" y1="20" y2="20"/>
      </svg>
      <div style={{ fontSize: 14 }}>No expenses found for the selected filters.</div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  Rent:       { bg: "#ede9fe", color: "#7c3aed" },
  Utilities:  { bg: "#dbeafe", color: "#1d4ed8" },
  Salaries:   { bg: "#dcfce7", color: "#15803d" },
  Marketing:  { bg: "#fef9c3", color: "#a16207" },
  Supplies:   { bg: "#ffedd5", color: "#c2410c" },
  Transport:  { bg: "#e0f2fe", color: "#0369a1" },
  Misc:       { bg: "var(--surface-2)", color: "var(--text-muted)" },
};

function CategoryBadge({ cat }: { cat: string }) {
  const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Misc;
  return <span style={{ display: "inline-block", background: c.bg, color: c.color, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{cat}</span>;
}

export default function ExpensesPage({ user, onLogin }: PageProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [sortKey, setSortKey] = useState<"expense_date" | "amount" | "title" | "category">("expense_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/expenses");
      const json = await res.json();
      setExpenses(json.expenses || []);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) fetchExpenses(); }, [user, fetchExpenses]);

  if (!user) return <Login onLogin={onLogin!} />;

  const categories = ["All", ...Array.from(new Set(expenses.map(e => e.category).filter(Boolean))).sort()];
  const types = ["All", ...Array.from(new Set(expenses.map(e => e.expense_type).filter((t): t is string => !!t))).sort()];

  const filtered = expenses.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || e.title.toLowerCase().includes(q) || (e.notes || "").toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    const matchCat = categoryFilter === "All" || e.category === categoryFilter;
    const matchType = typeFilter === "All" || e.expense_type === typeFilter;
    return matchSearch && matchCat && matchType;
  });

  const sorted = [...filtered].sort((a, b) => {
    let va: any = (a as any)[sortKey] ?? "";
    let vb: any = (b as any)[sortKey] ?? "";
    if (sortKey === "amount") return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
    va = String(va); vb = String(vb);
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const total = sorted.reduce((s, e) => s + e.amount, 0);
  const operationalTotal = sorted.filter(e => e.expense_type === "operational").reduce((s, e) => s + e.amount, 0);
  const capitalTotal = sorted.filter(e => e.expense_type === "capital").reduce((s, e) => s + e.amount, 0);

  // Category breakdown for summary
  const catBreakdown: Record<string, number> = {};
  sorted.forEach(e => { catBreakdown[e.category] = (catBreakdown[e.category] || 0) + e.amount; });
  const topCat = Object.entries(catBreakdown).sort(([,a],[,b]) => b - a)[0];

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span style={{ marginLeft: 4, opacity: sortKey === k ? 1 : 0.3, fontSize: 10 }}>
      {sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );

  const TH: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", background: "var(--surface-2)", cursor: "pointer", userSelect: "none" };
  const TD: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: "var(--text-body)", verticalAlign: "top", borderBottom: "1px solid var(--border)" };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--danger-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" x2="2.01" y1="20" y2="20"/></svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Expenses</h1>
        </div>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>All recorded business expenses</p>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Expenses", value: Rs(total), color: "var(--danger)", bg: "var(--danger-soft)" },
          { label: "Operational", value: Rs(operationalTotal), color: "var(--warning)", bg: "var(--warning-soft)" },
          { label: "Capital", value: Rs(capitalTotal), color: "var(--acc)", bg: "var(--acc-soft)" },
          { label: "Top Category", value: topCat ? topCat[0] : "—", sub: topCat ? Rs(topCat[1]) : "", color: "var(--success)", bg: "var(--success-soft)" },
        ].map(c => (
          <div key={c.label} style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "18px 20px", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Category Breakdown Bar ── */}
      {Object.keys(catBreakdown).length > 0 && total > 0 && (
        <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", padding: "16px 20px", marginBottom: 20, boxShadow: "var(--shadow-xs)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Breakdown by Category</div>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 10, background: "var(--surface-2)" }}>
            {Object.entries(catBreakdown).sort(([,a],[,b]) => b - a).map(([cat, amt], i) => {
              const colors = ["#6366f1","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#06b6d4","#84cc16"];
              return <div key={cat} title={`${cat}: ${Rs(amt)}`} style={{ width: `${(amt/total*100).toFixed(1)}%`, background: colors[i % colors.length], transition: "width 0.3s" }} />;
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
            {Object.entries(catBreakdown).sort(([,a],[,b]) => b - a).map(([cat, amt], i) => {
              const colors = ["#6366f1","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#06b6d4","#84cc16"];
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[i % colors.length], flexShrink: 0 }} />
                  <span style={{ color: "var(--text-body)", fontWeight: 600 }}>{cat}</span>
                  <span style={{ color: "var(--text-muted)" }}>{Rs(amt)} ({(amt/total*100).toFixed(0)}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, notes, category…" style={{ width: "100%", padding: "9px 12px 9px 32px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, background: "var(--surface)", outline: "none", color: "var(--text-body)" }} />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, background: "var(--surface)", color: "var(--text-body)", cursor: "pointer" }}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        {types.length > 1 && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, background: "var(--surface)", color: "var(--text-body)", cursor: "pointer" }}>
            {types.map(t => <option key={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ background: "var(--surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading expenses…</div>
        ) : sorted.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    { label: "Date", key: "expense_date" },
                    { label: "Title", key: "title" },
                    { label: "Category", key: "category" },
                    { label: "Type", key: null },
                    { label: "Paid By", key: null },
                    { label: "From Account", key: null },
                    { label: "Amount", key: "amount" },
                    { label: "Notes", key: null },
                  ].map(col => (
                    <th key={col.label} style={TH} onClick={() => col.key && toggleSort(col.key as any)}>
                      {col.label}{col.key && <SortIcon k={col.key as any} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((e, i) => (
                  <tr key={e.id} style={{ background: i % 2 === 1 ? "var(--surface-2)" : "var(--surface)" }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = "var(--acc-soft)")}
                    onMouseLeave={ev => (ev.currentTarget.style.background = i % 2 === 1 ? "var(--surface-2)" : "var(--surface)")}
                  >
                    <td style={TD}><span style={{ whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 12 }}>{fmtDate(e.expense_date)}</span></td>
                    <td style={TD}><span style={{ fontWeight: 600, color: "var(--text-head)" }}>{e.title}</span></td>
                    <td style={TD}><CategoryBadge cat={e.category || "Misc"} /></td>
                    <td style={TD}>
                      {e.expense_type ? (
                        <span style={{ display: "inline-block", background: e.expense_type === "capital" ? "var(--acc-soft)" : "var(--surface-2)", color: e.expense_type === "capital" ? "var(--acc)" : "var(--text-muted)", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, textTransform: "capitalize" }}>{e.expense_type}</span>
                      ) : "—"}
                    </td>
                    <td style={TD}>{e.paid_by_owner_name ? <span style={{ fontWeight: 600 }}>{e.paid_by_owner_name}</span> : <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>—</span>}</td>
                    <td style={TD}>{e.from_acc ? <span style={{ fontSize: 12, background: "var(--surface-2)", padding: "2px 8px", borderRadius: 6 }}>{e.from_acc}</span> : "—"}</td>
                    <td style={{ ...TD, fontWeight: 800, color: "var(--danger)", whiteSpace: "nowrap" }}>-{Rs(e.amount)}</td>
                    <td style={{ ...TD, maxWidth: 220 }}>
                      {e.notes ? (
                        <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4 }}>{e.notes}</span>
                      ) : <span style={{ color: "var(--text-faint)", fontStyle: "italic", fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface-2)", borderTop: "2px solid var(--border-2)" }}>
                  <td colSpan={6} style={{ ...TD, fontWeight: 700, fontSize: 13, color: "var(--text-head)", borderBottom: "none" }}>Total ({sorted.length} expense{sorted.length !== 1 ? "s" : ""})</td>
                  <td style={{ ...TD, fontWeight: 800, fontSize: 15, color: "var(--danger)", whiteSpace: "nowrap", borderBottom: "none" }}>-{Rs(total)}</td>
                  <td style={{ ...TD, borderBottom: "none" }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
