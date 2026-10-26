// Jídlo, pole, osev, plodiny, sad, sklizeň a zarůstání (část rozdělených pravidel, rozcestník je rules.ts).

import type { ObstacleKind } from '../landscape';
import type {
  Bounds,
  Crop,
  FallowStage,
  FieldSurface,
  FieldTask,
  OvergrowthStage,
  TaskName,
} from './types';
import { TREE_REGROWTH_YEARS } from './rules-buildings';

/** Úsek okna prací – od měsíce do měsíce včetně (1–12). */
export type WindowSegment = readonly [number, number];

// fields.md – Zásoby a nasycení (roční potřeba jídla podle věku)
export const FOOD_NEED_KG_PER_YEAR = { child: 100, adult: 180, elder: 140 } as const;
// fields.md – Zásoby a nasycení (ztráty při skladování – meze: s hrnčířem 5 %, start se zásobami)
export const STORAGE_LOSS_PER_YEAR: Bounds = { worst: 0.1, best: 0.05 };
export const START_STORES_MONTHS = 18;
// fields.md – Kolik ves oseje, Osev podle stravy (návrh Clauda, Martin schválil směr 19. 10. 2026):
// potřeba z pole = podíl energie, který ves za uplynulý hospodářský rok potřebovala z obilí
// a luštěnin, × dnešní roční potřeba; podíl nejméně minShare = 1 − strop masa (0,4) − strop
// mléka a sýra (0,3) z diet.md – ovoce, vejce a med se do pojistky nepočítají (hlídá test)
export const FIELD_FOOD = { minShare: 0.3 } as const;
// fields.md – Kolik ves oseje, Osev podle zásob (Martin 19. 10. 2026: „Ať se osev řídí také
// zásobami“ a „Ano“ ke zkrácení plánu uprostřed sezóny; čísla návrh Clauda): po příští sklizni má
// ves zásoby z pole na rok spotřeby a k tomu pojistku, která zbude před další sklizní – 0,5 roční
// potřeby celé energie (≈ půl roku celé stravy; se stády podle bílkovin – maso ≈ 11 %, mléko ≈ 10 %
// energie – rostoucí ves, které nestačí práce, ji vybere; kalibrace 20 × 20: hráč staví nasycení
// ≥ 0,95 v 97,1 % let, s 0,3 v 94,2 %); rozjetý plán zkrátí, když převyšuje cíl o víc než desetinu
// roční potřeby z pole (ať ho podzimní mléko a ovoce neubírají po kouscích).
// Plynulejší osev (Martin 19. 10. 2026: „Ano, plynulejší osev určitě.“; čísla návrh Clauda): ves
// seje podle dlouhodobého podílu jídla z pole (každý rok o třetinu rozdílu – balanceYears) na
// cílovou zásobu = pojistka + třetina roční potřeby z pole (cushionYears); odchylku od ní vyrovná
// po třetinách za rok (balanceYears), pod pojistkou doplní chybějící do pojistky hned
export const FIELD_STORES = {
  bufferEnergyYears: 0.5,
  balanceYears: 3,
  cushionYears: 1 / 3,
  trimMarginYears: 0.1,
} as const;
// fields.md – Osevní postup po dílech, Postup práce po dílech (návrh Clauda v duchu Martina
// 25. 10. 2026: „orají a sejí od začátku okna do konce okna všechno připravené, dokud stačí lidé
// a spřežení“): nutné díly přibývají k práci po dávkách na čele – rozdělaná práce otevřených oken
// (vrácení přílohu, kopání, orba, setí) nejvýš na tolik dní volné práce vsi (spřežení na tolik
// dní orby); další díl přibude, až čelo dávku dodělá
export const WORK_FRONT_DAYS = 3;
// fields.md – Kolik ves oseje (návrh Clauda)
export const PEAK_CAPACITY_SHARE = 1; // ve špičce smí jít na pole všechna práce po denním minimu (kalibrace z 0,8)
// fields.md – Úroda (hrubá úroda na hektar podle úrodnosti)
export const YIELD_BASE_KG_PER_HA = 760; // × (0,4 + 0,6 × úrodnost / 100)
// fields.md – Úroda (osivo na hektar)
export const SEED_KG_PER_HA = 175;
// fields.md – Úroda (neopletený díl), Zarůstání
export const UNWEEDED_YIELD = 0.6; // neopletý díl dá 60 % (návrh Clauda, kalibrace)
// fields.md – Přílohová soustava (osev, příloh), Úroda (úrodnost). Obnova v přílohu 5 %
// přirozené za rok (Martin 26. 10. 2026: varianta 1 – dvoupolí = přílohový systém, ladem 3–10 let;
// dřív 2,5 %): z 0,71 na 0,95 za 5 let. Nouzově (Nouzový
// osev) smí ves osít jen příloh aspoň na `emergencyMin` přirozené – Martin 19. 10. 2026: „ves
// neoseje díly pod 40 % úrodnosti“ (díl na nule by se na 70 % vracel 28 let).
// Osevní postup (fields.md – Osevní postup po dílech): díl dá dva osevy (ozim a jař) a jde do úhoru.
export const SOWN_ROUNDS = 2;
export const FERTILITY = {
  sowDepletion: 0.12,
  fallowRecovery: 0.05,
  sowableMin: 0.7,
  emergencyMin: 0.4,
  fallowReady: 0.95,
} as const;
// fields.md – Úroda (vymýcený les; oprava podle rešerše, bylo +20 na 3 roky): bonus úrodnosti
// podle sezóny osevu po vymýcení (1. +40, 2. +20, pak 0) a první sezónu se neplete. Bonus platí
// jen do `windowYears` let od vymýcení – díl, který ves do té doby neoseje, o popel přijde.
export const FOREST_BONUS = { bySeason: [40, 20], windowYears: 3 } as const;
// fields.md – Práce: sklizeň srpem a vázání 20 (s řemesly 15; rešerše 2026-10-17, dop. 3 – dřív
// 30) + odnos úrody v nůších 10 člověkodní na hektar (návrh Clauda, Martin schválil 24. 10. 2026 –
// dřív 20) – meze (simulace je počítá jako jednu úlohu sklizně, rozdělení práce pro scénu je
// dělí – postavy)
export const HARVEST_WORK_PER_HA: Record<'reap' | 'carry', Bounds> = {
  reap: { worst: 20, best: 15 },
  carry: { worst: 10, best: 10 },
};
// fields.md – Žně všemi rukama (Martin 24. 10. 2026; rešerše 2026-10-17 §5 – dítě 7–13 let 0,3,
// starší 0,5 člověkodne): výrostci od 10 let a starší dají ve žňové dny po 0,5 člověkodne na žeň
// a výmlat (vázání, odnos, paběrky)
export const HARVEST_HELPERS = { youthFromAge: 10, perDay: 0.5 } as const;
// fields.md – Pletí – děti (Martin 25. 10. 2026: „Pletí se často účastnily děti. To by mohlo
// uvolnit ruce dospělým.“; číslo návrh Clauda): výrostci 7–13 let, kteří zrovna nepasou, plejí
// v okně pletí po 0,5 člověkodne denně (pasáci mají přednost)
export const WEEDING_CHILDREN = { perDay: 0.5 } as const;
// fields.md – Pletí jednou a rychle – kdo pleje (návrh Clauda podle Martina 19. 10. 2026: „Domácí
// výrobu z většiny obstarají ženy“): ženy nesou 3/4 denního minima domácností – plejí jen prací nad
// svůj díl. Muži plejí, co by děti a ženy dnešním skutečným tempem × `paceShare` nestihly do konce
// okna bez posledních `spareDays` dní – rezerva na výpravy, vozy a seč, které ženám a mužům práci
// v dalších dnech vezmou (pletí se v okně dodělá).
export const WEEDING_WOMEN = { dailyMinShare: 0.75, paceShare: 0.8, spareDays: 5 } as const;
// fields.md – Pletí jednou a rychle (Martin 25. 10. 2026: „Ve středověku se plelo jednou, rychle
// a dělaly to hlavně ženy a děti … Jakmile obilí trochu vzešlo, tehdejší vysoké odrůdy pole
// zastínily a další plevel už nevzešel.“; sazba návrh Clauda podle Martina): jedno projití pole
// krátce po vzejití – obilí 8 / 5 člověkodní na hektar (dřív 30 / 15)
const GRAIN_WEEDING_PER_HA: Bounds = { worst: 8, best: 5 };
// fields.md – Pletí jednou a rychle: nejhorší mez starších sazeb pletí (jař 30, luštěniny a len 40
// čd/ha) – jen k převodu plánů starších vsí na nové sazby (`withOnceWeedingRates`)
export const LEGACY_WEEDING_WORST_PER_HA = { grain: 30, lowCrop: 40 } as const;
// fields.md – Pletí jednou a rychle: luštěniny a len zastíní pole méně – 10 / 6 (dřív 40 / 20)
const LOW_CROP_WEEDING_PER_HA: Bounds = { worst: 10, best: 6 };
// fields.md – Práce (člověkodny na osetý hektar – meze)
export const FIELD_WORK_PER_HA: Record<FieldTask, Bounds> = {
  dig: { worst: 100, best: 50 },
  sow: { worst: 10, best: 10 },
  weed: GRAIN_WEEDING_PER_HA,
  harvest: {
    worst: HARVEST_WORK_PER_HA.reap.worst + HARVEST_WORK_PER_HA.carry.worst,
    best: HARVEST_WORK_PER_HA.reap.best + HARVEST_WORK_PER_HA.carry.best,
  },
  thresh: { worst: 15, best: 10 },
};
// fields.md – Pletí jednou a rychle (Martin 25. 10. 2026: „Ozim se plít asi nemusí – v dubnu už je
// tak velký, že plevel udusí.“): ozim se neplete – sazby jako jař bez pletí, úrodu bez pletí
// nesráží (`unweededYield` se na ozim nepoužije)
export const WINTER_WORK_PER_HA: Record<FieldTask, Bounds> = {
  ...FIELD_WORK_PER_HA,
  weed: { worst: 0, best: 0 },
};
// fields.md – Založení pole (povrch dílu za hektar – meze)
export const FOUNDING_COST_PER_HA: Record<FieldSurface, Bounds> = {
  meadow: { worst: 100, best: 90 },
  shrub: { worst: 100, best: 60 },
  forest: { worst: 250, best: 150 },
};
// fields.md – Práce, Zarůstání (Martin, 18. 10. 2026: „Ano udělej to tak“ – nepasený a nesečený
// příloh zarůstá; čísla návrh Clauda podle rešerše 2026-10-18-overgrowth.md): vrácení přílohu do
// osevu podle stadia – mladý příloh bez práce navíc, louka drn louky, křoviny jako křoviny,
// mladý les jako les (meze)
export const RECLAIM_COST_PER_HA: Readonly<Record<FallowStage, Bounds>> = {
  'young-fallow': { worst: 0, best: 0 },
  meadow: FOUNDING_COST_PER_HA.meadow,
  shrubs: FOUNDING_COST_PER_HA.shrub,
  'young-forest': FOUNDING_COST_PER_HA.forest,
};
// fields.md – Založení pole (sazba povrchu za hektar v sobě má, co povrch tvoří: v lese stromy
// i se suchými, padlými a pařezy a podrost – „stromy v ceně“, v křovinách keře; po kusech se
// na takovém čtverci platí jen ostatní překážky – kameny, balvany, v křovinách i stromy)
export const SURFACE_INCLUDED_OBSTACLES: Record<FieldSurface, readonly ObstacleKind[]> = {
  meadow: [],
  shrub: ['shrub'],
  forest: ['tree', 'youngTree', 'snag', 'fallenTree', 'stump', 'shrub'],
};
// fields.md – Založení pole (překážky na díle, práce navíc)
export const OBSTACLE_COST = {
  stone: 1,
  boulder: 8,
  tree: 3,
  youngTree: 1,
  snag: 3,
  fallenTree: 2,
  stump: 2,
  shrub: 0.5,
} as const;
// fields.md – Práce (vzdálenost od obydlí, +1 % za každých 10 m nad 100 m)
// fields.md – Založení pole (nejdál 800 m od obydlí, nejmenší výměra 0,1 ha)
export const FIELD_LIMITS = { maxDistanceM: 800, minAreaM2: 1000 } as const;
// fields.md – Práce, tabulka Kdy, a Ozim a jař (okna prací v měsících včetně). WINDOWS = jař:
// vrací se z přílohu a kope se na podzim, co se nestihne, v březnu–dubnu (Martin 21. 10. 2026:
// „Ano udělej to tak.“ – návrh Clauda: i vrácení přílohu pod jař smí na jaře, ne jen kopání); seje se na jaře, sklízí v srpnu a mlátí
// hned po žni v září (production-chains.md – Výmlat hned po žni; Martin 20. 10. 2026: „Staří
// slované se snažili dělat výmlat hned. Klasy neskladovali.“). Výmlat, který okno nestihne,
// pokračuje dál, dokud je co mlátit (snopy čekají a kazí se – THRESHING). Pletí jaře v květnu –
// vzejde 3–4 týdny po setí (fields.md – Pletí jednou a rychle, Martin 25. 10. 2026).
export const WINDOWS: Record<TaskName, readonly WindowSegment[]> = {
  reclaim: [
    [9, 11],
    [3, 4],
  ],
  dig: [
    [9, 11],
    [3, 4],
  ],
  sow: [[3, 4]],
  weed: [[5, 5]],
  harvest: [[8, 8]],
  thresh: [[9, 9]],
};
// fields.md – Ozim a jař (návrh Clauda, Martin schválil směr 18. 10. 2026): ozim se vrací
// z přílohu, kope a seje v září–říjnu, neplete se (fields.md – Pletí jednou a rychle, Martin
// 25. 10. 2026: „v dubnu už je tak velký, že plevel udusí“), sklízí v červenci a mlátí hned po
// žni v srpnu (production-chains.md – Výmlat hned po žni)
export const WINTER_WINDOWS: Record<TaskName, readonly WindowSegment[]> = {
  reclaim: [[9, 10]],
  dig: [[9, 10]],
  sow: [[9, 10]],
  weed: [],
  harvest: [[7, 7]],
  thresh: [[8, 8]],
};
// fields.md – Luštěniny (rešerše 2026-10-18-legumes.md): luštěniny jsou jař – kopou se na podzim
// nebo na jaře, sejí v březnu–dubnu, pletou v květnu, sklízejí (trhají) v červenci a mlátí
// hned po sklizni v srpnu na humně jako obilí (production-chains.md – Humno, návrh Clauda)
export const LEGUME_WINDOWS: Record<TaskName, readonly WindowSegment[]> = {
  ...WINDOWS,
  harvest: [[7, 7]],
  thresh: [[8, 8]],
};
// fields.md – Len (rešerše 2026-10-19-flax.md): jarní len se seje v dubnu (okno jaře březen–duben),
// trhá se po ≈ 100 dnech koncem července – okna jako luštěniny; nemlátí se (semena se drhnou
// v domácí práci)
export const FLAX_WINDOWS: Record<TaskName, readonly WindowSegment[]> = LEGUME_WINDOWS;
/** Okna prací podle plodiny (fields.md – Ozim a jař, Luštěniny, Len). */
export const CROP_WINDOWS: Record<Crop, Record<TaskName, readonly WindowSegment[]>> = {
  winter: WINTER_WINDOWS,
  spring: WINDOWS,
  legume: LEGUME_WINDOWS,
  flax: FLAX_WINDOWS,
};
/**
 * Pořadí plodin při shodě konce okna – len první (je ho málo a bez něj chybí oděv – trhá se
 * v červenci se ozimem a luštěninami), pak ozim (sklízí se dřív), luštěniny před jaří.
 */
