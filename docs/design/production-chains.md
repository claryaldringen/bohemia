# Výrobní řetězy – celý postup práce je vidět

Stav k 20. 10. 2026 – **schváleno** (Martin: „Schváleno“). Každé řemeslo i zpracování úrody ukazuje celý
postup od suroviny po výrobek: kdo co nese, kde to zpracuje a kam výrobek putuje – jako
v Knights and Merchants nebo Stronghold. Kovář vytaví železnou houbu a překove ji na hřivny,
v liště surovin jsou místo nástrojů hřivny. Přibývá humno (staví hráč) a obilné jámy (kopou
vesničané sami).

## Proč

Martin (20. 10. 2026): „Měl by být vidět celý postup práce lidí. Vybavuješ si třeba hru
Stronghold nebo ještě lépe Knights&Merchants?“

„Vlastně všechna řemesla. Kovař si donese/doveze dřevěné uhlí a železnou rudu. Pak vytaví
železnou houbu v redukční peci za pomocí ručního měchadla, houbu překove v železnou
hřivnu/hřivny, ze kterých může vyrábět nástroje nebo mohou jít na obchod. To je také věc, která
by měla být v tabulce surovin místo nástrojů.“ – na návrh, že hřivny jsou zásoba a nástroje
vybavení domácností: „Je to tak jak říkáš. V liště jenom hřivny“.

„Mlácení na humně ano - musíme tedy humno přidat jako stavbu. Uskladnění zrna také - musíme
přidat obilné jámy jako stavbu“ – „Humno je podmínka - bez toho by nebyla vidět ta práce
rolníků, kdy napřed mlátí a pak lopatami prohazují zrno“ – „humno postaví hráč“. **Změna 21. 10.
2026:** „Ať mlátí aspoň nouzově“ – humno už není podmínka, ale výhoda (méně práce a ztrát); ves
bez humna mlátí vždy nouzově na udusané zemi (návrh Clauda podle Martinovy věty).

„Hmm, máš pravdu. Obilné jámy by asi neměl řešit hráč, ale vesničané sami. Takže na příhodném
místě obilné jámy po sklizni vykopou, naplní obilím a utěsní/zamaskují. Hráč to jen uvidí, ale
nebude na to mít vliv, podobně, jako když uhlíř staví milíř. Po zbytek roku budou jámy průběžně
otvírat a zrno z nich spotřebovávat. Označit půjde jen otevřená jáma - zavřená nebude vidět -
a v označení se ukáže kolik v ní je zrní. Jámy lze používat opakovaně.“

## Cíle, ne-cíle, anti-cíle

**Cíle**

- U každého řemesla a u zpracování obilí je vidět každý krok: surovina se donese nebo doveze, na
  místě se zpracuje (pec, měch, výheň, kruh, humno…), meziprodukt leží na hromádce a výrobek se
  odnese tam, kam patří.
- Zásoby, které hráč vidí v liště, odpovídají věcem, které ve scéně leží (hřivny u kovárny, zrno
  v jamách).
- Hráč rozhoduje o stavbách (humno), vesničané o běžné práci (jámy, nošení) – jako u milíře.

**Ne-cíle (teď)**

- Mletí na žernovu a pečení – zůstávají neviditelnou prací domácnosti (návrh Clauda – Martin je
  u mlácení a uskladnění nezmínil).
- Nové suroviny mimo řetězy z citátů (trade.md – Jen společné suroviny).
- Ruční řízení nosičů hráčem (jako v Knights and Merchants) – ves nosí sama.

**Anti-cíle**

- Ves zahyne hladem jen proto, že hráč nevěděl o humnu – bez humna se proto vždy mlátí nouzově
  (Martin 21. 10. 2026) a hráč to ví z upozornění.
- Scéna zpomalí: víc postav a rekvizit nesmí vrátit sekání (výkon je hlídaný).
- Zásoba v liště nesedí s tím, co je vidět.

## Kovář – od rudy po hřivny a nástroje

Dnes kovář vyrábí rovnou nástroje (10 čd a 50 kg uhlí na kg nástrojů, ruda 8 kg – crafts.md,
Uhlí a ruda kováře). Nově (podle Martina, čísla návrh Clauda – upřesní rešerše):

