// Postavy na polích, loukách, v sadu a při výmlatu: řady, nosiči, zakládání.
import { dateOfDayIndex, type TileCell } from '@bohemia/game';
import type { SceneFieldPart, SceneLaborShare } from '../village-view';
import { TREE_CLEARANCE_M, buildingClearings, insideClearings } from './building-clearings';
import { slashHeapSites, type HeapSite } from './clearing-slash-layout';
import { rowDirection } from './field-cells';
import {
  fieldPartViews,
  villageCenter,
  workAt,
  workFrame,
  workSteps,
  workedParts,
  type PartView,
  type WorkFrame,
} from './field-look';
import { orchardTreeSpots } from './orchard-layout';
import { hash01 } from './smoke-schedule';
import {
  rowWork,
  shuttle,
  stand,
  walkSpeed,
  type Lane,
  type PoseFn,
  type VillagerClip,
} from './villager-motion';
import {
  CREW,
  CREW_MOVE_DAYS,
  FELL_REACH_M,
  MIN_LANE_M,
  ROW,
  ROW_MARGIN_M,
  gap,
  none,
  type Context,
  type Identity,
  type Placer,
  type Point,
  type Square,
} from './villager-plan-types';
import {
  atTree,
  doorPoint,
  fieldPath,
  free,
  nearestFree,
  nearestHouse,
  openGround,
  squareAxes,
  squareLocal,
  trafficDoor,
  unit,
  walkRoute,
  worldPoint,
} from './villager-plan-geometry';

/** Pole s díly ve vzhledu, jak je kreslí scéna (field-look.ts), směrem řádků a práce. */
export interface FieldWork {
  views: PartView[];
  rows: [number, number];
  center: { x: number; z: number };
}

export function fieldWork(ctx: Context, fieldId: number): FieldWork | null {
  const field = ctx.village.fields.find((f) => f.id === fieldId);
  if (!field || field.parts.length === 0) return null;
  const dayOfYear = dateOfDayIndex(ctx.day).dayOfYear;
  return {
    views: fieldPartViews(field, { dayOfYear, village: ctx.village }),
    rows: rowDirection(field.parts),
    center: villageCenter(ctx.village, field.parts),
  };
}

/**
 * Díly, na kterých se dnes pracuje (Martin: panáček přijde přesně na čtverec, který se zrovna
 * dělá): z fronty práce od herního jádra (`share.parts`), jinak rozpracovaný díl a za ním díly,
 * na které práce přijde (field-look.ts – `workedParts`). Pletí se střídá po dnech.
 */
export function workedSquares(ctx: Context, share: SceneLaborShare, work: FieldWork): PartView[] {
  const worked = workedParts(work.views, share.activity, share.parts);
  if (share.activity !== 'weed' || worked.length === 0) return worked;
  const fieldId = share.target.kind === 'field' ? share.target.id : 0;
  const start =
    Math.floor(ctx.day / CREW_MOVE_DAYS) +
    Math.floor(hash01(fieldId, ctx.seed, 92) * worked.length);
  return worked.map((_, i) => worked[(start + i) % worked.length]!);
}

/**
 * Seč přirozené louky (oxen.md – Seno): řady sekáčů na políčkách louky, přes která dnes seč
 * postoupila (`cells` od jádra) – jako řady na poli, vzhled a rozpracovanost z
 * `SceneVillage.hayMeadows`. Řádky sena vedou podél x, seče se od strany blíž vsi.
 */
