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
polohy domů; implementováno (`holdings.ts`), viz Hospodaření podle polohy domů. **Zarůstání
(18. 10. 2026)** – Martin: „Ano udělej to tak“ – s dobytkem, který má skutečnou nosnost pastvy,
nepasený a nesečený příloh zarůstá a les z pole vypadne; čísla návrh Clauda podle
[rešerše](research/2026-10-18-overgrowth.md); implementováno (`overgrowth.ts`, `woods.ts`), viz
Zarůstání a Les vsi.

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
  - **stáří přílohu** – kolik let díl leží ladem; 1–2 roky mladý příloh, pak louka – pastvina
    a louka na seno (viz Příloh a pastva),
  - **roky bez pastvy a seče** – kolik vegetačních období příloh stáda nespásla a ves neposekla;
    podle nich zarůstá křovinami a lesem (viz Zarůstání).
- **Les vsi** – čtverec pole, který zarostl lesem a z pole vypadl (viz Les vsi).
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
- **Pole jako krajina** (Martin, 18. 10. 2026: „Pole by se mělo chovat jako normální krajina.
  Takže by na něm mělo jít postavit cokoliv kromě jiného pole.“ – spouštěč: ve Vlkově s ≈ 40 ha
  polí neměly jabloně podél cest kde stát; podrobnosti návrh Clauda): na pole smí **každá stavba
  kromě jiného pole** a pole ustoupí stejně jako obydlí (předchozí bod):
  - **sad, hřbitov a ohrada** (po čtvercích) – čtverec pole pod nimi z pole zmizí celý,
  - **modla a svatyně** (půdorys) – díl se zmenší o průnik půdorysu, pod 20 % políčka zmizí,
  - **řemeslné dílny** jako obydlí (průnik vyklízené plochy dílny i milíře),
  - **jabloně a stromy u cest** – každý strom vezme dílu **20 m²** (pod korunou se neorá ani
    neseje); jabloně kdekoli podél cesty (zadáním výsadby), strom u cesty náletem jen na mezi
    – jeho místa leží 2,5–4 m od osy cesty, tam se neorá (orané pole by nálet zničilo); bere si
    půdu, až se uchytí.
    Úroda a práce úměrně ploše (plán osevu i luštěniny, orba, seč, založení – jako u obydlí),
    překážky založeného dílu už nejsou, takže je stavba neplatí (stromy u cesty a jabloně na poli
    ano). Pole **na pole** dál nesmí (jediná výjimka), sad na sad, hřbitov na hřbitov a ostatní
    překryvy staveb mezi sebou zůstávají zakázané. Les vsi a zarůstání beze změny. Kontrola
    v prohlížeči i na serveru jsou stejné funkce jádra; u kurzoru oranžově „Pole se zmenší“
    / „Pole zanikne“, u staveb po čtvercích i čtverce pole oranžově, u jabloní v nabídce na panelu
    cesty. Kronika: pole ustoupilo sadu, hřbitovu, ohradě, modle, svatyni, jabloním nebo stromům
    u cesty. Pole leží na krajině pod ním – na čtverci pole v lese (vymýceném) stavby dál nesmí,
    jako v lese (zatím).
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

### Natočené stavby

Stav: **Martin, 18. 10. 2026:** „Je to 3D, takže všechny stavby by měly jít natáčet po 15
stupních“ a „plošné stavby (pole, sady, hřbitovy) by měly jít natáčet také“ – každá ve vlastní
natočené mřížce. U pozemku polozemnice zvolil variantu a (natočí se celý pozemek, místo domu
přepíná Tab – [populace](population.md), Natočený pozemek). Model a pravidla níž jsou **návrh
Clauda**; implementace v `square-grid.ts` a `squares.ts` (jádro), ve scéně `field-cells.ts`
(rovný prostor mřížky) a `field-space.ts`.

- **Vlastní mřížka stavby:** pole a sad mají volitelnou **mřížku** `grid` – střed čtverce (0, 0)
  ve světě a natočení po 15° v rozsahu **15–75°** (čtverec otočený o 90° je zase týž čtverec, jen
  by se čtverce jinak jmenovaly). Čtverce stavby jsou dál celočíselné souřadnice (x, y) – ale
  v její mřížce; strana je strana políčka krajiny (15 m). Stavba **bez mřížky leží v mřížce
  krajiny** (čtverec = políčko) – všechny stavby z doby před natáčením i každé nové pole či sad
  nenatočený. Proč tak: díl zůstává čtvercem s celočíselnými souřadnicemi, takže navazování,
  slučování, úseky hospodaření, postup práce i vzhled po čtvercích fungují beze změny ve své
  mřížce; jen převod na svět jde přes mřížku stavby. Ukládá se jen jedna mřížka na pole (ne na
  díl) – stav vsi nebobtná.
- **Počátek mřížky:** nová natočená mřížka má čtverec (0, 0) ve **středu políčka krajiny**, kde
  hráč začne malovat (čtverec pod kurzorem leží na políčku). Rozšíření jde vždy v mřížce
  rozšiřovaného pole.
- **Krajina pod natočeným čtvercem** se vzorkuje **5 × 5 body** (středy podčtverců) po políčkách
  krajiny – deterministicky, stejně v prohlížeči i na serveru: **úrodnost** = průměr políček pod
  body, **voda**, když do ní zasahuje kterýkoli bod (stavba nesmí do vody), **les**, když v něm
  leží většina bodů (pole pak platí sazbu lesa, sad a pozemek do lesa nesmí). Čtverec mimo
  krajinu (kterýkoli roh) nejde. Překážky čtverce jsou ty s **patou v natočeném čtverci**, plocha
  pod skalními výchozy a korunou posvátného dubu se odečítá jako u políčka. Háj: čtverec, pod
  kterým leží políčko háje, se z výběru vyjme.
- **Překryvy staveb** se počítají ze skutečných ploch: rejstřík čtverců staveb po políčkách
  krajiny – u dvou čtverců v mřížce krajiny rozhoduje rovnost políček (bit po bitu jako dřív),
  jinak přesný překryv mnohoúhelníků (dotyk hranou překryv není). Pole na pole dál nesmí ani
  napříč mřížkami; sad, hřbitov, ohrada a pozemek na pole smí (Pole jako krajina) – pole jim
  ustoupí: čtverec, který stavba zabírá **přesně** (stejná mřížka a souřadnice), zmizí celý jako
  dřív, jinak se díl zmenší o **průnik ploch** a pod 20 % políčka zmizí (jako u obydlí bez
  pozemku). Zabraný kus nese mřížku stavby, ke které patří (`TakenLand.grid`).
- **Navazování a slučování** jen **ve stejné mřížce**: čtverce navazují na pole, které má stejnou
  mřížku (stejný počátek v toleranci a krok natočení); pole v jiné mřížce zůstanou samostatná,
  i když se dotýkají. Stará navazující pole se slučují po mřížkách.
- **Les vsi** z natočeného dílu leží v mřížce pole (stromy v natočeném čtverci, id stromů podle
  buňky 7,5 m pod jeho středem – středy nepřekrývajících se čtverců jsou od sebe aspoň 15 m).
  Pole ho vymýtí, jen když je jeho čtverec přesně čtvercem pole (stejná mřížka); natočené pole
  napříč lesem vsi z jiné mřížky nejde („Les vsi pole vymýtí jen po jeho čtvercích“), ostatní
  stavby na les vsi nesmí jako dřív.
