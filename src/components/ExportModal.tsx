'use client';

import { useRef, useState } from 'react';
import type { AppState } from '@/lib/types';
import { COURT, FULL_COURT_HEIGHT } from '@/lib/data/court';
import { totalDurationSeconds, secondsToFullStep } from '@/lib/logic/timecode';
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
        stepAtSeconds: (seconds) => secondsToFullStep(state, seconds),
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
              Démarrer l&apos;export
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
