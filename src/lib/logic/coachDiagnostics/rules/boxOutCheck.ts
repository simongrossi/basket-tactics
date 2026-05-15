// Règle coach — vérification du box-out sur les phases de rebond.
//
// Le box-out V2 anime déjà les défenseurs en mode live (game loop)
// après un tir. Cette règle complète en mode édition statique : sur
// les steps de phase de rebond (post-LF, post-shot annotés), elle
// vérifie que chaque défenseur est BIEN entre son homme et le panier
// et flag les défaillances.
//
// Phases de rebond détectées :
//  - Step actif avec context = 'free-throw' suivi d'un step sans LF
//    (= phase course-rebond ajoutée par F.2)
//  - Step actif labellé "rebond" / "rebound" / "course" / "miss"
//  - Le step précédent a context 'free-throw' (= on est en post-lancer)

import type { Rule } from '../types';

/** Tolérance en px : un défenseur peut être à -8 px (= légèrement
 *  derrière son homme) sans déclencher de warning. Au-delà = box-out
 *  raté. */
const BOX_OUT_TOLERANCE_PX = 8;

function isReboundPhase(state: { steps: Array<{ context?: string; label?: string }> }, stepIdx: number): boolean {
  const cur = state.steps[stepIdx];
  const prev = state.steps[stepIdx - 1];
  if (cur?.label) {
    const l = cur.label.toLowerCase();
    if (l.includes('rebond') || l.includes('rebound') || l.includes('course') || l.includes('manqué') || l.includes('miss')) {
      return true;
    }
  }
  if (prev?.context === 'free-throw') return true;
  return false;
}

export const boxOutCheckRule: Rule = (ctx) => {
  const { state, stepIdx, off, defPos, defenderIds, hoop } = ctx;
  if (!isReboundPhase(state, stepIdx)) return [];

  const failed: string[] = [];
  defenderIds.forEach((dId) => {
    const def = defPos[dId];
    if (!def) return;
    const matched = def.matchedTo;
    const att = off[matched];
    if (!att) return;
    // Box-out OK si distance defenseur→panier < distance attaquant→panier
    // (= défenseur "devant" l'attaquant en allant vers le panier).
    const defDist = Math.hypot(def.x - hoop.x, def.y - hoop.y);
    const attDist = Math.hypot(att.x - hoop.x, att.y - hoop.y);
    if (defDist > attDist + BOX_OUT_TOLERANCE_PX) {
      failed.push(`${dId}/${matched}`);
    }
  });

  if (failed.length === 0) {
    return [
      {
        id: `boxout-ok-${stepIdx}`,
        severity: 'info',
        message: `Phase de rebond : box-out OK sur ${defenderIds.length} défenseurs.`,
        tag: 'box-out-ok',
        defenders: [],
        attackers: [],
      },
    ];
  }
  return [
    {
      id: `boxout-missing-${stepIdx}`,
      severity: 'warning',
      message: `Box-out raté : ${failed.join(', ')} laisse l'attaquant entre eux et le panier. Ces défenseurs perdent le duel de rebond.`,
      tag: 'box-out-missing',
      defenders: failed.map((s) => s.split('/')[0] as ('D1' | 'D2' | 'D3' | 'D4' | 'D5')),
      attackers: failed.map((s) => s.split('/')[1] as ('O1' | 'O2' | 'O3' | 'O4' | 'O5')),
    },
  ];
};
