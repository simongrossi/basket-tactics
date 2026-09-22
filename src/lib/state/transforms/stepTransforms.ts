// Transformations sur les steps : CRUD + label + ballCarrier.
// Toutes les fonctions sont pures (AppState → AppState) pour être testables
// sans React et composables sans surprise.

import type {
  AppState,
  AttackerId,
  InboundDefenseMode,
  InboundSide,
  Step,
} from '@/lib/types';
import { makeStep } from '@/lib/data/initial';
import { isBlankStep } from '@/lib/logic/stepMutations';
import {
  buildFreeThrowSetup,
  buildFreeThrowReboundSetup,
} from '@/lib/logic/freeThrowSetup';
import { buildInboundSetup } from '@/lib/logic/inboundSetup';
import { buildShotReboundSetup, reboundStepLabel } from '@/lib/logic/shotReboundSetup';
import { buildAwayPossessionSetup } from '@/lib/logic/awayPossessionSetup';
import { buildInboundDefenseSetup } from '@/lib/logic/inboundDefenseSetup';
import { buildJumpBallSetup } from '@/lib/logic/jumpBallSetup';
import { buildFastBreakSteps } from '@/lib/logic/fastBreak';
import { activeOffense } from '@/lib/logic/players';
import { getDefenseHoop } from '@/lib/logic/engine';

export function setActiveStep(s: AppState, idx: number): AppState {
  return { ...s, activeStep: Math.max(0, Math.min(s.steps.length - 1, idx)) };
}

/** Ajoute une nouvelle étape juste après l'active. Propage les destinations
 *  des annotations de mouvement (cut/screen/dribble) de l'étape courante aux
 *  positions de la nouvelle, et propage le receveur d'une passe au porteur.
 *
 *  Si l'étape suivante est la dernière et qu'elle est vide (étape résultat
 *  créée automatiquement par le dessin), on s'y place au lieu d'insérer une
 *  seconde étape identique, qui produirait un temps mort à la lecture. */
export function addStep(s: AppState): AppState {
  const cur = s.steps[s.activeStep];
  const newOff = { ...cur.off };
  cur.annotations.forEach((anno) => {
    if (anno.type === 'cut' || anno.type === 'screen' || anno.type === 'dribble') {
      const id = anno.fromId as AttackerId;
      if (id in newOff && anno.to) {
        newOff[id] = { x: anno.to.x, y: anno.to.y };
      }
    }
  });
  const passAnno = cur.annotations.find((a) => a.type === 'pass' && a.toId);
  const newCarrier = passAnno?.toId ?? cur.ballCarrier;
  const nextIdx = s.activeStep + 1;
  const next = s.steps[nextIdx];
  if (next && nextIdx === s.steps.length - 1 && !next.isInterpolated && isBlankStep(next)) {
    const steps = [...s.steps];
    steps[nextIdx] = { ...next, off: { ...next.off, ...newOff }, ballCarrier: newCarrier };
    return { ...s, steps, activeStep: nextIdx };
  }
  const newStep = makeStep(newOff, newCarrier, []);
  const steps = [...s.steps];
  steps.splice(s.activeStep + 1, 0, newStep);
  return { ...s, steps, activeStep: s.activeStep + 1 };
}

export function duplicateStep(s: AppState): AppState {
  const copy: Step = structuredClone(s.steps[s.activeStep]);
  delete copy.switches;
  const steps = [...s.steps];
  steps.splice(s.activeStep + 1, 0, copy);
  return { ...s, steps, activeStep: s.activeStep + 1 };
}

export function deleteStep(s: AppState): AppState {
  if (s.steps.length <= 1) return s;
  const steps = s.steps.filter((_, i) => i !== s.activeStep);
  return { ...s, steps, activeStep: Math.max(0, s.activeStep - 1) };
}

export function setStepLabel(s: AppState, idx: number, label: string): AppState {
  const steps = [...s.steps];
  steps[idx] = { ...steps[idx], label: label || undefined };
  return { ...s, steps };
}

