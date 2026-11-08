import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundField, foundVillage } from '../actions';
import { distanceFactor, partWalkDistance } from '../fields';
import type { PathLine } from '../paths/network';
import { PATH_FOREST_EDGE, PATH_WATER_SPOT, pathTerrainOf, pathWindowFor } from '../paths/terrain';
import {
  WALK_VERSION,
  refreshWalkDistances,
  villagePathNetwork,
  routeMapKey,
  routePlacesKey,
  walkLayoutHash,
} from '../paths/village';
import type { PathVillage } from '../paths/network';
import {
  FASTEST_WALK_SHARE,
  groundSpots,
  groundWalkLength,
  nearestSpot,
  pathWalkLength,
  roadWalk,
  straightWalk,
  walkGraph,
  walkGroundOf,
  walkingDistances,
  walkingRoute,
  waterWalkDistance,
  withFieldWalk,
} from '../paths/walking';
import { waterFetchingLabor } from '../labor';
import { isCropPart, partWalkSpeed, pathCostFactor, roadWalkSpeed } from '../paths/walk-speed';
import { FIELD_WALK, PATH_WALK, ROAD_WALK } from '../rules';
import { advanceVillage } from '../simulate';
import type { Person, VillageState } from '../types';
import { partWork } from '../year-plan';
import { LANDSCAPE, part, pathLandscape, pathTestTerrain } from './paths-fixtures';
import { makeLandscape } from './placement-fixtures';
import { withBuiltFirstDwelling } from './village-fixtures';

const DAY = dayIndexOf({ year: 600, month: 6, day: 1 });
const YEAR = 365.25;

/** Pěšina po ose x z `from` do `to` (body po 5 m) se stálou silou. */
function line(from: number, to: number, strength: number, z = 0): PathLine {
  const points = [];
  for (let x = from; x <= to + 1e-9; x += 5) points.push({ x, z });
  return {
    points,
    strength: points.map(() => strength),
    years: points.map(() => 10),
    openStart: true,
    openEnd: true,
  };
}

describe('terén pěšin z krajiny', () => {
  const terrain = pathTestTerrain();
  const at = (x: number, z: number): number =>
    Math.round((z - terrain.originZ) / terrain.cellM) * terrain.width +
    Math.round((x - terrain.originX) / terrain.cellM);

  it('louka 1, voda neprůchodná, břeh a okraj lesa s příznakem', () => {
    expect(terrain.cost[at(0, 0)]).toBe(1);
    expect(terrain.cost[at(0, 82.5)]).toBe(Infinity);
    expect(terrain.flags[at(0, 71.25)]! & PATH_WATER_SPOT).toBeTruthy();
    expect(terrain.flags[at(0, 40)]! & PATH_WATER_SPOT).toBeFalsy();
    expect(terrain.cost[at(-120, 0)]).toBeGreaterThan(1);
    expect(terrain.flags[at(-90, 0)]! & PATH_FOREST_EDGE).toBeTruthy();
  });

  it('svah zdražuje se čtvercem sklonu, sráz je neprůchodný', () => {
    const slope = (s: number): number =>
      pathTestTerrain(pathLandscape((x) => x * 15 * s)).cost[at(37.5, 0)]!;
    expect(slope(0.05)).toBeCloseTo(1.25, 5);
    expect(slope(0.15)).toBeCloseTo(3.25, 5);
    expect(slope(0.6)).toBe(Infinity);
  });

  it('výřez z mezipaměti nezávisí na tom, co v ní je', () => {
    const l = pathLandscape();
    const small = pathWindowFor(l, { minX: -30, minZ: -30, maxX: 30, maxZ: 30 });
    const first = pathTerrainOf(l, small);
    // větší okno mezipaměť přepočítá – stejné malé okno musí vyjít stejně
    pathTerrainOf(l, pathWindowFor(l, { minX: -150, minZ: -150, maxX: 150, maxZ: 150 }));
    const again = pathTerrainOf(l, small);
    expect(again).toEqual(first);
    expect(again.window).toEqual(small);
  });
});