1. **Suroviny:** uhlí od milíře a ruda z rudiště – nošení a vozy jako dnes (smith-supply.ts).
   Leží u kovárny na hromádkách (uhlí v koších, ruda na hromadě).
2. **Tavba v redukční peci:** pec (nízká šachtová pec z hlíny) u kovárny, ruční měch
   (měchař – člen domácnosti nebo syn). Vsázka uhlí a rudy, tavba trvá den, výsledek **železná
   houba** (struskovitý kus železa). Vidět: kouř a žár z pece, měchař, struska u pece.
3. **Překování houby na hřivny:** ve výhni pod přístřeškem – houba se rozžhaví a vyklepe (struska
   ven), z ní **železné hřivny** (tyčinky typického tvaru). Hřivny se skládají na hromádku
   u kovárny.
4. **Nástroje z hřiven:** kovář kove nástroje, když je ves potřebuje (obnova opotřebení
   vybavení domácností, kování vozů – wagons.md), a odnese je do domácností.
5. **Obchod:** na obchod jdou hřivny (TradeGood `tools` se mění na `ironBars` – „Hřivny“). Ves
   bez kováře si nástroje (vybavení) kupuje u sousedů sama jako dnes (nákup u sousedů); v panelu
   obchodu jsou jen hřivny (návrh Clauda).
6. **Kolik hřiven** (návrh Clauda): kovář taví podle potřeby vsi a drží zásobu hřiven na rok
   obnovy vybavení – z ní se prodává; přebytky navíc netaví (Martin 18. 10. 2026 – přebytky
   prodá až finanční systém).
7. **Měch** (návrh Clauda): u tavby je druhý člověk – dospělý z domácnosti nebo syn od 10 let
   (ten den nepase); kovář sám taví polovičním tempem.

**Rozdělení dnešní ceny** (návrh Clauda, celkem zhruba jako dnes na kg nástrojů, upřesní
rešerše): tavba 60 % práce a 80 % uhlí, překování 25 % práce a 15 % uhlí, kování nástroje 15 %
práce a 5 % uhlí. Na kg nástrojů ≈ 1,2 kg hřiven (odpad).

**Jak to běží** (úloha 4, 20. 10. 2026 – podrobnosti v [řemeslech](crafts.md) – Kovář – houba,
hřivny a vybavení; čísla `IRON` v `rules.ts`, rešerše
[2026-10-20-production-chains.md](research/2026-10-20-production-chains.md) – Kovář):

- **Výtěžky** (rešerše): z kg pražené bahenní rudy **0,25 kg houby** (pokusy 10–35 %), z kg houby
  **0,6 kg hřiven** (Sauder a Williams 2002: houba → sochor 63 %) – s 1,2 kg hřiven na kg
  nástrojů celkem **8 kg rudy na kg nástrojů jako dřív**. Uhlí a práce celkem beze změny (50 kg,
  10 čd); rešerše dává víc (82–100 kg uhlí, 2,3–25 čd na kg hotového železa) – hra zůstává u dnešní
  ceny.
- Na **kg houby 3 čd, 20 kg uhlí, 4 kg rudy**; na **kg hřiven 2,08 čd, 6,25 kg uhlí, 1,67 kg
  houby**; na **kg nástrojů 1,5 čd, 2,5 kg uhlí, 1,2 kg hřiven**.
- Kovář denně napřed kove nástroje do vybavení, pak překove houbu, pak ruda a tavba; houba
  z tavby se překove další den. Do dílny jde, až má **práci aspoň na celý den** (jinak pracuje se
  vsí – návrh Clauda).
- **Měchař** dospělý z domácnosti (napřed nejmladší), jinak syn 10–13, který ten den nenosí uhlí
  (nepase, v rozdělení práce u kovárny); sám kovář taví polovičním tempem – činnost `no-bellows`
  není, tavba se nezastaví.
- **Hodnota hřiven v obchodu 45 kg obilí za kg** (nástroje 60 bez kování ÷ 1,2 ≈ 47; železo
  v rešerši obchodu 30–60) – [obchod](trade.md) – Hřivny místo nástrojů.
