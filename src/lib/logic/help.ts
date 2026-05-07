import type { Point, DefenderRule, DetectedTriggers, AttackerPositions, AttackerId } from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';

export interface HelpResult {
  target: Point;
  helpFactor: number;
  /** True si le pull provient de la branche strong-side denial (et non de
   *  l'aide weak-side ou de la sag baseline). Permet au rendu de différencier
   *  visuellement les deux comportements. */
  denying?: boolean;
  /** True si le mouvement provient d'un trigger d'aide actif (drive/post/paint),
   *  par opposition au sag baseline weak-side qui est toujours là à
   *  petite intensité. Utilisé par HelpLines pour rendre visible la
   *  différence entre "aide active maintenant" vs "sag passif". */
  triggered?: boolean;
}

export function computeHelpTarget(
  manPos: Point,
  rule: DefenderRule,
  triggers: DetectedTriggers,
  carrierPos: Point,
  attPos: Point,
  ballSide: -1 | 0 | 1,
  allOff?: AttackerPositions,
  hoop: Point = HOOP,
  /** Intensité max du strong-side denial automatique. 0 = désactivé.
   *  Default 0.45 = comportement v1. */
  denyAggressiveness: number = 0.45
): HelpResult {
  const myAttSide = Math.sign(attPos.x - hoop.x) || 0;

  if (!triggers.any || rule.helpPct === 0) {
    if (rule.helpPct > 0 && ballSide !== 0 && myAttSide !== 0 && myAttSide !== ballSide) {
      const sagFactor = (rule.helpPct / 100) * 0.5;
      const sign = hoop.y > 540 ? -1 : 1; // sens panier→milieu (sag pousse vers le milieu)
      const aim = {
        x: (manPos.x + hoop.x) / 2 + (carrierPos.x - hoop.x) * 0.2,
        y: Math.max((manPos.y + hoop.y) / 2 + 20 * sign, carrierPos.y - 30 * sign),
      };
      return {
        target: {
          x: manPos.x + (aim.x - manPos.x) * sagFactor,
          y: manPos.y + (aim.y - manPos.y) * sagFactor,
        },
        helpFactor: sagFactor,
      };
    }

    // Strong-side denial automatique : un défenseur strong-side proche du
    // ballon glisse vers la ligne de passe (entre son homme et le porteur).
    // Dissuade la passe d'entrée. Conditions : pas de trigger actif (sinon
    // c'est l'aide qui prime), même côté que le ballon, à <250px du ballon
    // (≈ "à une passe"), et priority ≠ paint (les protecteurs gardent la
    // raquette quoi qu'il arrive).
    if (
      rule.priority !== 'paint' &&
      ballSide !== 0 &&
      myAttSide !== 0 &&
      myAttSide === ballSide &&
      denyAggressiveness > 0
    ) {
      const distAttBall = distance(attPos, carrierPos);
      if (distAttBall < 250) {
        const denyAim = {
          x: attPos.x + (carrierPos.x - attPos.x) * 0.35,
          y: attPos.y + (carrierPos.y - attPos.y) * 0.35,
        };
        const proximity = 1 - distAttBall / 250; // 1 (collé) → 0 (à la limite)
        const denyFactor = denyAggressiveness * proximity;
        return {
          target: {
            x: manPos.x + (denyAim.x - manPos.x) * denyFactor,
            y: manPos.y + (denyAim.y - manPos.y) * denyFactor,
          },
          helpFactor: denyFactor,
          denying: true,
        };
      }
    }

    return { target: manPos, helpFactor: 0 };
  }

  let sideFactor: number;
  if (ballSide === 0 || myAttSide === 0) sideFactor = 0.7;
  else if (myAttSide !== ballSide) sideFactor = 1;
  else sideFactor = 0.35;

  const helpFactor = (rule.helpPct / 100) * sideFactor;

  let aim: Point;
  switch (rule.priority) {
    case 'paint': {
      // Blocs bas : décalés DEPUIS le panier vers l'intérieur (sens dépendant
      // du panier de référence : vers le milieu en bas, vers le haut sinon).
      const intoCourtY = hoop.y > 540 ? -1 : 1;
      const leftBlock: Point = { x: hoop.x - 70, y: hoop.y + 80 * intoCourtY };
      const rightBlock: Point = { x: hoop.x + 70, y: hoop.y + 80 * intoCourtY };
      let bestDist = Infinity;
      let blockTarget: Point | null = null;
      if (allOff) {
        (Object.entries(allOff) as [AttackerId, Point][]).forEach(([, p]) => {
          const dL = distance(p, leftBlock);
          const dR = distance(p, rightBlock);
          const d = Math.min(dL, dR);
          if (d < bestDist && d < 120) {
            bestDist = d;
            blockTarget = p;
          }
        });
      }
      aim = blockTarget ?? { x: hoop.x, y: hoop.y + 60 * intoCourtY };
      break;
    }
    case 'passlane': {
      const mx = (attPos.x + carrierPos.x) / 2;
      const my = (attPos.y + carrierPos.y) / 2;
      aim = {
        x: mx + (carrierPos.x - mx) * 0.3,
        y: my + (carrierPos.y - my) * 0.3,
      };
      break;
    }
    case 'man': {
      // priority='man' = "stay close to your guy". Mais avec helpPct > 0
      // et un trigger actif, il faut quand même laisser un léger penchant
      // vers le panier (sinon helpPct=100 sur un défenseur priority=man
      // ne produit aucun mouvement, ce qui est contre-intuitif).
      // 30% du chemin man → panier. Avec helpPct=100/sideFactor=1 →
      // défenseur descend 30% du chemin vers le panier.
      aim = {
        x: manPos.x + (hoop.x - manPos.x) * 0.3,
        y: manPos.y + (hoop.y - manPos.y) * 0.3,
      };
      break;
    }
  }

  return {
    target: {
      x: manPos.x + (aim.x - manPos.x) * helpFactor,
      y: manPos.y + (aim.y - manPos.y) * helpFactor,
    },
    helpFactor,
    triggered: true,
  };
}
