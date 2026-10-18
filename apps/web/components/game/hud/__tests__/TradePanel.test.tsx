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
    { good: 'salt', price: 7.68, left: 120 },
    { good: 'iron', price: 28.8, left: 30 },
  ],
  demands: [
    { good: 'grain', price: 1, left: 1500, have: 900 },
    { good: 'cheese', price: 4, left: 300, have: 40 },
  ],
  expedition: null,
  ...over,
});

const button = (html: string, testId: string): string | undefined =>
  new RegExp(`<button([^>]*data-testid="${testId}"[^>]*)>`).exec(html)?.[1];

describe('náhled výměny', () => {
  it('bilance, nosiči po 25 kg a práce nosiči × dny', () => {
    const p = tradePreview(neighbour(), { grain: 100 }, { salt: 10 });
    expect(p.credit).toBe(100);
    expect(p.price).toBe(77);
    expect(p.balance).toBe(23);
    expect(p.porters).toBe(4);
    expect(p.manDays).toBe(20);
    expect(p.blocked).toBeNull();
    expect(tradePreview(neighbour(), { grain: 10 }, { iron: 1 }).blocked).toMatch(/prodělal/);
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
    expect(html).toContain('data-testid="trade-get-salt"');
    expect(html).toContain('max="120"');
    // bez zboží se posílat nedá
    expect(button(html, 'trade-send')).toContain('disabled=""');
  });

  it('výhodná výměna jde poslat, nevýhodná zašedlá s důvodem červeně', () => {
    const fair = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour()}
        onSend={() => undefined}
        initial={{ give: { grain: 100 }, get: { salt: 10 } }}
      />,
    );
    expect(fair).toContain('data-fair="true"');
    expect(button(fair, 'trade-send')).not.toContain('disabled=""');
    const unfair = renderToStaticMarkup(
      <NeighbourTrade
        neighbour={neighbour()}
        onSend={() => undefined}
        initial={{ give: { grain: 10 }, get: { iron: 1 } }}
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
              get: { salt: 10 },
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
  });
});