/**
 * Patch partiel d'un step. Utilisé pour les champs périphériques qui n'ont
 * pas leur propre transform dédiée (B.1 duration, F.4 clockSeconds, F.5
 * shotClockRemaining, etc.). N'altère pas `activeStep`.
 */
export function patchStep(
  s: AppState,
  idx: number,
  patch: Partial<AppState['steps'][number]>
): AppState {
  if (idx < 0 || idx >= s.steps.length) return s;
  const steps = [...s.steps];
  steps[idx] = { ...steps[idx], ...patch };
  return { ...s, steps };
}

export function setBallCarrier(s: AppState, carrier: AttackerId): AppState {
  const steps = [...s.steps];
  steps[s.activeStep] = { ...steps[s.activeStep], ballCarrier: carrier };
  return { ...s, steps };
}

/**
 * F.3 — Convertit le step actif en setup de lancer franc (rebound
 * positioning FIBA 5v5). Force les 10 positions sur les 6 slots du
 * couloir LF + 1 tireur + 2 outlets 3pt. Pose `step.context = 'free-throw'`
 * pour permettre aux couches en aval (UI, diagnostics) de réagir. Le
 * tireur devient le ballCarrier. Les annotations existantes sont effacées
 * (le LF est un setup figé, pas une action).
 *
 * Pour revenir au jeu live, l'utilisateur supprime le step ou en duplique
 * un précédent.
 */
export function convertStepToFreeThrow(s: AppState): AppState {
  const ft = buildFreeThrowSetup();
  const cur = s.steps[s.activeStep];
  if (!cur) return s;
  const steps = [...s.steps];
  steps[s.activeStep] = {
    ...cur,
    off: ft.off,
    ballCarrier: ft.shooter,
    annotations: [],
    context: 'free-throw',
    // Force les défenseurs sur leurs positions LF (sinon le moteur les
    // recalcule sur les attaquants en mode man-to-man et casse le setup).
    defenseOverrides: ft.def,
    // Pas d'écran à un LF — clear toute détection forcée.
    forcedScreener: undefined,
    // Marque comme override manuel pour préserver le step en cas de
    // recompilation de scénario.
    manualOverride: true,
  };
  // Synchronise `defenseInitial` quand on convertit le step 0 (édition libre).
  const defenseInitial =
    s.activeStep === 0 ? ft.def : s.defenseInitial;
  return { ...s, steps, defenseInitial };
}

/**
 * Convertit le step actif en setup de remise en jeu (inbound). Pose
 * le passeur ~12 px hors-ligne, dispose les 4 autres attaquants en
 * setup canonique (Box pour BLOB, diagonale pour SLOB), et place les
 * défenseurs en man-to-man face à face. Pose `step.context` au type
 * d'inbound choisi pour permettre aux couches en aval (UI, indicateur
 * "REMISE 5s") de réagir.
 *
 * Le passeur devient le `ballCarrier`. Les annotations existantes sont
 * effacées. Marque le step comme `manualOverride` pour préserver le
 * setup en cas de recompilation de scénario.
 */
export function convertStepToInbound(s: AppState, side: InboundSide): AppState {
  const setup = buildInboundSetup(side);
  const cur = s.steps[s.activeStep];
  if (!cur) return s;
  const steps = [...s.steps];
  steps[s.activeStep] = {
    ...cur,
    off: setup.off,
    ballCarrier: setup.inbounder,
    annotations: [],
    context: side,
    defenseOverrides: setup.def,
    forcedScreener: undefined,
    manualOverride: true,
  };
  const defenseInitial =
    s.activeStep === 0 ? setup.def : s.defenseInitial;
  return { ...s, steps, defenseInitial };
}

