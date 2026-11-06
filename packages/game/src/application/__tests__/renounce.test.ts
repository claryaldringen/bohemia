import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearVassalageEndedHooks,
  MESSAGE_TOO_LONG,
  NOT_IN_AGREEMENT,
  onVassalageEnded,
  renounceVassalage,
  type RenounceDeps,
} from '../renounce';
import { NOW, setup, type Setup } from './negotiation-fixture';

afterEach(clearVassalageEndedHooks);

/** Strom: x → a → b → c, a ke všemu b → d; d je vazalem b. Vypovídá se a → b. */
async function tree(s: Setup): Promise<{ ab: string; deps: RenounceDeps }> {
  const v = s.vassalages;
  const mk = async (lord: string, vassal: string): Promise<string> =>
    (
      await v.create({
        lordHouseId: lord,
        vassalHouseId: vassal,
        terms: {},
        origin: 'negotiation',
        sinceAt: NOW,
        sinceDay: 1,
      })
    ).id;
  // další rody x, d, e
  const extra: Record<string, string> = {};
  for (const key of ['x', 'd', 'e']) {
    const h = await s.houses.create({ playerId: `player-${key}`, kind: 'player', createdAt: NOW });
    await s.houses.setLord(h.id, { villageId: `village-${key}`, personId: 1 });
    extra[key] = h.id;
  }
  await mk(extra.x!, s.ids.a!); // x je pánem a
  const ab = await mk(s.ids.a!, s.ids.b!);
  await mk(s.ids.b!, s.ids.c!); // c je vazalem b
  await mk(s.ids.a!, extra.d!); // d je druhý vazal a (ostatní dohody a trvají)
  await mk(extra.e!, s.ids.b!); // e je druhý pán b
  return {
    ab,
    deps: {
      houses: s.houses,
      vassalages: s.vassalages,
      notices: s.notices,
      villages: s.deps.villages,
    },
  };
}

describe('vypovězení věrnosti', () => {
  it('platí hned, ostatní dohody obou stran trvají, upozornění dostane celý strom jednou', async () => {
    const s = await setup();
    const { ab, deps } = await tree(s);
    const r = await renounceVassalage(deps, {
      playerId: 'player-b',
      vassalageId: ab,
      message: 'Končím.',
      now: NOW,
      today: 20,
    });
    expect(r).toEqual({ ok: true });
    const ended = s.vassalages.vassalages.find((v) => v.id === ab);
    expect(ended?.endedAt).toEqual(NOW);
    expect(s.vassalages.reasons.get(ab)).toBe('renounced');
    expect(s.vassalages.vassalages.filter((v) => v.endedAt === null)).toHaveLength(4);

    const fresh = s.notices.notices.filter((n) => n.kind === 'vassalage-renounced');
    const players = fresh.map((n) => n.playerId).sort();
    // x, a, d (nad a pod a), b, c, e – každý právě jednou
    expect(players).toEqual(
      ['player-a', 'player-b', 'player-c', 'player-d', 'player-e', 'player-x'].sort(),
    );
    // vzkaz vidí jen druhá strana (a), strom ne; payload bez id účtů
    expect(fresh.filter((n) => 'message' in n.payload).map((n) => n.playerId)).toEqual([
      'player-a',
    ]);
    expect(JSON.stringify(fresh[0]!.payload)).not.toContain('player-');
    // kronika obou stran
    const villages = s.posts.map((p) => p.villageId).sort();
    expect(villages).toEqual(['village-a', 'village-b']);
    expect(JSON.stringify(s.posts[0]!.body)).toContain('vassalage-renounced');
  });

  it('smí i pán; cizí hráč ne; opakované vypovězení ne', async () => {
    const s = await setup();
    const { ab, deps } = await tree(s);
    const base = { vassalageId: ab, message: null, now: NOW, today: 20 };
    expect(await renounceVassalage(deps, { ...base, playerId: 'player-c' })).toEqual({
      ok: false,
      reason: NOT_IN_AGREEMENT,
    });
    expect(await renounceVassalage(deps, { ...base, playerId: 'player-a' })).toEqual({ ok: true });
    const again = await renounceVassalage(deps, { ...base, playerId: 'player-b' });
    expect(again.ok).toBe(false);
    expect(
      await renounceVassalage(deps, {
        ...base,
        playerId: 'player-b',
        message: 'x'.repeat(501),
      }),
    ).toEqual({ ok: false, reason: MESSAGE_TOO_LONG });
  });

  it('po ukončení zavolá registrované háčky', async () => {
    const s = await setup();
    const { ab, deps } = await tree(s);
    const hook = vi.fn();
    onVassalageEnded(hook);
    await renounceVassalage(deps, {
      playerId: 'player-b',
      vassalageId: ab,
      message: null,
      now: NOW,
      today: 20,
    });
    expect(hook).toHaveBeenCalledWith(
      expect.objectContaining({ vassalageId: ab, reason: 'renounced', day: 20 }),
    );
  });
});

describe('neplnění', () => {
  it('zvýší počet a dohodu neukončí', async () => {
    const s = await setup();
    const { ab } = await tree(s);
    expect(await s.vassalages.addBreach(ab, 'levy', 30)).toBe(true);
    expect(await s.vassalages.addBreach(ab, 'summons', 31)).toBe(true);
    const v = await s.vassalages.byId(ab);
    expect(v).toMatchObject({ breaches: 2, endedAt: null });
    await s.vassalages.end(ab, 'renounced', NOW);
    expect(await s.vassalages.addBreach(ab, 'repay', 32)).toBe(false);
  });
});