- **Starší vsi:** zásoba nástrojů do vybavení do potřeby, přebytek ÷ 1,2 na hřivny; nástroje
  v obchodu (zbytek roku sousedů, výpravy, kronika) ÷ 1,2 na hřivny. Vlkov (kopie, 1. 10. 803):
  82 kg nástrojů při potřebě 63 kg → vybavení 63 kg a 15,8 kg hřiven, pokrytí 100 % před i po;
  za rok kovárna taví 88 dní a drží vybavení na 100 % a hřivny ≈ 22 z 22,7 kg.

## Nástroje jako vybavení domácností

- **Hřivny** jsou zásoba vsi – v liště místo nástrojů (Martin: „V liště jenom hřivny“).
- **Nástroje** nejsou zásoba: každá domácnost má vybavení (kg nástrojů na dospělého jako dnes
  potřeba `craftNeeds`), které se opotřebuje. Pokrytí `craftCoverage.tools` = podíl vybavení
  domácností – meze produktivity platí jako dnes (bez řemesel `worst`, plné vybavení `best`).
- Kovář z hřiven doplňuje vybavení podle potřeby; když hřivny chybí, taví. Bez kováře: nákup
  nástrojů u sousedů jako dnes (craft-buying.ts – kupuje se vybavení), nebo hřiven.
- **Starší vsi:** dnešní zásoba nástrojů se převede na vybavení domácností (rozdělí se), přebytek
  nad potřebu na hřivny (kg → kg / 1,2).

## Hrnčíř (návrh Clauda)

1. **Hlína** z hliniště (dnes).
2. **Příprava:** šlapání a hnětení hlíny v jámě u dílny (vidět: hromada hlíny, člověk šlape).
3. **Točení** na kruhu pod přístřeškem (dnes model má kruh).
4. **Sušení** – nádoby na lavici nebo prkně u dílny několik dní.
5. **Vypalování** v peci na dřevo (dřevo z lesa – dnes) – kouř.
6. **Keramika** zůstává zásobou v liště (nádoby ve vsi); hrnčíř odnáší nádoby do domácností
   (doplnění zásob na ztráty – dnes `potteryKg`).

## Tesař (návrh Clauda)

Klády z hromady → otesávání trámů na kozlíku (dnes) → kola a díly vozu, dřevěné nářadí →
vůz stojí u dílny, nářadí se odnese do domácností. Kování vozu z hřiven (wagons.md – Kování vozů).

## Uhlíř

Beze změny (milíř u buků – crafts.md); nošení uhlí ke kováři je dnes vidět.

## Obilí – humno a obilné jámy

### Humno (staví hráč)

- **Stavba** v mřížce staveb (zkratka K): **humno je jen mlat pod širým nebem – bez přístřešku**
  (Martin 21. 10. 2026, varianta 1), udusaná a vymazaná plocha 8 × 10 m se stohem slámy na kraji.
  Cena podle rešerše
  ([2026-10-20-production-chains.md](research/2026-10-20-production-chains.md) – Humno):
  **≈ 20 člověkodní** ze společné práce (sejmutí drnu a srovnání 4–9, hlína na mazanici 4–6,
  kropení, dusání a vymazání ≈ 10), **žádné dřevo ani stromy**, osadníci ne – nová ves ho
  postaví do první žně za pár dní. Přístřešek může přijít později jako vylepšení (návrh Clauda). Umístění volně jako dílna (půdorys u kurzoru, otáčí se): louka i les
  (Stavba v lese), na poli pole ustoupí (Pole jako krajina), ne do vody, na výchoz, do jiné
  stavby ani na nerovnou zem (rozdíl výšek nejvýš 1 m – mlat se srovná).
- **Výhoda, ne podmínka** (Martin 21. 10. 2026: „Ať mlátí aspoň nouzově“; návrh Clauda): ves bez
  hotového humna mlátí vždy nouzově na udusané zemi u domů – o 30 % víc práce výmlatu a 10 % zrna
  ztráta, bez omezení místa. Humno ušetří práci i zrno; přebytek nad kapacitu humna se mlátí nouzově vždy, takže ves s humnem není na tom hůř než ves bez něj (upozornění „Humno nestačí – část se mlátí nouzově“ jen informuje). Snopy se kazí (10 % za měsíc – klasy se
  neskladovaly) jen tehdy, když čekají a nemlátí se (výmlat nestihl okno).
