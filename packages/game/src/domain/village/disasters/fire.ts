// Požár (disasters.md – Požár; Martin 27. 10. 2026): stavba chytí podle hazardu, oheň přeskakuje
// řetězově na sousedy, stavba shoří i se zásobami domu; lidé neumírají, bydlí u příbuzných.

import { dateOfDayIndex } from '../../calendar';
import type { Landscape } from '../../landscape';
import { createRandom, deriveSeed } from '../../landscape/random';
import { OBSTACLE_LOOKS, lookSpecies, type ObstacleLayer } from '../../landscape/obstacles/types';
import { obstaclesNear } from '../../landscape/obstacles/query';
import { workshopFootprints } from '../crafts/crafts';
import { dwellingShape } from '../buildings/dwelling-shape';
import { inDisasterProtection } from './disaster-schedule';
import { fireFighters, planFireFight } from './firefighting';
import { evacuationTarget } from '../people/population';
import { dwellingFootprint } from '../placement/placement-geometry';
import { occupants } from '../people/people';
import { convexDistance, pointInPolygon, type Point } from '../placement/polygon';
import { FIRE } from '../rules/rules-disasters';
import { recordRuins } from '../buildings/ruins';
import { looseGrainKg } from '../fields/grain-pits';
import { obstacleChangesAt, obstacleStatus, type ObstacleStatus } from '../core/obstacles';
import { villageLandSquares } from '../placement/squares';
import type { ChronicleEvent } from '../types/types-chronicle';
import type { Dwelling, VillageState } from '../types';
import { weatherOf } from './weather';
import { addLogs } from '../forest/wood';

const DAYS_PER_YEAR = 365.25;

/** Hustota hořlavých stavebních dnů ve vsi: šance obydlí na rok s násobky dne (disasters.md – Požár). */
export function dwellingFireChance(
  d: Pick<Dwelling, 'type' | 'workshop'>,
  month: number,
  summer: ReturnType<typeof weatherOf>['summer'],
): number {
  let chance = FIRE.perBuildingPerYear;
  if (month >= FIRE.summerMonths.from && month <= FIRE.summerMonths.to) {
    if (summer === 'drought') chance *= FIRE.droughtFactor;
    else if (summer === 'dry') chance *= FIRE.dryFactor;
    else if (summer === 'wet' || summer === 'wetHarvest') chance *= FIRE.wetFactor;
  }
  if (FIRE.winterMonths.includes(month)) chance *= FIRE.winterFactor;
  const craft = d.workshop?.craft;
  if (craft === 'smith' || craft === 'burner' || craft === 'potter') chance *= FIRE.craftFactor;
  else if (d.type === 'zemnice') chance *= FIRE.zemniceFactor;
  return chance;
}

/** Půdorysy stavby (dílna jich má víc). */
function footprints(d: Dwelling): Point[][] {
  const shape = dwellingShape(d);
  return d.workshop
    ? workshopFootprints(d.workshop.craft, d.position, shape)
    : [dwellingFootprint(d.type, d.position, shape)];
}

/** Vzdálenost obrysů dvou staveb (m); 0 = dotýkají se. */
function buildingDistance(a: readonly Point[][], b: readonly Point[][]): number {
  let best = Infinity;
  for (const pa of a) for (const pb of b) best = Math.min(best, convexDistance(pa, pb));
  return best;
}

/** Šance přeskoku na vzdálenost `distanceM` (m) – nejbližší pásmo, jinak 0. */
export function jumpChance(distanceM: number): number {
  for (const jump of FIRE.jumps) if (distanceM <= jump.reachM) return jump.chance;
  return 0;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t =
    len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
  const ex = p[0] - (a[0] + t * dx);
  const ez = p[1] - (a[1] + t * dz);
  return Math.sqrt(ex * ex + ez * ez);
}

/** Co stojí mezi stavbami: listnaté stromy, keře a sady (disasters.md – Požár, zeleň). */
interface Greenery {
  layer: ObstacleLayer | null;
  status: ObstacleStatus | null;
  orchards: Point[][];
}

function greeneryOf(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
): Greenery {
  return {
    layer: obstacles,
    status: obstacles ? obstacleStatus(obstacleChangesAt(state, day)) : null,
    orchards: landscape
      ? villageLandSquares(landscape, state, ['orchard']).map((s) => s.corners)
      : [],
  };
}

