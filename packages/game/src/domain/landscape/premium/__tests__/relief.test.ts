// Typy reliéfu (premium-landscapes.md – Typy krajin): horský průsmyk se stezkou, posvátná hora
// a přirozená pevnost. Převýšení, plochy a vzdálenosti z rozhodnutí úlohy (návrh Clauda) na
// přijatých krajinách proti průměrné krajině téhož seedu.
import { describe, expect, it } from 'vitest';
import { streamCenterline } from '../../stream-geometry';
import { promontoriesOf, SURFACE_CODES, type Landscape } from '../../types';
import { heightAtWorld } from '../../world';
import {
  edgeSide,
  forestShare,
  half,
  landConnected,
  lineDistance,
  nearMeadow,
  onlySite,
  pairs,
  polygonArea,
  surfaceAtWorld,
  village,
} from './site-checks';

const SAMPLE = 10;
const TIMEOUT_MS = 120_000;

/** Body úsečky po krocích `step` m (včetně konců). */
function along(
  [ax, az]: readonly [number, number],
  [bx, bz]: readonly [number, number],
  step: number,
): [number, number][] {
  const length = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(length / step));
  return Array.from({ length: n + 1 }, (_, k): [number, number] => [
    ax + ((bx - ax) * k) / n,
    az + ((bz - az) * k) / n,
  ]);
}

/** Nejmenší vzdálenost bodu od okraje mapy (m). */
function edgeDistance(l: Landscape, [x, z]: readonly [number, number]): number {
  const h = half(l);
  return Math.min(x + h, h - x, z + h, h - z);
}

/** Výškový rozdíl krajiny (m). */
function reliefOf(l: Landscape): number {
  let min = Infinity;
  let max = -Infinity;
  for (const h of l.heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return max - min;
}

/** Průměrná výška na kružnici (m) kolem bodu. */
function ringMean(l: Landscape, x: number, z: number, radius: number): number {
  let sum = 0;
  const n = 64;
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    sum += heightAtWorld(l, x + Math.cos(a) * radius, z + Math.sin(a) * radius);
  }
  return sum / n;
}

