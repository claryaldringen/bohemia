# Řemesla, dřevo, sad a hřbitov – ověření herních čísel proti literatuře

_Zpráva popisuje čísla před opravou. Co se z ní převzalo do herního designu, zapisují tabulky
rozhodnutí dotčených dokumentů („Martin – oprava podle rešerše 17. 10. 2026“)._

Rešerše k 17. 10. 2026. Ověřovaná čísla pocházejí
z `docs/design/crafts.md`, `forest.md`, `orchard.md` a `cemetery.md`.

**Verdikty:** _sedí_ = literatura hodnotu podporuje nebo je v rozmezí; _upravit na …_ = literatura
ukazuje jinam; _nedohledáno_ = přímý údaj jsem nenašel (případně jen nepřímá opora).
**Vlastní výpočet** je vždy označen; jde o přepočet z citovaných čísel, ne o údaj ze zdroje.
U zdrojů, ze kterých jsem viděl jen výtah ve vyhledávání (ne plný text ani abstrakt), je to
výslovně uvedeno.

## Průřezový problém: co je „strom“

Hra používá „strom“ jako jednotku pro stavby, uhlí i keramiku. Čísla ale implicitně předpokládají
**různě velké stromy**:

- **120 kg uhlí ze stromu** při výtěžnosti 4–8 kg dřeva na 1 kg uhlí (FAO 1987; Jack 2025 podle
  Oaks 2018) znamená ≈ 480–960 kg vzduchosuchého dřeva, tedy ≈ 0,7–1,5 m³ – velký dospělý strom
  (vlastní výpočet, hustota ≈ 650 kg/m³ je běžná hodnota pro dub a buk, nepodložená zdrojem).
- **35 stromů na polozemnici** sedí jen se **štíhlými stromy** (≈ 0,3–0,4 m³, 1–2 klády z kmene):
  srub 4 × 4 m s ≈ 9 vrstvami kmenů o průměru ≈ 20 cm je ≈ 36 klád po 4–4,5 m ≈ 5 m³, krov
  ≈ 2–3 m³, s odpadem ≈ 10–13 m³ kmenoviny (vlastní výpočet). S „velkými“ stromy z uhlí by na
  polozemnici stačilo ≈ 12–18 stromů.

Doporučení je níž v seznamu oprav (bod 2).

---

## 1. Dřevo a les

| Číslo                | Naše hodnota                                                                                                      | Literatura (hodnota / rozmezí)                                                                                                                                                                                                                                                                                                     | Zdroj                                                                                                                                | Verdikt                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Dřevo na zemnici     | ≈ 12 stromů                                                                                                       | Přímý údaj nenalezen. Zemnice = jáma se střechou na sloupech, bez srubu; vlastní odhad 4–6 sloupů, vaznice a ≈ 16–20 tenkých krokví ≈ 3–5 m³. Experiment Březno (Pleinerová 1986) měřil spotřebu materiálu, text ale nebyl dostupný.                                                                                               | Pleinerová 1986, PA 77 (jen citace v Archeologickém atlasu a v REA 5/2004, s. 6–8)                                                   | nedohledáno – řádově sedí, pokud „strom“ = tenký kmen                                                            |
| Dřevo na polozemnici | ≈ 35 stromů                                                                                                       | Přímý údaj nenalezen. Vlastní výpočet viz výše: ≈ 10–13 m³ kmenoviny → 30–40 štíhlých, nebo 12–18 velkých stromů. Pozor na konstrukci: v Polsku převažují v 6.–9. st. polozemnice s pletenými a kůlovými stěnami, srub (zrąb) se objevuje až v 9. st. (Západní Pomořansko) a jinde ve 2. pol. 10. st.                              | Chudziak 1987, Sprawozdania Archeologiczne 39, s. 343–344                                                                            | sedí jen při „štíhlém“ stromu – sjednotit s uhlím (oprava 2)                                                     |
| Kácení + dovoz       | 2 čd na strom                                                                                                     | FAO (jámové pálení, Guyana): kácení, krácení, dovoz a skládání dřeva 14 čd na vsázku 27–28 t těžkého dřeva, tj. ≈ 2 t na čd (moderní nářadí, přiblížení 100–150 m). 2 čd na strom 0,3–1 t je 4–10× pomalejší – odpovídá sekeře a ruční dopravě.                                                                                    | FAO 1987, Simple technologies for charcoal making, kap. 5.2                                                                          | sedí (spíš štědré)                                                                                               |
| Vzdálenost           | +1 % za 10 m nad 100 m                                                                                            | Nenalezeno. Nepřímo: etnografie sběru paliva – nosná dávka 24 kg, přes 2 h na jednu cestu.                                                                                                                                                                                                                                         | Woodfuel in Ciskei 1990 (jen výtah abstraktu ve vyhledávání)                                                                         | nedohledáno – herní abstrakce                                                                                    |
| Obnova lesa          | ≈ 30 let                                                                                                          | Pařeziny: výmladky se těžily ve věku ≈ 7–40 let; pařezení doloženo od neolitu, ve střední Evropě nejméně od středověku. 30 let = tyčovina / výmladkový les, ne dospělý kmen na srub nebo do milíře (ten vlastní odhad 60–100 let).                                                                                                 | Kadavý – Kneifl 2016, Živa (cit. Müllerová a kol. 2014; Hédl – Szabó 2010)                                                           | sedí pro výmladky a tyčovinu; pro „dospělý strom“ upravit na 60–80 let (oprava 6)                                |
| Hniloba klád         | ≈ 10 %/rok                                                                                                        | Bukové kmeny v pralesních rezervacích: polovina kmenů se úplně rozloží za 24–35 let, malé a střední vydrží až ≈ 38–48 let; kmeny ležící na zemi se rozloží o 9–15 let dřív než nadzvednuté. Smrk: konstanta rozkladu 0,018–0,022/rok (≈ 2 %/rok). Ztráta hmoty ≈ 2–5 %/rok; použitelnost na stavbu ale klesá rychleji (běl, hmyz). | FEM 381 (2016) 177–187 (abstrakt přes Starfos; autoři neuvedeni – asi tým VÚKOZ, neověřeno); Petrillo a kol. 2016, Biogeosciences 13 | upravit na ≈ 3–5 %/rok, nebo 10 % ponechat jako záměrnou herní páku proti hromadění a tak to v dokumentu označit |
| Palivo (klestí)      | ≈ 1/3 domácí výroby; u 6členné domácnosti ≈ 146 čd/rok (vlastní výpočet z fields.md: 0,3 + 6 × 0,15 = 1,2 čd/den) | Ciskei: ≈ 1,14 t dřeva na osobu za rok, dávky 24 kg, přes 2 h na cestu, přes 5 cest týdně. Malawi: 1,9 t na domácnost a rok (jen vaření), sběr ≈ 9,7 h týdně ≈ 50 dní po 10 h ročně. Se zimním vytápěním ve střední Evropě odhadem 2× víc → ≈ 100–150 čd/rok (vlastní výpočet).                                                    | Woodfuel in Ciskei 1990 (jen výtah abstraktu); Jagger – Jumbe 2016, Energy Policy 92, tab. 2                                         | sedí (horní mez)                                                                                                 |

