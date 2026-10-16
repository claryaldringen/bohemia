// Měření generátoru krajiny na vzorku seedů: npx tsx packages/game/scripts/measure-landscapes.ts 500
import {
  checkBand,
  CURRENT_LAYER_VERSIONS,
  generateLandscapeAttempt,
  MAX_ATTEMPTS,
  measureLandscape,
} from '../src/domain/landscape';

const count = Number(process.argv[2] ?? 500);
const firstAttempt = {
  forestShare: [] as number[],
  villageSiteCells: [] as number[],
  fertileCells: [] as number[],
  reliefM: [] as number[],
};
const attempts: number[] = [];
const failures: Record<string, number> = {};
const started = performance.now();

for (let seed = 0; seed < count; seed++) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const landscape = generateLandscapeAttempt((seed + attempt) >>> 0, CURRENT_LAYER_VERSIONS);
    if (attempt === 0) {
      const m = measureLandscape(landscape);
      firstAttempt.forestShare.push(m.forestShare);
      firstAttempt.villageSiteCells.push(m.villageSiteCells);
      firstAttempt.fertileCells.push(m.fertileCells);
      firstAttempt.reliefM.push(m.reliefM);
    }
    const band = checkBand(landscape);
    for (const failure of band.failures) failures[failure] = (failures[failure] ?? 0) + 1;
    if (band.ok) {
      attempts.push(attempt + 1);
      break;
    }
  }
}
const elapsed = performance.now() - started;

const quantiles = (values: number[]): string => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(3));
  return `min ${fmt(sorted[0]!)} | p5 ${fmt(at(0.05))} | medián ${fmt(at(0.5))} | p95 ${fmt(at(0.95))} | max ${fmt(sorted.at(-1)!)}`;
};

console.log(`Vzorek: ${count} seedů (metriky z 1. pokusu)`);
for (const [name, values] of Object.entries(firstAttempt))
  console.log(`  ${name.padEnd(17)} ${quantiles(values)}`);
const totalAttempts = attempts.reduce((a, b) => a + b, 0);
console.log(
  `  úspěch na 1. pokus ${((attempts.filter((a) => a === 1).length / count) * 100).toFixed(1)} %, nejvíc pokusů ${Math.max(...attempts)}, nesplněno ${count - attempts.length}`,
);
console.log(`  důvody neúspěchu pokusů:`, failures);
console.log(`  průměrný čas jednoho pokusu ${(elapsed / totalAttempts).toFixed(1)} ms`);
