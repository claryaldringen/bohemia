// Na jak dlouho vystačí zásoby jídla vsi (diet.md – Hlad, Na jak dlouho vystačí zásoby; Martin
// 15. 11. 2026: „dolů do panelu s plodinami napiš, na jak dlouho vystačí zásoby – budou se podle
// toho plánovat vojenská tažení“).
import { TOTAL_GAME_DAYS } from '../../calendar';
import { villageApplesKg } from '../buildings/orchard';
import { grainKeepInput } from '../fields/grain-pits';
import { legumeEnergy, villageLegumesKg } from '../fields/legumes';
import { uneatenSeedKg } from '../fields/seed';
import { sheavesOutlook } from '../fields/threshing';
import { DAIRY, villageCheeseKg } from '../livestock/dairy';
import type { VillageState } from '../types';
import {
  DAILY_CHEESE_KEEP,
  DAILY_MEAT_KEEP,
  DIET,
  daysUntilMeatEnd,
  daysUntilMeatSpoil,
  fruitEnergy,
  grainKeepPerDay,
  honeyEnergy,
  legumeKeepPerDay,
  meatEnergy,
  villageFoodNeed,
  villageMeatKg,
  villageProteinNeed,
  villageSlaughterMeatKg,
} from './diet';
import { applesSpoiled, daysUntilAppleRot } from './food';
import { NO_CRAFTS } from './productivity';
import { SATIATION_EPSILON } from './simulate-plan';

/**
 * Kolik dní od zítřka (stav je na konci dne `day`) uživí dnešní zásoby jídla lidi vsi plným
 * přídělem (diet.md – Hlad, Na jak dlouho vystačí zásoby): bez sklizní a bez příjmů (mléko,
 * vejce, porážka, med z klátů), při zítřejší potřebě (`villageFoodNeed` – lidé doma a hosté).
 * Zásoby jako jídlo dne: obilí bez osiva, které ves nejí (`uneatenSeedKg`), i se snopy, které ves
 * vymlátí (`sheavesOutlook`), luštěniny, uzené maso, sýr, jablka a med. Ztráty skladováním den po
 * dni stejným pravidlem jako výhled do sklizně (obilí `grainKeepPerDay` – nádoby a jámy,
 * luštěniny, maso, sýr), maso se 1. 9. ráno zkazí (`daysUntilMeatSpoil`), jablka shnijí
 * (`daysUntilAppleRot`). Ves jí v pořadí jídla bez stropů (diet.md – Strava po vrstvách a porážka
 * celý rok): napřed, co se kazí – ostatní uzené maso, zásoba z porážky 1. 11. jen svým dílem
 * (zásoba ÷ dny do konce masa – `daysUntilMeatEnd`, jako jídlo dne mimo hlad – předpověď plného
 * přídělu sklizeň nezná; Martin 18. 11. 2026: „Uzené
 * rozlož“), sýr, ovoce, luštěniny –, pak obilí a nakonec med (nekazí se; když jídla není dost, je
 * jídlem jako obilí – hides-honey.md, Med v hladu). Ovoce jako jídlo dne v hladu (diet.md – Pořadí
 * jídla; předpověď nezná sklizeň ani příjmy, jídla do plné potřeby tedy chybí vždy): do 5 % potřeby
 * a jablka nad to rovným dílem do zkažení (`hungerFruit` v `eatDiet` – do sklizně nejvýš, kolik
 * chybí; bez sklizně všechna); energii, kterou nic jiného nedorovná, doplní jablka vždy
 * (`fruitSpare`). Bez potřeby bílkovin jablka bez omezení. Nad svůj díl se zásoba z 1. 11. nejí – když
 * ostatní jídlo dojde, sama plný příděl nedá. První den, kdy plný příděl nevyjde, počítání
 * skončí. Nikdo nejí ze zásob vsi → null; nejvýš do konce světa.
 */
