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

const LEVEL_HINTS: Record<InterfaceLevel, string> = {
  coach: 'Préparer, expliquer et conduire une séance.',
  analysis: 'Mesures, tracés et réglages détaillés.',
  development: 'Diagnostics techniques et scénarios de laboratoire.',
};

export function InterfaceLevelSelector() {
  const { level, setLevel } = useInterfaceLevel();
  return <label className="bt-level" title={`${LEVEL_HINTS[level]} Change les outils affichés, sans modifier le système ni la simulation.`}>
    <span>Niveau</span>
    <select aria-label="Niveau d’interface" value={level} onChange={e => setLevel(e.target.value as InterfaceLevel)}>
      <option value="coach">Coach</option>
      <option value="analysis">Analyse</option>
      <option value="development">Développement</option>
    </select>
  </label>;
}
