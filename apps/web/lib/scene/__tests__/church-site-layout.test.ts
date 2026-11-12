import { describe, expect, it } from 'vitest';
import { churchyardGraves, defaultChurchDims, type Position } from '@bohemia/game';
import type { SceneChurch, SceneChurchSite } from '../../church-view';
import {
  KILN_M,
  churchDoorWorld,
  churchGraveGeometry,
  churchGravePlaces,
  churchSiteGlow,
  churchSiteHeaps,
  churchSiteKey,
  churchSitePits,
  limePitCenter,
} from '../church-site-layout';

const flat = (): number => 0;
const position: Position = { x: 100, z: 50, rotation: Math.PI / 6 };
const dims = defaultChurchDims('rotunda');
const yard: SceneChurchSite = {
  kiln: { x: 90, z: 40 },
  sandPit: { x: 120, z: 70 },
  limeT: 0,
  burning: false,
  kilnBuilt: true,
  stone: 0,
  sand: 0,
  quarryId: 7,
};
const church = (over: Partial<SceneChurch> = {}): SceneChurch => ({
  id: 1,
  type: 'rotunda',
  dims,
  position,
  progress: { foundation: 1, walls: 0.5, roof: 0, decor: 0 },
  decorated: false,
  built: false,
  priest: false,
  graves: 0,
  site: yard,
  ...over,
});

describe('staveniště kostela', () => {
  it('jámy pece, vápna a písníku jsou v jedné síti; dostavěný kostel nic nemá', () => {
    const pits = churchSitePits([church()], flat);
    expect(pits.indices.length).toBeGreaterThan(0);
    expect(pits.positions.length / 3).toBe(pits.colors.length / 3);
    // pec leží v síti: nejvyšší bod věnce je KILN_M.ringH nad terénem
    expect(Math.max(...pits.positions.filter((_, i) => i % 3 === 1))).toBeGreaterThan(
      KILN_M.ringH * 0.9,
    );
    expect(churchSitePits([church({ built: true, site: undefined })], flat).indices).toHaveLength(
      0,
    );
  });

  it('bílá hladina jen při limeT > 0, oheň jen při pálení', () => {
    expect(churchSiteGlow([church()], flat).lime.indices).toHaveLength(0);
    expect(churchSiteGlow([church()], flat).fire.indices).toHaveLength(0);
    const lit = churchSiteGlow([church({ site: { ...yard, limeT: 1.2, burning: true } })], flat);
    expect(lit.lime.indices.length).toBeGreaterThan(0);
    expect(lit.fire.indices.length).toBeGreaterThan(0);
    const c = limePitCenter(yard);
    expect(Math.hypot(c.x - yard.kiln.x, c.z - yard.kiln.z)).toBeGreaterThan(KILN_M.ringR);
  });

  it('hromady kamene a písku přibývají s prací', () => {
    expect(churchSiteHeaps([church()], flat).indices).toHaveLength(0);
    const some = churchSiteHeaps([church({ site: { ...yard, stone: 0.2 } })], flat);
    const both = churchSiteHeaps([church({ site: { ...yard, stone: 0.2, sand: 1 } })], flat);
    expect(some.indices.length).toBeGreaterThan(0);
    expect(both.indices.length).toBeGreaterThan(some.indices.length);
  });

  it('klíč se mění s pálením, ne s nezměněným stavem', () => {
    expect(churchSiteKey([church()])).toBe(churchSiteKey([church()]));
    expect(churchSiteKey([church()])).not.toBe(
      churchSiteKey([church({ site: { ...yard, burning: true } })]),
    );
  });
});

describe('hřbitůvek', () => {
  it('hroby leží v obdélníku mimo zdi, jejich počet nepřekročí kapacitu hřbitůvku', () => {
    const total = churchyardGraves('rotunda', dims);
    const places = churchGravePlaces('rotunda', dims, position, 10_000);
    expect(places.length).toBeGreaterThan(0);
    expect(places.length).toBeLessThanOrEqual(total);
    const door = churchDoorWorld('rotunda', dims, position);
    for (const p of places)
      expect(Math.hypot(p.x - position.x, p.z - position.z)).toBeGreaterThan(1.5);
    expect(Number.isFinite(door.x + door.z)).toBe(true);
  });

  it('hrob č. i je vždy na stejném místě, jen nejnovější jsou čerstvé', () => {
    const a = churchGravePlaces('rotunda', dims, position, 5);
    const b = churchGravePlaces('rotunda', dims, position, 8);
    expect(b.slice(0, 5).map((g) => [g.x, g.z])).toEqual(a.map((g) => [g.x, g.z]));
    expect(a.filter((g) => g.fresh)).toHaveLength(3);
    expect(churchGravePlaces('rotunda', dims, position, 0)).toEqual([]);
    expect(churchGraveGeometry(a, flat).indices.length).toBeGreaterThan(0);
  });

  it('vchod je na západní straně (směr ven proti ose kostela)', () => {
    const d = churchDoorWorld('rotunda', dims, { x: 0, z: 0, rotation: 0 });
    expect(d.outX).toBeCloseTo(-1, 6);
    expect(d.x).toBeLessThan(0);
  });
});
