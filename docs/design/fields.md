# Pole a jídlo vesnice

Stav: schváleno 17. 10. 2026 (Martin). Týž den změna (Martin, po prvním prototypu): **pole se
staví po čtvercích** – políčkách krajiny 15 × 15 m, jak je obvyklé v realtime strategiích – místo
volného obrysu. Implementace jádra: `packages/game/src/domain/village/`.

## Proč

Jídlo je to, co ves živí a co jí bere nejvíc práce. Navazuje na
[obyvatelstvo a obydlí](population.md): tam se růst vsi řídí **nasycením** a domácnost dává
na obživu dočasně pevných 85 % práce. Tento dokument obojí nahrazuje skutečným výpočtem – kolik
půdy ves má, kolik z ní oseje, kolik práce to stojí a kolik jídla sklidí.

Hra je o tom, aby výroba jídla byla co nejefektivnější – aby ve vsi postupně mohli být i lidé,
kteří se jídlem nezabývají vůbec nebo jen menší část času (Martin). Zpočátku se ale všechno
dělá ručně: motyky, úroda nošená v nůších, seno na vidlích (Martin). Proto začátek stojí skoro
všechnu práci vsi a teprve lepší nástroje a osevní systémy (další mechaniky) práci uvolní.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč zakládá **společná pole vsi** po čtvercích – políčkách krajiny (Martin) a na volbě místa
  záleží – úrodnost, vzdálenost od obydlí, louka nebo les, kameny a stromy v cestě.
- **Cíl:** příliš velké pole ves celé neobdělá a část zarůstá (Martin) – práce vložená do
  založení té části přijde vniveč. Příliš malé pole ves neuživí. Hráč hledá správnou výměru.
- **Cíl:** pole jde založit i v lese (Martin). Mýcení je drahé, ale vymýcená a vypálená půda je
  nejúrodnější. S přílohovou soustavou louky v okolí dojdou brzy, takže mýcení lesa patří k růstu
  vsi od začátku (Martin).
- **Cíl:** práce na poli se řídí ročními obdobími (kalendář) – jarní a letní špičky jsou znát.
- **Cíl:** pole dá populaci skutečné nasycení a nahradí pevných 85 % práce na obživu.
- **Ne-cíl (teď):** druhy plodin (zatím jedno „obilí“), lepší nástroje (rádlo, pluh, kosa),
  tažná a hospodářská zvířata, seno a pastva, lepší osevní systémy (dvojpolní, trojpolní),
  počasí a s ním náhoda v úrodě, zahrady a rybolov jako zdroj jídla, využití vykáceného dřeva,
  obchod s jídlem, více vesnic.
- **Anti-cíl:** ves, která vyhladoví jen proto, že hráč pár dní nebyl online – dobře založená
  pole živí ves sama.
- **Anti-cíl:** ležení ladem jako číslo bez významu – osevní systém má odpovídat středověku
  (Martin): zpočátku přílohová soustava raných Slovanů (Martin).
- ~~Anti-cíl: pole nalepená na čtvercovou mřížku~~ – zrušeno, pole se staví po čtvercích (Martin).

## Pojmy

- **Pole** – samostatný objekt vsi: souvislá skupina **čtverců – políček krajiny** (15 × 15 m),
  kterou hráč založil (Martin; dřív volný obrys). Pole jsou **společná pro celou ves** (Martin) – nepatří
  žádné domácnosti. Ves jich může mít víc. „Pole“ v tomto dokumentu znamená celou zemědělskou
  půdu – obdělává se jen část, zbytek leží ladem (Martin).
- **Díl pole** – jeden čtverec pole = jedno políčko krajiny (15 × 15 m, 225 m²). Díl má:
  - **plochu** (m²) – kolik z políčka pole zabírá,
  - **přirozenou úrodnost** – úrodnost políčka z krajiny (0–100),
  - **aktuální úrodnost** – osev ji vyčerpává, ležení ladem obnovuje,
  - **stav v daném roce:** **zakládá se** (mýcení, rozrušení drnu), **oseto**, nebo **příloh**
    (leží ladem bez péče a zarůstá),
  - **stáří přílohu** – kolik let díl leží ladem; podle něj je zarostlý (viz Zarůstání).
- **Osevní systém** – které díly pole se smějí osít a jak dlouho leží ladem. **Zpočátku
  přílohová soustava raných Slovanů** (Martin): díl se pár let po sobě osévá, pak leží dlouho
  ladem jako **příloh** a zarůstá, než ho ves znovu vrátí do osevu. Lepší systémy (dvojpolní,
  trojpolní) přijdou s vlastní mechanikou (viz Navazuje).
