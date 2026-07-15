import { useState } from 'react';
import { SaleReturnModal, SaleRefundModal } from './Modals';
import { usePopup } from './Popup';
import SearchBar from './SearchBar';
import DetailModal from './DetailModal';
import { formatItemCode } from '../lib/catalog';

export default function OrdersTable({ orders, onRefresh }: { orders: any[]; onRefresh?: () => void }) {
  const { toast } = usePopup();
  const [returningItem, setReturningItem] = useState<{ order: any; item: any } | null>(null);
  const [refundingItem, setRefundingItem] = useState<{ order: any; item: any } | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detailOrder, setDetailOrder] = useState<any | null>(null);

  const filtered = orders.filter((o: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.orderCode || '').toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q) ||
      (o.productName || '').toLowerCase().includes(q) ||
      (o.storeName || '').toLowerCase().includes(q) ||
      (o.type || '').toLowerCase().includes(q)
    );
  });

  const toggleExpand = (orderId: string) => {
    setExpandedOrderId(prev => prev === orderId ? null : orderId);
  };

  const handleReturnConfirm = async (payload: any) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReturn: true, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process return');
      toast.success('\u2705 Sale return processed');
      setReturningItem(null);
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.message || 'Return failed');
    }
  };

  const handleRefundConfirm = async (payload: any) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRefund: true, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process refund');
      toast.success(`\u2705 Refund processed — ${(data.refundAmount || 0).toLocaleString()} issued`);
      setRefundingItem(null);
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.message || 'Refund failed');
    }
  };

  const handleUndoReturn = async (orderItemId: string) => {
    if (!confirm('Undo this return? The item will be marked as sold again.')) return;
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isUndoReturn: true, orderItemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to undo return');
      toast.success('\u2705 Return undone');
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.message || 'Undo return failed');
    }
  };

  const handleUndoRefund = async (orderItemId: string) => {
    if (!confirm('Undo this refund? The refund will be reversed and order financials will be restored.')) return;
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isUndoRefund: true, orderItemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to undo refund');
      toast.success('\u2705 Refund undone');
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.message || 'Undo refund failed');
    }
  };

  const hasItems = (o: any) => Array.isArray(o.items) && o.items.length > 0;

  return (
    <>
    <div className="section">
      <div className="section-header">
        <h3>Recent Orders</h3>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by order code, product, store…" resultCount={filtered.length} />
      <div className="table-container">
        <table className="table sticky-actions">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Date</th>
              <th>Store Name</th>
              <th>Item Name</th>
              <th>Item ID</th>
              <th>Total Price</th>
              <th>Profit</th>
              <th>Type</th>
              <th>Payout</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={12} style={{textAlign:'center', padding:'2rem'}} className="muted">{search ? 'No orders match your search.' : 'No orders found.'}</td></tr>
            ) : filtered.map(o => {
              const isLegacy = !hasItems(o);
              const items = o.items || [];
              const totalQty = Number(o.quantity) || 0;
              const orderReturnedQty = Math.min(Number(o.returnQuantity) || 0, totalQty);
              const orderRefundedQty = Math.min(Number(o.refundQuantity) || 0, totalQty - orderReturnedQty);
              const isExpanded = expandedOrderId === o.id;

              return (
                <>
                  <tr key={o.id} style={{ cursor: 'pointer', background: isExpanded ? 'var(--surface-2)' : undefined }}
                      onClick={() => toggleExpand(o.id)}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{o.orderCode || o.id.slice(0, 8)}</td>
                    <td>{new Date(o.date).toLocaleDateString()}</td>
                    <td><span className="badge" style={{background:'#e0f2fe', color:'#0369a1'}}>{o.storeName}</span></td>
                    <td style={{fontWeight:500}}>
                      {o.productName}
                      {!isLegacy && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--pri-600)', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>}
                    </td>
                    <td className="muted" style={{fontWeight:600, fontFamily:'monospace', fontSize:11}}>{formatItemCode(o.batchNumber || o.id)}</td>
                    <td>{totalQty}</td>
                    <td>Rs {(Number(o.sellingPrice || 0) * totalQty).toLocaleString()}</td>
                    <td style={{color: (o.profit || 0) > 0 ? 'var(--success)' : (o.profit || 0) < 0 ? 'var(--danger)' : 'inherit', fontWeight:600}}>
                      Rs {Number(o.profit || 0).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${o.type === 'Gift' ? 'badge-pending' : 'badge-success'}`}>{o.type || 'Sale'}</span>
                    </td>
                    <td>
                      <span className={`badge ${o.includedInPayout ? 'badge-success' : 'badge-pending'}`}>{o.includedInPayout ? 'Yes' : 'No'}</span>
                    </td>
                    <td>
                      {(orderReturnedQty > 0 || orderRefundedQty > 0)
                        ? <span className="badge badge-pending" style={{fontSize:11}}>{orderReturnedQty} returned · {orderRefundedQty} refunded</span>
                        : <span className="badge badge-success" style={{fontSize:11}}>Active</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px' }} onClick={(e) => { e.stopPropagation(); toggleExpand(o.id); }}>
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={(e) => { e.stopPropagation(); setDetailOrder(o); }}>
                          Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${o.id}-items`}>
                      <td colSpan={12} style={{ padding: 0, background: 'var(--surface-1)' }}>
                        <div style={{ padding: '8px 12px' }}>
                          {isLegacy ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>Legacy order (no line items). Use the original order record for returns/refunds.</div>
                          ) : items.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>No line items found.</div>
                          ) : (
                            <table className="table" style={{ fontSize: 12 }}>
                              <thead>
                                <tr>
                              <th>Item Name</th>
                              <th>Item ID</th>
                              <th>Qty</th>
                                  <th>Price</th>
                                  <th>Profit</th>
                                  <th>Status</th>
                                  <th style={{ textAlign: 'center' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item: any) => {
                                  const itemSold = Number(item.quantity) || 0;
                                  const itemRet = Math.min(Number(item.returnQuantity) || 0, itemSold);
                                  const itemRef = Math.min(Number(item.refundQuantity) || 0, itemSold - itemRet);
                                  const itemRemaining = itemSold - itemRet - itemRef;

                                  return (
                                    <tr key={item.id} style={{ opacity: (itemRet > 0 || itemRef > 0) ? 0.7 : 1 }}>
                                      <td style={{ fontWeight: 500 }}>{item.productName}</td>
                                      <td className="muted" style={{fontWeight:600, fontFamily:'monospace', fontSize:11}}>{formatItemCode(item.batchNumber || item.id)}</td>
                                      <td>{item.quantity}</td>
                                      <td>Rs {(Number(item.sellingPrice) * itemSold).toLocaleString()}</td>
                                      <td style={{ color: (item.profit || 0) > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>Rs {Number(item.profit || 0).toLocaleString()}</td>
                                      <td>
                                        {itemRet >= itemSold
                                          ? <span className="badge badge-red" style={{fontSize:10}}>Returned{item.returnReason ? ` — ${item.returnReason}` : ''}</span>
                                          : itemRef >= (itemSold - itemRet)
                                            ? <span className="badge badge-red" style={{fontSize:10}}>Refunded{item.refundReason ? ` — ${item.refundReason}` : ''}</span>
                                            : itemRet > 0
                                              ? <span className="badge badge-pending" style={{fontSize:10}}>Partial return — {itemRet}/{itemSold}</span>
                                              : itemRef > 0
                                                ? <span className="badge badge-pending" style={{fontSize:10}}>Partial refund — {itemRef}/{itemSold}</span>
                                                : <span className="badge badge-success" style={{fontSize:10}}>Active</span>
                                        }
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        {(() => {
                                          // If this returned order's inventory has already been sold on to a
                                          // new order, all mutating actions are locked — we cannot undo return
                                          // because the stock is no longer here.
                                          const isRestockedLocked = (o.orderReturned && o.restockedFromOrderId != null)
                                          if (isRestockedLocked) {
                                            return <span className="badge badge-pending" style={{ fontSize: 10, opacity: 0.7 }}>Locked (re-stocked)</span>
                                          }
                                          if (!itemRet && !itemRef && itemRemaining > 0) {
                                            return (
                                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }} onClick={() => setReturningItem({ order: o, item })}>Return</button>
                                                <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', background: '#fee2e2', borderColor: '#fecaca', color: '#991b2b' }} onClick={() => setRefundingItem({ order: o, item })}>Refund</button>
                                              </div>
                                            )
                                          }
                                          if (itemRet > 0) {
                                            return <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', background: '#e0e7ff', borderColor: '#c7d2fe', color: '#3730a3' }} onClick={() => handleUndoReturn(item.id)}>Undo Return</button>
                                          }
                                          if (itemRef > 0) {
                                            return <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 8px', background: '#fce7f3', borderColor: '#fbcfe8', color: '#831843' }} onClick={() => handleUndoRefund(item.id)}>Undo Refund</button>
                                          }
                                          return null
                                        })()}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    {returningItem && (
      <SaleReturnModal
        order={{
          id: returningItem.order.id,
          productName: returningItem.item.productName,
          storeName: returningItem.order.storeName,
          quantity: returningItem.item.quantity,
          sizeQuantities: returningItem.item.sizeQuantities ?? null,
          colorQuantities: returningItem.item.colorQuantities ?? null,
          returnQuantity: returningItem.item.returnQuantity ?? null,
          returnSizeQuantities: returningItem.item.returnSizeQuantities ?? null,
          returnColorQuantities: returningItem.item.returnColorQuantities ?? null,
          returnVariantQuantities: returningItem.item.returnVariantQuantities ?? null,
          storeInventoryId: returningItem.item.storeInventoryId ?? null,
        }}
        onConfirm={(payload: any) => handleReturnConfirm({ ...payload, orderItemId: returningItem.item.id })}
        onClose={() => setReturningItem(null)}
      />
    )}

    {refundingItem && (
      <SaleRefundModal
        order={{
          id: refundingItem.order.id,
          productName: refundingItem.item.productName,
          storeName: refundingItem.order.storeName,
          quantity: refundingItem.item.quantity,
          sellingPrice: refundingItem.item.sellingPrice ?? 0,
          costPrice: refundingItem.item.costPrice ?? 0,
          sizeQuantities: refundingItem.item.sizeQuantities ?? null,
          colorQuantities: refundingItem.item.colorQuantities ?? null,
          variantQuantities: refundingItem.item.variantQuantities ?? null,
          returnQuantity: refundingItem.item.returnQuantity ?? null,
          returnSizeQuantities: refundingItem.item.returnSizeQuantities ?? null,
          returnColorQuantities: refundingItem.item.returnColorQuantities ?? null,
          returnVariantQuantities: refundingItem.item.returnVariantQuantities ?? null,
          refundQuantity: refundingItem.item.refundQuantity ?? null,
          refundSizeQuantities: refundingItem.item.refundSizeQuantities ?? null,
          refundColorQuantities: refundingItem.item.refundColorQuantities ?? null,
          refundVariantQuantities: refundingItem.item.refundVariantQuantities ?? null,
        }}
        onConfirm={(payload: any) => handleRefundConfirm({ ...payload, orderItemId: refundingItem.item.id })}
        onClose={() => setRefundingItem(null)}
      />
    )}

    <DetailModal
      open={!!detailOrder}
      onClose={() => setDetailOrder(null)}
      title={detailOrder ? `Order Details — ${detailOrder.orderCode || detailOrder.id}` : undefined}
      data={detailOrder || {}}
    />
    </>
  );
}