describe('vzdálenost chůze po pěšinách', () => {
  it('bez pěšin rovně, po plné pěšině 1,3× rychleji, nikdy víc než rovně', () => {
    const origin = [{ x: 0, z: 0 }];
    const target = [{ x: 200, z: 0 }];
    expect(walkingDistances(walkGraph([]), origin, target)[0]).toBeCloseTo(200, 9);
    const strong = walkingDistances(walkGraph([line(0, 200, 1)]), origin, target)[0]!;
    expect(strong).toBeCloseTo(200 / PATH_WALK.speed, 9);
    const weak = walkingDistances(walkGraph([line(0, 200, 0.4)]), origin, target)[0]!;
    expect(weak).toBeCloseTo(pathWalkLength(200, 0.4), 9);
    // pěšina stranou: oklika přes ni by byla delší – zůstane přímá vzdálenost
    const aside = walkingDistances(walkGraph([line(0, 200, 1, 150)]), origin, target)[0]!;
    expect(aside).toBeCloseTo(200, 9);
  });

  it('k pěšině a od ní se jde rovně, rozcestí sdílí bod', () => {
    const graph = walkGraph([line(0, 100, 1), { ...line(100, 200, 1), openStart: false }]);
    expect(graph.x.filter((x, i) => x === 100 && graph.z[i] === 0)).toHaveLength(1);
    const d = walkingDistances(graph, [{ x: 0, z: 10 }], [{ x: 200, z: 10 }])[0]!;
    // na pěšinu i z ní jen v nejbližším bodě (paths.md – Odhad vzdáleností): rovně k ní, po ní
    // a rovně od ní
    expect(d).toBeCloseTo(10 + 200 / PATH_WALK.speed + 10, 6);
  });
});

/** Ves s hotovou zemnicí v (−60, −40) a dvěma páry dospělých. */
function settled(): VillageState {
  const s = withBuiltFirstDwelling(
    foundVillage({ seed: 3, day: DAY, dwellingPosition: { x: -60, z: -40, rotation: 0 } }),
  );
  const adult = (id: number, years: number): Person => ({
    id,
    bornDay: DAY - Math.ceil(years * YEAR),
    dwellingId: 1,
  });
  s.people = [adult(2, 25), adult(3, 25), adult(4, 22), adult(5, 21)];
  s.constructions = [];
  s.storesKg = 4000;
  s.dwellings[0]!.builtDay = DAY - 20 * 365;
  return s;
}

/** Ves s polem na východě – pět dílů 100–160 m od obydlí (přímo). */
function withField(): VillageState {
  const s = settled();
  const cells = [12, 13, 14, 15, 16].map((x) => ({ x, y: 7 }));
  return foundField(s, DAY, {
    parts: cells.map((cell) => {
      const cx = -142.5 + cell.x * 15;
      const cz = -142.5 + cell.y * 15;
      return {
        cell,
        areaM2: 225,
        distanceM: Math.hypot(cx + 60, cz + 40),
        naturalFertility: 60,
        surface: 'meadow' as const,
        obstacleCost: 0,
      };
    }),
  });
}

