# E.2 — Export GIF + WebM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au coach d'exporter une animation du système (terrain SVG, joueurs/ballon/annotations/notes en mouvement) en **GIF** (universel) ou **WebM** (léger), téléchargeable depuis une modal.

**Architecture:** L'export **pilote le renderer live** : un nouvel état `exportT` dans `Page` prime sur le scrub/playback dans `useCourtFrame`, ce qui force le SVG à afficher la frame demandée. Un capture loop avance `exportT` frame-à-frame, lit le SVG live via une ref, le sérialise (`XMLSerializer`/`outerHTML`) et le dessine sur un canvas. Deux encodeurs consomment ces canvases : `gif.js` (Web Worker) et `MediaRecorder` (WebM natif).

**Tech Stack:** TypeScript, React, SVG, `gif.js` (~20kB), `MediaRecorder`, `OffscreenCanvas`, Vitest.

**Pré-requis :** A.3 (notes texte) livré — les notes apparaissent dans le SVG et seront donc capturées sans effort supplémentaire.

---

### Task 1: Pure helper `computeFrameSchedule` + tests TDD

**Files:**
- Create: `src/lib/exporters/computeFrameSchedule.ts`
- Test: `src/lib/exporters/__tests__/computeFrameSchedule.test.ts`

- [ ] **Step 1: Write the failing test**

Créer `src/lib/exporters/__tests__/computeFrameSchedule.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { computeFrameSchedule } from '../computeFrameSchedule';

describe('computeFrameSchedule', () => {
  it('totalSeconds > 0, lastStepIdx > 0 — frameCount et dt cohérents', () => {
    const s = computeFrameSchedule({ totalSeconds: 4, lastStepIdx: 2, fps: 30 });
    expect(s.frameCount).toBe(120);
    // dt = lastStepIdx / (frameCount - 1) = 2 / 119
    expect(s.dt).toBeCloseTo(2 / 119, 6);
  });

  it("totalSeconds === 0 — au moins 1 frame, dt = 0", () => {
    const s = computeFrameSchedule({ totalSeconds: 0, lastStepIdx: 0, fps: 30 });
    expect(s.frameCount).toBe(1);
    expect(s.dt).toBe(0);
  });

  it("lastStepIdx === 0 (un seul step) — dt = 0 quelle que soit la durée", () => {
    const s = computeFrameSchedule({ totalSeconds: 2, lastStepIdx: 0, fps: 30 });
    expect(s.frameCount).toBe(60);
    expect(s.dt).toBe(0);
  });

  it("fps élevé arrondit le nombre de frames vers le haut", () => {
    const s = computeFrameSchedule({ totalSeconds: 1.1, lastStepIdx: 1, fps: 30 });
    expect(s.frameCount).toBe(33); // ceil(33)
  });

  it("totalSeconds < 0 clampé à 0 — au moins 1 frame", () => {
    const s = computeFrameSchedule({ totalSeconds: -1, lastStepIdx: 1, fps: 30 });
    expect(s.frameCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run computeFrameSchedule`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Write the implementation**

Créer `src/lib/exporters/computeFrameSchedule.ts` :

```ts
// E.2 — Cadencement d'un export : combien de frames et quel pas en `t` step.
// Pur, déterministe, sans dépendance DOM/React.

export interface FrameScheduleInput {
  /** Durée totale du système en secondes (1× canonique). */
  totalSeconds: number;
  /** Dernier step réel (state.steps.length - 1). */
  lastStepIdx: number;
  /** Images par seconde de l'export. */
  fps: number;
}

export interface FrameSchedule {
  /** Nombre total de frames à produire (>= 1). */
  frameCount: number;
  /** Incrément de `t` step entre deux frames consécutives. */
  dt: number;
}

export function computeFrameSchedule(input: FrameScheduleInput): FrameSchedule {
  const totalSeconds = Math.max(0, input.totalSeconds);
  const lastStepIdx = Math.max(0, input.lastStepIdx);
  const fps = Math.max(1, input.fps);
  const frameCount = Math.max(1, Math.ceil(totalSeconds * fps));
  const dt = frameCount > 1 ? lastStepIdx / (frameCount - 1) : 0;
  return { frameCount, dt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run computeFrameSchedule`