- **Hospodaření, pěšiny, seno, stromy u cest:** hospodářství a úseky berou středy čtverců v mřížce
  pole (sousedé při vyhlazení jen v téže mřížce), síť pěšin bere natočené čtverce v jejich
  mřížce (buňky sítě převede do souřadnic mřížky), přirozené louky na seno vynechají každé
  políčko, do kterého zasahuje natočený čtverec, strom u cesty ani jabloň nestojí v natočeném
  čtverci sadu, pozemku ani lesa vsi; jabloň a strom u cesty na natočeném dílu mu vezmou
  20 m² jako jinde.
- **Malování:** natáčet jde **pole, sad, hřbitov i ohradu** – [ a ] před prvním čtvercem
  otáčejí mřížku po 15° (kolem čtverce pod kurzorem), nad stavbou stejného druhu se malování
  **chytí její mřížky** a drží ji i mimo ni (rozšíření); vybraná stavba stejného druhu dá
  mřížku hned. Prvním čtvercem se mřížka zamkne. Mřížka kolem kurzoru i obrysy jsou natočené.
- **Hřbitov** (Martin, 19. 10. 2026 – „výslovně i hřbitovy“) má vlastní mřížku `Cemetery.grid`
  stejně jako pole a sad (návrh Clauda): čtverce v ní, rozšíření jen ve stejné mřížce, hroby
  7 × 8 v osách čtverce, plot se zakulacenými rohy a vytyčení po natočeném obrysu. Vzdálenost od
  obydlí (hygiena, pořadí pohřbu, varování) se měří k okraji čtverce v jeho osách, vzdálenost od
  vody jako nejkratší vzdálenost natočeného čtverce od políčka vody (u políčka krajiny vyjde
  totéž co dřív) – ukládá se u čtverce při založení jako dřív. Skalní výchoz a posvátný dub
  v natočeném čtverci hřbitov zablokují, háj se z výběru vyjme. Podrobnosti v
  [cemetery.md](cemetery.md).
- **Ohrada** je jeden čtverec natočené mřížky (`Pen.grid`, návrh Clauda): umisťuje se malováním
  jednoho čtverce jako dřív, takže její střed leží ve středu políčka, kde hráč začne (nebo
  v mřížce jiné ohrady, nad kterou malování začne). Rozhodnutí Clauda: **volný střed jako
  u pozemku polozemnice ohrada nedostala** – potřebovala by vlastní způsob umisťování (duch
  čtverce u kurzoru místo malování); natočení kolem středu políčka dává stejnou volnost směru
  a model dat volný střed unese (čtverec mřížky s libovolným počátkem), takže jde doplnit bez
  převodu. Rozmístění ohrady (branka k obydlí, přístřešek v zadním rohu, žlab, stoh, zvířata,
  bláto, rozpad) se počítá v jejích osách – [oxen.md](oxen.md).
- Volně stojící stavby (zemnice, dílny, modla, svatyně) se natáčejí po 15° odjakživa; dvorec
  vojvody hráč nestaví, zůstává v osách.
- **Jiné vsi na téže mapě** ([stěhování](migration.md) – Vsi na téže mapě): přehled jiných vsí
  nese natočené čtverce polí, sadů, hřbitovů, ohrad a lesa vsi s jejich mřížkou zvlášť
  (`squares`), natočený
  pozemek jako tvar obydlí. Cizí půdu blokují kontroly podle skutečné plochy – natočený čtverec
  či pozemek jiné vsi zablokuje jen stavby a čtverce, do kterých opravdu zasahuje; políčka
  v mřížce krajiny a celá políčka pod jejich volnými obydlími a posvátnými stavbami jako dřív
  (rozhodnutí Clauda). Přehled bez `squares` platí dál.
- **Kompatibilita:** stavby bez mřížky a pozemky bez natočení se počítají bit po bitu jako dřív
  (testy a kalibrace beze změny); dopočet po kouscích dává totéž jako vcelku i s natočenými
  stavbami.

### Kolik ves oseje (rozhodují obyvatelé)

- Každý rok k **1. září** (po sklizni, před podzimním kopáním) ves sama rozhodne, kolik na
  příští rok oseje (návrh Clauda, vychází z Martinova cíle uvolňovat práci): od 19. 10. 2026
  **podle zásob** – tolik, aby po příští sklizni měla zásoby na rok spotřeby z pole a k tomu
  pojistku, bez toho, co jí z dnešních zásob k příští sklizni zbude (viz Osev podle zásob níže;
  dřív roční potřeba a 15 % navíc, nad 1,5 roční potřeby jen potřeba), ale:
  - nejvýš kolik je dílů, které smí osít (viz Přílohová soustava),
  - nejvýš kolik její práce stihne ve špičkách (podzim, jaro, červenec a srpen – viz Ozim a jař;
    počítá se všechna práce po denním minimu, práci se zvířaty a od 19. 10. 2026 i po dospělých
    pasácích – [strava](diet.md), Pasáci; kalibrace z 80 %).
- Které díly oseje, určuje pořadí v Přílohové soustavě; čím je oseje (ozim, nebo jař), rozhodne
  ves zároveň (viz Ozim a jař).
- **Spotřeba z pole podle stravy** (od 19. 10. 2026, viz Osev podle stravy níže): ves nejí jen
  obilí, takže seje obilí a luštěniny jen na tu část energie, kterou jí nedá maso, mléko a sýr,
  vejce a ovoce.
- Když ves během roku zjistí, že má zásob dost, **rozjetý plán zkrátí hned** – díly, na kterých
  ještě nezačala práce, nechá ladem (viz Osev podle zásob).

#### Osev podle stravy

Stav: **návrh Clauda**, Martin schválil směr 19. 10. 2026 („Zatím udělejme osev podle stravy. Já
později zjistím, proč tam máme tuhle disbalanci.“). Stropy a podíly masa, mléka a luštěnin ani
potřeba bílkovin se nemění ([strava](diet.md)) – mění se jen to, kolik ves oseje.

**Proč:** cíl osevu počítal roční potřebu, jako by ves jedla jen obilí (dospělý 180 kg). Podle
noční kalibrace 19. 10. ale ves bere ≈ 40 % energie z masa, 30 % z mléka a sýra a 14 %
z luštěnin – obilí dorovná jen ≈ 16 %. Zásoby po sklizni proto vycházely na 3,5 roční potřeby
(cíl 1–1,5) a ves zbytečně kopala a sela (práce na obživu 94 % a 90 %, cíl 85–90 a 75–85 %).

**Pravidla:**

- **Potřeba z pole** = podíl jídla z pole × dnešní roční potřeba energie (dospělý 180, starší
  140, dítě 100 kg obilí). Pole = obilí a luštěniny (luštěniny svou energií – cíl osevu je od
  luštěnin energie obou plodin, viz Luštěniny).
- **Podíl jídla z pole** = kolik energie ves za **uplynulý hospodářský rok** (1. 9. – 31. 8.)
  potřebovala z pole: každý den potřeba energie bez toho, co pokrylo maso, mléko a sýr, vejce
  a ovoce, sečteno za rok a vyděleno roční potřebou. Měří se **potřeba, ne snědené obilí** –
  když ves hladoví, sní obilí méně, ale pole jí pořád má dát celý zbytek (jinak by hlad snížil
  osev a s ním přinesl další hlad). Celý rok proto, že strava se během roku mění (ovoce září–únor,
  mléko květen–září, sýr přes zimu) – průměr celého roku ji nezkreslí.
