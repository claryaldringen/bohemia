// Založení vsi na místě první zemnice (migration.md – Odchod do nové vsi; fields.md – první pole):
// kontrola místa, první pole, osadníci nebo zakladatelé a převody nové vsi. Sdílí ho use-casy
// založení (hráč) i příjezd vsi na cestě se správcem v simulaci (steward.md – Kde správce běží).
import { obstaclesOf, type Landscape, type ObstacleLayer } from '../../landscape';
import { foundVillage, type FieldInput } from '../core/actions';
import type { Settlers } from '../people/departure';
import { checkDwellingPlacement } from '../placement/placement-dwellings';
import { fieldPartsFromCells } from '../placement/placement-fields';
import { forestEdgeDistanceM, withLivestockLand } from '../placement/placement-squares';
import type { PlacementVillage } from '../placement/placement-types';
import { withPlots } from '../buildings/plots';
import { withSkeletonRoute } from '../trade/premium-route';
import { withDwellingShapes } from '../buildings/shape-migration';
import type { Position, TileCell, VillageState } from '../types';
import { withWeatherSeed } from '../disasters/weather';

/** Podklady založení vsi: krajina, den, místo první zemnice a volitelně pole a osadníci. */
export interface FoundingInput {
  landscape: Landscape;
  /** Vrstva překážek krajiny – bez ní se spočítá z krajiny. */
  obstacles?: ObstacleLayer;
  /** Den založení (index dne). */
  today: number;
  /** Poloha první zemnice. */
  dwelling: Position;
  /** Čtverce prvního pole – políčka krajiny; bez nich (prázdné) se ves založí bez pole. */
  fieldCells?: TileCell[];
  /** Osadníci odešlí z jiné vsi – místo čtyř zakladatelů, zásob a výchozího stáda. */
  settlers?: Settlers;
}

/**
 * Stav nové vsi se seedem `seed` založené dne `today` (bez dopočtu – ten přidá volající): místo
 * první zemnice ověří krajina (`checkDwellingPlacement` bez staveb), první pole se odečte od
 * vyklizené plochy zemnice, ves dostane seed počasí mapy `weatherSeed` (disasters.md – Kraj),
 * pozemek polozemnic, variantu rozměrů zemnice a louku s lesem pro výchozí stádo (diet.md).
 * Vstup nemění; neplatné místo – důvod česky.
 */
export function foundedState(
  seed: number,
  input: FoundingInput,
  lord?: { name?: string },
  weatherSeed: number | null = null,
): { ok: true; state: VillageState } | { ok: false; reason: string } {
  const obstacles = input.obstacles ?? obstaclesOf(input.landscape);
  const dwelling = checkDwellingPlacement(
    input.landscape,
    null,
    'zemnice',
    input.dwelling,
    obstacles,
  );
  if (!dwelling.ok) return { ok: false, reason: dwelling.reason ?? 'Sem zemnice nepatří.' };
  const cells = input.fieldCells ?? [];
  let firstField: FieldInput | null = null;
  if (cells.length > 0) {
    // překážky na staveništi první zemnice osadníci odstraní při založení – pole je neplatí podruhé
    const founding: PlacementVillage = {
      dwellings: [],
      constructions: [],
      parts: [],
      obstacleChanges: { removed: dwelling.obstacleIds, stumps: [], saplings: [] },
    };
    const field = fieldPartsFromCells(
      input.landscape,
      founding,
      cells,
      [input.dwelling],
      obstacles,
    );
    if (!field.check.ok) return { ok: false, reason: field.check.reason ?? 'Sem pole nepatří.' };
    firstField = { parts: field.parts, sacred: field.spared };
  }

  const founded = foundVillage({
    seed,
    day: input.today,
    dwellingPosition: { ...input.dwelling },
    firstField,
    dwellingObstacleIds: dwelling.obstacleIds,
    dwellingObstacleCost: dwelling.obstacleCost,
    dwellingClearedTrees: dwelling.obstacleCounts.tree ?? 0,
    obstacles,
    forestDistanceM: forestEdgeDistanceM(input.landscape, input.dwelling.x, input.dwelling.z),
    dwellingSpared: dwelling.spared,
    ...(input.settlers ? { settlers: input.settlers } : {}),
    ...(lord ? { lord } : {}),
  });
  // nová ves nemá polozemnice bez pozemku – rovnou převedená (`withPlots` ji už nebude měnit),
  // první zemnice má svou variantu rozměrů od umístění (`withDwellingShapes` jen zapíše příznak);
  // louka a les do 600 m od první zemnice – pastva a žaludy výchozího stáda (diet.md)
  // stezka kostry (brod, průsmyk, mapa se stezkou – hráč i ves syna) – hotová od založení
  // (premium-landscapes.md; markets.md – Rozhodnutí plánu 4, bod 11)
  const state = withSkeletonRoute(
    withLivestockLand(
      withDwellingShapes(
        withPlots(withWeatherSeed(founded, weatherSeed), input.landscape, obstacles),
        input.landscape,
        obstacles,
      ),
      input.landscape,
    ),
    input.landscape,
    obstacles,
    input.today,
  );
  return { ok: true, state };
}
