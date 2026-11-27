import { describe, expect, it } from 'vitest';
import { applyCampaignReturn } from '../../../war/raid-apply';
import type { MarketArrival, Person, TradeGoods } from '../../types';
import { PEOPLE_GOODS } from '../goods';
import {
  leavingGroups,
  peopleOf,
  receiveStranded,
  settlePeople,
  takePeople,
} from '../market-people';
import { initialPrice } from '../market-prices';
import { marketStance } from '../market-stance';
import {
  MARKET_BAD_ORDER,
  MARKET_OVER_STOCK,
  checkMarketTrip,
  departMarketInPlace,
  marketCrew,
  marketFreeAdults,
  marketTripPeople,
  planMarketTrip,
  type MarketTripCheck,
} from '../market-trip';
import {
  emigrantGroups,
  NO_PEOPLE,
  emigrantList,
  newcomerHome,
  tradePeopleCount,
  type EmigrantGroup,
} from '../people-trade';
import { sellableSlaves } from '../slaves';
import { villageGoodStock } from '../trade';
import { dwelling } from '../../__tests__/kin-fixtures';
import { D, SLAVE_HOUSE, marketVillage, slaveHome, target } from './market-fixtures';

// Otroci jako zboží (markets.md – Rozhodnutí plánu 5, bod 6; Martin 26. 11. 2026: „Otroci nejsou
// rodina, ale zboží“): kus = jeden otrok-pohan, který je doma a není manželkou muže rodu; výběr od
// nejnižšího id napřed, rodiny, muži a ženy ze zbytku.

const EMPTY_HOUSE = 900;

/** Id lidí skupin po skupinách. */
const ids = (groups: readonly EmigrantGroup[]): number[][] =>
  groups.map((g) => g.people.map((p) => p.id));

/** Id všech lidí skupin v pořadí výběru. */
const flat = (groups: readonly { people: readonly Person[] }[]): number[] =>
  groups.flatMap((g) => g.people.map((p) => p.id));

