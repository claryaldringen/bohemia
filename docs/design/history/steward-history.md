# Správce vsi – historie (neplatné sekce)

Sem patří části [steward.md](../steward.md), které přestaly platit; zachované doslova, aby šlo dohledat, proč se od nich ustoupilo. **Nic z tohoto textu neplatí** – platný stav je v steward.md.

## Cíl polí podle potřeby z pole

Neplatí od 18. 11. 2026 (Martin na otázku „Má správce stavět tolik polí, kolik jich ves zvládne obdělat, bez ohledu na to, co jí?“: „Ano. Přebytky mohou jít na vazalské dávky, do zásob atd. Cílem vesnice je prostě produkovat maximum všeho.“; steward.md – Cíl „Růst se zásobou“, Cíl polí). S masem a ovocem bez stropů (diet.md – Strava po vrstvách a porážka celý rok) klesl podíl jídla z pole a správce stavěl méně polí. Dřívější výpočet zůstal jen jako opatrný cíl vsi bez pole v oběhu, a to s celou potřebou z pole (podíl 1). Dřív v Cíli „Růst se zásobou“:

- **Cíl polí:** pole v oběhu mají uživit lidi, kteří ve vsi budou za `STEWARD.fieldLeadYears`
  (≈ 2 roky – výhled `expectedYearlyFoodNeed`), × `STEWARD.fieldReserve` (≈ 1,1) ÷ očekávaná
  úroda let s počasím (`sowingYieldFactor` ≈ 0,95 – ves s ní seje taky), a navíc lidé, jejichž
  úroda by za `FIELD_STORES.balanceYears` (3 roky) doplnila chybějící pojistku zásob. „Pole
  uživí“ (`steadyHarvestKg`) pojistku jen **udržuje** – ves, která ji nemá, by si ji z polí
  v ustáleném oběhu nikdy nenaplnila. Rezerva dá vesničanům díly nad potřebu na kruté roky –
  osejí je sami (fields.md – Osevní postup po dílech). **Nejvýš** ale tolik, kolik ves oseje
  podle práce a osiva (model kapacity níž) × `STEWARD.fieldReserve`, a doplnění pojistky jen,
  když ves brzdí půda.

Dřív v Modelu kapacity vsi:

- **Cíl polí** nejvýš lidé, které uživí osev podle práce a osiva, × `fieldReserve` – pole, která
  ves neoseje, jen zarůstají a vracení přílohu bere práci oknům setí. Doplnění pojistky polí jen
  při úzkém hrdle půda (při hrdle práce nebo osiva víc polí pojistku nedoplní – dřív spirála
  „nízká pojistka → víc polí“).

Dřív v Den správce – upřesnění:

- **Cíl polí:** lidé × (výhled potřeby za `fieldLeadYears` = 2 roky ÷ dnešní potřeba) ×
  `fieldReserve` (1,1) ÷ `sowingYieldFactor` + (pojistka − zásoby, které k příští sklizni zbudou)
  ÷ `FIELD_STORES.balanceYears` ÷ úroda na člověka z „Pole uživí“ – proti „Pole uživí podle dnešní
  půdy“; zakládané díly se počítají jako v oběhu (jinak by správce zakládal, dokud se první pole
  nedostaví).

Dřív v tabulce Rozhodnutí: „Hodnota a cena v člověkodnech za rok; cíl polí na lidi za 2 roky × 1,1“
(návrh Clauda) a „Model kapacity vsi: cíl polí nejvýš podle práce v oknech setí, „je kam“
a přelidnění podle trvalého hrdla“ (návrh Clauda – Martin 1. 11. 2026: „Vylepši ho“).

## Cíl polí bez práce rodu

Neplatí od 21. 11. 2026 (D103 – Martin 19. 11. 2026 na otázku „Má správce zakládat pole i na práci
rodu? Dnes plánuje pole jen na to, co ves zvládne bez rodu, a rod pak pomáhá jen na polích, která
už ves má.“: „Ano, maximálně zůstanou neobdělaná“; steward.md – Model kapacity vsi, Pole i na
práci rodu). Dřív v Modelu kapacity vsi:

- **podle žní** (`harvestHa`, návrh Clauda 19. 11. 2026 – D99 kolo 2) – práce oken žní (červenec
  a srpen, se žňovými rukama – `sowingCapacity`) ÷ žeň a odnos na osetý hektar obilí (z plánu, bez
  něj podle sazeb × příplatek za vzdálenost). Žeň jde v práci dne před lnem, senem i otavou
  (`DAY_WORK_ORDER`), nic se od ní neodečítá; dosklizeň jaře v září je jednorázová;
