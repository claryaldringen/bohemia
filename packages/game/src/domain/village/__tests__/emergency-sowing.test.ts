import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { expectedNetKg, grossYieldPerHa, isSowableFertility } from '../fields';
import { SEED_KG_PER_HA } from '../rules';
import { advanceVillage } from '../simulate';
import type { FieldPart, VillageState } from '../types';
import { planPartIds } from '../year-plan';

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
    const planned = advanceVillage(poorVillage(10, 0), at(600, 9, 1), null);
    const plan = planned.plan!;
    const inPlan = new Set(planPartIds(plan));
    const byId = new Map(planned.parts.map((p) => [p.id, p]));
    // osévané díly od 70 % jsou v plánu všechny
    for (const p of planned.parts.slice(0, 10)) expect(inPlan.has(p.id)).toBe(true);
    const chosen = planned.parts.filter((p) => inPlan.has(p.id) && isEmergency(p));
    const left = planned.parts.filter((p) => !inPlan.has(p.id) && isEmergency(p));
    expect(chosen.length).toBeGreaterThan(0);
    expect(left.length).toBeGreaterThan(0);
    const lowestChosen = Math.min(...chosen.map((p) => p.fertilityShare));
    const highestLeft = Math.max(...left.map((p) => p.fertilityShare));
    expect(lowestChosen).toBeGreaterThanOrEqual(highestLeft - 1e-9);
    // jen obilí – luštěniny a len na nouzový příloh nejdou
    for (const id of [...(plan.legume?.partIds ?? []), ...(plan.flax?.partIds ?? [])]) {
      expect(isEmergency(byId.get(id)!)).toBe(false);
    }
    // osev navíc nouzový příloh nebere
    for (const { id } of plan.extra ?? []) expect(isEmergency(byId.get(id)!)).toBe(false);
    // úrodnost klesne jako u ostatních – po roce zpátky do přílohu
    const next = advanceVillage(planned, at(601, 9, 1), null);
    const again = next.parts.find((p) => p.id === chosen[0]!.id)!;
    expect(again.fertilityShare).toBeCloseTo(chosen[0]!.fertilityShare - 0.12, 9);
  }, 60_000);

  it('díl s nekladnou čistou úrodou neoseje', () => {
    const s = poorVillage(10, 0);
    // nejvíc zotavený příloh (1. 9. 0,695) bez plochy – čistá úroda 0
    const empty = s.parts[20]!;
    empty.fertilityShare = 0.67;
    empty.areaM2 = 0;
    expect(expectedNetKg(empty, at(600, 9, 1))).toBe(0);
    const planned = advanceVillage(s, at(600, 9, 1), null);
    const inPlan = new Set(planPartIds(planned.plan!));
    expect(inPlan.has(empty.id)).toBe(false);
    expect(planned.parts.some((p) => inPlan.has(p.id) && isEmergency(p))).toBe(true);
  }, 60_000);

  it('ves, které díly od 70 % stačí, nouzový příloh neoseje', () => {
    const planned = advanceVillage(poorVillage(100, 3_000), at(600, 9, 1), null);
    const inPlan = new Set(planPartIds(planned.plan!));
    expect(inPlan.size).toBeGreaterThan(0);
    expect(planned.parts.some((p) => inPlan.has(p.id) && isEmergency(p))).toBe(false);
  }, 60_000);
});