describe('otroci jako zboží (markets.md – Rozhodnutí plánu 5, bod 6)', () => {
  it('sellableSlaves: pohan doma – ne pokřtěný, pryč, z rodu ani manželka muže rodu; od nejnižšího id', () => {
    const s = slaveHome();
    expect(sellableSlaves(s, D).map((p) => p.id)).toEqual([10, 14]);
    expect(villageGoodStock(s, 'slaves', D)).toBe(2);
    // pořadí lidí ve stavu nerozhoduje; 12 je zpátky v den návratu
    s.people.reverse();
    expect(sellableSlaves(s, D).map((p) => p.id)).toEqual([10, 14]);
    expect(sellableSlaves(s, D + 5).map((p) => p.id)).toEqual([10, 12, 14]);
  });

  it('hostitel otroky sám nenabízí ani neshání (Rozhodnutí 7) a tradePeopleCount je počítá', () => {
    const stance = marketStance(slaveHome(), D);
    expect(stance.offer.slaves).toBeUndefined();
    expect(stance.wants.slaves).toBeUndefined();
    expect(tradePeopleCount({ ...NO_PEOPLE, slaves: 2 })).toBe(2);
  });

  it('emigrantGroups: otroci napřed, muži a ženy ze vsi bez nich – 10 jen jako otrokyně', () => {
    const s = slaveHome();
    // bez otroků by 10 odešla jako svobodná žena
    const free = emigrantGroups(s, D, { families: 0, men: 1, women: 1 });
    expect(free.slaves).toEqual([]);
    expect(ids(free.women)).toEqual([[10]]);
    const out = emigrantGroups(s, D, { families: 0, men: 1, women: 1, slaves: 1 });
    expect(out.slaves).toEqual([
      { kind: 'slave', dwellingId: SLAVE_HOUSE, people: [s.people.find((p) => p.id === 10)] },
    ]);
    expect(out.slaves[0]!.people[0]!.id).toBe(10);
    expect(flat([...out.men, ...out.women])).not.toContain(10);
    expect(ids(out.men)).toEqual([[11]]);
    expect(out.women).toEqual([]);
    expect(emigrantList(out).map((g) => g.kind)).toEqual(['slave', 'man']);
  });

  it('leavingGroups = postupné takePeople v pořadí PEOPLE_GOODS, nikdo dvakrát', () => {
    const gives: TradeGoods[] = [
      { slaves: 2, men: 1 },
      { slaves: 1, men: 1, women: 1 },
      { slaves: 2, families: 1, men: 2, women: 2 },
    ];
    for (const give of gives) {
      const s = slaveHome();
      const leaving = flat(emigrantList(leavingGroups(s, D, give)));
      const taken: number[] = [];
      for (const good of PEOPLE_GOODS) {
        const n = give[good] ?? 0;
        if (n > 0) taken.push(...flat(takePeople(s, D, good, n, 'E')));
      }
      expect(taken, JSON.stringify(give)).toEqual(leaving);
      expect(new Set(leaving).size, JSON.stringify(give)).toBe(leaving.length);
    }
    const first = leavingGroups(slaveHome(), D, { slaves: 2, men: 1 });
    expect([ids(first.slaves), ids(first.men)]).toEqual([[[10], [14]], [[11]]]);
  });

  it('departMarketInPlace: dva otroci odejdou každý sám, svobodné dítě prodané matky zůstane', () => {
    const s = slaveHome();
    const bornDay = s.people.find((p) => p.id === 10)!.bornDay;
    const sent = departMarketInPlace(s, D, { give: { slaves: 2 }, wants: {}, stayDays: 1 }, target);
    if (!sent.ok) throw new Error(sent.reason);
    const body = s.outbox![0]!.body as { kind: 'market-arrive'; arrival: MarketArrival };
    expect(body.arrival.goods).toEqual({ slaves: 2 });
    expect(body.arrival.people).toEqual([
      { good: 'slaves', people: [expect.objectContaining({ id: 10, slave: true })] },
      { good: 'slaves', people: [expect.objectContaining({ id: 14, slave: true })] },
    ]);
    expect(s.people.filter((p) => p.id === 10 || p.id === 14)).toEqual([]);
    // 14 tu nemá příbuzné – v emigrants zůstane jen matka dítěte 16
    expect(s.emigrants).toEqual([{ id: 10, sex: 'female', bornDay, direction: 'E' }]);
    const child = s.people.find((p) => p.id === 16)!;
    expect(child).toMatchObject({ motherId: 10, dwellingId: SLAVE_HOUSE });
    expect(child.slave).toBeUndefined();
  });

  it('checkMarketTrip: otroci po celých kusech, nejvýš zásoba; nikdo je nenese', () => {
    const input: MarketTripCheck = {
      stock: { slaves: 2 },
      homeCarts: [],
      oxenHome: 0,
      adults: 5,
      cells: 1,
      day: D,
    };
    const order = (slaves: number): { give: TradeGoods; wants: TradeGoods; stayDays: number } => ({
      give: { slaves },
      wants: {},
      stayDays: 1,
    });
    expect(checkMarketTrip(order(1.5), input)).toEqual({ ok: false, reason: MARKET_BAD_ORDER });
    expect(checkMarketTrip(order(3), input)).toEqual({ ok: false, reason: MARKET_OVER_STOCK });
    expect(checkMarketTrip(order(2), input).ok).toBe(true);
    expect(planMarketTrip(slaveHome(), D, order(3), target)).toEqual({
      ok: false,
      reason: MARKET_OVER_STOCK,
    });
    expect(marketCrew({ slaves: 5 }, {}, [])).toEqual({ porters: 1, carts: 0 });
  });

  it('marketTripPeople: stock.slaves jen s otroky, volní dospělí bez prodávaných', () => {
    const s = slaveHome();
    const trip = marketTripPeople(s, D, { slaves: 2 });
    expect(trip.stock).toStrictEqual({ families: 0, men: 0, women: 0, slaves: 2 });
    const rest = { ...s, people: s.people.filter((p) => p.id !== 10 && p.id !== 14) };
    expect(trip.adults).toBe(marketFreeAdults(rest, D));
    expect(trip.adults).toBe(marketFreeAdults(s, D) - 1);
    expect(planMarketTrip(s, D, { give: { slaves: 2 }, wants: {}, stayDays: 1 }, target).ok).toBe(
      true,
    );
    expect(marketTripPeople(s, D, { men: 1 }).stock).toStrictEqual({
      families: 0,
      men: 1,
      women: 0,
    });
  });

  it('cena a tvar: 4 mince (360 kg ÷ 90) jako svobodný dospělý; peopleOf bez otroků beze změny', () => {
    expect(initialPrice('slaves')).toBe(4);
    expect(initialPrice('slaves')).toBe(initialPrice('men'));
    expect(peopleOf({ men: 1 })).toStrictEqual({ families: 0, men: 1, women: 0 });
    expect(peopleOf({ men: 1, slaves: 1.5 })).toStrictEqual({ families: 0, men: 1, women: 0 });
    expect(peopleOf({ slaves: 2, grain: 5 })).toStrictEqual({
      families: 0,
      men: 0,
      women: 0,
      slaves: 2,
    });
  });

  it('settlePeople: otrokyně přijde v ženském rodě (`female`), otrok bez něj; oba dál otroci', () => {
    const m = marketVillage();
    // prázdný dům: rodina by šla do něj, otrok ne
    m.dwellings.push({ ...dwelling(EMPTY_HOUSE), position: { x: 90, z: 0, rotation: 0 } });
    expect(newcomerHome(m, true)).toBe(EMPTY_HOUSE);
    const next = m.nextId;
    const h = slaveHome();
    const [woman, boy] = [10, 14].map((id) => h.people.find((p) => p.id === id)!);
    const from = { villageId: 'h', villageName: 'Vlkov', direction: 'W' as const };
    // otrok se usadí jako svobodný (ne jako rodina) – do obydlí podle `newcomerHome(…, false)`
    const home = newcomerHome(m, false);
    const events = settlePeople(
      m,
      D,
      [
        { good: 'slaves', people: [woman!] },
        { good: 'slaves', people: [boy!] },
      ],
      from,
    );
    const newcomer = {
      day: D,
      kind: 'newcomer',
      direction: 'W',
      group: 'slave',
      people: 1,
      dwellingId: home,
      villageName: 'Vlkov',
      villageId: 'h',
    };
    expect(events).toStrictEqual([
      { ...newcomer, female: true },
      { ...newcomer, dwellingId: m.people.find((p) => p.id === next + 1)!.dwellingId },
    ]);
    expect(home).not.toBe(EMPTY_HOUSE);
    expect(m.people.find((p) => p.id === next)!.dwellingId).toBe(home);
    expect(m.people.filter((p) => p.id >= next).map((p) => [p.id, p.slave])).toEqual([
      [next, true],
      [next + 1, true],
    ]);
  });

  it('receiveStranded: vrácená otrokyně hostitele s původním id a `female`', () => {
    const h = slaveHome();
    const sold = takePeople(h, D, 'slaves', 1, 'E');
    const events = receiveStranded(h, D + 3, {
      key: 'k',
      people: [],
      own: sold.map((g) => ({ ...g, fromHost: true as const })),
      from: { villageId: 'x', villageName: 'Lhota', direction: 'E' },
    });
    expect(events).toStrictEqual([
      {
        day: D + 3,
        kind: 'newcomer',
        direction: 'E',
        group: 'slave',
        people: 1,
        dwellingId: expect.any(Number),
        villageName: 'Lhota',
        villageId: 'x',
        returned: true,
        female: true,
      },
    ]);
    expect(h.people.find((p) => p.id === 10)).toMatchObject({ slave: true });
  });

  it('odvedený pohan z rodu nebo šlechtic je po usazení obyčejný otrok na prodej (Úloha 1)', () => {
    // settleLed maže `line` a `noble` – keptByLine ani canBeSold ho pak nedrží
    const s = slaveHome();
    s.nextId = 1000;
    const led = (id: number, sex: Person['sex'], extra: Partial<Person>): Person => ({
      id,
      bornDay: D - 9_000,
      dwellingId: 3,
      sex,
      ...extra,
    });
    applyCampaignReturn(s, D, {
      campaignId: 'c1',
      back: [],
      wounded: [],
      fallen: [],
      people: [
        led(5, 'male', { line: true, spouseId: 6 }),
        led(6, 'female', { spouseId: 5 }),
        led(7, 'male', { noble: { houseId: 'jinde' } }),
      ],
    });
    const came = s.people.filter((p) => p.id >= 1000).sort((a, b) => a.id - b.id);
    expect(came.map((p) => [p.id, p.slave, p.line, p.noble, p.spouseId])).toEqual([
      [1000, true, undefined, undefined, 1001],
      [1001, true, undefined, undefined, 1000],
      [1002, true, undefined, undefined, undefined],
    ]);
    expect(sellableSlaves(s, D).map((p) => p.id)).toEqual([10, 14, 1000, 1001, 1002]);
  });
});
