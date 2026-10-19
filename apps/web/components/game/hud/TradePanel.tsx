import { useState, type ReactElement } from 'react';
import type { Direction8, TradeGood, TradeGoods, TradePeople } from '@bohemia/game';
import type { VillageNeighbour } from '@/lib/manor-view';
import {
  DIRECTION_NAMES,
  PEOPLE_NAMES,
  TRADE_GOOD_NAMES,
  tradeAmountText,
  type PeopleKind,
} from '@/lib/trade-names';
import { tradePreview, type PreviewPeople } from '@/lib/trade-quote';
import { formatInteger } from '@/lib/village-format';
import { Tooltip } from './Tooltip';

// Panel obchodu ve dvorci (trade.md – Obchod, Rozhraní): soused (jméno, směr) a bilance hodnoty
// pro souseda (váhy – musí být ≥ 0), pod nimi dva sloupce s viditelnými hlavičkami „Dáš“ (ze vsi
// ven – soused shání) a „Dostaneš“ (do vsi – soused nabízí) jako „Prodat“ a „Koupit“ v 0 A.D.
// (Martin 19. 10. 2026 – jediné popisky v panelu), posuvníky, dole nosiči, dny cesty, práce
// a potvrzení – výprava vyrazí; na cestě jen průběh. Popisek řádku řekne, kolik soused ještě vezme
// nebo má. Lidé (trade.md – Výměna lidí): řádek rodiny a svobodného dospělého na straně, kde je
// soused shání nebo nabízí; koho ves dá, vybere jádro.

/** Ikona zboží s množstvím (kg nebo kusy) a názvem v popisku. */
function Good({ good, amount }: { good: TradeGood; amount: number }): ReactElement {
  const { name, unit, icon } = TRADE_GOOD_NAMES[good];
  return (
    <Tooltip content={name} placement="above">
      <span className="flex items-center gap-1 whitespace-nowrap tabular-nums" tabIndex={0}>
        <img src={`/icons/resources/${icon}.png`} alt="" width={20} height={20} />
        {formatInteger(amount)}
        {unit === 'kg' ? ' kg' : ''}
      </span>
    </Tooltip>
  );
}

/** Ikona lidí (rodina, svobodný dospělý) s počtem a názvem v popisku. */
function People({ kind, count }: { kind: PeopleKind; count: number }): ReactElement {
  const { name, icon } = PEOPLE_NAMES[kind];
  return (
    <Tooltip content={name} placement="above">
      <span className="flex items-center gap-1 whitespace-nowrap tabular-nums" tabIndex={0}>
        <img src={`/icons/resources/${icon}.png`} alt="" width={20} height={20} />
        {formatInteger(count)}
      </span>
    </Tooltip>
  );
}

/** Lidé výpravy na cestě – rodiny a dospělí, jen nenuloví. */
function peopleIcons(people: TradePeople, key: string): ReactElement[] {
  return (['families', 'adults'] as const)
    .filter((k) => people[k] > 0)
    .map((k) => (
      <People key={`${key}-${k}`} kind={k === 'families' ? 'family' : 'adult'} count={people[k]} />
    ));
}

/** Strana výměny: co ves dá (soused shání) a co dostane (soused nabízí). */
type Side = 'give' | 'get';

/**
 * Řádek výměny – zboží nebo lidé (rodiny, svobodní dospělí): ikona, posuvník 0–max a výběr/max.
 * Popisek celého řádku: název, kolik soused ještě vezme („Soused shání – vezme ještě 1 500 kg“)
 * nebo má („Soused nabízí – má ještě 4 kusy“) a cena v kg obilí.
 */
