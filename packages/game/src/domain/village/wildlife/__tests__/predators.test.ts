import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import {
  dailyEggsKg,
  ensureLivestock,
  herdLosses,
  LIVESTOCK,
  villageChickens,
} from '../../livestock/livestock';
import { foxEggFactor } from '../fox-eggs';
import { predationDay, wolfDailyKeep } from '../predators';
import { WILDLIFE_LAND } from '../../rules/rules-wildlife';
import type { ChronicleEvent, HerdSpecies, VillageState } from '../../types';
import { freshWildlife } from '../wildlife';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const SPECIES: HerdSpecies[] = ['sheep', 'goat', 'pig', 'cow'];

function village(wolves: number | null, bear = false): VillageState {
  const day = at(600, 1, 1);
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  const livestock = ensureLivestock(s);
  livestock.herds = { sheep: 100, goat: 100, pig: 100, cow: 100 };
  livestock.young = { sheep: 0, goat: 0, pig: 0, cow: 0 };
  if (wolves !== null) {
    s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 100);
    s.wildlife.wolves = wolves;
    s.wildlife.bear = { present: bear, backDay: null };
  }
  return s;
}

/** Rok dnů od `from`; po jednom dni (herdLosses + predationDay) nebo v dávkách. */
function run(s: VillageState, from: number, days: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  for (let d = from; d < from + days; d++) {
    herdLosses(s);
    events.push(...predationDay(s, d));
  }
  return events;
}

