import { legumeEnergy } from '../fields/legumes';
import { DAIRY } from '../livestock/dairy';
import { rationShares, type HungerSplit } from '../people/hunger-groups';
import { HONEY } from '../rules/rules-wares';
import type { DietDay } from '../types';
import {
  DIET,
  dietOf,
  fruitEnergy,
  honeyEnergy,
  meatEnergy,
  meatHappiness,
  nothingEaten,
  type Eaten,
} from './diet';

// Jídlo dne po vrstvách přednosti (diet.md – Strava po vrstvách a porážka celý rok – Kdo dostane
// co; vrstvy jako přednost v hladu – `hungerSplit`). Co ves dnes snědla (`eatDiet` –
// `DietResult.eaten`), se rozdělí mezi vrstvy ve dvou krocích: kolik energie která vrstva sní
// (příděl nad životním minimem – `rationShares`; Martin 18. 11. 2026: „Elita sice bude mít víc
// jídla, ale pouze pokud to neohrozí životní minimum pro poddané“) a čím se příděl naplní – ovoce
// a pevný příděl medu všem stejně (Martin 18. 11. 2026 „ok“ na doporučení, ať je dostanou všichni
// stejně, i sytá elita), ostatní jídlo v pořadí napřed vrstva 1, pak 2, 3 a 4. Množství snědeného
// se tím nemění.

/** Jídlo dne po vrstvách (rod vojvody, mistři huti, řemeslníci a učni, zbytek vsi). */
export interface TierMeal {
  /** Snědené každé vrstvy (součet přes vrstvy = snědené vsi). */
  readonly eaten: readonly Eaten[];
  /** Strava vrstvy (`dietOf` s potřebou vrstvy). */
  readonly diets: readonly DietDay[];
  /** Energie vrstvy 0–1 (prázdná vrstva 1) – hlad, porody, odchod mistrů. */
  readonly energy: readonly number[];
}

/** Štěstí ze stravy (body, průměr přes jedlíky – diet.md, Spokojenost ze stravy). */
export interface DietHappiness {
  readonly fruit: number;
  readonly meat: number;
  readonly honey: number;
}

/** Úroveň jídla – energie snědeného vsi a připsání dílu vrstvě. */
interface Level {
  /** Energie úrovně ve snědeném vsi (kg obilí). */
  energy(village: Eaten): number;
  /** Připíše vrstvě podíl `share` (0–1) snědeného vsi z této úrovně. */
  add(tier: Eaten, village: Eaten, share: number): void;
  /** Všem stejně – stejný podíl potřeby (`evenTakes`), jinak po vrstvách v pořadí. */
  even?: true;
}

/** Čerstvé maso ve snědeném (kg). */
const freshOf = (eaten: Eaten): number => Math.max(0, eaten.freshMeatKg ?? 0);
/** Uzené maso ve snědeném (kg) – maso celkem bez čerstvého. */
const smokedOf = (eaten: Eaten): number => Math.max(0, eaten.meatKg - freshOf(eaten));
/** Pevný příděl medu ve snědeném (kg) – nejvýš snědený med. */
const rationHoneyOf = (eaten: Eaten): number =>
  Math.min(Math.max(0, eaten.honeyKg), Math.max(0, eaten.honeyRationKg ?? 0));
/** Med navíc v hladu ve snědeném (kg) – snědený med bez pevného přídělu. */
const extraHoneyOf = (eaten: Eaten): number => Math.max(0, eaten.honeyKg - rationHoneyOf(eaten));

/**
 * Úrovně jídla v pořadí (diet.md – Kdo dostane co, Pořadí jídla; uvnitř první úrovně návrh
 * Clauda): napřed ovoce a pevný příděl medu všem stejně, pak po vrstvách čerstvé maso, uzené,
 * mléko, vejce, sýr, luštěniny, obilí a med navíc v hladu (hides-honey.md – Med v hladu). Litry
 * a bílkoviny mléka jdou s podílem jeho energie, bílkoviny ostatního s kilogramy (`PROTEIN.perKg`
 * ve `dietOf`).
 *
 * Pořadí rozdělení se od pořadí jídla vsi liší záměrně: co ves dnes sní, rozhodne `eatDiet`
 * (diet.ts – mléko a vejce napřed, nedají se uložit, uzené jen svým dílem do zkažení; totéž
 * pořadí má předpověď `foodLastsDays` ve food-lasts.ts) a množství je dané – tady se jen určuje,
 * kdo co sní, a maso (i dnešní díl uzeného) jde napřed elitě
 * (Martin 18. 11. 2026: „Elita ať jí obecně víc masa celoročně“; dřív mléko a vejce před masem –
 * rod pil mléko a maso dostali ostatní). Změna pořadí jídla od Martina se dělá na všech třech
 * místech.
 */
