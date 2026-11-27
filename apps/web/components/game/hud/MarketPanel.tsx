'use client';

import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  coinPriceOf,
  dateOfDayIndex,
  COIN_GOOD,
  JEWELLER,
  MARKET,
  TRADE_GOODS,
  type ArmsGood,
  type Craft,
  type MarketOrder,
  type MarketPrices,
  type MarketVillage,
  type TradeGood,
  type TradeGoods,
  type TradePeople,
} from '@bohemia/game';
import { formatDayMonth, formatGameDate } from '@/lib/game-date';
import type { VillageManor } from '@/lib/manor-view';
import { marketPreview, type MarketTripPhase } from '@/lib/market-view';
import { TRADE_GOOD_NAMES } from '@/lib/trade-names';
import { formatCoinPrice, formatInteger, plural } from '@/lib/village-format';
import { ArmsOrder } from './ArmsOrder';
import { SlaveSale } from './SlaveSale';
import { Dialog } from './Dialog';
import { useRightDenied } from './rights';
import { Stepper } from './Stepper';
import { Tooltip } from './Tooltip';
import { useMarketPeople, type MarketPeopleAnswer } from './use-market-people';

// Panel Trh ve dvorci (markets.md – Pravidla 8 a 9, Rozhodnutí plánu 2, bod 9): přehled vsí, kam
// smí výprava, zpráva na pivo vybrané vsi, sloupce „Dáš“ / „Dostaneš“ (jediné popisky – jako
// „Prodat“ a „Koupit“ v 0 A.D.), dny na trhu, náhled a odeslání a výpravy na cestě; u vsi na stezce
// i zbroj od cizích kupců (`ArmsOrder`). Panel jen ukazuje a posílá záměr – důvody odmítnutí bere
// z náhledu jádra (`marketPreview`). Kolik lidí z vybraných rodin, mužů a žen odejde a kolik zbude
// nosičů, se doptá serveru (`useMarketPeople`).

type Side = 'give' | 'want';

/** Ikony řemesel ve zprávě (dílny ve stavebním katalogu). */
const CRAFT_ICONS: Record<Craft, { name: string; icon: string }> = {
  potter: { name: 'Hrnčíř', icon: 'hrncir' },
  smith: { name: 'Kovář', icon: 'kovar' },
  burner: { name: 'Uhlíř', icon: 'uhlir' },
  carpenter: { name: 'Tesař', icon: 'tesar' },
  panner: { name: 'Rýžovník', icon: 'ryzovnik' },
  jeweller: { name: 'Šperkař', icon: 'sperkar' },
  minter: { name: 'Mincíř', icon: 'mincovna' },
};

/** Fáze výpravy: popisek a ikona. */
const PHASES: Record<MarketTripPhase, { label: string; icon: string }> = {
  out: { label: 'Na cestě na trh', icon: 'walk' },
  market: { label: 'Na trhu', icon: 'balance' },
  back: { label: 'Na cestě domů', icon: 'walk' },
  waiting: { label: 'Čeká na zboží', icon: 'hourglass' },
};

/**
 * Krok výběru: po 100 kg, mince po deseti (meč stojí 120 – po jedné by to bylo 120 kliknutí), kusy
 * a m³ po jedné. Poslední krok nahoru doplní do zásoby (`Stepper` má `max`), dolů jde k nule.
 */
const stepOf = (good: TradeGood): number =>
  good === COIN_GOOD || good === 'gold' ? 10 : TRADE_GOOD_NAMES[good].unit === 'kg' ? 100 : 1;

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
  placement = 'above',
}: {
  icon: string;
  name: ReactNode;
  children: ReactNode;
  folder?: 'resources' | 'build';
  placement?: 'above' | 'below-right';
}): ReactElement {
  return (
    <Tooltip content={name} placement={placement}>
      <span className="flex items-center gap-1 whitespace-nowrap tabular-nums" tabIndex={0}>
        <img src={`/icons/${folder}/${icon}.png`} alt="" width={18} height={18} />
        {children}
      </span>
    </Tooltip>
  );
}

const dateText = (day: number): string => formatGameDate(dateOfDayIndex(day));

/**
 * Ceny trhu ve zprávě: ikona vah a řada zboží s cenou v mincích za jednotku – cena trhu × hladina
 * (markets.md – Rozhodnutí plánu 4, bod 3), spočítá ji jádro.
 */
