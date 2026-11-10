import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import { fieldPartLooks, hayMeadowLooks } from '../field-progress';
import {
  HAY,
  HAY_WINTER_DAYS,
  PLAN_HAY_KEEP,
  SNOW_FEED_DAYS,
  feedHay,
  herdHayCoverage,
  isHayMeadow,
  isMowingSeason,
  mow,
  mownPartIds,
  oxenHayCoverage,
  planAftermath,
  planMowing,
  rotHay,
  spoilOldHay,
  winterHayKg,
} from '../hay';
import { mowingNeed, winterHayNeedKg } from '../husbandry';
import { HAY_CUTS, HAY_WORK_PER_HA } from '../rules';
import { advanceVillage } from '../simulate';
import type { FieldPart, HerdSpecies, VillageState } from '../types';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Seno (oxen.md – Seno): seč úhoru ve fázi louky podle potřeby stáda, zásoba a zimní krmení.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** Plán seče na `kg` sena v době zkrmení (seče se o ztrátu ve stohu víc). */
const fed = (kg: number): number => kg * PLAN_HAY_KEEP;
/** Potřeba seče – nutné seno a strop (oba v době zkrmení); strop chybí = jen nutné. */
const need = (necessary: number, cap = necessary): { necessaryKg: number; capKg: number } => ({
  necessaryKg: fed(necessary),
  capKg: fed(cap),
});
const herds = (over: Partial<Record<HerdSpecies, number>>): Record<HerdSpecies, number> => ({
  sheep: 0,
  goat: 0,
  pig: 0,
  cow: 0,
  ...over,
});

function meadow(id: number, distanceM: number, sinceYear = 595): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: 10_000,
    distanceM,
    naturalFertility: 70,
    fertilityShare: 0.8,
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: at(sinceYear, 9, 1),
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
}

function village(day: number): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
  s.lastDay = day;
  s.storesKg = 50_000;
  s.fields = [{ id: 1 }];
  // bez sena osadníků na první zimu (diet.md – Oděv) – plán seče od nuly
  delete s.hay;
  return s;
}

