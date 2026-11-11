import type { StewardOutlook } from '../steward-outlook';
import { describe, expect, it } from 'vitest';
import { dateOfDayIndex, dayIndexOf, type GameDate } from '../../../calendar';
import {
  CURRENT_LAYER_VERSIONS,
  generateLandscape,
  obstaclesOf,
  SURFACE_CODES,
  tileCenterWorld,
} from '../../../landscape';
import { foundVillage } from '../../core/actions';
import { applyBuildIntent, NO_PLOT, type BuildIntent } from '../../buildings/build-intent';
import { NO_CRAFTS } from '../../core/productivity';
import { waitingHouseholds } from '../../people/households';
import { LUCKY_STARVATION_CAP } from '../../people/population';
import { STEWARD } from '../../rules/rules-steward';
import { advanceVillage } from '../../core/simulate';
import {
  chooseDwellingType,
  fieldTarget,
  inStewardWindows,
  laborBudget,
  nextFieldBlock,
  startStewardBuild,
  STEWARD_TIMING,
  stewardDay,
  stewardMode,
  workshopValue,
  type StewardContext,
} from '../steward';
import { newSteward } from '../steward-state';
import { fieldCells, takenTiles } from '../steward-land';
import { farmCells, planSettlement } from '../steward-plan';
import type { VillageState } from '../../types';
import { couple, kin } from '../../__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

// Den správce (steward.md – Rozhodovací pořadí v den správce, kroky 3 a 4; Kde správce běží).

const landscape = generateLandscape(1, CURRENT_LAYER_VERSIONS);
const obstacles = obstaclesOf(landscape);
/** 1. 9. 503 zaokrouhlený na den správce – okno polí na louce. */
const SEPT =
  Math.ceil(dayIndexOf({ year: 503, month: 9, day: 1 }) / STEWARD.everyDays) * STEWARD.everyDays;

/** Nová ves zakladatelů u sídla krajiny; ves založená v den `day` je dopočítaná do `day − 1`. */
function village(day: number, on = true): VillageState {
  const site = landscape.villageSite;
  const c = tileCenterWorld(landscape, site.x, site.y);
  const s = foundVillage({ seed: 4242, day, dwellingPosition: { x: c.x, z: c.z, rotation: 0 } });
  return { ...s, steward: newSteward(day, on) };
}

/** Ves se stojící zemnicí, hotovým plánem a mladým párem navíc – jedna rodina čeká na dům. */
function waitingVillage(day: number): VillageState {
  let s = withBuiltFirstDwelling(village(day));
  const home = s.dwellings[0]!.id;
  s.people.push(
    ...couple({ id: 900, age: 24, home }, { id: 901, age: 22, home }).map((k) => kin(k, day)),
  );
  for (let k = 0; k < 10 && s.steward?.plan?.stage !== 'done'; k++) {
    s = planSettlement(s, s.lastDay, landscape, obstacles);
  }
  return s;
}

/** Ves bez správce – pro porovnání s vypnutým (správce se ze stavu vyjme). */
function withoutSteward(state: VillageState): string {
  return JSON.stringify({ ...state, steward: undefined });
}

function newConstructions(before: VillageState, after: VillageState): number[] {
  return after.constructions.filter((c) => c.id >= before.nextId).map((c) => c.id);
}

/** Výhled bez úzkého hrdla v práci a osivu (cíl polí jako dřív). */
const OPEN_OUTLOOK: StewardOutlook = {
  laborHa: Infinity,
  seedHa: Infinity,
  landHa: 0,
  bottleneck: 'land',
  lasting: 'land',
  workPerHa: 0,
  landPeople: 0,
  sustainablePeople: 0,
};

/** Podklady dne správce `day` (bez plánu sídla a režimu z vsi). */
function contextOf(day: number): StewardContext {
  return {
    day,
    date: dateOfDayIndex(day),
    landscape,
    obstacles,
    coverage: NO_CRAFTS,
    mode: 'growth',
    outlook: OPEN_OUTLOOK,
  };
}

