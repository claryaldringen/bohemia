import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { DIET, villageFoodNeed } from '../diet';
import { winterHayKg } from '../hay';
import { herdingDemand, youngsterHerders } from '../herding';
import { winterHayNeedKg } from '../husbandry';
import {
  LIVESTOCK,
  breedingFloor,
  cullingMeatKg,
  freshMeatPerDayKg,
  nextSummerDay,
  retiringHeads,
  slaughter,
  slaughterRemaining,
  wantedWinterHerds,
  winterSlaughterDay,
  winterWait,
  winterWaitHayKg,
} from '../livestock';
import { advanceVillage } from '../simulate';
import type { HerdSpecies, VillageState } from '../types';
import { woolSheep } from '../wool';
import { withBuiltFirstDwelling, withRoomyPens } from './village-fixtures';

// Porážka v zimě (diet.md – Porážka v zimě; Martin 19. 10. 2026): 1. 11. ves rozhodne, co nechá
// přes zimu (nosnost, místo pro jarní mláďata podle výrostků příštího léta, bez starých kusů),
// kusy na maso porazí po dnech přes zimu podle čerstvé spotřeby a jen přebytek udí.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 7, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.meatKg = 0;
  s.livestock!.land = { meadowHa: 1000, forestHa: 1000 };
  // ohrady všech druhů – stáda neomezí místa na noc (oxen.md – Ohrady podle druhu)
  withRoomyPens(s);
  return s;
}

/** Děti v prvním domě, které budou mít v den `day` daný věk (let). */
function addChildren(s: VillageState, ages: readonly number[], day: number): void {
  const home = s.people[0]!.dwellingId;
  for (const age of ages) {
    s.people.push({
      id: s.nextId++,
      bornDay: day - Math.round(age * 365.25),
      dwellingId: home,
      sex: s.nextId % 2 === 0 ? 'male' : 'female',
    });
  }
}

/** Stádo, které ves nechala přes zimu – bez kusů čekajících na zimní porážku. */
function kept(s: VillageState): Record<HerdSpecies, number> {
  const h = s.livestock!.herds;
  const c = s.livestock!.culling;
  return herds({
    sheep: h.sheep - (c?.sheep ?? 0),
    goat: h.goat - (c?.goat ?? 0),
    pig: h.pig - (c?.pig ?? 0),
    cow: h.cow - (c?.cow ?? 0),
  });
}

const grown = (h: Record<HerdSpecies, number>): Record<HerdSpecies, number> =>
  herds({
    sheep: h.sheep * (1 + LIVESTOCK.growth.sheep),
    goat: h.goat * (1 + LIVESTOCK.growth.goat),
    pig: h.pig * (1 + LIVESTOCK.growth.pig),
    cow: h.cow * (1 + LIVESTOCK.growth.cow),
  });

