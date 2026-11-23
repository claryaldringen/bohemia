# wagons – historie (neplatné sekce)

Sem patří části [wagons.md](../wagons.md), které přestaly platit; zachované doslova. **Nic z tohoto textu neplatí** – platný stav je v wagons.md.

## Nákup u sousedů vozem

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v wagons.md:

- **Nákup u sousedů (22. 11. 2026):** Martin (19. 10. 2026): „Až bude vůz, pojedou zásoby na voze
  a ušetří se člověkodny.“ Má-li ves doma vůz s voly, kteří ten den neorají (jako svoz – ve dny
  orby a se spřežením na poli páry napřed k rádlům), a k sousedovi vede sjízdná zemská stezka, jede 15. 11. nákup u sousedů vozem jako výprava (čtyřkoláky napřed, honák a pomocník na vůz,
  opakované jízdy, menší zbytek nosiči) – jen když je to v práci levnější než nosiči. Ves bez
  tesaře si vůz koupí u souseda s tesařem, když ho chce (Kolik vozů ves chce) a má na něj vola
  (Martin 22. 11. 2026 „ano“). Pravidla, cena vozu a čísla: [crafts.md](crafts.md) – Nákup
  u sousedů, Vozy (návrh Clauda).

## Kování vozů – cesta k sousedovi (ironOptions, ironPlan, nosiči, vůz)

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v wagons.md:

- **Ves bez kováře:** syn tesaře **od 14 let** (nejstarší), jinak tesař sám, dojde do **nejbližší
  vsi s kovářem** a přinese kování:
  - ~~**druhá ves hráče na téže mapě**~~ (od 1. 11. 2026 není – jedna ves, jedna mapa) – obývané kovárny jiných vsí mapy jsou v přehledu sousedních
    vsí (`NeighbourSnapshot.smithies`, se jménem vsi); jde se krajinou rovně ke kovárně, celou cestu
    je vidět. Dny tam a zpět jako nákup u sousedů krajinou (vzdálenost × 1,5, dny jako výprava) bez
    dne za krajem mapy (2–6 dní),
  - **soused za krajem mapy** s kovářem (`neighbourCrafts` – u sousedů řemeslníků jistě) – po hotové
    zemské stezce, nebo krajinou ke kraji mapy od dílny tesaře (`purchaseRoute`).

  **Cíl a dopravu ves volí podle nejmenší práce vsi celkem** (`ironOptions`, `ironPlan`): ze všech
  vsí s kovářem (sousedé; jiná ves na téže mapě od 1. 11. 2026 není) a obou způsobů – vozem po stezce sjízdné pro vozy
  (tesař a sedlák × dny cesty), nebo pěšky s nosiči (tesař a nosiči × dny, víc cest u malé vsi) –
  ta s nejmenšími člověkodny; při shodě kratší cesta. Vozem jen s volným vozem. Proto může ves jet
  vozem k dalšímu kováři místo s nosiči k nejbližšímu. **Platba obilím** jako nákup nástrojů
  u souseda (`productPrice` – 0,96 hodnoty; 3 kg ≈ 173 kg obilí, 6 kg ≈ 346 kg) – ves zaplatí
  ze zásob hned při odchodu, ale jen když nešetří jídlem (výhled jídla do sklizně vychází); jinak
  vůz čeká. Druhá ves hráče se platbou nemění (vsi se simulují každá zvlášť). Tesař nebo syn
  **chybí v práci dílny** (i ve vsi, když tesař s domácností pracuje se vsí) a praxi ten den
  nezíská. Kdo cestou zemře nebo odejde, kování nepřinese – vůz čeká a jde jiný.

- **Kdo nese platbu** (Martin – sám 173 kg obilí neunese):
  - **vůz se sedlákem** – když ves má doma volný vůz (ne na výpravě; vůz, na který se kování dělá,
    ještě hotový není) a doma voly, kteří ho utáhnou, a cesta vede **po hotové zemské stezce
    sjízdné pro vozy** (jako vozy výprav – `trailCartPassable`). Dvoukolák napřed (jeden vůl),
    platbu unese každý vůz (400 / 800 kg). Jede s ním **sedlák z vsi** (`CART_IRON.cartCrew`)
    a tesař nebo syn; vůz i vůl jsou celou cestu pryč (`cartsAway`, `oxenAway` – vozit ani orat
    nemohou). Krajinou ke kraji mapy vůz nejede.
  - **jinak nosiči** – skupina jako nákup u sousedů (`tripOf`): tolik lidí, kolik je nákladů po
    25 kg (TRADE.porterKg), tesař nebo syn nese taky – **173 kg = tesař a 6 nosičů** (7 lidí),
    346 kg za čtyřkolák = 14 nákladů. Skupina je nejvýš malá skupina vsi (`groupCap` – polovina
    dospělých, aspoň 1, nejvýš 8); **když ves tolik dospělých nemá, jdou víckrát** – dny cesty ×
    počet cest (`IronTrip.tripDays`). Vůz pak nečeká navždy a malá ves platí časem, stejně jako
    u nákupu u sousedů.
  - Nosiči a sedlák **chybí v práci vsi po celou cestu** – jako skupiny nákupu u sousedů jdou do
    `away` v rozdělení práce dne (`ironTripHelpers`), podíl `trade` (`ironTripShares`).
  - **Rok vozů** (Kolik vozů ves chce) vidí i cestu pro kování: když by vůz ušetřil práci proti
    nejlevnější cestě pěšky, zapíše se úspora k dvoukolákům (`addCartDemand`) – i když volný vůz
    zrovna nebyl, ať si ves spočítá, že další vůz se vyplatí. Jen ves s ohradou volů.