- **Postup:** snopy se nosí nebo vezou z pole na humno (dnes nosiči a vozy – jen cíl humno),
  mlátí se cepy, pak se zrno **prohazuje lopatami** proti větru (odvívání plev), sláma na stoh.
  Výmlat je dnes úloha `thresh` – práce se nemění, jen místo (humno) a vidět je celý postup.
- **Kapacita** (návrh Clauda, rešerše – Výmlat na humně): na humně mlátí naráz ≈ 4 páry mlatců
  a 4 pomocníci – **12 člověkodní výmlatu za den**; v srpnu a září tak jedno humno stačí vsi do
  ≈ 60 ha osevu, víc humen se sčítá. Víc polí → výmlat se natáhne za okno → upozornění „Humno
  nestačí na výmlat“, druhé humno.
- **Nová ves** humno nemá – hráč ho postaví, kdy chce; do té doby se mlátí nouzově. Informační
  upozornění „Mlátí se na udusané zemi – postav humno“ (jen ves bez humna, jednou za rok při
  prvním výmlatu) se ohlásí i při prvním pohledu na ves (načtení, přepnutí vsi) a z jiné vsi
  hráče; nevymlácené snopy ukazuje horní lišta (ikona snopů s kg zrna, bez červeného varování).
  Upozornění „Před žněmi postav humno“ a „Snopy čekají na humno“ zmizela.
- **Starší vsi (Vlkov) – rok odkladu** (Martin, 20. 10. 2026: „Rok odkladu“): od 21. 10. 2026
  nemá význam – nouzově se mlátí vždy; `threshingGraceUntil` zůstává jen v uložených datech
  (s humnem, které v odkladu nestačí, mlátí zbytek nouzově). Úroda sklizená do zásob před
  převodem tam zůstane.
- **Výmlat hned po žni** (Martin, 20. 10. 2026: „Staří slované se snažili dělat výmlat hned.
  Klasy neskladovali.“): snopy jdou z pole rovnou na humno a mlátí se hned – ozim a luštěniny
  v srpnu, jař v září (dřív se mlátilo v zimě – okno úlohy `thresh` je hned za sklizní, fields.md
  – Výmlat hned po žni). Stohy snopů se nedělají; zrno jde rovnou do jam. Práce výmlatu je
  stejná, jen přijde v době podzimní orby a setí – ves ji musí stihnout: plán osevu ji odečte
  z podzimní práce (výmlat jaře v září se mlátí před setím ozimu) a výmlat ozimu a luštěnin
  z práce srpna vedle žně jaře (návrh Clauda). V témže měsíci má přednost žeň.
- **Výhled jídla** (návrh Clauda): snopy, které ves smí vymlátit (humno, nebo bez něj nouzově
  o ztrátu méně), počítá jako zrno se ztrátami (nouzový výmlat −10 % podílu, který se na humna
  nevejde; pomalé humno – snopy, které se za oknem kazí, než na ně dojde) – ves po žni nešetří
  jídlem; jí se jen vymlácené. Hlad a šetření jídlem
  jdou i podle energie, kterou ves opravdu snědla (zásoby došly dřív, než se vymlátilo) – ves
  nehladoví potají.
- **Výmlat na dnešní jídlo** (návrh Clauda): chybí-li v zásobách zrno na jídlo (na dva dny
  dopředu), ves vymlátí ze snopů obilí, které smí mlátit, tolik napřed – před žní i všemi
  ostatními pracemi.
- **Výmlat je dřina jako ostatní polní práce** (happiness.md – dřina): výmlat ve svém okně se
  počítá do sezónních úloh, které ves dnešním tempem musí stihnout.