- **Obilí** – zatím jediná plodina; jídlo se počítá v **kg obilí** (návrh Clauda).
- **Zásoby jídla vsi** – společné zásoby vsi v kg obilí (ves je zásobárnou aktiv – Martin).
- **Nasycení vsi** 0–1 – jaký díl potřeby jídla ves právě pokrývá; vstup do
  [populace](population.md).
- **Krajina sídla** – vygenerovaná krajina plus **stav sídla nad ní**: pole, vykácené stromy,
  odstraněné kameny, zarůstání. Generátor krajiny se nemění (po ostrém spuštění se existující
  vrstva nesmí změnit – viz [krajina](landscape.md)).

## Pravidla

### Založení pole (rozhoduje hráč)

- **Ves se zakládá zemnicí, pole přidá hráč, kdy chce** (Martin, 17. 10. 2026: „Hráč sám
  rozhodne kdy a co bude stavět, jako v každé RTS.“ – dřív „rozhodnu, kde bude stát první
  zemnice a pole“ a ves bez prvního pole založit nešla). Zemnici si osadníci nejdřív postaví
  ([populace](population.md) – Založení vsi); první pole, když ho hráč hned vyznačí, se staví
  souběžně a o společnou práci se dělí. Ves bez pole žije ze startovních zásob na 18 měsíců
  (≈ 13 skutečných hodin) a pak hladoví – hlad ji zmenší, ale v době hájení dospělí neumírají.
- Hráč označí čtverce pole na mřížce políček (Martin). Pole nesmí zasahovat do vody, do obydlí ani
  do jiného pole; nejmenší výměra 0,1 ha, nejdál **800 m** od nejbližšího obydlí (návrh Clauda).
- Pole může ležet na louce, v křovinách i v lese (Martin). Všechno, co je na čtvercích pole,
  osadníci při založení odstraní – stojí to práci navíc:

  | Povrch dílu (za hektar)              | Práce navíc                    |
  | ------------------------------------ | ------------------------------ |
  | louka – rozrušení drnu               | 40 člověkodní                  |
  | křoviny – vysekání a vytrhání kořenů | 150 člověkodní                 |
  | les – kácení, pálení, klučení pařezů | 250 člověkodní (stromy v ceně) |

  | Překážka na louce (za kus) | Práce navíc                                                |
  | -------------------------- | ---------------------------------------------------------- |
  | kámen                      | 1 člověkoden                                               |
  | balvan                     | 8 člověkodní                                               |
  | osamělý strom              | 3 člověkodny                                               |
  | keř                        | 0,5 člověkodne                                             |
  | skalní výchoz              | neodstraní se – pole ho obejde, plocha pod ním se nepočítá |

  Všechna čísla jsou návrh Clauda. Stejné ceny překážek platí pro umístění obydlí
  ([populace](population.md)) – jedna tabulka pro celou hru.

- **Založení je stavba:** dostává společnou práci vsi stejně jako stavby obydlí (rovným dílem
  s ostatními rozestavěnými stavbami – populace). Díly se zpřístupňují postupně, nejbližší
  k obydlím první; hotový díl ves může osít v nejbližším vhodném období (návrh Clauda).
- Odstraněné stromy a kameny **z krajiny sídla zmizí natrvalo** (Martin). Vykácené dřevo
  půjde do zásob vsi, až vznikne mechanika dřeva; do té doby se neeviduje.
- Hráč může čtverce pole přidat, ubrat nebo pole zrušit. Přidaná plocha se zakládá jako nové pole,
  ubraná nebo zrušená zarůstá.

### Kolik ves oseje (rozhodují obyvatelé)

- Každý rok k **1. září** (po sklizni, před podzimním kopáním) ves sama rozhodne, kolik na
  příští rok oseje (návrh Clauda, vychází z Martinova cíle uvolňovat práci): tolik, aby úroda
  pokryla **roční potřebu všech obyvatel a 15 % navíc** (rezerva na ztráty při skladování
  a růst rodiny během roku – kalibrace), ale:
  - nejvýš kolik je dílů, které smí osít (viz Přílohová soustava),
  - nejvýš kolik její práce stihne ve špičkách (jaro, léto – viz Práce; počítá se všechna
    práce po denním minimu – kalibrace z 80 %),
  - když mají zásoby víc než 1,5 roční potřeby, jen potřebu bez rezervy.
- Které díly oseje, určuje pořadí v Přílohové soustavě.

### Přílohová soustava – co se oseje a co leží ladem

Výchozí osevní systém je přílohová soustava raných Slovanů (Martin). Pravidla (návrh Clauda):

