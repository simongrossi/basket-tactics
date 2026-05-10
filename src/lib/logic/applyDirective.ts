import type {
  DefenderPositions,
  DefensiveDirective,
  Step,
  AttackerId,
  DefenderId,
} from '../types';
import { HOOP } from '../data/court';

/** Convention par défaut Di→Oi, utilisée si assignmentOverrides absent. */
const DEFAULT_ASSIGNMENT: Record<DefenderId, AttackerId> = {
  D1: 'O1', D2: 'O2', D3: 'O3', D4: 'O4', D5: 'O5',
};

/** Applique une directive en mutant `targets` (positions cibles défensives).
 *  Override additif : seuls les défenseurs nommés dans la directive sont touchés. */
export function applyDirective(
  targets: DefenderPositions,
  directive: DefensiveDirective,
  step: Step,
): void {
  switch (directive.type) {
    case 'trap':
      applyTrap(targets, directive, step);
      break;
    case 'tag':
      applyTag(targets, directive, step);
      break;
    case 'help-and-recover':
      applyHelpAndRecover(targets, directive, step);
      break;
    case 'pre-switch':
      applyPreSwitch(targets, directive, step);
      break;
    case 'over':
      applyOver(targets, directive, step);
      break;
    case 'under':
      applyUnder(targets, directive, step);
      break;
    case 'switch':
      applySwitch(targets, directive, step);
      break;
    case 'hedge':
      applyHedge(targets, directive, step);
      break;
    case 'drop':
      applyDrop(targets, directive, step);
      break;
    case 'blitz':
      applyBlitz(targets, directive, step);
      break;
    case 'ice':
      applyIce(targets, directive, step);
      break;
    case 'flat-hedge':
      applyFlatHedge(targets, directive, step);
      break;
    case 'peel-switch':
      applyPeelSwitch(targets, directive, step);
      break;
    case 'triple-switch':
      applyTripleSwitch(targets, directive, step);
      break;
    case 'closing-out':
      applyClosingOut(targets, directive, step);
      break;
  }
}

function getMan(d: DefenderId, step: Step): AttackerId {
  return step.assignmentOverrides?.[d] ?? DEFAULT_ASSIGNMENT[d];
}

function applyTrap(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (!dir.target) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  // Vecteur carrier → panier
  const vx = HOOP.x - carrier.x;
  const vy = HOOP.y - carrier.y;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len, uy = vy / len;
  // Place les trappeurs à 80 px du carrier, à ±60° de la direction panier.
  const radius = 80;
  const angles = [Math.PI / 3, -Math.PI / 3]; // ±60°
  dir.defenders.forEach((d, i) => {
    const a = angles[i % 2];
    const cos = Math.cos(a), sin = Math.sin(a);
    // rotation du vecteur unitaire ux,uy de l'angle a, puis multiplication par radius
    const rx = ux * cos - uy * sin;
    const ry = ux * sin + uy * cos;
    targets[d] = {
      x: carrier.x + rx * radius,
      y: carrier.y + ry * radius,
    };
  });
}

function applyTag(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (!dir.target || dir.defenders.length === 0) return;
  const lowMan = dir.defenders[0];
  const myMan = getMan(lowMan, step);
  const myManPos = step.off[myMan];
  const rollerPos = step.off[dir.target];
  if (!myManPos || !rollerPos) return;
  // Position cible = myMan + 0.6 × (roller - myMan) (40% offset vers roller)
  const t = 0.6;
  targets[lowMan] = {
    x: myManPos.x + (rollerPos.x - myManPos.x) * t,
    y: myManPos.y + (rollerPos.y - myManPos.y) * t,
  };
}

function applyHelpAndRecover(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (dir.defenders.length === 0) return;
  const helper = dir.defenders[0];
  if (dir.phase === 'engage') {
    if (!dir.target) return;
    const targetPos = step.off[dir.target];
    if (!targetPos) return;
    const before = targets[helper];
    // Position cible = mid-point (helper.actuel, target) avec offset vers le
    // panier (y diminue). Convention cour : HOOP.y=75, baseline y≈20, top y≈300.
    const midX = (before.x + targetPos.x) / 2;
    const midY = (before.y + targetPos.y) / 2;
    targets[helper] = { x: midX, y: midY - 30 };
  } else {
    // release : retour sur son homme assigné
    const myMan = getMan(helper, step);
    const myManPos = step.off[myMan];
    if (!myManPos) return;
    targets[helper] = { x: myManPos.x, y: myManPos.y + 20 }; // léger offset défensif
  }
}