- **Když humno nestačí** (návrh Clauda): mlátí se dál, dokud je co; nevymlácené snopy čekají
  u humna a kazí se (10 % za měsíc – nejsou na skladování; práce výmlatu ubývá s nimi – shnilé se
  nemlátí) a přijde upozornění „Humno nestačí na výmlat“ – jen když humno stálo celé okno výmlatu
  té plodiny (humno postavené pozdě nestačí na zpoždění, ne na úrodu). Snopy, které se v okně
  výmlatu právě mlátí, čekají na řadu bez ztráty. Zpožděný výmlat dobíhá na podzim a v zimě
  (září–únor) mezi pracemi jako výmlat v okně, na jaře a v létě (březen–srpen) až po všech
  ostatních pracích – zbytky nepředběhnou setí ani žeň.
- **Odchod do nové vsi** (migration.md): snopy, které ves smí vymlátit, se dělí jako zásoby –
  odcházející si vezmou svůj díl (vymlácený), ve vsi zůstane poměrný díl snopů i práce výmlatu.
- **Nošení** (návrh Clauda): práce výmlatu má v rozdělení práce dne cíl humno – k němu vede
  pěšina (vstup na předku mlatu) a vozy, které sváží snopy, jezdí i k humnu (vyjede
  se cesta); humno je pro pěšiny, vozy, vozové cesty i zemskou stezku stavba, kterou obejdou.
  Nouzový výmlat je u vsi.
- **Luštěniny** se mlátí taky na humně (návrh Clauda); do jam jde jen obilí, luštěniny se
  skladují doma.

### Obilné jámy (kopou vesničané sami)

- **Po výmlatu** vesničané vykopou na vhodném místě jámy, naplní je zrnem, utěsní a zamaskují
  (rešerše – Obilné jámy: jáma na **1 500 kg** zrna, hruškovitý tvar, vypálená, pečeť z hlíny).
  Zavřená jáma **není vidět**. Vymlácené zrno čeká na humně, jámy se plní od srpna do listopadu
  (po výmlatu, než zamrzne zem): po plných jamách, neúplnou jámu (aspoň 300 kg) až po výmlatu
  letošní úrody (snopy vymlácené a jař sklizená), v listopadu vždy; menší zbytek zůstane doma
  a sní se napřed (návrh Clauda). Mimo tuto dobu se jámy neplní – obilí koupené v zimě leží doma.
- **Práce** (rešerše – Obilné jámy): vykopat novou jámu **2,5 člověkodne**, vyčistit a vypálit
  jámu, nanosit do ní zrno z humna a zapečetit **1 člověkoden** (i stará jáma). Je to sezónní
  práce dne jako výmlat – v době plnění jam za polními pracemi a výmlatem (s koncem v listopadu –
  setí ozimu má přednost), před stavbami; práce se střádá, jáma je hotová, až na ni stačí
  (návrh Clauda). Ves s 10 t úrody vykope první rok ≈ 7 jam (≈ 25 čd), pak jen plní staré.
- **Kde** (návrh Clauda): nejbližší vhodné místo od humna (bez humna od dvorce vojvody) po
  kružnicích do 60 m – suché (ne voda, břeh, brod ani mokřina), ne v lese, mimo pole, sady,
  hřbitovy, ohrady a les vsi, mimo obydlí, pozemky, stavby, humna a jejich vstup, milíře, pevné
  cesty a zemní práce vozových cest (pláň i svahy úvozu a náspu celé plánované osy), mimo stavby
  a půdu jiných vsí na téže mapě, bez stromu, keře či kamene na místě, aspoň 3 m od ostatních
  jam – jámy se drží pohromadě. Když do 60 m nic není, hledá se dál až do 180 m; ani tam nic –
  novou jámu letos nevykopou a zrno navíc zůstane mimo jámy (do prázdných jam se plní dál; příští
  rok se místo hledá znovu). Místo vybírá jen server (simulace), scéna dostane polohy jam –
  výsledek nezávisí na prohlížeči.
- **Během roku** otvírají jednu jámu po druhé a zrno spotřebovávají (jídlo, osivo): co zásoby
  ubude (jídlo, prodej, platby), jde napřed ze zrna mimo jámy (humno, doma), pak z otevřené jámy;
  když se vyprázdní, otevře se jáma zapečetěná nejdéle. Otevřená jáma je vidět a jde označit –
  panel ukáže, kolik v ní je zrna (ikona zrna s kg, stáří jámy a jak je plná). K otevřené jámě
  vede pěšina (domácnosti si z ní berou zrno), k jámě, kterou kopou, za prací dne.
