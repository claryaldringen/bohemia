import { obstaclesOf, type Landscape } from '../domain/landscape';
import {
  applyBuildIntent,
  type DwellingPlot,
  type BuildableDwellingType,
  type Position,
} from '../domain/village';
import { updateLivingVillage } from './update-village';
import type { VillageRepository, VillageResult } from './villages';

// důvody odmítnutí žijí v doméně (build-intent.ts) – use-case je dál exportuje pro web a testy
export { RELOCATION_BLOCKED } from '../domain/village';

// Přestěhování domácnosti (migration.md – Přestěhování domácnosti): hráč u vybraného obydlí
// umístí nový dům, obyvatelé si ho postaví ze společné práce vsi a po dostavění se přestěhují.

export interface RelocateHouseholdInput {
  /** Ves (id), ve které hráč jedná – její sídlo dává krajinu `landscape`. */
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Obydlí, jehož domácnost se stěhuje (id obydlí = id domácnosti). */
  dwellingId: number;
  /** Typ nového domu – hráč volí zemnici, nebo polozemnici. */
  type: BuildableDwellingType;
  /** Volná poloha (zemnice); u obydlí na pozemku ji určí pozemek. */
  position: Position;
  /** Pozemek – povinný u polozemnice (`PLOT_TYPES`), u zemnice se nebere. */
  plot?: DwellingPlot;
}

/**
 * Hráč zahájí přestěhování domácnosti – nový dům jako stavbu obydlí (stejné kontroly umístění,
 * pozemek polozemnice, dřevo a cena jako `placeDwelling`), jen bez lidí k osídlení. Ves se
 * nejdřív dopočítá do dneška; pravidlo stavby je doménové `applyBuildIntent`.
 */
export function relocateHousehold(
  deps: { villages: VillageRepository },
  input: RelocateHouseholdInput,
): Promise<VillageResult> {
  return updateLivingVillage(
    deps.villages,
    input.villageId,
    input.today,
    input.landscape,
    (state) =>
      applyBuildIntent(state, state.lastDay, input.landscape, obstaclesOf(input.landscape), {
        kind: 'relocation',
        dwellingId: input.dwellingId,
        type: input.type,
        position: input.position,
        plot: input.plot,
      }),
  );
}

export interface CancelRelocationInput {
  villageId: string;
  landscape: Landscape;
  /** Dnešní herní den (index dne). */
  today: number;
  /** Stavba nového domu stěhující se domácnosti. */
  constructionId: number;
}
