import { describe, expect, it } from 'vitest';
import { foundVillage } from '../../village/actions';
import { applyInboxDay, type VillageEvent } from '../../village/inbox';
import { isInjured, laborPerDay } from '../../village/people';
import { advanceVillage } from '../../village/simulate';
import { dynastyDay } from '../../village/succession';
import type { Cemetery, GrainPit, Person, VillageState } from '../../village/types';
import { DAY, dwelling, kin, trackedVillage, village } from '../../village/__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../village/__tests__/village-fixtures';
import { defenderRoster } from '../defenders';
import { pitFound } from '../flight';
import {
  applyCampaignReturn,
  applyRaidResult,
  lootCapacity,
  lootTotals,
  noLoot,
  raidLoot,
  woundDeathDayOf,
  woundDeathsDay,
  type RaidResult,
} from '../raid-apply';
import { WAR } from '../rules-war';
import type { ShelterReport } from '../stance';

// Výsledky nájezdu ve vsi a kořist (war.md – Ztráty, Kořist; plán 2026-11-03 – Úloha 6.10).

const none = (): Record<'sheep' | 'goat' | 'pig' | 'cow', number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
});

const herds = (): NonNullable<VillageState['livestock']> => ({
  herds: { sheep: 10, goat: 4, pig: 2, cow: 3 },
  young: { sheep: 2, goat: 0, pig: 0, cow: 1 },
});

const cemetery = (): Cemetery => ({
  id: 20,
  squares: [{ cell: { x: 4, y: -2 }, x: 67.5, z: -22.5, waterDistanceM: 100 }],
  squareSizeM: 15,
  graves: 0,
  builtDay: 0,
});

/** Napadená ves: šest dospělých, zásoby po druzích a stádo. */
function target(extra: Partial<VillageState> = {}): VillageState {
  const people = [1, 2, 3, 4, 5, 6].map((id) =>
    kin({ id, age: 30, sex: id % 2 === 1 ? 'male' : 'female' }),
  );
  return village(people, [dwelling(1)], {
    storesKg: 1000,
    legumesKg: 100,
    meatKg: 60,
    cheeseKg: 40,
    livestock: herds(),
    ...extra,
  });
}

/** Ves útočníka – jeden dům, dva lidé. */
function home(): VillageState {
  return village(
    [kin({ id: 1, age: 30, sex: 'male' }), kin({ id: 2, age: 30, sex: 'female' })],
    [dwelling(1), dwelling(2)],
    { storesKg: 200, livestock: { herds: none(), young: none() } },
  );
}

function result(extra: Partial<RaidResult> = {}): RaidResult {
  return {
    campaignId: 'c1',
    leader: 'Bořivoj',
    from: 'Lhota',
    target: 'Kněžice',
    declared: false,
    fallen: [],
    wounded: [],
    led: [],
    loot: noLoot(),
    pitsFound: [],
    ...extra,
  };
}

const shelter = (extra: Partial<ShelterReport> = {}): ShelterReport => ({
  stance: 'flee',
  refuge: [],
  forest: [],
  surrendered: [],
  carriedKg: 0,
  livestockRefuge: none(),
  livestockForest: none(),
  ...extra,
});

const loot = (
  v: VillageState,
  o: { shelter?: ShelterReport; refugeTaken?: boolean; capacityKg?: number; days?: number },
): ReturnType<typeof raidLoot> =>
  raidLoot({
    village: v,
    day: DAY,
    shelter: o.shelter,
    refugeTaken: o.refugeTaken ?? false,
    capacityKg: o.capacityKg ?? 1e9,
    seed: 7,
    daysInVillage: o.days ?? 0,
  });

const food = (v: VillageState): number[] => [
  v.storesKg,
  v.legumesKg ?? 0,
  v.meatKg ?? 0,
  v.cheeseKg ?? 0,
];

