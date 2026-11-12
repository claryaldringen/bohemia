import { describe, expect, it } from 'vitest';
import {
  CHURCH_NO_LODGE,
  CHURCH_NO_QUARRY,
  churchCapacity,
  churchyardGraves,
  defaultChurchDims,
  type ChurchSite,
  type VillageState,
} from '@bohemia/game';
import { churchBuildChoices, churchesOf, sceneChurches } from '../church-view';
import { selectionDetails } from '../selection-details';
import type { SceneVillage, VillageView } from '../village-view';

const position = { x: 10, z: 20, rotation: Math.PI / 6 };
const site: ChurchSite = {
  type: 'rotunda',
  dims: defaultChurchDims('rotunda'),
  done: { quarry: 1e6, sand: 1e6, foundation: 1e6 },
  limeT: 0,
  kilnDone: 0,
  kiln: { x: 0, z: 0 },
  sandPit: { x: 0, z: 0 },
  quarryId: 7,
  quarryDistanceM: 300,
  stoneFromPileM3: 0,
  prepManDays: 0,
};
const construction = {
  id: 40,
  kind: 'church',
  startedDay: 0,
  cost: 100,
  done: 0,
  dwellingType: null,
  position,
  dwellingId: null,
  fieldId: null,
  church: site,
};
const people = [
  { id: 1, bornDay: 0, dwellingId: 1, sex: 'male', mason: 'builder' },
  { id: 2, bornDay: 0, dwellingId: 1, sex: 'male', mason: 'stonemason' },
];
const village = (extra: Partial<Record<string, unknown>>): VillageState =>
  ({
    people,
    constructions: [],
    lodge: { circle: 'carolingian', invitedDay: 0 },
    ...extra,
  }) as unknown as VillageState;

describe('kostely v pohledu vsi', () => {
  it('ves bez kostela – nic', () => {
    expect(sceneChurches(village({}))).toEqual([]);
    expect(churchesOf(village({}))).toEqual({});
  });

  it('staveniště jde do scény s postupem a do panelu po druzích práce s chybějícím mistrem', () => {
    const state = village({ constructions: [construction] });
    const [scene] = sceneChurches(state);
    expect(scene).toMatchObject({ id: 40, type: 'rotunda', position, decorated: false });
    expect(scene!.progress.foundation).toBe(1);
    expect(scene!.progress.walls).toBe(0);
    // staveniště nese pec, písník a hromady; pálení zatím neběží
    expect(scene!.site).toMatchObject({ kiln: { x: 0, z: 0 }, burning: false, kilnBuilt: false });
    expect(scene!.site?.stone).toBe(1);
    expect(scene).toMatchObject({ built: false, priest: false, graves: 0 });
    const panel = churchesOf(state).churches![0]!;
    expect(panel.built).toBe(false);
    expect(panel.site?.work.quarry).toBe(1);
    expect(panel.site?.work.walls).toBe(0);
    // vápeník chybí – vápno se nepálí
    expect(panel.site?.blocked).toBe('limeBurner');
    expect(panel.capacity).toBe(churchCapacity('rotunda', site.dims));
    expect(panel.coverage).toBe(0);
    expect(panel.graves).toEqual({ used: 0, total: churchyardGraves('rotunda', site.dims) });
  });

  it('dostavěný kostel s výzdobou ve stavbě se kreslí jednou (podle staveniště)', () => {
    const church = {
      id: 40,
      type: 'rotunda',
      dims: site.dims,
      position,
      finishedDay: 5,
      priestId: 9,
    };
    const state = village({ constructions: [construction], churches: [church] });
    expect(sceneChurches(state)).toHaveLength(1);
    const panel = churchesOf(state).churches![0]!;
    expect(panel).toMatchObject({ built: true, priest: true });
    const done = village({ churches: [{ ...church, decoratedDay: 9 }] });
    expect(sceneChurches(done)[0]).toMatchObject({ decorated: true, progress: { decor: 1 } });
  });

  it('nabídka: typy okruhu huti; bez huti a bez lomu důvod jako na serveru', () => {
    const none = churchBuildChoices(village({ lodge: undefined, people: [] }));
    expect(none.map((c) => c.blocked)).toEqual([CHURCH_NO_LODGE, CHURCH_NO_LODGE]);
    const noQuarry = churchBuildChoices(village({}));
    expect(noQuarry.map((c) => c.type)).toEqual(['apse', 'rotunda']);
    expect(noQuarry[0]!.blocked).toBe(CHURCH_NO_QUARRY);
    const ready = churchBuildChoices(
      village({ quarries: [{ outcropId: 7, x: 0, z: 0, rotation: 0, builtDay: 0 }] }),
    );
    expect(ready.map((c) => c.blocked)).toEqual([null, null]);
  });
});

describe('výběr kostela', () => {
  it('panel staveniště jde zrušit; dostavěný kostel ne', () => {
    const state = village({ constructions: [construction] });
    const scene = {
      dwellings: [],
      fields: [],
      churches: sceneChurches(state),
    } as unknown as SceneVillage;
    const view = {
      ...churchesOf(state),
      constructions: [{ id: 40, kind: 'church', cancellable: true }],
    } as unknown as VillageView;
    expect(selectionDetails(view, scene, { kind: 'church', id: 40 })).toMatchObject({
      kind: 'church',
      id: 40,
      cancelConstructionId: 40,
    });
    expect(selectionDetails(view, scene, { kind: 'church', id: 41 })).toBeNull();
  });
});
