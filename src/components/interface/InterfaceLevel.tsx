'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type InterfaceLevel = 'coach' | 'analysis' | 'development';
const STORAGE_KEY = 'bt:interface-level:v1';
const rank = { coach: 0, analysis: 1, development: 2 };
const Context = createContext({ level: 'coach' as InterfaceLevel, setLevel: (_: InterfaceLevel) => {} });

export function InterfaceLevelProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<InterfaceLevel>('coach');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'coach' || saved === 'analysis' || saved === 'development') setLevel(saved);
    } catch { /* Private browsing can disable storage. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try { localStorage.setItem(STORAGE_KEY, level); } catch { /* Keep the current session usable. */ }
    }
  }, [level, ready]);
  return <Context.Provider value={{ level, setLevel }}>{children}</Context.Provider>;
}

export function useInterfaceLevel() {
  const context = useContext(Context);
  return { ...context, analysis: rank[context.level] >= 1, development: context.level === 'development' };
}

export function InterfaceGate({ min, children }: { min: InterfaceLevel; children: ReactNode }) {
  const { level } = useInterfaceLevel();
  return rank[level] >= rank[min] ? <>{children}</> : null;
}

export function InterfaceLevelSelector({ compact = false }: { compact?: boolean }) {
  const { level, setLevel } = useInterfaceLevel();
  return <label style={{ display: 'grid', gap: 5, padding: compact ? '8px 4px' : '10px', color: '#cbd5e1', fontSize: 11 }}>
    {!compact && <span>Niveau d’interface</span>}
    <select className="bt-touch" aria-label="Niveau d’interface" title="Change les outils affichés, sans modifier le système ni la simulation"
      value={level} onChange={e => setLevel(e.target.value as InterfaceLevel)}
      style={{ width: '100%', minWidth: 0, background: '#252b34', color: '#f3f4f6', border: '1px solid #465264', borderRadius: 6, padding: '7px 3px' }}>
      <option value="coach">{compact ? 'C' : 'Coach'}</option>
      <option value="analysis">{compact ? 'A' : 'Analyse'}</option>
      <option value="development">{compact ? 'D' : 'Développement'}</option>
    </select>
    {!compact && <span style={{ color: '#94a3b8', lineHeight: 1.4 }}>
      {level === 'coach' ? 'Préparer, expliquer et conduire une séance.' : level === 'analysis' ? 'Mesures, tracés et réglages détaillés.' : 'Diagnostics techniques et scénarios de laboratoire.'}
    </span>}
  </label>;
}
