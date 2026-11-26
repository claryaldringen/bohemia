import { describe, expect, it } from 'vitest';
import type { VillageEvent } from '../../core/inbox';
import { advanceVillage } from '../../core/simulate';
import { isSingle } from '../../people/marriage';
import { populationDay } from '../../people/population';
import type {
  MarketPerson,
  MarketResult,
  MarketTarget,
  Person,
  VillageMail,
  VillageState,
} from '../../types';
import { marketResultRef } from '../market';
import { receiveStranded, sendPeople } from '../market-people';
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

/** Výsledek trhu výpravy `key`, jak ho pošta doručila. */
function resultOf(world: World, key: string): MarketResult {
  const mail = world.posted.find((m) => m.ref === marketResultRef(key));
  if (mail?.body.kind !== 'market-result') throw new Error(`výsledek ${key} chybí`);
  return mail.body.result;
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
