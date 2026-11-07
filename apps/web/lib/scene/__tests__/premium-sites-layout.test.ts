import { describe, expect, it } from 'vitest';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  OBSTACLE_SOURCES,
  obstacleId,
  premiumFeaturesOf,
  PREMIUM_TYPES,
  SURFACE_CODES,
  type Landscape,
  type PremiumType,
} from '@bohemia/game';
import { HEIGHT_SCALE } from '../constants';
import { terrainMeshHeight } from '../drape';
import {
  awayFromWater,
  beeYard,
  premiumDecals,
  premiumDecor,
  premiumFocus,
  premiumMeadow,
  premiumProps,
  premiumRockTint,
  villageCenter,
  wallows,
} from '../premium-sites-layout';
import { buildRenderSurface, type RenderSurface } from '../render-surface';
import { pointInPolygon, type Point } from '../village-layout';

const SEED = 42;
const cache = new Map<string, { l: Landscape; surface: RenderSurface }>();
/** Krajina typu (null = průměrná) s výškovou sítí scény – z mezipaměti testu. */
function scene(type: PremiumType | null): { l: Landscape; surface: RenderSurface } {
  const key = type ?? 'average';
  let hit = cache.get(key);
  if (!hit) {
    const l = generateLandscape(SEED, CURRENT_LAYER_VERSIONS, type ?? undefined);
    hit = { l, surface: buildRenderSurface(l) };
    cache.set(key, hit);
  }
  return hit;
}
const heightOf =
  (surface: RenderSurface) =>
  (x: number, z: number): number =>
    terrainMeshHeight(surface, x, z);

function surfaceAt(l: Landscape, x: number, z: number): number {
  const half = (l.size * l.cellSizeM) / 2;
  const tx = Math.floor((x + half) / l.cellSizeM);
  const tz = Math.floor((z + half) / l.cellSizeM);
  return l.surface[tz * l.size + tx]!;
}

describe('prvky prémiové krajiny ve scéně – průměrná krajina nic nemá', () => {
  it('bez prvků žádné obtisky, dřevo, ozdoby, úprava louky ani zaměření kamery', () => {
    const { l, surface } = scene(null);
    const features = premiumFeaturesOf(l);
    expect(features).toBeNull();
    expect(premiumDecals(l, features, heightOf(surface), surface.stream)).toEqual([]);
    const props = premiumProps(l, features, heightOf(surface), surface.stream, HEIGHT_SCALE);
    expect(props.wood.indices).toHaveLength(0);
    expect(props.pools.indices).toHaveLength(0);
    expect(premiumDecor(l, features, surface.stream)).toEqual([]);
    expect(premiumMeadow(l, features)).toBeNull();
    expect(premiumFocus(l, features)).toBeNull();
  });
});

describe('zaměření kamery na prvek typu', () => {
  it.each(PREMIUM_TYPES)('%s: bod na mapě, přiblížení v mezích kamery', (type) => {
    const { l } = scene(type);
    const focus = premiumFocus(l, premiumFeaturesOf(l))!;
    const half = (l.size * l.cellSizeM) / 2;
    expect(Math.abs(focus.x)).toBeLessThan(half);
    expect(Math.abs(focus.z)).toBeLessThan(half);
    expect(focus.radiusM).toBeGreaterThanOrEqual(50);
    expect(focus.radiusM).toBeLessThanOrEqual(1400);
  });

  it('kamera se k vzdálenému prvku dívá od vsi (průsmyk), u vsi bez natočení', () => {
    const pass = scene('mountain-pass').l;
    const focus = premiumFocus(pass, premiumFeaturesOf(pass))!;
    const v = villageCenter(pass);
    // kamera leží od cíle ve směru (cos alpha, sin alpha) – ke vsi
    const toVillage = Math.atan2(v.z - focus.z, v.x - focus.x);
    expect(focus.alpha).toBeCloseTo(toVillage, 6);
    const fertile = scene('fertile').l;
    expect(premiumFocus(fertile, premiumFeaturesOf(fertile))!.alpha).toBeUndefined();
  });
});

