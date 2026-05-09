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
