// Helpers pour le résumé textuel des annotations dans le PDF playbook (Étape 14).
// Convertit les bornes tStart/tEnd (0..1, ou cross-step [-1, 2]) en timings
// absolus en secondes, et formate un libellé court lisible en print.

import type { Annotation } from '../types';

export function qualityLabel(q: number): string {
  if (q <= 12) return 'ghost';
  if (q <= 37) return 'loose';
  if (q <= 62) return 'std';
  if (q <= 87) return 'solid';
  return 'lock';
}

/**
 * Résumé textuel d'une annotation pour le PDF playbook.
 *
 * @param a            Annotation à résumer
 * @param transStart   Temps absolu (en s) du début de la transition portant l'anno
 * @param sps          secondsPerStep (pour convertir tStart/tEnd → secondes)
 */
export function annotationSummary(a: Annotation, transStart: number, sps: number): string {
  const tA = typeof a.tStart === 'number' ? a.tStart : 0;
  const tB = typeof a.tEnd === 'number' ? a.tEnd : 1;
  const absA = transStart + tA * sps;
  const absB = transStart + tB * sps;
  const dur = absB - absA;
  const phase = a.phase ?? 'end';
  const phaseTag = phase === 'start' ? ' (début)' : '';
  const cross = tA < 0 || tB > 1 ? ' ★' : '';
  const timing = `${absA.toFixed(1)}s→${absB.toFixed(1)}s (${dur.toFixed(1)}s)`;

  switch (a.type) {
    case 'screen': {
      const q = a.quality ?? 50;
      return `${a.fromId} écran${a.toId ? ' → ' + a.toId : ''} · qualité ${q} (${qualityLabel(q)}) · ${timing}${phaseTag}${cross}`;
    }
    case 'dribble':
      return `${a.fromId} dribble · ${timing}${phaseTag}${cross}`;
    case 'cut':
      return `${a.fromId} coupe · ${timing}${phaseTag}${cross}`;
    case 'pass':
      return `${a.fromId} → ${a.toId ?? '?'} passe · ${timing}${phaseTag}${cross}`;
    default:
      return `${a.fromId} ${a.type} · ${timing}`;
  }
}
