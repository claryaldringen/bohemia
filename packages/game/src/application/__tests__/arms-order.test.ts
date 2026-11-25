import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import {
  ARMS_BAD_ORDER,
  ARMS_NO_MERCHANTS,
  nextMerchantVisit,
  type ArmsGood,
  type MerchantStop,
  type VillageState,
} from '../../domain/village';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { orderArms } from '../arms-order';
import { foundVillageForSettlement } from '../found-village';
import { ACTION_RIGHTS } from '../rights';
import {
  updateVillage,
  VILLAGE_ABANDONED,
  VILLAGE_EXTINCT,
  VILLAGE_TRAVELLING,
} from '../update-village';
import type { VillageResult } from '../villages';
import { InMemoryVillages } from './in-memory-villages';

// Objednávka zbroje u cizích kupců (markets.md – Rozhodnutí plánu 4, bod 15; Martin 25. 11. 2026:
// „Hráč zadá počet“): akce hráče zapíše do vsi u stezky, kolik jí kupci mají přivézt – za mince ji ves
// koupí až v den kupců (trade/arms-order.ts).

const STOP: MerchantStop = { key: '0,0,E', seed: 7, index: 0, length: 1 };
const landscape = makeLandscape({ size: 48 });
/** První a druhý příjezd kupců po 12. 4. 503. */
const VISIT = nextMerchantVisit([STOP], dayIndexOf({ year: 503, month: 4, day: 12 }))!.day;
const NEXT_VISIT = nextMerchantVisit([STOP], VISIT + 1)!.day;
const TODAY = VISIT - 1;

/**
 * Ves sídla `settlement-1` u stezky den před příjezdem kupců s 500 mincemi, převody načtení má za
 * sebou; `change` ji upraví.
 */
async function village(
  change: (state: VillageState) => void = () => {},
): Promise<{ villages: InMemoryVillages; id: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds: { nextSeed: () => 4242 } },
    {
      settlementId: 'settlement-1',
      landscape,
      today: TODAY,
      name: 'Libice',
      dwelling: { x: 0, z: 0, rotation: 0 },
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  const { id } = founded.village;
  await load(villages, id, TODAY);
  const { state } = villages.records.get(id)!;
  state.merchantStops = [{ ...STOP }];
  state.coins = 500;
  change(state);
  return { villages, id };
}

/** Načtení vsi bez změny hráče. */
async function load(villages: InMemoryVillages, id: string, day: number): Promise<VillageState> {
  const result = await updateVillage(villages, id, day, landscape, (state) => ({
    ok: true,
    state,
  }));
  if (!result.ok) throw new Error(result.reason);
  return result.village.state;
}

const stored = (villages: InMemoryVillages, id: string): VillageState =>
  structuredClone(villages.records.get(id)!.state);

/** Hráč objedná `amount` kusů `good` v den `today`. */
function order(
  world: { villages: InMemoryVillages; id: string },
  good: ArmsGood,
  amount: number,
  today = TODAY,
): Promise<VillageResult> {
  return orderArms(
    { villages: world.villages },
    { villageId: world.id, good, amount, today, landscape },
  );
}