function PricesLine({
  prices,
  level,
}: {
  prices: MarketPrices;
  level: number;
}): ReactElement | null {
  const items = TRADE_GOODS.filter((g) => (prices[g] ?? 0) > 0);
  if (items.length === 0) return null;
  return (
    <div data-testid="market-prices" className="flex flex-wrap items-center gap-2">
      <Tooltip content="Ceny na trhu" placement="below-right">
        <img src="/icons/resources/balance.png" alt="" width={18} height={18} />
      </Tooltip>
      {items.map((g) => (
        <span key={g} className="flex items-center gap-1 text-xs tabular-nums">
          <GoodIcon good={g} size={16} />
          {formatCoinPrice(coinPriceOf(prices, level, g))}
        </span>
      ))}
    </div>
  );
}

/** Den příštích kupců ve vsi zprávy (Rozhodnutí plánu 4, bod 8). */
function NextMerchants({ day }: { day: number }): ReactElement {
  const date = formatDayMonth(dateOfDayIndex(day));
  return (
    <div data-testid="market-report-merchants" className="flex items-center text-xs">
      <Figure icon="merchants" name={`Kupci přijedou ${date}`} placement="below-right">
        {date}
      </Figure>
    </div>
  );
}

/**
 * Zpráva na pivo o vsi (Pravidla 8): lidé a domy zaokrouhleně, řemesla, den příštích kupců (dokud
 * neminul), obchodníci a ceny; bez zprávy „?“.
 */
