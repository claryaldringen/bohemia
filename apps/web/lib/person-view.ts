// Lidé vsi pro scénu (docs/design/villagers.md – Výběr postavy): úsporně id, věk, pohlaví,
// domácnost a hotová role (person-roles.ts) – scéna podle nich přiřadí každé postavě skutečného
// člověka a panel postavy ukáže, kdo to je. Čistý modul na serveru.
import {
  AGE,
  ageYears,
  canInviteLodge,
  canInviteMaster,
  currentLord,
  expeditionRecruit,
  type ExpeditionPersonRefusal,
  ennobleBlock,
  isAway,
  isChristian,
  isInjured,
  MASON_CRAFTS,
  villageManorId,
  recruitOf,
  type Craft,
  type MasonCraft,
  type Person,
  type MasonryCircle,
  type Sex,
  type VillageState,
} from '@bohemia/game';
import { personRoles, type PersonRole, type RolePerson } from './person-roles';

/** Portrét člověka podle věku a pohlaví (ikony lidí v `public/icons/resources/`). */
export type PersonPortraitIcon = 'man' | 'woman' | 'child' | 'elder';

/** Portrét člověka: starší, dítě (do 14 let), žena, nebo muž. */
export function personPortrait(person: { age: number; sex: string }): PersonPortraitIcon {
  if (person.age >= AGE.elder) return 'elder';
  if (person.age < AGE.adult) return 'child';
  return person.sex === 'female' ? 'woman' : 'man';
}

/**
 * Obyvatel obydlí pro panel (Martin 25. 10. 2026: počty rodiny a řádek obyvatel se duplikovaly):
 * portrét, role, věk a u muže rodu jméno (lord.md – Kde se jméno ukazuje).
 */
export interface DwellingResident {
  id: number;
  portrait: PersonPortraitIcon;
  role: string;
  name?: string;
  age: number;
}

/** Dovednosti se zbraní a na koni celými čísly 0–100 (lord.md – Dovednosti). */
export interface ArmsView {
  bow: number;
  combat: number;
  riding: number;
}

/**
 * Člověk vsi ve scéně: id, věk (celé roky), pohlaví, domácnost (id obydlí) a role; kdo se cvičil
 * (`Person.arms`), nese dovednosti, a kdo má koně (`Horse.riderId`), `horse`.
 */
/**
 * Stavební huť u vojvody (stone-masonry.md – Stavební huť): `invite` – proč huť nejde pozvat
 * (`null` = jde), `circle` – okruh pozvané huti, `daysToArrival` – dní do příchodu nejbližšího
 * mistra (huť na cestě), `missing` – obory bez mistra, které lze pozvat.
 */
export interface LodgeView {
  invite: 'not-baptized' | 'already' | 'no-lord' | null;
  circle?: MasonryCircle;
  daysToArrival?: number;
  missing: MasonCraft[];
}

/** Stav huti ke dni `day` pro tlačítka vojvody (jádro rozhoduje `canInviteLodge`/`canInviteMaster`). */
export function lodgeView(state: VillageState, day: number): LodgeView {
  const invite = canInviteLodge(state, day);
  const lodge = state.lodge;
  const masters = (lodge?.arriving ?? []).filter((a) => a.role !== 'priest');
  const soonest = masters.length > 0 ? Math.min(...masters.map((a) => a.day)) : null;
  return {
    invite: invite === 'ok' ? null : invite,
    ...(lodge ? { circle: lodge.circle } : {}),
    ...(soonest !== null ? { daysToArrival: Math.max(0, Math.ceil(soonest - day)) } : {}),
    missing: MASON_CRAFTS.filter((c) => canInviteMaster(state, c) === 'ok'),
  };
}

/**
 * Výprava člověka (expeditions.md – Kdo smí jít; Výběr a skupina), počítá server ze stavu vsi:
 * `refusal` – proč nesmí jít (mladší 12 let, raněný, na tažení, pryč), `rider` – má jezdeckého
 * koně, `inParty` – je ve skupině výpravy (`away: journey`), `strength` – síla do meče (na koni se
 * svým koněm `strengthMounted`; ženy a děti 0).
 */