- **Kolik ze zásob a kolik zasít** řeší od 19. 10. 2026 Osev podle zásob (níže). Do té doby
  platilo: cíl osevu = potřeba z pole + rezerva obilí 15 % potřeby z pole, dokud zásoby obilí
  nemají víc než 1,5 roční potřeby z pole, + rezerva luštěnin – rezerva šla do obilí, protože jen
  obilí dorovná cokoli (luštěniny mají strop 25 % energie a ves je jí skoro na stropu, takže
  zásoba luštěnin výpadek masa nenahradí; porážka v ukázkové vsi dala jeden rok maso na 40 %
  energie a příští jen na 22 %).
- **Pojistka podílu:** podíl nejméně **0,3 = 1 − strop masa (0,4) − strop mléka a sýra (0,3)** –
  ves počítá, že z pole sní aspoň to, co maso a mléko na svých stropech nepokryjí; na ovoce (jen
  září–únor, sad stárne), vejce (málo) svůj odhad spotřeby nespoléhá. Když
  Martin stropy sníží, pojistka stoupne s nimi. Je to pojistka odhadu spotřeby – zásobu na výpadek
  drží pojistka zásob (Osev podle zásob). Cena: ves se sadem (ovoce sníží podíl pod 0,3) má zásoby
  o rozdíl vyšší.
- **Starší vsi a nová ves:** podíl se měří od prvního 1. 9. po založení vsi (nebo po uložení starší
  vsi), takže vždy pokrývá celý rok; do té doby ves počítá, jako by jedla jen obilí (podíl 1 –
  viz Osev podle zásob). První rok nové vsi ještě nemá maso (první porážka v listopadu), odhad
  „jen obilí“ je pro něj opatrný.
- **Co se tím nemění:** hlad, příděl a nasycení dál počítá [strava](diet.md) ze skutečné energie.
  Aby se ale řídily skutečnou energií i s menšími zásobami, upravily se tři odhady:
  - **výhled jídla do sklizně** počítá s mlékem stád do sklizně podle doby dojení a s celou zásobou
    sýra (strava – Implementace, Hlad z energie); dřív jen s dnešním mlékem, takže ves se zásobami
    podle stravy každý podzim zbytečně šetřila a hlásila hlad,
  - odhad, jestli **ozim uživí ves v srpnu** (Ozim a jař – přídělový systém počítá do 31. 7.),
    porovnává ozim s potřebou z pole, na kterou ves osévala, ne s potřebou celé energie,
  - **dobré zásoby** ([štěstí](happiness.md), +5) = zásoby z pole (obilí a luštěniny energií) na
    víc než rok potřeby z pole.
- **Kalibrace** – viz Osev podle zásob. Cíle osevu sond z Ukázky (1,7 a 2,7 ha) platí pro ves,
  která jí jen obilí – skript je násobí podílem z pole, na který sonda osévá, a pole sondy
  „o polovinu větší“ počítá z potřeby z pole. Nasycení dne bere skript ze simulace (i s mlékem
  dne); dřív ho přehrával bez mléka a v létě by hlásil hlad, který ves nemá.

#### Osev podle zásob

Stav: **Martin, 19. 10. 2026:** „Ať se osev řídí také zásobami. Samozřejmě, ať si ves drží nějakou
rozumnou zásobu, kdyby byly hubené roky (až jednou přidáme nějaké pohromy), ale teď by mohla celý
rok klidně stavět a byla by v klidu.“ A „Ano“ k návrhu „Rozjetá práce na poli půjde přerušit hned:
když ves podle nového pravidla zjistí, že má zásob dost, přestane kopat nové díly už letos
a neodloží to až na 1. září“. Podrobnosti a čísla **návrh Clauda**.

**Proč:** dřívější pravidlo při velkých zásobách jen vynechalo rezervu a dál selo celou potřebu.
Vlkov (24 lidí) měl v březnu 752 ≈ 11 200 kg obilí (3,4 roku celé potřeby energie) a 6 600 kg
masa, a přesto od 1. 3. kopal ≈ 9,7 člověkodne denně – volná práce nulová, tři stavby stály na
82–94 %.

**Pravidla:**

- **Cíl osevu k 1. 9.** (`sowingTargets` ve `field-food.ts`) = zásoby z pole, které má ves mít po
  **příští sklizni** (31. 8.) – tolik, aby po roce spotřeby z pole a ztrát skladováním zbyla
  **pojistka** –, bez toho, co z dnešních zásob k příští sklizni zbude (zásoba − spotřeba z pole do
  sklizně − ztráty skladováním, spojitě jako den po dni v simulaci). Nejméně 0 – ves s velkou
  zásobou obilí nezaseje nic a práce se uvolní na stavby.
- **Zásoby z pole** = obilí a luštěniny jejich energií; z luštěnin se do jejich sklizně počítá jen
  tolik, kolik se jich do ní stihne sníst (strop 25 % energie) – zbytek zůstane a sní se příště.
- **Pojistka = 0,5 roční potřeby celé energie** (≈ půl roku celé stravy) – zásoba, která má zbýt
  před další sklizní. **Z celé potřeby, ne z potřeby z pole:** výpadek, kterého se pojistka týká
  dnes, je výpadek masa a mléka (porážka kolísá – ve zkušební vsi spadlo maso ze 40 na ≈ 20 %
  energie dva roky po sobě a lidí přibylo) a růst vsi, které nestačí práce – tedy výpadek z celé
  stravy. Hubené roky (pohromy, neúroda) přijdou později; pojistka se pak doladí s nimi. **Proč
  0,5:** se stády podle bílkovin (diet.md – maso ≈ 11 %, mléko ≈ 10 % energie) jí ves ≈ 70 %
  energie z pole a rostoucí ves (děti, nevěsty) často nestihne zasít, kolik potřebuje – pojistka
  nasbíraná v lepších letech ji převede přes horší. Kalibrace 20 × 20 se stády: s 0,3 nasycení
  ≥ 0,95 u hráče, který staví, v 94,2 % let (**MIMO**), s 0,5 v 97,1 %; práce na obživu se skoro
  nezmění (87,0 a 87,2 % startovní ves). Dřív (stáda na stropech masa a mléka) stačilo 0,3:
  s 0,2 98,7 %, s 0,3 99,7 % let.
- **Pojistka podílu** (`FIELD_FOOD.minShare` 0,3, Osev podle stravy) dál hlídá odhad spotřeby:
  ves počítá, že z pole sní aspoň 30 % energie. Obě pojistky se sčítají jen u vsí, které z pole
  jedí méně (sad, med) – mají zásoby o rozdíl vyšší.
- **Přebytek nad pojistku ves sní za 3 roky** (zasije o třetinu přebytku méně), chybějící pojistku
  doplní hned. **Proč:** osev tak neskáče rok co rok mezi nulou a plnou plochou – ves s velkou
  zásobou několik let neseje obilí a pak plynule přidává (ukázková ves se zásobou obilí na 6 let
  celé potřeby zasela obilí na 0, 0, 180, 560, 610 kg a pak ≈ 290–390 kg ročně, jak lidí přibylo
  a stáda dorostla), a přitom má pojistku plnou, kdyby přišel výpadek.
- **Luštěniny podle své zásoby:** cíl luštěnin = jejich roční potřeba (bílkoviny, nejvýš strop) bez
  toho, co ze zásoby luštěnin k jejich sklizni (31. 7.) zbude – bez rezervy, pojistku drží obilí
  (luštěnin se nad strop nesní). Zasejí se, i když obilí ves nepotřebuje. Smějí jít na doplnění
  pojistky, ne pod roční potřebu z pole.
