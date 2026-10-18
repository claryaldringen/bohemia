import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundField, foundVillage, type PartInput } from '../actions';
import { fieldsTouching } from '../fields';
import { fieldPartsFromCells, placementVillageOf } from '../placement';
import { advanceVillage } from '../simulate';
import type { TileCell, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Navazující pole (fields.md; Martin, 18. 10. 2026: „Pokud více polí navazuje přímo na sebe,
// počítají se jako jedno.“): čtverce navazující stranou na pole ho rozšíří, na víc polí je sloučí
// do nejstaršího.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const DAY = at(600, 3, 15);
const parts = (cells: TileCell[]): PartInput[] =>
  cells.map((cell) => ({
    areaM2: 225,
    distanceM: 60 + cell.x,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
    cell,
  }));
const village = (): VillageState =>
  withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
  );
const fieldOf = (s: VillageState, id: number): number =>
  s.parts.filter((p) => p.fieldId === id).length;

describe('fieldsTouching', () => {
  it('jen pole, na která čtverce navazují stranou, od nejstaršího; díly bez políčka ne', () => {
    const existing = [
      { cell: { x: 0, y: 0 }, fieldId: 9 },
      { cell: { x: 5, y: 0 }, fieldId: 4 },
      { fieldId: 2 },
    ];
    expect(fieldsTouching(existing, [{ x: 1, y: 0 }])).toEqual([9]);
    expect(fieldsTouching(existing, [{ x: 1, y: 1 }])).toEqual([]); // jen rohem
    expect(fieldsTouching(existing, block(1, 0, 4, 1))).toEqual([4, 9]);
  });
});

describe('foundField – navazující pole', () => {
  it('čtverce u pole ho rozšíří: stejné id, díly na konec, běžící založení dostane jejich cenu', () => {
    const s0 = foundField(village(), DAY, { parts: parts(block(0, 0, 3, 2)) });
    const fieldId = s0.fields[0]!.id;
    const construction = s0.constructions.find((c) => c.kind === 'field')!;
    const s = foundField(s0, DAY, { parts: parts(block(3, 0, 1, 2)) });
    expect(s.fields.map((f) => f.id)).toEqual([fieldId]);
    expect(fieldOf(s, fieldId)).toBe(8);
    const fields = s.constructions.filter((c) => c.kind === 'field');
    expect(fields).toHaveLength(1);
    expect(fields[0]!.cost).toBeCloseTo(construction.cost * (8 / 6), 9);
  });

  it('rozšíření hotového pole je nová stavba s průběhem jen z nových dílů', () => {
    const founded = advanceVillage(
      foundField(village(), DAY, { parts: parts(block(0, 0, 3, 2)) }),
      at(600, 6, 1),
      null,
    );
    expect(founded.constructions.some((c) => c.kind === 'field')).toBe(false);
    const fieldId = founded.fields[0]!.id;
    const s = foundField(founded, founded.lastDay, { parts: parts(block(0, 2, 3, 1)) });
    expect(s.fields).toHaveLength(1);
    const c = s.constructions.find((x) => x.kind === 'field')!;
    expect(c.fieldId).toBe(fieldId);
    const later = advanceVillage(s, founded.lastDay + 3, null);
    const running = later.constructions.find((x) => x.id === c.id);
    if (running) expect(running.done).toBeLessThanOrEqual(running.cost);
    const done = advanceVillage(s, at(600, 9, 1), null);
    expect(done.constructions.some((x) => x.id === c.id)).toBe(false);
    expect(done.parts.filter((p) => p.fieldId === fieldId)).toHaveLength(9);
  });

  it('čtverce mezi dvěma poli je sloučí do nejstaršího – díly, stavby, kronika, práce dne', () => {
    let s = foundField(village(), DAY, { parts: parts(block(0, 0, 2, 3)) });
    s = foundField(s, DAY, { parts: parts(block(4, 0, 2, 3)) });
    const [older, newer] = s.fields.map((f) => f.id) as [number, number];
    expect(s.constructions.filter((c) => c.kind === 'field')).toHaveLength(2);
    // starší pole je hotové a v kronice; mladší se zakládá
    s = advanceVillage(s, DAY + 40, null);
    const costs = s.constructions.filter((c) => c.kind === 'field').reduce((a, c) => a + c.cost, 0);
    const merged = foundField(s, s.lastDay, { parts: parts(block(2, 1, 2, 1)) });
    expect(merged.fields.map((f) => f.id)).toEqual([older]);
    expect(fieldOf(merged, older)).toBe(6 + 6 + 2);
    expect(merged.parts.some((p) => p.fieldId === newer)).toBe(false);
    const fields = merged.constructions.filter((c) => c.kind === 'field');
    expect(fields.length).toBeLessThanOrEqual(1);
    for (const c of fields) expect(c.fieldId).toBe(older);
    if (fields[0]) expect(fields[0].cost).toBeGreaterThan(costs - 1e-9);
    for (const e of merged.chronicle) {
      if (e.kind === 'construction-finished') expect(e.fieldId).not.toBe(newer);
    }
    for (const share of merged.labor?.shares ?? []) {
      if (share.target.kind === 'field') expect(share.target.id).not.toBe(newer);
    }
  });

  it('sloučení rozestavěných polí: jedna stavba (nejstarší) s cenou a prací obou', () => {
    let s = foundField(village(), DAY, { parts: parts(block(0, 0, 2, 3)) });
    s = foundField(s, DAY, { parts: parts(block(4, 0, 2, 3)) });
    s = advanceVillage(s, DAY + 3, null);
    const before = s.constructions.filter((c) => c.kind === 'field');
    expect(before).toHaveLength(2);
    const merged = foundField(s, s.lastDay, { parts: parts(block(2, 1, 2, 1)) });
    const after = merged.constructions.filter((c) => c.kind === 'field');
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(Math.min(...before.map((c) => c.id)));
    expect(after[0]!.done).toBeCloseTo(before[0]!.done + before[1]!.done, 9);
    expect(after[0]!.cost).toBeGreaterThan(before[0]!.cost + before[1]!.cost);
  });

  it('po rozšíření a sloučení dopočet po kouscích s JSON dá stejný stav', () => {
    let s = foundField(village(), DAY, { parts: parts(block(0, 0, 2, 3)) });
    s = foundField(s, DAY, { parts: parts(block(4, 0, 2, 3)) });
    s = foundField(s, DAY, { parts: parts(block(2, 1, 2, 1)) });
    const end = at(603, 2, 1);
    const whole = advanceVillage(s, end, null);
    let chunked = JSON.parse(JSON.stringify(s)) as VillageState;
    for (const step of [1, 30, 7, 200, 365, 90, 3]) {
      if (chunked.lastDay >= end) break;
      chunked = JSON.parse(
        JSON.stringify(advanceVillage(chunked, Math.min(end, chunked.lastDay + step), null)),
      ) as VillageState;
    }
    chunked = advanceVillage(chunked, end, null);
    expect(JSON.parse(JSON.stringify(chunked))).toEqual(JSON.parse(JSON.stringify(whole)));
  });

  it('staré pole bez políček (z obrysu) nenavazuje – vznikne nové pole', () => {
    const old = foundField(village(), DAY, { parts: parts(block(0, 0, 3, 2)) });
    for (const p of old.parts) delete p.cell;
    const s = foundField(old, DAY, { parts: parts(block(3, 0, 2, 3)) });
    expect(s.fields).toHaveLength(2);
  });
});

describe('fieldPartsFromCells – náhled navazujícího pole', () => {
  const landscape = makeLandscape();
  const home = [{ x: 0, z: 0, rotation: 0 }];

  it('hlásí, které pole rozšíří nebo sloučí; menší přístavek projde, když pole má výměru', () => {
    let s = foundField(village(), DAY, { parts: parts(block(4, 4, 2, 3)) });
    s = foundField(s, DAY, { parts: parts(block(8, 4, 2, 3)) });
    const [a, b] = s.fields.map((f) => f.id);
    const preview = (cells: TileCell[]): ReturnType<typeof fieldPartsFromCells> =>
      fieldPartsFromCells(landscape, placementVillageOf(s, DAY), cells, home);
    expect(preview(block(12, 4, 2, 3)).joinedFields).toEqual([]);
    const extend = preview(block(6, 4, 1, 1));
    expect(extend.joinedFields).toEqual([a]);
    expect(extend.check.ok).toBe(true); // jeden čtverec – pole i s ním má aspoň 0,1 ha
    expect(preview(block(6, 5, 2, 1)).joinedFields).toEqual([a, b]);
    // samostatné pole pod nejmenší výměrou neprojde
    expect(preview(block(12, 4, 1, 1)).check.ok).toBe(false);
  });
});
