import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { packObstacles, type ObstaclePlacement } from '../../landscape';
import { foundVillage } from '../actions';
import { applyBuildIntent } from '../build-intent';
import { cancelConstruction } from '../cancel-construction';
import { distanceFactor } from '../fields';
import {
  circlePoints,
  FORT_NO_STONE,
  FORT_WALKWAY_NEW,
  FORT_WALL_YEAR,
  fortBlockingSegments,
  fortificationOutline,
  fortRunningWork,
  fortSegments,
  squarePoints,
} from '../fortification';
import type { Point } from '../polygon';
import type { TileCell } from '../types';
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
  FORT_CROSSING,
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
import { fortLayoutKey, pathFortificationsOf, routeMapKey } from '../paths/village';
import { advanceVillage } from '../simulate';
import type { FortKind, VillageState } from '../types';
import { block, makeLandscape } from './placement-fixtures';
import { fellingCost } from '../wood';
import { withBuiltFirstDwelling } from './village-fixtures';

// Stavba opevnění po úsecích (fortifications.md – Obvod, Cena a stavba). Krajina 16 × 16 políček
// po 15 m, střed v počátku – čtverce 8–11 leží na 0–60 m.

const DAY = dayIndexOf({ year: 600, month: 3, day: 15 });
const EMPTY = packObstacles([], 16, 15);
const FAR = { x: -90, z: -90, rotation: 0 };
const landscape = makeLandscape();
const AREA = block(8, 8, 4, 4);

/** Body obvodu z čtverců (jako převod starého opevnění) – obvod se zakulacenými rohy. */
function sq(cells: readonly TileCell[], kind: FortKind): Point[] {
  const points = squarePoints(cells, null, landscape, kind);
  if (!points) throw new Error('plocha bez obvodu');
  return points;
}

function village(logs = 200, day = DAY): VillageState {
  const s = withBuiltFirstDwelling(foundVillage({ seed: 5, day, dwellingPosition: FAR }));
  s.woodLogs = logs;
  return s;
}

