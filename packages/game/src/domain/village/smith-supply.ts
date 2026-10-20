import { createRandom, deriveSeed } from '../landscape/random';
import {
  detCos,
  detSin,
  length2,
  obstaclesNear,
  obstaclesOf,
  type Landscape,
  type ObstacleLayer,
} from '../landscape';
import { distanceFactor } from './fields';
import { obstacleChangesAt, obstacleStatus, type ObstacleStatus } from './obstacles';
import { PolygonIndex, villageLandSquares } from './squares';
import { ageGroup, ageYears } from './people';
import { PATH_FOREST, PATH_WATER_SPOT, PATH_WETLAND } from './paths/terrain';
import { groundSpots, villageRoadWalk, walkGroundOf } from './paths/walking';
import { kilnPoint, workshopKilns } from './charcoal';
import {
  CARTS,
  CART_JOBS,
  CLAY,
  CRAFT_PRODUCTION,
  DUG_SITE_VIEW,
  SMITH_SUPPLY,
  WATER_FETCHING,
} from './rules';
import type {
  CharcoalKiln,
  Dwelling,
  OreBatch,
  OrePit,
  OreSite,
  Person,
  VillageState,
  Workshop,
} from './types';

// Uhlí a ruda kováře (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026: „Kovář si vychovává
// nástupce. Pokud ve vesnici není vůz kovář si musí chodit pro uhlí k uhlíři. Pokud má dostatečně
// starého syna nebo syny, pošle pro uhlí jeho/je. Taky musí někam chodit kopat rudu. To místo, kde
// kope rudu, chci na mapě vidět.“; podrobnosti návrh Clauda). Uhlí z vypáleného milíře vytahá
// a vytřídí uhlíř, do kovárny ho v koších donesou synové kováře (uhlí od 10 let – ten den
// nepasou), nebo kovář sám z práce dílny; s vozem ho přiveze sedlák ze společné práce. Rudu kovář
// a synové od 14 let kopou na rudišti – v mokřině u potoka nejblíž kovárně – a nosí ji v koších,
// nebo ji odveze vůz se sedlákem. Bez rudy kovář nekove. Kroky mutují stav (volat na klonu), den po
// dni, deterministicky.

/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;
const DAYS_PER_YEAR = 365;
/** Délka pracovního dne v sekundách (jako chůze pro vodu – WATER_FETCHING.dayHours). */
const DAY_S = WATER_FETCHING.dayHours * 3600;
/** Kopání, praní a pražení rudy – čd na kg (bez chůze na rudiště). */
export const ORE_DIG_MAN_DAYS_PER_KG = 1 / SMITH_SUPPLY.oreKgPerManDay;

/**
 * Nošení v koších (čd na kg): tam a zpět po `walkM` m (vzdálenost chůze v metrech louky)
 * s košem po `basketKg` kg, naložení a složení koše (SMITH_SUPPLY).
 */
export function basketManDaysPerKg(walkM: number, basketKg: number): number {
  const tripS = (2 * Math.max(0, walkM)) / SMITH_SUPPLY.carryMps + SMITH_SUPPLY.basketLoadS;
  return tripS / DAY_S / basketKg;
}

/** Kopání rudy na rudišti (čd na kg): kopání, praní a pražení s přirážkou za chůzi (DISTANCE). */
export function oreDigManDaysPerKg(walkM: number): number {
  return ORE_DIG_MAN_DAYS_PER_KG * distanceFactor(walkM);
}

/** Kopání hlíny na hliništi (čd na kg – crafts.md, Hlína hrnčíře) s přirážkou za chůzi. */
export function clayDigManDaysPerKg(walkM: number): number {
  return distanceFactor(walkM) / CLAY.kgPerManDay;
}

/**
 * Surovina, kterou dílna kope u vody a nosí v koších nebo vozí vozem (crafts.md – Uhlí a ruda
 * kováře, Hlína hrnčíře): ruda kováře, hlína hrnčíře.
 */
export type DugMaterial = 'ore' | 'clay';

/** Kde dílna drží zásobu, místo a dávku suroviny a čísla jejího kopání a nošení. */
interface DugSpec {
  stock: 'oreKg' | 'clayKg';
  site: 'oreSite' | 'claySite';
  batch: 'oreBatch' | 'clayBatch';
  used: 'oreSitesUsed' | 'claySitesUsed';
  basketKg: number;
  depositKg: number;
  digPerKg: (walkM: number) => number;
  reserveDays: number;
}

const DUG: Record<DugMaterial, DugSpec> = {
  ore: {
    stock: 'oreKg',
    site: 'oreSite',
    batch: 'oreBatch',
    used: 'oreSitesUsed',
    basketKg: SMITH_SUPPLY.basketKg.ore,
    depositKg: SMITH_SUPPLY.depositKg,
    digPerKg: oreDigManDaysPerKg,
    reserveDays: CART_JOBS.ore.reserveDays,
  },
  clay: {
    stock: 'clayKg',
    site: 'claySite',
    batch: 'clayBatch',
    used: 'claySitesUsed',
    basketKg: CLAY.basketKg,
    depositKg: CLAY.depositKg,
    digPerKg: clayDigManDaysPerKg,
    reserveDays: CART_JOBS.clay.reserveDays,
  },
};

