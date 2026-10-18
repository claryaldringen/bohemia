// Posvátná místa ve scéně bez Babylonu (happiness.md – Co hráč vidí): ohniště svatyně pro dým,
// čáry vytyčení (náhradní tvary a duch), kameny na okraji dubového háje a natočení obětin
// u posvátného dubu. Fáze a díly staveniště modly a svatyně jsou jen ve village-construction.ts
// (druhy „modla“ a „svatyne“ – sedí s {idol,shrine}-construction.glb). Souřadnice modelu jako
// u obydlí (`localToWorld`: x napříč, z k předku – modla a obětiny se dívají do +z).
import { SACRED_BUILDINGS, type Position, type SacredBuildingKind } from '@bohemia/game';
import type { SceneSacred } from '../village-view';
import { decayStage } from './dwelling-decay';
import { cellsBoundary, cellsContain, type CellSquare } from './field-cells';
import { hash01 } from './smoke-schedule';
import { ROUND_SITE_M, SHRINE_PETALS, type SacredKind } from './village-construction';
import { footprintCorners, localToWorld, type Point } from './village-layout';

/** Druh staveniště (village-construction.ts) – předpona dílů v GLB („modla-…“, „svatyne-…“). */
export const SACRED_SITE_KIND: Record<SacredBuildingKind, SacredKind> = {
  idol: 'modla',
  shrine: 'svatyne',
};

/** Modely posvátných míst (`public/models/sacred/`). */
export const SACRED_MODEL_BASE_URL = '/models/sacred/';
export const SACRED_MODELS = {
  idol: 'idol.glb',
  shrine: 'shrine.glb',
  idolConstruction: 'idol-construction.glb',
  shrineConstruction: 'shrine-construction.glb',
  oakOfferings: 'oak-offerings.glb',
  groveStones: 'grove-stones.glb',
  /** Díly rozpadu opuštěné modly a svatyně (abandonment.md – structure-decay.ts). */
  decay: 'sacred-decay.glb',
} as const;

/** Poloměr ohnišť – uprostřed výběžku příkopu (sacred.py – R_FIRE = (R_IN + R_TIP) / 2). */
export const SHRINE_FIRE_RADIUS_M = 12.5;
/** Vnitřní okraj příkopu, hroty a vrcholy okvětí (sacred.py – R_IN, R_CUSP, R_TIP). */
export const SHRINE_RING_M = {
  inner: ROUND_SITE_M.svatyne.outline,
  cusp: 12.1,
  tip: 13.9,
} as const;
/** Udusaný kruh modly (sacred.py – kruh Ø ≈ 4 m). */
export const IDOL_RING_M = ROUND_SITE_M.modla.outline;
/** Dým z ohniště stoupá kousek nad dnem příkopu (m). */
export const SHRINE_SMOKE_LIFT_M = 0.35;

/**
 * Ohniště svatyně v souřadnicích modelu (x napříč, z k předku): uprostřed výběžků příkopu pod
 * úhlem 22,5° + k · 45° od předku (sacred.py – fire-1…fire-8). Rozložení je souměrné, na
 * zrcadlení osy x z Blenderu nezáleží.
 */
export function shrineFireSpots(): Point[] {
  return Array.from({ length: SHRINE_PETALS }, (_, k): Point => {
    const a = Math.PI / SHRINE_PETALS + (k * 2 * Math.PI) / SHRINE_PETALS;
    return [-SHRINE_FIRE_RADIUS_M * Math.sin(a), SHRINE_FIRE_RADIUS_M * Math.cos(a)];
  });
}

/**
 * Ohniště svatyně ve světě – z uzlů fire-1…8 modelu (`spots`, souřadnice modelu), bez nich
 * spočítaná (`shrineFireSpots`).
 */
export function shrineFiresWorld(
  position: Position,
  spots: readonly Point[] = shrineFireSpots(),
): Point[] {
  return spots.map(([x, z]) => localToWorld(position, x, z));
}

