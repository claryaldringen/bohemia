import { dateOfDayIndex, dayIndexOf, TOTAL_GAME_DAYS } from '../calendar';
import {
  obstacleIndex,
  obstacleKind,
  obstacleLook,
  obstaclesNear,
  type ObstacleLayer,
} from '../landscape';
import { createRandom, deriveSeed } from '../landscape/random';
import { GROVE, OAK_AGE, OAK_MODEL_HEIGHT_M, SACRED_OAK_HAPPINESS, SACRED_OAK_LIFE } from './rules';
import type { ChronicleEvent, SacredOak } from './types';

// Stáří, život a štěstí posvátných dubů (happiness.md – Posvátný dub): vše plyne jen z dubu ve
// vrstvě překážek a z herního dne – velikost dubu dává jeho stáří k začátku světa, id a poloha
// délku života, den uschnutí a pádu souše. Stav vsi si nic nového nepamatuje: kdy dub uschne
// a kdy souš padne, se dá kdykoli spočítat znovu – stejně v každé vsi.

/** Herní rok dne 0 (1. 1. 500) a poslední herní rok světa. */
const WORLD_FIRST_YEAR = dateOfDayIndex(0).year;
const WORLD_LAST_YEAR = dateOfDayIndex(TOTAL_GAME_DAYS - 1).year;
/** Dny v roce, které má každý rok (366. den jen přestupný). */
const DAYS_IN_YEAR = 365;

/** Posvátný dub žije, uschl (stojí souš), nebo souš padla. */
export type SacredOakStage = 'alive' | 'snag' | 'fallen';

/** Život posvátného dubu – plyne jen z dubu ve vrstvě překážek. */
export interface SacredOakLife {
  /** Velikost dubu (výška modelu × měřítko, m). */
  sizeM: number;
  /** Stáří k 1. 1. 500 v celých letech (`oakAgeYears`). */
  ageAtStart: number;
  /** Stáří, ve kterém dub uschne (roky). */
  lifespanYears: number;
  /** Den (index), kdy dub uschne; za koncem světa null. */
  diesDay: number | null;
  /** Den (index), kdy souš padne; za koncem světa null. */
  fallsDay: number | null;
}

/** Posvátný dub v daný den – jak vypadá, jak je starý a kolik přidává štěstí. */
export interface SacredOakNow {
  stage: SacredOakStage;
  /**
   * Stáří v celých letech – živý dub stárne s herním časem, souš má stáří, ve kterém uschla; dub,
   * který ve vrstvě není (ruční krajina testů), null.
   */
  ageYears: number | null;
  /** Kolik dub sám přidává štěstí (stropy vsi platí zvlášť) – živý podle stáří, souš 1. */
  happiness: number;
  /** Velikost dubu (výška modelu × měřítko, m); bez dubu ve vrstvě null. */
  sizeM: number | null;
  /** Den, kdy uschl (souš a padlá souš); živý null. */
  diedDay: number | null;
}

/** Velikost dospělého dubu na indexu vrstvy (výška modelu × měřítko, m); jiný strom null. */
function oakSizeAt(layer: ObstacleLayer, index: number): number | null {
  if (obstacleKind(layer, index) !== 'tree') return null;
  const height = OAK_MODEL_HEIGHT_M[obstacleLook(layer, index)];
  return height === undefined ? null : height * layer.scale[index]!;
}

/** Celé herní roky od začátku světa do dne `day`. */
function yearsSinceStart(day: number): number {
  return Math.max(0, dateOfDayIndex(day).year - WORLD_FIRST_YEAR);
}

/**
 * Stáří dubu velikosti `sizeM` (výška modelu × měřítko) v den `day` v celých letech
 * (happiness.md – Co hráč vidí): ke dni začátku světa lineárně podle velikosti v rozpětí
 * `OAK_AGE` (nejmenší posvátný dub 150 let, největší 400, mimo rozpětí oříznuté) + herní roky od
 * začátku světa. Stejný dub má tak stejné stáří v každé vsi a s herním časem stárne.
 */
export function oakAgeYears(sizeM: number, day: number): number {
  const share = Math.min(
    1,
    Math.max(0, (sizeM - OAK_AGE.minSizeM) / (OAK_AGE.maxSizeM - OAK_AGE.minSizeM)),
  );
  const atStart = Math.round(OAK_AGE.minYears + share * (OAK_AGE.maxYears - OAK_AGE.minYears));
  return atStart + yearsSinceStart(day);
}

/**
 * Kolik přidá štěstí živý posvátný dub stáří `ageYears` (happiness.md – Posvátný dub): 150 let
 * 1, 2000 let 10, mezi tím podle logaritmu stáří – každé zdvojnásobení stáří přidá stejně
 * (≈ 2,4 bodu) –, na celé body.
 */
export function oakAgeHappiness(ageYears: number): number {
  const { youngYears, oldYears, young, old } = SACRED_OAK_HAPPINESS;
  const share = Math.log(ageYears / youngYears) / Math.log(oldYears / youngYears);
  return Math.round(young + (old - young) * Math.min(1, Math.max(0, share)));
}

/** Den (index) `offset` dní po 1. dni měsíce `month` roku `year`; za koncem světa null. */
function dayInYear(year: number, month: number, offset: number): number | null {
  if (year > WORLD_LAST_YEAR) return null;
  return dayIndexOf({ year, month, day: 1 }) + offset;
}

/** Celé číslo z [from, to] podle náhodného čísla 0–1. */
function between([from, to]: readonly [number, number], random: number): number {
  return from + Math.floor(random * (to - from + 1));
}

const lives = new WeakMap<ObstacleLayer, Map<number, SacredOakLife | null>>();