const LEVELS: readonly Level[] = [
  {
    // Martin 18. 11. 2026: „Ovoce zbude i na nižší vrstvy. Ostatně jabloně rostou podél cest
    // a každý si může utrhnout co chce“ – ovoce i pevný příděl medu jedí všichni stejně
    energy: (v) => fruitEnergy(v.fruitKg) + honeyEnergy(rationHoneyOf(v)),
    add: (t, v, share) => {
      t.fruitKg += v.fruitKg * share;
      const kg = rationHoneyOf(v) * share;
      t.honeyKg += kg;
      if (kg > 0) t.honeyRationKg = (t.honeyRationKg ?? 0) + kg;
    },
    even: true,
  },
  {
    energy: (v) => meatEnergy(freshOf(v)),
    add: (t, v, share) => {
      const kg = freshOf(v) * share;
      t.meatKg += kg;
      if (kg > 0) t.freshMeatKg = (t.freshMeatKg ?? 0) + kg;
    },
  },
  {
    energy: (v) => meatEnergy(smokedOf(v)),
    add: (t, v, share) => {
      t.meatKg += smokedOf(v) * share;
    },
  },
  {
    energy: (v) => v.milkEnergy,
    add: (t, v, share) => {
      t.milkL += v.milkL * share;
      t.milkProteinKg += v.milkProteinKg * share;
      t.milkEnergy += v.milkEnergy * share;
    },
  },
  {
    energy: (v) => v.eggsKg * DIET.energy.eggs,
    add: (t, v, share) => {
      t.eggsKg += v.eggsKg * share;
    },
  },
  {
    energy: (v) => v.cheeseKg * DAIRY.cheeseEnergy,
    add: (t, v, share) => {
      t.cheeseKg += v.cheeseKg * share;
    },
  },
  {
    energy: (v) => legumeEnergy(v.legumesKg),
    add: (t, v, share) => {
      t.legumesKg += v.legumesKg * share;
    },
  },
  {
    energy: (v) => v.grainKg,
    add: (t, v, share) => {
      t.grainKg += v.grainKg * share;
    },
  },
  {
    energy: (v) => honeyEnergy(extraHoneyOf(v)),
    add: (t, v, share) => {
      t.honeyKg += extraHoneyOf(v) * share;
    },
  },
];

/**
 * Všem stejně (mutuje `takes` – na začátku nuly): každá vrstva s potřebou dostane z energie
 * `energy` stejný podíl své potřeby `needs`, nejvýš do zbytku přídělu `room`; co se do přídělu
 * vrstvy nevejde, rozdělí se stejně mezi ostatní. Vrací energii, která se nevešla nikam.
 */
function evenTakes(
  energy: number,
  room: readonly number[],
  needs: readonly number[],
  takes: number[],
): number {
  let left = energy;
  const open = needs.map((need, t) => need > 0 && (room[t] ?? 0) > 0);
  while (left > 0) {
    let weight = 0;
    open.forEach((o, t) => {
      if (o) weight += needs[t] ?? 0;
    });
    if (weight <= 0) break;
    // podíl potřeby, který by dostala každá otevřená vrstva – kdo se do něj nevejde, dostane celý
    // zbytek přídělu a podíl ostatních se přepočte
    const part = left / weight;
    let capped = false;
    open.forEach((o, t) => {
      const free = (room[t] ?? 0) - (takes[t] ?? 0);
      if (!o || free > part * (needs[t] ?? 0)) return;
      takes[t] = room[t] ?? 0;
      left -= free;
      open[t] = false;
      capped = true;
    });
    if (capped) continue;
    open.forEach((o, t) => {
      if (!o) return;
      const take = part * (needs[t] ?? 0);
      takes[t] = (takes[t] ?? 0) + take;
      left -= take;
    });
    break;
  }
  return left;
}

/**
 * Kolik energie úrovně `energy` sní která vrstva do zbytku svého přídělu `room` (mutuje – ubere
 * snědené): po vrstvách v pořadí – vrstva, na kterou celý díl nevyjde, si zbytek rozdělí rovným
 * dílem a nižší nedostanou nic –, nebo (`even`) všem stejně podle potřeby `needs` (`evenTakes`).
 * Co se do přídělů nevejde (nemá nastat – snědené vsi je příděl všech, jen chyby zaokrouhlení),
 * sní vrstva `sink` – nejnižší s potřebou (Martin 18. 11. 2026: „Pokud by se něco mělo zkazit, ať
 * to dostane vrstva ostatní“).
 */
