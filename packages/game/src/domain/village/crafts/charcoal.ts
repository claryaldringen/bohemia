import { dateOfDayIndex } from '../../calendar';
import {
  detCos,
  detSin,
  length2,
  obstacleIndex,
  obstaclesNear,
  type ObstacleLayer,
} from '../../landscape';
import { distanceFactor } from '../fields/fields';
import {
  buildingLocalToWorld,
  fellTrees,
  obstacleChangesAt,
  obstacleStatus,
  plantOnStump,
  polygonObstacles,
  recordClearedObstacles,
  type ObstacleStatus,
  type TreeAtDistance,
} from '../core/obstacles';
import { sacredSitesOf } from '../people/sacred';
import { monthInWindow } from '../buildings/orchard';
import type { Point } from '../placement/polygon';
import {
  BEECH_PLANTING,
  CART_JOBS,
  CHARCOAL_BALANCE,
  CHARCOAL_KILN,
  CRAFT_PRODUCTION,
  FELLING_MAN_DAYS_PER_TREE,
  KILN_SITE,
  MILIR,
  OBSTACLE_COST,
  ORCHARD_PLANTING_WINDOWS,
} from '../rules';
import type {
  CharcoalKiln,
  CharcoalUse,
  CraftStocks,
  Dwelling,
  KilnRemnant,
  Position,
  VillageState,
  Workshop,
  WorkshopActivity,
} from '../types';
import type { Walk } from '../paths/walking';
import {
  addLogs,
  availableTrees,
  claimedObstacles,
  fellingsOf,
  fellingCost,
  isBeech,
  isTreeStanding,
  nearestMatureTrees,
} from '../forest/wood';

// Uhlíř (crafts.md – Uhlíř, Martin 18. 10. 2026; rešerše 2026-10-18-charcoal.md): pálí jen buky
// po dávkách do milíře – vybere nejbližší dospělé buky ke své zemnici (vyhradí je), skácí je
// a připraví dřevo, postaví milíř a pálí ho 8 dní (hlídá ve dne i v noci). Milíř je samostatná
// stavba uprostřed skácených buků (crafts.md – Milíř u skácených buků, Martin 20. 10. 2026:
// „uhlíř udělá milíř na místě, kde na něj skácel buky … Uhlíř bude k milíři chodit ze svého
// domku“) – za chůzi ze zemnice platí přirážku vzdálenosti na veškerou práci u milíře. Na pařezy
// skácených buků sází mladé buky (obnova lesa). Vypálený milíř je zásobou uhlí: uhlíř z něj vytahá
// uhlí, jak ho kovář odebírá, a další milíř začne včas podle spotřeby kovářů a doby cyklu
// (crafts.md – Rovnováha uhlíř – kovář) – najednou smí stát dva milíře. Rozebraný milíř zmizí
// a zůstane po něm milířiště. Krok dne mutuje stav (volat na klonu), den po dni – na kouscích
// nezávisí.

/** Tolerance proti chybám desetinných čísel u odvedené práce. */
const EPSILON = 1e-9;
/** Nejvýš tolik kroků práce uhlíře za den (sázení, buky, fáze milíře). */
const MAX_STEPS = 64;
const DAYS_PER_YEAR = 365;
/**
 * Vytahání a třídění uhlí z vypáleného milíře – čd na kg: z 2 čd na buk po 120 kg (vytahání,
 * třídění a odnos) bez odnosu v koších (CART_JOBS.charcoal.carryShare) – ten dělá kovářova
 * domácnost, nebo vůz se sedlákem (crafts.md – Uhlí a ruda kováře).
 */
export const DRAW_MAN_DAYS_PER_KG =
  (CHARCOAL_KILN.drawManDaysPerTree / CRAFT_PRODUCTION.charcoalKgPerTree) *
  (1 - CART_JOBS.charcoal.carryShare);

/**
 * Milíře uhlíře (crafts.md – Rovnováha uhlíř – kovář) v pořadí, jak je začal; dílna ze starší vsi
 * před převodem (`migrateKilns`) má nejvýš svůj jediný milíř `kiln`.
 */
export function workshopKilns(
  workshop: Pick<Workshop, 'kilns' | 'kiln'> | undefined,
): CharcoalKiln[] {
  if (!workshop) return [];
  if (workshop.kilns) return workshop.kilns;
  return workshop.kiln ? [workshop.kiln] : [];
}

/**
 * Kde stál milíř u uhlířovy zemnice ve vsích uložených před samostatnými milíři (MILIR.offset
 * v souřadnicích modelu) – jen pro převod (`migrateKilns`).
 */
export function homeKilnCenter(position: Position): { x: number; z: number } {
  const [x, z] = buildingLocalToWorld(position, MILIR.offset.x, MILIR.offset.z);
  return { x, z };
}

/** Střed milíře ve světě (m); milíř bez polohy (ves bez vrstvy překážek) stojí u zemnice. */
export function kilnPoint(
  burner: Pick<Dwelling, 'position'>,
  kiln: Pick<CharcoalKiln, 'site'>,
): { x: number; z: number } {
  return kiln.site ?? { x: burner.position.x, z: burner.position.z };
}

const KILN_CIRCLE_SIDES = 12;

/**
 * Mnohoúhelník kruhu milíře se středem `center` a poloměrem `radius` (m) – 12 vrcholů,
 * deterministicky (kontrola místa v prohlížeči i na serveru).
 */
