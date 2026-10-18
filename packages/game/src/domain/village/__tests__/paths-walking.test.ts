import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../calendar';
import { foundField, foundVillage } from '../actions';
import { distanceFactor, partWalkDistance } from '../fields';
import type { PathLine } from '../paths/network';
import { PATH_FOREST_EDGE, PATH_WATER_SPOT, pathTerrainOf, pathWindowFor } from '../paths/terrain';
import {
  refreshWalkDistances,
  villagePathNetwork,
  walkLayoutHash,
  walkLayoutKey,
  walkStageKey,
} from '../paths/village';
import { pathWalkLength, walkGraph, walkingDistances } from '../paths/walking';
import { PATH_WALK } from '../rules';
import { advanceVillage } from '../simulate';
import type { Person, VillageState } from '../types';
import { partWork } from '../year-plan';
import { LANDSCAPE, pathLandscape, pathTestTerrain } from './paths-fixtures';
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
  it('bez pěšin rovně, po silné pěšině o čtvrtinu kratší, nikdy víc než rovně', () => {
    const origin = [{ x: 0, z: 0 }];
    const target = [{ x: 200, z: 0 }];
    expect(walkingDistances(walkGraph([]), origin, target)[0]).toBeCloseTo(200, 9);
    const strong = walkingDistances(walkGraph([line(0, 200, 1)]), origin, target)[0]!;
    expect(strong).toBeCloseTo(200 * (1 - PATH_WALK.speedup), 9);
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
    // na pěšinu i z ní šikmo – nejvýš rovně k ní, po ní a rovně od ní
    expect(d).toBeLessThanOrEqual(10 + 200 * 0.75 + 10);
    expect(d).toBeGreaterThan(200 * 0.75);
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
      expect(p.walkDistanceM!).toBeLessThanOrEqual(p.distanceM);
      expect(distanceFactor(partWalkDistance(p))).toBeLessThanOrEqual(distanceFactor(p.distanceM));
    }
    // ve stavu jen otisky – rozložení se stadii z 1. dne v měsíci (1. 6. = DAY)
    expect(s.walkStages).toBe(walkLayoutHash(walkStageKey(s, DAY)));
    expect(s.walkLayoutKey).toBe(walkLayoutHash(`${walkLayoutKey(s, DAY + 1)}|${s.walkStages}`));
    expect(s.walkLayoutKey).toMatch(/^[0-9a-f]{16}$/);
  });

  it('stadia dílů se do chůze promítnou až 1. dne v měsíci, nový díl hned (Martin)', () => {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const [part, other] = s.parts.filter((p) => p.cell);
    part!.walkDistanceM = 1;
    const stages = s.walkStages;
    // díl se v půli měsíce oseje – vzdálenosti chůze zůstanou
    other!.state = other!.state === 'sown' ? 'ready' : 'sown';
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null);
    expect(part!.walkDistanceM).toBe(1);
    expect(s.walkStages).toBe(stages);
    // 1. 7. se stadia promítnou – přepočet
    const july = dayIndexOf({ year: 600, month: 7, day: 1 });
    refreshWalkDistances(s, july, LANDSCAPE, null);
    expect(part!.walkDistanceM).not.toBe(1);
    expect(s.walkStages).not.toBe(stages);
    // nový díl pole (strukturální změna) – přepočet hned, i v půli měsíce
    part!.walkDistanceM = 1;
    refreshWalkDistances(s, july + 3, LANDSCAPE, null);
    expect(part!.walkDistanceM).toBe(1);
    s.parts.push({ ...other!, id: 999, cell: { x: 12, y: 8 } });
    refreshWalkDistances(s, july + 4, LANDSCAPE, null);
    expect(part!.walkDistanceM).not.toBe(1);
  });

  it('otisk klíče: stejný klíč stejný otisk, drobná změna jiný', () => {
    const key = JSON.stringify([['1:zemnice:0,0,0::1:10'], [], ['5:7,3:sown']]);
    expect(walkLayoutHash(key)).toBe(walkLayoutHash(`${key}`));
    expect(walkLayoutHash(key)).not.toBe(walkLayoutHash(key.replace('sown', 'ready')));
    expect(walkLayoutHash('')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('s pěšinou na pole je chůze na vzdálené díly kratší než přímá', () => {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const network = villagePathNetwork(s, DAY + 1, LANDSCAPE, null)!;
    expect(network.lines.length).toBeGreaterThan(0);
    const far = s.parts.filter((p) => p.cell).sort((a, b) => b.distanceM - a.distanceM)[0]!;
    expect(far.walkDistanceM!).toBeLessThan(far.distanceM);
    // práce na dílu se počítá z kratší vzdálenosti
    const before = partWork({ ...far, walkDistanceM: undefined }, DAY + 1, 0);
    const after = partWork(far, DAY + 1, 0);
    expect(after.dig).toBeLessThan(before.dig);
  });

  it('beze změny rozložení se nepřepočítává', () => {
    const s = advanceVillage(withField(), DAY + 1, null, LANDSCAPE);
    const part = s.parts.find((p) => p.cell)!;
    part.walkDistanceM = 1;
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null);
    expect(part.walkDistanceM).toBe(1);
    // nové obydlí rozložení změní
    s.dwellings.push({ ...s.dwellings[0]!, id: 99, position: { x: 0, z: -30, rotation: 0 } });
    refreshWalkDistances(s, DAY + 2, LANDSCAPE, null);
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
