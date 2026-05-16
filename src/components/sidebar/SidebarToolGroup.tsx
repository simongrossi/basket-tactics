'use client';

import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useAccordionState } from '@/hooks/useAccordionState';
import { SIDEBAR } from './tokens';

type Props = {
  /** ID stable pour persistence localStorage (cf. useAccordionState). */
  id: string;
  icon: LucideIcon;
  label: string;
  /** Couleur d'accent (typiquement orange pour offense, bleu pour defense). */
  accent?: string;
  defaultOpen?: boolean;
  collapsed?: boolean;
  children: ReactNode;
};

// Item dépliable cohérent visuellement avec SidebarNavItem (icône + label +
// chevron). Click sur le header → toggle. Quand ouvert, le contenu s'affiche
// en dessous indenté/encadré subtilement.
export function SidebarToolGroup({
  id,
  icon: Icon,
  label,
  accent,
  defaultOpen = false,
  collapsed = false,
  children,
}: Props) {
  const [open, setOpen] = useAccordionState(`tool-group:${id}`, defaultOpen);

  if (collapsed) {
    // En mode sidebar repliée, on n'affiche que l'icône comme bouton
    // (cliquer reste un toggle, mais le contenu ne s'affiche pas — on
    // pourrait le mettre dans un popover plus tard).
    return (
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={label}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: SIDEBAR.itemHeight,
          border: 'none',
          background: open ? SIDEBAR.bgActive : 'transparent',
          color: open ? SIDEBAR.text : SIDEBAR.textMuted,
          cursor: 'pointer',
          borderRadius: 6,
        }}
      >
        <Icon size={SIDEBAR.iconSize} strokeWidth={2} style={{ color: accent ?? 'inherit' }} />
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          height: SIDEBAR.itemHeight,
          padding: '0 10px',
          border: 'none',
          background: open ? SIDEBAR.bgHover : 'transparent',
          color: open ? SIDEBAR.text : SIDEBAR.textMuted,
          fontSize: 13,
          fontWeight: open ? 600 : 500,
          borderRadius: 6,
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 120ms ease, color 120ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = SIDEBAR.bgHover;
          e.currentTarget.style.color = SIDEBAR.text;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = open ? SIDEBAR.bgHover : 'transparent';
          e.currentTarget.style.color = open ? SIDEBAR.text : SIDEBAR.textMuted;
        }}
      >
        <Icon
          size={SIDEBAR.iconSize}
          strokeWidth={2}
          style={{ flexShrink: 0, color: accent ?? 'inherit' }}
        />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <ChevronRight
          size={14}
          strokeWidth={2}
          style={{
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 180ms ease',
            color: SIDEBAR.textDim,
          }}
        />
      </button>
      {open && (
        <div
          style={{
            padding: '4px 4px 8px 14px',
            marginLeft: 4,
            borderLeft: `1px solid ${SIDEBAR.borderSubtle}`,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
