import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { STEWARDSHIP_REASONS } from '../../domain/negotiation';
import { DAY, village } from '../../domain/village/__tests__/kin-fixtures';
import { acceptNegotiation, openNegotiation } from '../negotiate';
import { NOT_PLAYER_VILLAGE } from '../player-villages';
import { renounceVassalage } from '../renounce';
import {
  ACTION_RIGHTS,
  ALL_RIGHTS,
  requireRight,
  STEWARD_ONLY,
  type VillageRight,
} from '../rights';
import { dismissSteward, holderOf, lockOwnerOf, NOT_HOLDER, NO_STEWARD } from '../stewardships';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNegotiations } from './in-memory-negotiations';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryStewardships } from './in-memory-stewardships';
import { InMemoryVillages } from './in-memory-villages';
import { NOW, setup, type Setup } from './negotiation-fixture';

// Správa cizí vsi (vassalage.md – Hráč jako správce cizí vsi; plán 4.8, Review bod 4).

const HOLDER = 'drzitel';
const STEWARD = 'spravce';
const STEWARD_DENIED: VillageRight[] = [
  'nameSons',
  'sendSons',
  'evacuate',
  'ennoble',
  'dismissSteward',
  'war',
];
const STEWARD_GRANTED: VillageRight[] = ['build', 'veto', 'steward', 'trade'];

async function world() {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const stewardships = new InMemoryStewardships();
  const holderHouse = await houses.create({ playerId: HOLDER, kind: 'player', createdAt: NOW });
  const stewardHouse = await houses.create({ playerId: STEWARD, kind: 'player', createdAt: NOW });
  const settlement = await settlements.seatAtOrigin({
    ownerId: HOLDER,
    landscapeSeed: 5,
    layerVersions: CURRENT_LAYER_VERSIONS,
  });
  const record = await villages.add(settlement.id, 'Ves držitele', village([]));
  await stewardships.start({
    villageId: record.id,
    stewardHouseId: stewardHouse.id,
    holderHouseId: holderHouse.id,
    kind: 'player',
    vassalageId: 'v-1',
    since: NOW,
  });
  const deps = { houses, settlements, villages, stewardships };
  return { deps, villageId: record.id, holderHouse, stewardHouse };
}

const ask = (
  w: Awaited<ReturnType<typeof world>>,
  playerId: string,
  right: VillageRight,
): Promise<unknown> =>
  requireRight(w.deps, { playerId, villageId: w.villageId, right, today: DAY });

describe('práva správce cizí vsi', () => {
  it('správce smí stavět, veto, správce vsi a obchod – ne vystěhovat, poslat syna, povyšovat, válčit', async () => {
    const w = await world();
    for (const right of STEWARD_GRANTED) {
      expect(await ask(w, STEWARD, right), right).toMatchObject({ village: { id: w.villageId } });
    }
    for (const right of STEWARD_DENIED)
      expect(await ask(w, STEWARD, right), right).toBe(STEWARD_ONLY);
  });

  it('držitel má ve vlastní vsi všechna práva', async () => {
    const w = await world();
    for (const right of ALL_RIGHTS) expect(typeof (await ask(w, HOLDER, right))).toBe('object');
  });

  it('každá akce nad vsí má právo; evacuate / sendSons / ennoble / war správci nepatří', () => {
    for (const right of Object.values(ACTION_RIGHTS)) expect(ALL_RIGHTS).toContain(right);
    expect(Object.values(ACTION_RIGHTS).filter((r) => STEWARD_DENIED.includes(r))).not.toHaveLength(
      0,
    );
  });

  it('cizí hráč bez správy dostane stejnou chybu jako u cizí vsi', async () => {
    const w = await world();
    expect(await ask(w, 'jiny', 'build')).toBe(NOT_PLAYER_VILLAGE);
  });

  it('po odvolání akce správce server odmítne bez prozrazení vsi', async () => {
    const w = await world();
    expect(await ask(w, STEWARD, 'build')).toMatchObject({ village: expect.anything() });
    expect(await dismissSteward(w.deps, { playerId: HOLDER, villageId: w.villageId })).toEqual({
      ok: true,
    });
    for (const right of [...STEWARD_GRANTED, ...STEWARD_DENIED]) {
      expect(await ask(w, STEWARD, right), right).toBe(NOT_PLAYER_VILLAGE);
    }
    expect(await w.deps.stewardships.listByStewardHouse(w.stewardHouse.id)).toEqual([]);
    // držitel dál jedná
    expect(await ask(w, HOLDER, 'evacuate')).toMatchObject({ village: expect.anything() });
  });

  it('odvolat smí jen držitel a jen existující správu', async () => {
    const w = await world();
    expect(await dismissSteward(w.deps, { playerId: STEWARD, villageId: w.villageId })).toEqual({
      ok: false,
      reason: NOT_HOLDER,
    });
    expect(await dismissSteward(w.deps, { playerId: HOLDER, villageId: w.villageId })).toEqual({
      ok: true,
    });
    expect(await dismissSteward(w.deps, { playerId: HOLDER, villageId: w.villageId })).toEqual({
      ok: false,
      reason: NO_STEWARD,
    });
  });

  it('zámek vsi je zámek držitele, ne správce (holderOf)', async () => {
    const w = await world();
    expect(await holderOf(w.deps, w.villageId)).toBe(HOLDER);
    expect(await holderOf(w.deps, w.villageId)).not.toBe(STEWARD);
  });

  it('akce správce jede pod zámkem držitele – zámek správce se nebere; po odvolání ani ten držitelův', async () => {
    const w = await world();
    const locked = (playerId: string): Promise<string> =>
      lockOwnerOf(w.deps, { playerId, villageId: w.villageId });
    expect(await locked(STEWARD)).toBe(HOLDER);
    expect(await locked(HOLDER)).toBe(HOLDER);
    expect(await locked('jiny')).toBe('jiny');
    await dismissSteward(w.deps, { playerId: HOLDER, villageId: w.villageId });
    expect(await locked(STEWARD)).toBe(STEWARD);
  });
});

