import { describe, expect, it } from 'vitest';
import type { PathLine } from '@bohemia/game';
import type { SceneFieldPart, SceneRoad } from '../../village-view';
import { TRACK_DETAIL, fieldBlockContent } from '../field-blocks';
import { raggedCoverage } from '../field-crops';
import type { PartView } from '../field-look';
import {
  PATH_WORN_LAYER,
  ROAD_WIDTH_M,
  ROAD_WORN_LAYER,
  pathRibbons,
  ribbonSections,
  ribbonTrack,
} from '../path-ribbon';
import { roadTrack } from '../road-works-layout';
import { trackMask, type Track } from '../track-mask';

// Pod cestou obilí neroste (fields.md – Co hráč vidí; Martin, 19. 10. 2026: „Vzrostlé obilí
// přerůstá cestu. Tam, kde je cesta, prostě obilí neroste.“).

const straight = (from: number, to: number, z = 50): PathLine => ({
  points: [
    { x: from, z },
    { x: to, z },
  ],
  strength: [1, 1],
  years: [0, 0],
  openStart: false,
  openEnd: false,
});

/** Ruční pás: jedna úsečka podél osy x se stálou šířkou. */
function segmentTrack(half: number, depth = 1): Track {
  return {
    segments: [
      {
        line: 0,
        ax: 0,
        az: 0,
        bx: 20,
        bz: 0,
        halfA: half,
        halfB: half,
        depthA: depth,
        depthB: depth,
      },
    ],
    discs: [],
  };
}

describe('maska pásu', () => {
  it('v pásu 0, za okrajem plynule zpět k 1, dál od pásu 1', () => {
    const mask = trackMask([{ track: segmentTrack(1), softM: 0.8 }])!;
    expect(mask.at(10, 0)).toBe(0);
    expect(mask.at(10, 0.99)).toBe(0);
    expect(mask.at(10, 1.4)).toBeCloseTo(0.5, 9);
    expect(mask.at(10, -1.4)).toBeCloseTo(0.5, 9);
    expect(mask.at(10, 1.8)).toBe(1);
    expect(mask.at(10, 30)).toBe(1);
    // za koncem úsečky kulatě
    expect(mask.at(-0.5, 0)).toBe(0);
    expect(mask.at(-1.4, 0)).toBeCloseTo(0.5, 9);
  });

  it('mělký pás (vytrácející se konec) masku jen zeslabí; plácek rozcestí je kruh', () => {
    const shallow = trackMask([{ track: segmentTrack(1, 0.4), softM: 0.8 }])!;
    expect(shallow.at(10, 0)).toBeCloseTo(0.6, 9);
    const disc = trackMask([
      { track: { segments: [], discs: [{ line: 0, x: 5, z: 5, radius: 2, depth: 1 }] }, softM: 1 },
    ])!;
    expect(disc.at(5, 6.9)).toBe(0);
    expect(disc.at(5, 7.5)).toBeCloseTo(0.5, 9);
    expect(disc.at(8.5, 5)).toBe(1);
  });

  it('bez pásů null; rejstřík po přihrádkách dá totéž co průchod všemi kusy', () => {
    expect(trackMask([])).toBeNull();
    expect(trackMask([{ track: { segments: [], discs: [] }, softM: 1 }])).toBeNull();
    const track = ribbonTrack(
      [straight(0, 60, 10), straight(30, 31, 80), { ...straight(-5, 45, 33), strength: [0.3, 1] }],
      ROAD_WORN_LAYER,
    );
    const mask = trackMask([{ track, softM: 0.8 }])!;
    const single = track.segments.map((segment) =>
      trackMask([{ track: { segments: [segment], discs: [] }, softM: 0.8 }])!,
    );
    for (let x = -10; x <= 70; x += 1.37) {
      for (let z = 0; z <= 45; z += 0.71) {
        const brute = Math.min(1, ...single.map((m) => m.at(x, z)));
        expect(mask.at(x, z)).toBeCloseTo(brute, 12);
      }
    }
  });

  it('klíč bloku jen z pásů v něm – změna vzdálené čáry blok nepřestaví', () => {
    const near = straight(0, 40, 10);
    const far = straight(0, 40, 200);
    const block = { minX: 0, maxX: 30, minZ: 0, maxZ: 30 };
    const before = trackMask([{ track: ribbonTrack([near, far], ROAD_WORN_LAYER), softM: 0.8 }])!;
    const moved = trackMask([
      { track: ribbonTrack([near, straight(0, 40, 210)], ROAD_WORN_LAYER), softM: 0.8 },
    ])!;
    expect(before.near(block)).toBe(true);
    expect(before.keyNear(block)).not.toBe('');
    expect(moved.keyNear(block)).toBe(before.keyNear(block));
    // pořadí čar (síť pěšin je může přeházet) klíč nemění
    const swapped = trackMask([{ track: ribbonTrack([far, near], ROAD_WORN_LAYER), softM: 0.8 }])!;
    expect(swapped.keyNear(block)).toBe(before.keyNear(block));
    // posunutá čára v bloku ano
    const shifted = trackMask([
      { track: ribbonTrack([straight(0, 40, 12), far], ROAD_WORN_LAYER), softM: 0.8 },
    ])!;
    expect(shifted.keyNear(block)).not.toBe(before.keyNear(block));
    expect(before.near({ minX: 0, maxX: 30, minZ: 100, maxZ: 130 })).toBe(false);
    expect(before.keyNear({ minX: 0, maxX: 30, minZ: 100, maxZ: 130 })).toBe('');
  });
});