export const CROP_ORDER: readonly Crop[] = ['flax', 'winter', 'legume', 'spring'];
/**
 * diet.md a fields.md – Luštěniny (Martin 18. 10. 2026: bílkoviny 1,6 g/kg zůstávají, přidají se
 * luštěniny; čísla rešerše 2026-10-18-legumes.md, odhady návrh Clauda): hrách a čočka jako jedna
 * plodina – hrubá úroda jako 0,8 úrody obilí při stejné úrodnosti (≈ 600 kg/ha při plné), osivo
 * 150 kg/ha, 22 % bílkovin, energie jako obilí (3 400 kcal/kg); ztráta skladováním jako obilí
 * (STORAGE_LOSS_PER_YEAR – zrnokaz se ve skladu nemnoží); neopletý díl dá 50 % (obilí 60 %);
 * osev úrodnost neubere, ale vrátí 0,03 (`fertilityGain` – poutá dusík, ≈ rok přílohu); strop
 * podílu energie z luštěnin ve stravě 25 % (dospělý ≈ 45 kg ročně).
 */
export const LEGUMES = {
  yieldShare: 0.8,
  seedKgPerHa: 150,
  protein: 0.22,
  energy: 1,
  unweededYield: 0.5,
  fertilityGain: 0.03,
  energyCap: 0.25,
} as const;
// fields.md – Luštěniny (rešerše: hrách hůř snáší plevel a okopával se, žeň luštěnin stála ≈ 1,2×
// víc než žeň obilí, výmlat na objem 0,6–0,8× pšenice) – člověkodny na osetý hektar, meze
export const LEGUME_HARVEST_WORK_PER_HA: Record<'reap' | 'carry', Bounds> = {
  reap: { worst: 35, best: 20 },
  carry: { worst: 20, best: 20 },
};
export const LEGUME_WORK_PER_HA: Record<FieldTask, Bounds> = {
  dig: FIELD_WORK_PER_HA.dig,
  sow: FIELD_WORK_PER_HA.sow,
  weed: LOW_CROP_WEEDING_PER_HA,
  harvest: {
    worst: LEGUME_HARVEST_WORK_PER_HA.reap.worst + LEGUME_HARVEST_WORK_PER_HA.carry.worst,
    best: LEGUME_HARVEST_WORK_PER_HA.reap.best + LEGUME_HARVEST_WORK_PER_HA.carry.best,
  },
  thresh: { worst: 10, best: 6 },
};
/**
 * fields.md – Len a diet.md – Oděv (Martin 19. 10. 2026: „A to mi připomíná, že na částech pole
 * musí být zasetý len.“; čísla návrh Clauda podle rešerše 2026-10-19-flax.md): len na plátno –
 * spodní oděv (košile), šátky, ručníky, plachty. Potřeba třeného lnu (vlákno po lámání a třepení)
 * za rok – dospělý a starší 2 kg (≈ 3 m² hrubého plátna ≈ 1 kg látky), dítě 1 kg; výnos 550 kg
 * třeného lnu na hektar při plné úrodnosti (× 0,4 + 0,6 × úrodnost jako obilí – při úrodnosti 70
 * ≈ 450 kg, Skotsko 18. st. 440–550, Irsko 1892 429 kg/ha); osivo je lněné semeno z vlastní
 * úrody (sedmina dílu dozraje) – zásoby neubírá; neopletý díl dá 50 % (len snáší plevel špatně);
 * osev ubere úrodnost dílu 0,18 přirozené (obilí 0,12 – len vysiluje půdu); bez lnu na oděv ubere
 * štěstí až 4 podle chybějícího podílu (vlna až 6). Máčení, lámání, třepení, vochlování, předení
 * a tkaní jsou součástí domácí výroby (`DOMESTIC` – přerozdělení, ne práce navíc: ≈ 20 čd na
 * dospělého za rok, s vlnou ≈ 45 z ≈ 125 čd domácí výroby na dospělého).
 */
