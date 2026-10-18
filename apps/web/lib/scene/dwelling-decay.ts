// Rozpad obydlí bez Babylonu (population.md – Co hráč vidí, Martin 18. 10. 2026: „jako se nový
// dům postupně staví, tak starý a opuštěný dům se musí postupně rozpadat“): stupeň podle stavu
// obydlí, co který stupeň ukáže (díly z models/dwellings/decay.glb – tools/blender/dwellings.py,
// jáma, hlína u vchodu, plot a záhony pozemku, kopřivy) a zbytek jámy po zániku obydlí, který
// RUIN_YEARS let zarůstá. Stupně platí pro každé obydlí – i obydlené, kterému nestačí opravy.
// Souřadnice modelu jako `localToWorld` (x napříč, z k vchodu).
import type { DwellingType, Position } from '@bohemia/game';
import { PIT_SHAPES, type PitShape } from './dwelling-pit';
import { localToWorld, seededRandom, smoothstep } from './village-layout';

/** Stupeň rozpadu: 0 celý dům, 1 sešlý, 2 propadá se, 3 zřícený. */
export type DecayStage = 0 | 1 | 2 | 3;
export const DECAY_STAGES: readonly DecayStage[] = [0, 1, 2, 3];

/**
 * Od jakého stavu obydlí (0–1) platí stupeň: celý dům 100–70 %, sešlý 70–45 %, propadá se
 * 45–20 %, zřícený 20–0 % (population.md – Chátrání a přestavba).
 */
export const DECAY_FROM: Record<DecayStage, number> = { 0: 0.7, 1: 0.45, 2: 0.2, 3: 0 };

export const DECAY_LABELS: Record<DecayStage, string> = {
  0: 'celý dům',
  1: 'sešlý – došky prořídlé, mech, opadaná omítka',
  2: 'propadá se – díry v doškách, krov, prověšený hřeben',
  3: 'zřícený – střecha v jámě, trčí krokve, stěny rozpadlé',
};

/** Stupeň rozpadu podle stavu obydlí (bez údaje = celý dům). */
export function decayStage(condition: number | undefined): DecayStage {
  const c = condition ?? 1;
  if (c >= DECAY_FROM[0]) return 0;
  if (c >= DECAY_FROM[1]) return 1;
  if (c >= DECAY_FROM[2]) return 2;
  return 3;
}

/** Co stupeň rozpadu ukáže kromě dílů modelu. */
export interface DecayLook {
  /** Jak moc kryje jámu střecha 0–1 (tma uvnitř – dwelling-pit.ts). */
  roofCover: number;
  /** Krytí vyšlapané hlíny u vchodu, když v obydlí někdo bydlí (prázdné zarůstá víc). */
  earth: number;
  /** Z obývaného obydlí stoupá dým (ze zřícené střechy už ne). */
  smoke: boolean;
  /** Rozpad plotu pozemku 0–1 (0 = celý). */
  fence: number;
  /** Jak moc záhony pozemku zarostly plevelem 0–1. */
  beds: number;
  /** Kolik trsů kopřiv roste kolem domu. */
  nettles: number;
}

export const DECAY_LOOKS: Record<DecayStage, DecayLook> = {
  0: { roofCover: 1, earth: 1, smoke: true, fence: 0, beds: 0, nettles: 0 },
  1: { roofCover: 0.92, earth: 1, smoke: true, fence: 0, beds: 0, nettles: 0 },
  // od propadající se střechy padá i plot a záhony zarůstají (Martin)
  2: { roofCover: 0.55, earth: 0.75, smoke: true, fence: 0.45, beds: 0.55, nettles: 3 },
  3: { roofCover: 0.2, earth: 0.35, smoke: false, fence: 0.85, beds: 1, nettles: 6 },
};

/**
 * Díly decay.glb pro stupeň (konstrukce, zbylé došky, zarostlé došky); celý dům je hotový model
 * obydlí – žádné díly.
 */
export function decayModelParts(type: DwellingType, stage: DecayStage): string[] {
  if (stage === 0) return [];
  return [`${type}-${stage}`, `${type}-${stage}-thatch`, `${type}-${stage}-moss`];
}

// --- zbytek jámy po zaniklém obydlí -----------------------------------------------------

