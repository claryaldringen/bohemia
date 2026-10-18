// Náhradní tvary posvátných míst bez Babylonu – kreslí se, dokud se nenačtou modely
// z public/models/sacred/ (tools/blender/sacred.py; do repa přijdou samostatně). Hrubé
// stylizace z válců, kotoučů a kvádrů s barvou ve vrcholech: modla na kůlu s udusaným kruhem,
// svatyně s plochou, příkopem s osmi výběžky a ohništi, obětiny u dubu, kameny háje a díly
// staveniště (hlavně vytyčení kolíky a provázkem). Souřadnice modelu jako GLB: x napříč, y nahoru,
// z k předku, počátek = střed půdorysu na úrovni terénu.
import {
  IDOL_RING_M,
  SHRINE_PETALS,
  SHRINE_RING_M,
  sacredStakeLines,
  shrineFireSpots,
} from './sacred-layout';

type Rgb = readonly [number, number, number];
type Vec3 = readonly [number, number, number];

/** Síť náhradního tvaru – pozice, barvy (RGBA) a trojúhelníky; normály dopočítá scéna. */
export interface FallbackGeometry {
  positions: number[];
  colors: number[];
  indices: number[];
}

const WOOD: Rgb = [0.45, 0.38, 0.3];
const BARK: Rgb = [0.32, 0.26, 0.2];
const EARTH: Rgb = [0.5, 0.41, 0.3];
const SPOIL: Rgb = [0.56, 0.45, 0.32];
const DITCH: Rgb = [0.34, 0.27, 0.2];
const TURF: Rgb = [0.36, 0.42, 0.24];
const STONE: Rgb = [0.56, 0.55, 0.51];
const ASH: Rgb = [0.22, 0.2, 0.19];
const EMBER: Rgb = [0.75, 0.32, 0.12];
const RED: Rgb = [0.72, 0.12, 0.1];
const WHITE: Rgb = [0.88, 0.86, 0.8];
const STRAW: Rgb = [0.78, 0.66, 0.36];
const CHIPS: Rgb = [0.8, 0.7, 0.52];
const STRING: Rgb = [0.92, 0.88, 0.74];

/** Modla ve svatyni je větší a stojí na vyvýšené ploše (sacred.py – IDOL_SHRINE_SCALE, Z_TOP). */
const SHRINE_IDOL = { scale: 1.55, base: 0.51 };

