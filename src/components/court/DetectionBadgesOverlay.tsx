// A.4 — Badges visuels SVG pour les patterns détectés par le moteur.
//
// Aujourd'hui ces patterns sont déjà signalés via le `CoachDiagnostic`
// text-only (panneau coach). Cet overlay ajoute un calque graphique
// directement sur le terrain pour une lecture immédiate :
//
//  - reject-screen (B2)    → badge orange "REJECT" sur le porteur + flèche
//                            vers l'écran abandonné
//  - snake-dribble (B4)    → badge orange "SNAKE" sur le porteur
//  - empty-side-pnr (B5)   → badge jaune "EMPTY" entre le couple PnR
//  - defensive-3sec (B7)   → anneau rouge pulsant autour du défenseur en violation
//  - chain-re-screen (C.7) → badge violet "🔗 RE-SCREEN" sur le cutter
//  - chain-stagger   (C.7) → badge violet "🔗 STAGGER" sur le cutter
//  - chain-flare-fade (C.7)→ badge bleu "🔗 FLARE→FADE" sur le cutter
//
// Le composant consomme directement les `CoachDiagnostic[]` déjà calculés
// par `computeCoachDiagnostics` en amont (memoized dans page.tsx) — pas
// de re-calcul.

import type {
  AttackerId,
  AttackerPositions,
  ComputedDefense,
  DefenderId,
  Point,
} from '@/lib/types';
import type { CoachDiagnostic } from '@/lib/logic/coachDiagnostics';
import { PLAYER_RADIUS } from '@/lib/data/court';

interface DetectionBadgesOverlayProps {
  diagnostics: CoachDiagnostic[];
  off: AttackerPositions;
  defPos: ComputedDefense;
  show?: boolean;
}