function applyPreSwitch(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  if (dir.defenders.length === 0 || !dir.swapWith) return;
  const d0 = dir.defenders[0];
  const d1 = dir.swapWith;
  const m0 = getMan(d0, step);
  const m1 = getMan(d1, step);
  const m0Pos = step.off[m0];
  const m1Pos = step.off[m1];
  if (m0Pos) targets[d0] = { x: m0Pos.x, y: m0Pos.y + 20 };
  if (m1Pos) targets[d1] = { x: m1Pos.x, y: m1Pos.y + 20 };
}

// =============================================================
// Phase 5 — Couvertures Tier 2
// =============================================================
//
// Convention y :
//   - HOOP en y=75 (haut SVG, panier)
//   - Périphérie y∈[260..420]
//   - Ligne médiane y=540 (bas SVG)
// "vers le panier" = y diminue. "vers la périphérie / défensif" = y augmente.

/** Vecteur unitaire carrier → HOOP. */
function unitToHoop(p: { x: number; y: number }): { ux: number; uy: number } {
  const vx = HOOP.x - p.x;
  const vy = HOOP.y - p.y;
  const len = Math.hypot(vx, vy) || 1;
  return { ux: vx / len, uy: vy / len };
}

/** Place le défenseur entre carrier et panier ("on-ball" classique).
 *  offset = distance derrière le carrier (côté panier). offset < 0 = côté ballon. */
function positionOnLineToHoop(
  targets: DefenderPositions, d: DefenderId, carrier: { x: number; y: number }, offset: number,
): void {
  const { ux, uy } = unitToHoop(carrier);
  targets[d] = { x: carrier.x + ux * offset, y: carrier.y + uy * offset };
}

