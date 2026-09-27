import type {
  AppState,
  DefenderId,
  DefenderPositions,
  Matchups,
  Step,
} from '../types';
import { computeZoneDefenseTargets } from './defense/zoneTargets';
import { computeJunkDefenseTargets } from './defense/junkLayer';
import { computePressDefenseTargets } from './defense/pressLayer';
import { HOOP, HOOP_OPPOSITE } from '../data/court';
import type { Point } from '../types';
import {
  activeMatchups,
  getActiveDefenderIds,
} from './players';
import type { DefenderTarget } from './defense/types';
import type { OpenManRecord, PnrTagRecord, RotationSwap, XOutRecord } from './defense/rotationMemory';
import { buildDefenseFrameContext } from './defense/context';
import { applyBaseTargetsLayer } from './defense/baseTargets';
import { applyDriveContainmentLayer } from './defense/driveContainmentLayer';
import { applyInfluenceLayer } from './defense/influenceLayer';
import { applyWeakSideAnchorLayer } from './defense/weakSideAnchorLayer';
import { applyScreenRepelLayer } from './defense/screenRepelLayer';
import { applyRimProtectionLayer } from './defense/rimProtectionLayer';
import { applyHelpStickyLayer } from './defense/helpStickyLayer';
import { applyLateShotClockLayer } from './defense/lateShotClockLayer';
import { applyPnRRotationsLayer } from './defense/pnrLayer';
import { applyRotationMemoryLayer } from './defense/rotationMemoryLayer';
import { applyChainResponseLayer } from './defense/chainResponseLayer';
import { applyBlitzReleaseLayer } from './defense/blitzReleaseLayer';
import { applyOffBallScreenLayer } from './defense/offBallScreenLayer';
import { applyTrapLayer } from './defense/trapLayer';
import { applyDirectiveLayer } from './defense/directiveLayer';
import { applyCutterBumpLayer } from './defense/cutterBumpLayer';
import { applyPostCoverageLayer } from './defense/postCoverageLayer';
import { applyPostPassOrientationLayer } from './defense/postPassOrientation';

export type DetectedSwitchPair = [DefenderId, DefenderId];

/** Panier de référence côté défense pour cet AppState (selon attackingDirection).
 *
 *  Phase 2 — `attackingTeam` permet d'inverser le panier pour la phase
 *  adverse : quand l'away attaque, son panier cible est l'opposé de celui
 *  que home attaque. Tous les callers de gameLoop.ts qui ont accès au
 *  MatchState doivent passer `matchState.attackingTeam`. Les callers du
 *  mode éditeur/playback (sans MatchState) restent en 'home' (defaut). */
export function getDefenseHoop(state: AppState, attackingTeam: 'home' | 'away' = 'home'): Point {
  const homeHoop = state.attackingDirection === 'down' ? HOOP_OPPOSITE : HOOP;
  if (attackingTeam === 'home') return homeHoop;
  // Away attaque l'opposé
  return homeHoop === HOOP ? HOOP_OPPOSITE : HOOP;
}

/**
 * Calcule les matchups en vigueur AU DÉBUT d'une étape donnée
 * en cumulant tous les switches survenus dans les étapes précédentes.
 */
export function getMatchupsAt(steps: Step[], stepIdx: number, playerCount: AppState['playerCount'] = 5): Matchups {
  let m: Matchups = activeMatchups(playerCount);
  const activeDefenders = new Set(getActiveDefenderIds(playerCount));
  for (let i = 0; i <= stepIdx; i++) {
    const sw = steps[i].switches || [];
    sw.forEach(([d1, d2]) => {
      if (!activeDefenders.has(d1) || !activeDefenders.has(d2)) return;
      const o1 = m[d1];
      const o2 = m[d2];
      if (!o1 || !o2) return;
      m[d1] = o2;
      m[d2] = o1;
    });
  }
  return m;
}

export interface DefenseTargetsResult {
  positions: Record<DefenderId, DefenderTarget>;
  matchupsApplied: Matchups;
  detectedSwitch?: DetectedSwitchPair;
  /** P4.4 — Échanges de duels issus d'une rotation, actifs après cette
   *  étape (mémoire de rotation). Relus par l'étape suivante. */
  rotationSwaps?: RotationSwap[];
  /** P4.4 — Tag PnR observé à cette étape (mémoire de rotation). */
  pnrTag?: PnrTagRecord;
  /** P4.4 — X-out PnR observé à cette étape (rotation en cascade). */
  xOut?: XOutRecord;
  /** P4.4 — Homme laissé libre par la cascade en cours (cran suivant). */
  openMan?: OpenManRecord;
}

