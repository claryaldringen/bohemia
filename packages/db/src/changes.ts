import { sql } from 'drizzle-orm';
import type { Executor } from './client';

// Oznámení změn v databázi (plán 2026-11-15 – události ze serveru, Rozhodnutí 2; docs/code/server-events.md –
// Oznámení v databázi): jeden kanál, druh změny v klíči `k`. Většinu nákladů posílají triggery
// (migrace 0053), tvar `x` (průběh přeskoku času) posílá web přes `notifyChange`.

/** Kanál `LISTEN` / `NOTIFY`. */
export const CHANGE_CHANNEL = 'bohemia_change';

/** Políčko světa `[x, y]`. */
export type Cell = [number, number];

/**
 * Změna v databázi. `big` = náklad se nevešel do 8000 B, `c` a `a` jsou prázdné a platí jako
 * „všechna spojení s políčkem / vsí“.
 */
export type DbChange =
  /** Ves vložena, nebo změněna `version`, `name`, `settlement_id`; `p` = vlastník sídla. */
  | { k: 'v'; id: string; ver: number; p: string | null }
  /** Sídlo vloženo, změněn `owner_id` nebo `archived_at`; `p` nový vlastník, `op` starý. */
  | { k: 's'; p: string; op: string | null }
  /** Vloženo upozornění hráči `p`. */
  | { k: 'n'; p: string }
  /** Bod výpravy; `t` = takt (null u změny `status`), `c` = dotčená políčka. */
  | { k: 'j'; id: string; t: number | null; p: string; c: Cell[]; big: boolean }
  /** Bod tažení; `c` = dotčená políčka, `a` = varované vsi a cíl. */
  | { k: 'c'; id: string; t: number | null; c: Cell[]; a: string[]; big: boolean }
  /** Průběh přeskoku času hráče `p` (posílá web). */
  | { k: 'x'; p: string; progress: { doneDays: number; totalDays: number } | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function cellsOf(value: unknown): Cell[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const cells: Cell[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || !isNumber(item[0]) || !isNumber(item[1])) {
      return null;
    }
    cells.push([item[0], item[1]]);
  }
  return cells;
}

function stringsOf(value: unknown): string[] | null {
  if (value === undefined) return [];
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function ticksOf(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return isNumber(value) ? value : undefined;
}

/** Náklad `NOTIFY` jako změna; neznámý druh nebo vadný tvar = null. */
export function parseChange(text: string): DbChange | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const big = raw.big === true;
  switch (raw.k) {
    case 'v':
      if (!isString(raw.id) || !isNumber(raw.ver)) return null;
      if (raw.p !== null && !isString(raw.p)) return null;
      return { k: 'v', id: raw.id, ver: raw.ver, p: raw.p };
    case 's':
      if (!isString(raw.p)) return null;
      if (raw.op !== null && raw.op !== undefined && !isString(raw.op)) return null;
      return { k: 's', p: raw.p, op: raw.op ?? null };
    case 'n':
      return isString(raw.p) ? { k: 'n', p: raw.p } : null;
    case 'j': {
      const t = ticksOf(raw.t);
      const c = cellsOf(raw.c);
      if (!isString(raw.id) || !isString(raw.p) || t === undefined || !c) return null;
      return { k: 'j', id: raw.id, t, p: raw.p, c, big };
    }
    case 'c': {
      const t = ticksOf(raw.t);
      const c = cellsOf(raw.c);
      const a = stringsOf(raw.a);
      if (!isString(raw.id) || t === undefined || !c || !a) return null;
      return { k: 'c', id: raw.id, t, c, a, big };
    }
    case 'x': {
      if (!isString(raw.p)) return null;
      const progress = raw.progress ?? null;
      if (progress === null) return { k: 'x', p: raw.p, progress: null };
      if (!isRecord(progress) || !isNumber(progress.doneDays) || !isNumber(progress.totalDays)) {
        return null;
      }
      return {
        k: 'x',
        p: raw.p,
        progress: { doneDays: progress.doneDays, totalDays: progress.totalDays },
      };
    }
    default:
      return null;
  }
}

/** Pošle změnu na kanál (`pg_notify`); v transakci se doručí až po commitu. */
export async function notifyChange(db: Executor, change: DbChange): Promise<void> {
  await db.execute(sql`SELECT pg_notify(${CHANGE_CHANNEL}, ${JSON.stringify(change)})`);
}
