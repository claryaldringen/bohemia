import type { ReactElement } from 'react';
import type { PlacementPreview } from '@/lib/scene/village-types';

const CURSOR_GAP_PX = 18;

/**
 * Proč umístění u kurzoru nejde – krátký červený text, který jde s kurzorem. Jinak nic:
 * jestli stavba jde, ukazuje barva ducha / čtverců ve scéně.
 */
export function CursorReason({
  preview,
}: {
  preview: PlacementPreview | null;
}): ReactElement | null {
  const reason = preview && !preview.check.ok ? preview.check.reason : null;
  if (!preview?.screen || !reason) return null;
  const { screen } = preview;
  // U pravého a dolního okraje okna přeskočí na druhou stranu kurzoru.
  const flipX = screen.x > window.innerWidth - 280;
  const flipY = screen.y > window.innerHeight - 60;
  return (
    <p
      data-testid="placement-reason"
      role="status"
      className="pointer-events-none fixed z-30 max-w-64 rounded-sm bg-black/55 px-1.5 py-0.5 font-serif text-sm leading-snug text-[#ff9c88] [text-shadow:0_1px_1px_rgb(0_0_0/0.9)]"
      style={{
        left: flipX ? undefined : screen.x + CURSOR_GAP_PX,
        right: flipX ? window.innerWidth - screen.x + CURSOR_GAP_PX : undefined,
        top: flipY ? undefined : screen.y + CURSOR_GAP_PX,
        bottom: flipY ? window.innerHeight - screen.y + CURSOR_GAP_PX : undefined,
      }}
    >
      {reason}
    </p>
  );
}
