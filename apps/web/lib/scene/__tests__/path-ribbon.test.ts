import { describe, expect, it } from 'vitest';
import type { PathLine } from '@bohemia/game';
import {
  CART_RUT_LAYER,
  CART_RUT_OFFSET_M,
  IMPROVED_EARTH_LAYER,
  IMPROVED_WORN_LAYER,
  JUNCTION,
  PATH_EARTH_LAYER,
  PATH_WORN_LAYER,
  ROAD_EARTH_LAYER,
  ROAD_WIDTH_M,
  ROAD_WORN_LAYER,
  pathRibbons,
  dayPathRibbons,
  dayPathTrack,
  ribbonJunctions,
  roadFade,
  type RibbonLayer,
} from '../path-ribbon';
import { roadBands, roadJunctions } from '../road-works-layout';

const line = (strength: number, open = true): PathLine => ({
  points: [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 30, z: 10 },
  ],
  strength: [strength, strength, strength],
  years: [10, 10, 10],
  openStart: open,
  openEnd: open,
});

/** Šířka průřezu `k` (vnější body 0 a 3). */
function width(grid: ReturnType<typeof pathRibbons>, k: number): number {
  const p = grid.positions;
  const a = k * 4;
  const b = k * 4 + 3;
  return Math.hypot(p[b * 2]! - p[a * 2]!, p[b * 2 + 1]! - p[a * 2 + 1]!);
}

describe('pathRibbons – pás pěšiny', () => {
  it('průřez ze čtyř bodů: měkké okraje průhledné, střed kryje', () => {
    const grid = pathRibbons([line(0.6)], PATH_WORN_LAYER);
    const sections = grid.alphas.length / 4;
    expect(sections).toBeGreaterThan(30);
    expect(grid.positions.length).toBe(grid.alphas.length * 2);
    expect(grid.indices.length).toBe((sections - 1) * 18);
    const mid = Math.floor(sections / 2) * 4;
    expect(grid.alphas[mid]).toBe(0);
    expect(grid.alphas[mid + 3]).toBe(0);
    expect(grid.alphas[mid + 1]).toBeGreaterThan(0.2);
  });

  it('volný konec se vytrácí, v rozcestí ne', () => {
    const open = pathRibbons([line(0.6, true)], PATH_WORN_LAYER);
    const joined = pathRibbons([line(0.6, false)], PATH_WORN_LAYER);
    expect(open.alphas[1]).toBe(0);
    expect(joined.alphas[1]).toBeGreaterThan(0.2);
  });

  it('silnější pěšina je širší a výraznější, holá hlína jen u silné', () => {
    const weak = pathRibbons([line(0.2)], PATH_WORN_LAYER);
    const strong = pathRibbons([line(1)], PATH_WORN_LAYER);
    const k = Math.floor(weak.alphas.length / 8);
    expect(width(strong, k)).toBeGreaterThan(width(weak, k));
    expect(strong.alphas[k * 4 + 1]).toBeGreaterThan(weak.alphas[k * 4 + 1]!);
    expect(Math.max(...pathRibbons([line(0.4)], PATH_EARTH_LAYER).alphas)).toBe(0);
    expect(Math.max(...pathRibbons([line(1)], PATH_EARTH_LAYER).alphas)).toBeGreaterThan(0.25);
  });

  it('stejná pěšina = stejný pás (vlnění ze souřadnic konců)', () => {
    expect(pathRibbons([line(0.6)], PATH_WORN_LAYER)).toEqual(
      pathRibbons([line(0.6)], PATH_WORN_LAYER),
    );
  });
});