## 2. Pálení uhlí (milíř)

| Číslo                        | Naše hodnota           | Literatura (hodnota / rozmezí)                                                                                                                                                                                                                                                    | Zdroj                                                                               | Verdikt                                                                         |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Výkon uhlíře                 | 10 kg uhlí / čd        | Mosambik, profesionální zemní milíře: skupiny 4–8 mužů, cyklus 9–22 dní vč. přípravy dřeva (motorová / rámová pila), vsázka ≈ 11 t dřeva, výtěžnost 16 % ≈ 1,76 t uhlí → ≈ 10–50 kg/čd (vlastní výpočet). Guyana, velké jámy: ≈ 6 t uhlí za ≈ 31 čd ≈ 190 kg/čd (moderní nářadí). | FAO (bez data), Review … fuelwood and/or charcoal in Mozambique; FAO 1987, kap. 5.2 | sedí (konzervativní; s železnou sekerou lze 15–20 kg/čd)                        |
| Uhlí ze stromu               | ≈ 120 kg               | Poměr dřevo : uhlí hmotnostně 4 : 1 (dobrá praxe) až 6 : 1 (běžně); Mosambik 12–16 %; 1 prm dřeva ≈ 120 kg uhlí (Casamance); experimentální milíř Trocnov (2019): výtěžnost 50–60 % **objemu**. 120 kg tak vyžaduje ≈ 0,7–1,5 m³ dřeva = velký dospělý strom (vlastní výpočet).   | FAO 1987, kap. 6; FAO Mozambique; Kmošek (text), poster Trocnov 2019                | sedí pro velký strom, nesedí s 35 stromy na polozemnici (oprava 2)              |
| Poměr dřevo : uhlí           | (implicitně ≈ 4–8 : 1) | ≈ 8 kg dřeva na 1 kg uhlí (Oaks 2018, cit. Jack 2025); jámy pod 10 % až přes 25 % hmotnosti (FAO-linked).                                                                                                                                                                         | Jack 2025, Historical Metallurgy 55(2); Practical Action (jen výtah ve vyhledávání) | sedí                                                                            |
| Délka a práce jednoho pálení | (hra nemodeluje)       | Trocnov: 9 m³ suchého dubu, od stavby po rozebrání 7 dní (stavba 1 den, pálení 6 dní, rozebrání). Vesnický milíř Ø ≈ 4 m: pálení „pár dní“, chladnutí 2–3 dny; švédský milíř 24 dní.                                                                                              | Kmošek, poster Trocnov 2019; FAO 1987, kap. 6                                       | pro představu – milíř se pálí ≈ týden, jeden uhlíř zvládne desítky pálení ročně |

## 3. Železo (bahenní ruda, kusová pec)