const cellOf = (tile: number): { x: number; y: number } => ({
  x: tile % landscape.size,
  y: Math.floor(tile / landscape.size),
});

/** Políčko krajiny pod polohou stavby. */
function tileOf(p: { x: number; z: number }): number {
  const half = (landscape.size * landscape.cellSizeM) / 2;
  return (
    Math.floor((p.z + half) / landscape.cellSizeM) * landscape.size +
    Math.floor((p.x + half) / landscape.cellSizeM)
  );
}

describe('den správce – kdy staví', () => {
  it('jen zapnutý, s krajinou a vrstvou překážek', () => {
    const start = village(SEPT);
    const to = SEPT + 40;
    const on = advanceVillage(start, to, obstacles, landscape);
    expect(on.steward?.built.length).toBeGreaterThan(0);
    // bez krajiny správce spí
    const noLand = advanceVillage(start, to, null, null);
    expect(noLand.steward?.built).toEqual([]);
    expect(noLand.steward?.plan).toBeUndefined();
    // vypnutý správce – stejně jako ves bez správce (zlaté otisky se nemění)
    const off = advanceVillage(village(SEPT, false), to, obstacles, landscape);
    expect(off.steward?.built).toEqual([]);
    const bare = village(SEPT, false);
    delete bare.steward;
    const none = advanceVillage(bare, to, obstacles, landscape);
    expect(withoutSteward(off)).toBe(withoutSteward(none));
  });

  it('jen v den správce – mezi nimi stav nemění', () => {
    const s = waitingVillage(SEPT);
    const copy = structuredClone(s);
    stewardDay(copy, SEPT + 1, landscape, obstacles);
    expect(copy).toEqual(s);
  });
});

describe('den správce – obydlí', () => {
  it('čekající rodina dostane dům do 10 dnů – stavba je správcova', () => {
    const s = waitingVillage(SEPT);
    expect(waitingHouseholds(s, s.lastDay)).toBe(1);
    const after = advanceVillage(s, s.lastDay + 10, obstacles, landscape);
    const houses = after.constructions.filter(
      (c) => c.kind === 'dwelling' && c.dwellingId === null,
    );
    expect(houses).toHaveLength(1);
    expect(after.steward?.built).toContain(houses[0]!.id);
    expect(waitingHouseholds(after, after.lastDay)).toBe(0);
  });

  it('bez čekající rodiny obydlí nestaví (cena předem – osadníci)', () => {
    const s = withBuiltFirstDwelling(village(SEPT));
    let planned = s;
    for (let k = 0; k < 10 && planned.steward?.plan?.stage !== 'done'; k++) {
      planned = planSettlement(planned, planned.lastDay, landscape, obstacles);
    }
    expect(waitingHouseholds(planned, planned.lastDay)).toBe(0);
    const after = structuredClone(planned);
    stewardDay(after, SEPT, landscape, obstacles);
    expect(after.constructions.some((c) => c.kind === 'dwelling')).toBe(false);
  });

  it('slot, kam by hráč dům nepostavil, přeskočí a zahodí', () => {
    const s = waitingVillage(SEPT);
    const plan = s.steward!.plan!;
    const water = landscape.surface.findIndex((v) => v === SURFACE_CODES.water);
    plan.slots.dwelling = [water, ...(plan.slots.dwelling ?? [])];
    const after = structuredClone(s);
    stewardDay(after, SEPT, landscape, obstacles);
    const house = after.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === null);
    expect(house).toBeDefined();
    expect(after.steward?.plan?.slots.dwelling).not.toContain(water);
    const size = landscape.size;
    const tile =
      Math.floor((house!.position!.z + (size * landscape.cellSizeM) / 2) / landscape.cellSizeM) *
        size +
      Math.floor((house!.position!.x + (size * landscape.cellSizeM) / 2) / landscape.cellSizeM);
    expect(landscape.surface[tile]).not.toBe(SURFACE_CODES.water);
  });
});