describe('vzhled pěšin a cest (Martin, 19. 10. 2026)', () => {
  /** Největší krytí a šířka středu (bez měkkého okraje) vrstvy u síly `s`. */
  const look = (layer: RibbonLayer, s: number): { alpha: number; width: number } => ({
    alpha: layer.alpha(s),
    width: (layer.width.weak + (layer.width.strong - layer.width.weak) * s) * layer.widthFactor,
  });

  it('pěšina dne je nevýrazná – užší a průhlednější než pevná cesta i u nejsilnější', () => {
    for (const s of [0.2, 0.6, 1]) {
      expect(look(PATH_WORN_LAYER, s).alpha).toBeLessThanOrEqual(0.45 + 1e-9);
      expect(look(PATH_WORN_LAYER, s).alpha).toBeLessThan(look(ROAD_WORN_LAYER, 1).alpha / 2);
      expect(look(PATH_WORN_LAYER, s).width).toBeLessThan(look(ROAD_WORN_LAYER, 1).width * 0.7);
    }
    expect(PATH_WORN_LAYER.softM).toBeLessThan(ROAD_WORN_LAYER.softM);
    // holá hlína nanejvýš úzká a slabá i u silné pěšiny
    expect(look(PATH_EARTH_LAYER, 1).width).toBeLessThanOrEqual(0.4);
    expect(look(PATH_EARTH_LAYER, 1).alpha).toBeLessThanOrEqual(0.35 + 1e-9);
    expect(look(PATH_EARTH_LAYER, 0.4).alpha).toBe(0);
  });

  it('vyšlapaná cesta zůstává, jak byla (plný pás 1,9 m, hlína 55 %)', () => {
    expect(look(ROAD_WORN_LAYER, 1)).toEqual({ alpha: 0.95, width: 1.9 });
    expect(look(ROAD_EARTH_LAYER, 1).alpha).toBeCloseTo(0.95, 9);
    expect(look(ROAD_EARTH_LAYER, 1).width).toBeCloseTo(1.9 * 0.55, 9);
    expect([ROAD_WORN_LAYER.softM, ROAD_EARTH_LAYER.softM]).toEqual([0.6, 0.35]);
    expect(ROAD_WIDTH_M.trodden).toBe(1.9);
  });

  it('upravená cesta jsou tytéž obtisky, jen širší (bez strouhy)', () => {
    for (const [improved, trodden] of [
      [IMPROVED_WORN_LAYER, ROAD_WORN_LAYER],
      [IMPROVED_EARTH_LAYER, ROAD_EARTH_LAYER],
    ] as const) {
      expect(improved.alpha(1)).toBe(trodden.alpha(1));
      expect(improved.softM).toBe(trodden.softM);
      expect(improved.widthFactor).toBe(trodden.widthFactor);
      expect(improved.width).toEqual({
        weak: ROAD_WIDTH_M.improved,
        strong: ROAD_WIDTH_M.improved,
      });
    }
    expect(ROAD_WIDTH_M.improved).toBeGreaterThanOrEqual(ROAD_WIDTH_M.trodden * 1.5);
  });

  it('pěšiny dne nemají kruhové plácky – rozcestí jen ze sbíhajících se pásů', () => {
    const arms: PathLine[] = [
      [20, 0],
      [-20, 0],
      [0, 20],
    ].map(([x, z]) => ({
      points: [
        { x: 0, z: 0 },
        { x: x!, z: z! },
      ],
      strength: [1, 1],
      years: [5, 5],
      openStart: false,
      openEnd: true,
    }));
    const bare = pathRibbons(arms, PATH_WORN_LAYER, undefined, undefined, []);
    const day = dayPathRibbons(arms, PATH_WORN_LAYER);
    expect(day.alphas.length).toBe(bare.alphas.length);
    expect(day.indices.length).toBe(bare.indices.length);
    // s plácky by byl pás větší
    expect(pathRibbons(arms, PATH_WORN_LAYER).alphas.length).toBeGreaterThan(day.alphas.length);
    expect(dayPathTrack(arms, PATH_WORN_LAYER).discs).toEqual([]);
  });
});

