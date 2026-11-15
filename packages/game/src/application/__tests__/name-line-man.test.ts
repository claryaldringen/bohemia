import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { currentLord } from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement, type FoundVillageInput } from '../found-village';
import { nameLineManInVillage } from '../name-line-man';
import type { SeedSource } from '../settlements';
import { NO_VILLAGE } from '../update-village';
import { InMemoryVillages } from './in-memory-villages';

// Zakladatelé rodu a jména na serveru (lord.md – Zakladatelé, Jména; Martin 24. 10. 2026:
// „Vesnici zakládá vojvoda a jeho rodina.“, „Vojvoda vybírá jméno jen pro své syny.“).

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };
const input = (extra: Partial<FoundVillageInput> = {}): FoundVillageInput => ({
  settlementId: 'settlement-1',
  landscape,
  today: TODAY,
  name: 'Libice',
  dwelling: { x: -50, z: -50, rotation: 0 },
  ...extra,
});

describe('foundVillageForSettlement – zakladatelé rodu', () => {
  it('ves zakládá vojvoda s manželkami a syny – se jménem i bez něj', async () => {
    const named = await foundVillageForSettlement(
      { villages: new InMemoryVillages(), seeds },
      input({ lordName: ' Bořivoj ' }),
    );
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    // vojvoda, 4 manželky a 4 synové (lord.md – Zakladatelé)
    expect(named.village.state.people).toHaveLength(9);
    expect(currentLord(named.village.state)?.name).toBe('Bořivoj');
    const waiting = await foundVillageForSettlement(
      { villages: new InMemoryVillages(), seeds },
      input(),
    );
    expect(waiting.ok && currentLord(waiting.village.state)).toMatchObject({ id: 2, line: true });
    expect(waiting.ok && currentLord(waiting.village.state)?.name).toBeUndefined();
  });

  it('neplatné jméno vojvody odmítne – nic neuloží', async () => {
    const villages = new InMemoryVillages();
    const result = await foundVillageForSettlement(
      { villages, seeds },
      input({ lordName: 'Bořivoj II' }),
    );
    expect(result).toEqual({ ok: false, reason: 'Jen písmena.' });
    expect(villages.records.size).toBe(0);
  });
});

describe('nameLineManInVillage', () => {
  /** Ves rodu (vojvoda bez jména) se synem vojvody 50, který čeká na jméno. */
  async function withSon(): Promise<{ villages: InMemoryVillages; villageId: string }> {
    const villages = new InMemoryVillages();
    const founded = await foundVillageForSettlement({ villages, seeds }, input());
    if (!founded.ok) throw new Error(founded.reason);
    villages.edit(founded.village.id, (state) => {
      state.people.push({
        id: 50,
        bornDay: TODAY - 300,
        dwellingId: 1,
        sex: 'male',
        fatherId: 2,
        motherId: 3,
        line: true,
        mainWifeSon: true,
      });
      state.nextId = Math.max(state.nextId, 51);
    });
    return { villages, villageId: founded.village.id };
  }

  it('hráč pojmenuje syna vojvody – trvale, ves dopočítaná do dneška', async () => {
    const { villages, villageId } = await withSon();
    const deps = { villages };
    const base = { villageId, today: TODAY + 1, landscape };
    const named = await nameLineManInVillage(deps, { ...base, personId: 50, name: 'Mrdomír' });
    expect(named.ok).toBe(true);
    if (!named.ok) return;
    expect(named.village.state.lastDay).toBe(TODAY + 1);
    expect(named.village.state.people.find((p) => p.id === 50)?.name).toBe('Mrdomír');
    expect(named.village.state.chronicle.at(-1)).toMatchObject({
      kind: 'line-named',
      name: 'Mrdomír',
    });
    const again = await nameLineManInVillage(deps, { ...base, personId: 50, name: 'Bořivoj' });
    expect(again).toEqual({ ok: false, reason: 'Jméno už má – nejde ho změnit.' });
  });

  it('neplatné jméno, manželku nebo cizí ves odmítne', async () => {
    const { villages, villageId } = await withSon();
    const deps = { villages };
    const base = { villageId, today: TODAY + 1, landscape };
    expect(await nameLineManInVillage(deps, { ...base, personId: 50, name: 'Bořivoj1' })).toEqual({
      ok: false,
      reason: 'Jen písmena.',
    });
    expect(await nameLineManInVillage(deps, { ...base, personId: 3, name: 'Bořivoj' })).toEqual({
      ok: false,
      reason: 'Jméno dává vojvoda jen mužům rodu.',
    });
    expect(
      await nameLineManInVillage(deps, {
        ...base,
        villageId: 'village-x',
        personId: 50,
        name: 'Bořivoj',
      }),
    ).toEqual({ ok: false, reason: NO_VILLAGE });
  });
});
