// Den a noc – čisté funkce bez enginu (jen vzhled, žádná herní pravidla). Z dne v roce a hodiny
// dne spočítá, kudy svítí slunce (v noci měsíc), barvu a sílu světel, oblohu, opar a tón pro
// materiály bez světla (impostory, dým). Skládá se s ročním obdobím (season-look.ts): přes den
// platí světlo období beze změny, soumrak a noc ho jen přebarví a ztlumí.
// Návrh: docs/design/landscape.md – Den a noc (Martin 19. 10. 2026).
import {
  OFFICIAL_WORLD,
  TOTAL_GAME_DAYS,
  dateOfDayIndex,
  dayIndexOf,
  getWorldState,
  realTimeOf,
  type WorldClock,
} from '@bohemia/game';
import { SUN_DIRECTION } from './constants';
import {
  REFERENCE_DAY,
  type DayOfYear,
  type Rgb,
  type SeasonLight,
  type SeasonLook,
} from './season-look';

/** Směr paprsků světla ve scéně (x východ, y nahoru, z sever). */
export interface Rays {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Zeměpisná šířka světa (°) – Čechy: v létě světlo ≈ 16 h, v zimě ≈ 8 h. */
export const LATITUDE_DEG = 50;
/** Poledne – pravý sluneční čas, slunce nejvýš. */
export const NOON_HOUR = 12;
export const DAY_HOURS = 24;
/** Sklon zemské osy (°) – deklinace slunce mezi slunovraty. */
const AXIAL_TILT_DEG = 23.44;
const YEAR_DAYS = 365;

/** Délka herního dne ve skutečném čase (ms, ≈ 86 s) – „Přehrát den“ na vývojové stránce. */
export const GAME_DAY_MS = (OFFICIAL_WORLD.endMs - OFFICIAL_WORLD.startMs) / TOTAL_GAME_DAYS;

const RAD = Math.PI / 180;

/** Délka vektoru SUN_DIRECTION – směr světla scény si ji drží (poloha světla stínové mapy). */
const SUN_LENGTH = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z);
/** Výška slunce scény v poledne referenčního dne (rad, ≈ 34,5°) – výchozí letní světlo. */
const REFERENCE_ELEVATION = Math.asin(-SUN_DIRECTION.y / SUN_LENGTH);
/** Vodorovný směr ke slunci v poledne (jednotkový): na něj se otočí skutečný jih. */
const NOON_HORIZONTAL = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);
const NOON_X = -SUN_DIRECTION.x / NOON_HORIZONTAL;
const NOON_Z = -SUN_DIRECTION.z / NOON_HORIZONTAL;
/**
 * Převod skutečné výšky slunce na výšku světla ve scéně (stylizace): slunce na obzoru svítí ve
 * scéně z HORIZON_ELEVATION (rovina krajiny by jinak při západu zčernala a stíny by se natáhly
 * přes celou krajinu), výš se výška sbíhá (měkkost ELEVATION_SOFTNESS) k výšce referenčního
 * poledne – krajina je laděná na slunce ≈ 35° (zvlnění terénu je lépe vidět), skutečné letní
 * poledne je ≈ 61°.
 */
const HORIZON_ELEVATION = 8 * RAD;
const ELEVATION_SOFTNESS = 37 * RAD;
/** Nejnižší výška světla scény (rad) – slunce těsně pod obzorem, než se přepne na měsíc. */
const MIN_SCENE_ELEVATION = 5 * RAD;

/** Deklinace slunce (°) v den roku – jednoduchá kosinová aproximace (chyba do ≈ 1°). */
export function solarDeclinationDeg(day: DayOfYear): number {
  return -AXIAL_TILT_DEG * Math.cos((2 * Math.PI * (day + 10)) / YEAR_DAYS);
}

