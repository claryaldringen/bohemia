import { describe, expect, it } from 'vitest';
import { foundVillage } from '../actions';
import {
  NO_HORSE_ROOM,
  horseTradeRoom,
  horseValueKg,
  horsesForSale,
  offeredHorses,
} from '../horse-trade';
import { horsesWanted } from '../horse-breeding';
import { villageHorses } from '../horses';
import { neighbourOf, neighbourStock, tradeSeason } from '../neighbours';
import { HORSES, TRADE } from '../rules';
import {
  OVER_STOCK,
  OVER_SUPPLY,
  buyValue,
  expeditionPorters,
  finishExpeditions,
  sellValue,
  startExpedition,
  tradeQuote,
  villageGoodStock,
  withoutForeignGoods,
} from '../trade';
import { finishTrail, startTrail } from '../trail';
import type { Direction8, Horse, TradeGoods, VillageState } from '../types';
import { at, horse, horsePen } from './horse-fixtures';
import { LANDSCAPE } from './paths-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Obchod s koňmi (horses.md – Nákup a prodej; Martin: koně jde nakupovat a prodávat jako ostatní
// zvířata; ceny návrh Clauda): hříbě 800, klisna 1 600, jezdecký kůň 2 400–3 600 podle výcviku za
// kus; ves nikdy neprodá koně s jezdcem; koupený kůň potřebuje místo v ohradě koní; honák na 4 koně.

const DAY = at(601, 5, 1);
const YEAR = 365.25;
/** Seed 3: na jihu pastevci – nabízejí hříbata, klisny a některý rok jezdecké koně. */
const HERDERS = { seed: 3, direction: 'S' as Direction8 };
/** Seed 46: na jihu řemeslníci – shánějí jezdecké koně. */
const CRAFTERS = { seed: 46, direction: 'S' as Direction8 };

/** Ves s hotovou stezkou ke kraji, ohradou koní (`squares` čtverců) a zásobami obilí. */
function trading(
  { seed, direction }: { seed: number; direction: Direction8 },
  horses: Horse[] | null,
  squares = 2,
  day = DAY,
): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed, day, dwellingPosition: { x: 0, z: 0, rotation: Math.PI } }),
  );
  s.lastDay = day;
  const next = startTrail(s, day, direction, LANDSCAPE, null);
  const c = next.constructions.find((x) => x.trail !== undefined)!;
  finishTrail(next, c, day);
  next.constructions = next.constructions.filter((x) => x !== c);
  next.storesKg = 30_000;
  next.legumesKg = 2000;
  next.woodLogs = 40;
  next.nextId = 1000;
  if (horses) next.pens = [{ ...horsePen(90, horses, squares), builtDay: day - 400 }];
  return next;
}

/** Výprava se vrátí (odvedená práce = cena) v den `day`. */
function returned(s: VillageState, day: number): VillageState {
  const next = structuredClone(s);
  for (const e of next.trade!.expeditions) e.done = e.cost;
  next.chronicle.push(...finishExpeditions(next, day));
  return next;
}

/** Platba v hodnotě `kg` (s rezervou) – pastevci shánějí obilí, luštěniny a klády. */
function grainFor(kg: number): TradeGoods {
  const grain = Math.min(Math.ceil(kg) + 1, 1300);
  const legumes = Math.min(Math.ceil(kg) + 1 - grain, 1000);
  const logs = Math.ceil((Math.ceil(kg) + 1 - grain - legumes) / 40);
  return { grain, ...(legumes > 0 ? { legumes } : {}), ...(logs > 0 ? { logs } : {}) };
}

/** Den 1. 5. roku obchodu `season`, ve kterém pastevci na jihu (ne)mají jezdecké koně. */
function seasonDay(riding: boolean): number {
  for (let year = 601; year < 640; year++) {
    const day = at(year, 5, 1);
    const left = neighbourStock({ seed: HERDERS.seed }, HERDERS.direction, day).supply;
    if ((left.ridingHorses ?? 0) > 0 === riding) return day;
  }
  throw new Error('rok nenalezen');
}