export interface SceneExpedition {
  refusal?: ExpeditionPersonRefusal;
  rider?: true;
  inParty?: true;
  strength: number;
}

export interface ScenePerson {
  id: number;
  age: number;
  sex: Sex;
  home: number;
  role: PersonRole;
  /** Jméno muže rodu (lord.md – Kde se jméno ukazuje); ostatní lidé jsou bez jmen. */
  name?: string;
  /** Dnes pryč (`isAway`): zůstává v panelu a výběru, ale doma ve vsi se nekreslí (roster ho nebere). */
  away?: true;
  /**
   * Dnes zraněný (`isInjured` – lov, válka; D79, Martin 15. 11. 2026): nepracuje, necvičí, nejezdí
   * a nechodí na lov ani na pochůzky, zůstává doma – roster mu postavu nedá, panel píše „léčí se“.
   */
  injured?: true;
  arms?: ArmsView;
  horse?: true;
  /** Smí ho hráč povýšit do šlechtického stavu (vassalage.md): muž od 16 let mimo rod vojvody. */
  ennobleable?: true;
  /** Pokřtěný (christianity.md – Víra vesničanů); pohan bez údaje. */
  christian?: true;
  /**
   * Vojvoda, který se smí nechat pokřtít (christianity.md – Křest rodu): rod křesťanství zná, ještě
   * není pokřtěný a vojvoda rodu žije v téhle vsi (`VillageAccess.baptizable`).
   */
  baptizable?: true;
  /** Mistr stavební huti a jeho obor (stone-masonry.md); ostatní bez údaje. */
  mason?: MasonCraft;
  /** Okruh huti mistra (a kněze) – do popisku ikony oboru. */
  lodgeCircle?: MasonryCircle;
  /** Kněz kostela (churches.md). */
  priest?: true;
  /** Výprava člověka – důvod, proč nejde, jezdec, člen skupiny a síla; jen s plným stavem vsi. */
  expedition?: SceneExpedition;
  /** Huť a mistři u vojvody vsi (tlačítka „Pozvat stavební huť“ a „Pozvat mistra“). */
  lodge?: LodgeView;
}

/**
 * Lidé vsi pro scénu v den `day` (věk ke dni) seřazení podle id. Ves uložená před pohlavím
 * (`Person.sex` chybí) má pohlaví střídavě podle id – jako průvod pohřbu (funeral-view.ts).
 * `baptizable` – vojvoda vsi (role vojvody) se smí nechat pokřtít (`VillageAccess.baptizable`).
 * `village` – plný stav vsi: lidé pak nesou `expedition` (jádro `expeditionRecruit`).
 */
