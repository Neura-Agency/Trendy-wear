const fs = require('fs');
let content = fs.readFileSync('pages/index.tsx', 'utf8');

// The old mobile card section markers
const mobileStart = '      {/* ── Mobile card view (hidden on desktop) ── */}';
const mobileEnd = '      {/* ── Summary bar ── */}';

const startIdx = content.indexOf(mobileStart);
const endIdx = content.indexOf(mobileEnd);

// Build the replacement
const newSection = `      {/* ── Mobile card view (hidden on desktop) ── */}
      <div className="orders-mobile-cards">
        {orders.length === 0 && (
          <div className="orders-mobile-empty">No partner sales match this period.</div>
        )}
        {orders.map((o, idx) => {
          const soldQty = Number(o.quantity) || 0;
          const returnedQty = Math.min(Number(o.returnQuantity) || 0, soldQty);
          const refundedQty = Math.min(Number(o.refundQuantity) || 0, soldQty - returnedQty);
          const fullyReturned = returnedQty > 0 ? returnedQty >= soldQty : Boolean(o.orderReturned);
          const fullyRefunded = refundedQty > 0 && refundedQty >= (soldQty - returnedQty);
          const remainingQty = soldQty - returnedQty - refundedQty;
          const gross = o.sellingPrice * o.quantity;
          const shipment = o.shipmentCost || 0;
          const netAmount = gross - shipment;
          const totalCost = (o.costPrice || 0) * o.quantity;
          return (
            <div className="order-card" key={idx} onClick={() => setEditing({ ...o })}>
              <div className="order-card-top">
                <span className="order-card-store">{o.storeName}</span>
                <span className="order-card-date">{new Date(o.date).toLocaleDateString()}</span>
              </div>
              <div className="order-card-product">{o.productName}</div>
              <div className="order-card-grid">
                <div className="order-card-field">
                  <span className="order-card-label">Qty</span>
                  <span className="order-card-value">{o.quantity}</span>
                </div>
                <div className="order-card-field">
                  <span className="order-card-label">Total</span>
                  <span className="order-card-value font-bold">{Rs(gross)}</span>
                </div>
                <div className="order-card-field">
                  <span className="order-card-label">Delivery</span>
                  <span className="order-card-value" style={{ color: 'var(--danger)' }}>-{Rs(shipment)}</span>
                </div>
                <div className="order-card-field">
                  <span className="order-card-label">Received</span>
                  <span className="order-card-value font-bold">{Rs(netAmount)}</span>
                </div>
                <div className="order-card-field">
                  <span className="order-card-label">Commission</span>
                  <span className="order-card-value">
                    {isAdmin ? (
                      <InlineCommEdit value={o.commissionPercent} onSave={(v) => onCommissionEdit(o.id, v)} />
                    ) : (
                      <span className="font-bold">{o.commissionPercent}%</span>
                    )}
                  </span>
                </div>
                {isAdmin && (
                  <div className="order-card-field">
                    <span className="order-card-label">Profit</span>
                    <span className="order-card-value font-bold" style={{ color: 'var(--success)' }}>{Rs(o.profit)}</span>
                  </div>
                )}
                <div onClick={e => e.stopPropagation()} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 5,
                  minWidth: 160,
                }}>
                  {/* Row 1: Edit + Delete */}
                  <button
                    className="btn btn-sm"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(99,102,241,0.1)', color: '#4f46e5', border: '1.5px solid rgba(99,102,241,0.25)', borderRadius: 8 }}
                    onClick={(e) => { e.stopPropagation(); openEdit(o); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                    Edit
                  </button>
                  {canDelete ? (
                    <button
                      className="btn btn-sm"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.09)', color: '#dc2626', border: '1.5px solid rgba(239,68,68,0.22)', borderRadius: 8 }}
                      onClick={async (e) => { e.stopPropagation(); if (await confirmDialog('Delete this sale? This action cannot be undone.')) { onDelete(o.id); } }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      Delete
                    </button>
                  ) : <div />}

                  {/* Row 2: Return/Undo + Refund/Undo */}
                  {fullyReturned ? (
                    <button
                      className="btn btn-sm"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(107,114,128,0.1)', color: '#4b5563', border: '1.5px solid rgba(107,114,128,0.22)', borderRadius: 8, gridColumn: '1 / -1' }}
                      onClick={async (e) => { e.stopPropagation(); if (await confirmDialog('Undo this return? The sale will be restored and stock will be deducted again.')) { onUndoReturn(o.id); } }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a6 6 0 0 1 0 12H8"/></svg>
                      Undo Return
                    </button>
                  ) : refundedQty > 0 && !fullyReturned ? (
                    <button
                      className="btn btn-sm"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(107,114,128,0.1)', color: '#4b5563', border: '1.5px solid rgba(107,114,128,0.22)', borderRadius: 8, gridColumn: '1 / -1' }}
                      onClick={async (e) => { e.stopPropagation(); if (await confirmDialog('Undo this refund? The sale financials will be restored to their pre-refund state.')) { onUndoRefund(o.id); } }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a6 6 0 0 1 0 12H8"/></svg>
                      Undo Refund
                    </button>
                  ) : !fullyReturned && !fullyRefunded && remainingQty > 0 ? (
                    <>
                      <button
                        className="btn btn-sm"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1.5px solid rgba(245,158,11,0.28)', borderRadius: 8 }}
                        onClick={(e) => { e.stopPropagation(); setReturningOrder(o); }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                        Return
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(220,38,38,0.09)', color: '#b91c1c', border: '1.5px solid rgba(220,38,38,0.22)', borderRadius: 8 }}
                        onClick={(e) => { e.stopPropagation(); setRefundingOrder(o); }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        Refund
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
`;

content = content.substring(0, startIdx) + newSection + content.substring(endIdx);
fs.writeFileSync('pages/index.tsx', content, 'utf8');
console.log('Done - Mobile card view fixed');