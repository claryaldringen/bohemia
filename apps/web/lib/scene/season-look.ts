// Vzhled krajiny podle ročního období – čisté funkce bez enginu (jen vzhled, žádná herní
// pravidla). Z herního data (den v roce) spočítá parametry, které scéna předá shaderům, světlu,
// oparu, vodě a zvukům. Všechno se mění plynule – přechody trvají 2–4 týdny, nic se nepřepíná.
import { dateOfDayIndex, getWorldState, TOTAL_GAME_DAYS, type WorldClock } from '@bohemia/game';

export type Rgb = readonly [number, number, number];

/** Světlo a obloha scény (Babylon: slunce, rozptýlené světlo oblohy, barva pozadí a opar). */
export interface SeasonLight {
  sunIntensity: number;
  sunColor: Rgb;
  skyIntensity: number;
  skyColor: Rgb;
  /** Světlo odražené od země (HemisphericLight.groundColor) – sníh ho zesvětlí. */
  groundColor: Rgb;
  clearColor: Rgb;
  fogColor: Rgb;
  fogDensity: number;
}

/** Násobky hlasitosti vrstev zvuků (`ambient-mix.ts`) – 1 = léto. */
export interface SeasonSound {
  birds: number;
  birdsong: number;
  leaves: number;
}

export interface SeasonLook {
  /** Sněhová pokrývka 0–1: 0 bez sněhu, 1 souvislý sníh (kromě strmých svahů). */
  snow: number;
  /** Tráva: 0 letní, 1 suchá a zimní hnědá. */
  grassDry: number;
  /** Svěží jarní zeleň trávy 0–1. */
  grassFresh: number;
  /** Kolik listí mají listnáče (a keře) 0–1. */
  leaves: number;
  /** Podzimní zbarvení listí 0–1. */
  leafAutumn: number;
  /** Mladé světlé jarní listí 0–1. */
  leafFresh: number;
  /** Květy keřů a ovocných stromů 0–1 (jaro). */
  blossom: number;
  light: SeasonLight;
  /** Násobek barev vody (zimní voda je tmavší a studenější) a barva odrazu oblohy. */
  water: { tint: Rgb; sky: Rgb };
  sound: SeasonSound;
}

/** Den v roce 1–366 (1. 1. = 1, desetinná část = denní doba). */
export type DayOfYear = number;

/**
 * Den, kterým se kreslí svět, který ještě neběží (před startem i po konci) – vrcholné léto,
 * tedy vzhled, ke kterému byla krajina laděná.
 */
export const REFERENCE_DAY: DayOfYear = 196;

const YEAR_DAYS = 365;

/**
 * Klíčové body ročního průběhu: [den v roce, hodnota]. Mezi body se hodnota mění hladce
 * (smoothstep), za posledním bodem pokračuje k prvnímu dalšího roku.
 */
type Track = readonly (readonly [day: number, value: number])[];

// Dny v roce (nepřestupném): 1. 3. = 60, 1. 4. = 91, 1. 6. = 152, 1. 9. = 244, 1. 12. = 335.
// Období se v kalendáři střídají 1. 3., 1. 6., 1. 9. a 1. 12. (docs/design/calendar.md) –
// přechody vzhledu jsou kolem těchto dat.