/** Směr ke slunci v místní soustavě (východ, sever, nahoru) – jednotkový vektor. */
export function sunVector(
  day: DayOfYear,
  hour: number,
): { east: number; north: number; up: number } {
  const latitude = LATITUDE_DEG * RAD;
  const declination = solarDeclinationDeg(day) * RAD;
  const hourAngle = (hour - NOON_HOUR) * 15 * RAD;
  return {
    east: -Math.cos(declination) * Math.sin(hourAngle),
    north:
      Math.sin(declination) * Math.cos(latitude) -
      Math.cos(declination) * Math.cos(hourAngle) * Math.sin(latitude),
    up:
      Math.sin(declination) * Math.sin(latitude) +
      Math.cos(declination) * Math.cos(hourAngle) * Math.cos(latitude),
  };
}

/** Skutečná výška slunce nad obzorem (°; pod obzorem záporná). */
export function sunElevationDeg(day: DayOfYear, hour: number): number {
  return Math.asin(clamp(sunVector(day, hour).up, -1, 1)) / RAD;
}

/** Skutečná výška slunce v poledne referenčního dne (rad) – převod výšky ji dá na REFERENCE_ELEVATION. */
const REFERENCE_SUN_ELEVATION = Math.asin(sunVector(REFERENCE_DAY, NOON_HOUR).up);
const REFERENCE_TANH = Math.tanh(REFERENCE_SUN_ELEVATION / ELEVATION_SOFTNESS);

/** Výška světla ve scéně (rad) ze skutečné výšky (rad) – v poledne referenčního dne přesně SUN_DIRECTION. */
function sceneElevation(real: number): number {
  // v referenčním poledni je podíl přesně 1 a výška přesně REFERENCE_ELEVATION
  const share = Math.tanh(real / ELEVATION_SOFTNESS) / REFERENCE_TANH;
  const elevation = REFERENCE_ELEVATION - (REFERENCE_ELEVATION - HORIZON_ELEVATION) * (1 - share);
  return Math.max(MIN_SCENE_ELEVATION, elevation);
}

/**
 * Paprsky světla ve scéně ze směru k nebeskému tělesu (východ, sever, nahoru). Dráha slunce je
 * otočená kolem svislé osy tak, aby poledne svítilo ze směru SUN_DIRECTION (stylizace – krajina
 * je na něj laděná); slunce dál vychází „po levé ruce“ a zapadá „po pravé“ jako na severní
 * polokouli. Délka jako SUN_DIRECTION.
 */
function sceneRays(v: { east: number; north: number; up: number }): {
  rays: Rays;
  elevation: number;
} {
  const elevation = sceneElevation(Math.asin(clamp(v.up, -1, 1)));
  const horizontal = Math.hypot(v.east, v.north);
  // otočení, které skutečný jih (0, −1) převede na vodorovný směr poledne (NOON_X, NOON_Z)
  const s = NOON_X;
  const c = -NOON_Z;
  const east = horizontal > 1e-12 ? v.east / horizontal : 0;
  const north = horizontal > 1e-12 ? v.north / horizontal : -1;
  const x = east * c - north * s;
  const z = east * s + north * c;
  const flat = Math.cos(elevation) * SUN_LENGTH;
  return {
    rays: { x: -x * flat, y: -Math.sin(elevation) * SUN_LENGTH, z: -z * flat },
    elevation,
  };
}

/** Úhel mezi dvěma směry (°). */
export function raysAngleDeg(a: Rays, b: Rays): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const length = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
  if (length === 0) return 0;
  return Math.acos(clamp(dot / length, -1, 1)) / RAD;
}

/**
 * Barevný filtr obrazu (ColorCurves zpracování obrazu – globalHue, globalDensity,
 * globalSaturation): v noci obraz zmodrá a ztratí sytost jako ve filmu („day for night“) –
 * modré světlo samo zelenou trávu nezmodří, jen ztmaví. Bez filtru (hustota 0, sytost 0) se
 * obraz nemění.
 */
export interface Grade {
  /** Odstín filtru (°, 0–360). */
  hue: number;
  /** Síla filtru 0–100. */
  density: number;
  /** Sytost −100–100 (0 = beze změny). */
  saturation: number;
}

