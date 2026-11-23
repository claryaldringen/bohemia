import { describe, expect, it } from 'vitest';
import type { ExpeditionView, PartyView, SeenCell } from '@bohemia/game';
import {
  expeditionReason,
  expeditionsKey,
  visitorsKey,
  interpolateExpeditions,
  lordJourneyViewOf,
  knownEyeState,
  nextKnownCell,
  UNKNOWN_MAP,
} from '../journey-view';

const person = (personId: number, group: number, lord = false): PartyView['people'][number] => ({
  personId,
  group,
  lord,
  rider: false,
  mounted: false,
  horse: null,
  horseId: null,
  wounded: false,
  strength: 1,
  female: false,
  child: false,
});

const view = (pos: { x: number; z: number }, cell = { x: 1, y: 1 }, tick = 10): ExpeditionView => ({
  journeyId: 'j1',
  villageId: 'v1',
  tick,
  day: 5,
  home: { x: 0, y: 0 },
  homePos: { x: 5, z: 5 },
  seen: { '1,1': { trail: [], parts: [] } as unknown as SeenCell },
  hunt: null,
  parties: [
    {
      id: 0,
      phase: 'out',
      controllable: true,
      leaderId: 7,
      waitDaysLeft: null,
      horseWork: null,
      groups: [{ id: 0, cell, pos, goal: null, arrived: false }],
      people: [person(7, 0, true), person(9, 0)],
    },
  ],
});

describe('interpolateExpeditions', () => {
  it('posune polohu hloučku mezi dvěma stavy na téže mapě', () => {
    const out = interpolateExpeditions(
      [view({ x: 0, z: 0 })],
      [view({ x: 10, z: 20 }, undefined, 12)],
      0.5,
    );
    expect(out[0]!.parties[0]!.groups[0]!.pos).toEqual({ x: 5, z: 10 });
  });

  it('na jiné mapě, bez předchozího stavu nebo po čase stojí rovnou v novém', () => {
    const next = [view({ x: 9, z: 9 }, { x: 2, y: 1 })];
    expect(interpolateExpeditions([view({ x: 0, z: 0 })], next, 0.5)).toEqual(next);
    expect(interpolateExpeditions([], next, 0.5)).toEqual(next);
    expect(interpolateExpeditions([view({ x: 0, z: 0 })], next, 1)).toEqual(next);
  });
});

describe('lordJourneyViewOf', () => {
  it('pohled na výjezd z hloučku s vojvodou; bez vojvody null', () => {
    const lord = lordJourneyViewOf([view({ x: 3, z: 4 })]);
    expect(lord).toMatchObject({
      journeyId: 'j1',
      cell: { x: 1, y: 1 },
      group: { pos: { x: 3, z: 4 }, arrived: false },
      controllable: true,
    });
    expect(lord?.men.map((m) => m.personId)).toEqual([7, 9]);
    const noLord = view({ x: 3, z: 4 });
    noLord.parties[0]!.people = [person(9, 0)];
    expect(lordJourneyViewOf([noLord])).toBeNull();
  });
});

describe('expeditionReason', () => {
  it('útok na zvíře: lovecké důvody', () => {
    expect(expeditionReason('young')).toBe('Od 12 let.');
    expect(expeditionReason('young', false, true)).toBe('Na lov až od 14 let.');
    expect(expeditionReason('woman', true, true)).toBe('Na lov chodí jen muži.');
    expect(expeditionReason('no-quarry', false, true)).toBe('Zvíře tu není.');
  });

  it('texty důvodů z plánu, rod podle pohlaví', () => {
    expect(expeditionReason('wounded')).toBe('Je raněný.');
    expect(expeditionReason('wounded', true)).toBe('Je raněná.');
    expect(expeditionReason('horse-home')).toBe('Kůň je doma.');
    expect(expeditionReason('war-there')).toBe('Tam je válka.');
    expect(expeditionReason('young')).toBe('Od 12 let.');
    expect(expeditionReason('unreachable')).toBe('Tam nedojde.');
    expect(expeditionReason('nobody')).toBe('Rozkaz nelze dát.');
    expect(expeditionReason('refused')).toBe('Rozkaz nelze dát.');
  });
});

describe('nextKnownCell', () => {
  const known = [
    { cell: { x: 2, y: 0 }, houseId: 'b' },
    { cell: { x: 1, y: 0 }, houseId: 'b' },
    { cell: { x: 5, y: 5 }, houseId: 'c' },
    { cell: { x: 9, y: 9 }, houseId: null },
  ];

  it('rod bez známé mapy → null, text zašedlého oka je z rozhraní', () => {
    expect(nextKnownCell(known, 'zzz', null)).toBeNull();
    expect(UNKNOWN_MAP).toBe('Tu mapu rod nezná.');
  });

  it('první klik otevře první mapu rodu, další klik další a po poslední znovu první', () => {
    const first = nextKnownCell(known, 'b', null);
    expect(first).toEqual({ x: 1, y: 0 });
    const second = nextKnownCell(known, 'b', first);
    expect(second).toEqual({ x: 2, y: 0 });
    expect(nextKnownCell(known, 'b', second)).toEqual({ x: 1, y: 0 });
  });

  it('jediná mapa zůstává; poslední otevřená z jiného rodu se ignoruje', () => {
    expect(nextKnownCell(known, 'c', { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
    expect(nextKnownCell(known, 'c', { x: 1, y: 0 })).toEqual({ x: 5, y: 5 });
  });
});

describe('knownEyeState', () => {
  const known = [{ cell: { x: 1, y: 0 }, houseId: 'b' }];

  it('bez cíle (houseId null) oko chybí', () => {
    expect(knownEyeState('ready', known, null, null)).toEqual({ kind: 'hidden' });
    expect(knownEyeState('loading', known, null, null)).toEqual({ kind: 'hidden' });
  });

  it('seznam se načítá nebo dotaz selhal → zašedlé bez důvodu', () => {
    expect(knownEyeState('loading', [], 'b', null)).toEqual({ kind: 'pending' });
    expect(knownEyeState('error', [], 'b', null)).toEqual({ kind: 'pending' });
  });

  it('načtený seznam: mapa je známá → otevře; není → „Tu mapu rod nezná.“', () => {
    expect(knownEyeState('ready', known, 'b', null)).toEqual({
      kind: 'open',
      cell: { x: 1, y: 0 },
    });
    expect(knownEyeState('ready', known, 'c', null)).toEqual({ kind: 'unknown' });
  });
});

describe('klíče pro události serveru', () => {
  it('expeditionsKey: stejné takty = stejný klíč, nový takt ho změní, nic = prázdný', () => {
    const a = view({ x: 0, z: 0 }, { x: 1, y: 1 }, 10);
    expect(expeditionsKey([a])).toBe(expeditionsKey([{ ...a }]));
    expect(expeditionsKey([a])).not.toBe(
      expeditionsKey([view({ x: 0, z: 0 }, { x: 1, y: 1 }, 11)]),
    );
    expect(expeditionsKey([])).toBe('');
  });

  it('visitorsKey: skupiny, takty a počty lidí; prázdný seznam = prázdný klíč', () => {
    const v = { journeyId: 'j', partyId: 1, tick: 5, people: [{}, {}] } as never;
    const w = { journeyId: 'j', partyId: 1, tick: 5, people: [{}] } as never;
    expect(visitorsKey([v])).toBe('j:1:5:2');
    expect(visitorsKey([v])).not.toBe(visitorsKey([w]));
    expect(visitorsKey([])).toBe('');
  });
});
