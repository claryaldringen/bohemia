import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { expectedNetKg, grossYieldPerHa, isEmergencyFallow, isSowableFertility } from '../fields';
import { FERTILITY, SEED_KG_PER_HA } from '../rules';
import { NO_CRAFTS } from '../productivity';
import { neededSelection } from '../rotation';
import { advanceVillage } from '../simulate';
import { fieldSowingTargets } from '../simulate-plan';
import type { FieldPart, VillageState } from '../types';
import { seasonPartIds, seasonCrop } from '../year-plan';

// Nouzový osev (fields.md – Přílohová soustava, Nouzový osev; Martin 19. 10. 2026): když díly od
// 70 % nepokryjí potřebný osev, ves smí osít i příloh pod 70 % – nejvíc zotavený první.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

const field = (count: number): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves bez staveb dopočítaná do 31. 8. 600: prvních `sowable` dílů se osévá (úrodnost 0,9 – smějí
 * dál), ostatní jsou přílohy pod 70 % (0,50–0,66 přirozené, i 1. 9. po roce zotavení pod 70 %).
 */
function poorVillage(sowable: number, storesKg: number): VillageState {
  const s = foundVillage({
    seed: 42,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field(133) },
  });
  s.constructions = [];
  s.lastDay = at(600, 8, 31);
  s.storesKg = storesKg;
  s.parts.forEach((p, i) => {
    p.foundingDone = p.foundingCost;
    if (i < sowable) {
      p.state = 'sown';
      p.crop = 'spring';
      p.sownYears = 1;
      p.fertilityShare = 0.9;
    } else {
      p.state = 'fallow';
      p.fallowSinceDay = at(595, 9, 1);
      p.fertilityShare = 0.5 + ((i * 37) % 17) / 100;
    }
  });
  return s;
}

const isEmergency = (p: FieldPart): boolean => !isSowableFertility(p);

/**
 * Díly, které ves ke dni `day` vybrala (fields.md – Osevní postup po dílech, bod 3) – přibrané na
 * čelo práce i ty, které na něj ve výběru čekají (`neededSelection`).
 */
function chosenIds(start: VillageState, day: number): Set<number> {
  const s = advanceVillage(start, day, null);
  const t = fieldSowingTargets(s, day, NO_CRAFTS);
  const { join } = neededSelection(s, day, {
    harvestKg: t.harvestKg,
    energyFloorKg: t.energyFloorKg,
    needKg: t.needKg,
    flaxNeedKg: s.season?.flaxNeedKg ?? 0,
  });
  return new Set([...(s.season ? seasonPartIds(s.season) : []), ...join.map((j) => j.id)]);
}