describe('povaha a ceny (horses.md – Nákup a prodej)', () => {
  it('pastevci nabízejí hříbata, klisny i jezdecké koně, řemeslníci jezdecké koně shánějí', () => {
    const herders = neighbourOf(HERDERS.seed, HERDERS.direction);
    expect(herders.kind).toBe('herders');
    expect(herders.offers).toEqual(expect.arrayContaining(['foals', 'mares', 'ridingHorses']));
    const crafters = neighbourOf(CRAFTERS.seed, CRAFTERS.direction);
    expect(crafters.kind).toBe('crafters');
    expect(crafters.demands).toContain('ridingHorses');
    for (const g of ['foals', 'mares', 'ridingHorses'] as const) {
      expect(herders.supply[g]).toBeGreaterThanOrEqual(1);
      expect(herders.supply[g]).toBeLessThanOrEqual(3);
    }
  });

  it('jezdecké koně mají pastevci jen některý rok – hříbata a klisny každý', () => {
    const withRiding = neighbourStock({ seed: 3 }, 'S', seasonDay(true)).supply;
    const without = neighbourStock({ seed: 3 }, 'S', seasonDay(false)).supply;
    expect(without.ridingHorses).toBe(0);
    expect(withRiding.foals).toBeGreaterThanOrEqual(1);
    expect(without.mares).toBeGreaterThanOrEqual(1);
  });

  it('cena jezdeckého koně podle výcviku: 2 400 nevycvičený – 3 600 vycvičený', () => {
    expect(horseValueKg({ training: 0 })).toBe(2400);
    expect(horseValueKg({ training: HORSES.trainingFull / 2 })).toBe(3000);
    expect(horseValueKg({ training: HORSES.trainingFull })).toBe(3600);
  });

  it('koně jdou po svých s honákem – honák na 4 koně, s dobytkem zvlášť', () => {
    expect(TRADE.horsesPerDrover).toBe(4);
    expect(expeditionPorters({}, { mares: 4 })).toBe(1);
    expect(expeditionPorters({}, { foals: 3, mares: 2 })).toBe(2);
    expect(expeditionPorters({ ridingHorses: 1 }, { cows: 10 })).toBe(1);
    expect(expeditionPorters({}, { cows: 10, mares: 1 })).toBe(2);
  });
});

describe('prodej', () => {
  const herd = (): Horse[] => [
    { ...horse(1, 8, 'male', 80, DAY), riderId: 7 },
    horse(2, 5, 'male', 20, DAY),
    horse(3, 6, 'male', 50, DAY),
    horse(4, 6, 'female', 0, DAY),
    horse(5, 9, 'female', 0, DAY),
    horse(6, 2, 'male', 0, DAY),
  ];

  it('nikdy koně s jezdcem; klisny nad chovné; hříbata', () => {
    const s = trading(CRAFTERS, herd(), 3);
    expect(horsesForSale(s, 'ridingHorses', DAY)).toBe(2);
    expect(horsesForSale(s, 'mares', DAY)).toBe(2 - horsesWanted(s, DAY).mares);
    expect(horsesForSale(s, 'foals', DAY)).toBe(1);
    expect(villageGoodStock(s, 'ridingHorses', DAY)).toBe(2);
  });

  it('chovný hřebec zůstane – bez koně s jezdcem se poslední hřebec ke klisnám neprodá', () => {
    const s = trading(CRAFTERS, [horse(2, 5, 'male', 20, DAY), horse(4, 6, 'female', 0, DAY)]);
    expect(horsesForSale(s, 'ridingHorses', DAY)).toBe(0);
  });

  it('cena za kus – napřed nejméně vycvičený; kůň s jezdcem nikdy', () => {
    const s = trading(CRAFTERS, herd(), 3);
    const one = tradeQuote(s, { direction: 'S', give: { ridingHorses: 1 }, get: {} }, DAY);
    expect(one.credit).toBeCloseTo(sellValue(horseValueKg({ training: 20 })), 2);
    const two = tradeQuote(s, { direction: 'S', give: { ridingHorses: 2 }, get: {} }, DAY);
    expect(two.credit).toBeCloseTo(sellValue(2400 + 240) + sellValue(2400 + 600), 2);
    const three = tradeQuote(s, { direction: 'S', give: { ridingHorses: 3 }, get: {} }, DAY);
    expect(three.blocked).toBe(OVER_STOCK);
    // prodaný kůň odejde hned s výpravou, jezdec si svého koně nechá
    const away = startExpedition(s, DAY, { direction: 'S', give: { ridingHorses: 1 }, get: {} });
    const left = villageHorses(away);
    expect(left.map((h) => h.id)).toEqual([1, 3, 4, 5, 6]);
    expect(left[0]!.riderId).toBe(7);
  });
});