Expected: PASS (5 tests).

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exporters/computeFrameSchedule.ts src/lib/exporters/__tests__/computeFrameSchedule.test.ts
git commit -m "feat(exporters): E.2 — computeFrameSchedule pur + tests"
```

---

### Task 2: Plumbing `exportT` à travers `useCourtFrame`, `CourtView`, `Page`

**Files:**
- Modify: `src/hooks/useCourtFrame.ts`
- Modify: `src/components/CourtView.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Ajouter `exportT` aux options de `useCourtFrame`**

Dans `src/hooks/useCourtFrame.ts`, étendre l'interface des options avec :

```ts
  /** E.2 — Instant d'export (espace step). Quand défini, prime sur scrub
   *  et playback : c'est la frame que l'utilisateur capture. */
  exportT?: number | null;
```

L'extraire du `opts` aux côtés des autres :

```ts
const { state, isPlaying, playbackSpeed, playbackStartT, scrubT, exportT, onPlaybackTick, onPlaybackEnd, defenseReleaseTransition, liveMatchState } = opts;
```

Calculer une `exportFrame` mémoïsée, **avant** la définition de `frame` à la ligne ~256. Mirroite le calcul de `scrubFrame` :

```ts
  // E.2 — Frame d'export : mémoïsée sur exportT + state, sans mémoire de
  // playback (déterministe par t). Prime sur toutes les autres sources.
  const exportFrame = useMemo(() => {
    if (exportT == null) return null;
    const totalSteps = state.steps.length - 1;
    if (totalSteps <= 0) return null;
    const t = Math.max(0, Math.min(totalSteps, exportT));
    return resolveFrameAt(state, t);
  }, [exportT, state]);
```

(Si `useMemo` ou `resolveFrameAt` ne sont pas déjà importés en tête de fichier, les ajouter — `resolveFrameAt` vient de `@/lib/logic/playback/frameResolver`, déjà utilisé pour `scrubFrame`.)

Insérer `exportFrame` en tête de la chaîne de priorité ligne 256 :

```ts
const frame = exportFrame ?? liveMatchFrame ?? playFrame ?? scrubFrame ?? releaseFrame ?? staticFrame;
```

- [ ] **Step 2: Exposer `exportT` et `svgRef` via `CourtView`**

Dans `src/components/CourtView.tsx`, étendre l'interface des props de `CourtView` :

```ts
  /** E.2 — Instant d'export. Quand défini, prime sur le scrub et le
   *  playback (cf. useCourtFrame). */
  exportT?: number | null;
  /** E.2 — Ref externe sur le `<svg>` du terrain. Permet à `Page` de lire
   *  le SVG live pendant l'export. */
  externalSvgRef?: React.MutableRefObject<SVGSVGElement | null>;
```

Extraire dans le composant aux côtés des autres props (`props.exportT`, `props.externalSvgRef`).

Propager `exportT` à l'appel `useCourtFrame({...})` :

```ts
    exportT: props.exportT,
```

Connecter la ref externe sur le `<svg>` interne — repérer la ligne 312
`<svg ref={svgRef} ...>` et remplacer par un callback ref qui assigne aux deux :

```tsx
        ref={(el) => {
          (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = el;
          if (props.externalSvgRef) props.externalSvgRef.current = el;
        }}
```

(Le cast `as React.MutableRefObject<...>` est nécessaire parce que le `useRef<SVGSVGElement>(null)` existant a un type de `current` lecture seule.)

- [ ] **Step 3: État `exportT` + ref dans `Page`**

Dans `src/app/page.tsx`, ajouter parmi les autres `useState` (~ligne 49) :

```ts
  const [exportT, setExportT] = useState<number | null>(null);
  const courtSvgRef = useRef<SVGSVGElement | null>(null);
```

Trouver l'appel à `<CourtView ...>` dans le JSX et ajouter les deux props :

```tsx
              exportT={exportT}
              externalSvgRef={courtSvgRef}
```

