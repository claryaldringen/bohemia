import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { isSingle } from '../../people/marriage';
import { populationDay } from '../../people/population';
import type {
  ChronicleEvent,
  MarketPerson,
  MarketResult,
  MarketTarget,
  Person,
  VillageMail,
  VillageState,
} from '../../types';
import { marketResultRef } from '../market';
import { receiveStranded, sendPeople } from '../market-people';
import { marketStance } from '../market-stance';
import { applyMarketResult, departMarket } from '../market-trip';
import { NO_PEOPLE, emigrantGroups } from '../people-trade';
import {
  D,
  SLAVE_HOUSE,
  SLAVE_HOUSE_2,
  familyHome,
  homeVillage,
  marketVillage,
  oneSidedSpouses,
  slaveHome,
  sownPart,
  target,
} from './market-fixtures';

// Otroci mezi vsemi (markets.md – Rozhodnutí plánu 5, body 6 a 9; Martin 26. 11. 2026: „Moc to
// řešíš. Otroci nejsou rodina, ale zboží“): výprava A (Vlkov) veze otroky na trh B (Lhota), kde
// stojí výprava C (Dubí) s mincemi. Otroci jdou dnešními cestami lidí na trhu (plán 3) – odchod,
// prodej, pošta, návrat i zaniklé vsi – a prodej rozvede manželství jako smrt. Pošta jde po každém
// dni jako události schránky.

/** Ves světa testu: stav, den, od kterého se počítají porody a úmrtí, a zprávy ve schránce. */
interface Side {
  id: string;
  state: VillageState;
  since: number;
  inbox: VillageEvent[];
}

/** Svět tří vsí a pošta mezi nimi. */
interface World {
  sides: Side[];
  /** Všechny zprávy, které pošta doručila (po přesměrování). */
  posted: VillageMail[];
  seq: number;
}

/** Přesměrování zprávy poštou – zaniklá domovská ves (`goneHome`). */
type Reroute = (mail: VillageMail) => VillageMail;

/** Cíl výpravy z C (Dubí): Lhota (B) na sousední mapě na západě. */
const FROM_C: MarketTarget = {
  villageId: 'm',
  name: 'Lhota',
  cells: 1,
  firstStep: 'W',
  homeVillageId: 'c',
  homeName: 'Dubí',
};

/** Pošta: odchozí schránku vsi `from` zapíše do schránek cílových vsí a smaže ji. */
function deliver(world: World, from: Side, reroute: Reroute = (mail) => mail): void {
  for (const sent of from.state.outbox ?? []) {
    const mail = reroute(sent);
    const to = world.sides.find((s) => s.id === mail.villageId);
    if (!to) throw new Error(`ves ${mail.villageId} chybí`);
    world.posted.push(mail);
    to.inbox.push({
      id: mail.ref,
      seq: ++world.seq,
      villageId: mail.villageId,
      day: mail.day,
      body: mail.body,
    });
  }
  delete from.state.outbox;
}

/** Den světa: každá ves se dopočítá na `day` se zprávami do dne, pak se doručí její pošta. */
function worldDay(world: World, day: number, reroute?: Reroute): void {
  for (const side of world.sides) {
    const due = side.inbox.filter((e) => e.day <= day);
    side.inbox = side.inbox.filter((e) => e.day > day);
    const before = side.state.lastDay;
    side.state = advanceVillage(
      side.state,
      day,
      null,
      null,
      due.map((e) => ({ ...e, day: Math.max(e.day, before + 1) })),
    );
    deliver(world, side, reroute);
  }
}

/** Svět vsí `states` (A, B a případně C); odchozí schránky po odchodu výprav se hned doručí. */
function worldOf(states: { id: string; state: VillageState }[]): World {
  const world: World = {
    sides: states.map(({ id, state }) => ({ id, state, since: state.lastDay, inbox: [] })),
    posted: [],
    seq: 0,
  };
  for (const side of world.sides) deliver(world, side);
  return world;
}

