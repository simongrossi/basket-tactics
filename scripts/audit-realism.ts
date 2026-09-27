// Audit chiffré du réalisme des déplacements (lecture).
//
// Usage : npx tsx scripts/audit-realism.ts [--json fichier] [--seconds s] [templateId...]
//   --seconds : force la durée d'une étape (sinon celle du système / défaut app)
//
// Fait tourner chaque système de la bibliothèque dans le profil de l'app
// (« réaliste »), à 60 sous-pas par étape, en temps réel (durée d'étape du
// système). Pour chaque joueur : vitesses, accélérations, virages ; pour les
// défenseurs : mode de déplacement par rapport au corps (face / pas chassé /
// reculons) et écart à leur homme. Compare à des ordres de grandeur humains
// (cf. SEUILS) et classe les pires cas.

import { writeFileSync } from 'node:fs';
import { makeInitialState } from '../src/lib/data/initial';
import { TEMPLATES } from '../src/lib/data/templates';
import { PX_PER_M } from '../src/lib/data/court';
import { loadTemplate } from '../src/lib/state/transforms/coreTransforms';
import { resolveTimelineFrame, type PlaybackFrame } from '../src/lib/logic/playback/frameResolver';
import { fullStepToSeconds } from '../src/lib/logic/timecode';
import type { AppState, Point } from '../src/lib/types';

/** Ordres de grandeur humains (basket, joueurs entraînés). Volontairement
 *  tolérants : on cherche les valeurs clairement hors du corps humain. */
export const SEUILS = {
  /** Vitesse de pointe en match (sprint), m/s. */
  sprintMps: 8,
  /** Pas chassé défensif, m/s. */
  lateralMps: 4.5,
  /** Course à reculons, m/s. */
  backpedalMps: 5,
  /** Accélération, m/s². */
  accelMps2: 7,
  /** Freinage, m/s². */
  decelMps2: 9,
  /** Virage brusque : changement de cap > 70° en ≤ 0,25 s au-delà de 5 m/s. */
  sharpTurnDeg: 70,
  sharpTurnWindowS: 0.25,
  sharpTurnMinMps: 5,
  /** Écart défenseur ↔ homme à la fin d'une étape jugé « perdu », m. */
  lostMatchM: 3,
} as const;

const SUBSTEPS = 60;
/** Lissage des vitesses (sous-pas) pour ne pas mesurer du bruit numérique. */
const SMOOTH = 3;

interface PlayerStats {
  id: string;
  vmax: number;
  aMax: number;
  dMax: number;
  lateralMax: number;
  backpedalMax: number;
  sharpTurns: number;
  /** Distance parcourue par mode (défenseurs), m. */
  distFace: number;
  distLateral: number;
  distBack: number;
  /** Écart moyen / max à l'homme aux fins d'étapes (défenseurs), m. */
  lagMean: number;
  lagMax: number;
  lostSteps: number;
}

interface TemplateReport {
  id: string;
  name: string;
  seconds: number;
  players: PlayerStats[];
}

const m = (px: number) => px / PX_PER_M;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const heading = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI;
const angleDiff = (a: number, b: number) => {
  const d = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(d);
};

