'use client';

import type { ReactNode } from 'react';
import type { AppState, PlayerCount } from '@/lib/types';
import { PLAYER_COUNT_OPTIONS } from '@/lib/logic/players';
import { resolveRealismFlags } from '@/lib/logic/realismProfile';
import { InterfaceGate } from '../interface/InterfaceLevel';

interface QuickSettingsProps {
  state: AppState;
  onPatch: (p: Partial<AppState>) => void;
  onSetPlayerCount: (count: PlayerCount) => void;
  onOpenAll: () => void;
}

// Réglages d'usage courant, dans la colonne de droite du terrain : une ligne
// par réglage, libellé à gauche et commande à droite. Le détail complet reste
// dans la vue Paramètres.
export function QuickSettings({ state, onPatch, onSetPlayerCount, onOpenAll }: QuickSettingsProps) {
  const realism = resolveRealismFlags(state);
  // Tempo selon la distance : actif tant qu’aucune durée globale n’est imposée.
  const autoTempo = realism.distanceTempoEnabled && !state.realSpeedMode;
  const toggle = (label: string, checked: boolean, patch: (v: boolean) => Partial<AppState>, hint?: string) => (
    <Row label={label} hint={hint}>
      <Switch label={label} checked={checked} onChange={(v) => onPatch(patch(v))} />
    </Row>
  );

  return (
    <div className="bt-settings">
      <SettingsGroup title="Terrain">
        <CourtSizeToggle state={state} onPatch={onPatch} />
        <Row label="Sens d’attaque" hint={state.fullCourt ? undefined : 'Disponible sur terrain complet'}>
          <Segmented
            label="Sens d’attaque"
            disabled={!state.fullCourt}
            value={state.attackingDirection === 'down' ? 'down' : 'up'}
            options={[{ value: 'up', label: 'Haut' }, { value: 'down', label: 'Bas' }]}
            onChange={(v) => onPatch({ attackingDirection: v })}
          />
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Joueurs">
        <Segmented
          label="Joueurs actifs"
          value={state.playerCount}
          options={PLAYER_COUNT_OPTIONS.map((count) => ({ value: count, label: `${count}x${count}` }))}
          onChange={onSetPlayerCount}
        />
      </SettingsGroup>

      <SettingsGroup title="Rythme">
        <Row label="Secondes par étape" hint={autoTempo ? 'Vide : calculé selon la distance à courir' : undefined}>
          <input
            type="number" min={0.5} max={20} step={0.5}
            aria-label="Secondes par étape"
            value={state.secondsPerStep ?? (autoTempo ? '' : 4)}
            placeholder={autoTempo ? 'auto' : undefined}
            onChange={(e) => onPatch({ secondsPerStep: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
          />
        </Row>
        <Row label="Possession (s)">
          <input
            type="number" min={1} max={60} step={1}
            aria-label="Durée de la possession en secondes"
            value={state.possessionSeconds ?? 24}
            onChange={(e) => onPatch({ possessionSeconds: parseInt(e.target.value, 10) })}
          />
        </Row>
        {toggle('Transitions rapides', !!state.realSpeedMode, (v) => ({ realSpeedMode: v }), '0,5 s par transition par défaut')}
      </SettingsGroup>

      <SettingsGroup title="Afficher">
        {toggle('Attaquants', state.showAttackers !== false, (v) => ({ showAttackers: v }))}
        {toggle('Défenseurs', state.showDefenders !== false, (v) => ({ showDefenders: v }))}
        {toggle('Lignes d’aide', !!state.showHelpLines, (v) => ({ showHelpLines: v }))}
        {toggle('Lignes de passe', !!state.showPassLanes, (v) => ({ showPassLanes: v }))}
        {toggle('Qui défend sur qui', !!state.showMatchups, (v) => ({ showMatchups: v }))}
        {toggle('Positions de l’étape précédente', !!state.showGhosts, (v) => ({ showGhosts: v }))}
        {toggle('Numéros d’action', !!state.showActionOrder, (v) => ({ showActionOrder: v }))}
        {toggle('Badges de détection', state.showDetectionBadges !== false, (v) => ({ showDetectionBadges: v }))}
        {toggle('Lecture coach', state.showCoachDiagnostics !== false, (v) => ({ showCoachDiagnostics: v }))}
        <InterfaceGate min="analysis">
          {toggle('Menace des attaquants', !!state.showThreats, (v) => ({ showThreats: v }))}
          {toggle('Meilleure action', !!state.showBestAction, (v) => ({ showBestAction: v }))}
          {toggle('Zones de chaleur', !!state.showHeatmap, (v) => ({ showHeatmap: v }))}
        </InterfaceGate>
      </SettingsGroup>

      <button type="button" className="bt-btn" onClick={onOpenAll}>Tous les paramètres…</button>
    </div>
  );
}

/** Demi-terrain / terrain complet — aussi affiché dans la barre d'outils. */
export function CourtSizeToggle({ state, onPatch }: Pick<QuickSettingsProps, 'state' | 'onPatch'>) {
  return (
    <Segmented
      label="Taille du terrain"
      value={state.fullCourt ? 'full' : 'half'}
      options={[{ value: 'half', label: 'Demi-terrain' }, { value: 'full', label: 'Terrain complet' }]}
      onChange={(v) => onPatch({ fullCourt: v === 'full' })}
    />
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bt-settings-group">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bt-row">
      <span className="bt-row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="bt-switch" onClick={() => onChange(!checked)}>
      <span aria-hidden />
    </button>
  );
}

function Segmented<T extends string | number>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="bt-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} disabled={disabled} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
