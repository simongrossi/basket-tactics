// Context menu attaquant : actions tactiques (porteur, écran forcé, effacer
// annotations) + propriétés (main dominante, profil offensif, orientation
// corps + regard).

import { useEffect, useRef } from 'react';
import type { Annotation, AppState, AttackerId, DominantHand, OffensiveProfile, Tool } from '@/lib/types';
import { useClampedPosition } from './popupHooks';
import { ToolBar } from './ToolBar';
import { AutoActionSubmenu } from './AutoActionSubmenu';

const PROFILE_LABELS: Record<OffensiveProfile, string> = {
  creator:      'créateur (meneur)',
  shooter:      'tireur (3pts fiable)',
  slasher:      'slasher (drive)',
  'rim-roller': 'rim-roller (5/4 rouleur)',
  'stretch-big':'stretch big (4 shooter)',
  'non-shooter':'non-shooter (laisser)',
};

export interface AttackerMenuProps {
  kind: 'attacker';
  oId: AttackerId;
  x: number;
  y: number;
  isCarrier: boolean;
  isForcedScreener: boolean;
  hasAnnotations: boolean;
  dominantHand: DominantHand;
  offensiveProfile: OffensiveProfile;
  tool: Tool;
  bodyOrientation?: number;
  gazeOrientation?: number;
  /** State complet (lecture seule) — nécessaire pour calculer les positions et
   *  l'orientation au moment de générer une action auto. */
  state: AppState;
  onSetTool: (t: Tool) => void;
  onMakeCarrier: () => void;
  onForceScreener: () => void;
  onClearForcedScreener: () => void;
  onClearAnnotations: () => void;
  onSetDominantHand: (h: DominantHand) => void;
  onSetOffensiveProfile: (p: OffensiveProfile) => void;
  onSetBodyOrientation: (v: number | undefined) => void;
  onSetGazeOrientation: (v: number | undefined) => void;
  /** Création d'une annotation auto (passe / écran) depuis le sous-menu. */
  onCreateAutoAnnotation: (annotation: Annotation) => void;
  onClose: () => void;
}

