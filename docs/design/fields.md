# Pole a jídlo vesnice

Stav: schváleno 17. 10. 2026 (Martin). Týž den změna (Martin, po prvním prototypu): **pole se
staví po čtvercích** – políčkách krajiny 15 × 15 m, jak je obvyklé v realtime strategiích – místo
volného obrysu. Týž den **oprava čísel podle rešerše** (Martin: „Ano, zapracuj i ostatní opravy.“ –
[rešerše](research/2026-10-17-zemedelstvi-populace.md)) a **meze produktivity** (viz níže).
Implementace jádra: `packages/game/src/domain/village/`. **Pole v křovinách a v lese
implementováno 18. 10. 2026:** povrch dílu (`fieldSquareSurface`), sazby povrchu se stromy
a keři v ceně, klády z mýcení a popel z vymýceného lesa; scéna a minimapa vymýcený les
přestanou kreslit jako les (viz Krajina sídla a scéna). **Ozim a jař s podzimním kopáním
(18. 10. 2026)** – návrh Clauda, Martin schválil směr; implementováno (`sowing.ts`,
`year-plan.ts`), viz Ozim a jař.

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
- **Ne-cíl (teď):** druhy plodin (zatím jedno „obilí“), lepší nástroje (**rádlo a voli později
  – Martin**; pluh, kosa),
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
- **Meze produktivity** – horní a dolní mez práce nebo ztrát, viz níže.

## Pravidla

### Meze produktivity

Martin (17. 10. 2026): „Zatím uvažuj jen motyky. Voly a rádlo přidáme později. … Ta produktivita
má nějaké meze. Bez řemeslníků ber tu nejhorší hranici, s řemeslníky tu nejlepší.“

- Každá práce nebo ztráta, kde literatura dává rozpětí, má **horní mez** (ves bez řemesel)
  a **dolní mez** (plně pokrytá potřeba výrobků řemeslníků); mezi nimi se hodnota posouvá
  lineárně podle pokrytí 0–1 ([řemesla](crafts.md)). Kde literatura dává jedno číslo, platí
  obojí.
- **Kovář** (nástroje) posouvá práci – polní práce, zakládání polí a vracení přílohu; **hrnčíř**
  (nádoby) ztráty zásob a denní minimum domácností.
- **Řemesla zatím nejsou**, takže dnes platí všude horní mez. V tabulkách níže je dolní mez
  v závorce („s řemesly“).

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

  | Povrch dílu (za hektar)              | Práce navíc (s řemesly)             | Zdroj             |
  | ------------------------------------ | ----------------------------------- | ----------------- |
  | louka – rozrušení drnu               | 100 člověkodní (90)                 | Semjonov 1974     |
  | křoviny – vysekání a vytrhání kořenů | 100 člověkodní (60)                 | Rösch a kol. 2017 |
  | les – kácení, pálení, klučení pařezů | 250 člověkodní (150), stromy v ceně | Rösch a kol. 2017 |

  | Překážka na louce (za kus) | Práce navíc                                                |
  | -------------------------- | ---------------------------------------------------------- |
  | kámen                      | 1 člověkoden                                               |
  | balvan                     | 8 člověkodní                                               |
  | osamělý strom              | 3 člověkodny                                               |
  | keř                        | 0,5 člověkodne                                             |
  | skalní výchoz              | neodstraní se – pole ho obejde, plocha pod ním se nepočítá |

  Ceny povrchu jsou oprava podle rešerše (dřív 40 / 150 / 250): panenský drn jde motykou
  ≈ 2,5× pomaleji než lehká půda (Semjonov 1974), 15letý porost stojí ≈ 49 dní na hektar
  kamennými sekerami (Rösch a kol. 2017); žďár bez klučení pařezů přijde s další mechanikou.
  Překážky jsou návrh Clauda. Stejné ceny překážek platí pro umístění obydlí
  ([populace](population.md)) – jedna tabulka pro celou hru.

- **Povrch dílu** (návrh Clauda, implementace 18. 10. 2026): **les** podle krajiny (políčko
  lesa). **Křoviny** krajina jako povrch nezná – čtverec louky je křovinami, když by jeho keře
  po kusech stály aspoň tolik, o kolik je sazba křovin (podle pokrytí nástroji) dražší než louka.
  Cena tak s přibývajícími keři plynule roste až po sazbu křovin. S čísly z rešerše stojí
  křoviny bez řemesel stejně jako louka (100) a s kovovými nástroji méně (60 proti 90) – rozdíl
  sazeb je ≤ 0, takže křovinami je každý čtverec louky s keřem (keřový lem lesa, keřové
  ostrůvky) a keře jsou v ceně (sloučení větví 18. 10. 2026; s dřívějšími sazbami 40 / 150 to
  bylo od 5 keřů na políčku).
- **Co je v sazbě povrchu:** v lese stromy i se suchými, padlými kmeny, pařezy a podrostem
  („stromy v ceně“), v křovinách keře – ty se po kusech neplatí. Po kusech se na lesním čtverci
  platí jen kameny a balvany, v křovinách i stromy. Odstraní se ale všechno, co na čtverci stojí
  (kromě skalních výchozů), a dospělé stromy, které nevyhradila stavba obydlí, dají po založení
  dílu klády ([les a dřevo](forest.md)).