describe('koupě', () => {
  it('koupě bez místa je zablokovaná s důvodem', () => {
    const noPen = trading(HERDERS, null);
    const get = { mares: 1 };
    const give = grainFor(2000);
    expect(horseTradeRoom(noPen, DAY)).toBe(0);
    expect(tradeQuote(noPen, { direction: 'S', give, get }, DAY).blocked).toBe(NO_HORSE_ROOM);
    // plná ohrada (1 čtverec = 4 místa); hříbě do roku místo nezabírá
    const adults = [1, 2, 3, 4].map((id) => horse(id, 6, 'female', 0, DAY));
    const full = trading(HERDERS, [...adults, horse(5, 0.5, 'male', 0, DAY)], 1);
    expect(horseTradeRoom(full, DAY)).toBe(0);
    expect(tradeQuote(full, { direction: 'S', give, get }, DAY).blocked).toBe(NO_HORSE_ROOM);
    // koně na cestě místo zabírají
    const roomy = trading(HERDERS, adults.slice(0, 2), 1);
    expect(tradeQuote(roomy, { direction: 'S', give, get }, DAY).blocked).toBeNull();
    const away = startExpedition(roomy, DAY, { direction: 'S', give, get });
    expect(horseTradeRoom(away, DAY)).toBe(1);
  });

  it('koupený jezdecký kůň 3–12 let s výcvikem podle věku, cena za kus', () => {
    const day = seasonDay(true);
    const s = trading(HERDERS, [horse(1, 8, 'male', 80, day)], 2, day);
    const left = neighbourStock(s, 'S', day).supply.ridingHorses!;
    const offered = offeredHorses(s, 'S', 'ridingHorses', left, day);
    expect(offered).toHaveLength(left);
    for (const h of offered) {
      const age = (day - h.bornDay) / YEAR;
      expect(age).toBeGreaterThanOrEqual(3);
      expect(age).toBeLessThanOrEqual(12);
      expect(h.sex).toBe('male');
      const expected = ((age - 3) / (12 - 3)) * HORSES.trainingFull;
      expect(Math.abs(h.training - expected)).toBeLessThanOrEqual(0.6);
    }
    const price = buyValue(horseValueKg(offered[0]!));
    const get = { ridingHorses: 1 };
    const quote = tradeQuote(s, { direction: 'S', give: grainFor(price), get }, day);
    expect(quote.blocked).toBeNull();
    expect(quote.price).toBeCloseTo(price, 2);
    // po návratu je kůň v ohradě koní s věkem a výcvikem z nabídky; soused nabízí dalšího
    const away = startExpedition(s, day, { direction: 'S', give: grainFor(price), get });
    expect(offeredHorses(away, 'S', 'ridingHorses', 1, day)).toEqual(offered.slice(1, 2));
    const back = returned(away, day + 6);
    const bought = villageHorses(back).find((h) => h.id !== 1)!;
    expect(bought).toEqual({ id: 1000, ...offered[0]! });
    expect(back.chronicle.at(-1)).toMatchObject({ kind: 'trade-returned', get });
  });

  it('jezdecké koně v roce, kdy je soused nemá, nejdou koupit', () => {
    const day = seasonDay(false);
    const s = trading(HERDERS, [], 2, day);
    const get = { ridingHorses: 1 };
    expect(tradeQuote(s, { direction: 'S', give: grainFor(3000), get }, day).blocked).toBe(
      OVER_SUPPLY,
    );
  });
});

describe('převod – zásoby sousedů uložené před koňmi', () => {
  it('uložený zbytek roku bez koní se načte beze změny, koně přibudou 1. 11.', () => {
    const s = trading(HERDERS, []);
    const full = neighbourStock(s, 'S', DAY);
    const strip = (goods: TradeGoods): TradeGoods =>
      Object.fromEntries(
        Object.entries(goods).filter(([g]) => !['foals', 'mares', 'ridingHorses'].includes(g)),
      );
    const stored = { ...full, supply: strip(full.supply), demand: strip(full.demand) };
    s.trade = { neighbours: [stored], expeditions: [], nextId: 1 };
    expect(withoutForeignGoods(s)).toBe(s);
    expect(neighbourStock(s, 'S', DAY).supply.mares).toBeUndefined();
    const get = { mares: 1 };
    expect(tradeQuote(s, { direction: 'S', give: grainFor(2000), get }, DAY).blocked).toBe(
      OVER_SUPPLY,
    );
    const nextSeason = at(601, 11, 1);
    expect(tradeSeason(nextSeason)).toBe(tradeSeason(DAY) + 1);
    expect(neighbourStock(s, 'S', nextSeason).supply.mares).toBeGreaterThanOrEqual(1);
  });
});
