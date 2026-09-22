# Modèle de données

Les types du système vivent dans [`src/lib/types/index.ts`](../src/lib/types/index.ts).
Les enveloppes de partage et les traces de gestes sont définies respectivement
dans [`situationCode.ts`](../src/lib/state/situationCode.ts) et
[`manualGestures.ts`](../src/lib/state/manualGestures.ts).

## AppState

État éditable du système, sauvegardé dans le brouillon local. Les exports et
codes de partage retirent l’identité locale `librarySystemId`. La lecture,
la poursuite défensive temporaire et les traces de gestes sont gérées à part.
L’extrait suivant présente les principaux champs ; le type source fait référence.

```typescript
interface AppState {
  librarySystemId?: string;   // identité locale, exclue des copies et partages
  // Étapes du système (au moins 1)
  steps: Step[];
  activeStep: number;
  playerCount: 2 | 3 | 4 | 5;

  // Positions initiales défense (avant l'étape 0)
  defenseInitial: Record<DefenderId, Point>;

  // Paramètres globaux défense homme à homme
  defenseDistance: number;     // 20–80 px, distance par défaut défenseur ↔ attaquant
  defenseMaxSpeed: number;     // 40–200 px/étape, contrainte de vitesse (lateness)

  // Triggers d'aide (homme à homme)
  triggers: { drive: boolean; post: boolean; paint: boolean; trap?: boolean };

  // Règles individuelles par défenseur
  rules: Record<DefenderId, DefenderRule>;

  // Défense sur écran porteur
  screenRule: 'over' | 'under' | 'switch' | 'hedge' | 'drop' | 'blitz';
  screenRadius: number;        // 20–60 px, sensibilité de détection
  dropDepth: 'shallow' | 'medium' | 'deep';

  // Défense sur écran non-porteur
  offBallScreenRule: 'over' | 'under' | 'switch' | 'bump';

  // Système collectif
  defenseSystem: 'man' | 'zone' | 'junk' | 'press';
  zoneConfig: ZoneConfig;
  /** Appuis/regard/fatigue du drag ; la poursuite progressive reste active sans ce flag. */
  defenderDragInertiaEnabled?: boolean;

  // Défense scriptable
  /** Active l'application des directives défensives scriptées par l'engine. Default true. */
  defenseScriptedDirectivesEnabled?: boolean;

  // Outil courant + visu
  tool: 'move' | 'pass' | 'dribble' | 'cut' | 'screen' | 'text';
  showHelpLines: boolean;
  showMatchups: boolean;
  showPassLanes: boolean;
  fullCourt: boolean;
  attackingDirection?: 'up' | 'down';   // sens d'attaque (panier visé). Default 'up'.
  showGhosts?: boolean;                 // mode fantôme : affiche l'étape N-1 en transparence
  showActionOrder?: boolean;            // badges numérotés sur les actions de l'étape active
  showHeatmap?: boolean;                // calque heatmap des zones non-défendues (jaune/orange/rouge)
  showThreats?: boolean;                // anneau + badge % score de menace par attaquant (Phase A simu)
  showBestAction?: boolean;             // flèche dorée sur la meilleure option offensive (Phase B simu)
  showSwitchMatchups?: boolean;         // surligne en orange le matchup post-switch (default true)
  showScreenIndicators?: boolean;       // cercles violet/vert sur les poseurs d'écran (default true)
  showStateRings?: boolean;             // anneaux carrier/late/closeout/denial sur défenseurs (default true)
  showLockBadges?: boolean;             // cadenas position manuelle (jaune) + forcedScreener (violet) (default true)
  /** Toggles fine-grained sur les sous-visuels (ET logique avec leur master). Default true partout. */
  showZoneTracking?: boolean;
  showContestedPass?: boolean;
  showBlockedPass?: boolean;
  showOffBallScreenIndicator?: boolean;
  showLateRing?: boolean;
  showCloseoutRing?: boolean;
  showDenyingRing?: boolean;
  showForcedScreenerBadge?: boolean;
  /** Vue debug aide défensive : flèches helpAim + badges % + tag priorité. Outil développeur. */
  showHelpDebug?: boolean;
  /** Toggles globaux des cônes de champ de vision (heatmap 120°). */
  showFieldOfViewAll?: boolean;
  showFieldOfViewAllDefenders?: boolean;
  showFieldOfViewAllAttackers?: boolean;
  closeoutBoost?: number;               // multiplicateur vit. max du défenseur en closeout (default 1.4)
  denyAggressiveness?: number;          // intensité max du strong-side denial automatique (default 0.45)
  attackerHands?: AttackerHands;        // main dominante par attaquant ('right' | 'left')
  attackerProfiles?: AttackerProfiles;  // profil offensif par attaquant — module aide / closeout / shotQuality
  /** Overrides manuels d'orientation par attaquant (body + gaze, écrasent le calcul auto). */
  attackerOrientations?: Partial<Record<AttackerId, { body?: number; gaze?: number }>>;
  /** Overrides par région de zone (homePos, radius, mode). Keyed par region.id. */
  zoneOverrides?: ZoneOverrides;
  /** Mode édition zones : active l'overlay interactif (drag homePos, popup par région). */
  zoneEditMode?: boolean;
}
```

