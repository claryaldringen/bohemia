// Mistři stavební huti při práci (churches.md – Mistři huti při práci; Martin 12. 11. 2026: „Tihle
// řemeslníci by měli mít kompletní animaci práce, jak to mají ostatní řemeslníci“): mistr stojí
// u své práce na staveništi kostela, jen když na ni ten den došlo (`LaborShare.churchWork`), jinak
// postává u dveří svého domu. Do práce vsi nechodí (jádro ho z ní vynechává – `isLodgeIdle`),
// proto se bere z rozpisu lidí hned po knězi – před spřežením a prací vsi. Čistý modul bez Babylonu.
import { churchFootprintWorld, type ChurchWork, type MasonCraft } from '@bohemia/game';
import type { SceneChurch, SceneChurchSite } from '../church-view';
import type { ScenePerson } from '../person-view';
import {
  distToSegment,
  heapRadius,
  insidePolygon,
  KILN_M,
  LIME_PIT_M,
  limePitCenter,
  SAND_PIT_M,
  stoneHeapAt,
} from './church-site-layout';
import { hash01 } from './smoke-schedule';
import { QUARRY_FACE_M } from './stone-pile-layout';
import { stand, type VillagerClip } from './villager-motion';
import type { PhasePlaces, PhaseRole } from './villager-phases';
import { cast, figure } from './villager-plan-cast';
import { doorPoint, nearestFree, unit } from './villager-plan-geometry';
import { manorDoor } from './villager-plan-lord';
import type { Context, PlannedVillager, Point } from './villager-plan-types';
import type { MasterWork, PersonJob } from './villager-roster';

type MasterJob = Extract<PersonJob, { kind: 'master' }>;

/**
 * Vzdálenosti mistrů od toho, u čeho pracují (m; návrh Clauda): zedník a štukatér těsně u zdi,
 * stavbyvedoucí kus od zdí (vidí na pomocníky), vápeník u pece a při tlučení vápence dál od ní,
 * kameník před stěnou lomu a u hromady kamene.
 */
export const MASTER_M = {
  /** Zedník od vnějšího obrysu zdi. */
  mason: 0.8,
  /** Štukatér od zdi (lžíce a hladítko na zdi). */
  plasterer: 0.7,
  /** Stavbyvedoucí od zdí. */
  builder: 2.6,
  /** Krok bodů po obvodu zdí. */
  wallStep: 3,
  /** Vápeník od okraje pece (přikládá) a od okraje jámy (hasí vápno). */
  kiln: 0.6,
  pit: 0.5,
  /** Vápeník tluče vápenec kus od pece – stranou od jámy (úhel od směru „od jámy“, rad). */
  limeBreak: 4.2,
  limeBreakAngle: (70 * Math.PI) / 180,
  /** Kameník od hromady kamene a od okraje písníku stavbyvedoucí. */
  heap: 0.9,
  sand: 0.8,
  /** Kameník v lomu: kolik před stěnou lomu stojí, rozptyl napříč. */
  quarryFront: 1,
  quarrySpread: 2.4,
  /** Stavbyvedoucí hlásí vojvodovi: kolik před dveřmi dvorce stojí. */
  manorOut: 1.4,
  /** U dveří domu napříč od osy vchodu. */
  door: 0.8,
} as const;

