// Postavy u staveb a dřevorubci: stavitelé, pozemky, hřbitov, ohrada, cesty, jabloně.
import type { LaborActivity, LaborShare, LaborTarget, SceneLaborShare } from '../village-view';
import { cellsBoundary } from './field-cells';
import { hash01 } from './smoke-schedule';
import { shuttle, stand, walkSpeed, type PoseFn, type VillagerClip } from './villager-motion';
import { MILIR_SHAPE_M } from './workshop-layout';
import {
  CREW_MOVE_DAYS,
  FELL_REACH_M,
  FOREST_KILN_HAUL_M,
  HOUSE_MARGIN_M,
  gap,
  none,
  type Context,
  type House,
  type Identity,
  type Placer,
  type Point,
} from './villager-plan-types';
import {
  atTree,
  doorPoint,
  free,
  inBox,
  inSquare,
  nearestFree,
  nearestHouse,
  nearestPoint,
  onGrave,
  squareAxes,
  squareLocal,
  targetKey,
  unit,
  walkRoute,
  worldPoint,
} from './villager-plan-geometry';

/** Práce na stavbě – stavba, kácení jejího dřeva, zakládání pole, výsadba sadu, hřbitov. */
export const CONSTRUCTION_ACTIVITIES: ReadonlySet<LaborActivity> = new Set([
  'build',
  'fell',
  'found-field',
  'orchard-plant',
  'cemetery',
  'pen',
]);

export function isConstructionShare(share: Pick<LaborShare, 'activity'>): boolean {
  return CONSTRUCTION_ACTIVITIES.has(share.activity);
}

/**
 * Každá stavba, která dnes dostala práci, má aspoň jednoho člověka (Martin: budova nesmí růst
 * sama od sebe) – i když by se jí po zaokrouhlení, skupinách po čtyřech nebo omezení počtu
 * postav nikdo nedostal. Stavba = id stavby z jádra (stavba i kácení jejího dřeva), u starších
 * rozdělení bez id místo práce. Chybějící člověk se přidá k největšímu podílu stavby; přes
 * `max` se ubere z největší skupiny, která tím o všechny lidi nepřijde.
 */