describe('den správce – režim a pole', () => {
  it('Nouze, když hlad roste; hlad, který neroste (strop hájení, zotavení), je Obnova', () => {
    const s = waitingVillage(SEPT);
    const mode = (starvationDays: number, lastHunger: number): string =>
      stewardMode(
        { ...s, starvationDays, steward: { ...s.steward!, lastHunger } },
        SEPT,
        NO_CRAFTS,
      );
    expect(stewardMode({ ...s, starvationDays: 3 }, SEPT, NO_CRAFTS)).toBe('emergency');
    expect(mode(3, 2)).toBe('emergency');
    // past osiva: hlad na stropu hájení měsíce – ne trvalá Nouze (správce staví stravu mimo pole)
    expect(mode(LUCKY_STARVATION_CAP, LUCKY_STARVATION_CAP)).not.toBe('emergency');
    expect(mode(5, 6)).not.toBe('emergency');
  });

  it('den správce si pamatuje dnešní hlad pro příští den správce', () => {
    const s = waitingVillage(SEPT);
    s.starvationDays = 7;
    stewardDay(s, SEPT, landscape, obstacles);
    expect(s.steward?.lastHunger).toBe(7);
  });

  it('v Nouzi pole jen v rozpočtu práce a obydlí pro čekající rodinu', () => {
    const s = waitingVillage(SEPT);
    s.commonLaborHistory = Array.from({ length: 30 }, () => 4);
    expect(fieldTarget(s, SEPT, NO_CRAFTS).have).toBeLessThan(fieldTarget(s, SEPT, NO_CRAFTS).need);
    // dost zásob a práce – pole i dům
    const normal = structuredClone(s);
    normal.storesKg = 20_000;
    expect(stewardMode(normal, SEPT, NO_CRAFTS)).toBe('growth');
    stewardDay(normal, SEPT, landscape, obstacles);
    const kinds = (v: VillageState): string[] =>
      newConstructions(s, v).map((id) => v.constructions.find((c) => c.id === id)!.kind);
    // první hřbitov hned po první zemnici (steward.md – krok 5); s místem ohrad a sadu u domu
    // (přednost ohrad a sadu v plánu, 9. 11. 2026) a dost práce i ohrada, sad a modla – dřív
    // jen ['cemetery', 'dwelling', 'field'] (sloty ohrad a sadu u plánovaných domů neprošly)
    expect(kinds(normal).sort()).toEqual([
      'cemetery',
      'dwelling',
      'field',
      'idol',
      'orchard',
      'pen',
    ]);
    // Nouze a málo práce – na pole rozpočet nezbývá, zemnice pro čekající rodinu ano
    const hungry = structuredClone(s);
    hungry.starvationDays = 3;
    hungry.commonLaborHistory = Array.from({ length: 30 }, () => 0.05);
    stewardDay(hungry, SEPT, landscape, obstacles);
    expect(kinds(hungry).sort()).toEqual(['cemetery', 'dwelling']);
  });

  it('rozpočet práce počítá zbývající práci všech staveb', () => {
    const s = village(SEPT);
    s.commonLaborHistory = [2, 4];
    const remaining = s.constructions.reduce((sum, c) => sum + c.cost - c.done, 0);
    expect(laborBudget(s)).toEqual({
      freePerDay: 3,
      remaining,
      left: 3 * STEWARD.laborHorizonDays - remaining,
    });
  });

  it('okna roku – louka přes Nový rok, les jen v zimě', () => {
    const at = (month: number, day: number): GameDate =>
      dateOfDayIndex(dayIndexOf({ year: 504, month, day }));
    expect(inStewardWindows(at(1, 15), STEWARD.meadowFieldWindows)).toBe(true);
    expect(inStewardWindows(at(4, 15), STEWARD.meadowFieldWindows)).toBe(false);
    expect(inStewardWindows(at(7, 1), STEWARD.meadowFieldWindows)).toBe(true);
    expect(inStewardWindows(at(9, 15), STEWARD.forestFieldWindows)).toBe(false);
    expect(inStewardWindows(at(12, 15), STEWARD.forestFieldWindows)).toBe(true);
  });

  it('dílna jen tam, kde má hodnotu – kovář ne bez uhlíře, řemeslo, které ves má, ne', () => {
    const s = waitingVillage(SEPT);
    expect(workshopValue(s, SEPT, 'smith', NO_CRAFTS)).toBe(0);
    expect(workshopValue(s, SEPT, 'carpenter', NO_CRAFTS)).toBe(0);
  });

  it('cíl polí doplní chybějící pojistku – ves bez zásob chce víc polí než ves s plnou', () => {
    const s = waitingVillage(SEPT);
    const empty = fieldTarget({ ...s, storesKg: 0 }, SEPT, NO_CRAFTS);
    const full = fieldTarget({ ...s, storesKg: 20_000 }, SEPT, NO_CRAFTS);
    expect(empty.have).toBe(full.have);
    expect(empty.need).toBeGreaterThan(full.need * 1.1);
    // s plnou pojistkou jen lidé za 2 roky × rezerva (÷ úroda let s počasím, ≤ 1)
    expect(full.need).toBeGreaterThanOrEqual(s.people.length * STEWARD.fieldReserve);
  });

  it('typ obydlí – zemnice, když rozpočet práce polozemnici do zimy neunese', () => {
    const s = waitingVillage(SEPT);
    s.commonLaborHistory = Array.from({ length: 30 }, () => 0.5);
    expect(chooseDwellingType(s, contextOf(SEPT))).toBe('zemnice');
    s.commonLaborHistory = Array.from({ length: 30 }, () => 20);
    expect(chooseDwellingType(s, contextOf(SEPT))).toBe('polozemnice');
    // v říjnu by se do 1. 11. nedostavěla
    s.commonLaborHistory = Array.from({ length: 30 }, () => 3);
    const late = Math.floor(dayIndexOf({ year: 503, month: 10, day: 20 }) / 10) * 10;
    expect(chooseDwellingType(s, contextOf(late))).toBe('zemnice');
  });

  it('nové pole napřed u hospodářství se stojícím domem, pak nejblíž stojícím domům', () => {
    const s = waitingVillage(SEPT);
    const plan = s.steward!.plan!;
    const home = tileOf(s.dwellings[0]!.position);
    const housed = plan.farms.findIndex((f) => f.house === home);
    expect(housed).toBeGreaterThanOrEqual(0);
    // hospodářství se stojícím domem až poslední v plánu – blok je stejně jeho
    const reordered = [...plan.farms.filter((_, i) => i !== housed), plan.farms[housed]!];
    const moved = { ...s, steward: { ...s.steward!, plan: { ...plan, farms: reordered } } };
    expect(nextFieldBlock(moved, contextOf(SEPT), 3, 10_000)?.farm).toBe(reordered.length - 1);
    // jeho blok je plný – políčko nejblíž stojícímu domu z bloků ostatních hospodářství
    const full = new Set(farmCells(plan.farms[housed]!, landscape.size));
    const block = nextFieldBlock(s, contextOf(SEPT), 3, 10_000, full);
    expect(block).not.toBeNull();
    expect(block!.farm).not.toBe(housed);
    const cells = fieldCells(landscape, obstacles);
    const taken = takenTiles(s, SEPT, landscape);
    const d2 = (t: number): number => {
      const dx = (t % landscape.size) - (home % landscape.size);
      const dy = Math.floor(t / landscape.size) - Math.floor(home / landscape.size);
      return dx * dx + dy * dy;
    };
    const candidates = plan.farms
      .filter((_, i) => i !== housed)
      .flatMap((f) => farmCells(f, landscape.size))
      .filter(
        (t) => !taken[t] && cells.kg[t]! > 0 && landscape.surface[t] !== SURFACE_CODES.forest,
      );
    expect(d2(block!.cells[0]!)).toBe(Math.min(...candidates.map(d2)));
  });

  it('klučení lesa – les u bloku jen v okně lesa, když louka v plánu nestačí', () => {
    const s = waitingVillage(SEPT);
    const plan = s.steward!.plan!;
    const meadow = new Set(plan.farms.flatMap((f) => farmCells(f, landscape.size)));
    const dec = Math.ceil(dayIndexOf({ year: 503, month: 12, day: 1 }) / 10) * 10;
    const block = nextFieldBlock(s, contextOf(dec), 3, 10_000, meadow);
    expect(block?.forest).toBe(true);
    expect(block!.cells.every((t) => landscape.surface[t] === SURFACE_CODES.forest)).toBe(true);
    // 1. 9. – louka ano, les ne (okno lesa 1. 10. – 31. 1.)
    expect(nextFieldBlock(s, contextOf(SEPT), 3, 10_000, meadow)).toBeNull();
    expect(nextFieldBlock(s, contextOf(SEPT), 3, 10_000)?.forest).toBe(false);
  });
});

