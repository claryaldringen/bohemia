import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { TermItem } from '../../domain/negotiation';
import { DAY, bundle, receiver, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import type { MacroGoods } from '../../domain/vassalage';
import { noMacroGoods } from '../../domain/vassalage';
import type { VillageState } from '../../domain/village';
import { answerLevy, levyDialogs, openAnnualDialogs, type LevyDeps } from '../annual-levies';
import { onHouseEnded } from '../loan-house-ended';
import {
  acceptNegotiation,
  counterNegotiation,
  openNegotiation,
  type NegotiateDeps,
} from '../negotiate';
import type { DirectoryEntry } from '../world-directory';
import { InMemoryDialogs } from './in-memory-dialogs';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryLoans } from './in-memory-loans';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Pomoc na žádost, dar a půjčka (vassalage.md – Pomoc na žádost; plán – Úloha 4.6).

const LORD = 'hrac-pan';
const VASSAL = 'hrac-vazal';
const NOW = new Date('2026-11-05T12:00:00Z');
const NOV_1 = dayIndexOf({ year: 601, month: 11, day: 1 });

function named(state: VillageState, name: string): VillageState {
  state.people.push({ id: 900, name, bornDay: DAY - 15_000, dwellingId: 500, sex: 'male' });
  return state;
}

const goods = (over: Partial<MacroGoods>): MacroGoods => ({ ...noMacroGoods(), ...over });

async function world(): Promise<{
  deps: NegotiateDeps & LevyDeps;
  loans: InMemoryLoans;
  vassalages: InMemoryVassalages;
  shipments: InMemoryShipments;
  villages: InMemoryVillages;
  dialogs: InMemoryDialogs;
  ids: { lord: string; vassal: string };
  v: { lord: string; vassalIn: string; vassalOut: string };
  vassalageId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
  const dialogs = new InMemoryDialogs();
  const houses = new InMemoryHouses();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const loans = new InMemoryLoans();
  const negotiations = new InMemoryNegotiations(vassalages, notices, () => NOW, loans);
  const a = await settlements.seatAtOrigin({
    ownerId: LORD,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const b = (await settlements.create({
    ownerId: VASSAL,
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 3, y: 1 },
  }))!;
  // druhá ves vazala má vlastní sídlo (jedna ves, jedna mapa); patří témuž hráči
  const c = (await settlements.create({
    ownerId: VASSAL,
    landscapeSeed: 13,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 3 },
  }))!;
  const lordVillage = await villages.add(a.id, 'Dub', named(sender(), 'Bořivoj'));
  const vassalIn = await villages.add(b.id, 'Lhota', named(receiver(), 'Ctibor'));
  const vassalOut = await villages.add(c.id, 'Dvůr', named(sender(), 'Ctibor'));
  const lord = await houses.create({ playerId: LORD, kind: 'player', createdAt: NOW });
  await houses.setLord(lord.id, { villageId: lordVillage.id, personId: 900 });
  const vassal = await houses.create({ playerId: VASSAL, kind: 'player', createdAt: NOW });
  await houses.setLord(vassal.id, { villageId: vassalIn.id, personId: 900 });
  const v = await vassalages.create({
    lordHouseId: lord.id,
    vassalHouseId: vassal.id,
    terms: { tribute: bundle({ grainKg: 50 }) },
    origin: 'negotiation',
    sinceAt: NOW,
    sinceDay: DAY - 50,
  });
  const owners: Record<string, string> = {
    [lord.id]: lordVillage.id,
    [vassal.id]: vassalIn.id,
  };
  const ownedBy: Record<string, string[]> = {
    [lord.id]: [lordVillage.id],
    [vassal.id]: [vassalIn.id, vassalOut.id],
  };
  const worldDirectory: NegotiateDeps['worldDirectory'] = {
    entriesOf: async (ids) =>
      Promise.all(
        ids.map(async (id) => ({
          house: (await houses.byId(id))!,
          seat: { x: 0, y: 0 },
          digests: (ownedBy[id] ?? []).map((x) => ({ id: x })),
        })),
      ) as unknown as Promise<DirectoryEntry[]>,
  };
  void owners;
  const shipmentDeps = {
    shipments,
    villages,
    settlements,
    locks: new InMemoryPlayerLock(),
    now: () => new Date(0),
  };
  const deps = {
    houses,
    negotiations,
    villages,
    worldDirectory,
    aid: { shipments: shipmentDeps, prepareVillage: () => Promise.resolve(null), loans },
    dialogs,
    vassalages,
    notices,
    loans,
    shipments: shipmentDeps,
    prepareVillage: () => Promise.resolve(null),
  } as unknown as NegotiateDeps & LevyDeps;
  return {
    deps,
    loans,
    vassalages,
    shipments,
    villages,
    dialogs,
    ids: { lord: lord.id, vassal: vassal.id },
    v: { lord: lordVillage.id, vassalIn: vassalIn.id, vassalOut: vassalOut.id },
    vassalageId: v.id,
  };
}

