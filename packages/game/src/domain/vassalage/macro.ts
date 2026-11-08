import { CATTLE_GOODS } from '../village/neighbours';
import type { CattleGood, TradePeople } from '../village/types';

/**
 * Makrokomodity – zboží, které jde obchodovat za celou ves (vassalage.md – Makrokomodity; Martin
 * 2. 11. 2026: „Makrokomodity – obilí, seno, dobytek, koně, klády, lidé, práce.“): obilí a seno
 * (kg), dobytek po druzích jako v obchodě (kusy – krávy, mladí a vycvičení voli), koně (kusy)
 * a klády (kusy) a kámen (m³ – Martin 8. 11. 2026: „kámen může být komoditou v obchodě nebo ve vazalském tributu“). Lidé a práce jdou po svých – jsou zvlášť (`MacroSpare`).
 */
export interface MacroGoods {
  grainKg: number;
  hayKg: number;
  cattle: Record<CattleGood, number>;
  horses: number;
  logs: number;
  /** Kámen v celých m³ (hromady kamení; zásilka jen vozem – 1 m³ ≈ 2,5 t). */
  stoneM3: number;
}

/**
 * Kámen svazku; uložené podmínky a jednání z doby před kamenem řádek nemají (čtou se jako 0).
 */
export function stoneOf(goods: Pick<MacroGoods, 'stoneM3'>): number {
  return (goods as { stoneM3?: number }).stoneM3 ?? 0;
}

/**
 * Výhled vsi nebo rodu: makrokomodity a k nim lidé (muži, ženy, celé rodiny – jako ve výměně lidí;
 * Martin 2. 11. 2026) a robota (člověkodni za rok).
 */
export interface MacroSpare extends MacroGoods {
  people: TradePeople;
  laborDays: number;
}

/**
 * Svazek makrokomodit v řádku podmínek (dávka, odměna): makrokomodity, lidé a robota – tvar jako
 * výhled (`MacroSpare`), jen jako dohodnuté číslo, ne jako to, co ves postrádá.
 */
export type MacroBundle = MacroSpare;

/** Nic – nové prázdné makrokomodity (každé volání nový objekt). */
export function noMacroGoods(): MacroGoods {
  return {
    grainKg: 0,
    hayKg: 0,
    cattle: { cows: 0, youngOxen: 0, trainedOxen: 0 },
    horses: 0,
    logs: 0,
    stoneM3: 0,
  };
}

/** Po řádcích `f(a, b)` – obilí, seno, každý druh dobytka, koně a klády. */
export function combineMacro(
  a: MacroGoods,
  b: MacroGoods,
  f: (x: number, y: number) => number,
): MacroGoods {
  const cattle = { ...a.cattle };
  for (const good of CATTLE_GOODS) cattle[good] = f(a.cattle[good], b.cattle[good]);
  return {
    grainKg: f(a.grainKg, b.grainKg),
    hayKg: f(a.hayKg, b.hayKg),
    cattle,
    horses: f(a.horses, b.horses),
    logs: f(a.logs, b.logs),
    stoneM3: f(stoneOf(a), stoneOf(b)),
  };
}

/** Součet po řádcích. */
export function addMacro(a: MacroGoods, b: MacroGoods): MacroGoods {
  return combineMacro(a, b, (x, y) => x + y);
}

/** Rozdíl po řádcích, nejméně 0. */
export function subtractMacro(a: MacroGoods, b: MacroGoods): MacroGoods {
  return combineMacro(a, b, (x, y) => Math.max(0, x - y));
}

/** Menší z obou po řádcích. */
export function minMacro(a: MacroGoods, b: MacroGoods): MacroGoods {
  return combineMacro(a, b, Math.min);
}

/** Jen makrokomodity – bez lidí a roboty (kopie). */
export function macroGoodsOf(goods: MacroGoods): MacroGoods {
  return {
    grainKg: goods.grainKg,
    hayKg: goods.hayKg,
    cattle: { ...goods.cattle },
    horses: goods.horses,
    logs: goods.logs,
    stoneM3: stoneOf(goods),
  };
}
