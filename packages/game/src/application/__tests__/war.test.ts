import { describe, expect, it } from 'vitest';
import {
  houseProtectedUntil,
  ISOLATED_PROTECTION_UNTIL,
  protectedReason,
  protectionDaysLeft,
} from '../../domain/war';
import { acceptNegotiation } from '../negotiate';
import {
  declareWar,
  notifyProtectionEnding,
  quietWars,
  startWarByAttack,
  type WarDeps,
} from '../declare-war';
import type { NegotiateDeps } from '../negotiate';
import { InMemoryDisputes } from './in-memory-disputes';
import { DAY_MS, NOW, oath, setup, type Setup } from './negotiation-fixture';

const at = (days: number): Date => new Date(NOW.getTime() + days * DAY_MS);

type Deps = NegotiateDeps & WarDeps;
const depsOf = (s: Setup): Deps => ({
  ...s.deps,
  wars: s.wars,
  notices: s.notices,
  disputes: new InMemoryDisputes(),
  vassalages: s.vassalages,
});

const declare = (
  s: Setup,
  from: string,
  to: string,
  days: number,
  extra: { demand?: ReturnType<typeof oath>; message?: string | null } = {},
): ReturnType<typeof declareWar> =>
  declareWar(depsOf(s), {
    playerId: `player-${from}`,
    target: s.ids[to]!,
    demand: extra.demand ?? [],
    message: extra.message ?? null,
    now: at(days),
    today: 10,
  });

const events = (s: Setup): string[] =>
  s.posts.map((p) => (p.body.kind === 'chronicle' ? JSON.stringify(p.body.event) : ''));

describe('ochrana nováčka', () => {
  it('rod je chráněn 7 skutečných dní od založení a vlastní útok ochranu ukončí', () => {
    const house = { kind: 'player' as const, createdAt: NOW };
    expect(houseProtectedUntil(house, null)).toEqual(at(7));
    expect(houseProtectedUntil(house, at(2))).toBeNull();
    expect(houseProtectedUntil(house, at(8))).toEqual(at(7));
    expect(houseProtectedUntil({ kind: 'npc', createdAt: NOW }, null)).toBeNull();
  });

  it('odříznutý rod (newcomers.md) je chráněn vždy, umístěný od umístění', () => {
    const isolated = { kind: 'player' as const, createdAt: NOW, placedAt: null };
    expect(houseProtectedUntil(isolated, null)).toEqual(ISOLATED_PROTECTION_UNTIL);
    expect(protectionDaysLeft(houseProtectedUntil(isolated, null), at(30))).toBeGreaterThan(0);
    const placed = { kind: 'player' as const, createdAt: NOW, placedAt: at(10) };
    expect(houseProtectedUntil(placed, null)).toEqual(at(17));
  });

  it('zbývající dny se zaokrouhlují nahoru a důvod se skloňuje', () => {
    expect(protectionDaysLeft(at(7), at(4))).toBe(3);
    expect(protectionDaysLeft(at(7), new Date(at(4).getTime() + 1))).toBe(3);
    expect(protectionDaysLeft(at(7), at(7))).toBe(0);
    expect(protectedReason('Ctibor', 1)).toBe('Ctibor je pod ochranou ještě 1 den.');
    expect(protectedReason('Ctibor', 3)).toBe('Ctibor je pod ochranou ještě 3 dny.');
    expect(protectedReason('Ctibor', 5)).toBe('Ctibor je pod ochranou ještě 5 dní.');
  });
});

