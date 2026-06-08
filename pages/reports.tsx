import { useState, useEffect, useCallback, useRef } from 'react';
import Login from '../components/Login';
import CustomSelect from '../components/CustomSelect';
import WeekMonthPicker from '../components/WeekMonthPicker';
import { PageProps, Order, Expense } from '../types';
import { usePopup } from '../components/Popup';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ── helpers ───────────────────────────────────────────────────────────────────
const Rs = (n: number) => 'Rs ' + Math.round(n).toLocaleString('en-PK');
const pct = (n: number) => n.toFixed(1) + '%';

function getISOWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function isInPeriod(dateStr: string, type: string, value: string): boolean {
  if (type === 'all' || !value) return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (type === 'yearly') return d.getFullYear() === parseInt(value);
  if (type === 'monthly') {
    const [yr, mo] = value.split('-');
    return d.getFullYear() === parseInt(yr) && (d.getMonth() + 1) === parseInt(mo);
  }
  if (type === 'weekly') {
    const [yr, wk] = value.split('-W');
    return d.getFullYear() === parseInt(yr) && getISOWeek(d) === parseInt(wk);
  }
  return true;
}

function groupLabel(dateStr: string, type: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (type === 'yearly' || type === 'all') {
    return d.toLocaleString('default', { month: 'short', year: '2-digit' });
  }
  if (type === 'monthly') return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
  if (type === 'weekly') return d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

// ── colour palette ─────────────────────────────────────────────────────────
const C = {
  purple: '#7c3aed', blue: '#2563eb', green: '#16a34a',
  red: '#dc2626', orange: '#ea580c', teal: '#0891b2', pink: '#db2777',
  indigo: '#4f46e5', lime: '#65a30d', amber: '#d97706',
};
const PIE_COLORS = [C.purple, C.blue, C.green, C.orange, C.teal, C.pink, C.indigo, C.amber];

// ── icons ──────────────────────────────────────────────────────────────────
const IC = {
  report: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>,
  pdf:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1v-4z"/><path d="M14 12h2"/><path d="M14 15h1.5a1 1 0 0 0 0-2H14"/></svg>,
  chart:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  filter: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  sort:   (dir: 'asc' | 'desc' | null) => dir === 'asc' ? ' ▲' : dir === 'desc' ? ' ▼' : ' ⇅',
};

// ── Google Sheets style table ───────────────────────────────────────────────
interface ColDef<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: T, i: number) => React.ReactNode;
  value?: (row: T) => number | string;  // for sorting
  hide?: boolean;
}

interface SheetTableProps<T> {
  cols: ColDef<T>[];
  rows: T[];
  totalsRow?: Partial<Record<string, React.ReactNode>>;
  maxRows?: number;
}