- [ ] **Step 4: Verify typecheck and full suite**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: PASS — aucun comportement existant ne change, `exportT` est `null` par défaut donc `exportFrame === null` et la chaîne de priorité retombe sur l'existant. Confirmer aussi la suite garde-fou : `npx vitest run screens overlap userJson screenLab`, 164 verts.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCourtFrame.ts src/components/CourtView.tsx src/app/page.tsx
git commit -m "feat(courtview): E.2 — plumbing exportT + externalSvgRef (opt-in)"
```

---

### Task 3: Capture loop `captureFrames`

**Files:**
- Create: `src/lib/exporters/captureFrames.ts`

- [ ] **Step 1: Write the implementation**

Créer `src/lib/exporters/captureFrames.ts` :

```ts
// E.2 — Boucle de capture du terrain SVG pour l'export animé.
// L'export pilote le renderer live : à chaque frame on met à jour
// `exportT` (le `Page` propage à `CourtView` qui re-render), puis on lit
// le `<svg>` live, le sérialise, le dessine sur un canvas, et yield un
// ImageBitmap pour l'encodeur. Pas de duplication du moteur de rendu.

import { computeFrameSchedule } from './computeFrameSchedule';

export interface CaptureOptions {
  svgRef: { current: SVGSVGElement | null };
  setExportT: (t: number | null) => void;
  totalSeconds: number;
  lastStepIdx: number;
  width: number;
  height: number;
  fps: number;
  signal?: AbortSignal;
}

export class ExportAbortedError extends Error {
  constructor() {
    super('Export aborted');
    this.name = 'ExportAbortedError';
  }
}

/** Attend deux `requestAnimationFrame` consécutifs : après le premier,
 *  React a programmé un render ; après le deuxième, le commit est
 *  garanti et le SVG live reflète la nouvelle frame. */
function waitForRender(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function svgToImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('SVG image failed to load'));
    img.src =
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}

