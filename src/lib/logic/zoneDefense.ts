import type {
  Point,
  AttackerId,
  DefenderId,
  AttackerPositions,
  ZoneLayout,
  ZoneConfig,
  ZoneRegion,
  ZoneType,
} from '../types';
import { HOOP } from '../data/court';
import { distance } from './geometry';
import { manTarget, carrierDefenderTarget } from './manDefense';
import { baseMatchups } from '../data/initial';
import { detectOverload, findCriticalZoneAttackers } from './zoneSituations';
import { detectBaselineDriveFromPositions, type BaselineDefenderInput } from './baselineDrive';
import { detectFreePathThreats, type FreePathThreat } from './threatResolution';

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Mapping diagnostic : pour chaque zone, liste les attaquants présents dans
 * son polygone (avec fallback "homePos le plus proche" si l'attaquant n'est
 * dans aucun polygone). Utilisé par la visu de couverture (ZoneCoverage.tsx)
 * — ce n'est PLUS la base du calcul des positions défensives.
 *
 * Le moteur (computeZoneTargets) raisonne maintenant en ownership continu
 * basé sur la distance aux homePos, ce qui élimine les téléportations aux
 * frontières de polygone.
 */
export function mapAttackersToZones(
  off: AttackerPositions,
  layout: ZoneLayout
): Map<string, AttackerId[]> {
  const result = new Map<string, AttackerId[]>();
  layout.forEach((z) => result.set(z.id, []));

  (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
    let bestZone: ZoneRegion | null = null;
    let bestDist = Infinity;
    for (const zone of layout) {
      if (pointInPolygon(pos, zone.polygon)) {
        bestZone = zone;
        break;
      }
      const d = distance(pos, zone.homePos);
      if (d < bestDist) {
        bestDist = d;
        bestZone = zone;
      }
    }
    if (bestZone) {
      result.get(bestZone.id)!.push(oId);
    }
  });

  return result;
}

export interface ZoneDefenderTarget {
  x: number;
  y: number;
  zoneId: string;
  isRotating: boolean;
  trackedAttacker: AttackerId | null;
}

/**
 * Portée gaussienne de référence (px). À cette distance du homePos, un
 * attaquant produit ~37% du claim max. À 2× cette distance → ~2%.
 * Au-delà, le défenseur est en pratique désengagé. Surchargeable par
 * région via `ZoneRegion.radius`.
 */
const BASE_REACH = 200;

/** Largeur du demi-terrain (px). Centre vertical = COURT_CENTER_X. */
const COURT_CENTER_X = 300;

/**
 * Paramètres tactiques par type de zone. Pondèrent le calcul des "claims"
 * (intérêt d'un défenseur pour chaque attaquant) selon les principes
 * spécifiques à chaque formation. Tout le moteur reste générique : seules
 * ces 4 valeurs changent par type, et c'est suffisant pour différencier
 * 2-3 (back-3 protègent, top-2 pression) de 1-3-1 (point top, baseline
 * rotative) de match-up (man-like dans la zone).
 */
interface ZoneTactic {
  /** Bonus pour le matchup naturel (D3↔O3). 1.0 = neutre, >1 = préfère */
  naturalBonus: number;
  /** Bonus quand l'attaquant est le porteur (pression ballon globale). */
  carrierBonus: number;
  /** Force du shift ball-side appliqué au homePos. 0 = pas d'aide,
   *  0.5 = aide forte. Le défenseur faible-côté reçoit le shift complet,
   *  le fort-côté seulement 30%, le central 60%. */
  ballSideHelp: number;
  /** Multiplicateur sur BASE_REACH. >1 = défenseurs plus élastiques. */
  reachMultiplier: number;
}

const DEFAULT_TACTIC: ZoneTactic = {
  naturalBonus: 1.2,
  carrierBonus: 1.4,
  ballSideHelp: 0.4,
  reachMultiplier: 1.0,
};

