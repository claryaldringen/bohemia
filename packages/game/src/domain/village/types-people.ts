// Typy stavu vsi – Lidé, domácnosti a obydlí.
// Rozcestník je `types.ts`; tento soubor jen drží část typů.

import type { Craft, Workshop } from './types-crafts';
import type { PlotSquare, TileCell } from './types-land';

// Stav vsi – JSON-serializovatelný (objekty, pole, čísla, řetězce, null).
/**
 * Typ obydlí: zemnice, polozemnice a dvorec vojvody (trade.md – Dvorec vojvody: delší a vyšší
 * polozemnice se zdobenými štíty na pozemku dvou políček). Dvorec hráč nestaví – vznikne jen
 * přestavbou dvorce vsi (`VillageState.manorId`).
 */
export type DwellingType = 'zemnice' | 'polozemnice' | 'dvorec';
/** Obydlí, která hráč staví z nabídky staveb (dvorec ne – trade.md). */
export type BuildableDwellingType = Exclude<DwellingType, 'dvorec'>;
export type FieldSurface = 'meadow' | 'shrub' | 'forest';
export interface Position {
  x: number;
  z: number;
  rotation: number;
} // svět, m; ověřuje plán 3
/** Pohlaví člověka (kinship.md). */
export type Sex = 'male' | 'female';
/**
 * Směr k sousední vsi (war.md – Svět: mřížka map, 8 sousedů): sever, severovýchod, východ,
 * jihovýchod, jih, jihozápad, západ, severozápad.
 */
export type NeighborDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export interface Person {
  id: number;
  bornDay: number;
  /**
   * Domácnost = id obydlí. Zakladatelé vsi mají id první zemnice už během její stavby (bydlí na
   * staveništi), obydlí s tím id vznikne až s dokončením.
   */
  dwellingId: number;
  /**
   * Pohlaví (kinship.md). U vsí uložených před příbuzenstvím chybí – doplní ho jednou
   * `withKinship`.
   */
  sex?: Sex;
  /** Matka a otec (id) – chybí, když jsou neznámí (zakladatelé, lidé z okolí, starší vsi). */
  motherId?: number;
  fatherId?: number;
  /**
   * Manžel / manželka (id žijícího člověka ve vsi); svobodný, vdovec a vdova ho nemají. U ženy je
   * to její muž (i u vedlejší manželky), u muže jeho hlavní manželka (lord.md – Manželky).
   */
  spouseId?: number;
  /**
   * Ze které sousední vsi člověk přišel – nevěsta z okolí a lidé z výměny se sousedem (kinship.md,
   * trade.md – Výměna lidí, war.md – příbuzní v cílové vsi); narození ve vsi ho nemají.
   */
  origin?: NeighborDirection;
  /**
   * Den, od kterého žena může znovu porodit (population.md – Růst populace, rozestup porodů): po
   * porodu za BIRTH_SPACING.afterBirthDays, po svatbě za afterWeddingDays. Chybí – kdykoli (i ve
   * vsích uložených dřív).
   */
  nextBirthFrom?: number;
  /**
   * Praxe v řemeslech (crafts.md – Učení řemesla): roky práce v dílně daného řemesla – dospělý ji
   * získává za dny, kdy dílna pracuje, syn řemeslníka jako učeň od 10 let; nejvýš
   * CRAFT_SKILL.fullYears (vyučený). Chybí – žádná praxe (i lidé ve vsích bez dílen).
   */
  practice?: Partial<Record<Craft, number>>;
  /**
   * Dovednosti muže vojvodovy rodiny (lord.md – Výcvik a zkušenost). Chybí – nula (i starší vsi),
   * převod netřeba.
   */
  arms?: ArmsSkills;
  /**
   * Jméno muže rodu (lord.md – Jména): trvalé, jen písmena. Vojvodu a jeho syny pojmenuje hráč,
   * vnuci ho dostanou při narození ze seznamu (`dynasty-names.ts`). Chybí – bez jména (ostatní
   * lidé vsi, vojvoda a synové, dokud je hráč nepojmenuje).
   */
  name?: string;
  /**
   * Muž rodu po meči (lord.md – Kdo patří k rodu): vojvoda a jeho mužští potomci po otcích.
   * Nastaví se při narození synovi muže rodu (starší vsi `withDynasty`). Jen muži; chybí – mimo rod.
   */
  line?: true;
  /**
   * Povýšený vesničan a jeho rodina (vassalage.md – Povýšení vesničana): patří do NPC rodu `houseId`,
   * ne do rodu hráče, i když je muž „po meči“ (`line`) své vsi. Chybí – běžný člověk.
   */
  noble?: { houseId: string };
  /**
   * Syn ženy, která byla hlavní manželkou svého muže (lord.md – Nástupnictví) – přednost
   * v nástupnictví i po její smrti. Chybí – ne.
   */
  mainWifeSon?: true;
  /**
   * Zraněn na lovu (wildlife.md – Nebezpečí pro lidi): do tohoto dne (výjimečně) nepracuje, necvičí
   * ani neloví. Chybí – zdráv.
   */
  injuredUntilDay?: number;
  /**
   * Pryč jen na čas (plán 2026-11-03 – rozhodnutí 11; vassalage.md – Lidé a robota): robota,
   * služba, tažení, zajetí, ochrana. Zůstává ve stavu domovské vsi, ale doma nepracuje ani nejí
   * (`isAway`); vrátí se v den `untilDay` (`returnHome`). Chybí – doma.
   */
  away?: PersonAway;
}

