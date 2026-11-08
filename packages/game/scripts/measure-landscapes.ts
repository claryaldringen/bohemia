// Měření generátoru krajiny na vzorku seedů: npx tsx packages/game/scripts/measure-landscapes.ts 500
// Druhý argument `initial` změří verze vrstev sídel založených do 18. 10. 2026, `previous` nová
// sídla do 20. 10. 2026 (bez skal u potoka), název typu prémiové krajiny (např. `iron-ore`)
// změří prémiovou krajinu typu (premium-landscapes.md – Kalibrace). `--skeleton straight|corner|
// junction|source|trail|ford` změří mapu z ukázkového výřezu kostry (world-skeleton.md – Výsledky
// měření generátoru).
import {
  checkBand,
  CURRENT_LAYER_VERSIONS,
  generateLandscapeAttempt,
  generateObstacles,
  INITIAL_LAYER_VERSIONS,
  MAX_ATTEMPTS,
  measureLandscape,
  PREMIUM_LAYER_VERSION,
  PREMIUM_TYPES,
  PREVIOUS_LAYER_VERSIONS,
  promontoriesOf,
  SKELETON_LAYER_VERSION,
  type Landscape,
  type PremiumType,
  type SkeletonRiverPort,
  type SkeletonSlice,
} from '../src/domain/landscape';

const river = (
  side: SkeletonRiverPort['side'],
  at: number,
  widthM: number,
  flow: 'in' | 'out',
): SkeletonRiverPort => ({ side, at, widthM, flow });
/** Ukázkové výřezy kostry – řeky jako v testech koryt a pásma (`skeleton/__tests__`). */
const SKELETON_SAMPLES: Record<string, SkeletonSlice> = {
  straight: { world: 1, rivers: [river('N', 60, 35, 'in'), river('S', 70, 35, 'out')], trails: [] },
  corner: { world: 1, rivers: [river('W', 40, 30, 'in'), river('S', 90, 30, 'out')], trails: [] },
  junction: {
    world: 1,
    rivers: [river('N', 50, 40, 'in'), river('E', 64, 25, 'in'), river('S', 80, 45, 'out')],
    trails: [],
  },
  source: { world: 1, rivers: [river('S', 64, 25, 'out')], trails: [] },
  trail: {
    world: 1,
    rivers: [],
    trails: [
      { side: 'E', at: 40 },
      { side: 'W', at: 90 },
    ],
  },
  ford: {
    world: 1,
    rivers: [river('N', 60, 35, 'in'), river('S', 70, 35, 'out')],
    trails: [
      { side: 'E', at: 40 },
      { side: 'W', at: 90 },
    ],
  },
};

const count = Number(process.argv[2] ?? 500);
const skeletonArg = process.argv.indexOf('--skeleton');
const skeletonName = skeletonArg >= 0 ? process.argv[skeletonArg + 1] : undefined;
const skeleton = skeletonName === undefined ? null : (SKELETON_SAMPLES[skeletonName] ?? null);
if (skeletonName !== undefined && !skeleton) {
  throw new Error(`Neznámý výřez ${skeletonName} – ${Object.keys(SKELETON_SAMPLES).join(', ')}.`);
}
const premium = PREMIUM_TYPES.find((type): type is PremiumType => type === process.argv[3]);
const versions = skeleton
  ? { ...CURRENT_LAYER_VERSIONS, skeleton: SKELETON_LAYER_VERSION }
  : premium
    ? { ...CURRENT_LAYER_VERSIONS, premium: PREMIUM_LAYER_VERSION }
    : process.argv[3] === 'initial'
      ? INITIAL_LAYER_VERSIONS
      : process.argv[3] === 'previous'
        ? PREVIOUS_LAYER_VERSIONS
        : CURRENT_LAYER_VERSIONS;
/** Políčko 15 × 15 m = 0,0225 ha. */
const HA_PER_CELL = 0.0225;
const firstAttempt = {
  forestShare: [] as number[],
  villageSiteCells: [] as number[],
  fertileCells: [] as number[],
  reliefM: [] as number[],
  nearMeadowCells: [] as number[],
  nearGoodMeadowCells: [] as number[],
};
/** Přijaté krajiny (ty dostanou hráči): louky do 600 m od místa pro vesnici a les. */
const acceptedMetrics = {
  'louka do 600 m (ha)': [] as number[],
  'z toho úrodnost ≥ 60 (ha)': [] as number[],
  'podíl lesa': [] as number[],
  'úrodná políčka': [] as number[],
};
const attempts: number[] = [];
/** Skály u potoka (terén 2) u přijatých krajin. */
const rocks = {
  'nejvyšší stěna (m)': [] as number[],
  'podíl osy se stěnou > 3 m': [] as number[],
  'ostrožna – plocha (ha)': [] as number[],
  'ostrožna – výška (m)': [] as number[],
};
let withPromontory = 0;
/** Přijaté krajiny pro měření vrstvy překážek (generuje se jen pro přijatou krajinu, líně). */
const accepted: Landscape[] = [];
const OBSTACLE_SAMPLE = 20;
const failures: Record<string, number> = {};
const started = performance.now();