- **Založení je stavba:** dostává společnou práci vsi stejně jako stavby obydlí (rovným dílem
  s ostatními rozestavěnými stavbami – populace). Díly se zpřístupňují postupně, nejbližší
  k obydlím první; hotový díl ves může osít v nejbližším vhodném období (návrh Clauda).
- Odstraněné stromy a kameny **z krajiny sídla zmizí natrvalo** (Martin). Dospělé stromy dají
  klády na hromadu vsi – strom = kláda ([les a dřevo](forest.md) – Mýcení a hromada klád).
- Hráč může čtverce pole přidat, ubrat nebo pole zrušit. Přidaná plocha se zakládá jako nové pole,
  ubraná nebo zrušená zarůstá.

### Kolik ves oseje (rozhodují obyvatelé)

- Každý rok k **1. září** (po sklizni, před podzimním kopáním) ves sama rozhodne, kolik na
  příští rok oseje (návrh Clauda, vychází z Martinova cíle uvolňovat práci): tolik, aby úroda
  pokryla **roční potřebu všech obyvatel a 15 % navíc** (rezerva na ztráty při skladování
  a růst rodiny během roku – kalibrace), ale:
  - nejvýš kolik je dílů, které smí osít (viz Přílohová soustava),
  - nejvýš kolik její práce stihne ve špičkách (podzim, jaro, červenec a srpen – viz Ozim a jař;
    počítá se všechna práce po denním minimu – kalibrace z 80 %),
  - když mají zásoby víc než 1,5 roční potřeby, jen potřebu bez rezervy.
- Které díly oseje, určuje pořadí v Přílohové soustavě; čím je oseje (ozim, nebo jař), rozhodne
  ves zároveň (viz Ozim a jař).

### Přílohová soustava – co se oseje a co leží ladem

Výchozí osevní systém je přílohová soustava raných Slovanů (Martin). Pravidla (návrh Clauda):

- **Osev:** díl se osévá rok po roku, dokud jeho aktuální úrodnost neklesne pod **70 %**
  přirozené. Osetý rok ji sníží o 12 % přirozené, takže čerstvý díl se oseje **3 roky** po sobě
  (100 → 88 → 76 → 64 %). Pak jde do **přílohu**.
- **Příloh:** díl leží ladem bez péče a zarůstá (viz Zarůstání). Úrodnost se mu vrací o **2,5 %**
  přirozené za rok (nejvýš na přirozenou) – z 64 % se na **95 %** dostane za **13 let** a vrací se
  ve stadiu křovin, ještě než zaroste v les. Jeden oběh dílu tak trvá zhruba 16 let a oseto je
  v průměru asi 19 % půdy: ves potřebuje pole **≈ 5,3× větší než osev** (dvojpolní systém by
  potřeboval 2×). Oprava podle rešerše (dřív 5 % a 7 let): pole z drnu se užívala 2–3 roky
  a pak ležela ladem 20 i více let (Beranová 1980), trávopolní soustava 15–20 let, žďár ≈ 12 let
  (Rösch a kol. 2017). **K potvrzení:** rozhodnutí znělo +2 % za rok s cílem 12–13 let, jenže
  +2 % vede z 64 % na 95 % až za 16 let (12–13 let platí od 70 %) a každý příloh by zarostl
  v les – proto 2,5 % (rešerše uvádí 2–2,5 %).
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
   na každou domácnost (s hrnčířem 0,45; FAO: venkovské ženy 0,5–0,6 dne).
2. **Polní práce v jejich období** (tabulka níže) – a sezónní práce v sadech (sklizeň jablek,
   péče) podle konce svého okna ([sad](orchard.md)).
3. **Opravy obydlí** (populace).
4. **Domácí výroba** – oděv, nádobí, jednoduché železné předměty, palivo: v průměru 0,3
   člověkodne denně na domácnost + 0,15 na člověka. Dá se odkládat a dělá se hlavně v zimě;
   nedodělaná se přenáší, nejvýš za 60 dní, a má přednost před společnou prací.
5. Zbytek je **společná práce vsi** – stavby obydlí a zakládání polí (populace).

**Polní práce při ruční práci** (člověkodny na osetý hektar za rok, v závorce s řemesly – oprava
podle rešerše, dřív 200 – kopání 80, výmlat 30). Zatím jen motyky; **rádlo a voli později
(Martin)** – rádlo by zpracování půdy zkrátilo na ≈ 5–15 člověkodní na hektar, drn ale dál chce
motyku nebo oheň (Semjonov 1974).

| Práce                      | Kdy – ozim    | Kdy – jař                                   | Člověkodny / ha | Zdroj                 |
| -------------------------- | ------------- | ------------------------------------------- | --------------- | --------------------- |
| kopání motykou             | září–říjen    | podzim (září–listopad), zbytek březen–duben | 100 (50)        | Semjonov 1974         |
| setí a zahrabání           | září–říjen    | březen–duben                                | 10              | nedohledáno           |
| pletí                      | květen–červen | květen–červen                               | 30 (15)         | FAO                   |
| sklizeň srpem a vázání     | červenec      | srpen                                       | 30 (15)         | Halstead a Jones 1989 |
| odnos úrody v nůších       | červenec      | srpen                                       | 20              | nedohledáno           |
| výmlat cepem a převívání   | listopad–únor | listopad–únor                               | 15 (10)         | Clark 2007 (EB 1911)  |
| **celkem na osetý hektar** |               |                                             | **205 (120)**   |                       |

