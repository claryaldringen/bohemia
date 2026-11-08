import { useState, type ReactElement, type ReactNode } from 'react';
import type { Direction8, TradeGood, TradeGoods, TradePeople } from '@bohemia/game';
import type { VillageExpedition, VillageNeighbour } from '@/lib/manor-view';
import {
  DIRECTION_NAMES,
  PEOPLE_KEYS,
  PEOPLE_NAMES,
  TRADE_GOOD_NAMES,
  tradeAmountText,
  type PeopleKind,
} from '@/lib/trade-names';
import {
  EMPTY_SELECTION,
  clampSelection,
  tradeLimits,
  tradePreview,
  type PreviewPeople,
  type TradeSelection,
} from '@/lib/trade-quote';
import { dearthLabel } from '@/lib/disasters-view';
import { formatInteger } from '@/lib/village-format';
import { useRightDenied } from './rights';
import { Tooltip } from './Tooltip';

// Panel obchodu ve dvorci (trade.md – Obchod, Rozhraní): soused (jméno, směr) a bilance hodnoty
// pro souseda (váhy – musí být ≥ 0), pod nimi dva sloupce s viditelnými hlavičkami „Dáš“ (ze vsi
// ven – soused shání) a „Dostaneš“ (do vsi – soused nabízí) jako „Prodat“ a „Koupit“ v 0 A.D.
// (Martin 19. 10. 2026 – jediné popisky v panelu), posuvníky, dole nosiči, dny cesty, práce
// a potvrzení – výprava vyrazí. Popisek řádku řekne, kolik soused ještě vezme nebo má. Lidé
// (trade.md – Výměna lidí): řádky rodiny, svobodného muže a svobodné ženy (Martin 19. 10. 2026 –
// zvlášť) na straně, kde je soused shání nebo nabízí; koho ves dá, vybere jádro.
// Martin 19. 10. 2026: „Vyslal jsem obchodní výpravu, ale dál nějak nevím, co se bude dít.“ –
// posuvníky se s novým pohledem ořežou na dnešní meze souseda (`clampSelection`), tlačítko je
// zašedlé s důvodem jádra ještě před odesláním (`tradePreview`), chyba serveru zůstane v panelu
// červeně, dokud hráč něco nezmění, a po odeslání panel ukáže výpravu na cestě – kam, co nese,
// koho vede, průběh a za kolik dní se vrátí. Lidé na výpravě mají vlastní podíl práce (Martin
// 19. 10. 2026) – zdrží se jen ves, která nemá dost dospělých po denním minimu. Dobytek ve třech
// druzích (trade.md – Dobytek ve třech druzích; Martin 20. 10. 2026): řádky krav, mladých volů
// (menší ikona vola – musí se vycvičit) a vycvičených volů; popisek řekne, kolik se jich vejde do
// ohrady.