/** Nošení suroviny v koších (čd na kg) po `walkM` m. */
export function dugBasketManDaysPerKg(material: DugMaterial, walkM: number): number {
  return basketManDaysPerKg(walkM, DUG[material].basketKg);
}

/** Kopání suroviny (čd na kg) s přirážkou za chůzi `walkM` m. */
export function dugManDaysPerKg(material: DugMaterial, walkM: number): number {
  return DUG[material].digPerKg(walkM);
}

/** Člověk z kovárny – id a věk v letech. */
export interface SmithMember {
  id: number;
  age: number;
}

/**
 * Kovář domácnosti dílny: nejstarší muž, který není dítě (bez muže nejstarší dospělý, jinak
 * nejstarší člověk); prázdná dílna null.
 */
export function smithHead(members: readonly Person[], day: number): SmithMember | null {
  const sorted = [...members].sort((a, b) => a.bornDay - b.bornDay || a.id - b.id);
  const head =
    sorted.find((p) => p.sex === 'male' && ageGroup(p, day) !== 'child') ??
    sorted.find((p) => ageGroup(p, day) !== 'child') ??
    sorted[0];
  return head ? { id: head.id, age: ageYears(head.bornDay, day) } : null;
}

/**
 * Synové kováře (crafts.md – Uhlí a ruda kováře): chlapci a muži domácnosti dílny, jejichž otec
 * nebo matka v ní bydlí – od nejstaršího. Kovář sám mezi nimi není.
 */
export function smithSons(
  state: Pick<VillageState, 'people'>,
  dwellingId: number,
  day: number,
): SmithMember[] {
  const members = state.people.filter((p) => p.dwellingId === dwellingId);
  const head = smithHead(members, day);
  const ids = new Set(members.map((p) => p.id));
  return members
    .filter(
      (p) =>
        p.sex === 'male' &&
        p.id !== head?.id &&
        ((p.fatherId !== undefined && ids.has(p.fatherId)) ||
          (p.motherId !== undefined && ids.has(p.motherId))),
    )
    .sort((a, b) => a.bornDay - b.bornDay || a.id - b.id)
    .map((p) => ({ id: p.id, age: ageYears(p.bornDay, day) }));
}

/**
 * Synové, kteří dnes smějí nosit uhlí, a přitom nejsou v práci dílny: 10–13 let (výrostci – pasou,
 * když nenosí). Od nejstaršího.
 */
export function charcoalYoungsters(
  state: Pick<VillageState, 'people'>,
  dwellingId: number,
  day: number,
): SmithMember[] {
  return smithSons(state, dwellingId, day).filter(
    (s) => s.age >= SMITH_SUPPLY.charcoalFromAge && s.age < SMITH_SUPPLY.oreFromAge,
  );
}

/**
 * Kdo z kovárny jde kopat nebo nosit z práce dílny (věky): synové od 14 let od nejstaršího, pak
 * kovář – kolik lidí práce `manDays` zaměstná (aspoň jeden).
 */
export function smithCrewAges(
  state: Pick<VillageState, 'people'>,
  dwellingId: number,
  day: number,
  manDays: number,
): number[] {
  const members = state.people.filter((p) => p.dwellingId === dwellingId);
  const head = smithHead(members, day);
  const sons = smithSons(state, dwellingId, day)
    .filter((s) => s.age >= SMITH_SUPPLY.oreFromAge)
    .map((s) => s.age);
  const crew = [...sons, ...(head ? [head.age] : [])];
  const count = Math.max(1, Math.min(crew.length, Math.ceil(manDays - EPSILON)));
  return crew.slice(0, count).sort((a, b) => b - a);
}

/** Obývané kovárny v pořadí id. */
export function occupiedSmiths(state: Pick<VillageState, 'dwellings' | 'people'>): Dwelling[] {
  if (!state.dwellings.some((d) => d.workshop?.craft === 'smith')) return [];
  const occupied = new Set(state.people.map((p) => p.dwellingId));
  return state.dwellings
    .filter((d) => d.workshop?.craft === 'smith' && occupied.has(d.id))
    .sort((a, b) => a.id - b.id);
}

// --- uhlí z milíře ----------------------------------------------------------------------------

/**
 * Uhlí, které dnes někdo donese z milíře do kovárny (crafts.md – Uhlí a ruda kováře): uhlíř
 * `burnerId` dnes vytahá `kg` uhlí z milíře `kilnId` (`burnerDraws`), nese se do nejbližší
 * kovárny `smithId` (`walkM` – vzdálenost chůze kovárna ↔ milíř) od milíře v bodě `at`.
 */
