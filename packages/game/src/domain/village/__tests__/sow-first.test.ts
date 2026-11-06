import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage, type PartInput } from '../actions';
import { ageGroup } from '../people';
import { SEED_STORES, STARVATION } from '../rules';
import { foodUntilHarvestKg, seedKeepKg, seedReserve, sowableSeedKg, workSeedKg } from '../seed';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';
import { villageYearRow } from '../year-log';
import { createCropWork, seasonCrops, sownShare } from '../year-plan';

// Osev má přednost (fields.md – Úroda, Osivo ze zásob; Martin 6. 11. 2026: „Musí zasít – jinak by
// si prožrala budoucnost.“): ves si do žní nechá jen přežívací zásobu (`seedKeepKg`) a ostatní zrno
// je osivo – oře a seje, dokud trvá okno, dokud není osetá plocha v plánu, nebo dokud nedojde
// osivo; zbytek zůstane v zásobách.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

/** Ves s 20 hotovými díly po 0,25 ha, bez staveb, osiva zakladatelů a mimo hájení. */
function village(storesKg: number): VillageState {
  const parts: PartInput[] = Array.from({ length: 20 }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 3 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 11,
    day: at(600, 6, 1),
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: { outline: OUTLINE, parts },
  });
  s.constructions = [];
  s.season = null;
  s.lastDay = at(600, 8, 31);
  s.storesKg = storesKg;
  // mimo hájení (population.md) – hlad by jinak nezabíjel a test by nic neověřil
  s.foundedDay = at(500, 1, 1);
  delete s.reservedSeedKg;
  delete s.reservedSeedUntilDay;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

/** Osivo, které plány hospodářského roku vzaly (kg obilí, bez lnu). */
function seedTakenKg(s: VillageState): number {
  let kg = 0;
  for (const { crop, work } of seasonCrops(s.season!)) {
    if (crop !== 'flax') kg += work.seedKg ?? 0;
  }
  return kg;
}

/** Nejnižší práh úmrtí hladem skupin ve vsi bez rezervy (dny). */
function hungerLimit(s: VillageState, day: number): number {
  const groups = s.people.map((p) => STARVATION.threshold[ageGroup(p, day)]);
  return Math.min(...groups) - SEED_STORES.marginDays;
}

