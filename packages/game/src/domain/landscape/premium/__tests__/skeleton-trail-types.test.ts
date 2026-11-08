// Prémie na kostře – typy stezky (premium: 2, world-skeleton.md – Mapa z kostry): vyvýšenina nad
// brodem stojí nad brodem, kudy kostra vede stezku, horský průsmyk má sedlo na stezce kostry
// u okraje, kterým stezka vstupuje. Stezka typu je stezka kostry (`skeletonRoute`), ne vlastní.
import { describe, expect, it } from 'vitest';
import { checkBand } from '../../band';
import { generateAcceptedLandscape, generateLandscapeAttempt } from '../../generate';
import { SKELETON_BAND_CASES } from '../../skeleton/__tests__/skeleton-band';
import { skeletonFeaturesOf } from '../../skeleton/features';
import { portTile } from '../../skeleton/ports-map';
import type { SkeletonRoute } from '../../skeleton/route';
import type { SkeletonSlice } from '../../skeleton/types';
import {
  CURRENT_LAYER_VERSIONS,
  promontoriesOf,
  type Landscape,
  type LayerVersions,
  type StreamPoint,
} from '../../types';
import { heightAtWorld, tileCenterWorld } from '../../world';
import { checkPremium } from '../check';
import { premiumFeaturesOf } from '../generate';
import { streamPointWorld } from '../geometry';
import { FORD_HILL } from '../river';
import { MOUNTAIN_PASS } from '../relief';
import type { PremiumSite, PremiumSiteKind, PremiumType } from '../types';
import { SKELETON_PREMIUM_VERSIONS as PREMIUM2 } from './skeleton-type-band';

/** Mapa z kostry bez prémie. */
const PLAIN: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };
const { brod, stezka } = SKELETON_BAND_CASES;
/** Stezka od jihu k severu – průsmyk u strany N nebo S (`stezka` má jen E a W). */
const severJih: SkeletonSlice = {
  world: 1,
  rivers: [],
  trails: [
    { side: 'N', at: 80 },
    { side: 'S', at: 50 },
  ],
};
const TIMEOUT_MS = 180_000;
const SAMPLE = 6;

/** Přijaté prémiové mapy z kostry (seedy 1…SAMPLE). */
function accepted(type: PremiumType, slice: SkeletonSlice): Landscape[] {
  return Array.from(
    { length: SAMPLE },
    (_, i) => generateAcceptedLandscape(i + 1, PREMIUM2, type, slice).landscape,
  );
}

function onlySite(l: Landscape, kind: PremiumSiteKind): PremiumSite {
  const sites = premiumFeaturesOf(l)!.sites.filter((s) => s.kind === kind);
  expect(sites, kind).toHaveLength(1);
  return sites[0]!;
}

function routeOf(l: Landscape): SkeletonRoute {
  const route = skeletonFeaturesOf(l)?.route ?? null;
  expect(route).not.toBeNull();
  return route!;
}