export interface CharcoalDelivery {
  burnerId: number;
  /** Id milíře (chybí u milíře ze starší vsi před převodem). */
  kilnId?: number;
  smithId: number;
  kg: number;
  at: { x: number; z: number };
  walkM: number;
}

/**
 * Dodávky uhlí dne (mutuje stav – uloží vzdálenost chůze u milíře `CharcoalKiln.carry`): ke
 * každému milíři, ze kterého uhlíř dnes vytahá uhlí (`draws` – v pořadí plánu uhlířů), nejbližší
 * obývaná kovárna (vzdušnou čarou, při shodě menší id) a vzdálenost chůze z ní k milíři – po
 * pevných cestách s půdou krajiny (paths/walking.ts), bez krajiny vzdušně. Pro uhlí se chodí
 * k milíři (crafts.md – Milíř u skácených buků). Bez kovárny nic.
 */
export function charcoalDeliveries(
  state: VillageState,
  draws: readonly { burnerId: number; kilnId?: number; kg: number }[],
  landscape: Landscape | null,
): CharcoalDelivery[] {
  if (draws.length === 0) return [];
  const smiths = occupiedSmiths(state);
  if (smiths.length === 0) return [];
  const out: CharcoalDelivery[] = [];
  for (const { burnerId, kilnId, kg } of draws) {
    const burner = state.dwellings.find((d) => d.id === burnerId);
    const kiln = findKiln(burner, kilnId);
    if (!burner || !kiln || kg <= EPSILON) continue;
    const at = kilnPoint(burner, kiln);
    let smith = smiths[0]!;
    let best = Infinity;
    for (const d of smiths) {
      const dist = length2(d.position.x - at.x, d.position.z - at.z);
      if (dist < best - EPSILON) {
        best = dist;
        smith = d;
      }
    }
    if (kiln.carry?.smithId !== smith.id) {
      const walkM = landscape
        ? villageRoadWalk(state, landscape)(smith.position, [at])[0]!
        : length2(smith.position.x - at.x, smith.position.z - at.z);
      kiln.carry = { smithId: smith.id, walkM: Math.round(walkM * 100) / 100 };
    }
    out.push({
      burnerId,
      ...(kilnId !== undefined ? { kilnId } : {}),
      smithId: smith.id,
      kg,
      at,
      walkM: kiln.carry.walkM,
    });
  }
  return out;
}

/**
 * Milíř uhlíře `burner` s id `kilnId` (bez id první milíř – starší ves před převodem); jinak
 * undefined.
 */
export function findKiln(
  burner: Pick<Dwelling, 'workshop'> | undefined,
  kilnId: number | undefined,
): CharcoalKiln | undefined {
  const kilns = workshopKilns(burner?.workshop);
  return kilnId === undefined ? kilns[0] : kilns.find((k) => k.id === kilnId);
}

/** Nošení uhlí kovárny na dnešek (crafts.md – Uhlí a ruda kováře). */
export interface CharcoalFetch {
  smithId: number;
  /** Odkud se nosí: milíř uhlíře (id dílny uhlíře, id milíře, bod). */
  burnerId: number;
  kilnId?: number;
  at: { x: number; z: number };
  /** Kolik uhlí se nese pěšky (kg) a kolik práce to dá (čd dospělého). */
  kg: number;
  manDays: number;
}

/** Kdo dnes nosí uhlí do jedné kovárny. */
export interface SmithFetchDay {
  /** Synové 10–13 let, kteří dnes nosí (věky) – ten den nepasou; jejich práce (čd dospělého). */
  youngsters: { ids: number[]; ages: number[]; manDays: number };
  /** Zbytek nošení z domácnosti kováře (čd – synové od 14 a kovář). */
  household: number;
  /** Po milířích: kolik práce (čd) udělali synové 10–13 a kolik domácnost. */
  sources: {
    burnerId: number;
    kilnId?: number;
    at: { x: number; z: number };
    youngsters: number;
    household: number;
  }[];
}

/**
 * Kdo dnes nosí uhlí do kovárny `smithId` (crafts.md – Uhlí a ruda kováře): napřed synové 10–13
 * let (každý udělá SMITH_SUPPLY.youngsterShare práce dospělého, nosí jen tolik synů, kolik je
 * třeba), co nestačí, domácnost kováře z práce dílny (synové od 14 let – v práci dílny, a kovář).
 */
export function smithFetchDay(
  state: Pick<VillageState, 'people'>,
  smithId: number,
  day: number,
  fetches: readonly CharcoalFetch[],
): SmithFetchDay {
  const own = fetches.filter((f) => f.smithId === smithId && f.manDays > EPSILON);
  const total = own.reduce((sum, f) => sum + f.manDays, 0);
  const sons = total > EPSILON ? charcoalYoungsters(state, smithId, day) : [];
  const share = SMITH_SUPPLY.youngsterShare;
  const count = Math.min(sons.length, Math.ceil(total / share - EPSILON));
  const used = sons.slice(0, count);
  let young = Math.min(total, count * share);
  const youngsters = { ids: used.map((s) => s.id), ages: used.map((s) => s.age), manDays: young };
  const sources = own.map((f) => {
    const y = Math.min(f.manDays, young);
    young -= y;
    return {
      burnerId: f.burnerId,
      ...(f.kilnId !== undefined ? { kilnId: f.kilnId } : {}),
      at: f.at,
      youngsters: y,
      household: f.manDays - y,
    };
  });
  return { youngsters, household: Math.max(0, total - youngsters.manDays), sources };
}

