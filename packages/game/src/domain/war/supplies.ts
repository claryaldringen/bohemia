import { WAR } from './rules-war';

// Zásoby tažení (war.md – Pohyb – Zásoby, Čísla): 1 kg obilí na muže a den, nosnost muže 25 kg,
// koně bez jezdce 80 kg a dvoukoláku 400 kg.

/** Kolik vojsko sní a kolik unese. */
export interface SupplyPlan {
  /** Jídlo na `days` dní pro `men` mužů (kg). */
  needKg: number;
  /** Nosnost vojska (kg). */
  carryKg: number;
  /** Jídlo na tolik dní unese. */
  carryDays: number;
  /** Potřeba se vejde do nosnosti. */
  enough: boolean;
}

/** Potřeba a nosnost tažení: `horses` koní bez jezdce, `carts` dvoukoláků. */
export function campaignSupplies(
  men: number,
  horses: number,
  carts: number,
  days: number,
): SupplyPlan {
  const needKg = men * days * WAR.foodKgPerManDay;
  const carryKg = men * WAR.carryKg.man + horses * WAR.carryKg.horse + carts * WAR.carryKg.cart;
  const perDay = men * WAR.foodKgPerManDay;
  return {
    needKg,
    carryKg,
    carryDays: perDay > 0 ? carryKg / perDay : 0,
    enough: needKg <= carryKg,
  };
}

/** Na kolik dní vystačí `foodKg` obilí `men` mužům. */
export function foodDays(foodKg: number, men: number): number {
  return men > 0 ? foodKg / (men * WAR.foodKgPerManDay) : 0;
}
