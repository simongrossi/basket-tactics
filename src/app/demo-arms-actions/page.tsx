'use client';

import { useState } from 'react';

/**
 * Page démo : silhouettes de bras par RÔLE D'ACTION (chantier B —
 * anatomie par action). Compare le Design F (figé, neutre) avec 3
 * nouveaux tracés contextuels : driver, shooter, screener.
 *
 * Pas de modification de Player.tsx tant que ces silhouettes ne sont
 * pas validées visuellement par le user.
 */

const r = 16; // PLAYER_RADIUS

interface ArmPose {
  id: string;
  name: string;
  description: string;
  badge: string;
  leftPath: (cx: number, cy: number) => string;
  rightPath: (cx: number, cy: number) => string;
  /** Design F = inchangé ; autre = nouveau tracé proposé */
  changedFromF: boolean;
  /** Si true, la pose dépend de la main dominante (driver / shooter) */
  handed?: boolean;
}

const ANGLES = [0, 90, 180, 270];

// === DESIGN F (référence, intouché) =========================================
const fLeft = (cx: number, cy: number) =>
  `M ${cx - r * 0.7} ${cy} Q ${cx - r * 2.0} ${cy - r * 0.5} ${cx - r * 1.8} ${cy - r * 1.4}`;
const fRight = (cx: number, cy: number) =>
  `M ${cx + r * 0.7} ${cy} Q ${cx + r * 2.0} ${cy - r * 0.5} ${cx + r * 1.8} ${cy - r * 1.4}`;

// === DRIVER (droitier) — main dominante (droite) DRIBBLE BAS, autre (gauche) STIFF ARM ===
const driverDominantDribbleLow = (cx: number, cy: number) =>
  `M ${cx + r * 0.7} ${cy} Q ${cx + r * 0.9} ${cy + r * 1.0} ${cx + r * 0.2} ${cy + r * 1.9}`;
const driverNonDominantStiffArm = (cx: number, cy: number) =>
  `M ${cx - r * 0.7} ${cy} Q ${cx - r * 1.6} ${cy - r * 0.1} ${cx - r * 2.4} ${cy - r * 0.3}`;

// === SHOOTER (droitier) — main dominante (droite) VERTICAL AU-DESSUS, autre (gauche) GUIDE devant la joue ===
const shooterDominantUp = (cx: number, cy: number) =>
  `M ${cx + r * 0.7} ${cy} Q ${cx + r * 0.7} ${cy - r * 1.6} ${cx + r * 0.3} ${cy - r * 2.6}`;
const shooterNonDominantGuide = (cx: number, cy: number) =>
  `M ${cx - r * 0.7} ${cy} Q ${cx - r * 0.4} ${cy - r * 0.8} ${cx - r * 0.2} ${cy - r * 1.5}`;

// === SCREENER — 2 bras croisés DEVANT le torse (X visible, mains sortent du cercle) ===
const screenerLeftCross = (cx: number, cy: number) =>
  `M ${cx - r * 0.6} ${cy - r * 0.1} Q ${cx - r * 0.1} ${cy - r * 1.4} ${cx + r * 0.7} ${cy - r * 1.6}`;
const screenerRightCross = (cx: number, cy: number) =>
  `M ${cx + r * 0.6} ${cy - r * 0.1} Q ${cx + r * 0.1} ${cy - r * 1.4} ${cx - r * 0.7} ${cy - r * 1.6}`;

const POSES: ArmPose[] = [
  {
    id: 'idle',
    name: 'Idle (statique)',
    description: 'Joueur sans action particulière. Design F intact.',
    badge: '✅ inchangé',
    leftPath: fLeft,
    rightPath: fRight,
    changedFromF: false,
  },
  {
    id: 'passer',
    name: 'Passer (post-passe)',
    description: 'L\'ex-porteur qui regarde son receveur. Design F intact (le follow-through ouvre les bras).',
    badge: '✅ inchangé',
    leftPath: fLeft,
    rightPath: fRight,
    changedFromF: false,
  },
  {
    id: 'cutter',
    name: 'Cutter (en course)',
    description: 'Non-porteur qui coupe vers une zone. Bras pompant en course — Design F en approximation.',
    badge: '✅ inchangé',
    leftPath: fLeft,
    rightPath: fRight,
    changedFromF: false,
  },
  {
    id: 'driver',
    name: 'Driver droitier (dribble)',
    description: 'Main droite (dominante) DRIBBLE BAS devant le corps. Bras gauche TENDU latéral (stiff arm) qui éloigne le défenseur. Inverse pour gaucher.',
    badge: '🔴 nouveau',
    leftPath: driverNonDominantStiffArm,
    rightPath: driverDominantDribbleLow,
    changedFromF: true,
    handed: true,
  },
  {
    id: 'shooter',
    name: 'Shooter droitier (release)',
    description: 'Main droite (dominante) VERTICALE au-dessus de la tête. Main gauche GUIDE devant la joue. Inverse pour gaucher.',
    badge: '🔴 nouveau',
    leftPath: shooterNonDominantGuide,
    rightPath: shooterDominantUp,
    changedFromF: true,
    handed: true,
  },
  {
    id: 'screener',
    name: 'Screener (poseur d\'écran)',
    description: '2 bras serrés CROISÉS sur le torse, paumes contre la poitrine. Pose LÉGALE FIBA art. 33 (les bras dans la silhouette du corps).',
    badge: '🔴 nouveau',
    leftPath: screenerLeftCross,
    rightPath: screenerRightCross,
    changedFromF: true,
  },
];

