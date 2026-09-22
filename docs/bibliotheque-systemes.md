# Bibliothèque systèmes

Format des templates et procédure pour en ajouter.

## Modèles fournis (31 au 2026-09-22)

| Fichier | Contenu |
|---|---|
| [`templates.ts`](../src/lib/data/templates.ts) | 10 sets classiques (`CLASSIC_TEMPLATES` : PNR central, Horns flare, Pindown coin, Spain PNR, UCLA, Floppy, Hammer, Iverson, Stagger, PNR aile) + modèles du labo d'écrans (`LAB_TEMPLATES`, niveau Développement) |
| [`inboundTemplates.ts`](../src/lib/data/inboundTemplates.ts) | 17 remises en jeu BLOB / SLOB |
| [`antiZoneTemplates.ts`](../src/lib/data/antiZoneTemplates.ts) | 3 attaques de zone avec lectures |
| [`drillScenarios.ts`](../src/lib/data/drillScenarios.ts) | Exercice Philadelphia |

## Convention d'écriture des étapes (important)

Les modèles sont écrits « **l'étape décrit ce qui mène ici** » : le libellé de
l'étape N et ses annotations (passe, déplacement dont `to` = position de
l'étape) décrivent l'action jouée pendant N−1 → N ; l'étape 0 porte « Setup ».

Au chargement (`loadTemplate`), l'app convertit vers la règle vue par le coach
— **ce qui est affiché sur l'étape k se joue pendant k → k+1** — via
[`stepActions.ts`](../src/lib/logic/stepActions.ts) : libellés remontés d'une
étape (`toDepartureLabels`), passes et déplacements « arrivée » affichés sur
l'étape de départ, écran tenu sur la dernière étape rattaché à l'étape
précédente. Un nouveau modèle doit donc suivre la même convention que les
existants. Garde-fou : `departureLabels.test.ts` exige, pour chaque modèle de
coaching, des étapes numérotées ayant un libellé et au moins une action, puis
une position finale.

## Format Template

```typescript
interface Template {
  id: string;                  // identifiant unique
  name: string;                // nom court affiché dans la liste
  description: string;         // 1 phrase, affichée sous le nom
  defenseInitial: DefenderPositions;  // positions D1-D5 au début
  steps: Step[];               // étapes pré-construites
}
```

Chaque `Step` :

```typescript
interface Step {
  off: AttackerPositions;            // positions O1-O5
  ballCarrier: AttackerId;           // qui a la balle
  annotations: Annotation[];         // flèches dessinées
  label?: string;                    // titre de l'étape
}
```

## Coordonnées du terrain

Le SVG terrain fait 600×560 (demi-terrain). Le panier est à `(300, 75)`. La raquette occupe `x: 240–360, y: 20–210`. La ligne 3 points est un arc de rayon 220 centré sur le panier.

Repères utiles :
- **Top of key** : `(300, 290)`
- **Wing gauche** : `(140, 280)` — angle 3 points gauche
- **Wing droit** : `(460, 280)` — angle 3 points droit
- **Coin gauche** : `(80, 140)` — proche ligne de fond
- **Coin droit** : `(520, 140)`
- **Bloc bas gauche** : `(230, 155)` — dans la raquette
- **Bloc bas droit** : `(370, 155)`
- **Elbow gauche** : `(245, 215)` — angle FT line / paint
- **Elbow droit** : `(355, 215)`
- **Free throw line** : `y = 210`
- **Mid-court** : `y = 540`

## Comment ajouter un template

1. Définir les positions de chaque étape :

```typescript
const myActionSetup: AttackerPositions = {
  O1: { x: 300, y: 380 },
  O2: { x: 130, y: 320 },
  O3: { x: 470, y: 320 },
  O4: { x: 215, y: 200 },
  O5: { x: 380, y: 220 },
};

const myActionStep2: AttackerPositions = {
  ...myActionSetup,
  O5: { x: 290, y: 340 },  // O5 monte
};
```

L'astuce du spread `{...prev}` minimise la duplication : seuls les joueurs qui bougent sont redéclarés.

2. Construire les annotations correspondantes :

```typescript
{
  type: 'cut',
  fromId: 'O5',
  toId: null,
  from: myActionSetup.O5,
  to: myActionStep2.O5,
}
```

3. Helper pour la défense initiale :

```typescript
defenseInitial: defaultDef(myActionSetup),
```

`defaultDef()` aligne les défenseurs entre leur attaquant et le panier à 40px de distance — bon point de départ. À ajuster ensuite manuellement si besoin (poste bas qui fronte, etc.).

4. Créer la structure :

```typescript
const MY_ACTION: Template = {
  id: 'my-action',
  name: 'Mon action',
  description: 'Description en 1 phrase.',
  defenseInitial: defaultDef(myActionSetup),
  steps: [
    {
      label: 'Setup',
      off: myActionSetup,
      ballCarrier: 'O1',
      annotations: [],
    },
    {
      label: 'Step 2',
      off: myActionStep2,
      ballCarrier: 'O1',
      annotations: [/* ... */],
    },
    // ...
  ],
};
```

5. L'enregistrer dans le tableau exporté :

```typescript
export const CLASSIC_TEMPLATES: Template[] = [/* … */, MY_ACTION];
```

## Modèles à ajouter (backlog)

Voir [IDEAS.md](../IDEAS.md). Restent : PNR step-up / step-back, Princeton
chin, Pistol ; presets de zone (2-3 avec trappes, 1-3-1, matchup).

## Tester un template

Au chargement, le moteur recalcule entièrement la défense à partir de l'`AppState` courant (système, règles, triggers). Donc un template doit "fonctionner" avec n'importe quelle config défensive.

Tests à faire après ajout :
- Vérifier visuellement que les étapes s'enchaînent logiquement (▶ play)
- Vérifier que les annotations correspondent aux mouvements (passe = ballon change, dribble = porteur bouge avec balle)
- Tester contre différents systèmes défensifs (man + over, man + switch, zone 2-3) pour voir si la réponse est crédible
- Exporter en playbook PDF pour vérifier la lisibilité figée
