// Typy nalezišť (premium-landscapes.md – Typy krajin): stavební kámen (lom ve skalní stěně),
// hluboká ložiska drahých kovů (skalnatý hřbet s rudnými výchozy), bohatá železná ruda (rudiště)
// a dobrá keramická hlína (hliniště u potoka). Výšky, plochy a vzdálenosti z rozhodnutí úlohy
// (návrh Clauda) na přijatých krajinách proti průměrné krajině téhož seedu.
import { describe, expect, it } from 'vitest';
import { landscapeHash } from '../../__tests__/landscape-checks';
import { obstaclesOf } from '../../obstacles/generate';
import { obstacleKind } from '../../obstacles/query';
import { OBSTACLE_SOURCES, TREE_KINDS } from '../../obstacles/types';
import { buildRelief } from '../../relief';
import { streamCenterline } from '../../stream-geometry';
import { SURFACE_CODES, type Landscape } from '../../types';
import { heightAtWorld } from '../../world';
import type { PremiumSiteKind, PremiumType } from '../types';
import {
  forestShare,
  insidePolygon,
  landConnected,
  lineDistance,
  nearMeadow,
  onlySite,
  pairs,
  surfaceAtWorld,
  village,
} from './site-checks';

const SAMPLE = 10;
const OBSTACLE_SAMPLE = 4;
const TIMEOUT_MS = 120_000;
/** 2^22 – místo na zdroj v id překážky (`obstacleId`). */
const SOURCE_SHIFT = 4_194_304;

const lerp = (
  [ax, az]: readonly [number, number],
  [bx, bz]: readonly [number, number],
  t: number,
): [number, number] => [ax + (bx - ax) * t, az + (bz - az) * t];

/** Překážky vrstvy krajiny: zdroj (podle id), druh a poloha. */
function obstacles(l: Landscape): { source: number; kind: string; x: number; z: number }[] {
  const layer = obstaclesOf(l);
  return Array.from({ length: layer.count }, (_, i) => ({
    source: Math.floor(layer.id[i]! / SOURCE_SHIFT),
    kind: obstacleKind(layer, i),
    x: layer.x[i]!,
    z: layer.z[i]!,
  }));
}

describe('building-stone – lom ve skalní stěně', () => {
  it(
    'skalní stěna aspoň 10 m vysoká a strmá, čelem ke vsi',
    () => {
      for (const { premium } of pairs('building-stone', SAMPLE)) {
        const quarry = onlySite(premium, 'quarry');
        // Obrys: hrana stěny (rohy 0 a 3) a úpatí se sutí (rohy 1 a 2).
        const [b0, f0, f1, b1] = quarry.outline! as [number, number][];
        const drops: number[] = [];
        for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
          const back = lerp(b0!, b1!, t);
          const front = lerp(f0!, f1!, t);
          drops.push(heightAtWorld(premium, ...back) - heightAtWorld(premium, ...front));
        }
        const mean = drops.reduce((a, b) => a + b, 0) / drops.length;
        expect(mean).toBeGreaterThanOrEqual(10);
        expect(Math.min(...drops)).toBeGreaterThanOrEqual(6);
        // Čelo míří ke vsi – úpatí je vsi blíž než hrana.
        const c = village(premium);
        const middle = lerp(b0!, b1!, 0.5);
        const foot = lerp(f0!, f1!, 0.5);
        expect(Math.hypot(foot[0] - c.x, foot[1] - c.z)).toBeLessThan(
          Math.hypot(middle[0] - c.x, middle[1] - c.z),
        );
      }
    },
    TIMEOUT_MS,
  );

  it(
    'na čele stěny jsou skalní výchozy a suť, stromy na něm nerostou',
    () => {
      for (const { premium, average } of pairs('building-stone', OBSTACLE_SAMPLE)) {
        const outline = onlySite(premium, 'quarry').outline!;
        const inside = obstacles(premium).filter((o) => insidePolygon(outline, o.x, o.z));
        const rocks = inside.filter((o) => o.source === OBSTACLE_SOURCES.quarryRock);
        expect(rocks.filter((o) => o.kind === 'outcrop').length).toBeGreaterThanOrEqual(20);
        expect(rocks.some((o) => o.kind === 'boulder' || o.kind === 'stone')).toBe(true);
        expect(inside.filter((o) => TREE_KINDS.includes(o.kind as never))).toHaveLength(0);
        // Průměrná krajina lom nemá.
        expect(obstacles(average).some((o) => o.source === OBSTACLE_SOURCES.quarryRock)).toBe(
          false,
        );
      }
    },
    TIMEOUT_MS,
  );

  it(
    'lom nechá místo vsi, louky a les u vsi jako v průměrné krajině',
    () => {
      for (const { premium, average } of pairs('building-stone', SAMPLE)) {
        expect(premium.villageSite).toEqual(average.villageSite);
        expect(nearMeadow(premium)).toBeGreaterThanOrEqual(0.99 * nearMeadow(average));
        expect(Math.abs(forestShare(premium) - forestShare(average))).toBeLessThanOrEqual(0.01);
        expect(premium.stream).toEqual(average.stream);
      }
    },
    TIMEOUT_MS,
  );
});

