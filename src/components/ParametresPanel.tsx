'use client';

import { InterfaceGate } from './interface/InterfaceLevel';
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { AppState, PlayerCount, PlayerId } from '@/lib/types';
import { PLAYER_COUNT_OPTIONS } from '@/lib/logic/players';
import { Panel, CheckboxLine } from './ui';
import { resolveRealismFlags } from '@/lib/logic/realismProfile';

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
  page: 'var(--bt-bg, #171a20)',
  panel: 'var(--bt-card-bg, #1e232c)',
  panelLift: 'var(--bt-card-bg-lift, #232a35)',
  control: 'var(--bt-control-bg, #252c37)',
  controlHover: 'var(--bt-control-hover, #2d3542)',
  controlOff: 'var(--bt-control-off, #171c24)',
  border: 'var(--bt-border, #303846)',
  borderStrong: 'var(--bt-border-strong, #465264)',
  text: 'var(--bt-text, #f3f4f6)',
  muted: 'var(--bt-text-muted, #cbd5e1)',
  dim: 'var(--bt-text-dim, #8f9aad)',
  accent: 'var(--bt-accent-strong, #4ba3ff)',
  accentDeep: 'var(--bt-accent-deep, #1d75d0)',
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
  boxShadow: 'var(--bt-panel-shadow, 0 10px 26px rgba(0,0,0,0.12))',
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
  boxShadow: 'var(--bt-input-shadow, inset 0 1px 2px rgba(0,0,0,0.25))',
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
  // Valeurs cinématiques effectives (preset réaliste résolu) pour que les
  // cases reflètent l'état réel, pas seulement l'override brut.
  const realism = resolveRealismFlags(state);
  // Tempo selon la distance : actif tant qu’aucune durée globale n’est imposée.
  const autoTempo = realism.distanceTempoEnabled && !state.realSpeedMode;
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

        <SettingsSection title="Durées">
          <ControlGroup title="Rythme" accent={UI.cyan}>
            <div style={compactGridStyle}>
              <NumberField
                label="s / étape"
                title={autoTempo
                  ? "Vide = tempo calculé selon la distance à courir (≈ 3,5 m/s d’action, 1,8 à 4 s par étape). Saisir une valeur pour imposer une durée fixe."
                  : "Durée d'une étape en secondes. Utilisée par la lecture, l’export, les déplacements défensifs et le chronomètre."}
              >
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={state.secondsPerStep ?? (autoTempo ? '' : 4)}
                  placeholder={autoTempo ? 'auto' : undefined}
                  onChange={(e) => onPatch({
                    secondsPerStep: e.target.value === '' ? undefined : parseFloat(e.target.value),
                  })}
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
                label="Transitions rapides (0,5 s par défaut)"
                onChange={(v) => onPatch({ realSpeedMode: v })}
                title="Utilise 0,5 s par transition si aucune durée individuelle ou globale n’est définie. Le ralenti reste un réglage de lecture séparé."
              />
            </div>
          </ControlGroup>
        </SettingsSection>

        <SettingsSection title="Effectif">
          <ControlGroup title="Noms & Numéros" accent={UI.orange}>
            <div style={{ marginBottom: 4 }}>
              <CheckboxLine
                checked={state.showPlayerNames !== false}
                label="Noms sur le terrain"
                onChange={(v) => onPatch({ showPlayerNames: v })}
                title="Active l'affichage du nom des joueurs sous leur cercle sur le terrain."
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: 110, overflowY: 'auto', paddingRight: 4 }}>
              {/* Attaquants */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: UI.orange, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>Attaque</div>
                {Array.from({ length: state.playerCount }, (_, i) => {
                  const id = `O${i + 1}` as PlayerId;
                  return (
                    <div key={id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder={id}
                        value={state.playerNumbers?.[id] ?? ''}
                        onChange={(e) => {
                          const numbers = { ...(state.playerNumbers ?? {}), [id]: e.target.value.slice(0, 3) };
                          onPatch({ playerNumbers: numbers });
                        }}
                        style={{
                          width: 32,
                          height: 22,
                          fontSize: 10,
                          textAlign: 'center',
                          fontWeight: 'bold',
                          border: `1px solid ${UI.border}`,
                          borderRadius: 4,
                          background: UI.controlOff,
                          color: UI.text,
                        }}
                        title={`Numéro de maillot pour ${id}`}
                      />
                      <input
                        type="text"
                        placeholder={`Joueur ${i + 1}`}
                        value={state.playerNames?.[id] ?? ''}
                        onChange={(e) => {
                          const names = { ...(state.playerNames ?? {}), [id]: e.target.value };
                          onPatch({ playerNames: names });
                        }}
                        style={{
                          flex: 1,
                          height: 22,
                          fontSize: 10,
                          padding: '0 6px',
                          border: `1px solid ${UI.border}`,
                          borderRadius: 4,
                          background: UI.controlOff,
                          color: UI.text,
                          minWidth: 0,
                        }}
                        title={`Nom pour ${id}`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Défenseurs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: UI.accent, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>Défense</div>
                {Array.from({ length: state.playerCount }, (_, i) => {
                  const id = `D${i + 1}` as PlayerId;
                  return (
                    <div key={id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder={id}
                        value={state.playerNumbers?.[id] ?? ''}
                        onChange={(e) => {
                          const numbers = { ...(state.playerNumbers ?? {}), [id]: e.target.value.slice(0, 3) };
                          onPatch({ playerNumbers: numbers });
                        }}
                        style={{
                          width: 32,
                          height: 22,
                          fontSize: 10,
                          textAlign: 'center',
                          fontWeight: 'bold',
                          border: `1px solid ${UI.border}`,
                          borderRadius: 4,
                          background: UI.controlOff,
                          color: UI.text,
                        }}
                        title={`Numéro de maillot pour ${id}`}
                      />
                      <input
                        type="text"
                        placeholder={`Défenseur ${i + 1}`}
                        value={state.playerNames?.[id] ?? ''}
                        onChange={(e) => {
                          const names = { ...(state.playerNames ?? {}), [id]: e.target.value };
                          onPatch({ playerNames: names });
                        }}
                        style={{
                          flex: 1,
                          height: 22,
                          fontSize: 10,
                          padding: '0 6px',
                          border: `1px solid ${UI.border}`,
                          borderRadius: 4,
                          background: UI.controlOff,
                          color: UI.text,
                          minWidth: 0,
                        }}
                        title={`Nom pour ${id}`}
                      />
                    </div>
                  );
                })}
              </div>
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
        {/* Presets rapides de clarté visuelle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Mode d’affichage rapide
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            <button
              type="button"
              className="bt-touch"
              onClick={() => onPatch({
                showHelpLines: false,
                showPassLanes: false,
                showMatchups: false,
                showGhosts: false,
                showActionOrder: false,
                showCoachDiagnostics: true,
                showThreats: false,
                showBestAction: false,
                showTacticalMetrics: false,
                showHeatmap: false,
                showFieldOfViewAll: false,
                showFieldOfViewAllDefenders: false,
                showFieldOfViewAllAttackers: false,
                showHelpDebug: false,
                showScreenDebug: false,
              })}
              title="Affichage épuré : joueurs, ballon et trajectoires essentielles sans encombrement"
              style={{
                padding: '7px 4px',
                fontSize: 12,
                fontWeight: 650,
                borderRadius: 6,
                border: `1px solid ${(!state.showHelpLines && !state.showPassLanes && !state.showMatchups && !state.showHeatmap && !state.showFieldOfViewAll) ? UI.accent : UI.border}`,
                background: (!state.showHelpLines && !state.showPassLanes && !state.showMatchups && !state.showHeatmap && !state.showFieldOfViewAll) ? 'color-mix(in srgb, var(--bt-accent, #3b82f6) 18%, var(--bt-card-bg, #1e232c))' : UI.controlOff,
                color: (!state.showHelpLines && !state.showPassLanes && !state.showMatchups && !state.showHeatmap && !state.showFieldOfViewAll) ? UI.text : UI.muted,
                cursor: 'pointer',
              }}
            >
              🌿 Épuré
            </button>

            <button
              type="button"
              className="bt-touch"
              onClick={() => onPatch({
                showHelpLines: true,
                showPassLanes: true,
                showMatchups: true,
                showGhosts: false,
                showActionOrder: true,
                showCoachDiagnostics: true,
                showThreats: false,
                showBestAction: false,
                showTacticalMetrics: false,
                showHeatmap: false,
                showFieldOfViewAll: false,
                showFieldOfViewAllDefenders: false,
                showFieldOfViewAllAttackers: false,
                showHelpDebug: false,
                showScreenDebug: false,
              })}
              title="Affichage tactique recommandé : aides, lignes de passe, matchups et lecture coach"
              style={{
                padding: '7px 4px',
                fontSize: 12,
                fontWeight: 650,
                borderRadius: 6,
                border: `1px solid ${(state.showHelpLines && state.showPassLanes && state.showMatchups && !state.showHeatmap && !state.showFieldOfViewAll) ? UI.accent : UI.border}`,
                background: (state.showHelpLines && state.showPassLanes && state.showMatchups && !state.showHeatmap && !state.showFieldOfViewAll) ? 'color-mix(in srgb, var(--bt-accent, #3b82f6) 18%, var(--bt-card-bg, #1e232c))' : UI.controlOff,
                color: (state.showHelpLines && state.showPassLanes && state.showMatchups && !state.showHeatmap && !state.showFieldOfViewAll) ? UI.text : UI.muted,
                cursor: 'pointer',
              }}
            >
              🎯 Tactique
            </button>

            <button
              type="button"
              className="bt-touch"
              onClick={() => onPatch({
                showHelpLines: true,
                showPassLanes: true,
                showMatchups: true,
                showGhosts: true,
                showActionOrder: true,
                showCoachDiagnostics: true,
                showThreats: true,
                showBestAction: true,
                showTacticalMetrics: true,
                showHeatmap: false,
                showFieldOfViewAll: false,
                showFieldOfViewAllDefenders: true,
                showFieldOfViewAllAttackers: false,
                showHelpDebug: false,
                showScreenDebug: false,
              })}
              title="Affichage expert / analyse : toutes les métriques, menaces, visions et fantômes N-1"
              style={{
                padding: '7px 4px',
                fontSize: 12,
                fontWeight: 650,
                borderRadius: 6,
                border: `1px solid ${(state.showThreats || state.showBestAction || state.showTacticalMetrics) ? UI.accent : UI.border}`,
                background: (state.showThreats || state.showBestAction || state.showTacticalMetrics) ? 'color-mix(in srgb, var(--bt-accent, #3b82f6) 18%, var(--bt-card-bg, #1e232c))' : UI.controlOff,
                color: (state.showThreats || state.showBestAction || state.showTacticalMetrics) ? UI.text : UI.muted,
                cursor: 'pointer',
              }}
            >
              🔬 Expert
            </button>
          </div>
        </div>

        <div style={categoryGridStyle}>
          <ToggleGroup title="Équipes affichées" accent={UI.orange}>
            <ToggleCard
              checked={state.showAttackers !== false}
              label="attaquants"
              sample="dot" color={UI.orange}
              onChange={(v) => onPatch({ showAttackers: v })}
            />
            <ToggleCard
              checked={state.showDefenders !== false}
              label="défenseurs"
              sample="dot" color={UI.cyan}
              onChange={(v) => onPatch({ showDefenders: v })}
            />
          </ToggleGroup>

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
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showThreats}
              label="menace attaquants"
              sample="ring-solid" color={UI.green}
              onChange={(v) => onPatch({ showThreats: v })}
            /></InterfaceGate>
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showBestAction}
              label="meilleure action"
              sample="ring-solid" color={UI.amber}
              onChange={(v) => onPatch({ showBestAction: v })}
            /></InterfaceGate>
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showTacticalMetrics}
              label="EJE / EJO"
              sample="dashed" color={UI.green}
              onChange={(v) => onPatch({ showTacticalMetrics: v })}
            /></InterfaceGate>
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showHeatmap}
              label="heatmap zones"
              sample="gradient" color={UI.green}
              onChange={(v) => onPatch({ showHeatmap: v })}
            /></InterfaceGate>
          </ToggleGroup>

          <ToggleGroup title="Terrain & champs" accent={UI.cyan}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Style du parquet</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {[
                  { id: 'classic', label: '🪵 Bois FIBA' },
                  { id: 'blackboard', label: '⬛ Ardoise' },
                  { id: 'modern', label: '🏢 Moderne' },
                ].map((th) => {
                  const active = (state.courtTheme ?? 'classic') === th.id;
                  return (
                    <button
                      key={th.id}
                      type="button"
                      className="bt-touch"
                      onClick={() => onPatch({ courtTheme: th.id as 'classic' | 'blackboard' | 'modern' })}
                      style={{
                        padding: '6px 4px',
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        borderRadius: 6,
                        border: `1px solid ${active ? UI.accent : UI.border}`,
                        background: active ? 'color-mix(in srgb, var(--bt-accent, #3b82f6) 18%, var(--bt-card-bg, #1e232c))' : UI.controlOff,
                        color: active ? UI.text : UI.muted,
                        cursor: 'pointer',
                      }}
                    >
                      {th.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <ToggleCard
              checked={state.fullCourt}
              label="terrain complet"
              sample="court" color={UI.accent}
              onChange={(v) => onPatch({ fullCourt: v })}
            />
            <ToggleCard
              checked={!!state.showSpacingSpots}
              label="repères spacing"
              sample="ring-dashed" color={UI.accent}
              onChange={(v) => onPatch({ showSpacingSpots: v })}
            />
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showFieldOfViewAll}
              label="champ vision (tous)"
              sample="circle" color="#94a3b8"
              onChange={(v) => onPatch({ showFieldOfViewAll: v })}
            /></InterfaceGate>
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showFieldOfViewAllDefenders}
              label="champ vision défenseurs"
              sample="circle" color={UI.cyan}
              onChange={(v) => onPatch({ showFieldOfViewAllDefenders: v })}
            /></InterfaceGate>
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showFieldOfViewAllAttackers}
              label="champ vision attaquants"
              sample="circle" color={UI.orange}
              onChange={(v) => onPatch({ showFieldOfViewAllAttackers: v })}
            /></InterfaceGate>
            <InterfaceGate min="development"><ToggleCard
              checked={!!state.showHelpDebug}
              label="debug aide"
              sample="dashed" color={UI.violet}
              onChange={(v) => onPatch({ showHelpDebug: v })}
            /></InterfaceGate>
            <InterfaceGate min="analysis"><ToggleCard
              checked={!!state.showDefenseTriangles}
              label="triangles vision défense"
              sample="dashed" color={UI.green}
              onChange={(v) => onPatch({ showDefenseTriangles: v })}
            /></InterfaceGate>
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

      <SettingsSection title="Indicateurs auto" min="analysis">
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
            <InterfaceGate min="development"><ToggleCard
              checked={!!state.showScreenDebug}
              label="debug écran"
              sample="circle-dashed" color={UI.red}
              onChange={(v) => onPatch({ showScreenDebug: v })}
            /></InterfaceGate>
            <InterfaceGate min="development"><ToggleCard
              checked={!!state.showPlayerDebug}
              label="debug joueur"
              sample="circle-dashed" color={UI.violet}
              onChange={(v) => onPatch({ showPlayerDebug: v })}
            /></InterfaceGate>
            <InterfaceGate min="development"><ToggleCard
              checked={!!state.showProfileOverlay}
              label="profile (J.5)"
              sample="circle-dashed" color={UI.amber}
              onChange={(v) => onPatch({ showProfileOverlay: v })}
            /></InterfaceGate>
            <InterfaceGate min="development"><ToggleCard
              checked={!!state.anomalyDetectionEnabled}
              label="anomalies (K)"
              sample="circle-dashed" color={UI.red}
              onChange={(v) => onPatch({ anomalyDetectionEnabled: v })}
            /></InterfaceGate>
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

      <SettingsSection title="Interaction">
        <div style={{ display: 'grid', gap: 8 }}>
          <CheckboxLine
            checked={state.dragSpeedCapEnabled !== false}
            label="Plafonner la vitesse pendant le glisser"
            onChange={(v) => onPatch({ dragSpeedCapEnabled: v })}
            title="Activé (défaut) : le joueur court vers le doigt à vitesse athlétique, comme sur un terrain. Désactivé : le joueur colle au doigt pour un placement direct et rapide."
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Physique & Biomécanique" min="development">
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: UI.text }}>Profil de réalisme</span>
            <SegmentButton
              active={state.realismProfile === 'realistic'}
              onClick={() => onPatch({ realismProfile: 'realistic' })}
            >
              Réaliste
            </SegmentButton>
            <SegmentButton
              active={state.realismProfile !== 'realistic'}
              onClick={() => onPatch({ realismProfile: 'legacy' })}
            >
              Tactique
            </SegmentButton>
          </div>
          <CheckboxLine
            checked={realism.footworkRulesEnabled}
            label="Biomécanique & Attention (Footwork)"
            onChange={(v) => onPatch({ footworkRulesEnabled: v })}
            title="Modulation de vitesse réaliste (pas chassés/reculons), latence de réaction en angle mort (200ms) et temps de pivot plant-and-cut (150-300ms) sur les défenseurs."
          />
          <CheckboxLine
            checked={!!state.driveContainmentEnabled}
            label="Défense vivante sur drive (containment)"
            onChange={(v) => onPatch({ driveContainmentEnabled: v })}
            title="Sur un drive, le défenseur du porteur glisse couper la ligne de pénétration s'il peut atteindre le point de contain à temps (course d'ETA selon l'athlétisme). Diagnostic coach 'drive contenu / ligne ouverte'. N'altère pas le tracé dessiné."
          />
          <CheckboxLine
            checked={!!state.cvtOffensiveEnabled}
            label="CVT offensif (contournement par forces)"
            onChange={(v) => onPatch({ cvtOffensiveEnabled: v })}
            title="Étend le moteur de forces vectorielles aux attaquants : repel émergent contre les autres joueurs au lieu de la Bezier géométrique. Glissement plus naturel autour des clusters."
          />
          <CheckboxLine
            checked={!!state.screenStiffnessEnabled}
            label="Stiffness & Impact (récupération post-écran)"
            onChange={(v) => onPatch({ screenStiffnessEnabled: v })}
            title="Amplifie la pénalité de vitesse subie par un défenseur en contact d'écran ou en recovery, proportionnellement à la violence (multiplicateur). La cible reste inchangée — le pipeline d'écran n'est pas touché."
          />
          {state.screenStiffnessEnabled && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
              <span style={{ fontSize: 11, color: UI.muted, minWidth: 120 }} title="Facteur d'amplification de la pénalité d'écran. 1.0 = legacy, 2.0 = impact violent.">
                violence d'impact
              </span>
              <input
                type="range"
                min={1.0}
                max={3.0}
                step={0.1}
                value={state.screenStiffness ?? 1.5}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onPatch({ screenStiffness: v });
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: UI.dim, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {(state.screenStiffness ?? 1.5).toFixed(1)}
              </span>
            </div>
          )}
          <CheckboxLine
            checked={!!state.physicalContactBattlesEnabled}
            label="Luttes de force (Box-out & Post-up)"
            onChange={(v) => onPatch({ physicalContactBattlesEnabled: v })}
            title="Modélise les duels physiques pendant la phase box-out : le défenseur en contact pousse l'attaquant à l'opposé du panier (et recule lui-même via la réaction). Filet de sécurité Rule 1 garanti."
          />
          <CheckboxLine
            checked={!!state.defensiveTransitionEnabled}
            label="Repli défensif (transition)"
            onChange={(v) => onPatch({ defensiveTransitionEnabled: v })}
            title="Pendant la phase de transition entre 2 possessions, les ex-attaquants amorcent leur retraite vers leur propre panier (shot-made, turnover, rebond défensif). Cap 3 px/tick, freeze à 80 px du panier, filet Rule 1."
          />
          <CheckboxLine
            checked={!!state.defenderDragInertiaEnabled}
            label="Appuis et fatigue pendant le déplacement"
            onChange={(v) => onPatch({ defenderDragInertiaEnabled: v })}
            title="Les défenseurs se déplacent toujours progressivement lorsque tu bouges un attaquant. Cette option ajoute les effets des appuis, du regard et de la fatigue au rattrapage."
          />
          <CheckboxLine
            checked={realism.attackerVelocityProfileEnabled}
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
            checked={realism.attackerAccelerationEnabled}
            label="modèle d'accélération (attaque)"
            onChange={(v) => onPatch({ attackerAccelerationEnabled: v })}
            title="Active la latence physique d'accélération et de freinage pour l'attaque (profil S-curve robotics)."
          />
          {realism.attackerAccelerationEnabled && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
              <span style={{ fontSize: 11, color: UI.muted, minWidth: 120 }} title="Accélération max (m/s²). Plus grand = montées en vitesse plus sèches.">
                accélération (m/s²)
              </span>
              <input
                type="range"
                min={3.0}
                max={12.0}
                step={0.5}
                value={realism.attackerAcceleration ?? 5.0}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onPatch({ attackerAcceleration: v });
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: UI.dim, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {(realism.attackerAcceleration ?? 5.0).toFixed(1)}
              </span>
            </div>
          )}
          <CheckboxLine
            checked={realism.attackerMomentumEnabled}
            label="momentum offensif (dérive centrifuge)"
            onChange={(v) => onPatch({ attackerMomentumEnabled: v })}
            title="L'attaquant dérive vers l'extérieur du virage proportionnellement à sa vitesse réelle et à la courbure locale."
          />
          {realism.attackerMomentumEnabled && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
              <span style={{ fontSize: 11, color: UI.muted, minWidth: 120 }} title="Coefficient d'inertie offensive (dérive en virage).">
                coefficient de dérive
              </span>
              <input
                type="range"
                min={0.05}
                max={0.40}
                step={0.01}
                value={realism.attackerMomentum ?? 0.15}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onPatch({ attackerMomentum: v });
                }}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: UI.dim, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {(realism.attackerMomentum ?? 0.15).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Physique du ballon & tirs" min="development">
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

function SettingsSection({ title, children, min = 'coach' }: { title: string; children: ReactNode; min?: 'coach' | 'analysis' | 'development' }) {
  return (
    <InterfaceGate min={min}><section style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      {children}
    </section></InterfaceGate>
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
        color: active ? UI.text : UI.muted,
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
        color: active ? '#ef4444' : UI.muted,
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
        border: `1px solid ${disabled ? UI.border : UI.borderStrong}`,
        background: disabled
          ? UI.controlOff
          : `linear-gradient(180deg, ${UI.controlHover} 0%, ${UI.control} 100%)`,
        color: disabled ? UI.dim : UI.text,
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
  | 'circle' | 'circle-dashed' | 'ring' | 'ring-dashed' | 'ring-solid' | 'dot' | 'num' | 'gradient' | 'court';

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
          ? `color-mix(in srgb, ${color} 16%, ${UI.panel})`
          : UI.controlOff,
        color: checked ? UI.text : UI.muted,
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: checked ? `inset 0 0 0 1px ${color}35, 0 8px 18px rgba(0,0,0,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.03)',
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
          : UI.controlHover,
        boxShadow: checked ? `0 0 0 3px ${accent}18` : 'inset 0 1px 2px rgba(0,0,0,0.2)',
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
      {sample === 'ring-dashed' && (
        <circle cx="13" cy="8" r="4.5" fill="none" stroke={color} strokeWidth="2" strokeDasharray="2.5 2" />
      )}
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