- **Osev:** díl se osévá rok po roku, dokud jeho aktuální úrodnost neklesne pod **70 %**
  přirozené. Osetý rok ji sníží o 12 % přirozené, takže čerstvý díl se oseje **3 roky** po sobě
  (100 → 88 → 76 → 64 %). Pak jde do **přílohu**.
- **Příloh:** díl leží ladem bez péče a zarůstá (viz Zarůstání). Úrodnost se mu vrací o 5 %
  přirozené za rok (nejvýš na přirozenou) – z 64 % se na **95 %** dostane za **7 let**. Jeden
  oběh dílu tak trvá zhruba 10 let a oseto je v průměru asi 30 % půdy: ves potřebuje pole
  **≈ 3,3× větší než osev** (dvojpolní systém by potřeboval 2×).
- **Smí se osít** díl, jehož aktuální úrodnost je aspoň 70 % přirozené.
- **Pořadí:** k 1. září ves vybírá díly na příští rok v tomto pořadí, dokud nepokryje potřebu
  (viz Kolik ves oseje):
  1. díly, které se už osévají a smějí dál,
  2. čerstvě založené díly (plná úrodnost, vymýcený les s bonusem – viz Úroda),
  3. přílohy zotavené aspoň na 95 % – nejmladší první (nejlevnější vrácení), při shodě
     nejbližší,
  4. když to nestačí, i přílohy zotavené na 70–95 % – nejvíc zotavené první.
- **Vrácení přílohu do osevu** stojí práci podle toho, jak díl zarostl (viz Práce a Zarůstání).
  V přílohové soustavě je to běžná součást oběhu, ne trest.
- **Příliš velké pole:** díly, které ves pro svou potřebu nevybere, dál leží v přílohu a stárnou
  – po 15 letech je z nich les. Práce vložená do jejich založení přišla vniveč, a až je ves bude
  potřebovat, zaplatí za ně znovu (mýcení). Tak ves část pole „neobdělá a ta zarůstá“ (Martin),
  i když má volnou práci.
- Když ves nemá práci ani na potřebný osev (málo lidí na potřebu), oseje méně, než by
  potřebovala – ves pak hladoví (Zásoby a nasycení).

### Práce

Navazuje na pracovní sílu z [populace](population.md) (dospělý 1 člověkoden za den, starší
0,5, dítě 7–13 let 0,3). Pole jsou společná, a proto se práce počítá **za celou ves**:
dospělí všech domácností pracují na společných polích (Martin). Ves práci rozděluje v tomto
pořadí (návrh Clauda; nahrazuje pevných 85 % a dělení práce po domácnostech v populaci):

1. **Denní minimum domácností** – vaření, voda, oheň, péče o malé děti: 0,5 člověkodne denně
   na každou domácnost.
2. **Polní práce v jejich období** (tabulka níže) – a sezónní práce v sadech (sklizeň jablek,
   péče) podle konce svého okna ([sad](orchard.md)).
3. **Opravy obydlí** (populace).
4. **Domácí výroba** – oděv, nádobí, jednoduché železné předměty, palivo: v průměru 0,3
   člověkodne denně na domácnost + 0,15 na člověka. Dá se odkládat a dělá se hlavně v zimě;
   nedodělaná se přenáší, nejvýš za 60 dní, a má přednost před společnou prací.
5. Zbytek je **společná práce vsi** – stavby obydlí a zakládání polí (populace).

**Polní práce při ruční práci** (člověkodny na osetý hektar za rok – návrh Clauda):

| Práce                      | Kdy (kalendář)                           | Člověkodny / ha |
| -------------------------- | ---------------------------------------- | --------------- |
| kopání motykou             | podzim (září–listopad) nebo březen–duben | 80              |
| setí a zahrabání           | březen–duben                             | 10              |
| pletí                      | květen–červen                            | 30              |
| sklizeň srpem a vázání     | červenec–srpen                           | 30              |
| odnos úrody v nůších       | červenec–srpen                           | 20              |
| výmlat cepem               | listopad–únor                            | 30              |
| **celkem na osetý hektar** |                                          | **200**         |

- **Vzdálenost:** práce na dílu je o 1 % dražší za každých 10 m nad 100 m od nejbližšího
  obydlí (chůze, nošení v nůších – návrh Clauda). Díl 500 m daleko stojí o 40 % víc práce.
- **Včasnost:** co se v období nestihne, propadá: nezasetý díl se ten rok nesklidí, neopletý
  dá nižší úrodu, nesklizená úroda shnije na poli, nevymlácené do konce února se zkazí (návrh
  Clauda; přesné podíly doladí kalibrace).