- **Vsi bez změřeného podílu z pole** (starší vsi, první rok nové vsi – Vlkov v březnu 752): počítá
  se s podílem 1, tedy se zásobou proti celé potřebě energie. **Proč:** bezpečné – ves spotřebu
  z pole nanejvýš přecení (o maso a mléko, které jí), takže jí zbude víc, než čekala; a když má
  zásob tolik jako Vlkov, nezaseje obilí ani tak.
- **Zkrácení rozjetého plánu** (`trimPlanToTarget` v `plan-trim.ts`, krok simulace `trimPlan`):
  **každý den od 1. 9. do 30. 4.** (okna kopání a setí – výpočet je levný: cíl a součet úrody plánu)
  ves spočítá cíl podle zásob znovu. Když očekávaná úroda plánu (obilí a luštěniny jako
  při plánu k 1. 9.) převyšuje cíl o víc než **desetinu roční potřeby z pole**, ubírá z obilí (ozim
  a jař – luštěniny se sejí podle bílkovin) **díly, na kterých ještě nezačala žádná práce**
  (vrácení přílohu, orba, kopání, setí) – od konce pořadí práce (`CropWork.partIds`, nejdál od domu
  první; z konců ozimu a jaře jde první díl dál od domu po pěšinách), dokud by úroda bez dalšího
  dílu neklesla pod cíl. **Proč desetina:** na podzim ves jí obilí méně (mléko, ovoce) a zásoby
  jsou chvíli nad průměrem roku – bez rezervy by plán ukrajovala po kouscích a v zimě by chybělo.
  - Rozpracovaný a zasetý díl zůstane – zasetá práce nepropadne; hotová práce ostatních dílů,
    čelo práce i vzhled dílů (postup po čtvercích) zůstanou, kde byly – práce plodiny ubude
    o podíl ubraného dílu stejně, jako když díl zabere stavba (`shrinkInPlan`).
  - **Ubraný díl leží ladem jako příloh** – díl, který se letos vracel z přílohu, jak ležel předtím
    (den, od kdy ležel ladem, i roky bez pastvy – `FieldPart.fallowBeforePlan`, smaže se na konci
    hospodářského roku), ostatní od 1. 9. jako nevybraný díl.
  - Kontrola je čistá funkce stavu a dne, takže nezávisí na kouscích dopočtu (test).
- **Ukázka – Vlkov** (před sloučením se stády podle bílkovin, s pojistkou 0,3; kopie z DB jen
  čtená: stav z 18. 6. 751 dopočtený dosavadním kódem do 22. 3. 752 – plán z 1. 9. 751 podle
  dřívějšího pravidla, 22 lidí, 11 213 kg obilí, 6 724 kg masa, stavby na 94, 94 a 82 %; pak dál
  dosavadním a novým kódem bez zásahu hráče):
  - 22. 3. 752 ves z jaře ubere 13 nezačatých dílů (0,3 ha ze 2,58 ha) – zbylé jarní práce
    (vrácení, kopání, setí) ubude z 212 na 113 člověkodní; ostatní díly jaře už podzim zkopal
    (rozpracované zůstávají). Do 30. 4. tak ves odvede na jaři 123 místo 175 člověkodní.
  - **Stavby dokončí 27. 4., 28. 4. a 31. 5. 752** – s dosavadním pravidlem až 5., 5. a 9. 2. 753.
  - **K 1. 9. 752** zasije jen luštěniny 3,9 ha (bílkoviny – zásoba luštěnin je nulová), obilí nic;
    dosavadní pravidlo 0,65 ha ozimu a 4,0 ha luštěnin. K 1. 9. 753 luštěniny 3,5 ha, obilí nic
    (dosavadní 0,4 ha ozimu a 3,7 ha luštěnin). Hlad žádný, obilí 9 900 kg ještě o dva roky
    později. Luštěniny ale berou ≈ 920 člověkodní vrácení přílohu, kopání a setí (a pak pletí
    a sklizeň) – potřeba bílkovin, kterou chce Martin prověřit.
- **Kalibrace** měří zásoby po sklizni vůči cíli osevu podle zásob (zásoby z pole po sklizni ÷
  zásoba, kterou ves po sklizni chce mít: rok potřeby z pole a pojistka se ztrátami) – pásmo
  0,8–1,25 (návrh Clauda); dřívější měřítko „1–1,5 roční potřeby z pole“ a zásoby obilí v roční
  potřebě celé energie vypisuje jako informaci. Hráč skriptu zakládá pole na úrodu rok co rok se
  zásobami na pojistce (`steadyHarvestKg`).
- **Naměřeno s osevem podle zásob – před stády podle bílkovin, pojistka 0,3**
  (`measure-village.ts 20 20`, 19. 10. 2026, jen orientačně; v závorce před změnou): zásoby z pole po
  sklizni ÷ cíl p10 0,84 / medián 1,02 / p90 1,32, v pásmu 0,8–1,25 80 % let (**MIMO** jen p90);
  v ročních potřebách z pole 1,32 / 1,65 / 2,40 (dřív se měřilo jen obilí: 1,02 / 1,38 /
  2,13), zásoby obilí v roční potřebě celé energie medián 0,76 (0,81); práce na obživu startovní
  ves 80,0 % (80,6 %), plná domácnost 70,5 % (71,3 %); osev startovní ves 0,63 ha (0,63), plná
  domácnost 1,15 ha (1,22); nasycení ≥ 0,95 celý rok, hráč staví 99,7 % let (100 %), nestaví
  100 % (100 %), nejhorší 1 % let 0,99 (1,00); nic nevymřelo, po 20 letech medián 2 domácnosti
  a 12 lidí (2 a 12); polozemnice čerstvě plnou domácností 236 dní (243) – o den pod pásmem.
  Kalibrační vsi velké přebytky nedrží (pole zakládá hráč na potřebu), takže osev ani práce se
  skoro nezmění – rozdíl je u vsí jako Vlkov, které zásoby nasbíraly. Zkrácení plánu v kalibraci
  skoro nenastane (plány vznikají už podle zásob).
- **Se stády podle bílkovin** (sloučení s `integ/herds` 19. 10. 2026 – roční ztráty, seno pro
  všechny druhy, uzené maso jen do 31. 8., chovné stádo podle potřeby bílkovin s rezervou 25 %,
  pasáci – [strava](diet.md)): osev podle stravy bez osevu podle zásob hladověl (nasycení ≥ 0,95
  u hráče, který staví, v 76,3 % let, plná domácnost jen v 24,5 % let). Příčiny a úpravy (návrh
  Clauda; stropy, potřeba bílkovin ani pravidla stád se nemění):
  - **Pasáci v práci na polní špičky:** dospělý pasák (plná domácnost bez starších dětí ≈ 0,8
    člověkodne denně od dubna do října) chybí na poli – plán k 1. 9. s ním nepočítal, v červenci
    ves sklidila luštěniny jen z půlky (sonda plné domácnosti, každý rok) a energie chyběla.
    Volná práce pro plán osevu se teď počítá i po dospělých pasácích dneška (`herdingDay`).
  - **Pojistka 0,5** místo 0,3 (výš) – rostoucí vsi, které nestačí práce na celý cíl osevu.
  - Podíl z pole za loňský rok se stády kolísá (v sondě plné domácnosti 0,48 ↔ 0,70 rok po roce)
    – zpětná vazba osevu podle zásob (chybějící pojistku doplní hned) a pojistka to pokryjí,
    odhad podílu z dnešních stád proto Claude nezaváděl (pravidla porážky by musel opakovat).
