/**
 * Instance trsů, panáků a plevele polí (field-renderer.ts) – čisté funkce bez Babylonu: pořadí
 * podle `rank` (z dálky se kreslí jen první část – trsy řídnou rovnoměrně) a obal instancí.
 * Pole Vlkova má statisíce trsů a přestavují se s každou novou sítí pěšin, proto rychle.
 */

/**
 * Seřadí podle `rank` vzestupně – stabilně (stejný `rank` v pořadí vstupu), přesně jako
 * `[...items].sort((a, b) => a.rank - b.rank)`, jen bez porovnávací funkce nad celým polem:
 * rozdělení do přihrádek podle `rank` ∈ [0, 1) a uvnitř přihrádky vkládáním (v průměru jeden
 * prvek na přihrádku). Mimo [0, 1) obyčejné řazení.
 */
export function sortByRank<T extends { rank: number }>(items: readonly T[]): T[] {
  const n = items.length;
  if (n < 64) return [...items].sort((a, b) => a.rank - b.rank);
  const bins = new Uint32Array(n);
  const starts = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const rank = items[i]!.rank;
    if (!(rank >= 0 && rank < 1)) return [...items].sort((a, b) => a.rank - b.rank);
    // násobení i zaokrouhlení dolů jsou monotónní – pořadí přihrádek drží pořadí `rank`
    const bin = Math.min(n - 1, Math.floor(rank * n));
    bins[i] = bin;
    starts[bin + 1]!++;
  }
  for (let b = 0; b < n; b++) starts[b + 1]! += starts[b]!;
  const next = starts.slice(0, n);
  const out = new Array<T>(n);
  for (let i = 0; i < n; i++) out[next[bins[i]!]!++] = items[i]!;
  for (let b = 0; b < n; b++) {
    const end = starts[b + 1]!;
    // vkládání – posouvá jen větší `rank`, stejné nechá v pořadí vstupu (stabilní)
    for (let i = starts[b]! + 1; i < end; i++) {
      const item = out[i]!;
      let j = i - 1;
      while (j >= starts[b]! && out[j]!.rank > item.rank) {
        out[j + 1] = out[j]!;
        j--;
      }
      out[j + 1] = item;
    }
  }
  return out;
}

/**
 * Obal prvních `count` instancí (matice po 16 číslech jako v Babylonu) modelu s obalem
 * `min`–`max`: totéž, co `thinInstanceRefreshBoundingInfo` Babylonu (osm rohů obalu každou
 * maticí), bez rohů – minimum součtu po složkách je součet minim, a protože sčítání v plovoucí
 * čárce je monotónní, vyjde bit po bitu stejně. Matice musí být afinní (poslední sloupec 0, 0, 0,
 * 1). Vrátí [minX, minY, minZ, maxX, maxY, maxZ].
 */
export function instancesBounds(
  matrices: ArrayLike<number>,
  count: number,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): [number, number, number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < count; i++) {
    const o = i * 16;
    // složka a výsledku = x·m[a] + y·m[4 + a] + z·m[8 + a] + m[12 + a] (pořadí sčítání Babylonu)
    for (let a = 0; a < 3; a++) {
      const ax = min[0] * matrices[o + a]!;
      const bx = max[0] * matrices[o + a]!;
      const ay = min[1] * matrices[o + 4 + a]!;
      const by = max[1] * matrices[o + 4 + a]!;
      const az = min[2] * matrices[o + 8 + a]!;
      const bz = max[2] * matrices[o + 8 + a]!;
      const t = matrices[o + 12 + a]!;
      const low = (ax < bx ? ax : bx) + (ay < by ? ay : by) + (az < bz ? az : bz) + t;
      const high = (ax > bx ? ax : bx) + (ay > by ? ay : by) + (az > bz ? az : bz) + t;
      if (a === 0) {
        if (low < x0) x0 = low;
        if (high > x1) x1 = high;
      } else if (a === 1) {
        if (low < y0) y0 = low;
        if (high > y1) y1 = high;
      } else {
        if (low < z0) z0 = low;
        if (high > z1) z1 = high;
      }
    }
  }
  return [x0, y0, z0, x1, y1, z1];
}

/** Jsou obě pole stejné prvky ve stejném pořadí (podle identity)? */
export function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