describe('nouzový osev přílohu pod 70 %', () => {
  it('úroda pod 70 % podle úrodnosti – čistá úroda vždy kladná', () => {
    const part = poorVillage(0, 0).parts[50]!;
    part.fertilityShare = 0.5;
    const ha = part.areaM2 / 10_000;
    const expected = (grossYieldPerHa(70 * 0.5) - SEED_KG_PER_HA) * ha;
    expect(expectedNetKg(part, at(600, 9, 1))).toBeCloseTo(expected, 9);
    // i při nulové úrodnosti dá hrubá úroda víc než osivo (0,4 základní úrody)
    expect(grossYieldPerHa(0)).toBeGreaterThan(SEED_KG_PER_HA);
  });

  it('ves, které díly od 70 % nestačí, oseje příloh pod 70 % – nejvíc zotavený první', () => {
    // 1. 5. je v hospodářském roce jen osetý ozim a jař (nezasetá jař z práce vypadla) – ves
    // pracuje po dílech od čela, co nestihla, nechala ladem
    // zásoby jen na osivo – osivo ze zásob při setí (fields.md – Úroda, Osivo ze zásob)
    const sown = advanceVillage(poorVillage(10, 600), at(601, 5, 1), null);
    const plan = sown.season!;
    const inPlan = new Set(seasonPartIds(plan));
    const byId = new Map(sown.parts.map((p) => [p.id, p]));
    // osévané díly od 70 % jsou osety všechny – napřed před nouzovými
    for (const p of sown.parts.slice(0, 10)) expect(inPlan.has(p.id)).toBe(true);
    const chosen = sown.parts.filter((p) => inPlan.has(p.id) && isEmergency(p));
    const left = sown.parts.filter((p) => !inPlan.has(p.id) && isEmergency(p));
    expect(chosen.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    const lowestChosen = Math.min(...chosen.map((p) => p.fertilityShare));
    const highestLeft = Math.max(...left.map((p) => p.fertilityShare));
    expect(lowestChosen).toBeGreaterThanOrEqual(highestLeft - 1e-9);
    // jen obilí – luštěniny a len na nouzový příloh nejdou
    for (const id of [
      ...(seasonCrop(plan, 'legume')?.partIds ?? []),
      ...(seasonCrop(plan, 'flax')?.partIds ?? []),
    ]) {
      expect(isEmergency(byId.get(id)!)).toBe(false);
    }
    // úrodnost klesne jako u ostatních – po roce zpátky do přílohu
    const next = advanceVillage(sown, at(601, 9, 1), null);
    for (const p of chosen) {
      const again = next.parts.find((x) => x.id === p.id)!;
      expect(again.fertilityShare).toBeCloseTo(p.fertilityShare - 0.12, 9);
    }
  }, 60_000);

  it('díl s nekladnou čistou úrodou neoseje', () => {
    const s = poorVillage(10, 0);
    // nejvíc zotavený příloh (1. 9. 0,69) bez plochy – čistá úroda 0
    const empty = s.parts[20]!;
    empty.fertilityShare = 0.64;
    empty.areaM2 = 0;
    expect(expectedNetKg(empty, at(600, 9, 1))).toBe(0);
    const inPlan = chosenIds(s, at(600, 9, 1));
    expect(inPlan.has(empty.id)).toBe(false);
    expect(s.parts.some((p) => inPlan.has(p.id) && isEmergency(p))).toBe(true);
  }, 60_000);

  it('nouzově jen příloh aspoň na 40 % přirozené (Martin 19. 10. 2026)', () => {
    const part = poorVillage(0, 0).parts[50]!;
    part.fertilityShare = 0.39;
    expect(isEmergencyFallow(part)).toBe(false);
    part.fertilityShare = 0.4;
    expect(isEmergencyFallow(part)).toBe(true);
    part.fertilityShare = 0.7;
    expect(isEmergencyFallow(part)).toBe(false);
    part.state = 'sown';
    part.fertilityShare = 0.5;
    expect(isEmergencyFallow(part)).toBe(false);
  });

  it('díl na 39 % nouzově neoseje, na 40 % ano', () => {
    const s = poorVillage(10, 0);
    // 1. 9. se příloh zotaví o fallowRecovery – plán vidí 0,39 a jeden díl na 0,40
    const fallows = s.parts.slice(10);
    for (const p of fallows) p.fertilityShare = 0.39 - FERTILITY.fallowRecovery;
    const ready = fallows[30]!;
    ready.fertilityShare = 0.4 - FERTILITY.fallowRecovery;
    const planned = advanceVillage(s, at(600, 9, 1), null);
    const inPlan = chosenIds(s, at(600, 9, 1));
    const byId = new Map(planned.parts.map((p) => [p.id, p]));
    expect(byId.get(ready.id)!.fertilityShare).toBeCloseTo(0.4, 9);
    expect(inPlan.has(ready.id)).toBe(true);
    for (const p of fallows) {
      if (p.id !== ready.id) expect(inPlan.has(p.id)).toBe(false);
    }
  }, 60_000);

  it('ves, které díly od 70 % stačí, nouzový příloh neoseje', () => {
    const planned = advanceVillage(poorVillage(100, 3_000), at(600, 9, 1), null);
    const inPlan = new Set(seasonPartIds(planned.season!));
    expect(inPlan.size).toBeGreaterThan(0);
    expect(planned.parts.some((p) => inPlan.has(p.id) && isEmergency(p))).toBe(false);
  }, 60_000);
});