describe('plán seče', () => {
  it('seče se úhor ve fázi louky od obydlí – jen tolik, kolik stáda sní (25. 10. 2026)', () => {
    const day = at(600, 5, 25);
    const s = village(day);
    s.parts = [meadow(1, 300), meadow(2, 100), meadow(3, 200), meadow(4, 50, 599)];
    expect(isHayMeadow(s.parts[3]!, day)).toBe(false); // mladý příloh
    // 3 t nutného sena i stropu → jen dva hektary nejblíž, třetí louka zůstane (oxen.md – Seno,
    // dvě seče)
    const mowing = planMowing(s, day, need(3000))!;
    expect(mowing.partIds).toEqual([2, 3]);
    expect(mowing.yieldKg).toBeCloseTo(3 * HAY.yieldKgPerHa * (2 / 3), 9);
    // bez kovářových kos 15 čd/ha, díl 200 m od obydlí o 10 % dráž; s kosami 10 čd/ha
    const worst = HAY_WORK_PER_HA.worst;
    expect(mowing.needed).toBeCloseTo(worst + worst * 1.1, 9);
    expect(mowing.required).toBeCloseTo(mowing.needed!, 9);
    expect(planMowing(s, day, need(3000), 1)!.needed).toBeCloseTo(HAY_WORK_PER_HA.best * 2.1, 9);
    // strop 4,5 t (stáda v cílové velikosti + rezerva) – třetí louka jen z práce po stavbách
    const capped = planMowing(s, day, need(3000, 4500))!;
    expect(capped.partIds).toEqual([2, 3, 1]);
    expect(capped.needed).toBeCloseTo(worst + worst * 1.1, 9);
    expect(capped.required).toBeGreaterThan(capped.needed! + worst);
    // zásoba se odečte z nutného i ze stropu
    s.hay = { kg: 2500, mowing: null };
    const stocked = planMowing(s, day, need(3000, 4500))!;
    expect(stocked.needed).toBeCloseTo(worst, 9);
    expect(stocked.partIds).toEqual([2, 3]);
    // zásoba nad strop – nic se neseče (seno by shnilo)
    s.hay.kg = 5000;
    expect(planMowing(s, day, need(3000, 4500))).toBeNull();
    s.hay.kg = 3500;
    expect(planMowing(s, day, need(3000, 4500))!.needed).toBe(0);
    // bez luk nic
    s.parts = [];
    expect(planMowing(s, day, need(3000))).toBeNull();
  });

  it('dvě seče: 1. seč 25. 5. – 30. 6., otava 1. 8. – 30. 9. (Martin 25. 10. 2026)', () => {
    expect(isMowingSeason(at(600, 5, 24))).toBe(false);
    expect(isMowingSeason(at(600, 5, 25))).toBe(true);
    expect(isMowingSeason(at(600, 6, 30))).toBe(true);
    expect(isMowingSeason(at(600, 7, 1))).toBe(false);
    expect(isMowingSeason(at(600, 7, 31), 2)).toBe(false);
    expect(isMowingSeason(at(600, 8, 1), 2)).toBe(true);
    expect(isMowingSeason(at(600, 9, 30), 2)).toBe(true);
    expect(isMowingSeason(at(600, 10, 1), 2)).toBe(false);
  });

  it('otava jen na loukách posečených v 1. seči, 40 % sena, 60 % práce na hektar', () => {
    const day = at(600, 5, 25);
    const s = village(day);
    s.parts = [meadow(1, 300), meadow(2, 100), meadow(3, 200)];
    const first = planMowing(s, day, need(4500))!;
    expect(first.partIds).toEqual([2, 3, 1]);
    // 1. seč stihla louku 2 a polovinu louky 3 (dle práce); louka 1 zůstala neposečená
    const worst = HAY_WORK_PER_HA.worst;
    first.done = worst + (worst * 1.1) / 2;
    s.hay = { kg: 0, mowing: first };
    s.hay.kg = 1.5 * HAY.yieldKgPerHa;
    // strop 4,5 t – chybí ≈ 2,3 t, otava z 1,5 ha dá jen 0,9 t
    const after = planAftermath(s, need(1000, 4500))!;
    expect(after.cut).toBe(2);
    expect(after.partIds).toEqual([2, 3]);
    expect(after.squares![0]!.areaM2).toBe(10_000);
    expect(after.squares![1]!.areaM2).toBeCloseTo(5_000, 6);
    expect(after.yieldKg).toBeCloseTo(1.5 * HAY.yieldKgPerHa * HAY_CUTS.aftermathYieldShare, 9);
    expect(after.required).toBeCloseTo(
      (worst + (worst * 1.1) / 2) * HAY_CUTS.aftermathWorkShare,
      9,
    );
    // nutné seno je v zásobě – otava celá z práce po stavbách
    expect(after.needed).toBe(0);
    expect(after.firstCut!.partIds).toEqual([2, 3]);
    expect(after.firstCut!.naturalM2).toBe(0);
    // seno 1. seče přibývá poměrně k práci (mow) – posečená část celé úrody
    expect(after.firstCut!.yieldKg).toBeCloseTo((first.yieldKg * first.done) / first.required, 6);
    // posečené díly 1. seče zůstanou posečené (zarůstání, pastva) i s otavou
    s.hay.mowing = after;
    expect([...mownPartIds(s)].sort()).toEqual([2, 3]);
    // strop otava nepokryje – seče se celá
    expect(after.wanted).toBeCloseTo(after.required, 9);
    // otava jen do stropu – chybí 0,3 t → stačí louka 2; louka 3 zůstane v seči pro dobytek, který
    // přibude (raiseAftermath)
    s.hay = { kg: 4200, mowing: first };
    const capped = planAftermath(s, need(1000, 4500))!;
    expect(capped.partIds).toEqual([2, 3]);
    expect(capped.wanted).toBeCloseTo(worst * HAY_CUTS.aftermathWorkShare, 9);
    // seno na strop už je – otava se neplánuje, 1. seč zůstane
    s.hay.kg = 5000;
    expect(planAftermath(s, need(1000, 4500))).toBeNull();
    // bez posečených luk otava není
    s.hay = { kg: 0, mowing: { ...first, done: 0 } };
    expect(planAftermath(s, need(1000, 4500))).toBeNull();
  });

  it('seno na zimu: vůl 6 kg listopad–březen; kráva 5, ovce a koza 1 kg jen ve sněhu; prasata nic', () => {
    expect(winterHayKg(herds({ cow: 2, sheep: 10, goat: 4, pig: 30 }), 2)).toBeCloseTo(
      (2 * 5 + 10 + 4) * SNOW_FEED_DAYS + 2 * 6 * HAY_WINTER_DAYS,
      9,
    );
  });

  it('stoh ztrácí 10 % ročně, zbytek loňského sena se k plánu seče zkazí', () => {
    const s = village(at(600, 6, 1));
    s.hay = { kg: 1000, mowing: null };
    for (let i = 0; i < 365; i++) rotHay(s);
    expect(s.hay.kg).toBeCloseTo(900, 6);
    expect(spoilOldHay(s)).toBeCloseTo(900, 6);
    expect(s.hay.kg).toBe(0);
  });

  it('posečené seno přibude do zásoby poměrně k práci', () => {
    const s = village(at(600, 6, 1));
    s.hay = { kg: 0, mowing: { partIds: [1], required: 6, done: 0, yieldKg: 1500 } };
    mow(s, 3);
    expect(s.hay.kg).toBeCloseTo(750, 9);
    mow(s, 10);
    expect(s.hay.kg).toBeCloseTo(1500, 9);
  });
});

