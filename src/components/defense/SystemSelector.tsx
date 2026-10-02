'use client';

import type { DefenseSystem, ZoneType } from '@/lib/types';
import { COLORS } from '../ui';

/**
 * Livraison 2 — sélecteur de système de défense.
 *
 * Affiche les 11 systèmes possibles en cartes radio groupées par famille :
 *  - Individuelle (1)
 *  - Zones (5) : 2-3 / 1-3-1 / 3-2 / 2-1-2 / Match-up
 *  - Junk defenses (3) : Box-and-1, Triangle-and-2, Diamond-and-1 [🚧 F.1]
 *  - Presse (2) : Half-court, Full-court [🚧 F.2]
 *
 * Les systèmes non implémentés sont grisés avec badge "🚧 bientôt" et
 * tooltip pointant vers la roadmap.
 */

export type SystemChoice =
  | { kind: 'man' }
  | { kind: 'zone'; zoneType: ZoneType }
  | { kind: 'junk'; junkType: 'box-and-1' | 'triangle-and-2' | 'diamond-and-1' }
  | { kind: 'press'; pressType: 'half-court' | 'full-court' };

interface SystemDef {
  id: string;
  label: string;
  description: string;
  /** Si non implémenté : tag de roadmap (ex "F.1"). */
  pending?: string;
  /** Si implémenté : la valeur DefenseSystem + ZoneType à poser. */
  choice?: SystemChoice;
}

const FAMILIES: { title: string; systems: SystemDef[] }[] = [
  {
    title: 'Individuelle',
    systems: [
      {
        id: 'man',
        label: 'Individuelle stricte',
        description: 'Chaque défenseur sur son homme.',
        choice: { kind: 'man' },
      },
    ],
  },
  {
    title: 'Zones',
    systems: [
      {
        id: 'zone-2-3',
        label: 'Zone 2-3',
        description: 'Pack le paint.',
        choice: { kind: 'zone', zoneType: 'zone-2-3' },
      },
      {
        id: 'zone-1-3-1',
        label: 'Zone 1-3-1',
        description: 'Pression top.',
        choice: { kind: 'zone', zoneType: 'zone-1-3-1' },
      },
      {
        id: 'zone-3-2',
        label: 'Zone 3-2',
        description: '3 hauts, 2 bas. Coin : le bas sort, l\'aile redescend.',
        choice: { kind: 'zone', zoneType: 'zone-3-2' },
      },
      {
        id: 'zone-2-1-2',
        label: 'Zone 2-1-2',
        description: 'Hybride 2-3 / 1-3-1.',
        choice: { kind: 'zone', zoneType: 'zone-2-1-2' },
      },
      {
        id: 'zone-matchup',
        label: 'Match-up',
        description: 'Chacun prend l\'homme de sa zone et passe les coupeurs.',
        choice: { kind: 'zone', zoneType: 'zone-matchup' },
      },
    ],
  },
  {
    title: 'Junk defenses',
    systems: [
      {
        id: 'box-and-1',
        label: 'Box-and-1',
        description: 'Box + 1 chasseur.',
        choice: { kind: 'junk', junkType: 'box-and-1' },
      },
      {
        id: 'triangle-and-2',
        label: 'Triangle-2',
        description: 'Triangle + 2 chasseurs.',
        choice: { kind: 'junk', junkType: 'triangle-and-2' },
      },
      {
        id: 'diamond-and-1',
        label: 'Diamond-1',
        description: 'Diamant + 1 chasseur.',
        choice: { kind: 'junk', junkType: 'diamond-and-1' },
      },
    ],
  },
  {
    title: 'Presse',
    systems: [
      {
        id: 'half-court-press',
        label: 'Half-court',
        description: 'Pression mi-terrain 2-2-1.',
        choice: { kind: 'press', pressType: 'half-court' },
      },
      {
        id: 'full-court-press',
        label: 'Full-court',
        description: 'Pression tout terrain 1-2-1-1 + trap.',
        choice: { kind: 'press', pressType: 'full-court' },
      },
    ],
  },
];

interface SystemSelectorProps {
  defenseSystem: DefenseSystem;
  zoneType: ZoneType;
  /** F.1 — Type junk actif si defenseSystem === 'junk'. */
  junkType?: 'box-and-1' | 'triangle-and-2' | 'diamond-and-1';
  /** F.2 — Type press actif si defenseSystem === 'press'. */
  pressType?: 'half-court' | 'full-court';
  onChange: (choice: SystemChoice) => void;
}

export function SystemSelector({ defenseSystem, zoneType, junkType, pressType, onChange }: SystemSelectorProps) {
  const c = COLORS.defense;
  const currentId =
    defenseSystem === 'man' ? 'man'
    : defenseSystem === 'junk' ? (junkType ?? 'box-and-1')
    : defenseSystem === 'press' ? (pressType === 'full-court' ? 'full-court-press' : 'half-court-press')
    : zoneType;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {FAMILIES.map((family) => (
        <div key={family.title}>
          <div
            style={{
              fontSize: 9,
              color: 'var(--bt-text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 4,
              paddingLeft: 2,
            }}
          >
            {family.title}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                family.systems.length === 1
                  ? 'minmax(0, 1fr)'
                  : 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 4,
            }}
          >
            {family.systems.map((s) => {
              const isActive = s.id === currentId;
              const isPending = !!s.pending;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (s.choice) onChange(s.choice);
                  }}
                  title={
                    isPending
                      ? `À venir — ${s.pending} dans la roadmap`
                      : s.description
                  }
                  style={{
                    textAlign: 'left',
                    padding: '5px 7px',
                    borderRadius: 5,
                    border: `1.5px solid ${
                      isActive ? c.accent : isPending ? '#e5e5e5' : c.border
                    }`,
                    background: isActive
                      ? c.bgSubtle
                      : isPending
                        ? '#fafafa'
                        : '#fff',
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    color: isPending ? 'var(--bt-text-dim)' : c.accentText,
                    opacity: isPending ? 0.7 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                    minHeight: 44,
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    {/* indicateur radio */}
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        border: `1.5px solid ${
                          isActive ? c.accent : isPending ? '#d4d4d4' : '#cbd5e1'
                        }`,
                        background: isActive ? c.accent : 'transparent',
                        flex: '0 0 auto',
                      }}
                      aria-hidden
                    />
                    <span
                      style={{
                        flex: 1,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={s.label}
                    >
                      {s.label}
                    </span>
                    {isPending && (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          background: '#fef3c7',
                          color: 'var(--bt-amber-text)',
                          padding: '1px 4px',
                          borderRadius: 6,
                          flex: '0 0 auto',
                        }}
                      >
                        🚧
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: isPending ? 'var(--bt-text-dim)' : 'var(--bt-text-dim)',
                      lineHeight: 1.3,
                      paddingLeft: 16,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={s.description}
                  >
                    {s.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
