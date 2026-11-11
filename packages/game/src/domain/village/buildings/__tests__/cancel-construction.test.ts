import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { packObstacles } from '../../../landscape';
import {
  foundCemetery,
  foundField,
  foundOrchard,
  foundPen,
  foundVillage,
  startReplacement,
  startThreshingFloor,
  type CemeteryInput,
} from '../../core/actions';
import { cancelBlock, cancelConstruction } from '../cancel-construction';
import { penSquaresFromCells } from '../../placement/placement';
import type { Construction, VillageState } from '../../types';
import { block, makeLandscape } from '../../__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Zrušení rozestavěné stavby (Martin 23. 10. 2026): vytýčení zmizí, nespotřebované dřevo se vrátí.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const landscape = makeLandscape();

function village(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 5, day: DAY, dwellingPosition: { x: -90, z: -90, rotation: 0 } }),
  );
  s.woodLogs = 100;
  s.storesKg = 50_000;
  return s;
}

const last = (s: VillageState): Construction => s.constructions.at(-1)!;
const cemeteryInput = (cells: { x: number; y: number }[]): CemeteryInput => ({
  squares: cells.map((cell) => ({
    cell,
    x: cell.x * 15,
    z: cell.y * 15,
    waterDistanceM: 300,
    obstacleCost: 0,
  })),
  squareSizeM: 15,
});