describe('zimní krmení', () => {
  it('voli dostanou seno první, krávy, ovce a kozy zbytek; pokrytí k 1. 3. i se zbytkem zimy', () => {
    const s = village(at(600, 11, 1));
    const herd = herds({ cow: 3, sheep: 4, goat: 1, pig: 9 });
    s.hay = { kg: 20, mowing: null };
    feedHay(s, 2, herd);
    // voli 2 × 6 kg, stádo by chtělo 3 × 5 + 4 + 1 = 20 kg, zbylo 8
    expect(s.hay.winter).toEqual({
      oxenNeedKg: 12,
      oxenEatenKg: 12,
      herdNeedKg: 20,
      herdEatenKg: 8,
    });
    expect(s.hay.kg).toBeCloseTo(0, 9);
    feedHay(s, 2, herd);
    expect(s.hay.winter).toEqual({
      oxenNeedKg: 24,
      oxenEatenKg: 12,
      herdNeedKg: 40,
      herdEatenKg: 8,
    });
    // březen bez sena: (12 + 0) / (24 + 2 × 6 × 31), stádo (8 + 0) / (40 + 20 × 31)
    expect(oxenHayCoverage(s, 2)).toBeCloseTo(12 / 396, 9);
    expect(herdHayCoverage(s, 2, herd)).toBeCloseTo(8 / 660, 9);
    expect(oxenHayCoverage(village(at(600, 3, 1)), 0)).toBe(1);
    // na březen zbude stádu jen seno po volech
    s.hay.kg = 12 * 31 + 10 * 31;
    expect(herdHayCoverage(s, 2, herd)).toBeCloseTo((8 + 310) / 660, 9);
  });
});

