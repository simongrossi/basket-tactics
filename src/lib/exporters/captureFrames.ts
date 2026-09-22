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
  /** Conversion des secondes en position renderer pour les durées variables. */
  stepAtSeconds?: (seconds: number) => number;
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
      const t = opts.stepAtSeconds ? opts.stepAtSeconds(i / Math.max(1, fps)) : i * dt;
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