export const NO_GRADE: Grade = { hue: 0, density: 0, saturation: 0 };

/** Násobky světla ročního období v jedné fázi dne (1 = světlo období beze změny). */
interface Palette {
  /** Síla a barva slunce. */
  sun: number;
  sunTint: Rgb;
  /** Rozptýlené světlo oblohy (HemisphericLight) a odraz od země. */
  sky: number;
  skyTint: Rgb;
  ground: Rgb;
  /** Barva pozadí (obloha) a oparu. */
  clear: Rgb;
  fog: Rgb;
  /** Násobek hustoty oparu – za soumraku víc, ať je u obzoru teplý opar vidět. */
  haze: number;
  /** Filtr obrazu – odstín a síla jako vektor (mezi fázemi se míchá vektorově, ne přes zelenou). */
  filterA: number;
  filterB: number;
  saturation: number;
}

const WHITE: Rgb = [1, 1, 1];

function palette(
  values: Omit<Palette, 'filterA' | 'filterB' | 'saturation' | 'haze'> & { haze?: number },
  grade: Grade = NO_GRADE,
): Palette {
  return {
    ...values,
    haze: values.haze ?? 1,
    filterA: grade.density * Math.cos(grade.hue * RAD),
    filterB: grade.density * Math.sin(grade.hue * RAD),
    saturation: grade.saturation,
  };
}

const DAY = palette({
  sun: 1,
  sunTint: WHITE,
  sky: 1,
  skyTint: WHITE,
  ground: WHITE,
  clear: WHITE,
  fog: WHITE,
});
/**
 * Zlatá hodinka – slunce nízko, teplé světlo, opar do zlatova. Obloha svítí víc než přes den:
 * rovina krajiny je při nízkém slunci tmavá, světlo oblohy ji drží čitelnou.
 */
const GOLDEN = palette(
  {
    sun: 0.95,
    sunTint: [1, 0.84, 0.62],
    sky: 1.25,
    skyTint: [1.02, 0.96, 0.88],
    ground: [1, 0.92, 0.82],
    clear: [1.1, 0.97, 0.84],
    fog: [1.1, 0.97, 0.85],
  },
  { hue: 38, density: 32, saturation: 8 },
);
/**
 * Slunce na obzoru – silné nízké zlatavé slunce (na sněhu broskvový až zlatý nádech), slabší
 * modrofialové světlo oblohy (stíny a svahy od slunce), broskvový opar. Slunce svítí ve scéně
 * z ≈ 8° – na rovině krajiny by běžná síla nebyla vidět, proto ji zesiluje. Ne do růžova:
 * oranžové slunce s fialovou oblohou dělalo ze sněhu růžovou omítku (ladění 19. 10. 2026).
 */
const SUNSET = palette(
  {
    sun: 2.2,
    sunTint: [1, 0.85, 0.52],
    sky: 0.72,
    skyTint: [0.76, 0.83, 1.1],
    ground: [0.85, 0.84, 0.88],
    clear: [1.16, 0.9, 0.74],
    fog: [1.14, 0.92, 0.78],
    haze: 1.2,
  },
  { hue: 42, density: 34, saturation: 0 },
);
/**
 * Soumrak – slunce zapadlo: šero se studeným modrým světlem oblohy (stíny i nasvícená strana),
 * u obzoru oranžovorůžová obloha a hustší teplý opar, zem méně sytá. Obloha svítí víc než
 * přes den, ať je ves čitelná (dřív hnědá „bahnitá“ zem – ladění 19. 10. 2026).
 */
