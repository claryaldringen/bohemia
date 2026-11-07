import { describe, expect, it } from 'vitest';
import { NEGOTIATION, NEGOTIATION_REASONS as R } from '../../domain/negotiation';
import { blockPlayer, unblockPlayer } from '../blocks';
import {
  acceptNegotiation,
  counterNegotiation,
  openNegotiation,
  rejectNegotiation,
  withdrawNegotiation,
} from '../negotiate';
import { DAY_MS, NOW, oath, open, setup, type Setup } from './negotiation-fixture';

const chronicleTexts = (s: Setup): string[] =>
  s.posts.map((p) => (p.body.kind === 'chronicle' ? JSON.stringify(p.body.event) : ''));

describe('jednání', () => {
  it('otevře jednání, adresát dostane upozornění bez id účtů a kronika obou rodů nabídku zapíše', async () => {
    const s = await setup();
    await open(s);
    expect(s.notices.notices).toHaveLength(1);
    expect(s.notices.notices[0]).toMatchObject({
      playerId: 'player-b',
      kind: 'negotiation-offer',
      payload: { houseId: s.ids.a, name: 'Bořivoj' },
    });
    expect(JSON.stringify(s.notices.notices[0]!.payload)).not.toContain('player-');
    expect(s.posts.map((p) => p.villageId).sort()).toEqual(['village-a', 'village-b']);
  });

  it('vzkaz nad limit odmítne', async () => {
    const s = await setup();
    const r = await openNegotiation(s.deps, {
      playerId: 'player-a',
      to: s.ids.b!,
      items: oath(s.ids.a!, s.ids.b!),
      message: 'x'.repeat(NEGOTIATION.messageMaxChars + 1),
      now: NOW,
      today: 10,
    });
    expect(r).toEqual({ ok: false, reason: R.messageTooLong });
    expect(s.negotiations.records).toHaveLength(0);
  });

  it('protinávrh střídá strany; stejná strana dvakrát nesmí', async () => {
    const s = await setup();
    const id = await open(s);
    const again = await counterNegotiation(s.deps, {
      playerId: 'player-a',
      negotiationId: id,
      items: oath(s.ids.a!, s.ids.b!),
      message: null,
      now: NOW,
      today: 10,
    });
    expect(again).toEqual({ ok: false, reason: R.notYourTurn });
    const counter = await counterNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      items: oath(s.ids.a!, s.ids.b!),
      message: 'Dobře',
      now: NOW,
      today: 10,
    });
    expect(counter.ok).toBe(true);
    expect(s.negotiations.records[0]!.rounds.map((r) => r.authorHouseId)).toEqual([
      s.ids.a,
      s.ids.b,
    ]);
    expect(s.notices.notices.at(-1)).toMatchObject({
      playerId: 'player-a',
      kind: 'negotiation-counter',
    });
  });

  it('stáhnout smí jen autor posledního kola', async () => {
    const s = await setup();
    const id = await open(s);
    const input = { negotiationId: id, now: NOW, today: 10 };
    expect(await withdrawNegotiation(s.deps, { ...input, playerId: 'player-b' })).toEqual({
      ok: false,
      reason: R.onlyAuthorWithdraws,
    });
    expect((await withdrawNegotiation(s.deps, { ...input, playerId: 'player-a' })).ok).toBe(true);
    expect(s.negotiations.records[0]!.status).toBe('withdrawn');
    expect(s.notices.notices.at(-1)).toMatchObject({ kind: 'negotiation-withdrawn' });
  });

  it('přijetí založí vazalství origin negotiation a zapíše „stal se vazalem“', async () => {
    const s = await setup();
    const id = await open(s, 'a', 'b', 'a');
    const r = await acceptNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      now: NOW,
      today: 10,
    });
    expect(r.ok).toBe(true);
    expect(s.vassalages.vassalages).toHaveLength(1);
    expect(s.vassalages.vassalages[0]).toMatchObject({
      lordHouseId: s.ids.a,
      vassalHouseId: s.ids.b,
      origin: 'negotiation',
      sinceDay: 10,
    });
    expect(s.notices.notices.at(-1)).toMatchObject({
      playerId: 'player-a',
      kind: 'negotiation-accepted',
    });
    expect(
      chronicleTexts(s).some(
        (t) => t.includes('"lord":"Bořivoj"') && t.includes('"vassal":"Ctibor"'),
      ),
    ).toBe(true);
    // autor sám přijmout nesmí
    const second = await acceptNegotiation(s.deps, {
      playerId: 'player-a',
      negotiationId: id,
      now: NOW,
      today: 10,
    });
    expect(second.ok).toBe(false);
  });

  it('přijetí ověří živý rod a vzájemnost', async () => {
    const s = await setup();
    const id = await open(s, 'a', 'b', 'a');
    // mezitím se B stal pánem A (přímé vzájemné vazalství)
    await s.vassalages.create({
      lordHouseId: s.ids.b!,
      vassalHouseId: s.ids.a!,
      terms: {},
      origin: 'invite',
      sinceAt: NOW,
      sinceDay: 1,
    });
    const mutual = await acceptNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      now: NOW,
      today: 10,
    });
    expect(mutual).toEqual({ ok: false, reason: R.isYourLord });
    expect(s.negotiations.records[0]!.status).toBe('open');

    const t = await setup();
    const id2 = await open(t, 'a', 'b', 'a');
    await t.houses.end(t.ids.a!, NOW, 10);
    const dead = await acceptNegotiation(t.deps, {
      playerId: 'player-b',
      negotiationId: id2,
      now: NOW,
      today: 10,
    });
    expect(dead).toEqual({ ok: false, reason: R.extinct });
    expect(t.vassalages.vassalages).toHaveLength(0);
  });

  it('druhý pán přibude vedle stávajícího', async () => {
    const s = await setup();
    await s.vassalages.create({
      lordHouseId: s.ids.c!,
      vassalHouseId: s.ids.b!,
      terms: {},
      origin: 'invite',
      sinceAt: NOW,
      sinceDay: 1,
    });
    const id = await open(s, 'a', 'b', 'a');
    expect(
      (
        await acceptNegotiation(s.deps, {
          playerId: 'player-b',
          negotiationId: id,
          now: NOW,
          today: 10,
        })
      ).ok,
    ).toBe(true);
    const lords = s.vassalages.vassalages
      .filter((v) => v.vassalHouseId === s.ids.b)
      .map((v) => v.lordHouseId)
      .sort();
    expect(lords).toEqual([s.ids.a, s.ids.c].sort());
  });

  it('po odmítnutí platí pauza 1 den, pak lze znovu', async () => {
    const s = await setup();
    const id = await open(s);
    const rejected = await rejectNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      now: NOW,
      today: 10,
    });
    expect(rejected.ok).toBe(true);
    expect(s.notices.notices.at(-1)).toMatchObject({
      playerId: 'player-a',
      kind: 'negotiation-rejected',
    });
    const retry = await openNegotiation(s.deps, {
      playerId: 'player-a',
      to: s.ids.b!,
      items: oath(s.ids.a!, s.ids.b!),
      message: null,
      now: new Date(NOW.getTime() + 3_600_000),
      today: 10,
    });
    expect(retry).toEqual({ ok: false, reason: R.rejectedPause });
    const later = await open(s, 'a', 'b', 'a', new Date(NOW.getTime() + DAY_MS + 1));
    expect(later).toBeTruthy();
  });
});

