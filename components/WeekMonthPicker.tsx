import { useState, useEffect, useRef } from 'react';

export default function WeekMonthPicker({ mode, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setCursor(new Date(value));
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startOfWeek = (d: Date) => {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(dt.setDate(diff));
  };

  const formatWeekLabel = (d: Date) => {
    const s = startOfWeek(d);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    return `${s.toLocaleDateString()} — ${e.toLocaleDateString()}`;
  };

  const formatMonthLabel = (d: Date) =>
    d.toLocaleString(undefined, { year: 'numeric', month: 'long' });

  const prev = () => {
    const n = new Date(cursor);
    if (mode === 'Weekly') n.setDate(n.getDate() - 7);
    else n.setMonth(n.getMonth() - 1);
    setCursor(n);
  };

  const next = () => {
    const n = new Date(cursor);
    if (mode === 'Weekly') n.setDate(n.getDate() + 7);
    else n.setMonth(n.getMonth() + 1);
    setCursor(n);
  };

  const select = () => { setOpen(false); onChange(cursor.toISOString()); };
  const clear = () => { setCursor(new Date()); onChange(null); setOpen(false); };

  const label = mode === 'Weekly' ? formatWeekLabel(cursor) : formatMonthLabel(cursor);

  return (
    <div className="wmp-wrap" ref={wrapRef}>
      <button type="button" className="wmp-trigger" onClick={() => setOpen(o => !o)}>
        <span className="wmp-trigger-label">{label}</span>
        <span className="wmp-trigger-arrow">▾</span>
      </button>

      {open && (
        <div className="wmp-dropdown">
          <div className="wmp-nav">
            <button type="button" className="wmp-nav-btn" onClick={prev}>‹</button>
            <span className="wmp-nav-label">{label}</span>
            <button type="button" className="wmp-nav-btn" onClick={next}>›</button>
          </div>
          <div className="wmp-actions">
            <button type="button" className="wmp-btn wmp-btn-ghost" onClick={() => setCursor(new Date())}>
              This {mode === 'Weekly' ? 'Week' : 'Month'}
            </button>
            <button type="button" className="wmp-btn wmp-btn-danger" onClick={clear}>Clear</button>
            <button type="button" className="wmp-btn wmp-btn-primary" onClick={select}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
