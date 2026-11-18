import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { DIET, meatEnergy } from '../../core/diet';
import { hungerSplit } from '../../people/hunger-groups';
import { WILDLIFE_LAND } from '../../rules/rules-wildlife';
import { freshWildlife } from '../../wildlife/wildlife';
import { advanceVillage } from '../../core/simulate';
import { summerWinterInput } from '../husbandry';
import {
  LIVESTOCK,
  slaughter,
  slaughterRemaining,
  winterKeepTargets,
  type WinterInput,
} from '../livestock';
import {
  freshMeatAheadEnergy,
  summerSlaughterCandidates,
  summerSlaughterDay,
} from '../summer-slaughter';
import type { HerdSpecies, VillageState } from '../../types';
import { withBuiltFirstDwelling, withRoomyPens } from '../../__tests__/village-fixtures';

// Porážka celý rok – léto (diet.md – Strava po vrstvách a porážka celý rok; Martin 18. 11. 2026:
// „kníže a nobilita chce mít maso na stole nejlépe každý den“): v létě se porazí jeden celý kus,
// jen když rodu vojvody na dnešek nestačí maso v zásobě – nejmenší, který potřebu pokryje, jinak
// největší; jen kusy, které by si ves 1. 11. nenechala, bez letošních mláďat (selata od 1. 9.)
// a nikdy pod chovné minimum.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

/** Co ves o zimě ví – bez pasáků (přes zimu jen chovný pár, nad ním vše na maso). */
const NO_HERDERS: WinterInput = { oxen: 0, hayKg: Infinity, herding: 0 };

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.meatKg = 0;
  s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
  withRoomyPens(s);
  return s;
}

/** Děti v prvním domě daného věku (let) – výrostci na pasení. */
function addChildren(s: VillageState, ages: readonly number[]): void {
  const home = s.people[0]!.dwellingId;
  for (const age of ages) {
    s.people.push({
      id: s.nextId++,
      bornDay: s.lastDay - Math.round(age * 365.25),
      dwellingId: home,
      sex: s.nextId % 2 === 0 ? 'male' : 'female',
    });
  }
}

/** Potřeba rodu vojvody na den (kg obilí – vrstva 1, skupina 0). */
const lordNeed = (s: VillageState, day: number): number => hungerSplit(s, day).needs[0] ?? 0;