/** Ikona zboží s množstvím (kg, kusy nebo m³) a názvem v popisku. */
function Good({ good, amount }: { good: TradeGood; amount: number }): ReactElement {
  const { name, unit, icon } = TRADE_GOOD_NAMES[good];
  return (
    <Tooltip content={name} placement="above">
      <span className="flex items-center gap-1 whitespace-nowrap tabular-nums" tabIndex={0}>
        <img src={`/icons/resources/${icon}.png`} alt="" width={20} height={20} />
        {formatInteger(amount)}
        {unit === 'ks' ? '' : ` ${unit}`}
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

/** Druhy lidí v pořadí řádků panelu. */
const PEOPLE_KINDS: readonly PeopleKind[] = ['family', 'man', 'woman'];

/** Lidé výpravy na cestě – rodiny, muži a ženy, jen nenuloví. */
function peopleIcons(people: TradePeople, key: string): ReactElement[] {
  return PEOPLE_KINDS.filter((k) => people[PEOPLE_KEYS[k]] > 0).map((k) => (
    <People key={`${key}-${k}`} kind={k} count={people[PEOPLE_KEYS[k]]} />
  ));
}

/** Strana výměny: co ves dá (soused shání) a co dostane (soused nabízí). */
type Side = 'give' | 'get';

/**
 * Řádek výměny – zboží nebo lidé (rodiny, muži, ženy): ikona, posuvník 0–max a výběr/max.
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
  note,
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
  /** Řádek popisku navíc (u dobytka – kolik se vejde do ohrady). */
  note?: string;
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
          {note && <span data-testid={`trade-${side}-${id}-note`}>{note}</span>}
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
          className="h-6 w-6 shrink-0"
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

/**
 * Kolik koupeného dobytka se vejde do ohrady (popisek řádku – trade.md, Dobytek ve třech
 * druzích); jiné zboží null.
 */
function roomNote(neighbour: VillageNeighbour, good: TradeGood): string | null {
  if (good === 'cows') {
    return `Do ohrady skotu se vejde ještě ${tradeAmountText(neighbour.room.cows, 'ks')}`;
  }
  if (good === 'youngOxen' || good === 'trainedOxen') {
    return `Do ohrady volů se vejde ještě ${tradeAmountText(neighbour.room.oxen, 'ks')} (mladí i vycvičení)`;
  }
  if (good === 'foals' || good === 'mares' || good === 'ridingHorses') {
    return `Do ohrady koní se vejde ještě ${tradeAmountText(neighbour.room.horses, 'ks')} (hříbata do roku místo nezabírají)`;
  }
  return null;
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
  note,
}: {
  side: Side;
  good: TradeGood;
  left: number;
  price: number;
  value: number;
  max: number;
  onChange: (value: number) => void;
  note?: string | null;
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
      {...(note ? { note } : {})}
    />
  );
}

/** Jednotka ceny lidí („1 037 / rodina“). */
const PEOPLE_UNITS: Record<PeopleKind, string> = { family: 'rodina', man: 'muž', woman: 'žena' };

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
      price={priceText(price, PEOPLE_UNITS[kind], 0)}
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

/** Soused nahoře v panelu – jméno vsi a směr. */
function NeighbourName({ neighbour }: { neighbour: VillageNeighbour }): ReactElement {
  return (
    <span className="flex items-center gap-1.5">
      <span data-testid="trade-neighbour" className="font-semibold">
        {neighbour.name}{' '}
        <span className="font-normal text-[#bfa77a]">
          ({DIRECTION_NAMES[neighbour.direction].name})
        </span>
      </span>
      {/* kraj po zlém roce – obilí zdražilo (disasters.md – Co hráč vidí) */}
      {neighbour.dearth && (
        <Tooltip content={dearthLabel(neighbour.dearth)} placement="above">
          <span data-testid="trade-dearth" data-dearth={neighbour.dearth} tabIndex={0}>
            <img src="/icons/resources/dearth.png" alt="" width={20} height={20} />
          </span>
        </Tooltip>
      )}
    </span>
  );
}

/** Sloupec v rámečku s hlavičkou „Dáš“ / „Dostaneš“. */
function Column({ side, children }: { side: Side; children: ReactNode }): ReactElement {
  return (
    <div
      className="hud-inset flex flex-col gap-1 rounded p-1.5"
      aria-label={side === 'give' ? 'Dáš' : 'Dostaneš'}
      role="group"
      data-testid={`trade-${side}`}
    >
      <ColumnHeading side={side} />
      {children}
    </div>
  );
}

/** Ikona s číslem a popiskem (nosiči, dny, práce). */
function Figure({
  testId,
  icon,
  name,
  children,
}: {
  testId: string;
  icon: string;
  name: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <Tooltip content={name} placement="above">
      <span data-testid={testId} className="flex items-center gap-1" tabIndex={0}>
        <img src={`/icons/resources/${icon}.png`} alt="" width={18} height={18} />
        {children}
      </span>
    </Tooltip>
  );
}

/**
 * Popisek tempa výpravy (trade.md – Doprava: lidé na výpravě mají vlastní podíl práce po denním
 * minimu – zdržet se může jen ves, která nemá dost dospělých).
 */
function paceText(e: VillageExpedition): string {
  switch (e.pace) {
    case 'waiting':
      return 'Výprava stojí – po denním minimu domácností dnes ve vsi nezbyl nikdo, kdo by šel.';
    case 'slow':
      return `Málo dospělých – dnes šlo ${formatInteger(e.today ?? 0)} z ${formatInteger(e.porters)} lidí výpravy, výprava se zdrží.`;
    case 'starting':
      return 'Výprava vyrazí zítra.';
    case 'full':
      return 'Výprava jde plným tempem.';
  }
}

/**
 * Výprava na cestě (trade.md – Obchod): kam (soused a směr), co nese a koho vede tam (Dáš), co
 * přinese a kdo přijde (Dostaneš), průběh, nosiči a vozy, za kolik dní se vrátí a tempo – jen
 * výjimečně (málo dospělých) se zdrží (přesýpací hodiny).
 */
function ExpeditionView({
  neighbour,
  expedition: e,
}: {
  neighbour: VillageNeighbour;
  expedition: VillageExpedition;
}): ReactElement {
  const percent = Math.round(e.progress * 100);
  const goods = (goods: TradeGoods, key: string): ReactElement[] =>
    (Object.entries(goods) as [TradeGood, number][])
      .filter(([, n]) => n > 0)
      .map(([g, n]) => <Good key={`${key}-${g}`} good={g} amount={n} />);
  const content = (items: ReactElement[]): ReactNode =>
    items.length > 0 ? items : <span className="px-0.5 text-sm text-[#8f7c5a]">–</span>;
  const away = e.pace === 'waiting' || e.pace === 'slow';
  return (
    <div data-testid="trade-expedition" data-pace={e.pace} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 whitespace-nowrap">
        <NeighbourName neighbour={neighbour} />
        <Tooltip
          placement="above-left"
          content={
            e.daysLeft === null
              ? 'Vrátí se, až bude ve vsi volná práce'
              : `Vrátí se asi za ${formatInteger(e.daysLeft)} ${e.daysLeft === 1 ? 'den' : e.daysLeft >= 2 && e.daysLeft <= 4 ? 'dny' : 'dní'}`
          }
        >
          <span
            data-testid="trade-days-left"
            className="flex items-center gap-1 font-semibold tabular-nums"
            tabIndex={0}
          >
            <img src="/icons/resources/date.png" alt="" width={20} height={20} />
            {e.daysLeft === null ? '?' : `≈ ${formatInteger(e.daysLeft)}`}
          </span>
        </Tooltip>
      </div>
      <div className="flex gap-2">
        <Column side="give">
          <div className="flex flex-wrap items-center gap-2 px-0.5">
            {content([...goods(e.give, 'g'), ...peopleIcons(e.givePeople, 'g')])}
          </div>
        </Column>
        <Column side="get">
          <div className="flex flex-wrap items-center gap-2 px-0.5">
            {content([...goods(e.get, 'r'), ...peopleIcons(e.getPeople, 'r')])}
          </div>
        </Column>
      </div>
      <div className="flex items-center gap-3 text-sm whitespace-nowrap tabular-nums">
        <Tooltip content={`Výprava ${percent} %`} placement="above">
          <span
            role="progressbar"
            aria-label="Výprava"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="hud-bar block h-2.5 w-40"
            tabIndex={0}
          >
            <span style={{ width: `${percent}%` }} />
          </span>
        </Tooltip>
        <Figure testId="trade-porters" icon="people" name="Nosiči">
          {e.porters}
        </Figure>
        {e.carts > 0 && (
          <Figure testId="trade-carts" icon="cart" name="Vozy">
            {e.carts}
          </Figure>
        )}
        {e.pace !== 'full' && (
          <Tooltip content={paceText(e)} placement="above-left">
            <span
              data-testid="trade-pace"
              data-pace={e.pace}
              tabIndex={0}
              className={`ml-auto flex items-center gap-1 ${away ? 'text-[#f0a94a]' : 'text-[#bfa77a]'}`}
            >
              <img
                src="/icons/resources/hourglass.png"
                alt=""
                width={20}
                height={20}
                className={e.pace === 'waiting' ? '' : 'opacity-70'}
              />
              {e.pace === 'slow' && `${formatInteger(e.today ?? 0)}/${formatInteger(e.porters)}`}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/**
 * Obchod s jedním sousedem – výběr zboží a lidí, náhled a potvrzení; s výpravou na cestě jen
 * výprava (`ExpeditionView`). Výběr se při novém pohledu (nový herní den, nový rok obchodu) ořízne
 * na dnešní meze souseda – odeslat jde jen to, co panel ukazuje. `error` – proč server výpravu
 * odmítl (červeně pod tlačítkem, dokud hráč výběr nezmění – `onEdit`).
 */
export function NeighbourTrade({
  neighbour,
  busy = false,
  error = null,
  onSend,
  onEdit,
  initial,
}: {
  neighbour: VillageNeighbour;
  busy?: boolean;
  error?: string | null;
  onSend?: (give: TradeGoods, get: TradeGoods, people: PreviewPeople) => void;
  onEdit?: () => void;
  /** Počáteční výběr (testy). */
  initial?: { give: TradeGoods; get: TradeGoods; people?: PreviewPeople };
}): ReactElement {
  const sendDenied = useRightDenied('trade');
  const [selection, setSelection] = useState<TradeSelection>(() =>
    initial
      ? clampSelection(neighbour, {
          give: initial.give,
          get: initial.get,
          people: initial.people ?? EMPTY_SELECTION.people,
        })
      : EMPTY_SELECTION,
  );
  // nový pohled na ves (dotaz po herním dni, nový rok obchodu) – výběr se ořízne na dnešní meze
  const [basis, setBasis] = useState(neighbour);
  if (basis !== neighbour) {
    setBasis(neighbour);
    const clamped = clampSelection(neighbour, selection);
    if (clamped !== selection) setSelection(clamped);
  }
  if (neighbour.expedition) {
    return <ExpeditionView neighbour={neighbour} expedition={neighbour.expedition} />;
  }
  const { give, get, people } = selection;
  const edit = (next: TradeSelection): void => {
    setSelection(next);
    onEdit?.();
  };
  const setGood = (side: Side, good: TradeGood, value: number): void =>
    edit({ ...selection, [side]: { ...selection[side], [good]: value } });
  const setPeople = (side: Side, kind: PeopleKind, value: number): void =>
    edit({
      ...selection,
      people: { ...people, [side]: { ...people[side], [PEOPLE_KEYS[kind]]: value } },
    });
  const limits = tradeLimits(neighbour);
  const preview = tradePreview(neighbour, give, get, people);
  const fair = preview.balance >= 0;
  const { offers, takes } = neighbour.people;
  const offered: Record<PeopleKind, number> = {
    family: offers.families.length,
    man: offers.men,
    woman: offers.women,
  };
  const wanted: Record<PeopleKind, number> = {
    family: takes.families,
    man: takes.men,
    woman: takes.women,
  };
  const credit: Record<PeopleKind, number> = {
    family: neighbour.people.have.families[0]?.credit ?? 0,
    man: neighbour.people.have.adultCredit,
    woman: neighbour.people.have.adultCredit,
  };
  const price: Record<PeopleKind, number> = {
    family: offers.families[0]?.price ?? 0,
    man: offers.adultPrice,
    woman: offers.adultPrice,
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 whitespace-nowrap">
        <NeighbourName neighbour={neighbour} />
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
        <Column side="give">
          {neighbour.demands.map((row) => (
            <GoodRow
              key={row.good}
              side="give"
              good={row.good}
              left={row.left}
              price={row.price}
              value={give[row.good] ?? 0}
              max={limits.give[row.good] ?? 0}
              onChange={(v) => setGood('give', row.good, v)}
            />
          ))}
          {PEOPLE_KINDS.filter((k) => wanted[k] > 0).map((kind) => (
            <PeopleRow
              key={kind}
              side="give"
              kind={kind}
              left={wanted[kind]}
              price={credit[kind]}
              value={people.give[PEOPLE_KEYS[kind]]}
              max={limits.people.give[PEOPLE_KEYS[kind]]}
              onChange={(v) => setPeople('give', kind, v)}
            />
          ))}
        </Column>
        <Column side="get">
          {neighbour.offers.map((row) => (
            <GoodRow
              key={row.good}
              side="get"
              good={row.good}
              left={row.left}
              price={row.price}
              value={get[row.good] ?? 0}
              max={limits.get[row.good] ?? 0}
              onChange={(v) => setGood('get', row.good, v)}
              note={roomNote(neighbour, row.good)}
            />
          ))}
          {PEOPLE_KINDS.filter((k) => offered[k] > 0).map((kind) => (
            <PeopleRow
              key={kind}
              side="get"
              kind={kind}
              left={offered[kind]}
              price={price[kind]}
              value={people.get[PEOPLE_KEYS[kind]]}
              max={limits.people.get[PEOPLE_KEYS[kind]]}
              onChange={(v) => setPeople('get', kind, v)}
            />
          ))}
        </Column>
      </div>
      <div className="flex items-center gap-3 text-sm whitespace-nowrap tabular-nums">
        <Figure testId="trade-porters" icon="people" name="Nosiči">
          {preview.porters}
        </Figure>
        {preview.carts > 0 && (
          <Figure
            testId="trade-carts"
            icon="cart"
            name={
              preview.trips > 1
                ? `Vozy – náklad místo nosičů, pojedou ${preview.trips}× tam a zpět`
                : 'Vozy – náklad místo nosičů'
            }
          >
            {preview.carts}
          </Figure>
        )}
        <Figure
          testId="trade-days"
          icon="date"
          name={preview.trips > 1 ? 'Dny cesty – všechny jízdy vozů' : 'Dny cesty tam a zpět'}
        >
          {preview.days}
        </Figure>
        <Figure
          testId="trade-labor"
          icon="labor"
          name={
            preview.savedManDays > 0
              ? `Práce (člověkodny) – vozy ušetří ${formatInteger(preview.savedManDays)} proti nosičům`
              : 'Práce (člověkodny)'
          }
        >
          {preview.manDays}
          {preview.savedManDays > 0 && (
            <span data-testid="trade-saved" className="text-[#a8d46f]">
              −{formatInteger(preview.savedManDays)}
            </span>
          )}
        </Figure>
        <span className="ml-auto">
          <Tooltip
            placement="above-left"
            denied={sendDenied}
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
              disabled={preview.blocked !== null || busy || !onSend || sendDenied !== null}
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
      {error && (
        <p
          data-testid="trade-error"
          role="alert"
          className="w-0 min-w-full text-right text-xs font-semibold whitespace-normal text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Panel obchodu: sousedé po hotových stezkách (šipka směru a jméno vsi – jen když jich je víc),
 * pod nimi obchod s vybraným. `onSend` – výprava vyrazí (server action) a vrátí důvod, proč ji
 * server odmítl, nebo null. Panel zůstane otevřený: po úspěchu ukáže výpravu na cestě, po chybě
 * důvod červeně pod tlačítkem.
 */
export function TradePanel({
  neighbours,
  onSend,
  initialDirection,
}: {
  neighbours: readonly VillageNeighbour[];
  onSend?: (
    direction: Direction8,
    give: TradeGoods,
    get: TradeGoods,
    people: PreviewPeople,
  ) => Promise<string | null | void>;
  initialDirection?: Direction8;
}): ReactElement {
  const [selected, setSelected] = useState<Direction8 | null>(
    initialDirection ?? neighbours[0]?.direction ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ direction: Direction8; text: string } | null>(null);
  const neighbour = neighbours.find((n) => n.direction === selected) ?? neighbours[0] ?? null;
  const send = (give: TradeGoods, get: TradeGoods, people: PreviewPeople): void => {
    if (!onSend || !neighbour || busy) return;
    const direction = neighbour.direction;
    setBusy(true);
    setError(null);
    void onSend(direction, give, get, people)
      .then((failure) => {
        if (failure) setError({ direction, text: failure });
      })
      .finally(() => setBusy(false));
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
          error={error?.direction === neighbour.direction ? error.text : null}
          onEdit={() => setError(null)}
          {...(onSend ? { onSend: send } : {})}
        />
      )}
    </div>
  );
}
