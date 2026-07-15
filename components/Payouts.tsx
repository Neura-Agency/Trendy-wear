import { useState } from 'react';
import SearchBar from './SearchBar';

export default function Payouts({ payouts }){
  const [search, setSearch] = useState('');

  const filtered = payouts.filter((p: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.storeName || '').toLowerCase().includes(q);
  });

  return (
    <div className="section">
      <div className="section-header">
        <h3>Store Payouts</h3>
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by store name…" resultCount={filtered.length} />
      <div className="table-container">
        <table className="table desktop-table-view">
          <thead>
            <tr>
              <th>Store Name</th>
              <th>Orders</th>
              <th>Sales</th>
              <th>Comm%</th>
              <th>Comm Amt</th>
              <th>Payable</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{textAlign:'center', padding:'2rem'}} className="muted">{search ? 'No payouts match your search.' : 'No payouts found.'}</td></tr>
            ) : filtered.map(p=> (
              <tr key={p.storeName}>
                <td style={{fontWeight:600}}>{p.storeName}</td>
                <td>{p.totalOrders}</td>
                <td>${Number(p.totalSales).toLocaleString()}</td>
                <td>{p.commissionPercent}%</td>
                <td>${Number(p.commissionAmount).toLocaleString()}</td>
                <td style={{fontWeight:700, color:'var(--primary)'}}>${Number(p.finalPayable).toLocaleString()}</td>
                <td>
                  <span className={`badge ${p.paid ? 'badge-success' : 'badge-pending'}`}>
                    {p.paid ? 'Received' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* ── Mobile card view ── */}
        <div className="mobile-card-view">
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }} className="muted">{search ? 'No payouts match your search.' : 'No payouts found.'}</div>
          ) : (
            filtered.map(p => (
              <div className="mobile-card" key={p.storeName}>
                <div className="mobile-card-header">
                  <span className="mobile-card-title">{p.storeName}</span>
                  <span className={`badge ${p.paid ? 'badge-success' : 'badge-pending'}`} style={{ fontSize: 10 }}>
                    {p.paid ? 'Received' : 'Pending'}
                  </span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Orders</span>
                  <span className="mobile-card-value">{p.totalOrders}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Sales</span>
                  <span className="mobile-card-value">${Number(p.totalSales).toLocaleString()}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Commission</span>
                  <span className="mobile-card-value">{p.commissionPercent}% · ${Number(p.commissionAmount).toLocaleString()}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Payable</span>
                  <span className="mobile-card-value" style={{ fontWeight: 700, color: 'var(--primary)' }}>${Number(p.finalPayable).toLocaleString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
