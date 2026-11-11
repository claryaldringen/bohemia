// Křest rodu ve vsi (christianity.md – Křest rodu): událost schránky `rod-baptized` zapíše den křtu
// a ve vsi hlavy rodu pokřtí vojvodu a propustí jeho vedlejší manželky. Mutuje stav jako kroky
// schránky, idempotentní – druhá událost téhož rodu nic nezmění.
import { currentLord, mainWifeOf, wivesOf } from './dynasty';
import { ensureMainWives } from './dynasty-wives';
import { isChristian } from './faith';
import type { ChronicleEvent, Person, VillageState } from '../types';

/** Křest rodu `houseId` – tělo události schránky `rod-baptized` (`sendRodBaptized`). */
export interface RodBaptism {
  houseId: string;
  /**
   * Křtí se NPC rod (povýšený vesničan – vassalage.md), který ves řídí (`VillageState.nobles`):
   * jeho křest platí jen pro ves, kterou ještě řídí, a pokřtí její hlavu (vojvodu vsi). Chybí –
   * rod hráče, kterému ves patří.
   */
  npc?: true;
  /** Ves, kde žije vojvoda rodu hráče (`House.lord`) – pokřtí se on. NPC rod ho nepotřebuje. */
  lord?: true;
}

/**
 * Křest rodu ve vsi v den `day` (christianity.md – Křest rodu). Rod hráče: den křtu do
 * `faith.rodBaptizedDay` a ve vsi vojvody (`lord`) křest vojvody – kromě vsi, kterou řídí NPC rod
 * (příznak tam čeká na jeho konec, vojvodou vsi je hlava NPC rodu). NPC rod: den do `faith.nobles`,
 * jen dokud ves řídí, a křest hlavy vsi; do kroniky nic (christianity.md – kroniku čte držitel).
 * Mutuje stav, vrací kroniku; opakování nic nezmění.
 */
export function baptizeVillage(
  state: VillageState,
  day: number,
  baptism: RodBaptism,
): ChronicleEvent[] {
  if (baptism.npc) {
    if (state.nobles?.houseId !== baptism.houseId) return [];
    if (state.faith?.nobles?.houseId === baptism.houseId) return [];
    state.faith = { ...state.faith, nobles: { houseId: baptism.houseId, baptizedDay: day } };
    const head = currentLord(state);
    if (head?.noble?.houseId !== baptism.houseId) return [];
    // hlava vsi se pokřtí, do kroniky jde jen nová hlavní manželka (jako v kroku dne)
    return baptizeLord(state, day, head).filter((e) => e.kind === 'main-wife');
  }
  if (state.faith?.rodBaptizedDay !== undefined) return [];
  state.faith = { ...state.faith, rodBaptizedDay: day };
  const lord = currentLord(state);
  if (!baptism.lord || state.nobles || !lord) return [];
  return baptizeLord(state, day, lord);
}

/**
 * Vojvoda se dá pokřtít (christianity.md – Křest rodu, Jediná manželka): je křesťan, zůstane mu
 * hlavní manželka a ostatní jsou propuštěné – bez `spouseId`, zůstávají ve svých domech, mohou se
 * znovu vdát (`isSingle`). Jejich děti s vojvodou zůstávají, jak jsou (synové `line`). Zemřela-li
 * hlavní manželka a nová ještě není, vybere se dřív (`ensureMainWives`). Kronika `lord-baptized`
 * a `wives-released` s počtem.
 */
function baptizeLord(state: VillageState, day: number, lord: Person): ChronicleEvent[] {
  if (isChristian(lord)) return [];
  lord.faith = 'christian';
  const events: ChronicleEvent[] = [{ day, kind: 'lord-baptized' }];
  if (!mainWifeOf(state, lord) && wivesOf(state, lord).length > 0) {
    events.push(...ensureMainWives(state, day));
  }
  const released = wivesOf(state, lord).filter((w) => w.id !== lord.spouseId);
  for (const wife of released) delete wife.spouseId;
  if (released.length > 0) events.push({ day, kind: 'wives-released', count: released.length });
  return events;
}
