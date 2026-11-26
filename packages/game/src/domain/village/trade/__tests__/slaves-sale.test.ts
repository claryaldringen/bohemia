import { describe, expect, it } from 'vitest';
import { advanceVillage } from '../../core/simulate';
import type { MarketArrival, MarketVisitor, MerchantStop, Person, VillageState } from '../../types';
import { joinMarket, marketDay } from '../market';
import { leavingGroups, restorePeople, sendPeople } from '../market-people';
import { marketStance } from '../market-stance';
import { departMarketInPlace } from '../market-trip';
import { nextMerchantVisit } from '../merchant-plan';
import { emigrantList } from '../people-trade';
import {
  SLAVES_BAD_COUNT,
  offeredSlaveIds,
  reduceSlavesForSale,
  setSlavesForSale,
} from '../slaves';
import {
  D,
  FAMILY_HOUSE,
  SON_HOUSE,
  oneSidedSpouses,
  report,
  slaveFamilyHome,
  slaveHome,
  sownPart,
  target,
} from './market-fixtures';

// Prodej otroků ve vlastní vsi (markets.md – Rozhodnutí plánu 5, bod 8 – návrh Clauda podle
// Martinova „Hráč zadá počet“ u zbroje, 25. 11. 2026): hráč nastaví nabídku `slavesForSale`, ves
// nabízí min(nabídka, prodejní otroci) kupcům i výpravám a o prodané se nabídka zmenší. Otroci
// z nabídky jsou rezervovaní – jako rodina, muž ani žena se na trhu vsi nevyberou (podle id).

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
/** První příjezd kupců po D (60 mincí v měšci, otrok za 24). */
const DAY = nextMerchantVisit([STOP], D)!.day;

/** Vlkov s otroky (`slaveHome`) – otrok 12 doma: na prodej 10, 12 a 14 (od nejnižšího id). */
function slaves(): VillageState {
  const s = slaveHome();
  delete s.people.find((p) => p.id === 12)!.away;
  return s;
}

/** Vlkov s otroky u stezky den před příjezdem kupců s nabídkou `count` otroků. */
function merchantsHost(count: number): VillageState {
  const s = slaves();
  s.lastDay = DAY - 1;
  s.merchantStops = [structuredClone(STOP)];
  expect(setSlavesForSale(s, count)).toEqual({ ok: true });
  return s;
}

/**
 * Hostitel s prací nad půdu (jeden osetý díl, bez spřežení) a otroky; otrok 12 je o dva roky starší
 * (32) než pokřtěný otrok 11 – nejstarší svobodný muž v nejvíc přeplněném domě, takže bez rezervace
 * by jako muž odešel první.
 */
function reservationHost(): VillageState {
  const s = slaves();
  s.people.find((p) => p.id === 12)!.bornDay = D - Math.ceil(32.5 * 365.25);
  s.fields = [{ id: 1 }];
  s.parts = [sownPart(100)];
  s.pens = (s.pens ?? []).filter((p) => p.team === undefined || p.team === null);
  return s;
}

const KEY = 'market:h:1';

/** Výprava `key` z vsi H se zbožím `goods` a seznamem `wants`, na trhu do zítřka. */
function trip(
  goods: MarketArrival['goods'],
  wants: MarketArrival['wants'],
  key = KEY,
): MarketArrival {
  return {
    key,
    fromVillageId: 'h',
    fromName: 'Lhota',
    stayDays: 2,
    travelDays: 0,
    goods,
    horses: [],
    wants,
    report,
    firstStep: 'E',
  };
}

/** Výprava `key` na trhu vsi. */
function visitorOf(s: VillageState, key = KEY): MarketVisitor {
  const visitor = s.market?.visitors.find((v) => v.key === key);
  if (!visitor) throw new Error(`Výprava ${key} na trhu není.`);
  return visitor;
}