Ozim a jař se liší jen kalendářem (viz Ozim a jař) – sazby práce, osivo a úroda jsou stejné.

První sezónu po vymýcení lesa se díl **neplete** (viz Úroda).

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
  navíc podle stáří přílohu (v závorce s řemesly – oprava podle rešerše, dřív 40 / 60 / 150 /
  250): 1–2 roky nic, 3–5 let (louka, drn) 100 člověkodní na hektar (90), 6–10 let (mladý nálet –
  vypálí se) 100 (60), 11–15 let (husté křoviny) 100 (60), víc než 15 let (les) 250 (150) jako
  mýcení (Semjonov 1974, Rösch a kol. 2017). V běžném oběhu se příloh vrací po 13 letech
  (křoviny), tedy za 100 na hektar.

### Ozim a jař

Stav: **návrh Clauda, Martin schválil směr 18. 10. 2026** (Martin: „Klidně můžeš už teď
zapracovat mechaniku s ozimí, pokud to odpovídá praxi ranného středověku.“). Řeší jarní úzké
hrdlo práce – po opravě podle rešerše stojí kopání 100 člověkodní na hektar a na jaře práce
sotva stačila na osev (viz Naměřeno).

**Odpovídá to praxi?** Ano, s výhradou pravidelnosti. Raně středověké vsi v Čechách a okolí
pěstovaly vedle sebe ozimé obilí (žito, nahou pšenici) a jarní (ječmen, proso): v Březně je
v poslední fázi (do konce 9. st.) víc žita – ozimu – i ječmene (Pleinerová 2000, cit. Szymański
2002, s. 400), v Žatci v 9.–10. st. převládá nahá pšenice a od 11. st. prudce přibývá žita
a plevelů ozimů, což autoři čtou jako intenzivnější, trojpolní hospodaření (Kočár a kol. 2010),
v kultuře pražského typu na Ukrajině vede ječmen, pak žito a nahá pšenice, proso je 1/10–1/6
(Gorbaněnko 2017). Pokus s žďářením ve Forchtenbergu počítá práci na ozimou pšenici (Rösch
a kol. 2017). Pravidelné střídání ozimu, jaře a úhoru (trojpolí) přichází až později –
v přílohové soustavě ves seje obojí volně (podle výtahu z literatury se u časně středověkých
Slovanů střídání ozimů, jařin a úhoru vyskytovalo, ale ne pravidelně – Beranová; přesné místo
jsem neověřil). Podzimní zpracování půdy je u ozimu nutnost (seje se na podzim); u jaře je
podzimní kopání tradiční praxe (mráz rozdrobí hroudy, půda zadrží zimní vláhu), přímý doklad
pro raný středověk ale nemám – zůstává návrhem Clauda jako dosavadní okno kopání září–listopad.

- **Dvě plodiny** (zatím bez druhů – „ozim“ je žito a pšenice, „jař“ ječmen):
  - **ozim** – vrácení přílohu, kopání a setí v **září–říjnu**, sklizeň v **červenci**, výmlat
    v zimě (listopad–únor),
  - **jař** – kopání na podzim (**září–listopad**), co se nestihne, v **březnu–dubnu**; setí
    v **březnu–dubnu**, sklizeň v **srpnu**, výmlat v zimě.
  - Pletí obou v **květnu–červnu**. Stejné osivo (175 kg/ha), stejná úroda i sazby práce;
    vymrzání ozimu zatím ne (přijde s počasím).
- **Podzimní kopání:** díly v osevu se kopou na podzim (září–listopad); na jaře se kope jen to,
  co podzim nestihl – nahrazuje pevné dělení „polovina kopání na jaře“. Na podzim ves kope
  nejdřív ozim (musí být zasetý do konce října), pak jař.
- **Ves rozhodne k 1. 9.** při plánu osevu (viz Kolik ves oseje): díly bere v pořadí přílohové
  soustavy, dokud nepokryje cíl osevu (potřeba + rezerva, beze změny), a každý dá do **ozimu**,
  pokud podzimní práce stihne jeho vrácení z přílohu, kopání a setí do konce října (po sklizni
  jablek – ta jde v září–říjnu první, viz [sad](orchard.md)) a jeho sklizeň v červenci; jinak do
  **jaře**, pokud se jař vejde do zbytku podzimu (kopání), do jarní práce (setí a kopání, které
  podzim nestihl) a do srpnové sklizně. Co se nevejde nikam, ves letos neoseje. Seje se, co je
  zkopané do včerejška, proto plán v oknech setí (podzim ozimu, jaro) počítá s jedním dnem
  méně – zaseje se i pruh zkopaný poslední den. Sklizeň obilí v modelu končí 31. 8., takže do
  podzimní práce nic nepřetéká.
- **Díly hotové po 1. 9.** (do konce dubna) jdou do plánu jako jař, pokud se vejdou do zbývající
  práce – počítají se jen dny, které z oken ještě zbývají, a práce, kterou plán ještě má.
