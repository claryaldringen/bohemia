import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TradeGoods } from '@bohemia/game';
import type { VillageExpedition, VillageNeighbour } from '@/lib/manor-view';
import { clampSelection, tradePreview } from '@/lib/trade-quote';
import { NeighbourTrade, TradePanel } from '../TradePanel';

// Panel obchodu ve dvorci (trade.md – Obchod, Co hráč vidí): soused, posuvníky zboží, bilance pro
// souseda ≥ 0, nosiči, dny cesty a práce; výprava na cestě jen s průběhem.

const neighbour = (over: Partial<VillageNeighbour> = {}): VillageNeighbour => ({
  direction: 'S',
  name: 'Kouřim',
  lengthM: 820,
  tripDays: 5,
  offers: [
    { good: 'pottery', price: 2.88, left: 120 },
    { good: 'ironBars', price: 43.2, left: 30 },
  ],
  demands: [
    { good: 'grain', price: 1, left: 1500, have: 900 },
    { good: 'cheese', price: 4, left: 300, have: 40 },
  ],
  people: {
    offers: { families: [], men: 0, women: 0, adultPrice: 345.6 },
    takes: { families: 0, men: 0, women: 0 },
    have: { families: [], men: 0, women: 0, adultCredit: 360 },
  },
  expedition: null,
  carts: [],
  room: { cows: 40, oxen: 6 },
  ...over,
});

/** Text uvnitř prvku s `data-testid` (bez značek) – i s vnořenými prvky téhož druhu. */
const textOf = (html: string, testId: string): string => {
  const at = html.indexOf(`data-testid="${testId}"`);
  expect(at).toBeGreaterThanOrEqual(0);
  const open = html.lastIndexOf('<', at);
  const tag = /^<(\w+)/.exec(html.slice(open))![1]!;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = open;
  let depth = 0;
  let end = html.length;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      end = m.index;
      break;
    }
  }
  return html.slice(html.indexOf('>', at) + 1, end).replace(/<[^>]+>/g, '');
};

const button = (html: string, testId: string): string | undefined =>
  new RegExp(`<button([^>]*data-testid="${testId}"[^>]*)>`).exec(html)?.[1];

describe('náhled výměny', () => {
  it('s vozem jde náklad na vůz – honák a pomocník místo nosičů (wagons.md – Obchod)', () => {
    const p = tradePreview(neighbour({ carts: ['two-wheel'] }), { grain: 400 }, {});
    expect(p.carts).toBe(1);
    expect(p.porters).toBe(2);
    expect(p.manDays).toBe(2 * 5);
    expect(tradePreview(neighbour(), { grain: 400 }, {}).porters).toBe(16);
  });

  it('bilance, nosiči po 25 kg a práce nosiči × dny', () => {
    const p = tradePreview(neighbour(), { grain: 100 }, { pottery: 25 });
    expect(p.credit).toBe(100);
    expect(p.price).toBe(72);
    expect(p.balance).toBe(28);
    expect(p.porters).toBe(4);
    expect(p.manDays).toBe(20);
    expect(p.blocked).toBeNull();
    expect(tradePreview(neighbour(), { grain: 10 }, { ironBars: 1 }).blocked).toMatch(/prodělal/);
    expect(tradePreview(neighbour(), {}, {}).blocked).toMatch(/nic/);
  });
});

