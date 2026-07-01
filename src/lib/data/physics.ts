/**
 * Module centralisateur des constantes physiques du moteur.
 *
 * Cinématique, dimensions joueur/ballon, seuils de contact, vitesses par
 * poste, échelle de conversion mètres ↔ pixels. Toute valeur physique du
 * moteur DOIT vivre ici (sauf les dimensions du terrain qui restent dans
 * `data/court.ts` car structurelles à FIBA).
 *
 * Convention de nommage :
 *  - `*_PX`        : valeur en pixels SVG (échelle interne).
 *  - `*_M`         : valeur en mètres réels (FIBA / réel).
 *  - `DEFAULT_*`   : valeur par défaut au démarrage (modifiable via state).
 *  - `MAX_SPEED_*` : déplacement max par étape (px/étape).
 *
 * Voir [docs/physics.md](../../../docs/physics.md) pour la sémantique
 * physique de chaque constante (vitesses réelles en m/s, distances en m).
 */

import { PLAYER_RADIUS, PX_PER_M } from './court';

// =============================================================
// Échelle (re-export pour confort — défini dans court.ts)
// =============================================================
export { PX_PER_M, PLAYER_RADIUS, BALL_RADIUS } from './court';

/** Convertit des mètres en pixels SVG. */
export function metersToPx(m: number): number {
  return m * PX_PER_M;
}

/** Convertit des pixels SVG en mètres. */
export function pxToMeters(px: number): number {
  return px / PX_PER_M;
}

// =============================================================
// Clearances (distances minimales de contact)
// =============================================================

/**
 * Distance minimale entre les centres de deux joueurs avant que leurs
 * cercles ne se superposent. `2 * PLAYER_RADIUS + 2` = 34 px ≈ 92 cm,
 * cohérent avec la silhouette épaule à épaule.
 *
 * Utilisée par :
 *  - `manDefense.ts` (cible défenseur ne se superpose pas à son homme)
 *  - `geometry.ts` (`resolvePlayerCollisions`)
 *  - `screens.ts` (`pushOutOfScreener`)
 */
export const MIN_PLAYER_CLEARANCE_PX = PLAYER_RADIUS * 2 + 2;

// =============================================================
// Cinématique (vitesses, boosts, frictions)
// =============================================================

/**
 * Vitesse max par défaut d'un défenseur en px/étape (sans override par
 * `rule.maxSpeed`). 110 px ≈ 3 m, soit ~1.5 m/s à 2 s/étape — c'est de
 * la position tactique, pas du sprint absolu.
 */
export const DEFAULT_DEFENSE_MAX_SPEED_PX = 110;

/**
 * Distance défenseur ↔ son homme (sans override par `rule.distance`).
 * 40 px ≈ 1.08 m — distance "à un bras" classique.
 */
export const DEFAULT_DEFENSE_DISTANCE_PX = 40;

/**
 * CVT Chantier 1.1b — rayon de décélération pour `arrive` sur les
 * cibles de marquage individuel. Quand le défenseur est à moins de
 * `STEERING_MAN_SLOWING_RADIUS_PX` de sa cible legacy, le moteur
 * de forces produit un target dampé (rampe linéaire `dist/radius`)
 * → anti-oscillation autour de l'homme.
 *
 * 12 px ≈ 10 % du `DEFAULT_DEFENSE_MAX_SPEED_PX=110` — zone "déjà
 * arrivé en pratique" : sans amortissement, le défenseur a tendance
 * à sur-réagir aux micro-déplacements de son homme entre frames.
 */
export const STEERING_MAN_SLOWING_RADIUS_PX = 12;

/**
 * CVT Chantier 1.3 — rayon de répulsion `repel` autour des poseurs
 * d'écran. Définit la zone où la force de glissement fluide remplace
 * progressivement le push-out binaire. = `MIN_PLAYER_CLEARANCE_PX +
 * STEERING_SCREEN_REPEL_BUFFER_PX`.
 *
 * Buffer 12 px : juste assez pour que la force pré-positionne le
 * défenseur AVANT qu'il touche le cercle de clearance dur.
 */
export const STEERING_SCREEN_REPEL_BUFFER_PX = 12;

/**
 * CVT Chantier 1.3 — poids par défaut de la force `repel` autour
 * d'un poseur d'écran. Calibré pour que la trajectoire dévie de
 * quelques pixels au passage d'un écran sans masquer le seek vers
 * la cible principale.
 */
export const STEERING_SCREEN_REPEL_WEIGHT = 20;

