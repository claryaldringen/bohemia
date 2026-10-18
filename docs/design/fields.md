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
`year-plan.ts`), viz Ozim a jař. **Týž den dvě Martinova rozhodnutí:** na přílohu se pase,
nálet ani les na něm nebude (viz Příloh a pastva), a pole mění fáze závislé na člověku po
čtvercích, až k nim dojde práce (viz Postup práce po čtvercích; `field-progress.ts`). **Hospodaření
podle polohy domů (18. 10. 2026)** – Martin: pole ať není roztříštěné a vesničané ať to odvodí od
polohy domů; implementováno (`holdings.ts`), viz Hospodaření podle polohy domů.

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
- **Cíl:** příliš velké pole ves celé neobdělá a část leží ladem jako pastvina (Martin) – práce
  vložená do založení té části přijde vniveč. Příliš malé pole ves neuživí. Hráč hledá správnou
  výměru.
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
    (leží ladem a pase se na něm),
  - **stáří přílohu** – kolik let díl leží ladem; 1–2 roky mladý příloh, pak pastvina (viz Příloh
    a pastva).
- **Osevní systém** – které díly pole se smějí osít a jak dlouho leží ladem. **Zpočátku
  přílohová soustava raných Slovanů** (Martin): díl se pár let po sobě osévá, pak leží dlouho
  ladem jako **příloh** (pastvina), než ho ves znovu vrátí do osevu. Lepší systémy (dvojpolní,
  trojpolní) přijdou s vlastní mechanikou (viz Navazuje).
- **Obilí** – zatím jediná plodina; jídlo se počítá v **kg obilí** (návrh Clauda).
- **Zásoby jídla vsi** – společné zásoby vsi v kg obilí (ves je zásobárnou aktiv – Martin).
- **Nasycení vsi** 0–1 – jaký díl potřeby jídla ves právě pokrývá; vstup do
  [populace](population.md).
- **Krajina sídla** – vygenerovaná krajina plus **stav sídla nad ní**: pole, vykácené stromy,
  odstraněné kameny, přílohy. Generátor krajiny se nemění (po ostrém spuštění se existující
  vrstva nesmí změnit – viz [krajina](landscape.md)).
- **Meze produktivity** – nejhorší a nejlepší mez pracnosti nebo ztrát, viz níže.

## Pravidla

### Meze produktivity

Martin (17. 10. 2026): „Zatím uvažuj jen motyky. Voly a rádlo přidáme později. … Ta produktivita
má nějaké meze. Bez řemeslníků ber tu nejhorší hranici, s řemeslníky tu nejlepší.“

- Každá práce nebo ztráta, kde literatura dává rozpětí, má **nejhorší mez** (nejvíc člověkodní,
  nejvyšší ztráty – ves bez řemeslníků) a **nejlepší mez** (nejméně člověkodní, nejnižší ztráty –
  plně pokrytá potřeba výrobků řemeslníků). Řemeslníci **zvyšují produktivitu, tedy snižují
  pracnost** od nejhorší meze k nejlepší lineárně podle pokrytí 0–1 ([řemesla](crafts.md)). Kde
  literatura dává jedno číslo, platí obojí.
- **Kovář** (nástroje) snižuje pracnost – polní práce, zakládání polí a vracení přílohu;
  **hrnčíř** (nádoby) ztráty zásob a denní minimum domácností.
- **Pokrytí** spočítá simulace každý den ze zásob nástrojů a keramiky ([řemesla](crafts.md) –
  implementováno 18. 10. 2026); ves bez řemesel má pokrytí 0 a platí jí nejhorší mez. V tabulkách
  níže je nejlepší mez v závorce („s řemesly“).

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
- Hráč může čtverce pole přidat, ubrat nebo pole zrušit. Přidaná plocha se zakládá (jako nové
  pole, nebo rozšíření – viz Navazující pole), ubraná nebo zrušená leží ladem (pastvina).
- **Obydlí na poli** (Martin, 18. 10. 2026: „domy by měly jít stavět na polích a v sadech. Pole
  a sad se prostě zmenší o plochu domu“; podrobnosti návrh Clauda – [populace](population.md),
  Obydlí na poli a v sadu): pozemek polozemnice sebere celý čtverec – díl z pole zmizí, poslední
  díl pole zruší; obydlí bez pozemku sebere dílům průnik své vyklízené plochy a díl pod 20 %
  políčka zmizí celý. Zbytek zůstane jedním polem, i když se rozpadne na nesouvislé části. Díl
  zmizí i z ročního plánu a z pořadí práce, zmenšenému dílu ubude úměrně úrody i práce, ostatním
  dílům zůstane hotová práce; zakládaný díl zmenší úměrně i založení (cena i odvedená práce),
  zakládaný díl pod pozemkem zmizí s ním a jeho překážky odklidí staveniště domu. Pole naopak na
  obydlí nesmí (beze změny). Když dům zanikne, plocha se do pole nevrací.
- **Navazující pole** (Martin, 18. 10. 2026: „Pokud více polí navazuje přímo na sebe, počítají se
  jako jedno.“): čtverce, které stranou navazují na pole, ho **rozšíří** – stejné pole, nové díly
  na konec (jako rozšíření hřbitova); rozestavěné založení pole dostane jejich cenu, u hotového
  pole vznikne nová stavba se založením jen nových dílů. Navazují-li čtverce na **víc polí**,
  pole se **sloučí do nejstaršího** (nejmenší id): díly i s jejich stavem (úrodnost, osev,
  příloh, plodina) přejdou do něj, rozestavěná založení se spojí do jedné stavby (nejstarší,
  s cenou a prací všech), kronika a rozdělení práce dne odkazují na sloučené pole; plán osevu se
  nemění (vede díly, ne pole). Nejmenší výměru 0,1 ha musí mít pole i s rozšířením – přístavek
  může být menší. Rohem se nenavazuje. Náhled umístění hlásí, které pole čtverce rozšíří nebo
  sloučí (`joinedFields`); staré pole z obrysu (díly bez políček) nenavazuje (návrh Clauda).
