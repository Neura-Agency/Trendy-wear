import { useState, useEffect, useCallback } from 'react';
import SectionCard from '../components/SectionCard';
import Badge from '../components/Badge';
import Login from '../components/Login';
import SearchBar from '../components/SearchBar';
import { usePopup } from '../components/Popup';
import { PageProps, Owner, OwnerPayout } from '../types';

// ── Currency helpers ──────────────────────────────────────────────────────────
const Rs = (n: number) =>
  'Rs ' + Math.round(n).toLocaleString('en-PK');

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const iconOwner = <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>;
const iconPayout = <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
const iconProfit = <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>;

// ── Shared pill colours per position ─────────────────────────────────────────
const OWNER_COLORS: Array<'purple' | 'blue' | 'green' | 'orange'> = ['purple', 'blue', 'green', 'orange'];

// ─────────────────────────────────────────────────────────────────────────────
// Add / Edit Owner Modal
// ─────────────────────────────────────────────────────────────────────────────
function OwnerFormModal({
  owner,
  onClose,
  onSaved,
}: {
  owner?: Owner;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = usePopup();
  const editing = Boolean(owner?.id);
  const [form, setForm] = useState({
    name: owner?.name ?? '',
    phone: owner?.phone ?? '',
    email: owner?.email ?? '',
    notes: owner?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      const res = await fetch('/api/owners', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing
            ? { id: owner!.id, fields: { ...form } }
            : { ...form }
        ),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(editing ? 'Owner updated' : 'Owner added');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{editing ? 'Edit Owner' : 'Add Owner'}</h3>
          <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bilal" required />
            </div>
            <div className="form-grid-2">
              <div className="input-group">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+92 …" />
              </div>
              <div className="input-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="owner@email.com" />
              </div>
            </div>
            <div className="input-group">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={saving} style={{ marginTop: 4 }}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Owner'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Record Payout Modal
// ─────────────────────────────────────────────────────────────────────────────
function PayoutModal({
  owners,
  defaultOwnerId,
  onClose,
  onSaved,
}: {
  owners: Owner[];
  defaultOwnerId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = usePopup();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + '01';
  const [form, setForm] = useState({
    ownerId: defaultOwnerId ?? (owners[0]?.id || ''),
    amount: '',
    periodFrom: firstOfMonth,
    periodTo: today,
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ownerId) return toast.error('Select an owner');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      const res = await fetch('/api/owners?payouts=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: form.ownerId,
          amount: Number(form.amount),
          periodFrom: form.periodFrom,
          periodTo: form.periodTo,
          notes: form.notes || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success('Payout recorded');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Record Payout</h3>
          <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label>Owner *</label>
              <select value={form.ownerId} onChange={e => setForm(p => ({ ...p, ownerId: e.target.value }))}>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Amount (Rs) *</label>
              <input type="text" inputMode="numeric" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 25000" required />
            </div>
            <div className="form-grid-2">
              <div className="input-group">
                <label>Period From</label>
                <input type="date" value={form.periodFrom} onChange={e => setForm(p => ({ ...p, periodFrom: e.target.value }))} />
              </div>
              <div className="input-group">
                <label>Period To</label>
                <input type="date" value={form.periodTo} onChange={e => setForm(p => ({ ...p, periodTo: e.target.value }))} />
              </div>
            </div>
            <div className="input-group">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional…" />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={saving} style={{ marginTop: 4 }}>
              {saving ? 'Saving…' : 'Record Payout'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transfer Modal
// ─────────────────────────────────────────────────────────────────────────────
function TransferModal({
  owners,
  defaultToOwnerId,
  loggedInUsername,
  onClose,
  onSaved,
}: {
  owners: Owner[];
  defaultToOwnerId?: string;
  loggedInUsername?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = usePopup();

  // Find the owner that matches the logged-in user's username (case-insensitive)
  const loggedInOwner = loggedInUsername
    ? owners.find(o => o.name.toLowerCase() === loggedInUsername.toLowerCase())
    : null;

  // To Owner options exclude the logged-in owner
  const availableToOwners = loggedInOwner
    ? owners.filter(o => o.id !== loggedInOwner.id)
    : owners;

  // If defaultToOwnerId is provided, use it; otherwise use first available
  const initialToOwnerId = defaultToOwnerId || availableToOwners[0]?.id || '';

  const [form, setForm] = useState({
    fromOwnerId: loggedInOwner?.id || owners[0]?.id || '',
    toOwnerId: initialToOwnerId,
    amount: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromOwnerId || !form.toOwnerId) return toast.error('Select both owners');
    if (form.fromOwnerId === form.toOwnerId) return toast.error('Cannot transfer to self');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      const res = await fetch('/api/owner-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromOwnerId: form.fromOwnerId,
          toOwnerId: form.toOwnerId,
          amount: Number(form.amount),
          description: form.description || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success('Transfer recorded');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toOwnerObj = owners.find(o => o.id === form.toOwnerId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Record Transfer</h3>
          <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="input-group">
              <label>From Owner *</label>
              {loggedInOwner ? (
                <input
                  type="text"
                  value={loggedInOwner.name}
                  disabled
                  style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
                />
              ) : (
                <select value={form.fromOwnerId} onChange={e => setForm(p => ({ ...p, fromOwnerId: e.target.value }))}>
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="input-group">
              <label>To Owner *</label>
              <select value={form.toOwnerId} onChange={e => setForm(p => ({ ...p, toOwnerId: e.target.value }))}>
                {availableToOwners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>Amount (Rs) *</label>
              <input type="text" inputMode="numeric" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 10000" required />
            </div>
            <div className="input-group">
              <label>Description</label>
              <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional…" />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={saving} style={{ marginTop: 4 }}>
              {saving ? 'Saving…' : toOwnerObj ? `Transfer to ${toOwnerObj.name}` : 'Record Transfer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function OwnersPage({ user, onLogin }: PageProps) {
  const { toast, confirmDialog } = usePopup();

  const [owners, setOwners] = useState<Owner[]>([]);
  const [payouts, setPayouts] = useState<OwnerPayout[]>([]);
  const [totalNetProfit, setTotalNetProfit] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [showAddOwner, setShowAddOwner] = useState(false);
  const [editOwner, setEditOwner] = useState<Owner | null>(null);
  const [showPayout, setShowPayout] = useState(false);
  const [payoutDefaultOwner, setPayoutDefaultOwner] = useState<string | undefined>(undefined);
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferToOwner, setTransferToOwner] = useState<string | undefined>(undefined);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [payoutSearch, setPayoutSearch] = useState('');
  const [stores, setStores] = useState<Record<string, any>>({});
  const [orders, setOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  // ── Fetch everything in parallel ─────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [ownersRes, payoutsRes, ordersRes, expensesRes, transfersRes, storesRes] = await Promise.all([
        fetch('/api/owners'),
        fetch('/api/owners?payouts=1'),
        fetch('/api/orders'),
        fetch('/api/expenses'),
        fetch('/api/owner-transfers'),
        fetch('/api/store'),
      ]);
      const [ownersData, payoutsData, ordersData, expensesData, transfersData, storesData] = await Promise.all([
        ownersRes.json(),
        payoutsRes.json(),
        ordersRes.json(),
        expensesRes.json(),
        transfersRes.json(),
        storesRes.json(),
      ]);

      setOwners(ownersData.owners || []);
      setPayouts(payoutsData.payouts || []);
      setTransfers(transfersData.transactions || []);
      setStores(storesData.stores || {});
      setOrders(ordersData.orders || []);
      setExpenses(expensesData.expenses || []);

      const ordersList: any[] = ordersData.orders || [];
      const expensesList: any[] = expensesData.expenses || [];

      // Revenue = gross sales
      const totalGross = ordersList.reduce((s: number, o: any) => s + ((o.sellingPrice || 0) * (o.quantity || 1)), 0);
      // All expenses = recorded expenses + COGS + shipping + store commissions
      const supabaseExpenses = expensesList.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
      const totalCostPrice = ordersList.reduce((s: number, o: any) => s + ((o.costPrice || 0) * (o.quantity || 1)), 0);
      const totalShipping = ordersList.reduce((s: number, o: any) => s + (o.shipmentCost || 0), 0);
      const totalShopCut = ordersList.reduce((s: number, o: any) => s + (o.commissionAmount || 0), 0);
      const allExpenses = supabaseExpenses + totalCostPrice + totalShipping + totalShopCut;
      // Net Profit = Revenue - Expenses
      const netProfit = totalGross - allExpenses;
      setTotalNetProfit(netProfit);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin' || user.scope !== 'all') {
      setLoading(false);
      return;
    }
    refresh();
  }, [user, refresh]);

  // ── Guard ─────────────────────────────────────────────────────────────
  if (!user) return <Login onLogin={onLogin} />;
  if (loading) return <div className="loading">Loading…</div>;
  if (user.role !== 'admin' || user.scope !== 'all') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Access Denied — Super Admin only.</div>;
  }

  // ── Computed ──────────────────────────────────────────────────────────
  const activeOwners = owners.filter(o => o.isActive);
  const totalSharePercent = activeOwners.reduce((s, o) => s + o.profitSharePercent, 0);
  const totalPaidOut = owners.reduce((s, o) => s + (o.totalPaidOut ?? 0), 0);
  const totalAdvances = owners.reduce((s, o) => s + (o.totalAdvances ?? 0), 0);
  const totalBalance = totalNetProfit - totalPaidOut + totalAdvances;

  const ownerPayoutsMap: Record<string, OwnerPayout[]> = {};
  payouts.forEach(p => {
    if (!ownerPayoutsMap[p.ownerId]) ownerPayoutsMap[p.ownerId] = [];
    ownerPayoutsMap[p.ownerId].push(p);
  });

  // ── Revenue Attribution by Owner ────────────────────────────────────
  // Build store->owner mapping from stores data
  const storeToOwner: Record<string, string> = {};
  Object.values(stores).forEach((s: any) => {
    if (s.associateOwnerId) {
      storeToOwner[s.name] = s.associateOwnerId;
    }
  });

  // Per-owner revenue from orders (attributed via store ownership)
  const ownerRevenue: Record<string, number> = {};
  const ownerOrderCount: Record<string, number> = {};
  orders.forEach((o: any) => {
    const ownerId = storeToOwner[o.storeName];
    if (ownerId) {
      ownerRevenue[ownerId] = (ownerRevenue[ownerId] || 0) + ((o.sellingPrice || 0) * (o.quantity || 1));
      ownerOrderCount[ownerId] = (ownerOrderCount[ownerId] || 0) + 1;
    }
  });

  // Per-owner expenses (from paid_by_owner_id)
  const ownerExpensesPaid: Record<string, number> = {};
  expenses.forEach((e: any) => {
    if (e.paid_by_owner_id) {
      ownerExpensesPaid[e.paid_by_owner_id] = (ownerExpensesPaid[e.paid_by_owner_id] || 0) + (Number(e.amount) || 0);
    }
  });

  // Per-owner transfers (in and out)
  const ownerTransferOut: Record<string, number> = {};
  const ownerTransferIn: Record<string, number> = {};
  transfers.forEach((t: any) => {
    if (t.transactionType === 'internal_transfer_out') {
      ownerTransferOut[t.ownerId] = (ownerTransferOut[t.ownerId] || 0) + (Number(t.amount) || 0);
    } else if (t.transactionType === 'internal_transfer_in') {
      ownerTransferIn[t.ownerId] = (ownerTransferIn[t.ownerId] || 0) + (Number(t.amount) || 0);
    }
  });

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleDeactivate = async (owner: Owner) => {
    const confirmed = await confirmDialog(`Deactivate "${owner.name}"? Their share will be split equally among the remaining active partners.`);
    if (!confirmed) return;
    try {
      const res = await fetch('/api/owners', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: owner.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`${owner.name} deactivated and share redistributed`);
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReactivate = async (owner: Owner) => {
    const confirmed = await confirmDialog(`Reactivate "${owner.name}"? All active partners' shares will be split equally.`);
    if (!confirmed) return;
    try {
      const res = await fetch('/api/owners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: owner.id, fields: { isActive: true } }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success(`${owner.name} reactivated`);
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeletePayout = async (payout: OwnerPayout) => {
    const confirmed = await confirmDialog(`Delete this payout of ${Rs(payout.amount)} for ${payout.ownerName}?`);
    if (!confirmed) return;
    try {
      const res = await fetch('/api/owners?payouts=1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payout.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success('Payout deleted');
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteTransfer = async (transfer: any) => {
    const confirmed = await confirmDialog(`Delete this transfer of ${Rs(transfer.amount)}? Both the outgoing and incoming records will be removed.`);
    if (!confirmed) return;
    try {
      const res = await fetch('/api/owner-transfers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transfer.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast.success('Transfer deleted');
      refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openPayout = (ownerId?: string) => {
    setPayoutDefaultOwner(ownerId);
    setShowPayout(true);
  };

  const openTransfer = (toOwnerId?: string) => {
    setTransferToOwner(toOwnerId);
    setShowTransfer(true);
  };

  return (
    <>
      {/* ── Modals ── */}
      {(showAddOwner || editOwner) && (
        <OwnerFormModal
          owner={editOwner ?? undefined}
          onClose={() => { setShowAddOwner(false); setEditOwner(null); }}
          onSaved={refresh}
        />
      )}
      {showPayout && (
        <PayoutModal
          owners={activeOwners}
          defaultOwnerId={payoutDefaultOwner}
          onClose={() => setShowPayout(false)}
          onSaved={refresh}
        />
      )}
      {showTransfer && (
        <TransferModal
          owners={activeOwners}
          defaultToOwnerId={transferToOwner}
          loggedInUsername={user?.username}
          onClose={() => { setShowTransfer(false); setTransferToOwner(undefined); }}
          onSaved={refresh}
        />
      )}

      <div className="owners-page">
        {/* ── Header ── */}
        <header className="page-header">
          <div className="header-content">
            <div className="header-titles">
              <h1 className="main-title">Profit Partners</h1>
              <p className="subtitle">
                Manage ownership shares and track profit distributions for <span className="highlight">Bilal, Yahya & Hammad</span>
              </p>
            </div>

          </div>
        </header>

        {/* ── Summary KPI Row ── */}
        <section className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi-card green">
            <div className="kpi-icon">{iconProfit}</div>
            <div className="kpi-content">
              <div className="kpi-value">{Rs(totalNetProfit)}</div>
              <div className="kpi-label">Total Net Profit</div>
              <div className="kpi-trend up">All-time · from orders</div>
            </div>
          </div>
          <div className="kpi-card blue">
            <div className="kpi-icon">{iconPayout}</div>
            <div className="kpi-content">
              <div className="kpi-value">{Rs(totalPaidOut)}</div>
              <div className="kpi-label">Total Paid Out</div>
              <div className="kpi-trend" style={{ color: 'var(--text-muted)' }}>{payouts.length} payout{payouts.length !== 1 ? 's' : ''} recorded</div>
            </div>
          </div>
          <div className="kpi-card blue">
            <div className="kpi-icon">{iconPayout}</div>
            <div className="kpi-content">
              <div className="kpi-value">{Rs(totalAdvances)}</div>
              <div className="kpi-label">Personal Advances</div>
              <div className="kpi-trend" style={{ color: 'var(--text-muted)' }}>Owner personal expenses to reimburse</div>
            </div>
          </div>
          <div className="kpi-card orange">
            <div className="kpi-icon">{iconProfit}</div>
            <div className="kpi-content">
              <div className="kpi-value" style={{ color: totalBalance > 0 ? 'var(--orange-600)' : 'var(--green-600)' }}>{Rs(Math.abs(totalBalance))}</div>
              <div className="kpi-label">{totalBalance > 0 ? 'Remaining to Distribute' : 'Over-paid'}</div>
              <div className="kpi-trend" style={{ color: 'var(--text-muted)' }}>{Rs(totalNetProfit)} − {Rs(totalPaidOut)} + {Rs(totalAdvances)}</div>
            </div>
          </div>
          <div className="kpi-card purple">
            <div className="kpi-icon">{iconOwner}</div>
            <div className="kpi-content">
              <div className="kpi-value">{activeOwners.length}</div>
              <div className="kpi-label">Active Partners</div>
              <div className="kpi-trend" style={{ color: totalSharePercent === 100 ? 'var(--green-600)' : 'var(--orange-600)' }}>
                {totalSharePercent.toFixed(2)}% allocated {totalSharePercent === 100 ? '✓' : '← not 100%'}
              </div>
            </div>
          </div>
        </section>

        {/* ── Profit Split Overview ── */}
        {activeOwners.length > 0 && (
          <SectionCard title="Profit Split Overview" icon={iconProfit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {activeOwners.map((o, idx) => {
                const clrs   = ['#7c3aed', '#2563eb', '#16a34a', '#ea580c'];
                const bgs    = ['#f5f3ff', '#eff6ff', '#f0fdf4', '#fff7ed'];
                const share  = (o.profitSharePercent / 100) * totalNetProfit;
                const paid   = o.totalPaidOut ?? 0;
                const advances = o.totalAdvances ?? 0;
                const bal    = share - paid + advances;
                const color  = clrs[idx % clrs.length];
                const bg     = bgs[idx % bgs.length];
                return (
                  <div key={o.id} style={{ borderRadius: 12, border: `1.5px solid ${color}30`, background: bg, overflow: 'hidden' }}>
                    {/* Coloured top strip */}
                    <div style={{ height: 5, background: color }} />
                    <div style={{ padding: '14px 16px' }}>
                      {/* Name + share % */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>
                            {o.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{o.name}</span>
                        </div>
                        <span style={{ fontWeight: 800, fontSize: 18, color }}>{o.profitSharePercent}%</span>
                      </div>
                      {/* Four rows */}
                      {[
                        { label: 'Earned Share', value: Rs(share), valueColor: '#16a34a' },
                        { label: 'Paid Out',     value: Rs(paid),  valueColor: '#2563eb' },
                        { label: 'Personal Advances', value: Rs(advances), valueColor: advances > 0 ? '#ea580c' : '#999' },
                        { label: bal > 0 ? 'Balance Due' : 'Fully Settled', value: Rs(Math.abs(bal)), valueColor: bal > 0 ? '#ea580c' : '#16a34a' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #0000000a' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ── Revenue Attribution by Owner ── */}
        {activeOwners.length > 0 && (
          <SectionCard title="Revenue Attribution by Owner" icon={iconProfit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              {activeOwners.map((o, idx) => {
                const clrs = ['#7c3aed', '#2563eb', '#16a34a', '#ea580c'];
                const bgs = ['#f5f3ff', '#eff6ff', '#f0fdf4', '#fff7ed'];
                const rev = ownerRevenue[o.id] || 0;
                const exp = ownerExpensesPaid[o.id] || 0;
                const transferIn = ownerTransferIn[o.id] || 0;
                const transferOut = ownerTransferOut[o.id] || 0;
                const transferNet = transferIn - transferOut;
                const accountTotal = rev + transferNet - exp;
                const orderCount = ownerOrderCount[o.id] || 0;
                const ownedStores = Object.entries(storeToOwner)
                  .filter(([, oid]) => oid === o.id)
                  .map(([name]) => name);
                const color = clrs[idx % clrs.length];
                const bg = bgs[idx % bgs.length];

                return (
                  <div key={o.id} style={{ borderRadius: 12, border: `1.5px solid ${color}30`, background: bg, overflow: 'hidden' }}>
                    <div style={{ height: 5, background: color }} />
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>
                            {o.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{o.name}</span>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{orderCount} order{orderCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                        Stores: {ownedStores.length > 0 ? ownedStores.join(', ') : <span style={{ fontStyle: 'italic' }}>None assigned</span>}
                      </div>
                      {[
                        { label: 'Revenue', value: Rs(rev), valueColor: '#16a34a' },
                        { label: 'Expenses Paid', value: Rs(exp), valueColor: '#dc2626' },
                        { label: 'Transfers (In - Out)', value: Rs(transferNet), valueColor: transferNet >= 0 ? '#16a34a' : '#dc2626' },
                        { label: 'Account Total', value: Rs(accountTotal), valueColor: accountTotal >= 0 ? '#16a34a' : '#dc2626' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #0000000a' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ── Owner Cards ── */}
        <SectionCard title="Partners" icon={iconOwner}
          action={
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddOwner(true)}>+ Add</button>
          }
        >
          {owners.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: '24px 0', textAlign: 'center' }}>No owners yet. Add Bilal, Yahya or Hammad.</p>
          ) : (
            <div className="owners-cards-grid">
              {owners.map((owner, idx) => {
                const share = (owner.profitSharePercent / 100) * totalNetProfit;
                const paid = owner.totalPaidOut ?? 0;
                const balance = share - paid;
                const ownerHistory = ownerPayoutsMap[owner.id] || [];
                const isExpanded = expandedOwner === owner.id;

                return (
                  <div
                    key={owner.id}
                    style={{
                      border: '1.5px solid var(--border)',
                      borderRadius: 12,
                      padding: 18,
                      background: owner.isActive ? 'var(--surface)' : 'var(--surface-muted, #f9f9f9)',
                      opacity: owner.isActive ? 1 : 0.6,
                    }}
                  >
                    {/* Card header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: ['#ede9fe','#dbeafe','#dcfce7','#ffedd5'][idx % 4],
                          color: ['#7c3aed','#2563eb','#16a34a','#ea580c'][idx % 4],
                          fontWeight: 800, fontSize: 18
                        }}>
                          {owner.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{owner.name}</div>
                          {owner.phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{owner.phone}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Badge type={OWNER_COLORS[idx % OWNER_COLORS.length]}>{owner.profitSharePercent}%</Badge>
                        {!owner.isActive && <Badge type="gray">Inactive</Badge>}
                      </div>
                    </div>

                    {/* Profit rows */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14, textAlign: 'center' }}>
                      <div className="owners-stat-cell" style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 4px' }}>
                        <div className="stat-value" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-600)' }}>{Rs(share)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Earned Share</div>
                      </div>
                      <div className="owners-stat-cell" style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 4px' }}>
                        <div className="stat-value" style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-600)' }}>{Rs(paid)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Paid Out</div>
                      </div>
                      <div className="owners-stat-cell" style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 4px' }}>
                        <div className="stat-value" style={{ fontSize: 13, fontWeight: 700, color: balance > 0 ? 'var(--orange-600)' : 'var(--green-600)' }}>{Rs(Math.abs(balance))}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{balance > 0 ? 'Balance' : 'Settled'}</div>
                      </div>
                    </div>

                    {/* Action row */}
                    <div className="owners-card-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => openPayout(owner.id)}
                        disabled={!owner.isActive}
                      >
                        + Payout
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => openTransfer(owner.id)}
                        disabled={!owner.isActive}
                      >
                        Transfer
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditOwner(owner)}>Edit</button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ color: 'var(--text-muted)' }}
                        onClick={() => setExpandedOwner(isExpanded ? null : owner.id)}
                        title="Payout history"
                      >
                        {isExpanded ? '▲' : '▼'} {ownerHistory.length}
                      </button>
                      {owner.isActive ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--red-500, #ef4444)' }}
                          onClick={() => handleDeactivate(owner)}
                          title="Deactivate"
                        >
                          ✕
                        </button>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--success)' }}
                          onClick={() => handleReactivate(owner)}
                          title="Reactivate"
                        >
                          ✓ Reactivate
                        </button>
                      )}
                    </div>

                    {/* Payout history accordion */}
                    {isExpanded && (
                      <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>PAYOUT HISTORY</div>
                        {ownerHistory.length === 0 ? (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No payouts recorded yet.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {ownerHistory.map(p => (
                              <div key={p.id} className="payout-history-row">
                                <div style={{ minWidth: 0 }}>
                                  <span style={{ fontWeight: 700 }}>{Rs(p.amount)}</span>
                                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                                    {p.periodFrom} → {p.periodTo}
                                  </span>
                                  {p.notes && <div style={{ color: 'var(--text-muted)' }}>{p.notes}</div>}
                                </div>
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-500, #ef4444)', fontSize: 14, padding: '0 4px' }}
                                  onClick={() => handleDeletePayout(p)}
                                  title="Delete payout"
                                >✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* ── All Payouts Table ── */}
        <SectionCard title="All Payout Records" icon={iconPayout}
          action={
            <button className="btn btn-primary btn-sm" onClick={() => openPayout()}>+ Record Payout</button>
          }
        >
          {payouts.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>No payouts recorded yet.</p>
          ) : (
            <>
              <SearchBar value={payoutSearch} onChange={setPayoutSearch} placeholder="Search by owner name, notes…" resultCount={payouts.filter(p => {
                if (!payoutSearch) return true;
                const q = payoutSearch.toLowerCase();
                return (p.ownerName || '').toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q);
              }).length} />
              <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Amount</th>
                    <th>Period</th>
                    <th>Paid At</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.filter(p => {
                    if (!payoutSearch) return true;
                    const q = payoutSearch.toLowerCase();
                    return (p.ownerName || '').toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q);
                  }).map((p, idx) => {
                    const ownerIdx = owners.findIndex(o => o.id === p.ownerId);
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: ['#ede9fe','#dbeafe','#dcfce7','#ffedd5'][ownerIdx % 4] || '#f3f4f6',
                              color: ['#7c3aed','#2563eb','#16a34a','#ea580c'][ownerIdx % 4] || '#6b7280',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12
                            }}>
                              {(p.ownerName || '?').charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold">{p.ownerName || '—'}</span>
                          </div>
                        </td>
                        <td className="font-bold" style={{ color: 'var(--green-600)' }}>{Rs(p.amount)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.periodFrom} → {p.periodTo}</td>
                        <td style={{ fontSize: 12 }}>{new Date(p.paidAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.notes || '—'}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--red-500, #ef4444)', padding: '3px 8px' }}
                            onClick={() => handleDeletePayout(p)}
                          >Delete</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="font-bold">Total</td>
                    <td className="font-bold" style={{ color: 'var(--green-600)' }}>{Rs(totalPaidOut)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
            </>)}
        </SectionCard>

        {/* ── Owner Transfers ── */}
        <SectionCard title="Owner Transfers" icon={iconPayout}
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setShowTransfer(true)}>+ Record Transfer</button>
          }
        >
          {/* Per-owner transfer summary cards */}
          {activeOwners.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 20 }}>
              {activeOwners.map((o, idx) => {
                const clrs = ['#7c3aed', '#2563eb', '#16a34a', '#ea580c'];
                const bgs = ['#f5f3ff', '#eff6ff', '#f0fdf4', '#fff7ed'];
                const transferOut = ownerTransferOut[o.id] || 0;
                const transferIn = ownerTransferIn[o.id] || 0;
                const netTransfer = transferIn - transferOut;
                const color = clrs[idx % clrs.length];
                const bg = bgs[idx % bgs.length];

                return (
                  <div key={o.id} style={{ borderRadius: 12, border: `1.5px solid ${color}30`, background: bg, overflow: 'hidden' }}>
                    <div style={{ height: 5, background: color }} />
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>
                            {o.name.charAt(0)}
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{o.name}</span>
                        </div>
                      </div>
                      {[
                        { label: 'Transfer Out', value: Rs(transferOut), valueColor: '#dc2626' },
                        { label: 'Transfer In', value: Rs(transferIn), valueColor: '#16a34a' },
                        { label: 'Net Transfer', value: Rs(Math.abs(netTransfer)), valueColor: netTransfer >= 0 ? '#16a34a' : '#dc2626', prefix: netTransfer >= 0 ? '+' : '-' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #0000000a' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.prefix || ''}{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Individual transfer records */}
          {transfers.filter((t: any) => t.transactionType === 'internal_transfer_out').length === 0 ? (
            <p style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>No transfers recorded yet.</p>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Transfer History</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {transfers
                  .filter((t: any) => t.transactionType === 'internal_transfer_out')
                  .map((t: any) => {
                    const fromIdx = owners.findIndex(o => o.id === t.ownerId);
                    const toIdx = owners.findIndex(o => o.id === t.counterpartOwnerId);
                    const clrs = ['#7c3aed', '#2563eb', '#16a34a', '#ea580c'];
                    const bgs = ['#f5f3ff', '#eff6ff', '#f0fdf4', '#fff7ed'];
                    const fromColor = clrs[fromIdx % clrs.length] || '#6b7280';
                    const toColor = clrs[toIdx % clrs.length] || '#6b7280';
                    const cardBg = bgs[fromIdx % bgs.length] || '#f9fafb';

                    return (
                      <div key={t.id} style={{ borderRadius: 12, border: `1.5px solid ${fromColor}30`, background: cardBg, overflow: 'hidden' }}>
                        <div style={{ height: 5, background: `linear-gradient(90deg, ${fromColor}, ${toColor})` }} />
                        <div style={{ padding: '14px 16px' }}>
                          {/* From -> To row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: fromColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                                {(t.ownerName || '?').charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{t.ownerName}</span>
                            </div>
                            <span style={{ fontSize: 16, color: 'var(--text-muted)' }}>→</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: toColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                                {(t.counterpartOwnerName || '?').charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{t.counterpartOwnerName}</span>
                            </div>
                          </div>

                          {/* Amount */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #0000000a' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Amount</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>{Rs(t.amount)}</span>
                          </div>

                          {/* Date */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #0000000a' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date</span>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{new Date(t.occurredAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>

                          {/* Description */}
                          {t.description && (
                            <div style={{ padding: '6px 0', borderBottom: '1px solid #0000000a' }}>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Note: </span>
                              <span style={{ fontSize: 12, color: 'var(--text-main)' }}>{t.description}</span>
                            </div>
                          )}

                          {/* Delete button */}
                          <div style={{ marginTop: 10, textAlign: 'right' }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--red-500, #ef4444)', padding: '4px 12px', fontSize: 12 }}
                              onClick={() => handleDeleteTransfer(t)}
                            >Delete</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </>
  );
}
