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
  // dobytek ve třech druzích (trade.md – Dobytek ve třech druzích)
  cows: { name: 'Krávy', genitive: 'krav', unit: 'ks', icon: 'cow' },
  youngOxen: {
    name: 'Mladí voli – do výcviku (2 roky)',
    genitive: 'mladých volů',
    unit: 'ks',
    icon: 'young-ox',
  },
  trainedOxen: {
    name: 'Vycvičení voli – táhnou hned',
    genitive: 'vycvičených volů',
    unit: 'ks',
    icon: 'ox',
  },
  // koně ve třech druzích (horses.md – Nákup a prodej); řádky v panelu a ikony přidá úloha 13
  foals: { name: 'Hříbata', genitive: 'hříbat', unit: 'ks', icon: 'foal' },
  mares: { name: 'Klisny', genitive: 'klisen', unit: 'ks', icon: 'mare' },
  ridingHorses: {
    name: 'Jezdečtí koně',
    genitive: 'jezdeckých koní',
    unit: 'ks',
    icon: 'horse',
  },
  logs: { name: 'Klády', genitive: 'klád', unit: 'ks', icon: 'wood' },
  pottery: { name: 'Keramika', genitive: 'keramiky', unit: 'kg', icon: 'pottery' },
  ironBars: { name: 'Hřivny', genitive: 'hřiven', unit: 'kg', icon: 'iron-bars' },
  charcoal: { name: 'Uhlí', genitive: 'uhlí', unit: 'kg', icon: 'charcoal' },
  // kámen v m³ (trade.md – Kámen); jednotka obchodu je „ks“ = celé m³
  stone: { name: 'Kámen', genitive: 'kamene', unit: 'ks', icon: 'stone' },
};

/**
 * Lidé ve výměně se sousedem (trade.md – Výměna lidí): rodina, svobodný muž a svobodná žena –
 * muži a ženy zvlášť (Martin 19. 10. 2026).
 */
export type PeopleKind = 'family' | 'man' | 'woman';

/** Klíč počtu v `TradePeople` k druhu lidí. */
export const PEOPLE_KEYS: Record<PeopleKind, keyof TradePeople> = {
  family: 'families',
  man: 'men',
  woman: 'women',
};

/** Lidé – název a ikona v `public/icons/resources/`. */
export const PEOPLE_NAMES: Record<PeopleKind, { name: string; icon: string }> = {
  family: { name: 'Rodina – muž, žena a jejich děti', icon: 'family' },
  man: { name: 'Svobodný muž 16–44 let', icon: 'man' },
  woman: { name: 'Svobodná žena 16–44 let', icon: 'woman' },
};

/** Česky skloňované počty – 1, 2–4, 5 a víc. */
function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many;
}

/**
 * Kolik soused ještě vezme nebo má, ve 4. pádě s jednotkou (popisek řádku obchodu): „1 500 kg“,
 * „4 kusy“, „1 rodinu“, „2 muže“, „1 ženu“.
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
    case 'man':
      return `${count} ${plural(n, 'muže', 'muže', 'mužů')}`;
    case 'woman':
      return `${count} ${plural(n, 'ženu', 'ženy', 'žen')}`;
  }
}

/**
 * Lidé ve výměně („1 rodina, 2 muži a 1 žena“); nikdo – prázdný text. Kronika uložená před muži
 * a ženami zvlášť má `adults` („2 dospělí“).
 */
export function peopleText(
  people: (Partial<TradePeople> & { adults?: number }) | undefined,
): string {
  if (!people) return '';
  const part = (n: number | undefined, one: string, few: string, many: string): string =>
    n !== undefined && n > 0 ? `${formatInteger(n)} ${plural(n, one, few, many)}` : '';
  const parts = [
    part(people.families, 'rodina', 'rodiny', 'rodin'),
    part(people.men, 'muž', 'muži', 'mužů'),
    part(people.women, 'žena', 'ženy', 'žen'),
    part(people.adults, 'dospělý', 'dospělí', 'dospělých'),
  ].filter((p) => p !== '');
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} a ${parts[parts.length - 1]}`;
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
