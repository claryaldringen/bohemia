import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { DAY, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import { startWarByAttack } from '../declare-war';
import { announcePassage, answerPassage, PASSAGE_REASONS, type PassageDeps } from '../passage';
import { villageWatchers } from '../step-campaigns';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNotices } from './in-memory-notices';
import { InMemoryPassages } from './in-memory-passages';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryDisputes } from './in-memory-disputes';
import { InMemoryVassalages } from './in-memory-vassalages';
import { InMemoryVillages } from './in-memory-villages';
import { InMemoryWars } from './in-memory-wars';

// Ohlášený průchod (war.md – Pohyb: Průchod územím neutrálního rodu; plán – Úloha 6.13).

const ARMY = 'hrac-borivoj';
const NEUTRAL = 'hrac-ctibor';
const NOW = new Date('2026-11-05T12:00:00Z');
/** Rody starší než ochrana nováčka (7 dní). */
const CAMPAIGN = 'campaign-1';
const OLD = new Date('2026-10-01T12:00:00Z');

async function world(): Promise<{
  deps: PassageDeps;
  passages: InMemoryPassages;
  notices: InMemoryNotices;
  villages: InMemoryVillages;
  wars: InMemoryWars;
  watchers: ReturnType<typeof villageWatchers>;
  armyHouse: string;
  neutralHouse: string;
  onRoute: string;
  offRoute: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const houses = new InMemoryHouses();
  const notices = new InMemoryNotices();
  const passages = new InMemoryPassages();
  const wars = new InMemoryWars();
  const vassalages = new InMemoryVassalages();
  const village = async (ownerId: string, x: number, name: string): Promise<string> => {
    const s = (await settlements.create({
      ownerId,
      landscapeSeed: x + 1,
      layerVersions: CURRENT_LAYER_VERSIONS,
      worldCell: { x, y: 0 },
    }))!;
    const state = sender();
    state.people.push({ id: 900, name, bornDay: DAY - 15_000, dwellingId: 500, sex: 'male' });
    return (await villages.add(s.id, name, state)).id;
  };
  const home = await village(ARMY, 0, 'Bořivoj');
  const onRoute = await village(NEUTRAL, 1, 'Ctibor');
  const offRoute = await village(NEUTRAL, 5, 'Kněžice');
  const army = await houses.create({ playerId: ARMY, kind: 'player', createdAt: OLD });
  await houses.setLord(army.id, { villageId: home, personId: 900 });
  const neutral = await houses.create({ playerId: NEUTRAL, kind: 'player', createdAt: OLD });
  await houses.setLord(neutral.id, { villageId: onRoute, personId: 900 });
  return {
    deps: { passages, houses, wars, notices, villages, now: () => NOW },
    passages,
    notices,
    villages,
    wars,
    watchers: villageWatchers({ villages, settlements, houses, vassalages, passages }),
    armyHouse: army.id,
    neutralHouse: neutral.id,
    onRoute,
    offRoute,
  };
}

const announce = (w: Awaited<ReturnType<typeof world>>): ReturnType<typeof announcePassage> =>
  announcePassage(w.deps, {
    playerId: ARMY,
    house: w.neutralHouse,
    cells: [{ x: 1, y: 0 }],
    eta: DAY + 10,
    message: 'Jdeme jen kolem.',
    today: DAY,
  });