describe('dobytek ve třech druzích (trade.md; Martin 20. 10. 2026)', () => {
  const herders = (room = { cows: 40, oxen: 3 }): VillageNeighbour =>
    neighbour({
      offers: [
        { good: 'cows', price: 576, left: 2 },
        { good: 'youngOxen', price: 336, left: 4 },
        { good: 'trainedOxen', price: 1152, left: 1 },
      ],
      demands: [{ good: 'grain', price: 1, left: 5000, have: 5000 }],
      room,
    });

  it('tři řádky – krávy, mladí voli (menší vůl) a vycvičení voli; popisek s místem v ohradě', () => {
    const html = renderToStaticMarkup(<NeighbourTrade neighbour={herders()} />);
    for (const good of ['cows', 'youngOxen', 'trainedOxen']) {
      expect(html).toContain(`data-testid="trade-get-${good}"`);
    }
    expect(html).toContain('/icons/resources/cow.png');
    expect(html).toContain('/icons/resources/young-ox.png');
    expect(html).toContain('/icons/resources/ox.png');
    expect(textOf(html, 'trade-get-youngOxen-tooltip')).toContain('Mladí voli – do výcviku');
    expect(textOf(html, 'trade-get-trainedOxen-tooltip')).toContain('Vycvičení voli – táhnou hned');
    expect(textOf(html, 'trade-get-cows-note')).toBe('Do ohrady skotu se vejde ještě 40 kusů');
    expect(textOf(html, 'trade-get-youngOxen-note')).toBe(
      'Do ohrady volů se vejde ještě 3 kusy (mladí i vycvičení)',
    );
    // mladých volů soused má 4, do ohrady se vejdou 3
    expect(html).toMatch(
      /aria-label="Mladí voli[^"]*"[^>]*max="3"|max="3"[^>]*aria-label="Mladí voli/,
    );
  });

  it('náhled – voli se nevejdou do ohrady (mladí i vycvičení dohromady), honák bez nosičů', () => {
    const n = herders();
    const pay = { grain: 3000 };
    expect(tradePreview(n, pay, { youngOxen: 2, trainedOxen: 1 }).blocked).toBeNull();
    expect(tradePreview(n, pay, { youngOxen: 3, trainedOxen: 1 }).blocked).toMatch(
      /do ohrady volů nevejde/,
    );
    expect(tradePreview(herders({ cows: 1, oxen: 3 }), pay, { cows: 2 }).blocked).toMatch(
      /do ohrady skotu nevejde/,
    );
    // dobytek nese jen honák – zpátky stačí jeden člověk, tam nosiči obilí
    expect(tradePreview(n, {}, { cows: 2 }).porters).toBe(1);
  });
});

describe('panel obchodu', () => {
  it('soused a posuvníky – dáš nejvýš, co ves má a soused vezme', () => {
    const html = renderToStaticMarkup(
      <TradePanel neighbours={[neighbour()]} onSend={async () => undefined} />,
    );
    expect(html).toContain('Kouřim');
    expect(html).toContain('data-testid="trade-give-grain"');
    expect(html).toContain('max="900"');
    expect(html).toContain('max="40"');
    expect(html).toContain('data-testid="trade-get-pottery"');
    expect(html).toContain('max="120"');
    // bez zboží se posílat nedá
    expect(button(html, 'trade-send')).toContain('disabled=""');
  });

  it('nic se nezalamuje – jména sousedů, množství u posuvníků i řádek bilance', () => {
    const html = renderToStaticMarkup(
      <TradePanel
        neighbours={[neighbour({ name: 'Stará Boleslav' }), neighbour({ direction: 'E' })]}
      />,
    );
    expect(html).toMatch(/<button[^>]*data-testid="neighbour-S"[^>]*class="[^"]*whitespace-nowrap/);
    expect(html).toMatch(
      /class="min-w-16 text-right text-xs whitespace-nowrap tabular-nums">0\/900</,
    );
    expect(html).toMatch(/class="flex items-center gap-3 text-sm whitespace-nowrap tabular-nums"/);
  });

  it('výhodná výměna jde poslat, nevýhodná zašedlá s důvodem červeně', () => {
    const fair = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour()}
        onSend={() => undefined}
        initial={{ give: { grain: 100 }, get: { pottery: 25 } }}
      />,
    );
    expect(fair).toContain('data-fair="true"');
    expect(button(fair, 'trade-send')).not.toContain('disabled=""');
    const unfair = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour()}
        onSend={() => undefined}
        initial={{ give: { grain: 10 }, get: { ironBars: 1 } }}
      />,
    );
    expect(unfair).toContain('data-fair="false"');
    expect(button(unfair, 'trade-send')).toContain('disabled=""');
    expect(unfair).toContain('data-testid="trade-blocked"');
  });

  it('výprava na cestě – co nesou a průběh', () => {
    const html = renderToStaticMarkup(
      <TradePanel
        neighbours={[
          neighbour({
            expedition: {
              give: { grain: 100 },
              get: { pottery: 25 },
              givePeople: { families: 0, men: 1, women: 0 },
              getPeople: { families: 0, men: 0, women: 0 },
              porters: 4,
              carts: 0,
              days: 5,
              progress: 0.4,
              daysLeft: 3,
              pace: 'full',
              today: 4,
            },
          }),
        ]}
      />,
    );
    expect(html).toContain('data-testid="trade-expedition"');
    expect(html).toMatch(/aria-valuenow="40"/);
    expect(html).not.toContain('data-testid="trade-send"');
    // s výpravou odešel svobodný muž (trade.md – Výměna lidí)
    expect(html).toContain('/icons/resources/man.png');
    expect(html).not.toContain('/icons/resources/family.png');
  });
});

