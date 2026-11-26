// Texty kroniky a pojmenování staveb pro panel.

import { Crop } from '@bohemia/game';
import { accusativeOf } from './player-notices';
import { LEVY_UNITS } from './levy-labels';
import {
  CRAFT_PRODUCTS,
  ORCHARD,
  legacyNeighbourName,
  type CraftProduct,
  type FloodLevel,
  type SummerWeather,
  type WinterWeather,
  CART_NAMES,
  CRAFT_NAMES,
  dateOfDayIndex,
  type AbandonedStructure,
  type AwayKind,
  type ChronicleEstate,
  type ChronicleEvent,
  type HarvestStock,
  type ChronicleFortGate,
  type ChroniclePerson,
  type ChronicleLandmark,
  type ChronicleRoadEnd,
  type PenSpecies,
  type QuarryKind,
  type LandTaker,
  type ConstructionKind,
  type ConstructionSummary,
  type Craft,
  type CraftStocks,
  type Direction8,
  type MasonCraft,
  type NewcomerGroup,
  type ShipmentManifest,
  type TradeGoods,
  type TradePeople,
  type DwellingType,
  type RaidLoot,
  type SacredBuildingKind,
} from '@bohemia/game';

import { formatGameDate } from './game-date';
import { noticeChronicleText } from './notice-chronicle';

import {
  DIRECTION_NAMES,
  NEWCOMER_TEXTS,
  coinsText,
  goodsNames,
  goodsText,
  peopleText,
} from './trade-names';
import {
  fromVillage,
  inVillage,
  toVillage,
  villagersOf,
  withVillagersOf,
} from './village-name-cases';

import { formatAnimals, formatCells, formatHa, formatInteger, plural } from './village-format';

export const CHRONICLE_LENGTH = 8;

/**
 * Řemesla v rozhraní (crafts.md): ikona dílny (`public/icons/build/`), výrobek – ikona
 * (`public/icons/resources/`), název a zásoba ve `CraftStocks`.
 */
export const CRAFT_LOOKS: Record<
  Craft,
  { icon: string; product: { icon: string; name: string; stock: keyof CraftStocks } }
> = {
  potter: { icon: 'hrncir', product: { icon: 'pottery', name: 'Keramika', stock: 'potteryKg' } },
  // production-chains.md – Kovář: v zásobě hřivny, nástroje jsou vybavení domácností
  smith: { icon: 'kovar', product: { icon: 'iron-bars', name: 'Hřivny', stock: 'ironBarsKg' } },
  burner: { icon: 'uhlir', product: { icon: 'charcoal', name: 'Uhlí', stock: 'charcoalKg' } },
  // wagons.md – Tesař: dřevěné nářadí (vozy ukazuje panel dílny zvlášť)
  carpenter: {
    icon: 'tesar',
    product: { icon: 'wood-tools', name: 'Dřevěné nářadí', stock: 'woodToolsKg' },
  },
};

/** Názvy obydlí v 1. a 4. pádě. */
export const DWELLING_NAMES: Record<DwellingType, { nominative: string; accusative: string }> = {
  zemnice: { nominative: 'Zemnice', accusative: 'zemnici' },
  polozemnice: { nominative: 'Polozemnice', accusative: 'polozemnici' },
  vypleteny: { nominative: 'Vypletený dům', accusative: 'vypletený dům' },
  srub: { nominative: 'Srub', accusative: 'srub' },
  dvorec: { nominative: 'Dvorec', accusative: 'dvorec' },
  'dvorec-srub': { nominative: 'Dvorec', accusative: 'dvorec' },
};

/**
 * Postavení v kronice (Martin 15. 11. 2026: „sedlák“, „vojvodova žena“, „selka / kovářka“): muž,
 * žena a 2. pád („syn sedláka“). „Tesařka“ a „uhlířka“ jsou nejisté – opis (návrh Clauda).
 */
const ESTATE_TITLES: Record<
  ChronicleEstate['title'],
  { man: string; wife: string; genitive: string }
> = {
  voivode: { man: 'vojvoda', wife: 'vojvodova žena', genitive: 'vojvody' },
  farmer: { man: 'sedlák', wife: 'selka', genitive: 'sedláka' },
  smith: { man: 'kovář', wife: 'kovářka', genitive: 'kováře' },
  potter: { man: 'hrnčíř', wife: 'hrnčířka', genitive: 'hrnčíře' },
  carpenter: { man: 'tesař', wife: 'tesařova žena', genitive: 'tesaře' },
  burner: { man: 'uhlíř', wife: 'uhlířova žena', genitive: 'uhlíře' },
  priest: { man: 'kněz', wife: 'žena kněze', genitive: 'kněze' },
  builder: { man: 'stavbyvedoucí', wife: 'žena stavbyvedoucího', genitive: 'stavbyvedoucího' },
  limeBurner: { man: 'vápeník', wife: 'žena vápeníka', genitive: 'vápeníka' },
  stonemason: { man: 'kameník', wife: 'žena kameníka', genitive: 'kameníka' },
  mason: { man: 'zedník', wife: 'žena zedníka', genitive: 'zedníka' },
  plasterer: { man: 'štukatér', wife: 'žena štukatéra', genitive: 'štukatéra' },
};

/** Hlavy domácností v množném čísle za číslem (2–4 / 5+): „2 sedláci“, „5 sedláků“. */
const HEADS_PLURAL: Partial<Record<ChronicleEstate['title'], readonly [string, string]>> = {
  farmer: ['sedláci', 'sedláků'],
  smith: ['kováři', 'kovářů'],
  potter: ['hrnčíři', 'hrnčířů'],
  carpenter: ['tesaři', 'tesařů'],
  burner: ['uhlíři', 'uhlířů'],
};

/** Příbuzný hlavy domácnosti – muž a žena („syn sedláka“, „matka vojvody“). */
const KIN_WORDS: Record<'parent' | 'child' | 'in-law' | 'grandchild', readonly [string, string]> = {
  parent: ['otec', 'matka'],
  child: ['syn', 'dcera'],
  'in-law': ['zeť', 'snacha'],
  grandchild: ['vnuk', 'vnučka'],
};

/** Člověk bez vztahu k hlavě domu podle věku: chlapec, vesničan, stařec (a ženy). */
const PLAIN_PEOPLE: Record<'child' | 'adult' | 'elder', readonly [string, string]> = {
  child: ['chlapec', 'dívka'],
  adult: ['vesničan', 'vesničanka'],
  elder: ['stařec', 'stařena'],
};

/**
 * Kdo – postavení a jméno v 1. pádě (Martin 15. 11. 2026: „sedlák Bořivoj“, „syn sedláka Bořivoje
 * Radim“; jména všech lidí – population.md, Jména: „selka Ludmila“): hlava domu, žena, příbuzný
 * hlavy; jiný člen domu jménem, jinak podle věku.
 */
function estateText(
  estate: ChronicleEstate,
  female: boolean,
  name: string | undefined,
  group: 'child' | 'adult' | 'elder' = 'adult',
): string {
  const title = ESTATE_TITLES[estate.title];
  const named = (text: string): string => (name === undefined ? text : `${text} ${name}`);
  switch (estate.kin) {
    case 'head':
    case 'wife':
      return named(female ? title.wife : title.man);
    case 'other':
      return name ?? PLAIN_PEOPLE[group][female ? 1 : 0];
    default: {
      const of =
        estate.headName === undefined
          ? title.genitive
          : `${title.genitive} ${genitiveOf(estate.headName)}`;
      return named(`${KIN_WORDS[estate.kin][female ? 1 : 0]} ${of}`);
    }
  }
}

/** Příbuzný hlavy domu – muž ve 2. pádě („hlavní manželkou syna vojvody“). */
const KIN_GENITIVES: Record<'parent' | 'child' | 'in-law' | 'grandchild', string> = {
  parent: 'otce',
  child: 'syna',
  'in-law': 'zetě',
  grandchild: 'vnuka',
};

/**
 * Muž – postavení a jméno ve 2. pádě (Martin 15. 11. 2026: „hlavní manželkou vojvody Lutobora“):
 * hlava domu, příbuzný hlavy („syna vojvody Lutobora Radima“), jiný člen domu jménem.
 */
function manEstateGenitive(estate: ChronicleEstate, name: string | undefined): string {
  const title = ESTATE_TITLES[estate.title];
  const named = (text: string): string =>
    name === undefined ? text : `${text} ${genitiveOf(name)}`;
  switch (estate.kin) {
    case 'head':
    case 'wife':
      return named(title.genitive);
    case 'other':
      return name === undefined ? 'muže rodu' : genitiveOf(name);
    default: {
      const of =
        estate.headName === undefined
          ? title.genitive
          : `${title.genitive} ${genitiveOf(estate.headName)}`;
      return named(`${KIN_GENITIVES[estate.kin]} ${of}`);
    }
  }
}

/**
 * 4. pád ženského jména („si vzal Dobravu“, „Libuši“): jména vesničanek končí na -a po tvrdé
 * nebo obojetné souhlásce, nebo na -e (`FEMALE_NAMES`, test celého seznamu). Jiný tvar je nejistý
 * – null (věta jméno opíše).
 */
export function feminineAccusative(name: string): string | null {
  if (/[^žščřcjďťň]a$/u.test(name)) return `${name.slice(0, -1)}u`;
  if (/[^aeiouyáéíóúůýě]e$/u.test(name)) return `${name.slice(0, -1)}i`;
  return null;
}

/**
 * Další žena muže rodu (Martin 15. 11. 2026: „Vojvoda Lutobor si vzal Dobravu.“): postavení
 * a jméno muže, jméno ženy ve 4. pádě; zápis bez ženy „… si vzal další ženu.“, starší zápis bez
 * postavení jen jménem muže.
 */
function extraWifeText(event: Extract<ChronicleEvent, { kind: 'extra-wife' }>): string {
  if (!event.estate) {
    return `${event.name ?? 'Muž rodu'} si vzal další ženu.`;
  }
  const man = capitalized(estateText(event.estate, false, event.name));
  // manželka ze skutečného souseda (plán 3): „… si vzal Dobravu z Lhoty.“
  const from = event.villageName === undefined ? '' : ` ${fromVillage(event.villageName)}`;
  if (event.wife === undefined) return `${man} si vzal další ženu${from}.`;
  const wife = feminineAccusative(event.wife);
  return wife === null
    ? `${man} si vzal další ženu jménem ${event.wife}${from}.`
    : `${man} si vzal ${wife}${from}.`;
}

/** Podmět zápisu o křtu: „Vojvoda Lutobor“; starší zápis bez postavení „Vojvoda“. */
function lordLine(event: { name?: string; estate?: ChronicleEstate }): string {
  return event.estate ? capitalized(estateText(event.estate, false, event.name)) : 'Vojvoda';
}

/**
 * Nová hlavní manželka (Martin 15. 11. 2026: „Dobrava se stala hlavní manželkou vojvody
 * Lutobora.“): jméno ženy, postavení a jméno muže ve 2. pádě; zápis bez ženy „… má novou hlavní
 * manželku.“, starší zápis bez postavení jen jménem muže.
 */
function mainWifeText(event: Extract<ChronicleEvent, { kind: 'main-wife' }>): string {
  if (!event.estate) return `${event.name ?? 'Muž rodu'} má novou hlavní manželku.`;
  if (event.wife === undefined) {
    return `${capitalized(estateText(event.estate, false, event.name))} má novou hlavní manželku.`;
  }
  return `${event.wife} se stala hlavní manželkou ${manEstateGenitive(event.estate, event.name)}.`;
}

/**
 * Zvěř lovu v 2. pádě („zahynul na lovu medvěda“, „zraněn na lovu bachyně“; hunting.md – Pravidla
 * 6). Kanec je „divočák“ jako ve starších zápisech, které jiné prase než `boar` neznaly.
 */
const PREY_GENITIVE: Record<QuarryKind, string> = {
  stag: 'jelena',
  hind: 'laně',
  boar: 'divočáka',
  sow: 'bachyně',
  wolf: 'vlka',
  bear: 'medvěda',
};

