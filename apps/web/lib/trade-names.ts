// Názvy pro dvorec vojvody, zemské stezky a obchod (docs/design/trade.md) – směry, zboží a jeho
// ikony. Čistý modul, smí i do prohlížeče.
import type { Direction8, TradeGood, TradeGoods } from '@bohemia/game';
import { formatInteger } from './village-format';

/** Směry – zkratka, název, šipka a „odkud“ (sever nahoře, +z). */
export const DIRECTION_NAMES: Record<
  Direction8,
  { short: string; name: string; arrow: string; from: string }
> = {
  n: { short: 'S', name: 'sever', arrow: '↑', from: 'ze severu' },
  ne: { short: 'SV', name: 'severovýchod', arrow: '↗', from: 'ze severovýchodu' },
  e: { short: 'V', name: 'východ', arrow: '→', from: 'z východu' },
  se: { short: 'JV', name: 'jihovýchod', arrow: '↘', from: 'z jihovýchodu' },
  s: { short: 'J', name: 'jih', arrow: '↓', from: 'z jihu' },
  sw: { short: 'JZ', name: 'jihozápad', arrow: '↙', from: 'z jihozápadu' },
  w: { short: 'Z', name: 'západ', arrow: '←', from: 'ze západu' },
  nw: { short: 'SZ', name: 'severozápad', arrow: '↖', from: 'ze severozápadu' },
};

/**
 * Zboží – název, jednotka (kg nebo kusy) a ikona v `public/icons/resources/`; 2. pád množného
 * čísla pro věty kroniky („kg soli“).
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
  salt: { name: 'Sůl', genitive: 'soli', unit: 'kg', icon: 'salt' },
  iron: { name: 'Železo', genitive: 'železa', unit: 'kg', icon: 'iron' },
  honey: { name: 'Med', genitive: 'medu', unit: 'kg', icon: 'honey' },
  furs: { name: 'Kožešiny', genitive: 'kožešin', unit: 'ks', icon: 'furs' },
};

/** Množství zboží s jednotkou („120 kg soli“, „2 ks krav“) – pro kroniku. */
export function goodsText(goods: TradeGoods): string {
  const items = (Object.entries(goods) as [TradeGood, number][])
    .filter(([, amount]) => amount > 0)
    .map(([good, amount]) => {
      const { unit, genitive } = TRADE_GOOD_NAMES[good];
      return `${formatInteger(amount)} ${unit} ${genitive}`;
    });
  return items.length > 0 ? items.join(', ') : 'nic';
}