describe('kořist – bilance a nosnost (war.md – Kořist)', () => {
  it('co ubude obránci, přibude útočníkovi; nosnost 25 kg na muže s vlastními zásobami', () => {
    const capacity = lootCapacity(10, 50);
    expect(capacity).toBe(10 * WAR.carryKg.man - 50);
    const defender = target();
    const { loot: taken } = loot(defender, { capacityKg: capacity });
    expect(lootTotals(taken).foodKg).toBeCloseTo(capacity, 6);
    // po druzích ve stejném poměru, dobytek celý (není útočiště ani les)
    expect(taken.grainKg / taken.meatKg).toBeCloseTo(1000 / 60, 6);
    expect(taken.livestock).toEqual({ sheep: 12, goat: 4, pig: 2, cow: 4 });

    const before = food(defender);
    applyRaidResult(defender, DAY + 1, result({ loot: taken }));
    const lost = before.map((kg, i) => kg - food(defender)[i]!);
    const attacker = home();
    const had = food(attacker);
    applyCampaignReturn(attacker, DAY + 30, {
      campaignId: 'c1',
      back: [],
      wounded: [],
      fallen: [],
      loot: taken,
    });
    const gained = food(attacker).map((kg, i) => kg - had[i]!);
    gained.forEach((kg, i) => expect(kg).toBeCloseTo(lost[i]!, 9));
    expect(defender.livestock?.herds).toEqual(none());
    expect(defender.livestock?.young).toEqual(none());
    expect(attacker.livestock?.herds).toEqual({ sheep: 12, goat: 4, pig: 2, cow: 4 });
  });

  it('zásoby a dobytek v nedobytém útočišti a v lese zůstanou, z dobytého je vezme', () => {
    const v = target();
    const sh = shelter({
      refuge: [1, 2],
      carriedKg: 50,
      livestockRefuge: { sheep: 12, goat: 0, pig: 0, cow: 0 },
      livestockForest: { sheep: 0, goat: 4, pig: 0, cow: 0 },
    });
    const kept = loot(v, { shelter: sh }).loot;
    expect(kept.grainKg).toBeCloseTo(950, 9);
    expect(kept.livestock).toEqual({ sheep: 0, goat: 0, pig: 2, cow: 4 });
    const taken = loot(v, { shelter: sh, refugeTaken: true }).loot;
    expect(taken.grainKg).toBeCloseTo(1000, 9);
    expect(taken.livestock).toEqual({ sheep: 12, goat: 0, pig: 2, cow: 4 });
  });

  it('osivo zůstane; zapečetěná jáma je skrytá, nalezenou útočník vybere', () => {
    const pit = (): GrainPit => ({
      id: 50,
      x: 0,
      z: 0,
      capacityKg: 500,
      grainKg: 400,
      state: 'sealed',
      dugDay: 0,
      filledDay: 0,
    });
    const hidden = target({ reservedSeedKg: 100, grainPits: [pit()] });
    const first = loot(hidden, {});
    expect(first.pitsFound).toEqual([]);
    expect(first.loot.grainKg).toBeCloseTo(1000 - 100 - 400, 9);
    applyRaidResult(hidden, DAY + 1, result({ loot: first.loot }));
    expect(hidden.storesKg).toBeCloseTo(500, 9);
    expect(hidden.grainPits![0]).toMatchObject({ state: 'sealed', grainKg: 400 });

    // po dni ve vsi najde jámu s 30 % – seed, kde ji najde
    const seed = [...Array(100).keys()].find((s) => pitFound(s, 50, 2))!;
    const found = raidLoot({
      village: target({ grainPits: [pit()] }),
      day: DAY,
      shelter: undefined,
      refugeTaken: false,
      capacityKg: 1e9,
      seed,
      daysInVillage: 2,
    });
    expect(found.pitsFound).toEqual([50]);
    const v = target({ grainPits: [pit()] });
    applyRaidResult(v, DAY + 1, result({ loot: found.loot, pitsFound: found.pitsFound }));
    expect(v.storesKg).toBeCloseTo(0, 9);
    expect(v.grainPits![0]).toMatchObject({ state: 'empty', grainKg: 0 });
  });
});

