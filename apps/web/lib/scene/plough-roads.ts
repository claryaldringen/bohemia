// Brázdy končí na cestě (oxen.md – Co nejdelší brázda, Brázdy končí na cestě; Martin, 19. 10.
// 2026: „pokud oráč narazí na cestu, tak spřežení otočí“): řady pruhu orby přes pás pevné cesty
// se na něm lámou – spřežení zorá kus po kus, na cestě se otočí stejným obloukem jako na
// souvrati a přes cestu neorá. Pás cesty a plácky rozcestí jsou stejné jako plocha, kterou cesty
// vezmou polím v herním jádru (`roadCapsules` – `roadLand`). Kousek pole oddělený cestou
// (`SceneFieldPart.roadCut` – road-cut-mask.ts) zůstal loukou a neorá se. Čisté funkce bez
// Babylonu, souřadnice světa.
import { roadCapsules, roadFreeRuns, type RoadCapsule } from '@bohemia/game';
import type { SceneFieldPart, SceneVillage } from '../village-view';
import { stintRowCount, type PloughField } from './plough-team';
import { roadCutMask } from './road-cut-mask';

/** Kratší kus řady mezi cestami (m) se neorá – jako v herním jádru (`bandFurrowM`). */
export const MIN_ROW_PIECE_M = 2;

/**
 * Jak velkou částí kratšího z úseků (podél řad) se úsek musí překrývat s úsekem předchozí řady,
 * aby patřil do stejného kusu.
 */
const PIECE_OVERLAP = 0.5;

/** Pásy pevných cest vsi a plácky rozcestí (jako `roadLand` v jádru). */
export function villageRoadCapsules(village: Pick<SceneVillage, 'roads'>): RoadCapsule[] {
  return roadCapsules(village.roads ?? []);
}

/** Úsek řady podél řad (m od středu pruhu). */
interface Run {
  from: number;
  to: number;
}

/** Úsek řady s brázdou až k cestě po celé šířce řady (`fillLo`–`fillHi`). */
interface FilledRun extends Run {
  fillLo: number;
  fillHi: number;
}

/**
 * Pruh orby rozdělený pevnými cestami na kusy, které spřežení orá zvlášť (každý s vlastními
 * obraty – na cestě se otočí): u každé řady (`stintRowCount`) úseky mimo pásy cest
 * (`roadFreeRuns`, kratší než MIN_ROW_PIECE_M vynechané) a mimo kousky oddělené cestou
 * (`roadCut` dílů `parts` – střed úseku), úseky sousedních řad, které se podél řad překrývají
 * (aspoň PIECE_OVERLAP kratšího), tvoří jeden kus. Kus nese `rowRuns`; kusy v pořadí první řady a podél řad. Pruh, přes který
 * žádná cesta nevede, zůstane, jak je (jeden kus bez `rowRuns`); pruh celý pod cestou nemá kus.
 */