/** Proč je člověk pryč jen na čas (rozhodnutí 11). */
export type AwayKind = 'labor' | 'service' | 'campaign' | 'captive' | 'protection';

/** Nepřítomnost na čas: druh, den návratu domů, hostitelská ves a odkaz na důvod (dialog…). */
export interface PersonAway {
  kind: AwayKind;
  /** Den, na jehož začátku je člověk zase doma (chybí – návrat určí jiná mechanika). */
  untilDay?: number;
  hostVillageId?: string;
  refId?: string;
}

/** Odkaz na osobu napříč vsemi: ves a číslo osoby v jejím stavu (stejný tvar jako u rodů). */
export interface PersonRef {
  villageId: string;
  personId: number;
}

/**
 * Host ve vsi (rozhodnutí 11): člověk z jiné vsi tu jen na čas – jí ze zásob hostitele a pracuje
 * mu (robota napřed do opevnění – `guestLaborToday`). Ve stavu hostitele je jen odkaz; osoba
 * zůstává ve stavu domovské vsi. Odejde na začátku dne `untilDay`.
 */
export interface Guest {
  ref: PersonRef;
  kind: AwayKind;
  untilDay: number;
  adult: true;
}
/** Luk, boj a jízda 0–100; `best` je nejvyšší dosažená hodnota (spodní hranice úbytku). */
export interface ArmsSkills {
  bow: number;
  combat: number;
  riding: number;
  best?: { bow: number; combat: number; riding: number };
}
/**
 * Dcera, která se vdala pryč (kinship.md – Sňatky z okolí), nebo člověk, kterého ves dala sousedovi
 * (trade.md – Výměna lidí): jen záznam v rodokmenu, nesimuluje se –
 * id, pohlaví, den narození, rodiče a směr vsi, kam odešla (war.md – muži s příbuznými v cílové
 * vsi útočit nechtějí). Ves ho drží, jen dokud ve vsi žije její rodič, sourozenec nebo dítě.
 */
export interface Emigrant {
  id: number;
  sex: Sex;
  bornDay: number;
  direction: NeighborDirection;
  motherId?: number;
  fatherId?: number;
}
/**
 * Zemřelý nebo odešlý předek v rodokmenu (kinship.md – Příbuzenství): jen id a jeho rodiče, aby
 * šli poznat prarodiče, strýcové a bratranci žijících. Ves ho drží, jen dokud je rodičem
 * někoho žijícího.
 */
export interface Ancestor {
  id: number;
  motherId?: number;
  fatherId?: number;
}
/**
 * Kde na pozemku stojí dům: uprostřed, nebo v jednom ze čtyř rohů (population.md – Umístění
 * obydlí, Martin 18. 10. 2026). „Vpředu“ = strana s brankou, ke které míří vchod (−z světa),
 * „vlevo“ = −x světa.
 */
export type PlotVariant = 'center' | 'back-left' | 'back-right' | 'front-right' | 'front-left';
/**
 * Pozemek obydlí – celé políčko krajiny obehnané plotem a varianta, kde na něm dům stojí.
 * Polozemnice postavené dřív pozemek nemají (volná poloha bez plotu).
 */
