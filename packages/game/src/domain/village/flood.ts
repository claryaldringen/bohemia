// Povodeň potoka (disasters.md – Povodeň potoka; Martin 27. 10. 2026: „Velikost povodně by se
// měla lišit … Naplavenina by měla hnojit víc“, „A ať zabíjí tak jak navrhuješ“, „Ano a ano“ –
// výška vody společná pro celý kraj). Stupeň, výšku a den vody dává počasí kraje (`weatherOf`);
// tady se počítají jen škody jedné vsi podle jejích políček – hloubka = výška vody − výška nad
// potokem (`streamHeights`). Krajina se nemění, voda je jen ve scéně a škoda ve stavu vsi.

import { dateOfDayIndex, dayIndexOf } from '../calendar';
import type { Landscape } from '../landscape';
import { createRandom, deriveSeed } from '../landscape/random';
import { bury } from './cemetery';
import { inDisasterProtection } from './disaster-schedule';
import { collapseDwellings } from './fire';
import { soakGrainPits } from './grain-pits';
import { damageUnmownMeadows } from './hay';
import { removePeople } from './kinship';
import { heightAboveStreamAt, streamHeights, tileIndex } from './part-protection';
import { ageGroup, ageYears, occupants } from './people';
import { FLOOD, type FloodBandRule } from './rules-disasters';
import { squareCenter } from './square-grid';
import { villageLandSquares } from './squares';
import type { ChronicleEvent } from './types-chronicle';
import type { RegionFlood } from './types-disasters';
import type { Dwelling, VillageState } from './types';
import { weatherOf } from './weather';
import { harvestYearOf } from './weather-effects';

const EPSILON = 1e-9;

/** Pásmo škod podle hloubky vody nad políčkem (m); nezatopené (hloubka ≤ 0) null. */
export function floodBand(depthM: number): FloodBandRule | null {
  if (depthM <= EPSILON) return null;
  return FLOOD.bands.find((b) => depthM <= b.maxDepthM) ?? FLOOD.bands[FLOOD.bands.length - 1]!;
}

/** Dnešní voda kraje, pokud dnes je; nová ves (5 let) ji má také, škody ale ne (`floodDay`). */
export function floodToday(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
): RegionFlood | null {
  const year = dateOfDayIndex(day).year;
  const flood = weatherOf(state, year).flood;
  if (!flood || dayIndexOf({ year, month: flood.month, day: flood.day }) !== day) return null;
  return flood;
}

/**
 * Hloubka dílu = průměr hloubky přes všechny jeho čtverce, nezatopený čtverec (hloubka ≤ 0)
 * počítá 0; díl s průměrem 0 v mapě není.
 */
export function meanPartDepths(
  samples: readonly { partId: number; depth: number }[],
): Map<number, number> {
  const sums = new Map<number, { sum: number; count: number }>();
  for (const { partId, depth } of samples) {
    const acc = sums.get(partId) ?? { sum: 0, count: 0 };
    acc.sum += Math.max(0, depth);
    acc.count += 1;
    sums.set(partId, acc);
  }
  const out = new Map<number, number>();
  for (const [id, { sum, count }] of sums) if (sum / count > EPSILON) out.set(id, sum / count);
  return out;
}

/**
 * Úklid záznamu `disasters.flood`: scéna ho čte jen po dobu stání vody (`FLOOD.standDays` dní
 * po dni povodně), pak se smaže. Ztráty úrody jsou jinde (`disasters.losses`).
 */
function pruneFloodRecord(state: VillageState, day: number): void {
  const record = state.disasters?.flood;
  if (record && day > record.day + FLOOD.standDays) delete state.disasters!.flood;
}

/** Hloubka vody (m) nad bodem světa; mimo mapu a bez vody v mapě 0. */
function depthAt(landscape: Landscape, heightM: number, x: number, z: number): number {
  return Math.max(0, heightM - heightAboveStreamAt(landscape, x, z));
}