export function kilnCircle(center: { x: number; z: number }, radius: number): Point[] {
  return Array.from({ length: KILN_CIRCLE_SIDES }, (_, i) => {
    const angle = (2 * Math.PI * i) / KILN_CIRCLE_SIDES;
    return [center.x + radius * detCos(angle), center.z + radius * detSin(angle)];
  });
}

/** Kolik uhlí dá milíř (kg) – 120 kg z každého buku dávky. */
export function kilnYieldKg(kiln: Pick<CharcoalKiln, 'trees'>): number {
  return kiln.trees.length * CRAFT_PRODUCTION.charcoalKgPerTree;
}

/**
 * Uhlí, které ve vypáleném milíři zbývá (kg; crafts.md – Milíř stojí vždy); milíř, který se teprve
 * chystá nebo pálí, 0. Vypálený milíř ze starší vsi (bez `charcoalKg`) má celou dávku.
 */
export function kilnCharcoalKg(
  kiln: Pick<CharcoalKiln, 'stage' | 'trees' | 'charcoalKg'> | null | undefined,
): number {
  if (!kiln || kiln.stage !== 'draw') return 0;
  return Math.max(0, kiln.charcoalKg ?? kilnYieldKg(kiln));
}

/** Podíl uhlí, které ve vypáleném milíři zbývá, 0–1 (scéna – milíř se zmenšuje); jinak 0. */
export function kilnCharcoalShare(
  kiln: Pick<CharcoalKiln, 'stage' | 'trees' | 'charcoalKg'> | null | undefined,
): number {
  const total = kiln ? kilnYieldKg(kiln) : 0;
  return total > 0 ? Math.min(1, kilnCharcoalKg(kiln) / total) : 0;
}

/** Milíř, který se teprve chystá (kácení a příprava dřeva, stavba) nebo pálí – uhlíř ho dodělá. */
export function kilnInProgress(workshop: Pick<Workshop, 'kilns' | 'kiln'>): CharcoalKiln | null {
  return workshopKilns(workshop).find((k) => k.stage !== 'draw') ?? null;
}

/**
 * Zásoba uhlí vsi (kg; crafts.md – Milíř stojí vždy): uhlí u kováře (`crafts.charcoalKg` – co
 * uhlíř donesl a kovář ještě nespálil, koupené) a uhlí ve vypálených milířích uhlířů.
 */
export function charcoalStockKg(state: Pick<VillageState, 'dwellings' | 'crafts'>): number {
  let kg = state.crafts?.charcoalKg ?? 0;
  for (const d of state.dwellings) {
    for (const kiln of workshopKilns(d.workshop)) kg += kilnCharcoalKg(kiln);
  }
  return kg;
}

/**
 * Rozebraný milíř zmizí a zůstane po něm milířiště (mutuje stav; crafts.md – Milíř u skácených
 * buků) – černá uhlíkatá zem, která za CHARCOAL_BALANCE.remnantYears zaroste. Milíř bez polohy
 * (ves bez vrstvy překážek) milířiště nemá.
 */
export function dismantleKiln(
  state: VillageState,
  burner: Dwelling,
  kiln: CharcoalKiln,
  day: number,
): void {
  const workshop = burner.workshop!;
  if (workshop.kilns) {
    workshop.kilns = workshop.kilns.filter((k) => k !== kiln);
  } else if (workshop.kiln === kiln) {
    workshop.kiln = null;
  }
  if (!kiln.site || kiln.id === undefined) return;
  (state.kilnRemnants ??= []).push({
    id: kiln.id,
    burnerId: burner.id,
    x: kiln.site.x,
    z: kiln.site.z,
    day,
  });
}

/** Stáří milířiště jako podíl zarůstání 0–1 (0 = čerstvě rozebraný milíř, 1 = zarostlé – zmizí). */
export function kilnRemnantOvergrowth(remnant: Pick<KilnRemnant, 'day'>, day: number): number {
  return Math.min(
    1,
    Math.max(0, (day - remnant.day) / (CHARCOAL_BALANCE.remnantYears * DAYS_PER_YEAR)),
  );
}

/** Zarostlá milířiště zmizí (mutuje stav; bez milířišť nic). */
export function updateKilnRemnants(state: VillageState, day: number): void {
  const remnants = state.kilnRemnants;
  if (!remnants) return;
  const kept = remnants.filter((r) => kilnRemnantOvergrowth(r, day) < 1);
  if (kept.length === remnants.length) return;
  if (kept.length > 0) state.kilnRemnants = kept;
  else delete state.kilnRemnants;
}

/**
 * Vezme ze zásoby vsi `kg` uhlí (mutuje stav; prodej sousedovi – trade.md): napřed u kováře, pak
 * z vypálených milířů v pořadí id dílen a od nejstaršího milíře – milíř se tím rozebírá (vytahají
 * ho nosiči výpravy), rozebraný zmizí (milířiště) a uhlíř postaví nový. Vrátí, kolik uhlí vzal.
 */
