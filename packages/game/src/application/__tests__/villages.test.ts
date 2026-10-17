import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { generateLandscape, obstaclesOf, tileCenterWorld } from '../../domain/landscape';
import {
  advanceVillage,
  checkDwellingPlacement,
  DWELLING_TREES,
  dwellingBuildLabor,
  fellingCost,
  matureTreesByDistance,
  obstacleChangesAt,
  placementVillageOf,
  woodFellingCost,
  type Position,
  type VillageState,
} from '../../domain/village';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { foundVillageForSettlement, type FoundVillageInput } from '../found-village';
import { loadVillage } from '../load-village';
import { placeCemetery } from '../place-cemetery';
import { NO_SETTLERS, NO_WOOD, placeDwelling } from '../place-dwelling';
import { placeField } from '../place-field';
import { renameVillage } from '../rename-village';
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

/**
 * Zemnice zakladatelů dostavěná a domácnost v ní plná dospělých (6 lidí, z toho 6 dospělých) –
 * může se z ní oddělit mladý pár. Na hromadě leží 40 klád (ruční krajina testů nemá stromy).
 */
function makeFullHousehold(state: VillageState): void {
  Object.assign(state, withBuiltFirstDwelling(state));
  const day = state.lastDay;
  state.people.forEach((p) => (p.bornDay = Math.min(p.bornDay, day - Math.ceil(16 * YEAR))));
  for (const [i, age] of [20, 22].entries()) {
    state.people.push({ id: 900 + i, bornDay: day - Math.ceil(age * YEAR), dwellingId: 1 });
  }
  state.woodLogs = 40;
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
    // první zemnici si zakladatelé teprve staví
    expect(village.state.dwellings).toEqual([]);
    const zemnice = village.state.constructions.find((c) => c.kind === 'dwelling');
    expect(zemnice).toMatchObject({ dwellingType: 'zemnice', startedDay: TODAY });
    expect(zemnice?.done).toBeGreaterThan(0);
    expect(zemnice?.position).toEqual(at(-50, -50));
    expect(village.state.fields).toHaveLength(1);
    expect(village.state.parts).toHaveLength(16);
    expect(village.state.parts.every((p) => p.cell !== undefined)).toBe(true);
    expect(village.state.chronicle[0]).toEqual({ day: TODAY, kind: 'village-founded' });
  });

  it('bez čtverců pole založí ves jen se stavbou zemnice', async () => {
    const villages = new InMemoryVillages();
    for (const fieldCells of [undefined, []]) {
      villages.records.clear();
      const result = await foundVillageForSettlement(
        { villages, seeds },
        foundingInput({ fieldCells }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.village.state.fields).toEqual([]);
      expect(result.village.state.constructions.map((c) => c.kind)).toEqual(['dwelling']);
    }
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
  it('obydlí bez lidí k osídlení odmítne česky a ves nezmění', async () => {
    const villages = await foundedVillages();
    const deps = { villages };
    const base = { settlementId: ID, landscape, today: TODAY + 1 };
    // čerstvá ves: zakladatelé si teprve staví zemnici, nikdo další nečeká
    const fresh = await placeDwelling(deps, { ...base, type: 'zemnice', position: at(-80, -50) });
    expect(fresh).toEqual({ ok: false, reason: NO_SETTLERS });
    // plná domácnost dá jeden pár – první stavba projde, druhá ne
    villages.edit(ID, makeFullHousehold);
    const first = await placeDwelling(deps, { ...base, type: 'zemnice', position: at(-80, -50) });
    expect(first.ok).toBe(true);
    const version = villages.records.get(ID)?.version;
    const second = await placeDwelling(deps, {
      ...base,
      type: 'polozemnice',
      position: at(-80, -80),
    });
    expect(second).toEqual({ ok: false, reason: NO_SETTLERS });
    expect(villages.records.get(ID)?.version).toBe(version);
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
    expect(site).toMatchObject({
      dwellingType: 'polozemnice',
      startedDay: today,
      done: 0,
      dwellingId: null,
    });
    expect(site?.position).toEqual(at(-80, -50));
  });

  it('obydlí přes zemnici nebo pole odmítne', async () => {
    const villages = await foundedVillages();
    const deps = { villages };
    const base = { settlementId: ID, landscape, today: TODAY + 1, type: 'zemnice' as const };
    villages.edit(ID, makeFullHousehold);
    const onHouse = await placeDwelling(deps, { ...base, position: at(-48, -50) });
    expect(onHouse).toEqual({ ok: false, reason: 'Překrývá se s jiným obydlím.' });
    const inField = await placeDwelling(deps, { ...base, position: at(0, 0) });
    expect(inField).toEqual({ ok: false, reason: 'Překrývá se s polem.' });
  });

  it('bez dřeva (klády nestačí a krajina nemá stromy) stavbu odmítne česky', async () => {
    const villages = await foundedVillages();
    villages.edit(ID, (state) => {
      makeFullHousehold(state);
      state.woodLogs = DWELLING_TREES.zemnice - 0.5;
    });
    const version = villages.records.get(ID)?.version;
    const base = { settlementId: ID, landscape, today: TODAY + 1, position: at(-80, -50) };
    const result = await placeDwelling({ villages }, { ...base, type: 'zemnice' });
    expect(result).toEqual({ ok: false, reason: NO_WOOD });
    expect(villages.records.get(ID)?.version).toBe(version);
  });

  it('obydlí bere klády z hromady – bez kácení stojí práci bez dřeva', async () => {
    const villages = await foundedVillages();
    villages.edit(ID, makeFullHousehold);
    const result = await placeDwelling(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, type: 'zemnice', position: at(-80, -50) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = result.village.state.constructions.at(-1)!;
    expect(site.wood).toEqual({ trees: 7, fromPile: 7, fell: [], felled: 0 });
    expect(site.cost).toBeCloseTo(dwellingBuildLabor('zemnice'), 9);
    // den dopočtu do dneška klády trochu nahnily (4 % ročně)
    expect(result.village.state.woodLogs).toBeCloseTo(40 - 7, 1);
    expect(result.village.state.woodLogs).toBeLessThan(40 - 7);
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
    expect(overField).toEqual({ ok: false, reason: 'Hřbitov se překrývá s polem.' });
    const inWater = await placeCemetery(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, cells: block(14, 2, 2, 1) },
    );
    expect(inWater).toEqual({ ok: false, reason: 'Hřbitov nesmí zasahovat do vody.' });
    expect(villages.records.get(ID)?.version).toBe(1);
  });

  it('čtverce navazující na hřbitov ho rozšíří – stejné id, nová stavba', async () => {
    const villages = await foundedVillages();
    const first = await placeCemetery(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 1, cells: block(0, 12, 2, 2) },
    );
    if (!first.ok) throw new Error(first.reason);
    const result = await placeCemetery(
      { villages },
      { settlementId: ID, landscape, today: TODAY + 2, cells: block(2, 12, 1, 2) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.village;
    expect(state.cemeteries).toHaveLength(1);
    const cemetery = state.cemeteries![0]!;
    expect(cemetery.squares).toHaveLength(6);
    const extension = state.constructions.at(-1);
    expect(extension).toMatchObject({ kind: 'cemetery', cemeteryId: cemetery.id, cost: 20 });
    expect(cemetery.squares.slice(4).every((s) => s.constructionId === extension?.id)).toBe(true);
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

describe('renameVillage', () => {
  it('přejmenuje ves (normalizované jméno) a vrátí ji dopočítanou do dneška', async () => {
    const villages = await foundedVillages();
    const result = await renameVillage(
      { villages },
      { settlementId: ID, today: TODAY + 2, name: '  Nové   Dvory ' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.village.name).toBe('Nové Dvory');
    expect(result.village.state.lastDay).toBe(TODAY + 2);
    expect(villages.records.get(ID)?.name).toBe('Nové Dvory');
  });

  it('odmítne prázdné a dlouhé jméno i ves, která není', async () => {
    const villages = await foundedVillages();
    const deps = { villages };
    const empty = await renameVillage(deps, { settlementId: ID, today: TODAY, name: '  ' });
    expect(empty).toEqual({ ok: false, reason: 'Ves potřebuje jméno.' });
    const long = await renameVillage(deps, {
      settlementId: ID,
      today: TODAY,
      name: 'x'.repeat(41),
    });
    expect(long.ok).toBe(false);
    expect(villages.records.get(ID)?.name).toBe('Libice');
    const none = await renameVillage(
      { villages: new InMemoryVillages() },
      { settlementId: ID, today: TODAY, name: 'Lhota' },
    );
    expect(none).toEqual({ ok: false, reason: 'Ves ještě není založená.' });
  });
});

describe('překážky krajiny ve vsi (vrstva překážek)', () => {
  const real = generateLandscape(3);
  const site = tileCenterWorld(real, real.villageSite.x, real.villageSite.y);
  /** Místo pro zemnici u vsi, kde na staveništi stojí překážky (keř, kámen, strom…). */
  const spotWithObstacles = (): Position => {
    for (let r = 20; r < 400; r += 5) {
      for (let a = 0; a < 64; a++) {
        const p = at(site.x + r * Math.cos(a / 10), site.z + r * Math.sin(a / 10));
        const check = checkDwellingPlacement(real, null, 'zemnice', p);
        if (check.ok && check.obstacleIds.length > 0) return p;
      }
    }
    throw new Error('Žádné místo s překážkami.');
  };
  const spot = spotWithObstacles();
  const expected = checkDwellingPlacement(real, null, 'zemnice', spot);

  it('založení vsi odstraní překážky při zahájení stavby první zemnice a zaplatí je prací', async () => {
    const villages = new InMemoryVillages();
    const result = await foundVillageForSettlement(
      { villages, seeds },
      { settlementId: ID, landscape: real, today: TODAY, name: 'Libice', dwelling: spot },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.village.state.clearedObstacles!.map((c) => c.id)).toEqual(expected.obstacleIds);
    const zemnice = result.village.state.constructions.find((c) => c.kind === 'dwelling')!;
    expect(zemnice.cost).toBeCloseTo(
      dwellingBuildLabor('zemnice') + expected.obstacleCost + woodFellingCost(zemnice.wood),
      9,
    );
    // dřevo první zemnice: stromy ze staveniště na hromadu, zbytek z nejbližších stromů
    const siteTrees = expected.obstacleCounts.tree ?? 0;
    expect(zemnice.wood!.fromPile).toBe(Math.min(7, siteTrees));
    expect(zemnice.wood!.trees).toBe(7);
    expect(zemnice.forestDistanceM).toBeGreaterThanOrEqual(0);
  });

  it('nové obydlí bez klád vyhradí nejbližší dospělé stromy a pokácí je prací stavby', async () => {
    const villages = new InMemoryVillages();
    await foundVillageForSettlement(
      { villages, seeds },
      {
        settlementId: ID,
        landscape: real,
        today: TODAY,
        name: 'Libice',
        dwelling: at(site.x, site.z),
      },
    );
    villages.edit(ID, (state) => {
      makeFullHousehold(state);
      state.woodLogs = 0;
    });
    const before = villages.records.get(ID)!.state;
    const result = await placeDwelling(
      { villages },
      { settlementId: ID, landscape: real, today: TODAY + 1, type: 'polozemnice', position: spot },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.village.state;
    const construction = state.constructions.at(-1)!;
    const check = checkDwellingPlacement(
      real,
      placementVillageOf(before, TODAY + 1),
      'polozemnice',
      spot,
    );
    const siteTrees = check.obstacleCounts.tree ?? 0;
    // stromy jiných staveb (první zemnice) jsou vyhrazené – vyloučit je
    const reserved = new Set(
      before.constructions.flatMap((c) => c.wood?.fell.map((t) => t.id) ?? []),
    );
    const nearest = matureTreesByDistance(
      obstaclesOf(real),
      obstacleChangesAt(before, TODAY + 1),
      spot,
    )
      .filter((t) => !check.obstacleIds.includes(t.id) && !reserved.has(t.id))
      .slice(0, 18 - Math.min(18, siteTrees));
    expect(construction.wood!.fell.map((t) => t.id)).toEqual(nearest.map((t) => t.id));
    construction.wood!.fell.forEach((t, i) => {
      expect(t.cost).toBeCloseTo(fellingCost(nearest[i]!.distanceM), 9);
    });
    expect(construction.cost).toBeCloseTo(
      dwellingBuildLabor('polozemnice') + check.obstacleCost + woodFellingCost(construction.wood),
      9,
    );
    // stavba dostane práci – po dostavění jsou po stromech pařezy
    const finished = advanceVillage(state, TODAY + 3 * 365, obstaclesOf(real));
    const stumps = obstacleChangesAt(finished, finished.lastDay).stumps;
    for (const t of nearest) expect(stumps).toContain(t.id);
  });

  it('nové obydlí zaplatí překážky prací a osadníci je odstraní při zahájení stavby', async () => {
    const villages = new InMemoryVillages();
    const founded = await foundVillageForSettlement(
      { villages, seeds },
      {
        settlementId: ID,
        landscape: real,
        today: TODAY,
        name: 'Libice',
        dwelling: at(site.x, site.z),
      },
    );
    expect(founded.ok).toBe(true);
    villages.edit(ID, makeFullHousehold);
    const result = await placeDwelling(
      { villages },
      { settlementId: ID, landscape: real, today: TODAY + 1, type: 'zemnice', position: spot },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const construction = result.village.state.constructions.at(-1)!;
    // klády z hromady (makeFullHousehold) – bez kácení
    expect(construction.wood?.fell).toEqual([]);
    expect(construction.cost).toBeCloseTo(dwellingBuildLabor('zemnice') + expected.obstacleCost, 9);
    expect(expected.obstacleCost).toBeGreaterThan(0);
    const cleared = result.village.state.clearedObstacles!.map((c) => c.id);
    for (const id of expected.obstacleIds) expect(cleared).toContain(id);
    // stejné místo podruhé: překážky už nejsou (a obydlí se překrývá)
    const again = checkDwellingPlacement(
      real,
      placementVillageOf(result.village.state, TODAY + 1),
      'zemnice',
      at(spot.x + 40, spot.z),
    );
    for (const id of again.obstacleIds) expect(cleared).not.toContain(id);
  });

  it('ves z doby před vrstvou překážek si je při načtení s krajinou doplní a uloží', async () => {
    const villages = new InMemoryVillages();
    await foundVillageForSettlement(
      { villages, seeds },
      { settlementId: ID, landscape: real, today: TODAY, name: 'Libice', dwelling: spot },
    );
    const record = villages.records.get(ID)!;
    delete record.state.clearedObstacles;
    delete record.state.felledTrees;
    const withoutLandscape = await loadVillage({ villages }, { settlementId: ID, today: TODAY });
    expect(withoutLandscape!.state.clearedObstacles).toBeUndefined();
    const loaded = await loadVillage(
      { villages },
      { settlementId: ID, today: TODAY, landscape: real },
    );
    expect(loaded!.state.clearedObstacles!.map((c) => c.id)).toEqual(expected.obstacleIds);
    expect(villages.records.get(ID)!.state.clearedObstacles).toBeDefined();
  });
});
