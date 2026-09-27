// Contexte partagé entre les couches du calcul de cibles défensives. Construit
// une fois en début de `computeDefenseTargets`, lu en lecture seule par chaque
// couche. La mutation se fait sur `positions` et `matchups` (passés à part).
//
// Cette séparation lecture/écriture rend chaque couche testable en isolation :
// on construit un ctx de test, on appelle la couche, on inspecte la mutation.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  DefenderPositions,
  DetectedScreen,
  DetectedTriggers,
  Matchups,
  Point,
  ScreenRule,
  Step,
} from '../../types';
import { ballSide } from '../geometry';
import {
  applySwitch,
  consecutiveHedgeSteps,
  detectRejectedScreen,
  detectScreen,
  detectSnakeDribble,
  peelSwitchShouldFire,
  type RejectedScreen,
  type SnakeDribble,
} from '../screens';
import {
  applyScramSwitch,
  switchAllowed,
  type ScramSwitch,
  type SwitchPolicy,
} from './mismatchTracking';
import { detectTriggers } from '../triggers';
import { buildStep0DetectionPositions } from '../step0Detection';
import {
  activeBallCarrier,
  activeDefenseInitial,
  activeOffense,
  getActiveDefenderIds,
} from '../players';
import {
  computeDefenseTargets,
  effectiveDefensePositions,
  extractDefenderPositions,
  getDefenseHoop,
  getMatchupsAt,
} from '../engine';
import type { DefenderId, DefenderRotationState } from '../../types';
import type { DefenderTarget } from './types';
import {
  carryRotationSwaps,
  applyRotationSwap,
  decideCascadeSwap,
  decideNextCascade,
  decideRotationSwap,
  openManStillRunning,
  type RotationSwap,
  type RotationMemoryOutput,
} from './rotationMemory';

export interface DefenseFrameContext {
  /** AppState courant — lecture seule. */
  state: AppState;
  stepIdx: number;
  /** Le step de l'étape courante (raccourci `state.steps[stepIdx]`). */
  step: Step;
  /** Positions attaquantes actives à cette étape. */
  off: AttackerPositions;
  ballCarrier: AttackerId;
  /** Position du porteur (raccourci `off[ballCarrier]`). */
  carrierPos: Point;
  defenderIds: DefenderId[];
  /** Positions attaquantes à l'étape précédente, ou null si stepIdx === 0. */
  prevOff: AttackerPositions | null;
  /** Positions défensives au début de cette étape (idéales N-1, ou setup si N=0). */
  prevDefenderPositions: DefenderPositions;
  /** Panier côté défense pour cet AppState. */
  hoop: Point;
  /** Triggers détectés (drive/post/paint/any). */
  triggers: DetectedTriggers;
  /** Côté du ballon (-1 G, 0 axe, +1 D). */
  side: -1 | 0 | 1;
  /** Écran porteur détecté ou null. */
  screen: DetectedScreen | null;
  /** Règle d'écran effective (override individuel > global). */
  effectiveScreenRule: ScreenRule;
  /** Vrai si un switch a été appliqué sur l'écran porteur à cette étape. */
  switchedThisStep: boolean;
  /** Switch détecté pour cette étape, à persister explicitement hors moteur. */
  detectedSwitch?: [DefenderId, DefenderId];
  /** Scram switch éventuellement appliqué après le switch porteur (3ᵉ échange
   *  correctif quand le switch a créé un mismatch ≥ seuil). Null si pas
   *  applicable ou désactivé (`state.scramSwitchEnabled` faux).
   *  Cf. `defense/mismatchTracking.ts`. */
  scrammedSwitch: ScramSwitch | null;
  /** B2 V2 — Reject screen détecté à ce step. Exposé pour visu/debug. Le
   *  flag `state.unwindRejectedScreens` détermine si la défense réagit
   *  (auquel cas `screen` a été forcé à null). */
  rejectedScreen: RejectedScreen | null;
  /** B4 V2 — Snake dribble détecté à ce step (V sur N-2/N-1/N). Quand
   *  `state.snakeKeepCoverage` est actif, la couche `baseTargets` boost
   *  la quality effective de l'écran à 90 minimum → la défense maintient
   *  son engagement au lieu de re-armer à zéro sur la 2ᵉ utilisation. */
  snakeDribble: SnakeDribble | null;
  /** Cibles complètes de l'étape précédente (null à l'étape 0). Déjà
   *  calculées pour la détection d'écran ; réutilisées par la mémoire de
   *  rotation (P4.4) sans nouvel appel. */
  prevTargets: Record<DefenderId, DefenderTarget> | null;
  /** P4.4 — État de rotation décidé dans le contexte (rotate-and-stay,
   *  retour au calme), posé sur les cibles par `rotationMemoryLayer`. */
  rotationEvents: Partial<Record<DefenderId, DefenderRotationState>>;
  /** P4.4 — Sortie mutable de la mémoire de rotation pour cette étape
   *  (échanges actifs + tag observé), exposée dans `DefenseTargetsResult`.
   *  Seules les couches de rotation (PnR, mémoire) y écrivent. */
  rotationOut: RotationMemoryOutput;
}

