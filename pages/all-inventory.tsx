import { useEffect, useState } from 'react';
import SectionCard from '../components/SectionCard';
import Badge from '../components/Badge';
import Login from '../components/Login';
import SearchBar from '../components/SearchBar';
import DetailModal from '../components/DetailModal';
import { InventoryItem, PageProps } from '../types';
import { formatItemCode } from '../lib/catalog';
import ContextHelp from "../components/ContextHelp";

const IC = {
  warehouse: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
};

const Rs = (n: number) => 'Rs ' + (Number(n) || 0).toLocaleString();

export default function AllInventoryPage({ user, onLogin }: PageProps) {
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [detailItem, setDetailItem] = useState<any | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/inventory');
        const data = await res.json();
        setInventory(data.inventory || []);
      } catch (e) {
        console.error(e);
        setInventory([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (!user) return <Login onLogin={onLogin} />;
  if (loading) return <div className="loading">Loading...</div>;

  const filtered = search
    ? inventory.filter(item => {
        const q = search.toLowerCase();
        return (
          item.productName?.toLowerCase().includes(q) ||
          item.batchNumber?.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q) ||
          (item as any).brand?.toLowerCase().includes(q)
        );
      })
    : inventory;

  return (
    <div className="inventory-page">
      <header className="page-header">
        <div className="header-content">
          <div className="header-titles">
            <h1 className="main-title">All Warehouse Inventory <ContextHelp id="inventory.allInventory" /></h1>
            <p className="subtitle">Read-only view of every warehouse batch available in the system.</p>
          </div>
        </div>
      </header>

      <SectionCard title="Warehouse Inventory" icon={IC.warehouse} helpKey="inventory.warehouse">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, brand, type, item ID…" resultCount={filtered.length} />
        <div className="table-wrap">
          <table className="desktop-table-view">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Type</th>
                <th>Item ID</th>
                <th>Cost/pc</th>
                <th>Qty</th>
                <th>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted empty-cell">
                    {search ? 'No warehouse inventory matches your search.' : 'No warehouse inventory found.'}
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => {
                  const picture = item.productImage || (item as any)?.otherVariants?.picture as string | undefined;
                  const pictureSrc = (typeof picture === 'string' && picture.trim().length > 0) ? picture : '/images/size_L.webp';
                  const availableQty = Number(item.quantityAvailable) || 0;
                  const warningAt = Number(item.lowStockWarning) || 5;

                  return (
                    <tr key={`${item.batchNumber}-${idx}`}>
                      <td className="font-bold">
                        <div className="item-wrap">
                          <div className="item-thumb">
                            <img
                              src={pictureSrc}
                              alt={item.productName}
                              className="item-thumb-img"
                              loading="lazy"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (img.src.includes('/images/size_L.webp')) return;
                                img.src = '/images/size_L.webp';
                              }}
                            />
                          </div>

                          <div>
                            <div>{item.productName}</div>
                            <div className="item-meta-tags">
                              {item.brand && <Badge type="gray">{item.brand}</Badge>}
                              {item.size && (Array.isArray(item.size) ? item.size.map((s) => <Badge key={s} type="purple">{s}</Badge>) : <Badge type="purple">{item.size}</Badge>)}
                              {item.color && (Array.isArray(item.color) ? item.color.map((c) => <Badge key={c} type="blue">{c}</Badge>) : <Badge type="blue">{item.color}</Badge>)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td><Badge type="gray">{item.category}</Badge></td>
                      <td className="text-muted font-mono batch-number">{formatItemCode(item.batchNumber)}</td>
                      <td>{Rs(item.costPrice)}</td>
                      <td className="font-bold qty-cell">{availableQty}</td>
                      <td>
                        {availableQty <= 0 ? (
                          <Badge type="red">Out</Badge>
                        ) : availableQty <= warningAt ? (
                          <Badge type="orange">Low</Badge>
                        ) : (
                          <Badge type="green">Good</Badge>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '3px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailItem(item)}>Detail</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            </table>
            {/* ── Mobile card view ── */}
            <div className="mobile-card-view">
              {filtered.length === 0 ? (
                <div className="text-muted empty-cell" style={{ textAlign: 'center', padding: 36 }}>
                  {search ? 'No warehouse inventory matches your search.' : 'No warehouse inventory found.'}
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const picture = item.productImage || (item as any)?.otherVariants?.picture as string | undefined;
                  const pictureSrc = (typeof picture === 'string' && picture.trim().length > 0) ? picture : '/images/size_L.webp';
                  const availableQty = Number(item.quantityAvailable) || 0;
                  const warningAt = Number(item.lowStockWarning) || 5;

                  return (
                    <div className="mobile-card" key={`${item.batchNumber}-${idx}`}>
                      <div className="mobile-card-header">
                        <span className="mobile-card-title">{item.productName}</span>
                        {availableQty <= 0 ? (
                          <Badge type="red">Out</Badge>
                        ) : availableQty <= warningAt ? (
                          <Badge type="orange">Low</Badge>
                        ) : (
                          <Badge type="green">Good</Badge>
                        )}
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Type</span>
                        <span className="mobile-card-value"><Badge type="gray">{item.category}</Badge></span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Item ID</span>
                        <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>{formatItemCode(item.batchNumber)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Cost/pc</span>
                        <span className="mobile-card-value">{Rs(item.costPrice)}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Qty</span>
                        <span className="mobile-card-value" style={{ fontSize: '1.05rem' }}>{availableQty}</span>
                      </div>
                      <div className="mobile-card-actions">
                        <button type="button" className="btn btn-sm" style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1.5px solid rgba(16,185,129,0.25)' }} onClick={() => setDetailItem(item)}>Detail</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
      </SectionCard>

      <style jsx>{`
        .empty-cell {
          text-align: center;
          padding: 36px;
        }

        .item-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .item-thumb {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--surface-2);
          flex: 0 0 auto;
        }

        .item-thumb-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .item-meta-tags {
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 400;
          margin-top: 4px;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .batch-number {
          font-weight: 700;
        }

        .qty-cell {
          font-size: 1.05rem;
        }
      `}</style>

      <DetailModal
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        title={detailItem ? `Inventory Details — ${detailItem.productName}` : undefined}
        data={detailItem || {}}
      />
    </div>
  );
}