class Builder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  private vertex(p: Vec3, color: Rgb): number {
    this.positions.push(p[0], p[1], p[2]);
    this.colors.push(color[0], color[1], color[2], 1);
    return this.positions.length / 3 - 1;
  }

  /** Komolý kužel / válec z bodu `a` do bodu `b` (poloměry ra, rb), s víčkem nahoře. */
  frustum(a: Vec3, b: Vec3, ra: number, rb: number, segments: number, color: Rgb): void {
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(d[0], d[1], d[2]);
    if (length <= 0) return;
    const axis: Vec3 = [d[0] / length, d[1] / length, d[2] / length];
    // dva kolmé vektory k ose
    const helper: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = normalize(cross(axis, helper));
    const v = cross(axis, u);
    const ring = (center: Vec3, r: number): number[] =>
      Array.from({ length: segments }, (_, k) => {
        const t = (k / segments) * Math.PI * 2;
        const c = Math.cos(t) * r;
        const s = Math.sin(t) * r;
        return this.vertex(
          [
            center[0] + u[0] * c + v[0] * s,
            center[1] + u[1] * c + v[1] * s,
            center[2] + u[2] * c + v[2] * s,
          ],
          color,
        );
      });
    const bottom = ring(a, ra);
    const top = ring(b, rb);
    for (let k = 0; k < segments; k++) {
      const n = (k + 1) % segments;
      this.indices.push(bottom[k]!, top[k]!, top[n]!, bottom[k]!, top[n]!, bottom[n]!);
    }
    const cap = this.vertex(b, color);
    for (let k = 0; k < segments; k++) this.indices.push(cap, top[(k + 1) % segments]!, top[k]!);
  }

  /** Kruhová výseč (mezikruží) ve výšce `y` od úhlu a0 do a1 – úhel od předku (+z) k −x. */
  sector(r0: number, r1: number, a0: number, a1: number, y: number, color: Rgb, steps = 8): void {
    const inner: number[] = [];
    const outer: number[] = [];
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      inner.push(this.vertex([-r0 * Math.sin(a), y, r0 * Math.cos(a)], color));
      outer.push(this.vertex([-r1 * Math.sin(a), y, r1 * Math.cos(a)], color));
    }
    for (let k = 0; k < steps; k++) {
      this.indices.push(
        inner[k]!,
        outer[k]!,
        outer[k + 1]!,
        inner[k]!,
        outer[k + 1]!,
        inner[k + 1]!,
      );
    }
  }

  /** Kotouč ve výšce `y`. */
  disc(cx: number, cz: number, y: number, r: number, color: Rgb, segments = 16): void {
    const center = this.vertex([cx, y, cz], color);
    const rim = Array.from({ length: segments }, (_, k) => {
      const t = (k / segments) * Math.PI * 2;
      return this.vertex([cx + Math.cos(t) * r, y, cz + Math.sin(t) * r], color);
    });
    for (let k = 0; k < segments; k++) this.indices.push(center, rim[k]!, rim[(k + 1) % segments]!);
  }

  /** Kvádr se středem `c`, rozměry `s` a natočením kolem svislé osy. */
  box(c: Vec3, s: Vec3, rotationY: number, color: Rgb): void {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const corner = (dx: number, dy: number, dz: number): number => {
      const x = (dx * s[0]) / 2;
      const z = (dz * s[2]) / 2;
      return this.vertex(
        [c[0] + x * cos + z * sin, c[1] + (dy * s[1]) / 2, c[2] - x * sin + z * cos],
        color,
      );
    };
    const v = [
      corner(-1, -1, -1),
      corner(1, -1, -1),
      corner(1, 1, -1),
      corner(-1, 1, -1),
      corner(-1, -1, 1),
      corner(1, -1, 1),
      corner(1, 1, 1),
      corner(-1, 1, 1),
    ];
    const faces = [
      [0, 1, 2, 3],
      [5, 4, 7, 6],
      [4, 0, 3, 7],
      [1, 5, 6, 2],
      [3, 2, 6, 7],
      [4, 5, 1, 0],
    ];
    for (const [a, b, cc, d] of faces) {
      this.indices.push(v[a!]!, v[b!]!, v[cc!]!, v[a!]!, v[cc!]!, v[d!]!);
    }
  }

  /** Kámen – nízký mnohoboký komolý kužel. */
  stone(x: number, z: number, r: number, h: number, color: Rgb = STONE, y = -0.05): void {
    this.frustum([x, y, z], [x, y + h, z], r, r * 0.6, 6, color);
  }

  result(): FallbackGeometry | null {
    if (this.indices.length === 0) return null;
    return { positions: this.positions, colors: this.colors, indices: this.indices };
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Kruh kamenů kolem bodu. */
function stoneRing(b: Builder, r: number, count: number, size: number, y = -0.05): void {
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2 + 0.3 * Math.sin(k * 2.7);
    b.stone(
      Math.cos(a) * r,
      Math.sin(a) * r,
      size * (0.8 + (0.4 * ((k * 37) % 10)) / 10),
      size,
      STONE,
      y,
    );
  }
}

/** Kolíky a provázek po čarách vytyčení (souřadnice modelu). */
function stakes(b: Builder, lines: readonly (readonly (readonly [number, number])[])[]): void {
  const peg = 0.55;
  for (const line of lines) {
    line.forEach(([x, z], i) => {
      // uzavřená čára má poslední bod stejný jako první
      if (i < line.length - 1 || line.length === 1)
        b.frustum([x, -0.1, z], [x, peg, z], 0.035, 0.025, 5, WOOD);
      if (i === 0) return;
      const [px, pz] = line[i - 1]!;
      const length = Math.hypot(x - px, z - pz);
      b.box(
        [(x + px) / 2, peg - 0.08, (z + pz) / 2],
        [0.025, 0.025, length],
        Math.atan2(x - px, z - pz),
        STRING,
      );
    });
  }
}

