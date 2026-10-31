import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import type { VillageManor } from '@/lib/manor-view';
import { SelectionPanel } from '../SelectionPanel';
import { FieldDamage, ManorHunt } from '../selection/wildlife';

// Divoká zvěř v rozhraní (wildlife.md – Co hráč vidí): panel druhu s hrubým stavem, řádek lovu
// a psů na dvorci, škoda zvěře na dílu pole.

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(
    <SelectionPanel
      details={details}
      onRelocate={() => undefined}
      onCancelConstruction={() => Promise.resolve()}
    />,
  );

const text = (html: string, testId: string): string | undefined =>
  new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(html)?.[1];

describe('panel druhu zvěře', () => {
  const species = (
    over: Partial<Extract<SelectionDetails, { kind: 'wildlife' }>> = {},
  ): SelectionDetails => ({
    kind: 'wildlife',
    species: 'boar',
    level: 2,
    full: false,
    capacity: 10,
    lastYearDamageKg: 640,
    killedHeads: null,
    ...over,
  });

  it('ikona druhu, tři stupně plnosti, loňská škoda; slova jen v popisku', () => {
    const html = render(species());
    expect(html).toContain('data-kind="wildlife"');
    expect(html).toContain('/icons/resources/boar.png');
    expect(html).toContain('Divoká prasata');
    expect(html).toMatch(/data-testid="wildlife-level" data-level="2"/);
    expect((html.match(/opacity-25/g) ?? []).length).toBe(1);
    expect(text(html, 'wildlife-damage')).toBe('640');
    expect(html).toContain('Les uživí 10');
    // přesné kusy se nikde neukazují
    expect(html).not.toContain('wildlife-count');
  });

  it('vlci: strhnutý dobytek; plno nad stropem', () => {
    const html = render(
      species({
        species: 'wolf',
        level: 3,
        full: true,
        lastYearDamageKg: null,
        killedHeads: 4,
      }),
    );
    expect(text(html, 'wildlife-killed')).toBe('4');
    expect(html).toContain('data-full="true"');
    expect(html).toContain('plno');
    expect(html).not.toContain('wildlife-damage');
  });
});

describe('lov a psi na dvorci', () => {
  const hunt = {
    catches: [
      { icon: 'boar', name: 'Divoká prasata', count: 2 },
      { icon: 'deer', name: 'Jelení zvěř', count: 1 },
    ],
    meatKg: 140,
    dogs: { count: 6, wanted: 7, grainKgPerDay: 1.8, fed: true },
  };

  it('ikony úlovků s čísly, maso a psi „6 / 7“', () => {
    const html = renderToStaticMarkup(<ManorHunt hunt={hunt} />);
    expect(text(html, 'hunt-boar')).toBe('2');
    expect(text(html, 'hunt-deer')).toBe('1');
    expect(text(html, 'hunt-meat')).toBe('140');
    expect(text(html, 'manor-dogs')).toBe('6 / 7');
    expect(html).toContain('obilí 1,8 kg za den');
    expect(html).not.toContain('data-alert');
  });

  it('psi bez obilí červeně', () => {
    const html = renderToStaticMarkup(
      <ManorHunt hunt={{ ...hunt, dogs: { ...hunt.dogs, fed: false } }} />,
    );
    expect(html).toMatch(/data-testid="manor-dogs" data-alert="true"/);
    expect(html).toContain('jsou bez obilí');
  });

  it('dvorec v panelu obydlí nese řádek lovu', () => {
    const manor: VillageManor = {
      dwellingId: 1,
      huntDenied: null,
      trailBuilt: false,
      neighbours: [],
      hunt,
    };
    expect(manor.hunt?.dogs?.count).toBe(6);
  });
});

describe('škoda zvěře na dílu', () => {
  it('procenta, červeně od 10 %, oheň při hlídce, popisek s lesem', () => {
    const calm = renderToStaticMarkup(
      <FieldDamage damage={{ percent: 6, kg: 20, edgeM: 90, watched: false }} />,
    );
    expect(text(calm, 'selection-damage')).toBe('6 %');
    expect(calm).not.toContain('data-alert');
    expect(calm).not.toContain('selection-watch');
    const bad = renderToStaticMarkup(
      <FieldDamage damage={{ percent: 14, kg: 55, edgeM: 80, watched: true }} />,
    );
    expect(bad).toMatch(/data-testid="selection-damage" data-alert="true"/);
    expect(bad).toContain('watch-fire.png');
    expect(bad).toContain('les je 80 m daleko');
  });
});
