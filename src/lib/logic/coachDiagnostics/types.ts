// Types partagés du moteur de diagnostics coach.
//
// `CoachDiagnostic` = une phrase courte dans le vocabulaire d'un coach
// ("low man tag", "skip ouvert", "mismatch après switch") avec metadata
// pour filtrage/highlight UI.
//
// `RuleContext` = données pré-calculées une seule fois par étape, partagées
// entre toutes les règles du registry. Évite de recalculer `effectiveDefensePositions`
// ou `getActiveDefenderIds` dans chaque règle.

import type {
  AppState,
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
} from '../../types';

export type CoachSeverity = 'good' | 'info' | 'warning' | 'critical';

export interface CoachDiagnostic {
  id: string;
  severity: CoachSeverity;
  /** Phrase courte en vocabulaire coach. */
  message: string;
  /** Tag stable (ex: 'closeout-long', 'low-man-tag'). Sert au grouping/filtrage. */
  tag: string;
  defenders: DefenderId[];
  attackers: AttackerId[];
}

/** Contexte pré-calculé fourni à chaque règle. Toutes les valeurs sont
 *  cohérentes pour l'étape `stepIdx` du `state`. */
export interface RuleContext {
  state: AppState;
  stepIdx: number;
  off: AttackerPositions;
  carrier: AttackerId;
  carrierPos: Point;
  /** -1 gauche, 0 centre, 1 droite — côté du porteur par rapport au panier. */
  carrierSide: -1 | 0 | 1;
  defPos: ComputedDefense;
  defenderIds: DefenderId[];
  hoop: Point;
  /** Profils offensifs (`attackerProfiles` du state). Peut être undefined si
   *  l'utilisateur n'a pas customisé les rôles. */
  profiles: AppState['attackerProfiles'];
  /** Step courant (raccourci pour state.steps[stepIdx]). Garanti non-null. */
  cur: AppState['steps'][number];
}

/**
 * Une règle = fonction pure qui produit zéro, un ou plusieurs diagnostics
 * pour l'étape courante. Toute règle DOIT être pure (pas de side-effect,
 * pas de mutation de ctx) — c'est ce qui permet de les composer librement
 * et de les tester unitairement.
 */
export type Rule = (ctx: RuleContext) => CoachDiagnostic[];
