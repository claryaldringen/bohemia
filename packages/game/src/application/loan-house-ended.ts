import type { DialogRepository } from './dialogs';
import type { LoanRepository } from './loans';
import type { VassalageRepository } from './vassalages';

/**
 * Háček pro konec rodu (úloha 4.10): rod, který vymřel **bez pána**, nechává dluhy nezaplacené –
 * půjčky, kde je dlužníkem, se zruší (věřitel je neodepíše z hlavy, ale není kdo splácí) a jejich
 * dialogy splátek zmizí. Má-li rod pána, dluh zůstává (řeší nástupnictví / odúmrť v 4.10).
 * Vrací, kolik půjček zrušil.
 */
export async function onHouseEnded(
  deps: {
    loans: Pick<LoanRepository, 'cancelOfDebtor'>;
    vassalages: Pick<VassalageRepository, 'activeOf'>;
    dialogs?: Pick<DialogRepository, 'dropFor'>;
  },
  houseId: string,
  at: Date,
): Promise<number> {
  const hasLord = (await deps.vassalages.activeOf(houseId)).some(
    (v) => v.vassalHouseId === houseId,
  );
  if (hasLord) return 0;
  const cancelled = await deps.loans.cancelOfDebtor(houseId, at);
  for (const id of cancelled) await deps.dialogs?.dropFor(id);
  return cancelled.length;
}
