import { dateOfDayIndex, dayIndexOf } from '../calendar';
import type { Landscape } from '../landscape';
import { flaxNeedKg } from './flax';
import { GARDEN, LEGUMES } from './rules';
import type { DwellingPlot, GardenHarvest, Person, VillageState } from './types';
import {
  cropWeatherOf,
  hasWeather,
  partWeatherFactor,
  weatherChangesCrop,
} from './weather-effects';
import { cropGrossPerHa } from './year-plan';

// Zahrádka u obydlí (fields.md – Zahrádka u obydlí; Martin 9. 11. 2026: „Nebylo by lepší, kdyby
// si lidé řešili len sami podobně, jako luštěniny?“ a „Ano“ k návrhu Clauda): len a luštěniny ves
// na poli nepěstuje – domácnost na záhonech svého pozemku (polozemnice, dvorec) seje napřed len na
// oděv své domácnosti a na zbytku luštěniny. Práce je ženská a jde bokem jako domácí výroba (práci
// vsi nebere), proto stačí den sklizně (31. 7.). Zemnice pozemek nemá – domácnost v ní zahrádku
// nemá. Čísla v `GARDEN` (rules-fields.ts).

const M2_PER_HA = 10_000;

/** Plodiny zahrádky. */
type GardenCrop = 'flax' | 'legume';

/** Násobky úrody plodin zahrádky počasím kraje (1 = beze změny). */
export type GardenWeather = Readonly<Record<GardenCrop, number>>;

/**
 * Úrodnost záhonů pozemku (0–100): přirozená úrodnost políčka pozemku z krajiny (jako u dílu
 * pole); záhony hnojí domácnost, nevyčerpávají se (návrh Clauda). Ves bez krajiny (testy, skripty)
 * `GARDEN.fertilityWithoutLandscape`.
 */
export function gardenFertility(plot: DwellingPlot, landscape: Landscape | null): number {
  if (!landscape) return GARDEN.fertilityWithoutLandscape;
  const { x, y } = plot.cell;
  return landscape.fertility[y * landscape.size + x] ?? GARDEN.fertilityWithoutLandscape;
}

/**
 * Počasí kraje roku sklizně dne (disasters.md – Léto) pro plodiny zahrádky – jako díl pole bez
 * ochrany (`partWeatherFactor`); pohromy dílů (kroupy, povodeň, smršť) se počítají po dílech polí
 * a zahrádky neberou. Ves bez počasí 1.
 */
export function gardenWeather(
  state: Pick<VillageState, 'weatherSeed' | 'disasters'>,
  day: number,
): GardenWeather {
  if (!hasWeather(state)) return { flax: 1, legume: 1 };
  const weather = cropWeatherOf(state, day, false);
  const factor = (crop: GardenCrop): number =>
    weatherChangesCrop(weather, crop) ? partWeatherFactor(weather, crop, undefined) : 1;
  return { flax: factor('flax'), legume: factor('legume') };
}

/** Úroda zahrádky domácnosti (kg, bez zaokrouhlení). */
export interface GardenYield {
  flaxKg: number;
  legumeKg: number;
}

/**
 * Úroda zahrádky domácnosti (kg): záhony (`GARDEN.bedAreaM2`) napřed lnem do potřeby domácnosti
 * (`needKg` – plochu domácnost odhadne při setí, bez počasí), zbytek luštěninami. Úroda plodiny na
 * hektar jako na poli (`cropGrossPerHa`) při úrodnosti záhonů × počasí; luštěniny čisté – osivo
 * (`LEGUMES.seedKgPerHa`) si domácnost nechá z vlastní úrody (len seje vlastní semeno jako na poli).
 * Když záhony na len domácnosti nestačí, zbytek lnu chybí a luštěniny nic (návrh Clauda).
 */
export function gardenYield(
  needKg: number,
  fertility: number,
  weather: GardenWeather,
): GardenYield {
  const flaxPerM2 = cropGrossPerHa('flax', fertility) / M2_PER_HA;
  const flaxAreaM2 = Math.min(GARDEN.bedAreaM2, Math.max(0, needKg) / flaxPerM2);
  const legumeAreaM2 = GARDEN.bedAreaM2 - flaxAreaM2;
  const legumeNetPerHa = Math.max(
    0,
    cropGrossPerHa('legume', fertility) * weather.legume - LEGUMES.seedKgPerHa,
  );
  return {
    flaxKg: flaxAreaM2 * flaxPerM2 * weather.flax,
    legumeKg: (legumeAreaM2 * legumeNetPerHa) / M2_PER_HA,
  };
}

/**
 * Ves letos zahrádky osela – založená do konce setí lnu (`GARDEN.sowingEnd`, 30. 4. roku dne).
 * Ves založená později sklidí až příští rok (a oděv do té doby nezapíše – jako dřív len z pole).
 */
export function gardensSown(state: Pick<VillageState, 'foundedDay'>, day: number): boolean {
  const year = dateOfDayIndex(day).year;
  return state.foundedDay <= dayIndexOf({ year, ...GARDEN.sowingEnd });
}

/**
 * Sklizeň zahrádek (31. 7., po jídle dne – mutuje stav): každé obydlí s pozemkem, které se
 * používá a někdo v něm bydlí (domácnost = lidé s jeho `dwellingId`), sklidí len a luštěniny
 * (`gardenYield` – potřeba lnu podle lidí domácnosti v den sklizně, úrodnost políčka pozemku,
 * počasí kraje). Luštěniny jdou do zásoby (`legumesKg`), len se v rámci roku zpracuje v domácí
 * výrobě – vrací jeho kg (podíl oděvu zapíše `harvestFlax`). Obydlí dostane zápis `garden` (panel
 * obydlí), ostatním se smaže; ves souhrnný zápis do kroniky (`garden-harvest`), když nějaká
 * zahrádka je. Ves, která letos zahrádky neosela (`gardensSown`), nic – null.
 */
export function harvestGardens(
  state: VillageState,
  day: number,
  landscape: Landscape | null,
): number | null {
  if (!gardensSown(state, day)) return null;
  const households = new Map<number, Person[]>();
  for (const p of state.people) {
    const members = households.get(p.dwellingId);
    if (members) members.push(p);
    else households.set(p.dwellingId, [p]);
  }
  const weather = gardenWeather(state, day);
  let flaxKg = 0;
  let legumeKg = 0;
  let gardens = 0;
  for (const dwelling of state.dwellings) {
    const people = households.get(dwelling.id);
    if (!dwelling.plot || !people || dwelling.disusedDay !== undefined) {
      delete dwelling.garden;
      continue;
    }
    const harvest = gardenYield(
      flaxNeedKg({ people }, day),
      gardenFertility(dwelling.plot, landscape),
      weather,
    );
    const record: GardenHarvest = {
      flaxKg: Math.round(harvest.flaxKg),
      legumeKg: Math.round(harvest.legumeKg),
    };
    dwelling.garden = record;
    flaxKg += harvest.flaxKg;
    legumeKg += harvest.legumeKg;
    gardens++;
  }
  if (gardens === 0) return 0;
  state.legumesKg = (state.legumesKg ?? 0) + legumeKg;
  state.chronicle.push({
    day,
    kind: 'garden-harvest',
    flaxKg: Math.round(flaxKg),
    legumeKg: Math.round(legumeKg),
  });
  return flaxKg;
}
