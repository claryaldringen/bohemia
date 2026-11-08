/**
 * Měření umístění map ve světě: stará (lineární) a nová verze ve stejném běhu, střídavě.
 *   npx tsx packages/game/scripts/measure-placement.ts [1000 5000 20000]
 */
import { performance } from 'node:perf_hooks';
import { placeCluster } from '../src/domain/world/placement';
import { placeClusterReference } from '../src/domain/world/__tests__/placement-reference';
import {
  makeRng,
  randomCluster,
  randomWorld,
} from '../src/domain/world/__tests__/placement-fixtures';

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
for (const [count, spread] of (sizes.length > 0 ? sizes : [1000, 5000, 20000]).flatMap(
  (n) =>
    [
      [n, 3],
      [n, 1.3],
    ] as const,
)) {
  const world = randomWorld(count, 7, spread);
  const rng = makeRng(99);
  const newcomers = Array.from({ length: 100 }, () => ({ kind: 'independent' as const }));
  const clusters = Array.from({ length: 20 }, () => randomCluster(rng, 3 + Math.floor(rng() * 5)));
  const time = (fn: typeof placeCluster): number => {
    const t = performance.now();
    for (const r of newcomers) fn(world, [{ x: 0, y: 0 }], r);
    for (const c of clusters) fn(world, c, { kind: 'independent' });
    return performance.now() - t;
  };
  const oldMs = time(placeClusterReference);
  const newMs = time(placeCluster);
  console.log(
    `${count} buněk (${spread === 3 ? 'řídký' : 'hustý'} svět): stará ${oldMs.toFixed(0)} ms, nová ${newMs.toFixed(0)} ms (100 nováčků + 20 shluků)`,
  );
}
