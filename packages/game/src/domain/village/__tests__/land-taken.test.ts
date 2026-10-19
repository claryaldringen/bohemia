import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import {
  foundField,
  foundOrchard,
  foundVillage,
  startNewDwelling,
  type OrchardSquareInput,
  type PartInput,
} from '../actions';
import { distanceFactor } from '../fields';
import { fieldPartLooks, frontierPart } from '../field-progress';
import { HAY, planMowing } from '../hay';
import { giveWayToBuilding, landLeftM2, type TakenLand } from '../land-taken';
import { squareHarvestWork, squareYieldKg, villageOrchards } from '../orchard';
import {
  checkDwellingPlacement,
  checkPlotPlacement,
  checkWorkshopPlacement,
  type PlacementVillage,
} from '../placement';
import { relocationPlot } from '../plots';
import { HAY_WORK_PER_HA, TAKEN_LAND_MIN_SHARE } from '../rules';
import { advanceVillage } from '../simulate';
import type { ChronicleEvent, CropWork, TileCell, VillageState } from '../types';
import { logsFromClearedTrees } from '../wood';
import {
  createCropWork,
  expectedWinterKg,
  partWeight,
  planPartIds,
  tilledShare,
} from '../year-plan';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Obydlí na poli a v sadu (population.md; Martin, 18. 10. 2026: „domy by měly jít stavět na
// polích a v sadech. Pole a sad se prostě zmenší o plochu domu“). Ruční krajina 16 × 16 políček
// po 15 m se středem v počátku: políčko (8, 8) = svět 0–15 m.

const at = (year: number, month: number, day: number): number => dayIndexOf({ year, month, day });
const YEAR = 365.25;
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
/** Ves s polem 4 × 3 čtverce – všech 12 dílů jde k 1. 9. 600 do ozimu. */
const village = (): VillageState =>
  foundVillage({
    seed: 5,
    day: FOUNDED,
    dwellingPosition: { x: 0, z: 0, rotation: 0 },
    firstField: { parts: parts(block(2, 0, 4, 3)) },
  });
const whole = (cell: TileCell): TakenLand => ({ cell, areaM2: CELL, cellAreaM2: CELL });
const partOf = (s: VillageState, id: number): VillageState['parts'][number] | undefined =>
  s.parts.find((p) => p.id === id);
/** Váha dílů v pořadí práce (plocha × vzdálenost) – potřebná práce plodiny jí má být úměrná. */
const weight = (s: VillageState, ids: readonly number[]): number =>
  ids.reduce((sum, id) => {
    const p = partOf(s, id)!;
    return sum + (p.areaM2 / 10_000) * distanceFactor(p.distanceM);
  }, 0);
const landEvents = (s: VillageState): Extract<ChronicleEvent, { kind: 'land-taken' }>[] =>
  s.chronicle.filter(
    (e): e is Extract<ChronicleEvent, { kind: 'land-taken' }> => e.kind === 'land-taken',
  );

/** Zemnice zakladatelů dostavěná a plná dospělých – z domácnosti se může oddělit mladý pár. */
function settled(state: VillageState): VillageState {
  const s = withBuiltFirstDwelling(state);
  const day = s.lastDay;
  const home = s.dwellings[0]!.id;
  for (const p of s.people) {
    p.bornDay = day - Math.ceil(20 * YEAR);
    p.dwellingId = home;
  }
  while (s.people.length < 6) {
    s.people.push({
      id: 900 + s.people.length,
      bornDay: day - Math.ceil(22 * YEAR),
      dwellingId: home,
    });
  }
  return s;
}

describe('landLeftM2 – práh', () => {
  it(`díl, kterému zbude méně než ${TAKEN_LAND_MIN_SHARE * 100} % políčka, zmizí celý`, () => {
    expect(landLeftM2(CELL, 100, CELL)).toBe(125);
    expect(landLeftM2(CELL, CELL - TAKEN_LAND_MIN_SHARE * CELL, CELL)).toBeCloseTo(45, 9);
    expect(landLeftM2(CELL, 181, CELL)).toBe(0);
    expect(landLeftM2(150, CELL, CELL)).toBe(0);
  });
});

describe('giveWayToBuilding – díl pole v plánu osevu', () => {
  const autumn = (): VillageState => advanceVillage(village(), at(600, 9, 2), null);

  it('pozemek na čtverci: díl zmizí z pole, z plánu i z fronty práce – ostatní díly beze změny', () => {
    const base = autumn();
    const day = base.lastDay;
    const winter = base.plan!.winter!;
    const byId = new Map(base.parts.map((p) => [p.id, p]));
    const frontier = frontierPart(winter, byId, 'dig', day)!;
    // hotový díl, čelo kopání a díl, ke kterému práce ještě nedošla
    for (const id of [winter.partIds[0]!, frontier, winter.partIds.at(-1)!]) {
      const s = structuredClone(base);
      const part = partOf(s, id)!;
      const before = fieldPartLooks(s, day);
      giveWayToBuilding(s, day, [whole(part.cell!)]);
      expect(partOf(s, id)).toBeUndefined();
      expect(planPartIds(s.plan!)).not.toContain(id);
      const after = fieldPartLooks(s, day);
      const others = winter.partIds.filter((x) => x !== id);
      for (const other of others) expect(after.get(other)).toEqual(before.get(other));
      // potřebná práce zbylých dílů úměrná jejich váze, jako před stavbou
      for (const task of ['dig', 'sow', 'weed', 'harvest', 'thresh'] as const) {
        expect(s.plan!.winter!.required[task] / weight(s, others)).toBeCloseTo(
          winter.required[task] / weight(base, winter.partIds),
          9,
        );
      }
      expect(landEvents(s)).toEqual([
        {
          day,
          kind: 'land-taken',
          land: 'field',
          id: part.fieldId,
          areaM2: CELL,
          gone: false,
          by: 'dwelling',
        },
      ]);
    }
  });

  it('zemnice přes dva díly: oba se zmenší o průnik, díl pod prahem zmizí; úroda úměrně', () => {
    const s = advanceVillage(village(), at(601, 6, 30), null);
    const day = s.lastDay;
    const work = s.plan!.winter!;
    // zaseto a opleto celé – úroda (při plné sklizni) je úměrná ploše
    expect(work.done.sow).toBeCloseTo(work.required.sow, 9);
    expect(work.done.weed).toBeCloseTo(work.required.weed, 9);
    const [a, b] = work.partIds as [number, number];
    const kg = expectedWinterKg(work, s.parts, day);
    // úroda jednoho dílu (díly se liší vyčerpáním úrodnosti)
    const partKg = (id: number): number => expectedWinterKg(work, [partOf(s, id)!], day);
    expect(partKg(a)).toBeGreaterThan(0);
    const next = structuredClone(s);
    giveWayToBuilding(next, day, [
      { cell: partOf(s, a)!.cell!, areaM2: 100, cellAreaM2: CELL },
      { cell: partOf(s, b)!.cell!, areaM2: 190, cellAreaM2: CELL },
    ]);
    expect(partOf(next, a)!.areaM2).toBeCloseTo(125, 9);
    expect(partOf(next, b)).toBeUndefined(); // zbylo by 35 m² < 45 m²
    expect(expectedWinterKg(next.plan!.winter!, next.parts, day)).toBeCloseTo(
      kg - (partKg(a) * 100) / CELL - partKg(b),
      9,
    );
    const ids = next.plan!.winter!.partIds;
    expect(next.plan!.winter!.required.harvest / weight(next, ids)).toBeCloseTo(
      work.required.harvest / weight(s, work.partIds),
      9,
    );
    expect(landEvents(next)).toEqual([
      {
        day,
        kind: 'land-taken',
        land: 'field',
        id: partOf(s, a)!.fieldId,
        areaM2: 325,
        gone: false,
        by: 'dwelling',
      },
    ]);
  });

  it('sklizená plodina se nemění – úroda je v zásobách, výmlat zůstane', () => {
    const s = advanceVillage(village(), at(601, 8, 15), null);
    const day = s.lastDay;
    const work: CropWork = structuredClone(s.plan!.winter!);
    expect(work.harvestedKg).not.toBeNull();
    const id = work.partIds[3]!;
    giveWayToBuilding(s, day, [whole(partOf(s, id)!.cell!)]);
    expect(s.plan!.winter!.required).toEqual(work.required);
    expect(s.plan!.winter!.done).toEqual(work.done);
    expect(s.plan!.winter!.partIds).toEqual(work.partIds.filter((x) => x !== id));
  });
});

describe('giveWayToBuilding – orba rádlem a seč sena', () => {
  it('díl oraný rádlem (i s drnem): orba a setí zbylých dílů zůstanou, kde byly', () => {
    const base = advanceVillage(village(), at(600, 9, 2), null);
    const day = base.lastDay;
    const byId = new Map(base.parts.map((p) => [p.id, p]));
    const ids = base.plan!.winter!.partIds;
    // ozim orá spřežení celý (oxen.md – Jen rádlo), třetí díl je drn louky založené rádlem
    const sod = ids[2]!;
    byId.get(sod)!.sod = true;
    const work = createCropWork(
      ids.map((id) => byId.get(id)!),
      day,
      0,
      true,
    );
    expect(work.plough!.sodIds).toEqual([sod]);
    work.plough!.done = work.plough!.required * 0.4;
    work.done.sow = work.required.sow * tilledShare(work) * 0.5;
    base.plan!.winter = work;
    for (const id of [ids[1]!, sod]) {
      const s = structuredClone(base);
      const before = fieldPartLooks(s, day);
      giveWayToBuilding(s, day, [whole(partOf(s, id)!.cell!)]);
      const after = fieldPartLooks(s, day);
      const rest = ids.filter((x) => x !== id);
      for (const other of rest) expect(after.get(other)).toEqual(before.get(other));
      const plough = s.plan!.winter!.plough!;
      expect(plough.partIds).not.toContain(id);
      expect(plough.sodIds ?? []).not.toContain(id);
      // váha orby = váha zbylých dílů, kopání plodina nemá
      const restWeight = rest.reduce((sum, x) => sum + partWeight(partOf(s, x)!), 0);
      expect(plough.weight).toBeCloseTo(restWeight, 9);
      expect(plough.digWeight).toBeUndefined();
      expect(s.plan!.winter!.required.dig).toBe(0);
    }
  });

  it('díl úhoru v seči: zmizí ze seče, zmenšenému ubude práce i seno; seč ostatních stojí', () => {
    const s = advanceVillage(village(), at(600, 9, 2), null);
    s.plan = null;
    for (const p of s.parts) {
      p.state = 'fallow';
      p.fallowSinceDay = at(595, 9, 1);
      delete p.crop;
    }
    const day = at(601, 6, 20);
    const mowing = planMowing(s, day, 150_000)!;
    expect(mowing.partIds).toHaveLength(12);
    mowing.done = mowing.required * 0.3;
    s.hay = { kg: 0, mowing };
    const [gone, half] = [mowing.partIds[0]!, mowing.partIds[6]!];
    const before = fieldPartLooks(s, day);
    const yieldKg = mowing.yieldKg;
    giveWayToBuilding(s, day, [
      whole(partOf(s, gone)!.cell!),
      { cell: partOf(s, half)!.cell!, areaM2: CELL / 2, cellAreaM2: CELL },
    ]);
    const after = fieldPartLooks(s, day);
    const next = s.hay.mowing!;
    expect(next.partIds).not.toContain(gone);
    for (const id of next.partIds.filter((x) => x !== half)) {
      expect(after.get(id)).toEqual(before.get(id));
    }
    expect(next.yieldKg).toBeCloseTo(yieldKg - (1.5 * CELL * HAY.yieldKgPerHa) / 10_000, 9);
    // práce seče zbylých dílů = jejich váha × člověkodny na hektar (bez kovářových kos)
    const weight = next.partIds.reduce((sum, x) => sum + partWeight(partOf(s, x)!), 0);
    expect(next.required / weight).toBeCloseTo(HAY_WORK_PER_HA.worst, 9);
  });
});

describe('giveWayToBuilding – zakládané pole', () => {
  const founding = (): VillageState => {
    const v = withBuiltFirstDwelling(
      foundVillage({ seed: 3, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );
    return foundField(v, FOUNDED, { parts: parts(block(2, 0, 5, 1)) });
  };

  it('poslední čtverec – pole zanikne i se stavbou založení', () => {
    const s = founding();
    const cells = s.parts.map((p) => p.cell!);
    giveWayToBuilding(s, FOUNDED, cells.map(whole));
    expect(s.parts).toEqual([]);
    expect(s.fields).toEqual([]);
    expect(s.constructions.some((c) => c.kind === 'field')).toBe(false);
    expect(landEvents(s).at(-1)).toMatchObject({ land: 'field', areaM2: 5 * CELL, gone: true });
  });

  it('rozestavěné založení se zmenší úměrně – cena i odvedená práce; zmizelý díl předá překážky', () => {
    const s = advanceVillage(founding(), FOUNDED + 3, null);
    const c = s.constructions.find((x) => x.kind === 'field')!;
    const started = s.parts.find((p) => p.state === 'founding' && p.foundingDone > 0)!;
    const waiting = s.parts.find((p) => p.state === 'founding' && p.foundingDone === 0)!;
    waiting.obstacles = [501, 502];
    waiting.trees = 2;
    const before = structuredClone({ c, started, waiting, logs: s.woodLogs ?? 0 });
    giveWayToBuilding(s, s.lastDay, [
      { cell: started.cell!, areaM2: CELL / 2, cellAreaM2: CELL },
      whole(waiting.cell!),
    ]);
    const half = partOf(s, started.id)!;
    expect(half.areaM2).toBeCloseTo(CELL / 2, 9);
    expect(half.foundingCost).toBeCloseTo(before.started.foundingCost / 2, 9);
    expect(half.foundingDone).toBeCloseTo(before.started.foundingDone / 2, 9);
    const after = s.constructions.find((x) => x.id === c.id)!;
    expect(after.cost).toBeCloseTo(
      before.c.cost - before.started.foundingCost / 2 - before.waiting.foundingCost,
      9,
    );
    expect(after.done).toBeCloseTo(before.c.done - before.started.foundingDone / 2, 9);
    expect(partOf(s, waiting.id)).toBeUndefined();
    expect(s.clearedObstacles!.map((o) => o.id)).toEqual(expect.arrayContaining([501, 502]));
    expect(s.woodLogs).toBeCloseTo(before.logs + logsFromClearedTrees(2), 9);
  });
});

describe('giveWayToBuilding – sad', () => {
  const squares = (cells: TileCell[]): OrchardSquareInput[] =>
    cells.map((cell, i) => ({ cell, areaM2: CELL, distanceM: 60 + i, obstacleCost: 0 }));
  const base = (): VillageState =>
    withBuiltFirstDwelling(
      foundVillage({ seed: 3, day: FOUNDED, dwellingPosition: { x: 0, z: 0, rotation: 0 } }),
    );

  it('pozemek na čtverci sad zmenší, na posledním čtverci sad zanikne i se stavbou výsadby', () => {
    const s = foundOrchard(base(), FOUNDED, { squares: squares(block(2, 5, 2, 1)) });
    const orchardId = villageOrchards(s)[0]!.id;
    giveWayToBuilding(s, FOUNDED, [whole({ x: 2, y: 5 })]);
    expect(villageOrchards(s)[0]!.squares.map((q) => q.cell)).toEqual([{ x: 3, y: 5 }]);
    const c = s.constructions.find((x) => x.kind === 'orchard')!;
    expect(c.cost).toBeCloseTo(villageOrchards(s)[0]!.squares[0]!.plantingCost, 9);
    giveWayToBuilding(s, FOUNDED, [whole({ x: 3, y: 5 })]);
    expect(villageOrchards(s)).toEqual([]);
    expect(s.constructions.some((x) => x.kind === 'orchard')).toBe(false);
    expect(landEvents(s)).toEqual([
      {
        day: FOUNDED,
        kind: 'land-taken',
        land: 'orchard',
        id: orchardId,
        areaM2: CELL,
        gone: false,
        by: 'dwelling',
      },
      {
        day: FOUNDED,
        kind: 'land-taken',
        land: 'orchard',
        id: orchardId,
        areaM2: CELL,
        gone: true,
        by: 'dwelling',
      },
    ]);
  });

  it('zmenšený čtverec dá úměrně méně jablek i práce – sklizený podíl zůstane', () => {
    const s = foundOrchard(base(), FOUNDED, { squares: squares(block(2, 5, 2, 1)) });
    s.constructions = s.constructions.filter((c) => c.kind !== 'orchard');
    for (const q of villageOrchards(s)[0]!.squares) {
      q.plantedDay = FOUNDED - Math.ceil(30 * YEAR);
      q.plantingDone = q.plantingCost;
    }
    const day = at(600, 9, 20);
    const square = villageOrchards(s)[0]!.squares[0]!;
    const required = 2 * squareHarvestWork(square, day);
    const yieldKg = 2 * squareYieldKg(square, day);
    s.orchardWork = { task: 'harvest', required, done: required / 2, yieldKg };
    giveWayToBuilding(s, day, [{ cell: square.cell, areaM2: CELL / 2, cellAreaM2: CELL }]);
    expect(villageOrchards(s)[0]!.squares[0]!.areaM2).toBeCloseTo(CELL / 2, 9);
    expect(s.orchardWork.required).toBeCloseTo(required * 0.75, 9);
    expect(s.orchardWork.done).toBeCloseTo(required * 0.375, 9);
    expect(s.orchardWork.yieldKg).toBeCloseTo(yieldKg * 0.75, 9);
  });
});

describe('startNewDwelling – pole ustoupí stavbě', () => {
  it('pozemek na dílu pole: díl zmizí; neplatný vstup RangeError', () => {
    const s = settled(advanceVillage(village(), at(600, 10, 1), null));
    const day = s.lastDay;
    const part = s.parts[4]!;
    const plot = { cell: part.cell!, variant: 'center' as const };
    const next = startNewDwelling(s, day, 'polozemnice', { x: 0, z: 0, rotation: 0 }, 0, [], {
      plot,
      takenLand: [whole(part.cell!)],
    });
    expect(partOf(next, part.id)).toBeUndefined();
    expect(next.constructions.at(-1)).toMatchObject({ dwellingType: 'polozemnice', plot });
    const bad =
      (takenLand: TakenLand[]): (() => VillageState) =>
      () =>
        startNewDwelling(s, day, 'zemnice', { x: 0, z: 0, rotation: 0 }, 0, [], { takenLand });
    expect(bad([whole(part.cell!), whole(part.cell!)])).toThrow(RangeError);
    expect(bad([{ cell: part.cell!, areaM2: -1, cellAreaM2: CELL }])).toThrow(RangeError);
    expect(bad([{ cell: { x: 0.5, y: 0 }, areaM2: 1, cellAreaM2: CELL }])).toThrow(RangeError);
  });

  it('po stavbě na poli dopočet po kouscích s JSON dá stejný stav', () => {
    const s = settled(advanceVillage(village(), at(601, 6, 30), null));
    const day = s.lastDay;
    const [a, b] = s.plan!.winter!.partIds as [number, number];
    const built = startNewDwelling(s, day, 'zemnice', { x: 0, z: 0, rotation: 0 }, 0, [], {
      takenLand: [
        { cell: partOf(s, a)!.cell!, areaM2: 57.12, cellAreaM2: CELL },
        { cell: partOf(s, b)!.cell!, areaM2: 57.12, cellAreaM2: CELL },
      ],
    });
    const end = at(603, 2, 1);
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
    expect(once.parts.find((p) => p.id === a)!.areaM2).toBeCloseTo(CELL - 57.12, 9);
  });
});

describe('kontrola umístění – obydlí na poli a v sadu', () => {
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
  // kámen 1 na poli (políčko 8, 8), kámen 2 na louce pod ním (políčko 8, 7)
  const layer = packObstacles([stone(1, 12, 5), stone(2, 12, -1)], 16, 15);
  const withField = (cells: TileCell[]): PlacementVillage => ({
    dwellings: [],
    constructions: [],
    parts: cells.map((cell) => ({ cell, fieldId: 7, areaM2: CELL })),
  });

  it('zemnice přes dva díly projde – sebere jim průnik vyklízené plochy, kámen na poli neplatí', () => {
    const check = checkDwellingPlacement(
      landscape,
      withField(block(8, 8, 2, 1)),
      'zemnice',
      { x: 15, z: 3, rotation: 0 },
      layer,
    );
    expect(check.ok).toBe(true);
    expect(check.warning).toBe('Pole se zmenší');
    // vyklízená plocha x 10,2 … 19,8, z −1,4 … 10,5 – v každém dílu 4,8 × 10,5 m
    expect(check.takenLand.map((t) => t.cell)).toEqual(block(8, 8, 2, 1));
    for (const t of check.takenLand) expect(t.areaM2).toBeCloseTo(4.8 * 10.5, 9);
    expect(check.obstacleIds).toEqual([2]);
  });

  it('pozemek na čtverci pole: celé políčko, bez překážek; na posledním čtverci pole zanikne', () => {
    const plot = { cell: { x: 8, y: 8 }, variant: 'center' as const };
    const shrink = checkPlotPlacement(
      landscape,
      withField(block(8, 8, 2, 1)),
      'polozemnice',
      plot,
      layer,
    );
    expect(shrink).toMatchObject({ ok: true, warning: 'Pole se zmenší', obstacleIds: [] });
    expect(shrink.takenLand).toEqual([whole({ x: 8, y: 8 })]);
    const gone = checkPlotPlacement(landscape, withField([{ x: 8, y: 8 }]), 'polozemnice', plot);
    expect(gone.warning).toBe('Pole zanikne');
    // přestavba obyvatel na novém pozemku pole nezabere
    const avoid = checkPlotPlacement(
      landscape,
      withField([{ x: 8, y: 8 }]),
      'polozemnice',
      plot,
      layer,
      {
        takeLand: false,
      },
    );
    expect(avoid).toMatchObject({ ok: false, reason: 'Překrývá se s polem.' });
  });

  it('pozemek a dílna v sadu: sad se zmenší, nebo zanikne', () => {
    const orchard = (cells: TileCell[]): PlacementVillage => ({
      dwellings: [],
      constructions: [],
      parts: [],
      orchards: [{ squares: cells.map((cell) => ({ cell, areaM2: CELL })) }],
    });
    const plot = { cell: { x: 8, y: 8 }, variant: 'center' as const };
    expect(
      checkPlotPlacement(landscape, orchard([{ x: 8, y: 8 }]), 'polozemnice', plot).warning,
    ).toBe('Sad zanikne');
    const workshop = checkWorkshopPlacement(landscape, orchard(block(8, 8, 2, 2)), 'potter', {
      x: 15,
      z: 15,
      rotation: 0,
    });
    expect(workshop).toMatchObject({ ok: true, warning: 'Sad se zmenší' });
    expect(workshop.takenLand.length).toBeGreaterThan(1);
  });

  it('hřbitov dál nesmí – zemnice ani pozemek', () => {
    const cemetery: PlacementVillage = {
      dwellings: [],
      constructions: [],
      parts: [],
      cemeteries: [{ squares: [{ cell: { x: 8, y: 8 } }] }],
    };
    expect(
      checkDwellingPlacement(landscape, cemetery, 'zemnice', { x: 7.5, z: 7.5, rotation: 0 })
        .reason,
    ).toBe('Překrývá se s hřbitovem.');
    expect(
      checkPlotPlacement(landscape, cemetery, 'polozemnice', {
        cell: { x: 8, y: 8 },
        variant: 'center',
      }).reason,
    ).toBe('Překrývá se s hřbitovem.');
  });

  it('obyvatelé při přestavbě nový pozemek na poli nehledají', () => {
    // polozemnice bez pozemku uprostřed políčka (8, 8); okolní políčka do 50 m jsou pole
    const s = withBuiltFirstDwelling(
      foundVillage({ seed: 3, day: FOUNDED, dwellingPosition: { x: -100, z: -20, rotation: 0 } }),
    );
    const dwelling = { id: s.nextId++, position: { x: 7.5, z: 7.5, rotation: 0 } };
    s.dwellings.push({ ...dwelling, type: 'zemnice', builtDay: FOUNDED - 400, condition: 1 });
    const empty = packObstacles([], 16, 15);
    const free = relocationPlot(s, landscape, empty, dwelling, 'polozemnice', s.lastDay);
    expect(free?.plot.cell).toEqual({ x: 8, y: 8 });
    const fielded = foundField(s, s.lastDay, { parts: parts(block(5, 5, 7, 7)) });
    // všechna políčka do 50 m jsou pole – obydlí se přestaví na místě bez pozemku
    expect(
      relocationPlot(fielded, landscape, empty, dwelling, 'polozemnice', s.lastDay),
    ).toBeNull();
  });
});
