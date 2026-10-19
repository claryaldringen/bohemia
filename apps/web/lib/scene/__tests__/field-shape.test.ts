import { describe, expect, it } from 'vitest';
import type { SceneFieldPart } from '../../village-view';
import { CANOPY_M, canopyHeight, fieldCanopy, type CanopyMesh } from '../field-canopy';
import { cellsCoverage, outerCorners, type CellSquare } from '../field-cells';
import { fieldPlants } from '../field-crops';
import type { FieldLook, PartView } from '../field-look';
import { PLOUGH_CORNER_M } from '../plough-team';

// Tvar pole (Martin, 19. 10. 2026): kulaté vnější rohy pole oraného rádlem (oxen.md) a vystouplé
// zelené a zralé obilí (fields.md – Co hráč vidí).

const CELL = 15;
const SOFT = 1.6;
const square = (x: number, y: number, extra: Partial<SceneFieldPart> = {}): SceneFieldPart => ({
  cell: { x, y },
  x: x * CELL + CELL / 2,
  z: y * CELL + CELL / 2,
  size: CELL,
  stage: 'sown',
  ...extra,
});
/** Pole 2 × 2 čtverce s rohem v počátku. */
const block = (extra: Partial<SceneFieldPart> = {}): SceneFieldPart[] => [
  square(0, 0, extra),
  square(1, 0, extra),
  square(0, 1, extra),
  square(1, 1, extra),
];
const all = { radius: PLOUGH_CORNER_M, rounded: (): boolean => true };

