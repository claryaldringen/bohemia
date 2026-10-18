// Rozpad obydlí bez Babylonu (population.md – Co hráč vidí, Martin 18. 10. 2026: „jako se nový
// dům postupně staví, tak starý a opuštěný dům se musí postupně rozpadat“): stupeň podle stavu
// obydlí, co který stupeň ukáže (díly z models/dwellings/decay.glb – tools/blender/dwellings.py,
// jáma, hlína u vchodu, plot a záhony pozemku, kopřivy) a zbytek jámy po zániku obydlí, který
// RUIN_YEARS let zarůstá. Rozpadá se jen prázdné obydlí – obydlený dům obyvatelé opravují (Martin
// 18. 10. 2026: „obydlená budova nechátrá – obyvatelé ji opravují. Chátrá jenom prázdná.“).
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

/**
 * Stupeň rozpadu hotového obydlí ve scéně: rozpadá se jen prázdné (`inhabited: false`) – obydlené
 * je vždy celé, i když mu po dřívějším chátrání zbyl nízký stav (obyvatelé ho opravují, Martin).
 * Řemeslné dílny (`craft`) zatím zůstávají celé – díly rozpadu mají jen obydlí.
 */
export function dwellingDecayStage(d: {
  condition?: number;
  inhabited?: boolean;
  craft?: string;
  type?: DwellingType;
}): DecayStage {
  // dvorec vojvody zatím díly rozpadu nemá – zůstane celý (jako dílny)
  if (d.craft || d.type === 'dvorec' || d.inhabited !== false) return 0;
  return decayStage(d.condition);
}

/** Co stupeň rozpadu ukáže kromě dílů modelu. */
export interface DecayLook {
  /** Jak moc kryje jámu střecha 0–1 (tma uvnitř – dwelling-pit.ts). */
  roofCover: number;
  /** Násobek krytí vyšlapané hlíny u vchodu – u prázdného obydlí s rozpadem zarůstá dál. */
  earth: number;
  /** Rozpad plotu pozemku 0–1 (0 = celý). */
  fence: number;
  /** Jak moc záhony pozemku zarostly plevelem 0–1. */
  beds: number;
  /** Kolik trsů kopřiv roste kolem domu. */
  nettles: number;
}

export const DECAY_LOOKS: Record<DecayStage, DecayLook> = {
  0: { roofCover: 1, earth: 1, fence: 0, beds: 0, nettles: 0 },
  1: { roofCover: 0.92, earth: 1, fence: 0, beds: 0, nettles: 0 },
  // od propadající se střechy padá i plot a záhony zarůstají (Martin)
  2: { roofCover: 0.55, earth: 0.75, fence: 0.45, beds: 0.55, nettles: 3 },
  3: { roofCover: 0.2, earth: 0.35, fence: 0.85, beds: 1, nettles: 6 },
};

/**
 * Díly decay.glb pro stupeň (konstrukce, zbylé došky, zarostlé došky); celý dům je hotový model
 * obydlí – žádné díly.
 */
/**
 * Typ, jehož díly rozpadu a zbytku jámy (decay.glb) obydlí použije – dvorec vojvody (trade.md)
 * vlastní nemá, zbytek jámy po něm je jako po polozemnici.
 */
export function decayModelType(type: DwellingType): Exclude<DwellingType, 'dvorec'> {
  return type === 'dvorec' ? 'polozemnice' : type;
}

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
/** Lem prohlubně nad terénem (m) – zakryje škvíru mezi řezem terénu a sítí. */
const HOLLOW_RIM_LIFT_M = 0.015;
/** Zarostlý val po okraji prohlubně: výška čerstvého zbytku a šířka od okraje dovnitř (m). */
const HOLLOW_BANK = { height: 0.16, width: 1.0 } as const;
/**
 * Lem sítě za okrajem řezu terénu (m) – leží těsně nad terénem a překryje škvíru mezi řezem
 * a sítí, jinak by na okraji prosvítala obloha.
 */
const HOLLOW_LIP_M = 0.08;

/**
 * Výška zarostlé prohlubně v bodě světa (x, z): mimo obdélník jámy terén, uvnitř nízký zarostlý
 * val po okraji (zbytek valů hlíny kolem domu) a k prostředku měkký pokles na dno o `depth` pod
 * patou – kopřivy na dně i na valu stojí na ní.
 */
