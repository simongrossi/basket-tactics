// Constantes de réglage du pipeline défensif — SOURCE UNIQUE.
//
// Historiquement, chaque couche déclarait ses propres `const` magiques en tête
// de fichier. Cela rendait le réglage difficile (valeurs éparpillées sur 14
// fichiers) et avait produit une collision de nom trompeuse : deux
// `HELP_BUSY_THRESHOLD` aux valeurs différentes (0.5 vs 0.3) — non pas un bug,
// mais deux seuils VOLONTAIREMENT distincts (cf. ci-dessous). Centraliser ici :
//  1. donne une vue d'ensemble du tuning défensif,
//  2. rend ces valeurs exposables en sliders coach plus tard,
//  3. lève l'ambiguïté de nommage en préfixant chaque constante par sa couche.
//
// Chaque couche importe sa constante avec un alias local (`as`) pour préserver
// la lisibilité du code d'origine sans changer aucune ligne d'usage. Refactor
// strictement sans changement de comportement (mêmes valeurs).

// === chainResponseLayer (C.7 V2 — réaction aux re-screens / stagger) ===
/** Décalage appliqué au défenseur sur une re-screen détectée. */
export const RESCREEN_SHIFT_PX = 6;

// === cutterBumpLayer (B10 — bump des cutters off-ball) ===
/** Distance perpendiculaire max à la ligne du cut pour être candidat bumper. */
export const CUTTER_BUMP_MAX_PERP_DIST_PX = 40;
/** Déplacement du défenseur vers la position courante du cutter. */
export const CUTTER_BUMP_OFFSET_PX = 12;
/** Au-dessus de ce helpFactor, le défenseur est "occupé" et ne bumpe pas.
 *  ⚠ Volontairement plus BAS que `POST_HELP_BUSY_THRESHOLD` : bumper un cutter
 *  demande d'être plus libre que digger sur un post. */
export const CUTTER_BUMP_HELP_BUSY_THRESHOLD = 0.3;

// === junkLayer (F.1 — box-and-1 / triangle-and-2 / diamond-and-1) ===
/** Distance du chasseur en 3/4 deny par rapport au panier. */
export const JUNK_CHASER_OFFSET_TO_HOOP_PX = 18;

// === lateShotClockLayer (F.5 — fin de possession <5s) ===
/** Resserrement du contest quand l'horloge est basse (pas d'aide). */
export const LATE_CLOCK_CONTEST_PRESSURE_PX = 10;

// === pnrLayer (P1 — rotations pick-and-roll) ===
/** Si le roller arrive à moins de cette distance du panier, le tag devient
 *  switch (tag-then-switch, C.5). */
export const PNR_TAG_THEN_SWITCH_DIST_PX = 150;

// === postCoverageLayer (B6 — dig / double sur post-up) ===
/** Fraction du chemin pour 'dig' : faux help (70% naturel, 30% vers pivot). */
export const POST_DIG_FRACTION = 0.3;
/** Fraction pour 'double' : double team réel (50% du chemin). */
export const POST_DOUBLE_FRACTION = 0.5;
/** Au-dessus de ce helpFactor, le défenseur est "occupé" et ne dig pas.
 *  ⚠ Volontairement plus HAUT que `CUTTER_BUMP_HELP_BUSY_THRESHOLD` : un dig
 *  est un engagement moindre, tolérable même à mi-aide. */
export const POST_HELP_BUSY_THRESHOLD = 0.5;

// === pressLayer (F.2 — press half/full-court) ===
/** Amplitude du pull de trap quand le porteur franchit la mi-terrain. */
export const PRESS_TRAP_PULL_PX = 35;
/** Y de la mi-terrain : seuil de déclenchement du trap de press. */
export const PRESS_TRAP_CROSS_THRESHOLD_Y = 540;

// === rimProtectionLayer ===
/** Poids du blend de la cible vers le point d'interception (protection arceau). */
export const RIM_PROTECTION_BIAS_WEIGHT = 0.5;

// === influenceLayer (CVT 2b — interpose ligne de passe) ===
/** Décalage max d'interpose pour un défenseur libre. */
export const INTERPOSE_MAX_SHIFT_PX = 5;

// === screenRepelLayer (CVT 1.3b — soft repel des écrans) ===
/** Décalage max de repel pour un défenseur libre. */
export const SCREEN_REPEL_LAYER_MAX_SHIFT_PX = 3;

// === driveContainmentLayer (2a — défense vivante / drive) ===
/** Décalage max par step du défenseur du porteur vers le point de contain. */
export const CONTAINMENT_MAX_SHIFT_PX = 8;

// === rotationMemory (P4.4 — mémoire d'intention défensive) ===
/** Zone du cercle : en mode auto, le tagueur ne garde le roller que si
 *  celui-ci est encore à moins de ~5 m du panier. */
export const ROTATION_ROLL_ZONE_PX = 190;
/** Avance minimale du tagueur sur le défenseur du poseur (distance au
 *  roller) pour qu'il garde le roller en mode auto. */
export const ROTATION_STAY_MARGIN_PX = 20;
/** Retour au calme : le ballon doit être ressorti à au moins ~6,2 m du panier
 *  (juste sous la ligne à 3 points). */
export const ROTATION_CALM_BALL_DIST_PX = 230;
/** Retour au calme : distance max entre les deux défenseurs échangés pour
 *  qu'ils se rendent leurs hommes (~4 m). */
export const ROTATION_SCRAMBLE_DIST_PX = 150;
/** Fin de rotation : part de la position de rotation gardée à l'étape qui
 *  suit (0.5 = le défenseur revient à mi-chemin). */
export const ROTATION_RECOVER_BLEND = 0.5;
