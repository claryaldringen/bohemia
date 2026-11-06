import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import { foundVillage } from '../actions';
import { applyBuildIntent } from '../build-intent';
import { cancelConstruction } from '../cancel-construction';
import { fortificationArea, fortificationOutline, fortSegments } from '../fortification';
import {
  FORT_BUSY,
  FORT_GATE_OFF,
  FORT_GATE_TAKEN,
  FORT_NO_WOOD,
  FORT_RAMPART_UNFINISHED,
  addGateToFortification,
  fortWorkOrder,
  startFortification,
  startFortificationUpgrade,
  type FortificationResult,
} from '../fortifications';
import {
  FORT_NOT_CONNECTED,
  FORT_OVER_BUILDING,
  FORT_OVER_WATER,
  FORT_TOO_SMALL,
  FORT_TOUCHES,
  checkFortificationPlacement,
} from '../placement';
import { placementVillageOf } from '../placement-village';
import { blockedGates, checkFootprintFree, BLOCKS_GATE } from '../placement-land';
import { freeShape } from '../placement-geometry';
import { dwellingGatePoint } from '../paths/network';
import { advanceVillage } from '../simulate';
import type { FortKind, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

// Stavba opevnění po úsecích (fortifications.md – Obvod, Cena a stavba). Krajina 16 × 16 políček
// po 15 m, střed v počátku – čtverce 8–11 leží na 0–60 m.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);

function village(logs = 200): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day: DAY, dwellingPosition: FAR }));
  s.woodLogs = logs;
  return s;
}

function ok(result: FortificationResult): VillageState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

function start(state: VillageState, kind: FortKind, cells = AREA): VillageState {
  return ok(
    startFortification(state, state.lastDay, landscape, EMPTY, { cells, grid: null, kind }),
  );
}

function advance(state: VillageState, days: number): VillageState {
  return advanceVillage(state, state.lastDay + days, EMPTY, landscape);
}

/** Dopočítá ves, dokud na opevnění běží stavba (nejvýš `limit` dní). */
function finish(state: VillageState, limit = 400): VillageState {
  let s = state;
  for (let d = 0; d < limit && s.constructions.some((c) => c.kind === 'fortification'); d += 5) {
    s = advance(s, 5);
  }
  return s;
}

function tree(id: number, x: number, z: number): ObstaclePlacement {
  return { id, kind: 'tree', look: 'beech-1', x, z, rotation: 0, scale: 1 };
}

describe('kontrola umístění opevnění', () => {
  const check = (s: VillageState, cells = AREA, kind: FortKind = 'fence', water = false) =>
    checkFortificationPlacement(
      water
        ? makeLandscape({ surface: (x, y) => (x === 9 && y === 8 ? 'water' : 'meadow') })
        : landscape,
      placementVillageOf(s, s.lastDay),
      EMPTY,
      cells,
      null,
      kind,
    );

  it('plocha 4 × 4 na louce projde, menší než 2 × 2 a nesouvislá ne', () => {
    const s = village();
    expect(check(s).ok).toBe(true);
    expect(check(s, block(8, 8, 3, 1)).reason).toBe(FORT_TOO_SMALL);
    expect(check(s, [...block(2, 2, 2, 2), ...block(8, 8, 2, 2)]).reason).toBe(FORT_NOT_CONNECTED);
  });

  it('pás nesmí přes vodu ani přes obydlí; voda uvnitř plochy mimo pás nevadí', () => {
    const s = village();
    expect(check(s, AREA, 'fence', true).reason).toBe(FORT_OVER_WATER);
    // obydlí (-90, -90) stojí v jihozápadním rohu plochy 2–4 – pás vede přes jeho půdorys
    expect(check(s, block(2, 2, 3, 3)).reason).toBe(FORT_OVER_BUILDING);
    // voda uprostřed velké plochy pás nezasáhne
    const inner = makeLandscape({ surface: (x, y) => (x === 9 && y === 9 ? 'water' : 'meadow') });
    const result = checkFortificationPlacement(
      inner,
      placementVillageOf(s, s.lastDay),
      EMPTY,
      AREA,
      null,
      'palisade',
    );
    expect(result.ok).toBe(true);
  });

  it('opevnění se nesmí dotknout jiného ani ležet v něm', () => {
    const s = start(village(), 'fence');
    expect(check(s, block(12, 8, 2, 2)).reason).toBe(FORT_TOUCHES);
    expect(check(s, block(9, 9, 2, 2)).reason).toBe(FORT_TOUCHES);
    expect(check(s, block(13, 8, 2, 2)).ok).toBe(true);
  });
});

