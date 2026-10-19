import { ROAD_LAND, roadCutAt, rotationCosSin } from '@bohemia/game';
import type { SceneFieldPart } from '../village-view';

// Kousky pole oddělené cestou (roads.md a fields.md – Cesta přes pole; Martin, 19. 10. 2026:
// „pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout takový růžek…“):
// jádro je zapíše do dílu po buňkách (`SceneFieldPart.roadCut`, ROAD_LAND.cells × cells na
// čtverec) – tam zůstala louka. Maska pro krytí pole: na oddělené buňce 0, jinde 1, mezi středy
// buněk plynule (okraj ≈ půl buňky). Pás cesty samotný maskuje track-mask.ts. Čistý modul bez
// Babylonu, souřadnice světa.

/**
 * Maska oddělených kousků dílů `parts` (násobek krytí v bodě světa); bez oddělených kousků null.
 */
export function roadCutMask(
  parts: readonly SceneFieldPart[],
): ((x: number, z: number) => number) | null {
  const cut = parts.filter((p) => p.roadCut !== undefined);
  if (cut.length === 0) return null;
  const n = ROAD_LAND.cells;
  const squares = cut.map((p) => {
    const [c, s] = rotationCosSin(p.rotation ?? 0);
    return { part: p, c, s, half: p.size / 2, step: p.size / n };
  });
  /** 1, když buňka (a, b) není oddělená – mimo čtverec podle nejbližší buňky v něm. */
  const kept = (rows: readonly number[], a: number, b: number): number =>
    roadCutAt(rows, Math.min(n - 1, Math.max(0, a)), Math.min(n - 1, Math.max(0, b))) ? 0 : 1;
  return (x, z) => {
    for (const { part, c, s, half, step } of squares) {
      const dx = x - part.x;
      const dz = z - part.z;
      // místní souřadnice čtverce (inverze natočení – jako worldToSquareLocal)
      const lu = dx * c - dz * s;
      const lv = dx * s + dz * c;
      if (lu < -half || lu > half || lv < -half || lv > half) continue;
      const fa = (lu + half) / step - 0.5;
      const fb = (lv + half) / step - 0.5;
      const a = Math.floor(fa);
      const b = Math.floor(fb);
      const u = fa - a;
      const v = fb - b;
      const rows = part.roadCut!;
      return (
        kept(rows, a, b) * (1 - u) * (1 - v) +
        kept(rows, a + 1, b) * u * (1 - v) +
        kept(rows, a, b + 1) * (1 - u) * v +
        kept(rows, a + 1, b + 1) * u * v
      );
    }
    return 1;
  };
}

/** Klíč oddělených kousků dílů – blok pole se přestaví, jen když se změní. */
export function roadCutKey(parts: readonly SceneFieldPart[]): string {
  return parts
    .filter((p) => p.roadCut !== undefined)
    .map((p) => `${p.cell.x},${p.cell.y}:${p.roadCut!.join('.')}`)
    .join('|');
}