describe('kulaté rohy pole oraného rádlem', () => {
  it('vnější roh je zakulacený obloukem, ostrý roh kopaného pole zůstane', () => {
    const sharp = cellsCoverage(block(), SOFT);
    const round = cellsCoverage(block(), SOFT, all);
    // kousek od rohu po úhlopříčce: ostrý roh pole kryje, kulatý ne (za obloukem je louka)
    expect(sharp(1.2, 1.2)).toBeGreaterThan(0.5);
    expect(round(1.2, 1.2)).toBe(0);
    // dál od rohu po straně se nic nemění
    expect(round(12, 3)).toBeCloseTo(sharp(12, 3), 9);
    expect(round(3, 12)).toBeCloseTo(sharp(3, 12), 9);
    // uvnitř oblouku (od středu oblouku blíž než poloměr − okraj) kryje plně
    const r = PLOUGH_CORNER_M;
    const inside = r - (r - SOFT - 0.1) / Math.SQRT2;
    expect(round(inside, inside)).toBe(1);
  });

  it('jen vnější rohy celého pole – vnitřní styky dílů a vnitřní roh tvaru L zůstanou', () => {
    // tvar L: tři čtverce, vnitřní roh v bodě (15, 15)
    const shape = [square(0, 0), square(1, 0), square(0, 1)];
    const round = cellsCoverage(shape, SOFT, all);
    const sharp = cellsCoverage(shape, SOFT);
    // styk dvou dílů uprostřed pole – plné krytí
    expect(round(15, 5)).toBe(1);
    // vnitřní roh L – stejné jako ostrý
    expect(round(14, 14)).toBeCloseTo(sharp(14, 14), 9);
    // vnější rohy dílů tvaru L
    expect(outerCorners(shape, shape[0]!)).toEqual([[0, 0]]);
    expect(outerCorners(shape, shape[1]!).sort()).toEqual(
      [
        [30, 0],
        [30, 15],
      ].sort(),
    );
    expect(outerCorners(shape, shape[2]!).sort()).toEqual(
      [
        [0, 30],
        [15, 30],
      ].sort(),
    );
  });

  it('schod obrysu (konec pásu orby) je zakulacený, i když úhlopříčný čtverec pole je', () => {
    // schody: (0,0), (1,0), (1,1) a (2,1) – roh mezi (0,0) a (2,1)… roh čtverce (1,0) vpravo dole
    // má (2,0) i (1,−1) mimo pole, úhlopříčný (2,1) v poli: schod se zakulatí
    const stairs = [square(0, 0), square(1, 0), square(1, 1), square(2, 1)];
    const round = cellsCoverage(stairs, SOFT, all);
    const sharp = cellsCoverage(stairs, SOFT);
    // kousek od rohu (30, 0) uvnitř čtverce (1, 0)
    expect(sharp(28.8, 1.2)).toBeGreaterThan(0.5);
    expect(round(28.8, 1.2)).toBe(0);
    expect(outerCorners(stairs, stairs[1]!)).toContainEqual([30, 0]);
    // vnitřní roh schodu (styk (1,0) a (1,1) s (0,0)) zůstane
    expect(outerCorners(stairs, stairs[2]!)).not.toContainEqual([15, 15]);
  });

  it('okraj pole se místy odsune dovnitř – nepravidelný obrys, uvnitř pole beze změny', () => {
    const squares = block();
    const plain = cellsCoverage(squares, SOFT);
    const inset = cellsCoverage(squares, SOFT, undefined, {
      maxM: 2,
      at: (x) => (x < 15 ? 2 : 0),
    });
    // vlevo okraj o 2 m dovnitř, vpravo jako dřív
    expect(inset(2.5, 15)).toBeLessThan(plain(2.5, 15));
    expect(inset(3.7, 15)).toBeCloseTo(1, 9);
    expect(inset(28, 15)).toBeCloseTo(plain(28, 15), 9);
    expect(inset(15, 15)).toBe(1);
  });

  it('roh u sousedního pole se nezakulatí (pole navazují bez švu)', () => {
    const own = [square(0, 0)];
    // sousední pole kolem rohu (−1, −1): krytí okraje počítá pole i se styky
    const edge = [...own, square(-1, 0), square(-1, -1), square(0, -1)];
    const rounded = (cell: { x: number; y: number }): boolean => cell.x === 0 && cell.y === 0;
    const round = cellsCoverage(edge, SOFT, { radius: PLOUGH_CORNER_M, rounded });
    expect(round(0.5, 0.5)).toBe(1);
    expect(outerCorners(edge, own[0]!)).toEqual([[15, 15]]);
  });

  it('kopané díly téhož pole mají rohy ostré, orané kulaté', () => {
    const parts = block();
    const ploughed = new Set(['1,1']);
    const round = cellsCoverage(parts, SOFT, {
      radius: PLOUGH_CORNER_M,
      rounded: (c) => ploughed.has(`${c.x},${c.y}`),
    });
    const sharp = cellsCoverage(parts, SOFT);
    expect(round(1.2, 1.2)).toBeCloseTo(sharp(1.2, 1.2), 9);
    expect(round(28.8, 28.8)).toBe(0);
    expect(sharp(28.8, 28.8)).toBeGreaterThan(0.5);
  });

  it('natočené pole – roh zakulacený v osách mřížky pole', () => {
    const rotation = Math.PI / 6;
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    // čtverce v mřížce pole: lokální (u, v) → svět (x0 + u·c + v·s, z0 − u·s + v·c)
    const toWorld = (u: number, v: number): [number, number] => [u * c + v * s, -u * s + v * c];
    const parts = [0, 1].flatMap((i) =>
      [0, 1].map((j): CellSquare => {
        const [x, z] = toWorld(i * CELL + CELL / 2, j * CELL + CELL / 2);
        return { cell: { x: i, y: j }, x, z, size: CELL, rotation };
      }),
    );
    const round = cellsCoverage(parts, SOFT, all);
    const sharp = cellsCoverage(parts, SOFT);
    const [x, z] = toWorld(1.2, 1.2);
    expect(sharp(x, z)).toBeGreaterThan(0.5);
    expect(round(x, z)).toBe(0);
    const corners = outerCorners(parts, parts[0]!);
    expect(corners).toHaveLength(1);
    expect(corners[0]![0]).toBeCloseTo(0, 6);
    expect(corners[0]![1]).toBeCloseTo(0, 6);
  });

  it('v kulatém rohu nestojí trsy obilí', () => {
    const parts = block();
    const round = cellsCoverage(parts, SOFT, all);
    const views: PartView[] = parts.map((part, order) => ({
      part,
      look: 'ripe',
      work: null,
      before: null,
      staked: false,
      order,
    }));
    const plants = fieldPlants(views, [1, 0], { x: -50, z: -50 }, round);
    const ripe = plants.crops.ripe;
    expect(ripe.length).toBeGreaterThan(1000);
    const r = PLOUGH_CORNER_M;
    // za obloukem rohu (vzdálenost od středu oblouku víc než poloměr) žádný trs
    for (const [cx, cz, sx, sz] of [
      [r, r, -1, -1],
      [30 - r, 30 - r, 1, 1],
    ] as const) {
      const beyond = ripe.filter(
        (p) =>
          (p.x - cx) * sx > 0 && (p.z - cz) * sz > 0 && Math.hypot(p.x - cx, p.z - cz) > r - 0.05,
      );
      expect(beyond).toEqual([]);
    }
  });
});