export const FLAX = {
  kgPerYear: { child: 1, adult: 2, elder: 2 },
  fiberKgPerHa: 550,
  unweededYield: 0.5,
  sowDepletion: 0.18,
  unhappiness: 4,
} as const;
// fields.md – Len (rešerše: len se vytrhává i s kořenem a váže do hrstí – pokus Ribe ≈ 68 čd/ha
// začátečníků, nástroje nepomohou; pletí jako luštěniny – v pokusu 4×; příprava půdy a setí jako
// jař; nemlátí se) – člověkodny na osetý hektar, meze
export const FLAX_WORK_PER_HA: Record<FieldTask, Bounds> = {
  dig: FIELD_WORK_PER_HA.dig,
  sow: FIELD_WORK_PER_HA.sow,
  weed: LOW_CROP_WEEDING_PER_HA,
  harvest: { worst: 55, best: 55 },
  thresh: { worst: 0, best: 0 },
};
// orchard.md – Pravidla (Martin – oprava podle rešerše 17. 10. 2026): výsadba 80 člověkodní/ha
// (+ překážky jako u pole), péče v zimě 10 člověkodní/ha ročně, sklizeň 8 člověkodní/ha při plné
// úrodě (při menší úrodě poměrně méně); první jablka 6. rok po výsadbě, úroda lineárně do plné
// úrody 25. rok, plná do 50. roku, pak lineárně k nule v 60. roce – tehdy se čtverec vrátí
// v louku; plná úroda ≈ 3 t jablek/ha ročně.
// orchard.md – Obnova sadu (Martin 18. 10. 2026 – vesničané obnovují sami, čísla návrh Clauda):
// čtverce od 50. roku sadu (`declineAfterYear` – poslední rok plné úrody) vysadí vesničané znovu,
// za rok sadu nejvýš desetina čtverců (`renewalShareYear`, nahoru, aspoň 1) – za 10 let do konce
// (50.–59. rok) se tak obnoví celý sad
// orchard.md – Jablka vozem (Martin 20. 10. 2026: „Ano, udělej to jak říkáš“ – návrh Clauda
// nových nákladů vozů, wagons.md – Co se vozí a na čem): ze sklizně je `harvestCarryShare` odnos
// jablek v koších ze sadu do vsi (3 t/ha ≈ 120 košů po 25 kg, při ≈ 150 m od domů ≈ 2 čd z 8) –
// ten převezme vůz tam, kam ke čtverci sadu dojede (jako odnos snopů)
export const ORCHARD = {
  plantingPerHa: 80,
  carePerHa: 10,
  harvestPerHa: 8,
  harvestCarryShare: 0.25,
  fullYieldKgPerHa: 3000,
  firstFruitYear: 6,
  fullYieldYear: 25,
  declineAfterYear: 50,
  endYear: 60,
  renewalShareYear: 0.1,
} as const;
// orchard.md – Úroda (jablka mají asi 1/7 výživy obilí na kg: 3 t jablek ≈ 430 kg obilí)
export const APPLE_FOOD_VALUE = 1 / 7;
// orchard.md – okna prací v měsících včetně: výsadba na jaře nebo na podzim jako kopání (návrh
// Clauda), péče (prořezávání) v zimě, sklizeň v září–říjnu. Sezóny péče a sklizně začínají
// prvním dnem prvního měsíce a končí prvním dnem po posledním měsíci (péče 1. 12. – 1. 3.).
export const ORCHARD_PLANTING_WINDOWS = WINDOWS.dig;
export const ORCHARD_WINDOWS: Record<'harvest' | 'care', readonly WindowSegment[]> = {
  harvest: [[9, 10]],
  care: [
    [12, 12],
    [1, 2],
  ],
};
// orchard.md – Jídlo (jablka se jí přednostně; co zbude k 1. 3., shnije – před jídlem dne)
export const APPLE_ROT_DAY = { month: 3, day: 1 } as const;
// orchard.md – Rok sadu (návrh Clauda): hospodářský rok sadu začíná na jaře 1. 3. – jarní
// výsadba je 1. rokem sadu hned, podzimní (od září) až od příštího jara
export const ORCHARD_SEASON = { startMonth: 3, autumnPlantingFromMonth: 9 } as const;

