// Stavba kostela (churches.md – Stavba; stone-masonry.md – Vápno a malta, Zkušenost a noví mistři):
// staveniště, rozdělení práce dne mezi lámání, písek, pec, pálení vápna, základy, zdi, střechu
// a výzdobu, dokončení a zkušenost pomocníků mistrů. Kostel se neplatí předem – materiál vzniká
// prací vsi; zablokovat smí jen chybějící huť (stavbyvedoucí) nebo lom.

import { dateOfDayIndex } from '../../calendar';
import { type Landscape, type ObstacleLayer } from '../../landscape';
import { validateActionDay } from '../core/actions';
import { cloneState } from '../core/clone';
import { obstacleChangesAt, recordClearedObstacles } from '../core/obstacles';
import { nearestWater } from '../disasters/firefighting';
import {
  nearestQuarry,
  quarryManDaysPerM3,
  stoneCartLabor,
  stoneCartProgress,
  stoneDayOf,
  villageQuarries,
  type StoneCart,
  type StoneDay,
} from '../fortification/state/quarry';
import { addStone, stoneOnHand, takeStone } from '../fortification/state/stone';
import {
  claimedObstacles,
  planWoodFrom,
  takeWood,
  woodFellingCost,
  woodLogs,
} from '../forest/wood';
import { type Walk } from '../paths/walking';
import { ROTATION_STEP } from '../placement/square-grid';
import { ageYears, isAdult } from '../people/people';
import { CHURCH, CHURCH_WORK_CRAFT, LIME, LODGE, MASON_CRAFTS } from '../rules';
import type {
  Church,
  ChurchDims,
  ChurchSite,
  ChurchType,
  ChurchWork,
  Construction,
  MasonCraft,
  Person,
  Position,
  VillageState,
} from '../types';
import {
  churchCost,
  churchLocalToWorld,
  churchTypesFor,
  churchyardRect,
  clampChurchDims,
} from './church-geometry';
import { giveWayToBuilding, type TakenLand } from './land-taken';

const EPS = 1e-9;

/**
 * Natočení kostela kněžištěm na východ (Martin 11. 11. 2026 – churches.md, Stavba): osa vstup →
 * kněžiště je místní +x (`churchFootprintWorld`) a východ je ve světě +x (`DIRECTION_VECTORS`),
 * takže výchozí natočení náhledu je 0. Hráč smí kostel natočit po `ROTATION_STEP` (15°).
 */
export const CHURCH_EAST_ROTATION = 0;

/** Natočení kostela zaokrouhlené na krok `ROTATION_STEP` (15°) v rozsahu (−π, π]. */
export function snapChurchRotation(rotation: number): number {
  const steps = Math.round(rotation / ROTATION_STEP);
  const full = Math.round((2 * Math.PI) / ROTATION_STEP);
  let k = ((steps % full) + full) % full;
  if (k > full / 2) k -= full;
  return k * ROTATION_STEP;
}

export const CHURCH_NO_LODGE = 'Bez stavbyvedoucího huti se kostel stavět nedá.';
export const CHURCH_NO_QUARRY = 'Ves nemá lom – kámen a vápenec není odkud lámat.';
export const CHURCH_WRONG_TYPE = 'Takový kostel huť tohoto okruhu nestaví.';

/** Obory mistrů, kteří jsou ve vsi (mistr na cestě mimo ves se nepočítá). */
export function mastersPresent(state: Pick<VillageState, 'people'>): ReadonlySet<MasonCraft> {
  const out = new Set<MasonCraft>();
  for (const p of state.people) if (p.mason !== undefined && !p.away) out.add(p.mason);
  return out;
}

/**
 * Proč kostel typu `type` nejde začít: ves bez stavbyvedoucího huti (`CHURCH_NO_LODGE`), typ mimo
 * okruh huti (`CHURCH_WRONG_TYPE`), ves bez dostavěného lomu (`CHURCH_NO_QUARRY`); jinak null.
 */
