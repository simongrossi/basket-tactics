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
  | { kind: 'zone'; zoneType: ZoneType };

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
        description: 'Pivot bas.',
        choice: { kind: 'zone', zoneType: 'zone-3-2' },
      },
      {
        id: 'zone-2-1-2',
        label: 'Zone 2-1-2',
        description: 'Hybride entre 2-3 et 1-3-1.',
        choice: { kind: 'zone', zoneType: 'zone-2-1-2' },
      },
      {
        id: 'zone-matchup',
        label: 'Match-up zone',
        description: 'Zone qui suit les attaquants dans leur région.',
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
        description: '4 en box autour de la raquette + 1 chasseur sur shooter.',
        pending: 'F.1',
      },
      {
        id: 'triangle-and-2',
        label: 'Triangle-and-2',
        description: '3 en triangle + 2 chasseurs.',
        pending: 'F.1',
      },
      {
        id: 'diamond-and-1',
        label: 'Diamond-and-1',
        description: '4 en diamant + 1 chasseur.',
        pending: 'F.1',
      },
    ],
  },
  {
    title: 'Presse',
    systems: [
      {
        id: 'half-court-press',
        label: 'Half-court press',
        description: 'Pression au franchissement central.',
        pending: 'F.2',
      },
      {
        id: 'full-court-press',
        label: 'Full-court press',
        description: 'Pression tout terrain dès la remise en jeu.',
        pending: 'F.2',
      },
    ],
  },
];

interface SystemSelectorProps {
  defenseSystem: DefenseSystem;
  zoneType: ZoneType;
  onChange: (choice: SystemChoice) => void;
}

export function SystemSelector({ defenseSystem, zoneType, onChange }: SystemSelectorProps) {
  const c = COLORS.defense;
  const currentId = defenseSystem === 'man' ? 'man' : zoneType;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {FAMILIES.map((family) => (
        <div key={family.title}>
          <div
            style={{
              fontSize: 9,
              color: '#78716c',
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
              gridTemplateColumns: family.systems.length === 1 ? '1fr' : '1fr 1fr',
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
                    padding: '6px 8px',
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
                    color: isPending ? '#a8a29e' : c.accentText,
                    opacity: isPending ? 0.7 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
                    <span style={{ flex: 1, lineHeight: 1.2 }}>{s.label}</span>
                    {isPending && (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          background: '#fef3c7',
                          color: '#92400e',
                          padding: '1px 4px',
                          borderRadius: 6,
                        }}
                      >
                        🚧 {s.pending}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      color: isPending ? '#a8a29e' : '#78716c',
                      lineHeight: 1.3,
                      paddingLeft: 16,
                    }}
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