describe('místo problému neprošlé kontroly', () => {
  const s = village();
  const pv = placementVillageOf(s, s.lastDay);

  it('zatarasená branka: bod branky a důvod, ostatní stavby beze změny', () => {
    const gate = dwellingGatePoint(landscape, s.dwellings[0]!);
    const square = [
      [gate.x - 1, gate.z - 1],
      [gate.x + 1, gate.z - 1],
      [gate.x + 1, gate.z + 1],
      [gate.x - 1, gate.z + 1],
    ] as const;
    expect(blockedGates(landscape, pv, [[...square]])).toEqual([{ x: gate.x, z: gate.z }]);
    expect(
      blockedGates(landscape, pv, [
        [
          [50, 50],
          [51, 50],
          [51, 51],
        ],
      ]),
    ).toEqual([]);
    const free = checkFootprintFree(landscape, pv, [freeShape([...square])]);
    if (free.reason === BLOCKS_GATE) expect(free.where?.points).toEqual([{ x: gate.x, z: gate.z }]);
    else expect(free.where?.footprints?.length).toBeGreaterThan(0);
  });

  it('obydlí v pásu: obrys; voda: políčka; dotyk: čtverce cizího opevnění', () => {
    const house = checkFortificationPlacement(
      landscape,
      pv,
      EMPTY,
      block(2, 2, 3, 3),
      null,
      'fence',
    );
    expect(house.reason).toBe(FORT_OVER_BUILDING);
    expect(house.where?.footprints?.length).toBeGreaterThan(0);
    const wet = checkFortificationPlacement(
      makeLandscape({ surface: (x, y) => (x === 9 && y === 8 ? 'water' : 'meadow') }),
      pv,
      EMPTY,
      AREA,
      null,
      'fence',
    );
    expect(wet.reason).toBe(FORT_OVER_WATER);
    expect(wet.where?.footprints?.length).toBeGreaterThan(0);
    const built = placementVillageOf(start(village(), 'fence'), s.lastDay);
    const touch = checkFortificationPlacement(
      landscape,
      built,
      EMPTY,
      block(12, 8, 2, 2),
      null,
      'fence',
    );
    expect(touch.reason).toBe(FORT_TOUCHES);
    expect(touch.where?.footprints?.length).toBeGreaterThan(0);
  });
});

describe('cena předem a zahájení', () => {
  it('klády na hromadě pokryjí celou stavbu – práce se nečeká', () => {
    const s = start(village(100), 'fence');
    const c = s.constructions.find((x) => x.kind === 'fortification')!;
    // 237,854 m plotu → 35,68 klády → 36 z hromady, 20 čd na 100 m
    expect(c.wood).toMatchObject({ trees: 36, fromPile: 36, fell: [] });
    expect(s.woodLogs).toBe(64);
    expect(c.cost).toBeCloseTo((20 * 237.854) / 100, 2);
    expect(s.fortifications?.[0]?.segments).toHaveLength(16);
    expect(s.fortifications?.[0]?.gates).toHaveLength(1);
  });

  it('bez klád a bez stromů k mání palisáda nejde; val dřevo nechce', () => {
    const s = village(0);
    const r = startFortification(s, s.lastDay, landscape, EMPTY, {
      cells: AREA,
      grid: null,
      kind: 'palisade',
    });
    expect(r).toEqual({ ok: false, reason: FORT_NO_WOOD });
    const rampart = start(s, 'rampart');
    expect(rampart.constructions.at(-1)?.wood).toBeUndefined();
  });

  it('chybějící klády se vyhradí ke kácení mezi nejbližšími stromy; stromy v pásu jdou do stavby', () => {
    // strom v pásu jižní strany (z = 0,5 m) a háj stranou
    const grove = Array.from({ length: 60 }, (_, k) =>
      tree(100 + k, 80 + (k % 6) * 4, 80 + Math.floor(k / 6) * 4),
    );
    const layer = packObstacles([tree(1, 20, 0.5), ...grove], 16, 15);
    const s = village(10);
    const next = ok(
      startFortification(s, s.lastDay, landscape, layer, {
        cells: AREA,
        grid: null,
        kind: 'fence',
      }),
    );
    expect(next.clearedObstacles?.some((o) => o.id === 1)).toBe(true);
    const wood = next.constructions.at(-1)!.wood!;
    // 10 klád z hromady + 1 z pásu, zbytek do 36 se kácí
    expect(wood.fromPile).toBe(11);
    expect(wood.fell).toHaveLength(25);
    expect(next.woodLogs).toBe(0);
  });
});