/**
 * Calcule les positions cibles "idéales" des défenseurs sur une étape donnée,
 * sans tenir compte de la contrainte de vitesse (pas de "retard").
 *
 * Fonction pure : un switch détecté est appliqué au matchup local de cette
 * frame et exposé via `detectedSwitch`, mais `state.steps[i].switches` n'est
 * jamais écrit ici. La persistance vit dans `persistDetectedSwitchForStep`.
 */
export function computeDefenseTargets(
  state: AppState,
  stepIdx: number,
  _legacyMutateStepForSwitch: boolean = false
): DefenseTargetsResult {
  if (state.defenseSystem === 'zone') {
    return computeZoneDefenseTargets(state, stepIdx);
  }
  if (state.defenseSystem === 'junk') {
    // F.1 — Junk defense (box-and-1) : 4 défenseurs en zone, 1 chaser strict.
    // Court-circuit du pipeline man comme la zone. Les overrides utilisateur
    // (defenseOverrides) restent appliqués en aval par effectiveDefensePositions.
    return computeJunkDefenseTargets(state, stepIdx);
  }
  if (state.defenseSystem === 'press') {
    // F.2 V1 — Half-court press (2-2-1) : 5 défenseurs en pression demi-terrain.
    // Statique en V1 (pas de trap dynamique). Court-circuit comme zone/junk.
    return computePressDefenseTargets(state, stepIdx);
  }

  const { ctx, matchups } = buildDefenseFrameContext(state, stepIdx);
  const positions = {} as Record<DefenderId, DefenderTarget>;

  // Couche 1 — base man-to-man + help + screen-on-target + orientation initiale.
  applyBaseTargetsLayer(positions, matchups, ctx);
  // Couche 1.2 (2a) — Drive containment : le défenseur du porteur glisse
  // couper la ligne de pénétration s'il peut atteindre le point de contain
  // à temps. Opt-in via state.driveContainmentEnabled. N'altère que le
  // défenseur du porteur.
  applyDriveContainmentLayer(positions, matchups, ctx);
  // Couche 1.3 (CVT 2b) — Influence layer : interpose bias vers les
  // lignes de passe. Subtil (≤ 5 px), inconditionnel. Skip
  // carrier/denying/onScreen/pnrRole/helpFactor≥0.5 — ne touche
  // que les défenseurs "libres".
  applyInfluenceLayer(positions, matchups, ctx);
  // Couche 1.4 — Ancre weak-side explicite (#8.2). Opt-in via
  // state.weakSideAnchorEnabled. Enfonce un défenseur désigné vers la raquette
  // côté faible (protection panier/skip), au lieu du sag passif distribué.
  applyWeakSideAnchorLayer(positions, matchups, ctx);
  // Couche 1.5 — Rim protection : "pas d'easy basket". Détecte les couloirs
  // libres vers le panier et désigne un défenseur (autre que carrierDef) pour
  // les fermer, peu importe le matchup.
  applyRimProtectionLayer(positions, matchups, ctx);
  // Couche 1.6 — C.2 Help-and-recover timing : maintient (avec decay) la
  // position d'aide précédente quand `state.helpStickiness` est activé.
  // Évite le snap-back instantané sur le matchup quand le trigger d'aide
  // disparaît. Opt-in via `state.helpStickiness` (1..3 steps).
  applyHelpStickyLayer(positions, matchups, ctx);
  // Couche 1.7 — F.5 Late shot clock defense : sous 5s du shot clock,
  // l'attaque doit shooter → no help, carrierDef contest accru.
  // Opt-in via `state.lateShotClockDefenseEnabled` + `step.shotClockRemaining`.
  applyLateShotClockLayer(positions, matchups, ctx);
  // Couche 2 — Rotations PnR (low-man tag + X-out + nail stunt).
  applyPnRRotationsLayer(positions, matchups, ctx);
  // Couche 2.05 — P4.4 Mémoire de rotation : pose les états de rotation
  // (garde le roller / aide l'aideur / retour au calme) et fait revenir
  // progressivement les défenseurs dont la rotation PnR vient de finir.
  // Opt-in via `state.rotationMemory`.
  applyRotationMemoryLayer(positions, matchups, ctx);
  // Couche 2.1 (CVT 1.3b) — Screen repel : raffine la trajectoire
  // des défenseurs périphériques (non carrier, non screener, non
  // pnrRole) proches d'un poseur d'écran. Cap dur 3 px, inconditionnel.
  // N'altère pas le push-out binaire des couches amont — purement
  // additif.
  applyScreenRepelLayer(positions, matchups, ctx);
  // Couche 2.5 — C.7 V2 réaction défensive aux chaînes d'écrans (re-screen
  // / stagger / flare-fade). Opt-in via `state.readScreenChainsEnabled`.
  // Modulations modestes (≤ 6 px / flags d'orientation) qui passent ensuite
  // par resolvePlayerCollisions en aval (anti-superposition garantie).
  applyChainResponseLayer(positions, matchups, ctx);
  // Couche 2.6 — Relâche du blitz (#8.1). Opt-in via state.blitzReleaseEnabled.
  // Quand le ballon ressort d'un trap blitz, le screenerDef récupère le roller
  // et les 2 trappeurs sont flaggés blitzRecovering (easing de relâche).
  applyBlitzReleaseLayer(positions, matchups, ctx);
  // Couche 3 — Écrans hors-ballon (mute matchups en cas de switch off-ball).
  applyOffBallScreenLayer(positions, matchups, ctx);
  // Couche 4 — Trap auto (porteur en zone de trappe).
  applyTrapLayer(positions, matchups, ctx);
  // Couche 4.5 — Couverture post-up auto (B6) — dig ou double sur pivot.
  // Opt-in via state.postCoverage. Requiert aussi trigger post actif.
  applyPostCoverageLayer(positions, matchups, ctx);
  // Couche 5 — Directives défensives scriptées (step.defensiveDirectives).
  applyDirectiveLayer(positions, ctx);
  // Couche 5.5 — Bump auto sur cutters (B10). Opt-in via state.autoBumpCutters.
  // S'applique AVANT le recalc d'orientation pour que les bras suivent la
  // nouvelle position.
  applyCutterBumpLayer(positions, matchups, ctx);
  // Couche 6 — Recalcul orientation final depuis les positions ajustées.
  applyPostPassOrientationLayer(positions, ctx);

  return {
    positions,
    matchupsApplied: matchups,
    detectedSwitch: ctx.detectedSwitch,
    rotationSwaps: ctx.rotationOut.swaps.length ? ctx.rotationOut.swaps : undefined,
    pnrTag: ctx.rotationOut.pnrTag,
    xOut: ctx.rotationOut.xOut,
    openMan: ctx.rotationOut.openMan,
  };
}

