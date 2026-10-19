import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VillageListItem } from '@/lib/village-list';
import { VillageList, VillageSwitcher } from '../VillageSwitcher';

// Přepínač vsí v horní liště (migration.md – Víc vsí jednoho hráče).

const village = (over: Partial<VillageListItem> = {}): VillageListItem => ({
  id: 'v-1',
  settlementId: 's-1',
  name: 'Libice',
  people: 12,
  extinct: false,
  abandoned: false,
  travelling: false,
  hungry: false,
  starving: false,
  ...over,
});
const villages = [
  village(),
  village({ id: 'v-2', name: 'Budeč', people: 4 }),
  village({ id: 'v-3', settlementId: 's-2', name: 'Levý Hradec', people: 0, extinct: true }),
];

describe('VillageSwitcher', () => {
  it('jméno vybrané vsi je tlačítko přepínače (zavřené), vedle tužka na přejmenování', () => {
    const html = renderToStaticMarkup(
      <VillageSwitcher
        name="Libice"
        currentId="v-1"
        villages={villages}
        onSelect={() => undefined}
        onRename={() => Promise.resolve(null)}
      />,
    );
    expect(html).toMatch(/data-testid="village-name"[^>]*aria-haspopup="listbox"/);
    expect(html).toMatch(/data-testid="village-name"[^>]*aria-expanded="false"/);
    expect(html).toContain('>Libice<');
    expect(html).toContain('aria-label="Přejmenovat ves"');
    expect(html).not.toContain('data-testid="village-list"');
  });
});

describe('VillageList', () => {
  it('všechny vsi se jménem a lidmi, vybraná označená, vymřelá zašedlá', () => {
    const html = renderToStaticMarkup(
      <VillageList villages={villages} currentId="v-2" onSelect={() => undefined} />,
    );
    expect(html).toContain('role="listbox"');
    const options = html.match(/<li role="option"[^>]*>/g) ?? [];
    expect(options).toHaveLength(3);
    expect(options[1]).toContain('aria-selected="true"');
    expect(options[0]).toContain('aria-selected="false"');
    expect(html).toMatch(/Libice<\/span>.*people\.png.*>12</);
    expect(html).toMatch(/Budeč<\/span>.*>4</);
    expect(html).toMatch(/opacity-50[^>]*><span[^>]*>Levý Hradec/);
  });

  it('seznam je široký jako nejdelší jméno – jména se nezalamují ani zbytečně nezkracují', () => {
    const html = renderToStaticMarkup(
      <VillageList villages={villages} currentId="v-2" onSelect={() => undefined} />,
    );
    const list = /<ul[^>]*data-testid="village-list"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(list.split(' ')).toEqual(
      expect.arrayContaining([
        'w-max',
        'min-w-56',
        'max-w-[calc(100vw-1rem)]',
        'whitespace-nowrap',
      ]),
    );
  });
});