describe('den správce – veto a cena předem', () => {
  it('vetovaný slot obydlí vynechá; všechny vetované – plán vyčerpaný, dům u dvorce', () => {
    const s = waitingVillage(SEPT);
    const slots = s.steward!.plan!.slots.dwelling!;
    const veto = (
      t: number,
    ): { kind: 'dwelling'; cell: { x: number; y: number }; untilDay: number } => ({
      kind: 'dwelling',
      cell: cellOf(t),
      untilDay: SEPT + 100,
    });
    s.steward!.vetoes = [veto(slots[0]!)];
    const one = structuredClone(s);
    stewardDay(one, SEPT, landscape, obstacles);
    const house = one.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === null);
    expect(tileOf(house!.position!)).not.toBe(slots[0]);
    const all = structuredClone(s);
    all.steward!.vetoes = slots.map(veto);
    stewardDay(all, SEPT, landscape, obstacles);
    expect(all.steward!.plan!.exhausted).toBe(true);
    const fallback = all.constructions.find((c) => c.kind === 'dwelling' && c.dwellingId === null);
    expect(slots).not.toContain(tileOf(fallback!.position!));
  });

  it('odmítnutí ceny předem stav nezmění; stavba má přesně klíče výsledku akce', () => {
    const at = { ...contextOf(SEPT) };
    const tile = waitingVillage(SEPT).steward!.plan!.slots.dwelling![0]!;
    const c = tileCenterWorld(landscape, cellOf(tile).x, cellOf(tile).y);
    const intent: BuildIntent = {
      kind: 'dwelling',
      type: 'zemnice',
      position: { x: c.x, z: c.z, rotation: 0 },
    };
    // odmítnutí nezmění stav: polozemnice bez pozemku (lidi k osídlení obydlí od 8. 11. 2026
    // nechce – rozhodnutí o stavbě dál drží `waitingHouseholds`, ne cena)
    const lone = withBuiltFirstDwelling(village(SEPT));
    const before = structuredClone(lone);
    expect(startStewardBuild(lone, at, { ...intent, type: 'polozemnice' })).toEqual({
      ok: false,
      reason: NO_PLOT,
    });
    expect(lone).toEqual(before);
    // s čekající rodinou projde; stav = výsledek akce (žádný klíč navíc ani chybějící)
    const s = waitingVillage(SEPT);
    const expected = applyBuildIntent(
      { ...structuredClone(s), lastDay: SEPT },
      SEPT,
      landscape,
      obstacles,
      intent,
    );
    expect(startStewardBuild(s, at, intent)).toEqual({ ok: true });
    expect(expected.ok).toBe(true);
    if (expected.ok) expect(Object.keys(s).sort()).toEqual(Object.keys(expected.state).sort());
  });

  it('chyba vstupu akce (díl pole dál než 800 m) se v měření počítá', () => {
    const s = waitingVillage(SEPT);
    STEWARD_TIMING.clock = (): number => 0;
    const errors = STEWARD_TIMING.rangeErrors.length + STEWARD_TIMING.rejected;
    const far = startStewardBuild(s, contextOf(SEPT), {
      kind: 'field',
      cells: [{ x: 0, y: 0 }],
    });
    STEWARD_TIMING.clock = null;
    expect(far.ok).toBe(false);
    expect(STEWARD_TIMING.rangeErrors.length + STEWARD_TIMING.rejected).toBeGreaterThan(errors);
  });
});
