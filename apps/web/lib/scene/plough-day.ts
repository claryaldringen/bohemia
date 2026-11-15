// Celá dnešní orba za herní den (oxen.md – Orba za herní den; Martin, 19. 10. 2026: „Vím, že to
// bude divně zrychlené, ale až bude probíhat orba pomocí spřežení, potřeboval bych, aby spřežení
// projelo opravdu všechna obdělávaná políčka a nechávalo za sebou brázdu.“) – LADICÍ: spřežení
// projede za herní den (≈ 86 s) všechny díly a pruhy, přes které dnes orba postupuje, zrychleně;
// zoraná plocha přibývá za rádlem. Čisté funkce vsi pro scénu, bez Babylonu: pruhy dnešní orby
// po dílech (`dayStints`), rozdělení mezi spřežení (`splitStints`) a pole na začátku dne
// (`startOfDayVillage` – dnešní pruhy ještě nezorané, brázdu kreslí scéna podle trasy –
// plough-team.ts, `routeFurrows`). Vypnutí: PLOUGH_DAY_DEBUG = false – spřežení zase orá jen
// pruh u čela dne skutečným tempem (plough-front.ts).
import { dateOfDayIndex } from '@bohemia/game';
import type { FieldLook, SceneFieldPart, SceneVillage } from '../village-view';
import { rowDirection } from './field-cells';
import { fieldPartViews, villageCenter, workSteps } from './field-look';
import {
  bandCandidates,
  fieldEdge,
  ploughCandidate,
  PLOUGH_ROW_M,
  ploughedTo,
  stripField,
  type PloughCandidate,
} from './plough-front';
import { roadPieces, villageRoadCapsules } from './plough-roads';
import { crossField, type RouteStint } from './plough-team';

/**
 * LADICÍ přepínač (Martin, 19. 10. 2026): true = spřežení projede celou dnešní orbu za herní den
 * (zrychleně) a nechává za sebou brázdu; false = skutečné tempo volů, jen pruh u čela dne.
 */
export const PLOUGH_DAY_DEBUG = true;

/**
 * Pruh dnešní orby dílu (pásu dílů – oxen.md, Co nejdelší brázda: díly pásu se orají spolu,
 * brázda přes celý pás): kudy dnes spřežení prošlo (0–1 napříč, po pruzích obtisku).
 */
export interface DayStint extends RouteStint {
  /** První díl pásu a všechny díly pásu. */
  partId: number;
  partIds: number[];
  /** Kolik dílu bylo zoráno ráno a večer (po pruzích obtisku – `workSteps`). */
  from: number;
  to: number;
}

/**
 * Pruhy dnešní orby v pořadí práce: z podílů práce `plough` (díly `parts` a u každého, kolik orby
 * bylo hotovo ráno a večer – `progress` od herního jádra; bez něj od začátku dílu k čáře orby).
 * Ráno i večer po pruzích obtisku (`workSteps`), ať brázda na konci dne přesně sedí s polem
 * dalšího dne. Projede se každý díl, přes který dnes orba prošla – i když se na něm za pluhem
 * týž den už selo (Martin, 19. 10. 2026: „Pokud přes to pole se svým pluhem neprojede, nesmí se
 * změnit na zoráno.“); bez `progress` od jádra jen díly se zoraným vzhledem. Rádlo orá každý
 * pruh dvakrát (oxen.md – Orba rádlem křížem): napřed podél řad, hned po něm napříč (`cross` –
 * `crossField`), brázdy obou průchodů tvoří mřížku.
 */