export function withBuilderAtEachConstruction(
  shares: readonly Pick<LaborShare, 'activity' | 'manDays' | 'target' | 'construction'>[],
  counts: number[],
  max: number,
): number[] {
  const groups = new Map<string, number[]>();
  shares.forEach((share, i) => {
    if (!isConstructionShare(share) || share.manDays <= 0) return;
    const key =
      share.construction !== undefined
        ? `c${share.construction}`
        : `${share.activity}:${targetKey(share.target)}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const groupOf = new Map<number, number[]>();
  for (const members of groups.values()) for (const i of members) groupOf.set(i, members);
  const people = (members: readonly number[]): number =>
    members.reduce((sum, i) => sum + (counts[i] ?? 0), 0);
  for (const members of groups.values()) {
    if (people(members) > 0) continue;
    const biggest = members.reduce((a, b) => (shares[b]!.manDays > shares[a]!.manDays ? b : a));
    counts[biggest] = (counts[biggest] ?? 0) + 1;
    if (counts.reduce((a, b) => a + b, 0) <= max) continue;
    // nad limit: uber člověka tam, kde je jich nejvíc a kde po něm někdo zůstane
    let donor = -1;
    counts.forEach((count, i) => {
      if (count <= 0) return;
      const group = groupOf.get(i);
      if (group && people(group) <= 1) return;
      if (donor < 0 || count > counts[donor]!) donor = i;
    });
    if (donor >= 0) counts[donor] = counts[donor]! - 1;
  }
  return counts;
}

/**
 * Náhradní místo pro člověka u stavby, když zvláštní rozmístění nevyšlo (strom mimo schůdnou
 * zem, čtverec bez volné řady, staveniště bez volného místa po obvodu): volné místo co nejblíž
 * místu práce – u stromu, na kraji zakládaného čtverce, u staveniště –, čelem k němu.
 */
export function builderNearby(
  ctx: Context,
  share: SceneLaborShare,
  index: number,
  who: Identity,
): PoseFn | null {
  for (const { at, clip } of constructionAnchors(ctx, share)) {
    // lidé kolem místa po zlatém úhlu – nestojí na sobě
    const angle = index * 2.39996 + who.phase;
    const spot = nearestFree(ctx, at.x + Math.cos(angle) * 1.5, at.z + Math.sin(angle) * 1.5, 14);
    if (!spot) continue;
    const h = unit(at.x - spot.x, at.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, clip);
  }
  return null;
}

/** Místa, kde se na stavbě pracuje, od nejpřesnějšího (strom, díl, staveniště). */
export function constructionAnchors(
  ctx: Context,
  share: SceneLaborShare,
): { at: Point; clip: VillagerClip }[] {
  const t = share.target;
  const anchors: { at: Point; clip: VillagerClip }[] = [];
  const houseAt = (id: number): void => {
    const house = ctx.houses.find((h) => h.id === id);
    if (house) anchors.push({ at: house.position, clip: 'build' });
  };
  if (t.kind === 'trees') {
    for (const id of t.ids) {
      const tree = ctx.ground.tree(id);
      if (tree) anchors.push({ at: tree, clip: 'fell' });
    }
  } else if (t.kind === 'site' || t.kind === 'dwelling' || t.kind === 'sacred') {
    houseAt(t.id);
  } else if (t.kind === 'field') {
    const parts = ctx.village.fields.find((f) => f.id === t.id)?.parts ?? [];
    const founding = parts.filter((p) => p.stage === 'founding');
    for (const p of (founding.length > 0 ? founding : parts).slice(0, 3)) {
      anchors.push({ at: p, clip: 'hoe' });
    }
  } else if (t.kind === 'orchard') {
    const squares = (ctx.village.orchards ?? []).find((o) => o.id === t.id)?.squares ?? [];
    const planting = squares.filter((s) => s.planting < 1);
    for (const sq of (planting.length > 0 ? planting : squares).slice(0, 3)) {
      anchors.push({ at: sq, clip: 'hoe' });
    }
  } else if (t.kind === 'cemetery') {
    const squares = (ctx.village.cemeteries ?? []).find((c) => c.id === t.id)?.squares ?? [];
    const pending = squares.filter((s) => s.pending);
    for (const sq of (pending.length > 0 ? pending : squares).slice(0, 3)) {
      anchors.push({ at: sq, clip: 'build' });
    }
  } else if (t.kind === 'pen') {
    const pen = (ctx.village.pens ?? []).find((p) => p.id === t.id);
    // rozšíření ve stavbě – u nových čtverců (oxen.md – Ohrady podle druhu)
    const pending = (pen?.extraSquares ?? []).find((q) => q.pending);
    if (pen) anchors.push({ at: pen.built && pending ? pending : pen, clip: 'build' });
  } else if (t.kind === 'road') {
    const road = (ctx.village.roads ?? []).find((r) => r.id === t.id);
    const middle = road?.points[Math.floor(road.points.length / 2)];
    if (middle) anchors.push({ at: middle, clip: 'hoe' });
  }
  // dřevo pro stavbu: když u stromů místo není, aspoň u stavby, pro kterou se kácí
  if (share.construction !== undefined) houseAt(share.construction);
  return anchors;
}

/**
 * Kácení dřeva stavby: dva lidé u každého vyhrazeného stromu, ostatní nosí dřevo ke stavbě
 * (nejbližší staveniště, jinak obydlí). Kácení řemeslné dílny (`forConstruction` false – uhlíř
 * na milíř, hrnčíř na palivo pece, crafts.md) nosí dřevo k nejbližší dílně, která kácí.
 */
export function felling(ctx: Context, ids: readonly number[], forConstruction = true): Placer {
  const trees = ids.flatMap((id) => {
    const p = ctx.ground.tree(id);
    return p ? [p] : [];
  });
  if (trees.length === 0) return none;
  const sites = forConstruction
    ? ctx.houses.filter((h) => !h.built)
    : ctx.houses.filter((h) => h.built && (h.craft === 'burner' || h.craft === 'potter'));
  // uhlíř v lese nosí polena k lesnímu milíři u dávky (crafts.md – Uhlíř)
  const kilns = forConstruction ? [] : (ctx.village.kilns ?? []);
  return (i, who) => {
    const tree = trees[i % trees.length]!;
    if (i < trees.length * 2) {
      const slot = { ...who, phase: (who.phase + (i >= trees.length ? 0.5 : 0)) % 1 };
      return atTree(ctx, tree, slot, 'fell', FELL_REACH_M);
    }
    const kiln = nearestPoint(kilns, tree, FOREST_KILN_HAUL_M);
    const target = kiln ? null : nearestHouse(sites.length > 0 ? sites : ctx.houses, tree);
    const from = target || kiln ? nearestFree(ctx, tree.x + 1.5, tree.z, 3) : null;
    const to = kiln
      ? nearestFree(ctx, kiln.x + MILIR_SHAPE_M.radius + 1, kiln.z, 3)
      : target
        ? doorPoint(target, -1.5)
        : null;
    if (!to || !from) return atTree(ctx, tree, who, 'fell', FELL_REACH_M + 0.6);
    const path = walkRoute(ctx, to, from);
    if (!path) return atTree(ctx, tree, who, 'fell', FELL_REACH_M + 0.6);
    return shuttle(path, {
      outClip: 'walk',
      outSpeed: walkSpeed(who.kind, 'walk', who.scale),
      endClip: 'weed',
      endS: 3,
      backClip: 'carry-wood',
      backSpeed: walkSpeed(who.kind, 'carry-wood', who.scale),
      restClip: 'idle',
      restS: 2,
      phase: who.phase,
    });
  };
}

/**
 * Stavba a opravy: lidé kolem domu (vně jámy a šíje) čelem k němu – i kolem opravované modly
 * a svatyně (abandonment.md – Oprava). Staveniště v první čtvrtině průběhu se kope motykou
 * (jáma), pak se staví.
 */
export function building(
  ctx: Context,
  target: Extract<LaborTarget, { kind: 'site' | 'dwelling' | 'sacred' }>,
  clip: VillagerClip,
): Placer {
  const house = ctx.houses.find((h) => h.id === target.id && h.built === (target.kind !== 'site'));
  if (!house) return none;
  const digging = !house.built && house.progress < 0.25;
  // polozemnice na pozemku staví plot a záhony až na konci (village-construction.ts)
  const fencing = !house.built && house.plot !== undefined && house.progress >= PLOT_FENCE_FROM;
  if (fencing && house.plot) return plotFence(ctx, house, house.plot);
  if (house.plot) {
    const ring = plotBuilderSpots(ctx, house, house.plot);
    if (ring.length > 0) {
      return (i) => {
        const spot = ring[i % ring.length]!;
        const h = unit(house.position.x - spot.x, house.position.z - spot.z);
        return stand(spot.x, spot.z, h.x, h.z, digging ? 'hoe' : clip);
      };
    }
  }
  const { minX, maxX, minZ, maxZ } = house.own ?? house.box;
  // místa po obvodu (souřadnice domu) – ne před vchodem do šíje
  const slots: [number, number][] = [
    [minX - gap(0.6), 0],
    [maxX + gap(0.6), 0],
    [0, minZ - gap(0.6)],
    [minX - gap(0.6), minZ + 0.8],
    [maxX + gap(0.6), minZ + 0.8],
    [minX - gap(0.6), maxZ - 1.2],
    [maxX + gap(0.6), maxZ - 1.2],
    [minX * 0.6, minZ - gap(0.6)],
    [maxX * 0.6, minZ - gap(0.6)],
  ];
  return (i) => {
    const ring = Math.floor(i / slots.length);
    const [lx, lz] = slots[i % slots.length]!;
    // další kruh o kus dál od domu (do stran a dozadu)
    const p = worldPoint(
      house.position,
      lx + Math.sign(lx) * ring * 1.2,
      lz + (lz < 0 ? -ring * 1.2 : 0),
    );
    const spot = nearestFreeFor(ctx, house, p.x, p.z, 1.5);
    if (!spot) return null;
    const h = unit(house.position.x - spot.x, house.position.z - spot.z);
    return stand(spot.x, spot.z, h.x, h.z, digging ? 'hoe' : clip);
  };
}

/**
 * Stavitelé domu na pozemku: kruhy kolem domu za rekvizitami staveniště (hromada hlíny, drn,
 * dřevo a nářadí leží ≈ 3,5 m od středu – village-construction.ts), jen uvnitř vlastního
 * pozemku a na volné zemi; místa střídavě kolem dokola, ať nestojí vedle sebe.
 */
export const PLOT_BUILDER_RINGS_M = [5, 6.2];

export function plotBuilderSpots(
  ctx: Context,
  house: House,
  plot: { x: number; z: number; size: number; rotation?: number },
): Point[] {
  const inside = plot.size / 2 - gap(0.6);
  const spots: Point[] = [];
  for (const r of PLOT_BUILDER_RINGS_M) {
    for (let k = 0; k < 12; k++) {
      // 0, 6, 3, 9, … – sousední stavitelé na opačných stranách domu
      const order = [0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11][k]!;
      const a = (order / 12) * Math.PI * 2 + house.position.rotation;
      const x = house.position.x + Math.sin(a) * r;
      const z = house.position.z + Math.cos(a) * r;
      const [u, v] = squareLocal(plot, x, z);
      if (Math.abs(u) > inside || Math.abs(v) > inside) continue;
      if (nearestFreeFor(ctx, house, x, z, 0) === null) continue;
      spots.push({ x, z });
    }
  }
  return spots;
}

/** Odkdy staví polozemnice na pozemku plot (fáze `fence` – village-construction.ts). */
export const PLOT_FENCE_FROM = 0.85;

/** Strany pozemku – normály do plotu (x, z). */
export const PLOT_SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** Plot pozemku: stavitelé uvnitř pozemku podél plotu čelem k němu (kůly, proplétání). */
export function plotFence(
  ctx: Context,
  house: House,
  plot: { x: number; z: number; size: number; rotation?: number },
): Placer {
  const inset = plot.size / 2 - gap(0.8);
  const [ax, az] = squareAxes(plot);
  return (i, who) => {
    const side = (i + Math.floor(who.phase * 4)) % 4;
    const along = (((i * 0.37 + who.phase) % 1) * 2 - 1) * inset * 0.8;

    // normála strany v osách pozemku (natočený pozemek natočená)
    const [su, sv] = PLOT_SIDES[side] ?? [1, 0];
    const nx = ax.x * su + az.x * sv;
    const nz = ax.z * su + az.z * sv;
    const x = plot.x + nx * inset - nz * along;
    const z = plot.z + nz * inset + nx * along;
    const spot = nearestFreeFor(ctx, house, x, z, 2);
    return spot ? stand(spot.x, spot.z, nx, nz, i % 2 === 0 ? 'build' : 'weed') : null;
  };
}

/**
 * Volné místo pro stavitele vlastního domu (`nearestFree`): na pozemku smí stát uvnitř svého
 * plotu – jen ne v domě nebo na jeho staveništi (`own`).
 */
export function nearestFreeFor(
  ctx: Context,
  house: House,
  x: number,
  z: number,
  reach: number,
): Point | null {
  if (!house.own) return nearestFree(ctx, x, z, reach);
  const ok = (px: number, pz: number): boolean =>
    ctx.ground.walkable(px, pz) &&
    !onGrave(ctx.graves, px, pz) &&
    !inBox({ ...house, box: house.own! }, px, pz, HOUSE_MARGIN_M) &&
    !ctx.houses.some((h) => h !== house && inBox(h, px, pz, HOUSE_MARGIN_M));
  if (ok(x, z)) return { x, z };
  for (let r = 0.6; r <= reach; r += 0.6) {
    const steps = Math.max(6, Math.round((2 * Math.PI * r) / 0.8));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/**
 * Jabloně podél pevné cesty (roads.md – Vysazení jabloní): sklizeň a péče u stromů (`tree`),
 * výsadba u míst, která na ni čekají (`planting` – okopávají jámu). Po skupinách se přesouvají
 * po řadě jako v sadu.
 */
export function roadApples(
  ctx: Context,
  roadId: number,
  count: number,
  stage: 'tree' | 'planting',
): Placer {
  const trees = (ctx.village.roadApples ?? []).filter(
    (a) => a.roadId === roadId && a.stage === stage,
  );
  if (trees.length === 0) return none;
  const start = Math.floor(ctx.day / CREW_MOVE_DAYS) * count;
  return (i, who) => {
    const tree = trees[(start + i) % trees.length]!;
    return stage === 'tree'
      ? atTree(ctx, tree, who, 'fruit', gap(1.3))
      : atTree(ctx, tree, who, 'hoe', gap(0.9));
  };
}

/**
 * Zakládání a rozšíření hřbitova: lidé na vnějším obvodu ohrazovaných čtverců (plot) čelem
 * dovnitř – nikdy uvnitř na hrobech.
 */
export function cemeteryFence(ctx: Context, cemeteryId: number): Placer {
  const cemetery = (ctx.village.cemeteries ?? []).find((c) => c.id === cemeteryId);
  if (!cemetery) return none;
  const pending = cemetery.squares.filter((s) => s.pending);
  const squares = pending.length > 0 ? pending : cemetery.squares;
  const slots: { x: number; z: number; hx: number; hz: number }[] = [];
  for (const segment of cellsBoundary(squares)) {
    const [a, b] = [segment[0], segment[segment.length - 1]];
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = { x: -(b[1] - a[1]) / length, z: (b[0] - a[0]) / length };
    for (let d = 1.5; d < length - 1; d += 3) {
      const mx = a[0] + ((b[0] - a[0]) * d) / length;
      const mz = a[1] + ((b[1] - a[1]) * d) / length;
      // ven = strana, která neleží v žádném čtverci hřbitova
      for (const side of [1, -1]) {
        const x = mx + n.x * side * gap(0.7);
        const z = mz + n.z * side * gap(0.7);
        const inside = cemetery.squares.some((s) => inSquare(s, x, z, 0));
        if (inside || !free(ctx, x, z)) continue;
        slots.push({ x, z, hx: -n.x * side, hz: -n.z * side });
        break;
      }
    }
  }
  if (slots.length === 0) return none;
  const offset = Math.floor(hash01(cemeteryId, ctx.seed, 95) * slots.length);
  return (i) => {
    const step = Math.max(1, Math.floor(slots.length / 6));
    const slot = slots[(offset + i * step) % slots.length]!;
    return stand(slot.x, slot.z, slot.hx, slot.hz, i % 3 === 2 ? 'hoe' : 'build');
  };
}

/**
 * Stavba ohrady a výroba rádla (oxen.md): lidé po obvodu čtverce ohrady za plotem čelem
 * dovnitř – kůly, proplétání a přístřešek; střídavě kolem dokola.
 */
export function penFence(ctx: Context, penId: number): Placer {
  const found = (ctx.village.pens ?? []).find((p) => p.id === penId);
  if (!found) return none;
  // rozšíření ve stavbě – lidé kolem nového čtverce (oxen.md – Ohrady podle druhu)
  const pending = found.built ? (found.extraSquares ?? []).find((q) => q.pending) : undefined;
  const pen = pending ? { ...found, x: pending.x, z: pending.z } : found;
  const out = pen.size / 2 + HOUSE_MARGIN_M + gap(0.5);
  const slots: { x: number; z: number; hx: number; hz: number }[] = [];
  // strany v osách ohrady (natočená ohrada – fields.md, Natočené stavby)
  const [ax, az] = squareAxes(pen);
  for (const [sx, sz] of PLOT_SIDES) {
    const nx = ax.x * sx + az.x * sz;
    const nz = ax.z * sx + az.z * sz;
    for (const along of [-0.5, 0, 0.5]) {
      const x = pen.x + nx * out - nz * along * pen.size * 0.8;
      const z = pen.z + nz * out + nx * along * pen.size * 0.8;
      if (free(ctx, x, z)) slots.push({ x, z, hx: -nx, hz: -nz });
    }
  }
  if (slots.length === 0) return none;
  const offset = Math.floor(hash01(penId, ctx.seed, 96) * slots.length);
  return (i) => {
    // sousední lidé na opačných stranách ohrady
    const slot = slots[(offset + i * 5) % slots.length]!;
    return stand(slot.x, slot.z, slot.hx, slot.hz, i % 3 === 2 ? 'hoe' : 'build');
  };
}

/**
 * Vylepšení pevné cesty (roads.md): lidé podél úseku po obou okrajích pásu – rozšiřují
 * a srovnávají cestu, kladou kmeny hatě (motyka a stavba střídavě), čelem k ose.
 */
export function roadWork(ctx: Context, roadId: number): Placer {
  const road = (ctx.village.roads ?? []).find((r) => r.id === roadId);
  if (!road || road.points.length < 2) return none;
  const slots: { x: number; z: number; hx: number; hz: number }[] = [];
  const at = [0];
  for (let k = 1; k < road.points.length; k++) {
    const a = road.points[k - 1]!;
    const b = road.points[k]!;
    at.push(at[k - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = at[at.length - 1]!;
  // práce postupuje po cestě – od začátku osy úseku, nebo od konce (`fromEnd`); lidé u čela
  // práce, kousek před ním a za ním
  const done = (road.upgrade?.progress ?? 0) * length;
  const front = road.upgrade?.fromEnd ? length - done : done;
  for (let k = 0; k < 12; k++) {
    const d = Math.min(length, Math.max(0, front + (k - 4) * 3));
    let seg = 1;
    while (seg < road.points.length - 1 && at[seg]! < d) seg++;
    const a = road.points[seg - 1]!;
    const b = road.points[seg]!;
    const span = Math.max(1e-6, at[seg]! - at[seg - 1]!);
    const u = Math.min(1, Math.max(0, (d - at[seg - 1]!) / span));
    const nx = -(b.z - a.z) / span;
    const nz = (b.x - a.x) / span;
    const side = k % 2 === 0 ? 1 : -1;
    const x = a.x + (b.x - a.x) * u + nx * side * gap(1.6);
    const z = a.z + (b.z - a.z) * u + nz * side * gap(1.6);
    if (free(ctx, x, z)) slots.push({ x, z, hx: -nx * side, hz: -nz * side });
  }
  if (slots.length === 0) return none;
  return (i) => {
    const slot = slots[i % slots.length]!;
    return stand(slot.x, slot.z, slot.hx, slot.hz, i % 2 === 0 ? 'hoe' : 'build');
  };
}

/**
 * Stavba vozové cesty (roads.md – Lidé při práci na cestě): u čela práce (`x`, `z` z jádra,
 * `wagonWorkTarget`) kopáči v úvozu, nosiči s koši od úvozu k náspu o kus zpět po ose a dusání
 * na hotovém náspu. Bez zemních prací v údajích nikdo.
 */
export function wagonWork(ctx: Context, target: { id: number; x: number; z: number }): Placer {
  // zemní práce té stavby, jejíž je cíl (`id` = stavba); víc vozových cest ve stavbě = víc os
  const earthwork = (ctx.village.earthworks ?? []).find(
    (e) => e.constructionId === target.id && e.profile.length >= 2,
  );
  if (!earthwork) return none;
  let best = 0;
  let bestD = Infinity;
  earthwork.profile.forEach((p, k) => {
    const d = Math.hypot(p.x - target.x, p.z - target.z);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  const a = earthwork.profile[Math.max(0, best - 1)]!;
  const b = earthwork.profile[Math.min(earthwork.profile.length - 1, best + 1)]!;
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ax = (b.x - a.x) / len;
  const az = (b.z - a.z) / len;
  // bod u čela: podél osy `along` m (záporně zpět k vsi), příčně `side` m
  const spot = (along: number, side: number): Point | null =>
    nearestFree(ctx, target.x + ax * along - az * side, target.z + az * along + ax * side, 3);
  return (i, who) => {
    const role = i % 4;
    const side = i % 2 === 0 ? 1 : -1;
    if (role === 2) {
      const from = spot(0.5, 0);
      const to = spot(-6, 3.5 * side);
      const path = from && to ? walkRoute(ctx, from, to) : null;
      if (path) {
        return shuttle(path, {
          outClip: 'carry',
          outSpeed: walkSpeed(who.kind, 'carry', who.scale),
          endClip: 'build',
          endS: 3,
          backClip: 'walk',
          backSpeed: walkSpeed(who.kind, 'walk', who.scale),
          restClip: 'hoe',
          restS: 2,
          phase: who.phase,
        });
      }
    }
    const slot = role === 3 ? spot(-4, 1.2 * side) : spot(((i >> 2) % 3) * 1.2, 1.3 * side);
    if (!slot) return null;
    return stand(slot.x, slot.z, ax, az, role === 3 ? 'build' : 'hoe');
  };
}