describe('deep-gold – skalnatý hřbet s rudnými výchozy', () => {
  it(
    'naleziště leží na skalnatém hřbetu aspoň 18 m nad úpatím',
    () => {
      for (const { premium } of pairs('deep-gold', SAMPLE)) {
        const deposit = onlySite(premium, 'deposit');
        const [a, b] = deposit.line! as [[number, number], [number, number]];
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThanOrEqual(250);
        // Kolmo k žíle 90 m na obě strany je úpatí.
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = -(b[1] - a[1]) / length;
        const nz = (b[0] - a[0]) / length;
        const crest = heightAtWorld(premium, deposit.x, deposit.z);
        const foot =
          (heightAtWorld(premium, deposit.x + nx * 90, deposit.z + nz * 90) +
            heightAtWorld(premium, deposit.x - nx * 90, deposit.z - nz * 90)) /
          2;
        expect(crest - foot).toBeGreaterThanOrEqual(18);
        // Hřbet je skalnatý – podél žíly vystupuje skála (sklon nebo ostrý hřbet).
        const relief = buildRelief(premium);
        let rocky = 0;
        for (let t = 0.1; t <= 0.9; t += 0.1) rocky += relief.rockinessAt(...lerp(a, b, t));
        expect(rocky / 9).toBeGreaterThanOrEqual(0.5);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'podél žíly jsou rudné výchozy, stromy na hřebeni nerostou',
    () => {
      for (const { premium, average } of pairs('deep-gold', OBSTACLE_SAMPLE)) {
        const deposit = onlySite(premium, 'deposit');
        const line = deposit.line!;
        const all = obstacles(premium);
        const ore = all.filter(
          (o) =>
            o.source === OBSTACLE_SOURCES.oreRock &&
            o.kind === 'outcrop' &&
            lineDistance(line, o.x, o.z) <= 10,
        );
        expect(ore.length).toBeGreaterThanOrEqual(15);
        const trees = all.filter(
          (o) => TREE_KINDS.includes(o.kind as never) && lineDistance(line, o.x, o.z) <= 8,
        );
        expect(trees).toHaveLength(0);
        expect(insidePolygon(deposit.outline!, deposit.x, deposit.z)).toBe(true);
        expect(obstacles(average).some((o) => o.source === OBSTACLE_SOURCES.oreRock)).toBe(false);
      }
    },
    TIMEOUT_MS,
  );

  it(
    'hřbet nechá místo vsi, louky a les u vsi jako v průměrné krajině',
    () => {
      for (const { premium, average } of pairs('deep-gold', SAMPLE)) {
        expect(premium.villageSite).toEqual(average.villageSite);
        expect(nearMeadow(premium)).toBeGreaterThanOrEqual(0.99 * nearMeadow(average));
        expect(Math.abs(forestShare(premium) - forestShare(average))).toBeLessThanOrEqual(0.01);
        expect(premium.stream).toEqual(average.stream);
      }
    },
    TIMEOUT_MS,
  );
});

const BANK_TYPES: readonly {
  type: PremiumType;
  kind: PremiumSiteKind;
  name: string;
  bankM: number;
}[] = [
  { type: 'iron-ore', kind: 'iron-ore', name: 'rudiště s bohatou rudou', bankM: 12 },
  { type: 'fine-clay', kind: 'clay', name: 'hliniště', bankM: 9 },
];

for (const { type, kind, name, bankM } of BANK_TYPES) {
  describe(`${type} – ${name} u potoka`, () => {
    it(
      `${name} do 500 m od vsi, na louce u potoka a ze vsi po souši`,
      () => {
        for (const { premium } of pairs(type, SAMPLE)) {
          const site = onlySite(premium, kind);
          const c = village(premium);
          for (const [x, z] of site.outline!) {
            expect(Math.hypot(x - c.x, z - c.z)).toBeLessThanOrEqual(500);
          }
          expect(surfaceAtWorld(premium, site.x, site.z)).toBe(SURFACE_CODES.meadow);
          const bank = streamCenterline(premium).nearest(site.x, site.z).bankDistance;
          expect(bank).toBeGreaterThan(0);
          expect(bank).toBeLessThanOrEqual(bankM);
          expect(landConnected(premium, c, site)).toBe(true);
        }
      },
      TIMEOUT_MS,
    );

    it(
      'krajina zůstane průměrná – jen místo naleziště',
      () => {
        for (const { premium, average } of pairs(type, SAMPLE)) {
          expect(landscapeHash(premium)).toBe(landscapeHash(average));
        }
        const { premium, average } = pairs(type, 1)[0]!;
        expect(obstaclesOf(premium).id).toEqual(obstaclesOf(average).id);
      },
      TIMEOUT_MS,
    );
  });
}
