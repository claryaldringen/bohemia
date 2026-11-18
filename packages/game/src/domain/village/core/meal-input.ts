// Vstup jídla dne bez osiva (diet.md) – společný pro jídlo dne (`dayMealInput`) a přežívací
// zásobu do žní (`seedKeepKg` – fields.md, Úroda, Osivo ze zásob): obě počítají s touž stravou.
import { dailyMilk, milkEnergyBetween, villageCheeseKg } from '../livestock/dairy';
import {
  daysUntilMeatEnd,
  meatEnergy,
  villageFoodNeed,
  villageHoneyRationKg,
  villageMeatKg,
  villageProteinNeed,
  type DietInput,
} from './diet';
import { dayPartLosses, winterEstimateLosses } from '../disasters/disasters';
import { fieldFoodShare } from '../fields/field-food';
import { daysUntilAppleRot } from './food';
import { grainKeepInput } from '../fields/grain-pits';
import { villageLegumesKg } from '../fields/legumes';
import { dailyEggsKg, villageDams } from '../livestock/livestock';
import { summerWinterInput } from '../livestock/husbandry';
import { freshMeatAheadEnergy } from '../livestock/summer-slaughter';
import { villageApplesKg } from '../buildings/orchard';
import { sheavesOutlook } from '../fields/threshing';
import { fishAheadKg } from '../wildlife/small-game';
import type { HerdSpecies, VillageState } from '../types';
import { daysUntilFoodHarvest, lateSpringCrop, unharvestedKg } from './year-plan';

/**
 * Vstup jídla dne (`eatDiet`) ze stavu na konci předchozího dne s celými zásobami obilí
 * a luštěnin – bez osiva, které ves nejí (to odečte `dayMealInput`): dnešní mléko (podojený podíl
 * `milked`) a vejce, mléko stád do sklizně, ovoce do zkažení (nádoby od hrnčíře –
 * `potteryCoverage`), maso do zkažení a čerstvé maso dne i z porážky do sklizně, ryby od zítřka,
 * sýr, luštěniny, med z klátů a snopy, které ves vymlátí. `dams` – dojné samice, se kterými se
 * počítá (bez údaje dojné samice vsi – `villageDams`).
 */
export function baseMealInput(
  state: VillageState,
  day: number,
  potteryCoverage: number,
  milked: number,
  dams: Record<HerdSpecies, number> = villageDams(state),
): DietInput {
  const need = villageFoodNeed(state, day);
  const milk = dailyMilk(dams, day);
  // ozim uživí srpen, když pokryje potřebu z pole, na kterou ves osévala (fields.md – Ozim a jař)
  // stejný podíl jako `foodUntilHarvestKg` (seed.ts) – prahy setí a jídla se nerozejdou
  const shares = state.diet?.shares;
  const fieldShare = Math.max(fieldFoodShare(state), (shares?.grain ?? 0) + (shares?.legumes ?? 0));
  const daysToHarvest = daysUntilFoodHarvest(
    state.season,
    state.parts,
    day,
    need * fieldShare,
    // škoda zvěře a počasí, které už je vidět (disasters.md – Dopady, Úroda)
    winterEstimateLosses(state, day),
  );
  // snopy, které ves vymlátí, jsou ve výhledu jako zrno (production-chains.md – Humno); v září
  // i jař, kterou srpen nedosklidil – příděl počítá se sklizní jaře 31. 8. celou, zbytek ves
  // dožne (návrh Clauda – fields.md, Žeň jaře i v září)
  const sheaves = sheavesOutlook(state, day);
  const late = lateSpringCrop(state);
  const lateKg = late
    ? unharvestedKg(
        late,
        state.parts,
        day,
        dayPartLosses(state, day, 'spring', late.partIds, state.wildlife?.damage?.parts, true),
      )
    : 0;
  // ryby od zítřka do sklizně – výhled i letní odhad masa rodu z jednoho čísla
  const fishAheadEnergy = meatEnergy(fishAheadKg(state, day, daysToHarvest));
  return {
    grainKg: state.storesKg,
    // zapečetěné obilné jámy ztrácí méně (production-chains.md – Obilné jámy)
    ...grainKeepInput(state, potteryCoverage),
    sheavesGrainKg: sheaves.grainKg + lateKg,
    sheavesLegumesKg: sheaves.legumesKg,
    meatKg: villageMeatKg(state),
    // čerstvé maso dne (porážka, ryby a drobná zvěř) a od zítřka z porážky – v zimě čekající kusy,
    // v létě maso pro rod vojvody bez uzeného a ryb, které rod sní napřed (diet.md – Strava po
    // vrstvách a porážka celý rok, Výhled do sklizně)
    freshMeatKg: state.freshMeatKg ?? 0,
    freshAheadEnergy: freshMeatAheadEnergy(
      state,
      day,
      daysToHarvest,
      () => summerWinterInput(state, day),
      fishAheadEnergy,
    ),
    // ryby, které ves ještě chytí od zítřka do sklizně, nejvýš do kvóty – jedním vstupem, ať je
    // plán nouzové porážky (týž vstup) nesečte dvakrát; dnešní úlovek je v čerstvém mase dne
    fishAheadEnergy,
    fruitKg: villageApplesKg(state),
    cheeseKg: villageCheeseKg(state),
    milkL: milk.liters * milked,
    milkProteinKg: milk.proteinKg * milked,
    milkEnergy: milk.energy * milked,
    eggsKg: dailyEggsKg(state),
    legumesKg: villageLegumesKg(state),
    // med z klátů (i dnešní – `waresDay` ráno) pevným přídělem, v hladu i zásoba (hides-honey.md –
    // Klát u obydlí, Med v hladu)
    honeyKg: state.wares?.honeyKg ?? 0,
    honeyRationKg: villageHoneyRationKg(state, day),
    needPerDay: need,
    proteinNeedPerDay: villageProteinNeed(state, day),
    // výhled do sklizně počítá s mlékem stád (fields.md – Osev podle stravy), za den nejvýš potřeba
    // – víc nikdo nevypije (diet.md – Strava po vrstvách, bez stropů)
    milkAheadEnergy: milkEnergyBetween(dams, day + 1, day + daysToHarvest - 1, need),
    daysToHarvest,
    // jablka v nádobách od hrnčíře vydrží déle (crafts.md)
    daysToRot: daysUntilAppleRot(day, potteryCoverage),
    daysToMeatEnd: daysUntilMeatEnd(day),
    potteryCoverage,
  };
}