- **Stará navazující pole se sloučí při načtení vsi** (Martin, 18. 10. 2026 – pole založená
  samostatně dřív, než se navazující čtverce slučovaly, stranou na sebe navazují, ale vybírala
  se zvlášť): každá souvislá skupina polí, která na sebe navazují stranou (i řetězem přes další
  pole), se spojí do nejstaršího pole stejně jako při rozšíření – díly i se stavem, rozestavěná
  založení do jedné stavby, kronika a rozdělení práce dne. Rohem se nenavazuje, pole z obrysu se
  neslučují. Převod běží při každém načtení bez příznaku „převedeno“ – po sloučení už žádná dvě
  pole nenavazují, takže další načtení nic nezmění (návrh Clauda).

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
- **Příloh:** díl leží ladem a pase se na něm (viz Příloh a pastva). Úrodnost se mu vrací o
  **2,5 %** přirozené za rok (nejvýš na přirozenou) – z 64 % se na **95 %** dostane za **13 let**.
  Jeden oběh dílu tak trvá zhruba 16 let a oseto je
  v průměru asi 19 % půdy: ves potřebuje pole **≈ 5,3× větší než osev** (dvojpolní systém by
  potřeboval 2×). Oprava podle rešerše (dřív 5 % a 7 let): pole z drnu se užívala 2–3 roky
  a pak ležela ladem 20 i více let (Beranová 1980), trávopolní soustava 15–20 let, žďár ≈ 12 let
  (Rösch a kol. 2017). **K potvrzení:** rozhodnutí znělo +2 % za rok s cílem 12–13 let, jenže
  +2 % vede z 64 % na 95 % až za 16 let (12–13 let platí od 70 %) a každý příloh by tehdy
  zarostl v les – proto 2,5 % (rešerše uvádí 2–2,5 %). Od 18. 10. 2026 příloh v les nezarůstá
  (pase se), délka přílohu tak už les nehlídá.
- **Smí se osít** díl, jehož aktuální úrodnost je aspoň 70 % přirozené.
- **Pořadí:** k 1. září ves vybírá díly na příští rok v tomto pořadí, dokud nepokryje potřebu
  (viz Kolik ves oseje):
  1. díly, které se už osévají a smějí dál,
  2. čerstvě založené díly (plná úrodnost, vymýcený les s bonusem – viz Úroda),
  3. přílohy zotavené aspoň na 95 % – nejmladší první (nejlevnější vrácení), při shodě
     nejbližší,
  4. když to nestačí, i přílohy zotavené na 70–95 % – nejvíc zotavené první.

  Ves s hospodářstvími (díly na políčkách a aspoň jeden dům) bere skupiny ve stejném pořadí, ale
  po celých úsecích hospodářství od domu ven – viz Hospodaření podle polohy domů.

- **Vrácení přílohu do osevu** stojí po 1–2 letech drn pastviny (viz Práce a Příloh a pastva).
  V přílohové soustavě je to běžná součást oběhu, ne trest.
- **Příliš velké pole:** díly, které ves pro svou potřebu nevybere, dál leží jako pastvina. Práce
  vložená do jejich založení přišla vniveč a až je ves bude potřebovat, zaplatí znovu drn. Tak ves
  část pole „neobdělá“ (Martin), i když má volnou práci.
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
  Vzdálenost se měří chůzí: po vyšlapané pěšině se chodí o čtvrtinu rychleji (podle její síly),
  úsek po pěšině se tak počítá 0,75–1 × délka, nikdy víc než přímá vzdálenost (paths.md – Pěšiny
  a práce, Martin 18. 10. 2026).
- **Včasnost:** co se v období nestihne, propadá: nezasetý díl se ten rok nesklidí, neopletý
  dá nižší úrodu, nesklizená úroda shnije na poli, nevymlácené do konce února se zkazí (návrh
  Clauda; přesné podíly doladí kalibrace).
- **Na jaře se nejdřív seje, co je zkopané,** a teprve zbytek práce jde do dalšího kopání
  (kalibrace). Pole, které se do konce dubna nedokope, tak dá aspoň úrodu zkopané části – dřív
  kopání předbíhalo setí a nedokopané pole nedalo nic.
- **Plete a sklízí se jen zasetá část, mlátí jen sklizená** (kalibrace): nezasetá půda práci
  nebere a úroda zaseté části se za nezasetou nesráží podruhé – pletí a sklizeň se měří vůči
  zaseté ploše.
- **Vrácení přílohu** do osevu (podzim září–listopad, u ozimu září–říjen, před kopáním – návrh
  Clauda) stojí práci navíc podle stáří přílohu: 1–2 roky nic, pak **drn pastviny jako založení
  na louce – 100 člověkodní na hektar (s řemesly 90)** (Semjonov 1974). Víc to nestojí – na
  přílohu se pase, nálet ani les na něm nevyroste (Martin, 18. 10. 2026; dřív nálet a křoviny
  100 (60), les 250 (150)). V běžném oběhu se příloh vrací po 13 letech, tedy za 100 na hektar.

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
  zraje v červenci; jař leží přes zimu jako zkopaná zem, zezelená na jaře a zraje v srpnu – po
  čtvercích, jak k nim dojde práce (viz Postup práce po čtvercích).
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
  Stejně díl pole založený v lese (povrch les – okno běží od založení dílu); příloh v les
  nezarůstá (pase se), bonus proto nedostává.
