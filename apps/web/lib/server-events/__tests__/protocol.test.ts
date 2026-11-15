import { describe, expect, it } from 'vitest';
import {
  EVENTS_PATH,
  SERVER_EVENTS_PROTOCOL,
  eventsUrl,
  formatServerEvent,
  parseEventScope,
  warKeyOfScene,
  warKeyOfSettlement,
  type EventScope,
} from '../protocol';

const VILLAGE = '0b6f3c1e-8a5d-4c2b-9f1e-2d3c4b5a6f70';
const CAMPAIGN = '5e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b';

function parse(url: string): EventScope | null {
  return parseEventScope(new URL(url, 'http://localhost').searchParams);
}

describe('protokol událostí ze serveru', () => {
  it('eventsUrl → parseEventScope vrátí totéž; prázdné části vynechá, pořadí je pevné', () => {
    const scopes: EventScope[] = [
      {
        villageId: VILLAGE,
        campaignId: CAMPAIGN,
        scene: { campaignId: CAMPAIGN, cell: { x: -3, y: 12 } },
      },
      { villageId: VILLAGE, campaignId: null, scene: null },
      { villageId: null, campaignId: CAMPAIGN, scene: null },
      { villageId: null, campaignId: null, scene: { campaignId: CAMPAIGN, cell: { x: 0, y: -9 } } },
      { villageId: null, campaignId: null, scene: null },
    ];
    for (const scope of scopes) expect(parse(eventsUrl(scope))).toEqual(scope);
    expect(eventsUrl(scopes[0]!)).toBe(
      `/api/events?village=${VILLAGE}&campaign=${CAMPAIGN}&scene=${CAMPAIGN}@-3,12`,
    );
    expect(eventsUrl(scopes[4]!)).toBe(EVENTS_PATH);
    expect(SERVER_EVENTS_PROTOCOL).toBe(1);
  });

  it('vadné id nebo políčko dá null', () => {
    expect(parse('/api/events?scene=x@1,2')).toBeNull();
    expect(parse('/api/events?village=../a')).toBeNull();
    expect(parse('/api/events?village=')).toBeNull();
    expect(parse(`/api/events?campaign=${CAMPAIGN}x`)).toBeNull();
    expect(parse(`/api/events?scene=${CAMPAIGN}@1,12345`)).toBeNull();
    expect(parse(`/api/events?scene=${CAMPAIGN}@1.5,2`)).toBeNull();
    expect(parse(`/api/events?scene=${CAMPAIGN}`)).toBeNull();
    // dvojí hodnota není jednoznačná
    expect(parse(`/api/events?village=${VILLAGE}&village=${VILLAGE}`)).toBeNull();
  });

  it('id velkými písmeny sjednotí na malá (databáze vrací malá)', () => {
    expect(parse(`/api/events?village=${VILLAGE.toUpperCase()}`)).toEqual({
      villageId: VILLAGE,
      campaignId: null,
      scene: null,
    });
  });

  it('formatServerEvent dá přesně jednu událost SSE', () => {
    expect(formatServerEvent('alarm', { villageId: VILLAGE })).toBe(
      `event: alarm\ndata: {"villageId":"${VILLAGE}"}\n\n`,
    );
    expect(formatServerEvent('sync', { protocol: SERVER_EVENTS_PROTOCOL })).toBe(
      'event: sync\ndata: {"protocol":1}\n\n',
    );
  });

  it('klíče války – vlastní mapa a cizí mapa ve scéně', () => {
    expect(warKeyOfSettlement(VILLAGE)).toBe(`settlement:${VILLAGE}`);
    expect(warKeyOfScene(CAMPAIGN, { x: 1, y: -2 })).toBe(`scene:${CAMPAIGN}@1,-2`);
  });
});