/** Lidé na cestě: v nedoručených zprávách a na trzích (náklad výprav i koupení). */
function onTheWay(world: World): number {
  let n = 0;
  const count = (groups: readonly MarketPerson[] | undefined): void => {
    for (const g of groups ?? []) n += g.people.length;
  };
  for (const side of world.sides) {
    for (const { body } of side.inbox) {
      if (body.kind === 'market-arrive') count(body.arrival.people);
      if (body.kind === 'market-result') {
        count(body.result.people);
        count(body.result.newcomers);
      }
      if (body.kind === 'stranded-people') {
        count(body.people);
        count(body.own);
      }
    }
    for (const v of side.state.market?.visitors ?? []) {
      count(v.people);
      count(v.boughtPeople);
    }
  }
  return n;
}

/** Lidé světa (ve vsích a na cestě) bez porodů a úmrtí – nikdo nevznikne ani nezmizí. */
function headcount(world: World): number {
  let n = onTheWay(world);
  for (const { state, since } of world.sides) {
    n += state.people.length;
    for (const e of state.chronicle) {
      if (e.day <= since) continue;
      if (e.kind === 'birth') n -= 1;
      if (e.kind === 'death') n += 1;
    }
  }
  return n;
}

/** Výsledek trhu výpravy `key`, jak ho pošta doručila. */
function resultOf(world: World, key: string): MarketResult {
  const mail = world.posted.find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`výsledek ${key} chybí`);
  return mail.body.result;
}

/**
 * Zaniklá domovská ves `home`: výsledek s lidmi nebo mincemi jde zpět k hostiteli jako
 * `stranded-people` – týž tvar jako `strandedMail` v application/village-mail.ts (`own` = skupiny,
 * které prodal sám hostitel, `people` = ostatní, `coins` = měšec, `from` = `origin`).
 */
function goneHome(home: string, hostId: string): Reroute {
  return (mail) => {
    if (mail.villageId !== home || mail.body.kind !== 'market-result') return mail;
    const { result } = mail.body;
    const newcomers = result.newcomers ?? [];
    const own = newcomers.filter((g) => g.fromHost === true);
    const coins = result.unsold.coins ?? 0;
    return {
      villageId: hostId,
      day: mail.day,
      ref: `${mail.ref}:back`,
      body: {
        kind: 'stranded-people',
        key: result.key,
        people: [...(result.people ?? []), ...newcomers.filter((g) => g.fromHost !== true)],
        ...(own.length > 0 ? { own } : {}),
        ...(coins > 0 ? { coins } : {}),
        from: result.origin,
      },
    };
  };
}

/** Člověk `id` ve vsi. */
function person(s: VillageState, id: number): Person | undefined {
  return s.people.find((p) => p.id === id);
}

/**
 * A (`slaveHome`) s ženatými otroky: otrokyně 10 (25) ∞ svobodný pohan 15 (20, přestěhovaný do
 * domu 500 k ní) a otrok 12 (28, doma) ∞ svobodná 18 (26, dům 501). Prodat jde 10, 12 a 14.
 */
function marriedSlaveHome(): VillageState {
  const s = slaveHome();
  person(s, 10)!.spouseId = 15;
  Object.assign(person(s, 15)!, { spouseId: 10, dwellingId: SLAVE_HOUSE });
  const twelve = person(s, 12)!;
  delete twelve.away;
  twelve.spouseId = 18;
  s.people.push({
    id: 18,
    bornDay: D - Math.ceil(26.5 * 365.25),
    dwellingId: SLAVE_HOUSE_2,
    sex: 'female',
    spouseId: 12,
  });
  return s;
}

/** Lhota (B), která lidi shání: půdy víc než práce (200 osetých dílů), obilí nad pojistkou. */
function peopleHost(): VillageState {
  const m = marketVillage();
  m.fields = [{ id: 1 }];
  m.parts = Array.from({ length: 200 }, (_, i) => sownPart(100 + i));
  m.storesKg = 0;
  m.storesKg = marketStance(m, D).wants.grain! + 2_000;
  return m;
}