/** Co zbytek jámy ukáže podle toho, jak zarostl (0 = den zániku, 1 = zmizel). */
export interface RuinLook {
  /** Hloubka prohlubně pod patou obydlí (m) – jáma se zasypává a zarůstá. */
  depth: number;
  /** Díl s trámy na dně (decay.glb), nebo null – trámy shnily. */
  beams: 'ruin' | 'ruin-late' | null;
  /** Výška zbytků valů kolem (násobek dílu `<typ>-ruin-berms`, 0 = srovnané). */
  berms: number;
  /** Trsy kopřiv – kolik a jak velké. */
  nettles: { count: number; scale: number };
}

/** Zarůstání po krocích 5 % – vzhled se mění jen po krocích (kreslí se jen při změně). */
export const RUIN_LOOK_STEPS = 20;

export function ruinLook(type: DwellingType, overgrowth: number): RuinLook {
  const g = Math.round(Math.min(1, Math.max(0, overgrowth)) * RUIN_LOOK_STEPS) / RUIN_LOOK_STEPS;
  const depth = PIT_SHAPES[type].depth * (0.55 - 0.42 * g);
  // kopřivy hned vzejdou (dusík z popela a smetí), nejbujnější pár let po zániku, pak je zarůstá tráva
  const scale = 0.55 + 0.45 * smoothstep(0, 0.3, g) - 0.35 * smoothstep(0.6, 1, g);
  return {
    depth,
    beams: g < 0.4 ? 'ruin' : g < 0.8 ? 'ruin-late' : null,
    berms: 1 - 0.75 * g,
    nettles: { count: g < 0.9 ? 7 : 4, scale },
  };
}

/**
 * Řez terénu zbytku jámy: jen obdélník jámy – šíje se schody se zasypala první (tvar bez šíje:
 * nulová šířka, délka po zadní okraj obdélníku kvůli obdélníku všech jam v shaderu).
 */
export function ruinPitShape(type: DwellingType): PitShape {
  const shape = PIT_SHAPES[type];
  return { ...shape, rampHalfX: 0, rampEndZ: shape.halfZ };
}

export type HeightFn = (x: number, z: number) => number;

export interface RuinHollowOptions {
  /** Pata obydlí (výška scény) – dno prohlubně je o `depth` níž. */
  base: number;
  depth: number;
  /** Výška vykresleného terénu – okraj prohlubně na ni přesně dosedá. */
  rim: HeightFn;
  /** Jak zbytek zarostl 0–1 – dno tmavne a zelená méně. */
  overgrowth: number;
}

export interface RuinHollowData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/** Krok sítě prohlubně (m) a délka opakování textury trávy (jako obtisky vsi). */
const HOLLOW_STEP_M = 0.3;
const HOLLOW_UV_M = 20;
/** Okraj prohlubně nad terénem (m) – zakryje škvíru mezi řezem terénu a sítí. */
const HOLLOW_RIM_LIFT_M = 0.015;

/**
 * Výška zarostlé prohlubně v bodě světa (x, z): mimo obdélník jámy terén, uvnitř k prostředku
 * měkce klesá na dno o `depth` pod patou – kopřivy a trámy na dně stojí na ní.
 */
export function ruinHollowY(
  type: DwellingType,
  position: Position,
  o: Pick<RuinHollowOptions, 'base' | 'depth' | 'rim'>,
  x: number,
  z: number,
): number {
  const { halfX: hx, halfZ: hz } = PIT_SHAPES[type];
  const c = Math.cos(position.rotation);
  const s = Math.sin(position.rotation);
  const dx = x - position.x;
  const dz = z - position.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const rim = o.rim(x, z);
  if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) return rim;
  return hollowY(rim, o.base - o.depth, hollowBowl(hx, hz, lx, lz));
}

/** Jak hluboko je bod v prohlubni 0–1 (0 na okraji jámy, 1 na dně). */
function hollowBowl(hx: number, hz: number, lx: number, lz: number): number {
  const slump = 0.75 * Math.min(hx, hz);
  return smoothstep(0, slump, hx - Math.abs(lx)) * smoothstep(0, slump, hz - Math.abs(lz));
}

function hollowY(rim: number, floor: number, bowl: number): number {
  return Math.min(rim, rim + (floor - rim) * bowl);
}

/**
 * Zarostlá prohlubeň: síť přes obdélník jámy (řez terénu – `ruinPitShape`), okraj přesně na
 * terénu, k prostředku měkce klesá na dno o `depth` pod patou. Barvy ve vrcholech: dole tmavší
 * a sytější zeleň (vlhko, kopřivy), s časem se srovná s okolní trávou. Normály dopočítá scéna.
 */