describe('výměna lidí (trade.md – Výměna lidí)', () => {
  const sells = neighbour({
    people: {
      offers: { families: [{ people: 4, price: 1036.8 }], men: 2, women: 1, adultPrice: 345.6 },
      takes: { families: 0, men: 0, women: 0 },
      have: { families: [], men: 0, women: 0, adultCredit: 360 },
    },
  });
  const buys = neighbour({
    people: {
      offers: { families: [], men: 0, women: 0, adultPrice: 345.6 },
      takes: { families: 1, men: 3, women: 1 },
      have: { families: [{ people: 3, credit: 900 }], men: 1, women: 0, adultCredit: 360 },
    },
  });

  it('náhled: lidé souseda stojí obilí, naši lidé ho přinesou; nosiče nepotřebují', () => {
    const none = { families: 0, men: 0, women: 0 };
    const get = tradePreview(
      sells,
      { grain: 900 },
      {},
      {
        give: none,
        get: { families: 1, men: 0, women: 0 },
      },
    );
    expect(get.price).toBe(1037);
    expect(get.blocked).toMatch(/prodělal/);
    const give = tradePreview(
      buys,
      {},
      { pottery: 100 },
      {
        give: { families: 1, men: 1, women: 0 },
        get: none,
      },
    );
    expect(give.credit).toBe(1260);
    expect(give.porters).toBe(4);
    expect(give.blocked).toBeNull();
    // jen lidé – výměna není prázdná
    expect(
      tradePreview(buys, {}, {}, { give: { families: 0, men: 1, women: 0 }, get: none }).blocked,
    ).toBeNull();
  });

  it('řádky lidí jen na straně, kde je soused nabízí nebo shání; nejvýš, koho ves smí dát', () => {
    const selling = renderToStaticMarkup(<NeighbourTrade neighbour={sells} />);
    expect(selling).toContain('data-testid="trade-get-family"');
    expect(selling).toContain('data-testid="trade-get-man"');
    expect(selling).toContain('data-testid="trade-get-woman"');
    expect(selling).toContain('/icons/resources/woman.png');
    expect(selling).not.toContain('trade-give-family');
    expect(selling).toContain('/icons/resources/family.png');
    const buying = renderToStaticMarkup(<NeighbourTrade neighbour={buys} />);
    expect(buying).toContain('data-testid="trade-give-family"');
    expect(buying).toContain('data-testid="trade-give-man"');
    expect(buying).toContain('data-testid="trade-give-woman"');
    expect(buying).not.toContain('trade-get-family');
    // soused vezme 3 muže, ves smí dát jednoho; ženu žádnou
    expect(buying).toMatch(/data-testid="trade-give-man"[\s\S]*?max="1"/);
    expect(buying).toMatch(/data-testid="trade-give-woman"[\s\S]*?max="0"/);
    expect(renderToStaticMarkup(<NeighbourTrade neighbour={neighbour()} />)).not.toContain(
      'family.png',
    );
  });
});

