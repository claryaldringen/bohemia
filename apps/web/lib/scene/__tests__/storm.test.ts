import { describe, expect, it } from 'vitest';
import { dayIndexOf, FLOOD, HAIL, type Landscape } from '@bohemia/game';
import { dayLight } from '../day-light';
import { REFERENCE_DAY, seasonLook } from '../season-look';
import {
  hailCover,
  hailFall,
  hailWeight,
  lightningFlash,
  STORM,
  stormAmount,
  stormFlash,
  stormLight,
} from '../storm';
import { floodLevel, floodMud, floodSurface, mudWeight, overlayGrid } from '../flood-water';
import {
  FLOOD_MUD_DAYS,
  FLOOD_RECEDE_DAYS,
  FLOOD_SCENE_DAYS,
  sceneFlood,
  sceneHail,
} from '../../weather-view';
import { HEIGHT_SCALE } from '../constants';

describe('bouřka s kroupami (storm.ts)', () => {
  it('jen v den krupobití: před ním a po něm nic, uprostřed plná bouřka a kroupy', () => {
    expect(stormAmount(Number.NaN)).toBe(0);
    expect(stormAmount(-0.1)).toBe(0);
    expect(stormAmount(0.4)).toBe(1);
    expect(hailFall(0.3)).toBe(1);
    expect(stormAmount(0.85)).toBe(0);
    expect(hailFall(0.6)).toBe(0);
    // bílý pás přibývá s kroupami a roztaje do půlky dalšího dne
    expect(hailCover(0.05)).toBe(0);
    expect(hailCover(0.5)).toBe(1);
    expect(hailCover(1.2)).toBeGreaterThan(0);
    expect(hailCover(1.6)).toBe(0);
  });

  it('průběh po desetinách – světlo se přepočítá nejvýš desetkrát za náběh', () => {
    for (let t = 0; t < 2; t += 0.013) {
      for (const v of [stormAmount(t), hailFall(t), hailCover(t)]) {
        expect(Math.round(v * 10) / 10).toBeCloseTo(v, 9);
      }
    }
  });

  it('záblesky deterministicky z času, krátké a jen v silné bouřce', () => {
    let lit = 0;
    let flashes = 0;
    let previous = 0;
    for (let ms = 0; ms < 180_000; ms += 10) {
      const flash = lightningFlash(ms);
      expect(lightningFlash(ms)).toBe(flash);
      expect(flash).toBeGreaterThanOrEqual(0);
      expect(flash).toBeLessThanOrEqual(1);
      if (flash > 0) lit++;
      if (flash > 0 && previous === 0) flashes++;
      previous = flash;
      expect(stormFlash(0.5, ms)).toBe(0);
      expect(stormFlash(1, ms)).toBe(flash);
    }
    // ≈ 45 % oken po 1,8 s – zhruba 45 blesků za 3 minuty, svítí jen malou část času
    expect(flashes).toBeGreaterThan(25);
    expect(flashes).toBeLessThan(70);
    expect(lit / 18_000).toBeLessThan(0.15);
  });

  it('bezpečné pro oči (WCAG 2.3.1): za libovolnou 1 s nejvýš 2 vzestupy jasu, 100 000 oken', () => {
    const SLOT_MS = 1800;
    const rises: number[] = [];
    let head = 0;
    let previous = 0;
    let rising = false;
    let worst = 0;
    let lastDark = -Infinity;
    let shortestGap = Infinity;
    for (let ms = 0; ms < 100_000 * SLOT_MS; ms += 10) {
      const flash = lightningFlash(ms);
      if (flash > previous && !rising) {
        rising = true;
        rises.push(ms);
        while (rises[head]! <= ms - 1000) head++;
        worst = Math.max(worst, rises.length - head);
        if (previous === 0) shortestGap = Math.min(shortestGap, ms - lastDark);
      } else if (flash < previous) rising = false;
      if (flash > 0) lastDark = ms + 10;
      previous = flash;
    }
    expect(worst).toBeLessThanOrEqual(2);
    expect(shortestGap).toBeGreaterThanOrEqual(400);
  });

  it('bouřka scénu ztmaví, záblesk rozsvítí oblaka a okolní světlo, slunce ne', () => {
    const day = dayLight(seasonLook(REFERENCE_DAY), REFERENCE_DAY, 12);
    expect(stormLight(day, 0, 1)).toBe(day);
    const dark = stormLight(day, 1, 0);
    expect(dark.light.sunIntensity).toBeCloseTo(day.light.sunIntensity * STORM.sun, 6);
    expect(dark.light.skyIntensity).toBeCloseTo(day.light.skyIntensity * STORM.sky, 6);
    expect(dark.ambient[0]).toBeCloseTo(day.ambient[0] * STORM.ambient, 6);
    expect(dark.tone[1]).toBeCloseTo(day.tone[1] * STORM.tone, 6);
    expect(STORM.sun).toBeLessThan(0.5);
    expect(dark.shadowStrength).toBeLessThan(day.shadowStrength * 0.1);
    expect(dark.light.clearColor[2]).toBeLessThan(day.light.clearColor[2] * 0.5);
    const flash = stormLight(day, 1, 1);
    expect(flash.light.sunIntensity).toBe(dark.light.sunIntensity);
    expect(flash.light.skyIntensity).toBeGreaterThan(day.light.skyIntensity);
    expect(flash.ambient[0]).toBeGreaterThan(dark.ambient[0]);
  });

  it('bílý pás podle pruhu jádra – vnitřek 1, okraj 0,5, mimo 0', () => {
    const strip = { x: 100, z: -50, angle: 0.5, offsetM: 30 };
    // kolmice ke směru (−sin, cos)
    const across = (d: number): [number, number] => [
      strip.x - Math.sin(strip.angle) * d,
      strip.z + Math.cos(strip.angle) * d,
    ];
    expect(hailWeight(strip, ...across(30))).toBe(1);
    expect(hailWeight(strip, ...across(30 + HAIL.widthM / 2 - 10))).toBe(0.5);
    expect(hailWeight(strip, ...across(30 + HAIL.widthM / 2 + 10))).toBe(0);
  });
});

