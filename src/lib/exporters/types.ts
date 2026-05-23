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