/** Sníh napadne koncem listopadu (souvislý od 10. 12.), taje od 20. 2. do poloviny března. */
const SNOW: Track = [
  [51, 1],
  [72, 0],
  [324, 0],
  [344, 1],
];
/** Tráva: po tání hnědá, v březnu zezelená; od konce srpna usychá, v listopadu zhnědne. */
const GRASS_DRY: Track = [
  [58, 0.85],
  [98, 0],
  [232, 0],
  [268, 0.4],
  [305, 0.75],
  [335, 0.85],
];
/** Jarní svěží zeleň: duben až polovina května, do poloviny června odezní. */
const GRASS_FRESH: Track = [
  [74, 0],
  [102, 1],
  [138, 1],
  [166, 0],
];
/** Listí: raší koncem března, plné koncem dubna; opadá od poloviny října do poloviny listopadu. */
const LEAVES: Track = [
  [80, 0],
  [116, 1],
  [290, 1],
  [322, 0],
];
/** Podzimní barvy od září do poloviny října; před rašením se vrátí (holé stromy to nepoznají). */
const LEAF_AUTUMN: Track = [
  [56, 1],
  [78, 0],
  [246, 0],
  [290, 1],
];
/** Mladé listí je světlé do začátku května, do poloviny června ztmavne na letní. */
const LEAF_FRESH: Track = [
  [126, 1],
  [166, 0],
  [330, 0],
  [360, 1],
];

/** Trnka, hloh a jabloně kvetou od poloviny dubna do začátku května. */
const BLOSSOM: Track = [
  [92, 0],
  [108, 1],
  [122, 1],
  [138, 0],
];

type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';

/** Podíl období [jaro, léto, podzim, zima] pro světlo, vodu a zvuky – plateau s přechody. */
const SEASON_WEIGHTS: readonly (readonly [day: number, season: SeasonName])[] = [
  [52, 'winter'],
  [80, 'spring'],
  [140, 'spring'],
  [164, 'summer'],
  [232, 'summer'],
  [262, 'autumn'],
  [318, 'autumn'],
  [344, 'winter'],
];

interface SeasonAnchor {
  light: SeasonLight;
  water: { tint: Rgb; sky: Rgb };
  sound: SeasonSound;
}

/** Letní světlo podle 0 A.D. (biom temperate) – výchozí vzhled, ke kterému je laděná krajina. */
const SUMMER: SeasonAnchor = {
  light: {
    sunIntensity: 1.05,
    sunColor: [1.03, 0.98, 0.88],
    skyIntensity: 0.5,
    skyColor: [0.93, 0.96, 1.05],
    groundColor: [0.32, 0.3, 0.26],
    clearColor: [0.63, 0.75, 0.85],
    fogColor: [0.68, 0.77, 0.86],
    fogDensity: 0.00032,
  },
  water: { tint: [1, 1, 1], sky: [0.55, 0.66, 0.78] },
  sound: { birds: 1, birdsong: 1, leaves: 1 },
};

const ANCHORS: Record<SeasonName, SeasonAnchor> = {
  spring: {
    light: {
      sunIntensity: 1.05,
      sunColor: [1.02, 0.99, 0.92],
      skyIntensity: 0.52,
      skyColor: [0.92, 0.96, 1.05],
      groundColor: [0.32, 0.31, 0.27],
      clearColor: [0.64, 0.76, 0.87],
      fogColor: [0.7, 0.78, 0.87],
      fogDensity: 0.00034,
    },
    water: { tint: [0.97, 1.02, 1.03], sky: [0.58, 0.68, 0.8] },
    sound: { birds: 1.1, birdsong: 1.2, leaves: 0.9 },
  },
  summer: SUMMER,
  autumn: {
    light: {
      sunIntensity: 1,
      sunColor: [1.06, 0.93, 0.78],
      skyIntensity: 0.5,
      skyColor: [0.95, 0.95, 1],
      groundColor: [0.34, 0.3, 0.24],
      clearColor: [0.67, 0.74, 0.81],
      fogColor: [0.74, 0.76, 0.79],
      fogDensity: 0.00044,
    },
    water: { tint: [1.04, 0.98, 0.88], sky: [0.6, 0.65, 0.72] },
    sound: { birds: 0.6, birdsong: 0.45, leaves: 1.2 },
  },
  winter: {
    // Slabší světlo: na bílém sněhu by plné letní světlo přetáhlo osvětlení do bílé
    // a terén by ztratil stínování svahů.
    light: {
      sunIntensity: 0.72,
      sunColor: [0.99, 0.97, 0.94],
      skyIntensity: 0.44,
      skyColor: [0.9, 0.94, 1.03],
      groundColor: [0.5, 0.52, 0.56],
      clearColor: [0.72, 0.77, 0.83],
      fogColor: [0.78, 0.81, 0.86],
      fogDensity: 0.0004,
    },
    water: { tint: [0.72, 0.92, 1.3], sky: [0.7, 0.74, 0.8] },
    sound: { birds: 0.35, birdsong: 0.2, leaves: 0.6 },
  },
};

