import { describe, expect, it } from 'vitest';
import { NEGOTIATION_REASONS as R, type TermItem } from '../../domain/negotiation';
import { noMacroGoods, type MacroBundle } from '../../domain/vassalage/macro';
import { TERM_REASONS } from '../../domain/vassalage/terms';
import {
  acceptNegotiation,
  counterNegotiation,
  NO_AGREEMENT,
  openNegotiation,
  rejectNegotiation,
} from '../negotiate';
import { NOW, oath, open, setup, type Setup } from './negotiation-fixture';

const bundle = (grainKg: number): MacroBundle => ({
  ...noMacroGoods(),
  grainKg,
  people: { families: 0, men: 0, women: 0 },
  laborDays: 0,
});

/** Uzavře holou přísahu: a je pán, b vazal; vrací id dohody. */
async function bind(s: Setup): Promise<string> {
  const id = await open(s);
  const r = await acceptNegotiation(s.deps, {
    playerId: 'player-b',
    negotiationId: id,
    now: NOW,
    today: 10,
  });
  if (!r.ok) throw new Error(r.reason);
  return s.vassalages.vassalages[0]!.id;
}

/** B (vazal) navrhne nové podmínky bez přísahy. */
async function proposeTerms(
  s: Setup,
  items: TermItem[],
  from = 'b',
): ReturnType<typeof openNegotiation> {
  return openNegotiation(s.deps, {
    playerId: `player-${from}`,
    to: s.ids[from === 'b' ? 'a' : 'b']!,
    items,
    message: null,
    now: NOW,
    today: 11,
  });
}

describe('podmínky vazalství', () => {
  it('nová dohoda nese podmínky z přijatého kola', async () => {
    const s = await setup();
    const items: TermItem[] = [
      ...oath(s.ids.a!, s.ids.b!),
      { kind: 'tribute', goods: bundle(150) },
      { kind: 'service', men: 4, days: 30 },
      { kind: 'target-village', villageId: 'village-a' },
    ];
    const opened = await openNegotiation(s.deps, {
      playerId: 'player-a',
      to: s.ids.b!,
      items,
      message: null,
      now: NOW,
      today: 10,
    });
    if (!opened.ok) throw new Error(opened.reason);
    await acceptNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: opened.negotiation.id,
      now: NOW,
      today: 10,
    });
    expect(s.vassalages.vassalages[0]?.terms).toEqual({
      tribute: bundle(150),
      service: { men: 4, days: 30 },
      targetVillageId: 'village-a',
    });
  });

  it('nové podmínky: odmítnutí dohodu nemění, přijetí podmínky přepíše a zvýší verzi', async () => {
    const s = await setup();
    const vid = await bind(s);
    const before = s.vassalages.vassalages[0]!;
    expect(before.terms).toEqual({});
    const proposal: TermItem[] = [{ kind: 'tribute', goods: bundle(100) }];

    const first = await proposeTerms(s, proposal);
    if (!first.ok) throw new Error(first.reason);
    // do přijetí platí staré
    expect(s.vassalages.vassalages[0]?.terms).toEqual({});
    await rejectNegotiation(s.deps, {
      playerId: 'player-a',
      negotiationId: first.negotiation.id,
      now: NOW,
      today: 11,
    });
    expect(s.vassalages.vassalages[0]).toMatchObject({ terms: {}, version: 1, endedAt: null });

    // pauza po odmítnutí platí; pošli návrh od pána (druhá strana), ten vazal přijme
    const second = await proposeTerms(s, [{ kind: 'reward', goods: bundle(20) }], 'a');
    if (!second.ok) throw new Error(second.reason);
    const accepted = await acceptNegotiation(s.deps, {
      playerId: 'player-b',
      negotiationId: second.negotiation.id,
      now: NOW,
      today: 11,
    });
    expect(accepted.ok).toBe(true);
    const after = s.vassalages.vassalages[0]!;
    expect(after.id).toBe(vid);
    expect(after.terms).toEqual({ reward: bundle(20) });
    expect(after.version).toBe(2);
    expect(s.vassalages.vassalages).toHaveLength(1);
  });

  it('protinávrh bez přísahy je možný, přísaha v něm ne', async () => {
    const s = await setup();
    await bind(s);
    const first = await proposeTerms(s, [{ kind: 'tribute', goods: bundle(100) }]);
    if (!first.ok) throw new Error(first.reason);
    const withOath = await counterNegotiation(s.deps, {
      playerId: 'player-a',
      negotiationId: first.negotiation.id,
      items: oath(s.ids.a!, s.ids.b!),
      message: null,
      now: NOW,
      today: 11,
    });
    expect(withOath).toEqual({ ok: false, reason: R.oathChanged });
    const counter = await counterNegotiation(s.deps, {
      playerId: 'player-a',
      negotiationId: first.negotiation.id,
      items: [{ kind: 'tribute', goods: bundle(60) }],
      message: null,
      now: NOW,
      today: 11,
    });
    expect(counter.ok).toBe(true);
  });

  it('změnu podmínek bez dohody mezi rody odmítne', async () => {
    const s = await setup();
    const r = await proposeTerms(s, [{ kind: 'tribute', goods: bundle(10) }]);
    expect(r).toEqual({ ok: false, reason: NO_AGREEMENT });
  });

  it('cílová ves musí patřit pánovi', async () => {
    const s = await setup();
    await bind(s);
    // pán je a – ves b nepatří pánovi
    const bad = await proposeTerms(s, [{ kind: 'target-village', villageId: 'village-b' }]);
    expect(bad).toEqual({ ok: false, reason: TERM_REASONS.badVillage });
    const good = await proposeTerms(s, [{ kind: 'target-village', villageId: 'village-a' }]);
    expect(good.ok).toBe(true);
  });

  it.each([
    ['záporná dávka', [{ kind: 'tribute', goods: bundle(-1) }], TERM_REASONS.badAmount],
    ['prázdná dávka', [{ kind: 'tribute', goods: bundle(0) }], TERM_REASONS.emptyGoods],
    ['nula mužů', [{ kind: 'service', men: 0, days: 30 }], TERM_REASONS.badAmount],
    ['zlomek mužů', [{ kind: 'service', men: 1.5, days: 30 }], TERM_REASONS.badAmount],
    ['víc dní než rok', [{ kind: 'service', men: 2, days: 400 }], TERM_REASONS.badAmount],
    [
      'dvě dávky',
      [
        { kind: 'tribute', goods: bundle(1) },
        { kind: 'tribute', goods: bundle(2) },
      ],
      TERM_REASONS.duplicate,
    ],
  ] as [string, TermItem[], string][])('odmítne řádek: %s', async (_name, items, reason) => {
    const s = await setup();
    await bind(s);
    expect(await proposeTerms(s, items)).toEqual({ ok: false, reason });
  });
});