- **Naměřeno se stády podle bílkovin** (`measure-village.ts 20 20`, 19. 10. 2026, jen orientačně;
  v závorce `integ/herds` – osev podle stravy bez osevu podle zásob):

  | 20 vsí × 20 let                                    | Se stády a osevem podle zásob | `integ/herds`                |
  | -------------------------------------------------- | ----------------------------- | ---------------------------- |
  | nasycení ≥ 0,95 celý rok – hráč staví              | **97,1 %** let (p1 0,63) OK   | 76,3 % let (p1 0,65) MIMO    |
  | plná domácnost / startovní ves                     | **98,0 %** / 100 % let        | 24,5 % / 100 % let           |
  | hráč nestaví                                       | 98,9 % let                    | 93,9 % let                   |
  | zásoby po sklizni ÷ cíl, hráč staví                | 0,74 / 0,96 / 1,18            | –                            |
  | zásoby z pole po sklizni (roční potřeby z pole)    | 1,35 / 1,72 / 2,41            | jen obilí 0,75 / 1,04 / 1,51 |
  | zásoby po sklizni – startovní ves / plná dom.      | 1,92 / 1,98                   | 1,46 / 0,69                  |
  | práce na obživu – startovní ves / plná dom.        | 87,2 % / 87,4 %               | 87,6 % / 89,2 %              |
  | podíl jídla z pole (medián)                        | 70 %                          | 70 %                         |
  | dobytek na 10 lidí – krávy / prasata / ovce / kozy | 2,0 / 9,5 / 45 / 6,1          | 2,2 / 9,8 / 44 / 15,2        |
  | porážka na člověka a rok / zkažené maso            | 27 kg / 1,3 %                 | 26 kg / 1,9 %                |
  | po 20 letech domácností / lidí, vymření            | 2 / 12, nic                   | 2 / 12, nic                  |

  Zbylé hladové roky (11 z 380) jsou ve dvou vsích: jediná domácnost, která za dva roky vyrostla ze
  4 na 7 lidí, a ves, jejíž růst předběhl práci – cíl osevu nestihnou zasít ani s pojistkou.

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
  zarostl v les – proto 2,5 % (rešerše uvádí 2–2,5 %). Od 18. 10. 2026 zarůstá jen příloh, který
  stáda nespásají a ves neposeče (viz Zarůstání) – délka přílohu sama les nehlídá.
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
  úsek po pěšině se tak počítá 0,75–1 × délka (paths.md – Pěšiny a práce, Martin 18. 10. 2026);
  po pevné cestě podle stupně – vyšlapaná 1,2×, upravená 1,5× (roads.md – Rychlejší chůze).
  Mokřina se počítá dvojnásobně (po hati 1,5× rychleji než louka), brod + 30 m (po lávce bez
  zdržení) – i rovně mimo cestu, takže pole za potokem bez cesty zdraží, s hatí a lávkou zlevní.
  Stejně se měří vzdálenost čtverce sadu (orchard.md). Bez krajiny (kalibrace) vzdušnou čarou.
  **Chůze se přepočítává měsíčně** (Martin, 18. 10. 2026): hned po změně rozložení vsi (obydlí,
  nové díly a čtverce, cesty, ohrady, sady, hřbitov, stáda), změny stadií dílů (osev, úhor,
  pastva) se do ní promítnou až 1. dne dalšího měsíce (paths.md – Pěšiny a práce).
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
  Clauda) stojí práci navíc podle stadia přílohu (viz Zarůstání): mladý příloh (1–2 roky) nic,
  louka **drn jako založení na louce – 100 člověkodní na hektar (s řemesly 90)** (Semjonov 1974),
  křoviny jako založení v křovinách **100 (60)** a mladý les jako založení v lese **250 (150)**;
  dospělé stromy mladého lesa dají klády. V běžném oběhu se spásaný příloh vrací po 13 letech
  jako louka, tedy za 100 na hektar.

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

### Luštěniny

Stav: **Martin, 18. 10. 2026:** „c) ale maso bude mírně zvyšovat štěstí“ – bílkoviny 1,6 g na kg
tělesné váhy zůstávají a přidají se luštěniny jako plodina na poli (strava – [diet.md](diet.md),
Luštěniny). Čísla podle [rešerše](research/2026-10-18-legumes.md), kde chybí, návrh Clauda.

- **Plodina:** hrách a čočka jako jedna plodina „luštěniny“ (v Mikulčicích čočka ≈ 75 % nálezů
  luštěnin, hrách druhý; bob, vikev a hrachor vzácné – zatím ne). **Jař**: kopání na podzim
  (září–listopad), co se nestihne, v březnu–dubnu, setí v **březnu–dubnu**, pletí v květnu–červnu,
  sklizeň (trhání) v **červenci**, výmlat v zimě (listopad–únor). Ozimý hrách až ve 20. století.
- **Úroda:** 0,8 úrody obilí při stejné úrodnosti (≈ 600 kg/ha při plné, literatura 390–680),
  osivo **150 kg/ha** (výnos ≈ 1 : 3,3 – středověké účty 3× až 5½× jako obilí). Neopletý díl dá
  **50 %** (obilí 60 % – čočka plevel snáší nejhůř).
- **Práce** na hektar (nejhorší / nejlepší mez): kopání 100 / 50 a setí 10 / 10 jako jař, pletí
  **40 / 20** (obilí 30 / 15 – hrách se okopával dvakrát), sklizeň **35 / 20** + odnos 20 / 20
  (žeň luštěnin ≈ 1,2× dráž), výmlat **10 / 6** (obilí 15 / 10).
- **Úrodnost:** osev luštěniny úrodnost dílu neubere (obilí −0,12), ale **vrátí 0,03** – poutá
  dusík, ≈ rok přílohu (nejvýš plná úrodnost). Opatrná hodnota: dnešní pokusy dávají obilí po
  luštěnině víc, středověké výnosy z Winchesteru přínos nenašly.
- **Kolik ves oseje (k 1. 9.):** cíl luštěnin = kolik jich ves chce sníst za rok bez toho, co ze
  zásoby luštěnin k jejich sklizni zbude (od 19. 10. 2026 – Osev podle zásob; dřív + rezerva 15 %,
  při zásobě nad 1,5 roku jen potřeba). Kolik jich chce sníst, rozhodne od 19. 10. 2026
  **rovnovážné hospodaření** (diet.md): luštěniny soupeří cenou v práci se stády o bílkoviny,
  které chybí po obilí – ves je oseje, jen kde jsou levnější (typicky až když pastva a les
  neunesou víc ovcí, koz a prasat); dřív všechny bílkoviny chybějící po obilí, mléku stád
  a vejcích, nejvýš strop stravy (luštěniny šly ke stropu skoro vždy). **Obilí má přednost:** ves nejdřív vybere obilí
  na celý cíl osevu jako dřív, pak luštěniny dostanou díly toho výběru od domu (díly, které měly
  luštěniny loni, až nakonec – střídání plodin) a obilí doplní další díly, kolik energie
  luštěniny dají méně. Když na doplnění nestačí půda nebo práce, smí plán jít na rezervu osevu
  (od 19. 10. 2026 na doplnění pojistky zásob), ne pod roční potřebu (potřebu z pole – Osev podle
  stravy) – jinak díl zůstane obilím a luštěnin je méně. Díly hotové během roku
  jdou jen do jaře (luštěniny až s ročním plánem).
- **Zásoba luštěnin** (kg): sklizeň **31. 7.** (po jídle dne, jako ozim), nevymlácená část se
  1. 3. zkazí jako u obilí. Ztráta skladováním jako obilí (10 %, s hrnčířem 5 % ročně – zrnokaz
     napadá semena na poli, ve skladu se nemnoží). Jí se rovným dílem celý rok do příští sklizně.