| Číslo                     | Naše hodnota                             | Literatura (hodnota / rozmezí)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Zdroj                                                                                                                   | Verdikt                                                                                      |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Uhlí na 1 kg nástrojů     | 30 kg                                    | Crew (bahenní ruda, nízká šachtová pec, celý cyklus): tavba 7,6 kg rudy + 28 kg uhlí → houba 1,7 kg; uhlí : houba 13–15 : 1; celkem 61 kg uhlí na 0,45 kg tyče → **≈ 100 kg uhlí na 1 kg tyčového železa**. Salter (cit. Crew): ≈ 60 kg na 1 kg výrobků. Cleere (římská pec s odpichem strusky): uhlí : železo 12 : 1 vč. dokování. Pleiner 2000, s. 126 (cit. Jack): experimentální tavby 10–18 kg uhlí na 1 kg železa (jen tavba). Velkomoravská pec (replika Olomučany): vsázka ruda : uhlí 1 : 1 hmotnostně + předehřev. | Crew 1991, HM 25, s. 33–35 (tab. 3–4); Jack 2025 (cit. Pleiner 2000); Souchopová – Merta – Barák 2003, s. 94            | upravit na ≈ 50 kg (rozmezí 40–100; 30 je spodní hranice jen pro velmi dobrou pec)           |
| Práce na 1 kg nástrojů    | 4 čd (sběr rudy, pražení, tavba, kování) | Crew: **≈ 25 čd na 1 kg** hotové tyče; cyklus tavba + kování (≈ 0,5 kg tyče) ≈ 8 čd pro tým 3 lidí + ≈ 5 čd na rudu a dřevo/uhlí. Trocnov (pec 11. st.): tavba ≈ 12 h vč. předehřevu, výsledek 3–4 kg surového železa – větší raně středověké pece snižují práci na kg. Velkomoravská replika: až 8,8 kg houby z jedné tavby.                                                                                                                                                                                                | Crew 1991, s. 35; Kmošek, poster Trocnov; Souchopová a kol. 2003, s. 91–92                                              | upravit na ≈ 10 čd (rozmezí 6–15, bez práce uhlíře)                                          |
| Výtěžnost ruda → houba    | (hra ji nemodeluje)                      | Crew 22 % hmotnosti rudy (40 % železa v rudě); Brno – nejlepší tavba 44 % (8,8 kg z 20 kg), římská pec 13 %; místní limonity z hutí byly pro chudobu železa nepoužitelné; bez pražení rudy se žádná tavba nepovedla. Vikingské muzeum: ≈ 20 kg bahenní rudy → 3–4 kg železa. Amatérské experimenty (Wareham) 10–27 %.                                                                                                                                                                                                        | Crew 1991, tab. 3; Souchopová a kol. 2003, s. 91–93; Vikingeskibsmuseet (web); Wareham Forge (jen výtah ve vyhledávání) | pro představu: ≈ 4–10 kg rudy na 1 kg hotových nástrojů                                      |
| Ztráty při kování         | (v 4 čd / 30 kg)                         | Crew: houba → tyč ztráta ≈ 70 % hmotnosti, výsledný výrobek ≈ 8 % železa obsaženého v rudě; Brno: polovina houby (700 g) → nůž 88 g po 3 h práce dvou kovářů (damaskové paketování, nestandardní).                                                                                                                                                                                                                                                                                                                           | Crew 1991, s. 33–34; Souchopová a kol. 2003, s. 92                                                                      | podporuje opravu výše (kování je drahé)                                                      |
| Nástroje na pracujícího   | 3 kg                                     | Přímý údaj (hmotnosti radlic, seker, srpů raného středověku) nenalezen. Nepřímo: středověký sedlák v Upplandu ztratil opotřebením jen při orbě rádlem „drygt 1 kilo“ železa ročně na běžnou usedlost. Hra: 3 kg × 30 % = 0,9 kg na pracujícího ročně, tj. ≈ 2,7 kg na usedlost se 3 pracujícími (vlastní výpočet) – s ostatními nástroji řádově sedí.                                                                                                                                                                        | Karlsson 2015, Förlorat järn (SLU), podle Forskning.se 7. 5. 2015                                                       | řádově sedí; pro 6.–8. st. (dřevěná rádla, málo železa) spíš 1,5–2 kg                        |
| Opotřebení                | 30 %/rok                                 | Nenalezeno přímo (viz Karlsson výše).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | –                                                                                                                       | nedohledáno                                                                                  |
| Přínos železných nástrojů | +30 % ke všem pracem                     | Kvantitativně nenalezeno. Kovové sekery kácí výrazně rychleji než kamenné, bronz zhruba jako ocel (kvalitativně). Slované v 6. st. ale železo už měli – srovnání „dřevo/kámen vs. železo“ není historické.                                                                                                                                                                                                                                                                                                                   | Mathieu 2000, Expedition 42(2)                                                                                          | nedohledáno – jako herní abstrakce v pořádku, vykládat jako „dostatek vs. nedostatek železa“ |

## 4. Keramika