export function meadowRows(ctx: Context, cells: readonly TileCell[], count: number): Placer {
  const meadows = ctx.village.hayMeadows ?? [];
  const views: PartView[] = cells.flatMap((cell, order) => {
    const m = meadows.find((h) => h.cell.x === cell.x && h.cell.y === cell.y);
    if (!m) return [];
    const part: SceneFieldPart = {
      cell: { x: m.cell.x, y: m.cell.y },
      x: m.x,
      z: m.z,
      size: m.size,
      stage: 'meadow',
      look: m.look,
    };
    const work = m.work !== undefined && m.work < 1 ? m.work : null;
    return [
      {
        part,
        look: m.look,
        work,
        before: work !== null ? (m.before ?? null) : null,
        staked: false,
        order,
      },
    ];
  });
  if (views.length === 0) return none;
  const work: FieldWork = { views, rows: [1, 0], center: villageCenter(ctx.village) };
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const size = Math.min(CREW, count - crew * CREW);
    const view = views[crew % views.length]!;
    return frontierRow(ctx, work, view, member, size, 'reap', who, false);
  };
}

/**
 * Dojení (diet.md – Práce se zvířaty): ženy u bočních stěn obydlí, sehnuté k dojnému zvířeti
 * (klip pletí – dojení animace nemá), po domech dokola.
 */
export function milkers(ctx: Context): Placer {
  const homes = [...ctx.homes].sort((a, b) => a.id - b.id);
  return (i) => {
    const home = homes[i % homes.length];
    if (!home) return null;
    const turn = Math.floor(i / homes.length);
    const side = turn % 2 === 0 ? 1 : -1;
    const edge = side > 0 ? home.box.maxX + gap(1.8) : home.box.minX - gap(1.8);
    const p = worldPoint(home.position, edge, home.box.minZ * 0.2 - turn * gap(0.8));
    const spot = nearestFree(ctx, p.x, p.z, 2);
    if (!spot) return null;
    const toward = unit(home.position.x - spot.x, home.position.z - spot.z);
    return stand(spot.x, spot.z, -toward.z * side, toward.x * side, 'weed');
  };
}

/**
 * Řady na čtvercích pole – po CREW lidech na čtverec z fronty práce, `clip` podle práce. Na
 * rozpracovaném čtverci stojí řada na čáře práce (kus do nehotové části) a jde podél řádků.
 */
export function fieldRows(
  ctx: Context,
  share: SceneLaborShare,
  fieldId: number,
  count: number,
  clip: VillagerClip,
): Placer {
  const work = fieldWork(ctx, fieldId);
  if (!work) return none;
  const squares = workedSquares(ctx, share, work);
  if (squares.length === 0) return none;
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const size = Math.min(CREW, count - crew * CREW);
    const view = squares[crew % squares.length]!;
    return frontierRow(ctx, work, view, member, size, clip, who, share.activity === 'weed');
  };
}

/** Rozestup lidí v řadě napříč řádky na čáře práce (m). */
export const FRONT_GAP_M = gap(0.9);

/**
 * Člověk `member` z `size` na čtverci: řada vede podél řádků pole. Na rozpracovaném čtverci
 * stojí lidé vedle sebe hned za čarou práce (v nehotové části), na čtverci, kam práce teprve
 * přijde, u jeho začátku (strana blíž vsi); při pletí rozestoupení přes celý čtverec.
 */
export function frontierRow(
  ctx: Context,
  work: FieldWork,
  view: PartView,
  member: number,
  size: number,
  clip: VillagerClip,
  who: Identity,
  spread: boolean,
): PoseFn | null {
  const square = view.part;
  const frame = workFrame(square, work.rows, work.center);
  const half = square.size / 2 - ROW_MARGIN_M;
  const line = view.work !== null ? workSteps(view.work) : 0;
  let v: number;
  if (spread) {
    v = -half + ((member + 0.5) * 2 * half) / size + (who.phase - 0.5) * 0.6;
  } else {
    const start = -square.size / 2 + line * square.size;
    v = Math.min(half, Math.max(-half, start + (member + 0.5) * FRONT_GAP_M));
  }
  const lane = laneAlongRows(ctx, square, frame, v, half);
  if (!lane) return null;
  const row = ROW[clip] ?? { workS: 5, stepM: 1 };
  return rowWork(
    lane,
    clip,
    row.workS,
    row.stepM,
    walkSpeed(who.kind, 'walk', who.scale),
    who.phase,
  );
}

