import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
// DatePicker removed
import Login from "../components/Login";
import WeekMonthPicker from '../components/WeekMonthPicker';
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";
import { SaleModal, CreateStoreModal, ReportModal } from "../components/Modals";
import { AddExpenseForm } from '../components/Forms';
import CustomSelect from "../components/CustomSelect";
import { User, Order, Store, InventoryItem, Expense, Client, StoreInventoryItem, AppData, PageProps } from "../types";

// Helpers
const Rs = (n: number) => "Rs " + (Number(n) || 0).toLocaleString();

interface TableFilterProps {
  value: string;
  onChange: (value: string) => void;
}

function TableFilter({ value, onChange }: TableFilterProps) {
  const [mode, setMode] = useState<string>('Weekly');
  const [weekDate, setWeekDate] = useState<Date | null>(null);
  const [monthDate, setMonthDate] = useState<Date | null>(null);

  // Handle dropdown change
  const handleModeChange = (val: string) => {
    setMode(val);
    if (val === 'Weekly') onChange('Weekly');
    if (val === 'Monthly') onChange('Monthly');
  };

  // Handle week pick
  const handleWeekChange = (date: Date | null) => {
    setWeekDate(date);
    if (date) {
      const year = date.getFullYear();
      const week = getISOWeek(date);
      onChange(`${year}-W${week.toString().padStart(2, '0')}`);
    } else {
      onChange('All');
    }
  };

  // Handle month pick
  const handleMonthChange = (date: Date | null) => {
    setMonthDate(date);
    if (date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      onChange(`${year}-${month}`);
    } else {
      onChange('All');
    }
  };

  // Helper to get ISO week number
  function getISOWeek(date: Date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  return (
    <div className="table-filter-wrap" style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--surface-2)', padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)' }}>
      <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Filter:</span>
      <div style={{ width: 140 }}>
        <CustomSelect 
          value={mode} 
          onChange={handleModeChange} 
          options={[{ id: 'Weekly', label: 'By Week' }, { id: 'Monthly', label: 'By Month' }]} 
          height="36px"
        />
      </div>
      {mode === 'Weekly' && (
        <WeekMonthPicker mode="Weekly" value={weekDate} onChange={(v) => handleWeekChange(v ? new Date(v) : null)} />
      )}
      {mode === 'Monthly' && (
        <WeekMonthPicker mode="Monthly" value={monthDate} onChange={(v) => handleMonthChange(v ? new Date(v) : null)} />
      )}
    </div>
  );
}

// ─── GROUPED BAR CHART (SVG) ──────────────────────────────────────────────
interface GBCSeries {
  label: string;
  color: string;
  values: number[]; // one value per group
}
interface GroupedBarChartProps {
  title: string;
  groups: string[];       // X axis labels (months)
  series: GBCSeries[];    // one series per product/store
  max: number;
  yLabel?: string;
  formatValue?: (v: number) => string;
}

