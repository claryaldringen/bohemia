import { describe, expect, it } from 'vitest';
import { WEAR } from '../rules-roads';
import { type GridWindow } from '../paths/network-grid';
import { encodeRoute } from '../paths/routes';
import { wearStrengthAt } from '../paths/route-paths';
import { pathCellM } from '../paths/terrain';
import {
  addCartWear,
  decodeWear,
  encodeWear,
  flushWear,
  settleWear,
  trafficAt,
  trafficField,
  wearAt,
  wearCellAt,
  wearCellsOf,
  wearKey,
  wearLaborKey,
  wearMap,
  wearRevisionKey,
} from '../paths/wear';
import type { RoadWear, StoredRoute, VillageRoutes } from '../types';
import { LANDSCAPE } from './paths-fixtures';

/** Buňka mřížky pěšin – 3,75 m = políčko vyšlapanosti (paths.md – Stálé trasy, pravidlo 4). */
const CELL = 3.75;
const WINDOW: GridWindow = { width: 400, height: 400, originX: -750, originZ: -750, cellM: CELL };

/** Trasa po buňkách světa z (x0, z) do (x1, z) a dál do (x1, z1) – vodorovně, pak svisle. */
function route(
  x0: number,
  z: number,
  x1: number,
  trips: number,
  options: { z1?: number; to?: string; purpose?: StoredRoute['purpose'] } = {},
): StoredRoute {
  const cells: number[] = [];
  const at = (x: number, zz: number): number => (zz + 200) * WINDOW.width + (x + 200);
  const dx = Math.sign(x1 - x0);
  cells.push(at(x0, z));
  for (let x = x0 + dx; dx !== 0 && x !== x1 + dx; x += dx) cells.push(at(x, z));
  const z1 = options.z1 ?? z;
  const dz = Math.sign(z1 - z);
  for (let zz = z + dz; dz !== 0 && zz !== z1 + dz; zz += dz) cells.push(at(x1, zz));
  return {
    from: 'd:1',
    to: options.to ?? 'water',
    purpose: options.purpose ?? 'water',
    trips,
    ...encodeRoute(cells, WINDOW),
  };
}

function routesOf(list: StoredRoute[], key = `k${Math.random()}`): VillageRoutes {
  return { day: 0, key, list };
}

/** Sčítání jako na konci dopočtu – pracovní políčka zapsaná do `wear.cells`. */
function settle(...args: Parameters<typeof settleWear>): number {
  const visited = settleWear(...args);
  flushWear(args[0]);
  return visited;
}

function emptyWear(day = 0): RoadWear {
  return { day, cells: '', labor: [] };
}

/** Vyšlapanost ve středu buňky pěšin (x, z). */
function wearOfCell(wear: RoadWear, x: number, z: number): number {
  return wearAt(decodeWear(wear.cells), x * CELL, z * CELL);
}

describe('vyšlapanost – kódování', () => {
  it('tam a zpět – seřazené klíče, nuly se neukládají, pořadí vložení nerozhoduje', () => {
    const entries: [number, number][] = [
      [wearKey(-120, 33), 150_000],
      [wearKey(5, -7), 1],
      [wearKey(5, -6), 99_999],
      [wearKey(0, 0), 0],
      [wearKey(300, -300), 12_345],
    ];
    const encoded = encodeWear(new Map(entries));
    expect(encodeWear(new Map([...entries].reverse()))).toBe(encoded);
    const decoded = decodeWear(encoded);
    expect([...decoded.entries()]).toEqual(
      entries.filter(([, v]) => v > 0).sort((a, b) => a[0] - b[0]),
    );
    expect(decodeWear('').size).toBe(0);
    expect(encodeWear(new Map())).toBe('');
  });

  it('políčko = buňka mřížky pěšin 3,75 m; políčka trasy = její buňky bez sousedů, seřazená', () => {
    expect(WEAR.cellM).toBe(CELL);
    expect(WEAR.cellM).toBe(pathCellM(LANDSCAPE));
    const cells = wearCellsOf(route(0, 0, 7, 100), CELL);
    expect(cells).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((x) => wearKey(x, 0)));
    expect(cells).not.toContain(wearKey(0, 1));
    expect(cells).not.toContain(wearKey(-1, 0));
    // bod světa padne do nejbližší buňky – střed buňky i bod do půl buňky od něj, i záporné
    expect(wearCellAt(-1 * CELL, -1 * CELL)).toBe(wearKey(-1, -1));
    expect(wearCellAt(2 * CELL + 1.8, -2 * CELL - 1.8)).toBe(wearKey(2, -2));
    expect(wearCellAt(2 * CELL - 1.8, 0)).toBe(wearKey(2, 0));
  });

  it('klíč práce = cíl trasy', () => {
    expect(wearLaborKey({ kind: 'field', id: 4, parts: [1, 2] })).toBe('field:4');
    expect(wearLaborKey({ kind: 'trees', ids: [3, 9] })).toBe('trees:3.9');
    expect(wearLaborKey({ kind: 'meadow', cells: [{ x: 1, y: 2 }] })).toBe('meadow');
    expect(wearLaborKey({ kind: 'kiln', id: 5, x: 0, z: 0, from: 2, kiln: 1 })).toBe('kiln:5');
    expect(wearLaborKey({ kind: 'village' })).toBeNull();
    expect(wearLaborKey({ kind: 'water', x: 1, z: 2 })).toBeNull();
  });
});

