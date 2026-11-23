import { OFFICIAL_WORLD } from '../../calendar';
import { createRandom, deriveSeed } from '../../landscape/random';
import {
  aboveGate,
  addHunters,
  fightResult,
  huntFightTick,
  newHuntFight,
  releaseQuarry,
  type HuntField,
  type NewHunter,
} from '../../war/hunt-fight';
import { lineManStrength, villagerStrength } from '../../war/strength';
import { hoursPerTick } from '../../war/ticks';
import { assignRiders, NO_RIDERS } from '../livestock/horse-riders';
import { isUnshod } from '../livestock/horse-shoeing-term';
import { horsePens, isGrainHorse, villageHorses } from '../livestock/horses';
import { isLineMan } from '../people/dynasty';
import { villageHappiness } from '../people/happiness';
import { lordFamily, trainingFamily } from '../people/lord';
import { ageYears, isAway, isInjured } from '../people/people';
import { HUNT } from '../rules/rules-wildlife';
import type { ChronicleEvent, Horse, Person, QuarryKind, VillageState } from '../types';
import { applyHuntResult, countDeclaredHunt, emptyHunt, pickQuarry, reserveBeaters } from './hunt';

// Lov správce bez scény (hunting.md – Pravidla 8; plán 2026-11-22-hunting – Rozhodnutí 8, Úloha 8;
// Martin 22. 11. 2026: „Správce je NPC hráč, takže na lov chodí on.“): správce vyhlásí lov na
// zítřek touž akcí jako hráč (honci a jeden den práce lovců – `declareNpcHunt`) a ves ho v den lovu
// dopočte v kroku dne po práci (`npcHuntDay`): zvíře losem jako u hráče, nejvýš `HUNT.npc.hunters`
// nejlepších mužů (`npcHunters`) a souboj se zvěří (`hunt-fight.ts`) po taktech na rovné louce,
// výsledek hned ve vsi (`applyHuntResult`). Riziko stejné jako u hráče – poslední muž rodu nemá
// ochranu (Martin). Náhoda jen ze seedu vsi a dne – výsledek nezávisí na kouscích dopočtu.

const NPC = HUNT.npc;
/** Lovci stojí na louce v počátku; zvíře vyběhne z dveří lesa za místem výběhu směrem k nim. */
const HUNTERS_AT = { x: 0, z: 0 };
const RUN_OUT = { x: NPC.startM, z: 0 };
const DOOR = { x: NPC.startM + NPC.doorM, z: 0 };
const NO_SKILLS = { bow: 0, combat: 0, riding: 0 };

/** Lovec správce a jeho jezdecký kůň (pro výsledek – padlý kůň). */
interface NpcHunter {
  hunter: NewHunter;
  horseId?: number;
}

/**
 * Správce vyhlásí lov na zítřek (mutuje stav; hunting.md – Pravidla 8): honci a lovci správce
 * (`HUNT.npc.hunters`) zítra celý den chybí v práci vsi – lovec platí jeden den práce jako útočník
 * hráče (Martin 22. 11. 2026: „práce těch lidí se odečte pouze za 1 den“; `reserveBeaters`) –,
 * den lovu `hunt.npc` a pořadí vyhlášení (`countDeclaredHunt` – štítek losu zvířete). Smí-li, rozhodne
 * volající (`huntDenied`). Ves bez stavu zvěře nic.
 */
export function declareNpcHunt(state: VillageState, day: number): void {
  const w = state.wildlife;
  if (!w) return;
  reserveBeaters(state, day, HUNT.beaters.men + NPC.hunters);
  (w.hunt ??= emptyHunt()).npc = { day: day + 1 };
  countDeclaredHunt(state);
}

/**
 * Koho správce pošle na zvíře `quarry` ve dni `day` (hunting.md – Pravidla 4, 8: „útočníky vybere
 * jako hráč – nejlepší dostupní muži podle dovedností a zvířete“): muži od `HUNT.minAge` let, kteří
 * nejsou pryč (`isAway`) ani zranění (`isInjured`). Jezdec, kdo má pár s jezdeckým koněm
 * (`assignRiders` – jako výcvik dne) a ves není bez podkování (`isUnshod`); jinak pěšky. Muž rodu
 * bojuje silou `lineManStrength` (na koni se svým koněm) a dovednostmi z `arms`, vesničan silou
 * `villagerStrength` podle štěstí vsi a bez dovedností; zdraví 100, všichni na místě lovců. Na kance
 * a bachyni jen nad branou umu (`aboveGate`) – z koně, jinak pěšky, jinak nejde. Pořadí boj +
 * (jezdec ? jízda : 0) sestupně, pak id; nejvýš `HUNT.npc.hunters`. Stav nemění.
 */
export function npcHunters(state: VillageState, day: number, quarry: QuarryKind): NewHunter[] {
  return npcHunterPicks(state, day, quarry).map((p) => p.hunter);
}

function npcHunterPicks(state: VillageState, day: number, quarry: QuarryKind): NpcHunter[] {
  const horses = ridersHorses(state, day);
  const villager = villagerStrength(false, villageHappiness(state));
  const picks: { pick: NpcHunter; score: number }[] = [];
  for (const p of state.people) {
    if (p.sex !== 'male' || ageYears(p.bornDay, day) < HUNT.minAge) continue;
    if (isAway(p, day) || isInjured(p, day)) continue;
    const pick = hunterOf(p, horses.get(p.id) ?? null, villager, quarry);
    if (!pick) continue;
    const { skills, mounted } = pick.hunter;
    picks.push({ pick, score: skills.combat + (mounted ? skills.riding : 0) });
  }
  picks.sort((a, b) => b.score - a.score || a.pick.hunter.personId - b.pick.hunter.personId);
  return picks.slice(0, NPC.hunters).map((x) => x.pick);
}

