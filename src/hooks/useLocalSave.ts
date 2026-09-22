import { useEffect, useRef, useState } from 'react';

export type LocalSaveStatus = 'pending' | 'saved' | 'error';

/** Écriture différée, vidée avant fermeture ou mise en arrière-plan. */
export function useLocalSave<T>(value: T, ready: boolean, save: (value: T) => boolean) {
  const [status, setStatus] = useState<LocalSaveStatus>('pending');
  const latest = useRef({ value, ready, save });
  latest.current = { value, ready, save };
  const pending = useRef(false);
  const flush = () => {
    const current = latest.current;
    if (!current.ready || !pending.current) return true;
    const ok = current.save(current.value);
    pending.current = !ok;
    setStatus(ok ? 'saved' : 'error');
    return ok;
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!ready) return;
    pending.current = true;
    setStatus('pending');
    const timer = setTimeout(() => flushRef.current(), 250);
    return () => clearTimeout(timer);
  }, [value, ready]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushRef.current(); };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!flushRef.current()) { event.preventDefault(); event.returnValue = ''; }
    };
    const onPageHide = () => { flushRef.current(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      flushRef.current();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
  return status;
}
