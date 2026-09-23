// Context menu attaquant : actions tactiques (porteur, écran forcé, effacer
// annotations) + propriétés (main dominante, profil offensif, orientation
// corps + regard).

import { useEffect, useRef } from 'react';
import type {
  ActionTimingAnchor,
  Annotation,
  AppState,
  AttackerId,
  AttackerSpeedTier,
  DominantHand,
  OffensiveProfile,
  Tool,
  PlayerId,
} from '@/lib/types';
import { useClampedPosition } from './popupHooks';
import { ToolBar } from './ToolBar';
import { AutoActionSubmenu } from './AutoActionSubmenu';
import { DARK_PANEL } from '../sidebar/SidebarThemeContext';

const ORANGE_ACCENT = '#fdba74';
const ORANGE_TINT_BG = 'rgba(216, 90, 48, 0.10)';
const ORANGE_TINT_BORDER = 'rgba(253, 186, 116, 0.28)';

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
  actionTimingAnchor?: ActionTimingAnchor;
  bodyOrientation?: number;
  gazeOrientation?: number;
  /** State complet (lecture seule) — nécessaire pour calculer les positions et
   *  l'orientation au moment de générer une action auto. */
  state: AppState;
  onSetTool: (t: Tool) => void;
  onSetActionTimingAnchor?: (mode: ActionTimingAnchor) => void;
  onMakeCarrier: () => void;
  onForceScreener: () => void;
  onClearForcedScreener: () => void;
  onClearAnnotations: () => void;
  onSetDominantHand: (h: DominantHand) => void;
  onSetOffensiveProfile: (p: OffensiveProfile) => void;
  attackerSpeedTier?: AttackerSpeedTier | undefined;
  onSetAttackerSpeedTier: (tier: AttackerSpeedTier | undefined) => void;
  onSetBodyOrientation: (v: number | undefined) => void;
  onSetGazeOrientation: (v: number | undefined) => void;
  name?: string;
  number?: string;
  onSetPlayerName: (id: PlayerId, name: string) => void;
  onSetPlayerNumber: (id: PlayerId, num: string) => void;
  /** Création d'une annotation auto (passe / écran) depuis le sous-menu. */
  onCreateAutoAnnotation: (annotation: Annotation) => void;
  onClose: () => void;
}

