# Krajina sídla

Stav: schváleno 16. 10. 2026.

## Proč

Hráč začíná budováním vesnice a vesnice stojí v krajině. Krajina určuje, kde a jak se dá
hospodařit – kde je voda, les a dobrá půda. Je to první věc, kterou hráč ve hře uvidí, a základ,
na který se později přidávají další prvky (černozem, naleziště kovů, obchodní stezky, řeky).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** po prvním vstupu do hry hráč uvidí vlastní vygenerovanou 3D krajinu – mírně zvlněnou,
  s loukami, spoustou lesa a zdrojem vody – a může si ji prohlížet (posun, přiblížení, otáčení).
- **Cíl:** všechny startovní krajiny jsou srovnatelně dobré.
- **Ne-cíl (teď):** stavění, pole, kácení, přejíždění mezi sídly, bonusové prvky, roční období
  ve vzhledu, den a noc, ovládání na dotykových zařízeních.
- **Anti-cíl:** krajina, ve které se nedá rozumně založit vesnice (bez vody, bez roviny s dobrou
  půdou), nebo krajina výrazně horší než u ostatních hráčů.
- **Anti-cíl:** „slepený“ vzhled z modelů různých stylů.

## Pojmy

- **Sídlo (aglomerace)** – vesnice, hradiště, tvrz, hrad, město. Každé sídlo má **vlastní
  krajinu jako samostatný ostrov** – krajiny spolu geometricky nesouvisí. Hráč vidí vždy jen
  krajinu sídla, ve kterém se právě nachází; mezi sídly bude později přejíždět.
- **Zatím** má hráč jediné sídlo. Vznikne automaticky při prvním vstupu na herní plochu a ještě
  nemá založenou vesnici – je to jen krajina.
- **Krajina** – čtvercová mřížka **128 × 128 políček**, políčko ≈ 15 m, celkem ≈ 1,9 × 1,9 km
  (katastr vesnice). Každé políčko má:
  - **výšku** (metry, relativně k nejnižšímu místu krajiny),
  - **povrch:** `water` (voda), `forest` (les), `meadow` (louka),
  - **úrodnost půdy** 0–100.
- **Orná půda není povrch.** Pole založí hráč až s vesnicí; krajina nese jen úrodnost. Les
  i louka mají úrodnost – i les se dá později vyklučit na pole.

## Generování

- **Čistá funkce v doméně** (`packages/game/src/domain/landscape/`): `generateLandscape(seed)`
  → krajina. Stejný seed dává vždy stejnou krajinu. Pouze vlastní deterministický generátor
  náhodných čísel ze seedu – žádné `Math.random()` (hlídá ESLint).
- **Ukládá se jen seed a verze vrstev**, ne celá krajina. Pozdější změny (pole, vykácený les)
  budou samostatná data nad vygenerovanou krajinou.
- **Vrstvy:** generování je rozdělené na vrstvy, každá s vlastním seedem odvozeným z hlavního
  a vlastní verzí: **terén a voda → vegetace → úrodnost**, později bonusové vrstvy (černozem,
  naleziště, stezky, řeky). Díky tomu půjde po spuštění přidat novou vrstvu i do existujících
  krajin, aniž by se jim změnil terén.
- **Verze vrstev:** do ostrého spuštění se generátor smí měnit libovolně (krajiny se prostě
  vygenerují znovu jinak). Po spuštění nesmí změna existující vrstvy přepsat stávající krajiny –
  u sídla se ukládají verze vrstev (např. `{ terrain: 1, vegetation: 1, fertility: 1 }`) a nová
  verze vrstvy platí jen pro nová sídla; nové vrstvy lze doplnit všem.
- **Výška:** vrstvený šum (několik oktáv), mírné zvlnění. Převýšení v rámci krajiny ≈ 10–40 m,
  žádné útesy.
- **Voda:** potok, který krajinou protéká od jednoho okraje k druhému po spádu terénu (koryto se
  do terénu mírně zahloubí). Volitelně malý rybník v prohlubni. Vždy aspoň jeden zdroj vody.
- **Les:** většina plochy (≈ 55–70 %), v souvislých celcích, ne roztroušených tečkách.
- **Louky:** zbytek – hlavně v nivě podél potoka a na rovinách.
- **Úrodnost:** nejvyšší na rovinách v rozumné vzdálenosti od vody, nižší na svazích a vršcích,
  nízká na podmáčených místech těsně u vody.
