import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  foundVillage,
  type Landscape,
  type PartInput,
  type PlacementCheck,
  type PlacementVillage,
  type VillageRecord,
  type VillageState,
} from '@bohemia/game';
import { buildItem } from '../build-items';
import {
  DESECRATION_WARNINGS,
  checkWithDesecration,
  desecrationWarning,
  squaresWithDesecration,
} from '../desecration-warning';
import { buildVillageView } from '../village-view';
import type { SceneVillage } from '../village-view-scene-types';

// Varování u kurzoru při stavbě pokřtěného rodu (christianity.md – Co křest rodu umožní): táž
// kontrola umístění z jádra s vsí, jak by ji viděl pohanský rod – co by brání nebo ušetřila,
// pokřtěný zničí; hřbitov, se kterým by stavba neprošla, zaorá (jako server).

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
// plný hřbitov na čtverci (2, 2) – pokřtěný rod ho smí zaorat
const FULL = {
  id: 900,
  squares: [{ cell: { x: 2, y: 2 }, x: -82.5, z: -82.5, waterDistanceM: 500 }],
  squareSizeM: 15,
  graves: 56,
  builtDay: DAY - 300,
};
const village = (baptized: boolean): VillageState => ({
  ...foundVillage({
    seed: 5,
    day: DAY,
    dwellingPosition: { x: -50, z: -50, rotation: 0.5 },
    firstField: { parts },
  }),
  cemeteries: [FULL],
  ...(baptized ? { faith: { rodBaptizedDay: DAY - 10 } } : {}),
});
const sceneOf = (state: VillageState): SceneVillage => {
  const record: VillageRecord = {
    id: 'v-1',
    settlementId: 's-1',
    name: 'Libice',
    state,
    version: 1,
  };
  return buildVillageView(record, landscape, DAY).scene;
};
const ok: PlacementCheck = { ok: true, reason: null };

describe('desecrationWarning', () => {
  it('pohanská ves varování nemá – kontrola se nepouští znovu', () => {
    let calls = 0;
    const scene = sceneOf(village(false));
    expect(desecrationWarning(scene, () => (calls++, ok))).toBeUndefined();
    expect(calls).toBe(0);
  });

  it('co pohanská kontrola chrání (brání nebo ušetří), pokřtěný vykácí', () => {
    const scene = sceneOf(village(true));
    // posvátné místo – jen pohanská ves (bez sacredFree); hřbitov tu nebrání
    const pagan = (check: PlacementCheck) => (v: PlacementVillage) => (v.sacredFree ? ok : check);
    expect(
      desecrationWarning(
        scene,
        pagan({ ok: false, reason: 'Roste tu posvátný dubový háj – ten vesničané nevykácejí.' }),
      ),
    ).toBe(DESECRATION_WARNINGS.grove);
    expect(
      desecrationWarning(
        scene,
        pagan({ ok: false, reason: 'Stojí tu posvátný dub – ten vesničané nepokácí.' }),
      ),
    ).toBe(DESECRATION_WARNINGS.oak);
    expect(
      desecrationWarning(
        scene,
        pagan({ ok: true, reason: null, warning: 'Dubový háj zůstane stát\nPole se zmenší' }),
      ),
    ).toBe(DESECRATION_WARNINGS.grove);
    expect(
      desecrationWarning(
        scene,
        pagan({ ok: true, reason: null, warning: 'Posvátné duby zůstanou stát (2)' }),
      ),
    ).toBe(DESECRATION_WARNINGS.oak);
    expect(desecrationWarning(scene, () => ok)).toBeUndefined();
  });

  it('pole přes hřbitov, který smí zmizet: projde s varováním „Zaorá starý hřbitov.“', () => {
    const item = buildItem('field');
    if (item.placement !== 'squares') throw new Error('pole se maluje po čtvercích');
    const cells = [2, 3, 4, 5, 6].map((x) => ({ x, y: 2 }));
    const run = (v: PlacementVillage): ReturnType<typeof item.check> =>
      item.check(landscape, v, cells, undefined, undefined, { woodSupply: 0 });
    const pagan = sceneOf(village(false));
    const paganCheck = squaresWithDesecration(pagan, run).check;
    expect(paganCheck.ok).toBe(false);
    expect(paganCheck.reason).toBe('Pole se překrývá s hřbitovem.');
    const baptized = sceneOf(village(true));
    const check = squaresWithDesecration(baptized, run).check;
    expect(check.ok).toBe(true);
    expect(check.warning?.split('\n')).toContain(DESECRATION_WARNINGS.cemetery);
    // mimo hřbitov nic
    const away = [8, 9, 10, 11, 12].map((x) => ({ x, y: 5 }));
    const clear = checkWithDesecration(baptized, (v) => {
      const result = item.check(landscape, v, away, undefined, undefined, { woodSupply: 0 });
      return result.check;
    });
    expect(clear.warning ?? '').not.toContain(DESECRATION_WARNINGS.cemetery);
  });
});