describe('vzdálenost chůze dílů pole (refreshWalkDistances)', () => {
  it('spočítá se s krajinou, nikdy není delší než přímá a práce tak nezdraží', () => {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const parts = s.parts.filter((p) => p.cell);
    expect(parts.length).toBe(5);
    for (const p of parts) {
      expect(p.walkDistanceM).toBeDefined();
      // po poli stálou cenou (FIELD_WALK.field) – nejvýš 1,14× vzdušná čára
      expect(p.walkDistanceM!).toBeLessThanOrEqual(p.distanceM / FIELD_WALK.field);
      expect(distanceFactor(partWalkDistance(p))).toBeLessThanOrEqual(
        distanceFactor(p.distanceM / FIELD_WALK.field),
      );
    }
    // ve stavu jen otisky – mapa tras z prvního přepočtu, obsazenost zvlášť (paths.md – Stálé
    // trasy, pravidlo 5)
    expect(s.walkLayoutKey).toBe(walkLayoutHash(`${routeMapKey(s, DAY + 1)}|${WALK_VERSION}`));
    expect(s.routes?.placesKey).toBe(walkLayoutHash(routePlacesKey(s)));
    expect(s.walkLayoutKey).toMatch(/^[0-9a-f]{16}$/);
  });

  it('stadia dílů chůzi nemění ani 1. dne v měsíci, nový díl 1. dne dalšího měsíce (paths.md – Stálé trasy)', () => {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const [part, other] = s.parts.filter((p) => p.cell);
    part!.walkDistanceM = 1;
    const key = s.walkLayoutKey;
    // díl se v půli měsíce oseje – vzdálenosti chůze zůstanou
    other!.state = other!.state === 'sown' ? 'ready' : 'sown';
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null);
    expect(part!.walkDistanceM).toBe(1);
    // 1. 7. – měsíční kontrola, mapa tras se nezměnila: bez přepočtu
    const july = dayIndexOf({ year: 600, month: 7, day: 1 });
    refreshWalkDistances(s, july, LANDSCAPE, null);
    expect(part!.walkDistanceM).toBe(1);
    expect(s.walkLayoutKey).toBe(key);
    // nový díl pole (hráč umístil pole) – v půli měsíce stará mapa, přepočet 1. dne dalšího
    // měsíce (Martin 8. 11. 2026)
    refreshWalkDistances(s, july + 3, LANDSCAPE, null);
    expect(part!.walkDistanceM).toBe(1);
    s.parts.push({ ...other!, id: 999, cell: { x: 12, y: 8 } });
    refreshWalkDistances(s, july + 4, LANDSCAPE, null);
    expect(part!.walkDistanceM).toBe(1);
    refreshWalkDistances(s, dayIndexOf({ year: 600, month: 8, day: 1 }), LANDSCAPE, null);
    expect(part!.walkDistanceM).not.toBe(1);
  });

  it('otisk klíče: stejný klíč stejný otisk, drobná změna jiný', () => {
    const key = JSON.stringify([['1:zemnice:0,0,0::1:10'], [], ['5:7,3:sown']]);
    expect(walkLayoutHash(key)).toBe(walkLayoutHash(`${key}`));
    expect(walkLayoutHash(key)).not.toBe(walkLayoutHash(key.replace('sown', 'ready')));
    expect(walkLayoutHash('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('s pěšinou na pole je chůze na vzdálené díly kratší než přímo přes pole', () => {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const network = villagePathNetwork(s, DAY + 1, LANDSCAPE, null)!;
    expect(network.lines.length).toBeGreaterThan(0);
    const far = s.parts.filter((p) => p.cell).sort((a, b) => b.distanceM - a.distanceM)[0]!;
    expect(far.walkDistanceM!).toBeLessThan(far.distanceM / FIELD_WALK.field);
    // práce na dílu se počítá ze vzdálenosti chůze
    const direct = partWork(
      { ...far, walkDistanceM: far.distanceM / FIELD_WALK.field },
      DAY + 1,
      0,
    );
    const after = partWork(far, DAY + 1, 0);
    expect(after.dig).toBeLessThan(direct.dig);
  });

  it('beze změny rozložení se nepřepočítává', () => {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const part = s.parts.find((p) => p.cell)!;
    part.walkDistanceM = 1;
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null);
    expect(part.walkDistanceM).toBe(1);
    // nové obydlí rozložení změní – přepočet 1. dne dalšího měsíce, s `now` hned
    s.dwellings.push({ ...s.dwellings[0]!, id: 99, position: { x: 0, z: -30, rotation: 0 } });
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null);
    expect(part.walkDistanceM).toBe(1);
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null, true);
    expect(part.walkDistanceM).not.toBe(1);
  });

  it('starší uložená ves (bez vzdálenosti chůze) počítá s přímou vzdáleností', () => {
    const old = JSON.parse(JSON.stringify(withField())) as VillageState;
    for (const p of old.parts) delete p.walkDistanceM;
    delete old.walkLayoutKey;
    const part = old.parts[0]!;
    expect(partWalkDistance(part)).toBe(part.distanceM);
    // bez krajiny (kalibrace) se nic nepočítá
    const later = advanceVillage(old, DAY + 30, null);
    expect(later.parts.every((p) => p.walkDistanceM === undefined)).toBe(true);
    // s krajinou si ji doplní
    const loaded = advanceVillage(old, DAY + 1, null, LANDSCAPE);
    expect(loaded.parts.every((p) => p.walkDistanceM !== undefined)).toBe(true);
  });

  it('po kouscích s JSON mezi nimi dá stejný stav jako jedním voláním (1 rok s polem)', () => {
    const start = withField();
    const end = DAY + 365;
    const whole = advanceVillage(start, end, null, LANDSCAPE);
    const viaJson = (v: VillageState): VillageState =>
      JSON.parse(JSON.stringify(v)) as VillageState;
    const steps = [1, 3, 30, 7, 90, 2];
    let chunked = viaJson(start);
    for (let i = 0; chunked.lastDay < end; i++) {
      chunked = viaJson(
        advanceVillage(
          chunked,
          Math.min(end, chunked.lastDay + steps[i % steps.length]!),
          null,
          LANDSCAPE,
        ),
      );
    }
    expect(chunked).toEqual(viaJson(whole));
    expect(whole.parts.some((p) => p.walkDistanceM !== undefined)).toBe(true);
  }, 60_000);
});