// --- ruda --------------------------------------------------------------------------------------

/**
 * Ruda na dnešní kování na plný úvazek (kg): práce dílny `labor` ÷ práce na kg nástrojů × kg rudy
 * na kg nástrojů.
 */
export function forgeOreKg(labor: number): number {
  return (Math.max(0, labor) / CRAFT_PRODUCTION.toolManDaysPerKg) * SMITH_SUPPLY.oreKgPerToolKg;
}

/**
 * Dávka rudy pěšky (kg): na SMITH_SUPPLY.oreBatchDays dní kování na plný úvazek, aspoň jeden koš.
 */
export function footOreBatchKg(labor: number, batchDays: number): number {
  return Math.max(SMITH_SUPPLY.basketKg.ore, forgeOreKg(labor) * batchDays);
}

/**
 * Převod kovárny z doby před rudou (mutuje, idempotentně – crafts.md, Uhlí a ruda kováře, Starší
 * vsi): zásoba rudy začne na dávce (`footOreBatchKg` při dnešní práci dílny), aby kovář nepřestal
 * hned kovat; rudiště se vybere při prvním kopání.
 */
export function migrateSmith(workshop: Workshop, labor: number, batchDays: number): void {
  if (workshop.craft !== 'smith' || workshop.oreKg !== undefined) return;
  workshop.oreKg = footOreBatchKg(labor, batchDays);
}

/**
 * Hlína na dnešní hrnčířství na plný úvazek (kg; crafts.md – Hlína hrnčíře): práce dílny `labor`
 * krát výkon podle praxe `skill` (crafts.md – Učení řemesla) ÷ práce na kg keramiky × kg hlíny na
 * kg keramiky.
 */
export function potteryClayKg(labor: number, skill = 1): number {
  return (
    ((Math.max(0, labor) * skill) / CRAFT_PRODUCTION.potteryManDaysPerKg) * CLAY.kgPerPotteryKg
  );
}

/**
 * Převod dílny hrnčíře z doby před hlínou (mutuje, idempotentně – crafts.md, Hlína hrnčíře,
 * Starší vsi): zásoba hlíny začne na dávce (`batchDays` dní hrnčířství při dnešní práci), aby
 * hrnčíř nepřestal hned pracovat; hliniště se vybere při prvním kopání.
 */
export function migratePotter(
  workshop: Workshop,
  labor: number,
  skill: number,
  batchDays: number,
): void {
  if (workshop.craft !== 'potter' || workshop.clayKg !== undefined) return;
  workshop.clayKg = Math.max(CLAY.basketKg, potteryClayKg(labor, skill) * batchDays);
}

/** Rudiště nejméně tak daleko od obydlí (m – dům, pozemek). */
const ORE_SITE_HOME_M = 12;

/** Je bod `p` aspoň SMITH_SUPPLY.siteSpacingM od všech vyčerpaných ložisek? */
function awayFromUsed(
  p: { x: number; z: number },
  used: readonly { x: number; z: number }[],
): boolean {
  return used.every((u) => length2(p.x - u.x, p.z - u.z) >= SMITH_SUPPLY.siteSpacingM - EPSILON);
}

/**
 * Nové rudiště kovárny `smith` (crafts.md – Uhlí a ruda kováře): buňka mokřiny u potoka
 * (PATH_WETLAND terénu pěšin – suchá rovina u vody) nejblíž kovárně vzdušnou čarou (při shodě
 * menší x, z) aspoň SMITH_SUPPLY.siteSpacingM od vyčerpaných ložisek; bez mokřiny suchý břeh
 * (PATH_WATER_SPOT). Ne na čtvercích staveb vsi (pole, sad, hřbitov, ohrada, les vsi) ani u domů.
 * Místo má být na mapě vidět (crafts.md – Rudiště a hliniště na očích): mimo les a koruny stromů
 * (`inView`), les a koruny jen když volné místo není do rozumné vzdálenosti (DUG_SITE_VIEW).
 * Vzdálenost chůze po pevných cestách s půdou krajiny (mokřina a brody –
 * paths/walking.ts). Bez krajiny (testy, kalibrace) místo bez polohy ve vzdálenosti dílny k vodě
 * (`waterDistanceM`). Když není mokřina ani voda, null. `obstacles` = vrstva překážek krajiny
 * (koruny stromů); bez ní `obstaclesOf(landscape)`.
 */
export function chooseOreSite(
  state: VillageState,
  smith: Dwelling,
  day: number,
  landscape: Landscape | null,
  obstacles?: ObstacleLayer | null,
): OreSite | null {
  return chooseDugSite(state, smith, day, landscape, 'ore', obstacles);
}

