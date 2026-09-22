'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { decodeSituationCode, encodeSituationCode, encodeAnimationCode, encodeGestureCode, type SituationSnapshot } from '@/lib/state/situationCode';
import { SIDEBAR } from '@/components/sidebar/tokens';

interface Props {
  mode: 'copy' | 'animation' | 'gestures' | 'import';
  snapshot: SituationSnapshot;
  onImport: (snapshot: SituationSnapshot) => boolean;
  onClose: () => void;
}

export function SituationCodeModal({ mode, snapshot, onImport, onClose }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(mode !== 'import');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const copying = mode !== 'import';
  const animation = mode === 'animation';
  const gestures = mode === 'gestures';
  const [fromCurrentPosition, setFromCurrentPosition] = useState(false);
  const importingAnimation = !copying && /^BTA\d+:/.test(code.trim());
  const importingGestures = !copying && /^BTG\d+:/.test(code.trim());

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    textareaRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (!copying) return;
    let cancelled = false;
    setBusy(true);
    setCode('');
    setError('');
    setMessage('');
    if (animation && (snapshot.state.steps.length < 2 || snapshot.view?.source === 'live')) {
      setError(snapshot.view?.source === 'live'
        ? 'Le code d’animation partage la lecture des étapes du système. Arrêtez le match IA pour partager cette lecture.'
        : 'Dessinez une action ou ajoutez une étape avant de partager une animation.');
      setBusy(false);
      return;
    }
    const result = gestures
      ? snapshot.recording ? encodeGestureCode(snapshot.state, snapshot.recording) : Promise.reject(new Error('Aucun geste enregistré.'))
      : animation
      ? encodeAnimationCode(snapshot.state, {
        startT: fromCurrentPosition ? snapshot.animation?.startT ?? 0 : 0,
        speed: snapshot.animation?.speed ?? 1,
      }, snapshot.view)
      : encodeSituationCode(snapshot.state, snapshot.view);
    result.then(result => {
      if (!cancelled) setCode(result);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Impossible de créer le code.');
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [copying, animation, gestures, fromCurrentPosition, snapshot]);

  const copyCode = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(code);
      setMessage('Code copié. Vous pouvez le coller dans votre message.');
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      setMessage('Le code est sélectionné : utilisez ⌘C ou Ctrl+C pour le copier.');
    }
  };

  const pasteCode = async () => {
    setError('');
    try {
      const pasted = await navigator.clipboard.readText();
      if (pasted.trim()) {
        setCode(pasted);
        setMessage('');
      } else {
        textareaRef.current?.focus();
        setMessage('Le presse-papiers est vide. Collez votre code dans le champ avec ⌘V ou Ctrl+V.');
      }
    } catch {
      textareaRef.current?.focus();
      setMessage('Collez le code dans le champ avec ⌘V ou Ctrl+V.');
    }
  };

  const importCode = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await decodeSituationCode(code);
      if (onImport(result)) onClose();
      else setError('Import annulé. Votre situation actuelle est conservée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger cette situation.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="situation-code-title"
        aria-describedby="situation-code-description"
        style={{ width: 'min(620px, 100%)', maxHeight: '90vh', overflow: 'auto', background: SIDEBAR.bg, color: SIDEBAR.text, border: `1px solid ${SIDEBAR.border}`, borderRadius: 12, padding: 22, boxShadow: '0 16px 48px rgba(0,0,0,0.4)' }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            if (!busy) onClose();
          }
          if (e.key === 'Tab') {
            const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('*') ?? [])
              .filter(el => (el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && !(el as HTMLButtonElement).disabled);
            if (!elements?.length) return;
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <h2 id="situation-code-title" style={{ margin: 0, fontSize: 19 }}>{gestures ? 'Copier les gestes enregistrés' : animation ? 'Copier l’animation' : copying ? 'Copier la situation' : 'Coller une situation ou animation'}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" style={buttonStyle}>×</button>
        </div>
        <p id="situation-code-description" style={{ color: SIDEBAR.textMuted, fontSize: 14, lineHeight: 1.5 }}>
          {gestures
            ? 'Ce code conserve les déplacements à la souris, leur rythme et les positions affichées des joueurs. Partagez-le pour revoir la séquence ou signaler un saut de défenseur.'
            : animation
            ? 'Partagez la lecture du système avec toutes ses étapes, leurs durées et la vitesse choisie. Choisissez le départ : le code relancera l’animation à cet endroit.'
            : copying
            ? 'Partagez ce code avec un coach ou joignez-le à un signalement de bug. Il contient les joueurs, le ballon, les étapes et les réglages de défense.'
            : importingGestures
            ? 'Les gestes enregistrés seront rejoués sur le terrain. Votre brouillon reste inchangé ; « Retour au terrain » permet de le retrouver.'
            : 'Collez un code BT1 (situation), BTA1 (animation) ou BTG1 (gestes enregistrés). Pour une situation ou une animation, votre brouillon actuel sera conservé dans « Retrouver le brouillon précédent ».'}
        </p>
        {animation && <fieldset style={{ border: `1px solid ${SIDEBAR.border}`, borderRadius: 6, margin: '0 0 16px', padding: 12, display: 'grid', gap: 8, fontSize: 13 }}>
          <legend>Départ de l’animation · {(snapshot.animation?.speed ?? 1).toFixed(1)}×</legend>
          <label><input type="radio" name="animation-start" checked={!fromCurrentPosition} onChange={() => setFromCurrentPosition(false)} /> Depuis le début</label>
          <label><input type="radio" name="animation-start" checked={fromCurrentPosition} disabled={(snapshot.animation?.startT ?? 0) >= snapshot.state.steps.length - 1} onChange={() => setFromCurrentPosition(true)} /> Depuis la position actuelle</label>
        </fieldset>}
        {mode === 'copy' && snapshot.view?.frame && <p style={{ color: SIDEBAR.textDim, fontSize: 12 }}>
          Les positions affichées sont aussi jointes pour le diagnostic. À l’ouverture, la défense automatique est recalculée ; un mouvement en cours n’est pas figé.
        </p>}
        {copying && snapshot.view?.source === 'live' && <p style={{ color: SIDEBAR.textDim, fontSize: 12 }}>
          L’instantané du match IA sert au diagnostic ; ce code ne permet pas de reprendre le match en cours.
        </p>}
        <label htmlFor="situation-code" style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{gestures ? 'Code des gestes' : animation ? 'Code d’animation' : 'Code de situation'}</label>
        <textarea
          id="situation-code"
          ref={textareaRef}
          value={code}
          readOnly={copying}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder={copying ? 'Création du code…' : 'BT1:… / BTA1:… / BTG1:…'}
          onChange={e => { setCode(e.target.value); setError(''); setMessage(''); }}
          style={{ boxSizing: 'border-box', width: '100%', minHeight: 160, resize: 'vertical', border: `1px solid ${SIDEBAR.textDim}`, borderRadius: 6, padding: 10, background: SIDEBAR.bgHover, color: SIDEBAR.text, fontFamily: 'monospace', fontSize: 12, overflowWrap: 'anywhere' }}
        />
        {error && <p role="alert" style={{ color: '#fca5a5', fontSize: 13 }}>{error}</p>}
        {message && <p role="status" style={{ color: '#86efac', fontSize: 13 }}>{message}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {copying ? <>
            <button type="button" style={buttonStyle} disabled={busy || !code} onClick={() => { textareaRef.current?.focus(); textareaRef.current?.select(); }}>Tout sélectionner</button>
            <button type="button" style={primaryStyle} disabled={busy || !code} onClick={() => void copyCode()}>{busy ? 'Création…' : 'Copier le code'}</button>
          </> : <>
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => void pasteCode()}>Coller le code</button>
            <button type="button" style={primaryStyle} disabled={busy || !code.trim()} onClick={() => void importCode()}>{busy ? 'Chargement…' : importingGestures ? 'Rejouer les gestes' : importingAnimation ? 'Charger et lire l’animation' : 'Charger la situation'}</button>
          </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const buttonStyle = {
  background: SIDEBAR.bgActive, color: SIDEBAR.text, border: `1px solid ${SIDEBAR.textDim}`,
  borderRadius: 6, padding: '8px 12px', fontSize: 13, cursor: 'pointer',
};
const primaryStyle = { ...buttonStyle, background: '#7450bf', borderColor: '#a78bfa', fontWeight: 600 };
