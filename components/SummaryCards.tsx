import React from 'react';

interface SummaryCardsProps {
  summary?: Record<string, any>;
}

const svgIcon = (path: string) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: path }} />
);

const icons: Record<string, React.ReactNode> = {
  'Total Money Made': svgIcon('<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>'),
  'Profit': svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
  'My Earnings': svgIcon('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
  'Sales Count': svgIcon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M9 14h6"/><path d="M9 18h6"/>'),
  'Low Stock': svgIcon('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  'Warehouse Items': svgIcon('<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>'),
  'Items at Shop': svgIcon('<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>'),
};

const defaultIcon = svgIcon('<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>');

export default function SummaryCards({ summary = {} }: SummaryCardsProps) {
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
          <div className="icon">{icons[label] || defaultIcon}</div>
          <div className="label">{label}</div>
          <div className="value">{String(value)}</div>
        </div>
      ))}
    </div>
  )
}