/**
 * Výprava A s otroky `give` na trh B a výprava C s 30 mincemi a seznamem `{ slaves: 1 }` (bez C,
 * když `withBuyer` chybí); svět po odchodu obou výprav.
 */
function slaveMarket(
  a: VillageState,
  b: VillageState,
  order: { give: { slaves: number }; wants?: { grain: number } },
  withBuyer = true,
): { world: World; keyA: string; keyC: string } {
  const sentA = departMarket(a, D, { wants: {}, ...order, stayDays: 1 }, target);
  if (!sentA.ok) throw new Error(sentA.reason);
  const states = [
    { id: 'h', state: sentA.state },
    { id: 'm', state: b },
  ];
  let keyC = '';
  if (withBuyer) {
    const c = homeVillage();
    c.coins = 30;
    const sentC = departMarket(
      c,
      D,
      { give: { coins: 30 }, wants: { slaves: 1 }, stayDays: 1 },
      FROM_C,
    );
    if (!sentC.ok) throw new Error(sentC.reason);
    states.push({ id: 'c', state: sentC.state });
    keyC = sentC.trip.key;
  }
  return { world: worldOf(states), keyA: sentA.trip.key, keyC };
}

describe('otroci mezi vsemi – trh, pošta a zaniklé vsi (markets.md – Rozhodnutí plánu 5, bod 9)', () => {
  it('C koupí od výpravy A otrokyni za 24 mincí; druhý otrok se vrátí do A; nikdo nezmizí', () => {
    const a = slaveHome();
    const people = a.people.length + marketVillage().people.length + homeVillage().people.length;
    const { world, keyA, keyC } = slaveMarket(a, marketVillage(), { give: { slaves: 2 } });
    const [h, m, c] = world.sides as [Side, Side, Side];
    expect(headcount(world)).toBe(people);
    const cNext = c.state.nextId;
    for (let day = D + 1; day <= D + 3; day++) {
      worldDay(world, day);
      expect(headcount(world), `den D + ${day - D}`).toBe(people);
      for (const side of world.sides) expect(oneSidedSpouses(side.state)).toEqual([]);
    }
    // na trhu: C koupila první skupinu otroků výpravy A (otrokyni 10) za mince
    const fromA = resultOf(world, keyA);
    expect(fromA).toMatchObject({
      sold: { slaves: 1 },
      bought: {},
      unsold: { slaves: 1, coins: 24 },
      coinsGot: 24,
    });
    expect(fromA.people!.map((g) => [g.good, g.people.map((p) => p.id)])).toEqual([
      ['slaves', [14]],
    ]);
    const fromC = resultOf(world, keyC);
    expect(fromC).toMatchObject({ bought: { slaves: 1 }, unsold: { coins: 6 }, coinsPaid: 24 });
    expect(fromC.newcomers).toEqual([
      { good: 'slaves', people: [expect.objectContaining({ id: 10, slave: true })] },
    ]);
    // C: otrokyně s novým id (za `nextId` C před trhem), kronika s Lhotou; z 30 mincí zbylo 6
    const bought = c.state.people.filter((p) => p.id >= cNext && p.slave === true);
    expect(bought).toEqual([
      expect.objectContaining({ sex: 'female', bornDay: person(a, 10)!.bornDay, origin: 'W' }),
    ]);
    expect(c.state.coins).toBe(6);
    expect(c.state.chronicle).toContainEqual(
      expect.objectContaining({
        kind: 'newcomer',
        group: 'slave',
        people: 1,
        villageName: 'Lhota',
        villageId: 'm',
        direction: 'W',
        female: true,
      }),
    );
    // A: neprodaný otrok zpět s původním id, prodaná pryč, 24 mincí
    expect(person(h.state, 14)).toMatchObject({ slave: true, bornDay: person(a, 14)!.bornDay });
    expect(person(h.state, 10)).toBeUndefined();
    expect(h.state.coins).toBe(24);
    type Returned = Extract<ChronicleEvent, { kind: 'market-returned' }>;
    const back = h.state.chronicle.find((e): e is Returned => e.kind === 'market-returned')!;
    expect(back).toMatchObject({
      sold: { slaves: 1 },
      bought: { coins: 24 },
      unsold: { slaves: 1 },
    });
    // B: otroci jen prošli – nikdo nový
    expect(m.state.people.some((p) => p.slave === true)).toBe(false);
  });

  it('hostitel, který lidi shání, otroky nekoupí – oba se vrátí s původními id', () => {
    const b = peopleHost();
    expect(marketStance(b, D).wants.families).toBeGreaterThan(0);
    expect(marketStance(b, D).wants.slaves).toBeUndefined();
    const a = slaveHome();
    const { world, keyA } = slaveMarket(
      a,
      b,
      { give: { slaves: 2 }, wants: { grain: 720 } },
      false,
    );
    const [h, m] = world.sides as [Side, Side];
    const people = headcount(world);
    for (let day = D + 1; day <= D + 2; day++) {
      worldDay(world, day);
      expect(headcount(world)).toBe(people);
    }
    const result = resultOf(world, keyA);
    expect(result.sold).toEqual({});
    expect(result.unsold).toEqual({ slaves: 2 });
    for (const id of [10, 14]) {
      expect(person(h.state, id)).toMatchObject({ slave: true, bornDay: person(a, id)!.bornDay });
    }
    expect(m.state.people.some((p) => p.slave === true)).toBe(false);
  });

  it('zanikne C s otrokyní na cestě: stranded-people – usadí se u B jako otrokyně s novým id', () => {
    const a = slaveHome();
    const { world, keyC } = slaveMarket(a, marketVillage(), { give: { slaves: 2 } });
    const [, m] = world.sides as [Side, Side];
    const people = headcount(world);
    const mNext = m.state.nextId;
    const gone = goneHome('c', 'm');
    for (let day = D + 1; day <= D + 3; day++) {
      worldDay(world, day, gone);
      expect(headcount(world)).toBe(people);
    }
    const back = world.posted.find((mail) => mail.ref === `${marketResultRef(keyC)}:back`);
    expect(back?.body).toMatchObject({
      kind: 'stranded-people',
      people: [{ good: 'slaves', people: [expect.objectContaining({ id: 10 })] }],
      coins: 6,
    });
    expect(back?.body).not.toHaveProperty('own');
    // otrokyně z výpravy A je u B cizí – nové id, ne návrat (`fromHost` nemá)
    const settled = m.state.people.filter((p) => p.id >= mNext && p.slave === true);
    expect(settled).toEqual([
      expect.objectContaining({ sex: 'female', bornDay: person(a, 10)!.bornDay }),
    ]);
    const newcomer = m.state.chronicle.find((e) => e.kind === 'newcomer');
    expect(newcomer).toMatchObject({
      group: 'slave',
      villageName: 'Dubí',
      villageId: 'c',
      female: true,
      coins: 6,
    });
    expect(newcomer).not.toHaveProperty('returned');
  });
});