describe('pevné cesty z dat (roads.md)', () => {
  const road = (id: number, points: { x: number; z: number }[]) => ({
    id,
    points,
    grade: 'trodden' as const,
  });
  const a = road(1, [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
  ]);
  const b = road(2, [
    { x: 40, z: 0 },
    { x: 40, z: 30 },
  ]);

  it('zarůstající cesta bledne: bledý kus má slabší krytí, plný kus 1 (paths.md – Zarůstání)', () => {
    const fading = {
      ...a,
      fade: [{ x: 30, z: 0, strength: 0.4 }],
    };
    const [line] = roadBands([fading]).trodden;
    const first = line!.strength[0]!;
    const last = line!.strength[line!.strength.length - 1]!;
    expect(first).toBe(1);
    expect(last).toBeCloseTo(0.4, 5);
  });

  it('cesta je plně vyšlapaná pěšina, volný konec se vytrácí, v rozcestí ne', () => {
    const [first, second] = roadBands([a, b]).trodden;
    expect(first!.points).toEqual(a.points);
    expect(first!.strength.every((s) => s === 1)).toBe(true);
    expect(first!.openStart).toBe(true);
    expect(first!.openEnd).toBe(false);
    expect(second!.openStart).toBe(false);
    expect(second!.openEnd).toBe(true);
    // stejná data = stejný pás (kreslí se stabilně, ne podle pěšin dne)
    expect(pathRibbons(roadBands([a, b]).trodden, ROAD_EARTH_LAYER)).toEqual(
      pathRibbons(roadBands([a, b]).trodden, ROAD_EARTH_LAYER),
    );
  });

  it('pěšina dne se u osy cesty ztrácí, dál od ní je plná', () => {
    expect(roadFade([])).toBeUndefined();
    const fade = roadFade([a, b])!;
    expect(fade(20, 0.5)).toBe(0);
    expect(fade(20, 2.3)).toBeGreaterThan(0);
    expect(fade(20, 2.3)).toBeLessThan(1);
    expect(fade(20, 10)).toBe(1);
    const along = pathRibbons([line(0.6)], PATH_WORN_LAYER, () => 1, fade);
    // pěšina po ose cesty (z = 0) až k x = 20 zmizí, za ohybem se objeví
    expect(along.alphas[1 + 4 * 5]).toBe(0);
    expect(Math.max(...along.alphas)).toBeGreaterThan(0.2);
  });

  it('pás se vytrácí jen na skutečném volném konci (brána, cíl), ne kde pokračuje pěšina dne', () => {
    // začátek u brány (volný), konec v louce, kde trasa pokračuje pěšinou dne
    const [band] = roadBands([{ ...a, openEnds: [true, false] }]).trodden;
    expect(band!.openStart).toBe(true);
    expect(band!.openEnd).toBe(false);
    // bez údaje jádra jako dřív – volný je každý konec, kde nekončí jiný úsek
    const [old] = roadBands([a]).trodden;
    expect([old!.openStart, old!.openEnd]).toEqual([true, true]);
    // rozcestí volné není, ani když o něm jádro tvrdí opak
    const [first] = roadBands([{ ...a, openEnds: [true, true] }, b]).trodden;
    expect(first!.openEnd).toBe(false);
  });

  it('za koncem cesty se pěšina dne neskrývá – navazuje na cestu bez mezery', () => {
    const fade = roadFade([a])!;
    // u osy uvnitř úseku skrytá, kousek za koncem (x = 41, 0) a před začátkem plná
    expect(fade(39.5, 0)).toBe(0);
    expect(fade(41, 0)).toBe(1);
    expect(fade(-1, 0.2)).toBe(1);
    // v rozcestí pokrývá druhý úsek
    const both = roadFade([a, b])!;
    expect(both(40, 1)).toBe(0);
  });
});

