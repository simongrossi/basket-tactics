// Détection des mismatches après switch + scram switch correctif.
//
// Concept basket :
//
//  Un switch crée un MISMATCH quand le défenseur résultant a une différence
//  de poste/gabarit significative avec son nouveau attaquant. Conventions :
//   - Rank 1 = meneur (petit, rapide)
//   - Rank 5 = pivot (grand, lent)
//   - Mismatch severity = |defenderRank(D) - attackerRank(A)|
//
//  Exemples :
//   - D5 sur O1 → severity 4 (énorme : pivot sur meneur, beat by drive)
//   - D1 sur O5 → severity 4 (énorme : meneur sur pivot, post-up garanti)
//   - D2 sur O3 → severity 1 (mineur : arrière sur ailier, acceptable)
//
//  Seuil par défaut : severity ≥ 2 = mismatch réel à traiter.
//
//  Le SCRAM SWITCH (NBA récent) est un 3ᵉ échange correctif : un défenseur
//  proche du mismatch vient prendre l'attaquant qui pose problème, et le
//  défenseur en mismatch part sur l'attaquant de ce scrameur. Restore des
//  matchups au moins partiellement.
//
//  Algorithme V1 :
//   1. Identifier la pire severity parmi le couple post-switch.
//   2. Chercher un défenseur tiers (≠ carrierDef, ≠ screenerDef) qui :
//        - est géographiquement proche du mismatch (≤ 200px)
//        - a un rank plus compatible avec le nouvel attaquant
//        - laisse un mismatch acceptable pour le défenseur swappé
//   3. Si amélioration totale ≥ threshold, appliquer le scram.

import type {
  AttackerId,
  AttackerPositions,
  DefenderId,
  DefenderPositions,
  DetectedScreen,
  Matchups,
  Point,
} from '../../types';
import { distance } from '../geometry';

// ---------------------------------------------------------------------------
// Rank helpers
// ---------------------------------------------------------------------------

/** Rang du défenseur (1 meneur → 5 pivot). Décodé depuis le numéro de
 *  l'identifiant. La convention naming est figée dans le moteur. */
export function defenderRank(id: DefenderId): number {
  return parseInt(id.slice(1), 10);
}

/** Rang de l'attaquant (1 meneur → 5 pivot). Mêmes conventions. */
export function attackerRank(id: AttackerId): number {
  return parseInt(id.slice(1), 10);
}

/** Severity du mismatch entre un défenseur et son attaquant marqué.
 *  Toujours ≥ 0. 0 = matchup naturel (D2 sur O2). 4 = pire (D1 sur O5). */
export function mismatchSeverity(d: DefenderId, a: AttackerId): number {
  return Math.abs(defenderRank(d) - attackerRank(a));
}

// ---------------------------------------------------------------------------
// Scram switch
// ---------------------------------------------------------------------------

export interface ScramSwitch {
  /** Le défenseur en mismatch qui se fait remplacer. */
  from: DefenderId;
  /** Le défenseur tiers qui scrame (vient prendre le mismatch). */
  to: DefenderId;
  /** L'attaquant que `to` reprend de `from`. */
  replacedOn: AttackerId;
  /** L'attaquant que `from` part marquer (= l'ancien matchup de `to`). */
  newAssignment: AttackerId;
  /** Severity AVANT le scram (sur from). */
  severityBefore: number;
  /** Severity APRÈS le scram (max des deux nouvelles paires). */
  severityAfter: number;
}

export interface ScramResult {
  matchups: Matchups;
  scram: ScramSwitch | null;
}

interface ScramOptions {
  /** Seuil minimal de severity pour considérer qu'il y a mismatch. Default 2. */
  threshold?: number;
  /** Distance max (px) entre le scrameur et l'attaquant à reprendre. Default 200. */
  maxScramDistance?: number;
}

/**
 * Cherche et applique un scram switch sur le matchup post-switch porteur.
 *
 * `matchups` doit déjà avoir le switch on-ball appliqué (cf. `applySwitch`).
 * On regarde la pire severity du couple {carrierDef, screenerDef} et on
 * cherche un défenseur tiers qui peut prendre l'attaquant exposé en
 * améliorant la somme des severities.
 *
 * Retourne `{ matchups: matchups inchangé, scram: null }` si pas de scram
 * applicable (pas de mismatch, pas de candidat viable, ou amélioration
 * insuffisante).
 */