describe('porážka 1. 11. – co ves nechá přes zimu', () => {
  const day = at(600, 11, 1);

  it('výrostky příštího léta odhadne z věku dnešních dětí', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    // dnes 13,5 let (příští léto už 14) a 6,5 let (příští léto 7)
    addChildren(s, [13.5, 13.5], day);
    addChildren(s, [6.5, 6.5, 6.5], day);
    expect(youngsterHerders(s, day)).toBeCloseTo(2 * 0.4, 9);
    expect(nextSummerDay(day)).toBe(at(601, 7, 1));
    expect(youngsterHerders(s, nextSummerDay(day))).toBeCloseTo(3 * 0.4, 9);
    // před jarními mláďaty je příští léto letos
    expect(nextSummerDay(at(601, 3, 10))).toBe(at(601, 7, 1));
  });

  it('stádo přes zimu nechá místo pro jarní mláďata – kolik uhlídají výrostci příštího léta', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    addChildren(s, [13.5, 13.5], day);
    addChildren(s, [6.5, 6.5, 6.5], day);
    s.livestock!.herds = herds({ pig: 120, sheep: 150, goat: 10, cow: 12 });
    s.livestock!.young = herds({ pig: 60, sheep: 50, goat: 4, cow: 3 });
    slaughter(s, day, { oxen: 0, hayKg: Infinity });
    const summer = nextSummerDay(day);
    const capacity = youngsterHerders(s, summer);
    // stádo přes zimu s jarními mláďaty uhlídají tři výrostci příštího léta – ne dva dnešní
    const demand = herdingDemand(grown(kept(s)), 0, summer);
    expect(demand).toBeLessThanOrEqual(capacity + 1e-9);
    expect(demand).toBeGreaterThan(youngsterHerders(s, day));
    // chovné minimum zůstává
    const floor = breedingFloor({ minSheep: woolSheep(s, day) });
    for (const species of ['pig', 'goat', 'cow'] as const) {
      expect(kept(s)[species]).toBeGreaterThanOrEqual(floor[species] - 1e-9);
    }
  });

  it('chovné minimum zůstává, i když výrostci nebudou žádní', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ pig: 30, sheep: 30, goat: 6, cow: 8 });
    const input = { oxen: 0, hayKg: Infinity, minCows: 3, minSheep: 6 };
    slaughter(s, day, input);
    const floor = herds({ pig: 2, sheep: 6, goat: 2, cow: 3 });
    for (const species of ['pig', 'sheep', 'goat', 'cow'] as const) {
      expect(kept(s)[species]).toBeCloseTo(floor[species], 9);
    }
  });

  it('staré kusy jdou na maso – i když ves maso nestihne sníst', () => {
    const s = village(day);
    addChildren(s, [7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12], day);
    s.livestock!.herds = herds({ pig: 20, sheep: 40, cow: 6 });
    s.livestock!.young = herds({ pig: 10, sheep: 10, cow: 1 });
    s.meatKg = 10_000;
    const old = retiringHeads(s.livestock!.herds, s.livestock!.young);
    expect(old).toEqual(herds({ pig: 10 / 4, sheep: 30 / 8, cow: 5 / 10 }));
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity });
    // masa je dost na rok – nad staré kusy nic
    expect(kept(s).pig).toBeCloseTo(20 - old.pig, 9);
    expect(kept(s).sheep).toBeCloseTo(40 - old.sheep, 9);
    expect(kept(s).cow).toBeCloseTo(6 - old.cow, 9);
    expect(event).toMatchObject({
      kind: 'slaughter',
      kg: Math.round(
        old.pig * LIVESTOCK.meatKg.pig +
          old.sheep * LIVESTOCK.meatKg.sheep +
          old.cow * LIVESTOCK.meatKg.cow,
      ),
    });
  });
});

describe('zimní porážka po dnech', () => {
  const day = at(600, 11, 1);

  it('kusy na maso počkají, kolik ves přes zimu sní čerstvého – přebytek se hned udí', () => {
    const s = village(day);
    s.people = s.people.slice(0, 2);
    // velké stádo prasat, výrostci žádní – na zimu zbyde chovný pár
    s.livestock!.herds = herds({ pig: 60 });
    const event = slaughter(s, day, { oxen: 0, hayKg: Infinity });
    const freshKg = freshMeatPerDayKg(s, day) * 151;
    const totalKg = 58 * LIVESTOCK.meatKg.pig;
    expect(freshKg).toBeLessThan(totalKg);
    // čerstvé maso přes zimu čeká živé, zbytek je uzený
    expect(cullingMeatKg(s)).toBeCloseTo(freshKg, 6);
    expect(s.meatKg).toBeCloseTo(totalKg - freshKg, 6);
    expect(event).toMatchObject({ kind: 'slaughter', kg: totalKg, fresh: Math.round(freshKg) });
  });

  it('porážka jde po dnech přes zimu podle čerstvé spotřeby – maso se jí čerstvé', () => {
    const s = village(day - 1);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ pig: 8 });
    const nov = advanceVillage(s, day, null);
    const waiting = cullingMeatKg(nov);
    expect(waiting).toBeGreaterThan(0);
    // přebytek nad čerstvou spotřebu zimy je uzený a počká, dokud se jí čerstvé
    // první den porážky už se jí čerstvé maso – strop masa ve stravě
    expect(nov.diet!.shares.freshMeat).toBeCloseTo(DIET.caps.meat, 6);
    const next = advanceVillage(nov, day + 1, null);
    const perDay = freshMeatPerDayKg(nov, day + 1);
    expect(waiting - cullingMeatKg(next)).toBeCloseTo(perDay, 1);
    expect(next.meatKg!).toBeCloseTo(nov.meatKg!, 0);
    // práce porážky – přes zimu po dnech, každý den za dnešní maso
    expect(
      next.livestock!.slaughterWork!.required - nov.livestock!.slaughterWork!.required,
    ).toBeCloseTo(perDay / LIVESTOCK.slaughterKgPerManDay, 6);
    // čekající kusy vystačí skoro na celou zimu (ubývají i ztrátami), pak se čerstvé maso nejí
    const march = advanceVillage(next, at(601, 3, 1), null);
    expect(march.diet!.shares.freshMeat).toBeCloseTo(DIET.caps.meat, 6);
    const later = advanceVillage(march, at(601, 4, 2), null);
    expect(later.livestock!.culling).toBeUndefined();
    expect(later.diet!.shares.freshMeat).toBeUndefined();
  });

  it('do konce zimy se zbytek porazí a udí; od jara do podzimu se neporáží (kromě nouze)', () => {
    const s = village(at(601, 3, 30));
    s.livestock!.herds = herds({ pig: 30, sheep: 20 });
    s.livestock!.culling = herds({ pig: 10, sheep: 5 });
    // dnes zbývá jen den porážky – zbytek do uzení
    winterSlaughterDay(s, at(601, 3, 31));
    expect(s.livestock!.culling).toBeUndefined();
    const smoked = s.meatKg!;
    expect(smoked).toBeGreaterThan(0);
    expect(s.livestock!.herds).toEqual(herds({ pig: 20, sheep: 15 }));
    // jaro až podzim – stádo jen roste mláďaty a ubývá ztrátami, žádná porážka
    s.lastDay = at(601, 3, 31);
    delete s.freshMeatKg;
    const autumn = advanceVillage(s, at(601, 10, 31), null);
    const kinds = new Set(autumn.chronicle.filter((e) => e.day > s.lastDay).map((e) => e.kind));
    expect(kinds.has('slaughter')).toBe(false);
    expect(kinds.has('emergency-slaughter')).toBe(false);
    expect(autumn.livestock!.herds.pig).toBeGreaterThan(20);
    expect(slaughterRemaining(autumn, at(601, 7, 1))).toBe(0);
  });
});