| Číslo            | Naše hodnota                                              | Literatura (hodnota / rozmezí)                                                                                                                                                                                                                                                                                                                                                                                           | Zdroj                                                                                           | Verdikt                                                                                                 |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Kdo a jak vyrábí | hrnčíř v dílně s pecí, „točí“                             | Keramika pražského typu: z volné ruky bez kruhu, vypálená na polním ohništi; hrnčířský kruh přichází ve střední a mladší době hradištní (pol. 10.–11. st.), kdy se hrnčířství stává specializovaným řemeslem. Raně středověké hrnčířské pece ale existují (rekonstrukce „raně středověké hrnčířské pece“ v archeoskanzenu Březno, sídliště 6.–9. st.; katalog pecí 6.–13. st. u Varadzina 2010 – jen katalogový záznam). | Válka 2014, Homo faber, s. 120 n.; Archeologický atlas – Březno; Varadzin 2010, AR 62, s. 17–71 | upravit popis: v 6.–9. st. spíš domácí výroba a výpal na ohništi, dílna s pecí a kruhem spíš od 10. st. |
| Práce            | 1 kg keramiky / čd                                        | Přímý údaj nenalezen (experimenty z Panské Lhoty a Všestar čas na nádobu neuvádějí).                                                                                                                                                                                                                                                                                                                                     | –                                                                                               | nedohledáno (spíš konzervativní)                                                                        |
| Palivo na výpal  | 1 strom na 400 kg                                         | Tradiční dřevem topené pece: průměrně 0,82 kg dřeva na 1 kg vypálené hlíny (19 pecí, Ghana); tenkostěnné nádoby ≈ 1,2 kg dřeva na 1 kg (Indie). Výpal na otevřeném ohništi spotřebuje spíš víc (bez čísla). 1 strom = 400 kg keramiky tedy odpovídá stromu ≈ 330–500 kg dřeva (vlastní výpočet).                                                                                                                         | Adubah 2025, J. of African Arts & Culture 8(4), s. 63; Down To Earth, 29. 4. 1996               | sedí (při stromu ≈ 0,5–0,8 m³)                                                                          |
| Nádoby na osobu  | 5 kg                                                      | Nenalezeno přímo. Etnoarcheologie: životnost nádoby souvisí hlavně s velikostí (větší vydrží déle); vlastnictví nádob klesá s ústupem dlouhého vaření.                                                                                                                                                                                                                                                                   | Shott 1996, American Antiquity 61(3) (abstrakt); Beck 2009, Ethnoarchaeology 1(1) (abstrakt)    | nedohledáno – věrohodné                                                                                 |
| Rozbití          | 40 %/rok (průměrná životnost ≈ 2,5 roku)                  | Konkrétní roky životnosti jsem v dostupných abstraktech nenašel.                                                                                                                                                                                                                                                                                                                                                         | Shott 1996; Beck 2009                                                                           | nedohledáno – věrohodné                                                                                 |
| Účinek           | −15 % spotřeby obilí (méně ztrát při skladování a vaření) | Přímá opora nenalezena. Obilí se ve středověku skladovalo hlavně v zásobních jamách a sýpkách, ne v keramice: zapečetěné jámy uchovaly klíčivé zrno přes rok; neutěsněné jámy měly jen o málo vyšší ztráty.                                                                                                                                                                                                              | Reynolds 1974, PPS (abstrakt); Marshall (jen výtah recenze EXARC ve vyhledávání)                | nedohledáno – mechanismus historicky slabý; snížit na −5 až −10 % nebo vázat na vaření (kaše)           |

## 5. Jabloňový sad

