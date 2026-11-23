# Pole a jídlo vesnice

> **Neplatné sekce** (Kolik ves oseje s podsekcemi Osev podle stravy, Osev podle zásob, Plynulejší osev, Osev podle růstu vsi a Osev navíc, dále přeškrtnuté odrážky o plánu osevu k 1. 9.) jsou přesunuty do [history/fields-history.md](history/fields-history.md). Odkazy „Osev podle …“ a „Kolik ves oseje“ v textu níž míří tam; platí osevní postup po dílech a přílohová soustava do roku 1100.

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
  kamennými sekerami (Rösch a kol. 2017); žďár bez klučení pařezů přijde s další mechanikou –
  **návrh 26. 10. 2026** (issue #10, [les a dřevo](forest.md) – Klučení lesa pro pole – postup):
  díl v lese se klučí po fázích – kácení s kládami u lesa, 30 dní schnutí, pálení větví
  a pařezů v březnu až říjnu; sazba lesa se nemění (60 % kácení, 40 % pálení), bonus popela
  běží od dohoření.
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
    cesty. Ústup pole (sadu, hřbitovu, ohradě, modle, svatyni, jabloním nebo stromům u cesty) se
    zapíše, ale panel Kronika ho neukazuje (Martin 14. 11. 2026: „nicneříkající“). Pole leží na krajině pod ním – na čtverci pole v lese (vymýceném) stavby smí jako
    jinde na poli a za les neplatí, pole ho už vymýtilo (Martin, 19. 10. 2026: „pokud jsem pole
    založil v lese, tak na něm nemohu postavit kovárnu“ – oprava, viz Stavby v lese níž).
- **Stavby v lese** (Martin, 19. 10. 2026: „Oprav – obydlí může jít postavit i v lese – les se
  prostě vyklučí.“; podrobnosti návrh Clauda – [populace](population.md), Stavba v lese): do lesa
  krajiny i lesa vsi smí každá stavba – obydlí, pozemek, dílny, modla, svatyně, ohrada, sad
  i hřbitov. Les pod stavbou se platí **sazbou lesa jako díl pole** (250, s řemesly 150 člověkodní
  na hektar plochy lesa – stromy, mladé stromky, souše, padlé kmeny, pařezy i podrost v sazbě,
  kameny a balvany po kusech), dospělé stromy dají klády. Kolem volně stojící stavby (obydlí,
  dílna, modla, svatyně) se v lese vyklučí i pruh 4 m pod korunami okolních stromů. Skalní
  výchoz, voda a prudký svah stavbu dál nedovolí, posvátné duby a háje se nekácí.
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
  stavby les vsi vyklučí i jen zčásti (Pole jako krajina – Stavby v lese).
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
- **Jiné vsi na téže mapě** (od 1. 11. 2026 nejsou – jedna ves, jedna mapa; [stěhování](migration.md) – Vsi na téže mapě): přehled jiných vsí
  nese natočené čtverce polí, sadů, hřbitovů, ohrad a lesa vsi s jejich mřížkou zvlášť
  (`squares`), natočený
  pozemek jako tvar obydlí. Cizí půdu blokují kontroly podle skutečné plochy – natočený čtverec
  či pozemek jiné vsi zablokuje jen stavby a čtverce, do kterých opravdu zasahuje; políčka
  v mřížce krajiny a celá políčka pod jejich volnými obydlími a posvátnými stavbami jako dřív
  (rozhodnutí Clauda). Přehled bez `squares` platí dál.
- **Kompatibilita:** stavby bez mřížky a pozemky bez natočení se počítají bit po bitu jako dřív
  (testy a kalibrace beze změny); dopočet po kouscích dává totéž jako vcelku i s natočenými
  stavbami.

### Přílohová soustava do roku 1100 (Martin 10. 11. 2026)

Stav: **Martin, 10. 11. 2026:** „Postupnými úpravami jsme podle mě omylem zavedli trojpolní systém
místo přílohového“ – „Takže teď máme hybridní systém?“ – „Pojďme to udělat takto: od roku 500 do
roku 1100 bude přílohový systém. Od roku 1100 výš bude možnost přejít na trojpolní systém, ale bude
to mít svá úskalí“. Podrobnosti jsou **návrh Clauda** – vrací původní pravidlo Přílohové soustavy
„Osev rok po roku do 70 %“.

**Proč:** pevný sled na dílu **ozim → jař → úhor** (Osevní postup po dílech, bod 1, od 25. 10. 2026) je pořadí z trojpolí – jen s víc lety úhoru. Přílohová soustava pořadí plodin nezná:
díl se osévá, dokud dává, a pak leží ladem, dokud se neodpočine.

**Pravidla (platí od roku 500 do konce roku 1099 herního kalendáře):**

1. **Osev rok po roku do 70 %:** díl se osévá rok co rok, dokud jeho úrodnost před osevem
   neklesne pod **70 %** přirozené (`FERTILITY.sowableMin`); každý osev obilí ubere 12 %
   (`sowDepletion`), len 18 %, luštěniny starších vsí přidají 3 % (beze změny). Pak leží ladem
   jako **příloh**, dokud se neodpočine na **95 %** (`fallowReady`, obnova 5 % ročně – Martin 26. 10. 2026). Platí pro každý osev – obilí, len i nouzový příloh (ten po osevu klesne pod 70 %
   a jde rovnou zpět do přílohu).
2. **Plodina podle prvního okna – žádný předepsaný sled:** díl na řadě (odpočatý příloh, nový díl
   i díl v osevu) dostane **ozim**, když setí ozimu začne v okně ozimu (září–říjen), jinak na jaře
   **jař** (jako dřív první osev oběhu). Po žni ozimu (červenec–srpen) tak díl může na podzim dostat
   zase ozim, po jaři ozim (stihne-li ho ves) nebo na jaře jař. Ruší se Osevní postup po dílech,
   bod 1 – Po ozimu jař, Po jaři úhor, Jař jako první osev – pak ozim a Kolik je čeho.
3. **Kolik je čeho** (dnešní čísla, odvozená z `FERTILITY` – `field-capacity.ts`):
   - odpočatý díl **95 → 83 → 71 → 59 %** = **3 osevy** a příloh **8 let** (59 → 99 %); další
     oběh začne výš (99, 98, 97, 96 %) a příloh trvá 7 let. Ustálená dráha je 51 let = 5 oběhů,
     15 osevů a 36 let přílohu – průměrně **3 osevy a 7,2 roku přílohu**;
   - čerstvý díl **100 → 88 → 76 → 64 %** = 3 osevy a příloh **7 let** (64 → 99 %);
   - ustálená ves má osetých **≈ 29 % plochy v oběhu** (15/51, pole ≈ **3,4×** osevu –
     `ROTATION_FACTOR`) – stejně jako pevný sled (34 let, 10 osevů): plochu osevu určuje poměr
     ztráty a návratu úrodnosti (12 : 5), ne počet osevů. Rozdíl proti pevnému sledu: osévá se
     o něco horší půda (průměr osevu **85 %** přirozené místo 89 % – úroda z osetého hektaru
     ≈ −2–3 %), příloh se vrací po třech osevech místo dvou (vracení přílohu na osetý hektar
     ≈ −1/3) a leží 7–8 let místo 5 (víc zarůstá, kde se nepase ani neseče). Průměrná úrodnost
     dílu v oběhu klesne z ≈ 85 % na 79 % (Pole uživí podle dnešní půdy).
4. **Zůstává:** pořadí výběru (díly v osevu, čerstvé díly, odpočaté přílohy, pak přílohy 70–95 %
   a nouzové – Osevní postup po dílech, body 2 a 3), setí do konce okna, postup práce po dílech od
   čela, přednost polní práce před stavbami, okna a sazby práce, osivo bez cíle osevu. **Nouzový
   příloh** (40–70 %, jen při skutečném nedostatku) dá jeden osev – po něm je pod 70 % a jde do
   přílohu samo. **Len je místo jaře** (nejlepší díly, na dílu nejdřív za 7 let – Len): bere díly,
   na kterých by dnes začala jař – napřed **díly v osevu** (len zabere jen jejich jarní osev),
   pak díly prvního osevu, v obou skupinách od nejlepší úrodnosti (návrh Clauda). V září a říjnu
   dostane díl na řadě ozim, len tedy přibývá až v listopadu (kopání pod jař) a na jaře.
   **Změna 10. 11. 2026:** ves si díly na příští len **odloží předem** – viz Len, „Díly na len
   si ves odloží na podzim“; pořadí „napřed díly v osevu“ je pryč, len bere nejúrodnější díly na řadě.
5. **Páry k rádlům** ([oxen.md](oxen.md) – Kolik volů ves chce): **od 22. 11. 2026 ves se správcem
   podle lidí** (D114 – Martin 22. 11. 2026 „ano“): chce tolik párů, kolik obslouží lidmi, díly na
   řadě nerozhodují; **ves bez správce** (pole nezakládá) dál podle dílů na řadě, nejvýš podle lidí
   (návrh Clauda, opravné kolo 1 – [oxen.md](oxen.md)). Díly na řadě se počítají (návrh Clauda –
   páry jako za pevného sledu): první osev oběhu (odpočatý příloh, nový díl) se
   počítá do podzimního okna orby ozimu, díl v osevu do všech oken orby za rok (na podzim i na
   jaře).
6. **Co hráč vidí:** panel dílu ukazuje kolikátý osev oběhu (1., 2., 3.) a **Příště** podle
   prvního okna; díl v osevu po sklizni je ve scéně strniště do další práce.
7. **Starší vsi** (převod jednou a idempotentně, návrh Clauda – `withoutRotationNext`): díl s
   pevným sledem (`FieldPart.next` – po ozimu jař, po jaři ozim) se osévá dál, má-li aspoň 70 %,
   a plodinu dostane podle prvního okna; díl na řadě pod 70 % jde ode dneška do přílohu. Zasetý
   díl jen ztratí `next`; ves bez `next` se nemění.
8. **Od roku 1100 možnost trojpolí – návrh se připravuje** (`THREE_FIELD_FROM_YEAR` = 1100 v
   `rules-fields.ts` – dnes se podle ní nic nepřepíná). Podmínkou je i pokřtěný rod (Martin 10. 11. 2026: „Také bude podmínkou k přechodu na trojpolní systém“ – [křesťanství](christianity.md)).

**Krátký příloh ve Vlkově (ověřeno 10. 11. 2026):** v měření Vlkova 871–873 šlo ≈ 3 ha ročně
(≈ 8 % prvních osevů) na díly jen 0,6–2,5 roku ladem. Všechny měly při osevu 96–99 % – byly to
díly po **luštěninách** z doby před 9. 11. 2026 (+3 % úrodnosti, po nich podle pevného sledu
úhor): díl šel do přílohu s 86–94 % (po ozimu 83 + 3 %, nebo luštěniny jako první osev) a na 95 %
se odpočinul za 0–2 roky. Nebyla to chyba ani nouzový osev či naplavenina – pevný sled tak
posílal do úhoru díly, které úrodnost ještě měly. S luštěninami na poli zrušenými (9. 11. 2026)
dobíhá jen rok převodu a v přílohové soustavě díl s ≥ 70 % zůstane v osevu.

**Naměřeno – Vlkov 871–873** (10. 11. 2026, kopie stavu od 3. 3. 871, 105 ha dílů, dopočet den
po dni bez zásahu hráče, ne kalibrace; pevný sled → přílohová soustava). Osev podle roku setí
(jař na jaře, ozim na podzim téhož roku), osev v řadě = kolikátý rok se díl osévá bez přílohu:

| Rok | Oseto ha    | Ozim ha     | Jař ha      | 1. / 2. / 3. osev v řadě ha          |
| --- | ----------- | ----------- | ----------- | ------------------------------------ |
| 871 | 33,4 → 39,3 | 16,5 → 17,4 | 16,9 → 21,8 | 18,8 / 14,6 / – → 16,0 / 12,9 / 10,4 |
| 872 | 44,6 → 39,9 | 25,0 → 29,1 | 19,6 → 10,6 | 25,8 / 18,8 / – → 14,3 / 11,0 / 14,6 |
| 873 | 44,6 → 45,0 | 18,2 → 17,2 | 26,3 → 27,7 | 22,2 / 22,4 / – → 21,3 / 16,5 / 7,2  |

- Úroda za 3 roky (žně 871–873 a zářijová jař) **42,5 → 43,4 t**; dny přídělu (energie pod 1)
  **263 → 262** – skoro všechny v letech 870/871 a 871/872 z úrody osevu ještě podle pevného
  sledu, 872–874 žádné.
- První osevy na dílech jen 0,5–3 roky ladem: 3,3 / 2,6 / 3,0 ha → 4,0 / 0,8 / 0,8 ha – zbytek
  jsou díly po luštěninách z doby před převodem (výše).
- Práce za 3 roky: orba a setí 3 762 → 3 462 čd (vrací se méně přílohu), nevyužito
  1 508 → 1 633 čd; len 0,1–0,2 ha ročně jako dosud.
- Ozim po ozimu: v roce 872 dostalo ozim 29 ha (dřív 25 ha) a jař jen 11 ha – díly v osevu po žni
  ozimu stihne ves na podzim osít znovu ozimem.

### Osevní postup po dílech a setí do konce okna (25. 10. 2026)

Stav: **Martin, 25. 10. 2026:** „Tím pádem by teď ves měla vyrobit maximum obilí a maximum sena,
kolik jí umožňuje rozloha polí a množství lidí.“ – „Ne, stavby mají pořád přednost, ale vesničané
neví dopředu že budou něco stavět, takže ve chvíli, kdy stavba přijde, prostě vesnice o část úrody
přijde.“ – „Proč se pořád vymýšlí nějaký plán osevu 1. září?“ – a „Ano“ k návrhu Clauda níže.
K otevřené otázce dílu, který nestihl ozim (Martin, 25. 10. 2026): „Jestli bude možné mu dát
ozim, ať dostane ozim.“
Pravidla jsou **návrh Clauda, schválený Martinem 25. 10. 2026**; podrobnosti, které v návrhu
nebyly, jsou označené jako návrh Clauda. **Od 10. 11. 2026 platí místo pevného sledu na dílu
(bod 1) [Přílohová soustava do roku 1100](#přílohová-soustava-do-roku-1100-martin-10-11-2026)**;
setí do konce okna, výběr dílů a ostatní body platí dál. Implementace podle plánu
[2026-10-25-sowing-rotation](../superpowers/plans/2026-10-25-sowing-rotation.md).

**Proč:** roční plán osevu k 1. 9. odhadoval dopředu, kolik ves oseje a co stihne (cíl podle
zásob, kapacita práce a spřežení ve špičkách), a během roku ho opravovalo pět dalších pravidel –
zkrácení rozjetého plánu, hotové díly do plánu, osev navíc, jarní přepočet pomoci rodiny
a nouzový výběr. Vesničané ale dopředu nevědí, co přijde (stavba, narození, díl zabraný stavbou);
dělají práci, která je na řadě. Místo plánu proto platí **pravidlo dílu**: každý díl ví, co na něm
poroste příště, a ves v okně obdělá všechno, co je na řadě, dokud jí stačí lidé a spřežení.

**Co nahrazuje** (staré texty zůstávají jako historie a platí do implementace, jejich nadpisy jsou
přeškrtnuté): Kolik ves oseje (plán k 1. 9. a kapacita plánu ve špičkách), Osev podle zásob –
Zkrácení rozjetého plánu, Osev navíc, Přílohová soustava – Osev (rok po roku do 70 %) a Pořadí
k 1. září, Ozim a jař – Ves rozhodne k 1. 9. a Díly hotové po 1. 9., Luštěniny – Kolik ves oseje
(k 1. 9.), Len – Kolik ves oseje (k 1. 9.) a Len napřed, Práce – body 3 a 6, [lord.md](lord.md) –
podíl rodiny z plánu (Kdy jde rodina na pole, bod 1) a [oxen.md](oxen.md) – páry k rádlům podle
plánu osevu (Kolik volů ves chce).

**Zůstává:** okna a sazby práce, osivo a úroda, úrodnost (osev obilí −12 %, luštěniny +3 %, len
−18 %, příloh +5 % ročně (od 26. 10. 2026, dřív 2,5 %), odpočatý 95 %, mez 70 %, nouzově 40 %), příloh, pastva a zarůstání,
hospodaření po úsecích od domu, orba po blocích a pásech, postup práce po čtvercích, žně všemi
rukama, pletí (od 25. 10. 2026 jednou v květnu – souběžná změna), cíl úrody podle stravy, zásob
a růstu vsi (Osev podle stravy, Osev podle zásob, Plynulejší osev, Osev podle růstu vsi) – už ale
není cílem plánu, ale **potřebou úrody** (bod 3) – a **seno beze změny** ([oxen.md](oxen.md) –
Seno, dvě seče).

**Pravidla:**

1. **Postup dílu – co na něm poroste příště** (stav dílu, žádný roční plán):
   - **První osev oběhu** (od 10. 11. 2026 platí pro každý díl na řadě i díl v osevu –
     Přílohová soustava do roku 1100, bod 2) – čerstvě založený díl a příloh odpočatý aspoň na
     95 % přirozené (`FERTILITY.fallowReady`, Martin 24. 10. 2026): **ozim**, když na něj práce dojde v okně
     ozimu (vrácení přílohu, kopání nebo orba a setí září–říjen). Díl, na kterém setí ozimu do
     konce okna nezačne, se oseje na jaře **jaří**.
   - ~~Po ozimu jař~~ – přesunuto do [historie](history/fields-history.md#po-ozimu-jař).
   - ~~Po jaři úhor~~ – přesunuto do [historie](history/fields-history.md#po-jaři-úhor).
   - ~~Jař jako první osev – pak ozim~~ – přesunuto do [historie](history/fields-history.md#jař-jako-první-osev--pak-ozim).
   - **Len je místo jaře** (do 9. 11. 2026 i ~~luštěniny od domu~~ – Luštěniny, zrušeno): bere
     díly na řadě s jaří od konce pořadí (nejdál od domu, jako dosud), dokud nepokryje svou
     potřebu (bod 3); zbytek je obilní jař. Když díly na řadě s jaří nestačí, vezmou i díly na řadě s prvním osevem (ty pak
     nejsou ozim – kopou se na podzim po ozimu a sejí na jaře). Plodinu určí ves, když díl
     přibude k letošní práci, a pak ji nemění – jen ozim, který do konce října nezasela, se oseje
     jaří (bod 2; návrh Clauda).
   - **Nouzový příloh** (40–70 %, Přílohová soustava – Nouzový osev) jen pro nutné díly (bod 3),
     jen obilí, jeden osev (ozim, nebo jař podle okna) a pak zase úhor.
   - ~~Kolik je čeho~~ – přesunuto do [historie](history/fields-history.md#kolik-je-čeho).

2. **Ves obdělá všechno, co je na řadě – do konce okna:**
   - Každý den v okně ves pracuje na dílech, které jsou na řadě: na podzim napřed ozim (vrácení
     přílohu, kopání nebo orba, setí – září–říjen), k tomu kopání nebo orba pod jař (září–listopad);
     na jaře zbytek přípravy a setí jaře, luštěnin a lnu (březen–duben); pak pletí, žně, odnos
     a výmlat na všem zasetém. Okna, sazby a pořadí úloh dne (Práce – orba první, pak nejbližší
     konec okna) se nemění.
   - **Bez odhadu dopředu:** ves nepočítá, co stihne – pracuje, dokud jí stačí lidé a spřežení.
     Seje se, co je zkopané nebo zorané do včerejška (beze změny).
   - **Co se do konce okna nestihne, zůstane na další sezónu:** díl na řadě s ozimem, na kterém do
     konce října nezačalo setí, se oseje na jaře jaří (zkopaná nebo zoraná část se počítá); díl,
     na kterém setí ozimu začalo (nejvýš díl nebo pás na čele práce), zůstane ozimem s úrodou
     podle zasetého podílu, jako dosud. Jař nezasetá do konce dubna čeká na další jaro – díl
     leží přes léto jako příloh a rozkopání propadne (návrh Clauda; jarní práce dosud stačila,
     stane se to málokdy).
   - **Postup práce po dílech od čela** (návrh Clauda v duchu Martina 25. 10. 2026 – „orají
     a sejí od začátku okna do konce okna všechno připravené, dokud stačí lidé a spřežení; co se
     do konce okna nestihne, zůstane na další sezónu“): ves nebere k práci všechny nutné díly
     najednou – úlohy dne jdou po úlohách přes celou plodinu (vrácení přílohu před kopáním), takže
     hladová ves by celý podzim jen vracela příloh na všech dílech a nezasela nic. Díly přibývají
     **po dávkách na čele práce**: rozdělaná příprava půdy a setí v oknech, která dnes běží, smí
     být nejvýš na `WORK_FRONT_DAYS` = 3 dny volné práce vsi po denním minimu i s podílem dne
     vojvodovy rodiny na přípravě půdy a setí ([lord.md](lord.md) – Kdy jde rodina na pole,
     Příprava půdy a setí; D102, návrh Clauda – jinak by rodině nezbyla rozdělaná práce; spřežení
     na 3 dny orby); další díl přibude, až čelo dávku dodělá – díl tak projde přípravou půdy až k setí,
     než ves vezme další. Na podzim brzdí ozim jen jeho vlastní čelo (len, luštěniny a jař
     s kopáním do listopadu ozim nepředběhnou). Žádný strop podle plánu: dokud je okno otevřené
     a potřeba trvá, ves bere další díly.
   - **Výběr jen s místem na čele** (úspora výkonu – Martin 31. 10. 2026: „úspory jsme se snad
     shodli, že uděláme“; návrh Clauda): ve dny, kdy na čele není místo pro žádnou plodinu, by
     stejně žádný díl nepřibyl – ves nový výběr nedělá a čekající díly (osivo pro ně, podíl
     rodiny) i roční potřebu z pole bere z posledního dne, kdy na čele místo bylo, v témže měsíci
     a se stejnými plodinami, které smí začít. Díl nad potřebu se tak stane nutným (nebo
     nepotřebný se uvolní) až první den s místem na čele. Díly přibývají ve stejné dny jako dřív;
     Vlkov: rok beze změny úrody, hladu, orby i zásob (čelo bez místa 82 ze 151 dní výběru).
   - **Pořadí dávek:** len (je ho málo, bez něj chybí oděv), **obilí do roční potřeby bez
     rezervy** (proti hladu – obilí má přednost), ~~luštěniny~~ (zrušeno 9. 11. 2026), pak obilí
     do celé potřeby úrody;
     obilí v pořadí přílohové soustavy (připravené díly a díly s nejmenší prací přípravy, blíž
     k domu, nouzové přílohy až po nich; **přílohy napřed stadium nejlevnější na tom, co vsi
     chybí** – Martin 22. 11. 2026: „Ok, udělej to tak. Obecně se drž pravidla vyprodukovat co
     nejvíce za co nejmenší množství práce.“, [dřívější znění](history/fields-history.md#přílohy-podle-odpočatosti-bez-stadia-zarůstání)),
     v dávce ozim před jaří (jeho okno končí dřív). Dávka dne jde po úsecích od domu ven (Postup
     práce po čtvercích). **Přílohy podle úzkého hrdla** (návrh Clauda 22. 11. 2026 podle
     Martinova pravidla výš, [dřívější znění](history/fields-history.md#přílohy-napřed-louky)):
     odpočaté přílohy (≥ 95 %, stejně tak 70–95 %) se berou po stadiích – mladý příloh, louka,
     křoví, mladý les. V den výběru ves u každého stadia spočítá, kolik hektarů ho čelo práce ještě
     vezme: volné místo na čele u lidí a u spřežení (co za dny čela udělají bez rozdělané práce
     plodiny) děleno cenou hektaru stadia u lidí a u spřežení – dojde dřív to místo, kterému stadium
     dá míň hektarů, a tolik hektarů stadium dá. Napřed stadium s nejvíc hektary. Ceny jsou ceny
     přípravy (Práce, Zarůstání; oxen.md – Jen rádlo): s rádlem louka jen orbu drnu křížem
     (2,5× orby) a rozsévače za ní, křoví a mladý les klučení rukama (60–100 a 150–250 čd/ha),
     orbu a setí, mladý příloh orbu a setí; motykou vše lidé (kopání, vrácení – u louky drn – a
     setí). **Když chybí spřežení** (orba na čele skoro naplno), vyjde napřed mladý příloh, křoví
     a mladý les, louky až potom; **když chybí lidé**, napřed mladý příloh a louky, pak křoví
     a mladý les; motykou mladý příloh, křoví, louka, mladý les (bez železa jsou křoví a louka
     stejně drahé). Shoda se láme cenou u lidí, pak u spřežení – stadia, která omezuje totéž místo,
     tak rozhodne druhý zdroj –, pak dřívějšími klíči (bez přílohu před sebou, rozběhnuté úseky,
     odpočinek, vzdálenost). **Čelo práce po zdrojích** (návrh Clauda, Martin 22. 11. 2026): díl
     s ručním klučením (křoví, mladý les) stačí na čele místo u lidí – čelo počítá jeho orbu
     u spřežení až po vyklučení – rádlo ho dřív nezačne (Postup práce po čtvercích – Orba a setí
     až po vyklučení), takže ruce nestojí, když spřežení orají naplno; díl bez klučení (louka – orba
     drnu, díl v osevu) potřebuje místo u lidí i u spřežení. **Místo u spřežení drží jen orba dílů
     připravených k orbě** (louka – drn, díl v osevu, vyklučený díl; návrh Clauda: zarostlé díly
     klučí lidé rukama, když voli orají naplno – Martin 22. 11. 2026: „Ok, udělej to tak.“): díl v klučení zabere místo
     u spřežení, až ho lidé vyklučí – do té doby se na čelo vejdou louky, které spřežení zorá hned.
     Dřív orba dílů v klučení zaplnila místo u spřežení hned při přibrání, louky čekaly a spřežení
     s nimi (oprava návrh Clauda 22. 11. 2026, D110 – Vlkov 10 let s opravou a se setím zoraného
     před klučením (Pořadí důležitosti polních prací) 120,2 t zrna proti 115,4 t). Pás orby se skládá jen z dílů téhož
     pořadí stadia. Výběr z paměti (Výběr bez stropu) platí, jen když na čele nemají místo lidé –
     díl s klučením se jinak vejde.
   - **Klády jen za skácené stromy** (Zarůstání): mladý les na přibraném dílu dá klády, až přes
     díl přejde čelo vracení přílohu – ne při přibrání. Vyklučený díl si to pamatuje: když ho ves
     uvolní (nezasetá jař 1. 5., velká zásoba), vrátí se jako příloh bez lesa a křovin a klády
     podruhé nedá.

3. **Díly jsou jedna fronta – všechna polní práce má přednost před stavbami (9. 11. 2026):**
   - ~~Nutné díly podle potřeby úrody a díly nad potřebu po stavbách~~ – přesunuto do [historie](history/fields-history.md#nutné-díly-podle-potřeby-úrody-a-díly-nad-potřebu-po-stavbách).
   - **Výběr bez stropu:** ves bere díly v pořadí osevního postupu (bod 2 – Pořadí dávek), dokud
     stačí lidé (čelo práce), spřežení a osivo (Osivo bez cíle osevu). Len dál jen podle své
     potřeby na oděv – je to rozdělení jarních dílů, ne strop. **Otevřené:** ves bez stropu oseje díly s prvním osevem často už na podzim ozimem a na jaře pak len nemá díl (malá ves ve zkoušce rok bez lnu) – možné řešení (návrh Clauda, neschválené): len nakonec i na díl po jaři místo ozimu.
   - **Na řadě** (návrh Clauda, 9. 11. 2026): odpočatý příloh (≥ 95 %) a díly v osevním postupu.
     Zotavený příloh 70–95 % až když jsou díly na řadě oseté (žádný díl na řadě nečeká a plodiny,
     jejichž okno setí běží, mají zaseto) a okno setí ještě běží – osivo z toho, co zbude nad
     přežívací zásobou. Nouzový příloh 40–70 % jen při **skutečném nedostatku**: zrno k sklizni
     (zásoby i s hromadou osiva okna a snopy, bez osiva jen na setí) je pod přežívací zásobou do
     žní – ne kvůli hromadě osiva. Při nedostatku přibudou přílohy 70–95 % i nouzové hned za díly
     na řadě.
   - **Přednost před stavbami** (Martin 9. 11. 2026: „Tak jediné kritické období jsou žně ne?“,
     „Setí – to přece obstará pár mužů s voly a ženy, pletí obstarají ženy a děti. Na sklizni se
     pak podílejí úplně všichni“ a „Ano, platí“ k návrhu): **všechna polní práce** – příprava půdy,
     orba, setí, žně, odnos a výmlat – jde před stavbami, stavby dostanou, co zbude. **Muži plejí
     jen to, co ženy a děti nestihnou, a až po stavbách** (Pletí jednou a rychle) – dřív plely před
     stavbami.
   - Starší vsi (převod jednou a idempotentně, návrh Clauda): ozim a jař nad potřebu se slijí
     s ozimem a jaří i s hotovou prací, osivem a úrodou ve snopech (letošní rok i rok u výmlatu);
     roční potřeba z pole ve výběru dílů zmizí.
   - **Vojvodova rodina** ([lord.md](lord.md) – Kdy jde rodina na pole) pomáhá s přípravou půdy
     a setím, které ves v okně sama nestihne na všechnu půdu, na kterou má osivo – i s díly na
     řadě, které na čelo ještě nepřišly (Martin 19. 11. 2026 – D102: „Ano. Na začátku vsi to jsou
     spíš zemědělci. Až postupně, když je ves veliká se z rodu knížete stává postupně šlechta“; 9. 11. – 19. 11. 2026 s osevem nepomáhala – Martin 9. 11. 2026: „setí by mělo být v pohodě
     ne? Problém je spíš se žněmi“), a se žněmi, které ves sama nestíhá. Jde až po práci vsi
     a jen s tím, co chybí – ves, která setí stihne sama, rodinu nezapojí.
   - **Páry k rádlům** ([oxen.md](oxen.md) – Kolik volů ves chce): od 22. 11. 2026 ves se správcem
     tolik párů, kolik obslouží lidmi (D114 – Martin 22. 11. 2026 „ano“), bez stropu; ves bez správce
     jen podle dílů na řadě, nejvýš podle lidí; dílová část ~~tolik párů, kolik v oknech orby zorá všechny díly na řadě v příštím hospodářském roce –
     nutné i nad potřebu, ves chce zorat všechno (návrh Clauda)~~ platí dál jen pro ves bez správce
     (nahoru hned, dolů po dvou plánech – oxen.md).

4. **Seno a volná práce beze změny:** nutná seč jde dál za polními úlohami a před stavbami, seč
   navíc po práci na dílech nad potřebu (jako dosud po osevu navíc). Volná práce v liště i zápis
   volné práce na seč (strop stád – [oxen.md](oxen.md), Stáda podle práce na seč) počítají práci,
   kterou dostanou stavby, před polem nad potřebu – pole nad potřebu strop stád nezmenší.

5. **Ves bez staveb tak obdělá všechno, co jí rozloha polí, lidé a spřežení dovolí** (Martin:
   „maximum obilí“); ves se stavbou napřed nutné díly, pak stavbu, pak zbytek. Zásoby nad potřebu
   rostou, příští rok podle nich potřeba úrody klesne (Osev podle zásob) a víc dílů je nad
   potřebu – stavbám zůstane víc práce.

6. **Co hráč vidí** (jako v 0 A.D. – ikony s čísly, slova jen v popiscích; návrh Clauda):
   - **Panel dílu:** nový údaj **Příště** – ikona toho, co na dílu poroste příště (ozim, jař,
     luštěniny nebo len, když už je určené; úhor ikonou přílohu); u úhoru procento odpočinku
     k 95 % a v popisku „Osev za ≈ N let“. Osetý díl ukazuje **kolikátý osev oběhu** (místo
     kolikátého roku v osevu; do 10. 11. 2026 1. nebo 2., v přílohové soustavě 1.–3.). ~~Díl nad potřebu má v popisku „Jen z volné práce – stavby mají
     přednost“~~ (zmizelo 9. 11. 2026 s díly nad potřebu – Díly jsou jedna fronta, bod 3).
   - **Panel pole:** vedle osetých dílů podle plodiny **na řadě** – počet dílů na řadě s ozimem,
     s jaří a odpočívajících; ~~v popisku, kolik z dílů na řadě je nad potřebu~~ (zmizelo 9. 11.
     2026). Upřesnění (návrh Clauda, 25. 10. 2026): na řadě jsou díly, které čekají mimo letošní
     práci (díly letošní práce ukazují plodiny). Vedle nich **hromada osiva** vsi (návrh Clauda, 9. 11. 2026 – Osivo bez cíle osevu, Zimní osivo): ikona obilí s kg, v popisku osivo na ozim
     či jař, které ves nejí (v zimě zimní osivo na jař).
   - Scéna beze změny – díl ukazuje svůj stav (strniště po ozimu do podzimní orby, zkopaná zem,
     příloh) a práce postupuje po čtvercích. Upozornění beze změny (hlad, chybí len na oděv).

7. **Starší vsi** (převod jednou a idempotentně, návrh Clauda): rozdělaný plán se stane letošní
   prací – všechny jeho díly (ozim, jař, luštěniny, len i začaté díly osevu navíc) zůstanou
   s hotovou prací a jsou nutné, nic zasetého ani rozkopaného nepropadne; podíl rodiny a potřeba
   lnu z plánu doběhnou do konce hospodářského roku. Nezačaté díly osevu navíc a ostatní díly
   dostanou místo v postupu podle svého stavu: hotový díl a odpočatý příloh první osev, díl po
   letošním ozimu, který byl prvním osevem, jař, díl po letošní jaři, která byla prvním osevem,
   ozim (Martin 25. 10. 2026), ostatní po sklizni úhor (i nad 70 %, když se
   osévaly víc let v řadě).

8. **Determinismus a výkon:** postup dílu, nutné díly i podíl rodiny jsou čisté funkce stavu
   a dne – výsledek nezávisí na kouscích dopočtu. Potřeba úrody se počítá jen ve dnech, kdy ves
   o dílech rozhoduje (1. 9. – 30. 4.), stejně jako dosavadní zkrácení plánu.

**Ověření:** Vlkov 8 let (kopie stavu, jen čtená) – osev po letech (ozim, jař, luštěniny, len,
nutné a nad potřebu), úroda, nasycení, volná práce a doba staveb proti dosavadnímu kódu;
kalibrace jen na Martinův pokyn.

**Naměřeno – Vlkov a čerstvé vsi** (25. 10. 2026, dopočet den po dni bez zásahu hráče, ne
kalibrace; dosavadní kód → osevní postup). Vlkov od 27. 8. 817 (40 lidí, 78,8 ha pole, 1 pár
k rádlu), hospodářské roky; zásoby = zásoby + snopy + luštěniny 1. 9. na konci roku v ročních
potřebách z pole:

| Rok     | Zaseto ha   | Úroda t     | Zásoby 1. 9. | Dny hladu (úmrtí) | Volná práce čd/člověk |
| ------- | ----------- | ----------- | ------------ | ----------------- | --------------------- |
| 817/818 | 23,1 → 28,5 | 5,48 → 6,83 | 1,05 → 1,33  | 0 → 3             | 71 → 66               |
| 818/819 | 19,7 → 26,6 | 4,73 → 6,32 | 0,78 → 1,29  | 0 → 0             | 50 → 38               |
| 819/820 | 19,1 → 22,9 | 4,66 → 6,17 | 0,77 → 1,35  | 335 (3) → 0       | 77 → 57               |
| 820/821 | 19,6 → 27,7 | 4,33 → 6,56 | 0,76 → 1,57  | 317 → 0           | 49 → 37               |
| 821/822 | 15,2 → 25,7 | 4,73 → 6,18 | 0,85 → 1,72  | 334 → 0           | 48 → 32               |
| 822/823 | 16,1 → 17,3 | 3,81 → 4,79 | 0,71 → 1,63  | 61 → 0            | 39 → 36               |
| 823/824 | 18,3 → 20,0 | 4,54 → 4,60 | 0,87 → 1,81  | 335 → 0           | 40 → 47               |
| 824/825 | 17,9 → 19,8 | 4,13 → 4,45 | 0,79 → 1,75  | 40 → 0            | 41 → 43               |

- Ves oseje každý rok víc než dosavadní kód a sklidí víc (8 let 36,4 → 45,9 t); dosavadní kód od
  třetího roku hladoví, osevní postup ne. Všechny díly zahájené ozimem jsou 1. 11. zasety, jař
  1. 5. celá. Díly nad potřebu Vlkov nemá – potřeba úrody pokryje všechny díly na řadě; osev
     omezuje rozloha polí (odpočaté přílohy), ne lidé: volno v květnu–září 15–46 %, osev klesá
     s vyčerpanými přílohy (28,5 → 19,8 ha).
- Rozdíl 2,8 proti 3,3 t k 27. 8. 818 (recenze převodu) je načasování: v roce převodu ozim
  9,8 ha a jař 18,2 ha (dosavadní kód 14,5 a 8,3 ha – převedená sezóna měla na podzim 200 dílů
  po ozimu, které se do potřeby počítaly, a jař přibyla na jaře, když zásoby klesaly). Jař se
  sklízí v srpnu a mlátí v září – 1. 9. je obilí 6,67 proti 5,29 t, 1. 11. 1,14 proti 0,88 roční
  potřeby. Cena: 3 dny hladu v roce převodu (nejnižší nasycení 0,75 proti 0,82).
- Orba: páry k rádlům 1 jako dosud, voli 8 → 6 stejně; pásy delší (průměr brázdy 120–219 m proti
  66–135 m). Seno a stáda: seno 14–26 t jako dosud, víc prasat a koz (krmení obilím).
- Dosažitelnost osetých dílů od domu (podíl bez přecházení přílohu) 30. 8.: 0,00–0,79, průměr
  0,48 (dosavadní kód 0,61). Po dvou osevech u domu odpočívá v každém úseku nejbližší díl a osévají
  se vzdálenější odpočaté díly (819/820: všech 11 úseků s osevem začíná přílohem – 0,00).
- Stavby skript nezadal: Vlkov 1. 4. 819 neměl suroviny na dílnu ani lidi na zemnici – doba
  staveb proti dosavadnímu kódu zůstává neověřená.
- Čerstvé vsi (4 skutečné krajiny × 14 hospodářských let, hráč staví zemnice a zakládá pole do
  1,8 ha na člověka – stejně pro oba kódy): zaseto 219 → 215 ha, úroda 87,7 → 92,1 t, zásoby
  1. 11. 4,1 → 4,4 roční potřeby, hlad 0 → 0, volná práce 50 → 55 čd na člověka a rok; díly nad
     potřebu 26–36 ha na ves (víc než polovina osevu).
- Dopočet je deterministický (po 1 dni, po 30 dnech i naráz stejný stav), ale pomalejší: 24
  měsíců Vlkova 104 → 163 s (+57 %, cíl +10 %). Čas berou trasy vozů a spřežení – díly přibývají
  den po dni, cíle tras se mění a trasy se hledají znovu (paměť 8 tras místo jedné nepomohla).

**Rozhodnuto (dříve otevřené):** díl, který nestihl ozim a dostal jař jako první osev, dostane
příště ozim, když to úrodnost dovolí (Martin 25. 10. 2026: „Jestli bude možné mu dát ozim, ať
dostane ozim.“ – bod 1, Jař jako první osev). Ověření na Vlkově ukáže, kolik dílů se to týká.

### Kolik ves oseje (rozhodují obyvatelé) – přesunuto do historie

Zrušeno 25. 10. 2026 (osevní postup po dílech) a 9. 11. 2026 (cíl osevu); celé včetně podsekcí Osev podle stravy, Osev podle zásob, Plynulejší osev, Osev podle růstu vsi a Osev navíc
je v [history/fields-history.md](history/fields-history.md) – Kolik ves oseje.

### Přílohová soustava – co se oseje a co leží ladem

Výchozí osevní systém je přílohová soustava raných Slovanů (Martin). Pravidla (návrh Clauda):

- **Osev** (platí znovu od 10. 11. 2026 – Přílohová soustava do roku 1100; 25. 10. – 10. 11. 2026
  místo něj pevný sled ozim, jař, úhor – Osevní postup po dílech, bod 1):
  díl se osévá rok po roku, dokud jeho aktuální úrodnost neklesne pod **70 %**
  přirozené. Osetý rok ji sníží o 12 % přirozené, takže čerstvý díl se oseje **3 roky** po sobě
  (100 → 88 → 76 → 64 %), odpočatý také (95 → 83 → 71 → 59 %). Pak jde do **přílohu**. Plodinu
  dostane podle prvního okna, ve kterém na něj ves práci dotáhne (ozim, jinak jař).
- **Příloh (od 26. 10. 2026 obnova 5 bodů ročně):** ustálená ves síje odpočatý díl 3 roky
  (úrodnost 95 → 83 → 71 → 59 %, průměr osevu ustálené dráhy 0,85) a pak leží **7–8 let** (z 59–63 %
  na 95–99 %, průměr 7,2): pole **≈ 3,4× osevu** (`ROTATION_FACTOR` z ustálené dráhy 51 let / 15
  osevů), oseto ≈ 29 % polí (od 10. 11. 2026 – Přílohová soustava do roku 1100, bod 3; 25. 10. – 10. 11. 2026 ozim a jař 95 → 83 → 71 % a 5 let ladem, pole 3,5× osevu; dřív 10 let ladem,
  5,0× a ≈ 1/6). Martin 26. 10. 2026: „Teď si musíme vystačit s dvojpolím a zkalibrovat to,
  aby vesnice za normálních okolností nehladověla, protože až přidáme přírodní katastrofy, bude
  to hukot.“ a „Trojpolí teď řešit nebudeme, mělo by se začít postupně objevovat na konci 12. století.“ Zvolil **variantu 1** („Ok, pojďme do varianty 1“): obnova 0,025 → 0,05 ročně
  (`FERTILITY.fallowRecovery`). Terminologie: české zdroje berou dvoupolní soustavu jako
  **přílohový systém** – 2–3 roky osev (ager), 3–10 let ladem (campus) podle půdy a podnebí
  (Wikipedie „Dvoupolní systém“ podle Vašků 1995 a Dvořák 2001; Fabšicová, Vymyslický: Úhory,
  staronový fenomén české krajiny, Vesmír 2015; za dobrý výnos ≈ 0,4 t/ha). Dnešních ≈ 10 let
  byla horní mez, 5 let leží uvnitř. Čísla v odstavci níže jsou dřívější stav (3 osevy, příloh
  13 let, obnova 2,5 %) – historie.
- ~~**Příloh (dřív):**~~ díl leží ladem a pase se na něm (viz Příloh a pastva). Úrodnost se mu vrací o
  **2,5 %** přirozené za rok (nejvýš na přirozenou) – z 64 % se na **95 %** dostane za **13 let**.
  Jeden oběh dílu tak trvá zhruba 16 let a oseto je
  v průměru asi 19 % půdy: ves potřebuje pole **≈ 5,3× větší než osev** (dvojpolní systém by
  potřeboval 2×). Oprava podle rešerše (dřív 5 % a 7 let): pole z drnu se užívala 2–3 roky
  a pak ležela ladem 20 i více let (Beranová 1980), trávopolní soustava 15–20 let, žďár ≈ 12 let
  (Rösch a kol. 2017). **K potvrzení:** rozhodnutí znělo +2 % za rok s cílem 12–13 let, jenže
  +2 % vede z 64 % na 95 % až za 16 let (12–13 let platí od 70 %) a každý příloh by tehdy
  zarostl v les – proto 2,5 % (rešerše uvádí 2–2,5 %). Od 18. 10. 2026 zarůstá jen příloh, který
  stáda nespásají a ves neposeče (viz Zarůstání) – délka přílohu sama les nehlídá.
- **Smí se osít** díl, jehož aktuální úrodnost je aspoň 70 % přirozené – v nouzi i příloh pod
  70 %, ale aspoň na 40 % (Pořadí, bod 5 – Nouzový osev níže).
- **Pořadí:** ~~k 1. září~~ (od 25. 10. 2026 každý den – nutné díly, Osevní postup po dílech, bod 3)
  ves vybírá díly na příští rok v tomto pořadí, dokud nepokryje potřebu
  (viz Kolik ves oseje):
  1. díly, které se už osévají a smějí dál,
  2. čerstvě založené díly (plná úrodnost, vymýcený les s bonusem – viz Úroda),
  3. přílohy zotavené aspoň na 95 % – nejmladší první (nejlevnější vrácení), při shodě
     nejbližší,
  4. když to nestačí, i přílohy zotavené na 70–95 % – nejvíc zotavené první,
  5. **nouzově i přílohy pod 70 %, ale aspoň na 40 %** – jen pro potřebný osev, když díly od
     70 % nedají energii, kterou ves potřebuje sklidit; nejvíc zotavené první, při shodě nejbližší
     (viz Nouzový osev). Příloh pod 40 % leží, dokud se nezotaví.

  Ves s hospodářstvími (díly na políčkách a aspoň jeden dům) bere skupiny ve stejném pořadí, ale
  po celých úsecích hospodářství od domu ven – viz Hospodaření podle polohy domů.

- **Vrácení přílohu do osevu** stojí po 1–2 letech drn pastviny (viz Práce a Příloh a pastva).
  V přílohové soustavě je to běžná součást oběhu, ne trest.
- **Příliš velké pole:** dřív díly, které ves pro svou potřebu nevybrala, ležely jako pastvina,
  i když ves měla volnou práci – ves část pole „neobdělala“ (Martin). **Od 19. 10. 2026 zrušeno**
  (Martin – Kolik ves oseje, Osev navíc): ves bez staveb je oseje prací, která zbude po stavbách;
  ladem leží jen díly, na které práce nezbude (ves staví, nebo je pole na její lidi velké).
- **Nouzový osev** (Martin, 19. 10. 2026: „Ano, pusť na to agenta“ k návrhu Clauda: „když potřebný
  osev nevychází, ves smí v nouzi osít i příloh pod 70 % (úroda podle jeho úrodnosti) – je
  absurdní hladovět s 35 ha ladem“; podrobnosti návrh Clauda). **Proč:** Vlkov měl 40 ha polí,
  z toho 35 ha přílohu s úrodností 50–70 % přirozené; smí osít jen 4,8 ha, úroda obilí byla
  0,3–3 t ročně a za 11 let tam zemřelo hlady 28 lidí.
  - Platí jen pro **potřebný osev**, ne pro osev navíc, a jen pro obilí – luštěniny a len na
    nouzový příloh nejdou. Ves k 1. 9. vybere díly jako dřív (body 1–4); když jejich úroda nedá
    energii, kterou ves potřebuje sklidit kvůli jídlu (cíl osevu bez luštěnin navíc na bílkoviny),
    vybere znovu i s přílohy pod 70 % za nimi (bod 5, po úsecích hospodářství jako ostatní). Ves,
    které díly od 70 % stačí, seje beze změny.
  - **Spodní mez 40 %** (Martin, 19. 10. 2026: „ves neoseje díly pod 40 % úrodnosti“): nouzově
    smí ves osít jen příloh s aktuální úrodností aspoň 40 % přirozené (`FERTILITY.emergencyMin`).
    **Proč:** úroda má základ 40 % i při nulové úrodnosti (304 kg/ha proti 175 kg osiva), takže
    se osev podle čisté úrody vyplatí vždy a díl by šel opakovaným nouzovým osevem až na nulu –
    odtud se na 70 % vrací 28 let. Od 40 % klesne díl osevem nejvýš na 28 % a na 70 % se vrátí
    za 17 let.
  - Ves díl vezme, jen když je jeho očekávaná čistá úroda (hrubá podle úrodnosti − osivo) kladná.
    S dnešní úrodou je vždy kladná – mez se zatím neuplatní. Při úrodnosti 35 (přirozená 70,
    podíl 0,5) dá louka ≈ 290 kg/ha čistého obilí za ≈ 305 člověkodní ručně (≈ 0,95 kg na
    člověkoden; běžný příloh ≈ 1,45, osévaný díl ≈ 2,2) – v nouzi to pořád stojí za to.
  - Kapacita plánu (práce ve špičkách, orba spřežením) platí jako u ostatních dílů potřebného
    osevu. Úroda a pokles úrodnosti zůstávají: osetý rok ubere 12 % přirozené (nejvýš na nulu –
    pojistka, se spodní mezí 40 % díl klesne nejvýš na 28 %) a díl jde 1. 9. zase do přílohu.
  - Zkrácení rozjetého plánu (Osev podle zásob) ubírá napřed nezačaté nouzové díly; do osevu navíc
    nejdou.

- Když ves nemá práci ani na potřebný osev (málo lidí na potřebu), oseje méně, než by
  potřebovala – ves pak hladoví (Zásoby a nasycení).

### Práce

**Setí týž den hned za orbou a motykou** (Martin 9. 11. 2026: „Setí by mělo probíhat ihned po
orbě. Za oráčem by měl jít někdo z rodiny a rovnou zasívat“): za každým spřežením i za motykou
jde setí stejným tempem týž den – práce orby a kopání nese i práci setí za sebou (kolik dovolí
osivo); když práce nestačí, ubude obojího stejně. Zpracovaná půda, kterou ves nestihla zasít,
se zaseje příští den napřed. Díl proto smí začít i v poslední den okna (dřív se selo zkopané do
včerejška a ozim musel začít den před koncem okna). Výmlat na dnešní jídlo jde i před orbou
a počítá jen zrno, které ves jí – hromada osiva okna smí držet všechno vymlácené zrno, ale ves
kvůli osivu nikdy nejí pod přežívací zásobu (návrh Clauda).

**Jeden rozsévač za spřežením** (9. 11. 2026 – Martin: „Setí – to přece obstará pár mužů s voly
a ženy“, „Za oráčem by měl jít někdo z rodiny a rovnou zasívat“ a „Ano, jeden rozsévač za
spřežením“): za každým orajícím spřežením jde **1 rozsévač** – setí stojí 1 člověkoden na den
spřežení. Pár zorá ≈ 0,3 ha za den ([oxen.md](oxen.md) – Účinek na práci), setí za rádlem tedy
≈ 3,3 čd/ha bez ohledu na nástroje (ty zlevní orbu, ne tempo volů); na drnu, kde spřežení orá
křížem 2,5× pomaleji, 8,3 čd/ha. Dřív setí stálo 10 čd/ha – tempem spřežení ≈ 3 lidé za
spřežením. Ves bez spřežení (motyka): rozsévač zaseje za den, co by spřežení zoralo – 0,3 ha,
tedy 1 / 0,3 ≈ **3,3 čd/ha** (návrh Clauda). Přijde-li ves během roku o poslední spřežení,
setí zbytku plodiny se přepočte na sazbu motyky s hotovým podílem (návrh Clauda). Nošení osiva
vozem (crafts.md) bere dál desetinu práce setí.

**Délka dne** (population.md – Skladba dne podle ročního období; Martin 9. 11. 2026, čísla
návrh Clauda): den venkovní práce dá (hodiny světla bez jídla a přestávek ÷ 10) člověkodne –
v polovině ledna a prosince 0,7, února 0,85, března 1,0, dubna 1,15, května 1,3, června
a července 1,4, srpna 1,3, září 1,1, října 0,95, listopadu 0,8, mezi polovinami měsíců lineárně
(`DAYLIGHT_WORK`, `daylightFactor`). Násobí se, co zbude po pracích „za den“ (denní minimum,
péče o koně, kování, lidé na výpravách, sedláci s vozy pro kováře), zásobníky polní práce (ženy
řemeslníků, žňové ruce, děti při pletí, pomoc vojvodovy rodiny), robota hostů a kapacita
spřežení (voli orají za světla). Sazby prací na hektar zůstávají – vznikly z hodin přepočtených
na 10 h. Plán (kapacita setí `sowingCapacity`, páry k rádlům, čelo práce, výhled zásob a výmlatu)
počítá se stejnou délkou dne: v oknech „světlé dny“ (`windowDaylightLeft`) místo dnů, v čele
práce a tempu setí dnešní délku dne. Žně v červenci a srpnu tak mají ≈ 1,35× víc práce než
dřív, zimní stavby ≈ 0,7×; za rok ≈ 1,05×.

Navazuje na pracovní sílu z [populace](population.md) – Práce (na polích a stavbách jen dospělý
1 člověkoden za den podle délky dne; starší 0,5 jen na denní minimum své domácnosti, výrostci
7–13 let jen pasou).
Pole jsou společná, a proto se práce počítá **za celou ves**: dospělí všech domácností pracují na
společných polích (Martin). Martin (19. 10. 2026): „Vesničané se snaží vyrobit co nejvíce jídla
(později přibudou nejspíš i jiné suroviny), ale pokud se něco staví, tak čas věnují primárně té
stavbě – zemědělství jenom natolik, aby vesnice neměla hlad.“ Ves práci rozděluje v tomto pořadí
(Martin 19. 10. 2026, podrobnosti návrh Clauda; nahrazuje pevných 85 % a dělení práce po
domácnostech v populaci):

**Pod pojistkou mají v oknech setí přednost pole** (návrh Clauda po recenzi pohrom P3, **Martin 27. 10. 2026: „Ano“**): nutná práce na polích (příprava půdy, orba a setí nutných dílů) jde
v pořadí práce dne už před stavbami (bod 4 a 5 níž, Martin 25. 10. 2026), stavby hráče se tak
zdrží samy. Měření Vlkova ukázalo, že v oknech setí lidé nechybí (3–5 člověkodnů denně volných),
chybělo **rádlo** – pod pojistkou proto ves chce páry k rádlům i na nouzový osev a hned
([voli](oxen.md) – Kolik volů ves chce, Pod pojistkou); motyka dál nekope (Jen rádlo). Dílny
zůstávají v dílnách – jejich lidé by úzké hrdlo (orbu) nerozšířili.

1. **Denní minimum domácností** – vaření, voda, oheň, péče o malé děti: 0,5 člověkodne denně
   na každou domácnost (s hrnčířem 0,45; FAO: venkovské ženy 0,5–0,6 dne). Napřed ho kryjí
   **starší** domácnosti (Martin: „Starší lidé se zase starají o malé děti, a uvolňují práci
   zbytku rodiny.“) – každý 0,5 člověkodne; dospělí dají jen zbytek, max(0, minimum − 0,5 ×
   starší). Co starším nad minimum zbude, propadne (návrh Clauda). **Přirážka za vodu**
   (Martin 19. 10. 2026: „Ale vesničané tam přece musí chodit nějak pro vodu a musí jim to
   zabírat čas.“): k minimu domácnosti se přičte chůze pro vodu nad 100 m – cesty (0,4 na člověka)
   × 2 × (chůze k vodě − 100 m) ÷ 1 m/s ÷ 10 h; kryjí ji napřed starší jako zbytek minima
   ([paths.md](paths.md) – Pochůzky pro vodu, čísla návrh Clauda).
2. **Lidé na výpravách k sousedům** – každá výprava na cestě tolik člověkodní, kolik s ní jde
   lidí, nejvýš kolik má ves dospělých ([obchod](trade.md) – Doprava; Martin 19. 10. 2026).
3. **Potřebné sezónní úlohy** (od 25. 10. 2026 všechna práce nutných dílů – Osevní postup po dílech,
   bod 3)
   podle konce svého okna – polní práce v jejich období (tabulka
   níže), sezónní práce v sadech (sklizeň jablek, péče – [sad](orchard.md)), seč sena
   ([oxen.md](oxen.md) – Seno) a porážka s uzením ([diet.md](diet.md)). Orba rádlem jde napřed
   ([oxen.md](oxen.md) – Orba má přednost), **ne ve dni, kdy ves žne** – žeň má přednost před
   orbou a setím (Pořadí práce dne ve žních, níže).
4. **Společná práce vsi do staveb** – stavby hráče i přestavby obyvatel, zakládání polí, rovným
   dílem (populace). To je i **volná práce** v liště – práce, kterou dnes dostanou nebo by
   dostaly stavby.
5. **Opravy obydlí** – jen z práce, kterou stavby nespotřebovaly (Martin: „Opravy obydlí zařaď
   až za stavbu.“).
6. **Polní práce navíc** – ~~viz Kolik ves oseje, Osev navíc~~ od 25. 10. 2026 všechna práce dílů
   nad potřebu (Osevní postup po dílech, bod 3).
7. Co zbude, propadne.

**Bokem – mimo práci vsi** (Martin 19. 10. 2026: „Zvířata a pasáci – to obstarají výrostci, takže
do práce je nemusíme počítat, jsou úplně bokem. Domácí výrobu z většiny obstarají ženy, takže to
do práce stavby taky nemusíme počítat.“ a „Dojení a péče o zvířata – to obvykle dělají ženy.“):
dojení a péče o zvířata (ženy), pasení (výrostci – [diet.md](diet.md), Pasáci) a **domácí výroba**
(oděv i zpracování vlny a lnu, nádobí, jednoduché železné předměty, palivo – ≈ 0,3 člověkodne
denně na domácnost + 0,15 na člověka, jen pro postavy žen u domů ve scéně). Dřív šly dojení,
péče a dospělí pasáci hned po denním minimu, domácí výroba s odkládáním až 60 dní po opravách.

**Polní práce při ruční práci** (člověkodny na osetý hektar za rok, v závorce s řemesly – oprava
podle rešerše, dřív 200 – kopání 80, výmlat 30). Ves bez spřežení kope motykou; **ves se
spřežením orá rádlem všechno a motykou nekope** (Martin, 19. 10. 2026: „Pokud je k dispozici
rádlo, kopání motykou úplně vynech. Je to neefektivní a aspoň si nebudeme muset pamatovat, co
čím bylo kopáno.“) – orba 10 → 6 člověkodní na hektar, drn 2,5× víc (orba křížem), a zaseje se
jen, co spřežení v oknech orby stihnou zorat ([oxen.md](oxen.md) – Jen rádlo). Spřežení orá po
souvislých blocích a pásech v ose s delší brázdou (po blocích, i sever – jih) – dlouhá brázda
(méně obratů) zorá za den víc
(Martin: „Volské spřežení chce rýt co nejdelší brázdu“ – oxen.md, Co nejdelší brázda).

| Práce                      | Kdy – ozim     | Kdy – jař                                   | Člověkodny / ha | Zdroj                |
| -------------------------- | -------------- | ------------------------------------------- | --------------- | -------------------- |
| kopání motykou             | září–říjen     | podzim (září–listopad), zbytek březen–duben | 100 (50)        | Semjonov 1974        |
| setí a zahrabání           | září–říjen     | březen–duben                                | 3,3 \*          | Martin 9. 11. 2026   |
| pletí (jen jař – jednou)   | neplete se     | květen                                      | 8 (5)           | Martin 25. 10. 2026  |
| sklizeň srpem a vázání     | červenec–srpen | srpen–září                                  | 15 (12)         | průměr, níž          |
| odnos úrody v nůších       | červenec–srpen | srpen–září                                  | 8               | průměr, níž          |
| výmlat cepem a převívání   | srpen–září     | září–říjen                                  | 15 (10)         | Clark 2007 (EB 1911) |
| **celkem na osetý hektar** |                |                                             | **149 (88)**    |                      |

\* Motykou i za rádlem (jeden rozsévač za spřežením – 1 člověkoden na den spřežení), na drnu za
rádlem 8,3 (Jeden rozsévač za spřežením výš). Dřív 10 čd/ha (celkem 163 (100)); do 10. 11. 2026
sklizeň 20 (15) a odnos 10 – celkem 156 (93).

Výmlat 15 (10) čd/ha platí pro běžnou úrodu ≈ 585 kg/ha; od 18. 11. 2026 stojí výmlat podle kg
snopů – slabší úroda se vymlátí rychleji ([production-chains.md](production-chains.md) – Humno,
Práce výmlatu podle snopů; Martin 18. 11. 2026 – volba C).

Ozim a jař se liší kalendářem (viz Ozim a jař) a pletím – ozim se neplete (Pletí jednou a rychle);
ostatní sazby práce, osivo a úroda jsou stejné. Žeň ozimu (i luštěnin a lnu) jde v červenci, co
červenec nestihne, v srpnu, a mlátí se hned po žni – červencová v srpnu, srpnová v září (Žně
i v srpnu); žeň jaře v srpnu, co srpen nestihne, v září, výmlat září–říjen (Žeň jaře i v září).
Pletí dřív 30 (15) čd/ha v květnu–červnu (FAO).

Žeň 24. 10. 2026 zlevnila (Martin schválil, Žně všemi rukama): sklizeň srpem a vázání 30 → 20
podle [rešerše](research/2026-10-17-zemedelstvi-populace.md) (doporučení 3: ≈ 20), odnos v nůších
20 → 10 – návrh Clauda bez opory v rešerši (údaj se nepodařilo dohledat).

**Zprůměrovaná žeň (10. 11. 2026, implementováno):** raní Slované žali dvojím způsobem – těsně
pod klasem do nůší (rychle, bez vázání, sláma zůstala na poli – hlavně proso), nebo níž a vázali
snopy. Martin 10. 11. 2026: „Ohledně toho obilí, snopy necháme, ale tu práci bych chtěl
zprůměrovat. Zatím moc nechci rozlišovat druhy obilí, aby hráč nebyl zahlcen.“ Snopy ve hře
zůstávají (výmlat, humno, snopy na poli), sazba je průměr obou způsobů (návrh Clauda podle
Martina): **sklizeň srpem a vázání 20 / 15 → 15 / 12 čd/ha, odnos 10 → 8 čd/ha** (žeň 30 / 25 →
23 / 20). Žetí pod klasem ≈ 10 / 8 a odnos klasů ≈ 6 čd/ha je vlastní odhad podle Steensberga
([rešerše](research/2026-10-17-zemedelstvi-populace.md) – železný srp ≈ 60–80 m²/h při nízkém
řezu; pod klasem se neváže a nese se jen klas). Plán hospodářského roku zapsaný před změnou
dožne svou úrodu staršími sazbami, další plány nesou nové. Měření – Pořadí důležitosti polních
prací, Pozdní léto.

#### Žně i v srpnu (9. 11. 2026)

**Martin (9. 11. 2026): „Ať sklízí i v srpnu“** – na otázku, co má ves dělat, když v červenci
nestihne sklidit všechno, co zasela. Dřív okno žně ozimu, luštěnin a lnu končilo 31. 7. a co se
nesklidilo, propadlo. Vlkov (simulace 871–873 ze stavu DB) měl v červenci na žně ≈ 400 čd, žně
ozimu, luštěnin a lnu chtěly 820–1 030 čd: ozim (má přednost) stihl 75–82 %, luštěniny (trhání
68 čd/ha proti 38 u obilí) 0–7 %.

| Kdy                  | Ozim a jař                                | Luštěniny      | Len                       |
| -------------------- | ----------------------------------------- | -------------- | ------------------------- |
| žeň                  | ozim červenec–srpen, jař srpen            | červenec–srpen | červenec–srpen            |
| do snopů / zapíše se | 31. 7. sklizené v červenci, 31. 8. zbytek | jako ozim      | 31. 7., nedotržený 31. 8. |
| výmlat hned po žni   | ozim srpen–září, jař září                 | srpen–září     | nemlátí se                |

- **Okno žně** ozimu, luštěnin a lnu je **červenec–srpen** (dřív jen červenec); jař dál srpen.
- **Do snopů** jde 31. 7. (po jídle dne) úroda části sklizené v červenci – vymlátí se v srpnu
  jako dřív. Plodina, kterou červenec nedosklidil, zůstává na poli (dál ji můžou poškodit zvěř
  a pohromy jako jař) a žne se v srpnu; **31. 8.** (s jaří) jde do snopů úroda srpnové žně a co
  nesklidí ani srpen, propadne. Plodina sklizená celá do 31. 7. jde do snopů celá jako dřív.
- **Len** nedotržený 31. 7. se trhá v srpnu a podíl oděvu se zapíše až 31. 8. (do té doby platí
  loňský) – len není zásoba, nedělí se.
- **Výmlat ozimu a luštěnin** má okno **srpen–září** (výmlat hned po žni – srpnová žeň se mlátí
  v září s jaří; v září ozim, luštěniny, jař). Snopy v okně čekají bez ztráty.
- **Pořadí v srpnu** (návrh Clauda): napřed se dožne, co červenec nestihl – len a ozim (pořadí
  plodin `CROP_ORDER`; dorůstající luštěniny starších vsí za ozimem) –, pak jař; výmlat až po žni.
  Otázka, jestli v srpnu pustit jař před luštěniny, padla – luštěniny ves na poli nepěstuje
  (Luštěniny, zrušeno; Martin 9. 11. 2026).
- **Příděl** dál počítá se sklizní ozimu 31. 7. (odhad plné žně ozimu – zbytek přijde v září
  z výmlatu srpnové žně). Plán osevu a pomoc rodiny počítají červencovou žeň do volné práce
  července, co přeteče, do srpna před žní jaře; výhled dílu hlásí nedostatek práce na žeň do konce
  srpna u všech plodin.
- Ztráty přezráním (vypadávání zrna, praskání lusků) model nemá – Martin je nechtěl.

**Naměřeno** (Vlkov, ze stavu DB, 3 roky po dnech; podíl hotové žně 31. 7. → 31. 8.; t úrody do
snopů; luštěniny v zásobách 30. 9.; dny přídělu pod plný v roce do 31. 10.):

| Rok | Verze | Ozim        | Luštěniny   | Jař  | Úroda ozim / luštěniny / jař (t) | Luštěniny 30. 9. | Příděl (dní) |
| --- | ----- | ----------- | ----------- | ---- | -------------------------------- | ---------------- | ------------ |
| 871 | dřív  | 1,00        | 0,07        | 1,00 | 3,7 / 0,1 / 2,2 = 6,0            | 0,1 t            | 43           |
| 871 | nyní  | 1,00        | 0,07 → 1,00 | 0,09 | 3,7 / 1,3 / 0,2 = 5,2            | 1,2 t            | 45           |
| 872 | dřív  | 0,82        | 0,00        | 1,00 | 5,9 / 0,0 / 4,7 = 10,6           | 0,0 t            | 214          |
| 872 | nyní  | 0,90 → 1,00 | 0,00 → 1,00 | 0,26 | 6,6 / 2,1 / 0,8 = 9,5            | 2,1 t            | 217          |
| 873 | dřív  | 0,75        | 0,00        | 0,52 | 4,5 / 0,0 / 3,5 = 8,0            | 0,0 t            | 149          |
| 873 | nyní  | 0,84 → 1,00 | 0,00 → 0,63 | 0,00 | 5,6 / 1,3 / 0,0 = 6,9            | 0,9 t            | 276          |

Srpen žně nestihne – **nedostatek se jen posunul na jař**: ozim i luštěniny se dožnou, ale jař
zůstane nesklizená (9 %, 26 %, 0 %) a úroda vsi klesne o 0,8–1,1 t za rok, protože luštěniny dají
na člověkoden žně ≈ 2,2× méně jídla než jař (0,8 úrody obilí za 68 místo 38 čd/ha). Pro srovnání
(jen měření, nezavedeno): kdyby v srpnu šla jař před luštěninami, dalo by to 6,3 / 11,1 / 9,2 t
(ozim celý, luštěniny 33 %, 60 %, 0 %, jař 100 %, 100 %, 51 %). ~~Rozhodnutí o pořadí čeká na
Martina.~~ Martin místo toho luštěniny z polí vyřadil (9. 11. 2026 – Luštěniny, zrušeno).

**Naměřeno bez luštěnin na poli** (týž Vlkov a týž postup; jeho uložený plán měl 195 dílů
luštěnin, ≈ 6 ha, ještě nezasetých – převod je dal jaři i s rozkopáním; ha = oseto k 31. 7. včetně
obilí nad potřebu; feat/landscape = před žněmi v srpnu i s luštěninami):

| Rok | Verze          | Ozim 31. 7. → 31. 8. | Jař 31. 8. | Úroda ozim / luštěniny / jař (t) | Oseto ozim / luštěniny / jař (ha) | Příděl (dní) |
| --- | -------------- | -------------------- | ---------- | -------------------------------- | --------------------------------- | ------------ |
| 871 | feat/landscape | 1,00                 | 1,00       | 3,7 / 0,1 / 2,2 = 6,0            | 10,2 / 6,0 / 7,6                  | 43           |
| 871 | bez luštěnin   | 1,00                 | 0,75       | 3,7 / – / 2,8 = 6,5              | 10,2 / – / 14,1                   | 0            |
| 872 | feat/landscape | 0,82                 | 1,00       | 5,9 / 0,0 / 4,7 = 10,6           | 16,3 / 5,6 / 10,7                 | 214          |
| 872 | bez luštěnin   | 1,00                 | 0,96       | 5,7 / – / 6,2 = 11,9             | 12,3 / – / 14,4                   | 228          |
| 873 | feat/landscape | 0,75                 | 0,52       | 4,5 / 0,0 / 3,5 = 8,0            | 15,1 / 7,4 / 18,3                 | 149          |
| 873 | bez luštěnin   | 0,78 → 1,00          | 0,30       | 5,0 / – / 2,8 = 7,8              | 13,8 / – / 24,1                   | 32           |

Len (0,2 ha) se trhá celý vždy. Bez luštěnin ves sklidí za tři roky 26,2 t proti 24,6 t
(feat/landscape) a 21,6 t (žně v srpnu s luštěninami) a přídělem šetří 260 dní proti 406 a 538.
Ozim se dožne celý; jař 873 (24 ha, z toho velká část nad potřebu) zůstane z velké části
nesklizená – srpen dál nestačí na všechno, co ves v hladovém roce oseje.

#### Pořadí důležitosti polních prací a výmlat do zimy (9. 11. 2026, implementováno)

Martin 9. 11. 2026: „Je lepší za každou cenu sklidit to, co už vyrostlo, než začínat pěstování
úplně od začátku“, „Výmlat prý počká i docela hluboko do zimy“ a „Pořadí důležitosti: 1. sklizeň
obilí 2. sklizeň lnu 3. sklizeň sena 4. orba a setí 5. výmlat. Zapomněl jsem na něco?“ – doplněno
návrhem Clauda, Martin „Ano, jak navrhuješ“. Pořadí práce dne (kdo dostane práci napřed, když jí
nestačí na všechno):

0. **výmlat na dnešní jídlo** (jen kolik se dnes sní – jinak lidé nemají co jíst),
1. **sklizeň obilí** (žeň a odnos – ozim, jař, i dosklizeň v srpnu a září),
2. **sklizeň lnu** (trhání) – **ženy a děti trhají souběžně s koncem žní** (Martin 10. 11. 2026,
   Pozdní léto níž),
3. **sklizeň sena** (seč) – první seč i **otava (druhá seč v srpnu a září) před orbou a setím
   ozimu** (Martin 10. 11. 2026, Pozdní léto níž); ~~otava až po orbě a setí ozimu~~
   (Martin 9. 11. 2026: „Otava až po orbě a setí ozimu“ – platilo 9.–10. 11. 2026, nahrazeno),
4. **sklizeň jablek**,
5. **pletí** (ženy a děti – muži jen zbytek a až po stavbách),
6. **orba, příprava půdy a setí** (vrácení přílohu, klučení, kopání, orba, setí) – uvnitř orba
   rádlem první (oxen.md – Orba má přednost), **setí zorané a zkopané půdy před vracením přílohu
   téže plodiny** (návrh Clauda 22. 11. 2026, D110 – Martin: „vyprodukovat co nejvíce za co
   nejmenší množství práce“): klučení dílů na později nevytlačí setí toho, co je zorané
   (zorané je jen vyklučené – Postup práce po čtvercích, Orba a setí až po vyklučení). Dřív šlo
   vracení přílohu první a Vlkov 905–914 nechal na konci dubna 3–20 čd setí zorané jaře nezaseté
   (v březnu a dubnu 30–60 dní, kdy klučení vzalo práci setí zoraného);
   **výsadba jabloní u cest a sadu v oknech výsadby po orbě, kopání a setí, ale před vracením
   přílohu** (Martin 22. 11. 2026: „ano“ na otázku „Má výsadba jabloní a sadu dostat v jarních
   a podzimních oknech přednost před klučením zarostlých přílohů?“; vysvětlení Clauda k otázce: orba
   a setí na daný rok dál mají přednost před výsadbou; jabloň u cesty stojí pár dní práce a jablka
   dává desítky let). Návrh Clauda – kdo výsadbu nese: práci výsadby (`take(planting.manDays)` v
   `allocateDay`) ubere ves z dílu, který zbyl po úlohách dne, napřed ženám a mužům společně, ne
   jen z dílu mužů jako ostatní stavby (population.md – Stavby staví muži); rozdělení práce pro
   postavy ji ukazuje mezi stavbami.
   Návrh Clauda: výsadba dostane práci vsi hned před vracením přílohu – i před vším, co jde v pořadí
   za ním (péče o sad, hlídka, výmlat, obilné jámy, pasák); co nespotřebuje, jde do společné práce.
   Dřív (do 22. 11. 2026) brala výsadba jen společnou práci po polních pracích a Vlkov v oknech
   výsadby nevysadil nic (volná práce 0 čd za den),
7. **noční hlídka polí** proti zvěři,
8. **výmlat**.

Stavby a opravy až po všech polních pracích (Osevní postup po dílech, bod 3). **Výmlat do zimy:**
okno výmlatu ozimu i jaře až do **konce února**; snopy se v okně nekazí (kazí se až po něm –
`THRESHING.spoilPerMonth`); mlátí se hlavně v zimě, kdy jiná práce venku není. Nahrazuje Martinovo
„Staří slované se snažili dělat výmlat hned“ (20. 10. 2026) a „orba má přednost“ (24. 10. 2026)
pro střet s žněmi.

**Pozdní léto – len a otava (Martin 10. 11. 2026, implementováno):** po Martinově konzultaci
o pořadí letních a podzimních prací raných Slovanů – „Sklizeň na etapy … Mezi jednotlivými
sklizněmi tak vznikaly přirozené mezery právě na vytrhání lnu.“ – Martin schválil („Ano“) návrh
Clauda: **žeň (ozim, jař) → len → otava → orba, příprava půdy a setí → …** Otava přichází (konec
srpna – září) po žních a lnu, ale před orbou a setím ozimu; orba a setí ozimu jdou až po otavě
a žni jaře (v praxi říjen). Okno ozimu (září–říjen) se nemění, jen pořadí důležitosti.

- **Len – ženy a děti napřed** (`womenFirst` v `allocateDay`; návrh Clauda): ve dni, kdy je len
  zralý (srpen), jdou na trhání **před všemi úlohami dne** výrostci a starší ze žňových rukou
  (Žně všemi rukama), ženy řemeslníků a ženy vsi prací nad svůj díl denního minima (jako při
  pletí). Muži a řemeslníci se syny dál žnou a svážejí. Co ženy a děti nestihnou, dostane len
  z obecné práce dál za žněmi obilí. Len je malý (Vlkov 0,1–0,2 ha ≈ 6–11 čd za rok) – ženy
  a děti ho vytrhají v prvních srpnových dnech.
- **Otava** hned za 1. sečí – před jablky, pletím, výmlatem na osivo i přípravou půdy a setím
  (`DAY_WORK_ORDER`: … `flax-harvest`, `hay`, `aftermath`, `apples` …).
- **Naměřeno** (Vlkov, kopie stavu DB, 3 roky po dnech od 3. 3. 871; před = feat/landscape
  f6408cfc, po = pořadí 10. 11. a zprůměrovaná žeň – Práce; „jen žeň a len“ = sazby žně a len
  napřed, otava dál až po orbě; ozim = oseto k 1. 7. dalšího roku, u 873 k 31. 10.; příděl = dny
  pod plným přídělem):

  | Ukazatel                       | před               | jen žeň a len         | po                    |
  | ------------------------------ | ------------------ | --------------------- | --------------------- |
  | ozim 871 / 872 / 873 (ha)      | 22,6 / 22,4 / 13   | 22,7 / 22,9 / 14      | 16,3 / 25,0 / 18      |
  | září 871: otava / orba a setí  | 12 / 310 čd        | 11 / 311 čd           | 289 / 73 čd           |
  | otava 871 (t sena)             | 0,4                | 0,9                   | 9,9                   |
  | seno 1. 4. 872 / 1. 4. 873 (t) | 0,6 / 8,3          | 1,2 / 8,3             | 9,8 / 8,5             |
  | len vytrhaný 871 / 872 / 873   | 89 % / 100 % / 0 % | 100 % / 100 % / 100 % | 100 % / 100 % / 100 % |
  | úroda 871 / 872 / 873 (t)      | 8,1 / 15,2 / 19,5  | 8,1 / 15,2 / 20,4     | 8,1 / 14,9 / 19,5     |
  | úroda za 3 roky (t)            | 42,7               | 43,7                  | 42,5                  |
  | příděl 871 / 872 (dní)         | 58 / 213           | 58 / 213              | 50 / 213              |
  | z toho kvůli osivu 871 / 872   | 58 / 91            | 58 / 91               | 50 / 104              |

  Otava v září 871 (hubený rok) vezme orbě a setí ozimu ≈ 240 čd – ozimu 871 je **o 6,3 ha méně**
  (víc jde pod jař 872: 11,3 → 16,8 ha), úroda 872 o 0,3 t nižší. Seno po zimě 872 zůstane 9,8 t
  místo 0,6 t, hlad v prosinci 871 začne o 8 dní později. V dalších letech ozimu přibude (872
  +2,6 ha, 873 +5 ha) – zprůměrovaná žeň uvolní září (žeň 873 v září 438 → 123 čd). Len vytrhá
  ves každý rok celý (dřív 873 nic – srpen bral žeň jaře); nedostatek oděvu 871 (35 / 54 kg) a 873
  (58 / 62 kg) je už jen z malé plochy lnu.

**Implementace** (`DAY_WORK_ORDER` v rules-fields.ts, `dayTaskOrder` v simulate-work.ts; volby
návrhem Clauda):

- **Otava** (nutná 2. seč – [oxen.md](oxen.md), Seno, dvě seče; `DayTask.aftermath` podle čísla
  seče v plánu, `mowingCut`): vlastní skupina hned za 1. sečí, před jablky a přípravou půdy (od 10. 11. 2026 – Pozdní léto výš). ~~Hned za přípravou půdy a setím, před péčí o sad, hlídkou
  a výmlatem~~ (9.–10. 11. 2026). Měření změny z 9. 11. 2026, Vlkov 871–874 (před → po): v září 871 orba a setí 47 → 310 čd, otava 309 → 12 čd; ozim 15,5 → 22,4 ha
  (jař 872 17,4 → 11,3 ha – víc dílů jde pod ozim), sklizeň 872 + 873 o 1,0 t víc. Seno 30. 9.
  871 36,5 → 26,7 t, k 31. 3. zbylo 0,6 t místo 9,8 t – zimní krmení i tak 100 % (voli i stáda),
  stáda beze změny; dní s přídělem v hubeném roce 871/872 227 → 236 (víc osiva ozimu). V roce
  873 otavu nestihne ani dřív (září bere dosklizeň jaře).
- **Úlohy mimo seznam:** porážka a uzení za žní, trháním lnu a nutnou sečí i otavou, před
  jablky (od 18. 11. 2026 – porážka celý rok, [strava](diet.md) – Porážka za žní: maso je k jídlu
  hned, práce porážky jen spotřebuje ruce a počká; v zimě se nežne ani neseče – tam zůstává hned
  za výmlatem na dnešní jídlo; ~~hned za výmlatem na dnešní jídlo celý rok~~, maso se muselo
  zpracovat hned); péče o sad za přípravou půdy, před hlídkou; obilné jámy
  (potřebují vymlácené zrno) a dospělý pasák za výmlatem – před stavbami jako dřív. Seč navíc pro
  růst stád, pletí mužů a ryby zůstávají za stavbami.
- **Uvnitř skupiny** nejbližší konec okna (v srpnu dosklizeň ozimu před žní jaře), v přípravě půdy
  **orba rádlem první** – spřežení potřebuje jen oráče, jinak voli stojí ([oxen.md](oxen.md) –
  Orba má přednost platí dál uvnitř skupiny). Luštěniny starších vsí se sklízejí s obilím.
- **Zásobníky** (žňové ruce, děti a ženy při pletí, rodina vojvody ve žních, ženy řemeslníků jen
  lehké úlohy) zůstávají; pořadí skupin jen určuje, kdo z obecné práce dostane napřed.
- **Okno výmlatu** ozimu a luštěnin srpen–únor, jaře září–únor (dva úseky přes konec roku). Snopy
  v okně čekají bez ztráty, od 1. 3. se kazí `THRESHING.spoilPerMonth`; dřina počítá výmlat
  s koncem února. Upozornění „humno nestačí“ až po únoru.
- **Žňový den** (Žně všemi rukama – žňové ruce, poloviční skladba dne, řemeslníci a rodina vojvody
  na poli) jen při **výmlatu hned po žni** (`HARVEST_THRESH_WINDOWS` – ozim srpen–září, jař září–
  říjen); výmlat v listopadu až únoru je obyčejná práce vsi se zimní skladbou dne a řemeslníci
  zůstávají v dílnách – zimní výmlat termín nemá.
- **Plán u výmlatu** (`threshingSeason`) se dál zahodí 1. 11. – den po žňovém výmlatu jaře; snopy se
  mlátí dál bez něj. Vazalská dávka z úrody je hotová nejpozději 1. 10. jako dřív (snopy jsou
  v nabídce jako zrno).
- **Výmlat na osivo** (skupina před přípravou půdy, `THRESHING.seedDays`): ve snopech zrno na setí
  není – hromada osiva okna bere jen vymlácené zrno. Když hromada ráno narazí na vymlácené zrno,
  ves v okně setí obilí vymlátí napřed osivo na 2 dny setí dnešním tempem (dnešek a zítřek, jako
  výmlat na dnešní jídlo) – nejvýš osivo ideálního zbytku okna a nad přežívací zásobu do žní. Bez
  něj by ves za výmlatem v hubeném roce orala a kopala bez osiva (Vlkov 873: 1. 9. 0,2 t zrna
  a 14 t ve snopech).
- **Humno** (`THRESHING.floorManDaysPerDay`) beze změny – přes zimu má dost dní; obilné jámy se dál
  plní jen do listopadu (zámraz), co se vymlátí později, čeká v zásobách. Výhled zásob počítá snopy
  jako zrno (`sheavesOutlook` – v okně bez ztráty).
- **Plán osevu** výmlat z podzimní práce neodečítá a do zátěže srpna (pomoc rodiny vojvody) ho
  nepočítá – výmlat čeká za polními pracemi. **Deník vsí** zapisuje zásoby na konci roku i se zrnem
  v nevymlácených snopech.

**Naměřeno** (Vlkov ze stavu DB, 3 roky po dnech; dřív = feat/landscape d91680bf; řádek =
hospodářský rok – ozim oseto do 31. 10., jař do 14. 5., úroda v roce žně; sklizeno = podíl žně 31. 7. ozim, 31. 8. jař a len; příděl = dny pod plným přídělem; snopy 1. 11. a 1. 1.):

| Rok     | Verze | Oseto ozim / jař (ha) | Úroda (t) | Sklizeno ozim / jař / len | Příděl (dní) | Snopy (t)   | Dovymláceno       |
| ------- | ----- | --------------------- | --------- | ------------------------- | ------------ | ----------- | ----------------- |
| 871/872 | dřív  | 20,3 / 9,3            | 13,7      | 0,98 / 0,97 / 1,0         | 239          | 4,5 / 0,1   | 2. 1.             |
| 871/872 | nově  | 15,5 / 17,4           | 14,7      | 0,99 / 1,0 / 0,19         | 227          | 5,6 / 1,7   | 19. 1.            |
| 872/873 | dřív  | 20,9 / 24,6           | 17,7      | 0,97 / 0,66 / 0           | 0            | 1,2 / 0     | 2. 12.            |
| 872/873 | nově  | 23,5 / 25,7           | 18,9      | 0,84 / 0,53 / 0           | 0            | 8,1 / 0,5   | 4. 1.             |
| 873/874 | dřív  | 8,3 / –               | –         | –                         | 0            | 15,4 / 8,1  | 20. 2.            |
| 873/874 | nově  | 10,5 / –              | –         | –                         | 0            | 16,4 / 11,1 | 1. 3. zbývá 2,0 t |

Za tři roky ves sklidí 41,7 t (dřív 39,5 t). V září 871 jde druhá seč sena (279 čd) před orbu – ozimu
je o 4,8 ha méně, jaře na jaře o 8,1 ha víc. Výmlat na osivo pomohl v roce 873 (1. 9. jen 0,2 t
vymláceného zrna, 14 t ve snopech): ozim 10,5 ha proti 8,2 ha bez něj. Len v srpnu 872 jen z 19 %
– rodina vojvody v srpnu pomáhá jen se žní (výmlat do zátěže srpna nepatří) a obilí má přednost.
Po rekordní úrodě 873 ves do konce února nedomlátí 2,0 t snopů (dřív hotovo 20. 2.) – v listopadu
má přednost podzimní kopání pod jař, zbytek se od března kazí.

#### Žeň jaře i v září (9. 11. 2026)

**Martin (9. 11. 2026): „Ano, ať se jař sklízí i v září“** – na otázku, jestli dosklízet v září jař,
kterou srpen nestihne: v roce s 26 ha jaře se do 31. 8. sklidí jen 65 %, protože srpnovou práci
bere i dosklizeň a výmlat ozimu (Žně i v srpnu). Dřív okno žně jaře končilo 31. 8. a co se
nesklidilo, propadlo.

| Kdy                  | Ozim (luštěniny, len)                     | Jař                                                  |
| -------------------- | ----------------------------------------- | ---------------------------------------------------- |
| žeň                  | červenec–srpen                            | srpen–září                                           |
| do snopů / zapíše se | 31. 7. sklizené v červenci, 31. 8. zbytek | 31. 8. sklizené v srpnu, zbytek až dožatý, do 30. 9. |
| výmlat hned po žni   | srpen–září                                | září–říjen                                           |

- **Okno žně jaře** je **srpen–září** (dřív jen srpen). 31. 8. (po jídle dne) jde do snopů úroda
  srpnové žně – vymlátí se v září jako dřív. Jař, kterou srpen nedosklidil, **zůstává na poli**
  (dál ji ničí zvěř – okno škod září jen pro ni, [wildlife.md](wildlife.md) – Škody – a pohromy,
  scéna ji ukazuje osetou s postupem žně, výhled dílu s ní počítá) a žne se v září.
- Do snopů jde zbytek **v den, kdy je jař dožatá** (po jídle dne), **nejpozději 30. 9.** – co ani
  září nesklidí, propadne (návrh Clauda: dřív než 30. 9., ať díly hned uvolní pole ozimu a snopy se
  mlátí). Jař sklizená celá do 31. 8. jde do snopů celá jako dřív.
- **Díly jaře na poli končí hospodářský rok, až se sklidí** – 1. 9. se v postupu neposunou
  (Osevní postup po dílech, bod 1), do nového osevu nepřijdou a **neorají se pod ozim**, dokud
  jsou na poli; po sklizni se posunou (první osev oběhu → ozim) a přijdou na řadu další den.
- **Výmlat jaře** má okno **září–říjen** (výmlat hned po žni – zářijová žeň se mlátí v říjnu);
  snopy v okně čekají bez ztráty. Plán u výmlatu se zahodí 1. 11. (dřív 1. 10.). _Okno výmlatu
  nově do konce února – Pořadí důležitosti polních prací a výmlat do zimy (výš)._
- **Pořadí práce dne ve žních** (_nahrazeno pevným pořadím – Pořadí důležitosti polních prací
  a výmlat do zimy, výš_) – **Martin (9. 11. 2026): „Je lepší za každou cenu sklidit to, co
  už vyrostlo, než začínat pěstování úplně od začátku“.** Ve dni, kdy ves žne, má žeň přednost
  před orbou a setím (orba jinak jde napřed – [oxen.md](oxen.md), Orba má přednost): na žeň jdou
  i muži od spřežení a rozsévači, orba a setí ozimu dostanou, co po žni zbude, a naplno pokračují,
  až je jař sklizená. V září tak jde dosklizeň jaře před orbou, setím ozimu i výmlatem (žeň má
  přednost – návrh Clauda); v srpnu jde dosklizeň ozimu (konec okna srpen) před žní jaře (konec
  okna září) a výmlatem. Výjimkou zůstává výmlat na dnešní jídlo – jde první (production-chains.md
  – Humno). Sad, seč a porážka nejsou polní práce a pořadí s nimi se nemění.
- **Plán** (Kolik ves oseje, Postup práce po dílech): zbývající žeň jaře v září ubere podzimu
  (setí ozimu) – čelo práce i kapacita podzimu mají jen práci, která po žni zbude. Výhled dílu
  hlásí nedostatek práce na žeň jaře do konce září, ozimu do konce srpna; jař, kterou srpen
  nedosklidil, má v září výhled jako ostatní díly. Výhled správce (dlouhodobá kapacita) jednorázovou
  dosklizeň nepočítá (návrh Clauda).
- **Příděl** dál počítá se sklizní jaře 31. 8. (`daysUntilFoodHarvest`); v září počítá výhled
  i se zrnem jaře, kterou ves ještě dožne (jako se snopy – návrh Clauda), ať ves kvůli dosklizni
  zbytečně nešetří.
- **Rodina vojvody** pomáhá i v září – jen kolik ves sama do 30. 9. nedožne ([lord.md](lord.md) –
  Kdy jde rodina na pole). V srpnu pomáhá jako dřív, aby jař byla sklizená do konce srpna – zářijová
  žeň bere práci setí ozimu (návrh Clauda).
- **Žňový den** (Žně všemi rukama) je i v září, dokud ves dožíná jař, a v říjnu, když mlátí
  zářijové snopy – s poloviční skladbou dne a žňovými rukama.
- Obilné jámy v září počkají na zrno jaře, kterou ves ještě dožne (production-chains.md – Obilné
  jámy); vazalská dávka z úrody je hotová, až je jař sklizená a vymlácená (nejpozději 1. 10.).

**Naměřeno** (Vlkov, ze stavu DB, 3 roky po dnech; dřív = feat/landscape 0b7a4d7b; podíl hotové žně
jaře 31. 8. → 30. 9.; t úrody do snopů v roce žně; oseto = ozim na podzim a jař na jaře před žní;
příděl = dny přídělu pod plný v hospodářském roce před žní):

| Rok | Verze | Jař 31. 8. → 30. 9. | Úroda ozim / jař (t) | Oseto ozim / jař (ha) | Příděl (dní) |
| --- | ----- | ------------------- | -------------------- | --------------------- | ------------ |
| 871 | dřív  | 1,00                | 3,7 / 4,4 = 8,1      | – / 16,2              | 35           |
| 871 | nyní  | 1,00                | 3,7 / 4,4 = 8,1      | – / 16,2              | 35           |
| 872 | dřív  | 0,99                | 9,8 / 3,7 = 13,4     | 21,8 / 7,8            | 252          |
| 872 | nyní  | 0,99                | 10,3 / 4,0 = 14,3    | 22,7 / 8,5            | 248          |
| 873 | dřív  | 0,65                | 6,4 / 6,2 = 12,6     | 16,2 / 26,0           | 0            |
| 873 | nyní  | 0,54 → 0,98         | 8,7 / 10,3 = 19,0    | 22,3 / 26,8           | 0            |

V roce 873 (27 ha jaře) srpen sklidí jen 54 % jaře, září ji dožne (98 %, do snopů 30. 9.) – jař
dá o 4 t víc a ves v následujícím roce nešetří (příděl září 873 – srpen 874: 30 → 0 dní). Cena:
zářijová žeň vezme září setí ozimu – na podzim 873 ves oseje ozimem 8,3 ha místo 16,8 ha (Martin:
„za každou cenu sklidit“). Za tři roky ves sklidí 41,4 t proti 34,1 t (část rozdílu je z ozimu
zasetého na podzim 872 – 22,3 proti 16,2 ha).

#### Žně všemi rukama

Ves v ideální krajině hladověla s volnýma rukama – úzká byla okna žní, na poli bylo jen 10 ze 17
dospělých (diagnóza 24. 10. 2026). Martin (24. 10. 2026): „Teď žije vesnice v ideální krajině …
vesnice populačně roste i bez zásahu hráče, za předpokladu, že má dostatečnou rozlohu polí.“ a ke
žním: „Dílny i vojvodova rodina.“

- **Žňový den** = den v oknech žní a výmlatu hned po žni kterékoli plodiny (výmlat v listopadu až
  únoru žňový den nemá – Pořadí důležitosti polních prací a výmlat do zimy; červenec – žeň ozimu, luštěnin
  a lnu; srpen – výmlat ozimu a luštěnin, žeň jaře a zbytku ozimu, luštěnin a lnu; září – výmlat
  jaře a srpnové žně – Žně i v srpnu), kdy má ves v okně ještě
  co sklízet nebo **opravdu jde mlátit** (snopy a humno s kapacitou, nebo nouzový výmlat; ves
  bez humna se snopy, které nesmí mlátit, žňový den nemá – řemeslo a výcvik běží).
- Ve žňový den jdou na žeň a výmlat i **řemeslníci se syny** ([crafts.md](crafts.md) –
  Řemeslníci na žních; řemeslo ten den stojí, ženy řemeslníků dál domácnost a lehčí práce).
  Mimo žňové dny dělají řemeslo. ~~Cvičící muži vojvodovy rodiny ve každý žňový den~~ – od 9. 11. 2026 jde na žně **celá vojvodova rodina, jen když je ves sama nestíhá**, a jen kolik
  chybí ([lord.md](lord.md) – Kdy jde rodina na pole).
- **Výrostci a starší** (Martin 24. 10. 2026): výrostci od 10 let a starší dají ve žňový den po
  **0,5 člověkodne celkem** – vázání, odnos, paběrky ([rešerše](research/2026-10-17-zemedelstvi-populace.md)
  §5: dítě 7–13 let 0,3, starší 0,5). Chlapci a starší cvičící vojvodovy rodiny ne (cvičí, kryjí
  dvorec). Je to **celkem** 0,5 čd, ne navíc k tomu, co už dělají: starší, kteří kryjí denní minimum
  domácnosti, žeň nepřidají (dají jen to, co jim nad minimum zbude), výrostek pasoucí stáda dá
  žeň jen do 0,5 čd (po odečtení pasení). Vojvodova rodina na poli ve žňový den nejezdí na
  koních (kůň stojí).
- Jejich práce jde **jen na žeň a výmlat, před prací vsi** – ves má o to víc práce na setí,
  stavby a opravy; co žně a výmlat nespotřebují, řemeslu propadne (návrh Clauda).
- **Plán osevu** (Kolik ves oseje) s nimi počítá v červenci a srpnu a ve výmlatu jaře v září
  (ves dá z výmlatu jen svůj díl) – tytéž ruce jako práce dne.

#### Pletí – děti (25. 10. 2026)

Martin (25. 10. 2026) k tabulce vytížení Vlkova (květen 100 % – pletí 366 čd): „**Pletí se často
účastnily děti. To by mohlo uvolnit ruce dospělým.**“ Pravidla (návrh Clauda, schválený Martinem 25. 10. 2026):

- V okně pletí (od 25. 10. 2026 jen květen – Pletí jednou a rychle), kdy ves má co plet, jdou plet **děti 7–13 let, které zrovna
  nepasou** – **pasáci mají přednost** (pasou nejstarší, plejí mladší). Synové cvičící vojvodovy
  rodiny ne (cvičí).
- Každé dítě dá **0,5 člověkodne denně** (návrh Clauda; rešerše §5 – dítě 7–13 let 0,3–0,5),
  jen na pletí a **před dospělými** – ti mají o to víc práce na seč, stavby a opravy; co pletí
  nespotřebuje, propadne (děti si hrají).
- Ve scéně plejí **malé postavy dětí** podle věku.
- Plán osevu se nemění – pletí jeho kapacitu neomezuje (okna Kolik ves oseje jsou podzim, jaro,
  červenec a srpen).

#### Pletí jednou a rychle (25. 10. 2026)

Martin (25. 10. 2026) k tomu, že se v červnu nestihla nutná seč (pletí sebralo práci – Vlkov
v květnu 100 % na pletí): „**Ve středověku se plelo jednou, rychle a dělaly to hlavně ženy a děti,
takže z práce dospělých to moc neubírá. Jakmile obilí trochu vzešlo, tehdejší vysoké odrůdy pole
zastínily a další plevel už nevzešel.**“ A k ozimu: „**Ozim se plít asi nemusí – v dubnu už je tak
velký, že plevel udusí.**“ Pravidla (návrh Clauda podle Martina):

- **Jedno projití** pole krátce po vzejití – pletí se neopakuje. Nevypletá část dá dál nižší
  úrodu (obilí 60 %, luštěniny a len 50 %).
- **Ozim se neplete** – žádná úloha pletí, plná úroda bez pletí. Starší vsi s rozdělaným nebo
  chybějícím pletím ozimu ho ztratí (úloha zmizí, úroda se nesráží – převod jednou, idempotentně).
  Rozdělané pletí jaře, luštěnin a lnu ze starších sazeb se přepočte na nové (hotový podíl
  zůstane) – starý požadavek by se v jediném květnu nestihl a úroda by klesla.
- **Jař, luštěniny a len** se plejí **v květnu** (vzejdou 3–4 týdny po setí v březnu–dubnu);
  v červnu se už neplete – červen patří 1. seči ([oxen.md](oxen.md) – Seno, dvě seče).

| Plodina   | Kdy        | Člověkodny / ha (nejhorší / nejlepší mez) | Dřív                  |
| --------- | ---------- | ----------------------------------------- | --------------------- |
| ozim      | neplete se | 0                                         | 30 / 15 květen–červen |
| jař       | květen     | **8 / 5**                                 | 30 / 15 květen–červen |
| luštěniny | květen     | **10 / 6** (zastíní pole méně)            | 40 / 20 květen–červen |
| len       | květen     | **10 / 6** (zastíní pole méně)            | 40 / 20 květen–červen |

Nejlepší mez posouvají nástroje od kováře jako u ostatní polní práce.

- **Kdo pleje – hlavně ženy a děti.** Pletí bere práci v tomto pořadí: **děti 7–13 let**, které
  nepasou (Pletí – děti), lehká práce **žen řemeslníků**, pak **ženy vsi** – jejich práce nad
  jejich díl denního minima domácností: domácnost z většiny obstarají ženy (Martin 19. 10. 2026),
  ženy nesou **3/4 denního minima** (návrh Clauda) –, i před úlohami, které jsou v pořadí dne dřív
  (setí, seč). **Muži** doplejí jen zbytek – jen tolik, kolik by děti a ženy **do konce okna
  nestihly**, a to až **po ostatních úlohách dne** (nutná seč, orba, setí) – muži tak sekají (seč
  kosou dělali muži) a ženy plejí. Odhad je opatrný (návrh Clauda): tempo dětí a žen je práce,
  kterou dnes pletí opravdu daly, **× 0,8**, a nepočítá **posledních 5 dní okna** – výpravy, vozy
  a seč jim v dalších dnech práci vezmou a pletí se v okně musí dodělat (stavby se staví až
  z práce po úlohách dne, pletí neberou).
- Ve scéně plejí ženy (podíl žen z jádra) a děti, sečou hlavně muži.

První sezónu po vymýcení lesa se díl **neplete** (viz Úroda).

- **Vzdálenost:** práce na dílu je o 1 % dražší za každých 10 m nad 100 m od nejbližšího
  obydlí (chůze, nošení v nůších – návrh Clauda). Díl 500 m daleko stojí o 40 % víc práce.
  Vzdálenost se měří chůzí, rychlost proti louce (Martin, 19. 10. 2026 – roads.md, Rychlejší
  chůze): po plně prošlapané pěšině dne 1,3× (slabší úměrně síle – paths.md, Pěšiny a práce), po
  pevné cestě podle stupně – vyšlapaná i vyježděná 1,5×, upravená 1,7×, hať a lávka 1,7× i přes
  mokřinu. **Pole zdržuje:** díl v osevu od orby nebo kopání po sklizeň 0,5× („Pole, které zrovna
  neleží ladem: 0.5.“ – pěšina dne přes něj nezrychlí), strniště 0,8× („Neber strniště jako louku,
  ale dej mu drobný postih. Ber to třeba jako 0.8.“), úhor, příloh a zakládaný díl jako louka;
  pevná cesta přes pole jde rychlostí cesty. Mokřina 0,5×, brod + 30 m (po lávce bez zdržení) –
  i rovně mimo cestu, takže pole za potokem bez cesty zdraží, s hatí a lávkou zlevní, a díl
  uprostřed oseté plochy je dál než na jejím kraji.
  Stejně se měří vzdálenost čtverce sadu (orchard.md). Bez krajiny (kalibrace) vzdušnou čarou.
  **Chůze se přepočítává měsíčně** (Martin, 18. 10. 2026): hned po změně rozložení vsi (obydlí,
  nové díly a čtverce, cesty, ohrady, sady, hřbitov, stáda), změny stadií dílů (osev, úhor,
  pastva) se do ní promítnou až 1. dne dalšího měsíce (paths.md – Pěšiny a práce).
- **Včasnost:** co se v období nestihne, propadá: nezasetý díl se ten rok nesklidí, neopletý
  dá nižší úrodu, nesklizená úroda shnije na poli (návrh Clauda; přesné podíly doladí kalibrace).
  Výmlat nepropadá – snopy, které okno nestihne, se mlátí dál a do té doby se kazí (viz Výmlat
  hned po žni).
- **Výmlat hned po žni** ([production-chains.md](production-chains.md) – Humno; Martin, 20. 10.
  2026: „Staří slované se snažili dělat výmlat hned. Klasy neskladovali.“ a „Humno je podmínka“):
  sklizeň jde do **snopů**, výmlat je převádí do zásob podle postupu práce – ozim a luštěniny
  v **srpnu**, jař v **září** (dřív listopad–únor). Mlátí se jen na **hotovém humnu** (staví ho
  hráč): humno zvládne **12 člověkodní výmlatu za den** (≈ 4 páry mlatců a 4 pomocníci – v srpnu
  a září ≈ 60 ha osevu), víc humen se sčítá. Žeň má v témže měsíci přednost, výmlat ji následuje;
  co okno nestihne, mlátí se dál (zpožděný výmlat je v září–únoru nejnaléhavější úloha měsíce,
  kopání a setí ozimu v říjnu ale před ním; v březnu–srpnu až po všech ostatních pracích – zbytky
  nepředběhnou setí ani žeň). **Výmlat na dnešní jídlo** má přednost před vším: chybí-li
  v zásobách zrno na jídlo na dva dny, ves ho ze snopů vymlátí napřed (návrh Clauda). Výmlat ve
  svém okně se počítá do dřiny jako ostatní polní práce. **Snopy, které se nemlátí** (ves bez
  humna, nebo výmlat okno nestihl), se **kazí 10 % za měsíc** – klasy se neskladovaly, práce
  výmlatu ubývá s nimi; snopy, které se v okně právě mlátí, na řadu čekají bez ztráty (návrh
  Clauda). **Starší vsi** (uložené před snopy) mají od převodu
  **rok odkladu**: bez humna mlátí nouzově na udusané zemi u domů – bez omezení místa, ale
  o **30 % víc práce** a o **10 % zrna méně** (humno, které v odkladu nestačí, mlátí zbytek také
  nouzově). Nová ves odklad nemá – mlátí, až hráč postaví humno (upozornění „Před žněmi postav
  humno“ 90 dní před žní, „Snopy čekají na humno“ po ní – obě i při prvním pohledu na ves a z jiné
  vsi, snopy v horní liště; nouzový výmlat „Mlátí se na udusané zemi – postav humno“; humno
  nestačí „Humno nestačí na výmlat“ – jen když humno stálo celé okno výmlatu a ruce výmlatu ho
  přetíží – od 18. 11. 2026, production-chains.md – Humno). Výhled jídla, plán
  osevu a dobré zásoby (štěstí) počítají snopy jako zrno, jen když je smí vymlátit (humno nebo
  odklad), se ztrátami (nouzově o 10 % méně – podíl mimo humna po druzích snopů v pořadí výmlatu
  dne; oprava, návrh Clauda 2. 11. 2026, production-chains.md – Humno; „pomalé humno“ od 21. 10. 2026 neplatí – přebytek nad kapacitu humen se mlátí hned nouzově) a s rukama vsi do
  konce okna výmlatu (oprava, návrh Clauda 2. 11. 2026: výmlat den po dni s prací vsi ve žních,
  v srpnu po žni jaře – víc dní na humnech, co ruce v okně nestihnou, se kazí; dřív výhled
  počítal, že se všechno vymlátí dnes); jí se
  jen vymlácené – hlad a šetření jdou i podle snědené energie. Plán osevu odečte čekající výmlat z podzimní práce (září
  – mlátí se před setím ozimu) a výmlat ozimu a luštěnin z práce srpna (vedle žně jaře). Úroda
  sklizená do zásob před převodem tam zůstane. Čísla v `THRESHING` (rules.ts), rešerše
  [2026-10-20-production-chains.md](research/2026-10-20-production-chains.md) – Výmlat na humně.
- **Obilné jámy** ([production-chains.md](production-chains.md) – Obilné jámy; Martin, 20. 10.
  2026: „na příhodném místě obilné jámy po sklizni vykopou, naplní obilím a utěsní/zamaskují“):
  vymlácené obilí čeká na humně a vesničané ho od srpna do listopadu uloží do jam na 1 500 kg
  u humna – sezónní práce dne za polními pracemi a výmlatem (s koncem v listopadu – setí ozimu má
  přednost), před stavbami: nová jáma 2,5 čd, naplnit a zapečetit 1 čd; po plných jamách, neúplnou
  až po výmlatu letošní úrody (zbytek pod 300 kg zůstane doma). Prázdná jáma se znovu naplní, po
  10 letech se zasype. Zásoby obilí zůstávají jedno číslo (jámy + zrno na humně a doma); jí se
  napřed zrno mimo jámy, pak z jedné otevřené jámy, po ní se otevře další. V zapečetěné jámě ubývá
  3 % zrna za rok, v otevřené jámě a doma jako dosud (Ztráty při skladování). Plán osevu ztráty
  v jamách nezná – počítá jako doma (opatrnější, návrh Clauda). Čísla v `GRAIN_PITS` (rules.ts),
  rešerše [2026-10-20-production-chains.md](research/2026-10-20-production-chains.md) – Obilné
  jámy.
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
  dospělé stromy mladého lesa dají klády. V běžném oběhu se spásaný příloh vrací po 5 letech (dřív 10–13)
  jako louka, tedy za 100 na hektar.

### Ozim a jař

> **Od 25. 10. 2026** určuje plodinu dílu osevní postup (Osevní postup po dílech výše: díl je na
> řadě s ozimem či jařem podle oken, ne podle výběru s kapacitou). ~~Výběr ozimu a jaře podle
> toho, kolik podzim stihne zkopat a osít (dřívější výběr s kapacitou)~~ je zrušený; okna práce a sklizně
> níže platí dál. Kapacitu používá jen odhad ve skriptech (`steady-state.ts`) a omezuje v něm
> ozim.

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
  - **ozim** – vrácení přílohu, kopání a setí v **září–říjnu**, sklizeň v **červenci**, co
    červenec nestihne, v **srpnu** (Žně i v srpnu, Martin 9. 11. 2026), výmlat hned po žni
    v **srpnu**, srpnové žně v **září** (viz Výmlat hned po žni),
  - **jař** – kopání na podzim (**září–listopad**), co se nestihne, v **březnu–dubnu**; setí
    v **březnu–dubnu**, sklizeň v **srpnu**, co srpen nestihne, v **září** (Žeň jaře i v září,
    Martin 9. 11. 2026), výmlat v **září**, zářijové žně v **říjnu**.
  - Pletí jen jaře v **květnu**, ozim se neplete (Pletí jednou a rychle, Martin 25. 10. 2026).
    Stejné osivo (175 kg/ha), stejná úroda i ostatní sazby práce; vymrzání ozimu zatím ne
    (přijde s počasím).
- **Podzimní kopání:** díly v osevu se kopou na podzim (září–listopad); na jaře se kope jen to,
  co podzim nestihl – nahrazuje pevné dělení „polovina kopání na jaře“. Na podzim ves kope
  nejdřív ozim (musí být zasetý do konce října), pak jař.
- ~~Ves rozhodne k 1. 9.~~ – přesunuto do [historie](history/fields-history.md#ves-rozhodne-k-1-9).
- ~~Díly hotové po 1. 9.~~ – přesunuto do [historie](history/fields-history.md#díly-hotové-po-1-9).
- **Jídlo:** sklizeň ozimu jde do zásob **31. 7.** (po jídle dne; co se žne v srpnu, 31. 8. –
  Žně i v srpnu), jaře 31. 8. Přídělový systém
  počítá do 31. 7., když ozim podle odhadu (zasetá plocha – do konce října celá –, plná sklizeň,
  pletí, kolik je hotové) uživí ves od 1. 8. do 31. 8.; jinak do 31. 8.
- **Díly nesou plodinu**; vyčerpání úrodnosti a příloh se počítají po dílech beze změny. Starší
  vsi (díly bez plodiny, plán bez ozimu) dopočítají dál – díl bez plodiny je jař.
- **Ve scéně** ozim na podzim vzejde a přes zimu zůstává zelený (sníh přidávají roční období),
  zraje v červenci; jař leží přes zimu jako zkopaná zem, zezelená na jaře a zraje v srpnu – po
  čtvercích, jak k nim dojde práce (viz Postup práce po čtvercích).
- **Panel pole** ukazuje oseté díly podle plodiny (ikona ozimu a jaře s počtem dílů).
- **Kopání pod jař i na jaře** (Martin 21. 10. 2026: „Ano udělej to tak.“ – na návrh Clauda):
  jař se kope a z přílohu vrací na podzim (září–listopad) **i na jaře (březen–duben)**, před
  setím téhož dílu; ozim má na podzimní práci přednost (kope a seje jen v září–říjnu). Důvod
  (kalkulačka ustáleného stavu): ves jako Vlkov s motykou (8 domácností po 3 dospělých, úrodnost
  56, podíl jídla z pole 0,55) potřebuje osít ≈ 11 ha, ale práce stihla jen 9,4 ha – září
  a říjen byly vytížené na 98 % (kopání pod ozim i jař a výmlat jaře hned po žni), jaro mělo
  98 % práce volné. Plán osevu (`fitsSpring`) proto bere podzim po ozimu a zbytek kopání i vrácení
  přílohu přenese na jaro; vrácení přílohu pod jař má od teď také okno v březnu–dubnu
  (`WINDOWS.reclaim`). Orba rádlem má jarní okno už dřív (`fitsSpringPlough`), beze změny.

### Zahrádka u obydlí – len a luštěniny (9. 11. 2026, implementováno)

**Změna 9. 11. 2026 večer – len zpět na pole (implementováno 9. 11. 2026):** Martin: „Tak změna. Len je
extrémně náročná plodina na kvalitu půdy. Tam, kde už jednou rostl, se může vrátit až po 6 nebo 7
letech, takže se bude pěstovat na polích. Sklízí se v srpnu, ale obilí má vždy absolutní přednost –
pokud se nesklidí len, tak lidé budou maximálně chodit v potrhaných šatech, ale neumřou hlady.“
Pravidla (podrobnosti návrh Clauda):

- **Len na poli**, ne na zahrádce – zahrádka dál dává jen **luštěniny** (celé záhony).
- **Na tentýž díl nejdřív po 7 letech** (Martin „6 nebo 7“ – návrh Clauda bere 7); len si bere
  jarní díly (setí v dubnu jako dřív) s nejlepší úrodností, na kterých len 7 let nerostl, jen do
  potřeby lnu na oděv.
- **Trhání lnu v srpnu**; ~~**obilí má vždy absolutní přednost** – len dostane práci až po všech
  pracích na obilí (žeň, odnos, výmlat)~~ – od 10. 11. 2026 trhají **ženy a děti souběžně
  s koncem žní** (Len – Trhání níž); co se do konce srpna nevytrhá, propadne a lnu na oděv
  chybí (potrhané šaty – dosavadní upozornění a štěstí), nikdo kvůli tomu nehladoví.

Zahrádka od té doby dává jen **luštěniny z celých záhonů** (polozemnice ≈ 195 m² při úrodnosti 70
≈ 6,8 kg čistých luštěnin); pravidla lnu jsou v sekci Len níž. **Převod uložených vsí** (jednou,
idempotentně): zápis letošní zahrádky (`Dwelling.garden`) ztratí len; díly bez paměti lnu smí len
hned; plán z doby lnu na zahrádkách nemá potřebu lnu (`flaxNeedKg`) – len do něj nepřibude a 31. 8.
se oděv nezapíše (platí podíl ze zahrádek), od dalšího 1. 9. len zase na poli (návrh Clauda – ať
ves za přechod netrpí bez lnu). Odstavce níž o lnu na zahrádce platily od odpoledne do večera 9. 11. 2026.

Původní zadání zahrádky (len už neplatí):

Martin 9. 11. 2026: „Nebylo by lepší, kdyby si lidé řešili len sami podobně, jako luštěniny?“,
„Ale ta zahrádka už je tam nakreslená :D“ a „Ano“ k návrhu Clauda: **len z polí vyřazený** jako
luštěniny; domácnost na **zahrádce svého pozemku** (polozemnice – políčko 15 × 15 m s plotem,
záhony kolem domu, ve scéně už nakreslené – `homestead-layout.ts`) pěstuje **napřed len na oděv**
své domácnosti a **na zbytku luštěniny**. Práce na zahrádce je ženská a jde **bokem** jako domácí
výroba – práci vsi nebere. Zemnice pozemek nemá – domácnost v zemnici zahrádku nemá.
Podrobnosti návrh Clauda: záhony ≈ plocha pozemku bez domu a cestičky (≈ 150 m²); len na oděv
domácnosti (5–6 lidí ≈ 9 kg vlákna ročně – `FLAX`) při 550 kg/ha ≈ 160 m², takže zahrádka dá
zhruba len pro svou domácnost a na luštěniny zbude málo (Vlkov: 7 obydlí ≈ 0,1 ha záhonů); úroda
podle úrodnosti políčka pozemku a počasí kraje jako pole; okna jako dřív na poli (len setí
v dubnu, trhání koncem července; luštěniny setí březen–duben, sklizeň červenec) – práce bokem je
nebrzdí.

**Implementováno (9. 11. 2026)** – pravidla, čísla návrh Clauda (`GARDEN` v `rules-fields.ts`):

- **Kdo má zahrádku:** obydlí s pozemkem (polozemnice, dvorec vojvody), které se používá a někdo
  v něm bydlí; domácnost = lidé obydlí. Zemnice, dílna bez pozemku, prázdné a opuštěné obydlí ne.
- **Záhony z pozemku** (návrh Clauda k Martinově kontrole, 9. 11. 2026): políčko domu
  15 × 15 m bez půdorysu domu (`DWELLING_FOOTPRINT_M` s variantou rozměrů – polozemnice ≈ 25 m²,
  dvorec 57,6 m²) a bez cestičky od branky ke dveřím široké 1 m (délka podle varianty polohy domu:
  uprostřed 5 m, vpředu 2,7 m, vzadu 8,2 m). Polozemnice ≈ 192–197 m², dvorec ≈ 165 m² – dvůr
  dvorce zůstává dvorem. Scéna kreslí záhony jen jako ukázku (užší pásy s uličkami) – plocha se
  z ní neodvozuje, scéna zůstává ve webu.
- **Len napřed:** plocha lnu = potřeba lnu domácnosti (`FLAX.kgPerYear` podle věku lidí v den
  sklizně) ÷ výnos na m² bez počasí, nejvýš celé záhony; **zbytek záhonů luštěniny**. Domácnost,
  které záhony na len nestačí, má zbytek lnu chybět (dosavadní „Chybí len na oděv“ a štěstí až −4)
  a luštěniny nic. Na len sousedů zahrádka nepěstuje.
- **Úroda:** na hektar jako na poli – len 550 kg třeného lnu, luštěniny 0,8 obilí –
  (× 0,4 + 0,6 × úrodnost). **Hnojená zahrádka** (návrh Clauda k Martinově kontrole): záhony hnojí
  domácnost (hnůj, odpad, popel) – úrodnost záhonu = přirozená úrodnost políčka pozemku z krajiny,
  **nejméně 70** (`GARDEN.manuredFertility`); nevyčerpávají se. Plejí se (práce bokem) – plná
  úroda. Luštěniny čisté: osivo 150 kg/ha si domácnost nechá z vlastní úrody (len seje vlastní
  semeno jako na poli). Polozemnice (≈ 195 m², úrodnost 70) dá ≈ 8,8 kg lnu (oděv pro ≈ 4
  dospělé) nebo ≈ 6,8 kg čistých luštěnin; při plné úrodnosti ≈ 10,7 kg lnu.
- **Počasí kraje** roku sklizně jako u dílu pole bez ochrany (sucho, deštivé léto – jařina);
  kroupy, povodeň a smršť se počítají po dílech polí a zahrádky neberou.
- **Kdy:** sklizeň jeden den **31. 7.** po jídle (trhání lnu koncem července, luštěniny
  v červenci) – práce bokem, okna setí (len duben, luštěniny březen–duben) se nesledují. Ves
  založená po **30. 4.** letos nesela – sklidí až příští rok a oděv do té doby nezapíše (jako dřív
  ves bez plánu lnu). Obydlí postavené po dubnu sklidí už letos (zjednodušení – domácnost
  přichází z jiného domu).
- **Kam:** luštěniny do zásoby luštěnin (`legumesKg` – jí se, obchod, platby jako dřív); len se
  v rámci roku zpracuje v domácí výrobě – 31. 7. se zapíše podíl oděvu = len ze zahrádek (a
  dorůstající len na poli starší vsi) ÷ potřeba **všech** lidí vsi (i v zemnicích).
- **Kronika:** jeden souhrnný zápis za ves – „Sklizeň zahrádek: 40 kg lnu a 12 kg luštěnin.“
  (`garden-harvest`), když ves nějakou zahrádku má.
- **Panel obydlí:** ikona lnu a luštěnin s kg z letošní sklizně zahrádky (`Dwelling.garden`
  – zemnice a obydlí, které letos nesklízelo, ikony nemá).
- **Scéna:** beze změny – záhony se zeleninou už jsou nakreslené; len na záhonech v létě je
  námět (modře kvetoucí pás v červnu).
- **Převod uložených vsí:** jako u luštěnin – díl, který plán chystal na len a setí na něm
  nezačalo, přejde do jaře i s hotovou přípravou půdy, výběr dílů z paměti se lnem propadne
  (`withoutFieldFlax`); zasetý len doroste, vytrhá se a přičte se k oděvu (nedotržený 31. 7. až 31. 8.). Starší plány nesou `flaxNeedKg` dál, nové ho nemají.
- **Naměřeno – Vlkov** (kopie stavu, 3 roky od 3. 3. 871, 39–42 lidí, 6 obydlí s pozemkem
  a 1 polozemnice bez pozemku – 5 lidí bez zahrádky; přirozená úrodnost políček pozemků 24–46,
  díly polí medián 35):

  | rok                         | 871                        | 872         | 873         |
  | --------------------------- | -------------------------- | ----------- | ----------- |
  | len ze zahrádek (kg)        | 25 (+ 35 zasetých na poli) | 44          | 38          |
  | luštěniny ze zahrádek (kg)  | 2                          | 6           | 4           |
  | oděv `linen` (dřív na poli) | 1,00 (0,65)                | 0,72 (1,00) | 0,63 (0,91) |
  | dny přídělu (dřív)          | 60 (62)                    | 269 (274)   | 113 (113)   |

  Zahrádka dá 4–7 kg lnu (dvorec méně – menší záhony; v létě 873 sucho), domácnosti po 3–9
  lidech potřebují 5–16 kg – lnu je v letech 872 a 873 málo („Chybí len na oděv“, štěstí ≈ −1,1
  až −1,5). Zásoby 31. 12. o 0,3–1,6 % nižší, lidí stejně. První verze (150 m², přirozená
  úrodnost) dala jen 17, 30 a 26 kg lnu a oděv 0,88, 0,49 a 0,43.

- **Kdo nemá zahrádku nebo mu nestačí** (návrh Clauda k Martinově kontrole): len dál jen pro
  vlastní domácnost – zemnice, polozemnice bez pozemku a velké domácnosti mají lnu málo
  a upozornění zůstává (alternativy – větší záhony i za plotem nebo chybějící len dál na poli – jsou
  odložené).

### Luštěniny

**Zrušeno – luštěniny z polí vyřazené.** Martin (9. 11. 2026): „Luštěniny jsou podle mě píčovina.
Co vím, tak je lidi pěstovali spíš doma na zahrádkách než na velkých polích, přesně protože sice
měly dobré výnosy, ale potřebovaly mnohem víc práce“ a „Ano“ k návrhu luštěniny z polí úplně
vyřadit a zahrádky u obydlí probrat zvlášť později (nová mechanika, teď ne). Sedí s rešerší
([2026-10-18-legumes.md](research/2026-10-18-legumes.md) – luskoviny hlavně zahradnicky u obydlí).
Důvod v simulaci: Vlkov luštěniny sel (≈ 6 ha), ale nestihl je sklidit – trhání 68 čd/ha proti 38
u obilí dá na člověkoden žně ≈ 2,2× méně jídla; osivo luštěnin měnil u sousedů za obilí (≈ 1 t
ročně) a se žněmi v srpnu luštěniny braly práci jaři (Žně i v srpnu).

- **Na poli už ne:** výběr dílů luštěniny nikomu nepřidělí, cíl luštěnin v osevu ani v plánu
  chovu není (rovnovážné hospodaření – [diet.md](diet.md) – jen pokrytí bílkovin stádem
  a zásobou), osivo luštěnin se za obilí nevyměňuje.
- **Zboží zůstává:** zásoba luštěnin se dojí (strava, bílkoviny – diet.md), obchod, platby a dávky
  luštěninami fungují dál – jen z pole nové nepřibudou. Platí-li ves luštěninami, stojí jí kilogram
  obilí, které místo nich sní (návrh Clauda – dřív cena práce pěstování).
- **Převod uložených vsí** (jednou, idempotentně, při načtení): díl, který plán chystal na
  luštěniny a setí na něm nezačalo, přejde do jaře i s hotovou přípravou půdy (jako ozim po konci
  okna setí – osivo z něj ves ještě nevzala); výběr dílů z paměti s luštěninami propadne. Zasetá
  a rozsetá luštěnina doroste a sklidí se podle pravidel níže (návrh Clauda – osivo je v zemi,
  převod by ho ztratil; okna, výnos, práce a úrodnost luštěnin proto zůstávají jen pro ni).

Dřívější pravidla (platí už jen pro dorůstající luštěniny starších vsí):

Stav: **Martin, 18. 10. 2026:** „c) ale maso bude mírně zvyšovat štěstí“ – bílkoviny 1,6 g na kg
tělesné váhy zůstávají a přidají se luštěniny jako plodina na poli (strava – [diet.md](diet.md),
Luštěniny). Čísla podle [rešerše](research/2026-10-18-legumes.md), kde chybí, návrh Clauda.

- **Plodina:** hrách a čočka jako jedna plodina „luštěniny“ (v Mikulčicích čočka ≈ 75 % nálezů
  luštěnin, hrách druhý; bob, vikev a hrachor vzácné – zatím ne). **Jař**: kopání na podzim
  (září–listopad), co se nestihne, v březnu–dubnu, setí v **březnu–dubnu**, pletí jednou v květnu,
  sklizeň (trhání) v **červenci**, výmlat hned po sklizni v **srpnu** na humně jako obilí
  (production-chains.md – Humno). Ozimý hrách až ve 20. století.
- **Úroda:** 0,8 úrody obilí při stejné úrodnosti (≈ 600 kg/ha při plné, literatura 390–680),
  osivo **150 kg/ha** (výnos ≈ 1 : 3,3 – středověké účty 3× až 5½× jako obilí). Neopletý díl dá
  **50 %** (obilí 60 % – čočka plevel snáší nejhůř).
- **Práce** na hektar (nejhorší / nejlepší mez): kopání 100 / 50 a setí 10 / 10 jako jař, pletí
  **10 / 6** (obilí 8 / 5 – Pletí jednou a rychle; dřív 40 / 20, hrách se okopával dvakrát), sklizeň **35 / 20** + odnos 20 / 20
  (žeň luštěnin ≈ 1,2× dráž), výmlat **10 / 6** (obilí 15 / 10).
- **Úrodnost:** osev luštěniny úrodnost dílu neubere (obilí −0,12), ale **vrátí 0,03** – poutá
  dusík, ≈ rok přílohu (nejvýš plná úrodnost). Opatrná hodnota: dnešní pokusy dávají obilí po
  luštěnině víc, středověké výnosy z Winchesteru přínos nenašly.
- ~~Kolik ves oseje (k 1. 9.)~~ (Luštěniny) – přesunuto do [historie](history/fields-history.md#kolik-ves-oseje-k-1-9--luštěniny).
- **Zásoba luštěnin** (kg): sklizeň **31. 7.** (po jídle dne, jako ozim; co červenec nestihne,
  se trhá v srpnu a do snopů jde 31. 8. – Žně i v srpnu), nevymlácená část se
  1. 3. zkazí jako u obilí. Ztráta skladováním jako obilí (10 %, s hrnčířem 5 % ročně – zrnokaz
     napadá semena na poli, ve skladu se nemnoží). Jí se rovným dílem celý rok do příští sklizně.
- **Ve scéně** hrách tvoří nízkou hustou rohož – zelený kvetoucí v květnu–červnu, zralý hnědý
  v červenci; po sklizni místo panáků hromádky vytrhaného hrachu a skoro holá zem. Panel pole
  ukáže díly luštěnin (ikona a počet).

### Len

**Zpět na poli (Martin 9. 11. 2026 večer, implementováno):** „Tak změna. Len je extrémně náročná
plodina na kvalitu půdy. Tam, kde už jednou rostl, se může vrátit až po 6 nebo 7 letech, takže se
bude pěstovat na polích. Sklízí se v srpnu, ale obilí má vždy absolutní přednost – pokud se nesklidí
len, tak lidé budou maximálně chodit v potrhaných šatech, ale neumřou hlady.“ (Odpoledne téhož dne
byl len krátce na zahrádce – Zahrádka u obydlí výš.) Platí místo „Kolik ves oseje“, „Len napřed“
a „Trhání“ níž; potřeba, výnos, práce, vyčerpání půdy, zpracování a štěstí beze změny.

- **Kolik:** k 1. 9. se do plánu zapíše potřeba lnu na oděv (`FLAX.kgPerYear` lidí – 2 kg
  dospělý, 1 kg dítě). Len bere díly **jen do ní** (očekávaná úroda dílu = 550 kg/ha × úrodnost
  jako obilí) a **napřed před obilím** – v den, kdy smí začít jař (okna kopání září–listopad
  a březen–duben); setí v dubnu jako dřív.
- **Které díly** (podrobnosti návrh Clauda): díly, na kterých by dnes začala jař, **s nejlepší
  úrodností**, na kterých len **7 let nerostl** (Martin „6 nebo 7“ – návrh Clauda 7: díl si pamatuje
  rok posledního lnu, len smí znovu na sklizeň o 7 let později; díl s osetým lnem si rok zapíše
  1. 9. i tehdy, když se len nevytrhal). Napřed díly **druhého osevu** oběhu (jař po ozimu, jař po
     jaři, které okno ozimu skončilo – díl pak stejně jde do přílohu, len mu nic nebere), teprve když
     nestačí, díly **prvního osevu** (čerstvý díl, příloh 70–95 %) – len jim vezme jedno kolo obilí.
     Nouzový příloh pod 70 % ne. Proč i první osev: ves s prvním osevem jaří (založená na jaře) nemá
     díly po ozimu – jař po jaři čeká na ozim a len by neměl kam (ves z testů by v roce 603 lnu neměla).
- **Díly na len si ves odloží na podzim** (Martin 10. 11. 2026, otázka „Má si ves díly na len
  odkládat předem?“: „Ano. Jak jsme řekli, len je extrémně náročná plodina, ale zase ho není potřeba
  moc“; návrh Clauda – provedení): dokud běží okno setí ozimu (září–říjen), ves před přidělením
  ozimu **vyřadí z ozimu díly na příští jarní len** – jen do potřeby lnu na oděv (očekávaná úroda
  dílu jako výše) a z dílů na řadě s **nejvyšší úrodností**, na kterých len 7 let nerostl. Stejný
  seznam bere len v listopadu (kopání) a v dubnu, odložené díly se tedy do jara připravují (podzimní
  nebo jarní příprava půdy) a osejí se lnem. Dnešní pořadí „napřed díly v osevu, pak první osev“
  návrh Clauda **obrací**: len je „extrémně náročný na kvalitu půdy“ (Martin 9. 11. 2026), proto mu
  patří nejlepší díly ať jsou čerstvé, odpočaté nebo v osevu (díl v osevu pak jde obilí dál).
  Odložení se nikam neukládá – každý den se odvodí ze stavu dílů (`flaxCandidates`); díl, který
  ozim už dostal, je v hospodářském roce a odložit se nedá. Není-li díl s úrodností od 70 %, len se
  nezaseje (nedostatek oděvu jako dosud).
- **Ženy a děti trhají souběžně s koncem žní** (Martin 10. 11. 2026: „Sklizeň na etapy … Mezi
  jednotlivými sklizněmi tak vznikaly přirozené mezery právě na vytrhání lnu.“ – schválený návrh
  Clauda, Pořadí důležitosti polních prací, Pozdní léto): ve dni, kdy je len zralý, jdou na trhání
  napřed výrostci a starší ze žňových rukou, ženy řemeslníků a ženy vsi prací nad svůj díl denního
  minima (jako při pletí) – muži dál žnou a svážejí. Len nezůstane nevytrhaný jen kvůli pořadí
  (Vlkov 871–873 vytrhá 100 % každý rok, dřív 89 %, 100 %, 0 %). Ve srovnání níž platí pro práci,
  kterou ženy a děti nestihnou.
- **Trhání jen v srpnu**; **obilí má přednost** (návrh Clauda, Martin 9. 11. 2026: „Ano. Výmlat
  prý počká i docela hluboko do zimy“): trhání dostane
  práci dne za **všemi žněmi obilí** (žeň a odnos ozimu, luštěnin i jaře, jejíž okno běží do září),
  za výmlatem na dnešní jídlo a výmlatem, jehož okno tento měsíc končí – ale **před výmlatem, jehož
  okno běží i v září** (snopy v okně čekají bez ztráty, výmlat se jen o kousek odsune). Přísnější
  pořadí (len až po veškerém výmlatu) ve Vlkově nikdy nedostalo práci – ves v srpnu mlátí ozim
  celou prací vsi (≈ 350 čd výmlatu proti ≈ 10 čd trhání) a lnu by chyběl každý rok.
  **Rodina vojvody** s lnem nepomáhá (pomáhá „se sklizní“ obilí – návrh Clauda) a trhání lnu
  nepřidá dřinu.
- **Co srpen nevytrhá, propadne:** 31. 8. se zapíše podíl oděvu = vytrhaný len ÷ potřeba z plánu
  k 1. 9.; při nedostatku „Chybí len na oděv“ a štěstí až −4 – nikdo nehladoví (obilí přijde nejvýš
  o práci žen a dětí – i s lnem ×1000 sklidí aspoň 97 %, hlídá test). Plán bez potřeby (ves založená během roku, plán z doby zahrádek) oděv nezapíše.
- **Naměřeno – Vlkov** (kopie stavu, 3 roky od 3. 3. 871, 39–42 lidí; před = len na zahrádkách):

  | rok                        | 871           | 872             | 873             |
  | -------------------------- | ------------- | --------------- | --------------- |
  | len oseto (ha / dílů)      | 0,16 / 7 (¹)  | 0,14 / 6        | 0,15 / 7        |
  | vytrháno                   | 100 %         | 100 %           | 0 %             |
  | oděv `linen` (před)        | 0,65 (1,00)   | 1,00 (0,72)     | 0,00 (0,63)     |
  | luštěniny ze zahrádek (kg) | 15 (2)        | 39 (6)          | 31 (4)          |
  | žeň obilí (kg, před)       | 8 090 (8 090) | 13 713 (14 279) | 17 743 (18 672) |
  | dny přídělu (před)         | 61 (70)       | 213 (213)       | 0 (0)           |

  (¹) len z plánu uloženého před zahrádkami (díly s úrodností 4–56); zahrádka už len nedá – oděv
  0,65. V roce 873 velká žeň jaře zabrala celý srpen a na len nezbylo nic (obilí přednost). Žeň
  obilí o 4–5 % nižší – nejspíš štěstí bez lnu (871 a 873) ubírá práci vsi, takže ves v říjnu 871
  zasela o ≈ 2 ha ozimu méně; zásoby 31. 12. o 0,6–1,8 % nižší, lidí stejně.

Dřívější stav:

**Zrušeno 9. 11. 2026 odpoledne, večer znovu na poli – len z polí vyřazený.** Martin (9. 11. 2026): „Nebylo by lepší, kdyby si lidé řešili len
sami podobně, jako luštěniny?“ a „Ano“ k návrhu Clauda – len pěstuje domácnost na zahrádce u obydlí
(Zahrádka u obydlí výš). Výběr dílů len nepřidělí, potřeba lnu se do plánu k 1. 9. nezapisuje;
potřeba, výnos, práce, okna a vyčerpání půdy níž platí už jen pro dorůstající len starších vsí
(převod jako u luštěnin), potřeba lnu na oděv a štěstí bez lnu dál pro zahrádky.

Stav: **Martin, 19. 10. 2026:** „A to mi připomíná, že na částech pole musí být zasetý len.“ (k ovcím
na vlnu – oděv, [diet.md](diet.md) – Oděv). Pravidla **návrh Clauda** podle
[rešerše](research/2026-10-19-flax.md).

- **Plodina:** len setý na plátno – spodní oděv (košile), šátky, ručníky, plachty; vlna je svrchní
  oděv. **Jař se stejnými okny jako luštěniny:** kopání (orba) na podzim, co se nestihne, v březnu–
  dubnu, setí v **březnu–dubnu** (v praxi v polovině dubna), pletí jednou v květnu, **trhání
  v červenci** (≈ 100 dní po setí), co červenec nestihne, v srpnu (Žně i v srpnu). Nemlátí se –
  semena se drhnou v domácí práci.
- **Kolik ho ves potřebuje:** třeného lnu (vlákno po lámání a třepení) za rok **dospělý a starší
  2 kg, dítě 1 kg** (≈ 3 m² hrubého plátna ≈ 1 kg látky na dospělého – košile, díl spodního oděvu,
  šátků, ručníků a plachet; na kg látky ≈ 2 kg třeného lnu i s koudelí).
- **Výnos:** **550 kg třeného lnu na hektar při plné úrodnosti**, s úrodností jako obilí
  (× 0,4 + 0,6 × úrodnost) – při úrodnosti 70 ≈ 450 kg (Skotsko konec 18. st. 440–550, Irsko 1892
  429 kg/ha). Ves 30 lidí potřebuje ≈ 48 kg ≈ 0,1 ha ≈ 5 dílů. **Osivo** je lněné semeno z vlastní
  úrody (sedmina dílu dozraje na semeno) – zásoby obilí neubírá. **Neopletý díl dá 50 %** (len
  snáší plevel špatně, jako luštěniny).
- **Práce** na hektar: kopání (orba) a setí jako jař, pletí **10 / 6** (jako luštěniny), trhání
  a vázání do hrstí **45** + odnos **10** (nástroje nepomohou – len se vytrhává i s kořenem), výmlat
  žádný. Ves s ≈ 5 díly lnu na ně dá ≈ 23 člověkodní za rok.
- **Úrodnost:** len vysiluje půdu – osev ubere úrodnost **0,18 přirozené** (obilí 0,12), díl pak po
  vyčerpání leží v přílohu o ≈ 2 roky déle.
- ~~Kolik ves oseje (k 1. 9.)~~ (Len) – přesunuto do [historie](history/fields-history.md#kolik-ves-oseje-k-1-9--len).
- ~~Len napřed~~ – přesunuto do [historie](history/fields-history.md#len-napřed).
- **Trhání** jde v červenci napřed (před sklizní ozimu a luštěnin – je ho málo, bez něj chybí
  oděv), v srpnu stejně před ozimem, luštěninami i jaří (Žně i v srpnu).
- **Zpracování** – rosení (máčení), sušení, lámání, třepení, vochlování, předení, tkaní a šití – je
  součástí **domácí výroby** (`DOMESTIC`, Práce – Bokem: „oděv, …“): **přerozdělení, ne práce
  navíc** (rozhodnutí Clauda jako u vlny). Dospělý ≈ 1 kg látky × ≈ 200 h ≈ 20 člověkodní za rok –
  s vlnou ≈ 45 z ≈ 125 člověkodní domácí výroby na dospělého. Od 19. 10. 2026 jde domácí výroba
  celá bokem – z práce vsi nebere (Práce).
- **Žádná zásoba v liště** (Martin nechce nové suroviny): len se v rámci roku zpracuje. Při
  trhání 31. 7. (nedotržený len 31. 8.) se zapíše, **na jaký podíl oděvu len je** (sklizený len
  ÷ potřeba při plánu k 1. 9.) – platí do dalšího trhání.
- **Ves bez lnu** (rozhodnutí Clauda): jen **štěstí – až −4** podle chybějícího podílu (vlna až −6)
  a krátký řádek **„Chybí len na oděv“** (kronika `linen-short`). Pomalejší domácí práce ani nemoci
  ne (anti-cíl: ves nevymře kvůli oděvu). Ves, která k 1. 9. nemá pole k osevu, len nezaseje – při
  trhání se zapíše chybějící len (štěstí −4, upozornění), dokud pole nezaloží.
- **Starší vsi:** plán z doby před lnem (bez zapsané potřeby) oděv nezapíše – ves je beze změny až
  do dalšího plánu k 1. 9.
- **Ve scéně** len tvoří útlé stonky (trsy vzcházejícího obilí – tráva bez klasů – s barvou
  instance): zelený, **v červnu modře kvete** (zmodrá i porost shora), v červenci **dozrává
  dohněda**; po trhání holá zem a malé panáky – hrstě lnu schnou na poli. Panel pole ukáže díly
  lnu (ikona `flax` – hrst s modrými květy), panel dílu „Zelený len“ / „Kvetoucí len“ / „Zralý len“
  / „Trhání lnu“. Ukázka na `/dev/buildings` – pole **Len**.
- **Naměřeno** (`measure-village.ts 20 20`, 19. 10. 2026, jen orientačně; hráč skriptu zakládá
  pole i na len – `neededFieldHa` s `flaxNeedKg`; po sloučení s ovcemi na vlnu, v závorce stejný
  kód bez lnu – ves bez lnu): len na plný oděv **v 92,4 % let** (od 3. roku vsi; jinak zásoby na
  pojistce – obilí napřed), plocha lnu medián **45 m² na člověka**; práce na poli hráče, který
  staví, 63,3 (62,1) čd na člověka a rok (+2 %), volná práce 5,8 (5,6) čd, nasycení ≥ 0,95 celý
  rok 96,6 (96,1) % let, práce na obživu startovní ves 82,4 (82,7) %, plná domácnost 83,4
  (83,5) %, štěstí medián 52,4 (49,4 – bez lnu −4). První verze (len jen na díl, který obilí
  doplní, trhání v červenci až po ozimu) měla plný oděv jen v 66,5 % let – vesnicím bez volné půdy
  len nezbyl a trhání nestihly; proto len smí ubrat obilí o svou plochu (ze zásob nad pojistku)
  a trhá se napřed. Bez omezení na zásoby nad pojistku 99,7 % let, ale ves na hranici půdy pak
  krátce hladověla. Od 20. 10. 2026 (Len napřed) omezení na zásoby nad pojistku neplatí a len jde
  napřed i ve vsi bez volné práce – kalibrace s tím zatím neběžela.

### Úroda

- **Hrubá úroda** osetého hektaru při plné a včasné práci: **760 kg × (0,4 + 0,6 × aktuální
  úrodnost / 100)** – na čerstvém dílu s úrodností 70 asi 625 kg, v průměru tří let osevu
  (aktuální úrodnost ≈ 88 % přirozené) asi 585 kg; při přirozené úrodnosti 45 v průměru osevu
  asi 485 kg (návrh Clauda).
- **Osivo:** 175 kg na hektar (výnos asi 1 : 3,3, raný středověk 1 : 3), luštěniny 150 kg/ha,
  len seje semeno z vlastní úrody. Do zásob jde celá úroda – osivo bere setí (Osivo ze zásob).
- **Osivo ze zásob** (Martin 27. 10. 2026: „Osivo ze zásob při setí“; pravidla a čísla návrh
  Clauda; dřív se osivo odečítalo až ze sklizně, takže po neúrodě ves zasela 2–2,5× víc dílů
  „na dluh“ – osivo na 52 ha ≈ 9 t při zásobách 1,8 t):
  - Setí bere osivo ze zásob **v den setí dílu** – obilí (ozim, jař, obilí nad potřebu) ze zásob
    obilí, luštěniny ze zásob luštěnin; luštěnin, které chybí, ves vymění u sousedů za obilí.
    Sklizeň osivo neodečítá. Ves zaseje jen tolik dílů, na kolik má osivo.
  - **Osivo bez cíle osevu (9. 11. 2026).** Cíl osevu přežil v kódu jako „potřeba úrody“ a dál
    určoval osivo za čekající díly – Vlkov kvůli němu od 1. 10. do 30. 11. jedl na příděl 0,88
    s 9,5 t v zásobách. Martin 9. 11. 2026: „Ne dopíči, plán už jsme asi desetkrát zavrhli a ty ho
    tam vždycky nějak znova namrdáš“, „Fajn, prostě před osevem odečti minimální zásobu jídla
    a zbytek do osevu. Po měsíci se do zásob vrátí to, co se nezaselo.“ a k celému pravidlu „Ano,
    platí“. Osivo za čekající díly zmizelo, osivo drží **hromada osiva okna**:
    1. Na začátku okna setí (ozim 1. 9., jař a len 1. 3.) ves odloží osivo na **všechny díly na
       řadě**, nejvýš zásoby − přežívací zásoba do žní (níž). Zbytek zásob je jídlo – příděl podle
       něj (Martin: „Na všechny díly. Bude hladovět max ty dva měsíce – to není hladovění, ale spíš
       půst“). Osivo se počítá průběžně, jak přibývá vymlácené zrno (1. 9. leží úroda ještě ve
       snopech) – hromada je nejvýš vymlácené zrno a nejvýš zásoby i snopy bez přežívací zásoby.
       Osivo, které ves má jen na setí (koupené, osadníků, zakladatelů), se do hromady počítá.
    2. Každý den se zasetá plocha porovná s **ideálním denním dílem** (osivo na řadě ÷ dny setí
       okna); osivo za nestihnutou část se hned po práci dne vrátí do jídla (Martin: „v ideálním
       případě se za den zorá 100 %… reálně voli stihnou míň, třeba jen 80 %. 20 % osiva tak zbyde
       a může se vrátit do jídla“). Hromada tak drží jen osivo ideálního zbytku okna, nejvýš osivo
       dílů, které zasít ještě zbývá.
    3. **Setí týž den hned za orbou** (Martin: „Setí by mělo probíhat ihned po orbě. Za oráčem by
       měl jít někdo z rodiny a rovnou zasívat“) – viz Práce.
    4. Na konci okna (31. 10., 30. 4., po dlouhé zimě 14. 5.) se nezaseté vrátí do zásob. Dny, kdy
       dlouhá zima setí jařin drží (do 22. 3.), se do dnů setí okna nepočítají.
    5. **Na řadě** (návrh Clauda): odpočatý příloh (≥ 95 %) a díly v osevním postupu – pro ozim
       první osev a díly po jaři, pro jař i díly po ozimu – a nezasetá letošní práce plodiny.
       Zotavený příloh 70–95 % až když jsou díly na řadě oseté a v okně zbývá čas – osivo z toho,
       co zbude nad přežívací zásobou; nouzový příloh jen při hladu.
    6. ~~Mimo okno se osivo zvlášť nedrží~~ – od 1. 11. do konce února drží ves **zimní osivo**
       (níž). Od konce jarního okna do září se osivo zvlášť nedrží.
       Nákup osiva (Osivo pro ves bez zásob) kupuje osivo na díly na řadě; osivo zakladatelů si ves
       při šetření přídělem nechá na díly na řadě příštího okna (návrh Clauda).
  - **Zimní osivo (9. 11. 2026).** Měření Vlkova: po slabé sklizni 871 zasel 17 ha ozimu, v zimě
    jedl plný příděl a 1. 3. 872 měl nad přežívací zásobou jen 0,36 t – 4,9 ha jaře. Martin 9. 11. 2026: „Tak když věděli, že mají málo jídla, proč žrali jak protržení? Zaslouží si
    chcípnout“. Pravidlo:
    1. Od konce podzimního okna setí (1. 11.) do začátku jarního (1. 3.) drží ves osivo na **jarní
       díly na řadě** (jař a len – jako hromada jarního okna, bod 5), nejvýš zásoby − přežívací
       zásoba do žní, a stejně jako v okně nejvýš vymlácené zrno. Osivo jen na setí se počítá.
    2. Ves jí jen **zbytek** – když na plný příděl do žní nestačí, **šetří (příděl) už v zimě**.
       Výmlat na dnešní jídlo a platby zimní osivo za jídlo nepočítají (jako hromadu okna).
    3. V zimě se neseje, takže se zimní osivo nevrací. **1. 3.** ho převezme hromada jarního okna
       (bod 1 – ideální denní díl a průběžné vracení). Září a říjen beze změny (hromada ozimu).
  - **Výhled zásob k sklizni (9. 11. 2026, místo potřeby úrody).** Z dřívějšího cíle osevu zůstal
    jen výhled zásob z pole k příští sklizni: kolik zbude (`leftKg`), kolik do žní chybí
    (`shortKg`), pojistka (`bufferKg` – 0,5 roční potřeby celé energie, v paměti hladu 0,75) a
    potřeba z pole rok po sklizni (`needKg`) – podle stravy (Osev podle stravy) a růstu vsi (Osev
    podle růstu vsi). Řídí sňatky ([příbuzenství](kinship.md) – Sňatky čekají na zásoby), režim
    správce a jeho nákup obilí, odchod syna a potřebu polí správce ([správce](steward.md)), lov,
    platby, jídlo domény a zakládání polí. Osivo v okně i zimní osivo se ve výhledu počítá jako
    zásoba **kromě osiva, které ves ještě zaseje** (návrh Clauda – jinak by v každém okně stály
    svatby a nákupy a každá ves by žádala jídlo domény): v okně osivo plochy, kterou ves dnešním
    tempem zorá a zaseje do konce okna (spřežení po 0,3 ha za den podle síly volů, ves bez
    spřežení motykou všemi dospělými – stejné tempo jako průběžné vracení, bod 2); v zimě osivo
    jarních dílů, které ves stihne za celé jarní okno. Zbytek hromady se do jídla vrátí – výhled
    s ním počítá jako se zásobou. Osivo jen na setí a osivo zakladatelů v lhůtě jídlem není.
  - **Osev má přednost – kolik si ves nechá na jídlo** (6. 11. 2026). Martin: „Pojďme se podívat
    na ten osev – to se přece nemusí plánovat: ves vezme z obilí tolik osiva, aby jí to vystačilo
    do žní, a pak se oře a zasívá, dokud trvá časové okno pro orbu a zasetí, nebo dokud se
    neobhospodaří plocha, co se má obhospodařit, nebo dokud nedojde osivo – podle toho, která
    z těch tří možností nastane první. Případný zbytek osiva se vrátí do zásob.“ – „Musí zasít –
    jinak by si prožrala budoucnost. Za cenu žádného hladu letos by přišel hladomor příští rok.
    Dokonce by se měla pokusit zasít co nejvíc i za cenu toho, že bude mít hlad – aby došlo
    k rostoucímu trendu.“ Schválený návrh Clauda: **ves oseje co nejvíc a sama si nechá jen tolik
    zrna, aby do žní hladověla, ale nikdo hlady neumřel**; strop osevu podle jídla zmizí (Martin 6. 11. 2026: „Ok, ověřovat měřením nemusíš, efekt uvidíme na logu Vlkova.“).
    - **Přežívací zásoba do žní** (vzorec návrh Clauda): zrno na příděl potřeby z pole do sklizně,
      při kterém nahromaděný hlad do žní nedosáhne **prahu úmrtí nejcitlivější skupiny ve vsi**
      ([populace](population.md) – Hlad a vymření: děti a starší 12, dospělí 20 dní) bez **rezervy
      1 dne** (SEED_STORES.marginDays, jako v hájení); s hladem, který ves už nahromadila. Pod 90 %
      přibude za den (0,9 − příděl) / 0,9 dne hladu, ves tedy unese `slack` = práh − 1 − hlad dní
      a nechá si **0,9 × denní potřeba z pole × (dny do žní − slack)** (nejméně 0; s hladem nad
      prahem 0,9 celé potřeby do žní). Má-li ves osivo jen na setí (níže), počítá místo prahu úmrtí
      s 5 dny, od kterých by ho snědla (SEED_BUYING.eatFromStarvationDays) – osivo jen na setí tak
      nesní. Ves ji jí vždy.
      **Výpočet ze stravy (oprava, návrh Clauda 6. 11. 2026):** hlad se hromadí z energie celé
      stravy, ne jen z obilí, takže přežívací zásoba je nejmenší zrno, při kterém **celé nasycení
      do žní** drží příděl aspoň 0,9 × (1 − `slack` / dny do žní) – obrácený výhled jídla dne
      (`grainAheadForOutlookKg` nad stejným vstupem jako jídlo dne). Ostatní jídlo do žní bere
      z odhadů, které výhled jídla už má: mléko stád do sklizně, sýr, maso v zásobě do zkažení
      a čerstvé maso zimní porážky (kusy už vybrané k porážce), vejce, luštěniny v zásobě a ve
      snopech, jablka do zkažení. Odhad nemá **maso z podzimní porážky, která teprve přijde**
      (kusy se vyberou 1. 11.), jablka z úrody sadu, která ještě nedozrála, a ryby a zvěřina
      (úlovek dne se nedá dopředu) – s těmi nepočítá, jsou rezerva navíc. Ztráty skladováním do
      žní zná už výhled (Přídělový systém, od 15. 11. 2026), k zrnu přidá jen dnešní ztrátu (dřív
      odhadem ztráty do žní – zrno leží v průměru půl doby do žní). Dřív počítala jen s potřebou
      z pole (0,9 × denní potřeba z pole × (dny do žní − `slack`)) – mléko a maso byly rezerva navíc
      a ves s mlékem a masem si nechala víc zrna, než potřebovala.
      **Podle zbytku vsi (návrh Clauda 18. 11. 2026):** příděl 0,9 × (1 − `slack` / dny do žní)
      i hlad, ze kterého se `slack` počítá, jsou zbytku vsi – při přednosti v hladu dostává
      nejméně ([strava](diet.md) – Kdo dostane co). Nad životním minimem 75 % si ves nechá zrno na
      příděl vsi (potřeba vyšších vrstev + příděl × potřeba zbytku vsi) ÷ potřeba vsi – vyšší
      vrstvy syté –, pod ním na týž příděl pro všechny. Dřív na příděl celé vsi: zbytek vsi z něj
      dostal jen 75 % a ve Vlkově 904–905 umíraly děti hladem, i když ves držela osivo.
    - **Ostatní zrno je osivo:** smí do země bez stropu podle potřeby jídla – ves oře a seje díly
      v plánu (nutné i nad potřebu podle osevního postupu; úhor zůstává úhorem), dokud trvá okno,
      dokud díly nejsou oseté, nebo dokud osivo nedojde. Osivo bere setí v den setí dílu, takže co
      ves nezaseje, v zásobách prostě zůstane. Osivo, které na setí v okně ještě čeká, ves nejí;
      **po konci okna setí plodiny** (ozim po říjnu, jařiny po dubnu, po dlouhé zimě po 14. 5.) se
      nezaseté osivo jejího plánu vrátí do zásob jako obyčejné zrno (Martin: „Případný zbytek osiva
      se vrátí do zásob.“ – oprava, návrh Clauda 6. 11. 2026; dřív ho ves držela až do žní). Osivo
      jen na setí (zakladatelů, osadníků, koupené) má dál svou lhůtu. Díly nad potřebu sejí jen
      z osiva, na které nutné díly v plánu nečekají (návrh Clauda – nutné mají na osivo přednost),
      a v okně setí **před stavbami** (Osevní postup po dílech, bod 3). Dřív si
      ves nechávala zrno na příděl 0,5 jen pro osivo do roční potřeby z pole odhadnuté z úrody bez
      ztrát (`seedFloorKg`) a ostatní osivo jen nad celý příděl do žní (1); skutečná úroda je
      o 15–25 % nižší (sucho, zvěř, ztráty skladováním), takže ves pojistku nikdy nedoplnila
      a z pasti osiva vyšla jen vymíráním (Vlkov, 6. 11. 2026). Potřeba z pole podle většího
      z dlouhodobého podílu pole ve stravě a včerejší stravy (po úbytku stád jí ves obilí víc).
    - **Osivo zakladatelů** si ves, když v lhůtě šetří přídělem, nechá na díly na řadě příštího
      okna setí (do 9. 11. 2026 odhad osiva do roční potřeby – zrušený s cílem osevu).
  - **Osivo se šetří:** hromadu osiva okna setí (Osivo bez cíle osevu výš) ves nejí – nejvýš zrno
    nad přežívací zásobu; tu jí vždy. Ves tedy do
    žní hladoví nejvýš do prahu přežívací zásoby a nikdo hlady neumře. Rezervu osiva jen na setí
    sní dál při skutečném hladu (5 dnů bez jídla – níže); s přežívací zásobou počítanou k tomuto
    prahu k tomu nedojde, leda by sklizeň přišla později nebo menší, než ves čekala (pohroma).
  - **Příprava jaře jen na díly s osivem** (oprava, návrh Clauda 2. 11. 2026 – přesnost modelu:
    vesničané nedělají práci, která k ničemu nevede): v jarním okně setí (březen–duben, nákup
    osiva 1. 3. už proběhl) ves kope, orá a vrací z přílohu pod jař, luštěniny a len jen díly, na
    které osivo má – vzaté, které smí do země, a zrno a luštěniny ve snopech, které výmlat ještě
    dá (osivo se dělí mezi plodiny v pořadí plánu). Dřív kopala i díly bez osiva, které na konci dubna vypadly i s rozkopáním. Podzimní příprava
    pod jař a příprava ozimu se neomezují – osivo jaře může přijít nákupem 1. 3. a nezasetý ozim
    přejde do jaře i se zkopanou částí. Hráč práci na polích nezadává, pravidlo hry se nemění.
  - **Plán osevu** počítá zásoby k příští sklizni bez osiva, které ještě čeká na setí – díly se
    dál hodnotí čistou úrodou (hrubá − osivo), jako by osivo dalšího osevu odložila sklizeň;
    zásoby před žněmi tak drží cíl i s osivem v zemi.
  - **Převod** (návrh Clauda, 27. 10. 2026): práce plodiny z doby před touto změnou má osivo
    **zaseté části odpuštěné** – sklizeň ho neodečte; nezasetá část vezme osivo ze zásob při setí
    jako nový plán. Jednou, idempotentně (při načtení vsi). Dřív zaseté díly odečetly osivo
    postaru při sklizni a nový osev ho vzal ze zásob – ves tak rok po převodu platila osivo
    dvakrát a ≈ 2 roky šetřila (Vlkov: 333 a 281 dní, nejnižší příděl 0,67).
  - **Osivo pro ves bez zásob** (Martin 27. 10. 2026 k návrhu Clauda, že si osadníci osivo
    přinesou a ves ho koupí u sousedů: „**ok, jak navrhuješ**“; pravidla a čísla návrh Clauda) –
    ves bez zásob by jinak už nikdy nezasela (pod přežívací zásobou nesmí osivo do země, bez setí
    nepřijde sklizeň); osivo na půl roku měla jen nová ves hráče, ne dceřiná ves z odchodu ani
    ves, které požár nebo jiná pohroma vzala zásoby po žních:
    - **Osadníci si osivo přinesou** ([migrace](migration.md) – Odchod do nové vsi): na první osev
      **půl roční potřeby** odcházejících (jako nová ves – START_SEED_YEARS), jen ze svého dílu
      zásob obilí mateřské vsi (podle počtu lidí – mateřská ves nepřijde o víc), a mají ho napřed
      před jídlem: **20 kg na nosiče navíc** k 25 kg jídla. **Jídlo má přednost před osivem na
      voze** (oprava recenze, návrh Clauda): osivo nad to smí na vůz jen z místa, které zbude po
      jídle na **180 dní** (LEAVING.cartSeedFoodDays; 5 dospělých a vůz 400 kg: jídlo ≈ 260 kg
      místo 125, osivo zbytek). Pěšky tak nesou málo (rodina se dvěma nosiči 40 kg ≈ 0,23 ha).
      Poměrný díl se počítá ze zásob **bez rezervy osiva** mateřské vsi (ta zůstane jí).
    - **Nákup osiva u sousedů zanikl:** ves bez osiva na nutné díly ho nekupuje; chybějící osivo dílům nezasadí a kronika zapíše upozornění „Chybí osivo na setí“ (osivo na trhu přijde s plánem 3). Dřívější text je v [historii](history/fields-history.md).
    - **Osivo osadníků a koupené ves nesní** – je jen na setí, do země smí i pod přežívací zásobou;
      koně a obilné jámy ho nesahají. Nutné díly sejí **napřed z běžného zrna nad přežívací zásobu**
      (od 6. 11. 2026, dřív nad příděl 1), pak z této rezervy a teprve pak ze zrna pod příděl (oprava,
      návrh Clauda 2. 11. 2026 – dřív rezervu braly napřed, takže osivo zakladatelů se vyselo
      v prvních třech letech; stejně pro osivo osadníků a koupené – rezerva zůstane jako pojistka
      a 1. 6. / 1. 12. se uvolní jako dřív, ves zaseje stejně). Co do **1. 6.** (po setí jaře
      i s odkladem za počasí) nezaseje, je obyčejné zrno; rezerva nad osivo jaře se uvolní už
      **1. 12.** (po setí ozimu). **Při skutečném hladu** (5 dnů bez jídla, dřív než začnou umírat
      – SEED_BUYING.eatFromStarvationDays) ji ves sní: osivo se šetří, ne za cenu smrti (návrh Clauda).
    - **Osivo zakladatelů první vsi** (Zásoby a nasycení – Start; Martin 2. 11. 2026) je stejná
      rezerva, jen se **do lhůty (15 let od založení) neuvolní 1. 6. ani 1. 12.** a cíle osevu ho
      nepočítají za jídlo (ves kvůli němu neoseje méně) – slouží na víc osevů. Při skutečném hladu
      ho ves sní jako každou rezervu (návrh Clauda). Setí na něj sáhne, až když běžné zrno nad
      přežívací zásobu nestačí (oprava, návrh Clauda 2. 11. 2026 – viz výš; od 6. 11. 2026, dřív
      nad příděl 1). **Když ves v lhůtě šetří
      přídělem**, sní rezervu nad osivo příštího osevu (roční osivo do potřeby z pole podle cílů
      osevu, nejméně osivo nutných dílů, které na setí čeká) – ne až po 5 dnech úplně bez jídla
      (návrh Clauda 2. 11. 2026 podle záměru Martina: velká zásoba má vsi pomoct, ne způsobit hlad).
    - **Otevřená otázka:** půjčka osiva od pána (vazal si osivo vypůjčí a vrátí ze sklizně) – až
      s vazalstvím (návrh Clauda, Martin 27. 10. 2026 odložil).
- Úroda se sníží podle nedodělané práce (pletí, sklizeň, odnos – viz Včasnost).
- **Úrodnost:** osetý rok sníží aktuální úrodnost dílu o 12 % přirozené, rok v přílohu ji
  o 5 % přirozené vrátí (od 26. 10. 2026, dřív 2,5 %), nejvýš na přirozenou (viz Přílohová soustava).
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
  nemodelují. Domácí výroba jde bokem, mimo práci vsi (Práce – Bokem) – nasycení nesnižuje
  (návrh Clauda). Nasycení počítá [strava](diet.md) – energie (obilí, maso, ovoce) × pestrost; dřív
  záviselo jen na obilí a jablcích ([sad](orchard.md)).
- **Ztráty při skladování:** 10 % zásob za rok (myši, plíseň), rozložené rovnoměrně; s hrnčířem
  5 % (meze – dobře utěsněná jáma ztrácí málo, Butser; rozpětí návrh Clauda). Zrno
  v **zapečetěné obilné jámě** jen 3 % za rok (Výmlat hned po žni – Obilné jámy).
- **Přídělový systém:** dokud zásoby vystačí do příští sklizně, jí ves dosyta (nasycení 1).
  **Od 18. 11. 2026 se šetří jen obilí (a v hladu med):** rychle se kazící jídlo se jí napřed
  tempem proti zkažení, ne rovným dílem ([strava](diet.md) – Strava po vrstvách a porážka celý
  rok). Když nevystačí, obyvatelé rozdělí to, co zbývá, rovnoměrně do sklizně – nasycení je podíl
  zásob a potřeby do sklizně (návrh Clauda). Ves tak hladoví postupně, ne ze dne na den.
  Zásoby se přitom počítají **po ztrátách skladováním do dne, kdy se snědí** (stejné ztráty jako
  výše), takže příděl je od začátku přesný a do žní se drží rovně (Martin 15. 11. 2026: „Ano“;
  dřív se zásoby dělily bez ztrát – příděl byl zpočátku štědřejší a pak pomalu klesal a ves na
  hraně hladu po vymírání sklouzla zpět do hladu). Ztráty skladováním se ve výhledu počítají
  **jen u obilí** – maso, sýr a luštěniny ne (Martin 16. 11. 2026: „Zatímco s obilím se to dobře
  odhaduje, ten zbytek je spíš k okamžité spotřebě a každá domácnost si ho řeší sama“). Příští sklizní je **sklizeň ozimu 31. 7.**, když ji ves čeká a podle odhadu uživí ves v srpnu
  do sklizně jaře; jinak sklizeň jaře 31. 8. (viz Ozim a jař).
- **Přednost v hladu** (Martin 17. 11. 2026: „elita ať jí první – kníže, pak zahraniční mistři
  a pak ostatní řemeslníci. Vycvičit řemeslníky totiž trvá dlouho a stojí zdroje“; „I s rodinami“):
  příděl do sklizně se dělí po skupinách – napřed se odloží plné příděly rodu vojvody, domácností
  mistrů huti a řemeslníků do sklizně a zbytek vsi si rozdělí, co zbude; nevyjde-li ani na ně, dělí
  si zásoby ve svém pořadí rovným dílem ([populace](population.md) – Přednost v hladu). Nouzová
  porážka se řídí výhledem celé vsi, výhled „na jak dlouho vystačí zásoby“ taky.
- **Start:** osadníci přinesli zásoby na **18 měsíců** potřeby (návrh Clauda) a k nim osivo na
  první osev – **půl roční potřeby** (od 27. 10. 2026, kdy osivo bere setí ze zásob; návrh Clauda)
  – ves přežije i založení těsně po jarním setí.
  - **Zakladatelé první vsi – velká zásoba** (Martin 2. 11. 2026: „Ta úplně první ves –
    zakladatelé budou mít velkou zásobu jídla/osiva. Ber to analogicky, jako když přišel praotec
    Čech do Čech“; čísla návrh Clauda z měření správce): úplně první ves hráče (vojvoda
    s manželkami a syny – [vojvoda](lord.md), Zakladatelé) přinese jídlo na **3 roky** potřeby
    zakladatelů a **osivo na 2 roky** potřeby (`FOUNDERS_STORES`; 9 dospělých × 180 kg = 1 620 kg:
    4 860 kg jídla a 3 240 kg osiva ≈ 18 ha osevu – od 15. 11. 2026 se 4 syny; dřív 5 dospělých:
    2 700 kg jídla a 1 800 kg osiva ≈ 10 ha, ještě dřív 1 800 kg celkem). Osivo je **jen na setí**
    (rezerva jako osivo osadníků – Osivo pro ves bez zásob), **15 let od založení** se neuvolní
    1. 6. ani 1. 12. a cíle osevu ho nepočítají za jídlo – slouží na víc osevů, dokud nedorostou
       první děti; sní se jen ve skutečném hladu. Ztráty skladováním (10 % ročně bez hrnčíře) jdou
       z celé zásoby obilí – rezerva osiva je nejvýš tolik, kolik obilí zbývá; za první rok tak ves
       ztratí ≈ 810 kg (s 5 zakladateli ≈ 450 kg) a jídlo bez sklizně vydrží kratší dobu než 3 roky. Proč (měření s 5 zakladateli): prvních ≈ 15 let pracuje jen 5
       zakladatelů a dětí přibývá (potřeba 900 → 2 800 kg) – s dnešní zásobou ves v hladu snědla
       osivo a spadla do pasti osiva (měření: osev ≈ 6 → 0,3 ha, deset let bez sklizně). Rychlé
       měření správce (6 vsí × 25 let): s ochranou osiva past zmizí už s dnešní velikostí, pojistku
       ≥ 0,6 (měřítko kvality správce) drží až 3 roky jídla a 2 roky osiva – hladové dny rodu
       2 114 → 789, pojistka 0,44 → 0,67, lidé rodu za 25 let 31 → 38. Ves bez rodu (testy) a ves
       z výpravy syna (nese vlastní náklad) beze změny.
    - **Oprava, návrh Clauda 2. 11. 2026** (záměr Martina – zásoba má vsi pomoct přečkat roky
      s pěti dospělými): setí bralo do nutných dílů osivo zakladatelů napřed, takže 1 800 kg
      zmizelo do jara roku 4 (1 784 → 1 227 → 693 → 293 → 0), i když ves měla 2,7–4,7 t běžného
      obilí, a lhůta 15 let nechránila nic. Teď nutné díly sejí napřed z běžného zrna nad příděl 1 (od 6. 11. 2026 nad přežívací zásobu)
      a osivo zakladatelů jen doplní, co z něj nejde (Osivo ze zásob – Osivo pro ves bez zásob).
      Rychlé měření správce (6 vsí × 25 let): hladové dny rodu 285 → 124, lidé rodu za 25 let
      40,0 → 40,2, pojistka 0,73 → 0,72, využití oběhu 0,91 → 0,90; ves seedu 13 drží osivo
      zakladatelů celé do roku 13 (pak ho ve skutečném hladu sní), lidé za 25 let 30 → 36. Zamčená
      rezerva ale přinesla šetření vsím, kterým běžné obilí na osivo stačí (seed 25: hladové dny
      10 → 250) – proto ji ves, která šetří, sní nad osivo příštího osevu (Osivo pro ves bez zásob):
      hladové dny rodu 124 → 95 (seed 25: 250 → 20), lidé 40,2 → 39,8, pojistka 0,72 → 0,71,
      využití oběhu 0,90.
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

### Opuštěný díl

Stav: **Martin, 8. 11. 2026:** „A“ (k otázce správce – [steward.md](steward.md), Otevřené otázky,
bod 1): „Vypustit díly pole – akce pro hráče i správce, kterou díly vypadnou z oběhu a zarostou;
stejná akce pro oba.“ Podrobnosti návrh Clauda. Implementace `abandon-parts.ts`.

- **Opustit díl** může hráč kdykoli a bez ceny (Hráč staví kdy chce), stejným právem jako
  zakládá pole. Tutéž čistou funkci použije správce.
- Opuštěný díl **zůstane v poli jako trvalý příloh**, který se už neoseje – osevní postup,
  přílohová soustava ani nouzový osev ho nevyberou. Zarůstá podle **Zarůstání** (tabulka výš):
  pastva nebo seč ve fázi louky zarůstání vynuluje – opuštěný díl smí sloužit jako pastvina
  a louka na seno; nepasený díl po 30 letech z pole vypadne a zůstane lesem vsi jako dnes.
- **Připravený díl** (založený, nebo čekající na další osev) jde do přílohu hned – od toho dne
  leží ladem.
- **Osetý díl** se opustí **až po žních** – úroda se nezahodí, do konce hospodářského roku se
  s dílem pracuje normálně a 1. 9. jde do přílohu (i když by jinak čekal na další osev). Totéž
  platí pro díl, který ves k letošní práci už přibrala, ale ještě na něm nezačala.
- **Nezaložený díl** opustit nejde – rozestavěné pole jde zrušit celé (tlačítko Zrušit stavbu); důvod
  u kurzoru.
- **Vrátit díl** (tatáž akce jako přepínač): díl se vrátí do osevního postupu jako příloh –
  podle úrodnosti ho ves oseje jako jiný příloh a vrácení zarostlého dílu stojí práci podle
  tabulky Zarůstání (nic nového). Opuštěný osetý díl vrácený před 1. 9. pokračuje v osevu, jako by
  opuštěný nebyl.
- Opuštěný díl se nepočítá do pole, které ves uživí (rozloha v oběhu).
- **Kronika:** „Díl pole opuštěn – zaroste.“ (víc dílů: „Opuštěno N dílů pole – zarostou.“),
  u vrácení „Díl pole vrácen do osevu.“ (víc: „Vráceno N dílů pole do osevu.“).
- **V rozhraní:** v panelu dílu pole přepínač s ikonou dílu se stromkem (bez slov, popisek
  u kurzoru) – opuštěný díl svítí, díl v osevu je tlumený. **Ve scéně** vypadá jako každý příloh
  (mladý příloh, louka, křoviny, mladý les).
- **Starší vsi** opuštěné díly nemají – beze změny.

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
  a svatyně) les vsi vyklučí jako les krajiny – sazba lesa, stromy lesa vsi v ní, dospělé dají
  klády (Martin, 19. 10. 2026 – Pole jako krajina, Stavby v lese); les vsi, ze kterého stavby
  odstranily všechny stromy, zmizí jako pod polem, zbytek čtverce zůstane lesem.
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
- **Orba a setí až po vyklučení** (návrh Clauda 22. 11. 2026 – D116, oprava modelu, ne nové
  pravidlo; bez nových čísel): na křoví a mladý les se neorá a neseje. Díl s vracením přílohu
  (klučení křovin a mladého lesa; s motykou i drn louky) se smí zorat nebo zkopat, až ho lidé
  vyklučí, a zasít, až je zoraný (zkopaný) – stav vyklučení do včerejška. Díly pásu orby se orají
  spolu, pruh po pruhu (oxen.md – Co nejdelší brázda), takže pás počká, dokud lidé nevyklučí všechny
  jeho díly (návrh Clauda: delší brázda; ve Vlkově bez ztráty – platně zaseto na dílech
  s klučením 52,8 → 53,3 ha); pás s nevyklučeným dílem a s díly bez klučení (louka, díl v osevu)
  se rozdělí – kus bez klučení se zorá hned, kratší brázdou, pole pásů zůstane v pořadí orby. Rádlo, motyka a setí v práci dne nevyklučený díl
  přeskočí a pokračují dalším připraveným dílem v pořadí: každý den jdou nezačaté díly, které na
  vyklučení čekají, v pořadí za připravené (louky, díly v osevu, vyklučené díly) – spřežení tak
  nečeká, dokud má co orat. Obě skupiny drží dosavadní pořadí, vracení přílohu jde dál po dílech
  s klučením v témže pořadí. Pořadí přílohů (úzké hrdlo), čelo práce po zdrojích a setí zoraného
  před klučením zůstávají. Co zbývá, je ve Známém dluhu (účtování práce po dílech). Dřív rádlo i setí šly po dílech v pořadí práce
  a na vyklučení nečekaly (Vlkov 10 let: zoráno před vyklučením 33 ha, zaseto 30 ha – historie).
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
  - přílohy ≥ 95 % – **napřed stadium nejlevnější na tom, co vsi chybí** (Martin 22. 11. 2026:
    „Obecně se drž pravidla vyprodukovat co nejvíce za co nejmenší množství práce.“ – viz Pořadí
    dávek, přílohy podle úzkého hrdla: když chybí spřežení, křoví a mladý les před loukou, když
    chybí lidé, louka před křovím a mladým lesem; bloky se dělí podle pořadí stadia a levnější
    stadium všech hospodářství jde před dražším kteréhokoli z nich); v každém stadiu nejdřív bez
    přílohu před sebou (sedlák nejde přes úhor), pak úseky, které se už osévají (ves úsek dokončí
    – vnější část úseku se oseje rok po vnitřní), pak nejvíc odpočaté (dřív nejmladší příloh)
    a nejblíž domu,
  - přílohy 70–95 % – stejně po pořadí stadia; v každém stadiu nejvíc zotavené, pak bez přílohu
    před sebou, rozběhnuté úseky, nejblíž domu.

  Ves bez hospodářství bere přílohy po jednom ve stejném pořadí stadií.

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
  Uvnitř políček lesa platí sazba lesa za hektar (stromy v ceně). **Stavba v lese** (19. 10. 2026
  – Pole jako krajina, Stavby v lese) platí stejnou sazbu lesa za plochu lesa, kterou vyklučí
  (dřívější návrh „stromy po kusech na ploše 10 × 10 m“ by les vyšel ≈ 3× dráž než pro pole –
  ≈ 243 dospělých stromů na hektar × 3 čd); u zemnice v lese i s pruhem pod korunami ≈ 18 × 20 m
  ≈ 9 člověkodní, za ≈ 8 dospělých stromů dá klády.
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
  trávě; při malování pole přes les prosvítá obrys výběru přes koruny. **Paseka pod stavbou
  v lese** (19. 10. 2026): vyklučená plocha volně stojící stavby (i s pruhem pod korunami) je menší
  než políčko – plocha korun zapadne přesně podle jejího tvaru (`ClearedForest.areas`), kolem
  zůstane les; podrost lesa vsi pod stavbou neroste.

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
- **Pole uživí ≈ N lidí** (Martin, 24. 10. 2026 schválil Z5 z diagnózy růstu): v horní liště
  ikona lidí s číslem „lidí / ≈ N“ (např. „31 / ≈ 22“; Martin 24. 10. 2026: sloučit počet lidí
  a kolik ves uživí do jedné ikony) – kolik lidí uživí pole vsi v ustáleném oběhu.
  Tooltip: „Pole uživí ≈ N lidí“, pod tím ikona lidí s počtem lidí ve vsi (**červeně, když je
  lidí víc než N**), pole v oběhu a průměrná úrodnost. Výpočet (návrh Clauda, jádro
  `fieldCapacity`): pole v oběhu (osev, hotové k osevu a příloh, který nezarostl) ÷ oběh
  (`ROTATION_FACTOR`, dnes 7 / 2 = 3,5; od 26. 10. 2026 oběh **odpočatého dílu** – ozim 95 %, jař
  83 %, úhor zpět na 95 % – jak ho točí ustálená ves, dřív čerstvého 100 → 88 → 76 %) = osev;
  osev × čistá úroda při průměrné přirozené úrodnosti dílů
  (`netYieldPerHa`, vážené plochou) = roční úroda; ta ÷ úroda potřebná na jednoho průměrného
  člověka vsi (jeho potřeba z pole `fieldFoodShare` a pojistka zásob – `steadyHarvestKg`, tedy
  stejná pravidla jako `village-calculator.ts`) = N. Strop práce ve žních v čísle není.
- **Pole uživí podle dnešní půdy** (návrh Clauda, Martin 30. 10. 2026: „Ano, schvaluji obojí“ –
  [vojvodova rodina](lord.md), Dělení vsi): N dnes počítá s odpočatou půdou, jako by každý díl před osevem
  odpočinul na 95 %. Vyčerpaná ves (Vlkov 27. 10. 2026 – průměrný podíl úrodnosti dílů 0,64, pak
  až 0,38) tak vidí víc, než pole dají, a ikona zčervená, až když lidé hladoví. Hráč přitom podle
  ní pozná, kdy poslat syna s částí vsi pryč (Martin 30. 10. 2026: „To je ale rozhodnutí
  hráče“). Oprava: **N × min(1; dnešní podíl ÷ ustálený podíl)** – dnešní podíl je průměrný
  `fertilityShare` dílů v oběhu vážený plochou, ustálený podíl je průměr podílu přes periodu
  skutečné ustálené dráhy odpočatého dílu (`averageRotationShare`, z `FERTILITY`: osev 2 roky, příloh
  do ≥ 95 %; obnova se zaokrouhluje nahoru, takže start oběhu se posouvá 95 → 99 % a dráha se
  uzavře po 34 letech; dnes ≈ 0,85). Čerstvá pole (100 %) N nezvednou. Vlkov s podílem 0,64: ≈ 0,75 × N
  (64 → ≈ 48).
  Tooltip navíc ikona půdy s procentem (dnešní ÷ ustálený, nejvýš 100 %). Mění jen zobrazení –
  simulace číslo nepoužívá (`fieldCapacity` volá jen `lib/village-view.ts`).
- **Zakládání:** pole se zakládá jako stavba po dílech od obydlí – rozpracovaný díl se rozrývá
  po řádcích, stromy a kameny z hotového dílu zmizí.
- **Klik vybere díl, dvojklik celé pole** (Martin, 19. 10. 2026: „Když kliknu na pole, zobrazí
  se mi jen to jedno políčko s parametry. Když dvojkliknu, označí se celé pole jako teď.“):
  kliknutí na pole označí jen čtverec pod kurzorem (obrys čtverce, u natočeného pole natočený),
  druhé kliknutí do 400 ms na totéž místo (dvojklik) označí celé pole. Výběr se nezdržuje – první
  kliknutí vybere díl hned, dvojklik ho rozšíří. Obrys čtverců prosvítá přes obilí a stromy
  (uprostřed pole by ho jinak zakryla koruna vystouplého obilí). Dvojklik na obydlí, hřbitov
  a ostatní je jako kliknutí; při malování po čtvercích se nic nemění. Stejně sad – klik čtverec
  sadu, dvojklik celý sad ([orchard.md](orchard.md)). **Hřbitov zůstává celý** (návrh Clauda):
  hroby se plní po celém hřbitově (místo nejblíž obydlím), plot i jeho stav jsou celého hřbitova
  a hygienu hráč nevidí – čtverec hřbitova by ukázal jen počet míst.
- **Panel dílu** (klik – jen ikony s čísly a popisky jako v 0 A.D.; co na dílu je, píše název
  pod portrétem): **co na dílu je** – zralé obilí, zelené luštěniny, strniště, zoráno / zkopáno,
  mladý příloh, louka na seno, křoviny, zakládá se…; **výměra** (m² – výchozy a zabraná půda ji
  zmenšují); **úrodnost** dílu dnes (v popisku přirozená z krajiny – osev ji vyčerpává, ladem se
  vrací; jádro panelu dílu, proto se díl vybírá) a bonus z popela; **cesta z domu** (m po
  pěšinách – podle ní je práce dražší); **hospodářství** – ikona domu, ke kterému díl patří
  (viz Hospodaření podle polohy domů), kliknutím ho vybere; povrch založení, když to nebyla louka.
  Osetý díl: **letošní práce** – příprava půdy (kopání motykou, orba rádlem, rozrytí drnu přílohu
  – ikona motyky, nebo vola), setí s ikonou plodiny (ozim, jař, luštěniny) a sklizeň (srp
  s klasy), každá v procentech, jak k dílu došla práce (Postup práce po čtvercích), a kolikátý rok
  je díl v osevu. Příloh: roky ladem, roky bez pastvy a seče (zarůstání), jestli se na něm pasou
  stáda a kolik je posečeno. Zakládaný díl: průběh, zbývající práce a dospělé stromy, které dají
  klády. **Očekávaná úroda dílu** (návrh Clauda, 2. 11. 2026; viz Očekávaná úroda a jestli
  práce stačí níž) – ikona snopů s kg v řádku letošní práce a vedle ní varování, když práce do
  konce okna nestačí.
- **Panel pole** (dvojklik): výměra, úrodnost, kolik dílů se zakládá, je oseto a leží
  v přílohu podle stadia (mladý příloh, pastvina, křoviny, mladý les) – ikony a čísla; oseté díly
  podle plodiny (ozim, jař); **kolik z pole zarůstá** – ikona zarůstání (keř a mladá bříza)
  s plochou přílohu, který se poslední vegetační období nespásl ani neposekl, i toho, který už
  zarostl (viz Zarůstání). **Očekávaná úroda pole** – ikona snopů se součtem úrody jídla
  z osetých dílů (obilí a luštěniny; v popisku po plodinách, len zvlášť jako třený) a varování,
  když práce nestačí (návrh Clauda, 2. 11. 2026).
- **Očekávaná úroda a jestli práce stačí** (návrh Clauda, 2. 11. 2026 – první verze; dřív
  „později“): jen pro díly letošního osevu, které ještě nejsou sklizené; sklizený díl ani díl
  mimo osev úrodu neukazuje. Počítá se v jádře stejnými funkcemi jako sklizeň a pomoc rodiny
  vojvody – panel nic nového neodhaduje a simulace výhled nepoužívá.
  - **Úroda dílu** (kg – snopy obilí a luštěnin, u lnu třený len): úroda z dnešní úrodnosti dílu
    × co ji mění. V popisku úroda z úrodnosti a změny v procentech: **počasí, které už je vidět**
    (disasters.md – Kdy je vidět; dobrý rok přidá), **škoda zvěře** letos (jen obilí – wildlife.md),
    **kroupy, voda a smršť**, které letos přišly, a **nedodělaná práce** – setí a pletí, jejichž
    okno skončilo nedodělané (ubírá jako při sklizni). Na práci, jejíž okno ještě běží nebo přijde,
    se počítá, že se stihne – jestli ne, říká varování.
  - **Jestli práce stačí** – kroky přípravy půdy a setí (jedno okno: ozim do konce října, jař,
    luštěniny a len do konce dubna – vrácení a kopání napřed na podzim) a sklizně (ozim, luštěniny
    a len do konce července, jař do konce srpna i s výmlatem ozimu): zbytek letošní nutné práce
    proti volné práci vsi do konce okna i s pomocí cvičící rodiny vojvody, lidé i orba spřežení
    (stejně jako Kdy jde rodina na pole – lord.md; volná práce vsi bez otavy, porážky a výmlatu na
    osivo, které jdou před přípravou půdy, a jarní kapacita jen jednou – vracení a kopání jaře na
    podzim jen z práce září–listopadu po ozimu; návrh Clauda, 19. 11. 2026 – dřív se jaro počítalo
    dvakrát a varování pro jaro mohlo chybět). Když nestačí, ukáže díl ikonu práce
    s chybějícími člověkodny červeně a v popisku u kurzoru okna a kroky („Práce nestačí: příprava
    a setí do konce dubna – chybí 40 člověkodnů“). Díl hlásí jen kroky, které sám ještě nemá
    hotové (zasetý díl setí nehlásí); od 9. 11. 2026 hlásí všechny díly (jedna fronta – ~~díl
    nad potřebu varování nemá~~). Pod půl člověkodne se nehlásí.
  - Chybějící práce okna je za celou ves (plodiny okna se dělí o tytéž ruce), ne za díl – které
    díly na konci zůstanou, určí postup práce po dílech (díly nejdál od domu poslední).
- **Horní lišta:** zásoby obilí, volná společná práce za den, nasycení (barva ikony); výměra polí
  klesne, když díl zaroste lesem a vypadne z pole.
- **Vytyčení:** nově zadané pole je hned vytyčené – kolíky v rozích a po čtvercích a provázek
  po obrysu dílů, které se ještě zakládají (Martin: „Když někde zadám stavbu, ať se hned vytyčí
  provázkem a kolíky.“). Čtverec, na kterém osadníci začnou, se rozrývá po řádcích; hotové díly
  vytyčení ztratí.
- **Ve scéně** (podle 0 A.D., Martin: tvrdé pruhy brázd a vzcházejícího obilí byly „hnusné“):
  zem s měkkými brázdami (textura pole z 0 A.D.) natočenými podél delší strany pole (díl, který
  orá spřežení, podél své brázdy – oxen.md, Směr brázd po blocích), okraj
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
  **Řádky sena** (Martin, 19. 10. 2026, ke snímku posečené louky: „Proč jsou na tom ty čáry?“;
  k návrhu úpravy: „Udělej to tak, jak říkáš“; podrobnosti návrh Clauda): řádky jsou
  zelenožluté jako schnoucí seno (dřív skoro bílé), široké ≈ 1,1 m s měkkým roztřepeným okrajem
  do ≈ 2 m, vlní se a nejsou přesně rovnoběžné (rozestup 4,5 m ± 15 %), místy se trhají. Leží jen
  na čerstvě posečených dílech – seno v řádcích schne ≈ 3 dny (`SWATH_DAYS`), pak se shrabe do
  kupek; ve vsi podle dat jádra jsou řádky na rozpracovaném dílu a na dílech dnešní seče, ostatní
  posečené díly mají kupky.
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
  **Kulaté rohy** ([oxen.md](oxen.md) – Kulaté rohy; Martin, 19. 10. 2026): ve vsi, která letos
  orá rádlem (oxen.md – Jen rádlo: orá všechno, nic se nekope), mají všechna pole vnější rohy
  zakulacené obloukem o poloměru 5 m (do rohu se spřežení s radlicí v zemi nevejde); v rohu
  zůstane tráva louky a nestojí tam trsy. Vnitřní rohy a styk s jiným polem zůstanou jako dřív;
  pole vsi, která kope motykou, mají rohy ostré – i pole z doby před spřežením, dokud je ves
  neoře (stav vsi „letos orá rádlem“, ne paměť po dílech).
  **Kulatější pole** (Martin, 19. 10. 2026: „Také mi přijde, že jsou pole stále moc hranatá, na
  to, že by měla mít kulaté rohy podle toho, jak se spřežení otáčí.“; podrobnosti návrh Clauda):
  zakulacený je **každý vypouklý roh** obrysu – i schod tvaru L, kde úhlopříčný čtverec pole je
  (konec pásu orby – spřežení se otáčí na konci každého pásu, oxen.md – Co nejdelší brázda),
  poloměr dál 5 m (obrat spřežení). Okraj každého pole se navíc místy odsune až o 2 m dovnitř
  (vlna ≈ 14 m – nepravidelný obrys, hranice čtverců nejsou rovné čáry; kde pole navazuje na pole,
  okraj není). Souvrať jako pás trávy na koncích pásů ne: z výchozí kamery by udělala z polí
  rámečky ze světlých pruhů – obrys by byl ještě pravidelnější; souvrať se navíc nakonec zorala
  napříč.
  **Pod cestou obilí neroste** (Martin, 19. 10. 2026: „Vzrostlé obilí přerůstá cestu. Tam, kde je
  cesta, prostě obilí neroste.“; podrobnosti návrh Clauda – plochu dílu cesta od 19. 10. 2026
  ubírá, viz Cesta přes pole níž): pod pásem pevné cesty (vyšlapaná 1,9 m, vozová 2,6 m,
  upravená 3 m – šířka prošlapané trávy obtisku i s vlněním osy) a pod plácky rozcestí scéna
  nekreslí trsy obilí ani luštěnin, panáky, plevel, korunu porostu ani obtisk pole; za okrajem
  pásu se pole vrací do 0,8 m a koruna tam vystoupá ze země **svahem** jako na okraji pole (ne
  schodem – cesta ve vzrostlém obilí je úvoz, ne vyříznutý žlab). Totéž pod **pěšinou dne** –
  přes osetý díl je to úzká stopa (šířka podle stopy, okraj 0,5 m); lidé chodí nejkratší cestou
  přes pole (Martin), takže pěšiny pole viditelně člení. Maska jde ze stejných průřezů jako obtisk
  cesty (`ribbonTrack`, `track-mask.ts`); bloky polí (8 × 8 dílů) se přestaví jen při změně cest
  nebo nové síti pěšin (odloženě s přepočtem pěšin, nikdy za snímek) a jen ty, kudy pás vede.
  Kus pole, přes který pás vede, má jemnější síť koruny (≈ 0,47 m) a obtisku (≈ 0,94 m), jinak by
  úzkou stopu přerostla.
  **Cesta přes pole** (Martin, 19. 10. 2026: „Ano má. Ono to stejně ve výsledku bude tak, že
  pokud oráč narazí na cestu, tak spřežení otočí. Nebude pak moci vzniknout takový růžek…“;
  pravidla [roads.md](roads.md) – Cesta přes pole): díl přijde o plochu pod pásem pevné cesty
  a plácky rozcestí a kus pole, který cesta oddělí a který je menší než obrat spřežení (80 m²)
  nebo užší než 3 m, zůstane loukou – úroda i práce jen z obdělané části (`FieldPart.roadM2`
  odečtené z plochy). Scéna na odděleném kousku nekreslí obtisk, obilí ani korunu
  (`SceneFieldPart.roadCut`). Brázdy končí na cestě – spřežení se na ní otočí a přes ni neorá,
  pás přes cestu orá po kusech s vlastními obraty ([oxen.md](oxen.md) – Brázdy končí na cestě).
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
  hlad, nepasený příloh zarostl lesem a vypadl z pole (krátký řádek nahoře). Ústup pole stavbě
  obydlí či cestě panel Kronika neukazuje (Martin 14. 11. 2026: „nicneříkající“).
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

## Známý dluh

- **Orba, kopání a setí až po vyklučení** – vyřešeno 22. 11. 2026 (D116, Postup práce po čtvercích –
  Orba a setí až po vyklučení; dřívější znění v [historii](history/fields-history.md)). **Zůstává:**
  - **Účtování práce úlohy jedním číslem** s vahou dílu plocha × vzdálenost – přibraná dávka dílů
    s jinou prací posune polohy hotových dílů (vracení přílohu může couvnout a už zoraný díl ukázat
    jako nevyklučený, přeřazení začatého úseku připíše hotovou práci jiným dílům). Samostatná úloha
    později: účtovat práci po dílech.
  - **Přesun ozimu do jara** (`moveParts`) nepřemapuje úseky práce na nové pořadí dílů.

## Na stavitelovi

- Přesné vzorce včasnosti, rozdělení
  práce během dne a sezóny, pořadí osevu a zakládání dílů – tak, aby splnily cíle v Kalibraci.
- Krok simulace a dopočítání vsi (společně s populací; výsledek nesmí záviset na tom, kdy se
  dopočítává).
- Datový model stavu sídla nad krajinou a jak scéna přestaví dotčenou oblast (celé přestavění
  krajiny se zachováním kamery je přijatelné, pokud je dost rychlé).
- Podoba panelů a označování čtverců.

## Rozhodnutí

| Rozhodnutí                                                                                                                                                                                                                                                                | Kdo                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Pole = celá zemědělská půda; obdělává se jen část, zbytek ladem podle středověkých systémů                                                                                                                                                                                | Martin                                               |
| Zpočátku jen ruční práce; příliš velké pole ves neobdělá a část zarůstá                                                                                                                                                                                                   | Martin                                               |
| Pole jsou samostatná a společná pro celou ves; zakládá je hráč zvlášť                                                                                                                                                                                                     | Martin                                               |
| Pole se vyznačí volným obrysem na zemi; jde i do lesa, překážky prodraží založení                                                                                                                                                                                         | Martin                                               |
| Změna: pole se staví po čtvercích – políčkách krajiny (místo volného obrysu)                                                                                                                                                                                              | Martin                                               |
| Ves se zakládá zemnicí; pole přidá hráč, kdy chce (dřív zemnicí a prvním polem)                                                                                                                                                                                           | Martin (17. 10. 2026)                                |
| Odstraněné stromy a kameny zmizí natrvalo; dřevo do zásob až s mechanikou dřeva                                                                                                                                                                                           | Martin                                               |
| Hráč určuje, kde pole jsou a jak velká; kolik se oseje, rozhoduje ves podle potřeby                                                                                                                                                                                       | návrh Clauda, Martin potvrdil                        |
| Ležení ladem obnovuje úrodnost, osev ji vyčerpává; systém se časem zlepšuje                                                                                                                                                                                               | návrh Clauda, Martin potvrdil                        |
| Pole nahradí 85 %; nástroje a systémy uvolní práci                                                                                                                                                                                                                        | návrh Clauda, Martin potvrdil                        |
| Práce podle ročních období, sklizeň do zásob → nasycení                                                                                                                                                                                                                   | návrh Clauda, Martin potvrdil                        |
| ~~Úroda podle úrodnosti, práce a včasnosti; zarostlá půda → louka → les~~                                                                                                                                                                                                 | návrh Clauda, Martin potvrdil                        |
| Díly pole po políčkách krajiny; max 800 m od obydlí, min 0,1 ha                                                                                                                                                                                                           | návrh Clauda                                         |
| ~~Ceny založení: louka 40, křoviny 150, les 250 člověkodní/ha~~; tabulka překážek                                                                                                                                                                                         | návrh Clauda                                         |
| Křoviny = louka, kde keře po kusech stojí aspoň rozdíl sazeb; v lese stromy a podrost v ceně                                                                                                                                                                              | návrh Clauda                                         |
| Založení jako stavba ze společné práce, díly postupně od obydlí                                                                                                                                                                                                           | návrh Clauda                                         |
| Ves oseje k 1. 9. potřebu + 15 % (kalibrace z 10 %)                                                                                                                                                                                                                       | návrh Clauda                                         |
| ~~Příloh se neudržuje a zarůstá; nevybrané díly stárnou až v les~~                                                                                                                                                                                                        | návrh Clauda                                         |
| Práce za celou ves: pořadí, denní minimum, domácí výroba (jen práce, přenos max 60 dní)                                                                                                                                                                                   | návrh Clauda                                         |
| ~~Práce 200 člověkodní/ha~~, výnos 760 kg × úrodnost, osivo 175 kg, potřeba 180/140/100                                                                                                                                                                                   | návrh Clauda                                         |
| ~~Vymýcený les +20 úrodnosti na 3 roky~~; vzdálenost +1 % / 10 m                                                                                                                                                                                                          | návrh Clauda                                         |
| Společné zásoby vsi, ztráty 10 %, přídělový systém, start se zásobami na 18 měsíců                                                                                                                                                                                        | návrh Clauda                                         |
| ~~Přirozená louka nezarůstá; les z náletu ve scéně jako mladé stromky~~                                                                                                                                                                                                   | návrh Clauda                                         |
| Překážky jako verzovaná vrstva krajiny v `packages/game`; co je překážka a za kolik                                                                                                                                                                                       | návrh Clauda                                         |
| Hlad ves zmenší, ale nezničí; hájení chrání i před hladem (do 18. 10. 2026)                                                                                                                                                                                               | návrh Clauda                                         |
| Lidé umírají hlady, ves může vymřít ([populace](population.md))                                                                                                                                                                                                           | Martin (18. 10. 2026)                                |
| Výchozí osevní systém: přílohová soustava raných Slovanů                                                                                                                                                                                                                  | Martin                                               |
| Úroda zatím bez náhody – dobré a špatné roky až s počasím (pak hájení i na neúrodu)                                                                                                                                                                                       | Martin                                               |
| Přílohová soustava: osev do 70 % úrodnosti (≈ 3 roky), příloh do 95 % (~~≈ 7 let~~), pořadí dílů                                                                                                                                                                          | návrh Clauda                                         |
| ~~Vrácení přílohu podle stadia: louka 40, nálet 60, křoviny 150, les 250 člověkodní/ha~~                                                                                                                                                                                  | návrh Clauda                                         |
| ~~Jedno obilí~~                                                                                                                                                                                                                                                           | návrh Clauda                                         |
| Ovládání (čtverce na mřížce, panely, vzhled) – ladí se na prototypu                                                                                                                                                                                                       | návrh Clauda                                         |
| Meze produktivity: čísla s rozpětím mají nejhorší mez (bez řemesel) a nejlepší (s řemesly)                                                                                                                                                                                | Martin (17. 10. 2026)                                |
| Zatím jen motyky; rádlo a voli později                                                                                                                                                                                                                                    | Martin (17. 10. 2026)                                |
| Polní práce 163 (s řemesly 100) člověkodní/ha: kopání 100 (50), pletí 8 (5), sklizeň 20 (15) + odnos 10, výmlat 15 (10) – od 25. 10. 2026; od 10. 11. 2026 sklizeň 15 (12) + odnos 8 (Zprůměrovaná žeň)                                                                   | Martin – oprava podle rešerše 17. 10. 2026           |
| Pletí jednou a rychle: jař, luštěniny a len v květnu (8 / 5, 10 / 6), ozim se neplete; plejí děti → ženy → muži (zbytek po ostatních úlohách)                                                                                                                             | návrh Clauda podle Martina 25. 10. 2026              |
| Pletí: ženy nesou 3/4 denního minima a plejí prací nad něj; muži plejí s rezervou (tempo žen a dětí × 0,8, bez posledních 5 dní okna)                                                                                                                                     | návrh Clauda                                         |
| Založení a vrácení přílohu: louka 100 (90), nálet a křoviny 100 (60), les 250 (150) člověkodní/ha                                                                                                                                                                         | Martin – oprava podle rešerše 17. 10. 2026           |
| Obnova v přílohu 2,5 % za rok – příloh 13 let, pole ≈ 5,3× osevu (rozhodnutí: 2 %, viz Přílohová soustava – k potvrzení)                                                                                                                                                  | Martin – oprava podle rešerše 17. 10. 2026           |
| Obnova v přílohu 5 % za rok (varianta 1): příloh 5 let, pole ≈ 3,5× osevu, oseto ≈ 2/7 („Ok, pojďme do varianty 1“); trojpolí až na konci 12. století                                                                                                                     | Martin 26. 10. 2026 (návrh Clauda: varianta)         |
| Vymýcený les +40 / +20 / 0 úrodnosti podle sezóny osevu, první sezónu bez pletí – i u dílů pole v lese                                                                                                                                                                    | Martin – oprava podle rešerše 17. 10. 2026           |
| Hrnčíř: ztráty zásob 10 → 5 %, denní minimum 0,5 → 0,45 (rozpětí návrh Clauda)                                                                                                                                                                                            | Martin – oprava podle rešerše 17. 10. 2026           |
| Křoviny bez řemesel stejně drahé jako louka – povrchem křovin je čtverec s jakýmkoli keřem (keře v ceně)                                                                                                                                                                  | sloučení větví 18. 10. 2026 (z čísel rešerše)        |
| Ozim a jař: ozim kopán a set v září–říjnu, sklizeň v červenci; jař kopán na podzim (zbytek na jaře), set na jaře, sklizeň v srpnu                                                                                                                                         | návrh Clauda, Martin schválil směr 18. 10. 2026      |
| Podzimní kopání přednostně, na jaře jen zbytek (místo poloviny kopání na jaře)                                                                                                                                                                                            | návrh Clauda, Martin schválil směr 18. 10. 2026      |
| Ves k 1. 9. oseje ozimem, kolik podzim stihne (po sklizni jablek), zbytek jaří ve stropech jara a srpna                                                                                                                                                                   | návrh Clauda, Martin schválil směr 18. 10. 2026      |
| Stejné osivo a úroda, ~~pletí v květnu–červnu~~ (ozim se neplete – 25. 10. 2026), ~~výmlat v zimě~~; vymrzání až s počasím                                                                                                                                                | návrh Clauda, Martin schválil směr 18. 10. 2026      |
| Sklizeň ozimu do zásob 31. 7.; příděl počítá s ní, když uživí srpen                                                                                                                                                                                                       | návrh Clauda, Martin schválil směr 18. 10. 2026      |
| Díly hotové po 1. 9. jdou do jaře; sklizeň jablek před ozimem                                                                                                                                                                                                             | návrh Clauda                                         |
| ~~Na přílohu se pase – nálet ani les nebude; 1–2 roky mladý příloh, pak napořád pastvina~~                                                                                                                                                                                | Martin (18. 10. 2026)                                |
| ~~Vrácení přílohu nejvýš drn louky (100, s řemesly 90); staré díly v náletu či lese jsou pastvinou~~                                                                                                                                                                      | návrh Clauda (podle Martina)                         |
| Nepasený a nesečený příloh zarůstá (louka do 5 let, křoviny do 15, mladý les do 30), les z pole vypadne                                                                                                                                                                   | Martin (18. 10. 2026)                                |
| Roky 5 / 15 / 30 podle rešerše (Jelinčić a kol. 2023, Prach 2023); křoviny trnka, hloh, šípek, svída                                                                                                                                                                      | návrh Clauda (rešerše 18. 10. 2026)                  |
| Roční krok 1. 11., jen díl ladem celé vegetační období; pastva či seč nuluje jen ve fázi louky                                                                                                                                                                            | návrh Clauda                                         |
| Pastva po dílech od nejbližšího, díl nejvýš svou plochou; spásl se při polovině plochy; zbytek na loukách krajiny                                                                                                                                                         | návrh Clauda                                         |
| Vrácení podle stadia: louka 100 (90), křoviny 100 (60), mladý les 250 (150) a klády za dospělé stromy                                                                                                                                                                     | návrh Clauda                                         |
| Les vsi: 240 stromů/ha, dospělé od 15 do 70 let, kácí se na dřevo; pole ho vymýtí jako les, jiné stavby ne                                                                                                                                                                | návrh Clauda                                         |
| Starší vsi začínají počítat roky bez pastvy od zavedení pravidla                                                                                                                                                                                                          | rozhodnutí Clauda                                    |
| Seno na loukách zatím jen scéna – bez práce a bez sena v zásobách                                                                                                                                                                                                         | návrh Clauda                                         |
| Fáze závislé na člověku (kopání, setí, sklizeň) se mění po čtvercích, až k nim dojde práce                                                                                                                                                                                | Martin (18. 10. 2026)                                |
| Pořadí dílů nejblíž obydlím první (při shodě id), váha = práce dílu; vzejití a zrání podle kalendáře                                                                                                                                                                      | návrh Clauda                                         |
| Postavy pracují na dílech čela práce (rozdělení práce dne posílá jejich id)                                                                                                                                                                                               | návrh Clauda (podle Martina)                         |
| Pole ať není roztříštěné – vesničané hospodaří podle polohy domů (lány za usedlostmi, polnosti kolem samot)                                                                                                                                                               | Martin (18. 10. 2026)                                |
| Díl patří k nejbližšímu domu vzdušnou čarou; hospodářství a úseky se neukládají, odvodí se z polohy domů a čtverců                                                                                                                                                        | návrh Clauda (podle Martina)                         |
| Úseky od domu: prstence po 15 m, v každém tolik dílů po směru, kolik čtverců má první prstenec                                                                                                                                                                            | návrh Clauda (podle Martina)                         |
| Osev po blocích úseků od domu ven; bez přílohu před sebou a rozběhnuté úseky první; osev mezi hospodářstvími podle plochy                                                                                                                                                 | návrh Clauda (podle Martina)                         |
| Blok úseku celý do ozimu, nebo celý do jaře; práce po úsecích od domu ven                                                                                                                                                                                                 | návrh Clauda (podle Martina)                         |
| Navazující pole se počítají jako jedno – rozšíření, víc polí se sloučí do nejstaršího                                                                                                                                                                                     | Martin (18. 10. 2026)                                |
| Sloučení: díly i se stavem, jedna stavba založení, kronika a práce dne na nejstarší pole; výměra i s rozšířením                                                                                                                                                           | návrh Clauda                                         |
| Stará navazující pole se sloučí samy při načtení vsi (do nejstaršího)                                                                                                                                                                                                     | Martin (18. 10. 2026)                                |
| Převod starých polí bez příznaku „převedeno“ – souvislé skupiny stranou, pole z obrysu ne                                                                                                                                                                                 | návrh Clauda                                         |
| Obydlí jde stavět na pole – pole se zmenší o plochu domu                                                                                                                                                                                                                  | Martin (18. 10. 2026)                                |
| Pozemek sebere celý díl, obydlí bez pozemku průnik vyklízené plochy, díl pod 20 % zmizí; plán, úroda a založení úměrně                                                                                                                                                    | návrh Clauda                                         |
| Pole jako krajina – na pole smí cokoli kromě jiného pole                                                                                                                                                                                                                  | Martin (18. 10. 2026)                                |
| Sad, hřbitov a ohrada vezmou celý čtverec, modla a svatyně průnik půdorysu, jabloň a strom u cesty 20 m²                                                                                                                                                                  | návrh Clauda                                         |
| Nálet stromů u cest na poli jen na mezi (místa 2,5–4 m od osy); jabloně kdekoli podél cesty                                                                                                                                                                               | návrh Clauda                                         |
| ~~Luštěniny jako plodina na poli~~ (zrušeno 9. 11. 2026) kvůli bílkovinám (1,6 g/kg zůstává); maso mírně zvyšuje štěstí                                                                                                                                                   | Martin (18. 10. 2026)                                |
| Všechny stavby jde natáčet po 15°, plošné stavby každá ve vlastní natočené mřížce; pozemek se natočí celý, místo domu Tab                                                                                                                                                 | Martin (18. 10. 2026)                                |
| Mřížka na pole / sad (počátek, natočení 15–75°), čtverce v ní; krajina pod čtvercem 5 × 5 body; překryvy ze skutečných ploch                                                                                                                                              | návrh Clauda                                         |
| Navazování jen ve stejné mřížce; stavba přes pole v jiné mřížce mu vezme průnik; les vsi pole vymýtí jen po jeho čtvercích                                                                                                                                                | návrh Clauda                                         |
| Hřbitov a ohrada se natáčejí taky – hřbitov ve vlastní mřížce jako pole, ohrada jako čtverec natočené mřížky                                                                                                                                                              | Martin (19. 10. 2026), návrh Clauda                  |
| Ohrada bez volného středu (malování jednoho čtverce, střed ve středu políčka); model dat volný střed unese                                                                                                                                                                | rozhodnutí Clauda                                    |
| Luštěniny = hrách a čočka, jař se sklizní v červenci (od 9. 11. 2026 jen dorůstající ve starších vsích); úroda 0,8 obilí, osivo 150 kg/ha, práce a neopletý díl podle rešerše                                                                                             | návrh Clauda (rešerše)                               |
| Osev luštěniny úrodnost vrátí o 0,03 (obilí −0,12); ztráta skladováním jako obilí                                                                                                                                                                                         | návrh Clauda (rešerše)                               |
| Obilí má přednost: luštěniny na díly výběru od domu, obilí doplní energii, luštěniny smějí jít na rezervu osevu, ne pod potřebu                                                                                                                                           | návrh Clauda                                         |
| Střídání: díly s loňskými luštěninami až nakonec; díly hotové během roku jen do jaře                                                                                                                                                                                      | návrh Clauda                                         |
| Osev podle stravy – ves seje obilí a luštěniny jen na energii, kterou nedá maso, mléko a sýr, vejce a ovoce                                                                                                                                                               | Martin (19. 10. 2026)                                |
| Podíl z pole za uplynulý hospodářský rok (potřeba, ne snědené obilí), pojistka 0,3                                                                                                                                                                                        | návrh Clauda                                         |
| ~~Rezerva jde do obilí – zásoby obilí na 1–1,5 roku potřeby z pole~~; výhled jídla s mlékem do sklizně                                                                                                                                                                    | návrh Clauda                                         |
| Osev podle zásob – ves si drží rozumnou zásobu na hubené roky, s velkou zásobou seje méně a staví                                                                                                                                                                         | Martin (19. 10. 2026)                                |
| Rozjetý plán se zkrátí hned, ne až 1. 9. – ves přestane kopat nové díly                                                                                                                                                                                                   | Martin (19. 10. 2026)                                |
| Zrající a zralé obilí vystouplé (dvouzrnka); kulaté rohy pole oraného rádlem                                                                                                                                                                                              | Martin (19. 10. 2026)                                |
| Ves se spřežením orá všechno, motykou nekope – i drn a louku při založení                                                                                                                                                                                                 | Martin (19. 10. 2026)                                |
| Pole jsou moc hranatá – kulaté rohy podle obratu spřežení                                                                                                                                                                                                                 | Martin (19. 10. 2026)                                |
| Zakulacený každý vypouklý roh (i schod L), poloměr 5 m; okraj místy o 2 m dovnitř; souvrať jako pás trávy ne                                                                                                                                                              | návrh Clauda                                         |
| Drn orbou křížem 2,5×; zaseje se, co spřežení zorají; ztráta spřežení – letošní plán dokončí motyka; rohy podle stavu vsi                                                                                                                                                 | návrh Clauda                                         |
| Koruna porostu 0,62 / 0,88 m, luštěniny 0,3 m, schod na čáře žně; roh 5 m jen vnější rohy oraných dílů, jen vzhled                                                                                                                                                        | návrh Clauda                                         |
| Pod cestou obilí neroste – pod pevnou cestou i pěšinou dne                                                                                                                                                                                                                | Martin (19. 10. 2026)                                |
| Řádky sena zelenožluté, širší, nepravidelné, kratší dobu – pak kupky                                                                                                                                                                                                      | Martin (19. 10. 2026)                                |
| Řádky ≈ 1,1 m (okraj do 2 m), rozestup ± 15 %, trhliny; seno v řádcích 3 dny, ve vsi jen díly dnešní seče                                                                                                                                                                 | návrh Clauda                                         |
| Maska v šířce obtisku cesty, okraj 0,8 m (pěšina 0,5 m) svahem; přestavba jen bloků u změněných pásů; jemnější síť pod pásem                                                                                                                                              | návrh Clauda                                         |
| Cesta dílu ubírá plochu a odřízne růžek, do kterého se nevejde obrat spřežení                                                                                                                                                                                             | Martin (19. 10. 2026)                                |
| Pás v šířce obtisku a plácky rozcestí; oddělený kus pod 80 m² nebo užší než 3 m loukou; i bez spřežení; přepočet při změně cest                                                                                                                                           | návrh Clauda                                         |
| Cíl = rok spotřeby z pole a pojistka po příští sklizni bez toho, co zbude; pojistka ~~0,3~~ 0,5 roční potřeby celé energie                                                                                                                                                | návrh Clauda                                         |
| Volná práce pro plán osevu po dospělých pasácích (se stády podle bílkovin)                                                                                                                                                                                                | návrh Clauda                                         |
| Přebytek nad pojistku za 3 roky, chybějící hned; luštěniny podle své zásoby bez rezervy; bez měření podílu podíl 1                                                                                                                                                        | návrh Clauda                                         |
| Zkrácení plánu denně 1. 9. – 30. 4. nad cíl + desetinu potřeby z pole; jen nezačaté díly od konce pořadí, ladem jako příloh                                                                                                                                               | návrh Clauda                                         |
| Klik na pole vybere díl s parametry, dvojklik celé pole jako dřív                                                                                                                                                                                                         | Martin (19. 10. 2026)                                |
| Panel dílu: co na něm je, výměra, úrodnost, cesta, hospodářství, letošní práce / příloh; hřbitov celý                                                                                                                                                                     | návrh Clauda                                         |
| Obydlí a ostatní stavby smí do lesa i na pole ve vymýceném lese – les se vyklučí                                                                                                                                                                                          | Martin (19. 10. 2026)                                |
| Les pod stavbou sazbou lesa jako díl pole (pařezy v ní), kolem volně stojící stavby i pruh 4 m pod korunami; na poli v lese nic                                                                                                                                           | návrh Clauda                                         |
| Plynulejší osev – každý rok zhruba stejně podle dlouhodobé spotřeby, zásoby pozvolna, pojistka platí                                                                                                                                                                      | Martin (19. 10. 2026)                                |
| Podíl z pole o třetinu rozdílu ročně; cílová zásoba pojistka + třetina potřeby z pole, odchylka po třetinách                                                                                                                                                              | návrh Clauda                                         |
| Na částech pole musí být zasetý len – plátno na spodní oděv                                                                                                                                                                                                               | Martin (19. 10. 2026)                                |
| Len 2 kg na dospělého (dítě 1), 550 kg/ha, okna luštěnin, −0,18 úrodnosti; od konce výběru, obilí ubere jen o své díly                                                                                                                                                    | návrh Clauda (rešerše)                               |
| Len napřed – „chybí len na oděv“ nemá chodit; len je povinný, i se zásobami pod pojistkou                                                                                                                                                                                 | Martin (20. 10. 2026)                                |
| Bez volné práce len vyhradí díly a práci před obilím; nevejde-li se díl, zkusí bližší či menší; jinak plán beze změny                                                                                                                                                     | návrh Clauda                                         |
| Zpracování lnu v domácí výrobě (přerozdělení); bez lnu jen štěstí až −4 a upozornění                                                                                                                                                                                      | návrh Clauda                                         |
| Osev podle růstu vsi – ves seje na lidi v době, kdy úrodu jí, ne na dnešní                                                                                                                                                                                                | Martin (19. 10. 2026)                                |
| Výhled po měsících: věk, běžná úmrtnost, porody manželských párů; do sklizně a rok po ní                                                                                                                                                                                  | návrh Clauda                                         |
| Pořadí práce: minimum, výpravy, potřebné úlohy, stavby, opravy obydlí, pole navíc, zbytek propadne                                                                                                                                                                        | Martin, 19. 10. 2026                                 |
| Zvířata (dojení, péče – ženy; pasení – výrostci) a domácí výroba bokem, mimo práci vsi                                                                                                                                                                                    | Martin, 19. 10. 2026                                 |
| Starší kryjí denní minimum své domácnosti (0,5 čd), dospělí dají zbytek; přebytek starších propadne                                                                                                                                                                       | návrh Clauda                                         |
| Osev navíc – bez staveb ves obdělá všechny díly, které smí osít (jen obilí); ruší „příliš velké pole“                                                                                                                                                                     | Martin (19. 10. 2026)                                |
| Díl navíc: ozim do 30. 10., pak jař; začatý díl – setí až výmlat potřebné, příprava půdy čeká na práci po stavbách                                                                                                                                                        | návrh Clauda                                         |
| Zkrácení plánu ubrané díly přesune do osevu navíc; volná práce v liště = práce pro stavby, před polem navíc                                                                                                                                                               | návrh Clauda                                         |
| Nouzový osev – když potřebný osev nevychází, ves smí osít i příloh pod 70 % (úroda podle úrodnosti)                                                                                                                                                                       | Martin (19. 10. 2026)                                |
| Nouzově jen obilí potřebného osevu, nejvíc zotavené první, jen s kladnou čistou úrodou; úrodnost nejvýš na nulu                                                                                                                                                           | návrh Clauda                                         |
| „Ves neoseje díly pod 40 % úrodnosti“ – nouzově jen příloh aspoň na 40 % přirozené, pod 40 % leží, dokud se nezotaví                                                                                                                                                      | Martin (19. 10. 2026)                                |
| „Pole, které zrovna neleží ladem: 0.5.“ – chůze přes díl v osevu 0,5× i pro vzdálenost práce, pěšina dne přes osev nezrychlí                                                                                                                                              | Martin (19. 10. 2026)                                |
| „Neber strniště jako louku, ale dej mu drobný postih. Ber to třeba jako 0.8.“                                                                                                                                                                                             | Martin (19. 10. 2026)                                |
| Denní minimum s přirážkou za chůzi pro vodu nad 100 m (cesty × 2 × chůze navíc ÷ 1 m/s ÷ 10 h), starší ji kryjí                                                                                                                                                           | Martin (19. 10. 2026), čísla návrh Clauda            |
| Výmlat hned po žni na humně – ozim a luštěniny v srpnu, jař v září; klasy se neskladují                                                                                                                                                                                   | Martin (20. 10. 2026)                                |
| Humno 12 čd výmlatu za den (≈ 60 ha osevu), humna se sčítají; žeň před výmlatem, zpožděný výmlat pokračuje                                                                                                                                                                | návrh Clauda                                         |
| Snopy, které se nemlátí, se kazí 10 % za měsíc; v okně výmlatu na řadu čekají bez ztráty                                                                                                                                                                                  | návrh Clauda                                         |
| Starší vsi rok odkladu – nouzový výmlat na udusané zemi +30 % práce, −10 % zrna                                                                                                                                                                                           | Martin (20. 10. 2026), čísla návrh Clauda            |
| Výhled jídla a plán osevu počítají snopy, jen když je ves smí vymlátit; plán odečte výmlat z podzimu a srpna                                                                                                                                                              | návrh Clauda                                         |
| Obilné jámy srpen–listopad po polních pracích, v zapečetěné jámě 3 % za rok; plán osevu ztráty jako doma                                                                                                                                                                  | návrh Clauda                                         |
| Osevní postup po dílech (po ozimu jař, po jaři úhor) a setí do konce okna místo plánu k 1. 9.; nad potřebu celá práce po stavbách                                                                                                                                         | návrh Clauda, Martin schválil (25. 10. 2026)         |
| Osivo ze zásob v den setí, sklizeň ho neodečítá; osivo do roční potřeby od přídělu 0,50, nad ni od 1; osivo v plánu se nejí (v hladu ano); luštěniny chybějící na osivo za obilí; start + osivo na půl roční potřeby; převod starých prací – osivo zaseté části odpuštěné | Martin (27. 10. 2026), pravidla a čísla návrh Clauda |
| Osivo pro ves bez zásob: osadníci nesou osivo na první osev (půl roční potřeby, 20 kg na nosiče, zbytek na voze); ves 1. 9. a 1. 3. koupí chybějící osivo za hřivny a krávy nad chovné (nejvýš jedna za nákup); to ves nesní (do 1. 6., při hladu ano)                    | Martin (27. 10. 2026), pravidla a čísla návrh Clauda |
| Zakladatelé první vsi: jídlo na 3 roky a osivo na 2 roky potřeby; osivo jen na setí, 15 let se neuvolní a cíle osevu ho nepočítají za jídlo                                                                                                                               | Martin (2. 11. 2026), čísla návrh Clauda             |
| Osev má přednost (Martin 6. 11. 2026): ves si do žní nechá jen přežívací zásobu (hlad do žní pod prahem úmrtí nejcitlivější skupiny bez 1 dne), ostatní zrno je osivo bez stropu podle jídla; co nezaseje, zůstane v zásobách                                             |
| Luštěniny z polí vyřazené – ves je nesel, výběr dílů je nepřidělí; zásoba luštěnin zůstává zbožím (strava, obchod, platby); zasetá luštěnina starší vsi doroste, nezasetý díl přejde do jaře; zahrádky u obydlí později                                                   | Martin (9. 11. 2026), převod návrh Clauda            |
| Díly jedna fronta (9. 11. 2026): výběr dílů bez stropu a bez potřeby úrody, všechna polní práce před stavbami, muži plejí až po stavbách; na řadě přílohy 70–95 % až po oseté řadě, nouzové jen při nedostatku                                                            | Martin (25. 10. a 9. 11. 2026), na řadě návrh Clauda |
| Pozdní léto (10. 11. 2026): žeň (ozim, jař) → len → otava → orba, příprava půdy a setí → …; len trhají ženy a děti napřed souběžně s koncem žní; ~~otava až po orbě a setí ozimu~~ (9. 11. 2026)                                                                          | Martin (10. 11. 2026, „Ano“ k návrhu Clauda)         |
| Zprůměrovaná žeň (10. 11. 2026): snopy zůstávají, sazba průměr žetí pod klasem a vázání snopů – srp a vázání 15 / 12, odnos 8 čd/ha (dřív 20 / 15 + 10)                                                                                                                   | návrh Clauda podle Martina (10. 11. 2026)            |