export function churchStartProblem(
  state: Pick<VillageState, 'people' | 'lodge' | 'quarries'>,
  type: ChurchType,
): string | null {
  if (!state.lodge || !mastersPresent(state).has('builder')) return CHURCH_NO_LODGE;
  if (!churchTypesFor(state.lodge.circle).includes(type)) return CHURCH_WRONG_TYPE;
  if (villageQuarries(state).length === 0) return CHURCH_NO_QUARRY;
  return null;
}

// --- součty stavby --------------------------------------------------------------------------

/** Součty staveniště z ceny kostela a vzdálenosti lomu (čd, m³, t). */
interface ChurchTotals {
  readonly work: Readonly<Record<ChurchWork, number>>;
  readonly masonryM3: number;
  readonly foundationM3: number;
  readonly wallsM3: number;
  readonly stoneM3: number;
  readonly limeT: number;
  readonly limestoneT: number;
}

/** Kolik kamene a vápence (m³) se pro kostel láme – kámen bez toho z hromad, vápenec celý. */
function quarriedM3Of(site: Pick<ChurchSite, 'type' | 'dims' | 'stoneFromPileM3'>): number {
  const cost = churchCost(site.type, site.dims);
  return Math.max(0, cost.stoneM3 - site.stoneFromPileM3) + cost.limestoneT / LIME.limestoneTPerM3;
}

function churchTotals(site: ChurchSite): ChurchTotals {
  const cost = churchCost(site.type, site.dims);
  const w = CHURCH.work;
  const wallsM3 = cost.work.walls / (w.wallsManDaysPerM3 + w.dressingManDaysPerM3);
  const quarriedM3 = quarriedM3Of(site);
  return {
    // lámání a nošení podle vzdálenosti lomu (cena kostela ji nezná)
    work: { ...cost.work, quarry: quarriedM3 * quarryManDaysPerM3(site.quarryDistanceM) },
    masonryM3: cost.masonryM3,
    foundationM3: cost.masonryM3 - wallsM3,
    wallsM3,
    stoneM3: cost.stoneM3,
    limeT: cost.limeT,
    limestoneT: cost.limestoneT,
  };
}

const share = (done: number | undefined, total: number): number =>
  total > EPS ? Math.min(1, (done ?? 0) / total) : 1;

/** Dodaný materiál stavby (kámen, vápenec, písek – z hotové práce; vápno vypálené celkem). */
export interface ChurchMaterials {
  stoneM3: number;
  limestoneT: number;
  sandM3: number;
  limeT: number;
  /** Zazděno (m³ zdiva i se základy). */
  builtM3: number;
}

function materialsOf(
  site: ChurchSite,
  totals: ChurchTotals,
  done: ChurchSite['done'],
): ChurchMaterials {
  const q = share(done.quarry, totals.work.quarry);
  const pile = Math.min(site.stoneFromPileM3, totals.stoneM3);
  const sand = churchCost(site.type, site.dims).sandM3;
  return {
    stoneM3: pile + q * (totals.stoneM3 - pile),
    limestoneT: q * totals.limestoneT,
    sandM3: share(done.sand, totals.work.sand) * sand,
    limeT: site.limeT,
    builtM3:
      share(done.foundation, totals.work.foundation) * totals.foundationM3 +
      share(done.walls, totals.work.walls) * totals.wallsM3,
  };
}

/** Dodaný a zazděný materiál staveniště (pro panel kostela). */
export function churchMaterials(site: ChurchSite): ChurchMaterials {
  return materialsOf(site, churchTotals(site), site.done);
}

/**
 * Postup kostela 0–1 po druzích práce (`ChurchWork` – panel staveniště); lámání podle vzdálenosti
 * lomu, pálení vápna i se stavbou pece.
 */
export function churchWorkProgress(site: ChurchSite): Record<ChurchWork, number> {
  const { work } = churchTotals(site);
  const out = {} as Record<ChurchWork, number>;
  for (const kind of Object.keys(work) as ChurchWork[])
    out[kind] = share(site.done[kind], work[kind]);
  return out;
}

