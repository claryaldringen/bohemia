# Jabloňový sad

Stav: schváleno 17. 10. 2026 (Martin: „Do staveb ještě přidej jabloňový sad. Bude se stavět
stejně, jako pole.“ – čísla návrh Clauda, Martin: „Ano, udělej to tak“), týž den opraveno podle
rešerše (Martin – plná úroda až od 25. roku, sklizeň 8 člověkodní/ha). Anachronismus (sady až
od 9. století) se záměrně neřeší (Martin). Implementováno 18. 10. 2026: jádro
`packages/game/src/domain/village/orchard.ts`, umístění `orchardPartsFromCells`, jídlo
`eatMeal` (`food.ts`), scéna `apps/web/lib/scene/orchard-renderer.ts` a `orchard-layout.ts`,
Sad [B] v mřížce staveb.

## Proč

Druhý zdroj jídla vedle polí. Sad stojí málo práce, ale roky roste, než začne plodit – hráč se
rozhoduje, kolik louky a práce dá do jistoty na dlouho dopředu místo obilí hned.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč staví sad po čtvercích stejně jako pole (Martin).
- **Cíl:** sad je doplněk obživy, ne náhrada polí – jablka nevydrží přes zimu.
- **Ne-cíl (teď):** jiné ovoce, štěpování a odrůdy, mošt a sušení, náhoda úrody (až s počasím –
  jako u polí).

## Pravidla

- **Stavba** (Martin): po čtvercích jako pole – políčka krajiny 15 × 15 m, jen louka, do 800 m od
  obydlí, čtverce souvislé, nesmí ležet na obydlí, poli, hřbitově ani jiném sadu (a naopak pole,
  hřbitov ani obydlí nesmí na sad). Ovládání stejné jako u pole. Nejmenší výměru sad nemá – i jeden
  čtverec je sad (návrh Clauda).
- **Výsadba:** **80 člověkodní/ha** + překážky jako u pole (tabulka ve
  [fields.md](fields.md); skalní výchoz se neodstraní a plocha pod ním se nepočítá) ze společné
  práce vsi; sází se jen na jaře (březen–duben) nebo na podzim (září–listopad) – okna jako kopání
  (návrh Clauda). Mimo okna stavba sadu společnou práci nebere a čeká; čtverce se sázejí od
  nejbližšího k obydlím. Polní práce mají přednost (pořadí práce ve [fields.md](fields.md)) –
  mladá ves, která má na podzim všechnu práci v poli, vysadí sad až na jaře. Překážky z čtverce
  zmizí, jakmile se na něm začne pracovat (nejdřív se vyklidí – sazenice nestojí mezi kameny
  a keři); dospělé stromy, které nevyhradila stavba obydlí, přitom dají klády na hromadu jako
  u dílu pole ([les a dřevo](forest.md)). Stromy čtverců, které se ještě nezačaly sázet, patří
  sadu – stavba obydlí je pro dřevo nekácí. Panel sadu ukáže, že výsadba čeká na jaro nebo
  podzim.
- **Rok sadu** (návrh Clauda): hospodářský rok sadu začíná 1. 3. – jarní výsadba je 1. rokem
  sadu hned, podzimní (od září) až od příštího jara.
- **Růst a úroda** (Martin – oprava podle rešerše): první jablka **6. rok** po výsadbě, úroda
  roste lineárně do **plné úrody ve 25. roce** (6. rok 1/20, 15. rok 1/2), plná do **50. roku**,
  pak lineárně klesá k nule v **60. roce** (51. rok 9/10, 59. rok 1/10) – 1. 3. 60. roku se sad
  vrátí v louku. Starý sad hráč nahradí novou výsadbou.
- **Úroda** (návrh Clauda): plná úroda **≈ 3 t jablek/ha** ročně, jako jídlo **≈ 430 kg
  obilí/ha** (jablka mají asi 1/7 výživy obilí na kg). Úrodnost půdy se nepoužívá a sad ji
  nevyčerpává; nepotřebuje úhor ani osev.
- **Práce** (Martin – oprava podle rešerše) – sezónní práce v rozdělení práce vsi vedle polních
  prací (dražší se vzdáleností od obydlí jako polní práce):
  - **péče** (prořezávání) v zimě (prosinec–únor) **10 člověkodní/ha** ročně o všechny vysazené
    stromy; jde až po výmlatu. Nedodělaná péče zatím nic nezhorší – je to jen práce.
  - **sklizeň** v září–říjnu **8 člověkodní/ha** při plné úrodě, při menší úrodě poměrně méně
    (návrh Clauda); jde před podzimním kopáním (okno končí dřív). Jablka přibývají do zásob
    postupně, jak se sklízí; co se do konce října nestihne, spadne a shnije (úroda × podíl
    sklizené práce).
