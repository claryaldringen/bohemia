# Kostra světa – řeky a dálkové stezky

Stav 8. 11. 2026 – **návrh ke schválení**. Rámec schválil Martin ([prémiové krajiny](premium-landscapes.md)
– Kostra světa: „Ano, takhle bychom to mohli udělat“; [vize](vision.md), otázka 9: vymyšlený svět
bez hranic, který roste s hráči). Podrobnosti v tomto dokumentu jsou **návrh Clauda**, pokud
u nich není uvedeno jinak. Plán implementace:
[2026-11-08-world-skeleton.md](../superpowers/plans/2026-11-08-world-skeleton.md).

**Proč samostatný dokument** (návrh Clauda): kostra je vlastnost celého světa, ne prémie – týká se
map NPC, vsí synů, umístění nováčků, odříznutých shluků, pochodu vojsk a obchodu. Prémiové krajiny
z ní jen berou místa pro čtyři své typy. Podle zásady „jedna mechanika = jeden dokument“ patří
zvlášť; [premium-landscapes.md](premium-landscapes.md) na ni odkazuje a drží jen rozhodnutí rámce.

## Proč

Martin: „samozřejmě by se mi líbilo, kdyby krajiny navazovaly, ale bojím se, aby to nebylo moc
náročné“ – na návrh navázat jen řeky a stezky: „Ano, takhle bychom to mohli udělat“
(premium-landscapes.md – Kostra světa). Martin 8. 11. 2026: „Zatím to nechme jako vymyšlený svět.
Umožní nám to dát všem hráčům víceméně stejné podmínky.“ Svět je bez hranic a roste s hráči
(Martin 8. 11. 2026: „A“ – [rešerše](research/2026-11-08-world-map.md), varianta c).

## Cíle, ne-cíle, anti-cíle

**Cíle**

- Řeka nebo stezka, která opouští mapu, pokračuje na sousední mapě ve stejném bodě okraje; řeka
  je tam stejně široká.
- Kostra je **čistá funkce seedu světa a souřadnic** – bez globálního výpočtu a bez stavu
  v databázi; výsledek nezávisí na pořadí dotazů ani na tom, kolik světa už existuje.
- **Stejné podmínky:** hráč nezíská výhodu tím, kam ho umístění posadí – sídlo na kostře dostane
  jen typ prémie, který kostře odpovídá, a ostatní typy dostanou jen mapy bez kostry.
- Mapy bez kostry (≈ 4 z 5) se generují bit po bitu jako dnes.

**Ne-cíle (teď)**

- Navázání ostatního terénu (výšky, potoky, lesy) přes okraje – švy zůstávají.
- Mapa světa pro hráče, jezera a moře, mosty, rychlejší cesta po stezce, plavba – Později.
- Kostra podle historických Čech (rešerše, varianty a a b) – svět je vymyšlený.

**Anti-cíle (selhání, i kdyby to technicky fungovalo)**

- Řeka končí u okraje mapy, za kterým ji soused nemá (nebo obráceně).
- Sídlo hráče má řeku nebo hotovou stezku navíc ke svému typu prémie.
- Odříznutý shluk se přesune na políčka, kudy vede kostra, a „přetrhne“ ji.
- Uložená sídla se změní (verze vrstev).

## Kostra jako čistá funkce světa

- **Vstup:** `WORLD_SEED` (po ostrém spuštění se nemění – docs/code/landscape.md) a celočíselné
  souřadnice políčka mřížky světa. Nic z databáze – prázdné políčko daleko od hráčů má kostru
  stejně jako obsazené.
- **Dvě nezávislé sítě:** řeky (odvodnění po políčkách) a stezky (síť uzlů v blocích 20 × 20 map).
  Obě jsou místní – kostra políčka se spočítá z omezeného okolí.
- **Proč ne oblasti N × N s vlastním výpočtem:** řeka z jedné oblasti musí pokračovat v sousední,
  oblasti by se musely shodnout na bodech hranice a v nekonečném světě bez moře by řeka neměla kam
  odtéct – každá oblast by potřebovala jezero, nebo by závisela na sousedech dál a dál.
  Odvodnění po políčkách se stálým spádem to řeší bez oblastí: každé políčko ví, kam odtéká,
  a řeka nikdy neskončí. Bloky zůstávají jen pro stezky, kde nic neteče.