/** Postup kostela 0–1 po částech – základy, zdi, střecha, výzdoba (scéna a panel). */
export function churchProgress(site: ChurchSite): {
  foundation: number;
  walls: number;
  roof: number;
  decor: number;
} {
  const { work } = churchTotals(site);
  return {
    foundation: share(site.done.foundation, work.foundation),
    walls: share(site.done.walls, work.walls),
    roof: share(site.done.roof, work.roof),
    decor: share(site.done.decor, work.decor),
  };
}

/** Celková práce kostela (čd) bez přípravy staveniště – výzdoba i bez štukatéra. */
function stagesTotal(site: ChurchSite): number {
  const { work } = churchTotals(site);
  return Object.values(work).reduce((sum, w) => sum + w, 0);
}

/** Je zdění v sezóně (`CHURCH.season`, duben–říjen)? */
export function churchSeason(day: number): boolean {
  const { month } = dateOfDayIndex(day);
  return month >= CHURCH.season.fromMonth && month <= CHURCH.season.toMonth;
}

// --- práce dne ------------------------------------------------------------------------------

/**
 * Výsledek rozdělení práce dne – kolik práce se spotřebovalo a kam (čd postupu po druzích); s vozem
 * s kamenem postoupí lámání o `bonus` víc, než na něj šlo práce, a `stone` je lámání dne (bez
 * lámání chybí).
 */
export interface ChurchWorkResult {
  used: number;
  byWork: Partial<Record<ChurchWork, number>>;
  bonus?: number;
  stone?: StoneDay;
}

/** Kolik lámání kostelu zbývá (čd postupu – lámání a nošení kamene a vápence). */
export function churchQuarryLeft(site: ChurchSite): number {
  return Math.max(0, churchTotals(site).work.quarry - (site.done.quarry ?? 0));
}

/**
 * Rozdělí `budget` čd dne v pořadí priorit (churches.md – Stavba; návrh Clauda): lámání kamene
 * a vápence do zásoby (kameník), písek (stavbyvedoucí), pec a nakládání další dávky vápna
 * (vápeník; nakládá se jen v sezóně a z vylámaného vápence), základy a zdi (zedník, sezóna, podíl
 * zdiva nejvýš nejmenší podíl dodaného kamene, vápna a písku), střecha po zdech (stavbyvedoucí),
 * výzdoba po střeše (štukatér). Bez stavbyvedoucího nic. `mutate` = zapíše do `site`, jinak jen
 * spočítá (potřeba dne). S vozem s kamenem (`cart` – fortifications.md, Kámen, Nošení kamene
 * a vůz) stojí lámání méně práce (`stoneCartLabor`).
 */
