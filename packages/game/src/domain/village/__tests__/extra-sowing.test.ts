import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundVillage } from '../actions';
import type { PartInput } from '../actions';
import { extraPartsOf, extraSowingCrop, queueExtraParts } from '../extra-sowing';
import { seasonPartIds } from '../year-plan';
import { advanceVillage } from '../simulate';
import type { VillageState } from '../types';

// Osev navíc (fields.md – Kolik ves oseje, Osev navíc): ves bez staveb obdělá všechny díly, které
// smí osít, ale jen prací, která zbude po stavbách. Simulační testy osevu navíc zmizely s plánem
// osevu (nutné díly den po dni) – díly nad potřebu je vrátí (plán osevního postupu, Úloha 4).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const POSITION = { x: 0, z: 0, rotation: 0 };
const OUTLINE: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

/** Pole 3 ha (133 dílů po 225 m², úrodnost 70). */
const field = (count = 133): PartInput[] =>
  Array.from({ length: count }, (_, i) => ({
    areaM2: 225,
    distanceM: 50 + Math.round((50 * i) / (count - 1)),
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));

/**
 * Ves s polem, které se loni osévalo (díly smějí dál), a se zásobou obilí na roky – potřebný osev
 * obilí k 1. 9. 600 je nulový, všechno obilí je osev navíc. Bez staveb, dopočítaná do 31. 8. 600.
 */
function richVillage(): VillageState {
  const s = foundVillage({
    seed: 42,
    day: at(600, 6, 1),
    dwellingPosition: POSITION,
    firstField: { outline: OUTLINE, parts: field() },
  });
  s.constructions = [];
  s.lastDay = at(600, 8, 31);
  s.storesKg = 20_000;
  s.meatKg = 300;
  s.parts.forEach((p) => {
    p.foundingDone = p.foundingCost;
    p.state = 'sown';
    p.crop = 'spring';
    p.sownYears = 1;
  });
  return s;
}

describe('osev navíc', () => {
  it('plodina dne: ozim do předposledního dne setí ozimu, pak jař v oknech kopání', () => {
    expect(extraSowingCrop(at(600, 9, 1))).toBe('winter');
    expect(extraSowingCrop(at(600, 10, 30))).toBe('winter');
    expect(extraSowingCrop(at(600, 10, 31))).toBe('spring');
    expect(extraSowingCrop(at(600, 11, 30))).toBe('spring');
    expect(extraSowingCrop(at(600, 12, 15))).toBeNull();
    expect(extraSowingCrop(at(601, 3, 1))).toBe('spring');
    expect(extraSowingCrop(at(601, 4, 29))).toBe('spring');
    expect(extraSowingCrop(at(601, 4, 30))).toBeNull();
    expect(extraSowingCrop(at(601, 6, 1))).toBeNull();
  });

  it('jediný vstup do osevu navíc: příloh 70–95 % `extraPartsOf` zahodí, jarní hotové díly též', () => {
    const s = richVillage();
    const [a, b, c] = s.parts;
    a!.state = 'fallow';
    a!.fertilityShare = 0.8;
    b!.state = 'fallow';
    b!.fertilityShare = 0.97;
    c!.state = 'sown';
    c!.fertilityShare = 0.9;
    const parts = extraPartsOf([a!, b!, c!]);
    expect(parts.map((e) => e.id)).toEqual([b!.id, c!.id]);
    const plan = { extra: [] } as unknown as NonNullable<VillageState['season']>;
    queueExtraParts(plan, parts);
    expect(plan.extra!.map((e) => e.id)).toEqual([b!.id, c!.id]);
  });

  it('po kouscích dá stejný stav jako jedním voláním', () => {
    const s0 = richVillage();
    const end = at(601, 5, 10);
    const whole = advanceVillage(s0, end, null);
    let pieces = s0;
    const steps = [1, 13, 40, 2, 77];
    for (let i = 0; pieces.lastDay < end; i++) {
      pieces = advanceVillage(
        pieces,
        Math.min(end, pieces.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(pieces).toEqual(whole);
  }, 60_000);

  it('plán starší vsi bez osevu navíc se dopočítá beze změny dílů plánu', () => {
    const planned = advanceVillage(richVillage(), at(600, 9, 1), null);
    const old: VillageState = structuredClone(planned);
    delete old.season!.extra;
    const ids = seasonPartIds(old.season!);
    const later = advanceVillage(old, at(600, 11, 30), null);
    expect(seasonPartIds(later.season!)).toEqual(ids);
    expect(later.season!.extra).toBeUndefined();
  }, 60_000);
});
