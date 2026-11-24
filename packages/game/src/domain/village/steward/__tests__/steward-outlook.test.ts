import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { averageRotationShare, harvestPerPersonKg } from '../../fields/field-capacity';
import { fieldFoodShare } from '../../fields/field-food';
import { foundVillage } from '../../core/actions';
import { NO_CRAFTS } from '../../core/productivity';
import { sowingCapacity } from '../../core/simulate-plan';
import { createCropWork } from '../../core/year-plan';
import { ableTeams } from '../../livestock/oxen';
import type { SowingCapacity } from '../../fields/sowing';
import { SOWERS } from '../../rules';
import { STEWARD } from '../../rules/rules-steward';
import { fieldTarget } from '../steward';
import { stewardOutlook } from '../steward-outlook';
import type { FieldPart, Person, VillageState } from '../../types';
import { dwelling } from '../../__tests__/kin-fixtures';
import { withBuiltFirstDwelling } from '../../__tests__/village-fixtures';

const SEPT = dayIndexOf({ year: 504, month: 9, day: 1 });
const JUNE = dayIndexOf({ year: 505, month: 6, day: 1 });

function part(id: number, ha: number): FieldPart {
  return {
    id,
    fieldId: 1,
    areaM2: ha * 10_000,
    distanceM: 60,
    naturalFertility: 0.8,
    fertilityShare: averageRotationShare(),
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: null,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
}

/** Ves zakladatelů s polem `ha` hektarů (díly po hektaru) a zásobami `storesKg`. */
function village(ha: number, storesKg = 3_000): VillageState {
  const s = foundVillage({ seed: 7, day: SEPT, dwellingPosition: { x: 0, z: 0, rotation: 0 } });
  s.parts = Array.from({ length: ha }, (_, i) => part(i + 1, 1));
  s.storesKg = storesKg;
  return s;
}

describe('výhled vsi – model kapacity (steward.md – Model kapacity vsi)', () => {
  it('malé pole: hrdlem půda, udržitelní = „Pole uživí“', () => {
    const o = stewardOutlook(village(2), SEPT, NO_CRAFTS);
    expect(o.lasting).toBe('land');
    expect(o.bottleneck).toBe('land');
    expect(o.laborHa).toBeGreaterThan(o.landHa);
    expect(o.sustainablePeople).toBeCloseTo(o.landPeople, 6);
  });

  it('velké pole pro pět zakladatelů: hrdlem práce v oknech setí, cíl polí podle práce', () => {
    const s = village(80);
    const o = stewardOutlook(s, SEPT, NO_CRAFTS);
    expect(o.lasting).toBe('labor');
    expect(o.laborHa).toBeLessThan(o.landHa);
    expect(o.sustainablePeople).toBeLessThan(o.landPeople);
    // kopání + setí + vracení přílohu jednou za roky osevu, ≥ kopání a setí bez nástrojů (100 + 3,3
    // – setí motykou 1 / 0,3 čd/ha od 9. 11. 2026, dřív 100 + 10)
    expect(o.workPerHa).toBeGreaterThanOrEqual(100 + 1 / SOWERS.hoeHaPerDay - 1e-9);
    const target = fieldTarget(s, SEPT, NO_CRAFTS, o);
    expect(target.need).toBeLessThanOrEqual(
      ((o.landPeople * o.laborHa) / o.landHa) * STEWARD.fieldReserve + 1e-9,
    );
    expect(target.have).toBeGreaterThan(target.need);
  });

  it('osivo brzdí jen do konce setí – v září bez zásob hrdlem osivo, trvale ne', () => {
    const empty = village(10, 0);
    empty.legumesKg = 0;
    const sept = stewardOutlook(empty, SEPT, NO_CRAFTS);
    expect(sept.seedHa).toBeLessThan(sept.landHa);
    expect(sept.bottleneck).toBe('seed');
    expect(sept.lasting).not.toBe('seed');
    expect(stewardOutlook(empty, JUNE, NO_CRAFTS).seedHa).toBe(Infinity);
  });

  it('cíl polí = maximum, které ves obdělá, bez ohledu na stravu (D99, Martin 18. 11. 2026)', () => {
    // táž ves jen s obilím (podíl z pole 1) a s masem, mlékem a ovocem (z pole jen 55 % jídla);
    // v červnu osivo neomezuje – osev podle práce
    const grain = village(30);
    const meat: VillageState = {
      ...grain,
      fieldFood: { needKg: 1_000, fieldKg: 550, share: 0.55, longShare: 0.55 },
    };
    expect(fieldFoodShare(meat)).toBeLessThan(fieldFoodShare(grain));
    const of = (s: VillageState): { need: number; have: number; harvestKg: number } => {
      const o = stewardOutlook(s, JUNE, NO_CRAFTS);
      const target = fieldTarget(s, JUNE, NO_CRAFTS, o);
      // cíl = `workable` – lidé, které uživí osev, který ves stihne osít i sklidit a na který má
      // osivo, × rezerva (D99 kolo 1 – `workableHa`)
      const sowable = Math.min(o.workableHa, o.seedHa);
      expect(target.need).toBeCloseTo(
        ((o.landPeople * sowable) / o.landHa) * STEWARD.fieldReserve,
        9,
      );
      return { ...target, harvestKg: target.need * harvestPerPersonKg(s, JUNE) };
    };
    const a = of(grain);
    const b = of(meat);
    // v lidech „Pole uživí“ víc lidí s masem, úroda cíle a poměr k dnešním polím stejné
    expect(b.have).toBeGreaterThan(a.have);
    expect(b.harvestKg).toBeCloseTo(a.harvestKg, 6);
    expect(b.need / b.have).toBeCloseTo(a.need / a.have, 9);
  });

  it('žeň jde před otavou i lnem – seč cíl polí nemění; výmlat má zimní okno (D99 kolo 2)', () => {
    const s = village(30);
    const o = stewardOutlook(s, JUNE, NO_CRAFTS);
    // `DAY_WORK_ORDER`: žeň před lnem, senem i otavou – sebevětší zápis otavy výhled nezmění
    const mowing = {
      partIds: [],
      required: 1e6,
      needed: 1e6,
      done: 0,
      yieldKg: 0,
      cut: 2 as const,
    };
    const mown: VillageState = { ...s, hay: { kg: 0, mowing } };
    expect(stewardOutlook(mown, JUNE, NO_CRAFTS)).toEqual(o);
    // výmlat ve vlastním okně do února (Martin 9. 11. 2026) – kladný a konečný, bez humna dražší
    expect(o.threshHa).toBeGreaterThan(0);
    expect(Number.isFinite(o.threshHa)).toBe(true);
    expect(o.workableHa).toBeLessThanOrEqual(Math.min(o.harvestHa, o.threshHa));
  });

  it('ves bez pole v oběhu: opatrný cíl z potřeby s celou potřebou z pole (D99)', () => {
    // plná pojistka – doplnění nepotřebuje, cíl jen z lidí za 2 roky
    const grain = village(0, 20_000);
    const meat: VillageState = {
      ...grain,
      fieldFood: { needKg: 1_000, fieldKg: 550, share: 0.55, longShare: 0.55 },
    };
    expect(stewardOutlook(grain, SEPT, NO_CRAFTS).landHa).toBe(0);
    const a = fieldTarget(grain, SEPT, NO_CRAFTS);
    const b = fieldTarget(meat, SEPT, NO_CRAFTS);
    expect(a.have).toBe(0);
    expect(b.have).toBe(0);
    // lidé za 2 roky × rezerva (÷ úroda let s počasím, ≤ 1) – s podílem 1 jako dřív
    expect(a.need).toBeGreaterThanOrEqual(grain.people.length * STEWARD.fieldReserve);
    // strava cíl nezmenší: úroda, kterou cíl chce, je s masem stejná jako jen s obilím
    expect(b.need * harvestPerPersonKg(meat, SEPT)).toBeCloseTo(
      a.need * harvestPerPersonKg(grain, SEPT),
      6,
    );
    // bez lidí žádný cíl
    expect(fieldTarget({ ...grain, people: [] }, SEPT, NO_CRAFTS)).toEqual({ need: 0, have: 0 });
  });

  it('je čistý – stav nemění a stejný vstup dá stejný výhled', () => {
    const s = village(30);
    const before = JSON.stringify(s);
    const first = stewardOutlook(s, SEPT, NO_CRAFTS);
    expect(JSON.stringify(s)).toBe(before);
    expect(stewardOutlook(s, SEPT, NO_CRAFTS)).toEqual(first);
  });
});

describe('cíl polí i s prací rodu vojvody (D103 – Martin 19. 11. 2026: „Ano, maximálně zůstanou neobdělaná“)', () => {
  const OUTSIDE = 500;
  const person = (
    id: number,
    years: number,
    dwellingId: number,
    sex: Person['sex'],
    extra: Partial<Person> = {},
  ): Person => ({ id, bornDay: SEPT - Math.ceil(years * 365.25) - 10, dwellingId, sex, ...extra });

  /**
   * Ves s polem `ha` hektarů a cvičící rodinou ve dvorci (vojvoda 40, žena 38, syn 17 se snachou
   * 16, syn 11) a jen čtyřmi dospělými mimo rod – práce brzdí.
   */
  function lordVillage(ha: number): VillageState {
    const s = withBuiltFirstDwelling(village(ha, 50_000));
    const manor = s.dwellings[0]!.id;
    s.dwellings.push({ ...dwelling(OUTSIDE), position: { x: 30, z: 0, rotation: 0 } });
    s.people = [
      person(10, 40, manor, 'male', { spouseId: 11 }),
      person(11, 38, manor, 'female', { spouseId: 10 }),
      person(12, 17, manor, 'male', { fatherId: 10, motherId: 11, spouseId: 13 }),
      person(13, 16, manor, 'female', { spouseId: 12 }),
      person(14, 11, manor, 'male', { fatherId: 10, motherId: 11 }),
      ...Array.from({ length: 4 }, (_, i) =>
        person(20 + i, 26 + i, OUTSIDE, i % 2 === 0 ? 'male' : 'female'),
      ),
    ];
    s.manorId = manor;
    s.constructions = [];
    s.lord = { trains: true };
    return s;
  }

  // okna hospodářského roku od 1. 9. (výhled v červnu – osivo cíl nebrzdí)
  const windows = (s: VillageState, lord: boolean): SowingCapacity =>
    sowingCapacity(s, SEPT, NO_CRAFTS, false, null, undefined, { withoutLateHarvest: true, lord });

  it('ves s rodem a málo lidmi mimo rod: cíl roste v oknech setí, žní i výmlatu podle práce rodu', () => {
    const s = lordVillage(80);
    const without: VillageState = {
      ...s,
      people: s.people.filter((p) => p.dwellingId === OUTSIDE),
    };
    // rod se nezapočítá dvakrát – práce vsi s cvičící rodinou je táž jako ve vsi bez ní
    expect(windows(s, false)).toEqual(windows(without, false));
    const village = windows(s, false);
    const withLord = windows(s, true);
    expect(withLord.autumn).toBeGreaterThan(village.autumn);
    expect(withLord.july + withLord.august).toBeGreaterThan(village.july + village.august);
    expect(withLord.spring).toBeGreaterThan(village.spring);
    const o = stewardOutlook(s, JUNE, NO_CRAFTS);
    const base = stewardOutlook(without, JUNE, NO_CRAFTS);
    expect(o.sowHa / base.sowHa).toBeCloseTo(withLord.autumn / village.autumn, 9);
    expect(o.harvestHa / base.harvestHa).toBeCloseTo(
      (withLord.july + withLord.august) / (village.july + village.august),
      9,
    );
    expect(o.threshHa / base.threshHa).toBeCloseTo(withLord.spring / village.spring, 9);
    expect(o.workableHa).toBeGreaterThan(base.workableHa);
    expect(o.workableHa).toBeLessThan(o.landHa);
    expect(fieldTarget(s, JUNE, NO_CRAFTS, o).need).toBeGreaterThan(
      fieldTarget(s, JUNE, NO_CRAFTS, base).need,
    );
    // osev podle práce pro ostatní čtenáře dál bez rodu (Známý dluh – steward.md)
    expect(o.laborHa).toBeCloseTo(base.laborHa, 9);
  });

  it('rodina, která necvičí, nebo celý rod mimo ves: cíl beze změny', () => {
    const s = lordVillage(80);
    // ves s málo dospělými mimo rodinu – rodina pracuje jako ostatní, v práci vsi už je
    const works: VillageState = { ...s };
    delete works.lord;
    // celý rod na tažení (lord.md – Kdy jde rodina na pole: jen kdo je zrovna ve vsi)
    const away: VillageState = {
      ...s,
      people: s.people.map((p) =>
        p.dwellingId === OUTSIDE ? p : { ...p, away: { kind: 'campaign', untilDay: JUNE + 400 } },
      ),
    };
    for (const v of [works, away]) {
      const village = windows(v, false);
      expect(windows(v, true)).toEqual(village);
      // bez orby: osev lidmi = okno vracení a kopání jednou ÷ práce na osetý hektar
      const o = stewardOutlook(v, JUNE, NO_CRAFTS);
      expect(o.sowHa).toBeCloseTo(village.autumn / o.workPerHa, 9);
    }
    // rodina, která pracuje jako ostatní, je v práci vsi – víc než bez ní
    const without: VillageState = {
      ...s,
      people: s.people.filter((p) => p.dwellingId === OUTSIDE),
    };
    expect(windows(works, false).autumn).toBeGreaterThan(windows(without, false).autumn);
  });
});

describe('výhled vsi s nástroji (24. 11. 2026 – plán 3, závěrečná kontrola I3)', () => {
  /** Ves se spřežením a plánem orby ozimu 20 ha, spočteným při pokrytí nástroji `planTools`. */
  function ploughing(planTools: number): VillageState {
    const s = village(20, 50_000);
    s.parts = s.parts.map((p) => ({
      ...p,
      state: 'ready' as const,
      sownYears: 1,
      surface: 'meadow' as const,
    }));
    s.pens = [
      {
        id: 900,
        species: 'team',
        cell: { x: 3, y: 4 },
        x: 50,
        z: 60,
        builtDay: SEPT - 800,
        team: { readyDay: SEPT - 10 },
        training: null,
      },
    ];
    s.season = {
      startDay: SEPT,
      crops: [
        { crop: 'winter', ...createCropWork(s.parts, SEPT, planTools, true, undefined, 'winter') },
      ],
    };
    return s;
  }

  it('lepší pokrytí nástroji kapacitu polí nesníží – páry orají stejně, plán ze dne plánu', () => {
    for (const planTools of [0, 1]) {
      const s = ploughing(planTools);
      expect(ableTeams(s, SEPT)).toBeGreaterThan(0);
      const worn = stewardOutlook(s, SEPT, { ...NO_CRAFTS, tools: 0 });
      const better = stewardOutlook(s, SEPT, { ...NO_CRAFTS, tools: 1 });
      expect(better.laborHa).toBeGreaterThanOrEqual(worn.laborHa - 1e-9);
      expect(better.workableHa).toBeGreaterThanOrEqual(worn.workableHa - 1e-9);
    }
  });
});