- **Výřez kostry** (`SkeletonSlice`) – co z kostry dostane jedna mapa: body na okraji, kudy řeky
  vtékají a kudy vytéká (strana, políčko podél strany, šířka), a body, kudy vedou stezky. Mapa bez
  řeky i stezky má výřez prázdný – **suchá mapa**.

### Řeky – odvodnění po políčkách

1. Každé políčko světa odtéká do jednoho ze sousedů: na jih, nebo bokem na východ či západ. Bokem
   jen k sousedovi s nižším „číslem klidu“ (hash políčka) – proto nevznikne kruh: každý krok vede
   na jih, nebo v témže řádku k nižšímu číslu.
2. Bokem odtéká zhruba čtvrtina políček (`lateralShare` 0,25 na každou stranu při nulovém sklonu);
   poměr východ/západ posouvá pomalý sklon – šum s vlnou 16 map (`biasWavelength`). Řeky pak na
   desítky map uhýbají na východ nebo na západ, ne jen rovně k jihu.
3. **Povodí políčka** = kolik políček do něj odtéká, i nepřímo. Počítá se procházením proti proudu
   (sever, východ, západ – kdo sem odtéká) a končí na 12 000 (víc není potřeba).
4. **Řeka** teče políčkem s povodím aspoň 500 map; odtok takového políčka je bod řeky na okraji.
   Šířka podle povodí: 500 → 25 m, 850 → 30 m, 1600 → 35 m, 3800 → 40 m, 12 000 → 45 m (dnešní
   meze řeky 25–45 m – landscape.md, Typy vody). Povodí má dlouhý chvost – s dřívějšími prahy
   (do 2000) měla nejširší řeku 45 m ≈ 60 % map s řekou; prahy podle změřeného rozdělení dávají
   šířky 25–40 m po 16–19 % a 45 m ≈ 30 % (návrh Clauda 8. 11. 2026, Martin: „doladit do
   spuštění“). Rovnoměrně i pro 45 m by strop musel být přes 100 000 map – výřez by byl drahý.
   Šířku v bodě okraje počítají obě mapy ze stejného políčka (horního), takže se shodují; po
   proudu řeka jen sílí.
5. Řeky tečou vždy k jihu a do moře nedotečou – svět nemá hranice (Otevřené otázky 1). Řeka
   nekončí, jen se slévá; začíná **pramenem** – mapou, kde povodí poprvé dosáhne 500.

Hustoty z rychlé simulace (okno 200 × 200 map, dva seedy; přesná čísla dá měření v plánu):

| Co                               | Podíl map  |
| -------------------------------- | ---------- |
| řeka                             | 10–12 %    |
| z toho řeka teče rovně ze S na J | ≈ polovina |
| soutok dvou řek                  | ≈ 0,05 %   |
| pramen                           | ≈ 0,05 %   |
| stezka (Stezky níž)              | 8–9 %      |
| řeka i stezka                    | ≈ 1 %      |
| bez kostry (suchá mapa)          | ≈ 80 %     |

### Stezky – síť uzlů

1. Svět je rozdělený na bloky 20 × 20 map. V každém bloku je **uzel** – mapa uvnitř bloku, aspoň
   5 map od jeho kraje; poloha z hashe bloku.
2. Uzel se spojí se sousedním uzlem na východě a na severu; každé spojení existuje
   s pravděpodobností 0,7 (hash spojení).
3. **Tvar spojení:** z uzlu rovně k hranici bloků, na ní jeden ohyb k řádku (u spojení na sever
   ke sloupci) druhého uzlu a rovně do něj. Ohyby leží na hranicích bloků, rovné úseky uvnitř pásů
   bloků – dvě spojení se proto potkají jen v uzlu, nikde jinde (žádné souběhy ani křížení mimo
   uzly).
4. Uzel bez spojení stezku nemá; s jedním spojením je **konec stezky** (stezka končí ve vsi té
   mapy); se třemi či čtyřmi **křižovatka**.

