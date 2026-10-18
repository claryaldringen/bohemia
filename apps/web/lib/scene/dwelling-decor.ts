// Okolí obydlí bez Babylonu: trsy trávy pod okapem, vyšlapaná hlína před vchodem (podle spiku
// obydlí) a zahrádka polozemnice na terénu. Tvar modelů: tools/blender/dwellings.py – Blender
// x napříč, y podél hřebene, vchod v −y; ve scéně (glTF) je bod Blenderu (x, y) v souřadnicích
// modelu (−x, −y), vchod tedy míří do +z.
import { DWELLING_GARDEN_M, type DwellingType, type Position } from '@bohemia/game';
import { localToWorld, seededRandom, smoothstep, type DecalGrid } from './village-layout';

/**
 * Tvar obydlí v souřadnicích Blenderu: eaveX = kapková linie okapu (kam stéká voda ze střechy),
 * eaveHalf = polovina její délky, frontY = přední štít se dveřmi.
 */
const SHAPES: Record<DwellingType, { eaveX: number; eaveHalf: number; frontY: number }> = {
  // okap leží na valu drnů (hřbet x ≈ 2,25, pata 2,7) – voda stéká po vnější straně valu;
  // střecha přečnívá štíty o 1,05 m (vpředu kryje šíji), hlína před vchodem začíná u jejího ústí
  zemnice: { eaveX: 2.5, eaveHalf: 3.1, frontY: -2.6 },
  // přesah střechy 0,5 m za stěnu – kapková linie x = 2,6
  polozemnice: { eaveX: 2.6, eaveHalf: 3.2, frontY: -2.6 },
};

/**
 * Dýmník (tmavý otvor ve vrcholu zadního štítu) v souřadnicích modelu ve scéně: výška nad patou
 * a z (zadní štít je v −z). Odtud stoupá dým (village-smoke.ts).
 */
export const SMOKE_VENT: Record<DwellingType, { y: number; z: number }> = {
  zemnice: { y: 1.85, z: -2.1 },
  polozemnice: { y: 2.85, z: -2.2 },
};

/** Model zahrádky polozemnice (tools/blender/dwellings.py – počátek uprostřed zahrádky). */
export const GARDEN_MODEL_URL = '/models/dwellings/garden.glb';
/** O kolik je zahrádka zapuštěná pod nejnižší bod terénu pod ní (m) – nikde nevisí. */
const GARDEN_SINK_M = 0.04;

/** Zahrádka obydlí položená na terén: střed, výška paty, natočení a náklon podle svahu. */
export interface GardenInstance {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  /** Svislá osa zahrádky – kolmo k rovině proložené terénem pod ní. */
  up: { x: number; y: number; z: number };
}

/**
 * Zahrádka polozemnice (`DWELLING_GARDEN_M`, zemnice žádnou nemá → null): pevný model vedle
 * domu, který na svahu nesmí viset ani se zabořit – rovina proložená výškou terénu v rozích se
 * stane jeho podstavou (náklon `up`) a sníží se tak, aby žádný roh ani střed nevisel nad terénem.
 */
export function gardenInstance(
  type: DwellingType,
  position: Position,
  height: (x: number, z: number) => number,
): GardenInstance | null {
  const g = DWELLING_GARDEN_M[type];
  if (!g) return null;
  const cx = (g.minX + g.maxX) / 2;
  const cz = (g.minZ + g.maxZ) / 2;
  const hx = (g.maxX - g.minX) / 2;
  const hz = (g.maxZ - g.minZ) / 2;
  const sample = (u: number, v: number): number => {
    const [x, z] = localToWorld(position, cx + u, cz + v);
    return height(x, z);
  };
  const h00 = sample(-hx, -hz);
  const h10 = sample(hx, -hz);
  const h11 = sample(hx, hz);
  const h01 = sample(-hx, hz);
  const mean = (h00 + h10 + h11 + h01) / 4;
  // sklon roviny podél os modelu (m na m)
  const su = (h10 + h11 - h00 - h01) / (4 * hx);
  const sv = (h01 + h11 - h00 - h10) / (4 * hz);
  const plane = (u: number, v: number): number => mean + su * u + sv * v;
  const points: [number, number, number][] = [
    [-hx, -hz, h00],
    [hx, -hz, h10],
    [hx, hz, h11],
    [-hx, hz, h01],
    [0, 0, sample(0, 0)],
    [-hx, 0, sample(-hx, 0)],
    [hx, 0, sample(hx, 0)],
    [0, -hz, sample(0, -hz)],
    [0, hz, sample(0, hz)],
  ];
  const above = Math.max(0, ...points.map(([u, v, h]) => plane(u, v) - h));
  const [x, z] = localToWorld(position, cx, cz);
  // normála roviny v osách modelu (−su, 1, −sv) → svět (osa x modelu je (cos r, −sin r))
  const cos = Math.cos(position.rotation);
  const sin = Math.sin(position.rotation);
  const nx = -su * cos - sv * sin;
  const nz = su * sin - sv * cos;
  const length = Math.hypot(nx, 1, nz);
  return {
    x,
    y: mean - above - GARDEN_SINK_M,
    z,
    rotationY: position.rotation,
    scale: 1,
    up: { x: nx / length, y: 1 / length, z: nz / length },
  };
}

/** Bod v obdélníku zahrádky obydlí (s okrajem `margin`, m) – slepice dovnitř nesmějí. */
export function inGarden(
  type: DwellingType,
  position: Position,
  x: number,
  z: number,
  margin = 0,
): boolean {
  const g = DWELLING_GARDEN_M[type];
  if (!g) return false;
  const dx = x - position.x;
  const dz = z - position.z;
  const cos = Math.cos(position.rotation);
  const sin = Math.sin(position.rotation);
  // inverze localToWorld: lx = dx cos − dz sin, lz = dx sin + dz cos
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return (
    lx > g.minX - margin && lx < g.maxX + margin && lz > g.minZ - margin && lz < g.maxZ + margin
  );
}

