export default function Inventory({ items }){
  return (
    <div className="section">
      <div className="section-header">
        <h3>Inventory Management</h3>
        <button className="primary" onClick={() => alert('Add feature coming')}>+ Add Stock</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Category</th>
              <th>Batch</th>
              <th>Cost Price</th>
              <th>Sale Price</th>
              <th>Available</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan="7" style={{textAlign:'center', padding:'2rem'}} className="muted">Inventory is empty.</td></tr>
            ) : items.map((it, idx)=> (
              <tr key={idx}>
                <td style={{fontWeight:600}}>{it.productName}</td>
                <td><span className="badge" style={{background:'#f1f5f9'}}>{it.category}</span></td>
                <td className="muted">{it.batchNumber}</td>
                <td>${Number(it.costPrice).toLocaleString()}</td>
                <td>${Number(it.sellingPrice).toLocaleString()}</td>
                <td style={{fontWeight:700}}>{it.quantityAvailable}</td>
                <td>
                  {it.quantityAvailable <= (it.lowStockWarning || 5) ? (
                    <span className="badge badge-danger">Low Stock ⚠</span>
                  ) : (
                    <span className="badge badge-success">In Stock</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
