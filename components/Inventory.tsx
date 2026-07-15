import { useState } from 'react';
import { usePopup } from './Popup';
import SearchBar from './SearchBar';
import { formatItemCode } from '../lib/catalog';

export default function Inventory({ items }){
  const { toast } = usePopup();
  const [search, setSearch] = useState('');

  const filtered = items.filter((it: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (it.productName || '').toLowerCase().includes(q) ||
      (it.category || '').toLowerCase().includes(q) ||
      (it.batchNumber || '').toLowerCase().includes(q) ||
      (it.brand || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="section">
      <div className="section-header">
        <h3>Inventory Management</h3>
        <button className="btn btn-primary" onClick={() => toast.info('Add feature coming')}>+ Add Stock</button>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by name, category, batch…" resultCount={filtered.length} />
      <div className="table-container">
        <table className="table desktop-table-view">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Category</th>
              <th>Item ID</th>
              <th>Cost Price</th>
              <th>Sale Price</th>
              <th>Available</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{textAlign:'center', padding:'2rem'}} className="muted">{search ? 'No inventory items match your search.' : 'Inventory is empty.'}</td></tr>
            ) : filtered.map((it, idx)=> (
              <tr key={idx}>
                <td style={{fontWeight:600}}>{it.productName}</td>
                <td><span className="badge" style={{background:'#f1f5f9'}}>{it.category}</span></td>
                <td className="muted">{formatItemCode(it.batchNumber)}</td>
                <td>${Number(it.costPrice).toLocaleString()}</td>
                <td>${Number(it.sellingPrice).toLocaleString()}</td>
                <td style={{fontWeight:700}}>{it.quantityAvailable}</td>
                <td>
                  {it.quantityAvailable <= (it.lowStockWarning || 5) ? (
                    <span className="badge badge-red">Low Stock ⚠</span>
                  ) : (
                    <span className="badge badge-green">In Stock</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* ── Mobile card view ── */}
        <div className="mobile-card-view">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }} className="muted">{search ? 'No inventory items match your search.' : 'Inventory is empty.'}</div>
          ) : (
            filtered.map((it, idx) => (
              <div className="mobile-card" key={idx}>
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{it.productName}</span>
                  {it.quantityAvailable <= (it.lowStockWarning || 5) ? (
                    <span className="badge badge-red" style={{ fontSize: 10 }}>Low Stock ⚠</span>
                  ) : (
                    <span className="badge badge-green" style={{ fontSize: 10 }}>In Stock</span>
                  )}
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Category</span>
                  <span className="mobile-card-value"><span className="badge" style={{ background: '#f1f5f9', fontSize: 10 }}>{it.category}</span></span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Item ID</span>
                  <span className="mobile-card-value" style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>{formatItemCode(it.batchNumber)}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Cost Price</span>
                  <span className="mobile-card-value">${Number(it.costPrice).toLocaleString()}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Sale Price</span>
                  <span className="mobile-card-value">${Number(it.sellingPrice).toLocaleString()}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Available</span>
                  <span className="mobile-card-value" style={{ fontSize: '1.05rem' }}>{it.quantityAvailable}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
