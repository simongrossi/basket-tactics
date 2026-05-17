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
import {
  buildFreeThrowSetup,
  buildFreeThrowReboundSetup,
} from '@/lib/logic/freeThrowSetup';
import { buildInboundSetup } from '@/lib/logic/inboundSetup';
import { buildInboundDefenseSetup } from '@/lib/logic/inboundDefenseSetup';
import { buildJumpBallSetup } from '@/lib/logic/jumpBallSetup';
import { activeOffense } from '@/lib/logic/players';
import { getDefenseHoop } from '@/lib/logic/engine';

export function setActiveStep(s: AppState, idx: number): AppState {
  return { ...s, activeStep: Math.max(0, Math.min(s.steps.length - 1, idx)) };
}

/** Ajoute une nouvelle étape juste après l'active. Propage les destinations
 *  des annotations de mouvement (cut/screen/dribble) de l'étape courante aux
 *  positions de la nouvelle, et propage le receveur d'une passe au porteur. */
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
