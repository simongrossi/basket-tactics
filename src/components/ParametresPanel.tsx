'use client';

import { useId, type CSSProperties, type ReactNode } from 'react';
import type { AppState, PlayerCount, PlayerId } from '@/lib/types';
import { PLAYER_COUNT_OPTIONS } from '@/lib/logic/players';
import { Panel, CheckboxLine } from './ui';

interface ParametresPanelProps {
  state: AppState;
  onPatch: (p: Partial<AppState>) => void;
  onSetPlayerCount: (count: PlayerCount) => void;
  onAutoPositionOffBall?: () => void;
  /** F.4 — Toggle DQ d'un joueur (faute technique / 5e perso). */
  onTogglePlayerDisqualified?: (playerId: PlayerId) => void;
  /** F.4 — Réinitialise les disqualifications (= début de partie). */
  onClearDisqualified?: () => void;
}

const UI = {
  page: '#171a20',
  panel: '#1e232c',
  panelLift: '#232a35',
  control: '#252c37',
  controlHover: '#2d3542',
  controlOff: '#171c24',
  border: '#303846',
  borderStrong: '#465264',
  text: '#f3f4f6',
  muted: '#cbd5e1',
  dim: '#8f9aad',
  accent: '#4ba3ff',
  accentDeep: '#1d75d0',
  orange: '#fb923c',
  green: '#34d399',
  amber: '#fbbf24',
  violet: '#a78bfa',
  cyan: '#22d3ee',
  red: '#f87171',
} as const;

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 850,
  color: UI.dim,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
};

const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
  padding: 12,
  background: `linear-gradient(180deg, ${UI.panelLift} 0%, ${UI.panel} 100%)`,
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 26px rgba(0,0,0,0.12)',
};

const groupTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 11,
  fontWeight: 850,
  color: UI.text,
  letterSpacing: '0.01em',
};

const categoryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 10,
};

const toggleListStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 7,
};

const compactGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 8,
};

const inputStyle: CSSProperties = {
  width: 66,
  padding: '7px 9px',
  fontSize: 13,
  fontWeight: 800,
  textAlign: 'right',
  border: `1px solid ${UI.borderStrong}`,
  borderRadius: 7,
  background: UI.controlOff,
  color: UI.text,
  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
};

/**
 * Panneau dédié aux options d'affichage : toggles "Visu & légende" +
 * indicateurs auto + légende informative. Sorti du DefensePanel pour
 * regrouper TOUTES les options visuelles au même endroit, et alléger
 * la hauteur du panneau Défense (qui se concentre sur la simulation).
 */