export function persistDetectedSwitchForStep(state: AppState, stepIdx: number): AppState {
  const step = state.steps[stepIdx];
  // Junk defense : pas de switches détectés (le chaser ne switch jamais
  // par définition, les 4 zone defenders ne sont pas en homme).
  if (!step || state.defenseSystem !== 'man' || step.switches) return state;
  const detected = computeDefenseTargets(state, stepIdx).detectedSwitch;
  if (!detected) return state;
  const steps = [...state.steps];
  steps[stepIdx] = { ...step, switches: [detected] };
  return { ...state, steps };
}

export function persistDetectedSwitchesThroughStep(
  state: AppState,
  stepIdx: number = state.steps.length - 1
): AppState {
  const max = Math.min(Math.max(0, stepIdx), state.steps.length - 1);
  let next = state;
  for (let i = 0; i <= max; i += 1) {
    next = persistDetectedSwitchForStep(next, i);
  }
  return next;
}

// `computeZoneDefenseTargets` extrait dans `./defense/zoneTargets.ts`.

// `computeAttackerVisuals` a été extrait dans `./attackerVisuals.ts`.
// Ré-export pour ne pas casser les imports historiques (CourtView, StepThumbnail,
// frameResolver pointent encore vers `./engine`).
export { computeAttackerVisuals } from './attackerVisuals';

/** Réduit un record de cibles défensives riches en plain `DefenderPositions`
 *  (juste x/y). Helper partagé entre engine.ts et attackerVisuals.ts. */
export function extractDefenderPositions(
  positions: Record<DefenderId, { x: number; y: number }>
): DefenderPositions {
  const out = {} as DefenderPositions;
  (Object.entries(positions) as [DefenderId, { x: number; y: number }][]).forEach(([id, p]) => {
    if (p) out[id] = { x: p.x, y: p.y };
  });
  return out;
}

// `detectStepScreenAction` extrait dans `./events/triggerDetector.ts`.
// Ré-export pour préserver l'API consommée par tacticalReads, coachDiagnostics
// et app/page.tsx.
export { detectStepScreenAction } from './events/triggerDetector';

// `effectiveDefensePositions` extrait dans `./defense/speedConstraint.ts`.
// Ré-export pour préserver l'API publique consommée par CourtView, frameResolver,
// app/page.tsx, coachDiagnostics, etc.
export { effectiveDefensePositions } from './defense/speedConstraint';

// `followDefendersAtFrame` et `recomputeDefenseFrameOrientations` extraits dans
// `./defense/frameAdjust.ts`. Ré-export pour préserver l'API publique consommée
// par CourtView, frameResolver, etc.
export { followDefendersAtFrame, recomputeDefenseFrameOrientations } from './defense/frameAdjust';
