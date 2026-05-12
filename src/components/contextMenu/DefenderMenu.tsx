// Context menu défenseur : toutes les règles tactiques du défenseur cliqué.
//
// Sections :
//  - ToolBar (mode global)
//  - placement auto/manuel + clear override
//  - profil (preset rapide)
//  - aide % + comportement aide + priorité
//  - vs porteur + hors-ballon
//  - orientation (corps + regard) + bodyOrientationMode + FOV
//  - vs écran (screenNav)
//  - sliders override : distance / closeout× / denial agr. / vit. max

import { useEffect, useRef } from 'react';
import type { DefenderId, DefenderRule, Tool } from '@/lib/types';
import { DEFENDER_PROFILES, type DefenderProfile } from '@/lib/data/defenderProfiles';
import { useClampedPosition, useDraggablePopup } from './popupHooks';
import { ToolBar } from './ToolBar';
import { Row, OverrideSliderRow, GazeLockButton } from './sharedRows';

export interface DefenderMenuProps {
  kind: 'defender';
  dId: DefenderId;
  x: number;
  y: number;
  rule: DefenderRule;
  hasOverride: boolean;
  /** Vrai si ce défenseur marque le porteur de balle. Quand true, l'option
   *  gazeLock="opponent" est masquée car identique à "ball-carrier". */
  isCarrierDefender?: boolean;
  tool: Tool;
  onSetTool: (t: Tool) => void;
  onUpdate: (patch: Partial<DefenderRule>) => void;
  onApplyProfile: (profile: DefenderProfile) => void;
  onClearOverride: () => void;
  onClose: () => void;
}