export function takeCharcoal(state: VillageState, kg: number, day = state.lastDay): number {
  let left = Math.max(0, kg);
  const crafts = state.crafts;
  if (crafts && crafts.charcoalKg > 0) {
    const loose = Math.min(left, crafts.charcoalKg);
    crafts.charcoalKg -= loose;
    left -= loose;
  }
  const burners = state.dwellings
    .filter((d) => workshopKilns(d.workshop).some((k) => kilnCharcoalKg(k) > 0))
    .sort((a, b) => a.id - b.id);
  for (const d of burners) {
    for (const kiln of [...workshopKilns(d.workshop)]) {
      if (left <= EPSILON) break;
      const inKiln = kilnCharcoalKg(kiln);
      if (inKiln <= 0) continue;
      const taken = Math.min(left, inKiln);
      left -= taken;
      if (inKiln - taken <= EPSILON) dismantleKiln(state, d, kiln, day);
      else kiln.charcoalKg = inKiln - taken;
    }
  }
  return Math.max(0, kg) - left;
}

/**
 * Převod milíře ze starší vsi (mutuje): milíř, ze kterého se uhlí vytahovalo najednou (fáze `draw`
 * bez `charcoalKg`), je vypálený s celou dávkou uhlí – rozdělané vytahání se zapomene (crafts.md –
 * Milíř stojí vždy, Starší vsi). Idempotentní.
 */
export function migrateKiln(kiln: CharcoalKiln): void {
  if (kiln.stage !== 'draw' || kiln.charcoalKg !== undefined) return;
  kiln.charcoalKg = kilnYieldKg(kiln);
  kiln.done = 0;
}

/**
 * Převod dílny uhlíře ze starší vsi na samostatné milíře (mutuje stav, idempotentně; crafts.md –
 * Milíř u skácených buků, Starší vsi): jediný milíř `kiln` se přesune do `kilns` – dodělá se
 * a rozebere na svém místě (milíř u zemnice stojí dál kus od ní, lesní v lese), další už stojí
 * u dávky; dostane id. Milíř u zemnice (`site` null) dostane polohu, kde stál – kus od zemnice
 * (MILIR.offset).
 */
export function migrateKilns(state: VillageState, burner: Dwelling): void {
  const workshop = burner.workshop!;
  if (!workshop.kilns) {
    const old = workshop.kiln ?? null;
    workshop.kilns = [];
    if (old) {
      if (old.site === null) old.site = homeKilnCenter(burner.position);
      workshop.kilns.push(old);
    }
  }
  delete workshop.kiln;
  for (const kiln of workshop.kilns) {
    migrateKiln(kiln);
    kiln.id ??= state.nextId++;
  }
}

/**
 * Kolik dní uhlíř připraví a vypálí milíř (crafts.md – Rovnováha uhlíř – kovář): dávka `kiln` –
 * kácení a dovoz, příprava dřeva a stavba s přirážkou za chůzi ze zemnice `home` – při práci
 * `labor` čd za den, a k tomu pálení. Bez práce jen pálení.
 */
export function kilnLeadDays(
  kiln: Pick<CharcoalKiln, 'trees' | 'site' | 'walkM'>,
  home: Position,
  labor: number,
): number {
  if (labor <= EPSILON) return CHARCOAL_KILN.burnDays;
  const work =
    kiln.trees.reduce(
      (sum, t) =>
        sum + t.cost + CHARCOAL_KILN.prepManDaysPerTree + CHARCOAL_KILN.buildManDaysPerTree,
      0,
    ) * kilnWalkFactor(kiln, home);
  return work / labor + CHARCOAL_KILN.burnDays;
}

/**
 * Doba cyklu milíře uhlíře (dny; crafts.md – Rovnováha uhlíř – kovář): průměr posledních cyklů
 * (`Workshop.kilnCycles` – od výběru buků po vypálení), bez měření odhad z čísel CHARCOAL_KILN –
 * buky u milíře, přirážka za chůzi jako u posledního milíře – při práci domácnosti `labor` čd/den.
 */
export function kilnCycleDays(
  workshop: Pick<Workshop, 'kilns' | 'kiln' | 'kilnCycles'>,
  home: Position,
  labor: number,
): number {
  const cycles = workshop.kilnCycles ?? [];
  if (cycles.length > 0) return cycles.reduce((sum, d) => sum + d, 0) / cycles.length;
  const last = workshopKilns(workshop).at(-1);
  const typical = {
    trees: Array.from({ length: CHARCOAL_KILN.trees }, () => ({
      id: null,
      cost: FELLING_MAN_DAYS_PER_TREE,
    })),
    site: last?.site ?? null,
    ...(last?.walkM !== undefined ? { walkM: last.walkM } : {}),
  };
  return kilnLeadDays(typical, home, labor);
}

/**
 * Násobek práce u milíře za chůzi ze zemnice (crafts.md – Milíř u skácených buků): o 1 % dražší
 * za každých 10 m nad 100 m od zemnice (DISTANCE) – po pevných cestách s půdou (`walkM`), bez
 * údaje vzdušně; milíř bez polohy 1.
 */
export function kilnWalkFactor(kiln: Pick<CharcoalKiln, 'site' | 'walkM'>, home: Position): number {
  if (!kiln.site) return 1;
  return distanceFactor(kiln.walkM ?? length2(kiln.site.x - home.x, kiln.site.z - home.z));
}

/** Je den v okně výsadby (jaro, podzim – jako sad)? */
export function inPlantingWindow(day: number): boolean {
  return monthInWindow(ORCHARD_PLANTING_WINDOWS, dateOfDayIndex(day).month);
}

