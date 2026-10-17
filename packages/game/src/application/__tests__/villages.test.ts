import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { advanceVillage, type Position, type VillageState } from '../../domain/village';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement, type FoundVillageInput } from '../found-village';
import { loadVillage } from '../load-village';
import { CANNOT_BUILD_DWELLING, placeDwelling } from '../place-dwelling';
import { placeCemetery } from '../place-cemetery';
import { placeField } from '../place-field';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const YEAR = 365.25;
const ID = 'settlement-1';
const landscape = makeLandscape({ surface: (x) => (x === 15 ? 'water' : 'meadow') });
const at = (x: number, z: number, rotation = 0): Position => ({ x, z, rotation });
const seeds: SeedSource = { nextSeed: () => 4242 };

const foundingInput = (overrides: Partial<FoundVillageInput> = {}): FoundVillageInput => ({
  settlementId: ID,
  landscape,
  today: TODAY,
  name: '  Libice ',
  dwelling: at(-50, -50),
  // čtverce x, y 6–9 = svět −30 … 30 m v obou osách
  fieldCells: block(6, 6, 4, 4),
  ...overrides,
});

async function foundedVillages(): Promise<InMemoryVillages> {
  const villages = new InMemoryVillages();
  const result = await foundVillageForSettlement({ villages, seeds }, foundingInput());
  if (!result.ok) throw new Error(result.reason);
  return villages;
}

/** Domácnost plná dospělých (6 lidí, z toho 6 dospělých) – smí stavět nové obydlí. */
function makeFullHousehold(state: VillageState): void {
  const day = state.lastDay;
  state.people.forEach((p) => (p.bornDay = Math.min(p.bornDay, day - Math.ceil(16 * YEAR))));
  for (const [i, age] of [20, 22].entries()) {
    state.people.push({ id: 900 + i, bornDay: day - Math.ceil(age * YEAR), dwellingId: 1 });
  }
}

