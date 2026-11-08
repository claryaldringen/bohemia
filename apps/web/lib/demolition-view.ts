// Bourání staveb ve scéně (docs/design/demolition.md – Rozhraní; docs/code/scene-village.md –
// Rozebírání staveb): bouraná stavba je lešení rozebírání, tedy rozestavěná stavba pozpátku.
// Čisté funkce bez Babylonu – scéna dostane průběh bourání 0–1 a kreslí fázi staveniště
// `1 − průběh`.
import type { UsableStructure, VillageState, VillageSummary } from '@bohemia/game';

/** Bourání jedné stavby: id stavby bourání (cíl práce vesničanů) a průběh 0–1. */
export interface DemolitionLook {
  site: number;
  progress: number;
}

/** Fáze staveniště, kterou bouraná stavba ukáže (průběh bourání 0,25 = jako stavba na 0,75). */
export function demolitionSiteProgress(demolition: number): number {
  return 1 - Math.min(1, Math.max(0, demolition));
}

/** Průběh bourání na setiny – scéna se přestaví jen při změně, ne při každém dotazu. */
export function roundDemolition(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100) / 100;
}

/** Rozebírané stavby vsi podle druhu a id stavby (`structure:id`); bez bourání prázdná. */
export function demolitionLooks(
  state: Pick<VillageState, 'constructions'>,
  summary: Pick<VillageSummary, 'constructions'>,
): Map<string, DemolitionLook> {
  const out = new Map<string, DemolitionLook>();
  for (const c of state.constructions) {
    if (c.kind !== 'demolition' || !c.demolition) continue;
    const progress = summary.constructions.find((s) => s.id === c.id)?.buildProgress ?? 0;
    out.set(demolitionKey(c.demolition.structure, c.demolition.id), {
      site: c.id,
      progress: roundDemolition(progress),
    });
  }
  return out;
}

export function demolitionKey(structure: UsableStructure, id: number): string {
  return `${structure}:${id}`;
}
