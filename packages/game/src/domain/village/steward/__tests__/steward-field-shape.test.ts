import { describe, expect, it } from 'vitest';
import { connectedPick } from '../steward';

// Pole spíš čtvercová (oxen.md – Orba rádlem křížem; Martin 14. 11. 2026: „Dokud Slované neměli
// těžký pluh, orali spíš čtvercová pole a křížem.“) – správce zakládá pole v co nejčtvercovějších
// blocích, ne v pásech.

const SIZE = 40;
const tile = (x: number, y: number): number => y * SIZE + x;

/** Dřívější výběr: vždy první další políčko v pořadí, které sousedí s vybranými. */
function stripPick(ordered: readonly number[], want: number): number[] {
  const chosen = new Set<number>();
  const cells: number[] = [];
  const pending = [...ordered];
  while (cells.length < want) {
    const k = pending.findIndex(
      (t) =>
        cells.length === 0 ||
        (t % SIZE > 0 && chosen.has(t - 1)) ||
        (t % SIZE < SIZE - 1 && chosen.has(t + 1)) ||
        chosen.has(t - SIZE) ||
        chosen.has(t + SIZE),
    );
    if (k < 0) break;
    chosen.add(pending[k]!);
    cells.push(pending[k]!);
    pending.splice(k, 1);
  }
  return cells;
}

/** Poměr stran obalu bloku (delší ku kratší, 1 = čtverec). */
function aspect(cells: readonly number[]): number {
  const xs = cells.map((t) => t % SIZE);
  const ys = cells.map((t) => Math.floor(t / SIZE));
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  return Math.max(w, h) / Math.min(w, h);
}

/** Je blok souvislý (stranou) – i každý jeho začátek? */
function connectedPrefixes(cells: readonly number[]): boolean {
  return cells.every((t, i) => {
    if (i === 0) return true;
    const before = new Set(cells.slice(0, i));
    return [t - 1, t + 1, t - SIZE, t + SIZE].some((n) => before.has(n));
  });
}

/** Políčka čtverce 12 × 12 seřazená podle vzdálenosti od domu daleko na západě (pás podél domu). */
function fromWest(): number[] {
  const cells: [number, number, number][] = [];
  for (let y = 10; y < 22; y++) {
    for (let x = 10; x < 22; x++) {
      const d2 = (x + 30) * (x + 30) + (y - 16) * (y - 16);
      cells.push([d2, y, x]);
    }
  }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  return cells.map(([, y, x]) => tile(x, y));
}

const free = new Float32Array(SIZE * SIZE);

describe('správce – nové pole spíš čtvercové', () => {
  it('stejná plocha, poměr stran blíž 1 než dřív (pás podél domu)', () => {
    const ordered = fromWest();
    for (const want of [6, 9, 12, 16, 25]) {
      const before = stripPick(ordered, want);
      const now = connectedPick(ordered, SIZE, want, Infinity, free).cells;
      expect(now).toHaveLength(want);
      expect(before).toHaveLength(want);
      expect(aspect(before)).toBeGreaterThanOrEqual(2);
      expect(aspect(now)).toBeLessThan(aspect(before));
      expect(aspect(now)).toBeLessThanOrEqual(1.5);
      // začíná políčkem s největší předností a roste souvisle
      expect(now[0]).toBe(ordered[0]);
      expect(connectedPrefixes(now)).toBe(true);
    }
  });

  it('úplný čtverec, kde se vejde; v úzkém místě co nejméně protáhlý', () => {
    const ordered = fromWest();
    const square = connectedPick(ordered, SIZE, 9, Infinity, free).cells;
    expect(aspect(square)).toBe(1);
    // jen dva sloupce volné (pás 2 × 12) – blok 2 × 4, ne celý pás
    const narrow = ordered.filter((t) => t % SIZE < 12);
    const block = connectedPick(narrow, SIZE, 8, Infinity, free).cells;
    expect(aspect(block)).toBe(2);
  });

  it('cena založení: blok nepřesáhne rozpočet a nese jeho součet', () => {
    const ordered = fromWest();
    const found = new Float32Array(SIZE * SIZE).fill(10);
    const pick = connectedPick(ordered, SIZE, 16, 95, found);
    expect(pick.cells).toHaveLength(9);
    expect(pick.foundMd).toBe(90);
    expect(aspect(pick.cells)).toBe(1);
  });
});