describe('čitelnost panelu (Martin 19. 10. 2026 – „co je nabídka a co poptávka“)', () => {
  it('viditelné hlavičky „Dáš“ (ze vsi ven) a „Dostaneš“ (do vsi), nezalomené', () => {
    const html = renderToStaticMarkup(<NeighbourTrade neighbour={neighbour()} />);
    expect(textOf(html, 'trade-give-heading')).toBe('→Dáš');
    expect(textOf(html, 'trade-get-heading')).toBe('Dostaneš→');
    expect(html).toMatch(/<h3 data-testid="trade-give-heading" class="[^"]*whitespace-nowrap/);
    // ikona vsi – portrét dvorce na obou stranách šipky
    expect(html.match(/<img[^>]*src="\/icons\/build\/dvorec\.png"/g)).toHaveLength(2);
    // soused a směr nad sloupci
    expect(textOf(html, 'trade-neighbour')).toBe('Kouřim (jih)');
  });

  it('popisek řádku: kolik soused ještě vezme nebo má, s jednotkou', () => {
    const html = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour({
          offers: [{ good: 'logs', price: 38.4, left: 4 }],
          people: {
            offers: {
              families: [{ people: 4, price: 1036.8 }],
              men: 0,
              women: 1,
              adultPrice: 345.6,
            },
            takes: { families: 0, men: 2, women: 0 },
            have: { families: [], men: 1, women: 0, adultCredit: 360 },
          },
        })}
      />,
    );
    expect(textOf(html, 'trade-give-grain-tooltip')).toContain(
      'Soused shání – vezme ještě 1 500 kg',
    );
    expect(textOf(html, 'trade-get-logs-tooltip')).toContain('Soused nabízí – má ještě 4 kusy');
    expect(textOf(html, 'trade-get-family-tooltip')).toContain('Soused nabízí – má ještě 1 rodinu');
    expect(textOf(html, 'trade-give-man-tooltip')).toContain('Soused shání – vezme ještě 2 muže');
    expect(textOf(html, 'trade-get-woman-tooltip')).toContain('Soused nabízí – má ještě 1 ženu');
    expect(textOf(html, 'trade-get-family-tooltip')).toContain('1 037 / rodina');
  });

  it('bilance – váhy, zeleně v pořádku, červeně záporná; popisek s pravidlem', () => {
    const fair = renderToStaticMarkup(
      <NeighbourTrade neighbour={neighbour()} initial={{ give: { grain: 100 }, get: {} }} />,
    );
    expect(fair).toMatch(/data-testid="trade-balance" data-fair="true"[^>]*text-\[#a8d46f\]/);
    expect(fair).toContain('/icons/resources/balance.png');
    expect(fair).toContain('Bilance pro souseda (kg obilí) – musí být aspoň 0');
    const unfair = renderToStaticMarkup(
      <NeighbourTrade neighbour={neighbour()} initial={{ give: {}, get: { ironBars: 1 } }} />,
    );
    expect(unfair).toMatch(/data-testid="trade-balance" data-fair="false"[^>]*text-red-400/);
    expect(textOf(unfair, 'trade-balance')).toBe('-43');
  });

  it('jediný soused bez záložek, víc sousedů se záložkami', () => {
    expect(renderToStaticMarkup(<TradePanel neighbours={[neighbour()]} />)).not.toContain(
      'role="tablist"',
    );
    expect(
      renderToStaticMarkup(
        <TradePanel neighbours={[neighbour(), neighbour({ direction: 'E', name: 'Mokrá' })]} />,
      ),
    ).toContain('role="tablist"');
  });
});

