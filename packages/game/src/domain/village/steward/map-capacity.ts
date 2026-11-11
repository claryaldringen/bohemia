import { type Landscape, type ObstacleLayer, obstaclesOf } from '../../landscape';
import { bufferKg, steadyHarvestKg } from '../fields/field-food';
import { ROTATION } from '../fields/field-capacity';
import { NO_CRAFTS } from '../core/productivity';
import { FOOD_NEED_KG_PER_YEAR } from '../rules/rules-fields';
import { MAP_CAPACITY } from '../rules/rules-steward';
import { fieldCells } from './steward-land';

// Kapacita mapy (steward.md – Model kapacity vsi; Martin 6. 11. 2026): kolik lidí uživí všechna
// půda krajiny, ze které jde udělat pole – louka i les, který jde vyklučit; bez vody a skal
// a bez půdy bez úrody (strminy). Počítá se jen z krajiny, ne z dnešních polí vsi.

const cache = new WeakMap<ObstacleLayer, { landscape: Landscape; people: number }>();

/**
 * Kolik lidí uživí obdělatelná půda mapy při obvyklých ztrátách. Roční úroda políčka = čistá
 * úroda za léta osevu (`fieldCells.kg`) × to, co z ní nechají záplavy, zvěř a počasí
 * (`fieldCells.kept` – odhad z krajiny) ÷ délka oběhu (osev + úhor, `ROTATION`: v oběhu je osetý
 * jen díl `1 / ROTATION_FACTOR`). Součet přes mapu ÷ úroda, kterou potřebuje člověk
 * (`MAP_CAPACITY.fieldFoodShare` jeho roční potřeby obilí, s pojistkou zásob a ztrátami
 * skladováním – `steadyHarvestKg` bez hrnčíře). Čistá funkce krajiny; jednou pro mapu (mezipaměť
 * podle vrstvy překážek – krajina se u sídla nemění, a tak není co ukládat do stavu vsi).
 */
export function mapCapacity(
  landscape: Landscape,
  obstacles: ObstacleLayer = obstaclesOf(landscape),
): number {
  const cached = cache.get(obstacles);
  if (cached?.landscape === landscape) return cached.people;
  const cells = fieldCells(landscape, obstacles);
  const cycleYears = ROTATION.sown + ROTATION.fallow;
  let harvestKg = 0;
  for (let i = 0; i < cells.kg.length; i++)
    harvestKg += (cells.kg[i]! * cells.kept[i]!) / cycleYears;
  const need = FOOD_NEED_KG_PER_YEAR.adult;
  const perPerson = steadyHarvestKg(
    need * MAP_CAPACITY.fieldFoodShare,
    bufferKg(need),
    NO_CRAFTS.pottery,
  );
  const people = perPerson > 0 ? harvestKg / perPerson : 0;
  cache.set(obstacles, { landscape, people });
  return people;
}