/** Bod vně zdí kostela a jednotkový směr ke zdi. */
export interface WallSpot {
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/**
 * Body vně zdí kostela po obvodu každé části (krok `MASTER_M.wallStep`) ve vzdálenosti `gap` od
 * vnějšího obrysu (`churchFootprintWorld`), se směrem ke zdi. Body uvnitř jiné části či blíž než
 * `gap` k jiné zdi (kout mezi lodí a kněžištěm) vypadnou. Pořadí pevné – po obvodu.
 */
export function churchWallSpots(
  church: Pick<SceneChurch, 'type' | 'dims' | 'position'>,
  gap: number,
): WallSpot[] {
  const polys = churchFootprintWorld(church.type, church.dims, church.position);
  const out: WallSpot[] = [];
  for (const poly of polys) {
    let next = MASTER_M.wallStep / 2;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-6) continue;
      // normála ven – kousek od středu hrany na její straně už není obrys
      let nx = (b.z - a.z) / len;
      let nz = -(b.x - a.x) / len;
      const mid = { x: (a.x + b.x) / 2 + nx * 0.05, z: (a.z + b.z) / 2 + nz * 0.05 };
      if (insidePolygon(mid, poly)) {
        nx = -nx;
        nz = -nz;
      }
      for (; next < len; next += MASTER_M.wallStep) {
        const t = next / len;
        const p = { x: a.x + (b.x - a.x) * t + nx * gap, z: a.z + (b.z - a.z) * t + nz * gap };
        const blocked = polys.some(
          (q) =>
            insidePolygon(p, q) ||
            q.some((c, m) => distToSegment(p, c, q[(m + 1) % q.length]!) < gap - 0.05),
        );
        if (!blocked) out.push({ x: p.x, z: p.z, hx: -nx, hz: -nz });
      }
      next -= len;
    }
  }
  return out;
}

/** Kostel, na kterém se dnes pracuje, a druhy práce dne. */
export interface ChurchToday {
  church: SceneChurch;
  works: ReadonlySet<ChurchWork>;
}

/**
 * První kostel (podle id), který má dnes podíl práce stavby (`build` na místě stavby); druhy práce
 * ze všech jeho podílů. Bez podílu null – na kostele se dnes nepracovalo.
 */
function churchToday(ctx: Context): ChurchToday | null {
  const churches = ctx.village.churches ?? [];
  const works = new Map<number, Set<ChurchWork>>();
  for (const share of ctx.village.labor?.shares ?? []) {
    // lámání kostela je samostatný podíl u lomu (`quarry` s id stavby) – kameník v lomu
    if (share.activity === 'quarry' && share.construction !== undefined) {
      const id = share.construction;
      if (!churches.some((c) => c.id === id)) continue;
      works.set(id, (works.get(id) ?? new Set<ChurchWork>()).add('quarry'));
      continue;
    }
    if (share.activity !== 'build' || share.target.kind !== 'site') continue;
    const id = share.target.id;
    if (!churches.some((c) => c.id === id)) continue;
    const set = works.get(id) ?? new Set<ChurchWork>();
    for (const w of share.churchWork ?? []) set.add(w);
    works.set(id, set);
  }
  if (works.size === 0) return null;
  const id = Math.min(...works.keys());
  return { church: churches.find((c) => c.id === id)!, works: works.get(id)! };
}

/**
 * Práce mistra oboru `craft` dnes (churches.md – Mistři huti při práci; `CHURCH_WORK_CRAFT`):
 * stavbyvedoucí u staveniště při každé práci na kostele (jen při kopání písku u písníku),
 * vápeník u pece při práci na vápně a vždy, když pec hoří (pálení běží i v den bez práce),
 * kameník v lomu při lámání, jinak při zdění u hromady kamene (tesá kvádry), zedník u zdí
 * při základech a zdech, štukatér při výzdobě. Jinak doma.
 */
export function masterWork(
  craft: MasonCraft,
  today: ChurchToday | null,
  churches: readonly SceneChurch[],
  hasQuarry: (outcropId: number) => boolean,
): { work: MasterWork; church: SceneChurch | null } {
  const home = { work: 'home' as const, church: null };
  const works = today?.works ?? new Set<ChurchWork>();
  const church = today?.church ?? null;
  const site = church?.site;
  const walls = works.has('walls') || works.has('foundation');
  switch (craft) {
    case 'builder':
      if (!church) return home;
      // příprava staveniště (kácení) – žádná práce stavby, jen vyměřování půdorysu
      if (works.size === 0) return { work: 'layout', church };
      return { work: site && works.size === 1 && works.has('sand') ? 'sand' : 'site', church };
    case 'limeBurner': {
      if (church && site && works.has('lime')) return { work: 'kiln', church };
      const burning = churches.find((c) => c.site?.burning);
      return burning ? { work: 'kiln', church: burning } : home;
    }
    case 'stonemason':
      if (!church || !site) return home;
      // lom bez značky ve scéně – kameník u hromady kamene
      if (works.has('quarry') && hasQuarry(site.quarryId)) return { work: 'quarry', church };
      return walls || works.has('quarry') ? { work: 'dress', church } : home;
    case 'mason':
      return church && walls ? { work: 'walls', church } : home;
    case 'plasterer':
      return church && works.has('decor') ? { work: 'decor', church } : home;
  }
}