/**
 * Applique un mode défensif sur le step inbound actif. Recalcule
 * `defenseOverrides` selon le mode choisi (man / face-guard /
 * deny-deny / zone-press). No-op si step.context n'est pas inbound-*.
 *
 * Le mode est mémorisé via une convention de labellisation : on
 * stocke le mode dans `step.label` quand le label n'a pas été
 * customisé par l'utilisateur. (Le state.steps[].label sert d'origine
 * de mémoire transitoire ; on n'ajoute PAS de champ dédié pour
 * préserver la rétrocompat du modèle Step.)
 */
/**
 * E.2 — Convertit le step actif en entre-deux (jump ball).
 *
 * Pose les 10 joueurs autour du cercle central : 2 jumpers au centre
 * (O1 et son matched D1), 4 + 4 répartis en arc autour. Tous à
 * MIN_CLEARANCE_PX ≥ 34. Le ballon n'est physiquement pas porté
 * pendant le jump ball réel ; pour la cohérence interne, on garde
 * `ballCarrier: O1` (= notre jumper).
 *
 * Annotations vidées. Marque `manualOverride: true` pour préserver
 * en cas de recompilation de scénario.
 */
export function convertStepToJumpBall(s: AppState): AppState {
  const setup = buildJumpBallSetup();
  const cur = s.steps[s.activeStep];
  if (!cur) return s;
  const steps = [...s.steps];
  steps[s.activeStep] = {
    ...cur,
    off: setup.off,
    ballCarrier: setup.jumper,
    annotations: [],
    context: 'jump-ball',
    defenseOverrides: setup.def,
    forcedScreener: undefined,
    manualOverride: true,
  };
  const defenseInitial =
    s.activeStep === 0 ? setup.def : s.defenseInitial;
  return { ...s, steps, defenseInitial };
}

/**
 * F.2 — Ajoute une étape "course-rebond" après le step LF actif.
 *
 * Quand `made = true` : recul vers la transition adverse.
 * Quand `made = false` : convergence vers la zone du cercle pour le
 * rebond (les blocks défensifs gardent leur priorité, les slots
 * offensifs montent en over-the-top).
 *
 * No-op si le step actif n'est PAS un free-throw (`context !== 'free-throw'`).
 * L'étape ajoutée a `context: 'live-play'` (la phase reprend).
 */
export function addFreeThrowReboundStep(
  s: AppState,
  made: boolean
): AppState {
  const cur = s.steps[s.activeStep];
  if (!cur) return s;
  if (cur.context !== 'free-throw') return s;
  const reboundSetup = buildFreeThrowReboundSetup(made);
  const baseLabel = made ? 'LF réussi · transition' : 'LF manqué · course rebond';
  const newStep: Step = {
    label: baseLabel,
    off: reboundSetup.off,
    ballCarrier: made ? reboundSetup.shooter : (Object.keys(reboundSetup.off)[0] as AttackerId),
    annotations: [
      // Annotations cut pour animer les joueurs LF vers la zone du rebond.
      // Source : positions du step LF (cur.off). Cible : reboundSetup.off.
      ...(['O4', 'O5'] as AttackerId[])
        .filter((id) => {
          const from = cur.off[id];
          const to = reboundSetup.off[id];
          if (!from || !to) return false;
          const d = Math.hypot(to.x - from.x, to.y - from.y);
          return d > 10; // skip si pas de mouvement significatif
        })
        .map((id) => ({
          type: 'cut' as const,
          fromId: id,
          toId: null,
          from: { ...cur.off[id] },
          to: { ...reboundSetup.off[id] },
        })),
    ],
    context: 'live-play' as const,
    manualOverride: true,
    defenseOverrides: reboundSetup.def,
  };
  const steps = [...s.steps];
  steps.splice(s.activeStep + 1, 0, newStep);
  return { ...s, steps, activeStep: s.activeStep + 1 };
}

