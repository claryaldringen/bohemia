import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { dayIndexOf } from '../../domain/calendar';
import { TRADE_REASONS, type TermItem } from '../../domain/negotiation';
import { DAY, bundle, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import type { MacroBundle } from '../../domain/vassalage';
import type { VillageState } from '../../domain/village';
import { answerLevy, levyDialogs, type LevyDeps } from '../annual-levies';
import {
  acceptNegotiation,
  counterNegotiation,
  openNegotiation,
  type NegotiateDeps,
} from '../negotiate';
import type { DirectoryEntry } from '../world-directory';
import { InMemoryDialogs } from './in-memory-dialogs';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Obchod mezi hráči (vassalage.md – Hospodářství mezi hráči; plán – úloha 4.7).

const NOW = new Date('2026-11-05T12:00:00Z');
const DAY_NOW = dayIndexOf({ year: 503, month: 11, day: 5 });

function named(state: VillageState, name: string): VillageState {
  state.people.push({ id: 900, name, bornDay: DAY - 15_000, dwellingId: 500, sex: 'male' });
  return state;
}

async function world(): Promise<{
  deps: NegotiateDeps & LevyDeps;
  dialogs: InMemoryDialogs;
  notices: InMemoryNotices;
  shipments: InMemoryShipments;
  villages: InMemoryVillages;
  a: string;
  c: string;
  villageA: string;
  villageC: string;
  extraA: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
  const dialogs = new InMemoryDialogs();
  const houses = new InMemoryHouses();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const negotiations = new InMemoryNegotiations(vassalages, notices, () => NOW);
  const sa = await settlements.seatAtOrigin({
    ownerId: 'player-a',
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const sc = (await settlements.create({
    ownerId: 'player-c',
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 3, y: 1 },
  }))!;
  const sx = (await settlements.create({
    ownerId: 'player-a',
    landscapeSeed: 13,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 3 },
  }))!;
  const va = await villages.add(sa.id, 'Dub', named(sender(), 'Ctibor'));
  const vc = await villages.add(sc.id, 'Lhota', named(sender(), 'Dalibor'));
  const vx = await villages.add(sx.id, 'Důl', named(sender(), 'Jiný'));
  const ha = await houses.create({ playerId: 'player-a', kind: 'player', createdAt: NOW });
  await houses.setLord(ha.id, { villageId: va.id, personId: 900 });
  const hc = await houses.create({ playerId: 'player-c', kind: 'player', createdAt: NOW });
  await houses.setLord(hc.id, { villageId: vc.id, personId: 900 });
  const owned: Record<string, string[]> = { [ha.id]: [va.id, vx.id], [hc.id]: [vc.id] };
  const deps = {
    dialogs,
    vassalages,
    houses,
    notices,
    negotiations,
    villages,
    worldDirectory: {
      entriesOf: async (ids: string[]) => {
        const out: DirectoryEntry[] = [];
        for (const id of ids) {
          const house = await houses.byId(id);
          if (house) {
            out.push({
              house,
              seat: { x: 0, y: 0 },
              digests: (owned[id] ?? []).map((v) => ({ id: v })),
            } as unknown as DirectoryEntry);
          }
        }
        return out;
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
  } as unknown as NegotiateDeps & LevyDeps;
  return {
    deps,
    dialogs,
    notices,
    shipments,
    villages,
    a: ha.id,
    c: hc.id,
    villageA: va.id,
    villageC: vc.id,
    extraA: vx.id,
  };
}

const trade = (give: Partial<MacroBundle>, get: Partial<MacroBundle>): TermItem => ({
  kind: 'trade',
  give: bundle(give),
  get: bundle(get),
  fromVillage: {},
});

/** A nabídne C: A dá obilí, C dá klády; C přijme. */
async function agreed(w: Awaited<ReturnType<typeof world>>): Promise<string> {
  const opened = await openNegotiation(w.deps, {
    playerId: 'player-a',
    to: w.c,
    items: [trade({ grainKg: 200 }, { logs: 10 })],
    message: null,
    now: NOW,
    today: DAY_NOW,
  });
  if (!opened.ok) throw new Error(opened.reason);
  const accepted = await acceptNegotiation(w.deps, {
    playerId: 'player-c',
    negotiationId: opened.negotiation.id,
    now: NOW,
    today: DAY_NOW,
  });
  if (!accepted.ok) throw new Error(accepted.reason);
  return opened.negotiation.id;
}

const answer = (
  dialogId: string,
  playerId: string,
  villageId: string,
  amounts: Partial<MacroBundle>,
): Parameters<typeof answerLevy>[1] => ({
  playerId,
  dialogId,
  lines: [
    ...(amounts.grainKg ? [{ good: 'grainKg' as const, amount: amounts.grainKg }] : []),
    ...(amounts.logs ? [{ good: 'logs' as const, amount: amounts.logs }] : []),
  ],
  split: { [villageId]: bundle(amounts) },
  message: null,
  today: DAY_NOW,
});

describe('obchod mezi hráči', () => {
  it('bez vazalství: po přijetí dva dialogy, každé straně jeden', async () => {
    const w = await world();
    await agreed(w);
    expect(w.dialogs.rows).toHaveLength(2);
    const byPlayer = Object.fromEntries(w.dialogs.rows.map((d) => [d.playerId, d]));
    expect(byPlayer['player-a']).toMatchObject({ kind: 'trade-send', status: 'open' });
    expect(byPlayer['player-a']!.body).toMatchObject({ toVillageId: w.villageC });
    expect(byPlayer['player-c']!.body).toMatchObject({ toVillageId: w.villageA });
    // obě strany se dozvědí, že čeká odeslání
    const pending = w.notices.notices.filter((n) => n.kind === 'levy-pending');
    expect(pending.map((n) => n.playerId).sort()).toEqual(['player-a', 'player-c']);
  });

  it('A pošle celé, C míň: zásilky vzniknou, upozornění dorazí, nic se nevynucuje', async () => {
    const w = await world();
    await agreed(w);
    const [dA, dC] = ['player-a', 'player-c'].map((p) =>
      w.dialogs.rows.find((d) => d.playerId === p)!,
    );
    const a = await answerLevy(w.deps, answer(dA!.id, 'player-a', w.villageA, { grainKg: 200 }));
    expect(a).toMatchObject({ ok: true });
    const c = await answerLevy(w.deps, answer(dC!.id, 'player-c', w.villageC, { logs: 4 }));
    expect(c).toMatchObject({ ok: true });
    expect(w.shipments.rows).toHaveLength(2);
    const toC = w.shipments.rows.find((r) => r.toVillageId === w.villageC)!;
    const toA = w.shipments.rows.find((r) => r.toVillageId === w.villageA)!;
    expect(JSON.stringify(toC.body)).toContain('200');
    expect(JSON.stringify(toA.body)).toContain('"logs":4');
    expect(toA.purpose).toBe('trade');
    expect(w.dialogs.rows.every((d) => d.status === 'answered')).toBe(true);
    const sent = w.notices.notices.filter((n) => n.kind === 'levy-sent');
    expect(sent.map((n) => n.playerId).sort()).toEqual(['player-a', 'player-c']);
    const toPlayerA = sent.find((n) => n.playerId === 'player-a')!;
    expect(toPlayerA.payload).toMatchObject({
      trade: true,
      vassalName: 'Dalibor',
      parts: [{ good: 'logs', sent: 4, agreed: 10 }],
      short: true,
    });
    // bilance zboží: odesílateli ubylo přesně poslané (zásilka je na cestě, příjemce ho dostane)
    const after = async (id: string): Promise<VillageState> => (await w.villages.find(id))!.state;
    expect((await after(w.villageA)).storesKg).toBe(sender().storesKg - 200);
    expect((await after(w.villageC)).woodLogs).toBe(sender().woodLogs! - 4);
  });

  it('nic: strana může neposlat vůbec; dvojklik nic nezdvojí', async () => {
    const w = await world();
    await agreed(w);
    const dC = w.dialogs.rows.find((d) => d.playerId === 'player-c')!;
    const none = answerLevy(w.deps, {
      playerId: 'player-c',
      dialogId: dC.id,
      lines: [],
      split: {},
      message: null,
      today: DAY_NOW,
    });
    expect(await none).toMatchObject({ ok: true });
    expect(w.shipments.rows).toHaveLength(0);
    const sent = w.notices.notices.filter((n) => n.kind === 'levy-sent');
    expect(sent[0]!.payload).toMatchObject({ trade: true, parts: [], short: true });
    const again = await answerLevy(w.deps, answer(dC.id, 'player-c', w.villageC, { logs: 10 }));
    expect(again.ok).toBe(false);
    expect(w.shipments.rows).toHaveLength(0);
  });

  it('cizí dialog ani cizí ves nejdou; lidé v obchodu ne', async () => {
    const w = await world();
    await agreed(w);
    const dA = w.dialogs.rows.find((d) => d.playerId === 'player-a')!;
    expect(
      (await answerLevy(w.deps, answer(dA.id, 'player-c', w.villageC, { grainKg: 10 }))).ok,
    ).toBe(false);
    const foreign = await answerLevy(
      w.deps,
      answer(dA.id, 'player-a', w.villageC, { grainKg: 10 }),
    );
    expect(foreign.ok).toBe(false);
    const people = await answerLevy(w.deps, {
      ...answer(dA.id, 'player-a', w.villageA, {}),
      lines: [],
      split: { [w.villageA]: bundle({ people: { families: 0, men: 1, women: 0 } }) },
    });
    expect(people).toMatchObject({ ok: false, reason: TRADE_REASONS.badGoods });
    expect(w.shipments.rows).toHaveLength(0);
  });

  it('dialog nabídne rozdělení po vsích rodu', async () => {
    const w = await world();
    await agreed(w);
    const views = await levyDialogs(w.deps, { playerId: 'player-a' });
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ kind: 'trade-send', agreed: { grainKg: 200 } });
    expect(views[0]!.villages.map((v) => v.villageId).sort()).toEqual(
      [w.villageA, w.extraA].sort(),
    );
  });

  it('jen makrokomodity: lidé, robota i prázdná strana odmítnuty', async () => {
    const w = await world();
    const open = (item: TermItem): ReturnType<typeof openNegotiation> =>
      openNegotiation(w.deps, {
        playerId: 'player-a',
        to: w.c,
        items: [item],
        message: null,
        now: NOW,
        today: DAY_NOW,
      });
    const people = await open(trade({ people: { families: 0, men: 1, women: 0 } }, { logs: 5 }));
    expect(people).toMatchObject({ ok: false, reason: TRADE_REASONS.badGoods });
    expect(await open(trade({ laborDays: 5 }, { logs: 5 }))).toMatchObject({ ok: false });
    expect(await open(trade({}, { logs: 5 }))).toMatchObject({ ok: false });
    expect(await open({ kind: 'oath', lord: w.a, vassal: w.c })).toMatchObject({ ok: true });
  });

  it('protinávrh a ves: cizí ves v obchodu odmítnuta, vlastní projde', async () => {
    const w = await world();
    const bad = await openNegotiation(w.deps, {
      playerId: 'player-a',
      to: w.c,
      items: [
        { ...trade({ grainKg: 5 }, { logs: 1 }), fromVillage: { [w.a]: w.villageC } } as TermItem,
      ],
      message: null,
      now: NOW,
      today: DAY_NOW,
    });
    expect(bad).toMatchObject({ ok: false, reason: TRADE_REASONS.badVillage });
    const opened = await openNegotiation(w.deps, {
      playerId: 'player-a',
      to: w.c,
      items: [
        { ...trade({ grainKg: 5 }, { logs: 1 }), fromVillage: { [w.a]: w.extraA } } as TermItem,
      ],
      message: null,
      now: NOW,
      today: DAY_NOW,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const counter = await counterNegotiation(w.deps, {
      playerId: 'player-c',
      negotiationId: opened.negotiation.id,
      items: [trade({ logs: 2 }, { grainKg: 5 })],
      message: null,
      now: NOW,
      today: DAY_NOW,
    });
    expect(counter.ok).toBe(true);
    // protinávrh z jiného druhu jednání nejde
    const wrong = await counterNegotiation(w.deps, {
      playerId: 'player-a',
      negotiationId: opened.negotiation.id,
      items: [{ kind: 'service', men: 1, days: 1 }],
      message: null,
      now: NOW,
      today: DAY_NOW,
    });
    expect(wrong.ok).toBe(false);
  });
});
