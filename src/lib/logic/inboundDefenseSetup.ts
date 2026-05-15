// Configurations défensives spécifiques aux remises en jeu.
//
// Sur un step inbound, le coach peut choisir une stratégie défensive
// au-delà du man-to-man standard. Chaque mode produit un placement
// défensif distinct qui modélise l'intention basket :
//
//  - face-guard : nier la passe à un attaquant clé (shooter)
//  - deny-deny : nier toutes les lignes de passe
//  - zone-press : trap sur le passeur + lignes de passe + sweeper
//
// Le mode est appliqué via `defenseOverrides` posé sur le step.

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  InboundDefenseMode,
  Point,
} from '@/lib/types';
import { distance } from '@/lib/logic/geometry';

const PLAYER_RADIUS = 17;
const DENY_OFFSET_PX = 20;
const TRAP_OFFSET_PX = 26;

export interface InboundDefenseSetup {
  positions: Record<DefenderId, Point>;
  /** ID du défenseur qui "presse" le passeur (visualisable côté UI). */
  primaryPresser: DefenderId | null;
}

/**
 * Calcule les positions défensives selon le mode demandé sur une
 * remise en jeu donnée.
 *
 * Convention de matchups V1 : D1↔O1, D2↔O2, ... D5↔O5 (= ordre naturel).
 * Le matchup explicite peut diverger en cas de switches, mais pour les
 * inbounds on assume le placement initial.
 */
export function buildInboundDefenseSetup(params: {
  off: AttackerPositions;
  inbounder: AttackerId;
  mode: InboundDefenseMode;
  hoop: Point;
}): InboundDefenseSetup {
  const { off, inbounder, mode, hoop } = params;
  const passerPos = off[inbounder];
  const positions = {} as Record<DefenderId, Point>;
  let primaryPresser: DefenderId | null = null;

  (Object.keys(off) as AttackerId[]).forEach((oId, i) => {
    const dId = `D${i + 1}` as DefenderId;
    const att = off[oId];
    if (!att) return;

    if (oId === inbounder) {
      // Défenseur du passeur : presse-cible pour tous les modes.
      // Position : devant le passeur, à l'intérieur du terrain
      // (= entre le passeur et le panier).
      const dx = hoop.x - att.x;
      const dy = hoop.y - att.y;
      const len = Math.hypot(dx, dy) || 1;
      const offset =
        mode === 'zone-press' ? PLAYER_RADIUS * 1.5 : PLAYER_RADIUS * 2.0;
      positions[dId] = {
        x: att.x + (dx / len) * offset,
        y: att.y + (dy / len) * offset,
      };
      primaryPresser = dId;
      return;
    }

    switch (mode) {
      case 'man':
        // Standard : entre l'attaquant et le panier, à 38 px.
        positions[dId] = manPos(att, hoop, 38);
        return;
      case 'face-guard':
        // Si c'est l'attaquant le plus proche du passeur (= 1er
        // receveur potentiel, shooter), face-guard (= regard vers
        // attaquant, position ENTRE lui et le passeur).
        // Autres défenseurs : man-to-man standard.
        if (isPrimaryReceiver(oId, off, inbounder)) {
          positions[dId] = denyPos(att, passerPos, DENY_OFFSET_PX);
        } else {
          positions[dId] = manPos(att, hoop, 38);
        }
        return;
      case 'deny-deny':
        // Tous sur la ligne de passe directe : entre leur homme et
        // le passeur.
        positions[dId] = denyPos(att, passerPos, DENY_OFFSET_PX);
        return;
      case 'zone-press': {
        // Configuration trap : 2 défenseurs sur le passeur (déjà fait
        // pour D1 ; on ajoute D2 le plus proche). Les autres lignent
        // les passes principales. Dernier = sweeper arrière.
        // Convention V1 : D2 = 2e presser ; D3+D4 = denials ; D5 = sweeper.
        if (i === 1) {
          // 2e presser à côté du 1er
          const dx = passerPos.x - att.x;
          const dy = passerPos.y - att.y;
          const len = Math.hypot(dx, dy) || 1;
          positions[dId] = {
            x: passerPos.x - (dx / len) * TRAP_OFFSET_PX + 12, // léger décalage
            y: passerPos.y - (dy / len) * TRAP_OFFSET_PX,
          };
        } else if (i === 4) {
          // Sweeper arrière : au centre du terrain offensif.
          positions[dId] = {
            x: hoop.x,
            y: (hoop.y + att.y) / 2,
          };
        } else {
          // Denials
          positions[dId] = denyPos(att, passerPos, DENY_OFFSET_PX);
        }
        return;
      }
    }
  });

  return { positions, primaryPresser };
}

// ============================================================
// Helpers
// ============================================================

function manPos(att: Point, hoop: Point, distPx: number): Point {
  const dx = hoop.x - att.x;
  const dy = hoop.y - att.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: att.x + (dx / len) * distPx,
    y: att.y + (dy / len) * distPx,
  };
}

function denyPos(att: Point, passer: Point, offsetPx: number): Point {
  // Sur la ligne de passe : entre att et passer, à `offsetPx` de att.
  const dx = passer.x - att.x;
  const dy = passer.y - att.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: att.x + (dx / len) * offsetPx,
    y: att.y + (dy / len) * offsetPx,
  };
}

/** Identifie le receveur principal (= attaquant le plus proche du passeur,
 *  hors-passeur). Utilisé pour face-guard. */
function isPrimaryReceiver(
  candidate: AttackerId,
  off: AttackerPositions,
  inbounder: AttackerId
): boolean {
  const passerPos = off[inbounder];
  let bestId: AttackerId | null = null;
  let bestDist = Infinity;
  (Object.keys(off) as AttackerId[]).forEach((id) => {
    if (id === inbounder) return;
    const p = off[id];
    if (!p) return;
    const d = distance(passerPos, p);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  });
  return bestId === candidate;
}
