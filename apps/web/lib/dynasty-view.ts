// Rod vojvody pro rozhraní jmen (lord.md – Jména, Kde se jméno zadává, Kde se jméno ukazuje): kdo
// čeká na jméno a jména rodu. Čistý modul – počítá ho server ze stavu vsi (village-view.ts).
import {
  ageYears,
  currentLord,
  isDynastyTracked,
  leadingSons,
  lineMen,
  sonDeparturePreview,
  type VillageState,
} from '@bohemia/game';
import type { DepartingSon, DynastyView, UnnamedLineMan } from './village-view-types';

/** Synové vojvody od 16 let pro odchod (lord.md – Dělení vsi): kdo smí vést a jaký má díl. */
function departingSons(state: VillageState, day: number): DepartingSon[] {
  return leadingSons(state, day).map(({ son, check }): DepartingSon => {
    // náhled jen pro syna, který smí vést – jednou, stejnými funkcemi jako skutečný odchod
    const preview = check.ok ? sonDeparturePreview(state, son.id, day) : null;
    return {
      id: son.id,
      ...(son.name !== undefined ? { name: son.name } : {}),
      age: ageYears(son.bornDay, day),
      reason: check.ok ? null : check.reason,
      dwellingIds: preview?.outlineDwellingIds ?? [],
      people: preview?.people ?? 0,
      foodKg: preview?.foodKg ?? 0,
      cart: preview?.cart ?? null,
      horse: preview?.horse ?? false,
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
