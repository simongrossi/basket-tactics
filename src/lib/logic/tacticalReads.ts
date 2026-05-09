import type {
  AppState,
  AttackerId,
  DefenderId,
  ComputedDefense,
  OffensiveProfile,
  ScreenRule,
} from '../types';
import { detectStepScreenAction, getDefenseHoop } from './engine';
import { detectOverload, findCriticalZoneAttackers } from './zoneSituations';
import type { CoachDiagnostic, CoachSeverity } from './coachDiagnostics';
import { activeBallCarrier, activeOffense } from './players';

/**
 * Lectures offensives automatiques (P5) — module qui ne CRITIQUE pas la
 * défense mais qui POINTE LES OPPORTUNITÉS pour l'attaque, en fonction
 * de la couverture défensive détectée.
 *
 * Chaque lecture est un CoachDiagnostic avec :
 *  - `tag` préfixé `read-*`
 *  - `severity = 'info'` (sauf gros mismatch = 'warning')
 *  - message préfixé "→" pour distinction visuelle dans le bandeau coach
 *
 * Mapping couverture → lecture :
 *  - drop      → pull-up open pour le porteur
 *  - switch    → mismatch (guard vs big ou inverse)
 *  - hedge     → short roll 4v3 par le screener
 *  - ice       → reject + drive baseline
 *  - weak      → tir 3 du porteur (si shooter)
 *  - top-lock  → backdoor cut (off-ball)
 *  - blitz     → skip vers côté faible
 *  - over      → snake dribble (re-attaque sous l'écran)
 *
 *  - overload zone   → skip pass côté faible
 *  - short corner    → drop pass + tir court
 *  - high post       → flash high post, attaquer la raquette
 */

interface ProfileFlags {
  isGuardLike: boolean;   // creator / slasher / shooter
  isBigLike: boolean;     // rim-roller / stretch-big
  isShooter: boolean;     // shooter / stretch-big
}

function profileFlags(profile?: OffensiveProfile): ProfileFlags {
  return {
    isGuardLike: profile === 'creator' || profile === 'slasher' || profile === 'shooter',
    isBigLike: profile === 'rim-roller' || profile === 'stretch-big',
    isShooter: profile === 'shooter' || profile === 'stretch-big',
  };
}

function withProfile(oId: AttackerId, profile?: OffensiveProfile): string {
  const tag =
    profile === 'shooter'     ? 'tireur' :
    profile === 'stretch-big' ? 'stretch big' :
    profile === 'slasher'     ? 'slasher' :
    profile === 'rim-roller'  ? 'rim-roller' :
    profile === 'creator'     ? 'créateur' :
    profile === 'non-shooter' ? 'non-shooter' :
    '';
  return tag ? `${oId} (${tag})` : oId;
}

function read(
  id: string,
  message: string,
  tag: string,
  defenders: DefenderId[],
  attackers: AttackerId[],
  severity: CoachSeverity = 'info'
): CoachDiagnostic {
  return {
    id,
    severity,
    message: `→ ${message}`,
    tag,
    defenders,
    attackers,
  };
}

