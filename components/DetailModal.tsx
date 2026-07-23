import React from 'react';

// Section Category Icons
const sectionIcons: Record<string, React.ReactNode> = {
  IDENTIFIERS: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  FINANCIALS: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  QUANTITIES: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
      <path d="m3.3 7 8.7 5 8.7-5"/>
      <path d="M12 22V12"/>
    </svg>
  ),
  DATES: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  STATUS: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  DETAILS: (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  ),
};

function renderFormattedObjectOrArray(obj: any) {
  if (obj === null || obj === undefined) {
    return <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>—</span>;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>—</span>;
    }
    return (
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
        {obj.map((item, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--surface-3)',
              color: 'var(--text-head)',
              padding: '3px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>—</span>;
    }
    return (
      <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
        {entries.map(([k, v]) => (
          <span
            key={k}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--surface-3)',
              color: 'var(--text-head)',
              padding: '3px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>{k}</span>
            <span style={{ color: 'var(--acc)', fontWeight: 800 }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </span>
        ))}
      </div>
    );
  }

  return <span>{String(obj)}</span>;
}

function DetailValue({ value, isMoney, isId, isDate }: { value: any; isMoney?: boolean; isId?: boolean; isDate?: boolean }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>—</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span className={`badge ${value ? 'badge-green' : 'badge-red'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {value ? '✓ Active / Yes' : '✕ Inactive / No'}
      </span>
    );
  }

  if (typeof value === 'object') {
    return renderFormattedObjectOrArray(value);
  }

  if (typeof value === 'number') {
    if (isMoney) {
      return (
        <span style={{ fontWeight: 800, color: 'var(--acc)', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
          Rs {value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </span>
      );
    }
    return (
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-head)' }}>
        {value.toLocaleString()}
      </span>
    );
  }

  const str = String(value);

  // Check if string contains stringified JSON object/array
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      return renderFormattedObjectOrArray(parsed);
    } catch {}
  }

  if (isId) {
    return (
      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          fontWeight: 600,
          background: 'var(--surface-3)',
          color: 'var(--text-head)',
          padding: '2px 8px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          display: 'inline-block',
          wordBreak: 'break-all',
        }}
      >
        {str}
      </span>
    );
  }

  if (isDate) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return (
          <span style={{ fontWeight: 600, color: 'var(--text-head)' }}>
            {d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        );
      }
    } catch {}
  }

  return <span style={{ color: 'var(--text-body)', fontWeight: 500, wordBreak: 'break-word' }}>{str}</span>;
}

export default function DetailModal({
  open,
  onClose,
  title,
  data,
  fields,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  data: Record<string, any> | null | undefined;
  fields?: { label: string; key: string; render?: (v: any) => React.ReactNode }[];
}) {
  if (!open || !data) return null;

  const entries = fields
    ? fields.map(f => ({ label: f.label, value: (data as any)[f.key], render: f.render }))
    : Object.entries(data).map(([key, value]) => ({ label: key, value, render: undefined }));

  const sectionize = (items: { label: string; value: any; render?: (v: any) => React.ReactNode }[]) => {
    const groups: { title: string; items: typeof items }[] = [];
    const getGroup = (t: string) => {
      let g = groups.find(x => x.title === t);
      if (!g) {
        g = { title: t, items: [] };
        groups.push(g);
      }
      return g;
    };

    items.forEach(item => {
      const label = item.label;
      const isId = label === 'id' || label.endsWith('Id') || label === 'productId' || label === 'storeId' || label === 'inventoryId' || label === 'orderId' || label === 'ownerId';
      const isCode = label === 'orderCode' || label === 'batchNumber';
      const isDate = label === 'date' || label === 'occurred_at' || label === 'created_at' || label === 'updated_at' || label === 'expense_date' || label === 'paidAt' || label === 'periodFrom' || label === 'periodTo' || label === 'returned_at' || label === 'refunded_at';
      const isStatus = label === 'status' || label === 'paymentStatus' || label === 'includedInPayout' || label === 'isActive' || label === 'orderReturned';
      const isMoney = label === 'sellingPrice' || label === 'costPrice' || label === 'commissionAmount' || label === 'adminTake' || label === 'profit' || label === 'amount' || label === 'ownerSupplyPrice' || label === 'storeSellingPrice' || label === 'grossRevenue' || label === 'totalDeductions' || label === 'netProfit' || label === 'revenue' || label === 'cogs' || label === 'shipment' || label === 'commission' || label.endsWith('Price') || label.endsWith('Amount') || label.endsWith('Profit') || label.endsWith('Cost');
      const isQty = label === 'quantity' || label === 'quantityAssigned' || label === 'quantityRemaining' || label === 'returnQuantity' || label === 'refundQuantity' || label === 'rawQuantity' || label === 'chargeableQty' || label.endsWith('Qty');

      if (isId || isCode) {
        getGroup('IDENTIFIERS').items.push(item);
      } else if (isMoney) {
        getGroup('FINANCIALS').items.push(item);
      } else if (isQty) {
        getGroup('QUANTITIES').items.push(item);
      } else if (isDate) {
        getGroup('DATES').items.push(item);
      } else if (isStatus) {
        getGroup('STATUS').items.push(item);
      } else {
        getGroup('DETAILS').items.push(item);
      }
    });

    return groups.filter(g => g.items.length > 0);
  };

  const groups = sectionize(entries);

  // Identify hero title code/id if present
  const codeValue = data.orderCode || data.batchNumber || data.productName || data.name || data.id;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box detail-modal-box"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 760,
          width: '92%',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '20px 24px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title || 'Record Details'}
              </h3>
              {codeValue && (
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.75)', marginTop: 3, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Item / Order: <span style={{ color: '#ffffff', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{String(codeValue)}</span>
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              flexShrink: 0,
              outline: 'none',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body: Cards Grid */}
        <div
          className="modal-body"
          style={{
            padding: 24,
            maxHeight: '72vh',
            overflowY: 'auto',
            background: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {groups.map((group, gi) => (
              <div
                key={gi}
                style={{
                  background: 'var(--surface)',
                  borderRadius: 14,
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-xs)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* Section Title Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-head)',
                  }}
                >
                  <span style={{ color: 'var(--acc)', display: 'flex' }}>
                    {sectionIcons[group.title] || sectionIcons.DETAILS}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-head)',
                    }}
                  >
                    {group.title}
                  </span>
                </div>

                {/* Section Items Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {group.items.map((item, idx) => {
                    const formattedLabel = item.label
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, s => s.toUpperCase());

                    const isId = item.label === 'id' || item.label.endsWith('Id') || item.label === 'orderCode' || item.label === 'batchNumber';
                    const isMoney = item.label === 'sellingPrice' || item.label === 'costPrice' || item.label === 'commissionAmount' || item.label === 'adminTake' || item.label === 'profit' || item.label === 'amount' || item.label === 'ownerSupplyPrice' || item.label.endsWith('Price') || item.label.endsWith('Amount') || item.label.endsWith('Profit') || item.label.endsWith('Cost');
                    const isDate = item.label.includes('date') || item.label.includes('At') || item.label.includes('created_at') || item.label.includes('updated_at');

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                          padding: '6px 0',
                          borderBottom: idx === group.items.length - 1 ? 'none' : '1px dashed var(--border)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            flexShrink: 0,
                          }}
                        >
                          {formattedLabel}
                        </span>
                        <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                          {item.render ? (
                            item.render(item.value)
                          ) : (
                            <DetailValue value={item.value} isMoney={isMoney} isId={isId} isDate={isDate} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ borderRadius: 10, padding: '0 24px', fontWeight: 700 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
