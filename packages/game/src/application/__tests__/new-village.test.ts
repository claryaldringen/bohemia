import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import { cellDistance, isDry, skeletonSlice, WORLD } from '../../domain/world';
import { FOREIGN_MAP_THERE, NO_DRY_MAP_THERE, targetSettlement } from '../new-village';
import type { Settlement } from '../settlements';
import type { VillageRepository } from '../villages';
import { InMemorySettlements } from './in-memory-settlements';

// Ves syna (NPC vojvody) jen na suché mapě – world-skeleton.md – Otevřené otázky 3 (Martin
// 8. 11. 2026: „NPC budou mít normální mapy. Prémiové jen lidští hráči.“).

// seed světa 1: políčky (−4, −1), (−4, −2), (−4, −3) a (−3, −3) teče řeka kostry, (−3, −2) je
// suché (world.md – Kostra světa)
const WORLD_SEED = 1;
const PLAYER = 'hrac';
const noVillages = {
  listBySettlement: () => Promise.resolve([]),
} as unknown as VillageRepository;

async function setup(home: { x: number; y: number }): Promise<{
  settlements: InMemorySettlements;
  from: Settlement;
}> {
  const settlements = new InMemorySettlements();
  const from = await settlements.createSeat({
    ownerId: PLAYER,
    landscapeSeed: 5,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: home,
  });
  if (!from) throw new Error('Políčko je obsazené.');
  return { settlements, from };
}

/** Mapa cizího hráče na políčku `cell`. */
async function foreignMap(
  settlements: InMemorySettlements,
  cell: { x: number; y: number },
): Promise<void> {
  await settlements.create({
    ownerId: 'cizi',
    landscapeSeed: 6,
    layerVersions: CURRENT_LAYER_VERSIONS,
    worldCell: cell,
  });
}

const deps = (settlements: InMemorySettlements): Parameters<typeof targetSettlement>[0] => ({
  settlements,
  villages: noVillages,
  worldSeed: WORLD_SEED,
});

describe('targetSettlement – ves syna jen na suché mapě', () => {
  const home = { x: -3, y: -2 };

  it('k políčku s řekou kostry: ves na nejbližším suchém vedle, bez výřezu a bez `skeleton`', async () => {
    expect(isDry(skeletonSlice(WORLD_SEED, { x: -4, y: -2 }))).toBe(false);
    const { settlements, from } = await setup(home);
    const result = await targetSettlement(deps(settlements), from, PLAYER, 'W');
    if (!result.ok) throw new Error(result.reason);
    const cell = result.settlement.worldCell!;
    expect(cell).not.toEqual({ x: -4, y: -2 });
    expect(isDry(skeletonSlice(WORLD_SEED, cell))).toBe(true);
    expect(cellDistance(cell, home)).toBe(1);
    expect(result.settlement.skeleton ?? null).toBeNull();
    expect(result.settlement.layerVersions).toEqual(CURRENT_LAYER_VERSIONS);
    expect(result.settlement.layerVersions.skeleton).toBeUndefined();
    // opakovaný odchod týmž směrem najde totéž vlastní sídlo
    const again = await targetSettlement(deps(settlements), from, PLAYER, 'W');
    expect(again.ok && again.settlement.id).toBe(result.settlement.id);
  });

  it('k suchému políčku jako dřív – sousední políčko ve směru', async () => {
    expect(isDry(skeletonSlice(WORLD_SEED, { x: -2, y: -2 }))).toBe(true);
    const { settlements, from } = await setup(home);
    const result = await targetSettlement(deps(settlements), from, PLAYER, 'E');
    expect(result.ok && result.settlement.worldCell).toEqual({ x: -2, y: -2 });
    expect(result.ok && (result.settlement.skeleton ?? null)).toBeNull();
  });

  it('cizí mapa na nejbližším suchém se přeskočí; cizí mapa přímo ve směru jako dřív', async () => {
    const first = await setup(home);
    const placed = await targetSettlement(deps(first.settlements), first.from, PLAYER, 'W');
    if (!placed.ok) throw new Error(placed.reason);
    const taken = placed.settlement.worldCell!;
    // totéž, ale nejbližší suché políčko drží cizí mapa – ves vznikne na dalším suchém
    const other = await setup(home);
    await foreignMap(other.settlements, taken);
    const second = await targetSettlement(deps(other.settlements), other.from, PLAYER, 'W');
    if (!second.ok) throw new Error(second.reason);
    expect(second.settlement.worldCell).not.toEqual(taken);
    expect(isDry(skeletonSlice(WORLD_SEED, second.settlement.worldCell!))).toBe(true);
    // cizí mapa přímo ve směru – důvod beze změny, i na políčku s kostrou
    const third = await setup(home);
    await foreignMap(third.settlements, { x: -4, y: -2 });
    expect(await targetSettlement(deps(third.settlements), third.from, PLAYER, 'W')).toEqual({
      ok: false,
      reason: FOREIGN_MAP_THERE,
    });
  });

  it('v dosahu žádné suché políčko bez cizí mapy – NO_DRY_MAP_THERE', async () => {
    const { settlements, from } = await setup(home);
    // všechna políčka v dosahu kolem (−4, −2) obsadí cizí mapy
    const target = { x: -4, y: -2 };
    const reach = WORLD.sonDryRings;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const cell = { x: target.x + dx, y: target.y + dy };
        if ((dx === 0 && dy === 0) || (cell.x === home.x && cell.y === home.y)) continue;
        await foreignMap(settlements, cell);
      }
    }
    expect(await targetSettlement(deps(settlements), from, PLAYER, 'W')).toEqual({
      ok: false,
      reason: NO_DRY_MAP_THERE,
    });
  });

  it('odříznutý rod: ves v místní mřížce bez výřezu a bez `skeleton`', async () => {
    const settlements = new InMemorySettlements();
    const from = await settlements.createSeat({
      ownerId: PLAYER,
      landscapeSeed: 5,
      layerVersions: CURRENT_LAYER_VERSIONS,
      localCell: { x: 0, y: 0 },
    });
    const result = await targetSettlement(deps(settlements), from!, PLAYER, 'W');
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement.localCell).toEqual({ x: -1, y: 0 });
    expect(result.settlement.skeleton ?? null).toBeNull();
    expect(result.settlement.layerVersions.skeleton).toBeUndefined();
  });
});
