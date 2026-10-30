'use client';

import { useRef, useState, type ReactElement } from 'react';
import { CART_NAMES, type BuildableDwellingType, type Direction8 } from '@bohemia/game';
import { useDismiss } from '@/hooks/use-dismiss';
import type { LeaveDirection, VillageJourneyView } from '@/lib/departure-view';
import { RELOCATION_TYPES } from '@/lib/relocation-view';
import type { SelectionLeave } from '@/lib/selection-details';
import { DIRECTION_NAMES } from '@/lib/trade-names';
import { formatInteger, formatManDays, formatPercent, plural } from '@/lib/village-format';
import { DWELLING_NAMES, type BuildOption } from '@/lib/village-view';
import { RESOURCE_ICONS } from './BuildGrid';
import { Tooltip } from './Tooltip';

// Přestěhování a odchod v panelu výběru (migration.md): tlačítka Přestěhovat (nový dům – zemnice,
// nebo polozemnice), Odejít (růžice – nová ves na téže mapě, nebo nová mapa ve směru), průběh
// rozestavěného stěhování se zrušením a řádek lidí na cestě.

/** Popisek tlačítka Přestěhovat: co a kolik to stojí – chybějící dřevo červeně (jako 0 A.D.). */
function RelocateTooltip({
  type,
  option,
  households,
}: {
  type: BuildableDwellingType;
  option: BuildOption;
  households: number;
}): ReactElement {
  return (
    <span className="block">
      <span className="font-serif text-sm font-semibold text-[#f3dfb0]">
        Přestěhovat – {DWELLING_NAMES[type].nominative.toLowerCase()}
      </span>
      {households > 1 && <span className="text-[#bfa77a]"> ×{households}</span>}
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="flex items-center gap-1">
          <img src="/icons/resources/labor.png" alt="" width={16} height={16} />
          {formatManDays(option.laborManDays)}
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
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Tlačítka Přestěhovat – jedno na typ nového domu (ikona zemnice / polozemnice, cena v popisku).
 * Bez dřeva předem zašedlé. U víc domácností se nové domy umisťují postupně, jeden za druhým.
 */
export function RelocateButtons({
  options,
  households,
  onRelocate,
}: {
  options: Record<BuildableDwellingType, BuildOption>;
  /** Kolik domácností se stěhuje (po jedné umístí hráč nový dům každé). */
  households: number;
  onRelocate?: (type: BuildableDwellingType) => void;
}): ReactElement {
  return (
    <div role="group" aria-label="Přestěhovat" className="flex items-center gap-1">
      {RELOCATION_TYPES.map((type) => {
        const option = options[type];
        return (
          <Tooltip
            key={type}
            content={<RelocateTooltip type={type} option={option} households={households} />}
            placement="above"
          >
            <button
              type="button"
              data-testid={`relocate-${type}`}
              aria-label={`Přestěhovat – ${DWELLING_NAMES[type].nominative.toLowerCase()}`}
              disabled={!option.affordable || !onRelocate}
              onClick={() => onRelocate?.(type)}
              className="hud-icon-button h-9 w-9"
            >
              <img
                src={`/icons/build/${type}.png`}
                alt=""
                width={128}
                height={128}
                draggable={false}
                className="h-full w-full object-cover"
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** Rozložení růžice odchodu (3 × 3): uprostřed „na téže mapě“, kolem 8 směrů nové mapy. */
const LEAVE_COMPASS: readonly ('here' | Direction8)[] = [
  'NW',
  'N',
  'NE',
  'W',
  'here',
  'E',
  'SW',
  'S',
  'SE',
];

/** Popisek tlačítka odchodu: kam, kolik lidí, jídla a dní cesty; proč tam nejde červeně. */
function LeaveTooltip({
  leave,
  target,
}: {
  leave: SelectionLeave;
  target: 'here' | LeaveDirection;
}): ReactElement {
  const title =
    target === 'here'
      ? 'Odejít – nová ves na téže mapě'
      : `Odejít na ${DIRECTION_NAMES[target.direction].name} – nová mapa`;
  return (
    <span className="block">
      <span className="font-serif text-sm font-semibold text-[#f3dfb0]">{title}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
        <span className="flex items-center gap-1">
          <img src="/icons/resources/people.png" alt="Lidé" width={16} height={16} />
          {formatInteger(leave.people)}
        </span>
        <span className="flex items-center gap-1">
          <img src="/icons/resources/food.png" alt="Jídlo s sebou (kg)" width={16} height={16} />
          {formatInteger(leave.foodKg)} kg
        </span>
        {leave.cart && (
          <span className="flex items-center gap-1" data-testid="leave-cart">
            <img
              src="/icons/resources/cart.png"
              alt={
                leave.cart === 'four-wheel'
                  ? 'Čtyřkolák s voly s sebou'
                  : 'Dvoukolák s volem s sebou'
              }
              width={16}
              height={16}
            />
            {CART_NAMES[leave.cart]}
          </span>
        )}
        {leave.horse && (
          <span className="flex items-center gap-1" data-testid="leave-horse">
            <img src="/icons/resources/horse.png" alt="Kůň s sebou" width={16} height={16} />
          </span>
        )}
        {target !== 'here' && (
          <span className="flex items-center gap-1">
            <img src="/icons/resources/date.png" alt="Dny cesty" width={16} height={16} />
            {target.days} {plural(target.days, 'den', 'dny', 'dní')}
          </span>
        )}
      </span>
      {target !== 'here' && target.blocked && (
        <span data-testid="leave-blocked" className="mt-0.5 block font-semibold text-red-400">
          {target.blocked}
        </span>
      )}
    </span>
  );
}

/**
 * Růžice odchodu (migration.md – fáze 3 a 4): uprostřed nová ves na téže mapě (hráč pak umístí
 * první zemnici), kolem šipky na novou mapu ve směru – tam, kde leží vlastní ves, zašedlé
 * s důvodem.
 */
export function LeaveCompass({
  leave,
  onLeave,
}: {
  leave: SelectionLeave;
  onLeave?: (target: 'here' | Direction8, households: readonly number[]) => void;
}): ReactElement {
  return (
    <div
      data-testid="leave-compass"
      role="group"
      aria-label="Odejít"
      className="grid grid-cols-3 gap-1"
    >
      {LEAVE_COMPASS.map((target) => {
        if (target === 'here') {
          return (
            <Tooltip
              key={target}
              placement="above"
              content={<LeaveTooltip leave={leave} target="here" />}
            >
              <button
                type="button"
                data-testid="leave-here"
                aria-label="Odejít – nová ves na téže mapě"
                disabled={!onLeave}
                onClick={() => onLeave?.('here', leave.households)}
                className="hud-icon-button h-9 w-9"
              >
                <img
                  src="/icons/build/zemnice.png"
                  alt=""
                  width={128}
                  height={128}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </button>
            </Tooltip>
          );
        }
        const option = leave.directions.find((d) => d.direction === target);
        if (!option) return <span key={target} />;
        const { arrow, name } = DIRECTION_NAMES[target];
        return (
          <Tooltip
            key={target}
            placement="above"
            content={<LeaveTooltip leave={leave} target={option} />}
          >
            <button
              type="button"
              data-testid={`leave-${target}`}
              aria-label={`Odejít na ${name}`}
              disabled={option.blocked !== null || !onLeave}
              onClick={() => onLeave?.(target, leave.households)}
              className="hud-icon-button h-9 w-9 text-lg font-bold text-[#ecdfc4]"
            >
              {arrow}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Tlačítko Odejít (migration.md – fáze 3 a 4): otevře růžici odchodu nad panelem výběru
 * (`hud-popup` – panel se nezvětší, stisk myši mimo ni ji zavře); když nikdo z vybraných obydlí
 * odejít nemůže (staví si nový dům, ves je na cestě…), zašedlé s důvodem.
 */
export function LeaveControls({
  leave,
  onLeave,
}: {
  leave: SelectionLeave | null;
  onLeave?: (target: 'here' | Direction8, households: readonly number[]) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(open, rootRef, () => setOpen(false));
  return (
    <div ref={rootRef} className="flex items-center gap-2">
      <Tooltip
        content={
          <span className="block">
            <span className="font-serif text-sm font-semibold text-[#f3dfb0]">
              Odejít do nové vsi
            </span>
            {leave === null && (
              <span className="mt-0.5 block font-semibold text-red-400">
                Odtud teď nikdo odejít nemůže
              </span>
            )}
          </span>
        }
        placement="above"
      >
        <button
          type="button"
          data-testid="leave-village"
          aria-expanded={open}
          disabled={leave === null}
          onClick={() => setOpen((value) => !value)}
          className="hud-button px-2 py-0.5 font-serif text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale aria-expanded:ring-2 aria-expanded:ring-[#c9a14a]"
        >
          Odejít
        </button>
      </Tooltip>
      {open && leave && (
        <div className="hud-panel hud-popup p-2" data-hud-block>
          <LeaveCompass
            leave={leave}
            onLeave={
              onLeave
                ? (target, households) => {
                    setOpen(false);
                    onLeave(target, households);
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * Lidé na cestě na novou mapu (migration.md – fáze 4): řádek nahoře – kam jdou a kdy dorazí; po
 * příjezdu výzva umístit první zemnici (jediná stavba v nabídce).
 */
export function JourneyBanner({ journey }: { journey: VillageJourneyView }): ReactElement {
  const where = DIRECTION_NAMES[journey.direction].name;
  return (
    <p
      data-testid="journey-banner"
      data-arrived={journey.arrived}
      className="hud-notice pointer-events-none fixed top-14 left-1/2 z-20 -translate-x-1/2 font-serif text-base text-[#f3dfb0]"
    >
      {journey.arrived
        ? 'Lidé dorazili – umísti první zemnici'
        : `Lidé jsou na cestě na ${where} – dorazí za ${journey.daysLeft} ${plural(journey.daysLeft, 'den', 'dny', 'dní')}`}
    </p>
  );
}

/**
 * Zrušit rozestavěnou stavbu (cancel-construction.ts) – vytýčení zmizí, nespotřebované dřevo se
 * vrátí na hromadu. Jen ikona (křížek), slova jen v popisku. Dokud server zrušení nepotvrdí,
 * tlačítko čeká.
 */
export function CancelConstructionButton({
  constructionId,
  onCancel,
}: {
  constructionId: number;
  onCancel?: (constructionId: number) => Promise<void>;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  return (
    <Tooltip content="Zrušit stavbu – nespotřebované dřevo se vrátí" placement="above">
      <button
        type="button"
        data-testid="cancel-construction"
        aria-label="Zrušit stavbu"
        disabled={busy || !onCancel}
        aria-busy={busy}
        onClick={() => {
          if (!onCancel || busy) return;
          setBusy(true);
          void onCancel(constructionId).finally(() => setBusy(false));
        }}
        className="hud-button flex h-7 w-7 items-center justify-center p-0 disabled:cursor-wait disabled:opacity-60"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M3 3 13 13M13 3 3 13"
            stroke="#e8c9a0"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </Tooltip>
  );
}

/** Rozestavěné stěhování u starého domu: průběh stavby nového domu a tlačítko Zrušit. */
export function RelocationProgress({
  constructionId,
  progress,
  onCancel,
}: {
  constructionId: number;
  progress: number;
  onCancel?: (constructionId: number) => Promise<void>;
}): ReactElement {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div data-testid="selection-relocation" className="flex items-center gap-2">
      <Tooltip content={`Stěhování – nový dům ${formatPercent(progress)}`} placement="above">
        <span
          role="progressbar"
          aria-label="Stěhování"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          tabIndex={0}
          className="hud-bar block h-2.5 w-28"
        >
          <span style={{ width: `${percent}%` }} />
        </span>
      </Tooltip>
      <CancelConstructionButton constructionId={constructionId} onCancel={onCancel} />
    </div>
  );
}
