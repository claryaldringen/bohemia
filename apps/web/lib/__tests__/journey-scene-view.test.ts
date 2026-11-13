import { describe, expect, it } from 'vitest';
import {
  areaOutline,
  dayIndexOf,
  fortificationArea,
  fortSegments,
  foundVillage,
  generateLandscape,
  lookAround,
  summarizeVillage,
  tileCenterWorld,
  type Construction,
  type JourneyView,
  type SeenCell,
  type SeenPart,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import { journeyCellOf, seenVillageOf } from '../journey-scene-view';
import { sceneVillage } from '../village-view-scene';
import type { SceneVillage } from '../village-view-scene-types';

// Cizí ves ve scéně výjezdu (plán 2026-11-13 – Úloha 9a): jen z toho, co rod ví – stavby všech
// druhů stejnými tvary scény jako vlastní ves, nic z lidí, polí, zvířat a zásob.

const DAY = dayIndexOf({ year: 600, month: 5, day: 5 });
const landscape = generateLandscape(42);
const site = landscape.villageSite;
const home = tileCenterWorld(landscape, site.x, site.y);

/** Ves se vším, co znalost nese (a s lidmi a poli, které nést nesmí). */
function foreignVillage(): VillageState {
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
  const outline = areaOutline(area, 'fence');
  const shapes = fortSegments(outline);
  state.fortifications = [
    {
      id: 50,
      points: outline.points.map((p) => [p[0], p[1]] as const),
      kind: 'fence',
      segments: shapes.map((s) => ({
        index: s.index,
        builtDay: s.index < 6 ? DAY - 5 : null,
        state: 1,
      })),
      gates: [],
    },
  ];
  const at = { x: home.x + 10, z: home.z + 10, rotation: 0.4 };
  const floorSite: Construction = {
    id: 71,
    kind: 'threshing-floor',
    startedDay: DAY - 3,
    cost: 10,
    done: 5,
    dwellingType: null,
    position: at,
    dwellingId: null,
    fieldId: null,
  };
  state.threshingFloors = [
    { id: 70, position: { ...at, x: at.x + 20 }, builtDay: DAY - 50 },
    { id: 71, position: at, builtDay: null },
  ];
  state.constructions = [...state.constructions, floorSite];
  state.kilnRemnants = [{ id: 61, burnerId: 1, x: home.x - 30, z: home.z, day: DAY - 100 }];
  state.sacredRuins = [
    { id: 81, kind: 'shrine', position: { x: home.x, z: home.z - 40, rotation: 0 }, day: DAY - 20 },
  ];
  state.ruins = [
    {
      id: 9,
      type: 'srub',
      position: { x: home.x + 30, z: home.z, rotation: 0 },
      day: DAY - 10,
      charred: true,
    },
  ];
  return state;
}

function seenOf(state: VillageState): SeenCell {
  const cell = lookAround(undefined, {
    village: state,
    eyes: [{ x: home.x, z: home.z }],
    grid: null,
    day: DAY,
  });
  return { ...cell, villageId: 'v1' };
}

describe('seenVillageOf', () => {
  it('bez znalosti nebo bez staveb null', () => {
    expect(seenVillageOf(null, landscape)).toBeNull();
    expect(seenVillageOf({ trail: [[0, 0]], parts: [] }, landscape)).toBeNull();
  });

  it('složí všechny známé druhy stejnými tvary jako vlastní ves a nic dalšího', () => {
    const state = foreignVillage();
    const seen = seenOf(state);
    const kinds = new Set(seen.parts.map((p) => p.data.kind));
    expect(kinds).toEqual(
      new Set(['site', 'threshing', 'kilnRemnant', 'ruin', 'sacredRuin', 'fortification']),
    );
    const scene = seenVillageOf(seen, landscape)!;
    const own = sceneVillage(state, landscape, DAY, summarizeVillage(state, DAY));
    // stavby: totéž, co ukazuje ves sama (bez dýmu a pěšin)
    const without = (list: SceneVillage['dwellings'], keys: string[]): object[] =>
      list.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !keys.includes(k))));
    expect(without(scene.dwellings, ['inhabited', 'since'])).toEqual(
      without(own.dwellings, ['inhabited', 'since', 'yard', 'working']),
    );
    expect(scene.forts).toEqual(own.forts);
    expect(scene.threshingFloors?.map((f) => [f.id, f.built, f.progress])).toEqual([
      [70, true, 1],
      [71, false, 0.5],
    ]);
    expect(scene.ruins).toEqual(own.ruins);
    expect(scene.sacred?.ruins).toEqual(own.sacred?.ruins);
    expect(scene.kilnRemnants).toEqual(own.kilnRemnants);
    // nic z lidí, polí, zvířat, zásob ani cest
    expect(scene.fields).toEqual([]);
    expect(scene.labor).toBeUndefined();
    expect(scene.livestock).toBeUndefined();
    expect(scene.roads).toBeUndefined();
    expect(scene.dwellings.every((d) => d.inhabited === false || !d.built)).toBe(true);
  });
});

