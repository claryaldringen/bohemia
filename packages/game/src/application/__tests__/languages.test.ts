import { describe, expect, it } from 'vitest';
import type { LanguageGroup } from '../../domain/world';
import { enterGame } from '../enter-game';
import { chooseLanguage, type AccountLanguages } from '../languages';
import { InMemoryHouses } from './in-memory-houses';
import { InMemorySettlements } from './in-memory-settlements';
import { InMemoryVillages } from './in-memory-villages';
import { dwelling, village } from '../../domain/village/__tests__/kin-fixtures';

const NOW = new Date('2026-11-07T12:00:00Z');

function setup(): {
  accounts: AccountLanguages & { stored: Map<string, LanguageGroup> };
  houses: InMemoryHouses;
  settlements: InMemorySettlements;
  villages: InMemoryVillages;
} {
  const stored = new Map<string, LanguageGroup>();
  return {
    accounts: {
      stored,
      languageOf: async (id) => stored.get(id) ?? 'cs',
      setLanguage: async (id, language) => void stored.set(id, language),
    },
    houses: new InMemoryHouses(),
    settlements: new InMemorySettlements(),
    villages: new InMemoryVillages(),
  };
}

describe('chooseLanguage', () => {
  it('před založením vsi uloží jazyk účtu a rod ho dostane při vstupu', async () => {
    const deps = setup();
    expect(await chooseLanguage(deps, { playerId: 'p1', language: 'fr' })).toEqual({ ok: true });
    await enterGame(
      {
        settlements: deps.settlements,
        houses: deps.houses,
        worldSeed: 1,
        now: () => NOW,
        accountLanguage: (id) => deps.accounts.languageOf(id),
      },
      'p1',
    );
    expect((await deps.houses.activeOf('p1'))?.language).toBe('fr');
  });

  it('sídlo bez vsi jazyk ještě dovolí', async () => {
    const deps = setup();
    await enterGame(
      { settlements: deps.settlements, houses: deps.houses, worldSeed: 1, now: () => NOW },
      'p1',
    );
    expect(await chooseLanguage(deps, { playerId: 'p1', language: 'de' })).toEqual({ ok: true });
    expect(deps.accounts.stored.get('p1')).toBe('de');
    expect((await deps.houses.activeOf('p1'))?.language).toBe('de');
  });

  it('po založení vsi jazyk nezmění', async () => {
    const deps = setup();
    const seat = (
      await enterGame(
        { settlements: deps.settlements, houses: deps.houses, worldSeed: 1, now: () => NOW },
        'p1',
      )
    ).settlement;
    await deps.villages.add(seat.id, 'Lhota', village([], [dwelling(1)]));
    expect(await chooseLanguage(deps, { playerId: 'p1', language: 'de' })).toEqual({
      ok: false,
      reason: 'Jazyk se volí jen na začátku.',
    });
    expect(deps.accounts.stored.has('p1')).toBe(false);
    expect((await deps.houses.activeOf('p1'))?.language).toBe('cs');
  });

  it('neznámý jazyk odmítne', async () => {
    const deps = setup();
    expect(await chooseLanguage(deps, { playerId: 'p1', language: 'ru' })).toEqual({
      ok: false,
      reason: 'Neznámý jazyk.',
    });
  });
});
