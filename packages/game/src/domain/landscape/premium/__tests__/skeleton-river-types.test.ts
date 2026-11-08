// Prémie na kostře – typy řeky (premium: 2, world-skeleton.md – Mapa z kostry): splavná řeka
// a soutok berou řeku z výřezu kostry, vlastní řeku nepřidávají. Průchod 1 (dnešní prémiové mapy
// s náhodnou řekou) se nemění ani o bit; typ, který výřezu neodpovídá, vyhodí RangeError.
import { describe, expect, it } from 'vitest';
import { landscapeHash } from '../../__tests__/landscape-checks';
import { checkBand } from '../../band';
import { generateAcceptedLandscape, generateLandscapeAttempt } from '../../generate';
import { distanceToMask } from '../../grid';
import { SKELETON_BAND_CASES } from '../../skeleton/__tests__/skeleton-band';
import { portTile } from '../../skeleton/ports-map';
import type { SkeletonSlice } from '../../skeleton/types';
import { riverCenterline } from '../../stream-geometry';
import {
  CURRENT_LAYER_VERSIONS,
  promontoriesOf,
  SURFACE_CODES,
  type Landscape,
  type LayerVersions,
  type StreamPoint,
} from '../../types';
import { heightAtWorld, tileCenterWorld, tileOfWorldPoint } from '../../world';
import { PREMIUM_TYPES } from '../catalog';
import { checkPremium } from '../check';
import { hasPremiumPass, PREMIUM_LAYER_VERSION, premiumFeaturesOf } from '../generate';
import { CONFLUENCE, landRegion, RIVER } from '../river';
import {
  SKELETON_PREMIUM_SLOTS,
  type PremiumSite,
  type PremiumSiteKind,
  type PremiumType,
} from '../types';
import { SKELETON_PREMIUM_VERSIONS as PREMIUM2 } from './skeleton-type-band';

/** Mapa z kostry bez prémie – stejný výřez a seed pro srovnání. */
const PLAIN: LayerVersions = { ...CURRENT_LAYER_VERSIONS, skeleton: 1 };
/** Průchod 2 na suché mapě (bez výřezu). */
const PREMIUM2_DRY: LayerVersions = { ...CURRENT_LAYER_VERSIONS, premium: PREMIUM_LAYER_VERSION };
const { rovně, ohyb, stezka, brod } = SKELETON_BAND_CASES;
const TIMEOUT_MS = 120_000;
const SAMPLE = 6;

interface Pair {
  readonly premium: Landscape;
  readonly plain: Landscape;
}

/** Přijaté prémiové mapy z kostry a mapa z kostry bez prémie z téhož (přijatého) seedu pokusu. */
function pairs(type: PremiumType, slice: SkeletonSlice): Pair[] {
  return Array.from({ length: SAMPLE }, (_, i): Pair => {
    const accepted = generateAcceptedLandscape(i + 1, PREMIUM2, type, slice);
    return {
      premium: accepted.landscape,
      plain: generateLandscapeAttempt(accepted.seed, PLAIN, undefined, slice),
    };
  });
}

function sitesOf(l: Landscape, kind: PremiumSiteKind): PremiumSite[] {
  const features = premiumFeaturesOf(l);
  expect(features).not.toBeNull();
  return features!.sites.filter((s) => s.kind === kind);
}

function onlySite(l: Landscape, kind: PremiumSiteKind): PremiumSite {
  const sites = sitesOf(l, kind);
  expect(sites, kind).toHaveLength(1);
  return sites[0]!;
}

const village = (l: Landscape): { x: number; z: number } =>
  tileCenterWorld(l, l.villageSite.x, l.villageSite.y);

function tileIndex(l: Landscape, x: number, z: number): number {
  const tile = tileOfWorldPoint(l, x, z)!;
  return tile.y * l.size + tile.x;
}

