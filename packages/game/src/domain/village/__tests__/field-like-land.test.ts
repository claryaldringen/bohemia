import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import {
  foundCemetery,
  foundOrchard,
  foundPen,
  foundVillage,
  startSacredBuilding,
  type PartInput,
} from '../actions';
import { fieldPartLooks } from '../field-progress';
import { treeTakenLand } from '../land-taken';
import {
  checkPenPlacement,
  checkSacredBuildingPlacement,
  fieldPartsFromCells,
  orchardPartsFromCells,
  type PlacementVillage,
} from '../placement';
import { TAKEN_LAND_TREE_M2 } from '../rules';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, LandTaker, TileCell, VillageState } from '../types';
import { createCropWork, planPartIds } from '../year-plan';
import { block, makeLandscape } from './placement-fixtures';

// Pole jako krajina (fields.md; Martin, 18. 10. 2026: „Pole by se mělo chovat jako normální
// krajina. Takže by na něm mělo jít postavit cokoliv kromě jiného pole.“). Sad, hřbitov a ohrada
// vezmou poli celý čtverec, modla a svatyně průnik půdorysu, jabloň a strom u cesty
// TAKEN_LAND_TREE_M2. Ruční krajina 16 × 16 políček po 15 m se středem v počátku: políčko (8, 8) =
// svět 0–15 m.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const CELL = 225;
const FOUNDED = at(600, 3, 15);
const parts = (cells: TileCell[]): PartInput[] =>
  cells.map((cell, i) => ({
    areaM2: CELL,
    distanceM: 60 + 12 * i,
    naturalFertility: 70,
    surface: 'meadow',
    obstacleCost: 0,
    cell,
  }));
/** Ves s polem 4 × 3 čtverce (x 2–5, y 0–2) – k 1. 9. 600 je celé v ozimu. */
const village = (): VillageState =>
  foundVillage({
    seed: 5,
    day: FOUNDED,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: { parts: parts(block(2, 0, 4, 3)) },
  });
const autumn = (): VillageState => advanceVillage(village(), at(600, 9, 20), null);
const whole = (cell: TileCell): { cell: TileCell; areaM2: number; cellAreaM2: number } => ({
  cell,
  areaM2: CELL,
  cellAreaM2: CELL,
});
const partAt = (s: VillageState, cell: TileCell): VillageState['parts'][number] | undefined =>
  s.parts.find((p) => p.cell?.x === cell.x && p.cell.y === cell.y);
const takenBy = (s: VillageState): (LandTaker | undefined)[] =>
  s.chronicle
    .filter((e): e is Extract<ChronicleEvent, { kind: 'land-taken' }> => e.kind === 'land-taken')
    .map((e) => e.by);

/** Ostatní díly plánu vypadají po stavbě stejně (fronta práce se nepohnula). */
function othersUnchanged(before: VillageState, after: VillageState, gone: number[]): void {
  const day = before.lastDay;
  const was = fieldPartLooks(before, day);
  const now = fieldPartLooks(after, day);
  for (const id of planPartIds(after.plan!)) {
    if (gone.includes(id)) continue;
    expect(now.get(id)).toEqual(was.get(id));
  }
}