/** Id lidí, které výprava koupila – po skupinách se zbožím. */
function boughtIds(v: MarketVisitor): [string, number[]][] {
  return (v.boughtPeople ?? []).map((g) => [g.good, g.people.map((p) => p.id)]);
}

/**
 * Kde je člověk `p` ve stavu `state` – kdekoli (lidé vsi, trh, odchozí pošta; bez rodokmenu – ten je
 * vzpomínka vsi, ne lidé) podle `bornDay` a pohlaví. Cesty nálezů.
 */
function traces(state: VillageState, p: Person): string[] {
  const found: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.bornDay === p.bornDay && record.sex === p.sex) found.push(path);
    for (const [key, item] of Object.entries(record)) {
      if (key !== 'emigrants' && key !== 'ancestors') walk(item, `${path}.${key}`);
    }
  };
  walk(state, 'ves');
  return found;
}

/** Prodaní otroci `ids` nejsou ve vsi (podle id) ani nikde jinde ve stavu (podle `bornDay`). */
function goneFromWorld(s: VillageState, ids: readonly number[]): void {
  for (const sold of ids.map((id) => slaves().people.find((p) => p.id === id)!)) {
    expect(
      s.people.some((p) => p.id === sold.id),
      `id ${sold.id}`,
    ).toBe(false);
    expect(traces(s, sold), `id ${sold.id}`).toEqual([]);
  }
}

describe('nabídka otroků ve vlastní vsi (markets.md – Rozhodnutí plánu 5, bod 8)', () => {
  it('setSlavesForSale: celé nezáporné číslo, 0 pole smaže; nabízí se min(nabídka, zásoba)', () => {
    const s = slaves();
    expect(offeredSlaveIds(s, D).size).toBe(0);
    for (const bad of [1.5, -1, Number.NaN]) {
      expect(setSlavesForSale(s, bad)).toEqual({ ok: false, reason: SLAVES_BAD_COUNT });
    }
    expect(s).not.toHaveProperty('slavesForSale');
    expect(setSlavesForSale(s, 2)).toEqual({ ok: true });
    expect(s.slavesForSale).toBe(2);
    expect([...offeredSlaveIds(s, D)]).toEqual([10, 12]);
    expect(setSlavesForSale(s, 5)).toEqual({ ok: true });
    expect([...offeredSlaveIds(s, D)]).toEqual([10, 12, 14]);
    expect(setSlavesForSale(s, 0)).toEqual({ ok: true });
    expect(s).not.toHaveProperty('slavesForSale');
  });

  it('reduceSlavesForSale: o prodané menší, nula ze stavu zmizí', () => {
    const s = slaves();
    setSlavesForSale(s, 3);
    reduceSlavesForSale(s, 0);
    expect(s.slavesForSale).toBe(3);
    reduceSlavesForSale(s, 2);
    expect(s.slavesForSale).toBe(1);
    reduceSlavesForSale(s, 1);
    expect(s).not.toHaveProperty('slavesForSale');
    reduceSlavesForSale(s, 1);
    expect(s).not.toHaveProperty('slavesForSale');
  });

  it('v den kupců prodá 2 otroky z nabídky za 48 mincí – nabídka zmizí, prodaní odjeli s kupci', () => {
    const s = merchantsHost(2);
    expect(marketStance(s, DAY).offer).toEqual({ slaves: 2 });
    const m = advanceVillage(s, DAY, null, null, []);
    expect(m.coins).toBe((s.coins ?? 0) + 48);
    expect(m).not.toHaveProperty('slavesForSale');
    expect(m.chronicle!.filter((e) => e.day === DAY && e.kind === 'market-held')).toEqual([
      { day: DAY, kind: 'market-held', sold: { slaves: 2 }, bought: { coins: 48 } },
    ]);
    expect(m.market?.visitors ?? []).toEqual([]);
    goneFromWorld(m, [10, 12]);
    expect(m.people.some((p) => p.id === 14)).toBe(true);
  });

  it('nabídka 3, kupci koupí 2 (60 mincí): zbude slavesForSale 1, třetí otrok zůstane doma', () => {
    const m = advanceVillage(merchantsHost(3), DAY, null, null, []);
    expect(m.coins).toBe(48);
    expect(m.slavesForSale).toBe(1);
    goneFromWorld(m, [10, 12]);
    expect(m.people.find((p) => p.id === 14)).toMatchObject({ slave: true });
    expect([...offeredSlaveIds(m, DAY + 1)]).toEqual([14]);
  });

  it('otrok pokřtěný mezi zadáním a dnem kupců se neprodá – prodají se další dva', () => {
    const s = merchantsHost(2);
    s.people.find((p) => p.id === 10)!.faith = 'christian';
    expect([...offeredSlaveIds(s, DAY)]).toEqual([12, 14]);
    const m = advanceVillage(s, DAY, null, null, []);
    expect(m.coins).toBe(48);
    expect(m).not.toHaveProperty('slavesForSale');
    goneFromWorld(m, [12, 14]);
    expect(m.people.find((p) => p.id === 10)).toMatchObject({ slave: true, faith: 'christian' });
  });
});

