import type { WallKind } from '../types';
import type { FortBuildWork } from './types';

// Běžící stavby na dílech opevnění (Martin 8. 11. 2026 – „B“: každý úsek zvlášť, na jednom
// opevnění smí běžet víc staveb najednou, jedna stavba na díl). Stavba pracuje na dílech svého
// `fortSegments`; stavba nového opevnění (`build`) a stavby bez seznamu dílů na celém obvodu.

/** Práce stavby na dílu: co dělá a cílová hradba (`Construction.fortTarget`; chybí – null). */
export interface FortSegmentRun {
  work: FortBuildWork;
  target: WallKind | null;
}

/**
 * Práce běžících staveb po celých dílech (`byIndex`), po kusech dílů s branou (`byPart` – klíč
 * `partKey`) a práce na celém obvodu (`all`), jinak null.
 */
export interface FortRuns {
  byIndex: ReadonlyMap<number, FortSegmentRun>;
  byPart: ReadonlyMap<string, FortSegmentRun>;
  all: FortSegmentRun | null;
}

/** Klíč kusu dílu s branou v `FortRuns.byPart`. */
export function partKey(index: number, part: 'before' | 'after'): string {
  return `${index}:${part}`;
}

/** Stavba ve vsi, jak ji zná `fortRuns` (`Construction`). */
export interface FortRunRef {
  readonly kind?: string;
  readonly fortificationId?: number;
  readonly fortWork?: FortBuildWork;
  readonly fortTarget?: WallKind;
  readonly fortSegments?: readonly { readonly index: number; readonly part?: 'before' | 'after' }[];
}

/**
 * Práce staveb, které na opevnění `id` běží – po dílech z `fortSegments`, kus dílu s branou
 * (`part`) zvlášť. Stavba nového opevnění (`build`, starší stavby bez údaje) a stavba bez seznamu
 * dílů pracuje na celém obvodu. Bez stavby null.
 */
export function fortRuns(constructions: readonly FortRunRef[], id: number): FortRuns | null {
  const byIndex = new Map<number, FortSegmentRun>();
  const byPart = new Map<string, FortSegmentRun>();
  let all: FortSegmentRun | null = null;
  let any = false;
  for (const c of constructions) {
    if (c.fortificationId !== id || (c.kind !== undefined && c.kind !== 'fortification')) continue;
    any = true;
    const run: FortSegmentRun = { work: c.fortWork ?? 'build', target: c.fortTarget ?? null };
    if (run.work === 'build' || !c.fortSegments) all ??= run;
    for (const w of c.fortSegments ?? []) {
      if (w.part === undefined) {
        if (!byIndex.has(w.index)) byIndex.set(w.index, run);
        continue;
      }
      const key = partKey(w.index, w.part);
      if (!byPart.has(key)) byPart.set(key, run);
    }
  }
  return any ? { byIndex, byPart, all } : null;
}

/**
 * Práce na dílu `index` (s `part` na kusu dílu s branou – práce kusu, jinak celého dílu):
 * `FortRuns` po dílech, nebo jedna práce `FortBuildWork` pro celý obvod (starší volání a testy),
 * bez stavby null.
 */
export function runOn(
  work: FortBuildWork | FortRuns | null,
  index: number,
  part?: 'before' | 'after',
): FortSegmentRun | null {
  if (work === null) return null;
  if (typeof work === 'string') return { work, target: null };
  const own = part === undefined ? undefined : work.byPart.get(partKey(index, part));
  return own ?? work.byIndex.get(index) ?? work.all;
}

/**
 * Hradba, kterou práce na dílu staví: `fortTarget`, starší vylepšení (`upgrade` bez cíle) palisádu;
 * jinak null (stavba, nástavba bez cíle, přestavba, obnova, zboření).
 */
export function runTarget(run: FortSegmentRun | null): WallKind | null {
  if (run === null) return null;
  if (run.target !== null) return run.work === 'upgrade' || run.work === 'top' ? run.target : null;
  return run.work === 'upgrade' ? 'palisade' : null;
}

/**
 * Díly, na kterých (i na kusu u brány) běží některá stavba opevnění `id` (celý obvod – všechny
 * díly `indices`).
 */
export function busySegments(
  constructions: readonly FortRunRef[],
  id: number,
  indices: readonly number[],
): Set<number> {
  const runs = fortRuns(constructions, id);
  if (!runs) return new Set();
  if (runs.all) return new Set(indices);
  const busy = new Set(runs.byIndex.keys());
  for (const key of runs.byPart.keys()) busy.add(Number(key.split(':')[0]));
  return busy;
}

/**
 * Srazí se práce na kusu `index` (`part` – kus dílu s branou, chybí – celý díl) s běžící stavbou
 * opevnění `id`? Celý díl se srazí s každou prací na dílu, kus dílu jen s prací na celém dílu nebo
 * na tomtéž kusu – úseky po obou stranách brány se tak staví nezávisle (Martin 8. 11. 2026 – „B“).
 */
export function pieceBusy(
  constructions: readonly FortRunRef[],
  id: number,
): (index: number, part?: 'before' | 'after') => boolean {
  const runs = fortRuns(constructions, id);
  if (!runs) return () => false;
  if (runs.all) return () => true;
  return (index, part) => {
    if (runs.byIndex.has(index)) return true;
    if (part !== undefined) return runs.byPart.has(partKey(index, part));
    return runs.byPart.has(partKey(index, 'before')) || runs.byPart.has(partKey(index, 'after'));
  };
}
