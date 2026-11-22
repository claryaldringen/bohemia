import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../../calendar';
import { fallowStage } from '../../fields/fields';
import { fallowOrder, fallowRanks, stageHectares } from '../fallow-order';
import { fallowPrepPerHa, partWork } from '../year-plan';
import type { FallowStage, FieldPart } from '../../types';

// Pořadí odpočatých přílohů do osevu podle toho, co vsi chybí (fields.md – Pořadí dávek; Martin
// 22. 11. 2026: „Obecně se drž pravidla vyprodukovat co nejvíce za co nejmenší množství práce.“).

const DAY = dayIndexOf({ year: 600, month: 9, day: 15 });

/** Hektar přílohu u domu (bez příplatku za vzdálenost) ve stadiu `stage` v den `DAY`. */
function fallow(stage: FallowStage): FieldPart {
  const years = {
    'young-fallow': [1, 0],
    meadow: [4, 0],
    shrubs: [8, 8],
    'young-forest': [20, 20],
  };
  const [fallowYears, overgrowthYears] = years[stage];
  return {
    id: 1,
    fieldId: 1,
    areaM2: 10_000,
    distanceM: 0,
    naturalFertility: 70,
    fertilityShare: 1,
    bonusUntilDay: null,
    state: 'fallow',
    sownYears: 0,
    fallowSinceDay: DAY - fallowYears! * 365 - 30,
    overgrowthYears: overgrowthYears!,
    foundingCost: 0,
    foundingDone: 0,
    surface: 'meadow',
  };
}

const STAGES: readonly FallowStage[] = ['young-fallow', 'meadow', 'shrubs', 'young-forest'];
/** Stadia od prvního podle pořadí. */
const ordered = (ranks: Readonly<Record<FallowStage, number>>): FallowStage[] =>
  [...STAGES].sort((a, b) => ranks[a] - ranks[b]);

describe('cena hektaru přílohu po zdrojích', () => {
  it.each([
    [true, 0],
    [true, 1],
    [false, 0],
    [false, 0.5],
  ])('rádlo %s, pokrytí nástroji %s – jako příprava dílu (partWork)', (plough, tools) => {
    for (const stage of STAGES) {
      const part = fallow(stage);
      expect(fallowStage(part, DAY)).toBe(stage);
      const work = partWork(part, DAY, tools, plough);
      const price = fallowPrepPerHa(stage, tools, plough);
      expect(price.people, stage).toBeCloseTo(work.reclaim + work.dig + work.sow, 9);
      expect(price.plough, stage).toBeCloseTo(work.plough, 9);
    }
  });

  it('s rádlem louka nejmíň práce lidí a nejvíc orby, křoví a mladý les naopak', () => {
    const [meadow, shrubs, forest] = (['meadow', 'shrubs', 'young-forest'] as const).map((s) =>
      fallowPrepPerHa(s, 0, true),
    );
    expect(meadow!.plough).toBeCloseTo(2.5 * shrubs!.plough, 9);
    expect(meadow!.people).toBeLessThan(shrubs!.people);
    expect(shrubs!.people).toBeLessThan(forest!.people);
    expect(shrubs!.plough).toBe(forest!.plough);
  });
});

describe('kolik hektarů stadia čelo vezme', () => {
  it('dojde dřív místo, kterému stadium dá míň hektarů; přeplněné čelo jako bez místa', () => {
    expect(stageHectares({ people: 30, plough: 5 }, { people: 10, plough: 25 })).toBeCloseTo(0.2);
    expect(stageHectares({ people: 30, plough: 5 }, { people: 100, plough: 10 })).toBeCloseTo(0.3);
    expect(stageHectares({ people: 30, plough: -4 }, { people: 10, plough: 25 })).toBe(0);
    // motyka – bez orby jen lidé
    expect(stageHectares({ people: 30, plough: 0 }, { people: 150, plough: 0 })).toBeCloseTo(0.2);
  });
});

describe('pořadí stadií podle toho, co vsi chybí', () => {
  it('chybí spřežení: mladý příloh, křoví, mladý les, louka (drn) až potom', () => {
    // jeden pár – volné místo spřežení na čele 2 čd, u lidí 60 čd
    expect(ordered(fallowRanks({ people: 60, plough: 2 }, 0, true))).toEqual([
      'young-fallow',
      'shrubs',
      'young-forest',
      'meadow',
    ]);
  });

  it('chybí lidé: mladý příloh, louka, křoví, mladý les', () => {
    expect(ordered(fallowRanks({ people: 6, plough: 30 }, 0, true))).toEqual([
      'young-fallow',
      'meadow',
      'shrubs',
      'young-forest',
    ]);
  });

  it('louka před křovím, právě když spřežení zorá víc hektarů luk, než lidé vyklučí křoví', () => {
    // bez železa: louka 25 čd orby/ha, křoví 103,3 čd lidí/ha – hranice u poměru ≈ 0,24
    const ranks = (plough: number): Readonly<Record<FallowStage, number>> =>
      fallowRanks({ people: 100, plough }, 0, true);
    expect(ranks(30).meadow).toBeLessThan(ranks(30).shrubs);
    expect(ranks(20).shrubs).toBeLessThan(ranks(20).meadow);
  });

  it('spřežení bez místa na čele: žádné stadium se nevejde – pořadí podle ceny u lidí', () => {
    const ranks = fallowRanks({ people: 20, plough: -3 }, 0, true);
    expect(ordered(ranks)).toEqual(['young-fallow', 'meadow', 'shrubs', 'young-forest']);
    // všechna stadia 0 ha – pořadí jen podle ceny u lidí
    expect(new Set(Object.values(ranks)).size).toBe(4);
  });

  it('motyka: podle práce lidí – bez železa jsou křoví a louka (drn) stejně drahé', () => {
    expect(ordered(fallowRanks({ people: 30, plough: 0 }, 1, false))).toEqual([
      'young-fallow',
      'shrubs',
      'meadow',
      'young-forest',
    ]);
    const bare = fallowRanks({ people: 30, plough: 0 }, 0, false);
    expect(bare.shrubs).toBe(bare.meadow);
    expect(bare['young-forest']).toBe(bare.shrubs + 1);
  });

  it('pořadí dílu podle jeho stadia v den výběru', () => {
    const rank = fallowOrder(DAY, 0, true, () => ({ people: 60, plough: 2 }));
    expect(rank(fallow('shrubs'))).toBeLessThan(rank(fallow('meadow')));
    expect(rank(fallow('young-forest'))).toBeLessThan(rank(fallow('meadow')));
  });
});
