// Vstup jídla dne bez osiva (diet.md) – společný pro jídlo dne (`dayMealInput`) a přežívací
// zásobu do žní (`seedKeepKg` – fields.md, Úroda, Osivo ze zásob): obě počítají s touž stravou.
import { dailyMilk, daysUntilMilking, milkEnergyBetween, villageCheeseKg } from './dairy';
import {
  DIET,
  daysUntilMeatEnd,
  villageFoodNeed,
  villageMeatKg,
  villageProteinNeed,
  type DietInput,
} from './diet';
import { dayPartLosses, winterEstimateLosses } from './disasters';
import { fieldFoodShare } from './field-food';
import { daysUntilAppleRot } from './food';
import { grainKeepInput } from './grain-pits';
import { daysUntilLegumeHarvest, villageLegumesKg } from './legumes';
import { dailyEggsKg, freshMeatAheadEnergy, villageDams } from './livestock';
import { villageApplesKg } from './orchard';
import { sheavesOutlook } from './threshing';
import type { HerdSpecies, VillageState } from './types';
import { daysUntilFoodHarvest, lateSpringCrop, unharvestedKg } from './year-plan';

/**
 * Vstup jídla dne (`eatDiet`) ze stavu na konci předchozího dne s celými zásobami obilí
 * a luštěnin – bez osiva, které ves nejí (to odečte `dayMealInput`): dnešní mléko (podojený podíl
 * `milked`) a vejce, mléko stád do sklizně, ovoce do zkažení (nádoby od hrnčíře –
 * `potteryCoverage`), maso do zkažení a čerstvé maso zimní porážky, sýr do dojení, luštěniny do
 * sklizně a snopy, které ves vymlátí. `dams` – dojné samice, se kterými se počítá (bez údaje dojné
 * samice vsi – `villageDams`).
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
  return {
    grainKg: state.storesKg,
    // zapečetěné obilné jámy ztrácí méně (production-chains.md – Obilné jámy)
    ...grainKeepInput(state, potteryCoverage),
    sheavesGrainKg: sheaves.grainKg + lateKg,
    sheavesLegumesKg: sheaves.legumesKg,
    meatKg: villageMeatKg(state),
    // čerstvé maso zimní porážky – dnešní a do konce zimy (diet.md – Porážka v zimě)
    freshMeatKg: state.freshMeatKg ?? 0,
    freshAheadEnergy: freshMeatAheadEnergy(state, day),
    fruitKg: villageApplesKg(state),
    cheeseKg: villageCheeseKg(state),
    milkL: milk.liters * milked,
    milkProteinKg: milk.proteinKg * milked,
    milkEnergy: milk.energy * milked,
    eggsKg: dailyEggsKg(state),
    legumesKg: villageLegumesKg(state),
    daysToLegumeHarvest: daysUntilLegumeHarvest(day),
    needPerDay: need,
    proteinNeedPerDay: villageProteinNeed(state, day),
    daysToMilking: daysUntilMilking(day),
    // výhled do sklizně počítá s mlékem stád (fields.md – Osev podle stravy)
    milkAheadEnergy: milkEnergyBetween(
      dams,
      day + 1,
      day + daysToHarvest - 1,
      DIET.caps.dairy * need,
    ),
    daysToHarvest,
    // jablka v nádobách od hrnčíře vydrží déle (crafts.md)
    daysToRot: daysUntilAppleRot(day, potteryCoverage),
    daysToMeatEnd: daysUntilMeatEnd(day),
    potteryCoverage,
  };
}
