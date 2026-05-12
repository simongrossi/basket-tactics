// Règle 3 — Pick-and-roll : action détectée + diagnostic adapté.
//
// On utilise `detectStepScreenAction` qui retourne `{screen, action}` avec
// `action.kind ∈ {roll, pop, slip, short-roll, ghost, reject, snake, re-screen}`.
//
// Selon le type d'action, le diagnostic change :
//  - roll / short-roll / slip  → low-man tag exigé
//  - pop / ghost               → recover du défenseur du screener (drop = ouvert)
//  - reject / snake            → couverture cassée (basculer la lecture)
//  - re-screen                 → ne pas se déclasser, second écran à venir
//
// Plus des diagnostics spécifiques par couverture (ice / weak / peel-switch).

import type { ComputedDefense, DefenderId } from '../../../types';
import { detectStepScreenAction } from '../../engine';
import {
  actionBreaksCoverage,
  actionRequiresLowManTag,
  actionRequiresPopRecover,
  screenActionLabel,
} from '../../screenAction';
import { distance } from '../../geometry';
import type { CoachDiagnostic, Rule } from '../types';
import { isOutsideThreat, withProfile } from '../helpers';

export const pickAndRollRule: Rule = (ctx) => {
  const { state, stepIdx, off, defPos, profiles, cur } = ctx;
  const detected = detectStepScreenAction(state, stepIdx);
  if (!detected) return [];

  const { screen, action } = detected;
  const screenerLabel = withProfile(screen.screener, profiles?.[screen.screener]);
  const carrierLabel = withProfile(screen.carrier, profiles?.[screen.carrier]);
  const out: CoachDiagnostic[] = [];

  // Couverture appliquée à cet écran — règle globale ou override individuel.
  const carrierDefRule = state.rules[screen.carrierDef];
  const coverage =
    carrierDefRule?.screenNav && carrierDefRule.screenNav !== 'auto'
      ? carrierDefRule.screenNav
      : state.screenRule;

  // ----- Diagnostics par couverture -----

  if (coverage === 'ice') {
    // Ice efficace = porteur forcé baseline (drive vers le coin/sideline,
    // pas vers le middle). Détection : à l'étape suivante, le porteur a
    // bougé latéralement vers l'extérieur (loin de l'axe panier).
    const nextStep = state.steps[stepIdx + 1];
    if (nextStep) {
      const carrierThis = off[screen.carrier];
      const carrierNext = nextStep.off[screen.carrier];
      if (carrierThis && carrierNext) {
        const hoopX = ctx.hoop.x;
        const wentBaseline = Math.abs(carrierNext.x - hoopX) > Math.abs(carrierThis.x - hoopX) + 20;
        const wentMiddle = Math.abs(carrierNext.x - hoopX) < Math.abs(carrierThis.x - hoopX) - 20;
        if (wentMiddle) {
          out.push({
            id: 'ice-failed',
            severity: 'critical',
            message: `Ice cassé : ${carrierLabel} prend le middle malgré la consigne no-middle`,
            tag: 'ice-failed',
            defenders: [screen.carrierDef],
            attackers: [screen.carrier],
          });
        } else if (wentBaseline) {
          out.push({
            id: 'ice-ok',
            severity: 'good',
            message: `Ice tenu : ${carrierLabel} forcé baseline`,
            tag: 'ice-ok',
            defenders: [screen.carrierDef],
            attackers: [screen.carrier],
          });
        }
      }
    }
  }

  if (coverage === 'weak' && isOutsideThreat(profiles?.[screen.carrier])) {
    // Weak vs un porteur shooter = trou tactique. Le coach a choisi de
    // laisser le porteur shooter pour rester sur le screener.
    out.push({
      id: 'weak-vs-shooter',
      severity: 'warning',
      message: `Weak sur ${carrierLabel} — choix risqué vs un tireur`,
      tag: 'weak-vs-shooter',
      defenders: [screen.carrierDef],
      attackers: [screen.carrier],
    });
  }

  if (coverage === 'peel-switch') {
    // Si le switch a été déclenché à cette étape, le porteur a passé.
    const fired =
      cur.switches?.some(([d1, d2]) =>
        (d1 === screen.carrierDef && d2 === screen.screenerDef) ||
        (d2 === screen.carrierDef && d1 === screen.screenerDef)
      ) ?? false;
    if (fired) {
      out.push({
        id: 'peel-fired',
        severity: 'info',
        message: `Peel switch déclenché : ${screen.screenerDef} prend ${carrierLabel}, ${screen.carrierDef} peel sur ${screenerLabel}`,
        tag: 'peel-fired',
        defenders: [screen.carrierDef, screen.screenerDef],
        attackers: [screen.carrier, screen.screener],
      });
    }
  }

  // ----- Low-man tag (roll / short-roll / slip) -----
  if (actionRequiresLowManTag(action.kind)) {
    // Avec les rotations P1, l'engine assigne déjà pnrRole='tag' au low-man
    // identifié. On lit ce flag pour savoir QUI doit tagger, et on regarde
    // s'il est `late` pour savoir si le tag est compromis.
    const tagger = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][])
      .find(([, p]) => p.pnrRole === 'tag');
    if (tagger) {
      const [tDef, tInfo] = tagger;
      if (tInfo.late) {
        out.push({
          id: `tag-late-${tDef}`,
          severity: 'critical',
          message: `${screenActionLabel(action.kind)} de ${screenerLabel} : ${tDef} en retard pour tagger`,
          tag: 'low-man-tag-late',
          defenders: [tDef],
          attackers: [screen.screener],
        });
      } else {
        out.push({
          id: `tag-ok-${tDef}`,
          severity: 'good',
          message: `${tDef} tag bien le ${screenActionLabel(action.kind)} de ${screenerLabel}`,
          tag: 'low-man-tag-ok',
          defenders: [tDef],
          attackers: [screen.screener],
        });
      }
    } else {
      // Pas de défenseur assigné : aucun candidat valable (ex. carrierDef et
      // screenerDef sont les seuls disponibles). Anomalie tactique — le
      // roller part en 1c0.
      out.push({
        id: 'tag-none',
        severity: 'critical',
        message: `${screenActionLabel(action.kind)} de ${screenerLabel} : aucun low-man disponible — roller libre`,
        tag: 'low-man-tag-none',
        defenders: [],
        attackers: [screen.screener],
      });
    }
  }

  // ----- X-out (rotation de secours en aide P1) -----
  const xOuter = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][])
    .find(([, p]) => p.pnrRole === 'x-out');
  if (xOuter) {
    const [xDef, xInfo] = xOuter;
    if (xInfo.late) {
      out.push({
        id: `xout-late-${xDef}`,
        severity: 'warning',
        message: `X-out de ${xDef} en retard — passe skip ouverte`,
        tag: 'x-out-late',
        defenders: [xDef],
        attackers: [xInfo.matchedTo],
      });
    }
  }

  // ----- Pop / ghost : recover du défenseur du screener -----
  if (actionRequiresPopRecover(action.kind)) {
    const screenerPos = off[screen.screener];
    const sDef = defPos[screen.screenerDef];
    const distScreenerToDef = distance({ x: sDef.x, y: sDef.y }, screenerPos);
    // Pop ou ghost : le défenseur du screener doit être à distance de contest
    // (≤80px ≈ closeout). Au-delà, le 3pts est ouvert.
    const isShooter = isOutsideThreat(profiles?.[screen.screener]);
    if (distScreenerToDef > 80) {
      out.push({
        id: `pop-recover-${screen.screenerDef}`,
        severity: isShooter ? 'critical' : 'warning',
        message: isShooter
          ? `${screenActionLabel(action.kind)} de ${screenerLabel} — ${screen.screenerDef} à ${Math.round(distScreenerToDef)}px, tir 3 ouvert`
          : `${screenActionLabel(action.kind)} de ${screenerLabel} — ${screen.screenerDef} doit recover plus vite`,
        tag: 'pop-recover-late',
        defenders: [screen.screenerDef],
        attackers: [screen.screener],
      });
    }
  }

  // ----- Couverture cassée (reject / snake) -----
  if (actionBreaksCoverage(action.kind)) {
    out.push({
      id: `coverage-broken-${action.kind}`,
      severity: 'warning',
      message: `${screenActionLabel(action.kind)} de ${carrierLabel} — couverture initiale cassée, défense à relire`,
      tag: 'coverage-broken',
      defenders: [screen.carrierDef, screen.screenerDef],
      attackers: [screen.carrier, screen.screener],
    });
  }

  // ----- Re-screen -----
  if (action.kind === 're-screen') {
    out.push({
      id: 're-screen',
      severity: 'info',
      message: `${screenerLabel} repose un écran sur ${carrierLabel} — ne pas relâcher la couverture`,
      tag: 're-screen',
      defenders: [screen.carrierDef, screen.screenerDef],
      attackers: [screen.carrier, screen.screener],
    });
  }

  return out;
};