/** Řada podél řádků pole ve vzdálenosti `v` napříč (souřadnice práce) – nejdelší volný úsek. */
export function laneAlongRows(
  ctx: Context,
  square: Square,
  frame: WorkFrame,
  v: number,
  half: number,
): Lane | null {
  // podél řádků (i natočeného pole), napříč o `v` ve směru práce
  return freeLane(
    ctx,
    square,
    { x: frame.along[0], z: frame.along[1] },
    { x: frame.across[0], z: frame.across[1] },
    v,
    half,
  );
}

export function crewRows(
  ctx: Context,
  squares: readonly Square[],
  count: number,
  clipOf: (index: number) => VillagerClip,
): Placer {
  if (squares.length === 0) return none;
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const size = Math.min(CREW, count - crew * CREW);
    const square = squares[crew % squares.length]!;
    return rowOn(ctx, square, member, size, clipOf(i), who);
  };
}

/** Člověk `member` z `size` v řadě na čtverci – řada vede od vsi pryč, lidé vedle sebe. */
export function rowOn(
  ctx: Context,
  square: Square,
  member: number,
  size: number,
  clip: VillagerClip,
  who: Identity,
): PoseFn | null {
  const row = ROW[clip] ?? { workS: 5, stepM: 1 };
  const dx = square.x - ctx.center.x;
  const dz = square.z - ctx.center.z;
  // řada podél té osy čtverce, která míří nejvíc od vsi (natočený čtverec v jeho osách)
  const [ax, az] = squareAxes(square);
  const du = dx * ax.x + dz * ax.z;
  const dv = dx * az.x + dz * az.z;
  const alongU = Math.abs(du) >= Math.abs(dv);
  const sign = (alongU ? du : dv) >= 0 ? 1 : -1;
  const dir = alongU ? { x: ax.x * sign, z: ax.z * sign } : { x: az.x * sign, z: az.z * sign };
  const perp = alongU ? az : ax;
  const half = square.size / 2 - ROW_MARGIN_M;
  const across = -half + ((member + 0.5) * 2 * half) / size + (who.phase - 0.5) * 0.6;
  const lane = freeLane(ctx, square, dir, perp, across, half);
  if (!lane) return null;
  return rowWork(
    lane,
    clip,
    row.workS,
    row.stepM,
    walkSpeed(who.kind, 'walk', who.scale),
    who.phase,
  );
}

/**
 * Řada přes čtverec ve směru `dir` (jednotkový), posunutá o `across` ve směru `perp` – zkrácená na
 * nejdelší volný úsek (voda, dům).
 */
export function freeLane(
  ctx: Context,
  square: Square,
  dir: Point,
  perp: Point,
  across: number,
  half: number,
): Lane | null {
  const at = (u: number): Point => ({
    x: square.x + dir.x * u + perp.x * across,
    z: square.z + dir.z * u + perp.z * across,
  });
  const steps = Math.max(1, Math.round((2 * half) / 1));
  let best: [number, number] | null = null;
  let start: number | null = null;
  for (let k = 0; k <= steps + 1; k++) {
    const u = -half + (k * 2 * half) / steps;
    const p = at(u);
    const ok = k <= steps && free(ctx, p.x, p.z);
    if (ok && start === null) start = u;
    if (!ok && start !== null) {
      const end = -half + ((k - 1) * 2 * half) / steps;
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = null;
    }
  }
  if (!best || best[1] - best[0] < MIN_LANE_M) return null;
  const a = at(best[0]);
  const b = at(best[1]);
  return { ax: a.x, az: a.z, bx: b.x, bz: b.z };
}

/**
 * Nosiči úrody: od obydlí nejblíž čtverci, kde stojí panáky (sklizená část fronty žně), a se
 * snopy v nůši zpět. Když trasa nevede po suchu, žne nosič taky.
 */