- **Kronika a upozornění:** „Tesař šel se 6 nosiči pro kování k vozu do vsi Lhota (sever)“, „Tesař
  jel s vozem pro kování…“ (u syna „Syn tesaře šel…“), po návratu
  „Tesař přinesl kování“ – a vůz je hotový.
- **Ve scéně skupina, nebo vůz** (místo jedné postavy – Martin, sonda Vlkov) jako karavana nákupu
  u sousedů: pěšky tesař nebo syn (pohlaví a věk z jádra) a nosiči, tam s obilím, zpátky bez
  nákladu; s vozem vůz se spřežením po zemské stezce, sedlák u volů a tesař vedle vozu. Od dílny po
  zemské stezce, nebo krajinou rovně k okraji mapy (za okrajem zmizí), nebo do druhé vsi ke kovárně
  a zpět; jde-li skupina víckrát, každou cestu zvlášť (`sceneExpeditions` – `ironCaravan`; vůz
  jede jako vůz výpravy – `sceneCarts`).
- **Panel dílny tesaře:** „Čeká na kování k vozu (3 kg)“ (červeně), nebo „Syn tesaře (15 let) jde
  se 6 nosiči (nesou obilí na platbu) pro kování k vozu do vsi Lhota (sever) – zpět za 3 dny“,
  „Tesař jede s vozem a sedlákem (dvoukolák veze obilí na platbu) …“ (šipka směru a dny); vůz,
  který čeká na kování, se v činnosti dílny neukazuje jako vyráběný.

### Vlkov – kování vozů

Vlkov má kováře (zásoba nástrojů ≈ 50 kg) – za dva roky simulace dostal nový dvoukolák kování ze
zásoby a kovář ho hned dokoval (nástroje 76,6 kg proti 76,7 kg bez pravidla). S kovářem a prázdnou
zásobou nástrojů (1 kg) kovář kování vykoval jako zakázku a nikdo nikam nešel.

Sondy bez kováře (kovárna zrušená) na čerstvém stavu z 31. 1. 801, kdy ves chce další dvoukolák:

- **první sonda (20. 10. 2026, tesař sám):** tesař šel po zemské stezce na východ do vsi Olšany
  (5 dní) a zaplatil 173 kg obilí – Martin: tolik obilí sám neunese. Opraveno:
- **bez volného vozu:** 10. 3. 801 šel tesař (bez syna od 14 let) **se 6 nosiči** po zemské stezce
  do vsi Olšany (východ, 5 dní, 172,8 kg obilí); v rozdělení práce dne bylo 6 čd na cestě
  (podíl `trade` na stezce), 15. 3. přinesl kování a vůz byl hotový,
- **s volnými vozy** (dvoukolák a čtyřkolák u ohrady volů): nejbližší kovář (Olšany, 5 dní) je po
  stezce na východ, která **není sjízdná pro vozy** – pěšky by to stálo 7 lidí × 5 dní = 35 čd.
  Ves proto 10. 3. 801 poslala tesaře **s dvoukolákem a sedlákem** po stezce sjízdné pro vozy na
  sever do vsi Chotěšov (7 dní, 2 lidé × 7 dní = **14 čd**; 1 čd z práce vsi denně, vůz s volem
  pryč), 17. 3. byl vůz hotový. Rok vozů si zapsal, že vůz ušetřil 21 čd (35 − 14).

## Kování vozů – řádky rozhodnutí o cestě k sousedovi

Neplatí od 23. 11. 2026 (Martin 22. 11. 2026: sousedé jsou skutečné vsi a obchod jde přes trhy, [markets.md](../markets.md) – plán 1). Dřív v wagons.md:

| Rozhodnutí                                                                                          | Kdo                   |
| --------------------------------------------------------------------------------------------------- | --------------------- |
| Tesař 173 kg obilí sám neunese – vůz, nebo aspoň 6 lidí                                             | Martin (20. 10. 2026) |
| Volný vůz s voly jede se sedlákem z vsi, jen po zemské stezce sjízdné pro vozy; dvoukolák napřed    | rozhodnutí Clauda     |
| Jinak nosiči po 25 kg (tesař nese taky), nejvýš polovina dospělých; málo lidí – jdou víckrát        | rozhodnutí Clauda     |
| Nosiči a sedlák chybí v práci vsi po celou cestu (jako nákup u sousedů)                             | návrh Clauda          |
| Jde syn tesaře od 14 let, jinak tesař                                                               | návrh Clauda          |
| ~~Nejbližší ves s kovářem podle dní cesty~~ – nahrazeno: cíl a doprava podle nejmenší práce vsi     | návrh Clauda          |
| Cíl a doprava podle nejmenší práce vsi celkem (všechny vsi s kovářem, vůz i nosiči); shoda – kratší | návrh Clauda          |
| Cesta vozu pro kování do roku vozů (kolik práce vůz ušetřil proti cestě pěšky)                      | návrh Clauda          |
| Cesta a platba obilím jako nákup u sousedů; platí ze zásob jen ves, která nešetří jídlem            | rozhodnutí Clauda     |
| Ves s kovářem = kovárna má rudiště a uhlí (bez uhlí jen s uhlířem ve vsi)                           | rozhodnutí Clauda     |
| Druhá ves hráče se platbou nemění (vsi se simulují zvlášť)                                          | rozhodnutí Clauda     |