export async function* captureFrames(
  opts: CaptureOptions,
): AsyncGenerator<ImageBitmap, void, undefined> {
  const { svgRef, setExportT, totalSeconds, lastStepIdx, width, height, fps, signal } = opts;
  const { frameCount, dt } = computeFrameSchedule({ totalSeconds, lastStepIdx, fps });

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');

  try {
    for (let i = 0; i < frameCount; i++) {
      if (signal?.aborted) throw new ExportAbortedError();
      const t = i * dt;
      setExportT(t);
      await waitForRender();
      if (signal?.aborted) throw new ExportAbortedError();
      const svgEl = svgRef.current;
      if (!svgEl) throw new Error('SVG ref is null during capture');
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const img = await svgToImage(svgString);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      yield canvas.transferToImageBitmap();
    }
  } finally {
    // Rétablit la lecture normale, même en cas d'erreur/abort.
    setExportT(null);
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/exporters/captureFrames.ts
git commit -m "feat(exporters): E.2 — captureFrames (drive live SVG, yield bitmaps)"
```

---

### Task 4: Encodeurs GIF et WebM

**Files:**
- Modify: `package.json` (dépendance `gif.js`)
- Create: `public/gif.worker.js` (copie depuis `node_modules`)
- Create: `src/lib/exporters/encodeGif.ts`
- Create: `src/lib/exporters/encodeWebm.ts`
- Create: `src/lib/exporters/types.ts` (interface commune)

- [ ] **Step 1: Installer la dépendance `gif.js`**

Run: `npm install gif.js`
Run: `npm install --save-dev @types/gif.js`

Vérifier que `package.json` contient `"gif.js": "^x.y.z"` en `dependencies`.

- [ ] **Step 2: Copier le worker script**

Run: `cp node_modules/gif.js/dist/gif.worker.js public/gif.worker.js`

(Servi par Next.js à l'URL `/gif.worker.js` ; nécessaire car `gif.js`
n'inline pas son worker.)

- [ ] **Step 3: Interface commune des encodeurs**

Créer `src/lib/exporters/types.ts` :

```ts
// E.2 — Contrat commun aux encodeurs (GIF, WebM).

export interface EncodeOptions {
  fps: number;
  width: number;
  height: number;
  /** Progression 0..1. Appelé pendant l'encodage. */
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

export type FrameEncoder = (
  frames: AsyncIterable<ImageBitmap>,
  options: EncodeOptions,
) => Promise<Blob>;
```

- [ ] **Step 4: Encoder GIF**

Créer `src/lib/exporters/encodeGif.ts` :

```ts
// E.2 — Encodeur GIF via gif.js. Le worker tourne dans /gif.worker.js
// (copié depuis node_modules/gif.js/dist/gif.worker.js par le build).

import GIF from 'gif.js';
import type { EncodeOptions, FrameEncoder } from './types';
import { ExportAbortedError } from './captureFrames';

export const encodeGif: FrameEncoder = async function encodeGif(frames, options) {
  const { fps, width, height, onProgress, signal } = options;
  const delay = Math.round(1000 / fps);

  const gif = new GIF({
    workers: 2,
    quality: 10,
    width,
    height,
    workerScript: '/gif.worker.js',
  });

  // gif.js n'accepte pas ImageBitmap : on le re-dessine sur un canvas 2D.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  for await (const bitmap of frames) {
    if (signal?.aborted) throw new ExportAbortedError();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    gif.addFrame(ctx, { delay, copy: true });
    bitmap.close();
  }

  if (signal?.aborted) throw new ExportAbortedError();

  return new Promise<Blob>((resolve, reject) => {
    gif.on('progress', (p: number) => onProgress?.(p));
    gif.on('finished', (blob: Blob) => resolve(blob));
    // gif.js n'expose pas d'événement d'erreur public — on n'a que finished.
    gif.render();
  });
};
```

- [ ] **Step 5: Encoder WebM**

Créer `src/lib/exporters/encodeWebm.ts` :

```ts
// E.2 — Encodeur WebM via MediaRecorder + canvas.captureStream. Zéro
// dépendance externe ; le navigateur fait tout. vp9 préféré, vp8 puis
// auto en fallback.

import type { EncodeOptions, FrameEncoder } from './types';
import { ExportAbortedError } from './captureFrames';

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return 'video/webm';
}

export const encodeWebm: FrameEncoder = async function encodeWebm(frames, options) {
  const { fps, width, height, onProgress, signal } = options;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const stream = canvas.captureStream(fps);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  recorder.start();

  const frameMs = 1000 / fps;

  // Collecter d'abord toutes les frames (on a besoin du total pour le
  // pourcentage). En pratique l'itérable est consommé en streaming, mais
  // on doit aussi imposer la cadence côté MediaRecorder.
  const bitmaps: ImageBitmap[] = [];
  for await (const b of frames) {
    if (signal?.aborted) {
      recorder.stop();
      throw new ExportAbortedError();
    }
    bitmaps.push(b);
  }

  for (let i = 0; i < bitmaps.length; i++) {
    if (signal?.aborted) {
      recorder.stop();
      throw new ExportAbortedError();
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmaps[i], 0, 0);
    bitmaps[i].close();
    onProgress?.((i + 1) / bitmaps.length);
    await new Promise<void>((r) => setTimeout(r, frameMs));
  }

  recorder.stop();
  await stopped;
  return new Blob(chunks, { type: mimeType });
};
```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean. Si `@types/gif.js` est manquant ou incomplet, ajouter un
`declare module 'gif.js'` minimal dans un fichier `src/types/gif.d.ts` :

```ts
declare module 'gif.js' {
  interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
  }
  interface AddFrameOptions {
    delay?: number;
    copy?: boolean;
  }
  class GIF {
    constructor(options?: GIFOptions);
    addFrame(
      element: CanvasRenderingContext2D | HTMLCanvasElement | HTMLImageElement,
      options?: AddFrameOptions,
    ): void;
    on(event: 'progress', cb: (p: number) => void): void;
    on(event: 'finished', cb: (blob: Blob) => void): void;
    render(): void;
  }
  export default GIF;
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json public/gif.worker.js src/lib/exporters/types.ts src/lib/exporters/encodeGif.ts src/lib/exporters/encodeWebm.ts
# Si gif.d.ts a été créé :
git add src/types/gif.d.ts
git commit -m "feat(exporters): E.2 — encodeurs GIF (gif.js) et WebM (MediaRecorder)"
```

---

### Task 5: `ExportModal` + bouton + intégration `Page`

**Files:**
- Create: `src/components/ExportModal.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Composant `ExportModal`**

Créer `src/components/ExportModal.tsx` :

```tsx
'use client';

import { useRef, useState } from 'react';
import type { AppState } from '@/lib/types';
import { COURT, FULL_COURT_HEIGHT } from '@/lib/data/court';
import { totalDurationSeconds } from '@/lib/logic/timecode';
import { captureFrames, ExportAbortedError } from '@/lib/exporters/captureFrames';
import { encodeGif } from '@/lib/exporters/encodeGif';
import { encodeWebm } from '@/lib/exporters/encodeWebm';

type Phase = 'idle' | 'running' | 'done' | 'error';

interface Props {
  state: AppState;
  svgRef: React.MutableRefObject<SVGSVGElement | null>;
  setExportT: (t: number | null) => void;
  onClose: () => void;
}

const FPS = 30;

export function ExportModal({ state, svgRef, setExportT, onClose }: Props) {
  const [format, setFormat] = useState<'gif' | 'webm'>('gif');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalSeconds = totalDurationSeconds(state);
  const width = COURT.width;
  const height = state.fullCourt ? FULL_COURT_HEIGHT : COURT.height;
  const lastStepIdx = state.steps.length - 1;
  const estFrames = Math.max(1, Math.ceil(totalSeconds * FPS));

  const handleStart = async () => {
    setPhase('running');
    setProgress(0);
    setError(null);
    setBlob(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const frames = captureFrames({
        svgRef,
        setExportT,
        totalSeconds,
        lastStepIdx,
        width,
        height,
        fps: FPS,
        signal: controller.signal,
      });
      const encoder = format === 'gif' ? encodeGif : encodeWebm;
      const out = await encoder(frames, {
        fps: FPS,
        width,
        height,
        onProgress: setProgress,
        signal: controller.signal,
      });
      setBlob(out);
      setPhase('done');
    } catch (e) {
      if (e instanceof ExportAbortedError) {
        // Annulation silencieuse, on ferme.
        onClose();
        return;
      }
      setError(e instanceof Error ? e.message : 'export failed');
      setPhase('error');
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownload = () => {
    if (!blob) return;
    const ext = format === 'gif' ? 'gif' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `systeme_basket.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'running') onClose(); }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 8, minWidth: 360, maxWidth: 480,
          padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>🎥 Exporter le système</h3>
          {phase !== 'running' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
          )}
        </div>

        {phase === 'idle' && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              <label style={{ display: 'block', marginBottom: 6 }}>
                <input type="radio" name="fmt" checked={format === 'gif'} onChange={() => setFormat('gif')} />
                {' '}GIF — universel (Slack, iMessage, X), fichier lourd
              </label>
              <label style={{ display: 'block' }}>
                <input type="radio" name="fmt" checked={format === 'webm'} onChange={() => setFormat('webm')} />
                {' '}WebM — léger, lecture moderne, pas tous les clients
              </label>
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              Durée : {totalSeconds.toFixed(1)}s · {estFrames} frames @ {FPS} FPS · {width}×{height} px
            </div>
            <button onClick={handleStart} style={{ padding: '6px 14px', cursor: 'pointer' }}>
              Démarrer l'export
            </button>
          </>
        )}

        {phase === 'running' && (
          <>
            <div style={{ marginBottom: 8, fontSize: 13 }}>Encodage en cours…</div>
            <div style={{ background: '#eee', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: '#3b82f6' }} />
            </div>
            <button onClick={handleCancel} style={{ padding: '4px 10px', cursor: 'pointer' }}>
              Annuler
            </button>
          </>
        )}

        {phase === 'done' && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#0a0' }}>
              Export prêt — {((blob?.size ?? 0) / 1024 / 1024).toFixed(2)} MB.
            </div>
            <button onClick={handleDownload} style={{ padding: '6px 14px', cursor: 'pointer', marginRight: 8 }}>
              ⬇ Télécharger
            </button>
            <button onClick={() => { setPhase('idle'); setBlob(null); }} style={{ padding: '6px 14px', cursor: 'pointer' }}>
              Refaire un export
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#b00' }}>Erreur : {error}</div>
            <button onClick={() => setPhase('idle')} style={{ padding: '6px 14px', cursor: 'pointer' }}>
              Réessayer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Bouton + modal dans `Page`**

Dans `src/app/page.tsx`, ajouter l'import en tête :

```ts
import { ExportModal } from '@/components/ExportModal';
```

Ajouter parmi les `useState` (~ligne 49) :

```ts
  const [showExportModal, setShowExportModal] = useState(false);
```

Ajouter le bouton dans le header, à côté des autres boutons (chercher
`🎬 plein écran` ou `🔳 plein écran` dans le JSX et insérer un sibling) :

```tsx
            <button
              onClick={() => setShowExportModal(true)}
              title="Exporter le système en GIF ou WebM"
              style={{ padding: '4px 10px', fontSize: 13 }}
            >
              🎥 exporter
            </button>
```

(Le style exact dépend du conteneur ; copier celui des boutons voisins.)

En fin de JSX, rendre conditionnellement la modal :

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

- [ ] **Step 3: Verify typecheck and full suite**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: PASS — l'ajout est entièrement opt-in (la modal ne s'ouvre que sur clic). Aucun test existant ne devrait changer.