- **Jídlo:** sklizeň ozimu jde do zásob **31. 7.** (po jídle dne), jaře 31. 8. Přídělový systém
  počítá do 31. 7., když ozim podle odhadu (zasetá plocha – do konce října celá –, plná sklizeň,
  pletí, kolik je hotové) uživí ves od 1. 8. do 31. 8.; jinak do 31. 8.
- **Díly nesou plodinu**; vyčerpání úrodnosti a příloh se počítají po dílech beze změny. Starší
  vsi (díly bez plodiny, plán bez ozimu) dopočítají dál – díl bez plodiny je jař.
- **Ve scéně** ozim na podzim vzejde a přes zimu zůstává zelený (sníh přidávají roční období),
  zraje v červenci; jař leží přes zimu jako zkopaná zem, zezelená na jaře a zraje v srpnu. Stav
  obilí (holá zem, vzešlé osení, zelené a zralé obilí, strniště) odvozuje jádro ze simulace
  (`partCropState` – setí a sklizeň postupují v pořadí dílů plánu); do scény se dostane
  s vzhledem obilí, který se připravuje jinde.
- **Panel pole** ukazuje oseté díly podle plodiny (ikona ozimu a jaře s počtem dílů).

### Úroda

- **Hrubá úroda** osetého hektaru při plné a včasné práci: **760 kg × (0,4 + 0,6 × aktuální
  úrodnost / 100)** – na čerstvém dílu s úrodností 70 asi 625 kg, v průměru tří let osevu
  (aktuální úrodnost ≈ 88 % přirozené) asi 585 kg; při přirozené úrodnosti 45 v průměru osevu
  asi 485 kg (návrh Clauda).
- **Osivo:** 175 kg na hektar se z úrody odloží na příští osev a nejí se (výnos asi 1 : 3,3,
  raný středověk 1 : 3). Do zásob jde čistá úroda.
- Úroda se sníží podle nedodělané práce (pletí, sklizeň, odnos – viz Včasnost).
- **Úrodnost:** osetý rok sníží aktuální úrodnost dílu o 12 % přirozené, rok v přílohu ji
  o 2,5 % přirozené vrátí, nejvýš na přirozenou (viz Přílohová soustava).
- **Vymýcený les:** popel z pálení dá dílu v **první sezóně osevu** úrodnost o **40** vyšší a ve
  **druhé o 20** (nejvýš 100), od třetí platí přirozená úrodnost políčka z krajiny. **První
  sezónu se díl neplete** – vypálená půda je bez plevele a nedodělané pletí ostatních dílů ho
  nesráží. Oprava podle rešerše (dřív +20 na 3 roky): první osev čerstvě vymýcené a vypálené
  plochy dal úrody srovnatelné s dnešním zemědělstvím a sklizeň bez plevele (Rösch a kol. 2017).
  Bonus platí jen do 3 let od vymýcení – díl, který ves do té doby neoseje, o něj přijde.
  Stejně díl pole založený v lese (povrch les – okno běží od založení dílu) i příloh, který
  zarostl v les a ves ho znovu vymýtí.
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
- **Ztráty při skladování:** 10 % zásob za rok (myši, plíseň), rozložené rovnoměrně; s hrnčířem
  5 % (meze – dobře utěsněná jáma ztrácí málo, Butser; rozpětí návrh Clauda).
- **Přídělový systém:** dokud zásoby vystačí do příští sklizně, jí ves dosyta (nasycení 1).
  Když nevystačí, obyvatelé rozdělí to, co zbývá, rovnoměrně do sklizně – nasycení je podíl
  zásob a potřeby do sklizně (návrh Clauda). Ves tak hladoví postupně, ne ze dne na den.
  Příští sklizní je **sklizeň ozimu 31. 7.**, když ji ves čeká a podle odhadu uživí ves v srpnu
  do sklizně jaře; jinak sklizeň jaře 31. 8. (viz Ozim a jař).
- **Start:** osadníci přinesli zásoby a osivo na **18 měsíců** potřeby (návrh Clauda) – ves
  přežije i založení těsně po jarním setí.
- **Hlad zabíjí** (Martin, 18. 10. 2026 – dřív „hlad ves nezničí“): hlad tlumí porody a lidé
  umírají hlady podle nahromaděného hladu, dokud se jejich počet nesrovná s tím, co zásoby
  uživí – každé úmrtí zvedne příděl ostatním. Bez jídla ves do dvou měsíců vymře a hráč, kterému
  vymřou všechny vsi, začíná znovu ([populace – Hlad a vymření](population.md)). **Hájení**
  z populace chrání dospělé i před smrtí hladem.

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
  obydlí platí kusy na vyklízené ploše kolem půdorysu (staveniště ≈ 10 × 12 m, u polozemnice
  i se zahrádkou ≈ 13 × 12 m), díl pole kusy
  v políčku; skalní výchoz pod obydlím stavbu nedovolí, v poli zůstane a plocha pod ním (kruh
  o poloměru 3 m × velikost skály) se do dílu nepočítá. Čtverec hřbitova platí překážky jako
  díl pole; skalní výchoz ho zablokuje, protože hroby jdou na čtverec v pevné mřížce
  ([hřbitov](cemetery.md)). Odstraněné překážky zmizí natrvalo: u obydlí (i první zemnice
  při založení vsi) při zahájení stavby, u pole s každým založeným dílem (jak říká Zakládání),
  u hřbitova s dostavěním hřbitova nebo rozšíření. Scéna je
  skryje bez nového načtení stránky. **Zatím ne:** zarostlý příloh (les z náletu) ani rušení
  polí odstraněné překážky nevrací. Cenu překážek kontroly umístění spočítají, rozhraní ji
  ukáže u kurzoru v celkové práci (ikona práce s číslem – „Co hráč vidí“) a stavba ji zaplatí
  prací.