- **Srovnatelnost = pásmo, ne jen minimum.** Startovní krajiny mají být podobně dobré – nikdo
  nesmí dostat výrazně víc než ostatní (rozdíly přijdou později přes bonusové vrstvy). Každá
  krajina musí padnout do pásma:
  - voda vede od okraje k okraji (potok), případně doplněná rybníkem,
  - les tvoří 55–70 % plochy,
  - **místo pro vesnici:** souvislá rovinatá **louka** (ne les – klučení bude něco stát)
    s úrodností ≥ 60 o velikosti **400–1 200 políček** (≈ 9–27 ha), celá do ≈ 300 m od vody,
  - celkový počet úrodných políček (≥ 60) v krajině **3 800–5 200** (±15 % kolem mediánu
    naměřeného na 500 seedech) – krajiny se liší vzhledem, ne hodnotou,
  - převýšení nepřekročí 40 m.

  Generátor má pásmo **cíleně trefovat** (tvarovat terén a vegetaci kolem zvoleného místa pro
  vesnici), ne jen náhodně zkoušet; pokud krajina nevyhoví, zkusí další odvozený seed
  (deterministicky: seed, seed+1, …), ale počet pokusů má být v praxi malý a změřený.
  Čísla jsou výchozí a laditelná; důležité je, že dolní i horní meze ověřuje kód a testy.

  **Naměřeno (300 seedů, v1):** 97 % krajin projde pásmem na první pokus, nejvýš 2 pokusy;
  jeden pokus trvá průměrně ≈ 48 ms. Místo pro vesnici 453–609 políček, les 58–66 %,
  převýšení 16–30 m. Potok teče po spádu: dno klesá nejvýš o 0,63 m na políčko a sedla se
  prořezávají, svahy údolí stoupají nejvýš o 0,9 m na políčko. Rybník v1 negeneruje
  (volitelný prvek, zatím jen potok). Měření:
  `npx tsx packages/game/scripts/measure-landscapes.ts 500`.

- **Generuje server.** Klient dostane hotová data krajiny (výšky, povrch, úrodnost), ne seed.
  Herní logika tak vždy vychází z dat serveru a rozdíly v počítání s desetinnými čísly mezi
  prohlížeči nehrají roli. Cíl velikosti přenosu: řádově stovky kB po kompresi, ne MB.

## Uložení a herní akce

- **Tabulka `settlement`:** id, vlastník (ID hráče z přihlašování), seed krajiny, verze
  vrstev, čas vzniku. Do budoucna přibude typ sídla a stav (nezaložené / vesnice / …).
- **Use-case „vstup do hry“** (`packages/game/src/application/`): když hráč nemá sídlo, vytvoří
  ho s novým seedem; jinak vrátí stávající. Vrací sídlo a jeho vygenerovanou krajinu.
  - Porty: repozitář sídel, zdroj nových seedů (náhoda zvenku, ne z domény).
  - Souběžné požadavky (dvě karty při prvním vstupu) nesmí vytvořit dvě první sídla.
- **Adaptér:** Drizzle repozitář v `packages/db/src/adapters/`, migrace přes `db:generate`.
- Přihlašování zůstává mimo hexagon – use-case dostane jen ID hráče.

## Zobrazení

- **Herní plocha `/game`** zobrazí krajinu sídla přes celé okno. Herní datum v rohu, e-mail
  a „Odhlásit“ zůstávají jako překryvná vrstva.
- **Babylon.js** (`@babylonjs/core` + `@babylonjs/loaders` pro glTF), bez React wrapperu.
- **WebGPU se záložním WebGL 2:** při startu se zjistí, zda prohlížeč umí WebGPU
  (`WebGPUEngine.IsSupportedAsync`), a podle toho vznikne `WebGPUEngine`, nebo `Engine`
  (WebGL 2). Hra musí běžet i v prohlížečích bez WebGPU (Firefox na Macu a Linuxu) – proto žádné
  compute shadery. Vlastní materiály (voda, barvení terénu, později roční období) přes **Node
  Material**, který generuje shadery pro WebGPU i WebGL.
- **Velikost stahování:** importovat jen používané moduly Babylonu (ne celý balík), 3D část
  načítat až na herní ploše (ne na úvodní stránce a přihlášení).
- **Hranice React ↔ Babylon:** 3D scéna je obyčejná TypeScript třída bez Reactu (adaptér
  zobrazení). React komponenta herní plochy jen vytvoří plátno a scénu, předá jí data a poslouchá
  její události, při odchodu ze stránky scénu i engine uvolní:
  - **dovnitř scény:** data krajiny (později stavby, roční období z kalendáře, režim umisťování
    stavby),
  - **ven ze scény:** políčko pod kurzorem (později kliknutí na políčko či stavbu).
- **Rozhraní nad scénou je React (HTML), ne Babylon GUI:** datum, e-mail a „Odhlásit“, info
  o políčku, později suroviny, nabídky a dialogy – texty, formuláře a budoucí překlady se tak
  řeší jednou, stejně jako ve zbytku webu.
- **Server stránky předá data krajiny**, klientská komponenta je pošle scéně.
- **Terén:** jedna síť z výškové mapy, povrch míchá textury trávy, lesní půdy, břehu a bahna
  (z 0 A.D., CC BY-SA 3.0). **Voda:** hladina v hladkém korytě potoka.