export function ParametresPanel({
  state,
  onPatch,
  onSetPlayerCount,
  onAutoPositionOffBall,
  onTogglePlayerDisqualified,
  onClearDisqualified,
}: ParametresPanelProps) {
  return (
    <Panel theme="defense" title="⚙ Paramètres">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <SettingsSection title="Format de jeu">
          <ControlGroup title="Joueurs actifs" accent={UI.accent}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 7 }}>
              {PLAYER_COUNT_OPTIONS.map((count) => (
                <SegmentButton
                  key={count}
                  active={state.playerCount === count}
                  onClick={() => onSetPlayerCount(count)}
                >
                  {count}x{count}
                </SegmentButton>
              ))}
            </div>
          </ControlGroup>
        </SettingsSection>

        <SettingsSection title="Timecode">
          <ControlGroup title="Rythme" accent={UI.cyan}>
            <div style={compactGridStyle}>
              <NumberField
                label="s / étape"
                title="Durée d'une étape en secondes. Affecte uniquement l'horloge et le shot clock — le moteur reste step-based."
              >
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={state.secondsPerStep ?? 4}
                  onChange={(e) => onPatch({ secondsPerStep: parseFloat(e.target.value) })}
                  style={inputStyle}
                />
              </NumberField>
              <NumberField
                label="possession"
                title="Durée totale de la possession (24s FIBA / 14s reset après rebond offensif)."
              >
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={state.possessionSeconds ?? 24}
                  onChange={(e) => onPatch({ possessionSeconds: parseInt(e.target.value, 10) })}
                  style={inputStyle}
                />
              </NumberField>
            </div>
            <div style={{ marginTop: 8 }}>
              <CheckboxLine
                checked={!!state.realSpeedMode}
                label="Mode Sprint NBA (Vitesse réelle)"
                onChange={(v) => onPatch({ realSpeedMode: v })}
                title="Passe de la vitesse d'explication tactique (2s par étape) à la vitesse réelle du match (0.5s par étape)."
              />
            </div>
          </ControlGroup>
        </SettingsSection>
      </div>

      {/* F.4 — Disqualifications */}
      {onTogglePlayerDisqualified && (
        <SettingsSection title="Disqualifications">
          <ControlGroup title="Joueurs indisponibles" accent={UI.red}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 7 }}>
              {(['O1', 'O2', 'O3', 'O4', 'O5'] as PlayerId[]).map((id) => {
                const isDq = state.disqualifiedPlayers?.includes(id) ?? false;
                return (
                  <PlayerToggleButton
                    key={id}
                    id={id}
                    active={isDq}
                    onClick={() => onTogglePlayerDisqualified(id)}
                    title={isDq ? `${id} disqualifié — clic pour réintégrer` : `Disqualifier ${id}`}
                  />
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 7 }}>
              {(['D1', 'D2', 'D3', 'D4', 'D5'] as PlayerId[]).map((id) => {
                const isDq = state.disqualifiedPlayers?.includes(id) ?? false;
                return (
                  <PlayerToggleButton
                    key={id}
                    id={id}
                    active={isDq}
                    onClick={() => onTogglePlayerDisqualified(id)}
                    title={isDq ? `${id} disqualifié — clic pour réintégrer` : `Disqualifier ${id}`}
                  />
                );
              })}
            </div>
            {state.disqualifiedPlayers && state.disqualifiedPlayers.length > 0 && onClearDisqualified && (
              <DarkActionButton onClick={onClearDisqualified}>
                Réintégrer tous
              </DarkActionButton>
            )}
          </ControlGroup>
        </SettingsSection>
      )}

      <SettingsSection title="Visu & légende">
        <div style={categoryGridStyle}>
          <ToggleGroup title="Tracés & repères" accent={UI.green}>
            <ToggleCard
              checked={state.showHelpLines}
              label="aide"
              sample="dashed" color={UI.violet}
              onChange={(v) => onPatch({ showHelpLines: v })}
            />
            <ToggleCard
              checked={state.showPassLanes}
              label="lignes passe"
              sample="dashed" color={UI.green}
              onChange={(v) => onPatch({ showPassLanes: v })}
            />
            <ToggleCard
              checked={state.showMatchups}
              label="matchups"
              sample="line" color="#a8a29e"
              onChange={(v) => onPatch({ showMatchups: v })}
            />
            <ToggleCard
              checked={!!state.showGhosts}
              label="ghost N-1"
              sample="circle-dashed" color={UI.orange}
              onChange={(v) => onPatch({ showGhosts: v })}
            />
            <ToggleCard
              checked={!!state.showActionOrder}
              label="num. actions"
              sample="num" color="#94a3b8"
              onChange={(v) => onPatch({ showActionOrder: v })}
            />
            <ToggleCard
              checked={state.showDetectionBadges !== false}
              label="badges détections"
              sample="line" color={UI.orange}
              onChange={(v) => onPatch({ showDetectionBadges: v })}
            />
          </ToggleGroup>

          <ToggleGroup title="Lecture offensive" accent={UI.amber}>
            <ToggleCard
              checked={state.showCoachDiagnostics !== false}
              label="lecture coach"
              sample="line" color={UI.amber}
              onChange={(v) => onPatch({ showCoachDiagnostics: v })}
            />
            <ToggleCard
              checked={!!state.showThreats}
              label="menace attaquants"
              sample="ring-solid" color={UI.green}
              onChange={(v) => onPatch({ showThreats: v })}
            />
            <ToggleCard
              checked={!!state.showBestAction}
              label="meilleure action"
              sample="ring-solid" color={UI.amber}
              onChange={(v) => onPatch({ showBestAction: v })}
            />
            <ToggleCard
              checked={!!state.showTacticalMetrics}
              label="EJE / EJO"
              sample="dashed" color={UI.green}
              onChange={(v) => onPatch({ showTacticalMetrics: v })}
            />
            <ToggleCard
              checked={!!state.showHeatmap}
              label="heatmap zones"
              sample="gradient" color={UI.green}
              onChange={(v) => onPatch({ showHeatmap: v })}
            />
          </ToggleGroup>

          <ToggleGroup title="Terrain & champs" accent={UI.cyan}>
            <ToggleCard
              checked={state.fullCourt}
              label="terrain complet"
              sample="court" color={UI.accent}
              onChange={(v) => onPatch({ fullCourt: v })}
            />
            <ToggleCard
              checked={!!state.showFieldOfViewAll}
              label="champ vision (tous)"
              sample="circle" color="#94a3b8"
              onChange={(v) => onPatch({ showFieldOfViewAll: v })}
            />
            <ToggleCard
              checked={!!state.showFieldOfViewAllDefenders}
              label="champ vision défenseurs"
              sample="circle" color={UI.cyan}
              onChange={(v) => onPatch({ showFieldOfViewAllDefenders: v })}
            />
            <ToggleCard
              checked={!!state.showFieldOfViewAllAttackers}
              label="champ vision attaquants"
              sample="circle" color={UI.orange}
              onChange={(v) => onPatch({ showFieldOfViewAllAttackers: v })}
            />
            <ToggleCard
              checked={!!state.showHelpDebug}
              label="debug aide"
              sample="dashed" color={UI.violet}
              onChange={(v) => onPatch({ showHelpDebug: v })}
            />
          </ToggleGroup>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <DarkActionButton
            onClick={() => onPatch({
              attackingDirection: state.attackingDirection === 'down' ? 'up' : 'down',
            })}
            disabled={!state.fullCourt}
            title={state.fullCourt ? "Bascule le sens d'attaque (panier visé / panier protégé)" : "Active 'terrain complet' pour utiliser cette option"}
          >
            Sens d'attaque : {state.attackingDirection === 'down' ? 'vers le bas' : 'vers le haut'}
          </DarkActionButton>

          {onAutoPositionOffBall && (
            <DarkActionButton
              onClick={onAutoPositionOffBall}
              title="Repositionne les 4 attaquants hors-porteur en maximisant le spacing (graphe complet) avec pénalité de couloir EJO ballon→panier. Respecte les profils offensifs et la Règle 1 anti-superposition."
            >
              Auto-positionner hors-porteur
            </DarkActionButton>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Indicateurs auto">
        <div style={categoryGridStyle}>
          <ToggleGroup title="Écrans & switches" accent={UI.violet}>
            <ToggleCard
              checked={state.showSwitchMatchups !== false}
              label="matchup switch"
              sample="dashed" color={UI.amber}
              onChange={(v) => onPatch({ showSwitchMatchups: v })}
            />
            <ToggleCard
              checked={state.showScreenIndicators !== false}
              label="indic. écran"
              sample="circle" color={UI.violet}
              onChange={(v) => onPatch({ showScreenIndicators: v })}
            />
            <ToggleCard
              checked={!!state.showScreenDebug}
              label="debug écran"
              sample="circle-dashed" color={UI.red}
              onChange={(v) => onPatch({ showScreenDebug: v })}
            />
            <ToggleCard
              checked={!!state.showPlayerDebug}
              label="debug joueur"
              sample="circle-dashed" color={UI.violet}
              onChange={(v) => onPatch({ showPlayerDebug: v })}
            />
            <ToggleCard
              checked={!!state.showProfileOverlay}
              label="profile (J.5)"
              sample="circle-dashed" color={UI.amber}
              onChange={(v) => onPatch({ showProfileOverlay: v })}
            />
            <ToggleCard
              checked={!!state.anomalyDetectionEnabled}
              label="anomalies (K)"
              sample="circle-dashed" color={UI.red}
              onChange={(v) => onPatch({ anomalyDetectionEnabled: v })}
            />
            <ToggleCard
              checked={state.showStateRings !== false}
              label="anneaux déf."
              sample="ring" color={UI.amber}
              onChange={(v) => onPatch({ showStateRings: v })}
            />
            <ToggleCard
              checked={state.showOffBallScreenIndicator !== false}
              label="écran non-porteur"
              sample="circle" color="#22c55e"
              onChange={(v) => onPatch({ showOffBallScreenIndicator: v })}
            />
            <ToggleCard
              checked={state.showForcedScreenerBadge !== false}
              label="poseur forcé"
              sample="dot" color={UI.violet}
              onChange={(v) => onPatch({ showForcedScreenerBadge: v })}
            />
          </ToggleGroup>

          <ToggleGroup title="Passes & pression" accent={UI.orange}>
            <ToggleCard
              checked={state.showContestedPass !== false}
              label="passe contestée"
              sample="dashed" color={UI.amber}
              onChange={(v) => onPatch({ showContestedPass: v })}
            />
            <ToggleCard
              checked={state.showBlockedPass !== false}
              label="passe bloquée"
              sample="dashed-thin" color={UI.red}
              onChange={(v) => onPatch({ showBlockedPass: v })}
            />
            <ToggleCard
              checked={state.showLateRing !== false}
              label="déf. en retard"
              sample="ring" color={UI.red}
              onChange={(v) => onPatch({ showLateRing: v })}
            />
            <ToggleCard
              checked={state.showCloseoutRing !== false}
              label="closeout actif"
              sample="ring" color={UI.orange}
              onChange={(v) => onPatch({ showCloseoutRing: v })}
            />
            <ToggleCard
              checked={state.showDenyingRing !== false}
              label="strong-side denial"
              sample="circle" color={UI.cyan}
              onChange={(v) => onPatch({ showDenyingRing: v })}
            />
          </ToggleGroup>

          <ToggleGroup title="IA & tracking" accent={UI.green}>
            <ToggleCard
              checked={state.showLockBadges !== false}
              label="auto IA"
              sample="dot" color="#e0e7ff"
              onChange={(v) => onPatch({ showLockBadges: v })}
            />
            <ToggleCard
              checked={state.showZoneTracking !== false}
              label="zone trackée"
              sample="line-thick" color={UI.violet}
              onChange={(v) => onPatch({ showZoneTracking: v })}
            />
          </ToggleGroup>
        </div>
      </SettingsSection>

      <SettingsSection title="Physique & Biomécanique">
        <div style={{ display: 'grid', gap: 8 }}>
          <CheckboxLine
            checked={!!state.footworkRulesEnabled}
            label="Biomécanique & Attention (Footwork)"
            onChange={(v) => onPatch({ footworkRulesEnabled: v })}
            title="Modulation de vitesse réaliste (pas chassés/reculons), latence de réaction en angle mort (200ms) et temps de pivot plant-and-cut (150-300ms) sur les défenseurs."
          />
          <CheckboxLine
            checked={!!state.attackerVelocityProfileEnabled}
            label="profil de vitesse offensif (Phy.O — courbure)"
            onChange={(v) => onPatch({ attackerVelocityProfileEnabled: v })}
            title="Les attaquants ralentissent dans les virages serrés (V-cuts) et ré-accélèrent en sortie. Vitesse constante sur les drives droits. Modulé par tier athlétique si défini. Opt-in, A/B comparable."
          />
          <CheckboxLine
            checked={!!state.attackerActiveDemarquage}
            label="démarquage actif (Phy.O V3 — lecture défense)"
            onChange={(v) => onPatch({ attackerActiveDemarquage: v })}
            title="L'attaquant ralentit autour des points de son path où son défenseur matché est proche (≤ 50 px), simulant la lecture intentionnelle. Nécessite que le profil de vitesse offensif soit activé."
          />
          <CheckboxLine
            checked={!!state.attackerAccelerationEnabled}
            label="modèle d'accélération (attaque)"
            onChange={(v) => onPatch({ attackerAccelerationEnabled: v })}
            title="Active la latence physique d'accélération et de freinage pour l'attaque (profil S-curve robotics)."
          />
          {state.attackerAccelerationEnabled && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
              <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 120 }} title="Accélération max (m/s²). Plus grand = montées en vitesse plus sèches.">
                accélération (m/s²)
              </span>
              <input
                type="range"
                min={3.0}
                max={12.0}
                step={0.5}
                value={state.attackerAcceleration ?? 5.0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onPatch({ attackerAcceleration: v });
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {(state.attackerAcceleration ?? 5.0).toFixed(1)}
              </span>
            </div>
          )}
          <CheckboxLine
            checked={!!state.attackerMomentumEnabled}
            label="momentum offensif (dérive centrifuge)"
            onChange={(v) => onPatch({ attackerMomentumEnabled: v })}
            title="L'attaquant dérive vers l'extérieur du virage proportionnellement à sa vitesse réelle et à la courbure locale."
          />
          {state.attackerMomentumEnabled && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
              <span style={{ fontSize: 11, color: '#cbd5e1', minWidth: 120 }} title="Coefficient d'inertie offensive (dérive en virage).">
                coefficient de dérive
              </span>
              <input
                type="range"
                min={0.05}
                max={0.40}
                step={0.01}
                value={state.attackerMomentum ?? 0.15}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onPatch({ attackerMomentum: v });
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {(state.attackerMomentum ?? 0.15).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Physique du ballon & tirs">
        <div style={{ display: 'grid', gap: 8 }}>
          <CheckboxLine
            checked={!!state.activeInterceptionsEnabled}
            label="Interceptions actives (défense)"
            onChange={(v) => onPatch({ activeInterceptionsEnabled: v })}
            title="Active les interceptions physiques tick-par-tick des passes par les défenseurs à portée et bien orientés."
          />
          <CheckboxLine
            checked={!!state.physicsReboundsEnabled}
            label="Physique du tir & rebonds 3D"
            onChange={(v) => onPatch({ physicsReboundsEnabled: v })}
            title="Active la simulation 3D de la trajectoire de tir avec rebonds physiques sur l'arceau/la planche."
          />
          <CheckboxLine
            checked={!!state.dribblePhysicsEnabled}
            label="Oscillations du dribble"
            onChange={(v) => onPatch({ dribblePhysicsEnabled: v })}
            title="Simule les rebonds sinusoïdaux du dribble de l'attaquant selon sa vitesse."
          />
        </div>
      </SettingsSection>
    </Panel>
  );
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </section>
  );
}

