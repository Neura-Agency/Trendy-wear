import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
// DatePicker removed
import Login from "../components/Login";
import WeekMonthPicker from '../components/WeekMonthPicker';
import SectionCard from "../components/SectionCard";
import Badge from "../components/Badge";
import { SaleModal, CreateStoreModal, ReportModal, ExpenseBreakdownModal } from "../components/Modals";
import { AddExpenseForm } from '../components/Forms';
import CustomSelect from "../components/CustomSelect";
import { User, Order, Store, InventoryItem, Expense, Client, StoreInventoryItem, AppData, PageProps } from "../types";
import { usePopup } from "../components/Popup";

// ── SVG Icon Components (mono-color, inherits currentColor) ──
const IC = {
  wallet: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
  expense: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 16.1A5 5 0 0 1 5.9 20M2 12.05A9 9 0 0 1 9.95 20M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><line x1="2" x2="2.01" y1="20" y2="20"/></svg>,
  profit: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  stock: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>,
  store: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/></svg>,
  chart: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>,
  handshake: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14h2"/><path d="m7 4 3.06 2.04a2 2 0 0 0 1.42.25"/><path d="m5 12 2.13 2.13a1 1 0 0 0 3-.87"/></svg>,
  receipt: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>,
  report: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 12h4"/><path d="M10 16h4"/></svg>,
};

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
function StoresOverviewSection({ stores, orders, storeInventory, filter, getFiltered, onPayOrders, onAssignItem, inventory, isAdmin }) {
  const storeNames = Object.keys(stores);
  const [selected, setSelected] = useState(storeNames[0] || "");
  const [paying, setPaying] = useState<string | null>(null); // productName or 'ALL'

  useEffect(() => {
    if (!selected && storeNames.length > 0) setSelected(storeNames[0]);
  }, [storeNames, selected]);

  if (storeNames.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No shop partners added yet.</div>;

  const name = selected;
  const s = stores[name];
  if (!s) return null;

  const filteredOrders = getFiltered(orders, filter);
  const sOrders = filteredOrders.filter(o => o.storeName === name);

  const products = Array.from(new Set([
    ...sOrders.map(o => o.productName),
    ...Object.values(storeInventory[name] || {}).map(si => (si as StoreInventoryItem).productName)
  ])).filter(Boolean);

  // All unpaid orders for this store
  const unpaidStoreOrders = sOrders.filter(o => o.paymentStatus !== true && (o.commissionAmount || 0) > 0);
  const totalUnpaid = unpaidStoreOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0);

  const handlePayProduct = async (productName: string) => {
    const ids = sOrders
      .filter(o => o.productName === productName && o.paymentStatus !== true && (o.commissionAmount || 0) > 0)
      .map(o => o.id);
    if (!ids.length) return;
    setPaying(productName);
    await onPayOrders(ids);
    setPaying(null);
  };

  const handlePayAll = async () => {
    const ids = unpaidStoreOrders.map(o => o.id);
    if (!ids.length) return;
    setPaying('ALL');
    await onPayOrders(ids);
    setPaying(null);
  };

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
              <th>Product</th>
              <th>Payout</th>
              <th>Items Sold</th>
              <th>Leftover Inventory</th>
              {isAdmin && <th>Expenses</th>}
              {isAdmin && <th>Partner's Cut</th>}
              {isAdmin && <th>Profit</th>}
              <th style={{ textAlign: 'right' }}>Payment Status</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30 }}>No inventory or sales for this partner.</td></tr>
            ) : (
              products.map(productName => {
                const catOrders = sOrders.filter(o => o.productName === productName);
                const catInventory = Object.values(storeInventory[name] || {}).filter(si => (si as StoreInventoryItem).productName === productName);

                const unpaidOrders = catOrders.filter(o => o.paymentStatus !== true && (o.commissionAmount || 0) > 0);
                const paidOrders   = catOrders.filter(o => o.paymentStatus === true);
                const unpaidAmount = unpaidOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0);
                const paidAmount   = paidOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0);
                const totalPayout  = catOrders.reduce((acc, o) => acc + (o.commissionAmount || 0), 0);

                const itemsSold = catInventory.reduce((acc: number, si) => acc + (((si as StoreInventoryItem).quantityAssigned || 0) - ((si as StoreInventoryItem).quantityRemaining || 0)), 0) as number;
                const leftover  = catInventory.reduce((acc: number, si) => acc + ((si as StoreInventoryItem).quantityRemaining as number), 0) as number;
                const expenses   = catOrders.reduce((acc, o) => acc + (o.shipmentCost || 0), 0);
                const partnerCut = totalPayout;
                const profit     = catOrders.reduce((acc, o) => acc + (o.profit || 0), 0);

                const allPaid = catOrders.length > 0 && unpaidOrders.length === 0;

                return (
                  <tr key={productName}>
                    <td className="font-bold">{productName}</td>
                    <td>
                      <div className="font-bold" style={{ color: 'var(--success)' }}>{Rs(unpaidAmount)}</div>
                      {paidAmount > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {Rs(paidAmount)} paid
                        </div>
                      )}
                    </td>
                    <td>{itemsSold}</td>
                    <td className="font-bold" style={{ color: (leftover as number) > 0 ? 'inherit' : 'var(--danger)' }}>{leftover as number}</td>
                    {isAdmin && <td style={{ color: 'var(--danger)' }}>{Rs(expenses)}</td>}
                    {isAdmin && <td style={{ fontWeight: 600 }}>{Rs(partnerCut)}</td>}
                    {isAdmin && <td className="font-bold" style={{ color: 'var(--acc)' }}>{Rs(profit)}</td>}
                    <td style={{ textAlign: 'right' }}>
                      {allPaid ? (
                        <Badge type="green">Paid</Badge>
                      ) : unpaidAmount > 0 && isAdmin ? (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ fontSize: 11, height: 30, padding: '0 10px', whiteSpace: 'nowrap' }}
                          disabled={paying === productName}
                          onClick={() => handlePayProduct(productName)}
                        >
                          {paying === productName ? '...' : `Pay ${Rs(unpaidAmount)}`}
                        </button>
                      ) : (
                        <Badge type="blue">Balance</Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {isAdmin && totalUnpaid > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 800, fontSize: 13 }}>
                  Total Unpaid: <span style={{ color: 'var(--success)' }}>{Rs(totalUnpaid)}</span>
                </td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          {totalUnpaid > 0 && (
            <button
              className="btn btn-primary"
              style={{ flex: 1, height: 48, background: 'var(--success)', borderColor: 'var(--success)', fontWeight: 700 }}
              disabled={paying === 'ALL'}
              onClick={handlePayAll}
            >
              {paying === 'ALL' ? 'Processing...' : `Confirm & Mark All Paid (${Rs(totalUnpaid)})`}
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
function OrdersSection({ orders, overallOrders = [], isAdmin, canDelete, onCommissionEdit, onTogglePayout, onEdit, onDelete, confirmDialog }: any) {
  const [editing, setEditing] = useState<any>(null);

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
      {/* ── Edit modal ── */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Edit Sale</h2>
              <button className="btn btn-glass" style={{ width: 32, height: 32, padding: 0 }} onClick={() => setEditing(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Product
                <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{editing.productName}</div>
              </label>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Quantity Sold
                <input type="text" inputMode="numeric" className="form-input" style={{ marginTop: 4, display: 'block', width: '100%' }}
                  value={editing.quantity}
                  onChange={e => setEditing(prev => ({ ...prev, quantity: e.target.value }))}
                />
              </label>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Selling Price (Rs)
                <input type="text" inputMode="numeric" className="form-input" style={{ marginTop: 4, display: 'block', width: '100%' }}
                  value={editing.sellingPrice}
                  onChange={e => setEditing(prev => ({ ...prev, sellingPrice: e.target.value }))}
                />
              </label>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Shipment Cost (Rs)
                <input type="text" inputMode="numeric" className="form-input" style={{ marginTop: 4, display: 'block', width: '100%' }}
                  value={editing.shipmentCost}
                  onChange={e => setEditing(prev => ({ ...prev, shipmentCost: e.target.value }))}
                />
              </label>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Customer Name
                <input type="text" className="form-input" style={{ marginTop: 4, display: 'block', width: '100%' }}
                  value={editing.clientName}
                  onChange={e => setEditing(prev => ({ ...prev, clientName: e.target.value }))}
                />
              </label>
              <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Date of Sale
                <input type="date" className="form-input" style={{ marginTop: 4, display: 'block', width: '100%' }}
                  value={editing.date ? editing.date.slice(0, 10) : ''}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e => setEditing(prev => ({ ...prev, date: e.target.value }))}
                />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              {canDelete && (
                <button className="btn" style={{ flex: '0 0 auto', background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff', fontWeight: 700, padding: '0 20px', height: 44 }}
                  onClick={async () => { if (await confirmDialog('Delete this sale? This cannot be undone.')) { onDelete(editing.id); setEditing(null); } }}
                ><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{verticalAlign:'middle',marginRight:4}}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>Delete</button>
              )}
              <button className="btn btn-glass" style={{ flex: 1, height: 44 }} onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, height: 44, fontWeight: 700 }}
                onClick={() => { onEdit({ ...editing, quantity: Number(editing.quantity), sellingPrice: Number(editing.sellingPrice), shipmentCost: Number(editing.shipmentCost) }); setEditing(null); }}
              >Save Changes</button>
            </div>
          </div>
        </div>
      )}
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
                <th>After Partner's Cut</th>
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
              <tr key={idx} style={{ cursor: 'pointer' }}
                onClick={() => setEditing({ ...o })}
              >
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
  const { toast, confirmDialog } = usePopup();
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
  const [showExpenseBreakdown, setShowExpenseBreakdown] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any>(null);
  const [partnerFilter, setPartnerFilter] = useState<string>('All');
  const [partnerStore, setPartnerStore] = useState<string>('All');
  const [kpiFilter, setKpiFilter] = useState<string>('All');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [storesRes, storeInvRes, invRes, ordersRes, expensesRes] = await Promise.all([
        fetch('/api/store'),
        fetch('/api/storeInventory'),
        fetch('/api/inventory'),
        fetch('/api/orders'),
        fetch('/api/expenses'),
      ]);
      const storesData   = await storesRes.json()
      const storeInvData = await storeInvRes.json()
      const invData      = await invRes.json()
      const ordersData   = await ordersRes.json()
      const expensesData = await expensesRes.json()

      setData({
        orders: ordersData?.orders || [],
        stores: storesData?.stores || {},
        inventory: invData?.inventory || [],
        expenses: expensesData?.expenses || [],
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
    // Poll for updates every 5 minutes (SSE doesn't work on Vercel serverless)
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
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

  // Sum all recorded expenses from the expenses table
  const supabaseExpensesTotal = data.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // Total Expenses = Supabase expenses + Cost of goods sold + Shipping + Store partner commissions
  const adminExpenses = supabaseExpensesTotal + totalCostPrice + totalShipping + totalShopCut;
  const totalExpenses = isAdmin ? adminExpenses : 0;
  // Net Profit = Revenue - All Expenses
  const totalProfitValue = isAdmin ? (totalGross - adminExpenses) : totalShopCut;
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
        toast.error(result.error || 'Failed to save sale');
        return;
      }
      toast.success(`Sale recorded! Order code: ${result.orderCode}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save sale');
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
      
      toast.success(credentialsMessage);
      console.log('Shop Credentials:', result.credentials);
      
      refresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create store');
    }
  };

  const handleAddExpense = async (expense: Partial<Expense>) => {
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || 'Failed to save expense'); return; }
      toast.success('Expense added successfully!');
      refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save expense');
    }
  };

  const handlePayOrders = async (ids: string[]) => {
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, paymentStatus: true }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || 'Failed to update payment status');
      else toast.success(`✅ Payment recorded for ${ids.length} order${ids.length !== 1 ? 's' : ''}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update payment status');
    } finally {
      refresh();
    }
  };

  return (
    <>
      <div className="home-dashboard">
        <section className="kpi-grid" style={{ marginBottom: 16 }}>
          <div className="kpi-card purple">
            <div className="kpi-icon">{IC.wallet}</div>
            <div className="kpi-label">{isAdmin ? "Revenue" : "My Revenue"}</div>
            <div className="kpi-value">{Rs(totalGross)}</div>
            <div className="kpi-trend">{isAdmin ? "Gross Sales" : "My Total Sales"}</div>
          </div>

          <div className="kpi-card gray" onClick={() => setShowExpenseBreakdown(true)} style={{ cursor: 'pointer' }}>
            <div className="kpi-icon">{IC.expense}</div>
            <div className="kpi-label">Expenses</div>
            <div className="kpi-value negative">-{Rs(totalExpenses)}</div>
            <div className="kpi-trend">Expenses + COGS + shipping + commissions</div>
          </div>

          <div className="kpi-card blue">
            <div className="kpi-icon">{IC.profit}</div>
            <div className="kpi-label">{isAdmin ? "Profit" : "Earnings"}</div>
            <div className={`kpi-value ${totalProfitValue < 0 ? 'negative' : ''}`}>
              {totalProfitValue < 0 ? `-${Rs(Math.abs(totalProfitValue))}` : Rs(totalProfitValue)}
            </div>
            <div className="kpi-trend">{isAdmin ? "Net profit" : "Shop Revenue Cut"}</div>
          </div>

          <div className="kpi-card orange">
            <div className="kpi-icon">{IC.stock}</div>
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
              <div className="kpi-icon">{IC.store}</div>
              <div className="kpi-label">Stores</div>
              <div className="kpi-value">{storesCount.toLocaleString()}</div>
              <div className="kpi-trend">Active partners</div>
            </div>
          )}
        </section>

        {/* ── CHARTS: right under the KPI cards ── */}
        {isAdmin && (
          <div className="responsive-charts-grid">
            {/* ── PRODUCT PERFORMANCE: SVG Grouped Bar Chart ── */}
            <SectionCard title="Product Performance" icon={IC.chart} defaultOpen>
              {isProductEmpty && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Demo data · will update with real orders
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
            <SectionCard title="Store Performance" icon={IC.store} defaultOpen>
              {isStoreEmpty && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Demo data · will update with real orders
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
            <span style={{ marginRight: '8px', display: 'inline-flex' }}>{IC.report}</span> Generate Report
          </button>
          <TableFilter value={kpiFilter} onChange={setKpiFilter} />
        </div>

        {(isAdmin || user.role === 'store') && (
          <SectionCard 
            title={isAdmin ? "Store Partners" : "My Store Performance"} 
            icon={IC.store}
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
              filter="All"
              getFiltered={getFiltered}
              onPayOrders={handlePayOrders}
              onAssignItem={(name) => router.push(`/inventory?assign=${name}`)}
              isAdmin={isAdmin}
            />
          </SectionCard>
        )}

        <div className="vertical-stack" style={{ display: 'flex', flexDirection: 'column', gap: 32, marginBottom: 32 }}>
          <SectionCard
            title={isAdmin ? "Partner Store Sales" : "Sales History"}
            icon={IC.handshake}
            action={
              <div className="section-action-wrap">
                <TableFilter value={partnerFilter} onChange={setPartnerFilter} />
                <div className="store-select-wrap">
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
              onCommissionEdit={async (id, v) => {
                try {
                  const res = await fetch('/api/orders', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, commissionPercent: v }),
                  });
                  const result = await res.json();
                  if (!res.ok) toast.error(result.error || 'Failed to update commission');
                } catch (e: any) {
                  toast.error(e?.message || 'Failed to update commission');
                } finally {
                  refresh();
                }
              }}
              onTogglePayout={(id, inc) => { refresh(); }}
              canDelete={isStoreManager || user.role === 'store'}
              onEdit={async (order: any) => {
                try {
                  const res = await fetch('/api/orders', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      id: order.id,
                      quantity: order.quantity,
                      sellingPrice: order.sellingPrice,
                      shipmentCost: order.shipmentCost,
                      clientName: order.clientName,
                      occurredAt: order.date,
                    }),
                  });
                  const result = await res.json();
                  if (!res.ok) toast.error(result.error || 'Failed to update sale');
                  else refresh();
                } catch (e: any) { toast.error(e?.message || 'Failed to update sale'); }
              }}
              onDelete={async (id: string) => {
                try {
                  const res = await fetch('/api/orders', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                  });
                  const result = await res.json();
                  if (!res.ok) toast.error(result.error || 'Failed to delete sale');
                  else refresh();
                } catch (e: any) { toast.error(e?.message || 'Failed to delete sale'); }
              }}
            />
          </SectionCard>

        </div>

        {isAdmin && (
          <div style={{ marginBottom: 32 }}>
            <SectionCard title="Expenses (Money Spent)" icon={IC.receipt} action={
              <button className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} onClick={() => setShowExpenseModal(true)}>+ Add Expense</button>
            }>
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '18%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>Title</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>Category</th>
                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>Date</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                          No expenses recorded yet.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {[...data.expenses].reverse().map((e, i) => {
                          const dateStr = e.expense_date || (e as any).date || (e as any).occurred_at || (e as any).created_at;
                          let displayDate = '-';
                          try { if (dateStr) displayDate = new Date(String(dateStr)).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
                          catch { displayDate = String(dateStr || '-'); }

                          const catColors: Record<string, { bg: string; color: string }> = {
                            'Rent':        { bg: '#ede9fe', color: '#6d28d9' },
                            'Salaries':    { bg: '#dbeafe', color: '#1d4ed8' },
                            'Utilities':   { bg: '#dcfce7', color: '#15803d' },
                            'Marketing':   { bg: '#fef9c3', color: '#a16207' },
                            'Logistics':   { bg: '#ffedd5', color: '#c2410c' },
                            'Misc':        { bg: '#f1f5f9', color: '#475569' },
                          };
                          const cat = e.category || 'Misc';
                          const chip = catColors[cat] || { bg: '#f1f5f9', color: '#475569' };

                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                              onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--surface-2)')}
                              onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                            >
                              <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</td>
                              <td style={{ padding: '11px 14px' }}>
                                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: chip.bg, color: chip.color, whiteSpace: 'nowrap' }}>{cat}</span>
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{displayDate}</td>
                              <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--danger)', whiteSpace: 'nowrap' }}>−{Rs(e.amount)}</td>
                            </tr>
                          );
                        })}
                        <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                          <td colSpan={3} style={{ padding: '11px 14px', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            Total — {data.expenses.length} expense{data.expenses.length !== 1 ? 's' : ''}
                          </td>
                          <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 900, fontSize: '0.95rem', color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                            −{Rs(data.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0))}
                          </td>
                        </tr>
                      </>
                    )}
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
        {showExpenseBreakdown && (
          <ExpenseBreakdownModal
            expenses={data.expenses}
            orders={kpiOrders}
            onClose={() => setShowExpenseBreakdown(false)}
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
