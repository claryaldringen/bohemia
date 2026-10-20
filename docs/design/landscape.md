# Krajina sídla

Stav: schváleno 16. 10. 2026, víc kvalitní louky kolem vsi 18. 10. 2026 (vegetace a úrodnost 2),
skály u potoka a ostrožny 20. 10. 2026 (terén 2 a vrstva překážek 2 – [Skály u potoka](#skály-u-potoka)).

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
- **Prémiový průchod** ([premium-landscapes.md](premium-landscapes.md) – Generátor): typ prémie
  lidského hráče je třetí vstup generátoru vedle seedu a verzí vrstev. Průchod typu upraví vrstvy
  průměrné krajiny vlastním seedem (náhoda vrstev se nepřelosuje) a prvky typu (naleziště, brod,
  průsmyk…) se z hotové krajiny počítají stejně na serveru i v prohlížeči. Verze průchodu se
  ukládá ve verzích vrstev (`premium`, chybí = 1 – návrh Clauda); krajina bez typu se nemění.
  Pásmo platí i pro prémiovou krajinu a navíc kontrola typu: prvek existuje a jeho obrys ani
  osa nezasahují do 120 m od místa pro vesnici, stezka smí vést k okraji tohoto okruhu (návrh
  Clauda).
- **Verze vrstev:** do ostrého spuštění se generátor smí měnit libovolně (krajiny se prostě
  vygenerují znovu jinak). Po spuštění nesmí změna existující vrstvy přepsat stávající krajiny –
  u sídla se ukládají verze vrstev (např. `{ terrain: 1, vegetation: 1, fertility: 1 }`) a nová
  verze vrstvy platí jen pro nová sídla; nové vrstvy lze doplnit všem. Tak se to dělá už teď:
  sídla založená do 18. 10. 2026 mají vegetaci a úrodnost 1 (`INITIAL_LAYER_VERSIONS`) a jejich
  krajina se generuje dál stejně, nová sídla dostanou verze 2 (`CURRENT_LAYER_VERSIONS`) – víc
  kvalitní louky kolem vsi. Že se původní krajina nezměnila, hlídá zlatý otisk v testech.
- **Výška:** vrstvený šum (několik oktáv), zvlněná pahorkatina – výrazné vlny ve středních
  měřítkách (stovky metrů). Převýšení v rámci krajiny ≈ 10–40 m, žádné útesy: svahy strmější
  než 2,4 m na políčko se „sesypou“ (termální eroze).
- **Voda:** potok, který krajinou protéká od jednoho okraje k druhému po spádu terénu (koryto se
  do terénu zahloubí, kolem vznikne niva). Volitelně malý rybník v prohlubni. Vždy aspoň jeden
  zdroj vody. **Potok žije** (Martin, 16. 10.): meandruje – osa je součet dvou vln (dlouhé
  16–24 a krátké 7–10 políček, amplituda 3,5–5 políček), na rovině víc, ve spádu míň (podle
  paintRiver z 0 A.D.); šířka se mění – ve spádu úzký (poloviční šířka ≈ 0,4 políčka), na
  rovině širší, a každý břeh meandruje vlastní odchylkou; **tůně** (2–4, poloměr 1,5–2,5
  políčka) v rovinách; **mělčiny a brody** (1–3) ve strmějších úsecích. Koryto se nekříží ani
  nedotýká samo sebe. Krajina nese osu potoka (`Landscape.stream`: poloha, šířka levého
  a pravého břehu, hladina, mělčina), podle ní scéna kreslí koryto, břehy a porost.
- **Les:** většina plochy (≈ 55–70 %), v souvislých celcích, ne roztroušených tečkách.
- **Louky:** zbytek – hlavně v nivě podél potoka a na rovinách.
  **Víc kvalitní louky kolem vsi** (vegetace 2, Martin – 18. 10. 2026): s dlouhým přílohem
  potřebuje rodina pole 5–6× větší, než oseje, a v1 měla do 600 m od místa pro vesnici jen
  ≈ 35 ha luk (≈ 14 ha s úrodností ≥ 60) – louky došly už u dvou domácností. Martin zvolil
  dlouhý příloh nechat, růst mýcením lesa a dát víc dobré louky (Březno mělo ≈ 180 ha,
  z toho 50–60 ha velmi dobré půdy hned u sídla). Do 600 m od místa pro vesnici je proto
  **≈ 60 ha louky** (cíl 58–62 ha), hlavně **lužní louky v nivě potoka** a roviny u vody
  (obě strany potoka), okraje se vlní podle šumu a v loukách zůstávají háje. Podél zbytku
  potoka se úseky volné nivy střídají s úseky, kde les sahá k vodě. Suché louky na vršcích
  jsou až za loukami vsi a je jich méně – doplní jen podíl lesa, který zůstal stejný. Les
  zůstává na svazích údolí, na vršcích a dál od vsi.
- **Úrodnost:** nejvyšší na rovinách v rozumné vzdálenosti od vody, nižší na svazích a vršcích,
  nízká na podmáčených místech těsně u vody. **Úrodnost 2** (s vegetací 2): naplaveniny
  v nivě (nízko nad potokem, do ≈ 16 políček od vody) přidají až 10, úplná rovina u vody až 6,
  podmáčený břeh je méně chudý (38 místo 30); základ mimo nivu je o 5 nižší (80 místo 85), takže
  nejlepší půda je v nivě a na rovinách a půda na svazích údolí je na hranici 60. Výška nad
  potokem se počítá od dna nejbližšího vodního políčka (`floodplain.ts`).
- **Srovnatelnost = pásmo, ne jen minimum.** Startovní krajiny mají být podobně dobré – nikdo
  nesmí dostat výrazně víc než ostatní (rozdíly přijdou později přes bonusové vrstvy). Každá
  krajina musí padnout do pásma:
  - voda vede od okraje k okraji (potok), případně doplněná rybníkem,
  - les tvoří 55–70 % plochy,
  - **místo pro vesnici:** souvislá rovinatá **louka** (ne les – klučení bude něco stát)
    s úrodností ≥ 60 o velikosti **400–1 200 políček** (≈ 9–27 ha), celá do ≈ 300 m od vody,
  - celkový počet úrodných políček (≥ 60) v krajině **3 600–4 850** (p5 a p95 z 500 seedů
    s rezervou; zvlněnější terén má víc svahů, a tak méně úrodné půdy než dřívějších
    3 800–5 200) – krajiny se liší vzhledem, ne hodnotou,
  - převýšení nepřekročí 40 m.

  **Pásmo verze 2** (vegetace a úrodnost 2 – `BAND_V2` v `band.ts`, pásmo se vybírá podle verzí
  vrstev): voda, les 55–70 % a převýšení stejně; místo pro vesnici **600–1 400 políček**
  (lužní louky se napojí na mýtinu vsi), úrodných políček v krajině **2 550–3 800** (nižší
  základ úrodnosti mimo nivu) a nově **louka do 600 m od místa pro vesnici 2 500–2 850 políček**
  (≈ 56–64 ha), **z toho s úrodností ≥ 60 1 300–1 800** (≈ 29–40 ha). Meze jsou z měření na
  500 seedech (p1/p99 s rezervou). Pásmo verze 1 platí dál beze změny pro sídla s verzí 1.

  Generátor má pásmo **cíleně trefovat** (tvarovat terén a vegetaci kolem zvoleného místa pro
  vesnici), ne jen náhodně zkoušet; pokud krajina nevyhoví, zkusí další odvozený seed
  (deterministicky: seed, seed+1, …), ale počet pokusů má být v praxi malý a změřený.
  Čísla jsou výchozí a laditelná; důležité je, že dolní i horní meze ověřuje kód a testy.

  **Naměřeno (500 seedů, v1 se zvlněným terénem a meandry, 16. 10.):** 96,6 % krajin projde
  pásmem na první pokus, nejvýš 3 pokusy; jeden pokus trvá průměrně ≈ 37 ms. Místo pro
  vesnici 433–656 políček, les 58–66 %, převýšení 17–29 m, klikatost potoka (délka osy /
  přímá vzdálenost) medián ≈ 1,4. Potok teče po spádu: dno klesá nejvýš o 0,63 m na políčko,
  leží pod nejnižším terénem v okolí osy (meandr vybočený na svah nevisí nad nivou), sedla se
  prořezávají, svahy údolí stoupají nejvýš o 0,9 m na políčko. Rybník v1 negeneruje
  (volitelný prvek, zatím jen potok). Měření:
  `npx tsx packages/game/scripts/measure-landscapes.ts 500` (s argumentem `initial` měří
  verze vrstev sídel založených do 18. 10. 2026).

  **Naměřeno pro verzi 2 (500 seedů, 18. 10.):** 96,0 % krajin projde pásmem na první pokus,
  nejvýš 2 pokusy (důvody neúspěchu: úrodná louka u vsi nad 40 ha, úrodných políček v krajině
  nad mez); jeden pokus ≈ 32 ms (verze 1 na stejném stroji ≈ 22–26 ms). U přijatých krajin je
  do 600 m od místa pro vesnici **60 ha louky** (p10 58,8 – p90 61,5; v1 36 ha, p10 32 – p90 40),
  **z toho 34,5 ha s úrodností ≥ 60** (p10 32,3 – p90 38,3; v1 14 ha, p10 12 – p90 17), průměrná
  úrodnost luk u vsi ≈ 56 (v1 ≈ 45). Podíl lesa se nezměnil: 58–66 %, medián 62 %. Místo pro
  vesnici 649–1 242 políček. Vrstva překážek má o ≈ 3 % méně kusů (víc louky, méně lesa u vsi).

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
  (z 0 A.D., CC BY-SA 3.0). Louky podle tvaru terénu (Martin): na prudkých svazích a ostrých
  hřbetech vystupuje skála – kamenitá půda a skalní výchozy (jako útesy 0 A.D. podle sklonu),
  svahy ke slunci mají sušší trávu, jinde ostrůvky kvetoucí louky; v loukách keře kolem
  osamělých stromů a v ostrůvcích. Jen vzhled – herní data se nemění. **Voda:** hladina
  v hladkém korytě potoka.
- **Stromy a další objekty jsou 3D modely** (glTF/GLB) – grafika z **0 A.D.** (Wildfire Games,
  CC BY-SA 3.0, Martinova volba), jednotný styl s texturami terénu, smí do veřejného repa
  s uvedením autora. Dřeviny lesa: dub, buk, bříza a jedle (modely `spruce-*` jsou jedle z 0 A.D.),
  každá ve dvou podobách, natočení a velikost odvozené ze seedu. Skladba podle středověkého
  lesa pahorkatiny (Martin): okraj světlomilný – dub 45 %, bříza 25 %, buk 25 %, jehličnan
  nejvýš 5 %; uvnitř buk 35 %, dub 30 %, bříza 10 %, jedle 10–25 % podle výšky ve skupinách;
  přechod plynule 10–30 m od hranice. Hranice lesa je ve scéně vyhlazená a zvlněná (herní data
  políček se nemění). **Okraj lesa tvoří 2–3 řady 3D stromů** (Martin), před nimi řidší lem
  a ojedinělé stromy v louce (mimo okolí místa pro vesnici). **Stromy mimo les** (Martin):
  v loukách osamělé mohutné duby a jilmy, jednotlivě i ve skupinkách – někde parková louka,
  jinde rozlehlá volná plocha; podél potoka břehový porost topolů a jilmů s mezerami (olše
  v 0 A.D. chybí). Na skalách a suchých hřbetech borovice (reliktní bory; přímořská borovice
  z 0 A.D. vypadá jako naše borovice lesní), před lesem skupinky mladých stromků (louka zarůstá),
  na okraji lesa souše a padlé stromy, u lesa poblíž vesnice pařezy, v klidné vodě kmeny.
  Herní data políček se nemění; rozmístění stromů je vrstva překážek (viz Stav implementace).
  **Vnitřek lesa tvoří impostory**
  – obrázky týchž stromů vyrenderované pod pevným náklonem kamery (kamera se otáčí jen kolem
  svislé osy, takže obrázek sedí z každého směru); jejich začátek zakrývají řady 3D stromů.
  V lese je tráva (ne hrabanka – Martin), pod stromy ztmavená. Mezery hluboko v lese vyplňuje
  tmavá plocha korun. Vykreslování instancované (thin instances). Modely v `apps/web/public/models/`,
  licence v `apps/web/public/models/LICENSES.md`, převod z 0 A.D. v `tools/blender/`.
- **Kamera** jako v AoE2 – perspektiva šikmo shora (≈ 45°). Ovládání myší: táhnutí levým
  tlačítkem = posun, kolečko = přiblížení (s limity, nesmí se dostat pod terén ani daleko od
  krajiny), táhnutí pravým tlačítkem = otočení kolem svislé osy. Klávesnice: WASD/šipky = posun,
  Q/E = otočení. **Přiblížení jako v 0 A.D.** (Martin): výchozí 120 m od cíle, nejblíž 50 m,
  zorný úhel 45°; nejdál 1,4 km, aby šla přehlédnout celá krajina.
- **Info o políčku pod kurzorem:** povrch a úrodnost – pomůže hráči plánovat, kde založit
  vesnici.
- **Zvuky krajiny** (Martin, podle 0 A.D.): ptáci letního dne všude (stejná stopa jako ambient
  v 0 A.D.), u okraje lesa navíc zpěv ptáků, v lese a u něj vítr v listí, potok jen tam, kde
  teče přes oblázky (Martin) – nad bahnem, pískem a v tůních je tichý; mírný proud a prudká
  peřej se prolínají podle rychlosti. Hlasitost podle toho, kam se kamera dívá:
  zdroje v záběru, blíž = hlasitěji (jako 0 A.D. ∝ 1 / vzdálenost), při oddálení vše tišší, ale
  ptáci nezmizí. Zvuk začne po prvním kliknutí (pravidlo prohlížečů), přepínač vpravo nahoře si
  volbu pamatuje. Zvuky z 0 A.D. (CC BY-SA 3.0, Wildfire Games), licence a původní soubory
  v `apps/web/public/audio/LICENSE.md`, převod `tools/audio/ambient.sh`.
- **Zvířata** (Martin, podle 0 A.D.): v tůních a klidné vodě krouží hejna ryb (občas některá
  vyskočí nad hladinu), nad loukami u lesa krouží hejna vran a výš jedno káně. **Jen ozdoba** –
  žádná herní mechanika; lov, rybolov a chov zvířat se navrhnou později. Hýbou se jen v záběru
  (jako voda), při omezeném pohybu stojí. Modely z 0 A.D. (CC BY-SA 3.0, Wildfire Games),
  licence v `apps/web/public/models/fauna/LICENSES.md`.
- **Výkon:** plynule (≈ 60 fps) na běžném notebooku; krajina se zobrazí do ≈ 2 s od načtení
  stránky. Generování ze seedu musí být rychlé (cíl desítky ms); případně si server hotovou
  krajinu drží v paměti.

## Den a noc

Martin (19. 10. 2026): „A pokud tedy den trvá 86 sekund, zkusil bys tam přidat i pohyb slunce po
obloze a tím pádem i noc?“ – a k návrhu níž: „Ok, uděláme to, jak říkáš.“

Herní den trvá ve skutečném čase ≈ 86 s, hodina dne je část dne, která od jeho začátku uplynula
(`realTimeOf` – `dayHourAt` v `apps/web/lib/scene/day-light.ts`). Jen vzhled, žádná pravidla.

**Návrh (schválený; podrobnosti návrh Clauda):**

1. **Délka dne podle ročního období** jako v Čechách (50° s. š.): v létě světlo ≈ 16 h, v zimě
   ≈ 8 h. Slunce jde po obloze podle dne v roce a hodiny (deklinace a hodinový úhel – jednoduchý
   astronomický výpočet, pravý sluneční čas). Ve scéně je dráha stylizovaná: slunce v poledne
   referenčního dne svítí přesně jako dřív (`SUN_DIRECTION`, výška ≈ 34,5°), skutečná výška se
   na výšku ve scéně převádí měkce (na obzoru 8°, výš se sbíhá k 34,5° – krajina je laděná na
   nízké slunce) a dráha je otočená kolem svislé osy tak, aby poledne svítilo ze směru
   `SUN_DIRECTION`. V zimě je polední slunce níž (stíny delší).
2. **Svítání a soumrak** trvají pár sekund skutečného času (od výšky slunce 10° po plnou noc
   −12° v létě ≈ 10 s): zlatá hodinka (teplé slunce, opar do zlatova), západ (silné nízké
   zlatavé slunce – na sněhu broskvový až zlatý nádech, modrofialové stíny), soumrak (šero se
   studeným modrým světlem, u obzoru oranžovorůžová obloha a hustší teplý opar, zem méně sytá
   a čitelná), modrá hodinka, noc. Fáze se míchají podle skutečné výšky slunce; ráno je navíc
   hustší opar. Druhé kolo ladění (19. 10. 2026): soumrak byl hnědý „bahnitý“, zimní západ
   růžový jako omítka a letní noc do tyrkysova – noc má teď v létě i v zimě studenou modrou.
3. **Noc měsíčně modrá a čitelná**, ne černá – hráč v noci dál hraje (noc je každou minutu a
   půl). Hlavní světlo je v noci měsíc (vždy úplněk naproti slunci – v zimě vysoko, v létě
   nízko) se slabším stínem, obloha rozptýlí modré světlo a obraz dostane filtr jako ve filmu
   („day for night“ – `ColorCurves` zpracování obrazu: zmodrá a ztratí sytost; samotné modré
   světlo zelenou trávu jen ztmaví). Slunce dosvítí ještě kus pod obzorem (do −3,5°, síla
   slábne ≈ 2 s) a na měsíc se přepne, když hlavní světlo nesvítí – bez skoku.
4. **Materiály bez světla** (impostory se světlem zapečeným v atlasu, dým) se v soumraku a v noci
   jen přibarví a ztmaví tónem (podíl osvětlení roviny teď a v poledne) – atlas se
   nepřekresluje. Voda odráží barvu oblohy fáze, třpytí se v barvě slunce nebo měsíce; opar
   a pozadí (obloha) jdou s fází.
5. **Roční období se s denní dobou skládají:** přes den platí světlo ročního období beze změny
   (`season-look.ts`), denní doba ho jen přebarví a ztlumí; sníh, led a listí se nemění.

**Fáze 1 (hotovo 19. 10. 2026):** jen vývojový náhled `/dev/landscape` – posuvník „Hodina“
(0–24 h, s výškou slunce), „▶ Přehrát den“ (den za ≈ 86 s, i spolu s „přehrát rok“) a „Bez
denní doby“. Hra `/game` zůstává beze změny – pevné odpolední slunce a světlo ročního období.
**Do hry až po Martinově schválení vzhledu.**

**Fáze 2 (až po schválení):** hra dostane hodiny dne ze světa (`setDayClock` s `dayHourAt`;
filtr obrazu zapnout hned při vytvoření scény, ať se shadery nepřekládají za hry); v noci lidé
jdou domů (postavy z polí k domům), z dýmníků dým, z domů prosvítá oheň, zvířata u domů a
v ohradách – `DayLight.night` (0–1) je k tomu připravené. Zvuky noci (cvrkot, sova, ticho ptáků)
později.

**Výkon:**

- Světlo se při pohybu přepočítá 10× za sekundu (`DAY_LIGHT_MS`, slunce se mezi tím pootočí
  o méně než půl stupně) a scéna se překreslí jen při znatelné změně – v taktu animací, na
  pozadí a v nečinnosti méně, ve skryté záložce vůbec; při omezeném pohybu po krocích jednou za
  sekundu. Výpočet světla ≈ 0,1 ms.
- **Stínová mapa** (4096², celá krajina, ≈ 7,7 M trojúhelníků vrhačů) se obnoví, až se směr
  světla od posledního vykreslení mapy pootočí o 1,5° (`SHADOW_STEP_DEG` – stín 25m stromu
  poskočí o ≈ 1 m); při přehrávání dne ≈ 2× za sekundu. Osvětlení se mění plynule, stíny mezi
  obnovami čtou matici, se kterou se mapa kreslila (nesjedou od stromů). Když stíny nejsou vidět
  (soumrak, slunce těsně nad obzorem), mapa se neobnovuje a obnoví se, až budou. Jedno vykreslení
  mapy stojí na Apple M1 Pro ≈ 6–9 ms (WebGL 2 přes Metal, s čekáním na GPU), CPU záznamu ≈ 1 ms;
  běžný snímek ≈ 3–4 ms. Mapa jen „kolem kamery“ by levnější nebyla: Babylon vrhače do stínové
  mapy neořezává, vrcholů by bylo stejně (výřez kolem kamery by potřeboval vlastní ořez instancí
  po čtvercích jako `scenery-culling.ts` – námět, kdyby obnova na slabších GPU drhla).
- Vývojový ukazatel výkonu ukazuje obnovy stínové mapy za sekundu a CPU jednoho vykreslení.

## Skály u potoka

Martin (20. 10. 2026):

> „Chtěl bych si ještě pohrát s krajinou. Měli bychom přidat nějaké skály. Např potok, když velmi
> prudce mění směr jako tady ([snímek: potok, který se v lese stočí skoro v pravém úhlu]) tak by to
> v přírodě nejspíš neudělal, kdyby tam netrčela nějaká skála. Tam kde je naopak oblouk větší, tak
> to bývá na skálu vymleté na vnější straně toho oblouku. Koukni se na mapu, jak třeba vypadá údolí
> Berounky.“

> „Vlastně mě k těm potokům napadá ještě něco. Koukni se na pravěká a slovanská hradiště v Čechách
> a na Moravě. Většinou se nacházela na nějakém vhodném ostrohu. Potok by měl být schopný takový
> ostroh vytvořit.“

Na doplňující otázky: **jen nová sídla** – Vlkov a uložená sídla zůstanou beze změny. Výška
skalních břehů: „Podle mě to může být různé. Koukni se na nějaké potoky v Čechách jako příklad“.
Rešerše (údolí Berounky, Prokopské údolí, Divoká Šárka, Kocába, Doubrava, hradiště na ostrožnách):
[research/2026-10-20-stream-rocks.md](research/2026-10-20-stream-rocks.md). Podrobnosti jsou
návrh Clauda, čísla v `stream-rocks.ts` (`SHARP_BEND`, `ROCK_SPUR`, `CUT_BANK`, `PROMONTORY`,
`ROCK_FREE_SITE`).

- **Ostrý ohyb = skalní ostroh.** Volný meandr má poloměr oblouku 2–3 šířky koryta; kde poloměr osy
  klesne pod **1,5 šířky koryta** a oblouk se stočí přes **50°** (`sharpBends`), potok se opírá
  o skálu. Na vnější straně ohybu – tam, kam by jinak tekl rovně – vyroste skalní ostroh **4–9 m**
  nad hladinou (víc, když je okolí vyšší): zvýšené temeno (střed ≈ 20 m za okrajem vody) a skalní stěna
  podél ohybu (± 50 m).
- **Velký oblouk = nárazový břeh.** Na vnější straně oblouků (poloměr do ≈ 10 políček, stočení od
  40°, plně od 80°) se terén u vody zvedne do strmého břehu. **Výška podle místa:** v rovině 1,5 m
  hlinitý nárazový břeh, s každým metrem, o který okolí (2–5 políček za vodou v původním terénu)
  převyšuje hladinu nad 2 m, o 0,45 m víc, nejvýš **8 m**; podél toku se mírně mění (± 15 %). Za
  stěnou je terasa, která do ≈ 75 m dozní do okolního terénu – ne val, ani schod. Vnitřní strana
  oblouku zůstane mírná s náplavem (jako dřív).
- **Skála, nebo hlína:** od stěny ≈ 2,5 m přibývá skály, od 5 m je to skalní stěna – textura skály
  na čele a horní hraně, pod čelem suťový svah (štěrk), na hraně skalní výchozy a pod stěnou suť
  (balvany, mechem porostlé kameny) ve vrstvě překážek a balvany v korytě (ozdoba vody). Nižší
  břeh je hlinitý (textura břehu).
- **Ostrožna nad zaříznutým meandrem.** Hradiště stála na ostrožnách – výběžek nad tokem se
  2–3 prudkými stranami a úzkou šíjí (Levý Hradec, Tetín, Budeč, Libušín, sv. Hypolit); vzniká na
  soutoku nebo v jádru zaříznutého meandru. Krajina má jeden potok, a tak hra dělá jádro meandru:
  potok se zařízne smyčkou tvaru Ω (poloměr osy 5–6,2 políčka, ramena u šíje 5,6–6,4 políčka od
  sebe) do návrší a uprostřed zůstane ostrožna – plocha nahoře **0,7–1,4 ha** (rovná, jen
  s původním zvlněním), **8–12 m** nad potokem, ze 2–3 stran prudké svahy a skalní stěny, na jedné
  straně šíje – nahoře 35–50 m široká. Vnější strana smyčky je skalní stěna (nárazový břeh), strana
  ostrožny mírnější svah. Okolí smyčky se srovná do výšky plochy a za ≈ 135 m dozní do původního
  terénu (návrší, do kterého se meandr zařízl). **Jen kde to terén dovolí** – okolí smyčky je
  v původním terénu aspoň 8 m nad potokem, úsek trasy je skoro rovný, bez tůní a brodů, daleko
  od místa pro vesnici, od okrajů mapy i od ostatních částí potoka – vychází na **≈ 1 z 7–8 map**
  (13,5 % přijatých krajin). Ostrožna je zvláštní místo, ne na každé mapě.
- **Data ostrožny** (pro budoucí hradiště a zvláštní místa krajiny, zatím bez herní funkce):
  `Landscape.promontories` / `promontoriesOf(landscape)` – druh (`kind: 'meander'`; soutok
  a vyvýšenina nad brodem přibudou s dalšími toky), obrys plochy nahoře (políčka), šíje (dva body
  napříč nejužším místem), střed, výška nad potokem a plocha. Krajina terénu 1 ostrožny nemá.
- **Co se nemění:** osa potoka, šířky, hladina, brody a tůně jsou stejné jako v terénu 1 (bez
  ostrožny bit po bitu – výšky jen přibudou, nejnižší místo krajiny zůstane), vodní políčka i jejich
  dno, skála do koryta nezasáhne (čelo stěny začíná přesně na okraji vody). Smyčka ostrožny
  nahradí jen úsek bez tůní a brodů. **Místo vsi a louky u vsi skály nezaberou:** do 450 m od
  místa pro vesnici žádné skály, plně až od 630 m; střed ostrožny nejméně 660 m od vsi, trasa pod šíjí nejméně 480 m.
- **Herní důsledky** stávajícími mechanismy: skalní výchozy jsou překážky (stavět ani zakládat pole
  na nich nejde), prudký svah blokuje pole a pastvu, pěšiny ho obcházejí (cena chůze podle sklonu),
  vozová síť nevyjede nad 10 %.
- **Data a scéna:** výška stěny u každého bodu osy (`StreamPoint.bankLeft` / `bankRight`, m nad
  hladinou, terén 2) – jde do prohlížeče ve Float32 s osou (`landscape-transfer.ts`), osa potoka ve
  světě ji vrací v dotazu (`StreamSample.bank`). Scéna (`render-surface.ts`) postaví čelo stěny od
  okraje vody: suťový svah do 30 % šířky čela a 20 % výšky, pak čelo (šířka 0,8 × výška, 1,5–9 m;
  na vnitřní straně oblouku – svah ostrožny – až 3× širší), nahoře drží výšku stěny a naváže na
  terén krajiny. Shadery terénu stejné – skála podle `rockinessAt` (sklon) a na stěnách textura
  skály a suti (`ground-layers.ts`). Vrstva překážek 2 (`cliff-rocks.ts`, zdroj `cliffRock`)
  přidá výchozy na hranu skalních stěn a suť pod ně; výchozy podle sklonu se do 25 m od stěn
  nekladou (zaplnily by celý pás kolem stěny).
- **Verze:** **terén 2** (skály, ostrožna) a **vrstva překážek 2** (skály a suť na stěnách) pro nová
  sídla – `CURRENT_LAYER_VERSIONS = { terrain: 2, vegetation: 2, fertility: 2, obstacles: 2 }`.
  Vegetace a úrodnost zůstaly ve verzi 2: jsou to stejné funkce, jen nad jiným terénem (jako vrstva
  překážek 1 nad vegetací 2). Vrstva překážek dostala novou verzi, protože přibyl rozmisťovač
  (pravidlo „Co vrstvu překážek mění“). Předchozí verze nových sídel jsou
  `PREVIOUS_LAYER_VERSIONS` (`{ 1, 2, 2, 1 }`), původní `INITIAL_LAYER_VERSIONS` – obě se generují
  dál bit po bitu stejně (zlaté otisky v `generate.test.ts`, `obstacles.test.ts`). Terén 2 má
  v otiscích vlastní hodnoty.
- **Pásmo srovnatelnosti** platí dál beze změny (`BAND_V2` – pásmo se vybírá podle vegetace
  a úrodnosti). Úrodných políček je o ≈ 3 % méně (skály a terasy na vnější straně oblouků),
  louky u vsi stejně.
- **Náhled:** `/dev/landscape?seed=…` (nové vrstvy), `&layers=previous` (bez skal – na stejném
  seedu), `&layers=initial`; v liště seedy s ostrožnou a tlačítko **Ostrožna** (kamera k ní,
  obrys plochy oranžově, šíje červeně).

**Naměřeno** (`measure-landscapes.ts 200`, 20. 10. 2026):

| Metrika                              | Předchozí (terén 1) | Nové (terén 2)          |
| ------------------------------------ | ------------------- | ----------------------- |
| krajiny v pásmu na první pokus       | 95,0 %              | 93,0 %                  |
| nejvíc pokusů                        | 2                   | 2                       |
| čas jednoho pokusu                   | 34,8 ms             | 39,1 ms                 |
| louka do 600 m od vsi (medián)       | 60,1 ha             | 60,1 ha                 |
| z toho úrodnost ≥ 60 (medián)        | 34,4 ha             | 34,3 ha                 |
| úrodná políčka v krajině (medián)    | 3 036               | 2 956                   |
| podíl lesa (medián)                  | 62,3 %              | 62,3 %                  |
| ostrožna                             | –                   | 13,5 % krajin           |
| plocha / výška ostrožny (medián)     | –                   | 1,06 ha / 9,8 m         |
| nejvyšší stěna na mapě (p10–p90)     | –                   | 6,3–9,7 m (max 14,6)    |
| podíl osy se stěnou nad 3 m (medián) | –                   | 10 % (s ostrožnou 34 %) |
| vrstva překážek (medián kusů, čas)   | 66 409, 248 ms      | 66 435, 247 ms          |

## Úpravy terénu (vozová cesta)

Vozová cesta ([roads.md](roads.md) – Vozová cesta; Martin, 20. 10. 2026: „Pokud budou překážet
svahy, vyhloubí se úvoz nebo udělá násep.“) je první stavba, která mění tvar terénu. Podrobnosti
návrh Clauda.

- **Krajina se nemění.** Výšky krajiny (`Landscape.heights`) zůstanou, jak je vygeneroval
  generátor. Úpravy jsou **čistá funkce stavu vsi**: stav ukládá jen profil osy vozové cesty
  (body a navržené výšky pláně na cm, brody) a úseky stavby (`VillageRoads.earthworks`), ne
  mřížku. Z nich `terrainEditsOf` / `terrainEditsFrom` (`paths/earthworks.ts`) složí úsečky pláně
  v rejstříku po 16 m a `editedHeight(edits, x, z, natural)` dá výšku v bodě: pláň 5,5 m
  v navržené výšce, za ní svah 1 : 1 k původnímu terénu (úvoz dolů, násep nahoru), dál beze změny.
  Kde se úpravy dvou cest potkají, platí bližší. Brod se neupravuje. `groundHeightAt` = upravená
  výška nad terénem krajiny – jen deterministická matematika (soubor je v deterministické vrstvě,
  hlídá ESLint), stejně na serveru i v prohlížeči.
- **Kdo je používá:** terén pěšin (`withTerrainEdits` přepočítá výšky a sklon buněk v dosahu
  úprav) – síť pěšin, vzdálenosti chůze a vozová síť (po úvozu vůz jede rovně), hledání trasy
  další vozové cesty. Sítě berou jen **hotové úseky** (síť se nepřepočítává každý den stavby),
  scéna i rozestavěný kus podle průběhu.
- **Scéna:** jemná výšková síť scény (`render-surface.ts`) se upraví stejnou funkcí nad
  vyhlazeným terénem scény (`terrain-edits.ts` – jen obdélník kolem cest a jen při změně profilu,
  ve vodě nic), síť terénu dostane nové výšky a normály (`TerrainMesh.setTerrainEdits`), pick
  terénu (`terrain-pick.ts`) jde po upravené síti. Pole, pěšiny, cesty, stromy u cest a kolíky
  se přestaví jen tam, kde se terén změnil; postavy, zvířata, vozy a stromy stojí na upraveném
  terénu (výška scény). Svahy úvozu a náspu mají obtisk holé hlíny, který za 6 let zaroste.
- **Ves bez vozové cesty** má terén bit po bitu jako dřív (bez úprav se nic nepřepočítává –
  hlídají testy).

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

| Rozhodnutí                                                                   | Kdo                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| Každé sídlo má vlastní krajinu jako samostatný ostrov                        | Martin                                          |
| Krajina ve 3D, vzhled jako AoE2: mírně zvlněná, louky, hodně lesa, potok     | Martin                                          |
| Objekty jako 3D modely – stažené nebo vytvořené přes Blender MCP             | Martin                                          |
| Startovní krajiny srovnatelně dobré, rozdíly později přes bonusové prvky     | Martin                                          |
| Krajina vzniká se sídlem, kamera šikmo shora s posunem a přiblížením         | návrh Clauda, Martin potvrdil                   |
| Orná půda jako úrodnost terénu, pole až s vesnicí                            | návrh Clauda                                    |
| Mřížka 128 × 128 po 15 m, ukládá se jen seed a verze vrstev                  | návrh Clauda                                    |
| Generuje server, klient dostane hotová data                                  | návrh Clauda                                    |
| Srovnatelnost jako pásmo (dolní i horní meze), místo pro vesnici je louka    | návrh Clauda (z „srovnatelně“)                  |
| Generování po vrstvách s vlastními verzemi                                   | návrh Clauda                                    |
| Babylon.js (WebGPU se záložním WebGL 2)                                      | Martin                                          |
| Scéna jako samostatná třída bez Reactu, rozhraní nad ní v Reactu (HTML)      | návrh Clauda                                    |
| Grafika terénu a stromů z 0 A.D. (CC BY-SA 3.0)                              | Martin                                          |
| Ovládání kamery (myš + WASD/Q/E), info o políčku pod kurzorem                | návrh Clauda                                    |
| Zvlněnější terén, meandrující potok s proměnnou šířkou, tůněmi a mělčinami   | návrh Clauda na Martinův požadavek z 16. 10.    |
| Výchozí a nejbližší přiblížení kamery jako v 0 A.D. (120 m, 50 m, 45°)       | Martin (17. 10.)                                |
| Do 600 m od vsi ≈ 60 ha louky (≈ 30 ha úrodné), lužní louky v nivě potoka    | Martin – víc kvalitní louky, 18. 10. 2026       |
| Jako nové verze vegetace a úrodnosti – stávající sídla si krajinu nechají    | návrh Clauda (podle pravidla o verzích)         |
| Den a noc: pohyb slunce podle dne v roce a hodiny, měsíčně modrá čitelná noc | Martin (19. 10. 2026), podrobnosti návrh Clauda |
| Den a noc nejdřív jen na vývojovém náhledu, do hry po schválení vzhledu      | Martin (19. 10. 2026)                           |
| Skály u potoka – ostrý ohyb o skálu, vymletý břeh na vnější straně oblouku   | Martin (20. 10. 2026)                           |
| Ostrožna, kterou vytvoří potok (místo pro hradiště)                          | Martin (20. 10. 2026)                           |
| Skály jen pro nová sídla, výška skalních břehů různá podle místa             | Martin (20. 10. 2026)                           |
| Ostrý ohyb = poloměr pod 1,5 šířky koryta a stočení přes 50°                 | návrh Clauda (rešerše)                          |
| Nárazový břeh 1,5 m v rovině až 8 m v zaříznutém údolí, skála od 2,5–5 m     | návrh Clauda (rešerše)                          |
| Ostrožna v jádru zaříznutého meandru (smyčka Ω), soutok až s druhým tokem    | návrh Clauda                                    |
| Ostrožna 0,7–1,4 ha, 8–12 m nad potokem, na ≈ 1 z 7–8 map                    | návrh Clauda (rešerše zmenšená na mapu)         |
| Kolem vsi do 450 m bez skal, ostrožna nejméně 660 m od vsi                   | návrh Clauda (místo vsi a louky u vsi)          |
| Terén 2 a vrstva překážek 2, vegetace a úrodnost beze změny verze            | návrh Clauda (podle pravidla o verzích)         |
| Balvany v korytě pod stěnou jen jako ozdoba vody, ne překážka                | návrh Clauda                                    |

## Stav implementace (v1)

- Modely stromů: **0 A.D.** – 2× jedle (`spruce-*`), dub, buk, bříza; jedle ve scéně dobarvené
  do zelena (textura má hodně hnědých větviček).
- Scéna se kreslí jen při změně pohledu (statická krajina nezatěžuje počítač).
- Terén je ve scéně vizuálně převýšený (`HEIGHT_SCALE = 3`); laditelné spolu se vzhledem.
- **Vrstva překážek (17. 10. 2026, podle fields.md – Překážky jsou herní data):** stromy
  (okraj lesa, vnitřek lesa, louky, břehy, borovice, mladé stromky), souše, padlé stromy,
  pařezy, keře, kameny, balvany a skalní výchozy už nejsou „jen vzhled scény“ – jsou to herní
  data čtvrté vrstvy `obstacles` (verze 1, seed `deriveSeed(seed, 'obstacles')`; sídla uložená
  před ní mají verzi 1 doplněnou). Vzhled zůstal: stejné rozmisťování, hustoty a skladba
  dřevin, jen náhody jsou nově ze seedu vrstvy (jednotlivé stromy stojí jinde, hustota stejná).
  Výjimka z „klient dostane hotová data“: vrstva má ≈ 65–72 tisíc překážek (≈ 470 kB po
  kompresi, krajina samotná ≈ 50 kB), a tak ji prohlížeč generuje sám stejnou funkcí ze
  stejných dat jako server – z krajiny s přesností přenosu a jen s deterministickou
  matematikou (+ − × ÷ √, žádné sin/cos/atan2/hypot, které se mezi JS enginy liší – hlídá
  ESLint); test ověřuje, že výsledek je bit po bitu shodný, **ale jen ve V8** (Node = Chrome).
  Firefox a Safari test nepokrývá – shodu tam drží jen omezení na přesně zaokrouhlované
  operace. Generování trvá ≈ 230–350 ms (stejně jako dřív rozmisťování ve scéně), na serveru
  jednou na krajinu v mezipaměti (vrstva ≈ 1,8–2,0 MB paměti, pole lesa se nedrží). Rákos,
  orobinec, lekníny, kmeny v potoce a zvířata zůstávají jen ozdobou scény. Pásmo
  srovnatelnosti se nemění.
- **Co vrstvu překážek mění** (po ostrém spuštění jen novou verzí vrstvy, zlatý otisk v testech to
  hlídá): rozmisťovače (`landscape/obstacles/`), pole lesa (`forest-field.ts`), osa potoka ve
  světě (`stream-geometry.ts`), tvar terénu (`relief.ts`, `SUN_RAYS`), `det-math.ts`,
  `transferPrecision` i přesnost kodéru ve webu (`landscape-transfer.ts`: výšky na cm, osa potoka
  ve Float32), pomocné funkce `world.ts`, `deriveSeed` a `createRandom`, verze `simplex-noise`
  (připnutá bez stříšky), číslování `OBSTACLE_SOURCES` (id) a `VILLAGE_CLEARING_TILES` – a
  samozřejmě generátor krajiny, ze které vrstva vychází. `streamCenterline` (`deriveFlow`) přitom
  řídí i vzhled vody a zvuk potoka – ladění vody přes osu potoka změní i vrstvu, vzhledovou část
  je pak třeba oddělit.
- **Verze vrstev 2 – víc kvalitní louky (18. 10. 2026):** nová sídla mají
  `{ terrain: 1, vegetation: 2, fertility: 2, obstacles: 1 }`, uložená sídla s verzemi 1 si
  krajinu nechají (sídlo nese verze i seed přijatého pokusu, pásmo se vybírá podle verzí –
  `bandFor`). Terén se nemění (stejné výšky i potok jako v1). Vrstva překážek zůstala ve
  verzi 1 – rozmisťovače jsou stejné, jen stojí na jiné vegetaci; zlatý otisk vrstvy má proto
  hodnoty pro krajinu z vrstev 1 (beze změny) i z vrstev 2. U krajin verze 2 je les od vsi dál,
  a tak je u něj méně pařezů (průměrně 6 místo 16). Zlatý otisk samotné krajiny (výšky,
  povrch, úrodnost, místo pro vesnici) hlídá obě verze v `generate.test.ts`. Vývojový náhled
  ukáže původní krajinu přes `/dev/landscape?seed=…&layers=initial` (odkaz „původní vrstvy“).

## Necháno na staviteli

Konkrétní šumový algoritmus a jeho parametry, barvy terénu, osvětlení, formát přenosu dat krajiny, způsob zajištění jediného prvního sídla,
přesné rozmístění stromů v rámci políčka (stačí odvodit z polohy políčka), horní mez
celkové úrodnosti podle měření.
