import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS, generateAcceptedLandscape } from '../../domain/landscape';
import type { Direction8 } from '../../domain/village';
import type { GridCell } from '../../domain/village/people/world-grid';
import { cellDistance, cellLandscapeSeed, isDry, skeletonSlice, WORLD } from '../../domain/world';
import { emptyCellLandscape, settledCellLandscape } from '../cell-landscape';
import {
  FOREIGN_MAP_THERE,
  NO_DRY_MAP_THERE,
  OWN_MAP_THERE,
  targetSettlement,
} from '../new-village';
import type { NewSettlement, Settlement } from '../settlements';
import type { VillageRepository } from '../villages';
import { InMemorySettlements } from './in-memory-settlements';

// Ves syna (NPC vojvody) na suché mapě nebo na stezce bez řeky – world-skeleton.md – Otevřené
// otázky 3 (Martin 8. 11. 2026: „NPC budou mít normální mapy. Prémiové jen lidští hráči.“)
// a markets.md – Rozhodnutí plánu 4, bod 11 (Martin 22. 11. 2026: „ok“).

// seed světa 1: políčky (−4, −1), (−4, −2), (−4, −3) a (−3, −3) teče řeka kostry, (−3, −2) je
// suché; stezka bez řeky vede např. políčky (7, −1), (7, −3), (7, −5) a (7, −6), řeka se stezkou
// políčkem (7, −4) (world.md – Kostra světa)
const WORLD_SEED = 1;
const PLAYER = 'hrac';
/** Test generuje krajiny s překážkami (CPU) – pod zátěží stroje to přesáhne výchozí mez. */
const LANDSCAPES_MS = 60_000;
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

/** Cizí mapy na všech políčkách v dosahu hledání kolem `target` – kromě něj a domova `home`. */
async function surround(
  settlements: InMemorySettlements,
  home: GridCell,
  target: GridCell,
  except: readonly GridCell[] = [],
): Promise<void> {
  const reach = WORLD.sonDryRings;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const cell = { x: target.x + dx, y: target.y + dy };
      const free = [home, target, ...except].some((c) => c.x === cell.x && c.y === cell.y);
      if (!free) await foreignMap(settlements, cell);
    }
  }
}

const deps = (settlements: InMemorySettlements): Parameters<typeof targetSettlement>[0] => ({
  settlements,
  villages: noVillages,
  worldSeed: WORLD_SEED,
});

