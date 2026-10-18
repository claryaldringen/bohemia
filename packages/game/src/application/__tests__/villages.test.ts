import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import {
  generateLandscape,
  obstacleIndex,
  obstaclesOf,
  tileCenterWorld,
} from '../../domain/landscape';
import {
  villageRoadWalk,
  advanceVillage,
  checkDwellingPlacement,
  checkPlotPlacement,
  checkSacredBuildingPlacement,
  checkWorkshopPlacement,
  DWELLING_TREES,
  dwellingBuildLabor,
  fellingCost,
  isOak,
  matureTreesByDistance,
  sacredSitesOf,
  obstacleChangesAt,
  placementVillageOf,
  plotHousePosition,
  woodFellingCost,
  type DwellingPlot,
  type Position,
  type VillageState,
} from '../../domain/village';
import { block, makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { withBuiltFirstDwelling } from '../../domain/village/__tests__/village-fixtures';
import { foundVillageForSettlement, type FoundVillageInput } from '../found-village';
import { loadVillage } from '../load-village';
import { placeCemetery } from '../place-cemetery';
import { NO_PLOT, NO_SETTLERS, NO_WOOD, placeDwelling } from '../place-dwelling';
import { placeField } from '../place-field';
import { placeOrchard } from '../place-orchard';
import { UNKNOWN_CRAFT, placeWorkshop } from '../place-workshop';
import { placeSacredBuilding, SHRINE_EXISTS } from '../place-sacred';
import { renameVillage } from '../rename-village';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

const TODAY = dayIndexOf({ year: 503, month: 4, day: 12 });
const YEAR = 365.25;
const ID = 'settlement-1';
/** První ves založená v repozitáři vsí v paměti. */
const VID = 'village-1';
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
    expect(village).toMatchObject({ id: VID, settlementId: ID, name: 'Libice', version: 1 });
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
    expect(villages.records.get(VID)?.name).toBe('Libice');
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
      await loadVillage(
        { villages: new InMemoryVillages() },
        { villageId: VID, today: TODAY, landscape },
      ),
    ).toBeNull();
  });

  it('dopočítá ves do dneška a uloží ji s vyšší verzí', async () => {
    const villages = await foundedVillages();
    const later = TODAY + 40;
    const record = await loadVillage({ villages }, { villageId: VID, today: later, landscape });
    expect(record?.state.lastDay).toBe(later);
    expect(record?.version).toBe(2);
    expect(villages.records.get(VID)?.state.lastDay).toBe(later);
  });

  it('už dopočítanou ves neukládá znovu', async () => {
    const villages = await foundedVillages();
    const record = await loadVillage({ villages }, { villageId: VID, today: TODAY, landscape });
    expect(record?.version).toBe(1);
    expect(villages.saves).toBe(0);
  });

  it('starší polozemnice bez pozemku dostane při načtení pozemek – před dopočtem, jednou', async () => {
    const villages = await foundedVillages();
    expect(villages.records.get(VID)!.state.plotsMigrated).toBe(true);
    villages.edit(VID, (s) => {
      delete s.plotsMigrated;
      // políčko (12, 3) = svět x 60 … 75, z −75 … −60
      s.dwellings.push({
        id: s.nextId++,
        type: 'polozemnice',
        builtDay: TODAY - 300,
        condition: 1,
        position: at(68.2, -66.9, 1),
      });
    });
    const record = await loadVillage({ villages }, { villageId: VID, today: TODAY + 1, landscape });
    const old = record!.state.dwellings.find((d) => d.type === 'polozemnice')!;
    expect(old.plot).toEqual({ cell: { x: 12, y: 3 }, variant: 'center' });
    expect(old.position).toEqual(at(67.5, -67.5, 1));
    expect(record!.state.plotsMigrated).toBe(true);
    expect(villages.records.get(VID)!.state.dwellings.at(-1)!.plot).toBeDefined();
  });

  it('stará navazující pole se při načtení sloučí do nejstaršího a ves se uloží', async () => {
    const villages = await foundedVillages();
    const placed = await placeField(
      { villages },
      { villageId: VID, landscape, today: TODAY, cells: block(11, 6, 3, 4) },
    );
    expect(placed.ok).toBe(true);
    const [older, newer] = (await villages.find(VID))!.state.fields.map((f) => f.id);
    // dřív samostatné pole hned vedle prvního (x 10–12) – jako před slučováním polí
    villages.edit(VID, (s) => {
      for (const p of s.parts) if (p.fieldId === newer && p.cell) p.cell.x -= 1;
    });
    const record = await loadVillage({ villages }, { villageId: VID, today: TODAY, landscape });
    expect(record!.state.fields.map((f) => f.id)).toEqual([older]);
    expect(record!.state.parts.every((p) => p.fieldId === older)).toBe(true);
    expect(villages.records.get(VID)!.state.fields).toHaveLength(1);
  });

  it('při souběžném uložení to zkusí znovu nad čerstvou vsí', async () => {
    const villages = await foundedVillages();
    let interfered = false;
    villages.beforeSave = (id) => {
      if (interfered) return;
      interfered = true;
      villages.edit(id, (s) => (s.storesKg += 1));
    };
    const record = await loadVillage({ villages }, { villageId: VID, today: TODAY + 5, landscape });
    expect(record?.version).toBe(3);
    expect(record?.state.lastDay).toBe(TODAY + 5);
  });
});