/** Je na spojnici středů staveb listnatý strom, keř nebo sad? */
function greeneryBetween(g: Greenery, a: Dwelling, b: Dwelling): boolean {
  const from: Point = [a.position.x, a.position.z];
  const to: Point = [b.position.x, b.position.z];
  const reach = FIRE.greeneryReachM;
  if (g.layer && g.status) {
    const minX = Math.min(from[0], to[0]) - reach;
    const maxX = Math.max(from[0], to[0]) + reach;
    const minZ = Math.min(from[1], to[1]) - reach;
    const maxZ = Math.max(from[1], to[1]) + reach;
    for (const i of obstaclesNear(g.layer, minX, minZ, maxX, maxZ)) {
      const kind = g.status.kindOf(g.layer, i);
      if (kind !== 'tree' && kind !== 'shrub') continue;
      if (kind === 'tree') {
        const species = lookSpecies(OBSTACLE_LOOKS[g.layer.look[i]!]!);
        if (species === 'fir' || species === 'pine') continue;
      }
      if (segmentDistance([g.layer.x[i]!, g.layer.z[i]!], from, to) <= reach) return true;
    }
    for (const o of g.status.addedIn(minX, minZ, maxX, maxZ)) {
      if (o.kind !== 'tree' && o.kind !== 'shrub') continue;
      if (segmentDistance([o.x, o.z], from, to) <= reach) return true;
    }
  }
  if (g.orchards.length > 0) {
    const length = Math.sqrt((to[0] - from[0]) ** 2 + (to[1] - from[1]) ** 2);
    const steps = Math.max(1, Math.ceil(length));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point: Point = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      if (g.orchards.some((corners) => pointInPolygon(point, corners))) return true;
    }
  }
  return false;
}

/**
 * Řetězové šíření ohně (disasters.md – Požár): každá nově hořící stavba zkusí své sousedy jednou
 * (do 6 m 70 %, do 12 m 40 %, zeleň na spojnici šanci půlí, hašení ji sníží o 0,7 × účinnost).
 * Vrátí id všech hořících staveb (začátek první). Los každé dvojice je vlastní
 * (`deriveSeed(seed, 'fire-spread:' + den + ':' + z + ':' + na)`), takže nezávisí na pořadí průchodu.
 */
export function spreadFire(
  dwellings: readonly Dwelling[],
  startId: number,
  seed: number,
  day: number,
  greenery: Greenery,
  efficiency = 0,
): number[] {
  const sorted = [...dwellings].sort((a, b) => a.id - b.id);
  const byId = new Map(sorted.map((d) => [d.id, d] as const));
  const prints = new Map(sorted.map((d) => [d.id, footprints(d)] as const));
  const burning = [startId];
  const burnt = new Set(burning);
  const spreadFactor = 1 - FIRE.firefighting.spreadCut * efficiency;
  for (let head = 0; head < burning.length; head++) {
    const from = byId.get(burning[head]!);
    if (!from) continue;
    for (const to of sorted) {
      if (burnt.has(to.id)) continue;
      const dx = to.position.x - from.position.x;
      const dz = to.position.z - from.position.z;
      if (dx * dx + dz * dz > 60 * 60) continue;
      let chance = jumpChance(buildingDistance(prints.get(from.id)!, prints.get(to.id)!));
      if (chance === 0) continue;
      if (greeneryBetween(greenery, from, to)) chance *= FIRE.greeneryFactor;
      chance *= spreadFactor;
      const roll = createRandom(deriveSeed(seed, `fire-spread:${day}:${from.id}:${to.id}`)).next();
      if (roll < chance) {
        burnt.add(to.id);
        burning.push(to.id);
      }
    }
  }
  return burning;
}

/** Jede dnes vsi požár? Ochrana nové vsi platí, vynucený požár ji přebije. */
function forcedFire(state: VillageState, day: number): number | undefined {
  return state.disasters?.override?.fire?.[day];
}

/**
 * Den požáru (disasters.md – Požár): ze seedu vsi a dne se zkusí vznik (hazard dne = Σ šance
 * obydlí s násobky ÷ délka roku), pak řetězové šíření a dopad. Mutuje stav, vrátí zápis do kroniky.
 * Ves bez počasí kraje (testy, kalibrace) nehoří. Hasí všichni dospělí, kdo jsou dnes ve vsi, řetězem od nejbližší vody
 * (`planFireFight`; plán uloží do `state.disasters.fireFight` pro práci dne a scénu); `efficiency`
 * přebije vypočtenou účinnost (jen testy).
 */
