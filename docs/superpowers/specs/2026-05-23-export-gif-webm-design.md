# E.2 — Export GIF / WebM — Design

Date : 2026-05-23
Statut : design validé, prêt pour plan d'implémentation.

## Problème

Le coach ne peut pas partager une animation de système sur Slack, WhatsApp,
X ou iMessage sans demander au destinataire d'ouvrir l'app. Aucun export
animé n'existe — l'export actuel est le PDF du playbook (statique, généré
via `window.print()`).

E.2 ajoute un export animé du jeu, téléchargeable depuis le navigateur.

## Décisions de design

| Sujet | Décision |
|---|---|
| Formats | **GIF + WebM**. Choix dans la modal. GIF = universel (Slack/iMessage). WebM = léger (Chat web/X). |
| Zone capturée | **Le SVG du terrain uniquement** — joueurs, annotations, notes texte, ballon. Pas de HUD ni de panneaux. |
| Trigger | Bouton **`🎥 exporter`** dans le header, à côté de `📚 Bibliothèque` / `🎬 plein écran`. |
| FPS V1 | 30 (non configurable). |
| Vitesse V1 | 1× canonique (indépendant de `state.playbackSpeed`). |
| Range V1 | Système entier (step 0 → dernier step). |

## Section 1 — Boucle de capture `captureFrames.ts`

Nouveau fichier `src/lib/exporters/captureFrames.ts`.

**Rôle.** Produire un itérable async de `ImageBitmap` (une par frame) qui
restituent le terrain animé du système au pas de temps demandé.

**Architecture honnête.** L'export pilote le *renderer live* — il ne
duplique pas le moteur de rendu SVG. Concrètement, la modal d'export :
1. Possède une ref vers le `<svg>` du terrain (`svgRef`) et un setter pour
   l'instant de scrub `setExportT: (t: number | null) => void`.
2. À chaque itération, met à jour `exportT`, attend un `requestAnimationFrame`
   (le temps que React re-render le SVG avec la frame voulue), puis lit le
   `<svg>` live et le pipe dans un canvas.

`captureFrames` encapsule cette boucle en un itérable propre :

```ts
export interface CaptureOptions {
  svgRef: { current: SVGSVGElement | null };
  setExportT: (t: number | null) => void;
  totalSeconds: number;       // durée 1× canonique
  lastStepIdx: number;        // dernier step réel
  width: number;              // largeur cible du canvas
  height: number;             // hauteur cible du canvas
  fps: number;
  signal?: AbortSignal;
}

export async function* captureFrames(opts: CaptureOptions): AsyncIterable<ImageBitmap>
```

**Algorithme.**