- **Na jaře se nejdřív seje, co je zkopané,** a teprve zbytek práce jde do dalšího kopání
  (kalibrace). Pole, které se do konce dubna nedokope, tak dá aspoň úrodu zkopané části – dřív
  kopání předbíhalo setí a nedokopané pole nedalo nic.
- **Plete a sklízí se jen zasetá část, mlátí jen sklizená** (kalibrace): nezasetá půda práci
  nebere a úroda zaseté části se za nezasetou nesráží podruhé – pletí a sklizeň se měří vůči
  zaseté ploše.
- **Vrácení přílohu** do osevu (podzim září–listopad, před kopáním – návrh Clauda) stojí práci
  navíc podle stáří přílohu: 1–2 roky nic, 3–5 let (louka, drn) 40 člověkodní na hektar,
  6–10 let (mladý nálet – vypálí se) 60, 11–15 let (husté křoviny) 150, víc než 15 let (les)
  250 jako mýcení. V běžném oběhu se příloh vrací po 7–8 letech, tedy za 60 na hektar.

### Úroda

- **Hrubá úroda** osetého hektaru při plné a včasné práci: **760 kg × (0,4 + 0,6 × aktuální
  úrodnost / 100)** – na čerstvém dílu s úrodností 70 asi 625 kg, v průměru tří let osevu
  (aktuální úrodnost ≈ 88 % přirozené) asi 585 kg; při přirozené úrodnosti 45 v průměru osevu
  asi 485 kg (návrh Clauda).
- **Osivo:** 175 kg na hektar se z úrody odloží na příští osev a nejí se (výnos asi 1 : 3,3,
  raný středověk 1 : 3). Do zásob jde čistá úroda.
- Úroda se sníží podle nedodělané práce (pletí, sklizeň, odnos – viz Včasnost).
- **Úrodnost:** osetý rok sníží aktuální úrodnost dílu o 12 % přirozené, rok v přílohu ji
  o 5 % přirozené vrátí, nejvýš na přirozenou (viz Přílohová soustava – návrh Clauda).
- **Vymýcený les:** popel z pálení dá dílu první 3 roky po založení úrodnost o 20 vyšší (nejvýš 100) – právě na jednu fázi osevu. Pak platí přirozená úrodnost políčka z krajiny (návrh Clauda
  – žďáření, půda po vypálení je nejúrodnější). Stejně i příloh, který zarostl v les a ves ho
  znovu vymýtí.
- **Bez náhody** – stejná práce na stejné půdě dá stejnou úrodu (Martin). Dobré a špatné roky
  přijdou až s mechanikou počasí; hájení z [populace](population.md) se pak rozšíří i na
  neúrodu.

### Zásoby a nasycení

- Čistá úroda jde do **společných zásob vsi** (návrh Clauda – ves drží společné zásoby).
- **Potřeba jídla z pole** (kg obilí za rok): dospělý 180, starší 140, dítě 100.
- **Zbytek stravy** (zahrada, sběr, ryby, drobné hospodářství) se zatím nemodeluje a bere se jako
  pokrytý. Domácí výroba je jen spotřeba práce – její nedodělání nasycení nesnižuje (návrh
  Clauda). Nasycení tak závisí jen na zásobách obilí, jak čeká [populace](population.md) – se
  sadem na obilí a jablcích, která se jí přednostně ([sad](orchard.md)).
- **Ztráty při skladování:** 10 % zásob za rok (myši, plíseň), rozložené rovnoměrně.
- **Přídělový systém:** dokud zásoby vystačí do příští sklizně, jí ves dosyta (nasycení 1).
  Když nevystačí, obyvatelé rozdělí to, co zbývá, rovnoměrně do sklizně – nasycení je podíl
  zásob a potřeby do sklizně (návrh Clauda). Ves tak hladoví postupně, ne ze dne na den.
- **Start:** osadníci přinesli zásoby a osivo na **18 měsíců** potřeby (návrh Clauda) – ves
  přežije i založení těsně po jarním setí.
- **Hlad ves nezničí** (návrh Clauda, podle anti-cíle populace): hlad tlumí porody a zvyšuje
  úmrtnost, ale jen dokud se počet lidí nesrovná s tím, co pole a zásoby uživí. Ves se zmenší,
  ale nevymře, dokud má pole, které obdělává. **Hájení** z populace chrání i před smrtí hladem.

### Zarůstání

