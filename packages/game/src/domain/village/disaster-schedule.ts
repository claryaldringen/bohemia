// Ochrana nové vsi a rozpis místních pohrom roku (disasters.md – Kraj a ochrana nové vsi, Místní
// pohromy – jedna ves). Samostatný soubor bez závislostí na pohromách – čtou ho požár, kroupy
// i rámec `localDisastersDay` (disasters.ts ho dál vyváží).

import { dayIndexOf, monthLength } from '../calendar';
import { detCos, detSin } from '../landscape/det-math';
import { createRandom, deriveSeed, type Random } from '../landscape/random';
import { CELL_SIZE_M, LANDSCAPE_SIZE } from '../landscape/types';
import { HAIL, LOCAL_DISASTERS, TORNADO, type TornadoStrengthRule } from './rules-disasters';
import type { HailPlan, LocalYearSchedule, TornadoPlan, TornadoTrack } from './types-disasters';

/** Průměrná délka roku kalendáře (přestupný každý čtvrtý rok – calendar.ts). */
const DAYS_PER_YEAR = 365.25;

/**
 * Ochrana nové vsi (disasters.md – Kraj a ochrana nové vsi; Martin 27. 10. 2026: „Pětiletou
 * ochranu“): prvních 5 let od založení žádné kroupy, povodeň, požár ani smršť. Počasí kraje
 * platí naplno.
 */
export function inDisasterProtection(foundedDay: number, day: number): boolean {
  return day - foundedDay < LOCAL_DISASTERS.protectionYears * DAYS_PER_YEAR;
}

/** Rozpisy už spočtené (seed vsi a rok) – čistá funkce, paměť jen šetří los. */
const schedules = new Map<string, Readonly<LocalYearSchedule>>();
const SCHEDULE_MEMO_LIMIT = 4096;

/**
 * Rozpis místních pohrom roku `year` ze seedu vsi (disasters.md – Místní pohromy – jedna ves):
 * kroupy ze `'hail:' + year` – šance 6 %, jeden den června až srpna, směr pruhu a posun jeho středu
 * v okolí vsi. Dvě vsi téže mapy mají jiný seed, tedy jiné kroupy. Nezávisí na stavu vsi ani na
 * ochraně nové vsi (tu řeší rámec) – výsledek je jen ke čtení.
 */
export function yearSchedule(seed: number, year: number): Readonly<LocalYearSchedule> {
  const key = `${seed}:${year}`;
  const known = schedules.get(key);
  if (known) return known;
  const random = createRandom(deriveSeed(seed, 'hail:' + year));
  let hail: HailPlan | null = null;
  if (random.next() < HAIL.chancePerYear) {
    const from = dayIndexOf({ year, ...HAIL.window.from });
    const to = dayIndexOf({ year, ...HAIL.window.to });
    const day = Math.min(to, from + Math.floor(random.next() * (to - from + 1)));
    const angle = random.next() * Math.PI;
    const offsetM = (2 * random.next() - 1) * HAIL.offsetM;
    hail = { day, angle, offsetM };
  }
  const schedule = { hail };
  if (schedules.size >= SCHEDULE_MEMO_LIMIT) schedules.clear();
  schedules.set(key, schedule);
  return schedule;
}

/** Půlka strany mapy kraje (m) – mapa leží ve čtverci ⟨−půlka, půlka⟩² (`tileCenterWorld`). */
export const MAP_HALF_M = (LANDSCAPE_SIZE * CELL_SIZE_M) / 2;

/** Pravidlo síly smrště (disasters.md – Smršť, tabulky). */
export function tornadoStrengthRule(strength: TornadoPlan['strength']): TornadoStrengthRule {
  return TORNADO.strengths.find((r) => r.strength === strength)!;
}

/** Leží bod (m) v pásu stopy? */
export function inTornadoTrack(track: TornadoTrack, x: number, z: number): boolean {
  const c = detCos(track.angle);
  const s = detSin(track.angle);
  const along = (x - track.x) * c + (z - track.z) * s;
  const across = -(x - track.x) * s + (z - track.z) * c;
  return Math.abs(along) <= track.lengthM / 2 && Math.abs(across) <= track.widthM / 2;
}

/**
 * Protne pás stopy čtverec se středem (cx, cz) a půlkou strany `half` (m)? Oddělující osy dvou
 * obdélníků – osy čtverce a osy stopy.
 */
