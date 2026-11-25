// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketOrder, MarketVillage, TradePeople } from '@bohemia/game';
import type { VillageManor } from '@/lib/manor-view';
import { MarketPanel } from '../MarketPanel';
import { MARKET_PEOPLE_DELAY_MS, type MarketPeopleAnswer } from '../use-market-people';

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
  merchantsDay: null,
  arms: [],
  merchantsArrived: null,
  ...over,
});

let mounted: { root: Root; host: HTMLElement } | null = null;

interface MountProps {
  villages?: MarketVillage[] | null;
  error?: string | null;
  market?: VillageManor['market'];
  onSend?: (id: string, order: MarketOrder) => Promise<string | null>;
  onPeople?: (people: TradePeople) => Promise<MarketPeopleAnswer>;
}

/** Server odpoví, že odejdou všichni vybraní a volných dospělých je dost. */
const allLeave = (people: TradePeople): Promise<MarketPeopleAnswer> =>
  Promise.resolve({ stock: people, adults: 99 });

async function render(props: MountProps): Promise<void> {
  await act(async () => {
    mounted!.root.render(
      <MarketPanel
        villages={props.villages ?? [village()]}
        error={props.error ?? null}
        market={props.market ?? market()}
        onSend={props.onSend ?? (() => Promise.resolve(null))}
        onPeople={props.onPeople ?? allLeave}
        onClose={() => undefined}
      />,
    );
  });
}

async function mount(props: MountProps): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  mounted = { root: createRoot(host), host };
  await render(props);
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
        village({ villageId: 'v-3', name: 'Brod', own: false, travelDays: 1, cells: 2 }),
        village({ villageId: 'v-4', name: 'Dáli', own: false, travelDays: 5, cells: 6 }),
      ],
    });
    const rows = host.querySelectorAll('[data-testid="market-village"]');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain('Lhota');
    expect(rows[0]?.textContent).toContain('Ráno tam, večer zpět');
    expect(rows[0]?.getAttribute('data-own')).toBe('true');
    expect(rows[1]?.textContent).toContain('2 dny cesty');
    expect(rows[2]?.textContent).toContain('1 den cesty');
    expect(rows[3]?.textContent).toContain('5 dní cesty');
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

describe('nové zboží a lidé (plán 3, Úloha 11)', () => {
  it('Dáš nabízí nástroje, nářadí, vozy a lidi s ikonami, nejvýš kolik ves má', async () => {
    const host = await mount({
      market: market({
        stock: { tools: 40, woodTools: 12, twoWheelCarts: 1, families: 1, men: 2, women: 1 },
        adults: 20,
      }),
    });
    for (const good of ['tools', 'woodTools', 'twoWheelCarts', 'families', 'men', 'women']) {
      expect(byId(host, `market-give-${good}`)).not.toBeNull();
    }
    const give = (good: string): HTMLElement => byId(host, `market-give-${good}`)!;
    expect(give('families').querySelector('img[src="/icons/resources/family.png"]')).not.toBeNull();
    expect(give('men').querySelector('img[src="/icons/resources/man.png"]')).not.toBeNull();
    expect(give('women').querySelector('img[src="/icons/resources/woman.png"]')).not.toBeNull();
    expect(give('tools').querySelector('img[src="/icons/resources/tools.png"]')).not.toBeNull();
    // celé kg, ne zlomky; víc než ves má nejde (nástroje 40 kg < krok 100 kg)
    await click(byId(host, 'market-give-tools-plus'));
    expect(give('tools').textContent).toContain('40');
    await click(byId(host, 'market-give-men-plus'));
    await click(byId(host, 'market-give-men-plus'));
    await click(byId(host, 'market-give-men-plus'));
    expect(give('men').textContent).toContain('2');
  });

  it('mince a zbroj: Dáš je ukáže, má-li je ves, Dostaneš mince nenabízí (plán 4, Úloha 1)', async () => {
    const host = await mount({
      market: market({ stock: { grain: 1000, coins: 12, swords: 2 } }),
    });
    expect(byId(host, 'market-give-coins')).not.toBeNull();
    expect(byId(host, 'market-give-swords')).not.toBeNull();
    expect(byId(host, 'market-want-coins')).toBeNull();
    for (const good of ['swords', 'mailShirts', 'helmets']) {
      expect(byId(host, `market-want-${good}`)).not.toBeNull();
    }
  });

  it('zpráva ukáže kováře jako kováře, ne obchodníka s hřivnami', async () => {
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
              crafts: [],
              traders: [{ name: 'Dolany', day: 4, goods: ['ironBars'], smith: true }],
            },
          },
        }),
      ],
    });
    await click(host.querySelector('[data-testid="market-village"] button'));
    const report = byId(host, 'market-report')!;
    expect(report.textContent).toContain('Dolany');
    expect(report.querySelector('img[src="/icons/build/kovar.png"]')).not.toBeNull();
    expect(report.querySelector('img[src="/icons/resources/iron-bars.png"]')).toBeNull();
  });

  it('výprava do vsi, jejíž jméno cizí správce nesmí znát, je „Sousední ves“', async () => {
    const host = await mount({
      market: market({
        trips: [{ key: 'market:a:1', villageName: '', phase: 'out', daysLeft: 2 }],
      }),
    });
    expect(byId(host, 'market-trip')!.textContent).toContain('Sousední ves');
  });
});

