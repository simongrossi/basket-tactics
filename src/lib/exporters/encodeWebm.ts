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