describe('ztráty (war.md – Ztráty)', () => {
  it('padlí obránci zemřou a pohřbí se na hřbitově vsi', () => {
    const v = target({ cemeteries: [cemetery()] });
    const events = applyRaidResult(v, DAY + 1, result({ fallen: [1, 3] }));
    expect(v.people.map((p) => p.id)).toEqual([2, 4, 5, 6]);
    expect(v.cemeteries![0]!.graves).toBe(2);
    expect(events.filter((e) => e.kind === 'death')).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: 'raid', fallen: 2, wounded: 0, led: 0 });
  });

  it('padlý muž rodu obránců = smrt s nástupnictvím', () => {
    const v = lordVillage();
    const events = applyRaidResult(v, DAY + 1, result({ fallen: [10] }));
    expect(events).toContainEqual(
      expect.objectContaining({ kind: 'death', cause: 'war', name: 'Bořivoj', personId: 10 }),
    );
    dynastyDay(v, DAY + 1);
    expect(v.dynasty?.lordId).toBe(20);
  });

  it('padlý muž rodu útočníka (`line-man-fell`) = smrt s nástupnictvím, bez pohřbu', () => {
    const v = lordVillage();
    v.cemeteries = [cemetery()];
    v.people.find((p) => p.id === 10)!.away = { kind: 'campaign', refId: 'c1' };
    const event: VillageEvent = {
      id: 'e1',
      villageId: 'lhota',
      day: DAY + 1,
      seq: 1,
      body: { kind: 'line-man-fell', personId: 10, campaignId: 'c1' },
    };
    const chronicle = applyInboxDay(v, DAY + 1, [event]);
    expect(chronicle).toEqual([
      expect.objectContaining({ kind: 'death', cause: 'war', name: 'Bořivoj', personId: 10 }),
    ]);
    expect(v.cemeteries[0]!.graves).toBe(0);
    dynastyDay(v, DAY + 1);
    expect(v.dynasty?.lordId).toBe(20);
  });

  it('ranění 60 dní nepracují, necvičí ani nebojují', () => {
    const v = target();
    applyRaidResult(v, DAY + 1, result({ wounded: [1] }));
    const p = v.people.find((x) => x.id === 1)!;
    expect(p.woundedUntil).toBe(DAY + 1 + WAR.wounded.days);
    expect(isInjured(p, DAY + 60)).toBe(true);
    expect(laborPerDay(p, DAY + 60)).toBe(0);
    expect(defenderRoster(v, DAY + 60).some((d) => d.personId === 1)).toBe(false);
    expect(laborPerDay(p, DAY + 61)).toBeGreaterThan(0);
    expect(defenderRoster(v, DAY + 61).some((d) => d.personId === 1)).toBe(true);
  });

  it('1 z 5 raněných zemře do 30 dní – los ze seedu vsi a člověka, deterministický', () => {
    const rolls = Array.from({ length: 4000 }, (_, id) => woundDeathDayOf(3, id, 500));
    const deaths = rolls.filter((d): d is number => d !== null);
    expect(deaths.length / rolls.length).toBeGreaterThan(0.17);
    expect(deaths.length / rolls.length).toBeLessThan(0.23);
    expect(Math.min(...deaths)).toBe(500);
    expect(Math.max(...deaths)).toBe(500 + WAR.wounded.deathWithinDays - 1);
    expect(Array.from({ length: 4000 }, (_, id) => woundDeathDayOf(3, id, 500))).toEqual(rolls);
    // jiná ves – jiný los
    expect(Array.from({ length: 4000 }, (_, id) => woundDeathDayOf(4, id, 500))).not.toEqual(rolls);
  });

  it('kdo má zemřít na rány, zemře v ten den a pohřbí se', () => {
    const v = target({ cemeteries: [cemetery()] });
    v.people[0]!.woundDeathDay = DAY + 3;
    expect(woundDeathsDay(v, DAY + 2)).toEqual([]);
    expect(woundDeathsDay(v, DAY + 3)).toEqual([
      expect.objectContaining({ kind: 'death', cause: 'wounds' }),
    ]);
    expect(v.people.some((p) => p.id === 1)).toBe(false);
    expect(v.cemeteries![0]!.graves).toBe(1);
  });
});

