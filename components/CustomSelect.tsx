import React, { useState, useRef, useEffect } from 'react';

interface Option {
  id: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: string[] | Option[];
  onChange: (value: string) => void;
  label?: string;
  height?: string;
}

export default function CustomSelect({ value, options, onChange, label, height = '48px' }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedOptions = options.map(opt => 
    typeof opt === 'string' ? { id: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find(opt => opt.id === value) || normalizedOptions[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div 
      className="custom-select-container" 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        width: '100%', 
        zIndex: isOpen ? 1010 : 1 
      }}
    >
      {label && (
        <label style={{ 
          fontSize: '0.75rem', 
          fontWeight: 700, 
          textTransform: 'uppercase', 
          color: 'var(--text-muted)', 
          marginBottom: 8, 
          display: 'block' 
        }}>
          {label}
        </label>
      )}
      
      <div 
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          height: height,
          padding: '0 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'var(--trans)',
          fontWeight: 600,
          userSelect: 'none'
        }}
      >
        <span>{selectedOption?.label}</span>
        <span style={{ 
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          fontSize: '10px'
        }}>
          ▼
        </span>
      </div>

      {isOpen && (
        <div 
          className="custom-select-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            overflow: 'hidden',
            animation: 'dropdownFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {normalizedOptions.map((opt, idx) => (
            <div
              key={opt.id}
              onClick={() => {
                onChange(opt.id);
                setIsOpen(false);
              }}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'background 0.2s',
                background: opt.id === value ? 'var(--acc-soft)' : (idx % 2 === 1 ? '#f8f9fa' : '#fff'),
                color: opt.id === value ? 'var(--acc)' : 'var(--text-body)',
                fontWeight: opt.id === value ? 700 : 500,
                fontSize: '14px'
              }}
              onMouseOver={(e) => {
                if (opt.id !== value) e.currentTarget.style.background = '#f1f5f9';
              }}
              onMouseOut={(e) => {
                if (opt.id !== value) e.currentTarget.style.background = (idx % 2 === 1 ? '#f8f9fa' : '#fff');
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .custom-select-trigger:hover {
          border-color: var(--acc);
        }
        .custom-select-trigger.open {
          border-color: var(--acc);
          box-shadow: 0 0 0 4px var(--acc-soft);
        }
      `}</style>
    </div>
  );
}