- **Vymýcený les ve scéně (18. 10. 2026):** kde ves les vykácela nebo vymýtila pro pole, scéna
  ho přestane kreslit jako les. Maska po políčkách se počítá ze stavu vsi (`cleared-forest.ts`):
  políčko lesa je vymýcené, když z něj zmizela aspoň polovina dospělých stromů (odstraněné,
  pařezy, dorůstající nálet), a celé pod založeným dílem pole. Tmavá plocha korun nad pasekou
  a kolem ní zapadne pod zem, ztmavení trávy pod vykácenými stromy zmizí (i pod jednotlivými
  pařezy), stínová mapa se jednou překreslí a minimapa ukáže vykácený les jako paseku (les
  řídne s podílem vykácených stromů). Díly pole ve vymýceném lese mají obtisk pole na běžné
  trávě; při malování pole přes les prosvítá obrys výběru přes koruny.

## Ukázka

Startovní ves (jedna domácnost: 2 dospělí a 2 dospívající – viz populace), pole na louce
s úrodností 70 do 100 m od obydlí (po opravě podle rešerše, v závorce dřívější hodnoty):

- potřeba 2 × 180 + 2 × 100 = 560 kg, s rezervou 15 % **≈ 645 kg** za rok,
- čistá úroda hektaru v průměru osevu ≈ 585 − 175 = 410 kg → oseje **≈ 1,6 ha** (≈ 70 políček
  krajiny); když mají zásoby víc než 1,5 roční potřeby, jen potřebu (≈ 1,4 ha),
- první 3 roky stačí pole ≈ 1,6 ha; pak každý rok třetina osevu (≈ 0,5 ha) odchází na 13 let do
  přílohu a ves potřebuje další díly – v ustáleném oběhu pole **≈ 8,5 ha** (≈ 380 políček),
  tedy ≈ 5,3× osevu (≈ 5,3 ha, 3,3×),
- práce v ustáleném oběhu (měření): osev a vrácení přílohů ≈ 340 člověkodní (300), denní
  minimum ≈ 185, domácí výroba ≈ 330, dohromady ≈ 850, tedy **≈ 90 %** (86 %) z ≈ 950
  člověkodní, které ves za rok má – společné práce zbývá ≈ 10 % (14 %),
- špičky: na jaře (polovina kopání na podzim) potřebuje skoro všechnu práci, která zbývá po
  denním minimu (v nejhorším roce zbude ≈ 2 %), v létě při sklizni ≈ 80 % (dřív na jaře i v létě
  asi dvě třetiny) – kopání 100 člověkodní na hektar dělá z jara úzké hrdlo.

Plná domácnost (4 dospělí a 2 malé děti) potřebuje s rezervou ≈ 1 060 kg, tedy osev ≈ 2,6 ha
a v ustáleném oběhu pole ≈ 14 ha (9); na obživu jí padne ≈ 84 % práce (79 %). Na přirozené
úrodnosti 45 (průměr luk v okolí vsi) potřebuje osev ≈ 3,4 ha a pole ≈ 18 ha (11) a obživa jí
vezme skoro všechnu práci (odhad ≈ 98 %, dřív ≈ 90 %) – na chudé půdě ves neroste.

**Kolik půdy je** (krajiny nových sídel od 18. 10. 2026 – vegetace a úrodnost 2,
[krajina](landscape.md)): do 600 m od místa vsi je **≈ 60 ha luk** (p10 59, p90 61,5) s průměrnou
úrodností ≈ 56, z toho **≈ 34,5 ha s úrodností aspoň 60** (p10 32, p90 38), hlavně lužní louky
v nivě potoka a roviny u vody; do 300 m je z toho ≈ 25 ha (měření na 500 krajinách,
`measure-landscapes.ts`). Dřív (verze 1, sídla založená do 18. 10. 2026 si ji nechávají) to
bylo jen ≈ 36 ha luk s úrodností ≈ 45, z toho ≈ 14 ha úrodných, skoro vše do 300 m.
Hrubý odhad: s dlouhým přílohem (≈ 13 let, pole 5–6× osev) uživí louky v okolí zhruba
**4 domácnosti** (na krajinách verze 1 jen 2–3). Mýcení lesa dál patří k růstu vsi (Martin –
dlouhý příloh, růst mýcením a víc dobré louky). Hektar lesa stojí 250 člověkodní (s řemesly 150)
a vymýcená půda dá první sezónu +40 a druhou +20 úrodnosti a první sezónu se neplete. Domácnosti
zbývá ≈ 50 člověkodní společné práce ročně (měření), takže ves se třemi domácnostmi vymýtí hektar
zhruba za 1,5–2 roky společné práce, když nic jiného nestaví.

## Kalibrace

