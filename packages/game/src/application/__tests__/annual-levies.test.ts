import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { dayIndexOf } from '../../domain/calendar';
import { DAY, bundle, receiver, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import type { VillageState } from '../../domain/village';
import {
  answerAbsentLevies,
  answerLevy,
  DIALOG_CLOSED,
  LEVY_BAD_ANSWER,
  LEVY_NOT_YOUR_VILLAGE,
  levyDialogs,
  openAnnualDialogs,
  type LevyDeps,
} from '../annual-levies';
import { renounceVassalage } from '../renounce';
import { sendCorvee } from '../shipments';
import { ABSENT_VASSAL, dispatchCorvee, type MacroBundle } from '../../domain/vassalage';
import { InMemoryDialogs } from './in-memory-dialogs';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';

// Roční Odvody 1. 11. (vassalage.md – Roční dialog; plán – Úloha 4.4).

const VASSAL = 'hrac-vazal';
const LORD = 'hrac-pan';
const OTHER = 'hrac-cizi';
const NOV_1 = dayIndexOf({ year: 503, month: 11, day: 1 });
const NOV_1_NEXT = dayIndexOf({ year: 504, month: 11, day: 1 });
const NOW = new Date('2026-11-05T12:00:00Z');

/** Vesnici s jmenovanou hlavou rodu (jméno se bere ze stavu vsi). */
function named(state: VillageState, name: string): VillageState {
  state.people.push({ id: 900, name, bornDay: DAY - 15_000, dwellingId: 500, sex: 'male' });
  return state;
}

async function world(): Promise<{
  deps: LevyDeps;
  dialogs: InMemoryDialogs;
  vassalages: InMemoryVassalages;
  notices: InMemoryNotices;
  villages: InMemoryVillages;
  shipments: InMemoryShipments;
  houses: InMemoryHouses;
  vassalageId: string;
  vassalVillage: string;
  strangerVillage: string;
  lordVillage: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const shipments = new InMemoryShipments();
  const dialogs = new InMemoryDialogs();
  const houses = new InMemoryHouses();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const a = await settlements.seatAtOrigin({
    ownerId: VASSAL,
    landscapeSeed: 11,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const b = (await settlements.create({
    ownerId: LORD,
    landscapeSeed: 12,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 3, y: 1 },
  }))!;
  const c = (await settlements.create({
    ownerId: OTHER,
    landscapeSeed: 13,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: { x: 0, y: 3 },
  }))!;
  const from = await villages.add(a.id, 'Dub', named(sender(), 'Ctibor'));
  const to = await villages.add(b.id, 'Lhota', named(receiver(), 'Bořivoj'));
  const stranger = await villages.add(c.id, 'Cizí', named(sender(), 'Cizinec'));
  const vassalHouse = await houses.create({ playerId: VASSAL, kind: 'player', createdAt: NOW });
  await houses.setLord(vassalHouse.id, { villageId: from.id, personId: 900 });
  const lordHouse = await houses.create({ playerId: LORD, kind: 'player', createdAt: NOW });
  await houses.setLord(lordHouse.id, { villageId: to.id, personId: 900 });
  const v = await vassalages.create({
    lordHouseId: lordHouse.id,
    vassalHouseId: vassalHouse.id,
    terms: { tribute: bundle({ grainKg: 150 }) },
    origin: 'negotiation',
    sinceAt: NOW,
    sinceDay: dayIndexOf({ year: 503, month: 10, day: 1 }),
  });
  const deps: LevyDeps = {
    dialogs,
    vassalages,
    houses,
    notices,
    villages,
    shipments: {
      shipments,
      villages,
      settlements,
      locks: new InMemoryPlayerLock(),
      now: () => new Date(0),
    },
    prepareVillage: () => Promise.resolve(null),
  };
  return {
    deps,
    dialogs,
    vassalages,
    notices,
    villages,
    shipments,
    houses,
    vassalageId: v.id,
    vassalVillage: from.id,
    strangerVillage: stranger.id,
    lordVillage: to.id,
  };
}

const answerOf = (
  dialogId: string,
  villageId: string,
  grainKg: number,
  message: string | null = null,
): Parameters<typeof answerLevy>[1] => ({
  playerId: VASSAL,
  dialogId,
  lines: [{ good: 'grainKg', amount: grainKg }],
  split: { [villageId]: bundle({ grainKg }) as MacroBundle },
  message,
  today: DAY,
});

describe('roční dialog Odvody', () => {
  it('otevře se 1. 11. jednou, vazal dostane upozornění; opakování nic nezdvojí', async () => {
    const w = await world();
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 - 1 })).toBe(0);
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 })).toBe(1);
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 })).toBe(0);
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 + 3 })).toBe(0);
    expect(w.dialogs.rows).toHaveLength(1);
    expect(w.dialogs.rows[0]).toMatchObject({ playerId: VASSAL, kind: 'levy', years: 1 });
    expect(w.notices.notices.filter((n) => n.kind === 'levy-pending')).toHaveLength(1);
    expect(w.vassalages.breachLog).toHaveLength(0);
  });

  it('doběhne po výpadku workeru (den po 1. 11., dialog roku chybí)', async () => {
    const w = await world();
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 + 20 })).toBe(1);
    expect(w.dialogs.rows[0]!.year).toBe(503);
  });

  it('vazalství vzniklé až po 1. 11. se ptá příště', async () => {
    const w = await world();
    w.vassalages.vassalages[0]!.sinceDay = NOV_1 + 5;
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 + 10 })).toBe(0);
  });

  it('žádná odpověď do dalšího 1. 11.: jeden dialog, years = 2, neplnění zapsané jednou', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    await openAnnualDialogs(w.deps, { today: NOV_1_NEXT });
    await openAnnualDialogs(w.deps, { today: NOV_1_NEXT + 1 });
    expect(w.dialogs.rows).toHaveLength(1);
    expect(w.dialogs.rows[0]).toMatchObject({ years: 2, year: 504, status: 'open' });
    expect(w.vassalages.breachLog).toEqual([{ id: w.vassalageId, kind: 'levy', day: NOV_1_NEXT }]);
    expect(w.vassalages.vassalages[0]!.breaches).toBe(1);
    // dialog žádá dávku za oba roky
    const [view] = await levyDialogs(w.deps, { playerId: VASSAL });
    expect(view).toMatchObject({ years: 2, lordName: 'Bořivoj' });
    expect(view!.agreed.grainKg).toBe(300);
  });

  it('míň než domluveno: zásilka, kronika obou rodů, upozornění pánovi, neplnění', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const dialog = w.dialogs.rows[0]!;
    const result = await answerLevy(
      w.deps,
      answerOf(dialog.id, w.vassalVillage, 100, 'Špatný rok.'),
    );
    expect(result).toMatchObject({ ok: true });
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.shipments.rows[0]!.toVillageId).toBe(w.lordVillage);
    expect(w.dialogs.rows[0]!.status).toBe('answered');
    expect(w.vassalages.breachLog).toEqual([{ id: w.vassalageId, kind: 'levy', day: DAY }]);

    const chronicle = w.villages.inbox.events.filter((e) => e.body.kind === 'chronicle');
    expect(chronicle.map((e) => e.villageId).sort()).toEqual(
      [w.lordVillage, w.vassalVillage].sort(),
    );
    expect(chronicle[0]!.body).toMatchObject({
      event: {
        kind: 'levy',
        vassal: 'Ctibor',
        lord: 'Bořivoj',
        parts: [{ good: 'grainKg', sent: 100, agreed: 150 }],
      },
    });

    const sent = w.notices.notices.filter((n) => n.kind === 'levy-sent');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ playerId: LORD });
    expect(sent[0]!.payload).toMatchObject({
      vassalName: 'Ctibor',
      message: 'Špatný rok.',
      arrivesDay: DAY + 6,
      parts: [{ good: 'grainKg', sent: 100, agreed: 150 }],
    });
    expect(JSON.stringify(sent[0]!.payload)).not.toContain('hrac-');
  });

  it('víc než domluveno: bez neplnění; druhá odpověď (dvojklik) nic nezdvojí', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const dialog = w.dialogs.rows[0]!;
    expect(await answerLevy(w.deps, answerOf(dialog.id, w.vassalVillage, 200))).toMatchObject({
      ok: true,
    });
    expect(w.vassalages.breachLog).toHaveLength(0);
    expect(await answerLevy(w.deps, answerOf(dialog.id, w.vassalVillage, 200))).toEqual({
      ok: false,
      reason: DIALOG_CLOSED,
    });
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.notices.notices.filter((n) => n.kind === 'levy-sent')).toHaveLength(1);
  });

  it('robota: lidé odejdou na čas (bez zásilky), pán dostane hosty; dvojklik nic nezdvojí', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const dialog = w.dialogs.rows[0]!;
    const input: Parameters<typeof answerLevy>[1] = {
      playerId: VASSAL,
      dialogId: dialog.id,
      lines: [{ good: 'laborDays', amount: 30 }],
      split: { [w.vassalVillage]: bundle({ laborDays: 30 }) as MacroBundle },
      message: null,
      today: DAY,
    };
    // vzdálenost 3 políčka = 6 dní cesty
    expect(await answerLevy(w.deps, input)).toMatchObject({ ok: true, arrivesDay: DAY + 6 });
    expect(w.shipments.rows).toHaveLength(0);
    const home = (await w.villages.find(w.vassalVillage))!.state;
    const away = home.people.filter((p) => p.away);
    expect(away).toHaveLength(1);
    expect(away[0]!.away).toMatchObject({
      kind: 'labor',
      untilDay: DAY + 6 + 30 + 6,
      hostVillageId: w.lordVillage,
    });
    const arrive = w.villages.inbox.events.filter((e) => e.body.kind === 'guests-arrive');
    expect(arrive).toHaveLength(1);
    expect(arrive[0]).toMatchObject({ villageId: w.lordVillage, day: DAY + 6 });
    expect(arrive[0]!.body).toMatchObject({
      fromVillageId: w.vassalVillage,
      guests: [{ kind: 'labor', untilDay: DAY + 6 + 30, adult: true }],
    });
    expect(await answerLevy(w.deps, input)).toEqual({ ok: false, reason: DIALOG_CLOSED });
    const again = (await w.villages.find(w.vassalVillage))!.state;
    expect(again.people.filter((p) => p.away)).toHaveLength(1);
    expect(w.villages.inbox.events.filter((e) => e.body.kind === 'guests-arrive')).toHaveLength(1);
  });

  it('sendCorvee se stejným refId (po pádu před zápisem do schránky) lidi znovu nepošle', async () => {
    const w = await world();
    const input = {
      fromVillageId: w.vassalVillage,
      toVillageId: w.lordVillage,
      laborDays: 45,
      refId: 'levy:x:corvee',
      today: DAY,
    };
    // pád mezi uložením vsi a zápisem do schránky: lidé jsou pryč, hostitel o nich neví
    const record = (await w.villages.find(w.vassalVillage))!;
    const crashed = dispatchCorvee(record.state, DAY, {
      laborDays: 45,
      travelDays: 6,
      homeVillageId: w.vassalVillage,
      hostVillageId: w.lordVillage,
      hostName: 'Lhota',
      refId: input.refId,
    });
    if (!crashed.ok) throw new Error(crashed.reason);
    await w.villages.save(w.vassalVillage, crashed.state, record.version);
    expect(await sendCorvee(w.deps.shipments, input)).toEqual({ ok: true, arrivesDay: DAY + 6 });
    expect(await sendCorvee(w.deps.shipments, input)).toEqual({ ok: true, arrivesDay: DAY + 6 });
    const home = (await w.villages.find(w.vassalVillage))!.state;
    expect(home.people.filter((p) => p.away)).toHaveLength(2);
    const arrive = w.villages.inbox.events.filter((e) => e.body.kind === 'guests-arrive');
    expect(arrive).toHaveLength(1);
    expect(arrive[0]!.body.kind === 'guests-arrive' && arrive[0]!.body.guests).toHaveLength(2);
  });

  it('odvádějí jen vsi rodu vazala, ne cizí; součet musí sedět', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const dialog = w.dialogs.rows[0]!;
    expect(await answerLevy(w.deps, answerOf(dialog.id, w.strangerVillage, 100))).toEqual({
      ok: false,
      reason: LEVY_NOT_YOUR_VILLAGE,
    });
    const wrong = answerOf(dialog.id, w.vassalVillage, 100);
    wrong.lines = [{ good: 'grainKg', amount: 90 }];
    expect(await answerLevy(w.deps, wrong)).toEqual({ ok: false, reason: LEVY_BAD_ANSWER });
    expect(w.shipments.rows).toHaveLength(0);
    expect(w.dialogs.rows[0]!.status).toBe('open');
  });

  it('po vypovězení dialog zmizí', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const result = await renounceVassalage(
      {
        houses: w.houses,
        vassalages: w.vassalages,
        notices: w.notices,
        villages: w.villages,
        dialogs: w.dialogs,
      },
      { playerId: VASSAL, vassalageId: w.vassalageId, message: null, now: NOW, today: NOV_1 },
    );
    expect(result).toEqual({ ok: true });
    expect(await w.dialogs.listOpen(VASSAL)).toHaveLength(0);
    expect(w.dialogs.rows[0]!.status).toBe('dropped');
    // a znovu se neotevře
    expect(await openAnnualDialogs(w.deps, { today: NOV_1 + 1 })).toBe(0);
  });

  it('levyDialogs předvyplní rozdělení po vsích rodu', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const [view] = await levyDialogs(w.deps, { playerId: VASSAL });
    expect(view!.villages).toHaveLength(1);
    expect(view!.villages[0]).toMatchObject({ villageId: w.vassalVillage, name: 'Dub' });
    expect(view!.villages[0]!.suggested.grainKg).toBe(150);
  });
});

