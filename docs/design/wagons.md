# Vozy a tesař

Stav: **schváleno** (Martin, 19. 10. 2026: „Ano, schvaluji“). Co řekl Martin, je u bodu označeno;
ostatní je návrh Clauda. Čísla s poznámkou „rešerše“ se před implementací ověří v
`docs/design/research/` (vzor: [řemesla](crafts.md) – Meze produktivity).

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