/** Věk na začátku věty o smrti: „Ve věku 64 let“, „Ve věku 1 roku“, „V prvním roce života“. */
function agePrefix(age: number): string {
  if (age < 1) return 'V prvním roce života';
  return age < 2 ? 'Ve věku 1 roku' : `Ve věku ${formatInteger(age)} let`;
}

/**
 * Úmrtí kronikářsky (Martin 15. 11. 2026: „Ve věku 64 let zemřel sedlák Bořivoj.“): věk, příčina
 * jen když nebyla stáří („zemřel hlady“, „padl v boji“, šelma), postavení a jméno. Starší zápisy
 * bez postavení: jméno muže rodu, jinak dítě, jeden z dospělých, jeden ze starších; bez věku
 * podmět napřed („Dítě zemřelo hlady.“).
 */
function deathLine(event: Extract<ChronicleEvent, { kind: 'death' }>): string {
  const female = event.estate?.female === true;
  const who = event.estate
    ? estateText(event.estate, female, event.name, event.group)
    : (event.name ?? OLD_DEATH_WHO[event.group]);
  // rod slovesa: žena, staré „dítě“ (střední), jinak muž
  const ending = female ? 'a' : !event.estate && !event.name && event.group === 'child' ? 'o' : '';
  const prey = PREY_GENITIVE[event.prey ?? 'boar'];
  const [verb, rest = ''] = ((): [string, string?] => {
    switch (event.cause) {
      case 'hunger':
        return ['zemřel', 'hlady'];
      case 'hunt':
        return ['zahynul', `na lovu ${prey}`];
      case 'flood':
        return ['utonul', 'při povodni'];
      case 'tornado':
        return ['zahynul', 've smršti'];
      case 'war':
        return ['padl', 'v boji'];
      case 'wounds':
        return ['zemřel', 'na rány'];
      case 'beast':
        return ['zahynul', 'na cestě'];
      default:
        // přirozená smrt: starší stářím (příčinu nepsat), dítě a dospělý na nemoc – Martin
        // 15. 11. 2026 k „Ve věku 31 let zemřel jeden z dospělých.“: „neříkali jsme, že tam dáme
        // příčinu?“ (simulace nemoci nerozlišuje – návrh Clauda)
        return event.group === 'elder' ? ['zemřel'] : ['zemřel', 'na nemoc'];
    }
  })();
  const died = `${verb}${ending}${rest === '' ? '' : ` ${rest}`}`;

  // šelma (lord-control.md – Nebezpečí): „… – zabil ho medvěd.“
  const beast =
    event.cause !== 'beast'
      ? ''
      : ` – ${event.by === 'bear' ? 'zabil' : 'zabili'} ${female ? 'ji' : ending === 'o' ? 'je' : 'ho'} ${event.by === 'bear' ? 'medvěd' : 'vlci'}`;
  // bez věku (starší zápisy) podmět napřed: „Bořivoj padl v boji.“
  return event.age === undefined
    ? `${capitalized(who)} ${died}${beast}.${populationSentence(event.population)}`
    : `${agePrefix(event.age)} ${died} ${who}${beast}.${populationSentence(event.population)}`;
}

/**
 * Zásoba po sklizni (Martin 17. 11. 2026: „kolik té plodiny má vesnice celkem a na jak dlouho to
 * vystačí při současném počtu obyvatel“): „Obilí má ves 1 821 kg – při 60 lidech vystačí na 80
 * dní.“ Starší zápisy bez zásoby nic nepřidají.
 */
function stockSentence(subject: string, stock: HarvestStock | undefined): string {
  if (stock === undefined) return '';
  const have = `${subject} má ves ${formatInteger(stock.kg)} kg`;
  if (stock.days === null) return ` ${have}.`;
  const people = `${stock.people} ${plural(stock.people, 'člověku', 'lidech', 'lidech')}`;
  const lasts =
    stock.days === 0
      ? 'nevystačí ani na den'
      : `vystačí na ${formatInteger(stock.days)} ${plural(stock.days, 'den', 'dny', 'dní')}`;
  return ` ${have} – při ${people} ${lasts}.`;
}

/** Počet obyvatel po narození nebo úmrtí: „Ves má 61 obyvatel.“ */
function populationSentence(population: number | undefined): string {
  if (population === undefined) return '';
  return ` Ves má ${formatInteger(population)} ${plural(population, 'obyvatele', 'obyvatele', 'obyvatel')}.`;
}

/** Zemřelý ve starším zápisu bez postavení a jména. */
const OLD_DEATH_WHO: Record<'child' | 'adult' | 'elder', string> = {
  child: 'dítě',
  adult: 'jeden z dospělých',
  elder: 'jeden ze starších',
};

/**
 * Kdo se vrátil z tažení (Martin 15. 11. 2026: „Z tažení se vrátili sedlák Bořivoj a kovář
 * Radim.“, nad 3 „… a další 4“): postavení a jméno, stejné hlavy domů bez jména číslem („2 sedláci“),
 * jinak se opakované počítají do „dalších“. Dezertéři „Z tažení utekl domů …“.
 */
function campaignBackText(
  people: number,
  who: readonly ChroniclePerson[] | undefined,
  deserted: boolean,
): string {
  if (!who || who.length === 0) {
    return `Z tažení se ${plural(people, 'vrátil', 'vrátili', 'vrátilo')} ${peopleCountText(people)}.`;
  }
  const groups = new Map<string, { person: ChroniclePerson; text: string; count: number }>();
  for (const person of who) {
    const text = estateText(person.estate, person.estate.female === true, person.name);
    const group = groups.get(text);
    if (group) group.count++;
    else groups.set(text, { person, text, count: 1 });
  }
  const items = [...groups.values()];
  const shown = items.length <= 4 ? items : items.slice(0, 3);
  let rest = who.length;
  const texts = shown.map(({ person, text, count }) => {
    const heads =
      person.name === undefined && person.estate.kin === 'head' && !person.estate.female
        ? HEADS_PLURAL[person.estate.title]
        : undefined;
    if (count > 1 && heads) {
      rest -= count;
      return `${formatInteger(count)} ${count <= 4 ? heads[0] : heads[1]}`;
    }
    rest -= 1;
    return text;
  });
  if (rest > 0) texts.push(rest === 1 ? 'jeden další' : `další ${formatInteger(rest)}`);
  // shoda slovesa: jeden člověk podle pohlaví, „5 sedláků“ středním rodem, jinak množné číslo
  const only = texts.length === 1 ? shown[0]! : null;
  const ending =
    only === null || only.count > 1
      ? only !== null && only.count >= 5
        ? 'o'
        : 'i'
      : only.person.estate.female
        ? 'a'
        : '';
  return deserted
    ? `Z tažení utekl${ending} domů ${listText(texts)}.`
    : `Z tažení se vrátil${ending} ${listText(texts)}.`;
}

/**
 * Obnova sadu (Martin 15. 11. 2026): „{Vlkovští} vysadili 8 stromů, aby obnovili starý sad.“ –
 * stromy všech čtverců obnovených ten den (ORCHARD.treesPerSquare na čtverec), víc sadů „staré sady“.
 */
export function orchardRenewalText(villageName: string, squares: number, orchards = 1): string {
  const trees = squares * ORCHARD.treesPerSquare;
  return `${capitalized(villagersOf(villageName))} vysadili ${formatInteger(trees)} ${plural(trees, 'strom', 'stromy', 'stromů')}, aby obnovili ${orchards > 1 ? 'staré sady' : 'starý sad'}.`;
}

/** Stupeň vody povodně – kronika a popisky (disasters.md – Povodeň potoka). */
export const FLOOD_LEVEL_NAMES: Record<FloodLevel, string> = {
  small: 'Malá voda',
  five: 'Pětiletá voda',
  twenty: 'Dvacetiletá voda',
  hundred: 'Stoletá voda',
  twoHundred: 'Dvousetletá voda',
  fiveHundred: 'Pětisetletá voda',
  thousand: 'Tisíciletá voda',
};

/** Povodeň v kronice: stupeň vody, výška nad hladinou a co zatopila. */
function floodText(event: Extract<ChronicleEvent, { kind: 'flood' }>): string {
  const height = `${String(event.heightM).replace('.', ',')} m nad hladinou`;
  const parts = event.partIds.length;
  const fell = event.collapsedDwellingIds.length;
  const what = [
    ...(parts > 0 ? [`zatopené díly: ${parts}`] : []),
    ...(event.dwellingIds.length > 0 ? [`zatopené stavby: ${event.dwellingIds.length}`] : []),
    ...(fell > 0 ? [`zřícené: ${fell}`] : []),
  ];
  return `${FLOOD_LEVEL_NAMES[event.level]} – ${height}${what.length > 0 ? ` – ${what.join(', ')}` : ''}.`;
}

/**
 * Smršť v kronice (disasters.md – Smršť; hráči se říká „Smršť“, síla jen slovem – od F2 „Silná
 * smršť“): co zbořila, poničila, vyvrátila a položila.
 */
function tornadoText(event: Extract<ChronicleEvent, { kind: 'tornado' }>): string {
  const name = ['F0', 'F1'].includes(event.strength) ? 'Smršť' : 'Silná smršť';
  const fell = event.collapsedDwellingIds.length;
  const hurt = event.dwellingIds.length - fell;
  const what = [
    ...(fell > 0 ? [`zbořené stavby: ${fell}`] : []),
    ...(hurt > 0 ? [`poničené stavby: ${hurt}`] : []),
    ...(event.uprootedTrees > 0 ? [`vyvrácené stromy: ${event.uprootedTrees}`] : []),
    ...(event.partIds.length > 0 ? [`polehlé díly: ${event.partIds.length}`] : []),
  ];
  return `${name}${what.length > 0 ? ` – ${what.join(', ')}` : ''}.`;
}

/** Požár v kronice (disasters.md – Požár): kolik domů vyhořelo, česky se správným tvarem. */
function fireText(burned: number, collapsed: number = burned): string {
  const damaged = burned - collapsed;
  const gone =
    collapsed <= 0
      ? ''
      : collapsed === 1
        ? 'vyhořel jeden dům'
        : collapsed <= 4
          ? `vyhořely ${collapsed} domy`
          : `vyhořelo ${collapsed} domů`;
  const charred =
    damaged <= 0
      ? ''
      : damaged === 1
        ? collapsed > 0
          ? 'jeden ohořel'
          : 'jeden dům ohořel'
        : damaged <= 4
          ? collapsed > 0
            ? `${damaged} ohořely`
            : `ohořely ${damaged} domy`
          : collapsed > 0
            ? `${damaged} ohořelo`
            : `ohořelo ${damaged} domů`;
  return `Požár – ${[gone, charred].filter((t) => t !== '').join(', ')}.`;
}

/** Kroupy v kronice (disasters.md – Kroupy): potlučené díly a střechy. */
function hailText(parts: number, roofs: number): string {
  const what = [
    ...(parts > 0 ? [`potlučené díly: ${parts}`] : []),
    ...(roofs > 0 ? [`potlučené střechy: ${roofs}`] : []),
  ];
  return what.length > 0 ? `Kroupy – ${what.join(', ')}.` : 'Kroupy.';
}

/** Dostavěná řemeslná dílna – kronika (crafts.md). */
const WORKSHOP_FINISHED: Record<Craft, string> = {
  potter: 'Dostavěli hrnčířskou dílnu s pecí.',
  smith: 'Dostavěli kovárnu s výhní.',
  burner: 'Dostavěli uhlířovu zemnici s milířem.',
  carpenter: 'Dostavěli tesařskou dílnu s přístřeškem.',
};

/** Druh ohrady ve 4. pádě množného čísla – „ohrada pro ovce“ (Martin 14. 11. 2026). */
const PEN_SPECIES_ACCUSATIVE: Record<PenSpecies, string> = {
  sheep: 'ovce',
  goat: 'kozy',
  pig: 'prasata',
  cattle: 'skot',
  team: 'voly',
  horse: 'koně',
};