describe('správce za nepřítomného vazala (absence.md)', () => {
  const due = NOV_1 + ABSENT_VASSAL.levyAnswerDays;

  it('do konce roku bez odpovědi: správce odvede domluvené, pán i vazal to vidí; dialog nenaroste', async () => {
    const w = await world();
    // klády ves postrádat může (obilí ne – pojistka jídla na 2 roky)
    w.vassalages.vassalages[0]!.terms = { tribute: bundle({ logs: 10 }) };
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const [view] = await levyDialogs(w.deps, { playerId: VASSAL });
    expect(view!.stewardDay).toBe(due);
    expect(await answerAbsentLevies(w.deps, { today: due - 1 })).toBe(0);
    expect(await answerAbsentLevies(w.deps, { today: due })).toBe(1);
    expect(await answerAbsentLevies(w.deps, { today: due + 1 })).toBe(0);
    expect(w.dialogs.rows[0]!.status).toBe('answered');
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.shipments.rows[0]).toMatchObject({ toVillageId: w.lordVillage });
    expect(w.vassalages.breachLog).toEqual([]);
    expect(w.notices.notices.find((n) => n.kind === 'levy-steward')).toMatchObject({
      playerId: VASSAL,
      payload: {
        lordName: 'Bořivoj',
        kind: 'levy',
        parts: [{ good: 'logs', sent: 10, agreed: 10 }],
      },
    });
    expect(w.notices.notices.find((n) => n.kind === 'levy-sent')).toMatchObject({
      playerId: LORD,
      payload: { steward: true },
    });
    // další 1. 11. vznikne nový dialog za jeden rok, bez zmeškaného roku
    expect(await openAnnualDialogs(w.deps, { today: NOV_1_NEXT })).toBe(1);
    expect(w.dialogs.rows[1]).toMatchObject({ year: 504, years: 1, status: 'open' });
    expect(w.vassalages.breachLog).toEqual([]);
  });

  it('nemá-li na to ves, odvede, co může – míň než domluveno je neplnění', async () => {
    const w = await world();
    w.vassalages.vassalages[0]!.terms = { tribute: bundle({ grainKg: 1_000, logs: 1_000 }) };
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    expect(await answerAbsentLevies(w.deps, { today: due })).toBe(1);
    const sent = w.notices.notices.find((n) => n.kind === 'levy-steward')!.payload;
    const parts = sent.parts as { good: string; sent: number; agreed: number }[];
    // obilí ves nepostrádá (pojistka jídla), klád pošle, kolik může – nic nad přebytek
    expect(parts.find((p) => p.good === 'grainKg')).toMatchObject({ sent: 0, agreed: 1_000 });
    const logs = parts.find((p) => p.good === 'logs')!;
    expect(logs.sent).toBeGreaterThan(0);
    expect(logs.sent).toBeLessThan(1_000);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.vassalages.breachLog).toEqual([{ id: w.vassalageId, kind: 'levy', day: due }]);
  });

  it('ves vazala (i uspaná – worker.md, Uspání nečinných) se dopočte dřív, než správce odvede', async () => {
    const w = await world();
    w.vassalages.vassalages[0]!.terms = { tribute: bundle({ logs: 10 }) };
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    const prepared: [string, number, number][] = [];
    w.deps.prepareVillage = (villageId, today) => {
      prepared.push([villageId, today, w.shipments.rows.length]);
      return Promise.resolve(null);
    };
    expect(await answerAbsentLevies(w.deps, { today: due })).toBe(1);
    // do dneška lhůty, dřív než zásilka odešla (výhled i odeslání čtou dopočtený stav)
    expect(prepared[0]).toEqual([w.vassalVillage, due, 0]);
    expect(prepared.every(([id, day]) => id === w.vassalVillage && day === due)).toBe(true);
    expect(w.shipments.rows).toHaveLength(1);
  });

  it('odpověď hráče do lhůty má přednost', async () => {
    const w = await world();
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    await answerLevy(w.deps, answerOf(w.dialogs.rows[0]!.id, w.vassalVillage, 100));
    expect(await answerAbsentLevies(w.deps, { today: due })).toBe(0);
    expect(w.shipments.rows).toHaveLength(1);
    expect(w.notices.notices.filter((n) => n.kind === 'levy-steward')).toHaveLength(0);
  });

  it('chyba, která se sama nespraví (cílová ves zanikla): uzavře se jako neplnění, druhé kolo nic', async () => {
    const w = await world();
    w.vassalages.vassalages[0]!.terms = {
      tribute: bundle({ logs: 10 }),
      targetVillageId: 'zanikla-ves',
    };
    await openAnnualDialogs(w.deps, { today: NOV_1 });
    expect(await answerAbsentLevies(w.deps, { today: due })).toBe(1);
    expect(w.dialogs.rows[0]!.status).toBe('answered');
    expect(w.shipments.rows).toHaveLength(0);
    expect(w.vassalages.breachLog).toEqual([{ id: w.vassalageId, kind: 'levy', day: due }]);
    expect(w.notices.notices.find((n) => n.kind === 'levy-steward')!.payload).toMatchObject({
      parts: [{ good: 'logs', sent: 0, agreed: 10 }],
    });
    expect(await answerAbsentLevies(w.deps, { today: due + 1 })).toBe(0);
    expect(w.vassalages.breachLog).toHaveLength(1);
  });
});
