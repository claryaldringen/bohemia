// Rod vojvody pro rozhraní jmen (lord.md – Jména, Kde se jméno zadává, Kde se jméno ukazuje): kdo
// čeká na jméno a jména rodu. Čistý modul – počítá ho server ze stavu vsi (village-view.ts).
import {
  ageYears,
  currentLord,
  isDynastyTracked,
  leadingSons,
  lineMen,
  sonHorse,
  sonShare,
  type VillageState,
} from '@bohemia/game';
import type { DepartingSon, DynastyView, UnnamedLineMan } from './village-view-types';

/** Synové vojvody od 16 let pro odchod (lord.md – Dělení vsi): kdo smí vést a jaký má díl. */
function departingSons(state: VillageState, day: number): DepartingSon[] {
  return leadingSons(state, day).map(({ son, check }): DepartingSon => {
    const share = check.ok ? sonShare(state, son.id, day) : null;
    return {
      id: son.id,
      ...(son.name !== undefined ? { name: son.name } : {}),
      age: ageYears(son.bornDay, day),
      reason: check.ok ? null : check.reason,
      dwellingIds: share?.dwellingIds ?? [],
      people: share?.personIds.length ?? 0,
      horse: check.ok && sonHorse(state, son.id) !== undefined,
    };
  });
}

/** Rod vsi v den `day`; ves bez rodu null. */
export function dynastyView(state: VillageState, day: number): DynastyView | null {
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
    sons: departingSons(state, day),
  };
}