describe('vyšlapanost – sčítání po intervalech', () => {
  it('3 cesty denně dosáhnou prahu cesty za 500 dní', () => {
    const field = trafficField(routesOf([route(0, 0, 20, 300)]), CELL);
    const at499 = emptyWear();
    settle(at499, field, 0, 499);
    expect(wearOfCell(at499, 10, 0)).toBeLessThan(WEAR.roadAt);
    const at500 = emptyWear();
    settle(at500, field, 0, 500);
    expect(wearOfCell(at500, 10, 0)).toBe(WEAR.roadAt);
    expect(at500.day).toBe(500);
  });

  it('pod 1 cestou denně se nevyšlape nic', () => {
    for (const trips of [100, 90]) {
      const wear = emptyWear();
      settle(wear, trafficField(routesOf([route(0, 0, 20, trips)]), CELL), 0, 2000);
      expect(wear.cells).toBe('');
    }
  });

  it('strop a pokles na nulu nejvýš za 1 500 dní', () => {
    const wear = emptyWear();
    settle(wear, trafficField(routesOf([route(0, 0, 20, 3000)]), CELL), 0, 1000);
    expect(wearOfCell(wear, 10, 0)).toBe(WEAR.max);
    const none = trafficField(routesOf([]), CELL);
    settle(wear, none, 1000, 2499);
    expect(wearOfCell(wear, 10, 0)).toBe(100);
    settle(wear, none, 2499, 2500);
    expect(wear.cells).toBe('');
  });

  it('trasa přidá jen svým buňkám – buňka vedle nic (bez tolerance)', () => {
    const wear = emptyWear();
    settle(wear, trafficField(routesOf([route(0, 0, 20, 300)]), CELL), 0, 250);
    expect(wearOfCell(wear, 10, 0)).toBe(50_000);
    expect(wearOfCell(wear, 10, 1)).toBe(0);
    expect(wearOfCell(wear, 10, -1)).toBe(0);
    expect(wearOfCell(wear, 21, 0)).toBe(0);
    expect(decodeWear(wear.cells).size).toBe(21);
  });

  it('jízda vozu přidá jen buňce, kudy vůz jel', () => {
    const wear = emptyWear();
    const raw = new Float32Array(10 * 10);
    raw[3 * 10 + 4] = 2; // buňka (4, 3) okna od (0, 0) – 2 jízdy za den
    addCartWear(wear, { originX: 0, originZ: 0, cellM: CELL, width: 10, height: 10, raw }, 10);
    flushWear(wear);
    expect([...decodeWear(wear.cells)]).toEqual([[wearKey(4, 3), 2 * 10 * 100 * WEAR.cartWeight]]);
  });

  it('čára trasy čte vyšlapanost z buňky bodu a sousedních (vyhlazený bod až o buňku vedle)', () => {
    const cells = new Map([[wearKey(5, 0), WEAR.roadAt]]);
    expect(wearStrengthAt(cells, 5 * CELL, 0)).toBe(1);
    expect(wearStrengthAt(cells, 5.4 * CELL, 1.4 * CELL)).toBe(1);
    expect(wearStrengthAt(cells, 5 * CELL, 2 * CELL)).toBe(0);
  });

  it('dopočet 400 dní po 1 / 7 / 30 / 400 dnech je bit po bitu stejný', () => {
    const field = trafficField(
      routesOf([
        route(0, 0, 30, 270, { z1: 12 }),
        route(-10, 4, 25, 130),
        route(5, -8, 5, 60, { z1: 20 }),
        route(-20, -20, 0, 1700, { z1: -5 }),
      ]),
      CELL,
    );
    const start = (): RoadWear => ({
      day: 0,
      cells: encodeWear(
        new Map([
          [wearKey(40, 40), 30_000],
          [wearKey(2, 0), 149_000],
          [wearKey(-3, 3), 77],
        ]),
      ),
      labor: [],
    });
    const results = [1, 7, 30, 400].map((chunk) => {
      const wear = start();
      for (let day = 0; day < 400; day += chunk) {
        settle(wear, field, day, Math.min(400, day + chunk));
      }
      return wear.cells;
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).not.toBe(start().cells);
  });

  it('celá čísla i s prací v necelých člověkodnech', () => {
    const field = trafficField(
      routesOf([
        route(0, 0, 20, 70, { to: 'field:1', purpose: 'work' }),
        route(0, 6, 20, 33, { to: 'field:1', purpose: 'work', z1: 15 }),
        route(-5, 0, 10, 140),
      ]),
      CELL,
    );
    const wear = emptyWear();
    wear.labor = [{ target: { kind: 'field', id: 1 }, manDays: 37.333 }];
    settle(wear, field, 0, 9);
    const values = [...decodeWear(wear.cells).values()];
    expect(values.length).toBeGreaterThan(0);
    expect(values.every((v) => Number.isInteger(v) && v > 0 && v <= WEAR.max)).toBe(true);
  });

  it('práci intervalu nesou trasy k cíli podle cest za den, uložené cesty za prací ne', () => {
    // dvě trasy k témuž poli: první 50, druhá 150 setin – práce 10 člověkodnů za 1 den
    const list = [
      route(0, 0, 20, 50, { to: 'field:1', purpose: 'work' }),
      route(0, 20, 20, 150, { to: 'field:1', purpose: 'work', z1: 0 }),
    ];
    const field = trafficField(routesOf(list), CELL);
    const idle = emptyWear();
    settle(idle, field, 0, 10);
    expect(idle.cells).toBe('');
    const wear = emptyWear();
    wear.labor = [
      { target: { kind: 'field', id: 1 }, manDays: 10 },
      { target: { kind: 'field', id: 2 }, manDays: 40 },
    ];
    settle(wear, field, 0, 1);
    // jen první trasa: 1 000 × 50 / 200 − 100; jen druhá: 1 000 × 150 / 200 − 100; obě: 1 000 − 100
    expect(wearOfCell(wear, 2, 0)).toBe(150);
    expect(wearOfCell(wear, 2, 20)).toBe(650);
    expect(wearOfCell(wear, 20, 0)).toBe(900);
    expect(wear.labor).toEqual([]);
    expect(wear.day).toBe(1);
  });

  it('stálá část tras za prací (base) vyšlape cestu i bez práce – pole za ≤ 1 700 dní', () => {
    const field = trafficField(
      routesOf([{ ...route(0, 0, 20, 160, { to: 'field:1', purpose: 'work' }), base: 160 }]),
      CELL,
    );
    const wear = emptyWear();
    settle(wear, field, 0, 1700);
    expect(wearOfCell(wear, 10, 0)).toBeGreaterThanOrEqual(WEAR.roadAt);
    // práce dne se nepřičítá dvakrát: base 160 + práce jen navíc podle podílu cíle
    const busy = emptyWear();
    busy.labor = [{ target: { kind: 'field', id: 1 }, manDays: 10 }];
    settle(busy, field, 0, 1);
    expect(wearOfCell(busy, 10, 0)).toBe(60 + 1000);
  });

  it('trasa za prací bez base (starší stav) vyšlapanost sama nenese', () => {
    const field = trafficField(
      routesOf([route(0, 0, 20, 160, { to: 'field:1', purpose: 'work' })]),
      CELL,
    );
    const wear = emptyWear();
    settle(wear, field, 0, 1700);
    expect(wear.cells).toBe('');
  });

  it('provoz podél trasy za prací je celé trips, ať má base nebo ne (zarůstání)', () => {
    for (const base of [undefined, 40]) {
      const r = route(0, 0, 20, 160, { to: 'field:1', purpose: 'work' });
      const field = trafficField(routesOf([base ? { ...r, base } : r]), CELL);
      expect(trafficAt(field, 10 * CELL, 0)).toBe(160);
    }
  });

  it('klíč políčka mimo rozsah selže hlasitě', () => {
    expect(() => wearKey(40_000, 0)).toThrow(RangeError);
    expect(() => wearKey(0, -32_769)).toThrow(RangeError);
    expect(() => wearKey(-32_768, 32_767)).not.toThrow();
  });

  it('interval projde jen sjednocení políček s provozem a s vyšlapaností', () => {
    const field = trafficField(routesOf([route(0, 0, 7, 300)]), CELL);
    const wear: RoadWear = {
      day: 0,
      cells: encodeWear(
        new Map([
          [wearKey(0, 0), 500],
          [wearKey(4, 1), 500],
          [wearKey(50, 50), 500],
          [wearKey(-30, 7), 500],
        ]),
      ),
      labor: [],
    };
    // 8 buněk trasy (i (0, 0)) a 3 vyšlapaná políčka mimo ni
    expect(settle(wear, field, 0, 3)).toBe(8 + 3);
  });
});

describe('provozní pole', () => {
  it('provoz po políčkách podél trasy = cesty za den trasy, souběžné se sčítají', () => {
    const a = route(0, 0, 20, 270);
    const field = trafficField(routesOf([a]), CELL);
    const cells = wearCellsOf(a, CELL);
    let sum = 0;
    for (const [c, trips] of field.cells) {
      expect(cells).toContain(c);
      sum += trips;
    }
    expect(sum).toBe(a.trips * cells.length);
    for (let x = 0; x <= 20; x++) expect(trafficAt(field, x * CELL, 0)).toBe(270);
    expect(trafficAt(field, 0, 50 * CELL)).toBe(0);
    // provoz pro cesty z pásu ± 1 buňky (osa cesty je vyhlazená čára trasy), každá trasa jednou
    expect(trafficAt(field, 10 * CELL, CELL)).toBe(270);
    expect(trafficAt(field, 10 * CELL, 2 * CELL)).toBe(0);
    const both = trafficField(routesOf([a, route(0, 0, 20, 30)]), CELL);
    expect(trafficAt(both, 10 * CELL, 0)).toBe(300);
  });

  it('pro týž klíč tras se nepočítá znovu', () => {
    const routes = routesOf([route(0, 0, 20, 270), route(0, 5, 9, 40)], 'same-key');
    const field = trafficField(routes, CELL);
    expect(trafficField(structuredClone(routes), CELL)).toBe(field);
    expect(trafficField(routesOf(routes.list, 'other-key'), CELL)).not.toBe(field);
  });
});

describe('klíč vyšlapanosti pro síť', () => {
  const field = trafficField(routesOf([route(0, 0, 20, 500)]), CELL);

  it('mění se při sčítání a po zápisu odpovídá kódu; bez změny stejný', () => {
    const wear = emptyWear();
    const before = wearRevisionKey(wear);
    settleWear(wear, field, 0, 30);
    const mid = wearRevisionKey(wear);
    expect(mid).not.toBe(before);
    expect(wearRevisionKey(wear)).toBe(mid);
    settleWear(wear, field, 30, 60);
    expect(wearRevisionKey(wear)).not.toBe(mid);
    flushWear(wear);
    expect(wearRevisionKey(wear)).toBe(`c${wear.cells}`);
  });

  it('políčka před zápisem a po něm dávají totéž (wearMap, trafficAt)', () => {
    const wear = emptyWear();
    settleWear(wear, field, 0, 90);
    const before = new Map(wearMap(wear));
    const traffic = trafficAt(field, 5 * CELL, 0);
    flushWear(wear);
    expect(new Map(wearMap(wear))).toEqual(before);
    expect(decodeWear(wear.cells)).toEqual(before);
    expect(trafficAt(field, 5 * CELL, 0)).toBe(traffic);
  });
});