export function fireDay(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
  efficiency?: number,
): ChronicleEvent[] {
  // plán hašení starší než dnešek je pryč – stav nenese starý požár (idempotentně)
  const old = state.disasters?.fireFight;
  if (old && old.day < day) delete state.disasters!.fireFight;
  const forced = forcedFire(state, day);
  if (forced === undefined) {
    if (state.weatherSeed === undefined) return [];
    if (inDisasterProtection(state.foundedDay, day)) return [];
  }
  if (state.dwellings.length === 0) return [];
  let startId: number;
  if (forced !== undefined) {
    if (!state.dwellings.some((d) => d.id === forced)) return [];
    startId = forced;
  } else {
    const date = dateOfDayIndex(day);
    const summer = weatherOf(state, date.year).summer;
    const sorted = [...state.dwellings].sort((a, b) => a.id - b.id);
    const chances = sorted.map((d) => dwellingFireChance(d, date.month, summer));
    const total = chances.reduce((sum, c) => sum + c, 0);
    const daily = total / DAYS_PER_YEAR;
    const u = createRandom(deriveSeed(state.seed, 'fire:' + day)).next();
    if (u >= daily) return [];
    const target = (u / daily) * total;
    let acc = 0;
    startId = sorted[sorted.length - 1]!.id;
    for (let i = 0; i < sorted.length; i++) {
      acc += chances[i]!;
      if (target < acc) {
        startId = sorted[i]!.id;
        break;
      }
    }
  }
  const site = state.dwellings.find((d) => d.id === startId)!;
  const fight = planFireFight(
    landscape,
    startId,
    site.position.x,
    site.position.z,
    fireFighters(state, day).length,
    day,
  );
  (state.disasters ??= {}).fireFight = fight;
  const used = efficiency ?? fight.efficiency;
  // plán nese použitou účinnost (testy ji mohou přebít)
  fight.efficiency = used;
  const burning = spreadFire(
    state.dwellings,
    startId,
    state.seed,
    day,
    greeneryOf(state, day, obstacles, landscape),
    used,
  );
  return [burnDown(state, day, startId, burning, used)];
}

/**
 * Dopad požáru: hořící stavby se zřítí (zbytek jámy, jako po rozpadu) a obyvatelé se nastěhují
 * k příbuzným; zásoby domu (zrno mimo jámy, maso, sýr) a seno ubudou o podíl shořelých staveb
 * (zásoby jsou rozdělené po obydlích, stohy stojí u nich – návrh Clauda) a shořelá dílna odnese
 * svou zásobu uhlí, hřiven a keramiky. Zrno v jamách přečká.
 * Při hašení (`efficiency` > 0) stavba klesne o `1 − 0,5 × účinnost` a zřítí se jen na nule.
 * Poslední stojící obydlí vsi se nezboří úplně (lidé by neměli kam) – zůstane poničené.
 */
function burnDown(
  state: VillageState,
  day: number,
  startId: number,
  burningIds: readonly number[],
  efficiency: number,
): ChronicleEvent {
  const damage = 1 - FIRE.firefighting.damageShare * efficiency;
  const total = state.dwellings.length;
  const burnt = state.dwellings.filter((d) => burningIds.includes(d.id));
  const destroyed: Dwelling[] = [];
  for (const d of burnt) {
    d.condition = Math.max(0, d.condition - damage);
    if (d.condition <= 1e-9) destroyed.push(d);
  }
  const share = (burnt.length / total) * Math.min(1, damage);
  const lostGrain = looseGrainKg(state) * share;
  state.storesKg -= lostGrain;
  const lostMeat = (state.meatKg ?? 0) * share;
  if (state.meatKg !== undefined) state.meatKg -= lostMeat;
  const lostCheese = (state.cheeseKg ?? 0) * share;
  if (state.cheeseKg !== undefined) state.cheeseKg -= lostCheese;
  const lostHay = (state.hay?.kg ?? 0) * share;
  if (state.hay) state.hay.kg -= lostHay;
  const lostCrafts = burnWorkshopStocks(state, burnt, damage);
  collapseDwellings(state, day, destroyed);
  return {
    day,
    kind: 'fire',
    startedDwellingId: startId,
    burnedDwellingIds: [...burningIds],
    collapsedDwellingIds: destroyed.map((d) => d.id),
    lostGrainKg: Math.round(lostGrain),
    lostMeatKg: Math.round(lostMeat),
    lostCheeseKg: Math.round(lostCheese),
    lostHayKg: Math.round(lostHay),
    ...lostCrafts,
  };
}

