import { dateOfDayIndex, dayIndexOf } from '../calendar';
import { CELL_SIZE_M, type Landscape } from '../landscape';
import { cloneState } from './clone';
import { dwellingShape, shapedFootprint } from './dwelling-shape';
import { GARDEN, LEGUMES, PLOT_HOUSE_OFFSET_M } from './rules';
import type { Dwelling, DwellingPlot, GardenHarvest, VillageState } from './types';
import {
  cropWeatherOf,
  hasWeather,
  partWeatherFactor,
  weatherChangesCrop,
} from './weather-effects';
import { cropGrossPerHa } from './year-plan';

// Zahrádka u obydlí (fields.md – Zahrádka u obydlí; Martin 9. 11. 2026: „Nebylo by lepší, kdyby
// si lidé řešili len sami podobně, jako luštěniny?“ a „Ano“ k návrhu Clauda): luštěniny ves na poli
// nepěstuje – domácnost je seje na záhonech svého pozemku (polozemnice, dvorec). Len je od večera
// 9. 11. 2026 zpět na poli (Martin: „Tak změna. … takže se bude pěstovat na polích“ – `flax.ts`),
// zahrádka dává jen luštěniny z celých záhonů. Práce je ženská a jde bokem jako domácí výroba
// (práci vsi nebere), proto stačí den sklizně (31. 7.). Zemnice pozemek nemá – domácnost v ní
// zahrádku nemá. Čísla v `GARDEN` (rules-fields.ts).

const M2_PER_HA = 10_000;

/**
 * Úrodnost záhonů pozemku (0–100): záhony hnojí domácnost (hnůj, odpad, popel) – přirozená
 * úrodnost políčka pozemku z krajiny (jako u dílu pole), nejméně `GARDEN.manuredFertility`;
 * nevyčerpávají se (návrh Clauda). Ves bez krajiny (testy, skripty) `GARDEN.manuredFertility`.
 */
export function gardenFertility(plot: DwellingPlot, landscape: Landscape | null): number {
  const { x, y } = plot.cell;
  const natural = landscape ? (landscape.fertility[y * landscape.size + x] ?? 0) : 0;
  return Math.max(natural, GARDEN.manuredFertility);
}

/**
 * Plocha záhonů pozemku (m²): políčko domu (CELL_SIZE_M × CELL_SIZE_M – dvůr dvorce zůstává
 * dvorem) bez půdorysu domu (`DWELLING_FOOTPRINT_M` s variantou rozměrů – `shapedFootprint`) a bez
 * cestičky od branky ke dveřím (`GARDEN.pathWidthM` × vzdálenost čela domu od okraje pozemku –
 * podle varianty polohy domu `PLOT_HOUSE_OFFSET_M`). Obydlí bez pozemku 0.
 */
export function gardenBedAreaM2(
  dwelling: Pick<Dwelling, 'type' | 'position' | 'plot' | 'plainShape'>,
): number {
  const plot = dwelling.plot;
  if (!plot) return 0;
  const { width, depth, centerZ } = shapedFootprint(dwelling.type, dwellingShape(dwelling));
  // dům stojí vchodem k brance (u dvorce ke dvoru): čelo je centerZ + depth / 2 od středu domu,
  // střed domu je od středu políčka posunutý o variantu (k brance záporné z)
  const offset = plot.yard ? 0 : PLOT_HOUSE_OFFSET_M[plot.variant].z;
  const pathM = Math.max(0, CELL_SIZE_M / 2 + offset - (centerZ + depth / 2));
  return Math.max(0, CELL_SIZE_M * CELL_SIZE_M - width * depth - GARDEN.pathWidthM * pathM);
}

/**
 * Násobek úrody luštěnin zahrádky počasím kraje roku sklizně dne (disasters.md – Léto) – jako díl
 * pole bez ochrany (`partWeatherFactor`); pohromy dílů (kroupy, povodeň, smršť) se počítají po
 * dílech polí a zahrádky neberou. Ves bez počasí 1.
 */