/**
 * Vytyčení v souřadnicích modelu – kolíky a provázek mezi nimi (náhrada dílu `stakes`, když se
 * model nenačte): modla kruh, svatyně vnitřní kruh příkopu a okvětí (hroty a vrcholy výběžků).
 */
export function sacredStakeLines(kind: SacredBuildingKind): Point[][] {
  const ring = (radius: number, count: number): Point[] => {
    const points = Array.from({ length: count }, (_, k): Point => {
      const a = (k * 2 * Math.PI) / count;
      return [radius * Math.sin(a), radius * Math.cos(a)];
    });
    return [...points, points[0]!];
  };
  if (kind === 'idol') return [ring(IDOL_RING_M, 8)];
  const lines: Point[][] = [ring(SHRINE_RING_M.inner, 16)];
  const petal: Point[] = [];
  for (let k = 0; k <= SHRINE_PETALS * 2; k++) {
    const a = (k * Math.PI) / SHRINE_PETALS;
    const r = k % 2 === 0 ? SHRINE_RING_M.cusp : SHRINE_RING_M.tip;
    petal.push([r * Math.sin(a), r * Math.cos(a)]);
  }
  lines.push(petal);
  return lines;
}

/** Natočení obětin u posvátného dubu – deterministicky podle id stromu (stužky různě). */
export function oakOfferingRotation(id: number): number {
  return hash01(id, 7, 31) * Math.PI * 2;
}

/**
 * Uschlý a padlý posvátný dub (happiness.md – Posvátný dub): souš dubu a padlý kmen – modely
 * dekorací z 0 A.D. (`public/models/decor/`, licence tamtéž).
 */
export const DEAD_OAK_MODELS = { snag: 'snag-oak', fallen: 'fallen-1' } as const;
/** Výška modelu souše dubu a délka padlého kmene s větvemi (m, z GLB). */
const SNAG_MODEL_HEIGHT_M = 13.13;
const FALLEN_MODEL_LENGTH_M = 14.4;
/** Souš je nižší než živý dub – koruna se rozpadá (podíl výšky dubu). */
const SNAG_HEIGHT_SHARE = 0.75;
/** Padlý kmen s větvemi leží na délku takového podílu výšky dubu. */
const FALLEN_LENGTH_SHARE = 0.7;
/** Velikost dubu, když ji scéna nedostane (střední posvátný dub, m). */
const DEFAULT_OAK_SIZE_M = 20;

