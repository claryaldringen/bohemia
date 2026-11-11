// Kroupy (disasters.md – Kroupy; Martin 27. 10. 2026: „Stromy by měly pole před kroupami částečně
// chránit“): jeden den června až srpna pruh 300 m přes okolí vsi potluče nesklizené díly a louky,
// letošní jablka v sadu a střechy staveb. Místní pohroma – rozpis ze seedu vsi (`yearSchedule`).

import { dateOfDayIndex } from '../../calendar';
import { CELL_SIZE_M, LANDSCAPE_SIZE, type Landscape } from '../../landscape';
import { detCos, detSin } from '../../landscape/det-math';
import { inDisasterProtection, yearSchedule } from './disaster-schedule';
import { damageUnmownMeadows } from '../livestock/hay';
import { squareExpectedYieldKg } from '../buildings/orchard';
import { HAIL } from '../rules/rules-disasters';
import { DWELLINGS } from '../rules/rules-people';
import { squareCenter, type GridGeometry } from '../placement/square-grid';
import { villageLandSquares } from '../placement/squares';
import type { ChronicleEvent } from '../types/types-chronicle';
import type { HailPlan, HailStrip } from '../types/types-disasters';
import type { VillageState } from '../types';
import { harvestYearOf, partProtectionOf, protectionAgainst } from './weather-effects';

const EPSILON = 1e-9;

/** Bez krajiny (kalibrace, testy) díly leží v mřížce běžné krajiny – políčka dílů jsou stejná. */
const DEFAULT_GEOMETRY: GridGeometry = { size: LANDSCAPE_SIZE, cellSizeM: CELL_SIZE_M };

/** Kde v pruhu leží místo: vnitřek, nebo okraj (vnějších 50 m z každé strany). */
export type HailZone = 'core' | 'edge';

/** Kde v pruhu leží bod (m); mimo pruh null. */
export function hailZone(strip: HailStrip, x: number, z: number): HailZone | null {
  // vzdálenost od osy pruhu: kolmice ke směru (cos, sin) je (−sin, cos)
  const across = -(x - strip.x) * detSin(strip.angle) + (z - strip.z) * detCos(strip.angle);
  const distance = Math.abs(across - strip.offsetM);
  const half = HAIL.widthM / 2;
  if (distance > half) return null;
  return distance > half - HAIL.edgeM ? 'edge' : 'core';
}

/** Váha místa v pruhu – okraj polovina (ztráta úrody 30 % proti 60 %). */
function zoneWeight(zone: HailZone): number {
  return zone === 'core' ? 1 : HAIL.edgeLoss / HAIL.loss;
}

/**
 * Ztráta nesklizené úrody dílu nebo louky v pruhu (disasters.md – Kroupy): 60 % (okraj 30 %)
 * × (1 − ochrana) – ochrana proti kroupám je 0,4 × zeleň (`protectionAgainst`).
 */
export function hailLoss(zone: HailZone, protection: number): number {
  return (zone === 'core' ? HAIL.loss : HAIL.edgeLoss) * (1 - protection);
}

/** Dnešní krupobití vsi: vynucené (přebije los i ochranu), nebo z rozpisu roku. */
function hailPlanOf(state: VillageState, day: number): Omit<HailPlan, 'day'> | null {
  const forced = state.disasters?.override?.hail?.[day];
  if (forced) return forced;
  if (state.weatherSeed === undefined) return null;
  if (inDisasterProtection(state.foundedDay, day)) return null;
  const plan = yearSchedule(state.seed, dateOfDayIndex(day).year).hail;
  return plan && plan.day === day ? plan : null;
}

/**
 * Úklid záznamu `disasters.hail`: pruh čte scéna a podíl jablek (`applesAfterHail`) jen v roce
 * krupobití, od 1. 1. dalšího roku se smaže.
 */
function pruneHailRecord(state: VillageState, day: number): void {
  const record = state.disasters?.hail;
  if (record && dateOfDayIndex(record.day).year < dateOfDayIndex(day).year) {
    delete state.disasters!.hail;
  }
}

/** Střed vsi – průměr poloh obydlí a dílen; bez staveb null. */
export function villageCenter(
  state: Pick<VillageState, 'dwellings'>,
): { x: number; z: number } | null {
  if (state.dwellings.length === 0) return null;
  let x = 0;
  let z = 0;
  for (const d of state.dwellings) {
    x += d.position.x;
    z += d.position.z;
  }
  return { x: x / state.dwellings.length, z: z / state.dwellings.length };
}

/**
 * Den krupobití (disasters.md – Kroupy): ves bez počasí kraje (testy, kalibrace) a nová ves
 * (5 let) nic. V den z rozpisu roku potluče pruh nesklizené díly (ztráta do
 * `disasters.losses.hail` – sloučí ji `dayPartLosses`), nesečené louky, letošní jablka a střechy.
 * Mutuje stav, vrátí zápis do kroniky (bez staveb nic).
 */