/**
 * Den povodně (disasters.md – Povodeň potoka): ves bez krajiny (kalibrace, testy – žádné výšky)
 * a nová ves (5 let) nic – kromě vynucené vody. V den vody kraje zatopí políčka pod její výškou: nesklizená úroda
 * a ozim dílů (`disasters.losses.flood`), nesečené louky, naplavenina zvedne úrodnost dílu, do jam
 * zateče, stavby ztratí stav (zemnice se v hluboké vodě zřítí) a od pětisetleté vody může umřít
 * obyvatel zatopeného obydlí. Mutuje stav, vrátí zápisy do kroniky (nic nezatopeno – nic).
 */
export function floodDay(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): ChronicleEvent[] {
  pruneFloodRecord(state, day);
  if (!landscape) return [];
  const flood = floodToday(state, day);
  if (!flood) return [];
  // vynucená voda (dev, testy) ochranu nové vsi přebije jako vynucené kroupy a požár
  const forced = state.disasters?.override?.weather?.[dateOfDayIndex(day).year]?.flood;
  if (!forced && inDisasterProtection(state.foundedDay, day)) return [];
  const above = streamHeights(landscape);
  // díly polí – hloubka = průměr přes všechny čtverce dílu (nezatopený čtverec 0)
  const samples: { partId: number; depth: number }[] = [];
  for (const sq of villageLandSquares(landscape, state, ['field'])) {
    if (sq.partId === undefined) continue;
    const tile = sq.tile ?? tileIndex(landscape, sq.center.x, sq.center.z);
    samples.push({ partId: sq.partId, depth: tile < 0 ? 0 : flood.heightM - above[tile]! });
  }
  const partDepth = meanPartDepths(samples);
  floodCrops(state, day, flood, partDepth);
  const meadowShare = damageUnmownMeadows(state, day, (span) => {
    if (span.partId !== undefined)
      return 1 - (floodBand(partDepth.get(span.partId) ?? 0)?.cropKept ?? 1);
    if (!span.cell) return 0;
    const c = squareCenter(landscape, undefined, span.cell);
    return 1 - (floodBand(depthAt(landscape, flood.heightM, c.x, c.z))?.cropKept ?? 1);
  });
  // naplavenina hnojí všechny zatopené díly (i příloh a louku), nejvýš do 130 % přirozené
  for (const part of state.parts) {
    const band = floodBand(partDepth.get(part.id) ?? 0);
    if (!band) continue;
    const share = part.fertilityShare;
    part.fertilityShare = Math.max(share, Math.min(FLOOD.siltMaxShare, share + band.silt));
  }
  const lostGrain = soakGrainPits(
    state,
    (pit) => depthAt(landscape, flood.heightM, pit.x, pit.z) > EPSILON,
    FLOOD.pitGrainLoss,
  );
  const dwellingDepth = new Map<number, number>();
  for (const d of state.dwellings) {
    const depth = depthAt(landscape, flood.heightM, d.position.x, d.position.z);
    if (depth > EPSILON) dwellingDepth.set(d.id, depth);
  }
  const events: ChronicleEvent[] = [];
  if (flood.heightM >= FLOOD.deathMinWaterM - EPSILON) {
    events.push(...floodDeaths(state, day, [...dwellingDepth.keys()]));
  }
  const { dwellingIds, collapsedIds } = floodDwellings(state, day, dwellingDepth);
  if (partDepth.size === 0 && dwellingIds.length === 0 && meadowShare <= 0 && lostGrain <= 0) {
    return events;
  }
  (state.disasters ??= {}).flood = { day, level: flood.level, heightM: flood.heightM };
  events.unshift({
    day,
    kind: 'flood',
    level: flood.level,
    heightM: flood.heightM,
    partIds: [...partDepth.keys()].sort((a, b) => a - b),
    dwellingIds,
    collapsedDwellingIds: collapsedIds,
    ...(meadowShare > 0 ? { meadowShare } : {}),
    ...(lostGrain > 0 ? { lostGrainKg: Math.round(lostGrain) } : {}),
  });
  return events;
}

