// Měření generátoru krajiny na vzorku seedů: npx tsx packages/game/scripts/measure-landscapes.ts 500
// Druhý argument `initial` změří verze vrstev sídel založených do 18. 10. 2026, `previous` nová
// sídla do 20. 10. 2026 (bez skal u potoka).
import {
  checkBand,
  CURRENT_LAYER_VERSIONS,
  generateLandscapeAttempt,
  generateObstacles,
  INITIAL_LAYER_VERSIONS,
  MAX_ATTEMPTS,
  measureLandscape,
  PREVIOUS_LAYER_VERSIONS,
  promontoriesOf,
  type Landscape,
} from '../src/domain/landscape';

const count = Number(process.argv[2] ?? 500);
const versions =
  process.argv[3] === 'initial'
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
    const landscape = generateLandscapeAttempt((seed + attempt) >>> 0, versions);
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
  `Vzorek: ${count} seedů, verze vrstev ${JSON.stringify(versions)} (metriky z 1. pokusu)`,
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
