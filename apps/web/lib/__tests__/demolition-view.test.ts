import { describe, expect, it } from 'vitest';
import {
  beginDisuse,
  dayIndexOf,
  foundVillage,
  startDemolition,
  type Landscape,
  type PartInput,
  type VillageState,
} from '@bohemia/game';
import { buildVillageView } from '../village-view';
import { demolitionSiteProgress, roundDemolition } from '../demolition-view';
import { constructionState } from '../scene/village-construction';
import { penStage } from '../scene/pen-layout';
import { scenePenViews } from '../scene/village-pens';
import { structureDecayStage } from '../scene/structure-decay';

// Bourání a opuštění staveb ve scéně (demolition.md – Rozhraní): bouraná stavba je staveniště
// pozpátku, opuštěná chátrá podle dnešních stupňů.

const DAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const SIZE = 16;
const landscape: Landscape = {
  size: SIZE,
  cellSizeM: 15,
  heights: new Float32Array(SIZE * SIZE),
  surface: new Uint8Array(SIZE * SIZE).fill(2),
  fertility: new Uint8Array(SIZE * SIZE).fill(50),
  villageSite: { x: 8, y: 8 },
  stream: [],
  obstacleLayer: null,
};
const parts: PartInput[] = [0, 1, 2, 3, 4].map((i) => ({
  areaM2: 225,
  distanceM: 50,
  naturalFertility: 50,
  surface: 'meadow',
  obstacleCost: 0,
  cell: { x: 8 + i, y: 8 },
}));

function fixture(): VillageState {
  const s = foundVillage({
    seed: 5,
    day: DAY - 400,
    dwellingPosition: { x: -50, z: -50, rotation: 0.5 },
    firstField: { parts },
  });
  s.constructions = [];
  s.dwellings.push({
    id: 50,
    type: 'zemnice',
    builtDay: DAY - 3000,
    condition: 0.6,
    position: { x: 30, z: 30, rotation: 0 },
  });
  s.sacredBuildings = [
    { id: 70, kind: 'idol', position: { x: 40, z: 40, rotation: 0 }, builtDay: DAY - 700 },
  ];
  s.pens = [
    {
      id: 60,
      cell: { x: 4, y: 4 },
      x: -82.5,
      z: -82.5,
      builtDay: DAY - 700,
      team: null,
      training: null,
    },
  ];
  s.lastDay = DAY;
  return s;
}

function sceneOf(s: VillageState): ReturnType<typeof buildVillageView>['scene'] {
  const record = { id: 'v', settlementId: 's', name: 'Libice', state: s, version: 1 };
  return buildVillageView(record, landscape, DAY).scene;
}

/** Rozdělá bourání a nastaví, kolik práce je hotové (podíl 0–1). */
function demolishing(
  s: VillageState,
  ref: { structure: 'dwelling' | 'pen' | 'idol'; id: number },
  share: number,
): number {
  startDemolition(s, DAY, ref);
  const c = s.constructions.find((x) => x.kind === 'demolition')!;
  c.done = c.cost * share;
  return c.id;
}

describe('bourání ve scéně', () => {
  it('průběh bourání 0,25 je fáze staveniště 0,75', () => {
    expect(demolitionSiteProgress(0.25)).toBe(0.75);
    expect(roundDemolition(0.2549)).toBe(0.25);
    expect(demolitionSiteProgress(2)).toBe(0);
  });

  it('obydlí: staveniště pozpátku pod id stavby bourání, stejné díly jako stavba na 0,75', () => {
    const s = fixture();
    const site = demolishing(s, { structure: 'dwelling', id: 50 }, 0.25);
    const dwellings = sceneOf(s).dwellings;
    expect(dwellings.some((d) => d.id === 50)).toBe(false);
    const d = dwellings.find((x) => x.id === site)!;
    expect(d.built).toBe(false);
    expect(d.demolition).toBe(0.25);
    expect(d.progress).toBe(0.75);
    expect(constructionState('zemnice', d.progress).parts).toEqual(
      constructionState('zemnice', 0.75).parts,
    );
  });

  it('ohrada: průběh stavby pozpátku, plot ubývá po fázích', () => {
    const s = fixture();
    const site = demolishing(s, { structure: 'pen', id: 60 }, 0.25);
    const scene = sceneOf(s);
    const pen = scene.pens!.find((p) => p.id === 60)!;
    expect(pen.demolition).toBe(0.25);
    expect(pen.demolitionSite).toBe(site);
    const view = scenePenViews(scene).find((v) => v.id === 60)!;
    expect(view.progress).toBeCloseTo(0.75, 9);
    expect(penStage(view.progress).parts).toEqual(penStage(0.75).parts);
    expect(penStage(view.progress).built).toBe(false);
  });

  it('modla: staveniště pozpátku pod id stavby bourání', () => {
    const s = fixture();
    const site = demolishing(s, { structure: 'idol', id: 70 }, 0.5);
    const b = sceneOf(s).sacred!.buildings.find((x) => x.id === site)!;
    expect(b.built).toBe(false);
    expect(b.progress).toBe(0.5);
    expect(sceneOf(s).sacred!.buildings.some((x) => x.id === 70)).toBe(false);
  });

  it('bez bourání se nic nemění – stavby stojí celé', () => {
    const scene = sceneOf(fixture());
    expect(scene.dwellings.find((d) => d.id === 50)?.built).toBe(true);
    expect(scene.pens!.every((p) => p.demolition === undefined)).toBe(true);
  });
});

describe('opuštěné stavby ve scéně', () => {
  it('opuštěná modla se starým stavem chátrá podle stupňů rozpadu', () => {
    const s = fixture();
    const b = s.sacredBuildings![0]!;
    b.wear = { condition: 0.4, abandonedDay: DAY - 10 };
    const built = sceneOf(s).sacred!.buildings.find((x) => x.id === 70)!;
    expect(built.abandoned).toBe(true);
    expect(built.condition).toBeLessThan(0.45);
    expect(structureDecayStage(built.condition)).toBe(structureDecayStage(0.4));
  });

  it('opuštění dá ohradě stav z opotřebení a modla ztratí štěstí', () => {
    const s = fixture();
    beginDisuse(s, DAY, { structure: 'pen', id: 60 });
    const pen = sceneOf(s).pens!.find((p) => p.id === 60)!;
    expect(pen.demolition).toBeUndefined();
    expect(pen.condition === undefined || pen.condition <= 1).toBe(true);
  });
});