describe('mountain-pass – horský průsmyk se stezkou', () => {
  it(
    'dva hřbety po stranách sedla, oba aspoň 60 m nad sedlem; pohoří podél okraje mapy',
    () => {
      for (const { premium } of pairs('mountain-pass', SAMPLE)) {
        const pass = onlySite(premium, 'pass');
        const [a, s, b] = pass.line! as [[number, number], [number, number], [number, number]];
        expect(s).toEqual([pass.x, pass.z]);
        const saddle = heightAtWorld(premium, pass.x, pass.z);
        for (const end of [a, b]) {
          const crest = along(s, end, 15).map(([x, z]) => heightAtWorld(premium, x, z));
          const peak = Math.max(...crest);
          expect(peak - saddle).toBeGreaterThanOrEqual(60);
          // Sedlo je nejnižší místo hřebene mezi vrcholy hřbetů (od sedla hřeben stoupá).
          const toPeak = crest.slice(0, crest.indexOf(peak) + 1);
          expect(Math.min(...toPeak)).toBeGreaterThanOrEqual(saddle - 0.5);
          // Hřbet aspoň 300 m dlouhý.
          expect(Math.hypot(end[0] - s[0], end[1] - s[1])).toBeGreaterThanOrEqual(300);
        }
        // Hřeben vede podél okraje mapy (pohraniční hory), nejvýš 150 m od něj.
        for (const p of [a, s, b]) expect(edgeDistance(premium, p)).toBeLessThanOrEqual(150);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'stezka vede od okraje k okraji přes sedlo, k místu vsi nejblíž 150 m, po souši',
    () => {
      for (const { premium } of pairs('mountain-pass', SAMPLE)) {
        const pass = onlySite(premium, 'pass');
        const line = onlySite(premium, 'route').line!;
        const first = line[0]!;
        const last = line.at(-1)!;
        expect(edgeSide(premium, first)).not.toBeNull();
        expect(edgeSide(premium, last)).not.toBeNull();
        expect(Math.hypot(last[0] - first[0], last[1] - first[1])).toBeGreaterThan(500);
        expect(lineDistance(line, pass.x, pass.z)).toBeLessThanOrEqual(15);
        const c = village(premium);
        expect(lineDistance(line, c.x, c.z)).toBeGreaterThanOrEqual(150);
        for (let i = 0; i + 1 < line.length; i++) {
          for (const [x, z] of along(line[i]!, line[i + 1]!, 5)) {
            expect(surfaceAtWorld(premium, x, z), `${i}`).not.toBe(SURFACE_CODES.water);
          }
        }
        // Ze vsi se ke stezce dojde po souši (sedlo je na straně potoka se vsí).
        expect(landConnected(premium, c, pass)).toBe(true);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'pohoří leží za loukami vsi – místo, louky a les u vsi jako v průměrné krajině',
    () => {
      for (const { premium, average } of pairs('mountain-pass', SAMPLE)) {
        expect(premium.villageSite).toEqual(average.villageSite);
        expect(nearMeadow(premium)).toBeGreaterThanOrEqual(0.99 * nearMeadow(average));
        expect(Math.abs(forestShare(premium) - forestShare(average))).toBeLessThanOrEqual(0.01);
        expect(reliefOf(premium)).toBeGreaterThan(reliefOf(average) + 60);
        // Voda zůstane – potok je stejný.
        expect(premium.stream).toEqual(average.stream);
      }
    },
    TIMEOUT_MS,
  );
});

describe('sacred-mountain – posvátná hora', () => {
  it(
    'vrch aspoň 50 m nad okolím s vrcholovou plošinou aspoň 0,5 ha, do 1 km od vsi',
    () => {
      for (const { premium } of pairs('sacred-mountain', SAMPLE)) {
        const summit = onlySite(premium, 'summit');
        const outline = summit.outline!;
        expect(polygonArea(outline)).toBeGreaterThanOrEqual(5_000);
        const c = village(premium);
        expect(Math.hypot(summit.x - c.x, summit.z - c.z)).toBeLessThanOrEqual(1_000);
        // Plošina je rovná (do 1 m pod vrcholem) a celá aspoň 50 m nad okolím – průměr terénu
        // 400 m od vrcholu (za úpatím).
        const top = heightAtWorld(premium, summit.x, summit.z);
        const surroundings = ringMean(premium, summit.x, summit.z, 400);
        for (const [x, z] of outline) {
          const h = heightAtWorld(premium, x, z);
          expect(top - h).toBeLessThanOrEqual(1 + 1e-3);
          expect(h - surroundings).toBeGreaterThanOrEqual(50);
        }
        expect(surfaceAtWorld(premium, summit.x, summit.z)).not.toBe(SURFACE_CODES.water);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'hora nechá místo vsi, louky a les u vsi jako v průměrné krajině, potok beze změny',
    () => {
      for (const { premium, average } of pairs('sacred-mountain', SAMPLE)) {
        expect(premium.villageSite).toEqual(average.villageSite);
        expect(nearMeadow(premium)).toBeGreaterThanOrEqual(0.99 * nearMeadow(average));
        expect(Math.abs(forestShare(premium) - forestShare(average))).toBeLessThanOrEqual(0.01);
        expect(premium.stream).toEqual(average.stream);
      }
    },
    TIMEOUT_MS,
  );
});

describe('natural-fortress – přirozená pevnost', () => {
  it(
    'jistá ostrožna nad zaříznutým meandrem s plochou aspoň 1 ha, vysoko nad potokem',
    () => {
      for (const { premium } of pairs('natural-fortress', SAMPLE)) {
        const site = onlySite(premium, 'promontory');
        const meander = promontoriesOf(premium).filter((p) => p.kind === 'meander');
        expect(meander).toHaveLength(1);
        expect(meander[0]!.areaHa).toBeGreaterThanOrEqual(1);
        expect(polygonArea(site.outline!)).toBeGreaterThanOrEqual(10_000);
        const level = streamCenterline(premium).nearest(site.x, site.z, 300).level;
        expect(heightAtWorld(premium, site.x, site.z) - level).toBeGreaterThanOrEqual(8);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'potok ostrožnu obtéká – voda aspoň ve třech čtvrtinách směrů od jejího středu',
    () => {
      for (const { premium } of pairs('natural-fortress', SAMPLE)) {
        const site = onlySite(premium, 'promontory');
        let reach = 0;
        for (const [x, z] of site.outline!) {
          reach = Math.max(reach, Math.hypot(x - site.x, z - site.z));
        }
        let wet = 0;
        const rays = 32;
        for (let k = 0; k < rays; k++) {
          const a = (2 * Math.PI * k) / rays;
          for (let r = 0; r <= reach + 60; r += 3) {
            const x = site.x + Math.cos(a) * r;
            const z = site.z + Math.sin(a) * r;
            if (surfaceAtWorld(premium, x, z) === SURFACE_CODES.water) {
              wet++;
              break;
            }
          }
        }
        expect(wet / rays).toBeGreaterThanOrEqual(0.75);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'pevnost nechá místo vsi i louky u vsi jako v průměrné krajině',
    () => {
      for (const { premium, average } of pairs('natural-fortress', SAMPLE)) {
        expect(premium.villageSite).toEqual(average.villageSite);
        expect(nearMeadow(premium)).toBeGreaterThanOrEqual(0.97 * nearMeadow(average));
        expect(Math.abs(forestShare(premium) - forestShare(average))).toBeLessThanOrEqual(0.02);
      }
    },
    TIMEOUT_MS,
  );
});