/**
 * Stojí místo `p` na očích – shora vidět (crafts.md – Rudiště a hliniště na očích)? Mimo les
 * krajiny (PATH_FOREST terénu pěšin) a bez dospělého stromu do DUG_SITE_VIEW.treeClearM – stromy
 * vrstvy překážek, které dnes stojí (`status` – pokácený strom je pařez), i stromy, které přidala
 * ves (stromy u cest, les vsi).
 */
function inView(
  p: { x: number; z: number },
  ground: ReturnType<typeof walkGroundOf>,
  layer: ObstacleLayer,
  status: ObstacleStatus,
): boolean {
  const t = ground.terrain;
  const i = Math.round((p.x - t.originX) / t.cellM);
  const j = Math.round((p.z - t.originZ) / t.cellM);
  if (i >= 0 && j >= 0 && i < t.width && j < t.height && t.flags[j * t.width + i]! & PATH_FOREST) {
    return false;
  }
  const r = DUG_SITE_VIEW.treeClearM;
  for (const k of obstaclesNear(layer, p.x - r, p.z - r, p.x + r, p.z + r)) {
    if (length2(layer.x[k]! - p.x, layer.z[k]! - p.z) >= r) continue;
    if (status.kindOf(layer, k) === 'tree') return false;
  }
  return status
    .addedIn(p.x - r, p.z - r, p.x + r, p.z + r)
    .every((o) => o.kind !== 'tree' || length2(o.x - p.x, o.z - p.z) >= r);
}

/**
 * Nové místo, kde dílna kope surovinu `material` (rudiště kováře, hliniště hrnčíře – crafts.md,
 * Hlína hrnčíře): jako `chooseOreSite`, a aspoň SMITH_SUPPLY.siteSpacingM i od míst, kde dnes kopou
 * jiné dílny (rudiště a hliniště se nepřekrývají).
 */
export function chooseDugSite(
  state: VillageState,
  dwelling: Dwelling,
  day: number,
  landscape: Landscape | null,
  material: DugMaterial,
  obstacles?: ObstacleLayer | null,
): OreSite | null {
  const workshop = dwelling.workshop!;
  const spec = DUG[material];
  const used = workshop[spec.used] ?? [];
  if (!landscape) {
    const walkM = workshop.waterDistanceM ?? 0;
    // bez polohy: místo ve vzdálenosti k vodě, posunuté za vyčerpanými ložisky
    const shift = used.length * SMITH_SUPPLY.siteSpacingM;
    return {
      x: dwelling.position.x + walkM + shift,
      z: dwelling.position.z,
      minedKg: 0,
      day,
      walkM,
    };
  }
  // místa, kde kopou jiné dílny (rudiště kovářů, hliniště hrnčířů)
  const others = state.dwellings.flatMap((d) => {
    if (d.id === dwelling.id || !d.workshop) return [];
    return [d.workshop.oreSite, d.workshop.claySite].flatMap((site) =>
      site ? [{ x: site.x, z: site.z }] : [],
    );
  });
  const avoid = others.length > 0 ? [...used, ...others] : used;
  const ground = walkGroundOf(landscape);
  const from = dwelling.position;
  // na poli, v sadu, na hřbitově, v ohradě ani v lese vsi se nekope, u domů taky ne
  const land = new PolygonIndex(landscape, villageLandSquares(landscape, state));
  const homes = state.dwellings.map((d) => d.position);
  const free = (p: { x: number; z: number }): boolean =>
    land.containing(p.x, p.z).length === 0 &&
    homes.every((h) => length2(h.x - p.x, h.z - p.z) >= ORE_SITE_HOME_M);
  const nearest = (
    flag: number,
    ok?: (p: { x: number; z: number }) => boolean,
    reachM = Infinity,
  ): { x: number; z: number } | null => {
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    const limit = reachM * reachM;
    for (const p of groundSpots(ground, flag)) {
      if (!awayFromUsed(p, avoid)) continue;
      const d = (p.x - from.x) * (p.x - from.x) + (p.z - from.z) * (p.z - from.z);
      // body jdou po řádcích – při shodě vyhraje první
      if (d < bestD && d <= limit && free(p) && (!ok || ok(p))) {
        best = p;
        bestD = d;
      }
    }
    return best;
  };
  const closest = nearest(PATH_WETLAND) ?? nearest(PATH_WATER_SPOT);
  if (!closest) return null;
  // na očích (crafts.md – Rudiště a hliniště na očích): mimo les a koruny stromů, napřed mokřina,
  // pak břeh – nejvýš o DUG_SITE_VIEW dál než nejbližší místo; jinak to nejbližší
  let spot = closest;
  const layer = obstacles ?? obstaclesOf(landscape);
  const status = obstacleStatus(obstacleChangesAt(state, day));
  const visible = (p: { x: number; z: number }): boolean => inView(p, ground, layer, status);
  if (!visible(closest)) {
    const d = length2(closest.x - from.x, closest.z - from.z);
    const reach = Math.max(d * DUG_SITE_VIEW.openFarther, d + DUG_SITE_VIEW.openSlackM);
    spot =
      nearest(PATH_WETLAND, visible, reach) ?? nearest(PATH_WATER_SPOT, visible, reach) ?? closest;
  }
  const walkM = villageRoadWalk(state, landscape)(from, [spot])[0]!;
  if (!Number.isFinite(walkM)) return null;
  return {
    x: spot.x,
    z: spot.z,
    minedKg: 0,
    day,
    walkM: Math.round(walkM * 100) / 100,
  };
}