/**
 * A11 V1 — Ajoute un step de rebond après un tir manqué.
 *
 * Pré-requis : le step actif (ou `sourceStepIdx` si fourni) doit avoir
 * `shotOutcome === 'missed'`. Sinon, retourne le state inchangé.
 *
 * Le step généré contient :
 *   - positions attaquants box-out (rebondeur poussé vers le cercle)
 *   - positions défenseurs en box-out figées via `defenseOverrides`
 *   - `ballCarrier` = rebondeur si offensif, shooter sinon
 *   - `rebounder` + `reboundType` informatifs pour les diagnostics
 *   - label lisible "Rebond offensif/défensif/team-out X"
 *
 * Options :
 *   - `seed?: number` : graine RNG pour reproductibilité (tests).
 *   - `sourceStepIdx?: number` : défaut = s.activeStep.
 */
export function addShotReboundStep(
  s: AppState,
  options: { seed?: number; sourceStepIdx?: number } = {}
): AppState {
  const sourceStepIdx = options.sourceStepIdx ?? s.activeStep;
  const sourceStep = s.steps[sourceStepIdx];
  if (!sourceStep) return s;
  // V2 — accepte aussi 'blocked'. 'made' reste no-op (le coach gère
  // manuellement la transition adverse).
  if (sourceStep.shotOutcome !== 'missed' && sourceStep.shotOutcome !== 'blocked') return s;

  const setup = buildShotReboundSetup(s, sourceStepIdx, { seed: options.seed });
  const isBlocked = sourceStep.shotOutcome === 'blocked';
  const label = reboundStepLabel(setup, isBlocked);

  // V2 ext 2 — Reset shot clock à 14s sur rebond offensif (règle FIBA/NBA :
  // 14s reset après rebond off, vs 24s reset après possession adverse).
  // Posé sur Step.shotClockRemaining (F.5) → exploité par lateShotClockLayer.
  const shotClockRemaining = setup.reboundType === 'offensive' ? 14 : undefined;

  // V2 ext 3 — Outlet pass marker : sur rebond défensif, la possession
  // bascule, la défense doit jouer une passe outlet pour enclencher la
  // transition. Marqueur informatif (diags coach).
  const outletPassPending = setup.reboundType === 'defensive' ? true : undefined;

  const newStep: Step = {
    label,
    off: setup.off,
    ballCarrier: setup.ballCarrier,
    annotations: [],
    context: 'live-play' as const,
    manualOverride: true,
    defenseOverrides: setup.def,
    ...(setup.rebounder ? { rebounder: setup.rebounder } : {}),
    reboundType: setup.reboundType,
    ...(shotClockRemaining !== undefined ? { shotClockRemaining } : {}),
    ...(outletPassPending !== undefined ? { outletPassPending } : {}),
  };

  const steps = [...s.steps];
  steps.splice(sourceStepIdx + 1, 0, newStep);
  return { ...s, steps, activeStep: sourceStepIdx + 1 };
}

/**
 * E.1 V2 stage 2b — Convertit le step actif en phase de possession
 * adverse, ou ajoute un step suivant en phase adverse.
 *
 * Options :
 *   - `mode: 'insert' | 'replace'` (default 'insert')
 *     - 'insert' : ajoute un nouveau step adverse après sourceStepIdx
 *       (usage flux post-rebond défensif).
 *     - 'replace' : remplace le step actif (= bascule visuelle pure,
 *       le coach peut éditer librement ensuite).
 *   - `sourceStepIdx: number` (default = s.activeStep)
 *
 * Le step généré/converti :
 *   - viewSide = 'away'
 *   - positions miroir verticales (y -> 2*540 - y)
 *   - défenseurs sourceStep → attaquants step adverse (et inversement)
 *   - label "Transition adverse" (ou "Phase adverse" en replace)
 *   - defenseOverrides figés
 */
/**
 * A11 V3 — Chaîne automatiquement rebond défensif → transition adverse.
 *
 * Combine A11 V2 ext3 (outletPassPending) et E.1 stage 2b
 * (convertStepToAwayPossession) en un seul setter idiomatique :
 *   1. Vérifie que sourceStep a `outletPassPending: true`.
 *   2. Clear le flag sur sourceStep (la transition a été jouée).
 *   3. Ajoute un step adverse via convertStepToAwayPossession mode insert.
 *
 * Pré-requis : `outletPassPending === true` (= rebond défensif récent).
 * Sinon, retourne le state inchangé (no-op).
 */
