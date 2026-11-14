import type { House } from './houses';
import { chronicleHouses, houseName, type NegotiationVillages } from './negotiation-chronicle';

// Neutrální zápisy války do kronik obou rodů (war.md – Co hráč vidí, Kronika): žádné hodnocení.

/**
 * Zapíše krok války do vlastní vsi obou rodů přes schránku (opakování je bezpečné – jedinečný `ref`).
 * `declared` a `ambush`: `a` je ten, kdo válku začal, záznam je pro oba stejný. `quiet` a `peace`:
 * každý rod dostane záznam o druhé straně („Válka s Bořivojem utichla.“).
 */
export async function chronicleWar(
  deps: NegotiationVillages,
  a: Pick<House, 'lord'>,
  b: Pick<House, 'lord'>,
  step: 'declared' | 'ambush' | 'quiet' | 'peace',
  ref: string,
  day: number,
): Promise<void> {
  const nameA = await houseName(deps, a);
  const nameB = await houseName(deps, b);
  if (step === 'declared' || step === 'ambush') {
    await chronicleHouses(deps, [a, b], ref, {
      day,
      kind: 'war',
      step,
      actor: nameA,
      other: nameB,
    });
    return;
  }
  await chronicleHouses(deps, [a], `${ref}:a`, {
    day,
    kind: 'war',
    step,
    actor: nameA,
    other: nameB,
  });
  await chronicleHouses(deps, [b], `${ref}:b`, {
    day,
    kind: 'war',
    step,
    actor: nameB,
    other: nameA,
  });
}