export function foodLastsDays(
  state: VillageState,
  day: number,
  potteryCoverage: number = NO_CRAFTS.pottery,
): number | null {
  const first = day + 1;
  const need = villageFoodNeed(state, Math.min(first, TOTAL_GAME_DAYS - 1));
  if (need <= 0) return null;
  if (first >= TOTAL_GAME_DAYS) return 0;
  // ovoce, které se za den sní vždy – 5 % potřeby, bez potřeby bílkovin bez omezení (`fruitAlways`)
  const fruitAlways =
    villageProteinNeed(state, first) > 0 ? DIET.fruitShare * need : Number.POSITIVE_INFINITY;
  const grainKeep = grainKeepPerDay({ ...grainKeepInput(state, potteryCoverage), potteryCoverage });
  const legumeKeep = legumeKeepPerDay(potteryCoverage);
  const sheaves = sheavesOutlook(state, first);
  // zásoby v energii (kg obilí)
  let grain = Math.max(0, state.storesKg - uneatenSeedKg(state)) + sheaves.grainKg;
  let legumes = legumeEnergy(villageLegumesKg(state) + sheaves.legumesKg);
  // uzené: ostatní (jí se hned) a zásoba z porážky 1. 11. (jí se svým dílem)
  const slaughterKg = villageSlaughterMeatKg(state);
  let meat = meatEnergy(Math.max(0, villageMeatKg(state) - slaughterKg));
  let slaughter = meatEnergy(slaughterKg);
  let cheese = villageCheeseKg(state) * DAIRY.cheeseEnergy;
  let fruit = fruitEnergy(villageApplesKg(state));
  let honey = honeyEnergy(state.wares?.honeyKg ?? 0);
  const fruitDays = applesSpoiled(first, potteryCoverage)
    ? 0
    : daysUntilAppleRot(first, potteryCoverage);
  const meatDays = daysUntilMeatSpoil(first);
  // konec masa – zásoba z porážky 1. 11. se do něj jí rovným dílem; po něm se přepočte
  let meatEnd = daysUntilMeatEnd(first);
  const shortfall = need * SATIATION_EPSILON;
  let days = 0;
  for (let i = 0; first + i < TOTAL_GAME_DAYS; i++) {
    // ráno ztráty skladováním (jako `eatDiet`), maso a jablka po svém dni zkažení už nejsou
    grain *= grainKeep;
    legumes *= legumeKeep;
    meat = i < meatDays ? meat * DAILY_MEAT_KEEP : 0;
    slaughter = i < meatDays ? slaughter * DAILY_MEAT_KEEP : 0;
    cheese *= DAILY_CHEESE_KEEP;
    if (i >= fruitDays) fruit = 0;
    if (i >= meatEnd) meatEnd = i + daysUntilMeatEnd(first + i);
    let left = need;
    /** Sní ze zásoby `stock` nejvýš `most` – a nejvýš, kolik dnes zbývá do potřeby. */
    const eat = (stock: number, most = stock): number => {
      const eaten = Math.min(most, left);
      left -= eaten;
      return stock - eaten;
    };
    // pořadí jídla vsi jako `eatDiet` (diet.ts – bez mléka a vajec, předpověď nezná příjmy; bez
    // tempa proti zkažení; ostatní uzené hned, zásoba z porážky 1. 11. jen svým dílem); rozdělení
    // po vrstvách (`tierMeal`) má vlastní pořadí – změna pořadí od Martina na všech třech místech
    // ze zásoby z porážky 1. 11. napřed, co by se do konce masa plnou potřebou nestihlo (jako
    // `slaughterMust` v jídle dne), pak ostatní uzené a zbytek dílu
    const share = slaughter / (meatEnd - i);
    const must = Math.min(need, Math.max(0, slaughter - need * (meatEnd - i - 1)));
    const before = slaughter;
    slaughter = eat(slaughter, must);
    meat = eat(meat);
    slaughter = eat(slaughter, Math.max(0, share - (before - slaughter)));
    cheese = eat(cheese);
    // ovoce do 5 % potřeby a jablka nad to rovným dílem do zkažení (jako jídlo dne v hladu)
    const rotLeft = fruitDays - i;
    const fruitMost =
      rotLeft > 0 ? fruitAlways + Math.max(0, fruit - fruitAlways * rotLeft) / rotLeft : 0;
    fruit = eat(fruit, Math.min(fruit, fruitMost));
    legumes = eat(legumes);
    grain = eat(grain);
    honey = eat(honey);
    // co nic jiného nedorovnalo, doplní jablka (`fruitSpare`)
    fruit = eat(fruit);
    if (left > shortfall) break;
    days++;
  }
  return days;
}

/** Potravina, o které kronika při sklizni píše zásobu a na jak dlouho vystačí. */
export type StockKind = 'grain' | 'legumes' | 'apples';

/** Zásoba jedné potraviny a na kolik dní vystačí (`stockLastsDays`). */
export interface StockOutlook {
  /** Kolik kg té potraviny ves má (obilí bez osiva, které ves nejí, i se snopy k vymlácení). */
  kg: number;
  /** Na kolik dní od zítřka vystačí při dnešním počtu lidí; null – nikdo z ní nejí. */
  days: number | null;
}

/**
 * Zásoba jedné potraviny vsi a na kolik dní vystačí, kdyby se jedla sama (kronika – Martin
 * 17. 11. 2026: „kolik té plodiny má vesnice celkem a na jak dlouho to vystačí při současném
 * počtu obyvatel“; návrh Clauda): stejná pravidla jako `foodLastsDays`, jen pro jednu potravinu.
 * Každá plným přídělem bez stropů (diet.md – Strava po vrstvách a porážka celý rok): obilí (bez
 * osiva, které ves nejí, a snopy k vymlácení) se ztrátami skladováním (`grainKeepPerDay`),
 * luštěniny se svými ztrátami, jablka jen do dne, kdy shnijí (`daysUntilAppleRot`). Poslední
 * neúplný den se nepočítá.
 */
export function stockLastsDays(
  state: VillageState,
  day: number,
  stock: StockKind,
  potteryCoverage: number = NO_CRAFTS.pottery,
): StockOutlook {
  const first = day + 1;
  const sheaves = sheavesOutlook(state, Math.min(first, TOTAL_GAME_DAYS - 1));
  const kg =
    stock === 'grain'
      ? Math.max(0, state.storesKg - uneatenSeedKg(state)) + sheaves.grainKg
      : stock === 'legumes'
        ? villageLegumesKg(state) + sheaves.legumesKg
        : villageApplesKg(state);
  const need = villageFoodNeed(state, Math.min(first, TOTAL_GAME_DAYS - 1));
  if (need <= 0) return { kg, days: null };
  if (first >= TOTAL_GAME_DAYS) return { kg, days: 0 };
  let energy = stock === 'grain' ? kg : stock === 'legumes' ? legumeEnergy(kg) : fruitEnergy(kg);
  const keep =
    stock === 'grain'
      ? grainKeepPerDay({ ...grainKeepInput(state, potteryCoverage), potteryCoverage })
      : stock === 'legumes'
        ? legumeKeepPerDay(potteryCoverage)
        : 1;
  const fruitDays = applesSpoiled(first, potteryCoverage)
    ? 0
    : daysUntilAppleRot(first, potteryCoverage);
  let days = 0;
  for (let i = 0; first + i < TOTAL_GAME_DAYS; i++) {
    energy *= keep;
    if (stock === 'apples' && i >= fruitDays) energy = 0;
    if (energy < need * (1 - SATIATION_EPSILON)) break;
    energy -= need;
    days++;
  }
  return { kg, days };
}