// fields.md – Kolik ves oseje (k 1. září), Práce a Včasnost (sklizeň jaře do konce srpna, ozimu
// do konce července, výmlat jaře v září). Musí souhlasit s okny: sklizeň je poslední den okna
// harvest své plodiny, plán den po sklizni jaře, konec výmlatu den po konci okna thresh jaře
// (hlídá rules.test.ts) – tehdy se zahodí loňský plán u výmlatu (`threshingSeason`); snopy, které
// výmlat nestihl, zůstávají (Sheaves – mlátí se dál).
export const HARVEST_DAY = { month: 8, day: 31 } as const;
export const WINTER_HARVEST_DAY = { month: 7, day: 31 } as const;
export const PLANNING_DAY = { month: 9, day: 1 } as const;
export const THRESH_END_DAY = { month: 10, day: 1 } as const;
/**
 * production-chains.md – Humno, Výmlat hned po žni, Starší vsi (Martin 20. 10. 2026: „Humno je
 * podmínka“, „Rok odkladu“; čísla návrh Clauda podle rešerše 2026-10-20-production-chains.md –
 * Výmlat na humně): na humně 8 × 10 m mlátí naráz ≈ 4 páry mlatců s cepy a 4 pomocníci (snopy
 * na humno, obracení slámy, odvívání lopatou proti větru) – `floorManDaysPerDay` 12 člověkodní
 * výmlatu za den; v srpnu a září (61 dní) tak humno vymlátí ≈ 730 čd – 50–75 ha osevu podle
 * nástrojů (`FIELD_WORK_PER_HA.thresh` 15–10 čd/ha), tedy humno na ≈ 60 ha; humna se sčítají.
 * Martin 21. 10. 2026: „Ať mlátí aspoň nouzově“ – ves bez hotového humna mlátí vždy nouzově na
 * udusané zemi u domů bez omezení místa, ale o `emergencyWork` víc práce a o `emergencyLoss` zrna
 * méně (zrno se ztratí v zemi, nečistoty); humno je výhoda, ne podmínka. Rok odkladu starších vsí
 * (`graceDays`, `threshingGraceUntil`) zůstává v datech: s humnem, které nestačí, mlátí zbytek
 * nouzově jen v něm. Snopy, které čekají a nemlátí se (výmlat okno nestihl), se kazí
 * `spoilPerMonth` za měsíc (myši, ptáci, vlhko – klasy se neskladovaly) i s prací výmlatu.
 */