describe('objednávka zbroje (orderArms)', () => {
  it('2 meče: zapíše se objednávka, mince, zásoby ani nic jiného se nezmění', async () => {
    const w = await village();
    const before = stored(w.villages, w.id);
    const result = await order(w, 'swords', 2);
    if (!result.ok) throw new Error(result.reason);
    expect(result.village.state).toStrictEqual({ ...before, armsOrder: { swords: 2 } });
    expect(stored(w.villages, w.id)).toStrictEqual({ ...before, armsOrder: { swords: 2 } });
    expect(result.village.state.coins).toBe(500);
  });

  it('nový počet přepíše starý, 0 položku smaže a prázdná objednávka zmizí celá', async () => {
    const w = await village();
    const before = stored(w.villages, w.id);
    await order(w, 'swords', 2);
    await order(w, 'mailShirts', 1);
    expect(stored(w.villages, w.id).armsOrder).toStrictEqual({ swords: 2, mailShirts: 1 });
    await order(w, 'swords', 7);
    expect(stored(w.villages, w.id).armsOrder).toStrictEqual({ swords: 7, mailShirts: 1 });
    await order(w, 'swords', 0);
    expect(stored(w.villages, w.id).armsOrder).toStrictEqual({ mailShirts: 1 });
    expect((await order(w, 'mailShirts', 0)).ok).toBe(true);
    expect(stored(w.villages, w.id)).toStrictEqual(before);
    expect(stored(w.villages, w.id)).not.toHaveProperty('armsOrder');
  });

  it.each([1.5, -1, NaN, Infinity])('%s kusů odmítne a stav nezmění', async (amount) => {
    const w = await village((s) => (s.armsOrder = { helmets: 1 }));
    const before = stored(w.villages, w.id);
    const { saves } = w.villages;
    expect(await order(w, 'swords', amount)).toEqual({ ok: false, reason: ARMS_BAD_ORDER });
    expect(stored(w.villages, w.id)).toStrictEqual(before);
    expect(w.villages.saves).toBe(saves);
  });

  it.each([
    ['bez zastávek', (s: VillageState) => delete s.merchantStops],
    ['s prázdnými zastávkami', (s: VillageState) => (s.merchantStops = [])],
  ])('ves %s: cizí kupci do ní nejezdí', async (_name, change) => {
    const w = await village(change);
    const before = stored(w.villages, w.id);
    expect(await order(w, 'swords', 2)).toEqual({ ok: false, reason: ARMS_NO_MERCHANTS });
    expect(stored(w.villages, w.id)).toStrictEqual(before);
  });

  it('ves, které zastávky dá teprve načtení, objedná hned', async () => {
    const w = await village((s) => delete s.merchantStops);
    w.villages.merchantStopsOf = async () => {
      await Promise.resolve();
      return [STOP];
    };
    const result = await order(w, 'swords', 2);
    if (!result.ok) throw new Error(result.reason);
    expect(result.village.state).toMatchObject({ merchantStops: [STOP], armsOrder: { swords: 2 } });
  });

  it.each([
    ['vymřelá', { extinctDay: TODAY - 5 }, VILLAGE_EXTINCT],
    ['opuštěná', { abandonedDay: TODAY - 5 }, VILLAGE_ABANDONED],
    [
      'na cestě',
      { journey: { direction: 'E', departedDay: TODAY - 5, arrivalDay: TODAY + 500 } as const },
      VILLAGE_TRAVELLING,
    ],
  ])('%s ves neobjedná nic', async (_name, fields, reason) => {
    const w = await village((s) => Object.assign(s, fields));
    expect(await order(w, 'swords', 2)).toEqual({ ok: false, reason });
    expect(stored(w.villages, w.id)).not.toHaveProperty('armsOrder');
  });

  it('ves se napřed dopočítá do dneška – kupcům, kteří už přijeli, nic neobjedná, dalším ano', async () => {
    const w = await village();
    const result = await order(w, 'swords', 2, VISIT);
    if (!result.ok) throw new Error(result.reason);
    const { state } = result.village;
    expect(state.lastDay).toBe(VISIT);
    expect(state.chronicle.filter((e) => e.kind === 'merchants-arrived')).toHaveLength(1);
    expect(state).not.toHaveProperty('arms');
    expect(state).toMatchObject({ coins: 500, armsOrder: { swords: 2 } });
    expect(await load(w.villages, w.id, NEXT_VISIT - 1)).not.toHaveProperty('arms');
    const later = await load(w.villages, w.id, NEXT_VISIT);
    expect(later.arms).toStrictEqual({ swords: 2 });
    expect(later.coins).toBe(260);
    expect(later).not.toHaveProperty('armsOrder');
  });

  it('právo je obchod vsi – má ho i správce cizí vsi', () => {
    expect(ACTION_RIGHTS.orderArms).toBe('trade');
  });
});