describe('stavby po čtvercích na poli – čtverec z pole zmizí', () => {
  const cell = { x: 3, y: 1 };

  it('sad: díl zmizí z pole, z plánu i z fronty práce, kronika „ustoupilo sadu“', () => {
    const s = autumn();
    const id = partAt(s, cell)!.id;
    const next = foundOrchard(s, s.lastDay, {
      squares: [{ cell, areaM2: CELL, distanceM: 70, obstacleCost: 0 }],
      takenLand: [whole(cell)],
    });
    expect(partAt(next, cell)).toBeUndefined();
    expect(planPartIds(next.plan!)).not.toContain(id);
    expect(next.orchards?.at(-1)?.squares.map((q) => q.cell)).toEqual([cell]);
    expect(takenBy(next)).toEqual(['orchard']);
    othersUnchanged(s, next, [id]);
  });

  it('hřbitov a ohrada: díl zmizí, ostatní díly beze změny', () => {
    const s = autumn();
    const id = partAt(s, cell)!.id;
    const cemetery = foundCemetery(s, s.lastDay, {
      squares: [{ cell, x: -67.5, z: -97.5, waterDistanceM: 300, obstacleCost: 0 }],
      squareSizeM: 15,
      takenLand: [whole(cell)],
    });
    expect(partAt(cemetery, cell)).toBeUndefined();
    expect(takenBy(cemetery)).toEqual(['cemetery']);
    othersUnchanged(s, cemetery, [id]);
    const pen = foundPen(
      s,
      s.lastDay,
      {
        cell,
        x: -67.5,
        z: -97.5,
        obstacleCost: 0,
        obstacleIds: [],
        clearedTrees: 0,
        takenLand: [whole(cell)],
      },
      null,
    );
    expect(partAt(pen, cell)).toBeUndefined();
    expect(planPartIds(pen.plan!)).not.toContain(id);
    expect(takenBy(pen)).toEqual(['pen']);
    othersUnchanged(s, pen, [id]);
  });

  it('modla na poli: díl pod půdorysem se o průnik zmenší, úroda a práce úměrně', () => {
    const s = autumn();
    const part = partAt(s, cell)!;
    const next = startSacredBuilding(
      s,
      s.lastDay,
      'idol',
      { x: -67.5, z: -97.5, rotation: 0 },
      0,
      [],
      {
        takenLand: [{ cell, areaM2: 16, cellAreaM2: CELL }],
      },
    );
    expect(partAt(next, cell)!.areaM2).toBeCloseTo(part.areaM2 - 16, 9);
    expect(takenBy(next)).toEqual(['idol']);
    othersUnchanged(s, next, []);
  });

  it('luštěniny v plánu: díl zmizí i z práce luštěnin', () => {
    const s = autumn();
    // část ozimu jde do luštěnin (plodina plánu jako ozim a jař)
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    const legumeIds = s.plan!.winter!.partIds.slice(-3);
    s.plan!.winter!.partIds = s.plan!.winter!.partIds.slice(0, -3);
    s.plan!.legume = createCropWork(
      legumeIds.map((id) => byId.get(id)!),
      s.lastDay,
      0,
    );
    const target = byId.get(legumeIds[1]!)!;
    const required = s.plan!.legume.required.sow;
    const next = foundOrchard(s, s.lastDay, {
      squares: [{ cell: target.cell!, areaM2: CELL, distanceM: 70, obstacleCost: 0 }],
      takenLand: [whole(target.cell!)],
    });
    expect(next.plan!.legume!.partIds).toEqual(
      s.plan!.legume.partIds.filter((id) => id !== target.id),
    );
    expect(next.plan!.legume!.required.sow).toBeLessThan(required);
  });

  it('po stavbách na poli dopočet po kouscích s JSON dá stejný stav', () => {
    const s = autumn();
    let built = foundOrchard(s, s.lastDay, {
      squares: [{ cell, areaM2: CELL, distanceM: 70, obstacleCost: 0 }],
      takenLand: [whole(cell)],
    });
    built = startSacredBuilding(
      built,
      built.lastDay,
      'idol',
      { x: -52, z: -112, rotation: 0 },
      0,
      [],
      {
        takenLand: [{ cell: { x: 4, y: 0 }, areaM2: 16, cellAreaM2: CELL }],
      },
    );
    const end = at(602, 9, 1);
    const once = advanceVillage(built, end, null);
    let chunked = JSON.parse(JSON.stringify(built)) as VillageState;
    for (const step of [1, 30, 7, 200, 365, 90, 3]) {
      if (chunked.lastDay >= end) break;
      chunked = JSON.parse(
        JSON.stringify(advanceVillage(chunked, Math.min(end, chunked.lastDay + step), null)),
      ) as VillageState;
    }
    chunked = advanceVillage(chunked, end, null);
    expect(JSON.parse(JSON.stringify(chunked))).toEqual(JSON.parse(JSON.stringify(once)));
    expect(partAt(once, { x: 4, y: 0 })!.areaM2).toBeLessThan(CELL);
  });
});