Měřicí skript (jako u populace) ověří (cíle odvozené z oběhu – velikost pole, délka přílohu,
louky – se po opravě podle rešerše přepočítaly; cíle práce na obživu, nasycení a zásob zůstaly):

- startovní ves s osevem ≈ 1,7 ha na úrodnosti 70 je nasycená a v ustáleném oběhu (pole
  ≈ 9 ha, dřív ≈ 5,6) dává na obživu 85–90 % práce,
- plná domácnost se uživí z osevu ≈ 2,7 ha (pole ≈ 14 ha, dřív ≈ 9) a dává na obživu ≈ 80 %,
- díl se v běžném oběhu oseje 3 roky po sobě a do osevu se vrací po 13–14 letech přílohu (dřív
  7–8),
- ves s polem o polovinu větším, než oběh potřebuje, nadbytečnou část nevybírá – ta zůstává
  v přílohu a po 15 letech je z ní les,
- ves s poli přiměřené velikosti drží zásoby mezi 1 a 1,5 roční potřeby a nasycení ≥ 0,95
  po 95 % let,
- startovní ves stihne jarní i letní práce s rezervou aspoň 20 %,
- na typické krajině uživí louky v okolí ≈ 4 domácnosti (krajiny verze 1 jen 2–3); ves, která
  mýtí les, roste dál (měření běží na syntetické louce 35 ha z doby krajin verze 1 – nové krajiny
  mají ≈ 60 ha, viz Kolik půdy je),
- cíle populace platí dál i se skutečným jídlem místo pevných 85 % (první stavba u 90 % vsí
  do ≈ 8 let).

**Naměřeno** (`packages/game/scripts/measure-village.ts 200 60`, 17. 10. 2026 po opravě podle
rešerše – syntetická louka s úrodností 70, hráč drží pole na osev × oběh z pravidel (16 / 3
≈ 5,3, dřív 3,3), strategie v hlavičce skriptu; v závorce měření před opravou). Dřívější
kalibrace platí dál: rezerva osevu 15 % (z 10), domácí výroba 0,15 člověkodne na člověka
(z 0,12), strop osevu na všechnu práci ve špičce (z 80 %), na jaře se nejdřív seje, co je
zkopané, plete a sklízí se jen zasetá část.

- startovní ves: osev ≈ 1,55 ha (1,57), pole ≈ 8,6 ha (5,3), nasycená, na obživu ≈ 90 % práce
  (86 %) – splněno, na horní hranici,
- plná domácnost: osev ≈ 2,5 ha (2,6), pole ≈ 14,2 ha (8,8), na obživu ≈ 84 % (79 %) – splněno,
  u horní hranice,
- díl se oseje 3 roky a 13 let leží v přílohu (80 % dílů 8–15 let; dřív 7 let, 7–9); z pole
  o polovinu většího zaroste v les ≈ 43 % plochy (35 %), první díl po 16,5 roku – splněno,
- startovní ves má ve špičkách rezervu práce ≈ 2 % na jaře (34 %) a ≈ 19 % v létě (35 %), vše
  stihne v 96 % let (100 %) – **MIMO** (cíl ≥ 20 %): strop osevu podle jarní práce ves vytíží
  skoro do posledního dne,
- syntetická louka (35 ha, úrodnost 70 – úrodnější než typická) dojde už při ≈ 2 domácnostech
  (4); nejvíc domácností za 60 let medián 4 (6),
- ves, kde hráč staví, kdykoli může, je nasycená (≥ 0,95) jen v ≈ 69 % let (94 %; nejhorší 1 %
  let s nasycením 0,47, 5 % s 0,60; bez staveb v 93 %, dřív 98 %) – **MIMO** (cíl 95 %),
  **doladí se hraním (Martin – prototyp)**. Hlad: nová pole nestíhají růst se vsí – zakládání
  louky stojí 100 člověkodní na hektar místo 40, pole musí být ≈ 5,3× osevu místo 3,3×, louka
  dojde už u dvou domácností a les stojí 250; na jaře navíc práce sotva stačí na osev,
- zásoby po sklizni: 10. percentil 0,79, medián 1,20, 90. percentil 1,54 (1,12, 1,35 a 1,56) –
  mezi 1 a 1,5 roční potřeby jen v ≈ 62 % let (79 %) – **MIMO**,
- pole na domácnost po 60 letech (hráč staví, nové měření): medián ≈ 12,7 ha pole a ≈ 1,9 ha
  osevu, pole ≈ 6,6× osevu (hráč drží navíc přílohy, které ještě nejdou osít).

## Co hráč vidí

Ovládání a vzhled jsou **návrh k potvrzení na náčrtech** (obydlí se umisťují podle
[populace](population.md) – půdorys kamkoli, kde je dost rovná země):

- **Založení pole:** ikona pole v mřížce staveb (jako v 0 A.D.), hráč tažením označí čtverce na
  mřížce políček (jako v realtime strategiích; Martin), s Ctrl je ubírá. Bez souhrnu
  a nápověd (Martin, 17. 10. 2026: „Odstraň všechny popisky – hráč nepotřebuje průvodce.“):
  čtverce jsou zelené (pole projde), žluté (ještě ne) a červené (sem pole nesmí). U kurzoru
  jen ikona práce s číslem – kolik člověkodní založení vybraných čtverců stojí i s překážkami
  (stejně u sadu a hřbitova, u obydlí navíc ikona stromů s počtem stromů ke kácení, když
  nestačí klády), nebo krátký červený důvod, proč pole neprojde. Výměru, úrodnost a stadia
  dílů ukáže panel vybraného pole.
