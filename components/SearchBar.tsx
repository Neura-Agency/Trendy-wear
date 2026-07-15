import { useState } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
}

export default function SearchBar({ value, onChange, placeholder = 'Search…', resultCount }: SearchBarProps) {
  return (
    <div style={{ padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            paddingLeft: 36, paddingRight: value ? 36 : 12, height: 40, fontSize: 13,
            borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface-2)',
            width: '100%', outline: 'none', color: 'var(--text-body)',
          }}
        />
        {value && (
          <button
            onClick={() => onChange('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: 16, lineHeight: 1, padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>
      {resultCount !== undefined && value && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}