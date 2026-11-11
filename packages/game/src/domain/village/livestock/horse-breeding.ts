import { dateOfDayIndex } from '../../calendar';
import { createRandom, deriveSeed } from '../../landscape/random';
import { SLAUGHTER_DAY } from '../core/diet';
import { familyRiders } from './horse-riders';
import {
  horseAgeYears,
  horsePens,
  horsePlaces,
  isFoalByAge,
  isGrainHorse,
  penHorses,
} from './horses';
import { butcher } from './livestock';
import { lordFamily, type LordFamily } from '../people/lord';
import { HORSES } from '../rules';
import type { ChronicleEvent, Horse, Pen, VillageState } from '../types';

// Chov koní (horses.md – Chov): hříbata 1. 5., kolik koní ves chce a 1. 11. na maso koně, kteří
// dosloužili, a koně navíc. Ves bez ohrady koní se nemění.

/** Kolik koní ves chce (horses.md – Chov) – strop jsou místa v ohradách koní. */
export interface HorsesWanted {
  /** Jezdečtí koně – jezdci rodiny (muži od 10 let). */
  riding: number;
  /** Chovné klisny – 1 + 1 na každé 3 jezdce. */
  mares: number;
  /** Hříbata – kolik hřebečků bude za 3 roky chybět. */
  foals: number;
}

/** Kolik jezdeckých koní a klisen ves chce, než se ořeže místy v ohradách. */
function horsesDesired(
  state: Pick<VillageState, 'pens' | 'people' | 'manorId' | 'dwellings' | 'constructions'>,
  day: number,
  family: Pick<LordFamily, 'trainees'>,
): { riders: number; riding: number; mares: number } {
  const riders = familyRiders(family, day).length;
  // Hřebce držet vždy (Martin 31. 10. 2026) – i bez jezdců a bez klisny aspoň jeden samec
  return {
    riders,
    riding: Math.max(riders, 1),
    mares: HORSES.maresBase + Math.floor(riders / HORSES.ridersPerMare),
  };
}

/**
 * Kolik koní ves chce (horses.md – Chov): jezdeckého koně na každého jezdce rodiny, klisny
 * `maresBase` + 1 na každých `ridersPerMare` jezdců a hříbata na hřebečky, kteří budou za 3 roky
 * chybět – cvičící rodina (od 7 let, za 3 roky jezdci) proti jezdeckým koním, kteří za 3 roky
 * ještě budou sloužit. Strop jsou místa v ohradách koní (jezdečtí koně napřed, pak klisny).
 */
export function horsesWanted(
  state: Pick<VillageState, 'pens' | 'people' | 'manorId' | 'dwellings' | 'constructions'>,
  day: number,
  family: Pick<LordFamily, 'trainees'> = lordFamily(state, day),
): HorsesWanted {
  const desired = horsesDesired(state, day, family);
  const lastServing = HORSES.serviceToYears - HORSES.foalUntilYears;
  const servingLater = horsePens(state)
    .flatMap((pen) => [...penHorses(pen)])
    .filter((h) => isGrainHorse(h, day) && horseAgeYears(h, day) < lastServing).length;
  const places = horsePlaces(state);
  const riding = Math.min(desired.riding, places);
  const mares = Math.min(desired.mares, places - riding);
  const foals = Math.min(
    Math.max(0, family.trainees.length - servingLater),
    places - riding - mares,
  );
  return { riding, mares, foals };
}

/**
 * Ves chce víc jezdeckých koní a klisen, než se vejde do ohrad koní (horses.md – Chov: „Koně se
 * nevejdou do ohrady“ jako u stád) – jen ves s ohradou koní. Počítá se z téže neořezané poptávky
 * jako `horsesWanted` (bez jezdců aspoň jeden hřebec). Hříbata se nepočítají.
 */
export function horsesOverRoom(
  state: Pick<VillageState, 'pens' | 'people' | 'manorId' | 'dwellings' | 'constructions'>,
  day: number,
  family: Pick<LordFamily, 'trainees'> = lordFamily(state, day),
): boolean {
  if (horsePens(state).length === 0) return false;
  const desired = horsesDesired(state, day, family);
  return desired.riding + desired.mares > horsePlaces(state);
}

/**
 * Hříbata 1. 5. (horses.md – Chov; mutuje stav): klisna 4–20 let rodí každý druhý rok – podle
 * parity roku a svého id, ne náhodou, ať je chov stálý – jen když má ves jezdeckého koně od 3 let
 * (nejstarší je hřebec). Pohlaví ze seedu vsi, dne a klisny. Hříbě potřebuje místo v ohradách
 * koní (počítá se dopředu – do roka stojí u klisny). Vrací události kroniky.
 */