/**
 * Nová jáma u rudiště (mutuje stav – `VillageState.orePits`): kousek kolem místa (do
 * SMITH_SUPPLY.pitSpreadM), poloha ze seedu vsi, místa a pořadí jámy – deterministicky.
 */
export function openOrePit(
  state: VillageState,
  smithId: number,
  site: OreSite,
  day: number,
): OrePit {
  return openDugPit(state, smithId, site, day, 'ore');
}

/** Nová jáma suroviny `material` dílny `dwellingId` (jáma hlíny nese `clay`). */
function openDugPit(
  state: VillageState,
  dwellingId: number,
  site: OreSite,
  day: number,
  material: DugMaterial,
): OrePit {
  const pits = (state.orePits ??= []);
  const clay = material === 'clay';
  const count = pits.filter((p) => p.smithId === dwellingId && (p.clay === true) === clay).length;
  const random = createRandom(
    deriveSeed(
      state.seed,
      `${clay ? 'clay' : 'ore'}-pit:${dwellingId}:${site.day}:${Math.round(site.minedKg)}:${count}`,
    ),
  );
  const angle = random.next() * 2 * Math.PI;
  const radius = Math.sqrt(random.next()) * SMITH_SUPPLY.pitSpreadM;
  const pit: OrePit = {
    x: Math.round((site.x + radius * detCos(angle)) * 100) / 100,
    z: Math.round((site.z + radius * detSin(angle)) * 100) / 100,
    smithId: dwellingId,
    kg: 0,
    day,
    ...(clay ? { clay: true as const } : {}),
  };
  pits.push(pit);
  return pit;
}

/** Stáří jámy jako podíl zarůstání 0–1 (0 = čerstvá, 1 = zarostlá – zmizí). */
export function orePitOvergrowth(pit: Pick<OrePit, 'day'>, day: number): number {
  return Math.min(1, Math.max(0, (day - pit.day) / (SMITH_SUPPLY.pitYears * DAYS_PER_YEAR)));
}

/** Jámy, které zarostly (SMITH_SUPPLY.pitYears), zmizí (mutuje stav; bez jam nic). */
export function updateOrePits(state: VillageState, day: number): void {
  const pits = state.orePits;
  if (!pits) return;
  const kept = pits.filter((p) => orePitOvergrowth(p, day) < 1);
  if (kept.length === pits.length) return;
  if (kept.length > 0) state.orePits = kept;
  else delete state.orePits;
}

/** Poslední jáma kovárny (kde se právě kope); bez jam null. */
export function currentOrePit(state: VillageState, smithId: number): OrePit | null {
  return currentDugPit(state, smithId, 'ore');
}

/** Poslední jáma suroviny `material` dílny (kde se právě kope); bez jam null. */
function currentDugPit(
  state: VillageState,
  dwellingId: number,
  material: DugMaterial,
): OrePit | null {
  const pits = state.orePits ?? [];
  const clay = material === 'clay';
  for (let i = pits.length - 1; i >= 0; i--) {
    const pit = pits[i]!;
    if (pit.smithId === dwellingId && (pit.clay === true) === clay) return pit;
  }
  return null;
}

/** Kolik suroviny z ložiska ještě zbývá (kg; bez `material` ruda). */
export function depositLeftKg(
  site: Pick<OreSite, 'minedKg'>,
  material: DugMaterial = 'ore',
): number {
  return Math.max(0, DUG[material].depositKg - site.minedKg);
}

/** Vůz pro rudu dnes (wagons.md – Co vozy vozí): kolik kg odveze a práce kováře na jízdě (čd). */
export interface OreCartToday {
  kg: number;
  riderManDays: number;
}

/** Výsledek dne kovárny s rudou. */
export interface OreDay {
  /** Kopání (čd) a kolik rudy se vykopalo (kg). */
  dig: number;
  dugKg: number;
  /** Nošení rudy v koších (čd) a kolik (kg). */
  carry: number;
  carriedKg: number;
  /** Jízda s vozem pro rudu (čd práce kováře) a kolik rudy vůz přivezl (kg). */
  ride: number;
  cartKg: number;
  /** Zbylá práce dílny (čd). */
  left: number;
  /** Rudiště, kde se dnes pracovalo; jinak null. */
  site: { x: number; z: number } | null;
}

