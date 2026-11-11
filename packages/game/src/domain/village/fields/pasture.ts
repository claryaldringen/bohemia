import { fallowStage, isOvergrown } from './fields';
import { mownPartIds } from '../livestock/hay';
import type { FieldPart, VillageState } from '../types';

// Pastviny vsi (diet.md – Pastva, fields.md – Příloh a pastva; Martin 19. 10. 2026: „Stáda
// domácího zvířectva se nesmí potulovat sama. Vždycky s nimi musí být nějaký člověk. Ten je bude
// primárně vodit na louky, určené ke spásání. Domácí zvířata by neměla spásat jídlo pro lidi ani
// ho pošlapat a na čerstvém úhoru toho k pastvě také asi moc není.“). Pase se napřed na loukách,
// které se letos nesečou – na přílohu ve fázi louky od nejbližšího k obydlí a na přirozených
// loukách do 600 m –, pak na mladém přílohu (málo píce) a nakonec na otavě luk, které ves
// letos posekla. Osetý díl se nikdy nespásá; strniště po sklizni ano, do nosnosti se ale
// nepočítá (paběrky na pár týdnů). Bez krajiny je přirozená louka jen plocha (`naturalHa`).

/**
 * diet.md – Pastva (návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md): mladý
 * příloh (1–2 roky po osevu – plevel, výmladky obilí, řídký drn) dá za sezónu jen třetinu píce
 * louky; louka, která se letos seče na seno, se pase jen na otavě (od srpna do konce sezóny,
 * pomalejší obrůstání) – třetina.
 */
export const PASTURE = { youngFallowShare: 0.3, aftermathShare: 0.3 } as const;

const M2_PER_HA = 10_000;
/** Tolerance proti chybám desetinných čísel. */
const EPSILON = 1e-9;

/** Díly přílohu v letošním plánu seče (hay.ts – `planMowing`); bez seče žádné. */
export function hayPlanPartIds(state: Pick<VillageState, 'hay'>): Set<number> {
  const mowing = state.hay?.mowing;
  // u otavy i díly posečené v 1. seči (oxen.md – Seno, dvě seče)
  return new Set([...(mowing?.partIds ?? []), ...(mowing?.firstCut?.partIds ?? [])]);
}

/** Přirozené louky letošní seče (ha) – políčka krajiny v plánu seče. */
export function hayPlanNaturalHa(state: Pick<VillageState, 'hay'>): number {
  const mowing = state.hay?.mowing;
  const squares = mowing?.squares ?? [];
  const planM2 = squares
    .filter((s) => s.partId === undefined)
    .reduce((sum, s) => sum + s.areaM2, 0);
  // u otavy přirozené louky posečené v 1. seči (otava jen na nich)
  return Math.max(planM2, mowing?.firstCut?.naturalM2 ?? 0) / M2_PER_HA;
}

/** Pastviny po dílech přílohu v pořadí, jak je stáda spásají. */
export interface PastureParts {
  /** Příloh ve fázi louky, který se letos neseče – plná pastva, od nejbližšího. */
  meadow: FieldPart[];
  /** Mladý příloh (1–2 roky) – PASTURE.youngFallowShare, od nejbližšího. */
  young: FieldPart[];
  /** Příloh v letošní seči – jen otava (PASTURE.aftermathShare), od nejbližšího. */
  mown: FieldPart[];
}

/** Přímá vzdálenost dílu, při shodě id – pořadí pastvy. */
function byDistance(a: FieldPart, b: FieldPart): number {
  return a.distanceM - b.distanceM || a.id - b.id;
}

/**
 * Díly přílohu jako pastviny v den `day`: mimo křoviny a mladý les (`isOvergrown`), rozdělené na
 * louku mimo seč, mladý příloh a louku v letošní seči.
 */
export function pastureParts(
  state: Pick<VillageState, 'parts' | 'hay'>,
  day: number,
): PastureParts {
  const hay = hayPlanPartIds(state);
  const out: PastureParts = { meadow: [], young: [], mown: [] };
  for (const part of state.parts) {
    if (part.state !== 'fallow' || isOvergrown(part)) continue;
    if (hay.has(part.id)) out.mown.push(part);
    else if (fallowStage(part, day) === 'young-fallow') out.young.push(part);
    else out.meadow.push(part);
  }
  out.meadow.sort(byDistance);
  out.young.sort(byDistance);
  out.mown.sort(byDistance);
  return out;
}

/** Plocha dílů (ha). */
function areaHa(parts: readonly FieldPart[]): number {
  return parts.reduce((sum, p) => sum + p.areaM2, 0) / M2_PER_HA;
}

/**
 * Kolik pastvy (ha plné louky) dávají díly přílohu: louka mimo seč celá, mladý příloh třetina,
 * louka v seči jen otava.
 */
export function fallowPastureHa(parts: PastureParts): number {
  return (
    areaHa(parts.meadow) +
    areaHa(parts.young) * PASTURE.youngFallowShare +
    areaHa(parts.mown) * PASTURE.aftermathShare
  );
}

/**
 * Pastva po dílech (diet.md – Pastva; Martin 19. 10. 2026): potřeba pastvy stád `demandHa` (ha
 * plné louky – `grazingDemandHa`) se rozdělí napřed na příloh ve fázi louky, který se letos
 * neseče (od nejbližšího), pak na přirozené louky mimo seč (`naturalHa` – jen plocha), pak na
 * mladý příloh a nakonec na otavu posekaných dílů přílohu (dílu letošní seče, ke kterému seč už
 * došla – `mownPartIds`). Každý díl pojme nejvýš svou plochu krát svůj podíl píce. Vrátí id
 * dílu → spasené ha plochy dílu (jen díly, na které něco připadlo). Díly nemění.
 */
export function pastureGrazing(
  state: Pick<VillageState, 'parts' | 'hay'>,
  day: number,
  demandHa: number,
  naturalHa: number,
): Map<number, number> {
  const grazing = new Map<number, number>();
  let left = demandHa;
  if (left <= EPSILON) return grazing;
  const take = (parts: readonly FieldPart[], share: number): void => {
    for (const part of parts) {
      if (left <= EPSILON) return;
      const areaHaPart = part.areaM2 / M2_PER_HA;
      const ha = Math.min(areaHaPart, left / share);
      grazing.set(part.id, ha);
      left -= ha * share;
    }
  };
  const parts = pastureParts(state, day);
  take(parts.meadow, 1);
  left -= Math.max(0, naturalHa);
  if (left <= EPSILON) return grazing;
  take(parts.young, PASTURE.youngFallowShare);
  const mown = mownPartIds(state);
  take(
    parts.mown.filter((p) => mown.has(p.id)),
    PASTURE.aftermathShare,
  );
  return grazing;
}
