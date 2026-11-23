'use client';

import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  dateOfDayIndex,
  TRADE_GOODS,
  type Craft,
  type MarketOrder,
  type MarketPrices,
  type MarketVillage,
  type TradeGood,
  type TradeGoods,
} from '@bohemia/game';
import { formatGameDate } from '@/lib/game-date';
import type { VillageManor } from '@/lib/manor-view';
import { marketPreview, type MarketTripPhase } from '@/lib/market-view';
import { TRADE_GOOD_NAMES } from '@/lib/trade-names';
import { formatDecimal, formatInteger } from '@/lib/village-format';
import { Dialog } from './Dialog';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';

// Panel Trh ve dvorci (markets.md – Pravidla 8 a 9, Rozhodnutí plánu 2, bod 9): přehled vsí, kam
// smí výprava, zpráva na pivo vybrané vsi, sloupce „Dáš“ / „Dostaneš“ (jediné popisky – jako
// „Prodat“ a „Koupit“ v 0 A.D.), dny na trhu, náhled a odeslání a výpravy na cestě. Panel jen
// ukazuje a posílá záměr – důvody odmítnutí bere z náhledu jádra (`marketPreview`).

type Side = 'give' | 'want';

/** Ikony řemesel ve zprávě (dílny ve stavebním katalogu). */
const CRAFT_ICONS: Record<Craft, { name: string; icon: string }> = {
  potter: { name: 'Hrnčíř', icon: 'hrncir' },
  smith: { name: 'Kovář', icon: 'kovar' },
  burner: { name: 'Uhlíř', icon: 'uhlir' },
  carpenter: { name: 'Tesař', icon: 'tesar' },
};

/** Fáze výpravy: popisek a ikona. */
const PHASES: Record<MarketTripPhase, { label: string; icon: string }> = {
  out: { label: 'Na cestě na trh', icon: 'walk' },
  market: { label: 'Na trhu', icon: 'balance' },
  back: { label: 'Na cestě domů', icon: 'walk' },
  waiting: { label: 'Čeká na zboží', icon: 'hourglass' },
};

/** Krok výběru: po 100 kg, kusy a m³ po jedné. */
const stepOf = (good: TradeGood): number => (TRADE_GOOD_NAMES[good].unit === 'kg' ? 100 : 1);

/** Ikona zboží s popiskem názvu. */
function GoodIcon({ good, size = 20 }: { good: TradeGood; size?: number }): ReactElement {
  const { name, icon } = TRADE_GOOD_NAMES[good];
  return (
    <Tooltip content={name} placement="above">
      <img
        src={`/icons/resources/${icon}.png`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    </Tooltip>
  );
}

/** Ikona s číslem a popiskem (lidé, domy, nosiči, dny). */
function Figure({
  icon,
  name,
  children,
  folder = 'resources',
}: {
  icon: string;
  name: ReactNode;
  children: ReactNode;
  folder?: 'resources' | 'build';
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <span className="flex items-center gap-1 whitespace-nowrap tabular-nums" tabIndex={0}>
        <img src={`/icons/${folder}/${icon}.png`} alt="" width={18} height={18} />
        {children}
      </span>
    </Tooltip>
  );
}

const dateText = (day: number): string => formatGameDate(dateOfDayIndex(day));

/** Ceny trhu ve zprávě: ikona vah a řada zboží s cenou v mincích za jednotku. */
function PricesLine({ prices }: { prices: MarketPrices }): ReactElement | null {
  const items = TRADE_GOODS.filter((g) => (prices[g] ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tooltip content="Ceny na trhu" placement="above">
        <img src="/icons/resources/balance.png" alt="" width={18} height={18} />
      </Tooltip>
      {items.map((g) => {
        const price = prices[g] ?? 0;
        return (
          <span key={g} className="flex items-center gap-1 text-xs tabular-nums">
            <GoodIcon good={g} size={16} />
            {formatDecimal(price, price < 1 ? 2 : 1)}
          </span>
        );
      })}
    </div>
  );
}

/** Zpráva na pivo o vsi (Pravidla 8): lidé a domy zaokrouhleně, řemesla, obchodníci a ceny; bez zprávy „?“. */
function Report({ village }: { village: MarketVillage }): ReactElement {
  const { news, seen } = village;
  if (!news && !seen) {
    return (
      <div data-testid="market-report" className="hud-inset rounded p-1.5 font-semibold">
        ?
      </div>
    );
  }
  const day = news?.report.day ?? seen?.day ?? 0;
  const crafts = news?.report.crafts ?? seen?.crafts ?? [];
  const houses = news?.report.houses ?? seen?.houses ?? null;
  return (
    <div data-testid="market-report">
      <Tooltip block content={`Zpráva z ${dateText(day)}`} placement="above">
        <div className="hud-inset flex w-full flex-col gap-1 rounded p-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <Figure icon="people" name="Lidé">
              {news ? `≈ ${formatInteger(news.report.people)}` : '?'}
            </Figure>
            <Figure icon="srub" folder="build" name="Domy">
              {houses === null ? '?' : `${news ? '≈ ' : ''}${formatInteger(houses)}`}
            </Figure>
            {crafts.map((c) => (
              <Figure key={c} icon={CRAFT_ICONS[c].icon} folder="build" name={CRAFT_ICONS[c].name}>
                {''}
              </Figure>
            ))}
          </div>
          {news?.report.traders.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="font-semibold">{t.name}</span>
              <span className="text-[#bfa77a]">{dateText(t.day)}</span>
              {t.goods.map((g) => (
                <GoodIcon key={g} good={g} size={16} />
              ))}
            </div>
          ))}
          {news?.prices && <PricesLine prices={news.prices} />}
        </div>
      </Tooltip>
    </div>
  );
}

