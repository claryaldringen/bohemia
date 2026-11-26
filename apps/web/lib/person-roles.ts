// Role lidí ve vsi pro výběr postavy (docs/design/villagers.md – Výběr postavy; Martin 20. 10.
// 2026: „Stačí mi jenom vědět info typu – žena rolníka, jde pro vodu. kovář – jde pro uhlí…“):
// krátký popisek z domácnosti, pohlaví, věku a příbuzenství – vojvodova rodina, rodina
// řemeslníka, rolník, starší, děti, vdova, lidé z okolí. Jen zobrazení, simulace role nezná.
// Čistý modul – počítá ho server ze stavu vsi (village-view.ts) a vývojová ukázka z ukázkových
// lidí; scéna dostane jen hotovou roli.
import { AGE, CRAFT_NAMES, type Craft, type MasonCraft, type Sex } from '@bohemia/game';
import { MASON_CRAFT_LABELS } from './mason-crafts';

/** Čí je domácnost: dvorec vojvody, řemeslná dílna, nebo rolník. */
export type HouseholdTitle = 'voivode' | Craft | MasterTitle | 'farmer';

/** Mistr stavební huti podle oboru, nebo kněz (`Person.mason`, `Person.priest`). */
export type MasterTitle = MasonCraft | 'priest';

/**
 * Role člověka: hlava domácnosti (vojvoda, řemeslník, rolník), jeho žena, syn a dcera; starší,
 * dítě, vdova, snacha a zeť, nevěsta a ženich z okolí. Pasáček a pasačka jsou role dne (výrostek
 * u stáda) – určí je scéna (`herdRole`).
 */
export type PersonRole =
  | HouseholdTitle
  | `${HouseholdTitle}-wife`
  | `${HouseholdTitle}-son`
  | `${HouseholdTitle}-daughter`
  | 'voivode-grandson'
  | 'voivode-daughter-in-law'
  /** Vedlejší manželka vojvody (lord.md – Manželky) – i ve vlastním domě mimo dvorec. */
  | 'voivode-secondary-wife'
  | 'old-man'
  | 'old-woman'
  | 'child'
  | 'widow'
  | 'daughter-in-law'
  | 'son-in-law'
  | 'bride'
  | 'groom'
  | 'herd-boy'
  | 'herd-girl';

/** Člověk pro role – věk v celých letech, domácnost (id obydlí) a příbuzní (id). */
export interface RolePerson {
  id: number;
  age: number;
  sex: Sex;
  home: number;
  spouse?: number;
  mother?: number;
  father?: number;
  /** Přišel z okolí – nevěsta, ženich, lidé od souseda (`Person.origin`). */
  origin?: boolean;
  /** Praxe v řemeslech (roky – `Person.practice`). */
  practice?: Partial<Record<Craft, number>>;
  /** Mistr huti (obor – `Person.mason`) nebo kněz (`Person.priest`) – role podle něj, ne podle domu. */
  master?: MasterTitle;
}

/** Domácnosti vsi pro role: dvorec vojvody (id obydlí) a řemeslo dílny. */
export interface RoleHomes {
  manor: number | null;
  /**
   * Vojvoda vsi s rodem (`dynasty.lordId` – lord.md – Rod vojvody, Nástupnictví), i chlapec; bez
   * něj je vojvodou nejstarší muž dvorce jako dřív.
   */
  lordId?: number | null;
  craft(home: number): Craft | null;
}

/** Do kolika let je člověk „dítě“ (menší děti; výrostci od 7 let jsou synové a dcery). */
const SMALL_CHILD_UNDER = AGE.olderChild;

/** Řemeslník v 2. pádě a přivlastňovací tvary (kovářova žena, kovářův syn). */
const CRAFT_FORMS: Record<Craft, { wife: string; son: string; daughter: string }> = {
  smith: { wife: 'Kovářova žena', son: 'Kovářův syn', daughter: 'Kovářova dcera' },
  potter: { wife: 'Hrnčířova žena', son: 'Hrnčířův syn', daughter: 'Hrnčířova dcera' },
  burner: { wife: 'Uhlířova žena', son: 'Uhlířův syn', daughter: 'Uhlířova dcera' },
  carpenter: { wife: 'Tesařova žena', son: 'Tesařův syn', daughter: 'Tesařova dcera' },
  panner: { wife: 'Rýžovníkova žena', son: 'Rýžovníkův syn', daughter: 'Rýžovníkova dcera' },
  jeweller: { wife: 'Šperkařova žena', son: 'Šperkařův syn', daughter: 'Šperkařova dcera' },
  minter: { wife: 'Mincířova žena', son: 'Mincířův syn', daughter: 'Mincířova dcera' },
};