function allocate(
  site: ChurchSite,
  masters: ReadonlySet<MasonCraft>,
  day: number,
  budget: number,
  mutate: boolean,
  cart?: StoneCart,
): ChurchWorkResult {
  const byWork: Partial<Record<ChurchWork, number>> = {};
  if (!masters.has('builder') || !(budget > 0)) return { used: 0, byWork };
  const totals = churchTotals(site);
  const { work } = totals;
  const done = { ...site.done };
  let kilnDone = site.kilnDone;
  let left = budget;
  let used = 0;
  const take = (kind: ChurchWork, cap: number): number => {
    const x = Math.min(left, Math.max(0, cap));
    if (x <= 0) return 0;
    done[kind] = (done[kind] ?? 0) + x;
    byWork[kind] = (byWork[kind] ?? 0) + x;
    left -= x;
    used += x;
    return x;
  };
  const remaining = (kind: ChurchWork): number => work[kind] - (done[kind] ?? 0);
  const season = churchSeason(day);
  // 1. kámen a vápenec, 2. písek – do zásoby napřed, strop = potřeba celé stavby; vůz s kamenem
  // uveze část dnes nalámaného a to se nenosí – lámání postoupí víc, než na ně šlo práce
  let bonus = 0;
  let stone: StoneDay | undefined;
  if (masters.has(CHURCH_WORK_CRAFT.quarry)) {
    const rest = remaining('quarry');
    if (cart && rest > EPS && left > 0) {
      const labor = Math.min(left, stoneCartLabor(rest, 1, cart));
      const carted = stoneCartProgress(labor, 1, cart);
      const progress = Math.min(rest, carted.progress);
      done.quarry = (done.quarry ?? 0) + progress;
      byWork.quarry = (byWork.quarry ?? 0) + progress;
      left -= labor;
      used += labor;
      bonus = Math.max(0, progress - labor);
      stone = stoneDayOf(site.quarryId, progress, 1, carted.m3, cart);
    } else {
      const progress = take('quarry', rest);
      if (progress > 0) stone = stoneDayOf(site.quarryId, progress, 1, 0, undefined);
    }
  }
  if (masters.has(CHURCH_WORK_CRAFT.sand)) take('sand', remaining('sand'));
  // 3. pec, 4. nakládání další dávky vápna (vápenec musí být vylámaný)
  let burn: { t: number; until: number } | null = null;
  if (masters.has(CHURCH_WORK_CRAFT.lime)) {
    const kiln = Math.min(left, Math.max(0, LIME.kilnBuildManDays - kilnDone));
    if (kiln > 0) {
      kilnDone += kiln;
      done.lime = (done.lime ?? 0) + kiln;
      byWork.lime = (byWork.lime ?? 0) + kiln;
      left -= kiln;
      used += kiln;
    }
    if (season && kilnDone >= LIME.kilnBuildManDays - EPS) {
      const loadedT = site.limeT + (site.burnT ?? 0);
      const batch = Math.min(LIME.kilnBatchLimeT, totals.limeT - loadedT);
      if (batch > EPS) {
        const rate = LIME.manDaysPerLimeT;
        const loading = (): number => (done.lime ?? 0) - kilnDone - loadedT * rate;
        const limestone = materialsOf(site, totals, done).limestoneT / LIME.limestonePerLimeT;
        take('lime', Math.min(batch, limestone - loadedT) * rate - loading());
        if (site.burnT === undefined && loading() >= batch * rate - EPS) {
          burn = { t: batch, until: day + LIME.kilnBurnDays };
        }
      }
    }
  }
  // 5. základy a zdi – jen v sezóně, zdivo nejvýš podle dodaného materiálu
  if (season && masters.has(CHURCH_WORK_CRAFT.walls)) {
    const m = materialsOf(site, totals, done);
    const cost = churchCost(site.type, site.dims);
    const cap = Math.min(
      share(m.stoneM3, totals.stoneM3),
      share(m.limeT, totals.limeT),
      share(m.sandM3, cost.sandM3),
    );
    let allowM3 = cap * totals.masonryM3 - m.builtM3;
    const fRate = totals.foundationM3 > EPS ? work.foundation / totals.foundationM3 : 0;
    allowM3 -=
      fRate > 0
        ? take('foundation', Math.min(remaining('foundation'), allowM3 * fRate)) / fRate
        : 0;
    if (remaining('foundation') <= EPS) {
      const wRate = totals.wallsM3 > EPS ? work.walls / totals.wallsM3 : 0;
      take('walls', Math.min(remaining('walls'), allowM3 * wRate));
    }
  }
  // 6. střecha po zdech, 7. výzdoba po střeše
  const walled = remaining('foundation') <= EPS && remaining('walls') <= EPS;
  if (walled && masters.has(CHURCH_WORK_CRAFT.roof)) take('roof', remaining('roof'));
  if (walled && remaining('roof') <= EPS && masters.has(CHURCH_WORK_CRAFT.decor)) {
    take('decor', remaining('decor'));
  }
  if (mutate) {
    site.done = done;
    site.kilnDone = kilnDone;
    if (burn) {
      site.burnT = burn.t;
      site.burnUntilDay = burn.until;
    }
  }
  return { used, byWork, ...(bonus > 0 ? { bonus } : {}), ...(stone ? { stone } : {}) };
}