describe('šelmy na dobytku', () => {
  it('rok s 5 vlky = dosavadní roční ztráty (12 / 10 / 12 / 6 %)', () => {
    const s = village(5);
    run(s, at(600, 1, 1), 365);
    const old = { sheep: 0.12, goat: 0.1, pig: 0.12, cow: 0.06 };
    for (const sp of SPECIES) expect(s.livestock!.herds[sp]).toBeCloseTo(100 * (1 - old[sp]), 6);
  });

  it('ves bez údajů o zvěři má plnou smečku', () => {
    const s = village(null);
    run(s, at(600, 1, 1), 365);
    expect(s.livestock!.herds.sheep).toBeCloseTo(88, 6);
  });

  it('bez vlků jsou ztráty menší, jen základ', () => {
    const s = village(0);
    run(s, at(600, 1, 1), 365);
    expect(s.livestock!.herds.sheep).toBeCloseTo(91, 6);
    expect(s.livestock!.herds.pig).toBeCloseTo(100 * (1 - LIVESTOCK.lossPerYear.pig), 6);
  });

  it('ovce, kozy a skot v zimě bez vlčího dílu, prasata ne', () => {
    expect(wolfDailyKeep('sheep', 5, 1)).toBe(1);
    expect(wolfDailyKeep('goat', 5, 12)).toBe(1);
    expect(wolfDailyKeep('cow', 5, 3)).toBe(1);
    expect(wolfDailyKeep('sheep', 5, 4)).toBeLessThan(1);
    expect(wolfDailyKeep('pig', 5, 1)).toBeLessThan(1);
  });

  it('vlčí díl se mění s počtem vlků (2,5 vlka = polovina)', () => {
    const s = village(2.5);
    run(s, at(600, 1, 1), 365);
    // základ 9 % + polovina 3 % = 10,5 % (v součinech zhruba)
    expect(s.livestock!.herds.sheep).toBeGreaterThan(88.4);
    expect(s.livestock!.herds.sheep).toBeLessThan(90);
  });

  it('kronika nese celé kusy a zlomky zůstávají v akumulátoru', () => {
    const s = village(5);
    const events = run(s, at(600, 1, 1), 365);
    const kills = events.filter((e) => e.kind === 'predator-kill');
    expect(kills.length).toBeGreaterThan(0);
    for (const e of kills) {
      if (e.kind === 'predator-kill') expect(Number.isInteger(e.heads)).toBe(true);
    }
    const sheep = kills.reduce(
      (n, e) => n + (e.kind === 'predator-kill' && e.species === 'sheep' ? e.heads : 0),
      0,
    );
    const p = s.wildlife!.predation!;
    // ≈ 3 % ze stáda, které se po základních ztrátách zmenšuje (3,3 % z ≈ 97 ovcí)
    expect(sheep + p.acc.sheep).toBeGreaterThan(2.5);
    expect(sheep + p.acc.sheep).toBeLessThan(3.4);
    expect(p.acc.sheep).toBeLessThan(1);
    expect(p.yearHeads.sheep).toBe(sheep);
    expect(p.killDays.every((d) => d > at(600, 1, 1) + 365 - 31)).toBe(true);
  });

  it('medvěd vezme 2 prasata za sezónu (duben–listopad)', () => {
    const withBear = village(0, true);
    const without = village(0, false);
    const events = run(withBear, at(600, 1, 1), 365);
    run(without, at(600, 1, 1), 365);
    const diff = without.livestock!.herds.pig - withBear.livestock!.herds.pig;
    expect(diff).toBeGreaterThan(1.9);
    expect(diff).toBeLessThan(2.1);
    const bearHeads = events.reduce(
      (n, e) => n + (e.kind === 'predator-kill' && e.by === 'bear' ? e.heads : 0),
      0,
    );
    expect(bearHeads + (withBear.wildlife!.predation!.bearAcc ?? 0)).toBeCloseTo(2, 6);
  });

  it('medvěd bere jen z prasat nad chovný pár: stádo 2 prasat přežije, 3 prasata ztratí nejvýš 1', () => {
    const two = village(0, true);
    const calm = village(0, false);
    for (const v of [two, calm]) v.livestock!.herds.pig = 2;
    run(two, at(600, 1, 1), 365);
    run(calm, at(600, 1, 1), 365);
    expect(two.livestock!.herds.pig).toBeCloseTo(calm.livestock!.herds.pig, 9);
    expect(two.wildlife!.predation?.bearAcc ?? 0).toBe(0);
    const three = village(0, true);
    const calm3 = village(0, false);
    for (const v of [three, calm3]) v.livestock!.herds.pig = 3;
    run(three, at(600, 1, 1), 365);
    run(calm3, at(600, 1, 1), 365);
    const lost = calm3.livestock!.herds.pig - three.livestock!.herds.pig;
    expect(lost).toBeGreaterThan(0.5);
    expect(lost).toBeLessThanOrEqual(1);
  });

  it('kronika šelem po měsících: poslední den měsíce, nejvýš jedna událost za druh a šelmu', () => {
    const s = village(5, true);
    const events = run(s, at(600, 1, 1), 366); // 600 je přestupný – do 31. 12. včetně
    const kills = events.filter((e) => e.kind === 'predator-kill');
    expect(kills.length).toBeGreaterThan(0);
    // 12 měsíců × (4 druhy + medvěd) je strop, denně by bylo řádově víc
    expect(kills.length).toBeLessThanOrEqual(12 * 5);
    const keys = new Set<string>();
    for (const e of kills) {
      if (e.kind !== 'predator-kill') continue;
      const date = dateOfDayIndex(e.day);
      expect(dateOfDayIndex(e.day + 1).month).not.toBe(date.month);
      const key = `${e.day}:${e.by}:${e.species}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
      expect(e.heads).toBeGreaterThanOrEqual(1);
    }
    // součet kusů v kronice = kusy za rok minus to, co čeká na konec posledního měsíce (nic: 31. 12.)
    const sheep = kills.reduce(
      (n, e) =>
        n + (e.kind === 'predator-kill' && e.species === 'sheep' && e.by === 'wolf' ? e.heads : 0),
      0,
    );
    expect(sheep).toBe(s.wildlife!.predation!.yearHeads.sheep);
    expect(s.wildlife!.predation!.monthHeads).toBeUndefined();
  });

  it('medvěd v zimě prasata nebere', () => {
    const s = village(0, true);
    run(s, at(600, 12, 1), 90);
    expect(s.wildlife!.predation!.bearAcc ?? 0).toBe(0);
  });

  it('po kouscích je stav stejný (1, 7, 30 dní, celý rok)', () => {
    const whole = village(4, true);
    run(whole, at(600, 1, 1), 365);
    for (const chunk of [1, 7, 30]) {
      const s = village(4, true);
      let done = 0;
      while (done < 365) {
        const n = Math.min(chunk, 365 - done);
        run(s, at(600, 1, 1) + done, n);
        done += n;
      }
      expect(s.livestock).toEqual(whole.livestock);
      expect(s.wildlife!.predation).toEqual(whole.wildlife!.predation);
    }
  });
});

describe('liška na vejcích', () => {
  it('3 lišky ubírají 6 %, strop 8 %, bez zvěře beze změny', () => {
    const base = village(null);
    const three = village(5);
    three.wildlife!.land = { forestHa: 200, openHa: 100, waterHa: 2, pools: 1 };
    expect(foxEggFactor(three.wildlife)).toBeCloseTo(0.94, 9);
    expect(dailyEggsKg(three) / dailyEggsKg(base)).toBeCloseTo(0.94, 9);
    expect(dailyEggsKg(base)).toBeCloseTo(
      (villageChickens(base) * LIVESTOCK.eggsKgPerHen) / 365,
      9,
    );
    const many = village(5);
    many.wildlife!.land = { forestHa: 900, openHa: 900, waterHa: 2, pools: 1 };
    expect(foxEggFactor(many.wildlife)).toBeCloseTo(0.92, 9);
  });
});