export function addOutletPassStep(
  s: AppState,
  options: { sourceStepIdx?: number } = {},
): AppState {
  const sourceStepIdx = options.sourceStepIdx ?? s.activeStep;
  const sourceStep = s.steps[sourceStepIdx];
  if (!sourceStep) return s;
  if (!sourceStep.outletPassPending) return s;

  // Clear le flag puis chaîne convertStepToAwayPossession.
  const stepsCleared = [...s.steps];
  stepsCleared[sourceStepIdx] = { ...sourceStep, outletPassPending: undefined };
  const stateCleared: AppState = { ...s, steps: stepsCleared };
  return convertStepToAwayPossession(stateCleared, { mode: 'insert', sourceStepIdx });
}

/**
 * Transition sous-projet 1 — génère le fast-break (outlet + sprint des couloirs)
 * après un rebond défensif. Appende 2 steps, bascule full-court +
 * attackingDirection='down'. No-op si le step source n'est pas un rebond
 * défensif. `addOutletPassStep` (miroir demi-terrain) reste distinct.
 */
export function addFastBreakSteps(
  s: AppState,
  options: { sourceStepIdx?: number } = {},
): AppState {
  const sourceStepIdx = options.sourceStepIdx ?? s.activeStep;
  const built = buildFastBreakSteps(s, sourceStepIdx);
  if (!built) return s;
  const steps = [...s.steps];
  steps.splice(sourceStepIdx + 1, 0, built.outletStep, built.sprintStep);
  return {
    ...s,
    steps,
    fullCourt: true,
    attackingDirection: 'down',
    activeStep: sourceStepIdx + 2,
  };
}

export function convertStepToAwayPossession(
  s: AppState,
  options: { mode?: 'insert' | 'replace'; sourceStepIdx?: number } = {},
): AppState {
  const sourceStepIdx = options.sourceStepIdx ?? s.activeStep;
  const sourceStep = s.steps[sourceStepIdx];
  if (!sourceStep) return s;

  const setup = buildAwayPossessionSetup(s, sourceStepIdx);
  const mode = options.mode ?? 'insert';
  const label = mode === 'insert' ? 'Transition adverse' : 'Phase adverse';

  const newStepCommon = {
    label,
    off: setup.off,
    ballCarrier: setup.ballCarrier,
    annotations: [],
    context: 'live-play' as const,
    manualOverride: true,
    defenseOverrides: setup.def,
    viewSide: 'away' as const,
  };

  if (mode === 'replace') {
    const steps = [...s.steps];
    steps[sourceStepIdx] = { ...sourceStep, ...newStepCommon };
    return { ...s, steps };
  }

  // insert
  const newStep: Step = newStepCommon;
  const steps = [...s.steps];
  steps.splice(sourceStepIdx + 1, 0, newStep);
  return { ...s, steps, activeStep: sourceStepIdx + 1 };
}

export function setInboundDefenseMode(
  s: AppState,
  mode: InboundDefenseMode
): AppState {
  const cur = s.steps[s.activeStep];
  if (!cur) return s;
  const isInbound =
    cur.context === 'inbound-baseline' ||
    cur.context === 'inbound-sideline-low' ||
    cur.context === 'inbound-sideline-high';
  if (!isInbound) return s;

  const off = activeOffense(cur.off, s.playerCount);
  const hoop = getDefenseHoop(s);
  const setup = buildInboundDefenseSetup({
    off,
    inbounder: cur.ballCarrier,
    mode,
    hoop,
  });

  const steps = [...s.steps];
  steps[s.activeStep] = {
    ...cur,
    defenseOverrides: setup.positions,
    manualOverride: true,
  };
  return { ...s, steps };
}
