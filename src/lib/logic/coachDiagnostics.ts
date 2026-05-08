import type {
  AppState,
  AttackerId,
  DefenderId,
  ComputedDefense,
  AttackerPositions,
  OffensiveProfile,
  Point,
} from '../types';
import { distance } from './geometry';
import { effectiveDefensePositions, getDefenseHoop, getMatchupsAt } from './engine';
import { detectScreen } from './screens';
import { computeAttackerThreats } from './threats';

/** Étiquette courte du profil pour insérer dans les phrases coach. */
function profileTag(profile?: OffensiveProfile): string {
  switch (profile) {
    case 'shooter':     return 'tireur';
    case 'stretch-big': return 'stretch big';
    case 'slasher':     return 'slasher';
    case 'rim-roller':  return 'rim-roller';
    case 'creator':     return 'créateur';
    case 'non-shooter': return 'non-shooter';
    default:            return '';
  }
}

/** Marque un attaquant avec son profil entre parenthèses si défini. */
function withProfile(oId: AttackerId, profile?: OffensiveProfile): string {
  const tag = profileTag(profile);
  return tag ? `${oId} (${tag})` : oId;
}

/** Vrai si l'attaquant est un menace 3pts (shooter ou stretch-big). */
function isOutsideThreat(profile?: OffensiveProfile): boolean {
  return profile === 'shooter' || profile === 'stretch-big';
}

/**
 * Diagnostics coach automatiques — Itération 1 du chantier "lisibilité coach".
 *
 * Convertit l'état défensif calculé (positions, late, helpFactor, switches,
 * écrans détectés) en phrases courtes utilisant le vocabulaire d'un coach :
 * "low man tag", "corner abandonné", "closeout long", "skip ouvert",
 * "mismatch après switch". Pas de chiffres bruts sauf nécessaire — les pills
 * de MetricsBar font déjà ce job.
 *
 * Chaque diagnostic est tagué pour permettre filtres/évolutions, et porte
 * la liste des joueurs concernés pour permettre un highlight visuel dans
 * une itération future.
 */

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

