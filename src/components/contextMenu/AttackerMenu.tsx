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
import { DARK_PANEL, useSidebarTheme } from '../sidebar/SidebarThemeContext';


const PROFILE_LABELS: Record<OffensiveProfile, string> = {
  creator:      'Créateur (meneur / porteur)',
  shooter:      'Tireur 3 pts fiable',
  slasher:      'Pénétrant (drive / slasher)',
  'rim-roller': 'Intérieur rouleur (5/4)',
  'stretch-big':'Intérieur tireur (stretch 4)',
  'non-shooter':'Non-tireur (on peut flotter)',
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
  const { dark } = useSidebarTheme();
  const orangeAccent = dark ? '#fdba74' : '#c2410c';
  const orangeTintBg = dark ? 'rgba(216, 90, 48, 0.10)' : 'rgba(234, 88, 12, 0.08)';
  const orangeTintBorder = dark ? 'rgba(253, 186, 116, 0.28)' : 'rgba(234, 88, 12, 0.25)';

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
      className="bt-context-menu"
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        pointerEvents: 'auto',
        background: DARK_PANEL.bg,
        border: `1px solid ${DARK_PANEL.border}`,
        color: DARK_PANEL.text,
        borderRadius: 8,
        padding: 10,
        minWidth: 220,
        zIndex: 1000,
        boxShadow: dark ? '0 4px 16px rgba(0, 0, 0, 0.45)' : '0 10px 25px rgba(0, 0, 0, 0.12)',
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
          label={isCarrier ? '✓ Porteur du ballon (étape active)' : '🏀 Donner le ballon (porteur)'}
          onClick={onMakeCarrier}
          disabled={isCarrier}
        />
        {isForcedScreener ? (
          <Item label="↻ Ne plus forcer comme poseur d'écran" onClick={onClearForcedScreener} />
        ) : (
          <Item label="🧱 Forcer comme poseur d'écran" onClick={onForceScreener} />
        )}
        <Item
          label="🗑 Effacer ses tracés sur cette étape"
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
          background: orangeTintBg,
          border: `1px solid ${orangeTintBorder}`,
        }}
        title="Profil offensif. Influence la qualité de tir, l'aide adverse (un défenseur colle un tireur mais flotte sur un non-tireur) et la vitesse de contestation (closeout)."
      >
        <span style={{ fontSize: 11, color: orangeAccent, width: 88, fontWeight: 600 }}>Profil joueur</span>
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
          background: orangeTintBg,
          border: `1px solid ${orangeTintBorder}`,
        }}
        title="Main forte de l'attaquant. Un défenseur réglé sur « forcer main faible » se décale pour l'orienter vers son autre main."
      >
        <span style={{ fontSize: 11, color: orangeAccent, width: 88, fontWeight: 600 }}>Main forte</span>
        <select
          value={dominantHand}
          onChange={(e) => onSetDominantHand(e.target.value as DominantHand)}
          style={{ flex: 1, fontSize: 11 }}
        >
          <option value="right">Droitier</option>
          <option value="left">Gaucher</option>
        </select>
      </div>

      <details
        className="bt-context-details"
        open={attackerSpeedTier !== undefined || bodyOrientation !== undefined || gazeOrientation !== undefined ? true : undefined}
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px solid ${DARK_PANEL.borderSubtle}`,
        }}
      >
        <summary
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: 11,
            fontWeight: 700,
            color: DARK_PANEL.textMuted,
          }}
        >
          <span>⚙ Posture & athlétisme</span>
          <span
            className="bt-context-details-state"
            aria-hidden="true"
            style={{ color: DARK_PANEL.textDim, fontSize: 10, fontWeight: 600 }}
          />
        </summary>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 6px',
              borderRadius: 4,
              background: orangeTintBg,
              border: `1px solid ${orangeTintBorder}`,
            }}
            title="Niveau athlétique : influence le maintien de vitesse dans les courbes et changements de direction."
          >
            <span style={{ fontSize: 11, color: orangeAccent, width: 88, fontWeight: 500 }}>
              Athlétisme
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
              <option value="auto">Auto (standard)</option>
              <option value="elite">Élite (explosif)</option>
              <option value="standard">Standard</option>
              <option value="lent">Lourd / lent</option>
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 6px',
              borderRadius: 4,
              background: orangeTintBg,
              border: `1px solid ${orangeTintBorder}`,
            }}
            title="Orientation manuelle des épaules en degrés (0–360°). Par défaut (auto), le joueur fait face au panier ou au ballon."
          >
            <span style={{ fontSize: 11, color: orangeAccent, width: 88, fontWeight: 500 }}>Orient. corps</span>
            <input
              type="range"
              min={0}
              max={359}
              step={5}
              value={bodyOrientation ?? 0}
              onChange={(e) => onSetBodyOrientation(parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: bodyOrientation !== undefined ? orangeAccent : DARK_PANEL.textDim, fontWeight: bodyOrientation !== undefined ? 600 : 400 }}>
              {bodyOrientation !== undefined ? `${bodyOrientation}°` : 'auto'}
            </span>
            {bodyOrientation !== undefined && (
              <button
                onClick={() => onSetBodyOrientation(undefined)}
                title="Revenir au calcul automatique"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
              >↻</button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 6px',
              borderRadius: 4,
              background: orangeTintBg,
              border: `1px solid ${orangeTintBorder}`,
            }}
            title="Orientation manuelle de la tête et du regard en degrés (0–360°, limitée anatomiquement à ±75° par rapport aux épaules)."
          >
            <span style={{ fontSize: 11, color: orangeAccent, width: 88, fontWeight: 500 }}>Orient. regard</span>
            <input
              type="range"
              min={0}
              max={359}
              step={5}
              value={gazeOrientation ?? 0}
              onChange={(e) => onSetGazeOrientation(parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: gazeOrientation !== undefined ? orangeAccent : DARK_PANEL.textDim, fontWeight: gazeOrientation !== undefined ? 600 : 400 }}>
              {gazeOrientation !== undefined ? `${gazeOrientation}°` : 'auto'}
            </span>
            {gazeOrientation !== undefined && (
              <button
                onClick={() => onSetGazeOrientation(undefined)}
                title="Revenir au calcul automatique"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
              >↻</button>
            )}
          </div>
        </div>
      </details>

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
          Forcé comme poseur sur cette étape — la détection automatique de proximité est désactivée.
        </div>
      )}
    </div>
  );
}
