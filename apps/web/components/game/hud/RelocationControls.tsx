'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { CART_NAMES, type Direction8, type VillageRight } from '@bohemia/game';
import { useDismiss } from '@/hooks/use-dismiss';
import type {
  LeaveDirection,
  PendingDepartureView,
  VillageJourneyView,
} from '@/lib/departure-view';
import type { SelectionLeave } from '@/lib/selection-details';
import { DIRECTION_NAMES } from '@/lib/trade-names';
import { formatInteger, plural } from '@/lib/village-format';
import { LineNamePanel } from './LineNamePanel';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';

// Odchod v panelu výběru (migration.md): Odejít (růžice – nová ves na téže mapě, nebo nová mapa ve
// směru), zrušení rozestavěné stavby a řádek lidí na cestě. Přestěhování domácnosti zaniklo
// (demolition.md).

/**
 * Rozložení růžice odchodu (3 × 3): kolem 8 směrů nové mapy, uprostřed nic (null) – jedna ves,
 * jedna mapa, na téže mapě se nová ves nezakládá.
 */
const LEAVE_COMPASS: readonly (Direction8 | null)[] = [
  'NW',
  'N',
  'NE',
  'W',
  null,
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
  target: LeaveDirection;
}): ReactElement {
  const title = `Odejít na ${DIRECTION_NAMES[target.direction].name} – nová mapa`;
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
        <span className="flex items-center gap-1">
          <img src="/icons/resources/date.png" alt="Dny cesty" width={16} height={16} />
          {target.days} {plural(target.days, 'den', 'dny', 'dní')}
        </span>
      </span>
      {target.blocked && (
        <span data-testid="leave-blocked" className="mt-0.5 block font-semibold text-red-400">
          {target.blocked}
        </span>
      )}
    </span>
  );
}

/**
 * Růžice odchodu (migration.md – fáze 3 a 4): šipky na novou mapu ve směru – tam, kde leží vlastní
 * ves, zašedlé s důvodem. Jedna ves, jedna mapa – na téže mapě se neodchází.
 */
export function LeaveCompass({
  leave,
  onLeave,
  right = 'evacuate',
}: {
  leave: SelectionLeave;
  /** Právo, které odchod vyžaduje (vystěhování vsi, nebo odchod se synem – rights.ts). */
  right?: VillageRight;
  onLeave?: (direction: Direction8, households: readonly number[]) => void;
}): ReactElement {
  const denied = useRightDenied(right);
  return (
    <div
      data-testid="leave-compass"
      role="group"
      aria-label="Odejít"
      className="grid grid-cols-3 gap-1"
    >
      {LEAVE_COMPASS.map((target) => {
        if (target === null) return <span key="centre" />;
        const option = leave.directions.find((d) => d.direction === target);
        if (!option) return <span key={target} />;
        const { arrow, name } = DIRECTION_NAMES[target];
        return (
          <Tooltip
            key={target}
            placement="above"
            denied={denied}
            content={<LeaveTooltip leave={leave} target={option} />}
          >
            <button
              type="button"
              data-testid={`leave-${target}`}
              aria-label={`Odejít na ${name}`}
              disabled={option.blocked !== null || !onLeave || denied !== null}
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
  onLeave?: (direction: Direction8, households: readonly number[]) => void;
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
  const denied = useRightDenied('build');
  return (
    <Tooltip
      content="Zrušit stavbu – nespotřebované dřevo se vrátí"
      denied={denied}
      placement="above"
    >
      <button
        type="button"
        data-testid="cancel-construction"
        aria-label="Zrušit stavbu"
        disabled={busy || !onCancel || denied !== null}
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

/**
 * Odchod mladšího syna po pohřbu (seniorate.md, bod 4): přesýpací hodiny se zbývajícími dny, obrys
 * dílu ve scéně (`onPreview`), panel jména syna bez jména a růžice směrů. Zvolený směr pošle
 * `onChoose` (výprava vyrazí hned, první zemnici umístí hráč); po lhůtě vyrazí sama.
 */
export function PlayerDeparturePanel({
  departure,
  onChoose,
  onPreview,
}: {
  departure: PendingDepartureView;
  /** Pošle směr (a jméno syna bez jména) na server – vrátí důvod odmítnutí, nebo null. */
  onChoose: (direction: Direction8, sonName?: string) => Promise<string | null>;
  /** Obrys obydlí dílu ve scéně; po zavření panelu null. */
  onPreview?: ((dwellingIds: readonly number[] | null) => void) | undefined;
}): ReactElement {
  const [name, setName] = useState<string | null>(null);
  const previewKey = JSON.stringify(departure.dwellingIds);
  useEffect(() => {
    if (!onPreview) return;
    const ids = JSON.parse(previewKey) as number[];
    onPreview(ids.length === 0 ? null : ids);
    return () => onPreview(null);
  }, [previewKey, onPreview]);
  const days = departure.daysLeft;
  const leave = {
    households: departure.dwellingIds,
    people: departure.people,
    foodKg: departure.foodKg,
    cart: departure.cart,
    directions: departure.directions,
    ...(departure.horse ? { horse: true } : {}),
  };
  const needsName = departure.needsName && name === null;
  return (
    <div
      data-testid="player-departure"
      data-hud-block
      className="hud-panel pointer-events-auto fixed top-14 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 p-2"
    >
      <Tooltip
        content={`Do odchodu zbývá ${days} ${plural(days, 'den', 'dny', 'dní')} – pak vyrazí výprava sama`}
        placement="below"
      >
        <span
          data-testid="player-departure-days"
          tabIndex={0}
          className="flex items-center gap-1 font-serif text-base text-[#f3dfb0] tabular-nums"
        >
          <img src="/icons/house/hourglass.svg" alt="Zbývající dny" width={28} height={28} />
          {days}
        </span>
      </Tooltip>
      {needsName ? (
        <LineNamePanel
          lord={false}
          portrait="man"
          taken={departure.taken}
          onConfirm={(value) => {
            setName(value);
            return Promise.resolve(null);
          }}
        />
      ) : (
        <LeaveCompass
          leave={leave}
          right="sendSons"
          onLeave={(direction) => {
            void onChoose(direction, departure.needsName ? (name ?? undefined) : undefined);
          }}
        />
      )}
    </div>
  );
}