/**
 * Muž `p` jako lovec správce: s koněm `horse` z koně, jinak pěšky; na kance a bachyni napřed
 * z koně nad branou, pak pěšky nad branou, jinak null (nejde).
 */
function hunterOf(
  p: Person,
  horse: Horse | null,
  villager: number,
  quarry: QuarryKind,
): NpcHunter | null {
  const line = isLineMan(p);
  const skills = armsSkills(p);
  const footStrength = line ? lineManStrength(p, null) : villager;
  const base = { personId: p.id, pos: { ...HUNTERS_AT }, footStrength, skills, lineMan: line };
  const onFoot: NpcHunter = {
    hunter: { ...base, mounted: false, strength: footStrength, health: 100 },
  };
  if (horse) {
    const strength = line ? lineManStrength(p, horse) : villager;
    const ridden: NpcHunter = {
      hunter: { ...base, mounted: true, strength, health: 100 },
      horseId: horse.id,
    };
    if (aboveGate(ridden.hunter, quarry)) return ridden;
  }
  return aboveGate(onFoot.hunter, quarry) ? onFoot : null;
}

/** Luk, boj a jízda z `arms` (kdo necvičil, nuly). */
function armsSkills(p: Person): NewHunter['skills'] {
  const arms = p.arms;
  return arms ? { bow: arms.bow, combat: arms.combat, riding: arms.riding } : { ...NO_SKILLS };
}

/**
 * Jezdečtí koně podle jezdce (id člověka → kůň): páry jako výcvik dne (`assignRiders` s rodinou
 * `trainingFamily`, jinak `lordFamily`) na kopii ohrad – stav nemění, výcvik večer páry zapíše
 * stejně; kůň jen jezdecký (`isGrainHorse`). Nepodkutý kůň nejezdí (`isUnshod`) – nikdo.
 */
function ridersHorses(state: VillageState, day: number): Map<number, Horse> {
  const out = new Map<number, Horse>();
  if (horsePens(state).length === 0 || isUnshod(state, day)) return out;
  const pens = structuredClone(state.pens);
  const family = trainingFamily(state, day) ?? lordFamily(state, day);
  const paired = assignRiders({ pens }, day, family);
  if (paired === NO_RIDERS) return out;
  for (const horse of villageHorses({ pens })) {
    const rider = horse.riderId;
    if (rider !== undefined && paired.has(rider) && isGrainHorse(horse, day)) out.set(rider, horse);
  }
  return out;
}

/**
 * Lov správce v kroku dne (mutuje stav, vrací kroniku; hunting.md – Pravidla 8; plán
 * 2026-11-22-hunting – Rozhodnutí 8): jen v den `hunt.npc` (pak značka zmizí). Zvíře losem
 * `pickQuarry` (pořadí vyhlášení `hunt.declared`; bez zvěře nic), lovci `npcHunters`. Rovná louka bez
 * mřížky: lovci v počátku, zvíře vyběhne z dveří lesa (`startM` + `doorM`, 0) k bodu (`startM`, 0).
 * Takty souboje do konce, nejvýš `HUNT.npc.maxTicks` – pak zvíře uteče; náhoda jedním proudem
 * `createRandom(deriveSeed(seed vsi, 'hunt:' + den))`, herní hodiny taktu podle délky herního dne
 * oficiálního světa (`hoursPerTick(OFFICIAL_WORLD)`). Výsledek hned ve vsi (`applyHuntResult`) –
 * i když nikdo nešel (zvíře uteče, den lovu se počítá).
 */
export function npcHuntDay(state: VillageState, day: number): ChronicleEvent[] {
  const w = state.wildlife;
  const hunt = w?.hunt;
  if (!w || !hunt || hunt.npc?.day !== day) return [];
  delete hunt.npc;
  const quarry = pickQuarry(w, state.seed, day, hunt.declared ?? 0);
  if (quarry === null) return [];
  const picks = npcHunterPicks(state, day, quarry);
  const f = newHuntFight(quarry, DOOR, 0);
  releaseQuarry(f, RUN_OUT, 0);
  addHunters(
    f,
    picks.map((p) => p.hunter),
    0,
  );
  const field: HuntField = { grid: null, hoursPerTick: hoursPerTick(OFFICIAL_WORLD) };
  const rng = createRandom(deriveSeed(state.seed, 'hunt:' + day));
  while (f.outcome === 'ongoing' && f.tick < NPC.maxTicks) huntFightTick(f, field, rng);
  const names = new Map<number, string>();
  const horses = new Map<number, number>();
  const people = new Map(state.people.map((p) => [p.id, p]));
  for (const { hunter, horseId } of picks) {
    const name = people.get(hunter.personId)?.name;
    if (name !== undefined) names.set(hunter.personId, name);
    if (horseId !== undefined) horses.set(hunter.personId, horseId);
  }
  return applyHuntResult(state, day, fightResult(f, names, horses));
}
