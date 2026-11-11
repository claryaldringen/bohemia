import { distanceFactor, partWalkDistance } from '../fields/fields';
import { FURROW } from '../rules';
import type { FieldPart, PloughBand } from '../types';

// Co nejdelší brázda (oxen.md – Co nejdelší brázda; Martin, 19. 10. 2026: „Volské spřežení chce
// rýt co nejdelší brázdu – otáčení zabírá čas a snižuje produktivitu.“ a „Spřežení by mělo trávit
// co nejvíce času orbou … Rozhodně nepřejíždí z dílce na dílec, ale snaží se zorat co největší
// souvislou plochu.“). Spřežení orá plodinu po souvislých blocích dílů: blok jsou díly orby
// jednoho pole, které spolu sousedí stranou; každý blok se orá v ose (mřížky pole), ve které jsou
// jeho brázdy v průměru delší (Martin: „oře jen v ose východ – západ, i když u spousty polí by
// byla výhodnější sever – jih“), a pás je souvislá řada dílů bloku v tomto směru – brázda vede
// přes celý pás. Blok se zorá celý, pás po pásu od strany blíž vsi, než spřežení přejde
// k dalšímu bloku; bloky jdou od nejbližšího. Čisté funkce bez stavu vsi.

/** Délka strany dílu podél brázdy (m) – díl je čtverec (zmenšený díl úměrně ploše). */
function partLengthM(part: Pick<FieldPart, 'areaM2'>): number {
  return Math.sqrt(part.areaM2);
}

/**
 * Výkon orby podle délky brázdy (podíl výkonu u referenční brázdy FURROW.referenceM): každý obrat
 * na souvrati stojí FURROW.turnS s, voli jdou FURROW.speedMps – podíl času, kdy rádlo ryje, je
 * L / (L + v·t). Krátké brázdy (jeden díl 15 m) ≈ 0,44, dlouhé až FURROW.maxGain.
 */
export function furrowEfficiency(lengthM: number): number {
  const turnM = FURROW.speedMps * FURROW.turnS;
  const share = (length: number): number => length / (length + turnM);
  return Math.min(FURROW.maxGain, share(Math.max(1, lengthM)) / share(FURROW.referenceM));
}

/** Délka brázdy pásu (m) – součet délek jeho dílů podél brázdy. */
export function bandLengthM(
  band: Pick<PloughBand, 'partIds'>,
  partsById: ReadonlyMap<number, Pick<FieldPart, 'areaM2'>>,
): number {
  return band.partIds.reduce((sum, id) => {
    const part = partsById.get(id);
    return sum + (part ? partLengthM(part) : 0);
  }, 0);
}

/**
 * Průměrná délka brázdy čtverců v ose (v čtvercích, vážená plochou – Σ délka² / Σ délka):
 * souvislé úseky čtverců podél osy.
 */
function meanRun(cells: readonly { x: number; y: number }[], axis: 'x' | 'y'): number {
  const along = (c: { x: number; y: number }): number => (axis === 'x' ? c.x : c.y);
  const across = (c: { x: number; y: number }): number => (axis === 'x' ? c.y : c.x);
  const lines = new Map<number, number[]>();
  for (const c of cells) {
    const list = lines.get(across(c));
    if (list) list.push(along(c));
    else lines.set(across(c), [along(c)]);
  }
  let sum = 0;
  let squares = 0;
  for (const list of lines.values()) {
    list.sort((a, b) => a - b);
    let run = 1;
    for (let i = 1; i <= list.length; i++) {
      if (i < list.length && list[i] === list[i - 1]! + 1) {
        run++;
        continue;
      }
      sum += run * run;
      squares += run;
      run = 1;
    }
  }
  return squares > 0 ? sum / squares : 0;
}

/**
 * Osa brázd souvislých čtverců (bloku orby, v mřížce pole): ta, ve které jsou brázdy v průměru
 * delší (`meanRun` – víc orby mezi obraty, co nejdelší brázda); při shodě podél delší rozlohy,
 * pak podél x.
 */
export function furrowAxis(parts: readonly Pick<FieldPart, 'cell'>[]): 'x' | 'y' {
  const cells = parts.flatMap((p) => (p.cell ? [p.cell] : []));
  if (cells.length === 0) return 'x';
  const runX = meanRun(cells, 'x');
  const runY = meanRun(cells, 'y');
  if (Math.abs(runX - runY) > 1e-9) return runX > runY ? 'x' : 'y';
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y';
}

/** Rozvržení orby plodiny: díly v pořadí orby a pásy (souvislé řady dílů, které se orají spolu). */
export interface PloughLayout {
  order: FieldPart[];
  bands: PloughBand[];
}