function auditTemplate(state: AppState, id: string, name: string): TemplateReport {
  const lastT = state.steps.length - 1;
  const frames: PlaybackFrame[] = [];
  const times: number[] = [];
  for (let tick = 0; tick <= lastT * SUBSTEPS; tick++) {
    const t = tick / SUBSTEPS;
    frames.push(resolveTimelineFrame(state, t)!);
    times.push(fullStepToSeconds(state, t));
  }
  const ids = [...Object.keys(frames[0].off), ...Object.keys(frames[0].defPos)];
  const pos = (f: PlaybackFrame, pid: string): Point =>
    pid.startsWith('O') ? (f.off as Record<string, Point>)[pid] : (f.defPos as Record<string, Point>)[pid];

  const players: PlayerStats[] = ids.map((pid) => {
    const s: PlayerStats = {
      id: pid, vmax: 0, aMax: 0, dMax: 0, lateralMax: 0, backpedalMax: 0, sharpTurns: 0,
      distFace: 0, distLateral: 0, distBack: 0, lagMean: 0, lagMax: 0, lostSteps: 0,
    };
    // Vitesses lissées sur SMOOTH sous-pas.
    const speeds: number[] = [];
    const heads: (number | null)[] = [];
    for (let i = SMOOTH; i < frames.length; i++) {
      const dt = times[i] - times[i - SMOOTH];
      if (dt <= 0) { speeds.push(0); heads.push(null); continue; }
      const a = pos(frames[i - SMOOTH], pid);
      const b = pos(frames[i], pid);
      const v = m(dist(a, b)) / dt;
      speeds.push(v);
      heads.push(v > 0.3 ? heading(b.x - a.x, b.y - a.y) : null);
      s.vmax = Math.max(s.vmax, v);
      if (pid.startsWith('D')) {
        const body = (frames[i].defPos as Record<string, { orientation?: number }>)[pid]?.orientation;
        const step = m(dist(pos(frames[i - 1], pid), b));
        const h = heads[heads.length - 1];
        if (body !== undefined && h !== null) {
          const rel = angleDiff(h, body);
          if (rel < 60) s.distFace += step;
          else if (rel <= 120) { s.distLateral += step; s.lateralMax = Math.max(s.lateralMax, v); }
          else { s.distBack += step; s.backpedalMax = Math.max(s.backpedalMax, v); }
        }
      }
    }
    // Accélérations et virages.
    for (let k = SMOOTH; k < speeds.length; k++) {
      const i = k + SMOOTH;
      const dt = times[i] - times[i - SMOOTH];
      if (dt <= 0) continue;
      const acc = (speeds[k] - speeds[k - SMOOTH]) / dt;
      if (acc > 0) s.aMax = Math.max(s.aMax, acc);
      else s.dMax = Math.max(s.dMax, -acc);
    }
    const win = Math.max(1, Math.round(SEUILS.sharpTurnWindowS / Math.max(1e-6, (times[1] - times[0]))));
    for (let k = win; k < heads.length; k++) {
      const h0 = heads[k - win];
      const h1 = heads[k];
      if (h0 === null || h1 === null) continue;
      if (speeds[k] >= SEUILS.sharpTurnMinMps && speeds[k - win] >= SEUILS.sharpTurnMinMps &&
          angleDiff(h0, h1) > SEUILS.sharpTurnDeg) {
        s.sharpTurns++;
        k += win; // un virage compté une fois
      }
    }
    // Écart à l'homme aux fins d'étapes (défenseurs).
    if (pid.startsWith('D')) {
      const lags: number[] = [];
      for (let stepIdx = 1; stepIdx <= lastT; stepIdx++) {
        const f = frames[stepIdx * SUBSTEPS];
        const d = (f.defPos as Record<string, Point & { matchedTo?: string }>)[pid];
        const man = d?.matchedTo ? (f.off as Record<string, Point>)[d.matchedTo] : undefined;
        if (!d || !man) continue;
        const lag = m(dist(d, man));
        lags.push(lag);
        if (lag > SEUILS.lostMatchM) s.lostSteps++;
      }
      if (lags.length) {
        s.lagMean = lags.reduce((a, b) => a + b, 0) / lags.length;
        s.lagMax = Math.max(...lags);
      }
    }
    return s;
  });
  return { id, name, seconds: times[times.length - 1], players };
}

function flags(p: PlayerStats): string[] {
  const out: string[] = [];
  if (p.vmax > SEUILS.sprintMps) out.push(`vitesse ${p.vmax.toFixed(1)} m/s`);
  if (p.lateralMax > SEUILS.lateralMps) out.push(`pas chassé ${p.lateralMax.toFixed(1)} m/s`);
  if (p.backpedalMax > SEUILS.backpedalMps) out.push(`reculons ${p.backpedalMax.toFixed(1)} m/s`);
  if (p.aMax > SEUILS.accelMps2) out.push(`accél. ${p.aMax.toFixed(1)} m/s²`);
  if (p.dMax > SEUILS.decelMps2) out.push(`freinage ${p.dMax.toFixed(1)} m/s²`);
  if (p.sharpTurns > 0) out.push(`${p.sharpTurns} virage(s) brusque(s)`);
  if (p.lostSteps > 0) out.push(`${p.lostSteps} fin(s) d'étape à > ${SEUILS.lostMatchM} m de son homme`);
  return out;
}

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
const secIdx = args.indexOf('--seconds');
const forcedSeconds = secIdx >= 0 ? Number(args[secIdx + 1]) : undefined;
const wanted = args.filter((a, i) =>
  a !== '--json' && a !== '--seconds' && !(jsonIdx >= 0 && i === jsonIdx + 1) && !(secIdx >= 0 && i === secIdx + 1));
