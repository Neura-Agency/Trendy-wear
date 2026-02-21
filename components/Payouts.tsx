export default function Payouts({ payouts }){
  return (
    <div className="section">
      <div className="section-header">
        <h3>Store Payouts</h3>
      </div>
      <div className="table-container">
        <table className="table">
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
            {payouts.map(p=> (
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
      </div>
    </div>
  )
}
