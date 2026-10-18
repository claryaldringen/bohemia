import { DWELLING_FOOTPRINT_M, SACRED_BUILDINGS, type TileCell } from '@bohemia/game';
import type { SceneVillage } from '../village-view';

// Výběr obydlí, polí, sadů a hřbitovů kliknutím do scény – čisté funkce bez Babylonu (paprsek
// z kamery dodá scéna jako čísla).

/**
 * Co je ve vsi vybrané: obydlí (hotové i rozestavěné – id ze scény vsi), pole, hřbitov, sad,
 * posvátný dub (id stromu), dubový háj (id středového dubu), nebo modla či svatyně (id stavby –
 * hotová i rozestavěná, happiness.md).
 */
export type VillageTarget =
  | { kind: 'dwelling'; id: number }
  | { kind: 'field'; id: number }
  | { kind: 'cemetery'; id: number }
  | { kind: 'orchard'; id: number }
  | { kind: 'sacred-oak'; id: number }
  | { kind: 'grove'; id: number }
  | { kind: 'sacred'; id: number };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Paprsek z kamery pod kurzorem: počátek a směr (nemusí být jednotkový). */
export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/** Jak vysoko nad zemí ještě kliknutí trefí obydlí (střecha, m). */
const DWELLING_PICK_HEIGHT_M = 3.5;
const DWELLING_PICK_STEP_M = 0.5;
/** Kolik metrů kolem půdorysu se ještě počítá jako zásah (okap střechy, nepřesná ruka). */
const DWELLING_PICK_MARGIN_M = 1;
/** Výška modly a svatyně pro výběr paprskem (m) – modla ≈ 2,9 m, svatyně s modlou ≈ 4,4 m. */
const SACRED_PICK_HEIGHT_M = { idol: 3, shrine: 4.5 } as const;
/** Posvátný dub: zásah do `radius` od kmene, od země do koruny (m). */
export const SACRED_OAK_PICK = { radiusM: 4, heightM: 12, stepM: 1 } as const;

/** Bod paprsku ve výšce `y` (x, z) a jeho parametr t; null, když paprsek výšku neprotne vpřed. */
export function rayAtHeight(ray: Ray, y: number): { x: number; z: number; t: number } | null {
  const dy = ray.direction.y;
  if (Math.abs(dy) < 1e-9) return null;
  const t = (y - ray.origin.y) / dy;
  if (t < 0) return null;
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t, t };
}

/** Leží bod (x, z) v půdorysu obydlí (natočeném o `rotation`) zvětšeném o `margin`? */
export function insideFootprint(
  point: { x: number; z: number },
  dwelling: SceneVillage['dwellings'][number],
  margin = DWELLING_PICK_MARGIN_M,
): boolean {
  const { width, depth } = DWELLING_FOOTPRINT_M[dwelling.type];
  const dx = point.x - dwelling.position.x;
  const dz = point.z - dwelling.position.z;
  // do místních os obydlí: vchod míří do (sin r, cos r) – to je místní +z
  const r = dwelling.position.rotation;
  const localX = dx * Math.cos(r) - dz * Math.sin(r);
  const localZ = dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(localX) <= width / 2 + margin && Math.abs(localZ) <= depth / 2 + margin;
}

/** Leží bod (x, z) v půdorysu modly nebo svatyně (natočeném) zvětšeném o `margin`? */
export function insideSacredFootprint(
  point: { x: number; z: number },
  building: NonNullable<SceneVillage['sacred']>['buildings'][number],
  margin = DWELLING_PICK_MARGIN_M,
): boolean {
  const half = SACRED_BUILDINGS[building.kind].footprintM / 2 + margin;
  const dx = point.x - building.position.x;
  const dz = point.z - building.position.z;
  const r = building.position.rotation;
  const localX = dx * Math.cos(r) - dz * Math.sin(r);
  const localZ = dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(localX) <= half && Math.abs(localZ) <= half;
}

/**
 * Co je pod kurzorem: obydlí, které paprsek protne od země do výšky střechy (nejbližší ke
 * kameře), pak modla nebo svatyně (paprsek přes půdorys do výšky modly), posvátný dub (paprsek
 * do 4 m od kmene od země do koruny), jinak obydlí, jehož pozemek (políčko), pole, hřbitov, sad
 * nebo dubový háj leží pod bodem terénu `ground`; null = prázdná zem.
 */