- **Ve scéně** hrách tvoří nízkou hustou rohož – zelený kvetoucí v květnu–červnu, zralý hnědý
  v červenci; po sklizni místo panáků hromádky vytrhaného hrachu a skoro holá zem. Panel pole
  ukáže díly luštěnin (ikona a počet).

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
  Stejně díl pole založený v lese (povrch les – okno běží od založení dílu) i pole založené na
  lese vsi (viz Les vsi); vracený zarostlý příloh bonus nedostává (oběh dílu běží dál).
- **Bez náhody** – stejná práce na stejné půdě dá stejnou úrodu (Martin). Dobré a špatné roky
  přijdou až s mechanikou počasí; hájení z [populace](population.md) se pak rozšíří i na
  neúrodu.

### Zásoby a nasycení

- Čistá úroda jde do **společných zásob vsi** (návrh Clauda – ves drží společné zásoby).
- **Potřeba energie** (kg obilí za rok – dřív „potřeba jídla z pole“): dospělý 180, starší 140,
  dítě 100. Z pole je jen její část, kterou nepokryje zbytek stravy (Kolik ves oseje – Osev podle
  stravy).
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
Týž den, když dobytek dostal skutečnou nosnost pastvy (stáda spasou jen část velkého pole):
nepasený a nesečený příloh zarůstá (viz Zarůstání).

- Příloh i díl odebraný z pole: **1–2 roky mladý příloh** (plevel, tráva) – vrácení bez práce
  navíc, pak **louka** – pastvina a louka na seno, vrácení do osevu jako založení na louce (viz
  Práce). Pase-li se na ní nebo seče-li se, louka zůstane loukou; jinak zarůstá.
- **Pastva po dílech** (návrh Clauda – [strava a dobytek](diet.md)): stáda se pasou napřed na
  nejbližším přílohu ve fázi louky (mladý příloh i louka, od nejbližšího k obydlí – přímá
  vzdálenost dílu, při shodě id), každý díl pojme nejvýš svou plochu potřeby pastvy (≈ 1 ha na
  krávu a vola, 0,2 ha na ovci a kozu); co zbude, pasou na přirozených loukách krajiny. Díl se
  **spásl**, když na něj připadla aspoň **polovina** jeho plochy. Stejné rozdělení určuje, kam
  chodí pasáček (síť pěšin) a kde se stáda pasou ve scéně.
- **Změna (Martin, 19. 10. 2026):** „Stáda domácího zvířectva se nesmí potulovat sama. Vždycky
  s nimi musí být nějaký člověk. Ten je bude primárně vodit na louky, určené ke spásání. Domácí
  zvířata by neměla spásat jídlo pro lidi ani ho pošlapat a na čerstvém úhoru toho k pastvě také
  asi moc není.“ Pase se napřed na přílohu ve fázi louky, který se letos neseče, pak na
  přirozených loukách, pak na **mladém přílohu – jen třetinou píce** – a nakonec na otavě
  posečených luk; louka letošní seče se před sečí nepase. Osetý díl nikdy, strniště po sklizni
  ano (do nosnosti se nepočítá). Pase se jen podíl stáda, který pasáci uhlídali. Podrobně
  [strava – Pastva a vždy s pasákem](diet.md).
- **Seno** ([orání rádlem](oxen.md)): úhor ve fázi louky se seče na seno pro krávy a voly – práce
  v červnu–červenci a seno v zásobách. Díl, ke kterému letos došla seč, se **posekl**.
- **Starší vsi:** roky bez pastvy a seče se začnou počítat od zavedení pravidla – žádný díl
  nezaroste hned (rozhodnutí Clauda – stará data o pastvě nejsou).
- **Přirozená louka**, která nikdy nebyla polem, zůstává loukou (návrh Clauda – louky se zatím
  nemění, nezarůstají).
- **Ve scéně:** mladý příloh jako zaplevelená zem, louka jako tráva (na jaře kvetoucí, seč, stohy),
  zarůstající příloh s přibývajícími keři a stromky. Okolí vsi tak tvoří mozaiku polí, pastvin
  a mlází v různém stadiu.

### Zarůstání

Stav: **Martin, 18. 10. 2026:** „Ano udělej to tak“ – nepasený a nesečený příloh zarůstá, a když
zaroste lesem, z pole vypadne. Čísla návrh Clauda, ověřená
[rešerší](research/2026-10-18-overgrowth.md) (sedí s chronosekvencí opuštěné louky 2–5 / 5–15 /
15–30 / přes 30 let – Jelinčić a kol. 2023 – a s Českým krasem: trnka kolem 15. roku, zapojené
dřeviny po ≈ 20 letech – Prach 2023). Implementace `overgrowth.ts`.

| Roky bez pastvy a seče | Na dílu                                | Vrácení do osevu stojí                             |
| ---------------------- | -------------------------------------- | -------------------------------------------------- |
| do 5                   | louka (mladý příloh 1–2 roky ladem)    | drn louky 100 (90) člověkodní/ha, mladý příloh nic |
| 5–15                   | křoviny (trnka, hloh, šípek, svída)    | jako křoviny 100 (60)                              |
| 15–30                  | mladý les (osika, bříza, líska)        | jako les 250 (150), dospělé stromy dají klády      |
| přes 30                | les – **díl z pole vypadne** (les vsi) | jako nové pole v lese (viz Les vsi)                |

- **Rok bez pastvy a seče** se počítá jednou za rok **1. 11.** (po pastevní sezóně a seči, před
  podzimní porážkou – stáda jsou ještě letní) a jen dílům, které ležely ladem **celé vegetační
  období od 1. 4.** (díl zatravněný v září se ten rok nepočítá). Díl, který se nespásl ani
  neposekl, přidá rok. Ve fázi louky (do 5 let) pastva nebo seč roky **vynuluje** – louka zůstane
  loukou; od křovin už pastva ani seč zarůstání nevrátí (keře a stromky by bylo třeba vymýtit –
  to je vrácení do osevu) a díl **přestane být pastvinou** (sníží nosnost – zpětná vazba: méně
  pastvy, menší stádo, víc zarůstá). Návrh Clauda; literatura uvádí, že zarůstání zastaví kosení
  nebo pastva nejpozději od ≈ 8. roku (Prach 2023) – hra je o kus přísnější.
- Zarůstá díl na louce, v křovinách i na vymýceném lese stejně. Křoviny a mladý les se nesečou.
  Vrácený díl (osev) začne počítat znovu od nuly.
- **Determinismus:** roční krok je pevný den simulace a čte jen stav vsi – výsledek nezávisí na
  tom, po jakých kouscích se ves dopočítá.
- **Vypadnutí z pole:** díl, který dosáhne 30 let, zmizí z pole (ze seče i z rozdělení práce
  dne); pole se zmenší, a když nezbude žádný díl, zanikne i se svou stavbou. Na čtverci zůstane
  **les vsi**. Kronika: „Nepasený díl pole zarostl lesem – pole se zmenšilo.“ (víc dílů: „…ubylo
  N čtverců“, poslední díl: „Nepasené pole zarostlo lesem a zaniklo.“), krátký řádek nahoře.

### Les vsi

Návrh Clauda (implementace `woods.ts`): stav vsi si pamatuje zarostlé čtverce (políčko, plochu,
povrch při založení a den vypadnutí z pole – les je tehdy 30 let starý).