/**
 * Rozvrží orbu dílů `selected` (díly jedné plodiny): bloky podle polí a sousedství stranou, pásy
 * podél osy bloku (`furrowAxis` – delší brázdy), napříč postupně od strany blíž vsi (`sweep` –
 * podle vzdálenosti dílů od obydlí). Bloky od nejbližšího k obydlí (chůze), při shodě podle id
 * prvního dílu. Díl bez políčka (staré pole z obrysu) je pás sám pro sebe. Deterministicky.
 */
export function ploughLayout(selected: readonly FieldPart[]): PloughLayout {
  const blocks: { parts: FieldPart[]; bands: PloughBand[]; near: number; first: number }[] = [];
  const byField = new Map<number, FieldPart[]>();
  for (const part of selected) {
    const list = byField.get(part.fieldId);
    if (list) list.push(part);
    else byField.set(part.fieldId, [part]);
  }
  for (const [, parts] of [...byField].sort((a, b) => a[0] - b[0])) {
    const loose = parts.filter((p) => !p.cell);
    for (const part of loose) {
      blocks.push({
        parts: [part],
        bands: [{ partIds: [part.id], axis: 'x', sweep: 1, block: 0 }],
        near: partWalkDistance(part),
        first: part.id,
      });
    }
    // bloky – díly sousedící stranou (v mřížce pole); díl podle políčka po sloupcích a řádcích
    // (jako klíč „x,y“ – při dvojím políčku platí poslední díl)
    const byCell = new Map<number, Map<number, FieldPart>>();
    const cells: FieldPart[] = [];
    for (const p of parts) {
      if (!p.cell) continue;
      let column = byCell.get(p.cell.x);
      if (!column) {
        column = new Map();
        byCell.set(p.cell.x, column);
      }
      const before = column.get(p.cell.y);
      if (before) cells[cells.indexOf(before)] = p;
      else cells.push(p);
      column.set(p.cell.y, p);
    }
    const at = (x: number, y: number): FieldPart | undefined => byCell.get(x)?.get(y);
    const seen = new Set<number>();
    const sorted = cells.sort((a, b) => a.id - b.id);
    for (const start of sorted) {
      if (seen.has(start.id)) continue;
      const block: FieldPart[] = [];
      const queue = [start];
      seen.add(start.id);
      // fronta po indexu – v pořadí jako `shift`
      for (let head = 0; head < queue.length; head++) {
        const part = queue[head]!;
        block.push(part);
        const { x, y } = part.cell!;
        for (const next of [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)]) {
          if (!next || seen.has(next.id)) continue;
          seen.add(next.id);
          queue.push(next);
        }
      }
      blocks.push(blockLayout(block, furrowAxis(block)));
    }
  }
  blocks.sort((a, b) => a.near - b.near || a.first - b.first);
  return {
    order: blocks.flatMap((b) => b.parts),
    bands: blocks.flatMap((b, block) => b.bands.map((band) => ({ ...band, block }))),
  };
}

/**
 * Pás dílu z rozvržení orby `ploughLayout(selected)` líně (díly `selected` s různými id): rozvrhne
 * jen blok, ve kterém díl leží – díly bloku v pořadí jako `ploughLayout` (od dílu s nejmenším id
 * po sousedech), tedy tytéž pásy. Díl bez políčka je pás sám pro sebe; díl, který v žádném pásu
 * není (při dvojím políčku platí poslední díl), nebo který ve výběru není, undefined. Jen
 * zrychlení – výběr dílů sezóny potřebuje každý den pásy jen dílů, které přibudou (≈ 6 % výběru).
 */
