# Partager une situation, une animation ou des gestes avec un code

Dans le menu **Actions globales (…)**, choisir **Copier la situation (code)**,
puis **Copier le code**. Envoyer le texte à un autre coach ou le joindre à un
signalement de bug. Le destinataire utilise **Coller une situation / animation**,
colle le texte et clique sur **Charger la situation**. Si l’accès au
presse-papiers est refusé, les raccourcis de copie et collage fonctionnent
dans le champ. Le brouillon précédent est protégé par le même mécanisme
que les imports JSON et les chargements depuis la bibliothèque.

Le code conserve l’état complet du système : positions initiales,
possession, étapes précédentes et suivantes, étape active, annotations,
consignes et réglages individuels, système de zone, overrides manuels,
scénario, branches, seed aléatoire et réglages physiques. Les noms et
numéros personnalisés font également partie du code. L’identité locale
`librarySystemId` est exclue, de même que la bibliothèque et la pile
Annuler/Rétablir de l’émetteur.

Lors d’une copie depuis le terrain, le code inclut aussi la frame affichée
(positions offensives et défensives, ballon, cibles et métadonnées du moteur).
Cette frame sert de preuve pour analyser une différence entre le calcul et
l’affichage. Elle ne devient **jamais** une série d’overrides défensifs :
les défenseurs automatiques restent automatiques après import.
Un curseur de lecture fractionnaire est restauré en pause. Une animation
en cours est recalculée depuis l’état importé ; son inertie transitoire
exacte n’est pas rejouée. Une frame issue du match IA (`source: "live"`)
est un instantané de diagnostic, pas une sauvegarde permettant de reprendre
le match en cours.

Pour un bug de déplacement, utiliser l’enregistrement des gestes (`BTG1`,
ci-dessous). Sans enregistrement, joindre idéalement **un code avant le
geste**, **un code après le geste**, le joueur déplacé et la direction du mouvement.

## Partager une animation

**Copier l’animation (code)** produit un code `BTA1:` contenant toute la
séquence, ses durées, le point de départ et la vitesse de lecture. Le point
de départ est un index d’étape, éventuellement fractionnaire ; le début de
la séquence vaut `0`. La vitesse conserve le réglage du lecteur, entre
`0.3` et `2` fois la vitesse normale. Au moins deux étapes sont nécessaires.
Les branches de scénario, les annotations et leurs fenêtres temporelles,
les décisions aléatoires déjà fixées et les réglages de défense voyagent
avec le code. Le destinataire le colle dans le même champ d’import.

L’animation est recalculée par le moteur à partir de ces étapes et actions.
Une même version du moteur reproduit les mêmes frames de timeline avec
ces réglages. L’instantané de diagnostic facultatif reste indépendant du
point de départ choisi. Pour analyser les déplacements manuels non dessinés
en étapes, utiliser l’enregistrement de gestes `BTG1`. Les codes d’animation
refusent les instantanés du match IA en direct, dont l’état transitoire
n’est pas une timeline enregistrée.

## Enregistrer et transmettre des gestes manuels

Au-dessus du terrain, cliquer **Enregistrer les gestes**, déplacer les joueurs,
puis **Arrêter l’enregistrement**. **Rejouer les gestes** ouvre une lecture avec
pause et curseur ; **Retour au terrain** retrouve le brouillon. **Copier le code
des gestes** permet de conserver la capture avant de fermer la page ou de lancer
un nouvel enregistrement. Le destinataire utilise **Actions globales (…) →
Coller une situation / animation → Rejouer les gestes**. Cette relecture ne
remplace pas son brouillon.

Le code `BTG1:` contient l’état complet **au début de l’enregistrement**,
puis deux traces horodatées en millisecondes : les déplacements demandés
par le coach et les positions effectivement affichées après les contraintes
de déplacement et les réactions défensives. Un drag demandé à `x=900` peut
ainsi être associé à une position réellement affichée à `x=460`. Cette
distinction permet d’analyser les collisions, la poursuite et les sauts.

La capture s’effectue dans l’éditeur, avec l’outil Déplacer, sur une seule
étape active. Les autres étapes et tous les réglages restent dans l’état
initial pour reproduire le contexte. Les frames contiennent les positions
des attaquants, des défenseurs et du ballon, ainsi que le porteur, le joueur
marqué et les orientations du corps et du regard de chaque défenseur.
Les événements `begin`, `move` et `end` conservent les gestes demandés.

