'use client';

import { useState, useEffect } from 'react';
import {
  DEFENSIVE_ACTIONS_CATALOG,
  ALL_DEFENSIVE_ACTION_TYPES,
} from '@/lib/data/defensiveActionsCatalog';
import type { DefensiveActionType } from '@/lib/types';

interface AddCoverageModalProps {
  onClose: () => void;
  onPick: (type: DefensiveActionType) => void;
}

export function AddCoverageModal({ onClose, onPick }: AddCoverageModalProps) {
  const [filter, setFilter] = useState('');
  const filterLower = filter.trim().toLowerCase();

  // Échap ferme le modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const matches = (type: DefensiveActionType) => {
    if (!filterLower) return true;
    const def = DEFENSIVE_ACTIONS_CATALOG[type];
    return (
      def.label.toLowerCase().includes(filterLower) ||
      def.fibaTerm.toLowerCase().includes(filterLower) ||
      def.description.toLowerCase().includes(filterLower)
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12,
          width: 'min(480px, 100%)', maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #dbeafe',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a', flex: 1 }}>
            🛡️ Ajouter une couverture défensive
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: 13, padding: '4px 10px', borderRadius: 6,
              border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
              color: '#475569',
            }}
            title="Fermer (Échap)"
          >✕</button>
        </div>
        <div style={{ padding: '10px 18px', borderBottom: '1px solid #dbeafe' }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer (trap, help, switch…)"
            autoFocus
            style={{
              width: '100%', fontSize: 13, padding: '7px 10px',
              borderRadius: 6, border: '1px solid #cbd5e1', outline: 'none',
            }}
          />
        </div>
        <div style={{ overflow: 'auto', padding: '10px 18px 14px', flex: 1 }}>
          {ALL_DEFENSIVE_ACTION_TYPES.filter(matches).map((type) => {
            const def = DEFENSIVE_ACTIONS_CATALOG[type];
            return (
              <button
                key={type}
                onClick={() => onPick(type)}
                title={def.fibaTerm}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  fontSize: 12, padding: '8px 10px', marginBottom: 4,
                  border: '1px solid #dbeafe', borderRadius: 6,
                  background: '#fff', cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1e3a8a' }}>{def.label}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {def.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
