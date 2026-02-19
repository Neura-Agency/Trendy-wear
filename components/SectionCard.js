import { useState } from 'react';

export default function SectionCard({ title, icon, badge, children, action, defaultOpen = true }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="section-card">
            <div className="section-head" onClick={() => setIsOpen(!isOpen)}>
                <h3>
                    <span className="icon">{icon}</span>
                    {title}
                    {badge && <span style={{ marginLeft: 8 }}>{badge}</span>}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
                    <span className={`chevron ${isOpen ? 'open' : ''}`}>▼</span>
                </div>
            </div>
            <div className={`section-body ${isOpen ? '' : 'collapsed'}`}>
                {children}
            </div>
        </div>
    );
}