/** Mistr huti a kněz ve 2. pádě (žena kameníka, syn kněze) – názvy oborů ze `MASON_CRAFT_LABELS`. */
const MASTER_FORMS: Record<MasterTitle, { wife: string; son: string; daughter: string }> = {
  builder: {
    wife: 'Žena stavbyvedoucího',
    son: 'Syn stavbyvedoucího',
    daughter: 'Dcera stavbyvedoucího',
  },
  limeBurner: { wife: 'Vápeníkova žena', son: 'Vápeníkův syn', daughter: 'Vápeníkova dcera' },
  stonemason: { wife: 'Kameníkova žena', son: 'Kameníkův syn', daughter: 'Kameníkova dcera' },
  mason: { wife: 'Zedníkova žena', son: 'Zedníkův syn', daughter: 'Zedníkova dcera' },
  plasterer: {
    wife: 'Žena štukatéra a malíře',
    son: 'Syn štukatéra a malíře',
    daughter: 'Dcera štukatéra a malíře',
  },
  priest: { wife: 'Žena kněze', son: 'Syn kněze', daughter: 'Dcera kněze' },
};

/** Názvy rolí v rozhraní (název pod portrétem v panelu postavy). */
export const ROLE_NAMES: Record<PersonRole, string> = {
  voivode: 'Vojvoda',
  'voivode-wife': 'Vojvodova žena',
  'voivode-son': 'Syn vojvody',
  'voivode-daughter': 'Dcera vojvody',
  'voivode-grandson': 'Vnuk vojvody',
  'voivode-daughter-in-law': 'Snacha vojvody',
  'voivode-secondary-wife': 'Vojvodova vedlejší žena',
  farmer: 'Rolník',
  'farmer-wife': 'Žena rolníka',
  'farmer-son': 'Syn rolníka',
  'farmer-daughter': 'Dcera rolníka',
  smith: CRAFT_NAMES.smith,
  'smith-wife': CRAFT_FORMS.smith.wife,
  'smith-son': CRAFT_FORMS.smith.son,
  'smith-daughter': CRAFT_FORMS.smith.daughter,
  potter: CRAFT_NAMES.potter,
  'potter-wife': CRAFT_FORMS.potter.wife,
  'potter-son': CRAFT_FORMS.potter.son,
  'potter-daughter': CRAFT_FORMS.potter.daughter,
  burner: CRAFT_NAMES.burner,
  'burner-wife': CRAFT_FORMS.burner.wife,
  'burner-son': CRAFT_FORMS.burner.son,
  'burner-daughter': CRAFT_FORMS.burner.daughter,
  carpenter: CRAFT_NAMES.carpenter,
  'carpenter-wife': CRAFT_FORMS.carpenter.wife,
  'carpenter-son': CRAFT_FORMS.carpenter.son,
  'carpenter-daughter': CRAFT_FORMS.carpenter.daughter,
  panner: CRAFT_NAMES.panner,
  'panner-wife': CRAFT_FORMS.panner.wife,
  'panner-son': CRAFT_FORMS.panner.son,
  'panner-daughter': CRAFT_FORMS.panner.daughter,
  jeweller: CRAFT_NAMES.jeweller,
  'jeweller-wife': CRAFT_FORMS.jeweller.wife,
  'jeweller-son': CRAFT_FORMS.jeweller.son,
  'jeweller-daughter': CRAFT_FORMS.jeweller.daughter,
  minter: CRAFT_NAMES.minter,
  'minter-wife': CRAFT_FORMS.minter.wife,
  'minter-son': CRAFT_FORMS.minter.son,
  'minter-daughter': CRAFT_FORMS.minter.daughter,
  builder: MASON_CRAFT_LABELS.builder.name,
  'builder-wife': MASTER_FORMS.builder.wife,
  'builder-son': MASTER_FORMS.builder.son,
  'builder-daughter': MASTER_FORMS.builder.daughter,
  limeBurner: MASON_CRAFT_LABELS.limeBurner.name,
  'limeBurner-wife': MASTER_FORMS.limeBurner.wife,
  'limeBurner-son': MASTER_FORMS.limeBurner.son,
  'limeBurner-daughter': MASTER_FORMS.limeBurner.daughter,
  stonemason: MASON_CRAFT_LABELS.stonemason.name,
  'stonemason-wife': MASTER_FORMS.stonemason.wife,
  'stonemason-son': MASTER_FORMS.stonemason.son,
  'stonemason-daughter': MASTER_FORMS.stonemason.daughter,
  mason: MASON_CRAFT_LABELS.mason.name,
  'mason-wife': MASTER_FORMS.mason.wife,
  'mason-son': MASTER_FORMS.mason.son,
  'mason-daughter': MASTER_FORMS.mason.daughter,
  plasterer: MASON_CRAFT_LABELS.plasterer.name,
  'plasterer-wife': MASTER_FORMS.plasterer.wife,
  'plasterer-son': MASTER_FORMS.plasterer.son,
  'plasterer-daughter': MASTER_FORMS.plasterer.daughter,
  priest: 'Kněz',
  'priest-wife': MASTER_FORMS.priest.wife,
  'priest-son': MASTER_FORMS.priest.son,
  'priest-daughter': MASTER_FORMS.priest.daughter,
  'old-man': 'Stařec',
  'old-woman': 'Stařena',
  child: 'Dítě',
  widow: 'Vdova',
  'daughter-in-law': 'Snacha',
  'son-in-law': 'Zeť',
  bride: 'Nevěsta z okolí',
  groom: 'Ženich z okolí',
  'herd-boy': 'Pasáček',
  'herd-girl': 'Pasačka',
};

