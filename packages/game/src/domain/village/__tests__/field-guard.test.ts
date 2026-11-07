import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { cloneState } from '../clone';
import { patrolHuntDay, patrolOfDay, riderPatrol, settlePatrol } from '../field-patrol';
import { allocateDay } from '../labor';
import type { DayTask } from '../simulate-plan';
import { updateLordTraining } from '../lord';
import { FIELD_GUARD } from '../rules-wildlife';
import { advanceVillage } from '../simulate';
import { dayTaskOrder } from '../simulate-work';
import type { CropWork, Person, VillageState } from '../types';
import { emptyHunt } from '../hunt';
import { freshWildlife, withWildlife } from '../wildlife';
import {
  dailyThreatShare,
  damageWindowStart,
  payWatch,
  watchWanted,
  wildlifeDamageDay,
} from '../wildlife-damage';
import { seasonCrops } from '../year-plan';
import { horse, horseVillage, LORD_ID, SON_ID, START, YOUTH_ID } from './horse-fixtures';
import { dwelling } from './kin-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Obrana polí (wildlife.md – Obrana polí): jezdecká hlídka objížďkou polí, noční hlídka vesničanů
// (staří a výrostci napřed, dospělí z práce vsi nad ně), úlovek z hlídky, determinismus po kouscích.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const JUNE = at(600, 6, 1);
const OUTSIDE = 500;

function cerealsOf(s: VillageState): CropWork[] {
  return seasonCrops(s.season!)
    .filter(({ crop }) => crop === 'winter' || crop === 'spring')
    .map(({ work }) => work);
}

/**
 * Ves 1. 6. 600 s dvorcem vojvody (vojvoda, syn 16, chlapec 10) na `horses` vycvičených koních,
 * 12 oseté dílů po `areaM2` (u lesa, zvěř na stropu) a `dogs` psech.
 */
