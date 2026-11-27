// @vitest-environment jsdom
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dayIndexOf,
  type ArmsGood,
  type MarketOrder,
  type MarketVillage,
  type TradePeople,
} from '@bohemia/game';
import type { VillageManor } from '@/lib/manor-view';
import type { VillageRightsView } from '@/lib/village-view-types';
import { MarketPanel } from '../MarketPanel';
import { RightsProvider } from '../rights';
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
  goldPrice: 1,
  arms: [],
  merchantsArrived: null,
  slaveSale: null,
  ...over,
});

let mounted: { root: Root; host: HTMLElement } | null = null;

interface MountProps {
  villages?: MarketVillage[] | null;
  error?: string | null;
  market?: VillageManor['market'];
  onSend?: (id: string, order: MarketOrder) => Promise<string | null>;
  onPeople?: (people: TradePeople) => Promise<MarketPeopleAnswer>;
  onOrderArms?: (good: ArmsGood, amount: number) => Promise<string | null>;
  onOfferSlaves?: (count: number) => Promise<string | null>;
  rights?: VillageRightsView | null;
}

/** Server odpoví, že odejdou všichni vybraní a volných dospělých je dost. */
const allLeave = (people: TradePeople): Promise<MarketPeopleAnswer> =>
  Promise.resolve({ stock: people, adults: 99 });

