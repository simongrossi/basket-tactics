// Setup global des tests.
//
// Polyfill Web Storage pour l'environnement jsdom. Sous vitest 4.x + jsdom 29,
// `window.localStorage` n'est pas exposé (le getter renvoie `undefined`), bien
// que jsdom 29 le supporte en standalone — bug d'intégration de l'adaptateur
// jsdom de vitest. On installe une implémentation in-memory conforme à l'API
// Web Storage, uniquement quand le storage natif est absent/cassé.
//
// On utilise notre propre classe `MemoryStorage` (et non celle de jsdom, dont
// le constructeur est `illegal`) pour que les tests qui patchent
// `Storage.prototype.setItem` (cf. persistence.test.ts) ciblent une classe
// réellement instanciable et cohérente avec les instances `localStorage`.

if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown> & {
    localStorage?: { getItem?: unknown };
  };
  const broken = !w.localStorage || typeof w.localStorage.getItem !== 'function';

  if (broken) {
    class MemoryStorage {
      private store = new Map<string, string>();
      get length(): number {
        return this.store.size;
      }
      key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
      }
      getItem(key: string): string | null {
        const k = String(key);
        return this.store.has(k) ? (this.store.get(k) as string) : null;
      }
      setItem(key: string, value: string): void {
        this.store.set(String(key), String(value));
      }
      removeItem(key: string): void {
        this.store.delete(String(key));
      }
      clear(): void {
        this.store.clear();
      }
    }

    const define = (target: Record<string, unknown>, name: string, value: unknown) => {
      Object.defineProperty(target, name, { value, configurable: true, writable: true });
    };

    const g = globalThis as unknown as Record<string, unknown>;
    define(w, 'Storage', MemoryStorage);
    define(g, 'Storage', MemoryStorage);
    define(w, 'localStorage', new MemoryStorage());
    define(w, 'sessionStorage', new MemoryStorage());
    define(g, 'localStorage', (w as Record<string, unknown>).localStorage);
    define(g, 'sessionStorage', (w as Record<string, unknown>).sessionStorage);
  }
}

if (typeof window !== 'undefined') {
  if (typeof window.CompressionStream === 'undefined' && typeof globalThis.CompressionStream !== 'undefined') {
    Object.defineProperty(window, 'CompressionStream', { value: globalThis.CompressionStream, configurable: true });
    Object.defineProperty(window, 'DecompressionStream', { value: globalThis.DecompressionStream, configurable: true });
  }
}
