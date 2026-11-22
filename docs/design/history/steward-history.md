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