| Číslo                               | Naše hodnota                   | Literatura (hodnota / rozmezí)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Zdroj                                                                           | Verdikt                                                                                                                                    |
| ----------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Měli raní Slované (6.–9. st.) sady? | sad lze stavět od začátku      | Semena kulturní jabloně (_Malus domestica_) jsou v Mikulčicích a Kopčanech (9. st., Velká Morava), v ČR od doby laténské (Lovosice), v raném středověku početnější; ve fázi RS3 (přibližně 9.–10. st.) jen nezuhelnatělá semena z Prahy. Kulturní ovoce bylo v té době „luxusní“ a typické pro centrální lokality, doplněk stravy, ne základ; jabloň i hrušeň nabývají významu až později. Domácí planá jabloň (_Malus sylvestris_) je autochtonní; vesnická krajina se sady vznikla před 2–3 stoletími, výsadby podporovala barokní nařízení (1740, 1752). | Látková 2017, SBM XI, s. 16, 59–61, 133; Lípa – Jongepierová 2020, Živa, s. 272 | upravit: v 6.–8. st. jen sběr z planých jabloní; sad zpřístupnit až od 9.–10. st. (centrální místa, později kláštery a kolonizace 13. st.) |
| Výsadba                             | 80 čd/ha                       | Přímý údaj pro ruční výsadbu nenalezen. Moderní Streuobst: 80 (50–100) stromů/ha, tj. ≈ 1 čd na strom vč. jámy a ochrany proti okusu (vlastní odhad).                                                                                                                                                                                                                                                                                                                                                                                                       | LfL Bayern (Kalkulationshilfe Streuobst); Degenbeck 2020                        | nedohledáno – věrohodné                                                                                                                    |
| První plody                         | 6. rok                         | Raně plodící, méně bujné odrůdy po ≈ 5–6 letech, bujné po 7–8 letech; roky 6–10 průměrně 20 kg (10–30) na strom.                                                                                                                                                                                                                                                                                                                                                                                                                                            | LfL Bayern, kap. 3.1, tab. 3                                                    | sedí                                                                                                                                       |
| Plná úroda                          | od 10. roku                    | Streuobst dosahuje plné úrody po ≈ 30 letech; roky 11–20 jen 60 kg (40–80) na strom, roky 21–50 210 kg (150–250). Ovocný strom „plnohodnotně slouží“ zhruba od 20. roku.                                                                                                                                                                                                                                                                                                                                                                                    | LfL Bayern, kap. 3.1; Lípa – Jongepierová 2020                                  | upravit na ≈ 20. rok (lineárně od 6. roku)                                                                                                 |
| Život sadu                          | ≈ 60 let                       | Všechny druhy se mohou dožít 80–100 let, jabloně a hrušně i přes 200 let; kalkulace LfL počítá s fází výnosu do 50. roku.                                                                                                                                                                                                                                                                                                                                                                                                                                   | Lípa – Jongepierová 2020; LfL Bayern                                            | sedí (jako produktivní život)                                                                                                              |
| Výnos                               | ≈ 3 t/ha při plné úrodě        | Moderní Streuobst (80 stromů/ha, vlastní výpočet z tab. 3): roky 6–10 ≈ 1,6 t/ha, 11–20 ≈ 4,8 t/ha, 21–50 ≈ 17 t/ha; průměr prvních 50 let ≈ 11 t/ha. Raně středověké jabloně byly neošlechtěné a menší – nižší výnos je obhajitelný.                                                                                                                                                                                                                                                                                                                       | LfL Bayern, tab. 3                                                              | sedí jako konzervativní (lze 4–6 t/ha)                                                                                                     |
| Výživa                              | 1/7 obilí na kg                | Syrová jablka ≈ 52–61 kcal/100 g, pšenice ≈ 340 kcal/100 g → ≈ 1/6 (vlastní výpočet).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | USDA FoodData Central (přes zrcadlo getfoodfacts.com – ověřit v FDC)            | sedí (případně 1/6)                                                                                                                        |
| Péče (řez)                          | 10 čd/ha/rok                   | Řez ≈ 35 h na strom za 50 let ≈ 0,7 h/rok; × 80 stromů ≈ 56 h ≈ 6 čd/ha (vlastní výpočet).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Degenbeck 2020, LWG aktuell, s. 3                                               | sedí                                                                                                                                       |
| Sklizeň                             | 25 čd/ha                       | Setřesení ≈ 20 min/strom + ruční sběr 150–200 kg/h, tj. 0,5–2 h na strom; 1 ha s 80 stromy ≈ 200 h práce ročně, z toho přes 50 % sklizeň (při moderních výnosech ≈ 10+ t). Pro 3 t ≈ 15–30 h ≈ 2–3 čd (vlastní výpočet).                                                                                                                                                                                                                                                                                                                                    | Degenbeck 2020, s. 3                                                            | upravit na ≈ 1 čd na 300–500 kg (≈ 6–10 čd/ha při 3 t) – i se středověkou rezervou je 25 čd moc                                            |
| Skladování                          | do 1. 3., s keramikou do 1. 5. | Nenalezeno (historicky se jablka hlavně sušila a skladovala ve sklepích / jamách).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | –                                                                               | nedohledáno – herní abstrakce                                                                                                              |

## 6. Hřbitov (pohřebiště)

| Číslo                       | Naše hodnota                                         | Literatura (hodnota / rozmezí)                                                                                                                                                                                                                                                                                                                                   | Zdroj                                                                                                                                    | Verdikt                                                                                                    |
| --------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Plocha na hrob              | 4 m² vč. uliček (56 hrobů na 15 × 15 m)              | Přezletice (přelom 10./11. st., běžné vesnické řadové pohřebiště): 55 hrobů / 61 pohřbů na ≈ 160 m², prostor „hustě vyplněný hroby“ → ≈ 2,6–2,9 m². Radomyšl (12. st., u kostela): ≈ 68 × 26 m pro původně 1 000–1 200 pohřbených, 26–28 řad → ≈ 1,5–1,8 m² (se superpozicemi). Mohylníky: Strážovice (9. st.) 101 mohyl o průměru 2–11 m (≈ 3–95 m² na mohylu). | Koštová a kol. 2022, PA 113, s. 183–184; Blajerová – Nechvátal 2008, AH 33, s. 399–400; Archeologický atlas – Strážovice (výtah z hesla) | sedí pro kostrová řadová pohřebiště (spíš velkoryse, reálně 2–3 m²); pro mohylové období zvětšit           |
| Ritus 6.–8. / 9. st.        | žárové hroby a mohylky 6.–8. st., kostrové od 9. st. | Plochá žárová pohřebiště 6.–8. st.: 141 lokalit od Západních Karpat po Jadran (studie 2022); nejstarší kostrové hroby v regionu 8. st.; Strážovice (9. st.) kombinují kostrové a žárové pohřby v mohylách; Dolní Věstonice – Na Pískách: téměř 1 300 kostrových hrobů od přelomu 8./9. do pol. 11. st.                                                           | vše jen výtahy ve vyhledávání (Pleva 2023 ap. nečteno); Archeologický atlas – Strážovice                                                 | sedí (v Čechách mohyly hlavně 8.–10. st., přechod ke kostrovému pohřbu postupně v 8.–9. st.)               |
| Velikost pohřebišť          | (hra – pohřebiště roste)                             | Přezletice 61 pohřbů (malá komunita); Radomyšl 1 000–1 200 pohřbených, demograficky ≈ 250 obyvatel, průměrná naděje dožití ≈ 27 let; Dolní Věstonice původně ≈ 1 500 hrobů za ≈ 250 let.                                                                                                                                                                         | Koštová a kol. 2022; Blajerová – Nechvátal 2008, s. 399                                                                                  | pro představu – ves 60 lidí při úmrtnosti ≈ 40 ‰ zaplní za 100 let ≈ 4 čtverce 15 × 15 m (vlastní výpočet) |
| Vzdálenost od obydlí a vody | v pořádku od 150 m (obydlí) a 100 m (voda)           | Systematická studie vzdáleností nenalezena. Přezletice: pohřebiště ≈ 650 m od potoka, v zásypech žádný sídlištní odpad → sídliště „dostatečně daleko“. Nechranice: do 12. st. „bývala pohřebiště daleko od vesnic“ (K. Derner).                                                                                                                                  | Koštová a kol. 2022, s. 183–184 a kap. 4.5; ČT24, 27. 11. 2015                                                                           | nedohledáno – směr (pohřebiště stranou vsi) sedí; prahy jsou herní abstrakce                               |