/** „ pro ovce“; bez druhu nic. */
function penFor(species: PenSpecies | undefined): string {
  return species === undefined ? '' : ` pro ${PEN_SPECIES_ACCUSATIVE[species]}`;
}

/** Dostavěná ohrada (Martin 14. 11. 2026): „Byla postavena ohrada pro ovce.“, rozšíření zvlášť. */
function penFinishedText(species: PenSpecies | undefined, extended: boolean): string {
  if (extended) return `Ohrada${penFor(species)} byla rozšířena.`;
  return `Byla postavena ohrada${penFor(species)}.`;
}

/** Jabloně podél cesty (Martin 14. 11. 2026): „Podél cesty mezi dvorcem a kovárnou byly vysazeny jabloně.“ */
function roadApplesText(ends: readonly [ChronicleRoadEnd, ChronicleRoadEnd] | undefined): string {
  const between = ends ? roadBetween(ends) : null;
  return between === null
    ? 'Podél cesty byly vysazeny jabloně.'
    : `Podél cesty ${between} byly vysazeny jabloně.`;
}

/** Vylepšená cesta (Martin 15. 11. 2026): „Vojvoda Lutobor nechal vylepšit cestu mezi dvorcem a potokem.“ */
function roadUpgradeText(
  event: Extract<ChronicleEvent, { kind: 'construction-finished' }>,
): string {
  const who = event.bySteward
    ? 'Správce'
    : event.lord !== undefined
      ? `Vojvoda ${event.lord}`
      : undefined;
  if (who === undefined && !event.roadEnds) return 'Cesta byla vylepšena.';
  const between = event.roadEnds ? roadBetween(event.roadEnds) : null;
  return `${who ?? 'Vojvoda'} nechal vylepšit cestu${between === null ? '' : ` ${between}`}.`;
}

function finishedText(event: Extract<ChronicleEvent, { kind: 'construction-finished' }>): string {
  const { constructionKind: kind, craft, wagon } = event;
  if (wagon) return 'Vozová cesta je hotová – vůz po ní jede rychleji.';
  if (craft && (kind === 'dwelling' || kind === 'rebuild')) {
    return kind === 'dwelling' ? WORKSHOP_FINISHED[craft] : 'Dokončili přestavbu dílny.';
  }
  if (kind === 'dwelling') return 'Dostavěli nové obydlí.';
  if (kind === 'idol') return 'Vztyčili dřevěnou modlu.';
  if (kind === 'shrine') return 'Svatyně je dostavěná – v ohništích hoří oheň.';
  if (kind === 'rebuild') return 'Dokončili přestavbu obydlí.';
  if (kind === 'cemetery') return 'Hřbitov je ohrazený – dá se do něj pohřbívat.';
  if (kind === 'orchard') return 'Sad je vysazený.';
  if (kind === 'pen') return penFinishedText(event.penSpecies, event.penExtended === true);
  if (kind === 'ard') return 'Vesničané vyrobili rádlo.';
  if (kind === 'road') return roadUpgradeText(event);
  if (kind === 'road-apples') return roadApplesText(event.roadEnds);
  if (kind === 'threshing-floor') return 'Humno je dostavěné – dá se na něm mlátit.';
  if (kind === 'fortification') return 'Opevnění je dostavěné.';
  if (kind === 'quarry') return 'Lom je otevřený – dá se v něm lámat kámen.';
  if (kind === 'church') return 'Kostel je dostavěný.';
  if (kind === 'quarrying') return 'Kámen je nalámaný a leží na hromadě u cesty.';
  return 'Pole je založené – dá se osévat.';
}

/** Zrušená stavba – kronika (cancel-construction.ts). */
function cancelledText(kind: ConstructionKind, craft?: Craft, species?: PenSpecies): string {
  if (kind === 'dwelling') return craft ? 'Stavba dílny se zrušila.' : 'Stavba obydlí se zrušila.';
  if (kind === 'idol') return 'Stavba modly se zrušila.';
  if (kind === 'shrine') return 'Stavba svatyně se zrušila.';
  if (kind === 'cemetery') return 'Zakládání hřbitova se zrušilo.';
  if (kind === 'orchard') return 'Výsadba sadu se zrušila.';
  if (kind === 'pen') return `Stavba ohrady${penFor(species)} se zrušila.`;
  if (kind === 'threshing-floor') return 'Stavba humna se zrušila.';
  if (kind === 'field') return 'Zakládání pole se zrušilo.';
  if (kind === 'fortification') return 'Stavba opevnění se zrušila – hotové úseky stojí.';
  if (kind === 'quarry') return 'Stavba lomu se zrušila.';
  if (kind === 'church') return 'Stavba kostela se zrušila.';
  if (kind === 'quarrying') return 'Lámání kamene se zrušilo – co se nalámalo, leží na hromadě.';
  return 'Stavba se zrušila.';
}

/** Pole nebo sad ustoupil stavbě obydlí – kronika (population.md – Obydlí na poli a v sadu). */
/** Komu pole či sad ustoupil (3. pád) – kronika (fields.md – Pole jako krajina). */
const LAND_TAKERS: Record<LandTaker, string> = {
  dwelling: 'stavbě obydlí',
  orchard: 'sadu',
  cemetery: 'hřbitovu',
  pen: 'ohradě',
  idol: 'modle',
  shrine: 'svatyni',
  'road-apples': 'jabloním u cesty',
  'road-trees': 'stromům u cesty',
  road: 'cestě',
  'threshing-floor': 'humnu',
  church: 'kostelu',
  fortification: 'valu',
};

/** Počasí roku kraje, které se právě ukázalo (disasters.md – Léto, Zima). */
const SUMMER_TEXTS: Record<SummerWeather, string> = {
  good: 'Dobré léto – úroda slibuje.',
  normal: 'Obyčejné léto.',
  dry: 'Suché léto – pole a louky žíznějí.',
  drought: 'Kruté sucho – pole i louky žloutnou.',
  wet: 'Deštivé léto – obilí a seno moknou.',
  wetHarvest: 'Mokré žně – obilí hnije na poli.',
};
const WINTER_TEXTS: Record<WinterWeather, string> = {
  normal: 'Obyčejná zima.',
  blackFrost: 'Holomráz – mráz bez sněhu, ozim vymrzá.',
  long: 'Dlouhá sněžná zima – seno se bude krmit déle.',
};

function weatherText(summer?: SummerWeather, winter?: WinterWeather): string {
  if (winter !== undefined) return WINTER_TEXTS[winter];
  return SUMMER_TEXTS[summer ?? 'normal'];
}

function landTakenText(
  land: 'field' | 'orchard',
  areaM2: number,
  gone: boolean,
  by: LandTaker = 'dwelling',
): string {
  const who = LAND_TAKERS[by];
  if (land === 'field') {
    return gone
      ? `Pole ustoupilo ${who} a zaniklo.`
      : `Pole ustoupilo ${who} – zmenšilo se o ${formatInteger(areaM2)} m².`;
  }
  return gone
    ? `Sad ustoupil ${who} a zanikl.`
    : `Sad ustoupil ${who} – zmenšil se o ${formatInteger(areaM2)} m².`;
}

/** Příloh zarostl lesem a vypadl z pole – kronika (fields.md – Zarůstání). */
function forestText(parts: number, gone: boolean): string {
  if (gone) return 'Nepasené pole zarostlo lesem a zaniklo.';
  return parts === 1
    ? 'Nepasený díl pole zarostl lesem – pole se zmenšilo.'
    : `Nepasené pole zarostlo lesem – ubylo ${formatCells(parts)}.`;
}

/** Opuštěné díly pole (fields.md – Opuštěný díl): „Díl pole opuštěn – zaroste.“ */
function abandonedPartsText(parts: number): string {
  if (parts === 1) return 'Díl pole opuštěn – zaroste.';
  return `${plural(parts, 'Opuštěn', 'Opuštěny', 'Opuštěno')} ${formatInteger(parts)} ${plural(parts, 'díl', 'díly', 'dílů')} pole – zarostou.`;
}

/** Opuštěné díly pole vrácené do osevu (fields.md – Opuštěný díl). */
function returnedPartsText(parts: number): string {
  if (parts === 1) return 'Díl pole vrácen do osevu.';
  return `${plural(parts, 'Vrácen', 'Vráceny', 'Vráceno')} ${formatInteger(parts)} ${plural(parts, 'díl', 'díly', 'dílů')} pole do osevu.`;
}

/** Pražský loket (m) – délka zbořeného opevnění v kronice (Martin 14. 11. 2026). */
const PRAGUE_CUBIT_M = 0.5927;

/** Světová strana jako přídavné jméno (2. a 3. pád ženského rodu – „od severní brány“, „k jižní věži“). */
const DIRECTION_ADJECTIVES: Record<Direction8, string> = {
  N: 'severní',
  NE: 'severovýchodní',
  E: 'východní',
  SE: 'jihovýchodní',
  S: 'jižní',
  SW: 'jihozápadní',
  W: 'západní',
  NW: 'severozápadní',
};

/** Brána na konci úseku ve 2. (`od`) nebo 3. pádě (`k`): „severní brány“, „věži“. */
function fortGateText(gate: ChronicleFortGate, dative: boolean): string {
  const noun = gate.tower ? (dative ? 'věži' : 'věže') : dative ? 'bráně' : 'brány';
  return gate.direction === undefined ? noun : `${DIRECTION_ADJECTIVES[gate.direction]} ${noun}`;
}

/**
 * Kudy zbořený úsek vedl: „ od severní brány k věži“, s jedinou branou „ od brány dokola zpět
 * k bráně“ (návrh Clauda); bez bran nic.
 */
function fortPlaceText(
  gates: readonly [ChronicleFortGate, ChronicleFortGate] | undefined,
  around: boolean,
): string {
  if (!gates) return '';
  const [from, to] = gates;
  if (around) return ` od ${fortGateText(from, false)} dokola zpět k ${fortGateText(from, true)}`;
  return ` od ${fortGateText(from, false)} k ${fortGateText(to, true)}`;
}

/**
 * Zbořený úsek opevnění (demolition.md – Opevnění; Martin 14. 11. 2026: „Vojvoda Lutobor přikázal
 * zbořit 26 loktů opevnění od severní brány k věži.“): délka v pražských loktech, místo podle bran
 * na koncích úseku, vojvoda v den rozkazu; srovnaný val „srovnat … valu“. Bez vojvody „Zbořili …“,
 * starší zápisy bez údajů jen „Úsek opevnění byl zbořen.“
 */
function fortDemolishedText(
  event: Extract<ChronicleEvent, { kind: 'fortification-demolished' }>,
): string {
  const level = event.level === true;
  // zbořená brána (demolition.md – Rozhodnutí)
  if (event.gate === true) {
    return event.lord !== undefined
      ? `Vojvoda ${event.lord} přikázal zbořit bránu.`
      : 'Zbořili bránu.';
  }
  if (event.lengthM === undefined) {
    return level ? 'Val úseku opevnění byl srovnán.' : 'Úsek opevnění byl zbořen.';
  }
  const cubits = Math.max(1, Math.round(event.lengthM / PRAGUE_CUBIT_M));
  const length = `${formatInteger(cubits)} ${plural(cubits, 'loket', 'lokty', 'loktů')} ${level ? 'valu' : 'opevnění'}`;
  const where = fortPlaceText(event.gates, event.around === true);
  const verb = level ? 'srovnat' : 'zbořit';
  if (event.lord !== undefined) return `Vojvoda ${event.lord} přikázal ${verb} ${length}${where}.`;
  return `${level ? 'Srovnali' : 'Zbořili'} ${length}${where}.`;
}

/**
 * Místo na konci cesty v 7. pádě (Martin 14. 11. 2026: „mezi dvorcem a kovárnou“) a rod – pro
 * „a další / dalším“, když jsou oba konce stejné – a odkud cesta k sousedovi vede („od kovárny do
 * Lhoty“; Martin 15. 11. 2026: „z rozcestí do Lhoty“). Předpony klíčů tras jako panel cesty
 * (`road-end-view.ts`); neznámé místo null.
 */