- [ ] **Step 4: Smoke test manuel**

`npm run dev` → cliquer `🎥 exporter` → choisir GIF → Démarrer →
attendre la fin → Télécharger → ouvrir le `.gif` dans un navigateur,
vérifier que l'animation montre bien le système.
Refaire pour WebM.

Si une étape échoue, NE PAS commiter avant diagnostic.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExportModal.tsx src/app/page.tsx
git commit -m "feat(ui): E.2 — ExportModal + bouton 🎥 exporter dans Page"
```

---

### Task 6: Validation finale + ROADMAP

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run the Règle 1bis guard suite**

Run: `npx vitest run screens overlap userJson screenLab`
Expected: PASS (164 verts). L'export ne touche aucun moteur défense/écran ;
vérification systématique malgré tout.

- [ ] **Step 2: Run the full suite**

Run: `npx vitest run`
Expected: PASS sur l'intégralité, avec ~5 nouveaux tests
(`computeFrameSchedule`).

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Update ROADMAP**

Dans `ROADMAP.md`, repérer la ligne du chantier E.2 (commence par
`| E.2 | Export GIF / vidéo`). La remplacer par :

```
| ~~E.2~~ | ~~**Export GIF / WebM**~~ : modal d'export du terrain animé (GIF universel ou WebM léger). Pilote le renderer live via un nouvel état `exportT` qui prime sur scrub/playback. Encodage gif.js (Web Worker) et MediaRecorder natif. Téléchargement direct via Blob. | — | — | 🟢 livré 2026-05-23 |
```

Mettre à jour également la table de synthèse `UX / Produit — N chantiers restants` plus haut : barrer la ligne `6 | Export GIF/vidéo` (mirror du pattern A.2 / A.3 / B.2).

- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): E.2 — export GIF/WebM livré"
```

---

## Notes de fin de plan

- **Opt-in par construction.** `exportT === null` par défaut → `exportFrame === null` → la chaîne de priorité retombe sur l'existant. Aucun changement de comportement utilisateur tant qu'on ne clique pas le bouton.
- **Hors V1.** Pas de range custom, pas de FPS configurable, pas de MP4 (ffmpeg.wasm), pas de watermark, pas d'audio, pas de capture du PlaybookView. Tous follow-ups éventuels.
- **Coupling DOM assumé.** `captureFrames` lit le SVG live et drive `exportT` — pas un module pur. Une refonte « headless » dupliquerait `CourtView` et serait fragile à toute évolution visuelle. Le coupling est le bon choix.
- **Worker script.** `public/gif.worker.js` doit rester en sync avec la version de `gif.js` ; si `gif.js` est mis à jour, recopier le worker depuis `node_modules`.
