import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { dayIndexOf } from '../../domain/calendar';
import { VASSALAGE, type MacroBundle } from '../../domain/vassalage';
import type { VillageState } from '../../domain/village';
import { DAY, bundle, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import { answerLevy, levyDialogs, type LevyDeps } from '../annual-levies';
import { answerComplaint, fileComplaint, judgeDispute, type JudgmentDeps } from '../judgment';
import { InMemoryDialogs } from './in-memory-dialogs';
import { InMemoryDisputes } from './in-memory-disputes';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Rozsudek pána (vassalage.md – Mír a spory; plán – úloha 6.16).

const T0 = new Date('2026-11-05T12:00:00Z');
const TODAY = dayIndexOf({ year: 503, month: 11, day: 5 });

function named(state: VillageState, name: string): VillageState {
  state.people.push({ id: 900, name, bornDay: DAY - 15_000, dwellingId: 500, sex: 'male' });
  return state;
}

async function world(): Promise<{
  deps: JudgmentDeps & LevyDeps;
  clock: { now: Date };
  disputes: InMemoryDisputes;
  dialogs: InMemoryDialogs;
  notices: InMemoryNotices;
  vassalages: InMemoryVassalages;
  villages: InMemoryVillages;
  shipments: InMemoryShipments;
  posts: { villageId: string; body: unknown }[];
  lord: string;
  plaintiff: string;
  defendant: string;
  stranger: string;
  villageP: string;
  villageD: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
  const dialogs = new InMemoryDialogs();
  const houses = new InMemoryHouses();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const disputes = new InMemoryDisputes();
  const clock = { now: T0 };
  const posts: { villageId: string; body: unknown }[] = [];
  const seats = [
    { owner: 'player-lord', cell: { x: 0, y: 0 }, name: 'Hrad', who: 'Bořivoj' },
    { owner: 'player-p', cell: { x: 3, y: 1 }, name: 'Lhota', who: 'Dalibor' },
    { owner: 'player-d', cell: { x: 0, y: 3 }, name: 'Důl', who: 'Ctibor' },
    { owner: 'player-s', cell: { x: 4, y: 4 }, name: 'Skála', who: 'Cizí' },
  ];
  const created = [];
  let seed = 11;
  for (const s of seats) {
    const settlement =
      s.cell.x === 0 && s.cell.y === 0
        ? await settlements.seatAtOrigin({
            ownerId: s.owner,
            landscapeSeed: seed++,
            layerVersions: CURRENT_LAYER_VERSIONS,
          })
        : (await settlements.create({
            ownerId: s.owner,
            landscapeSeed: seed++,
            layerVersions: CURRENT_LAYER_VERSIONS,
            worldCell: s.cell,
          }))!;
    const village = await villages.add(settlement.id, s.name, named(sender(), s.who));
    const house = await houses.create({ playerId: s.owner, kind: 'player', createdAt: T0 });
    await houses.setLord(house.id, { villageId: village.id, personId: 900 });
    created.push({ house, village });
  }
  const [lord, plaintiff, defendant, stranger] = created as [
    (typeof created)[number],
    (typeof created)[number],
    (typeof created)[number],
    (typeof created)[number],
  ];
  const since = { sinceAt: T0, sinceDay: TODAY, origin: 'negotiation' as const };
  const terms = {} as never;
  await vassalages.create({
    lordHouseId: lord.house.id,
    vassalHouseId: plaintiff.house.id,
    terms,
    ...since,
  });
  await vassalages.create({
    lordHouseId: lord.house.id,
    vassalHouseId: defendant.house.id,
    terms,
    ...since,
  });
  const deps = {
    disputes,
    dialogs,
    vassalages,
    houses,
    notices,
    villages: {
      find: (id: string) => villages.find(id),
      inbox: {
        post: (event: { villageId: string; body: unknown }) => {
          posts.push(event);
          return Promise.resolve(null);
        },
        pending: () => Promise.resolve([]),
      },
    },
    shipments: {
      shipments,
      villages,
      settlements,
      locks: new InMemoryPlayerLock(),
      now: () => new Date(0),
    },
    prepareVillage: () => Promise.resolve(null),
    now: () => clock.now,
  } as unknown as JudgmentDeps & LevyDeps;
  return {
    deps,
    clock,
    disputes,
    dialogs,
    notices,
    vassalages,
    villages,
    shipments,
    posts,
    lord: lord.house.id,
    plaintiff: plaintiff.house.id,
    defendant: defendant.house.id,
    stranger: stranger.house.id,
    villageP: plaintiff.village.id,
    villageD: defendant.village.id,
  };
}

type World = Awaited<ReturnType<typeof world>>;

const file = (w: World, message = 'Vzal mi dobytek.'): ReturnType<typeof fileComplaint> =>
  fileComplaint(w.deps, { playerId: 'player-p', against: w.defendant, message, today: TODAY });

const compensation = (b: Partial<MacroBundle>): Parameters<typeof judgeDispute>[1]['verdict'] => ({
  kind: 'compensation',
  bundle: bundle(b),
});

async function judged(
  w: World,
  verdict: Parameters<typeof judgeDispute>[1]['verdict'],
): Promise<string> {
  const filed = await file(w);
  if (!filed.ok) throw new Error(filed.reason);
  w.clock.now = new Date(T0.getTime() + VASSALAGE.verdictAfterMs);
  const r = await judgeDispute(w.deps, {
    playerId: 'player-lord',
    disputeId: filed.dispute.id,
    verdict,
    today: TODAY,
  });
  if (!r.ok) throw new Error(r.reason);
  return filed.dispute.id;
}

const answerOf = (
  dialogId: string,
  villageId: string,
  amounts: Partial<MacroBundle>,
): Parameters<typeof answerLevy>[1] => ({
  playerId: 'player-d',
  dialogId,
  lines: amounts.grainKg ? [{ good: 'grainKg', amount: amounts.grainKg }] : [],
  split: Object.keys(amounts).length ? { [villageId]: bundle(amounts) } : {},
  message: null,
  today: TODAY,
});

describe('žaloba', () => {
  it('žalovat smí jen vazala téhož pána; pán dostane upozornění', async () => {
    const w = await world();
    const ok = await file(w);
    expect(ok.ok).toBe(true);
    expect(w.notices.notices.find((n) => n.kind === 'complaint-filed')).toMatchObject({
      playerId: 'player-lord',
      payload: { name: 'Dalibor', otherName: 'Ctibor' },
    });
    // cizí rod bez společného pána, vlastní pán a prázdný vzkaz
    const bad = (against: string, message = 'x'): ReturnType<typeof fileComplaint> =>
      fileComplaint(w.deps, { playerId: 'player-p', against, message, today: TODAY });
    expect((await bad(w.stranger)).ok).toBe(false);
    expect((await bad(w.lord)).ok).toBe(false);
    expect((await bad(w.defendant, '  ')).ok).toBe(false);
  });

  it('jediný běžící spor na dvojici (i souběžně, i opačným směrem)', async () => {
    const w = await world();
    const [a, b] = await Promise.all([
      file(w),
      fileComplaint(w.deps, {
        playerId: 'player-d',
        against: w.plaintiff,
        message: 'Naopak.',
        today: TODAY,
      }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(w.disputes.rows).toHaveLength(1);
  });
});

describe('rozsudek', () => {
  it('bez vyjádření až po 1 skutečném dni; s vyjádřením hned', async () => {
    const w = await world();
    const filed = await file(w);
    if (!filed.ok) throw new Error(filed.reason);
    const judge = (): ReturnType<typeof judgeDispute> =>
      judgeDispute(w.deps, {
        playerId: 'player-lord',
        disputeId: filed.dispute.id,
        verdict: { kind: 'dismiss' },
        today: TODAY,
      });
    expect(await judge()).toMatchObject({ ok: false });
    w.clock.now = new Date(T0.getTime() + VASSALAGE.verdictAfterMs);
    expect((await judge()).ok).toBe(true);

    const w2 = await world();
    const f2 = await file(w2);
    if (!f2.ok) throw new Error(f2.reason);
    const own = await answerComplaint(w2.deps, {
      playerId: 'player-d',
      disputeId: f2.dispute.id,
      statement: 'Byl to jeho dobytek.',
      today: TODAY,
    });
    expect(own.ok).toBe(true);
    expect(w2.notices.notices.some((n) => n.kind === 'complaint-answered')).toBe(true);
    // vyjádřit se smí jen obžalovaný, a jednou
    expect(
      (
        await answerComplaint(w2.deps, {
          playerId: 'player-d',
          disputeId: f2.dispute.id,
          statement: 'Znovu',
          today: TODAY,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await answerComplaint(w2.deps, {
          playerId: 'player-p',
          disputeId: f2.dispute.id,
          statement: 'Já',
          today: TODAY,
        })
      ).ok,
    ).toBe(false);
    const r = await judgeDispute(w2.deps, {
      playerId: 'player-lord',
      disputeId: f2.dispute.id,
      verdict: { kind: 'dismiss' },
      today: TODAY,
    });
    expect(r.ok).toBe(true);
    expect(w2.dialogs.rows).toHaveLength(0);
    // spor je rozsouzen jednou a soudí jen pán
    expect(
      (
        await judgeDispute(w2.deps, {
          playerId: 'player-lord',
          disputeId: f2.dispute.id,
          verdict: { kind: 'dismiss' },
          today: TODAY,
        })
      ).ok,
    ).toBe(false);
  });

  it('soudí jen pán a rozsudek musí něco ukládat', async () => {
    const w = await world();
    const filed = await file(w);
    if (!filed.ok) throw new Error(filed.reason);
    await answerComplaint(w.deps, {
      playerId: 'player-d',
      disputeId: filed.dispute.id,
      statement: 'Ne.',
      today: TODAY,
    });
    const base = { disputeId: filed.dispute.id, today: TODAY };
    expect(
      (await judgeDispute(w.deps, { ...base, playerId: 'player-p', verdict: { kind: 'dismiss' } }))
        .ok,
    ).toBe(false);
    expect(
      (await judgeDispute(w.deps, { ...base, playerId: 'player-lord', verdict: compensation({}) }))
        .ok,
    ).toBe(false);
    expect(
      (
        await judgeDispute(w.deps, {
          ...base,
          playerId: 'player-lord',
          verdict: { kind: 'return-people', people: { families: 0, men: 0, women: 0 } },
        })
      ).ok,
    ).toBe(false);
    expect(w.disputes.rows[0]!.status).toBe('filed');
  });

  it('náhrada otevře obžalovanému dialog; celé: zásilka, bez neplnění', async () => {
    const w = await world();
    await judged(w, compensation({ grainKg: 100 }));
    const dialog = w.dialogs.rows[0]!;
    expect(dialog).toMatchObject({ kind: 'judgment', playerId: 'player-d', status: 'open' });
    expect(dialog.body).toMatchObject({ toVillageId: w.villageP, toHouseId: w.plaintiff });
    const views = await levyDialogs(w.deps, { playerId: 'player-d' });
    expect(views).toMatchObject([{ kind: 'judgment', lordHouseId: w.plaintiff }]);
    const r = await answerLevy(w.deps, answerOf(dialog.id, w.villageD, { grainKg: 100 }));
    expect(r.ok).toBe(true);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.shipments.rows[0]!.toVillageId).toBe(w.villageP);
    expect(w.vassalages.breachLog).toHaveLength(0);
    // oběma stranám přišlo upozornění na rozsudek
    const given = w.notices.notices.filter((n) => n.kind === 'judgment-given');
    expect(given.map((n) => n.playerId).sort()).toEqual(['player-d', 'player-p']);
  });

  it('míň i nic: zásilka podle odpovědi, nesplnění zapíše neplnění a kroniku', async () => {
    const w = await world();
    await judged(w, compensation({ grainKg: 100 }));
    const dialog = w.dialogs.rows[0]!;
    const r = await answerLevy(w.deps, answerOf(dialog.id, w.villageD, { grainKg: 40 }));
    expect(r.ok).toBe(true);
    expect(JSON.stringify(w.shipments.rows[0]!.body)).toContain('40');
    expect(w.vassalages.breachLog).toMatchObject([{ kind: 'judgment' }]);
    const events = w.posts.map((p) => JSON.stringify(p.body));
    expect(events.some((e) => e.includes('"kind":"disobeyed"') && e.includes('Ctibor'))).toBe(true);

    const w2 = await world();
    await judged(w2, compensation({ grainKg: 100 }));
    const none = await answerLevy(w2.deps, answerOf(w2.dialogs.rows[0]!.id, w2.villageD, {}));
    expect(none.ok).toBe(true);
    expect(w2.shipments.rows).toHaveLength(0);
    expect(w2.vassalages.breachLog).toMatchObject([{ kind: 'judgment' }]);
    expect(w2.notices.notices.find((n) => n.kind === 'levy-sent')?.payload).toMatchObject({
      judgment: true,
      short: true,
    });
  });

  it('vrácení lidí: dialog smí posílat lidi', async () => {
    const w = await world();
    await judged(w, { kind: 'return-people', people: { families: 1, men: 0, women: 0 } });
    // domácnost k odeslání: ves bez přidané hlavy rodu (ta v testu domácnost drží)
    w.villages.edit(w.villageD, (state) => {
      state.people = state.people.filter((p) => p.id !== 900);
    });
    const dialog = w.dialogs.rows[0]!;
    const r = await answerLevy(w.deps, {
      ...answerOf(dialog.id, w.villageD, {}),
      today: DAY,
      lines: [{ good: 'families', amount: 1 }],
      split: { [w.villageD]: bundle({ people: { families: 1, men: 0, women: 0 } }) },
    });
    expect(r.ok).toBe(true);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.vassalages.breachLog).toHaveLength(0);
  });

  it('mír a zamítnutí dialog neotevřou; mír se uloží na dobu', async () => {
    const w = await world();
    await judged(w, { kind: 'peace' });
    expect(w.dialogs.rows).toHaveLength(0);
    const row = w.disputes.rows[0]!;
    expect(row.peaceUntilDay).toBe(Math.round(TODAY + VASSALAGE.judgmentPeaceYears * 365.25));
  });
});