- **Bez náhody** – stejná práce na stejné půdě dá stejnou úrodu (Martin). Dobré a špatné roky
  přijdou až s mechanikou počasí; hájení z [populace](population.md) se pak rozšíří i na
  neúrodu.

### Zásoby a nasycení

- Čistá úroda jde do **společných zásob vsi** (návrh Clauda – ves drží společné zásoby).
- **Potřeba jídla z pole** (kg obilí za rok): dospělý 180, starší 140, dítě 100.
- **Zbytek stravy** – maso a ovoce řeší [strava](diet.md) (od 18. 10. 2026: potřeba níže je
  potřeba energie v kg obilí, maso a ovoce z ní pokryjí část); zahrada, sběr a ryby se zatím
  nemodelují. Domácí výroba je jen spotřeba práce – její nedodělání nasycení nesnižuje (návrh
  Clauda). Nasycení počítá [strava](diet.md) – energie (obilí, maso, ovoce) × pestrost; dřív
  záviselo jen na obilí a jablcích ([sad](orchard.md)).
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

### Příloh a pastva

Stav: **Martin, 18. 10. 2026:** „Nálety na úhoru nebudou, protože se tam budou pást ovce, kozy
a krávy, které přirozenou obnovu lesa zastaví. Na loukách se navíc bude sekat seno pro dobytek.“
(Dřív – návrh Clauda – příloh zarůstal: louka, nálet, křoviny a po 15 letech les.)

- Příloh i díl odebraný z pole: **1–2 roky mladý příloh** (plevel, tráva) – vrácení bez práce
  navíc, **pak napořád pastvina** – spásaný drn, vrácení do osevu jako založení na louce (viz
  Práce). Nálet, křoviny ani les na přílohu nebudou a z dílu se les nestane.
- **Starší vsi:** díly, které už ležely v přílohu víc než 2 roky (dřív stadia louka, nálet,
  křoviny, les), jsou teď pastvinou – stadium se počítá z let ladem, takže se změní samo; vrátit
  je stojí drn (rozhodnutí Clauda – Martin o starých dílech nerozhodl).
- **Pastva a seno** (od 18. 10. 2026 – [strava a dobytek](diet.md), [orání rádlem](oxen.md)):
  na přílohu se pasou skutečná stáda (nosnost pastvy) a úhor ve fázi louky se seče na seno pro
  krávy a voly – práce v červnu–červenci a seno v zásobách; mléko a hnůj zatím ne.
- **Přirozená louka**, která nikdy nebyla polem, zůstává loukou (návrh Clauda – louky se zatím
  nemění).
- **Ve scéně:** mladý příloh jako zaplevelená zem, pastvina jako tráva. Okolí vsi tak tvoří
  mozaiku polí a pastvin v různém stadiu.

### Postup práce po čtvercích

Stav: **Martin, 18. 10. 2026:** „Chtěl bych, aby pole neměnilo fáze, které jsou závislé na
člověku, samovolně, ale pokud bude potřeba např. zorat, aby tam ten panáček přišel a příslušný
čtverec zoral. To samé se sklizní.“ Pravidla návrh Clauda podle zadání.

- Plán vede práci za celou plodinu (kolik člověkodní každé úlohy je hotových). **Díl po dílu**
  se z toho odvozuje deterministicky: díly plodiny mají pevné pořadí – **po úsecích hospodářství,
  v úseku od domu ven** (viz Hospodaření podle polohy domů; ves bez hospodářství nejblíž obydlím
  první, při shodě podle id; díly přidané po plánu na konec, mezi sebou stejně) – a každý díl má váhu
  své práce (plocha × příplatek za vzdálenost). Je-li hotových 40 % kopání, je zkopáno prvních
  40 % váhy dílů, další díl je **čelo práce** (rozpracovaný) a zbytek čeká. Stejně setí (jen
  zkopané – setí nikdy nepředběhne kopání), sklizeň (jen zasetá) a pletí (bez dílů po vymýceném
  lese – ty se nepletou) a vrácení přílohu (jen díly, které se vracejí s drnem). Simulace se tím
  nemění – úroda se počítá dál za celou plodinu.
- **Co je na dílu vidět** (`fieldPartLooks` → `FieldLook` scény): **bare** – rozrytý drn
  (zakládaný díl, připravený, nově založený před kopáním), **plowed** – zkopaný, **sown** –
  zasetý, **sprouted** – vzešlé osení, **green** – zelené obilí, **ripe** – zralé, nesklizené
  obilí, **harvesting** – sklizeno, panáky snopů na poli (do konce sklizně plodiny), **stubble** –
  strniště (po sklizni i loňské před kopáním), **young-fallow** – mladý příloh, **pasture** –
  drn pastviny, který se vrací do osevu. Kopání (a vrácení přílohu), setí a sklizeň mění vzhled,
  až k dílu dojde práce; rozpracovaný díl úlohy má podíl hotové práce (`work` 0–1, po
  dvacetinách) a vzhled zbytku (`before`) – v jedné plodině je rozpracovaný nejvýš jeden díl na
  úlohu. **Vzejití a zrání jdou podle kalendáře** (ozim: září zasetý, říjen–březen vzešlý,
  duben–červen zelený, červenec zralý; jař: březen zasetý, duben vzešlý, květen–červenec zelený,
  srpen zralý), sníh přidávají roční období ve scéně. Nesklizená část zůstane zralá, po konci
  sklizně (31. 7. ozim, 31. 8. jař) je celá plodina strniště. Zakládaný díl je rozrytý drn
  s podílem založení (zakládá se od nejbližšího k obydlí, nezačatý má 0 – vytyčený). Starší
  příloh (pastvina, louka na seno – kosení a stohy) zatím vzhled od jádra nedostává, doplní ho
  scéna podle data.