describe('targetSettlement – ves syna k políčku s řekou a na suché mapě', () => {
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
    if (!result.ok) throw new Error(result.reason);
    const cell = { x: -2, y: -2 };
    expect(result.settlement.worldCell).toEqual(cell);
    // suchá mapa jako dřív – bez výřezu, bez verze `skeleton` a se seedem průměrné krajiny políčka
    expect(result.settlement).not.toHaveProperty('skeleton');
    expect(result.settlement.layerVersions).toBe(CURRENT_LAYER_VERSIONS);
    const accepted = generateAcceptedLandscape(cellLandscapeSeed(WORLD_SEED, cell));
    expect(result.settlement.landscapeSeed).toBe(accepted.seed);
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

  it('v dosahu žádné políčko bez řeky a bez cizí mapy – NO_DRY_MAP_THERE', async () => {
    const { settlements, from } = await setup(home);
    await surround(settlements, home, { x: -4, y: -2 });
    const refused = await targetSettlement(deps(settlements), from, PLAYER, 'W');
    expect(refused).toEqual({ ok: false, reason: NO_DRY_MAP_THERE });
    expect(NO_DRY_MAP_THERE).toBe('Tím směrem není volná krajina bez řeky.');
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

describe('targetSettlement – ves syna na stezce bez řeky (markets.md, Rozhodnutí plánu 4, bod 11)', () => {
  /** Sídlo ve směru `direction` z domova `home`, nebo chyba s důvodem. */
  async function leave(
    home: GridCell,
    direction: Direction8,
    prepare: (settlements: InMemorySettlements) => Promise<unknown> = () => Promise.resolve(),
  ): Promise<{ settlement: Settlement; settlements: InMemorySettlements; from: Settlement }> {
    const { settlements, from } = await setup(home);
    await prepare(settlements);
    const result = await targetSettlement(deps(settlements), from, PLAYER, direction);
    if (!result.ok) throw new Error(result.reason);
    return { settlement: result.settlement, settlements, from };
  }

  it.each<[string, GridCell, Direction8, GridCell, number]>([
    ['průchod', { x: 8, y: -1 }, 'W', { x: 7, y: -1 }, 2],
    ['průchod, přijatý až druhý pokus', { x: 1, y: -9 }, 'W', { x: 0, y: -9 }, 2],
    ['křižovatka', { x: 8, y: 12 }, 'NE', { x: 9, y: 13 }, 4],
    ['konec stezky', { x: -10, y: 25 }, 'N', { x: -10, y: 26 }, 1],
  ])(
    'políčko se stezkou (%s): výřez políčka a tatáž krajina jako prázdné políčko',
    async (_name, home, direction, cell, trails) => {
      const slice = skeletonSlice(WORLD_SEED, cell)!;
      expect([slice.trails.length, slice.rivers.length]).toEqual([trails, 0]);
      const { settlement, settlements, from } = await leave(home, direction);
      const empty = emptyCellLandscape(WORLD_SEED, cell);
      expect(settlement).toMatchObject({ ownerId: PLAYER, isSeat: false, worldCell: cell });
      expect(settlement.skeleton).toEqual(slice);
      expect(settlement.layerVersions).toEqual({ ...CURRENT_LAYER_VERSIONS, skeleton: 1 });
      expect(settlement.landscapeSeed).toBe(empty.seed);
      // prémie zůstává hráčům
      expect(settlement.premiumType ?? null).toBeNull();
      // mapa vsi = mapa, kudy vojsko a výpravy šly, dokud byla prázdná – bit po bitu i s překážkami
      const settled = settledCellLandscape(
        settlement.landscapeSeed,
        settlement.layerVersions,
        undefined,
        settlement.skeleton,
      );
      expect(settled.landscape).toEqual(empty.landscape);
      expect(settled.obstacles).toEqual(empty.obstacles);
      // opakovaný odchod týmž směrem najde totéž vlastní sídlo
      const again = await targetSettlement(deps(settlements), from, PLAYER, direction);
      expect(again).toEqual({ ok: true, settlement });
      expect(settlements.settlements).toHaveLength(2);
    },
    LANDSCAPES_MS,
  );

  it(
    'řeka vedle stezky: nejbližší políčko bez řeky je stezka; cizí mapa na ní se přeskočí',
    async () => {
      const home = { x: 8, y: -6 };
      expect(skeletonSlice(WORLD_SEED, { x: 8, y: -5 })?.rivers.length).toBeGreaterThan(0);
      const first = await leave(home, 'N');
      expect(first.settlement.worldCell).toEqual({ x: 7, y: -5 });
      expect(first.settlement.skeleton).toEqual(skeletonSlice(WORLD_SEED, { x: 7, y: -5 }));
      const next = await leave(home, 'N', (s) => foreignMap(s, { x: 7, y: -5 }));
      expect(next.settlement.worldCell).toEqual({ x: 7, y: -6 });
      expect(next.settlement.skeleton).toEqual(skeletonSlice(WORLD_SEED, { x: 7, y: -6 }));
      // všechny stezky v dosahu cizí – ves na suchém políčku jako dřív, bez výřezu
      const dry = await leave(home, 'N', (s) =>
        surround(s, home, { x: 8, y: -5 }, [{ x: 9, y: -4 }]),
      );
      expect(dry.settlement.worldCell).toEqual({ x: 9, y: -4 });
      expect(dry.settlement).not.toHaveProperty('skeleton');
      expect(dry.settlement.layerVersions).toBe(CURRENT_LAYER_VERSIONS);
    },
    LANDSCAPES_MS,
  );

  it(
    'řeka se stezkou (brod) ne – nejbližší jiné políčko bez řeky',
    async () => {
      const ford = skeletonSlice(WORLD_SEED, { x: 7, y: -4 })!;
      expect([ford.trails.length, ford.rivers.length]).toEqual([2, 2]);
      const { settlement } = await leave({ x: 8, y: -3 }, 'SW');
      expect(settlement.worldCell).toEqual({ x: 7, y: -3 });
      expect(settlement.skeleton).toEqual(skeletonSlice(WORLD_SEED, { x: 7, y: -3 }));
      // v dosahu jen políčko s řekou a stezkou – není kam
      const { settlements, from } = await setup({ x: 8, y: -3 });
      await surround(settlements, { x: 8, y: -3 }, { x: 7, y: -4 });
      const refused = await targetSettlement(deps(settlements), from, PLAYER, 'SW');
      expect(refused).toEqual({ ok: false, reason: NO_DRY_MAP_THERE });
    },
    LANDSCAPES_MS,
  );

  it('cizí mapa na políčku se stezkou ve směru – FOREIGN_MAP_THERE', async () => {
    const { settlements, from } = await setup({ x: 8, y: -1 });
    await foreignMap(settlements, { x: 7, y: -1 });
    const refused = await targetSettlement(deps(settlements), from, PLAYER, 'W');
    expect(refused).toEqual({ ok: false, reason: FOREIGN_MAP_THERE });
  });

  it.each<[string, Partial<NewSettlement>]>([
    ['bez výřezu (z doby před kostrou)', {}],
    [
      's jiným uloženým výřezem',
      {
        layerVersions: { ...CURRENT_LAYER_VERSIONS, skeleton: 1 },
        skeleton: { world: 1, rivers: [], trails: [{ side: 'N', at: 60 }] },
      },
    ],
  ])(
    'vlastní starší sídlo bez vsí na stezce se použije, jak je uložené – %s',
    async (_n, stored) => {
      // přímo ve směru i jako náhrada za řeku vedle
      for (const [home, direction, cell] of [
        [{ x: 8, y: -1 }, 'W', { x: 7, y: -1 }],
        [{ x: 8, y: -6 }, 'N', { x: 7, y: -5 }],
      ] as const) {
        const { settlements, from } = await setup(home);
        const old = await settlements.create({
          ownerId: PLAYER,
          landscapeSeed: 77,
          layerVersions: CURRENT_LAYER_VERSIONS,
          worldCell: cell,
          ...stored,
        });
        const before = structuredClone(old);
        const result = await targetSettlement(deps(settlements), from, PLAYER, direction);
        expect(result).toEqual({ ok: true, settlement: before });
        expect(settlements.settlements).toHaveLength(2);
        // stojí-li na něm ves, odejít tam nejde
        const standing = {
          ...deps(settlements),
          villages: {
            listBySettlement: (id: string) => Promise.resolve(id === old!.id ? [{}] : []),
          } as unknown as VillageRepository,
        };
        expect(await targetSettlement(standing, from, PLAYER, direction)).toEqual({
          ok: false,
          reason: OWN_MAP_THERE,
        });
      }
    },
  );

  it(
    'souběh: políčko mezitím zabral jiný hráč – FOREIGN_MAP_THERE; souběžný vlastní odchod – totéž sídlo',
    async () => {
      for (const owner of ['cizi', PLAYER]) {
        const { settlements, from } = await setup({ x: 8, y: -1 });
        const create = settlements.create.bind(settlements);
        settlements.create = async (input) => {
          await create({ ...input, ownerId: owner });
          return create(input);
        };
        const result = await targetSettlement(deps(settlements), from, PLAYER, 'W');
        const [, taken] = settlements.settlements;
        expect(taken).toMatchObject({ ownerId: owner, worldCell: { x: 7, y: -1 } });
        expect(result).toEqual(
          owner === PLAYER
            ? { ok: true, settlement: taken }
            : { ok: false, reason: FOREIGN_MAP_THERE },
        );
      }
    },
    LANDSCAPES_MS,
  );
});