export function carriers(ctx: Context, share: SceneLaborShare, fieldId: number): Placer {
  const work = fieldWork(ctx, fieldId);
  if (!work) return none;
  const squares = workedSquares(ctx, share, work);
  if (squares.length === 0) return none;
  return (i, who) => {
    const view = squares[Math.floor(i / 2) % squares.length]!;
    const square = view.part;
    const home = nearestHouse(ctx.homes, square);
    const fallback = (): PoseFn | null =>
      frontierRow(ctx, work, view, i % CREW, CREW, 'reap', who, false);
    if (!home) return fallback();
    // od vchodu jako provoz na cestách (`trafficDoor` – vchod pozemku může ústit k sousednímu
    // pozemku); stejné místo pro všechny nosiče domu – trasa se hledá jednou
    const door = trafficDoor(ctx, home) ?? doorPoint(home);
    const half = square.size / 2 - ROW_MARGIN_M;
    // kraj čtverce nejblíž dveřím (v osách čtverce – i natočeného)
    const [u, v] = squareLocal(square, door.x, door.z);
    const [ax, az] = squareAxes(square);
    const cu = Math.min(half, Math.max(-half, u));
    const cv = Math.min(half, Math.max(-half, v));
    const edge = {
      x: square.x + ax.x * cu + az.x * cv,
      z: square.z + ax.z * cu + az.z * cv,
    };
    const path = walkRoute(ctx, door, edge, home.id) ?? fieldPath(ctx, door, edge, home.id);
    if (!path) return fallback();
    return shuttle(path, {
      outClip: 'walk',
      outSpeed: walkSpeed(who.kind, 'walk', who.scale),
      endClip: 'weed',
      endS: 3.5,
      backClip: 'carry',
      backSpeed: walkSpeed(who.kind, 'carry', who.scale),
      restClip: 'idle',
      restS: 2.5,
      phase: who.phase,
    });
  };
}

/**
 * Zakládání pole: na rozpracovaném čtverci (pak na dalších z fronty – od obydlí) se kácejí
 * stromy (sekera u kmene), zbytek rozrývá drn motykou na čáře práce. Klučení lesa (forest.md –
 * Klučení lesa pro pole – postup): napřed čtverce, které se dnes pálí – lidé u hořících hromad
 * větví hrnou oheň (`burnCrew`); na kácených čtvercích půlka kácí a půlka nosí kmeny k hromadě
 * klád u lesa (`logCarrier`); na schnoucí pasece se nepracuje.
 */
export function founding(
  ctx: Context,
  share: SceneLaborShare,
  fieldId: number,
  count: number,
): Placer {
  const work = fieldWork(ctx, fieldId);
  if (!work) return none;
  // klučení: napřed pálení, pak rozpracované kácení (jádro – clearingWorkOrder), pak fronta
  const byOrder = [...work.views].sort((a, b) => a.order - b.order);
  const burning = byOrder.filter((v) => isBurningView(v, ctx.day));
  const felling = byOrder.filter((v) => v.look === 'slash' && v.work !== null);
  const rest = workedSquares(ctx, share, work).filter(
    (v) => !isDryingView(v) && !burning.includes(v) && !felling.includes(v),
  );
  const squares = [...burning, ...felling, ...rest];
  if (squares.length === 0) return none;
  const trees = squares.map((s) => ctx.ground.treesIn(s.part.x, s.part.z, s.part.size / 2, CREW));
  const heaps = squares.map((s) => (burning.includes(s) ? burnHeaps(ctx, s.part, work) : []));
  return (i, who) => {
    const crew = Math.floor(i / CREW);
    const member = i % CREW;
    const k = crew % squares.length;
    const view = squares[k]!;
    const size = Math.min(CREW, count - crew * CREW);
    const sites = heaps[k] ?? [];
    if (sites.length > 0) return burnCrew(ctx, sites, member, who);
    if (burning.includes(view))
      return frontierRow(ctx, work, view, member, size, 'hoe', who, false);
    const standing = trees[k] ?? [];
    if (standing.length > 0 && member % 2 === 0) {
      const tree = standing[(member / 2) % standing.length]!;
      return atTree(ctx, tree, who, 'fell', FELL_REACH_M);
    }
    // paseka: padlé kmeny se nosí k hromadě u lesa (na louce bez stromů se kope drn)
    if (view.look !== 'bare' && standing.length > 0) {
      return logCarrier(ctx, standing[member % standing.length]!, who);
    }
    return frontierRow(ctx, work, view, member, size, 'hoe', who, false);
  };
}

