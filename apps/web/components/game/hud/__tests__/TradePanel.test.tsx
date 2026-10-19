import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { VillageNeighbour } from '@/lib/manor-view';
import { tradePreview } from '@/lib/trade-quote';
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
    { good: 'tools', price: 57.6, left: 30 },
  ],
  demands: [
    { good: 'grain', price: 1, left: 1500, have: 900 },
    { good: 'cheese', price: 4, left: 300, have: 40 },
  ],
  people: {
    offers: { families: [], adults: 0, adultPrice: 345.6 },
    takes: { families: 0, adults: 0 },
    have: { families: [], adults: 0, adultCredit: 360 },
  },
  expedition: null,
  ...over,
});

const button = (html: string, testId: string): string | undefined =>
  new RegExp(`<button([^>]*data-testid="${testId}"[^>]*)>`).exec(html)?.[1];

describe('náhled výměny', () => {
  it('bilance, nosiči po 25 kg a práce nosiči × dny', () => {
    const p = tradePreview(neighbour(), { grain: 100 }, { pottery: 25 });
    expect(p.credit).toBe(100);
    expect(p.price).toBe(72);
    expect(p.balance).toBe(28);
    expect(p.porters).toBe(4);
    expect(p.manDays).toBe(20);
    expect(p.blocked).toBeNull();
    expect(tradePreview(neighbour(), { grain: 10 }, { tools: 1 }).blocked).toMatch(/prodělal/);
    expect(tradePreview(neighbour(), {}, {}).blocked).toMatch(/nic/);
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
        initial={{ give: { grain: 10 }, get: { tools: 1 } }}
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
              givePeople: { families: 0, adults: 1 },
              getPeople: { families: 0, adults: 0 },
              porters: 4,
              days: 5,
              progress: 0.4,
            },
          }),
        ]}
      />,
    );
    expect(html).toContain('data-testid="trade-expedition"');
    expect(html).toMatch(/aria-valuenow="40"/);
    expect(html).not.toContain('data-testid="trade-send"');
    // s výpravou odešel svobodný dospělý (trade.md – Výměna lidí)
    expect(html).toContain('/icons/resources/man.png');
    expect(html).not.toContain('/icons/resources/family.png');
  });
});

describe('výměna lidí (trade.md – Výměna lidí)', () => {
  const sells = neighbour({
    people: {
      offers: { families: [{ people: 4, price: 1036.8 }], adults: 2, adultPrice: 345.6 },
      takes: { families: 0, adults: 0 },
      have: { families: [], adults: 0, adultCredit: 360 },
    },
  });
  const buys = neighbour({
    people: {
      offers: { families: [], adults: 0, adultPrice: 345.6 },
      takes: { families: 1, adults: 3 },
      have: { families: [{ people: 3, credit: 900 }], adults: 1, adultCredit: 360 },
    },
  });

  it('náhled: lidé souseda stojí obilí, naši lidé ho přinesou; nosiče nepotřebují', () => {
    const none = { families: 0, adults: 0 };
    const get = tradePreview(
      sells,
      { grain: 900 },
      {},
      {
        give: none,
        get: { families: 1, adults: 0 },
      },
    );
    expect(get.price).toBe(1037);
    expect(get.blocked).toMatch(/prodělal/);
    const give = tradePreview(
      buys,
      {},
      { pottery: 100 },
      {
        give: { families: 1, adults: 1 },
        get: none,
      },
    );
    expect(give.credit).toBe(1260);
    expect(give.porters).toBe(4);
    expect(give.blocked).toBeNull();
    // jen lidé – výměna není prázdná
    expect(
      tradePreview(buys, {}, {}, { give: { families: 0, adults: 1 }, get: none }).blocked,
    ).toBeNull();
  });

  it('řádky lidí jen na straně, kde je soused nabízí nebo shání; nejvýš, koho ves smí dát', () => {
    const selling = renderToStaticMarkup(<NeighbourTrade neighbour={sells} />);
    expect(selling).toContain('data-testid="trade-get-family"');
    expect(selling).toContain('data-testid="trade-get-adult"');
    expect(selling).not.toContain('trade-give-family');
    expect(selling).toContain('/icons/resources/family.png');
    const buying = renderToStaticMarkup(<NeighbourTrade neighbour={buys} />);
    expect(buying).toContain('data-testid="trade-give-family"');
    expect(buying).toContain('data-testid="trade-give-adult"');
    expect(buying).not.toContain('trade-get-family');
    // soused vezme 3 dospělé, ves smí dát jednoho
    expect(buying).toMatch(/data-testid="trade-give-adult"[\s\S]*?max="1"/);
    expect(renderToStaticMarkup(<NeighbourTrade neighbour={neighbour()} />)).not.toContain(
      'family.png',
    );
  });
});