const DUSK = palette(
  {
    sun: 0,
    sunTint: [1, 0.85, 0.52],
    sky: 1.45,
    skyTint: [0.72, 0.82, 1.16],
    ground: [0.6, 0.64, 0.82],
    clear: [1.28, 0.8, 0.66],
    fog: [1.3, 0.82, 0.7],
    haze: 1.7,
  },
  { hue: 222, density: 90, saturation: -55 },
);
/** Modrá hodinka – přechod soumraku do studené modré noci. */
const BLUE = palette(
  {
    sun: 0,
    sunTint: [1, 0.8, 0.56],
    sky: 1.55,
    skyTint: [0.66, 0.74, 1.2],
    ground: [0.52, 0.56, 0.74],
    clear: [0.55, 0.5, 0.72],
    fog: [0.56, 0.52, 0.72],
    haze: 1.3,
  },
  { hue: 226, density: 85, saturation: -60 },
);
/**
 * Měsíční noc – modrá a čitelná, ne černá: hráč v noci dál hraje (noc je každou minutu a půl).
 * Hlavní světlo je měsíc (MOON), obloha rozptýlí modré světlo, obraz zmodrá a ztratí sytost.
 * Světlo má málo zelené – na zelené trávě by noc vyšla tyrkysová, ne studeně modrá jako na sněhu.
 */
const NIGHT = palette(
  {
    sun: 0,
    sunTint: [1, 0.8, 0.56],
    sky: 1.6,
    skyTint: [0.58, 0.66, 1.25],
    ground: [0.46, 0.5, 0.74],
    clear: [0.2, 0.25, 0.42],
    fog: [0.22, 0.27, 0.43],
  },
  { hue: 230, density: 100, saturation: -66 },
);

/** Fáze dne podle skutečné výšky slunce (°, sestupně) – mezi nimi plynule. */
const PALETTE_KEYS: readonly (readonly [elevationDeg: number, palette: Palette])[] = [
  [10, DAY],
  [4, GOLDEN],
  [0.5, SUNSET],
  [-3, DUSK],
  [-7, BLUE],
  [-12, NIGHT],
];

/** Měsíc (pro čitelnou noc vždy v úplňku, naproti slunci) – síla a barva hlavního světla v noci. */
const MOON = { intensity: 0.55, color: [0.62, 0.7, 1] as Rgb };
/**
 * Slunce svítí od výšky SUN_GONE_DEG (0) do SUN_FULL_DEG (plně) – i těsně pod obzorem dosvit
 * západu, ať slunce při západu nezhasne naráz (síla se mění ≈ 2 s); měsíc od výšky 4° do 14° nad
 * obzorem (úplněk je naproti slunci – jeho výška je minus výška slunce). Mezi nimi (slunce pod
 * obzorem) hlavní světlo nesvítí a přepne se ze slunce na měsíc (SWITCH_DEG) – bez skoku.
 */
const SUN_GONE_DEG = -3.5;
const SUN_FULL_DEG = 2;
const SWITCH_DEG = -3.7;
const MOON_RISE_DEG: readonly [number, number] = [4, 14];
/** Stíny slunce sílí od výšky (°) – při západu jsou dlouhé a slabé. */
const SUN_SHADOW_DEG: readonly [number, number] = [-0.5, 4];
/** Stíny od měsíce jsou slabší než od slunce (podíl síly stínu) a sílí s jeho výškou (°). */
const MOON_SHADOW = 0.75;
const MOON_SHADOW_DEG: readonly [number, number] = [2, 10];
/** Ranní opar: hustota až × (1 + MORNING_MIST) kolem východu slunce. */
const MORNING_MIST = 0.6;
const MIST_DEG: readonly [number, number, number] = [-6, 1, 9];
/** Noc pro postavy a okna (fáze 2) – podle výšky slunce (°): od SUN_GONE_DEG do NIGHT_DEG. */
const NIGHT_DEG = -9;

export type LightSource = 'sun' | 'moon';

// Počasí (disasters.md – Ve scéně): v suchu slunce praží – ostřejší stíny a vyšší kontrast
// obrazu (světlo a barvy upraví už `seasonLook`); v mokru je zataženo – slabší stíny.
/** Síla stínů navíc při plném suchu (1,35×). */
const HEAT_SHADOW = 0.35;
/** Kontrast obrazu navíc při plném suchu (1,1 → 1,23). */
const HEAT_CONTRAST = 0.12;
/** O kolik slábnou stíny při plném mokru. */
const OVERCAST_SHADOW = 0.5;

