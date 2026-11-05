import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { VillageState } from '../../domain/village';
import { DAY, trackedVillage, type KinSpec } from '../../domain/village/__tests__/kin-fixtures';
import { resolvePlayerSuccession } from '../player-succession';
import { InMemoryCredits } from './in-memory-credits';
import { InMemoryHouses } from './in-memory-houses';
import { InMemoryNotices } from './in-memory-notices';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Nástupnictví hráče (seniorate.md – Nástupnictví hráče): los, kredit místo losu, ves bez muže rodu.

const PLAYER = 'hrac-1';

const SONS: KinSpec[] = [
  { id: 11, age: 50, sex: 'female' },
  { id: 20, age: 30, sex: 'male', father: 10, mother: 11 },
  { id: 21, age: 20, sex: 'male', father: 10, mother: 11 },
  { id: 22, age: 10, sex: 'male', father: 10, mother: 11 },
];

/** Ves po smrti vojvody 10 (den smrti `DAY`); nový vojvoda je nejstarší syn, je-li ve vsi. */
function afterDeath(specs: KinSpec[], seed = 1): VillageState {
  const s = trackedVillage(specs);
  s.seed = seed;
  s.lastDay = DAY + 40;
  const old = s.dynasty!.lords[0]!;
  old.toDay = DAY;
  old.name = 'Bořivoj';
  const heir = s.people.find((p) => p.sex === 'male' && p.fatherId === 10);
  if (heir) {
    heir.name = 'Ctibor';
    s.dynasty!.lordId = heir.id;
    s.dynasty!.lords.push({ id: heir.id, name: 'Ctibor', fromDay: DAY });
  } else {
    s.dynasty!.lordId = null;
  }
  return s;
}

/** Ves se živým vojvodou `id` (věk `age`) a případně dalším mužem rodu `extra`. */
function ruled(id: number, age: number, extra: KinSpec[] = []): VillageState {
  const s = trackedVillage([{ id: 10, age: 30, sex: 'male' }, ...extra]);
  const lord = s.people.find((p) => p.id === 10)!;
  lord.id = id;
  lord.bornDay = DAY - Math.ceil((age + 0.5) * 365.25);
  s.dynasty = { lordId: id, lords: [{ id, fromDay: DAY }] };
  return s;
}

async function world(states: VillageState[], credits = 0) {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const notices = new InMemoryNotices();
  const successionCredits = new InMemoryCredits();
  const house = await houses.create({ playerId: PLAYER, kind: 'player', createdAt: new Date(0) });
  const ids: string[] = [];
  for (const [i, state] of states.entries()) {
    const settlement =
      i === 0
        ? await settlements.seatAtOrigin({
            ownerId: PLAYER,
            landscapeSeed: 11,
            layerVersions: CURRENT_LAYER_VERSIONS,
          })
        : (await settlements.create({
            ownerId: PLAYER,
            landscapeSeed: 11 + i,
            layerVersions: CURRENT_LAYER_VERSIONS,
            worldCell: { x: i, y: 0 },
          }))!;
    ids.push((await villages.add(settlement.id, `V${i}`, state)).id);
  }
  await houses.setLord(house.id, { villageId: ids[0]!, personId: 10 });
  for (let i = 0; i < credits; i++) await successionCredits.grantOnce(PLAYER, `p${i}`, new Date(0));
  return { deps: { houses, settlements, villages, notices, successionCredits }, ids, house };
}

const resolve = (w: Awaited<ReturnType<typeof world>>, today = DAY + 40) =>
  resolvePlayerSuccession(w.deps, { playerId: PLAYER, today });

