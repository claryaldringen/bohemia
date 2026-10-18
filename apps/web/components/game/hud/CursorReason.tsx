import type { ReactElement } from 'react';
import { formatInteger } from '@/lib/village-format';
import type { PlacementPreview } from '@/lib/scene/village-types';

const CURSOR_GAP_PX = 18;

/**
 * U kurzoru při umisťování (jde s kurzorem): u prošlého umístění cena jako ikony s čísly –
 * práce celkem v člověkodnech (i s překážkami a kácením), u obydlí stromy, které se skácí,
 * když nestačí klády na hromadě, a u modly a svatyně dospělé duby ke skácení; pod ní oranžově
 * varování, které stavbu neblokuje (`check.warning` – hřbitov blízko obydlí nebo vody, obydlí
 * blízko hřbitova, posvátný dub nebo háj zůstane stát), řádek na každé.
 * Když umístění nejde, místo ceny jen krátký červený důvod. Jestli stavba jde, ukazuje i barva
 * ducha / čtverců ve scéně.
 */
export function CursorReason({
  preview,
}: {
  preview: PlacementPreview | null;
}): ReactElement | null {
  if (!preview?.screen) return null;
  const { check, screen } = preview;
  const reason = check.ok ? null : check.reason;
  const warning = check.ok ? (check.warning ?? null) : null;
  const cost = check.ok ? (preview.cost ?? null) : null;
  if (!reason && !warning && !cost) return null;
  // U pravého a dolního okraje okna přeskočí na druhou stranu kurzoru.
  const flipX = screen.x > window.innerWidth - 280;
  const flipY = screen.y > window.innerHeight - 80;
  return (
    <div
      role="status"
      className="pointer-events-none fixed z-30 flex max-w-64 flex-col gap-0.5 rounded-sm bg-black/55 px-1.5 py-0.5 font-serif text-sm leading-snug [text-shadow:0_1px_1px_rgb(0_0_0/0.9)]"
      style={{
        left: flipX ? undefined : screen.x + CURSOR_GAP_PX,
        right: flipX ? window.innerWidth - screen.x + CURSOR_GAP_PX : undefined,
        top: flipY ? undefined : screen.y + CURSOR_GAP_PX,
        bottom: flipY ? window.innerHeight - screen.y + CURSOR_GAP_PX : undefined,
      }}
    >
      {cost && (
        <span
          data-testid="placement-cost"
          className="flex items-center gap-2 font-semibold text-[#f3dfb0] tabular-nums"
        >
          <span data-cost="labor" className="flex items-center gap-1">
            <img src="/icons/resources/labor.png" alt="Práce" width={16} height={16} />
            {formatInteger(cost.laborManDays)}
          </span>
          {cost.trees > 0 && (
            <span data-cost="trees" className="flex items-center gap-1">
              <img src="/icons/resources/wood.png" alt="Stromy" width={16} height={16} />
              {formatInteger(cost.trees)}
            </span>
          )}
          {(cost.oaks ?? 0) > 0 && (
            <span data-cost="oaks" className="flex items-center gap-1">
              <img src="/icons/build/dub.png" alt="Duby" width={16} height={16} />
              {formatInteger(cost.oaks ?? 0)}
            </span>
          )}
        </span>
      )}
      {(reason ?? warning) && (
        <span
          data-testid="placement-reason"
          data-tone={reason ? 'error' : 'warning'}
          className={`whitespace-pre-line ${reason ? 'text-[#ff9c88]' : 'text-[#ffc27a]'}`}
        >
          {reason ?? warning}
        </span>
      )}
    </div>
  );
}
