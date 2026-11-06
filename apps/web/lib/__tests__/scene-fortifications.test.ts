import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  fortificationArea,
  fortificationOutline,
  fortSegments,
  foundVillage,
  generateLandscape,
  pathVillageOf,
  summarizeVillage,
  tileCenterWorld,
  type Construction,
  type Fortification,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import { fortStakingLines } from '../scene/fortification-layout';
import { pickVillageTarget } from '../scene/village-picking';
import { sceneVillage } from '../village-view-scene';

// Opevnění ve scéně (fortifications.md – Brány): náhled vozové cesty (`planWagonRoad` nad vsí
// scény) a trasy vozů prohlížeče musí vidět tytéž stěny a brány jako síť serveru – scéna je bere
// z téže funkce jádra (`pathFortificationsOf`), ne z vlastního výpočtu.

const DAY = dayIndexOf({ year: 600, month: 5, day: 5 });

describe('stěny opevnění ve scéně jako na serveru', () => {
  it('scéna nese tytéž stěny a brány jako ves pro pěšiny serveru', () => {
    const landscape = generateLandscape(42);
    const site = landscape.villageSite;
    const home = tileCenterWorld(landscape, site.x, site.y);
    const state = foundVillage({
      seed: 5,
      day: DAY - 10,
      dwellingPosition: { x: home.x, z: home.z, rotation: 0 },
    });
    const cells: TileCell[] = [];
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) cells.push({ x: site.x + i, y: site.y + j });
    }
    const area = fortificationArea(cells, null, landscape);
    if ('error' in area) throw new Error('plocha opevnění testu');
    const shapes = fortSegments(fortificationOutline(area, 'fence'));
    state.fortifications = [
      {
        id: 50,
        grid: null,
        cells,
        kind: 'fence',
        segments: shapes.map((s) => ({
          index: s.index,
          builtDay: s.index < 6 ? DAY - 5 : null,
          state: 1,
        })),
        gates: [],
      },
    ];
    const scene = sceneVillage(state, landscape, DAY, summarizeVillage(state, DAY));
    const server = pathVillageOf(state, DAY, landscape).fortifications;
    expect(server).toHaveLength(1);
    expect(server![0]!.walls.length).toBeGreaterThan(0);
    expect(scene.fortifications).toEqual(server);
  });
});

// Rozestavěné opevnění od 0 % (Martin 6. 11. 2026: „Ať je obvod nějak vyznačen, stejně jako u
// staveb – ať hráč může rozkliknout opevnění, které má zatím 0 %.“): vytyčení kolíky a provázkem
// po celém obvodu nehotových úseků a výběr kliknutím na pás.
describe('rozestavěné opevnění na 0 % ve scéně', () => {
  const landscape = generateLandscape(42);
  const site = landscape.villageSite;
  const home = tileCenterWorld(landscape, site.x, site.y);

  /** Ves s plotem 3 × 3 čtverce kolem vsi; `built` úseků hotových, `building` – stavba běží. */
  function fortState(built: number, building: boolean): VillageState {
    const state = foundVillage({
      seed: 5,
      day: DAY - 10,
      dwellingPosition: { x: home.x, z: home.z, rotation: 0 },
    });
    const cells: TileCell[] = [];
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) cells.push({ x: site.x + i, y: site.y + j });
    }
    const area = fortificationArea(cells, null, landscape);
    if ('error' in area) throw new Error('plocha opevnění testu');
    const shapes = fortSegments(fortificationOutline(area, 'fence'));
    const fort: Fortification = {
      id: 60,
      grid: null,
      cells,
      kind: 'fence',
      segments: shapes.map((s) => ({
        index: s.index,
        builtDay: s.index < built ? DAY - 5 : null,
        state: 1,
      })),
      gates: [],
    };
    state.fortifications = [fort];
    if (building) {
      const work: Construction = {
        id: 90,
        kind: 'fortification',
        startedDay: DAY - 6,
        cost: shapes.length * 10,
        done: built * 10,
        dwellingType: null,
        position: null,
        dwellingId: null,
        fieldId: null,
        fortificationId: fort.id,
        fortWork: 'build',
        fortSegments: shapes.map((s) => ({ index: s.index, cost: 10 })),
      };
      state.constructions.push(work);
    }
    return state;
  }

  const scene = (state: VillageState): ReturnType<typeof sceneVillage> =>
    sceneVillage(state, landscape, DAY, summarizeVillage(state, DAY));

  /** Délka čar vytyčení (m). */
  const stakedM = (lines: readonly (readonly [number, number])[][]): number =>
    lines.reduce(
      (sum, line) =>
        sum +
        line.reduce((m, p, k) => {
          const q = line[k - 1];
          return q ? m + Math.hypot(p[0] - q[0], p[1] - q[1]) : m;
        }, 0),
      0,
    );

  it('klik na pás vybere opevnění i na 0 %', () => {
    const village = scene(fortState(0, true));
    const fort = village.forts![0]!;
    expect(fort.building).toBe(true);
    const piece = fort.band[0]!;
    const x = piece.reduce((m, p) => m + p[0], 0) / piece.length;
    const z = piece.reduce((m, p) => m + p[1], 0) / piece.length;
    const target = pickVillageTarget(
      village,
      { origin: { x, y: 200, z }, direction: { x: 0, y: -1, z: 0 } },
      { ground: { x, z }, groundHeight: () => 0, cellOf: () => null },
    );
    expect(target).toEqual({ kind: 'fortification', id: 60 });
  });

  it('vytyčení po celém obvodu na 0 %, ustupuje hotovým úsekům, bez stavby nic', () => {
    const zero = scene(fortState(0, true)).forts![0]!;
    const full = stakedM(fortStakingLines(zero));
    const perimeter = zero.shapes.reduce((m, s) => m + s.lengthM, 0);
    // čára plotu leží půl metru uvnitř obvodu – kratší jen o zaoblení rohů
    expect(full).toBeGreaterThan(perimeter * 0.9);
    expect(full).toBeLessThan(perimeter * 1.01);
    const partial = stakedM(fortStakingLines(scene(fortState(6, true)).forts![0]!));
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(full * 0.8);
    // hotové opevnění a nehotové úseky zrušené stavby se nevytyčují
    const all = zero.shapes.length;
    expect(fortStakingLines(scene(fortState(all, false)).forts![0]!)).toEqual([]);
    expect(fortStakingLines(scene(fortState(6, false)).forts![0]!)).toEqual([]);
  });
});