### Body na okraji

- Hrana mezi dvěma políčky má nejvýš jeden bod řeky a jeden bod stezky. Poloha = políčko podél
  strany 24–103 ze 128 (aspoň 360 m od rohu mapy), z hashe hrany – obě mapy počítají stejnou
  hranu, proto stejný bod.
- Bod stezky na hraně s řekou je aspoň 16 políček (240 m) od bodu řeky.
- Strany podle světa: sever = +y mřížky světa = +z mapy (`neighbourCell`, `DIRECTION_VECTORS`).
  Políčko podél strany se počítá od západu (severní a jižní strana) a od jihu (východní
  a západní) – sousedé tak čtou stejné číslo.

### Místa kostry

Z výřezu se odvodí bez dalšího výpočtu:

- **Brod** – body stezky leží na různých obloucích okraje mezi body řeky, stezka tedy musí řeku
  přejít. Kolik oblouků se stezkou bez jednoho, tolik brodů.
- **Soutok řek** – dvě nebo tři vtékající řeky. **Pramen** – řeka jen vytéká.
- **Křižovatka** (3–4 body stezky) a **konec stezky** (1 bod).
- Řeka i stezka bez přechodu – stezka vede po jednom břehu.

**Průsmyk místem kostry není:** sedlo s hřbety je prvek prémie a vznikne jen na mapě s typem
průsmyk; hřbety za okraj nepokračují, jako ostatní terén.

### Proč nezáleží na pořadí a velikosti světa

Každá hodnota (odtok, povodí, uzel, spojení, bod na okraji) je funkce seedu světa a celých čísel
souřadnic, bez stavu. Výřez políčka se spočítá z jeho okolí – povodí nejvýš 12 000 políček proti
proudu, stezky z 3 × 3 bloků kolem – bez ohledu na to, co už ve světě je. Mezipaměť smí výpočet
jen zrychlit; test hlídá, že výřez spočítaný samostatně je stejný jako po tisících jiných dotazů
a že sousedé mají na společné hraně stejný bod. Zlatý otisk kostry (okno 32 × 32 map) hlídá, že se
po spuštění nezmění. Počítá se jen celočíselným hashem a sčítáním a násobením (`det-math`) – stejně
na serveru i v prohlížeči.

## Hustota a stejné podmínky

Čísla (návrh Clauda, do spuštění se ladí měřením `measure-skeleton`): řeka ≈ 1 mapa z 9, stezka
≈ 1 z 12, brod ≈ 1 ze 100–150, bez kostry ≈ 4 z 5 (Otevřené otázky 2).

**Místa pro sídlo hráče** – upřesňuje premium-landscapes.md (Jak hra vybírá: „ostatní typy
kdekoli“ → jen na suchých mapách):

| Výřez mapy                                                                                    | Typy prémie                                       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| suchá mapa                                                                                    | 15 typů bez kostry                                |
| řeka – jeden vtok, jeden výtok, bez stezky                                                    | splavná řeka, soutok (řeka a potok mapy – přítok) |
| brod – řeka a stezka (2 body) s jedním přechodem                                              | vyvýšenina nad brodem                             |
| stezka – dva body, bez řeky                                                                   | horský průsmyk                                    |
| ostatní (pramen, soutok řek, křižovatka, konec stezky, víc brodů, řeka i stezka bez přechodu) | sídlo hráče sem nejde – jen vsi synů a NPC        |

- **Proč typy bez kostry jen na suchých mapách:** sídlo by mělo prémii **a k tomu** řeku nebo
  hotovou stezku – dvojí výhodu.
- **Místo a typ najednou** (`placeSeat`): hledá se jako dnes – prstenec nejblíž cíli (pán, mapy
  jazykové skupiny, střed světa), kde je volné políčko s odstupem. Kandidáti jsou volná políčka
  tohoto prstence **a jednoho dalšího**. Ze všech typů, které kandidáti nabízejí, hra vezme nejméně
  zastoupený ve světě (dnešní `choosePremiumType`, shoda podle seedu) a z kandidátů s tímto typem
  ten nejbližší. Hráč tak bude nejvýš o jedno políčko dál, než by byl bez kostry (2 herní dny
  cesty).