/** Násobek síly stínů podle počasí (1 v normálním roce). */
function weatherShadowOf(season: SeasonLook): number {
  return (1 + HEAT_SHADOW * season.drought) * (1 - OVERCAST_SHADOW * season.wet);
}

export interface DayLight {
  /** Kudy svítí hlavní světlo (paprsky; délka jako SUN_DIRECTION). */
  direction: Rays;
  /** Hlavní světlo je slunce, nebo v noci měsíc. */
  source: LightSource;
  /** Skutečná výška slunce nad obzorem (°; v noci záporná). */
  sunElevationDeg: number;
  /** Světlo scény – přes den světlo ročního období beze změny. */
  light: SeasonLight;
  /** Barva odlesků hlavního světla (Light.specular – třpyt na vodě); přes den bílá. */
  specular: Rgb;
  /** Okolní světlo scény (scene.ambientColor) – přes den bílé. */
  ambient: Rgb;
  /**
   * Násobek barvy materiálů bez světla (impostory se zapečeným světlem, dým) – přes den
   * v poledne referenčního dne bílý, v noci tmavě modrý.
   */
  tone: Rgb;
  /** Barva odrazu oblohy na vodě. */
  waterSky: Rgb;
  /** Filtr obrazu (ColorCurves) – přes den žádný. */
  grade: Grade;
  /**
   * Síla stínů (1 = jako dnes, 0 = žádné) – nízké světlo a měsíc vrhají slabší stín; v suchu nad
   * 1 (ostřejší, tmavší stín – slunce praží), v mokru slabší (zataženo).
   */
  shadowStrength: number;
  /** Násobek kontrastu obrazu (1 = jako dnes) – v suchu vyšší. */
  contrast: number;
  /** Jak moc je noc 0–1 (fáze 2: lidé jdou domů, z domů prosvítá oheň). */
  night: number;
}

/**
 * Světlo scény v den roku a hodinu dne (0–24, pravý sluneční čas). `hour` null = bez denní doby:
 * pevné odpolední slunce SUN_DIRECTION a světlo ročního období (hra /game, dokud den a noc
 * neschválí Martin). V poledne referenčního dne vyjde přesně totéž.
 */