describe('rezervace otroků z nabídky na trhu vsi (Rozhodnutí plánu 5, bod 8)', () => {
  it('bez nabídky by jako muž odešel otrok 12; s nabídkou 2 otroků nabízí ves otroky a muže 11', () => {
    const h = reservationHost();
    expect(leavingGroups(h, D, { men: 1 }).men.map((g) => g.people.map((p) => p.id))).toEqual([
      [12],
    ]);
    expect(marketStance(h, D).offer).toEqual({ fourWheelCarts: 1, families: 1, men: 2 });
    setSlavesForSale(h, 2);
    expect([...offeredSlaveIds(h, D)]).toEqual([10, 12]);
    expect(marketStance(h, D).offer).toEqual({ fourWheelCarts: 1, slaves: 2, men: 1 });
  });

  it('zápočet: výprava koupí za obilí 1 muže – odejde svobodný muž 11, otroci z nabídky zůstanou', () => {
    const h = reservationHost();
    setSlavesForSale(h, 2);
    joinMarket(h, D, trip({ grain: 400 }, { men: 1 }));
    marketDay(h, D);
    const visitor = visitorOf(h);
    expect(visitor.bought).toEqual({ men: 1 });
    expect(boughtIds(visitor)).toEqual([['men', [11]]]);
    expect(h.people.filter((p) => p.id === 10 || p.id === 12).map((p) => p.id)).toEqual([10, 12]);
    expect(h.slavesForSale).toBe(2);
  });

  it('mincovní fáze: výprava koupí za 24 mincí 1 muže – také 11, ne otrok z nabídky', () => {
    const h = reservationHost();
    setSlavesForSale(h, 2);
    joinMarket(h, D, trip({ coins: 30 }, { men: 1 }));
    marketDay(h, D);
    const visitor = visitorOf(h);
    expect([visitor.bought, visitor.goods]).toEqual([{ men: 1 }, { coins: 6 }]);
    expect(boughtIds(visitor)).toEqual([['men', [11]]]);
    expect(h.coins).toBe(24);
    expect(h.people.filter((p) => p.id === 10 || p.id === 12).map((p) => p.id)).toEqual([10, 12]);
    expect(h.slavesForSale).toBe(2);
  });

  it('rezervace platí celý den: po prodeji otrokyně 10 zápočtem mincovní fáze nikoho nového nerezervuje', () => {
    // otrok 14 dospělý (31) – mimo nabídku (nabídka 2 = 10 a 12) smí odejít jako muž; přepočet ze
    // vsi bez 10 by rezervoval 12 a 14 a jako muž by odešel 11
    const h = reservationHost();
    h.people.find((p) => p.id === 14)!.bornDay = D - Math.ceil(31.5 * 365.25);
    setSlavesForSale(h, 2);
    expect(marketStance(h, D).offer).toMatchObject({ slaves: 2, men: 2 });
    joinMarket(h, D, trip({ grain: 400 }, { slaves: 1 }, 'market:a:1'));
    joinMarket(h, D, trip({ coins: 30 }, { men: 1 }, 'market:b:1'));
    marketDay(h, D);
    expect(boughtIds(visitorOf(h, 'market:a:1'))).toEqual([['slaves', [10]]]);
    expect(boughtIds(visitorOf(h, 'market:b:1'))).toEqual([['men', [14]]]);
    expect(h.people.some((p) => p.id === 12)).toBe(true);
    expect(h.slavesForSale).toBe(1);
  });
});

