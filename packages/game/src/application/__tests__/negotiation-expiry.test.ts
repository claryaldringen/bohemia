import { describe, expect, it } from 'vitest';
import { ABSENT_VASSAL } from '../../domain/vassalage';
import { counterNegotiation, acceptNegotiation, NO_NEGOTIATION } from '../negotiate';
import { expireNegotiations, type ExpireNegotiationsDeps } from '../negotiation-expiry';
import { DAY_MS, NOW, oath, open, setup, type Setup } from './negotiation-fixture';

// Vypršení jednání bez odpovědi (absence.md – Povinnosti vazala, když hráč nehraje).

/** Herní den okamžiku: v testu 1 skutečný den = 1 herní den od NOW (den 10). */
const dayOf = (at: Date): number => 10 + Math.floor((at.getTime() - NOW.getTime()) / DAY_MS);
const LIMIT = ABSENT_VASSAL.negotiationExpiryDays;

function expiryDeps(s: Setup): ExpireNegotiationsDeps {
  return {
    negotiations: s.negotiations,
    houses: s.houses,
    villages: s.deps.villages,
    dayOf,
  };
}

describe('vypršení jednání', () => {
  it('návrh bez odpovědi vyprší po lhůtě od posledního kola – upozornění a kronika obou stran', async () => {
    const s = await setup();
    const id = await open(s);
    const deps = expiryDeps(s);
    expect(await expireNegotiations(deps, { now: NOW, today: 10 + LIMIT - 1 })).toBe(0);
    expect(await expireNegotiations(deps, { now: NOW, today: 10 + LIMIT })).toBe(1);
    expect(await expireNegotiations(deps, { now: NOW, today: 10 + LIMIT + 1 })).toBe(0);
    expect(s.negotiations.records[0]).toMatchObject({ id, status: 'expired' });

    const expired = s.notices.notices.filter((n) => n.kind === 'negotiation-expired');
    expect(expired.map((n) => [n.playerId, n.payload.name]).sort()).toEqual([
      ['player-a', 'Ctibor'],
      ['player-b', 'Bořivoj'],
    ]);
    const chronicle = s.posts.filter(
      (p) => p.body.kind === 'chronicle' && p.body.event.kind === 'negotiation',
    );
    const steps = chronicle.map((p) => (p.body.kind === 'chronicle' ? p.body.event : null));
    expect(steps.filter((e) => e?.kind === 'negotiation' && e.step === 'expired')).toHaveLength(2);
    // vypršelé jednání už nejde přijmout; nový návrh smí kdokoli hned (vypršení není odmítnutí)
    const late = await acceptNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      now: NOW,
      today: 10 + LIMIT,
    });
    expect(late.ok).toBe(false);
    expect(late.ok ? '' : late.reason).not.toBe(NO_NEGOTIATION);
    await expect(open(s)).resolves.toBeTruthy();
  });

  it('protinávrh posune lhůtu – počítá se od posledního kola', async () => {
    const s = await setup();
    const id = await open(s);
    const later = new Date(NOW.getTime() + 100 * DAY_MS);
    const counter = await counterNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      items: oath(s.ids.a!, s.ids.b!),
      message: null,
      now: later,
      today: 110,
    });
    expect(counter.ok).toBe(true);
    const deps = expiryDeps(s);
    expect(await expireNegotiations(deps, { now: later, today: 10 + LIMIT })).toBe(0);
    expect(await expireNegotiations(deps, { now: later, today: 110 + LIMIT })).toBe(1);
    // autor posledního kola je Ctibor – kronika ho uvádí jako autora návrhu
    const expired = s.posts.find(
      (p) =>
        p.body.kind === 'chronicle' &&
        p.body.event.kind === 'negotiation' &&
        p.body.event.step === 'expired',
    );
    expect(expired?.body).toMatchObject({ event: { actor: 'Ctibor', other: 'Bořivoj' } });
  });

  it('odpověď do lhůty má přednost; žádost nováčka nevyprší (má vlastní týden)', async () => {
    const s = await setup();
    const id = await open(s);
    const accepted = await acceptNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: id,
      now: NOW,
      today: 10 + LIMIT - 1,
    });
    expect(accepted.ok).toBe(true);
    const newcomer = await open(s, 'c', 'a', 'a');
    s.negotiations.records.find((r) => r.id === newcomer)!.newcomer = true;
    expect(await expireNegotiations(expiryDeps(s), { now: NOW, today: 10 + 5 * LIMIT })).toBe(0);
    expect(s.negotiations.records.map((r) => r.status)).toEqual(['accepted', 'open']);
  });
});