/**
 * Ráno staveniště kostelů (mutuje): vypálená dávka přibude k vápnu a dávka, která čeká naložená,
 * jde v sezóně do volné pece. Pálení běží dál i mimo sezónu a i v den bez práce na kostele –
 * výsledek nezávisí na tom, kolik práce stavba ten den dostala.
 */
export function churchMorning(state: VillageState, day: number): void {
  const masters = mastersPresent(state);
  for (const c of state.constructions) {
    const site = c.church;
    if (!site) continue;
    if (site.burnUntilDay !== undefined && day >= site.burnUntilDay) {
      site.limeT += site.burnT ?? 0;
      delete site.burnT;
      delete site.burnUntilDay;
    }
    if (site.burnT !== undefined || !churchSeason(day)) continue;
    if (!masters.has(CHURCH_WORK_CRAFT.lime)) continue;
    const batch = Math.min(LIME.kilnBatchLimeT, churchTotals(site).limeT - site.limeT);
    const loading = (site.done.lime ?? 0) - site.kilnDone - site.limeT * LIME.manDaysPerLimeT;
    if (batch > EPS && loading >= batch * LIME.manDaysPerLimeT - EPS) {
      site.burnT = batch;
      site.burnUntilDay = day + LIME.kilnBurnDays;
    }
  }
}

/**
 * Kolik práce kostel dnes vezme: zbytek přípravy staveniště a co stihnou mistři, kteří jsou ve vsi
 * (s vozem s kamenem `cart` lámání levněji).
 */
export function churchNeedToday(
  state: VillageState,
  c: Construction,
  day: number,
  cart?: StoneCart,
): number {
  const site = c.church;
  if (!site) return 0;
  const masters = mastersPresent(state);
  if (!masters.has('builder')) return 0;
  const prep = Math.max(0, site.prepManDays - c.done);
  return prep + allocate(site, masters, day, Infinity, false, cart).used;
}

/**
 * Vloží `manDays` čd do kostela (mutuje): napřed příprava staveniště (kácení dřeva – `fellAsWorked`
 * volá `invest`, a překážky), pak práce mistrů (`allocate`, s vozem s kamenem `cart`). Vrátí, kolik
 * šlo do kterého druhu; `c.done` roste o postup (s vozem víc než o práci).
 */
export function churchWorkDay(
  state: VillageState,
  c: Construction,
  manDays: number,
  day: number,
  cart?: StoneCart,
): ChurchWorkResult {
  const site = c.church;
  if (!site) return { used: 0, byWork: {} };
  const masters = mastersPresent(state);
  if (!masters.has('builder')) return { used: 0, byWork: {} };
  const prep = Math.min(manDays, Math.max(0, site.prepManDays - c.done));
  c.done += prep;
  if (c.done < site.prepManDays - EPS) return { used: prep, byWork: {} };
  const r = allocate(site, masters, day, manDays - prep, true, cart);
  c.done = Math.min(c.cost, c.done + r.used + (r.bonus ?? 0));
  return { ...r, used: prep + r.used };
}

/**
 * Proč kostel stojí (panel a scéna): chybí stavbyvedoucí (stojí vše), nebo první obor v pořadí
 * práce, jehož práce ještě zbývá a mistr chybí; jinak null. Zima a čekání na pálení nejsou důvod.
 */
export function churchBlocked(state: VillageState, site: ChurchSite): MasonCraft | null {
  const masters = mastersPresent(state);
  if (!masters.has('builder')) return 'builder';
  const { work } = churchTotals(site);
  const order: readonly ChurchWork[] = [
    'quarry',
    'sand',
    'lime',
    'foundation',
    'walls',
    'roof',
    'decor',
  ];
  for (const kind of order) {
    if (work[kind] - (site.done[kind] ?? 0) <= EPS) continue;
    const craft = CHURCH_WORK_CRAFT[kind];
    if (!masters.has(craft)) return craft;
  }
  return null;
}

// --- dokončení ------------------------------------------------------------------------------

function roofDone(site: ChurchSite): boolean {
  return churchProgress(site).roof >= 1 - EPS;
}