function SheetTable<T>({ cols, rows, totalsRow, maxRows = 500 }: SheetTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const visibleCols = cols.filter(c => !c.hide);

  const sorted = [...rows].sort((a, b) => {
    if (!sort) return 0;
    const col = cols.find(c => c.key === sort.key);
    if (!col) return 0;
    const va = col.value ? col.value(a) : (a as any)[sort.key] ?? '';
    const vb = col.value ? col.value(b) : (b as any)[sort.key] ?? '';
    if (typeof va === 'number' && typeof vb === 'number') return sort.dir === 'asc' ? va - vb : vb - va;
    return sort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  }).slice(0, maxRows);

  const toggleSort = (key: string) => {
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const th: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    background: '#f1f5f9',
    fontWeight: 700,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
    color: '#374151',
  };

  const td = (align: 'left' | 'right' | 'center' = 'left', isAlt = false): React.CSSProperties => ({
    padding: '5px 10px',
    border: '1px solid #e2e8f0',
    background: isAlt ? '#f8fafc' : '#ffffff',
    fontSize: 13,
    textAlign: align,
    whiteSpace: 'nowrap' as const,
  });

  const tfootTd = (align: 'left' | 'right' | 'center' = 'left'): React.CSSProperties => ({
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    background: '#e0e7ef',
    fontWeight: 700,
    fontSize: 13,
    textAlign: align,
  });

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #d1d5db', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
        <thead>
          <tr>
            {visibleCols.map(c => (
              <th key={c.key} style={{ ...th, textAlign: c.align || 'left' }} onClick={() => toggleSort(c.key)}>
                {c.label}{IC.sort(sort?.key === c.key ? sort.dir : null)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={visibleCols.length} style={{ ...td(), textAlign: 'center', color: '#9ca3af', padding: '24px 0' }}>No data for selected filters</td></tr>
          )}
          {sorted.map((row, i) => (
            <tr key={i}>
              {visibleCols.map(c => (
                <td key={c.key} style={td(c.align || 'left', i % 2 === 1)}>
                  {c.render ? c.render(row, i) : String((row as any)[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totalsRow && (
          <tfoot>
            <tr>
              {visibleCols.map(c => (
                <td key={c.key} style={tfootTd(c.align || 'left')}>
                  {totalsRow[c.key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length > maxRows && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: '#9ca3af', borderTop: '1px solid #e2e8f0', background: '#f9fafb' }}>
          Showing {maxRows} of {rows.length} rows (apply filters to narrow results)
        </div>
      )}
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 150, border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--surface-1)', borderTop: `3px solid ${color || '#7c3aed'}` }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || '#374151', letterSpacing: '-0.5px' }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Period picker ──────────────────────────────────────────────────────────
const YEARS = Array.from({ length: 5 }, (_, i) => {
  const y = new Date().getFullYear() - i;
  return { id: String(y), label: String(y) };
});

interface PeriodPickerProps {
  type: string; value: string;
  onTypeChange: (t: string) => void; onValueChange: (v: string) => void;
}
function PeriodPicker({ type, value, onTypeChange, onValueChange }: PeriodPickerProps) {
  const [weekDate, setWeekDate] = useState<Date | null>(null);
  const [monthDate, setMonthDate] = useState<Date | null>(null);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {['all', 'weekly', 'monthly', 'yearly'].map(t => (
        <button key={t} onClick={() => { onTypeChange(t); onValueChange(''); }}
          className={`btn btn-sm ${type === t ? 'btn-primary' : 'btn-glass'}`}
          style={{ textTransform: 'capitalize', fontSize: 12 }}>
          {t === 'all' ? 'All Time' : t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
      {type === 'weekly' && (
        <WeekMonthPicker mode="Weekly" value={weekDate}
          onChange={v => {
            const d = v ? new Date(v) : null;
            setWeekDate(d);
            if (d) onValueChange(`${d.getFullYear()}-W${getISOWeek(d).toString().padStart(2, '0')}`);
          }} />
      )}
      {type === 'monthly' && (
        <WeekMonthPicker mode="Monthly" value={monthDate}
          onChange={v => {
            const d = v ? new Date(v) : null;
            setMonthDate(d);
            if (d) onValueChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
          }} />
      )}
      {type === 'yearly' && (
        <div style={{ width: 110 }}>
          <CustomSelect value={value || String(new Date().getFullYear())}
            onChange={v => onValueChange(v)} options={YEARS} height="34px" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════

type TabKey = 0 | 1 | 2 | 3 | 4;

export default function ReportsPage({ user, onLogin }: PageProps) {
  const { toast } = usePopup();
  const printRef = useRef<HTMLDivElement>(null);

  // Determine role & scope
  const isSuperAdmin = user?.role === 'admin' && user?.scope === 'all';
  const isStoreOwner = user?.role === 'store' && !!user?.storeName;
  const myStoreName = isStoreOwner ? user!.storeName! : null;

  const [orders, setOrders] = useState<(Order & { orderCode?: string })[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [storeList, setStoreList] = useState<string[]>([]);
  const [productList, setProductList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [periodType, setPeriodType] = useState('all');
  const [periodValue, setPeriodValue] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');

  // UI state
  const [activeTab, setActiveTab] = useState<number>(0);
  const [showChart, setShowChart] = useState(true);

  // Check if store owner — force their store filter
  const effectiveStoreFilter = isStoreOwner ? myStoreName! : storeFilter;

  // Tabs based on role
  const tabs = isStoreOwner
    ? ['Summary', 'My Sales', 'My Products']
    : ['P&L Summary', 'Revenue & Sales', 'Expenses', 'Product Performance', 'Store Performance'];

  // ── fetch data ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [oRes, eRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/expenses'),
      ]);
      const [oJson, eJson] = await Promise.all([oRes.json(), eRes.json()]);
      const o: (Order & { orderCode?: string })[] = oJson.orders || [];
      const e: Expense[] = eJson.expenses || [];
      setOrders(o);
      setExpenses(e);
      setStoreList([...new Set(o.map(x => x.storeName).filter(Boolean))].sort());
      setProductList([...new Set(o.map(x => x.productName).filter(Boolean))].sort());
    } catch {
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (user) load(); }, [user, load]);

  // ── filtered sets ──────────────────────────────────────────────────────
  const filtOrders = orders.filter(o =>
    isInPeriod(o.date, periodType, periodValue) &&
    (effectiveStoreFilter === 'all' || o.storeName === effectiveStoreFilter) &&
    (productFilter === 'all' || o.productName === productFilter)
  );
  const filtExpenses = isStoreOwner ? [] : expenses.filter(e =>
    isInPeriod(e.expense_date, periodType, periodValue)
  );

  // Effective chargeable units after subtracting returned & refunded quantities
  const effectiveQty = (o: any) => {
    const soldQty = Math.max(0, Number(o.quantity) || 0);
    const returnedQty = Math.min(Math.max(0, Number(o.returnQuantity) || 0), soldQty);
    const refundedQty = Math.min(Math.max(0, Number(o.refundQuantity) || 0), soldQty - returnedQty);
    return soldQty - returnedQty - refundedQty;
  };

  // ── aggregate KPIs ─────────────────────────────────────────────────────
  const totRevenue     = filtOrders.reduce((s, o) => s + o.sellingPrice * effectiveQty(o), 0);
  const totCOGS        = filtOrders.reduce((s, o) => s + o.costPrice * effectiveQty(o), 0);
  const totCommission  = filtOrders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
  const totShipment    = filtOrders.reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const grossProfit    = totRevenue - totCOGS;
  const totExpenses    = filtExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit      = grossProfit - totExpenses;
  const avgOrderValue  = filtOrders.length ? totRevenue / filtOrders.length : 0;
  const grossMargin    = totRevenue > 0 ? (grossProfit / totRevenue) * 100 : 0;

  // For store owners: profit = revenue minus commission & shipment (the store's net)
  const storeProfit = filtOrders.reduce((s, o) => {
    // Profit from the order as stored (commission already deducted in profit field)
    return s + (o.profit || 0);
  }, 0);

  // ── trend data (by label) ──────────────────────────────────────────────
  const trendMap: Record<string, { label: string; revenue: number; cogs: number; expenses: number; profit: number }> = {};
  filtOrders.forEach(o => {
    const l = groupLabel(o.date, periodType);
    const eQty = effectiveQty(o);
    if (!trendMap[l]) trendMap[l] = { label: l, revenue: 0, cogs: 0, expenses: 0, profit: 0 };
    trendMap[l].revenue += o.sellingPrice * eQty;
    trendMap[l].cogs    += o.costPrice * eQty;
  });
  if (!isStoreOwner) {
    filtExpenses.forEach(e => {
      const l = groupLabel(e.expense_date, periodType);
      if (!trendMap[l]) trendMap[l] = { label: l, revenue: 0, cogs: 0, expenses: 0, profit: 0 };
      trendMap[l].expenses += e.amount;
    });
  }
  Object.values(trendMap).forEach(d => { d.profit = isStoreOwner ? (d.revenue - d.cogs) : (d.revenue - d.cogs - d.expenses); });
  const trendData = Object.values(trendMap).slice(-60);

  // ── product performance ────────────────────────────────────────────────
  const prodMap: Record<string, { product: string; orders: number; qty: number; revenue: number; profit: number }> = {};
  filtOrders.forEach(o => {
    const eQty = effectiveQty(o);
    if (!prodMap[o.productName]) prodMap[o.productName] = { product: o.productName, orders: 0, qty: 0, revenue: 0, profit: 0 };
    prodMap[o.productName].orders++;
    prodMap[o.productName].qty      += o.quantity;
    prodMap[o.productName].revenue  += o.sellingPrice * eQty;
    prodMap[o.productName].profit   += o.profit || 0;
  });
  const prodRows = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue);

  // ── store performance (admin only) ─────────────────────────────────────
  const storeMap: Record<string, { store: string; orders: number; qty: number; revenue: number; cogs: number; commission: number; shipment: number; netProfit: number }> = {};
  if (!isStoreOwner) {
    filtOrders.forEach(o => {
      const s = o.storeName || 'Unknown';
      const eQty = effectiveQty(o);
      if (!storeMap[s]) storeMap[s] = { store: s, orders: 0, qty: 0, revenue: 0, cogs: 0, commission: 0, shipment: 0, netProfit: 0 };
      storeMap[s].orders++;
      storeMap[s].qty        += o.quantity;
      storeMap[s].revenue    += o.sellingPrice * eQty;
      storeMap[s].cogs       += o.costPrice * eQty;
      storeMap[s].commission += o.commissionAmount || 0;
      storeMap[s].shipment   += o.shipmentCost || 0;
      storeMap[s].netProfit  += o.profit;
    });
  }
  const storeRows = Object.values(storeMap).sort((a, b) => b.revenue - a.revenue);

  // ── expense breakdown (admin only) ─────────────────────────────────────
  const expCatMap: Record<string, number> = {};
  if (!isStoreOwner) {
    filtExpenses.forEach(e => { expCatMap[e.category] = (expCatMap[e.category] || 0) + e.amount; });
  }
  const expCatData = Object.entries(expCatMap).map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt);

  // ── PDF print ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    window.print();
  };

  // ── login guard ────────────────────────────────────────────────────────
  if (!user) return <Login onLogin={onLogin!} />;
  if (!isSuperAdmin && !isStoreOwner) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
      <p style={{ fontSize: 16, fontWeight: 600 }}>Access restricted. Only store owners and admins can view reports.</p>
    </div>
  );

  const periodLabel =
    periodType === 'all' ? 'All Time' :
    periodType === 'yearly' ? periodValue || String(new Date().getFullYear()) :
    periodType === 'monthly' ? periodValue || 'Selected Month' :
    periodValue || 'Selected Week';

  return (
    <>
      {/* ── Print styles ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sidebar, .topbar, .nav-items-container, .page-header-actions { display: none !important; }
          body, .main-area { background: white !important; margin: 0 !important; padding: 0 !important; }
          .report-print-title { display: block !important; font-size: 20px; font-weight: 800; margin-bottom: 16px; color: #1e293b; }
          .sheet-section { page-break-inside: avoid; margin-bottom: 24px; }
          @page { margin: 15mm; size: A4 landscape; }
        }
        .report-print-title { display: none; }
      `}</style>

      <div ref={printRef} style={{ maxWidth: 1400, margin: '0 auto', padding: '0 0 48px 0' }}>
        {/* ── Print title ── */}
        <div className="report-print-title">
          Trendy Wear — {isStoreOwner ? 'My Store Report' : 'Business Report'} · {periodLabel}
          {isStoreOwner ? ` · Store: ${myStoreName}` : storeFilter !== 'all' ? ` · Store: ${storeFilter}` : ''}
          {productFilter !== 'all' ? ` · Product: ${productFilter}` : ''}
        </div>

        {/* ── Page header ── */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              {isStoreOwner ? `${myStoreName} — Reports` : 'Business Reports'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
              {isStoreOwner ? 'Your store revenue, products sold, and profit' : 'Filterable analytics · Google Sheets style · Export to PDF'}
            </p>
          </div>
          <button className="btn btn-primary no-print" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 20px' }}>
            {IC.pdf} Download PDF
          </button>
        </div>

        {/* ── Filter bar (simplified for store owners) ── */}
        <div className="no-print" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              {IC.filter} Period
            </span>
            <PeriodPicker type={periodType} value={periodValue} onTypeChange={setPeriodType} onValueChange={setPeriodValue} />
          </div>

          {!isStoreOwner && (
            <>
              <div style={{ width: 1, height: 32, background: 'var(--border)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Store</span>
                <div style={{ width: 160 }}>
                  <CustomSelect value={storeFilter} onChange={setStoreFilter}
                    options={[{ id: 'all', label: 'All Stores' }, ...storeList.map(s => ({ id: s, label: s }))]}
                    height="34px" />
                </div>
              </div>
            </>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Product</span>
          <div style={{ width: 160 }}>
            <CustomSelect value={productFilter} onChange={setProductFilter}
              options={[{ id: 'all', label: 'All Products' }, ...productList.map(p => ({ id: p, label: p }))]}
              height="34px" />
          </div>

          {(storeFilter !== 'all' || productFilter !== 'all' || periodType !== 'all') && !isStoreOwner && (
            <button className="btn btn-sm btn-glass" onClick={() => { setPeriodType('all'); setPeriodValue(''); setStoreFilter('all'); setProductFilter('all'); }} style={{ marginLeft: 'auto' }}>
              ✕ Clear Filters
            </button>
          )}
          {(productFilter !== 'all' || periodType !== 'all') && isStoreOwner && (
            <button className="btn btn-sm btn-glass" onClick={() => { setPeriodType('all'); setPeriodValue(''); setProductFilter('all'); }} style={{ marginLeft: 'auto' }}>
              ✕ Clear Filters
            </button>
          )}
        </div>

        {/* ── Top-level KPI strip ── */}
        <div className="sheet-section" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          {isStoreOwner ? (
            <>
              <KpiCard label="Total Revenue"    value={Rs(totRevenue)}   color={C.purple} sub={`${filtOrders.length} orders`} />
              <KpiCard label="Total Profit"     value={Rs(storeProfit)}  color={C.green}  sub="After commissions & shipping" />
              <KpiCard label="Avg Order Value"  value={Rs(avgOrderValue)} color={C.blue}  sub="Per transaction" />
              <KpiCard label="Products Sold"    value={String(filtOrders.reduce((s, o) => s + o.quantity, 0))} color={C.teal} sub={`${prodRows.length} unique products`} />
            </>
          ) : (
            <>
              <KpiCard label="Total Revenue"    value={Rs(totRevenue)}   color={C.purple} sub={`${filtOrders.length} orders`} />
              <KpiCard label="Gross Profit"     value={Rs(grossProfit)}  color={C.green}  sub={`Margin: ${pct(grossMargin)}`} />
              <KpiCard label="Total Expenses"   value={Rs(totExpenses)}  color={C.red}    sub={`${filtExpenses.length} entries`} />
              <KpiCard label="Net Profit"       value={Rs(netProfit)}    color={netProfit >= 0 ? C.teal : C.red} sub="After all expenses" />
              <KpiCard label="Avg Order Value"  value={Rs(avgOrderValue)} color={C.blue}  sub="Per transaction" />
              <KpiCard label="Total COGS"       value={Rs(totCOGS)}      color={C.orange} sub="Cost of goods sold" />
            </>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0, flexWrap: 'wrap' }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: activeTab === i ? 800 : 500, fontSize: 13, color: activeTab === i ? C.purple : 'var(--text-muted)', borderBottom: activeTab === i ? `3px solid ${C.purple}` : '3px solid transparent', marginBottom: -2, transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              {t}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <button className="btn btn-sm btn-glass" onClick={() => setShowChart(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              {IC.chart} {showChart ? 'Hide' : 'Show'} Chart
            </button>
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading report data…</div>}

        {/* ══════════════════════════════════════════════════════════════
            STORE OWNER TAB 0: SUMMARY
            ADMIN TAB 0: P&L SUMMARY
        ══════════════════════════════════════════════════════════════ */}
        {!loading && activeTab === 0 && (
          <div className="sheet-section">
            {showChart && (
              <div style={{ marginBottom: 24, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                  {isStoreOwner ? 'Revenue & Profit Trend' : 'Revenue vs Expenses vs Net Profit Trend'}
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => Rs(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue"  stroke={C.purple} strokeWidth={2} dot={false} name="Revenue" />
                    {!isStoreOwner && <Line type="monotone" dataKey="cogs"     stroke={C.orange} strokeWidth={2} dot={false} name="COGS" />}
                    {!isStoreOwner && <Line type="monotone" dataKey="expenses" stroke={C.red}    strokeWidth={2} dot={false} name="Expenses" />}
                    <Line type="monotone" dataKey="profit"   stroke={C.green}  strokeWidth={2.5} dot={false} name={isStoreOwner ? 'Profit' : 'Net Profit'} strokeDasharray="5 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {isStoreOwner ? (
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>My Store Summary — {periodLabel}</div>
            ) : (
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>P&L Statement — {periodLabel}</div>
            )}

            {isStoreOwner ? (
              <SheetTable
                cols={[
                  { key: 'item', label: 'Line Item' },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r: any) => <span style={{ color: r.type === 'debit' ? C.red : r.type === 'total' ? (r.raw >= 0 ? C.green : C.red) : '#111' }}>{Rs(r.raw)}</span> },
                  { key: 'notes', label: 'Notes' },
                ]}
                rows={[
                  { item: '(+) Total Revenue',       amount: Rs(totRevenue), raw: totRevenue,   type: 'credit', notes: `${filtOrders.length} orders` },
                  { item: '(-) Commission Paid',     amount: Rs(totCommission), raw: totCommission, type: 'debit', notes: 'Store commission' },
                  { item: '(-) Shipment Costs',      amount: Rs(totShipment), raw: totShipment,   type: 'debit', notes: 'Delivery charges' },
                  { item: '(=) NET PROFIT',           amount: Rs(storeProfit), raw: storeProfit,   type: 'total', notes: 'Your earnings' },
                ]}
              />
            ) : (
              <SheetTable
                cols={[
                  { key: 'item', label: 'Line Item' },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r: any) => <span style={{ color: r.type === 'debit' ? C.red : r.type === 'total' ? (r.raw >= 0 ? C.green : C.red) : '#111' }}>{Rs(r.raw)}</span> },
                  { key: 'notes', label: 'Notes' },
                ]}
                rows={[
                  { item: '(+) Gross Revenue',      amount: Rs(totRevenue),   raw: totRevenue,    type: 'credit', notes: `${filtOrders.length} orders` },
                  { item: '(-) Cost of Goods Sold', amount: Rs(totCOGS),      raw: totCOGS,       type: 'debit',  notes: 'Warehouse cost × qty' },
                  { item: '(=) Gross Profit',        amount: Rs(grossProfit),  raw: grossProfit,   type: 'total',  notes: `Margin ${pct(grossMargin)}` },
                  { item: '(-) Store Commissions',   amount: Rs(totCommission),raw: totCommission, type: 'debit',  notes: 'Partner store cut' },
                  { item: '(-) Shipment Costs',      amount: Rs(totShipment),  raw: totShipment,   type: 'debit',  notes: 'Delivery charges' },
                  { item: '(-) Operating Expenses',  amount: Rs(totExpenses),  raw: totExpenses,   type: 'debit',  notes: `${filtExpenses.length} expense entries` },
                  { item: '(=) NET PROFIT',           amount: Rs(netProfit),   raw: netProfit,     type: 'total',  notes: 'Bottom line' },
                ]}
              />
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STORE OWNER TAB 1: MY SALES
            ADMIN TAB 1: REVENUE & SALES
        ══════════════════════════════════════════════════════════════ */}
        {!loading && activeTab === 1 && (
          <div className="sheet-section">
            {showChart && (
              <div style={{ marginBottom: 24, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Revenue & Profit Over Time</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => Rs(v)} />
                    <Legend />
                    <Bar dataKey="revenue" fill={C.purple} name="Revenue" radius={[2,2,0,0]} />
                    {!isStoreOwner && <Bar dataKey="cogs" fill={C.orange} name="COGS" radius={[2,2,0,0]} />}
                    <Bar dataKey="profit"  fill={C.green}  name="Profit"  radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
              {isStoreOwner ? `My Sales — ${periodLabel}` : `All Orders — ${periodLabel}`}
            </div>
            <SheetTable
              cols={
                isStoreOwner
                  ? [
                      { key: 'date',     label: 'Date',    render: (o: Order) => new Date(o.date).toLocaleDateString('en-PK') },
                      { key: 'productName', label: 'Product' },
                      { key: 'clientName',  label: 'Client' },
                      { key: 'type',     label: 'Type',   render: (o: Order) => <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: o.type === 'Sale' ? '#ede9fe' : '#fef3c7', color: o.type === 'Sale' ? '#6d28d9' : '#92400e', fontWeight: 600 }}>{o.type}</span> },
                      { key: 'quantity', label: 'Qty',    align: 'right' },
                      { key: 'sellingPrice', label: 'Unit Price', align: 'right', render: (o: Order) => Rs(o.sellingPrice) },
                      { key: 'revenue',  label: 'Revenue', align: 'right', value: (o: Order) => o.sellingPrice * o.quantity, render: (o: Order) => <b>{Rs(o.sellingPrice * o.quantity)}</b> },
                      { key: 'profit',   label: 'Profit',  align: 'right', render: (o: Order) => <span style={{ color: o.profit >= 0 ? C.green : C.red, fontWeight: 600 }}>{Rs(o.profit)}</span> },
                      { key: 'paymentStatus', label: 'Paid', align: 'center', render: (o: Order) => o.paymentStatus ? '✅' : '⏳' },
                    ]
                  : [
                      { key: 'date',     label: 'Date',    render: (o: Order) => new Date(o.date).toLocaleDateString('en-PK') },
                      { key: 'productName', label: 'Product' },
                      { key: 'storeName',   label: 'Store' },
                      { key: 'clientName',  label: 'Client' },
                      { key: 'type',     label: 'Type',   render: (o: Order) => <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: o.type === 'Sale' ? '#ede9fe' : '#fef3c7', color: o.type === 'Sale' ? '#6d28d9' : '#92400e', fontWeight: 600 }}>{o.type}</span> },
                      { key: 'quantity', label: 'Qty',    align: 'right' },
                      { key: 'sellingPrice', label: 'Unit Price', align: 'right', render: (o: Order) => Rs(o.sellingPrice) },
                      { key: 'revenue',  label: 'Revenue', align: 'right', value: (o: Order) => o.sellingPrice * o.quantity, render: (o: Order) => <b>{Rs(o.sellingPrice * o.quantity)}</b> },
                      { key: 'costPrice', label: 'Unit Cost', align: 'right', render: (o: Order) => Rs(o.costPrice) },
                      { key: 'cogs',     label: 'COGS',   align: 'right', value: (o: Order) => o.costPrice * o.quantity, render: (o: Order) => Rs(o.costPrice * o.quantity) },
                      { key: 'profit',   label: 'Profit',  align: 'right', render: (o: Order) => <span style={{ color: o.profit >= 0 ? C.green : C.red, fontWeight: 600 }}>{Rs(o.profit)}</span> },
                      { key: 'paymentStatus', label: 'Paid', align: 'center', render: (o: Order) => o.paymentStatus ? '✅' : '⏳' },
                    ]
              }
              rows={filtOrders}
              totalsRow={
                isStoreOwner
                  ? {
                      date: `${filtOrders.length} orders`,
                      quantity: String(filtOrders.reduce((s, o) => s + o.quantity, 0)),
                      revenue: <b>{Rs(totRevenue)}</b>,
                      profit: <b style={{ color: storeProfit >= 0 ? C.green : C.red }}>{Rs(storeProfit)}</b>,
                    }
                  : {
                      date: `${filtOrders.length} orders`,
                      quantity: String(filtOrders.reduce((s, o) => s + o.quantity, 0)),
                      revenue: <b>{Rs(totRevenue)}</b>,
                      cogs: Rs(totCOGS),
                      profit: <b style={{ color: grossProfit >= 0 ? C.green : C.red }}>{Rs(grossProfit)}</b>,
                    }
              }
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ADMIN TAB 2: EXPENSES (admin only)
        ══════════════════════════════════════════════════════════════ */}
        {!loading && !isStoreOwner && activeTab === 2 && (
          <div className="sheet-section">
            {showChart && expCatData.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>By Category</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={expCatData} dataKey="amt" nameKey="cat" cx="50%" cy="50%" outerRadius={90} label={(p: any) => `${p.cat} ${((p.percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                        {expCatData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => Rs(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Expenses Over Time</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => Rs(v)} />
                      <Bar dataKey="expenses" fill={C.red} name="Expenses" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <KpiCard label="Total Expenses" value={Rs(totExpenses)} color={C.red}    sub={`${filtExpenses.length} entries`} />
              <KpiCard label="Categories"     value={String(expCatData.length)} color={C.orange} />
              {expCatData[0] && <KpiCard label="Top Category" value={expCatData[0].cat} color={C.purple} sub={Rs(expCatData[0].amt)} />}
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Expense Log — {periodLabel}</div>
            <SheetTable
              cols={[
                { key: 'expense_date', label: 'Date',     render: (e: Expense) => new Date(e.expense_date).toLocaleDateString('en-PK') },
                { key: 'title',        label: 'Title' },
                { key: 'category',     label: 'Category', render: (e: Expense) => <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>{e.category}</span> },
                { key: 'amount',       label: 'Amount',   align: 'right', value: (e: Expense) => e.amount, render: (e: Expense) => <b style={{ color: C.red }}>{Rs(e.amount)}</b> },
                { key: 'notes',        label: 'Notes',    render: (e: Expense) => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{e.notes || '—'}</span> },
              ]}
              rows={filtExpenses}
              totalsRow={{ expense_date: `${filtExpenses.length} entries`, amount: <b style={{ color: C.red }}>{Rs(totExpenses)}</b> }}
            />

            {expCatData.length > 0 && (
              <>
                <div style={{ fontWeight: 700, fontSize: 14, margin: '24px 0 10px' }}>Category Summary</div>
                <SheetTable
                  cols={[
                    { key: 'cat',   label: 'Category' },
                    { key: 'count', label: 'Entries', align: 'right' },
                    { key: 'amt',   label: 'Total',   align: 'right', value: (r: any) => r.amt, render: (r: any) => <b>{Rs(r.amt)}</b> },
                    { key: 'share', label: '% of Total', align: 'right', render: (r: any) => pct(totExpenses > 0 ? (r.amt / totExpenses) * 100 : 0) },
                  ]}
                  rows={expCatData.map(d => ({ ...d, count: filtExpenses.filter(e => e.category === d.cat).length }))}
                  totalsRow={{ cat: 'TOTAL', amt: <b>{Rs(totExpenses)}</b>, share: '100%' }}
                />
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            STORE OWNER TAB 2 / ADMIN TAB 3: PRODUCT PERFORMANCE
        ══════════════════════════════════════════════════════════════ */}
        {!loading && ((isStoreOwner && activeTab === 2) || (!isStoreOwner && activeTab === 3)) && (
          <div className="sheet-section">
            {showChart && prodRows.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Revenue by Product (Top 10)</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={prodRows.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="product" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip formatter={(v: number) => Rs(v)} />
                      <Bar dataKey="revenue" fill={C.purple} name="Revenue" />
                      <Bar dataKey="profit" fill={C.green} name="Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Units Sold by Product (Top 10)</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={prodRows.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="product" tick={{ fontSize: 10 }} width={100} />
                      <Tooltip />
                      <Bar dataKey="qty" fill={C.blue} name="Units Sold" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <KpiCard label="Products Sold"   value={String(prodRows.length)} color={C.purple} />
              <KpiCard label="Best Seller"     value={prodRows[0]?.product || '—'} color={C.blue} sub={prodRows[0] ? Rs(prodRows[0].revenue) : ''} />
              <KpiCard label="Total Qty Sold"  value={String(filtOrders.reduce((s, o) => s + o.quantity, 0))} color={C.teal} />
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Product Performance — {periodLabel}</div>

            {isStoreOwner ? (
              <SheetTable
                cols={[
                  { key: 'rank',       label: '#',          align: 'center', render: (_: any, i: number) => i + 1 },
                  { key: 'product',    label: 'Product Name' },
                  { key: 'orders',     label: 'Orders',     align: 'right' },
                  { key: 'qty',        label: 'Qty Sold',   align: 'right' },
                  { key: 'revenue',    label: 'Revenue',    align: 'right', value: (r: any) => r.revenue,    render: (r: any) => <b>{Rs(r.revenue)}</b> },
                  { key: 'profit',     label: 'Profit',     align: 'right', render: (r: any) => <span style={{ color: r.profit >= 0 ? C.green : C.red, fontWeight: 600 }}>{Rs(r.profit)}</span> },
                ]}
                rows={prodRows}
                totalsRow={{
                  product: `${prodRows.length} products`,
                  orders: String(filtOrders.length),
                  qty: String(filtOrders.reduce((s, o) => s + o.quantity, 0)),
                  revenue: <b>{Rs(totRevenue)}</b>,
                  profit: <b style={{ color: storeProfit >= 0 ? C.green : C.red }}>{Rs(storeProfit)}</b>,
                }}
              />
            ) : (
              <SheetTable
                cols={[
                  { key: 'rank',       label: '#',          align: 'center', render: (_: any, i: number) => i + 1 },
                  { key: 'product',    label: 'Product Name' },
                  { key: 'orders',     label: 'Orders',     align: 'right' },
                  { key: 'qty',        label: 'Qty Sold',   align: 'right' },
                  { key: 'revenue',    label: 'Revenue',    align: 'right', value: (r: any) => r.revenue,    render: (r: any) => <b>{Rs(r.revenue)}</b> },
                  { key: 'cogs',       label: 'COGS',       align: 'right', render: (r: any) => Rs(r.cogs) },
                  { key: 'grossProfit',label: 'Gross Profit',align: 'right', render: (r: any) => <span style={{ color: r.grossProfit >= 0 ? C.green : C.red, fontWeight: 600 }}>{Rs(r.grossProfit)}</span> },
                  { key: 'margin',     label: 'Margin %',   align: 'right', value: (r: any) => r.revenue > 0 ? r.grossProfit / r.revenue * 100 : 0, render: (r: any) => <span style={{ color: r.revenue > 0 && r.grossProfit / r.revenue > 0.3 ? C.green : C.orange }}>{r.revenue > 0 ? pct(r.grossProfit / r.revenue * 100) : '—'}</span> },
                ]}
                rows={prodRows.map(r => ({ ...r, cogs: r.revenue - r.profit, grossProfit: r.profit }))}
                totalsRow={{
                  product: `${prodRows.length} products`,
                  orders: String(filtOrders.length),
                  qty: String(filtOrders.reduce((s, o) => s + o.quantity, 0)),
                  revenue: <b>{Rs(totRevenue)}</b>,
                  cogs: Rs(totCOGS),
                  grossProfit: <b style={{ color: grossProfit >= 0 ? C.green : C.red }}>{Rs(grossProfit)}</b>,
                }}
              />
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            ADMIN TAB 4: STORE PERFORMANCE (admin only)
        ══════════════════════════════════════════════════════════════ */}
        {!loading && !isStoreOwner && activeTab === 4 && (
          <div className="sheet-section">
            {showChart && storeRows.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Revenue by Store</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={storeRows} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="store" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => Rs(v)} />
                      <Legend />
                      <Bar dataKey="revenue"   fill={C.purple} name="Revenue"    radius={[2,2,0,0]} />
                      <Bar dataKey="netProfit" fill={C.green}  name="Net Profit" radius={[2,2,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Orders by Store</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={storeRows} dataKey="orders" nameKey="store" cx="50%" cy="50%" outerRadius={95} label={(p: any) => `${p.store} ${((p.percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                        {storeRows.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <KpiCard label="Active Stores" value={String(storeRows.length)} color={C.blue} />
              <KpiCard label="Best Store"    value={storeRows[0]?.store || '—'} color={C.purple} sub={storeRows[0] ? Rs(storeRows[0].revenue) : ''} />
              <KpiCard label="Total Commission" value={Rs(totCommission)} color={C.orange} />
              <KpiCard label="Total Shipment"   value={Rs(totShipment)}   color={C.teal} />
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Store Performance — {periodLabel}</div>
            <SheetTable
              cols={[
                { key: 'rank',       label: '#',           align: 'center', render: (_: any, i: number) => i + 1 },
                { key: 'store',      label: 'Store Name' },
                { key: 'orders',     label: 'Orders',      align: 'right' },
                { key: 'qty',        label: 'Units Sold',  align: 'right' },
                { key: 'revenue',    label: 'Revenue',     align: 'right', value: (r: any) => r.revenue, render: (r: any) => <b>{Rs(r.revenue)}</b> },
                { key: 'cogs',       label: 'COGS',        align: 'right', render: (r: any) => Rs(r.cogs) },
                { key: 'commission', label: 'Commission',  align: 'right', render: (r: any) => Rs(r.commission) },
                { key: 'shipment',   label: 'Shipping',    align: 'right', render: (r: any) => Rs(r.shipment) },
                { key: 'netProfit',  label: 'Net Profit',  align: 'right', render: (r: any) => <span style={{ color: r.netProfit >= 0 ? C.green : C.red, fontWeight: 700 }}>{Rs(r.netProfit)}</span> },
              ]}
              rows={storeRows}
              totalsRow={{
                store: `${storeRows.length} stores`,
                orders: String(filtOrders.length),
                qty: String(filtOrders.reduce((s, o) => s + o.quantity, 0)),
                revenue: <b>{Rs(totRevenue)}</b>,
                cogs: Rs(totCOGS),
                commission: Rs(totCommission),
                shipment: Rs(totShipment),
                netProfit: <b style={{ color: netProfit >= 0 ? C.green : C.red }}>{Rs(netProfit)}</b>,
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}