describe('návrat tažení (applyCampaignReturn)', () => {
  it('muži zpět, ranění od dne zranění, padlí vesničané zemřou', () => {
    const v = home();
    for (const p of v.people) p.away = { kind: 'campaign', refId: 'c1' };
    v.people.push({
      ...kin({ id: 3, age: 25, sex: 'male' }),
      away: { kind: 'campaign', refId: 'c1' },
    });
    const events = applyCampaignReturn(v, DAY + 10, {
      campaignId: 'c1',
      back: [1, 2],
      wounded: [{ personId: 2, day: DAY + 4 }],
      fallen: [3],
    });
    expect(v.people.map((p) => [p.id, p.away])).toEqual([
      [1, undefined],
      [2, undefined],
    ]);
    expect(v.people[1]!.woundedUntil).toBe(DAY + 4 + WAR.wounded.days);
    expect(events).toEqual([expect.objectContaining({ kind: 'death', cause: 'war' })]);
  });

  it('odvedení přijdou jako noví vesničané s novými id, rodina spolu', () => {
    const led: Person[] = [
      kin({ id: 1, age: 30, sex: 'male', spouse: 2, home: 7 }),
      kin({ id: 2, age: 28, sex: 'female', spouse: 1, home: 7 }),
      kin({ id: 3, age: 6, sex: 'female', mother: 2, father: 1, home: 7 }),
      kin({ id: 4, age: 20, sex: 'male', home: 8 }),
    ];
    const v = home();
    v.nextId = 1000;
    applyCampaignReturn(v, DAY + 10, {
      campaignId: 'c1',
      back: [],
      wounded: [],
      fallen: [],
      people: led,
    });
    const arrivals = v.people.filter((p) => p.id >= 1000);
    expect(arrivals.map((p) => p.id)).toEqual([1000, 1001, 1003, 1002]);
    const byId = new Map(arrivals.map((p) => [p.id, p]));
    expect(byId.get(1000)!.spouseId).toBe(1001);
    expect(byId.get(1002)).toMatchObject({ motherId: 1001, fatherId: 1000 });
    // rodina do prázdného domu, dítě k ní; svobodný do domu s místem
    expect(byId.get(1000)!.dwellingId).toBe(2);
    expect(byId.get(1001)!.dwellingId).toBe(2);
    expect(byId.get(1002)!.dwellingId).toBe(2);
    expect(byId.get(1003)!.dwellingId).not.toBe(-1);
    expect(v.nextId).toBe(1004);
  });
});

describe('dopočet po kouscích', () => {
  const FOUNDED = 200;
  const start = withBuiltFirstDwelling(
    foundVillage({ seed: 11, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const ids = start.people.map((p) => p.id);
  const events: VillageEvent[] = [
    {
      id: 'r1',
      villageId: 'v1',
      day: start.lastDay + 3,
      seq: 1,
      body: {
        kind: 'raid-result',
        result: result({
          fallen: ids.slice(0, 1),
          wounded: ids.slice(1, 4),
          led: ids.slice(4, 5),
          loot: { ...noLoot(), grainKg: 100 },
        }),
      },
    },
  ];
  const end = start.lastDay + 40;
  const whole = advanceVillage(structuredClone(start), end, null, null, events);

  it('nájezd v kronice a lidé pryč', () => {
    expect(whole.chronicle).toContainEqual(expect.objectContaining({ kind: 'raid', fallen: 1 }));
    expect(whole.people.some((p) => p.id === ids[0] || p.id === ids[4])).toBe(false);
  });

  it.each([1, 3, 10])('po %i dnech = vcelku (stejný JSON)', (size) => {
    let chunked = structuredClone(start);
    while (chunked.lastDay < end) {
      const to = Math.min(end, chunked.lastDay + size);
      const due = events.filter((e) => e.day > chunked.lastDay && e.day <= to);
      chunked = advanceVillage(chunked, to, null, null, due);
    }
    expect(JSON.stringify(chunked)).toBe(JSON.stringify(whole));
  });
});

/** Ves rodu: vojvoda Bořivoj (10) s manželkou (11) a dospělým synem (20). */
function lordVillage(): VillageState {
  const v = trackedVillage([
    { id: 10, age: 45, sex: 'male', spouse: 11 },
    { id: 11, age: 40, sex: 'female', spouse: 10 },
    { id: 20, age: 20, sex: 'male', mother: 11, father: 10 },
  ]);
  v.people.find((p) => p.id === 10)!.name = 'Bořivoj';
  v.people.find((p) => p.id === 20)!.name = 'Ctibor';
  return v;
}