/**
 * Den kovárny s rudou (mutuje stav; crafts.md – Uhlí a ruda kováře): z práce dílny `labor` (po
 * nošení uhlí):
 * - vůz pro rudu (`cart` – sedlák přijel): kovář (nebo syn od 14) jede s ním, naloží hromadu u jámy
 *   a vrátí se s plným vozem,
 * - když zásoba rudy nestačí na dnešní kování na plný úvazek a dávka není rozdělaná, začne novou –
 *   na celý vůz, když ves má vůz doma a jízda ušetří práci proti nošení (`cartBatch`; pak už když
 *   zásoba vystačí jen na kopání dávky a CART_JOBS.ore.reserveDays dní kování), jinak na
 *   `batchDays` dní kování; bez rudiště ho vybere (`chooseOreSite`), vyčerpané ložisko vymění,
 * - kope (kopání s přirážkou za chůzi – `oreDigManDaysPerKg`) a u dávky pěšky vykopanou rudu hned
 *   nosí v koších do kovárny; dávka na vůz leží na hromadě u jámy, dokud nepřijede vůz – když
 *   nepřijede den po vykopání a kovář nemá rudu na dnešek, donesou ji v koších.
 * Vrací práci a zbytek práce pro kování.
 */
export function workOre(
  state: VillageState,
  smith: Dwelling,
  labor: number,
  day: number,
  options: DugOptions,
): OreDay {
  return workDug(state, smith, 'ore', labor, day, { ...options, needKg: forgeOreKg });
}

/** Volby dne dílny se surovinou (`workOre`, `workDug`). */
export interface DugOptions {
  landscape: Landscape | null;
  /** Vrstva překážek krajiny – koruny stromů u nového místa (`chooseDugSite`). */
  obstacles?: ObstacleLayer | null;
  batchDays: number;
  cart?: OreCartToday;
  /** Vyplatí se dávka na celý vůz? (kg vozu); null = ves vůz nemá nebo jízda neušetří. */
  cartBatch?: (site: OreSite) => number | null;
}

/**
 * Den dílny se surovinou `material` (mutuje stav – `workOre`; hrnčíř a hlína stejně – crafts.md,
 * Hlína hrnčíře): `needKg(labor)` = kolik suroviny dílna spotřebuje za den výroby na plný úvazek.
 */
export function workDug(
  state: VillageState,
  smith: Dwelling,
  material: DugMaterial,
  labor: number,
  day: number,
  options: DugOptions & { needKg: (labor: number) => number },
): OreDay {
  const spec = DUG[material];
  const workshop = smith.workshop!;
  const out: OreDay = {
    dig: 0,
    dugKg: 0,
    carry: 0,
    carriedKg: 0,
    ride: 0,
    cartKg: 0,
    left: Math.max(0, labor),
    site: null,
  };
  const need = options.needKg(out.left);
  let batch: OreBatch | null = workshop[spec.batch] ?? null;
  const site0 = workshop[spec.site];
  // vůz se sedlákem pro hromadu u jámy
  if (options.cart && batch && site0 && batch.heap > EPSILON) {
    const kg = Math.min(batch.heap, options.cart.kg);
    const ride = Math.min(out.left, options.cart.riderManDays);
    out.left -= ride;
    out.ride = ride;
    batch.heap -= kg;
    workshop[spec.stock] = (workshop[spec.stock] ?? 0) + kg;
    out.cartKg = kg;
    out.site = { x: site0.x, z: site0.z };
  }
  if (!batch && out.left > EPSILON) {
    const stock = workshop[spec.stock] ?? 0;
    let site = workshop[spec.site];
    if (site && depositLeftKg(site, material) <= EPSILON) {
      (workshop[spec.used] ??= []).push({ x: site.x, z: site.z });
      site = undefined;
      workshop[spec.site] = undefined;
    }
    // na celý vůz se začne kopat dřív: zásoba vydrží na kopání dávky a `reserveDays` dní výroby
    // – hromada u jámy pak počká, až bude vůz volný
    let cartKg: number | null = null;
    if (site && options.cartBatch && stock + EPSILON >= need) {
      const digDays = (CARTS.loadKg['two-wheel'] * spec.digPerKg(site.walkM)) / out.left;
      if (stock < need * (digDays + spec.reserveDays)) cartKg = options.cartBatch(site);
    }
    if (stock + EPSILON < need || cartKg !== null) {
      if (site === undefined) {
        site = chooseDugSite(state, smith, day, options.landscape, material, options.obstacles);
        workshop[spec.site] = site;
      }
      if (site) {
        cartKg ??= options.cartBatch?.(site) ?? null;
        const kg = Math.min(
          depositLeftKg(site, material),
          cartKg ?? Math.max(spec.basketKg, options.needKg(out.left) * options.batchDays),
        );
        batch = { kg, dug: 0, heap: 0, cart: cartKg !== null };
        workshop[spec.batch] = batch;
        openDugPit(state, smith.id, site, day, material);
      }
    }
  }
  const site = workshop[spec.site];
  if (batch && site) {
    const digPerKg = spec.digPerKg(site.walkM);
    const carryPerKg = basketManDaysPerKg(site.walkM, spec.basketKg);
    const done = batch.dug + EPSILON >= batch.kg;
    // hromada u jámy pěšky: u dávky pěšky vždy, u dávky na vůz den po vykopání, když dílna nemá
    // surovinu na dnešek a vůz nepřijel
    const footHeap =
      !batch.cart ||
      (done &&
        batch.readyDay !== undefined &&
        day > batch.readyDay &&
        (workshop[spec.stock] ?? 0) + EPSILON < need);
    if (footHeap && batch.heap > EPSILON && out.left > EPSILON) {
      const kg = Math.min(batch.heap, out.left / carryPerKg);
      batch.heap -= kg;
      workshop[spec.stock] = (workshop[spec.stock] ?? 0) + kg;
      out.left -= kg * carryPerKg;
      out.carry += kg * carryPerKg;
      out.carriedKg += kg;
    }
    if (!done && out.left > EPSILON) {
      const perKg = digPerKg + (batch.cart ? 0 : carryPerKg);
      const kg = Math.min(batch.kg - batch.dug, out.left / perKg, depositLeftKg(site, material));
      if (kg > EPSILON) {
        batch.dug += kg;
        site.minedKg += kg;
        out.dig += kg * digPerKg;
        out.dugKg += kg;
        out.left -= kg * perKg;
        const pit =
          currentDugPit(state, smith.id, material) ??
          openDugPit(state, smith.id, site, day, material);
        pit.kg += kg;
        pit.day = day;
        if (batch.cart) {
          batch.heap += kg;
        } else {
          workshop[spec.stock] = (workshop[spec.stock] ?? 0) + kg;
          out.carry += kg * carryPerKg;
          out.carriedKg += kg;
        }
      }
      if (batch.dug + EPSILON >= batch.kg || depositLeftKg(site, material) <= EPSILON) {
        batch.kg = batch.dug;
        batch.readyDay = day;
      }
    }
    if (out.dig > 0 || out.carry > 0) out.site = { x: site.x, z: site.z };
    if (batch.dug + EPSILON >= batch.kg && batch.heap <= EPSILON) workshop[spec.batch] = null;
  }
  return out;
}