/**
 * Construit le contexte de frame défensive + initialise les matchups.
 * Le switch on-ball détecté est appliqué au matchup LOCAL de cette frame,
 * puis exposé via `detectedSwitch`. Sa persistance dans `step.switches`
 * est volontairement explicite et hors moteur.
 */
export function buildDefenseFrameContext(
  state: AppState,
  stepIdx: number
): { ctx: DefenseFrameContext; matchups: Matchups } {
  const step = state.steps[stepIdx];
  const off = activeOffense(step.off, state.playerCount);
  const ballCarrier = activeBallCarrier(step, state.playerCount);
  const defenderIds = getActiveDefenderIds(state.playerCount);

  // Matchups en début d'étape (avant détection d'écran sur cette étape).
  let matchups = getMatchupsAt(state.steps, stepIdx - 1, state.playerCount);
  const hoop = getDefenseHoop(state);
  const prevOff = stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : null;
  const triggers = detectTriggers(off, prevOff, ballCarrier, state.triggers, hoop);

  // Estimation des positions défensives au début de cette étape, pour que la
  // détection d'écran soit basée sur où sont vraiment les défenseurs.
  //
  // CAS PARTICULIER step 0 : en édition libre (un seul step), les défenseurs
  // n'ont pas encore bougé donc `defenseInitial` les place loin du jeu. Or
  // `detectScreen` cherche un poseur à <screenRadius du défenseur du porteur
  // — si D1 est encore à (235,270) au moment où O1 est à (640,380), aucun
  // poseur ne sera jamais à proximité de D1 et l'écran n'est pas détecté.
  // Fix : à step 0, on substitue la position homme-à-homme idéale (collée
  // au porteur) pour le carrier defender, ce qui rapproche la "prevPosition"
  // de l'endroit où D1 va finir et permet la détection d'écran.
  const prevResult = stepIdx === 0 ? null : computeDefenseTargets(state, stepIdx - 1);
  const prevDefenderPositions: DefenderPositions =
    prevResult === null
      ? buildStep0DetectionPositions(
          state, off, ballCarrier, matchups,
          activeDefenseInitial(state.defenseInitial, state.playerCount)
        )
      : extractDefenderPositions(prevResult.positions);

  // P4.4 — Mémoire de rotation : les échanges de duels issus d'une rotation
  // (rotate-and-stay) sont reportés AVANT la détection d'écran, pour que le
  // tagueur soit bien lu comme le défenseur du roller. Ils se défont au
  // retour au calme.
  const rotationMode = state.rotationMemory;
  const rotationEvents: Partial<Record<DefenderId, DefenderRotationState>> = {};
  const rotationOut: RotationMemoryOutput = { swaps: [] };
  if (rotationMode && prevResult?.rotationSwaps?.length) {
    const { kept, scrambled } = carryRotationSwaps(prevResult.rotationSwaps, matchups, {
      off,
      carrierPos: off[ballCarrier],
      hoop,
      triggerActive: triggers.any,
      prevPositions: prevDefenderPositions,
    });
    rotationOut.swaps.push(...kept);
    scrambled.forEach((swap) => {
      rotationEvents[swap.a] = 'scramble-back';
      rotationEvents[swap.b] = 'scramble-back';
    });
  }

  const prevOffAtStep: AttackerPositions | undefined =
    stepIdx > 0 ? activeOffense(state.steps[stepIdx - 1].off, state.playerCount) : undefined;
  let screen = detectScreen(
    off, ballCarrier, matchups, prevDefenderPositions, state.screenRadius, step.forcedScreener, prevOffAtStep
  );

  // B4 V2 — Détection snake dribble (V sur 3 steps). Lu plus tard par
  // baseTargets pour booster la quality si state.snakeKeepCoverage est actif.
  let snakeDribble: SnakeDribble | null = null;
  if (stepIdx >= 2) {
    const prevPrevOff = activeOffense(state.steps[stepIdx - 2].off, state.playerCount);
    if (prevOffAtStep) {
      snakeDribble = detectSnakeDribble(
        off,
        prevOffAtStep,
        prevPrevOff,
        ballCarrier,
        matchups,
        state.screenRadius
      );
    }
  }

  // B2 V2 — Unwind reject screen.
  // Si un reject SHARP (porteur vire opposé net, dot ≤ -0.7) est détecté à
  // ce step, on ANNULE la détection d'écran : la défense a sur-anticipé,
  // mais le coach a activé l'unwind → retour à la couverture homme-à-homme
  // pure (D1 chase O1 normalement, D5 retombe sur O5). Le diag coach `reject-
  // screen` continue de signaler le pattern (refait sa détection).
  let rejectedScreen: RejectedScreen | null = null;
  if (state.unwindRejectedScreens && prevOffAtStep) {
    rejectedScreen = detectRejectedScreen(
      off,
      prevOffAtStep,
      ballCarrier,
      matchups,
      prevDefenderPositions,
      state.screenRadius
    );
    if (rejectedScreen && rejectedScreen.awayness <= -0.7) {
      // Reject SHARP confirmé → on traite comme s'il n'y avait pas d'écran.
      screen = null;
    }
  }

  // Règle effective : on regarde l'override individuel du défenseur du porteur,
  // sinon on retombe sur la règle globale.
  // Phase L proba — quand le mode probabiliste est actif, la couverture TIRÉE
  // remplace la règle globale comme base (l'override par défenseur garde sa
  // précédence). Source unique : pilote À LA FOIS le rendu défensif et la
  // lecture offensive (resolveScreenCoverage lit ce même effectiveScreenRule).
  const baseRule: ScreenRule =
    state.probabilisticReadsEnabled && state.rolledCoverage
      ? state.rolledCoverage
      : state.screenRule;
  let effectiveScreenRule: ScreenRule = (() => {
    if (!screen) return baseRule;
    const nav = state.rules[screen.carrierDef]?.screenNav;
    return nav && nav !== 'auto' ? nav : baseRule;
  })();

  // C.3 — Hedge length : si la rule effective est 'hedge' ET un délai de
  // recovery est configuré (`state.hedgeRecoveryDelay`), on compte les
  // steps consécutifs où le même poseur a déjà été dans un écran. Au-delà
  // du seuil, on FORCE recovery en basculant à 'over' (D1 chase normalement,
  // D5 retombe sur son homme). Pas de modification si delay non défini.
  if (screen && effectiveScreenRule === 'hedge' && state.hedgeRecoveryDelay) {
    const count = consecutiveHedgeSteps(state, stepIdx, screen.screener);
    if (count > state.hedgeRecoveryDelay) {
      effectiveScreenRule = 'over';
    }
  }

  // B8 — politique de switch team-level (filtre par-dessus screenRule).
  const switchPolicy: SwitchPolicy = state.switchPolicy ?? 'all';
  const canSwitch = (s: typeof screen): s is NonNullable<typeof screen> =>
    !!s && switchAllowed(switchPolicy, s.carrierDef, s.screenerDef);

  let switchedThisStep = false;
  let detectedSwitch: [DefenderId, DefenderId] | undefined;
  if (screen && effectiveScreenRule === 'switch' && canSwitch(screen)) {
    matchups = applySwitch(matchups, screen);
    switchedThisStep = true;
    detectedSwitch = [screen.carrierDef, screen.screenerDef];
  }
  // PEEL-SWITCH : couverture commence en drop, mais si le porteur a dépassé
  // le défenseur du screener à cette étape, le switch se déclenche.
  // La switchPolicy filtre AUSSI ce switch (pas de switch hors couples
  // autorisés même si peel-switch était la rule).
  if (screen && effectiveScreenRule === 'peel-switch' && !switchedThisStep && canSwitch(screen)) {
    const sDefPos = prevDefenderPositions[screen.screenerDef];
    if (sDefPos && peelSwitchShouldFire(off, screen, sDefPos, getDefenseHoop(state))) {
      matchups = applySwitch(matchups, screen);
      switchedThisStep = true;
      detectedSwitch = [screen.carrierDef, screen.screenerDef];
    }
  }

  // SCRAM SWITCH (B1) : opt-in via `state.scramSwitchEnabled`. Si le switch
  // ci-dessus a créé un mismatch ≥ seuil, on cherche un défenseur tiers
  // géographiquement proche qui prend l'attaquant exposé. Restore les
  // matchups au moins partiellement (ex : D5 sur O1 → D3 vient prendre O1,
  // D5 part sur O3). Cf. `mismatchTracking.applyScramSwitch`.
  let scrammedSwitch: ScramSwitch | null = null;
  if (switchedThisStep && screen && state.scramSwitchEnabled) {
    const scram = applyScramSwitch(matchups, screen, off, prevDefenderPositions, {
      threshold: state.mismatchThreshold ?? 2,
    });
    if (scram.scram) {
      matchups = scram.matchups;
      scrammedSwitch = scram.scram;
    }
  }

  // P4.4 — Fin d'un tag : le tagueur garde-t-il le roller ? Décidé après la
  // lecture de l'écran courant (un écran qui continue sur le même roller
  // relance le tag normalement) et après les switchs de l'étape.
  if (rotationMode && (prevResult?.pnrTag || prevResult?.xOut || prevResult?.openMan)) {
    const busy = new Set<DefenderId>();
    if (screen) {
      busy.add(screen.carrierDef);
      busy.add(screen.screenerDef);
    }
    if (scrammedSwitch) {
      busy.add(scrammedSwitch.from);
      busy.add(scrammedSwitch.to);
    }
    // Pris par un écran / switch de l'étape (hors échanges de rotation).
    const actionBusy = new Set(busy);
    const markBusy = (s: RotationSwap) => {
      busy.add(s.a);
      busy.add(s.b);
    };
    rotationOut.swaps.forEach(markBusy);
    const swap = decideRotationSwap(rotationMode, prevResult.pnrTag, matchups, {
      stepIdx,
      off,
      hoop,
      prevPositions: prevDefenderPositions,
      busyDefenders: busy,
      currentScreener: screen?.screener,
    });
    if (swap) {
      applyRotationSwap(matchups, swap);
      rotationOut.swaps.push(swap);
      rotationEvents[swap.a] = 'stay';
      rotationEvents[swap.b] = 'help-the-helper';
    }
    // Rotation en cascade : passe sur l'homme laissé libre → le X-out fait
    // le closeout, celui qui devait le prendre récupère l'homme du X-out.
    // Évaluée APRÈS l'échange du tag (le « garde » de l'homme libre peut être
    // le défenseur du poseur qui vient d'aider l'aideur). Les défenseurs de
    // l'échange du tag restent disponibles pour la cascade.
    const cascadeBusy = new Set(busy);
    if (swap) {
      cascadeBusy.delete(swap.a);
      cascadeBusy.delete(swap.b);
    }
    const prevBallCarrier = activeBallCarrier(state.steps[stepIdx - 1], state.playerCount);
    const cascade = decideCascadeSwap(rotationMode, prevResult.xOut, matchups, {
      stepIdx,
      off,
      ballCarrier,
      prevBallCarrier,
      prevPositions: prevDefenderPositions,
      busyDefenders: cascadeBusy,
    });
    if (cascade) {
      applyRotationSwap(matchups, cascade);
      rotationOut.swaps.push(cascade);
      rotationEvents[cascade.a] = 'closeout';
      rotationEvents[cascade.b] = 'rotate';
      // L'homme du X-out est libre : son nouveau défenseur court le reprendre.
      rotationOut.openMan = { man: cascade.bTakes, runner: cascade.b, level: 1 };
    } else if (prevResult.openMan) {
      // Cascade à plusieurs crans : le ballon repart vers l'homme laissé
      // libre par le closeout précédent avant que le coureur n'arrive. Le
      // retard du coureur se lit sur les positions RÉELLES de l'étape
      // précédente (contrainte de vitesse), pas sur les cibles idéales où il
      // est déjà arrivé. `effectiveDefensePositions(N-1)` ne dépend que des
      // étapes ≤ N-1 : pas de cycle.
      const reached = extractDefenderPositions(effectiveDefensePositions(state, stepIdx - 1));
      const next = decideNextCascade(rotationMode, prevResult.openMan, matchups, {
        stepIdx,
        off,
        hoop,
        ballCarrier,
        prevBallCarrier,
        prevPositions: reached,
        busyDefenders: actionBusy,
      });
      if (next) {
        applyRotationSwap(matchups, next.swap);
        rotationOut.swaps.push(next.swap);
        rotationEvents[next.swap.a] = 'closeout';
        rotationEvents[next.swap.b] = 'rotate';
        rotationOut.openMan = next.open;
      } else if (openManStillRunning(prevResult.openMan, matchups, off, reached)) {
        rotationOut.openMan = prevResult.openMan;
      }
    }
  }

  const side = ballSide(off[ballCarrier]);
  const carrierPos = off[ballCarrier];

  const ctx: DefenseFrameContext = {
    state,
    stepIdx,
    step,
    off,
    ballCarrier,
    carrierPos,
    defenderIds,
    prevOff,
    prevDefenderPositions,
    hoop,
    triggers,
    side,
    screen,
    effectiveScreenRule,
    switchedThisStep,
    detectedSwitch,
    scrammedSwitch,
    rejectedScreen,
    snakeDribble,
    prevTargets: prevResult?.positions ?? null,
    rotationEvents,
    rotationOut,
  };

  return { ctx, matchups };
}