function ok(result: FortificationResult): VillageState {
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** Opevnění druhu `kind` na čtvercích `cells` – obvod se zakulacením druhu `shape`. */
function start(
  state: VillageState,
  kind: FortKind,
  cells = AREA,
  shape: FortKind = kind,
): VillageState {
  return ok(
    startFortification(state, state.lastDay, landscape, EMPTY, { points: sq(cells, shape), kind }),
  );
}

function advance(state: VillageState, days: number): VillageState {
  return advanceVillage(state, state.lastDay + days, EMPTY, landscape);
}

/**
 * Dopočítá ves po 5 dnech, dokud neplatí `done` (nejvýš 400 dní) – první hotový úsek: s cenami
 * komplet (8. 11. 2026) stojí úsek palisády ≈ 3 × víc práce, dřív na něj stačilo 20 dní.
 */
function until(state: VillageState, done: (s: VillageState) => boolean): VillageState {
  let s = state;
  for (let d = 0; d < 400 && !done(s); d += 5) s = advance(s, 5);
  return s;
}

/** Stojí na prvním opevnění aspoň jeden úsek palisády (vylepšení plotu)? */
const somePalisade = (s: VillageState): boolean =>
  s.fortifications![0]!.segments.some((x) => x.kind === 'palisade');
/** Stojí na prvním opevnění aspoň jeden hotový úsek? */
const someBuilt = (s: VillageState): boolean =>
  s.fortifications![0]!.segments.some((x) => x.builtDay !== null);

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
      sq(cells, kind),
      kind,
    );

  it('obvod kolem 4 × 4 na louce projde, malá plocha a křížení ne', () => {
    const s = village();
    expect(check(s).ok).toBe(true);
    const at = (points: Point[]): string | null =>
      checkFortificationPlacement(
        landscape,
        placementVillageOf(s, s.lastDay),
        EMPTY,
        points,
        'fence',
      ).reason;
    expect(at(circlePoints([30, 30], 15))).toBe(FORT_TOO_SMALL);
    const eight: Point[] = [
      [0, 0],
      [40, 40],
      [80, 0],
      [80, 40],
      [40, 0],
      [0, 40],
    ];
    expect(at(eight)).toBe(FORT_CROSSING);
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
      sq(AREA, 'palisade'),
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
      sq(block(2, 2, 3, 3), 'fence'),
      'fence',
    );
    expect(house.reason).toBe(FORT_OVER_BUILDING);
    expect(house.where?.footprints?.length).toBeGreaterThan(0);
    const wet = checkFortificationPlacement(
      makeLandscape({ surface: (x, y) => (x === 9 && y === 8 ? 'water' : 'meadow') }),
      pv,
      EMPTY,
      sq(AREA, 'fence'),
      'fence',
    );
    expect(wet.reason).toBe(FORT_OVER_WATER);
    expect(wet.where?.footprints?.length).toBeGreaterThan(0);
    const built = placementVillageOf(start(village(), 'fence'), s.lastDay);
    const touch = checkFortificationPlacement(
      landscape,
      built,
      EMPTY,
      sq(block(12, 8, 2, 2), 'fence'),
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
    // 237,829 m plotu (body z čtverců) → 35,67 klády → 36 z hromady, 20 čd na 100 m
    expect(c.wood).toMatchObject({ trees: 36, fromPile: 36, fell: [] });
    expect(s.woodLogs).toBe(64);
    expect(c.cost).toBeCloseTo((20 * 237.829) / 100, 2);
    expect(s.fortifications?.[0]?.segments).toHaveLength(16);
    expect(s.fortifications?.[0]?.gates).toHaveLength(1);
  });

  it('bez klád a bez stromů k mání palisáda nejde; val dřevo nechce', () => {
    const s = village(0);
    const r = startFortification(s, s.lastDay, landscape, EMPTY, {
      points: sq(AREA, 'palisade'),
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
        points: sq(AREA, 'fence'),
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

describe('cena komplet a nové druhy (Hradby a obrana – Cena, Druhy)', () => {
  /** Délka obvodu druhu `kind` kolem `AREA` (m). */
  const lengthOf = (kind: FortKind): number => fortificationOutline(sq(AREA, kind), kind)!.lengthM;
  /** Hromada kamene `m3` u severovýchodu vsi – zásoba i hromada. */
  const withStone = (s: VillageState, m3: number): VillageState => {
    s.stoneM3 = m3;
    s.stoneStacks = [{ id: 1, x: 70, z: 70, m3 }];
    return s;
  };
  /** Skalní výchoz (lom) daleko od pásu. */
  const QUARRY = { x: -90, z: 100 };
  const quarryLayer = packObstacles(
    [{ id: 1, kind: 'outcrop', look: 'rock-ridge', ...QUARRY, rotation: 0, scale: 1 }],
    16,
    15,
  );
  const fortWork = (s: VillageState) => s.constructions.find((x) => x.kind === 'fortification')!;
  /** Vzdálenost od středu obvodu druhu `kind` kolem `AREA` (odtud se kácí a láme). */
  const fromCenter = (kind: FortKind, at: { x: number; z: number }): number => {
    const line = fortificationOutline(sq(AREA, kind), kind)!.polyline;
    let x = 0;
    let z = 0;
    for (const [px, pz] of line) {
      x += px;
      z += pz;
    }
    const dx = at.x - x / line.length;
    const dz = at.z - z / line.length;
    return Math.sqrt(dx * dx + dz * dz);
  };
  /** Den založení vsi dopočítané do 1. 1. 790 (ves vzniká s `lastDay` = den založení − 1). */
  const ROSTOVA = dayIndexOf({ year: 790, month: 1, day: 1 }) + 1;

  it('palisáda z hromady 230 čd na 100 m; kácení za 1 čd × vzdálenost (ne 2 čd)', () => {
    const len = lengthOf('palisade');
    const fromPile = fortWork(start(village(400), 'palisade'));
    expect(fromPile.wood).toMatchObject({ fell: [] });
    expect(fromPile.cost).toBeCloseTo((230 * len) / 100, 6);
    // bez klád: stromy háje stranou se kácí za 1 čd × vzdálenost – cena komplet 300 čd na 100 m
    const grove = Array.from({ length: 200 }, (_, k) =>
      tree(100 + k, 70 + (k % 10) * 4, 70 + Math.floor(k / 10) * 2.5),
    );
    const layer = packObstacles(grove, 16, 15);
    const s = village(0);
    const c = fortWork(
      ok(
        startFortification(s, s.lastDay, landscape, layer, {
          points: sq(AREA, 'palisade'),
          kind: 'palisade',
        }),
      ),
    );
    expect(c.wood!.fell).toHaveLength(Math.ceil((70 * len) / 100));
    for (const t of c.wood!.fell) {
      const at = grove.find((g) => g.id === t.id)!;
      const d = fromCenter('palisade', at);
      expect(t.cost).toBeCloseTo(distanceFactor(d), 9);
      expect(t.cost).toBeCloseTo(fellingCost(d) / 2, 9);
    }
    const fell = c.wood!.fell.reduce((sum, t) => sum + t.cost, 0);
    expect(c.cost).toBeCloseTo((230 * len) / 100 + fell, 6);
  });

  it('roštová z hromady (klády a kámen) 620 čd na 100 m, kámen se vezme z hromady', () => {
    const len = lengthOf('crib');
    const s = withStone(village(1000, ROSTOVA), 500);
    const next = start(s, 'crib');
    const c = fortWork(next);
    expect(c.wood).toMatchObject({ fell: [] });
    expect(c.cost).toBeCloseTo((620 * len) / 100, 6);
    expect(next.stoneM3).toBeCloseTo(500 - (100 * len) / 100, 6);
    expect(next.stoneStacks![0]!.m3).toBeCloseTo(500 - (100 * len) / 100, 6);
  });

  it('roštová až od roku 790 – 31. 12. 789 důvod roku, 1. 1. 790 projde (server podle dne vsi)', () => {
    const eve = withStone(village(1000, ROSTOVA - 1), 500);
    expect(eve.lastDay).toBe(dayIndexOf({ year: 789, month: 12, day: 31 }));
    expect(
      startFortification(eve, eve.lastDay, landscape, EMPTY, {
        points: sq(AREA, 'crib'),
        kind: 'crib',
      }),
    ).toEqual({ ok: false, reason: FORT_WALL_YEAR('crib') });
    expect(FORT_WALL_YEAR('crib')).toBe('Roštová hradba až od roku 790.');
    expect(start(withStone(village(1000, ROSTOVA), 500), 'crib').fortifications).toHaveLength(1);
    // komorová až od roku 830
    const chamber = withStone(village(1000, ROSTOVA), 1000);
    expect(
      startFortification(chamber, chamber.lastDay, landscape, EMPTY, {
        points: sq(AREA, 'chamber'),
        kind: 'chamber',
      }),
    ).toEqual({ ok: false, reason: 'Komorová hradba až od roku 830.' });
  });

  it('palisáda s ochozem jako nové opevnění nejde – jen vylepšením palisády', () => {
    const s = village(400);
    expect(
      startFortification(s, s.lastDay, landscape, EMPTY, {
        points: sq(AREA, 'walkway'),
        kind: 'walkway',
      }),
    ).toEqual({ ok: false, reason: FORT_WALKWAY_NEW });
  });

  it('roštová bez kamene a bez lomu chybí kámen; s lomem projde a práce obsahuje lámání', () => {
    const len = lengthOf('crib');
    const need = (100 * len) / 100;
    const s = village(1000, ROSTOVA);
    const input = { points: sq(AREA, 'crib'), kind: 'crib' as const };
    expect(startFortification(s, s.lastDay, landscape, EMPTY, input)).toEqual({
      ok: false,
      reason: FORT_NO_STONE(need),
    });
    expect(FORT_NO_STONE(99.2)).toBe('Chybí 100 m³ kamene. Ves nemá lom.');
    // část kamene na hromadě – chybí jen zbytek
    const some = withStone(village(1000, ROSTOVA), 40);
    expect(startFortification(some, some.lastDay, landscape, EMPTY, input)).toEqual({
      ok: false,
      reason: FORT_NO_STONE(need - 40),
    });
    // výchoz na mapě bez postaveného lomu nestačí (Martin 8. 11. 2026 – „Musíme zavést lom.“)
    expect(startFortification(some, some.lastDay, landscape, quarryLayer, input)).toEqual({
      ok: false,
      reason: FORT_NO_STONE(need - 40),
    });
    // lom: 40 m³ z hromady, zbytek se láme za 1,4 čd na m³ × vzdálenost k lomu
    const withQuarry = structuredClone(some);
    withQuarry.quarries = [{ outcropId: 1, ...QUARRY, rotation: 0, builtDay: 0 }];
    const quarried = ok(
      startFortification(withQuarry, withQuarry.lastDay, landscape, quarryLayer, input),
    );
    const c = fortWork(quarried);
    const factor = distanceFactor(fromCenter('crib', QUARRY));
    expect(factor).toBeGreaterThan(1);
    expect(c.cost).toBeCloseTo((620 * len) / 100 + (need - 40) * 1.4 * factor, 6);
    expect(quarried.stoneM3).toBeUndefined();
    expect(quarried.stoneStacks).toBeUndefined();
    expect(c.stoneFromPile).toBe(40);
    // lámání je v práci úseků podle jejich kamene – úseky dohromady = celá práce
    const segments = c.fortSegments!.reduce((sum, w) => sum + w.cost, 0);
    expect(segments).toBeCloseTo(c.cost, 6);
    // zrušení hned vrátí kámen z hromad na hromadu (nic se ještě nezabudovalo)
    const cancelled = cancelConstruction(quarried, quarried.lastDay, c.id);
    expect(cancelled.stoneM3).toBeCloseTo(40, 9);
    expect(cancelled.stoneStacks).toHaveLength(1);
  });

  it('rozdělané vylepšení plotu ze staré vsi se dostaví za uloženou cenu (Review Focus 3)', () => {
    const built = finish(start(village(800), 'fence', AREA, 'palisade'));
    const up = ok(
      startFortificationUpgrade(built, built.lastDay, landscape, EMPTY, {
        fortificationId: built.fortifications![0]!.id,
        work: 'upgrade',
      }),
    );
    // stará ves: stavba založená za ceny 3. 11. (palisáda 80 čd na 100 m bez kácení)
    const old = structuredClone(up);
    const c = fortWork(old);
    for (const w of c.fortSegments!) w.cost *= 80 / 230;
    c.cost = c.fortSegments!.reduce((sum, w) => sum + w.cost, 0);
    const stored = c.cost;
    const later = advance(old, 5);
    expect(fortWork(later).cost).toBe(stored);
    const doneOld = finish(old);
    const doneNew = finish(up);
    expect(doneOld.fortifications![0]!.kind).toBe('palisade');
    expect(doneOld.lastDay).toBeLessThan(doneNew.lastDay);
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
    // ohyby pro palisádu (3 m) – plot s ostřejšími ohyby by na palisádu vylepšit nešel
    const built = finish(start(village(400), 'fence', AREA, 'palisade'));
    const logs = built.woodLogs ?? 0;
    const up = ok(
      startFortificationUpgrade(built, built.lastDay, landscape, EMPTY, {
        fortificationId: built.fortifications![0]!.id,
        work: 'upgrade',
      }),
    );
    // palisáda 234,85 m → 164,4 klády → 165 z hromady, plot nic nevrátil
    expect(up.woodLogs).toBe(logs - 165);
    const half = until(up, somePalisade);
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
    const half = until(s, someBuilt);
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

describe('celý obvod blokuje od zahájení stavby (Martin 6. 11. 2026)', () => {
  /** Úseky, které ves blokují – index a druh pásu. */
  const blocking = (s: VillageState): { index: number; kind: FortKind }[] => {
    const f = s.fortifications![0]!;
    return fortBlockingSegments(f, fortRunningWork(s, f.id));
  };

  it('po kouscích: 0 %, rozpracované i hotové – stejné stěny a klíč; zrušení blokování uvolní', () => {
    const s = start(village(), 'palisade');
    const all = s.fortifications![0]!.segments.length;
    expect(blocking(s)).toHaveLength(all);
    const key = fortLayoutKey(s);
    const walls = pathFortificationsOf(s, landscape);
    expect(walls[0]!.walls.length).toBeGreaterThan(0);
    // dokončení prvního úseku klíč mapy tras nezmění (jen jeho den dokončení)
    const one = structuredClone(s);
    one.fortifications![0]!.segments[0]!.builtDay = s.lastDay;
    expect(routeMapKey(one, s.lastDay)).toBe(routeMapKey(s, s.lastDay));
    let x = s;
    let partial = false;
    for (let d = 0; d < 400 && x.constructions.some((c) => c.kind === 'fortification'); d += 5) {
      x = advance(x, 5);
      const built = x.fortifications![0]!.segments.filter((g) => g.builtDay !== null).length;
      if (built > 0 && built < all) partial = true;
      expect(fortLayoutKey(x)).toBe(key);
      expect(pathFortificationsOf(x, landscape)).toEqual(walls);
    }
    expect(partial).toBe(true);
    expect(x.constructions.some((c) => c.kind === 'fortification')).toBe(false);
    // zrušená stavba: nehotové úseky zmizí a přestanou blokovat, hotové stojí
    const half = until(s, someBuilt);
    const c = half.constructions.find((g) => g.kind === 'fortification')!;
    const cancelled = cancelConstruction(half, half.lastDay, c.id);
    const built = cancelled.fortifications![0]!.segments.filter((g) => g.builtDay !== null);
    expect(blocking(cancelled).map((b) => b.index)).toEqual(built.map((g) => g.index));
    expect(fortLayoutKey(cancelled)).not.toBe(key);
  });

  it('vylepšení plotu blokuje od zahájení pásem palisády', () => {
    // ohyby pro palisádu (3 m) – plot s ostřejšími ohyby by na palisádu vylepšit nešel
    const built = finish(start(village(400), 'fence', AREA, 'palisade'));
    expect(new Set(blocking(built).map((b) => b.kind))).toEqual(new Set(['fence']));
    const up = ok(
      startFortificationUpgrade(built, built.lastDay, landscape, EMPTY, {
        fortificationId: built.fortifications![0]!.id,
        work: 'upgrade',
      }),
    );
    expect(blocking(up).every((b) => b.kind === 'palisade')).toBe(true);
    expect(blocking(up)).toHaveLength(built.fortifications![0]!.segments.length);
    const half = until(up, somePalisade);
    expect(half.fortifications![0]!.segments.some((g) => g.kind === 'palisade')).toBe(true);
    expect(fortLayoutKey(half)).toBe(fortLayoutKey(up));
  });
});

describe('brány', () => {
  it('hráč přidá bránu na obvod, nejvýš jednu na úsek', () => {
    const s = start(village(), 'fence');
    const fort = s.fortifications![0]!;
    const free = fortSegments(fortificationOutline(fort.points!, 'fence')!).find(
      (x) => !fort.gates.some((g) => g.segment === x.index),
    )!;
    const mid = { x: free.mid[0], z: free.mid[1] };
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
