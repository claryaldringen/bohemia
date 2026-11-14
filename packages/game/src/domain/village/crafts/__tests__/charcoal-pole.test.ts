import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  charcoalCarryDay,
  fetchWalkManDays,
  mergeCarryDays,
  polePartner,
  type CharcoalCarryDay,
} from '../charcoal-pole';
import { basketManDaysPerKg, type CharcoalDelivery } from '../smith-supply';
import { SMITH_SUPPLY, WATER_FETCHING } from '../../rules';
import type { Person, VillageState, WorkshopActivity } from '../../types';

// Odnos uhlí na tyči (workshops.md – Uhlíř – odnos uhlí na tyči; Martin 14. 11. 2026): uhlíř nese
// košatinu s uhlím do kovárny se synem od 12 let, bez syna si dojde pro kováře nebo jeho syna.
// Práce odnosu se nemění, každý z dvojice nese polovinu.

const DAY = dayIndexOf({ year: 760, month: 5, day: 10 });
const BURNER = 50;
const SMITH = 51;
/** Uhlíř (40 let) a jeho žena; synové od id 502. */
const BURNER_HEAD = 500;
/** Kovář (36 let) a jeho žena; synové od id 512. */
const SMITH_HEAD = 510;

const person = (
  id: number,
  years: number,
  dwellingId: number,
  extra: Partial<Person> = {},
): Person => ({
  id,
  bornDay: DAY - Math.ceil(years * 365.25) - 10,
  dwellingId,
  ...extra,
});

/** Synové domácnosti (věky) – otec `head`, matka `head + 1`, id od `head + 2`. */
const sons = (head: number, dwellingId: number, ages: readonly number[]): Person[] =>
  ages.map((age, k) =>
    person(head + 2 + k, age, dwellingId, { sex: 'male', fatherId: head, motherId: head + 1 }),
  );

/** Uhlíř a kovář s manželkami a syny daných věků. */
function folk(burnerSons: number[] = [], smithSons: number[] = []): Pick<VillageState, 'people'> {
  return {
    people: [
      person(BURNER_HEAD, 40, BURNER, { sex: 'male' }),
      person(BURNER_HEAD + 1, 36, BURNER, { sex: 'female' }),
      ...sons(BURNER_HEAD, BURNER, burnerSons),
      person(SMITH_HEAD, 36, SMITH, { sex: 'male' }),
      person(SMITH_HEAD + 1, 30, SMITH, { sex: 'female' }),
      ...sons(SMITH_HEAD, SMITH, smithSons),
    ],
  };
}

/** Uhlíř dnes vytahal 120 kg z milíře 990, kovárna je 300 m chůze. */
const DELIVERY: CharcoalDelivery = {
  burnerId: BURNER,
  kilnId: 990,
  smithId: SMITH,
  kg: 120,
  at: { x: 70, z: 0 },
  walkM: 300,
};
const MAN_DAYS = 120 * basketManDaysPerKg(300, SMITH_SUPPLY.basketKg.charcoal);
const WORKING = new Map<number, WorkshopActivity>();
const NO_CARTS = { charcoal: [] };

const carry = (
  state: Pick<VillageState, 'people'>,
  options: {
    deliveries?: CharcoalDelivery[];
    carts?: { charcoal: { burnerId: number; kilnId?: number; kg: number }[] };
    resting?: ReadonlyMap<number, WorkshopActivity>;
    restingOnly?: boolean;
  } = {},
): CharcoalCarryDay =>
  charcoalCarryDay(
    state,
    DAY,
    options.deliveries ?? [DELIVERY],
    options.carts ?? NO_CARTS,
    options.resting ?? WORKING,
    options.restingOnly ?? false,
  );

describe('kdo nese s uhlířem (workshops.md – Uhlíř – odnos uhlí na tyči)', () => {
  it('napřed syn uhlíře – nejstarší z 12–13, jinak syn od 14', () => {
    expect(polePartner(folk([15, 12]), DAY, BURNER, SMITH)).toEqual({
      personId: BURNER_HEAD + 3,
      age: 12,
      dwellingId: BURNER,
      kind: 'burner-son',
    });
    expect(polePartner(folk([13, 12]), DAY, BURNER, SMITH)).toMatchObject({ age: 13 });
    expect(polePartner(folk([15]), DAY, BURNER, SMITH)).toMatchObject({
      kind: 'burner-son',
      age: 15,
    });
  });

  it('bez syna uhlíře syn kováře, jinak kovář', () => {
    expect(polePartner(folk([], [13]), DAY, BURNER, SMITH)).toEqual({
      personId: SMITH_HEAD + 2,
      age: 13,
      dwellingId: SMITH,
      kind: 'smith-son',
    });
    expect(polePartner(folk([], []), DAY, BURNER, SMITH)).toEqual({
      personId: SMITH_HEAD,
      age: 36,
      dwellingId: SMITH,
      kind: 'smith',
    });
  });

  it('syn pod 12 let nejde, kdo je pryč, taky ne', () => {
    // syn 11 tyč neunese – nese kovář
    expect(polePartner(folk([11], []), DAY, BURNER, SMITH)).toMatchObject({ kind: 'smith' });
    // syn 12 je na výjezdu – jde syn kováře
    const away = folk([12], [12]);
    away.people.find((p) => p.id === BURNER_HEAD + 2)!.away = { kind: 'journey' };
    expect(polePartner(away, DAY, BURNER, SMITH)).toMatchObject({ kind: 'smith-son' });
    // vrátil se – jde zase on
    away.people.find((p) => p.id === BURNER_HEAD + 2)!.away = { kind: 'journey', untilDay: DAY };
    expect(polePartner(away, DAY, BURNER, SMITH)).toMatchObject({ kind: 'burner-son' });
    // kovář pryč a synové nejsou – nikdo
    const alone = folk();
    alone.people.find((p) => p.id === SMITH_HEAD)!.away = { kind: 'campaign' };
    expect(polePartner(alone, DAY, BURNER, SMITH)).toBeNull();
  });

  it('cesta pro kováře – chůze od milíře ke kovárně rychlostí nošení', () => {
    expect(fetchWalkManDays(300)).toBeCloseTo(
      300 / SMITH_SUPPLY.carryMps / (WATER_FETCHING.dayHours * 3600),
      12,
    );
  });
});