describe('stavba po úsecích', () => {
  it('úseky jeden po druhém od brány nejblíž dvorci po směru hodin', () => {
    const s = start(village(), 'fence');
    const c = s.constructions.find((x) => x.kind === 'fortification')!;
    const fort = s.fortifications![0]!;
    const order = c.fortSegments!.map((w) => w.index);
    expect(order[0]).toBe(fort.gates[0]!.segment);
    expect(order).toEqual(fortWorkOrder(16, fort.gates, { x: FAR.x, z: FAR.z }));
    const done = finish(s);
    const days = order.map((i) => done.fortifications![0]!.segments[i]!.builtDay!);
    expect(days.every((d, k) => k === 0 || d >= days[k - 1]!)).toBe(true);
    expect(days[0]!).toBeLessThan(days.at(-1)!);
    expect(
      done.chronicle.some(
        (e) => e.kind === 'construction-finished' && e.constructionKind === 'fortification',
      ),
    ).toBe(true);
  });

  it('po kouscích (1, 3, 10 dní + zbytek) stejně jako vcelku', () => {
    const s = start(village(), 'palisade');
    const whole = advance(s, 60);
    let parts = s;
    for (const d of [1, 3, 10]) parts = advance(parts, d);
    parts = advanceVillage(parts, whole.lastDay, EMPTY, landscape);
    expect(JSON.stringify(parts)).toBe(JSON.stringify(whole));
    expect(whole.fortifications![0]!.segments.some((x) => x.builtDay !== null)).toBe(true);
  });

  it('starší ves bez opevnění zůstane bez opevnění', () => {
    const s = advance(village(), 30);
    expect('fortifications' in s).toBe(false);
  });

  it('val vezme díl pole pod pásem', () => {
    const base = village();
    const field = applyBuildIntent(base, base.lastDay, landscape, EMPTY, {
      kind: 'field',
      cells: block(8, 8, 3, 2),
    });
    if (!field.ok) throw new Error(field.reason);
    const before = field.state.parts.reduce((sum, p) => sum + p.areaM2, 0);
    const s = start(field.state, 'rampart', block(8, 8, 3, 3));
    const after = s.parts.reduce((sum, p) => sum + p.areaM2, 0);
    expect(after).toBeLessThan(before);
    expect(s.chronicle.some((e) => e.kind === 'land-taken' && e.by === 'fortification')).toBe(true);
    // plot díl nechá
    const fence = start(field.state, 'fence', block(8, 8, 3, 3));
    expect(fence.parts.reduce((sum, p) => sum + p.areaM2, 0)).toBe(before);
  });
});

