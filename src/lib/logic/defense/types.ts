// Types partagés entre les couches de calcul défensif. Centralisés ici pour
// éviter le ReturnType<typeof ...> circulaire et donner un nom clair.

import type { AttackerId, HelpPriority, Point } from '../../types';

/** Cible défensive "idéale" calculée par le moteur, AVANT contrainte de
 *  vitesse. C'est la sortie de `computeDefenseTargets` (man ou zone) et
 *  l'entrée de `effectiveDefensePositions`. */
export interface DefenderTarget {
  x: number;
  y: number;
  helpFactor: number;
  isCarrierDefender: boolean;
  matchedTo: AttackerId;
  onScreen: boolean;
  switchedThisStep: boolean;
  denying?: boolean;
  helpTriggered?: boolean;
  pnrRole?: 'tag' | 'x-out' | 'stunt';
  orientation: number;
  gazeOrientation: number;
  facing: Point;
  armBallSide: Point;
  armManSide: Point;
  helpAim?: Point;
  helpPriority?: HelpPriority;
  helpKind?: 'sag-weakside' | 'denial-strongside' | 'active-help' | 'none';
}