const PLACE_INSTRUMENTAL: Record<string, RoadEndForms> = {
  cemetery: { word: 'hřbitovem', from: 'od hřbitova' },
  pen: { word: 'ohradou', feminine: true, from: 'od ohrady' },
  'threshing-floor': { word: 'humnem', from: 'od humna' },
  idol: { word: 'modlou', feminine: true, from: 'od modly' },
  shrine: { word: 'svatyní', feminine: true, from: 'od svatyně' },
  'grain-pit': { word: 'obilnou jámou', feminine: true, from: 'od obilné jámy' },
  field: { word: 'polem', from: 'od pole' },
  orchard: { word: 'sadem', from: 'od sadu' },
  oak: { word: 'posvátným dubem', from: 'od posvátného dubu' },
  grove: { word: 'dubovým hájem', from: 'od dubového háje' },
  ore: { word: 'rudištěm', from: 'od rudiště' },
  clay: { word: 'hliništěm', from: 'od hliniště' },
  kiln: { word: 'milířem', from: 'od milíře' },
  // potok, u řeky `water:river` (Martin 14. 11. 2026: „teče tam přece potok“); starší zápisy
  // nesou jen `water` – potok (každá mapa má potok)
  water: { word: 'potokem', from: 'od potoka' },
  'water:river': { word: 'řekou', feminine: true, from: 'od řeky' },
  wood: { word: 'lesem', from: 'od lesa' },
  pasture: { word: 'pastvou', feminine: true, from: 'od pastvy' },
  meadow: { word: 'loukou', feminine: true, from: 'od louky' },
  // jen významná místa u křižovatky (`ChronicleLandmark` – D66)
  church: { word: 'kostelem', from: 'od kostela' },
  quarry: { word: 'lomem', from: 'od lomu' },
  gate: { word: 'branou', feminine: true, from: 'od brány' },
};
const DWELLING_INSTRUMENTAL: Record<DwellingType, RoadEndForms> = {
  zemnice: { word: 'zemnicí', feminine: true, from: 'od zemnice' },
  polozemnice: { word: 'polozemnicí', feminine: true, from: 'od polozemnice' },
  vypleteny: { word: 'vypleteným domem', from: 'od vypleteného domu' },
  srub: { word: 'srubem', from: 'od srubu' },
  dvorec: { word: 'dvorcem', from: 'od dvorce' },
  'dvorec-srub': { word: 'dvorcem', from: 'od dvorce' },
};
const WORKSHOP_INSTRUMENTAL: Record<Craft, RoadEndForms> = {
  smith: { word: 'kovárnou', feminine: true, from: 'od kovárny' },
  potter: { word: 'hrnčířskou dílnou', feminine: true, from: 'od hrnčířské dílny' },
  carpenter: { word: 'tesařskou dílnou', feminine: true, from: 'od tesařské dílny' },
  burner: { word: 'uhlířovou zemnicí', feminine: true, from: 'od uhlířovy zemnice' },
};

/** Konec cesty: 7. pád a rod („mezi dvorcem a kovárnou“), odkud („od kovárny“, „z rozcestí“). */
interface RoadEndForms {
  word: string;
  feminine?: true;
  from: string;
}

/** Příslovce směru („severně od vsi“). */
const DIRECTION_ADVERBS: Record<Direction8, string> = {
  N: 'severně',
  NE: 'severovýchodně',
  E: 'východně',
  SE: 'jihovýchodně',
  S: 'jižně',
  SW: 'jihozápadně',
  W: 'západně',
  NW: 'severozápadně',
};

/**
 * Kde leží křižovatka (D66; Martin 15. 11. 2026: „Třeba poblíž kterého významného místa se
 * nacházejí?“): „u kovárny“ (2. pád – z `RoadEndForms.from` bez „od“), „pod dvorcem“, „nad
 * potokem“ (7. pád), u kraje mapy „u severního kraje mapy“, bez místa blízko „uprostřed vsi“,
 * „na severní straně vsi“, „severně od vsi“. Neznámé místo null.
 */
export function landmarkPhrase(near: ChronicleLandmark): string | null {
  switch (near.kind) {
    case 'dwelling':
    case 'place': {
      const forms =
        near.kind === 'place'
          ? PLACE_INSTRUMENTAL[near.place]
          : near.craft
            ? WORKSHOP_INSTRUMENTAL[near.craft]
            : DWELLING_INSTRUMENTAL[near.type];
      if (!forms) return null;
      if (near.at === 'below') return `pod ${forms.word}`;
      if (near.at === 'above') return `nad ${forms.word}`;
      return `u ${forms.from.replace(/^od /, '')}`;
    }
    case 'edge':
      return `u ${DIRECTION_ADJECTIVES[near.direction]}ho kraje mapy`;
    case 'village':
      if (near.direction === undefined) return 'uprostřed vsi';
      return near.outside
        ? `${DIRECTION_ADVERBS[near.direction]} od vsi`
        : `na ${DIRECTION_ADJECTIVES[near.direction]} straně vsi`;
  }
}

function roadEndForms(end: ChronicleRoadEnd): RoadEndForms | null {
  switch (end.kind) {
    case 'dwelling':
      return end.craft ? WORKSHOP_INSTRUMENTAL[end.craft] : DWELLING_INSTRUMENTAL[end.type];
    case 'place':
      return PLACE_INSTRUMENTAL[end.place] ?? null;
    case 'junction': {
      // „mezi rozcestím u kovárny a polem“, „z křižovatky pod dvorcem do Lhoty“ (D66)
      const near = end.near ? landmarkPhrase(end.near) : null;
      const where = near === null ? '' : ` ${near}`;
      return end.shape === 'y'
        ? { word: `rozcestím${where}`, from: `z rozcestí${where}` }
        : { word: `křižovatkou${where}`, feminine: true, from: `z křižovatky${where}` };
    }
    case 'edge':
      return {
        word: `${DIRECTION_ADJECTIVES[end.direction]}m krajem mapy`,
        from: `od ${DIRECTION_ADJECTIVES[end.direction]}ho kraje mapy`,
      };
    case 'road':
      return { word: 'jinou cestou', feminine: true, from: 'od jiné cesty' };
  }
}

/**
 * Kudy cesta vede: „mezi dvorcem a kovárnou“, „mezi polem a dalším polem“, kraj mapy jako místo
 * („mezi dvorcem a severním krajem mapy“) – smyšlený soused už není (markets.md – Pravidla 1).
 * Neznámé místo null.
 */
export function roadBetween(ends: readonly [ChronicleRoadEnd, ChronicleRoadEnd]): string | null {
  const a = roadEndForms(ends[0]);
  const b = roadEndForms(ends[1]);
  if (!a || !b) return null;
  const again = a.word === b.word;
  return `mezi ${a.word} a ${again ? `${b.feminine ? 'další' : 'dalším'} ` : ''}${b.word}`;
}

/**
 * Zarostlá cesta (D67; Martin 15. 11. 2026: „Nepoužívaná cesta zarostla. – tohle také neříká nic
 * o tom, která to byla cesta.“): „Nepoužívaná cesta mezi kovárnou a potokem zarostla.“, zarostla-li
 * jen část (`part`) „Část nepoužívané cesty mezi … zarostla.“; starší zápis bez konců postaru.
 */
function roadOvergrownText(event: Extract<ChronicleEvent, { kind: 'road-overgrown' }>): string {
  const between = event.ends ? roadBetween(event.ends) : null;
  if (between === null) return 'Nepoužívaná cesta zarostla.';
  return event.part
    ? `Část nepoužívané cesty ${between} zarostla.`
    : `Nepoužívaná cesta ${between} zarostla.`;
}

/**
 * Vyšlapaná cesta (Martin 14. 11. 2026): „Po 12 letech chůze lidé vyšlapali cestu mezi dvorcem
 * a studnou.“ Pod půl roku chůze bez doby, starší zápisy bez údajů „Lidé vyšlapali pevnou cestu.“
 */
function roadFormedText(event: Extract<ChronicleEvent, { kind: 'road-formed' }>): string {
  const between = event.ends ? roadBetween(event.ends) : null;
  const years = event.years ?? 0;
  if (between === null && years < 1) return 'Lidé vyšlapali pevnou cestu.';
  const head =
    years >= 2
      ? `Po ${formatInteger(years)} letech chůze lidé`
      : years === 1
        ? 'Po roce chůze lidé'
        : 'Lidé';
  return `${head} vyšlapali cestu${between === null ? '' : ` ${between}`}.`;
}

/** Opuštěná stavba spadla (abandonment.md – kronika). */
const STRUCTURE_FELL_TEXTS: Record<AbandonedStructure, string> = {
  idol: 'Modla, ke které léta nikdo nechodil, padla.',
  shrine: 'Opuštěná svatyně se rozpadla – zbyl jen zarůstající příkop.',
  'cemetery-fence': 'Plot hřbitova, kam nikdo nechodí, se rozpadl.',
  pen: 'Opuštěná ohrada se rozpadla.',
};

/** Vesničané opravili stavbu, ke které se zase chodí (abandonment.md – Oprava) – kronika. */
const STRUCTURE_REPAIRED_TEXTS: Record<AbandonedStructure, string> = {
  idol: 'Vesničané modlu znovu usadili a opravili.',
  shrine: 'Vesničané opravili svatyni – v ohništích zase hoří oheň.',
  'cemetery-fence': 'Vesničané opravili plot hřbitova.',
  pen: 'Vesničané opravili ohradu.',
};

/** Domácnosti odešly založit novou ves (migration.md) – kronika. */
function householdsLeftText(households: number, people: number, direction?: Direction8): string {
  const who =
    households === 1
      ? 'Jedna domácnost odešla'
      : households <= 4
        ? `${households} domácnosti odešly`
        : `${households} domácností odešlo`;
  const where = direction ? ` na ${DIRECTION_NAMES[direction].name}` : '';
  return `${who} založit novou ves${where} – ${formatInteger(people)} ${plural(people, 'člověk', 'lidé', 'lidí')}.`;
}

/**
 * Věta kroniky o výpravě (trade.md – Obchod, Výměna lidí): „Nosiči vyrazili … – nesou 100 kg obilí;
 * odchází s nimi 1 rodina.“ Bez zboží jen lidé, bez lidí jen zboží.
 */
function tradeTripText(
  lead: string,
  carry: string,
  goods: TradeGoods,
  withThem: string,
  people: TradePeople | undefined,
): string {
  const who = peopleText(people);
  const hasGoods = Object.values(goods).some((n) => (n ?? 0) > 0);
  if (who === '') return `${lead} – ${carry} ${goodsText(goods)}.`;
  if (!hasGoods) return `${lead} – ${withThem} ${who}.`;
  return `${lead} – ${carry} ${goodsText(goods)}; ${withThem} ${who}.`;
}

/** Je ve zboží aspoň něco? */
function hasAnyGoods(goods: TradeGoods): boolean {
  return Object.values(goods).some((n) => (n ?? 0) > 0);
}

/**
 * Věta kroniky o výpravě na trh, která vyrazila (markets.md – Pravidla 2 a 3): co veze, co shání
 * – prázdná část se vynechá – a kdy bude doma.
 */
function marketDepartedText(event: Extract<ChronicleEvent, { kind: 'market-departed' }>): string {
  // kdo výpravu poslal (plán 3, bod 14): vesničané, správce a kovář bez podrobností; partner za
  // hledajícím bez řádku (řekne to `married-away`) – `shownInChronicle`
  if (event.by === 'villagers') return `Vesničané jeli na trh ${toVillage(event.villageName)}.`;
  if (event.by === 'steward') return `Správce poslal výpravu ${toVillage(event.villageName)}.`;
  if (event.by === 'smith') return `Kovář šel kovat koně ${toVillage(event.villageName)}.`;
  const parts = [
    ...(hasAnyGoods(event.give) ? [`veze ${goodsText(event.give)}`] : []),
    ...(hasAnyGoods(event.wants) ? [`shání ${goodsText(event.wants)}`] : []),
  ];
  const what = parts.length > 0 ? ` – ${parts.join(', ')}` : '';
  return `Výprava vyrazila na trh ${event.villageName === '' ? 'do sousední vsi' : `do vsi ${event.villageName}`}${what}; doma bude ${formatGameDate(dateOfDayIndex(event.returnDay))}.`;
}