- **Postavy na čelech:** rozdělení práce dne (pro postavy) posílá u polních prací díly, přes které
  práce ten den postoupila (v pořadí postupu, poslední je rozpracovaný), a postavy pracují na
  těch čtvercích.
- **Datový kontrakt pro scénu** (`VillageView.scene`): díl pole (`SceneFieldPart`) má `id`,
  `stage`, `look`, `work` a `before` (`FieldLook` – 13 vzhledů, jádro posílá deset výše; bez
  `look` scéna odhadne vzhled ze stadia a data); podíl práce (`SceneLaborShare`) má u polních
  prací `parts` – id dílů čela práce v pořadí postupu – a cíl `{ kind: 'field', id }`;
  `scene.labor` nese herní den. Grafika polí podle 0 A.D. a rozmístění postav na čelech se
  připravují zvlášť.

### Hospodaření podle polohy domů

Stav: **Martin, 18. 10. 2026:** „Pořeš obhospodařování pole, aby nebylo tak fragmentované. Aby
vesničané obhospodařovali pole tím nejlepším způsobem, aniž by na něj museli dlouho chodit. Ve
středověkých Čechách to typicky znamenalo, že když jsi měl usedlosti podél cesty, tak za každou
usedlostí ležel dlouhý lán pole, kde vedle sebe ležela obdělávaná část a část ponechaná ladem.
Sedlák tak vyšel z domu na pole a mohl hned začít pracovat, nemusel např. dlouho přecházet úhor.“
A pak: „Spíš ať to vesničané odvodí od polohy domů. V Estonsku a Dánsku to kupříkladu bylo tak, že
jsi měl cca čtvercové polnosti a uprostřed každé polnosti bylo hospodářství – cesta k němu vedla
přes to pole a byla zpravidla lemována stromy.“ Pravidla návrh Clauda podle zadání; implementace
`holdings.ts` (háčky v `simulate.ts`, `sowing.ts` a `year-plan.ts`).

Dřív ves vybírala díly po jednom podle skupiny přílohové soustavy a vzdálenosti od nejbližšího
obydlí: osev tvořil soustředné prstence kolem domů, které se oběhem posouvaly ven, a po pár letech
ležel osetý prstenec za přílohem – sedlák chodil přes úhor (viz Naměřeno níž).

- **Hospodářství:** každý díl pole patří k obydlí, ke kterému má nejblíž – jen kvůli organizaci
  práce, pole i jídlo zůstávají společné. Vzdálenost se měří vzdušnou čarou od domu ke středu
  čtverce: chůze po hrubé mřížce (voda jako brod 5×, sklon jako u pěšin, ploty cizích pozemků) by
  na 40 krajinách přidělila jiný dům jen 4,6 % čtverců (mimo těsnou shodu dvou domů 1,2 %) a na
  nich by vzdušná čára prodloužila chůzi v průměru o 14,5 % – a simulace krajinu nemá. Domy jsou
  hotová obydlí (i prázdná); dokud žádné nestojí, staveniště první zemnice. Díly bez políčka (pole
  z obrysu) k hospodářství nepatří. Hospodářství ani úseky se **neukládají** – vždy se odvodí
  z polohy domů a čtverců, takže starší vsi nic nepřevádějí a nový dům si „vezme“ díly, ke kterým
  je nejblíž.
- **Úseky:** hospodářství se dělí na úseky, které vycházejí od domu. Čtverce se rozdělí na
  prstence po 15 m od nejbližšího čtverce hospodářství a každý prstenec po směru kolem domu na
  tolik stejných dílů, kolik čtverců má první prstenec u domu – úsek je u domu široký asi jeden
  čtverec. Dům obklopený poli má úseky jako výseče (samota uprostřed polnosti), dům na kraji pole
  souběžné dlouhé pásy – lány (řadová ves). Směr se měří od řezu v největší mezeře mezi směry
  čtverců (úseky nepřetečou přes záda domu), hranice úseku se mezi prstenci posune nejvýš
  o čtverec (kde hospodářství na jedné straně skončí, skončí i jeho úseky a nepřeskočí jinam)
  a jeden průchod vyhladí zuby mřížky (čtverec převezme úsek většiny svých sousedů).
- **Osev po úsecích:** k 1. září ves bere díly po **blocích** – díly jednoho úseku ve stejné
  skupině přílohové soustavy, vždy od domu ven. Úsek osetý najednou se najednou vyčerpá a najednou
  jde do přílohu, takže vzorec polí drží přes oběhy. Skupiny jdou v dřívějším pořadí (osévané,
  čerstvě založené, přílohy ≥ 95 %, přílohy 70–95 %), v nich bloky:
  - osévané díly – od úseku nejblíž domu,
  - čerstvě založené – nejdřív bloky, před kterými v úseku neleží příloh, pak nejblíž domu,
  - přílohy ≥ 95 % – nejdřív bez přílohu před sebou (sedlák nejde přes úhor), pak úseky, které se
    už osévají (ves úsek dokončí – vnější část úseku se oseje rok po vnitřní), pak nejvíc odpočaté
    (dřív nejmladší příloh) a nejblíž domu,
  - přílohy 70–95 % – nejvíc zotavené, pak bez přílohu před sebou, rozběhnuté úseky, nejblíž domu.

  Když cíl osevu potřebuje jen část bloku, bere ves díly od domu ven. Mezi hospodářstvími se bloky
  střídají tak, aby každé mělo osetý stejný podíl své plochy – všechna obíhají stejně rychle.

