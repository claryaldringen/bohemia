import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { DAY, receiver, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import type { Person, VillageState } from '../../domain/village';
import { ABSENT_VASSAL } from '../../domain/vassalage';
import {
  answerAbsentSummons,
  answerNpcSummons,
  answerSummons,
  lapseSummons,
  serviceMenOf,
  summonVassals,
  SUMMONS_REASONS,
  summonsBody,
  summonsStewardDay,
  type SummonsDeps,
} from '../summons';
import { InMemoryDialogs } from './in-memory-dialogs';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryStewardships } from './in-memory-stewardships';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWars } from './in-memory-wars';

// Svolání vazalů do války (vassalage.md – Svolání; plán 2026-11-03 – Úloha 6.13).

const LORD = 'hrac-pan';
const VASSAL = 'hrac-vazal';
const SUB = 'hrac-podvazal';
const ENEMY = 'hrac-nepritel';
const NOW = new Date('2026-11-05T12:00:00Z');
const YEAR = 365.25;

/** Muž rodu ve věku `age` s výcvikem boje `combat`. */
function lineMan(id: number, age: number, combat: number): Person {
  return {
    id,
    bornDay: DAY - Math.ceil((age + 0.5) * YEAR),
    dwellingId: 500,
    sex: 'male',
    line: true,
    name: `Muž ${id}`,
    arms: { bow: 0, combat, riding: 0 },
  };
}

function withMen(state: VillageState, head: string, ids: number[]): VillageState {
  state.people.push({ ...lineMan(900, 40, 0), name: head });
  ids.forEach((id, i) => state.people.push(lineMan(id, 20 + i, 10 + 10 * i)));
  // vesničan – do služby nesmí
  state.people.push({ id: 960, bornDay: DAY - 9_000, dwellingId: 500, sex: 'male' });
  return state;
}

async function world(service = { men: 2, days: 30 }): Promise<{
  deps: SummonsDeps;
  dialogs: InMemoryDialogs;
  vassalages: InMemoryVassalages;
  villages: InMemoryVillages;
  wars: InMemoryWars;
  warId: string;
  lordVillage: string;
  vassalVillage: string;
  subVillage: string;
  vassalageId: string;
  subVassalageId: string;
  npcVillage: string;
  npcVassalageId: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const dialogs = new InMemoryDialogs();
  const houses = new InMemoryHouses();
  const vassalages = new InMemoryVassalages();
  const notices = new InMemoryNotices();
  const wars = new InMemoryWars();
  const seat = async (ownerId: string, x: number, seed: number): Promise<string> =>
    (await settlements.create({
      ownerId,
      landscapeSeed: seed,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x, y: 0 },
    }))!.id;
  const lordVillage = await villages.add(
    await seat(LORD, 0, 1),
    'Lhota',
    withMen(receiver(), 'Bořivoj', []),
  );
  const vassalVillage = await villages.add(
    await seat(VASSAL, 2, 2),
    'Dub',
    withMen(sender(), 'Ctibor', [901, 902, 903]),
  );
  const subVillage = await villages.add(
    await seat(SUB, 4, 3),
    'Bor',
    withMen(sender(), 'Radim', [911, 912]),
  );
  const enemyVillage = await villages.add(
    await seat(ENEMY, 8, 4),
    'Kněžice',
    withMen(sender(), 'Vok', []),
  );
  const house = async (playerId: string, villageId: string): Promise<string> => {
    const h = await houses.create({ playerId, kind: 'player', createdAt: NOW });
    await houses.setLord(h.id, { villageId, personId: 900 });
    return h.id;
  };
  const lord = await house(LORD, lordVillage.id);
  const vassal = await house(VASSAL, vassalVillage.id);
  const sub = await house(SUB, subVillage.id);
  const enemy = await house(ENEMY, enemyVillage.id);
  const since = { origin: 'negotiation' as const, sinceAt: NOW, sinceDay: DAY - 400 };
  const v = await vassalages.create({
    lordHouseId: lord,
    vassalHouseId: vassal,
    terms: { service },
    ...since,
  });
  const sv = await vassalages.create({
    lordHouseId: vassal,
    vassalHouseId: sub,
    terms: { service: { men: 1, days: 20 } },
    ...since,
  });
  // povýšený šlechtic (NPC rod) spravuje pánovu ves Vrbno – jeho muži jsou v ní
  const npc = await houses.create({ playerId: null, kind: 'npc', createdAt: NOW });
  const npcState = withMen(sender(), 'Lupráč', []);
  [921, 922, 923].forEach((id, i) =>
    npcState.people.push({ ...lineMan(id, 20 + i, 10 + 10 * i), noble: { houseId: npc.id } }),
  );
  const npcVillage = await villages.add(await seat(LORD, 6, 5), 'Vrbno', npcState);
  const nv = await vassalages.create({
    lordHouseId: lord,
    vassalHouseId: npc.id,
    terms: { service: { men: 2, days: 30 } },
    origin: 'ennoble',
    sinceAt: NOW,
    sinceDay: DAY - 400,
  });
  const stewardships = new InMemoryStewardships();
  await stewardships.start({
    villageId: npcVillage.id,
    stewardHouseId: npc.id,
    holderHouseId: lord,
    kind: 'npc',
    vassalageId: nv.id,
    since: NOW,
  });
  const { war } = await wars.start({
    houses: [lord, enemy],
    startedAt: NOW,
    startedDay: DAY,
    how: 'declared',
  });
  const deps: SummonsDeps = {
    dialogs,
    vassalages,
    houses,
    wars,
    notices,
    villages,
    settlements,
    shipments: {
      shipments: new InMemoryShipments(),
      villages,
      settlements,
      locks: new InMemoryPlayerLock(),
      now: () => NOW,
    },
    stewardships,
    prepareVillage: () => Promise.resolve(null),
  };
  return {
    deps,
    dialogs,
    vassalages,
    villages,
    wars,
    warId: war.id,
    lordVillage: lordVillage.id,
    vassalVillage: vassalVillage.id,
    subVillage: subVillage.id,
    vassalageId: v.id,
    subVassalageId: sv.id,
    npcVillage: npcVillage.id,
    npcVassalageId: nv.id,
  };
}