describe('pás z obtisku cesty a pěšiny', () => {
  it('úsečky pásu jdou po průřezech obtisku (vlnění i šířka jako obtisk)', () => {
    const line: PathLine = {
      points: [
        { x: 0, z: 0 },
        { x: 20, z: 6 },
        { x: 40, z: 0 },
      ],
      strength: [0.6, 1, 0.8],
      years: [0, 0, 0],
      openStart: false,
      openEnd: true,
    };
    const sections = ribbonSections(
      line,
      PATH_WORN_LAYER,
      () => 1,
      () => 1,
    );
    const track = ribbonTrack(
      [line],
      PATH_WORN_LAYER,
      () => 1,
      () => 1,
      [],
    );
    expect(track.segments).toHaveLength(sections.length - 1);
    // obtisk: čtyři body průřezu, střed mezi vnitřními body
    const ribbon = pathRibbons(
      [line],
      PATH_WORN_LAYER,
      () => 1,
      () => 1,
      [],
    );
    sections.forEach((s, k) => {
      const left = ribbon.positions[k * 8 + 2]!;
      const right = ribbon.positions[k * 8 + 4]!;
      expect((left + right) / 2).toBeCloseTo(s.cx, 4);
    });
    // volný konec se vytrácí – maska na konci mělčí
    expect(track.segments.at(-1)!.depthB).toBe(0);
    expect(track.segments[0]!.depthA).toBe(1);
  });

  it('pevná cesta: pás v šířce vyšlapané cesty, upravená širší, plácek v rozcestí', () => {
    const road = (id: number, points: { x: number; z: number }[], grade = 'trodden'): SceneRoad =>
      ({ id, points, grade }) as SceneRoad;
    const track = roadTrack(
      [
        road(1, [
          { x: 0, z: 0 },
          { x: 30, z: 0 },
        ]),
        road(2, [
          { x: 30, z: 0 },
          { x: 60, z: 0 },
        ]),
        road(
          3,
          [
            { x: 30, z: 0 },
            { x: 30, z: 30 },
          ],
          'improved',
        ),
      ],
      [
        {
          id: 9,
          x: 30,
          z: 0,
          shape: 'y',
          rotation: 0,
          spread: Math.PI / 4,
          arms: [2, 3, 1],
          landmark: { kind: 'tree', x: 34, z: 4, turn: 0, look: 1 },
          bornDay: 0,
        },
      ],
    );
    const halves = track.segments.map((s) => s.halfA);
    expect(Math.min(...halves)).toBeGreaterThan((ROAD_WIDTH_M.trodden / 2) * 0.8);
    expect(Math.max(...halves)).toBeGreaterThan((ROAD_WIDTH_M.improved / 2) * 0.8);
    expect(track.discs).toHaveLength(1);
    const mask = trackMask([{ track, softM: 0.8 }])!;
    expect(mask.at(15, 0)).toBe(0);
    expect(mask.at(30, 15)).toBe(0);
    expect(mask.at(15, 5)).toBe(1);
  });
});

