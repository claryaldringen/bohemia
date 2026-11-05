import { describe, expect, it } from 'vitest';
import {
  acceptRound,
  canOpen,
  counterRound,
  openRound,
  rejectRound,
  respondingHouse,
  withdrawRound,
  type OpenContext,
} from '../negotiate';
import { NEGOTIATION, NEGOTIATION_REASONS as R } from '../rules-negotiation';
import type { Negotiation, NegotiationResult, TermItem } from '../types';

const T0 = new Date('2027-01-05T10:00:00Z');
const oath = (lord: string, vassal: string): TermItem[] => [{ kind: 'oath', lord, vassal }];

function unwrap(r: NegotiationResult): Negotiation {
  if (!r.ok) throw new Error(r.reason);
  return r.negotiation;
}

/** Bořivoj (B) nabídl vazalství Ctiborovi (C): pánem je B. */
function offer(): Negotiation {
  return unwrap(
    openRound({ id: 'n1', from: 'B', to: 'C', items: oath('B', 'C'), message: null, at: T0 }),
  );
}

describe('kola jednání', () => {
  it('otevře jednání jedním kolem', () => {
    const n = offer();
    expect(n.status).toBe('open');
    expect(n.rounds).toHaveLength(1);
    expect(respondingHouse(n)).toBe('C');
  });

  it('žádost: budoucí vazal pošle přísahu, kde pánem je druhý', () => {
    const n = unwrap(
      openRound({
        id: 'n2',
        from: 'C',
        to: 'B',
        items: oath('B', 'C'),
        message: 'Přijmi mě',
        at: T0,
      }),
    );
    expect(respondingHouse(n)).toBe('B');
  });

  it('odmítne přísahu mimo obě strany nebo bez přísahy', () => {
    expect(
      openRound({ id: 'x', from: 'B', to: 'C', items: oath('B', 'Z'), message: null, at: T0 }),
    ).toEqual({
      ok: false,
      reason: R.badOath,
    });
    expect(openRound({ id: 'x', from: 'B', to: 'C', items: [], message: null, at: T0 }).ok).toBe(
      false,
    );
    expect(
      openRound({ id: 'x', from: 'B', to: 'B', items: oath('B', 'B'), message: null, at: T0 }).ok,
    ).toBe(false);
  });

  it('vzkaz delší než mez se odmítne', () => {
    const long = 'x'.repeat(NEGOTIATION.messageMaxChars + 1);
    const r = openRound({
      id: 'x',
      from: 'B',
      to: 'C',
      items: oath('B', 'C'),
      message: long,
      at: T0,
    });
    expect(r).toEqual({ ok: false, reason: R.messageTooLong });
    expect(
      openRound({
        id: 'x',
        from: 'B',
        to: 'C',
        items: oath('B', 'C'),
        message: 'x'.repeat(500),
        at: T0,
      }).ok,
    ).toBe(true);
  });

  it('strany se střídají a kol je nekonečně', () => {
    let n = offer();
    for (let i = 0; i < 20; i++) {
      const actor = i % 2 === 0 ? 'C' : 'B';
      n = unwrap(counterRound(n, actor, oath('B', 'C'), null, T0));
    }
    expect(n.rounds).toHaveLength(21);
    expect(n.status).toBe('open');
  });

  it('nesmí hrát dvakrát po sobě ani cizí rod', () => {
    const n = offer();
    expect(counterRound(n, 'B', oath('B', 'C'), null, T0)).toEqual({
      ok: false,
      reason: R.notYourTurn,
    });
    expect(counterRound(n, 'Z', oath('B', 'C'), null, T0)).toEqual({
      ok: false,
      reason: R.notParty,
    });
  });

  it('role přísahy se v protinávrhu nemění', () => {
    const n = offer();
    expect(counterRound(n, 'C', oath('C', 'B'), null, T0)).toEqual({
      ok: false,
      reason: R.oathChanged,
    });
    expect(counterRound(n, 'C', [], null, T0)).toEqual({ ok: false, reason: R.oathChanged });
  });

  it('stáhnout smí jen autor posledního kola, dokud druhý neodpověděl', () => {
    const n = offer();
    expect(withdrawRound(n, 'C', T0)).toEqual({ ok: false, reason: R.onlyAuthorWithdraws });
    const w = unwrap(withdrawRound(n, 'B', T0));
    expect(w.status).toBe('withdrawn');
    // po protinávrhu smí stáhnout jen jeho autor
    const c = unwrap(counterRound(n, 'C', oath('B', 'C'), null, T0));
    expect(withdrawRound(c, 'B', T0).ok).toBe(false);
    expect(withdrawRound(c, 'C', T0).ok).toBe(true);
  });

  it('přijmout a odmítnout smí jen adresát posledního kola', () => {
    const n = offer();
    expect(acceptRound(n, 'B', T0)).toEqual({ ok: false, reason: R.notYourTurn });
    expect(rejectRound(n, 'B', T0).ok).toBe(false);
    const a = unwrap(acceptRound(n, 'C', T0));
    expect(a.status).toBe('accepted');
    expect(a.resolvedAt).toEqual(T0);
    expect(unwrap(rejectRound(n, 'C', T0)).status).toBe('rejected');
  });

  it('skončené jednání se dál nemění', () => {
    const done = unwrap(rejectRound(offer(), 'C', T0));
    expect(counterRound(done, 'B', oath('B', 'C'), null, T0)).toEqual({
      ok: false,
      reason: R.finished,
    });
    expect(acceptRound(done, 'C', T0).ok).toBe(false);
    expect(withdrawRound(done, 'B', T0).ok).toBe(false);
    expect(respondingHouse(done)).toBeNull();
  });

  it('nemění vstupní jednání', () => {
    const n = offer();
    counterRound(n, 'C', oath('B', 'C'), null, T0);
    acceptRound(n, 'C', T0);
    expect(n.rounds).toHaveLength(1);
    expect(n.status).toBe('open');
  });
});

