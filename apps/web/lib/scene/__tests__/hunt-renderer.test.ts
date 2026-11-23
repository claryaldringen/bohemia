import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { beatersPlan, endBeaters } from '@bohemia/game';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneHunt } from '../../journey-view';
import { HuntRenderer } from '../hunt-renderer';

// Lov ve scéně (plán 2026-11-22-hunting – Úloha 10): renderer bez modelů (v testu se nenačtou)
// – co kreslí: honci, psi, zvíře na boku a na tyči mezi honci 0 a 1, po návratu nic.

const AT = { x: 0, z: 150 };

function carried(): SceneHunt {
  const beaters = beatersPlan({ x: 0, z: 0 }, { x: 0, z: 200 }, 0);
  const end = beaters.arriveTick + 20;
  endBeaters(beaters, end, AT, true);
  return {
    journeyId: 'j1',
    quarry: { kind: 'boar', pos: AT, heading: { x: 1, z: 0 }, state: 'dead', hits: 3 },
    beaters,
    dogs: 3,
    strikers: [],
    outcome: 'killed',
    tick: end + 150,
  };
}

describe('HuntRenderer', () => {
  let engine: NullEngine;
  let scene: Scene;
  let renderer: HuntRenderer;
  let loaded = 0;

  beforeEach(() => {
    // modely se v testu nenačtou (relativní adresa) – renderer to jen zapíše do konzole
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    engine = new NullEngine();
    scene = new Scene(engine);
    loaded = 0;
    renderer = new HuntRenderer(scene, { groundHeight: () => 0, onLoaded: () => loaded++ });
  });

  afterEach(() => {
    renderer.dispose();
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
  });

  it('zabité zvíře visí na tyči mezi nosiči, psi jdou s honci', () => {
    const hunt = carried();
    expect(renderer.set(hunt, 1_000, true)).toBe(true);
    const stats = renderer.stats();
    expect(stats.beaters.filter((b) => b.carrying)).toHaveLength(2);
    expect(stats.quarry).toMatchObject({ model: 'wild-boar', lying: true, hanging: true });
    expect(stats.pole).not.toBeNull();
    expect(stats.quarry?.pos).toEqual(stats.pole);
    expect(stats.dogs).toBeGreaterThan(0);
    expect(scene.getMeshByName('hunt-pole')?.isEnabled()).toBe(true);
    // padlé zvíře cílem povelu není
    expect(renderer.quarryHit(0, 0, () => ({ x: 0, y: 0 }))).toBeNull();
  });

  it('zabité zvíře leží, dokud ho honci nezvednou', () => {
    const hunt = { ...carried() };
    hunt.tick = hunt.beaters.end!.tick + 1;
    renderer.set(hunt, 1_000, true);
    expect(renderer.stats().quarry).toMatchObject({ lying: true, hanging: false, pos: AT });
    expect(renderer.stats().pole).toBeNull();
  });

  it('po návratu honců a bez lovu nic', () => {
    const hunt = carried();
    renderer.set(hunt, 1_000, true);
    expect(renderer.stats().beaters.length).toBeGreaterThan(0);
    // starší pohled (přišel pozdě) nic nezmění
    expect(renderer.set({ ...hunt, tick: hunt.tick - 50 }, 1_500, true)).toBe(false);
    expect(renderer.set(null, 2_000, true)).toBe(true);
    expect(renderer.stats()).toEqual({ quarry: null, beaters: [], dogs: 0, pole: null });
    expect(renderer.set(null, 2_500, true)).toBe(false);
    expect(scene.getMeshByName('hunt-pole')?.isEnabled()).toBe(false);
    // honci doma (homeTick) – nic, i když pohled na lov ještě přijde
    renderer.set({ ...hunt, tick: hunt.beaters.homeTick! }, 3_000, true);
    expect(renderer.stats()).toEqual({ quarry: null, beaters: [], dogs: 0, pole: null });
  });

  it('živé zvíře venku je cílem povelu pod kurzorem', () => {
    const hunt: SceneHunt = {
      ...carried(),
      quarry: { kind: 'stag', pos: AT, heading: { x: 0, z: -1 }, state: 'flee', hits: 0 },
      outcome: 'ongoing',
      tick: 100,
    };
    hunt.beaters.end = null;
    hunt.beaters.homeTick = null;
    renderer.set(hunt, 1_000, true);
    expect(renderer.stats().quarry).toMatchObject({ model: 'wild-stag', lying: false });
    // průmět: x = světové x, y = −výška (kurzor u nohou zvířete)
    const project = (x: number, y: number): { x: number; y: number } => ({ x, y: -y });
    expect(renderer.quarryHit(0, -0.5, project)).not.toBeNull();
    expect(renderer.quarryHit(40, 0, project)).toBeNull();
    expect(loaded).toBe(0);
  });
});