- **Ozim a jař:** blok jde celý do ozimu, když se tam vejde, jinak celý do jaře; když se nevejde
  ani tam, rozdělí se po dílech jako dřív. Díly hotové během roku (do konce dubna) jdou do jaře po
  blocích stejně.
- **Postup práce:** díly plodiny jdou po úsecích – úsek s dílem nejblíž svému domu první, při
  shodě v pořadí úseků –, v úseku od domu ven (viz Postup práce po čtvercích). Čelo práce tak
  úsek dokončí od domu ven a jde na další; rozdělení práce dne a vzhled dílů se řídí tímtéž.
- **Co se nemění:** sazby práce a příplatek za vzdálenost (dál od nejbližšího obydlí při založení
  dílu), umístění polí, uložený stav (JSON beze změny) a nezávislost na kouscích dopočítání. Ves
  bez hospodářství (bez domů, nebo jen s díly bez políčka – i syntetická louka kalibrace
  `measure-village.ts --land v1`) bere díly v dřívějším pořadí bit po bitu stejně. Kalibrace na
  skutečných krajinách (`--land real`, výchozí) díly na políčkách má, takže hospodaří podle domů –
  všechna obydlí tam stojí v jednom bodě, je to tedy jedno hospodářství s výsečemi kolem vsi.
- **Pěšiny** ([pěšiny](paths.md)) se pravidly nemění: osetý díl je pro chůzi dražší než úhor,
  takže pěšiny k vodě a k lesu teď vedou podél hranic osetých úseků (lánů, výsečí), ne přes
  prstence – stromy podél pěšin lemují meze mezi úseky.
- **Vývojová stránka** `/dev/landscape`: „Hospodaření: řadová ves / samoty“ postaví ukázkovou ves
  a ukáže vzorec polí po 20 letech simulace jádra (v každém domě dva dospělí), „Úseky“ obrysy úseků
  v barvách domů a „Po 20 letech“ totéž pro vlastní vývojovou ves.

**Naměřeno** (`packages/game/scripts/measure-holdings.ts 12`, 18. 10. 2026): 12 krajin, tři
domácnosti po dvou dospělých, všechna pole připravená, roky 8–30 po plánu osevu; dřívější pořadí
→ úseky. „Za úhorem“ = osetý čtverec, ke kterému od domu nevede cesta po mřížce bez přílohu kratší
než 1,3 × vzdušná čára + 1 čtverec.

| Metrika                             | Řadová ves       | Samoty           |
| ----------------------------------- | ---------------- | ---------------- |
| osetých čtverců za úhorem           | 57,0 → 19,1 %    | 88,5 → 25,7 %    |
| souvislých skupin osevu             | 6,4 → 6,0        | 32,0 → 7,8       |
| čtverců na skupinu                  | 34,1 → 26,4      | 9,6 → 19,7       |
| hran k neosetému na osetý čtverec   | 0,73 → 1,02      | 1,95 → 0,87      |
| vzdálenost osetého čtverce od domu  | 198,5 → 185,9 m  | 89,3 → 86,7 m    |
| příplatek za chůzi (vážený plochou) | 10,75 → 9,71 %   | 0,70 → 0,63 %    |
| sklizeň                             | 1 244 → 1 245 kg | 1 191 → 1 190 kg |
| polní práce plánu                   | 846 → 832 čd     | 810 → 812 čd     |

Úroda a práce se nezměnily (rozdíly v řádu procenta), chůze se zkrátila a sedlák přes úhor chodí
3–4× méně. Zbylých ≈ 20 % je hlavně rok, kdy vnitřní část úseku už odpočívá a vnější se oseje
naposledy. V řadové vsi je hran víc – lány jsou úzké pásy vedle sebe, jak Martin popsal.

### Krajina sídla a scéna

- Změny (pole, vykácené stromy, odstraněné kameny, přílohy) se ukládají jako **stav sídla nad
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
  obydlí platí kusy na vyklízené ploše kolem půdorysu (staveniště ≈ 10 × 12 m; polozemnice na
  pozemku všechny kusy na svém políčku jako čtverec pole), díl pole kusy
  v políčku; skalní výchoz pod obydlím stavbu nedovolí, v poli zůstane a plocha pod ním (kruh
  o poloměru 3 m × velikost skály) se do dílu nepočítá. Čtverec hřbitova platí překážky jako
  díl pole; skalní výchoz ho zablokuje, protože hroby jdou na čtverec v pevné mřížce
  ([hřbitov](cemetery.md)). Odstraněné překážky zmizí natrvalo: u obydlí (i první zemnice
  při založení vsi) při zahájení stavby, u pole s každým založeným dílem (jak říká Zakládání),
  u hřbitova s dostavěním hřbitova nebo rozšíření. Scéna je
  skryje bez nového načtení stránky. **Zatím ne:** rušení
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
- špičky: bez ozimu (polovina kopání na podzim) potřebovalo jaro skoro všechnu práci, která
  zbývá po denním minimu (v nejhorším roce zbylo ≈ 2 %); s ozimem a podzimním kopáním zbude na
  jaře ≈ 26 % a úzkým hrdlem je podzim (září–říjen, ozim) – viz Ozim a jař a Naměřeno.

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
  ladem jako pastvina (dřív po 15 letech les),
- ves s poli přiměřené velikosti drží zásoby mezi 1 a 1,5 roční potřeby a nasycení ≥ 0,95
  po 95 % let,
