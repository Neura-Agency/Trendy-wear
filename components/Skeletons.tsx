import React from "react";

/**
 * Presentational-only loading placeholders.
 * These replace plain "Loading…" text — no data or logic is involved.
 */

export function TableSkeleton({ rows = 6, label = "Loading data" }: { rows?: number; label?: string }) {
  return (
    <div style={{ padding: 16 }} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <span className="skeleton skeleton-row" style={{ height: 34, marginBottom: 10, opacity: 0.85 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="skeleton skeleton-row" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 16,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function PageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div style={{ padding: "8px 0 24px" }} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <span className="skeleton" style={{ height: 26, width: 220, marginBottom: 10 }} />
      <span className="skeleton" style={{ height: 13, width: 320, marginBottom: 24 }} />
      <div style={{ marginBottom: 24 }}>
        <CardsSkeleton />
      </div>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <TableSkeleton rows={7} label={label} />
      </div>
    </div>
  );
}

export default PageSkeleton;
