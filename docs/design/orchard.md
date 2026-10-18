# Jabloňový sad

Stav: schváleno 17. 10. 2026 (Martin: „Do staveb ještě přidej jabloňový sad. Bude se stavět
stejně, jako pole.“ – čísla návrh Clauda, Martin: „Ano, udělej to tak“), týž den opraveno podle
[rešerše](research/2026-10-17-remesla-drevo-sad.md) (Martin – plná úroda až od 25. roku, sklizeň
8 člověkodní/ha). Anachronismus (sady až od 9. století) se záměrně neřeší (Martin).
Implementováno 18. 10. 2026: jádro `packages/game/src/domain/village/orchard.ts`, umístění
`orchardPartsFromCells`, jídlo `eatMeal` (`food.ts`), scéna
`apps/web/lib/scene/orchard-renderer.ts` a `orchard-layout.ts`, Sad [B] v mřížce staveb. Týž den
přibyla [obnova sadu](#obnova-sadu) – vesničané staré čtverce sázejí znovu sami (Martin).

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
  pak lineárně klesá k nule v **60. roce** (51. rok 9/10, 59. rok 1/10) – 1. 3. 60. roku se
  čtverec vrátí v louku, pokud ho vesničané předtím neobnovili ([Obnova sadu](#obnova-sadu)).
  Dřív plná úroda od 10. roku: vysokokmenné sady dosahují plné úrody až po ≈ 20–30 letech
  a kalkulace počítají s výnosem do 50. roku (LfL Bayern; Lípa a Jongepierová 2020).
- **Úroda** (návrh Clauda): plná úroda **≈ 3 t jablek/ha** ročně, jako jídlo **≈ 430 kg
  obilí/ha** (jablka mají asi 1/7 výživy obilí na kg). Úrodnost půdy se nepoužívá a sad ji
  nevyčerpává; nepotřebuje úhor ani osev.
- **Práce** (Martin – oprava podle rešerše) – sezónní práce v rozdělení práce vsi vedle polních
  prací (dražší se vzdáleností od obydlí jako polní práce):
  - **péče** (prořezávání) v zimě (prosinec–únor) **10 člověkodní/ha** ročně o všechny vysazené
    stromy; jde až po výmlatu. Nedodělaná péče zatím nic nezhorší – je to jen práce.
  - **sklizeň** v září–říjnu **8 člověkodní/ha** při plné úrodě, při menší úrodě poměrně méně
    (návrh Clauda; dřív 25: setřesení a ruční sběr ≈ 1 člověkoden na 300–500 kg – Degenbeck
    2020); jde před podzimními pracemi v poli – před ozimem (při stejném konci okna jablka
    první, ozim dostane zbytek podzimu, se kterým plán osevu počítá) i před kopáním jaře (okno
    končí dřív). Jablka přibývají do zásob postupně, jak se sklízí; co se do konce října
    nestihne, spadne a shnije (úroda × podíl sklizené práce).
- **Jídlo:** od 18. 10. 2026 podle [stravy](diet.md) – jablka jsou v rozhraní **ovoce**, jí se
  přednostně rovným dílem do zkažení, ale pokryjí nejvýš čtvrtinu energie (samo ovoce nenasytí)
  a přidají štěstí +5. Původní pravidlo: sklizená jablka jdou do zásob vsi zvlášť a **jí se
  přednostně** před obilím; co zbude k **1. 3.** (ráno), shnije – s nádobami od hrnčíře později,
  s plným pokrytím až 1. 5. ([řemesla](crafts.md) – den zkažení se posouvá poměrně k pokrytí
  nádobami). Přídělový systém (fields.md) počítá jen s jablky, která se
  stihnou sníst do konce února: když jídlo do sklizně nevystačí, dělí se rovně – a když jablek
  je víc, než se při rovném přídělu stihne sníst, jí se do zkažení jen jablka (nejvýš dosyta)
  a obilí zůstane na dobu po nich (návrh Clauda). Hlad (upozornění a kronika) začíná, jakmile
  příděl podle výhledu do sklizně klesne pod plný – i když se zatím jí dosyta jablky a obilí
  nevystačí až po 1. 3. Jablka nemají ztráty ze skladování. Plánování osevu a rezerva obilí se
  jablky nemění.
- **Hájení** a hlad fungují beze změny ([populace](population.md)).
- **Doba (neřeší se):** kulturní jabloně jsou v Čechách a na Moravě doložené hlavně od 9.–10.
  století na centrálních místech (Látková 2017). Martin: co předbíhá dobu, zatím neřešit –
  letopočet začátku hry se může posunout.

## Obnova sadu

Stav: schváleno 18. 10. 2026 (Martin: „ať si vesničané obnovují sad sami“ – stejně jako sami
přestavují dožilé domy; čísla a podrobnosti návrh Clauda, Martin schválil směr). Dřív nejstarší
sad v 60. roce naráz zmizel – bez upozornění a nikdo ho neobnovil.

- **Kdo rozhoduje** (Martin): obnova je rozhodnutí obyvatel jako přestavba obydlí
  ([populace](population.md) – Chátrání a přestavba) – nečeká na hráče ani na suroviny.
- **Které čtverce** (návrh Clauda): čtverec od **50. roku sadu** – posledního roku plné úrody,
  od 51. roku úroda klesá. Do 60. roku, kdy by čtverec zarostl loukou, tak na obnovu zbývá
  10 hospodářských let (50.–59. rok).
- **Postupně, ať úroda nespadne na nulu** (návrh Clauda): za rok sadu (od 1. 3.) zařadí vesničané
  do obnovy nejvýš **desetinu čtverců** sadu (zaokrouhleno nahoru, aspoň 1), **nejstarší první**
  (při shodě v pořadí čtverců). Za 10 let se tak obnoví celý sad – vedle mladých stromků plodí
  staré. Rozhodují v oknech výsadby (první den jarního okna, 1. 3., je i prvním dnem roku sadu);
  další čtverce do obnovy zařadí až po dosázení předchozích.
- **Práce:** obnova je stavba sadu ze společné práce vsi jako výsadba – **80 člověkodní/ha** za
  plochu čtverce (překážky na něm už nejsou), jen v oknech výsadby (březen–duben, září–listopad),
  čtverce od nejbližšího k obydlím; polní práce mají přednost. Staré stromy čtverce se skácí
  s první prací na něm (do té doby plodí), na podzim až po sklizni jablek – úroda sklizně se
  počítá i z nich. Vysazený čtverec má nový den výsadby: mladé stromky, plody znovu od 6. roku.
  Dřevo starých jabloní se nepočítá.
- **Bez práce:** čtverec, na který obnova do 60. roku nedojde, 1. 3. zaroste loukou jako dřív;
  sad bez čtverců zanikne (kronika a upozornění „Starý sad dosloužil“).
- **Staré sady** (i uložené před zavedením obnovy) se do obnovy zařadí samy v nejbližším okně
  výsadby – uložený stav se nemění, platí jen pravidlo nad ním.

## Co hráč vidí

- V panelu staveb ikona sadu (název + cena za hektar v tooltipu), stavba po čtvercích.
- Ve scéně jabloně z 0 A.D. (CC BY-SA 3.0) **v pravidelných řadách** (Martin, 18. 10. 2026:
  „Stromy v sadu by měly být zasazené v pravidelných řadách.“): mřížka po 7,5 m podél os krajiny,
  4 stromy na čtverec, řady rovně pokračují přes celý sad; na skalním výchozu strom chybí (řada
  se neodsouvá). Během výsadby čáry vytyčení po obrysu a podél řad, kůly a sazenice po řadách,
  mladé stromky u kůlu rostou do plné velikosti za 12 let (návrh Clauda); plodící sad má od
  srpna do sklizně na stromech jablka. Úroda se počítá na hektar, na počtu stromů nezávisí.
  Velikost stromů a jablka jsou po čtvercích – při obnově se vytyčí jen obnovovaný čtverec, po
  skácení starých stromů na něm přibývají kůly a sazenice jako při výsadbě a mladé stromky
  rostou vedle starých stromů zbytku sadu.
- U vybraného sadu: plocha, stáří (průměr čtverců vážený plochou – obnovou sad mládne) a odhad
  úrody nejbližší sklizně (kg jablek), během výsadby i obnovy průběh – a když čeká na okno, ikona
  s popiskem „Sází se na jaře a na podzim“. Horní lišta ukáže jablka vedle obilí, jen když nějaká jsou. Minimapa kreslí sady.
- Kronika: sad je vysazený, sklizeň jablek (kg), vesničané obnovují starý sad (kolik čtverců
  vysadí znovu), starý sad dosloužil. Krátký mizející řádek nahoře: „Vesničané obnovují starý
  sad“ (jednou za rok sadu, když zařadí čtverce do obnovy) a „Starý sad dosloužil“.

## Naměřeno

`measure-village.ts 200 60` (18. 10. 2026) – třetí strategie: hráč staví jako dřív a hned po
dostavění první zemnice vysadí sad 0,5 ha (22 čtverců) 120 m od obydlí. Čísla se neladila.

- první jablka medián 6 let po založení sadu (6. rok), od 26. roku sklizeň medián 1 485 kg
  (plná úroda 0,5 ha), 10. percentil 655 kg – v mladé vsi se sad vysadí až v dalším okně
  a v letech s nedostatkem práce se část jablek nesklidí,
- nasycení ≥ 0,95 celý rok v 96,1 % let (bez sadu 93,9 %), na konci 60 let medián 6 domácností
  a 31 lidí (bez sadu 6 a 30), vymření žádné,
- vsi bez sadu měří stejně jako před zavedením sadů (sady stav vsi bez sadu nemění).

Obnova sadu (18. 10. 2026) se zatím neměřila – v 60letém běhu se týká jen posledních let.

## Rozhodnutí

| Rozhodnutí                                                                                    | Kdo                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Jabloňový sad jako stavba, staví se po čtvercích jako pole                                    | Martin                                     |
| Výsadba 80 čd/ha, péče 10 čd/ha/rok, ~~sklizeň 25 čd/ha~~ (září–říjen) – opraveno níže        | návrh Clauda, Martin potvrdil              |
| Plody od 6. roku, ~~plná úroda od 10. roku~~, život ≈ 60 let – opraveno níže                  | návrh Clauda, Martin potvrdil              |
| ≈ 3 t jablek/ha = ≈ 430 kg obilí; jí se přednostně, zbytek k 1. 3. shnije; bez úhoru a osevu  | návrh Clauda, Martin potvrdil              |
| Plná úroda až od 25. roku, do 50. roku, k nule v 60. roce, pak louka                          | Martin – oprava podle rešerše 17. 10. 2026 |
| Sklizeň 8 čd/ha (místo 25); výsadba 80, péče 10 v zimě, sklizeň září–říjen                    | Martin – oprava podle rešerše 17. 10. 2026 |
| Anachronismus (sady až od 9. století) se neřeší                                               | Martin                                     |
| Rok sadu od 1. 3.; sklizeň poměrně k úrodě; bez nejmenší výměry; ~~spon 2 stromy na čtverec~~ | návrh Clauda                               |
| Stromy v pravidelných řadách – mřížka 7,5 m, 4 stromy na čtverec, řady přes celý sad          | Martin, 18. 10. 2026                       |
| Jablka do konce února v přídělu; při přebytku jen jablka, obilí na potom                      | návrh Clauda                               |
| Vesničané obnovují starý sad sami, po čtvercích – jako přestavbu obydlí                       | Martin, 18. 10. 2026                       |
| Obnova od 50. roku, za rok sadu nejvýš desetina čtverců (nahoru, aspoň 1), nejstarší první    | návrh Clauda, Martin schválil směr         |
| Obnova = výsadba (80 čd/ha, jaro a podzim); staré stromy se kácejí s prací, po sklizni        | návrh Clauda, Martin schválil směr         |
| Upozornění „Vesničané obnovují starý sad“ a „Starý sad dosloužil“                             | Martin, 18. 10. 2026                       |