export function pickVillageTarget(
  village: SceneVillage,
  ray: Ray,
  options: {
    /** Bod terénu pod kurzorem, nebo null (mimo krajinu). */
    ground: { x: number; z: number } | null;
    groundHeight(x: number, z: number): number;
    cellOf(x: number, z: number): TileCell | null;
  },
): VillageTarget | null {
  let best: { id: number; t: number } | null = null;
  for (const dwelling of village.dwellings) {
    const base = options.groundHeight(dwelling.position.x, dwelling.position.z);
    for (let h = 0; h <= DWELLING_PICK_HEIGHT_M; h += DWELLING_PICK_STEP_M) {
      const point = rayAtHeight(ray, base + h);
      if (!point || !insideFootprint(point, dwelling)) continue;
      if (best === null || point.t < best.t) best = { id: dwelling.id, t: point.t };
      break;
    }
  }
  if (best) return { kind: 'dwelling', id: best.id };
  const sacred = village.sacred;
  for (const building of sacred?.buildings ?? []) {
    const base = options.groundHeight(building.position.x, building.position.z);
    const top = SACRED_PICK_HEIGHT_M[building.kind];
    for (let h = 0; h <= top; h += DWELLING_PICK_STEP_M) {
      const point = rayAtHeight(ray, base + h);
      if (!point || !insideSacredFootprint(point, building, 0.5)) continue;
      if (best === null || point.t < best.t) best = { id: building.id, t: point.t };
      break;
    }
  }
  if (best) return { kind: 'sacred', id: best.id };
  const { radiusM, heightM, stepM } = SACRED_OAK_PICK;
  for (const oak of sacred?.oaks ?? []) {
    const base = options.groundHeight(oak.x, oak.z);
    for (let h = 0; h <= heightM; h += stepM) {
      const point = rayAtHeight(ray, base + h);
      if (!point || Math.hypot(point.x - oak.x, point.z - oak.z) > radiusM) continue;
      if (best === null || point.t < best.t) best = { id: oak.id, t: point.t };
      break;
    }
  }
  if (best) return { kind: 'sacred-oak', id: best.id };
  if (!options.ground) return null;
  const cell = options.cellOf(options.ground.x, options.ground.z);
  if (!cell) return null;
  const owner = village.dwellings.find(
    (d) => d.plot?.cell.x === cell.x && d.plot.cell.y === cell.y,
  );
  if (owner) return { kind: 'dwelling', id: owner.id };
  const field = village.fields.find((f) =>
    f.parts.some((p) => p.cell.x === cell.x && p.cell.y === cell.y),
  );
  if (field) return { kind: 'field', id: field.id };
  const cemetery = (village.cemeteries ?? []).find((c) =>
    c.squares.some((s) => s.cell.x === cell.x && s.cell.y === cell.y),
  );
  if (cemetery) return { kind: 'cemetery', id: cemetery.id };
  const orchard = (village.orchards ?? []).find((o) =>
    o.squares.some((s) => s.cell.x === cell.x && s.cell.y === cell.y),
  );
  if (orchard) return { kind: 'orchard', id: orchard.id };
  const grove = (sacred?.groves ?? []).find((g) =>
    g.squares.some((s) => s.cell.x === cell.x && s.cell.y === cell.y),
  );
  return grove ? { kind: 'grove', id: grove.id } : null;
}

/** Existuje vybraný cíl ve vsi (po obnovení stavu mohl zaniknout)? */
export function targetExists(village: SceneVillage, target: VillageTarget): boolean {
  if (target.kind === 'dwelling') return village.dwellings.some((d) => d.id === target.id);
  if (target.kind === 'cemetery') {
    return (village.cemeteries ?? []).some((c) => c.id === target.id);
  }
  if (target.kind === 'orchard') return (village.orchards ?? []).some((o) => o.id === target.id);
  if (target.kind === 'sacred-oak') {
    return (village.sacred?.oaks ?? []).some((o) => o.id === target.id);
  }
  if (target.kind === 'grove')
    return (village.sacred?.groves ?? []).some((g) => g.id === target.id);
  if (target.kind === 'sacred') {
    return (village.sacred?.buildings ?? []).some((b) => b.id === target.id);
  }
  return village.fields.some((f) => f.id === target.id);
}
