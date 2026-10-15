'use client';

import type { useManualRecording } from '@/hooks/useManualRecording';

interface Props {
  recorder: ReturnType<typeof useManualRecording>;
  preparing: boolean;
  onStart: () => void;
  onCopy: () => void;
  onReplay: () => void;
}

const buttonStyle = {
  background: 'var(--bt-btn-bg)',
  color: 'var(--bt-btn-text)',
  border: '1px solid var(--bt-btn-border)',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function ManualRecordingBar({ recorder, preparing, onStart, onCopy, onReplay }: Props) {
  const recording = recorder.status === 'recording';
  const previewing = recorder.status === 'replaying' || recorder.status === 'paused';
  const duration = recorder.snapshot?.recording.durationMs ?? 0;
  const isActive = recording || previewing || !!recorder.snapshot;

  if (!isActive && !preparing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 4px' }}>
        <button
          type="button"
          style={{ ...buttonStyle, padding: '3px 8px', fontSize: 11, opacity: 0.8 }}
          onClick={onStart}
          title="Enregistrer les déplacements de souris et la réaction défensive pour partager ou déboguer"
          className="bt-touch"
        >
          ● Enregistrer les gestes
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Enregistrement des gestes"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '6px 8px',
        background: 'var(--bt-surface)',
        border: `1px solid ${recording ? '#f87171' : 'var(--bt-border)'}`,
        borderRadius: 8,
        color: 'var(--bt-text)',
        fontSize: 12,
      }}
    >
      {recording ? <>
        <strong style={{ color: '#fca5a5' }}>● Enregistrement · {seconds(recorder.elapsedMs)}</strong>
        <span>Déplacez les joueurs. La réaction de la défense est enregistrée aussi.</span>
        <button type="button" style={buttonStyle} onClick={recorder.stop}>Arrêter l’enregistrement</button>
        <span style={{ color: '#9ca3af' }}>60 s maximum</span>
      </> : previewing ? <>
        <strong>Relecture des gestes</strong>
        <button type="button" style={buttonStyle} onClick={recorder.status === 'replaying' ? recorder.pause : recorder.replay}>{recorder.status === 'replaying' ? 'Pause' : recorder.elapsedMs >= duration ? 'Rejouer' : 'Lire'}</button>
        <input aria-label="Position dans les gestes enregistrés" type="range" min={0} max={duration} step={10} value={recorder.elapsedMs} onChange={event => recorder.seek(Number(event.target.value))} style={{ flex: '1 1 120px', accentColor: '#fb923c' }} />
        <span>{seconds(recorder.elapsedMs)} / {seconds(duration)}</span>
        <button type="button" style={buttonStyle} onClick={onCopy}>Copier le code des gestes</button>
        <button type="button" style={buttonStyle} onClick={recorder.closeReplay}>Retour au terrain</button>
      </> : <>
        <button type="button" style={buttonStyle} disabled={preparing} onClick={onStart}>{preparing ? 'Préparation…' : '● Nouvel enregistrement'}</button>
        {recorder.snapshot ? <>
          <span>Gestes enregistrés · {seconds(duration)}</span>
          <button type="button" style={buttonStyle} onClick={onReplay}>Rejouer les gestes</button>
          <button type="button" style={buttonStyle} onClick={onCopy}>Copier le code des gestes</button>
          <button type="button" style={{ ...buttonStyle, color: '#94a3b8' }} onClick={recorder.closeReplay}>Fermer</button>
        </> : null}
      </>}
    </div>
  );
}