describe('svolání vazalů', () => {
  it('dialog Svolání s domluvenými muži a dny; mimo válku svolat nejde', async () => {
    const w = await world();
    const summoned = await summonVassals(w.deps, {
      playerId: LORD,
      warId: w.warId,
      vassalageIds: [w.vassalageId],
      targetVillageId: w.lordVillage,
      today: DAY,
    });
    expect(summoned.ok).toBe(true);
    const [dialog] = await w.dialogs.listOpen(VASSAL);
    expect(dialog?.kind).toBe('summons');
    expect(summonsBody(dialog!)).toMatchObject({
      men: 2,
      days: 30,
      targetVillageId: w.lordVillage,
    });
    const otherWar = await summonVassals(w.deps, {
      playerId: LORD,
      warId: 'jina-valka',
      vassalageIds: [w.vassalageId],
      targetVillageId: w.lordVillage,
      today: DAY,
    });
    expect(otherWar).toEqual({ ok: false, reason: SUMMONS_REASONS.notAtWar });
  });

  it('do služby jen muži rodu; nejzdatnější první; muži odejdou do cílové vsi jako hosté', async () => {
    const w = await world();
    await summonVassals(w.deps, {
      playerId: LORD,
      warId: w.warId,
      vassalageIds: [w.vassalageId],
      targetVillageId: w.lordVillage,
      today: DAY,
    });
    const [dialog] = await w.dialogs.listOpen(VASSAL);
    const men = await serviceMenOf(w.deps, { playerId: VASSAL, today: DAY });
    expect(men.map((m) => m.ref.personId).slice(0, 3)).toEqual([903, 902, 901]);
    const villager = await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId: dialog!.id,
      men: [{ villageId: w.vassalVillage, personId: 960 }],
      message: null,
      today: DAY,
    });
    expect(villager).toEqual({ ok: false, reason: SUMMONS_REASONS.notLineMan });
    const answered = await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId: dialog!.id,
      men: [
        { villageId: w.vassalVillage, personId: 903 },
        { villageId: w.vassalVillage, personId: 902 },
      ],
      message: 'Jdeme.',
      today: DAY,
    });
    expect(answered).toMatchObject({ ok: true, sent: 2, short: false });
    const home = (await w.villages.find(w.vassalVillage))!.state;
    const away = home.people.filter((p) => p.away?.kind === 'service');
    expect(away.map((p) => p.id)).toEqual([902, 903]);
    const arrive = w.villages.inbox.events.find((e) => e.villageId === w.lordVillage);
    expect(arrive?.body).toMatchObject({ kind: 'guests-arrive' });
    expect(w.vassalages.breachLog).toEqual([]);
    const again = await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId: dialog!.id,
      men: [{ villageId: w.vassalVillage, personId: 901 }],
      message: null,
      today: DAY,
    });
    expect(again).toEqual({ ok: false, reason: SUMMONS_REASONS.answered });
  });

  it('NPC vazal pošle přesně domluvené muže – nejzdatnější muže rodu, bez dialogu', async () => {
    const w = await world();
    const summoned = await summonVassals(w.deps, {
      playerId: LORD,
      warId: w.warId,
      vassalageIds: [w.npcVassalageId],
      targetVillageId: w.lordVillage,
      today: DAY,
    });
    if (!summoned.ok) throw new Error(summoned.reason);
    expect(summoned.npcDialogIds).toHaveLength(1);
    const dialogId = summoned.npcDialogIds[0]!;
    const answered = await answerNpcSummons(w.deps, { dialogId, today: DAY });
    expect(answered).toMatchObject({ ok: true, sent: 2, short: false });
    // dva nejzdatnější šlechtici (ne vesničan, ne hlava vsi bez výcviku), třetí zůstal
    const home = (await w.villages.find(w.npcVillage))!.state;
    expect(home.people.filter((p) => p.away?.kind === 'service').map((p) => p.id)).toEqual([
      922, 923,
    ]);
    expect(w.vassalages.breachLog).toEqual([]);
    expect((await w.dialogs.listOpen(LORD)).filter((d) => d.kind === 'summons')).toEqual([]);
    expect(summonsBody((await w.dialogs.byId(dialogId))!)).toMatchObject({ sent: 2 });
    // opakování nic nezdvojí; dny služby se počítají jako u hráče
    expect(await answerNpcSummons(w.deps, { dialogId, today: DAY })).toEqual({
      ok: false,
      reason: SUMMONS_REASONS.answered,
    });
  });

  it('víc svolání do vyčerpání dnů služby za herní rok', async () => {
    const w = await world({ men: 1, days: 30 });
    const summon = (days?: number): ReturnType<typeof summonVassals> =>
      summonVassals(w.deps, {
        playerId: LORD,
        warId: w.warId,
        vassalageIds: [w.vassalageId],
        targetVillageId: w.lordVillage,
        today: DAY,
        ...(days === undefined ? {} : { days }),
      });
    const first = await summon(20);
    expect(first.ok && summonsBody(first.opened[0]!).days).toBe(20);
    expect(await summon()).toEqual({ ok: false, reason: SUMMONS_REASONS.waiting });
    await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId: first.ok ? first.opened[0]!.id : '',
      men: [{ villageId: w.vassalVillage, personId: 901 }],
      message: null,
      today: DAY,
    });
    const second = await summon();
    expect(second.ok && summonsBody(second.opened[0]!).days).toBe(10);
    await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId: second.ok ? second.opened[0]!.id : '',
      men: [{ villageId: w.vassalVillage, personId: 902 }],
      message: null,
      today: DAY,
    });
    expect(await summon()).toEqual({ ok: false, reason: SUMMONS_REASONS.exhausted });
  });

  it('vazal vazala svolaný na svolání pána přijde k pánovi a počítá se do služby vazala', async () => {
    const w = await world({ men: 3, days: 30 });
    await summonVassals(w.deps, {
      playerId: LORD,
      warId: w.warId,
      vassalageIds: [w.vassalageId],
      targetVillageId: w.lordVillage,
      today: DAY,
    });
    const [fromLord] = await w.dialogs.listOpen(VASSAL);
    const relayed = await summonVassals(w.deps, {
      playerId: VASSAL,
      warId: w.warId,
      vassalageIds: [w.subVassalageId],
      targetVillageId: w.vassalVillage,
      today: DAY,
    });
    expect(relayed.ok).toBe(true);
    const [toSub] = await w.dialogs.listOpen(SUB);
    expect(summonsBody(toSub!)).toMatchObject({
      targetVillageId: w.lordVillage,
      forDialogId: fromLord!.id,
    });
    await answerSummons(w.deps, {
      playerId: SUB,
      dialogId: toSub!.id,
      men: [
        { villageId: w.subVillage, personId: 911 },
        { villageId: w.subVillage, personId: 912 },
      ],
      message: null,
      today: DAY,
    });
    expect(
      w.villages.inbox.events.filter(
        (e) => e.villageId === w.lordVillage && e.body.kind === 'guests-arrive',
      ),
    ).toHaveLength(1);
    const answered = await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId: fromLord!.id,
      men: [{ villageId: w.vassalVillage, personId: 901 }],
      message: null,
      today: DAY,
    });
    // 1 vlastní + 2 od vazala = domluvení 3 muži, žádné neplnění
    expect(answered).toMatchObject({ ok: true, sent: 1, short: false });
    expect(w.vassalages.breachLog).toEqual([]);
  });

  it('míň mužů = neplnění; bez odpovědi do konce války – kronika „nepřišel do války“ a neplnění', async () => {
    const w = await world({ men: 2, days: 30 });
    const summon = (): ReturnType<typeof summonVassals> =>
      summonVassals(w.deps, {
        playerId: LORD,
        warId: w.warId,
        vassalageIds: [w.vassalageId],
        targetVillageId: w.lordVillage,
        today: DAY,
        days: 5,
      });
    const first = await summon();
    const short = await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId: first.ok ? first.opened[0]!.id : '',
      men: [],
      message: 'Nemáme koho.',
      today: DAY,
    });
    expect(short).toMatchObject({ ok: true, sent: 0, short: true });
    expect(w.vassalages.breachLog).toHaveLength(1);
    await summon();
    expect(await lapseSummons(w.deps, { today: DAY + 1 })).toBe(0);
    await w.wars.end(w.warId, 'peace', NOW);
    expect(await lapseSummons(w.deps, { today: DAY + 2 })).toBe(1);
    expect(await lapseSummons(w.deps, { today: DAY + 3 })).toBe(0);
    expect(w.vassalages.breachLog.map((b) => b.kind)).toEqual(['summons', 'summons']);
    const noShow = w.villages.inbox.events.filter(
      (e) => e.body.kind === 'chronicle' && e.body.event.kind === 'no-show',
    );
    expect(noShow.map((e) => e.villageId).sort()).toEqual([w.lordVillage, w.vassalVillage].sort());
  });
});