La fréquence maximale est de 20 images par seconde (un échantillon toutes
les 50 ms), sur 60 secondes au plus. Le format accepte jusqu’à 1 202 frames
pour inclure les bornes et 10 000 événements. Un arrêt immédiat ou une
capture stationnaire est valide : une frame à `t=0`, zéro événement.

La relecture affiche les positions enregistrées sans interpolation
temporelle entre deux échantillons, afin de conserver les sauts observés.
Les poses auxiliaires, notamment les bras, peuvent être recalculées à partir
de la géométrie enregistrée. La défense n’est pas resimulée pendant cette
relecture et les coordonnées capturées ne deviennent pas des overrides
manuels dans le système. Les gestes du match IA en direct et la lecture
de la timeline utilisent des mécanismes différents de cette capture.

## Formats BT1, BTA1 et BTG1

`BT1:`, `BTA1:` ou `BTG1:` suivi d’un texte Base64url sans padding contenant du JSON UTF-8
compressé avec DEFLATE (enveloppe zlib, `CompressionStream('deflate')`).
Les retours à la ligne et espaces ajoutés par la messagerie sont acceptés.

```ts
{
  version: 1,
  state: AppState, // sans librarySystemId
  view?: {
    time: number | null, // index d’étape fractionnaire ; null = édition
    source: 'editor' | 'timeline' | 'live',
    frame?: PlaybackFrame
  },
  // Obligatoire uniquement pour BTA1.
  animation?: { startT: number, speed: number },
  // Obligatoire uniquement pour BTG1 ; exclusif d’animation.
  recording?: {
    durationMs: number,
    frames: ManualGestureFrame[],
    events: ManualGestureEvent[]
  }
}
```

API : `encodeSituationCode(state, view?)`,
`encodeAnimationCode(state, { startT, speed }, view?)`,
`encodeGestureCode(initialState, recording)` et
`decodeSituationCode(code)` dans `src/lib/state/situationCode.ts`.
Les types `ManualGestureFrame`, `ManualGestureEvent` et `ManualRecording`,
ainsi que les limites de capture, sont exportés par
`src/lib/state/manualGestures.ts`. Tous les joueurs actifs sont présents
dans chaque frame ; les identifiants des joueurs hors format sont refusés.
Les temps sont finis, positifs ou nuls, croissants au sens large et bornés
par `durationMs`. La première frame est à `0` ; la dernière peut précéder
la durée finale, auquel cas sa position reste affichée jusqu’à la fin.

Le décodeur commun retourne `{ state, view?, animation?, recording? }` et
accepte les anciens codes `BT1` et `BTA1` sans changement. Il refuse une
discordance entre le préfixe et le contenu : changer le préfixe ne suffit
pas à convertir un code. Il refuse également une version
inconnue, un état structurellement invalide, plus de 750 000 caractères
encodés ou plus de 2 000 000 octets décompressés. La décompression est
bornée pendant la lecture du flux. L’interface passe l’état décodé à
`app.importState`, qui protège le brouillon et applique les migrations.

## Décoder un code pour le diagnostic

Enregistrer le code reçu dans `situation.txt`, puis exécuter avec Node :

```sh
node --input-type=module -e '
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
const code = readFileSync(process.argv[1], "utf8").replace(/\s/g, "");
const header = /^(BT1:|BTA1:|BTG1:)/.exec(code);
if (!header) throw new Error("Version inconnue");
const payload = inflateSync(Buffer.from(code.slice(header[0].length), "base64url"), { maxOutputLength: 2000000 });
console.log(JSON.stringify(JSON.parse(payload), null, 2));
' situation.txt > situation.json
```

Comparer `state.steps[state.activeStep]`, `state.defenseInitial`,
`state.rules`, `state.zoneConfig`, puis les positions réellement affichées
dans `view.frame.off` et `view.frame.defPos`. Les positions défenseurs sont
les champs `x` et `y` de chaque `ComputedDefender`. Conserver le fichier
original pour reproduire le calcul avec le code moteur correspondant.
Pour `BTA1`, lire aussi `animation.startT` et `animation.speed` ; les
conversions `fullStepToSeconds` / `secondsToFullStep` appliquent les durées
par étape, et `resolveTimelineFrame` reconstruit les positions à chaque instant.
Pour `BTG1`, comparer `recording.events` (demande de mouvement) aux frames
voisines dans `recording.frames` (réponse affichée). Un saut de D5 est
directement visible dans les différences entre `frames[i].def.D5` et
`frames[i+1].def.D5`. Garder les timestamps exacts, sans lisser les données
avant l’analyse.