- **Stromy jsou herní data** jako stromy u pevných cest ([cesty](roads.md)) – překážky nad vrstvou
  krajiny se stabilním id: na čtverci roste tolik stromů jako v lese krajiny (**240 na hektar**,
  ≈ 5 na políčko – vlastní výpočet z vrstvy překážek), na pevných místech čtverce. **Dospělých**
  přibývá se stářím lesa – od 15 let (mladý les) lineárně do plné hustoty v **70 letech** (jako
  pokácený strom krajiny – [les a dřevo](forest.md); Prach 2023: les podle složení ≈ 70 let),
  ostatní jsou mladé stromky.
- **Dřevo:** dospělé stromy lesa vsi jde kácet pro stavby a dílny jako stromy krajiny (nejbližší
  první; duby pro modlu a svatyni jen z lesa krajiny) a počítají se do dřeva, které ves má.
  Uhlíř, který pálí buky, smí pálit i les vsi – je to smíšený les a dřevo vsi (rozhodnutí
  Clauda). Pokácený strom nechá pařez a dorůstá jako strom krajiny, i ze sazenice, kterou
  uhlíř na pařez zasadí.
- **Stavba:** pole na lese vsi ho **vymýtí jako les** – povrch les (250, s řemesly 150 člověkodní
  na hektar, stromy v ceně), dospělé stromy dají klády a vymýcená půda popel (viz Úroda); les
  zmizí, až se díl založí. Ostatní stavby (obydlí, pozemek, ohrada, sad, hřbitov, modla
  a svatyně) jdou jako v lese krajiny zatím jen na louku – na les vsi ne.
- **Pastva:** les vsi na bývalé louce už není pastvinou a prasatům je lesem (žaludy a bukvice);
  les vsi na vymýceném lese se lesem prasat stane zase (díl v lese nepočítá) – [strava a
  dobytek](diet.md).