describe('simulace – seno za rok', () => {
  it('v červnu a červenci se seče po dílech, stohy stojí a přes zimu se zkrmí', () => {
    const s = village(at(600, 5, 1));
    s.parts = [meadow(1, 100), meadow(2, 150), meadow(3, 200)];
    s.livestock!.herds.cow = 2;
    // v červnu je den delší (population.md – Skladba dne podle ročního období) – 6. 6. ještě seče
    const june = advanceVillage(s, at(600, 6, 6), null);
    // seno na stádo (krávy, ovce a kozy na dny se sněhem) ze dvou dílů nejblíž – celé nutné;
    // třetí díl stádo nepotřebuje (diet.md – Zima bez sena, 10. 11. 2026; dřív třetí z volné práce)
    expect(june.hay!.mowing!.partIds).toEqual([1, 2]);
    expect(june.hay!.mowing!.needed!).toBeCloseTo(june.hay!.mowing!.required, 9);
    const looks = fieldPartLooks(june, june.lastDay);
    expect(looks.get(1)?.look).toBe('mown');
    expect(looks.get(2)?.look).toBe('meadow'); // v plánu seče, ještě neposečený
    const summer = advanceVillage(june, at(600, 8, 1), null);
    // seč srpem je pomalá – do 30. 6. ves posekala většinu, seno ve stohu trochu ztratilo
    expect(summer.hay!.kg).toBeGreaterThan(2000);
    expect(summer.hay!.kg).toBeLessThan(3000);
    expect(summer.labor).toBeDefined();
    expect(fieldPartLooks(summer, summer.lastDay).get(1)?.look).toBe('haystacks');
    const spring = advanceVillage(summer, at(601, 4, 1), null);
    expect(spring.hay!.kg).toBeLessThan(summer.hay!.kg);
  });
});