// Martin, 19. 10. 2026: „Ale vesničané tam přece musí chodit nějak pro vodu a musí jim to zabírat
// čas.“ – chůze z obydlí k nejbližší vodě (paths.md – Pochůzky pro vodu, population.md – Práce)
describe('chůze k vodě (waterWalkM, waterWalkDistance)', () => {
  it('spočítá se s krajinou k nejbližšímu břehu a přidá se k dennímu minimu', () => {
    const s = advanceVillage(settled(), DAY + 1, null, LANDSCAPE);
    const d = s.dwellings[0]!;
    // zemnice (−60, −40), břeh potoka kolem z = 71 – přes 100 m rovně po louce
    expect(d.waterWalkM).toBeDefined();
    expect(d.waterWalkM!).toBeGreaterThan(100);
    expect(d.waterWalkM!).toBeLessThan(130);
    const domestic = (v: typeof s): number =>
      v
        .labor!.shares.filter((share) => share.activity === 'domestic')
        .reduce((sum, share) => sum + share.manDays, 0);
    // bez krajiny (kalibrace) chůze ani přirážka není
    const plain = advanceVillage(settled(), DAY + 1, null);
    expect(plain.dwellings[0]!.waterWalkM).toBeUndefined();
    // rozdělení práce dne je na tisíciny člověkodne
    expect(domestic(s) - domestic(plain)).toBeCloseTo(waterFetchingLabor(4, d.waterWalkM), 3);
    // potok 360 m od domu – přirážka znatelná (4 lidé ≈ 0,02 čd za den)
    const far = makeLandscape({ size: 50, surface: (_x, y) => (y === 46 ? 'water' : 'meadow') });
    const away = advanceVillage(settled(), DAY + 1, null, far);
    const walk = away.dwellings[0]!.waterWalkM!;
    // rovně ≈ 355 m, po pěšině k vodě (okno sítě sahá k vodě) až 1,3× rychleji
    expect(walk).toBeGreaterThan(355 / 1.3);
    expect(walk).toBeLessThan(380);
    const extra = domestic(away) - domestic(plain);
    expect(extra).toBeGreaterThan(0.015);
    expect(extra).toBeCloseTo(waterFetchingLabor(4, walk), 3);
  });

  it('jedna funkce: po pěšinách a cestách, jen po pevných cestách, nebo rovně krajinou', () => {
    const ground = walkGroundOf(LANDSCAPE);
    const from = { x: -60, z: -40 };
    const spot = nearestSpot(groundSpots(ground, PATH_WATER_SPOT), from)!;
    const straight = waterWalkDistance(ground, straightWalk(ground), from)!;
    expect(straight).toBeCloseTo(groundWalkLength(ground, from, spot), 9);
    expect(waterWalkDistance(ground, roadWalk([], ground), from)).toBeCloseTo(straight, 9);
    // vyšlapaná pevná cesta k vodě chůzi zkrátí
    const road = {
      points: [
        { x: -60, z: -38 },
        { x: spot.x, z: spot.z - 1 },
      ],
      grade: 'trodden' as const,
    };
    expect(waterWalkDistance(ground, roadWalk([road], ground), from)!).toBeLessThan(straight * 0.8);
    // bez vody v okně null
    const dry = {
      terrain: { ...ground.terrain, flags: new Uint8Array(ground.terrain.flags.length) },
    };
    expect(waterWalkDistance(dry, straightWalk(dry), from)).toBeNull();
  });
});

