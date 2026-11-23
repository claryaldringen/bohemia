# Řemesla – historie (neplatné sekce)

Sem patří části [crafts.md](../crafts.md), které přestaly platit; zachované doslova, aby šlo dohledat, proč se od nich ustoupilo. **Nic z tohoto textu neplatí** – platný stav je v crafts.md.

## Nákup u sousedů bez vozů

Neplatí od 22. 11. 2026 (D117 – Martin: „ano“ na otázku „Má si ves bez tesaře umět koupit vůz u souseda, který tesaře má, když se jí to vyplatí?“; [crafts.md](../crafts.md) – Nákup u sousedů, Vozy). Dřív v Nákup u sousedů:

- **Co ves kupuje:** nástroje (kovář), keramiku (hrnčíř) a dřevěné nářadí (tesař) – výrobky,
  které posouvají meze produktivity. Uhlí ne (je jen pro kováře), vozy zatím ne.

Nákup šel vždy pěšky (skupina nosičů po 25 kg), i když ves vůz měla.

## Nákup u sousedů a Vozy

Neplatí od 23. 11. 2026 (konec smyšlených sousedů – [markets.md](../markets.md), Pravidla 1, schválené Martinem 22. 11. 2026; jeho slova doslova v [neighbours.md](../neighbours.md) – Martinova rozhodnutí, Než syn odejde, ves neobchoduje). Dřív v crafts.md:

Martin (19. 10. 2026): „Nástroje ať vesničané obchodují individuálně. Např. pokud ve vedlejší
vesnici kovář je a u nás ne, ať si vesničané od něj koupí nástroje za něco z toho, co vesnice
produkuje. Sami si spočítají, jestli se jim to vyplatí. Až bude kovář u nás, budou pravděpodobněji
nakupovat u něj, protože si ušetří cestu. S ostatními řemesly to bude stejné.“ Detaily níž jsou
návrh Clauda; čísla v `rules/` (`CRAFT_BUYING`), rešerše
[2026-10-19-craft-buying.md](research/2026-10-19-craft-buying.md), jádro `craft-buying.ts`.

- **Kdo má řemeslníky:** soused v každém z 8 směrů má řemeslníky podle toho, čím se živí
  ([obchod](trade.md) – druhy sousedů): **řemeslníci** mají kováře, hrnčíře i tesaře **jistě**,
  ostatní **někdy** – obilnáři kováře s pravděpodobností 50 %, hrnčíře 40 %, tesaře 30 %; pastevci
  30 / 40 / 20 %; lesní ves 40 / 20 / 60 % (dřevaři mají tesaře). Deterministicky ze seedu vsi
  a směru. Řemeslníci jsou kolem každé vsi dvakrát, takže každé řemeslo jde koupit.
- **Co ves kupuje:** nástroje (kovář), keramiku (hrnčíř) a dřevěné nářadí (tesař) – výrobky,
  které posouvají meze produktivity – a od 22. 11. 2026 **vůz** od tesaře (Vozy níž). Uhlí ne (je
  jen pro kováře).
- **Kdy:** jednou za rok **15. 11.** – po sklizni, ozimu, sklizni jablek a porážce, kdy je
  volno a přebytek (Martin: září až listopad). Starší vsi se do té doby nemění.
- **Vlastní řemeslník má přednost:** ves kupuje jen výrobek, na který nemá pracujícího
  řemeslníka – dílna bez obyvatel, nebo bez vstupů (kovář bez uhlí, hrnčíř a tesař bez dřeva) se
  nepočítá. Až kovář ve vsi bude, nákup nástrojů u souseda ustane.
- **Kolik:** jen do zásoby jako řemeslník (`craftTargets` – potřeba a opotřebení za rok), menší
  nákup než 0,5 kg ne.
- **U koho:** u nejbližšího souseda s řemeslníkem – nejméně dní cesty: po hotové **zemské
  stezce** jako výprava (2–6 dní a den za krajem mapy); bez stezky jdou lidé **krajinou rovně ke
  kraji mapy** – cesta o polovinu delší a den navíc. Stejný soused – jedna cesta.
