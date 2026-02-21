import React from 'react';

interface SummaryCardsProps {
  summary?: Record<string, any>;
}

export default function SummaryCards({ summary = {} }: SummaryCardsProps) {
  const icons: Record<string, string> = {
    'Total Money Made': '💰',
    'Profit': '📈',
    'My Earnings': '📈',
    'Sales Count': '📋',
    'Low Stock': '🚨',
    'Warehouse Items': '🏢',
    'Items at Shop': '🏪'
  };

  const types: Record<string, string> = {
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
          <div className="value">{String(value)}</div>
        </div>
      ))}
    </div>
  )
}