- Příloh i díl odebraný z pole zarůstají podle let bez péče (návrh Clauda):
  - **1–2 roky:** mladý příloh (plevel, tráva) – vrácení bez práce navíc,
  - **3–5 let:** **louka** (drn),
  - **6–10 let:** **mladý nálet** (keře a stromky – vypálí se),
  - **11–15 let:** **husté křoviny**,
  - **víc než 15 let:** **les** – v datech krajiny sídla je z dílu les; vrátit ho do osevu stojí
    mýcení (a dá bonus úrodnosti jako vymýcený les).
- **Přirozená louka**, která nikdy nebyla polem, zůstává loukou (návrh Clauda – louky se zatím
  nemění).
- **Ve scéně** (návrh Clauda): mladý příloh a louka jako tráva, mladý nálet a křoviny jako keře
  a mladé stromky (dekorace), les z náletu jako **hustý porost mladých stromků** (stávající
  modely mladých stromů). Okolí vsi tak tvoří pestrou mozaiku polí a přílohů v různém stadiu. Plnohodnotný les s okrajem ze 3D stromů a impostory uvnitř přijde později – scéna
  pro to zatím není stavěná.

### Krajina sídla a scéna

- Změny (pole, vykácené stromy, odstraněné kameny, zarůstání) se ukládají jako **stav sídla nad
  vygenerovanou krajinou**.
- **Překážky jsou herní data** (návrh Clauda): kameny, balvany, skalní výchozy, stromy mimo les
  (osamělé, břehové, řady okraje lesa zasahující do louky, borovice, mladé stromky), keře, souše,
  padlé stromy a pařezy dnes vznikají jen ve scéně (`decor-placement.ts`, `meadow-trees.ts`,
  `woodland-placement.ts` – „jen vzhled“). Server je jediná autorita a cenu musí počítat z toho,
  co hráč vidí, proto se jejich rozmístění přesune do `packages/game` jako nová **verzovaná
  vrstva krajiny** a scéna je bude kreslit z ní. Po ostrém spuštění se vrstva nesmí měnit
  (stejně jako ostatní vrstvy). Je to největší přestavba, kterou tyto mechaniky vyžadují.
- **Co je překážka a za kolik** (doplňuje tabulku výše – návrh Clauda): každý strom mimo políčka
  lesa jako osamělý strom (3 člověkodny), mladý stromek 1, souš 3, padlý strom 2, pařez 2.
  Uvnitř políček lesa platí sazba lesa za hektar (stromy v ceně). **Obydlí v lese** platí místo
  sazby za hektar stromy po kusech na ploše 10 × 10 m kolem půdorysu (v lese zhruba 5 stromů,
  ≈ 15 člověkodní navíc).
- Scéna dnes staví les (hranici lesa, 3D stromy, impostory, koruny), dekorace i stínovou mapu
  **jednou z vygenerované krajiny**. Nově musí umět krajinu sídla po změně přestavět – aspoň
  dotčenou oblast: vykácené stromy a odstraněné kameny zmizí, nové pole se vykreslí, stínová
  mapa se překreslí. Změnu hráč uvidí **bez nového načtení stránky** (cíl; jak – viz Na
  stavitelovi).
- **Stav (vrstva překážek, 17. 10. 2026):** rozmístění stromů, keřů a kamenů je v
  `packages/game/src/domain/landscape/obstacles/` – vrstva krajiny `obstacles` verze 1 s vlastním
  seedem, scéna ji jen kreslí. Každá překážka má stabilní id, polohu, druh (strom, mladý stromek,
  souš, padlý strom, pařez, keř, kámen, balvan, skalní výchoz), podobu (model, z ní dřevina)
  a jestli ji scéna kreslí 3D modelem, nebo obrázkem (vnitřek lesa). Vrstvu generuje server
  i prohlížeč stejnou funkcí ze stejných dat (deterministicky, ověřeno testem), nepřenáší se.
  Ceny podle tabulky výše počítá `placement.ts` z překážek, které na místě opravdu stojí:
  obydlí platí kusy na vyklízené ploše kolem půdorysu (staveniště ≈ 10 × 12 m), díl pole kusy
  v políčku; skalní výchoz pod obydlím stavbu nedovolí, v poli zůstane a plocha pod ním (kruh
  o poloměru 3 m × velikost skály) se do dílu nepočítá. Čtverec hřbitova platí překážky jako
  díl pole; skalní výchoz ho zablokuje, protože hroby jdou na čtverec v pevné mřížce
  ([hřbitov](cemetery.md)). Odstraněné překážky zmizí natrvalo: u obydlí (i první zemnice
  při založení vsi) při zahájení stavby, u pole s každým založeným dílem (jak říká Zakládání),
  u hřbitova s dostavěním hřbitova nebo rozšíření. Scéna je
  skryje bez nového načtení stránky. **Zatím ne:** ztmavená tráva pod stromy, tmavá plocha korun
  a stínová mapa terénu se po vykácení nepřepočítají (na pasece zůstane tmavší skvrna); zarostlý
  příloh (les z náletu) ani rušení polí odstraněné překážky nevrací; cenu překážek rozhraní
  zatím neukazuje (pravidlo rozhraní: u kurzoru žádné souhrny, jen důvod, proč stavba nejde) –
  kontroly umístění ji spočítají a stavba ji zaplatí prací.

