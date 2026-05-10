import type {
  OffensiveScriptedAction,
  DefensiveActionType,
  DefensiveActionParams,
  AttackerId,
  DefenderId,
} from '@/lib/types';

const DEFAULT_ASSIGNMENT: Record<AttackerId, DefenderId> = {
  O1: 'D1', O2: 'D2', O3: 'D3', O4: 'D4', O5: 'D5',
};

/** Devine les defaults d'une directive défensive en fonction de l'action parent.
 *  Ces defaults sont des points de départ — l'utilisateur peut les éditer. */
export function inferDefensiveDefaults(
  defType: DefensiveActionType,
  parent: OffensiveScriptedAction,
): DefensiveActionParams {
  const p = parent.params;
  const carrier = p.ballHandler ?? p.driver ?? p.passer ?? p.giver ?? p.shooter ?? p.from;
  const screener = p.screener ?? p.firstScreener ?? p.cutter;

  switch (defType) {
    case 'trap': {
      // 2 défenseurs trappent le porteur : le défenseur du porteur + celui du screener
      const trappers: DefenderId[] = [];
      if (carrier) trappers.push(DEFAULT_ASSIGNMENT[carrier]);
      if (screener) trappers.push(DEFAULT_ASSIGNMENT[screener]);
      return { defenders: trappers, target: carrier };
    }
    case 'tag': {
      // low-man = défenseur d'un joueur autre que carrier/screener (heuristique)
      const others: AttackerId[] = (['O1','O2','O3','O4','O5'] as AttackerId[])
        .filter((o) => o !== carrier && o !== screener);
      const lowMan = others[0] ? DEFAULT_ASSIGNMENT[others[0]] : 'D4';
      return { defenders: [lowMan], target: screener };
    }
    case 'help-and-recover': {
      const helper: DefenderId = (carrier && carrier !== 'O1') ? 'D2' : 'D2';
      return { defenders: [helper], target: carrier };
    }
    case 'pre-switch':
    case 'switch':
    case 'peel-switch': {
      const d0 = carrier ? DEFAULT_ASSIGNMENT[carrier] : 'D1';
      const d1 = screener ? DEFAULT_ASSIGNMENT[screener] : 'D5';
      return { defenders: [d0], swapWith: d1, target: carrier };
    }
    case 'triple-switch': {
      const d0 = carrier ? DEFAULT_ASSIGNMENT[carrier] : 'D1';
      const d1 = screener ? DEFAULT_ASSIGNMENT[screener] : 'D5';
      // 3e défenseur : un autre que d0 et d1.
      const all: DefenderId[] = ['D1','D2','D3','D4','D5'];
      const d2 = all.find((d) => d !== d0 && d !== d1) ?? 'D3';
      return { defenders: [d0], swapWith: d1, thirdSwap: d2, target: carrier };
    }
    case 'over':
    case 'under':
    case 'ice':
    case 'closing-out': {
      // Couvertures portées par le défenseur du porteur (Di du porteur).
      const d0 = carrier ? DEFAULT_ASSIGNMENT[carrier] : 'D1';
      return { defenders: [d0], target: carrier };
    }
    case 'hedge':
    case 'flat-hedge':
    case 'drop': {
      // Couvertures portées par le défenseur du screener (big).
      const d0 = screener ? DEFAULT_ASSIGNMENT[screener] : 'D5';
      return { defenders: [d0], target: carrier };
    }
    case 'blitz': {
      // Comme trap : 2 défenseurs (porteur + screener) sur le porteur.
      const trappers: DefenderId[] = [];
      if (carrier) trappers.push(DEFAULT_ASSIGNMENT[carrier]);
      if (screener) trappers.push(DEFAULT_ASSIGNMENT[screener]);
      return { defenders: trappers, target: carrier };
    }
  }
}