const TACTICS: Record<ZoneType, ZoneTactic> = {
  // 2-3 : front-2 pressent dehors, back-3 protègent la peinture avec
  // glissement ball-side. Reach standard, aide ball-side soutenue.
  'zone-2-3': {
    naturalBonus: 1.2,
    carrierBonus: 1.5,
    ballSideHelp: 0.5,
    reachMultiplier: 1.0,
  },
  // 3-2 : front-3 sur le périmètre (pression à l'arc), back-2 protègent
  // la raquette. Reach légèrement compressé pour rester serré ; ball-side
  // help discret car le top-3 couvre déjà la rotation horizontale.
  'zone-3-2': {
    naturalBonus: 1.3,
    carrierBonus: 1.6,
    ballSideHelp: 0.35,
    reachMultiplier: 0.95,
  },
  // 1-3-1 : point-top fait la pression seule, le milieu doit beaucoup
  // glisser ball-side, et la baseline pivote fortement. Aide élevée.
  'zone-1-3-1': {
    naturalBonus: 1.15,
    carrierBonus: 1.4,
    ballSideHelp: 0.6,
    reachMultiplier: 1.05,
  },
  // 2-1-2 : front-2 + post haut + back-2. Comportement proche de 2-3 mais
  // avec un défenseur central qui ferme le high-post.
  'zone-2-1-2': {
    naturalBonus: 1.2,
    carrierBonus: 1.5,
    ballSideHelp: 0.5,
    reachMultiplier: 1.0,
  },
  // Match-up : hybride zone/individuelle. Bonus naturel très fort —
  // chaque défenseur "colle" son joueur tant qu'il reste à portée.
  'zone-matchup': {
    naturalBonus: 2.0,
    carrierBonus: 1.3,
    ballSideHelp: 0.25,
    reachMultiplier: 1.0,
  },
};

/**
 * Décale le homePos vers le côté du ballon. Asymétrique : le défenseur
 * faible-côté glisse beaucoup (× 1.0), le fort-côté peu (× 0.3) — il est
 * déjà près du ballon —, le central modérément (× 0.6). Plafonné à 80px
 * pour ne pas sortir un défenseur de sa zone.
 */
function ballSideShifted(home: Point, ballPos: Point, helpFactor: number): Point {
  const ballOffset = ballPos.x - COURT_CENTER_X;
  const homeOffset = home.x - COURT_CENTER_X;
  const homeIsCenter = Math.abs(homeOffset) < 30;
  let sideMult: number;
  if (homeIsCenter) sideMult = 0.6;
  else if (Math.sign(homeOffset) === Math.sign(ballOffset)) sideMult = 0.3;
  else sideMult = 1.0;
  const shiftX = Math.max(-80, Math.min(80, ballOffset * helpFactor * 0.4 * sideMult));
  return { x: home.x + shiftX, y: home.y };
}

/**
 * Calcule les positions cibles des défenseurs en zone, avec un moteur
 * 100% continu (zéro seuil binaire) :
 *
 * 1. Pour chaque (défenseur, attaquant), un "claim" gaussien :
 *      claim = exp(-(d/reach)²) × naturalBonus × carrierBonus
 *    Plus de pointInPolygon → plus de saut de priorité aux frontières.
 *
 * 2. Pour chaque attaquant, on normalise les claims des 5 défenseurs en
 *    parts d'ownership (sommant à 1). C'est la "compétition" pour cet
 *    attaquant : si deux défenseurs sont équidistants, ils ont 0.5/0.5.
 *
 * 3. Chaque défenseur prend pour primary l'attaquant qu'il possède le
 *    plus, et son engagement = sa part. Contesté = engagement modéré,
 *    dominant = engagement fort. Pas de seuil → pas de téléportation.
 *
 * Les paramètres tactiques (TACTICS) modulent ces claims selon le type
 * de zone : un 1-3-1 sage davantage ball-side qu'un match-up, un 3-2
 * pressente plus le porteur qu'un 2-3, etc.
 */
