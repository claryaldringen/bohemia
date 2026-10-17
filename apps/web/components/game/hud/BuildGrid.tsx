'use client';

import type { ReactElement } from 'react';
import { BUILD_ITEMS, type BuildItem } from '@/lib/build-items';
import { formatInteger, formatManDays } from '@/lib/village-format';
import type { BuildOption, StockResource } from '@/lib/village-view';
import { Tooltip } from './Tooltip';

/** Kolik slotů má mřížka staveb (jako příkazový panel 0 A.D.) – prázdné jsou prohlubně. */
const GRID_SLOTS = 8;

const RESOURCE_ICONS: Record<StockResource, { icon: string; unit: string; name: string }> = {
  grain: { icon: 'food', unit: 'kg', name: 'Obilí' },
  settlers: { icon: 'people', unit: '', name: 'Lidé k osídlení' },
};

/**
 * Popisek stavby: název a cena – práce, suroviny a lidé k osídlení předem, chybějící červeně
 * (jako v 0 A.D.).
 */
function BuildTooltip({
  item,
  option,
}: {
  item: BuildItem;
  option: BuildOption | null;
}): ReactElement {
  return (
    <span className="block">
      <span className="font-serif text-sm font-semibold text-[#f3dfb0]">{item.name}</span>{' '}
      <span className="text-[#bfa77a]">[{item.hotkeyLabel}]</span>
      {option && (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1">
            <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
            {formatManDays(option.laborManDays)}
            {option.perHa ? ' / ha' : ''}
          </span>
          {option.upfront.map((cost) => (
            <span
              key={cost.resource}
              data-resource={cost.resource}
              data-missing={cost.missing > 0}
              className={`flex items-center gap-1 ${cost.missing > 0 ? 'font-semibold text-red-400' : ''}`}
            >
              <img
                src={`/icons/resources/${RESOURCE_ICONS[cost.resource].icon}.png`}
                alt={RESOURCE_ICONS[cost.resource].name}
                width={16}
                height={16}
              />
              {formatInteger(cost.amount)}
              {RESOURCE_ICONS[cost.resource].unit && ` ${RESOURCE_ICONS[cost.resource].unit}`}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * Mřížka staveb vpravo dole (jako v 0 A.D.): čtvercové ikony, klávesová zkratka a cena jen
 * v popisku. Stavba, na kterou ves nemá předem suroviny nebo lidi k osídlení, je zašedlá a nejde
 * spustit (ani zkratkou).
 */
export function BuildGrid({
  options,
  active,
  disabled,
  onBuild,
}: {
  /** Nabízené stavby; null = bez ceny (první zemnice zakládá ves – osídlí ji zakladatelé). */
  options: Partial<Record<BuildItem['kind'], BuildOption | null>>;
  /** Co se právě umisťuje. */
  active: BuildItem['kind'] | null;
  /** Scéna ještě není připravená. */
  disabled: boolean;
  onBuild: (kind: BuildItem['kind']) => void;
}): ReactElement {
  const items = BUILD_ITEMS.filter((item) => item.kind in options);
  const empty = Math.max(0, GRID_SLOTS - items.length);
  return (
    <nav
      aria-label="Stavby"
      data-testid="build-grid"
      data-hud-block
      className="hud-panel fixed right-2 bottom-2 z-20 p-2"
    >
      <ul className="grid grid-cols-4 gap-1.5">
        {items.map((item) => {
          const option = options[item.kind] ?? null;
          const unaffordable = option !== null && !option.affordable;
          return (
            <li key={item.kind}>
              <Tooltip
                content={<BuildTooltip item={item} option={option} />}
                placement="above-left"
              >
                <button
                  type="button"
                  aria-label={item.name}
                  aria-pressed={active === item.kind}
                  aria-keyshortcuts={item.hotkeyLabel}
                  disabled={disabled || unaffordable}
                  onClick={() => onBuild(item.kind)}
                  className="hud-icon-button h-14 w-14"
                >
                  <img
                    src={`/icons/build/${item.icon}.png`}
                    alt=""
                    width={128}
                    height={128}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                </button>
              </Tooltip>
            </li>
          );
        })}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} aria-hidden className="hud-inset h-14 w-14 rounded opacity-60" />
        ))}
      </ul>
    </nav>
  );
}