/**
 * Nesklizená úroda zatopených dílů: letní voda bere úrodu všech plodin (×0,7 / 0,3 / 0), jarní
 * jen ozim (×0,85 / 0,5 / 0,2) – jařiny se v březnu teprve sejí (návrh Clauda). Ztráta dílu do
 * `disasters.losses.flood` za rok sklizně (sloučí ji `dayPartLosses`); druhá voda téhož roku se
 * sloučí.
 */
function floodCrops(
  state: VillageState,
  day: number,
  flood: RegionFlood,
  partDepth: ReadonlyMap<number, number>,
): void {
  const year = harvestYearOf(day);
  const previous = state.disasters?.losses;
  const current = previous?.year === year ? previous : undefined;
  const losses: Record<string, number> = { ...current?.flood };
  const hit = new Set<number>();
  for (const crop of state.season?.crops ?? []) {
    if (crop.harvestedKg !== null) continue;
    if (flood.season === 'spring' && crop.crop !== 'winter') continue;
    for (const id of crop.partIds) {
      const band = floodBand(partDepth.get(id) ?? 0);
      if (!band || hit.has(id)) continue;
      const kept = flood.season === 'spring' ? band.winterKept : band.cropKept;
      const key = String(id);
      losses[key] = 1 - (1 - (losses[key] ?? 0)) * kept;
      hit.add(id);
    }
  }
  if (hit.size > 0) (state.disasters ??= {}).losses = { ...current, year, flood: losses };
}

/**
 * Úmrtí ve vodě od pětisetleté (Martin 27. 10. 2026: „A ať zabíjí tak jak navrhuješ“): každý
 * obyvatel zatopeného obydlí zemře s šancí 2 % – vlastní proud `'flood-death:' + day`, jeden los
 * na obyvatele v pořadí obydlí a lidí podle id. Mrtvé pohřbí hřbitov, nástupnictví řeší
 * `dynastyDay` týž den.
 */
function floodDeaths(
  state: VillageState,
  day: number,
  dwellingIds: readonly number[],
): ChronicleEvent[] {
  const random = createRandom(deriveSeed(state.seed, 'flood-death:' + day));
  const events: ChronicleEvent[] = [];
  const dead = new Set<number>();
  for (const id of [...dwellingIds].sort((a, b) => a - b)) {
    for (const p of occupants(state, id)) {
      if (random.next() >= FLOOD.deathChance) continue;
      dead.add(p.id);
      events.push({
        day,
        kind: 'death',
        group: ageGroup(p, day),
        age: ageYears(p.bornDay, day),
        cause: 'flood',
        ...(p.name === undefined ? {} : { name: p.name }),
      });
      const full = bury(state, day, p);
      if (full) events.push(full);
    }
  }
  if (dead.size > 0) removePeople(state, dead);
  return events;
}

/**
 * Zatopené stavby (obydlí a dílny) ztratí stav podle hloubky (−10 / −30 / −60 %, zemnice −30 /
 * −60 % / zřítí se); co dojde na nulu, spadne jako po požáru (`collapseDwellings` – zbytek jámy,
 * obyvatelé k příbuzným). Obydlený dům obyvatelé opraví prací vsi jako jindy.
 */
function floodDwellings(
  state: VillageState,
  day: number,
  depths: ReadonlyMap<number, number>,
): { dwellingIds: number[]; collapsedIds: number[] } {
  const destroyed: Dwelling[] = [];
  const dwellingIds: number[] = [];
  for (const d of state.dwellings) {
    const band = floodBand(depths.get(d.id) ?? 0);
    if (!band) continue;
    dwellingIds.push(d.id);
    const damage = d.type === 'zemnice' ? band.zemnice : band.building;
    d.condition = Math.max(0, d.condition - damage);
    if (d.condition <= EPSILON) destroyed.push(d);
  }
  collapseDwellings(state, day, destroyed);
  return {
    dwellingIds: dwellingIds.sort((a, b) => a - b),
    collapsedIds: destroyed.map((d) => d.id).sort((a, b) => a - b),
  };
}
