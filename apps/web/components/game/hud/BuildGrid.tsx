'use client';

import type { ReactElement } from 'react';
import { BUILD_ITEMS, buildVariantName, type BuildItem } from '@/lib/build-items';
import { formatInteger, formatManDays } from '@/lib/village-format';
import type { SquaresVariant } from '@/lib/scene/village-types';
import type { BuildOption, StockResource } from '@/lib/village-view';
import { Tooltip } from './Tooltip';

/** Kolik slotů má mřížka staveb (jako příkazový panel 0 A.D.) – prázdné jsou prohlubně. */
const GRID_SLOTS = 12;

/** Ikony surovin předem – cesta k obrázku v `public/icons/`, jednotka a název. */
export const RESOURCE_ICONS: Record<StockResource, { src: string; unit: string; name: string }> = {
  grain: { src: '/icons/resources/food.png', unit: 'kg', name: 'Obilí' },
  wood: { src: '/icons/resources/wood.png', unit: '', name: 'Dřevo (stromy)' },
  oaks: { src: '/icons/build/dub.png', unit: '', name: 'Dospělé duby' },
  settlers: { src: '/icons/resources/people.png', unit: '', name: 'Lidé k osídlení' },
};

/**
 * Popisek stavby: název a cena – práce, suroviny, dospělé duby a lidé k osídlení předem,
 * chybějící červeně (jako v 0 A.D.); stavbu, která nejde z jiného důvodu (svatyně je jedna na
 * ves), krátký červený řádek.
 */
function BuildTooltip({
  item,
  option,
  variant,
}: {
  item: BuildItem;
  option: BuildOption | null;
  /** Druh v rozcestníku (ohrada ovcí…) – bez zkratky, klávesové zkratky mají jen stavby. */
  variant?: SquaresVariant;
}): ReactElement {
  return (
    <span className="block">
      <span className="font-serif text-sm font-semibold text-[#f3dfb0]">
        {variant ? buildVariantName(item, variant) : item.name}
      </span>
      {!variant && (
        <>
          {' '}
          <span className="text-[#bfa77a]">[{item.hotkeyLabel}]</span>
        </>
      )}
      {option && (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1">
            <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
            {formatManDays(option.laborManDays)}
            {option.perHa ? ' / ha' : option.perSquare ? ' / čtverec' : ''}
          </span>
          {option.upfront.map((cost) => (
            <span
              key={cost.resource}
              data-resource={cost.resource}
              data-missing={cost.missing > 0}
              className={`flex items-center gap-1 ${cost.missing > 0 ? 'font-semibold text-red-400' : ''}`}
            >
              <img
                src={RESOURCE_ICONS[cost.resource].src}
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
      {option?.blocked && (
        <span data-testid="build-blocked" className="mt-0.5 block font-semibold text-red-400">
          {option.blocked}
        </span>
      )}
    </span>
  );
}

/** Čtvercové tlačítko mřížky s ikonou a popiskem. */
function GridButton({
  label,
  icon,
  tooltip,
  pressed,
  disabled,
  hotkey,
  onClick,
}: {
  label: string;
  /** Cesta k ikoně v `public/`. */
  icon: string;
  tooltip: ReactElement;
  pressed: boolean;
  disabled: boolean;
  hotkey?: string;
  onClick: () => void;
}): ReactElement {
  return (
    <li>
      <Tooltip content={tooltip} placement="above-left">
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          {...(hotkey ? { 'aria-keyshortcuts': hotkey } : {})}
          disabled={disabled}
          onClick={onClick}
          className="hud-icon-button h-14 w-14"
        >
          <img
            src={icon}
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
}

/**
 * Mřížka staveb vpravo dole (jako v 0 A.D.): čtvercové ikony, klávesová zkratka a cena jen
 * v popisku. Stavba, na kterou ves nemá předem suroviny, duby nebo lidi k osídlení (nebo už
 * stojí jediná svatyně), je zašedlá a nejde spustit (ani zkratkou). Stavba s druhy (ohrada –
 * oxen.md, Ohrady podle druhu) je jen rozcestník: kliknutí (i zkratka) otevře v mřížce její druhy
 * – první tlačítko je stavba sama (zpět), za ní druhy bez zkratek; druh spustí umisťování.
 */
export function BuildGrid({
  options,
  active,
  disabled,
  group = null,
  onBuild,
}: {
  /** Nabízené stavby; null = bez ceny (první zemnice zakládá ves – osídlí ji zakladatelé). */
  options: Partial<Record<BuildItem['kind'], BuildOption | null>>;
  /** Co se právě umisťuje. */
  active: BuildItem['kind'] | null;
  /** Scéna ještě není připravená. */
  disabled: boolean;
  /** Otevřený rozcestník (stavba s druhy), null = všechny stavby. */
  group?: BuildItem['kind'] | null;
  /**
   * Kliknutí na stavbu (u stavby s druhy otevře či zavře rozcestník – to řeší volající), nebo na
   * druh v rozcestníku (`variant`).
   */
  onBuild: (kind: BuildItem['kind'], variant?: string) => void;
}): ReactElement {
  const hub = group === null ? null : (BUILD_ITEMS.find((item) => item.kind === group) ?? null);
  const hubVariants =
    hub?.placement === 'squares' && hub.kind in options ? hub.variants : undefined;
  const items = BUILD_ITEMS.filter((item) => item.kind in options);
  const slots = hub && hubVariants ? 1 + hubVariants.length : items.length;
  const empty = Math.max(0, GRID_SLOTS - slots);
  return (
    <nav
      aria-label="Stavby"
      data-testid="build-grid"
      data-hud-block
      {...(hub && hubVariants ? { 'data-group': hub.kind } : {})}
      className="hud-panel fixed right-2 bottom-2 z-20 p-2"
    >
      <ul className="grid grid-cols-4 gap-1.5">
        {hub && hubVariants
          ? [
              <GridButton
                key={hub.kind}
                label={hub.name}
                icon={`/icons/build/${hub.icon}.png`}
                tooltip={<BuildTooltip item={hub} option={options[hub.kind] ?? null} />}
                pressed
                disabled={disabled}
                hotkey={hub.hotkeyLabel}
                onClick={() => onBuild(hub.kind)}
              />,
              ...hubVariants.map((variant) => {
                const option = options[hub.kind] ?? null;
                return (
                  <GridButton
                    key={variant.id}
                    label={buildVariantName(hub, variant)}
                    icon={`/icons/resources/${variant.icon}.png`}
                    tooltip={<BuildTooltip item={hub} option={option} variant={variant} />}
                    pressed={false}
                    disabled={disabled || (option !== null && !option.affordable)}
                    onClick={() => onBuild(hub.kind, variant.id)}
                  />
                );
              }),
            ]
          : items.map((item) => {
              const option = options[item.kind] ?? null;
              return (
                <GridButton
                  key={item.kind}
                  label={item.name}
                  icon={`/icons/build/${item.icon}.png`}
                  tooltip={<BuildTooltip item={item} option={option} />}
                  pressed={active === item.kind}
                  disabled={disabled || (option !== null && !option.affordable)}
                  hotkey={item.hotkeyLabel}
                  onClick={() => onBuild(item.kind)}
                />
              );
            })}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} aria-hidden className="hud-inset h-14 w-14 rounded opacity-60" />
        ))}
      </ul>
    </nav>
  );
}