## Ukázka

Startovní ves (jedna domácnost: 2 dospělí a 2 dospívající – viz populace), pole na louce
s úrodností 70 do 100 m od obydlí:

- potřeba 2 × 180 + 2 × 100 = 560 kg, s rezervou 15 % **≈ 645 kg** za rok,
- čistá úroda hektaru v průměru osevu ≈ 585 − 175 = 410 kg → oseje **≈ 1,6 ha** (≈ 70 políček
  krajiny); když mají zásoby víc než 1,5 roční potřeby, jen potřebu (≈ 1,4 ha),
- první 3 roky stačí pole ≈ 1,6 ha; pak každý rok třetina osevu (≈ 0,5 ha) odchází do přílohu
  a ves potřebuje další díly – v ustáleném oběhu pole **≈ 5,3 ha** (≈ 235 políček),
- práce v ustáleném oběhu (měření): osev a vrácení přílohů ≈ 300 člověkodní, denní minimum
  ≈ 185, domácí výroba ≈ 330, dohromady ≈ 815, tedy **≈ 86 %** z ≈ 950 člověkodní, které ves
  za rok má – společné práce zbývá ≈ 14 % (populace počítala s 15 %),
- špičky stihne: na jaře (polovina kopání na podzim) i v létě při sklizni potřebuje asi dvě
  třetiny práce, která zbývá po denním minimu.

Plná domácnost (4 dospělí a 2 malé děti) potřebuje s rezervou ≈ 1 060 kg, tedy osev ≈ 2,6 ha
a v ustáleném oběhu pole ≈ 9 ha; na obživu jí padne ≈ 79 % práce. Na přirozené úrodnosti 45
(průměr luk v okolí vsi) potřebuje osev ≈ 3,4 ha a pole ≈ 11 ha a obživa jí vezme ≈ 90 % práce
– na chudé půdě ves sotva roste.

**Kolik půdy je:** do 600 m od místa vsi je typicky jen ≈ 35 ha luk s průměrnou úrodností
≈ 45, z toho ≈ 14 ha s úrodností aspoň 60, skoro vše do 300 m (měření na 60 krajinách).
S přílohovou soustavou louky uživí jen zhruba **3–4 domácnosti** – mýcení lesa patří k růstu
vsi od začátku (Martin). Hektar lesa stojí 250 člověkodní a vymýcená půda má 3 roky bonus
úrodnosti; ves se třemi domácnostmi ho zvládne zhruba za půl roku společné práce.

## Kalibrace

Měřicí skript (jako u populace) ověří:

- startovní ves s osevem ≈ 1,7 ha na úrodnosti 70 je nasycená a v ustáleném oběhu (pole
  ≈ 5,6 ha) dává na obživu 85–90 % práce,
- plná domácnost se uživí z osevu ≈ 2,7 ha (pole ≈ 9 ha) a dává na obživu ≈ 80 %,
- díl se v běžném oběhu oseje 3 roky po sobě a do osevu se vrací po 7–8 letech přílohu,
- ves s polem o polovinu větším, než oběh potřebuje, nadbytečnou část nevybírá – ta zůstává
  v přílohu a po 15 letech je z ní les,
- ves s poli přiměřené velikosti drží zásoby mezi 1 a 1,5 roční potřeby a nasycení ≥ 0,95
  po 95 % let,
- startovní ves stihne jarní i letní práce s rezervou aspoň 20 %,
- na typické krajině uživí louky v okolí 3–4 domácnosti; ves, která mýtí les, roste dál,
- cíle populace platí dál i se skutečným jídlem místo pevných 85 % (první stavba u 90 % vsí
  do ≈ 8 let).

**Naměřeno** (`packages/game/scripts/measure-village.ts 200 60`, 17. 10. 2026 – syntetická louka
s úrodností 70, hráč drží pole na osev × 3,3, strategie v hlavičce skriptu). Kalibrace zvýšila
rezervu osevu z 10 na 15 %, domácí výrobu z 0,12 na 0,15 člověkodne na člověka a strop osevu
na všechnu práci ve špičce (z 80 %); na jaře se nově nejdřív seje, co je zkopané. Po finální
revizi se plete a sklízí jen zasetá část a odemčení nového obydlí počítá jen dospělé 14–44
(population.md) – hodnoty níže jsou z měření po těchto opravách:

