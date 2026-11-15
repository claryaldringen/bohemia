import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BUILD_ITEMS, type BuildItem } from '@/lib/build-items';
import { BuildGrid } from '../BuildGrid';
import {
  FOUNDING_DWELLING_OPTION,
  dwellingHubOption,
  isBuildAffordable,
  type BuildOption,
} from '@/lib/village-view';

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
    expect(shown).toContain('Obydlí');
    // druhy obydlí mají zkratku, ale ne vlastní tlačítko
    expect(shown).not.toContain('Zemnice');
    expect(shown).not.toContain('Polozemnice');
    expect(shown).not.toContain('Nadzemní dům');
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
    expect(labels(html)).toContain('Obydlí');
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

describe('BuildGrid – rozcestník obydlí', () => {
  const option = (over: Partial<BuildOption> = {}): BuildOption => ({
    laborManDays: 10,
    perHa: false,
    perSquare: false,
    upfront: [],
    blocked: null,
    affordable: true,
    ...over,
  });
  const build = {
    zemnice: option(),
    polozemnice: option(),
    vypleteny: option({ affordable: false, blocked: 'Od roku 750' }),
    srub: option({ affordable: false, blocked: 'Od roku 800' }),
  };
  const render = (group: 'dwelling' | null): string =>
    renderToStaticMarkup(
      <BuildGrid
        options={{ ...OPTIONS, ...build, dwelling: dwellingHubOption(build) }}
        active={null}
        disabled={false}
        group={group}
        onBuild={() => undefined}
      />,
    );
  const button = (html: string, label: string): string =>
    html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))![0];

  it('zavřený: jediné tlačítko Obydlí s ikonou nejlepšího druhu, který ves postaví', () => {
    const html = render(null);
    expect(labels(html).filter((l) => /Obydlí|emnice|dům/.test(l))).toEqual(['Obydlí']);
    // nadzemní domy jsou zašedlé (do roku 750 a 800), nejlepší dostupná je polozemnice
    expect(dwellingHubOption(build).look).toEqual({ icon: 'polozemnice', name: 'Obydlí' });
    expect(html).toContain('/icons/build/polozemnice.png');
    expect(html).toContain('Z / X / 2 / 1');
  });

  it('otevřený: Obydlí (zpět) a čtyři druhy, zašedlý druh nese důvod', () => {
    const html = render('dwelling');
    expect(labels(html)).toEqual([
      'Obydlí',
      'Zemnice',
      'Polozemnice',
      'Vypletený dům',
      'Nadzemní dům',
    ]);
    expect(html).toContain('data-group="dwelling"');
    expect(button(html, 'Zemnice')).not.toContain('disabled');
    expect(button(html, 'Polozemnice')).not.toContain('disabled');
    expect(button(html, 'Vypletený dům')).toContain('disabled');
    expect(button(html, 'Nadzemní dům')).toContain('disabled');
    expect(html).toContain('Od roku 750');
    expect(html).toContain('Od roku 800');
    expect(isBuildAffordable(dwellingHubOption(build), 'srub')).toBe(false);
    expect(isBuildAffordable(dwellingHubOption(build), 'zemnice')).toBe(true);
  });

  it('bez nabídky (zakládá se ves) rozcestník ukáže jen zemnici', () => {
    const html = renderToStaticMarkup(
      <BuildGrid
        options={{ dwelling: FOUNDING_DWELLING_OPTION, zemnice: null }}
        active={null}
        disabled={false}
        group="dwelling"
        onBuild={() => undefined}
      />,
    );
    // hlavní tlačítko je rovnou zemnice (jediný druh)
    expect(labels(html)).toEqual(['Zemnice', 'Zemnice']);
  });
});

describe('BuildGrid – rozcestník řemesla (workshops.md)', () => {
  const option = (over: Partial<BuildOption> = {}): BuildOption => ({
    laborManDays: 10,
    perHa: false,
    perSquare: false,
    upfront: [],
    blocked: null,
    affordable: true,
    ...over,
  });
  const smith = option({
    variants: {
      vypleteny: {
        laborManDays: 12,
        upfront: [],
        affordable: true,
        blocked: null,
      },
      srub: {
        laborManDays: 14,
        upfront: [],
        affordable: false,
        blocked: 'Od roku 800',
      },
    },
  });
  const render = (group: 'smith' | null, options = smith): string =>
    renderToStaticMarkup(
      <BuildGrid
        options={{ ...OPTIONS, smith: options }}
        active={null}
        disabled={false}
        group={group}
        onBuild={() => undefined}
      />,
    );
  const button = (html: string, label: string): string =>
    html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))![0];

  it('zavřený: Kovář je jediné tlačítko řemesla, druhy ne', () => {
    const shown = labels(render(null));
    expect(shown).toContain('Kovář');
    expect(shown).not.toContain('Kovář – Vypletená');
  });

  it('otevřený: Kovář (zpět) a tři druhy, roubená zašedlá s důvodem', () => {
    const html = render('smith');
    expect(labels(html)).toEqual([
      'Kovář',
      'Kovář – Polozemnice',
      'Kovář – Vypletená',
      'Kovář – Roubená',
    ]);
    expect(html).toContain('data-group="smith"');
    expect(button(html, 'Kovář – Polozemnice')).not.toContain('disabled');
    expect(button(html, 'Kovář – Vypletená')).not.toContain('disabled');
    expect(button(html, 'Kovář – Roubená')).toContain('disabled');
    expect(html).toContain('Od roku 800');
    expect(html).toContain('/icons/build/kovar-vypleteny.png');
    expect(html).toContain('/icons/build/kovar-srub.png');
  });

  it('dnešní dílna nejde zaplatit, vypletená ano – tlačítko řemesla zůstane dostupné', () => {
    const cheaper = option({ affordable: false, variants: smith.variants! });
    expect(button(render(null, cheaper), 'Kovář')).not.toContain('disabled');
    const none = option({
      affordable: false,
      variants: {
        vypleteny: { laborManDays: 12, upfront: [], affordable: false, blocked: null },
      },
    });
    expect(button(render(null, none), 'Kovář')).toContain('disabled');
  });
});
