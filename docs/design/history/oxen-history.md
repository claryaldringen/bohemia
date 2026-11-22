# Voli a orba – historie (neplatné sekce)

Sem patří části [oxen.md](../oxen.md), které přestaly platit; zachované doslova, aby šlo dohledat, proč se od nich ustoupilo. **Nic z tohoto textu neplatí** – platný stav je v oxen.md.

## Páry k rádlům podle dílů na řadě

Neplatí od 22. 11. 2026 (D114 – Martin: „ano“ na otázku „Má ves chtít tolik párů volů, kolik zvládne obsloužit lidmi?“; [oxen.md](../oxen.md) – Kolik volů ves chce, Páry k rádlům podle lidí). Dřív v Kolik volů ves chce:

- **Páry k rádlům:** tolik, aby voli zorali celý osev v oknech orby (od 25. 10. 2026 osev
  osevního postupu – [pole](../fields.md), Osevní postup po dílech; ~~roční plán osevu~~ se ruší).
  K 1. 9. ves zkusí 1,
  2, … párů (kapacita páru jako dřív spřežení – 0,3 ha za den, délka brázdy a cesta k bloku)
  a nejméně párů, se kterými vybere totéž jako bez meze orby, je **potřeba** toho roku
  (`DraftState.ploughNeed`, nejvýš 8). Do prvního plánu pár na každou ohradu volů. Co páry
  nezorají, se dál nezaseje. **Od osevního postupu po dílech** ([fields.md](../fields.md) – Osevní
  postup po dílech, Páry k rádlům; návrh Clauda 25. 10. 2026) ves plán nemá: potřeba je nejméně
  párů, které v oknech orby zorají **všechny díly na řadě** v hospodářském roce – nutné i nad
  potřebu (ozim v září–říjnu, jař na podzim i na jaře, bez posledního dne okna; výkon páru
  0,3 ha za den × délka brázdy dílů). Ves tak chce víc volů a sena než dřív – měří Úloha 9.
  **Strop podle lidí** (návrh Clauda 25. 10. 2026, recenze Úlohy 5): nejvýš tolik párů, kolik ves
  obslouží – pár chce oráče a setí za zoranou částí (0,3 ha za den × 10 člověkodnů na hektar ≈ 3),
  tedy `OXEN.crewPerPair` = 4 dospělí na pár (nejméně 1 pár). Jinak by malá ves s velkým polem
  chtěla až 8 párů a seno na ně, které by stejně nezorala ani nezasela.
- **Pod pojistkou** (27. 10. 2026 – Martin schválil „Pod pojistkou mají v oknech setí přednost
  pole“, **Martin 27. 10. 2026: „Ano“**; provedení návrh Clauda): když výhled zásob z pole
  k příští sklizni k 1. 9. nedosáhne pojistky ([pole](fields-history.md) – Osev podle zásob), potřeba párů
  počítá **i nutné díly mimo postup** – výběr nutných dílů k 1. 9. včetně nouzových příloh
  (`neededSelection`); páry zvýší hned jako vždy, když orba nestačí. _Historie:_ nutné díly
  a `neededSelection` zrušené 9. 11. 2026 s cílem osevu – páry počítají všechny díly na řadě
  ([pole](../fields.md) – Osevní postup po dílech, bod 3, Páry k rádlům). Proč orba a ne lidé: Vlkov (rok 822, 1 rádlo, 7 vycvičených volů) měl v oknech
  setí 3–5 člověkodnů denně volných a stavby nutné polní práci už ustupují (pořadí práce dne –
  [pole](../fields.md), Práce; Martin 25. 10. 2026) – úzkým hrdlem bylo jediné rádlo, které zorá
  ≈ 18 ha za podzim, kdežto ves potřebovala ≈ 45 ha ozimu. Volné páry volů ves osadí rádly sama
  (Rádlo k páru bez výcviku výš), další páry vycvičí z telat – vesničané sami používají, co jim
  ulehčí práci. Motyka dál nekope (Jen rádlo).

## Náhrada jen posledního páru

Neplatí od 21. 11. 2026 (Martin: „ano“ na otázku, zda má výjimka platit pro všechny páry k orbě, které ves chce; oxen.md – Páry k rádlům, které ves chce, mají přednost). Dřív ve Výcviku volů:

- **Náhrada posledního páru má přednost** (návrh Clauda 20. 10. 2026: ať ves neorá
  motykou): když ves orá, poslední pár dosluhuje (je v posledních 2 letech služby) a jiný
  vycvičený ani ve výcviku není, vezme výcvik pro náhradu telata i pod cílem krav – dokud zůstane
  chovný pár krav (LIVESTOCK.breedingMin). Výcvik tak začne včas, 2 roky před koncem služby. Další
  páry a voli na vozy dál jen z přírůstku nad chovnými kravami.