- startovní ves stihne jarní i letní práce s rezervou aspoň 20 %,
- na typické krajině uživí louky v okolí ≈ 4 domácnosti (krajiny verze 1 jen 2–3); ves, která
  mýtí les, roste dál (od 18. 10. 2026 měří skript vsi na skutečných krajinách sídel verze 2,
  `--land v1` vrací syntetickou louku 35 ha ze starších měření; sondy pevných domácností běží
  dál na syntetické louce s úrodností 70),
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

**Naměřeno s ozimem a jaří** (`measure-village.ts 200 60`, 18. 10. 2026; čísla se neladila).
Nejdřív jen ozim a podzimní kopání nad čísly z rešerše (krajiny verze 1, bez hladu, který zabíjí,
a bez štěstí), v závorce měření 17. 10. výše; pak po sloučení s pastvinou na přílohu, prací po
čtvercích, navazujícími poli a s `feat/landscape` (hlad zabíjí, štěstí násobí práci):

- **ozim na osevu** medián 54 % plochy (p10 46 %, p90 75 %) – podzim (září–říjen) ves vytíží
  skoro celý (rezerva startovní vsi 2 %, po sloučení 1 %),
- **špičky startovní vsi:** jaro 27 % (2 %), léto 12 % (19 % – ozim a jař se sklízejí každá
  v jednom měsíci), pletí 55 %, vše stihne v 99 % let (96 %); po sloučení jaro 26 %, léto 12 % –
  **MIMO** jen léto (cíl ≥ 20 %),
- **nasycení ≥ 0,95, hráč staví:** 81,6 % let (69 %), bez staveb 95,4 % (93 %); po sloučení
  74,3 % a 95,3 % – stále **MIMO** (cíl 95 %),
- **zásoby po sklizni:** p10 0,85 / medián 1,24 / p90 1,57, v pásmu 63 % let (0,79 / 1,20 /
  1,54, 62 %); po sloučení 0,81 / 1,15 / 1,51, 59 % – **MIMO**,
- **po 60 letech (hráč staví):** medián 4 domácnosti a 19 lidí, pole 12,4 ha a osev 1,8 ha na
  domácnost (6,5×); po sloučení 2 domácnosti a 10 lidí (vymřelo 6 % vsí – hlad teď zabíjí), pole
  22,6 ha na domácnost (13×) – příloh už nezaroste v les, takže se do pole počítá celý (dřív se
  díly v lese nepočítaly) a hráč měření ho dál přidává,
- startovní a plná domácnost: osev 1,55 a 2,52 ha, na obživu 89 % a 84 % práce beze změny;
  pole plné domácnosti 17,8 ha (**MIMO** cíl ≈ 14 ha – pole teď zahrnuje i staré pastviny).

**Naměřeno na skutečných krajinách – louka motykou, nebo pálením drnu** (`measure-village.ts
200 60` a `--variant meadow-burn`, 18. 10. 2026, **naměřeno, průběžně 192 z 200 vsí** – běh
dokončí noc; stejné vsi a krajiny v obou variantách; pravidla ze 18. 10. odpoledne před
osídlením prázdných domů dospělými dětmi a rychlejším chátráním prázdných obydlí – řemesla ves
bez dílen nemění). Vsi stojí na skutečných krajinách sídel
(vrstvy verze 2: do 600 m ≈ 60 ha luk, ≈ 34,5 ha s úrodností ≥ 60, les od ≈ 200 m); hráč
zakládá čtverce louky, křovin i lesa do 800 m podle úrody za člověkoden prvního oběhu – pořadí
je v obou variantách stejné. Varianta **pálení drnu** je jen kalibrační přepínač, ne pravidlo:
založení louky 50 místo 100 člověkodní na hektar (křoviny a les beze změny) a první sezóna osevu
s úrodností o 20 nižší (návrh Clauda – nerozložený drn a hrubá půda; pálení drnu dávalo
historicky spíš dobrou první úrodu z popela, −20 je opatrný předpoklad). Vrácení přílohu
(drn pastviny) stojí v obou variantách 100.

| Hráč staví, 60 let                          | Louka motykou (dnes) | Pálení drnu         |
| ------------------------------------------- | -------------------- | ------------------- |
| nasycení ≥ 0,95 celý rok (staví / ne)       | 73,9 % / 97,0 % let  | 77,3 % / 97,3 % let |
| zásoby po sklizni p10 / medián / p90        | 0,80 / 1,15 / 1,52   | 0,83 / 1,17 / 1,52  |
| zásoby v pásmu 1–1,5                        | 58 % let             | 61 % let            |
| na konci domácností / lidí (medián)         | 2 / 9                | 3 / 11              |
| vymření (staví / jediná domácnost)          | 10,4 % / 13,0 %      | 8,3 % / 12,5 %      |
| první možnost stavět p50 / p90              | 4,6 / 8,9 roku       | 4,6 / 8,9 roku      |
| zemnice / polozemnice čerstvě plnou dom.    | 91 / 423 dní         | 77 / 378 dní        |
| startovní ves: rezerva jaro / léto / podzim | 26 % / 12 % / 1 %    | 17 % / 12 % / 1 %   |
| pole / osev na domácnost na konci           | 22,7 / 1,69 ha       | 18,9 / 1,73 ha      |
| založeno louka / křoviny / les (ha na ves)  | 32,1 / 2,6 / 20,1    | 32,2 / 2,6 / 20,4   |

- **Pálení drnu pomůže, ale málo:** o ≈ 3 body víc let bez hladu, o domácnost víc na konci,
  zemnice o 2 týdny rychleji (zakládání polí bere méně společné práce). Cíl nasycení (95 % let)
  je stejně daleko – hlad nedělá cena louky, ale to, že pole nestačí růstu vsi a zásoby po
  sklizni kolísají (viz Rovnováha zásob níže). Rezerva startovní vsi na jaře klesne (první
  sezóna dílů pálených luk dá méně, ves oseje víc dílů).
