import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WaresView } from '@bohemia/game';
import { WaresStock } from '../selection/wares';

// Zásoby zboží na dvorci (hides-honey.md), mince a zbroj (markets.md – Rozhodnutí plánu 4, bod 12):
// ikony s čísly, slova jen v popiscích.

const wares: WaresView = { hides: 2, furs: 5, sheepFurs: 1, honeyKg: 7, waxKg: 3 };
const render = (w: WaresView | null): string => renderToStaticMarkup(<WaresStock wares={w} />);
const text = (html: string, testId: string): string | undefined =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('WaresStock', () => {
  it('čtyři ikony s čísly', () => {
    const html = render(wares);
    for (const icon of ['hide', 'fur', 'honey', 'wax'])
      expect(html).toContain(`/icons/resources/${icon}.png`);
    expect(text(html, 'wares-hides')).toBe('2');
    expect(text(html, 'wares-furs')).toBe('5');
    expect(text(html, 'wares-honey')).toBe('7');
    expect(text(html, 'wares-wax')).toBe('3');
  });

  it('popisky nesou názvy, kožešiny i ovčí, kůže rozpis malých', () => {
    const html = render(wares);
    expect(html).toContain('>Kůže<');
    expect(html).toContain('>Kožešiny – ovčí 1<');
    expect(html).toContain('>Med<');
    expect(html).toContain('>Vosk<');
    expect(render({ ...wares, smallHides: 6 })).toContain('z toho malých 6');
  });

  it('null i samé nuly nevykreslí nic', () => {
    expect(render(null)).toBe('');
    expect(render({ hides: 0, furs: 0, sheepFurs: 0, honeyKg: 0, waxKg: 0 })).toBe('');
  });
});

describe('WaresStock – mince a zbroj (plán 4)', () => {
  const none: WaresView = { hides: 0, furs: 0, sheepFurs: 0, honeyKg: 0, waxKg: 0 };

  it('mince a každý druh zbroje ikonou s celým číslem, popisek jméno zboží', () => {
    const html = render({ ...wares, coins: 12, arms: { swords: 2, mailShirts: 1, helmets: 3 } });
    for (const icon of ['hide', 'fur', 'honey', 'wax', 'coin', 'sword', 'mail-shirt', 'helmet'])
      expect(html).toContain(`/icons/resources/${icon}.png`);
    expect(text(html, 'wares-coins')).toBe('12');
    expect(text(html, 'wares-swords')).toBe('2');
    expect(text(html, 'wares-mailShirts')).toBe('1');
    expect(text(html, 'wares-helmets')).toBe('3');
    for (const name of ['Mince', 'Meče', 'Kroužkové košile', 'Helmy'])
      expect(html).toContain(`>${name}<`);
    // dosavadní zboží beze změny
    expect(text(html, 'wares-hides')).toBe('2');
  });

  it('velký počet mincí má oddělené tisíce', () => {
    expect(text(render({ ...none, coins: 1200 }), 'wares-coins')).toMatch(/^1\s200$/);
  });

  it('bez mincí a zbroje je řádek jako dřív', () => {
    const html = render(wares);
    expect(html).not.toContain('wares-coins');
    for (const icon of ['coin', 'sword', 'mail-shirt', 'helmet'])
      expect(html).not.toContain(`/icons/resources/${icon}.png`);
    expect(render({ ...wares, coins: 0, arms: { swords: 0 } })).toBe(html);
  });

  it('ves jen s mincemi ukáže jen je, jen se zbrojí jen ji', () => {
    const coins = render({ ...none, coins: 50 });
    expect(text(coins, 'wares-coins')).toBe('50');
    expect(coins.match(/<img/g)).toHaveLength(1);
    const arms = render({ ...none, arms: { helmets: 1 } });
    expect(text(arms, 'wares-helmets')).toBe('1');
    expect(arms.match(/<img/g)).toHaveLength(1);
  });

  it('nula mincí i zbroje nevykreslí nic', () => {
    expect(render({ ...none, coins: 0, arms: { swords: 0 } })).toBe('');
  });
});

describe('WaresStock – zlato a šperky (plán 6)', () => {
  it('zlato a šperky na desetiny gramu (celé bez desetin) s popisky a ikonami', () => {
    const html = render({ ...wares, goldG: 84.9, jewelleryG: 30, jewelleryFactor: 1.5 });
    expect(text(html, 'wares-gold')).toBe('84,9');
    expect(text(html, 'wares-jewellery')).toBe('30');
    expect(html).toContain('/icons/resources/gold.png');
    expect(html).toContain('/icons/resources/jewellery.png');
    expect(html).toContain('>Zlato – 84,9 g<');
    expect(html).toContain('>Šperky – zlato a mince za 1,5násobek, ještě pro 30 g<');
  });

  it('ves jen se zlatem ukáže jen zlato, bez zlata žádný řádek', () => {
    const zero = { hides: 0, furs: 0, sheepFurs: 0, honeyKg: 0, waxKg: 0 };
    const only = render({ ...zero, goldG: 12 });
    expect(text(only, 'wares-gold')).toBe('12');
    expect(only).not.toContain('wares-jewellery');
    expect(render(wares)).not.toContain('wares-gold');
    expect(render({ ...wares, goldG: 0, jewelleryG: 0 })).not.toContain('wares-jewellery');
  });

  it('zlato a šperky pod 0,05 g se neukážou – na desetiny by to bylo „Zlato – 0 g“', () => {
    const zero = { hides: 0, furs: 0, sheepFurs: 0, honeyKg: 0, waxKg: 0 };
    expect(render({ ...zero, goldG: 0.04, jewelleryG: 0.04, jewelleryFactor: 1.5 })).toBe('');
    const tenth = render({ ...zero, goldG: 0.05, jewelleryG: 0.05, jewelleryFactor: 1.5 });
    expect(text(tenth, 'wares-gold')).toBe('0,1');
    expect(text(tenth, 'wares-jewellery')).toBe('0,1');
    expect(tenth).toContain('>Zlato – 0,1 g<');
  });
});