describe('foundVillageForSettlement', () => {
  it('založí ves se zemnicí a polem, dopočítanou do dneška', async () => {
    const villages = new InMemoryVillages();
    const result = await foundVillageForSettlement({ villages, seeds }, foundingInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { village } = result;
    expect(village).toMatchObject({ settlementId: ID, name: 'Libice', version: 1 });
    expect(village.state.seed).toBe(4242);
    expect(village.state.lastDay).toBe(TODAY);
    expect(village.state.dwellings).toHaveLength(1);
    expect(village.state.dwellings[0]?.position).toEqual(at(-50, -50));
    expect(village.state.fields).toHaveLength(1);
    expect(village.state.parts).toHaveLength(16);
    expect(village.state.parts.every((p) => p.cell !== undefined)).toBe(true);
    expect(village.state.chronicle[0]).toEqual({ day: TODAY, kind: 'village-founded' });
  });

  it('druhé založení odmítne a ves nezmění', async () => {
    const villages = await foundedVillages();
    const again = await foundVillageForSettlement(
      { villages, seeds },
      foundingInput({ name: 'Jiná' }),
    );
    expect(again).toEqual({ ok: false, reason: 'Ves už je založená.' });
    expect(villages.records.get(ID)?.name).toBe('Libice');
  });

  it('souběžná založení vytvoří jedinou ves', async () => {
    const villages = new InMemoryVillages();
    const results = await Promise.all(
      [1, 2, 3].map(() => foundVillageForSettlement({ villages, seeds }, foundingInput())),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(villages.records.size).toBe(1);
  });

  it('odmítne prázdné jméno, zemnici ve vodě i pole přes zemnici – nic neuloží', async () => {
    const villages = new InMemoryVillages();
    const deps = { villages, seeds };
    const noName = await foundVillageForSettlement(deps, foundingInput({ name: ' ' }));
    expect(noName.ok).toBe(false);
    const wet = await foundVillageForSettlement(deps, foundingInput({ dwelling: at(110, 0) }));
    expect(wet).toEqual({ ok: false, reason: 'Obydlí nemůže stát ve vodě.' });
    const overlap = await foundVillageForSettlement(deps, foundingInput({ dwelling: at(0, 0) }));
    expect(overlap).toEqual({ ok: false, reason: 'Pole se překrývá s obydlím.' });
    expect(villages.records.size).toBe(0);
  });
});

describe('loadVillage', () => {
  it('bez vsi vrátí null', async () => {
    expect(
      await loadVillage({ villages: new InMemoryVillages() }, { settlementId: ID, today: TODAY }),
    ).toBeNull();
  });

  it('dopočítá ves do dneška a uloží ji s vyšší verzí', async () => {
    const villages = await foundedVillages();
    const later = TODAY + 40;
    const record = await loadVillage({ villages }, { settlementId: ID, today: later });
    expect(record?.state.lastDay).toBe(later);
    expect(record?.version).toBe(2);
    expect(villages.records.get(ID)?.state.lastDay).toBe(later);
  });

  it('už dopočítanou ves neukládá znovu', async () => {
    const villages = await foundedVillages();
    const record = await loadVillage({ villages }, { settlementId: ID, today: TODAY });
    expect(record?.version).toBe(1);
    expect(villages.saves).toBe(0);
  });

  it('při souběžném uložení to zkusí znovu nad čerstvou vsí', async () => {
    const villages = await foundedVillages();
    let interfered = false;
    villages.beforeSave = (id) => {
      if (interfered) return;
      interfered = true;
      villages.edit(id, (s) => (s.storesKg += 1));
    };
    const record = await loadVillage({ villages }, { settlementId: ID, today: TODAY + 5 });
    expect(record?.version).toBe(3);
    expect(record?.state.lastDay).toBe(TODAY + 5);
  });
});

describe('placeDwelling', () => {
  it('bez plné domácnosti stavět nejde', async () => {
    const villages = await foundedVillages();
    const result = await placeDwelling(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, type: 'zemnice', position: at(-80, -50) },
    );
    expect(result).toEqual({ ok: false, reason: CANNOT_BUILD_DWELLING });
  });

  it('plná domácnost: stavba začne dnes, ves je dopočítaná do dneška', async () => {
    const villages = await foundedVillages();
    villages.edit(ID, makeFullHousehold);
    const today = TODAY + 2;
    const result = await placeDwelling(
      { villages },
      { settlementId: ID, landscape, today, type: 'polozemnice', position: at(-80, -50) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.village.state.lastDay).toBe(today);
    const site = result.village.state.constructions.find((c) => c.kind === 'dwelling');
    expect(site).toMatchObject({ dwellingType: 'polozemnice', startedDay: today, done: 0 });
    expect(site?.position).toEqual(at(-80, -50));
  });

  it('obydlí přes zemnici nebo pole odmítne', async () => {
    const villages = await foundedVillages();
    villages.edit(ID, makeFullHousehold);
    const deps = { villages };
    const base = { settlementId: ID, landscape, today: TODAY + 1, type: 'zemnice' as const };
    const onHouse = await placeDwelling(deps, { ...base, position: at(-48, -50) });
    expect(onHouse).toEqual({ ok: false, reason: 'Překrývá se s jiným obydlím.' });
    const inField = await placeDwelling(deps, { ...base, position: at(0, 0) });
    expect(inField).toEqual({ ok: false, reason: 'Překrývá se s polem.' });
  });
});

describe('placeField', () => {
  it('založí další pole – díly se měří od obydlí, stavba začne dnes', async () => {
    const villages = await foundedVillages();
    const today = TODAY + 3;
    const result = await placeField(
      { villages },
      { settlementId: ID, landscape, today, cells: block(10, 6, 3, 4) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.village;
    expect(state.fields).toHaveLength(2);
    const fieldId = state.fields[1]!.id;
    const parts = state.parts.filter((p) => p.fieldId === fieldId);
    expect(parts).toHaveLength(12);
    expect(parts.every((p) => p.areaM2 === 225)).toBe(true);
    expect(Math.min(...parts.map((p) => p.distanceM))).toBeGreaterThan(70);
    expect(state.constructions.find((c) => c.fieldId === fieldId)?.startedDay).toBe(today);
  });

  it('ves dopočítaná za dnešek (čas se posunul zpět): pole začne v den vsi, ne výjimka', async () => {
    const villages = await foundedVillages();
    const ahead = TODAY + 5;
    villages.edit(ID, (s) => {
      Object.assign(s, advanceVillage(s, ahead));
    });
    const result = await placeField(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, cells: block(10, 6, 3, 4) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.village.state.lastDay).toBe(ahead);
    expect(result.village.state.constructions.at(-1)).toMatchObject({
      kind: 'field',
      startedDay: ahead,
    });
  });

  it('pole přes první pole odmítne a ves nezmění', async () => {
    const villages = await foundedVillages();
    const result = await placeField(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, cells: block(8, 8, 3, 3) },
    );
    expect(result).toEqual({ ok: false, reason: 'Pole se překrývá s jiným polem.' });
    expect(villages.records.get(ID)?.version).toBe(1);
  });

  it('bez vsi pole založit nejde', async () => {
    const result = await placeField(
      { villages: new InMemoryVillages() },
      { settlementId: ID, landscape, today: TODAY, cells: block(8, 8, 3, 3) },
    );
    expect(result.ok).toBe(false);
  });
});

describe('placeCemetery', () => {
  it('založí pohřebiště – stavba 10 člověkodní na čtverec začne dnes', async () => {
    const villages = await foundedVillages();
    const today = TODAY + 2;
    const result = await placeCemetery(
      { villages },
      { settlementId: ID, landscape, today, cells: block(0, 12, 2, 2) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.village;
    expect(state.cemeteries).toHaveLength(1);
    const cemetery = state.cemeteries![0]!;
    expect(cemetery).toMatchObject({ graves: 0, builtDay: null, squareSizeM: 15 });
    expect(cemetery.squares.map((s) => s.cell)).toEqual(block(0, 12, 2, 2));
    expect(state.constructions.at(-1)).toMatchObject({
      kind: 'cemetery',
      cemeteryId: cemetery.id,
      startedDay: today,
      cost: 40,
    });
  });

  it('pohřebiště přes pole nebo ve vodě odmítne a ves nezmění', async () => {
    const villages = await foundedVillages();
    const overField = await placeCemetery(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, cells: block(9, 9, 2, 1) },
    );
    expect(overField).toEqual({ ok: false, reason: 'Pohřebiště se překrývá s polem.' });
    const inWater = await placeCemetery(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, cells: block(14, 2, 2, 1) },
    );
    expect(inWater).toEqual({ ok: false, reason: 'Pohřebiště nesmí zasahovat do vody.' });
    expect(villages.records.get(ID)?.version).toBe(1);
  });

  it('blízko obydlí jen varuje v náhledu – server pohřebiště založí', async () => {
    const villages = await foundedVillages();
    // čtverec (4, 4) leží hned u zemnice (−50; −50)
    const result = await placeCemetery(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, cells: [{ x: 3, y: 3 }] },
    );
    expect(result.ok).toBe(true);
  });
});