describe('rozcestí – udusaný plácek (Martin: „rozcestí by mělo být nejvyšlapanější plochou“)', () => {
  /** Čára z rozcestí v počátku do bodu (x, z) se silou `s`. */
  const arm = (x: number, z: number, s: number): PathLine => ({
    points: [
      { x: 0, z: 0 },
      { x, z },
    ],
    strength: [s, s],
    years: [5, 5],
    openStart: false,
    openEnd: true,
  });

  it('rozcestí je bod se třemi a více konci – síla nejsilnější + díl ostatních, nejvýš 1', () => {
    expect(ribbonJunctions([arm(20, 0, 0.5), arm(-20, 0, 0.5)])).toEqual([]);
    const [j] = ribbonJunctions([arm(20, 0, 0.5), arm(-20, 0, 0.3), arm(0, 20, 0.2)]);
    expect(j).toMatchObject({ x: 0, z: 0 });
    expect(j!.strength).toBeCloseTo(0.5 + JUNCTION.sumShare * 0.5, 9);
    const [full] = ribbonJunctions([arm(20, 0, 1), arm(-20, 0, 1), arm(0, 20, 1)]);
    expect(full!.strength).toBe(1);
  });

  it('plácek je kruh širší než nejsilnější pěšina – uvnitř kryje plně, okraj měkký', () => {
    const lines = [arm(20, 0, 0.6), arm(-20, 0, 0.4), arm(0, 20, 0.4)];
    // pevná cesta – plný plácek (pěšiny dne mají jen jemný – test výš)
    const plain = pathRibbons(lines, ROAD_WORN_LAYER, undefined, undefined, []);
    const grid = pathRibbons(lines, ROAD_WORN_LAYER);
    const first = plain.alphas.length;
    const added = grid.alphas.length - first;
    expect(added).toBe(1 + JUNCTION.segments * 2);
    const strength = ribbonJunctions(lines)[0]!.strength;
    // střed plácku – plné krytí podle síly plácku (víc než nejsilnější pěšina)
    expect(grid.alphas[first]).toBeCloseTo(ROAD_WORN_LAYER.alpha(strength), 6);
    expect(grid.alphas[first]!).toBeGreaterThan(ROAD_WORN_LAYER.alpha(0.6));
    const width =
      ROAD_WORN_LAYER.width.weak +
      (ROAD_WORN_LAYER.width.strong - ROAD_WORN_LAYER.width.weak) * strength;
    for (let k = 0; k < JUNCTION.segments; k++) {
      const v = first + 1 + k * 2;
      const r = Math.hypot(grid.positions[v * 2]!, grid.positions[v * 2 + 1]!);
      expect(r).toBeGreaterThan(width * JUNCTION.scale * (1 - JUNCTION.jitter) - 1e-5);
      expect(grid.alphas[v]).toBeCloseTo(grid.alphas[first]!, 9);
      expect(grid.alphas[v + 1]).toBe(0);
    }
    // průměr plácku víc než dvojnásobek šířky nejsilnější pěšiny (i s kolísáním okraje)
    expect(2 * width * JUNCTION.scale * (1 - JUNCTION.jitter)).toBeGreaterThan(
      2 *
        (ROAD_WORN_LAYER.width.weak +
          (ROAD_WORN_LAYER.width.strong - ROAD_WORN_LAYER.width.weak) * 0.6),
    );
  });

  it('pevné cesty: rozcestí tří úseků, u upravené cesty v pásu upravené', () => {
    const road = (id: number, x: number, z: number, grade: 'trodden' | 'improved' = 'trodden') => ({
      id,
      points: [
        { x: 0, z: 0 },
        { x, z },
      ],
      grade,
    });
    expect(roadJunctions([road(1, 30, 0), road(2, -30, 0)])).toEqual({
      trodden: [],
      improved: [],
      cart: [],
    });
    expect(roadJunctions([road(1, 30, 0), road(2, -30, 0), road(3, 0, 30)]).trodden).toEqual([
      { x: 0, z: 0, strength: 1 },
    ]);
    const mixed = roadJunctions([road(1, 30, 0, 'improved'), road(2, -30, 0), road(3, 0, 30)]);
    expect(mixed.improved).toHaveLength(1);
    expect(mixed.trodden).toEqual([]);
    // vozová cesta (wagons.md) – plácek na šířku vozové cesty
    const carts = roadJunctions([
      { ...road(1, 30, 0), cart: true as const },
      road(2, -30, 0),
      road(3, 0, 30),
    ]);
    expect(carts.cart).toHaveLength(1);
    expect(carts.trodden).toEqual([]);
  });

  it('vozová cesta: širší pás bez holé hlíny a dvě koleje po 0,65 m od osy (wagons.md)', () => {
    const cart = {
      id: 1,
      points: [
        { x: 0, z: 0 },
        { x: 40, z: 0 },
      ],
      grade: 'trodden' as const,
      cart: true as const,
    };
    const bands = roadBands([cart]);
    expect(bands.trodden).toEqual([]);
    expect(bands.cart).toHaveLength(1);
    expect(bands.ruts).toHaveLength(2);
    expect(bands.ruts.map((r) => r.points[0]!.z).sort()).toEqual([
      -CART_RUT_OFFSET_M,
      CART_RUT_OFFSET_M,
    ]);
    // koleje se nevlní – střed každého průřezu (4 body) leží na koleji
    const grid = pathRibbons([bands.ruts[0]!], CART_RUT_LAYER);
    const rutZ = bands.ruts[0]!.points[0]!.z;
    for (let k = 0; k < grid.positions.length; k += 8) {
      const mid = (grid.positions[k + 1]! + grid.positions[k + 7]!) / 2;
      expect(mid).toBeCloseTo(rutZ, 6);
    }
    // pěší cesta koleje nemá
    expect(roadBands([{ ...cart, cart: undefined }]).ruts).toEqual([]);
  });
});