describe('vystouplé obilí – koruna porostu', () => {
  const view = (
    part: SceneFieldPart,
    look: FieldLook | null,
    order: number,
    work: number | null = null,
    before: FieldLook | null = null,
  ): PartView => ({ part, look, work, before, staked: false, order });
  const flat = (): number => 1;

  /** Výšky vrcholů horní plochy (bez stěn) uvnitř dílu. */
  const tops = (mesh: CanopyMesh): number[] => [...mesh.offsets];

  it('zelené a zralé obilí má korunu (dvouzrnka), luštěniny nízkou, ostatní žádnou', () => {
    expect(canopyHeight('ripe')).toBe(CANOPY_M.ripe!.grain);
    expect(canopyHeight('green')).toBe(CANOPY_M.green!.grain);
    expect(canopyHeight('ripe')).toBeGreaterThanOrEqual(0.8);
    expect(canopyHeight('ripe', 'legume')).toBeLessThan(0.4);
    for (const look of ['sprouted', 'stubble', 'harvesting', 'plowed', 'sown'] as const) {
      expect(canopyHeight(look)).toBe(0);
    }
    const none = fieldCanopy(
      [view(square(0, 0), 'sprouted', 0)],
      [1, 0],
      { x: 0, z: 0 },
      flat,
      1.875,
    );
    expect(none.indices.length).toBe(0);
    const ripe = fieldCanopy([view(square(0, 0), 'ripe', 0)], [1, 0], { x: 0, z: 0 }, flat, 1.875);
    expect(Math.max(...tops(ripe))).toBeCloseTo(CANOPY_M.ripe!.grain, 5);
  });

  it('u okraje pole se koruna svažuje a zanoří pod zem', () => {
    const parts = [square(0, 0)];
    const coverage = cellsCoverage(parts, SOFT);
    const mesh = fieldCanopy([view(parts[0]!, 'ripe', 0)], [1, 0], { x: 0, z: 0 }, coverage, 1.875);
    for (let v = 0; v < mesh.offsets.length; v++) {
      const x = mesh.positions[v * 2]!;
      const z = mesh.positions[v * 2 + 1]!;
      const edge = Math.min(x, z, CELL - x, CELL - z);
      if (edge < 1e-6) expect(mesh.offsets[v]).toBeLessThan(0);
      if (edge > SOFT + 0.1) expect(mesh.offsets[v]).toBeCloseTo(CANOPY_M.ripe!.grain, 5);
    }
  });

  it('hrana žně: na čáře žně spadne koruna svislou stěnou (schod), normály ven a nahoru', () => {
    // díl rozpracovaný napůl: sklizená část (panáky) od strany u vsi, zbytek zralý
    const part = square(0, 0);
    const v = view(part, 'harvesting', 0, 0.5, 'ripe');
    // ves na −z – práce jde od z = 0 do +z, čára žně v z = 7,5
    const mesh = fieldCanopy([v], [1, 0], { x: 7.5, z: -50 }, flat, 1.875);
    const at = (i: number): [number, number, number] => [
      mesh.positions[i * 2]!,
      mesh.offsets[i]!,
      mesh.positions[i * 2 + 1]!,
    ];
    // koruna jen na zralé části
    for (let i = 0; i < mesh.offsets.length; i++)
      expect(at(i)[2]).toBeGreaterThanOrEqual(7.5 - 1e-6);
    // stěna na čáře žně: trojúhelníky s body v z = 7,5 od plné výšky pod zem
    let wall = 0;
    for (let k = 0; k < mesh.indices.length; k += 3) {
      const [a, b, c] = [mesh.indices[k]!, mesh.indices[k + 1]!, mesh.indices[k + 2]!].map(at);
      // normála jako v Babylonu (p1 − p2) × (p3 − p2)
      const u = [a![0] - b![0], a![1] - b![1], a![2] - b![2]];
      const w = [c![0] - b![0], c![1] - b![1], c![2] - b![2]];
      const n = [
        u[1]! * w[2]! - u[2]! * w[1]!,
        u[2]! * w[0]! - u[0]! * w[2]!,
        u[0]! * w[1]! - u[1]! * w[0]!,
      ];
      const onLine = [a, b, c].every((p) => Math.abs(p![2] - 7.5) < 1e-6);
      if (onLine) {
        wall++;
        // stěna míří ke sklizené části (−z)
        expect(n[2]!).toBeLessThan(0);
        expect(Math.max(a![1], b![1], c![1])).toBeCloseTo(CANOPY_M.ripe!.grain, 5);
        expect(Math.min(a![1], b![1], c![1])).toBeLessThanOrEqual(0);
      } else if (
        [a, b, c].every((p) => p![2] > 7.5 + 1e-6 || Math.abs(p![1] - CANOPY_M.ripe!.grain) < 1e-5)
      ) {
        // horní plocha míří nahoru
        if (Math.abs(n[1]!) > 1e-9) expect(n[1]!).toBeGreaterThan(0);
      }
    }
    expect(wall).toBeGreaterThan(0);
  });

  it('dva sousední díly se stejným porostem – bez stěny mezi nimi', () => {
    const parts = [square(0, 0), square(1, 0)];
    const mesh = fieldCanopy(
      parts.map((p, i) => view(p, 'ripe', i)),
      [1, 0],
      { x: 0, z: -50 },
      flat,
      1.875,
    );
    // žádný vrchol stěny pod plnou výškou na styku dílů (x = 15)
    for (let i = 0; i < mesh.offsets.length; i++) {
      const z = mesh.positions[i * 2 + 1]!;
      // styk dílů (x = 15) mimo vnější okraj pole (z = 0 a z = 15 – tam stěna je)
      if (Math.abs(mesh.positions[i * 2]! - 15) < 1e-6 && z > 1e-6 && z < 15 - 1e-6) {
        expect(mesh.offsets[i]).toBeCloseTo(CANOPY_M.ripe!.grain, 5);
      }
    }
  });
});