/**
 * Kde postavit milíř u dávky buků (crafts.md – Milíř u skácených buků): rovné volné místo co nejblíž
 * středu dávky `center`, kde je milíř vidět (`findKilnSite` v kiln-site.ts – buky dávky `batch`
 * padnou); bez krajiny střed dávky.
 */
export type KilnSiteFinder = (
  center: { x: number; z: number },
  batch: ReadonlySet<number | null>,
) => { x: number; z: number };

/** Střed dávky buků (m, na cm). */
function batchCenter(trees: readonly TreeAtDistance[]): { x: number; z: number } {
  const x = trees.reduce((sum, t) => sum + t.x, 0) / trees.length;
  const z = trees.reduce((sum, t) => sum + t.z, 0) / trees.length;
  return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
}

/**
 * Nový milíř (mutuje stav – id z `nextId`; crafts.md – Milíř u skácených buků): dávka buků jsou
 * nejbližší stojící dospělé buky k prvnímu buku nejblíž zemnici uhlíře, které nepatří jiné stavbě
 * ani dílně a nejsou posvátné; milíř stojí na rovném volném místě uprostřed nich (`site`). Kácení
 * a dovoz dřeva se platí od milíře (pár metrů), chůze ze zemnice k milíři se změří po pevných
 * cestách s půdou (`walk`) – přirážka na veškerou práci u milíře. Bez vrstvy překážek (null – jen
 * testy) se kácí bez polohy u zemnice. Když není z čeho kácet, null.
 */
export function startKiln(
  state: VillageState,
  dwelling: Pick<Dwelling, 'position'>,
  day: number,
  obstacles: ObstacleLayer | null,
  options: { walk?: Walk; site?: KilnSiteFinder } = {},
): CharcoalKiln | null {
  const fresh = (site: CharcoalKiln['site'], trees: CharcoalKiln['trees']): CharcoalKiln => ({
    id: state.nextId++,
    startDay: day,
    site,
    trees,
    stage: 'wood',
    prepared: 0,
    done: 0,
  });
  if (!obstacles) {
    const tree = { id: null, cost: fellingCost(0) };
    return fresh(
      null,
      Array.from({ length: CHARCOAL_KILN.trees }, () => ({ ...tree })),
    );
  }
  // bez buků v celé krajině se nehledá po políčkách (celá vrstva by se procházela každý den)
  if (availableTrees(obstacles, state, day, 'beeches') <= 0) return null;
  const changes = obstacleChangesAt(state, day);
  const claimed = claimedObstacles(state);
  const home = dwelling.position;
  const [first] = nearestMatureTrees(obstacles, changes, home, 1, claimed, isBeech);
  if (!first) return null;
  const trees = nearestMatureTrees(
    obstacles,
    changes,
    first,
    CHARCOAL_KILN.trees,
    claimed,
    isBeech,
  );
  const center = batchCenter(trees);
  const site = options.site ? options.site(center, new Set(trees.map((t) => t.id))) : center;
  // dřevo se k milíři nosí jen pár metrů (vzdušně), uhlíř chodí ze zemnice po cestách (walk)
  const kiln = fresh(
    { x: site.x, z: site.z },
    fellingsOf(trees, site, undefined).map((t) => ({ id: t.id, cost: t.cost })),
  );
  // milířiště je paseka: ostatní překážky v kruhu milíře a stromy, jejichž koruna sahá nad milíř
  // nebo kolem něj, uhlíř napřed vyklidí (buky dávky skácí na milíř, vyhrazené stromy jiných staveb
  // a posvátné stromy nechá)
  const keep = new Set([
    ...claimed,
    ...trees.map((t) => t.id),
    ...sacredSitesOf(obstacles).protectedTrees,
  ]);
  const status = obstacleStatus(changes);
  const tally = polygonObstacles(
    obstacles,
    status,
    kilnCircle(site, MILIR.clearingRadiusM),
    new Set(),
    keep,
  );
  const crowns = kilnCrownTrees(obstacles, status, site, new Set([...keep, ...tally.ids]));
  const ids = [...tally.ids, ...crowns];
  if (ids.length > 0) {
    kiln.clearing = {
      ids,
      cost: tally.cost + crowns.length * OBSTACLE_COST.tree,
      logs: tally.treeIds.length + crowns.length,
    };
  }
  if (options.walk) kiln.walkM = Math.round(options.walk(home, [site])[0]! * 100) / 100;
  return kiln;
}

/** Poloměr kupy milíře (m) – koruna stromu nad ním milíř zakryje. */
const KILN_HEAP_RADIUS_M = MILIR.footprintM / 2;
/** Nejširší koruna, se kterou se počítá (m) – strom s měřítkem nad 1,5 nezvětší dosah. */
const MAX_CROWN_M = KILN_SITE.crownM * 1.5;

/** Je překážka vrstvy dospělý strom nebo souš (koruna, vysoký kmen)? */
function isTallTree(kind: string | null): boolean {
  return kind === 'tree' || kind === 'snag';
}

/**
 * Dospělé stromy a souše, jejichž koruna (KILN_SITE.crownM × měřítko stromu, přidané stromy
 * měřítko 1) zasahuje nad milíř se středem `site` nebo do KILN_SITE.clearAroundM kolem něj
 * (crafts.md – Milíř u skácených buků: milířiště je paseka); bez stromů z `keep`. Id vzestupně
 * podle vzdálenosti – deterministicky.
 */
