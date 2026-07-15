import React from 'react';

export interface MobileCardField {
  label: string;
  value: React.ReactNode;
  /** If true, value is rendered as a badge/pill */
  isBadge?: boolean;
  /** If true, the row is hidden on mobile */
  hideOnMobile?: boolean;
}

export interface MobileCardProps {
  /** Title/header for the card */
  title?: React.ReactNode;
  /** Badge to show in the header (e.g. status badge) */
  headerBadge?: React.ReactNode;
  /** Array of label-value fields to display */
  fields: MobileCardField[];
  /** Action buttons to show at the bottom of the card */
  actions?: React.ReactNode;
  /** Additional className for the card */
  className?: string;
  /** Additional inline styles for the card */
  style?: React.CSSProperties;
  /** Click handler for the entire card */
  onClick?: () => void;
}

/**
 * Reusable mobile card component for transforming table rows into
 * mobile-friendly card layouts.
 *
 * Usage:
 * <MobileCard
 *   title={item.name}
 *   headerBadge={<Badge type="green">Active</Badge>}
 *   fields={[
 *     { label: 'Price', value: '$100' },
 *     { label: 'Qty', value: '50' },
 *   ]}
 *   actions={<button>Edit</button>}
 * />
 */
export function MobileCard({
  title,
  headerBadge,
  fields,
  actions,
  className = '',
  style,
  onClick,
}: MobileCardProps) {
  const visibleFields = fields.filter(f => !f.hideOnMobile);

  return (
    <div
      className={`mobile-card ${className}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {(title || headerBadge) && (
        <div className="mobile-card-header">
          {title && <span className="mobile-card-title">{title}</span>}
          {headerBadge && <span className="mobile-card-badge">{headerBadge}</span>}
        </div>
      )}
      {visibleFields.map((field, idx) => (
        <div className="mobile-card-row" key={idx}>
          <span className="mobile-card-label">{field.label}</span>
          <span className={`mobile-card-value${field.isBadge ? ' text-muted' : ''}`}>
            {field.value}
          </span>
        </div>
      ))}
      {actions && <div className="mobile-card-actions">{actions}</div>}
    </div>
  );
}

export default MobileCard;