// Rychlosti chůze proti louce (Martin, 19. 10. 2026: „berme louku za výchozí: 1 vyšlapaná denní
// cesta 1.3 stálá vyšlapaná cesta 1.5. Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7“
// a „Neber strniště jako louku, ale dej mu drobný postih. Ber to třeba jako 0.8.“)
describe('rychlosti chůze (walk-speed.ts)', () => {
  it('poměry podle tabulky – pěšina, cesty, mokřina, pole', () => {
    expect(1 / pathCostFactor(1)).toBeCloseTo(1.3, 9);
    expect(pathCostFactor(0)).toBe(1);
    // slabší pěšina úměrně méně
    expect(pathCostFactor(0.5)).toBeCloseTo(1 - (1 - 1 / 1.3) * 0.5, 9);
    expect(roadWalkSpeed('trodden', false)).toBe(1.5);
    expect(roadWalkSpeed('improved', false)).toBe(1.7);
    expect(roadWalkSpeed('trodden', true)).toBe(0.5);
    // upravená má hať, jen bez ní (`unbridged`) v mokřině zpomalí
    expect(roadWalkSpeed('improved', true)).toBe(1.7);
    expect(roadWalkSpeed('improved', true, 0, true)).toBe(0.5);
    expect(FASTEST_WALK_SHARE).toBeCloseTo(1 / 1.7, 9);
    // pole: stálá rychlost 0,875 (cena 1,14) v každém stadiu a vzhledu (paths.md – Stálé trasy, pravidlo 1),
    // zarostlý díl (křoviny, mladý les) jako louka – zdrží vegetace
    for (const look of ['plowed', 'sown', 'green', 'harvesting', 'stubble'] as const) {
      expect(partWalkSpeed({ stage: 'sown', look }), look).toBe(0.875);
    }
    expect(isCropPart({ stage: 'sown', look: 'stubble' })).toBe(true);
    for (const look of ['bare', 'pasture', 'meadow', 'mown'] as const) {
      expect(partWalkSpeed({ stage: 'meadow', look }), look).toBe(0.875);
    }
    expect(partWalkSpeed({ stage: 'founding' })).toBe(0.875);
    expect(partWalkSpeed({ stage: 'young-fallow' })).toBe(0.875);
    expect(partWalkSpeed({ stage: 'shrubs' })).toBe(1);
    expect(partWalkSpeed({ stage: 'sown', look: 'plowed', work: 0.3, before: 'stubble' })).toBe(
      0.875,
    );
  });

  it('rovně přes pole: v osevu i strništi 1,14× déle; pěšina dne přes pole nezrychlí', () => {
    const base = { terrain: pathTestTerrain() };
    // díly 15 × 15 m ve středu krajiny (bez mokřiny a vody); buňky terénu po 3,75 m – na kraji
    // dílu ± buňka
    const strip = (look: 'green' | 'stubble'): PathVillage['fields'] => [
      {
        id: 1,
        parts: [-7.5, 7.5, 22.5, 37.5].map((x) => ({ ...part(x, -60, 'sown'), look })),
      },
    ];
    const a = { x: -15, z: -60 };
    const b = { x: 45, z: -60 };
    expect(groundWalkLength(base, a, b)).toBeCloseTo(60, 6);
    const crop = withFieldWalk(base, strip('green'));
    const stubble = withFieldWalk(base, strip('stubble'));
    expect(groundWalkLength(crop, a, b)).toBeCloseTo(60 / 0.875, -1);
    expect(groundWalkLength(stubble, a, b)).toBe(groundWalkLength(crop, a, b));
    // pěšina dne přes pole nezrychlí – platí stálá cena pole
    expect(groundWalkLength(crop, a, b, 1)).toBeCloseTo(60 / 0.875, -1);
    expect(groundWalkLength(stubble, a, b, 1)).toBeCloseTo(60 / 0.875, -1);
  });

  it('pevná cesta přes díl v osevu jde rychlostí cesty', () => {
    const base = { terrain: pathTestTerrain() };
    const fields: PathVillage['fields'] = [
      {
        id: 1,
        parts: [-7.5, 7.5, 22.5, 37.5].map((x) => ({
          ...part(x, -60, 'sown'),
          look: 'ripe' as const,
        })),
      },
    ];
    const ground = withFieldWalk(base, fields);
    const road = {
      points: [
        { x: -15, z: -60 },
        { x: 45, z: -60 },
      ],
      grade: 'trodden' as const,
      ground: { wet: [], fords: [] },
    };
    const walk = walkingDistances(
      walkGraph([], { roads: [road], ground }),
      [{ x: -15, z: -60 }],
      [{ x: 45, z: -60 }],
      ground,
    )[0]!;
    expect(walk).toBeCloseTo(60 / 1.5, 6);
    // bez cesty přes pole (stálá rychlost 0,875)
    expect(
      walkingDistances(walkGraph([], { ground }), [road.points[0]!], [road.points[1]!], ground)[0],
    ).toBeCloseTo(60 / 0.875, -1);
  });
});

