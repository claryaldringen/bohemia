import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../../core/actions';
import { DIET, meatEnergy } from '../../core/diet';
import { hungerSplit } from '../../people/hunger-groups';
import { advanceVillage } from '../../core/simulate';
import { LIVESTOCK, slaughterRemaining, type WinterInput } from '../livestock';
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
    // i dnešní čerstvé maso (ryby) se počítá
    const fish = village(day);
    fish.livestock!.herds = herds({ sheep: 20, cow: 10 });
    fish.freshMeatKg = lordNeed(fish, day) / DIET.meatEnergy + 0.1;
    summerSlaughterDay(fish, day, NO_HERDERS);
    expect(fish.livestock!.herds).toEqual(herds({ sheep: 20, cow: 10 }));
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
