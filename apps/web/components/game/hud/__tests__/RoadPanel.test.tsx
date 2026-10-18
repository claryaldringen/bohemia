import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { SelectionPanel } from '../SelectionPanel';

// Panel pevné cesty (roads.md – Co hráč vidí): stupeň, délka, stáří, stromy a vylepšení.

const road = (
  over: Partial<Extract<SelectionDetails, { kind: 'road' }>> = {},
): SelectionDetails => ({
  kind: 'road',
  id: 4,
  grade: 'trodden',
  lengthM: 120,
  ageYears: 7,
  trees: 3,
  wetM: 18,
  fords: 1,
  building: null,
  upgrades: [
    { upgrade: 'improved', laborManDays: 18, trees: 0, treesToFell: 0, blocked: null },
    {
      upgrade: 'causeway',
      laborManDays: 33,
      trees: 13,
      treesToFell: 5,
      blocked: 'Nejdřív je potřeba cestu upravit.',
    },
  ],
  ...over,
});

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(
    <SelectionPanel details={details} onUpgradeRoad={() => Promise.resolve()} />,
  );

const button = (html: string, upgrade: string): string | undefined =>
  new RegExp(`<button[^>]*data-testid="road-upgrade-${upgrade}"[^>]*>`).exec(html)?.[0];

describe('SelectionPanel – pevná cesta', () => {
  it('portrét stupně, délka, stáří, stromy a mokřina s brody', () => {
    const html = render(road());
    expect(html).toContain('data-kind="road"');
    expect(html).toContain('/icons/build/cesta.png');
    expect(html).toContain('Vyšlapaná cesta');
    expect(html).toContain('120 m');
    expect(html).toMatch(/data-testid="selection-road-age"[^>]*>7</);
    expect(html).toMatch(/data-testid="selection-road-trees"[^>]*>3</);
    expect(html).toContain('18 m · 1×');
  });

  it('tlačítka vylepšení s ikonou – nedostupné zašedlé s důvodem', () => {
    const html = render(road());
    expect(button(html, 'improved')).not.toContain('disabled=""');
    expect(button(html, 'causeway')).toContain('disabled=""');
    expect(html).toContain('/icons/build/hat.png');
  });

  it('rozestavěné vylepšení ukáže průběh, hotová hať žádné tlačítko', () => {
    const building = render(
      road({ building: { grade: 'improved', progress: 0.4, treesToFell: 0 }, upgrades: [] }),
    );
    expect(building).toContain('data-testid="selection-progress"');
    const done = render(road({ grade: 'causeway', upgrades: [] }));
    expect(done).toContain('/icons/build/hat.png');
    expect(done).not.toContain('road-upgrade-');
  });
});