describe('odeslání výpravy (Martin 19. 10. 2026 – „dál nějak nevím, co se bude dít“)', () => {
  const nobody = { families: 0, men: 0, women: 0 };
  // soused má letos jen 2 svobodné muže (loni 3 – nový rok obchodu od 1. 11.)
  const twoMen = neighbour({
    people: {
      offers: { families: [], men: 2, women: 0, adultPrice: 345.6 },
      takes: nobody,
      have: { families: [], men: 0, women: 0, adultCredit: 360 },
    },
  });

  it('výběr se ořízne na dnešní meze souseda – odeslat jde jen to, co panel ukazuje', () => {
    const stale = {
      give: { grain: 5000, cheese: 10 },
      get: { pottery: 500, salt: 3 } as TradeGoods,
      people: { give: nobody, get: { families: 0, men: 3, women: 0 } },
    };
    const clamped = clampSelection(twoMen, stale);
    expect(clamped.people.get).toEqual({ families: 0, men: 2, women: 0 });
    expect(clamped.give).toEqual({ grain: 900, cheese: 10 });
    expect(clamped.get).toEqual({ pottery: 120 });
    // nic se nemění – tentýž výběr
    expect(clampSelection(twoMen, clamped)).toBe(clamped);
    // panel s loňským výběrem ukáže 2/2 a s nimi počítá bilance
    const html = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={twoMen}
        initial={{ give: { grain: 900 }, get: {}, people: stale.people }}
      />,
    );
    expect(html).toMatch(/data-testid="trade-get-man"[\s\S]*?value="2"[\s\S]*?2\/2/);
    expect(html).toContain('data-fair="true"');
  });

  it('kontrola jádra už před odesláním – tlačítko zašedlé s důvodem v popisku', () => {
    // přesně Vlkov: 3 muži, soused má 2 – server by odmítl „Tolik lidí soused letos nemá.“
    expect(
      tradePreview(twoMen, { grain: 2000 }, {}, { give: nobody, get: { ...nobody, men: 3 } })
        .blocked,
    ).toBe('Tolik lidí soused letos nemá.');
    expect(tradePreview(twoMen, { grain: 500 }, { pottery: 121 }).blocked).toBe(
      'Tolik soused letos nemá.',
    );
    expect(tradePreview(twoMen, { grain: 901 }, {}).blocked).toBe('Tolik ves nemá.');
    expect(tradePreview(twoMen, { grain: 1501 }, {}).blocked).toBe('Tolik soused letos nevezme.');
    expect(tradePreview(twoMen, { logs: 1 }, {}).blocked).toBe('Tohle soused nechce.');
  });

  it('chyba serveru zůstane v panelu červeně pod tlačítkem', () => {
    const html = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour()}
        error="Tolik lidí soused letos nemá."
        onSend={() => undefined}
      />,
    );
    expect(html).toMatch(
      /<p data-testid="trade-error" role="alert" class="[^"]*text-red-400[^"]*">Tolik lidí soused letos nemá\.<\/p>/,
    );
    expect(html.indexOf('trade-error')).toBeGreaterThan(html.indexOf('trade-send'));
    expect(renderToStaticMarkup(<NeighbourTrade neighbour={neighbour()} />)).not.toContain(
      'trade-error',
    );
  });

  const expedition = (over: Partial<VillageExpedition> = {}): VillageExpedition => ({
    give: { meat: 289 },
    get: {},
    givePeople: nobody,
    getPeople: { families: 0, men: 2, women: 0 },
    porters: 12,
    carts: 0,
    days: 5,
    progress: 0.6,
    daysLeft: 2,
    pace: 'full',
    today: 12,
    ...over,
  });

  it('výprava na cestě: kam, co nese, koho vede, průběh a za kolik dní se vrátí', () => {
    const html = renderToStaticMarkup(
      <NeighbourTrade neighbour={neighbour({ expedition: expedition() })} />,
    );
    expect(html).toContain('data-testid="trade-expedition"');
    expect(textOf(html, 'trade-neighbour')).toBe('Kouřim (jih)');
    expect(textOf(html, 'trade-give')).toContain('289 kg');
    expect(html).toMatch(/data-testid="trade-get"[\s\S]*?\/icons\/resources\/man\.png/);
    expect(textOf(html, 'trade-days-left')).toBe('≈ 2');
    expect(html).toContain('Vrátí se asi za 2 dny');
    expect(html).toMatch(/aria-valuenow="60"/);
    expect(html).not.toContain('data-testid="trade-pace"');
  });

  it('výprava stojí (ves bez dospělých) – přesýpací hodiny a popisek, návrat neznámý', () => {
    const waiting = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour({
          expedition: expedition({ pace: 'waiting', today: 0, daysLeft: null }),
        })}
      />,
    );
    expect(waiting).toMatch(/data-testid="trade-pace" data-pace="waiting"/);
    expect(waiting).toContain('/icons/resources/hourglass.png');
    expect(waiting).toContain('Výprava stojí');
    expect(textOf(waiting, 'trade-days-left')).toBe('?');
    const slow = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour({ expedition: expedition({ pace: 'slow', today: 7, daysLeft: 3 }) })}
      />,
    );
    expect(textOf(slow, 'trade-pace')).toBe('7/12');
    expect(slow).toContain('dnes šlo 7 z 12 lidí výpravy');
  });

  it('vozy ušetří člověkodny – v panelu zeleně, kolik proti nosičům', () => {
    const cart = neighbour({ carts: ['four-wheel'] });
    const preview = tradePreview(cart, { grain: 900 }, {});
    expect(preview.carts).toBe(1);
    expect(preview.savedManDays).toBeGreaterThan(0);
    const html = renderToStaticMarkup(
      <NeighbourTrade neighbour={cart} initial={{ give: { grain: 900 }, get: {} }} />,
    );
    expect(textOf(html, 'trade-saved')).toBe(`−${preview.savedManDays}`);
    expect(html).toContain(`vozy ušetří ${preview.savedManDays} proti nosičům`);
  });
});
