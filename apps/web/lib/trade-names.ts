// Názvy pro dvorec vojvody, zemské stezky a obchod (docs/design/trade.md) – směry, zboží a jeho
// ikony. Čistý modul, smí i do prohlížeče.
import type { Direction8, NewcomerGroup, TradeGood, TradeGoods, TradePeople } from '@bohemia/game';
import { formatInteger } from './village-format';

/** Směry – zkratka, název, šipka a „odkud“ (sever nahoře, +z). */
export const DIRECTION_NAMES: Record<
  Direction8,
  { short: string; name: string; arrow: string; from: string }
> = {
  N: { short: 'S', name: 'sever', arrow: '↑', from: 'ze severu' },
  NE: { short: 'SV', name: 'severovýchod', arrow: '↗', from: 'ze severovýchodu' },
  E: { short: 'V', name: 'východ', arrow: '→', from: 'z východu' },
  SE: { short: 'JV', name: 'jihovýchod', arrow: '↘', from: 'z jihovýchodu' },
  S: { short: 'J', name: 'jih', arrow: '↓', from: 'z jihu' },
  SW: { short: 'JZ', name: 'jihozápad', arrow: '↙', from: 'z jihozápadu' },
  W: { short: 'Z', name: 'západ', arrow: '←', from: 'ze západu' },
  NW: { short: 'SZ', name: 'severozápad', arrow: '↖', from: 'ze severozápadu' },
};

/**
 * Zboží – název, jednotka (kg nebo kusy) a ikona v `public/icons/resources/`; 2. pád množného
 * čísla pro věty kroniky („kg obilí“).
 */
export const TRADE_GOOD_NAMES: Record<
  TradeGood,
  { name: string; genitive: string; unit: 'kg' | 'ks'; icon: string }
> = {
  grain: { name: 'Obilí', genitive: 'obilí', unit: 'kg', icon: 'food' },
  meat: { name: 'Maso', genitive: 'masa', unit: 'kg', icon: 'meat' },
  cheese: { name: 'Sýr', genitive: 'sýra', unit: 'kg', icon: 'cheese' },
  legumes: { name: 'Luštěniny', genitive: 'luštěnin', unit: 'kg', icon: 'legumes' },
  cattle: { name: 'Dobytek', genitive: 'krav', unit: 'ks', icon: 'cow' },
  logs: { name: 'Klády', genitive: 'klád', unit: 'ks', icon: 'wood' },
  pottery: { name: 'Keramika', genitive: 'keramiky', unit: 'kg', icon: 'pottery' },
  tools: { name: 'Nástroje', genitive: 'nástrojů', unit: 'kg', icon: 'tools' },
  charcoal: { name: 'Uhlí', genitive: 'uhlí', unit: 'kg', icon: 'charcoal' },
};

/** Lidé ve výměně se sousedem (trade.md – Výměna lidí): rodina a svobodný dospělý. */
export type PeopleKind = 'family' | 'adult';

/** Lidé – název a ikona v `public/icons/resources/` (dospělý ikonou muže, muž i žena). */
export const PEOPLE_NAMES: Record<PeopleKind, { name: string; icon: string }> = {
  family: { name: 'Rodina – muž, žena a jejich děti', icon: 'family' },
  adult: { name: 'Svobodný dospělý – muž nebo žena 16–44 let', icon: 'man' },
};

/** Česky skloňované počty – 1, 2–4, 5 a víc. */
function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/**
 * Kolik soused ještě vezme nebo má, ve 4. pádě s jednotkou (popisek řádku obchodu): „1 500 kg“,
 * „4 kusy“, „1 rodinu“, „2 dospělé“.
 */
export function tradeAmountText(n: number, unit: 'kg' | 'ks' | PeopleKind): string {
  const count = formatInteger(n);
  switch (unit) {
    case 'kg':
      return `${count} kg`;
    case 'ks':
      return `${count} ${plural(n, 'kus', 'kusy', 'kusů')}`;
    case 'family':
      return `${count} ${plural(n, 'rodinu', 'rodiny', 'rodin')}`;
    case 'adult':
      return `${count} ${plural(n, 'dospělého', 'dospělé', 'dospělých')}`;
  }
}

/** Lidé ve výměně („1 rodina a 2 dospělí“); nikdo – prázdný text. */
export function peopleText(people: TradePeople | undefined): string {
  if (!people) return '';
  const parts = [
    people.families > 0
      ? `${formatInteger(people.families)} ${plural(people.families, 'rodina', 'rodiny', 'rodin')}`
      : '',
    people.adults > 0
      ? `${formatInteger(people.adults)} ${plural(people.adults, 'dospělý', 'dospělí', 'dospělých')}`
      : '',
  ].filter((p) => p !== '');
  return parts.join(' a ');
}

/** Krátký řádek a věta kroniky, kdo přišel od souseda (trade.md – Výměna lidí). */
export const NEWCOMER_TEXTS: Record<NewcomerGroup, { notice: string; chronicle: string }> = {
  family: { notice: 'Přišla rodina', chronicle: 'přišla rodina' },
  man: { notice: 'Přišel muž', chronicle: 'přišel svobodný muž' },
  woman: { notice: 'Přišla žena', chronicle: 'přišla svobodná žena' },
};

/** Množství zboží s jednotkou („120 kg obilí“, „2 ks krav“) – pro kroniku. */
export function goodsText(goods: TradeGoods): string {
  const items = (Object.entries(goods) as [TradeGood, number][])
    .filter(([, amount]) => amount > 0)
    .map(([good, amount]) => {
      const { unit, genitive } = TRADE_GOOD_NAMES[good];
      return `${formatInteger(amount)} ${unit} ${genitive}`;
    });
  return items.length > 0 ? items.join(', ') : 'nic';
}