export function kilnCrownTrees(
  layer: ObstacleLayer,
  status: ObstacleStatus,
  site: { x: number; z: number },
  keep: ReadonlySet<number | null>,
): number[] {
  const reach = KILN_HEAP_RADIUS_M + KILN_SITE.clearAroundM;
  const max = reach + MAX_CROWN_M;
  const found: { id: number; d: number }[] = [];
  for (const i of obstaclesNear(layer, site.x - max, site.z - max, site.x + max, site.z + max)) {
    const id = layer.id[i]!;
    if (keep.has(id) || !isTallTree(status.kindOf(layer, i))) continue;
    const d = length2(layer.x[i]! - site.x, layer.z[i]! - site.z);
    const crown = Math.min(MAX_CROWN_M, KILN_SITE.crownM * layer.scale[i]!);
    if (d < reach + crown) found.push({ id, d });
  }
  for (const o of status.addedIn(site.x - max, site.z - max, site.x + max, site.z + max)) {
    if (keep.has(o.id) || o.kind !== 'tree') continue;
    const d = length2(o.x - site.x, o.z - site.z);
    if (d < reach + KILN_SITE.crownM) found.push({ id: o.id, d });
  }
  return found.sort((a, b) => a.d - b.d || a.id - b.id).map((t) => t.id);
}

/**
 * Kolik dospělých stromů zakryje milíř se středem `site` z výchozí kamery (crafts.md – Milíř
 * u skácených buků; KILN_SITE.view): stromy a souše v pruhu KILN_SITE.view.halfWidthM na obě
 * strany a KILN_SITE.view.lengthM k jihu (ke kameře), které nepadnou s pasekou (`kilnCrownTrees`)
 * ani nepatří k `keep` (buky dávky).
 */
export function kilnViewBlockers(
  layer: ObstacleLayer,
  status: ObstacleStatus,
  site: { x: number; z: number },
  keep: ReadonlySet<number | null>,
): number {
  const { lengthM, halfWidthM } = KILN_SITE.view;
  const reach = KILN_HEAP_RADIUS_M + KILN_SITE.clearAroundM;
  const minX = site.x - halfWidthM;
  const maxX = site.x + halfWidthM;
  const minZ = site.z - lengthM;
  let count = 0;
  const blocks = (id: number, x: number, z: number, crown: number): boolean =>
    !keep.has(id) &&
    x >= minX &&
    x <= maxX &&
    z >= minZ &&
    z <= site.z &&
    length2(x - site.x, z - site.z) >= reach + crown;
  for (const i of obstaclesNear(layer, minX, minZ, maxX, site.z)) {
    if (!isTallTree(status.kindOf(layer, i))) continue;
    const crown = Math.min(MAX_CROWN_M, KILN_SITE.crownM * layer.scale[i]!);
    if (blocks(layer.id[i]!, layer.x[i]!, layer.z[i]!, crown)) count++;
  }
  for (const o of status.addedIn(minX, minZ, maxX, site.z)) {
    if (o.kind === 'tree' && blocks(o.id, o.x, o.z, KILN_SITE.crownM)) count++;
  }
  return count;
}

/** Práce uhlíře dne u jednoho milíře (rozdělení práce dne – postavy u milíře). */
export interface KilnWork {
  /** Id milíře (chybí u milíře ze starší vsi před převodem – jen testy). */
  id?: number;
  x: number;
  z: number;
  /** Stavba, hlídání, vytahání (čd). */
  making: number;
}

/** Výsledek dne uhlíře pro rozdělení práce dne a panel. */
export interface BurnerDay {
  /** Kácení a příprava dřeva u buků (člověkodny) a buky, u kterých se dnes pracovalo. */
  felling: number;
  fellingTrees: number[];
  /** Práce u milíře – stavba, hlídání, vytahání (čd). */
  making: number;
  /** Sázení mladých buků (čd) a pařezy, na které dnes uhlíř zasadil. */
  planting: number;
  plantedTrees: number[];
  /** Uhlí, které dnes přibylo (kg – vytahaný milíř). */
  producedKg: number;
  /** Práce u milířů po milířích (stavba, hlídání, vytahání); kácení jde k bukům. */
  kilns: KilnWork[];
  activity: WorkshopActivity;
}

/** Kolik uhlí uhlíř dnes vytahá z jednoho vypáleného milíře (crafts.md – Rovnováha). */
export interface KilnDrawPlan {
  /** Id milíře (chybí u milíře ze starší vsi před převodem). */
  kilnId?: number;
  kg: number;
}

/** Co uhlíř dnes dělá (crafts.md – Rovnováha uhlíř – kovář). */
export interface BurnerPlan {
  /**
   * Kolik uhlí dnes vytahá z vypálených milířů pro kováře (kg po milířích – `burnerPlans`
   * v crafts.ts); prázdné = nevytahá. Do kovárny ho donese kovářova domácnost nebo vůz (crafts.md
   * – Uhlí a ruda kováře).
   */
  draws: KilnDrawPlan[];
  /**
   * Dávka pro kováře (kg) i s dnešním vytaháním – co z ní dnes nestihne, vytahá v dalších dnech
   * (`Workshop.charcoalOrderKg`); 0 = žádná dávka.
   */
  orderKg: number;
  /**
   * Začne dnes nový milíř (vybere buky a kácí) – nemá žádný, nebo uhlí ve vsi stačí jen na dobu
   * cyklu a rezervu (crafts.md – Rovnováha uhlíř – kovář)?
   */
  start: boolean;
}