- startovní ves: osev ≈ 1,6 ha, pole ≈ 5,3 ha, nasycená, na obživu ≈ 86 % práce – splněno,
- plná domácnost: osev ≈ 2,6 ha, pole ≈ 8,8 ha, na obživu ≈ 79 % – splněno,
- díl se oseje 3 roky a 7 let leží v přílohu (90 % dílů 7–9 let); z pole o polovinu většího
  zaroste v les ≈ 35 % plochy, první díl po 16 letech – splněno,
- startovní ves má ve špičkách rezervu práce ≈ 34 % (jaro) a ≈ 35 % (léto) – splněno,
- syntetická louka (35 ha, úrodnost 70 – úrodnější než typická) dojde při ≈ 4 domácnostech
  (před opravami ≈ 5),
- ves, kde hráč staví, kdykoli může, je nasycená (≥ 0,95) v ≈ 94 % let (před opravami 92 %;
  bez staveb v 98 %; nejhorší 1 % let s nasycením 0,76, 5 % s 0,92) – cíl 95 % zatím ne,
  **doladí se hraním (Martin – prototyp)**. Zbytek hladu: strop osevu podle práce ve špičkách
  nepočítá se vzdáleností dílů ani s vracením přílohů a rostoucí ves má hodně malých dětí,
  takže práce ve špičce nestačí na osev pro všechny,
- zásoby po sklizni: 10. percentil 1,12, medián 1,35, 90. percentil 1,56 (před opravami 1,08,
  1,33 a 1,54) – mezi 1 a 1,5 roční potřeby v ≈ 79 % let (horní hranici přetáhne jedna bohatá
  sklizeň nebo úmrtí během roku).

## Co hráč vidí

Ovládání a vzhled jsou **návrh k potvrzení na náčrtech** (obydlí se umisťují podle
[populace](population.md) – půdorys kamkoli, kde je dost rovná země):

- **Založení pole:** ikona pole v mřížce staveb (jako v 0 A.D.), hráč tažením označí čtverce na
  mřížce políček (jako v realtime strategiích; Martin), s Ctrl je ubírá. Bez souhrnu
  a nápověd (Martin, 17. 10. 2026: „Odstraň všechny popisky – hráč nepotřebuje průvodce.“):
  čtverce jsou zelené (pole projde), žluté (ještě ne) a červené (sem pole nesmí), u kurzoru jen
  krátký důvod, proč pole neprojde. Výměru, úrodnost a stadia dílů ukáže panel vybraného pole.
- **Zakládání:** pole se zakládá jako stavba – hotové díly se postupně zbarví, stromy
  a kameny z nich zmizí.
- **Panel pole** (výběr kliknutím): výměra, úrodnost, kolik dílů se zakládá, je oseto a leží
  v přílohu podle stadia (mladý příloh, louka, nálet, křoviny, les) – ikony a čísla. Očekávaná
  úroda a jestli práce stačí – později.
- **Horní lišta:** zásoby obilí, volná společná práce za den, nasycení (barva ikony).
- **Ve scéně:** pole na terénu podle ročního období – oraniště (jaro), zelené a zlaté obilí,
  strniště, přílohy v různém stadiu zarůstání (tráva, vyšší tráva, keře, nálet mladých
  stromků) – kolem vsi pestrá mozaika, hranice pole (mez). 3D a textury jsou samostatný úkol.
- **Kronika:** založení pole, sklizeň (kolik), hlad, díl pole zarostl v les.

## Navazuje

- **Lepší nástroje a osevní systémy** – hlavní cesta, jak práci na jídle uvolnit (Martin):
  rádlo a tažná zvířata (kopání → orba), kosa; **dvojpolní** systém (pole trvale v osevu, střídá
  se osev a úhor – potřeba půdy klesne z ≈ 3,3× na 2× osevu a odpadne vracení přílohů), později
  **trojpolní** (ozim, jař, úhor – 1,5× osevu, hnojení od dobytka). Každý krok uvolní půdu
  i práci.
- **Počasí** – dobré a špatné roky úrody (Martin: náhoda až s počasím); hájení se pak rozšíří
  i na neúrodu.
- **Druhy plodin** (ozim a jař, proso, luštěniny), **zvířata, seno a pastva**, **les a dřevo**
  (využití vykáceného dřeva), zahrady a rybolov.

