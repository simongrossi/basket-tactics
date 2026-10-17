'use client';

import { useState } from 'react';
import type { AppState, AttackerId, Annotation } from '@/lib/types';
import { getActiveAttackerIds, activeBallCarrier } from '@/lib/logic/players';
import { generateAutoAnnotation } from '@/lib/logic/autoActions/generateAutoAnnotation';
import { COURT_ZONES } from '@/lib/data/courtZones';
import { HOOP } from '@/lib/data/court';

interface PlayComposerModalProps {
  state: AppState;
  isOpen: boolean;
  onClose: () => void;
  onApplyPlan: (actions: Annotation[], nextCarrier?: AttackerId) => void;
}

type OffBallActionType = 'none' | 'spot' | 'screen' | 'basket';

interface PlayerActionDraft {
  carrierAction: 'stay' | 'pass' | 'drive' | 'dribble_spot';
  passTarget: AttackerId;
  dribbleSpot: string;
  offBallAction: OffBallActionType;
  screenTarget: AttackerId;
  spotTarget: string;
}

const COMMON_SPOTS = [
  { id: 'top-of-key', label: 'Tête de raquette (Top)' },
  { id: 'wing-left', label: 'Aile Gauche (Wing G)' },
  { id: 'wing-right', label: 'Aile Droite (Wing D)' },
  { id: 'corner-left', label: 'Coin Gauche (Corner G)' },
  { id: 'corner-right', label: 'Coin Droit (Corner D)' },
  { id: 'dunker-spot-left', label: 'Dunker Spot G' },
  { id: 'dunker-spot-right', label: 'Dunker Spot D' },
  { id: 'high-post-left', label: 'Coude G (Elbow)' },
  { id: 'high-post-right', label: 'Coude D (Elbow)' },
  { id: 'nail', label: 'Nail (Centre LF)' },
];

