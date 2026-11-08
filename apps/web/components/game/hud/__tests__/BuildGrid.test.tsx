import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILD_ITEMS, type BuildItem } from '@/lib/build-items';
import { BuildGrid } from '../BuildGrid';
import { isBuildAffordable, type BuildOption } from '@/lib/village-view';

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

  it('otevřená ohrada: ohrada (zpět) a šest druhů, druhy bez zkratky', () => {
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
      'Ohrada volů',
      'Ohrada koní',
    ]);
    expect(html).toContain('data-group="pen"');
    expect(html).toContain('/icons/resources/sheep.png');
    expect(html).toContain('/icons/resources/horse.png');
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

describe('BuildGrid – rozšíření ohrady koní', () => {
  // ves nemá přebytek na koně (affordable false), na rozšíření ale stačí suroviny
  const horsePen: BuildOption = {
    laborManDays: 40,
    perHa: false,
    perSquare: false,
    upfront: [],
    blocked: null,
    affordable: true,
    variants: {
      horse: {
        laborManDays: 50,
        upfront: [],
        affordable: false,
        blocked: 'Na koně nestačí přebytek hřiven, zvířat ani obilí.',
        payment: [],
        extendAffordable: true,
      },
    },
  };
  const horseButton = (html: string): string =>
    html.match(/<button[^>]*aria-label="Ohrada koní"[^>]*>/)![0];

  it('nová ohrada koní bez přebytku je zašedlá, rozšíření vybrané ohrady ne', () => {
    const render = (extendingVariant: string | null): string =>
      renderToStaticMarkup(
        <BuildGrid
          options={{ ...OPTIONS, pen: horsePen }}
          active={null}
          disabled={false}
          group="pen"
          extendingVariant={extendingVariant}
          onBuild={() => undefined}
        />,
      );
    expect(horseButton(render(null))).toContain('disabled');
    expect(horseButton(render('horse'))).not.toContain('disabled');
    expect(isBuildAffordable(horsePen, 'horse')).toBe(false);
    expect(isBuildAffordable(horsePen, 'horse', true)).toBe(true);
    expect(isBuildAffordable(horsePen, 'sheep')).toBe(true);
  });
});

describe('BuildGrid – rozcestník opevnění (Hradby a obrana – Druhy)', () => {
  const button = (html: string, label: string): string =>
    html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))![0];
  const render = (blockedVariants?: Record<string, string>): string =>
    renderToStaticMarkup(
      <BuildGrid
        options={OPTIONS}
        active={null}
        disabled={false}
        group="fortification"
        {...(blockedVariants ? { blockedVariants } : {})}
        onBuild={() => undefined}
      />,
    );

  it('druhy plot, palisáda, roštová, komorová a val; roštová před rokem 790 zašedlá', () => {
    const open = render();
    expect(labels(open)).toEqual([
      'Opevnění',
      'Polský plot',
      'Palisáda',
      'Roštová hradba',
      'Komorová hradba',
      'Val s příkopem',
    ]);
    expect(button(open, 'Roštová hradba')).not.toContain('disabled');
    const early = render({
      crib: 'Roštová hradba až od roku 790.',
      chamber: 'Komorová hradba až od roku 830.',
    });
    expect(button(early, 'Roštová hradba')).toContain('disabled');
    expect(button(early, 'Komorová hradba')).toContain('disabled');
    expect(button(early, 'Palisáda')).not.toContain('disabled');
  });
});