/**
 * Po střeše (mutuje): kostel přibude do `VillageState.churches` (id = id stavby) s dnem dostavění;
 * vrátí true, když dnes vznikl.
 */
export function finishChurchRoof(state: VillageState, c: Construction, day: number): boolean {
  const site = c.church;
  if (!site || c.position === null || !roofDone(site)) return false;
  if ((state.churches ?? []).some((k) => k.id === c.id)) return false;
  const church: Church = {
    id: c.id,
    type: site.type,
    dims: site.dims,
    position: { ...c.position },
    finishedDay: day,
  };
  state.churches = [...(state.churches ?? []), church];
  return true;
}

/** Skončí staveniště? Po výzdobě, nebo hned po střeše, když ve vsi není štukatér. */
export function isChurchFinished(state: VillageState, c: Construction): boolean {
  const site = c.church;
  if (!site) return true;
  if (!roofDone(site)) return false;
  return churchProgress(site).decor >= 1 - EPS || !mastersPresent(state).has('plasterer');
}

/** Konec staveniště (mutuje): vyzdobený kostel dostane `decoratedDay`. */
export function finishChurch(state: VillageState, c: Construction, day: number): void {
  const site = c.church;
  if (!site || churchProgress(site).decor < 1 - EPS) return;
  state.churches = (state.churches ?? []).map((k) =>
    k.id === c.id && k.decoratedDay === undefined ? { ...k, decoratedDay: day } : k,
  );
}

/**
 * Zrušené staveniště (mutuje klon): dodaný a nezazděný kámen (z hromad i vylámaný) se složí na
 * hromadu u kostela (návrh Clauda); vápno a písek propadnou.
 */
export function returnChurchStone(state: VillageState, c: Construction): void {
  if (!c.church) return;
  const m = churchMaterials(c.church);
  addStone(state, Math.max(0, m.stoneM3 - m.builtM3), c.position);
}

// --- zahájení -------------------------------------------------------------------------------

/** Výsledek kontroly místa, který `startChurch` převezme (`checkChurchPlacement`). */
export interface ChurchSiteOptions {
  obstacleCost?: number;
  obstacleIds?: readonly number[];
  clearedTrees?: number;
  takenLand?: readonly TakenLand[];
  walk?: Walk;
}

export interface ChurchInput {
  type: ChurchType;
  dims: ChurchDims;
  /** Střed hlavní lodi a natočení osy vstup → kněžiště (zaokrouhlí se na 15°). */
  position: Position;
}

/**
 * Zahájí stavbu kostela (vstupní stav nemění): bez platby předem; dřevo na krov a pálení vápna
 * (`woodKg` ÷ `CHURCH.woodKgPerLog` klád) z hromady, zbytek se vyhradí ke kácení jako u ostatních
 * staveb (když stromy nestačí, kácí se, co je – dřevo stavbu nezablokuje); kámen z hromad vsi (`takeStone`), zbytek a vápenec z nejbližšího lomu; pec v západním
 * rohu pásu hřbitůvku, písník u nejbližší vody (bez krajiny vedle staveniště). Díly polí pod
 * hřbitůvkem se zmenší. Místo musí projít `checkChurchPlacement` (volající).
 */
