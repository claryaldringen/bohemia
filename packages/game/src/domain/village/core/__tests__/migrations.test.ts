import { describe, expect, it } from 'vitest';
import { generateLandscape, obstaclesOf, tileCenterWorld } from '../../../landscape';
import { dayIndexOf } from '../../../calendar';
import { foundVillage } from '../actions';
import { migrateVillage, VILLAGE_MIGRATIONS, type VillageMigrationContext } from '../migrations';
import { withoutForeignGoods } from '../../trade/trade';
import type { VillageState } from '../../types';

// Převody starších vsí (village-core.md – Převody starších vsí): jeden seznam pro načtení vsi
// i dopočet – každý převod jednou, převody `loadOnly` jen při načtení.

const landscape = generateLandscape(42);
const obstacles = obstaclesOf(landscape);
const DAY = 400;

function founded(): VillageState {
  const site = tileCenterWorld(landscape, landscape.villageSite.x, landscape.villageSite.y);
  return foundVillage({
    seed: 7,
    day: DAY,
    dwellingPosition: { x: site.x, z: site.z, rotation: 0 },
    obstacles,
  });
}

const advance: VillageMigrationContext = { obstacles, landscape };
const load: VillageMigrationContext = {
  obstacles,
  landscape,
  load: { today: DAY + 10, weatherSeed: 99, landscape, obstacles },
};

