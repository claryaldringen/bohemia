import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILD_ITEMS, type BuildItem } from '@/lib/build-items';
import { BuildGrid } from '../BuildGrid';

// Mřížka staveb: ohrada je jen rozcestník druhů (oxen.md – Ohrady podle druhu).

const OPTIONS: Partial<Record<BuildItem['kind'], null>> = Object.fromEntries(
  BUILD_ITEMS.map((item) => [item.kind, null]),
);

const labels = (html: string): string[] =>
  [...html.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]!);

describe('BuildGrid – rozcestník ohrady', () => {
  it('bez rozcestníku nabízí všechny stavby, ohradu jedním tlačítkem', () => {
    const html = renderToStaticMarkup(
      <BuildGrid options={OPTIONS} active={null} disabled={false} onBuild={() => undefined} />,
    );
    const shown = labels(html);
    expect(shown).toContain('Ohrada');
    expect(shown).toContain('Zemnice');
    expect(shown).not.toContain('Ohrada ovcí');
    expect(html).not.toContain('data-group');
  });

  it('otevřená ohrada: ohrada (zpět) a pět druhů, druhy bez zkratky', () => {
    const html = renderToStaticMarkup(
      <BuildGrid
        options={OPTIONS}
        active={null}
        disabled={false}
        group="pen"
        onBuild={() => undefined}
      />,
    );
    expect(labels(html)).toEqual([
      'Ohrada',
      'Ohrada ovcí',
      'Ohrada koz',
      'Ohrada prasat',
      'Ohrada skotu',
      'Ohrada spřežení',
    ]);
    expect(html).toContain('data-group="pen"');
    expect(html).toContain('/icons/resources/sheep.png');
    // zkratku má jen stavba, ne druhy
    expect(html.match(/aria-keyshortcuts=/g)).toHaveLength(1);
  });

  it('rozcestník stavby, kterou ves nenabízí, se neotevře', () => {
    const withoutPen = Object.fromEntries(
      Object.entries(OPTIONS).filter(([kind]) => kind !== 'pen'),
    );
    const html = renderToStaticMarkup(
      <BuildGrid
        options={withoutPen}
        active={null}
        disabled={false}
        group="pen"
        onBuild={() => undefined}
      />,
    );
    expect(labels(html)).toContain('Zemnice');
    expect(labels(html)).not.toContain('Ohrada');
  });
});