const SEASON_ORDER: readonly SeasonName[] = ['spring', 'summer', 'autumn', 'winter'];

/** Vzhled krajiny pro den v roce (1–366, desetinná část plynule mezi dny). */
export function seasonLook(day: DayOfYear): SeasonLook {
  const d = wrapDay(day);
  const weights = seasonWeights(d);
  const blend = <T>(pick: (anchor: SeasonAnchor) => T, mix: (parts: [T, number][]) => T): T =>
    mix(SEASON_ORDER.map((name, i) => [pick(ANCHORS[name]), weights[i]!]));
  const light: SeasonLight = {
    sunIntensity: blend((a) => a.light.sunIntensity, mixNumbers),
    sunColor: blend((a) => a.light.sunColor, mixColors),
    skyIntensity: blend((a) => a.light.skyIntensity, mixNumbers),
    skyColor: blend((a) => a.light.skyColor, mixColors),
    groundColor: blend((a) => a.light.groundColor, mixColors),
    clearColor: blend((a) => a.light.clearColor, mixColors),
    fogColor: blend((a) => a.light.fogColor, mixColors),
    fogDensity: blend((a) => a.light.fogDensity, mixNumbers),
  };
  return {
    snow: track(SNOW, d),
    grassDry: track(GRASS_DRY, d),
    grassFresh: track(GRASS_FRESH, d),
    leaves: track(LEAVES, d),
    leafAutumn: track(LEAF_AUTUMN, d),
    leafFresh: track(LEAF_FRESH, d),
    blossom: track(BLOSSOM, d),
    light,
    water: {
      tint: blend((a) => a.water.tint, mixColors),
      sky: blend((a) => a.water.sky, mixColors),
    },
    sound: {
      birds: blend((a) => a.sound.birds, mixNumbers),
      birdsong: blend((a) => a.sound.birdsong, mixNumbers),
      leaves: blend((a) => a.sound.leaves, mixNumbers),
    },
  };
}

/**
 * Den v roce, kterým se kreslí svět v daném okamžiku. Celé dny – vzhled se mění jednou za herní
 * den (≈ 86 s), scéna se kvůli tomu nepřekresluje častěji. Svět, který neběží, má léto.
 */
export function seasonDayAt(nowMs: number, world: WorldClock): DayOfYear {
  const state = getWorldState(nowMs, world);
  return state.status === 'running' ? state.date.dayOfYear : REFERENCE_DAY;
}

/**
 * Největší rozdíl dvou vzhledů (0 = stejné). Scéna podle něj pozná, jestli se vyplatí
 * překreslit – změnu o pár tisícin nikdo nepozná.
 */