---

## Nejdůležitější opravy (návrh nových hodnot)

1. **Železo je výrazně dražší:** 1 kg nástrojů = **≈ 10 čd** (rozmezí 6–15) **a ≈ 50 kg uhlí**
   (rozmezí 40–100) místo 4 čd a 30 kg (Crew 1991: 25 čd a ≈ 100 kg uhlí na 1 kg tyče v malé
   prehistorické peci; větší raně středověké pece s houbami 3–9 kg jsou levnější). Příklad
   z crafts.md (36 kg nástrojů ročně): ≈ 360 čd kováře + ≈ 1 800 kg uhlí ≈ 180 čd uhlíře a ≈ 15
   velkých stromů – jedna řemeslnická domácnost (400–500 čd) to pořád zvládne.
2. **Sjednotit „strom“.** Varianta A: strom ≈ 0,7–1 m³ (velký) – uhlí 120 kg a keramika 400 kg
   sedí, ale **polozemnice ≈ 15–20 stromů, zemnice ≈ 6–8**. Varianta B: strom ≈ 0,3–0,4 m³
   (štíhlý) – polozemnice 35 a zemnice 12 sedí, ale **uhlí ≈ 40–60 kg/strom** a **keramika 1 strom
   na ≈ 150–250 kg**. Při mýcení dává hektar lesa podle velikosti stromů různý počet klád – i to
   vyžaduje jednu definici.
3. **Sad je pro 6.–8. století anachronismus.** Kulturní jabloně jsou v Čechách a na Moravě
   doložené až v 9.–10. st. a hlavně na centrálních místech; běžné sady až ve vrcholném středověku.
   Návrh: sad zpřístupnit později (např. od 9./10. st. nebo jako technologii), dřív jen sběr planých
   jablek u okraje lesa. Zároveň **plná úroda až od ≈ 20. roku** (ne 10.) a **sklizeň ≈ 1 čd na
   300–500 kg** (≈ 6–10 čd/ha při 3 t) místo 25 čd/ha.
4. **Hrnčíř:** v 6.–9. st. se keramika pražského typu dělala v ruce a pálila na ohništi (domácí
   výroba), dílna s kruhem a specializace přichází v 10.–11. st.; pece jsou známé, ale vzácné.
   **Účinek −15 % obilí nemá oporu** (obilí se skladovalo v jamách a sýpkách) – snížit na
   **−5 až −10 %** nebo vázat na vaření.
5. **Hniloba klád 10 %/rok** je 2–5× rychlejší než naměřený rozklad kmenů (≈ 2–5 %/rok) – buď
   **≈ 4 %/rok**, nebo 10 % ponechat a v dokumentu výslovně označit jako herní páku.
6. **Obnova lesa:** 30 let platí pro výmladky a tyčovinu (pařeziny se těžily ve věku 7–40 let);
   dospělý strom na srub nebo do milíře **≈ 60–80 let** – případně dvoustupňově (tyčovina → dospělý).
7. **Hřbitov:** 4 m² na hrob sedí jako velkorysá hodnota pro kostrová řadová pohřebiště (reálně
   2–3 m²); pro žárové mohylky 6.–8. st. by jedna mohyla zabrala ≈ 10–50 m² (často s více pohřby).

Čísla, která **sedí** a není třeba je měnit: 2 čd na skácení a dovoz stromu, 10 kg uhlí za čd
(konzervativní), 120 kg uhlí z velkého stromu, palivo na výpal keramiky, první plody v 6. roce,
život sadu ≈ 60 let, výnos 3 t/ha (konzervativní), jablka ≈ 1/6–1/7 výživy obilí, péče o sad
10 čd/ha, palivo jako třetina domácí výroby (horní mez).