describe('správce za nepřítomného vazala (absence.md)', () => {
  const summon = async (w: Awaited<ReturnType<typeof world>>): Promise<string> => {
    const summoned = await summonVassals(w.deps, {
      playerId: LORD,
      warId: w.warId,
      vassalageIds: [w.vassalageId],
      targetVillageId: w.lordVillage,
      today: DAY,
    });
    return summoned.ok ? summoned.opened[0]!.id : '';
  };

  it('vsi vazala (i uspané – worker.md, Uspání nečinných) se dopočtou dřív, než správce vybere muže', async () => {
    const w = await world();
    await summon(w);
    const due = DAY + ABSENT_VASSAL.summonsAnswerDays;
    const prepared: [string, number, number][] = [];
    w.deps.prepareVillage = async (villageId, today) => {
      const state = (await w.villages.find(villageId))!.state;
      prepared.push([villageId, today, state.people.filter((p) => p.away).length]);
      return null;
    };
    expect(await answerAbsentSummons(w.deps, { today: due })).toBe(1);
    // každá ves rodu do dneška lhůty, dřív než muži odešli
    expect(prepared.find(([id]) => id === w.vassalVillage)).toEqual([w.vassalVillage, due, 0]);
    expect(prepared.every(([, day]) => day === due)).toBe(true);
    const home = (await w.villages.find(w.vassalVillage))!.state;
    expect(home.people.filter((p) => p.away?.kind === 'service')).toHaveLength(2);
  });

  it('po lhůtě pošle správce domluvené nejzdatnější muže rodu; pán i vazal to vidí', async () => {
    const w = await world();
    const dialogId = await summon(w);
    expect(summonsStewardDay((await w.dialogs.byId(dialogId))!)).toBe(
      DAY + ABSENT_VASSAL.summonsAnswerDays,
    );
    const due = DAY + ABSENT_VASSAL.summonsAnswerDays;
    expect(await answerAbsentSummons(w.deps, { today: due - 1 })).toBe(0);
    expect(await answerAbsentSummons(w.deps, { today: due })).toBe(1);
    expect(await answerAbsentSummons(w.deps, { today: due + 1 })).toBe(0);
    const home = (await w.villages.find(w.vassalVillage))!.state;
    expect(home.people.filter((p) => p.away?.kind === 'service').map((p) => p.id)).toEqual([
      902, 903,
    ]);
    const dialog = (await w.dialogs.byId(dialogId))!;
    expect(dialog.status).toBe('answered');
    expect(summonsBody(dialog)).toMatchObject({ sent: 2, steward: true });
    expect(w.vassalages.breachLog).toEqual([]);
    const notices = w.deps.notices as InMemoryNotices;
    expect(notices.notices.find((n) => n.kind === 'summons-steward')).toMatchObject({
      playerId: VASSAL,
      payload: { name: 'Bořivoj', men: 2 },
    });
    expect(notices.notices.find((n) => n.kind === 'summons-sent')).toMatchObject({
      playerId: LORD,
      payload: { men: 2, steward: true },
    });
  });

  it('nemá-li dost mužů doma a zdravých, pošle všechny a míň je neplnění', async () => {
    const w = await world({ men: 6, days: 30 });
    await summon(w);
    expect(await answerAbsentSummons(w.deps, { today: DAY + 40 })).toBe(1);
    const home = (await w.villages.find(w.vassalVillage))!.state;
    // hlava rodu a tři synové – vesničan do služby nesmí
    expect(home.people.filter((p) => p.away?.kind === 'service')).toHaveLength(4);
    expect(w.vassalages.breachLog.map((b) => b.kind)).toEqual(['summons']);
  });

  it('odpověď hráče do lhůty má přednost; po konci války správce nejedná – svolání propadne', async () => {
    const w = await world();
    const dialogId = await summon(w);
    await answerSummons(w.deps, {
      playerId: VASSAL,
      dialogId,
      men: [{ villageId: w.vassalVillage, personId: 901 }],
      message: null,
      today: DAY + 1,
    });
    expect(await answerAbsentSummons(w.deps, { today: DAY + 100 })).toBe(0);

    const v = await world();
    await summon(v);
    await v.wars.end(v.warId, 'peace', NOW);
    expect(await answerAbsentSummons(v.deps, { today: DAY + 100 })).toBe(0);
    expect(await lapseSummons(v.deps, { today: DAY + 100 })).toBe(1);
  });

  it('cílová ves zanikla: svolání se uzavře jako neplnění, druhé kolo nic', async () => {
    const w = await world();
    const dialogId = await summon(w);
    const row = w.dialogs.rows.find((d) => d.id === dialogId)!;
    row.body = { ...row.body, targetVillageId: 'zanikla-ves' };
    expect(await answerAbsentSummons(w.deps, { today: DAY + 40 })).toBe(1);
    expect((await w.dialogs.byId(dialogId))!.status).toBe('answered');
    const home = (await w.villages.find(w.vassalVillage))!.state;
    expect(home.people.filter((p) => p.away?.kind === 'service')).toHaveLength(0);
    expect(w.vassalages.breachLog.map((b) => b.kind)).toEqual(['summons']);
    expect(await answerAbsentSummons(w.deps, { today: DAY + 41 })).toBe(0);
    expect(w.vassalages.breachLog).toHaveLength(1);
  });
});