describe('walkingDistances – ořezávání podle dolní meze', () => {
  it('vyjde stejně jako průchod všemi napojeními (s poli, mokřinou i vodou)', () => {
    const base = { terrain: pathTestTerrain() };
    const ground = withFieldWalk(base, [
      {
        id: 1,
        parts: [-37.5, -22.5, -7.5, 7.5, 22.5].flatMap((x) =>
          [22.5, 37.5, 52.5].map((z) => ({ ...part(x, z, 'sown'), look: 'green' as const })),
        ),
      },
    ]);
    const lines = [line(-100, 100, 1, 10), line(-60, 60, 0.5, 65), line(-120, -20, 0.8, -40)];
    const graph = walkGraph(lines, { ground });
    const origins = [
      { x: 0, z: 0 },
      { x: 15, z: -5 },
      { x: -20, z: 4 },
    ];
    const targets = Array.from({ length: 40 }, (_, k) => ({
      x: -110 + ((k * 37) % 220),
      z: -100 + ((k * 53) % 190),
    }));
    // průchod všemi napojeními: na síť jen v nejbližším bodě každé pěšiny (z obydlí i k cíli),
    // Dijkstra po grafu, cíl rovně z obydlí nebo z nejbližšího bodu každé pěšiny
    const n = graph.x.length;
    const nearest = (chain: readonly number[], p: { x: number; z: number }): number =>
      chain.reduce((best, id) =>
        (graph.x[id]! - p.x) ** 2 + (graph.z[id]! - p.z) ** 2 <
        (graph.x[best]! - p.x) ** 2 + (graph.z[best]! - p.z) ** 2
          ? id
          : best,
      );
    const dist: number[] = Array.from({ length: n }, () => Infinity);
    for (const chain of graph.chains) {
      for (const o of origins) {
        const id = nearest(chain, o);
        dist[id] = Math.min(
          dist[id]!,
          groundWalkLength(ground, o, { x: graph.x[id]!, z: graph.z[id]! }),
        );
      }
    }
    const done = new Set<number>();
    for (let round = 0; round < n; round++) {
      let c = -1;
      for (let id = 0; id < n; id++) if (!done.has(id) && (c < 0 || dist[id]! < dist[c]!)) c = id;
      done.add(c);
      for (const { to, cost } of graph.links[c]!) dist[to] = Math.min(dist[to]!, dist[c]! + cost);
    }
    const brute = targets.map((t) =>
      Math.min(
        ...origins.map((o) => groundWalkLength(ground, o, t)),
        ...graph.chains.map((chain) => {
          const id = nearest(chain, t);
          return dist[id]! + groundWalkLength(ground, { x: graph.x[id]!, z: graph.z[id]! }, t);
        }),
      ),
    );
    const fast = walkingDistances(graph, origins, targets, ground);
    fast.forEach((d, k) => expect(d).toBeCloseTo(brute[k]!, 9));
  });
});