describe('opověď války', () => {
  it('rod v ochraně nelze napadnout, důvod nese jméno hlavy rodu a dny', async () => {
    const s = await setup();
    const r = await declare(s, 'a', 'b', 4);
    expect(r).toEqual({ ok: false, reason: 'Ctibor je pod ochranou ještě 3 dny.' });
    expect(s.wars.all).toHaveLength(0);
  });

  it('po ochraně válka začne, napadený dostane upozornění a kronika obou rodů neutrální záznam', async () => {
    const s = await setup();
    const r = await declare(s, 'a', 'b', 8);
    expect(r.ok).toBe(true);
    expect(s.wars.all[0]).toMatchObject({ how: 'declared', status: 'active', startedDay: 10 });
    expect(s.notices.notices.at(-1)).toMatchObject({
      playerId: 'player-b',
      kind: 'war-declared',
      payload: { houseId: s.ids.a, name: 'Bořivoj' },
    });
    expect(s.posts.map((p) => p.villageId).sort()).toEqual(['village-a', 'village-b']);
    expect(events(s)[0]).toContain('"step":"declared"');
    // bez požadavku a vzkazu se jednání neotvírá
    expect(s.negotiations.records).toHaveLength(0);
  });

  it('druhá opověď téže dvojici nezaloží druhou válku', async () => {
    const s = await setup();
    await declare(s, 'a', 'b', 8);
    expect(await declare(s, 'b', 'a', 8)).toEqual({ ok: false, reason: expect.any(String) });
    expect(s.wars.all).toHaveLength(1);
  });

  it('vlastní opověď ukončí ochranu opovídajícího', async () => {
    const s = await setup();
    const early = await declare(s, 'c', 'a', 3);
    expect(early.ok).toBe(false);
    // starý rod `d` se nechrání; a (nový) ho opoví a tím ochranu ztratí
    const old = await s.houses.create({
      playerId: 'player-d',
      kind: 'player',
      createdAt: at(-30),
    });
    await s.houses.setLord(old.id, { villageId: 'village-d', personId: 1 });
    const r = await declareWar(depsOf(s), {
      playerId: 'player-a',
      target: old.id,
      demand: [],
      message: null,
      now: at(1),
      today: 10,
    });
    expect(r.ok).toBe(true);
    const back = await declare(s, 'c', 'a', 2);
    expect(back.ok).toBe(true);
  });

  it('válka uvnitř stromu vazalství je dovolená', async () => {
    const s = await setup();
    const id = await s.vassalages.create({
      lordHouseId: s.ids.a!,
      vassalHouseId: s.ids.b!,
      terms: {},
      origin: 'negotiation',
      sinceAt: NOW,
      sinceDay: 1,
    });
    expect(id).toBeTruthy();
    expect((await declare(s, 'b', 'a', 8)).ok).toBe(true);
    expect(s.vassalages.vassalages).toHaveLength(1);
  });

  it('s požadavkem otevře jednání a jeho přijetí ukončí válku mírem s podmínkami', async () => {
    const s = await setup();
    const r = await declare(s, 'a', 'b', 8, {
      demand: oath(s.ids.a!, s.ids.b!),
      message: 'Chci na vás jít',
    });
    expect(r.ok).toBe(true);
    const negotiation = s.negotiations.records[0]!;
    expect(negotiation.rounds[0]!.items[0]).toMatchObject({ kind: 'war-demand' });
    const accepted = await acceptNegotiation(depsOf(s), {
      playerId: 'player-b',
      negotiationId: negotiation.id,
      now: at(9),
      today: 11,
    });
    expect(accepted.ok).toBe(true);
    expect(s.wars.all[0]!.status).toBe('peace');
    expect(s.vassalages.vassalages[0]).toMatchObject({
      lordHouseId: s.ids.a,
      vassalHouseId: s.ids.b,
    });
    expect(events(s).some((e) => e.includes('"step":"peace"'))).toBe(true);
  });

  it('přijetí požadavku po utichnutí války mír nezaloží', async () => {
    const s = await setup();
    await declare(s, 'a', 'b', 8, { demand: oath(s.ids.a!, s.ids.b!) });
    await s.wars.end(s.wars.all[0]!.id, 'quiet', at(9));
    const accepted = await acceptNegotiation(depsOf(s), {
      playerId: 'player-b',
      negotiationId: s.negotiations.records[0]!.id,
      now: at(9),
      today: 11,
    });
    expect(accepted.ok).toBe(false);
    expect(s.vassalages.vassalages).toHaveLength(0);
  });

  it('požadavek s podmínkami bez přísahy odmítne', async () => {
    const s = await setup();
    const r = await declare(s, 'a', 'b', 8, {
      demand: [{ kind: 'service', men: 1, days: 30 }],
    });
    expect(r.ok).toBe(false);
    expect(s.wars.all).toHaveLength(0);
  });
});