function guardVillage(horses: number, dogs: number, areaM2 = 5000): VillageState {
  const parts = Array.from({ length: 12 }, (_, i) => ({
    areaM2,
    distanceM: 50 + i * 10,
    naturalFertility: 70,
    surface: 'meadow' as const,
    obstacleCost: 0,
  }));
  let s = withBuiltFirstDwelling(
    foundVillage({
      seed: 42,
      day: at(599, 8, 20),
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
      firstField: {
        outline: [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
        parts,
      },
    }),
  );
  s.constructions = [];
  s.storesKg = 20_000;
  s.parts.forEach((p) => {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
  });
  s = advanceVillage(s, JUNE - 1, null);
  cerealsOf(s).forEach((w) => (w.done.sow = w.required.sow));
  // dvorec a koně z fixtury, posunuté o rok (věk ke dni 1. 6. 600 = věk fixtury)
  const list = Array.from({ length: horses }, (_, i) => ({
    ...horse(1 + i, 8, 'male', 100),
    riderId: [LORD_ID, SON_ID, YOUTH_ID][i],
  }));
  const h = horseVillage(horses > 0 ? list : null, 2, 0);
  const delta = START - JUNE;
  const manor = s.dwellings[0]!.id;
  s.people = h.people.map((p) => ({
    ...p,
    bornDay: p.bornDay - delta,
    dwellingId: manor,
    ...(p.sex === 'male' ? { arms: { bow: 85, combat: 85, riding: 85 } } : {}),
  }));
  s.manorId = manor;
  s.pens = (h.pens ?? []).map((pen) => ({
    ...pen,
    builtDay: (pen.builtDay ?? START) - delta,
    horses: (pen.horses ?? []).map((x) => ({ ...x, bornDay: x.bornDay - delta })),
  }));
  s.horsesCaredToday = 1;
  s.horsesFed = true;
  s.lastDay = JUNE - 1;
  s.wildlife = undefined;
  s = withWildlife(s, null);
  const w = s.wildlife!;
  w.boar = { adults: 4, piglets: 4 };
  w.deer = { stags: 2, hinds: 5, calves: 3 };
  if (dogs > 0) w.dogs = { count: dogs, fed: true };
  // dospělí mimo rodinu – bez nich by rodina necvičila (lord.md – Zakládání vsi)
  addVillagers(s, 6, 0, 0);
  updateLordTraining(s, JUNE);
  return s;
}

/** Hodně zvěře – hrozba dílů přes 10 % i u malé vsi. */
function bigGame(s: VillageState): void {
  s.wildlife!.boar = { adults: 40, piglets: 40 };
  s.wildlife!.deer = { stags: 20, hinds: 40, calves: 20 };
}

/** Dospělí z obce (mimo dvorec) a `elders` starých + `youngsters` výrostků navíc. */
function addVillagers(s: VillageState, adults: number, elders: number, youngsters: number): void {
  if (!s.dwellings.some((d) => d.id === OUTSIDE)) {
    s.dwellings.push({ ...dwelling(OUTSIDE), position: { x: 30, z: 0, rotation: 0 } });
  }
  let id = 200 + s.people.length;
  const add = (years: number): void => {
    const p: Person = {
      id: id++,
      bornDay: JUNE - Math.ceil(years * 365.25) - 10,
      dwellingId: OUTSIDE,
      sex: 'male',
    };
    s.people.push(p);
  };
  for (let i = 0; i < adults; i++) add(26 + i);
  for (let i = 0; i < elders; i++) add(50 + i);
  for (let i = 0; i < youngsters; i++) add(8 + (i % 5));
}

describe('jezdecká hlídka (wildlife.md – Jezdecká hlídka)', () => {
  it('vojvoda a syn se 3 psy ≈ 55 %, se třemi jezdci strop 60 %', () => {
    const two = guardVillage(2, 3);
    updateLordTraining(two, JUNE);
    const cut2 = riderPatrol(two, JUNE).cut;
    expect(cut2).toBeGreaterThan(0.45);
    expect(cut2).toBeLessThan(0.6);
    const three = guardVillage(3, 3);
    updateLordTraining(three, JUNE);
    expect(riderPatrol(three, JUNE).cut).toBeCloseTo(FIELD_GUARD.rider.max, 9);
  });

  it('bez psů míň; bez koní, v listopadu a na poli (hlad) nic', () => {
    const dogs = guardVillage(2, 3);
    const none = guardVillage(2, 0);
    updateLordTraining(dogs, JUNE);
    updateLordTraining(none, JUNE);
    expect(riderPatrol(none, JUNE).cut).toBeLessThan(riderPatrol(dogs, JUNE).cut);
    expect(riderPatrol(guardVillage(0, 3), JUNE).cut).toBe(0);
    expect(riderPatrol(dogs, at(600, 11, 5)).cut).toBe(0);
    dogs.lord!.field = { since: JUNE, reason: 'hunger' };
    expect(riderPatrol(dogs, JUNE).cut).toBe(0);
  });

  it('hlídka sníží denní hrozbu dílů o svůj podíl', () => {
    const s = guardVillage(2, 3);
    damageWindowStart(s, JUNE, null);
    const guarded = dailyThreatShare(s, JUNE);
    const bare = cloneState(s);
    bare.pens = [];
    const open = dailyThreatShare(bare, JUNE);
    const cut = riderPatrol(s, JUNE).cut;
    expect(cut).toBeGreaterThan(0.4);
    for (const [id, share] of open) {
      expect(guarded.get(id)!).toBeCloseTo(share * (1 - cut), 9);
    }
    expect(open.size).toBeGreaterThan(0);
  });

  it('úlovek z hlídky: za léto jedno až dvě prasata a maso do zásoby', () => {
    const s = guardVillage(2, 3);
    for (let day = JUNE; day < at(600, 11, 1); day += 1) {
      updateLordTraining(s, day);
      patrolHuntDay(s, day);
    }
    const year = s.wildlife!.hunt!.year;
    expect(year.boar).toBeGreaterThanOrEqual(1);
    expect(year.boar).toBeLessThanOrEqual(3);
    expect(year.meatKg).toBeGreaterThan(0);
    expect(year.days).toBe(0);
    expect(s.meatKg ?? 0).toBeGreaterThanOrEqual(year.meatKg);
  });
});

describe('noční hlídka (wildlife.md – Noční hlídka vesničanů)', () => {
  it('staří a výrostci napřed: díly nad 10 % hlídají zdarma, práce vsi nic', () => {
    const s = guardVillage(0, 0);
    addVillagers(s, 0, 4, 8);
    damageWindowStart(s, JUNE, null);
    const watch = s.wildlife!.watch!;
    expect(watch.guards).toEqual({ elders: 4, youngsters: 8 });
    expect(watch.parts.length).toBeGreaterThan(0);
    // 12 hlídačů × 5 ha = 60 ha kryje všech 6 ha dílů (12 × 0,5 ha)
    expect(watch.parts.every((p) => p.free === 1 && !p.adult)).toBe(true);
    expect(watchWanted(s, JUNE)).toBe(0);
    // škoda hlídaného dílu −60 %, vrány celé
    const bare = cloneState(s);
    delete bare.wildlife!.watch;
    const a = dailyThreatShare(s, JUNE);
    const b = dailyThreatShare(bare, JUNE);
    const id = watch.parts[0]!.partId;
    expect(a.get(id)!).toBeLessThan(b.get(id)! * 0.45);
  });

  it('díl pod 10 % hrozby nehlídá nikdo', () => {
    const s = guardVillage(0, 0);
    addVillagers(s, 0, 4, 8);
    s.wildlife!.boar = { adults: 0, piglets: 0 };
    s.wildlife!.deer = { stags: 0, hinds: 0, calves: 0 };
    damageWindowStart(s, JUNE, null);
    expect(s.wildlife!.watch).toBeUndefined();
  });

  it('nedostatek starých a výrostků: dospělí hlídají jen zbytek, 0,3 čd na 5 ha za noc', () => {
    const s = guardVillage(0, 0, 100_000);
    bigGame(s);
    addVillagers(s, 0, 1, 1);
    damageWindowStart(s, JUNE, null);
    const watch = s.wildlife!.watch!;
    expect(watch.guards).toEqual({ elders: 1, youngsters: 1 });
    expect(watch.parts.some((p) => p.free > 0)).toBe(true);
    expect(watch.parts.some((p) => p.adult)).toBe(true);
    const ha = watch.parts.filter((p) => p.adult).reduce((sum, p) => sum + p.ha * (1 - p.free), 0);
    expect(watchWanted(s, JUNE)).toBeCloseTo((ha / 5) * 0.3, 9);
    // největší hrozba napřed – první díl má pokrytí aspoň jako ostatní
    const frees = watch.parts.map((p) => p.free);
    expect(frees).toEqual([...frees].sort((x, y) => y - x));
  });

  it('dospělí bez práce: pokrytí < 1 zvedne škodu oproti plné hlídce', () => {
    const s = guardVillage(0, 0, 100_000);
    bigGame(s);
    addVillagers(s, 0, 1, 1);
    damageWindowStart(s, JUNE, null);
    const wanted = watchWanted(s, JUNE);
    const full = cloneState(s);
    const none = cloneState(s);
    payWatch(full, JUNE, wanted, wanted);
    payWatch(none, JUNE, wanted, 0);
    const sum = (m: Map<number, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
    const withFull = sum(dailyThreatShare(full, JUNE));
    const withNone = sum(dailyThreatShare(none, JUNE));
    expect(withFull).toBeLessThan(withNone);
    expect(full.wildlife!.watch!.paidManDays).toBeCloseTo(wanted, 9);
    expect(none.wildlife!.watch!.paidManDays).toBe(0);
  });

  it('v žních soupeří se sklizní: s plnou sklizní hlídka dospělých práci nedostane', () => {
    const base = { capacity: 5, householdElders: [], potteryCoverage: 0 } as const;
    const harvest = { name: 'harvest', remaining: 10 } as const;
    const watch = { name: 'watch', remaining: 0.6 } as const;
    const busy = allocateDay({ ...base, tasks: [harvest, watch].map((t) => ({ ...t })) });
    expect(busy.tasks.watch).toBe(0);
    expect(busy.tasks.harvest).toBeGreaterThan(0);
    const quiet = allocateDay({ ...base, tasks: [{ ...watch }] });
    expect(quiet.tasks.watch).toBeCloseTo(0.6, 9);
  });

  it('dospělí hlídají celé okno, pokrytí 1 – práce se zapíše do letošního součtu', () => {
    const s = guardVillage(0, 0, 100_000);
    bigGame(s);
    addVillagers(s, 0, 1, 1);
    const run = advanceVillage(cloneState(s), at(600, 8, 25), null);
    const watch = run.wildlife!.watch!;
    expect(watch.wantedManDays).toBeGreaterThan(20);
    expect(watch.paidManDays).toBeLessThanOrEqual(watch.wantedManDays + 1e-9);
  });

  it('po kouscích: dopočet v jednom kuse = po dnech', () => {
    const s = guardVillage(2, 3, 100_000);
    bigGame(s);
    addVillagers(s, 0, 1, 1);
    s.lastDay = JUNE - 1;
    const whole = advanceVillage(cloneState(s), at(600, 8, 31), null);
    let chunked = cloneState(s);
    for (let d = JUNE; d <= at(600, 8, 31); d += 7) {
      chunked = advanceVillage(chunked, Math.min(d + 6, at(600, 8, 31)), null);
    }
    expect(chunked.wildlife!.damage!.totalKg).toBeCloseTo(whole.wildlife!.damage!.totalKg, 6);
    expect(chunked.wildlife!.hunt?.year).toEqual(whole.wildlife!.hunt?.year);
    expect(freshWildlife).toBeDefined();
    expect(wildlifeDamageDay).toBeDefined();
  });
});

describe('opravy hlídky po recenzi (W6)', () => {
  it('lovec a zraněný jezdec hlídku nejedou (nepočítají se do síly)', () => {
    const base = guardVillage(2, 3);
    const full = riderPatrol(base, JUNE);
    expect(full.power).toBeGreaterThan(0);
    const hunting = cloneState(base);
    const horseId = hunting.pens![0]!.horses!.find((x) => x.riderId === LORD_ID)!.id;
    hunting.wildlife!.hunt = {
      ...(hunting.wildlife!.hunt ?? emptyHunt()),
      today: {
        day: JUNE,
        target: 'game',
        riders: [{ personId: LORD_ID, horseId }],
        foot: [],
        extra: false,
      },
    };
    expect(riderPatrol(hunting, JUNE).power).toBeLessThan(full.power);
    const hurt = cloneState(base);
    hurt.people.find((p) => p.id === LORD_ID)!.injuredUntilDay = JUNE + 30;
    expect(riderPatrol(hurt, JUNE).power).toBeLessThan(full.power);
    // lovec není hlídkou dvakrát: škoda i úlovek berou z téhož dne stejnou hodnotu
    settlePatrol(hunting, JUNE);
    expect(patrolOfDay(hunting, JUNE)).toMatchObject(riderPatrol(hunting, JUNE));
  });

  it('hlídka dne se spočte jednou: pozdější zranění ji nezmění', () => {
    const s = guardVillage(2, 3);
    settlePatrol(s, JUNE);
    const before = patrolOfDay(s, JUNE);
    s.people.find((p) => p.id === LORD_ID)!.injuredUntilDay = JUNE + 30;
    expect(patrolOfDay(s, JUNE)).toEqual(before);
    expect(riderPatrol(s, JUNE).power).toBeLessThan(before.power);
    // jiný den se spočte znovu
    expect(patrolOfDay(s, JUNE + 1)).toEqual(riderPatrol(s, JUNE + 1));
  });

  it('plán hlídačů nezávisí na jezdcích dne 1. 6.', () => {
    const riding = guardVillage(2, 3, 100_000);
    const walking = guardVillage(0, 3, 100_000);
    for (const s of [riding, walking]) {
      bigGame(s);
      addVillagers(s, 0, 1, 1);
      damageWindowStart(s, JUNE, null);
    }
    const plan = (s: VillageState): unknown =>
      s.wildlife!.watch!.parts.map((p) => [p.partId, p.threat, p.adult]);
    expect(plan(riding)).toEqual(plan(walking));
  });

  it('nutná seč má před hlídkou dospělých přednost', () => {
    const task = (name: string, tie: number): DayTask =>
      ({ name, remaining: 1, end: Infinity, tie, rank: 1 }) as DayTask;
    const order = [task('watch', 4), task('mow', 3)].sort(dayTaskOrder).map((t) => t.name);
    expect(order).toEqual(['mow', 'watch']);
  });
});