/**
 * Zřícení staveb po pohromě (požár, povodeň – disasters.md): poslední stojící obydlí vsi se
 * nezboří úplně (lidé by neměli kam) – zůstane poničené (stav 0,1); obyvatelé zřícených se
 * nastěhují k příbuzným (`evacuationTarget`), stavba vázaná na zřícený dům (přestavba, oprava…)
 * padá – klády se vrátí na hromadu; nový dům staví hráč běžnou stavbou (Martin 27. 10. 2026).
 * Na místě zůstane zbytek jámy jako po rozpadu. Mutuje stav i `destroyed` (bez ušetřeného).
 */
export function collapseDwellings(state: VillageState, day: number, destroyed: Dwelling[]): void {
  if (destroyed.length === 0) return;
  if (destroyed.length === state.dwellings.length) {
    const spared = destroyed.reduce((best, d) =>
      occupants(state, d.id).length > occupants(state, best.id).length ? d : best,
    );
    spared.condition = 0.1;
    destroyed.splice(destroyed.indexOf(spared), 1);
    if (destroyed.length === 0) return;
  }
  const gone = new Set(destroyed.map((d) => d.id));
  const homes = state.dwellings.filter((d) => !gone.has(d.id));
  for (const d of destroyed) {
    const members = occupants(state, d.id);
    if (members.length === 0) continue;
    const target = evacuationTarget(state, day, members, d.id, homes);
    if (target) for (const p of members) p.dwellingId = target.id;
  }
  state.constructions = state.constructions.filter((c) => {
    const lost = c.dwellingId !== null && gone.has(c.dwellingId);
    if (lost && c.wood) addLogs(state, c.wood.fromPile, c.position);
    return !lost;
  });
  recordRuins(state, destroyed, day, true);
  state.dwellings = homes;
}

/**
 * Zásoby dílen jsou celoveské (`state.crafts`) – shořelá dílna odnese svůj podíl: kovárna uhlí,
 * hřivny a houbu, hrnčířství keramiku (podíl = 1 ÷ počet dílen téhož řemesla, krát poškození;
 * návrh Clauda). Milíř stojí venku, uhlíř tedy o zásobu nepřijde. Vrátí ztráty v kg do kroniky.
 */
function burnWorkshopStocks(
  state: VillageState,
  burnt: readonly Dwelling[],
  damage: number,
): Pick<
  Extract<ChronicleEvent, { kind: 'fire' }>,
  'lostCharcoalKg' | 'lostIronKg' | 'lostPotteryKg'
> {
  const stocks = state.crafts;
  const none = { lostCharcoalKg: 0, lostIronKg: 0, lostPotteryKg: 0 };
  if (!stocks) return none;
  const hit = Math.min(1, damage);
  const shopShare = (craft: 'smith' | 'potter'): number => {
    const all = state.dwellings.filter((d) => d.workshop?.craft === craft).length;
    const burning = burnt.filter((d) => d.workshop?.craft === craft).length;
    return all === 0 ? 0 : (burning / all) * hit;
  };
  const smith = shopShare('smith');
  const potter = shopShare('potter');
  const charcoal = stocks.charcoalKg * smith;
  const bars = (stocks.ironBarsKg ?? 0) * smith;
  const bloom = (stocks.bloomKg ?? 0) * smith;
  const pottery = stocks.potteryKg * potter;
  stocks.charcoalKg -= charcoal;
  if (stocks.ironBarsKg !== undefined) stocks.ironBarsKg -= bars;
  if (stocks.bloomKg !== undefined) stocks.bloomKg -= bloom;
  stocks.potteryKg -= pottery;
  return {
    lostCharcoalKg: Math.round(charcoal),
    lostIronKg: Math.round(bars + bloom),
    lostPotteryKg: Math.round(pottery),
  };
}