/** Kůl modly: kmen, čepice, u svatyně větší a na vyvýšené ploše. */
function idolPost(b: Builder, carved: boolean, scale = 1, base = 0): void {
  const y = (v: number): number => base + v * scale;
  b.frustum(
    [0, y(-0.15), 0],
    [0, y(carved ? 2.52 : 2.87), 0],
    0.24 * scale,
    0.2 * scale,
    8,
    carved ? WOOD : BARK,
  );
  if (!carved) return;
  b.frustum([0, y(2.52), 0], [0, y(2.87), 0], 0.31 * scale, 0.05 * scale, 8, BARK);
  // tváře – čtyři světlejší ploché kvádry pod čepicí
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    b.box(
      [Math.sin(a) * 0.2 * scale, y(2.25), Math.cos(a) * 0.2 * scale],
      [0.22 * scale, 0.35 * scale, 0.04 * scale],
      a,
      CHIPS,
    );
  }
}

function idolParts(b: Builder, part: string, scale: number, base: number): void {
  const y = (v: number): number => base + v * scale;
  switch (part) {
    case 'log':
      b.frustum(
        [-1.5 * scale, y(0.32), 0.4],
        [1.5 * scale, y(0.3), 0.4],
        0.25 * scale,
        0.21 * scale,
        8,
        BARK,
      );
      b.box([-0.9 * scale, y(0.06), 0.4], [0.3, 0.12, 0.6], 0, WOOD);
      b.box([0.9 * scale, y(0.06), 0.4], [0.3, 0.12, 0.6], 0, WOOD);
      return;
    case 'struts':
      for (let k = 0; k < 3; k++) {
        const a = (k * 2 * Math.PI) / 3 + 0.4;
        b.frustum(
          [Math.sin(a) * 1.7 * scale, y(0), Math.cos(a) * 1.7 * scale],
          [0, y(1.9), 0],
          0.06 * scale,
          0.05 * scale,
          5,
          WOOD,
        );
      }
      return;
    case 'post':
      idolPost(b, false, scale, base);
      return;
    case 'hewn':
      b.box([0, y(1.36), 0], [0.4 * scale, 3 * scale, 0.4 * scale], 0, WOOD);
      return;
    case 'carved':
    case 'idol':
      idolPost(b, true, scale, base);
      return;
    case 'stones':
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        b.stone(
          Math.cos(a) * 0.4 * scale,
          Math.sin(a) * 0.4 * scale,
          0.12 * scale,
          0.18 * scale,
          STONE,
          base - 0.05,
        );
      }
      return;
    case 'chips':
      b.disc(0.3, 0.6, base + 0.03, 0.9 * scale, CHIPS, 10);
      return;
    case 'ribbon':
      b.box([0.21 * scale, y(1.7), 0], [0.02, 0.6 * scale, 0.05], 0, RED);
      return;
    case 'offerings':
      b.disc(0.3 * scale, 0.9 * scale, base + 0.08, 0.13, STRAW, 10);
      b.disc(-0.3 * scale, 0.9 * scale, base + 0.08, 0.11, WHITE, 10);
      b.frustum([0.25, base, 0.3], [0.1, y(1.1), 0.22], 0.14, 0.04, 6, STRAW);
      return;
  }
}

/** Výběžek příkopu k (0–7) s valem venku. */
function ditchPetal(b: Builder, k: number): void {
  const a0 = (k * 2 * Math.PI) / SHRINE_PETALS;
  const a1 = ((k + 1) * 2 * Math.PI) / SHRINE_PETALS;
  const outer = (SHRINE_RING_M.cusp + SHRINE_RING_M.tip) / 2;
  b.sector(SHRINE_RING_M.inner, outer, a0, a1, 0.03, DITCH);
  b.sector(outer, outer + 1.2, a0, a1, 0.22, SPOIL);
  b.sector(outer + 1.2, outer + 1.8, a0, a1, 0.08, TURF);
}

function shrineFire(b: Builder, k: number): void {
  const [x, z] = shrineFireSpots()[k]!;
  b.disc(x, z, 0.04, 0.75, ASH, 12);
  b.disc(x, z, 0.06, 0.25, EMBER, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.stone(x + Math.cos(a) * 0.62, z + Math.sin(a) * 0.62, 0.12, 0.14);
  }
}

function platform(b: Builder, height: number, color: Rgb): void {
  b.frustum([0, -0.05, 0], [0, height, 0], SHRINE_RING_M.inner - 0.4, 10.4, 48, color);
}