/** Zboží bez mincí (mince se v kronice píšou zvlášť – `exchangeParts`) a mince samotné. */
function splitCoins(goods: TradeGoods): { rest: TradeGoods; coins: number } {
  const { coins, ...rest } = goods;
  return { rest, coins: Math.round(coins ?? 0) };
}

/**
 * Části věty o směně: „prodala …“, „koupila …“ a mince zvlášť – „zaplatila 4 mince“ (`sold.coins`),
 * „dostala 16 mincí“ (`bought.coins`; markets.md – Rozhodnutí plánu 4, bod 9). Prázdné části se
 * vynechají.
 */
function exchangeParts(sold: TradeGoods, bought: TradeGoods): string[] {
  const out = splitCoins(sold);
  const inn = splitCoins(bought);
  return [
    ...(hasAnyGoods(out.rest) ? [`prodala ${goodsText(out.rest)}`] : []),
    ...(hasAnyGoods(inn.rest) ? [`koupila ${goodsText(inn.rest)}`] : []),
    ...(out.coins > 0 ? [`zaplatila ${coinsText(out.coins)}`] : []),
    ...(inn.coins > 0 ? [`dostala ${coinsText(inn.coins)}`] : []),
  ];
}

/** Věta kroniky o tržním dni vsi; bez mincí „prodala … a koupila …“, s mincemi výčet po čárkách. */
function marketHeldText(event: Extract<ChronicleEvent, { kind: 'market-held' }>): string {
  if ((event.sold.coins ?? 0) <= 0 && (event.bought.coins ?? 0) <= 0) {
    return `Na trhu ves prodala ${goodsText(event.sold)} a koupila ${goodsText(event.bought)}.`;
  }
  const parts = exchangeParts(event.sold, event.bought);
  return `Na trhu ves ${parts.join(', ')}.`;
}

/** Věta o příjezdu cizích kupců – co prodávají a co kupují, jména zboží malými písmeny. */
function merchantsArrivedText(
  event: Extract<ChronicleEvent, { kind: 'merchants-arrived' }>,
): string {
  const sells = goodsNames(event.sells);
  const buys = goodsNames(event.buys);
  const parts = [...(sells ? [`prodávají ${sells}`] : []), ...(buys ? [`kupují ${buys}`] : [])];
  return parts.length > 0
    ? `Přijeli kupci z daleka – ${parts.join(', ')}.`
    : 'Přijeli kupci z daleka.';
}

/**
 * Věta kroniky o výpravě, která se vrátila z trhu (markets.md – Pravidla 3): co prodala a koupila,
 * nic nevyměnila, nebo přivezla vše zpět ze vsi, která už nestojí (Rozhodnutí plánu 2, bod 6).
 * Bez jména vsi (záznam výpravy chyběl) jen „z trhu“.
 */
function marketReturnedText(event: Extract<ChronicleEvent, { kind: 'market-returned' }>): string {
  const exchange = exchangeParts(event.sold, event.bought);
  if (event.returned) {
    // výprava už na trhu obchodovala, než ves zanikla – vezla zpět jen to, co jí zbylo
    if (exchange.length > 0) {
      const from = event.villageName ? ` ze vsi ${event.villageName}` : '';
      return `Výprava se vrátila${from} – ${exchange.join(', ')}; ves už nestojí.`;
    }
    return event.villageName
      ? `Výprava se vrátila ze vsi ${event.villageName} se vším, co vezla – ves už nestojí.`
      : 'Výprava se vrátila se vším, co vezla – ves už nestojí.';
  }
  const from = event.villageName ? `z trhu ve vsi ${event.villageName}` : 'z trhu';
  return exchange.length > 0
    ? `Výprava se vrátila ${from} – ${exchange.join(', ')}.`
    : `Výprava se vrátila ${from} – nic nevyměnila.`;
}

/** Kam lidé odešli na čas (robota, služba…) – za slovesem. */
const AWAY_TEXTS: Record<AwayKind, string> = {
  labor: 'na robotu',
  service: 'do služby',
  campaign: 'na tažení',
  captive: 'do zajetí',
  protection: 'pod ochranu',
  refuge: 'do útočiště',
  messenger: 's poselstvím',
  journey: 'na cestu',
  craft: 'kovat koně do jiné vsi',
};

/** Odkud se lidé vrátili. */
const AWAY_BACK_TEXTS: Record<AwayKind, string> = {
  labor: 'z roboty',
  service: 'ze služby',
  campaign: 'z tažení',
  captive: 'ze zajetí',
  protection: 'z ochrany',
  refuge: 'z útočiště',
  messenger: 'z cesty s poselstvím',
  journey: 'z cesty',
  craft: 'z kování koní v jiné vsi',
};

/** „1 člověk“, „3 lidé“, „5 lidí“. */
function peopleCountText(people: number): string {
  return `${formatInteger(people)} ${plural(people, 'člověk', 'lidé', 'lidí')}`;
}

/** Co zásilka veze: „150 kg obilí, 3 krávy a 1 rodina“ (vassalage.md – Doprava a cílová ves). */
function shipmentText(goods: ShipmentManifest): string {
  const cattle = goods.cattle.cows + goods.cattle.youngOxen + goods.cattle.trainedOxen;
  const parts = [
    goods.grainKg > 0 ? `${formatInteger(goods.grainKg)} kg obilí` : '',
    goods.hayKg > 0 ? `${formatInteger(goods.hayKg)} kg sena` : '',
    goods.logs > 0
      ? `${formatInteger(goods.logs)} ${plural(goods.logs, 'kláda', 'klády', 'klád')}`
      : '',
    (goods.stoneM3 ?? 0) > 0 ? `${formatInteger(goods.stoneM3 ?? 0)} m³ kamene` : '',
    cattle > 0 ? `${formatInteger(cattle)} ks dobytka` : '',
    goods.horses > 0
      ? `${formatInteger(goods.horses)} ${plural(goods.horses, 'kůň', 'koně', 'koní')}`
      : '',
    peopleText(goods.people),
  ].filter((p) => p !== '');
  if (parts.length <= 1) return parts[0] ?? 'nic';
  return `${parts.slice(0, -1).join(', ')} a ${parts[parts.length - 1]}`;
}

/** Věta kroniky o lidech od souseda: „Ze severu přišla rodina – 4 lidé.“ */
/** Obor mistra huti pro zápis kroniky (stone-masonry.md). */
const MASON_CRAFT_TEXT: Record<MasonCraft, string> = {
  builder: 'stavbyvedoucí',
  limeBurner: 'vápeník',
  stonemason: 'kameník',
  mason: 'zedník',
  plasterer: 'štukatér',
};

function newcomerText(
  direction: Direction8,
  group: NewcomerGroup,
  people: number,
  returned: boolean,
  villageName?: string,
  coins?: number,
  female = false,
): string {
  const texts0 = (female && NEWCOMER_TEXTS[group].female) || NEWCOMER_TEXTS[group];
  // lidé ze skutečného souseda (plán 3, bod 14): „Do vsi přišla rodina z Lhoty.“; s měšcem výpravy
  // zaniklé vsi „… a 17 mincí.“ (preflight plánu 4, M14)
  if (villageName !== undefined) {
    const purse = coins ? ` a ${coinsText(coins, 'nominative')}` : '';
    return `Do vsi ${returned ? texts0.back : texts0.chronicle} ${fromVillage(villageName)}${purse}.`;
  }
  const from = DIRECTION_NAMES[direction].from;
  const texts = texts0;
  const lead = `${from.charAt(0).toUpperCase()}${from.slice(1)} ${returned ? texts.back : texts.chronicle}`;
  if (group !== 'family') return `${lead}.`;
  return `${lead} – ${formatInteger(people)} ${plural(people, 'člověk', 'lidé', 'lidí')}.`;
}

/** Věta kroniky o svatbě ve vsi (kinship.md – Sňatky): kdo se k komu stěhoval, vdova. */
function marriageText(event: Extract<ChronicleEvent, { kind: 'marriage' }>): string {
  if (event.groomMoved) {
    return event.widow
      ? 'Svatba – k vdově se přiženil muž ze vsi.'
      : 'Svatba – ženich se přiženil k nevěstě.';
  }
  if (event.fromDwellingId === event.toDwellingId) {
    return event.widow ? 'Svatba – vdova se znovu vdala.' : 'Svatba ve vsi.';
  }
  return event.widow
    ? 'Svatba – vdova se přestěhovala k ženichovi.'
    : 'Svatba – nevěsta se přestěhovala k ženichovi.';
}

/**
 * Kdo šel pro kování k vozu (wagons.md – Kování vozů) – „tesař šel se 6 nosiči“, „syn tesaře jel
 * s vozem“ (malým písmenem, jak je ve větě).
 */
export function ironTripWho(son: boolean, porters: number, byCart: boolean): string {
  const who = son ? 'syn tesaře' : 'tesař';
  if (byCart) return `${who} jel s vozem`;
  if (porters <= 0) return `${who} šel`;
  return `${who} šel ${porters === 1 ? 's 1 nosičem' : `se ${porters} nosiči`}`;
}

/**
 * Nájezd věcně (war.md – Co hráč vidí: Kronika): „Nájezd Bořivoje ze vsi Lhota na ves Kněžice bez
 * opovědi: padli 3, raněni 2, odvedeno 5, vzato 400 kg obilí a 6 ovcí.“ Nulové části chybí.
 */
function raidText(event: Extract<ChronicleEvent, { kind: 'raid' }>): string {
  const from = event.from === undefined ? '' : ` ze vsi ${event.from}`;
  const target = event.target === undefined ? '' : ` na ves ${event.target}`;
  const head = `Nájezd ${genitiveOf(event.leader)}${from}${target}${event.declared ? '' : ' bez opovědi'}`;
  const parts: string[] = [];
  const n = (v: number): number => Math.round(v);
  if (n(event.fallen) > 0) {
    parts.push(`${plural(event.fallen, 'padl', 'padli', 'padlo')} ${formatInteger(event.fallen)}`);
  }
  if (n(event.wounded) > 0) {
    parts.push(
      `${plural(event.wounded, 'raněn', 'raněni', 'raněno')} ${formatInteger(event.wounded)}`,
    );
  }
  if (n(event.led) > 0) {
    parts.push(
      `${plural(event.led, 'odveden', 'odvedeni', 'odvedeno')} ${formatInteger(event.led)}`,
    );
  }
  const loot = lootItems(event.loot);
  if (loot.length > 0) parts.push(`vzato ${listText(loot)}`);
  return parts.length === 0 ? `${head}.` : `${head}: ${parts.join(', ')}.`;
}

/** Kořist po položkách: „400 kg obilí“, „6 ovcí“ (nulové chybí). */
function lootItems(loot: RaidLoot): string[] {
  const food: [number, string][] = [
    [loot.grainKg, 'obilí'],
    [loot.legumesKg, 'luštěnin'],
    [loot.meatKg, 'masa'],
    [loot.cheeseKg, 'sýra'],
  ];
  const items = food
    .filter(([kg]) => Math.round(kg) > 0)
    .map(([kg, what]) => `${formatInteger(kg)} kg ${what}`);
  for (const species of ['sheep', 'goat', 'pig', 'cow'] as const) {
    const animals = formatAnimals({ [species]: loot.livestock[species] });
    if (animals !== '') items.push(animals);
  }
  return items;
}

