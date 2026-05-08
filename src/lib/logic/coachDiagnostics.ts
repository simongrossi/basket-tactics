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
import {
  effectiveDefensePositions,
  getDefenseHoop,
  getMatchupsAt,
  detectStepScreenAction,
} from './engine';
import {
  screenActionLabel,
  actionRequiresLowManTag,
  actionRequiresPopRecover,
  actionBreaksCoverage,
} from './screenAction';
import { computeAttackerThreats } from './threats';
import {
  detectOverload,
  findCriticalZoneAttackers,
  detectSkipPass,
} from './zoneSituations';
import { detectOffBallScreens } from './screens';
import { computeTacticalReads } from './tacticalReads';

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
  // 3. Pick-and-roll : action détectée + diagnostic adapté
  //    On utilise detectStepScreenAction qui retourne {screen, action} avec
  //    action.kind ∈ {roll, pop, slip, short-roll, ghost, reject, snake, re-screen}.
  //    Selon le type d'action, le diagnostic change :
  //      - roll/short-roll/slip → low-man tag exigé
  //      - pop/ghost            → recover du défenseur du screener (drop = ouvert)
  //      - reject/snake         → couverture cassée (basculer la lecture)
  //      - re-screen            → ne pas se déclasser, second écran à venir
  // --------------------------------------------------------------------------
  const detected = detectStepScreenAction(state, stepIdx);
  if (detected) {
    const { screen, action } = detected;
    const screenerLabel = withProfile(screen.screener, profiles?.[screen.screener]);
    const carrierLabel = withProfile(screen.carrier, profiles?.[screen.carrier]);

    // Couverture appliquée à cet écran — règle globale ou override individuel.
    const carrierDefRule = state.rules[screen.carrierDef];
    const coverage =
      carrierDefRule?.screenNav && carrierDefRule.screenNav !== 'auto'
        ? carrierDefRule.screenNav
        : state.screenRule;

    // Diagnostics spécifiques par couverture.
    if (coverage === 'ice') {
      // Ice efficace = porteur forcé baseline (drive vers le coin/sideline,
      // pas vers le middle). Détection : à l'étape suivante, le porteur a
      // bougé latéralement vers l'extérieur (loin de l'axe panier).
      const nextStep = state.steps[stepIdx + 1];
      if (nextStep) {
        const carrierThis = off[screen.carrier];
        const carrierNext = nextStep.off[screen.carrier];
        if (carrierThis && carrierNext) {
          const wentBaseline =
            Math.abs(carrierNext.x - hoop.x) > Math.abs(carrierThis.x - hoop.x) + 20;
          const wentMiddle =
            Math.abs(carrierNext.x - hoop.x) < Math.abs(carrierThis.x - hoop.x) - 20;
          if (wentMiddle) {
            out.push({
              id: 'ice-failed',
              severity: 'critical',
              message: `Ice cassé : ${carrierLabel} prend le middle malgré la consigne no-middle`,
              tag: 'ice-failed',
              defenders: [screen.carrierDef],
              attackers: [screen.carrier],
            });
          } else if (wentBaseline) {
            out.push({
              id: 'ice-ok',
              severity: 'good',
              message: `Ice tenu : ${carrierLabel} forcé baseline`,
              tag: 'ice-ok',
              defenders: [screen.carrierDef],
              attackers: [screen.carrier],
            });
          }
        }
      }
    }

    if (coverage === 'weak') {
      // Weak vs un porteur shooter = trou tactique. Le coach a choisi de
      // laisser le porteur shooter pour rester sur le screener.
      if (isOutsideThreat(profiles?.[screen.carrier])) {
        out.push({
          id: 'weak-vs-shooter',
          severity: 'warning',
          message: `Weak sur ${carrierLabel} — choix risqué vs un tireur`,
          tag: 'weak-vs-shooter',
          defenders: [screen.carrierDef],
          attackers: [screen.carrier],
        });
      }
    }

    if (coverage === 'peel-switch') {
      // Si le switch a été déclenché à cette étape, le porteur a passé.
      const fired =
        cur.switches?.some(([d1, d2]) =>
          (d1 === screen.carrierDef && d2 === screen.screenerDef) ||
          (d2 === screen.carrierDef && d1 === screen.screenerDef)
        ) ?? false;
      if (fired) {
        out.push({
          id: 'peel-fired',
          severity: 'info',
          message: `Peel switch déclenché : ${screen.screenerDef} prend ${carrierLabel}, ${screen.carrierDef} peel sur ${screenerLabel}`,
          tag: 'peel-fired',
          defenders: [screen.carrierDef, screen.screenerDef],
          attackers: [screen.carrier, screen.screener],
        });
      }
    }

    if (actionRequiresLowManTag(action.kind)) {
      // Avec les rotations P1, l'engine assigne déjà pnrRole='tag' au low-man
      // identifié. On lit ce flag pour savoir QUI doit tagger, et on regarde
      // s'il est `late` pour savoir si le tag est compromis.
      const tagger = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][])
        .find(([, p]) => p.pnrRole === 'tag');
      if (tagger) {
        const [tDef, tInfo] = tagger;
        if (tInfo.late) {
          out.push({
            id: `tag-late-${tDef}`,
            severity: 'critical',
            message: `${screenActionLabel(action.kind)} de ${screenerLabel} : ${tDef} en retard pour tagger`,
            tag: 'low-man-tag-late',
            defenders: [tDef],
            attackers: [screen.screener],
          });
        } else {
          out.push({
            id: `tag-ok-${tDef}`,
            severity: 'good',
            message: `${tDef} tag bien le ${screenActionLabel(action.kind)} de ${screenerLabel}`,
            tag: 'low-man-tag-ok',
            defenders: [tDef],
            attackers: [screen.screener],
          });
        }
      } else {
        // Pas de défenseur assigné : aucun candidat valable (ex. carrierDef et
        // screenerDef sont les seuls disponibles). Anomalie tactique — le
        // roller part en 1c0.
        out.push({
          id: 'tag-none',
          severity: 'critical',
          message: `${screenActionLabel(action.kind)} de ${screenerLabel} : aucun low-man disponible — roller libre`,
          tag: 'low-man-tag-none',
          defenders: [],
          attackers: [screen.screener],
        });
      }
    }

    // X-out : vérifier l'état du défenseur en rotation X-out.
    const xOuter = (Object.entries(defPos) as [DefenderId, ComputedDefense[DefenderId]][])
      .find(([, p]) => p.pnrRole === 'x-out');
    if (xOuter) {
      const [xDef, xInfo] = xOuter;
      if (xInfo.late) {
        out.push({
          id: `xout-late-${xDef}`,
          severity: 'warning',
          message: `X-out de ${xDef} en retard — passe skip ouverte`,
          tag: 'x-out-late',
          defenders: [xDef],
          attackers: [xInfo.matchedTo],
        });
      }
    }

    if (actionRequiresPopRecover(action.kind)) {
      const screenerPos = off[screen.screener];
      const sDef = defPos[screen.screenerDef];
      const distScreenerToDef = distance({ x: sDef.x, y: sDef.y }, screenerPos);
      // Pop ou ghost : le défenseur du screener doit être à distance de contest
      // (≤80px ≈ closeout). Au-delà, le 3pts est ouvert.
      const isShooter = isOutsideThreat(profiles?.[screen.screener]);
      if (distScreenerToDef > 80) {
        out.push({
          id: `pop-recover-${screen.screenerDef}`,
          severity: isShooter ? 'critical' : 'warning',
          message: isShooter
            ? `${screenActionLabel(action.kind)} de ${screenerLabel} — ${screen.screenerDef} à ${Math.round(distScreenerToDef)}px, tir 3 ouvert`
            : `${screenActionLabel(action.kind)} de ${screenerLabel} — ${screen.screenerDef} doit recover plus vite`,
          tag: 'pop-recover-late',
          defenders: [screen.screenerDef],
          attackers: [screen.screener],
        });
      }
    }

    if (actionBreaksCoverage(action.kind)) {
      out.push({
        id: `coverage-broken-${action.kind}`,
        severity: 'warning',
        message: `${screenActionLabel(action.kind)} de ${carrierLabel} — couverture initiale cassée, défense à relire`,
        tag: 'coverage-broken',
        defenders: [screen.carrierDef, screen.screenerDef],
        attackers: [screen.carrier, screen.screener],
      });
    }

    if (action.kind === 're-screen') {
      out.push({
        id: 're-screen',
        severity: 'info',
        message: `${screenerLabel} repose un écran sur ${carrierLabel} — ne pas relâcher la couverture`,
        tag: 're-screen',
        defenders: [screen.carrierDef, screen.screenerDef],
        attackers: [screen.carrier, screen.screener],
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3bis. Diagnostics spécifiques à la défense de zone (P3) :
  //   - overload côté ballon
  //   - short corner / high post non couverts
  //   - skip pass : rotation en retard détectée
  // --------------------------------------------------------------------------
  if (state.defenseSystem === 'zone') {
    const overload = detectOverload(off, carrier, hoop);
    if (overload.intensity > 0) {
      const sideLabel = overload.side === -1 ? 'gauche' : 'droite';
      out.push({
        id: 'zone-overload',
        severity: overload.intensity >= 1 ? 'warning' : 'info',
        message: `Overload côté ${sideLabel} (${overload.count} attaquants) — la zone doit glisser fort`,
        tag: 'zone-overload',
        defenders: [],
        attackers: [],
      });
    }

    // Short corner / high post couverture.
    const critical = findCriticalZoneAttackers(off, hoop);
    critical.forEach((c) => {
      // Trouve le défenseur le plus proche.
      let nearestDef: DefenderId | null = null as DefenderId | null;
      let nearestDist = Infinity;
      DEFENDER_IDS.forEach((dId) => {
        const d = defPos[dId];
        const dd = distance({ x: d.x, y: d.y }, c.pos);
        if (dd < nearestDist) {
          nearestDist = dd;
          nearestDef = dId;
        }
      });
      const oLabel = withProfile(c.attackerId, profiles?.[c.attackerId]);
      const zoneLabel = c.zone === 'short-corner' ? 'short corner' : 'high post';
      if (nearestDist > 100) {
        out.push({
          id: `critical-zone-${c.attackerId}`,
          severity: 'critical',
          message: `${zoneLabel} ouvert : ${oLabel} sans défenseur proche (${Math.round(nearestDist)}px)`,
          tag: c.zone === 'short-corner' ? 'short-corner-open' : 'high-post-open',
          defenders: nearestDef ? [nearestDef] : [],
          attackers: [c.attackerId],
        });
      } else if (nearestDist > 60) {
        out.push({
          id: `critical-zone-soft-${c.attackerId}`,
          severity: 'warning',
          message: `${zoneLabel} : ${oLabel} mou couvert par ${nearestDef ?? '?'} (${Math.round(nearestDist)}px)`,
          tag: c.zone === 'short-corner' ? 'short-corner-soft' : 'high-post-soft',
          defenders: nearestDef ? [nearestDef] : [],
          attackers: [c.attackerId],
        });
      }
    });

    // Skip pass : entre prev step et current.
    const prevStep = stepIdx > 0 ? state.steps[stepIdx - 1] : null;
    const skip = prevStep
      ? detectSkipPass(prevStep.off, off, prevStep.ballCarrier, carrier, hoop)
      : null;
    if (skip) {
      // Y a-t-il des défenseurs late ? La rotation est en retard si oui.
      const lateCount = DEFENDER_IDS.filter((dId) => defPos[dId]?.late).length;
      if (lateCount >= 2) {
        out.push({
          id: 'skip-rotation-late',
          severity: 'critical',
          message: `Skip pass — ${lateCount} défenseurs en retard sur la rotation`,
          tag: 'skip-rotation-late',
          defenders: DEFENDER_IDS.filter((dId) => defPos[dId]?.late),
          attackers: [carrier],
        });
      } else if (lateCount === 1) {
        out.push({
          id: 'skip-rotation-soft',
          severity: 'warning',
          message: `Skip pass — 1 défenseur en retard, fermer la ligne suivante`,
          tag: 'skip-rotation-soft',
          defenders: DEFENDER_IDS.filter((dId) => defPos[dId]?.late),
          attackers: [carrier],
        });
      } else {
        out.push({
          id: 'skip-rotation-ok',
          severity: 'good',
          message: `Skip pass : zone tournée à temps`,
          tag: 'skip-rotation-ok',
          defenders: [],
          attackers: [carrier],
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3ter. Écrans non-porteur (P4) : détecte les enchaînements (stagger,
  //   elevator, flex, hammer) ET signale les défenseurs late sur ces actions.
  //   Vocabulaire coach : "chase late on shooter", "hammer baseline ouvert",
  //   "stagger : prendre le 2ᵉ écran agressivement".
  // --------------------------------------------------------------------------
  if (state.defenseSystem === 'man') {
    const matchupsAt = getMatchupsAt(state.steps, stepIdx - 1);
    const prevDefMap = (() => {
      const m = {} as Record<DefenderId, Point>;
      DEFENDER_IDS.forEach((d) => {
        m[d] = { x: defPos[d].x, y: defPos[d].y };
      });
      return m;
    })();
    const offBallScreens = detectOffBallScreens(off, carrier, matchupsAt, prevDefMap, state.screenRadius);
    offBallScreens.forEach((obs) => {
      const cutterLabel = withProfile(obs.cutter, profiles?.[obs.cutter]);
      const cutterDef = defPos[obs.cutterDef];
      const cutterIsShooter = isOutsideThreat(profiles?.[obs.cutter]);
      const cutterDefLate = cutterDef?.late === true;

      switch (obs.type) {
        case 'stagger':
          out.push({
            id: `stagger-${obs.cutter}`,
            severity: cutterDefLate ? 'critical' : 'info',
            message: cutterDefLate
              ? `Stagger sur ${cutterLabel} : ${obs.cutterDef} en retard, double écran efficace`
              : `Stagger sur ${cutterLabel} : ${obs.cutterDef} doit chase agressif sur les 2 écrans`,
            tag: 'stagger',
            defenders: [obs.cutterDef, obs.screenerDef, obs.secondScreenerDef].filter(Boolean) as DefenderId[],
            attackers: [obs.cutter, obs.screener, obs.secondScreener].filter(Boolean) as AttackerId[],
          });
          break;
        case 'elevator':
          out.push({
            id: `elevator-${obs.cutter}`,
            severity: 'critical',
            message: `Elevator sur ${cutterLabel} : couloir entre ${obs.screener} et ${obs.secondScreener} — switch obligatoire`,
            tag: 'elevator',
            defenders: [obs.cutterDef, obs.screenerDef, obs.secondScreenerDef].filter(Boolean) as DefenderId[],
            attackers: [obs.cutter, obs.screener, obs.secondScreener].filter(Boolean) as AttackerId[],
          });
          break;
        case 'hammer':
          out.push({
            id: `hammer-${obs.cutter}`,
            severity: cutterIsShooter ? 'critical' : 'warning',
            message: cutterIsShooter
              ? `Hammer baseline : ${cutterLabel} libère un 3 corner faible — fermer impérativement`
              : `Hammer baseline sur ${cutterLabel} — coupe arrière côté faible`,
            tag: 'hammer',
            defenders: [obs.cutterDef, obs.screenerDef],
            attackers: [obs.cutter, obs.screener],
          });
          break;
        case 'flex':
          out.push({
            id: `flex-${obs.cutter}`,
            severity: 'warning',
            message: `Flex baseline : ${cutterLabel} coupe corner→corner — bumper obligatoire`,
            tag: 'flex',
            defenders: [obs.cutterDef, obs.screenerDef],
            attackers: [obs.cutter, obs.screener],
          });
          break;
        case 'pindown':
        case 'flare':
        case 'backscreen':
          // Diagnostics légers seulement si le défenseur du cutter est late.
          if (cutterDefLate) {
            const typeLabel =
              obs.type === 'pindown' ? 'pindown' :
              obs.type === 'flare' ? 'flare' : 'backscreen';
            out.push({
              id: `offball-late-${obs.cutter}`,
              severity: cutterIsShooter ? 'critical' : 'warning',
              message: `${typeLabel} sur ${cutterLabel} : ${obs.cutterDef} en retard${cutterIsShooter ? ' — tir 3 ouvert' : ''}`,
              tag: `offball-${obs.type}-late`,
              defenders: [obs.cutterDef, obs.screenerDef],
              attackers: [obs.cutter, obs.screener],
            });
          }
          break;
      }
    });
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
  // 7. Lectures offensives auto (P5) — opportunités à exploiter selon la
  //    couverture détectée. Préfixées "→" et tag "read-*" pour distinction
  //    visuelle. Concaténées au tableau principal.
  // --------------------------------------------------------------------------
  const reads = computeTacticalReads(state, stepIdx, defPos);
  out.push(...reads);

  // --------------------------------------------------------------------------
  // 8. Bonne couverture si rien à signaler — feedback positif explicite
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