/**
 * Čtverec se dnes pálí: rozpracované pálení (spálenina, zbytek paseka – fieldPartLooks v jádru),
 * nebo dnes dohořel (`burnedDay`).
 */
export function isBurningView(view: PartView, day: number): boolean {
  return (
    (view.look === 'burnt' && view.before === 'slash' && view.work !== null) ||
    view.part.burnedDay === day
  );
}

/** Paseka schne – stromy padly, pálí se až za suchého počasí; nikdo na ní nepracuje. */
function isDryingView(view: PartView): boolean {
  return view.part.stage === 'founding' && view.look === 'slash' && view.work === null;
}

/**
 * Hromady větví čtverce, které dnes hoří (jako heapFires v clearing-fire.ts): pálení postupuje
 * napříč čtvercem, hromady za čarou práce ještě nehoří – u nich lidé nestojí. Bez překážek
 * vrstvy žádné.
 */
export function burnHeaps(ctx: Context, part: SceneFieldPart, work: FieldWork): HeapSite[] {
  const avoid = ctx.ground.squareObstacles?.(part);
  if (!avoid) return [];
  const done = part.burnedDay === ctx.day ? 1 : workSteps(part.work ?? 0);
  if (done <= 0) return [];
  const frame = workFrame(part, work.rows, work.center);
  return slashHeapSites(part, avoid).filter((site) => workAt(frame, part, site.x, site.z) < done);
}

/** Odstup člověka od okraje hořící hromady (m) – hrne oheň motykou, do plamenů nevstoupí. */
const FIRE_REACH_M = 0.9;

/**
 * Člověk `member` u hořící hromady: hromady po řadě, u každé lidé dokola (podle fáze postavy),
 * čelem k ohni s motykou – hrnou větve do žáru a rozhrnují oheň (klip `hoe`).
 */
export function burnCrew(
  ctx: Context,
  sites: readonly HeapSite[],
  member: number,
  who: Identity,
): PoseFn | null {
  const site = sites[member % sites.length]!;
  // půlosa kupy (clearing-slash.ts – HEAP_A × velikost) a kus místa na postavu
  const reach = 1.5 * site.scale + FIRE_REACH_M;
  const round = Math.floor(member / sites.length);
  const slot = { ...who, phase: (who.phase + round * 0.37) % 1 };
  return atTree(ctx, { x: site.x, z: site.z }, slot, 'hoe', reach);
}

/** Nejdál k hromadě klád u lesa (m) – dál se kmeny nenosí, kácí se. */
const LOG_HAUL_M = 120;

/**
 * Nosič kmenů na kácené pasece: od padlého stromu k nejbližší hromadě klád u lesa
 * (`SceneVillage.logStacks` – kotva hromady), zpátky s prázdnou. Bez hromady kácí.
 */
