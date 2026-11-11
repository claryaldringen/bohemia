import { horsePens, horsesInPlaces, penHorses } from './horses';
import { builtPenSquares, penSpecies } from './pens';
import { HORSE_PEN_STOCK, PEN_PLACES_PER_SQUARE, TRADE_GOOD_VALUES } from '../rules';
import type { ChronicleEvent, Horse, Pen, VillageState } from '../types';

// Koně se stavbou ohrady (horses.md – Koně se stavbou ohrady; Martin 26. 10. 2026: „Když se
// postaví ohrada pro koně, tak se v ní sami objeví hřebec a dvě klisny. Odkud se koupí je jedno,
// je to prostě součást stavby.“). Cena koní je součástí ceny ohrady (hřivny, zvířata, obilí předem), koně se
// objeví v den dokončení. Ohrady uložené dřív, které koně nikdy neměly, je dostanou při načtení.

const DAYS_PER_YEAR = 365.25;

/**
 * Hodnota koní nové ohrady v kg obilí (horses.md – Koně se stavbou ohrady): hřebec za cenu
 * nevycvičeného jezdeckého koně a klisny za cenu klisny z obchodu (`TRADE_GOOD_VALUES`). Platí se
 * za ohradu, ne za čtverec (`horsePenPayment`); rozšíření ohrady koně nepřiveze.
 */
export function horsePenValueKg(): number {
  return (
    HORSE_PEN_STOCK.stallions * TRADE_GOOD_VALUES.ridingHorses.valueKg +
    HORSE_PEN_STOCK.mares * TRADE_GOOD_VALUES.mares.valueKg
  );
}

/** Hřebec a dvě klisny, kteří přijdou do ohrady v den `day` (mutuje `nextId`). */
function stockHorses(state: VillageState, day: number): Horse[] {
  const make = (sex: Horse['sex'], ageYears: number): Horse => ({
    id: state.nextId++,
    bornDay: day - Math.round(ageYears * DAYS_PER_YEAR),
    sex,
    training: 0,
  });
  return [
    ...Array.from({ length: HORSE_PEN_STOCK.stallions }, () =>
      make('male', HORSE_PEN_STOCK.stallionAgeYears),
    ),
    ...Array.from({ length: HORSE_PEN_STOCK.mares }, () =>
      make('female', HORSE_PEN_STOCK.mareAgeYears),
    ),
  ];
}

/** Přivede do ohrady koní hřebce a dvě klisny a zapíše to do kroniky (mutuje stav). */
export function giveHorsePenStock(state: VillageState, pen: Pen, day: number): void {
  const horses = stockHorses(state, day);
  pen.horses = [...(pen.horses ?? []), ...horses];
  state.chronicle.push({ day, kind: 'horses-arrived', penId: pen.id, horses: horses.length });
}

/**
 * Převod starších vsí (horses.md – Koně se stavbou ohrady): stojící ohrada koní, která koně nikdy
 * neměla (`horses` chybí – prodaná stáda nechají prázdné pole), je dostane zdarma, cenu zaplatila
 * podle starých pravidel. Jednou a idempotentně – s koňmi (i prázdným polem) se ohrada nemění,
 * ves bez takové ohrady vrátí týž stav. Selhání jen poznamená (`horsePenStockFailed`).
 */
export function withHorsePenStock(state: VillageState): VillageState {
  const empty = (state.pens ?? []).filter(
    (p) => penSpecies(p) === 'horse' && p.builtDay !== null && p.horses === undefined,
  );
  if (empty.length === 0) return state;
  try {
    const next = structuredClone(state);
    const day = next.lastDay;
    for (const pen of next.pens ?? []) {
      if (penSpecies(pen) === 'horse' && pen.builtDay !== null && pen.horses === undefined) {
        giveHorsePenStock(next, pen, day);
      }
    }
    return next;
  } catch (error) {
    return {
      ...state,
      horsePenStockFailed: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Koně bez ohrady (lord.md – Dělení vsi, Kůň syna; mutuje stav): s první hotovou ohradou koní,
 * která má volné místo (ohrady od nižšího id), do ní přejdou – i s jezdcem (`riderId`), takže
 * syn na něm zase jezdí. Kronika `horses-arrived`. Bez koní bez ohrady nic.
 */
export function looseHorsesDay(state: VillageState, day: number): ChronicleEvent[] {
  const loose = state.looseHorses;
  if (!loose || loose.length === 0) return [];
  const events: ChronicleEvent[] = [];
  let left = loose;
  const pens = horsePens(state)
    .filter((p) => p.builtDay !== null)
    .sort((a, b) => a.id - b.id);
  for (const pen of pens) {
    if (left.length === 0) break;
    const room =
      builtPenSquares(pen).length * PEN_PLACES_PER_SQUARE.horse -
      horsesInPlaces(penHorses(pen), day);
    const moving = left.slice(0, Math.max(0, room));
    if (moving.length === 0) continue;
    pen.horses = [...penHorses(pen), ...moving];
    left = left.slice(moving.length);
    events.push({ day, kind: 'horses-arrived', penId: pen.id, horses: moving.length });
  }
  if (left.length > 0) state.looseHorses = left;
  else delete state.looseHorses;
  return events;
}
