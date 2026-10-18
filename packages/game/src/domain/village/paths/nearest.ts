// Nejbližší díl k bodu přes mřížku přihrádek (síť pěšin – cena buňky pole podle nejbližšího
// dílu). Výsledek je bit po bitu stejný jako průchod všemi díly: stejná vzdálenost (součet
// absolutních rozdílů středů), při shodě první díl v poli. Jen přesné operace (síť počítá
// server i prohlížeč).

/** Vrátí nejbližší díl k bodu (x, z) – jako `nearestByScan`, jen rychleji. */
export type NearestPart<T> = (x: number, z: number) => T;

/** Průchod všemi díly: nejmenší |Δx| + |Δz|, při shodě první v poli; bez dílu `parts[0]`. */
export function nearestByScan<T extends { x: number; z: number }>(
  parts: readonly T[],
  x: number,
  z: number,
): T {
  let best = parts[0]!;
  let bestD = Infinity;
  for (const p of parts) {
    const d = Math.abs(p.x - x) + Math.abs(p.z - z);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Rezerva na zaokrouhlení při zařazení do přihrádky (podíl přihrádky). */
const BUCKET_SLACK = 1e-9;

/**
 * Hledání nejbližšího dílu přes přihrádky o straně `bucketM` (např. strana políčka): přihrádky
 * se procházejí po prstencích kolem bodu, dokud žádný neprošlý díl nemůže být blíž (ani stejně
 * blízko). Díly mimo konečná čísla, nekladná přihrádka nebo bod mimo konečná čísla – průchod
 * všemi díly.
 */
export function nearestPartFinder<T extends { x: number; z: number }>(
  parts: readonly T[],
  bucketM: number,
): NearestPart<T> {
  const scan: NearestPart<T> = (x, z) => nearestByScan(parts, x, z);
  if (parts.length < 16 || !(bucketM > 0) || !Number.isFinite(bucketM)) return scan;
  let minI = Infinity;
  let minJ = Infinity;
  let maxI = -Infinity;
  let maxJ = -Infinity;
  const bi = new Float64Array(parts.length);
  const bj = new Float64Array(parts.length);
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return scan;
    const i = Math.floor(p.x / bucketM);
    const j = Math.floor(p.z / bucketM);
    bi[k] = i;
    bj[k] = j;
    if (i < minI) minI = i;
    if (i > maxI) maxI = i;
    if (j < minJ) minJ = j;
    if (j > maxJ) maxJ = j;
  }
  const width = maxI - minI + 1;
  const buckets = new Map<number, number[]>();
  for (let k = 0; k < parts.length; k++) {
    const key = (bj[k]! - minJ) * width + (bi[k]! - minI);
    const list = buckets.get(key);
    if (list) list.push(k);
    else buckets.set(key, [k]);
  }
  const slack = bucketM * BUCKET_SLACK;
  return (x, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return scan(x, z);
    const qi = Math.floor(x / bucketM);
    const qj = Math.floor(z / bucketM);
    let best = -1;
    let bestD = Infinity;
    const visit = (i: number, j: number): void => {
      if (i < minI || i > maxI || j < minJ || j > maxJ) return;
      const list = buckets.get((j - minJ) * width + (i - minI));
      if (!list) return;
      for (const k of list) {
        const p = parts[k]!;
        const d = Math.abs(p.x - x) + Math.abs(p.z - z);
        if (d < bestD || (d === bestD && k < best)) {
          best = k;
          bestD = d;
        }
      }
    };
    for (let r = 0; ; r++) {
      if (r === 0) visit(qi, qj);
      else {
        for (let i = qi - r; i <= qi + r; i++) {
          visit(i, qj - r);
          visit(i, qj + r);
        }
        for (let j = qj - r + 1; j <= qj + r - 1; j++) {
          visit(qi - r, j);
          visit(qi + r, j);
        }
      }
      // prošlé přihrádky: |i − qi| ≤ r a |j − qj| ≤ r; díl mimo ně je od bodu dál než `gap`
      // aspoň v jedné ose (bez rezervy na zaokrouhlení)
      const gap = Math.min(
        x - (qi - r) * bucketM,
        (qi + r + 1) * bucketM - x,
        z - (qj - r) * bucketM,
        (qj + r + 1) * bucketM - z,
      );
      if (best >= 0 && bestD < gap - slack) break;
      if (qi - r <= minI && qi + r >= maxI && qj - r <= minJ && qj + r >= maxJ) break;
    }
    return best >= 0 ? parts[best]! : parts[0]!;
  };
}
