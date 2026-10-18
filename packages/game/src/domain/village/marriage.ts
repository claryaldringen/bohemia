// Sňatky mezi domy (population.md – Sňatky mezi domy; Martin, 18. 10. 2026: „Ano, přidej sňatky
// mezi domy“, detaily návrh Clauda). Porody potřebují pár – dva lidé 16–44 v jednom domě. Dva
// svobodní v různých domech by se jinak nikdy nedali dohromady a ves by vymírala. Čisté funkce
// nad stavem vsi; krok simulace `arrangeMarriages` stav mění.
import { householdBreaksUp, isFertile, occupants } from './people';
import { DWELLINGS } from './rules';
import type { ChronicleEvent, Dwelling, Person, VillageState } from './types';

/**
 * Svobodní: lidé 16–44 (`isFertile`), kteří jsou ve své domácnosti jediní takoví – nemají v domě
 * protějšek. Jen domácnosti v hotových obydlích (zakladatelé na staveništi první zemnice jsou
 * jediná domácnost vsi). Od nejstaršího – nejdřív ten, komu se plodný věk krátí; při shodě data
 * narození nižší id.
 */
export function singles(state: VillageState, day: number): Person[] {
  return state.dwellings
    .flatMap((d) => {
      const fertile = occupants(state, d.id).filter((p) => isFertile(p, day));
      return fertile.length === 1 ? fertile : [];
    })
    .sort((a, b) => a.bornDay - b.bornDay || a.id - b.id);
}

/** Volná místa obydlí: kapacita − lidé (záporné = přeplněné). */
function freePlaces(state: VillageState, dwelling: Dwelling): number {
  return DWELLINGS[dwelling.type].capacity - occupants(state, dwelling.id).length;
}

/**
 * Smí se `mover` přestěhovat do obydlí `to`? Jeho domácnost se odchodem nerozpadne
 * (`householdBreaksUp` – jinak by ji rozpad večer přestěhoval a rozpad vsi by se rozjel) a cílová
 * domácnost není přeplněná – po sňatku je nejvýš o jednoho přes kapacitu (přeplněnou pak řeší
 * dospělé děti do prázdného obydlí a upozornění „Domácnost je plná“).
 */
function canMove(state: VillageState, day: number, mover: Person, to: Dwelling): boolean {
  const staying = occupants(state, mover.dwellingId).filter((p) => p.id !== mover.id);
  return !householdBreaksUp(staying, day) && freePlaces(state, to) >= 0;
}

/** Sňatek: kdo se stěhuje a kam. */
export interface MarriageMove {
  mover: Person;
  to: Dwelling;
}

/**
 * Kdo se při sňatku svobodných `a` a `b` (různé domy) stěhuje: ten, jehož domácnost se odchodem
 * nerozpadne a jehož protějšek nebydlí v přeplněném domě. Smějí-li oba, stěhuje se do domu
 * s víc volnými místy, při shodě mladší (při shodě data narození vyšší id). Nesmí-li ani jeden,
 * null – počkají.
 */
export function marriageMove(
  state: VillageState,
  day: number,
  a: Person,
  b: Person,
): MarriageMove | null {
  const homeA = state.dwellings.find((d) => d.id === a.dwellingId);
  const homeB = state.dwellings.find((d) => d.id === b.dwellingId);
  if (!homeA || !homeB || homeA.id === homeB.id) return null;
  const aMoves = canMove(state, day, a, homeB);
  const bMoves = canMove(state, day, b, homeA);
  if (aMoves && bMoves) {
    const free = freePlaces(state, homeB) - freePlaces(state, homeA);
    if (free !== 0) return free > 0 ? { mover: a, to: homeB } : { mover: b, to: homeA };
    const aYounger = a.bornDay > b.bornDay || (a.bornDay === b.bornDay && a.id > b.id);
    return aYounger ? { mover: a, to: homeB } : { mover: b, to: homeA };
  }
  if (aMoves) return { mover: a, to: homeB };
  if (bMoves) return { mover: b, to: homeA };
  return null;
}

/**
 * Sňatky dne (mutuje stav): svobodní od nejstaršího (`singles`) – každý si vezme prvního dalšího
 * svobodného v tomtéž pořadí (nejbližší věkem mezi zbylými), se kterým sňatek jde
 * (`marriageMove`); jeden sňatek na člověka. Sňatek změní jen domy snoubenců a ti už svobodní
 * nejsou, takže na pořadí ostatních sňatků dne nezáleží. Vrací události kroniky.
 */
export function arrangeMarriages(state: VillageState, day: number): ChronicleEvent[] {
  const events: ChronicleEvent[] = [];
  const candidates = singles(state, day);
  const married = new Set<number>();
  for (const a of candidates) {
    if (married.has(a.id)) continue;
    for (const b of candidates) {
      if (b.id === a.id || married.has(b.id)) continue;
      const move = marriageMove(state, day, a, b);
      if (!move) continue;
      const from = move.mover.dwellingId;
      move.mover.dwellingId = move.to.id;
      married.add(a.id);
      married.add(b.id);
      events.push({ day, kind: 'marriage', fromDwellingId: from, toDwellingId: move.to.id });
      break;
    }
  }
  return events;
}