- **Skutečné krajiny vs. syntetická louka:** hráč začne mýtit les už u první domácnosti
  (medián; nejlepší les s popelem má víc úrody za člověkoden než chudší a vzdálenější louka),
  za 60 let založí ≈ 32 ha louky a ≈ 20 ha lesa. Vymře ≈ 10 % vsí, kde hráč staví (na
  syntetické louce 6 %), a 13 % jediných domácností.
- Rozdíl vymření (20 proti 16 vsím ze 192) je v mezích náhody; nasycení a zásoby jsou párové
  (stejné vsi), takže jejich rozdíl je spolehlivější.

**Rovnováha zásob** (`village-calculator.ts`, **spočítáno, ne naměřeno**): při ztrátě 10 % zásob
za rok se zásoby po sklizni ustálí na 10 × sklizeň − 9,49 × potřeba. S osevem na potřebu a 15 %
navíc (sklizeň 1,15 potřeby) by to bylo 2,0 roční potřeby, s osevem jen na potřebu 0,51 – ves
proto mezi oběma pravidly přeskakuje a zásoby kolísají přes pásmo. Pásmo 1–1,5 drží sklizeň
1,05–1,10 roční potřeby.

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
- **Zakládání:** pole se zakládá jako stavba po dílech od obydlí – rozpracovaný díl se rozrývá
  po řádcích, stromy a kameny z hotového dílu zmizí.
- **Panel pole** (výběr kliknutím): výměra, úrodnost, kolik dílů se zakládá, je oseto a leží
  v přílohu podle stadia (mladý příloh, pastvina) – ikony a čísla; oseté díly podle plodiny (ozim,
  jař). Očekávaná úroda a jestli práce stačí – později.
- **Horní lišta:** zásoby obilí, volná společná práce za den, nasycení (barva ikony).
- **Vytyčení:** nově zadané pole je hned vytyčené – kolíky v rozích a po čtvercích a provázek
  po obrysu dílů, které se ještě zakládají (Martin: „Když někde zadám stavbu, ať se hned vytyčí
  provázkem a kolíky.“). Čtverec, na kterém osadníci začnou, se rozrývá po řádcích; hotové díly
  vytyčení ztratí.
- **Ve scéně** (podle 0 A.D., Martin: tvrdé pruhy brázd a vzcházejícího obilí byly „hnusné“):
  zem s měkkými brázdami (textura pole z 0 A.D.) natočenými podél delší strany pole, okraj
  pole měkký a nepravidelný, bez meze (Martin 18. 10. 2026: „Pole mají nějakou divnou hranici.
  Můžeš ji zrušit?“); sousední pole na sebe navazují bez švu. Obilí jsou 3D trsy v řádcích (pšenice z 0 A.D.),
  které rostou: oseto (zavláčená tmavá zem) → vzchází (řídké nízké zelené trsy v řádcích) →
  zelené obilí (husté, z dálky zelené pole) → zralé zlaté obilí, které se lehce vlní ve větru →
  žeň (sklizená část se strništěm a panáky snopů, zbytek zralý) → strniště. Úhor: mladý úhor
  (1–2 roky) je strniště s plevelem, kde se pasou ovce, kozy a krávy s pasáčkem (Martin: „Nálety
  na úhoru nebudou, protože se tam budou pást…“); starší úhor je louka, která se kosí na seno
  (Martin) – na jaře vysoká kvetoucí tráva, v červnu se seče po dílech (řádky sena), pak kupky
  a od poloviny července stohy na otavě, které přes podzim a zimu postupně mizí (zkrmují se);
  na otavě se od srpna do konce listopadu pase. Z dálky trsy řídnou a pole nese barva obtisku.
  Kolem vsi se navíc seče pár luk na seno (jen vzhled, na dvě domácnosti jedna louka).
- **Práce po čtvercích** (Martin: „aby pole neměnilo fáze, které jsou závislé na člověku,
  samovolně“): díl se změní (zoráno, oseto, sklizeno, posečeno), až když k němu práce dojde –
  rozpracovaný je vždy jeden díl na úlohu a mění se po řádcích od strany blíž vsi; postavy
  pracují přesně na něm, řada stojí na čáře práce, a když je čtverec hotový, dojdou na další.
  **Stav:** herní jádro posílá vzhled dílů po čtvercích (`SceneFieldPart.look` / `work` /
  `before` z `fieldPartLooks` – viz Postup práce po čtvercích) a frontu práce
  (`SceneLaborShare.parts`); scéna odhaduje z data jen starší příloh (louka na seno, pastvina).
- **Kronika:** založení pole, sklizeň (kolik – ves s ozimem i jaří zvlášť sklizeň ozimu a jaře),
  hlad, pole ustoupilo stavbě obydlí (o kolik m², nebo zaniklo).
- **Obydlí na poli:** u kurzoru oranžově „Pole se zmenší“ (poslední díl: „Pole zanikne“), pod
  vyklízenou plochou domu scéna nekreslí obilí ani obtisk pole.

## Navazuje