function Report({ village, today }: { village: MarketVillage; today: number }): ReactElement {
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
  const merchants = news?.report.merchants ?? null;
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
          {merchants !== null && merchants >= today && <NextMerchants day={merchants} />}
          {news?.report.traders.map((t, i) => (
            <div key={i} data-testid="market-trader" className="flex items-center gap-2 text-xs">
              {t.merchants && (
                <img src="/icons/resources/merchants.png" alt="" width={18} height={18} />
              )}
              <span className="font-semibold">
                {t.merchants ? 'Kupci' : t.name || 'Sousední ves'}
              </span>
              <span className="text-[#bfa77a]">{dateText(t.day)}</span>
              {t.smith ? (
                <Figure icon="kovar" folder="build" name="Kovář – přišel kovat koně">
                  {''}
                </Figure>
              ) : (
                t.goods.map((g) => <GoodIcon key={g} good={g} size={16} />)
              )}
            </div>
          ))}
          {news?.prices && <PricesLine prices={news.prices} level={news.level ?? 1} />}
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
    village.travelDays === 0
      ? 'Ráno tam, večer zpět'
      : `${village.travelDays} ${plural(village.travelDays, 'den', 'dny', 'dní')} cesty`;
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

/** Násobek šperkaře s desetinnou čárkou („1,5“). */
const JEWELLER_FACTOR = String(JEWELLER.factor).replace('.', ',');

/** Cena bez zbytečné desetinné nuly („1“, ne „1,0“). */
const priceText = (price: number): string =>
  Number.isInteger(price) ? formatInteger(price) : formatCoinPrice(price);

/** Dovětek popisku: kolik gramů kovu ještě platí výhoda šperkaře. */
const jewelleryLeft = (g: number): string => `ještě pro ${formatInteger(g)} g`;

/** Řádek zboží sloupce: ikona (název v popisku), číslo, +/−; zlato i s cenou, mince s výhodou šperkaře. */
function GoodRow({
  side,
  good,
  value,
  max,
  onChange,
  goldPrice,
  jewelleryG,
}: {
  side: Side;
  good: TradeGood;
  value: number;
  max: number;
  onChange: (value: number) => void;
  goldPrice?: number;
  jewelleryG?: number;
}): ReactElement {
  const { name, unit, icon } = TRADE_GOOD_NAMES[good];
  const jeweller = jewelleryG !== undefined && jewelleryG > 0;
  const tip =
    good === COIN_GOOD
      ? jeweller
        ? `Se šperkařem platí ${JEWELLER_FACTOR}násobek – ${jewelleryLeft(jewelleryG)}`
        : name
      : `${name} (${unit})`;
  return (
    <div data-testid={`market-${side}-${good}`} className="flex items-center gap-1.5">
      <Tooltip content={tip} placement="above">
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
      {good === 'gold' && goldPrice !== undefined && (
        <span data-testid="market-gold-price">
          <Tooltip
            content={
              <span className="block max-w-52">
                {`Zlato – ${priceText(goldPrice)} ${plural(goldPrice, 'mince', 'mince', 'mincí')} za gram, vždy` +
                  (jeweller
                    ? `, se šperkařem ${priceText(goldPrice * JEWELLER.factor)} mince za gram – ${jewelleryLeft(jewelleryG)}`
                    : '')}
              </span>
            }
            placement="above"
          >
            <span className="flex items-center gap-1 text-xs tabular-nums" tabIndex={0}>
              {priceText(goldPrice)}
              <img src="/icons/resources/coin.png" alt="" width={14} height={14} />
            </span>
          </Tooltip>
        </span>
      )}
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
 * na cestě z pohledu dvorce, `onSend` pošle výpravu a vrátí důvod odmítnutí serveru (nebo null),
 * `onPeople` se zeptá serveru na lidi na prodej pro vybrané počty (`marketTripPeople`), `onOrderArms`
 * objedná zbroj u cizích kupců (počet kusů, 0 = nic) a vrátí důvod odmítnutí, `onOfferSlaves` nabídne
 * otroky na trhu vsi (počet, 0 = nic; vrátí důvod odmítnutí).
 */
export function MarketPanel({
  villages,
  error,
  market,
  onSend,
  onPeople,
  onOrderArms,
  onOfferSlaves,
  onClose,
}: {
  villages: MarketVillage[] | null;
  /** Proč se přehled nenačetl. */
  error: string | null;
  market: VillageManor['market'];
  onSend: (targetVillageId: string, order: MarketOrder) => Promise<string | null>;
  onPeople: (people: TradePeople) => Promise<MarketPeopleAnswer>;
  onOrderArms: (good: ArmsGood, amount: number) => Promise<string | null>;
  onOfferSlaves: (count: number) => Promise<string | null>;
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
  // lidé ve výběru: náhled až s odpovědí serveru pro tytéž počty (náhled = server)
  const people = useMarketPeople(give, market, onPeople);
  const peopleReady = people.status === 'none' || people.status === 'ready';
  const preview =
    target && peopleReady
      ? marketPreview(order, market, target.cells, people.status === 'ready' ? people.people : null)
      : null;
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
  const sendReason = !target
    ? 'Vyber ves.'
    : people.status === 'error'
      ? people.error
      : (preview?.reason ?? null);
  const sendDisabled =
    denied !== null || busy || people.status === 'pending' || sendReason !== null;

  return (
    <Dialog
      title="Trh"
      icon={<img src="/icons/build/obchod.png" alt="" width={24} height={24} className="h-6 w-6" />}
      onClose={onClose}
      widthClass="w-[40rem]"
      testId="market-panel"
    >
      <div className="flex flex-col gap-2 text-[#ecdfc4]">
        <ArmsOrder market={market} onOrder={onOrderArms} />
        <SlaveSale slaveSale={market.slaveSale} onOffer={onOfferSlaves} />
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
        {target && <Report village={target} today={market.day} />}
        <div className="flex gap-2">
          <Column side="give">
            {stocked.map((g) => (
              <GoodRow
                key={g}
                side="give"
                good={g}
                value={give[g] ?? 0}
                max={market.stock[g] ?? 0}
                goldPrice={market.goldPrice}
                jewelleryG={market.jewelleryG}
                onChange={(v) => edit(() => setGive((cur) => without(cur, g, v)))}
              />
            ))}
          </Column>
          <Column side="want">
            {/* mince se na seznam nedávají (markets.md – Rozhodnutí plánu 4, bod 1) */}
            {TRADE_GOODS.filter((g) => g !== COIN_GOOD).map((g) => (
              <GoodRow
                key={g}
                side="want"
                good={g}
                value={wants[g] ?? 0}
                max={Number.MAX_SAFE_INTEGER}
                goldPrice={market.goldPrice}
                jewelleryG={market.jewelleryG}
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
                min={MARKET.minStayDays}
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
                <span className="font-semibold">{trip.villageName || 'Sousední ves'}</span>
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