- **Zakládání:** pole se zakládá jako stavba – hotové díly se postupně zbarví, stromy
  a kameny z nich zmizí.
- **Panel pole** (výběr kliknutím): výměra, úrodnost, kolik dílů se zakládá, je oseto a leží
  v přílohu podle stadia (mladý příloh, louka, nálet, křoviny, les) – ikony a čísla; oseté díly
  podle plodiny (ozim, jař). Očekávaná úroda a jestli práce stačí – později.
- **Horní lišta:** zásoby obilí, volná společná práce za den, nasycení (barva ikony).
- **Ve scéně:** pole na terénu podle ročního období – oraniště (jaro), zelené a zlaté obilí,
  strniště, přílohy v různém stadiu zarůstání (tráva, vyšší tráva, keře, nálet mladých
  stromků) – kolem vsi pestrá mozaika, hranice pole (mez). 3D a textury jsou samostatný úkol.
- **Kronika:** založení pole, sklizeň (kolik – ves s ozimem i jaří zvlášť sklizeň ozimu a jaře),
  hlad, díl pole zarostl v les.

## Navazuje

- **Řemesla** ([crafts.md](crafts.md)) – kovář a hrnčíř posunou práci a ztráty z horních mezí
  k dolním (viz Meze produktivity).
- **Lepší nástroje a osevní systémy** – hlavní cesta, jak práci na jídle uvolnit (Martin):
  **rádlo a voli později (Martin)** – kopání → orba (≈ 5–15 člověkodní na hektar místo 50–100;
  historicky měli Slované rádlo nejspíš od 7.–8. století, Nekuda 1985), kosa; **dvojpolní**
  systém (pole trvale v osevu, střídá se osev a úhor – potřeba půdy klesne z ≈ 5,3× na 2× osevu
  a odpadne vracení přílohů), později **trojpolní** (ozim, jař, úhor – 1,5× osevu, hnojení od
  dobytka). Každý krok uvolní půdu i práci.
- **Počasí** – dobré a špatné roky úrody (Martin: náhoda až s počasím); hájení se pak rozšíří
  i na neúrodu.
- **Druhy plodin** (ozim a jař už jsou – viz Ozim a jař; dál žito a pšenice zvlášť, proso
  s osivem 10–25 kg/ha, luštěniny), vymrzání ozimu s počasím, **zvířata, seno a pastva**,
  **les a dřevo** (využití vykáceného dřeva), zahrady a rybolov.

## Na stavitelovi

- Přesné vzorce včasnosti, rozdělení
  práce během dne a sezóny, pořadí osevu a zakládání dílů – tak, aby splnily cíle v Kalibraci.
- Krok simulace a dopočítání vsi (společně s populací; výsledek nesmí záviset na tom, kdy se
  dopočítává).
- Datový model stavu sídla nad krajinou a jak scéna přestaví dotčenou oblast (celé přestavění
  krajiny se zachováním kamery je přijatelné, pokud je dost rychlé).
- Podoba panelů a označování čtverců.

## Rozhodnutí

