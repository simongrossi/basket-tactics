'use client';

import type { useManualRecording } from '@/hooks/useManualRecording';

interface Props {
  recorder: ReturnType<typeof useManualRecording>;
  preparing: boolean;
  onStart: () => void;
  onCopy: () => void;
  onReplay: () => void;
}

const buttonStyle = { background: '#29313e', color: '#f8fafc', border: '1px solid #64748b', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12 };
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function ManualRecordingBar({ recorder, preparing, onStart, onCopy, onReplay }: Props) {
  const recording = recorder.status === 'recording';
  const previewing = recorder.status === 'replaying' || recorder.status === 'paused';
  const duration = recorder.snapshot?.recording.durationMs ?? 0;
  return (
    <div role="group" aria-label="Enregistrement des gestes" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '6px 8px', background: '#20252e', border: `1px solid ${recording ? '#f87171' : '#384152'}`, borderRadius: 8, color: '#e5e7eb', fontSize: 12 }}>
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
        <button type="button" style={buttonStyle} disabled={preparing} onClick={onStart}>{preparing ? 'Préparation…' : recorder.snapshot ? 'Nouvel enregistrement' : '● Enregistrer les gestes'}</button>
        {recorder.snapshot ? <>
          <span>Gestes enregistrés · {seconds(duration)}</span>
          <button type="button" style={buttonStyle} onClick={onReplay}>Rejouer les gestes</button>
          <button type="button" style={buttonStyle} onClick={onCopy}>Copier le code des gestes</button>
          <span style={{ color: '#9ca3af' }}>Copiez le code pour conserver l’enregistrement.</span>
        </> : <span style={{ color: '#9ca3af' }}>Gardez vos déplacements à la souris pour les partager ou revoir un bug.</span>}
      </>}
    </div>
  );
}