export function startChurch(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
  obstacles: ObstacleLayer | null,
  input: ChurchInput,
  site: ChurchSiteOptions = {},
): { ok: true; state: VillageState } | { ok: false; reason: string } {
  validateActionDay(state, day);
  const problem = churchStartProblem(state, input.type);
  if (problem) return { ok: false, reason: problem };
  const p = input.position;
  if (![p.x, p.z, p.rotation].every(Number.isFinite))
    return { ok: false, reason: 'Neplatná poloha – kostel.' };
  const dims = clampChurchDims(input.type, input.dims);
  const position = { x: p.x, z: p.z, rotation: snapChurchRotation(p.rotation) };
  const cost = churchCost(input.type, dims);
  const quarry = nearestQuarry(state, position);
  if (!quarry) return { ok: false, reason: CHURCH_NO_QUARRY };
  const obstacleIds = site.obstacleIds ?? [];
  const plan = planWoodFrom(
    Math.ceil(cost.woodKg / CHURCH.woodKgPerLog - EPS),
    position,
    {
      logs: woodLogs(state),
      changes: () => obstacleChangesAt(state, day),
      claimed: () => claimedObstacles(state),
    },
    {
      obstacles,
      clearedTrees: site.clearedTrees ?? 0,
      clearedIds: obstacleIds,
      ...(site.walk ? { walk: site.walk } : {}),
    },
  );
  // chybějící stromy stavbu nezastaví – kácí se, co je (jako přestavba obydlí; návrh Clauda)
  const next = cloneState(state);
  recordClearedObstacles(next, [...obstacleIds], day);
  const wood = takeWood(next, plan, position);
  const fromPile = Math.min(stoneOnHand(next), cost.stoneM3);
  if (fromPile > 0) takeStone(next, fromPile, position);
  const rect = churchyardRect(input.type, dims);
  const belt = CHURCH.churchyardBeltM;
  const kiln = churchLocalToWorld(
    position,
    rect.offsetX - rect.length / 2 + belt / 2,
    rect.width / 2 - belt / 2,
  );
  const water = landscape ? nearestWater(landscape, position.x, position.z) : null;
  const sandPit = water
    ? { x: water.x, z: water.z }
    : churchLocalToWorld(position, rect.offsetX - rect.length / 2 - belt, 0);
  const church: ChurchSite = {
    type: input.type,
    dims,
    done: {},
    limeT: 0,
    kilnDone: 0,
    kiln,
    sandPit,
    quarryId: quarry.quarry.outcropId,
    quarryDistanceM: quarry.distanceM,
    stoneFromPileM3: fromPile,
    prepManDays: woodFellingCost(wood) + (site.obstacleCost ?? 0),
  };
  next.constructions.push({
    id: next.nextId++,
    kind: 'church',
    startedDay: day,
    cost: church.prepManDays + stagesTotal(church),
    done: 0,
    dwellingType: null,
    position,
    dwellingId: null,
    fieldId: null,
    ...(wood.trees > 0 ? { wood } : {}),
    church,
  });
  giveWayToBuilding(next, day, site.takenLand ?? [], 'church');
  return { ok: true, state: next };
}

/** Staveniště kostela ze starší vsi – lámání za příplatek za vzdálenost (do 12. 11. 2026). */
type LegacyChurchSite = Omit<ChurchSite, 'quarryDistanceM'> & {
  quarryDistanceM?: number;
  quarryManDaysPerM3?: number;
};

/**
 * Starší staveniště kostela (`quarryManDaysPerM3` – lámání × příplatek za vzdálenost) dostane
 * vzdušnou vzdálenost lomu (`quarryDistanceM`; fortifications.md – Kámen, Nošení kamene a vůz):
 * lámání se přecení na lámání a nošení v nůších, dodaný kámen (hotový podíl lámání) zůstane –
 * hotová práce lámání i cena stavby se posunou o rozdíl. Lom podle `quarryId`, jinak nejbližší,
 * bez lomu 0 m. Jednou a idempotentně – ves bez starého staveniště týž objekt.
 */
export function withChurchQuarryDistance(state: VillageState): VillageState {
  const legacy = (c: Construction): boolean =>
    c.church !== undefined && !('quarryDistanceM' in c.church);
  if (!state.constructions.some(legacy)) return state;
  const next = cloneState(state);
  for (const c of next.constructions) {
    if (!legacy(c)) continue;
    const old = c.church as LegacyChurchSite;
    const { quarryManDaysPerM3: perM3 = 1, ...rest } = old;
    const at = c.position;
    const quarry = villageQuarries(next).find((q) => q.outcropId === old.quarryId);
    const distanceM = at
      ? quarry
        ? Math.sqrt((quarry.x - at.x) * (quarry.x - at.x) + (quarry.z - at.z) * (quarry.z - at.z))
        : (nearestQuarry(next, at)?.distanceM ?? 0)
      : 0;
    const site: ChurchSite = { ...rest, quarryDistanceM: distanceM, done: { ...old.done } };
    const m3 = quarriedM3Of(site);
    const before = m3 * perM3;
    const after = m3 * quarryManDaysPerM3(distanceM);
    const doneBefore = site.done.quarry ?? 0;
    if (before > EPS && doneBefore > 0) site.done.quarry = (doneBefore * after) / before;
    c.cost += after - before;
    c.done = Math.max(0, c.done + (site.done.quarry ?? 0) - doneBefore);
    c.church = site;
  }
  return next;
}