/** Vodní políčka řeky kostry (voda u osy hlavního toku). */
function riverWater(l: Landscape): Uint8Array {
  const { size } = l;
  const course = l.rivers![0]!;
  const axis = new Uint8Array(size * size);
  let half = 0;
  for (const p of course) {
    axis[Math.round(p.y) * size + Math.round(p.x)] = 1;
    half = Math.max(half, p.halfWidthLeft, p.halfWidthRight);
  }
  const toAxis = distanceToMask(axis, size);
  return Uint8Array.from(l.surface, (v, i) =>
    v === SURFACE_CODES.water && toAxis[i]! <= half + 1.5 ? 1 : 0,
  );
}

/**
 * Podíl souše na straně vsi do `reachCells` od vody řeky, která leží v rovné nivě – nejvýš
 * `RIVER.floodplainM` (+ tolerance) nad hladinou nejbližšího bodu osy.
 */
function floodplainShare(l: Landscape, reachCells: number): number {
  const { size } = l;
  const course = l.rivers![0]!;
  const water = riverWater(l);
  const toWater = distanceToMask(water, size);
  const side = landRegion(water, size, l.villageSite);
  let cells = 0;
  let flat = 0;
  for (let i = 0; i < size * size; i++) {
    const d = toWater[i]!;
    if (!side[i] || l.surface[i] === SURFACE_CODES.water || d <= 0 || d > reachCells) continue;
    const x = i % size;
    const y = Math.floor(i / size);
    let best = Infinity;
    let level = 0;
    for (const p of course) {
      const dd = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (dd < best) {
        best = dd;
        level = p.level;
      }
    }
    cells++;
    if (l.heights[i]! <= level + RIVER.floodplainM + 0.3) flat++;
  }
  return flat / Math.max(1, cells);
}

/** Nejmenší vzdálenost bodu od uzavřeného obrysu (m). */
function outlineDistance(
  outline: readonly (readonly [number, number])[],
  c: { x: number; z: number },
): number {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]!;
    const [bx, bz] = outline[(i + 1) % outline.length]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((c.x - ax) * dx + (c.z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(ax + t * dx - c.x, az + t * dz - c.z));
  }
  return best;
}

