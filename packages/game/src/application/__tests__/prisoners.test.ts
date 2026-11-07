import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { applyInboxDay } from '../../domain/village/inbox';
import type { VillageState } from '../../domain/village';
import { DAY, bundle, sender } from '../../domain/vassalage/__tests__/shipment-fixtures';
import { decidePrisoner, ransomHooks, type PrisonerDeps, type RansomDeps } from '../prisoners';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryPlayerLock } from './in-memory-locks';
import { InMemoryPrisoners } from './in-memory-prisoners';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryShipments } from './in-memory-shipments';
import { InMemoryVillages } from './in-memory-villages';

// Zajatci (war.md – Vzdaní, zajetí a výkupné; plán 2026-11-03 – Úloha 6.11): rozhodnutí věznitele,
// výkupné a mír. Věznitel = hráč `a` (ves Dub), zajatec je hráčův muž rodu `c` (ves Lhota,
// vzdálená 3 mapy) – ves Lhota ho dál řídí formální správce.

const NOW = new Date('2026-11-05T12:00:00Z');
const PRISONER = 'c1:38';
const TODAY = DAY + 20;

async function world(): Promise<{
  deps: RansomDeps;
  villages: InMemoryVillages;
  prisoners: InMemoryPrisoners;
  captorId: string;
  homeId: string;
  houseA: string;
  houseC: string;
}> {
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const prisoners = new InMemoryPrisoners();
  const houses = new InMemoryHouses();
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
  const captorId = (await villages.add(sa.id, 'Dub', sender())).id;
  const homeId = (await villages.add(sc.id, 'Lhota', sender())).id;
  // upravuje se uložený stav (add ho kopíruje)
  const captor = villages.records.get(captorId)!;
  const home = villages.records.get(homeId)!;
  // zajatec: muž 38 z Lhoty, držený v Dubu
  captor.state.prisoners = [
    {
      id: PRISONER,
      ref: { villageId: home.id, personId: 38 },
      name: 'Ctibor',
      sinceDay: DAY + 10,
    },
  ];
  const man = home.state.people.find((p) => p.id === 38)!;
  man.line = true;
  man.away = { kind: 'captive', hostVillageId: captor.id, refId: PRISONER };
  man.name = 'Ctibor';
  const ha = await houses.create({ playerId: 'player-a', kind: 'player', createdAt: NOW });
  await houses.setLord(ha.id, { villageId: captor.id, personId: 900 });
  const hc = await houses.create({ playerId: 'player-c', kind: 'player', createdAt: NOW });
  await houses.setLord(hc.id, { villageId: home.id, personId: 38 });
  const deps: RansomDeps = {
    prisoners,
    villages,
    settlements,
    locks,
    now: () => NOW,
    houses,
    shipments: { shipments: new InMemoryShipments(), villages, settlements, locks, now: () => NOW },
    prepareVillage: () => Promise.resolve(null),
  };
  return {
    deps,
    villages,
    prisoners,
    captorId: captor.id,
    homeId: home.id,
    houseA: ha.id,
    houseC: hc.id,
  };
}

/** Použije události schránky vsi do dne `toDay` (jako dopočet) a vrátí stav. */
async function atDay(
  w: Awaited<ReturnType<typeof world>>,
  id: string,
  toDay: number,
): Promise<VillageState> {
  const record = (await w.villages.find(id))!;
  const events = await w.villages.inbox.pending(id, record.state.lastDay, toDay);
  const state = structuredClone(record.state);
  for (let day = state.lastDay + 1; day <= toDay; day++) {
    state.chronicle.push(...applyInboxDay(state, day, events));
  }
  return state;
}

const decision = (deps: PrisonerDeps, action: 'hold' | 'release' | 'execute') =>
  decidePrisoner(deps, { playerId: 'player-a', prisonerId: PRISONER, action, today: TODAY });