/** Řádek vsi přehledu: jméno, vzdálenost ve dnech cesty, vlastní rod; zašedlá s důvodem. */
function VillageRow({
  village,
  selected,
  onSelect,
}: {
  village: MarketVillage;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  const blocked = village.blocked !== null;
  const distance =
    village.travelDays === 0 ? 'Ráno tam, večer zpět' : `${village.travelDays} dní cesty`;
  return (
    <div
      data-testid="market-village"
      data-own={village.own}
      data-blocked={blocked}
      className={`flex items-center gap-2 rounded px-1.5 py-1 ${selected ? 'ring-2 ring-[#c9a14a]' : ''} ${blocked ? 'opacity-50 grayscale' : ''}`}
    >
      <Tooltip
        block
        placement="above"
        content={
          blocked ? (
            <span className="font-semibold text-red-400">{village.blocked}</span>
          ) : (
            village.name
          )
        }
      >
        <button
          type="button"
          disabled={blocked}
          aria-pressed={selected}
          aria-label={village.name}
          onClick={onSelect}
          className="hud-inset flex w-full items-center gap-2 rounded px-2 py-1 text-left disabled:cursor-not-allowed"
        >
          <img
            src={village.own ? '/icons/build/dvorec.png' : '/icons/build/srub.png'}
            alt=""
            width={20}
            height={20}
            className="h-5 w-5 rounded-sm"
          />
          <span className="font-semibold">{village.name}</span>
          {village.houseName && !village.own && (
            <span className="text-xs text-[#bfa77a]">{village.houseName}</span>
          )}
        </button>
      </Tooltip>
      <Tooltip content={distance} placement="above-left">
        <span className="flex items-center gap-1 tabular-nums" tabIndex={0}>
          <img src="/icons/resources/walk.png" alt="" width={18} height={18} />
          {village.travelDays}
        </span>
      </Tooltip>
      {village.own && (
        <Tooltip content="Vlastní rod" placement="above-left">
          <img src="/icons/resources/family.png" alt="" width={18} height={18} />
        </Tooltip>
      )}
    </div>
  );
}

/** Tlačítka − a + s číslem uprostřed. */
function Stepper({
  testId,
  value,
  max,
  min = 0,
  step,
  label,
  onChange,
}: {
  testId: string;
  value: number;
  max: number;
  min?: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
}): ReactElement {
  const btn =
    'hud-inset h-6 w-6 rounded text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        data-testid={`${testId}-minus`}
        aria-label={`${label} −`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className={btn}
      >
        −
      </button>
      <span className="min-w-12 text-center text-sm tabular-nums">{formatInteger(value)}</span>
      <button
        type="button"
        data-testid={`${testId}-plus`}
        aria-label={`${label} +`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className={btn}
      >
        +
      </button>
    </span>
  );
}

/** Řádek zboží sloupce: ikona (název v popisku), číslo, +/−. */
function GoodRow({
  side,
  good,
  value,
  max,
  onChange,
}: {
  side: Side;
  good: TradeGood;
  value: number;
  max: number;
  onChange: (value: number) => void;
}): ReactElement {
  const { name, unit, icon } = TRADE_GOOD_NAMES[good];
  return (
    <div data-testid={`market-${side}-${good}`} className="flex items-center gap-1.5">
      <Tooltip content={`${name} (${unit})`} placement="above">
        <img
          src={`/icons/resources/${icon}.png`}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 shrink-0"
        />
      </Tooltip>
      <Stepper
        testId={`market-${side}-${good}`}
        value={value}
        max={max}
        step={stepOf(good)}
        label={name}
        onChange={onChange}
      />
    </div>
  );
}

/** Sloupec s hlavičkou „Dáš“ (ze vsi ven) / „Dostaneš“ (do vsi). */
function Column({ side, children }: { side: Side; children: ReactNode }): ReactElement {
  return (
    <div
      className="hud-inset flex max-h-64 min-w-0 flex-1 flex-col gap-1 overflow-y-auto rounded p-1.5"
      role="group"
      aria-label={side === 'give' ? 'Dáš' : 'Dostaneš'}
      data-testid={`market-${side}-column`}
    >
      <h3 className="px-0.5 pb-0.5 text-sm font-semibold whitespace-nowrap text-[#e8cf94]">
        {side === 'give' ? <>→ Dáš</> : <>Dostaneš →</>}
      </h3>
      {children}
    </div>
  );
}

const hasGoods = (goods: TradeGoods): boolean => TRADE_GOODS.some((g) => (goods[g] ?? 0) > 0);

/** Výběr bez nul. */
function without(goods: TradeGoods, good: TradeGood, value: number): TradeGoods {
  const next = { ...goods };
  if (value > 0) next[good] = value;
  else delete next[good];
  return next;
}

/**
 * Panel Trh: `villages` je přehled ze serveru (`null` – načítá se), `market` vstup náhledu a výpravy
 * na cestě z pohledu dvorce, `onSend` pošle výpravu a vrátí důvod odmítnutí serveru (nebo null).
 */
export function MarketPanel({
  villages,
  error,
  market,
  onSend,
  onClose,
}: {
  villages: MarketVillage[] | null;
  /** Proč se přehled nenačetl. */
  error: string | null;
  market: VillageManor['market'];
  onSend: (targetVillageId: string, order: MarketOrder) => Promise<string | null>;
  onClose: () => void;
}): ReactElement {
  const denied = useRightDenied('trade');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [give, setGive] = useState<TradeGoods>({});
  const [wants, setWants] = useState<TradeGoods>({});
  const [stayDays, setStayDays] = useState(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = villages?.find((v) => v.villageId === targetId) ?? null;
  const order = useMemo<MarketOrder>(() => ({ give, wants, stayDays }), [give, wants, stayDays]);
  const preview = target ? marketPreview(order, market, target.cells) : null;
  const showPreview = preview !== null && (hasGoods(give) || hasGoods(wants));
  const stocked = TRADE_GOODS.filter((g) => (market.stock[g] ?? 0) > 0);

  const edit = (apply: () => void): void => {
    setServerError(null);
    apply();
  };
  const send = (): void => {
    if (!target || busy) return;
    setBusy(true);
    void onSend(target.villageId, order)
      .then((reason) => {
        setServerError(reason);
        if (reason === null) {
          setGive({});
          setWants({});
          setStayDays(1);
        }
      })
      .finally(() => setBusy(false));
  };
  const sendReason = !target ? 'Vyber ves.' : (preview?.reason ?? null);
  const sendDisabled = denied !== null || busy || sendReason !== null;

  return (
    <Dialog
      title="Trh"
      icon={<img src="/icons/build/obchod.png" alt="" width={24} height={24} className="h-6 w-6" />}
      onClose={onClose}
      widthClass="w-[40rem]"
      testId="market-panel"
    >
      <div className="flex flex-col gap-2 text-[#ecdfc4]">
        {error && (
          <p data-testid="market-overview-error" className="font-semibold text-red-400">
            {error}
          </p>
        )}
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {villages?.map((v) => (
            <VillageRow
              key={v.villageId}
              village={v}
              selected={v.villageId === targetId}
              onSelect={() => edit(() => setTargetId(v.villageId))}
            />
          ))}
        </div>
        {target && <Report village={target} />}
        <div className="flex gap-2">
          <Column side="give">
            {stocked.map((g) => (
              <GoodRow
                key={g}
                side="give"
                good={g}
                value={give[g] ?? 0}
                max={market.stock[g] ?? 0}
                onChange={(v) => edit(() => setGive((cur) => without(cur, g, v)))}
              />
            ))}
          </Column>
          <Column side="want">
            {TRADE_GOODS.map((g) => (
              <GoodRow
                key={g}
                side="want"
                good={g}
                value={wants[g] ?? 0}
                max={Number.MAX_SAFE_INTEGER}
                onChange={(v) => edit(() => setWants((cur) => without(cur, g, v)))}
              />
            ))}
          </Column>
        </div>
        <div className="flex items-center gap-3 whitespace-nowrap">
          <Tooltip content="Dny na trhu" placement="above">
            <span data-testid="market-stay" className="flex items-center gap-1.5" tabIndex={0}>
              <img src="/icons/resources/date.png" alt="" width={20} height={20} />
              <Stepper
                testId="market-stay"
                value={stayDays}
                min={1}
                max={Number.MAX_SAFE_INTEGER}
                step={1}
                label="Dny na trhu"
                onChange={(v) => edit(() => setStayDays(v))}
              />
            </span>
          </Tooltip>
          {showPreview && preview.reason === null && (
            <span data-testid="market-preview" className="flex items-center gap-3 text-sm">
              <Figure icon="people" name="Nosiči">
                {preview.porters}
              </Figure>
              {preview.carts > 0 && (
                <Figure icon="cart" name="Vozy">
                  {preview.carts}
                </Figure>
              )}
              <Figure icon="hourglass" name="Dní pryč">
                {preview.awayDays}
              </Figure>
            </span>
          )}
          <span className="ml-auto">
            <Tooltip
              placement="above-left"
              denied={denied}
              content={
                sendReason === null ? (
                  'Vyslat výpravu'
                ) : (
                  <span className="font-semibold text-red-400">{sendReason}</span>
                )
              }
            >
              <button
                type="button"
                data-testid="market-send"
                aria-label="Vyslat výpravu"
                disabled={sendDisabled}
                aria-busy={busy}
                onClick={send}
                className="hud-inset h-10 w-10 overflow-hidden rounded disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
              >
                <img
                  src="/icons/build/obchod.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full"
                />
              </button>
            </Tooltip>
          </span>
        </div>
        {serverError && (
          <p data-testid="market-error" className="text-sm font-semibold text-red-400">
            {serverError}
          </p>
        )}
        {market.trips.map((trip) => (
          <div key={trip.key} data-testid="market-trip" data-phase={trip.phase}>
            <Tooltip block placement="above" content={PHASES[trip.phase].label}>
              <div
                className="hud-inset flex w-full items-center gap-3 rounded px-2 py-1"
                tabIndex={0}
              >
                <span className="font-semibold">{trip.villageName}</span>
                <img
                  src={`/icons/resources/${PHASES[trip.phase].icon}.png`}
                  alt=""
                  width={20}
                  height={20}
                />
                <span className="ml-auto flex items-center gap-1 tabular-nums">
                  <img src="/icons/resources/date.png" alt="" width={18} height={18} />
                  {trip.daysLeft}
                </span>
              </div>
            </Tooltip>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
