// Dobytek, vlna, ohrady, spřežení a seno (část rozdělených pravidel, rozcestník je rules.ts).

import type { Bounds, CartKind } from './types';

/**
 * diet.md – Oděv, Vlna (Martin 19. 10. 2026: „Ovce jsou hlavně kvůli vlně, aby se lidé mohli vůbec
 * oblékat.“; čísla návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md – Vlna):
 * surové (nepráné) vlny na oděv za rok – dospělý a starší 1,6 kg, dítě 0,8 kg (kabátec, kalhoty
 * nebo sukně, plášť, onuce, kápě a díl přikrývek s dobou nošení; spodní oděv je ze lnu); chovná
 * ovce dá za rok 0,8 kg (malé ovce raného středověku, stříž nebo vyčesání v květnu); bez vlny
 * ubere štěstí až 6 (jako ovoce přidá); kronika a upozornění až pod 95 % oděvu (ovce průběžně
 * hynou – stádo právě na hranici by hlásilo drobnosti).
 */
export const WOOL = {
  kgPerYear: { child: 0.8, adult: 1.6, elder: 1.6 },
  kgPerSheep: 0.8,
  unhappiness: 6,
  noticeBelow: 0.95,
} as const;
/**
 * diet.md – Nouzová porážka (Martin 19. 10. 2026: „Ano, udělej to všechno“; podrobnosti návrh
 * Clauda): když výhled jídla do sklizně nevychází, ves dřív, než ubere z přídělu, porazí zvířata
 * navíc v pořadí `order` – prasata (žerou les, ne seno), kozy, krávy nad chovné, ovce nad ovce na
 * vlnu. Porazí tolik, aby výhled vyšel i s rezervou `reserveShare` potřeby energie do sklizně
 * (ztráty zásob skladováním a uzením výhled nezná – bez rezervy by ves porážela den co den po
 * kouscích), a nejvýš tolik, kolik pod stropem masa ve stravě (DIET.caps.meat) pomůže. Když
 * schodek celý nepokryje (málo zvířat navíc, strop masa), porazí jen tehdy, zvedne-li příděl
 * aspoň o `minGain` (2 procentní body) – jinak by po každém úmrtí (méně ovcí na vlnu) porážela
 * po kusech. Letošní mláďata na nouzovou porážku nejdou – kromě selat od `pigletsFromMonth`
 * (1. 9.; diet.md – Nouzová porážka, Martin 19. 10. 2026: „Ano ke všem návrhům“ na „letošní selata
 * smějí od 1. 9. na nouzovou porážku“ – maso se 1. 9. kazí a do podzimní porážky ves hladoví;
 * selata mají v září ≈ 5 měsíců a prasata se na podzim porážela tak jako tak).
 * Chovné prasnice (diet.md – Nouzová porážka; Martin 19. 10. 2026: „Spodní hranice chovných
 * prasnic: v nouzi se smí porážet jen do poloviny toho, kolik prasat uživí les.“): prasata jen nad
 * `pigForestShare` nosnosti lesa pro prasata (tatáž nosnost jako u podzimní porážky –
 * `winterTargets`), aspoň chovný pár – na jaře se stádo zdvojnásobí a obnoví se.
 */
/**
 * diet.md – Rodí všechny samice (Martin 19. 10. 2026: „A pastevci by se měli snažit, aby rodily
 * všechny samice.“; čísla návrh Clauda podle rešerše research/2026-10-19-breeding-culling.md):
 * každá chovná samice rodí jednou za rok. `femaleShare` – chovné samice ve stádu přes zimu (zbytek
 * býci, berani, kanci, skopci a mladé kusy; u prasat i čuníci na druhý podzim – prasata se
 * porážela do dvou let), `youngPerDam` – odchovaná mláďata na samici: narozená × přežití prvních
 * týdnů – kráva 1 tele × 0,8 (úhyn telat 21–23 %), ovce 1,15 jehněte × 0,8 (primitivní plemena
 * 0,8–0,9 bez péče, s péčí až 1,5; úhyn jehňat 17–25 %), koza 1,4 kůzlete × 0,8 (tradiční chovy
 * 1,3–1,45), prasnice jeden vrh 6 selat × 0,6 (nešlechtěná plemena 5–6 ve vrhu). Mláďata na kus
 * stáda (`LIVESTOCK.growth`) = `femaleShare` × `youngPerDam`; dřív bez rozlišení samic ovce a kozy
 * +40 %, prasata +100 %, krávy +20 % ročně.
 */