function TradeRow({
  side,
  id,
  name,
  icon,
  left,
  price,
  value,
  max,
  onChange,
}: {
  side: Side;
  /** Druh zboží nebo lidí – `data-testid` řádku je `trade-<side>-<id>`. */
  id: string;
  name: string;
  icon: string;
  /** Kolik soused ještě letos vezme / má, s jednotkou. */
  left: string;
  /** Cena v kg obilí s jednotkou („1 / kg“, „1 037 / rodina“). */
  price: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <Tooltip
      block
      placement="above"
      content={
        <span className="flex flex-col gap-0.5" data-testid={`trade-${side}-${id}-tooltip`}>
          <span className="font-semibold">{name}</span>
          <span>
            {side === 'give' ? 'Soused shání – vezme ještě ' : 'Soused nabízí – má ještě '}
            {left}
          </span>
          <span className="flex items-center gap-1 tabular-nums">
            <img src="/icons/resources/food.png" alt="" width={16} height={16} />
            {price}
          </span>
        </span>
      }
    >
      <label className="flex items-center gap-1.5" data-testid={`trade-${side}-${id}`}>
        <img
          src={`/icons/resources/${icon}.png`}
          alt=""
          width={24}
          height={24}
          className="shrink-0"
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={Math.min(value, max)}
          disabled={max <= 0}
          aria-label={name}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 accent-[#d8b25c] disabled:opacity-40"
        />
        <span className="min-w-16 text-right text-xs whitespace-nowrap tabular-nums">
          {formatInteger(Math.min(value, max))}/{formatInteger(max)}
        </span>
      </label>
    </Tooltip>
  );
}

/** Cena v kg obilí za jednotku na nejvýš `digits` desetinných míst („2,88 / kg“). */
function priceText(price: number, unit: string, digits = 2): string {
  const [whole = '0', fraction = ''] = price.toFixed(digits).split('.');
  const decimals = fraction.replace(/0+$/, '');
  return `${formatInteger(Number(whole))}${decimals ? `,${decimals}` : ''} / ${unit}`;
}

/** Řádek zboží (`TradeRow`). */
function GoodRow({
  side,
  good,
  left,
  price,
  value,
  max,
  onChange,
}: {
  side: Side;
  good: TradeGood;
  left: number;
  price: number;
  value: number;
  max: number;
  onChange: (value: number) => void;
}): ReactElement {
  const { name, unit, icon } = TRADE_GOOD_NAMES[good];
  return (
    <TradeRow
      side={side}
      id={good}
      name={name}
      icon={icon}
      left={tradeAmountText(left, unit)}
      price={priceText(price, unit)}
      value={value}
      max={max}
      onChange={onChange}
    />
  );
}

/** Řádek lidí (`TradeRow`) – u rodin cena první rodiny v řadě (rodiny se liší počtem dětí). */
function PeopleRow({
  side,
  kind,
  left,
  price,
  value,
  max,
  onChange,
}: {
  side: Side;
  kind: PeopleKind;
  left: number;
  price: number;
  value: number;
  max: number;
  onChange: (value: number) => void;
}): ReactElement {
  const { name, icon } = PEOPLE_NAMES[kind];
  return (
    <TradeRow
      side={side}
      id={kind}
      name={name}
      icon={icon}
      left={tradeAmountText(left, kind)}
      price={priceText(price, kind === 'family' ? 'rodina' : 'dospělý', 0)}
      value={value}
      max={max}
      onChange={onChange}
    />
  );
}

/**
 * Hlavička sloupce (Martin 19. 10. 2026 – „absolutně netuším, co je nabídka a co poptávka“):
 * „Dáš“ se šipkou ze vsi ven, „Dostaneš“ se šipkou do vsi – ves je portrét dvorce.
 */
function ColumnHeading({ side }: { side: Side }): ReactElement {
  const village = (
    <img
      src="/icons/build/dvorec.png"
      alt=""
      width={20}
      height={20}
      className="h-5 w-5 rounded-sm"
    />
  );
  return (
    <h3
      data-testid={`trade-${side}-heading`}
      className="flex items-center gap-1 px-0.5 pb-0.5 text-sm font-semibold whitespace-nowrap text-[#e8cf94]"
    >
      {side === 'give' ? (
        <>
          {village}
          <span aria-hidden>→</span>
          Dáš
        </>
      ) : (
        <>
          Dostaneš
          <span aria-hidden>→</span>
          {village}
        </>
      )}
    </h3>
  );
}

/** Obchod s jedním sousedem – výběr zboží, náhled a potvrzení. */
export function NeighbourTrade({
  neighbour,
  busy = false,
  onSend,
  initial,
}: {
  neighbour: VillageNeighbour;
  busy?: boolean;
  onSend?: (give: TradeGoods, get: TradeGoods, people: PreviewPeople) => void;
  /** Počáteční výběr (testy). */
  initial?: { give: TradeGoods; get: TradeGoods; people?: PreviewPeople };
}): ReactElement {
  const [give, setGive] = useState<TradeGoods>(initial?.give ?? {});
  const [get, setGet] = useState<TradeGoods>(initial?.get ?? {});
  const [people, setPeople] = useState<PreviewPeople>(
    initial?.people ?? { give: { families: 0, adults: 0 }, get: { families: 0, adults: 0 } },
  );
  const setSide = (side: 'give' | 'get', key: keyof TradePeople, value: number): void =>
    setPeople({ ...people, [side]: { ...people[side], [key]: value } });
  if (neighbour.expedition) {
    const e = neighbour.expedition;
    const percent = Math.round(e.progress * 100);
    return (
      <div data-testid="trade-expedition" className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.entries(e.give) as [TradeGood, number][]).map(([g, n]) => (
            <Good key={`g-${g}`} good={g} amount={n} />
          ))}
          {peopleIcons(e.givePeople, 'g')}
          <span aria-hidden>⇄</span>
          {(Object.entries(e.get) as [TradeGood, number][]).map(([g, n]) => (
            <Good key={`r-${g}`} good={g} amount={n} />
          ))}
          {peopleIcons(e.getPeople, 'r')}
        </div>
        <Tooltip content={`Výprava ${percent} %`} placement="above">
          <span
            role="progressbar"
            aria-label="Výprava"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="hud-bar block h-2.5 w-56"
            tabIndex={0}
          >
            <span style={{ width: `${percent}%` }} />
          </span>
        </Tooltip>
      </div>
    );
  }
  const preview = tradePreview(neighbour, give, get, people);
  const fair = preview.balance >= 0;
  const { offers, takes, have } = neighbour.people;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 whitespace-nowrap">
        <span data-testid="trade-neighbour" className="font-semibold">
          {neighbour.name}{' '}
          <span className="font-normal text-[#bfa77a]">
            ({DIRECTION_NAMES[neighbour.direction].name})
          </span>
        </span>
        <Tooltip content="Bilance pro souseda (kg obilí) – musí být aspoň 0" placement="above-left">
          <span
            data-testid="trade-balance"
            data-fair={fair}
            tabIndex={0}
            className={`flex items-center gap-1 font-semibold tabular-nums ${fair ? 'text-[#a8d46f]' : 'text-red-400'}`}
          >
            <img src="/icons/resources/balance.png" alt="" width={22} height={22} />
            {preview.balance > 0 ? '+' : ''}
            {formatInteger(preview.balance)}
          </span>
        </Tooltip>
      </div>
      <div className="flex gap-2">
        <div
          className="hud-inset flex flex-col gap-1 rounded p-1.5"
          aria-label="Dáš"
          role="group"
          data-testid="trade-give"
        >
          <ColumnHeading side="give" />
          {neighbour.demands.map((row) => (
            <GoodRow
              key={row.good}
              side="give"
              good={row.good}
              left={row.left}
              price={row.price}
              value={give[row.good] ?? 0}
              max={Math.min(row.left, row.have)}
              onChange={(v) => setGive({ ...give, [row.good]: v })}
            />
          ))}
          {takes.families > 0 && (
            <PeopleRow
              side="give"
              kind="family"
              left={takes.families}
              price={have.families[0]?.credit ?? 0}
              value={people.give.families}
              max={Math.min(takes.families, have.families.length)}
              onChange={(v) => setSide('give', 'families', v)}
            />
          )}
          {takes.adults > 0 && (
            <PeopleRow
              side="give"
              kind="adult"
              left={takes.adults}
              price={have.adultCredit}
              value={people.give.adults}
              max={Math.min(takes.adults, have.adults)}
              onChange={(v) => setSide('give', 'adults', v)}
            />
          )}
        </div>
        <div
          className="hud-inset flex flex-col gap-1 rounded p-1.5"
          aria-label="Dostaneš"
          role="group"
          data-testid="trade-get"
        >
          <ColumnHeading side="get" />
          {neighbour.offers.map((row) => (
            <GoodRow
              key={row.good}
              side="get"
              good={row.good}
              left={row.left}
              price={row.price}
              value={get[row.good] ?? 0}
              max={row.left}
              onChange={(v) => setGet({ ...get, [row.good]: v })}
            />
          ))}
          {offers.families.length > 0 && (
            <PeopleRow
              side="get"
              kind="family"
              left={offers.families.length}
              price={offers.families[0]?.price ?? 0}
              value={people.get.families}
              max={offers.families.length}
              onChange={(v) => setSide('get', 'families', v)}
            />
          )}
          {offers.adults > 0 && (
            <PeopleRow
              side="get"
              kind="adult"
              left={offers.adults}
              price={offers.adultPrice}
              value={people.get.adults}
              max={offers.adults}
              onChange={(v) => setSide('get', 'adults', v)}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm whitespace-nowrap tabular-nums">
        <Tooltip content="Nosiči" placement="above">
          <span data-testid="trade-porters" className="flex items-center gap-1" tabIndex={0}>
            <img src="/icons/resources/people.png" alt="" width={18} height={18} />
            {preview.porters}
          </span>
        </Tooltip>
        {preview.carts > 0 && (
          <Tooltip content="Vozy – náklad místo nosičů" placement="above">
            <span data-testid="trade-carts" className="flex items-center gap-1" tabIndex={0}>
              <img src="/icons/resources/cart.png" alt="" width={18} height={18} />
              {preview.carts}
            </span>
          </Tooltip>
        )}
        <Tooltip content="Dny cesty tam a zpět" placement="above">
          <span data-testid="trade-days" className="flex items-center gap-1" tabIndex={0}>
            <img src="/icons/resources/date.png" alt="" width={18} height={18} />
            {preview.days}
          </span>
        </Tooltip>
        <Tooltip content="Práce (člověkodny)" placement="above">
          <span data-testid="trade-labor" className="flex items-center gap-1" tabIndex={0}>
            <img src="/icons/resources/labor.png" alt="" width={18} height={18} />
            {preview.manDays}
          </span>
        </Tooltip>
        <span className="ml-auto">
          <Tooltip
            placement="above-left"
            content={
              <span className="flex flex-col gap-0.5">
                <span>Vyslat výpravu</span>
                {preview.blocked && (
                  <span data-testid="trade-blocked" className="font-semibold text-red-400">
                    {preview.blocked}
                  </span>
                )}
              </span>
            }
          >
            <button
              type="button"
              data-testid="trade-send"
              aria-label="Vyslat výpravu"
              disabled={preview.blocked !== null || busy || !onSend}
              aria-busy={busy}
              onClick={() => onSend?.(give, get, people)}
              className="hud-inset h-9 w-9 overflow-hidden rounded disabled:cursor-not-allowed disabled:opacity-45 disabled:grayscale"
            >
              <img
                src="/icons/build/obchod.png"
                alt=""
                width={36}
                height={36}
                className="h-full w-full"
              />
            </button>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}

/**
 * Panel obchodu: sousedé po hotových stezkách (šipka směru a jméno vsi), pod nimi obchod
 * s vybraným. `onSend` – výprava vyrazí (server action), panel se pak zavře.
 */
export function TradePanel({
  neighbours,
  onSend,
  onClose,
  initialDirection,
}: {
  neighbours: readonly VillageNeighbour[];
  onSend?: (
    direction: Direction8,
    give: TradeGoods,
    get: TradeGoods,
    people: PreviewPeople,
  ) => Promise<void>;
  onClose?: () => void;
  initialDirection?: Direction8;
}): ReactElement {
  const [selected, setSelected] = useState<Direction8 | null>(
    initialDirection ?? neighbours[0]?.direction ?? null,
  );
  const [busy, setBusy] = useState(false);
  const neighbour = neighbours.find((n) => n.direction === selected) ?? neighbours[0] ?? null;
  const send = (give: TradeGoods, get: TradeGoods, people: PreviewPeople): void => {
    if (!onSend || !neighbour || busy) return;
    setBusy(true);
    void onSend(neighbour.direction, give, get, people).finally(() => {
      setBusy(false);
      onClose?.();
    });
  };
  return (
    <div data-testid="trade-panel" className="flex min-w-[26rem] flex-col gap-2">
      {neighbours.length > 1 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Sousedé">
          {neighbours.map((n) => (
            <button
              key={n.direction}
              type="button"
              role="tab"
              aria-selected={n.direction === neighbour?.direction}
              data-testid={`neighbour-${n.direction}`}
              onClick={() => setSelected(n.direction)}
              className={`hud-button px-2 py-0.5 text-sm whitespace-nowrap ${n.direction === neighbour?.direction ? 'ring-1 ring-[#c9a14a]' : ''}`}
            >
              <span aria-hidden className="mr-1">
                {DIRECTION_NAMES[n.direction].arrow}
              </span>
              {n.name}
            </button>
          ))}
        </div>
      )}
      {neighbour && (
        <NeighbourTrade
          key={neighbour.direction}
          neighbour={neighbour}
          busy={busy}
          {...(onSend ? { onSend: send } : {})}
        />
      )}
    </div>
  );
}