export const THRESHING = {
  floorManDaysPerDay: 12,
  graceDays: 365,
  emergencyWork: 0.3,
  emergencyLoss: 0.1,
  spoilPerMonth: 0.1,
} as const;
/**
 * production-chains.md – Obilné jámy (Martin 20. 10. 2026: „na příhodném místě obilné jámy po
 * sklizni vykopou, naplní obilím a utěsní/zamaskují … Jámy lze používat opakovaně.“; čísla návrh
 * Clauda podle rešerše 2026-10-20-production-chains.md – Obilné jámy): jáma na `capacityKg` zrna
 * (≈ 1,6 m³ – Butser 1,2 m³ = 1,12 t ječmene, Danebury průměrně 2,18 m³). Vykopat novou jámu stojí
 * `digManDays` (Reynolds 1974: standardní jáma 25 člověkohodin zkušeného kopáče), vyčistit
 * a vypálit jámu, nanosit do ní zrno z humna a zapečetit ji hlínou `fillManDays` (i stará jáma).
 * V zapečetěné jámě se ztrácí jen slupka vyklíčeného zrna u stěn – `sealedLossPerYear` (Reynolds:
 * 3 % u hruškovité jámy za uložení); otevřená jáma a zrno mimo jámy ztrácí jako dosud
 * (STORAGE_LOSS_PER_YEAR). Jámy se plní od `fillFrom` do `fillTo` (měsíce – po výmlatu, než
 * zamrzne zem): plné dávky průběžně, zbytek aspoň `minFillKg` až po výmlatu (v posledním měsíci
 * vždy); prázdná jáma `lifeYears` let od vykopání se zasype a kope se nová. Místo do `siteM` od
 * humna (bez humna od dvorce), jámy aspoň `spacingM` od sebe, hledá se po kružnicích po `stepM`.
 */