describe('odnos dne (workshops.md – Uhlíř – odnos uhlí na tyči)', () => {
  it('se synem uhlíře 12–13: uhlíř svou polovinu z dílny, syn nepase', () => {
    const day = carry(folk([13]));
    expect(day.burners.get(BURNER)).toBeCloseTo(MAN_DAYS / 2, 12);
    expect(day.smiths.size).toBe(0);
    expect(day.busy).toEqual([BURNER_HEAD + 2]);
    expect(day.pairs).toHaveLength(1);
    expect(day.pairs[0]).toMatchObject({
      burnerId: BURNER,
      kilnId: 990,
      smithId: SMITH,
      at: { x: 70, z: 0 },
      kg: 120,
      burner: { personId: BURNER_HEAD, age: 40 },
      partner: { kind: 'burner-son', age: 13 },
      fetchWalk: 0,
    });
    expect(day.pairs[0]!.manDays).toBeCloseTo(MAN_DAYS, 12);
  });

  it('se synem uhlíře od 14 let: celé nošení z práce dílny uhlíře', () => {
    const day = carry(folk([15]));
    expect(day.burners.get(BURNER)).toBeCloseTo(MAN_DAYS, 12);
    expect(day.smiths.size).toBe(0);
    expect(day.busy).toEqual([]);
  });

  it('s kovářem: uhlíř svou polovinu a cestu pro něj, kovář polovinu z kovárny', () => {
    const day = carry(folk());
    expect(day.burners.get(BURNER)).toBeCloseTo(MAN_DAYS / 2 + fetchWalkManDays(300), 12);
    expect(day.smiths.get(SMITH)).toBeCloseTo(MAN_DAYS / 2, 12);
    expect(day.busy).toEqual([]);
    expect(day.pairs[0]).toMatchObject({ partner: { kind: 'smith', age: 36 } });
    expect(day.pairs[0]!.fetchWalk).toBeCloseTo(fetchWalkManDays(300), 12);
    // se synem kováře 12–13 platí kovárna nic – syn ten den nepase
    const son = carry(folk([], [12]));
    expect(son.burners.get(BURNER)).toBeCloseTo(MAN_DAYS / 2 + fetchWalkManDays(300), 12);
    expect(son.smiths.size).toBe(0);
    expect(son.busy).toEqual([SMITH_HEAD + 2]);
  });

  it('pro kováře jde uhlíř jednou za den, i když nosí ze dvou milířů', () => {
    const second: CharcoalDelivery = { ...DELIVERY, kilnId: 991, kg: 60, walkM: 400 };
    const day = carry(folk(), { deliveries: [DELIVERY, second] });
    expect(day.pairs.map((p) => p.fetchWalk)).toEqual([fetchWalkManDays(300), 0]);
    const both = MAN_DAYS + 60 * basketManDaysPerKg(400, SMITH_SUPPLY.basketKg.charcoal);
    expect(day.burners.get(BURNER)).toBeCloseTo(both / 2 + fetchWalkManDays(300), 12);
    expect(day.smiths.get(SMITH)).toBeCloseTo(both / 2, 12);
  });

  it('uhlí, které odveze vůz, nikdo nenese', () => {
    const all = carry(folk([13]), {
      carts: { charcoal: [{ burnerId: BURNER, kilnId: 990, kg: 120 }] },
    });
    expect(all).toEqual({ pairs: [], burners: new Map(), smiths: new Map(), busy: [] });
    // vůz odveze část – zbytek nese dvojice
    const part = carry(folk(), {
      carts: { charcoal: [{ burnerId: BURNER, kilnId: 990, kg: 90 }] },
    });
    expect(part.pairs[0]!.kg).toBe(30);
    expect(part.smiths.get(SMITH)).toBeCloseTo(MAN_DAYS / 8, 12);
  });

  it('odpočívající kovárna jen ve fázi před rozdělením práce vsi', () => {
    const resting = new Map<number, WorkshopActivity>([[SMITH, 'resting']]);
    expect(carry(folk(), { resting }).pairs).toEqual([]);
    const before = carry(folk(), { resting, restingOnly: true });
    expect(before.pairs).toHaveLength(1);
    expect(before.smiths.get(SMITH)).toBeCloseTo(MAN_DAYS / 2, 12);
    // pracující kovárna naopak jen po rozdělení práce
    expect(carry(folk(), { restingOnly: true }).pairs).toEqual([]);
    // obě fáze dohromady – práce sečtená, synové jednou
    const merged = mergeCarryDays(before, carry(folk([12]), { deliveries: [DELIVERY] }));
    expect(merged.pairs).toHaveLength(2);
    expect(merged.burners.get(BURNER)).toBeCloseTo(MAN_DAYS + fetchWalkManDays(300), 12);
  });

  it('bez druhého u tyče se nenese', () => {
    const alone = folk();
    alone.people.find((p) => p.id === SMITH_HEAD)!.away = { kind: 'campaign' };
    expect(carry(alone).pairs).toEqual([]);
    // uhlíř je pryč – nenese ani se synem
    const gone = folk([13]);
    gone.people.find((p) => p.id === BURNER_HEAD)!.away = { kind: 'journey' };
    expect(carry(gone).burners.size).toBe(0);
  });
});