- **podle výmlatu** (`threshHa`, návrh Clauda 19. 11. 2026) – výmlat má vlastní okno do února za
  polními pracemi (Martin 9. 11. 2026: „Výmlat prý počká i docela hluboko do zimy“): volná práce
  dne (jako v okně setí) × světlé dny zimního okna výmlatu (listopad–únor) ÷ výmlat na osetý
  hektar (bez humna dražší); co ves vymlátí v září a říjnu vedle setí, se nepočítá (opatrně).

**Co ves obdělá** (`workableHa`, jen pro cíl polí – D99 kola 1 a 2): nejmenší z osevu podle lidí
v oknech setí, podle spřežení, podle žní a podle výmlatu. Proti „podle práce“ dvě opravy, které
ukázalo srovnání se simulací (Vlkov výhled 158–179 ha, skutečně oseto 6–17 ha; zlatá ves
32–39 ha proti 11–12): okno vracení a kopání (září–listopad **i** březen–duben) už nese jaro –
dřív se k němu jaro přičítalo ještě jednou (+ ≈ 40 % práce lidí i spřežení); orba stojí i lidi
(oráč a honáček – stejně člověkodnů jako dní spřežení; simulace je účtuje, výhled ne – práce na
hektar 6 proti skutečným 19–27 čd). Na den výhled se simulací sedí (plán 4,4–5,6 čd/den,
skutečně 5,7–6,0). Zlatá ves: osev lidmi ≈ 39 ha, spřežením ≈ 23 ha, žní 16,5–17,3 ha – váže žeň,
cíl je nad 12 ha, které ves osela a sklidila (test `village-golden-long.test.ts`).

Lidé v oknech setí, žní i výmlatu byli jen lidé vsi – cvičící rodina vojvody (mimo práci vsi) se
nepočítala, rodina pak pomáhala jen na polích, která ves už měla.

## Ohrady jen pod místy na člověka (návrh Clauda, neplatí od 22. 11. 2026)

Krok 7 správce stavěl ohradu druhu, jen když bylo stádo plné (≥ 2 kusy a ≥ místa v ohradách
a u domů) **a** místa ohrad druhu byla pod `STEWARD.penPlacesPerPerson` × lidé (skot 0,25,
prasata 0,25, ovce 0,5, kozy 0,25 míst na člověka). Zrušeno: Martin 22. 11. 2026 na otázku „Mají se i tato tři místa přepnout na maximum, které ves
zvládne?“ (jedno z míst: ohrady jen do míst na člověka) odpověděl „ano“ – opora Martin 18. 11. 2026:
„Cílem vesnice je prostě produkovat maximum všeho.“ Platí [steward.md – Ostatní stavby, Ohrady](../steward.md).

## Sad a jabloně u cest podle 5 % energie (neplatí od 22. 11. 2026)

Neplatí od 22. 11. 2026 (Martin: „ano“ na otázku „Mají se i tato tři místa přepnout na maximum, které ves zvládne?“; „Nezapomeň na jabloně podél cést - ideální je pokrývat spotřebu jimi a pak až sadem“; steward.md – Ostatní stavby – upřesnění, Jabloně u cest a sad). Ves s ovocem nad 5 % energie (Vlkov 6–10 %) nesázela nic a staré jabloně u cest dožívaly (rozbor D106). Dřív v Rozhodovacím pořadí v den správce:

8. **Sad, jabloně u cest** – ovoce ve stravě pod plnou potřebou; jabloně podél pevné cesty, která
   vede kolem polí (zeleň chrání díly – disasters.md, Ochrana dílu). V oknech výsadby (orchard.md).

Dřív v Ostatních stavbách – upřesnění:

- **Sad a jabloně u cest:** potřeba jablek = plná potřeba energie × `DIET.fruitShare` ÷
  `APPLE_FOOD_VALUE`; chybí-li ji plocha sadů a jabloní (plná úroda), napřed čtverec sadu, pak
  jabloně podél pevné cesty do `roadFieldM` (40 m) od dílu pole. Jen v oknech výsadby. V Obnově
  jen první zdroj ovoce (ves bez sadu i jabloní), další čtverce až v Růstu – s pěti sady z Obnovy
  v letech 3–5 hladověla zdravá ves na seedu krajiny 2 v letech 14–18 (až 12 dní), s jedním ne
  (měření 31. 10. 2026).

## Cíl ovoce – celá potřeba po mase, mléce a vejcích (D115, neplatí od 22. 11. 2026 – kolo 1)

Platilo 22. 11. 2026 (D115, před Martinovým „Ano“ na otázku „Mají jablka nahrazovat obilí jen tak,
aby lidé nepřišli o bílkoviny?“). Znění z orchard.md – Jídlo:

- **Cíl ovoce** (Martin 22. 11. 2026 – „ano“ na přepnutí sadu a jabloní u cest na maximum, které
  ves zvládne; tvar návrh Clauda): jablka, která ves sní od sklizně (1. 9.) do zkažení (1. 3.,
  s nádobami do 1. 5.) v pořadí jídla – napřed maso, mléko a sýr a vejce, pak ovoce rovným dílem
  do zkažení, až po něm luštěniny a obilí (diet.md – Pořadí jídla). Počítá se z potřeby energie
  lidí vsi za rok bez energie, kterou za rok dají stáda (mléko dojných samic, maso mláďat nad
  chovné stádo) a slepice, rozložené rovným dílem na dny roku – na dny od sklizně do zkažení.
- Výsadba sadu i jabloní u cest brala jen společnou práci vsi po všech polních pracích (orchard.md
  – Výsadba: „ze společné práce vsi … Polní práce mají přednost“) – Vlkov v oknech výsadby za
  10 let nevysadil nic (volná práce 0 čd za den, D115).

Ve Vlkově byl cíl 6,9–9,9 t jablek (≈ 88 % energie od září do února); kontrola D115 ukázala, že
s pokrytým cílem jablka vytlačí obilí i s bílkovinami (pokrytí bílkovin v zimě 0,68 → 0,17).

## Cíl ovoce z roční potřeby lidí 1. 9. (D115 kolo 1, neplatí od 22. 11. 2026 – kolo 2)

Platilo 22. 11. 2026 (D115 kolo 1). Cíl ovoce byl 5 % roční potřeby energie lidí vsi 1. 9.
(všichni lidé vsi podle věku 1. 9.) rovným dílem na dny od 1. 9. do zkažení a sklizeň se zkrátila
jen 1. 9. Jídlo dne ale jí 5 % potřeby dne (lidé doma, věk toho dne) a jablka, dokud nejsou
nasbíraná, sníst nemůže – Vlkov sklízel někdy až v říjnu a za rok shnilo 23–102 kg nasbíraných
jablek (3–15 % sklizně).

## Obilí v nouzi (výprava za obilím)

Neplatí od 23. 11. 2026 (konec smyšlených sousedů – [markets.md](../markets.md), Pravidla 1, schválené Martinem 22. 11. 2026; jeho slova doslova v [neighbours.md](../neighbours.md) – Martinova rozhodnutí, Než syn odejde, ves neobchoduje). Dřív v steward.md:

- **Kdy hrozí hlad:** z výhledu zásob do žní, ze kterého správce počítá režim a pojistku
  (`fieldStoresOutlook` – osivo, které ves z hromady okna nebo zimního osiva ještě zaseje, se nejí;
  [pole](fields.md) – Výhled zásob k sklizni): potřeba z pole do příští sklizně
  i se ztrátami skladováním bez zásob, které ves smí sníst (obilí, snopy, luštěniny), chybí aspoň
  o `STEWARD.grainMinKg` (25 kg – náklad jednoho nosiče, `TRADE.porterKg`).
- **Komu:** sousedovi, který obilí nabízí (obilnáři), s hotovou zemskou stezkou a bez výpravy na
  cestě; z nich tomu, kdo přinese nejvíc obilí (při shodě méně práce, pak pořadí směrů).
- **Kolik:** jen co chybí, nejvýš co soused letos ještě má; za přeplatek posledního kusu platby
  vezme obilí navíc (jako nákup osiva – [pole](fields.md), Osivo pro ves bez zásob). Výprava nese
  nejvýš `STEWARD.grainPorterShare` (polovinu) dospělých vsi jako nosiče – jinak správce nákup
  úměrně zmenší; ostatní drží práci vsi. Ves, která neunese ani kládu (2 dospělí → 1 nosič, kláda
  potřebuje 2), nic nekoupí.
- **Čím platí:** `STEWARD.grainPayment` v pořadí hřivny → keramika → uhlí → klády – zboží, které
  ves nejí a bez kterého hospodaří (jako nákup osiva: jídlem ani dobytkem neplatí), napřed
  s nejvyšší hodnotou na kg nákladu, ať je výprava nejmenší; jen co soused shání a co letos ještě
  vezme. Obilnáři shánějí vždy klády, takže ves s kládami platí skoro vždy. Nemá-li čím, nekoupí.
  **Klády staveb neprodá** (návrh Clauda, 8. 11. 2026 – „správce v nouzi“, princip schválil
  Martin): z hromady platí jen klády nad rezervu rozestavěných staveb vsi = dřevo, které stavby
  ještě vezmou (stromy, které pro ně ještě nikdo neskácel; klády z hromady si stavba bere už při
  zahájení).
- **Nejvýš jedna výprava naráz** – správce nevyšle výpravu, dokud je jakákoli výprava za obchodem
  na cestě (i hráčova; zásilky dávek pánovi se nepočítají).