export function ruinHollowData(
  type: DwellingType,
  position: Position,
  o: RuinHollowOptions,
): RuinHollowData {
  const { halfX: hx, halfZ: hz } = PIT_SHAPES[type];
  const nx = Math.max(2, Math.ceil((2 * hx) / HOLLOW_STEP_M));
  const nz = Math.max(2, Math.ceil((2 * hz) / HOLLOW_STEP_M));
  const floor = o.base - o.depth;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const lx = -hx + (2 * hx * i) / nx;
      const lz = -hz + (2 * hz * j) / nz;
      const [x, z] = localToWorld(position, lx, lz);
      const rim = o.rim(x, z);
      const edge = i === 0 || j === 0 || i === nx || j === nz;
      const bowl = hollowBowl(hx, hz, lx, lz);
      const y = edge ? rim + HOLLOW_RIM_LIFT_M : hollowY(rim, floor, bowl);
      positions.push(x, y, z);
      uvs.push(x / HOLLOW_UV_M, z / HOLLOW_UV_M);
      const shade = 1 - (0.3 - 0.15 * o.overgrowth) * bowl;
      colors.push(0.84 * shade, 0.95 * shade, 0.74 * shade, 1);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      // přední strana nahoru (Babylon: (b−a)×(c−a) míří od pozorovatele, jako terén)
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    positions: Float32Array.from(positions),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  };
}

/** Trs kopřiv ve světě (díl `nettle` z decay.glb). */
export interface NettlePlacement {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/** Kopřivy u domu rostou za valy u okapu (x) a za zadním štítem (−z) – vzdálenost od středu (m). */
const HOUSE_NETTLES_M: Record<DwellingType, { x: number; z: number }> = {
  zemnice: { x: 3.0, z: 2.9 },
  polozemnice: { x: 3.05, z: 3.0 },
};

/**
 * Kopřivy (rostou na dusíkem bohaté půdě kolem stavení), pevně podle `seed`: u rozpadlého domu
 * (`around: 'house'`) za valy podél obou boků a za zadním štítem, ve zbytku jámy (`'pit'`) po
 * okraji prohlubně kousek dovnitř i ven. `count` trsů, velikost kolem `scale`.
 */
export function decayNettles(
  type: DwellingType,
  position: Position,
  seed: number,
  count: number,
  scale: number,
  around: 'house' | 'pit',
): NettlePlacement[] {
  if (count <= 0) return [];
  const rnd = seededRandom(7_000_003 + seed * 104_729);
  const pit = PIT_SHAPES[type];
  const [hx, hz] =
    around === 'pit' ? [pit.halfX, pit.halfZ] : [HOUSE_NETTLES_M[type].x, HOUSE_NETTLES_M[type].z];
  // u domu jen boky a zadní štít (vpředu je vchod a vyšlapaná hlína), v jámě celý obvod
  const sides: [number, number, number, number][] =
    around === 'pit'
      ? [
          [-hx, -hz, hx, -hz],
          [hx, -hz, hx, hz],
          [hx, hz, -hx, hz],
          [-hx, hz, -hx, -hz],
        ]
      : [
          [-hx, hz * 0.6, -hx, -hz],
          [-hx, -hz, hx, -hz],
          [hx, -hz, hx, hz * 0.6],
        ];
  const lengths = sides.map(([ax, az, bx, bz]) => Math.hypot(bx - ax, bz - az));
  const total = lengths.reduce((sum, l) => sum + l, 0);
  const out: NettlePlacement[] = [];
  for (let k = 0; k < count; k++) {
    let s = ((k + rnd() * 0.8) / count) * total;
    let side = 0;
    while (side < sides.length - 1 && s > lengths[side]!) s -= lengths[side++]!;
    const [ax, az, bx, bz] = sides[side]!;
    const t = Math.min(1, s / lengths[side]!);
    // kousek dovnitř i ven od čáry (v jámě víc dovnitř – na dno, u domu ven od valu)
    const shift = around === 'pit' ? (rnd() - 0.35) * 0.9 : -rnd() * 0.6;
    const lx = ax + (bx - ax) * t;
    const lz = az + (bz - az) * t;
    const [x, z] = localToWorld(
      position,
      lx - Math.sign(lx) * (Math.abs(lx) >= hx - 1e-9 ? shift : 0),
      lz - Math.sign(lz) * (Math.abs(lz) >= hz - 1e-9 ? shift : 0),
    );
    out.push({ x, z, rotationY: rnd() * Math.PI * 2, scale: scale * (0.75 + 0.5 * rnd()) });
  }
  return out;
}