for (let seed = 0; seed < count; seed++) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const landscape = generateLandscapeAttempt((seed + attempt) >>> 0, versions, premium, skeleton);
    const m = measureLandscape(landscape);
    if (attempt === 0) {
      firstAttempt.forestShare.push(m.forestShare);
      firstAttempt.villageSiteCells.push(m.villageSiteCells);
      firstAttempt.fertileCells.push(m.fertileCells);
      firstAttempt.reliefM.push(m.reliefM);
      firstAttempt.nearMeadowCells.push(m.nearMeadowCells);
      firstAttempt.nearGoodMeadowCells.push(m.nearGoodMeadowCells);
    }
    const band = checkBand(landscape, versions);
    for (const failure of band.failures) failures[failure] = (failures[failure] ?? 0) + 1;
    if (band.ok) {
      attempts.push(attempt + 1);
      acceptedMetrics['louka do 600 m (ha)'].push(m.nearMeadowCells * HA_PER_CELL);
      acceptedMetrics['z toho úrodnost ≥ 60 (ha)'].push(m.nearGoodMeadowCells * HA_PER_CELL);
      acceptedMetrics['podíl lesa'].push(m.forestShare);
      acceptedMetrics['úrodná políčka'].push(m.fertileCells);
      const wall = (p: Landscape['stream'][number]): number =>
        Math.max(p.bankLeft ?? 0, p.bankRight ?? 0);
      rocks['nejvyšší stěna (m)'].push(Math.max(...landscape.stream.map(wall)));
      rocks['podíl osy se stěnou > 3 m'].push(
        landscape.stream.filter((p) => wall(p) > 3).length / landscape.stream.length,
      );
      for (const p of promontoriesOf(landscape)) {
        rocks['ostrožna – plocha (ha)'].push(p.areaHa);
        rocks['ostrožna – výška (m)'].push(p.heightM);
      }
      if (promontoriesOf(landscape).length > 0) withPromontory++;
      if (accepted.length < OBSTACLE_SAMPLE) accepted.push(landscape);
      break;
    }
  }
}
const elapsed = performance.now() - started;

const quantiles = (values: number[], qs = [0.05, 0.5, 0.95]): string => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(3));
  const label = (q: number): string => (q === 0.5 ? 'medián' : `p${Math.round(q * 100)}`);
  return [
    `min ${fmt(sorted[0]!)}`,
    ...qs.map((q) => `${label(q)} ${fmt(at(q))}`),
    `max ${fmt(sorted.at(-1)!)}`,
  ].join(' | ');
};

console.log(
  `Vzorek: ${count} seedů, verze vrstev ${JSON.stringify(versions)}${premium ? `, typ ${premium}` : ''}${skeletonName ? `, výřez ${skeletonName}` : ''} (metriky z 1. pokusu)`,
);
for (const [name, values] of Object.entries(firstAttempt))
  console.log(`  ${name.padEnd(19)} ${quantiles(values, [0.01, 0.05, 0.5, 0.95, 0.99])}`);
const totalAttempts = attempts.reduce((a, b) => a + b, 0);
console.log(
  `  úspěch na 1. pokus ${((attempts.filter((a) => a === 1).length / count) * 100).toFixed(1)} %, nejvíc pokusů ${Math.max(...attempts)}, nesplněno ${count - attempts.length}`,
);
console.log(`  důvody neúspěchu pokusů:`, failures);
console.log(`  průměrný čas jednoho pokusu ${(elapsed / totalAttempts).toFixed(1)} ms`);
console.log(`Přijaté krajiny (${attempts.length}):`);
const sortedMeadow = [...acceptedMetrics['louka do 600 m (ha)']].sort((a, b) => a - b);
// jeden řádek pro tabulku v premium-landscapes.md (Kalibrace – výsledky měření) a world-skeleton.md
const sortedFertile = [...acceptedMetrics['úrodná políčka']].sort((a, b) => a - b);
console.log(
  `SOUHRN ${skeletonName ?? premium ?? 'průměrná'} | 1. pokus ${((attempts.filter((a) => a === 1).length / count) * 100).toFixed(0)} % | nesplněno ${count - attempts.length} | ${(elapsed / totalAttempts).toFixed(0)} ms/pokus | louka do 600 m medián ${(sortedMeadow[Math.floor(sortedMeadow.length / 2)] ?? 0).toFixed(1)} ha (p10 ${(sortedMeadow[Math.floor(sortedMeadow.length * 0.1)] ?? 0).toFixed(1)}) | úrodná medián ${sortedFertile[Math.floor(sortedFertile.length / 2)] ?? 0}`,
);
for (const [name, values] of Object.entries(acceptedMetrics))
  console.log(`  ${name.padEnd(26)} ${quantiles(values, [0.1, 0.5, 0.9])}`);

if (versions.terrain === 2) {
  console.log(
    `Skály u potoka (terén 2): ostrožna na ${withPromontory} z ${attempts.length} přijatých krajin (${((withPromontory / Math.max(1, attempts.length)) * 100).toFixed(1)} %)`,
  );
  for (const [name, values] of Object.entries(rocks)) {
    if (values.length > 0)
      console.log(`  ${name.padEnd(26)} ${quantiles(values, [0.1, 0.5, 0.9])}`);
  }
}

// Vrstva překážek (stromy, keře, kameny) – server ji generuje jednou na krajinu v mezipaměti,
// prohlížeč jednou při načtení scény.
const obstacleTimes: number[] = [];
const obstacleCounts: number[] = [];
for (const landscape of accepted) {
  const start = performance.now();
  const layer = generateObstacles({ ...landscape, surface: landscape.surface.slice() });
  obstacleTimes.push(performance.now() - start);
  obstacleCounts.push(layer.count);
}
if (accepted.length > 0) {
  console.log(`Vrstva překážek (${accepted.length} přijatých krajin):`);
  console.log(`  překážek      ${quantiles(obstacleCounts)}`);
  console.log(`  čas (ms)      ${quantiles(obstacleTimes.map((t) => Math.round(t)))}`);
}