export function PlayComposerModal({ state, isOpen, onClose, onApplyPlan }: PlayComposerModalProps) {
  const step = state.steps[state.activeStep];
  const attackerIds = getActiveAttackerIds(state.playerCount);
  const currentCarrier = activeBallCarrier(step, state.playerCount);

  const [carrier, setCarrier] = useState<AttackerId>(currentCarrier);
  const [drafts, setDrafts] = useState<Record<AttackerId, PlayerActionDraft>>(() => {
    const init = {} as Record<AttackerId, PlayerActionDraft>;
    attackerIds.forEach((id) => {
      const otherAttacker = attackerIds.find((o) => o !== id) ?? 'O1';
      init[id] = {
        carrierAction: 'stay',
        passTarget: otherAttacker,
        dribbleSpot: 'wing-right',
        offBallAction: 'none',
        screenTarget: otherAttacker,
        spotTarget: 'corner-left',
      };
    });
    return init;
  });

  if (!isOpen || !step) return null;

  const updateDraft = (id: AttackerId, patch: Partial<PlayerActionDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const handleApply = () => {
    const newAnnotations: Annotation[] = [];
    let nextCarrier = carrier;

    // 1. Action du porteur
    const cDraft = drafts[carrier];
    const carrierPos = step.off[carrier];

    if (carrierPos && cDraft) {
      if (cDraft.carrierAction === 'pass') {
        const passAnn = generateAutoAnnotation('pass', carrier, cDraft.passTarget, undefined, state);
        if (passAnn) {
          newAnnotations.push(passAnn);
          nextCarrier = cDraft.passTarget;
        }
      } else if (cDraft.carrierAction === 'drive') {
        // Drive vers le panier
        newAnnotations.push({
          type: 'dribble',
          fromId: carrier,
          from: { ...carrierPos },
          to: { x: HOOP.x, y: HOOP.y + 40 },
        });
      } else if (cDraft.carrierAction === 'dribble_spot') {
        const targetPt = COURT_ZONES[cDraft.dribbleSpot as keyof typeof COURT_ZONES]?.point;
        if (targetPt) {
          newAnnotations.push({
            type: 'dribble',
            fromId: carrier,
            from: { ...carrierPos },
            to: { ...targetPt },
          });
        }
      }
    }

    // 2. Mouvements sans ballon
    attackerIds.forEach((id) => {
      if (id === carrier) return;
      const d = drafts[id];
      const fromPos = step.off[id];
      if (!d || !fromPos) return;

      if (d.offBallAction === 'screen') {
        const screenAnn = generateAutoAnnotation('screen', id, d.screenTarget, { side: 'droite' }, state);
        if (screenAnn) newAnnotations.push(screenAnn);
      } else if (d.offBallAction === 'basket') {
        newAnnotations.push({
          type: 'cut',
          fromId: id,
          from: { ...fromPos },
          to: { x: HOOP.x + (id === 'O4' || id === 'O5' ? 15 : -15), y: HOOP.y + 35 },
        });
      } else if (d.offBallAction === 'spot') {
        const targetPt = COURT_ZONES[d.spotTarget as keyof typeof COURT_ZONES]?.point;
        if (targetPt) {
          newAnnotations.push({
            type: 'cut',
            fromId: id,
            from: { ...fromPos },
            to: { ...targetPt },
          });
        }
      }
    });

    onApplyPlan(newAnnotations, nextCarrier);
    onClose();
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--bt-surface, #1e293b)',
          borderRadius: 12,
          border: '1px solid var(--bt-border, #334155)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.35), 0 8px 10px -6px rgba(0, 0, 0, 0.25)',
          color: 'var(--bt-text, #f8fafc)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--bt-border, #334155)',
            background: 'var(--bt-card-bg-lift, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚡</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Orchestrateur Tactique</div>
              <div style={{ fontSize: 10, color: 'var(--bt-text-dim, #94a3b8)' }}>
                Composez les mouvements de l’étape #{state.activeStep + 1} en un clic
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bt-touch"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--bt-text-dim, #94a3b8)',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content scrollable */}
        <div style={{ padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Section 1 : Porteur du ballon */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#ea580c', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              🏀 1. Porteur de balle
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {attackerIds.map((id) => {
                const isSelected = carrier === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className="bt-touch"
                    onClick={() => setCarrier(id)}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: isSelected ? 700 : 500,
                      border: isSelected ? '2px solid #ea580c' : '1px solid var(--bt-border, #334155)',
                      background: isSelected ? 'rgba(234, 88, 12, 0.16)' : 'var(--bt-control-bg, #0f172a)',
                      color: isSelected ? '#ea580c' : 'var(--bt-text-muted, #cbd5e1)',
                      cursor: 'pointer',
                    }}
                  >
                    {id}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2 : Action du porteur */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bt-control-bg, #0f172a)', padding: 10, borderRadius: 8, border: '1px solid var(--bt-border, #334155)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#ea580c' }}>
              Action du porteur ({carrier})
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <select
                className="bt-touch"
                value={drafts[carrier]?.carrierAction}
                onChange={(e) => updateDraft(carrier, { carrierAction: e.target.value as PlayerActionDraft['carrierAction'] })}
                style={{
                  background: 'var(--bt-surface, #1e293b)',
                  color: 'var(--bt-text, #f8fafc)',
                  border: '1px solid var(--bt-border-strong, #475569)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: 11,
                }}
              >
                <option value="stay">Reste en place / Fixe</option>
                <option value="pass">Passe vers un coéquipier</option>
                <option value="drive">Drive agressif au cercle</option>
                <option value="dribble_spot">Dribble vers un spot</option>
              </select>

              {drafts[carrier]?.carrierAction === 'pass' && (
                <select
                  className="bt-touch"
                  value={drafts[carrier]?.passTarget}
                  onChange={(e) => updateDraft(carrier, { passTarget: e.target.value as AttackerId })}
                  style={{
                    background: 'var(--bt-surface, #1e293b)',
                    color: 'var(--bt-text, #f8fafc)',
                    border: '1px solid #ea580c',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 11,
                  }}
                >
                  {attackerIds
                    .filter((id) => id !== carrier)
                    .map((toId) => (
                      <option key={toId} value={toId}>
                        Destinataire : {toId}
                      </option>
                    ))}
                </select>
              )}

              {drafts[carrier]?.carrierAction === 'dribble_spot' && (
                <select
                  className="bt-touch"
                  value={drafts[carrier]?.dribbleSpot}
                  onChange={(e) => updateDraft(carrier, { dribbleSpot: e.target.value })}
                  style={{
                    background: 'var(--bt-surface, #1e293b)',
                    color: 'var(--bt-text, #f8fafc)',
                    border: '1px solid #ea580c',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 11,
                  }}
                >
                  {COMMON_SPOTS.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Section 3 : Actions simultanées sans ballon */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--bt-accent, #38bdf8)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              🏃 2. Mouvements sans ballon
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {attackerIds
                .filter((id) => id !== carrier)
                .map((id) => {
                  const d = drafts[id];
                  return (
                    <div
                      key={id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '36px 1fr 1fr',
                        gap: 6,
                        alignItems: 'center',
                        background: 'var(--bt-control-bg, #0f172a)',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--bt-border, #334155)',
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--bt-accent, #38bdf8)' }}>{id}</span>
                      <select
                        className="bt-touch"
                        value={d?.offBallAction}
                        onChange={(e) => updateDraft(id, { offBallAction: e.target.value as OffBallActionType })}
                        style={{
                          background: 'var(--bt-surface, #1e293b)',
                          color: 'var(--bt-text, #f8fafc)',
                          border: '1px solid var(--bt-border-strong, #475569)',
                          borderRadius: 6,
                          padding: '4px 6px',
                          fontSize: 11,
                        }}
                      >
                        <option value="none">Reste au poste</option>
                        <option value="screen">Pose un écran pour…</option>
                        <option value="basket">Coupe au cercle (Cut)</option>
                        <option value="spot">Démarquage sur spot…</option>
                      </select>

                      {d?.offBallAction === 'screen' ? (
                        <select
                          className="bt-touch"
                          value={d.screenTarget}
                          onChange={(e) => updateDraft(id, { screenTarget: e.target.value as AttackerId })}
                          style={{
                            background: 'var(--bt-surface, #1e293b)',
                            color: 'var(--bt-text, #f8fafc)',
                            border: '1px solid var(--bt-accent, #38bdf8)',
                            borderRadius: 6,
                            padding: '4px 6px',
                            fontSize: 11,
                          }}
                        >
                          {attackerIds
                            .filter((targetId) => targetId !== id)
                            .map((targetId) => (
                              <option key={targetId} value={targetId}>
                                Pour {targetId} {targetId === carrier ? '(Porteur)' : ''}
                              </option>
                            ))}
                        </select>
                      ) : d?.offBallAction === 'spot' ? (
                        <select
                          className="bt-touch"
                          value={d.spotTarget}
                          onChange={(e) => updateDraft(id, { spotTarget: e.target.value })}
                          style={{
                            background: 'var(--bt-surface, #1e293b)',
                            color: 'var(--bt-text, #f8fafc)',
                            border: '1px solid var(--bt-accent, #38bdf8)',
                            borderRadius: 6,
                            padding: '4px 6px',
                            fontSize: 11,
                          }}
                        >
                          {COMMON_SPOTS.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ fontSize: 10, color: 'var(--bt-text-dim, #64748b)', fontStyle: 'italic', paddingLeft: 4 }}>
                          {d?.offBallAction === 'basket' ? 'Course directe panier' : 'Immobile'}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '10px 16px',
            borderTop: '1px solid var(--bt-border, #334155)',
            background: 'var(--bt-card-bg-lift, #0f172a)',
          }}
        >
          <button
            type="button"
            className="bt-touch"
            onClick={onClose}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--bt-border-strong, #475569)',
              background: 'transparent',
              color: 'var(--bt-text-muted, #cbd5e1)',
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            className="bt-touch"
            onClick={handleApply}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              background: '#ea580c',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Appliquer à l’étape ✨
          </button>
        </div>
      </div>
    </div>
  );
}