/** Vdaná žena (šátek ve scéně): žena hlavy domácnosti, vdova, snacha, nevěsta z okolí. */
export function isMarriedWomanRole(role: PersonRole): boolean {
  return (
    role.endsWith('-wife') ||
    role === 'widow' ||
    role === 'daughter-in-law' ||
    role === 'voivode-daughter-in-law' ||
    role === 'bride'
  );
}

/** Pasáček nebo pasačka – role výrostka, který dnes pase (diet.md – Pasáci). */
export function herdRole(sex: Sex): PersonRole {
  return sex === 'female' ? 'herd-girl' : 'herd-boy';
}

/**
 * Role lidí vsi (villagers.md – Výběr postavy, návrh Clauda). Po domácnostech (id obydlí):
 * domácnost dvorce je vojvodova, dílna řemeslníka (řemeslo obydlí), ostatní rolníka. Hlava
 * domácnosti: ve dvorci jako u pohřbu (cemetery.md – Mohyly podle významu) nejstarší muž od 14 let
 * i ovdovělý a starší, bez muže nejstarší žena; v dílně nejstarší dospělý muž 14–44 s praxí
 * v řemesle, jinak nejstarší dospělý muž; u rolníka nejstarší dospělý muž 14–44. Pak v pořadí:
 * vojvoda a jeho žena; starší od 45 let – stařec, stařena; děti do 7 let – dítě; hlava
 * a jeho žena; syn a dcera hlavy nebo jeho ženy; vdova (bez manžela s dítětem); snacha a zeť
 * (manžel syna či dcery hlavy); nevěsta a ženich z okolí; vnuk a vnučka jako syn a dcera; jinak
 * muž rolník, vdaná žena žena rolníka, svobodná dcera rolníka.
 */
export function personRoles(
  people: readonly RolePerson[],
  homes: RoleHomes,
): Map<number, PersonRole> {
  const byHome = new Map<number, RolePerson[]>();
  for (const p of people) {
    const list = byHome.get(p.home);
    if (list) list.push(p);
    else byHome.set(p.home, [p]);
  }
  const parents = new Set<number>();
  for (const p of people) {
    if (p.mother !== undefined) parents.add(p.mother);
    if (p.father !== undefined) parents.add(p.father);
  }
  const roles = new Map<number, PersonRole>();
  // vedlejší manželka vojvody (lord.md – Manželky): jeho žena, ale on má za hlavní manželku jinou
  const lordId = homes.lordId ?? null;
  const lord = lordId === null ? undefined : people.find((p) => p.id === lordId);
  for (const [home, members] of byHome) {
    const base: HouseholdTitle = homes.manor === home ? 'voivode' : (homes.craft(home) ?? 'farmer');
    // dům rolníka, v němž žije mistr huti nebo kněz, je jeho domácností (žena kameníka…)
    const master = base === 'farmer' ? eldest(members.filter(isAdultMaster)) : null;
    const title: HouseholdTitle = master?.master ?? base;
    const head = householdHead(members, title, homes.lordId);
    const couple = new Set<number>();
    if (head) {
      couple.add(head.id);
      if (head.spouse !== undefined) couple.add(head.spouse);
    }
    const childOfHead = (p: RolePerson): boolean =>
      (p.mother !== undefined && couple.has(p.mother)) ||
      (p.father !== undefined && couple.has(p.father));
    const ids = new Map(members.map((p) => [p.id, p]));
    for (const p of members) {
      const secondary = lord !== undefined && p.spouse === lord.id && lord.spouse !== p.id;
      roles.set(
        p.id,
        secondary ? 'voivode-secondary-wife' : roleOf(p, title, head, childOfHead, ids, parents),
      );
    }
  }
  return roles;
}

