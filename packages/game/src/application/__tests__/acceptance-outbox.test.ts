import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { TermItem } from '../../domain/negotiation';
import { DAY, bundle, receiver, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import type { MacroGoods } from '../../domain/vassalage';
import { noMacroGoods } from '../../domain/vassalage';
import type { VillageState } from '../../domain/village';
import {
  ACCEPTANCE_OUTBOX_GRACE_MS,
  acceptNegotiation,
  counterNegotiation,
  deliverPendingAcceptances,
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

// Schránka účinků přijatého jednání (audit A2): pád po commitu přijetí – účinky dokončí krok
// workeru (`deliverPendingAcceptances`) právě jednou. Scénář: půjčka pána vazalovi (zásilka
// z pánovy vsi a kronika obou rodů po transakci).

const LORD = 'hrac-pan';
const VASSAL = 'hrac-vazal';
const NOW = new Date('2026-11-05T12:00:00Z');
/** Okamžik kroku workeru po uplynutí lhůty, kdy schránku ještě smí dokončit web. */
const LATER = new Date(NOW.getTime() + ACCEPTANCE_OUTBOX_GRACE_MS + 1000);
const FAR = new Date(8.64e15);

function named(state: VillageState, name: string): VillageState {
  state.people.push({ id: 900, name, bornDay: DAY - 15_000, dwellingId: 500, sex: 'male' });
  return state;
}

const goods = (over: Partial<MacroGoods>): MacroGoods => ({ ...noMacroGoods(), ...over });

/** Pády: kolikrát ještě hodí výjimku dopočet vsi pomoci a čtení jména rodu pro kroniku. */
interface Crash {
  prepare: number;
  /** Jméno rodu pro kroniku – až když zásilka existuje (pád po prvním účinku). */
  chronicle: number;
}

async function world(): Promise<{
  deps: NegotiateDeps;
  negotiations: InMemoryNegotiations;
  loans: InMemoryLoans;
  shipments: InMemoryShipments;
  villages: InMemoryVillages;
  crash: Crash;
  gate: { wait: Promise<void> | null; entered: boolean };
  ids: { lord: string; vassal: string };
  v: { lord: string; vassal: string };
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
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
  const lordVillage = await villages.add(a.id, 'Dub', named(sender(), 'Bořivoj'));
  const vassalVillage = await villages.add(b.id, 'Lhota', named(receiver(), 'Ctibor'));
  const lord = await houses.create({ playerId: LORD, kind: 'player', createdAt: NOW });
  await houses.setLord(lord.id, { villageId: lordVillage.id, personId: 900 });
  const vassal = await houses.create({ playerId: VASSAL, kind: 'player', createdAt: NOW });
  await houses.setLord(vassal.id, { villageId: vassalVillage.id, personId: 900 });
  await vassalages.create({
    lordHouseId: lord.id,
    vassalHouseId: vassal.id,
    terms: { tribute: bundle({ grainKg: 50 }) },
    origin: 'negotiation',
    sinceAt: NOW,
    sinceDay: DAY - 50,
  });
  const ownedBy: Record<string, string[]> = {
    [lord.id]: [lordVillage.id],
    [vassal.id]: [vassalVillage.id],
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
  const crash: Crash = { prepare: 0, chronicle: 0 };
  const gate: { wait: Promise<void> | null; entered: boolean } = { wait: null, entered: false };
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
    // kronika čte jméno rodu přes `find` – pád po odeslání pomoci
    villages: {
      inbox: villages.inbox,
      find: async (id: string) => {
        if (crash.chronicle > 0 && shipments.rows.length > 0) {
          crash.chronicle--;
          throw new Error('pád po prvním účinku');
        }
        return villages.find(id);
      },
    },
    worldDirectory,
    dialogs: new InMemoryDialogs(),
    aid: {
      shipments: shipmentDeps,
      prepareVillage: async () => {
        gate.entered = true;
        if (gate.wait) await gate.wait;
        if (crash.prepare > 0) {
          crash.prepare--;
          throw new Error('pád v prvním účinku');
        }
        return null;
      },
      loans,
    },
  } as unknown as NegotiateDeps;
  return {
    deps,
    negotiations,
    loans,
    shipments,
    villages,
    crash,
    gate,
    ids: { lord: lord.id, vassal: vassal.id },
    v: { lord: lordVillage.id, vassal: vassalVillage.id },
  };
}

type W = Awaited<ReturnType<typeof world>>;

const loanItem = (w: W, grainKg = 200): TermItem => ({
  kind: 'loan',
  bundle: bundle({ grainKg }),
  fromVillageId: w.v.lord,
  toVillageId: w.v.vassal,
  schedule: [{ year: 601, goods: goods({ grainKg: 100 }) }],
});

/** Vazal požádá o obilí, pán odpoví půjčkou; vrací id jednání. */
async function request(w: W, answer: TermItem): Promise<string> {
  const opened = await openNegotiation(w.deps, {
    playerId: VASSAL,
    to: w.ids.lord,
    items: [{ kind: 'aid-request', bundle: bundle({ grainKg: 200 }), villageId: w.v.vassal }],
    message: null,
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

const step = (w: W, now = LATER): Promise<number> =>
  deliverPendingAcceptances(w.deps, { now, today: DAY + 1 });

const pending = (w: W): Promise<string[]> => w.negotiations.pendingOutboxes(FAR, 100);

const stores = async (w: W): Promise<number> => (await w.villages.find(w.v.lord))!.state.storesKg;

/** Záznamy kroniky přijetí půjčky v obou vsích (`neg:<jednání>:<kola>:aid-loan:<ves>`). */
const chronicle = (w: W): number =>
  w.villages.inbox.events.filter(
    (e) =>
      e.body.kind === 'chronicle' &&
      e.body.event.kind === 'negotiation' &&
      e.body.event.step === 'aid-loan',
  ).length;

describe('schránka účinků přijatého jednání (A2)', () => {
  it('bez pádu web účinky provede a schránku smaže', async () => {
    const w = await world();
    const id = await request(w, loanItem(w));
    expect((await accept(w, id)).ok).toBe(true);
    expect(w.shipments.rows).toHaveLength(1);
    expect(chronicle(w)).toBe(2);
    expect(await pending(w)).toEqual([]);
  });

  it('pád v prvním účinku: jednání platí, krok workeru po lhůtě pošle pomoc a kroniku jednou', async () => {
    const w = await world();
    const before = await stores(w);
    const id = await request(w, loanItem(w));
    w.crash.prepare = 1;
    await expect(accept(w, id)).rejects.toThrow('pád v prvním účinku');
    expect(w.negotiations.records.find((r) => r.id === id)?.status).toBe('accepted');
    expect(w.shipments.rows).toHaveLength(0);
    expect(await pending(w)).toEqual([id]);
    // ve lhůtě schránku dokončuje web – worker ji nechá být
    expect(await step(w, NOW)).toBe(0);
    expect(w.shipments.rows).toHaveLength(0);
    expect(await step(w)).toBe(1);
    expect(w.shipments.rows).toHaveLength(1);
    expect(before - (await stores(w))).toBe(200);
    expect(w.loans.loans).toHaveLength(1);
    expect(w.loans.loans[0]!.status).toBe('active');
    expect(chronicle(w)).toBe(2);
    expect(await pending(w)).toEqual([]);
    // další krok už nic nemá
    expect(await step(w)).toBe(0);
    expect(w.shipments.rows).toHaveLength(1);
  });

  it('pád po prvním účinku (pomoc odešla, kronika ne): krok workeru nic nezdvojí', async () => {
    const w = await world();
    const before = await stores(w);
    const id = await request(w, loanItem(w));
    w.crash.chronicle = 1;
    await expect(accept(w, id)).rejects.toThrow('pád po prvním účinku');
    expect(w.shipments.rows).toHaveLength(1);
    expect(chronicle(w)).toBe(0);
    expect(await step(w)).toBe(1);
    expect(w.shipments.rows).toHaveLength(1);
    expect(before - (await stores(w))).toBe(200);
    expect(w.loans.loans).toHaveLength(1);
    expect(chronicle(w)).toBe(2);
    expect(await pending(w)).toEqual([]);
  });

  it('pád po všech účincích před smazáním schránky: opakované doručení nic nezdvojí', async () => {
    const w = await world();
    const before = await stores(w);
    const id = await request(w, loanItem(w));
    w.negotiations.failNextOutboxDelete = true;
    await expect(accept(w, id)).rejects.toThrow();
    expect(w.shipments.rows).toHaveLength(1);
    expect(chronicle(w)).toBe(2);
    expect(await pending(w)).toEqual([id]);
    expect(await step(w)).toBe(1);
    expect(w.shipments.rows).toHaveLength(1);
    expect(before - (await stores(w))).toBe(200);
    expect(w.loans.loans).toHaveLength(1);
    expect(chronicle(w)).toBe(2);
    expect(await pending(w)).toEqual([]);
  });

  it('selhání pomoci jako dnes: důvod hráči, půjčka zrušená, schránka uzavřená, worker nic neopakuje', async () => {
    const w = await world();
    const id = await request(w, loanItem(w, 9_000_000));
    const done = await accept(w, id);
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.reason).toMatch(/^Zboží se nepodařilo poslat/);
    expect(w.loans.loans[0]!.status).toBe('cancelled');
    expect(chronicle(w)).toBe(0);
    expect(await pending(w)).toEqual([]);
    expect(await step(w)).toBe(0);
    expect(w.shipments.rows).toHaveLength(0);
  });

  it('selhání pomoci při dokončení workerem: schránka se uzavře a neopakuje', async () => {
    const w = await world();
    const id = await request(w, loanItem(w, 9_000_000));
    w.crash.prepare = 1;
    await expect(accept(w, id)).rejects.toThrow();
    expect(await step(w)).toBe(1);
    expect(w.loans.loans[0]!.status).toBe('cancelled');
    expect(await pending(w)).toEqual([]);
    expect(await step(w)).toBe(0);
  });

  it('web a worker nad stejnou schránkou: účinky jednou', async () => {
    const w = await world();
    const id = await request(w, loanItem(w));
    let release: () => void = () => undefined;
    w.gate.wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const web = accept(w, id);
    // web drží schránku (čeká v dopočtu vsi) – worker ji přeskočí, i když je po lhůtě
    while (!w.gate.entered) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await pending(w)).toEqual([id]);
    expect(await step(w, FAR)).toBe(0);
    release();
    expect((await web).ok).toBe(true);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.loans.loans).toHaveLength(1);
    expect(chronicle(w)).toBe(2);
    expect(await step(w, FAR)).toBe(0);
  });
});