function GroupedBarChart({ title, groups, series, max, yLabel = '', formatValue = String }: GroupedBarChartProps) {
  const [hovered, setHovered] = useState<{ gi: number; si: number; bx: number; by: number } | null>(null);

  const W = 720, H = 270;
  const PAD = { top: 24, right: 16, bottom: 48, left: 46 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const nGroups = groups.length;
  const nSeries = series.length;
  const groupW = chartW / nGroups;
  const barGap = 1.5;
  const groupPad = groupW * 0.16;
  const barW = Math.max(5, (groupW - groupPad * 2 - barGap * (nSeries - 1)) / Math.max(1, nSeries));

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ frac: f, val: Math.round(max * f) }));

  const tipSeries = hovered ? series[hovered.si] : null;
  const tipVal    = hovered ? (series[hovered.si]?.values[hovered.gi] ?? 0) : 0;
  const tipLabel  = hovered ? `${tipSeries?.label}: ${formatValue(tipVal)}` : '';
  const tipW      = Math.min(tipLabel.length * 6.5 + 28, 210);
  const tipX      = hovered ? Math.min(Math.max(hovered.bx, PAD.left + tipW / 2 + 4), W - tipW / 2 - 4) : 0;
  const tipY      = hovered ? Math.max(hovered.by - 52, PAD.top) : 0;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', minWidth: 360, fontFamily: 'Inter, system-ui, sans-serif' }}
          aria-label={title}
        >
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`gbcG${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={s.color} stopOpacity={0.95} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.4}  />
              </linearGradient>
            ))}
            <clipPath id="gbcClip">
              <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
            </clipPath>
          </defs>

          {/* Chart area bg */}
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} rx={6} fill="rgba(148,163,184,0.05)" />

          {/* Y-axis grid */}
          {yTicks.map(({ frac, val }) => {
            const y = PAD.top + chartH * (1 - frac);
            return (
              <g key={frac}>
                <line
                  x1={PAD.left} x2={PAD.left + chartW} y1={y} y2={y}
                  stroke={frac === 0 ? '#94a3b8' : '#cbd5e1'}
                  strokeWidth={frac === 0 ? 1.5 : 0.8}
                  strokeDasharray={frac === 0 ? undefined : '4 5'}
                  opacity={frac === 0 ? 1 : 0.65}
                />
                {frac > 0 && (
                  <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={10} fontWeight={600} fill="#94a3b8">
                    {val >= 1000000 ? (val / 1000000).toFixed(1) + 'M'
                      : val >= 1000 ? (val / 1000).toFixed(0) + 'k'
                      : val}
                  </text>
                )}
              </g>
            );
          })}

          {/* Bars (clipped) */}
          <g clipPath="url(#gbcClip)">
            {groups.map((grp, gi) => {
              const groupX  = PAD.left + gi * groupW + groupPad;
              const groupCX = groupX + (nSeries * barW + (nSeries - 1) * barGap) / 2;
              return (
                <g key={gi}>
                  {gi > 0 && (
                    <line
                      x1={PAD.left + gi * groupW} x2={PAD.left + gi * groupW}
                      y1={PAD.top} y2={PAD.top + chartH}
                      stroke="#e2e8f0" strokeWidth={0.8} opacity={0.45}
                    />
                  )}
                  {series.map((s, si) => {
                    const val  = s.values[gi] || 0;
                    const barH = max > 0 ? (val / max) * chartH : 0;
                    const bx   = groupX + si * (barW + barGap);
                    const by   = PAD.top + chartH - barH;
                    const isHov = hovered?.gi === gi && hovered?.si === si;
                    return (
                      <g key={si}>
                        {barH > 2 && (
                          <rect x={bx + 1} y={by + 2} width={barW} height={Math.max(barH - 2, 1)}
                            rx={3} fill="rgba(0,0,0,0.09)" />
                        )}
                        <rect
                          x={bx} y={by} width={barW} height={Math.max(barH, 1)}
                          rx={3}
                          fill={`url(#gbcG${si})`}
                          opacity={hovered ? (isHov ? 1 : 0.25) : 0.88}
                          style={{ cursor: 'pointer', transition: 'opacity 0.18s' }}
                          onMouseEnter={() => setHovered({ gi, si, bx: groupCX, by })}
                          onMouseLeave={() => setHovered(null)}
                        />
                        {barH > 6 && (
                          <rect
                            x={bx + 1} y={by} width={barW - 2} height={Math.min(barH * 0.32, 11)}
                            rx={3} fill="rgba(255,255,255,0.30)"
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>

          {/* X-axis labels */}
          {groups.map((grp, gi) => {
            const groupX  = PAD.left + gi * groupW + groupPad;
            const groupCX = groupX + (nSeries * barW + (nSeries - 1) * barGap) / 2;
            return (
              <text key={gi}
                x={groupCX} y={PAD.top + chartH + 16}
                textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#64748b" letterSpacing="0.04em"
              >
                {grp.toUpperCase()}
              </text>
            );
          })}

          {/* Floating tooltip */}
          {hovered && tipVal > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              <rect
                x={tipX - tipW / 2} y={tipY}
                width={tipW} height={30} rx={8}
                fill={tipSeries?.color ?? '#6366f1'} opacity={0.97}
                filter="drop-shadow(0 3px 8px rgba(0,0,0,0.22))"
              />
              <text
                x={tipX} y={tipY + 19}
                textAnchor="middle" fontSize={11} fontWeight={800} fill="white"
              >
                {tipLabel}
              </text>
              <polygon
                points={`${tipX - 6},${tipY + 30} ${tipX + 6},${tipY + 30} ${tipX},${tipY + 39}`}
                fill={tipSeries?.color ?? '#6366f1'} opacity={0.97}
              />
            </g>
          )}
        </svg>
      </div>

      {/* Pill legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', marginTop: 14, justifyContent: 'center' }}>
        {series.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: s.color + '18',
            border: `1.5px solid ${s.color}45`,
            borderRadius: 20, padding: '4px 12px',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: s.color, flexShrink: 0,
              boxShadow: `0 0 6px ${s.color}80`,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── STACKED GROUPED BAR CHART (per-month × per-store, each bar = revenue+profit stacked)
interface SBCSeries {
  label: string;
  color: string;
  revenues: number[];  // one per group (month)
  profits:  number[];  // one per group (month)
  sales:    number[];  // one per group (month)
}
interface StackedBarChartProps {
  groups: string[];       // X-axis labels (months)
  series: SBCSeries[];    // one per store
  formatValue?: (v: number) => string;
}

function StackedBarChart({ groups, series, formatValue = String }: StackedBarChartProps) {
  const [hovered, setHovered] = useState<{ gi: number; si: number; cx: number; topY: number } | null>(null);

  const W = 720, H = 290;
  const PAD = { top: 40, right: 16, bottom: 52, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const nGroups = groups.length;
  const nSeries = series.length;
  const groupW  = chartW / nGroups;
  const barGap  = 1.2;
  const groupPad = groupW * 0.13;
  const barW = Math.max(4, (groupW - groupPad * 2 - barGap * (nSeries - 1)) / Math.max(1, nSeries));

  const maxVal = Math.max(1, ...series.flatMap(s => s.revenues));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ frac: f, val: Math.round(maxVal * f) }));

  // Tooltip data
  const tipS     = hovered ? series[hovered.si] : null;
  const tipRev   = hovered ? (tipS?.revenues[hovered.gi] ?? 0) : 0;
  const tipProf  = hovered ? (tipS?.profits[hovered.gi]  ?? 0) : 0;
  const tipSales = hovered ? (tipS?.sales[hovered.gi]    ?? 0) : 0;
  
  const tipW    = 170;
  const tipH    = 90;
  const tipCX   = hovered ? Math.min(Math.max(hovered.cx, PAD.left + tipW / 2 + 4), W - tipW / 2 - 4) : 0;
  const tipY    = hovered ? Math.max(hovered.topY - tipH - 12, 10) : 0;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', minWidth: 380, fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          <defs>
            {series.map((s, i) => [
              <linearGradient key={`sr${i}`} id={`sbcR${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={s.color} stopOpacity={0.40} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.15} />
              </linearGradient>,
              <linearGradient key={`sp${i}`} id={`sbcP${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={s.color} stopOpacity={1}    />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.68} />
              </linearGradient>,
            ])}
            {/* Dashed pattern for revenue portion */}
            <pattern id="sbcDash" x="0" y="0" width="8" height="3" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0.5" x2="8" y2="0.5" stroke="white" strokeWidth="1" opacity="0.5" />
            </pattern>
            <clipPath id="sbcClip">
              <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
            </clipPath>
          </defs>

          {/* Chart bg */}
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} rx={6} fill="rgba(148,163,184,0.05)" />

          {/* Y grid */}
          {yTicks.map(({ frac, val }) => {
            const y = PAD.top + chartH * (1 - frac);
            return (
              <g key={frac}>
                <line
                  x1={PAD.left} x2={PAD.left + chartW} y1={y} y2={y}
                  stroke={frac === 0 ? '#94a3b8' : '#cbd5e1'}
                  strokeWidth={frac === 0 ? 1.5 : 0.8}
                  strokeDasharray={frac === 0 ? undefined : '4 5'}
                  opacity={frac === 0 ? 1 : 0.6}
                />
                {frac > 0 && (
                  <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={10} fontWeight={600} fill="#94a3b8">
                    {val >= 1000000 ? (val / 1000000).toFixed(1) + 'M'
                      : val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}
                  </text>
                )}
              </g>
            );
          })}

          {/* Grouped+Stacked Bars */}
          <g clipPath="url(#sbcClip)">
            {groups.map((grp, gi) => {
              const gx  = PAD.left + gi * groupW + groupPad;
              const gcx = gx + (nSeries * barW + (nSeries - 1) * barGap) / 2;
              return (
                <g key={gi}>
                  {gi > 0 && (
                    <line
                      x1={PAD.left + gi * groupW} x2={PAD.left + gi * groupW}
                      y1={PAD.top} y2={PAD.top + chartH}
                      stroke="#e2e8f0" strokeWidth={0.8} opacity={0.45}
                    />
                  )}
                  {series.map((s, si) => {
                    const rev    = s.revenues[gi] || 0;
                    const profit = Math.max(0, s.profits[gi] || 0);
                    const revH    = maxVal > 0 ? (rev    / maxVal) * chartH : 0;
                    const profitH = maxVal > 0 ? (profit / maxVal) * chartH : 0;
                    const costH   = revH - profitH;
                    const bx      = gx + si * (barW + barGap);
                    const topY    = PAD.top + chartH - revH;
                    const profitY = PAD.top + chartH - profitH;
                    const cx      = bx + barW / 2;
                    const isHov   = hovered?.gi === gi && hovered?.si === si;

                    return (
                      <g key={si}
                        onMouseEnter={() => setHovered({ gi, si, cx: gcx, topY })}
                        onMouseLeave={() => setHovered(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Drop shadow */}
                        {revH > 2 && (
                          <rect x={bx + 1} y={topY + 2} width={barW} height={revH}
                            rx={3} fill="rgba(0,0,0,0.09)" />
                        )}
                        {/* Revenue (bottom muted portion) */}
                        <rect
                          x={bx} y={topY} width={barW} height={Math.max(revH, 1)}
                          rx={3}
                          fill={`url(#sbcR${si})`}
                          opacity={hovered ? (isHov ? 1 : 0.22) : 0.85}
                          style={{ transition: 'opacity 0.18s' }}
                        />
                        {/* Revenue Dash Overlay */}
                        <rect
                          x={bx} y={topY} width={barW} height={Math.max(revH, 1)}
                          rx={3}
                          fill="url(#sbcDash)"
                          opacity={hovered ? (isHov ? 0.6 : 0.1) : 0.45}
                          style={{ transition: 'opacity 0.18s', pointerEvents: 'none' }}
                        />
                        {/* Profit (top vivid portion) */}
                        {profitH > 0 && (
                          <rect
                            x={bx} y={profitY} width={barW} height={profitH}
                            rx={3}
                            fill={`url(#sbcP${si})`}
                            opacity={hovered ? (isHov ? 1 : 0.22) : 0.88}
                            style={{ transition: 'opacity 0.18s' }}
                          />
                        )}
                        {/* Divider between profit / cost */}
                        {profitH > 2 && costH > 2 && (
                          <line
                            x1={bx + 1} x2={bx + barW - 1} y1={profitY} y2={profitY}
                            stroke="rgba(255,255,255,0.55)" strokeWidth={1}
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                        {/* Glass highlight */}
                        {revH > 6 && (
                          <rect
                            x={bx + 1} y={topY} width={barW - 2} height={Math.min(revH * 0.28, 10)}
                            rx={3} fill="rgba(255,255,255,0.25)"
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>

          {/* X-axis month labels */}
          {groups.map((grp, gi) => {
            const gx  = PAD.left + gi * groupW + groupPad;
            const gcx = gx + (nSeries * barW + (nSeries - 1) * barGap) / 2;
            return (
              <text key={gi}
                x={gcx} y={PAD.top + chartH + 16}
                textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#64748b" letterSpacing="0.04em"
              >
                {grp.toUpperCase()}
              </text>
            );
          })}

          {/* Floating tooltip */}
          {hovered && tipRev > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              <rect
                x={tipCX - tipW / 2} y={tipY}
                width={tipW} height={tipH} rx={12}
                fill="white"
                filter="drop-shadow(0 8px 24px rgba(0,0,0,0.18))"
                stroke={tipS?.color} strokeWidth={1.5}
              />
              
              {/* Header: Store Name */}
              <text x={tipCX} y={tipY + 20} textAnchor="middle" fontSize={11} fontWeight={900} fill="#1e293b" letterSpacing="0.02em">
                {tipS?.label.toUpperCase()}
              </text>
              <line x1={tipCX - 65} x2={tipCX + 65} y1={tipY + 28} y2={tipY + 28} stroke="#f1f5f9" strokeWidth={1} />
              
              {/* Row 1: REVENUE */}
              <text x={tipCX - 68} y={tipY + 46} fontSize={9} fontWeight={700} fill="#94a3b8">REVENUE</text>
              <text x={tipCX + 68} y={tipY + 46} textAnchor="end" fontSize={11} fontWeight={800} fill="#1e293b">{formatValue(tipRev)}</text>
              
              {/* Row 2: PROFIT */}
              <text x={tipCX - 68} y={tipY + 62} fontSize={9} fontWeight={700} fill="#94a3b8">NET PROFIT</text>
              <text x={tipCX + 68} y={tipY + 62} textAnchor="end" fontSize={11} fontWeight={800} fill="#10b981">{formatValue(tipProf)}</text>

              {/* Row 3: SALES */}
              <text x={tipCX - 68} y={tipY + 78} fontSize={9} fontWeight={700} fill="#94a3b8">TOTAL SALES</text>
              <text x={tipCX + 68} y={tipY + 78} textAnchor="end" fontSize={11} fontWeight={800} fill="#6366f1">{tipSales} Items</text>

              {/* Pointer */}
              <polygon
                points={`${tipCX - 8},${tipY + tipH} ${tipCX + 8},${tipY + tipH} ${tipCX},${tipY + tipH + 8}`}
                fill="white"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Store pill legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 9px', marginTop: 12, justifyContent: 'center' }}>
        {series.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: s.color + '18', border: `1.5px solid ${s.color}45`,
            borderRadius: 20, padding: '3px 11px',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0, boxShadow: `0 0 5px ${s.color}80` }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{s.label}</span>
          </div>
        ))}
        <div style={{ width: '100%', textAlign: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>▓ Revenue (dashed) &nbsp; █ Profit (solid bottom)</span>
        </div>
      </div>
    </div>
  );
}


// Premium Inline Editor for Commission/Values
function InlineCommEdit({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  if (!editing) return (
    <span
      className="inline-edit-trigger"
      onClick={() => setEditing(true)}
      style={{
        cursor: 'pointer',
        color: 'var(--acc)',
        fontWeight: 700,
        textDecoration: 'underline dotted',
        padding: '2px 4px',
        borderRadius: '4px',
        transition: 'all 0.2s'
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(24,144,255,0.1)'; }}
      onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {value}%
    </span>
  );

  return (
    <div className="inline-edit-box" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        autoFocus
        style={{ width: 64, height: 32, padding: '4px 8px', fontSize: '13px' }}
      />
      <button
        className="btn btn-primary"
        style={{ width: 28, height: 28, padding: 0, background: 'var(--success)', borderColor: 'var(--success)' }}
        onClick={() => { onSave(val); setEditing(false); }}
      >
        ✓
      </button>
      <button
        className="btn btn-glass"
        style={{ width: 28, height: 28, padding: 0 }}
        onClick={() => setEditing(false)}
      >
        ✕
      </button>
    </div>
  );
}

// ─── STORES OVERVIEW SECTION (Reworked for Table View) ───────────────
function StoresOverviewSection({ stores, orders, storeInventory, filter, getFiltered, onMarkPaid, onCommissionChange, onAssignItem, inventory, isAdmin }) {
  const storeNames = Object.keys(stores);
  const [selected, setSelected] = useState(storeNames[0] || "");

  useEffect(() => {
    if (!selected && storeNames.length > 0) setSelected(storeNames[0]);
  }, [storeNames, selected]);

  if (storeNames.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No shop partners added yet.</div>;

  const name = selected;
  const s = stores[name];
  if (!s) return null;

  const getCategory = (prodName) => inventory.find(i => i.productName === prodName)?.category || 'Other';

  const filteredOrders = getFiltered(orders, filter);
  const sOrders = filteredOrders.filter(o => o.storeName === name && o.includedInPayout !== false && o.type !== 'Gift');

  const categories = Array.from(new Set([
    ...sOrders.map(o => getCategory(o.productName)),
    ...Object.values(storeInventory[name] || {}).map(si => getCategory((si as StoreInventoryItem).productName))
  ]));

  return (
    <div className="store-selector-view">
      {storeNames.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <CustomSelect
            label="Select Store Partner"
            value={selected}
            options={storeNames}
            onChange={setSelected}
          />
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product Catagory</th>
              <th>Payout</th>
              <th>Items Sold</th>
              <th>Leftover Inventory</th>
              <th>Expenses</th>
              <th>Partner's Cut</th>
              <th>Profit</th>
              <th style={{ textAlign: 'right' }}>Payment Status</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No inventory or sales for this partner.</td></tr>
            ) : (
              categories.map(cat => {
                const catOrders = sOrders.filter(o => getCategory(o.productName) === cat);
                const catInventory = Object.values(storeInventory[name] || {}).filter(si => getCategory((si as StoreInventoryItem).productName) === cat);
                
                const payout = catOrders.reduce((acc, o) => acc + (o.sellingPrice * o.quantity - o.shipmentCost), 0);
                const itemsSold = catOrders.reduce((acc, o) => acc + o.quantity, 0);
                const leftover = catInventory.reduce((acc: number, si) => acc + ((si as StoreInventoryItem).quantityRemaining as number), 0) as number;
                const expenses = catOrders.reduce((acc, o) => acc + (o.shipmentCost || 0), 0);
                const partnerCut = catOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0);
                const profit = catOrders.reduce((acc, o) => acc + (o.profit || 0), 0);

                return (
                  <tr key={cat}>
                    <td className="font-bold">{cat}</td>
                    <td className="font-bold" style={{ color: 'var(--success)' }}>{Rs(payout)}</td>
                    <td>{itemsSold}</td>
                    <td className="font-bold" style={{ color: (leftover as number) > 0 ? 'inherit' : 'var(--danger)' }}>{leftover as number}</td>
                    <td style={{ color: 'var(--danger)' }}>{Rs(expenses)}</td>
                    <td style={{ fontWeight: 600 }}>{Rs(partnerCut)}</td>
                    <td className="font-bold" style={{ color: 'var(--acc)' }}>{Rs(profit)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge type={s.paid ? 'green' : 'blue'}>
                        {s.paid ? 'Paid' : 'Balance'}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          {sOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0) > 0 && !s.paid && (
            <button className="btn btn-primary" style={{ flex: 1, height: 48, background: 'var(--success)', borderColor: 'var(--success)' }} onClick={() => onMarkPaid(name, sOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0))}>
              Confirm & Mark as Fully Paid
            </button>
          )}
          <button className="btn btn-primary" style={{ flex: 1, height: 48 }} onClick={() => onAssignItem(name)}>
            Stock Management (Send Goods)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ORDERS SECTION ──────────────────────────────────────────────────
function OrdersSection({ orders, overallOrders = [], isAdmin, onCommissionEdit, onTogglePayout }) {
  const filteredQty = orders.reduce((s, o) => s + (o.quantity || 0), 0);
  const filteredGross = orders.reduce((s, o) => s + ((o.sellingPrice || 0) * (o.quantity || 0)), 0);
  const filteredShipping = orders.reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const filteredProfit = orders.reduce((s, o) => s + (o.profit || 0), 0);

  const overallQty = (overallOrders || []).reduce((s, o) => s + (o.quantity || 0), 0);
  const overallGross = (overallOrders || []).reduce((s, o) => s + ((o.sellingPrice || 0) * (o.quantity || 0)), 0);
  const overallShipping = (overallOrders || []).reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const overallProfit = (overallOrders || []).reduce((s, o) => s + (o.profit || 0), 0);

  return (
    <div>
      <div className="table-wrap">
        <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Store Name</th>
            <th>Product</th>
            <th>Quantity</th>
            <th>Total Price</th>
            <th>Delivery Fee</th>
            <th>Amount Received</th>
            <th>Store Percentage</th>
            {isAdmin && (
              <>
                <th>Platform Fee</th>
                <th>Cost Price</th>
                <th>Profit</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {orders.map((o, idx) => {
            const gross = o.sellingPrice * o.quantity;
            const shipment = o.shipmentCost || 0;
            const netAmount = gross - shipment;
            const totalCost = (o.costPrice || 0) * o.quantity;
            return (
              <tr key={idx}>
                <td className="text-muted" style={{ fontSize: '0.75rem' }}>{new Date(o.date).toLocaleDateString()}</td>
                <td className="font-bold" style={{ color: 'var(--pri-700)' }}>{o.storeName}</td>
                <td className="font-bold">{o.productName}</td>
                <td>{o.quantity}</td>
                <td className="font-bold">{Rs(gross)}</td>
                <td style={{ color: 'var(--danger)', fontWeight: 600 }}>-{Rs(shipment)}</td>
                <td className="font-bold" style={{ color: 'var(--text-main)' }}>{Rs(netAmount)}</td>
                <td>
                  {isAdmin ? (
                    <InlineCommEdit value={o.commissionPercent} onSave={(v) => onCommissionEdit(o.id, v)} />
                  ) : (
                    <span className="font-bold">{o.commissionPercent}%</span>
                  )}
                  <div style={{ fontSize: '11px', color: isAdmin ? 'var(--danger)' : 'var(--success)', fontWeight: 700 }}>
                    {isAdmin ? "-" : "+"}{Rs(o.commissionAmount)}
                  </div>
                </td>
                {isAdmin && (
                  <>
                    <td className="font-bold" style={{ color: 'var(--pri-600)' }}>{Rs(o.adminTake)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{Rs(totalCost)}</td>
                    <td className="font-bold" style={{ color: 'var(--success)', fontSize: '1.1rem' }}>{Rs(o.profit)}</td>
                  </>
                )}
              </tr>
            );
          })}
          {orders.length === 0 && <tr><td colSpan={isAdmin ? 11 : 8} style={{ textAlign: 'center', padding: 30 }}>No partner sales match this period.</td></tr>}
        </tbody>
      </table>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
        <div style={{ fontWeight: 700 }}>
          Showing totals: Items: {filteredQty} — Gross: {Rs(filteredGross)} — Profit: {Rs(filteredProfit)}
        </div>
        <div style={{ color: 'var(--text-muted)', textAlign: 'right' }}>
          All partners totals: Items: {overallQty} — Gross: {Rs(overallGross)} — Profit: {Rs(overallProfit)}
        </div>
      </div>
    </div>
  );
}

function DirectSalesSection({ orders }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Item Name</th>
            <th>Quantity</th>
            <th>Sale Price</th>
            <th>Total Recv.</th>
            <th style={{ textAlign: 'right' }}>Net Profit</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, idx) => (
            <tr key={idx}>
              <td className="text-muted">{new Date(o.date).toLocaleDateString()}</td>
              <td className="font-bold">{o.productName}</td>
              <td>{o.quantity}</td>
              <td>{Rs(o.sellingPrice)}</td>
              <td className="font-bold">{Rs(o.sellingPrice * o.quantity)}</td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)' }}>{Rs(o.profit)}</td>
            </tr>
          ))}
          {orders.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 30 }}>No direct warehouse sales yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ─── CLIENTS SECTION ────────────────────────────────────────────────
function ClientsSection({ clients }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Sales Count</th>
            <th>Still Owes</th>
          </tr>
        </thead>
        <tbody>
          {clients.map(c => {
            const totalVal = (c.orders || []).reduce((s, o) => s + (o.sellingPrice * o.quantity), 0);
            const due = totalVal - (c.paymentsReceived || 0);
            return (
              <tr key={c.id}>
                <td className="font-bold">{c.name}</td>
                <td className="text-muted">{c.phone}</td>
                <td>{c.orders?.length || 0}</td>
                <td className={due > 0 ? 'font-bold' : ''}>{Rs(due)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────
export default function Home({ user, onLogin }: PageProps) {
  const router = useRouter();
  const [data, setData] = useState<{
    orders: Order[];
    inventory: InventoryItem[];
    stores: Record<string, Store>;
    clients: Client[];
    expenses: Expense[];
    storeInventory: Record<string, Record<string, StoreInventoryItem>>;
    storeInventoryMeta?: {
      latestUpdatedAt?: string | null;
      latestUpdatedAtByStore?: Record<string, string>;
    };
    settings?: any;
  }>({
    orders: [],
    inventory: [],
    stores: {},
    clients: [],
    expenses: [],
    storeInventory: {},
  });
const [loading, setLoading] = useState<boolean>(true);

  // Modal states
  const [showSaleModal, setShowSaleModal] = useState<boolean>(false);
  const [showStoreModal, setShowStoreModal] = useState<boolean>(false);
  const [showReport, setShowReport] = useState<boolean>(false);
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any>(null);
  const [partnerFilter, setPartnerFilter] = useState<string>('All');
  const [partnerStore, setPartnerStore] = useState<string>('All');
  const [directFilter, setDirectFilter] = useState<string>('All');
  const [kpiFilter, setKpiFilter] = useState<string>('All');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [storesRes, storeInvRes, invRes, ordersRes] = await Promise.all([
        fetch('/api/store'),
        fetch('/api/storeInventory'),
        fetch('/api/inventory'),
        fetch('/api/orders'),
      ]);
      const storesData   = await storesRes.json()
      const storeInvData = await storeInvRes.json()
      const invData      = await invRes.json()
      const ordersData   = await ordersRes.json()

      setData({
        orders: ordersData?.orders || [],
        stores: storesData?.stores || {},
        inventory: invData?.inventory || [],
        expenses: [],
        clients: [],
        settings: storesData?.settings || { storeCommissionPercent: 10 },
        storeInventory: storeInvData?.storeInventory || {},
        storeInventoryMeta: storeInvData?.meta || {},
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    const es = new EventSource("/api/stream");
    es.onmessage = () => refresh();
    return () => es.close();
  }, [user, refresh]);

  if (!user) return <Login onLogin={onLogin} />;

  if (loading) return <div className="loading">Loading...</div>;

  const isAdmin = user.role === "admin";
  const isSuperAdmin = isAdmin && user.scope === 'all';
  const isStoreManager = isAdmin && !isSuperAdmin && Array.isArray(user.managedStores) && user.managedStores.length > 0;

  const getFiltered = (ordList: Order[], filter: string): Order[] => {
    const now = new Date();
    return ordList.filter((o: Order) => {
      const oDate = new Date(o.date);

      // Professional weekly filter: ISO week (Monday-Sunday)
      if (filter === 'Weekly') {
        const day = now.getDay() || 7; // Sunday is 0, set to 7
        const weekStart = new Date(now);
        weekStart.setHours(0,0,0,0);
        weekStart.setDate(now.getDate() - day + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        return oDate >= weekStart && oDate < weekEnd;
      }
      // Professional monthly filter: calendar month
      if (filter === 'Monthly') {
        return oDate.getFullYear() === now.getFullYear() && oDate.getMonth() === now.getMonth();
      }
      // Custom week (YYYY-Wxx)
      if (/^\d{4}-W\d{2}$/.test(filter)) {
        const [year, weekNum] = filter.split('-W');
        const firstDayOfYear = new Date(Date.UTC(Number(year), 0, 1));
        const daysOffset = ((Number(weekNum) - 1) * 7) + (firstDayOfYear.getUTCDay() <= 4 ? 1 - firstDayOfYear.getUTCDay() : 8 - firstDayOfYear.getUTCDay());
        const weekStart = new Date(Date.UTC(Number(year), 0, 1 + daysOffset));
        const weekEnd = new Date(weekStart);
        weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
        return oDate >= weekStart && oDate < weekEnd;
      }
      // Custom month (YYYY-MM)
      if (/^\d{4}-\d{2}$/.test(filter)) {
        const [y, m] = filter.split('-').map(Number);
        return oDate.getUTCFullYear() === y && (oDate.getUTCMonth() + 1) === m;
      }
      return true;
    });
  };

  const dashboardOrders = (() => {
    if (isSuperAdmin) return data.orders;
    if (isAdmin && user.managedStores?.length > 0) {
      return data.orders.filter(o => user.managedStores.includes(o.storeName));
    }
    if (user.role === 'store') return data.orders.filter(o => o.storeName === user.storeName);
    return [];
  })();

  const availableStores = (() => {
    if (isSuperAdmin) return data.stores;
    if (isAdmin) {
      const filtered = {};
      (user.managedStores || []).forEach(name => {
        if (data.stores[name]) filtered[name] = data.stores[name];
      });
      return filtered;
    }
    if (user.role === 'store') {
      return data.stores[user.storeName] ? { [user.storeName]: data.stores[user.storeName] } : {};
    }
    return {};
  })();

  const kpiOrders = getFiltered(dashboardOrders, kpiFilter);
  const partnerAll = getFiltered(dashboardOrders.filter(o => o.storeName !== 'Direct'), partnerFilter);
  const partnerOrders = partnerAll.filter(o => partnerStore === 'All' ? true : o.storeName === partnerStore);
  const directOrders = getFiltered(dashboardOrders.filter(o => o.storeName === 'Direct'), directFilter);

  // Stats calculation
  const totalGross = kpiOrders.reduce((s, o) => s + (o.sellingPrice * o.quantity || 0), 0);
  const totalShipping = kpiOrders.reduce((s, o) => s + (o.shipmentCost || 0), 0);
  const totalNetAmt = totalGross - totalShipping;
  const totalShopCut = kpiOrders.reduce((s, o) => s + (o.commissionAmount || 0), 0);
  const totalAdminTake = kpiOrders.reduce((s, o) => s + (o.adminTake || 0), 0);
  const totalCostPrice = kpiOrders.reduce((s, o) => s + ((o.costPrice || 0) * (o.quantity || 1)), 0);
  const totalNetProfit = kpiOrders.reduce((s, o) => s + (o.profit || 0), 0);
  const lowStock = data.inventory.filter(i => i.quantityAvailable <= (i.lowStockWarning || 5)).length;
  const ordersCount = kpiOrders.length;

  const adminExpenses = totalCostPrice + totalShipping + totalShopCut + totalAdminTake;
  const totalExpenses = isAdmin ? adminExpenses : 0;
  const totalProfit = totalGross - adminExpenses;
  const totalProfitValue = isAdmin ? totalProfit : totalShopCut;
  const totalStockQty = (() => {
    if (isSuperAdmin) {
      return data.inventory.reduce((s, i) => s + (i.quantityAvailable || 0), 0)
    }

    // Store manager (admin with managed stores): stock = sum of store_inventory.quantity_remaining across managed stores
    if (isStoreManager) {
      const names = Object.keys(availableStores || {})
      return names.reduce((sum, storeName) => {
        const items = Object.values(data.storeInventory[storeName] || {}) as any[]
        return sum + items.reduce((s, si) => s + (Number(si.quantityRemaining) || 0), 0)
      }, 0)
    }

    // Regular admin (no managed stores): keep existing warehouse behavior
    if (isAdmin) {
      return data.inventory.reduce((s, i) => s + (i.quantityAvailable || 0), 0)
    }

    // Store owner: stock = own store quantity_remaining
    return Object.values(data.storeInventory[user.storeName] || {}).reduce(
      (s, si: any) => s + (Number(si.quantityRemaining) || 0),
      0
    )
  })();

  const stockAsOfIso = (() => {
    const meta = data.storeInventoryMeta
    if (!meta) return null

    if (isStoreManager) return meta.latestUpdatedAt ?? null
    if (user.role === 'store') {
      const byStore = meta.latestUpdatedAtByStore || {}
      return (user.storeName && byStore[user.storeName]) ? byStore[user.storeName] : (meta.latestUpdatedAt ?? null)
    }
    return null
  })();

  const stockAsOfLabel = stockAsOfIso ? new Date(stockAsOfIso).toLocaleDateString() : null
  const storesCount = isSuperAdmin
    ? Object.keys(data.stores || {}).length
    : isAdmin
      ? Object.keys(availableStores || {}).length
      : 1;

  // Graphs (last 12 months, role-scoped)
  const graphNow = new Date();
  const graphStart = new Date(Date.UTC(graphNow.getUTCFullYear(), graphNow.getUTCMonth() - 11, 1));

  const monthKeys = Array.from({ length: 12 }, (_, idx) => {
    const d = new Date(Date.UTC(graphNow.getUTCFullYear(), graphNow.getUTCMonth() - 11 + idx, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString(undefined, { month: 'short' });
    return { key, label };
  });

  const monthlyQtyByKey: Record<string, number> = {};
  const monthlyRevenueByKey: Record<string, number> = {};
  const monthlyProfitByKey: Record<string, number> = {};
  const productQty: Record<string, number> = {};
  const storeProfit: Record<string, number> = {};
  const storeRevenue: Record<string, number> = {};
  // Per-product-per-month qty
  const productMonthQty: Record<string, Record<string, number>> = {};
  // Per-store-per-month revenue + profit
  const storeMonthRevenue: Record<string, Record<string, number>> = {};
  const storeMonthProfit: Record<string, Record<string, number>> = {};
  const storeMonthQty: Record<string, Record<string, number>> = {};

  dashboardOrders.forEach((o) => {
    const d = new Date(o.date);
    if (Number.isNaN(d.getTime())) return;
    if (d < graphStart || d > graphNow) return;

    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const qty = Number(o.quantity) || 0;
    monthlyQtyByKey[monthKey] = (monthlyQtyByKey[monthKey] || 0) + qty;

    const revenue = (Number(o.sellingPrice) || 0) * qty;
    const profit = Number(o.profit) || 0;
    monthlyRevenueByKey[monthKey] = (monthlyRevenueByKey[monthKey] || 0) + revenue;
    monthlyProfitByKey[monthKey] = (monthlyProfitByKey[monthKey] || 0) + profit;

    const productName = String(o.productName || '').trim() || 'Unknown';
    productQty[productName] = (productQty[productName] || 0) + qty;
    if (!productMonthQty[productName]) productMonthQty[productName] = {};
    productMonthQty[productName][monthKey] = (productMonthQty[productName][monthKey] || 0) + qty;

    const storeName = String(o.storeName || '').trim();
    if (storeName && storeName !== 'Direct') {
      storeProfit[storeName] = (storeProfit[storeName] || 0) + profit;
      storeRevenue[storeName] = (storeRevenue[storeName] || 0) + revenue;
      if (!storeMonthRevenue[storeName]) storeMonthRevenue[storeName] = {};
      if (!storeMonthProfit[storeName]) storeMonthProfit[storeName] = {};
      if (!storeMonthQty[storeName]) storeMonthQty[storeName] = {};
      storeMonthRevenue[storeName][monthKey] = (storeMonthRevenue[storeName][monthKey] || 0) + revenue;
      storeMonthProfit[storeName][monthKey] = (storeMonthProfit[storeName][monthKey] || 0) + profit;
      storeMonthQty[storeName][monthKey] = (storeMonthQty[storeName][monthKey] || 0) + qty;
    }
  });

  const monthlySeries = monthKeys.map((m) => ({ label: m.label, value: monthlyQtyByKey[m.key] || 0 }));
  const monthlyMax = Math.max(1, ...monthlySeries.map((p) => p.value));

  const topProducts = Object.entries(productQty)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
  const bestProductLabel = topProducts[0]?.label ?? null;

  const storeSeries = Object.entries(storeRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, revenue]) => ({
      label,
      revenue,
      profit: storeProfit[label] || 0
    }));
  const storeRevenueMax = Math.max(1, ...storeSeries.map((s) => s.revenue));
  const bestStoreLabel = Object.entries(storeProfit)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const monthlyRevenueSeries = monthKeys.map((m) => ({
    label: m.label,
    revenue: monthlyRevenueByKey[m.key] || 0,
    profit: monthlyProfitByKey[m.key] || 0
  }));
  const monthlyRevenueMax = Math.max(1, ...monthlyRevenueSeries.map((p) => p.revenue));

  // ── Grouped-bar chart palette ────────────────────────────────────
  const CHART_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
    '#f97316', '#84cc16', '#ec4899', '#14b8a6',
  ];

  // Product grouped-bar data: topProducts as series, monthKeys as groups
  const productSeriesData = topProducts.map((p, i) => ({
    label: p.label,
    color: CHART_COLORS[i % CHART_COLORS.length],
    values: monthKeys.map(m => productMonthQty[p.label]?.[m.key] || 0),
  }));
  const productChartMax = Math.max(1, ...productSeriesData.flatMap(s => s.values));

  // Store grouped-bar data: top stores as series (revenue), monthKeys as groups
  const storeNames = storeSeries.map(s => s.label);
  const storeSeriesData = storeNames.map((name, i) => ({
    label: name,
    colorRev: CHART_COLORS[i % CHART_COLORS.length],
    colorProfit: CHART_COLORS[i % CHART_COLORS.length] + 'aa',
    valuesRev: monthKeys.map(m => storeMonthRevenue[name]?.[m.key] || 0),
    valuesProfit: monthKeys.map(m => storeMonthProfit[name]?.[m.key] || 0),
    valuesQty: monthKeys.map(m => storeMonthQty[name]?.[m.key] || 0),
  }));
  const storeChartMax = Math.max(1, ...storeSeriesData.flatMap(s => s.valuesRev));

  // ── Demo fallback data (shown when no real orders exist) ──────────
  const isProductEmpty = productSeriesData.length === 0;
  const isStoreEmpty = storeSeriesData.length === 0;

  const DEMO_PRODUCTS = ['Kurta', 'Shalwar Kameez', 'Lawn Suit', 'Dupatta', 'Shawl', 'Jacket'];
  const DEMO_STORES  = ['Al-Noor Store', 'City Boutique', 'Style Hub', 'Fashion Point', 'Elegance', 'Trendy Plus'];

  // Seeded random-ish pattern that looks like real sales (peaks in mid-year)
  const demoSeed = (product: number, month: number) => {
    const base = [18,22,30,42,55,70,65,58,45,35,28,20][month] ?? 30;
    const prod  = [1, 0.7, 0.85, 0.5, 0.6, 0.4][product] ?? 0.5;
    const jitter = ((product * 7 + month * 13) % 17) - 8;
    return Math.max(0, Math.round((base + jitter) * prod));
  };
  const demoRevSeed = (store: number, month: number) => {
    const base = [22000,28000,38000,50000,65000,80000,74000,68000,52000,42000,33000,25000][month] ?? 40000;
    const s    = [1, 0.75, 0.88, 0.55, 0.65, 0.45][store] ?? 0.6;
    const jitter = ((store * 11 + month * 19) % 20000) - 10000;
    return Math.max(0, Math.round((base + jitter) * s));
  };

  const demoProductSeries = DEMO_PRODUCTS.map((label, i) => ({
    label,
    color: CHART_COLORS[i % CHART_COLORS.length],
    values: monthKeys.map((_, mi) => demoSeed(i, mi)),
  }));
  const demoProductMax = Math.max(1, ...demoProductSeries.flatMap(s => s.values));

  const demoStoreSeries = DEMO_STORES.map((label, i) => ({
    label,
    color: CHART_COLORS[i % CHART_COLORS.length],
    values: monthKeys.map((_, mi) => demoRevSeed(i, mi)),
  }));
  const demoStoreMax = Math.max(1, ...demoStoreSeries.flatMap(s => s.values));

  const finalProductSeries = isProductEmpty ? demoProductSeries : productSeriesData;
  const finalProductMax    = isProductEmpty ? demoProductMax    : productChartMax;
  const finalStoreSeries   = isStoreEmpty   ? demoStoreSeries   : storeSeriesData.map(s => ({ label: s.label, color: s.colorRev, values: s.valuesRev }));
  const finalStoreMax      = isStoreEmpty   ? demoStoreMax      : storeChartMax;

  // Stacked+grouped per-store-per-month data (for StackedBarChart)
  const stackedStoreSeries: SBCSeries[] = isStoreEmpty
    ? DEMO_STORES.map((label, i) => ({
        label,
        color: CHART_COLORS[i % CHART_COLORS.length],
        revenues: monthKeys.map((_, mi) => demoRevSeed(i, mi)),
        profits:  monthKeys.map((_, mi) => { const r = ([0.28, 0.25, 0.30, 0.23, 0.27, 0.22] as number[])[i] ?? 0.25; return Math.round(demoRevSeed(i, mi) * r); }),
        sales:    monthKeys.map((_, mi) => demoSeed(i, mi)),
      }))
    : storeSeriesData.map((s, i) => ({
        label: s.label,
        color: CHART_COLORS[i % CHART_COLORS.length],
        revenues: s.valuesRev,
        profits:  s.valuesProfit,
        sales:    s.valuesQty,
      }));

  const handleAddOrder = async (order: any) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName:  order.productName,
          quantity:     order.quantity,
          extraQty:     order.extraQty || 0,
          sellingPrice: order.sellingPrice,
          shipmentCost: order.shipmentCost || 0,
          extraCharges: order.extraCharges || 0,
          clientName:   order.clientName || '',
          orderType:    order.type || 'Sale',
          occurredAt:   order.occurredAt || new Date().toISOString(),
          storeName:    order.storeName,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || 'Failed to save sale');
        return;
      }
      alert(`✅ Sale recorded! Order code: ${result.orderCode}`);
    } catch (e: any) {
      alert(e?.message || 'Failed to save sale');
    } finally {
      refresh();
    }
  };

  const handleCreateStore = async (store: { name: string; partnerName: string; partnerContact: string; commission: number; storeId: string }) => {
    try {
      const response = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: store.name,
          partnerName: store.partnerName,
          partnerContact: store.partnerContact,
          commission: store.commission
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create store');
      }

      // Display credentials
      const credentialsMessage = `Store partner created successfully!\n\n` +
        `Shop Credentials:\n` +
        `Username: ${result.credentials.username}\n` +
        `Password: ${result.credentials.password}\n\n` +
        `Please save these credentials!`;
      
      alert(credentialsMessage);
      console.log('Shop Credentials:', result.credentials);
      
      refresh();
    } catch (error: any) {
      alert(error.message || 'Failed to create store');
    }
  };

  const handleAddExpense = async (expense: Partial<Expense>) => {
    // No-op: database removed
    refresh();
  };

  const handleMarkPaid = (storeName: string, amount: number) => {
    // No-op: database removed
    refresh();
  };

  return (
    <>
      <div className="home-dashboard">
        <section className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi-card purple">
            <div className="kpi-icon">💵</div>
            <div className="kpi-label">{isAdmin ? "Payout" : "My Payout"}</div>
            <div className="kpi-value">{Rs(isAdmin ? totalNetAmt : totalShopCut)}</div>
            <div className="kpi-trend">{isAdmin ? "Overall Earnings" : "My Total Earnings"}</div>
          </div>

          <div className="kpi-card gray">
            <div className="kpi-icon">💸</div>
            <div className="kpi-label">Expenses</div>
            <div className="kpi-value negative">-{Rs(totalExpenses)}</div>
            <div className="kpi-trend">Total costs (base + shipping + cuts)</div>
          </div>

          <div className="kpi-card blue">
            <div className="kpi-icon">📈</div>
            <div className="kpi-label">{isAdmin ? "Profit" : "Earnings"}</div>
            <div className={`kpi-value ${totalProfitValue < 0 ? 'negative' : ''}`}>
              {totalProfitValue < 0 ? `-${Rs(Math.abs(totalProfitValue))}` : Rs(totalProfitValue)}
            </div>
            <div className="kpi-trend">{isAdmin ? "Net profit" : "Shop Revenue Cut"}</div>
          </div>

          <div className="kpi-card orange">
            <div className="kpi-icon">📦</div>
            <div className="kpi-label">{isAdmin ? "Stock" : "Shop Stock"}</div>
            <div className="kpi-value">{totalStockQty.toLocaleString()}</div>
            <div className="kpi-trend">
              {isSuperAdmin
                ? "Units available in warehouse"
                : isStoreManager
                  ? `Units available in managed shops${stockAsOfLabel ? ` · as of ${stockAsOfLabel}` : ''}`
                  : `Units available in my shop${stockAsOfLabel ? ` · as of ${stockAsOfLabel}` : ''}`}
            </div>
          </div>

          {isAdmin && (
            <div className="kpi-card blue">
              <div className="kpi-icon">🏪</div>
              <div className="kpi-label">Stores</div>
              <div className="kpi-value">{storesCount.toLocaleString()}</div>
              <div className="kpi-trend">Active partners</div>
            </div>
          )}
        </section>

        {/* ── CHARTS: right under the KPI cards ── */}
        {isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* ── PRODUCT PERFORMANCE: SVG Grouped Bar Chart ── */}
            <SectionCard title="Product Performance" icon="📊" defaultOpen>
              {isProductEmpty && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📊 Demo data · will update with real orders
                  </span>
                </div>
              )}
              <GroupedBarChart
                title="Units sold per product by month"
                groups={monthKeys.map(m => m.label)}
                series={finalProductSeries}
                max={finalProductMax}
                yLabel="Units"
                formatValue={(v) => v.toString()}
              />
            </SectionCard>

            {/* ── STORE PERFORMANCE: Stacked Bar Chart ── */}
            <SectionCard title="Store Performance" icon="🏪" defaultOpen>
              {isStoreEmpty && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📊 Demo data · will update with real orders
                  </span>
                </div>
              )}
              <StackedBarChart
                groups={monthKeys.map(m => m.label)}
                series={stackedStoreSeries}
                formatValue={(v) => 'Rs ' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toLocaleString())}
              />
            </SectionCard>
          </div>
        )}

        {/* ── Filter / Generate Report bar ── */}
        <div className="header-actions" style={{ justifyContent: 'flex-end', marginBottom: 32 }}>
          {(isStoreManager || user.role === 'store') && (
            <button
              className="btn btn-primary"
              onClick={() => setShowSaleModal(true)}
              style={{ marginRight: 8 }}
            >
              + Record Sale
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => {
            let ordersForReport = kpiOrders;
            let storesForReport = data.stores || {};
            if (!isSuperAdmin) {
              if (isAdmin) {
                const managed = user.managedStores || [];
                const filteredStores = {};
                managed.forEach(name => { if (data.stores[name]) filteredStores[name] = data.stores[name]; });
                storesForReport = filteredStores;
                ordersForReport = kpiOrders.filter(o => managed.includes(o.storeName));
              } else if (user.role === 'store') {
                storesForReport = { [user.storeName]: data.stores[user.storeName] };
                ordersForReport = kpiOrders.filter(o => o.storeName === user.storeName);
              }
            }
            setReportData({ ...data, orders: ordersForReport, stores: storesForReport });
            setShowReport(true);
          }}>
            <span style={{ marginRight: '8px' }}>📄</span> Generate Report
          </button>
          <TableFilter value={kpiFilter} onChange={setKpiFilter} />
        </div>

        {(isAdmin || user.role === 'store') && (
          <SectionCard 
            title={isAdmin ? "Store Partners" : "My Store Performance"} 
            icon="🏪"
            action={
              isSuperAdmin ? (
                <button className="btn btn-primary" onClick={() => setShowStoreModal(true)}>
                  + Create Store Partner
                </button>
              ) : null
            }
          >
            <StoresOverviewSection
              stores={availableStores}
              orders={data.orders}
              storeInventory={data.storeInventory}
              inventory={data.inventory}
              filter={kpiFilter}
              getFiltered={getFiltered}
              onMarkPaid={handleMarkPaid}
              onCommissionChange={(name, v) => { refresh(); }}
              onAssignItem={(name) => router.push(`/inventory?assign=${name}`)}
              isAdmin={isAdmin}
            />
          </SectionCard>
        )}

        <div className="vertical-stack" style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 32 }}>
          <SectionCard
            title={isAdmin ? "Partner Store Sales" : "Sales History"}
            icon="🤝"
            action={
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <TableFilter value={partnerFilter} onChange={setPartnerFilter} />
                <div style={{ width: 140 }}>
                  <CustomSelect 
                    value={partnerStore} 
                    onChange={setPartnerStore} 
                    options={['All', ...Object.keys(availableStores)]} 
                    height="36px"
                  />
                </div>
              </div>
            }
          >
            <OrdersSection
              orders={partnerOrders.slice(-20).reverse()}
              overallOrders={partnerAll}
              isAdmin={isAdmin}
              onCommissionEdit={(id, v) => { refresh(); }}
              onTogglePayout={(id, inc) => { refresh(); }}
            />
          </SectionCard>

          {isSuperAdmin && (
            <SectionCard
              title="Direct Warehouse Sales"
              icon="🏠"
              action={<TableFilter value={directFilter} onChange={setDirectFilter} />}
            >
              <DirectSalesSection
                orders={directOrders.slice(-20).reverse()}
              />
            </SectionCard>
          )}
        </div>

        {isAdmin && (
          <div className="grid-2-dynamic" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24, marginBottom: 32 }}>
            {/* VIP Customers table removed as requested */}
            <SectionCard title="Expenses (Money Spent)" icon="📉" action={
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => setShowExpenseModal(true)}>+ Add Expense</button>
            }>
              <div className="table-wrap">
                <table style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.slice(-5).reverse().map((e, i) => (
                      <tr key={i}>
                        <td className="text-muted">{e.title}</td>
                        <td className="text-muted">{e.category || '-'}</td>
                        <td className="font-bold" style={{ textAlign: 'right' }}>{Rs(e.amount)}</td>
                      </tr>
                    ))}
                    {data.expenses.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 20 }}>No costs recorded.</td></tr>}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        )}

        {showSaleModal && (
          <SaleModal
            inventory={
              isStoreManager
                ? Object.entries(data.storeInventory)
                    .filter(([sName]) => (user.managedStores || []).includes(sName))
                    .flatMap(([, items]) =>
                      Object.values(items).map(si => ({
                        productName: si.productName,
                        quantityAvailable: si.quantityRemaining,
                        sellingPrice: si.storeSellingPrice,
                      }))
                    )
                : user.role === 'store'
                  ? Object.values(data.storeInventory[user.storeName] || {}).map(si => ({
                      productName: si.productName,
                      quantityAvailable: si.quantityRemaining,
                      sellingPrice: si.storeSellingPrice,
                    }))
                  : data.inventory
            }
            storeName={user.storeName}
            isAdmin={isAdmin}
            storeNames={isAdmin && user.scope === 'all' ? Object.keys(data.stores) : (isAdmin ? (user.managedStores || []) : [user.storeName])}
            onAdd={handleAddOrder}
            onClose={() => setShowSaleModal(false)}
          />
        )}

        {showStoreModal && (
          <CreateStoreModal
            onSave={handleCreateStore}
            onClose={() => setShowStoreModal(false)}
          />
        )}
        {showExpenseModal && (
          <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '640px' }}>
              <div className="modal-head" style={{ padding: '12px 20px' }}>
                <h3 style={{ fontSize: '16px' }}>Add Expense</h3>
                <button className="btn btn-sm" onClick={() => setShowExpenseModal(false)} style={{ border: 'none', fontSize: '16px' }}>✕</button>
              </div>
              <div className="modal-body" style={{ padding: 20 }}>
                <AddExpenseForm onAdd={(e) => { handleAddExpense(e); setShowExpenseModal(false); }} />
              </div>
            </div>
          </div>
        )}
        {showReport && (
          <ReportModal
            data={reportData || { ...data, orders: kpiOrders }}
            onClose={() => { setShowReport(false); setReportData(null); }}
          />
        )}
      </div>

      <style jsx>{`
        .home-dashboard { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .text-acc { color: var(--acc); }
      `}</style>
    </>
  );
}
