'use client';

import type { ReactElement } from 'react';
import { BUILD_ITEMS, buildVariantName, type BuildItem } from '@/lib/build-items';
import { formatInteger, formatManDays } from '@/lib/village-format';
import { TRADE_GOOD_NAMES } from '@/lib/trade-names';
import type { SquaresVariant } from '@/lib/scene/village-types';
import { isBuildAffordable, type BuildOption, type StockResource } from '@/lib/village-view';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';

/** Ikona stavby – PNG podle jména (`public/icons/build/<jméno>.png`), jiný soubor s příponou. */
function buildIconSrc(icon: string): string {
  return `/icons/build/${icon.includes('.') ? icon : `${icon}.png`}`;
}

/** Kolik slotů má mřížka staveb (jako příkazový panel 0 A.D.) – prázdné jsou prohlubně. */
const GRID_SLOTS = 12;

/** Ikony surovin předem – cesta k obrázku v `public/icons/`, jednotka a název. */
export const RESOURCE_ICONS: Record<StockResource, { src: string; unit: string; name: string }> = {
  grain: { src: '/icons/resources/food.png', unit: 'kg', name: 'Obilí' },
  wood: { src: '/icons/resources/wood.png', unit: '', name: 'Dřevo (stromy)' },
  oaks: { src: '/icons/build/dub.png', unit: '', name: 'Dospělé duby' },
};

/**
 * Popisek stavby: název a cena – práce, suroviny, dospělé duby a lidé k osídlení předem,
 * chybějící červeně (jako v 0 A.D.); stavbu, která nejde z jiného důvodu (svatyně je jedna na
 * ves), krátký červený řádek.
 */
function BuildTooltip({
  item,
  option: baseOption,
  variant,
  extending = false,
  blocked = null,
}: {
  item: BuildItem;
  option: BuildOption | null;
  /** Druh v rozcestníku (ohrada ovcí…) – bez zkratky, klávesové zkratky mají jen stavby. */
  variant?: SquaresVariant;
  /** Vybraná ohrada tohoto druhu se rozšiřuje – koně se neplatí, platba ani blokace se nezobrazí. */
  extending?: boolean;
  /** Druh v rozcestníku ještě nejde z jiného důvodu než surovin (roštová hradba až od roku 790). */
  blocked?: string | null;
}): ReactElement {
  // druh s vlastní cenou (ohrada koní – obilí předem za koně)
  const own = variant ? baseOption?.variants?.[variant.id] : undefined;
  const option = baseOption && own ? { ...baseOption, ...own } : baseOption;
  const payment = extending ? [] : (own?.payment ?? []);
  // důvod druhu (rok), jinak stavby – rozšíření vybrané ohrady koní blokaci nezobrazí
  const reason = blocked ?? (extending && own ? null : (option?.blocked ?? null));
  return (
    <span className="block">
      <span className="font-serif text-sm font-semibold text-[#f3dfb0]">
        {variant ? buildVariantName(item, variant) : (option?.look?.name ?? item.name)}
      </span>
      {!variant && (
        <>
          {' '}
          <span className="text-[#bfa77a]">[{item.hotkeyLabel}]</span>
        </>
      )}
      {option && (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {/* kostel cenu předem nemá – práce a materiál podle rozměrů jsou u kurzoru */}
          {option.laborManDays > 0 && (
            <span className="flex items-center gap-1">
              <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
              {formatManDays(option.laborManDays)}
              {option.perHa ? ' / ha' : option.perSquare ? ' / čtverec' : ''}
            </span>
          )}
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
          {payment.map((pay) => (
            <span key={pay.good} data-payment={pay.good} className="flex items-center gap-1">
              <img
                src={`/icons/resources/${TRADE_GOOD_NAMES[pay.good].icon}.png`}
                alt={TRADE_GOOD_NAMES[pay.good].name}
                width={16}
                height={16}
              />
              {formatInteger(pay.amount)}
            </span>
          ))}
        </span>
      )}
      {reason && (
        <span data-testid="build-blocked" className="mt-0.5 block font-semibold text-red-400">
          {reason}
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
  // seniorát: v cizí vsi rodu stavět smí jen senior (rights.ts) – jinak zašedlé s důvodem
  const denied = useRightDenied('build');
  return (
    <li>
      <Tooltip content={tooltip} denied={denied} placement="above-left">
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          {...(hotkey ? { 'aria-keyshortcuts': hotkey } : {})}
          disabled={disabled || denied !== null}
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
  extendingVariant = null,
  blockedVariants = {},
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
  /** Druh ohrady, jejíž existující ohrada je vybraná (rozšíření bez platby za koně). */
  extendingVariant?: string | null;
  /**
   * Druhy otevřeného rozcestníku, které ještě nejdou z jiného důvodu než surovin – id druhu →
   * důvod (opevnění: roštová hradba až od roku 790, komorová od 830). Zašedlé s důvodem v popisku.
   */
  blockedVariants?: Readonly<Record<string, string>>;
  /**
   * Kliknutí na stavbu (u stavby s druhy otevře či zavře rozcestník – to řeší volající), nebo na
   * druh v rozcestníku (`variant`).
   */
  onBuild: (kind: BuildItem['kind'], variant?: string) => void;
}): ReactElement {
  const hub = group === null ? null : (BUILD_ITEMS.find((item) => item.kind === group) ?? null);
  const hubVariants =
    (hub?.placement === 'squares' || hub?.placement === 'fort-points') && hub.kind in options
      ? hub.variants
      : undefined;
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
                icon={buildIconSrc(hub.icon)}
                tooltip={<BuildTooltip item={hub} option={options[hub.kind] ?? null} />}
                pressed
                disabled={disabled}
                hotkey={hub.hotkeyLabel}
                onClick={() => onBuild(hub.kind)}
              />,
              ...hubVariants.map((variant) => {
                const option = options[hub.kind] ?? null;
                const extending = extendingVariant === variant.id;
                const affordable = isBuildAffordable(option, variant.id, extending);
                const blocked = blockedVariants[variant.id] ?? null;
                return (
                  <GridButton
                    key={variant.id}
                    label={buildVariantName(hub, variant)}
                    icon={`/icons/resources/${variant.icon}.png`}
                    tooltip={
                      <BuildTooltip
                        item={hub}
                        option={option}
                        variant={variant}
                        extending={extending}
                        blocked={blocked}
                      />
                    }
                    pressed={false}
                    disabled={disabled || !affordable || blocked !== null}
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
                  label={option?.look?.name ?? item.name}
                  icon={buildIconSrc(option?.look?.icon ?? item.icon)}
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
