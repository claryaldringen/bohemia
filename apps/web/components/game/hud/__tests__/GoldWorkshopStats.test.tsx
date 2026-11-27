import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GoldWorkshopStats } from '../selection/crafts';

// Panely dílen zlata (gold.md, plán 6): čísla s ikonami, slova v popiscích.
const render = (gold: Parameters<typeof GoldWorkshopStats>[0]['gold']): string =>
  renderToStaticMarkup(<GoldWorkshopStats gold={gold} />);
const text = (html: string, testId: string): string | undefined =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('GoldWorkshopStats', () => {
  it('rýžovník: náplavy, zbytek v popisku a cesta v metrech', () => {
    const html = render({
      craft: 'panner',
      placersLeft: 2,
      leftG: 900,
      walkM: 240,
      season: { from: 4, to: 10 },
    });
    expect(text(html, 'selection-workshop-placers')).toBe('2');
    expect(html).toContain('v současném zbývá 900 g');
    expect(text(html, 'selection-workshop-placer-walk')).toBe('240 m');
  });

  it('šperkař: výhoda a kov; mincovna: zlato', () => {
    const j = render({ craft: 'jeweller', wroughtG: 30, materialG: 140.4, factor: 1.5 });
    expect(j).toContain('Šperky – zlato a mince za 1,5násobek, ještě pro 30 g');
    expect(text(j, 'selection-workshop-wrought')).toBe('30');
    expect(text(j, 'selection-workshop-material')).toBe('140,4');
    const other = render({ craft: 'jeweller', wroughtG: 30, materialG: 140, factor: 2 });
    expect(other).toContain('za 2násobek');
    expect(text(render({ craft: 'minter', goldG: 9.2 }), 'selection-workshop-mint-gold')).toBe(
      '9,2',
    );
  });
});