### Profils joueurs offensifs

```typescript
type OffensiveProfile =
  | 'creator'      // meneur/créateur (handle, vision)
  | 'shooter'      // tireur extérieur (3pts fiable)
  | 'slasher'      // pénétrant (drive, finition)
  | 'rim-roller'   // pivot rouleur (5/4 classique)
  | 'stretch-big'  // intérieur shooter (4 stretch)
  | 'non-shooter'; // tireur médiocre, à laisser
type AttackerProfiles = Record<AttackerId, OffensiveProfile>;
```

Le profil module trois branches du moteur :
- **`threats.ts`** : `profileShotMultiplier(profile, zone)` ajuste la qualité de tir (shooter ×1.20 à 3pts, rim-roller ×1.30 au cercle, non-shooter ×0.65 à 3pts).
- **`help.ts`** : `leaveAttackerCostMultiplier(profile)` réduit le `helpFactor` quand on quitte un shooter (×0.55) et l'augmente sur un non-shooter (×1.30).
- **`engine.ts`** (closeout) : `closeoutProfileBonus(profile)` boost de vitesse +15% sur shooter, -15% sur non-shooter.

Défauts par défaut (modifiables via clic-droit sur l'attaquant) : `O1=creator, O2=shooter, O3=shooter, O4=rim-roller, O5=stretch-big`.

## Step

Une étape capture le moment N de l'action.

```typescript
interface Step {
  off: Record<AttackerId, Point>;       // positions des 5 attaquants
  ballCarrier: AttackerId;              // qui a la balle
  annotations: Annotation[];            // flèches dessinées sur cette étape
  switches?: [DefenderId, DefenderId][]; // switches déclenchés (cumulés)
  label?: string;                       // texte libre éditable ("dribble drive")
  defenseOverrides?: Partial<Record<DefenderId, Point>>; // overrides manuels
  forcedScreener?: AttackerId;          // override de detectScreen (clic-droit)
  /** Step édité manuellement après génération scénario. La recompilation préserve ce step. */
  manualOverride?: boolean;
  /** Id de la ScriptedAction qui a produit ce step (trace de provenance). */
  generatedBy?: string;
  /** Directives défensives pour ce step. Posées par compileScenario, consommées par engine.applyDirective. */
  defensiveDirectives?: DefensiveDirective[];
  /** Overrides d'assignation défenseur → attaquant pour ce step (ex : pre-switch). */
  assignmentOverrides?: Partial<Record<DefenderId, AttackerId>>;
}
```

## ScriptedAction

Union discriminée par `kind`. Le compilateur de scénario (`compileScenario`) transforme une liste de `ScriptedAction[]` en `Step[]` consommables par le moteur.

```typescript
type ScriptedAction = OffensiveScriptedAction | DefensiveScriptedAction;

interface OffensiveScriptedAction {
  kind: 'offensive';
  id: string;
  type: ScriptedActionType;   // 'pick-and-roll' | 'give-and-go' | 'basket-cut' | … (18 valeurs)
  params: ScriptedActionParams;
  label?: string;             // override libre de la lecture FR auto-générée
}

interface DefensiveScriptedAction {
  kind: 'defensive';
  id: string;
  type: DefensiveActionType;  // 'help-and-recover' | 'pre-switch' | 'trap' | 'tag'
  /** Si défini → couverture couplée à l'action offensive parentActionId.
   *  Sinon → couverture libre (affectedSteps requis). */
  parentActionId?: string;
  /** Steps ciblés (indices absolus compilés). Pour une couverture couplée,
   *  défaut = tous les steps du parent. Pour une couverture libre, requis. */
  affectedSteps?: number[];
  params: DefensiveActionParams;
  label?: string;
}

type DefensiveActionType = 'help-and-recover' | 'pre-switch' | 'trap' | 'tag';

interface DefensiveActionParams {
  defenders: DefenderId[];      // défenseur(s) qui exécutent la directive
  target?: AttackerId;          // attaquant ciblé (porteur trappé, roller taggé…)
  swapWith?: DefenderId;        // pour pre-switch : 2e défenseur qui échange
  helpStep?: number;            // pour help-and-recover : step de la phase "aide"
  recoverStep?: number;         // pour help-and-recover : step du retour
}
```

### `DefensiveDirective`

Produit par `defensiveCompilation.ts` lors de `compileScenario` (passe 2). Stocké dans `Step.defensiveDirectives[]`, consommé par `engine.applyDirective` à chaque step si `defenseScriptedDirectivesEnabled === true`.

```typescript
interface DefensiveDirective {
  type: DefensiveActionType;
  defenders: DefenderId[];
  target?: AttackerId;
  swapWith?: DefenderId;
  /** 'engage' = action active, 'release' = retour à la position standard. */
  phase: 'engage' | 'release';
  /** ID de l'action source (debug + traçabilité UI). */
  sourceActionId: string;
}
```

### `forcedScreener`

Override de l'auto-detection d'écran porteur. Quand posé, `detectScreen` skip les checks de proximité et utilise cet attaquant comme poseur. Garde-fous : doit exister dans `off`, doit être différent du porteur, doit avoir un défenseur dans `matchups`. Visible : cadenas violet sur le joueur. Activé via clic-droit sur l'attaquant → "forcer comme poseur d'écran".

### `defenseOverrides`

Quand l'utilisateur drag un défenseur, sa position est enregistrée comme **override** pour l'étape active. Le moteur ne calcule pas de cible pour ce défenseur sur cette étape — il utilise la position imposée. Pour réauto-positionner, voir le bouton "↻ ré-auto-positionner" dans le menu contextuel (clic-droit). Un petit cadenas jaune apparaît sur les défenseurs avec override actif.

**Important** : seules les positions OFFENSIVES sont stockées par étape. Les positions DÉFENSIVES sont **calculées** à la volée par le moteur, sauf pour `defenseInitial` qui est l'état avant l'étape 0.

## DefenderRule

Règles individuelles. Trois dimensions :

```typescript
interface DefenderRule {
  helpPct: number;                      // 0–100, intensité d'aide
  priority: 'paint' | 'man' | 'passlane'; // où viser quand on aide
  vsCarrier: CarrierBehavior;           // si on défend le porteur
  offBallStance?: OffBallStance;        // si on défend hors-ballon
  screenNav?: OnScreenNav;              // override individuel vs écran
  closeoutBoost?: number;               // override individuel de state.closeoutBoost (range 1-2)
  denyAggressiveness?: number;          // override individuel de state.denyAggressiveness (range 0-1)
  distance?: number;                    // override individuel de state.defenseDistance (range 20-80)
  maxSpeed?: number;                    // override individuel de state.defenseMaxSpeed (range 40-200)
  helpMode?: 'auto' | 'aggressive' | 'passive' | 'disabled'; // comportement d'aide individuel
  bodyOrientationMode?: BodyOrientationMode; // consigne tactique de corps
  bodyOrientation?: number;              // override absolu 0-360, prioritaire
  gazeLock?: 'opponent' | 'ball-carrier' | 'both'; // verrouillage dynamique du regard
}

type CarrierBehavior =
  | 'coller'      // pression rapprochée
  | 'bumper'      // bumper (entre porteur et panier)
  | 'contester'   // recul actif, contestation
  | 'reculer'     // drop profond
  | 'topside'     // force vers le milieu
  | 'baseline';   // force vers la ligne de fond

type OffBallStance =
  | 'sag'         // défaut, position avec aide
  | 'behind'      // strict entre attaquant et panier, pas d'aide
  | 'stunt'       // fake d'aide (blend 0.4 entre behind et fronting)
  | 'deny-3q'     // 3/4 ball-side, pied dans la passe
  | 'fronting';   // full denial, devant l'attaquant face au ballon

type OnScreenNav =
  | 'auto'        // suit state.screenRule (défaut)
  | 'over' | 'under' | 'switch' | 'hedge' | 'drop' | 'blitz';

type BodyOrientationMode =
  | 'auto'             // suit la stance
  | 'open'             // ouvert homme/ballon
  | 'face-man'         // face à son homme
  | 'face-ball'        // face au porteur
  | 'pass-lane-flat'   // dans l'axe porteur→homme
  | 'pass-lane-perp';  // perpendiculaire à l'axe porteur→homme
```

## Annotation

Flèche tracée sur le terrain.

```typescript
interface Annotation {
  type: 'pass' | 'dribble' | 'cut' | 'screen';
  fromId: AttackerId;          // joueur de départ
  toId?: AttackerId | null;    // joueur cible (passe seulement)
  from: Point;                 // coord de départ
  to: Point;                   // coord d'arrivée
  /** Points intermédiaires pour trajectoires non rectilignes (V-cut, L-cut,
   *  démarquage aller-retour, courbe libre). Concaténés avec `from` et `to`
   *  en polyline ordonnée et interpolés en spline Catmull-Rom à la lecture.
   *  Absent ou vide = ligne droite (comportement historique). */
  waypoints?: Point[];
}
```

Conventions de tracé (voir [ui-design.md](ui-design.md)) :
- `pass` : ligne droite pointillée orange (toujours rectiligne, pas de waypoints)
- `dribble` : sans waypoints → wave Q-Bezier lisse (`dribbleWavePath` dans [`dribbleWave.ts`](../src/lib/logic/dribbleWave.ts)). Avec waypoints → polyline lissée Catmull-Rom (l'utilisateur a dessiné explicitement la courbe, on respecte sa trajectoire).
- `cut` : ligne droite ou polyline lissée selon `waypoints`
- `screen` : trait + barre en T grise. Avec waypoints le trail est courbe (rare en pratique).

### Trajectoire courbe (polyline + Catmull-Rom)

Module dédié [`src/lib/logic/polyline.ts`](../src/lib/logic/polyline.ts) :

| Fonction | Rôle |
|---|---|
| `polylinePath(points)` | Génère le path SVG `M ... C ...` lissé : chaîne de courbes Bezier cubiques équivalentes exactes des segments Catmull-Rom (tension τ=0.5, uniforme). Aux extrémités, miroir des contrôles pour éviter l'aplatissement. |
| `samplePolyline(points, t)` | Échantillonne la position à `t ∈ [0, 1]` le long de la spline. Reparamétrage en longueur d'arc via les distances euclidiennes des segments → vitesse perçue ~constante en lecture, indépendante de la courbure. Le résultat est rigoureusement sur la même courbe que celle dessinée par `polylinePath`. |
| `simplifyPolyline(points, tolerance)` | Simplification Douglas-Peucker pour réduire un buffer freehand bruyant (50–200 points captés à la souris) en 3–7 waypoints propres. Préserve `from` et `to` (extrémités). Tolérance 6 px utilisée par défaut côté UI. |

UX souris : maintenir **Shift pendant le drag** d'un outil annotation enregistre le tracé à main levée. Le buffer est échantillonné tous les ~6 px de mouvement (`onPointerMove`), et simplifié à la fin du drag (`onPointerUp`) en `waypoints`. Drag normal sans Shift = comportement historique (ligne droite, wave dribble, hold-at-mid pour screen).

## ZoneConfig

```typescript
interface ZoneConfig {
  type: 'zone-2-3' | 'zone-1-3-1' | 'zone-3-2' | 'zone-2-1-2' | 'zone-matchup';
  ballPressure: number;       // 0–100, attraction des défenseurs vers le ballon
  rotationSpeed: number;      // 40–200 px/étape, vitesse de rotation
  trapCorners: boolean;       // piège en coin (zone defense)
  extendTo3pt: boolean;       // étendre à 3pts
  verticalOffset?: number;    // décalage vertical de la zone (px)
}
```

> ⚠️ Le trigger `triggers.trap` (sur `AppState`) et `zoneConfig.trapCorners` sont distincts : le premier active le trap automatique en défense individuelle, le second en défense de zone.

Les polygones de zones sont dans [`lib/data/zones.ts`](../src/lib/data/zones.ts).

## Identifiants

```typescript
type AttackerId = 'O1' | 'O2' | 'O3' | 'O4' | 'O5';
type DefenderId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
type PlayerId   = AttackerId | DefenderId;
```

Convention : `O1` = meneur, `O2` = arrière, `O3` = ailier, `O4` = ailier fort, `O5` = pivot. Les défenseurs sont matchés par défaut sur leur indice (D1 ↔ O1, etc.) — voir `baseMatchups` dans `initial.ts`.

## Types calculés

Ces types sont produits par le moteur et ne font pas partie du brouillon
`AppState`. Un code de situation peut toutefois joindre une `PlaybackFrame`
comme élément de diagnostic. Une trace BTG1 conserve un sous-ensemble
explicite des données affichées, décrit ci-dessous.

```typescript
interface ComputedDefender {
  x: number; y: number;
  late: boolean;                // n'a pas pu atteindre sa cible
  helpFactor: number;           // 0–1, intensité d'aide ou denial actuel
  isCarrierDefender: boolean;
  matchedTo: AttackerId;        // qui il défend (matchups + switches)
  onScreen: boolean;            // impliqué dans un écran
  switchedThisStep: boolean;
  zoneId?: string;              // si zone
  isRotating?: boolean;         // si en rotation zone
  closingOut?: boolean;         // closeout actif sur cette transition (anneau orange)
  overClosed?: boolean;         // closeout + drive subi par l'attaquant (anneau rouge + ⚠)
  denying?: boolean;            // strong-side denial actif (ring cyan pointillé)
}

interface DetectedScreen {
  screener: AttackerId;
  screenerDef: DefenderId;
  carrier: AttackerId;
  carrierDef: DefenderId;
  screenerPos: Point;
}
```

## Persistance

- Clé : `basket-tactics-state-v1`
- Format : `JSON.stringify(state)`
- Écriture différée : 250 ms après mutation (`useLocalSave`), avec vidage à la fermeture et au passage en arrière-plan
- Compatibilité : `loadFromStorage` merge avec `makeInitialState()` pour les champs ajoutés (e.g. `fullCourt`, `offBallScreenRule`)

L’export JSON conserve les données du système sans `librarySystemId`.
`app.importState` protège le brouillon précédent dans
`basket-tactics-previous-draft-v1`, puis applique la normalisation et les migrations.
Les champs facultatifs absents peuvent ainsi recevoir les valeurs par défaut.

La préférence `bt:coach-draw-hint:dismissed:v1` mémorise séparément la fermeture
du bandeau **Dessiner le système**. Elle ne voyage pas avec le système.

## Enveloppes de partage

Les trois préfixes utilisent une enveloppe JSON UTF-8 compressée en DEFLATE,
encodée en Base64url, avec `version: 1` :

| Préfixe | Charge utile spécifique | Chargement |
|---|---|---|
| `BT1:` | `state`, `view?` (instant, source et frame de diagnostic facultative) | Remplace le système après protection du brouillon. |
| `BTA1:` | `state`, `animation: { startT, speed }`, `view?` | Restaure les étapes et lance leur lecture ; vitesse entre 0,3× et 2×. |
| `BTG1:` | `state` initial, `recording: { durationMs, frames, events }` | Relecture temporaire distincte du brouillon. |

`animation` et `recording` sont exclusifs. Une animation de timeline nécessite
au moins deux étapes ; un enregistrement manuel peut rester sur une seule
étape et être stationnaire. Les codecs ne transportent ni la bibliothèque
locale, ni la pile Annuler/Rétablir, ni l’identité `librarySystemId`.

Pour les gestes, `ManualGestureFrame` contient `t`, `off`, `def`, `ball` et
`carrier`. Chaque défenseur actif fournit `x`, `y`, `orientation`,
`gazeOrientation` et `matchedTo`. Les `Partial<Record<…>>` couvrent les formats
réduits : tous les joueurs actifs doivent néanmoins être présents dans
chaque échantillon. `ManualGestureEvent` conserve un temps et un événement
`begin`, `end` ou `move` avec l’identifiant et la position demandée.

Le hook de capture arrondit les coordonnées et angles au millième. Il
échantillonne au plus toutes les 50 ms, plus les bornes, jusqu’à 60 secondes.
Les limites sont de 1 202 frames et 10 000 événements. Les temps sont
croissants au sens large, dans `[0, durationMs]`, et la première frame est
à `0`. La relecture retient le dernier échantillon atteint, sans lissage
temporel ; les poses non enregistrées peuvent être recalculées.

Le décodeur vérifie le préfixe, la version, les formes attendues, les joueurs
actifs, les nombres finis et les limites de taille (750 000 caractères
encodés, 2 000 000 octets décompressés). Voir
[SITUATION-CODE.md](SITUATION-CODE.md) pour le format complet et le décodage
d’un signalement de bug.

## État temporaire d’interaction

`DefenderPursuit` appartient à `useAppState` : positions affichées au départ,
étape concernée, horodatage et indicateur de drag actif. Le rattrapage reste
progressif après relâchement et est nettoyé lorsqu’il est terminé. Ce mécanisme
ne crée pas de `defenseOverrides` dans les étapes.

`useManualRecording` conserve un état `idle`, `recording`, `ready`, `replaying`
ou `paused`, son instant courant et le dernier enregistrement en mémoire.
Ce dernier n’est pas sauvegardé avec le brouillon ; copier le code BTG1 est
nécessaire pour le conserver après rechargement.
