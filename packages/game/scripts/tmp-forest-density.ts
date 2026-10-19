import { generateLandscape, obstaclesOf, obstaclesInTile, obstacleKind, surfaceAt } from '../src/domain/landscape';
import { OBSTACLE_COST } from '../src/domain/village/rules';
for (const seed of [42, 7, 1234]) {
  const l = generateLandscape(seed);
  const layer = obstaclesOf(l);
  const counts: Record<string, number> = {};
  let tiles = 0;
  let cost = 0;
  for (let y = 0; y < l.size; y++) for (let x = 0; x < l.size; x++) {
    if (surfaceAt(l, x, y) !== 'forest') continue;
    tiles++;
    for (const i of obstaclesInTile(layer, x, y)) {
      const k = obstacleKind(layer, i);
      counts[k] = (counts[k] ?? 0) + 1;
      if (k !== 'outcrop') cost += (OBSTACLE_COST as Record<string, number>)[k] ?? 0;
    }
  }
  const ha = tiles * l.cellSizeM * l.cellSizeM / 10000;
  const perHa = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / ha).toFixed(1)]));
  console.log(seed, 'forest tiles', tiles, 'ha', ha.toFixed(1), 'per ha', perHa, 'piece cost per ha', (cost / ha).toFixed(0), 'per tile', (cost / tiles).toFixed(1));
}