- **Bilance:** řeka i stezka bývají mezi kandidáty skoro vždy, brod zhruba v každém pátém až
  desátém umístění – víc, než potřebuje rovnoměrné zastoupení (1 z 19 typů ≈ 5 %): typ, který
  zaostává, padne při první příležitosti. Dva stejné typy vedle sebe nebudou – sídla hráčů mají
  odstup aspoň 2 políčka.
- **Odříznutý nováček** (čeká na pána – [newcomers.md](newcomers.md)): krajina vzniká dřív než
  místo ve světě, proto je jeho sídlo i vsi synů v odříznuté krajině **suché** – typ jen z 15 bez
  kostry. Shluk se při umístění přesune jen na suchá políčka (podmínka políčka v `placeCluster`),
  hledá se dál po prstencích jako dnes.
- **Svobodný nováček bez vsi** (volba Svobodný, nebo týden bez žádosti): ves ještě nezaložil, a tak
  sídlo dostane místo jako pozvaný – `placeSeat` u map jeho jazykové skupiny – a krajinu znovu
  z políčka světa; odříznutou krajinu jen viděl. Kdo už v odříznuté krajině ves má (žádal o pána
  a nakonec začne svobodný), se přesune na suchá políčka.
- **Typ patří hráči** (premium-landscapes.md) zůstává pro typy bez kostry. **Typ kostry patří
  místu:** po Začít znovu ho hráč dostane, jen když `placeSeat` najde v prstencích výše políčko
  s tímto místem; jinak se typ vybere znovu (nejméně zastoupený). Restartem si typ nevybere –
  rozhoduje zastoupení ve světě.
- **Okolí sídla** se nevyrovnává: hustota kostry je všude stejná, v průměru mají všichni stejně.
  Kam pošle syny (k řece, na stezku), je volba hráče – kostra je na jeho mapách vidět tam, kde
  odchází za okraj.
- **NPC a vsi synů** mají průměrnou krajinu a výřez svého políčka – řeka i stezka se na nich
  objeví, prvky prémie ne (Otevřené otázky 3).

## Mapa z kostry – generátor krajiny

- **Suchá mapa:** generátor beze změny, bit po bitu (zlaté otisky všech verzí).
- **Jen stezka:** terén, vegetace a úrodnost jako u suché mapy. Krajina nese výřez a stezka se
  z něj spočítá jako prvek krajiny (`skeletonRoute` – deterministicky, server i prohlížeč): od
  bodu na okraji kolem vsi (nejblíž 150 m, obejití jako dnes u stezky přes brod) k dalším bodům;
  větve křižovatky se potkají u vsi, konec stezky končí u vsi.
- **S řekou** se terén staví v jiném pořadí – řeka první:
  1. výšky a sesypání svahů jako dnes;
  2. **koryta řek:** nejlevnější cesta nízkými místy od každého vtoku k výtoku, přítok do
     hlavního toku (soutok aspoň 20 políček od okraje); pramen začíná uvnitř mapy. Tvar koryta,
     meandry, 1–2 brody, hloubka a niva jako dnešní řeka (`RIVER` v `premium/river.ts`), šířka
     plynule od šířky vtoku k šířce výtoku;
  3. **potok mapy je přítok:** teče od okraje mapy (ne do 20 políček od bodu řeky) do řeky; na mapě
     s pramenem je potok počátkem řeky. Potok tedy zůstává, jen nevytéká za okraj;
  4. místo pro vesnici jako dnes u potoka a navíc aspoň 300 m od osy řeky
     (`RIVER.villageMinCells`);
  5. skály u potoka, vegetace a úrodnost jako dnes; stezka (je-li) přes brod řeky tam, kudy ji
     výřez vede.
- **Body na okraji platí přesně:** osa řeky i stezky končí v bodě výřezu (na políčko), šířka řeky
  v bodě je šířka výřezu. Výšky terénu na okraji nenavazují (šev) – hráč vidí vždy jednu mapu.
