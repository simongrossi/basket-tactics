// Règle coach — analyse défensive sur step de remise en jeu.
//
// Détecte les défauts typiques d'une configuration défensive sur
// inbound :
//
//  - Pas de pression sur le passeur (= aucun défenseur < 50 px)
//  - Receveur principal sans deny (= défenseur loin de la ligne de
//    passe entre receveur et passeur)
//  - Trop d'attaquants libres (= > 2 à plus de 80 px de leur défenseur
//    direct, défense en "absentéisme")
//
// Complète `inboundFiveSecRule` (offensif) et `boxOutCheckRule` (rebond).

import type { Rule } from '../types';
import { distance } from '../../geometry';
import type { AttackerId, DefenderId, Point } from '../../../types';

const PRESSURE_DISTANCE_PX = 50;
const DENY_OFFLINE_THRESHOLD_PX = 80;
const OPEN_ATTACKER_THRESHOLD_PX = 80;
const MAX_OPEN_ATTACKERS_BEFORE_WARN = 2;

function isInboundStep(ctx: string | undefined): boolean {
  return (
    ctx === 'inbound-baseline' ||
    ctx === 'inbound-sideline-low' ||
    ctx === 'inbound-sideline-high'
  );
}

/** Calcule la projection du receveur sur la ligne passeur-receveur :
 *  distance perpendiculaire entre le défenseur et le segment.
 *  Si la distance est élevée (= défenseur "hors-ligne"), le deny est
 *  inefficace. */
function distFromLine(p: Point, a: Point, b: Point): number {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const len = Math.hypot(ax, ay);
  if (len < 0.01) return distance(p, a);
  const px = p.x - a.x;
  const py = p.y - a.y;
  // Composante perpendiculaire
  const cross = Math.abs(px * ay - py * ax) / len;
  return cross;
}

export const inboundDefenseRule: Rule = (ctx) => {
  const { cur, off, defPos, defenderIds, carrier } = ctx;
  if (!isInboundStep(cur.context)) return [];

  const inbounder = carrier;
  const passerPos = off[inbounder];
  if (!passerPos) return [];

  // ---------- Check 1 : pression sur le passeur ---------------------
  let nearestDefDist = Infinity;
  defenderIds.forEach((dId) => {
    const def = defPos[dId];
    if (!def) return;
    const d = distance({ x: def.x, y: def.y }, passerPos);
    if (d < nearestDefDist) nearestDefDist = d;
  });
  const noPressure = nearestDefDist > PRESSURE_DISTANCE_PX;

  // ---------- Check 2 : receveur principal sans deny ----------------
  // Receveur principal = attaquant non-passeur le plus proche du passeur
  let primaryId: AttackerId | null = null;
  let bestDist = Infinity;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    if (id === inbounder) return;
    const d = distance(passerPos, off[id]);
    if (d < bestDist) {
      bestDist = d;
      primaryId = id;
    }
  });
  let primaryWithoutDeny = false;
  if (primaryId) {
    // Trouve le défenseur supposé matched (convention : Dk ↔ Ok)
    const primaryIdx = (['O1', 'O2', 'O3', 'O4', 'O5'] as const).indexOf(primaryId);
    const dId = (`D${primaryIdx + 1}`) as DefenderId;
    const def = defPos[dId];
    if (def) {
      const offline = distFromLine({ x: def.x, y: def.y }, passerPos, off[primaryId]);
      primaryWithoutDeny = offline > DENY_OFFLINE_THRESHOLD_PX;
    }
  }

  // ---------- Check 3 : attaquants ouverts -------------------------
  let openAttackers = 0;
  const openIds: AttackerId[] = [];
  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    if (oId === inbounder) return;
    const oIdx = (['O1', 'O2', 'O3', 'O4', 'O5'] as const).indexOf(oId);
    const dId = (`D${oIdx + 1}`) as DefenderId;
    const def = defPos[dId];
    if (!def) return;
    const d = distance({ x: def.x, y: def.y }, off[oId]);
    if (d > OPEN_ATTACKER_THRESHOLD_PX) {
      openAttackers += 1;
      openIds.push(oId);
    }
  });

  const diags = [] as ReturnType<Rule>;

  if (noPressure) {
    diags.push({
      id: `inbound-no-pressure-${ctx.stepIdx}`,
      severity: 'warning',
      message: `Aucune pression sur ${inbounder} (passeur). Le plus proche défenseur est à ${nearestDefDist.toFixed(0)} px. Forcer la passe rapide n'est pas possible.`,
      tag: 'inbound-no-pressure',
      defenders: [],
      attackers: [inbounder],
    });
  }
  if (primaryWithoutDeny && primaryId) {
    const primaryIdx = (['O1', 'O2', 'O3', 'O4', 'O5'] as const).indexOf(primaryId);
    const dId = (`D${primaryIdx + 1}`) as DefenderId;
    diags.push({
      id: `inbound-no-deny-${ctx.stepIdx}`,
      severity: 'warning',
      message: `Receveur principal ${primaryId} sans deny. ${dId} n'est pas entre ${primaryId} et le passeur — la passe rentrante est ouverte.`,
      tag: 'inbound-no-deny',
      defenders: [dId],
      attackers: [primaryId],
    });
  }
  if (openAttackers > MAX_OPEN_ATTACKERS_BEFORE_WARN) {
    diags.push({
      id: `inbound-too-many-open-${ctx.stepIdx}`,
      severity: 'critical',
      message: `${openAttackers} attaquants libres (> ${OPEN_ATTACKER_THRESHOLD_PX} px de leur défenseur) : ${openIds.join(', ')}. Trous massifs dans la couverture.`,
      tag: 'inbound-too-many-open',
      defenders: [],
      attackers: openIds,
    });
  }

  // ---------- Verdict OK si rien d'anormal -------------------------
  if (diags.length === 0) {
    diags.push({
      id: `inbound-defense-ok-${ctx.stepIdx}`,
      severity: 'good',
      message: `Défense sur remise solide : pression sur le passeur, deny sur receveur principal, ≤ ${MAX_OPEN_ATTACKERS_BEFORE_WARN} attaquants ouverts.`,
      tag: 'inbound-defense-ok',
      defenders: [],
      attackers: [],
    });
  }

  return diags;
};
