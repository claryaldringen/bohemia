import { cloneState } from './clone';
import { isDisused } from './disused';
import { familiesOf } from './families';
import { villageManorId } from './manor';
import { occupants } from './people';
import { DWELLINGS } from './rules';
import type { Dwelling, Person, VillageState } from './types';

// Dočasné ubytování (demolition.md – Obydlí s obyvateli; návrh Clauda: id domácnosti = id obydlí se
// neodděluje). Když se obydlí s lidmi opouští nebo bourá, obyvatelé se rozejdou do volných míst
// v ostatních obydlích. Dočasně ubytovaní mají `dwellingId` hostitele, tedy se v simulaci počítají
// jako členové hostitelského domu (práce, jídlo, příbuzenství); jako vlastní domácnost platí jen pro
// pořadí nastěhování (`VillageState.displaced`) – do nového obydlí jdou první (Martin 8. 11. 2026,
// otázka 5 plánu: rozhodnutí Clauda).

/** Kolik míst je volných v obydlích v provozu kromě `exceptId` (dvorec nehostí). */
export function freePlaces(state: VillageState, exceptId: number): number {
  let total = 0;
  for (const d of hosts(state, exceptId)) total += roomIn(state, d);
  return total;
}

function hosts(state: VillageState, exceptId: number): Dwelling[] {
  const manor = villageManorId(state);
  return state.dwellings.filter((d) => d.id !== exceptId && d.id !== manor && !isDisused(d));
}

function roomIn(state: VillageState, d: Dwelling): number {
  return Math.max(0, DWELLINGS[d.type].capacity - occupants(state, d.id).length);
}

/** Hláška „Obyvatelé nemají kam jít“ podle počtu chybějících míst. */
export function noRoomReason(missing: number): string {
  const places = missing === 1 ? '1 místo' : missing <= 4 ? `${missing} místa` : `${missing} míst`;
  return `Obyvatelé nemají kam jít – v ostatních obydlích chybí ${places}.`;
}

const dist2 = (a: Dwelling, b: Dwelling): number =>
  (a.position.x - b.position.x) ** 2 + (a.position.z - b.position.z) ** 2;

/** Nejbližší (čtverec vzdálenosti, pak id) z kandidátů. */
function nearest(from: Dwelling, candidates: Dwelling[]): Dwelling | undefined {
  return [...candidates].sort((a, b) => dist2(from, a) - dist2(from, b) || a.id - b.id)[0];
}

/** Počet vystěhovaných domácností (upozornění „Rodina čeká na dům“). */
export function displacedCount(state: VillageState): number {
  return pruned(state).length;
}

/** Záznamy bez mrtvých a bez těch, co už bydlí jinde než u hostitele (sňatek, odchod). */
function pruned(state: VillageState): NonNullable<VillageState['displaced']> {
  const byId = new Map(state.people.map((p) => [p.id, p]));
  return (state.displaced ?? [])
    .map((r) => ({
      ...r,
      people: r.people.filter((m) => byId.get(m.id)?.dwellingId === m.host),
    }))
    .filter((r) => r.people.length > 0);
}

/** Uklidí záznamy `displaced` (mutuje stav); prázdný seznam pole odstraní. */
export function pruneDisplaced(next: VillageState): void {
  if (next.displaced === undefined) return;
  const kept = pruned(next);
  if (kept.length > 0) next.displaced = kept;
  else delete next.displaced;
}

/** Lidé bez dočasně ubytovaných (pro výpočet nových domácností – cizí host nezakládá rodinu). */
export function withoutDisplaced(state: VillageState): VillageState {
  const guests = new Set((state.displaced ?? []).flatMap((r) => r.people.map((m) => m.id)));
  if (guests.size === 0) return state;
  return { ...state, people: state.people.filter((p) => !guests.has(p.id)) };
}

/**
 * Vystěhuje obydlí `dwellingId` (mutuje klon; kontrola `lodgingShortfall` je na volajícím).
 * Je-li ve vsi prázdné obydlí v provozu, celá vlastní domácnost se do nejbližšího přestěhuje (i
 * přeplněná, jako dřív přestěhování; kronika `household-relocated`). Jinak se rozejde: rodiny
 * (`familiesOf`) a zbytek podle velikosti sestupně, každá skupina do nejbližšího obydlí s místem
 * pro celou skupinu, jinak po lidech (id vzestupně). Cizí ubytovaní z dřívějších vystěhování
 * se přesunou taky a drží si svůj záznam s novým hostitelem. Vrací, kolika lidem chybělo místo
 * (ti zůstanou v obydlí).
 */
