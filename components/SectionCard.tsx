import React, { useState } from 'react';
import { SectionCardProps } from "../types";

interface ExtendedSectionCardProps extends SectionCardProps {
  badge?: React.ReactNode;
  defaultOpen?: boolean;
}

export default function SectionCard({ title, icon, badge, children, action, defaultOpen = true }: ExtendedSectionCardProps) {
    const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

    return (
        <div className={`section-card ${isOpen ? '' : 'collapsed-card'}`}>
            <div className="section-head" onClick={() => setIsOpen(!isOpen)}>
                <div className="section-head-left">
                    <span className="section-icon">{icon}</span>
                    <h3 className="section-title">
                        {title}
                        {badge && <span className="section-badge">{badge}</span>}
                    </h3>
                </div>
                <div className="section-head-right">
                    {action && <div className="section-action" onClick={(e: React.MouseEvent) => e.stopPropagation()}>{action}</div>}
                    <span className={`chevron ${isOpen ? 'open' : ''}`}>▼</span>
                </div>
            </div>
            <div className={`section-body ${isOpen ? 'show' : 'hide'}`}>
                {children}
            </div>
        </div>
    );
}
