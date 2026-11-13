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
  type Dwelling,
  type JourneyView,
  type SeenCell,
  type SeenPart,
  type TileCell,
  type VillageState,
} from '@bohemia/game';
import {
  foreignJourneySelection,
  journeyCellOf,
  seenSceneKey,
  seenVillageOf,
  watchedJourneyCell,
} from '../journey-scene-view';
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
  const burner: Dwelling = {
    id: 3,
    type: 'zemnice',
    builtDay: DAY - 100,
    condition: 1,
    position: { x: home.x + 20, z: home.z + 30, rotation: 0 },
  };
  state.dwellings = [...state.dwellings, burner];
  {
    burner.workshop = {
      craft: 'charcoal',
      felling: null,
      kilns: [
        {
          id: 60,
          site: { x: home.x + 25, z: home.z - 15 },
          trees: [{ id: 1, cost: 2 }],
          stage: 'draw',
          prepared: 1,
          done: 0,
          charcoalKg: 50,
        },
      ],
    } as unknown as NonNullable<typeof burner.workshop>;
  }
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
      new Set([
        'dwelling',
        'site',
        'threshing',
        'kiln',
        'kilnRemnant',
        'ruin',
        'sacredRuin',
        'fortification',
      ]),
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
    expect(scene.kilns).toEqual(own.kilns);
    expect(scene.kilns).toHaveLength(1);
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

describe('watchedJourneyCell – scéna za vojvodou', () => {
  const HOME = { x: 3, y: 4 };
  const view = (cell: { x: number; y: number }): JourneyView =>
    ({ cell, home: HOME }) as JourneyView;

  it('bez sledování zůstává scéna na vsi, i když je vojvoda na cizí mapě', () => {
    expect(watchedJourneyCell(false, view({ x: 4, y: 4 }))).toBeNull();
  });

  it('sledovaný vojvoda na cizí mapě – scéna ukáže jeho mapu a jde za ním na další', () => {
    expect(watchedJourneyCell(true, view({ x: 4, y: 4 }))).toEqual({ x: 4, y: 4 });
    expect(watchedJourneyCell(true, view({ x: 5, y: 3 }))).toEqual({ x: 5, y: 3 });
  });

  it('skupina na domovské mapě (po čekání či Domů) nebo konec výjezdu – zpět na ves', () => {
    expect(watchedJourneyCell(true, view(HOME))).toBeNull();
    expect(watchedJourneyCell(true, null)).toBeNull();
  });
});

describe('seenSceneKey – kdy přestavět cizí ves', () => {
  const part = (key: string, day: number): SeenPart =>
    ({ key, pos: { x: 0, z: 0 }, day, data: { kind: 'sacred' } }) as unknown as SeenPart;
  const cell = (parts: SeenPart[], villageId = 'v1'): SeenCell => ({ villageId, trail: [], parts });

  it('stejná znalost = stejný klíč, i jako nový objekt z dalšího dotazu', () => {
    const a = cell([part('dwelling:1', 5), part('site:2', 5)]);
    const b = cell([part('dwelling:1', 5), part('site:2', 5)]);
    expect(seenSceneKey(a)).toBe(seenSceneKey(b));
  });

  it('nová stavba, nový pohled na stavbu nebo jiná ves klíč změní; bez znalosti prázdný', () => {
    const base = seenSceneKey(cell([part('dwelling:1', 5)]));
    expect(seenSceneKey(cell([part('dwelling:1', 5), part('pen:3', 6)]))).not.toBe(base);
    expect(seenSceneKey(cell([part('dwelling:1', 6)]))).not.toBe(base);
    expect(seenSceneKey(cell([part('dwelling:1', 5)], 'v2'))).not.toBe(base);
    expect(seenSceneKey(null)).toBe('');
  });
});

describe('foreignJourneySelection – výběr klikem na cizí mapě', () => {
  const LORD = { kind: 'person', id: 7 } as const;
  const MAN = { kind: 'person', id: 9 } as const;

  it('klik na vojvodu ho vybere, klik na jiného muže družiny vybere toho muže', () => {
    expect(foreignJourneySelection(null, LORD, false)).toEqual(LORD);
    expect(foreignJourneySelection(LORD, MAN, false)).toEqual(MAN);
  });

  it('klik do prázdna výběr zruší, s Ctrl / Shift ho nechá – jako ve vsi', () => {
    expect(foreignJourneySelection(LORD, null, false)).toBeNull();
    expect(foreignJourneySelection(LORD, null, true)).toEqual(LORD);
  });

  it('stavby cizí vsi a zvěř se z vlastní vsi nevybírají – jsou klik do prázdna', () => {
    expect(foreignJourneySelection(LORD, { kind: 'dwelling', id: 7 }, false)).toBeNull();
    expect(foreignJourneySelection(LORD, { kind: 'wildlife', species: 'deer' }, false)).toBeNull();
    expect(foreignJourneySelection(LORD, { kind: 'dwelling', id: 3 }, true)).toEqual(LORD);
  });
});