/** Nejmenší vzdálenost bodu od lomené čáry (m). */
function lineDistance(line: readonly (readonly [number, number])[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return best;
}

/** Prvek `route` je stezka kostry: konce v bodech výřezu, čára = oba úseky trasy. */
function expectSkeletonRoute(l: Landscape, slice: SkeletonSlice): void {
  const route = routeOf(l);
  const line = onlySite(l, 'route').line!;
  expect(line[0]).toEqual(route.legs[0]![0]);
  expect(line.at(-1)).toEqual(route.legs[1]![0]);
  for (const [k, trail] of slice.trails.entries()) {
    const tile = portTile(trail.side, trail.at, l.size);
    const centre = tileCenterWorld(l, tile.x, tile.y);
    const [x, z] = route.ends[k]!.point;
    expect(Math.hypot(x - centre.x, z - centre.z)).toBeLessThanOrEqual(15);
  }
}

/** Souvislé mělčiny osy – středy (index). */
function fordCenters(course: readonly StreamPoint[]): number[] {
  const centers: number[] = [];
  let start = -1;
  course.forEach((p, k) => {
    if (p.shallow && start < 0) start = k;
    if ((!p.shallow || k === course.length - 1) && start >= 0) {
      centers.push(Math.round((start + (p.shallow ? k : k - 1)) / 2));
      start = -1;
    }
  });
  return centers;
}

describe('vyvýšenina nad brodem na kostře (premium: 2)', () => {
  const landscapes = accepted('ford-hill', brod);

  it(
    'řeka kostry s jediným brodem, kudy vede stezka kostry; mapa projde pásmem i kontrolou typu',
    () => {
      for (const l of landscapes) {
        expect(l.premium).toBe('ford-hill');
        expect(l.skeleton).toEqual(brod);
        expect('river' in l).toBe(false);
        expect(l.rivers).toHaveLength(1);
        expect(fordCenters(l.rivers![0]!)).toHaveLength(1);
        expect(routeOf(l).fords).toHaveLength(1);
        expect(checkBand(l, PREMIUM2)).toEqual({ ok: true, failures: [] });
        expect(checkPremium(l)).toEqual({ ok: true });
        expectSkeletonRoute(l, brod);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'ostrožna u brodu trasy, aspoň 15 m nad hladinou brodu',
    () => {
      for (const l of landscapes) {
        const course = l.rivers![0]!;
        const ford = course[fordCenters(course)[0]!]!;
        const [fx, fz] = streamPointWorld(l, ford);
        const [rx, rz] = routeOf(l).fords[0]!;
        expect(Math.hypot(rx - fx, rz - fz)).toBeLessThanOrEqual(l.cellSizeM);
        const hill = onlySite(l, 'promontory');
        const promontory = promontoriesOf(l).find((p) => p.kind === 'ford-hill')!;
        expect(promontory.heightM).toBeGreaterThanOrEqual(FORD_HILL.heightM[0]);
        expect(promontory.heightM).toBeLessThanOrEqual(FORD_HILL.heightM[1]);
        // Kus od brodu podél řeky na břehu – do 12 políček od brodu.
        expect(Math.hypot(hill.x - fx, hill.z - fz)).toBeLessThanOrEqual(12 * l.cellSizeM);
        expect(heightAtWorld(l, hill.x, hill.z) - ford.level).toBeGreaterThanOrEqual(15);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'mapa z kostry bez prémie (týž pokus) ostrožnu nad brodem nemá',
    () => {
      const { seed } = generateAcceptedLandscape(1, PREMIUM2, 'ford-hill', brod);
      const plain = generateLandscapeAttempt(seed, PLAIN, undefined, brod);
      expect(promontoriesOf(plain).some((p) => p.kind === 'ford-hill')).toBe(false);
      expect(promontoriesOf(landscapes[0]!).some((p) => p.kind === 'ford-hill')).toBe(true);
    },
    TIMEOUT_MS,
  );
});

describe('horský průsmyk na kostře (premium: 2)', () => {
  for (const [name, slice] of [
    ['stezka', stezka],
    ['sever–jih', severJih],
  ] as const) {
    it(
      `${name}: sedlo na stezce kostry u okraje, kudy vstupuje, oba hřbety ≥ 60 m nad sedlem`,
      () => {
        for (const l of accepted('mountain-pass', slice)) {
          expect(l.premium).toBe('mountain-pass');
          expect(l.rivers).toBeUndefined();
          expect(checkBand(l, PREMIUM2)).toEqual({ ok: true, failures: [] });
          expect(checkPremium(l)).toEqual({ ok: true });
          expectSkeletonRoute(l, slice);
          const pass = onlySite(l, 'pass');
          const route = onlySite(l, 'route');
          // Sedlo do 2 políček od stezky kostry.
          expect(lineDistance(route.line!, pass.x, pass.z)).toBeLessThanOrEqual(2 * l.cellSizeM);
          // U okraje bodu stezky dál od vsi, ves na druhé straně hřbetu.
          const village = tileCenterWorld(l, l.villageSite.x, l.villageSite.y);
          const ports = slice.trails.map((t) => {
            const tile = portTile(t.side, t.at, l.size);
            return tileCenterWorld(l, tile.x, tile.y);
          });
          const far = ports.reduce((a, b) =>
            Math.hypot(b.x - village.x, b.z - village.z) >
            Math.hypot(a.x - village.x, a.z - village.z)
              ? b
              : a,
          );
          expect(Math.hypot(pass.x - far.x, pass.z - far.z)).toBeLessThanOrEqual(
            (MOUNTAIN_PASS.crestCells + 1) * l.cellSizeM,
          );
          expect(Math.hypot(pass.x - village.x, pass.z - village.z)).toBeGreaterThanOrEqual(
            MOUNTAIN_PASS.villageMinCells * l.cellSizeM,
          );
          // Oba hřbety (od sedla ke koncům hřebene) aspoň 60 m nad sedlem.
          const [a, saddle, b] = pass.line!;
          const saddleHeight = heightAtWorld(l, saddle![0], saddle![1]);
          for (const end of [a!, b!]) {
            const steps = Math.round(Math.hypot(end[0] - saddle![0], end[1] - saddle![1]) / 15);
            let top = -Infinity;
            for (let k = 1; k <= steps; k++) {
              const x = saddle![0] + ((end[0] - saddle![0]) * k) / steps;
              const z = saddle![1] + ((end[1] - saddle![1]) * k) / steps;
              top = Math.max(top, heightAtWorld(l, x, z));
            }
            expect(top - saddleHeight).toBeGreaterThanOrEqual(MOUNTAIN_PASS.minRiseM);
          }
        }
      },
      TIMEOUT_MS,
    );
  }
});
