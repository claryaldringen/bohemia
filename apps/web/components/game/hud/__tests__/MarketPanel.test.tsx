// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketOrder, MarketVillage } from '@bohemia/game';
import type { VillageManor } from '@/lib/manor-view';
import { MarketPanel } from '../MarketPanel';

// Panel Trh (markets.md – Pravidla 8 a 9): přehled vsí, zpráva na pivo, sestavení výpravy
// a výpravy na cestě. Panel jen ukazuje a posílá záměr – důvody bere z náhledu jádra.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const village = (over: Partial<MarketVillage> = {}): MarketVillage => ({
  villageId: 'v-lhota',
  name: 'Lhota',
  houseName: null,
  own: true,
  cells: 1,
  travelDays: 0,
  blocked: null,
  news: null,
  seen: null,
  ...over,
});

const market = (over: Partial<VillageManor['market']> = {}): VillageManor['market'] => ({
  stock: { grain: 1000, logs: 5 },
  homeCarts: [],
  oxenHome: 0,
  adults: 8,
  day: 10,
  trips: [],
  ...over,
});

let mounted: { root: Root; host: HTMLElement } | null = null;

async function mount(props: {
  villages?: MarketVillage[] | null;
  error?: string | null;
  market?: VillageManor['market'];
  onSend?: (id: string, order: MarketOrder) => Promise<string | null>;
}): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  await act(async () => {
    root.render(
      <MarketPanel
        villages={props.villages ?? [village()]}
        error={props.error ?? null}
        market={props.market ?? market()}
        onSend={props.onSend ?? (() => Promise.resolve(null))}
        onClose={() => undefined}
      />,
    );
  });
  return host;
}

afterEach(async () => {
  if (mounted) {
    const { root, host } = mounted;
    await act(async () => root.unmount());
    host.remove();
    mounted = null;
  }
});

const byId = (host: HTMLElement, id: string): HTMLElement | null =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = async (el: Element | null): Promise<void> => {
  await act(async () => (el as HTMLElement).click());
};