- **Pásmo srovnatelnosti:** mapa s řekou musí projít **celým** pásmem (`band.ts`) včetně horních
  mezí, aby řeka nedala vsím synů a NPC lepší okolí vsi. Celomapové meze (podíl lesa, úrodná
  políčka celé mapy) se na ní měří bez koryta a nivy řeky; okolí vsi (louka do 600 m, úrodná
  louka) beze změny. Navíc **kontrola kostry**: řeka spojuje body výřezu, stezka také, nic z toho
  do 120 m od vsi. Cíl jako u prémií – ≥ 95 % seedů projde do `MAX_ATTEMPTS` (16) pokusů.
- **Prémie na kostře** (nová verze průchodu `premium: 2`) už vlastní řeku ani stezku nepřidává,
  bere je z kostry:
  - **splavná řeka** – široká niva (4 políčka) na straně vsi a přístaviště;
  - **soutok** – ostrožna mezi řekou a potokem nad jejich soutokem;
  - **vyvýšenina nad brodem** – ostrožna 16–20 m nad brodem, kudy kostra vede stezku;
  - **horský průsmyk** – hřbet se sedlem napříč stezkou u okraje, kudy stezka vstupuje, ves na
    druhé straně hřbetu.

  Ostatní typy se v `premium: 2` nemění (jen suché mapy).

- **Co průměrná mapa na kostře nemá:** širokou nivu s přístavištěm, ostrožnu nad brodem nebo
  soutokem, sedlo s hřbety. Brod má – stezka přes řeku vést musí.

## Stezka kostry = hotová dálková cesta

- Platí pro **každou** mapu se stezkou kostry, prémiovou i průměrnou (vlastnost světa): při
  založení vsi je stezka upravená cesta s průsekem lesem bez klád (přes brod hať a lávka)
  a hotová zemská stezka ve směru každého bodu stezky na okraji – obchod se sousedy těmi směry jde
  hned. Dnes to dělá `withPremiumRoute` jen pro prémii (docs/code/village-trade.md); hotová stezka
  kostry je návrh Clauda už v premium-landscapes.md.
- Křižovatka = hotová stezka ve třech či čtyřech směrech, konec stezky = jeden směr.
- Hráč stezku kostry nestaví ani neopravuje – je od založení vsi.

## Uložení, verze vrstev a vývojová sídla

- **Sídlo si pamatuje svůj výřez** (`settlement.skeleton`, JSON; null = suchá mapa) tak, jako si
  pamatuje seed. Krajina se generuje z uloženého výřezu, ne z políčka – nezmění ji přesun
  odříznutého shluku ani pozdější úprava kostry. Prázdné políčko (pochod vojska) bere výřez
  z kostry světa.
- **Verze vrstev:** nová vrstva `skeleton: 1` – jen u map s neprázdným výřezem; mapa bez ní se
  generuje jako dnes. Prémie na kostře = `premium: 2`. Zlaté otisky: všechny dosavadní verze beze
  změny a nové otisky map s výřezem (rovná řeka, ohyb, soutok řek, pramen, stezka, brod,
  křižovatka).
- **Graf kostry světa** (odvodnění, uzly, spojení, body na okraji, čísla `SKELETON`) nese ve
  výřezu verzi `world: 1` a **po ostrém spuštění se nesmí změnit** – stejně jako `WORLD_SEED`:
  prázdná políčka by dostala jiný výřez než jejich uložení sousedé. Hlídá to zlatý otisk kostry.
  Do spuštění se smí měnit libovolně (landscape.md – Verze vrstev: „do ostrého spuštění se
  generátor smí měnit libovolně“).
- **Vývojová sídla:** uložená vývojová sídla se do sdíleného světa nepřenášejí (premium-landscapes.md
  – Kostra světa). Sídla vývojové databáze bez výřezu zůstanou, jak jsou (drží je zlaté otisky),
  i když přes jejich políčko kostra vede; prémie s náhodným vstupem a výstupem řeky (`premium: 1`)
  zůstane jen ve vývoji. Skript `skeleton-check` (jen čte) vypíše sídla, jejichž uložený výřez se
  liší od kostry světa. Ostrý svět začne s prázdnou databází – nic se nepřevádí.