export function scenePersons(
  state: Pick<VillageState, 'people' | 'dwellings' | 'manorId' | 'constructions'> &
    Partial<Pick<VillageState, 'pens' | 'dynasty' | 'lodge'>>,
  day: number,
  baptizable = false,
  lodge: LodgeView | null = null,
  village: VillageState | null = null,
): ScenePerson[] {
  const crafts = new Map<number, Craft>();
  for (const d of state.dwellings) if (d.workshop) crafts.set(d.id, d.workshop.craft);
  const people = state.people.map((p): RolePerson => ({
    id: p.id,
    age: ageYears(p.bornDay, day),
    sex: p.sex ?? (p.id % 2 === 0 ? 'female' : 'male'),
    home: p.dwellingId,
    ...(p.spouseId !== undefined ? { spouse: p.spouseId } : {}),
    ...(p.motherId !== undefined ? { mother: p.motherId } : {}),
    ...(p.fatherId !== undefined ? { father: p.fatherId } : {}),
    ...(p.origin !== undefined ? { origin: true } : {}),
    ...(p.practice ? { practice: p.practice } : {}),
  }));
  const roles = personRoles(people, {
    manor: villageManorId(state),
    lordId: state.dynasty?.lordId ?? null,
    craft: (home) => crafts.get(home) ?? null,
  });
  const riders = new Set<number>();
  for (const pen of state.pens ?? []) {
    for (const horse of pen.horses ?? [])
      if (horse.riderId !== undefined) riders.add(horse.riderId);
  }
  const arms = new Map(
    state.people.flatMap((p) => (p.arms ? [[p.id, armsView(p.arms)] as const] : [])),
  );
  const ennobleable = new Set(
    state.people.flatMap((p) => (ennobleBlock(p, day) === null ? [p.id] : [])),
  );
  const names = new Map(
    state.people.flatMap((p) => (p.name !== undefined ? [[p.id, p.name] as const] : [])),
  );
  const christians = new Set(state.people.flatMap((p) => (isChristian(p) ? [p.id] : [])));
  // křtí se vojvoda vsi (`baptizeVillage` – `currentLord`), tlačítko jen u něj
  const baptizableId = baptizable ? (currentLord(state)?.id ?? null) : null;
  const lordId = lodge ? (currentLord(state)?.id ?? null) : null;
  const masons = new Map(state.people.flatMap((p) => (p.mason ? [[p.id, p.mason] as const] : [])));
  const priests = new Set(state.people.flatMap((p) => (p.priest ? [p.id] : [])));
  const away = new Set(state.people.flatMap((p) => (isAway(p, day) ? [p.id] : [])));
  const injured = new Set(state.people.flatMap((p) => (isInjured(p, day) ? [p.id] : [])));
  const expeditions = new Map(
    village ? state.people.map((p) => [p.id, expeditionOf(village, p, day)] as const) : [],
  );
  return people
    .map((p) => ({
      id: p.id,
      age: p.age,
      sex: p.sex,
      home: p.home,
      role: roles.get(p.id)!,
      ...(names.has(p.id) ? { name: names.get(p.id)! } : {}),
      ...(away.has(p.id) ? { away: true as const } : {}),
      ...(injured.has(p.id) ? { injured: true as const } : {}),
      ...(arms.has(p.id) ? { arms: arms.get(p.id)! } : {}),
      ...(riders.has(p.id) ? { horse: true as const } : {}),
      ...(ennobleable.has(p.id) ? { ennobleable: true as const } : {}),
      ...(christians.has(p.id) ? { christian: true as const } : {}),
      ...(p.id === baptizableId ? { baptizable: true as const } : {}),
      ...(masons.has(p.id) ? { mason: masons.get(p.id)! } : {}),
      ...(state.lodge && (masons.has(p.id) || priests.has(p.id))
        ? { lodgeCircle: state.lodge.circle }
        : {}),
      ...(priests.has(p.id) ? { priest: true as const } : {}),
      ...(lodge && p.id === lordId ? { lodge } : {}),
      ...(expeditions.has(p.id) ? { expedition: expeditions.get(p.id)! } : {}),
    }))
    .sort((a, b) => a.id - b.id);
}

/** Výprava člověka `person` vsi `village` ke dni `day` (`ScenePerson.expedition`). */
function expeditionOf(village: VillageState, person: Person, day: number): SceneExpedition {
  // vrátil se (`untilDay` uplynul), jen záznam ještě nezmizel – už ve skupině není
  const inParty = person.away?.kind === 'journey' && isAway(person, day);
  const recruit = expeditionRecruit(village, person, day);
  // pryč (i na výpravě) a mladí nemají co ukazovat jako důvod – skupina je `inParty`
  const refusal = typeof recruit === 'string' && !inParty ? recruit : undefined;
  const data = typeof recruit === 'string' ? recruitOf(village, person, day) : recruit;
  return {
    ...(refusal ? { refusal } : {}),
    ...(data.horseId !== undefined ? { rider: true as const } : {}),
    ...(inParty ? { inParty: true as const } : {}),
    strength: data.strengthMounted ?? data.strength,
  };
}

/** Dovednosti pro rozhraní: celá čísla v mezích 0–100. */
export function armsView(arms: { bow: number; combat: number; riding: number }): ArmsView {
  const whole = (v: number): number => Math.min(100, Math.max(0, Math.round(v)));
  return { bow: whole(arms.bow), combat: whole(arms.combat), riding: whole(arms.riding) };
}
