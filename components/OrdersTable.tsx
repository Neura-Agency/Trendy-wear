import { useState } from 'react';
import { SaleReturnModal } from './Modals';
import { usePopup } from './Popup';

export default function OrdersTable({ orders, onRefresh }: { orders: any[]; onRefresh?: () => void }) {
  const { toast } = usePopup();
  const [returningOrder, setReturningOrder] = useState<any | null>(null);

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

  return (
    <>
    <div className="section">
      <div className="section-header">
        <h3>Recent Orders</h3>
      </div>
      <div className="table-container">
        <table className="table">
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
              const returnedQty = Number(o.returnQuantity) || 0;
              const soldQty = Number(o.quantity) || 0;
              const fullyReturned = returnedQty > 0 ? returnedQty >= soldQty : Boolean(o.orderReturned);
              const remainingQty = Math.max(0, soldQty - returnedQty);

              return (
                <tr key={o.id} style={{ opacity: returnedQty > 0 ? 0.6 : 1 }}>
                  <td>{new Date(o.date).toLocaleDateString()}</td>
                  <td><span className="badge" style={{background:'#e0f2fe', color:'#0369a1'}}>{o.storeName}</span></td>
                  <td style={{fontWeight:500}}>{o.productName}</td>
                  <td>
                    {returnedQty > 0
                      ? <><span style={{textDecoration:'line-through', opacity:0.5}}>{o.quantity}</span> <span style={{color:'var(--danger)',fontWeight:700}}>→ {returnedQty} returned{fullyReturned ? '' : `, ${remainingQty} left`}</span></>
                      : o.quantity
                    }
                  </td>
                  <td>${Number(o.sellingPrice).toLocaleString()}</td>
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
                      : returnedQty > 0
                        ? <span className="badge badge-pending" style={{fontSize:11}}>Partial return — {returnedQty}/{soldQty}</span>
                        : <span className="badge badge-success" style={{fontSize:11}}>Active</span>
                    }
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!fullyReturned && (
                      <button
                        className="btn btn-sm"
                        style={{ fontSize: 11, padding: '3px 10px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}
                        onClick={() => setReturningOrder(o)}
                        title="Return this sale"
                      >
                        &#x21A9; Return
                      </button>
                    )}
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
    </>
  );
}