describe('přehled vsí', () => {
  it('řádek vsi nese jméno, dny cesty v popisku a vlastní rod', async () => {
    const host = await mount({
      villages: [
        village(),
        village({ villageId: 'v-2', name: 'Dolany', own: false, travelDays: 2, cells: 3 }),
      ],
    });
    const rows = host.querySelectorAll('[data-testid="market-village"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('Lhota');
    expect(rows[0]?.textContent).toContain('Ráno tam, večer zpět');
    expect(rows[0]?.getAttribute('data-own')).toBe('true');
    expect(rows[1]?.textContent).toContain('2 dní cesty');
    expect(rows[1]?.getAttribute('data-own')).toBe('false');
  });

  it('zašedlá ves je zakázaná a má důvod v popisku', async () => {
    const host = await mount({
      villages: [village({ blocked: 'Ves zanikla.' })],
    });
    const row = byId(host, 'market-village')!;
    expect(row.getAttribute('data-blocked')).toBe('true');
    expect(row.querySelector('button')?.disabled).toBe(true);
    expect(row.textContent).toContain('Ves zanikla.');
  });

  it('klik na ves ukáže zprávu; bez zprávy otazník', async () => {
    const host = await mount({
      villages: [
        village({
          news: {
            villageId: 'v-lhota',
            name: 'Lhota',
            report: {
              day: 5,
              people: 40,
              houses: 10,
              crafts: ['smith'],
              traders: [{ name: 'Dolany', day: 4, goods: ['grain', 'logs'] }],
            },
            prices: { grain: 1 },
          },
        }),
        village({ villageId: 'v-2', name: 'Dolany', own: false }),
      ],
    });
    expect(byId(host, 'market-report')).toBeNull();
    const buttons = host.querySelectorAll('[data-testid="market-village"] button');
    await click(buttons[0] ?? null);
    const report = byId(host, 'market-report')!;
    expect(report.textContent).toContain('≈ 40');
    expect(report.textContent).toContain('≈ 10');
    expect(report.textContent).toContain('Dolany');
    expect(report.querySelector('img[src="/icons/build/kovar.png"]')).not.toBeNull();
    expect(report.querySelector('img[src="/icons/resources/balance.png"]')).not.toBeNull();
    expect(report.textContent).toMatch(/Zpráva z \d+\. /);
    await click(buttons[1] ?? null);
    expect(byId(host, 'market-report')!.textContent).toContain('?');
  });
});

describe('sestavení výpravy', () => {
  it('výběr zboží přepočítá náhled (nosiči, vozy, dny pryč)', async () => {
    const host = await mount({ market: market({ adults: 100 }) });
    await click(host.querySelector('[data-testid="market-village"] button'));
    expect(byId(host, 'market-preview')).toBeNull();
    await click(byId(host, 'market-give-grain-plus'));
    expect(byId(host, 'market-give-grain')!.textContent).toContain('100');
    const first = byId(host, 'market-preview')!.textContent;
    expect(first).toMatch(/\d/);
    for (let i = 0; i < 9; i++) await click(byId(host, 'market-give-grain-plus'));
    expect(byId(host, 'market-give-grain')!.textContent).toContain('1 000');
    expect(byId(host, 'market-preview')!.textContent).not.toBe(first);
    // víc než ve skladu nejde
    await click(byId(host, 'market-give-grain-plus'));
    expect(byId(host, 'market-give-grain')!.textContent).toContain('1 000');
    await click(byId(host, 'market-want-logs-plus'));
    expect(byId(host, 'market-want-logs')!.textContent).toContain('1');
  });

  it('dny na trhu: nejméně jeden', async () => {
    const host = await mount({});
    expect(byId(host, 'market-stay')!.textContent).toContain('1');
    await click(byId(host, 'market-stay-minus'));
    expect(byId(host, 'market-stay')!.textContent).toContain('1');
    await click(byId(host, 'market-stay-plus'));
    expect(byId(host, 'market-stay')!.textContent).toContain('2');
  });

  it('bez vybrané vsi a bez lidí je odeslání zakázané s důvodem náhledu', async () => {
    const host = await mount({ market: market({ adults: 0 }) });
    expect((byId(host, 'market-send') as HTMLButtonElement).disabled).toBe(true);
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-grain-plus'));
    expect((byId(host, 'market-send') as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain('Na výpravu ves nemá dost dospělých.');
  });

  it('odeslání pošle cíl a objednávku; odmítnutí serveru ukáže market-error do změny výběru', async () => {
    const onSend = vi.fn(() => Promise.resolve('Ves nemá dost obilí.'));
    const host = await mount({ onSend });
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-grain-plus'));
    await click(byId(host, 'market-want-logs-plus'));
    await click(byId(host, 'market-send'));
    expect(onSend).toHaveBeenCalledWith('v-lhota', {
      give: { grain: 100 },
      wants: { logs: 1 },
      stayDays: 1,
    });
    expect(byId(host, 'market-error')!.textContent).toContain('Ves nemá dost obilí.');
    await click(byId(host, 'market-give-grain-plus'));
    expect(byId(host, 'market-error')).toBeNull();
  });

  it('povedené odeslání vyčistí výběr a chybu', async () => {
    const host = await mount({ onSend: () => Promise.resolve(null) });
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-grain-plus'));
    await click(byId(host, 'market-send'));
    expect(byId(host, 'market-error')).toBeNull();
    expect(byId(host, 'market-give-grain')!.textContent).not.toContain('100');
  });
});

describe('výpravy na cestě', () => {
  it('každá výprava má jméno vsi, dny do návratu a fázi v popisku', async () => {
    const host = await mount({
      market: market({
        trips: [
          { key: 'market:a:1', villageName: 'Lhota', phase: 'out', daysLeft: 4 },
          { key: 'market:a:2', villageName: 'Dolany', phase: 'waiting', daysLeft: 0 },
        ],
      }),
    });
    const trips = host.querySelectorAll('[data-testid="market-trip"]');
    expect(trips).toHaveLength(2);
    expect(trips[0]?.textContent).toContain('Lhota');
    expect(trips[0]?.textContent).toContain('4');
    expect(trips[0]?.textContent).toContain('Na cestě na trh');
    expect(trips[1]?.textContent).toContain('Čeká na zboží');
  });

  it('bez výprav nic', async () => {
    const host = await mount({});
    expect(byId(host, 'market-trip')).toBeNull();
  });
});
