import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { DAY, receiver, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import type { Person, VillageState } from '../../domain/village';
import {
  answerSummons,
  lapseSummons,
  serviceMenOf,
  summonVassals,
  SUMMONS_REASONS,
  summonsBody,
  type SummonsDeps,
} from '../summons';
import { InMemoryDialogs } from './in-memory-dialogs';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
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