export function AttackerMenu({
  oId, x, y, isCarrier, isForcedScreener, hasAnnotations, dominantHand, offensiveProfile,
  tool, onSetTool, bodyOrientation, gazeOrientation,
  state, onCreateAutoAnnotation,
  onMakeCarrier, onForceScreener, onClearForcedScreener, onClearAnnotations,
  onSetDominantHand, onSetOffensiveProfile, onSetBodyOrientation, onSetGazeOrientation, onClose,
}: AttackerMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useClampedPosition(x, y, ref);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Item local : pas extrait dans sharedRows car il a un comportement
  // spécifique attaquant (auto-close après clic).
  const Item = ({
    label, onClick, disabled,
  }: { label: string; onClick: () => void; disabled?: boolean }) => (
    <button
      onClick={() => { if (!disabled) { onClick(); onClose(); } }}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        fontSize: 12,
        padding: '6px 8px',
        borderRadius: 4,
        border: '1px solid #e7e5e4',
        background: disabled ? '#f8f8f7' : '#fff',
        color: disabled ? '#a8a29e' : '#1c1917',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 10,
        minWidth: 220,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#9A3412' }}>
        ⚪ {oId}
        <span
          onClick={onClose}
          style={{ float: 'right', cursor: 'pointer', color: '#999', fontSize: 14 }}
        >
          ×
        </span>
      </div>
      <ToolBar tool={tool} onSetTool={onSetTool} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Item
          label={isCarrier ? '✓ porteur (étape active)' : 'marquer comme porteur'}
          onClick={onMakeCarrier}
          disabled={isCarrier}
        />
        {isForcedScreener ? (
          <Item label="↻ libérer (ne plus forcer)" onClick={onClearForcedScreener} />
        ) : (
          <Item label="forcer comme poseur d'écran" onClick={onForceScreener} />
        )}
        <Item
          label="effacer ses annotations"
          onClick={onClearAnnotations}
          disabled={!hasAnnotations}
        />
      </div>

      <AutoActionSubmenu
        state={state}
        fromId={oId}
        onCreate={(ann) => {
          if (ann) onCreateAutoAnnotation(ann);
        }}
        onClose={onClose}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          padding: '5px 6px',
          borderRadius: 4,
          background: '#fff7ed',
          border: '1px solid #fed7aa',
        }}
        title="Profil offensif. Module la qualité de tir (un shooter tire mieux), l'aide adverse (un défenseur ne quitte pas un shooter mais peut sagger un non-shooter) et le closeout (plus rapide sur un shooter). Visible aussi dans les diagnostics coach."
      >
        <span style={{ fontSize: 11, color: '#9a3412', width: 88, fontWeight: 500 }}>profil off.</span>
        <select
          value={offensiveProfile}
          onChange={(e) => onSetOffensiveProfile(e.target.value as OffensiveProfile)}
          style={{ flex: 1, fontSize: 11 }}
        >
          {(Object.keys(PROFILE_LABELS) as OffensiveProfile[]).map((p) => (
            <option key={p} value={p}>{PROFILE_LABELS[p]}</option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
          padding: '5px 6px',
          borderRadius: 4,
          background: '#fff7ed',
          border: '1px solid #fed7aa',
        }}
        title="Override absolu de l'orientation du corps en degrés (0–360°). Si défini, écrase le calcul auto (porteur → panier, idle → ballon, etc.)."
      >
        <span style={{ fontSize: 11, color: '#9a3412', width: 88, fontWeight: 500 }}>orient. corps</span>
        <input
          type="range"
          min={0}
          max={359}
          step={5}
          value={bodyOrientation ?? 0}
          onChange={(e) => onSetBodyOrientation(parseInt(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: bodyOrientation !== undefined ? '#9a3412' : '#94a3b8', fontWeight: bodyOrientation !== undefined ? 600 : 400 }}>
          {bodyOrientation !== undefined ? `${bodyOrientation}°` : 'auto'}
        </span>
        {bodyOrientation !== undefined && (
          <button
            onClick={() => onSetBodyOrientation(undefined)}
            title="Revenir au calcul auto"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
          >↻</button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
          padding: '5px 6px',
          borderRadius: 4,
          background: '#fff7ed',
          border: '1px solid #fed7aa',
        }}
        title="Override absolu de l'orientation du regard en degrés (0–360°). Sera CLAMPÉ à ±60° du corps effectif (= cône de champ de vision)."
      >
        <span style={{ fontSize: 11, color: '#9a3412', width: 88, fontWeight: 500 }}>orient. regard</span>
        <input
          type="range"
          min={0}
          max={359}
          step={5}
          value={gazeOrientation ?? 0}
          onChange={(e) => onSetGazeOrientation(parseInt(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: gazeOrientation !== undefined ? '#9a3412' : '#94a3b8', fontWeight: gazeOrientation !== undefined ? 600 : 400 }}>
          {gazeOrientation !== undefined ? `${gazeOrientation}°` : 'auto'}
        </span>
        {gazeOrientation !== undefined && (
          <button
            onClick={() => onSetGazeOrientation(undefined)}
            title="Revenir au calcul auto"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
          >↻</button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 6,
          padding: '5px 6px',
          borderRadius: 4,
          background: '#fff7ed',
          border: '1px solid #fed7aa',
        }}
        title="Main dominante de l'attaquant. Utilisée par les défenseurs en stance 'mauvaise main' pour décider quel côté fermer (droitier → on le pousse à gauche, gaucher → à droite)."
      >
        <span style={{ fontSize: 11, color: '#9a3412', width: 88, fontWeight: 500 }}>main dom.</span>
        <select
          value={dominantHand}
          onChange={(e) => onSetDominantHand(e.target.value as DominantHand)}
          style={{ flex: 1, fontSize: 11 }}
        >
          <option value="right">droitier</option>
          <option value="left">gaucher</option>
        </select>
      </div>

      {isForcedScreener && (
        <div
          style={{
            marginTop: 8,
            padding: '4px 6px',
            fontSize: 11,
            color: '#5b21b6',
            background: '#ede9fe',
            borderRadius: 4,
          }}
        >
          Forcé comme poseur sur cette étape — l'auto-detection de proximité est désactivée.
        </div>
      )}
    </div>
  );
}
