import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { LucideIcon } from 'lucide-react';

export const ContextMenu: React.FC = () => {
    const { contextMenu, closeContextMenu, theme } = useAppStore();
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPos, setAdjustedPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (!contextMenu) return;

        // Adjust position to stay within viewport
        const padding = 10;
        const menuWidth = 220; // Estimated width
        const menuHeight = contextMenu.items.length * 40 + 20; // Estimated height

        let x = contextMenu.x;
        let y = contextMenu.y;

        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - padding;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - padding;

        setAdjustedPos({ x, y });

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                closeContextMenu();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeContextMenu();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [contextMenu, closeContextMenu]);

    if (!contextMenu) return null;

    return (
        <div 
            className={`context-menu-overlay theme-${theme}`}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={closeContextMenu}
        >
            <div 
                ref={menuRef}
                className="context-menu-card animate-in fade-in zoom-in duration-200"
                style={{ 
                    left: adjustedPos.x, 
                    top: adjustedPos.y,
                    position: 'fixed'
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="context-menu-items">
                    {contextMenu.items.map((item, index) => {
                        const Icon = item.icon as LucideIcon;
                        return (
                            <div 
                                key={index}
                                className={`context-menu-item ${item.variant === 'danger' ? 'danger' : ''}`}
                                onClick={() => {
                                    item.onClick();
                                    closeContextMenu();
                                }}
                            >
                                {Icon && <Icon size={16} className="item-icon" />}
                                <span className="item-label">{item.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