describe('seno a čekající kusy', () => {
  it('seč 1. 6. počítá se senem pro kusy, které čekají na zimní porážku', () => {
    const day = at(601, 6, 1);
    const s = village(day);
    s.people = s.people.slice(0, 2);
    s.livestock!.herds = herds({ cow: 20, sheep: 60 });
    s.livestock!.young = herds({ cow: 4, sheep: 20 });
    const need = winterHayNeedKg(s, day);
    const keep = wantedWinterHerds(s, day, { oxen: 0, minCows: 2, minSheep: woolSheep(s, day) });
    const waitHay = winterWaitHayKg(s, day, keep, 0);
    expect(waitHay).toBeGreaterThan(0);
    expect(need).toBeCloseTo(winterHayKg(keep, 2 * 0) + waitHay, 6);
  });

  it('když seno nestačí, kusy, které neuživí, se porazí hned a udí', () => {
    const day = at(600, 11, 1);
    const s = village(day);
    const keep = herds({ cow: 2, sheep: 4 });
    const killed = herds({ cow: 1, sheep: 4 });
    const plenty = winterWait(s, day, keep, killed, Infinity, 0);
    expect(plenty.cow + plenty.sheep).toBeGreaterThan(0);
    // seno jen na stádo přes zimu – čekat nemůže nikdo
    const none = winterWait(s, day, keep, killed, winterHayKg(keep, 0) / 0.98, 0);
    expect(none.cow).toBeCloseTo(0, 6);
    expect(none.sheep).toBeLessThan(plenty.sheep);
    // napřed ubere krávy (porážejí se poslední, nejdéle žerou)
    const some = winterWait(s, day, keep, killed, winterHayKg(keep, 0) * 1.2, 0);
    expect(some.cow).toBeLessThan(plenty.cow);
    expect(some.sheep).toBeCloseTo(plenty.sheep, 6);
  });
});

describe('čerstvé maso ve stravě', () => {
  it('čerstvé maso se jí napřed, uzené počká – strop masa platí pro obojí', () => {
    const day = at(600, 12, 1);
    const s = village(day - 1);
    s.people = s.people.slice(0, 2);
    s.meatKg = 300;
    s.livestock!.herds = herds({ pig: 10 });
    s.livestock!.culling = herds({ pig: 4 });
    const next = advanceVillage(s, day, null);
    // dnes jen čerstvé – na strop masa ve stravě
    expect(next.diet!.shares.freshMeat).toBeCloseTo(DIET.caps.meat, 6);
    expect(next.diet!.shares.meat).toBeCloseTo(DIET.caps.meat, 6);
    // uzené čeká (jen uzení ubere)
    expect(next.meatKg!).toBeGreaterThan(299);
    const need = villageFoodNeed(next, day);
    expect(need).toBeGreaterThan(0);
  });
});