describe('walkingRoute – trasa chodce týmž modelem jako odhad', () => {
  // pevná cesta oklikou: z (0, 0) na sever k (0, 60), na východ k (200, 60) a na jih k (200, 0)
  const detour = {
    points: [
      { x: 0, z: 0 },
      { x: 0, z: 60 },
      { x: 200, z: 60 },
      { x: 200, z: 0 },
    ],
    grade: 'improved' as const,
  };

  it('cena je přesně odhad simulace (walkingDistances) – s poli, pěšinami i cestou', () => {
    const base = { terrain: pathTestTerrain() };
    const ground = withFieldWalk(base, [
      {
        id: 1,
        parts: [-37.5, -22.5, -7.5, 7.5, 22.5].flatMap((x) =>
          [22.5, 37.5, 52.5].map((z) => ({ ...part(x, z, 'sown'), look: 'green' as const })),
        ),
      },
    ]);
    const lines = [line(-100, 100, 1, 10), line(-60, 60, 0.5, 65), line(-120, -20, 0.8, -40)];
    const graph = walkGraph(lines, { roads: [detour], ground });
    for (let k = 0; k < 30; k++) {
      const a = { x: -110 + ((k * 41) % 220), z: -100 + ((k * 29) % 190) };
      const b = { x: -110 + ((k * 37) % 220), z: -100 + ((k * 53) % 190) };
      const found = walkingRoute(graph, a, b, ground);
      expect(found.cost).toBeCloseTo(walkingDistances(graph, [a], [b], ground)[0]!, 9);
      expect(found.points[0]).toEqual(a);
      expect(found.points[found.points.length - 1]).toEqual(b);
      expect(found.costs).toHaveLength(found.points.length - 1);
      expect(found.costs.reduce((s, c) => s + c, 0)).toBeCloseTo(found.cost, 6);
    }
  });

  it('po cestě oklikou, když je po ní chůze kratší než rovně (jinak rovně)', () => {
    const graph = walkGraph([], { roads: [detour] });
    // 200 m rovně proti 320 m cesty rychlostí 1,7 (≈ 188 m chůze) – po cestě přes oba rohy
    const far = walkingRoute(graph, { x: 0, z: 0 }, { x: 200, z: 0 });
    expect(far.cost).toBeCloseTo(320 / ROAD_WALK.speed.improved, 6);
    expect(far.points.map((p) => [p.x, p.z])).toEqual([
      [0, 0],
      [0, 0],
      [0, 60],
      [200, 60],
      [200, 0],
      [200, 0],
    ]);
    // krátká cesta od cesty: rovně je kratší než k ní, po ní a zpět
    const near = walkingRoute(graph, { x: 30, z: 0 }, { x: 60, z: 0 });
    expect(near.points).toEqual([
      { x: 30, z: 0 },
      { x: 60, z: 0 },
    ]);
    expect(near.cost).toBeCloseTo(30, 9);
  });
});