---

## Zdroje

**Železo a uhlí**

- Crew, P. 1991: The Experimental Production of Prehistoric Bar Iron. _Historical Metallurgy_
  25(1), 21–36 – plný text (tab. 3 a 4, s. 33–35).
  https://www.hmsjournal.org/index.php/home/article/view/553
- Souchopová, V. – Merta, J. – Barák, M. 2003: Experimentální tavby železa v Technickém muzeu
  v Brně. _(Re)konstrukce a experiment v archeologii – Živá archeologie_ 4/2003, 89–96 – plný text.
  https://uni.uhk.cz/archeologie/wp-content/uploads/2024/05/Vol4_6.pdf
- Jack, P. M. 2025: Feeling the Peat: Investigating peat charcoal as an iron smelting fuel for the
  Scottish Iron Age. _Historical Metallurgy_ 55(2) – úvod cituje Pleiner, R. 2000: _Iron in
  Archaeology. The European Bloomery Smelters_, s. 126, a Oaks 2018, s. 48 (Pleinera jsem nečetl
  přímo). https://hmsjournal.org/index.php/home/article/view/682/678
- Kmošek, M. (text) 2019: poster „Pálení dřevěného uhlí v milíři / Tavba železa v šachtové peci“
  (Trocnov, projekt Interreg AT-CZ). https://2014-2020.at-cz.eu/data/projects/a/37/666_file_2.pdf
- Vikingeskibsmuseet Roskilde: Smeden (web, bez data).
  https://www.vikingeskibsmuseet.dk/en/professions/education/all-about-the-viking-ship/skibets-haandvaerkere/smeden
- Wareham Forge (D. Markewitz), experimentální tavby – amatérské, jen výtah ve vyhledávání.
  https://warehamforge.ca/ironsmelting/smelt/smelt09.html
- FAO 1987: _Simple technologies for charcoal making_ (FAO Forestry Paper 41; číslo řady neověřeno),
  kap. 5 (jámy) a 6 (zemní milíře). https://www.fao.org/4/x5328e/x5328e06.htm ,
  https://www.fao.org/4/x5328e/x5328e07.htm
- FAO (bez data): Review of the existing studies related to fuelwood and/or charcoal in Mozambique.
  https://www.fao.org/4/X6796E/X6796E05.htm
- Karlsson, C. 2015: _Förlorat järn_ (disertace SLU, Acta Univ. Agric. Sueciae 2015:38) – údaj
  podle článku Forskning.se 7. 5. 2015 „Medeltidsbondens behov av järn och stål större än väntat“.
  https://forskning.se/2015/05/07/medeltidsbondens-behov-av-jarn-och-stal-storre-an-vantat/
- Mathieu, J. R. 2000: A Tree Falls in Philadelphia. _Expedition_ 42(2).
  https://www.penn.museum/sites/expedition/a-tree-falls-in-philadelphia/

**Dřevo, les, palivo, stavby**

- Chudziak, W. 1987: Z badań nad budownictwem drewnianym Wielkopolski w okresie wczesnego
  średniowiecza. _Sprawozdania Archeologiczne_ 39, 343 n.
  https://www.rcin.org.pl//Content/25792/PDF/WA308_41834_P243_Z-BADAN-NAD-BUDOWNIC_I.pdf
- Pleinerová, I. 1986: Březno: Experiments with building Old Slavic houses and living in them.
  _Památky archeologické_ 77, 104–176 – **nedostupné**, jen citace (Archeologický atlas ČR, REA 5/2004).
  https://archeologickyatlas.cz/en/lokace/brezno_ln_muzeum
- Kadavý, J. – Kneifl, M. 2016: Role člověka a pařezin v měnícím se klimatu. Důvody pro ochranu
  a výzkum pařezin v ČR. _Živa_ (rok podle metadat PDF).
  https://ziva.avcr.cz/files/ziva/pdf/clovek-a-pareziny-duvody-pro-ochranu-a-vyzkum-pare.pdf
- How do environmental conditions affect the deadwood decomposition of European beech
  (_Fagus sylvatica_ L.)? _Forest Ecology and Management_ 381 (2016), 177–187 – abstrakt přes
  Starfos (autoři na stránce neuvedeni).
  https://starfos.tacr.cz/vysledky-vyzkumu/RIV%2F00027073%3A_____%2F16%3AN0000034
- Petrillo, M. a kol. 2016: Time since death and decay rate constants of Norway spruce and European
  larch deadwood in subalpine forests. _Biogeosciences_ 13, 1537–1552.
  https://bg.copernicus.org/articles/13/1537/2016/
- Jagger, P. – Jumbe, C. 2016: Stoves or Sugar? Willingness to Adopt Improved Cookstoves in Malawi.
  _Energy Policy_ 92, 409–419 (tab. 2). https://pmc.ncbi.nlm.nih.gov/articles/PMC4918052/
