import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WaresView } from '@bohemia/game';
import { WaresStock } from '../selection/wares';

// Zásoby zboží na dvorci (hides-honey.md): ikony s čísly, slova jen v popiscích.

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