export function dayStints(
  village: Pick<SceneVillage, 'labor' | 'fields' | 'dwellings' | 'roads'>,
): DayStint[] {
  const day = village.labor?.day ?? 0;
  const dayOfYear = dateOfDayIndex(day).dayOfYear;
  const stints: DayStint[] = [];
  // brázdy končí na pevné cestě – pruh přes cestu se orá po kusech (plough-roads.ts)
  const capsules = villageRoadCapsules(village);
  for (const share of village.labor?.shares ?? []) {
    if (share.activity !== 'plough' || share.manDays <= 0 || share.target.kind !== 'field') {
      continue;
    }
    const fieldId = share.target.id;
    const field = village.fields.find((f) => f.id === fieldId);
    if (!field || !share.parts) continue;
    const views = new Map(
      fieldPartViews(field, { dayOfYear, village }).flatMap((v) =>
        v.part.id === undefined ? [] : [[v.part.id, v] as const],
      ),
    );
    const rows = rowDirection(field.parts);
    const center = villageCenter(village, field.parts);
    const edge = fieldEdge(village, field);
    // díly dne a kudy přes ně orba prošla; sousední díly pásu se stejným postupem v jeden pruh
    const pieces: { candidate: PloughCandidate; from: number; to: number }[] = [];
    share.parts.forEach((id, k) => {
      const view = views.get(id);
      const progress = share.progress?.[k];
      if (!view || (!progress && view.look !== 'plowed')) return;
      const [rawFrom, rawTo] = progress ?? [0, ploughedTo(view)];
      const from = workSteps(rawFrom);
      const to = rawTo >= 1 - 1e-9 ? 1 : workSteps(rawTo);
      if (to - from < 1e-6) return;
      // čára orby podle dnešního postupu od jádra (díl, kde se za pluhem už selo, má jiný vzhled)
      const candidate = { ...ploughCandidate(fieldId, view, rows, center, edge), line: to };
      const last = pieces[pieces.length - 1];
      const merged =
        last && last.from === from && last.to === to
          ? bandCandidates([last.candidate, candidate])
          : null;
      if (merged && merged.length === 1) last!.candidate = merged[0]!;
      else pieces.push({ candidate, from, to });
    });
    for (const { candidate, from, to } of pieces) {
      const size = candidate.part.size;
      const strip = stripField(candidate, from * size, to * size);
      const partIds = candidate.parts.flatMap((p) => (p.id === undefined ? [] : [p.id]));
      const partId = candidate.part.id!;
      for (const piece of roadPieces(strip, capsules, candidate.parts)) {
        stints.push({ fieldId, partId, partIds, field: piece, from, to });
      }
      // orba křížem (oxen.md – Orba rádlem křížem): pruh ještě jednou napříč, přes cestu po kusech
      const cross = crossField(strip, PLOUGH_ROW_M);
      for (const piece of roadPieces(cross, capsules, candidate.parts)) {
        stints.push({ fieldId, partId, partIds, field: piece, from, to, cross: true });
      }
    }
  }
  return stints;
}

/**
 * Rozdělí pruhy mezi `teams` spřežení: každé dostane souvislý kus fronty v pořadí práce, kusy
 * zhruba stejně velké (podle plochy pruhů – pruh patří kusu, do kterého padne jeho střed). Druhý
 * průchod křížem (`cross`) patří tomu, kdo zoral předchozí pruh. Kusy bez pruhu odpadnou –
 * zbylá spřežení zůstanou v ohradě.
 */
export function splitStints<
  T extends { field: { size: number; from?: number; to?: number }; cross?: true },
>(stints: readonly T[], teams: number): T[][] {
  const n = Math.max(0, Math.min(teams, stints.filter((s) => !s.cross).length));
  if (n === 0) return [];
  const area = stints.map((s) =>
    s.cross ? 0 : s.field.size * ((s.field.to ?? 0) - (s.field.from ?? 0)),
  );
  const total = Math.max(
    1e-9,
    area.reduce((sum, a) => sum + a, 0),
  );
  const chunks: T[][] = Array.from({ length: n }, () => []);
  let acc = 0;
  let chunk = 0;
  stints.forEach((stint, i) => {
    if (!stint.cross) {
      const mid = acc + area[i]! / 2;
      acc += area[i]!;
      chunk = Math.min(n - 1, Math.floor((mid / total) * n));
    }
    chunks[chunk]!.push(stint);
  });
  return chunks.filter((c) => c.length > 0);
}

/**
 * Pole na začátku dne: díly dnešní orby mají zoranou jen ranní část (`from`), zbytek vzhled před
 * orbou (`unploughed` od herního jádra, jinak `before`, jinak strniště) – zbytek dnešní orby
 * přibývá brázdou za rádlem (plough-team.ts – `routeFurrows`); co se za pluhem dnes zaselo, je
 * vidět až další den. Zoraná zem tak přibývá jen tam, kudy rádlo projelo.
 */
export function startOfDayVillage<V extends Pick<SceneVillage, 'fields'>>(
  village: V,
  stints: readonly DayStint[],
): V {
  if (stints.length === 0) return village;
  const byPart = new Map(stints.flatMap((s) => s.partIds.map((id) => [id, s] as const)));
  return {
    ...village,
    fields: village.fields.map((field) => {
      if (!field.parts.some((p) => p.id !== undefined && byPart.has(p.id))) return field;
      return {
        ...field,
        parts: field.parts.map((part): SceneFieldPart => {
          const stint = part.id === undefined ? undefined : byPart.get(part.id);
          if (!stint) return part;
          const before: FieldLook = part.unploughed ?? part.before ?? 'stubble';
          const { work: _work, before: _before, ...rest } = part;
          void _work;
          void _before;
          return stint.from > 0
            ? { ...rest, look: 'plowed', work: stint.from, before }
            : { ...rest, look: before };
        }),
      };
    }),
  };
}
