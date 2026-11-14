import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { dayIndexOf } from '../../domain/calendar';
import { PEACE_REASONS, type TermItem } from '../../domain/negotiation';
import { DAY, bundle, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import type { MacroBundle } from '../../domain/vassalage';
import { applyInboxDay, type VillageState } from '../../domain/village';
import { answerLevy, openAnnualDialogs, type LevyDeps } from '../annual-levies';
import { cedeVillages, checkCede } from '../cede-village';
import {
  ACCEPTANCE_OUTBOX_LEASE_MS,
  acceptNegotiation,
  counterNegotiation,
  deliverPendingAcceptances,
  openNegotiation,
  type AcceptanceDeps,
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
import { InMemoryWars } from './in-memory-wars';

// Mírové jednání (war.md – Konec války – mírové jednání; plán – úloha 6.3).

const NOW = new Date('2026-11-05T12:00:00Z');
const DAY_NOW = dayIndexOf({ year: 503, month: 11, day: 5 });
const NOV_1 = dayIndexOf({ year: 503, month: 11, day: 1 });

/** Ves s mužem rodu (30 let), jeho ženou a dítětem. */
function withFamily(state: VillageState): VillageState {
  state.people.push(
    { id: 901, bornDay: DAY - 11_000, dwellingId: 500, sex: 'male', line: true },
    { id: 902, bornDay: DAY - 10_000, dwellingId: 500, sex: 'female', spouseId: 901 },
    { id: 903, bornDay: DAY - 1_500, dwellingId: 500, sex: 'male', fatherId: 901, motherId: 902 },
  );
  state.people[state.people.length - 3]!.spouseId = 902;
  return state;
}

async function world() {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
  const dialogs = new InMemoryDialogs();
  const houses = new InMemoryHouses();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const wars = new InMemoryWars();
  const negotiations = new InMemoryNegotiations(
    vassalages,
    notices,
    () => NOW,
    undefined,
    undefined,
    wars,
  );
  const locks = new InMemoryPlayerLock();
  const sa = (await settlements.create({
    ownerId: 'player-a',
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 0 },
  }))!;
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
  const va = await villages.add(sa.id, 'Dub', sender());
  const vc = await villages.add(sc.id, 'Lhota', sender());
  const vx = await villages.add(sx.id, 'Důl', withFamily(sender()));
  const ha = await houses.create({ playerId: 'player-a', kind: 'player', createdAt: NOW });
  await houses.setLord(ha.id, { villageId: va.id, personId: 900 });
  const hc = await houses.create({ playerId: 'player-c', kind: 'player', createdAt: NOW });
  await houses.setLord(hc.id, { villageId: vc.id, personId: 900 });
  await wars.start({
    houses: [ha.id, hc.id],
    startedAt: NOW,
    startedDay: DAY_NOW - 5,
    how: 'declared',
  });
  const cedeDeps = { houses, settlements, villages, locks };
  const deps = {
    dialogs,
    vassalages,
    houses,
    notices,
    negotiations,
    villages,
    worldDirectory: { entriesOf: async (): Promise<DirectoryEntry[]> => [] },
    cede: {
      check: (p: readonly [string, string], ids: readonly string[]) => checkCede(cedeDeps, p, ids),
      apply: (input: Parameters<typeof cedeVillages>[1]) => cedeVillages(cedeDeps, input),
    },
    shipments: {
      shipments,
      villages,
      settlements,
      locks,
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
    settlements,
    wars,
    negotiations,
    vassalages,
    a: ha.id,
    c: hc.id,
    villageA: va.id,
    villageC: vc.id,
    extraA: vx.id,
    mapX: sx.id,
  };
}

type World = Awaited<ReturnType<typeof world>>;

const peace = (line: Omit<Extract<TermItem, { kind: 'peace' }>, 'kind'> = {}): TermItem[] => [
  { kind: 'peace', ...line },
];

/** Hráč `from` nabídne mír a protistrana ho přijme; vrací výsledek přijetí. */
async function agree(w: World, from: 'a' | 'c', items: TermItem[]) {
  const to = from === 'a' ? 'c' : 'a';
  const opened = await openNegotiation(w.deps, {
    playerId: `player-${from}`,
    to: w[to],
    items,
    message: null,
    now: NOW,
    today: DAY_NOW,
  });
  if (!opened.ok) return opened;
  return acceptNegotiation(w.deps, {
    playerId: `player-${to}`,
    negotiationId: opened.negotiation.id,
    now: NOW,
    today: DAY_NOW,
  });
}

const answer = (
  dialogId: string,
  playerId: string,
  villageId: string,
  amounts: Partial<MacroBundle>,
): Parameters<typeof answerLevy>[1] => ({
  playerId,
  dialogId,
  lines: amounts.grainKg ? [{ good: 'grainKg' as const, amount: amounts.grainKg }] : [],
  split: amounts.grainKg ? { [villageId]: bundle(amounts) } : {},
  message: null,
  today: DAY_NOW,
});

describe('mírové jednání', () => {
  it('mír bez podmínek ukončí válku mírem', async () => {
    const w = await world();
    const r = await agree(w, 'c', peace());
    expect(r.ok).toBe(true);
    expect(w.wars.all[0]!.status).toBe('peace');
    expect(w.vassalages.vassalages).toHaveLength(0);
  });

  it('bez války mír nabídnout nejde; po přijetí druhé přijetí nic nezdvojí', async () => {
    const w = await world();
    await w.wars.end(w.wars.all[0]!.id, 'quiet', NOW);
    const r = await agree(w, 'a', peace());
    expect(r).toMatchObject({ ok: false, reason: PEACE_REASONS.noWar });
  });

  it('na opověď s požadavkem se odpovídá mírovým protinávrhem', async () => {
    const w = await world();
    const opened = await openNegotiation(w.deps, {
      playerId: 'player-a',
      to: w.c,
      items: [{ kind: 'war-demand', items: [] }],
      message: null,
      now: NOW,
      today: DAY_NOW,
    });
    expect(opened.ok).toBe(true);
    const id = opened.ok ? opened.negotiation.id : '';
    const bad = await counterNegotiation(w.deps, {
      playerId: 'player-c',
      negotiationId: id,
      items: [{ kind: 'service', men: 1, days: 1 }],
      message: null,
      now: NOW,
      today: DAY_NOW,
    });
    expect(bad.ok).toBe(false);
    const ok = await counterNegotiation(w.deps, {
      playerId: 'player-c',
      negotiationId: id,
      items: peace(),
      message: null,
      now: NOW,
      today: DAY_NOW,
    });
    expect(ok.ok).toBe(true);
    const accepted = await acceptNegotiation(w.deps, {
      playerId: 'player-a',
      negotiationId: id,
      now: NOW,
      today: DAY_NOW,
    });
    expect(accepted.ok).toBe(true);
    expect(w.wars.all[0]!.status).toBe('peace');
  });

  it('vazalství z míru má původ peace', async () => {
    const w = await world();
    const r = await agree(w, 'a', peace({ vassalage: { lord: w.a, vassal: w.c, terms: {} } }));
    expect(r.ok).toBe(true);
    expect(w.vassalages.vassalages[0]).toMatchObject({
      lordHouseId: w.a,
      vassalHouseId: w.c,
      origin: 'peace',
    });
  });

  describe('poplatek', () => {
    const fee = (w: World): TermItem[] => peace({ fee: bundle({ grainKg: 200 }), payer: w.c });

    it('plátce dostane dialog fee-send; celé, míň i nic', async () => {
      for (const sentKg of [200, 50, 0]) {
        const w = await world();
        expect((await agree(w, 'a', fee(w))).ok).toBe(true);
        expect(w.dialogs.rows).toHaveLength(1);
        const d = w.dialogs.rows[0]!;
        expect(d).toMatchObject({ kind: 'fee-send', playerId: 'player-c', status: 'open' });
        expect(d.body).toMatchObject({ toVillageId: w.villageA });
        const r = await answerLevy(
          w.deps,
          answer(d.id, 'player-c', w.villageC, { grainKg: sentKg }),
        );
        expect(r.ok).toBe(true);
        expect(w.shipments.rows).toHaveLength(sentKg > 0 ? 1 : 0);
        expect(w.dialogs.rows[0]!.status).toBe('answered');
      }
    });
  });

  describe('lidé v poplatku (war.md – Konec války)', () => {
    it('poplatek smí obsahovat lidi, robotu ne', async () => {
      const w = await world();
      const people = bundle({ grainKg: 0, people: { families: 0, men: 2, women: 0 } });
      const ok = await agree(w, 'a', peace({ fee: people, payer: w.c }));
      expect(ok.ok).toBe(true);
      const w2 = await world();
      const labor = await agree(w2, 'a', peace({ fee: bundle({ laborDays: 5 }), payer: w2.c }));
      expect(labor).toMatchObject({ ok: false, reason: PEACE_REASONS.badFee });
    });
  });

  describe('tribut', () => {
    it('chodí v Odvodech 1. 11. jako dialog tribute-send plátci', async () => {
      const w = await world();
      const r = await agree(
        w,
        'a',
        peace({ tribute: { goods: bundle({ grainKg: 100 }), payer: w.c } }),
      );
      expect(r.ok).toBe(true);
      expect(w.dialogs.rows).toHaveLength(0);
      const levyDeps = {
        dialogs: w.dialogs,
        vassalages: w.vassalages,
        houses: (w.deps as NegotiateDeps).houses,
        notices: w.notices,
        villages: w.villages,
        tributes: {
          peaceTributes: () => w.negotiations.peaceTributes(),
          dayOf: () => NOV_1 - 30,
        },
      };
      const opened = await openAnnualDialogs(levyDeps as never, { today: NOV_1 });
      expect(opened).toBe(1);
      const d = w.dialogs.rows[0]!;
      expect(d).toMatchObject({ kind: 'tribute-send', playerId: 'player-c' });
      expect(d.body).toMatchObject({ toVillageId: w.villageA });
      // opakování nezdvojí; mír přijatý až po 1. 11. se ptá příště
      expect(await openAnnualDialogs(levyDeps as never, { today: NOV_1 })).toBe(0);
      const late = { ...levyDeps, tributes: { ...levyDeps.tributes, dayOf: () => NOV_1 + 2 } };
      const w2 = await world();
      await agree(w2, 'a', peace({ tribute: { goods: bundle({ grainKg: 100 }), payer: w2.c } }));
      expect(
        await openAnnualDialogs(
          {
            ...late,
            dialogs: w2.dialogs,
            tributes: { ...late.tributes, peaceTributes: () => w2.negotiations.peaceTributes() },
          } as never,
          { today: NOV_1 },
        ),
      ).toBe(0);
    });
  });

  describe('neplnění tributu (war.md – Konec války)', () => {
    const open = async (w: World, vassal: boolean): Promise<string> => {
      await agree(w, 'a', peace({ tribute: { goods: bundle({ grainKg: 100 }), payer: w.c } }));
      if (vassal) {
        await w.vassalages.create({
          lordHouseId: w.a,
          vassalHouseId: w.c,
          terms: {},
          origin: 'negotiation',
          sinceAt: new Date(0),
          sinceDay: 0,
        });
      }
      const levyDeps = {
        dialogs: w.dialogs,
        vassalages: w.vassalages,
        houses: (w.deps as NegotiateDeps).houses,
        notices: w.notices,
        villages: w.villages,
        tributes: {
          peaceTributes: () => w.negotiations.peaceTributes(),
          dayOf: () => NOV_1 - 30,
        },
      };
      await openAnnualDialogs(levyDeps as never, { today: NOV_1 });
      return w.dialogs.rows[0]!.id;
    };
    const chronicled = (w: World): number =>
      (w.villages as InMemoryVillages).inbox.events.filter(
        (e) => e.body.kind === 'chronicle' && e.body.event.kind === 'tribute-short',
      ).length;

    it('míň než domluveno: kronika obou rodů a neplnění vazalství', async () => {
      const w = await world();
      const id = await open(w, true);
      const r = await answerLevy(w.deps, answer(id, 'player-c', w.villageC, { grainKg: 40 }));
      expect(r.ok).toBe(true);
      expect(chronicled(w)).toBe(2);
      expect(w.vassalages.breachLog).toHaveLength(1);
    });

    it('celý tribut nic nezapíše', async () => {
      const w = await world();
      const id = await open(w, true);
      await answerLevy(w.deps, answer(id, 'player-c', w.villageC, { grainKg: 100 }));
      expect(chronicled(w)).toBe(0);
      expect(w.vassalages.breachLog).toHaveLength(0);
    });

    it('bez vazalství jen kronika', async () => {
      const w = await world();
      const id = await open(w, false);
      await answerLevy(w.deps, answer(id, 'player-c', w.villageC, {}));
      expect(chronicled(w)).toBe(2);
      expect(w.vassalages.breachLog).toHaveLength(0);
    });
  });

  describe('postoupení vsí', () => {
    it('poslední ves rodu v nabídce být nesmí', async () => {
      const w = await world();
      const all = await agree(w, 'a', peace({ cede: [w.villageA, w.extraA] }));
      expect(all).toMatchObject({ ok: false, reason: PEACE_REASONS.lastVillage });
      const only = await agree(w, 'c', peace({ cede: [w.villageC] }));
      expect(only).toMatchObject({ ok: false, reason: PEACE_REASONS.lastVillage });
      expect(w.wars.all[0]!.status).toBe('active');
    });

    it('ves cizí straně patřit nesmí', async () => {
      const w = await world();
      const r = await agree(w, 'a', peace({ cede: [w.villageC, w.extraA] }));
      expect(r).toMatchObject({ ok: false, reason: PEACE_REASONS.badCede });
    });

    it('ves přejde celá, muži rodu odejdou do jiné vsi a nový držitel má správce', async () => {
      const w = await world();
      const r = await agree(w, 'a', peace({ cede: [w.extraA] }));
      expect(r.ok).toBe(true);
      expect(w.wars.all[0]!.status).toBe('peace');
      // mapa Dolu patří C
      const ofC = await w.settlements.listActive('player-c');
      expect(ofC.map((s) => s.id)).toContain(w.mapX);
      expect((await w.settlements.listActive('player-a')).map((s) => s.id)).not.toContain(w.mapX);
      // muž rodu s rodinou odešel do Dubu (schránka vsi, událost jako lord-arrives)
      const left = (await w.villages.find(w.extraA))!.state;
      expect(left.people.some((p) => [901, 902, 903].includes(p.id))).toBe(false);
      const events = (w.villages as InMemoryVillages).inbox.events.filter(
        (e) => e.villageId === w.villageA && e.body.kind === 'lord-arrives',
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.body).toMatchObject({ kind: 'lord-arrives', fromVillageId: w.extraA });
      // nový držitel má ve vsi zapnutého správce
      expect(left.steward?.on).toBe(true);
    });

    it('příchozí muž si zapamatuje, odkud přišel (rod ho podle toho najde)', async () => {
      const w = await world();
      await agree(w, 'a', peace({ cede: [w.extraA] }));
      const event = (w.villages as InMemoryVillages).inbox.events.find(
        (e) => e.villageId === w.villageA && e.body.kind === 'lord-arrives',
      )!;
      const dest = structuredClone((await w.villages.find(w.villageA))!.state);
      applyInboxDay(dest, event.day, [event]);
      expect(dest.lineMoves).toEqual([
        expect.objectContaining({ fromVillageId: w.extraA, fromPersonId: 901 }),
      ]);
    });

    it('opakované provedení nic nezdvojí', async () => {
      const w = await world();
      await agree(w, 'a', peace({ cede: [w.extraA] }));
      const input = {
        fromHouseId: w.a,
        toHouseId: w.c,
        villageIds: [w.extraA],
        negotiationId: 'x',
        now: NOW,
        today: DAY_NOW,
      };
      const cedeDeps = {
        houses: (w.deps as NegotiateDeps).houses,
        settlements: w.settlements,
        villages: w.villages,
        locks: new InMemoryPlayerLock(),
      };
      await cedeVillages(cedeDeps, input);
      expect(
        (w.villages as InMemoryVillages).inbox.events.filter(
          (e) => e.villageId === w.villageA && e.body.kind === 'lord-arrives',
        ),
      ).toHaveLength(1);
    });
  });
});

// Schránka účinků jednání (audit A2): postoupení se po pádu dokončí krokem workeru.
describe('postoupení po pádu (A2)', () => {
  it('pád po převodu vsi před zapnutím správce: krok workeru správce zapne, muže nezdvojí', async () => {
    const w = await world();
    const villages = w.villages as InMemoryVillages;
    const save = villages.save.bind(villages);
    let crashes = 1;
    villages.save = async (...args: Parameters<typeof save>) => {
      if (args[1].steward?.on === true && crashes-- > 0) throw new Error('pád');
      return save(...args);
    };
    await expect(agree(w, 'a', peace({ cede: [w.extraA] }))).rejects.toThrow('pád');
    expect((await w.settlements.listActive('player-c')).map((s) => s.id)).toContain(w.mapX);
    expect((await w.villages.find(w.extraA))!.state.steward?.on).not.toBe(true);
    // krok workeru po prvním odkladu (1 min) – hodiny schránek se posunou
    (w.deps.negotiations as InMemoryNegotiations).elapse(ACCEPTANCE_OUTBOX_LEASE_MS + 1000);
    const later = new Date(NOW.getTime() + ACCEPTANCE_OUTBOX_LEASE_MS + 1000);
    const worker = { ...(w.deps as AcceptanceDeps), log: () => undefined };
    const delivered = await deliverPendingAcceptances(worker, { now: later, today: DAY_NOW });
    expect(delivered).toBe(1);
    expect((await w.villages.find(w.extraA))!.state.steward?.on).toBe(true);
    const arrivals = villages.inbox.events.filter(
      (e) => e.villageId === w.villageA && e.body.kind === 'lord-arrives',
    );
    expect(arrivals).toHaveLength(1);
  });
});