/**
 * Život dubu `id` z vrstvy překážek (happiness.md – Posvátný dub): stáří k začátku světa podle
 * velikosti, délka života 800–2000 let (`SACRED_OAK_LIFE` – nejčastěji ≈ 1100), den v létě, kdy
 * uschne, a za kolik let (50–100) souš padne. Náhoda je ze seedu z id a polohy dubu – stejný dub
 * má stejný život v každé vsi, v prohlížeči i na serveru. Id, které ve vrstvě není dubem, null.
 */
export function sacredOakLife(layer: ObstacleLayer, id: number): SacredOakLife | null {
  let byId = lives.get(layer);
  if (!byId) {
    byId = new Map();
    lives.set(layer, byId);
  }
  const cached = byId.get(id);
  if (cached !== undefined) return cached;
  const life = computeLife(layer, id);
  byId.set(id, life);
  return life;
}

function computeLife(layer: ObstacleLayer, id: number): SacredOakLife | null {
  const index = obstacleIndex(layer, id);
  const sizeM = index < 0 ? null : oakSizeAt(layer, index);
  if (sizeM === null) return null;
  const x = Math.round(layer.x[index]! * 100);
  const z = Math.round(layer.z[index]! * 100);
  const random = createRandom(deriveSeed(id, `sacred-oak:${x}:${z}`));
  // délka života – `rank`. nejmenší z `draws` náhodných čísel (Beta(2, 4))
  const draws = Array.from({ length: SACRED_OAK_LIFE.draws }, () => random.next()).sort(
    (a, b) => a - b,
  );
  const { minYears, maxYears } = SACRED_OAK_LIFE;
  const lifespanYears = Math.round(
    minYears + (maxYears - minYears) * draws[SACRED_OAK_LIFE.rank - 1]!,
  );
  const { death } = SACRED_OAK_LIFE;
  const deathOffset = Math.floor(random.next() * death.days);
  const snagYears = between(SACRED_OAK_LIFE.snagYears, random.next());
  const fallOffset = Math.floor(random.next() * DAYS_IN_YEAR);
  const ageAtStart = oakAgeYears(sizeM, 0);
  const diesYear = WORLD_FIRST_YEAR + lifespanYears - ageAtStart;
  return {
    sizeM,
    ageAtStart,
    lifespanYears,
    diesDay: dayInYear(diesYear, death.month, deathOffset),
    fallsDay: dayInYear(diesYear + snagYears, 1, fallOffset),
  };
}

/** Stadium dubu v den `day`: žije, souš (od dne uschnutí), padlá souš (od dne pádu). */
export function sacredOakStage(life: SacredOakLife, day: number): SacredOakStage {
  if (life.fallsDay !== null && day >= life.fallsDay) return 'fallen';
  if (life.diesDay !== null && day >= life.diesDay) return 'snag';
  return 'alive';
}

/**
 * Posvátný dub `id` v den `day`: stadium, stáří a kolik přidává štěstí – živý podle stáří
 * (`oakAgeHappiness`), souš `SACRED_OAK_HAPPINESS.snag`, padlá souš nic. Bez vrstvy (testy)
 * nebo když dub ve vrstvě není, počítá se jako nejmladší živý posvátný dub bez známého stáří.
 */
export function sacredOakNow(layer: ObstacleLayer | null, id: number, day: number): SacredOakNow {
  const life = layer ? sacredOakLife(layer, id) : null;
  if (!life) {
    return {
      stage: 'alive',
      ageYears: null,
      happiness: SACRED_OAK_HAPPINESS.young,
      sizeM: null,
      diedDay: null,
    };
  }
  const stage = sacredOakStage(life, day);
  if (stage === 'alive') {
    const ageYears = life.ageAtStart + yearsSinceStart(day);
    return {
      stage,
      ageYears,
      happiness: oakAgeHappiness(ageYears),
      sizeM: life.sizeM,
      diedDay: null,
    };
  }
  return {
    stage,
    ageYears: life.lifespanYears,
    happiness: stage === 'snag' ? SACRED_OAK_HAPPINESS.snag : 0,
    sizeM: life.sizeM,
    diedDay: life.diesDay,
  };
}

/**
 * Události kroniky dne `day`: ušetřený posvátný dub uschl, posvátná souš padla (happiness.md).
 * Bez vrstvy překážek (testy) žádné. Na tom, po jakých kouscích se ves dopočítává, nezávisí.
 */
export function sacredOakEvents(
  oaks: readonly SacredOak[],
  layer: ObstacleLayer | null,
  day: number,
): ChronicleEvent[] {
  if (!layer) return [];
  const events: ChronicleEvent[] = [];
  for (const oak of oaks) {
    const life = sacredOakLife(layer, oak.id);
    if (life?.diesDay === day) events.push({ day, kind: 'sacred-oak-died', id: oak.id });
    if (life?.fallsDay === day) events.push({ day, kind: 'sacred-snag-fell', id: oak.id });
  }
  return events;
}

/**
 * Stáří háje v den `day` = stáří jeho nejstaršího (největšího) dospělého dubu v okruhu
 * `GROVE.radiusM` od středu; bez dubu null.
 */
export function groveAgeYears(
  layer: ObstacleLayer,
  grove: { x: number; z: number },
  day: number,
): number | null {
  const r = GROVE.radiusM;
  let largest: number | null = null;
  for (const i of obstaclesNear(layer, grove.x - r, grove.z - r, grove.x + r, grove.z + r)) {
    const dx = layer.x[i]! - grove.x;
    const dz = layer.z[i]! - grove.z;
    if (dx * dx + dz * dz > r * r) continue;
    const size = oakSizeAt(layer, i);
    if (size !== null && (largest === null || size > largest)) largest = size;
  }
  return largest === null ? null : oakAgeYears(largest, day);
}