/** Souš nebo padlý kmen ve světě – pata, natočení a násobek velikosti modelu. */
export interface DeadOakInstance {
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

type DeadOak = SceneSacred['oaks'][number];

/** Výška dubu v den uschnutí (velikost × zvětšení od ušetření). */
function deadOakHeightM(oak: DeadOak): number {
  return (oak.sizeM ?? DEFAULT_OAK_SIZE_M) * (oak.growth ?? 1);
}

/** Posvátná souš na místě dubu – o čtvrtinu nižší než dub, natočená podle id. */
export function sacredSnagInstance(oak: DeadOak): DeadOakInstance {
  return {
    x: oak.x,
    z: oak.z,
    rotationY: hash01(oak.id, 8, 31) * Math.PI * 2,
    scale: (deadOakHeightM(oak) * SNAG_HEIGHT_SHARE) / SNAG_MODEL_HEIGHT_M,
  };
}

/** Padlý kmen padlé posvátné souše – leží přes místo dubu, natočený podle id. */
export function fallenOakInstance(oak: DeadOak): DeadOakInstance {
  return {
    x: oak.x,
    z: oak.z,
    rotationY: hash01(oak.id, 9, 31) * Math.PI * 2,
    scale: (deadOakHeightM(oak) * FALLEN_LENGTH_SHARE) / FALLEN_MODEL_LENGTH_M,
  };
}

/** Kámen na okraji háje (uzel grove-stones.glb) – pata ve světě, natočení a velikost. */
export interface GroveStone {
  model: 'stone-a' | 'stone-b' | 'altar';
  x: number;
  z: number;
  rotationY: number;
  scale: number;
}

/** Rozteč hraničních kamenů po okraji háje a jak hluboko pod okrajem stojí (m). */
const GROVE_STONE_STEP_M = 7.5;
const GROVE_STONE_INSET_M = 0.7;
const ALTAR_INSET_M = 2.2;

/**
 * Kamenný kruh na okraji háje: hraniční kameny (vysoké a nízké) po obvodu čtverců háje
 * kousek uvnitř, a oltář na okraji nejblíž ke vsi (`toward`, bez vsi k jihu – ke kameře)
 * čelem ven. Deterministicky podle id háje; `accept` vynechá místa (voda).
 */
export function groveStones(
  grove: { id: number; x: number; z: number; squares: readonly CellSquare[] },
  toward: { x: number; z: number } | null,
  accept: (x: number, z: number) => boolean = () => true,
): GroveStone[] {
  if (grove.squares.length === 0) return [];
  const inside = cellsContain(grove.squares);
  const stones: GroveStone[] = [];
  let k = 0;
  let altar: { x: number; z: number; nx: number; nz: number; d: number } | null = null;
  const target = toward ?? { x: grove.x, z: grove.z - 1000 };
  for (const [a, b] of cellsBoundary(grove.squares) as [Point, Point][]) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length <= 0) continue;
    const ux = dx / length;
    const uz = dz / length;
    // normála dovnitř háje (zkouška bodu kousek vedle středu úsečky)
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const flip = inside(mx - uz * 0.5, mz + ux * 0.5) ? 1 : -1;
    const nx = -uz * flip;
    const nz = ux * flip;
    const count = Math.max(1, Math.round(length / GROVE_STONE_STEP_M));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5 + (hash01(grove.id, k, 1) - 0.5) * 0.4) / count;
      const inset = GROVE_STONE_INSET_M + hash01(grove.id, k, 2) * 0.5;
      const x = a[0] + dx * t + nx * inset;
      const z = a[1] + dz * t + nz * inset;
      const tall = hash01(grove.id, k, 3) < 0.65;
      k++;
      if (!accept(x, z)) continue;
      stones.push({
        model: tall ? 'stone-a' : 'stone-b',
        x,
        z,
        rotationY: hash01(grove.id, k, 4) * Math.PI * 2,
        scale: 0.85 + hash01(grove.id, k, 5) * 0.35,
      });
    }
    // oltář: střed úsečky nejblíž ke vsi
    const d = Math.hypot(mx - target.x, mz - target.z);
    if (!altar || d < altar.d) altar = { x: mx, z: mz, nx, nz, d };
  }
  if (altar) {
    const x = altar.x + altar.nx * ALTAR_INSET_M;
    const z = altar.z + altar.nz * ALTAR_INSET_M;
    if (accept(x, z)) {
      // předek oltáře (+z modelu) ven z háje – ke vsi
      const rotationY = Math.atan2(-altar.nx, -altar.nz);
      // hraniční kámen hned vedle oltáře by s ním splýval – vynechat
      const kept = stones.filter((s) => Math.hypot(s.x - x, s.z - z) > 2.5);
      stones.length = 0;
      stones.push(...kept, { model: 'altar', x, z, rotationY, scale: 1 });
    }
  }
  return stones;
}

/** Půdorys modly nebo svatyně ve světě (rohy). */
export function sacredFootprintCorners(kind: SacredBuildingKind, position: Position): Point[] {
  const size = SACRED_BUILDINGS[kind].footprintM;
  return footprintCorners(position, size, size);
}

/** Co z posvátné stavby rozhoduje o vzhledu – průběh po 2 % jako u obydlí. */
export function sacredBuildingKey(b: SceneSacred['buildings'][number]): string {
  const p = b.position;
  return [
    b.kind,
    p.x,
    p.z,
    p.rotation,
    b.built,
    b.built ? '' : Math.round(b.progress * 50),
    // rozpad opuštěné stavby jen po stupních (abandonment.md – structure-decay.ts)
    b.built ? decayStage(b.condition) : '',
    b.abandoned ? 'a' : '',
  ].join('|');
}