export function tornadoTrackHitsSquare(
  track: TornadoTrack,
  cx: number,
  cz: number,
  half: number,
): boolean {
  const c = detCos(track.angle);
  const s = detSin(track.angle);
  const dx = track.x - cx;
  const dz = track.z - cz;
  const hl = track.lengthM / 2;
  const hw = track.widthM / 2;
  // osy x a z čtverce
  if (Math.abs(dx) > half + hl * Math.abs(c) + hw * Math.abs(s)) return false;
  if (Math.abs(dz) > half + hl * Math.abs(s) + hw * Math.abs(c)) return false;
  // osy stopy – podél a napříč
  const square = half * (Math.abs(c) + Math.abs(s));
  if (Math.abs(dx * c + dz * s) > hl + square) return false;
  if (Math.abs(-dx * s + dz * c) > hw + square) return false;
  return true;
}

/**
 * Poissonův počet se střední hodnotou `mean` (inverzí – jeden los). Používá `Math.exp`, který
 * není deterministický napříč stroji, proto `yearTornadoes` běží jen na serveru a do prohlížeče
 * nepatří – pohled čte jen `disasters.tornado` (zapsané serverem).
 */
function poisson(random: Random, mean: number): number {
  const u = random.next();
  let p = Math.exp(-mean);
  let sum = p;
  let k = 0;
  while (u >= sum && k < 50) {
    k++;
    p *= mean / k;
    sum += p;
  }
  return k;
}

/** Vybere položku podle podílů `share` (jeden los). */
function pick<T extends { share: number }>(items: readonly T[], u: number): T {
  let acc = 0;
  for (const item of items) {
    acc += item.share;
    if (u < acc) return item;
  }
  return items[items.length - 1]!;
}

/** Jedna smršť v rozšířeném čtverci mapy – vždy stejný počet losů (pořadí proudu se nemění). */
function drawTornado(random: Random, year: number): TornadoPlan {
  const extent = MAP_HALF_M + TORNADO.marginM;
  const x = (2 * random.next() - 1) * extent;
  const z = (2 * random.next() - 1) * extent;
  const { month } = pick(TORNADO.months, random.next());
  const dayOfMonth = 1 + Math.floor(random.next() * monthLength(year, month));
  const rule = pick(TORNADO.strengths, random.next());
  const lengthM = rule.lengthM * (1 - TORNADO.sizeSpread + 2 * TORNADO.sizeSpread * random.next());
  const widthM = rule.widthM * (1 - TORNADO.sizeSpread + 2 * TORNADO.sizeSpread * random.next());
  const main = random.next() < TORNADO.direction.mainShare;
  const a = random.next();
  const b = random.next();
  const toRad = Math.PI / 180;
  const angle = main
    ? (TORNADO.direction.mainHeadingDeg + (a + b - 1) * TORNADO.direction.spreadDeg) * toRad
    : a * 2 * Math.PI;
  return {
    day: dayIndexOf({ year, month, day: dayOfMonth }),
    strength: rule.strength,
    track: { x, z, angle, lengthM, widthM },
  };
}

/** Smrště mapy už spočtené (seed počasí a rok). */
const tornadoYears = new Map<string, readonly TornadoPlan[]>();

/**
 * Smrště roku `year` přes mapu kraje ze seedu počasí mapy (disasters.md – Smršť (tornádo)): počet
 * podle Poissona ve čtverci mapy rozšířeném o 30 km (0,5 na 10 000 km² ročně), každá se středem,
 * dnem (květen–srpen), silou, délkou, šířkou a směrem (převážně od JZ k SV). Vrátí jen stopy, které
 * mapu protnou, podle dne – všechny vsi mapy vidí tutéž. Čistá funkce, paměť jen šetří los.
 */
export function yearTornadoes(weatherSeed: number, year: number): readonly TornadoPlan[] {
  const key = `${weatherSeed}:${year}`;
  const known = tornadoYears.get(key);
  if (known) return known;
  const random = createRandom(deriveSeed(weatherSeed, 'tornado:' + year));
  const side = (2 * (MAP_HALF_M + TORNADO.marginM)) / 1000;
  const count = poisson(random, (TORNADO.perTenThousandKm2 * side * side) / 10_000);
  const plans: TornadoPlan[] = [];
  for (let i = 0; i < count; i++) {
    const plan = drawTornado(random, year);
    if (tornadoTrackHitsSquare(plan.track, 0, 0, MAP_HALF_M)) plans.push(plan);
  }
  plans.sort((a, b) => a.day - b.day);
  if (tornadoYears.size >= SCHEDULE_MEMO_LIMIT) tornadoYears.clear();
  tornadoYears.set(key, plans);
  return plans;
}
