export default function OrdersTable({ orders }){
  return (
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
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={10} style={{textAlign:'center', padding:'2rem'}} className="muted">No orders found.</td></tr>
            ) : orders.map(o=> (
              <tr key={o.id}>
                <td>{new Date(o.date).toLocaleDateString()}</td>
                <td><span className="badge" style={{background:'#e0f2fe', color:'#0369a1'}}>{o.storeName}</span></td>
                <td style={{fontWeight:500}}>{o.productName}</td>
                <td>{o.quantity}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
