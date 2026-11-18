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
  type Eaten,
} from './diet';

// Jídlo dne po vrstvách přednosti (diet.md – Strava po vrstvách a porážka celý rok – Kdo dostane
// co; vrstvy jako přednost v hladu – `hungerSplit`). Co ves dnes snědla (`eatDiet` –
// `DietResult.eaten`), se rozdělí mezi vrstvy ve dvou krocích: kolik energie která vrstva sní
// (příděl nad životním minimem – `rationShares`; Martin 18. 11. 2026: „Elita sice bude mít víc
// jídla, ale pouze pokud to neohrozí životní minimum pro poddané“) a čím se příděl naplní – na
// každé úrovni pořadí jídla napřed vrstva 1, pak 2, 3 a 4. Množství snědeného se tím nemění.

/** Jídlo dne po vrstvách (rod vojvody, mistři huti, řemeslníci a učni, zbytek vsi). */
export interface TierMeal {
  /** Snědené každé vrstvy (součet přes vrstvy = snědené vsi). */
  readonly eaten: readonly Eaten[];
  /** Strava vrstvy (`dietOf` s potřebou vrstvy). */
  readonly diets: readonly DietDay[];
  /** Energie vrstvy 0–1 (prázdná vrstva 1) – hlad, porody, odchod mistrů. */
  readonly energy: readonly number[];
}

/** Štěstí ze stravy (body, průměr po lidech – diet.md, Spokojenost ze stravy). */
export interface DietHappiness {
  readonly fruit: number;
  readonly meat: number;
  readonly honey: number;
}

/** Úroveň pořadí jídla – energie snědeného vsi a připsání dílu vrstvě. */
interface Level {
  /** Energie úrovně ve snědeném vsi (kg obilí). */
  energy(village: Eaten): number;
  /** Připíše vrstvě podíl `share` (0–1) snědeného vsi z této úrovně. */
  add(tier: Eaten, village: Eaten, share: number): void;
  /** Rovným dílem mezi nesyté podle zbytku přídělu (ovoce), jinak po vrstvách v pořadí. */
  even?: true;
}

/** Čerstvé maso ve snědeném (kg). */
const freshOf = (eaten: Eaten): number => Math.max(0, eaten.freshMeatKg ?? 0);
/** Uzené maso ve snědeném (kg) – maso celkem bez čerstvého. */
const smokedOf = (eaten: Eaten): number => Math.max(0, eaten.meatKg - freshOf(eaten));

/**
 * Úrovně v pořadí jídla (diet.md – Pořadí jídla; uvnitř první úrovně návrh Clauda): mléko a vejce
 * (nedají se uložit), čerstvé maso, uzené (zkazí se 1. 9.), sýr, ovoce, luštěniny, obilí a med.
 * Litry a bílkoviny mléka jdou s podílem jeho energie, bílkoviny ostatního s kilogramy
 * (`PROTEIN.perKg` ve `dietOf`).
 */
const LEVELS: readonly Level[] = [
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
    energy: (v) => v.cheeseKg * DAIRY.cheeseEnergy,
    add: (t, v, share) => {
      t.cheeseKg += v.cheeseKg * share;
    },
  },
  {
    // Martin 18. 11. 2026: „Ovoce zbude i na nižší vrstvy. Ostatně jabloně rostou podél cest
    // a každý si může utrhnout co chce“
    energy: (v) => fruitEnergy(v.fruitKg),
    add: (t, v, share) => {
      t.fruitKg += v.fruitKg * share;
    },
    even: true,
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
    energy: (v) => honeyEnergy(v.honeyKg),
    add: (t, v, share) => {
      t.honeyKg += v.honeyKg * share;
    },
  },
];

/** Nic nesnědeno (nový objekt – vrstva si do něj připisuje). */
function nothing(): Eaten {
  return {
    grainKg: 0,
    meatKg: 0,
    fruitKg: 0,
    milkL: 0,
    milkProteinKg: 0,
    milkEnergy: 0,
    cheeseKg: 0,
    eggsKg: 0,
    legumesKg: 0,
    honeyKg: 0,
  };
}

/**
 * Kolik energie úrovně `energy` sní která vrstva do zbytku svého přídělu `room` (mutuje – ubere
 * snědené): po vrstvách v pořadí – vrstva, na kterou celý díl nevyjde, si zbytek rozdělí rovným
 * dílem a nižší nedostanou nic –, nebo (`even` – ovoce) rovným dílem všem nesytým podle zbytku
 * přídělu. Co se do přídělů nevejde (nemá nastat – snědené vsi je příděl všech, jen chyby
 * zaokrouhlení), sní vrstva `sink` – nejnižší s potřebou (Martin 18. 11. 2026: „Pokud by se něco
 * mělo zkazit, ať to dostane vrstva ostatní“).
 */
function levelTakes(energy: number, room: number[], even: boolean, sink: number): number[] {
  const takes = room.map(() => 0);
  let left = energy;
  if (even) {
    const hungry = room.reduce((sum, r) => sum + r, 0);
    const part = hungry > 0 ? Math.min(1, energy / hungry) : 0;
    room.forEach((r, t) => {
      const take = r * part;
      takes[t] = take;
      left -= take;
    });
  } else {
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
 * 2. Čím se naplní: úrovně v pořadí jídla (`LEVELS`), na každé vrstvy 0 → 3 do zbytku přídělu,
 *    ovoce rovným dílem mezi nesyté. Vrstva bez potřeby nic nesní a má plnou energii.
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
  const tiers = needs.map(() => nothing());
  for (const level of LEVELS) {
    const energy = level.energy(eaten);
    const takes = levelTakes(energy, room, level.even === true, sink);
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
 * Štěstí ze stravy průměrem po lidech (diet.md – Spokojenost ze stravy): maso až +3 poměrně
 * k podílu energie z masa vrstvy (`meatHappiness`), ovoce +5 (`DIET.fruitHappiness`) a med +2
 * (`HONEY.happiness`) každému, jehož vrstva je dnes jedla; průměr vážený počtem jedlíků vrstev
 * `counts` (i hosté). Ves bez jedlíků 0.
 */
export function dietHappiness(meal: TierMeal, counts: readonly number[]): DietHappiness {
  let people = 0;
  let fruit = 0;
  let meat = 0;
  let honey = 0;
  meal.diets.forEach((diet, t) => {
    const count = counts[t] ?? 0;
    if (count <= 0) return;
    people += count;
    meat += count * meatHappiness(diet.shares.meat);
    if (diet.shares.fruit > 0) fruit += count * DIET.fruitHappiness;
    if ((diet.shares.honey ?? 0) > 0) honey += count * HONEY.happiness;
  });
  if (people <= 0) return { fruit: 0, meat: 0, honey: 0 };
  return { fruit: fruit / people, meat: meat / people, honey: honey / people };
}