/** Plán bez vytahování a bez nového milíře. */
export const IDLE_BURNER: BurnerPlan = { draws: [], orderKg: 0, start: false };

/**
 * Starší dílna uhlíře (mutuje stav, idempotentně): z doby před milíři – skácené dřevo, ze kterého
 * ještě nevzniklo uhlí, se dopálí do zásoby u kováře a rozdělané kácení se opustí (strom se
 * uvolní); z doby, kdy se milíř vytahal najednou, je vytahovaný milíř vypálený s celou dávkou
 * (`migrateKiln`); jediný milíř se převede na samostatné milíře (`migrateKilns`). Volá se v kroku
 * práce řemeslníků pro každou dílnu uhlíře, takže se to stane v prvním dopočítaném dni – na
 * kouscích nezávisí.
 */
export function migrateBurner(state: VillageState, burner: Dwelling, stocks: CraftStocks): void {
  const workshop = burner.workshop!;
  if (workshop.fuelKg > 0) stocks.charcoalKg += workshop.fuelKg;
  workshop.fuelKg = 0;
  workshop.felling = null;
  migrateKilns(state, burner);
}

/** Zapíše dobu cyklu vypáleného milíře (od výběru buků po vypálení – CHARCOAL_BALANCE.cycles). */
function recordKilnCycle(workshop: Workshop, kiln: CharcoalKiln, day: number): void {
  if (kiln.startDay === undefined) return;
  const cycles = [...(workshop.kilnCycles ?? []), day - kiln.startDay + 1];
  workshop.kilnCycles = cycles.slice(-CHARCOAL_BALANCE.cycles);
}

/**
 * Den uhlíře (mutuje stav): `labor` = práce domácnosti řemeslu (po denním minimu).
 * Pálící milíř zabere celý den (hlídání ve dne i v noci) – po CHARCOAL_KILN.burnDays dnech je
 * vypálený. Jinak nejdřív vytahá a vytřídí pro kováře uhlí podle plánu (`plan.draws` – u milíře
 * s přirážkou za chůzi ze zemnice) do zásoby u kováře – donese ho kovářova domácnost nebo vůz se
 * sedlákem (crafts.md – Uhlí a ruda kováře); rozebraný milíř zmizí (milířiště). V okně výsadby
 * sází mladé buky na pařezy. Pak pokračuje v rozdělaném milíři (buky strom po stromu: kácení a dovoz,
 * pak příprava dřeva; stavba), a když žádný nemá a plán ho chce (`plan.start` – crafts.md,
 * Rovnováha uhlíř – kovář), začne nový u další dávky buků.
 */
