import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import {
  obstaclesOf,
  packObstacles,
  type ObstacleLayer,
  type ObstaclePlacement,
} from '../../../landscape';
import { foundField, foundVillage } from '../../core/actions';
import {
  burnFromDay,
  clearingBurnCost,
  clearingFellCost,
  clearingNeedToday,
  clearingStage,
  treesDue,
} from '../forest-clearing';
import { fieldPartsFromCells, placementVillageOf } from '../../placement/placement';
import { NO_CRAFTS, foundingCostPerHa } from '../../core/productivity';
import { FOREST_CLEARING } from '../../rules';
import { advanceVillage } from '../../core/simulate';
import type { FieldPart, Person, Position, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Fáze klučení lesa (forest.md – Klučení lesa pro pole – postup): čisté funkce a vznik dílu.

const SQUARE_HA = 225 / 10_000;
const FOREST_COST = foundingCostPerHa('forest', NO_CRAFTS.tools) * SQUARE_HA;

/** Díl v lese s `n` stromy a ukončeným pádem v den `felledDay` (volitelně). */
function part(n: number, over: Partial<FieldPart> = {}, felledDay?: number): FieldPart {
  const foundingCost = FOREST_COST;
  return {
    id: 1,
    fieldId: 1,
    areaM2: 225,
    distanceM: 50,
    naturalFertility: 50,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'founding',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost,
    foundingDone: 0,
    surface: 'forest',
    clearing: {
      fell: Array.from({ length: n }, (_, i) => ({ id: i + 1, log: i % 2 === 0 })),
      felled: 0,
      burnCost: clearingBurnCost(225, NO_CRAFTS.tools),
      ...(felledDay === undefined ? {} : { felledDay }),
    },
    ...over,
  };
}

describe('cena kácení a pálení', () => {
  it('60 % kácení a 40 % pálení z ceny lesa, s řemesly i bez', () => {
    for (const tools of [0, 0.5, 1]) {
      const total = foundingCostPerHa('forest', tools) * SQUARE_HA;
      const burn = clearingBurnCost(225, tools);
      expect(burn).toBeCloseTo(total * (1 - FOREST_CLEARING.fellShare));
      const p = part(3, { foundingCost: total });
      p.clearing!.burnCost = burn;
      expect(clearingFellCost(p)).toBeCloseTo(total * FOREST_CLEARING.fellShare);
    }
  });

  it('kameny zůstávají v kácení – pálení se nemění', () => {
    const p = part(2, { foundingCost: FOREST_COST + 3 });
    expect(clearingFellCost(p)).toBeCloseTo(FOREST_COST * 0.6 + 3);
  });
});

describe('fáze čtverce', () => {
  const MARCH = dayIndexOf({ year: 600, month: 3, day: 1 });
  const fellCost = clearingFellCost(part(2));

  it('díl bez fází nebo hotový nemá fázi', () => {
    expect(clearingStage({ ...part(2), clearing: undefined }, MARCH)).toBeNull();
    expect(clearingStage({ ...part(2), foundingDone: FOREST_COST }, MARCH)).toBeNull();
    expect(clearingStage({ ...part(2), state: 'ready' }, MARCH)).toBeNull();
  });

  it('kácení, dokud není odvedena práce kácení', () => {
    expect(clearingStage(part(2), MARCH)).toBe('fell');
    expect(clearingStage(part(2, { foundingDone: fellCost - 0.01 }), MARCH)).toBe('fell');
  });

  it('schnutí 29 dní, 30. den pálení (v okně)', () => {
    const done = { foundingDone: fellCost };
    expect(clearingStage(part(2, done, MARCH), MARCH + 29)).toBe('dry');
    expect(clearingStage(part(2, done, MARCH), MARCH + 30)).toBe('burn');
  });

  it('pálí se od 1. 3. do 31. 10., v zimě jen schne', () => {
    const done = { foundingDone: fellCost };
    const oct31 = dayIndexOf({ year: 600, month: 10, day: 31 });
    const nov1 = dayIndexOf({ year: 600, month: 11, day: 1 });
    const feb28 = dayIndexOf({ year: 601, month: 2, day: 28 });
    const mar1 = dayIndexOf({ year: 601, month: 3, day: 1 });
    const early = dayIndexOf({ year: 600, month: 6, day: 1 });
    expect(clearingStage(part(2, done, early), oct31)).toBe('burn');
    expect(clearingStage(part(2, done, early), nov1)).toBe('dry');
    expect(clearingStage(part(2, done, early), feb28)).toBe('dry');
    expect(clearingStage(part(2, done, early), mar1)).toBe('burn');
  });

  it('potřeba dne: kácení zbytek kácení, schnutí nic, pálení zbytek celku', () => {
    expect(clearingNeedToday(part(2), MARCH)).toBeCloseTo(fellCost);
    const done = { foundingDone: fellCost };
    expect(clearingNeedToday(part(2, done, MARCH), MARCH + 10)).toBe(0);
    expect(clearingNeedToday(part(2, done, MARCH), MARCH + 30)).toBeCloseTo(FOREST_COST - fellCost);
    expect(
      clearingNeedToday({ ...part(2, { foundingDone: 1 }), clearing: undefined }, MARCH),
    ).toBeCloseTo(FOREST_COST - 1);
  });

  it('první den pálení: po schnutí, v zimě až v březnu', () => {
    expect(burnFromDay(part(2))).toBeNull();
    const june = dayIndexOf({ year: 600, month: 6, day: 1 });
    expect(burnFromDay(part(2, {}, june))).toBe(june + 30);
    const nov = dayIndexOf({ year: 600, month: 11, day: 5 });
    expect(burnFromDay(part(2, {}, nov))).toBe(dayIndexOf({ year: 601, month: 3, day: 1 }));
  });
});

describe('pády stromů podle práce', () => {
  it('strom i padne při i+1 dílu kácení', () => {
    const p = part(4);
    const f = clearingFellCost(p);
    expect(treesDue(p, 0)).toBe(0);
    expect(treesDue(p, f * 0.24)).toBe(0);
    expect(treesDue(p, f * 0.25)).toBe(1);
    expect(treesDue(p, f * 0.5)).toBe(2);
    expect(treesDue(p, f * 0.99)).toBe(3);
    expect(treesDue(p, f)).toBe(4);
    expect(treesDue(p, f * 3)).toBe(4);
  });

  it('čtverec bez stromů – nic nepadá', () => {
    expect(treesDue(part(0), 100)).toBe(0);
  });
});

// --- vznik dílu z náhledu ----------------------------------------------------------------

const landscape = makeLandscape({ surface: (x) => (x >= 8 ? 'forest' : 'meadow') });
const DAY = dayIndexOf({ year: 600, month: 10, day: 1 });
const HOME: Position = { x: -60, z: 0, rotation: 0 };

const look = {
  tree: 'beech-1',
  youngTree: 'fir-young-1',
  snag: 'snag-1',
  stump: 'stump',
} as const;
const obstacle = (
  id: number,
  kind: keyof typeof look,
  x: number,
  z: number,
): ObstaclePlacement => ({ id, kind, look: look[kind], x, z, rotation: 0, scale: 1 });

// čtverec (8, 8) = svět 0–15 m; tři stromy, souš, mladý stromek a pařez (ten nestojí)
const layer: ObstacleLayer = packObstacles(
  [
    obstacle(1, 'tree', 12, 4),
    obstacle(2, 'tree', 2, 4),
    obstacle(3, 'snag', 6, 6),
    obstacle(4, 'youngTree', 2, 4),
    obstacle(5, 'stump', 8, 8),
    obstacle(6, 'tree', 7, 12),
  ],
  16,
  15,
);
void obstaclesOf;

function village(): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 11, day: DAY, dwellingPosition: HOME }));
  const adult = (id: number): Person => ({ id, bornDay: DAY - 30 * 366, dwellingId: 1 });
  s.people = [adult(2), adult(3)];
  s.constructions = [];
  s.storesKg = 5000;
  s.woodLogs = 0;
  s.lastDay = DAY;
  return s;
}