describe('seznam převodů', () => {
  it('id jsou jedinečná a den zavedení je datum', () => {
    const ids = VILLAGE_MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of VILLAGE_MIGRATIONS) expect(m.since).toMatch(/^2026-\d{2}-\d{2}$/);
  });

  it('dopočet přeskočí převody jen pro načtení, načtení je projde', () => {
    const old = founded();
    delete old.livestock?.pensFromDay;
    const advanced = migrateVillage(old, advance);
    expect(advanced.livestock?.pensFromDay).toBeUndefined();
    expect(advanced.weatherSeed).toBeUndefined();
    const loaded = migrateVillage(old, load);
    expect(loaded.livestock?.pensFromDay).toBeDefined();
    expect(loaded.weatherSeed).toBe(99);
  });

  it('podruhé nic nezmění – vrátí týž objekt', () => {
    const once = migrateVillage(founded(), load);
    expect(migrateVillage(once, load)).toBe(once);
    expect(migrateVillage(once, advance)).toBe(once);
  });

  it('vstupní stav nemění', () => {
    const state = founded();
    const before = JSON.stringify(state);
    migrateVillage(state, load);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("postoj 'surrender' se převede na 'flee', podruhé beze změny (war.md – Obránci)", () => {
    const old = founded();
    (old as { defense?: { stance: string } }).defense = { stance: 'surrender' };
    const once = migrateVillage(old, advance);
    expect(once.defense).toEqual({ stance: 'flee' });
    expect(migrateVillage(once, advance)).toBe(once);
    expect((old.defense as { stance: string }).stance).toBe('surrender');
    const kept = founded();
    kept.defense = { stance: 'defend' };
    expect(migrateVillage(kept, advance).defense).toEqual({ stance: 'defend' });
    expect(migrateVillage(founded(), advance).defense).toBeUndefined();
  });

  it('nová ves má strop dovedností od založení (war.md – Síla)', () => {
    expect(founded().armsCapped).toBe(true);
  });
});

describe('podíl medu v jídle (`foreign-goods` – trade.md, Jen společné suroviny)', () => {
  /** Ves, která včera jedla med (podíl 0,002 energie). */
  function sweet(): VillageState {
    const s = migrateVillage(founded(), load);
    s.diet = {
      energy: 1,
      protein: 1,
      diversity: 0.9,
      satiation: 0.9,
      shares: { grain: 0.998, meat: 0, dairy: 0, eggs: 0, fruit: 0, legumes: 0, honey: 0.002 },
    };
    return s;
  }

  it('ves se zbožím (`wares`) jí med z klátů – převod vrátí týž objekt', () => {
    const s = sweet();
    s.wares = { hides: 0, sheepFurs: 0, wildFurs: 0, honeyKg: 4, waxKg: 0.3 };
    expect(withoutForeignGoods(s)).toBe(s);
    expect(migrateVillage(s, load)).toBe(s);
  });

  it('ves bez zboží – podíl medu je ze starého zboží zvenku a zmizí', () => {
    const s = sweet();
    const next = withoutForeignGoods(s);
    expect(next.diet!.shares).toEqual({
      grain: 0.998,
      meat: 0,
      dairy: 0,
      eggs: 0,
      fruit: 0,
      legumes: 0,
    });
    expect(s.diet!.shares.honey).toBe(0.002);
  });
});

describe('lov bez kalendáře a lovu navíc (hunting.md – Pravidla 1)', () => {
  it('ze stavu lovu zmizí naděje, lov dne a lov navíc, úlovek roku zůstane; podruhé beze změny', () => {
    const old = migrateVillage(founded(), load);
    const year = { boar: 2, deer: 1, wolves: 0, bear: 0, meatKg: 140, days: 3 };
    const legacy = {
      hope: { boar: 0.4, deer: 0.2, wolf: 0, bear: 0 },
      today: { day: DAY, target: 'game', riders: [], foot: [1], extra: true },
      extraDay: DAY,
      lastExtraDay: DAY,
      year: { ...year },
    };
    Object.assign(old.wildlife!, { hunt: legacy });
    const once = migrateVillage(old, advance);
    expect(once.wildlife!.hunt).toEqual({ year });
    expect(migrateVillage(once, advance)).toBe(once);
    expect(migrateVillage(once, load)).toBe(once);
    // vstupní stav beze změny
    expect(old.wildlife!.hunt).toBe(legacy);
    expect(Object.keys(legacy)).toEqual(['hope', 'today', 'extraDay', 'lastExtraDay', 'year']);
  });

  it('nový stav lovu (úlovek roku a honci) se nepřevádí', () => {
    const s = migrateVillage(founded(), load);
    s.wildlife!.hunt = {
      year: { boar: 0, deer: 0, wolves: 0, bear: 0, meatKg: 0, days: 0 },
      beaters: { day: DAY + 1, men: 6 },
    };
    expect(migrateVillage(s, advance)).toBe(s);
  });
});

describe('dvě zásoby uzeného (diet.md – Pořadí jídla, Uzené z porážky 1. 11. rovným dílem)', () => {
  /** Ves před převodem – uzené 400 kg bez rozdělení na zásoby, poslední den `lastDay`. */
  const unconverted = (lastDay: number): VillageState => {
    const s = { ...founded(), lastDay, meatKg: 400 };
    delete s.slaughterMeatKg;
    return s;
  };
  const day = (year: number, month: number, d: number): number =>
    dayIndexOf({ year, month, day: d });

  it('mezi 1. 11. a 31. 8. je uzené zásobou z porážky 1. 11., v září a říjnu ostatním', () => {
    for (const lastDay of [day(601, 11, 1), day(602, 1, 15), day(602, 8, 31)]) {
      const next = migrateVillage(unconverted(lastDay), advance);
      expect(next.slaughterMeatKg).toBe(400);
      expect(next.meatKg).toBe(400);
    }
    for (const lastDay of [day(602, 9, 1), day(602, 10, 31)]) {
      const next = migrateVillage(unconverted(lastDay), advance);
      expect(next.slaughterMeatKg).toBe(0);
      expect(next.meatKg).toBe(400);
    }
  });

  it('jednou – převedená ves (i s 0) a nová ves se vrátí beze změny', () => {
    const once = migrateVillage(unconverted(day(602, 1, 15)), advance);
    expect(migrateVillage(once, advance)).toBe(once);
    const fresh = founded();
    expect(fresh.slaughterMeatKg).toBe(0);
    expect(migrateVillage(fresh, advance).slaughterMeatKg).toBe(0);
  });
});