export function workBurner(
  state: VillageState,
  dwelling: Dwelling,
  stocks: CraftStocks,
  labor: number,
  day: number,
  obstacles: ObstacleLayer | null,
  plan: BurnerPlan,
  options: { walk?: Walk; site?: KilnSiteFinder } = {},
): BurnerDay {
  const workshop = dwelling.workshop!;
  migrateBurner(state, dwelling, stocks);
  const kilns = (workshop.kilns ??= []);
  const out: BurnerDay = {
    felling: 0,
    fellingTrees: [],
    making: 0,
    planting: 0,
    plantedTrees: [],
    producedKg: 0,
    kilns: [],
    activity: 'idle',
  };
  const workAt = (kiln: CharcoalKiln, making: number): void => {
    out.making += making;
    const at = kilnPoint(dwelling, kiln);
    const entry = out.kilns.find((k) => k.id === kiln.id);
    if (entry) entry.making += making;
    else out.kilns.push({ ...(kiln.id !== undefined ? { id: kiln.id } : {}), ...at, making });
  };
  let left = Math.max(0, labor);
  let worked: WorkshopActivity | null = null;
  let noWood = false;
  // pálící milíř se hlídá ve dne i v noci – celá práce dne
  const burning = kilns.find((k) => k.stage === 'burn');
  if (burning) {
    workAt(burning, left);
    burning.done += 1;
    if (burning.done + EPSILON >= CHARCOAL_KILN.burnDays) {
      // vypálený milíř je zásobou uhlí – rozebírá se podle odběru kovářů
      burning.stage = 'draw';
      burning.done = 0;
      burning.charcoalKg = kilnYieldKg(burning);
      recordKilnCycle(workshop, burning, day);
    }
    out.activity = 'burning';
    return out;
  }
  // vypálené milíře: uhlíř vytahá a vytřídí uhlí pro kováře podle plánu dne, jinak milíř stojí
  // a čeká; do kovárny ho donese kovářova domácnost nebo vůz (crafts.md – Uhlí a ruda kováře)
  let drawn = 0;
  for (const draw of plan.draws) {
    if (left <= EPSILON) break;
    const kiln = kilns.find((k) => k.id === draw.kilnId && k.stage === 'draw');
    if (!kiln) continue;
    const inKiln = kilnCharcoalKg(kiln);
    const perKg = DRAW_MAN_DAYS_PER_KG * kilnWalkFactor(kiln, dwelling.position);
    const kg = Math.min(draw.kg, inKiln, left / perKg);
    if (kg <= EPSILON) continue;
    left -= kg * perKg;
    workAt(kiln, kg * perKg);
    out.producedKg += kg;
    drawn += kg;
    stocks.charcoalKg += kg;
    worked = 'drawing';
    if (inKiln - kg > EPSILON) {
      kiln.charcoalKg = inKiln - kg;
      continue;
    }
    // rozebraný milíř zmizí – zůstane milířiště
    dismantleKiln(state, dwelling, kiln, day);
  }
  // zbytek dávky pro kováře vytahá v dalších dnech (crafts.md – Rovnováha uhlíř – kovář)
  const order = plan.orderKg - drawn;
  if (order > EPSILON && kilns.some((k) => kilnCharcoalKg(k) > 0)) workshop.charcoalOrderKg = order;
  else delete workshop.charcoalOrderKg;
  // obnova lesa: v okně výsadby mladé buky na pařezy (crafts.md – Uhlíř)
  if (inPlantingWindow(day)) {
    const toPlant = workshop.toPlant ?? [];
    while (left > EPSILON && toPlant.length > 0) {
      const id = toPlant[0]!;
      toPlant.shift();
      if (!plantOnStump(state, id, day)) continue;
      const cost = BEECH_PLANTING.manDaysPerTree * stumpWalkFactor(obstacles, id, dwelling);
      const spent = Math.min(left, cost);
      left -= spent;
      out.planting += spent;
      out.plantedTrees.push(id);
      worked = 'planting';
    }
    if (workshop.toPlant) {
      if (toPlant.length > 0) workshop.toPlant = toPlant;
      else delete workshop.toPlant;
    }
  }
  for (let step = 0; step < MAX_STEPS && left > EPSILON; step++) {
    let kiln = kilnInProgress(workshop);
    if (!kiln) {
      if (!plan.start || kilns.length >= CHARCOAL_BALANCE.maxKilns) break;
      kiln = startKiln(state, dwelling, day, obstacles, options);
      if (!kiln) {
        noWood = true;
        break;
      }
      kilns.push(kiln);
    }
    const factor = kilnWalkFactor(kiln, dwelling.position);
    if (kiln.stage === 'burn') break;
    // napřed vyklidí milířiště – ostatní stromy, keře a kameny v kruhu milíře
    const clearing = kiln.stage === 'wood' && kiln.prepared === 0 ? kiln.clearing : undefined;
    if (clearing) {
      const work = Math.min(left / factor, Math.max(0, clearing.cost - kiln.done));
      kiln.done += work;
      left -= work * factor;
      out.felling += work * factor;
      worked = 'felling';
      if (kiln.done + EPSILON >= clearing.cost) {
        recordClearedObstacles(state, clearing.ids, day);
        addLogs(state, clearing.logs, kiln.site);
        delete kiln.clearing;
        kiln.done = 0;
      }
      continue;
    }
    if (kiln.stage === 'wood') {
      const tree = kiln.trees[kiln.prepared]!;
      const total = tree.cost + CHARCOAL_KILN.prepManDaysPerTree;
      const work = Math.min(left / factor, Math.max(0, total - kiln.done));
      const before = kiln.done;
      kiln.done += work;
      left -= work * factor;
      out.felling += work * factor;
      if (tree.id !== null && !out.fellingTrees.includes(tree.id)) out.fellingTrees.push(tree.id);
      if (before < tree.cost - EPSILON && kiln.done + EPSILON >= tree.cost)
        fellBeech(state, workshop, tree.id, day);
      worked = 'felling';
      if (kiln.done + EPSILON >= total) {
        kiln.prepared++;
        kiln.done = 0;
        if (kiln.prepared >= kiln.trees.length) kiln.stage = 'build';
      }
      continue;
    }
    const total = CHARCOAL_KILN.buildManDaysPerTree * kiln.trees.length;
    const work = Math.min(left / factor, Math.max(0, total - kiln.done));
    kiln.done += work;
    left -= work * factor;
    workAt(kiln, work * factor);
    worked = 'building';
    if (kiln.done + EPSILON < total) continue;
    // postavený milíř se zapálí – pálí se od zítřka
    kiln.stage = 'burn';
    kiln.done = 0;
    break;
  }
  out.activity =
    worked ??
    (noWood
      ? 'no-wood'
      : labor <= EPSILON
        ? 'idle'
        : kilnInProgress(workshop)
          ? 'idle'
          : 'resting');
  return out;
}

/**
 * Pokácí buk dávky (pařez) a zapíše ho k obnově – na pařez uhlíř později zasadí mladý buk.
 * Vyhrazený buk, který mezitím zmizel (vyklidila ho jiná stavba), se počítá jako skácený, ale
 * není kam sázet.
 */
function fellBeech(state: VillageState, workshop: Workshop, id: number | null, day: number): void {
  if (id === null || !isTreeStanding(state, id, day)) return;
  state.felledTrees = fellTrees(state, [id], day).felledTrees ?? [];
  (workshop.toPlant ??= []).push(id);
}

/** Přirážka za chůzi ze zemnice k pařezu, na který uhlíř sází (bez vrstvy 1). */
function stumpWalkFactor(obstacles: ObstacleLayer | null, id: number, dwelling: Dwelling): number {
  if (!obstacles) return 1;
  const index = obstacleIndex(obstacles, id);
  if (index < 0) return 1;
  return distanceFactor(
    length2(obstacles.x[index]! - dwelling.position.x, obstacles.z[index]! - dwelling.position.z),
  );
}