export function DetectionBadgesOverlay({
  diagnostics,
  off,
  defPos,
  show = true,
}: DetectionBadgesOverlayProps) {
  if (!show) return null;

  // Index par tag pour récupération rapide.
  const byTag = new Map<string, CoachDiagnostic>();
  diagnostics.forEach((d) => {
    if (!byTag.has(d.tag)) byTag.set(d.tag, d);
  });

  return (
    <g pointerEvents="none">
      {/* B2 — Reject screen */}
      {(() => {
        const diag = byTag.get('reject-screen');
        if (!diag) return null;
        const carrier = diag.attackers[0];
        const screener = diag.attackers[1];
        if (!carrier || !off[carrier]) return null;
        const cp = off[carrier];
        const sp = screener && off[screener] ? off[screener] : null;
        return (
          <g>
            <RejectBadge pos={cp} />
            {/* Flèche pointant du porteur vers l'écran abandonné */}
            {sp && (
              <line
                x1={cp.x}
                y1={cp.y}
                x2={sp.x}
                y2={sp.y}
                stroke="#ea580c"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.5}
              />
            )}
          </g>
        );
      })()}

      {/* B4 — Snake dribble */}
      {(() => {
        const diag = byTag.get('snake-dribble');
        if (!diag) return null;
        const carrier = diag.attackers[0];
        if (!carrier || !off[carrier]) return null;
        return <SnakeBadge pos={off[carrier]} />;
      })()}

      {/* B5 — Empty side PnR */}
      {(() => {
        const diag = byTag.get('empty-side-pnr');
        if (!diag) return null;
        const carrier = diag.attackers[0];
        const screener = diag.attackers[1];
        if (!carrier || !off[carrier]) return null;
        // Badge ancré entre porteur et poseur (midpoint).
        const cp = off[carrier];
        const sp = screener && off[screener] ? off[screener] : cp;
        const mid = { x: (cp.x + sp.x) / 2, y: (cp.y + sp.y) / 2 };
        return <EmptySideBadge pos={mid} />;
      })()}

      {/* C.7 — Action chains (re-screen / stagger / flare-fade) */}
      {(['chain-re-screen', 'chain-stagger', 'chain-flare-fade'] as const).map((tag) => {
        const diag = byTag.get(tag);
        if (!diag) return null;
        const cutter = diag.attackers[0];
        if (!cutter || !off[cutter]) return null;
        const cp = off[cutter];
        const label =
          tag === 'chain-re-screen' ? '🔗 RE-SCREEN' :
          tag === 'chain-stagger' ? '🔗 STAGGER' :
          '🔗 FLARE→FADE';
        const color = tag === 'chain-flare-fade' ? '#3b82f6' : '#8b5cf6';
        return <ChainBadge key={tag} pos={cp} label={label} color={color} title={diag.message} />;
      })}

      {/* F.4 — Foul to give opportunity (badge sur le défenseur du porteur) */}
      {(() => {
        const diag = byTag.get('foul-to-give');
        if (!diag) return null;
        const dId = diag.defenders[0];
        if (!dId || !defPos[dId]) return null;
        return (
          <FoulToGiveBadge
            pos={{ x: defPos[dId].x, y: defPos[dId].y }}
            title={diag.message}
          />
        );
      })()}

      {/* B7 — Defensive 3-second violation */}
      {diagnostics
        .filter((d) => d.tag === 'defensive-3sec')
        .map((diag) => {
          const dId = diag.defenders[0];
          if (!dId || !defPos[dId]) return null;
          return (
            <ThreeSecRing key={`3sec-${dId}`} pos={{ x: defPos[dId].x, y: defPos[dId].y }} dId={dId} />
          );
        })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants — badges SVG
// ---------------------------------------------------------------------------

/** Badge rouge "↺ REJECT" — pattern reject screen détecté. */
function RejectBadge({ pos }: { pos: Point }) {
  const dx = -PLAYER_RADIUS - 4;
  const dy = -PLAYER_RADIUS - 14;
  return (
    <g transform={`translate(${pos.x + dx}, ${pos.y + dy})`}>
      <rect x={-30} y={-7} width={36} height={14} rx={3} fill="#ea580c" opacity={0.95} />
      <text
        x={-12}
        y={3}
        fontSize={9}
        fontWeight={700}
        fill="#fff"
        textAnchor="middle"
      >
        ↺ REJECT
      </text>
    </g>
  );
}

/** Badge orange "↩ SNAKE" — pattern snake dribble détecté. */
function SnakeBadge({ pos }: { pos: Point }) {
  const dx = PLAYER_RADIUS + 4;
  const dy = -PLAYER_RADIUS - 14;
  return (
    <g transform={`translate(${pos.x + dx}, ${pos.y + dy})`}>
      <rect x={0} y={-7} width={34} height={14} rx={3} fill="#f59e0b" opacity={0.95} />
      <text
        x={17}
        y={3}
        fontSize={9}
        fontWeight={700}
        fill="#fff"
        textAnchor="middle"
      >
        ↩ SNAKE
      </text>
    </g>
  );
}

/** Badge violet "🔗 ..." — chaîne d'action détectée (C.7). */
function ChainBadge({
  pos, label, color, title,
}: {
  pos: Point;
  label: string;
  color: string;
  title: string;
}) {
  const width = label.length * 6 + 10;
  const dx = -width / 2;
  const dy = -PLAYER_RADIUS - 30;
  return (
    <g transform={`translate(${pos.x + dx}, ${pos.y + dy})`}>
      <title>{title}</title>
      <rect x={0} y={-7} width={width} height={14} rx={3} fill={color} opacity={0.95} />
      <text
        x={width / 2}
        y={3}
        fontSize={9}
        fontWeight={700}
        fill="#fff"
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

/** Badge jaune "EMPTY SIDE" — PnR sur côté faible vide. */
function EmptySideBadge({ pos }: { pos: Point }) {
  return (
    <g>
      <rect x={pos.x - 30} y={pos.y - 22} width={60} height={14} rx={3} fill="#facc15" opacity={0.92} />
      <text
        x={pos.x}
        y={pos.y - 12}
        fontSize={9}
        fontWeight={700}
        fill="#713f12"
        textAnchor="middle"
      >
        ↻ EMPTY SIDE
      </text>
    </g>
  );
}

/** Badge rouge "🟥 FOUL TO GIVE" — opportunité de faute volontaire fin de
 *  quart (F.4). Posé sur le défenseur qui matched le porteur. */
function FoulToGiveBadge({ pos, title }: { pos: Point; title: string }) {
  const width = 86;
  const dx = -width / 2;
  const dy = -PLAYER_RADIUS - 32;
  return (
    <g transform={`translate(${pos.x + dx}, ${pos.y + dy})`}>
      <title>{title}</title>
      {/* Pastille de fond avec contour rouge vif. */}
      <rect x={0} y={-8} width={width} height={16} rx={3} fill="#dc2626" opacity={0.95} />
      <rect x={0} y={-8} width={width} height={16} rx={3} fill="none" stroke="#fca5a5" strokeWidth={0.8} />
      <text
        x={width / 2}
        y={3}
        fontSize={9}
        fontWeight={700}
        fill="#fff"
        textAnchor="middle"
        letterSpacing={0.3}
      >
        🟥 FOUL TO GIVE
      </text>
    </g>
  );
}

/** Anneau rouge pulsant + badge "3 SEC" — violation FIBA 3 secondes. */
function ThreeSecRing({ pos, dId }: { pos: Point; dId: DefenderId }) {
  return (
    <g>
      {/* Anneau rouge pulsant */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={PLAYER_RADIUS + 12}
        fill="none"
        stroke="#dc2626"
        strokeWidth={2.5}
        opacity={0.9}
      >
        <animate
          attributeName="r"
          values={`${PLAYER_RADIUS + 12};${PLAYER_RADIUS + 18};${PLAYER_RADIUS + 12}`}
          dur="1.4s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.9;0.4;0.9"
          dur="1.4s"
          repeatCount="indefinite"
        />
      </circle>
      {/* Badge texte */}
      <rect
        x={pos.x + PLAYER_RADIUS + 2}
        y={pos.y - PLAYER_RADIUS - 14}
        width={36}
        height={14}
        rx={3}
        fill="#dc2626"
        opacity={0.95}
      />
      <text
        x={pos.x + PLAYER_RADIUS + 20}
        y={pos.y - PLAYER_RADIUS - 4}
        fontSize={9}
        fontWeight={700}
        fill="#fff"
        textAnchor="middle"
      >
        ⚠ 3 SEC
      </text>
      {/* Marque le défenseur pour debug */}
      <text
        x={pos.x}
        y={pos.y + PLAYER_RADIUS + 14}
        fontSize={8}
        fill="#dc2626"
        textAnchor="middle"
        fontWeight={600}
      >
        {dId}
      </text>
    </g>
  );
}
