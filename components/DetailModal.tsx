import React from 'react';

function DetailValue({ value, mono }: { value: any; mono?: boolean }) {
  if (value === null || value === undefined) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  if (typeof value === 'boolean') return <span>{value ? '✅' : '❌'}</span>;
  if (typeof value === 'object') {
    try {
      const text = JSON.stringify(value, null, 2);
      return (
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowX: 'auto',
            overflowY: 'hidden',
            maxHeight: 260,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            background: 'var(--surface-2)',
            padding: 8,
            borderRadius: 6,
          }}
        >
          {text}
        </pre>
      );
    } catch {
      return <span>{String(value)}</span>;
    }
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</span>;
    return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  }
  return <span style={mono ? { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, wordBreak: 'break-word' } : undefined}>{String(value)}</span>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="detail-section" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>{title}</div>
      <div className="detail-section-grid">
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  if (span && span > 1) {
    return (
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span className="detail-row-label" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    );
  }
  return (
    <>
      <span className="detail-row-label" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, alignSelf: 'flex-start' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{children}</span>
    </>
  );
}

export default function DetailModal({ open, onClose, title, data, fields }: { open: boolean; onClose: () => void; title?: string; data: Record<string, any> | null | undefined; fields?: { label: string; key: string; render?: (v: any) => React.ReactNode }[] }) {
  if (!open || !data) return null;

  const entries = fields
    ? fields.map(f => ({ label: f.label, value: (data as any)[f.key], render: f.render }))
    : Object.entries(data).map(([key, value]) => ({ label: key, value, render: undefined }));

  const sectionize = (items: { label: string; value: any; render?: (v: any) => React.ReactNode }[]) => {
    const groups: { title?: string; items: typeof items }[] = [];
    let current: { title?: string; items: typeof items } = { items: [] };

    items.forEach(item => {
      const label = item.label;
      const isId = label === 'id' || label.endsWith('Id') || label === 'productId' || label === 'storeId' || label === 'inventoryId' || label === 'orderId' || label === 'ownerId';
      const isCode = label === 'orderCode' || label === 'batchNumber';
      const isDate = label === 'date' || label === 'occurred_at' || label === 'created_at' || label === 'updated_at' || label === 'expense_date' || label === 'paidAt' || label === 'periodFrom' || label === 'periodTo' || label === 'returned_at' || label === 'refunded_at';
      const isStatus = label === 'status' || label === 'paymentStatus' || label === 'includedInPayout' || label === 'isActive' || label === 'orderReturned';
      const isMoney = label === 'sellingPrice' || label === 'costPrice' || label === 'commissionAmount' || label === 'adminTake' || label === 'profit' || label === 'amount' || label === 'ownerSupplyPrice' || label === 'storeSellingPrice' || label === 'grossRevenue' || label === 'totalDeductions' || label === 'netProfit' || label === 'revenue' || label === 'cogs' || label === 'netProfit' || label === 'shipment' || label === 'commission' || label.endsWith('Price') || label.endsWith('Amount') || label.endsWith('Profit') || label.endsWith('Cost');
      const isQty = label === 'quantity' || label === 'quantityAssigned' || label === 'quantityRemaining' || label === 'returnQuantity' || label === 'refundQuantity' || label === 'rawQuantity' || label === 'chargeableQty' || label.endsWith('Qty');

      if (isId || isCode) {
        if (current.title !== 'IDENTIFIERS') { groups.push({ title: 'IDENTIFIERS', items: [] }); current = groups[groups.length - 1]; }
      } else if (isDate) {
        if (current.title !== 'DATES') { groups.push({ title: 'DATES', items: [] }); current = groups[groups.length - 1]; }
      } else if (isStatus) {
        if (current.title !== 'STATUS') { groups.push({ title: 'STATUS', items: [] }); current = groups[groups.length - 1]; }
      } else if (isMoney) {
        if (current.title !== 'FINANCIALS') { groups.push({ title: 'FINANCIALS', items: [] }); current = groups[groups.length - 1]; }
      } else if (isQty) {
        if (current.title !== 'QUANTITIES') { groups.push({ title: 'QUANTITIES', items: [] }); current = groups[groups.length - 1]; }
      } else {
        if (current.title !== 'DETAILS') { groups.push({ title: 'DETAILS', items: [] }); current = groups[groups.length - 1]; }
      }
      current.items.push(item);
    });

    return groups.filter(g => g.items.length > 0);
  };

  const groups = sectionize(entries);

  const renderValue = (item: { value: any; render?: (v: any) => React.ReactNode }) => {
    if (item.render) return item.render(item.value);
    if (item.value === null || item.value === undefined) return <DetailValue value={item.value} />;
    if (typeof item.value === 'boolean') return <DetailValue value={item.value} />;
    if (typeof item.value === 'object') return <DetailValue value={item.value} />;
    if (typeof item.value === 'number') return <DetailValue value={item.value} mono />;
    return <DetailValue value={item.value} mono />;
  };

  const isLongText = (v: any) => typeof v === 'string' && v.length > 60;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box detail-modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-head" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h3 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>{title || 'Details'}</h3>
          <button className="btn btn-sm" onClick={onClose} style={{ border: 'none', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, minHeight: 0, paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          {groups.map((group, gi) => (
            <DetailSection key={gi} title={group.title || 'DETAILS'}>
              {group.items.map((item, idx) => (
                <DetailRow key={idx} label={item.label.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} span={isLongText(item.value) ? 2 : undefined}>
                  {renderValue(item)}
                </DetailRow>
              ))}
            </DetailSection>
          ))}
        </div>
      </div>
    </div>
  );
}