- **Stromy a další objekty jsou 3D modely** (glTF/GLB) – grafika z **0 A.D.** (Wildfire Games,
  CC BY-SA 3.0, Martinova volba), jednotný styl s texturami terénu, smí do veřejného repa
  s uvedením autora. Dřeviny: smrk, dub, buk, bříza (každá ve dvou podobách), natočení
  a velikost odvozené ze seedu, výš převažují smrky. Jednotlivé stromy jen na okraji lesa
  (1.–2. řada), vnitřek lesa je plocha korun s texturou vyrenderovanou shora ze stejných
  stromů. Vykreslování instancované (thin instances). Modely v `apps/web/public/models/`,
  licence v `apps/web/public/models/LICENSES.md`, převod z 0 A.D. v `tools/blender/`.
- **Kamera** jako v AoE2 – perspektiva šikmo shora (≈ 45°). Ovládání myší: táhnutí levým
  tlačítkem = posun, kolečko = přiblížení (s limity, nesmí se dostat pod terén ani daleko od
  krajiny), táhnutí pravým tlačítkem = otočení kolem svislé osy. Klávesnice: WASD/šipky = posun,
  Q/E = otočení.
- **Info o políčku pod kurzorem:** povrch a úrodnost – pomůže hráči plánovat, kde založit
  vesnici.
- **Výkon:** plynule (≈ 60 fps) na běžném notebooku; krajina se zobrazí do ≈ 2 s od načtení
  stránky. Generování ze seedu musí být rychlé (cíl desítky ms); případně si server hotovou
  krajinu drží v paměti.

## Testy

- **Doména:** stejný seed → shodná krajina, jiný seed → jiná; na stovkách seedů splněny dolní
  i horní meze srovnatelnosti; voda souvislá od okraje k okraji; podíl lesa v rozsahu; změna
  seedu vegetace nezmění terén (nezávislost vrstev).
- **Use-case** s in-memory repozitářem: první vstup vytvoří sídlo, další vrátí totéž; souběžné
  první vstupy vytvoří jen jedno.
- **Adaptér** proti databázi `bohemia_test`.
- **E2E:** po přihlášení se na `/game` vykreslí 3D plátno a info o políčku reaguje na kurzor.
  Vzhled se ověřuje ručně (screenshot).

## Rozhodnutí

| Rozhodnutí                                                                | Kdo                            |
| ------------------------------------------------------------------------- | ------------------------------ |
| Každé sídlo má vlastní krajinu jako samostatný ostrov                     | Martin                         |
| Krajina ve 3D, vzhled jako AoE2: mírně zvlněná, louky, hodně lesa, potok  | Martin                         |
| Objekty jako 3D modely – stažené nebo vytvořené přes Blender MCP          | Martin                         |
| Startovní krajiny srovnatelně dobré, rozdíly později přes bonusové prvky  | Martin                         |
| Krajina vzniká se sídlem, kamera šikmo shora s posunem a přiblížením      | návrh Clauda, Martin potvrdil  |
| Orná půda jako úrodnost terénu, pole až s vesnicí                         | návrh Clauda                   |
| Mřížka 128 × 128 po 15 m, ukládá se jen seed a verze vrstev               | návrh Clauda                   |
| Generuje server, klient dostane hotová data                               | návrh Clauda                   |
| Srovnatelnost jako pásmo (dolní i horní meze), místo pro vesnici je louka | návrh Clauda (z „srovnatelně“) |
| Generování po vrstvách s vlastními verzemi                                | návrh Clauda                   |
| Babylon.js (WebGPU se záložním WebGL 2)                                   | Martin                         |
| Scéna jako samostatná třída bez Reactu, rozhraní nad ní v Reactu (HTML)   | návrh Clauda                   |
| Grafika terénu a stromů z 0 A.D. (CC BY-SA 3.0)                           | Martin                         |
| Ovládání kamery (myš + WASD/Q/E), info o políčku pod kurzorem             | návrh Clauda                   |

## Stav implementace (v1)

- Modely stromů: **0 A.D.** – 2× smrk, dub, buk, bříza; smrky ve scéně dobarvené do modrozelena.
- Scéna se kreslí jen při změně pohledu (statická krajina nezatěžuje počítač).
- Terén je ve scéně vizuálně převýšený (`HEIGHT_SCALE = 3`); laditelné spolu se vzhledem.

## Necháno na staviteli

Konkrétní šumový algoritmus a jeho parametry, barvy terénu, osvětlení, formát přenosu dat krajiny, způsob zajištění jediného prvního sídla,
přesné rozmístění stromů v rámci políčka (stačí odvodit z polohy políčka), horní mez
celkové úrodnosti podle měření.