export const HERD_BREEDING = {
  femaleShare: { sheep: 0.7, goat: 0.7, pig: 0.4, cow: 0.5 },
  youngPerDam: { sheep: 0.92, goat: 1.12, pig: 3.6, cow: 0.8 },
} as const;
/**
 * diet.md – Porážka v zimě, Staré kusy (Martin 19. 10. 2026: „Tak většinou se v zimě porážejí
 * staré kusy a na jaře některá mláďata pokud je jich moc.“; čísla návrh Clauda podle rešerše
 * research/2026-10-19-breeding-culling.md): podíl dospělých kusů, který ročně doslouží a jde
 * 1. 11. na maso – letošní mláďata je nahradí. Ovce a kozy 1/8 (bahnice ≈ 6–8 let), krávy 1/10
 * (dojnice a tažný skot do ≈ 9–10 let), prasnice 1/4 (prasata se porážela do dvou let, chovné
 * prasnice pár vrhů).
 */
export const HERD_RETIREMENT = { sheep: 1 / 8, goat: 1 / 8, pig: 1 / 4, cow: 1 / 10 } as const;
export const EMERGENCY_SLAUGHTER = {
  order: ['pig', 'goat', 'cow', 'sheep'],
  reserveShare: 0.05,
  minGain: 0.02,
  pigForestShare: 0.5,
  pigletsFromMonth: 9,
} as const;
/**
 * oxen.md – Ohrady podle druhu (Martin 19. 10. 2026: „Zvířata je potřeba na noc zavírat do ohrad.
 * Každý druh zvířete by měl mít vlastní ohradu, ať se nemíchají. Velikost ohrady by mělo jít
 * určovat podobně, jako když se staví hřbitov. Velikost ohrady bude mít vliv na velikost stáda.
 * Zároveň velikost ohrady bude omezená – má to být ohrada, ne výběh.“; čísla návrh Clauda podle
 * rešerše research/2026-10-19-pens.md): ohrada má nejvýš `max` čtverců 15 × 15 m (≈ 900 m²).
 */
export const PEN_SQUARES = { max: 4 } as const;
/**
 * oxen.md – Kapacita ohrady (návrh Clauda, rešerše research/2026-10-19-pens.md): kolik kusů pojme
 * hotový čtverec ohrady na noc – plocha uvnitř plotu ≈ 196 m² (14 × 14 m) ÷ místo na kus: ovce
 * ≈ 1,5 m², koza ≈ 2 m², prase ≈ 2,5 m², kráva ≈ 4,5 m² (malá zvířata raného středověku – kráva
 * 200–250 kg; dnešní minima ustájení: ovce 1–1,5 m², koza 1,5–2 m², kráva bez telete 3,5–5 m²
 * i s krmištěm). Místa jsou pro dospělé kusy i jarní mláďata (stádo v létě). Ohrada volů
 * (`team` – oxen.md, Ohrada volů; Martin 20. 10. 2026: „Ano, udělej to jak říkáš“) pojme 6 volů na
 * čtverec i s telaty ve výcviku – vůl ≈ 400 kg, ≈ 6 m² s jeslemi a přístřeškem (rozhodnutí Clauda:
 * tažný vůl potřebuje víc místa než kráva a čtverec má i přístřešek, žlab a stoh).
 */
export const PEN_PLACES_PER_SQUARE = {
  sheep: 130,
  goat: 100,
  pig: 80,
  cow: 45,
  team: 6,
  horse: 4,
} as const;
/**
 * horses.md – Ohrada koní a Koně po kusech (návrh Clauda): kůň slouží 3–20 let, klisna se chová od 3 let,
 * na maso jde ≈ 100 kg; hříbě do roku nemá vlastní místo (saje u klisny). Péče, krmení a ceny
 * přibudou s úlohami 5–7.
 */