describe('manžel otroka z nabídky není svobodný (Rozhodnutí plánu 5, bod 8; plán 3, bod 10)', () => {
  /**
   * `slaveFamilyHome(2)` s nabídkou 1 otroka – rezervace {90}: otrok 90 a otrokyně 91 jsou manželé
   * (odvedený pohanský pár) v přeplněném domě rodiny 500, svobodná žena 92 (20) bydlí v domě 501
   * u ženatého syna 66. Vdaná 91 jako žena neodejde, i když její muž je z nabídky – jde 92.
   */
  function couple(): VillageState {
    const s = slaveFamilyHome(2);
    for (const [id, spouseId] of [
      [90, 91],
      [91, 90],
    ] as const) {
      Object.assign(
        s.people.find((p) => p.id === id)!,
        { spouseId, dwellingId: FAMILY_HOUSE },
      );
    }
    s.people.push({
      id: 92,
      bornDay: D - Math.ceil(20.5 * 365.25),
      dwellingId: SON_HOUSE,
      sex: 'female',
    });
    expect(setSlavesForSale(s, 1)).toEqual({ ok: true });
    expect([...offeredSlaveIds(s, D)]).toEqual([90]);
    return s;
  }

  /** Id všech lidí skupin v pořadí výběru. */
  const flat = (groups: readonly { people: readonly Person[] }[]): number[] =>
    groups.flatMap((g) => g.people.map((p) => p.id));

  /** Manželé 90 a 91 jsou doma a vzájemně, nikdo jiný bez manžela. */
  function coupleHome(s: VillageState): void {
    expect(oneSidedSpouses(s)).toEqual([]);
    expect(s.people.filter((p) => p.id === 90 || p.id === 91).map((p) => p.spouseId)).toEqual([
      91, 90,
    ]);
  }

  it('nabídka hostitele: otrok 90 a jako žena 92, ne vdaná 91', () => {
    const s = couple();
    const reserved = offeredSlaveIds(s, D);
    const offer = marketStance(s, D, reserved).offer;
    expect(offer).toEqual({ fourWheelCarts: 1, slaves: 1, families: 1, women: 1 });
    expect(
      leavingGroups(s, D, offer, reserved).women.map((g) => g.people.map((p) => p.id)),
    ).toEqual([[92]]);
  });

  it('výprava správce s 1 ženou vezme 92 – po návratu žádné jednostranné manželství', () => {
    const s = couple();
    const reserved = offeredSlaveIds(s, D);
    const sent = departMarketInPlace(
      s,
      D,
      { give: { women: 1 }, wants: { grain: 100 }, stayDays: 1 },
      target,
      { by: 'steward', reserved },
    );
    if (!sent.ok) throw new Error(sent.reason);
    const body = s.outbox![0]!.body as { kind: 'market-arrive'; arrival: MarketArrival };
    const people = body.arrival.people ?? [];
    expect(people.map((g) => [g.good, flat([g])])).toEqual([['women', [92]]]);
    coupleHome(s);
    restorePeople(s, people);
    coupleHome(s);
    expect(s.people.some((p) => p.id === 92)).toBe(true);
  });

  it('leavingGroups + sendPeople + restorePeople: odejde a vrátí se 92, manželé zůstanou', () => {
    const s = couple();
    const leaving = emigrantList(leavingGroups(s, D, { women: 1 }, offeredSlaveIds(s, D)));
    expect(flat(leaving)).toEqual([92]);
    const out = sendPeople(s, leaving, 'E');
    coupleHome(s);
    restorePeople(s, out);
    coupleHome(s);
  });

  it('trh vsi – zápočet i mincovní fáze: výprava koupí 1 ženu – 92, ne vdaná 91', () => {
    for (const goods of [{ grain: 400 }, { coins: 30 }]) {
      const h = couple();
      joinMarket(h, D, trip(goods, { women: 1 }));
      marketDay(h, D);
      expect(boughtIds(visitorOf(h)), JSON.stringify(goods)).toEqual([['women', [92]]]);
      coupleHome(h);
    }
  });

  /**
   * `slaveFamilyHome(2)` s nabídkou 1 otroka – rezervace {90}: otrok 90 (25) je ženatý s dcerou 93
   * (17) rodiny 62 ∞ 63 a oba bydlí v domě jejích rodičů 500. Rodina 62 ∞ 63 s dětmi 64 a 65 smí
   * odejít (`familiesOf`); vdaná 93 s ní neodejde – zůstane doma jako každé vdané dítě.
   */
  function marriedDaughter(): VillageState {
    const s = slaveFamilyHome(2);
    Object.assign(
      s.people.find((p) => p.id === 90)!,
      { spouseId: 93, dwellingId: FAMILY_HOUSE },
    );
    s.people.push({
      id: 93,
      bornDay: D - Math.ceil(17.5 * 365.25),
      dwellingId: FAMILY_HOUSE,
      sex: 'female',
      motherId: 63,
      fatherId: 62,
      spouseId: 90,
    });
    expect(setSlavesForSale(s, 1)).toEqual({ ok: true });
    expect([...offeredSlaveIds(s, D)]).toEqual([90]);
    return s;
  }

  /** Dcera 93 je doma u muže 90 z nabídky, nikdo bez manžela. */
  function daughterHome(s: VillageState): void {
    expect(oneSidedSpouses(s)).toEqual([]);
    expect(s.people.find((p) => p.id === 93)).toMatchObject({ spouseId: 90 });
    expect(s.people.find((p) => p.id === 90)).toMatchObject({ spouseId: 93 });
  }

  it('trh vsi: výprava koupí rodinu 62 ∞ 63 s dětmi 64 a 65 – vdaná dcera 93 zůstane', () => {
    for (const goods of [{ grain: 3_000 }, { coins: 200 }]) {
      const h = marriedDaughter();
      joinMarket(h, D, trip(goods, { families: 1 }));
      marketDay(h, D);
      expect(boughtIds(visitorOf(h)), JSON.stringify(goods)).toEqual([
        ['families', [62, 63, 64, 65]],
      ]);
      daughterHome(h);
    }
  });

  it('výprava správce s 1 rodinou – dcera 93 zůstane, po návratu žádné jednostranné manželství', () => {
    const s = marriedDaughter();
    const sent = departMarketInPlace(
      s,
      D,
      { give: { families: 1 }, wants: { grain: 100 }, stayDays: 1 },
      target,
      { by: 'steward', reserved: offeredSlaveIds(s, D) },
    );
    if (!sent.ok) throw new Error(sent.reason);
    const body = s.outbox![0]!.body as { kind: 'market-arrive'; arrival: MarketArrival };
    const people = body.arrival.people ?? [];
    expect(people.map((g) => [g.good, flat([g])])).toEqual([['families', [62, 63, 64, 65]]]);
    daughterHome(s);
    restorePeople(s, people);
    daughterHome(s);
  });
});