- **Cena:** hodnota výrobku v kg obilí jako v obchodu (nabízené zboží za 0,96 hodnoty –
  nástroje 57,6, keramika 2,88, dřevěné nářadí 1,92 kg obilí za kg). Platí se **tím, co ves
  pěstuje – obilím nebo luštěninami**, nejlevnějším v práci (cena jídla v práci – `foodCosts`,
  i s nošením) a **jen z přebytku nad pojistkou zásob** (co zbude k příští sklizni nad pojistku –
  history/fields-history.md, Osev podle zásob). Bez přebytku ves nekupuje. Obilí na platbu ves vypěstuje znovu –
  u nástrojů už s nimi (cena jídla v práci při pokrytí po nákupu).
- **Cesta:** malá skupina – **polovina dospělých, nejvýš 8** – nese platbu tam a výrobky zpět po
  25 kg na člověka; kdo nese víc, jde vícekrát, ale přes zimu **nejvýš 60 dní** – víc ves koupí
  příští rok (nástroje si tak ves pořizuje po částech). Lidé jsou celé dny pryč – jejich práce
  vsi chybí od prvního dne (jako navrhovaná výprava s předností – [obchod](trade.md), Jak je
  postavené: výprava bez volné práce by stála, nákup jde vždy).
- **Rozhodnutí:** ves porovná práci, kterou výrobek ušetří **za dobu služby** (1 ÷ opotřebení let
  – nástroje a dřevěné nářadí ≈ 3,3 roku, keramika 2,5), s prací za platbu a cestu (lidé × dny tam
  a zpět). Co výrobek ušetří (meze produktivity – Účinek): **nástroje** polní práci dílů v osevu
  a seč (cena jídla v práci při pokrytí před a po), **keramika** ztráty zásob a denní minimum
  domácností, **dřevěné nářadí** práci celé vsi. Kupuje, jen když ušetří víc, než stojí.
- **Pořadí nákupu:** přebytek je jeden, proto ves platí napřed výrobek, který **ušetří nejvíc
  práce na práci, kterou stojí** (poměr ušetřené práce k práci za platbu a cestu), a ostatní pak
  podle toho, co z přebytku zbylo (rozhodnutí Clauda, 19. 10. 2026 – dřív pevné pořadí nástroje →
  keramika → dřevěné nářadí: z malého přebytku ves koupila keramiku, i když dřevěné nářadí by
  ušetřilo několikrát víc).
- **Kronika a upozornění:** směna jménem obyvatel obou vsí, obě strany i s množstvím
  (Martin 14. 11. 2026: „{Vlkovští} směnili {co a kolik} za {co a kolik} s {Lhotskými}.“) –
  „Vlkovští směnili 766 kg obilí za 9 kg nástrojů a 120 kg keramiky s Lhotskými.“; krátký řádek
  upozornění „Vesničané koupili nástroje u souseda (sever)“ – jen fakt.
- **Rozhraní (jen ikony):** v panelu dvorce řádek výrobků – šipka k sousedovi, u kterého ves
  kupuje (✓ vlastní řemeslník), a nákup na cestě (šipka a dny do návratu); v panelu dílny bez vstupů
  ikona výrobku se šipkou, že ves dokupuje u souseda. Věty jen v popiscích.
- **Ve scéně:** skupina jde jako karavana výpravy ([obchod](trade.md) – Ve scéně) – nosiči
  s platbou tam a s výrobky zpátky, po hotové stezce, jinak rovně krajinou od dvorce ke kraji mapy;
  jde-li vícekrát, karavana jde každou cestu zvlášť.