export const GRAIN_PITS = {
  capacityKg: 1500,
  digManDays: 2.5,
  fillManDays: 1,
  sealedLossPerYear: 0.03,
  fillFrom: 8,
  fillTo: 11,
  minFillKg: 300,
  lifeYears: 10,
  siteM: 60,
  spacingM: 3,
  stepM: 2.5,
} as const;

// fields.md – Příloh a pastva: mladý příloh 1–2 roky ladem (plevel a tráva – vrácení bez drnu)
export const YOUNG_FALLOW_YEARS = 2;
// fields.md – Zarůstání (Martin, 18. 10. 2026: „Ano udělej to tak“ – nepasený a nesečený příloh
// zarůstá, les z pole vypadne; čísla návrh Clauda podle rešerše 2026-10-18-overgrowth.md –
// Jelinčić a kol. 2023: travinné stadium 2–5 let, keře 5–15, osika 15–30, les přes 30; Prach
// 2023: trnka kolem 15. roku, zapojené dřeviny po ≈ 20 letech): roky bez pastvy a seče → stadium
// dílu přílohu. Od 30 let je na dílu les a z pole vypadne (les vsi – `VillageState.woods`).
export const OVERGROWTH_STAGES: readonly {
  readonly fromYears: number;
  readonly stage: OvergrowthStage;
}[] = [
  { fromYears: 0, stage: 'meadow' },
  { fromYears: 5, stage: 'shrubs' },
  { fromYears: 15, stage: 'young-forest' },
  { fromYears: 30, stage: 'forest' },
];
// fields.md – Zarůstání (návrh Clauda): roky bez pastvy a seče se počítají jednou za rok
// 1. 11. (po pastevní sezóně a seči, před porážkou) a jen dílům, které ležely ladem celé
// vegetační období od 1. 4.; díl se spásl, když na něj z potřeby pastvy stád připadla aspoň
// polovina jeho plochy (`fallowGrazing`)
export const OVERGROWTH = {
  yearDay: { month: 11, day: 1 },
  seasonStart: { month: 4, day: 1 },
  grazedMinShare: 0.5,
} as const;
// fields.md – Les vsi (návrh Clauda; forest.md – Les ustupuje): dospělé stromy na lese vsi
// přibývají od 15 let (osika a bříza mladého lesa) do plné hustoty v 70 letech (jako pokácený
// strom – TREE_REGROWTH_YEARS); plná hustota 240 stromů na hektar jako les krajiny (≈ 5,5
// dospělého stromu na políčko vrstvy překážek)
export const VILLAGE_WOOD = {
  matureFromYears: 15,
  fullYears: TREE_REGROWTH_YEARS,
  treesPerHa: 240,
} as const;
