// Typy vody (premium-landscapes.md – Typy krajin): řeka, brod pod vyvýšeninou se stezkou, soutok,
// zlatonosný potok, solný a posvátný pramen. Co průchod udělá s krajinou proti průměrné krajině
// téhož (přijatého) seedu a jaké prvky typu vrátí. Hodnoty z plánu (návrh Clauda).
import { describe, expect, it } from 'vitest';
import { NEAR_SITE_RADIUS_CELLS } from '../../band';
import { generateAcceptedLandscape, generateLandscapeAttempt } from '../../generate';
import { obstaclesOf } from '../../obstacles/generate';
import { obstacleKind } from '../../obstacles/query';
import { OBSTACLE_SOURCES } from '../../obstacles/types';
import { riverCenterline, streamCenterline, watersCenterline } from '../../stream-geometry';
import {
  CURRENT_LAYER_VERSIONS,
  promontoriesOf,
  SURFACE_CODES,
  type Landscape,
  type StreamPoint,
} from '../../types';
import { heightAtWorld, tileCenterWorld, tileOfWorldPoint } from '../../world';
import { buildPathTerrain, pathWindowFor, PATH_WATER } from '../../../village/paths/terrain';
import { premiumFeaturesOf } from '../generate';
import type { PremiumSite, PremiumSiteKind, PremiumType } from '../types';
import { RIVER } from '../river';
import { GOLD_PLACERS, SPRINGS } from '../water';

/** Přijatá prémiová krajina a průměrná krajina z téhož (přijatého) seedu pokusu. */
interface Pair {
  readonly premium: Landscape;
  readonly average: Landscape;
}

const pairCache = new Map<string, readonly Pair[]>();

function pairs(type: PremiumType, count: number): readonly Pair[] {
  const key = `${type}|${count}`;
  const cached = pairCache.get(key);
  if (cached) return cached;
  const result = Array.from({ length: count }, (_, i): Pair => {
    const accepted = generateAcceptedLandscape(i + 1, CURRENT_LAYER_VERSIONS, type);
    return {
      premium: accepted.landscape,
      average: generateLandscapeAttempt(accepted.seed, CURRENT_LAYER_VERSIONS),
    };
  });
  pairCache.set(key, result);
  return result;
}

const SAMPLE = 12;
const OBSTACLE_SAMPLE = 6;
const TIMEOUT_MS = 120_000;

const village = (l: Landscape): { x: number; z: number } =>
  tileCenterWorld(l, l.villageSite.x, l.villageSite.y);

const half = (l: Landscape): number => (l.size * l.cellSizeM) / 2;

function sitesOf(l: Landscape, kind: PremiumSiteKind): readonly PremiumSite[] {
  const features = premiumFeaturesOf(l);
  expect(features).not.toBeNull();
  return features!.sites.filter((s) => s.kind === kind);
}