function ControlGroup({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div style={groupStyle}>
      <div style={groupTitleStyle}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: accent, boxShadow: `0 0 16px ${accent}66` }} />
        {title}
      </div>
      {children}
    </div>
  );
}

function ToggleGroup({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <ControlGroup title={title} accent={accent}>
      <div style={toggleListStyle}>{children}</div>
    </ControlGroup>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 36,
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${active ? UI.accent : UI.border}`,
        background: active
          ? `linear-gradient(180deg, rgba(75,163,255,0.22) 0%, rgba(29,117,208,0.16) 100%)`
          : UI.control,
        color: active ? '#e8f3ff' : UI.muted,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 850,
        boxShadow: active ? 'inset 0 0 0 1px rgba(75,163,255,0.28), 0 6px 18px rgba(29,117,208,0.12)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

function PlayerToggleButton({
  id,
  active,
  onClick,
  title,
}: {
  id: PlayerId;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        minHeight: 30,
        padding: '6px 8px',
        borderRadius: 8,
        border: `1px solid ${active ? 'rgba(248, 113, 113, 0.62)' : UI.border}`,
        background: active ? 'rgba(248, 113, 113, 0.16)' : UI.control,
        color: active ? '#fecaca' : UI.muted,
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: active ? 850 : 750,
        boxShadow: active ? 'inset 0 0 0 1px rgba(248,113,113,0.16)' : 'none',
      }}
    >
      {active ? `${id} DQ` : id}
    </button>
  );
}

function NumberField({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minWidth: 0,
        padding: '8px 10px',
        border: `1px solid ${UI.border}`,
        borderRadius: 8,
        background: UI.control,
        fontSize: 12,
        color: UI.muted,
      }}
      title={title}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

function DarkActionButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: '100%',
        minHeight: 38,
        padding: '9px 12px',
        borderRadius: 8,
        border: `1px solid ${disabled ? '#2d333d' : UI.borderStrong}`,
        background: disabled
          ? '#1b2027'
          : `linear-gradient(180deg, ${UI.controlHover} 0%, ${UI.control} 100%)`,
        color: disabled ? '#697386' : UI.text,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </button>
  );
}

type LegendSample =
  | 'line' | 'line-thick' | 'dashed' | 'dashed-thin'
  | 'circle' | 'circle-dashed' | 'ring' | 'ring-solid' | 'dot' | 'num' | 'gradient' | 'court';

function ToggleCard({
  checked,
  label,
  color,
  sample,
  onChange,
}: {
  checked: boolean;
  label: string;
  color: string;
  sample: LegendSample;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 28px minmax(0, 1fr)',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        minHeight: 38,
        padding: '7px 9px',
        borderRadius: 8,
        border: `1px solid ${checked ? color : UI.border}`,
        background: checked
          ? `linear-gradient(135deg, ${color}24 0%, rgba(37,44,55,0.96) 58%, rgba(24,29,37,0.98) 100%)`
          : UI.controlOff,
        color: checked ? UI.text : UI.muted,
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: checked ? `inset 0 0 0 1px ${color}35, 0 8px 18px rgba(0,0,0,0.14)` : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        transition: 'border-color 140ms ease, background 140ms ease, box-shadow 140ms ease, transform 140ms ease',
      }}
    >
      <SwitchGlyph checked={checked} accent={color} />
      <Swatch color={color} sample={sample} />
      <span
        style={{
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 12,
          fontWeight: checked ? 850 : 700,
          letterSpacing: 0,
        }}
      >
        {label}
      </span>
    </button>
  );
}

function SwitchGlyph({ checked, accent }: { checked: boolean; accent: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'relative',
        width: 34,
        height: 20,
        borderRadius: 999,
        border: `1px solid ${checked ? accent : UI.borderStrong}`,
        background: checked
          ? `linear-gradient(180deg, ${accent} 0%, ${UI.accentDeep} 100%)`
          : '#11161d',
        boxShadow: checked ? `0 0 0 3px ${accent}18` : 'inset 0 1px 2px rgba(0,0,0,0.45)',
        transition: 'background 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 17 : 3,
          width: 12,
          height: 12,
          borderRadius: 99,
          background: checked ? '#ffffff' : '#6b7280',
          boxShadow: checked ? '0 1px 4px rgba(0,0,0,0.28)' : 'none',
          transition: 'left 140ms ease, background 140ms ease',
        }}
      />
    </span>
  );
}

function Swatch({ color, sample }: { color: string; sample: LegendSample }) {
  const rawId = useId();
  const gradientId = `hm-${rawId.replace(/:/g, '')}`;
  return (
    <svg width="26" height="16" viewBox="0 0 26 16" style={{ flex: '0 0 26px', overflow: 'visible' }}>
      {sample === 'line' && <line x1="2" y1="8" x2="24" y2="8" stroke={color} strokeWidth="1.6" />}
      {sample === 'line-thick' && <line x1="2" y1="8" x2="24" y2="8" stroke={color} strokeWidth="2.8" />}
      {sample === 'dashed' && (
        <line x1="2" y1="8" x2="24" y2="8" stroke={color} strokeWidth="1.8" strokeDasharray="4 3" />
      )}
      {sample === 'dashed-thin' && (
        <line x1="2" y1="8" x2="24" y2="8" stroke={color} strokeWidth="1.2" strokeDasharray="3 3" />
      )}
      {sample === 'circle' && (
        <circle cx="13" cy="8" r="4.5" fill="none" stroke={color} strokeWidth="1.8" strokeDasharray="3 2" />
      )}
      {sample === 'circle-dashed' && (
        <circle cx="13" cy="8" r="4.5" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="2 2" />
      )}
      {sample === 'ring' && <circle cx="13" cy="8" r="4.5" fill="none" stroke={color} strokeWidth="2.4" />}
      {sample === 'ring-solid' && (
        <>
          <circle cx="10" cy="8" r="4.5" fill="none" stroke={color} strokeWidth="2.2" />
          <rect x="15" y="5" width="8" height="6" rx="1.5" fill={color} />
        </>
      )}
      {sample === 'dot' && <circle cx="13" cy="8" r="3.4" fill={color} stroke="rgba(255,255,255,0.55)" strokeWidth="1" />}
      {sample === 'num' && (
        <>
          <circle cx="13" cy="8" r="5" fill={color} />
          <text x="13" y="10.8" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#0f172a">1</text>
        </>
      )}
      {sample === 'court' && (
        <>
          <rect x="3" y="3" width="20" height="10" rx="1.5" fill="none" stroke={color} strokeWidth="1.5" />
          <line x1="13" y1="3" x2="13" y2="13" stroke={color} strokeWidth="1" opacity="0.8" />
          <circle cx="13" cy="8" r="2.6" fill="none" stroke={color} strokeWidth="1" opacity="0.8" />
        </>
      )}
      {sample === 'gradient' && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="hsl(150, 78%, 50%)" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="hsl(48, 92%, 58%)" stopOpacity="0.9" />
              <stop offset="1" stopColor="hsl(5, 88%, 62%)" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <rect x="3" y="4" width="20" height="8" fill={`url(#${gradientId})`} rx="2" />
        </>
      )}
    </svg>
  );
}