export function hailDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): ChronicleEvent | null {
  pruneHailRecord(state, day);
  const plan = hailPlanOf(state, day);
  if (!plan) return null;
  const center = villageCenter(state);
  if (!center) return null;
  const strip: HailStrip = { x: center.x, z: center.z, angle: plan.angle, offsetM: plan.offsetM };
  const geo = landscape ?? DEFAULT_GEOMETRY;
  const zones = new Map<number, HailZone>();
  for (const square of villageLandSquares(geo, state, ['field'])) {
    if (square.partId === undefined) continue;
    const zone = hailZone(strip, square.center.x, square.center.z);
    if (zone) zones.set(square.partId, zone);
  }
  const partIds = hitCrops(state, day, zones);
  const meadowShare = hitMeadows(state, day, strip, geo, zones);
  const appleShare = hitOrchards(state, day, strip, geo);
  const dwellingIds = hitRoofs(state, strip);
  const disasters = (state.disasters ??= {});
  const previous = disasters.hail;
  const sameYear =
    previous !== undefined && dateOfDayIndex(previous.day).year === dateOfDayIndex(day).year;
  const apples = (sameYear ? (previous.apples ?? 1) : 1) * (1 - appleShare);
  disasters.hail = { day, strip, ...(apples < 1 ? { apples } : {}) };
  return {
    day,
    kind: 'hail',
    partIds,
    dwellingIds,
    ...(meadowShare > 0 ? { meadowShare } : {}),
    ...(appleShare > 0 ? { appleShare } : {}),
  };
}

/**
 * Nesklizené díly plodin v pruhu: ztráta dílu do `disasters.losses.hail` za rok sklizně (druhé
 * krupobití téhož roku se sloučí). Sklizené díly nic. Vrátí id potlučených dílů.
 */
function hitCrops(
  state: VillageState,
  day: number,
  zones: ReadonlyMap<number, HailZone>,
): number[] {
  const year = harvestYearOf(day);
  const previous = state.disasters?.losses;
  const current = previous?.year === year ? previous : undefined;
  const hail: Record<string, number> = { ...current?.hail };
  const hit = new Set<number>();
  for (const crop of state.season?.crops ?? []) {
    if (crop.harvestedKg !== null) continue;
    for (const id of crop.partIds) {
      const zone = zones.get(id);
      if (!zone || hit.has(id)) continue;
      const share = hailLoss(zone, partProtectionOf(state, id, 'hail'));
      const key = String(id);
      hail[key] = 1 - (1 - (hail[key] ?? 0)) * (1 - share);
      hit.add(id);
    }
  }
  if (hit.size > 0) {
    (state.disasters ??= {}).losses = { ...current, year, hail };
  }
  return [...hit].sort((a, b) => a - b);
}

/**
 * Nesečené louky dnešní seče v pruhu: seno další seče ubude o ztracený podíl zbylé louky
 * (`damageUnmownMeadows`). Vrátí podíl sena zbylé louky, který ubyl.
 */
function hitMeadows(
  state: VillageState,
  day: number,
  strip: HailStrip,
  geo: GridGeometry,
  zones: ReadonlyMap<number, HailZone>,
): number {
  return damageUnmownMeadows(state, day, (span) => {
    if (span.partId !== undefined) {
      const zone = zones.get(span.partId);
      return zone ? hailLoss(zone, partProtectionOf(state, span.partId, 'hail')) : 0;
    }
    if (!span.cell) return 0;
    const c = squareCenter(geo, undefined, span.cell);
    const zone = hailZone(strip, c.x, c.z);
    return zone ? hailLoss(zone, protectionAgainst(undefined, 'hail')) : 0;
  });
}

/** Sady v pruhu: podíl letošních jablek, který ubyl (−40 %, okraj polovina). */
function hitOrchards(
  state: VillageState,
  day: number,
  strip: HailStrip,
  geo: GridGeometry,
): number {
  const squares = (state.orchards ?? []).flatMap((o) => o.squares);
  if (squares.length === 0) return 0;
  // Pořadí `villageLandSquares(['orchard'])` je pořadí sadů a jejich čtverců (squares.ts) – shoduje
  // se s `squares` výše po indexech; hlídá to test v hail.test.ts.
  const centers = villageLandSquares(geo, state, ['orchard']);
  let total = 0;
  let lost = 0;
  squares.forEach((square, i) => {
    const kg = squareExpectedYieldKg(square, day);
    total += kg;
    const center = centers[i]?.center;
    const zone = center ? hailZone(strip, center.x, center.z) : null;
    if (zone) lost += kg * HAIL.appleLoss * zoneWeight(zone);
  });
  return total > EPSILON ? lost / total : 0;
}

/**
 * Střechy obydlí a dílen v pruhu zchátrají o rok chátrání prázdné stavby (okraj o půl roku).
 * Kroupy samy stavbu nezboří: stav neklesne pod `HAIL.roofMinCondition` (návrh Clauda) – prázdná
 * stavba pak dožije běžným chátráním, ne jako ruina bez zmínky.
 */
function hitRoofs(state: VillageState, strip: HailStrip): number[] {
  const hit: number[] = [];
  for (const d of state.dwellings) {
    const zone = hailZone(strip, d.position.x, d.position.z);
    if (!zone) continue;
    const years = HAIL.roofYears * zoneWeight(zone);
    const hurt = d.condition - years / DWELLINGS[d.type].emptyLifespanYears;
    d.condition = Math.min(d.condition, Math.max(HAIL.roofMinCondition, hurt));
    hit.push(d.id);
  }
  return hit;
}
