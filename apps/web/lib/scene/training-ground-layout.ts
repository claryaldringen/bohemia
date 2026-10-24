// Cvičiště vojvodovy rodiny (docs/design/lord.md – Terče a cvičiště na dvorku): rozmístění terčů,
// plůtku, cvičného kůlu, stojanu se zbraněmi a kůlu na koně a místa cvičících. Jen scéna – terče
// nejsou stavba ani překážka, nemají stav; poloha se odvodí z obydlí vojvody a jeho pozemku. Síť
// pěšin ani vrstvu překážek nemění. Čisté funkce bez Babylonu.
import { FENCE_INSET_M, type Position } from '@bohemia/game';
import type { SceneVillage } from '../village-view';
import type { PlotSquare, Rect } from './homestead-layout';

/** Díl cvičiště (model `training.glb` – tools/blender/training_ground.py). */
export type TrainingPart = 'target' | 'backstop' | 'post' | 'rack' | 'hitch';

/** Díl cvičiště ve světě – natočení modelu (model míří na +Z, (sin r, cos r)). */
export interface TrainingPiece extends Position {
  part: TrainingPart;
}

/** Místo cvičícího a kam hledí (jednotkový vektor). */
export interface TrainingSpot {
  x: number;
  z: number;
  headingX: number;
  headingZ: number;
}

/** Dráha střelnice: kde střílí, kde čeká na střídačku a terč dráhy. */
export interface TrainingLane {
  shoot: TrainingSpot;
  wait: TrainingSpot;
  target: { x: number; z: number };
}

export interface TrainingGround {
  /** Obydlí vojvody (id), u kterého cvičiště stojí. */
  home: number;
  pieces: TrainingPiece[];
  /** Dráhy střelnice – u dvorce 2 terče, bez dvorce 1. */
  lanes: TrainingLane[];
  /** Dvojice s dřevěnými zbraněmi a proutěnými štíty – čelem k sobě. */
  pairs: [TrainingSpot, TrainingSpot][];
  /** Místo u cvičného kůlu (čelem ke kůlu). */
  post: TrainingSpot;
}

/**
 * Délka střelnice dvorce (m – lord.md, návrh Clauda: ≈ 20 m podél delší osy dvorku). Pozemek
 * dvorce má ≈ 30 × 15 m, střelnice proto vede pruhem vedle domu až ke konci dvora.
 */
export const RANGE_M = 20;
/** Bez dvorce: terč ≈ 10 m od obydlí (lord.md), střelec 2 m od něj. */
const HUT_TARGET_M = 10;
const HUT_SHOOT_M = 2;
/** Rozestup terčů (m) – kotouče ≈ 1 m vedle sebe. */
const LANE_GAP_M = 1.7;
/** Čekající na střídačku stojí kousek za střelcem (m). */
const WAIT_BEHIND_M = 1.4;
/** Terče před koncem dvora (m od plotu); proutěný plůtek za nimi. */
const TARGET_FROM_FENCE_M = 1.8;
const BACKSTOP_FROM_FENCE_M = 0.8;
/** Dvojice: rozestup soupeřů (m). */
const PAIR_GAP_M = 1.6;
/** Cvičící u kůlu stojí metr před ním. */
const POST_REACH_M = 1.0;

interface Frame {
  ox: number;
  oz: number;
  /** Osa a (podél dvorku – od domu ke dvoru) a osa l (napříč). */
  ux: number;
  uz: number;
  vx: number;
  vz: number;
}

function at(f: Frame, a: number, l: number): { x: number; z: number } {
  return { x: f.ox + f.ux * a + f.vx * l, z: f.oz + f.uz * a + f.vz * l };
}

function spot(f: Frame, a: number, l: number, ha: number, hl: number): TrainingSpot {
  const p = at(f, a, l);
  const hx = f.ux * ha + f.vx * hl;
  const hz = f.uz * ha + f.vz * hl;
  const n = Math.hypot(hx, hz) || 1;
  return { x: p.x, z: p.z, headingX: hx / n, headingZ: hz / n };
}