describe('canOpen', () => {
  const base: OpenContext = {
    from: 'B',
    to: 'C',
    now: T0,
    fromAlive: true,
    toAlive: true,
    blockedByTarget: false,
    negotiationOpen: false,
    rejectedByTargetAt: null,
    oath: { lord: 'B', vassal: 'C' },
    edges: [],
  };

  it('volná cesta', () => {
    expect(canOpen(base)).toBeNull();
  });
  it('vymřelý rod (kterákoli strana)', () => {
    expect(canOpen({ ...base, toAlive: false })).toBe(R.extinct);
    expect(canOpen({ ...base, fromAlive: false })).toBe(R.extinct);
  });
  it('blokování', () => {
    expect(canOpen({ ...base, blockedByTarget: true })).toBe(R.blocked);
  });
  it('jedno otevřené jednání mezi dvojicí', () => {
    expect(canOpen({ ...base, negotiationOpen: true })).toBe('Jednáte už.');
  });
  it('pauza 1 skutečný den po odmítnutí', () => {
    const justBefore = new Date(T0.getTime() - NEGOTIATION.pauseAfterRejectMs + 1);
    expect(canOpen({ ...base, rejectedByTargetAt: justBefore })).toBe('Odmítl – zkus zítra.');
    const exactly = new Date(T0.getTime() - NEGOTIATION.pauseAfterRejectMs);
    expect(canOpen({ ...base, rejectedByTargetAt: exactly })).toBeNull();
  });
  it('vzájemné vazalství: B je pánem C, C navrhne být pánem B', () => {
    const ctx = {
      ...base,
      from: 'C',
      to: 'B',
      oath: { lord: 'C', vassal: 'B' },
      edges: [{ lordHouseId: 'B', vassalHouseId: 'C' }],
    };
    expect(canOpen(ctx)).toBe('Je tvým pánem.');
  });
  it('nepřímý kruh povolen, existující dohoda ne', () => {
    const edges = [
      { lordHouseId: 'C', vassalHouseId: 'D' },
      { lordHouseId: 'D', vassalHouseId: 'B' },
    ];
    expect(canOpen({ ...base, edges })).toBeNull();
    expect(canOpen({ ...base, edges: [{ lordHouseId: 'B', vassalHouseId: 'C' }] })).toBe(
      R.alreadyVassal,
    );
  });
  it('sám se sebou', () => {
    expect(canOpen({ ...base, to: 'B' })).toBe(R.yourselfOnly);
  });
});