describe('cancelConstruction', () => {
  it('nové obydlí: stavba zmizí, nespotřebované dřevo se vrátí podle odvedené práce', () => {
    const s = village();
    const started = startReplacement(
      s,
      DAY,
      s.dwellings[0]!.id,
      'polozemnice',
      { x: 40, z: 40, rotation: 0 },
      0,
    );
    const c = last(started);
    const logs = started.woodLogs ?? 0;
    const trees = c.wood!.trees;
    const untouched = cancelConstruction(started, DAY, c.id);
    expect(untouched.constructions.some((x) => x.id === c.id)).toBe(false);
    expect(untouched.woodLogs).toBe(logs + c.wood!.fromPile + c.wood!.felled);
    // polovina práce odvedena – polovina dřeva je zabudovaná
    const half = structuredClone(started);
    const hc = half.constructions.find((x) => x.id === c.id)!;
    hc.done = hc.cost / 2;
    const back = cancelConstruction(half, DAY, c.id);
    expect(back.woodLogs).toBe(logs + c.wood!.fromPile + c.wood!.felled - Math.floor(trees / 2));
    expect(back.chronicle.at(-1)).toMatchObject({ kind: 'relocation-cancelled' });
    // vstupní stav se nemění
    expect(started.constructions.some((x) => x.id === c.id)).toBe(true);
  });

  it('první zemnici zakladatelů, neznámou stavbu a den do minulosti odmítne', () => {
    const founded = foundVillage({
      seed: 7,
      day: DAY,
      dwellingPosition: { x: 0, z: 0, rotation: 0 },
    });
    const first = founded.constructions[0]!;
    expect(cancelBlock(first)).not.toBeNull();
    expect(() => cancelConstruction(founded, DAY, first.id)).toThrow(RangeError);
    expect(() => cancelConstruction(founded, DAY, 99999)).toThrow(RangeError);
    const s = village();
    const started = startReplacement(
      s,
      DAY,
      s.dwellings[0]!.id,
      'zemnice',
      { x: 40, z: 40, rotation: 0 },
      0,
    );
    expect(() => cancelConstruction(started, started.lastDay - 1, last(started).id)).toThrow(
      RangeError,
    );
  });

  it('humno: zmizí stavba i rozestavěné humno, klády se vrátí', () => {
    const s = village();
    const started = startThreshingFloor(s, DAY, { x: 60, z: 30, rotation: 0 }, null);
    const cancelled = cancelConstruction(started, DAY, last(started).id);
    expect(cancelled.threshingFloors ?? []).toEqual([]);
    expect(cancelled.constructions.length).toBe(s.constructions.length);
    expect(cancelled.woodLogs).toBe(s.woodLogs);
  });

  it('pole: nehotové díly zmizí, hotové zůstanou', () => {
    const s = village();
    const part = {
      areaM2: 225,
      distanceM: 60,
      naturalFertility: 70,
      surface: 'meadow' as const,
      obstacleCost: 0,
    };
    const started = foundField(s, DAY, {
      parts: Array.from({ length: 6 }, (_, i) => ({ ...part, distanceM: 60 + i })),
    });
    const c = last(started);
    const before = started.parts.length;
    started.parts.find((p) => p.fieldId === c.fieldId)!.state = 'ready';
    const cancelled = cancelConstruction(started, DAY, c.id);
    expect(cancelled.parts.length).toBe(before - 5);
    expect(cancelled.parts.some((p) => p.state === 'founding')).toBe(false);
    expect(cancelled.constructions.some((x) => x.id === c.id)).toBe(false);
  });

  it('sad: nevysázené čtverce zmizí, prázdný sad celý', () => {
    const s = village();
    const started = foundOrchard(s, DAY, {
      squares: [{ cell: { x: 3, y: 1 }, areaM2: 225, distanceM: 70, obstacleCost: 0 }],
    });
    const cancelled = cancelConstruction(started, DAY, last(started).id);
    expect(cancelled.orchards ?? []).toEqual([]);
    expect(cancelled.constructions.length).toBe(s.constructions.length);
  });

  it('hřbitov: nový zmizí celý, rozšíření jen své čtverce', () => {
    const s = village();
    const base = foundCemetery(s, DAY, cemeteryInput([{ x: 3, y: 3 }]));
    const gone = cancelConstruction(base, DAY, last(base).id);
    expect(gone.cemeteries ?? []).toEqual([]);
    expect(gone.constructions.length).toBe(s.constructions.length);
    // rozšíření nehotového hřbitova se zruší samo, základ zůstane
    const extended = foundCemetery(base, DAY, cemeteryInput([{ x: 4, y: 3 }]));
    expect(extended.cemeteries![0]!.squares).toHaveLength(2);
    const trimmed = cancelConstruction(extended, DAY, last(extended).id);
    expect(trimmed.cemeteries![0]!.squares).toHaveLength(1);
    expect(trimmed.constructions.some((c) => c.kind === 'cemetery')).toBe(true);
    // zrušení základu vezme i rozšíření
    const baseId = extended.constructions.find((c) => c.kind === 'cemetery')!.id;
    const all = cancelConstruction(extended, DAY, baseId);
    expect(all.cemeteries ?? []).toEqual([]);
    expect(all.constructions.some((c) => c.kind === 'cemetery')).toBe(false);
  });

  it('ohrada: nová zmizí s dřevem, rozšíření hotové ohrady jen své čtverce', () => {
    const s = village();
    const check = penSquaresFromCells(landscape, s, block(4, 4, 1, 1), 'pig', EMPTY);
    const started = foundPen(s, DAY, { species: 'pig', squares: check.squares }, EMPTY);
    const gone = cancelConstruction(started, DAY, last(started).id);
    expect(gone.pens ?? []).toEqual([]);
    expect(gone.woodLogs).toBe(s.woodLogs);
    const built = structuredClone(started);
    built.pens![0]!.builtDay = DAY;
    built.constructions = [];
    const ext = penSquaresFromCells(landscape, built, block(4, 5, 1, 1), 'pig', EMPTY);
    const extended = foundPen(built, DAY, { species: 'pig', squares: ext.squares }, EMPTY);
    const trimmed = cancelConstruction(extended, DAY, last(extended).id);
    expect(trimmed.pens).toHaveLength(1);
    expect(trimmed.pens![0]!.extraSquares).toBeUndefined();
    expect(trimmed.woodLogs).toBe(built.woodLogs);
  });

  it('hotový hřbitov a ohradu zrušení stavby bez čtverců nesmaže', () => {
    const s = village();
    const base = foundCemetery(s, DAY, cemeteryInput([{ x: 3, y: 3 }]));
    base.cemeteries![0]!.builtDay = DAY;
    base.constructions = [];
    const ext = foundCemetery(base, DAY, cemeteryInput([{ x: 4, y: 3 }]));
    for (const q of ext.cemeteries![0]!.squares) delete q.constructionId;
    const kept = cancelConstruction(ext, DAY, last(ext).id);
    expect(kept.cemeteries).toHaveLength(1);
    expect(kept.cemeteries![0]!.squares).toHaveLength(2);

    const check = penSquaresFromCells(landscape, s, block(4, 4, 1, 1), 'pig', EMPTY);
    const pen = foundPen(s, DAY, { species: 'pig', squares: check.squares }, EMPTY);
    pen.pens![0]!.builtDay = DAY;
    pen.constructions = [];
    const more = penSquaresFromCells(landscape, pen, block(4, 5, 1, 1), 'pig', EMPTY);
    const grown = foundPen(pen, DAY, { species: 'pig', squares: more.squares }, EMPTY);
    for (const q of grown.pens![0]!.extraSquares ?? []) delete q.constructionId;
    const keptPen = cancelConstruction(grown, DAY, last(grown).id);
    expect(keptPen.pens).toHaveLength(1);
    expect(keptPen.pens![0]!.extraSquares).toHaveLength(1);
  });

  it('vrácení dřeva: 0 <= vráceno <= fromPile + felled i při done = cost a smíšeném zdroji', () => {
    const s = village();
    const started = startReplacement(
      s,
      DAY,
      s.dwellings[0]!.id,
      'polozemnice',
      { x: 40, z: 40, rotation: 0 },
      0,
    );
    const c = last(started);
    for (const [fromPile, felled] of [
      [3, 2],
      [0, 4],
      [5, 0],
    ] as const) {
      for (const done of [0, c.cost / 3, c.cost, c.cost * 2]) {
        const t = structuredClone(started);
        const tc = t.constructions.find((x) => x.id === c.id)!;
        tc.wood = { ...tc.wood!, fromPile, felled };
        tc.done = done;
        const before = t.woodLogs ?? 0;
        const back = (cancelConstruction(t, DAY, c.id).woodLogs ?? 0) - before;
        expect(back).toBeGreaterThanOrEqual(0);
        expect(back).toBeLessThanOrEqual(fromPile + felled);
        if (done >= c.cost) expect(back).toBe(Math.max(0, fromPile + felled - tc.wood.trees));
      }
    }
  });
});
