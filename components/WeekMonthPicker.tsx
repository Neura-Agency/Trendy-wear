import { useState, useEffect } from 'react';

export default function WeekMonthPicker({ mode, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date());

  useEffect(() => {
    if (value) setCursor(new Date(value));
  }, [value]);

  const startOfWeek = (d) => {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(dt.setDate(diff));
  };

  const formatWeekLabel = (d) => {
    const s = startOfWeek(d);
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    return `${s.toLocaleDateString()} — ${e.toLocaleDateString()}`;
  };

  const formatMonthLabel = (d) => {
    return d.toLocaleString(undefined, { year: 'numeric', month: 'long' });
  };

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

  const select = () => {
    setOpen(false);
    onChange(cursor.toISOString());
  };

  const clear = () => {
    setCursor(new Date());
    onChange(null);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          height: 38,
          padding: '0 14px',
          borderRadius: 6,
          border: '1px solid #d9d9d9',
          background: '#fff',
          fontWeight: 500,
          cursor: 'pointer',
          minWidth: 220,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        {mode === 'Weekly' ? formatWeekLabel(cursor) : formatMonthLabel(cursor)}
        <span style={{ fontSize: 12 }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            marginTop: 8,
            background: '#fff',
            borderRadius: 10,
            padding: 16,
            width: 300,
            border: '1px solid #eee',
            boxShadow: '0 12px 30px rgba(0,0,0,0.12)',
            zIndex: 999
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 16
            }}
          >
            <button
              onClick={prev}
              style={{
                border: 'none',
                background: '#f5f5f5',
                borderRadius: 6,
                width: 32,
                height: 32,
                cursor: 'pointer'
              }}
            >
              ‹
            </button>

            <div
              style={{
                flex: 1,
                textAlign: 'center',
                fontWeight: 600,
                fontSize: 15
              }}
            >
              {mode === 'Weekly'
                ? formatWeekLabel(cursor)
                : formatMonthLabel(cursor)}
            </div>

            <button
              onClick={next}
              style={{
                border: 'none',
                background: '#f5f5f5',
                borderRadius: 6,
                width: 32,
                height: 32,
                cursor: 'pointer'
              }}
            >
              ›
            </button>
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setCursor(new Date())}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 6,
                border: '1px solid #d9d9d9',
                background: '#fafafa',
                cursor: 'pointer'
              }}
            >
              This {mode === 'Weekly' ? 'Week' : 'Month'}
            </button>

            <button
              onClick={clear}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 6,
                border: '1px solid #ffccc7',
                background: '#fff2f0',
                color: '#ff4d4f',
                cursor: 'pointer'
              }}
            >
              Clear
            </button>

            <button
              onClick={select}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 6,
                border: 'none',
                background: 'linear-gradient(90deg,#1677ff,#4096ff)',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