describe('obtisky prvků', () => {
  const names = (type: PremiumType): string[] => {
    const { l, surface } = scene(type);
    return premiumDecals(l, premiumFeaturesOf(l), heightOf(surface), surface.stream).map(
      (d) => d.name,
    );
  };

  it('každý druh má svůj obtisk – náplavy, rudiště, hliniště, slanisko, lom, žíla, stezka', () => {
    expect(names('gold-stream').filter((n) => n === 'premium-placer')).toHaveLength(
      premiumFeaturesOf(scene('gold-stream').l)!.sites.length,
    );
    expect(names('iron-ore')).toEqual(['premium-ore-bog']);
    expect(names('fine-clay')).toEqual(['premium-clay']);
    expect(names('salt-spring')).toEqual(['premium-salt']);
    expect(names('building-stone')).toEqual(['premium-scree']);
    expect(names('deep-gold')).toEqual(['premium-gossan']);
    expect(names('sacred-spring')).toEqual(['premium-rivulet']);
    expect(names('navigable-river')).toEqual(['premium-landing']);
    for (const type of ['ford-hill', 'mountain-pass'] as const) {
      expect(names(type)).toEqual(
        expect.arrayContaining(['premium-route-worn', 'premium-route-earth']),
      );
    }
    expect(names('game-furs')).toEqual(
      expect.arrayContaining(['premium-game-trails', 'premium-wallow']),
    );
    expect(names('wild-bees')).toContain('premium-bee-yard');
  });

  it('obtisk má síť a krytí 0–1 (měkký okraj, skvrny)', () => {
    const { l, surface } = scene('iron-ore');
    const [decal] = premiumDecals(l, premiumFeaturesOf(l), heightOf(surface), surface.stream);
    expect(decal!.grid.indices.length).toBeGreaterThan(0);
    const alphas = [...decal!.grid.alphas];
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(1);
    expect(Math.max(...alphas)).toBeGreaterThan(0.9);
  });

  it('slanisko leží ve scéně na břehu – aspoň 9 m od okraje vody (vyhlazené koryto)', () => {
    const { l, surface } = scene('salt-spring');
    const salt = premiumFeaturesOf(l)!.sites.find((s) => s.kind === 'salt')!;
    const at = awayFromWater(surface.stream, salt, 9);
    expect(surface.stream.nearest(at.x, at.z, 60).bankDistance).toBeGreaterThanOrEqual(9);
    expect(Math.hypot(at.x - salt.x, at.z - salt.z)).toBeLessThanOrEqual(25);
  });

  it('kaliště honitby leží na břehu, ne ve vodě', () => {
    const { l, surface } = scene('game-furs');
    const site = premiumFeaturesOf(l)!.sites.find((s) => s.kind === 'hunting-ground')!;
    const spots = wallows(site, surface.stream);
    expect(spots.length).toBeGreaterThan(0);
    for (const w of spots) {
      expect(surface.stream.nearest(w.x, w.z, 60).bankDistance).toBeGreaterThan(3);
    }
  });
});

describe('dřevo a tůňky', () => {
  it('přístaviště: molo z prken nad hladinou řeky a člun na břehu', () => {
    const { l, surface } = scene('navigable-river');
    const props = premiumProps(
      l,
      premiumFeaturesOf(l),
      heightOf(surface),
      surface.stream,
      HEIGHT_SCALE,
    );
    expect(props.wood.indices.length).toBeGreaterThan(0);
    const port = premiumFeaturesOf(l)!.sites.find((s) => s.kind === 'port')!;
    // nejvyšší bod dřeva u přístaviště – prkna mola kousek nad hladinou, ne metry nad ní
    let top = -Infinity;
    for (let i = 0; i < props.wood.positions.length; i += 3) {
      const x = props.wood.positions[i]!;
      const z = props.wood.positions[i + 2]!;
      if (Math.hypot(x - port.x, z - port.z) < 20)
        top = Math.max(top, props.wood.positions[i + 1]!);
    }
    const level = surface.stream.nearest(port.x, port.z, 60).level * HEIGHT_SCALE;
    expect(top).toBeGreaterThan(level);
    expect(top).toBeLessThan(level + 2);
  });

  it('brod: kůly na obou březích, ne ve vodě', () => {
    const { l, surface } = scene('ford-hill');
    const props = premiumProps(
      l,
      premiumFeaturesOf(l),
      heightOf(surface),
      surface.stream,
      HEIGHT_SCALE,
    );
    expect(props.wood.indices.length).toBeGreaterThan(0);
    const ford = premiumFeaturesOf(l)!.sites.find((s) => s.kind === 'ford')!;
    // spodky kůlů (válce od země) leží na suchu
    const bases: Point[] = [];
    for (let i = 0; i < props.wood.positions.length; i += 6) {
      bases.push([props.wood.positions[i]!, props.wood.positions[i + 2]!]);
    }
    const near = bases.filter(([x, z]) => Math.hypot(x - ford.x, z - ford.z) < 80);
    expect(near.length).toBeGreaterThan(0);
    for (const [x, z] of near) {
      expect(surface.stream.nearest(x, z, 60).bankDistance).toBeGreaterThan(0.5);
    }
  });

  it('brtě: úly na okraji lesa ke vsi (louka), ne pod korunami', () => {
    const { l } = scene('wild-bees');
    const village = villageCenter(l);
    const sites = premiumFeaturesOf(l)!.sites;
    let yards = 0;
    for (const site of sites) {
      const yard = beeYard(l, site, village);
      if (!yard) continue;
      yards++;
      expect(surfaceAt(l, yard.x, yard.z)).not.toBe(SURFACE_CODES.forest);
      expect(Math.hypot(yard.x - site.x, yard.z - site.z)).toBeLessThan(210);
    }
    expect(yards).toBeGreaterThan(sites.length / 2);
  });

  it('pramen a solanka mají tůňku, rudiště rezavé louže', () => {
    for (const type of ['sacred-spring', 'salt-spring', 'iron-ore'] as const) {
      const { l, surface } = scene(type);
      const props = premiumProps(
        l,
        premiumFeaturesOf(l),
        heightOf(surface),
        surface.stream,
        HEIGHT_SCALE,
      );
      expect(props.pools.indices.length).toBeGreaterThan(0);
    }
  });
});

