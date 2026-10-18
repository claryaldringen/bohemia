// Obrysy stávajících objektů vsi pro malování po čtvercích (bez Babylonu): při stavbě pole, sadu
// nebo hřbitova je vidět, kudy vedou hranice polí, sadů, hřbitovů, obydlí a posvátných míst.
// Souřadnice světa scény v metrech (x, z).
import type { SceneVillage } from '../village-view';
import { targetOutline } from './selection-highlight';
import type { Point } from './village-layout';
import type { VillageTarget } from './village-picking';

/** Druh objektu – určuje barvu obrysu. */
export type OutlineKind = 'field' | 'orchard' | 'cemetery' | 'dwelling' | 'sacred';

/** Obrysy jednoho druhu: lomené čáry, uzavřené smyčky mají první a poslední bod shodný. */
export interface OutlineGroup {
  kind: OutlineKind;
  lines: Point[][];
}

const EPSILON_M = 1e-6;

const same = (a: Point, b: Point): boolean =>
  Math.abs(a[0] - b[0]) < EPSILON_M && Math.abs(a[1] - b[1]) < EPSILON_M;

/**
 * Spojí úsečky (např. z `cellsBoundary`) do souvislých lomených čar: navazující úsečky se
 * řetězí přes společný konec, uzavřený obrys skončí v bodě, kde začal. Pole s dírou nebo
 * dvěma kusy dá víc čar.
 */
export function chainSegments(segments: readonly (readonly Point[])[]): Point[][] {
  const pool = segments
    .filter((s) => s.length >= 2)
    .map((s) => [s[0]!, s[s.length - 1]!] as [Point, Point]);
  const lines: Point[][] = [];
  while (pool.length > 0) {
    const [first, second] = pool.shift()!;
    const line: Point[] = [first, second];
    for (let grown = true; grown;) {
      grown = false;
      const tail = line[line.length - 1]!;
      if (same(tail, line[0]!) && line.length > 2) break;
      for (let k = 0; k < pool.length; k++) {
        const [a, b] = pool[k]!;
        if (same(a, tail)) line.push(b);
        else if (same(b, tail)) line.push(a);
        else continue;
        pool.splice(k, 1);
        grown = true;
        break;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Obrysy všech stávajících objektů vsi seskupené podle druhu (prázdné druhy se vynechají). */
export function existingOutlines(village: SceneVillage): OutlineGroup[] {
  const targets: [OutlineKind, VillageTarget][] = [
    ...village.fields.map((f): [OutlineKind, VillageTarget] => [
      'field',
      { kind: 'field', id: f.id },
    ]),
    ...(village.orchards ?? []).map((o): [OutlineKind, VillageTarget] => [
      'orchard',
      { kind: 'orchard', id: o.id },
    ]),
    ...(village.cemeteries ?? []).map((c): [OutlineKind, VillageTarget] => [
      'cemetery',
      { kind: 'cemetery', id: c.id },
    ]),
    ...village.dwellings.map((d): [OutlineKind, VillageTarget] => [
      'dwelling',
      { kind: 'dwelling', id: d.id },
    ]),
    ...(village.sacred?.buildings ?? []).map((b): [OutlineKind, VillageTarget] => [
      'sacred',
      { kind: 'sacred', id: b.id },
    ]),
    ...(village.sacred?.oaks ?? []).map((o): [OutlineKind, VillageTarget] => [
      'sacred',
      { kind: 'sacred-oak', id: o.id },
    ]),
    ...(village.sacred?.groves ?? []).map((g): [OutlineKind, VillageTarget] => [
      'sacred',
      { kind: 'grove', id: g.id },
    ]),
  ];
  const byKind = new Map<OutlineKind, Point[][]>();
  for (const [kind, target] of targets) {
    const raw = targetOutline(village, target);
    // Mez ze čtverců (pole, sad, hřbitov, háj, pozemek polozemnice) jsou úsečky – spojit do čar;
    // rámeček obydlí a kruh dubu už jsou celé čáry.
    const lines = raw.length > 0 && raw.every((l) => l.length === 2) ? chainSegments(raw) : raw;
    if (lines.length === 0) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), ...lines]);
  }
  return [...byKind].map(([kind, lines]) => ({ kind, lines }));
}
