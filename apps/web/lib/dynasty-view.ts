// Rod vojvody pro rozhraní jmen (lord.md – Jména, Kde se jméno zadává, Kde se jméno ukazuje): kdo
// čeká na jméno a jména rodu. Čistý modul – počítá ho server ze stavu vsi (village-view.ts).
import { ageYears, currentLord, isDynastyTracked, lineMen, type VillageState } from '@bohemia/game';
import type { DynastyView, UnnamedLineMan } from './village-view-types';

/** Rod vsi v den `day`; ves bez rodu null. */
export function dynastyView(
  state: Pick<VillageState, 'people' | 'dynasty'>,
  day: number,
): DynastyView | null {
  if (!isDynastyTracked(state)) return null;
  const lord = currentLord(state);
  const men = lineMen(state);
  const unnamed = men
    .filter((p) => p.name === undefined)
    .map((p): UnnamedLineMan & { bornDay: number } => ({
      id: p.id,
      age: ageYears(p.bornDay, day),
      lord: p.id === lord?.id,
      bornDay: p.bornDay,
    }))
    // vojvoda první, pak od nejstaršího (při shodě nižší id)
    .sort((a, b) => Number(b.lord) - Number(a.lord) || a.bornDay - b.bornDay || a.id - b.id)
    .map(({ id, age, lord: isLord }) => ({ id, age, lord: isLord }));
  const waitingHome = men
    .filter(
      (p) =>
        lord !== undefined &&
        p.id !== lord.id &&
        p.spouseId !== undefined &&
        p.dwellingId === lord.dwellingId &&
        p.name !== undefined,
    )
    .map((p) => p.name!);
  return {
    lordId: state.dynasty?.lordId ?? null,
    ...(lord?.name !== undefined ? { lordName: lord.name } : {}),
    unnamed,
    taken: men.flatMap((p) => (p.name === undefined ? [] : [p.name])),
    waitingHome,
  };
}