| Rozhodnutí                                                                                                                        | Kdo                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Pole = celá zemědělská půda; obdělává se jen část, zbytek ladem podle středověkých systémů                                        | Martin                                          |
| Zpočátku jen ruční práce; příliš velké pole ves neobdělá a část zarůstá                                                           | Martin                                          |
| Pole jsou samostatná a společná pro celou ves; zakládá je hráč zvlášť                                                             | Martin                                          |
| Pole se vyznačí volným obrysem na zemi; jde i do lesa, překážky prodraží založení                                                 | Martin                                          |
| Změna: pole se staví po čtvercích – políčkách krajiny (místo volného obrysu)                                                      | Martin                                          |
| Ves se zakládá zemnicí; pole přidá hráč, kdy chce (dřív zemnicí a prvním polem)                                                   | Martin (17. 10. 2026)                           |
| Odstraněné stromy a kameny zmizí natrvalo; dřevo do zásob až s mechanikou dřeva                                                   | Martin                                          |
| Hráč určuje, kde pole jsou a jak velká; kolik se oseje, rozhoduje ves podle potřeby                                               | návrh Clauda, Martin potvrdil                   |
| Ležení ladem obnovuje úrodnost, osev ji vyčerpává; systém se časem zlepšuje                                                       | návrh Clauda, Martin potvrdil                   |
| Pole nahradí 85 %; nástroje a systémy uvolní práci                                                                                | návrh Clauda, Martin potvrdil                   |
| Práce podle ročních období, sklizeň do zásob → nasycení                                                                           | návrh Clauda, Martin potvrdil                   |
| Úroda podle úrodnosti, práce a včasnosti; zarostlá půda → louka → les                                                             | návrh Clauda, Martin potvrdil                   |
| Díly pole po políčkách krajiny; max 800 m od obydlí, min 0,1 ha                                                                   | návrh Clauda                                    |
| ~~Ceny založení: louka 40, křoviny 150, les 250 člověkodní/ha~~; tabulka překážek                                                 | návrh Clauda                                    |
| Křoviny = louka, kde keře po kusech stojí aspoň rozdíl sazeb; v lese stromy a podrost v ceně                                      | návrh Clauda                                    |
| Založení jako stavba ze společné práce, díly postupně od obydlí                                                                   | návrh Clauda                                    |
| Ves oseje k 1. 9. potřebu + 15 % (kalibrace z 10 %)                                                                               | návrh Clauda                                    |
| Příloh se neudržuje a zarůstá; nevybrané díly stárnou až v les                                                                    | návrh Clauda                                    |
| Práce za celou ves: pořadí, denní minimum, domácí výroba (jen práce, přenos max 60 dní)                                           | návrh Clauda                                    |
| ~~Práce 200 člověkodní/ha~~, výnos 760 kg × úrodnost, osivo 175 kg, potřeba 180/140/100                                           | návrh Clauda                                    |
| ~~Vymýcený les +20 úrodnosti na 3 roky~~; vzdálenost +1 % / 10 m                                                                  | návrh Clauda                                    |
| Společné zásoby vsi, ztráty 10 %, přídělový systém, start se zásobami na 18 měsíců                                                | návrh Clauda                                    |
| Přirozená louka nezarůstá; les z náletu ve scéně jako mladé stromky                                                               | návrh Clauda                                    |
| Překážky jako verzovaná vrstva krajiny v `packages/game`; co je překážka a za kolik                                               | návrh Clauda                                    |
| Hlad ves zmenší, ale nezničí; hájení chrání i před hladem (do 18. 10. 2026)                                                       | návrh Clauda                                    |
| Lidé umírají hlady, ves může vymřít ([populace](population.md))                                                                   | Martin (18. 10. 2026)                           |
| Výchozí osevní systém: přílohová soustava raných Slovanů                                                                          | Martin                                          |
| Úroda zatím bez náhody – dobré a špatné roky až s počasím (pak hájení i na neúrodu)                                               | Martin                                          |
| Přílohová soustava: osev do 70 % úrodnosti (≈ 3 roky), příloh do 95 % (~~≈ 7 let~~), pořadí dílů                                  | návrh Clauda                                    |
| ~~Vrácení přílohu podle stadia: louka 40, nálet 60, křoviny 150, les 250 člověkodní/ha~~                                          | návrh Clauda                                    |
| ~~Jedno obilí~~                                                                                                                   | návrh Clauda                                    |
| Ovládání (čtverce na mřížce, panely, vzhled) – ladí se na prototypu                                                               | návrh Clauda                                    |
| Meze produktivity: čísla s rozpětím mají horní mez (bez řemesel) a dolní (s řemesly)                                              | Martin (17. 10. 2026)                           |
| Zatím jen motyky; rádlo a voli později                                                                                            | Martin (17. 10. 2026)                           |
| Polní práce 205 (s řemesly 120) člověkodní/ha: kopání 100 (50), pletí 30 (15), sklizeň 30 (15), výmlat 15 (10)                    | Martin – oprava podle rešerše 17. 10. 2026      |
| Založení a vrácení přílohu: louka 100 (90), nálet a křoviny 100 (60), les 250 (150) člověkodní/ha                                 | Martin – oprava podle rešerše 17. 10. 2026      |
| Obnova v přílohu 2,5 % za rok – příloh 13 let, pole ≈ 5,3× osevu (rozhodnutí: 2 %, viz Přílohová soustava – k potvrzení)          | Martin – oprava podle rešerše 17. 10. 2026      |
| Vymýcený les +40 / +20 / 0 úrodnosti podle sezóny osevu, první sezónu bez pletí – i u dílů pole v lese                            | Martin – oprava podle rešerše 17. 10. 2026      |
| Hrnčíř: ztráty zásob 10 → 5 %, denní minimum 0,5 → 0,45 (rozpětí návrh Clauda)                                                    | Martin – oprava podle rešerše 17. 10. 2026      |
| Křoviny bez řemesel stejně drahé jako louka – povrchem křovin je čtverec s jakýmkoli keřem (keře v ceně)                          | sloučení větví 18. 10. 2026 (z čísel rešerše)   |
| Ozim a jař: ozim kopán a set v září–říjnu, sklizeň v červenci; jař kopán na podzim (zbytek na jaře), set na jaře, sklizeň v srpnu | návrh Clauda, Martin schválil směr 18. 10. 2026 |
| Podzimní kopání přednostně, na jaře jen zbytek (místo poloviny kopání na jaře)                                                    | návrh Clauda, Martin schválil směr 18. 10. 2026 |
| Ves k 1. 9. oseje ozimem, kolik podzim stihne (po sklizni jablek), zbytek jaří ve stropech jara a srpna                           | návrh Clauda, Martin schválil směr 18. 10. 2026 |
| Stejné osivo a úroda, pletí v květnu–červnu, výmlat v zimě; vymrzání až s počasím                                                 | návrh Clauda, Martin schválil směr 18. 10. 2026 |
| Sklizeň ozimu do zásob 31. 7.; příděl počítá s ní, když uživí srpen                                                               | návrh Clauda, Martin schválil směr 18. 10. 2026 |
| Díly hotové po 1. 9. jdou do jaře; sklizeň jablek před ozimem                                                                     | návrh Clauda                                    |
