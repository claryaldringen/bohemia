import { describe, expect, it } from 'vitest';
import { generateLandscape, obstaclesOf, tileCenterWorld } from '../../../landscape';
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