describe('lidé na prodej – náhled se doptá serveru (plán 3, Úloha 11, opravné kolo 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Uplyne `ms` (prodleva dotazu) a odpověď serveru dorazí. */
  const wait = async (ms = MARKET_PEOPLE_DELAY_MS): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  const sendButton = (host: HTMLElement): HTMLButtonElement =>
    byId(host, 'market-send') as HTMLButtonElement;
  const stocked = market({ stock: { grain: 1000, families: 1, men: 3, women: 2 }, adults: 20 });

  it('server dostane vybrané počty jednou po poslední změně; do odpovědi náhled chybí a odeslat nejde', async () => {
    const onPeople = vi.fn(allLeave);
    const host = await mount({ market: stocked, onPeople });
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-grain-plus'));
    expect(byId(host, 'market-preview')).not.toBeNull();
    // bez lidí ve výběru se server neptá – náhled je hned
    await wait();
    expect(onPeople).not.toHaveBeenCalled();
    await click(byId(host, 'market-give-men-plus'));
    await wait(MARKET_PEOPLE_DELAY_MS / 2);
    await click(byId(host, 'market-give-men-plus'));
    expect(byId(host, 'market-preview')).toBeNull();
    expect(sendButton(host).disabled).toBe(true);
    await wait();
    expect(onPeople).toHaveBeenCalledTimes(1);
    expect(onPeople).toHaveBeenCalledWith({ families: 0, men: 2, women: 0 });
    expect(byId(host, 'market-preview')).not.toBeNull();
    expect(sendButton(host).disabled).toBe(false);
  });

  it('prodávaní lidé nejsou nosiči: bez volných dospělých podle serveru řekne důvod', async () => {
    const onPeople = vi.fn((people: TradePeople) => Promise.resolve({ stock: people, adults: 0 }));
    const host = await mount({ market: stocked, onPeople });
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-grain-plus'));
    await click(byId(host, 'market-give-families-plus'));
    await wait();
    expect(onPeople).toHaveBeenCalledWith({ families: 1, men: 0, women: 0 });
    expect(byId(host, 'market-preview')).toBeNull();
    expect(sendButton(host).disabled).toBe(true);
    expect(host.textContent).toContain('Na výpravu ves nemá dost dospělých.');
  });

  it('méně skupin, než je vybráno (druhy berou z týchž lidí): důvod jako server', async () => {
    const onPeople = vi.fn((people: TradePeople) =>
      Promise.resolve({ stock: { ...people, women: Math.min(people.women, 1) }, adults: 20 }),
    );
    const host = await mount({ market: stocked, onPeople });
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-women-plus'));
    await click(byId(host, 'market-give-women-plus'));
    await wait();
    expect(sendButton(host).disabled).toBe(true);
    expect(byId(host, 'market-preview')).toBeNull();
  });

  it('chyba dotazu je důvod u odeslání; další změna výběru se zeptá znovu', async () => {
    const onPeople = vi
      .fn<(people: TradePeople) => Promise<MarketPeopleAnswer>>()
      .mockResolvedValueOnce({ error: 'Spojení se serverem selhalo.' })
      .mockImplementation(allLeave);
    const host = await mount({ market: stocked, onPeople });
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-men-plus'));
    await wait();
    expect(sendButton(host).disabled).toBe(true);
    expect(host.textContent).toContain('Spojení se serverem selhalo.');
    await click(byId(host, 'market-give-men-plus'));
    await wait();
    expect(onPeople).toHaveBeenCalledTimes(2);
    expect(byId(host, 'market-preview')).not.toBeNull();
    expect(sendButton(host).disabled).toBe(false);
  });

  it('nový pohled na ves (další den, po odeslání) – server se zeptá znovu na tytéž počty', async () => {
    const onPeople = vi.fn(allLeave);
    const host = await mount({ market: stocked, onPeople });
    await click(host.querySelector('[data-testid="market-village"] button'));
    await click(byId(host, 'market-give-men-plus'));
    await wait();
    expect(byId(host, 'market-preview')).not.toBeNull();
    await render({ market: { ...stocked, day: stocked.day + 1 }, onPeople });
    expect(byId(host, 'market-preview')).toBeNull();
    await wait();
    expect(onPeople).toHaveBeenCalledTimes(2);
    expect(onPeople).toHaveBeenLastCalledWith({ families: 0, men: 1, women: 0 });
    expect(byId(host, 'market-preview')).not.toBeNull();
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