describe('blokování', () => {
  it('ukončí rozběhnuté jednání, upozorní zablokovaného a zapíše neutrální záznam do kronik obou', async () => {
    const s = await setup();
    await open(s, 'a', 'b', 'a');
    s.posts.length = 0;
    const r = await blockPlayer(s.deps, {
      playerId: 'player-b',
      target: s.ids.a!,
      now: NOW,
      today: 11,
    });
    expect(r.ok).toBe(true);
    expect(s.negotiations.records[0]!.status).toBe('ended');
    expect(s.notices.notices.at(-1)).toMatchObject({
      playerId: 'player-a',
      kind: 'blocked',
      payload: { houseId: s.ids.b, name: 'Ctibor' },
    });
    expect(s.posts.map((p) => p.villageId).sort()).toEqual(['village-a', 'village-b']);
    expect(
      chronicleTexts(s).every(
        (t) => t.includes('"blocker":"Ctibor"') && t.includes('"blocked":"Bořivoj"'),
      ),
    ).toBe(true);
    // opakované zablokování nic nezapíše
    const count = s.notices.notices.length;
    await blockPlayer(s.deps, { playerId: 'player-b', target: s.ids.a!, now: NOW, today: 11 });
    expect(s.notices.notices).toHaveLength(count);
    // zablokovaný už nenavrhne
    const open2 = await openNegotiation(s.deps, {
      playerId: 'player-a',
      to: s.ids.b!,
      items: oath(s.ids.a!, s.ids.b!),
      message: null,
      now: NOW,
      today: 11,
    });
    expect(open2).toEqual({ ok: false, reason: R.blocked });
    await unblockPlayer(s.deps, { playerId: 'player-b', target: s.ids.a!, now: NOW });
    expect(await open(s, 'a', 'b', 'a')).toBeTruthy();
  });

  it('stávající dohody blokování neruší', async () => {
    const s = await setup();
    const id = await open(s, 'a', 'b', 'a');
    await acceptNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      now: NOW,
      today: 10,
    });
    await blockPlayer(s.deps, { playerId: 'player-a', target: s.ids.b!, now: NOW, today: 11 });
    expect(s.vassalages.vassalages.filter((v) => v.endedAt === null)).toHaveLength(1);
  });
});
