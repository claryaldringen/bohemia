// Požár (disasters.md – Požár; Martin 27. 10. 2026): stavba chytí podle hazardu, oheň přeskakuje
// řetězově na sousedy, stavba shoří i se zásobami domu; lidé neumírají, bydlí u příbuzných.

import { dateOfDayIndex } from '../calendar';
import type { Landscape } from '../landscape';
import { createRandom, deriveSeed, type Random } from '../landscape/random';
import { OBSTACLE_LOOKS, lookSpecies, type ObstacleLayer } from '../landscape/obstacles/types';
import { obstaclesNear } from '../landscape/obstacles/query';
import { workshopFootprints } from './crafts';
import { dwellingShape } from './dwelling-shape';
import { inDisasterProtection } from './disasters';
import { evacuationTarget } from './population';
import { dwellingFootprint } from './placement-geometry';
import { occupants } from './people';
import { convexDistance, pointInPolygon, type Point } from './polygon';
import { FIRE } from './rules-disasters';
import { recordRuins } from './ruins';
import { looseGrainKg } from './grain-pits';
import { obstacleChangesAt, obstacleStatus, type ObstacleStatus } from './obstacles';
import { villageLandSquares } from './squares';
import type { ChronicleEvent } from './types-chronicle';
import type { Dwelling, VillageState } from './types';
import { weatherOf } from './weather';
import { addLogs } from './wood';

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
 * Vrátí id všech hořících staveb (začátek první). Losování ze `random` v pevném pořadí podle id.
 */
export function spreadFire(
  dwellings: readonly Dwelling[],
  startId: number,
  random: Random,
  greenery: Greenery,
  efficiency = 0,
): number[] {
  const sorted = [...dwellings].sort((a, b) => a.id - b.id);
  const prints = new Map(sorted.map((d) => [d.id, footprints(d)] as const));
  const burning = [startId];
  const burnt = new Set(burning);
  const spreadFactor = 1 - FIRE.firefighting.spreadCut * efficiency;
  for (let head = 0; head < burning.length; head++) {
    const from = sorted.find((d) => d.id === burning[head]);
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
      if (random.next() < chance) {
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
 * Ves bez počasí kraje (testy, kalibrace) nehoří. `efficiency` = účinnost hašení 0–1 (P8; zatím 0).
 */
export function fireDay(
  state: VillageState,
  day: number,
  obstacles: ObstacleLayer | null,
  landscape: Landscape | null,
  efficiency = 0,
): ChronicleEvent[] {
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
  const random = createRandom(deriveSeed(state.seed, 'fire-spread:' + day));
  const burning = spreadFire(
    state.dwellings,
    startId,
    random,
    greeneryOf(state, day, obstacles, landscape),
    efficiency,
  );
  return [burnDown(state, day, startId, burning, efficiency)];
}

/**
 * Dopad požáru: hořící stavby se zřítí (zbytek jámy, jako po rozpadu) a obyvatelé se nastěhují
 * k příbuzným; zásoby domu (zrno mimo jámy, maso, sýr) a seno ubudou o podíl shořelých staveb
 * (zásoby jsou rozdělené po obydlích, stohy stojí u nich – návrh Clauda). Zrno v jamách přečká.
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
  if (destroyed.length === total && destroyed.length > 0) {
    const spared = destroyed.reduce((best, d) =>
      occupants(state, d.id).length > occupants(state, best.id).length ? d : best,
    );
    spared.condition = 0.1;
    destroyed.splice(destroyed.indexOf(spared), 1);
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
  if (destroyed.length > 0) {
    const gone = new Set(destroyed.map((d) => d.id));
    const homes = state.dwellings.filter((d) => !gone.has(d.id));
    for (const d of destroyed) {
      const members = occupants(state, d.id);
      if (members.length === 0) continue;
      const target = evacuationTarget(state, day, members, d.id, homes);
      if (target) for (const p of members) p.dwellingId = target.id;
    }
    // rozestavěná přestavba shořelého domu padá – klády se vrátí na hromadu
    state.constructions = state.constructions.filter((c) => {
      const lost = c.kind === 'rebuild' && c.dwellingId !== null && gone.has(c.dwellingId);
      if (lost && c.wood) addLogs(state, c.wood.fromPile);
      return !lost;
    });
    recordRuins(state, destroyed, day);
    state.dwellings = homes;
  }
  return {
    day,
    kind: 'fire',
    startedDwellingId: startId,
    burnedDwellingIds: [...burningIds],
    lostGrainKg: Math.round(lostGrain),
    lostMeatKg: Math.round(lostMeat),
    lostCheeseKg: Math.round(lostCheese),
    lostHayKg: Math.round(lostHay),
  };
}