- **Ve scéně:** plný porost 3D stromů (bříza a osika, s věkem přibývá dubů a buků) s podrostem,
  stromy rostou do 70 let, pokácený strom je pařez; na minimapě les.

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
  těch čtvercích. Spřežení s rádlem orá na čele orby pruh u čáry práce a každý den dojde dál
  ([oxen.md](oxen.md) – Spřežení postupuje s orbou).
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
200 60` a `--variant meadow-burn`, 18. 10. 2026, **naměřeno na 200 vsích**; stejné vsi a krajiny v obou variantách; pravidla ze 18. 10. odpoledne před
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
| nasycení ≥ 0,95 celý rok (staví / ne)       | 74,1 % / 96,9 % let  | 77,2 % / 97,2 % let |
| zásoby po sklizni p10 / medián / p90        | 0,80 / 1,15 / 1,52   | 0,83 / 1,17 / 1,51  |
| zásoby v pásmu 1–1,5                        | 58 % let             | 62 % let            |
| na konci domácností / lidí (medián)         | 2 / 9                | 2 / 11              |
| vymření (staví / jediná domácnost)          | 10,5 % / 13,0 %      | 8,5 % / 12,0 %      |
| první možnost stavět p50 / p90              | 4,6 / 8,9 roku       | 4,6 / 8,9 roku      |
| zemnice / polozemnice čerstvě plnou dom.    | 91 / 423 dní         | 77 / 378 dní        |
| startovní ves: rezerva jaro / léto / podzim | 26 % / 12 % / 1 %    | 17 % / 12 % / 1 %   |
| pole / osev na domácnost na konci           | 22,6 / 1,69 ha       | 19,0 / 1,75 ha      |
| založeno louka / křoviny / les (ha na ves)  | 32,0 / 2,6 / 20,3    | 32,2 / 2,6 / 20,5   |

- **Pálení drnu pomůže, ale málo:** o ≈ 3 body víc let bez hladu, o 2 lidi víc na konci,
  zemnice o 2 týdny rychleji (zakládání polí bere méně společné práce). Cíl nasycení (95 % let)
  je stejně daleko – hlad nedělá cena louky, ale to, že pole nestačí růstu vsi a zásoby po
  sklizni kolísají (viz Rovnováha zásob níže). Rezerva startovní vsi na jaře klesne (první
  sezóna dílů pálených luk dá méně, ves oseje víc dílů).
- **Skutečné krajiny vs. syntetická louka:** hráč začne mýtit les už u první domácnosti
  (medián; nejlepší les s popelem má víc úrody za člověkoden než chudší a vzdálenější louka),
  za 60 let založí ≈ 32 ha louky a ≈ 20 ha lesa. Vymře ≈ 10 % vsí, kde hráč staví (na
  syntetické louce 6 %), a 13 % jediných domácností.
- Rozdíl vymření (21 proti 17 vsím z 200) je v mezích náhody; nasycení a zásoby jsou párové
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
  dílů ukáže panel vybraného pole. Pole jde natočit po 15° (Natočené stavby): [ a ] před prvním
  čtvercem otáčejí mřížku, nad polem se malování chytí jeho mřížky.
- **Zakládání:** pole se zakládá jako stavba po dílech od obydlí – rozpracovaný díl se rozrývá
  po řádcích, stromy a kameny z hotového dílu zmizí.
- **Panel pole** (výběr kliknutím): výměra, úrodnost, kolik dílů se zakládá, je oseto a leží
  v přílohu podle stadia (mladý příloh, pastvina, křoviny, mladý les) – ikony a čísla; oseté díly
  podle plodiny (ozim, jař); **kolik z pole zarůstá** – ikona zarůstání (keř a mladá bříza)
  s plochou přílohu, který se poslední vegetační období nespásl ani neposekl, i toho, který už
  zarostl (viz Zarůstání). Očekávaná úroda a jestli práce stačí – později.
- **Horní lišta:** zásoby obilí, volná společná práce za den, nasycení (barva ikony); výměra polí
  klesne, když díl zaroste lesem a vypadne z pole.
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
  **Vystouplé obilí** (Martin, 19. 10. 2026: „Zrající a dozrálé obilí by mělo být také mírně
  vystouplé – pšenice dvouzrnka má nějakou výšku.“): zelené a zralé obilí je vyvýšená hmota –
  nad dílem leží „koruna“ porostu (textura porostu shora) ve výšce 0,62 m (zelené) a 0,88 m
  (zralé), k okraji pole se svažuje a zanoří pod zem; 3D trsy (zelené 0,85 m, zralé 1,15 m – klasy)
  z koruny vyčnívají, z dálky, kde trsy řídnou, nese výšku pole koruna. Dvouzrnka v pokusech
  a krajových odrůdách dorůstá ≈ 0,9–1,3 m (návrh Clauda – hmota stébel pod klasy). Kde stojící
  obilí končí uvnitř pole (čára žně na rozpracovaném dílu, sousední zoraný nebo sklizený díl),
  spadne koruna svislou stěnou – schod. Luštěniny (hrách, čočka – polehlé) mají korunu jen 0,3 m,
  vzcházející osení, strniště a úhor žádnou. Vítr vlní dál trsy, sníh a usychání platí pro
  korunu jako pro obtisk pole.
  **Kulaté rohy** ([oxen.md](oxen.md) – Kulaté rohy; Martin, 19. 10. 2026): kde pole oralo
  spřežení rádlem, má zoraná plocha – i osetá, zelená, zralá a strniště po ní – vnější rohy pole
  zakulacené obloukem o poloměru 5 m (do rohu se spřežení s radlicí v zemi nevejde); v rohu
  zůstane tráva louky a nestojí tam trsy. Vnitřní rohy, styky dílů a styk s jiným polem zůstanou
  jako dřív, kopané díly mají rohy ostré.
  Kolem vsi se navíc seče pár luk na seno (jen vzhled, na dvě domácnosti jedna louka).
  **Zarůstání** (viz Zarůstání, Les vsi): stáda se pasou jen na dílech, kam dojdou (nejbližší
  napřed). Na nepaseném a nesečeném přílohu od 3. roku přibývají keře, které rostou (plné
  křoviny v 15 letech), od 8. roku průkopnické stromky (bříza, osika), v 30 letech mladý les;
  obtisk pole na křovinách a mladém lese zmizí a zůstane tráva louky. Les vsi je plný porost 3D
  stromů s podrostem, stromy rostou do 70 let (přibývá dubů a buků), pokácený strom je pařez.
  Keře a stromy jsou modely krajiny – barví se a opadávají s ročními obdobími a vrhají stín jako
  ostatní stromy. Mění se jen se změnou dat (rok bez pastvy, stáří lesa).
- **Práce po čtvercích** (Martin: „aby pole neměnilo fáze, které jsou závislé na člověku,
  samovolně“): díl se změní (zoráno, oseto, sklizeno, posečeno), až když k němu práce dojde –
  rozpracovaný je vždy jeden díl na úlohu a mění se po řádcích od strany blíž vsi; postavy
  pracují přesně na něm, řada stojí na čáře práce, a když je čtverec hotový, dojdou na další.
  **Stav:** herní jádro posílá vzhled dílů po čtvercích (`SceneFieldPart.look` / `work` /
  `before` z `fieldPartLooks` – viz Postup práce po čtvercích) a frontu práce
  (`SceneLaborShare.parts`); scéna odhaduje z data jen starší příloh (louka na seno, pastvina).
- **Kronika:** založení pole, sklizeň (kolik – ves s ozimem i jaří zvlášť sklizeň ozimu a jaře),
  hlad, pole ustoupilo stavbě obydlí (o kolik m², nebo zaniklo), nepasený příloh zarostl lesem
  a vypadl z pole (krátký řádek nahoře).
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
| ~~Na přílohu se pase – nálet ani les nebude; 1–2 roky mladý příloh, pak napořád pastvina~~                                        | Martin (18. 10. 2026)                           |
| ~~Vrácení přílohu nejvýš drn louky (100, s řemesly 90); staré díly v náletu či lese jsou pastvinou~~                              | návrh Clauda (podle Martina)                    |
| Nepasený a nesečený příloh zarůstá (louka do 5 let, křoviny do 15, mladý les do 30), les z pole vypadne                           | Martin (18. 10. 2026)                           |
| Roky 5 / 15 / 30 podle rešerše (Jelinčić a kol. 2023, Prach 2023); křoviny trnka, hloh, šípek, svída                              | návrh Clauda (rešerše 18. 10. 2026)             |
| Roční krok 1. 11., jen díl ladem celé vegetační období; pastva či seč nuluje jen ve fázi louky                                    | návrh Clauda                                    |
| Pastva po dílech od nejbližšího, díl nejvýš svou plochou; spásl se při polovině plochy; zbytek na loukách krajiny                 | návrh Clauda                                    |
| Vrácení podle stadia: louka 100 (90), křoviny 100 (60), mladý les 250 (150) a klády za dospělé stromy                             | návrh Clauda                                    |
| Les vsi: 240 stromů/ha, dospělé od 15 do 70 let, kácí se na dřevo; pole ho vymýtí jako les, jiné stavby ne                        | návrh Clauda                                    |
| Starší vsi začínají počítat roky bez pastvy od zavedení pravidla                                                                  | rozhodnutí Clauda                               |
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
| Pole jako krajina – na pole smí cokoli kromě jiného pole                                                                          | Martin (18. 10. 2026)                           |
| Sad, hřbitov a ohrada vezmou celý čtverec, modla a svatyně průnik půdorysu, jabloň a strom u cesty 20 m²                          | návrh Clauda                                    |
| Nálet stromů u cest na poli jen na mezi (místa 2,5–4 m od osy); jabloně kdekoli podél cesty                                       | návrh Clauda                                    |
| Luštěniny jako plodina na poli kvůli bílkovinám (1,6 g/kg zůstává); maso mírně zvyšuje štěstí                                     | Martin (18. 10. 2026)                           |
| Všechny stavby jde natáčet po 15°, plošné stavby každá ve vlastní natočené mřížce; pozemek se natočí celý, místo domu Tab         | Martin (18. 10. 2026)                           |
| Mřížka na pole / sad (počátek, natočení 15–75°), čtverce v ní; krajina pod čtvercem 5 × 5 body; překryvy ze skutečných ploch      | návrh Clauda                                    |
| Navazování jen ve stejné mřížce; stavba přes pole v jiné mřížce mu vezme průnik; les vsi pole vymýtí jen po jeho čtvercích        | návrh Clauda                                    |
| Hřbitov a ohrada se natáčejí taky – hřbitov ve vlastní mřížce jako pole, ohrada jako čtverec natočené mřížky                      | Martin (19. 10. 2026), návrh Clauda             |
| Ohrada bez volného středu (malování jednoho čtverce, střed ve středu políčka); model dat volný střed unese                        | rozhodnutí Clauda                               |
| Luštěniny = hrách a čočka, jař se sklizní v červenci; úroda 0,8 obilí, osivo 150 kg/ha, práce a neopletý díl podle rešerše        | návrh Clauda (rešerše)                          |
| Osev luštěniny úrodnost vrátí o 0,03 (obilí −0,12); ztráta skladováním jako obilí                                                 | návrh Clauda (rešerše)                          |
| Obilí má přednost: luštěniny na díly výběru od domu, obilí doplní energii, luštěniny smějí jít na rezervu osevu, ne pod potřebu   | návrh Clauda                                    |
| Střídání: díly s loňskými luštěninami až nakonec; díly hotové během roku jen do jaře                                              | návrh Clauda                                    |
| Osev podle stravy – ves seje obilí a luštěniny jen na energii, kterou nedá maso, mléko a sýr, vejce a ovoce                       | Martin (19. 10. 2026)                           |
| Podíl z pole za uplynulý hospodářský rok (potřeba, ne snědené obilí), pojistka 0,3                                                | návrh Clauda                                    |
| ~~Rezerva jde do obilí – zásoby obilí na 1–1,5 roku potřeby z pole~~; výhled jídla s mlékem do sklizně                            | návrh Clauda                                    |
| Osev podle zásob – ves si drží rozumnou zásobu na hubené roky, s velkou zásobou seje méně a staví                                 | Martin (19. 10. 2026)                           |
| Rozjetý plán se zkrátí hned, ne až 1. 9. – ves přestane kopat nové díly                                                           | Martin (19. 10. 2026)                           |
| Zrající a zralé obilí vystouplé (dvouzrnka); kulaté rohy pole oraného rádlem                                                      | Martin (19. 10. 2026)                           |
| Koruna porostu 0,62 / 0,88 m, luštěniny 0,3 m, schod na čáře žně; roh 5 m jen vnější rohy oraných dílů, jen vzhled                | návrh Clauda                                    |
| Cíl = rok spotřeby z pole a pojistka po příští sklizni bez toho, co zbude; pojistka ~~0,3~~ 0,5 roční potřeby celé energie        | návrh Clauda                                    |
| Volná práce pro plán osevu po dospělých pasácích (se stády podle bílkovin)                                                        | návrh Clauda                                    |
| Přebytek nad pojistku za 3 roky, chybějící hned; luštěniny podle své zásoby bez rezervy; bez měření podílu podíl 1                | návrh Clauda                                    |
| Zkrácení plánu denně 1. 9. – 30. 4. nad cíl + desetinu potřeby z pole; jen nezačaté díly od konce pořadí, ladem jako příloh       | návrh Clauda                                    |
