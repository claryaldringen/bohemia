import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { revealedWeather } from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { DEV_DISASTERS_ONLY, forceBadYear, forceDisaster } from '../dev-disasters';
import { foundVillageForSettlement } from '../found-village';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

// Vývojový režim – vynucený zlý rok a pohroma (disasters.md – plán P10).

const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };
const FOUNDED = dayIndexOf({ year: 503, month: 4, day: 12 });

async function setup(): Promise<{ villages: InMemoryVillages; villageId: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds },
    {
      settlementId: 'settlement-1',
      landscape,
      today: FOUNDED,
      name: 'Libice',
      dwelling: { x: -50, z: -50, rotation: 0 },
      lordName: 'Bořivoj',
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  return { villages, villageId: founded.village.id };
}

describe('forceBadYear / forceDisaster', () => {
  it('bez vývojového režimu odmítne a nic neuloží', async () => {
    const { villages, villageId } = await setup();
    const saves = villages.saves;
    const input = { villageId, devMode: false, today: FOUNDED, landscape };
    expect(await forceBadYear({ villages }, { ...input, kind: 'drought' })).toEqual({
      ok: false,
      reason: DEV_DISASTERS_ONLY,
    });
    expect(await forceDisaster({ villages }, { ...input, kind: 'fire' })).toEqual({
      ok: false,
      reason: DEV_DISASTERS_ONLY,
    });
    expect(villages.saves).toBe(saves);
  });

  it('kruté sucho letos – vidět až od 1. 5.', async () => {
    const { villages, villageId } = await setup();
    const result = await forceBadYear(
      { villages },
      { villageId, devMode: true, today: FOUNDED, landscape, kind: 'drought' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.village.state;
    expect(state.disasters?.override?.weather?.[503]).toEqual({ summer: 'drought' });
    const april = dayIndexOf({ year: 503, month: 4, day: 30 });
    expect(revealedWeather(state, april).summer).toBeUndefined();
    expect(revealedWeather(state, april + 2).summer).toBe('drought');
  });

  it('zítřejší požár, kroupy, smršť a stoletá voda zapíše do override', async () => {
    const { villages, villageId } = await setup();
    const input = { villageId, devMode: true, today: FOUNDED, landscape };
    await forceDisaster({ villages }, { ...input, kind: 'fire' });
    await forceDisaster({ villages }, { ...input, kind: 'hail' });
    await forceDisaster({ villages }, { ...input, kind: 'tornado' });
    const result = await forceDisaster({ villages }, { ...input, kind: 'flood' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { override } = result.village.state.disasters ?? {};
    const tomorrow = FOUNDED + 1;
    expect(override?.fire?.[tomorrow]).toBe(result.village.state.dwellings[0]?.id);
    expect(override?.hail?.[tomorrow]).toBeDefined();
    expect(override?.tornado?.[tomorrow]?.strength).toBe('F2');
    expect(override?.weather?.[503]?.flood).toMatchObject({ level: 'hundred', month: 4, day: 13 });
  });
});
