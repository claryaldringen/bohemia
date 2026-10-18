# Dvorec vojvody, zemská stezka a obchod se sousedy

Stav: schváleno 18. 10. 2026 (Martin: „Ano, spusť to takhle“; obchod se sousedem bez simulace –
varianta „a“). **Implementace hotová** (18. 10. 2026) – dvorec, zemská stezka, sousedé, obchod
a zboží zvenku; detaily, které návrh nechal otevřené, v části [Jak je postavené](#jak-je-postavené).

## Proč

Ves má mít svého pána. Martin: „Jedna z obytných staveb by měla být větší a honosnější než
zbylé – to bude obydlí vojvody. Když na něj kliknu, uvidím tam ‚upgrady‘ pro celou vesnici.
Úplně prvním z nich bude možnost vybudovat cestu do některé ze sousedních vesnic (celkem 8
směrů). Pokud vybudujeme cestu do sousední vesnice, budeme s ní moci obchodovat.“ Obchod dá vsi
to, co sama nemá (sůl, železo, med), a smysl přebytkům (keramika, sýr, dřevo).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** jedno obydlí vsi je **dvorec vojvody** – větší a honosnější (Martin).
- **Cíl:** klik na dvorec ukáže **vylepšení celé vsi**; první je **zemská stezka** do jednoho
  z 8 směrů (Martin).
- **Cíl:** po stezce ves **obchoduje se sousední vsí** v tom směru (Martin).
- **Cíl:** soused je zatím **bez simulace** (stálá povaha, nabídka a poptávka); až budou skutečné
  vsi NPC vojvodů ([válka](war.md)), obchod převezmou ony (Martin – varianta a).
- **Ne-cíl (teď):** peníze a ceny na trhu, vozy, cla a mýto, obchodníci z daleka, válka o stezku,
  další vylepšení vsi (hradiště, družina, trh – přijdou později do stejného panelu).
- **Ne-cíl (teď):** přistěhovalci – noví lidé do vsi z okolí (rodiny, které se přistěhují).
  Martin (18. 10. 2026): „přistěhovalci budou fungovat na základě obchodu, až ho navrhneme“ –
  přijdou jako součást obchodu a vztahů se sousedy, ne jako samostatná mechanika (viz Navazuje).
- **Anti-cíl:** obchod bez práce a bez času (zboží se teleportuje), nebo nekonečný zdroj (soused
  nemá zásoby bez omezení).

## Dvorec vojvody

- **Kde se vezme** (návrh Clauda): v nové vsi se dvorcem stane první zemnice zakladatelů (bydlí
  v ní vojvodova rodina – s [příbuzenstvím](kinship.md) rodina hlavy rodu); ve stávající vsi
  nejstarší obydlí. Když dvorec dožije, obyvatelé ho přestaví na **dvorec** (nový typ obydlí).
- **Dvorec** (nový typ obydlí – návrh Clauda): delší a vyšší polozemnice / dům se zdobenými
  štíty (vyřezávané konce střešních trámů – koňské hlavy), větší pozemek (2 políčka) s plotem
  a branou, kapacita 10 lidí. Cena a dřevo jako polozemnice × 1,5. Jeden na ves.
- Vojvoda může v dvorci bydlet i ve zemnici (na začátku) – vylepšení vsi jdou odtud vždy.
- Panel výběru dvorce: obyvatelé jako u obydlí + **vylepšení vsi** (ikony, cena v popisku,
  zašedlé s důvodem – jako v 0 A.D.).

## Zemská stezka (první vylepšení)

- Hráč zvolí **směr** (8 šipek – S, SV, V, JV, J, JZ, Z, SZ). Stezka vede od dvorce ke kraji
  mapy v tom směru – trasu najde síť cest (nejlevnější chůze, brody, svahy), osa se uloží.
- Stavba = pevná cesta stupně **upravená** po celé délce ([roads.md](roads.md) – 15 čd na 100 m),
  plus hať a lávka, kde vede mokřinou nebo přes potok. Kde už pevná cesta je, platí se jen
  vylepšení. Staví se ze společné práce vsi, po úsecích od vsi ven (vytyčení hned).
- Hotová stezka je pevná cesta (nezaroste), stromy u ní rostou jako u ostatních pevných cest.
- Víc stezek = víc sousedů (každá stavba zvlášť).

## Sousedé (bez simulace – varianta a)

- V každém z 8 směrů je soused s **povahou** určenou deterministicky ze seedu světa a směru
  (návrh Clauda): 2–3 druhy zboží **nabízí** (přebytek – levně), 2–3 **shání** (dražší).
  Zboží souseda: obilí, maso, sýr, luštěniny, dobytek (kusy), klády, keramika, nástroje, uhlí
  a **zboží zvenku**: **sůl, železo, med, kožešiny**.
- Zásoby souseda: každého nabízeného zboží má na rok omezené množství (doplní se 1. 11.);
  poptávka je taky omezená (kolik toho za rok vezme).
- Jméno souseda (vsi) navrhne hra (`suggestVillageName`), vojvoda zatím nemá tvář.

## Obchod

- **Výměnou, ne za peníze** (návrh Clauda). Každé zboží má hodnotu v kg obilí: obilí 1,
  luštěniny 1, maso 3, sýr 4, med 6, sůl 8, keramika 3, uhlí 0,5, nástroje 60, železo 30 (kg),
  kráva 600, kláda 40, kožešina 25 (kus) – rešerše
  [2026-10-18-trade-values.md](research/2026-10-18-trade-values.md) (návrh Clauda). Soused
  bere s přirážkou **≈ 20 %**; co shání, za to dá o ≈ 20 % víc, co nabízí, dá o ≈ 20 % levněji.
- **Doprava:** zboží nesou lidé po stezce – **≈ 25 kg na člověka a cestu** (dobytek se žene);
  cesta tam a zpět trvá **2–6 dní** podle délky stezky (+ cesta za krajem mapy 1 den). Práce
  nosičů = lidé × dny (ze společné práce vsi, jako stavba); zboží dorazí, až se nosiči vrátí.
- **Panel obchodu** (dvorec, po dostavění stezky): soused (jméno, směr), ikony zboží – co dáš,
  co dostaneš, posuvníky, bilance hodnoty (musí být ≥ 0 pro souseda), cena v práci a dny cesty.
  Potvrdit → výprava vyrazí. Jedna výprava na souseda naráz.
- **Ve scéně:** nosiči odejdou po stezce ke kraji mapy a vrátí se s nákladem (postavy jako
  ostatní – `villager-plan`).
- **Zboží zvenku ve vsi** (návrh Clauda): sůl, železo, med, kožešiny jsou zásoby v horní liště
  (ikony – jen když nějaké jsou). **Železo** může kovář použít místo vlastní rudy (dnes jen
  bahenní ruda – [řemesla](crafts.md)). **Med** se jí (energie, štěstí jako ovoce). **Sůl**
  a **kožešiny** zatím přidávají štěstí; sůl později prodlouží trvanlivost masa a sýra.
- Kronika: stezka dostavěna, výprava odešla / vrátila se (co přinesla).

## Navazuje

- **Přistěhovalci** (Martin, 18. 10. 2026): noví lidé do vsi z okolí přijdou přes obchod
  a vztahy se sousedy (např. rodina, která se se sousedem domluví a přistěhuje) – navrhne se
  spolu s dalším rozvojem obchodu, ne jako samostatná mechanika. Nevěsty z okolí už nesou směr
  souseda (`origin` – [příbuzenství](kinship.md)).
- **Skuteční sousedé:** až budou vsi NPC vojvodů ([válka](war.md)), povahu souseda nahradí jejich
  skutečné zásoby a poptávka; stezka zrychlí přesun vojska.

## Jak je postavené

Návrh Clauda (18. 10. 2026) – detaily, které návrh výš nechal otevřené:

- **Kdo je dvorec:** `VillageState.manorId` (id obydlí = domácnosti). Nová ves – první zemnice
  zakladatelů (`foundVillage`); starší ves – nejstarší obydlí (den dostavění, při shodě nižší
  id), řemeslné dílny až nakonec (`withManor` při načtení, `keepManor` každý den – po zániku
  dvorce nejstarší obydlí). Dvorec je budova: když se vojvodova domácnost přestěhuje, dvorcem
  zůstane dům.
- **Dvorec jako obydlí:** typ `dvorec` – kapacita 10, cena 330 čd a 27 stromů (polozemnice × 1,5),
  opravy na konci životnosti × 1,5 (25,5 čd ročně), životnost a chátrání jako polozemnice. Hráč
  dvorec nestaví (v nabídce staveb není) – dožilý dvorec obyvatelé přestaví vždy na `dvorec`
  (nezastaví je ani nedostatek dřeva, jako u ostatních přestaveb).
- **Pozemek dvou políček:** `DwellingPlot.yard` – dvůr sousedí stranou s políčkem domu, dům stojí
  uprostřed políčka domu vchodem ke dvoru (`yardRotation`), plot obejde obě políčka, brána (2,4 m,
  sloupy s překladem a koňskou hlavou) je na vzdálené straně dvora, záhony jen kolem domu. Při
  přestavbě se hledá nejbližší dvojice volných políček do 50 m (dvůr napřed vpředu, pak vpravo,
  vlevo, vzadu – jako pozemek polozemnice, bez polí a sadů); nenajde-li se, dvorec se přestaví
  na místě se starým pozemkem (nebo bez něj).
- **Model:** srub 4,6 × 8,4 m s vyššími stěnami (1,3 m nad terénem), hřeben ≈ 4,1 m, štíty nahoře
  bedněné prkny se zubořezem, konce zkřížených štítových prken vyřezané do koňských hlav (hlava
  skloněná ven), vyřezávané sloupky u dveří. Dvorec se zatím nerozpadá (jako dílny), zbytek jámy
  po něm je jako po polozemnici.
- **Trasa stezky:** jedno hledání nejlevnější chůze (Dijkstra po terénu pěšin celé krajiny
  s kmeny, keři a balvany; po pevné cestě poloviční cena) z místa za branou dvorce do všech
  8 směrů; cíl je schůdná buňka do 20 m od kraje schůdné krajiny v rozmezí ±22,5° od směru
  (když tudy cesta nevede, ±45°), odklon od směru trasu prodražuje (× 1 + 2·(1 − cos)). Voda
  bez brodu a sráz směr zahradí („Ke kraji mapy tudy cesta nevede…“).
- **Osa a úseky:** trasa se uloží jako pevné cesty (`addTrailRoads`): kde vede po pevné cestě
  (do 5 m), použije ji, jinde vznikne nová vyšlapaná cesta po úsecích nejvýš 150 m připojená
  v rozcestí jako cesty z provozu (místa na stromy, mokřina a brody). Úseky stezky jsou úseky
  pevných cest od vsi ven (`Trail.pieces`); rozdělení úseku přidá nový kus hned za ním.
- **Cena:** úsek vyšlapaný → upravená (15 čd na 100 m), úsek přes mokřinu nebo brod navíc hať
  a lávka (ceny z roads.md, dřevo z hromady, zbytek nejbližší dospělé stromy k mokřinám); úsek,
  který už je upravený, stojí jen hať a lávku, hotový nic. Úsek, který se právě vylepšuje
  hráčem, stezku zablokuje („Část cesty se už vylepšuje.“).
- **Stavba po úsecích:** jedna stavba `road` s `Construction.trail`; práce jde nejdřív na kácení
  dřeva, pak úsek po úseku od vsi ven – dostavěný úsek hned dostane nový stupeň (chodí se po něm
  rychleji, `trailsDay`), ve scéně je zbytek stezky vytyčený a úprava roste na úseku u čela
  práce. Hotová stezka (`Trail.builtDay`) je upravená cesta – nezaroste.
- **Dny cesty:** 2 dny do 400 m stezky, každých dalších 250 m den navíc, nejvýš 6, a 1 den za
  krajem mapy (tedy 3–7 dní celkem).
- **Sousedé:** povaha ze seedu vsi a směru (`neighbourOf` – dokud mapy nemají polohu ve světě,
  stojí za „seed světa“ seed vsi; dvě vsi na téže mapě tak mají každá své sousedy). Soused
  nabízí 2–3 druhy zboží, z toho aspoň jedno zboží zvenku, shání 2–3 druhy zboží, které ves sama
  umí (zboží zvenku ne, nabízené ne). Roční zásoba každého nabízeného zboží v hodnotě 600–1 500 kg
  obilí, poptávka 800–2 000 kg; rok obchodu začíná 1. 11. a ukládá se jen, co z něj zbývá.
- **Ceny:** přirážka 20 % platí oběma směry, sháněné zboží soused bere o 20 % dráž a nabízené
  prodá o 20 % levněji: ves za kus sháněného zboží dostane hodnota ÷ 1,2 × 1,2 = 1 × hodnota,
  za kus nabízeného zaplatí hodnota × 1,2 × 0,8 = 0,96 × hodnota. Obchoduje se jen sháněným
  (ves dává) a nabízeným (ves dostává) zboží – jinak by soused byl nekonečný zdroj.
- **Doprava:** nosiči = víc z cest tam a zpět: náklad ÷ 25 kg (kláda váží pro nosiče 100 kg –
  vlečou ji čtyři, kožešina 1,5 kg) + honák na každých 10 kusů dobytka; aspoň 1. Práce = nosiči
  × dny; každý den výprava vezme ze společné práce nejvýš počet nosičů (před stavbami), takže
  trvá aspoň daný počet dní, s málo prací déle. Zboží, které ves dává, odejde hned, přinesené
  dorazí po návratu. Ves si nechá aspoň 2 krávy.
- **Zboží zvenku:** sůl 3 kg na člověka a rok (≈ 8 g denně), dokud je, štěstí +3; kožešiny se
  opotřebí 20 % ročně, štěstí +2 × (kožešiny ÷ lidé, nejvýš 1); med rovným dílem do roka,
  nejvýš 5 % potřeby energie (0,9 kg obilí na kg), štěstí jako ovoce (+5, se zralým ovocem se
  nesčítá); kovář z koupeného železa jen kuje – 1,2 kg železa, 3 čd a 10 kg uhlí na 1 kg
  nástrojů (místo 10 čd a 50 kg uhlí z rudy), železo bere přednostně.
- **Rozhraní:** v panelu dvorce (obydlí s portrétem „Dvorec vojvody“) dvě ikony – Zemská stezka
  otevře růžici 8 šipek kolem dvorce (cena, délka a dny cesty v popisku, zahrazený směr zašedlý
  s důvodem, hotová stezka zlatě, rozestavěná s průběhem) a Obchod (jen s hotovou stezkou) panel
  obchodu – sousedé po hotových stezkách, posuvníky „dáš“ (nejvýš co ves má a soused vezme)
  a „dostaneš“ (nejvýš zásoba souseda), bilance pro souseda, nosiči, dny a práce, tlačítko
  vyslat výpravu; výprava na cestě ukáže náklad a průběh. Zboží zvenku v horní liště, med
  v popisku nasycení.
- **Ve scéně:** nosiči chodí s nákladem po stezce od dvorce ke kraji mapy a zpět (skutečný čas
  jako ostatní postavy – karavana po celé stezce).

## Rozhodnutí

| Rozhodnutí                                                                                | Kdo          |
| ----------------------------------------------------------------------------------------- | ------------ |
| Dvorec vojvody – větší a honosnější obydlí; klik ukáže vylepšení vsi                      | Martin       |
| První vylepšení: cesta do sousední vsi v jednom z 8 směrů; po ní obchod                   | Martin       |
| Soused zatím bez simulace (stálá povaha), později skutečné vsi NPC vojvodů                | Martin (a)   |
| Dvorec = první / nejstarší obydlí, přestavba na dvorec, kapacita 10, cena ×1,5, jeden     | návrh Clauda |
| Stezka = upravená cesta ke kraji mapy (+ hať a lávka), po úsecích od vsi                  | návrh Clauda |
| Povaha souseda ze seedu: 2–3 nabízí, 2–3 shání; roční zásoby a poptávka                   | návrh Clauda |
| Výměna podle hodnot v kg obilí, přirážka ≈ 20 %; nosiči 25 kg, 2–6 dní, práce vsi         | návrh Clauda |
| Zboží zvenku: sůl, železo (pro kováře), med (jídlo), kožešiny; štěstí                     | návrh Clauda |
| Přistěhovalci přijdou přes obchod a vztahy se sousedy, ne jako samostatná mechanika       | Martin       |
| Hodnoty zboží v kg obilí podle rešerše (kráva 600, železo 30, sůl 8, med 6, kožešina 25…) | návrh Clauda |
| Jak je postavené: dvorec, pozemek se dvorem, trasa a úseky stezky, sousedé, ceny, doprava | návrh Clauda |