describe('splavná řeka na kostře (premium: 2)', () => {
  const landscapes = pairs('navigable-river', rovně);

  it(
    'řeka z výřezu – osa končí v bodech okraje, mapa projde pásmem i kontrolou typu',
    () => {
      for (const { premium } of landscapes) {
        expect(premium.premium).toBe('navigable-river');
        expect(premium.skeleton).toEqual(rovně);
        expect('river' in premium).toBe(false);
        expect(premium.rivers).toHaveLength(1);
        const course = premium.rivers![0]!;
        for (const [port, end] of [
          [rovně.rivers.find((p) => p.flow === 'in')!, course[0]!],
          [rovně.rivers.find((p) => p.flow === 'out')!, course.at(-1)!],
        ] as const) {
          const tile = portTile(port.side, port.at, premium.size);
          expect(Math.hypot(end.x - tile.x, end.y - tile.y)).toBeLessThanOrEqual(2);
        }
        expect(checkBand(premium, PREMIUM2)).toEqual({ ok: true, failures: [] });
        expect(checkPremium(premium)).toEqual({ ok: true });
        expect(onlySite(premium, 'river').line!.length).toBeGreaterThan(2);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'niva 4 políčka na straně vsi – rovná, mapa z kostry bez prémie ji má užší',
    () => {
      for (const { premium, plain } of landscapes) {
        expect(floodplainShare(premium, 4)).toBeGreaterThanOrEqual(0.9);
        expect(floodplainShare(plain, 4)).toBeLessThanOrEqual(0.75);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'přístaviště na břehu řeky kostry na straně vsi – ze vsi po souši',
    () => {
      for (const { premium } of landscapes) {
        const port = onlySite(premium, 'port');
        const near = riverCenterline(premium)!.nearest(port.x, port.z);
        expect(near.bankDistance).toBeGreaterThan(0);
        expect(near.bankDistance).toBeLessThanOrEqual(RIVER.portBankM + 1);
        const i = tileIndex(premium, port.x, port.z);
        expect(premium.surface[i]).not.toBe(SURFACE_CODES.water);
        const water = Uint8Array.from(premium.surface, (v) => (v === SURFACE_CODES.water ? 1 : 0));
        expect(landRegion(water, premium.size, premium.villageSite)[i]).toBe(1);
      }
    },
    TIMEOUT_MS,
  );
});

describe('soutok na kostře (premium: 2)', () => {
  for (const [name, slice] of [
    ['rovně', rovně],
    ['ohyb', ohyb],
  ] as const) {
    it(
      `${name}: potok ústí do řeky kostry, ostrožna mezi nimi nad soutokem, aspoň 120 m od vsi`,
      () => {
        for (const { premium, plain } of pairs('confluence', slice)) {
          expect(checkBand(premium, PREMIUM2)).toEqual({ ok: true, failures: [] });
          // Řeka i potok zůstanou, kde byly na mapě z kostry bez prémie.
          const axis = (l: Landscape): number[][] =>
            [...l.rivers!.flat(), ...l.stream].map((p) => [p.x, p.y, p.level]);
          expect(axis(premium)).toEqual(axis(plain));
          const confluence = onlySite(premium, 'confluence');
          const river = riverCenterline(premium)!;
          const atJunction = river.nearest(confluence.x, confluence.z);
          expect(atJunction.bankDistance).toBeLessThanOrEqual(2 * premium.cellSizeM);
          const spur = onlySite(premium, 'promontory');
          expect(promontoriesOf(premium).some((p) => p.kind === 'confluence')).toBe(true);
          // Mezi řekou a potokem: blízko obou toků a soutoku.
          expect(Math.hypot(spur.x - confluence.x, spur.z - confluence.z)).toBeLessThanOrEqual(300);
          const center = promontoriesOf(premium).find((p) => p.kind === 'confluence')!.center;
          const axisCells = (points: readonly StreamPoint[]): number =>
            Math.min(...points.map((p) => Math.hypot(p.x - center.x, p.y - center.y)));
          expect(axisCells(premium.rivers![0]!)).toBeLessThanOrEqual(20);
          expect(axisCells(premium.stream)).toBeLessThanOrEqual(20);
          // Plocha nahoře je souš nad hladinou řeky v soutoku.
          expect(premium.surface[tileIndex(premium, spur.x, spur.z)]).not.toBe(SURFACE_CODES.water);
          expect(heightAtWorld(premium, spur.x, spur.z) - atJunction.level).toBeGreaterThanOrEqual(
            CONFLUENCE.heightM[0] - 2,
          );
          // Aspoň 120 m od vsi (obrys plochy i střed).
          expect(outlineDistance(spur.outline!, village(premium))).toBeGreaterThanOrEqual(120);
        }
      },
      TIMEOUT_MS,
    );
  }
});

/** Otisk krajiny i s osami toků, ostrožnami a prvky typu (FNV-1a). */
function fullHash(l: Landscape): string {
  const text = JSON.stringify([
    l.stream,
    l.river ?? null,
    l.promontories ?? null,
    premiumFeaturesOf(l),
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return `${landscapeHash(l)}:${(h >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Zlatý otisk průchodu 1 (dnešní prémiové mapy – typy kostry s náhodnou řekou) – spočítaný před
 * průchodem 2. Nesmí se změnit ani o bit.
 */
const PREMIUM1_GOLDEN: Readonly<Record<string, string>> = {
  'deep-gold': 'e0d66798:af0f04d3',
  'gold-stream': '62a6d959:d8b61215',
  'navigable-river': '0d281ef0:c9128a43',
  fertile: '539c0b1b:42187b2c',
  'ford-hill': '43a88578:a63e981f',
  'mountain-pass': '62a6d959:033511fc',
  'iron-ore': '62a6d959:5dbe7223',
  'fine-clay': '62a6d959:620ce387',
  'oak-beech': '62a6d959:99ea777f',
  floodplain: '9e1a378c:c9a7ecc6',
  'south-slopes': '3c802354:ba36cc4a',
  'sacred-mountain': 'd13742b2:99b8d3e9',
  'sacred-spring': '62a6d959:e2980388',
  confluence: '62a6d959:033511fc',
  'natural-fortress': '324a805a:3e9d8b13',
  'salt-spring': '62a6d959:dca89e7c',
  'wild-bees': '62a6d959:3b909e7d',
  'game-furs': 'f7be2f04:05e8607a',
  'building-stone': 'f24bfbb5:8f07c087',
  'navigable-river@accepted1': '1:72cde0cf:de1c43e8',
  'confluence@accepted1': '1:25f22e3d:19f77418',
  'ford-hill@accepted1': '1:7bc917dd:815110da',
};

describe('průchod 1 beze změny – zlatý otisk', () => {
  const PREMIUM1: LayerVersions = { ...CURRENT_LAYER_VERSIONS, premium: 1 };

  it(
    'každý typ (pokus 7) – bez verze průchodu i s premium: 1',
    () => {
      for (const type of PREMIUM_TYPES) {
        const expected = PREMIUM1_GOLDEN[type];
        expect(fullHash(generateLandscapeAttempt(7, CURRENT_LAYER_VERSIONS, type)), type).toBe(
          expected,
        );
        expect(fullHash(generateLandscapeAttempt(7, PREMIUM1, type)), type).toBe(expected);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'typy s řekou – přijatá krajina seedu 1',
    () => {
      for (const type of ['navigable-river', 'confluence', 'ford-hill'] as const) {
        const accepted = generateAcceptedLandscape(1, CURRENT_LAYER_VERSIONS, type);
        expect(`${accepted.seed}:${fullHash(accepted.landscape)}`, type).toBe(
          PREMIUM1_GOLDEN[`${type}@accepted1`],
        );
      }
    },
    TIMEOUT_MS,
  );

  it(
    'ostatní typy na suché mapě – průchod 2 vyjde jako průchod 1',
    () => {
      for (const type of PREMIUM_TYPES) {
        if (SKELETON_PREMIUM_SLOTS[type] !== undefined) continue;
        const l = generateLandscapeAttempt(7, PREMIUM2_DRY, type);
        expect(fullHash(l), type).toBe(PREMIUM1_GOLDEN[type]);
      }
    },
    TIMEOUT_MS,
  );
});

describe('typ a výřez si musí odpovídat', () => {
  it('průchod 2 má všechny typy kostry (řeka, soutok, brod, průsmyk)', () => {
    for (const type of Object.keys(SKELETON_PREMIUM_SLOTS) as PremiumType[]) {
      expect(hasPremiumPass(type, PREMIUM_LAYER_VERSION), type).toBe(true);
    }
    expect(SKELETON_PREMIUM_SLOTS).toEqual({
      'navigable-river': 'river',
      confluence: 'river',
      'ford-hill': 'ford',
      'mountain-pass': 'trail',
    });
  });

  it('typ kostry bez svého místa, ostatní typ na kostře i průchod 1 na kostře → RangeError', () => {
    const cases: [PremiumType, LayerVersions, SkeletonSlice | null][] = [
      // Vyvýšenina nad brodem na řece bez stezky (bez brodu).
      ['ford-hill', PREMIUM2, rovně],
      ['ford-hill', PREMIUM2_DRY, null],
      ['navigable-river', PREMIUM2_DRY, null],
      ['navigable-river', PREMIUM2, stezka],
      ['confluence', PREMIUM2, brod],
      ['mountain-pass', PREMIUM2, rovně],
      ['fertile', PREMIUM2, rovně],
      ['navigable-river', { ...PLAIN, premium: 1 }, rovně],
    ];
    for (const [type, versions, slice] of cases) {
      expect(() => generateLandscapeAttempt(1, versions, type, slice), type).toThrow(RangeError);
      expect(() => generateAcceptedLandscape(1, versions, type, slice), type).toThrow(RangeError);
    }
  });
});
