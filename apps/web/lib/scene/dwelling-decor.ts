// Okolí obydlí bez Babylonu: trsy trávy pod okapem a vyšlapaná hlína před vchodem (podle spiku
// obydlí); pozemek polozemnice s plotem a záhony je v homestead-layout.ts. Tvar modelů:
// tools/blender/dwellings.py – Blender x napříč, y podél hřebene, vchod v −y; ve scéně (glTF)
// je bod Blenderu (x, y) v souřadnicích modelu (−x, −y), vchod tedy míří do +z.
import {
  PLAIN_FRAME,
  shapeY,
  shapeZ,
  type DwellingType,
  type Position,
  type ShapeFrame,
} from '@bohemia/game';
import { seededRandom, shapedToWorld, smoothstep, type DecalGrid } from './village-layout';

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
  // dvorec vojvody (trade.md) – okap 2,78 m, střecha přečnívá štíty o 1,05 m
  dvorec: { eaveX: 2.78, eaveHalf: 5.3, frontY: -4.7 },
  // nadzemní dům a srubový dvorec (log-house.md, LOG_HOUSES v dwellings.py) – okap x_eave, střecha
  // přečnívá přední štít o 0,8 (dvorec 0,9) m, zadní srubu jen o 0,45 m (eaveHalf je kratší z nich)
  srub: { eaveX: 2.75, eaveHalf: 3.2, frontY: -2.75 },
  // vypletený dům (WATTLE_HOUSE v dwellings.py) – okap 2,75 m, stěny ±2,8 m, vzadu přesah 0,45 m
  vypleteny: { eaveX: 2.75, eaveHalf: 3.25, frontY: -2.8 },
  'dvorec-srub': { eaveX: 3.75, eaveHalf: 6.1, frontY: -5.2 },
};

/**
 * Dýmník (tmavý otvor ve vrcholu zadního štítu) v souřadnicích modelu ve scéně: výška nad patou
 * a z (zadní štít je v −z). Odtud stoupá dým (village-smoke.ts).
 */
export const SMOKE_VENT: Record<DwellingType, { y: number; z: number }> = {
  zemnice: { y: 1.85, z: -2.1 },
  polozemnice: { y: 2.85, z: -2.2 },
  dvorec: { y: 3.35, z: -4.3 },
  // nadzemní dům a srubový dvorec – dýmník mezi prkny zadního štítu pod vrcholem
  srub: { y: 3.8, z: -2.7 },
  // vypletený dům – dýmník v omazaném zadním štítu pod vrcholem (nižší stěny než srub)
  vypleteny: { y: 3.6, z: -2.7 },
  'dvorec-srub': { y: 4.45, z: -5.15 },
};

export type TuftModel = 'grass-tuft-1' | 'grass-tuft-2';

export interface TuftPlacement {
  model: TuftModel;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/**
 * Dýmník obydlí podle varianty rozměrů (population.md – Varianty rozměrů): výška nad patou a z
 * v souřadnicích modelu – roste s výškou a délkou domu.
 */
export function smokeVent(type: DwellingType, frame: ShapeFrame): { y: number; z: number } {
  const vent = SMOKE_VENT[type];
  return { y: shapeY(frame, vent.y), z: shapeZ(frame, vent.z) };
}

/** Bod Blenderu (x, y) u obydlí → svět, s variantou rozměrů domu `frame`. */
function blenderToWorld(
  position: Position,
  frame: ShapeFrame,
  bx: number,
  by: number,
): [number, number] {
  return shapedToWorld(position, frame, -bx, -by);
}

/**
 * Trsy trávy pod okapem – voda ze střechy tam stéká, tráva je hustší, vyšší a zelenější. Tři
 * řady podél obou dlouhých stran, náhodné natočení, velikost a model (pevně podle `seed`).
 */
export function eaveTufts(
  type: DwellingType,
  position: Position,
  seed: number,
  frame: ShapeFrame = PLAIN_FRAME,
): TuftPlacement[] {
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
        const [x, z] = blenderToWorld(position, frame, bx, by);
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
  frame: ShapeFrame = PLAIN_FRAME,
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
      const [x, z] = blenderToWorld(position, frame, bx, by);
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