type W = Awaited<ReturnType<typeof world>>;

const loanItem = (w: W, over: Partial<Extract<TermItem, { kind: 'loan' }>> = {}): TermItem => ({
  kind: 'loan',
  bundle: bundle({ grainKg: 200 }),
  fromVillageId: w.v.lord,
  toVillageId: w.v.vassalIn,
  schedule: [
    { year: 601, goods: goods({ grainKg: 100 }) },
    { year: 602, goods: goods({ hayKg: 400 }) },
  ],
  ...over,
});

/** B požádá A o obilí, A odpoví protinávrhem `answer`; vrací id jednání. */
async function request(w: W, answer: TermItem): Promise<string> {
  const opened = await openNegotiation(w.deps, {
    playerId: VASSAL,
    to: w.ids.lord,
    items: [{ kind: 'aid-request', bundle: bundle({ grainKg: 200 }), villageId: w.v.vassalIn }],
    message: 'Neúroda',
    now: NOW,
    today: DAY,
  });
  if (!opened.ok) throw new Error(opened.reason);
  const countered = await counterNegotiation(w.deps, {
    playerId: LORD,
    negotiationId: opened.negotiation.id,
    items: [answer],
    message: null,
    now: NOW,
    today: DAY,
  });
  if (!countered.ok) throw new Error(countered.reason);
  return opened.negotiation.id;
}

const accept = (w: W, id: string): ReturnType<typeof acceptNegotiation> =>
  acceptNegotiation(w.deps, { playerId: VASSAL, negotiationId: id, now: NOW, today: DAY });