describe('rozhodnutí o zajatci', () => {
  it('propuštěný dojde domů za 2 × vzdálenost dní a věznitel ho přestane živit', async () => {
    const w = await world();
    expect(await decision(w.deps, 'release')).toEqual({ ok: true });
    const captor = await atDay(w, w.captorId, TODAY + 1);
    expect(captor.prisoners).toBeUndefined();
    // vzdálenost 3 map = 6 dní: den před příchodem je ještě v zajetí, v den příchodu doma
    const before = await atDay(w, w.homeId, TODAY + 5);
    expect(before.people.find((p) => p.id === 38)?.away?.kind).toBe('captive');
    const after = await atDay(w, w.homeId, TODAY + 6);
    expect(after.people.find((p) => p.id === 38)?.away).toBeUndefined();
  });

  it('poprava zabije muže rodu (nástupnictví jako po každém padlém)', async () => {
    const w = await world();
    expect(await decision(w.deps, 'execute')).toEqual({ ok: true });
    const home = await atDay(w, w.homeId, TODAY + 1);
    expect(home.people.some((p) => p.id === 38)).toBe(false);
    expect(home.chronicle.some((e) => e.kind === 'death' && e.personId === 38)).toBe(true);
    expect((await atDay(w, w.captorId, TODAY + 1)).prisoners).toBeUndefined();
  });

  it('držet nic nemění; druhé rozhodnutí o témž zajatci neprojde', async () => {
    const w = await world();
    expect(await decision(w.deps, 'hold')).toEqual({ ok: true });
    expect(w.prisoners.records.size).toBe(0);
    const results = await Promise.all([decision(w.deps, 'release'), decision(w.deps, 'execute')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(w.prisoners.records.size).toBe(1);
  });

  it('cizí zajatec nepatří věznitelově vsi', async () => {
    const w = await world();
    const res = await decidePrisoner(w.deps, {
      playerId: 'player-c',
      prisonerId: PRISONER,
      action: 'release',
      today: TODAY,
    });
    expect(res.ok).toBe(false);
  });
});

describe('výkupné a mír', () => {
  it('výkupné jednáním: po zaplacení propuštění', async () => {
    const w = await world();
    const hooks = ransomHooks(w.deps);
    const line = {
      kind: 'ransom' as const,
      prisonerIds: [PRISONER],
      price: bundle({ grainKg: 300 }),
    };
    const checked = await hooks.check([w.houseA, w.houseC], line);
    expect(checked).toEqual({ ok: true, captorHouseId: w.houseA });
    const failed = await hooks.apply({
      line,
      captorHouseId: w.houseA,
      payerHouseId: w.houseC,
      negotiationId: 'n1',
      now: NOW,
      today: TODAY,
    });
    expect(failed).toBeNull();
    expect(w.prisoners.records.get(PRISONER)?.decision).toBe('ransomed');
    const after = await atDay(w, w.homeId, TODAY + 6);
    expect(after.people.find((p) => p.id === 38)?.away).toBeUndefined();
    // druhé výkupné za téhož zajatce neprojde
    const again = await hooks.check([w.houseA, w.houseC], line);
    expect(again.ok).toBe(true);
    expect(w.prisoners.records.size).toBe(1);
  });

  it('nezaplacené výkupné (chybí zboží) zajatce nepropustí', async () => {
    const w = await world();
    const hooks = ransomHooks(w.deps);
    const failed = await hooks.apply({
      line: { kind: 'ransom', prisonerIds: [PRISONER], price: bundle({ grainKg: 900_000 }) },
      captorHouseId: w.houseA,
      payerHouseId: w.houseC,
      negotiationId: 'n2',
      now: NOW,
      today: TODAY,
    });
    expect(failed).not.toBeNull();
    expect(w.prisoners.records.size).toBe(0);
  });

  it('zajatce, kterého nikdo z dvojice nedrží, výkupné odmítne', async () => {
    const w = await world();
    const hooks = ransomHooks(w.deps);
    const res = await hooks.check([w.houseA, w.houseC], {
      kind: 'ransom',
      prisonerIds: ['jiny:1'],
      price: bundle({ grainKg: 1 }),
    });
    expect(res.ok).toBe(false);
  });

  it('mír s propuštěním zajatců je pošle domů bez platby', async () => {
    const w = await world();
    const hooks = ransomHooks(w.deps);
    await hooks.release({
      prisonerIds: [PRISONER],
      parties: [w.houseA, w.houseC],
      negotiationId: 'n3',
      now: NOW,
      today: TODAY,
    });
    expect(w.prisoners.records.get(PRISONER)?.decision).toBe('released');
    const after = await atDay(w, w.homeId, TODAY + 6);
    expect(after.people.find((p) => p.id === 38)?.away).toBeUndefined();
  });
});