export function seasonLookDistance(a: SeasonLook, b: SeasonLook): number {
  let max = 0;
  const scalar = (x: number, y: number): void => {
    max = Math.max(max, Math.abs(x - y));
  };
  const color = (x: Rgb, y: Rgb): void => {
    for (let i = 0; i < 3; i++) scalar(x[i]!, y[i]!);
  };
  scalar(a.snow, b.snow);
  scalar(a.grassDry, b.grassDry);
  scalar(a.grassFresh, b.grassFresh);
  scalar(a.leaves, b.leaves);
  scalar(a.leafAutumn, b.leafAutumn);
  scalar(a.leafFresh, b.leafFresh);
  scalar(a.blossom, b.blossom);
  scalar(a.light.sunIntensity, b.light.sunIntensity);
  scalar(a.light.skyIntensity, b.light.skyIntensity);
  // hustota oparu je řádově 1e-4 – porovnává se poměrně
  scalar(
    a.light.fogDensity / SUMMER.light.fogDensity,
    b.light.fogDensity / SUMMER.light.fogDensity,
  );
  color(a.light.sunColor, b.light.sunColor);
  color(a.light.skyColor, b.light.skyColor);
  color(a.light.groundColor, b.light.groundColor);
  color(a.light.clearColor, b.light.clearColor);
  color(a.light.fogColor, b.light.fogColor);
  color(a.water.tint, b.water.tint);
  color(a.water.sky, b.water.sky);
  scalar(a.sound.birds, b.sound.birds);
  scalar(a.sound.birdsong, b.sound.birdsong);
  scalar(a.sound.leaves, b.sound.leaves);
  return max;
}

/**
 * Den v roce jako kalendářní datum nepřestupného roku (pro vývojový přepínač) – měsíc, den
 * a roční období podle herního kalendáře.
 */
export function dateOfDayOfYear(day: DayOfYear): ReturnType<typeof dateOfDayIndex> {
  // rok 501 je nepřestupný a začíná indexem 366 (rok 500 je přestupný)
  const index = 366 + Math.min(YEAR_DAYS, Math.max(1, Math.floor(day))) - 1;
  return dateOfDayIndex(Math.min(index, TOTAL_GAME_DAYS - 1));
}

/** Den v roce do rozsahu [1, 366) – den 366 přestupného roku navazuje na 1. 1. */
function wrapDay(day: number): number {
  if (!Number.isFinite(day)) return REFERENCE_DAY;
  return ((((day - 1) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS) + 1;
}

/** Hodnota stopy v den `d` (1–366): hladký přechod mezi sousedními body, přes konec roku dokola. */
export function track(points: Track, d: number): number {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [fromDay, from] = points[i]!;
    const [toDayRaw, to] = points[(i + 1) % n]!;
    const toDay = i + 1 < n ? toDayRaw : toDayRaw + YEAR_DAYS;
    // den v úseku – úsek přes konec roku zachytí i dny na začátku dalšího roku
    const day = d < fromDay ? d + YEAR_DAYS : d;
    if (day >= fromDay && day < toDay) {
      return from + (to - from) * smoothstep(fromDay, toDay, day);
    }
  }
  return points[0]![1];
}

/** Podíl období [jaro, léto, podzim, zima] v den `d` (součet 1). */
function seasonWeights(d: number): number[] {
  const weights = [0, 0, 0, 0];
  const n = SEASON_WEIGHTS.length;
  for (let i = 0; i < n; i++) {
    const [fromDay, from] = SEASON_WEIGHTS[i]!;
    const [toDayRaw, to] = SEASON_WEIGHTS[(i + 1) % n]!;
    const toDay = i + 1 < n ? toDayRaw : toDayRaw + YEAR_DAYS;
    const day = d < fromDay ? d + YEAR_DAYS : d;
    if (day >= fromDay && day < toDay) {
      const t = smoothstep(fromDay, toDay, day);
      weights[SEASON_ORDER.indexOf(from)]! += 1 - t;
      weights[SEASON_ORDER.indexOf(to)]! += t;
      return weights;
    }
  }
  weights[SEASON_ORDER.indexOf(SEASON_WEIGHTS[0]![1])] = 1;
  return weights;
}

function mixNumbers(parts: [number, number][]): number {
  return parts.reduce((sum, [value, weight]) => sum + value * weight, 0);
}

function mixColors(parts: [Rgb, number][]): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [color, weight] of parts) {
    r += color[0] * weight;
    g += color[1] * weight;
    b += color[2] * weight;
  }
  return [r, g, b];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