describe('žádost o pomoc a půjčka', () => {
  it('žádost přijmout nejde, jednání o pomoci musí začít žádostí vazala', async () => {
    const w = await world();
    const bad = await openNegotiation(w.deps, {
      playerId: LORD,
      to: w.ids.vassal,
      items: [loanItem(w)],
      message: null,
      now: NOW,
      today: DAY,
    });
    expect(bad.ok).toBe(false);
    const opened = await openNegotiation(w.deps, {
      playerId: VASSAL,
      to: w.ids.lord,
      items: [{ kind: 'aid-request', bundle: bundle({ grainKg: 5 }), villageId: w.v.vassalIn }],
      message: null,
      now: NOW,
      today: DAY,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const early = await acceptNegotiation(w.deps, {
      playerId: LORD,
      negotiationId: opened.negotiation.id,
      now: NOW,
      today: DAY,
    });
    expect(early.ok).toBe(false);
    expect(w.loans.loans).toHaveLength(0);
  });

  it('přijetí půjčky: jedna půjčka, zásilka z věřitelovy vsi, podmínky vazalství beze změny', async () => {
    const w = await world();
    const before = (await w.villages.find(w.v.lord))!.state.storesKg;
    const id = await request(w, loanItem(w));
    const done = await accept(w, id);
    expect(done.ok).toBe(true);
    expect(w.loans.loans).toHaveLength(1);
    expect(w.loans.loans[0]).toMatchObject({
      creditorHouseId: w.ids.lord,
      debtorHouseId: w.ids.vassal,
      debtorVillageId: w.v.vassalIn,
      status: 'active',
    });
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.shipments.rows[0]).toMatchObject({
      fromVillageId: w.v.lord,
      toVillageId: w.v.vassalIn,
    });
    // bilance: zboží odešlo z věřitelovy vsi (a nikde nezmizelo – je v zásilce)
    const after = (await w.villages.find(w.v.lord))!.state.storesKg;
    expect(before - after).toBe(200);
    expect(w.vassalages.vassalages[0]!.terms.tribute?.grainKg).toBe(50);
  });

  it('dvojí přijetí: jedna půjčka, jedna zásilka', async () => {
    const w = await world();
    const id = await request(w, loanItem(w));
    const [x, y] = await Promise.all([accept(w, id), accept(w, id)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(w.loans.loans).toHaveLength(1);
    expect(w.shipments.rows).toHaveLength(1);
  });

  it('dar dorazí zásilkou a půjčku nezaloží', async () => {
    const w = await world();
    const id = await request(w, {
      kind: 'gift',
      bundle: bundle({ grainKg: 120 }),
      fromVillageId: w.v.lord,
      toVillageId: w.v.vassalIn,
    });
    expect((await accept(w, id)).ok).toBe(true);
    expect(w.loans.loans).toHaveLength(0);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.shipments.rows[0]!.body).toBeDefined();
  });

  it('zboží, které nejde poslat, půjčku zruší', async () => {
    const w = await world();
    const id = await request(w, loanItem(w, { bundle: bundle({ grainKg: 9_000_000 }) }));
    const done = await accept(w, id);
    expect(done.ok).toBe(false);
    expect(w.loans.loans[0]!.status).toBe('cancelled');
  });

  it('ves musí patřit tomu, kdo ji uvádí', async () => {
    const w = await world();
    const opened = await openNegotiation(w.deps, {
      playerId: VASSAL,
      to: w.ids.lord,
      items: [{ kind: 'aid-request', bundle: bundle({ grainKg: 5 }), villageId: w.v.lord }],
      message: null,
      now: NOW,
      today: DAY,
    });
    expect(opened.ok).toBe(false);
  });
});

/** Řádek splátky mezi dialogy Odvody (dávka vazalství, je-li, je vedle něj). */
async function repayView(
  w: W,
): Promise<Awaited<ReturnType<typeof levyDialogs>>[number] | undefined> {
  return (await levyDialogs(w.deps, { playerId: VASSAL })).find((d) => d.kind === 'repay');
}

describe('splátky půjčky v Odvodech', () => {
  async function loaned(): Promise<W> {
    const w = await world();
    expect((await accept(w, await request(w, loanItem(w)))).ok).toBe(true);
    return w;
  }

  it('půjčka trvá po vypovězení vazalství a splátka přijde v Odvodech jako řádek', async () => {
    const w = await loaned();
    await w.vassalages.end(w.vassalageId, 'renounced', NOW);
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 })).toBe(1);
    const view = await repayView(w);
    expect(view).toMatchObject({ kind: 'repay', owedKg: 100, lordName: 'Bořivoj' });
    expect(view!.agreed.grainKg).toBe(100);
    // stejný rok podruhé nic nezdvojí
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 + 2 })).toBe(0);
  });

  it('splátka jiným zbožím platí podle hodnoty (400 kg sena = 100 kg obilí)', async () => {
    const w = await loaned();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const view = await repayView(w);
    const result = await answerLevy(w.deps, {
      playerId: VASSAL,
      dialogId: view!.dialogId,
      lines: [{ good: 'hayKg', amount: 400 }],
      split: { [w.v.vassalOut]: bundle({ hayKg: 400 }) },
      message: 'Seno místo obilí',
      today: NOV_1,
    });
    expect(result.ok).toBe(true);
    expect(w.loans.loans[0]!.paidKg).toBe(100);
    expect(w.loans.loans[0]!.breaches).toBe(0);
    expect(w.vassalages.breachLog).toHaveLength(0);
    // zásilka směřuje do věřitelovy vsi
    expect(w.shipments.rows.at(-1)).toMatchObject({ toVillageId: w.v.lord });
  });

  it('míň než dluh je neplnění (půjčka i trvající vazalství)', async () => {
    const w = await loaned();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const view = await repayView(w);
    await answerLevy(w.deps, {
      playerId: VASSAL,
      dialogId: view!.dialogId,
      lines: [{ good: 'grainKg', amount: 40 }],
      split: { [w.v.vassalOut]: bundle({ grainKg: 40 }) },
      message: null,
      today: NOV_1,
    });
    expect(w.loans.loans[0]).toMatchObject({ paidKg: 40, breaches: 1, status: 'active' });
    expect(w.vassalages.breachLog).toEqual([{ id: w.vassalageId, kind: 'repay', day: NOV_1 }]);
  });

  it('bez odpovědi do dalšího 1. 11. se zapíše neplnění a dialog naroste', async () => {
    const w = await loaned();
    await w.vassalages.end(w.vassalageId, 'renounced', NOW);
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    await openAnnualDialogs(w.deps, { today: dayIndexOf({ year: 602, month: 11, day: 1 }) });
    expect(w.loans.loans[0]!.breaches).toBe(1);
    // vazalství skončilo – zapsáno jen v půjčce
    expect(w.vassalages.breachLog).toHaveLength(0);
    const view = await repayView(w);
    expect(view).toMatchObject({ years: 2, owedKg: 200 });
  });

  it('plné splacení půjčku uzavře', async () => {
    const w = await loaned();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const view = await repayView(w);
    await answerLevy(w.deps, {
      playerId: VASSAL,
      dialogId: view!.dialogId,
      lines: [{ good: 'grainKg', amount: 200 }],
      split: { [w.v.vassalOut]: bundle({ grainKg: 200 }) },
      message: null,
      today: NOV_1,
    });
    expect(w.loans.loans[0]!.status).toBe('repaid');
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 + 400 })).toBe(0);
  });

  it('vymření dlužníka bez pána dluh zruší; s pánem ho nechá', async () => {
    const w = await loaned();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    // vazalství trvá → dluh zůstává (řeší nástupnictví, úloha 4.10)
    expect(
      await onHouseEnded(
        { loans: w.loans, vassalages: w.vassalages, dialogs: w.dialogs },
        w.ids.vassal,
        NOW,
      ),
    ).toBe(0);
    expect(w.loans.loans[0]!.status).toBe('active');
    await w.vassalages.end(w.vassalageId, 'renounced', NOW);
    expect(
      await onHouseEnded(
        { loans: w.loans, vassalages: w.vassalages, dialogs: w.dialogs },
        w.ids.vassal,
        NOW,
      ),
    ).toBe(1);
    expect(w.loans.loans[0]!.status).toBe('cancelled');
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 + 400 })).toBe(0);
  });
});