/**
 * Náhradní síť modelu podle klíče: 'idol', 'shrine', 'oak-offerings', 'stone-a', 'stone-b',
 * 'altar', nebo díl staveniště 'modla-…' / 'svatyne-…'; neznámý klíč null.
 */
export function fallbackGeometry(key: string): FallbackGeometry | null {
  const b = new Builder();
  if (key === 'idol') {
    b.disc(0, 0, 0.02, IDOL_RING_M, EARTH, 24);
    for (const part of ['idol', 'stones', 'ribbon', 'offerings']) idolParts(b, part, 1, 0);
  } else if (key === 'shrine') {
    platform(b, 0.45, EARTH);
    for (let k = 0; k < SHRINE_PETALS; k++) {
      ditchPetal(b, k);
      shrineFire(b, k);
    }
    b.disc(0, 0, SHRINE_IDOL.base - 0.02, 1.75, STONE, 20);
    for (const part of ['idol', 'stones', 'ribbon', 'offerings']) {
      idolParts(b, part, SHRINE_IDOL.scale, SHRINE_IDOL.base);
    }
  } else if (key === 'oak-offerings') {
    stoneRing(b, 1.75, 14, 0.16);
    // pahýl větve se stužkami míří dopředu (+z), miska se zrnem vpředu
    b.frustum([-0.12, 2.28, 0.35], [-0.42, 2.5, 1.62], 0.095, 0.065, 6, BARK);
    for (let i = 0; i < 5; i++) {
      const t = 0.6 + 0.08 * i;
      const x = -0.12 - 0.3 * t;
      const z = 0.35 + 1.27 * t;
      b.box([x, 2.0, z], [0.03, 0.5, 0.06], 0, i % 2 === 0 ? RED : WHITE);
    }
    b.disc(-0.25, 1.3, 0.06, 0.13, STRAW, 10);
  } else if (key === 'stone-a') {
    b.frustum([0, -0.15, 0], [0, 1.0, 0], 0.32, 0.17, 7, STONE);
  } else if (key === 'stone-b') {
    b.frustum([0, -0.1, 0], [0, 0.45, 0], 0.44, 0.26, 7, STONE);
  } else if (key === 'altar') {
    for (const [x, z] of [
      [-0.5, 0.2],
      [0.5, 0.25],
      [-0.05, -0.3],
    ] as const) {
      b.frustum([x, -0.08, z], [x, 0.34, z], 0.22, 0.17, 6, STONE);
    }
    b.box([0, 0.42, 0], [1.5, 0.18, 1.0], 0.08, STONE);
    b.disc(0.28, -0.06, 0.52, 0.12, ASH, 8);
  } else if (key.startsWith('modla-')) {
    const part = key.slice('modla-'.length);
    if (part === 'stakes') {
      stakes(b, sacredStakeLines('idol'));
      b.frustum([0, -0.1, 0], [0, 0.7, 0], 0.04, 0.03, 5, WOOD);
    } else if (part === 'ground') {
      b.disc(0, 0, 0.02, IDOL_RING_M, EARTH, 24);
    } else {
      idolParts(b, part, 1, 0);
    }
  } else if (key.startsWith('svatyne-')) {
    const part = key.slice('svatyne-'.length);
    const ditch = /^ditch-(\d)$/.exec(part);
    const fire = /^fire-(\d)$/.exec(part);
    if (part === 'stakes') {
      stakes(b, sacredStakeLines('shrine'));
      b.frustum([0, -0.15, 0], [0, 0.7, 0], 0.08, 0.07, 6, WOOD);
      // provaz od středu ke kruhu (kružidlo)
      b.box([0, 0.45, SHRINE_RING_M.inner / 2], [0.03, 0.03, SHRINE_RING_M.inner], 0, STRING);
    } else if (ditch) {
      ditchPetal(b, Number(ditch[1]) - 1);
    } else if (fire) {
      shrineFire(b, Number(fire[1]) - 1);
    } else if (part === 'platform-1') {
      platform(b, 0.27, SPOIL);
    } else if (part === 'platform-2') {
      platform(b, 0.45, EARTH);
    } else if (part === 'paving') {
      b.disc(0, 0, SHRINE_IDOL.base - 0.02, 1.75, STONE, 20);
    } else {
      idolParts(b, part, SHRINE_IDOL.scale, SHRINE_IDOL.base);
    }
  }
  return b.result();
}