export function vacateDwelling(next: VillageState, day: number, dwellingId: number): number {
  const self = next.dwellings.find((d) => d.id === dwellingId);
  if (!self) return 0;
  const guestRecords = (next.displaced ?? []).filter((r) =>
    r.people.some((m) => m.host === dwellingId),
  );
  const guestIds = new Set(
    guestRecords.flatMap((r) => r.people.filter((m) => m.host === dwellingId).map((m) => m.id)),
  );
  const all = occupants(next, dwellingId);
  const own = all.filter((p) => !guestIds.has(p.id));
  const candidates = hosts(next, dwellingId);
  const free = new Map(candidates.map((d) => [d.id, roomIn(next, d)]));
  let missing = 0;

  const placeGroup = (group: Person[]): Map<number, Person[]> => {
    const placed = new Map<number, Person[]>();
    const put = (people: Person[], host: Dwelling): void => {
      free.set(host.id, (free.get(host.id) ?? 0) - people.length);
      placed.set(host.id, [...(placed.get(host.id) ?? []), ...people]);
    };
    const roomy = (n: number): Dwelling[] => candidates.filter((d) => (free.get(d.id) ?? 0) >= n);
    const whole = nearest(self, roomy(group.length));
    if (whole) {
      put(group, whole);
      return placed;
    }
    for (const p of group) {
      const host = nearest(self, roomy(1));
      if (host) put([p], host);
      else missing += 1;
    }
    return placed;
  };

  const empty = nearest(
    self,
    candidates.filter((d) => occupants(next, d.id).length === 0),
  );
  const moves = new Map<number, number[]>(); // hostitel → vlastní lidé k zápisu do záznamu
  if (empty && own.length > 0) {
    free.delete(empty.id);
    for (const p of own) p.dwellingId = empty.id;
    next.chronicle.push({
      day,
      kind: 'household-relocated',
      fromDwellingId: dwellingId,
      toDwellingId: empty.id,
    });
  } else if (own.length > 0) {
    const ownIds = new Set(own.map((p) => p.id));
    const taken = new Set<number>();
    const groups: Person[][] = [];
    for (const f of familiesOf(next, self, day)) {
      const g = f.people.filter((p) => ownIds.has(p.id) && !taken.has(p.id));
      for (const p of g) taken.add(p.id);
      if (g.length > 0) groups.push(g);
    }
    const rest = own.filter((p) => !taken.has(p.id));
    if (rest.length > 0) groups.push(rest);
    groups.sort((a, b) => b.length - a.length || a[0]!.id - b[0]!.id);
    for (const g of groups) {
      for (const [hostId, people] of placeGroup(g)) {
        for (const p of people) p.dwellingId = hostId;
        moves.set(hostId, [...(moves.get(hostId) ?? []), ...people.map((p) => p.id)]);
      }
    }
  }

  // cizí ubytovaní: po jednotlivých záznamech (nejstarší první), záznam drží nového hostitele
  for (const r of [...guestRecords].sort((a, b) => a.day - b.day || a.household - b.household)) {
    const group = r.people
      .filter((m) => m.host === dwellingId)
      .map((m) => next.people.find((p) => p.id === m.id))
      .filter((p): p is Person => p !== undefined);
    for (const [hostId, people] of placeGroup(group)) {
      for (const p of people) {
        p.dwellingId = hostId;
        const m = r.people.find((x) => x.id === p.id);
        if (m) m.host = hostId;
      }
    }
  }

  const stayed = new Set(occupants(next, dwellingId).map((p) => p.id));
  const placedOwn = [...moves.entries()].flatMap(([host, ids]) =>
    ids.filter((id) => !stayed.has(id)).map((id) => ({ id, host })),
  );
  if (placedOwn.length > 0) {
    const record = { household: dwellingId, day, people: placedOwn };
    next.displaced = [...(next.displaced ?? []).filter((r) => r.household !== dwellingId), record];
  }
  return missing;
}

/** Kolika lidem by při vystěhování obydlí chybělo místo (0 = vejdou se); stav nemění. */
export function lodgingShortfall(state: VillageState, dwellingId: number, day: number): number {
  const probe = cloneState(state);
  return vacateDwelling(probe, day, dwellingId);
}

/**
 * Nové nebo uvolněné obydlí `dwellingId` osídlí napřed nejstarší vystěhovaná domácnost (podle `day`,
 * pak `household`): její žijící členové u hostitelů se přestěhují (mutuje stav, záznam zmizí,
 * kronika `household-relocated`). Vrací, jestli se někdo nastěhoval.
 */
export function rehouseDisplaced(next: VillageState, day: number, dwellingId: number): boolean {
  pruneDisplaced(next);
  const record = [...(next.displaced ?? [])].sort(
    (a, b) => a.day - b.day || a.household - b.household,
  )[0];
  if (!record) return false;
  for (const m of record.people) {
    const p = next.people.find((x) => x.id === m.id);
    if (p) p.dwellingId = dwellingId;
  }
  next.displaced = (next.displaced ?? []).filter((r) => r !== record);
  if (next.displaced.length === 0) delete next.displaced;
  next.chronicle.push({
    day,
    kind: 'household-relocated',
    fromDwellingId: record.household,
    toDwellingId: dwellingId,
  });
  return true;
}
