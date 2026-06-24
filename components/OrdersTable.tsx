import { useState } from 'react';
import { SaleReturnModal, SaleRefundModal } from './Modals';
import { usePopup } from './Popup';

export default function OrdersTable({ orders, onRefresh }: { orders: any[]; onRefresh?: () => void }) {
  const { toast } = usePopup();
  const [returningOrder, setReturningOrder] = useState<any | null>(null);
  const [refundingOrder, setRefundingOrder] = useState<any | null>(null);

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
      setReturningOrder(null);
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
      setRefundingOrder(null);
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.message || 'Refund failed');
    }
  };

  const handleUndoReturn = async (orderId: string) => {
    if (!confirm('Undo this return? The item will be marked as sold again.')) return;
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isUndoReturn: true, id: orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to undo return');
      toast.success('\u2705 Return undone');
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.message || 'Undo return failed');
    }
  };

  const handleUndoRefund = async (orderId: string) => {
    if (!confirm('Undo this refund? The refund will be reversed and order financials will be restored.')) return;
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isUndoRefund: true, id: orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to undo refund');
      toast.success('\u2705 Refund undone');
      onRefresh?.();
    } catch (e: any) {
      toast.error(e?.message || 'Undo refund failed');
    }
  };

  return (
    <>
    <div className="section">
      <div className="section-header">
        <h3>Recent Orders</h3>
      </div>
      <div className="table-container">
        <table className="table sticky-actions">
          <thead>
            <tr>
              <th>Date</th>
              <th>Store Name</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Total Price</th>
              <th>Cost Price</th>
              <th>Store Percentage</th>
              <th>Profit</th>
              <th>Type</th>
              <th>Payout</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={12} style={{textAlign:'center', padding:'2rem'}} className="muted">No orders found.</td></tr>
            ) : orders.map(o => {
              const soldQty = Number(o.quantity) || 0;
              const returnedQty = Math.min(Number(o.returnQuantity) || 0, soldQty);
              const refundedQty = Math.min(Number(o.refundQuantity) || 0, soldQty - returnedQty);
              const fullyReturned = returnedQty > 0 ? returnedQty >= soldQty : Boolean(o.orderReturned);
              const fullyRefunded = refundedQty > 0 && refundedQty >= (soldQty - returnedQty);
              const hasAnyAction = returnedQty > 0 || refundedQty > 0;
              const remainingQty = soldQty - returnedQty - refundedQty;

              return (
                <tr key={o.id} style={{ opacity: hasAnyAction ? 0.6 : 1 }}>
                  <td>{new Date(o.date).toLocaleDateString()}</td>
                  <td><span className="badge" style={{background:'#e0f2fe', color:'#0369a1'}}>{o.storeName}</span></td>
                  <td style={{fontWeight:500}}>{o.productName}</td>
                  <td>
                    {hasAnyAction
                      ? <>
                          <span style={{textDecoration:'line-through', opacity:0.5}}>{o.quantity}</span>
                          {returnedQty > 0 && <span style={{color:'var(--warning,#f59e0b)',fontWeight:700}}> ↩ {returnedQty} returned</span>}
                          {refundedQty > 0 && <span style={{color:'var(--danger)',fontWeight:700}}> 💸 {refundedQty} refunded</span>}
                          {remainingQty > 0 && <span style={{color:'var(--text-muted)',fontWeight:500}}> ({remainingQty} left)</span>}
                        </>
                      : o.quantity
                    }
                  </td>
                  <td>
                    {hasAnyAction
                      ? <>
                          <span style={{textDecoration:'line-through', opacity:0.5}}>${(Number(o.sellingPrice) * soldQty).toLocaleString()}</span>
                          <span style={{fontWeight:700}}> ${(Number(o.sellingPrice) * remainingQty).toLocaleString()}</span>
                        </>
                      : `$${(Number(o.sellingPrice) * soldQty).toLocaleString()}`
                    }
                  </td>
                  <td>${Number(o.costPrice).toLocaleString()}</td>
                  <td>{o.commissionPercent ?? '-'}%</td>
                  <td style={{color: o.profit > 0 ? 'var(--success)' : o.profit < 0 ? 'var(--danger)' : 'inherit', fontWeight:600}}>
                    ${Number(o.profit || 0).toLocaleString()}
                  </td>
                  <td>
                    <span className={`badge ${o.type === 'Gift' ? 'badge-pending' : 'badge-success'}`}>
                      {o.type || 'Sale'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${o.includedInPayout ? 'badge-success' : 'badge-pending'}`}>
                      {o.includedInPayout ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>
                    {fullyReturned
                      ? <span className="badge badge-red" style={{fontSize:11}}>Returned{o.returnReason ? ` — ${o.returnReason}` : ''}</span>
                      : fullyRefunded
                        ? <span className="badge badge-red" style={{fontSize:11}}>Refunded{o.refundReason ? ` — ${o.refundReason}` : ''}</span>
                        : returnedQty > 0 && refundedQty > 0
                          ? <span className="badge badge-pending" style={{fontSize:11}}>↩ {returnedQty} returned · 💸 {refundedQty} refunded</span>
                          : returnedQty > 0
                            ? <span className="badge badge-pending" style={{fontSize:11}}>Partial return — {returnedQty}/{soldQty}</span>
                            : refundedQty > 0
                              ? <span className="badge badge-pending" style={{fontSize:11}}>Partial refund — {refundedQty}/{soldQty}</span>
                              : <span className="badge badge-success" style={{fontSize:11}}>Active</span>
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {!fullyReturned && !fullyRefunded && remainingQty > 0 && (
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '3px 10px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}
                          onClick={() => setReturningOrder(o)}
                          title="Return this sale"
                        >
                          &#x21A9; Return
                        </button>
                      )}
                      {!fullyReturned && !fullyRefunded && remainingQty > 0 && (
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '3px 10px', background: '#fee2e2', borderColor: '#fecaca', color: '#991b1b' }}
                          onClick={() => setRefundingOrder(o)}
                          title="Refund this sale (customer keeps item)"
                        >
                          💸 Refund
                        </button>
                      )}
                      {returnedQty > 0 && (
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '3px 10px', background: '#e0e7ff', borderColor: '#c7d2fe', color: '#3730a3' }}
                          onClick={() => handleUndoReturn(o.id)}
                          title="Undo return"
                        >
                          ↩ Undo
                        </button>
                      )}
                      {refundedQty > 0 && (
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 11, padding: '3px 10px', background: '#fce7f3', borderColor: '#fbcfe8', color: '#831843' }}
                          onClick={() => handleUndoRefund(o.id)}
                          title="Undo refund"
                        >
                          💸 Undo
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    {returningOrder && (
      <SaleReturnModal
        order={{
          id: returningOrder.id,
          productName: returningOrder.productName,
          storeName: returningOrder.storeName,
          quantity: returningOrder.quantity,
          sizeQuantities: returningOrder.sizeQuantities ?? null,
          colorQuantities: returningOrder.colorQuantities ?? null,
          returnQuantity: returningOrder.returnQuantity ?? null,
          returnSizeQuantities: returningOrder.returnSizeQuantities ?? null,
          returnColorQuantities: returningOrder.returnColorQuantities ?? null,
          returnVariantQuantities: returningOrder.returnVariantQuantities ?? null,
          storeInventoryId: returningOrder.storeInventoryId ?? null,
        }}
        onConfirm={handleReturnConfirm}
        onClose={() => setReturningOrder(null)}
      />
    )}

    {refundingOrder && (
      <SaleRefundModal
        order={{
          id: refundingOrder.id,
          productName: refundingOrder.productName,
          storeName: refundingOrder.storeName,
          quantity: refundingOrder.quantity,
          sellingPrice: refundingOrder.sellingPrice ?? 0,
          costPrice: refundingOrder.costPrice ?? 0,
          sizeQuantities: refundingOrder.sizeQuantities ?? null,
          colorQuantities: refundingOrder.colorQuantities ?? null,
          variantQuantities: refundingOrder.variantQuantities ?? null,
          returnQuantity: refundingOrder.returnQuantity ?? null,
          returnSizeQuantities: refundingOrder.returnSizeQuantities ?? null,
          returnColorQuantities: refundingOrder.returnColorQuantities ?? null,
          returnVariantQuantities: refundingOrder.returnVariantQuantities ?? null,
          refundQuantity: refundingOrder.refundQuantity ?? null,
          refundSizeQuantities: refundingOrder.refundSizeQuantities ?? null,
          refundColorQuantities: refundingOrder.refundColorQuantities ?? null,
          refundVariantQuantities: refundingOrder.refundVariantQuantities ?? null,
        }}
        onConfirm={handleRefundConfirm}
        onClose={() => setRefundingOrder(null)}
      />
    )}
    </>
  );
}