const DEFENDER_IDS: DefenderId[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

/**
 * Côté terrain (-1 gauche, 0 centre, 1 droite) pour un point, basé sur la
 * coordonnée x du panier. Sert pour détecter "côté faible" / "côté ballon".
 */
function sideOf(p: Point, hoop: Point): -1 | 0 | 1 {
  const dx = p.x - hoop.x;
  if (Math.abs(dx) < 30) return 0;
  return dx > 0 ? 1 : -1;
}

/** Vrai si l'attaquant est dans un coin baseline (proche sideline + proche fond). */
function isCornerAttacker(pos: Point, hoop: Point): boolean {
  const distFromHoopY = Math.abs(pos.y - hoop.y);
  const distFromHoopX = Math.abs(pos.x - hoop.x);
  // Coin = à <100px du fond (verticalement vers le panier) ET à >180px latéralement
  return distFromHoopY < 100 && distFromHoopX > 180;
}

export function computeCoachDiagnostics(
  state: AppState,
  stepIdx: number
): CoachDiagnostic[] {
  const cur = state.steps[stepIdx];
  if (!cur) return [];
  const off: AttackerPositions = cur.off;
  const carrier: AttackerId = cur.ballCarrier;
  const carrierPos = off[carrier];
  const defPos: ComputedDefense = effectiveDefensePositions(state, stepIdx);
  const hoop = getDefenseHoop(state);
  const carrierSide = sideOf(carrierPos, hoop);
  const profiles = state.attackerProfiles;

  const out: CoachDiagnostic[] = [];

  // --------------------------------------------------------------------------
  // 1. Closeout long / over-closeout sur le porteur
  // --------------------------------------------------------------------------
  const carrierDef = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][])
    .find(([, p]) => p.matchedTo === carrier);
  if (carrierDef) {
    const [dId, p] = carrierDef;
    const carrierLabel = withProfile(carrier, profiles?.[carrier]);
    if (p.overClosed) {
      out.push({
        id: `over-closeout-${dId}`,
        severity: 'critical',
        message: `${dId} se fait déborder — over-closeout sur ${carrierLabel}`,
        tag: 'over-closeout',
        defenders: [dId],
        attackers: [carrier],
      });
    } else if (p.late && p.closingOut) {
      out.push({
        id: `closeout-late-${dId}`,
        severity: isOutsideThreat(profiles?.[carrier]) ? 'critical' : 'warning',
        message: isOutsideThreat(profiles?.[carrier])
          ? `Closeout long : ${dId} en retard sur ${carrierLabel} — tir 3 ouvert`
          : `Closeout long : ${dId} arrive en retard sur ${carrierLabel}`,
        tag: 'closeout-long',
        defenders: [dId],
        attackers: [carrier],
      });
    } else if (p.late) {
      out.push({
        id: `late-${dId}`,
        severity: 'warning',
        message: `${dId} en retard sur ${carrierLabel}`,
        tag: 'late',
        defenders: [dId],
        attackers: [carrier],
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. Mismatch après switch
  // --------------------------------------------------------------------------
  DEFENDER_IDS.forEach((dId) => {
    const p = defPos[dId];
    if (!p?.switchedThisStep) return;
    out.push({
      id: `switch-mismatch-${dId}`,
      severity: 'warning',
      message: `Switch : ${dId} sur ${withProfile(p.matchedTo, profiles?.[p.matchedTo])} — mismatch potentiel à attaquer`,
      tag: 'switch-mismatch',
      defenders: [dId],
      attackers: [p.matchedTo],
    });
  });

  // --------------------------------------------------------------------------
  // 3. Low-man tag manquant en pick-and-roll
  //    Si écran sur porteur détecté, le poseur d'écran est candidat au "roll"
  //    (mouvement vers le panier). Le low-man (défenseur back-side faible) doit
  //    le tagger. Si aucun défenseur ≠ screenerDef ≠ carrierDef à <130px du
  //    poseur ET côté faible, le tag est manquant.
  // --------------------------------------------------------------------------
  if (state.defenseSystem === 'man' && stepIdx >= 0) {
    const matchups = getMatchupsAt(state.steps, stepIdx - 1);
    const prevDef = (() => {
      const prev = {} as Record<DefenderId, Point>;
      DEFENDER_IDS.forEach((d) => {
        prev[d] = { x: defPos[d].x, y: defPos[d].y };
      });
      return prev;
    })();
    const screen = detectScreen(off, carrier, matchups, prevDef, state.screenRadius, cur.forcedScreener);
    if (screen) {
      const screenerPos = off[screen.screener];
      // Le poseur "roule" si proche du panier (≤180px) ou plus proche que le porteur.
      const screenerNearHoop = distance(screenerPos, hoop) < 180;
      if (screenerNearHoop) {
        // Trouve le défenseur le plus proche du poseur, hors carrierDef et screenerDef.
        let lowMan: DefenderId | null = null;
        let lowManDist = Infinity;
        DEFENDER_IDS.forEach((dId) => {
          if (dId === screen.carrierDef || dId === screen.screenerDef) return;
          const d = defPos[dId];
          const dd = distance({ x: d.x, y: d.y }, screenerPos);
          if (dd < lowManDist) {
            lowManDist = dd;
            lowMan = dId;
          }
        });
        const screenerLabel = withProfile(screen.screener, profiles?.[screen.screener]);
        if (lowMan && lowManDist > 130) {
          out.push({
            id: `tag-missing-${lowMan}`,
            severity: 'critical',
            message: `Low man tag absent : ${lowMan} laisse ${screenerLabel} rouler vers le panier`,
            tag: 'low-man-tag',
            defenders: [lowMan],
            attackers: [screen.screener],
          });
        } else if (lowMan && lowManDist > 90) {
          out.push({
            id: `tag-soft-${lowMan}`,
            severity: 'warning',
            message: `Tag mou : ${lowMan} pas assez agressif sur le roll de ${screenerLabel}`,
            tag: 'low-man-tag-soft',
            defenders: [lowMan],
            attackers: [screen.screener],
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. Corner faible abandonné — un coupeur en corner sans défenseur proche
  //    risque le skip pour 3pts ouvert.
  // --------------------------------------------------------------------------
  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    if (oId === carrier) return;
    const pos = off[oId];
    if (!isCornerAttacker(pos, hoop)) return;
    const attSide = sideOf(pos, hoop);
    // Côté faible = opposé au porteur. Si même côté que le ballon, c'est strong-corner.
    const isWeakCorner = attSide !== 0 && carrierSide !== 0 && attSide !== carrierSide;
    if (!isWeakCorner) return;
    // Distance au défenseur le plus proche.
    let nearestDist = Infinity;
    let nearestDef: DefenderId | null = null;
    DEFENDER_IDS.forEach((dId) => {
      const d = defPos[dId];
      const dd = distance({ x: d.x, y: d.y }, pos);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearestDef = dId;
      }
    });
    const isShooter = isOutsideThreat(profiles?.[oId]);
    const oLabel = withProfile(oId, profiles?.[oId]);
    if (nearestDist > 180) {
      out.push({
        id: `corner-open-${oId}`,
        severity: 'critical',
        message: isShooter
          ? `Corner faible abandonné : ${oLabel} libre — skip 3pts critique`
          : `Corner faible abandonné : ${oLabel} libre — fermer la passe`,
        tag: 'corner-open',
        defenders: nearestDef ? [nearestDef] : [],
        attackers: [oId],
      });
    } else if (nearestDist > 130) {
      out.push({
        id: `corner-help-${oId}`,
        severity: isShooter ? 'critical' : 'warning',
        message: isShooter
          ? `Ne quitte pas ${oLabel} en corner faible — skip 3 cher`
          : `Corner faible : ${oLabel} laissé large par ${nearestDef ?? '?'}`,
        tag: 'corner-help',
        defenders: nearestDef ? [nearestDef] : [],
        attackers: [oId],
      });
    }
  });

  // --------------------------------------------------------------------------
  // 5. Skip / passe ouverte vers menace forte (utilise le moteur threats)
  // --------------------------------------------------------------------------
  const threats = computeAttackerThreats(off, defPos, carrier, hoop, profiles);
  (Object.values(threats) as { attackerId: AttackerId; score: number; receivability: number; isCarrier: boolean }[])
    .forEach((t) => {
      if (t.isCarrier) return;
      if (t.receivability < 1) return; // déjà bloquée/contestée
      if (t.score < 0.42) return; // menace modérée seulement
      // Évite doublon avec corner-open déjà signalé
      const alreadyCorner = out.some((d) => d.tag.startsWith('corner-') && d.attackers.includes(t.attackerId));
      if (alreadyCorner) return;
      const targetLabel = withProfile(t.attackerId, profiles?.[t.attackerId]);
      out.push({
        id: `skip-${t.attackerId}`,
        severity: t.score > 0.55 ? 'critical' : 'warning',
        message: `Passe ouverte vers ${targetLabel} (${Math.round(t.score * 100)}%) — fermer la ligne`,
        tag: 'pass-open',
        defenders: [],
        attackers: [t.attackerId],
      });
    });

  // --------------------------------------------------------------------------
  // 6. Pénétration sans aide — porteur dans la raquette mais aide globale faible
  // --------------------------------------------------------------------------
  if (carrierPos) {
    const distH = distance(carrierPos, hoop);
    if (distH < 90) {
      const totalHelp = DEFENDER_IDS.reduce((s, d) => s + (defPos[d]?.helpFactor ?? 0), 0);
      // Aide insuffisante = total < 0.6 (chaque aide forte vaut ~0.4-0.7).
      if (totalHelp < 0.6) {
        out.push({
          id: 'paint-no-help',
          severity: 'critical',
          message: `Pénétration sans aide — raquette ouverte sur ${carrier}`,
          tag: 'paint-no-help',
          defenders: [],
          attackers: [carrier],
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 7. Bonne couverture si rien à signaler — feedback positif explicite
  // --------------------------------------------------------------------------
  if (out.length === 0) {
    out.push({
      id: 'all-good',
      severity: 'good',
      message: 'Couverture propre : porteur pressé, aide en place, corners tenus',
      tag: 'all-good',
      defenders: [],
      attackers: [],
    });
  }

  return out;
}
