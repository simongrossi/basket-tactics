'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AttackerId, DefenderId, DefenderRule, DominantHand, OffensiveProfile, Tool } from '@/lib/types';
import { DEFENDER_PROFILES, type DefenderProfile } from '@/lib/data/defenderProfiles';

/**
 * Repositionne un menu contextuel pour qu'il ne déborde pas du conteneur
 * parent (le wrap du SVG). Si le menu déborderait à droite, on l'ouvre vers
 * la gauche du clic ; idem en bas. Marge 8px du bord. Mesuré après mount
 * via useLayoutEffect (synchrone, sans flash visible).
 */
function useClampedPosition(initialX: number, initialY: number, ref: React.RefObject<HTMLDivElement | null>) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    const rect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    let nx = initialX;
    let ny = initialY;
    const overflowRight = initialX + rect.width - (parentRect.width - 8);
    if (overflowRight > 0) nx = Math.max(8, initialX - rect.width);
    const overflowBottom = initialY + rect.height - (parentRect.height - 8);
    if (overflowBottom > 0) ny = Math.max(8, initialY - rect.height);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialX, initialY]);
  return pos;
}

interface ToolBarProps {
  tool: Tool;
  onSetTool: (t: Tool) => void;
  /** Si true (défenseur), on grise les outils qui ne s'appliquent pas (passe/dribble/course/écran).
   *  L'outil reste cliquable car il définit le mode global pour les prochaines actions sur les attaquants. */
  defenderContext?: boolean;
}

const TOOL_DEFS: { value: Tool; label: string; symbol: string }[] = [
  { value: 'move', label: 'déplacer', symbol: '✥' },
  { value: 'pass', label: 'passe', symbol: '⇢' },
  { value: 'dribble', label: 'dribble', symbol: '∿' },
  { value: 'cut', label: 'course', symbol: '→' },
  { value: 'screen', label: 'écran', symbol: '⊥' },
];

function ToolBar({ tool, onSetTool, defenderContext }: ToolBarProps) {
  return (
    <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
      {TOOL_DEFS.map((t) => {
        const active = tool === t.value;
        const greyed = defenderContext && t.value !== 'move';
        return (
          <button
            key={t.value}
            onClick={() => onSetTool(t.value)}
            title={t.label + (greyed ? ' — applicable aux attaquants seulement' : '')}
            style={{
              flex: '1 1 auto',
              fontSize: 10,
              padding: '4px 2px',
              borderRadius: 4,
              border: `1px solid ${active ? '#9a3412' : '#e2e8f0'}`,
              background: active ? '#D85A30' : '#fff',
              color: active ? '#fff' : (greyed ? '#cbd5e1' : '#7c2d12'),
              cursor: 'pointer',
              fontWeight: 500,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              lineHeight: 1.1,
            }}
          >
            <span style={{ fontSize: 12 }}>{t.symbol}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface DefenderMenuProps {
  kind: 'defender';
  dId: DefenderId;
  x: number;
  y: number;
  rule: DefenderRule;
  hasOverride: boolean;
  tool: Tool;
  onSetTool: (t: Tool) => void;
  onUpdate: (patch: Partial<DefenderRule>) => void;
  onApplyProfile: (profile: DefenderProfile) => void;
  onClearOverride: () => void;
  onClose: () => void;
}

interface AttackerMenuProps {
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
  onSetTool: (t: Tool) => void;
  onMakeCarrier: () => void;
  onForceScreener: () => void;
  onClearForcedScreener: () => void;
  onClearAnnotations: () => void;
  onSetDominantHand: (h: DominantHand) => void;
  onSetOffensiveProfile: (p: OffensiveProfile) => void;
  onClose: () => void;
}

type ContextMenuProps = DefenderMenuProps | AttackerMenuProps;

export function ContextMenu(props: ContextMenuProps) {
  if (props.kind === 'attacker') return <AttackerMenu {...props} />;
  return <DefenderMenu {...props} />;
}

function DefenderMenu({ dId, x, y, rule, hasOverride, tool, onSetTool, onUpdate, onApplyProfile, onClearOverride, onClose }: DefenderMenuProps) {
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
        minWidth: 240,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        {dId}
        <span
          onClick={onClose}
          style={{ float: 'right', cursor: 'pointer', color: '#999', fontSize: 14 }}
        >
          ×
        </span>
      </div>
      <ToolBar tool={tool} onSetTool={onSetTool} defenderContext />
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
        label="orientation regard"
        title="Override absolu de l'orientation du regard en degrés (0–360°). Sera CLAMPÉ à ±60° du corps effectif (= cône de champ de vision). Si défini, écrase le calcul auto."
      >
        <input
          type="range"
          min={0}
          max={359}
          step={5}
          value={rule.gazeOrientation ?? 0}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            onUpdate({ gazeOrientation: v });
          }}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, minWidth: 36, textAlign: 'right', color: rule.gazeOrientation !== undefined ? '#9a3412' : '#94a3b8', fontWeight: rule.gazeOrientation !== undefined ? 600 : 400 }}>
          {rule.gazeOrientation !== undefined ? `${rule.gazeOrientation}°` : 'auto'}
        </span>
        {rule.gazeOrientation !== undefined && (
          <button
            onClick={() => onUpdate({ gazeOrientation: undefined })}
            title="Revenir au calcul auto"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
          >↻</button>
        )}
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

function Row({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }} title={title}>
      <span
        style={{
          fontSize: 12,
          color: '#666',
          width: 88,
          textDecoration: title ? 'underline dotted #cbd5e1' : undefined,
          textUnderlineOffset: 3,
          cursor: title ? 'help' : 'default',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Ligne slider qui peut être en mode "global" (value undefined → reprend le
 * réglage global) ou en mode "override" (value définie). Indicateur visuel
 * quand override actif + bouton ↻ pour revenir au global.
 */
function OverrideSliderRow({
  label, min, max, step, value, onChange, onReset, title,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number | undefined;
  onChange: (v: number) => void;
  onReset: () => void;
  title?: string;
}) {
  const overridden = value !== undefined;
  const display = overridden ? value!.toFixed(step < 1 ? 2 : 0) : 'global';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }} title={title}>
      <span style={{ fontSize: 12, color: overridden ? '#9a3412' : '#666', width: 88, fontWeight: overridden ? 600 : 400 }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? (min + max) / 2}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, opacity: overridden ? 1 : 0.55 }}
      />
      <span style={{ fontSize: 11, color: overridden ? '#9a3412' : '#94a3b8', minWidth: 36, textAlign: 'right', fontWeight: overridden ? 600 : 400 }}>
        {display}
      </span>
      {overridden && (
        <button
          onClick={onReset}
          title="Revenir au réglage global"
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
    </div>
  );
}

const PROFILE_LABELS: Record<OffensiveProfile, string> = {
  creator:      'créateur (meneur)',
  shooter:      'tireur (3pts fiable)',
  slasher:      'slasher (drive)',
  'rim-roller': 'rim-roller (5/4 rouleur)',
  'stretch-big':'stretch big (4 shooter)',
  'non-shooter':'non-shooter (laisser)',
};

function AttackerMenu({
  oId, x, y, isCarrier, isForcedScreener, hasAnnotations, dominantHand, offensiveProfile,
  tool, onSetTool,
  onMakeCarrier, onForceScreener, onClearForcedScreener, onClearAnnotations,
  onSetDominantHand, onSetOffensiveProfile, onClose,
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