describe('ozdoby prvků z modelů krajiny', () => {
  it('kamenný kruh na plošině posvátné hory, mohyla v sedle – vlastní skupina bez id', () => {
    const mountain = scene('sacred-mountain');
    const summit = premiumFeaturesOf(mountain.l)!.sites[0]!;
    const circle = premiumDecor(mountain.l, premiumFeaturesOf(mountain.l), mountain.surface.stream);
    expect(circle.filter((p) => p.model === 'rock-tower')).toHaveLength(9);
    const outline = summit.outline!.map(([x, z]): Point => [x, z]);
    for (const p of circle) {
      expect(p.group).toBe('site');
      expect(p.id).toBeUndefined();
      expect(pointInPolygon(outline, p.worldX, p.worldZ)).toBe(true);
    }
    const pass = scene('mountain-pass');
    const cairn = premiumDecor(pass.l, premiumFeaturesOf(pass.l), pass.surface.stream);
    expect(cairn.length).toBeGreaterThan(10);
    expect(cairn.every((p) => p.group === 'site')).toBe(true);
  });

  it('rákosí mokřadu honitby na suchu u vody', () => {
    const { l, surface } = scene('game-furs');
    const marsh = premiumDecor(l, premiumFeaturesOf(l), surface.stream);
    expect(marsh.length).toBeGreaterThan(20);
    for (const p of marsh) {
      expect(['reeds', 'cattails']).toContain(p.model);
      expect(surface.stream.nearest(p.worldX, p.worldZ, 60).bankDistance).toBeGreaterThanOrEqual(1);
    }
  });

  it('odstín skal: rudné výchozy a vápenec lomu podle zdroje překážky, ostatní ne', () => {
    expect(premiumRockTint(obstacleId('oreRock', 3, 1))).toBe('ore');
    expect(premiumRockTint(obstacleId('quarryRock', 7, 0))).toBe('limestone');
    expect(premiumRockTint(obstacleId('outcrop', 7, 0))).toBeNull();
    expect(premiumRockTint(undefined)).toBeNull();
    expect(OBSTACLE_SOURCES.oreRock).not.toBe(OBSTACLE_SOURCES.quarryRock);
  });
});

describe('louky prémiových krajin', () => {
  it('úrodná krajina: svěží louky u vsi, za kruhem prvku beze změny', () => {
    const { l } = scene('fertile');
    const tweak = premiumMeadow(l, premiumFeaturesOf(l))!;
    const v = villageCenter(l);
    expect(tweak(v.x, v.z).lush).toBe(1);
    expect(tweak(v.x + 900, v.z).lush).toBe(0);
    expect(tweak(v.x, v.z).warm).toBe(0);
  });

  it('niva: svěží louky u vody, daleko od vody ne; jižní svahy teplé na svahu', () => {
    const flood = scene('floodplain').l;
    const tweak = premiumMeadow(flood, premiumFeaturesOf(flood))!;
    const meadow = premiumFeaturesOf(flood)!.sites[0]!;
    expect(tweak(meadow.x, meadow.z).lush).toBe(1);
    const slopes = scene('south-slopes').l;
    const slope = premiumFeaturesOf(slopes)!.sites[0]!;
    const warm = premiumMeadow(slopes, premiumFeaturesOf(slopes))!;
    expect(warm(slope.x, slope.z).warm).toBeGreaterThan(0.5);
    expect(warm(slope.x + 1500, slope.z + 1500).warm).toBe(0);
  });

  it('ostatní typy louky nemění', () => {
    for (const type of ['deep-gold', 'navigable-river', 'wild-bees'] as const) {
      const { l } = scene(type);
      expect(premiumMeadow(l, premiumFeaturesOf(l))).toBeNull();
    }
  });
});