- **Stavba na zavřené jámě** (návrh Clauda): hráč ji nevidí, takže stavbu nezakazuje – vesničané
  zrno přendají do prázdné jámy nebo domů bez ztráty a jáma zmizí (i otevřená – její zrno jde
  domů). Platí pro každou stavbu hráče i vsi (obydlí, pozemek, dílna, modla, svatyně, humno,
  milíř, čtverce pole, sadu, hřbitova a ohrady) i pro zemní práce vozové cesty – pláň a svahy úvozu
  a náspu celé plánované osy, hotové i rozestavěné. Stavba **jiné vsi** na téže mapě jámu
  neodstraní – změnila by stav dvou vsí naráz; jámy se proto kopou jen na vlastní půdě, mimo
  stavby a půdu jiných vsí (návrh Clauda).
- **Opakovaně:** prázdná jáma se znovu naplní příští sklizní (jen naplnit a zapečetit); nové se
  kopou, jen když staré nestačí. Prázdná jáma po **10 letech** od vykopání se zasype a kope se
  nová (rešerše: jámy na Butser vydržely i 17 let – stěny se ale čištěním a vypalováním drolí).
- **Zásoby obilí v liště** = zrno v jamách + v otevřené jámě + na humně a doma (nevymláceno ne).
  Zásoba vsi zůstává jedno číslo (`storesKg`) – jídlo, osev, obchod a platby o jamách nevědí;
  jámy jen říkají, kde zrno leží a jak rychle ubývá (návrh Clauda).
- **Ztráty skladováním:** v zapečetěné jámě **3 % za rok** (slupka vyklíčeného zrna u stěn –
  Reynolds), v otevřené jámě a doma jako dnes (`storageLossPerYear` podle keramiky – 10 % bez
  hrnčíře, 5 % s ním). Plán osevu a cílová zásoba dál počítají ztráty jako doma (opatrnější
  odhad – návrh Clauda).
- **Starší vsi** (návrh Clauda): ves uložená před jamami uloží při načtení dnešní zásoby do jam
  u humna (bez humna u dvorce) bez práce – po plných jamách, všechny zapečetěné kromě poslední
  (neúplné), ze které se jí. Zásoby se nemění; jednou.
- Luštěniny a len zatím ne (jen obilí) – luštěniny se skladují doma (návrh Clauda).

## Co je vidět – nošení

Každý přesun mezi různými místy je vidět (návrh Clauda): postava s nákladem (koš, nůše, sud,
snop) nebo vůz. Přesuny v jednom místě (z pece do výhně) jen na místě. Provoz na cestách
(villagers.md) dostane nové druhy: snopy na humno, zrno do jam, z jam do domů, hřivny a nástroje
do domácností, nádoby. Postavy jsou lidé vsi (výběr postavy – role a činnost).

## Výkon

Nové rekvizity (pec, měch, houba, hřivny, nádoby, humno, jámy) v instancích, postavy v rozpočtu
postav. Nejdelší snímek se nesmí zhoršit.

## Postup (návrh Clauda)

1. Humno a výmlat na humně (stavba, podmínka, upozornění, nošení snopů, scéna).
2. Obilné jámy (vesničané, zásoba v jamách, výběr otevřené jámy).
3. Kovář – tavba, houba, hřivny, nástroje jako vybavení, hřivny v liště a obchodu.
4. Hrnčíř a tesař – kroky ve scéně.
5. Nošení výrobků do domácností.

## Otevřené otázky

- ~~Čísla tavby (výtěžek rudy → houba → hřivna) – rešerše~~ – dohledané (Kovář, rešerše –
  Kovář); cena humna, kapacita jámy a ztráty v jámě taky (Humno, Obilné jámy).

## Rozhodnutí