- **Řemesla** ([crafts.md](crafts.md)) – kovář a hrnčíř zvýší produktivitu: sníží pracnost
  a ztráty od nejhorších mezí k nejlepším (viz Meze produktivity).
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
| ~~Úroda podle úrodnosti, práce a včasnosti; zarostlá půda → louka → les~~                                                         | návrh Clauda, Martin potvrdil                   |
| Díly pole po políčkách krajiny; max 800 m od obydlí, min 0,1 ha                                                                   | návrh Clauda                                    |
| ~~Ceny založení: louka 40, křoviny 150, les 250 člověkodní/ha~~; tabulka překážek                                                 | návrh Clauda                                    |
| Křoviny = louka, kde keře po kusech stojí aspoň rozdíl sazeb; v lese stromy a podrost v ceně                                      | návrh Clauda                                    |
| Založení jako stavba ze společné práce, díly postupně od obydlí                                                                   | návrh Clauda                                    |
| Ves oseje k 1. 9. potřebu + 15 % (kalibrace z 10 %)                                                                               | návrh Clauda                                    |
| ~~Příloh se neudržuje a zarůstá; nevybrané díly stárnou až v les~~                                                                | návrh Clauda                                    |
| Práce za celou ves: pořadí, denní minimum, domácí výroba (jen práce, přenos max 60 dní)                                           | návrh Clauda                                    |
| ~~Práce 200 člověkodní/ha~~, výnos 760 kg × úrodnost, osivo 175 kg, potřeba 180/140/100                                           | návrh Clauda                                    |
| ~~Vymýcený les +20 úrodnosti na 3 roky~~; vzdálenost +1 % / 10 m                                                                  | návrh Clauda                                    |
| Společné zásoby vsi, ztráty 10 %, přídělový systém, start se zásobami na 18 měsíců                                                | návrh Clauda                                    |
| ~~Přirozená louka nezarůstá; les z náletu ve scéně jako mladé stromky~~                                                           | návrh Clauda                                    |
| Překážky jako verzovaná vrstva krajiny v `packages/game`; co je překážka a za kolik                                               | návrh Clauda                                    |
| Hlad ves zmenší, ale nezničí; hájení chrání i před hladem (do 18. 10. 2026)                                                       | návrh Clauda                                    |
| Lidé umírají hlady, ves může vymřít ([populace](population.md))                                                                   | Martin (18. 10. 2026)                           |
| Výchozí osevní systém: přílohová soustava raných Slovanů                                                                          | Martin                                          |
| Úroda zatím bez náhody – dobré a špatné roky až s počasím (pak hájení i na neúrodu)                                               | Martin                                          |
| Přílohová soustava: osev do 70 % úrodnosti (≈ 3 roky), příloh do 95 % (~~≈ 7 let~~), pořadí dílů                                  | návrh Clauda                                    |
| ~~Vrácení přílohu podle stadia: louka 40, nálet 60, křoviny 150, les 250 člověkodní/ha~~                                          | návrh Clauda                                    |
| ~~Jedno obilí~~                                                                                                                   | návrh Clauda                                    |
| Ovládání (čtverce na mřížce, panely, vzhled) – ladí se na prototypu                                                               | návrh Clauda                                    |
| Meze produktivity: čísla s rozpětím mají nejhorší mez (bez řemesel) a nejlepší (s řemesly)                                        | Martin (17. 10. 2026)                           |
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
| Na přílohu se pase – nálet ani les nebude; 1–2 roky mladý příloh, pak napořád pastvina                                            | Martin (18. 10. 2026)                           |
| Vrácení přílohu nejvýš drn louky (100, s řemesly 90); staré díly v náletu či lese jsou pastvinou                                  | návrh Clauda (podle Martina)                    |
| Seno na loukách zatím jen scéna – bez práce a bez sena v zásobách                                                                 | návrh Clauda                                    |
| Fáze závislé na člověku (kopání, setí, sklizeň) se mění po čtvercích, až k nim dojde práce                                        | Martin (18. 10. 2026)                           |
| Pořadí dílů nejblíž obydlím první (při shodě id), váha = práce dílu; vzejití a zrání podle kalendáře                              | návrh Clauda                                    |
| Postavy pracují na dílech čela práce (rozdělení práce dne posílá jejich id)                                                       | návrh Clauda (podle Martina)                    |
| Pole ať není roztříštěné – vesničané hospodaří podle polohy domů (lány za usedlostmi, polnosti kolem samot)                       | Martin (18. 10. 2026)                           |
| Díl patří k nejbližšímu domu vzdušnou čarou; hospodářství a úseky se neukládají, odvodí se z polohy domů a čtverců                | návrh Clauda (podle Martina)                    |
| Úseky od domu: prstence po 15 m, v každém tolik dílů po směru, kolik čtverců má první prstenec                                    | návrh Clauda (podle Martina)                    |
| Osev po blocích úseků od domu ven; bez přílohu před sebou a rozběhnuté úseky první; osev mezi hospodářstvími podle plochy         | návrh Clauda (podle Martina)                    |
| Blok úseku celý do ozimu, nebo celý do jaře; práce po úsecích od domu ven                                                         | návrh Clauda (podle Martina)                    |
| Navazující pole se počítají jako jedno – rozšíření, víc polí se sloučí do nejstaršího                                             | Martin (18. 10. 2026)                           |
| Sloučení: díly i se stavem, jedna stavba založení, kronika a práce dne na nejstarší pole; výměra i s rozšířením                   | návrh Clauda                                    |
| Stará navazující pole se sloučí samy při načtení vsi (do nejstaršího)                                                             | Martin (18. 10. 2026)                           |
| Převod starých polí bez příznaku „převedeno“ – souvislé skupiny stranou, pole z obrysu ne                                         | návrh Clauda                                    |
| Obydlí jde stavět na pole – pole se zmenší o plochu domu                                                                          | Martin (18. 10. 2026)                           |
| Pozemek sebere celý díl, obydlí bez pozemku průnik vyklízené plochy, díl pod 20 % zmizí; plán, úroda a založení úměrně            | návrh Clauda                                    |