describe('letní porážka pro rod vojvody', () => {
  const day = at(601, 6, 15);

  it('kníže má maso – porazí se nejmenší kus, který na potřebu rodu stačí', () => {
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 20, cow: 10 });
    s.livestock!.young = herds({});
    const need = lordNeed(s, day);
    // rodu chybí méně masa, než dá ovce – kráva by byla zbytečně velká
    expect(need).toBeGreaterThan(0);
    expect(need / DIET.meatEnergy).toBeLessThan(LIVESTOCK.meatKg.sheep);
    const candidates = summerSlaughterCandidates(s, day, NO_HERDERS);
    expect(candidates.sheep).toBeGreaterThanOrEqual(1);
    expect(candidates.cow).toBeGreaterThanOrEqual(1);
    summerSlaughterDay(s, day, NO_HERDERS);
    expect(s.livestock!.herds.sheep).toBeCloseTo(19, 9);
    expect(s.livestock!.herds.cow).toBeCloseTo(10, 9);
    expect(s.freshMeatKg).toBeCloseTo(LIVESTOCK.meatKg.sheep, 9);
    // kůže a hlášení pro scénu jako u každé porážky
    expect(s.livestock!.slaughtered).toEqual({ day, heads: { sheep: 1 } });
  });

  it('jen velký kus – porazí se celá kráva, co rod nesní, sní ostatní a zbytek se vyudí', () => {
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 2, cow: 10 });
    s.livestock!.young = herds({});
    summerSlaughterDay(s, day, NO_HERDERS);
    expect(s.livestock!.herds.cow).toBeCloseTo(9, 9);
    expect(s.livestock!.herds.sheep).toBeCloseTo(2, 9);
    expect(s.freshMeatKg).toBeCloseTo(LIVESTOCK.meatKg.cow, 9);
  });

  it('v simulaci: kráva pro rod – dnes se jí čerstvá, co se nesní, vyudí se', () => {
    const s = village(day - 1);
    // bez tůní – dnešní ryby by rodu maso daly (porážka se rozhoduje po práci dne)
    s.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand, waterHa: 0, pools: 0 }, 0);
    s.livestock!.herds = herds({ sheep: 2, cow: 20 });
    s.livestock!.young = herds({});
    const next = advanceVillage(s, day, null);
    // jedna kráva (a denní díl ročních ztrát), ovce jen chovný pár – zůstal
    expect(next.livestock!.herds.cow).toBeGreaterThan(18.9);
    expect(next.livestock!.herds.cow).toBeLessThan(19);
    expect(next.livestock!.herds.sheep).toBeGreaterThan(1.99);
    // dnes se jí čerstvé maso (ves je tu celá v dvorci – vrstva 1; po vrstvách dělí jídlo
    // `tierMeal`), zbytek krávy je uzený a čerstvé maso přes noc nezůstane
    expect(next.diet!.shares.freshMeat).toBeGreaterThan(0.5);
    expect(next.meatKg!).toBeGreaterThan(0);
    expect(next.meatKg!).toBeLessThan(LIVESTOCK.meatKg.cow);
    expect(next.freshMeatKg).toBeUndefined();
  });

  it('zásoba stačí – rod má na dnešek uzené maso, nic se neporáží', () => {
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 20, cow: 10 });
    s.meatKg = lordNeed(s, day) / DIET.meatEnergy + 0.1;
    summerSlaughterDay(s, day, NO_HERDERS);
    expect(s.livestock!.herds).toEqual(herds({ sheep: 20, cow: 10 }));
    expect(s.freshMeatKg ?? 0).toBe(0);
  });

  it('dnešní ryby se počítají – porážka se rozhoduje po práci dne, před jídlem', () => {
    // dva lidé v dvorci: polovinu masa rodu dá uzené, zbytek dnešní ryby z tůní
    const fishing = (fish: boolean): { before: VillageState; after: VillageState } => {
      const s = village(day - 1);
      s.people = s.people.slice(0, 2);
      s.livestock!.herds = herds({ sheep: 20, cow: 10 });
      s.livestock!.young = herds({});
      s.meatKg = (0.5 * lordNeed(s, day)) / DIET.meatEnergy;
      const land = WILDLIFE_LAND.defaultLand;
      s.wildlife = freshWildlife(fish ? { ...land } : { ...land, waterHa: 0, pools: 0 }, 0);
      return { before: s, after: advanceVillage(s, day, null) };
    };
    const caught = (r: { before: VillageState; after: VillageState }): number =>
      (r.after.wildlife!.smallGame?.year.meatKg ?? 0) -
      (r.before.wildlife!.smallGame?.year.meatKg ?? 0);
    const withFish = fishing(true);
    // ryby dnes pokryjí, co rodu po uzeném chybí – nic se neporáží
    expect(caught(withFish)).toBeGreaterThan(
      (0.5 * lordNeed(withFish.before, day)) / DIET.meatEnergy,
    );
    expect(withFish.after.livestock!.summerSlaughtered).toBeUndefined();
    expect(withFish.after.livestock!.herds.sheep).toBeGreaterThan(19.9);
    // bez ryb rodu maso chybí – ovce
    const noFish = fishing(false);
    expect(caught(noFish)).toBe(0);
    expect(noFish.after.livestock!.summerSlaughtered).toEqual({ sheep: 1 });
    expect(noFish.after.livestock!.herds.sheep).toBeLessThan(19.1);
  });

  it('podíl pasáků – stádo přes zimu úměrné stádu se letní porážkou nezmenší', () => {
    const april = at(601, 4, 1);
    const s = village(april);
    s.livestock!.herds = herds({ goat: 40 });
    s.livestock!.young = herds({});
    // pasáci uhlídali jen polovinu stáda – cíl zimy je úměrný stádu (`watchedShares`)
    s.livestock!.herding = { needDays: 100, watchedDays: 50 };
    const input = (d: number): WinterInput => summerWinterInput(s, d);
    const first = summerSlaughterCandidates(s, april, input(april));
    const keepFirst = winterKeepTargets(s, april, input(april));
    expect(first.goat).toBeGreaterThanOrEqual(1);
    for (let d = april; d <= at(601, 10, 31); d++) {
      s.meatKg = 0;
      delete s.freshMeatKg;
      summerSlaughterDay(s, d, () => input(d));
    }
    const end = at(601, 10, 31);
    expect(s.livestock!.summerSlaughtered?.goat ?? 0).toBeLessThanOrEqual(
      Math.floor(first.goat + 1e-9),
    );
    expect(s.livestock!.summerSlaughtered?.goat ?? 0).toBeGreaterThan(0);
    expect(winterKeepTargets(s, end, input(end)).goat).toBeCloseTo(keepFirst.goat, 9);
  });

  it('práce letní porážky 31. 10. se dodělá s porážkou 1. 11.', () => {
    const s = village(at(601, 10, 31));
    s.livestock!.herds = herds({ sheep: 20 });
    s.livestock!.young = herds({});
    s.livestock!.slaughterWork = null;
    summerSlaughterDay(s, at(601, 10, 31), NO_HERDERS);
    slaughter(s, at(601, 11, 1), { oxen: 0, hayKg: Infinity });
    expect(slaughterRemaining(s)).toBeGreaterThanOrEqual(
      LIVESTOCK.meatKg.sheep / LIVESTOCK.slaughterKgPerManDay - 1e-9,
    );
    expect(s.livestock!.summerSlaughtered).toBeUndefined();
  });

  it('jen v létě – v zimě a 31. 3. nic, 1. 4. a 31. 10. ano, 1. 11. nic', () => {
    const on = (d: number): number => {
      const s = village(d);
      s.livestock!.herds = herds({ sheep: 20 });
      s.livestock!.young = herds({});
      summerSlaughterDay(s, d, NO_HERDERS);
      return s.livestock!.summerSlaughtered?.sheep ?? 0;
    };
    expect(on(at(601, 1, 15))).toBe(0);
    expect(on(at(601, 3, 31))).toBe(0);
    expect(on(at(601, 4, 1))).toBe(1);
    expect(on(at(601, 10, 31))).toBe(1);
    expect(on(at(601, 11, 1))).toBe(0);
  });

  it('léto nevybije stádo – celé léto den co den nevezme víc než kandidáti 1. 4.', () => {
    const april = at(601, 4, 1);
    const s = village(april);
    // dost výrostků na pasení a ohrady bez meze – stádo přes zimu je stádo bez starých kusů
    // (do příštího léta nikdo z pasení nevyroste – místo pro mláďata se nezmenší stárnutím dětí)
    addChildren(s, [7, 7, 8, 8, 9, 9, 10, 10, 11, 11]);
    s.livestock!.herds = herds({ goat: 40, sheep: 30, cow: 12, pig: 30 });
    // bez letošních mláďat (selata od 1. 9. by šla navíc – hlídá test chovného minima)
    s.livestock!.young = herds({});
    const input: WinterInput = { oxen: 0, hayKg: Infinity };
    const first = summerSlaughterCandidates(s, april, input);
    const keepFirst = winterKeepTargets(s, april, input);
    expect(first.goat).toBeGreaterThanOrEqual(1);
    for (let d = april; d <= at(601, 10, 31); d++) {
      s.meatKg = 0;
      delete s.freshMeatKg;
      summerSlaughterDay(s, d, input);
    }
    const taken = s.livestock!.summerSlaughtered ?? {};
    for (const species of ['goat', 'sheep', 'cow', 'pig'] as const) {
      expect(taken[species] ?? 0).toBeLessThanOrEqual(Math.floor(first[species] + 1e-9));
      // stádo přes zimu se letní porážkou nezmenší
      expect(winterKeepTargets(s, at(601, 10, 31), input)[species]).toBeGreaterThanOrEqual(
        keepFirst[species] - 1e-9,
      );
    }
    expect(Object.values(taken).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0);
  });

  it('bez rodu ve vsi se v létě neporáží', () => {
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 20, cow: 10 });
    // vojvoda s rodinou pryč na práci (ne na výpravě) – doma nejedí
    const split = hungerSplit(s, day);
    for (const p of s.people) {
      if (split.groupOf.get(p.id) === 0) p.away = { kind: 'labor', untilDay: day + 30 };
    }
    expect(lordNeed(s, day)).toBe(0);
    summerSlaughterDay(s, day, NO_HERDERS);
    expect(s.livestock!.herds).toEqual(herds({ sheep: 20, cow: 10 }));
    expect(s.freshMeatKg ?? 0).toBe(0);
    expect(freshMeatAheadEnergy(s, day, 60, NO_HERDERS)).toBe(0);
  });

  it('chovné minimum a letošní mláďata zůstanou – selata smějí na maso od 1. 9.', () => {
    const august = at(601, 8, 15);
    const s = village(august);
    // nad chovným párem jen letošní mláďata
    s.livestock!.herds = herds({ sheep: 7, pig: 12 });
    s.livestock!.young = herds({ sheep: 5, pig: 10 });
    expect(summerSlaughterCandidates(s, august, NO_HERDERS)).toEqual(herds({}));
    summerSlaughterDay(s, august, NO_HERDERS);
    expect(s.livestock!.herds).toEqual(herds({ sheep: 7, pig: 12 }));
    // od 1. 9. selata první (jako nouzová porážka)
    const september = at(601, 9, 2);
    const t = village(september);
    t.livestock!.herds = herds({ sheep: 7, pig: 12 });
    t.livestock!.young = herds({ sheep: 5, pig: 10 });
    expect(summerSlaughterCandidates(t, september, NO_HERDERS).sheep).toBe(0);
    summerSlaughterDay(t, september, NO_HERDERS);
    expect(t.livestock!.herds.pig).toBeCloseTo(11, 9);
    expect(t.livestock!.young.pig).toBeCloseTo(9, 9);
    expect(t.livestock!.herds.sheep).toBeCloseTo(7, 9);
    expect(t.freshMeatKg).toBeCloseTo(LIVESTOCK.meatKg.pig, 9);
  });

  it('práce porážky a uzení i v létě', () => {
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 20 });
    s.livestock!.slaughterWork = null;
    summerSlaughterDay(s, day, NO_HERDERS);
    expect(slaughterRemaining(s)).toBeCloseTo(
      LIVESTOCK.meatKg.sheep / LIVESTOCK.slaughterKgPerManDay,
      9,
    );
  });

  it('výhled do sklizně počítá s masem pro rod – nejvýš kolik dají kusy na maso', () => {
    const s = village(day);
    s.livestock!.herds = herds({ sheep: 20 });
    s.livestock!.young = herds({});
    const need = lordNeed(s, day);
    // 30 dní výhledu – dnešek a 29 dní od zítřka
    expect(freshMeatAheadEnergy(s, day, 30, NO_HERDERS)).toBeCloseTo(need * 29, 9);
    // kusů na maso je málo – víc, než dají, výhled nečeká
    s.livestock!.herds = herds({ sheep: 3.5 });
    expect(summerSlaughterCandidates(s, day, NO_HERDERS).sheep).toBeCloseTo(1.5, 9);
    expect(freshMeatAheadEnergy(s, day, 300, NO_HERDERS)).toBeCloseTo(
      meatEnergy(LIVESTOCK.meatKg.sheep),
      9,
    );
    // nejvýš do konce letní porážky (31. 10.)
    s.livestock!.herds = herds({ sheep: 200 });
    const october = at(601, 10, 21);
    expect(freshMeatAheadEnergy(s, october, 300, NO_HERDERS)).toBeCloseTo(
      lordNeed(s, october) * 10,
      9,
    );
  });
});