| Rozhodnutí                                                                                        | Kdo                                       |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Celý postup práce řemesel vidět (jako Knights and Merchants)                                      | Martin (20. 10. 2026)                     |
| Kovář: uhlí a ruda → redukční pec s ručním měchem → železná houba → hřivny → nástroje nebo obchod | Martin (20. 10. 2026)                     |
| V liště hřivny místo nástrojů; nástroje vybavení domácností                                       | Martin (20. 10. 2026)                     |
| Mlácení na humně, humno je podmínka, staví ho hráč                                                | Martin (20. 10. 2026)                     |
| Obilné jámy kopou vesničané sami, zavřená jáma není vidět, otevřenou jde označit, jámy opakovaně  | Martin (20. 10. 2026)                     |
| Mletí a pečení neviditelně v domácnosti                                                           | návrh Clauda                              |
| Humno 75 čd a 6 stromů, 8 × 10 m, nerovnost do 1 m, zkratka K (rešerše)                           | návrh Clauda                              |
| Starší vsi rok odkladu – nouzový výmlat na udusané zemi                                           | Martin (20. 10. 2026), čísla návrh Clauda |
| Výmlat hned po žni, klasy se neskladují (okno výmlatu hned za sklizní)                            | Martin (20. 10. 2026)                     |
| Snopy bez humna čekají a kazí se 10 % za měsíc, upozornění                                        | návrh Clauda                              |
| Humno 12 čd výmlatu za den (≈ 60 ha osevu), humna se sčítají; v okně snopy čekají bez ztráty      | návrh Clauda                              |
| Nouzový výmlat bez omezení místa; humno v odkladu, které nestačí, mlátí zbytek nouzově            | návrh Clauda                              |
| Plán osevu odečte výmlat z podzimu a srpna; výhled jídla počítá snopy, jen když je smí mlátit     | návrh Clauda                              |
| Humno nestačí – mlátí se dál, snopy se kazí, upozornění; luštěniny taky na humně                  | návrh Clauda                              |
| Výmlat na dnešní jídlo napřed; výhled se ztrátami; hlad i podle snědené energie                   | návrh Clauda                              |
| Upozornění na humno 90 dní před žní, i při prvním pohledu a z jiné vsi; snopy v liště             | návrh Clauda                              |
| Zpožděný výmlat na jaře a v létě až po ostatních pracích; výmlat v okně je dřina                  | návrh Clauda                              |
| Stavba na zavřené jámě dovolená – zrno se přendá                                                  | návrh Clauda                              |
| Jáma 1 500 kg, kopání 2,5 čd, plnění a pečeť 1 čd, v zapečetěné jámě 3 % za rok (rešerše)         | návrh Clauda                              |
| Jámy se plní srpen–listopad, neúplná až po výmlatu letošní úrody, zbytek pod 300 kg doma          | návrh Clauda                              |
| Místo jam u humna (bez humna u dvorce) do 60 m, suché, mimo stavby a cesty; vybírá server         | návrh Clauda                              |
| Zásoba zůstává `storesKg`; odběr napřed mimo jámy, pak z otevřené, otevře se nejdéle zapečetěná   | návrh Clauda                              |
| Starší vsi uloží zásoby do jam bez práce, otevřená jen poslední; prázdná jáma po 10 letech pryč   | návrh Clauda                              |
| Luštěniny bez jam (doma); plán osevu počítá ztráty jako doma                                      | návrh Clauda                              |
| Obchod s hřivnami, nástroje u sousedů jako dnes; zásoba hřiven na rok obnovy, bez přebytků        | návrh Clauda                              |
| Měchař u tavby – dospělý nebo syn od 10 let, sám kovář polovičním tempem                          | návrh Clauda                              |
| Výtěžek houby 25 % rudy, hřiven 60 % houby (rešerše); hřivny 45 kg obilí za kg                    | návrh Clauda                              |
| Kovář jde do dílny až s prací na celý den; starší vsi nástroje do vybavení, přebytek na hřivny    | návrh Clauda                              |
| Rozdělení ceny kování na tavbu, překování a nástroje; 1,2 kg hřiven na kg nástrojů                | návrh Clauda                              |
| Kroky hrnčíře a tesaře, každý přesun mezi místy vidět                                             | návrh Clauda                              |
