import type { TextNote } from '@/lib/types';
import {
  TEXT_NOTE_HEIGHT_PX,
  textNoteWidth,
} from './textNoteGeometry';

interface Props {
  notes: TextNote[];
}

/** Rendu SVG des notes texte. `pointerEvents="none"` : les clics traversent
 *  vers le pointer handler du SVG, qui gère le hit-test lui-même via
 *  `hitTestTextNote` (une seule source de vérité). */
export function TextNotesLayer({ notes }: Props) {
  return (
    <g pointerEvents="none">
      {notes.map((note, idx) => {
        const w = textNoteWidth(note.text);
        const h = TEXT_NOTE_HEIGHT_PX;
        return (
          <g
            key={idx}
            transform={`translate(${note.pos.x - w / 2}, ${note.pos.y - h / 2})`}
          >
            <rect
              x={0}
              y={0}
              width={w}
              height={h}
              rx={4}
              ry={4}
              fill="rgba(255,255,255,0.88)"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={1}
            />
            <text
              x={w / 2}
              y={h / 2 + 4}
              textAnchor="middle"
              fontSize={12}
              fill="#111"
            >
              {note.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
