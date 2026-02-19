export default function SummaryCards({ summary = {} }) {
  const icons = {
    'Total Money Made': '💰',
    'Profit': '📈',
    'My Earnings': '📈',
    'Sales Count': '📋',
    'Low Stock': '🚨',
    'Warehouse Items': '🏢',
    'Items at Shop': '🏪'
  };

  const types = {
    'Total Money Made': 'blue',
    'Profit': 'green',
    'My Earnings': 'green',
    'Sales Count': 'purple',
    'Low Stock': 'red'
  };

  return (
    <div className="cards-grid">
      {Object.entries(summary).map(([label, value]) => (
        <div key={label} className={`summary-card ${types[label] || ''}`}>
          <div className="icon">{icons[label] || '📊'}</div>
          <div className="label">{label}</div>
          <div className="value">{value}</div>
        </div>
      ))}
    </div>
  )
}