describe('seenVillageOf – tvary scény', () => {
  const part = (key: string, data: SeenPart['data']): SeenPart => ({
    key,
    pos: { x: 0, z: 0 },
    day: DAY,
    data,
  });
  const pos = { x: 5, z: 6, rotation: 0.2 };

  it('obydlí bez dýmu, ohrada bez zvířat, kostel bez kněze, milíř a posvátná stavba', () => {
    const seen: SeenCell = {
      trail: [],
      parts: [
        part('dwelling:1', {
          kind: 'dwelling',
          id: 1,
          type: 'srub',
          position: pos,
          condition: 0.5,
        }),
        part('pen:2', {
          kind: 'pen',
          id: 2,
          species: 'cattle',
          cell: { x: 1, y: 2 },
          x: 3,
          z: 4,
          built: true,
          progress: 1,
        }),
        part('church:3', {
          kind: 'church',
          id: 3,
          type: 'rotunda',
          dims: { kind: 'round', diameter: 8, height: 6 },
          position: pos,
          built: false,
          decorated: false,
          progress: { foundation: 1, walls: 0.5, roof: 0, decor: 0 },
        }),
        part('kiln:4', {
          kind: 'kiln',
          id: 4,
          burnerId: 1,
          x: 7,
          z: 8,
          stage: 'draw',
          progress: 0.513,
          charcoal: 0.4,
        }),
        part('sacred:5', {
          kind: 'sacred',
          id: 5,
          type: 'idol',
          position: pos,
          built: true,
          progress: 1,
        }),
      ],
    };
    const scene = seenVillageOf(seen, landscape)!;
    expect(scene.dwellings).toEqual([
      {
        id: 1,
        type: 'srub',
        position: pos,
        built: true,
        progress: 1,
        inhabited: false,
        condition: 0.5,
      },
    ]);
    expect(scene.pens).toMatchObject([
      { id: 2, oxen: 0, trainees: 0, cows: 0, stocked: false, size: 15 },
    ]);
    expect(scene.churches).toMatchObject([{ id: 3, built: false, priest: false, graves: 0 }]);
    expect(scene.churches![0]!.site).toBeUndefined();
    expect(scene.kilns).toEqual([
      { id: 4, burnerId: 1, x: 7, z: 8, stage: 'draw', progress: 0.52, charcoal: 0.4 },
    ]);
    expect(scene.sacred?.buildings).toEqual([
      { id: 5, kind: 'idol', position: pos, built: true, progress: 1 },
    ]);
    expect(scene.sacred?.oaks).toEqual([]);
  });
});

describe('journeyCellOf', () => {
  const HOME = { x: 3, y: 4 };
  const view = (cell: { x: number; y: number }): JourneyView =>
    ({ cell, home: HOME }) as JourneyView;

  it('vlastní mapa a výjezd, který neběží, jsou null; cizí mapa je své políčko', () => {
    expect(journeyCellOf(null, HOME)).toBeNull();
    expect(journeyCellOf(view(HOME), HOME)).toBeNull();
    expect(journeyCellOf(view({ x: 4, y: 4 }), HOME)).toEqual({ x: 4, y: 4 });
  });
});