export function dayLight(season: SeasonLook, day: DayOfYear, hour: number | null): DayLight {
  const weatherShadow = weatherShadowOf(season);
  const contrast = 1 + HEAT_CONTRAST * season.drought;
  if (hour === null) {
    return {
      direction: SUN_DIRECTION,
      source: 'sun',
      sunElevationDeg: REFERENCE_SUN_ELEVATION / RAD,
      light: season.light,
      specular: WHITE,
      ambient: WHITE,
      tone: WHITE,
      waterSky: season.water.sky,
      grade: NO_GRADE,
      shadowStrength: weatherShadow,
      contrast,
      night: 0,
    };
  }
  const h = wrapHour(hour);
  const sun = sunVector(day, h);
  const elevation = Math.asin(clamp(sun.up, -1, 1)) / RAD;
  const palette = paletteAt(elevation);
  const source: LightSource = elevation > SWITCH_DEG ? 'sun' : 'moon';
  const base = season.light;
  // úplněk naproti slunci
  const body = source === 'sun' ? sun : { east: -sun.east, north: -sun.north, up: -sun.up };
  const key = sceneRays(body);
  const keyIntensity =
    source === 'sun'
      ? base.sunIntensity * palette.sun * smoothstep(SUN_GONE_DEG, SUN_FULL_DEG, elevation)
      : MOON.intensity * smoothstep(MOON_RISE_DEG[0], MOON_RISE_DEG[1], -elevation);
  const light: SeasonLight = {
    sunIntensity: keyIntensity,
    sunColor: source === 'sun' ? times(base.sunColor, palette.sunTint) : MOON.color,
    skyIntensity: base.skyIntensity * palette.sky,
    skyColor: times(base.skyColor, palette.skyTint),
    groundColor: times(base.groundColor, palette.ground),
    clearColor: times(base.clearColor, palette.clear),
    fogColor: times(base.fogColor, palette.fog),
    fogDensity: base.fogDensity * palette.haze * (1 + MORNING_MIST * morningMist(h, elevation)),
  };
  // tón = osvětlení teď / osvětlení období v referenčním poledni (výška světla ve scéně)
  const sinKey = Math.sin(key.elevation);
  const sinReference = Math.sin(REFERENCE_ELEVATION);
  const toneOf = (i: number): number =>
    illumination(
      light.sunIntensity,
      light.sunColor,
      sinKey,
      light.skyIntensity,
      light.skyColor,
      i,
    ) /
    illumination(
      base.sunIntensity,
      base.sunColor,
      sinReference,
      base.skyIntensity,
      base.skyColor,
      i,
    );
  const tone: Rgb = [toneOf(0), toneOf(1), toneOf(2)];
  const shadowStrength =
    source === 'sun'
      ? smoothstep(SUN_SHADOW_DEG[0], SUN_SHADOW_DEG[1], elevation)
      : MOON_SHADOW * smoothstep(MOON_SHADOW_DEG[0], MOON_SHADOW_DEG[1], -elevation);
  return {
    direction: key.rays,
    source,
    sunElevationDeg: elevation,
    light,
    specular: source === 'sun' ? palette.sunTint : MOON.color,
    // okolní světlo (stromy, pole) ubývá s celkovým osvětlením – jako tón, nad denní ne
    ambient: tone.every((c) => c === 1)
      ? WHITE
      : [Math.min(1, tone[0]), Math.min(1, tone[1]), Math.min(1, tone[2])],
    tone,
    waterSky: times(season.water.sky, palette.clear),
    grade: gradeOf(palette),
    shadowStrength: source === 'sun' ? shadowStrength * weatherShadow : shadowStrength,
    contrast,
    night: smoothstep(-SUN_GONE_DEG, -NIGHT_DEG, -elevation),
  };
}

/**
 * Největší rozdíl dvou světel (0 = stejné) – scéna podle něj pozná, jestli se vyplatí
 * překreslit. Směr se porovnává v desetinách stupně.
 */
export function dayLightDistance(a: DayLight, b: DayLight): number {
  let max = raysAngleDeg(a.direction, b.direction) / 10;
  const scalar = (x: number, y: number): void => {
    max = Math.max(max, Math.abs(x - y));
  };
  const color = (x: Rgb, y: Rgb): void => {
    for (let i = 0; i < 3; i++) scalar(x[i]!, y[i]!);
  };
  scalar(a.light.sunIntensity, b.light.sunIntensity);
  scalar(a.light.skyIntensity, b.light.skyIntensity);
  scalar(a.light.fogDensity / b.light.fogDensity, 1);
  scalar(a.shadowStrength, b.shadowStrength);
  scalar(a.contrast, b.contrast);
  color(a.light.sunColor, b.light.sunColor);
  color(a.light.skyColor, b.light.skyColor);
  color(a.light.groundColor, b.light.groundColor);
  color(a.light.clearColor, b.light.clearColor);
  color(a.light.fogColor, b.light.fogColor);
  color(a.specular, b.specular);
  color(a.ambient, b.ambient);
  color(a.tone, b.tone);
  color(a.waterSky, b.waterSky);
  // filtr jako vektor (odstín × síla) – odstín bez síly nic neznamená a přetáčí se přes 360°
  const filter = (g: Grade): [number, number] => [
    (g.density / 100) * Math.cos(g.hue * RAD),
    (g.density / 100) * Math.sin(g.hue * RAD),
  ];
  const [fa, fb] = filter(a.grade);
  const [ga, gb] = filter(b.grade);
  scalar(fa, ga);
  scalar(fb, gb);
  scalar(a.grade.saturation / 100, b.grade.saturation / 100);
  return max;
}

