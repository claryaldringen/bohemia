import {
  decidePrisoner,
  ransomHooks,
  type NegotiateDeps,
  type PrisonerResult,
} from '@bohemia/game';
import { gameDeps, playerToday } from './game';
import { prepareVillage, shipmentDeps } from './levies';

// Composition root zajatců (war.md – Vzdaní, zajetí a výkupné): rozhodnutí věznitele a hlásiče
// výkupného pro jednání. Herní logika je v `packages/game/src/application/prisoners.ts`.

/** Hlásiče výkupného pro `NegotiateDeps.ransom` (zásilka výkupného a propuštění zajatců). */
export function ransom(): NonNullable<NegotiateDeps['ransom']> {
  const deps = gameDeps();
  return ransomHooks({
    prisoners: deps.prisoners,
    villages: deps.villages,
    settlements: deps.settlements,
    locks: deps.locks,
    now: deps.now,
    houses: deps.houses,
    shipments: shipmentDeps(),
    prepareVillage,
  });
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