- Woodfuel in Ciskei: A Headload Story. _South African Forestry Journal_ 154 (1990), 88–93 – jen
  výtah abstraktu ve vyhledávání (autor neověřen).

**Keramika a skladování**

- Válka, M. 2014: Lidová keramika. In: _Homo faber: tradiční zemědělství a lidová výroba v českých
  zemích z pohledu etnologie_. Brno: MU, 120–129.
  https://digilib.phil.muni.cz/sites/default/files/pdf/131131.pdf
- Varadzin, L. 2010: Hrnčířská výroba ve východní části střední Evropy 6.–13. století
  v archeologických pramenech. _Archeologické rozhledy_ 62, 17–71 – jen katalogový záznam.
  https://asep.lib.cas.cz/arl-cav/cs/detail-cav_un_epca-0349736-Hrncirska-vyroba-ve-vychodni-casti-stredni-Evropy-613-stoleti-v-archeologickych-pramenech/?disprec=1
- Adubah, D. A. 2025: Sustainability and fuel consumption patterns in traditional firewood kilns.
  _Journal of African Arts & Culture_ 8(4), 63–80.
  https://journals.uew.edu.gh/index.php/jaac/article/download/703/421/1601
- Matters of hearth. _Down To Earth_, 29. 4. 1996.
  https://www.indiaenvironmentportal.org.in/news-clippings/matters-of-hearth
- Shott, M. 1996: Mortal Pots. _American Antiquity_ 61(3), 463–482 – abstrakt.
  https://www.cambridge.org/core/product/F1B1078925DF234F983AC6FF531BFDD1
- Beck, M. 2009: Counting Pots in Kalinga, Philippines. _Ethnoarchaeology_ 1(1), 79–106 – abstrakt.
  https://iro.uiowa.edu/esploro/outputs/journalArticle/Counting-Pots-in-Kalinga-Philippines-Short-And/9984269233702771
- Reynolds, P. J. 1974: Experimental Iron Age Storage Pits: An Interim Report. _Proceedings of the
  Prehistoric Society_ – abstrakt; Marshall (srovnání utěsněných a neutěsněných jam) jen výtah.
  https://core.tdar.org/document/414456/experimental-iron-age-storage-pits-an-interim-report

**Sad**

- Látková, M. 2017: _The Archaeobotany of Mikulčice. Food Supply to the Early Medieval
  Stronghold_. SBM XI, Brno: ARÚ AV ČR – náhled s plným textem kapitol.
  https://mikulcice.arub.cz/wp-content/uploads/2017/06/SBM11_nahled.pdf
- Lípa, M. – Jongepierová, I. 2020: Staré odrůdy a vysokokmenné ovocné stromy v krajině. _Živa_,
  s. 272 n. https://ziva.avcr.cz/files/ziva/pdf/stare-odrudy-a-vysokokmenne-ovocne-stromy-v-krajin.pdf
- LfL Bayern (bez data): Anleitung zur Kalkulationshilfe Streuobst, kap. 3.1, tab. 3.
  https://lfl.bayern.de/mam/cms07/iab/dateien/anleitung_zur_kalkulation.pdf
- Degenbeck, M. 2020: Möglichkeiten zur Rationalisierung des Streuobstbaus. _LWG aktuell_ 2020.
  https://www.lwg.bayern.de/mam/cms06/landespflege/dateien/streuobsttechnik.pdf
- USDA FoodData Central – jablka syrová (FDC 2709215, 171689), pšenice (FDC 169720), čteno přes
  zrcadlo getfoodfacts.com (ověřit přímo v FDC). https://getfoodfacts.com/food/apple-raw-2709215

**Hřbitov**

- Koštová, N. a kol. 2022: Raně středověké pohřebiště v Přezleticích (okr. Praha-východ).
  _Památky archeologické_ 113, 183–255.
  https://www.arup.cas.cz/wp-content/uploads/2022/11/PA_22_cl_KOSTOVA.pdf
- Blajerová, M. – Nechvátal, B. 2008: K demografii raně středověkých pohřebišť v Čechách na
  příkladu Radomyšle u Strakonic. _Archaeologia historica_ 33, 399–418.
  https://digilib.phil.muni.cz/sites/default/files/pdf/140772.pdf
- Archeologický atlas ČR: Strážovice – mohylník (výtah z hesla).
  https://archeologickyatlas.cz/en/lokace/strazovice_ho_mohylnik
- ČT24, 27. 11. 2015: U Nechranické přehrady našli archeologové desítky hrobů ze 12. století.
  https://ct24.ceskatelevize.cz/clanek/regiony/u-nechranicke-prehrady-nasli-archeologove-desitky-hrobu-ze-12-stoleti-123826

**Nedostupné / nedohledané:** Pleinerová 1986 (spotřeba materiálu na polozemnice v Březně),
diplomová práce o řivnáčské polozemnici (ZČU, servery nedostupné), Varadzin 2010 v plném textu,
hmotnosti raně středověkých nástrojů (Dresler – Beran 2019), konkrétní roky životnosti nádob
(Shott, Tani – Longacre), systematická studie vzdáleností pohřebišť od sídlišť.