describe('čí práce je seč (25. 10. 2026)', () => {
  /** Ves se stavěným prvním obydlím, třemi loukami a sečí – nutná práce `needed` z 300 čd. */
  function building(needed: number): VillageState {
    const day = at(600, 6, 10);
    const s = foundVillage({ seed: 3, day, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
    s.lastDay = day;
    s.storesKg = 50_000;
    s.fields = [{ id: 1 }];
    s.parts = [meadow(1, 100), meadow(2, 150), meadow(3, 200)];
    s.hay = {
      kg: 0,
      mowing: { partIds: [1, 2, 3], required: 300, done: 0, yieldKg: 4500, needed },
    };
    return s;
  }
  const built = (s: VillageState): number =>
    s
      .labor!.shares.filter((x) => x.construction !== undefined)
      .reduce((sum, x) => sum + x.manDays, 0);

  it('seče se na stáda v cílové velikosti + 20 %, nutné je seno na dnešní stádo', () => {
    const day = at(600, 5, 25);
    const s = village(day);
    s.parts = [meadow(1, 100), meadow(2, 150), meadow(3, 200)];
    s.livestock!.herds.cow = 2;
    const target = winterHayNeedKg(s, day);
    const need = mowingNeed(s, day);
    expect(need.capKg).toBeCloseTo(target * (1 + HAY_CUTS.reserve), 6);
    expect(need.necessaryKg).toBeLessThanOrEqual(target + 1e-6);
    // víc krav, než ves chce – nutné je jen seno na zimní stádo, které si nechá (zbytek na maso)
    s.livestock!.herds.cow = 200;
    const big = mowingNeed(s, day);
    expect(big.necessaryKg).toBeLessThanOrEqual(winterHayNeedKg(s, day) + 1e-6);
    expect(big.capKg).toBeGreaterThan(big.necessaryKg);
  });

  it('seno na dnešní stádo před stavbami, seč navíc až z práce po stavbách', () => {
    expect(building(0).constructions.length).toBeGreaterThan(0);
    const necessary = advanceVillage(building(300), at(600, 6, 11), null);
    const extra = advanceVillage(building(0), at(600, 6, 11), null);
    // nutná seč vezme práci stavbě
    expect(necessary.hay!.mowing!.done).toBeGreaterThan(0);
    expect(built(necessary)).toBeLessThan(built(extra));
    // seč navíc dostane jen, co stavba nechá
    expect(extra.hay!.mowing!.done).toBeLessThan(necessary.hay!.mowing!.done);
    // mimo okno 1. seče (červenec) se neseče vůbec
    const july = building(300);
    july.lastDay = at(600, 7, 1);
    expect(advanceVillage(july, at(600, 7, 2), null).hay!.mowing!.done).toBe(0);
  });
});

describe('seno ze všech luk', () => {
  it('s krajinou se seče i přirozená louka do 600 m od obydlí – nejbližší napřed', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    // obydlí uprostřed krajiny 16 × 16 políček po 15 m, louka všude kromě lesa vlevo
    s.dwellings[0]!.position = { x: 0, z: 0, rotation: 0 };
    s.parts = [meadow(1, 400)];
    const landscape = makeLandscape({ surface: (x) => (x < 4 ? 'forest' : 'meadow') });
    const mowing = planMowing(s, day, need(3000), 0, landscape)!;
    // 3 t sena = 2 ha ≈ 89 políček přirozené louky nejblíž obydlí (díl úhoru je dál)
    expect(mowing.squares!.length).toBeGreaterThan(80);
    expect(mowing.squares!.length).toBeLessThan(100);
    expect(mowing.squares![0]!.cell).toBeDefined();
    expect(mowing.squares!.every((sq) => sq.partId === undefined)).toBe(true);
    // díl úhoru dál se neseče – jen tolik, kolik stáda sní (25. 10. 2026)
    expect(mowing.partIds).toEqual([]);
    const distances = mowing.squares!.map((sq) => sq.distanceM);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    // žádné políčko lesa ani pod obydlím
    expect(mowing.squares!.some((sq) => (sq.cell?.x ?? 99) < 4)).toBe(false);
    expect(mowing.yieldKg).toBeGreaterThanOrEqual(3000);
  });

  it('louky se řadí podle chůze po pěšinách – díly i přirozené louky (paths.md)', () => {
    const day = at(600, 6, 1);
    const s = village(day);
    s.dwellings[0]!.position = { x: 0, z: 0, rotation: 0 };
    // díl úhoru rovně 400 m, po pěšině jen 5 m – seče se první
    s.parts = [{ ...meadow(1, 400), areaM2: 2_000, walkDistanceM: 5 }];
    const landscape = makeLandscape();
    // po pěšině na východ (x > 0) se jde o pětinu rychleji
    const measured: number[] = [];
    const walk = (targets: readonly { x: number; z: number }[]): number[] => {
      measured.push(targets.length);
      return targets.map((t) => Math.hypot(t.x, t.z) * (t.x > 0 ? 0.8 : 1));
    };
    const mowing = planMowing(s, day, need(3000), 0, landscape, walk)!;
    expect(mowing.squares![0]!.partId).toBe(1);
    expect(mowing.squares![0]!.distanceM).toBe(5);
    const natural = mowing.squares!.filter((sq) => sq.cell !== undefined);
    // nejbližší louky (≈ 2 ha) leží po pěšině na východ
    const near = natural.slice(0, 80);
    const east = near.filter((sq) => sq.cell!.x >= 8).length;
    expect(east).toBeGreaterThan(near.length - east);
    const distances = mowing.squares!.map((sq) => sq.distanceM);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    // síť změří louky na dosah stropu – všechny plánované
    expect(measured.reduce((sum, n) => sum + n, 0)).toBeGreaterThanOrEqual(natural.length);
    // bez sítě pěšin (null) se měří rovně
    const straight = planMowing(s, day, need(3000), 0, landscape, () => null)!;
    const straightNatural = straight.squares!.filter((sq) => sq.cell !== undefined).slice(0, 80);
    const straightEast = straightNatural.filter((sq) => sq.cell!.x >= 8).length;
    expect(Math.abs(2 * straightEast - straightNatural.length)).toBeLessThan(
      east * 2 - near.length,
    );
  });

  it('posečená přirozená louka má vzhled seče, stohy od poloviny července', () => {
    const s = village(at(600, 5, 20));
    s.dwellings[0]!.position = { x: 0, z: 0, rotation: 0 };
    s.livestock!.herds.cow = 1;
    const landscape = makeLandscape();
    const june = advanceVillage(s, at(600, 6, 10), null, landscape);
    const looks = hayMeadowLooks(june, june.lastDay);
    expect(looks.length).toBeGreaterThan(0);
    expect(looks.some((v) => v.look === 'mown')).toBe(true);
    // do konce července (1. 8. se plánuje otava)
    const august = advanceVillage(june, at(600, 7, 31), null, landscape);
    expect(hayMeadowLooks(august, august.lastDay).every((v) => v.look === 'haystacks')).toBe(true);
    expect(august.hay!.kg).toBeGreaterThan(1000);
  });
});