async function render(props: MountProps): Promise<void> {
  await act(async () => {
    mounted!.root.render(
      <RightsProvider value={props.rights ?? null}>
        <MarketPanel
          villages={props.villages ?? [village()]}
          error={props.error ?? null}
          market={props.market ?? market()}
          onSend={props.onSend ?? (() => Promise.resolve(null))}
          onPeople={props.onPeople ?? allLeave}
          onOrderArms={props.onOrderArms ?? (() => Promise.resolve(null))}
          onOfferSlaves={props.onOfferSlaves ?? (() => Promise.resolve(null))}
          onClose={() => undefined}
        />
      </RightsProvider>,
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
    // mince po deseti, nejvýš kolik ves má; popisek je jen „Mince“ (kusů se u mincí neříká)
    const coins = byId(host, 'market-give-coins')!;
    expect(coins.querySelector('[role="tooltip"]')!.textContent).toBe('Mince');
    expect(coins.querySelector('img[src="/icons/resources/coin.png"]')).not.toBeNull();
    const countOf = (): string => byId(host, 'market-give-coins-count')!.textContent;
    await click(byId(host, 'market-give-coins-plus'));
    expect(countOf()).toBe('10');
    // poslední krok nahoru doplní do zásoby (12), dolů jde k nule
    await click(byId(host, 'market-give-coins-plus'));
    expect(countOf()).toBe('12');
    await click(byId(host, 'market-give-coins-minus'));
    expect(countOf()).toBe('2');
    await click(byId(host, 'market-give-coins-minus'));
    expect(countOf()).toBe('0');
    expect(byId(host, 'market-give-swords')!.textContent).toContain('Meče (ks)');
  });

  it('zlato: v obou seznamech po deseti, cena 1 s popiskem; šperkař zvedá cenu a mince', async () => {
    const host = await mount({ market: market({ stock: { grain: 1000, gold: 25, coins: 12 } }) });
    const give = byId(host, 'market-give-gold')!;
    const want = byId(host, 'market-want-gold')!;
    expect(give.textContent).toContain('Zlato (g)');
    expect(want).not.toBeNull();
    await click(byId(host, 'market-give-gold-plus'));
    expect(byId(host, 'market-give-gold-count')!.textContent).toBe('10');
    await click(byId(host, 'market-want-gold-plus'));
    expect(byId(host, 'market-want-gold-count')!.textContent).toBe('10');
    const price = byId(host, 'market-gold-price')!;
    expect(price.textContent).toContain('1');
    expect(price.querySelector('[role="tooltip"]')!.textContent).toBe(
      'Zlato – 1 mince za gram, vždy',
    );
    // bez šperkaře u mincí popisek jen název
    expect(byId(host, 'market-give-coins')!.querySelector('[role="tooltip"]')!.textContent).toBe(
      'Mince',
    );
  });

  it('se šperkařem: popisek ceny zlata i mincí říká 1,5násobek a kolik gramů ještě platí', async () => {
    const host = await mount({
      market: market({ stock: { grain: 1000, gold: 25, coins: 12 }, jewelleryG: 30 }),
    });
    expect(byId(host, 'market-gold-price')!.querySelector('[role="tooltip"]')!.textContent).toBe(
      'Zlato – 1 mince za gram, vždy, se šperkařem 1,5 mince za gram – ještě pro 30 g',
    );
    expect(byId(host, 'market-give-coins')!.querySelector('[role="tooltip"]')!.textContent).toBe(
      'Se šperkařem platí 1,5násobek – ještě pro 30 g',
    );
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

describe('ceny s hladinou a kupci ve zprávě (plán 4)', () => {
  const lhota = (news: Partial<NonNullable<MarketVillage['news']>>): MarketVillage =>
    village({
      news: {
        villageId: 'v-lhota',
        name: 'Lhota',
        report: { day: 5, people: 40, houses: 10, crafts: [], traders: [] },
        ...news,
      },
    });
  const report = async (
    news: Partial<NonNullable<MarketVillage['news']>>,
    today = 10,
  ): Promise<HTMLElement> => {
    const host = await mount({ villages: [lhota(news)], market: market({ day: today }) });
    await click(host.querySelector('[data-testid="market-village"] button'));
    return byId(host, 'market-report')!;
  };
  /** Cena u ikony zboží v řádku cen. */
  const price = (el: HTMLElement, icon: string): string | undefined =>
    [...el.querySelectorAll('[data-testid="market-prices"] > span')]
      .find((s) => s.querySelector(`img[src="/icons/resources/${icon}.png"]`))
      ?.lastChild?.textContent?.trim();
  const traders = [
    { name: 'Dolany', day: 4, goods: ['grain' as const] },
    { name: '', day: 5, goods: ['swords' as const, 'helmets' as const], merchants: true as const },
    { name: '', day: 3, goods: ['logs' as const] },
  ];

  it('cena v mincích je cena trhu × hladina ze zprávy; chybí-li, hladina 1', async () => {
    const doubled = await report({ prices: { furs: 8 / 15, swords: 120 }, level: 2 });
    expect(price(doubled, 'fur')).toBe('1,1');
    expect(price(doubled, 'sword')).toBe('240');
  });

  it('bez hladiny jsou ceny jako dřív', async () => {
    const plain = await report({ prices: { furs: 8 / 15, swords: 120 } });
    expect(price(plain, 'fur')).toBe('0,53');
    expect(price(plain, 'sword')).toBe('120');
  });

  it('obchodník s příznakem kupců je „Kupci“ s ikonou, bez jména „Sousední ves“', async () => {
    const el = await report({ report: { day: 5, people: 40, houses: 10, crafts: [], traders } });
    const rows = [...el.querySelectorAll('[data-testid="market-trader"]')];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Dolany');
    expect(rows[0]?.querySelector('img[src="/icons/resources/merchants.png"]')).toBeNull();
    expect(rows[1]?.textContent).toContain('Kupci');
    expect(rows[1]?.textContent).not.toContain('Sousední ves');
    expect(rows[1]?.querySelector('img[src="/icons/resources/merchants.png"]')).not.toBeNull();
    expect(rows[1]?.querySelector('img[src="/icons/resources/sword.png"]')).not.toBeNull();
    // obchodník bez jména (cizí správce jméno vsi nesmí znát) zůstává sousední ves
    expect(rows[2]?.textContent).toContain('Sousední ves');
  });

  it('obchodník { name: "", merchants: true } je „Kupci“, ne „Sousední ves“', async () => {
    const el = await report({
      report: {
        day: 5,
        people: 40,
        houses: 10,
        crafts: [],
        traders: [{ name: '', day: 5, goods: ['swords' as const], merchants: true as const }],
      },
    });
    const row = el.querySelector('[data-testid="market-trader"]')!;
    expect(row.textContent).toContain('Kupci');
    expect(row.textContent).not.toContain('Sousední ves');
  });

  it('den příštích kupců stojí nad obchodníky; bez něj nic', async () => {
    const merchants = dayIndexOf({ year: 500, month: 8, day: 12 });
    const el = await report({
      report: { day: 5, people: 40, houses: 10, crafts: [], traders, merchants },
    });
    const next = byId(el, 'market-report-merchants')!;
    expect(next.textContent).toContain('Kupci přijedou 12. 8.');
    expect(next.querySelector('img[src="/icons/resources/merchants.png"]')).not.toBeNull();
    const first = el.querySelector('[data-testid="market-trader"]')!;
    expect(next.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('bez dne příštích kupců ve zprávě řádek chybí', async () => {
    const el = await report({ report: { day: 5, people: 40, houses: 10, crafts: [], traders } });
    expect(byId(el, 'market-report-merchants')).toBeNull();
    expect(el.textContent).not.toContain('přijedou');
  });

  it('den ze staré zprávy, který už minul, se neukáže', async () => {
    const merchants = dayIndexOf({ year: 500, month: 8, day: 12 });
    const news = { report: { day: 5, people: 40, houses: 10, crafts: [], traders: [], merchants } };
    expect(byId(await report(news, merchants + 1), 'market-report-merchants')).toBeNull();
  });
});

describe('zbroj od kupců ve vlastní vsi (plán 4 – Rozhodnutí 15)', () => {
  const arms = (
    ordered: Partial<Record<ArmsGood, number>> = {},
  ): VillageManor['market']['arms'] => [
    { good: 'swords', price: 120, ordered: ordered.swords ?? 0 },
    { good: 'mailShirts', price: 480, ordered: ordered.mailShirts ?? 0 },
    { good: 'helmets', price: 252.5, ordered: ordered.helmets ?? 0 },
  ];
  const merchantsDay = dayIndexOf({ year: 500, month: 8, day: 12 });
  const atTrail = (
    ordered: Partial<Record<ArmsGood, number>> = {},
    over: Partial<VillageManor['market']> = {},
  ): VillageManor['market'] => market({ merchantsDay, arms: arms(ordered), ...over });
  const item = (host: HTMLElement, good: ArmsGood): HTMLElement =>
    byId(host, `market-arms-${good}`)!;
  const count = (host: HTMLElement, good: ArmsGood): string =>
    byId(host, `market-arms-${good}-count`)!.textContent;
  const plus = (host: HTMLElement, good: ArmsGood): HTMLButtonElement =>
    byId(host, `market-arms-${good}-plus`) as HTMLButtonElement;
  const minus = (host: HTMLElement, good: ArmsGood): HTMLButtonElement =>
    byId(host, `market-arms-${good}-minus`) as HTMLButtonElement;

  /** Odpovědi serveru, které test splní sám. */
  function answers(): {
    onOrderArms: ReturnType<typeof vi.fn<(good: ArmsGood, n: number) => Promise<string | null>>>;
    resolve: (index: number, reason: string | null) => Promise<void>;
  } {
    const pending: ((reason: string | null) => void)[] = [];
    return {
      onOrderArms: vi.fn<(good: ArmsGood, n: number) => Promise<string | null>>(
        () => new Promise((r) => pending.push(r)),
      ),
      resolve: async (index, reason) => {
        await act(async () => pending[index]!(reason));
      },
    };
  }

  it('sekce je jen s neprázdnou nabídkou zbroje (ves u stezky)', async () => {
    const host = await mount({ market: market() });
    expect(byId(host, 'market-arms')).toBeNull();
    expect(host.textContent).not.toContain('Kupci');
    await render({ market: atTrail() });
    expect(byId(host, 'market-arms')).not.toBeNull();
  });

  it('ikona zboží, cena v mincích, objednaný počet a den kupců; slova jen v popisku', async () => {
    const host = await mount({ market: atTrail({ swords: 2 }) });
    const swords = item(host, 'swords');
    expect(swords.querySelector('img[src="/icons/resources/sword.png"]')).not.toBeNull();
    expect(swords.querySelector('img[src="/icons/resources/coin.png"]')).not.toBeNull();
    expect(swords.textContent).toContain('120');
    expect(count(host, 'swords')).toBe('2');
    const tooltip = (good: ArmsGood): string | null | undefined =>
      item(host, good).querySelector('[role="tooltip"]')?.textContent;
    expect(tooltip('swords')).toBe('Meče – ves je koupí od kupců za své mince');
    expect(tooltip('mailShirts')).toBe('Kroužkové košile – ves je koupí od kupců za své mince');
    expect(tooltip('helmets')).toBe('Helmy – ves je koupí od kupců za své mince');
    expect(item(host, 'helmets').textContent).toContain('253');
    expect(count(host, 'mailShirts')).toBe('0');
    expect(minus(host, 'mailShirts').disabled).toBe(true);
    const date = byId(host, 'market-arms-date')!;
    expect(date.querySelector('img[src="/icons/resources/date.png"]')).not.toBeNull();
    expect(date.textContent).toContain('12. 8.');
    expect(date.querySelector('[role="tooltip"]')!.textContent).toBe('Kupci přijedou 12. 8.');
  });

  it('přijíždějí-li dnes, popisek říká, že jsou ve vsi; bez příjezdu do konce světa datum chybí', async () => {
    const host = await mount({ market: atTrail({}, { day: merchantsDay }) });
    expect(byId(host, 'market-arms-date')!.textContent).toContain('Kupci jsou dnes ve vsi');
    await render({ market: atTrail({}, { merchantsDay: null }) });
    expect(byId(host, 'market-arms-date')).toBeNull();
    expect(byId(host, 'market-arms')).not.toBeNull();
  });

  it('změna počtu pošle objednávku; nula ji zruší', async () => {
    const onOrderArms = vi.fn(() => Promise.resolve(null));
    const host = await mount({ market: atTrail({ helmets: 1 }), onOrderArms });
    await click(plus(host, 'swords'));
    expect(onOrderArms).toHaveBeenLastCalledWith('swords', 1);
    await click(minus(host, 'helmets'));
    expect(onOrderArms).toHaveBeenLastCalledWith('helmets', 0);
    expect(onOrderArms).toHaveBeenCalledTimes(2);
  });

  it('rychlé klikání: změny jdou v pořadí a ukazuje se poslední naklikaný počet, pak ten ze serveru', async () => {
    const { onOrderArms, resolve } = answers();
    const props = { market: atTrail(), onOrderArms };
    const host = await mount(props);
    for (let i = 0; i < 3; i++) await click(plus(host, 'swords'));
    await click(minus(host, 'swords'));
    expect(onOrderArms.mock.calls).toEqual([
      ['swords', 1],
      ['swords', 2],
      ['swords', 3],
      ['swords', 2],
    ]);
    expect(count(host, 'swords')).toBe('2');
    // odpovědi starších změn (a jejich pohled na ves) poslední počet nepřepíšou
    await resolve(0, null);
    await render({ ...props, market: atTrail({ swords: 1 }) });
    expect(count(host, 'swords')).toBe('2');
    await resolve(1, null);
    await resolve(2, null);
    await render({ ...props, market: atTrail({ swords: 3 }) });
    expect(count(host, 'swords')).toBe('2');
    await render({ ...props, market: atTrail({ swords: 2 }) });
    await resolve(3, null);
    expect(count(host, 'swords')).toBe('2');
    // po poslední odpovědi platí server – třeba když kupci mezitím kus prodali
    await render({ ...props, market: atTrail({ swords: 1 }) });
    expect(count(host, 'swords')).toBe('1');
  });

  it('druhy zbroje se neovlivňují', async () => {
    const { onOrderArms, resolve } = answers();
    const host = await mount({ market: atTrail(), onOrderArms });
    await click(plus(host, 'swords'));
    await click(plus(host, 'helmets'));
    await resolve(0, null);
    expect(count(host, 'helmets')).toBe('1');
    expect(count(host, 'swords')).toBe('0');
  });

  it('odmítnutí ukáže důvod u sekce a vrátí počet ze serveru; další změna důvod smaže', async () => {
    const { onOrderArms, resolve } = answers();
    const host = await mount({ market: atTrail({ swords: 1 }), onOrderArms });
    await click(plus(host, 'swords'));
    expect(count(host, 'swords')).toBe('2');
    await resolve(0, 'Do téhle vsi cizí kupci nejezdí.');
    expect(byId(host, 'market-arms-error')!.textContent).toBe('Do téhle vsi cizí kupci nejezdí.');
    expect(byId(host, 'market-error')).toBeNull();
    expect(count(host, 'swords')).toBe('1');
    await click(plus(host, 'helmets'));
    expect(byId(host, 'market-arms-error')).toBeNull();
  });

  it('odmítnutá starší změna nic neohlásí, rozhoduje poslední', async () => {
    const { onOrderArms, resolve } = answers();
    const host = await mount({ market: atTrail(), onOrderArms });
    await click(plus(host, 'swords'));
    await click(plus(host, 'swords'));
    await resolve(0, 'Spojení se serverem selhalo.');
    expect(byId(host, 'market-arms-error')).toBeNull();
    expect(count(host, 'swords')).toBe('2');
    await resolve(1, null);
    expect(byId(host, 'market-arms-error')).toBeNull();
  });

  it('bez práva obchodu je sekce zašedlá s důvodem', async () => {
    const onOrderArms = vi.fn(() => Promise.resolve(null));
    const host = await mount({
      market: atTrail({ swords: 1 }),
      onOrderArms,
      rights: { allowed: [], reason: 'Rozhoduje Bořivoj.' },
    });
    for (const good of ['swords', 'mailShirts', 'helmets'] as const) {
      expect(plus(host, good).disabled).toBe(true);
      expect(minus(host, good).disabled).toBe(true);
      expect(item(host, good).querySelector('[data-testid="rights-reason"]')!.textContent).toBe(
        'Rozhoduje Bořivoj.',
      );
    }
    await click(plus(host, 'swords'));
    expect(onOrderArms).not.toHaveBeenCalled();
    // s právem je volná
    await render({
      market: atTrail({ swords: 1 }),
      onOrderArms,
      rights: { allowed: ['trade'], reason: null },
    });
    expect(plus(host, 'swords').disabled).toBe(false);
    expect(minus(host, 'swords').disabled).toBe(false);
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

describe('prodej otroků ve vlastní vsi (plán 5 – Rozhodnutí 8)', () => {
  const sale = (over: Partial<NonNullable<VillageManor['market']['slaveSale']>> = {}) =>
    ({ stock: 2, forSale: 0, price: 24, ...over }) as VillageManor['market']['slaveSale'];

  it('sekce je jen s ne-null prodejem; ikona, počet, cena v mincích, popisek', async () => {
    const host = await mount({ market: market() });
    expect(byId(host, 'market-slaves')).toBeNull();
    await render({ market: market({ slaveSale: sale() }) });
    const section = byId(host, 'market-slaves')!;
    expect(section.querySelector('img[src="/icons/resources/slave.png"]')).not.toBeNull();
    expect(section.querySelector('img[src="/icons/resources/coin.png"]')).not.toBeNull();
    expect(byId(host, 'market-slaves-stock')!.textContent).toBe('2');
    expect(section.textContent).toContain('24');
    expect(section.querySelector('[role="tooltip"]')!.textContent).toBe(
      'Otroci na prodej – ves je prodá kupcům a výpravám na svém trhu za cenu dne',
    );
  });

  it('Stepper na 2 pošle offerSlaves(2); víc než zásoba nejde', async () => {
    // odpověď serveru nepřijde – ukazuje se naklikaný počet
    const onOfferSlaves = vi.fn(() => new Promise<string | null>(() => undefined));
    const host = await mount({ market: market({ slaveSale: sale() }), onOfferSlaves });
    await click(byId(host, 'market-slaves-plus'));
    await click(byId(host, 'market-slaves-plus'));
    expect(onOfferSlaves).toHaveBeenLastCalledWith(2);
    await render({ market: market({ slaveSale: sale({ forSale: 2 }) }), onOfferSlaves });
    expect((byId(host, 'market-slaves-plus') as HTMLButtonElement).disabled).toBe(true);
  });

  it('nabídka 3 nad zásobou 2 je vidět a jde snížit', async () => {
    const onOfferSlaves = vi.fn(() => new Promise<string | null>(() => undefined));
    const host = await mount({
      market: market({ slaveSale: sale({ forSale: 3 }) }),
      onOfferSlaves,
    });
    expect(byId(host, 'market-slaves-count')!.textContent).toBe('3');
    await click(byId(host, 'market-slaves-minus'));
    expect(onOfferSlaves).toHaveBeenLastCalledWith(2);
    // strop je nabídka (3), ne zásoba – zpět nahoru jde
    expect((byId(host, 'market-slaves-plus') as HTMLButtonElement).disabled).toBe(false);
  });

  it('důvod odmítnutí je u sekce; bez práva obchodu je zašedlá', async () => {
    const host = await mount({
      market: market({ slaveSale: sale() }),
      onOfferSlaves: () => Promise.resolve('Nelze.'),
    });
    await click(byId(host, 'market-slaves-plus'));
    expect(byId(host, 'market-slaves-error')!.textContent).toBe('Nelze.');
  });

  it('bez práva obchodu je sekce zašedlá s důvodem a nic neposílá', async () => {
    const onOfferSlaves = vi.fn(() => Promise.resolve(null));
    const host = await mount({
      market: market({ slaveSale: sale({ forSale: 1 }) }),
      onOfferSlaves,
      rights: { allowed: [], reason: 'Rozhoduje Bořivoj.' },
    });
    expect((byId(host, 'market-slaves-plus') as HTMLButtonElement).disabled).toBe(true);
    expect((byId(host, 'market-slaves-minus') as HTMLButtonElement).disabled).toBe(true);
    expect(
      byId(host, 'market-slaves')!.querySelector('[data-testid="rights-reason"]')!.textContent,
    ).toBe('Rozhoduje Bořivoj.');
    await click(byId(host, 'market-slaves-plus'));
    expect(onOfferSlaves).not.toHaveBeenCalled();
  });

  it('otroci v „Dáš“ s počtem 2', async () => {
    const host = await mount({ market: market({ stock: { slaves: 2 } }) });
    const give = byId(host, 'market-give-slaves')!;
    expect(give.querySelector('img[src="/icons/resources/slave.png"]')).not.toBeNull();
    await click(byId(host, 'market-give-slaves-plus'));
    await click(byId(host, 'market-give-slaves-plus'));
    expect(byId(host, 'market-give-slaves-count')!.textContent).toBe('2');
  });
});