describe('díl v lese s fázemi', () => {
  const preview = (v: ReturnType<typeof placementVillageOf> | null = null) =>
    fieldPartsFromCells(landscape, v, block(8, 8, 1, 1), [HOME], layer);

  it('stojící stromy v pořadí od obydlí, souše a mladé bez klády, pařez ne', () => {
    const p = preview().parts[0]!;
    // HOME je na západě (x = -60): nejblíž má strom s nejmenším x; shoda (2, 4) podle id
    expect(p.standing).toEqual([
      { id: 2, log: true },
      { id: 4, log: false },
      { id: 3, log: false },
      { id: 6, log: true },
      { id: 1, log: true },
    ]);
    expect(p.trees).toBe(3);
  });

  it('vyhrazený strom se z pořadí vynechá', () => {
    const s = village();
    const pv = { ...placementVillageOf(s, DAY), reservedTrees: [2] };
    expect(preview(pv).parts[0]!.standing!.map((t) => t.id)).toEqual([4, 3, 6, 1]);
  });

  it('založení: díl dostane clearing místo trees, klád stejně jako dřív', () => {
    const s = village();
    const wide = fieldPartsFromCells(
      landscape,
      placementVillageOf(s, DAY),
      block(6, 8, 4, 2),
      [HOME],
      layer,
    );
    const founded = foundField(s, DAY, { parts: wide.parts });
    const p = founded.parts.find((x) => x.cell?.x === 8 && x.cell.y === 8)!;
    expect(p.trees).toBeUndefined();
    expect(p.clearing!.fell).toHaveLength(5);
    expect(p.clearing!.felled).toBe(0);
    expect(p.clearing!.burnCost).toBeCloseTo(clearingBurnCost(p.areaM2, 0));
    const after = advanceVillage(founded, DAY + 2 * 365, layer);
    expect(after.parts.every((x) => x.state !== 'founding')).toBe(true);
    expect(after.parts.every((x) => x.clearing === undefined)).toBe(true);
    // 3 klády, hnijí ≈ 4 % ročně
    expect(after.woodLogs).toBeLessThanOrEqual(3);
    expect(after.woodLogs).toBeGreaterThan(3 * 0.9);
  });

  it('louka dílu s fázemi nedostane', () => {
    const p = fieldPartsFromCells(landscape, null, block(6, 8, 1, 1), [HOME], layer).parts[0]!;
    expect(p.standing).toBeUndefined();
  });
});