/** Místo mistra u práce: bod, směr pohledu a klip pózy úlohy. */
interface MasterSpot {
  x: number;
  z: number;
  hx: number;
  hz: number;
  clip: VillagerClip;
}

/** Bod ze seznamu losem podle člověka (`salt` – každý obor jinde, ať nestojí v sobě). */
function pickSpot<T>(list: readonly T[], person: number, salt: number): T | undefined {
  if (list.length === 0) return undefined;
  return list[Math.floor(hash01(person, salt, 0x5a7e) * list.length) % list.length];
}

/** Bod `r` m od středu `c` ve směru k `toward` (na straně, odkud se přichází). */
function rimToward(c: Point, toward: Point, r: number): Point {
  const d = unit(toward.x - c.x, toward.z - c.z);
  return { x: c.x + d.x * r, z: c.z + d.z * r };
}

/** Stojí v `at` čelem k `to`. */
function facing(at: Point, to: Point, clip: VillagerClip): MasterSpot {
  const d = unit(to.x - at.x, to.z - at.z);
  return { x: at.x, z: at.z, hx: d.x, hz: d.z, clip };
}

/** Kde vápeník tluče vápenec mezi pálením: kus od pece, stranou od jámy i od hromady kamene. */
function limeBreakSpot(site: SceneChurchSite): Point {
  const pit = limePitCenter(site);
  const away = unit(site.kiln.x - pit.x, site.kiln.z - pit.z);
  const heap = stoneHeapAt(site);
  let best: Point | null = null;
  for (const sign of [1, -1]) {
    const a = Math.atan2(away.z, away.x) + sign * MASTER_M.limeBreakAngle;
    const p = {
      x: site.kiln.x + Math.cos(a) * MASTER_M.limeBreak,
      z: site.kiln.z + Math.sin(a) * MASTER_M.limeBreak,
    };
    if (
      !best ||
      Math.hypot(p.x - heap.x, p.z - heap.z) > Math.hypot(best.x - heap.x, best.z - heap.z)
    ) {
      best = p;
    }
  }
  return best!;
}

/** Bod u pece, kde vápeník přikládá – na straně od jámy, čelem k peci. */
function kilnStokeSpot(site: SceneChurchSite): Point {
  const pit = limePitCenter(site);
  const away = unit(site.kiln.x - pit.x, site.kiln.z - pit.z);
  const r = KILN_M.ringR + MASTER_M.kiln;
  return { x: site.kiln.x + away.x * r, z: site.kiln.z + away.z * r };
}

/** Místo kameníka před stěnou lomu (lom `quarryId` – `SceneVillage.quarries`), nebo null. */
function quarrySpot(ctx: Context, site: SceneChurchSite, person: number): MasterSpot | null {
  const q = (ctx.village.quarries ?? []).find((v) => v.outcropId === site.quarryId);
  if (!q) return null;
  const cos = Math.cos(q.rotation);
  const sin = Math.sin(q.rotation);
  // místní osy lomu (stone-pile-layout.ts – `toWorld`): stěna za značkou v −z
  const lx = (hash01(person, 0x9a7, 3) - 0.5) * MASTER_M.quarrySpread;
  const lz = -QUARRY_FACE_M.back + QUARRY_FACE_M.depth / 2 + MASTER_M.quarryFront;
  return {
    x: q.x + lx * cos + lz * sin,
    z: q.z - lx * sin + lz * cos,
    hx: -sin,
    hz: -cos,
    clip: 'quarry',
  };
}