export default function DemoArmsActions() {
  const [validated, setValidated] = useState<Record<string, boolean>>({});

  const allChanged = POSES.filter((p) => p.changedFromF);
  const allValidated = allChanged.every((p) => validated[p.id]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#fafaf9', minHeight: '100vh' }}>
      <h1 style={{ marginTop: 0, marginBottom: 8, fontSize: 22 }}>
        Démo silhouettes par rôle d'action (chantier B)
      </h1>
      <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#475569', maxWidth: 900 }}>
        Comparaison Design F (figé, neutre) vs 3 nouveaux tracés proposés (driver, shooter, screener).
        Aucune modification de <code>Player.tsx</code> tant que tu n'as pas validé visuellement ici.
        Chaque silhouette est rendue à 4 orientations (panier nord, est, sud, ouest) pour vérifier
        qu'elle reste lisible après rotation du body. Sprites bleus pour défense, orangés pour attaque (les 2 sont identiques côté tracé).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {POSES.map((pose) => (
          <div
            key={pose.id}
            style={{
              border: pose.changedFromF
                ? (validated[pose.id] ? '3px solid #16a34a' : '2px solid #dc2626')
                : '2px solid #cbd5e1',
              borderRadius: 8,
              padding: 12,
              background: validated[pose.id] ? '#f0fdf4' : '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 14 }}>{pose.name}</h2>
              <span style={{ fontSize: 10, fontWeight: 700, color: pose.changedFromF ? '#dc2626' : '#64748b' }}>
                {pose.badge}
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#64748b', minHeight: 64, marginTop: 0, marginBottom: 8 }}>
              {pose.description}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {ANGLES.map((angle) => (
                <PictogramExample key={angle} angle={angle} pose={pose} fillTeam="attack" />
              ))}
            </div>

            {pose.changedFromF && (
              <button
                onClick={() => setValidated((v) => ({ ...v, [pose.id]: !v[pose.id] }))}
                style={{
                  marginTop: 10,
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: validated[pose.id] ? '#16a34a' : '#dc2626',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {validated[pose.id] ? `✓ ${pose.name} validé` : `Valider ${pose.name}`}
              </button>
            )}
          </div>
        ))}
      </div>

      {allValidated && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: '#f0fdf4',
            border: '2px solid #16a34a',
            borderRadius: 8,
            maxWidth: 900,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: '#15803d' }}>
            <strong>Toutes les nouvelles silhouettes sont validées.</strong> Dis-le-moi en chat
            (« silhouettes OK ») et j'intègre dans Player.tsx derrière le flag opt-in
            <code> attackerActionPosesEnabled</code>.
          </p>
        </div>
      )}

      <details style={{ marginTop: 24, fontSize: 12, color: '#64748b' }}>
        <summary style={{ cursor: 'pointer' }}>Coordonnées Bezier des tracés proposés (debug)</summary>
        <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: 12, borderRadius: 6, overflow: 'auto' }}>
{`r = PLAYER_RADIUS = 16

# Driver droitier (right = dribble bas, left = stiff arm)
right (dominant DRIBBLE) :
  M (cx + 0.7r, cy) Q (cx + 0.8r, cy + 0.6r) (cx + 0.3r, cy + 1.3r)
left  (STIFF ARM) :
  M (cx - 0.7r, cy) Q (cx - 1.5r, cy - 0.1r) (cx - 2.2r, cy - 0.3r)

# Shooter droitier (right = vertical haut, left = guide joue)
right (dominant SHOOT) :
  M (cx + 0.7r, cy) Q (cx + 0.7r, cy - 1.6r) (cx + 0.3r, cy - 2.6r)
left  (GUIDE HAND) :
  M (cx - 0.7r, cy) Q (cx - 0.4r, cy - 0.8r) (cx - 0.2r, cy - 1.5r)

# Screener (bras croisés torse)
left  :
  M (cx - 0.7r, cy) Q (cx - 0.2r, cy + 0.4r) (cx + 0.3r, cy + 0.5r)
right :
  M (cx + 0.7r, cy) Q (cx + 0.2r, cy + 0.4r) (cx - 0.3r, cy + 0.5r)`}
        </pre>
      </details>
    </div>
  );
}

function PictogramExample({ angle, pose, fillTeam }: { angle: number; pose: ArmPose; fillTeam: 'attack' | 'defense' }) {
  const cx = 60;
  const cy = 70;
  const fill = fillTeam === 'attack' ? '#D85A30' : '#378ADD';
  const stroke = fillTeam === 'attack' ? '#4A1B0C' : '#042C53';
  const labelN =
    angle === 0 ? 'N' :
    angle === 90 ? 'E' :
    angle === 180 ? 'S' :
    'O';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 9, color: '#94a3b8' }}>{labelN}</span>
      <svg
        width={90}
        height={120}
        viewBox="0 0 120 140"
        style={{ border: '1px solid #e2e8f0', borderRadius: 4, background: '#fafaf9' }}
      >
        <text x={cx} y={10} fontSize={7} fill="#94a3b8" textAnchor="middle">panier</text>

        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          <path
            d={pose.leftPath(cx, cy)}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.8}
          />
          <path
            d={pose.rightPath(cx, cy)}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.8}
          />
        </g>

        <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={2} />

        <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
          {/* Triangle de regard (face direction du body) */}
          <polygon
            points={`${cx},${cy - r - 4} ${cx - 3},${cy - r + 1} ${cx + 3},${cy - r + 1}`}
            fill={stroke}
            opacity={0.7}
          />
        </g>
      </svg>
    </div>
  );
}