export function DefenderMenu({
  dId,
  x,
  y,
  rule,
  hasOverride,
  isCarrierDefender,
  tool,
  onSetTool,
  onUpdate,
  onApplyProfile,
  onClearOverride,
  onClose,
}: DefenderMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const clamped = useClampedPosition(x, y, ref);
  const drag = useDraggablePopup(clamped);

  useEffect(() => {
    if (drag.isDragging) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, drag.isDragging]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: drag.pos.x,
        top: drag.pos.y,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: 10,
        minWidth: 240,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div
        onPointerDown={drag.onPointerDown}
        style={{
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 8,
          cursor: drag.isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {dId}
        <span
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          style={{ float: 'right', cursor: 'pointer', color: '#999', fontSize: 14 }}
        >
          ×
        </span>
      </div>
      <ToolBar tool={tool} onSetTool={onSetTool} defenderContext />

      {/* placement auto / manuel */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 10,
          padding: '4px 6px',
          borderRadius: 5,
          background: hasOverride ? '#fef3c7' : '#f1f5f9',
          border: `1px solid ${hasOverride ? '#fcd34d' : '#e2e8f0'}`,
        }}
        title={
          hasOverride
            ? 'Position manuelle figée sur cette étape : le moteur respecte la position où tu as drag ce défenseur. Bascule en Auto pour que le moteur recalcule.'
            : "Position calculée par le moteur d'après les règles d'aide, l'écran, le strong-side denial. Drag le défenseur pour passer en Manuel."
        }
      >
        <span style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>placement</span>
        <div style={{ display: 'flex', flex: 1, gap: 2, marginLeft: 4 }}>
          <button
            onClick={() => {
              if (hasOverride) {
                onClearOverride();
                onClose();
              }
            }}
            style={{
              flex: 1,
              fontSize: 11,
              padding: '3px 4px',
              borderRadius: 3,
              border: `1px solid ${!hasOverride ? '#0284c7' : '#cbd5e1'}`,
              background: !hasOverride ? '#0284c7' : '#fff',
              color: !hasOverride ? '#fff' : '#475569',
              cursor: hasOverride ? 'pointer' : 'default',
              fontWeight: !hasOverride ? 600 : 400,
            }}
          >
            ⚙ auto
          </button>
          <button
            disabled
            style={{
              flex: 1,
              fontSize: 11,
              padding: '3px 4px',
              borderRadius: 3,
              border: `1px solid ${hasOverride ? '#d97706' : '#cbd5e1'}`,
              background: hasOverride ? '#f59e0b' : '#fff',
              color: hasOverride ? '#fff' : '#94a3b8',
              cursor: 'default',
              fontWeight: hasOverride ? 600 : 400,
            }}
          >
            ✋ manuel
          </button>
        </div>
      </div>

      <Row
        label="profil"
        title="Applique un profil de rôle (stopper, helper, denier…) — merge superficiel : seuls les champs définis par le profil sont écrasés, les overrides individuels (distance, vit. max, orientation…) sont préservés."
      >
        <select
          value=""
          onChange={(e) => {
            const profile = DEFENDER_PROFILES.find((p) => p.id === e.target.value);
            if (profile) onApplyProfile(profile);
          }}
          style={{ flex: 1, fontSize: 11 }}
        >
          <option value="" disabled>— choisir un profil —</option>
          {DEFENDER_PROFILES.map((p) => (
            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
          ))}
        </select>
      </Row>
      <Row
        label="aide %"
        title="Intensité de l'aide ce défenseur quand un trigger est actif (drive/post/raquette). 0 = ne quitte jamais son homme. 100 = bouge complètement vers la cible d'aide."
      >
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={rule.helpPct}
          onChange={(e) => onUpdate({ helpPct: parseInt(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 12, minWidth: 32 }}>{rule.helpPct}%</span>
      </Row>
      <Row
        label="comport. aide"
        title="Comportement d'aide individuel. 'auto' = standard (aide weak-side, garde son homme strong-side). 'toujours aider' = ignore le côté du ballon, aide à fond partout. 'passif' = aide molle, garde son homme plus longtemps. 'désactivé' = ce défenseur n'aide jamais, même sur trigger."
      >
        <select
          value={rule.helpMode ?? 'auto'}
          onChange={(e) => onUpdate({ helpMode: e.target.value as DefenderRule['helpMode'] })}
          style={{ flex: 1 }}
        >
          <option value="auto">auto (selon côté ballon)</option>
          <option value="aggressive">toujours aider</option>
          <option value="passive">passif (garde son homme)</option>
          <option value="disabled">désactivé (n'aide jamais)</option>
        </select>
      </Row>
      <Row
        label="priorité"
        title="Cible quand ce défenseur aide. 'protéger raquette' = vise le bloc bas le plus chargé. 'rester sur homme' = aide légère, reste à 30% du chemin vers le panier. 'ligne de passe' = se rabat sur la passe entre son homme et le porteur."
      >
        <select
          value={rule.priority}
          onChange={(e) => onUpdate({ priority: e.target.value as DefenderRule['priority'] })}
          style={{ flex: 1 }}
        >
          <option value="paint">protéger raquette</option>
          <option value="man">rester sur homme</option>
          <option value="passlane">ligne de passe</option>
        </select>
      </Row>
      <Row
        label="vs porteur"
        title="Comportement quand ce défenseur défend le porteur. 'coller' = pression rapprochée. 'bumper' = entre porteur et panier. 'contester' = recule actif au tir. 'reculer' = drop profond. 'topside' = force vers le milieu. 'baseline' = force vers la ligne de fond."
      >
        <select
          value={rule.vsCarrier}
          onChange={(e) => onUpdate({ vsCarrier: e.target.value as DefenderRule['vsCarrier'] })}
          style={{ flex: 1 }}
        >
          <option value="coller">coller (pression)</option>
          <option value="bumper">bumper (entre lui &amp; panier)</option>
          <option value="contester">contester (recul actif)</option>
          <option value="reculer">reculer (drop)</option>
          <option value="topside">topside (force milieu)</option>
          <option value="baseline">baseline (force ligne de fond)</option>
        </select>
      </Row>
      <Row
        label="hors-ballon"
        title="Position quand ce défenseur ne défend pas le porteur. 'sag' = position d'aide classique. 'derrière' = entre son homme et le panier, sans aide. 'stunt' = fait mine d'aider vers le ballon (fake). '3/4 deny' = pied dans la ligne de passe. 'devant' = devant son homme face au ballon (full denial)."
      >
        <select
          value={rule.offBallStance ?? 'sag'}
          onChange={(e) => onUpdate({ offBallStance: e.target.value as DefenderRule['offBallStance'] })}
          style={{ flex: 1 }}
        >
          <option value="sag">sag (aide raquette)</option>
          <option value="behind">derrière (entre lui &amp; panier)</option>
          <option value="stunt">stunt (fake d'aide)</option>
          <option value="deny-3q">3/4 deny (pied dans la passe)</option>
          <option value="fronting">devant (full denial)</option>
        </select>
      </Row>
      <Row
        label="orientation"
        title="Rotation du corps en degrés (range -90 à +90, default 0). 0 = neutre, bras au-dessus. Positif (+) = horaire (épaule droite avancée, ferme le côté droit, pousse le porteur à gauche). Négatif (-) = anti-horaire. Applique aussi un petit décalage latéral à la position cible (max ±12px)."
      >
        <input
          type="range"
          min={-90}
          max={90}
          step={5}
          value={rule.orientation ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            onUpdate({ orientation: v === 0 ? undefined : v });
          }}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: rule.orientation ? '#9a3412' : '#94a3b8', fontWeight: rule.orientation ? 600 : 400 }}>
          {rule.orientation ? `${rule.orientation > 0 ? '+' : ''}${rule.orientation}°` : '0°'}
        </span>
        {rule.orientation !== undefined && rule.orientation !== 0 && (
          <button
            onClick={() => onUpdate({ orientation: undefined })}
            title="Remettre à 0"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: 13,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            ↻
          </button>
        )}
      </Row>
      <Row
        label="corps"
        title="Consigne tactique d'orientation du corps. Auto suit la stance. Ligne de passe à plat = corps dans l'axe porteur→homme ; perpendiculaire = corps à 90° de cet axe. Le slider absolu 'orientation corps' écrase ce choix."
      >
        <select
          value={rule.bodyOrientationMode ?? 'auto'}
          onChange={(e) => {
            const v = e.target.value as NonNullable<DefenderRule['bodyOrientationMode']>;
            onUpdate({
              bodyOrientationMode: v === 'auto' ? undefined : v,
              bodyOrientation: undefined,
            });
          }}
          style={{ flex: 1 }}
        >
          <option value="auto">auto (selon stance)</option>
          <option value="open">ouvert homme/ballon</option>
          <option value="face-man">face à mon homme</option>
          <option value="face-ball">face au porteur</option>
          <option value="pass-lane-flat">ligne passe à plat</option>
          <option value="pass-lane-perp">ligne passe perpend.</option>
        </select>
      </Row>
      <Row
        label="champ de vision"
        title="Affiche un cône de vision autour de ce défenseur (heatmap cyan semi-transparente, ouverture 120° centrée sur son regard). Permet de visualiser ce que voit le défenseur en plus du triangle pointeur."
      >
        <input
          type="checkbox"
          checked={!!rule.showFieldOfView}
          onChange={(e) => onUpdate({ showFieldOfView: e.target.checked || undefined })}
          style={{ marginLeft: 'auto' }}
        />
      </Row>
      <Row
        label="orientation corps"
        title="Override absolu de l'orientation du corps en degrés (0–360°). 0° = corps face au panier opposé, 90° = côté droit, 180° = face au panier protégé, 270° = côté gauche. Si défini, écrase le calcul auto open stance."
      >
        <input
          type="range"
          min={0}
          max={359}
          step={5}
          value={rule.bodyOrientation ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            onUpdate({ bodyOrientation: v });
          }}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: rule.bodyOrientation !== undefined ? '#9a3412' : '#94a3b8', fontWeight: rule.bodyOrientation !== undefined ? 600 : 400 }}>
          {rule.bodyOrientation !== undefined ? `${rule.bodyOrientation}°` : 'auto'}
        </span>
        {rule.bodyOrientation !== undefined && (
          <button
            onClick={() => onUpdate({ bodyOrientation: undefined })}
            title="Revenir au calcul auto"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
          >↻</button>
        )}
      </Row>
      <Row
        label="regard"
        title="Verrouillage du regard sur une cible dynamique (suit la cible étape par étape). Le clamp anatomique ±60° du corps reste prioritaire — si la cible est anatomiquement derrière, le regard est ramené au bord du cône."
      >
        <div style={{ display: 'flex', flex: 1, gap: 2, flexWrap: 'wrap' }}>
          <GazeLockButton label="auto" active={rule.gazeLock === undefined} onClick={() => onUpdate({ gazeLock: undefined })} />
          {!isCarrierDefender && (
            <GazeLockButton label="🔒 mon homme" active={rule.gazeLock === 'opponent'} onClick={() => onUpdate({ gazeLock: 'opponent' })} />
          )}
          <GazeLockButton label="🔒 le porteur" active={rule.gazeLock === 'ball-carrier'} onClick={() => onUpdate({ gazeLock: 'ball-carrier' })} />
          <GazeLockButton label="🔒 les deux" active={rule.gazeLock === 'both'} onClick={() => onUpdate({ gazeLock: 'both' })} />
        </div>
      </Row>
      <Row
        label="vs écran"
        title="Réaction de ce défenseur sur un écran porteur. 'auto' = utilise la règle globale. 'over' = passe par-dessus l'écran. 'under' = passe en dessous (laisse le tir 3pts). 'switch' = échange avec le coéquipier qui a posé l'écran. 'hedge' = show & recover. 'drop' = recule sous l'écran. 'blitz' = prise à deux."
      >
        <select
          value={rule.screenNav ?? 'auto'}
          onChange={(e) => onUpdate({ screenNav: e.target.value as DefenderRule['screenNav'] })}
          style={{ flex: 1 }}
        >
          <option value="auto">auto (règle globale)</option>
          <option value="over">over (par-dessus)</option>
          <option value="under">under (en dessous)</option>
          <option value="switch">switch (échange)</option>
          <option value="hedge">hedge (show &amp; recover)</option>
          <option value="drop">drop (recul)</option>
          <option value="blitz">blitz (piège)</option>
          <option value="ice">ice / no-middle</option>
          <option value="weak">weak (under léger)</option>
          <option value="peel-switch">peel switch</option>
        </select>
      </Row>
      <OverrideSliderRow
        label="distance"
        min={20}
        max={80}
        step={2}
        value={rule.distance}
        onChange={(v) => onUpdate({ distance: v })}
        onReset={() => onUpdate({ distance: undefined })}
        title="Distance individuelle défenseur ↔ son homme (en pixels). Override le réglage global. Petit nombre = défenseur collant ; grand nombre = laisse de l'espace."
      />
      <OverrideSliderRow
        label="closeout ×"
        min={1}
        max={2}
        step={0.1}
        value={rule.closeoutBoost}
        onChange={(v) => onUpdate({ closeoutBoost: v })}
        onReset={() => onUpdate({ closeoutBoost: undefined })}
        title="Multiplicateur de vitesse pour ce défenseur quand le ballon arrive sur son homme (closeout sur passe entrante). 1 = pas de boost, 2 = très agressif. Modélise l'urgence de fermer la distance avant tir."
      />
      <OverrideSliderRow
        label="denial agr."
        min={0}
        max={1}
        step={0.05}
        value={rule.denyAggressiveness}
        onChange={(v) => onUpdate({ denyAggressiveness: v })}
        onReset={() => onUpdate({ denyAggressiveness: undefined })}
        title="Force du marquage en avant sur la ligne de passe quand son homme est côté ballon. 0 = ignore, 0.45 = par défaut, 1 = full denial assumé."
      />
      <OverrideSliderRow
        label="vit. max"
        min={40}
        max={200}
        step={5}
        value={rule.maxSpeed}
        onChange={(v) => onUpdate({ maxSpeed: v })}
        onReset={() => onUpdate({ maxSpeed: undefined })}
        title="Vitesse max individuelle de ce défenseur (px/étape). Défauts par poste : D1 meneur 145 · D2 arrière 130 · D3 ailier 110 · D4 ailier fort 90 · D5 pivot 75. Petit nombre = lent, souvent en retard sur les rotations d'aide. Grand nombre = rapide, atteint sa cible plus souvent à temps."
      />
    </div>
  );
}
