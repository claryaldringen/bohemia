import { describe, expect, it } from 'vitest';
import { CURRENT_LAYER_VERSIONS } from '../../domain/landscape';
import type { Person, VillageState } from '../../domain/village';
import { DAY, kin, village } from '../../domain/village/__tests__/kin-fixtures';
import { NOT_PLAYER_VILLAGE } from '../player-villages';
import {
  ACTION_RIGHTS,
  ALL_RIGHTS,
  decidesSenior,
  ledBy,
  requireRight,
  villageRights,
  type VillageRight,
} from '../rights';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';

// Práva hráče ve vsích rodu (seniorate.md – Seniorát; Martin 2. 11. 2026: „Jen se dívat“).

const PLAYER = 'hrac-1';
const SENIOR_RIGHTS: VillageRight[] = ['build', 'veto', 'evacuate'];

interface Man {
  id: number;
  age: number;
  name?: string;
}

/** Ves s muži rodu; `lord` = vojvoda (bez něj ves bez vojvody). */
function rodVillage(men: Man[], lord?: number): VillageState {
  const people: Person[] = men.map((m) => ({
    ...kin({ id: m.id, age: m.age, sex: 'male' }),
    line: true,
    ...(m.name ? { name: m.name } : {}),
  }));
  return village([], undefined, {
    people,
    ...(lord === undefined
      ? {}
      : { dynasty: { lordId: lord, lords: [{ id: lord, fromDay: DAY }] } }),
  });
}

/** Rod hráče: A (hráčův muž), B (vojvoda Ctibor), C (ves bez vojvody); stáří určuje seniora. */
async function world(ages: { player: number; ctibor: number }): Promise<{
  deps: { houses: InMemoryHouses; settlements: InMemorySettlements; villages: InMemoryVillages };
  ids: { a: string; b: string; c: string };
}> {
  const houses = new InMemoryHouses();
  const settlements = new InMemorySettlements();
  const villages = new InMemoryVillages();
  const house = await houses.create({ playerId: PLAYER, kind: 'player', createdAt: new Date(0) });
  const states = [
    rodVillage([{ id: 10, age: ages.player, name: 'Bořivoj' }], 10),
    rodVillage([{ id: 20, age: ages.ctibor, name: 'Ctibor' }], 20),
    rodVillage([{ id: 30, age: 10 }]),
  ];
  const ids: string[] = [];
  for (const [i, state] of states.entries()) {
    const settlement =
      i === 0
        ? await settlements.seatAtOrigin({
            ownerId: PLAYER,
            landscapeSeed: 11,
            layerVersions: CURRENT_LAYER_VERSIONS,
          })
        : (await settlements.create({
            ownerId: PLAYER,
            landscapeSeed: 11 + i,
            layerVersions: CURRENT_LAYER_VERSIONS,
            worldCell: { x: i, y: 0 },
          }))!;
    ids.push((await villages.add(settlement.id, `Ves ${i}`, state)).id);
  }
  await houses.setLord(house.id, { villageId: ids[0]!, personId: 10 });
  return { deps: { houses, settlements, villages }, ids: { a: ids[0]!, b: ids[1]!, c: ids[2]! } };
}

const ask = (
  w: Awaited<ReturnType<typeof world>>,
  villageId: string,
  right: VillageRight,
): Promise<unknown> => requireRight(w.deps, { playerId: PLAYER, villageId, right, today: DAY });

describe('práva ve vsích rodu – tabulka situací', () => {
  // [situace, ves, stáří hráčova muže, stáří Ctibora, povolená práva, důvod]
  const table: [string, 'a' | 'b' | 'c', number, number, VillageRight[], string | null][] = [
    ['vlastní ves', 'a', 40, 55, [...ALL_RIGHTS], null],
    ['senior v cizí vsi rodu', 'b', 60, 30, SENIOR_RIGHTS, ledBy('Ctibor')],
    ['nesenior v cizí vsi rodu', 'b', 40, 55, [], decidesSenior('Ctibor')],
    ['ves bez vojvody spravovaná sám', 'c', 40, 55, [...ALL_RIGHTS], null],
  ];

  for (const [name, which, player, ctibor, allowed, reason] of table) {
    it(name, async () => {
      const w = await world({ player, ctibor });
      const villageId = w.ids[which];
      for (const right of ALL_RIGHTS) {
        const result = await ask(w, villageId, right);
        if (allowed.includes(right)) expect(typeof result, `${name}: ${right}`).toBe('object');
        else expect(result, `${name}: ${right}`).toBe(reason);
      }
    });
  }

  it('villageRights je čistá funkce: reason a množina práv', () => {
    const states = [
      { villageId: 'a', state: rodVillage([{ id: 10, age: 40, name: 'Bořivoj' }], 10) },
      { villageId: 'b', state: rodVillage([{ id: 20, age: 55, name: 'Ctibor' }], 20) },
    ];
    const rights = villageRights({
      villageId: 'b',
      villages: states,
      playerLord: { villageId: 'a', personId: 10 },
      day: DAY,
    });
    expect(rights.allowed.size).toBe(0);
    expect(rights.reason).toBe('Rozhoduje Ctibor.');
  });

  it('před převodem (bez hráčova muže) a pro cizí ves platí dosavadní pravidla', async () => {
    const w = await world({ player: 40, ctibor: 55 });
    await w.deps.houses.setLord(w.deps.houses.houses[0]!.id, null);
    expect(typeof (await ask(w, w.ids.b, 'build'))).toBe('object');
    expect(
      await requireRight(w.deps, {
        playerId: 'cizi',
        villageId: w.ids.a,
        right: 'build',
        today: DAY,
      }),
    ).toBe(NOT_PLAYER_VILLAGE);
  });
});

describe('každá akce nad vsí odmítne hráče bez práva', () => {
  // Seznam akcí je `ACTION_RIGHTS`; vstupní bod (`actOn` v apps/web/lib/village.ts) bere jméno
  // akce jen odtud a test apps/web/lib/__tests__/action-rights.test.ts hlídá, že žádná
  // `…ForPlayer` akce nezůstane mimo. Nová akce = nový klíč v `ACTION_RIGHTS` → tenhle test ji
  // projde sám.
  it('nesenior v cizí vsi: žádná akce neprojde a vrátí důvod', async () => {
    const w = await world({ player: 40, ctibor: 55 });
    for (const [action, right] of Object.entries(ACTION_RIGHTS)) {
      expect(await ask(w, w.ids.b, right), action).toBe('Rozhoduje Ctibor.');
    }
  });

  it('senior v cizí vsi: akce bez práva seniora odmítne „Ves vede …“', async () => {
    const w = await world({ player: 60, ctibor: 30 });
    for (const [action, right] of Object.entries(ACTION_RIGHTS)) {
      const result = await ask(w, w.ids.b, right);
      if (SENIOR_RIGHTS.includes(right)) expect(typeof result, action).toBe('object');
      else expect(result, action).toBe('Ves vede Ctibor.');
    }
  });
});