/** Místo mistra u jeho práce dne (před `nearestFree`), nebo null (místo není – postává doma). */
function workSpot(
  ctx: Context,
  job: MasterJob,
  church: SceneChurch,
  person: number,
): MasterSpot | null {
  const site = church.site;
  const wall = (gap: number, salt: number, clip: VillagerClip): MasterSpot | null => {
    const s = pickSpot(churchWallSpots(church, gap), person, salt);
    return s ? { ...s, clip } : null;
  };
  switch (job.work) {
    case 'layout':
    case 'site':
      return wall(MASTER_M.builder, 0xb1, 'measure');
    case 'sand':
      if (!site) return null;
      return facing(
        rimToward(site.sandPit, church.position, SAND_PIT_M.radius + MASTER_M.sand),
        site.sandPit,
        'idle',
      );
    case 'kiln':
      if (!site) return null;
      return site.burning
        ? facing(kilnStokeSpot(site), site.kiln, 'stoke')
        : facing(limeBreakSpot(site), site.kiln, 'break-stone');
    case 'quarry':
      return site ? quarrySpot(ctx, site, person) : null;
    case 'dress':
      return site ? dressSpot(church, site) : null;
    case 'walls':
      return wall(MASTER_M.mason, 0x3a5, 'lay');
    case 'decor':
      return wall(MASTER_M.plasterer, 0x91c, 'plaster');
    case 'home':
      return null;
  }
}

/** Kameník u hromady kamene na straně ke kostelu, čelem k hromadě (tesá kvádry). */
function dressSpot(church: SceneChurch, site: SceneChurchSite): MasterSpot {
  const heap = stoneHeapAt(site);
  const r = heapRadius(site.stone) + MASTER_M.heap;
  return facing(rimToward(heap, church.position, r), heap, 'dress');
}

/** U dveří domu mistra, čelem od domu; dům chybí – null. */
function homeSpot(ctx: Context, person: ScenePerson): MasterSpot | null {
  const house = ctx.homes.find((h) => h.id === person.home && !h.pen);
  if (!house) return null;
  const side = hash01(person.id, 0xd00, 1) < 0.5 ? -MASTER_M.door : MASTER_M.door;
  const door = doorPoint(house, side);
  const out = unit(door.x - house.position.x, door.z - house.position.z);
  return { x: door.x, z: door.z, hx: out.x, hz: out.z, clip: 'idle' };
}

/**
 * Mistři huti vsi (lidé dne s `ScenePerson.mason`): každý u své práce dne (`masterWork`), nebo
 * u dveří svého domu. Bere je z rozpisu lidí hned po knězi – do práce vsi ani k spřežení nejdou;
 * když místo u práce nevyjde, postává doma, a když ani tam, postavu nemá (zůstane v rozpisu
 * obsazený, ať ho nikdo nepošle na pole). Bez lidí ve scéně nikdo. Kdo dnes jde na svatbu nebo
 * pohřeb (`atEvents`), u práce není – postavu mu dá obřad.
 */
export function masterFigures(
  ctx: Context,
  atEvents: ReadonlySet<number> = new Set(),
): PlannedVillager[] {
  const roster = ctx.roster;
  if (!roster) return [];
  const masters = (ctx.village.labor?.persons ?? []).filter((p) => p.mason !== undefined);
  if (masters.length === 0) return [];
  const today = churchToday(ctx);
  const churches = ctx.village.churches ?? [];
  const quarries = new Set((ctx.village.quarries ?? []).map((q) => q.outcropId));
  const hasQuarry = (id: number): boolean => quarries.has(id);
  const out: PlannedVillager[] = [];
  for (const person of masters) {
    if (atEvents.has(person.id)) continue;
    const craft = person.mason!;
    const c = cast(ctx, `master:${person.id}`, { women: 0, child: false }, () =>
      roster.takeId(person.id),
    );
    if (!c) continue;
    const planned = masterWork(craft, today, churches, hasQuarry);
    let job: MasterJob = {
      kind: 'master',
      craft,
      church: planned.church?.id ?? null,
      work: planned.work,
    };
    let spot = planned.church ? workSpot(ctx, job, planned.church, person.id) : null;
    let at = spot ? nearestFree(ctx, spot.x, spot.z, 1.5) : null;
    if (!spot || !at) {
      job = { kind: 'master', craft, church: null, work: 'home' };
      spot = homeSpot(ctx, person);
      at = spot ? nearestFree(ctx, spot.x, spot.z, 2) : null;
    }
    // ani u domu není místo – postava není, ale člověk zůstane obsazený (žádná práce vsi)
    if (!spot || !at) continue;
    out.push(figure(c, stand(at.x, at.z, spot.hx, spot.hz, spot.clip), 'natural', job));
  }
  return out;
}