export function AttackerMenu({
  oId, x, y, isCarrier, isForcedScreener, hasAnnotations, dominantHand, offensiveProfile,
  tool, onSetTool, actionTimingAnchor, onSetActionTimingAnchor, bodyOrientation, gazeOrientation,
  state, onCreateAutoAnnotation,
  onMakeCarrier, onForceScreener, onClearForcedScreener, onClearAnnotations,
  onSetDominantHand, onSetOffensiveProfile,
  attackerSpeedTier, onSetAttackerSpeedTier,
  onSetBodyOrientation, onSetGazeOrientation, onClose,
  name, number, onSetPlayerName, onSetPlayerNumber,
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
        border: `1px solid ${DARK_PANEL.border}`,
        background: disabled ? DARK_PANEL.bg : DARK_PANEL.bgSubtle,
        color: disabled ? DARK_PANEL.textDim : DARK_PANEL.text,
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
        background: DARK_PANEL.bg,
        border: `1px solid ${DARK_PANEL.border}`,
        color: DARK_PANEL.text,
        borderRadius: 8,
        padding: 10,
        minWidth: 220,
        zIndex: 1000,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="N°"
          value={number ?? ''}
          onChange={(e) => onSetPlayerNumber(oId, e.target.value.slice(0, 3))}
          style={{
            width: 36,
            height: 26,
            background: DARK_PANEL.bgSubtle,
            border: `1px solid ${DARK_PANEL.border}`,
            color: DARK_PANEL.text,
            borderRadius: 6,
            fontSize: 12,
            textAlign: 'center',
            fontWeight: 'bold',
          }}
        />
        <input
          type="text"
          placeholder={`Nom du joueur (${oId})`}
          value={name ?? ''}
          onChange={(e) => onSetPlayerName(oId, e.target.value)}
          style={{
            flex: 1,
            height: 26,
            background: DARK_PANEL.bgSubtle,
            border: `1px solid ${DARK_PANEL.border}`,
            color: DARK_PANEL.text,
            borderRadius: 6,
            fontSize: 12,
            padding: '0 8px',
          }}
        />
        <span
          onClick={onClose}
          style={{ cursor: 'pointer', color: DARK_PANEL.textDim, fontSize: 16, padding: '0 4px' }}
        >
          ×
        </span>
      </div>
      <ToolBar
        tool={tool}
        onSetTool={onSetTool}
        actionTimingAnchor={actionTimingAnchor}
        onSetActionTimingAnchor={onSetActionTimingAnchor}
      />
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
          background: ORANGE_TINT_BG,
          border: `1px solid ${ORANGE_TINT_BORDER}`,
        }}
        title="Profil offensif. Module la qualité de tir (un shooter tire mieux), l'aide adverse (un défenseur ne quitte pas un shooter mais peut sagger un non-shooter) et le closeout (plus rapide sur un shooter). Visible aussi dans les diagnostics coach."
      >
        <span style={{ fontSize: 11, color: ORANGE_ACCENT, width: 88, fontWeight: 500 }}>profil off.</span>
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
          background: ORANGE_TINT_BG,
          border: `1px solid ${ORANGE_TINT_BORDER}`,
        }}
        title="Phy.O — Tier athlétique. Module la sensibilité aux virages (elite ralentit moins dans les courbes, lent ralentit plus). Effet visible quand le profil de vitesse offensif est activé dans Paramètres."
      >
        <span style={{ fontSize: 11, color: ORANGE_ACCENT, width: 88, fontWeight: 500 }}>
          tier athl.
        </span>
        <select
          value={attackerSpeedTier ?? 'auto'}
          onChange={(e) => {
            const v = e.target.value;
            onSetAttackerSpeedTier(
              v === 'auto' ? undefined : (v as AttackerSpeedTier),
            );
          }}
          style={{ flex: 1, fontSize: 11 }}
        >
          <option value="auto">auto (standard)</option>
          <option value="elite">elite</option>
          <option value="standard">standard</option>
          <option value="lent">lent</option>
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
          background: ORANGE_TINT_BG,
          border: `1px solid ${ORANGE_TINT_BORDER}`,
        }}
        title="Override absolu de l'orientation du corps en degrés (0–360°). Si défini, écrase le calcul auto (porteur → panier, idle → ballon, etc.)."
      >
        <span style={{ fontSize: 11, color: ORANGE_ACCENT, width: 88, fontWeight: 500 }}>orient. corps</span>
        <input
          type="range"
          min={0}
          max={359}
          step={5}
          value={bodyOrientation ?? 0}
          onChange={(e) => onSetBodyOrientation(parseInt(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: bodyOrientation !== undefined ? ORANGE_ACCENT : DARK_PANEL.textDim, fontWeight: bodyOrientation !== undefined ? 600 : 400 }}>
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
          background: ORANGE_TINT_BG,
          border: `1px solid ${ORANGE_TINT_BORDER}`,
        }}
        title="Override absolu de l'orientation du regard en degrés (0–360°). Sera CLAMPÉ à ±75° du corps effectif."
      >
        <span style={{ fontSize: 11, color: ORANGE_ACCENT, width: 88, fontWeight: 500 }}>orient. regard</span>
        <input
          type="range"
          min={0}
          max={359}
          step={5}
          value={gazeOrientation ?? 0}
          onChange={(e) => onSetGazeOrientation(parseInt(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: gazeOrientation !== undefined ? ORANGE_ACCENT : DARK_PANEL.textDim, fontWeight: gazeOrientation !== undefined ? 600 : 400 }}>
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
          background: ORANGE_TINT_BG,
          border: `1px solid ${ORANGE_TINT_BORDER}`,
        }}
        title="Main dominante de l'attaquant. Un défenseur réglé « sur porteur : main faible » se décale côté main forte pour le forcer sur sa main faible (droitier → on le pousse à gauche, gaucher → à droite)."
      >
        <span style={{ fontSize: 11, color: ORANGE_ACCENT, width: 88, fontWeight: 500 }}>main dom.</span>
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
            color: '#c4b5fd',
            background: 'rgba(139, 92, 246, 0.18)',
            border: '1px solid rgba(196, 181, 253, 0.25)',
            borderRadius: 4,
          }}
        >
          Forcé comme poseur sur cette étape — l'auto-detection de proximité est désactivée.
        </div>
      )}
    </div>
  );
}