const templates = wanted.length ? TEMPLATES.filter((t) => wanted.includes(t.id)) : TEMPLATES;

const reports: TemplateReport[] = [];
for (const tpl of templates) {
  const loaded = loadTemplate({ ...makeInitialState(), realismProfile: 'realistic' }, tpl);
  const state: AppState = forcedSeconds
    ? { ...loaded, secondsPerStep: forcedSeconds, steps: loaded.steps.map((st) => ({ ...st, duration: undefined })) }
    : loaded;
  if (state.steps.length < 2) continue;
  try {
    reports.push(auditTemplate(state, tpl.id, tpl.name));
  } catch (e) {
    console.error(`! ${tpl.id} : ${(e as Error).message}`);
  }
}

// Synthèse globale.
const all = reports.flatMap((r) => r.players.map((p) => ({ tpl: r.id, ...p })));
// Joueurs qui bougent vraiment (les immobiles écrasent les médianes).
const att = all.filter((p) => p.id.startsWith('O') && p.vmax > 0.3);
const def = all.filter((p) => p.id.startsWith('D') && p.vmax > 0.3);
const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const line = (label: string, xs: number[], unit: string) =>
  `${label.padEnd(26)} médiane ${pct(xs, 0.5).toFixed(1)}  p90 ${pct(xs, 0.9).toFixed(1)}  max ${Math.max(...xs).toFixed(1)} ${unit}`;
const totalDef = def.reduce((a, p) => a + p.distFace + p.distLateral + p.distBack, 0) || 1;

console.log(`Audit réalisme — ${reports.length} systèmes, profil réaliste, ${SUBSTEPS} sous-pas / étape` +
  `${forcedSeconds ? `, étapes de ${forcedSeconds} s` : ', durée d’étape du système'}\n`);
console.log(line('Vitesse pointe attaquants', att.map((p) => p.vmax), 'm/s'));
console.log(line('Vitesse pointe défenseurs', def.map((p) => p.vmax), 'm/s'));
console.log(line('Accélération attaquants', att.map((p) => p.aMax), 'm/s²'));
console.log(line('Accélération défenseurs', def.map((p) => p.aMax), 'm/s²'));
console.log(line('Freinage attaquants', att.map((p) => p.dMax), 'm/s²'));
console.log(line('Freinage défenseurs', def.map((p) => p.dMax), 'm/s²'));
console.log(line('Pas chassé max (déf.)', def.map((p) => p.lateralMax), 'm/s'));
console.log(line('Reculons max (déf.)', def.map((p) => p.backpedalMax), 'm/s'));
console.log(line('Écart moyen à l’homme', def.map((p) => p.lagMean), 'm'));
console.log(`Défenseurs — distance de face ${(100 * def.reduce((a, p) => a + p.distFace, 0) / totalDef).toFixed(0)} %, ` +
  `pas chassé ${(100 * def.reduce((a, p) => a + p.distLateral, 0) / totalDef).toFixed(0)} %, ` +
  `reculons ${(100 * def.reduce((a, p) => a + p.distBack, 0) / totalDef).toFixed(0)} %`);

const flagged = all.map((p) => ({ ...p, f: flags(p) })).filter((p) => p.f.length);
const byKind = new Map<string, number>();
flagged.forEach((p) => p.f.forEach((f) => {
  const k = f.replace(/[\d.]+/g, '').replace(/\s+/g, ' ').trim();
  byKind.set(k, (byKind.get(k) ?? 0) + 1);
}));
console.log(`\nJoueurs hors seuils : ${flagged.length} / ${all.length}`);
[...byKind.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)} × ${k}`));

const severity = (p: PlayerStats) =>
  Math.max(0, p.vmax / SEUILS.sprintMps - 1) + Math.max(0, p.aMax / SEUILS.accelMps2 - 1) +
  Math.max(0, p.dMax / SEUILS.decelMps2 - 1) + Math.max(0, p.lateralMax / SEUILS.lateralMps - 1) +
  Math.max(0, p.backpedalMax / SEUILS.backpedalMps - 1) + p.sharpTurns * 0.2 + p.lostSteps * 0.2;
console.log('\nPires cas :');
flagged.sort((a, b) => severity(b) - severity(a)).slice(0, 25)
  .forEach((p) => console.log(`  ${p.tpl.padEnd(28)} ${p.id}  ${p.f.join(' · ')}`));

if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ seuils: SEUILS, reports }, null, 2));
  console.log(`\nDétail JSON : ${jsonOut}`);
}