describe('placeDwelling', () => {
  it('obydlí bez lidí k osídlení odmítne česky a ves nezmění', async () => {
    const villages = await foundedVillages();
    const deps = { villages };
    const base = { villageId: VID, landscape, today: TODAY + 1 };
    // čerstvá ves: zakladatelé si teprve staví zemnici, nikdo další nečeká
    const fresh = await placeDwelling(deps, { ...base, type: 'zemnice', position: at(-80, -50) });
    expect(fresh).toEqual({ ok: false, reason: NO_SETTLERS });
    // plná domácnost dá jeden pár – první stavba projde, druhá ne
    villages.edit(VID, makeFullHousehold);
    const first = await placeDwelling(deps, { ...base, type: 'zemnice', position: at(-80, -50) });
    expect(first.ok).toBe(true);
    const version = villages.records.get(VID)?.version;
    const second = await placeDwelling(deps, {
      ...base,
      type: 'polozemnice',
      position: at(-80, -80),
      plot: { cell: { x: 2, y: 2 }, variant: 'center' },
    });
    expect(second).toEqual({ ok: false, reason: NO_SETTLERS });
    expect(villages.records.get(VID)?.version).toBe(version);
  });

  it('plná domácnost: stavba začne dnes, ves je dopočítaná do dneška', async () => {
    const villages = await foundedVillages();
    villages.edit(VID, makeFullHousehold);
    const today = TODAY + 2;
    // políčko (2, 4) = svět x −90 … −75, z −60 … −45; klientská poloha se nebere
    const plot: DwellingPlot = { cell: { x: 2, y: 4 }, variant: 'front-left' };
    const result = await placeDwelling(
      { villages },
      { villageId: VID, landscape, today, type: 'polozemnice', position: at(0, 0), plot },
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
      plot,
    });
    expect(site?.position).toEqual(plotHousePosition(landscape, plot));
    // po dostavění obydlí pozemek převezme
    const built = advanceVillage(result.village.state, today + 3 * 365, null);
    expect(built.dwellings.find((d) => d.type === 'polozemnice')?.plot).toEqual(plot);
  });

  it('polozemnice bez pozemku ani na zabraném políčku neprojde, zemnice pozemek nebere', async () => {
    const villages = await foundedVillages();
    villages.edit(VID, makeFullHousehold);
    const base = { villageId: VID, landscape, today: TODAY + 1, position: at(-80, -50) };
    const deps = { villages };
    const noPlot = await placeDwelling(deps, { ...base, type: 'polozemnice' });
    expect(noPlot).toEqual({ ok: false, reason: NO_PLOT });
    // políčko (3, 3) zabírá zemnice zakladatelů (−50, −50)
    const onHouse = await placeDwelling(deps, {
      ...base,
      type: 'polozemnice',
      plot: { cell: { x: 4, y: 4 }, variant: 'center' },
    });
    expect(onHouse).toEqual({ ok: false, reason: 'Překrývá se s jiným obydlím.' });
    const zemnice = await placeDwelling(deps, {
      ...base,
      type: 'zemnice',
      plot: { cell: { x: 2, y: 4 }, variant: 'center' },
    });
    expect(zemnice.ok).toBe(true);
    if (!zemnice.ok) return;
    const site = zemnice.village.state.constructions.at(-1)!;
    expect(site.position).toEqual(at(-80, -50));
    expect(site.plot).toBeUndefined();
  });

  it('obydlí přes zemnici odmítne', async () => {
    const villages = await foundedVillages();
    const deps = { villages };
    const base = { villageId: VID, landscape, today: TODAY + 1, type: 'zemnice' as const };
    villages.edit(VID, makeFullHousehold);
    const onHouse = await placeDwelling(deps, { ...base, position: at(-48, -50) });
    expect(onHouse).toEqual({ ok: false, reason: 'Překrývá se s jiným obydlím.' });
  });

  it('polozemnice na čtverci pole: díl z pole zmizí, pozemek překážky pole neplatí', async () => {
    const villages = await foundedVillages();
    villages.edit(VID, makeFullHousehold);
    const before = villages.records.get(VID)!.state;
    const fieldId = before.parts[0]!.fieldId;
    // políčko (7, 7) patří prvnímu poli
    const plot: DwellingPlot = { cell: { x: 7, y: 7 }, variant: 'center' };
    const result = await placeDwelling(
      { villages },
      {
        villageId: VID,
        landscape,
        today: TODAY + 1,
        type: 'polozemnice',
        position: at(0, 0),
        plot,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.village;
    expect(state.parts.some((p) => p.cell?.x === 7 && p.cell.y === 7)).toBe(false);
    expect(state.parts.filter((p) => p.fieldId === fieldId)).toHaveLength(15);
    expect(state.constructions.at(-1)).toMatchObject({ dwellingType: 'polozemnice', plot });
    expect(state.chronicle).toContainEqual({
      day: TODAY + 1,
      kind: 'land-taken',
      land: 'field',
      id: fieldId,
      areaM2: 225,
      gone: false,
      by: 'dwelling',
    });
  });

  it('zemnice přes dva díly pole oba zmenší o průnik vyklízené plochy', async () => {
    const villages = await foundedVillages();
    villages.edit(VID, makeFullHousehold);
    // na hranici políček (7, 7) a (8, 7): vyklízená plocha 9,6 × 11,9 m, z −13,4 … −1,5 m
    const position = at(0, -9);
    const check = checkDwellingPlacement(
      landscape,
      placementVillageOf(villages.records.get(VID)!.state, TODAY + 1),
      'zemnice',
      position,
    );
    expect(check.ok).toBe(true);
    expect(check.warning).toBe('Pole se zmenší');
    const result = await placeDwelling(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, type: 'zemnice', position },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const area = (x: number, y: number): number | undefined =>
      result.village.state.parts.find((p) => p.cell?.x === x && p.cell.y === y)?.areaM2;
    // každý díl přijde o půlku vyklízené plochy: 4,8 × 11,9 m
    expect(area(7, 7)).toBeCloseTo(225 - 4.8 * 11.9, 6);
    expect(area(8, 7)).toBeCloseTo(225 - 4.8 * 11.9, 6);
    expect(area(6, 7)).toBe(225);
  });

  it('bez dřeva (klády nestačí a krajina nemá stromy) stavbu odmítne česky', async () => {
    const villages = await foundedVillages();
    villages.edit(VID, (state) => {
      makeFullHousehold(state);
      state.woodLogs = DWELLING_TREES.zemnice - 0.5;
    });
    const version = villages.records.get(VID)?.version;
    const base = { villageId: VID, landscape, today: TODAY + 1, position: at(-80, -50) };
    const result = await placeDwelling({ villages }, { ...base, type: 'zemnice' });
    expect(result).toEqual({ ok: false, reason: NO_WOOD });
    expect(villages.records.get(VID)?.version).toBe(version);
  });

  it('obydlí bere klády z hromady – bez kácení stojí práci bez dřeva', async () => {
    const villages = await foundedVillages();
    villages.edit(VID, makeFullHousehold);
    const result = await placeDwelling(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, type: 'zemnice', position: at(-80, -50) },
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

describe('placeWorkshop', () => {
  it('dílna se staví jako obydlí – chce mladý pár, místo pro milíř a změří vodu', async () => {
    const villages = await foundedVillages();
    const deps = { villages };
    const base = { villageId: VID, landscape, today: TODAY + 1 };
    const fresh = await placeWorkshop(deps, { ...base, craft: 'burner', position: at(-80, -50) });
    expect(fresh).toEqual({ ok: false, reason: NO_SETTLERS });
    villages.edit(VID, makeFullHousehold);
    const unknown = await placeWorkshop(deps, {
      ...base,
      craft: 'weaver' as never,
      position: at(-80, -50),
    });
    expect(unknown).toEqual({ ok: false, reason: UNKNOWN_CRAFT });
    // milíř (−9, +3 m od zemnice) by stál na prvním poli – smí, pole se o vyklízenou plochu zmenší
    const onField = checkWorkshopPlacement(
      landscape,
      placementVillageOf(villages.records.get(VID)!.state, TODAY + 1),
      'burner',
      at(36, 0),
    );
    expect(onField).toMatchObject({ ok: true, warning: 'Pole se zmenší' });
    expect(onField.takenLand.length).toBeGreaterThan(0);
    const result = await placeWorkshop(deps, { ...base, craft: 'burner', position: at(-80, -50) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = result.village.state.constructions.find((c) => c.craft === 'burner');
    expect(site).toMatchObject({ kind: 'dwelling', dwellingType: 'zemnice', dwellingId: null });
    expect(site?.waterDistanceM).toBeGreaterThan(100);
  });
});

describe('placeField', () => {
  it('založí další pole – díly se měří od obydlí, stavba začne dnes', async () => {
    const villages = await foundedVillages();
    const today = TODAY + 3;
    const result = await placeField(
      { villages },
      { villageId: VID, landscape, today, cells: block(11, 6, 3, 4) },
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

  it('čtverce navazující na pole ho rozšíří – i pod nejmenší výměru, pole i s nimi ji má', async () => {
    const villages = await foundedVillages();
    const before = (await villages.find(VID))!.state;
    const fieldId = before.fields[0]!.id;
    const result = await placeField(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(10, 6, 1, 4) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.village;
    expect(state.fields.map((f) => f.id)).toEqual([fieldId]);
    expect(state.parts.filter((p) => p.fieldId === fieldId)).toHaveLength(16 + 4);
    expect(state.constructions.filter((c) => c.kind === 'field')).toHaveLength(1);
  });

  it('ves dopočítaná za dnešek (čas se posunul zpět): pole začne v den vsi, ne výjimka', async () => {
    const villages = await foundedVillages();
    const ahead = TODAY + 5;
    villages.edit(VID, (s) => {
      Object.assign(s, advanceVillage(s, ahead, null));
    });
    const result = await placeField(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(11, 6, 3, 4) },
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
      { villageId: VID, landscape, today: TODAY + 1, cells: block(8, 8, 3, 3) },
    );
    expect(result).toEqual({ ok: false, reason: 'Pole se překrývá s jiným polem.' });
    expect(villages.records.get(VID)?.version).toBe(1);
  });

  it('bez vsi pole založit nejde', async () => {
    const result = await placeField(
      { villages: new InMemoryVillages() },
      { villageId: VID, landscape, today: TODAY, cells: block(8, 8, 3, 3) },
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
      { villageId: VID, landscape, today, cells: block(0, 12, 2, 2) },
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

  it('pohřebiště ve vodě odmítne a ves nezmění; na poli projde – čtverec z pole zmizí', async () => {
    const villages = await foundedVillages();
    const inWater = await placeCemetery(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(14, 2, 2, 1) },
    );
    expect(inWater).toEqual({ ok: false, reason: 'Hřbitov nesmí zasahovat do vody.' });
    expect(villages.records.get(VID)?.version).toBe(1);
    // čtverec (9, 9) patří prvnímu poli (fields.md – Pole jako krajina)
    const overField = await placeCemetery(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(9, 9, 2, 1) },
    );
    expect(overField.ok).toBe(true);
    if (!overField.ok) return;
    const { state } = overField.village;
    expect(state.parts.some((p) => p.cell?.x === 9 && p.cell.y === 9)).toBe(false);
    expect(state.cemeteries?.[0]?.squares.map((q) => q.cell)).toEqual(block(9, 9, 2, 1));
    expect(state.chronicle.at(-1)).toMatchObject({
      kind: 'land-taken',
      land: 'field',
      areaM2: 225,
      gone: false,
      by: 'cemetery',
    });
  });

  it('čtverce navazující na hřbitov ho rozšíří – stejné id, nová stavba', async () => {
    const villages = await foundedVillages();
    const first = await placeCemetery(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(0, 12, 2, 2) },
    );
    if (!first.ok) throw new Error(first.reason);
    const result = await placeCemetery(
      { villages },
      { villageId: VID, landscape, today: TODAY + 2, cells: block(2, 12, 1, 2) },
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
      { villageId: VID, landscape, today: TODAY + 1, cells: [{ x: 3, y: 3 }] },
    );
    expect(result.ok).toBe(true);
  });
});

describe('placeOrchard', () => {
  it('založí sad – výsadba 80 člověkodní/ha (1,8 na čtverec) začne dnes, čtverce se sázejí', async () => {
    const villages = await foundedVillages();
    const today = TODAY + 2;
    const result = await placeOrchard(
      { villages },
      { villageId: VID, landscape, today, cells: block(10, 6, 2, 2) },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state } = result.village;
    expect(state.orchards).toHaveLength(1);
    const orchard = state.orchards![0]!;
    expect(orchard.squares.map((s) => s.cell)).toEqual(block(10, 6, 2, 2));
    expect(orchard.squares.every((s) => s.plantedDay === null && s.areaM2 === 225)).toBe(true);
    expect(state.constructions.at(-1)).toMatchObject({
      kind: 'orchard',
      orchardId: orchard.id,
      startedDay: today,
    });
    expect(state.constructions.at(-1)?.cost).toBeCloseTo(4 * 1.8);
  });

  it('sad ve vodě nebo přes jiný sad odmítne a ves nezmění; na poli projde', async () => {
    const villages = await foundedVillages();
    const inWater = await placeOrchard(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(14, 2, 2, 1) },
    );
    expect(inWater).toEqual({ ok: false, reason: 'Sad nesmí zasahovat do vody.' });
    expect(villages.records.get(VID)?.version).toBe(1);
    const first = await placeOrchard(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(10, 6, 2, 2) },
    );
    expect(first.ok).toBe(true);
    const again = await placeOrchard(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(11, 7, 2, 2) },
    );
    expect(again).toEqual({ ok: false, reason: 'Sad se překrývá s jiným sadem.' });
    const fieldOver = await placeField(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(11, 7, 2, 2) },
    );
    expect(fieldOver).toEqual({ ok: false, reason: 'Pole se překrývá se sadem.' });
    // sad na čtverci prvního pole (9, 9) – čtverec z pole zmizí (fields.md – Pole jako krajina)
    const overField = await placeOrchard(
      { villages },
      { villageId: VID, landscape, today: TODAY + 1, cells: block(9, 9, 1, 1) },
    );
    expect(overField.ok).toBe(true);
    if (!overField.ok) return;
    const { state } = overField.village;
    expect(state.parts.some((p) => p.cell?.x === 9 && p.cell.y === 9)).toBe(false);
    expect(state.orchards?.at(-1)?.squares.map((q) => q.cell)).toEqual([{ x: 9, y: 9 }]);
    expect(state.chronicle.at(-1)).toMatchObject({ kind: 'land-taken', by: 'orchard' });
  });

  it('bez vsi sad založit nejde', async () => {
    const result = await placeOrchard(
      { villages: new InMemoryVillages() },
      { villageId: VID, landscape, today: TODAY, cells: block(10, 6, 2, 2) },
    );
    expect(result.ok).toBe(false);
  });
});

describe('renameVillage', () => {
  it('přejmenuje ves (normalizované jméno) a vrátí ji dopočítanou do dneška', async () => {
    const villages = await foundedVillages();
    const result = await renameVillage(
      { villages },
      { villageId: VID, today: TODAY + 2, name: '  Nové   Dvory ', landscape },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.village.name).toBe('Nové Dvory');
    expect(result.village.state.lastDay).toBe(TODAY + 2);
    expect(villages.records.get(VID)?.name).toBe('Nové Dvory');
  });

  it('odmítne prázdné a dlouhé jméno i ves, která není', async () => {
    const villages = await foundedVillages();
    const deps = { villages };
    const empty = await renameVillage(deps, {
      villageId: VID,
      today: TODAY,
      name: '  ',
      landscape,
    });
    expect(empty).toEqual({ ok: false, reason: 'Ves potřebuje jméno.' });
    const long = await renameVillage(deps, {
      villageId: VID,
      today: TODAY,
      name: 'x'.repeat(41),
      landscape,
    });
    expect(long.ok).toBe(false);
    expect(villages.records.get(VID)?.name).toBe('Libice');
    const none = await renameVillage(
      { villages: new InMemoryVillages() },
      { villageId: VID, today: TODAY, name: 'Lhota', landscape },
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
  /** Pozemek polozemnice u vsi s překážkami na políčku (stromy, keře, kameny…). */
  const plotWithObstacles = (village: Parameters<typeof checkPlotPlacement>[1]): DwellingPlot => {
    for (let r = 1; r < 20; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const plot: DwellingPlot = {
            cell: { x: real.villageSite.x + dx, y: real.villageSite.y + dy },
            variant: 'center',
          };
          const check = checkPlotPlacement(real, village, 'polozemnice', plot);
          if (check.ok && check.obstacleIds.length > 0) return plot;
        }
      }
    }
    throw new Error('Žádný pozemek s překážkami.');
  };

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
    villages.edit(VID, (state) => {
      makeFullHousehold(state);
      state.woodLogs = 0;
    });
    const before = villages.records.get(VID)!.state;
    const placement = placementVillageOf(before, TODAY + 1);
    const plot = plotWithObstacles(placement);
    const result = await placeDwelling(
      { villages },
      {
        villageId: VID,
        landscape: real,
        today: TODAY + 1,
        type: 'polozemnice',
        position: at(0, 0),
        plot,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.village.state;
    const construction = state.constructions.at(-1)!;
    const check = checkPlotPlacement(real, placement, 'polozemnice', plot);
    const spot = check.position!;
    expect(construction.position).toEqual(spot);
    // pozemek platí překážky celého políčka a odstraní je hned při zahájení stavby
    expect(check.obstacleIds.length).toBeGreaterThan(0);
    const cleared = state.clearedObstacles!.map((c) => c.id);
    for (const id of check.obstacleIds) expect(cleared).toContain(id);
    const siteTrees = check.obstacleCounts.tree ?? 0;
    // stromy jiných staveb (první zemnice) jsou vyhrazené – vyloučit je
    const reserved = new Set(
      before.constructions.flatMap((c) => c.wood?.fell.map((t) => t.id) ?? []),
    );
    const nearest = matureTreesByDistance(
      obstaclesOf(real),
      obstacleChangesAt(before, TODAY + 1),
      spot,
      // posvátné duby a stromy hájů se pro stavby nekácí (happiness.md)
      { exclude: sacredSitesOf(obstaclesOf(real)).protectedTrees },
    )
      .filter((t) => !check.obstacleIds.includes(t.id) && !reserved.has(t.id))
      .slice(0, 18 - Math.min(18, siteTrees));
    expect(construction.wood!.fell.map((t) => t.id)).toEqual(nearest.map((t) => t.id));
    // kácení podle chůze ke stromu (roads.md – mokřina ×2, brod + 30 m; pevné cesty ves nemá)
    const walks = villageRoadWalk(before, real)(spot, nearest);
    construction.wood!.fell.forEach((t, i) => {
      expect(walks[i]!).toBeGreaterThanOrEqual(nearest[i]!.distanceM - 1e-9);
      expect(t.cost).toBeCloseTo(fellingCost(walks[i]!), 9);
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
    villages.edit(VID, makeFullHousehold);
    const result = await placeDwelling(
      { villages },
      { villageId: VID, landscape: real, today: TODAY + 1, type: 'zemnice', position: spot },
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

  it('ves z doby před vrstvou překážek a palivem si je při načtení doplní před dopočtem a uloží', async () => {
    const villages = new InMemoryVillages();
    await foundVillageForSettlement(
      { villages, seeds },
      { settlementId: ID, landscape: real, today: TODAY, name: 'Libice', dwelling: spot },
    );
    const record = villages.records.get(VID)!;
    delete record.state.clearedObstacles;
    delete record.state.felledTrees;
    delete record.state.constructions[0]!.forestDistanceM;
    const loaded = await loadVillage(
      { villages },
      { villageId: VID, today: TODAY + 3, landscape: real },
    );
    // doplněné ke dni, do kterého byla ves uložená – ještě před dopočtem
    expect(loaded!.state.clearedObstacles).toEqual(
      expected.obstacleIds.map((id) => ({ id, day: TODAY })),
    );
    expect(loaded!.state.constructions[0]!.forestDistanceM).toBeGreaterThanOrEqual(0);
    expect(villages.records.get(VID)!.state.clearedObstacles).toBeDefined();
  });
});

describe('posvátná místa (happiness.md)', () => {
  const real = generateLandscape(3);
  const layer = obstaclesOf(real);
  const sites = sacredSitesOf(layer);
  const site = tileCenterWorld(real, real.villageSite.x, real.villageSite.y);
  /** První místo u vsi (po spirále), kam stavba smí – kontrola podle `check`. */
  const spotFor = (check: (p: Position) => boolean, from = 20): Position => {
    for (let r = from; r < 600; r += 5) {
      for (let a = 0; a < 64; a++) {
        const p = at(site.x + r * Math.cos(a / 10), site.z + r * Math.sin(a / 10));
        if (check(p)) return p;
      }
    }
    throw new Error('Žádné vhodné místo.');
  };
  const home = spotFor((p) => checkDwellingPlacement(real, null, 'zemnice', p).ok);

  async function founded(): Promise<InMemoryVillages> {
    const villages = new InMemoryVillages();
    await foundVillageForSettlement(
      { villages, seeds },
      { settlementId: ID, landscape: real, today: TODAY, name: 'Libice', dwelling: home },
    );
    return villages;
  }

  it('modla: server ověří místo, vyhradí dospělý dub a svatyně je jedna na ves', async () => {
    const villages = await founded();
    const state = villages.records.get(VID)!.state;
    const village = placementVillageOf(state, TODAY);
    const idolSpot = spotFor(
      (p) => checkSacredBuildingPlacement(real, village, 'idol', p, layer).ok,
      40,
    );
    const result = await placeSacredBuilding(
      { villages },
      { villageId: VID, landscape: real, today: TODAY, kind: 'idol', position: idolSpot },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const idol = result.village.state.constructions.at(-1)!;
    expect(idol.kind).toBe('idol');
    expect(idol.wood!.fell).toHaveLength(1);
    const oak = obstacleIndex(layer, idol.wood!.fell[0]!.id!);
    expect(isOak(layer, oak)).toBe(true);
    expect(sites.protectedTrees.has(layer.id[oak]!)).toBe(false);

    const shrineVillage = placementVillageOf(result.village.state, TODAY);
    const shrineSpot = spotFor(
      (p) => checkSacredBuildingPlacement(real, shrineVillage, 'shrine', p, layer).ok,
      60,
    );
    const shrine = await placeSacredBuilding(
      { villages },
      { villageId: VID, landscape: real, today: TODAY, kind: 'shrine', position: shrineSpot },
    );
    expect(shrine.ok).toBe(true);
    const again = await placeSacredBuilding(
      { villages },
      { villageId: VID, landscape: real, today: TODAY, kind: 'shrine', position: shrineSpot },
    );
    expect(again).toEqual({ ok: false, reason: SHRINE_EXISTS });
    // posvátný dub: stavět na něj nejde (server)
    const oakSite = sites.oaks[0]!;
    const onOak = await placeSacredBuilding(
      { villages },
      {
        villageId: VID,
        landscape: real,
        today: TODAY,
        kind: 'idol',
        position: at(oakSite.x, oakSite.z),
      },
    );
    expect(onOak.ok).toBe(false);
  });

  it('pole přes háj: čtverce háje se vyjmou a ves si háj zapamatuje', async () => {
    const villages = await founded();
    // háj nejblíž vsi a čtverce kolem něj (3 × 3 kolem prvního čtverce háje)
    const grove = [...sites.groves].sort(
      (a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z),
    )[0]!;
    const first = grove.cells[0]!;
    const cells = [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1].map((dx) => ({ x: first.x + dx, y: first.y + dy })),
    );
    const result = await placeField(
      { villages },
      { villageId: VID, landscape: real, today: TODAY, cells },
    );
    if (!result.ok) {
      // háj může ležet dál než 800 m od vsi – pak stačí, že důvod není o háji
      expect(result.reason).not.toContain('háj');
      return;
    }
    const state = result.village.state;
    expect(state.groves?.map((g) => g.id)).toEqual([grove.id]);
    const groveCells = new Set(grove.cells.map((c) => `${c.x},${c.y}`));
    expect(state.parts.some((p) => p.cell && groveCells.has(`${p.cell.x},${p.cell.y}`))).toBe(
      false,
    );
    expect(state.chronicle).toContainEqual(
      expect.objectContaining({ kind: 'sacred-spared', site: 'grove', id: grove.id }),
    );
  });
});