## Na stavitelovi

- Přesné vzorce včasnosti, rozdělení
  práce během dne a sezóny, pořadí osevu a zakládání dílů – tak, aby splnily cíle v Kalibraci.
- Krok simulace a dopočítání vsi (společně s populací; výsledek nesmí záviset na tom, kdy se
  dopočítává).
- Datový model stavu sídla nad krajinou a jak scéna přestaví dotčenou oblast (celé přestavění
  krajiny se zachováním kamery je přijatelné, pokud je dost rychlé).
- Podoba panelů a označování čtverců.

## Rozhodnutí

| Rozhodnutí                                                                                   | Kdo                           |
| -------------------------------------------------------------------------------------------- | ----------------------------- |
| Pole = celá zemědělská půda; obdělává se jen část, zbytek ladem podle středověkých systémů   | Martin                        |
| Zpočátku jen ruční práce; příliš velké pole ves neobdělá a část zarůstá                      | Martin                        |
| Pole jsou samostatná a společná pro celou ves; zakládá je hráč zvlášť                        | Martin                        |
| Pole se vyznačí volným obrysem na zemi; jde i do lesa, překážky prodraží založení            | Martin                        |
| Změna: pole se staví po čtvercích – políčkách krajiny (místo volného obrysu)                 | Martin                        |
| Ves se zakládá zemnicí; pole přidá hráč, kdy chce (dřív zemnicí a prvním polem)              | Martin (17. 10. 2026)         |
| Odstraněné stromy a kameny zmizí natrvalo; dřevo do zásob až s mechanikou dřeva              | Martin                        |
| Hráč určuje, kde pole jsou a jak velká; kolik se oseje, rozhoduje ves podle potřeby          | návrh Clauda, Martin potvrdil |
| Ležení ladem obnovuje úrodnost, osev ji vyčerpává; systém se časem zlepšuje                  | návrh Clauda, Martin potvrdil |
| Pole nahradí 85 %; nástroje a systémy uvolní práci                                           | návrh Clauda, Martin potvrdil |
| Práce podle ročních období, sklizeň do zásob → nasycení                                      | návrh Clauda, Martin potvrdil |
| Úroda podle úrodnosti, práce a včasnosti; zarostlá půda → louka → les                        | návrh Clauda, Martin potvrdil |
| Díly pole po políčkách krajiny; max 800 m od obydlí, min 0,1 ha                              | návrh Clauda                  |
| Ceny založení: louka 40, křoviny 150, les 250 člověkodní/ha; tabulka překážek                | návrh Clauda                  |
| Založení jako stavba ze společné práce, díly postupně od obydlí                              | návrh Clauda                  |
| Ves oseje k 1. 9. potřebu + 15 % (kalibrace z 10 %)                                          | návrh Clauda                  |
| Příloh se neudržuje a zarůstá; nevybrané díly stárnou až v les                               | návrh Clauda                  |
| Práce za celou ves: pořadí, denní minimum, domácí výroba (jen práce, přenos max 60 dní)      | návrh Clauda                  |
| Práce 200 člověkodní/ha, výnos 760 kg × úrodnost, osivo 175 kg, potřeba 180/140/100          | návrh Clauda                  |
| Vymýcený les +20 úrodnosti na 3 roky; vzdálenost +1 % / 10 m                                 | návrh Clauda                  |
| Společné zásoby vsi, ztráty 10 %, přídělový systém, start se zásobami na 18 měsíců           | návrh Clauda                  |
| Přirozená louka nezarůstá; les z náletu ve scéně jako mladé stromky                          | návrh Clauda                  |
| Překážky jako verzovaná vrstva krajiny v `packages/game`; co je překážka a za kolik          | návrh Clauda                  |
| Hlad ves zmenší, ale nezničí; hájení chrání i před hladem                                    | návrh Clauda                  |
| Výchozí osevní systém: přílohová soustava raných Slovanů                                     | Martin                        |
| Úroda zatím bez náhody – dobré a špatné roky až s počasím (pak hájení i na neúrodu)          | Martin                        |
| Přílohová soustava: osev do 70 % úrodnosti (≈ 3 roky), příloh do 95 % (≈ 7 let), pořadí dílů | návrh Clauda                  |
| Vrácení přílohu podle stadia: louka 40, nálet 60, křoviny 150, les 250 člověkodní/ha         | návrh Clauda                  |
| Jedno obilí                                                                                  | návrh Clauda                  |
| Ovládání (čtverce na mřížce, panely, vzhled) – ladí se na prototypu                          | návrh Clauda                  |