export function logCarrier(ctx: Context, tree: Point, who: Identity): PoseFn | null {
  const stacks = ctx.village.logStacks ?? [];
  let best: Point | null = null;
  let bestD = LOG_HAUL_M;
  for (const s of stacks) {
    const d = Math.hypot(s.x - tree.x, s.z - tree.z);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  const from = best ? nearestFree(ctx, tree.x + 1.5, tree.z, 3) : null;
  const to = best ? nearestFree(ctx, best.x, best.z, 6) : null;
  const path = from && to ? walkRoute(ctx, to, from) : null;
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
}

/** Sázení mladých buků: u každého pařezu jeden člověk s motykou (crafts.md – Uhlíř). */
export function planting(ctx: Context, ids: readonly number[]): Placer {
  const stumps = ids.flatMap((id) => {
    const p = ctx.ground.tree(id);
    return p ? [p] : [];
  });
  if (stumps.length === 0) return none;
  return (i, who) => atTree(ctx, stumps[i % stumps.length]!, who, 'hoe', FELL_REACH_M);
}

/**
 * Výmlat na hotovém humnu (production-chains.md – Humno): mlatci v kruhu uprostřed mlatu.
 * Humno, které ve scéně není nebo ještě stojí jen jako staveniště, nikoho nemá.
 */
export function threshingOnFloor(ctx: Context, floorId: number, count: number): Placer {
  const floor = (ctx.village.threshingFloors ?? []).find((f) => f.id === floorId);
  if (!floor?.built) return none;
  return (i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2 + hash01(ctx.seed, 95, floorId);
    const x = floor.position.x + Math.cos(a) * gap(1.6);
    const z = floor.position.z + Math.sin(a) * gap(1.6);
    return stand(x, z, -Math.cos(a), -Math.sin(a), 'build');
  };
}

/** Nouzový výmlat u vsi: mlatci v kruhu na volném místě kousek od domů (cep zatím paličkou). */
export function threshing(ctx: Context, count: number): Placer {
  const floors: Point[] = [];
  const perFloor = 6;
  const wanted = Math.ceil(count / perFloor);
  for (let r = 8; r <= 26 && floors.length < wanted; r += 3) {
    for (let k = 0; k < 12 && floors.length < wanted; k++) {
      const a = (k / 12) * Math.PI * 2 + hash01(ctx.seed, r, 93);
      const p = { x: ctx.center.x + Math.cos(a) * r, z: ctx.center.z + Math.sin(a) * r };
      if (openGround(ctx, p, 2.4) && floors.every((f) => Math.hypot(f.x - p.x, f.z - p.z) > 6)) {
        floors.push(p);
      }
    }
  }
  if (floors.length === 0) return none;
  return (i) => {
    const floor = floors[Math.floor(i / perFloor) % floors.length]!;
    const inFloor = Math.min(perFloor, count - Math.floor(i / perFloor) * perFloor);
    const a = ((i % perFloor) / inFloor) * Math.PI * 2 + hash01(ctx.seed, 94, 1);
    const x = floor.x + Math.cos(a) * gap(1.4);
    const z = floor.z + Math.sin(a) * gap(1.4);
    return stand(x, z, -Math.cos(a), -Math.sin(a), 'build');
  };
}

/** Sklizeň jablek a péče: lidé pod jabloněmi vysazených čtverců (střídají se po dnech). */
export function orchardTrees(ctx: Context, orchardId: number, count: number): Placer {
  const orchard = (ctx.village.orchards ?? []).find((o) => o.id === orchardId);
  if (!orchard) return none;
  // jabloně pod obydlím na čtverci sadu nejsou (jako ve scéně – orchard-renderer.ts)
  const built = insideClearings(buildingClearings(ctx.village.dwellings), TREE_CLEARANCE_M);
  const trees = orchard.squares
    .filter((s) => s.planting >= 1)
    .flatMap((s) => orchardTreeSpots(s, [], built));
  if (trees.length === 0) return none;
  const start = Math.floor(ctx.day / CREW_MOVE_DAYS) * count;
  return (i, who) => {
    const tree = trees[(start + i) % trees.length]!;
    return atTree(ctx, tree, who, 'fruit', gap(1.3));
  };
}

/** Výsadba sadu: čtverce, které se sázejí (rozsázené první, pak od vsi), okopávání v řadách. */
export function orchardPlanting(ctx: Context, orchardId: number, count: number): Placer {
  const orchard = (ctx.village.orchards ?? []).find((o) => o.id === orchardId);
  if (!orchard) return none;
  const distance = (s: Square): number => Math.hypot(s.x - ctx.center.x, s.z - ctx.center.z);
  const squares = orchard.squares
    .filter((s) => s.planting < 1)
    .sort((a, b) => b.planting - a.planting || distance(a) - distance(b));
  return crewRows(ctx, squares, count, () => 'hoe');
}