/** Údolí 8 × 8 políček: potok v prostředním sloupci, svahy stoupají po 1 m na políčko. */
function valley(): { landscape: Landscape; above: Float32Array } {
  const size = 8;
  const heights = new Float32Array(size * size);
  const above = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.abs(x - 4);
      heights[y * size + x] = 10 + d;
      above[y * size + x] = d;
    }
  }
  return { landscape: { size, cellSizeM: 15, heights } as unknown as Landscape, above };
}

describe('povodeň ve scéně (flood-water.ts)', () => {
  it('voda stojí tři dny, pak ustoupí; bahno zůstane dva týdny', () => {
    expect(floodLevel(-0.5)).toBe(0);
    expect(floodLevel(0)).toBe(1);
    expect(floodLevel(FLOOD.standDays - 0.01)).toBe(1);
    expect(floodLevel(FLOOD.standDays + FLOOD_RECEDE_DAYS / 2)).toBe(0.5);
    expect(floodLevel(FLOOD.standDays + FLOOD_RECEDE_DAYS)).toBe(0);
    const dry = FLOOD.standDays + FLOOD_RECEDE_DAYS;
    expect(floodMud(dry - 0.1)).toBe(1);
    expect(floodMud(dry + FLOOD_MUD_DAYS / 2)).toBe(0.5);
    expect(floodMud(dry + FLOOD_MUD_DAYS)).toBe(0);
    expect(mudWeight(0)).toBe(0);
    expect(mudWeight(3)).toBe(1);
  });

  it('plocha vody nad políčky pod výškou vody – stejně jako jádro (výška nad potokem)', () => {
    const { landscape, above } = valley();
    expect(floodSurface(landscape, above, 0)).toBeNull();
    const surface = floodSurface(landscape, above, 2)!;
    // zatopené sloupce 3, 4, 5 (výška nad potokem 1, 0, 1 < 2)
    expect(surface.flooded).toBe(3 * 8);
    // krytí podle hloubky – u břehu průzračnější
    expect(Math.max(...surface.alphas)).toBeGreaterThan(Math.min(...surface.alphas));
    // hladina = dno potoka + výška vody, s převýšením scény
    for (let i = 1; i < surface.positions.length; i += 3) {
      expect(surface.positions[i]).toBeCloseTo((10 + 2) * HEIGHT_SCALE, 6);
    }
    // plocha sahá na sousední políčko (sloupce 2–6), dál ne
    const xs = [...surface.positions].filter((_, i) => i % 3 === 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    expect(maxX - minX).toBeCloseTo(4 * 15, 6);
  });

  it('obtisk na zemi jen kolem míst s vahou, výška terénu + zvednutí', () => {
    const box = { minX: 0, minZ: 0, maxX: 30, maxZ: 30 };
    expect(
      overlayGrid(
        box,
        7.5,
        () => 0,
        () => 0,
        0.1,
      ),
    ).toBeNull();
    const grid = overlayGrid(
      box,
      7.5,
      (x, z) => (x < 8 && z < 8 ? 1 : 0),
      () => 5,
      0.1,
    )!;
    expect(grid.positions[1]).toBeCloseTo(5.1, 6);
    // váha 1 jen v rozích u počátku, okolní vrcholy prolnou k nule
    expect(grid.indices.length).toBe(4 * 6);
    expect(Math.max(...[...grid.colors].filter((_, i) => i % 4 === 3))).toBe(1);
  });
});

describe('krupobití a povodeň pro scénu (weather-view.ts)', () => {
  const hailDay = dayIndexOf({ year: 510, month: 7, day: 10 });
  const strip = { x: 1, z: 2, angle: 0.3, offsetM: -40 };
  const state = {
    disasters: {
      hail: { day: hailDay, strip, apples: 0.6 },
      flood: { day: hailDay, level: 'hundred' as const, heightM: 2 },
      override: { hail: { [hailDay + 5]: { angle: 1, offsetM: 0 } } },
    },
  };

  it('krupobití jen v jeho den a po něm do konce roku, bez vynucených a budoucích', () => {
    expect(sceneHail(state, hailDay - 1)).toBeNull();
    expect(sceneHail(state, hailDay)).toEqual({ day: hailDay, strip });
    expect(sceneHail(state, dayIndexOf({ year: 510, month: 12, day: 31 }))).not.toBeNull();
    expect(sceneHail(state, dayIndexOf({ year: 511, month: 1, day: 1 }))).toBeNull();
    expect(JSON.stringify(sceneHail(state, hailDay + 6))).not.toContain('apples');
  });

  it('povodeň od jejího dne do konce bahna, letní podle data', () => {
    expect(sceneFlood(state, hailDay - 1)).toBeNull();
    expect(sceneFlood(state, hailDay)).toEqual({ day: hailDay, heightM: 2, season: 'summer' });
    expect(sceneFlood(state, hailDay + FLOOD_SCENE_DAYS - 1)).not.toBeNull();
    expect(sceneFlood(state, hailDay + FLOOD_SCENE_DAYS)).toBeNull();
    const spring = {
      disasters: { flood: { day: hailDay - 120, level: 'five' as const, heightM: 0.7 } },
    };
    expect(sceneFlood(spring, hailDay - 119)?.season).toBe('spring');
  });
});
