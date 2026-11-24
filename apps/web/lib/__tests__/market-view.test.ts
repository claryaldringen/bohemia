import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  foundVillage,
  marketPeopleOffer,
  planMarketTrip,
  type MarketOrder,
  type MarketTarget,
  type Person,
  type TradeExpedition,
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
    'víc mužů, než je': { give: { men: 9 }, wants: {}, stayDays: 1 },
  };

  for (const [name, order] of Object.entries(orders)) {
    it(`${name}: stejný důvod i čísla jako server`, () => {
      const s = village();
      const view = manorView(s, DAY)!;
      const plan = planMarketTrip(s, DAY, order, target);
      const preview = marketPreview(order, view.market, target.cells);
      expect(preview.reason).toBe(plan.ok ? null : plan.reason);
      if (plan.ok) {
        expect(preview.porters).toBe(plan.porters);
        expect(preview.carts).toBe(plan.cartIds.length);
        expect(preview.awayDays).toBe(plan.returnDay - plan.departDay);
        expect(preview.awayDays).toBe(2 * plan.travelDays + order.stayDays);
      }
    });
  }
});

describe('lidé na prodej v náhledu (sdílený výběr jádra)', () => {
  it('nabídka lidí je výběr `emigrantGroups` po sobě, ne po druzích zvlášť', () => {
    const s = village();
    const offer = marketPeopleOffer(s, DAY);
    const view = manorView(s, DAY)!;
    expect(view.market.stock).toMatchObject(offer.stock);
    expect(view.market.peopleAdults).toEqual(offer.adults);
    expect(offer.stock.men).toBe(2);
    // po mužích zbyde jedna žena, kterou jde vybrat (`emigrantGroups` bere z týchž lidí)
    expect(offer.stock.women).toBe(1);
  });
});
