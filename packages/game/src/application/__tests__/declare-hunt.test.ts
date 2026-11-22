import { describe, expect, it } from 'vitest';
import { dayIndexOf } from '../../domain/calendar';
import { HUNT_DENIED_TEXT, withDynasty } from '../../domain/village';
import { at, horseVillage } from '../../domain/village/__tests__/horse-fixtures';
import { freshWildlife } from '../../domain/village/wildlife/wildlife';
import { WILDLIFE_LAND } from '../../domain/village/rules/rules-wildlife';
import { makeLandscape } from '../../domain/village/__tests__/placement-fixtures';
import { foundVillageForSettlement } from '../found-village';
import { declareHuntInVillage } from '../declare-hunt';
import type { SeedSource } from '../settlements';
import { InMemoryVillages } from './in-memory-villages';

// Lov na tlačítko dvorce (hunting.md – Pravidla 2): hájení odepře, jinak honci na zítřek.

const landscape = makeLandscape();
const seeds: SeedSource = { nextSeed: () => 4242 };
const FOUNDED = dayIndexOf({ year: 503, month: 4, day: 12 });

/** Ves rodu založená v dubnu; muži rodu zdraví a vycvičení (bez nich není kdo jít). */
async function setup(): Promise<{ villages: InMemoryVillages; villageId: string }> {
  const villages = new InMemoryVillages();
  const founded = await foundVillageForSettlement(
    { villages, seeds },
    {
      settlementId: 'settlement-1',
      landscape,
      today: FOUNDED,
      name: 'Libice',
      dwelling: { x: -50, z: -50, rotation: 0 },
      lordName: 'Bořivoj',
    },
  );
  if (!founded.ok) throw new Error(founded.reason);
  return { villages, villageId: founded.village.id };
}

describe('declareHuntInVillage', () => {
  it('v dubnu odepře s důvodem hájení a nic neuloží', async () => {
    const { villages, villageId } = await setup();
    const saves = villages.saves;
    const result = await declareHuntInVillage(
      { villages },
      { villageId, today: FOUNDED + 1, landscape },
    );
    expect(result).toEqual({ ok: false, reason: HUNT_DENIED_TEXT['closed-season'] });
    expect(villages.saves).toBe(saves);
  });

  /** Ves rodu v létě (dopočítaná do předvečera `summer`) se zvěří a `men` muži navíc mimo dvorec. */
  async function summerVillage(
    summer: number,
    men: number,
  ): Promise<{
    villages: InMemoryVillages;
    villageId: string;
  }> {
    const { villages, villageId } = await setup();
    villages.edit(villageId, (state) => {
      const base = horseVillage(null, 2, 4);
      delete base.dynasty;
      const fixture = withDynasty(base);
      fixture.lastDay = summer - 1;
      fixture.wildlife = freshWildlife({ ...WILDLIFE_LAND.defaultLand }, 0);
      const home = fixture.people.find((p) => p.id === 20)!.dwellingId;
      for (let i = 0; i < men; i++) {
        fixture.people.push({
          id: 500 + i,
          bornDay: summer - 9000 - i,
          dwellingId: home,
          sex: 'male',
        });
      }
      Object.assign(state, fixture);
    });
    return { villages, villageId };
  }

  it('v létě vyhlásí lov – honci chybí zítra, pořadí vyhlášení přibude; druhý lov týž den honce přičte', async () => {
    const summer = at(602, 7, 10);
    const { villages, villageId } = await summerVillage(summer, 16);
    const first = await declareHuntInVillage({ villages }, { villageId, today: summer, landscape });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.village.state.lastDay).toBe(summer);
    expect(first.village.state.wildlife?.hunt?.beaters).toEqual({ day: summer + 1, men: 6 });
    expect(first.village.state.wildlife?.hunt?.declared).toBe(1);
    const second = await declareHuntInVillage(
      { villages },
      { villageId, today: summer, landscape },
    );
    expect(second.ok).toBe(true);
    const stored = villages.records.get(villageId)!.state;
    expect(stored.wildlife?.hunt?.beaters).toEqual({ day: summer + 1, men: 12 });
    expect(stored.wildlife?.hunt?.declared).toBe(2);
  });

  it('malá ves, která zítra neuvolní 6 mužů na honce, lov nevyhlásí a nic neuloží', async () => {
    const summer = at(602, 7, 10);
    const { villages, villageId } = await summerVillage(summer, 0);
    const saves = villages.saves;
    const result = await declareHuntInVillage(
      { villages },
      { villageId, today: summer, landscape },
    );
    expect(result).toEqual({ ok: false, reason: HUNT_DENIED_TEXT['no-beaters'] });
    expect(villages.saves).toBe(saves);
  });

  it('31. 5. smí – honci jdou 1. 6., po hájení', async () => {
    const may = at(602, 5, 31);
    const { villages, villageId } = await summerVillage(may, 16);
    const result = await declareHuntInVillage({ villages }, { villageId, today: may, landscape });
    expect(result.ok).toBe(true);
  });

  it('cizí ves odmítne', async () => {
    const { villages } = await setup();
    const result = await declareHuntInVillage(
      { villages },
      { villageId: 'neexistuje', today: FOUNDED, landscape },
    );
    expect(result.ok).toBe(false);
  });
});
