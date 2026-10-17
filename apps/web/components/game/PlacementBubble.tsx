import type { ReactElement } from 'react';
import type { PlacementPreview } from '@/lib/scene/village-types';

const CURSOR_GAP_PX = 18;
/** Kolik místa bublina potřebuje vpravo a dole od kurzoru, jinak přeskočí na druhou stranu. */
const BUBBLE_ROOM_PX = { x: 320, y: 90 };

/**
 * Bublina u kurzoru při umisťování: co se staví (výměra, cena) a proč to nejde – zeleně /
 * červeně, nápověda bez důvodu neutrálně.
 */
export function PlacementBubble({
  preview,
}: {
  preview: PlacementPreview | null;
}): ReactElement | null {
  if (!preview?.screen) return null;
  const { check, label, screen } = preview;
  const reason = check.ok ? null : check.reason;
  // Neprošlé umístění bez důvodu je jen nápověda (např. prázdné pole) – neutrálně, ne červeně.
  const tone = check.ok ? 'bg-emerald-800/90' : reason ? 'bg-red-800/90' : 'bg-stone-800/90';
  // U pravého / dolního okraje okna bublina přeskočí na druhou stranu kurzoru.
  const flipX = screen.x > window.innerWidth - BUBBLE_ROOM_PX.x;
  const flipY = screen.y > window.innerHeight - BUBBLE_ROOM_PX.y;
  return (
    <div
      data-testid="placement-bubble"
      data-ok={check.ok}
      role="status"
      className={`pointer-events-none fixed z-20 max-w-72 rounded px-2 py-1 text-xs leading-snug text-white shadow ${tone}`}
      style={{
        left: flipX ? undefined : screen.x + CURSOR_GAP_PX,
        right: flipX ? window.innerWidth - screen.x + CURSOR_GAP_PX : undefined,
        top: flipY ? undefined : screen.y + CURSOR_GAP_PX,
        bottom: flipY ? window.innerHeight - screen.y + CURSOR_GAP_PX : undefined,
      }}
    >
      {label && <p className="font-semibold">{label}</p>}
      {reason && <p>{reason}</p>}
    </div>
  );
}
