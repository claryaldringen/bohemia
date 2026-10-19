import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DIRECTIONS, type TrailOption } from '@bohemia/game';
import { ManorUpgrades, TrailCompass } from '../ManorPanel';

// Dvorec vojvody v panelu výběru (trade.md – Co hráč vidí): vylepšení vsi ikonami, růžice stezek
// do 8 směrů s cenou v popisku a zašedlé s důvodem.

const option = (
  direction: TrailOption['direction'],
  over: Partial<TrailOption> = {},
): TrailOption => ({
  direction,
  status: 'none',
  progress: 0,
  lengthM: 820,
  laborManDays: 131.4,
  trees: 3,
  treesToFell: 1,
  swathTrees: 0,
  tripDays: 5,
  blocked: null,
  ...over,
});

const trails = DIRECTIONS.map((d) =>
  d === 'N'
    ? option(d, {
        blocked: 'Ke kraji mapy tudy cesta nevede – zahrazuje ji voda nebo sráz.',
        lengthM: null,
      })
    : d === 'E'
      ? option(d, { status: 'built', progress: 1, blocked: 'Stezka tímto směrem už vede.' })
      : d === 'S'
        ? option(d, {
            status: 'building',
            progress: 0.4,
            blocked: 'Stezka tímto směrem se už staví.',
          })
        : option(d),
);

/** Atributy tlačítka s `data-testid`. */
const button = (html: string, testId: string): string | undefined =>
  new RegExp(`<button([^>]*data-testid="${testId}"[^>]*)>`).exec(html)?.[1];

describe('růžice zemských stezek', () => {
  const html = renderToStaticMarkup(<TrailCompass trails={trails} onBuild={() => undefined} />);

  it('8 šipek kolem dvorce, sever nahoře', () => {
    for (const d of DIRECTIONS) expect(html).toContain(`data-testid="trail-${d}"`);
    expect(html.indexOf('trail-NW')).toBeLessThan(html.indexOf('trail-N"'));
    expect(html).toContain('/icons/build/dvorec.png');
  });

  it('volný směr jde, zahrazený zašedlý s důvodem, hotový a rozestavěný nejdou', () => {
    expect(button(html, 'trail-W')).not.toContain('disabled=""');
    expect(button(html, 'trail-N')).toContain('disabled=""');
    expect(html).toContain('zahrazuje ji voda nebo sráz');
    expect(button(html, 'trail-E')).toContain('data-status="built"');
    expect(button(html, 'trail-E')).toContain('disabled=""');
    expect(button(html, 'trail-S')).toContain('data-status="building"');
    expect(html).toContain('width:40%');
  });

  it('cena v popisku: práce, dřevo, délka a dny cesty', () => {
    expect(html).toContain('Zemská stezka – západ');
    expect(html).toContain('131');
    expect(html).toContain('820 m');
  });

  it('stezka lesem: v popisku stromy v průseku (roads.md – Průsek lesem)', () => {
    expect(html).not.toContain('data-testid="swath-trees"');
    const forest = renderToStaticMarkup(
      <TrailCompass trails={[option('W', { swathTrees: 37 })]} onBuild={() => undefined} />,
    );
    expect(forest).toMatch(/data-testid="swath-trees"[^>]*>.*37/);
    expect(forest).toContain('Průsek lesem');
  });
});

describe('vylepšení vsi ve dvorci', () => {
  it('stezka a obchod; obchod bez hotové stezky zašedlý s důvodem', () => {
    const none = trails.map((t) => ({ ...t, status: 'none' as const }));
    const html = renderToStaticMarkup(
      <ManorUpgrades manor={{ dwellingId: 1, trails: none, neighbours: [] }} trade={() => null} />,
    );
    expect(html).toContain('data-testid="manor-trail"');
    expect(button(html, 'manor-trade')).toContain('disabled=""');
    expect(html).toContain('Nejdřív je potřeba postavit zemskou stezku.');
    const built = renderToStaticMarkup(
      <ManorUpgrades manor={{ dwellingId: 1, trails, neighbours: [] }} trade={() => null} />,
    );
    expect(button(built, 'manor-trade')).not.toContain('disabled=""');
  });
});
