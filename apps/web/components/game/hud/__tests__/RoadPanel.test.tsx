import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SelectionDetails } from '@/lib/selection-details';
import { SelectionPanel } from '../SelectionPanel';

// Panel pevné cesty (roads.md – Co hráč vidí): druh, délka, stáří, stromy, vylepšení a jabloně.

const road = (
  over: Partial<Extract<SelectionDetails, { kind: 'road' }>> = {},
): SelectionDetails => ({
  kind: 'road',
  id: 4,
  segments: [4],
  roadKind: 'trodden',
  lengthM: 120,
  kinds: [{ kind: 'trodden', lengthM: 120 }],
  ageYears: 7,
  trees: 3,
  wetM: 18,
  fords: 1,
  building: null,
  upgrades: [
    {
      upgrade: 'improved',
      laborManDays: 18,
      trees: 0,
      treesToFell: 0,
      swathTrees: 0,
      blocked: null,
    },
    {
      upgrade: 'causeway',
      laborManDays: 33,
      trees: 13,
      treesToFell: 5,
      swathTrees: 0,
      blocked: 'Nejdřív je potřeba cestu upravit.',
    },
  ],
  apples: {
    trees: 0,
    bearing: 0,
    planting: null,
    option: { trees: 22, laborManDays: 9.8, blocked: null, warning: null },
  },
  ...over,
});

const render = (details: SelectionDetails): string =>
  renderToStaticMarkup(
    <SelectionPanel
      details={details}
      onUpgradeRoad={() => Promise.resolve()}
      onPlantRoadApples={() => Promise.resolve()}
    />,
  );

const button = (html: string, upgrade: string): string | undefined =>
  new RegExp(`<button[^>]*data-testid="road-upgrade-${upgrade}"[^>]*>`).exec(html)?.[0];
const plantButton = (html: string): string | undefined =>
  /<button[^>]*data-testid="road-plant-apples"[^>]*>/.exec(html)?.[0];

describe('SelectionPanel – pevná cesta', () => {
  it('vyježděná cesta je vlastní druh – portrét a název, ne vyšlapaná s ikonou vozu', () => {
    const html = render(road({ roadKind: 'cart', kinds: [{ kind: 'cart', lengthM: 120 }] }));
    expect(html).toContain('Vyježděná cesta');
    expect(html).toContain('/icons/build/cesta-vyjezdena.png');
    expect(html).not.toContain('Vyšlapaná cesta');
    expect(html).not.toContain('Vozová cesta');
    expect(html).not.toContain('/icons/resources/cart.png');
    expect(render(road())).not.toContain('Vyježděná cesta');
  });

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

  it('cesta z víc druhů (navazující úseky – jedna cesta): délka po druzích, vyježděná zvlášť', () => {
    const single = render(road());
    expect(single).not.toContain('data-testid="selection-road-trodden"');
    expect(single).not.toContain('data-testid="selection-road-cart"');
    const html = render(
      road({
        segments: [4, 7, 9],
        roadKind: 'improved',
        lengthM: 180,
        kinds: [
          { kind: 'trodden', lengthM: 40 },
          { kind: 'cart', lengthM: 30 },
          { kind: 'improved', lengthM: 110 },
        ],
      }),
    );
    expect(html).toContain('Upravená cesta');
    expect(html).toContain('180 m');
    expect(html).toMatch(/data-testid="selection-road-trodden"[^>]*>40 m</);
    expect(html).toMatch(/data-testid="selection-road-cart"[^>]*>30 m</);
    expect(html).toMatch(/data-testid="selection-road-improved"[^>]*>110 m</);
    expect(html).toContain('/icons/build/cesta-upravena.png');
    expect(html).toContain('/icons/build/cesta-vyjezdena.png');
    expect(html).toContain('Vyježděná cesta');
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
    const done = render(road({ roadKind: 'causeway', upgrades: [] }));
    expect(done).toContain('/icons/build/hat.png');
    expect(done).not.toContain('road-upgrade-');
  });

  it('Vysadit jabloně – ikona, cena v popisku; bez volného místa zašedlé s důvodem', () => {
    const html = render(road());
    expect(plantButton(html)).not.toContain('disabled=""');
    expect(html).toContain('/icons/build/jablone.png');
    expect(html).not.toContain('selection-road-apples');
    const full = render(
      road({
        apples: {
          trees: 18,
          bearing: 12,
          planting: null,
          option: {
            trees: 0,
            laborManDays: 0,
            blocked: 'Podél cesty není volné místo.',
            warning: null,
          },
        },
      }),
    );
    expect(plantButton(full)).toContain('disabled=""');
    expect(full).toContain('Podél cesty není volné místo.');
    expect(full).toMatch(/data-testid="selection-road-apples"[^>]*>18 \(12\)</);
  });

  it('jabloně na poli: v popisku oranžově, že se pole zmenší (sázet jde)', () => {
    const html = render(
      road({
        apples: {
          trees: 0,
          bearing: 0,
          planting: null,
          option: { trees: 6, laborManDays: 2.7, blocked: null, warning: 'Pole se zmenší' },
        },
      }),
    );
    expect(html).toMatch(/data-testid="road-apples-warning"[^>]*>Pole se zmenší</);
    expect(plantButton(html)).not.toContain('disabled=""');
  });

  it('rozestavěná výsadba jabloní ukáže průběh', () => {
    const html = render(
      road({
        apples: {
          trees: 0,
          bearing: 0,
          planting: { trees: 20, progress: 0.25, waits: true },
          option: {
            trees: 0,
            laborManDays: 0,
            blocked: 'Jabloně se tu už sázejí.',
            warning: null,
          },
        },
      }),
    );
    expect(html).toContain('data-testid="selection-apples-progress"');
    expect(html).toContain('data-testid="selection-apples-waits"');
    expect(plantButton(html)).toContain('disabled=""');
  });

  it('tlačítka vylepšení a jabloní jsou vpravo za čarou vedle sebe, údaje vlevo', () => {
    const html = render(road());
    const commands = html.indexOf('data-testid="selection-commands" data-row="true"');
    expect(commands).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="selection-length"')).toBeLessThan(commands);
    expect(html.indexOf('data-testid="road-upgrade-improved"')).toBeGreaterThan(commands);
    expect(html.indexOf('data-testid="road-plant-apples"')).toBeGreaterThan(commands);
  });
});