/** Jednání: `village-a` patří rodu a (fixture); b je jeho nový vazal a správce. */
function withStewards(s: Setup): InMemoryStewardships {
  const stewards = new InMemoryStewardships();
  s.deps.negotiations = new InMemoryNegotiations(
    s.vassalages,
    s.notices,
    () => NOW,
    undefined,
    stewards,
  );
  return stewards;
}

describe('nabídka správy jednáním', () => {
  const offer = (s: Setup, villageId: string): ReturnType<typeof openNegotiation> =>
    openNegotiation(s.deps, {
      playerId: 'player-a',
      to: s.ids.b!,
      items: [
        { kind: 'oath', lord: s.ids.a!, vassal: s.ids.b! },
        { kind: 'stewardship', villageId },
      ],
      message: null,
      now: NOW,
      today: 10,
    });
  const accept = (s: Setup, id: string): ReturnType<typeof acceptNegotiation> =>
    acceptNegotiation(s.deps, { playerId: 'player-b', negotiationId: id, now: NOW, today: 10 });

  it('přijetí založí vazalství i správu navázanou na dohodu; vypovězení správu ukončí', async () => {
    const s = await setup();
    const stewards = withStewards(s);
    const opened = await offer(s, 'village-a');
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect((await accept(s, opened.negotiation.id)).ok).toBe(true);
    const agreement = s.vassalages.vassalages[0]!;
    expect(await stewards.of('village-a')).toMatchObject({
      stewardHouseId: s.ids.b,
      holderHouseId: s.ids.a,
      kind: 'player',
      vassalageId: agreement.id,
    });
    const renounced = await renounceVassalage(
      {
        houses: s.houses,
        vassalages: s.vassalages,
        notices: s.notices,
        villages: s.deps.villages,
        stewardships: stewards,
      },
      { playerId: 'player-b', vassalageId: agreement.id, message: null, now: NOW, today: 11 },
    );
    expect(renounced.ok).toBe(true);
    expect(await stewards.of('village-a')).toBeNull();
  });

  it('ves, kterou pán nedrží, nabídnout nejde', async () => {
    const s = await setup();
    withStewards(s);
    const r = await offer(s, 'village-b');
    expect(r).toEqual({ ok: false, reason: STEWARDSHIP_REASONS.badVillage });
  });

  it('ves s živým správcem znovu nabídnout nejde', async () => {
    const s = await setup();
    const stewards = withStewards(s);
    await stewards.start({
      villageId: 'village-a',
      stewardHouseId: s.ids.c!,
      holderHouseId: s.ids.a!,
      kind: 'player',
      vassalageId: null,
      since: NOW,
    });
    expect(await offer(s, 'village-a')).toEqual({ ok: false, reason: STEWARDSHIP_REASONS.taken });
  });

  it('souběh: ves dostala správce až po otevření jednání – přijetí se vrátí', async () => {
    const s = await setup();
    const stewards = withStewards(s);
    const opened = await offer(s, 'village-a');
    if (!opened.ok) throw new Error('nabídka');
    await stewards.start({
      villageId: 'village-a',
      stewardHouseId: s.ids.c!,
      holderHouseId: s.ids.a!,
      kind: 'player',
      vassalageId: null,
      since: NOW,
    });
    const r = await accept(s, opened.negotiation.id);
    expect(r.ok).toBe(false);
    expect((await stewards.of('village-a'))?.stewardHouseId).toBe(s.ids.c);
  });
});