// --- zkušenost ------------------------------------------------------------------------------

/**
 * Zkušenost v oborech huti za dnešní práci na kostelech (stone-masonry.md – Zkušenost a noví mistři;
 * mutuje): čd oboru `byCraft` dostanou dospělí z `workers` (dnes pracovali se vsí; ne mistři, kněz
 * ani elita) po 1 čd od nejzkušenějších v oboru (při shodě menší id) – každý nejvýš 1 čd za den.
 * Synové mistra od `LODGE.apprenticeFromAge` v domácnosti mistra dostanou 1 čd v oboru otce za den,
 * kdy jeho obor na kostele pracoval (navíc k práci vsi, jako pomocníci se ten den nepočítají).
 */
export function gainMasonryXp(
  state: VillageState,
  byCraft: Partial<Record<MasonCraft, number>>,
  day: number,
  workers: readonly Person[],
): void {
  const used = new Set<number>();
  const gain = (p: Person, craft: MasonCraft, amount: number): void => {
    p.masonryXp = { ...p.masonryXp, [craft]: (p.masonryXp?.[craft] ?? 0) + amount };
  };
  // učni – synové mistrů v domácnosti otce
  for (const master of state.people) {
    const craft = master.mason;
    if (craft === undefined || !((byCraft[craft] ?? 0) > EPS)) continue;
    for (const son of state.people) {
      if (son.fatherId !== master.id || son.sex !== 'male' || son.mason !== undefined) continue;
      if (son.dwellingId !== master.dwellingId || used.has(son.id)) continue;
      if (ageYears(son.bornDay, day) < LODGE.apprenticeFromAge) continue;
      gain(son, craft, 1);
      used.add(son.id);
    }
  }
  const ids = new Set(workers.map((w) => w.id));
  const pool = state.people.filter(
    (p) =>
      ids.has(p.id) &&
      !used.has(p.id) &&
      p.mason === undefined &&
      !p.priest &&
      !p.elite &&
      isAdult(p, day),
  );
  for (const craft of MASON_CRAFTS) {
    let left = byCraft[craft] ?? 0;
    if (left <= EPS) continue;
    const order = pool
      .filter((p) => !used.has(p.id))
      .sort((a, b) => (b.masonryXp?.[craft] ?? 0) - (a.masonryXp?.[craft] ?? 0) || a.id - b.id);
    for (const p of order) {
      if (left <= EPS) break;
      const amount = Math.min(1, left);
      gain(p, craft, amount);
      used.add(p.id);
      left -= amount;
    }
  }
}

/** Čd práce kostelů dne po oborech z rozdílu hotové práce (`before` = `done` ráno podle id stavby). */
export function churchCraftWork(
  state: VillageState,
  before: ReadonlyMap<number, ChurchSite['done']>,
): Partial<Record<MasonCraft, number>> {
  const out: Partial<Record<MasonCraft, number>> = {};
  for (const c of state.constructions) {
    if (!c.church) continue;
    const was = before.get(c.id) ?? {};
    for (const [kind, now] of Object.entries(c.church.done) as [ChurchWork, number][]) {
      const delta = now - (was[kind] ?? 0);
      if (delta <= EPS) continue;
      const craft = CHURCH_WORK_CRAFT[kind];
      out[craft] = (out[craft] ?? 0) + delta;
    }
  }
  return out;
}