describe('resolvePlayerSuccession', () => {
  it('muž žije – nic se neděje', async () => {
    const w = await world([ruled(10, 40)]);
    expect(await resolve(w)).toEqual({ kind: 'alive' });
    expect(w.deps.notices.notices).toHaveLength(0);
  });

  it('jediný kandidát: nástupce, kredit se nespotřebuje, upozornění se jmény', async () => {
    const w = await world([afterDeath([SONS[0]!, SONS[1]!, SONS[3]!])], 1);
    const out = await resolve(w);
    expect(out).toEqual({ kind: 'successor', lord: { villageId: w.ids[0], personId: 20 } });
    expect(await w.deps.successionCredits.unused(PLAYER)).toBe(1);
    expect(w.deps.notices.notices[0]?.kind).toBe('player-succession');
    expect(w.deps.notices.notices[0]?.payload).toEqual({ deadName: 'Bořivoj', newName: 'Ctibor' });
  });

  it('los s kreditem: nástupce a kredit se spotřebuje jen jednou (opakované volání)', async () => {
    const w = await world([afterDeath(SONS)], 2);
    const first = await resolve(w);
    expect(first).toEqual({ kind: 'successor', lord: { villageId: w.ids[0], personId: 20 } });
    expect(await w.deps.successionCredits.unused(PLAYER)).toBe(1);
    expect(await resolve(w)).toEqual({ kind: 'alive' });
    expect(await resolve(w)).toEqual({ kind: 'alive' });
    expect(await w.deps.successionCredits.unused(PLAYER)).toBe(1);
    expect(w.deps.notices.notices).toHaveLength(1);
  });

  it('souběh dvou volání: rozhodne a upozorní jedno, kredit jednou', async () => {
    const w = await world([afterDeath(SONS)], 2);
    const [a, b] = await Promise.all([resolve(w), resolve(w)]);
    expect([a.kind, b.kind].sort()).toEqual(['alive', 'successor']);
    expect(await w.deps.successionCredits.unused(PLAYER)).toBe(1);
    expect(w.deps.notices.notices).toHaveLength(1);
  });

  it('los bez kreditu: nástupce, nebo mladší syn s termínem odchodu; hráč se přepne', async () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const w = await world([afterDeath(SONS, seed)]);
      const out = await resolve(w);
      kinds.add(out.kind);
      if (out.kind === 'younger-son') {
        expect(out.lord).toEqual({ villageId: w.ids[0], personId: 21 });
        expect(out.deadlineDay).toBe(DAY + 30);
        expect(w.house.pendingDeparture).toEqual({
          villageId: w.ids[0],
          sonId: 21,
          deathDay: DAY,
          deadlineDay: DAY + 30,
        });
      } else {
        expect(out.kind).toBe('successor');
        expect(w.house.pendingDeparture).toBeNull();
      }
      expect(w.house.lord).toEqual(out.kind === 'alive' || out.kind === 'none' ? null : out.lord);
      expect(w.house.successionDay).toBe(DAY);
    }
    expect(kinds).toEqual(new Set(['successor', 'younger-son']));
  });

  it('výsledek losu nezávisí na tom, kdy se ves dopočte (dnešek 1 / 5 / 40 dní po smrti)', async () => {
    for (let seed = 1; seed <= 15; seed++) {
      const results: string[] = [];
      for (const delay of [1, 5, 40]) {
        const w = await world([afterDeath(SONS, seed)]);
        results.push(JSON.stringify(await resolve(w, DAY + delay)));
      }
      expect(new Set(results).size).toBe(1);
    }
  });

  it('los po smrti mladšího syna bere den smrti z kroniky, ne z doby dopočtu', async () => {
    const specs: KinSpec[] = [
      { id: 11, age: 50, sex: 'female' },
      { id: 20, age: 40, sex: 'male', father: 10, mother: 11 },
      { id: 23, age: 25, sex: 'male', father: 10, mother: 11 },
    ];
    for (let seed = 1; seed <= 15; seed++) {
      const results: string[] = [];
      for (const delay of [11, 20, 40]) {
        const state = afterDeath(specs, seed);
        state.chronicle.push({
          day: DAY + 10,
          kind: 'death',
          group: 'adult',
          name: 'Mladší',
          personId: 21,
        });
        const w = await world([state]);
        await w.deps.houses.setLord(w.house.id, { villageId: w.ids[0]!, personId: 21 });
        results.push(JSON.stringify(await resolve(w, DAY + delay)));
        expect(w.house.successionDay).toBe(DAY + 10);
      }
      expect(new Set(results).size).toBe(1);
    }
  });

  it('bez nástupce: senior rodu, je-li vojvodou', async () => {
    const w = await world([afterDeath([SONS[0]!]), ruled(50, 50), ruled(60, 35)]);
    expect(await resolve(w)).toEqual({
      kind: 'senior',
      lord: { villageId: w.ids[1], personId: 50 },
    });
    expect(w.house.lord).toEqual({ villageId: w.ids[1], personId: 50 });
  });

  it('bez nástupce: senior není vojvodou – nejstarší vojvoda rodu', async () => {
    const elder: KinSpec = { id: 70, age: 70, sex: 'male', father: 10 };
    const w = await world([afterDeath([SONS[0]!]), ruled(50, 40, [elder]), ruled(60, 45)]);
    expect(await resolve(w)).toEqual({
      kind: 'oldest-lord',
      lord: { villageId: w.ids[2], personId: 60 },
    });
  });

  it('nikdo z rodu nežije: none, nic se nezapíše', async () => {
    const w = await world([afterDeath([SONS[0]!])]);
    expect(await resolve(w)).toEqual({ kind: 'none' });
    expect(w.house.successionDay).toBeNull();
    expect(w.deps.notices.notices).toHaveLength(0);
  });
});
