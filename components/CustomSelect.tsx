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
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (isOpen) setHighlighted(normalizedOptions.findIndex(o => o.id === value));
    else setHighlighted(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setIsOpen(true);
      return;
    }

    if (isOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted(prev => {
          const next = (prev === null ? -1 : prev) + 1;
          return next >= normalizedOptions.length ? normalizedOptions.length - 1 : next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted(prev => {
          const next = (prev === null ? normalizedOptions.length : prev) - 1;
          return next < 0 ? 0 : next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlighted !== null) {
          const opt = normalizedOptions[highlighted];
          onChange(opt.id);
          setIsOpen(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    }
  };

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
        ref={triggerRef}
        className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={0}
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
          role="listbox"
          aria-activedescendant={highlighted !== null ? `opt-${highlighted}` : undefined}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -8px rgba(0, 0, 0, 0.12)',
            zIndex: 1000,
            overflow: 'auto',
            maxHeight: '320px',
            animation: 'dropdownFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {normalizedOptions.map((opt, idx) => {
            const isSelected = opt.id === value;
            const isHighlighted = highlighted === idx;
            return (
              <div
                id={`opt-${idx}`}
                key={opt.id}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlighted(idx)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: isSelected ? 'var(--acc-soft)' : (isHighlighted ? 'var(--acc-soft)' : 'transparent'),
                  color: isSelected ? 'var(--acc)' : 'var(--text-body)',
                  fontWeight: isSelected ? 700 : 500,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{flex:1, textAlign:'left'}}>{opt.label}</span>
                {isSelected && (
                  <span style={{color:'var(--acc)', marginLeft:12, fontSize:12}}>✓</span>
                )}
              </div>
            );
          })}
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