/**
 * CVT Chantier 3 — tolérance pour qualifier un défenseur de
 * "shadowing" une ligne de passe. Si la distance perpendiculaire
 * signée du défenseur au segment porteur↔attaquant est en valeur
 * absolue inférieure à cette tolérance ET que le défenseur projette
 * dans le segment, on considère la passe "occultée" → propagation
 * du flag `isPassShadowed` pour permettre aux défenseurs adjacents
 * de flotter en aide.
 *
 * 16 px ≈ rayon visuel du défenseur — un défenseur "sur la ligne"
 * occulte effectivement la passe au sens géométrique.
 */
export const PASS_SHADOW_TOLERANCE_PX = 16;

/**
 * Multiplicateur de vitesse appliqué au défenseur du nouveau porteur lors
 * d'une transition de balle (closeout). 1.4 = +40 % sur l'étape de
 * transition uniquement, pour matérialiser l'accélération de fermeture.
 *
 * Modulé par le profil offensif du porteur via `closeoutProfileBonus` :
 * shooter ×1.15, non-shooter ×0.85.
 */
export const DEFAULT_CLOSEOUT_BOOST = 1.4;

/**
 * Intensité du strong-side denial automatique (sans trigger). 0.45 = pull
 * de 45 % du chemin homme→ballon quand l'attaquant est à <250 px du
 * porteur, modulé par la proximité.
 */
export const DEFAULT_DENY_AGGRESSIVENESS = 0.45;

/**
 * P1.1 — Help-side split line. Seuil « à deux passes » : distance
 * homme ↔ porteur au-delà de laquelle un défenseur weak-side prend la
 * stance split line (au lieu du sag proportionnel). ≈ 6,75 m. Cohérent
 * avec le seuil « à une passe » (< 250 px) du strong-side denial.
 */
export const HELP_SIDE_TWO_PASSES_PX = 250;

/**
 * P1.1 — Intensité du pull vers la split line (fraction du chemin
 * manPos → aim), multipliée par helpPct/100 et le coût de quitter
 * l'attaquant. 0.85 = stance franche (un pied dans la raquette) tout en
 * laissant helpPct au coach comme levier.
 */
export const HELP_SIDE_SPLIT_LINE_PULL = 0.85;

/**
 * P1.4 — Drive naissant (pré-trigger). Rampe d'intensité 0..1 sur le
 * delta porteur→panier entre 2 steps : 0 sous MIN, 1 à FULL (= seuil du
 * vrai trigger drive dans triggers.ts). Gated à MAX_DIST du panier —
 * au-delà, remonter la balle n'est pas une menace de pénétration.
 */
export const EARLY_DRIVE_MIN_DELTA_PX = 10;
export const EARLY_DRIVE_FULL_DELTA_PX = 25;
export const EARLY_DRIVE_MAX_DIST_PX = 350;

/**
 * P1.4 — Boost max du facteur d'aide weak-side quand un drive naissant
 * est détecté (ajouté au facteur sag/split-line, capé à 1). Le shrink
 * reste un PRÉ-mouvement : plus doux que l'aide active sur trigger.
 */
export const EARLY_DRIVE_SHRINK_BOOST = 0.35;

// =============================================================
// Vitesses par poste (presets)
// =============================================================

/**
 * Vitesses max par défaut selon le poste, en px/étape. Modélise la
 * mobilité réelle :
 *  - meneur (D1) : ~3.9 m/étape (rapide, perimeter)
 *  - arrière (D2) : ~3.5 m/étape
 *  - ailier (D3) : ~3.0 m/étape (= défaut moteur)
 *  - ailier fort (D4) : ~2.4 m/étape
 *  - pivot (D5) : ~2.0 m/étape (lent, raquette)
 *
 * Conversion : valeur_px / PX_PER_M = mètres parcourus en 2 s (cf.
 * `PLAYBACK_STEP_DURATION_MS`).
 */
export const MAX_SPEED_BY_POSITION_PX = {
  guard: 145,        // D1 — meneur
  shootingGuard: 130, // D2 — arrière
  wing: 110,         // D3 — ailier (= DEFAULT_DEFENSE_MAX_SPEED_PX)
  forward: 90,       // D4 — ailier fort
  center: 75,        // D5 — pivot
} as const;

// =============================================================
// Détection d'écran
// =============================================================

/**
 * Distance max screener ↔ carrierDef pour qu'un écran porteur soit
 * détecté automatiquement. 35 px ≈ 95 cm — un écran posé épaule contre
 * épaule. Au-delà, on considère qu'il n'y a pas de contact d'écran.
 */
export const DEFAULT_SCREEN_RADIUS_PX = 35;

/**
 * Hystérésis de détection d'écran hors-ballon. Une fois une paire
 * (cutter, screener) détectée à un step, le rayon de détection est
 * élargi de `OFFBALL_SCREEN_HYSTERESIS_PX` au step suivant pour cette
 * paire. Évite le clignotement : un défenseur de cutter qui navigue
 * autour de l'écran (couverture `over`) sort du `screenRadius` et
 * ferait disparaître l'écran sans cette marge de maintien.
 *
 * Même principe que `SCREEN_CONTACT_ENTER/EXIT_QUALITY` pour la
 * qualité d'écran : entrer dans un contact exige un signal plus fort
 * que rester en contact.
 */
