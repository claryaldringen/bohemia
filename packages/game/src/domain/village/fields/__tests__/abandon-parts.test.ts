import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  ABANDON_ALREADY,
  ABANDON_FOUNDING,
  ABANDON_NO_PART,
  RETURN_NOT_ABANDONED,
  abandonFieldParts,
  abandonPartsBlock,
} from '../abandon-parts';
import { foundVillage, type PartInput } from '../../core/actions';
import { fieldCapacity } from '../field-capacity';
import { isEmergencyFallow, sowingGroup } from '../fields';
import { partRotation } from '../part-rotation';
import { nextSowing, returnPart, rotateAfterSeason, sowParts } from '../rotation';
import { seasonCrops } from '../../core/year-plan';
import { advanceVillage } from '../../core/simulate';
import type { FieldPart, VillageState } from '../../types';

// Opuštění dílu pole (fields.md – Opuštěný díl; Martin 8. 11. 2026: „A“ – díly vypadnou z oběhu
// a zarostou; stejná akce pro hráče i správce).

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 6, 1);

/** Ves s polem `count` hotových dílů 0,25 ha od domu ven, bez plánu a staveb (jako sowing-rotation). */
function village(count: number): VillageState {
  const parts: PartInput[] = Array.from({ length: count }, (_, i) => ({
    areaM2: 2_500,
    distanceM: 40 + 10 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 7,
    day: DAY,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: {
      outline: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      parts,
    },
  });
  s.constructions = [];
  s.season = null;
  for (const p of s.parts) {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
  }
  return s;
}

const partOf = (s: VillageState, id: number): FieldPart => s.parts.find((p) => p.id === id)!;
const ids = (s: VillageState): number[] => s.parts.map((p) => p.id);

describe('opuštění dílu pole', () => {
  it('připravený díl jde hned do přílohu, vstupní stav se nemění, kronika krátce', () => {
    const s = village(3);
    const [a] = ids(s);
    const before = structuredClone(s);
    const next = abandonFieldParts(s, DAY, [a!], true);
    expect(s).toEqual(before);
    const p = partOf(next, a!);
    expect(p).toMatchObject({
      abandoned: true,
      state: 'fallow',
      fallowSinceDay: DAY,
      sownYears: 0,
    });
    expect(next.chronicle.at(-1)).toEqual({ day: DAY, kind: 'parts-abandoned', parts: 1 });
  });

  it('opuštěný díl se neoseje – mimo pořadí osevu, nouzový osev i postup', () => {
    const s = village(2);
    const [a] = ids(s);
    const next = abandonFieldParts(s, DAY, [a!], true);
    const p = partOf(next, a!);
    p.fertilityShare = 1;
    expect(sowingGroup(p)).toBeNull();
    expect(nextSowing(p)).toBe('rest');
    p.fertilityShare = 0.5;
    expect(isEmergencyFallow(p)).toBe(false);
    // panel: příště úhor bez odhadu, kdy se oseje
    expect(partRotation(next, DAY).get(a!)).toEqual({ next: 'fallow' });
  });

  it('osetý díl dá úrodu a do přílohu jde až 1. 9. po žních', () => {
    const s = village(2);
    const [a] = ids(s);
    sowParts([partOf(s, a!)], 'winter');
    const next = abandonFieldParts(s, DAY, [a!], true);
    const p = partOf(next, a!);
    expect(p).toMatchObject({ abandoned: true, state: 'sown', crop: 'winter' });
    rotateAfterSeason(p, at(600, 9, 1));
    // bez opuštění by se osíval dál (díl v osevu) – opuštěný jde do přílohu
    expect(p).toMatchObject({ abandoned: true, state: 'fallow', fallowSinceDay: at(600, 9, 1) });
    expect(p.crop).toBeUndefined();
  });

  it('díl vyřazený z letošní práce zůstane přílohem, ne připraveným dílem', () => {
    const s = village(1);
    const p = partOf(s, ids(s)[0]!);
    sowParts([p], 'spring');
    p.abandoned = true;
    returnPart(p, at(600, 9, 1));
    expect(p).toMatchObject({ state: 'fallow', fallowSinceDay: at(600, 9, 1), abandoned: true });
  });

  it('víc dílů naráz – jeden řádek kroniky s počtem', () => {
    const s = village(4);
    const next = abandonFieldParts(s, DAY, ids(s).slice(0, 3), true);
    expect(next.chronicle.at(-1)).toEqual({ day: DAY, kind: 'parts-abandoned', parts: 3 });
    expect(next.parts.filter((p) => p.abandoned).length).toBe(3);
  });

  it('nezaložený díl neopustí (zrušit jde stavba), chybějící díl ani dvakrát', () => {
    const s = village(2);
    const [a, b] = ids(s);
    partOf(s, b!).state = 'founding';
    expect(abandonPartsBlock(s, [b!], true)).toBe(ABANDON_FOUNDING);
    expect(() => abandonFieldParts(s, DAY, [a!, b!], true)).toThrow(ABANDON_FOUNDING);
    expect(abandonPartsBlock(s, [999], true)).toBe(ABANDON_NO_PART);
    expect(abandonPartsBlock(s, [], true)).toBe(ABANDON_NO_PART);
    const once = abandonFieldParts(s, DAY, [a!], true);
    expect(abandonPartsBlock(once, [a!], true)).toBe(ABANDON_ALREADY);
    expect(abandonPartsBlock(s, [a!], false)).toBe(RETURN_NOT_ABANDONED);
  });

  it('vrácení: díl je zase v osevním postupu, příloh jak ležel; kronika', () => {
    const s = village(2);
    const [a] = ids(s);
    const abandoned = abandonFieldParts(s, DAY, [a!], true);
    partOf(abandoned, a!).overgrowthYears = 7;
    const back = abandonFieldParts(abandoned, DAY + 3, [a!], false);
    const p = partOf(back, a!);
    expect(p.abandoned).toBeUndefined();
    expect(p).toMatchObject({ state: 'fallow', fallowSinceDay: DAY, overgrowthYears: 7 });
    expect(sowingGroup(p)).toBe(3);
    expect(back.chronicle.at(-1)).toEqual({ day: DAY + 3, kind: 'parts-returned', parts: 1 });
  });

  it('opuštěný díl se nepočítá do pole, které ves živí', () => {
    const s = village(2);
    const all = fieldCapacity(s, DAY)!;
    const half = fieldCapacity(abandonFieldParts(s, DAY, [ids(s)[0]!], true), DAY)!;
    expect(half.rotationHa).toBeCloseTo(all.rotationHa / 2, 9);
  });

  it('akce do minulosti vsi neprojde', () => {
    const s = village(1);
    s.lastDay = DAY + 10;
    expect(() => abandonFieldParts(s, DAY, [ids(s)[0]!], true)).toThrow(RangeError);
  });
});

describe('opuštěné díly v dopočtu vsi', () => {
  /** Ves, ve které hráč opustil polovinu dílů. */
  function abandonedHalf(): { start: VillageState; abandoned: number[] } {
    const s = village(6);
    s.storesKg = 20_000;
    const abandoned = ids(s).slice(3);
    return { start: abandonFieldParts(s, DAY, abandoned, true), abandoned };
  }

  it('ves opuštěné díly neoseje – ostatní ano', () => {
    const { start, abandoned } = abandonedHalf();
    let s = start;
    const sown = new Set<number>();
    const end = at(602, 9, 15);
    while (s.lastDay < end) {
      s = advanceVillage(s, Math.min(end, s.lastDay + 20), null);
      for (const p of s.parts) if (p.state === 'sown') sown.add(p.id);
      for (const { work } of s.season ? seasonCrops(s.season) : []) {
        for (const id of abandoned) expect(work.partIds).not.toContain(id);
      }
    }
    for (const id of abandoned) {
      expect(sown.has(id)).toBe(false);
      expect(partOf(s, id)).toMatchObject({ state: 'fallow', abandoned: true });
    }
    expect([...sown].some((id) => !abandoned.includes(id))).toBe(true);
  });

  it('po kouscích stejně jako jedním voláním', () => {
    const { start } = abandonedHalf();
    const end = at(603, 3, 1);
    const whole = advanceVillage(start, end, null);
    let chunked = start;
    const steps = [1, 45, 400, 3, 365, 77];
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = advanceVillage(
        chunked,
        Math.min(end, chunked.lastDay + steps[i % steps.length]!),
        null,
      );
    }
    expect(chunked).toEqual(whole);
  });
});
