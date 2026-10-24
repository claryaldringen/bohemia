// Kronika rodu pro obrazovku porážky (lord.md – Konec rodu): vojvodové po sobě se jmény a roky,
// poslední muž rodu a ves, kde rod skončil. Kronika vsi se ořezává – rod nese vlastní
// (`dynasty.lords`).
import { dateOfDayIndex, isLineExtinct, type VillageState } from '@bohemia/game';

const DAYS_PER_YEAR = 365.25;

/** Vojvoda v kronice rodu – jméno (bez jména chybí) a herní roky vlády. */
export interface LineLordView {
  name?: string;
  fromYear: number;
  toYear: number;
}

/** Rod vymřel po meči – co ukáže obrazovka porážky. */
export interface LineEndView {
  lords: LineLordView[];
  /** Poslední muž rodu (poslední vojvoda vsi, kde rod skončil); bez jména chybí. */
  last?: string;
  /** Ves, kde rod skončil – jméno, rok založení a konce rodu a kolik let žila. */
  village: string;
  foundedYear: number;
  endedYear: number;
  years: number;
}

/**
 * Kronika rodu, který vymřel (`isLineExtinct`) – z vsi, kde rod skončil nejpozději (tam zemřel
 * poslední muž rodu). Rod žije, nebo ho žádná ves nesleduje – null.
 */
export function lineEndView(
  villages: readonly { name: string; state: VillageState }[],
): LineEndView | null {
  if (!isLineExtinct(villages.map((v) => v.state))) return null;
  let where: { name: string; state: VillageState; endedDay: number } | null = null;
  for (const v of villages) {
    const endedDay = v.state.dynasty?.endedDay;
    if (endedDay !== undefined && (where === null || endedDay > where.endedDay)) {
      where = { ...v, endedDay };
    }
  }
  if (where === null) return null;
  const { state, endedDay } = where;
  const yearOf = (day: number): number => dateOfDayIndex(day).year;
  const records = state.dynasty?.lords ?? [];
  const lords = records.map((l) => ({
    ...(l.name === undefined ? {} : { name: l.name }),
    fromYear: yearOf(l.fromDay),
    toYear: yearOf(l.toDay ?? endedDay),
  }));
  const last = records.at(-1)?.name;
  return {
    lords,
    ...(last === undefined ? {} : { last }),
    village: where.name,
    foundedYear: yearOf(state.foundedDay),
    endedYear: yearOf(endedDay),
    years: Math.floor((endedDay - state.foundedDay) / DAYS_PER_YEAR),
  };
}