/** Ruda a uhlí kovárny pro panel výběru (crafts.md – Uhlí a ruda kováře). */
export interface SmithOreSummary {
  /** Zásoba rudy v kovárně (kg). */
  stockKg: number;
  /** Rudiště – vzdálenost chůze z kovárny (m) a kolik rudy z ložiska zbývá (kg); bez něj null. */
  site: { walkM: number; leftKg: number } | null;
  /** Vykopaná ruda na hromadě u jámy (kg). */
  heapKg: number;
  /** Kdo nosí uhlí od milíře: synové 10–13 let (věky); prázdné = kovář (nebo syn od 14). */
  sons: number[];
  /** Ves má vůz se spřežením doma – uhlí a rudu přiveze sedlák, když to ušetří práci. */
  cart: boolean;
}

/** Hlína hrnčíře pro panel výběru (crafts.md – Hlína hrnčíře). */
export interface PotterClaySummary {
  /** Zásoba hlíny u dílny (kg). */
  stockKg: number;
  /** Hliniště – cesta z dílny (m) a kolik hlíny v něm zbývá (kg); bez něj null. */
  site: { walkM: number; leftKg: number } | null;
  /** Vykopaná hlína na hromadě u jámy (kg). */
  heapKg: number;
  /** Ves má vůz se spřežením doma – hlínu přiveze sedlák, když to ušetří práci. */
  cart: boolean;
}

/** Hlína dílny hrnčíře `potter` pro panel (nemění stav); `cart` jako u `smithOreSummary`. */
export function potterClaySummary(potter: Dwelling, cart: boolean): PotterClaySummary {
  const workshop = potter.workshop!;
  const site = workshop.claySite ?? null;
  return {
    stockKg: workshop.clayKg ?? 0,
    site: site ? { walkM: site.walkM, leftKg: depositLeftKg(site, 'clay') } : null,
    heapKg: workshop.clayBatch?.heap ?? 0,
    cart,
  };
}

/**
 * Ruda a uhlí kovárny `smith` v den `day` pro panel (nemění stav); `cart` = ves má vůz se
 * spřežením doma (`haulCartsToday`).
 */
export function smithOreSummary(
  state: VillageState,
  smith: Dwelling,
  day: number,
  cart: boolean,
): SmithOreSummary {
  const workshop = smith.workshop!;
  const site = workshop.oreSite ?? null;
  return {
    stockKg: workshop.oreKg ?? 0,
    site: site ? { walkM: site.walkM, leftKg: depositLeftKg(site) } : null,
    heapKg: workshop.oreBatch?.heap ?? 0,
    sons: charcoalYoungsters(state, smith.id, day).map((son) => son.age),
    cart,
  };
}