describe('kontrola umístění – stavby na poli', () => {
  const landscape = makeLandscape();
  const stone = (id: number, x: number, z: number): ObstaclePlacement => ({
    id,
    kind: 'stone',
    look: 'stone-1',
    x,
    z,
    rotation: 0,
    scale: 1,
  });
  // kámen 1 na čtverci pole (8, 8) – patří poli; kámen 2 na louce (8, 7)
  const layer = packObstacles([stone(1, 12, 5), stone(2, 12, -1)], 16, 15);
  const field: PlacementVillage = {
    dwellings: [],
    constructions: [],
    parts: block(8, 8, 2, 1).map((cell) => ({ cell, fieldId: 7, areaM2: CELL })),
  };

  it('ohrada na čtverci pole projde – celé políčko, kámen pole neplatí', () => {
    const pen = checkPenPlacement(landscape, field, { x: 8, y: 8 }, layer);
    expect(pen).toMatchObject({ ok: true, warning: 'Pole se zmenší', obstacleIds: [] });
    expect(pen.takenLand).toEqual([whole({ x: 8, y: 8 })]);
    const alone = checkPenPlacement(
      landscape,
      { ...field, parts: [field.parts[0]!] },
      { x: 8, y: 8 },
    );
    expect(alone.warning).toBe('Pole zanikne');
  });

  it('modla přes hranu pole: průnik s polem, kámen na poli neplatí, na louce ano', () => {
    // modla 4 × 4 m se středem (12, 0): z −2 … 2 – půl na poli (8, 8), půl na louce (8, 7)
    const idol = checkSacredBuildingPlacement(
      landscape,
      field,
      'idol',
      { x: 12, z: 0, rotation: 0 },
      packObstacles([stone(1, 12, 1), stone(2, 12, -1)], 16, 15),
    );
    expect(idol).toMatchObject({ ok: true, warning: 'Pole se zmenší', obstacleIds: [2] });
    expect(idol.takenLand).toEqual([{ cell: { x: 8, y: 8 }, areaM2: 8, cellAreaM2: CELL }]);
  });

  it('pole na pole dál nesmí; sad na sad taky ne', () => {
    expect(
      fieldPartsFromCells(landscape, field, block(8, 8, 1, 1), [{ x: -100, z: -100, rotation: 0 }])
        .check.reason,
    ).toBe('Pole se překrývá s jiným polem.');
    const orchard: PlacementVillage = {
      ...field,
      orchards: [{ squares: [{ cell: { x: 6, y: 8 } }] }],
    };
    expect(
      orchardPartsFromCells(
        landscape,
        orchard,
        [{ x: 6, y: 8 }],
        [{ x: -100, z: -100, rotation: 0 }],
      ).check.reason,
    ).toBe('Sad se překrývá s jiným sadem.');
  });

  it('strom u cesty na poli vezme dílu 20 m², vedle pole nic', () => {
    const taken = treeTakenLand(landscape, field, [
      { x: 3, z: 3 },
      { x: 4, z: 9 },
      { x: 20, z: 3 },
      { x: 50, z: 3 },
    ]);
    expect(taken).toEqual([
      { cell: { x: 8, y: 8 }, areaM2: 2 * TAKEN_LAND_TREE_M2, cellAreaM2: CELL },
      { cell: { x: 9, y: 8 }, areaM2: TAKEN_LAND_TREE_M2, cellAreaM2: CELL },
    ]);
  });
});