export function ruinHollowY(
  type: DwellingType,
  position: Position,
  o: Pick<RuinHollowOptions, 'base' | 'depth' | 'rim' | 'overgrowth'>,
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
  return hollowSurface(rim, o.base - o.depth, hx, hz, lx, lz, o.overgrowth);
}

/** Jak hluboko je bod v prohlubni 0–1 (0 na okraji jámy, 1 na dně). */
function hollowBowl(hx: number, hz: number, lx: number, lz: number): number {
  const slump = 0.75 * Math.min(hx, hz);
  return smoothstep(0, slump, hx - Math.abs(lx)) * smoothstep(0, slump, hz - Math.abs(lz));
}

/**
 * Povrch uvnitř jámy: val po okraji (s časem se srovná) a pokles k dnu; dno nikdy nad terénem
 * (na svahu). Na okraji jámy přesně terén.
 */
function hollowSurface(
  rim: number,
  floor: number,
  hx: number,
  hz: number,
  lx: number,
  lz: number,
  overgrowth: number,
): number {
  const edge = Math.max(0, Math.min(hx - Math.abs(lx), hz - Math.abs(lz)));
  const bank =
    edge < HOLLOW_BANK.width
      ? HOLLOW_BANK.height * (1 - 0.7 * overgrowth) * Math.sin((Math.PI * edge) / HOLLOW_BANK.width)
      : 0;
  return rim + bank + Math.min(0, floor - rim) * hollowBowl(hx, hz, lx, lz);
}

/**
 * Zarostlá prohlubeň: síť přes obdélník jámy (řez terénu – `ruinPitShape`) a kousek za něj (lem
 * těsně nad terénem), uvnitř nízký val po okraji a k prostředku měkký pokles na dno o `depth`
 * pod patou (`ruinHollowY`). Barvy ve vrcholech: na okraji tráva beze změny, dole tmavší a sytější
 * zeleň (vlhko, kopřivy), s časem se srovná s okolní trávou. Přední strana nahoru jako terén. Normály dopočítá scéna.
 */
export function ruinHollowData(
  type: DwellingType,
  position: Position,
  o: RuinHollowOptions,
): RuinHollowData {
  const { halfX: hx, halfZ: hz } = PIT_SHAPES[type];
  const ex = hx + HOLLOW_LIP_M;
  const ez = hz + HOLLOW_LIP_M;
  const nx = Math.max(2, Math.ceil((2 * ex) / HOLLOW_STEP_M));
  const nz = Math.max(2, Math.ceil((2 * ez) / HOLLOW_STEP_M));
  const floor = o.base - o.depth;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const lx = -ex + (2 * ex * i) / nx;
      const lz = -ez + (2 * ez * j) / nz;
      const [x, z] = localToWorld(position, lx, lz);
      const rim = o.rim(x, z);
      const inside = Math.abs(lx) < hx && Math.abs(lz) < hz;
      const y = inside
        ? hollowSurface(rim, floor, hx, hz, lx, lz, o.overgrowth)
        : rim + HOLLOW_RIM_LIFT_M;
      const bowl = inside ? hollowBowl(hx, hz, lx, lz) : 0;
      positions.push(x, y, z);
      uvs.push(x / HOLLOW_UV_M, z / HOLLOW_UV_M);
      // na okraji barva trávy beze změny (navazuje na terén), k dnu tmavší a sytější zeleň
      const shade = 1 - (0.3 - 0.15 * o.overgrowth) * bowl;
      const tint = bowl * (1 - 0.5 * o.overgrowth);
      colors.push(
        (1 - 0.16 * tint) * shade,
        (1 - 0.05 * tint) * shade,
        (1 - 0.26 * tint) * shade,
        1,
      );
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      // přední strana nahoru – stejné pořadí a dělení čtverce jako terén a obtisky (decalGrid):
      // v Babylonu (b−a)×(c−a) míří od pozorovatele, tady dolů
      indices.push(a, b, c, b, d, c);
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
  dvorec: { x: 3.3, z: 5.4 },
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
