import { describe, expect, it } from 'vitest';
import {
  MARKET_BAD_ORDER,
  MARKET_NO_PEOPLE,
  MARKET_OVER_STOCK,
  dayIndexOf,
  foundVillage,
  marketTripPeople,
  planMarketTrip,
  villageGoodStock,
  type MarketOrder,
  type MarketTarget,
  type Person,
  type TradeExpedition,
  type TradeGoods,
  type VillageState,
} from '@bohemia/game';
import { manorView } from '../manor-view';
import { marketPreview, marketTripViews } from '../market-view';

// Pohledy trhu pro web (markets.md – Rozhodnutí plánu 2, body 2 a 9): výpravy na cestě a náhled
// výpravy, který jen převádí kontrolu jádra (`checkMarketTrip`).

const DAY = dayIndexOf({ year: 600, month: 5, day: 1 });
const YEAR = 365.25;

const person = (id: number, age: number, sex: Person['sex']): Person => ({
  id,
  bornDay: DAY - Math.ceil((age + 0.5) * YEAR),
  dwellingId: 900,
  sex,
});

function village(): VillageState {
  const s = foundVillage({ seed: 11, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  const site = s.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId !== null)!;
  s.constructions = s.constructions.filter((c) => c !== site);
  s.dwellings.push(
    {
      id: site.dwellingId!,
      type: 'zemnice',
      builtDay: DAY,
      condition: 1,
      position: site.position!,
    },
    {
      id: 900,
      type: 'polozemnice',
      builtDay: DAY,
      condition: 1,
      position: { x: 30, z: 0, rotation: 0 },
    },
  );
  s.manorId = site.dwellingId!;
  s.people.push(
    person(500, 30, 'male'),
    person(501, 28, 'female'),
    person(502, 24, 'male'),
    person(503, 22, 'female'),
  );
  s.lastDay = DAY;
  s.storesKg = 3_000;
  s.trade = { expeditions: [], nextId: 1 };
  return s;
}

function marketTrip(
  s: VillageState,
  trip: { arriveDay: number; stayDays: number; returnDay: number; waiting?: boolean },
): void {
  s.trade!.expeditions.push({
    id: 1,
    kind: 'market',
    direction: 'E',
    trailId: -1,
    startedDay: DAY + 1,
    give: { grain: 100 },
    get: {},
    porters: 4,
    days: trip.returnDay - DAY - 1,
    cost: 4,
    done: 0,
    destination: { cells: 1, firstStep: 'E' },
    market: {
      key: 'market:h:1',
      villageId: 'v-2',
      name: 'Lhota',
      wants: {},
      stayDays: trip.stayDays,
      travelDays: 1,
      arriveDay: trip.arriveDay,
      returnDay: trip.returnDay,
    },
  } satisfies TradeExpedition);
}

describe('výpravy na trh na cestě', () => {
  it('čtyři fáze a dny do návratu', () => {
    const s = village();
    // vyrazí DAY + 1, přijde DAY + 2, pobyt 2 dny, doma DAY + 5
    marketTrip(s, { arriveDay: DAY + 2, stayDays: 2, returnDay: DAY + 5 });
    const at = (day: number) => marketTripViews(s, day)[0]!;
    expect(at(DAY + 1)).toMatchObject({ phase: 'out', daysLeft: 4, villageName: 'Lhota' });
    expect(at(DAY + 2).phase).toBe('market');
    expect(at(DAY + 3).phase).toBe('market');
    expect(at(DAY + 4)).toMatchObject({ phase: 'back', daysLeft: 1 });
    // po termínu bez výsledku trhu výprava čeká na zboží
    expect(at(DAY + 5)).toMatchObject({ phase: 'waiting', daysLeft: 0 });
    expect(at(DAY + 1).key).toBe('market:h:1');
  });

  it('jiné výpravy do výpisu nepatří', () => {
    const s = village();
    s.trade!.expeditions.push({
      id: 2,
      kind: 'shipment',
      direction: 'E',
      trailId: -1,
      startedDay: DAY,
      give: {},
      get: {},
      porters: 1,
      days: 2,
      cost: 2,
      done: 0,
    });
    expect(marketTripViews(s, DAY)).toEqual([]);
  });
});

describe('pohled dvorce bez modelu lidí na prodej (plán 3, Úloha 11, opravné kolo 2)', () => {
  it('trh v pohledu nese jen nejvýš kolik skupin každého druhu ves dá, ne model výběru', () => {
    const s = village();
    const market = manorView(s, DAY)!.market;
    expect(market).not.toHaveProperty('people');
    for (const good of ['families', 'men', 'women'] as const) {
      expect(market.stock[good]).toBe(villageGoodStock(s, good, DAY));
    }
    expect(market.stock.men).toBeGreaterThan(0);
  });
});

describe('náhled výpravy = kontrola jádra', () => {
  const target: MarketTarget = {
    villageId: 'v-2',
    name: 'Lhota',
    cells: 2,
    firstStep: 'E',
    homeVillageId: 'h',
    homeName: 'Vlkov',
  };
  const orders: Record<string, MarketOrder> = {
    'v pořádku': { give: { grain: 200 }, wants: { cows: 1 }, stayDays: 2 },
    'pobyt 0': { give: { grain: 200 }, wants: {}, stayDays: 0 },
    'víc než sklad': { give: { grain: 9_000 }, wants: {}, stayDays: 1 },
    'kámen bez vozu': { give: { stone: 1 }, wants: {}, stayDays: 1 },
    'málo dospělých': { give: { grain: 3_000 }, wants: {}, stayDays: 1 },
    'špatný tvar': { give: { grain: -5 }, wants: {}, stayDays: 1 },
    // lidé na prodej nejsou nosiči (plán 3, Úloha 11): obilí 3 000 kg jde jen s tím, kdo zůstane
    'obilí a prodaní muži': { give: { grain: 1_500, men: 2 }, wants: {}, stayDays: 1 },
    'muži i ženy společně': { give: { grain: 1_500, men: 2, women: 2 }, wants: {}, stayDays: 1 },
    // server bere ženy z vsi bez odcházejících mužů – náhled jen, když muži nejsou ve výběru
    'ženy bez mužů': { give: { women: 2 }, wants: {}, stayDays: 1 },
    'ženy bez mužů a obilí': { give: { grain: 2_900, women: 2 }, wants: {}, stayDays: 1 },
    'víc mužů, než je': { give: { men: 9 }, wants: {}, stayDays: 1 },
    // mince (plán 4, Úloha 8): v „Dáš“ nic neváží, na seznam se nedávají, domů se nese celý nákup
    'mince za keramiku': { give: { coins: 400 }, wants: { pottery: 50 }, stayDays: 1 },
    'obilí a mince': { give: { grain: 50, coins: 400 }, wants: {}, stayDays: 1 },
    'mince na seznamu': { give: { grain: 50 }, wants: { coins: 1 }, stayDays: 1 },
    'víc mincí, než ves má': { give: { coins: 401 }, wants: {}, stayDays: 1 },
    'půlka mince': { give: { coins: 0.5 }, wants: {}, stayDays: 1 },
    'nákup za mince lidé neunesou': {
      give: { coins: 400 },
      wants: { pottery: 2_000 },
      stayDays: 1,
    },
  };

  for (const [name, order] of Object.entries(orders)) {
    it(`${name}: stejný důvod i čísla jako server`, () => {
      const s = village();
      s.coins = 400;
      const view = manorView(s, DAY)!;
      const plan = planMarketTrip(s, DAY, order, target);
      // lidi z výběru spočítá server pro vybrané počty (`marketTripPeople`), bez lidí nic
      const { families = 0, men = 0, women = 0 } = order.give;
      const people = families + men + women > 0 ? marketTripPeople(s, DAY, order.give) : null;
      const preview = marketPreview(order, view.market, target.cells, people);
      expect(preview.reason).toBe(plan.ok ? null : plan.reason);
      if (plan.ok) {
        expect(preview.porters).toBe(plan.porters);
        expect(preview.carts).toBe(plan.cartIds.length);
        expect(preview.awayDays).toBe(plan.returnDay - plan.departDay);
        expect(preview.awayDays).toBe(2 * plan.travelDays + order.stayDays);
      }
    });
  }

  it('mince: na seznam se nedávají, v „Dáš“ nosiče nepřidají (Rozhodnutí plánu 4, bod 4)', () => {
    const s = village();
    s.coins = 400;
    const { market } = manorView(s, DAY)!;
    expect(market.stock.coins).toBe(400);
    const preview = (give: TradeGoods, wants: TradeGoods = {}): ReturnType<typeof marketPreview> =>
      marketPreview({ give, wants, stayDays: 1 }, market, target.cells, null);
    const refused = (reason: string): ReturnType<typeof marketPreview> => ({
      porters: 0,
      carts: 0,
      awayDays: 0,
      reason,
    });
    expect(preview({}, { coins: 1 })).toEqual(refused(MARKET_BAD_ORDER));
    expect(preview({ coins: 400 }, { coins: 1 })).toEqual(refused(MARKET_BAD_ORDER));
    // 50 kg obilí nesou dva, 400 mincí nikdo navíc
    expect(preview({ grain: 50 })).toEqual({ porters: 2, carts: 0, awayDays: 3, reason: null });
    expect(preview({ grain: 50, coins: 400 })).toEqual(preview({ grain: 50 }));
    expect(preview({ coins: 400 })).toEqual(preview({}));
    // nákup za mince drží cesta domů – 50 kg keramiky zpět nesou dva, 2 000 kg by neslo 80 lidí
    expect(preview({ coins: 400 }, { pottery: 50 })).toMatchObject({ porters: 2, reason: null });
    expect(preview({ coins: 400 }, { pottery: 2_000 })).toEqual(refused(MARKET_NO_PEOPLE));
    expect(preview({ coins: 401 })).toEqual(refused(MARKET_OVER_STOCK));
  });
});