export function applyScramSwitch(
  matchups: Matchups,
  screen: DetectedScreen,
  off: AttackerPositions,
  defenderPositions: DefenderPositions,
  options: ScramOptions = {}
): ScramResult {
  const threshold = options.threshold ?? 2;
  const maxScramDistance = options.maxScramDistance ?? 200;

  const carrierDef = screen.carrierDef;
  const screenerDef = screen.screenerDef;

  // Severities POST-switch (matchups est déjà swappé).
  const cdSeverity = mismatchSeverity(carrierDef, matchups[carrierDef]);
  const sdSeverity = mismatchSeverity(screenerDef, matchups[screenerDef]);

  // Pire mismatch : on prend celui-là pour scrameur. Tie-break basket :
  // quand les deux severities sont égales, on privilégie le côté qui défend
  // le PORTEUR (post-switch, c'est `screenerDef` puisque `applySwitch` a fait
  // matchups[screenerDef] = screen.carrier). Le porteur exploite plus vite
  // qu'un post-up donc c'est la menace prioritaire à corriger.
  let worstDef: DefenderId;
  if (cdSeverity > sdSeverity) {
    worstDef = carrierDef;
  } else if (sdSeverity > cdSeverity) {
    worstDef = screenerDef;
  } else {
    worstDef = screenerDef; // tie → côté porteur
  }
  const worstSeverity = Math.max(cdSeverity, sdSeverity);

  if (worstSeverity < threshold) {
    return { matchups, scram: null };
  }

  const exposedAtt = matchups[worstDef];
  const exposedAttPos = off[exposedAtt];
  if (!exposedAttPos) return { matchups, scram: null };

  // Chercher tous les défenseurs candidats (≠ paire du switch).
  const candidates = (Object.keys(matchups) as DefenderId[]).filter(
    (d) => d !== carrierDef && d !== screenerDef
  );

  let best: ScramSwitch | null = null;
  let bestImprovement = 0;

  for (const candidate of candidates) {
    const candidatePos = defenderPositions[candidate];
    if (!candidatePos) continue;

    // Distance géographique au mismatch : le scrameur doit être proche.
    const distToExposed = distance(candidatePos, exposedAttPos);
    if (distToExposed > maxScramDistance) continue;

    const candidateAtt = matchups[candidate];

    // Nouvelles severities après swap (worstDef ↔ candidate).
    const newSeverityCandidate = mismatchSeverity(candidate, exposedAtt);
    const newSeverityWorst = mismatchSeverity(worstDef, candidateAtt);

    // Métrique basket-correcte : on regarde la RÉDUCTION DU PIRE MISMATCH,
    // pas la somme. Un trade 4 → (2, 2) est un succès (le pivot ne défend
    // plus le meneur même si tout le monde a un mismatch léger). Mais un
    // trade 4 → (3, 1) qui pourrait sembler "égal" en somme reste utile :
    // la pire situation s'améliore.
    const oldMaxSeverity = Math.max(
      worstSeverity,
      mismatchSeverity(candidate, candidateAtt)
    );
    const newMaxSeverity = Math.max(newSeverityCandidate, newSeverityWorst);
    const improvement = oldMaxSeverity - newMaxSeverity;

    // Critères du scram :
    //  - amélioration nette d'au moins 2 sur le pire mismatch (équivalent :
    //    on dégrade au moins 2 catégories de mismatch sur le plus exposé)
    //  - le candidat lui-même ne doit pas créer un nouveau mismatch
    //    ≥ threshold sur son nouveau matchup (sinon on déplace le problème)
    if (improvement < 2) continue;
    // Filter STRICT : on rejette si le candidat lui-même créerait un nouveau
    // mismatch SUPÉRIEUR au seuil (déplacement de problème). Un candidat
    // qui se retrouve AU seuil est accepté tant qu'il améliore le pire cas.
    if (newSeverityCandidate > threshold) continue;

    if (improvement > bestImprovement) {
      bestImprovement = improvement;
      best = {
        from: worstDef,
        to: candidate,
        replacedOn: exposedAtt,
        newAssignment: candidateAtt,
        severityBefore: worstSeverity,
        severityAfter: Math.max(newSeverityCandidate, newSeverityWorst),
      };
    }
  }

  if (!best) return { matchups, scram: null };

  // Appliquer le scram : swap worstDef ↔ candidate.
  const next: Matchups = { ...matchups };
  next[best.from] = best.newAssignment;
  next[best.to] = best.replacedOn;

  return { matchups: next, scram: best };
}

/** Calcule la severity du mismatch courant pour CHAQUE défenseur, à partir
 *  du dictionnaire matchups final (post-switch + post-scram). Sert à
 *  alimenter `ComputedDefender.mismatchSeverity` pour la visu. */
export function computeAllMismatchSeverities(
  matchups: Matchups
): Record<DefenderId, number> {
  const out = {} as Record<DefenderId, number>;
  (Object.keys(matchups) as DefenderId[]).forEach((d) => {
    out[d] = mismatchSeverity(d, matchups[d]);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Switch policy (B8)
// ---------------------------------------------------------------------------

export type SwitchPolicy = 'all' | '1-3' | '1-4' | 'none';

/**
 * Détermine si un switch entre deux défenseurs est autorisé par la politique
 * de switch au niveau team. Filtre additionnel par-dessus `screenRule` :
 * permet au coach de configurer "switch entre guards seulement", "switch
 * sauf le pivot", etc.
 *
 *  - 'all'  : autorise toujours
 *  - '1-3'  : autorise si les deux défenseurs sont rank ≤ 3 (D1/D2/D3)
 *  - '1-4'  : autorise si aucun des deux n'est le pivot (D5)
 *  - 'none' : refuse toujours (override la rule 'switch')
 */
export function switchAllowed(
  policy: SwitchPolicy,
  d1: DefenderId,
  d2: DefenderId
): boolean {
  if (policy === 'all') return true;
  if (policy === 'none') return false;
  const r1 = defenderRank(d1);
  const r2 = defenderRank(d2);
  if (policy === '1-3') return r1 <= 3 && r2 <= 3;
  if (policy === '1-4') return r1 <= 4 && r2 <= 4;
  return true;
}