export function ploughBandFinder(
  selected: readonly FieldPart[],
): (id: number) => readonly number[] | undefined {
  const byId = new Map<number, FieldPart>();
  const byField = new Map<number, FieldPart[]>();
  for (const part of selected) {
    byId.set(part.id, part);
    const list = byField.get(part.fieldId);
    if (list) list.push(part);
    else byField.set(part.fieldId, [part]);
  }
  // díl podle políčka po sloupcích a řádcích pro každé pole – až je potřeba (jako `ploughLayout`)
  const cellsOf = new Map<number, Map<number, Map<number, FieldPart>>>();
  const fieldCells = (fieldId: number): Map<number, Map<number, FieldPart>> => {
    let byCell = cellsOf.get(fieldId);
    if (byCell) return byCell;
    byCell = new Map();
    for (const p of byField.get(fieldId)!) {
      if (!p.cell) continue;
      let column = byCell.get(p.cell.x);
      if (!column) {
        column = new Map();
        byCell.set(p.cell.x, column);
      }
      column.set(p.cell.y, p);
    }
    cellsOf.set(fieldId, byCell);
    return byCell;
  };
  const found = new Map<number, readonly number[]>();
  return (id) => {
    const known = found.get(id);
    if (known) return known;
    const part = byId.get(id);
    if (!part) return undefined;
    if (!part.cell) {
      const band = [part.id];
      found.set(id, band);
      return band;
    }
    const byCell = fieldCells(part.fieldId);
    const at = (x: number, y: number): FieldPart | undefined => byCell.get(x)?.get(y);
    if (at(part.cell.x, part.cell.y) !== part) return undefined;
    const neighbours = (p: FieldPart): (FieldPart | undefined)[] => {
      const { x, y } = p.cell!;
      return [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
    };
    // blok – souvislá oblast dílu; v `ploughLayout` ho projde hledání od dílu s nejmenším id
    let start = part;
    const reached = new Set<number>([part.id]);
    const queue = [part];
    for (let head = 0; head < queue.length; head++) {
      for (const next of neighbours(queue[head]!)) {
        if (!next || reached.has(next.id)) continue;
        reached.add(next.id);
        queue.push(next);
        if (next.id < start.id) start = next;
      }
    }
    const block: FieldPart[] = [];
    const seen = new Set<number>([start.id]);
    const order = [start];
    for (let head = 0; head < order.length; head++) {
      const p = order[head]!;
      block.push(p);
      for (const next of neighbours(p)) {
        if (!next || seen.has(next.id)) continue;
        seen.add(next.id);
        order.push(next);
      }
    }
    for (const band of blockLayout(block, furrowAxis(block)).bands) {
      for (const member of band.partIds) found.set(member, band.partIds);
    }
    return found.get(id);
  };
}

/** Pásy bloku podél osy `axis`, napříč od strany blíž vsi; díly v pořadí orby. */
function blockLayout(
  block: readonly FieldPart[],
  axis: 'x' | 'y',
): { parts: FieldPart[]; bands: PloughBand[]; near: number; first: number } {
  const along = (p: FieldPart): number => (axis === 'x' ? p.cell!.x : p.cell!.y);
  const across = (p: FieldPart): number => (axis === 'x' ? p.cell!.y : p.cell!.x);
  // řady napříč – v každé souvislé úseky podél brázdy
  const rows = new Map<number, FieldPart[]>();
  for (const part of block) {
    const list = rows.get(across(part));
    if (list) list.push(part);
    else rows.set(across(part), [part]);
  }
  const lines = [...rows.keys()].sort((a, b) => a - b);
  // strana blíž vsi: průměrná vzdálenost krajních řad (chůze z obydlí)
  const mean = (row: number): number => {
    const list = rows.get(row)!;
    return list.reduce((sum, p) => sum + partWalkDistance(p), 0) / list.length;
  };
  const sweep: 1 | -1 =
    lines.length > 1 && mean(lines[lines.length - 1]!) < mean(lines[0]!) ? -1 : 1;
  if (sweep < 0) lines.reverse();
  // souvislé úseky řad; úseky navazující přes řady (překryv podél brázdy) tvoří pruh plochy, který
  // spřežení zorá celý, než přejde jinam (blok tvaru U – napřed jedno rameno, pak druhé)
  type Chain = { runs: FieldPart[][]; last: FieldPart[]; step: number };
  const chains: Chain[] = [];
  lines.forEach((line, step) => {
    const row = rows.get(line)!.sort((a, b) => along(a) - along(b));
    const runs: FieldPart[][] = [];
    for (const part of row) {
      const run = runs[runs.length - 1];
      const last = run?.[run.length - 1];
      if (run && last && along(part) === along(last) + 1) run.push(part);
      else runs.push([part]);
    }
    for (const run of runs) {
      const lo = along(run[0]!);
      const hi = along(run[run.length - 1]!);
      // pokračuje úsek předchozí řady, který se s ním podél brázdy překrývá (a v této řadě ještě
      // žádný úsek nemá)
      const chain = chains.find(
        (c) =>
          c.step === step - 1 && along(c.last[0]!) <= hi && along(c.last[c.last.length - 1]!) >= lo,
      );
      if (chain) {
        chain.runs.push(run);
        chain.last = run;
        chain.step = step;
      } else {
        chains.push({ runs: [run], last: run, step });
      }
    }
  });
  const parts: FieldPart[] = [];
  const bands: PloughBand[] = [];
  for (const chain of chains) {
    for (const run of chain.runs) {
      parts.push(...run);
      bands.push({ partIds: run.map((p) => p.id), axis, sweep, block: 0 });
    }
  }
  return {
    parts,
    bands,
    near: Math.min(...block.map(partWalkDistance)),
    first: Math.min(...block.map((p) => p.id)),
  };
}

/**
 * Váha dílu v pásu orby – plocha × příplatek za vzdálenost (jako `partWeight` v year-plan.ts).
 */
export function bandPartWeight(
  part: Pick<FieldPart, 'areaM2' | 'distanceM' | 'walkDistanceM'>,
): number {
  return (part.areaM2 / 10_000) * distanceFactor(partWalkDistance(part));
}