/** Výčet „a, b a c“. */
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} a ${items.at(-1)!}`;
}

/** 2. pád mužského jména rodu („vazalem Bořivoje“): jako 4. pád, jen -a → -y. */
function genitiveOf(name: string): string {
  return name.endsWith('a') ? `${name.slice(0, -1)}y` : accusativeOf(name);
}

/** 3. pád mužského jména rodu („válku Ctiborovi“): -a → -ovi, jinak +ovi (Honza → Honzovi). */
function dativeOf(name: string): string {
  return name.endsWith('a') ? `${name.slice(0, -1)}ovi` : `${name}ovi`;
}

/** 7. pád mužského jména rodu („s Bořivojem“): -a → -ou, -ek → -kem, jinak +em; samohláskové beze změny. */
function instrumentalOf(name: string): string {
  if (name.endsWith('a')) return `${name.slice(0, -1)}ou`;
  if (name.endsWith('ek')) return `${name.slice(0, -2)}kem`;
  if (/[eiyouáéíóúůý]$/i.test(name)) return name;
  return `${name}em`;
}

/** Výrobky řemeslníků ve 2. pádě za množstvím („120 kg keramiky“ – crafts.md, Nákup u sousedů). */
const PRODUCT_GENITIVES: Record<CraftProduct, string> = {
  toolsKg: 'nástrojů',
  potteryKg: 'keramiky',
  woodToolsKg: 'dřevěného nářadí',
};

/**
 * Množství v kg („394 kg obilí a 12 kg luštěnin“): části, které se zaokrouhlí aspoň na 1 kg (zbytek
 * pod půl kila se nepíše); když žádná, největší jako 1 kg. Bez kladných částí null.
 */
function kgList(parts: readonly { kg: number; genitive: string }[]): string | null {
  const positive = parts.filter((p) => p.kg > 0);
  if (positive.length === 0) return null;
  const shown = positive.filter((p) => Math.round(p.kg) >= 1);
  const items = shown.length > 0 ? shown : [positive.reduce((a, b) => (b.kg > a.kg ? b : a))];
  return listText(items.map((p) => `${formatInteger(Math.max(1, p.kg))} kg ${p.genitive}`));
}

/** První písmeno velké – věta začíná obyvateli vsi („Obyvatelé vsi Nová Ves směnili…“). */
function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Nákup u souseda jako směna (crafts.md – Nákup u sousedů; Martin 14. 11. 2026: „{Vlkovští}
 * směnili {co a kolik} za {co a kolik} s {Lhotskými}.“): „Vlkovští směnili 394 kg obilí za 120 kg
 * keramiky a 40 kg dřevěného nářadí s Lhotskými.“ Bez seedu vsi (jméno souseda neznámé)
 * „s obyvateli sousední vsi“.
 */
function craftsBoughtText(
  event: Extract<ChronicleEvent, { kind: 'crafts-bought' }>,
  villageName: string,
  seed: number | undefined,
): string {
  const pay =
    kgList([
      { kg: event.pay.grainKg ?? 0, genitive: 'obilí' },
      { kg: event.pay.legumesKg ?? 0, genitive: 'luštěnin' },
    ]) ?? 'obilí';
  const goods = kgList(
    CRAFT_PRODUCTS.map((p) => ({ kg: event.get[p] ?? 0, genitive: PRODUCT_GENITIVES[p] })),
  );
  // koupený vůz (crafts.md – Nákup u sousedů, Vozy) – „za dvoukolák a 9 kg nástrojů“
  const cart = event.cart ? CART_NAMES[event.cart].toLowerCase() : null;
  const get = cart && goods ? `${cart} a ${goods}` : (cart ?? goods ?? 'výrobky řemeslníků');
  const partner =
    seed === undefined
      ? 's obyvateli sousední vsi'
      : withVillagersOf(legacyNeighbourName(seed, event.direction));
  return `${capitalized(villagersOf(villageName))} směnili ${pay} za ${get} ${partner}.`;
}

/**
 * Kování koní (horses.md – Kování): vlastní kovář, nebo kovář ze sousední vsi jménem (Martin
 * 14. 11. 2026: „Kovář z Lhoty okul koně.“); zápis bez směru (starší) nebo bez seedu vsi „Kovář
 * z jiné vsi okul koně.“
 */
function horsesShodText(
  event: Extract<ChronicleEvent, { kind: 'horses-shod' }>,
  seed: number | undefined,
): string {
  if (event.own) return 'Kovář okul koně.';
  if (event.villageName !== undefined) return `Kovář ${fromVillage(event.villageName)} okul koně.`;
  if (event.direction === undefined || seed === undefined) return 'Kovář z jiné vsi okul koně.';
  return `Kovář ${fromVillage(legacyNeighbourName(seed, event.direction))} okul koně.`;
}

/**
 * Text události kroniky česky. `seed` – seed vsi pro jména sousedů (`legacyNeighbourName` – kovář
 * a směna se sousedem jménem vsi); bez něj se soused jménem nepíše.
 */
export function chronicleText(event: ChronicleEvent, villageName: string, seed?: number): string {
  switch (event.kind) {
    case 'village-founded':
      return `Osadníci založili ves ${villageName}.`;
    // jméno dítěte (population.md – Jména); starší zápisy a syn vojvody, který čeká na jméno, bez něj
    case 'birth':
      return (
        (event.name === undefined
          ? 'Narodilo se dítě.'
          : `Narodil${event.female ? 'a' : ''} se ${event.name}.`) +
        populationSentence(event.population)
      );
    case 'line-birth':
      return 'Vojvodovi se narodil syn.';
    case 'line-named':
      if (event.house) {
        const afterText = {
          grandfather: ' po dědovi',
          uncle: ' po strýci',
          'great-grandfather': ' po pradědovi',
          kinsman: ' po předkovi',
        };
        return `Syn dostal jméno ${event.name}${event.after ? afterText[event.after] : ''}.`;
      }
      return event.who === 'lord'
        ? `Vojvoda dostal jméno – ${event.name}.`
        : event.who === 'son'
          ? `Syn vojvody dostal jméno – ${event.name}.`
          : `Muž rodu dostal jméno – ${event.name}.`;
    case 'lord':
      return event.name === undefined
        ? 'Ves má nového vojvodu.'
        : `Vojvodou se stal ${event.name}.`;
    case 'lord-sent': {
      // prázdné jméno – cizí správce (mask-village-names.ts)
      const where = event.villageName === '' ? 'do jiné vsi' : `do vsi ${event.villageName}`;
      return event.name === undefined
        ? `Muž rodu odešel vládnout ${where}.`
        : `${event.name} odešel vládnout ${where}.`;
    }
    case 'shipment-sent':
      if (event.purpose === 'domain-food') {
        return `Jídlo pro ves${event.villageName === '' ? '' : ` ${event.villageName}`}: ${shipmentText(event.goods)}.`;
      }
      return `Zásilka vyrazila${event.villageName === '' ? '' : ` do vsi ${event.villageName}`} – ${shipmentText(event.goods)}.`;
    case 'shipment-received':
      if (event.purpose === 'domain-food' && !event.returned) {
        const cattle =
          event.goods.cattle.cows + event.goods.cattle.youngOxen + event.goods.cattle.trainedOxen;
        return `Jídlo${event.villageName === '' ? '' : ` ze vsi ${event.villageName}`}: ${shipmentText(event.goods)}${cattle > 0 ? ', dobytek poražen' : ''}.`;
      }
      return event.returned
        ? `Zásilka se vrátila${event.villageName === '' ? '' : ` ze vsi ${event.villageName}`} – ${shipmentText(event.goods)}.`
        : `Zásilka ${event.villageName === '' ? '' : `ze vsi ${event.villageName} `}dorazila – ${shipmentText(event.goods)}.`;
    case 'people-away':
      return `${peopleCountText(event.people)} ${plural(event.people, 'odešel', 'odešli', 'odešlo')} ${AWAY_TEXTS[event.away]} ${event.villageName === '' ? 'do sousední vsi' : `do vsi ${event.villageName}`} – doma ${plural(event.people, 'bude', 'budou', 'bude')} nejpozději ${formatGameDate(dateOfDayIndex(event.untilDay))}.`;
    case 'people-back':
      // uprchlíky vrátil správce (war.md – Varování, poslové a útěk do hradiště; návrh Clauda)
      if (event.steward) return 'Správce vrátil lidi domů.';
      if (event.away === 'campaign') {
        return campaignBackText(event.people, event.who, event.deserted === true);
      }
      return `${peopleCountText(event.people)} se ${plural(event.people, 'vrátil', 'vrátili', 'vrátilo')} domů ${AWAY_BACK_TEXTS[event.away]}.`;
    case 'guests-came':
      return `${event.villageName === '' ? 'Ze sousední vsi' : `Ze vsi ${event.villageName}`} ${plural(event.people, 'přišel', 'přišli', 'přišlo')} ${peopleCountText(event.people).toLowerCase()} ${AWAY_TEXTS[event.away]}.`;
    case 'refuge-left':
      return event.villageName === undefined || event.villageName === ''
        ? 'Lidé odešli do hradiště.'
        : `Lidé odešli do hradiště ${event.villageName}.`;
    case 'refuge-hidden':
      return 'Lidé se ukryli v lese.';
    case 'refuge-caught':
      return `Vojsko dostihlo uprchlíky: ${[
        event.killed > 0 ? `padli ${formatInteger(event.killed)}` : '',
        event.led > 0 ? `odvedeno ${formatInteger(event.led)}` : '',
        (event.captured ?? 0) > 0 ? `zajato ${formatInteger(event.captured ?? 0)}` : '',
      ]
        .filter((part) => part !== '')
        .join(', ')}.`;
    case 'messenger-caught':
      if (event.fate === 'killed') {
        return event.name === undefined ? 'Posel padl.' : `Posel ${event.name} padl.`;
      }
      if (event.fate === 'captured') {
        return event.name === undefined
          ? 'Posla zajalo vojsko.'
          : `Posla ${event.name} zajalo vojsko.`;
      }
      return event.name === undefined
        ? 'Posla odvedlo vojsko.'
        : `Posla ${event.name} odvedlo vojsko.`;
    case 'line-arrived':
      return event.name === undefined
        ? 'Z jiné vsi rodu přišel muž s rodinou.'
        : `Z jiné vsi rodu přišel ${event.name} s rodinou.`;
    case 'negotiation':
      switch (event.step) {
        case 'offer':
          return `Návrh dohody – ${event.actor} a ${event.other}.`;
        case 'counter':
          return `Protinávrh dohody – ${event.actor} a ${event.other}.`;
        case 'rejected':
          return `Dohoda odmítnuta – ${event.actor} a ${event.other}.`;
        case 'withdrawn':
          return `Návrh dohody stažen – ${event.actor} a ${event.other}.`;
        case 'expired':
          return `Návrh dohody vypršel bez odpovědi – ${event.actor} a ${event.other}.`;
        case 'terms-accepted':
          return `Nové podmínky dohody přijaty – ${event.actor} a ${event.other}.`;
        case 'aid-gift':
          return `Dar přijat – ${event.actor} a ${event.other}.`;
        case 'aid-loan':
          return `Půjčka sjednána – ${event.actor} a ${event.other}.`;
        case 'trade-accepted':
          return `Obchod sjednán – ${event.actor} a ${event.other}.`;
      }
    case 'war':
      switch (event.step) {
        case 'declared':
          return `${event.actor} opověděl válku ${dativeOf(event.other)}.`;
        case 'ambush':
          return `${event.actor} přepadl ${accusativeOf(event.other)} bez opovědi.`;
        case 'quiet':
          return `Válka s ${instrumentalOf(event.other)} utichla.`;
        case 'peace':
          return `Mír s ${instrumentalOf(event.other)}.`;
      }
    case 'campaign':
      switch (event.step) {
        case 'set-out':
          return `Vojsko ${genitiveOf(event.leader)} vyrazilo.`;
        case 'returned':
          return `Vojsko ${genitiveOf(event.leader)} se vrátilo.`;
        case 'disbanded':
          return `Výprava ${genitiveOf(event.leader)} se rozpadla.`;
      }
    case 'raid':
      return raidText(event);
    case 'christianity-known':
      return 'Rod se dozvěděl o novém Bohu.';
    case 'lord-baptized':
      return `${lordLine(event)} se dal pokřtít.`;
    case 'converted':
      return event.count === 1 ? 'Pokřtil se 1 vesničan.' : `Pokřtilo se ${event.count} vesničanů.`;
    case 'wives-released':
      return `${lordLine(event)} propustil vedlejší manželky (${event.count}).`;
    case 'negotiation-accepted':
      return `${event.vassal} se stal vazalem ${genitiveOf(event.lord)}.`;
    case 'vassalage-renounced':
      return `Vazalství mezi ${event.lord} (pán) a ${event.vassal} (vazal) skončilo vypovězením.`;
    case 'levy':
      return levyLine(event);
    case 'disobeyed':
      return `${event.name} neposlechl pána.`;
    case 'tribute-short':
      return `${event.payer} poslal tribut rodu ${event.recipient} neúplný.`;
    case 'passage-announced':
      return `${event.name} ohlásil průchod.`;
    case 'no-show':
      return `${event.name} nepřišel do války.`;
    case 'blocked':
      return `${event.blocker} zablokoval ${accusativeOf(event.blocked)}.`;
    case 'senior':
      return event.name === undefined
        ? 'Rod má nového seniora.'
        : `Seniorem rodu je ${event.name}.`;
    // `name` je jméno muže (Martin 15. 11. 2026 k „Další žena – Lutobor.“: „Jako že Lutobor
    // podstoupil tranzici?“) – věta musí říct, že si ženu vzal on
    case 'extra-wife':
      return extraWifeText(event);
    case 'main-wife':
      return mainWifeText(event);
    case 'son-left-manor':
      return event.name === undefined
        ? 'Syn vojvody odešel z dvorce.'
        : `Syn vojvody odešel z dvorce – ${event.name}.`;
    case 'wife-left-manor':
      return 'Vedlejší žena odešla z dvorce.';
    case 'master-left':
      return `Mistr huti (${MASON_CRAFT_TEXT[event.craft]})${event.name === undefined ? '' : ` ${event.name}`} odešel ze vsi${event.people > 1 ? ' i s rodinou' : ''}.`;
    case 'master-promoted':
      return `Nový mistr huti (${MASON_CRAFT_TEXT[event.craft]}): ${event.name ?? 'místní muž'}.`;
    case 'line-ended':
      return event.name === undefined
        ? 'Ve vsi už nežije žádný muž rodu.'
        : `Ve vsi už nežije žádný muž rodu – posledním vojvodou byl ${event.name}.`;
    case 'death':
      return deathLine(event);
    case 'hunt-injury':
      return `${event.name ?? 'Lovec'} byl zraněn na lovu ${PREY_GENITIVE[event.prey]} – 60 dní nepracuje.`;
    case 'village-extinct':
      return `Zemřel poslední obyvatel – ves ${villageName} vymřela.`;
    case 'household-founded':
      return 'V obydlí založila domácnost nová rodina.';
    case 'household-merged':
      return 'Zbytek domácnosti se přestěhoval k příbuzným nebo sousedům.';
    case 'marriage':
      return marriageText(event);
    // skutečný soused (plán 3, bod 14): „Nevěsta z Lhoty.“; starší zápisy beze jména vsi beze změny
    case 'bride-from-outside':
      return event.villageName === undefined
        ? 'Muž si přivedl nevěstu ze sousední vsi.'
        : `Nevěsta ${fromVillage(event.villageName)}.`;
    case 'groom-from-outside':
      if (event.villageName !== undefined) return `Ženich ${fromVillage(event.villageName)}.`;
      return event.widow
        ? 'K vdově se přiženil muž ze sousední vsi.'
        : 'K ženě se přiženil muž ze sousední vsi.';
    case 'married-away':
      return `${event.groom ? 'Syn se přiženil' : 'Dcera se vdala'} ${toVillage(event.villageName ?? '')}.`;
    case 'construction-finished':
      return finishedText(event);
    case 'cart-made':
      return `Tesař vyrobil ${CART_NAMES[event.cart].toLowerCase()}.`;
    case 'iron-trip':
      return `Ves nemá kováře – ${ironTripWho(event.son, event.porters ?? 0, event.byCart === true)} pro kování k vozu ${event.to === '' ? 'do sousední vsi' : `do vsi ${event.to}`}.`;
    case 'iron-brought':
      return `${event.son ? 'Syn tesaře přinesl' : 'Tesař přinesl'} kování k vozu.`;
    case 'cart-worn-out':
      return `${CART_NAMES[event.cart]} dosloužil – tesař vyrobí nový.`;
    case 'rebuild-decided':
      return `Obyvatelé se rozhodli přestavět dožilé obydlí na ${DWELLING_NAMES[event.type].accusative}.`;
    case 'construction-cancelled':
      return cancelledText(event.constructionKind, event.craft, event.penSpecies);
    case 'parts-abandoned':
      return abandonedPartsText(event.parts);
    case 'parts-returned':
      return returnedPartsText(event.parts);
    case 'fortification-demolished':
      return fortDemolishedText(event);
    case 'relocation-started':
      return `Domácnost si začala stavět novou ${DWELLING_NAMES[event.type].accusative} – přestěhuje se.`;
    case 'relocation-cancelled':
      return 'Stěhování domácnosti se zrušilo – zůstává ve starém domě.';
    case 'household-relocated':
      return 'Domácnost se přestěhovala do nového domu – starý zůstal prázdný.';
    case 'households-left':
      return householdsLeftText(event.households, event.people, event.direction);
    case 'son-left-village':
      // lord.md – Dělení vsi, Nová ves: „Bořivoj odešel založit ves Lhota“ (+ směr a počet lidí)
      return `${event.name ?? 'Syn vojvody'} odešel založit ves${event.village === undefined ? '' : ` ${event.village}`}${event.direction ? ` na ${DIRECTION_NAMES[event.direction].name}` : ''} – ${formatInteger(event.people)} ${plural(event.people, 'člověk', 'lidé', 'lidí')}.`;
    case 'village-abandoned':
      return event.reason === 'line-ended'
        ? `Ves ${villageName} opuštěna – rod vymřel.`
        : `Odešli všichni – ves ${villageName} je opuštěná.`;
    case 'journey-started':
      return `Lidé vyrazili na ${DIRECTION_NAMES[event.direction].name} – na místo nové vsi dorazí ${formatGameDate(dateOfDayIndex(event.arrivalDay))}.`;
    case 'harvest':
      return `${HARVEST_NAMES[event.crop ?? 'any']}: ${formatInteger(event.kg)} kg ${HARVEST_GOODS[event.crop ?? 'any']}.${stockSentence(event.crop === 'legume' ? 'Luštěniny' : 'Obilí', event.stock)}`;
    case 'led-settled':
      return ledSettledText(event);
    case 'linen-short':
      return `Lnu je na oděv málo – vytrhali ${formatInteger(event.kg)} kg z ${formatInteger(event.neededKg)} kg, které lidé potřebují.`;
    case 'apple-harvest':
      return `Sklizeň ovoce: ${formatInteger(event.kg)} kg.${stockSentence('Jablka', event.stock)}`;
    case 'garden-harvest':
      // starší zápisy z doby lnu na zahrádkách nesou i len
      return event.flaxKg !== undefined
        ? `Sklizeň zahrádek: ${formatInteger(event.flaxKg)} kg lnu a ${formatInteger(event.legumeKg)} kg luštěnin.`
        : `Sklizeň zahrádek: ${formatInteger(event.legumeKg)} kg luštěnin.${stockSentence('Luštěniny', event.stock)}`;
    case 'slaughter':
      return `Podzimní porážka: ${formatInteger(event.kg)} kg masa.`;
    case 'emergency-slaughter': {
      const animals = formatAnimals(event.animals);
      return `Jídlo do sklizně by nevystačilo – vesničané porazili ${animals !== '' ? animals : 'dobytek'} navíc: ${formatInteger(event.kg)} kg masa.`;
    }
    case 'meat-spoiled':
      return `Zbytek uzeného masa se zkazil: ${formatInteger(event.kg)} kg.`;
    case 'wool-short':
      return `Ovcí je na oděv málo – ${formatInteger(Math.floor(event.sheep))} z ${formatInteger(event.needed)}, lidem chybí vlna.`;
    case 'hay-slaughter': {
      const animals = formatAnimals(event.animals);
      return `Seno do jara nevystačí – vesničané porazili ${animals !== '' ? animals : 'dobytek'}: ${formatInteger(event.kg)} kg masa.`;
    }
    case 'herd-starved':
      return `Přes zimu chybělo seno – uhynulo ${formatInteger(
        Object.values(event.animals).reduce((sum, n) => sum + n, 0),
      )} kusů dobytka.`;
    case 'team-ready':
      // voli po kusech (oxen.md); kronika uložená dřív – spřežení
      if (event.oxen === undefined) return 'Spřežení volů je vycvičené – orá rádlem.';
      return event.oxen === 1
        ? 'Vůl je vycvičený – táhne dvoukolák, s druhým rádlo.'
        : `Voli jsou vycvičení (${event.oxen}) – táhnou rádla a vozy.`;
    case 'team-retired':
      if (event.oxen === undefined) return 'Spřežení dosloužilo – voli zestárli a šli na maso.';
      return event.oxen === 1
        ? 'Vůl dosloužil – zestárl a šel na maso.'
        : `Voli dosloužili (${event.oxen}) – zestárli a šli na maso.`;
    case 'ox-died':
      if (event.oxen === undefined) {
        return event.training
          ? 'Přes zimu chybělo seno – tele ve výcviku uhynulo.'
          : 'Přes zimu chybělo seno – vůl uhynul a spřežení se rozpadlo.';
      }
      if (event.training) {
        return event.oxen === 1
          ? 'Přes zimu chybělo seno – tele ve výcviku uhynulo.'
          : `Přes zimu chybělo seno – uhynula telata ve výcviku (${event.oxen}).`;
      }
      return event.oxen === 1
        ? 'Přes zimu chybělo seno – vůl uhynul.'
        : `Přes zimu chybělo seno – uhynuli voli (${event.oxen}).`;
    case 'horse-starved':
      return event.horses === 1
        ? 'Přes zimu chybělo seno – kůň uhynul.'
        : `Přes zimu chybělo seno – uhynuli koně (${event.horses}).`;
    case 'foal-born':
      return event.foals === 1
        ? 'V ohradě koní se narodilo hříbě.'
        : `V ohradě koní se narodila hříbata (${event.foals}).`;
    case 'horses-arrived':
      return 'Do ohrady koní přivedli hřebce a dvě klisny.';
    case 'horses-shod':
      return horsesShodText(event, seed);
    case 'bear-returned':
      return 'Medvěd se vrátil do lesů.';
    case 'predator-kill': {
      const heads = event.heads;
      if (event.by === 'bear') {
        return heads === 1
          ? 'Medvěd strhl prase v lese.'
          : `Medvěd strhl prasata v lese (${heads}).`;
      }
      const one = { sheep: 'ovci', goat: 'kozu', pig: 'prase', cow: 'krávu' }[event.species];
      const many = { sheep: 'ovce', goat: 'kozy', pig: 'prasata', cow: 'krávy' }[event.species];
      return heads === 1 ? `Vlci strhli ${one}.` : `Vlci strhli ${many} (${heads}).`;
    }
    case 'hunt': {
      const { boar, deer, wolves, bear } = event.kills;
      const catches = [
        boar > 0 ? (boar === 1 ? 'divoké prase' : `divoká prasata (${boar})`) : null,
        deer > 0 ? (deer === 1 ? 'kus jelení zvěře' : `jelení zvěř (${deer})`) : null,
        wolves > 0 ? (wolves === 1 ? 'vlka' : `vlky (${wolves})`) : null,
        bear > 0 ? 'medvěda' : null,
      ].filter((x): x is string => x !== null);
      const who = event.names[0] ?? 'Rod';
      const meat = event.meatKg > 0 ? ` – ${Math.round(event.meatKg)} kg masa do zásoby` : '';
      return `${who} s lovci ulovil ${catches.join(', ')}${meat}.`;
    }
    case 'wildlife-damage':
      return `Zvěř a vrány zničily letos ${event.kg} kg obilí na polích.`;
    case 'horse-trained':
      return 'Kůň je vycvičený pod jezdcem.';
    case 'horse-retired':
      if (event.reason === 'hay') {
        return event.horses === 1
          ? 'Seno do jara nevystačí – kůň šel na maso.'
          : `Seno do jara nevystačí – koně šli na maso (${event.horses}).`;
      }
      if (event.reason === 'age') {
        return event.horses === 1
          ? 'Kůň dosloužil – zestárl a šel na maso.'
          : `Koně dosloužili – zestárli a šli na maso (${event.horses}).`;
      }
      return event.horses === 1
        ? 'Kůň navíc šel na maso.'
        : `Koně navíc šli na maso (${event.horses}).`;
    case 'orchard-gone':
      return 'Starý sad dosloužil a zarostl loukou.';
    case 'orchard-renewal-started':
      return orchardRenewalText(villageName, event.squares);
    case 'land-taken':
      return landTakenText(event.land, event.areaM2, event.gone, event.by);
    case 'hunger-began':
      return 'Ve vsi začal hlad – zásoby nevystačí do sklizně.';
    case 'hunger-ended':
      return 'Hlad skončil.';
    case 'notice-began':
    case 'notice-ended':
      return noticeChronicleText(event.notice, event.kind === 'notice-ended');
    case 'lord-to-field':
      return event.reason === 'sowing'
        ? 'Vojvodova rodina jde na pole – ves nestihne osev.'
        : 'Vojvodova rodina jde na pole – ves šetří jídlem.';
    case 'lord-to-training':
      return 'Vojvodova rodina se vrací k výcviku.';
    case 'part-became-forest':
      return forestText(event.parts ?? 1, event.gone ?? false);
    case 'sacred-spared':
      return event.site === 'oak'
        ? 'Vesničané ušetřili posvátný dub.'
        : 'Vesničané ušetřili dubový háj.';
    case 'sacred-oak-died':
      return 'Posvátný dub stářím uschl – zůstala posvátná souš.';
    case 'sacred-snag-fell':
      return 'Posvátná souš padla.';
    case 'sacred-felled':
      return event.site === 'oak' ? 'Vykáceli posvátný dub.' : 'Vykáceli posvátný háj.';
    case 'cemetery-ploughed':
      return 'Zaorali starý hřbitov.';
    case 'road-formed':
      return roadFormedText(event);
    case 'road-overgrown':
      return roadOvergrownText(event);
    case 'trail-built':
      return `Zemská stezka na ${DIRECTION_NAMES[event.direction].name} je dostavěná.`;
    case 'trade-departed':
      return tradeTripText(
        `Nosiči vyrazili po stezce na ${DIRECTION_NAMES[event.direction].name}`,
        'nesou',
        event.give,
        'odchází s nimi',
        event.people,
      );
    case 'seed-bought': {
      const pay = [
        ...(event.pay.ironBarsKg ? [`${formatInteger(event.pay.ironBarsKg)} kg hřiven`] : []),
        ...(event.pay.cows
          ? [
              `${formatInteger(event.pay.cows)} ${plural(event.pay.cows, 'krávou', 'kravami', 'kravami')}`,
            ]
          : []),
      ].join(' a ');
      const change = event.changeKg
        ? ` Za přeplatek dostali ${formatInteger(event.changeKg)} kg obilí k jídlu.`
        : '';
      return `Vesničané koupili u sousedů ${formatInteger(event.seedKg)} kg obilí na osivo – zaplatili ${pay}.${change}`;
    }
    case 'seed-short':
      // bez důvodu – ves osivo nekupuje (markets.md – Pravidla 1); starší zápisy s důvodem
      return event.reason === 'supply'
        ? `Na setí chybí ${formatInteger(event.shortKg)} kg osiva a sousedé letos víc obilí nemají – díly bez osiva vesničané nezasejí.`
        : event.reason === 'pay'
          ? `Na setí chybí ${formatInteger(event.shortKg)} kg osiva a vesničané nemají čím ho u sousedů zaplatit – díly bez osiva nezasejí.`
          : `Na setí chybí ${formatInteger(event.shortKg)} kg osiva – díly bez osiva vesničané nezasejí.`;
    case 'crafts-bought':
      return craftsBoughtText(event, villageName, seed);
    case 'trade-returned':
      return tradeTripText(
        `Nosiči se vrátili ${DIRECTION_NAMES[event.direction].from}`,
        'přinesli',
        event.get,
        'přišli s nimi',
        event.people,
      );
    case 'market-arrived': {
      // trh ve vsi (markets.md – Pravidla 3); výprava jen na pivo bez zboží, kovář kovat koně
      if (event.smith) return `Na trh přišel kovář ${fromVillage(event.villageName)}.`;
      const from = event.villageName === '' ? 'ze sousední vsi' : `ze vsi ${event.villageName}`;
      return Object.values(event.goods).some((n) => (n ?? 0) > 0)
        ? `Na trh přišla výprava ${from} – ${goodsText(event.goods)}.`
        : `Na trh přišla výprava ${from}.`;
    }
    case 'merchants-arrived':
      // cizí kupci na stezce (markets.md – Rozhodnutí plánu 4, bod 5)
      return merchantsArrivedText(event);
    case 'market-held':
      return marketHeldText(event);
    case 'market-departed':
      return marketDepartedText(event);
    case 'market-returned':
      return marketReturnedText(event);
    case 'order-ready':
      // hotová zakázka u řemeslníka jiné vsi (markets.md – Rozhodnutí plánu 3, bod 6)
      return `Zakázka ${inVillage(event.villageName)} je hotová.`;
    case 'newcomer':
      return newcomerText(
        event.direction,
        event.group,
        event.people,
        event.returned === true,
        event.villageName,
        event.coins,
        event.female === true,
      );
    case 'stranded-coins':
      // měšec výpravy zaniklé vsi bez lidí (preflight plánu 4, M14)
      return `Do vsi ${plural(event.coins, 'přišla', 'přišly', 'přišlo')} ${coinsText(event.coins, 'nominative')} ${fromVillage(event.villageName)}.`;
    case 'structure-fell':
      return STRUCTURE_FELL_TEXTS[event.structure];
    case 'structure-overgrown':
      return event.structure === 'threshing-floor'
        ? 'Humno, na kterém se dlouho nemlátilo, zarostlo trávou.'
        : 'Opuštěná obilná jáma se zasypala a zarovnala.';
    case 'structure-abandoned':
      return 'Stavba opuštěna.';
    case 'structure-restored':
      return 'Stavba vrácena.';
    case 'structure-repaired':
      return STRUCTURE_REPAIRED_TEXTS[event.structure];
    case 'structure-demolished':
      return event.logs > 0
        ? `Stavba zbourána – ${formatInteger(event.logs)} ${plural(event.logs, 'kláda', 'klády', 'klád')} na hromadu.`
        : 'Stavba zbourána.';
    case 'weather':
      return weatherText(event.summer, event.winter);
    case 'fire':
      return fireText(
        event.burnedDwellingIds.length,
        event.collapsedDwellingIds?.length ?? event.burnedDwellingIds.length,
      );
    case 'flood':
      return floodText(event);
    case 'tornado':
      return tornadoText(event);
    case 'hail':
      return hailText(event.partIds.length, event.dwellingIds.length);
    case 'cemetery-full':
      if (event.othersFree) return 'Jeden z hřbitovů se zaplnil – pohřbívá se do dalšího.';
      // staví se jiný hřbitov nebo rozšíření – bude kam pohřbívat
      if (event.othersBuilding) return 'Hřbitov se zaplnil.';
      return 'Hřbitov se zaplnil – mrtvé není kam pohřbívat.';
  }
}

/** Názvy posvátných staveb (happiness.md). */
export const SACRED_BUILDING_NAMES: Record<SacredBuildingKind, string> = {
  idol: 'Modla',
  shrine: 'Svatyně',
};

/** Co se opravuje (abandonment.md – Oprava) – popisek stavby. */
const REPAIR_NAMES: Record<AbandonedStructure, string> = {
  idol: 'modla',
  shrine: 'svatyně',
  'cemetery-fence': 'plot hřbitova',
  pen: 'ohrada',
};

/** Průběh opravy stavby 0–1 (abandonment.md – Oprava); bez opravy null. */
export function repairProgress(
  constructions: readonly ConstructionSummary[],
  structure: AbandonedStructure,
  id: number,
): number | null {
  const c = constructions.find(
    (x) => x.kind === 'repair' && x.repair?.structure === structure && x.repair.id === id,
  );
  return c ? c.progress : null;
}

export function constructionLabel(c: ConstructionSummary): string {
  if (c.kind === 'field') return `Pole ${formatHa(c.areaM2 ?? 0)}`;
  if (c.craft && c.kind === 'dwelling') return CRAFT_NAMES[c.craft];
  if (c.kind === 'idol' || c.kind === 'shrine') return SACRED_BUILDING_NAMES[c.kind];
  if (c.kind === 'cemetery') return `Hřbitov (${formatCells(c.squares ?? 0)})`;
  if (c.kind === 'orchard') return `Sad ${formatHa(c.areaM2 ?? 0)}`;
  if (c.kind === 'pen') return 'Ohrada';
  if (c.kind === 'ard') return 'Rádlo';
  if (c.kind === 'road' && c.wagon) return 'Vozová cesta';
  if (c.kind === 'road') return 'Úprava cesty';
  if (c.kind === 'road-apples') return 'Jabloně u cesty';
  if (c.kind === 'threshing-floor') return 'Humno';
  if (c.kind === 'fortification') return 'Opevnění';
  if (c.kind === 'demolition') return 'Bourání';
  if (c.kind === 'repair') return `Oprava – ${REPAIR_NAMES[c.repair?.structure ?? 'idol']}`;
  const type = c.dwellingType ?? 'zemnice';
  if (c.kind === 'rebuild') return `Přestavba na ${DWELLING_NAMES[type].accusative}`;
  return DWELLING_NAMES[type].nominative;
}

/** Kronika sklizní podle plodiny (fields.md – Ozim a jař); bez plodiny ves seje jen jař. */
export const HARVEST_NAMES: Record<Crop | 'any', string> = {
  winter: 'Sklizeň ozimu',
  spring: 'Sklizeň jaře',
  legume: 'Sklizeň luštěnin',
  flax: 'Trhání lnu',
  any: 'Sklizeň',
};

/** Co se sklidilo (2. pád) podle plodiny. */
export const HARVEST_GOODS: Record<Crop | 'any', string> = {
  winter: 'obilí',
  spring: 'obilí',
  legume: 'luštěnin',
  flax: 'lnu',
  any: 'obilí',
};

/**
 * Odvedení z tažení (markets.md – Rozhodnutí plánu 5, bod 1 a 11): otroci a svobodní křesťané ve
 * 4. pádě, obecný mužský rod i u žen; nulová část se vynechá.
 */
function ledSettledText(event: Extract<ChronicleEvent, { kind: 'led-settled' }>): string {
  const parts: string[] = [];
  if (event.slaves > 0) {
    parts.push(
      `${formatInteger(event.slaves)} ${plural(event.slaves, 'otroka', 'otroky', 'otroků')}`,
    );
  }
  if (event.free > 0) {
    parts.push(
      `${formatInteger(event.free)} ${plural(event.free, 'křesťana', 'křesťany', 'křesťanů')}`,
    );
  }
  return `Z tažení přivedli ${parts.join(' a ')}.`;
}

/** Věta kroniky o ročních Odvodech: „Ctibor odvedl pánu Bořivoji 100 z 150 kg obilí.“ */
function levyLine(event: Extract<ChronicleEvent, { kind: 'levy' }>): string {
  const parts = event.parts
    .filter((p) => p.agreed > 0 || p.sent > 0)
    .map((p) => `${p.sent} z ${p.agreed} ${LEVY_UNITS[p.good] ?? p.good}`);
  const what = parts.length === 0 ? 'nic' : parts.join(', ');
  const years = event.years > 1 ? ` (za ${event.years} roky)` : '';
  return `${event.vassal} odvedl pánu ${event.lord}${years}: ${what}.`;
}