export function gardenWeather(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
): number {
  if (!hasWeather(state)) return 1;
  const weather = cropWeatherOf(state, day, false);
  return weatherChangesCrop(weather, 'legume')
    ? partWeatherFactor(weather, 'legume', undefined)
    : 1;
}

/**
 * Čisté luštěniny zahrádky domácnosti (kg, bez zaokrouhlení): celé záhony (`bedAreaM2`), úroda na
 * hektar jako na poli (`cropGrossPerHa`) při úrodnosti záhonů × počasí (`weather`); osivo
 * (`LEGUMES.seedKgPerHa`) si domácnost nechá z vlastní úrody.
 */
export function gardenLegumeKg(bedAreaM2: number, fertility: number, weather: number): number {
  const netPerHa = Math.max(0, cropGrossPerHa('legume', fertility) * weather - LEGUMES.seedKgPerHa);
  return (bedAreaM2 * netPerHa) / M2_PER_HA;
}

/**
 * Ves letos zahrádky osela – založená do konce setí (`GARDEN.sowingEnd`, 30. 4. roku dne). Ves
 * založená později sklidí až příští rok.
 */
export function gardensSown(state: Pick<VillageState, 'foundedDay'>, day: number): boolean {
  const year = dateOfDayIndex(day).year;
  return state.foundedDay <= dayIndexOf({ year, ...GARDEN.sowingEnd });
}

/**
 * Sklizeň zahrádek (31. 7., po jídle dne – mutuje stav): každé obydlí s pozemkem, které se
 * používá a někdo v něm bydlí (domácnost = lidé s jeho `dwellingId`), sklidí luštěniny z celých
 * záhonů (`gardenLegumeKg` – plocha záhonů pozemku, hnojená úrodnost políčka pozemku, počasí
 * kraje) do zásoby (`legumesKg`). Obydlí dostane zápis `garden` (panel obydlí), ostatním se smaže;
 * ves souhrnný zápis do kroniky (`garden-harvest`), když nějaká zahrádka je. Ves, která letos
 * zahrádky neosela (`gardensSown`), nic.
 */
export function harvestGardens(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): void {
  if (!gardensSown(state, day)) return;
  const inhabited = new Set(state.people.map((p) => p.dwellingId));
  const weather = gardenWeather(state, day);
  let legumeKg = 0;
  let gardens = 0;
  for (const dwelling of state.dwellings) {
    if (!dwelling.plot || !inhabited.has(dwelling.id) || dwelling.disusedDay !== undefined) {
      delete dwelling.garden;
      continue;
    }
    const kg = gardenLegumeKg(
      gardenBedAreaM2(dwelling),
      gardenFertility(dwelling.plot, landscape),
      weather,
    );
    const record: GardenHarvest = { legumeKg: Math.round(kg) };
    dwelling.garden = record;
    legumeKg += kg;
    gardens++;
  }
  if (gardens === 0) return;
  state.legumesKg = (state.legumesKg ?? 0) + legumeKg;
  state.chronicle.push({ day, kind: 'garden-harvest', legumeKg: Math.round(legumeKg) });
}

/** Zápis zahrádky z doby lnu na zahrádkách (`flaxKg` navíc). */
type LegacyGardenHarvest = GardenHarvest & { flaxKg?: number };

/**
 * Převod (fields.md – Zahrádka u obydlí, změna 9. 11. 2026 večer – len zpět na pole): zápis
 * letošní sklizně zahrádky z doby lnu na zahrádkách ztratí len (`flaxKg`) – zahrádka dává jen
 * luštěniny. Jednou, idempotentně; vstupní stav nemění.
 */
export function withoutGardenFlax(state: VillageState): VillageState {
  const legacy = (d: Dwelling): boolean =>
    (d.garden as LegacyGardenHarvest | undefined)?.flaxKg !== undefined;
  if (!state.dwellings.some(legacy)) return state;
  const next = cloneState(state);
  for (const dwelling of next.dwellings) {
    if (dwelling.garden && legacy(dwelling))
      dwelling.garden = { legumeKg: dwelling.garden.legumeKg };
  }
  return next;
}