- **Vozy (22. 11. 2026):** Martin (19. 10. 2026, [obchod](trade.md) – Ve scéně, karavana): „Až
  bude vůz, pojedou zásoby na voze a ušetří se člověkodny.“; CLAUDE.md: „Vesničané sami používají,
  co jim ulehčí práci (Martin) – hráč jim to nezadává.“ Na otázku „Má si ves bez tesaře umět koupit
  vůz u souseda, který tesaře má, když se jí to vyplatí?“ Martin 22. 11. 2026: „ano“. Vysvětlení
  Clauda k otázce: rozhoduje se stejně jako u nástrojů nebo keramiky (koupí, jen když jí vůz
  ušetří víc práce, než stojí); vůz potřebuje tažné zvíře (dvoukolák jeden vůl, čtyřkolák pár),
  ves bez volů by ho nekoupila.
  Podrobnosti návrh Clauda (čísla jen ta, která už jsou – `CARTS`, `CARPENTRY`, `CART_IRON`,
  `CRAFT_BUYING`):
  - **Nákup vozem:** má-li ves doma vůz a voly, kteří ten den neorají (ve dny orby a se spřežením
    na poli jdou páry napřed k rádlům – [vozy](wagons.md), Co vozy vozí; vozy na výpravě, pro
    kování nebo s jiným nákupem jsou pryč), a vede-li k sousedovi hotová zemská stezka sjízdná pro
    vozy (krajinou ke kraji mapy vůz nejede – jako vůz pro kování), jede nákup **vozem jako
    výprava**: náklad na voze (dvoukolák 400 kg, čtyřkolák 800 kg, čtyřkoláky napřed), s každým
    vozem honák a pomocník, vozy jedou tolikrát, kolikrát se naplní (zbytek aspoň půl vozu = jízda
    navíc, menší zbytek nesou nosiči), dny cesty jako pěšky (výprava s vozem také). Vůz se vezme,
    **jen když je cesta vozem levnější v práci** než nosiči (jako vůz pro uhlí); posádka se musí
    vejít do skupiny (nejvýš polovina dospělých). Rozhodnutí o nákupu počítá s levnější cestou
    a za 60 dní ves koupí tolik, kolik odveze i vůz. Vozy a jejich voli jsou do návratu pryč –
    doma nevozí a neorají. Ve scéně jede karavana nákupu s vozy jako výprava.
  - **Vůz od tesaře souseda:** ves **bez pracujícího tesaře** (dílna bez obyvatel nebo bez dřeva se
    nepočítá), která vůz chce (stejný výpočet jako tesař – [vozy](wagons.md), Kolik vozů ves chce,
    první chybějící druh, dvoukolák napřed) a má na něj **volné tažné zvíře** (dvoukolák jeden
    vycvičený vůl, čtyřkolák pár, kteří ten den neorají), ho koupí u nejbližšího souseda s tesařem,
    kam vede sjízdná stezka – voli jdou se skupinou a vůz dovedou domů (do návratu jsou pryč).
    **Cena** jen z čísel, která už jsou, ocenění jako ostatní výrobky (hodnota v kg obilí, nabízené
    zboží za 0,96): práce tesaře (dvoukolák 25, čtyřkolák 50 čd) za den tesaře jako u dřevěného
    nářadí (2 kg obilí za kg při 0,5 čd na kg = 4 kg obilí za den), klády (1 / 2) za hodnotu klády
    v obchodu (40 kg) a kování (3 / 6 kg) za hodnotu nástrojů (60 kg za kg – jako kování k vozu):
    **dvoukolák 320 kg obilí** (100 + 40 + 180), **čtyřkolák 640 kg**, soused chce 307 / 614 kg.
    Platí se celý z přebytku nad pojistkou (jinak nic) a nosí se tam jako jiná platba. **Ušetří**,
    co by vůz navíc ušetřil podle loňského roku vozů (úspora vozů s ním a bez něj mínus voli navíc
    nad páry k rádlům – jako tesař, jen bez ceny vozu) za 10 let služby; kupuje, jen když to
    převýší práci za platbu a cestu. Ve stejném pořadí jako ostatní výrobky (poměr ušetřené práce
    k ceně), jeden vůz za rok. Kronika „Vlkovští směnili 307 kg obilí za dvoukolák s Lhotskými.“,
    upozornění „Vesničané koupili dvoukolák u souseda (sever)“.
  - Dřív ves vůz koupit neuměla a nákup šel vždy pěšky – [historie](history/crafts-history.md).
- **Námět (zatím ne):** nákup u hráčovy vlastní vsi v sousední mapě, když tam řemeslník je –
  simulace jedné vsi o jiných mapách neví (vsi na téže mapě od 1. 11. 2026 nejsou – jedna ves,
  jedna mapa); šlo
  by přidat podobný snímek sousedních map v `updateVillage`. Do té doby simulace počítá i ve směru
  vlastní vsi se sousedem bez simulace.
