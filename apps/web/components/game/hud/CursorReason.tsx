import type { ReactElement } from 'react';
import type { PlacementPreview } from '@/lib/scene/village-types';

const CURSOR_GAP_PX = 18;

/**
 * Proč umístění u kurzoru nejde – krátký červený text, který jde s kurzorem; u prošlého
 * umístění s varováním (hřbitov blízko obydlí) oranžový text. Jinak nic: jestli stavba jde,
 * ukazuje barva ducha / čtverců ve scéně.
 */
export function CursorReason({
  preview,
}: {
  preview: PlacementPreview | null;
}): ReactElement | null {
  const reason = preview && !preview.check.ok ? preview.check.reason : null;
  const warning = preview?.check.ok ? (preview.warning ?? null) : null;
  const text = reason ?? warning;
  if (!preview?.screen || !text) return null;
  const { screen } = preview;
  // U pravého a dolního okraje okna přeskočí na druhou stranu kurzoru.
  const flipX = screen.x > window.innerWidth - 280;
  const flipY = screen.y > window.innerHeight - 60;
  return (
    <p
      data-testid="placement-reason"
      data-tone={reason ? 'error' : 'warning'}
      role="status"
      className={`pointer-events-none fixed z-30 max-w-64 rounded-sm bg-black/55 px-1.5 py-0.5 font-serif text-sm leading-snug ${reason ? 'text-[#ff9c88]' : 'text-[#ffc27a]'} [text-shadow:0_1px_1px_rgb(0_0_0/0.9)]`}
      style={{
        left: flipX ? undefined : screen.x + CURSOR_GAP_PX,
        right: flipX ? window.innerWidth - screen.x + CURSOR_GAP_PX : undefined,
        top: flipY ? undefined : screen.y + CURSOR_GAP_PX,
        bottom: flipY ? window.innerHeight - screen.y + CURSOR_GAP_PX : undefined,
      }}
    >
      {text}
    </p>
  );
}