export const HORSES = {
  serviceFromYears: 3,
  serviceToYears: 20,
  breedFromYears: 3,
  breedToYears: 20,
  meatKg: 100,
  foalYears: 1,
} as const;
/**
 * oxen.md – Spřežení, Voli po kusech (návrh Clauda, Martin schválil): výcvik ≈ 2 roky, vůl slouží
 * ≈ 10 let, pak jde na maso; rádlo táhne pár (`teamSize`). Ves s ohradou volů drží aspoň `minCows`
 * krávy a na obměnu volů `cowsPerOx` krávy navíc na vola; telata na voly jen z přírůstku nad
 * chovnými kravami. Cíl krav podle volů (diet.md – Krávy na obměnu volů; Martin 20. 10. 2026:
 * „Dejme možnost 1.“ – podrobnosti návrh Clauda): voli jsou býčci – polovina telat, ≈ 0,2 býčka na
 * kus stáda skotu a rok (LIVESTOCK.growth.cow 0,4 × polovina); vůl slouží 10 let, takže obměna
 * desetiny volů ročně chce 0,1 ÷ 0,2 = 0,5 krávy na vola (dřív 0,25 – počítalo se se všemi telaty);
 * krávy na voly se ke kravám na mléko přičítají. Nejvýš `maxPairs` párů k rádlům (pojistka hledání
 * v plánu osevu).
 */
export const OXEN = {
  trainingYears: 2,
  serviceYears: 10,
  teamSize: 2,
  minCows: 3,
  cowsPerOx: 0.5,
  maxPairs: 8,
} as const;
/**
 * oxen.md – Potah (Martin 20. 10. 2026: „rádlo táhnou 2 voli, 4kolový vůz také dva voli
 * a dvoukolový vůz jeden vůl“): kolik volů táhne rádlo a vůz každého druhu.
 */
export const DRAFT_OXEN = { ard: 2, 'four-wheel': 2, 'two-wheel': 1 } as const satisfies Record<
  'ard' | CartKind,
  number
>;
/**
 * diet.md – Bez ohrady u domu (Martin 19. 10. 2026: „Ano, udělej to tak, jak navrhuješ“; čísla
 * návrh Clauda): bez ohrady svého druhu udrží každá domácnost u domu jen pár kusů – 2 ovce, 1 kozu
 * a 1 prase (místa pro dospělé i mláďata jako v ohradě); krávy jen v ohradě. Chovný pár druhu,
 * který ves má, zůstane u domů vždy (LIVESTOCK.breedingMin) – jinak by druh bez ohrady vymřel
 * a ohrada by už neměla co chovat.
 */
export const HOMESTEAD_HERD = { sheep: 2, goat: 1, pig: 1, cow: 0 } as const;
/**
 * oxen.md – Ohrady podle druhu, roční odklad (návrh Clauda 19. 10. 2026):
 * místa ohrad a u domů omezí stádo až u porážky aspoň `graceDays` dní po založení vsi, u vsi
 * uložené dřív po zavedení pravidla – hráč má rok na stavbu ohrad (nová ves založená na podzim by
 * ohradu před 1. 11. nestihla, Vlkov by přišel o stáda přes noc).
 */
export const PEN_GRACE = { graceDays: 365 } as const;
// oxen.md – Seno (Martin 19. 10. 2026: „Nezdá se mi, že bychom sklízeli tolik sena, že by to stáda
// uživilo“; čísla návrh Clauda podle rešerše research/2026-10-19-herds-hay-meat.md): seč kosou
// ≈ akr (0,4 ha) za den, krátkou kosou a srpem méně, obracení, sušení, hrabání do kup, svoz
// a stohování – celkem 10–15 člověkodní na hektar louky. Nejlepší mez s nástroji od kováře (kosy),
// nejhorší bez nich. Dřív 6 člověkodní (jen seč).
export const HAY_WORK_PER_HA: Bounds = { worst: 15, best: 10 };