export type TuftModel = 'grass-tuft-1' | 'grass-tuft-2';

export interface TuftPlacement {
  model: TuftModel;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/** Bod Blenderu (x, y) u obydlí → svět. */
function blenderToWorld(position: Position, bx: number, by: number): [number, number] {
  return localToWorld(position, -bx, -by);
}

/**
 * Trsy trávy pod okapem – voda ze střechy tam stéká, tráva je hustší, vyšší a zelenější. Tři
 * řady podél obou dlouhých stran, náhodné natočení, velikost a model (pevně podle `seed`).
 */
export function eaveTufts(type: DwellingType, position: Position, seed: number): TuftPlacement[] {
  const rnd = seededRandom(1000 + seed * 7919);
  const { eaveX, eaveHalf } = SHAPES[type];
  const result: TuftPlacement[] = [];
  for (const side of [-1, 1]) {
    // řada přímo pod okapem (nejhustší a nejvyšší), za ní řidší
    for (const [offset, step, size] of [
      [-0.08, 0.26, 1.15],
      [0.22, 0.32, 1.0],
      [0.55, 0.6, 0.8],
    ] as const) {
      for (let y = -eaveHalf - 0.1; y <= eaveHalf + 0.1; y += step) {
        // trsy ve shlucích – občas mezera
        if (rnd() < 0.12) continue;
        const bx = side * (eaveX + offset + (rnd() - 0.5) * 0.22);
        const by = y + (rnd() - 0.5) * step * 0.7;
        const [x, z] = blenderToWorld(position, bx, by);
        const model: TuftModel = rnd() < 0.55 ? 'grass-tuft-1' : 'grass-tuft-2';
        result.push({
          model,
          x,
          z,
          rotationY: rnd() * Math.PI * 2,
          scale: size * (model === 'grass-tuft-1' ? 1.6 : 1.25) * (0.8 + rnd() * 0.45),
        });
      }
    }
  }
  return result;
}

export interface EarthLayer {
  /** Velikost skvrny (násobek základního tvaru). */
  size: number;
  /** Krytí uprostřed. */
  alpha: number;
  /** Odkud (podíl poloměru) začíná okraj slábnout. */
  inner: number;
}

/** Prošlapaná tráva (širší) a holá udusaná hlína u dveří (užší) – kreslit v tomto pořadí. */
export const EARTH_LAYERS = {
  worn: { size: 1.25, alpha: 0.9, inner: 0.45 },
  earth: { size: 0.95, alpha: 1, inner: 0.35 },
} as const satisfies Record<string, EarthLayer>;

const RINGS = 14;
const SEGMENTS = 56;

/**
 * Vyšlapaná hlína před vchodem: nepravidelná skvrna s měkkým okrajem (krytí ve vrcholech),
 * dopředu delší než dozadu ke stěně. Prstence kolem středu před dveřmi.
 */
export function earthPatch(
  type: DwellingType,
  position: Position,
  seed: number,
  layer: EarthLayer,
): DecalGrid {
  const rnd = seededRandom(77 + seed * 104729 + layer.size * 1000);
  const phases = [rnd(), rnd(), rnd(), rnd()].map((v) => v * Math.PI * 2);
  const { frontY } = SHAPES[type];
  const cy = frontY - 1.3;
  const forward = 2.8 * layer.size;
  const back = 1.6 * layer.size;
  const side = 2.3 * layer.size;
  const positions: number[] = [];
  const alphas: number[] = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = (i / RINGS) * 1.12;
    for (let j = 0; j < (i === 0 ? 1 : SEGMENTS); j++) {
      const theta = (j / SEGMENTS) * Math.PI * 2;
      const cx = Math.cos(theta);
      const sy = Math.sin(theta);
      const ay = sy < 0 ? forward : back;
      const r =
        (1 / Math.hypot(cx / side, sy / ay)) *
        (1 +
          0.15 * Math.sin(3 * theta + phases[0]!) +
          0.09 * Math.sin(5 * theta + phases[1]!) +
          0.05 * Math.sin(11 * theta + phases[2]!));
      const bx = cx * r * t;
      const by = cy + sy * r * t;
      const [x, z] = blenderToWorld(position, bx, by);
      positions.push(x, z);
      // nepravidelné skvrny trávy uvnitř
      const patch =
        0.5 +
        0.5 *
          Math.sin(1.9 * bx + 2.7 * by + phases[3]!) *
          Math.sin(2.3 * by - 1.3 * bx + phases[0]!);
      const fade = 1 - smoothstep(layer.inner, 1.1, t);
      alphas.push(layer.alpha * fade * (0.78 + 0.22 * patch));
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < SEGMENTS; j++) indices.push(0, 1 + ((j + 1) % SEGMENTS), 1 + j);
  for (let i = 1; i < RINGS; i++) {
    const a0 = 1 + (i - 1) * SEGMENTS;
    const b0 = 1 + i * SEGMENTS;
    for (let j = 0; j < SEGMENTS; j++) {
      const j1 = (j + 1) % SEGMENTS;
      indices.push(a0 + j, a0 + j1, b0 + j1, a0 + j, b0 + j1, b0 + j);
    }
  }
  return {
    positions: Float32Array.from(positions),
    alphas: Float32Array.from(alphas),
    indices: Uint32Array.from(indices),
  };
}