function applyOver(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Over = défenseur reste côté ballon (au-dessus de l'écran), entre carrier
  // et la ligne 3pts. Position : à 25px côté périphérie du carrier.
  if (!dir.target || dir.defenders.length === 0) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  positionOnLineToHoop(targets, dir.defenders[0], carrier, -25);
}

function applyUnder(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Under = défenseur passe sous l'écran, donc côté panier du carrier.
  if (!dir.target || dir.defenders.length === 0) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  positionOnLineToHoop(targets, dir.defenders[0], carrier, 35);
}

function applySwitch(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Switch live : d0 et swapWith échangent leurs hommes.
  if (dir.defenders.length === 0 || !dir.swapWith) return;
  const d0 = dir.defenders[0];
  const d1 = dir.swapWith;
  // Après switch, d0 défend le man de d1 (et inversement). Comme assignmentOverrides
  // n'est pas systématique pour 'switch', on positionne directement chacun
  // sur le man de l'autre.
  const m0 = getMan(d0, step);
  const m1 = getMan(d1, step);
  const m0Pos = step.off[m0];
  const m1Pos = step.off[m1];
  if (m1Pos) targets[d0] = { x: m1Pos.x, y: m1Pos.y + 18 };
  if (m0Pos) targets[d1] = { x: m0Pos.x, y: m0Pos.y + 18 };
}

function applyHedge(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Hedge = big montre agressivement à hauteur du carrier, légèrement entre
  // carrier et la direction de drive (ici approximée vers le panier).
  if (!dir.target || dir.defenders.length === 0) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  const { ux, uy } = unitToHoop(carrier);
  // Perpendiculaire au vecteur panier → côté ballon.
  const px = -uy, py = ux;
  // Hedger à 30px en avant du carrier, déporté 25px côté ballon.
  targets[dir.defenders[0]] = {
    x: carrier.x - ux * 30 + px * 25,
    y: carrier.y - uy * 30 + py * 25,
  };
}

function applyDrop(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Drop = big retraite vers le panier. Profondeur paramétrable.
  if (!dir.target || dir.defenders.length === 0) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  const depth = dir.dropDepth ?? 'medium';
  const offsetFromHoop = depth === 'shallow' ? 80 : depth === 'deep' ? 30 : 55;
  // Place le défenseur sur la ligne carrier→panier, à `offsetFromHoop` du panier.
  const { ux, uy } = unitToHoop(carrier);
  targets[dir.defenders[0]] = {
    x: HOOP.x - ux * offsetFromHoop,
    y: HOOP.y - uy * offsetFromHoop,
  };
}

function applyBlitz(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Blitz = trap mais plus haut (loin du panier). On reprend la logique du trap
  // avec un radius plus grand (110 au lieu de 80) et angles ±45° (plus
  // perpendiculaires au drive).
  if (!dir.target) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  const { ux, uy } = unitToHoop(carrier);
  const radius = 110;
  const angles = [Math.PI / 4, -Math.PI / 4];
  dir.defenders.forEach((d, i) => {
    const a = angles[i % 2];
    const cos = Math.cos(a), sin = Math.sin(a);
    const rx = ux * cos - uy * sin;
    const ry = ux * sin + uy * cos;
    targets[d] = { x: carrier.x + rx * radius, y: carrier.y + ry * radius };
  });
}

function applyIce(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Ice = forcer baseline. Défenseur se place côté axe central pour fermer
  // l'angle vers le milieu, et donc pousser le porteur vers la baseline.
  if (!dir.target || dir.defenders.length === 0) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  // Côté du carrier vis-à-vis de l'axe (x=300).
  const sign = carrier.x < 300 ? -1 : 1;
  // Défenseur entre carrier et axe, légèrement au-dessus (côté périphérie).
  targets[dir.defenders[0]] = {
    x: carrier.x - sign * 25,
    y: carrier.y + 18,
  };
}

function applyFlatHedge(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Flat hedge = hedge orienté parallèlement à la baseline (même y que carrier),
  // moins agressif, ne montre pas vers le panier.
  if (!dir.target || dir.defenders.length === 0) return;
  const carrier = step.off[dir.target];
  if (!carrier) return;
  const sign = carrier.x < 300 ? 1 : -1; // côté axe
  targets[dir.defenders[0]] = {
    x: carrier.x + sign * 30,
    y: carrier.y, // même hauteur (parallèle baseline)
  };
}

function applyPeelSwitch(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Peel switch = sur drive du target, le défenseur initial peel et l'aide
  // (swapWith) prend le relais. d0 va sur le man de swapWith ; swapWith va sur
  // target.
  if (dir.defenders.length === 0 || !dir.swapWith || !dir.target) return;
  const d0 = dir.defenders[0];
  const d1 = dir.swapWith;
  const m1 = getMan(d1, step);
  const m1Pos = step.off[m1];
  const targetPos = step.off[dir.target];
  if (m1Pos) targets[d0] = { x: m1Pos.x, y: m1Pos.y + 18 };
  if (targetPos) targets[d1] = { x: targetPos.x, y: targetPos.y + 18 };
}

function applyTripleSwitch(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Triple switch = rotation à 3 (d0 → man de d1, d1 → man de d2, d2 → man de d0).
  if (dir.defenders.length === 0 || !dir.swapWith || !dir.thirdSwap) return;
  const d0 = dir.defenders[0];
  const d1 = dir.swapWith;
  const d2 = dir.thirdSwap;
  const m0Pos = step.off[getMan(d0, step)];
  const m1Pos = step.off[getMan(d1, step)];
  const m2Pos = step.off[getMan(d2, step)];
  if (m1Pos) targets[d0] = { x: m1Pos.x, y: m1Pos.y + 18 };
  if (m2Pos) targets[d1] = { x: m2Pos.x, y: m2Pos.y + 18 };
  if (m0Pos) targets[d2] = { x: m0Pos.x, y: m0Pos.y + 18 };
}

function applyClosingOut(targets: DefenderPositions, dir: DefensiveDirective, step: Step): void {
  // Closeout = sprint contrôlé sur tireur. Défenseur se place à ~25px du target
  // côté périphérie (hands up — visuel posture pas modélisé ici).
  if (!dir.target || dir.defenders.length === 0) return;
  const targetPos = step.off[dir.target];
  if (!targetPos) return;
  const { ux, uy } = unitToHoop(targetPos);
  // 25px côté ballon (donc opposé du panier).
  targets[dir.defenders[0]] = {
    x: targetPos.x - ux * 25,
    y: targetPos.y - uy * 25,
  };
}