function piece(
  f: Frame,
  part: TrainingPart,
  a: number,
  l: number,
  ha: number,
  hl: number,
): TrainingPiece {
  const s = spot(f, a, l, ha, hl);
  return { part, x: s.x, z: s.z, rotation: Math.atan2(s.headingX, s.headingZ) };
}

/** Osy dvorce: počátek ve středu políčka domu, osa a k dvoru, osa l napříč (strana `side`). */
function manorFrame(square: PlotSquare, side: 1 | -1): Frame {
  const yard = square.yard ?? { x: square.x, z: square.z - square.size };
  const dx = yard.x - square.x;
  const dz = yard.z - square.z;
  const n = Math.hypot(dx, dz) || 1;
  const ux = dx / n;
  const uz = dz / n;
  return { ox: square.x, oz: square.z, ux, uz, vx: -uz * side, vz: ux * side };
}

/** Střed pruhu střelnice napříč dvorkem – mezi zdí dvorce (3,55 m od osy) a plotem. */
function laneCenter(square: PlotSquare): number {
  return square.size * 0.35;
}

/** Konec dvora u plotu (osa a), terče kousek před ním. */
function farEnd(square: PlotSquare): number {
  return square.size * 1.5 - FENCE_INSET_M;
}

/**
 * Cvičiště na dvorku dvorce (návrh Clauda): podél delší osy pruhem vedle domu střelnice ≈ 20 m
 * se 2 terči na konci dvora a proutěným plůtkem za nimi – brána stojí uprostřed konce dvora, pruh
 * střelnice ji míjí. Na druhé straně dvorku cvičný kůl u plotu, stojan se zbraněmi, dvě místa pro
 * dvojice a u brány kůl na koně.
 */
export function manorTrainingGround(
  square: PlotSquare,
  home = 0,
  side: 1 | -1 = 1,
): TrainingGround {
  const f = manorFrame(square, side);
  const s = square.size;
  const end = farEnd(square);
  const aTarget = end - TARGET_FROM_FENCE_M;
  const aShoot = aTarget - RANGE_M;
  const lc = laneCenter(square);
  const inner = s / 2 - FENCE_INSET_M;
  const lanes: TrainingLane[] = [-0.5, 0.5].map((k) => {
    const l = lc + k * LANE_GAP_M;
    return {
      shoot: spot(f, aShoot, l, 1, 0),
      wait: spot(f, aShoot - WAIT_BEHIND_M, l, 1, 0),
      target: at(f, aTarget, l),
    };
  });
  // druhá strana dvorku (záporné l): kůl u plotu, stojan, dvojice mezi nimi a cestou k bráně
  const postA = s + 1.5;
  const postL = -(inner - 1.0);
  const pairL = -3.2;
  const pairs = [s - 1.5, s + 3.5].map((a): [TrainingSpot, TrainingSpot] => [
    spot(f, a, pairL + PAIR_GAP_M / 2, 0, -1),
    spot(f, a, pairL - PAIR_GAP_M / 2, 0, 1),
  ]);
  return {
    home,
    pieces: [
      ...lanes.map((lane) => {
        const t = lane.target;
        return { part: 'target' as const, x: t.x, z: t.z, rotation: Math.atan2(-f.ux, -f.uz) };
      }),
      piece(f, 'backstop', end - BACKSTOP_FROM_FENCE_M, lc, -1, 0),
      piece(f, 'post', postA, postL, 0, 1),
      piece(f, 'rack', s - 4.5, -(inner - 0.6), 0, 1),
      piece(f, 'hitch', end - 1.0, -2.6, -1, 0),
    ],
    lanes,
    pairs,
    post: spot(f, postA, postL + POST_REACH_M, 0, -1),
  };
}

/**
 * Pruh střelnice dvorce ve světě (obdélník v osách světa – dvorec natočený není): záhony kolem
 * domu ho vynechají (homestead-layout.ts), ať střelci nestojí v zelí.
 */
