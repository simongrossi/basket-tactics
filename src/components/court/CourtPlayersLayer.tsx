// Rendu des sprites joueurs (attaquants + défenseurs + ballon) pour une frame
// donnée. Calcule au passage le `gazeOrientation` à appliquer aux poseurs
// d'écran : ils regardent le défenseur du porteur (carrierDef) plutôt que
// leur orientation standard.
//
// Les poseurs sont rendus DERNIERS (au-dessus des autres joueurs) pour que
// l'icône bras "barricade" passe par-dessus les défenseurs collés.

import type {
  AppState,
  AttackerId,
  ComputedDefense,
  DefenderId,
  Point,
} from '@/lib/types';
import type { PlaybackFrame } from '@/lib/logic/playback/frameResolver';
import { Player } from '../Player';

interface CourtPlayersLayerProps {
  state: AppState;
  frame: PlaybackFrame;
  /** #4 — IDs défenseurs sélectionnés (visuel highlight cyan). */
  selectedDefenders?: Set<DefenderId>;
}

/** Retourne un gazeOrientation de remplacement (en degrés, convention horaire
 *  depuis le NORD) pour un attaquant poseur d'écran : il regarde le défenseur
 *  du porteur (carrierDef). Retourne undefined si conditions non remplies.
 *
 *  Note clamp : Player.tsx applique gazeOrientation brut sans clamp interne.
 *  L'angle produit ici est géométriquement cohérent — le poseur est placé
 *  face au défenseur qu'il écrane, donc l'angle résultant reste dans ±90°
 *  du corps. Pas de clamp explicite nécessaire. */
function screenerGazeOverride(id: AttackerId, frame: PlaybackFrame): number | undefined {
  if (!frame.attackerIsScreening?.[id]) return undefined;
  if (!frame.screen) return undefined;
  const carrierDefId = frame.screen.carrierDef;
  const target = frame.defPos[carrierDefId];
  if (!target) return undefined;
  const screenerPos = frame.off[id];
  if (!screenerPos) return undefined;
  const dx = target.x - screenerPos.x;
  const dy = target.y - screenerPos.y;
  // atan2 trigonométrique (0=est, CCW) → convention horaire depuis le NORD.
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

export function CourtPlayersLayer({ state, frame, selectedDefenders }: CourtPlayersLayerProps) {
  const screenerIds = new Set<AttackerId>();
  if (frame.screen?.screener) screenerIds.add(frame.screen.screener);
  frame.offBallScreens.forEach((s) => screenerIds.add(s.screener));
  const forcedScreenerId = state.steps[state.activeStep]?.forcedScreener;

  return (
    <g>
      {(Object.entries(frame.off) as [AttackerId, Point][])
        .filter(([id]) => !screenerIds.has(id))
        .map(([id, pos]) => {
          const gazeOverride = screenerGazeOverride(id, frame);
          const finalGaze =
            gazeOverride !== undefined ? gazeOverride : frame.attVisuals[id]?.gazeOrientation;
          return (
            <Player
              key={id}
              id={id}
              pos={pos}
              isAttacker
              isForcedScreener={id === forcedScreenerId}
              showLockBadges={state.showLockBadges !== false}
              showForcedScreenerBadge={state.showForcedScreenerBadge !== false}
              orientation={frame.attVisuals[id]?.orientation}
              gazeOrientation={finalGaze}
              facing={frame.attVisuals[id]?.facing}
              armBallSide={frame.attVisuals[id]?.armBallSide}
              armManSide={frame.attVisuals[id]?.armManSide}
              isScreening={frame.attackerIsScreening?.[id] === true}
            />
          );
        })}
      {(Object.entries(frame.defPos) as [DefenderId, ComputedDefense[DefenderId]][]).map(
        ([id, p]) => (
          <Player
            key={id}
            id={id}
            pos={p}
            isAttacker={false}
            isCarrierDefender={p.isCarrierDefender}
            isLate={p.late}
            onScreen={p.onScreen}
            screenPhase={p.screenPhase}
            helpFactor={p.helpFactor}
            facing={p.facing}
            isOverridden={!!state.steps[state.activeStep]?.defenseOverrides?.[id]}
            closingOut={p.closingOut}
            overClosed={p.overClosed}
            denying={p.denying}
            pnrRole={p.pnrRole}
            mismatchSeverity={p.mismatchSeverity}
            scrammedThisStep={p.scrammedThisStep}
            mismatchThreshold={state.mismatchThreshold ?? 2}
            showMismatchBadges={state.showMismatchBadges !== false}
            orientation={p.orientation}
            gazeOrientation={p.gazeOrientation}
            armBallSide={p.armBallSide}
            armManSide={p.armManSide}
            showStateRings={state.showStateRings !== false}
            showLockBadges={state.showLockBadges !== false}
            showLateRing={state.showLateRing !== false}
            showCloseoutRing={state.showCloseoutRing !== false}
            showDenyingRing={state.showDenyingRing !== false}
            isSelected={selectedDefenders?.has(id)}
          />
        )
      )}
      {Array.from(screenerIds).map((id) => {
        if (!frame.off[id]) return null;
        const gazeOverride = screenerGazeOverride(id, frame);
        const finalGaze =
          gazeOverride !== undefined ? gazeOverride : frame.attVisuals[id]?.gazeOrientation;
        return (
          <Player
            key={`screener-${id}`}
            id={id}
            pos={frame.off[id]}
            isAttacker
            isForcedScreener={id === forcedScreenerId}
            showLockBadges={state.showLockBadges !== false}
            showForcedScreenerBadge={state.showForcedScreenerBadge !== false}
            orientation={frame.attVisuals[id]?.orientation}
            gazeOrientation={finalGaze}
            facing={frame.attVisuals[id]?.facing}
            armBallSide={frame.attVisuals[id]?.armBallSide}
            armManSide={frame.attVisuals[id]?.armManSide}
            isScreening={frame.attackerIsScreening?.[id] === true}
          />
        );
      })}
    </g>
  );
}