/**
 * Role fází mistra huti a místa kroků jinde (villager-phases.ts; `at` = místo úlohy dne):
 * stavbyvedoucí obchází zdi k sousednímu místu, vápeník při pálení přikládá, mezi pálením nese
 * vápenec k peci a hasí vápno v jámě (jen s vápnem v jámě), kameník u hromady nese kámen k nejbližší
 * zdi; zedník, štukatér a kameník v lomu pracují na místě; doma postává.
 */
export function masterPhases(
  ctx: Context,
  job: MasterJob,
  at: Point,
): { role: PhaseRole; places?: PhasePlaces } {
  const church = (ctx.village.churches ?? []).find((c) => c.id === job.church);
  const site = church?.site;
  switch (job.work) {
    case 'home':
      return { role: 'master-home' };
    case 'sand':
      return { role: 'master-sand' };
    case 'quarry':
      return { role: 'master-quarry' };
    case 'walls':
      return { role: 'master-walls' };
    case 'decor':
      return { role: 'master-decor' };
    case 'layout':
    case 'site': {
      const role = job.work === 'layout' ? 'master-layout' : 'master-site';
      if (!church) return { role };
      const spots = churchWallSpots(church, MASTER_M.builder);
      const k = nearestIndex(spots, at);
      const other = k < 0 || spots.length < 2 ? undefined : spots[(k + 1) % spots.length];
      const places: PhasePlaces = other ? { wall: { x: other.x, z: other.z } } : {};
      if (job.work === 'site') Object.assign(places, roundPlaces(ctx, church));
      return { role, ...(Object.keys(places).length > 0 ? { places } : {}) };
    }
    case 'kiln': {
      if (!site) return { role: 'master-kiln' };
      if (site.burning) return { role: 'master-kiln' };
      const places: PhasePlaces = {
        haul: rimToward(site.kiln, at, KILN_M.ringR + MASTER_M.kiln),
      };
      if (site.limeT > 0) {
        places.pit = rimToward(limePitCenter(site), at, LIME_PIT_M.rimR + MASTER_M.pit);
      }
      return { role: 'master-lime', places };
    }
    case 'dress': {
      if (!church) return { role: 'master-dress' };
      const spots = churchWallSpots(church, MASTER_M.mason);
      const k = nearestIndex(spots, at);
      const near = k < 0 ? undefined : spots[k];
      return {
        role: 'master-dress',
        ...(near ? { places: { haul: { x: near.x, z: near.z } } } : {}),
      };
    }
  }
}

/**
 * Místa obchůzek stavbyvedoucího (návrh Clauda 12. 11. 2026): k lomu jen při lámání (a s lomem ve
 * scéně), k peci při práci na vápně nebo když hoří, k písníku při kopání písku a k dvorci vojvody
 * (stojí kousek před dveřmi; vojvoda tam být nemusí) – ten den hlásí, kde se co dělá.
 */
function roundPlaces(ctx: Context, church: SceneChurch): PhasePlaces {
  const places: PhasePlaces = {};
  const site = church.site;
  const works = churchToday(ctx)?.works ?? new Set<ChurchWork>();
  if (site) {
    const quarry = works.has('quarry') ? quarrySpot(ctx, site, 0) : null;
    if (quarry) places.quarry = { x: quarry.x, z: quarry.z };
    if (works.has('lime') || site.burning) places.kiln = kilnStokeSpot(site);
    if (works.has('sand')) {
      places.sand = rimToward(site.sandPit, church.position, SAND_PIT_M.radius + MASTER_M.sand);
    }
  }
  const lord = ctx.village.labor?.lord;
  if (lord) {
    const door = manorDoor(ctx, lord.home);
    places.manor = {
      x: door.x + door.headingX * MASTER_M.manorOut,
      z: door.z + door.headingZ * MASTER_M.manorOut,
    };
  }
  return places;
}

function nearestIndex(list: readonly Point[], p: Point): number {
  let best = -1;
  let bestD = Infinity;
  list.forEach((q, i) => {
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