describe('přepadení bez opovědi', () => {
  it('chráněný rod nelze přepadnout', async () => {
    const s = await setup();
    const r = await startWarByAttack(depsOf(s), {
      attackerId: s.ids.a!,
      defenderId: s.ids.b!,
      now: at(2),
      today: 10,
    });
    expect(r.ok).toBe(false);
  });

  it('válka začne prvním útokem, zapíše neutrální záznam a opakovaný útok jen posune střet', async () => {
    const s = await setup();
    const input = { attackerId: s.ids.a!, defenderId: s.ids.b!, now: at(8), today: 10 };
    expect((await startWarByAttack(depsOf(s), input)).ok).toBe(true);
    expect(s.wars.all[0]).toMatchObject({ how: 'ambush', lastClashDay: 10 });
    expect(events(s)[0]).toContain('"step":"ambush"');
    expect((await startWarByAttack(depsOf(s), { ...input, today: 50 })).ok).toBe(true);
    expect(s.wars.all).toHaveLength(1);
    expect(s.wars.all[0]!.lastClashDay).toBe(50);
    expect(events(s)).toHaveLength(2);
  });
});

describe('utichnutí války', () => {
  it('po 3 herních letech bez střetu válka utichne a kronika obou rodů to věcně zapíše', async () => {
    const s = await setup();
    await declare(s, 'a', 'b', 8);
    const deps = { wars: s.wars, houses: s.houses, villages: s.deps.villages };
    expect(await quietWars(deps, { today: 10 + 1000, now: at(9) })).toBe(0);
    expect(await quietWars(deps, { today: 10 + 1096, now: at(9) })).toBe(1);
    expect(s.wars.all[0]!.status).toBe('quiet');
    const quiet = s.posts.filter((p) => JSON.stringify(p.body).includes('"step":"quiet"'));
    expect(quiet.map((p) => JSON.stringify(p.body))).toEqual([
      expect.stringContaining('"actor":"Bořivoj","other":"Ctibor"'),
      expect.stringContaining('"actor":"Ctibor","other":"Bořivoj"'),
    ]);
    expect(await quietWars(deps, { today: 10 + 2000, now: at(9) })).toBe(0);
  });

  it('střet posune utichnutí', async () => {
    const s = await setup();
    await declare(s, 'a', 'b', 8);
    await s.wars.touchClash(s.wars.all[0]!.id, 800);
    const deps = { wars: s.wars, houses: s.houses, villages: s.deps.villages };
    expect(await quietWars(deps, { today: 10 + 1096, now: at(9) })).toBe(0);
  });
});

describe('upozornění na konec ochrany', () => {
  it('rodu, jemuž ochrana končí do dne, přijde upozornění jednou', async () => {
    const s = await setup();
    const deps = { houses: s.houses, wars: s.wars, notices: s.notices };
    expect(await notifyProtectionEnding(deps, { now: at(3), today: 10 })).toBe(0);
    expect(await notifyProtectionEnding(deps, { now: at(6.5), today: 10 })).toBe(3);
    expect(await notifyProtectionEnding(deps, { now: at(6.6), today: 10 })).toBe(0);
    expect(s.notices.notices.filter((n) => n.kind === 'protection-ending')).toHaveLength(3);
  });

  it('odříznutý rod „ochrana končí“ nedostane – až týden od umístění (newcomers.md)', async () => {
    const s = await setup();
    const isolated = (await s.houses.byId(s.ids.a!))!;
    isolated.placedAt = null;
    const deps = { houses: s.houses, wars: s.wars, notices: s.notices };
    expect(await notifyProtectionEnding(deps, { now: at(6.5), today: 10 })).toBe(2);
    isolated.placedAt = at(20);
    expect(await notifyProtectionEnding(deps, { now: at(25), today: 10 })).toBe(0);
    expect(await notifyProtectionEnding(deps, { now: at(26.5), today: 10 })).toBe(1);
    const own = s.notices.notices.filter(
      (n) => n.kind === 'protection-ending' && n.playerId === isolated.playerId,
    );
    expect(own).toHaveLength(1);
  });

  it('rod, který ochranu ukončil sám, upozornění nedostane', async () => {
    const s = await setup();
    await s.wars.markAttack(s.ids.a!, at(1));
    const deps = { houses: s.houses, wars: s.wars, notices: s.notices };
    expect(await notifyProtectionEnding(deps, { now: at(6.5), today: 10 })).toBe(2);
  });
});