export function horseBirths(state: VillageState, day: number): ChronicleEvent[] {
  const pens = horsePens(state);
  const horses = pens.flatMap((pen) => [...penHorses(pen)]);
  if (!horses.some((h) => isGrainHorse(h, day))) return [];
  let room = horsePlaces(state) - horses.length;
  // hříbata jen podle poptávky – ne víc, než ves za 3 roky potřebuje (horses.md – Chov)
  const wanted = horsesWanted(state, day);
  room = Math.min(room, wanted.foals - horses.filter((h) => isFoalByAge(h, day)).length);
  const year = dateOfDayIndex(day).year;
  const events: ChronicleEvent[] = [];
  for (const pen of pens) {
    const foals: Horse[] = [];
    for (const mare of penHorses(pen)) {
      if (room <= 0) break;
      if (mare.sex !== 'female') continue;
      const age = horseAgeYears(mare, day);
      if (age < HORSES.breedFromYears || age >= HORSES.breedToYears) continue;
      if ((year + mare.id) % HORSES.foalEveryYears !== 0) continue;
      const random = createRandom(deriveSeed(state.seed, `foal:${day}:${mare.id}`));
      const sex = random.next() < 0.5 ? 'male' : 'female';
      foals.push({ id: state.nextId++, bornDay: day, sex, training: 0 });
      room--;
    }
    if (foals.length === 0) continue;
    pen.horses = [...penHorses(pen), ...foals];
    events.push({ day, kind: 'foal-born', penId: pen.id, foals: foals.length });
  }
  return events;
}

type Retired = 'age' | 'surplus';

/**
 * Koně na maso 1. 11. (horses.md – Chov; mutuje stav): koně od 20 let dosloužili; z koní od 3 let
 * jdou nad `horsesWanted` jezdečtí koně a klisny navíc – napřed bez jezdce a nejméně vycvičení, pak nejstarší. Hříbata ves drží, dokud
 * jsou místa (narodí se jen do míst). Každý kůň dá `HORSES.meatKg` masa do uzení. Vrací události
 * kroniky – za ohradu a důvod.
 */
export function retireHorses(
  state: VillageState,
  day: number,
  family?: Pick<LordFamily, 'trainees'>,
): ChronicleEvent[] {
  const pens = horsePens(state);
  const all = pens.flatMap((pen) => penHorses(pen).map((horse) => ({ pen, horse })));
  if (all.length === 0) return [];
  const gone = new Map<Horse, Retired>();
  for (const { horse } of all) {
    if (horseAgeYears(horse, day) >= HORSES.serviceToYears) gone.set(horse, 'age');
  }
  const wanted = horsesWanted(state, day, family ?? lordFamily(state, day));
  const kept = all.filter(({ horse }) => !gone.has(horse));
  const surplus = (list: { pen: Pen; horse: Horse }[], want: number): void => {
    // napřed koně bez jezdce a nejméně vycvičení, pak nejstarší
    list
      .sort(
        (a, b) =>
          Number(a.horse.riderId !== undefined) - Number(b.horse.riderId !== undefined) ||
          a.horse.training - b.horse.training ||
          a.horse.bornDay - b.horse.bornDay ||
          a.pen.id - b.pen.id ||
          a.horse.id - b.horse.id,
      )
      .slice(0, Math.max(0, list.length - want))
      .forEach(({ horse }) => gone.set(horse, 'surplus'));
  };
  surplus(
    kept.filter(({ horse }) => isGrainHorse(horse, day)),
    wanted.riding,
  );
  surplus(
    kept.filter(({ horse }) => horse.sex === 'female' && !isFoalByAge(horse, day)),
    wanted.mares,
  );
  if (gone.size === 0) return [];
  butcher(state, gone.size * HORSES.meatKg);
  const events: ChronicleEvent[] = [];
  for (const pen of pens) {
    const horses = penHorses(pen);
    for (const reason of ['age', 'surplus'] as const) {
      const n = horses.filter((h) => gone.get(h) === reason).length;
      if (n > 0) events.push({ day, kind: 'horse-retired', penId: pen.id, horses: n, reason });
    }
    if (horses.some((h) => gone.has(h))) pen.horses = horses.filter((h) => !gone.has(h));
  }
  return events;
}

/**
 * Čekající koně bez ohrady (`looseHorses` – lord.md, Kůň syna; mutuje stav) 1. 11.: ti, kdo
 * dosloužili (od `HORSES.serviceToYears`), jdou na maso jako v ohradě (horses.md – Chov: kůň
 * čekající v nové vsi stárne jako ostatní). Ostatní čekají dál (nad potřebu se tu nepočítá – ves
 * ještě nemá ohradu, poptávku ani místa).
 */
export function retireLooseHorses(state: VillageState, day: number): void {
  const loose = state.looseHorses;
  if (!loose || loose.length === 0) return;
  const kept = loose.filter((h) => horseAgeYears(h, day) < HORSES.serviceToYears);
  const gone = loose.length - kept.length;
  if (gone === 0) return;
  butcher(state, gone * HORSES.meatKg);
  if (kept.length > 0) state.looseHorses = kept;
  else delete state.looseHorses;
}

/**
 * Den chovu koní (horses.md – Chov; mutuje stav): 1. 5. hříbata, 1. 11. koně na maso. Úhyn bez
 * sena 1. 3. řeší `horsesWinterEnd` (pokrytí sena zná den hospodářství). Ves bez ohrady koní nic.
 */
export function horsesDay(state: VillageState, day: number): ChronicleEvent[] {
  const date = dateOfDayIndex(day);
  const on = (d: { month: number; day: number }): boolean =>
    date.month === d.month && date.day === d.day;
  // čekající koně (bez ohrady) stárnou a doslouží jako ti v ohradě – i ve vsi bez ohrady koní
  if (on(SLAUGHTER_DAY)) retireLooseHorses(state, day);
  if (horsePens(state).length === 0) return [];
  if (on(HORSES.birthDay)) return horseBirths(state, day);
  if (on(SLAUGHTER_DAY)) return retireHorses(state, day);
  return [];
}
