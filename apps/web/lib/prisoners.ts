import { decidePrisoner, type NegotiateDeps, type PrisonerResult } from '@bohemia/game';
import { acceptanceDeps } from '@bohemia/server';
import { gameDeps, playerToday } from './game';

// Composition root zajatců (war.md – Vzdaní, zajetí a výkupné): rozhodnutí věznitele a hlásiče
// výkupného pro jednání. Herní logika je v `packages/game/src/application/prisoners.ts`.

/** Hlásiče výkupného pro `NegotiateDeps.ransom` – tytéž jako u přijetí (`acceptanceDeps`). */
export function ransom(): NonNullable<NegotiateDeps['ransom']> {
  return acceptanceDeps(gameDeps()).ransom;
}

/** Věznitel rozhodne o zajatci: držet, propustit, popravit. */
export async function decidePrisonerForPlayer(
  playerId: string,
  input: { prisonerId: string; action: 'hold' | 'release' | 'execute' },
): Promise<PrisonerResult> {
  const today = await playerToday(playerId);
  if (!today.ok) return { ok: false, reason: today.error };
  const deps = gameDeps();
  return decidePrisoner(
    {
      prisoners: deps.prisoners,
      villages: deps.villages,
      settlements: deps.settlements,
      locks: deps.locks,
      now: deps.now,
    },
    { playerId, ...input, today: today.day },
  );
}