describe('prodej otroka rozvede manželství jako smrt (markets.md – Rozhodnutí plánu 5, bod 6)', () => {
  /**
   * A s ženatými otroky pošle 10 a 12 na trh B, kde je nikdo nekoupí: stav po odchodu, lidé
   * v příjezdu, A hned po použití výsledku (`applyMarketResult` jako schránka, bez kroků dne –
   * sňatků) a A ve světě po dni návratu.
   */
  function unsoldTrip(): {
    sent: VillageState;
    arrival: MarketPerson[];
    returned: VillageState;
    home: VillageState;
  } {
    const { world, keyA } = slaveMarket(
      marriedSlaveHome(),
      marketVillage(),
      { give: { slaves: 2 } },
      false,
    );
    const [h] = world.sides as [Side];
    const sent = structuredClone(h.state);
    const arrive = world.posted.find((mail) => mail.body.kind === 'market-arrive')!;
    const arrival = arrive.body.kind === 'market-arrive' ? (arrive.body.arrival.people ?? []) : [];
    worldDay(world, D + 1);
    const returned = structuredClone(h.state);
    applyMarketResult(returned, D + 2, resultOf(world, keyA));
    worldDay(world, D + 2);
    return { sent, arrival, returned, home: h.state };
  }

  it('ženatý otrok se neprodá: žena je hned vdova, on se vrátí bez manžela', () => {
    const { sent, arrival, returned, home } = unsoldTrip();
    expect(arrival.map((g) => [g.good, g.people.map((p) => p.id)])).toEqual([
      ['slaves', [10]],
      ['slaves', [12]],
    ]);
    // odchod: manželé ve vsi ovdoví a smějí se znovu oženit a vdát
    expect(person(sent, 18)).not.toHaveProperty('spouseId');
    expect(isSingle(sent, person(sent, 18)!, D)).toBe(true);
    expect(person(sent, 15)).not.toHaveProperty('spouseId');
    expect(isSingle(sent, person(sent, 15)!, D)).toBe(true);
    expect(oneSidedSpouses(sent)).toEqual([]);
    // na cestě i po návratu bez manžela – s původním id, dál otrok
    for (const g of arrival) expect(g.people[0]).not.toHaveProperty('spouseId');
    const twelve = person(returned, 12)!;
    expect(twelve).toMatchObject({ slave: true, bornDay: person(slaveHome(), 12)!.bornDay });
    expect(twelve).not.toHaveProperty('spouseId');
    expect(isSingle(returned, twelve, D + 2)).toBe(true);
    expect(oneSidedSpouses(returned)).toEqual([]);
    // sňatek se po návratu neobnoví – ve vsi se smějí oženit a vdát znovu, jen vzájemně
    expect(person(home, 12)!.spouseId).not.toBe(18);
    expect(oneSidedSpouses(home)).toEqual([]);
  });

  it('vdaná otrokyně se neprodá: vrátí se bez manžela a s bývalým mužem nerodí', () => {
    const { returned, home } = unsoldTrip();
    // porody: bez `spouseId` jí `populationDay` otce nenajde – ani v jiném domě (vedlejší manželka)
    const later = structuredClone(returned);
    for (let day = D + 3; day <= D + 3 + 4 * 365; day++) populationDay(later, day, 1);
    expect(later.people.filter((p) => p.motherId === 10 && p.bornDay > D)).toEqual([]);
    const ten = person(returned, 10)!;
    expect(ten).toMatchObject({ slave: true, bornDay: person(slaveHome(), 10)!.bornDay });
    expect(ten).not.toHaveProperty('spouseId');
    expect(isSingle(returned, ten, D + 2)).toBe(true);
    expect(person(returned, 15)).not.toHaveProperty('spouseId');
    expect(oneSidedSpouses(returned)).toEqual([]);
    expect(person(home, 10)!.spouseId).not.toBe(15);
    expect(oneSidedSpouses(home)).toEqual([]);
  });

  it('sendPeople: kopie otroka bez manžela, žena vdova; receiveStranded ho vrátí bez manžela', () => {
    const h = marriedSlaveHome();
    const twelve = person(h, 12)!;
    const sold = sendPeople(
      h,
      [{ kind: 'slave', dwellingId: SLAVE_HOUSE_2, people: [twelve] }],
      'E',
    );
    expect(sold).toEqual([{ good: 'slaves', people: [expect.objectContaining({ id: 12 })] }]);
    expect(sold[0]!.people[0]).not.toHaveProperty('spouseId');
    // vstup se nemění; žena ve vsi je vdova
    expect(twelve.spouseId).toBe(18);
    expect(person(h, 18)).not.toHaveProperty('spouseId');
    // ves kupujícího zanikla – otrok hostitele se vrátí s původním id, bez manžela
    receiveStranded(h, D + 3, {
      key: 'k',
      people: [],
      own: sold.map((g) => ({ ...g, fromHost: true as const })),
      from: { villageId: 'c', villageName: 'Dubí', direction: 'E' },
    });
    expect(person(h, 12)).toMatchObject({ slave: true });
    expect(person(h, 12)).not.toHaveProperty('spouseId');
    expect(person(h, 18)).not.toHaveProperty('spouseId');
    expect(oneSidedSpouses(h)).toEqual([]);
  });

  it('oneSidedSpouses: výjimka jen pro vedlejší manželku, jiné jednostranné manželství najde', () => {
    const s = slaveHome();
    // vedlejší manželka 13 (otrokyně) muže rodu 1, jehož hlavní manželka je 19 – v pořádku
    const main = (id: number): Person => ({
      id,
      bornDay: D - Math.ceil(30.5 * 365.25),
      dwellingId: person(s, 1)!.dwellingId,
      sex: 'female',
      spouseId: 1,
    });
    s.people.push(main(19));
    person(s, 1)!.spouseId = 19;
    expect(oneSidedSpouses(s)).toEqual([]);
    // žena se `spouseId` na muže rodu bez hlavní manželky, ten míří na nikoho
    delete person(s, 1)!.spouseId;
    expect(oneSidedSpouses(s)).toEqual([13, 19]);
    // žena se `spouseId` na muže bez `line`, který ukazuje jinam
    const t = slaveHome();
    t.people.push(main(20));
    person(t, 20)!.spouseId = 15;
    expect(oneSidedSpouses(t)).toEqual([20]);
  });

  it('prodej vedlejší manželky: vrátí se bez manžela, hlavní manželství zůstane vzájemné', () => {
    const h = slaveHome();
    h.people.push({
      id: 19,
      bornDay: D - Math.ceil(30.5 * 365.25),
      dwellingId: person(h, 1)!.dwellingId,
      sex: 'female',
      spouseId: 1,
    });
    person(h, 1)!.spouseId = 19;
    expect(oneSidedSpouses(h)).toEqual([]);
    const wife = person(h, 13)!;
    const sold = sendPeople(
      h,
      [{ kind: 'slave', dwellingId: wife.dwellingId, people: [wife] }],
      'E',
    );
    expect(sold[0]!.people[0]).not.toHaveProperty('spouseId');
    expect(person(h, 1)!.spouseId).toBe(19);
    expect(oneSidedSpouses(h)).toEqual([]);
    receiveStranded(h, D + 3, {
      key: 'k',
      people: [],
      own: sold.map((g) => ({ ...g, fromHost: true as const })),
      from: { villageId: 'c', villageName: 'Dubí', direction: 'E' },
    });
    expect(person(h, 13)).toMatchObject({ slave: true });
    expect(person(h, 13)).not.toHaveProperty('spouseId');
    expect(oneSidedSpouses(h)).toEqual([]);
  });

  it('sendPeople: muž ze skupiny `men` si `spouseId` mimo skupinu podrží (mazání je jen u otroků)', () => {
    const s = familyHome();
    // muž z rodiny (62 ∞ 63) odchází sám jako skupina `men` – žena 63 ve skupině není
    const husband = person(s, 62)!;
    const sent = sendPeople(
      s,
      [{ kind: 'man', dwellingId: husband.dwellingId, people: [husband] }],
      'E',
    );
    expect(sent[0]!.good).toBe('men');
    expect(sent[0]!.people[0]!.spouseId).toBe(63);
  });

  it('rodina a svobodní beze změny: manželé v rodině si `spouseId` nechají', () => {
    const s = familyHome();
    const groups = emigrantGroups(s, D, { ...NO_PEOPLE, families: 1, men: 1 });
    const sent = sendPeople(s, [...groups.families, ...groups.men], 'E');
    const records = [...groups.families, ...groups.men].map((g) => structuredClone(g.people));
    expect(sent.map((g) => g.people)).toEqual(records);
    expect(sent[0]!.people.filter((p) => p.spouseId !== undefined).map((p) => p.id)).toEqual([
      62, 63,
    ]);
  });
});