function roleOf(
  p: RolePerson,
  title: HouseholdTitle,
  head: RolePerson | null,
  childOfHead: (p: RolePerson) => boolean,
  household: ReadonlyMap<number, RolePerson>,
  parents: ReadonlySet<number>,
): PersonRole {
  const female = p.sex === 'female';
  // mistr huti a kněz mají roli podle sebe, i když bydlí jako host v cizím domě
  if (p.master) return p.master;
  // vojvoda zůstává vojvodou i ve stáří (jako mohyla vojvody – cemetery.md)
  if (title === 'voivode' && head) {
    if (p.id === head.id) return 'voivode';
    if (p.spouse === head.id) return 'voivode-wife';
  }
  if (p.age >= AGE.elder) return female ? 'old-woman' : 'old-man';
  if (p.age < SMALL_CHILD_UNDER) return 'child';
  if (head) {
    if (p.id === head.id) return title;
    if (p.spouse === head.id) return `${title}-wife`;
    if (childOfHead(p)) return female ? `${title}-daughter` : `${title}-son`;
  }
  if (female && p.spouse === undefined && parents.has(p.id)) return 'widow';
  const spouse = p.spouse !== undefined ? household.get(p.spouse) : undefined;
  if (head && spouse && childOfHead(spouse)) {
    if (title === 'voivode' && female) return 'voivode-daughter-in-law';
    return female ? 'daughter-in-law' : 'son-in-law';
  }
  if (p.origin) return female ? 'bride' : 'groom';
  // vnuk a vnučka (rodič je v domácnosti) – dítě rodiny domu
  const parentHere =
    (p.mother !== undefined && household.has(p.mother)) ||
    (p.father !== undefined && household.has(p.father));
  if (parentHere) {
    // vnuk vojvody (lord.md – Co hráč vidí): rodič je v dvorci, ale není to dítě hlavy
    if (title === 'voivode' && !female && !childOfHead(p)) return 'voivode-grandson';
    return female ? `${title}-daughter` : `${title}-son`;
  }
  if (!female) return 'farmer';
  return p.spouse !== undefined ? 'farmer-wife' : 'farmer-daughter';
}

/** Nejstarší (při shodě věku nižší id). */
function eldest(list: readonly RolePerson[]): RolePerson | null {
  let best: RolePerson | null = null;
  for (const p of list) {
    if (!best || p.age > best.age || (p.age === best.age && p.id < best.id)) best = p;
  }
  return best;
}

/** Hlava domácnosti podle druhu (`personRoles`). */
function householdHead(
  members: readonly RolePerson[],
  title: HouseholdTitle,
  lordId: number | null = null,
): RolePerson | null {
  if (title === 'voivode') {
    const lord = lordId === null ? undefined : members.find((p) => p.id === lordId);
    if (lord) return lord;
    const grown = members.filter((p) => p.age >= AGE.adult && !p.master);
    return eldest(grown.filter((p) => p.sex === 'male')) ?? eldest(grown);
  }
  if (isMasterTitle(title)) return eldest(members.filter((p) => p.master === title));
  const men = members.filter(
    (p) => p.sex === 'male' && p.age >= AGE.adult && p.age < AGE.elder && !p.master,
  );
  if (title === 'farmer') return eldest(men);
  return eldest(men.filter((p) => (p.practice?.[title] ?? 0) > 0)) ?? eldest(men);
}

/** Dospělý mistr huti nebo kněz. */
function isAdultMaster(p: RolePerson): boolean {
  return p.master !== undefined && p.age >= AGE.adult;
}

/** Domácnost mistra huti nebo kněze. */
function isMasterTitle(title: HouseholdTitle): title is MasterTitle {
  return title in MASTER_FORMS;
}