export function rangeStrip(square: PlotSquare): Rect {
  const f = manorFrame(square, 1);
  const lc = laneCenter(square);
  const aTarget = farEnd(square) - TARGET_FROM_FENCE_M;
  const corners = [
    at(f, aTarget - RANGE_M - WAIT_BEHIND_M - 0.8, lc - LANE_GAP_M),
    at(f, aTarget + 0.8, lc + LANE_GAP_M),
  ];
  return {
    minX: Math.min(corners[0]!.x, corners[1]!.x),
    maxX: Math.max(corners[0]!.x, corners[1]!.x),
    minZ: Math.min(corners[0]!.z, corners[1]!.z),
    maxZ: Math.max(corners[0]!.z, corners[1]!.z),
  };
}

/**
 * Bez dvorce (vojvoda v první zemnici – lord.md): 1 terč ≈ 10 m od obydlí na straně odvrácené od
 * ostatních obydlí (střílí se ven ze vsi) a kůl stranou. Osamělé obydlí míří před vchod.
 * `clearM` = jak daleko od středu obydlí sahá dům (pozemek).
 */
export function hutTrainingGround(
  home: Position,
  clearM: number,
  others: readonly { x: number; z: number }[],
  id = 0,
): TrainingGround {
  let dx = Math.sin(home.rotation);
  let dz = Math.cos(home.rotation);
  if (others.length > 0) {
    const cx = others.reduce((sum, o) => sum + o.x, 0) / others.length;
    const cz = others.reduce((sum, o) => sum + o.z, 0) / others.length;
    const n = Math.hypot(home.x - cx, home.z - cz);
    if (n > 1e-6) {
      dx = (home.x - cx) / n;
      dz = (home.z - cz) / n;
    }
  }
  const f: Frame = { ox: home.x, oz: home.z, ux: dx, uz: dz, vx: -dz, vz: dx };
  const target = at(f, clearM + HUT_TARGET_M, 0);
  const postA = clearM + 4;
  const postL = 3.5;
  return {
    home: id,
    pieces: [
      { part: 'target', x: target.x, z: target.z, rotation: Math.atan2(-dx, -dz) },
      piece(f, 'post', postA, postL, 0, -1),
    ],
    lanes: [
      {
        shoot: spot(f, clearM + HUT_SHOOT_M, 0, 1, 0),
        wait: spot(f, clearM + HUT_SHOOT_M - WAIT_BEHIND_M, 0.6, 1, 0),
        target,
      },
    ],
    pairs: [
      [spot(f, postA, -3 + PAIR_GAP_M / 2, 0, -1), spot(f, postA, -3 - PAIR_GAP_M / 2, 0, 1)],
    ],
    post: spot(f, postA, postL - POST_REACH_M, 0, 1),
  };
}

/** Jak daleko od středu sahá zemnice či polozemnice bez pozemku (m) – terč za ní. */
const HUT_CLEAR_M = 4;

/**
 * Cvičiště vsi: stojí, kdykoli má vojvoda dvorec (obydlí s dvorem – lord.md, „s dvorcem chátrají
 * a zmizí“); bez dvorce jen u obydlí rodiny, která dnes cvičí (`labor.lord.home`). Jinak null.
 */
export function trainingGroundOf(
  village: Pick<SceneVillage, 'dwellings' | 'labor'>,
): TrainingGround | null {
  const manor = village.dwellings.find((d) => d.built && d.plot?.yard);
  if (manor?.plot?.yard) {
    const { x, z, size, yard } = manor.plot;
    return manorTrainingGround({ x, z, size, yard: { x: yard.x, z: yard.z } }, manor.id);
  }
  const homeId = village.labor?.lord?.home;
  const home = village.dwellings.find((d) => d.id === homeId && d.built);
  if (!home) return null;
  const others = village.dwellings
    .filter((d) => d.id !== home.id)
    .map((d) => ({ x: d.position.x, z: d.position.z }));
  const clear = home.plot ? home.plot.size * 0.7 : HUT_CLEAR_M;
  return hutTrainingGround(home.position, clear, others, home.id);
}