export function computeZoneTargets(
  off: AttackerPositions,
  ballCarrier: AttackerId,
  layout: ZoneLayout,
  config: ZoneConfig,
  defenseDistance: number,
  hoop: Point = HOOP
): Record<DefenderId, ZoneDefenderTarget> {
  const tactic = TACTICS[config.type] ?? DEFAULT_TACTIC;
  const ballPos = off[ballCarrier];
  const ballPressureFactor = config.ballPressure / 100;
  // paintCoverage : 0 = aucun boost zones-tueuses, 50 = défaut, 100 = max.
  // On dérive un facteur 0..1.5 utilisé pour moduler criticalMult et bias home.
  const paintCoverageFactor = (config.paintCoverage ?? 50) / 50;
  // rimProtection : 0 = aucune réaction "free path", 50 = défaut, 100 = max.
  const rimProtectionFactor = (config.rimProtection ?? 50) / 50;

  // P3 — Situations tactiques de zone :
  //  - overload côté ballon (3+ attaquants) → boost le glissement collectif.
  //  - short corner / high post → boost le claim sur ces attaquants pour
  //    forcer la couverture de ces "trous" classiques de zone.
  const overload = detectOverload(off, ballCarrier, hoop);
  const effectiveBallSideHelp =
    tactic.ballSideHelp * (1 + overload.intensity * 0.6);
  const criticalAttackers = findCriticalZoneAttackers(off, hoop);
  const criticalIds = new Set(criticalAttackers.map((c) => c.attackerId));

  // P3.b — Détecter quels attaquants critiques sont ISOLÉS : aucun
  // coéquipier dans un rayon de 80px. Un attaquant isolé en zone-tueuse
  // (high-post seul, short-corner sans aide) crée un trou que la zone
  // doit fermer avec un défenseur "désigné" — voir designatedCoverer ci-dessous.
  const ISOLATED_RADIUS_PX = 80;
  const isolatedIds = new Set<AttackerId>();
  criticalAttackers.forEach((c) => {
    const hasNeighbor = (Object.entries(off) as [AttackerId, Point][]).some(
      ([oId, pos]) => oId !== c.attackerId && distance(pos, c.pos) < ISOLATED_RADIUS_PX
    );
    if (!hasNeighbor) isolatedIds.add(c.attackerId);
  });

  // P3.b — Pour chaque attaquant critique ISOLÉ, on désigne UN seul défenseur
  // couvreur (celui dont le homePos est le plus proche). Plutôt que de
  // booster équitablement les claims de tous les défenseurs (ce qui dilue
  // l'ownership et empêche l'engagement), on concentre le boost fort (×4)
  // sur le couvreur désigné et on laisse les autres à un boost faible (×1.2)
  // pour ne pas créer de compétition. Effet : la zone "désigne" un défenseur
  // qui ferme le trou, comme dans une vraie zone-2-3 où le pivot remonte
  // sur le high-post pendant que les autres tiennent leur poste.
  const designatedCoverer = new Map<AttackerId, DefenderId>();
  criticalAttackers.forEach((c) => {
    if (!isolatedIds.has(c.attackerId)) return;
    let bestD: DefenderId | null = null;
    let bestDist = Infinity;
    layout.forEach((z) => {
      const d = distance(z.homePos, c.pos);
      if (d < bestDist) {
        bestDist = d;
        bestD = z.assignedTo;
      }
    });
    if (bestD) designatedCoverer.set(c.attackerId, bestD);
  });

  // (rim-threats déclarés ici, calculés plus bas après les autres designations)
  const rimThreats: FreePathThreat[] = [];
  const rimProtectorByThreat = new Map<AttackerId, DefenderId>();

  // P3.d — Désigner un "ball-pressure coverer" : LE défenseur structurellement
  // responsable de presser le porteur. Sans ça, le moteur ownership pur peut
  // laisser le porteur seul (cas top-of-arc central : D1 et D2 restent à
  // mi-chemin, aucun ne sort à 5m du porteur).
  //
  // Heuristique :
  //  - Ballon "haut" (vert > 100px du panier) → front-row pressure (les guards).
  //  - Ballon "bas" (vert <= 100px) → back-row pressure (wings/pivot).
  //  Front-row détecté par homePos.y (max) > médiane y des homePos.
  //  Parmi candidats : préférer le défenseur naturel (baseMatchups), sinon
  //  le plus proche latéralement du porteur.
  let ballPressureCoverer: DefenderId | null = null;
  if (ballPos) {
    const verticalFromHoop = Math.abs(ballPos.y - hoop.y);
    const ballHigh = verticalFromHoop > 100;
    // On dérive la médiane de y des homePos pour identifier front vs back.
    const homePosYs = layout.map((z) => Math.abs(z.homePos.y - hoop.y));
    const sortedYs = [...homePosYs].sort((a, b) => a - b);
    const medianY = sortedYs[Math.floor(sortedYs.length / 2)];
    const candidates = layout.filter((zone) => {
      const isFrontRow = Math.abs(zone.homePos.y - hoop.y) > medianY;
      return ballHigh ? isFrontRow : !isFrontRow;
    });
    if (candidates.length > 0) {
      // En zone, c'est le défenseur du MÊME CÔTÉ que le ballon qui prend la
      // sortie, pas le matchup naturel (la zone absorbe le porteur). On
      // filtre d'abord par côté ; si vide (ballon central), tous candidats
      // restent en course. Puis on prend le plus proche latéralement.
      const ballSide = Math.sign(ballPos.x - COURT_CENTER_X);
      const sameSide =
        ballSide === 0
          ? candidates
          : candidates.filter(
              (zone) => Math.sign(zone.homePos.x - COURT_CENTER_X) === ballSide
            );
      const finalCandidates = sameSide.length > 0 ? sameSide : candidates;
      const sorted = [...finalCandidates].sort(
        (a, b) => Math.abs(a.homePos.x - ballPos.x) - Math.abs(b.homePos.x - ballPos.x)
      );
      ballPressureCoverer = sorted[0].assignedTo;
    }
  }

  // P3.c — Réaction zone à un drive ligne de fond. Si le porteur est dans
  // la bande baseline (deep corner / short corner / shallow penetration) ET
  // qu'aucun défenseur n'est sur le couloir d'attaque carrier→panier, on
  // désigne le défenseur le plus proche du couloir (par homePos) comme
  // "couvreur baseline". On lui appliquera plus bas un boost concentré sur
  // sa claim au porteur, comme pour le high-post isolé. La détection utilise
  // les homePos (proxy structurel) car les positions effectives ne sont pas
  // encore calculées à ce stade.
  let baselineDriveCoverer: DefenderId | null = null;
  if (ballPos) {
    const homePosByDef: Record<string, BaselineDefenderInput> = {};
    layout.forEach((zone) => {
      homePosByDef[zone.assignedTo] = { x: zone.homePos.x, y: zone.homePos.y };
    });
    const baseline = detectBaselineDriveFromPositions(
      ballCarrier,
      ballPos,
      null,
      hoop,
      homePosByDef
    );
    if (baseline?.uncovered && baseline.closer) {
      baselineDriveCoverer = baseline.closer.id;
    }
  }

  // P3.e — "Pas d'easy basket" : détection des couloirs libres vers le panier.
  // Calculée APRÈS les autres désignations pour pouvoir exclure les défenseurs
  // déjà engagés ailleurs (high-post, baseline) du calcul de "qui ferme le
  // couloir". Sans cette exclusion, on considérerait à tort qu'un défenseur
  // "structurellement proche par homePos" mais en réalité dragué ailleurs
  // ferme la ligne.
  if (rimProtectionFactor > 0) {
    const homePosByDef: Record<string, BaselineDefenderInput> = {};
    layout.forEach((zone) => {
      homePosByDef[zone.assignedTo] = { x: zone.homePos.x, y: zone.homePos.y };
    });
    const unavailable = new Set<DefenderId>();
    designatedCoverer.forEach((dId) => unavailable.add(dId));
    if (baselineDriveCoverer) unavailable.add(baselineDriveCoverer);
    const threats = detectFreePathThreats(off, hoop, homePosByDef, unavailable);
    threats.forEach((t) => {
      if (t.designated) {
        rimThreats.push(t);
        rimProtectorByThreat.set(t.attacker, t.designated);
      }
    });
  }

  // P3.b — Bias homePos du couvreur désigné face à un high-post isolé.
  // En 2-3, D5 anchor à y=145 ne sort pas spontanément vers y=165 car son
  // home est trop bas. On shift son ancrage vers l'attaquant pour qu'il
  // monte naturellement, le boost critique fait le reste. Limité au
  // high-post (le short-corner est couvert par le wing low qui a son home
  // naturellement proche). Modulé par paintCoverageFactor : 0×=aucun shift,
  // 1×=shift normal (40%), 2×=shift fort (80% du chemin vers l'attaquant).
  const HIGH_POST_BIAS_WEIGHT = 0.4 * paintCoverageFactor;
  const homeBiasOverrides = new Map<DefenderId, Point>();
  criticalAttackers.forEach((c) => {
    if (c.zone !== 'high-post' || !isolatedIds.has(c.attackerId)) return;
    const dId = designatedCoverer.get(c.attackerId);
    if (!dId) return;
    const zone = layout.find((z) => z.assignedTo === dId)!;
    homeBiasOverrides.set(dId, {
      x: zone.homePos.x + (c.pos.x - zone.homePos.x) * HIGH_POST_BIAS_WEIGHT,
      y: zone.homePos.y + (c.pos.y - zone.homePos.y) * HIGH_POST_BIAS_WEIGHT,
    });
  });

  // P3.d — Bias homePos du ball-pressure coverer vers le porteur. Évite que
  // le défenseur naturel reste collé à son anchor quand le porteur est loin.
  // Modulé par ballPressureFactor (le slider "pression bal." existant) : 0%
  // = pas de shift (zone purement passive), 100% = 60% du chemin vers le
  // porteur. Skipé si déjà désigné high-post coverer (évite double-bias).
  if (ballPressureCoverer && ballPos && !homeBiasOverrides.has(ballPressureCoverer)) {
    const zone = layout.find((z) => z.assignedTo === ballPressureCoverer)!;
    const w = 0.3 + 0.3 * ballPressureFactor;
    homeBiasOverrides.set(ballPressureCoverer, {
      x: zone.homePos.x + (ballPos.x - zone.homePos.x) * w,
      y: zone.homePos.y + (ballPos.y - zone.homePos.y) * w,
    });
  }

  // P3.e — Bias homePos des rim-protectors vers la position d'interception
  // (mi-chemin entre l'attaquant menaçant et le panier). Pondéré par
  // l'urgence de la menace × rimProtectionFactor. Évite que le couvreur reste
  // à son ancrage normal quand un attaquant a un couloir libre.
  rimThreats.forEach((threat) => {
    const dId = threat.designated!;
    if (homeBiasOverrides.has(dId)) return; // priorité aux autres designations
    const zone = layout.find((z) => z.assignedTo === dId)!;
    // Position d'interception : à mi-chemin entre attaquant et panier.
    const intercept = {
      x: (threat.pos.x + hoop.x) / 2,
      y: (threat.pos.y + hoop.y) / 2,
    };
    const w = 0.4 * threat.urgency * rimProtectionFactor;
    homeBiasOverrides.set(dId, {
      x: zone.homePos.x + (intercept.x - zone.homePos.x) * w,
      y: zone.homePos.y + (intercept.y - zone.homePos.y) * w,
    });
  });

  // Pré-calcul du homePos shifté ball-side pour chaque zone (avec boost overload).
  const shiftedHomes = new Map<DefenderId, Point>();
  layout.forEach((zone) => {
    const baseHome = homeBiasOverrides.get(zone.assignedTo) ?? zone.homePos;
    const home = ballPos
      ? ballSideShifted(baseHome, ballPos, effectiveBallSideHelp)
      : baseHome;
    shiftedHomes.set(zone.assignedTo, home);
  });

  // Étape 1 — Claims continus.
  const claims = new Map<DefenderId, Map<AttackerId, number>>();
  layout.forEach((zone) => {
    const dId = zone.assignedTo;
    const home = shiftedHomes.get(dId)!;
    const naturalAtt = baseMatchups[dId];
    const reach = (zone.radius ?? BASE_REACH) * tactic.reachMultiplier;

    const dClaims = new Map<AttackerId, number>();
    (Object.entries(off) as [AttackerId, Point][]).forEach(([oId, pos]) => {
      const d = distance(pos, home);
      const proximity = Math.exp(-Math.pow(d / reach, 2));
      const naturalMult = oId === naturalAtt ? tactic.naturalBonus : 1.0;
      const carrierMult = oId === ballCarrier ? tactic.carrierBonus : 1.0;
      // P3 — Boost critique sur les zone-tueuses (high-post, short-corner).
      // Modulé par paintCoverageFactor (slider config) : 0=neutre, 1=défaut,
      // 2=agressif. Les valeurs ci-dessous sont les défauts à factor=1.
      //  - non-critique : 1.0 (pas de boost)
      //  - critique non isolé : 1.4 (boost modéré, partagé)
      //  - critique ISOLÉ + couvreur désigné : 4.0 (boost concentré)
      //  - critique ISOLÉ + non-désigné : 1.2 (faible attraction)
      // L'interpolation lerp(1.0, base, factor) garantit que factor=0 désactive
      // tout boost (1.0 = neutre) et que factor=2 amplifie linéairement.
      let criticalMult = 1.0;
      if (criticalIds.has(oId)) {
        let baseBoost: number;
        if (isolatedIds.has(oId)) {
          baseBoost = designatedCoverer.get(oId) === dId ? 4.0 : 1.2;
        } else {
          baseBoost = 1.4;
        }
        criticalMult = 1.0 + (baseBoost - 1.0) * paintCoverageFactor;
      }
      // P3.c — Boost baseline-drive : empilé sur le porteur uniquement quand
      // ce défenseur est désigné couvreur baseline ET qu'il n'est pas déjà
      // designatedCoverer (sinon double-comptage avec criticalMult). Effet :
      // le wing low côté ballon ferme la ligne avec une attraction très
      // concentrée sur le porteur, sans diluer.
      let baselineMult = 1.0;
      if (
        oId === ballCarrier &&
        baselineDriveCoverer === dId &&
        designatedCoverer.get(oId) !== dId
      ) {
        baselineMult = 1.0 + 2.0 * paintCoverageFactor;
      }
      // P3.d — Boost ball-pressure : LE défenseur désigné responsable de
      // presser le porteur reçoit ×2.5 sur sa claim au porteur. Empilé
      // seulement s'il n'est pas déjà critical/baseline (qui ont leurs
      // propres boosts). Modulé par ballPressureFactor : 0=neutre, 1=×2.5
      // complet. Effet : un défenseur sort SYSTÉMATIQUEMENT sur le porteur,
      // même si la géométrie pure ne le ferait pas naturellement.
      let pressureMult = 1.0;
      if (
        oId === ballCarrier &&
        ballPressureCoverer === dId &&
        designatedCoverer.get(oId) !== dId &&
        baselineDriveCoverer !== dId
      ) {
        pressureMult = 1.0 + 1.5 * ballPressureFactor;
      }
      // P3.e — Boost rim-protection : le défenseur désigné rim-protector pour
      // un attaquant avec couloir libre vers le panier reçoit un boost très
      // fort sur sa claim à cet attaquant. Force le défenseur à fermer la
      // ligne, peu importe son matchup. Empilé seulement si pas déjà
      // designatedCoverer/baseline (priorité aux assignations existantes).
      let rimMult = 1.0;
      const rimProtector = rimProtectorByThreat.get(oId);
      if (
        rimProtector === dId &&
        designatedCoverer.get(oId) !== dId &&
        baselineDriveCoverer !== dId &&
        !(oId === ballCarrier && ballPressureCoverer === dId)
      ) {
        const threat = rimThreats.find((t) => t.attacker === oId);
        const urgency = threat?.urgency ?? 0;
        rimMult = 1.0 + 3.0 * urgency * rimProtectionFactor;
      }
      dClaims.set(
        oId,
        proximity * naturalMult * carrierMult * criticalMult * baselineMult * pressureMult * rimMult
      );
    });
    claims.set(dId, dClaims);
  });

  // Étape 2 — Ownership normalisée par attaquant. Epsilon stabilise le
  // dénominateur quand tous les claims sont quasi-nuls (attaquant isolé).
  const ownership = new Map<DefenderId, Map<AttackerId, number>>();
  layout.forEach((z) => ownership.set(z.assignedTo, new Map()));
  (Object.keys(off) as AttackerId[]).forEach((oId) => {
    const totalClaim = layout.reduce(
      (sum, z) => sum + (claims.get(z.assignedTo)!.get(oId) ?? 0),
      0
    );
    const denom = totalClaim + 1e-6;
    layout.forEach((z) => {
      const c = claims.get(z.assignedTo)!.get(oId) ?? 0;
      ownership.get(z.assignedTo)!.set(oId, c / denom);
    });
  });

  // Étape 3 — Pour chaque défenseur, position cible = blend(home, tracking)
  // pondéré par sa part d'ownership sur le primary. Continu, pas de saut.
  const targets = {} as Record<DefenderId, ZoneDefenderTarget>;

  layout.forEach((zone) => {
    const dId = zone.assignedTo;
    const home = shiftedHomes.get(dId)!;
    const mode = zone.mode ?? 'auto';

    // Pression ballon globale additionnelle (le slider config.ballPressure
    // s'ajoute au ball-side help tactique). Tire le home vers le porteur.
    const homeShifted = ballPos
      ? {
          x: home.x + (ballPos.x - home.x) * ballPressureFactor * 0.15,
          y: home.y + (ballPos.y - home.y) * ballPressureFactor * 0.10,
        }
      : home;

    // Sélection du primary par max ownership.
    let primaryAttacker: AttackerId | null = null;
    let primaryShare = 0;
    (Object.keys(off) as AttackerId[]).forEach((oId) => {
      const share = ownership.get(dId)!.get(oId) ?? 0;
      if (share > primaryShare) {
        primaryShare = share;
        primaryAttacker = oId;
      }
    });

    // Seuil minimum d'engagement pour bouger : si on possède très peu
    // d'attaquants (tous les attaquants sont loin), on reste au home.
    // Abaissé à 0.08 quand le primary est en zone-tueuse (high-post,
    // short-corner) ou que ce défenseur est couvreur baseline désigné —
    // sinon les claims dilués par 5 défenseurs concurrents empêchent le
    // déclenchement même quand le boost critique est actif.
    const isPrimaryCritical =
      primaryAttacker !== null && criticalIds.has(primaryAttacker);
    const isBaselineCovererForCarrier =
      baselineDriveCoverer === dId && primaryAttacker === ballCarrier;
    const isPressureCovererForCarrier =
      ballPressureCoverer === dId && primaryAttacker === ballCarrier;
    const isRimProtectorForPrimary =
      primaryAttacker !== null && rimProtectorByThreat.get(primaryAttacker) === dId;
    const engagementThreshold =
      isPrimaryCritical ||
      isBaselineCovererForCarrier ||
      isPressureCovererForCarrier ||
      isRimProtectorForPrimary
        ? 0.08
        : 0.15;
    if (!primaryAttacker || primaryShare < engagementThreshold) {
      targets[dId] = {
        x: Math.round(homeShifted.x),
        y: Math.round(homeShifted.y),
        zoneId: zone.id,
        isRotating: false,
        trackedAttacker: null,
      };
      return;
    }

    let engagement = primaryShare;
    // Modulation par mode :
    // - agressif : +50% (capé à 1) → sortir vite et fort
    // - passif : ×0.5 → reste près du home
    // - trap : full track sur le porteur
    if (mode === 'agressif') engagement = Math.min(1, engagement * 1.5);
    else if (mode === 'passif') engagement *= 0.5;
    else if (mode === 'trap' && primaryAttacker === ballCarrier) engagement = 1;

    const primary: AttackerId = primaryAttacker;
    const attPos = off[primary];
    let trackedPos: Point;
    if (primary === ballCarrier) {
      const stance = mode === 'trap' ? 'bumper' : 'contester';
      trackedPos = carrierDefenderTarget(stance, attPos, defenseDistance, hoop) || home;
    } else if (config.type === 'zone-matchup') {
      trackedPos = manTarget(attPos, defenseDistance, hoop) || home;
    } else {
      trackedPos = manTarget(attPos, defenseDistance * 1.2, hoop) || home;
    }

    const blended = {
      x: homeShifted.x + (trackedPos.x - homeShifted.x) * engagement,
      y: homeShifted.y + (trackedPos.y - homeShifted.y) * engagement,
    };

    targets[dId] = {
      x: Math.round(blended.x),
      y: Math.round(blended.y),
      zoneId: zone.id,
      isRotating: false,
      // Affiche le matchup uniquement quand l'engagement est franc, pour
      // éviter les lignes qui clignotent sur les zones contestées.
      trackedAttacker: engagement > 0.4 ? primary : null,
    };
  });

  return targets;
}
