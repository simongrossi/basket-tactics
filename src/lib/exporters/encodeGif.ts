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

  return new Promise<Blob>((resolve) => {
    gif.on('progress', (p: number) => onProgress?.(p));
    gif.on('finished', (blob: Blob) => resolve(blob));
    // gif.js n'expose pas d'événement d'erreur public — on n'a que finished.
    gif.render();
  });
};
