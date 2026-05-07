# Modèle de données

Tous les types vivent dans [`src/lib/types/index.ts`](../src/lib/types/index.ts).

## AppState

État global unique de l'application. Sérialisé tel quel en JSON pour l'export et le localStorage.

```typescript
interface AppState {
  // Étapes du système (au moins 1)
  steps: Step[];
  activeStep: number;

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
  defenseSystem: 'man' | 'zone';
  zoneConfig: ZoneConfig;

  // Outil courant + visu
  tool: 'move' | 'pass' | 'dribble' | 'cut' | 'screen';
  showHelpLines: boolean;
  showMatchups: boolean;
  showPassLanes: boolean;
  fullCourt: boolean;
  attackingDirection?: 'up' | 'down';   // sens d'attaque (panier visé). Default 'up'.
  showGhosts?: boolean;                 // mode fantôme : affiche l'étape N-1 en transparence
}
```

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
}
```

Conventions de tracé (voir [ui-design.md](ui-design.md)) :
- `pass` : ligne droite pointillée orange
- `dribble` : zig-zag/vague orange
- `cut` : ligne droite pleine grise
- `screen` : trait + barre en T grise

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

## Types calculés (non sérialisés)

Ces types sont produits par le moteur à chaque frame, jamais stockés.

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
- Debounce : 400ms après mutation
- Compatibilité : `loadFromStorage` merge avec `makeInitialState()` pour les champs ajoutés (e.g. `fullCourt`, `offBallScreenRule`)

L'export JSON utilise le même format. Un fichier exporté de v1.0 peut être importé en v1.1 même si de nouveaux champs sont apparus.