export interface DwellingPlot {
  /** Políčko pozemku; u natočeného pozemku (`square`) políčko pod jeho středem. */
  cell: TileCell;
  variant: PlotVariant;
  /**
   * Natočený pozemek (Martin 18. 10. 2026 – „všechny stavby by měly jít natáčet po 15 stupních“,
   * varianta a: natočí se celý pozemek): čtverec o straně políčka se středem (x, z) ve světě (m)
   * natočený o `rotation` (rad, násobek 15°) – „vpředu“ s brankou je −z pozemku. Chybí = pozemek
   * je políčko `cell` bez natočení (pozemky z doby před natáčením). Dvorec (`yard`) ho nemá.
   */
  square?: PlotSquare;
  /**
   * Dvorec vojvody (trade.md): druhé políčko pozemku – dvůr sousedící stranou s políčkem domu
   * `cell`. Dům stojí uprostřed `cell` vchodem ke dvoru (varianta `center`), brána je na
   * vzdálené straně dvora. U ostatních pozemků chybí.
   */
  yard?: TileCell;
}
export interface Dwelling {
  id: number;
  type: DwellingType;
  builtDay: number;
  condition: number /* 0–1 */;
  position: Position;
  /** Pozemek (polozemnice od 18. 10. 2026); `position` je pak poloha domu na něm. */
  plot?: DwellingPlot;
  /**
   * Vzdálenost obydlí k nejbližšímu okraji lesa (m) – z krajiny při zahájení stavby (simulace
   * krajinu nemá); prodražuje palivo (forest.md – Palivo). U starších obydlí chybí (= les blízko).
   */
  forestDistanceM?: number;
  /**
   * Chůze z obydlí k nejbližšímu okraji lesa (m – po pěšinách a pevných cestách, mokřina ×2, brod
   * + 30 m; roads.md – Rychlejší chůze) – palivo (forest.md) ho bere místo `forestDistanceM`.
   * Počítá se jen s krajinou; u starších obydlí chybí do prvního přepočtu.
   */
  forestWalkM?: number;
  /**
   * Chůze z obydlí k nejbližší vodě (m – místo na břehu nejblíž vzdušnou čarou, chůze jako
   * `forestWalkM`; paths.md – Pochůzky pro vodu) – přirážka denního minima domácnosti za vodu
   * (population.md – Práce, `waterFetchingLabor`). Počítá se jen s krajinou; bez vody v okně půdy
   * pro chůzi a u starších obydlí do prvního přepočtu chybí (přirážka 0).
   */
  waterWalkM?: number;
  /**
   * Řemeslná dílna (crafts.md) – řemeslo patří budově: provozuje ho domácnost, která v ní bydlí,
   * prázdná dílna nic nevyrábí. Obyčejné obydlí ji nemá.
   */
  workshop?: Workshop;
  /**
   * Dnešní tvar bez varianty rozměrů (population.md – Varianty rozměrů): stavba ve vsi uložené
   * před variantami, které by větší varianta zasáhla jinou stavbu (`withDwellingShapes`). Jinak
   * chybí – tvar je varianta podle polohy (`dwellingShape`).
   */
  plainShape?: true;
}
/**
 * Zbytek jámy po zaniklém obydlí: zarostlá prohlubeň s kopřivami a pár trámy (population.md –
 * Po zániku). Poloha, typ, pozemek a řemeslo zaniklého obydlí (jen pro vzhled) a den zániku; id =
 * id zaniklého obydlí. Na místo zříceniny jde stavět – stavba ji odstraní.
 */
export interface DwellingRuin {
  id: number;
  type: DwellingType;
  position: Position;
  plot?: DwellingPlot;
  craft?: Craft;
  /** Zaniklé obydlí mělo dnešní tvar (`Dwelling.plainShape`) – jáma také. */
  plainShape?: true;
  /** Den zániku obydlí – od něj jáma zarůstá. */
  day: number;
  /**
   * Obydlí shořelo při požáru – zbytek jámy zůstane ohořelý natrvalo (disasters.md – Požár, Ve
   * scéně). Chybí = zanikl jinak (starší vsi příznak dostanou z kroniky – `withCharredRuins`).
   */
  charred?: true;
}