/**
 * Hodina dne (0–24) ve světě, který běží – podle toho, jak velká část herního dne uplynula
 * (herní den trvá ≈ 86 s, `realTimeOf`). Svět, který neběží, nemá denní dobu (null). Pro hru
 * (fáze 2) – zatím ji používá jen vývojová stránka přes vlastní hodiny.
 */
export function dayHourAt(nowMs: number, world: WorldClock): number | null {
  const state = getWorldState(nowMs, world);
  if (state.status !== 'running') return null;
  const startMs = realTimeOf(state.date, world);
  const next = dayIndexOf(state.date) + 1;
  const endMs = next < TOTAL_GAME_DAYS ? realTimeOf(dateOfDayIndex(next), world) : world.endMs;
  if (endMs <= startMs) return 0;
  return clamp(((nowMs - startMs) / (endMs - startMs)) * DAY_HOURS, 0, DAY_HOURS);
}

/** Násobky světla podle skutečné výšky slunce (°) – mezi fázemi lineárně. */
function paletteAt(elevation: number): Palette {
  const first = PALETTE_KEYS[0]!;
  const last = PALETTE_KEYS[PALETTE_KEYS.length - 1]!;
  if (elevation >= first[0]) return first[1];
  if (elevation <= last[0]) return last[1];
  for (let i = 0; i + 1 < PALETTE_KEYS.length; i++) {
    const [fromDeg, from] = PALETTE_KEYS[i]!;
    const [toDeg, to] = PALETTE_KEYS[i + 1]!;
    if (elevation <= fromDeg && elevation > toDeg) {
      const t = (fromDeg - elevation) / (fromDeg - toDeg);
      return {
        sun: mix(from.sun, to.sun, t),
        sunTint: mixRgb(from.sunTint, to.sunTint, t),
        sky: mix(from.sky, to.sky, t),
        skyTint: mixRgb(from.skyTint, to.skyTint, t),
        ground: mixRgb(from.ground, to.ground, t),
        clear: mixRgb(from.clear, to.clear, t),
        fog: mixRgb(from.fog, to.fog, t),
        haze: mix(from.haze, to.haze, t),
        filterA: mix(from.filterA, to.filterA, t),
        filterB: mix(from.filterB, to.filterB, t),
        saturation: mix(from.saturation, to.saturation, t),
      };
    }
  }
  return last[1];
}

/** Filtr obrazu z vektoru fáze (odstín a síla). */
function gradeOf(p: Palette): Grade {
  const density = Math.hypot(p.filterA, p.filterB);
  if (density < 1e-9 && p.saturation === 0) return NO_GRADE;
  const hue = (((Math.atan2(p.filterB, p.filterA) / RAD) % 360) + 360) % 360;
  return { hue, density, saturation: p.saturation };
}

/** Ranní opar 0–1: kolem východu slunce (jen dopoledne), přes den ani večer ne. */
function morningMist(hour: number, elevation: number): number {
  if (hour >= NOON_HOUR) return 0;
  const [from, peak, to] = MIST_DEG;
  if (elevation <= from || elevation >= to) return 0;
  return elevation < peak ? smoothstep(from, peak, elevation) : 1 - smoothstep(peak, to, elevation);
}

/**
 * Osvětlení vodorovné plochy jedním kanálem barvy: hlavní světlo podle výšky + obloha. Podíl
 * dvou osvětlení je tón materiálů bez světla (v poledne referenčního dne přesně 1).
 */
function illumination(
  keyIntensity: number,
  keyColor: Rgb,
  sinElevation: number,
  skyIntensity: number,
  skyColor: Rgb,
  channel: number,
): number {
  return (
    keyIntensity * keyColor[channel]! * Math.max(0, sinElevation) +
    skyIntensity * skyColor[channel]!
  );
}

function wrapHour(hour: number): number {
  if (!Number.isFinite(hour)) return NOON_HOUR;
  return ((hour % DAY_HOURS) + DAY_HOURS) % DAY_HOURS;
}

function times(a: Rgb, b: Rgb): Rgb {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