export function computeTacticalReads(
  state: AppState,
  stepIdx: number,
  defPos: ComputedDefense
): CoachDiagnostic[] {
  const cur = state.steps[stepIdx];
  if (!cur) return [];
  const off = activeOffense(cur.off, state.playerCount);
  const carrier = activeBallCarrier(cur, state.playerCount);
  const profiles = state.attackerProfiles;
  const hoop = getDefenseHoop(state);
  const out: CoachDiagnostic[] = [];

  // -----------------------------------------------------------------------
  // Lectures basées sur la couverture PnR détectée (defense system 'man')
  // -----------------------------------------------------------------------
  const detected = detectStepScreenAction(state, stepIdx);
  if (detected) {
    const { screen } = detected;
    const carrierDefRule = state.rules[screen.carrierDef];
    const coverage: ScreenRule =
      carrierDefRule?.screenNav && carrierDefRule.screenNav !== 'auto'
        ? carrierDefRule.screenNav
        : state.screenRule;

    const carrierP = profileFlags(profiles?.[screen.carrier]);
    const screenerP = profileFlags(profiles?.[screen.screener]);

    switch (coverage) {
      case 'drop': {
        if (carrierP.isShooter || carrierP.isGuardLike) {
          out.push(read(
            'read-drop-pullup',
            `Drop de ${screen.screenerDef} : pull-up ouvert pour ${withProfile(screen.carrier, profiles?.[screen.carrier])}`,
            'read-drop-pullup',
            [screen.screenerDef],
            [screen.carrier]
          ));
        }
        // Si le screener est un stretch big, pop dehors est une option.
        if (screenerP.isShooter) {
          out.push(read(
            'read-drop-pop',
            `Drop : pop ${withProfile(screen.screener, profiles?.[screen.screener])} à 3pts`,
            'read-drop-pop',
            [screen.screenerDef],
            [screen.screener]
          ));
        }
        break;
      }
      case 'switch': {
        // Mismatch guard sur big (carrier = guard, finalement marqué par
        // screenerDef = défenseur du big = en théorie un grand).
        // Mismatch big sur guard (screener = big, finalement marqué par
        // carrierDef = défenseur du porteur = en théorie un petit).
        // On ne connaît pas les profils défensifs ici, mais on peut au moins
        // pointer la possibilité.
        if (carrierP.isGuardLike) {
          out.push(read(
            'read-switch-drive',
            `Switch : ${withProfile(screen.carrier, profiles?.[screen.carrier])} attaque le mismatch en drive ou iso`,
            'read-switch-drive',
            [screen.screenerDef],
            [screen.carrier],
            'warning'
          ));
        }
        if (screenerP.isBigLike) {
          out.push(read(
            'read-switch-postup',
            `Switch : ${withProfile(screen.screener, profiles?.[screen.screener])} pose un post-up sur ${screen.carrierDef}`,
            'read-switch-postup',
            [screen.carrierDef],
            [screen.screener],
            'warning'
          ));
        }
        break;
      }
      case 'hedge': {
        out.push(read(
          'read-hedge-shortroll',
          `Hedge : short roll 4v3 par ${withProfile(screen.screener, profiles?.[screen.screener])} — passe pocket`,
          'read-hedge-shortroll',
          [screen.screenerDef],
          [screen.screener]
        ));
        break;
      }
      case 'ice': {
        out.push(read(
          'read-ice-reject',
          `Ice forcé : reject l'écran et drive baseline avec ${withProfile(screen.carrier, profiles?.[screen.carrier])}`,
          'read-ice-reject',
          [screen.carrierDef],
          [screen.carrier]
        ));
        break;
      }
      case 'weak': {
        if (carrierP.isShooter) {
          out.push(read(
            'read-weak-shoot',
            `Weak : ${withProfile(screen.carrier, profiles?.[screen.carrier])} tire ouvert au-dessus de l'écran`,
            'read-weak-shoot',
            [screen.carrierDef],
            [screen.carrier],
            'warning'
          ));
        }
        break;
      }
      case 'blitz': {
        out.push(read(
          'read-blitz-skip',
          `Blitz : passe rapide vers le côté faible (skip), 4v3 ouvert`,
          'read-blitz-skip',
          [screen.carrierDef, screen.screenerDef],
          [screen.carrier]
        ));
        break;
      }
      case 'over': {
        out.push(read(
          'read-over-snake',
          `Over : snake dribble pour repasser sous l'écran et exposer ${screen.carrierDef}`,
          'read-over-snake',
          [screen.carrierDef],
          [screen.carrier]
        ));
        break;
      }
      case 'peel-switch': {
        out.push(read(
          'read-peel-attack',
          `Peel switch : ${withProfile(screen.carrier, profiles?.[screen.carrier])} continue son drive avant que ${screen.screenerDef} ne switche`,
          'read-peel-attack',
          [screen.screenerDef],
          [screen.carrier]
        ));
        break;
      }
      case 'under': {
        if (carrierP.isShooter) {
          out.push(read(
            'read-under-pullup',
            `Under : pull-up 3 ouvert pour ${withProfile(screen.carrier, profiles?.[screen.carrier])}`,
            'read-under-pullup',
            [screen.carrierDef],
            [screen.carrier]
          ));
        }
        break;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Lectures spécifiques zone
  // -----------------------------------------------------------------------
  if (state.defenseSystem === 'zone') {
    const overload = detectOverload(off, carrier, hoop);
    if (overload.intensity > 0) {
      // Quand on overload, le côté faible est dégarni — skip pass libère un tir.
      out.push(read(
        'read-overload-skip',
        `Overload : skip pass vers côté faible (zone glissée, 4v3)`,
        'read-overload-skip',
        [],
        []
      ));
    }
    const critical = findCriticalZoneAttackers(off, hoop);
    critical.forEach((c) => {
      // Le défenseur le plus proche est-il loin ? Si oui, l'attaquant est libre.
      const oLabel = withProfile(c.attackerId, profiles?.[c.attackerId]);
      if (c.zone === 'short-corner') {
        out.push(read(
          `read-short-corner-${c.attackerId}`,
          `Short corner libre : drop pass vers ${oLabel} pour tir court`,
          'read-short-corner',
          [],
          [c.attackerId]
        ));
      } else {
        out.push(read(
          `read-high-post-${c.attackerId}`,
          `Flash high post : ${oLabel} reçoit, attaque la raquette ou trouve le coupeur`,
          'read-high-post',
          [],
          [c.attackerId]
        ));
      }
    });
  }

  // -----------------------------------------------------------------------
  // Lecture sur défenseur en retard (closeout long, late simple)
  // Si un défenseur du porteur est late, drive direct est une lecture.
  // -----------------------------------------------------------------------
  const carrierDef = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][])
    .find(([, p]) => p.matchedTo === carrier);
  if (carrierDef) {
    const [, p] = carrierDef;
    if (p.late && !p.overClosed) {
      out.push(read(
        'read-closeout-long-drive',
        `Closeout long : ${withProfile(carrier, profiles?.[carrier])} attaque le drive avant fermeture`,
        'read-closeout-long-drive',
        [],
        [carrier]
      ));
    } else if (p.overClosed) {
      out.push(read(
        'read-overclose-drive',
        `Over-closeout : ${withProfile(carrier, profiles?.[carrier])} déborde le défenseur, finition au cercle`,
        'read-overclose-drive',
        [],
        [carrier]
      ));
    }
  }

  return out;
}
