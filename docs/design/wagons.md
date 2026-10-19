# Vozy a tesař

Stav: **schváleno** (Martin, 19. 10. 2026: „Ano, schvaluji“). Co řekl Martin, je u bodu označeno;
ostatní je návrh Clauda. Čísla ověřila [rešerše](research/2026-10-19-carts-carpentry.md).
**Fáze 1 implementovaná (19. 10. 2026)** – tesař a vozy v jádru a rozhraní, dosah vozu zatím
zástupný (část [Jak je postavené – fáze 1](#jak-je-postavené--fáze-1)); fáze 2 je vozová síť,
fáze 3 vozy ve scéně.

## Proč

Ves dnes všechno nosí na zádech – snopy z pole na výmlat, seno z luk, klády z lesa i zboží
k sousedovi (25 kg na člověka a cestu). Martin (19. 10. 2026): vozy mají vozit **seno, snopy
a klády** a **nahradit nosiče u obchodních výprav**. Vozy ale potřebují jinou cestu než lidé:
„Vozy mohou cestu vyjezdit, ale nemají takovou prostupnost jako lidé, kteří chodí pěšky. Bude to
znamenat např. to, že ve svahu, kde lidé zvládnou chodit rovně, vůz bude muset vyjezdit
serpentiny.“ Vozy vyrábí nový řemeslník **tesař** (Martin).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** vůz s voly ze spřežení vozí seno, snopy a klády a jede s obchodní výpravou – ves ušetří
  práci nošení (Martin).
- **Cíl:** vozy jezdí po **vlastní síti cest** – nevyjedou prudký svah, ve svahu vyjezdí
  serpentiny, a vyjezdí si vlastní cesty (Martin).
- **Cíl:** **tesař** – nový řemeslník: vyrábí vozy, mírně zlepší produktivitu celé vsi (dřevěné
  nástroje) a výrazně zrychlí práci na dřevěných částech staveb (Martin).
- **Ne-cíl:** tesař nestaví vlastní specializované stavby (most, stodola…) – jen pomáhá ostatním
  stavbám svým umem (Martin: „Bude jen pomáhat ostatním, ale díky jeho zkušenostem a umu bude
  opracování dřevěných částí rychlejší.“).
- **Ne-cíl (teď):** koně, jízda na koni, vojenské vozy, kolář jako samostatné řemeslo (kola dělá
  tesař), vozy u sousedů.
- **Anti-cíl:** vůz, který jede kamkoli rovně jako pěšák (svah, les, potok); vůz, který ušetří
  práci tam, kam nedojede.

## Tesař

- **Dílna** jako ostatní dílny ([řemesla](crafts.md) – Budovy): obydlí + 30 %, bydlí v ní
  domácnost, řemeslo patří budově. Vzhled (návrh): polozemnice s předsazenou střechou, pod ní
  kozlíky, trámy, rozdělaný vůz a kola. Umisťuje se jako dílna, zkratka a ikona v mřížce staveb.
- **Surovina:** klády z hromady; když chybí, tesař si skácí strom sám (jako hrnčíř a uhlíř –
  strom vyhrazený dílnou). Potřebuje **nástroje od kováře** (sekery, tesly) – bez nich pracuje
  podle pokrytí nástroji pomaleji (meze).
- **Podle potřeby a volný čas** jako kovář a hrnčíř (crafts.md – Podle potřeby): vyrábí do zásoby
  podle potřeby vsi, s plnou zásobou (nebo bez klád) pracuje se vsí.
- **Co vyrábí:**
  1. **Vozy** – tolik, kolik ves potřebuje: **jeden vůz na spřežení**; vůz se opotřebí
     a doslouží (návrh ≈ 10 let – rešerše), tesař vyrobí nový.
  2. **Dřevěné nářadí** (hrábě, vidle, jha, kádě, topůrka, rádla) – zásoba v kg jako nástroje
     kováře, potřeba na pracujícího a opotřebení ročně (rešerše).
  3. **Pomoc se stavbami** – tesař nestaví sám, ale jeho umem jde **opracování dřevěných částí
     staveb rychleji** (Martin).
- **Účinek – meze produktivity** (jako kovář a hrnčíř – lineárně podle pokrytí 0–1):
  - **stavby:** pracnost dřevěné části každé stavby (obydlí, dílny, ohrady, modly, svatyně,
    hatě, lávky…) od nejhorší meze k nejlepší podle **pokrytí tesařem** – výrazně (návrh: dřevěná
    část až o ≈ 40 % levnější – rešerše; podíl dřevěné části u každé stavby z jejích fází),
  - **polní a domácí práce:** podle **pokrytí dřevěným nářadím** mírně (návrh: o jednotky
    procent – rešerše), vedle kovářových nástrojů.
  - **Pokrytí tesařem** = práce, kterou tesař dá stavbám, ÷ dřevěná práce běžících staveb
    (nejvýš 1) – rozhodne implementace (návrh), aby jeden tesař malé vsi pokryl stavby úplně
    a velké jen zčásti.

## Vůz

- Vůz je **zásoba vsi** (počet, stav), ne stavba ve scéně – stojí u ohrady se spřežením.
- **Táhnou ho voli ze spřežení** (oxen.md) – ve dny orby orají, jinak vozí; vůz bez spřežení
  stojí. Honák jde s vozem (práce svozu, menší než nošení).
- **Dva druhy vozů** (Martin – oba modely z 0 A.D. se mu líbí, role návrh Clauda, Martin schválil):
  - **dvoukolák** – základní vůz od tesaře: náklad ≈ 400 kg, otočí se v malém oblouku, projede
    i vyjetou cestou; vozí seno, snopy a klády,
  - **čtyřkolák** – náklad ≈ dvojnásobek, ale delší a hůř se otáčí (větší poloměr otáčení –
    mírnější serpentiny, nebo upravená cesta); hlavně na obchodní výpravy po zemské stezce.
- **Rychlost** volů ≈ 3 km/h (pomaleji než pěšák s nůší, ale nese 15–30×); čísla nákladu
  a otáčení podle rešerše.
- **Co vozí** (Martin): **seno** z luk na stoh, **snopy** z pole na výmlat, **klády** z lesa na
  hromadu a ke stavbám, **zboží obchodní výpravy** po stezce. Vůz ušetří práci nošení jen tam,
  kam **dojede vozová cesta**; jinam se nosí jako dnes. Bez vozu (nebo bez spřežení) vše jako
  dnes.
- **Obchod:** výprava s vozem potřebuje méně lidí (honák a pomocník na vůz místo nosičů po 25 kg)
  – jen po stezce, která je pro vozy sjízdná (sklon, brody, hať).

## Vozová síť a vyjeté cesty

- **Vlastní cena terénu pro vůz** (Martin): vůz nevyjede prudký svah. Rozhoduje **sklon ve
  směru jízdy**, ne sklon terénu – nad mezí (návrh ≈ 10–12 % – rešerše) vůz nejede, pod ní je
  stoupání dražší. Proto nejlevnější cesta do svahu vede šikmo a **serpentiny vzniknou samy**.
  Pěšák jde dál rovně (jeho síť se nemění).
- **Les** jen po vykácené cestě (pevné cestě), **křoviny a mladý les** ne, **voda** jen mělkým
  brodem nebo po hati (Martin: most zatím ne – stačí brod a hať); **lávka** je jen pro pěší. Ploty, domy a pozemky jako u pěšin, mezi domy jen
  kudy se vůz vejde (šířka ≈ 2,5 m).
- **Přes louku, úhor a strniště** jezdí (pomaleji), **přes osetý díl** ne – jako lidé.
- **Vyjeté cesty:** provoz vozů se sčítá jako provoz lidí (roční síť 1. 11., roads.md). Úsek
  s dostatečným provozem vozů se stane pevnou cestou s příznakem **vozová** – vyjetá, širší (dvě
  koleje), sjízdná pro vozy. Pevná cesta jen pro pěší (bez provozu vozů) zůstane, jak je.
  Upravená cesta je sjízdná vždy (širší, zpevněná).
- **Lidé po vozových cestách chodí** (pevná cesta je pro všechny – Martin: „Když už někde
  vyšlapaná cesta je, ať po ní lidé chodí“), ale do svahu dál i zkratkou rovně.
- **Co hráč uvidí:** ve svahu se pěšina a vozová cesta rozejdou – pěšina rovně, vyjetá cesta
  serpentinami; v rovině splynou.

## Co hráč vidí

- V mřížce staveb **Tesař** (dílna), v panelu dílny zásoba vozů a nářadí a pokrytí staveb.
- V horní liště ikona **vozů** s počtem (jen když jsou) a dřevěného nářadí (jako nástroje).
- Ve scéně vozy s voly a honákem jezdí po vozových cestách – svoz sena, snopů, klád, výprava
  k sousedovi; prázdný vůz stojí u ohrady. Vyjeté cesty mají koleje.
- Panel cesty ukáže, že je **vozová** (ikona vozu).

## Grafika

Z 0 A.D. (CC BY-SA 3.0, převod jako spřežení – `tools/blender/people_from_0ad.py`,
`plough-team.json`, `plough.py`): `props/special/wagon_two_wheel_empty.dae` a
`wagon_four_wheel_empty.dae` **s animací jízdy** (`animation/mechanical/…_move.dae`, kola se točí),
`props/hay_cart(_large).dae` (vůz se senem), `props/wooden_cart(_big).dae`,
`props/wrld_handcart(_broken).dae` (ruční dvoukolák, rozbitý – opuštěný dvůr). Martin vybral
(19. 10. 2026, po náhledu) **dvoukolý a čtyřkolý vůz** (`wagon_two_wheel_empty`,
`wagon_four_wheel_empty`) – s loukoťovými koly, ojí a jhem; ruční vozíky jen jako ozdoba. Měřítko
0 A.D. se zmenší na skutečnou velikost (dvoukolák ≈ 3,5 m i s ojí, čtyřkolák ≈ 5 m).

## Jak je postavené – fáze 1

Návrh Clauda (19. 10. 2026) – detaily, které návrh výš nechal otevřené; čísla z
[rešerše](research/2026-10-19-carts-carpentry.md), v `rules.ts` (`CARPENTRY`, `WOODWORK_LABOR`,
`CARPENTER_TOOLS_WORK`, `WOOD_TOOLS`, `WOOD_TOOLS_LABOR`, `CARTS`, `CART_ACCESS`). Jádro:
`carpentry.ts` (tesař), `carts.ts` (vozy, svoz, dosah), svoz a pomoc stavbám v kroku práce
(`simulate.ts`).

- **Dílna tesaře** jako hrnčíř a kovář: polozemnice s předsazenou střechou (přístřešek 3,2 m),
  cena 286 čd a 23 stromů (obydlí + 30 %), jedna domácnost k osídlení, v mřížce staveb **Tesař
  [T]**. Ve scéně se zatím kreslí a staví jako polozemnice (model dílny tesaře přidá jen záznam
  v `CRAFT_MODEL`), dílna nekouří.
- **Co tesař dělá – v tomto pořadí:**
  1. **Pomoc stavbám** (stavby nečekají): člověkoden tesaře vede **4 čd dřevěné práce** vsi
     (tesařská parta – mistr a 3 pomocníci, i jeho vlastní). Tesaři dají stavbám tolik, kolik
     dřevěná práce dne chce (nejvýš svou práci po minimu a domácí výrobě); tesař, který nemá co
     vyrábět, je na stavbě celý den. Jeho práce jde do staveb se společnou prací vsi.
     **Pokrytí tesařem** = vedení, které tesaři dali ÷ kolik ho dřevěná práce dne chtěla (nejvýš
     1); dřevěná práce dne = podíl dřevěné práce staveb z práce, kterou stavby dnes dostanou
     (rozdělení rovným dílem jako ve stavbách).
  2. **Vozy** – rozdělaný vůz, pak chybějící vůz: **dvoukolák na každé vycvičené spřežení**,
     s hotovou zemskou stezkou navíc **jeden čtyřkolák** (obchod). Dvoukolák 25 čd a 1 kláda,
     čtyřkolák 50 čd a 2 klády; vůz slouží **10 let**, pak dosloužil (kronika, upozornění)
     a tesař udělá nový.
  3. **Dřevěné nářadí** do zásoby: potřeba **4 kg na pracujícího** (od 14 let), opotřebení
     **30 % ročně** (jen v užívání, jako nástroje), zásoba = potřeba × 1,3; **0,5 čd na kg,
     100 kg z klády**.
- **Dřevo:** klády v dílně, pak celé klády z hromady, bez nich si tesař skácí nejbližší strom sám
  (vyhrazený dílnou, pařez – jako hrnčíř). Bez klád i stromů hlásí „Tesař nemá klády“.
- **Nástroje od kováře:** všechna práce tesaře (výroba i vedení staveb) podle pokrytí nástroji
  – **meze 1,5 → 1**.
- **Volný čas:** tesař odpočívá (pracuje se vsí) jen když nemá co vyrábět (nebo z čeho) **a**
  žádná stavba nečeká na dřevěnou práci.
- **Účinek – meze produktivity:**
  - **stavby:** dřevěná část práce stavby **1 → 0,6** podle pokrytí tesařem. Podíl dřevěné
    práce na ceně stavby (i s kácením): zemnice 40 %, polozemnice a dílny 50 %, dvorec 60 %,
    ohrada 40 %, rádlo 100 %, modla 80 %, svatyně 30 %, vylepšení cesty a zemská stezka (hať,
    lávka) 30 %, oprava stavby 30 %; pole, sad, hřbitov a jabloně u cest 0. S plným pokrytím
    stojí polozemnice o 20 % méně práce.
  - **práce vsi:** dřevěné nářadí násobí veškerou práci vsi (háček štěstí) – práce stojí **1 →
    0,95** podle pokrytí nářadím.
  - Ves bez tesaře platí nejhorší meze jako dřív – kalibrace (`measure-village 20 20`) vyšla
    s tesařem v kódu bit po bitu stejně.
- **Vůz = zásoba vsi** (`VillageState.carts` – druh, den výroby), stojí u ohrady se spřežením.
  **Vozí dvoukoláky** se spřežením, které dnes neorá (ve dny orby orají) a není s výpravou;
  čtyřkolák jezdí jen s výpravami. Vůz za den odveze tolik jako **8 nosičů** a jdou s ním **2 lidé**
  (honák a nakladač – činnost `haul` v rozdělení práce dne), kde dojede, ušetří 6 čd denně.
- **Svoz** (kam vůz dojede, nejvýš podíl nošení úlohy a nejvýš ten podíl zbývající práce – vůz
  sám úlohu nedodělá): **odnos snopů** (podíl odnosu na sklizni – fields.md), **čtvrtina seče**
  (svoz a stohování) a **polovina kácení a dovozu klád ke stavbám**. Vozy jedou v pořadí úloh dne
  (sklizeň a seč podle konce okna), zbytek vozí klády. Klády z mýcení na hromadu se nenosí zvlášť
  (jsou v ceně založení) – vůz je nezkrátí.
- **Obchodní výprava** vezme vozy, které jsou doma se spřežením (čtyřkoláky napřed): náklad na voze
  (400 / 800 kg), s vozem 2 lidé místo nosičů po 25 kg; vozů jede tolik, aby lidí bylo nejméně.
  Vozy a jejich spřežení jsou do návratu pryč – doma nevozí a spřežení neorá. Stezka je pro vozy
  zatím sjízdná vždy (je upravená cesta).
- **Dosah vozu je rozhraní** (`CartAccess` – „dojede vůz k místu a za kolik metrů“). Fáze 1 dává
  **zástupnou odpověď** (`straightCartAccess`): vůz jede od ohrady rovně, jen po louce nebo po
  políčku vsi (pole, ohrada), ne lesem ani vodou, se sklonem ve směru jízdy nejvýš 12 %; lesem
  jen posledních 30 m ke stromu (kládu ke kraji vlečou lidé). Pevné cesty, brody a hať nezná –
  je spíš přísná: kde vůz rovně nedojede, nosí se jako dřív (anti-cíl). Bez krajiny (testy,
  kalibrace) dojede všude. Vozová síť (fáze 2) ho nahradí skutečnými trasami.
- **Rozhraní:** panel dílny tesaře – co dělá (vyrábí vůz s průběhem, nářadí, pomáhá stavbám,
  kácí), vozy proti potřebě po druzích (kolik na cestě), dřevěné nářadí s pokrytím, pokrytí
  dřevěné práce staveb. Horní lišta – dřevěné nářadí (s tesařem) a vozy (jen když jsou).
  Upozornění „Tesař vyrobil vůz“, „Vůz dosloužil“, „Tesař nemá klády“. Panel obchodu ukáže vozy
  výpravy. `/dev/panels` – Tesař, Tesař pomáhá stavbám.
- **Scéna (data pro fázi 3):** `SceneVillage.carts` – vůz, kde stojí (u ohrady), stav a cíl dne
  (svoz – pole, louka, stromy; výprava – stezka). Postavy posádky vozu stojí u svozu jako nosiči,
  sekáči a dřevorubci; vozy se zatím nekreslí.
- **Ikony:** `build/tesar.png` (polozemnice s kozlíky, trámem a dvoukolákem), `resources/cart.png`,
  `resources/wood-tools.png` – `tools/blender/icons.py`.

**Zbývá:** fáze 2 – vozová síť (sklon ve směru jízdy – běžně 8 %, mez 12 %, serpentiny, vyjeté
cesty, brody a hať, poloměr otáčení čtyřkoláku) nahradí `straightCartAccess`; fáze 3 – vozy se
spřežením a honákem ve scéně podle `SceneVillage.carts`, model dílny tesaře.

## Rozhodnutí

| Rozhodnutí                                                                                | Kdo                   |
| ----------------------------------------------------------------------------------------- | --------------------- |
| Vozy vozí seno, snopy, klády a zboží obchodu místo nosičů                                 | Martin (19. 10. 2026) |
| Vozy mají vlastní síť – nevyjedou prudký svah, vyjezdí serpentiny a vlastní cesty         | Martin                |
| Tesař vyrábí vozy, dřevěné nářadí (mírně celá ves) a výrazně zrychlí dřevěné části staveb | Martin                |
| Tesař nestaví specializované stavby – jen pomáhá ostatním                                 | Martin                |
| Dílna tesaře jako ostatní dílny; klády, nástroje od kováře; podle potřeby a volný čas     | návrh Clauda          |
| Účinek jako meze produktivity – pokrytí tesařem u staveb, pokrytí nářadím u prací         | návrh Clauda          |
| Vůz = zásoba vsi u ohrady, táhnou ho voli ze spřežení (ve dny orby orají)                 | návrh Clauda          |
| Sklon ve směru jízdy s mezí (serpentiny vzniknou samy); les jen po cestě; lávka jen pěší  | návrh Clauda          |
| Vyjetá cesta = pevná cesta s příznakem vozová z ročního provozu vozů                      | návrh Clauda          |
| Most zatím ne – vůz přejede potok brodem nebo po hati                                     | Martin (19. 10. 2026) |
| Jeden vůz na spřežení                                                                     | návrh Clauda          |
| Dva vozy z 0 A.D. – dvoukolák (základní) a čtyřkolák (víc nákladu, obchod)                | Martin (19. 10. 2026) |
| Fáze 1: čísla podle rešerše, pořadí práce tesaře, pokrytí tesařem z vedení party          | návrh Clauda          |
| Čtyřkolák navíc k dvoukolákům, jen s hotovou stezkou; vůz slouží 10 let                   | návrh Clauda          |
| Vůz za den = 8 nosičů se 2 lidmi; odnos snopů, čtvrtina seče, polovina dovozu klád        | návrh Clauda          |
| Dosah vozu jako rozhraní; fáze 1 zástupně rovně po louce, bez lesa a vody, sklon do 12 %  | návrh Clauda          |
