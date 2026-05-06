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
  triggers: { drive: boolean; post: boolean; paint: boolean };

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
  fullCourt: boolean;
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
}
```

**Important** : seules les positions OFFENSIVES sont stockées par étape. Les positions DÉFENSIVES sont **calculées** à la volée par le moteur, sauf pour `defenseInitial` qui est l'état avant l'étape 0.

## DefenderRule

Règles individuelles. Trois dimensions :

```typescript
interface DefenderRule {
  helpPct: number;                      // 0–100, intensité d'aide
  priority: 'paint' | 'man' | 'passlane'; // où viser quand on aide
  vsCarrier: CarrierBehavior;           // si on défend le porteur
  offBallStance?: OffBallStance;        // si on défend hors-ballon
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
  | 'deny-3q'     // 3/4 ball-side, pied dans la passe
  | 'fronting';   // full denial, devant l'attaquant face au ballon
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
  type: 'zone-2-3' | 'zone-1-3-1' | 'zone-3-2' | 'zone-matchup';
  ballPressure: number;       // 0–100, attraction des défenseurs vers le ballon
  rotationSpeed: number;      // 40–200 px/étape, vitesse de rotation
  trapCorners: boolean;       // piège en coin
  extendTo3pt: boolean;       // étendre à 3pts
}
```

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
  helpFactor: number;           // 0–1, intensité d'aide actuelle
  isCarrierDefender: boolean;
  matchedTo: AttackerId;        // qui il défend (matchups + switches)
  onScreen: boolean;            // impliqué dans un écran
  switchedThisStep: boolean;
  zoneId?: string;              // si zone
  isRotating?: boolean;         // si en rotation zone
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
