# Nákup výrobků řemeslníků u sousedů – podklady

Rešerše k `docs/design/crafts.md` (Nákup u sousedů), stav 19. 10. 2026. Martin: vesničané si
nástroje (a výrobky ostatních řemesel) kupují u kováře v sousední vsi sami, když se jim to vyplatí.

**Jak číst:** u každého čísla co uvádí literatura, odkud, a co hra použije. Přepočty jsou moje
(**vlastní výpočet**), co je jen odhad bez zdroje, je označené **(odhad)**. Ceny zboží v kg obilí
jsou z rešerše [2026-10-18-trade-values.md](2026-10-18-trade-values.md), práce dřevěného nářadí
z [2026-10-19-carts-carpentry.md](2026-10-19-carts-carpentry.md).

## 1. Kde řemeslníci byli

| Číslo                    | Literatura                                                                                                                                                                                                                                                                                          | Hra                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Kovářství a kovolitectví | Hradiště 8.–9. století v Čechách (Tismice, Hostim, Levý Hradec) – licí formy, nedokončené kování, slitky a tyglíky; hradiště byla „uzlovými body“ správy a hospodářství (Profantová; souhrn v Archeologickém atlasu – Šárka, Zabrušany). Kovárna je doložená i na hradišti v Královicích (10. st.). | soused „řemeslníci“ má kováře jistě               |
| Hrnčířství               | Keramika pražského typu se do 10. století dělá převážně v ruce a pálí na ohništi (crafts.md – Doba); specializovaná hrnčířská výroba na hradištích 9. století doložená není, zabrušanský typ je z 10. století.                                                                                      | hrnčíř jen u některých sousedů (kromě řemeslníků) |
| Venkovská ves            | Síť sídel 7.–9. století na Moravě houstla až k „přelidnění“ (Profantová, Vích) – sousední vsi a hradiště byly v dosahu dne cesty **(odhad)**.                                                                                                                                                       | sousedé v 8 směrech za krajem mapy                |

## 2. Cesta a nošení

| Číslo         | Literatura                                                                                                                                                           | Hra                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Náklad nosiče | ATNESA (Starkey a Kaumbutho 1999, tab. 1): nošení na hlavě 30 kg při 4–5 km/h; obchod hry počítá 25 kg na nosiče (trade.md).                                         | 25 kg na člověka (TRADE.porterKg)                    |
| Dny cesty     | Výprava po zemské stezce 2–6 dní a den za krajem mapy (trade.md). Bez cesty jdou lidé krajinou – les, voda, svahy; pomaleji a oklikou (**odhad** × 1,5 a den navíc). | stezka `trailTripDays`, krajinou délka × 1,5 + 1 den |
| Kdo jde       | Malá skupina – zbytek vsi hospodaří dál; přes zimu je času víc (**odhad** polovina dospělých, nejvýš 8, nejvýš 60 dní).                                              | `groupShare` 0,5, `maxGroup` 8, `maxDays` 60         |

## 3. Cena a čím se platí

| Číslo                | Literatura a výpočet                                                                                                                                                                                                                                                                                                | Hra                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Nástroje             | 60 kg obilí za kg (rešerše 2026-10-18 – kovaný nástroj ≈ 10 čd práce a 50 kg uhlí); soused prodá za 0,96 hodnoty.                                                                                                                                                                                                   | 57,6 kg obilí za kg                   |
| Keramika             | 3 kg obilí za kg (rešerše 2026-10-18).                                                                                                                                                                                                                                                                              | 2,88 kg obilí za kg                   |
| Dřevěné nářadí       | ≈ 0,5 čd na kg (rešerše vozů a tesaře); den práce ≈ 3–6 kg obilí (nástroje 6, keramika 3 kg obilí za čd – **vlastní výpočet**) → ≈ 2 kg obilí za kg.                                                                                                                                                                | 1,92 kg obilí za kg                   |
| Platba               | Výměna za to, co ves pěstuje – obilí, luštěniny (obchod hry – Jen společné suroviny). Platí se z přebytku nad pojistkou zásob, nejlevnějším v práci (cena jídla v práci – economy.ts).                                                                                                                              | obilí nebo luštěniny z přebytku       |
| Kolik práce to stojí | Příklad (ves 3 rodin, 4 ha osevu – **vlastní výpočet**): nástroje za rok 9 kg = 525 kg obilí ≈ 180 čd práce na obilí + 21 nosičských cest × 8 dní ≈ 170 čd; ušetří ≈ 180 čd polní práce ročně × 3,3 roku služby ≈ 600 čd. Keramika 84 kg ≈ 240 kg obilí → ušetří ztráty zásob a denní minimum ≈ 650 čd za 2,5 roku. | ves koupí, když ušetří víc, než stojí |

## Zdroje

- Profantová, N.: Avar-type finds in Bohemia and the traces of their local production; metal
  casting, smithing and goldsmithing on 8th–9th century hillforts (Tismice, Hostim) –
  [ASEP](https://asep.lib.cas.cz/arl-cav/cs/detail-cav_un_epca-0566141-Avar-type-finds-in-Bohemia-and-the-traces-of-their-local-production).
- Zlatnictví a šperkařství v Čechách v 9. a 10. století – [ASEP](https://asep.lib.cas.cz/arl-cav/en/detail-cav_un_epca-0555725-Zlatnictvi-a-sperkarstvi-v-cechach-v-9-a-10-stoleti-Prazska-sperkarska-dilna-10-stoleti).
- Archeologický atlas Čech: Praha-Liboc, hradiště Šárka; Zabrušany; Praha-Královice
  ([archeologickyatlas.cz](https://archeologickyatlas.cz/en/lokace/zabrusany_tp_hradiste)).
- Kouřil, P. – Profantová, N. – Vích: Malá Haná a síť hradišť 9. století
  ([PDF](https://www.sav.sk/journals/uploads/02111711042_Kouril.pdf)).
- Starkey, P. – Kaumbutho, P. (eds.) 1999: Meeting the challenges of animal traction. ATNESA –
  tab. 1 (nošení, vozy).
- Rešerše hry: 2026-10-18-trade-values.md (hodnoty zboží), 2026-10-19-carts-carpentry.md
  (dřevěné nářadí).