describe('vylepšení, nástavba a zrušení', () => {
  it('plot na palisádu – plot úseku stojí, dokud palisáda není hotová, nic nevrací', () => {
    const built = finish(start(village(400), 'fence'));
    const logs = built.woodLogs ?? 0;
    const up = ok(
      startFortificationUpgrade(built, built.lastDay, landscape, EMPTY, {
        fortificationId: built.fortifications![0]!.id,
        work: 'upgrade',
      }),
    );
    // palisáda 234,85 m → 164,4 klády → 165 z hromady, plot nic nevrátil
    expect(up.woodLogs).toBe(logs - 165);
    const half = advance(up, 20);
    const segs = half.fortifications![0]!.segments;
    expect(half.fortifications![0]!.kind).toBe('fence');
    expect(segs.some((x) => x.kind === 'palisade')).toBe(true);
    expect(segs.some((x) => x.kind === undefined && x.builtDay !== null)).toBe(true);
    const done = finish(half);
    expect(done.fortifications![0]!.kind).toBe('palisade');
    expect(done.fortifications![0]!.segments.every((x) => x.kind === undefined)).toBe(true);
  });

  it('nástavba jen na hotový val, jedna stavba na opevnění', () => {
    const s = start(village(), 'rampart');
    const id = s.fortifications![0]!.id;
    const top = (state: VillageState): FortificationResult =>
      startFortificationUpgrade(state, state.lastDay, landscape, EMPTY, {
        fortificationId: id,
        work: 'top',
        top: 'palisade',
      });
    const early = advance(s, 5);
    expect(top(early)).toEqual({ ok: false, reason: FORT_BUSY });
    // část valu stojí, stavba se zrušila – obvod je otevřený
    const part = advance(s, 60);
    const c = part.constructions.find((x) => x.kind === 'fortification')!;
    const open = cancelConstruction(part, part.lastDay, c.id);
    expect(open.fortifications![0]!.segments.some((x) => x.builtDay !== null)).toBe(true);
    expect(top(open)).toEqual({ ok: false, reason: FORT_RAMPART_UNFINISHED });
    const topped = finish(ok(top(finish(s))));
    const fort = topped.fortifications![0]!;
    expect(fort.top).toBe('palisade');
    expect(fort.segments.every((x) => typeof x.topBuiltDay === 'number')).toBe(true);
  });

  it('zrušení – hotové úseky stojí, bez hotového úseku opevnění zmizí', () => {
    const s = start(village(), 'palisade');
    const c = s.constructions.find((x) => x.kind === 'fortification')!;
    const none = cancelConstruction(s, s.lastDay, c.id);
    expect(none.fortifications).toEqual([]);
    const half = advance(s, 20);
    const cancelled = cancelConstruction(half, half.lastDay, c.id);
    const segs = cancelled.fortifications![0]!.segments;
    expect(segs.some((x) => x.builtDay !== null)).toBe(true);
    expect(segs.some((x) => x.builtDay === null)).toBe(true);
    expect(cancelled.constructions.some((x) => x.kind === 'fortification')).toBe(false);
    // mezera po zrušení nepřekáží jiné stavbě, hotový úsek ano
    expect(JSON.stringify(advance(cancelled, 10).fortifications)).toBe(
      JSON.stringify(cancelled.fortifications),
    );
  });
});

describe('brány', () => {
  it('hráč přidá bránu na obvod, nejvýš jednu na úsek', () => {
    const s = start(village(), 'fence');
    const fort = s.fortifications![0]!;
    const area = fortificationArea(fort.cells, null, landscape);
    if ('error' in area) throw new Error(area.error);
    const free = fortSegments(fortificationOutline(area, 'fence')).find(
      (x) => !fort.gates.some((g) => g.segment === x.index),
    )!;
    const mid = {
      x: free.line.x + (free.line.dx * free.line.length) / 2,
      z: free.line.z + (free.line.dz * free.line.length) / 2,
    };
    const next = ok(addGateToFortification(s, landscape, fort.id, mid));
    expect(next.fortifications![0]!.gates).toHaveLength(2);
    expect(addGateToFortification(next, landscape, fort.id, mid)).toEqual({
      ok: false,
      reason: FORT_GATE_TAKEN,
    });
    expect(addGateToFortification(s, landscape, fort.id, { x: 30, z: 30 })).toEqual({
      ok: false,
      reason: FORT_GATE_OFF,
    });
  });
});
