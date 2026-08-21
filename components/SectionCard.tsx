import React, { useState } from 'react';
import { SectionCardProps } from "../types";
import ContextHelp from "./ContextHelp";

interface ExtendedSectionCardProps extends SectionCardProps {
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** Optional contextual-help key (see lib/help/content.ts) */
  helpKey?: string;
}

export default function SectionCard({ title, icon, badge, children, action, defaultOpen = true, helpKey }: ExtendedSectionCardProps) {
    const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

    return (
        <div className={`section-card ${isOpen ? '' : 'collapsed-card'}`}>
            <div
                className="section-head"
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); }
                }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="section-head-left">
                    <span className="section-icon">{icon}</span>
                    <h3 className="section-title">
                        {title}
                        {badge && <span className="section-badge">{badge}</span>}
                        {helpKey && (
                            <span onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ display: 'inline-flex', marginLeft: 6 }}>
                                <ContextHelp id={helpKey} />
                            </span>
                        )}
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