## Kde všude kostra působí

- **Pochod vojska** mapou po mapě ([válka](war.md)): řeka je překážka, přejde se brodem; prázdná
  políčka mají krajinu i s kostrou.
- **Ryby, voda a překážky:** loviště vsi u řeky, vzhled a zvuk vody, stromy podél břehů – přes osu
  všech vod, nově s víc řekami na jedné mapě (soutok řek).
- **Obchod se sousedy:** stezka kostry otevírá směry (výše); sousedé dál bez simulace
  ([obchod](trade.md)).

## Později

Mapa světa s kostrou (pohled pro hráče, volba směru odchodu syna), cesta po stezce rychlejší než
mimo ni (zásilky, tažení), mosty a mýto (mechaniky prémií), plavba po řece, povodně řek
([katastrofy](disasters.md)), jezera.

## Otevřené otázky

1. ~~**Řeky tečou k jihu.**~~ Rozhodnuto 8. 11. 2026 (Martin: „Zatím jen A“) – k jihu, bez jezer
   a moře; jezera a moře možná později. Ve světě bez hranic nemají řeky kam dotéct; návrh: všechny tečou
   zhruba k jihu (s dlouhými oblouky na východ a západ), nikdy nekončí a jen se slévají. Druhá
   možnost: jezera, do kterých řeky ústí – nový druh krajiny navíc a „díry“ v mřížce.
   **Doporučení:** k jihu, bez jezer.
2. ~~**Hustota kostry.**~~ Rozhodnuto 8. 11. 2026 (Martin: „a“) – takto, doladit do spuštění. Návrh: řeka ≈ 1 mapa z 9, stezka ≈ 1 z 12, brod ≈ 1 ze 100–150, ≈ 4 z 5
   map bez kostry. Víc kostry = víc vsí synů s řekou a hotovou stezkou, ale hráčům bez pozvánky
   se zmenší výběr suchých míst. **Doporučení:** takto a doladit do spuštění.
3. **Kostra i na mapách synů a NPC.** Ves syna nebo NPC na stezce kostry dostane hotovou zemskou
   stezku (obchod hned), na řece řeku – bez prvků prémie. Hráč to získá volbou směru odchodu syna,
   ne náhodou. Druhá možnost: na průměrných mapách jen vyšlapaná cesta, kterou si ves sama
   dostaví. **Doporučení:** stejně pro všechny mapy (vlastnost světa).

## Rozhodnutí

| Rozhodnutí                                                                                                             | Kdo                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Navazují jen řeky a stezky (kostra), zbytek terénu každá mapa vlastní                                                  | návrh Clauda, Martin („Ano, takhle bychom to mohli udělat“) |
| Vymyšlený svět bez hranic, roste s hráči                                                                               | Martin (8. 11. 2026)                                        |
| Kostra = čistá funkce seedu světa a souřadnic; řeky odvodněním po políčkách, stezky sítí uzlů v blocích 20 × 20        | návrh Clauda                                                |
| Povodí ≥ 500 map = řeka, šířka 25–45 m podle povodí; body na okraji 24–103, stezka 16 políček od řeky                  | návrh Clauda                                                |
| Typy kostry jen na odpovídajícím místě, ostatní typy jen na suchých mapách; `placeSeat` o nejvýš jeden prstenec dál    | návrh Clauda                                                |
| Odříznutý shluk suchý a jen na suchá políčka; svobodný bez vsi dostane krajinu z políčka světa; typ kostry patří místu | návrh Clauda                                                |
| Mapa s řekou: řeka první, potok přítokem, ves ≥ 300 m od řeky, celé pásmo bez koryta a nivy v celomapových mezích      | návrh Clauda                                                |
| Prémie na kostře `premium: 2`, vrstva `skeleton: 1`, výřez uložený u sídla; graf kostry se po spuštění nemění          | návrh Clauda                                                |
| Stezka kostry je hotová dálková cesta na každé mapě, kudy vede                                                         | návrh Clauda (Otevřené otázky 3)                            |
