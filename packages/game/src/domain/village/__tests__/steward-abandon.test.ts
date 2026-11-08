import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf } from '../../calendar';
import { CURRENT_LAYER_VERSIONS, generateLandscape, obstaclesOf } from '../../landscape';
import { foundVillage, type PartInput } from '../actions';
import { ROTATION_FACTOR } from '../field-capacity';
import { NO_CRAFTS } from '../productivity';
import { STEWARD } from '../rules-steward';
import type { StewardContext } from '../steward';
import { abandonStep, partsToAbandon } from '../steward-abandon';
import { fieldCellValue, fieldCells } from '../steward-land';
import { stewardOutlook, type StewardOutlook } from '../steward-outlook';
import { markStewardBuilt, newSteward } from '../steward-state';
import type { VillageState } from '../types';

// Správce opouští díly pole stejnou akcí jako hráč (steward.md – Přestavba vlastních staveb, Pole;
// Martin 8. 11. 2026: „A“): jednou za rok v září díly, které sám založil a které vycházejí nejhůř,
// když pole přesahuje, co ves obdělá.

const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
const cells = fieldCells(landscape, obstacles);
const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
/** První den správce v září. */
const SEPT = Math.ceil(at(600, 9, 1) / STEWARD.everyDays) * STEWARD.everyDays;
const AREA = 2_500;

/** Políčko poblíž sídla, které má hodnotu pro pole. */
function fieldCell(): { x: number; y: number } {
  const { x, y } = landscape.villageSite;
  for (let r = 1; r < 30; r++) {
    for (let dx = -r; dx <= r; dx++) {
      const c = { x: x + dx, y: y + r };
      if (fieldCellValue(cells, c.y * landscape.size + c.x, 0) > 0) return c;
    }
  }
  throw new Error('žádné políčko pro pole');
}

/**
 * Ves se správcem a polem `count` hotových dílů 0,25 ha na témže políčku, od domu ven (dál = hůř);
 * díly s indexem v `steward` založil správce.
 */
function village(count: number, steward: readonly number[]): VillageState {
  const parts: PartInput[] = Array.from({ length: count }, (_, i) => ({
    areaM2: AREA,
    distanceM: 40 + 100 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
  }));
  const s = foundVillage({
    seed: 7,
    day: SEPT,
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
  s.steward = newSteward(SEPT, true);
  const cell = fieldCell();
  s.parts.forEach((p, i) => {
    p.foundingDone = p.foundingCost;
    p.state = 'ready';
    p.cell = { ...cell };
    if (steward.includes(i)) markStewardBuilt(s, p.id);
  });
  return s;
}

/** Den správce s výhledem: pole v oběhu `landHa`, osev podle práce `laborHa` (ha osevu). */
function ctxOf(day: number, landHa: number, laborHa: number): StewardContext {
  const outlook: StewardOutlook = {
    laborHa,
    seedHa: Infinity,
    landHa,
    bottleneck: laborHa < landHa ? 'labor' : 'land',
    lasting: laborHa < landHa ? 'labor' : 'land',
    workPerHa: 1,
    landPeople: 10,
    sustainablePeople: 10,
  };
  return {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage: NO_CRAFTS,
    mode: 'growth',
    outlook,
  };
}

/** Plocha osevu (ha) polí v oběhu z `n` dílů. */
const sownHa = (n: number): number => (n * AREA) / 10_000 / ROTATION_FACTOR;

describe('správce opouští díly pole', () => {
  it('pole nad práci × rezerva: opustí své nejhorší díly, které se do přebytku vejdou celé', () => {
    // 6 dílů, práce stačí na 3 – přebytek 6 − 3 × fieldReserve dílů
    const s = village(6, [0, 1, 2, 3, 4]);
    const ctx = ctxOf(SEPT, sownHa(6), sownHa(3));
    const excessParts = 6 - 3 * STEWARD.fieldReserve;
    const chosen = partsToAbandon(s, ctx);
    expect(chosen).toHaveLength(Math.floor(excessParts));
    // nejdál (nejhorší hodnota) první; díl 5 je hráčův – ten nikdy
    expect(chosen).toEqual([s.parts[4]!.id, s.parts[3]!.id]);
  });

  it('práce na pole stačí (hrdlem půda) nebo přebytek pod jeden díl: nic', () => {
    const s = village(6, [0, 1, 2, 3, 4, 5]);
    expect(partsToAbandon(s, ctxOf(SEPT, sownHa(6), sownHa(7)))).toEqual([]);
    expect(partsToAbandon(s, ctxOf(SEPT, sownHa(6), sownHa(5.6)))).toEqual([]);
  });

  it('zakládané, opuštěné a cizí díly nebere', () => {
    const s = village(4, [0, 1, 2]);
    s.parts[2]!.state = 'founding';
    s.parts[1]!.abandoned = true;
    expect(partsToAbandon(s, ctxOf(SEPT, sownHa(4), sownHa(1)))).toEqual([s.parts[0]!.id]);
  });

  it('krok jen první den správce v září – akce hráče, jeden řádek kroniky', () => {
    const s = village(6, [0, 1, 2, 3, 4, 5]);
    const later = structuredClone(s);
    abandonStep(later, ctxOf(SEPT + STEWARD.everyDays, sownHa(6), sownHa(3)));
    expect(later.parts.some((p) => p.abandoned)).toBe(false);
    const june = structuredClone(s);
    abandonStep(june, ctxOf(at(601, 6, 10), sownHa(6), sownHa(3)));
    expect(june.parts.some((p) => p.abandoned)).toBe(false);
    abandonStep(s, ctxOf(SEPT, sownHa(6), sownHa(3)));
    const abandoned = s.parts.filter((p) => p.abandoned);
    expect(abandoned.map((p) => p.id)).toEqual([s.parts[4]!.id, s.parts[5]!.id]);
    // připravený díl jde hned do přílohu (stejně jako akce hráče)
    expect(abandoned.every((p) => p.state === 'fallow')).toBe(true);
    expect(s.chronicle.at(-1)).toEqual({ day: SEPT, kind: 'parts-abandoned', parts: 2 });
  });
});

describe('výhled bez opuštěných dílů', () => {
  it('opuštěný zarostlý díl nezvedne práci na vrácení přílohu ani pole v oběhu', () => {
    const s = village(3, []);
    for (const p of s.parts) {
      p.state = 'fallow';
      p.fallowSinceDay = SEPT - 365;
    }
    const base = stewardOutlook(s, SEPT, NO_CRAFTS);
    const withAbandoned = structuredClone(s);
    const old = withAbandoned.parts[2]!;
    old.abandoned = true;
    old.fallowSinceDay = SEPT - 30 * 365;
    old.distanceM = 40;
    const kept = structuredClone(withAbandoned);
    kept.parts = kept.parts.slice(0, 2);
    const outlook = stewardOutlook(withAbandoned, SEPT, NO_CRAFTS);
    expect(outlook.workPerHa).toBeCloseTo(stewardOutlook(kept, SEPT, NO_CRAFTS).workPerHa, 9);
    expect(outlook.landHa).toBeLessThan(base.landHa);
  });
});
