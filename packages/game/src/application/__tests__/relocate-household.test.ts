import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { occupants, type Position, type VillageState } from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { loadVillage } from '../load-village';
import { NO_PLOT, NO_SETTLERS, placeDwelling } from '../place-dwelling';
import { RELOCATION_BLOCKED, relocateHousehold } from '../relocate-household';
import { VILLAGE_EXTINCT } from '../update-village';
import { InMemoryVillages } from './in-memory-villages';

// Přestěhování domácnosti (migration.md): use-case nad uloženou vsí (repozitář v paměti).

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();
const at = (x: number, z: number): Position => ({ x, z, rotation: 0 });
const HOME = at(-50, -50);
const NEW_HOME = at(60, 60);

/** Ves s dostavěnou zemnicí zakladatelů (4 lidé – nikdo k osídlení) a 30 kládami. */
async function settled(): Promise<{ villages: InMemoryVillages; villageId: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 4242 } },
    { settlementId: 'settlement-1', landscape, today: TODAY, name: 'Libice', dwelling: HOME },
  );
  if (!founded.ok) throw new Error(founded.reason);
  villages.edit(founded.village.id, (state) => {
    Object.assign(state, withBuiltFirstDwelling(state));
    state.woodLogs = 30;
  });
  return { villages, villageId: founded.village.id };
}

const homeId = (state: VillageState): number => state.dwellings[0]!.id;

describe('relocateHousehold', () => {
  it('nový dům jde postavit i bez lidí k osídlení – běžné obydlí ne', async () => {
    const { villages, villageId } = await settled();
    const base = { villageId, landscape, today: TODAY + 1 };
    const dwelling = await placeDwelling(
      { villages },
      { ...base, type: 'zemnice', position: NEW_HOME },
    );
    expect(dwelling).toEqual({ ok: false, reason: NO_SETTLERS });
    const before = (await villages.find(villageId))!.state;
    const result = await relocateHousehold(
      { villages },
      { ...base, dwellingId: homeId(before), type: 'zemnice', position: NEW_HOME },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = result.village.state.constructions.find((c) => c.relocates !== undefined);
    expect(site).toMatchObject({
      kind: 'dwelling',
      dwellingType: 'zemnice',
      position: NEW_HOME,
      relocates: homeId(before),
    });
    expect(result.village.state.woodLogs).toBeLessThan(30);
  });

  it('server umístění a domácnost ověří znovu', async () => {
    const { villages, villageId } = await settled();
    const base = { villageId, landscape, today: TODAY + 1 };
    const id = homeId((await villages.find(villageId))!.state);
    // přes vlastní dům ani do vody nejde, polozemnice bez pozemku také ne
    const overlap = await relocateHousehold(
      { villages },
      { ...base, dwellingId: id, type: 'zemnice', position: HOME },
    );
    expect(overlap.ok).toBe(false);
    expect(
      await relocateHousehold(
        { villages },
        { ...base, dwellingId: id, type: 'polozemnice', position: NEW_HOME },
      ),
    ).toEqual({ ok: false, reason: NO_PLOT });
    expect(
      await relocateHousehold(
        { villages },
        { ...base, dwellingId: 999, type: 'zemnice', position: NEW_HOME },
      ),
    ).toEqual({ ok: false, reason: RELOCATION_BLOCKED['no-household'] });
    const first = await relocateHousehold(
      { villages },
      { ...base, dwellingId: id, type: 'zemnice', position: NEW_HOME },
    );
    expect(first.ok).toBe(true);
    const second = await relocateHousehold(
      { villages },
      { ...base, dwellingId: id, type: 'zemnice', position: at(60, -60) },
    );
    expect(second).toEqual({ ok: false, reason: RELOCATION_BLOCKED.relocating });
  });

  it('polozemnice na pozemku stojí podle pozemku', async () => {
    const { villages, villageId } = await settled();
    const id = homeId((await villages.find(villageId))!.state);
    const result = await relocateHousehold(
      { villages },
      {
        villageId,
        landscape,
        today: TODAY + 1,
        dwellingId: id,
        type: 'polozemnice',
        position: at(0, 0),
        plot: { cell: { x: 11, y: 11 }, variant: 'center' },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = result.village.state.constructions.at(-1)!;
    expect(site.plot).toEqual({ cell: { x: 11, y: 11 }, variant: 'center' });
    expect(site.position).not.toEqual(at(0, 0));
  });

  it('po dostavění bydlí domácnost v novém domě a starý je prázdný', async () => {
    const { villages, villageId } = await settled();
    const id = homeId((await villages.find(villageId))!.state);
    const started = await relocateHousehold(
      { villages },
      {
        villageId,
        landscape,
        today: TODAY + 1,
        dwellingId: id,
        type: 'zemnice',
        position: NEW_HOME,
      },
    );
    if (!started.ok) throw new Error(started.reason);
    const later = await loadVillage({ villages }, { villageId, today: TODAY + 400, landscape });
    const state = later!.state;
    expect(state.constructions.some((c) => c.relocates !== undefined)).toBe(false);
    const fresh = state.dwellings.find((d) => d.position.x === NEW_HOME.x);
    expect(fresh).toBeDefined();
    expect(occupants(state, fresh!.id).length).toBeGreaterThan(0);
    expect(occupants(state, id)).toEqual([]);
    expect(state.chronicle.some((e) => e.kind === 'household-relocated')).toBe(true);
  });

  it('ve vymřelé vsi nejde', async () => {
    const { villages, villageId } = await settled();
    const id = homeId((await villages.find(villageId))!.state);
    villages.edit(villageId, (state) => (state.people = []));
    const result = await relocateHousehold(
      { villages },
      {
        villageId,
        landscape,
        today: TODAY + 2,
        dwellingId: id,
        type: 'zemnice',
        position: NEW_HOME,
      },
    );
    expect(result).toEqual({ ok: false, reason: VILLAGE_EXTINCT });
  });
});