export const OFFBALL_SCREEN_HYSTERESIS_PX = 14;

// =============================================================
// Aide défensive
// =============================================================

/**
 * Distance entre la drop zone (rim protection) et le panier, sur la ligne
 * porteur→panier. 75 px ≈ 2.0 m — point classique de "show + recover" du
 * pivot sur drive (entre la raquette et le rim).
 */
export const RIM_PROTECTION_DROP_ZONE_PX = 75;

// =============================================================
// Lecture / animation
// =============================================================

/**
 * Durée d'une étape en lecture à `playbackSpeed = 1×`, en millisecondes.
 * Le slider de vitesse (0.3× → 2×) module cette base : `stepDuration = BASE / speed`.
 *
 * 2000 ms = 2 s par étape à 1×, soit ~2 m/s pour un cut moyen de 4 m. C'est
 * volontairement lent — le but est de **lire** la tactique (qui bouge où,
 * dans quel ordre), pas de simuler la vitesse réelle d'un joueur (≈ 7 m/s
 * en sprint). Pour une lecture rapide, le slider 2× ramène à 1 s par étape.
 *
 * Cohérence : `MAX_SPEED_BY_POSITION_PX` est calibré pour cette base (cf.
 * conversion px/étape → m/s dans la JSDoc de la constante).
 */
export const PLAYBACK_STEP_DURATION_MS = 2000;

/** Phy.O — Sensibilité de base à la courbure pour le profil de vitesse
 *  offensif. Plus haut = ralentissement plus marqué dans les virages.
 *  Tunable. */
export const OFFENSIVE_CURVATURE_SENSITIVITY = 120;

/** Phy.O — Nombre de points d'échantillonnage du profil le long de la
 *  longueur d'arc. Compromis précision vs coût (one-shot par annotation,
 *  donc tolérable). */
export const OFFENSIVE_PROFILE_SAMPLES = 64;

/** Phy.O — Multiplicateurs `α` par tier athlétique attaquant.
 *  - elite : ×0.7 (garde plus de vitesse en virage)
 *  - standard : ×1.0
 *  - lent : ×1.4 (ralentit plus dans les virages) */
export const OFFENSIVE_TIER_MULTIPLIER = {
  elite: 0.7,
  standard: 1.0,
  lent: 1.4,
} as const;

/** Phy.O V2 — Distance en deçà de laquelle un obstacle ralentit
 *  l'attaquant. Mirror du `threshold` de `proximityFriction` (Lever B
 *  défensif) pour cohérence. */
export const OFFENSIVE_FRICTION_THRESHOLD_PX = 30;

/** Phy.O V2 — Facteur minimum de vitesse au contact. Mirror du `floor`
 *  de `proximityFriction` (Lever B défensif). */
export const OFFENSIVE_FRICTION_FLOOR = 0.6;

/** Phy.O V4 — Profondeur du creux de vitesse au centre d'une feinte.
 *  0.5 = 50 % de vitesse au pic (le joueur ralentit de moitié à ce point). */
export const OFFENSIVE_FEINTE_DEPTH = 0.5;

/** Phy.O V4 — Largeur (σ gaussienne) du creux, en fraction d'arc.
 *  0.08 = la feinte couvre ~16 % du path autour de son centre. */
export const OFFENSIVE_FEINTE_WIDTH = 0.08;

/** Phy.O V3 — Distance en deçà de laquelle le matched defender impose
 *  une lecture défensive (ralentissement intentionnel pour le laisser
 *  réagir). Plus généreux que la friction de contact (V2) car la lecture
 *  arrive avant le contact réel. */
export const OFFENSIVE_DEFENSE_READING_THRESHOLD_PX = 50;

/** Phy.O V3 — Facteur minimum au plus proche de la lecture. Moins
 *  agressif que la friction de contact : la lecture est délibérée, pas
 *  un freinage forcé. */
export const OFFENSIVE_DEFENSE_READING_FLOOR = 0.7;

/** Phy.O V3 V4 — Amplitude du boost post-feinte. Au pic, v atteint
 *  `1 + AMPLITUDE` (1.4 par défaut = 40% au-dessus de v normal). */
export const OFFENSIVE_POST_FEINTE_BOOST_AMPLITUDE = 0.4;

/** Phy.O V3 V4 — Offset du pic de boost après le centre de la feinte,
 *  en fraction d'arc. 0.10 = boost peak ~10% d'arc après la feinte. */
export const OFFENSIVE_POST_FEINTE_BOOST_OFFSET = 0.10;