/**
 * Kolik uhlí kováři dnes spálí, když kovají celý den (kg): práce kováře za den ÷ práce na kg
 * nástrojů × 50 kg uhlí. Volající dává práci kovářů (`workshopLabor` v crafts.ts).
 */
export function smithForgeCharcoalKg(smiths: readonly { labor: number }[]): number {
  return smiths.reduce(
    (sum, s) =>
      sum + (s.labor / CRAFT_PRODUCTION.toolManDaysPerKg) * CRAFT_PRODUCTION.toolCharcoalKgPerKg,
    0,
  );
}

// --- rovnováha uhlíř – kovář (crafts.md – Rovnováha uhlíř – kovář) -------------------------------

/**
 * Zapíše uhlí, které kováři dnes spálili (mutuje stav – `VillageState.charcoalUse`): po obdobích
 * CHARCOAL_BALANCE.bucketDays dní, dokončená období nejvýš za CHARCOAL_BALANCE.windowDays.
 * Volá se každý den (i s 0 kg) jen ve vsi s uhlířem – ves bez uhlíře se nemění.
 */
export function recordCharcoalUse(state: VillageState, day: number, kg: number): void {
  const use: CharcoalUse = (state.charcoalUse ??= { from: day, currentKg: 0, buckets: [] });
  const size = CHARCOAL_BALANCE.bucketDays;
  const keep = Math.floor(CHARCOAL_BALANCE.windowDays / size);
  while (day - use.from >= size) {
    use.buckets.push(use.currentKg);
    use.currentKg = 0;
    use.from += size;
    if (use.buckets.length > keep) use.buckets.splice(0, use.buckets.length - keep);
  }
  use.currentKg += Math.max(0, kg);
}

/**
 * Spotřeba uhlí kovářů (kg za den; crafts.md – Rovnováha uhlíř – kovář): změřená klouzavě za
 * posledních CHARCOAL_BALANCE.windowDays dní (`charcoalUse` – dokončená období a rozběhnuté do
 * včerejška); dokud se nenasbírá první období (CHARCOAL_BALANCE.bucketDays), doplní zbytek odhad
 * `estimatePerDay` (nová ves začne odhadem z opotřebení nástrojů – `smithsCharcoalPerYear`), pak
 * platí jen měření – okno roste do roku.
 */
export function charcoalUsePerDay(
  use: CharcoalUse | undefined,
  day: number,
  estimatePerDay: number,
): number {
  const first = CHARCOAL_BALANCE.bucketDays;
  if (!use) return Math.max(0, estimatePerDay);
  const days = use.buckets.length * CHARCOAL_BALANCE.bucketDays + Math.max(0, day - use.from);
  const kg = use.buckets.reduce((sum, b) => sum + b, 0) + use.currentKg;
  if (days >= first) return kg / days;
  return (kg + Math.max(0, estimatePerDay) * (first - days)) / first;
}

/**
 * Kolik uhlí kovář dnes donese z vypáleného milíře (kg; crafts.md – Rovnováha uhlíř – kovář –
 * kovář si drží zásobu): když uhlí u kováren (`looseKg`) nestačí na dnešní kování (`forgeKg` –
 * kováři, kteří dnes kovou, na plný úvazek), nebo při spotřebě `usePerDay` vystačí jen na cestu
 * pro uhlí (`tripDays`) a rezervu CHARCOAL_BALANCE.reserveDays, donese dávku na
 * CHARCOAL_BALANCE.fetchDays dní spotřeby (aspoň dnešní kování), nejvýš co v milíři zbývá
 * (`inKilnKg`). Jinak 0 – milíř stojí a čeká.
 */
export function charcoalFetchKg(
  inKilnKg: number,
  looseKg: number,
  forgeKg: number,
  usePerDay: number,
  tripDays: number,
): number {
  if (inKilnKg <= EPSILON) return 0;
  const short = forgeKg > EPSILON && looseKg + EPSILON < forgeKg;
  const low =
    usePerDay > EPSILON && looseKg <= usePerDay * (tripDays + CHARCOAL_BALANCE.reserveDays);
  if (!short && !low) return 0;
  return Math.min(inKilnKg, Math.max(forgeKg, usePerDay * CHARCOAL_BALANCE.fetchDays));
}

/**
 * Začne uhlíř další milíř (crafts.md – Rovnováha uhlíř – kovář)? Milíř stojí vždy – uhlíř bez
 * milíře začne nový; s vypáleným milířem začne další, až uhlí ve vsi (`stockKg` – u kováren,
 * ve vypálených milířích a v rozdělaných milířích ostatních uhlířů) stačí při spotřebě `usePerDay`
 * jen na dobu cyklu milíře (`cycleDays`) a rezervu CHARCOAL_BALANCE.reserveDays. Rozdělaný milíř
 * dodělá, nejvýš CHARCOAL_BALANCE.maxKilns milíře najednou.
 */
export function startsNextKiln(
  workshop: Pick<Workshop, 'kilns' | 'kiln'>,
  stockKg: number,
  usePerDay: number,
  cycleDays: number,
): boolean {
  const kilns = workshopKilns(workshop);
  if (kilns.length === 0) return true;
  if (kilnInProgress(workshop) || kilns.length >= CHARCOAL_BALANCE.maxKilns) return false;
  if (usePerDay <= EPSILON) return false;
  return stockKg <= usePerDay * (cycleDays + CHARCOAL_BALANCE.reserveDays);
}