describe('osev má přednost (fields.md – Osivo ze zásob; Martin 6. 11. 2026)', () => {
  const START = at(600, 9, 1);

  it('přežívací zásoba: pod 90 % potřeby do žní, víc s nahromaděným hladem a s osivem jen na setí', () => {
    const s = advanceVillage(village(50_000), START, null);
    const keep = seedKeepKg(s, START);
    const food = foodUntilHarvestKg(s, START);
    expect(keep).toBeGreaterThan(0);
    // příděl pod STARVATION.fedFrom – ves do žní hladoví, ale jen do prahu bez rezervy
    expect(keep).toBeLessThan(STARVATION.fedFrom * food);
    // nahromaděný hlad ves zná – s ním si nechá víc, nad práh celých 90 %
    expect(seedKeepKg({ ...s, starvationDays: 6 }, START)).toBeGreaterThan(keep);
    expect(seedKeepKg({ ...s, starvationDays: 30 }, START)).toBeCloseTo(
      STARVATION.fedFrom * food,
      6,
    );
    // s osivem jen na setí nejvýš do prahu, od kterého by ho ves snědla (SEED_BUYING)
    expect(seedKeepKg({ ...s, reservedSeedKg: 100 }, START)).toBeGreaterThan(keep);
    // ves bez lidí si nic nenechá
    expect(seedKeepKg({ ...s, people: [] }, START)).toBe(0);
  });

  it('ves s málem zrna oseje víc než dřív a nikdo do žní neumře hlady', () => {
    // plán bez zásob – osivo do roční potřeby z pole (`seedFloorKg`) celé
    const planned = advanceVillage(village(0), START, null);
    const floor = planned.season?.seedFloorKg ?? 0;
    expect(floor).toBeGreaterThan(0);
    // zásoby na rok do žní a osivo do roční potřeby – past osiva (dřív: osivo do roční potřeby
    // `seedFloorKg` z úrody bez ztrát a nad ni jen zrno nad celý příděl do žní)
    const food = foodUntilHarvestKg(planned, START);
    const s: VillageState = { ...planned, storesKg: food + floor };
    const before = Math.max(s.storesKg - food, Math.min(floor, s.storesKg - 0.5 * food));
    const now = sowableSeedKg(s, 'grain', seedKeepKg(s, START));
    expect(now).toBeCloseTo(s.storesKg - seedKeepKg(s, START), 6);
    expect(now).toBeGreaterThan(before);
    let v = s;
    let maxHunger = 0;
    let sown = 0;
    for (let day = START + 5; day <= at(601, 8, 31); day += 5) {
      v = advanceVillage(v, day, null);
      maxHunger = Math.max(maxHunger, v.starvationDays ?? 0);
      if (v.season && v.season.startDay === START) sown = Math.max(sown, seedTakenKg(v));
    }
    // oseje víc, než dřív smělo do země
    expect(sown).toBeGreaterThan(before);
    // hladová, ale nikdo hlady neumřel – nahromaděný hlad pod prahem nejcitlivější skupiny
    expect(maxHunger).toBeLessThanOrEqual(hungerLimit(s, START) + 1e-6);
    const hungerDeaths = v.chronicle.filter(
      (e) => e.day > START && e.kind === 'death' && e.cause === 'hunger',
    );
    expect(hungerDeaths).toEqual([]);
  }, 120_000);

  it('ves s dostatkem zrna seje, dokud stačí práce a okno – osivo jen na zasetý podíl, zbytek zůstane', () => {
    const s = advanceVillage(village(50_000), at(601, 5, 2), null);
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    let plan = 0;
    let unsown = 0;
    for (const { crop, work } of seasonCrops(s.season!)) {
      if (crop === 'flax' || work.seedKg === undefined) continue;
      // jař (okno do konce dubna) zasetá celá; ozim nad potřebu jen, kolik práce po stavbách stihla
      if (crop !== 'winter') expect(sownShare(work)).toBeGreaterThan(0.99);
      // osivo vzal jen zasetý podíl – ostatní zrno zůstalo v zásobách
      const total = workSeedKg(work, byId, crop);
      expect(work.seedKg).toBeCloseTo(sownShare(work) * total, 6);
      plan += work.seedKg;
      unsown += total - work.seedKg;
    }
    expect(plan).toBeGreaterThan(0);
    // osivo nebylo mezí – ves ho drží nejvýš na nezasetý podíl plánů, zbytek je jídlo
    const keep = seedKeepKg(s, at(601, 5, 2));
    expect(seedReserve(s, keep).grain).toBeLessThanOrEqual(unsown + 1e-6);
    expect(s.storesKg - unsown).toBeGreaterThan(keep);
  }, 120_000);

  it('dopočet po kouscích dá totéž jako najednou (ves s málem zrna)', () => {
    const planned = advanceVillage(village(0), START, null);
    const food = foodUntilHarvestKg(planned, START);
    const s: VillageState = { ...planned, storesKg: food + (planned.season?.seedFloorKg ?? 0) };
    const end = at(601, 5, 10);
    const whole = advanceVillage(s, end, null);
    let pieces = s;
    for (const day of [at(600, 9, 20), at(600, 10, 7), at(600, 12, 31), at(601, 3, 11), end]) {
      pieces = JSON.parse(JSON.stringify(advanceVillage(pieces, day, null))) as VillageState;
    }
    expect(pieces).toEqual(JSON.parse(JSON.stringify(whole)));
  }, 120_000);

  it('deník: oseto jen skutečně zasetý podíl, ne díly vybrané do plánu', () => {
    const s = village(0);
    const end = at(600, 12, 31);
    const parts = s.parts.slice(0, 4);
    const work = createCropWork(parts, at(600, 9, 15), 0, false, undefined, 'winter');
    for (const p of parts) p.state = 'sown';
    work.done.sow = work.required.sow / 2;
    s.season = { startDay: START, crops: [{ crop: 'winter', ...work }] };
    s.lastDay = end;
    // 4 díly po 0,25 ha ve stavu `sown`, zaseta polovina práce
    expect(villageYearRow(s).sownM2).toBe(5_000);
  });
});