- **Jídlo:** sklizená jablka jdou do zásob vsi zvlášť a **jí se přednostně** před obilím; co
  zbude k **1. 3.** (ráno), shnije. Přídělový systém (fields.md) počítá jen s jablky, která se
  stihnou sníst do konce února: když jídlo do sklizně nevystačí, dělí se rovně – a když jablek
  je víc, než se při rovném přídělu stihne sníst, jí se do zkažení jen jablka (nejvýš dosyta)
  a obilí zůstane na dobu po nich (návrh Clauda). Hlad (upozornění a kronika) začíná, jakmile
  příděl podle výhledu do sklizně klesne pod plný – i když se zatím jí dosyta jablky a obilí
  nevystačí až po 1. 3. Jablka nemají ztráty ze skladování. Plánování osevu a rezerva obilí se
  jablky nemění.
- **Hájení** a hlad fungují beze změny ([populace](population.md)).

## Co hráč vidí

- V panelu staveb ikona sadu (název + cena za hektar v tooltipu), stavba po čtvercích.
- Ve scéně jabloně z 0 A.D. (CC BY-SA 3.0) sponem do pětky – 2 stromy na čtverec, ≈ 10,6 m od
  sebe, skalní výchozy obejdou: během výsadby čára vytyčení, kůly a sazenice, mladé stromky
  u kůlu rostou do plné velikosti za 12 let (návrh Clauda); plodící sad má od srpna do sklizně
  na stromech jablka.
- U vybraného sadu: plocha, stáří a odhad úrody nejbližší sklizně (kg jablek), během výsadby
  průběh – a když čeká na okno, ikona s popiskem „Sází se na jaře a na podzim“. Horní lišta ukáže jablka vedle obilí, jen když nějaká jsou. Minimapa kreslí sady.
- Kronika: sad je vysazený, sklizeň jablek (kg), starý sad dosloužil.

## Naměřeno

`measure-village.ts 200 60` (18. 10. 2026) – třetí strategie: hráč staví jako dřív a hned po
dostavění první zemnice vysadí sad 0,5 ha (22 čtverců) 120 m od obydlí. Čísla se neladila.

- první jablka medián 6 let po založení sadu (6. rok), od 26. roku sklizeň medián 1 485 kg
  (plná úroda 0,5 ha), 10. percentil 655 kg – v mladé vsi se sad vysadí až v dalším okně
  a v letech s nedostatkem práce se část jablek nesklidí,
- nasycení ≥ 0,95 celý rok v 96,1 % let (bez sadu 93,9 %), na konci 60 let medián 6 domácností
  a 31 lidí (bez sadu 6 a 30), vymření žádné,
- vsi bez sadu měří stejně jako před zavedením sadů (sady stav vsi bez sadu nemění).

## Rozhodnutí

| Rozhodnutí                                                                                   | Kdo                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Jabloňový sad jako stavba, staví se po čtvercích jako pole                                   | Martin                                     |
| Výsadba 80 čd/ha, péče 10 čd/ha/rok, ~~sklizeň 25 čd/ha~~ (září–říjen) – opraveno níže       | návrh Clauda, Martin potvrdil              |
| Plody od 6. roku, ~~plná úroda od 10. roku~~, život ≈ 60 let – opraveno níže                 | návrh Clauda, Martin potvrdil              |
| ≈ 3 t jablek/ha = ≈ 430 kg obilí; jí se přednostně, zbytek k 1. 3. shnije; bez úhoru a osevu | návrh Clauda, Martin potvrdil              |
| Plná úroda až od 25. roku, do 50. roku, k nule v 60. roce, pak louka                         | Martin – oprava podle rešerše 17. 10. 2026 |
| Sklizeň 8 čd/ha (místo 25); výsadba 80, péče 10 v zimě, sklizeň září–říjen                   | Martin – oprava podle rešerše 17. 10. 2026 |
| Anachronismus (sady až od 9. století) se neřeší                                              | Martin                                     |
| Rok sadu od 1. 3.; sklizeň poměrně k úrodě; bez nejmenší výměry; spon 2 stromy na čtverec    | návrh Clauda                               |
| Jablka do konce února v přídělu; při přebytku jen jablka, obilí na potom                     | návrh Clauda                               |
