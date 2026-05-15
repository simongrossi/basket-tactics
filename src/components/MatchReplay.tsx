'use client';

// P3.4 — B7 Replay détaillé post-match.
//
// Vue "post-mortem" qui liste tous les événements de la session avec
// timeline, severity coloré, et détails au survol. Permet au coach de
// revoir précisément ce qui s'est passé après une session live.
//
// V1 : focus sur l'eventLog (pas de "scrub frame par frame" — c'est V2
// si jamais on stocke les snapshots de matchState).

import { useState } from 'react';
import type { MatchState } from '@/lib/logic/match/gameLoop';
import type { AiPossessionEvent } from '@/lib/logic/match/aiPossession';

interface MatchReplayProps {
  matchState: MatchState | null;
  onClose: () => void;
}

/** Couleurs par type d'événement, alignées avec l'UX live HUD. */
const EVENT_COLORS: Record<AiPossessionEvent['type'], string> = {
  pass: '#3b82f6',
  drive: '#0891b2',
  shot: '#16a34a',
  turnover: '#dc2626',
  'forced-shot': '#d97706',
};

const EVENT_ICONS: Record<AiPossessionEvent['type'], string> = {
  pass: '→',
  drive: '↘',
  shot: '🎯',
  turnover: '⚠',
  'forced-shot': '⚠🎯',
};

export function MatchReplay({ matchState, onClose }: MatchReplayProps) {
  const [filter, setFilter] = useState<'all' | AiPossessionEvent['type']>('all');

  if (!matchState) return null;

  const filtered =
    filter === 'all'
      ? matchState.eventLog
      : matchState.eventLog.filter((e) => e.type === filter);

  // Group by possession for organized display
  const byPossession = new Map<number, AiPossessionEvent[]>();
  filtered.forEach((e) => {
    const arr = byPossession.get(e.possession) ?? [];
    arr.push(e);
    byPossession.set(e.possession, arr);
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          padding: 16,
          minWidth: 480,
          maxWidth: 720,
          maxHeight: '85vh',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          title="Fermer (Échap)"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 20,
            color: '#64748b',
            width: 32,
            height: 32,
            borderRadius: 6,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: 4 }}>
          📼 Replay post-match
        </h2>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          {matchState.eventLog.length} événement{matchState.eventLog.length > 1 ? 's' : ''} ·{' '}
          {matchState.possessionsPlayed} possession{matchState.possessionsPlayed > 1 ? 's' : ''} jouée
          {matchState.possessionsPlayed > 1 ? 's' : ''} · Score final {matchState.homeScore}-
          {matchState.awayScore}
        </div>

        {/* Filtre par type d'événement */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {(['all', 'pass', 'drive', 'shot', 'forced-shot', 'turnover'] as const).map((t) => {
            const active = filter === t;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 12,
                  border: '1px solid',
                  borderColor: active ? '#4338ca' : '#cbd5e1',
                  background: active ? '#eef2ff' : '#fff',
                  color: active ? '#3730a3' : '#64748b',
                  cursor: 'pointer',
                  fontWeight: active ? 700 : 500,
                  textTransform: 'capitalize',
                }}
              >
                {t === 'all' ? 'tous' : t}
              </button>
            );
          })}
        </div>

        {/* Timeline par possession */}
        {Array.from(byPossession.entries())
          .sort(([a], [b]) => a - b)
          .map(([possession, events]) => (
            <div
              key={possession}
              style={{
                marginBottom: 12,
                padding: 8,
                background: '#f8fafc',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#1e3a8a',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Possession #{possession} · {events.length} event{events.length > 1 ? 's' : ''}
              </div>
              {events.map((e, idx) => (
                <div
                  key={`${e.possession}-${idx}`}
                  style={{
                    display: 'flex',
                    gap: 8,
                    padding: '4px 6px',
                    fontSize: 11,
                    color: '#1e293b',
                    borderBottom: idx < events.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}
                >
                  <span
                    style={{
                      flex: '0 0 40px',
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                      fontSize: 10,
                    }}
                  >
                    {e.clock.toFixed(1)}s
                  </span>
                  <span
                    style={{
                      flex: '0 0 20px',
                      color: EVENT_COLORS[e.type],
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {EVENT_ICONS[e.type]}
                  </span>
                  <span style={{ flex: 1 }}>{e.label}</span>
                  {e.points !== undefined && e.points > 0 && (
                    <span style={{ flex: '0 0 30px', color: '#16a34a', fontWeight: 700, textAlign: 'right' }}>
                      +{e.points}
                    </span>
                  )}
                  {e.shotZone && (
                    <span
                      style={{
                        flex: '0 0 70px',
                        fontSize: 9,
                        color: '#64748b',
                        fontStyle: 'italic',
                        textAlign: 'right',
                      }}
                    >
                      {e.shotZone} {e.contested ? '⚠' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 12 }}>
            Aucun événement ne correspond au filtre.
          </div>
        )}
      </div>
    </div>
  );
}