describe('pole pod cestou', () => {
  const part = (cx: number, cy: number): SceneFieldPart => ({
    id: cx * 100 + cy,
    cell: { x: cx, y: cy },
    x: cx * 15 + 7.5,
    z: cy * 15 + 7.5,
    size: 15,
    stage: 'sown',
  });
  const views: PartView[] = [];
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      views.push({
        part: part(cx, cy),
        look: 'ripe',
        work: null,
        before: null,
        staked: false,
        order: views.length,
      });
    }
  }
  const rows: [number, number] = [1, 0];
  const center = { x: -20, z: -20 };
  const ragged = raggedCoverage(
    views.map((v) => v.part),
    1.6,
  );
  // cesta napříč polem v z = 30 (přes druhou řadu dílů)
  const track = ribbonTrack([straight(-10, 70, 30)], ROAD_WORN_LAYER);
  const mask = trackMask([{ track, softM: 0.8 }])!;
  const masked = fieldBlockContent(
    views,
    rows,
    center,
    (x, z) => ragged(x, z) * mask.at(x, z),
    (b) => mask.near(b),
  );
  const plain = fieldBlockContent(views, rows, center, ragged);

  it('pod cestou nestojí trsy obilí a koruna je pod zemí', () => {
    const crops = [...masked.plants.values()].flatMap((p) => Object.values(p.crops).flat());
    expect(crops.length).toBeGreaterThan(1000);
    for (const c of crops) expect(mask.at(c.x, c.z)).toBeGreaterThan(0.1);
    const plainCrops = [...plain.plants.values()].flatMap((p) => Object.values(p.crops).flat());
    expect(plainCrops.some((c) => Math.abs(c.z - 30) < 0.5)).toBe(true);
    const { positions, offsets } = masked.canopy;
    let under = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (mask.at(positions[i * 2]!, positions[i * 2 + 1]!) <= 0) {
        under++;
        expect(offsets[i]!).toBeLessThanOrEqual(0);
      }
    }
    expect(under).toBeGreaterThan(0);
  });

  it('jemnější síť jen u kusů, přes které vede cesta', () => {
    const vertices = (c: typeof masked): number => c.canopy.offsets.length;
    // 8 dílů pod cestou (dvě řady, jejichž kraj cesta zasahuje) – víc bodů, ostatní stejně
    expect(vertices(masked)).toBeGreaterThan(vertices(plain));
    expect(vertices(masked)).toBeLessThan(
      vertices(plain) * TRACK_DETAIL.canopy * TRACK_DETAIL.canopy,
    );
    // díly mimo cestu mají stejné rostliny jako bez masky
    for (const [cell, plants] of plain.plants) {
      const [, cy] = cell.split(',').map(Number);
      if (cy === 0 || cy === 3) expect(masked.plants.get(cell)).toEqual(plants);
    }
  });
});

describe('maska pásů – rychlý výpočet = přímý', () => {
  /** Přímo podle definice: nejmenší maska přes všechny kusy (Math.hypot, bez rejstříku). */
  function reference(track: Track, softM: number, x: number, z: number): number {
    let mask = 1;
    const piece = (distance: number, half: number, depth: number): void => {
      if (depth <= 0) return;
      const ramp = Math.min(1, Math.max(0, (distance - half) / softM));
      mask = Math.min(mask, 1 - depth * (1 - ramp));
    };
    for (const s of track.segments) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
      piece(
        Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t)),
        s.halfA + (s.halfB - s.halfA) * t,
        s.depthA + (s.depthB - s.depthA) * t,
      );
    }
    for (const d of track.discs) piece(Math.hypot(x - d.x, z - d.z), d.radius, d.depth);
    return mask;
  }

  it('bit po bitu jako přímý výpočet (pěšiny s rozcestím, body i těsně u okraje)', () => {
    const lines: PathLine[] = [
      straight(-30, 40, 10),
      {
        points: [
          { x: 0, z: -20 },
          { x: 7, z: 3 },
          { x: 12, z: 30 },
        ],
        strength: [0.4, 1, 0.7],
        years: [0, 0, 0],
        openStart: false,
        openEnd: true,
      },
    ];
    const track = ribbonTrack(lines, PATH_WORN_LAYER);
    const mask = trackMask([{ track, softM: 0.5 }])!;
    let edge = 0;
    for (let i = 0; i < 20_000; i++) {
      const x = -35 + ((i * 7.31) % 80);
      const z = -25 + ((i * 3.17) % 60);
      const value = mask.at(x, z);
      expect(value).toBe(reference(track, 0.5, x, z));
      if (value > 0 && value < 1) edge++;
    }
    expect(edge).toBeGreaterThan(100);
  });
});