describe('ohlášený průchod', () => {
  it('ohlášení: upozornění a kronika obou rodů; vlastnímu rodu ani bez map ohlásit nejde', async () => {
    const w = await world();
    const done = await announce(w);
    expect(done.ok).toBe(true);
    expect(w.notices.notices.map((n) => n.kind)).toEqual(['passage-announced']);
    const chronicle = w.villages.inbox.events.filter((e) => e.body.kind === 'chronicle');
    expect(chronicle).toHaveLength(2);
    const own = await announcePassage(w.deps, {
      playerId: ARMY,
      house: w.armyHouse,
      cells: [{ x: 1, y: 0 }],
      eta: DAY,
      message: '',
      today: DAY,
    });
    expect(own).toEqual({ ok: false, reason: PASSAGE_REASONS.own });
    const empty = await announcePassage(w.deps, {
      playerId: ARMY,
      house: w.neutralHouse,
      cells: [],
      eta: DAY,
      message: '',
      today: DAY,
    });
    expect(empty).toEqual({ ok: false, reason: PASSAGE_REASONS.noCells });
  });

  it('ohlášené vojsko je pro ves na ohlášené mapě neškodné – ves neutíká; jinde škodí', async () => {
    const w = await world();
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(false);
    await announce(w);
    await w.passages.bindToCampaign(w.armyHouse, CAMPAIGN);
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(true);
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.offRoute, CAMPAIGN)).toBe(false);
  });

  it('„Nevěřit“ – ves se zachová podle postoje; odpovědět jde jen jednou a jen oslovený rod', async () => {
    const w = await world();
    const done = await announce(w);
    await w.passages.bindToCampaign(w.armyHouse, CAMPAIGN);
    const passageId = done.ok ? done.passage.id : '';
    const stranger = await answerPassage(w.deps, {
      playerId: ARMY,
      passageId,
      trust: false,
      message: '',
      today: DAY,
    });
    expect(stranger).toEqual({ ok: false, reason: PASSAGE_REASONS.notYours });
    const answered = await answerPassage(w.deps, {
      playerId: NEUTRAL,
      passageId,
      trust: false,
      message: 'Nevěřím.',
      today: DAY,
    });
    expect(answered.ok).toBe(true);
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(false);
    const again = await answerPassage(w.deps, {
      playerId: NEUTRAL,
      passageId,
      trust: true,
      message: '',
      today: DAY,
    });
    expect(again).toEqual({ ok: false, reason: PASSAGE_REASONS.answered });
    expect(w.notices.notices.at(-1)).toMatchObject({
      playerId: ARMY,
      kind: 'passage-answered',
      payload: { trust: false, message: 'Nevěřím.' },
    });
  });

  it('útok po ohlášení = přepadení a ohlášení přestane platit pro všechny vsi rodu', async () => {
    const w = await world();
    await announce(w);
    const warDeps = {
      ...w.deps,
      wars: w.wars,
      notices: w.notices,
      disputes: new InMemoryDisputes(),
      vassalages: new InMemoryVassalages(),
    };
    const war = await startWarByAttack(warDeps, {
      attackerId: w.armyHouse,
      defenderId: w.neutralHouse,
      now: NOW,
      today: DAY,
    });
    expect(war.ok).toBe(true);
    expect((await w.wars.activeOf(w.armyHouse))[0]?.how).toBe('ambush');
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(false);
    expect(w.passages.rows[0]?.voidedAt).toEqual(NOW);
    // ve válce průchod ohlásit nejde
    expect(await announce(w)).toEqual({ ok: false, reason: PASSAGE_REASONS.atWar });
  });

  it('ohlášení platí jen pro své tažení: po návratu domů ves zase jedná podle postoje', async () => {
    const w = await world();
    await announce(w);
    // čekající ohlášení (tažení ještě nevyrazilo) nikoho neuklidní
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(false);
    expect(await w.passages.bindToCampaign(w.armyHouse, CAMPAIGN)).toBe(1);
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(true);
    // jiné tažení téhož rodu ohlášení nezdědí
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, 'campaign-2')).toBe(false);
    // tažení skončilo (návrat / rozpad) – ohlášení přestalo platit
    expect(await w.passages.voidOfCampaign(CAMPAIGN, NOW)).toBe(1);
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(false);
    // na další průchod se musí ohlásit znovu a naváže se na další tažení
    await announce(w);
    expect(await w.passages.bindToCampaign(w.armyHouse, 'campaign-2')).toBe(1);
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, CAMPAIGN)).toBe(false);
    expect(await w.watchers.harmless(ARMY, NEUTRAL, w.onRoute, 'campaign-2')).toBe(true);
  });
});