function onlySite(l: Landscape, kind: PremiumSiteKind): PremiumSite {
  const sites = sitesOf(l, kind);
  expect(sites, kind).toHaveLength(1);
  return sites[0]!;
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

/** Strana okraje mapy, na které bod leží (do `tolerance` m), nebo null. */
function edgeSide(
  l: Landscape,
  [x, z]: readonly [number, number],
  tolerance = 0.01,
): string | null {
  const h = half(l);
  if (Math.abs(x + h) <= tolerance) return 'left';
  if (Math.abs(x - h) <= tolerance) return 'right';
  if (Math.abs(z + h) <= tolerance) return 'top';
  if (Math.abs(z - h) <= tolerance) return 'bottom';
  return null;
}

/** Povrch políčka pod bodem (bod na okraji mapy patří krajnímu políčku). */
function surfaceAtWorld(l: Landscape, x: number, z: number): number {
  const inner = half(l) - 1e-6;
  const tile = tileOfWorldPoint(
    l,
    Math.min(inner, Math.max(-inner, x)),
    Math.min(inner, Math.max(-inner, z)),
  )!;
  return l.surface[tile.y * l.size + tile.x]!;
}

const widthM = (l: Landscape, p: StreamPoint): number =>
  (p.halfWidthLeft + p.halfWidthRight) * l.cellSizeM;

/** Souvislé úseky brodů (mělčin) na ose řeky. */
function fordRuns(river: readonly StreamPoint[]): StreamPoint[][] {
  const runs: StreamPoint[][] = [];
  let run: StreamPoint[] = [];
  for (const p of river) {
    if (p.shallow) run.push(p);
    else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** Index bodu osy toku nejblíž prvku (ve světě). */
function nearestIndex(l: Landscape, line: readonly StreamPoint[], site: PremiumSite): number {
  const h = half(l);
  let best = 0;
  let bestD = Infinity;
  line.forEach((p, k) => {
    const d = Math.hypot(
      -h + (p.x + 0.5) * l.cellSizeM - site.x,
      -h + (p.y + 0.5) * l.cellSizeM - site.z,
    );
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return best;
}

function count(l: Landscape, test: (i: number) => boolean): number {
  let n = 0;
  for (let i = 0; i < l.surface.length; i++) if (test(i)) n++;
  return n;
}

const nearMeadow = (l: Landscape): number =>
  count(
    l,
    (i) =>
      l.surface[i] === SURFACE_CODES.meadow &&
      Math.hypot((i % l.size) - l.villageSite.x, Math.floor(i / l.size) - l.villageSite.y) <=
        NEAR_SITE_RADIUS_CELLS,
  );
const forestShare = (l: Landscape): number =>
  count(l, (i) => l.surface[i] === SURFACE_CODES.forest) / l.surface.length;

/** Výška hladiny brodu (m) – bod osy řeky nejblíž prvku brodu. */
function fordLevel(l: Landscape, ford: PremiumSite): number {
  const river = riverCenterline(l)!;
  return river.nearest(ford.x, ford.z).level;
}

const RIVER_TYPES = ['navigable-river', 'ford-hill', 'confluence'] as const;

describe('řeka – splavná řeka, brod pod vyvýšeninou, soutok', () => {
  for (const type of RIVER_TYPES) {
    it(
      `${type}: řeka vede od okraje k okraji, je široká 12–20 m (brod širší) a je vodou krajiny`,
      () => {
        for (const { premium } of pairs(type, SAMPLE)) {
          const river = premium.river!;
          expect(river.length).toBeGreaterThan(100);
          const site = onlySite(premium, 'river');
          const line = site.line!;
          const first = edgeSide(premium, line[0]!);
          const last = edgeSide(premium, line.at(-1)!);
          expect(first).not.toBeNull();
          expect(last).not.toBeNull();
          expect(first).not.toBe(last);
          // U soutoku teče řeka pod ním korytem potoka – rozšířeným aspoň na šířku řeky, tůně
          // potoka zůstanou širší; horní mez šířky platí nad soutokem.
          const lowerFrom =
            type === 'confluence'
              ? nearestIndex(premium, river, onlySite(premium, 'confluence'))
              : Infinity;
          for (const [k, p] of river.entries()) {
            expect(widthM(premium, p)).toBeGreaterThanOrEqual(RIVER.widthM[0] - 1e-3);
            if (!p.shallow && k < lowerFrom) {
              expect(widthM(premium, p)).toBeLessThanOrEqual(RIVER.widthM[1] + 1e-3);
            }
            // Osa leží ve vodě (políčko pod osou je voda).
            const x = Math.min(premium.size - 1, Math.max(0, Math.round(p.x)));
            const y = Math.min(premium.size - 1, Math.max(0, Math.round(p.y)));
            expect(premium.surface[y * premium.size + x]).toBe(SURFACE_CODES.water);
          }
          // Hladina po proudu neroste.
          for (let k = 1; k < river.length; k++) {
            expect(river[k]!.level).toBeLessThanOrEqual(river[k - 1]!.level + 1e-4);
          }
        }
      },
      TIMEOUT_MS,
    );

    it(
      `${type}: brody jen na 1–2 místech a každý leží na řece`,
      () => {
        for (const { premium } of pairs(type, SAMPLE)) {
          const runs = fordRuns(premium.river!);
          expect(runs.length).toBeGreaterThanOrEqual(RIVER.fords[0]);
          expect(runs.length).toBeLessThanOrEqual(RIVER.fords[1]);
          const fords = sitesOf(premium, 'ford');
          expect(fords).toHaveLength(runs.length);
          const centerline = riverCenterline(premium)!;
          for (const ford of fords) {
            const here = centerline.nearest(ford.x, ford.z);
            expect(here.bankDistance).toBeLessThan(0);
            expect(here.shallow).toBeGreaterThan(0.5);
            expect(surfaceAtWorld(premium, ford.x, ford.z)).toBe(SURFACE_CODES.water);
          }
        }
      },
      TIMEOUT_MS,
    );

    it(
      `${type}: řeka zůstane mimo okolí vsi – les a louky u vsi jako v průměrné krajině`,
      () => {
        for (const { premium, average } of pairs(type, SAMPLE)) {
          const c = village(premium);
          const line = onlySite(premium, 'river').line!;
          expect(lineDistance(line, c.x, c.z)).toBeGreaterThanOrEqual(
            (RIVER.villageMinCells - 2) * premium.cellSizeM,
          );
          expect(premium.villageSite).toEqual(average.villageSite);
          expect(nearMeadow(premium)).toBeGreaterThanOrEqual(0.97 * nearMeadow(average));
          expect(Math.abs(forestShare(premium) - forestShare(average))).toBeLessThanOrEqual(0.04);
        }
      },
      TIMEOUT_MS,
    );

    it(
      `${type}: řeka je pro vesnici překážkou jako voda potoka – pěšina přes ni nevede`,
      () => {
        const { premium } = pairs(type, SAMPLE)[0]!;
        const h = half(premium);
        const terrain = buildPathTerrain(
          premium,
          pathWindowFor(premium, { minX: -h, minZ: -h, maxX: h, maxZ: h }),
        );
        const { width, height, originX, originZ, cellM } = terrain;
        let checked = 0;
        for (const p of premium.river!) {
          if (p.shallow) continue;
          const wx = -h + (p.x + 0.5) * premium.cellSizeM;
          const wz = -h + (p.y + 0.5) * premium.cellSizeM;
          const i = Math.round((wx - originX) / cellM);
          const j = Math.round((wz - originZ) / cellM);
          if (i < 3 || j < 3 || i > width - 4 || j > height - 4) continue;
          const c = j * width + i;
          expect(terrain.cost[c]).toBe(Infinity);
          expect(terrain.flags[c]! & PATH_WATER).toBe(PATH_WATER);
          checked++;
        }
        expect(checked).toBeGreaterThan(100);
      },
      TIMEOUT_MS,
    );
  }

  it(
    'vrstva překážek nedá strom do řeky a osa vod zná řeku i potok',
    () => {
      for (const { premium } of pairs('navigable-river', 3)) {
        const waters = watersCenterline(premium);
        const stream = streamCenterline(premium);
        const river = riverCenterline(premium)!;
        // Potok je pro rozmisťovače dál stejný – body osy jsou body potoka.
        expect(waters.points).toEqual(stream.points);
        const layer = obstaclesOf(premium);
        for (let i = 0; i < layer.count; i++) {
          if (obstacleKind(layer, i) !== 'tree') continue;
          const x = layer.x[i]!;
          const z = layer.z[i]!;
          expect(river.nearest(x, z).bankDistance).toBeGreaterThan(0);
          const near = waters.nearest(x, z);
          const either = Math.min(
            river.nearest(x, z).bankDistance,
            stream.nearest(x, z).bankDistance,
          );
          expect(near.bankDistance).toBe(either);
        }
      }
    },
    TIMEOUT_MS,
  );
});

describe('navigable-river – splavná řeka', () => {
  it(
    'potok zůstane, jak byl; místo pro přístaviště leží na břehu řeky na straně vsi',
    () => {
      for (const { premium, average } of pairs('navigable-river', SAMPLE)) {
        expect(premium.stream.map((p) => [p.x, p.y])).toEqual(
          average.stream.map((p) => [p.x, p.y]),
        );
        const port = onlySite(premium, 'port');
        const near = riverCenterline(premium)!.nearest(port.x, port.z);
        expect(near.bankDistance).toBeGreaterThan(0);
        expect(near.bankDistance).toBeLessThanOrEqual(RIVER.portBankM + 1);
        expect(surfaceAtWorld(premium, port.x, port.z)).not.toBe(SURFACE_CODES.water);
        // Z místa vsi se k přístavišti dojde po souši – potok ani řeka nejsou v cestě.
        expect(landConnected(premium, village(premium), port)).toBe(true);
      }
    },
    TIMEOUT_MS,
  );
});

describe('ford-hill – vyvýšenina nad brodem se stezkou', () => {
  it(
    'nad brodem je ostrožna aspoň 15 m nad hladinou brodu, mimo okruh vsi',
    () => {
      for (const { premium } of pairs('ford-hill', SAMPLE)) {
        const hill = onlySite(premium, 'promontory');
        const promontory = promontoriesOf(premium).find((p) => p.kind === 'ford-hill');
        expect(promontory).toBeDefined();
        const fords = sitesOf(premium, 'ford');
        const ford = [...fords].sort(
          (a, b) => Math.hypot(a.x - hill.x, a.z - hill.z) - Math.hypot(b.x - hill.x, b.z - hill.z),
        )[0]!;
        expect(Math.hypot(ford.x - hill.x, ford.z - hill.z)).toBeLessThanOrEqual(250);
        expect(
          heightAtWorld(premium, hill.x, hill.z) - fordLevel(premium, ford),
        ).toBeGreaterThanOrEqual(15);
        // Plocha nahoře celá aspoň 13 m nad brodem (obrys = okraj plochy, 2 m pod temenem).
        for (const [x, z] of hill.outline!) {
          expect(heightAtWorld(premium, x, z) - fordLevel(premium, ford)).toBeGreaterThan(13);
        }
      }
    },
    TIMEOUT_MS,
  );

  it(
    'stezka vede od okraje k okraji přes brod, k místu vsi nejblíž 150 m, jinde po souši',
    () => {
      for (const { premium } of pairs('ford-hill', SAMPLE)) {
        const route = onlySite(premium, 'route');
        const line = route.line!;
        const first = edgeSide(premium, line[0]!);
        const last = edgeSide(premium, line.at(-1)!);
        expect(first).not.toBeNull();
        expect(last).not.toBeNull();
        const hill = onlySite(premium, 'promontory');
        const ford = [...sitesOf(premium, 'ford')].sort(
          (a, b) => Math.hypot(a.x - hill.x, a.z - hill.z) - Math.hypot(b.x - hill.x, b.z - hill.z),
        )[0]!;
        expect(lineDistance(line, ford.x, ford.z)).toBeLessThanOrEqual(8);
        const c = village(premium);
        expect(lineDistance(line, c.x, c.z)).toBeGreaterThanOrEqual(150);
        // Mimo brod vede stezka po souši (vodu přejde jen v brodu).
        for (let i = 0; i + 1 < line.length; i++) {
          const [ax, az] = line[i]!;
          const [bx, bz] = line[i + 1]!;
          for (let t = 0; t <= 1; t += 0.25) {
            const x = ax + (bx - ax) * t;
            const z = az + (bz - az) * t;
            if (Math.hypot(x - ford.x, z - ford.z) <= 45) continue;
            expect(surfaceAtWorld(premium, x, z), `${i}`).not.toBe(SURFACE_CODES.water);
          }
        }
      }
    },
    TIMEOUT_MS,
  );
});

describe('confluence – soutok řeky a potoka', () => {
  it(
    'potok ústí do řeky v soutoku a mezi nimi je ostrožna',
    () => {
      for (const { premium } of pairs('confluence', SAMPLE)) {
        const confluence = onlySite(premium, 'confluence');
        const river = riverCenterline(premium)!;
        expect(river.nearest(confluence.x, confluence.z).bankDistance).toBeLessThan(0);
        // Potok začíná na okraji mapy a končí v soutoku.
        const stream = premium.stream;
        const h = half(premium);
        const end = stream.at(-1)!;
        const endWorld = {
          x: -h + (end.x + 0.5) * premium.cellSizeM,
          z: -h + (end.y + 0.5) * premium.cellSizeM,
        };
        expect(Math.hypot(endWorld.x - confluence.x, endWorld.z - confluence.z)).toBeLessThan(
          2 * premium.cellSizeM,
        );
        const start = stream[0]!;
        expect(
          start.x <= 0.5 ||
            start.y <= 0.5 ||
            start.x >= premium.size - 1.5 ||
            start.y >= premium.size - 1.5,
        ).toBe(true);
        // Potok ústí – jeho hladina v soutoku není pod hladinou řeky.
        expect(end.level).toBeGreaterThanOrEqual(
          river.nearest(confluence.x, confluence.z).level - 1e-3,
        );
        const spur = onlySite(premium, 'promontory');
        expect(promontoriesOf(premium).some((p) => p.kind === 'confluence')).toBe(true);
        expect(Math.hypot(spur.x - confluence.x, spur.z - confluence.z)).toBeLessThanOrEqual(300);
        // Plocha ostrožny je nad oběma toky – souš, ze které je k vodě vidět.
        expect(surfaceAtWorld(premium, spur.x, spur.z)).not.toBe(SURFACE_CODES.water);
        expect(heightAtWorld(premium, spur.x, spur.z) - end.level).toBeGreaterThanOrEqual(8);
      }
    },
    TIMEOUT_MS,
  );
});

describe('gold-stream – zlatonosný potok', () => {
  it(
    '3–6 náplavů na vnitřní straně oblouků potoka, krajina jako průměrná',
    () => {
      for (const { premium, average } of pairs('gold-stream', SAMPLE)) {
        expect(premium.heights).toEqual(average.heights);
        expect(premium.surface).toEqual(average.surface);
        const placers = sitesOf(premium, 'gold-placer');
        expect(placers.length).toBeGreaterThanOrEqual(GOLD_PLACERS.count[0]);
        expect(placers.length).toBeLessThanOrEqual(GOLD_PLACERS.count[1]);
        const stream = streamCenterline(premium);
        const c = village(premium);
        for (const placer of placers) {
          const here = stream.nearest(placer.x, placer.z);
          expect(here.innerBend).toBeGreaterThan(0.3);
          expect(Math.abs(here.bankDistance)).toBeLessThanOrEqual(8);
          expect(Math.hypot(placer.x - c.x, placer.z - c.z)).toBeGreaterThan(150);
        }
      }
    },
    TIMEOUT_MS,
  );
});

describe('salt-spring a sacred-spring – prameny', () => {
  it(
    'solný pramen – slanisko u potoka do 700 m od vsi, na louce (mimo les)',
    () => {
      for (const { premium, average } of pairs('salt-spring', SAMPLE)) {
        expect(premium.heights).toEqual(average.heights);
        const salt = onlySite(premium, 'salt');
        const c = village(premium);
        const d = Math.hypot(salt.x - c.x, salt.z - c.z);
        expect(d).toBeLessThanOrEqual(SPRINGS.maxDistanceM);
        expect(d).toBeGreaterThanOrEqual(SPRINGS.minDistanceM);
        expect(surfaceAtWorld(premium, salt.x, salt.z)).toBe(SURFACE_CODES.meadow);
        expect(streamCenterline(premium).nearest(salt.x, salt.z).bankDistance).toBeLessThanOrEqual(
          SPRINGS.saltBankM + 1,
        );
      }
    },
    TIMEOUT_MS,
  );

  it(
    'posvátný pramen – do 700 m od vsi ve skalce (výchoz ve vrstvě překážek), mimo vodu',
    () => {
      for (const { premium } of pairs('sacred-spring', OBSTACLE_SAMPLE)) {
        const spring = onlySite(premium, 'spring');
        const c = village(premium);
        const d = Math.hypot(spring.x - c.x, spring.z - c.z);
        expect(d).toBeLessThanOrEqual(SPRINGS.maxDistanceM);
        expect(d).toBeGreaterThanOrEqual(SPRINGS.minDistanceM);
        expect(surfaceAtWorld(premium, spring.x, spring.z)).not.toBe(SURFACE_CODES.water);
        const layer = obstaclesOf(premium);
        let rocks = 0;
        let others = 0;
        for (let i = 0; i < layer.count; i++) {
          const near = Math.hypot(layer.x[i]! - spring.x, layer.z[i]! - spring.z);
          if (near > SPRINGS.rockRadiusM + 2) continue;
          const source = Math.floor(layer.id[i]! / 4_194_304);
          if (source === OBSTACLE_SOURCES.springRock) {
            rocks++;
            if (obstacleKind(layer, i) === 'outcrop') rocks += 10;
          } else if (near < SPRINGS.clearingM) others++;
        }
        // Skalka = výchoz a balvany kolem pramene; u pramene nic jiného.
        expect(rocks).toBeGreaterThanOrEqual(12);
        expect(others).toBe(0);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'průměrná krajina ani jiný typ skalku pramene nemají',
    () => {
      const { average } = pairs('sacred-spring', 1)[0]!;
      const layer = obstaclesOf(average);
      for (let i = 0; i < layer.count; i++) {
        expect(Math.floor(layer.id[i]! / 4_194_304)).not.toBe(OBSTACLE_SOURCES.springRock);
      }
    },
    TIMEOUT_MS,
  );
});

/** Dojde se z bodu `a` do bodu `b` po souši (políčka bez vody, 4-sousedství)? */
function landConnected(
  l: Landscape,
  a: { x: number; z: number },
  b: { x: number; z: number },
): boolean {
  const from = tileOfWorldPoint(l, a.x, a.z)!;
  const to = tileOfWorldPoint(l, b.x, b.z)!;
  const seen = new Uint8Array(l.size * l.size);
  const start = from.y * l.size + from.x;
  const goal = to.y * l.size + to.x;
  const queue = [start];
  seen[start] = 1;
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!;
    if (i === goal) return true;
    const x = i % l.size;
    const y = Math.floor(i / l.size);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= l.size || ny >= l.size) continue;
      const n = ny * l.size + nx;
      if (seen[n] || l.surface[n] === SURFACE_CODES.water) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return false;
}
