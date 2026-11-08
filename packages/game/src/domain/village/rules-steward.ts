// Čísla správce vsi (steward.md). Každé číslo s odkazem na sekci návrhu; změna čísla = i text
// v návrhu.
import { FOOD_NEED_KG_PER_YEAR } from './rules-fields';
import { LORD } from './rules-lord';
import { TRADE } from './rules-trade';
import { FIELD_GUARD } from './rules-wildlife';

import type { StewardMode } from './steward';
import type { TradeGood } from './types';

/**
 * Rozmístění – mapa hodnot krajiny, plán sídla a výpočetní rozpočet (steward.md – Rozmístění
 * „absolutní skiller“; čísla návrh Clauda).
 */
export const STEWARD = {
  /** Mapa hodnot – Pole: podíl úrody, o který díl u okraje lesa přijde zvěří (× `edgeWeight`). */
  wildlifeEdgeLoss: 0.15,
  /**
   * Mapa hodnot – Pole: podíl úrody, o který díl za rok průměrně přijde počasím bez ochrany
   * zeleně; zeleň do `PROTECTION.fullGreenM` ho chrání celý, k `noGreenM` nic.
   */
  weatherLoss: 0.06,
  /**
   * Mapa hodnot – Pole: políčko jde do bloku pole, jen když má aspoň tolik z mediánu hodnoty
   * políček louky na území (horší nechá být – louka na seno, pastva).
   */
  fieldValueFloor: 0.5,
  /** Mapa hodnot – Dům: rozestup od ostatních domů (m mezi vyklízenými plochami – přeskok požáru). */
  houseSpacingM: 12,
  /** Mapa hodnot – Dům: největší rozdíl výšek políčka proti sousedům, kde se dům vůbec zkouší (m). */
  houseSlopeM: 1,
  /** Plán sídla – Hospodářství: lidé jedné domácnosti (≈ 6–8). */
  householdPeople: 7,
  /** Plán sídla – Rezervy pro růst: plán je na tolikanásobek dnešních lidí (nejvýš, co území uživí). */
  planPeopleFactor: 2,
  /** Plán sídla – plán aspoň na tolik domácností (nová ves s jednou rodinou). */
  minHouseholds: 4,
  /**
   * Plán sídla – Rezervy pro růst: blok pole domácnosti je o tolik větší, než dnešní úrodnost
   * bloku potřebuje (díly odpočívají, půda se vyčerpá).
   */
  blockReserve: 1.25,
  /**
   * Plán sídla – Šablony: hustší šablona (shluk před řadovou vsí, ta před samotami) vyhraje, pokud
   * řidší ušetří méně než tento podíl ceny – hustá ves má výhody, které cena nezachytí (hašení,
   * obrana, sousedská pomoc).
   */
  templateMargin: 0.1,
  /** Plán sídla – Šablony: řadová ves staví domy do tolika metrů od vody. */
  rowWaterM: 100,
  /** Plán sídla – Šablony: cesty ke dvorci – pochůzky na domácnost za den (tam a zpět). */
  centreTripsPerDay: 1,
  /** Plán sídla – Šablony: pro dřevo a palivo do lesa – pochůzky na domácnost za rok (tam a zpět). */
  woodTripsPerYear: 60,
  /** Kdy se plán přepočítá: víc změn staveb hráče než tolik od posledního plánu. */
  replanChanges: 3,
  /** Kdy se plán přepočítá: nejdřív po tolika letech. */
  replanYears: 5,
  /**
   * Kdy se plán přepočítá: po vyčerpání slotů druhu nejdřív tolik dní od dokončení plánu – na
   * plném území by se jinak přepočítával dokola.
   */
  exhaustedReplanDays: 120,
  /** Výběr místa pro jednu stavbu: nejvýš tolik dalších slotů za den správce. */
  slotTries: 5,
  /** Výpočetní rozpočet: kandidáti domů – nejvýš tolik kontrol umístění v celém plánu. */
  candidateChecks: 200,
  /** Výpočetní rozpočet: kontroly umístění v jedné etapě plánu (etapa ≤ 200 ms). */
  checksPerStage: 40,
  /** Plán sídla – Ostatní: slotů jednoho druhu (hřbitov, sad, ohrada, humno, dílna) nejvýš. */
  extraSlots: 8,
  /**
   * Plán sídla – Ostatní: kandidátů jednoho druhu k ověření kontrolou umístění (sloty a náhradníci
   * za ty, které kontrolou neprojdou).
   */
  slotCandidates: 24,

  // Přestavba vlastních staveb a soužití s hráčem (steward.md – Přestavba vlastních staveb,
  // Soužití s hráčem; čísla návrh Clauda)

  /** Přestavba – Kdy se vyplatí: horizont zisku přestěhování obydlí na lepší místo (let; nejvýš životnost nového). */
  rebuildHorizonYears: 10,
  /**
   * Přestavba – Kdy se vyplatí: zisk za horizont musí převážit rozdíl ceny o tento podíl práce
   * nového domu (ať se nestěhuje kvůli šumu).
   */
  rebuildMargin: 0.2,
  /** Soužití s hráčem – Veto: tolik let po zrušení hráčem správce tentýž druh na políčku nestaví. */
  vetoYears: 5,

  // Den správce – rozhodování, režim a rozpočet (steward.md – Kde správce běží, Cíl „Růst se
  // zásobou“, Rozhodovací pořadí v den správce, Den správce – upřesnění; čísla návrh Clauda)

  /** Kde správce běží – Den správce: správce rozhoduje v den s indexem dělitelným tímto číslem. */
  everyDays: 10,
  /**
   * Cíl – Režim správce: Nouze, když zásoby k příští sklizni dají méně než tento podíl pojistky
   * (`bufferFill`), ani kdyby ves snědla osivo, které na setí čeká.
   */
  emergencyFill: 0.5,
  /**
   * Cíl – Rozpočet práce: zbývající práce rozestavěných staveb nejvýš průměrná volná práce
   * posledních 30 dní × tolik dní.
   */
  laborHorizonDays: 120,
  /** Cíl – Cíl polí: pole mají uživit lidi, kteří ve vsi budou za tolik let. */
  fieldLeadYears: 2,
  /**
   * Cíl – Cíl polí: rezerva nad cílem (díly nad potřebu na kruté roky); k ní ÷ očekávaná úroda let
   * s počasím a doplnění chybějící pojistky za `FIELD_STORES.balanceYears`.
   */
  fieldReserve: 1.1,
  /** Rozhodovací pořadí – 3. Pole: okna zakládání pole na louce a v křovinách. */
  meadowFieldWindows: [
    [
      { month: 9, day: 1 },
      { month: 2, day: 28 },
    ],
    [
      { month: 6, day: 15 },
      { month: 7, day: 31 },
    ],
  ] as readonly StewardWindow[],
  /** Rozhodovací pořadí – 3. Pole, Klučení lesa: okno zakládání pole v lese (kácení přes zimu). */
  forestFieldWindows: [
    [
      { month: 10, day: 1 },
      { month: 1, day: 31 },
    ],
  ] as readonly StewardWindow[],
  /** Rozhodovací pořadí – Obydlí, typ: polozemnice jen, když se dostaví do tohoto dne (zima). */
  winterStart: { month: 11, day: 1 } as StewardMonthDay,
  /** Den správce – upřesnění, Klučení: les pro pole nejvýš tolik políček od bloku hospodářství. */
  forestSearchTiles: 10,
  /** Den správce – upřesnění, Obydlí u dvorce: bez plánu domy nejvýš tolik políček od středu vsi. */
  centreHouseTiles: 6,

  // Rozhodovací pořadí – kroky 5 až 10 (steward.md – Ostatní stavby; čísla návrh Clauda)

  /**
   * Režimy, ve kterých krok smí začít stavbu, a podíl rozpočtu práce, který smí vzít (Nouze: jen
   * pole, obydlí a první hřbitov). Kroky Růstu (koně, sad, jabloně u cest, cesty) smějí i v Obnově,
   * ale s nižší předností – jen dokud po nich zbude `1 − podíl` celého rozpočtu polím a obydlím
   * (Ostatní stavby – upřesnění, Režimy; oprava 31. 10. 2026: Růst – plná pojistka – nastává ve
   * zdravé vsi hlavně v srpnu, mimo okna výsadby i cest).
   */
  stepModes: {
    cemetery: { emergency: 1, recovery: 1, growth: 1 },
    threshing: { recovery: 1, growth: 1 },
    pen: { recovery: 1, growth: 1 },
    horses: { recovery: 0.5, growth: 1 },
    orchard: { recovery: 0.5, growth: 1 },
    roadApples: { recovery: 0.5, growth: 1 },
    sacred: { recovery: 1, growth: 1 },
    fortification: { recovery: 1, growth: 1 },
    road: { recovery: 0.5, growth: 1 },
  } as Readonly<Record<string, Readonly<Partial<Record<StewardMode, number>>>>>,
  /** 5. Hřbitov: volné hroby na tolik let podle očekávané úmrtnosti (jinak rozšíření o čtverec). */
  graveYears: 5,
  /** 6. Humno: vyplatí se, když úspora práce za tolik let pokryje jeho cenu. */
  paybackYears: 3,
  /** 7. Ohrady: místa ohrad druhu na člověka (kusů), pod nimiž plné stádo druhu dostane ohradu. */
  penPlacesPerPerson: { cow: 0.25, pig: 0.25, sheep: 0.5, goat: 0.25 } as Readonly<
    Record<string, number>
  >,
  /** 8. Jabloně u cest: cesta vede „kolem polí“, když je jejich díl do tolika metrů od osy. */
  roadFieldM: 40,
  /**
   * 9. Posvátná místa – návratnost (steward.md – Posvátná místa podle návratnosti; návrh Clauda
   * 2. 11. 2026, dřív práh štěstí 60): modla nebo svatyně se postaví, když práce, kterou její štěstí
   * přidá (`HAPPINESS_LABOR` × práce vsi), za tolik let režimu pokryje její cenu. Horizont jako
   * u cest: stavba, ke které se chodí, nechátrá (`ABANDONMENT`) – v Růstu generace (25 let),
   * v Obnově krátký (práce je drahá), v Nouzi se nestaví. Při štěstí nad 50 dá bod štěstí
   * 0,002 práce – modla (30 čd, +8) ≈ 5,8 čd a svatyně (400 čd, +25) ≈ 18 čd na dospělého za rok:
   * v Růstu se obě vrátí už ve vsi o jednom dospělém, v Obnově modla taky, svatyně od ≈ 4,4
   * dospělého. Strop posvátných míst (+40) a štěstí 100 přínos ořežou – nad nimi se nestaví.
   */
  sacredPaybackYears: { emergency: 0, recovery: 5, growth: 25 } as Readonly<
    Record<StewardMode, number>
  >,
  /**
   * 9a. Opevnění podle hrozby (fortifications.md – Správce; návrh Clauda 5. 11. 2026): horizont
   * přínosu jako u posvátných míst – v Růstu generace (25 let), v Obnově 5 let, v Nouzi se
   * nestaví; nejvýš životnost druhu (plot 15, palisáda 20 let).
   */
  fortPaybackYears: { emergency: 0, recovery: 5, growth: 25 } as Readonly<
    Record<StewardMode, number>
  >,
  /**
   * 9a. Opevnění: obvod správce se kolem obydlí, dvorce, dílen, humen, jam a ohrad rozšiřuje po
   * prstencích políček (útočiště musí pojmout lidi a dobytek + 20 %), nejvýš tolik prstenců.
   */
  fortMaxRings: 6,
  /** 9a. Opevnění: kg obilí na člověkoden, když v okolí vsi není žádné pole k ocenění. */
  fortKgPerManDayFallback: 3,
  /** 9. Posvátná místa: modla nebo svatyně nejvýš tolik políček od středu vsi. */
  sacredSearchTiles: 8,
  /** 9. Posvátná místa: nejvýš tolik kontrol místa za den správce. */
  sacredChecks: 40,
  /**
   * 10. Cesty – návratnost vylepšení (steward.md – Ostatní stavby, Cesty; návrh Clauda 1. 11. 2026):
   * vylepšení vyšlapané cesty se vyplatí, když úspora chůze a jízd vozem za tolik let režimu pokryje
   * cenu. Horizont podle životnosti: upravená cesta s provozem nezarůstá a bez provozu vydrží 15 let
   * (`ROAD_DECAY`) – v Růstu generace (25 let), v Obnově krátký (práce je drahá), v Nouzi se
   * nestaví. 100 m za 15 člověkodní se v Růstu vrátí od ≈ 3,8 pochůzky denně, v Obnově od ≈ 19
   * (dřív jedno číslo 10 let pro oba režimy – ve Vlkově se nevrátil žádný úsek, 12–181 let).
   */
  roadPaybackYears: { emergency: 0, recovery: 5, growth: 25 } as Readonly<
    Record<StewardMode, number>
  >,
  /** 10. Cesty: vozová cesta tam, kde cesta má aspoň tolik pochůzek za den (průměr roku). */
  wagonTrips: 1,
  /** 10. Cesty: zemská stezka od tolika lidí ve vsi (režim Růst). */
  trailPeople: 30,
  /** 10. Cesty: neúspěšnou cestu nebo směr správce zkusí znovu nejdřív za tolik dní. */
  retryDays: 120,
  /** Okno 6. Humno: do 31. 7., před žněmi. */
  threshingWindows: [
    [
      { month: 1, day: 1 },
      { month: 7, day: 31 },
    ],
  ] as readonly StewardWindow[],
  /** Okno 7. a 9. (ohrady, posvátná místa): mimo žně (1. 7. – 31. 8.). */
  offHarvestWindows: [
    [
      { month: 9, day: 1 },
      { month: 6, day: 30 },
    ],
  ] as readonly StewardWindow[],
  /** Okno 10. Cesty: mimo setí (březen, duben, září) a žně (červenec, srpen). */
  roadWindows: [
    [
      { month: 10, day: 1 },
      { month: 2, day: 28 },
    ],
    [
      { month: 5, day: 1 },
      { month: 6, day: 30 },
    ],
  ] as readonly StewardWindow[],
  /**
   * Jména synů a odchod syna (steward.md – Rozhodovací pořadí, krok 2): odchod jen v tento den
   * roku – po žních, před plánem osevu 1. 9.
   */
  departureDate: { month: 8, day: 31 } as StewardMonthDay,
  /**
   * Krok 2 – přelidnění (Martin 6. 11. 2026): lidí víc než tento podíl kapacity mapy
   * (`mapCapacity`) – „např. 80 % toho, co je mapa reálně schopná uživit“.
   */
  mapCrowdedShare: 0.8,
  /**
   * Krok 2 – past osiva (Hranice – past osiva): odchod i bez přelidnění podle polí, když ves od
   * minulého 31. 8. nahromadila aspoň tolik dní hladu – nad hladem prvních let nové vsi (≤ 4,5)
   * a pod hladem pasti (11–19, kouřový test S4).
   */
  departureHungerDays: 8,
  /**
   * Převzaté hradiště (hillfort.md – Hradiště staví hráč; návrh Clauda): ves je pro správce
   * hradištěm, když do ní doména dovezla jídlo za posledních tolik dní (rozdělení je roční).
   */
  hillfortImportDays: 365,
  /**
   * Krok 2 – Kdy není kam: čtverec pole má smysl, jen když uživí víc, než sní ten, kdo ho dělá –
   * kg čisté úrody na člověkoden aspoň 1,5 × denní potřeba obilí dospělého (`FOOD_NEED_KG_PER_YEAR`).
   */
  minKgPerManDay: (1.5 * FOOD_NEED_KG_PER_YEAR.adult) / 365,
  /**
   * Krok 2 – Životaschopná výprava: díl syna má aspoň tolik dospělých (14–44 let, plná práce) –
   * jako ves, která uživí cvičící rodinu vojvody (`LORD.minVillageAdults`, Martin 24. 10. 2026);
   * 80 % práce zakladatelů nové vsi (5 dospělých).
   */
  expeditionAdults: LORD.minVillageAdults,
  /**
   * Krok 2 – Životaschopná výprava: jídlo a osivo výpravy aspoň tento podíl toho, co má nést – rok
   * jídla do příštích žní a osivo na první osev, nejvýš kolik unesou (pěšky a na voze).
   */
  expeditionLoad: 0.9,
  /**
   * Krok 2 – Životaschopná výprava: pojistka mateřské vsi (`bufferFill`) po odchodu aspoň tolik –
   * odchod ji nesmí poslat do Nouze (`emergencyFill`).
   */
  departureMotherFill: 0.5,
  /**
   * Krok 2 – Životaschopná výprava (Martin 2. 11. 2026: „neměl by syn odcházet, až když je ve
   * zdrojové vesnici dost lidí, aby obě vesnice mohly bezpečně fungovat?“; číslo návrh Clauda):
   * mateřská i nová ves po odchodu oseje vlastní prací a osivem tolik, že uživí aspoň tolikrát své
   * lidi i s dětmi (`stewardFedPeople`) – rezerva na děti, které se narodí, a na horší rok.
   */
  departureFeedShare: 1.2,
  /** Odchozí schránka: kolikrát se nevybavitelný záznam zkusí vybavit, pak se nechá být. */
  departureAttempts: 5,
  /**
   * Krok 2a – Obilí v nouzi (steward.md – Obilí a lov v nouzi; Martin 8. 11. 2026: „A“, čísla návrh
   * Clauda): výprava za obilím jen pro aspoň náklad jednoho nosiče (`TRADE.porterKg`).
   */
  grainMinKg: TRADE.porterKg,
  /** Krok 2a – s výpravou za obilím jde nejvýš tolik dospělých vsi; ostatní drží práci vsi. */
  grainPorterShare: 0.5,
  /**
   * Krok 2a – čím správce za obilí platí, v tomto pořadí: zboží, které ves nejí a bez kterého
   * hospodaří (jako nákup osiva – jídlem ani dobytkem neplatí), napřed s nejvyšší hodnotou na kg
   * nákladu, ať je výprava nejmenší (hřivny 45, keramika 3, uhlí 0,5, klády 0,4 kg obilí na kg).
   */
  grainPayment: ['ironBars', 'pottery', 'charcoal', 'logs'] as readonly TradeGood[],
  /**
   * Krok 2a – Lov v nouzi: zvěř škodí, když škoda na polích letos nebo loni dosáhne tohoto podílu
   * roční potřeby obilí z pole – stejný práh jako noční hlídka dílu (`FIELD_GUARD.night.threat`).
   */
  huntDamageShare: FIELD_GUARD.night.threat,
  /**
   * Krok 2a – Lov v nouzi nejvýš tolikrát za léto (měsíce škod červen–srpen); den lovu chybí
   * v hlídce, výcviku a práci synů (steward.md – Obilí a lov v nouzi; návrh Clauda, 8. 11. 2026).
   */
  huntsPerSummer: 3,
} as const;

/** Den v roce (měsíc a den) – hranice oken správce. */
export interface StewardMonthDay {
  readonly month: number;
  readonly day: number;
}

/** Okno roku od `from` do `to` včetně; `from` po `to` = okno přes Nový rok. */
export type StewardWindow = readonly [StewardMonthDay, StewardMonthDay];

/**
 * Kapacita mapy (steward.md – Model kapacity vsi; Martin 6. 11. 2026): kolik lidí uživí všechna
 * obdělatelná půda krajiny. Odchod syna při přelidnění: `STEWARD.mapCrowdedShare`.
 */
export const MAP_CAPACITY = {
  /**
   * Podíl potřeby energie, který na mapě bere obilí z pole (návrh Clauda): zbytek dá maso, mléko,
   * vejce a ovoce; ustálený podíl vsí je ≈ 0,8 (`FieldFoodYear.longShare`).
   */
  fieldFoodShare: 0.8,
} as const;