1. `frameCount = Math.ceil(totalSeconds * fps)` ; `dt = lastStepIdx / (frameCount - 1)`.
2. Construire un `OffscreenCanvas` aux dimensions cibles.
3. Pour `i` de 0 à `frameCount - 1` :
   - Vérifier `signal.aborted` → arrêter.
   - `t = i * dt`.
   - `setExportT(t)` → déclenche la re-render React du SVG via le state du
     `Page` (qui propage à `CourtView` comme s'il s'agissait d'un scrub).
   - `await new Promise(r => requestAnimationFrame(r))` puis un second `rAF`
     pour garantir que la frame React est commitée.
   - Lire `svgRef.current.outerHTML`, encoder en data-URL `image/svg+xml`
     (avec `encodeURIComponent` pour les caractères non-ASCII).
   - Charger dans un `Image` (Promise sur `img.onload`), `drawImage` sur le
     canvas, `yield canvas.transferToImageBitmap()`.
4. En sortie de boucle, `setExportT(null)` (rétablit la lecture normale).

**Pourquoi pas pur.** Une alternative purement headless (rendre le SVG en
chaîne sans toucher au DOM live) demanderait de dupliquer toute la logique
de rendu de `CourtView` (background terrain, joueurs, annotations, notes).
Trop coûteux pour V1, et fragile (toute évolution visuelle ferait diverger
l'export du rendu live). Piloter le live est l'option robuste : ce qu'on
voit = ce qu'on exporte.

**Coupling au `Page`.** `Page` doit exposer un état `exportT` qui prime sur
`scrubT` quand défini, et le passer à `CourtView`. Trois lignes :
`const [exportT, setExportT] = useState<number | null>(null)`, ajout dans
`CourtView` props `exportT?: number | null`, prioritisation
`exportT ?? scrubT ?? playbackT` dans `useCourtFrame`.

**Réutilisation.** `totalDurationSeconds(state)` pour la durée canonique
(B.1). `resolveFrameAt` est appelé indirectement via la re-render de
`CourtView` — aucun branchement direct.

## Section 2 — Encodeur GIF (`encodeGif.ts`)

Nouveau fichier `src/lib/exporters/encodeGif.ts`. Wrappe `gif.js`.

**Signature** :

```ts
export async function encodeGif(
  frames: AsyncIterable<ImageBitmap>,
  options: { fps: number; width: number; height: number; onProgress?: (p: number) => void; signal?: AbortSignal },
): Promise<Blob>
```

**Implémentation.** Instancie un `GIF` (de `gif.js`) avec
`workers: 2, quality: 10, workerScript: '/gif.worker.js'`. Pour chaque
`ImageBitmap` consommée, le dessine sur un canvas 2D intermédiaire (gif.js
n'accepte pas `ImageBitmap` directement) et l'ajoute via
`gif.addFrame(ctx, { delay: 1000/fps, copy: true })`. À la fin,
`gif.on('finished', blob => resolve(blob))` + `gif.render()`. Progress
relayé via `gif.on('progress', ...)`.

**Dépendance.** Ajouter `gif.js` à `package.json` (~20kB gzipped). Le worker
script `gif.worker.js` doit être servi en static — copié dans `public/`.

**Abort.** Si `signal.aborted`, ne pas appeler `gif.render()` et résoudre
avec une erreur typée `ExportAbortedError`.

## Section 3 — Encodeur WebM (`encodeWebm.ts`)

Nouveau fichier `src/lib/exporters/encodeWebm.ts`. Utilise `MediaRecorder`.

**Signature** identique à `encodeGif`.

**Implémentation.**

1. Créer un canvas 2D (visible OffscreenCanvas → canvas hors-DOM 2D) aux
   dimensions cibles.
2. `canvas.captureStream(fps)` → `MediaStream`.
3. `new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })` ;
   fallback `vp8` puis sans codec spécifié si non supporté.
4. Boucle : pour chaque `ImageBitmap` consommé, le dessiner sur le canvas
   (qui pilote le stream), `await new Promise(r => setTimeout(r, 1000/fps))`
   pour respecter la cadence (le `MediaRecorder` capture en temps réel).
5. `recorder.ondataavailable` accumule les `Blob` chunks.
6. À la fin du flux : `recorder.stop()` → `recorder.onstop` résout avec le
   `Blob` final.

**Aucune dépendance externe.**

**Abort.** Si `signal.aborted` à n'importe quelle itération, `recorder.stop()`
et résoudre avec `ExportAbortedError`.

## Section 4 — UI `ExportModal`

Nouveau composant `src/components/ExportModal.tsx`. Pattern modal cohérent
avec `LibraryModal` (fermeture Échap / clic extérieur / `×`).

**État local.**
- `format: 'gif' | 'webm'` (par défaut `'gif'`).
- `phase: 'idle' | 'capturing' | 'encoding' | 'done' | 'error'`.
- `progress: number` (0..1).
- `blob: Blob | null`.
- `error: string | null`.
- `abortRef = useRef<AbortController | null>(null)`.

**Affichage.**

- **`idle`** : radios « GIF » / « WebM », info « durée totale ≈ Xs · ~Y frames »
  (calcul `totalDurationSeconds(state)`), bouton « Démarrer l'export ».
- **`capturing` / `encoding`** : barre de progression + bouton « Annuler »
  (déclenche `abortRef.current?.abort()`).
- **`done`** : bouton « Télécharger » + bouton « Refaire un export ».
  Le téléchargement crée `URL.createObjectURL(blob)` + `<a download>`,
  nom de fichier `systeme_basket.<ext>` (mirror du pattern JSON existant).
- **`error`** : message d'erreur + bouton « Réessayer ».

**Pipeline au clic « Démarrer ».** `ExportModal` reçoit en props `svgRef`
et `setExportT` (fournis par `Page`) :

```ts
const controller = new AbortController();
abortRef.current = controller;
setPhase('capturing');
const totalSeconds = totalDurationSeconds(state);
const lastStepIdx = state.steps.length - 1;
const frames = captureFrames({
  svgRef, setExportT,
  totalSeconds, lastStepIdx,
  width: COURT_WIDTH, height: COURT_HEIGHT,
  fps: 30, signal: controller.signal,
});
setPhase('encoding');
const encoder = format === 'gif' ? encodeGif : encodeWebm;
const blob = await encoder(frames, {
  fps: 30, width: COURT_WIDTH, height: COURT_HEIGHT,
  onProgress: setProgress, signal: controller.signal,
});
setBlob(blob);
setPhase('done');
```

**Erreurs.** `ExportAbortedError` → ferme la modal silencieusement.
Autre erreur → phase `'error'` avec message lisible.

## Section 5 — Intégration dans `Page` + `CourtView`

`src/app/page.tsx` :

1. Nouvel état :
   ```ts
   const [showExportModal, setShowExportModal] = useState(false);
   const [exportT, setExportT] = useState<number | null>(null);
   const courtSvgRef = useRef<SVGSVGElement | null>(null);
   ```
2. Passe `exportT` et `svgRef={courtSvgRef}` à `<CourtView>`.
3. Ajoute le bouton dans le header (proximité `📚 Bibliothèque` / `🎬 plein écran`) :
   ```tsx
   <button onClick={() => setShowExportModal(true)} title="Exporter le système en GIF ou WebM">
     🎥 exporter
   </button>
   ```
4. En fin de JSX, rend conditionnellement :
   ```tsx
   {showExportModal && (
     <ExportModal
       state={app.state}
       svgRef={courtSvgRef}
       setExportT={setExportT}
       onClose={() => setShowExportModal(false)}
     />
   )}
   ```

`src/components/CourtView.tsx` :

1. Nouvelle prop `exportT?: number | null` + `svgRef?: React.RefObject<SVGSVGElement>`.
2. `svgRef` câblé sur le `<svg>` racine du terrain (`ref={props.svgRef}`).
3. Dans `useCourtFrame` (ou son consommateur), la priorité devient
   `exportT ?? scrubT ?? playbackT` — `exportT` prime sur tout, garantissant
   que la frame affichée pendant l'export correspond à la frame capturée.

## Section 6 — Tests

`captureFrames` est inhérent au DOM (drive React + lit le SVG live), donc
peu testable unitairement. Stratégie :

- **Test ciblé du calcul de cadencement** : extraire une mini-fonction pure
  `computeFrameSchedule(totalSeconds, lastStepIdx, fps): { frameCount: number; dt: number }`
  (utilisée par `captureFrames`) et la tester (cas standards, bornes,
  `totalSeconds === 0`).
- **Test de l'`AbortSignal`** via un faux `svgRef` (objet avec un
  `outerHTML` figé) et un faux `setExportT` — vérifie qu'après `abort()`,
  l'itérable n'émet plus de frames.
- **`encodeGif`, `encodeWebm`** : wiring sur APIs navigateur. Pas de test
  unitaire — convention projet (pas de test composant React, pas de mock de
  `MediaRecorder`/Web Worker). Vérification fonctionnelle = test manuel
  (smoke documenté dans le plan).
- **`ExportModal`** : pas de test unitaire (convention projet).
- **Règle 1bis** : suite garde-fou (`screens*`/`overlap*`/`userJson*`/`screenLab*`)
  doit rester verte. L'export ne touche aucune logique défense / écran ;
  vérification systématique malgré tout, et `Page` / `CourtView` sont
  modifiés (ajout d'état et d'une prop) — le test composant existant
  `CourtView.interactions.test.tsx` doit rester vert.

## Hors périmètre V1 (YAGNI)

- **MP4** (nécessiterait `ffmpeg.wasm` ~25 MB).
- Range custom (export d'une sous-séquence d'étapes).
- FPS configurable.
- Watermark / branding.
- Audio (les passes/tirs n'ont pas de son côté app).
- Capture en mode présentation (avec HUD).
- Capture du PlaybookView (slides statiques) — différent du jeu animé.
- Reprise / pause de l'export.

## Fichiers touchés

- **Créer** : `src/lib/exporters/captureFrames.ts` + tests,
  `src/lib/exporters/encodeGif.ts`, `src/lib/exporters/encodeWebm.ts`,
  `src/components/ExportModal.tsx`, `public/gif.worker.js` (copié depuis
  `node_modules/gif.js/dist/gif.worker.js`).
- **Modifier** : `src/app/page.tsx` (bouton + état modal),
  `package.json` (`gif.js` en dépendance).
