import type { ReactElement } from 'react';
import { Tooltip } from './Tooltip';
import { formatDecimal, formatInteger } from '@/lib/village-format';
import type { PlacementCost, PlacementPreview } from '@/lib/scene/village-types';

const CURSOR_GAP_PX = 18;

/**
 * U kurzoru při umisťování (jde s kurzorem): u prošlého umístění cena jako ikony s čísly –
 * práce celkem v člověkodnech (i s překážkami a kácením), u obydlí stromy, které se skácí,
 * když nestačí klády na hromadě, a u modly a svatyně dospělé duby ke skácení; pod ní oranžově
 * varování, které stavbu neblokuje (`check.warning` – hřbitov blízko obydlí nebo vody, obydlí
 * blízko hřbitova, posvátný dub nebo háj zůstane stát), řádek na každé.
 * Když umístění nejde, místo ceny jen krátký červený důvod. Jestli stavba jde, ukazuje i barva
 * ducha / čtverců ve scéně. Stavba po druzích (ohrada – druh zvířat, oxen.md) má na začátku vždy
 * ikonu druhu vybraného v rozcestníku mřížky staveb.
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
  const variant = preview.variant ?? null;
  const measure = preview.measure ?? null;
  if (!reason && !warning && !cost && !variant && !measure) return null;
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
      {measure && (
        <span data-testid="placement-measure" className="font-semibold text-[#f3dfb0] tabular-nums">
          {measure}
        </span>
      )}
      {(cost || variant) && (
        <span
          data-testid="placement-cost"
          className="flex items-center gap-2 font-semibold text-[#f3dfb0] tabular-nums"
        >
          {variant && (
            <img
              data-testid="placement-variant"
              data-variant={variant.id}
              src={`/icons/resources/${variant.icon}.png`}
              alt={variant.name}
              title={variant.name}
              width={20}
              height={20}
            />
          )}
          {cost && <CostIcons cost={cost} />}
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

/** Cena jako ikony s čísly (práce, stromy, klády, kámen, vápno, písek…) – i v panelu rozměrů kostela. */
export function CostIcons({ cost }: { cost: PlacementCost }): ReactElement {
  return (
    <>
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
      {(cost.burn ?? 0) > 0 && (
        <span data-cost="burn" className="flex items-center gap-1">
          <Tooltip content="Les se vykácí, větve se vysuší a v březnu až říjnu vypálí">
            <img
              src="/icons/resources/fire.png"
              alt="Les se vykácí a vypálí"
              width={16}
              height={16}
            />
          </Tooltip>
          {formatInteger(cost.burn ?? 0)}
        </span>
      )}
      {(cost.logs ?? 0) > 0 && (
        <span data-cost="logs" className="flex items-center gap-1">
          <img src="/icons/resources/wood.png" alt="Klády" width={16} height={16} />
          {formatInteger(cost.logs ?? 0)}
        </span>
      )}
      {(cost.stoneM3 ?? 0) > 0 && (
        <span data-cost="stone" className="flex items-center gap-1">
          <img src="/icons/resources/stone.png" alt="Kámen" width={16} height={16} />
          {formatInteger(cost.stoneM3 ?? 0)} m³
        </span>
      )}
      {(cost.limeT ?? 0) > 0 && (
        <span data-cost="lime" className="flex items-center gap-1">
          <img src="/icons/resources/lime.png" alt="Vápno" width={16} height={16} />
          {formatDecimal(cost.limeT ?? 0, 1)} t
        </span>
      )}
      {(cost.sandM3 ?? 0) > 0 && (
        <span data-cost="sand" className="flex items-center gap-1">
          <img src="/icons/resources/sand.png" alt="Písek" width={16} height={16} />
          {formatInteger(cost.sandM3 ?? 0)} m³
        </span>
      )}
      {(cost.refuge ?? 0) > 0 && (
        <span data-cost="refuge" className="flex items-center gap-1">
          <img src="/icons/resources/people.png" alt="Útočiště" width={16} height={16} />
          {formatInteger(cost.refuge ?? 0)}
        </span>
      )}
      {(cost.oaks ?? 0) > 0 && (
        <span data-cost="oaks" className="flex items-center gap-1">
          <img src="/icons/build/dub.png" alt="Duby" width={16} height={16} />
          {formatInteger(cost.oaks ?? 0)}
        </span>
      )}
    </>
  );
}