export function roadPieces(
  field: PloughField,
  capsules: readonly RoadCapsule[],
  parts: readonly SceneFieldPart[] = [],
): PloughField[] {
  const cut = roadCutMask(parts);
  const from = field.from ?? -field.size / 2;
  const to = field.to ?? field.size / 2;
  const half = (field.length ?? field.size) / 2;
  // jen cesty u pruhu (obal kolem středu)
  const reach = Math.hypot(half, Math.max(Math.abs(from), Math.abs(to)));
  const near = capsules.filter(
    (c) =>
      Math.min(c.ax, c.bx) - c.r <= field.x + reach &&
      Math.max(c.ax, c.bx) + c.r >= field.x - reach &&
      Math.min(c.az, c.bz) - c.r <= field.z + reach &&
      Math.max(c.az, c.bz) + c.r >= field.z - reach,
  );
  if (near.length === 0 && !cut) return [field];
  const rows = stintRowCount(field);
  const len = Math.hypot(field.dirX, field.dirZ) || 1;
  const dx = field.dirX / len;
  const dz = field.dirZ / len;
  const across = Math.hypot(field.acrossX ?? 0, field.acrossZ ?? 0);
  const sx = across > 1e-9 ? field.acrossX! / across : -dz;
  const sz = across > 1e-9 ? field.acrossZ! / across : dx;
  const spacing = (to - from) / rows;
  /** Úseky přímky napříč ve vzdálenosti `o` mimo pásy cest. */
  const free = (o: number): Run[] =>
    roadFreeRuns(near, field.x + sx * o, field.z + sz * o, dx, dz, -half, half);
  let broken = false;
  const runsByRow: FilledRun[][] = [];
  for (let k = 0; k < rows; k++) {
    const o = from + (k + 0.5) * spacing;
    const raw = free(o);
    const kept = raw.filter(
      (r) =>
        r.to - r.from >= MIN_ROW_PIECE_M &&
        (!cut ||
          cut(
            field.x + sx * o + (dx * (r.from + r.to)) / 2,
            field.z + sz * o + (dz * (r.from + r.to)) / 2,
          ) >= 0.5),
    );
    // brázda řady sahá po celé šířce řady až k cestě (osa řady narazí na cestu dřív než jeden
    // její okraj, když cesta řadu kříží šikmo) – úseky okrajů, které se s úsekem osy překrývají,
    // nejvýš k cestě na ose (k sousednímu úseku osy se nesahá); jinak by u šikmé cesty zůstaly
    // nezorané klínky, které by se druhý den samy zoraly
    const edges = [...free(o - spacing / 2), ...free(o + spacing / 2)];
    const runs = kept.map((r): FilledRun => {
      const i = raw.indexOf(r);
      const lo = i > 0 ? raw[i - 1]!.to : -half;
      const hi = i < raw.length - 1 ? raw[i + 1]!.from : half;
      let fillLo = r.from;
      let fillHi = r.to;
      for (const e of edges) {
        if (e.from >= r.to || r.from >= e.to) continue;
        fillLo = Math.min(fillLo, Math.max(lo, e.from));
        fillHi = Math.max(fillHi, Math.min(hi, e.to));
      }
      return { ...r, fillLo, fillHi };
    });
    if (runs.length !== 1 || runs[0]!.from > -half + 1e-9 || runs[0]!.to < half - 1e-9) {
      broken = true;
    }
    runsByRow.push(runs);
  }
  if (!broken) return [field];
  // kusy: úsek navazuje na úsek předchozí řady, se kterým se podél řad překrývá
  const pieces: { runs: (FilledRun | null)[]; last: Run; row: number }[] = [];
  // aspoň polovinou kratšího z nich – jinak by spřežení mezi řadami přejíždělo přes cestu
  const joins = (a: Run, b: Run): boolean =>
    Math.min(a.to, b.to) - Math.max(a.from, b.from) >=
    Math.min(a.to - a.from, b.to - b.from) * PIECE_OVERLAP;
  runsByRow.forEach((runs, k) => {
    for (const run of runs) {
      const piece = pieces.find((p) => p.row === k - 1 && joins(p.last, run));
      if (piece) {
        piece.runs[k] = run;
        piece.last = run;
        piece.row = k;
      } else {
        const list: (FilledRun | null)[] = Array.from({ length: rows }, () => null);
        list[k] = run;
        pieces.push({ runs: list, last: run, row: k });
      }
    }
  });
  return pieces.map((piece) => ({
    ...field,
    rows,
    rowRuns: piece.runs.map((r) =>
      r ? { lo: r.from, hi: r.to, fillLo: r.fillLo, fillHi: r.fillHi } : null,
    ),
  }));
}

/** Celková délka řad kusu (m) – kus, na kterém spřežení orá nejdéle. */
export function pieceLength(field: PloughField): number {
  if (!field.rowRuns) return stintRowCount(field) * (field.length ?? field.size);
  return field.rowRuns.reduce((sum, r) => sum + (r ? r.hi - r.lo : 0), 0);
}