function levelTakes(
  energy: number,
  room: number[],
  needs: readonly number[],
  even: boolean,
  sink: number,
): number[] {
  const takes = room.map(() => 0);
  let left = energy;
  if (even) left = evenTakes(energy, room, needs, takes);
  else {
    for (let t = 0; t < room.length && left > 0; t++) {
      const take = Math.min(room[t] ?? 0, left);
      takes[t] = take;
      left -= take;
    }
  }
  if (left > 0) takes[sink] = (takes[sink] ?? 0) + left;
  takes.forEach((take, t) => {
    room[t] = Math.max(0, (room[t] ?? 0) - take);
  });
  return takes;
}

/**
 * Rozdělí snědené vsi `eaten` mezi vrstvy s potřebami `split` (diet.md – Kdo dostane co).
 * 1. Příděl: poměr energie snědeného k potřebě všech vrstev (nad potřebou se ořízne na 1) –
 *    `rationShares`: dosyta všichni, nad životním minimem 75 % každý minimum a zbytek po vrstvách,
 *    pod ním všichni stejný podíl své potřeby.
 * 2. Čím se naplní: úrovně jídla (`LEVELS`) – ovoce a pevný příděl medu všem stejně podle potřeby
 *    (i sytým, nejvýš do přídělu), ostatní po vrstvách 0 → 3 do zbytku přídělu. Vrstva bez potřeby
 *    nic nesní a má plnou energii.
 */
export function tierMeal(
  split: Pick<HungerSplit, 'needs' | 'proteinNeeds'>,
  eaten: Eaten,
): TierMeal {
  const needs = split.needs.map((need) => Math.max(0, need));
  const total = needs.reduce((sum, need) => sum + need, 0);
  // energie snědeného proti potřebě všech vrstev (dietOf ořízne na 1)
  const shares = rationShares(dietOf(total, 0, eaten).energy, needs);
  const room = needs.map((need, t) => need * (shares[t] ?? 0));
  let sink = needs.length - 1;
  while (sink > 0 && (needs[sink] ?? 0) <= 0) sink--;
  const tiers = needs.map(() => nothingEaten());
  for (const level of LEVELS) {
    const energy = level.energy(eaten);
    const takes = levelTakes(energy, room, needs, level.even === true, sink);
    tiers.forEach((tier, t) => {
      // úroveň bez energie (nic z ní nesnědeno; kilogramy bez energie nemají nastat) celá nejnižší
      // vrstvě, ať součet vrstev sedí
      const share = energy > 0 ? (takes[t] ?? 0) / energy : t === sink ? 1 : 0;
      if (share > 0) level.add(tier, eaten, share);
    });
  }
  return {
    eaten: tiers,
    diets: tiers.map((tier, t) => dietOf(needs[t] ?? 0, split.proteinNeeds[t] ?? 0, tier)),
    energy: needs.map((need, t) => (need > 0 ? (shares[t] ?? 0) : 1)),
  };
}

/**
 * Štěstí ze stravy průměrem přes jedlíky (diet.md – Spokojenost ze stravy): maso až +3 poměrně
 * k podílu energie z masa vrstvy (`meatHappiness`), ovoce +5 (`DIET.fruitHappiness`) a med +2
 * (`HONEY.happiness`) každému, jehož vrstva je dnes jedla; průměr vážený počtem jedlíků vrstev
 * `eaters` (`HungerSplit.eaters` – lidé, kteří jedí ze zásob vsi, a hosté; ne lidé pryč). Ves bez
 * jedlíků 0.
 */
export function dietHappiness(meal: TierMeal, eaters: readonly number[]): DietHappiness {
  let people = 0;
  let fruit = 0;
  let meat = 0;
  let honey = 0;
  meal.diets.forEach((diet, t) => {
    const count = eaters[t] ?? 0;
    if (count <= 0) return;
    people += count;
    meat += count * meatHappiness(diet.shares.meat);
    if (diet.shares.fruit > 0) fruit += count * DIET.fruitHappiness;
    if ((diet.shares.honey ?? 0) > 0) honey += count * HONEY.happiness;
  });
  if (people <= 0) return { fruit: 0, meat: 0, honey: 0 };
  return { fruit: fruit / people, meat: meat / people, honey: honey / people };
}
