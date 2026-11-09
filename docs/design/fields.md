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
    cesty. Kronika: pole ustoupilo sadu, hřbitovu, ohradě, modle, svatyni, jabloním nebo stromům
    u cesty. Pole leží na krajině pod ním – na čtverci pole v lese (vymýceném) stavby smí jako
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

### Osevní postup po dílech a setí do konce okna (25. 10. 2026)

Stav: **Martin, 25. 10. 2026:** „Tím pádem by teď ves měla vyrobit maximum obilí a maximum sena,
kolik jí umožňuje rozloha polí a množství lidí.“ – „Ne, stavby mají pořád přednost, ale vesničané
neví dopředu že budou něco stavět, takže ve chvíli, kdy stavba přijde, prostě vesnice o část úrody
přijde.“ – „Proč se pořád vymýšlí nějaký plán osevu 1. září?“ – a „Ano“ k návrhu Clauda níže.
K otevřené otázce dílu, který nestihl ozim (Martin, 25. 10. 2026): „Jestli bude možné mu dát
ozim, ať dostane ozim.“
Pravidla jsou **návrh Clauda, schválený Martinem 25. 10. 2026**; podrobnosti, které v návrhu
nebyly, jsou označené jako návrh Clauda. Implementace podle plánu
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
   - **První osev oběhu** – čerstvě založený díl a příloh odpočatý aspoň na 95 % přirozené
     (`FERTILITY.fallowReady`, Martin 24. 10. 2026): **ozim**, když na něj práce dojde v okně
     ozimu (vrácení přílohu, kopání nebo orba a setí září–říjen). Díl, na kterém setí ozimu do
     konce okna nezačne, se oseje na jaře **jaří**.
   - **Po ozimu jař** – díl se po sklizni ozimu (31. 7.) kope nebo orá na podzim po ozimu
     (září–listopad), zbytek v březnu–dubnu, a seje v březnu–dubnu. Jen když díl smí dál (aspoň
     70 % přirozené, `FERTILITY.sowableMin`) – odpočatý díl má po ozimu 83 %, mez se uplatní jen
     u dílů starších vsí, které se osévaly víc let v řadě.
   - **Po jaři úhor** – i po luštěninách a lnu. Úhor je příloh (Přílohová soustava, Příloh
     a pastva, Zarůstání beze změny): pase se, seče, zarůstá a vrací se mu 5 % přirozené ročně;
     odpočatý je zase na řadě s prvním osevem.
   - **Jař jako první osev – pak ozim** (Martin 25. 10. 2026: „Jestli bude možné mu dát ozim, ať
     dostane ozim.“): díl, který ozim nestihl a jako první osev oběhu dostal jař, dostane po její
     sklizni ozim, když smí dál (aspoň 70 % přirozené, `FERTILITY.sowableMin` – stejná mez jako po
     ozimu; odpočatý díl má po jaři 83 %), a teprve po něm jde do úhoru. Oběh je tak stejně dlouhý
     jako ozim – jař, jen v obráceném pořadí (95 → 83 → 71 %). Když ani tenhle ozim do konce října
     nezačne, oseje se díl na jaře jaří (bod 2) a po ní jde do úhoru – v oběhu jsou vždy nejvýš dva
     osevy (návrh Clauda). Luštěniny a len jako první osev mají po sobě úhor (jsou místo jaře, ne
     zmeškaný ozim).
   - **Len je místo jaře** (do 9. 11. 2026 i ~~luštěniny od domu~~ – Luštěniny, zrušeno): bere
     díly na řadě s jaří od konce pořadí (nejdál od domu, jako dosud), dokud nepokryje svou
     potřebu (bod 3); zbytek je obilní jař. Když díly na řadě s jaří nestačí, vezmou i díly na řadě s prvním osevem (ty pak
     nejsou ozim – kopou se na podzim po ozimu a sejí na jaře). Plodinu určí ves, když díl
     přibude k letošní práci, a pak ji nemění – jen ozim, který do konce října nezasela, se oseje
     jaří (bod 2; návrh Clauda).
   - **Nouzový příloh** (40–70 %, Přílohová soustava – Nouzový osev) jen pro nutné díly (bod 3),
     jen obilí, jeden osev (ozim, nebo jař podle okna) a pak zase úhor.
   - **Kolik je čeho** (upřesnění „po ozimu jař, po jaři úhor“ podle dnešních čísel – návrh
     Clauda): oběh odpočatého dílu je ozim 95 → 83 %, jař 83 → 71 % a úhor **5 let** (71 → 95 %,
     obnova 5 bodů ročně – Martin 26. 10. 2026, viz Přílohová soustava), celkem 7 let; čerstvý díl
     100 → 88 → 76 % a úhor 4 roky. Ustálená ves má osetou **≈ 2/7 dílů v oběhu – ≈ 14 % ozim,
     ≈ 14 % jař (s luštěninami a lnem) a ≈ 71 % úhor** (dřív s obnovou 2,5 %: úhor 10 let, oseto
     ≈ šestina): plochu osevu určuje poměr ztráty a návratu úrodnosti (12 : 5), ne počet osevů. Třetiny (ozim, jař, úhor) by platily pro
     trojpolí s ročním úhorem, které tahle úrodnost neunese. Rozdíl proti dosavadnímu postupu:
     osévá se úrodnější půda (průměr 89 % místo 83 % přirozené – úroda z osetého hektaru ≈ +3–4 %),
     příloh se vrací po dvou osevech místo tří (vrácení přílohu na osetý hektar ≈ +50 %) a leží
     kratší dobu (5 místo 15 let – méně zarůstá). Po luštěninách (83 → 86 %) leží díl 2 roky, po
     lnu (83 → 65 %) 6 let.

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
     být nejvýš na `WORK_FRONT_DAYS` = 3 dny volné práce vsi po denním minimu (spřežení na 3 dny
     orby); další díl přibude, až čelo dávku dodělá – díl tak projde přípravou půdy až k setí,
     než ves vezme další. Na podzim brzdí ozim jen jeho vlastní čelo (len, luštěniny a jař
     s kopáním do listopadu ozim nepředběhnou). Žádný strop podle plánu: dokud je okno otevřené
     a potřeba trvá, ves bere další díly. Díly výběru, které na čelo ještě nepřibyly, počítá
     podíl vojvodovy rodiny jako práci, která zbývá (lord.md – Kdy jde rodina na pole).
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
     k domu, nouzové přílohy až po nich), v dávce ozim před jaří (jeho okno končí dřív). Dávka
     dne jde po úsecích od domu ven (Postup práce po čtvercích).
   - **Klády jen za skácené stromy** (Zarůstání): mladý les na přibraném dílu dá klády, až přes
     díl přejde čelo vracení přílohu – ne při přibrání. Vyklučený díl si to pamatuje: když ho ves
     uvolní (nezasetá jař 1. 5., velká zásoba), vrátí se jako příloh bez lesa a křovin a klády
     podruhé nedá.

3. **Nutné díly – práce proti hladu má přednost před stavbami:**
   - **Potřeba úrody** je dosavadní cíl osevu bez plánu: energie, kterou má dát příští sklizeň
     (`sowingTargets` – podíl jídla z pole, zásoby a pojistka, plynulejší osev, výhled lidí)
     a potřeba lnu na oděv; ~~cíl luštěnin~~ padl s luštěninami na poli (9. 11. 2026). Ves ji počítá ze
     stavu dne, kdykoli o dílech rozhoduje (každý den 1. 9. – 30. 4., jako dosud zkrácení plánu),
     ne jednou k 1. 9.
   - **Nutné díly** hospodářského roku (ozim zasetý na podzim, jař a len zasetý na jaře
     – sklizeň do 31. 8.): díly, na kterých už je letošní práce, a za nimi díly na řadě v pořadí
     přílohové soustavy po úsecích hospodářství od domu (díly po ozimu, čerstvě založené, odpočaté
     – nejmladší první), dokud jejich očekávaná úroda (plná práce, dnešní úrodnost – jako ji
     počítal plán) nepokryje potřebu úrody; len podle své potřeby. Když běžné díly
     nestačí, přijdou na řadu přílohy zotavené na 70–95 % a pak nouzové přílohy (Přílohová
     soustava – Pořadí, body 4 a 5; Nouzový osev viz bod 1). Všechna práce nutných
     dílů – příprava půdy, setí, pletí, žně, odnos a výmlat – je **potřebná sezónní úloha**
     (Práce, bod 3) a jde před stavbami.
   - **Díly nad potřebu** – ostatní díly na řadě, jen obilí (jako osev navíc): **všechna** jejich
     práce na poli – příprava půdy, setí, pletí, žně a odnos – jde až **po stavbách a opravách
     obydlí** (Práce, bod 6). Když stavba přijde, ves o část jejich úrody přijde – nevypletý díl
     dá jen část úrody (Pletí), co žně do konce okna nesklidí, propadne. Výmlat na humně je
     společný pro všechny snopy jako dosud (humno nerozlišuje, odkud snopy jsou; v okně výmlatu
     snopy nehnijí – návrh Clauda). **Asymetrie (návrh Clauda, 25. 10. 2026):** výmlat snopů
     z dílů nad potřebu je nutná práce před stavbami – úroda už je sklizená a snopy by po okně
     výmlatu shnily; pomocné ruce na žně (dílny a vojvodova rodina – Žně všemi rukama) ale
     pomáhají jen nutným dílům – žně nad potřebu dostanou jen práci, která po stavbách zbude, a co
     nesklidí, propadne.
     Nový díl nad potřebu začne, jen když po stavbách práce zbude
     (nejvýš jeden rozpracovaný na plodinu, jako osev navíc); spřežení orají napřed nutné díly,
     díly nad potřebu jen kapacitou, která zbude. **Změna proti osevu navíc:** setí až odnos
     začatého dílu nad potřebu už nemá přednost před stavbami (Martin 25. 10. 2026 – „ve chvíli,
     kdy stavba přijde, prostě vesnice o část úrody přijde“).
     **Výjimka – okno setí (Martin 6. 11. 2026: ves „oře a zasívá, dokud trvá časové okno pro
     orbu a zasetí, nebo dokud se neobhospodaří plocha, co se má obhospodařit, nebo dokud nedojde
     osivo“; oprava, návrh Clauda):** ve dnech, kdy okno setí plodiny běží (ozim září–říjen, jařiny
     březen–duben, po dlouhé zimě do 14. 5.), jde příprava půdy a setí jejích dílů nad potřebu
     i začátek nových dílů **hned za nutnými úlohami, před stavbami** – nutné díly napřed, pak nad
     potřebu; rozdělení na nutné a nad potřebu zůstává jen pořadím v rámci setí. Pletí, žně a odnos
     dílů nad potřebu a podzimní příprava jaře (mimo její okno setí) jdou dál až po stavbách.
     Stavba, která přijde v okně setí, tak počká na zbytek práce po setí – v říjnu a dubnu i stavba
     obydlí pro novou domácnost.
     Podrobnosti (návrh Clauda, Úloha 4 plánu): díly nad potřebu jsou díly na řadě s obilím
     (první osev, jař po ozimu, ozim po jaři) – přílohy 70–95 % a nouzové ne, ať ves nevyčerpá
     přílohy, ze kterých oseje příští rok. Berou se v pořadí přílohové soustavy od domu, po
     jednom na plodinu: další díl začne, až má rozpracovaný díl hotovou přípravu půdy (setí, pletí
     a žně hotových dílů mají přednost před novým dílem). Nový díl nad potřebu nezačne, dokud
     nutné díly čekají na čelo práce (Postup práce po dílech) – díly nad potřebu berou práci až
     za čelem nutných. Ozim nad potřebu, na kterém do konce října setí nezačalo, se oseje na jaře
     jaří nad potřebu (zkopaná část se počítá); jař nad potřebu nezasetá do konce dubna čeká na
     další sezónu – jako u nutných dílů. Přídělový výhled do sklizně (Ozim a jař) počítá jen nutný
     ozim – úroda nad potřebu není jistá, stavba ji může vzít.
   - **Díl, na kterém začala práce jako na nutném, nutným zůstane** – co ves začala proti hladu,
     dodělá. Díl nad potřebu se stane nutným, když potřeba vzroste (narození, díl zabraný stavbou,
     slabší úroda), v pořadí od domu – napřed díly nad potřebu, na kterých práce už začala (na čelo
     nečekají, plodina zůstává a hotová práce včetně setí jde s nimi), pak další díly na řadě
     (návrh Clauda). Díl, na kterém práce ještě nezačala a který ves už
     nepotřebuje, prostě čeká jako díl nad potřebu – zkrácení plánu odpadá. Nutný ho ves přestane
     brát, až když úroda nutných dílů převyšuje potřebu o víc než desetinu roční potřeby z pole
     (`FIELD_STORES.trimMarginYears`, jako dosud zkrácení plánu), aby díly mezi nutnými a nad
     potřebu nepřebíhaly den co den (návrh Clauda); nejdřív nouzový příloh, pak nejdál od domu.
   - **Vojvodova rodina** ([lord.md](lord.md) – Kdy jde rodina na pole, bod 1) pomáhá s prací
     nutných dílů, kterou ves sama do konce okna nestihne: podíl dne mužů rodiny se počítá každý
     den v oknech ze zbývající nutné práce okna a volné práce vsi do jeho konce (jako dosavadní
     jarní přepočet), ne z plánu.
   - **Páry k rádlům** ([oxen.md](oxen.md) – Kolik volů ves chce): tolik párů, kolik v oknech orby
     zorá všechny díly na řadě v příštím hospodářském roce – nutné i nad potřebu, ves chce zorat
     všechno (návrh Clauda) –, nejvýš `OXEN.maxPairs`; mění se jako dosud, až když potřeba trvá dva
     roky.

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
     k 95 % a v popisku „Osev za ≈ N let“. Osetý díl ukazuje **1. nebo 2. osev oběhu** (místo
     kolikátého roku v osevu). Díl nad potřebu má v popisku „Jen z volné práce – stavby mají
     přednost“ (dosud „čeká na volnou práci“).
   - **Panel pole:** vedle osetých dílů podle plodiny **na řadě** – počet dílů na řadě s ozimem,
     s jaří a odpočívajících; v popisku, kolik z dílů na řadě je nad potřebu. Upřesnění (návrh
     Clauda, 25. 10. 2026): na řadě jsou díly, které čekají mimo letošní práci (díly letošní
     práce ukazují plodiny), a nad potřebu díly, které ves z řady vzala k letošní práci nad
     potřebu.
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

### ~~Kolik ves oseje (rozhodují obyvatelé)~~

> **Nahrazeno 25. 10. 2026** osevním postupem po dílech (Osevní postup po dílech a setí do
> konce okna výše) – roční plán osevu k 1. 9., jeho kapacita, zkrácení i osev navíc se ruší;
> potřeba úrody (cíl podle stravy, zásob a růstu vsi) zůstává. Text níže je historie a platí do
> implementace.

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
  ještě nezačala práce, přesune do osevu navíc (viz Osev podle zásob).
- To je **potřebný osev** – aby ves neměla hlad; jeho práce má přednost před stavbami. Od
  Martinova rozhodnutí 19. 10. 2026 ves k tomu oseje i **všechny ostatní díly, které smí osít**,
  ale jen prací, která zbude po stavbách a opravách obydlí (viz Osev navíc níže). Ves bez staveb
  tak obdělá celé pole.

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
  doplní hned (od 19. 10. 2026 i schodek nad pojistkou po třetinách a seje podle dlouhodobé
  spotřeby – viz Plynulejší osev níže). **Proč:** osev tak neskáče rok co rok mezi nulou a plnou plochou – ves s velkou
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
- ~~**Zkrácení rozjetého plánu**~~ (nahrazeno 25. 10. 2026 – nezačatý díl, který ves nepotřebuje,
  čeká jako díl nad potřebu; Osevní postup po dílech)
  (dřívější zkrácení plánu v kroku simulace):
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
    (den, od kdy ležel ladem, i roky bez pastvy – `FieldPart.fallowBeforeSeason`, smaže se na konci
    hospodářského roku), ostatní od 1. 9. jako nevybraný díl. Od 19. 10. 2026 **čeká v osevu
    navíc** (Osev navíc výše) – na začátku seznamu, nejblíž domu první (ve výběru byl před
    ostatními); oseje se, zbude-li po stavbách práce. Nouzový příloh pod 70 % ubírá zkrácení
    napřed a do osevu navíc nejde.
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
  zásobami na cílové zásobě (`steadyHarvestKg` + `storesTargetKg` – Plynulejší osev).
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

#### Plynulejší osev

Stav: **Martin, 19. 10. 2026:** „Ano, plynulejší osev určitě.“ – k návrhu: ves seje každý rok
zhruba stejně podle dlouhodobé spotřeby z pole, zásoby vyrovnává jen pozvolna, práce bude celkově
stejná, ale rozložená rovnoměrně; pojistka proti hladu platí dál. Podrobnosti a čísla **návrh
Clauda**.

**Proč:** ve Vlkově kolísala práce na poli podle roku mezi 30 a 89 člověkodny na člověka. Osev
podle zásob seje na loňský podíl jídla z pole (se stády podle bílkovin kolísá rok od roku)
a každý schodek do pojistky doplní najednou – po roce s velkou zásobou zasel skoro nic, další rok
hodně, a v roce s velkou prací se nahromadila domácí práce, kterou ves dlouho doháněla.

**Pravidla** (`sowingTargets` ve `field-food.ts`, čísla `FIELD_STORES` v `rules.ts`):

- **Dlouhodobý podíl jídla z pole** (`FieldFoodYear.longShare`): k 1. 9. se posune o třetinu
  rozdílu k podílu uplynulého roku (klouzavý průměr ≈ 3 let); podle něj ves seje i počítá
  spotřebu do sklizně (pojistka podílu 0,3 platí dál). Starší ves začne loňským ročním podílem.
- **Úroda rok co rok** = tolik, aby při dlouhodobé spotřebě z pole a ztrátách skladováním zůstala
  k další sklizni **cílová zásoba** = pojistka (0,5 roční potřeby celé energie) + **třetina roční
  potřeby z pole** (`cushionYears` – pásmo nad pojistkou, ve kterém se schodek vyrovnává pozvolna).
- **Odchylka od cílové zásoby po třetinách** (`balanceYears` 3): přebytek i schodek, dokud je
  zásoba k příští sklizni nad pojistkou, ves vyrovná jen třetinou za rok. **Pod pojistkou** doplní
  chybějící do pojistky hned (beze změny) a zbytek do cílové zásoby po třetinách.
- **Zkrácení rozjetého plánu** (`plan-trim.ts`) počítá týž cíl – jen pokud plán převýší cíl o víc
  než desetinu roční potřeby z pole; cíl se během roku mění jen o třetinu odchylky zásob, takže se
  plán nekýve (zkracuje se jen tehdy, když ves opravdu nasbírala hodně navíc).
- **Cena:** cílová zásoba je o třetinu roční potřeby z pole vyšší než pojistka, ztráty skladováním
  z ní stojí ≈ 3 % práce na poli navíc (sondy kalibrace 43,1 → 44,6 a 68,2 → 70,7 čd na člověka
  za rok). Bez pásma (`cushionYears` 0, jen dlouhodobý podíl) byla změna práce z roku na rok
  medián 15,6 % místo 12,9 %.

**Naměřeno** (`measure-village.ts 20 20`, 19. 10. 2026, jen orientačně; v závorce před změnou):

| 20 vsí × 20 let, hráč staví (od 3. roku vsi)         | Plynulejší osev         | Před                |
| ---------------------------------------------------- | ----------------------- | ------------------- |
| práce na poli – průměr (čd na člověka a rok, medián) | 67,5                    | 64,1                |
| změna z roku na rok – medián / p90                   | **12,9 %** / **24,4 %** | 20,2 % / 34,9 %     |
| variační koeficient po rocích – medián / p90         | 26,3 % / 38,1 %         | 29,2 % / 35,5 %     |
| sondy startovní / plná – změna z roku na rok         | 4,2 % / 7,4 %           | 5,6 % / 7,7 %       |
| volná práce (podíl) – průměr, změna z roku na rok    | 5,9 %, 47 %             | 6,6 %, 55 %         |
| nasycení ≥ 0,95 celý rok – staví / nestaví           | 93,4 % / 99,2 % let     | 93,7 % / 98,9 % let |
| plná domácnost / startovní ves                       | 98,0 % / 100 % let      | 98,0 % / 100 % let  |
| zásoby po sklizni ÷ cíl (p10 / medián / p90)         | 0,63 / 0,93 / 1,15      | 0,72 / 0,98 / 1,18  |
| práce na obživu – startovní ves / plná domácnost     | 86,2 % / 86,8 %         | 85,9 % / 85,9 %     |

Variační koeficient zůstává vysoký kvůli růstu vsí (lidé, nová pole, oběh dílů) – plynulost
ukazuje změna z roku na rok. Nasycení u hráče, který staví, bylo pod 95 % už před změnou
(jiné změny větve – pasáci, orba rádlem, cesty).

**Vlkov** (kopie stavu z 3. 3. 770, 33 lidí, 3 137 kg obilí; DB jen čtená, 5 let bez zásahu
hráče): práce plánu k 1. 9. na člověka 64, 63, 52, 50, 50 čd (před změnou 73, 60, 56, 45, 48),
odvedená práce na poli po hospodářských letech 59, 62, 52, 40 (59, 60, 56, 47); hlad žádný.
Ves za těch 5 let nasbírala zásoby (obilí 3 137 → 6 400 kg) a podíl jídla z pole jí klesal
(0,72–0,77 → 0,60 – stáda), takže práce klesá v obou verzích; plán k 1. 9. kolísá méně.

#### Osev podle růstu vsi

Stav: **Martin, 19. 10. 2026:** „Ano, udělej to všechno“ – k návrhu, aby ves k 1. 9. sela na
počet lidí v době, kdy bude úrodu jíst, ne na dnešní. Odhad a jeho podrobnosti jsou **návrh
Clauda**.

**Proč:** úroda plánu z 1. 9. se sklidí za rok a jí se ještě rok po sklizni – do té doby děti
dorostou (dospělý jí 180 kg obilí ročně, dítě 100), narodí se další a ves, která roste, měla
pokaždé o kus méně, než potřebovala. Startovní ves (dva dospělí, děti 12 a 13 let) potřebuje
v roce po sklizni ≈ o čtvrtinu víc než k 1. 9.

**Pravidla** (`expectedYearlyFoodNeed` ve `food-outlook.ts`, `sowingTargets` ve `field-food.ts`):

- **Výhled lidí** po měsících z dnešních lidí: každý jí podle věku v daném měsíci (děti dorostou,
  dospělí zestárnou), ubývá běžnou úmrtností své skupiny (dítě ≈ 3,6 %, dospělý 2 %, starší 8 %
  ročně – bez přeplnění, hygieny a hladu) a manželské páry (žena 16–44, manžel ve vsi) mají děti
  podle plodnosti věku ženy (Růst populace). Sňatky, stěhování a hlad výhled nezná – je to jen
  plán osevu, lidé se jím neřídí; čistá funkce lidí a dne (deterministicky).
- **Do příští sklizně** (zásoby, které zbudou k 31. 8.) průměrná potřeba od dneška do sklizně,
  **úroda, pojistka a cílová zásoba** podle průměrné potřeby v roce po sklizni.
- Dnešní potřeba zůstává všude jinde (příděl, výhled jídla, stáda).

**Naměřeno** (`measure-village.ts 20 20`, 19. 10. 2026, jen orientačně; v závorce bez výhledu,
s nouzovou porážkou v obou): zásoby z pole po sklizni ÷ cíl v pásmu 79,7 % let (73,2 %), medián
0,90 (0,88); startovní ves zásoby po sklizni 2,80 (2,55) roční potřeby z pole; práce na poli
63,5 čd na člověka a rok (63,3), volná práce 6,2 (5,8); nasycení ≥ 0,95 celý rok 96,6 % let
(96,8 %), nejnižší nasycení roku p1 0,60 (0,56).

#### ~~Osev navíc~~

> **Nahrazeno 25. 10. 2026** díly nad potřebu (Osevní postup po dílech, bod 3) – všechna jejich
> práce na poli, i setí až odnos, jde po stavbách. Text níže je historie a platí do implementace.

Stav: **Martin, 19. 10. 2026:** „Vesničané se snaží vyrobit co nejvíce jídla (později přibudou
nejspíš i jiné suroviny), ale pokud se něco staví, tak čas věnují primárně té stavbě – zemědělství
jenom natolik, aby vesnice neměla hlad.“ Martin schválil návrh, podrobnosti jsou **návrh Clauda**.

- **Potřebný osev** je beze změny plán k 1. 9. – cíl podle zásob, kapacita plánu, luštěniny a len
  podle potřeby, zkrácení rozjetého plánu. Jeho práce má přednost před stavbami (Práce, bod 3).
- **Osev navíc** = ostatní díly **v oběhu** – osévaný díl, který smí dál (aktuální úrodnost aspoň
  70 % přirozené), čerstvě založený díl a příloh odpočatý aspoň na 95 % (Martin 24. 10. 2026;
  dřív i příloh 70–95 % – osev navíc ho vytěžil a ves pak neměla z čeho osít potřebný osev; nouzový
  příloh pod 70 % nikdy; platí všude, kudy díly do osevu navíc přijdou – plán k 1. 9., zkrácení
  rozjetého plánu i jarní hotové díly), v pořadí výběru (Přílohová soustava –
  Pořadí, po úsecích hospodářství od domu ven), **jen obilí**. Dostanou jen práci, která zbude po
  stavbách a opravách obydlí (Práce, bod 6); spřežení orají napřed potřebný osev, díly navíc jen
  kapacitou, která zbude (a ne v den, kdy spřežení vozí). Bez kontroly kapacity plánu – je to
  práce „když zbude čas“.
- **Plodina:** díl navíc je napřed kandidát ozimu – dokud po dnešku zbývá den setí ozimu
  (do 30. 10.; zaseje se, co je zkopané do včerejška); potom jař v oknech kopání jaře (31. 10.
  – 30. 11. a 1. 3. – 29. 4., na jaře jen dokud po dnešku zbývá den setí). Příloh, který se musí
  vracet (drn louky, křoviny, mladý les), začne jen v okně vrácení (na podzim) – na jaře ves začne
  jen díly bez vrácení. Co ves do konce dubna nezačne, zůstane ladem jako příloh; od 1. 5. se
  seznam dílů navíc smaže.
- **Co ves na dílu navíc začala, dokončí jako potřebné:** jakmile na dílu začne práce (vrácení
  přílohu, kopání, orba), díl patří k ozimu nebo jaři plánu a jeho **setí, pletí, sklizeň
  a výmlat** jsou potřebná práce s předností před stavbami – zaseté obilí se vždy sklidí.
  **Příprava půdy začatého dílu** (zbytek vrácení, kopání a orby) dál čeká na práci po stavbách
  (rozhodnutí Clauda): jinak by malá ves, které po stavbách zbude méně, než stojí jeden díl,
  každý druhý den brala práci stavbám a volná práce v liště by skákala mezi nulou a zbytkem.
  Práce jde napřed na přípravu půdy začatých dílů, teprve pak na další díl – rozkopaný je tak
  nejvýš jeden díl na plodinu; co ves zkopala, zaseje, a co zasela, sklidí.
- **Volná práce** v liště je práce, kterou dostanou nebo by dostaly stavby – před polní prací
  navíc. Ves bez staveb tak neukazuje nulu jen proto, že práci vzala pole navíc; stojící stavby se
  poznají jako dřív.
- **Zrušené pravidlo:** dřív díly, které ves pro svou potřebu nevybrala, ležely ladem, i když
  měla volnou práci (Přílohová soustava – Příliš velké pole). Teď je bez staveb obdělá.
- **Úroda a zásoby navíc:** žádná nová pravidla – zásoby porostou (ztráty skladováním jako dřív)
  a příští rok díky nim potřebný osev klesne (osev podle zásob je odečte); osev navíc zase vezme,
  co ves stihne.
- **Ve hře:** díl navíc, na kterém práce ještě nezačala, vypadá jako příloh (díl, který se
  osíval, leží od 1. 9. ladem jako mladý příloh) a v datech panelu nese, že čeká na volnou práci;
  začatý díl postupuje jako ostatní díly plodiny (Postup práce po čtvercích). Díl, který se
  osíval, se po začátku práce osévá dál s tolika lety v řadě, kolik měl.
- **Starší vsi** (plán bez osevu navíc) dostanou osev navíc s dalším plánem 1. 9.; hotové díly
  (připravené), které ves během roku do plánu nevezme, čekají v osevu navíc hned.

### Přílohová soustava – co se oseje a co leží ladem

Výchozí osevní systém je přílohová soustava raných Slovanů (Martin). Pravidla (návrh Clauda):

- ~~**Osev:**~~ (od 25. 10. 2026 ozim, jař, úhor – Osevní postup po dílech, bod 1)
  díl se osévá rok po roku, dokud jeho aktuální úrodnost neklesne pod **70 %**
  přirozené. Osetý rok ji sníží o 12 % přirozené, takže čerstvý díl se oseje **3 roky** po sobě
  (100 → 88 → 76 → 64 %). Pak jde do **přílohu**.
- **Příloh (od 26. 10. 2026 obnova 5 bodů ročně):** ustálená ves síje odpočatý díl: ozim a jař
  (úrodnost 95 → 83 → 71 %, průměr osevu 0,89) a pak leží **5 let** (z 71 % na 95 %): oběh 7 let,
  pole **≈ 3,5× osevu** (`ROTATION_FACTOR` = 7 / 2, `SOWN_ROUNDS`), oseto ≈ 2/7 polí (dřív 10 let
  ladem, 5,0× a ≈ 1/6). Martin 26. 10. 2026: „Teď si musíme vystačit s dvojpolím a zkalibrovat to,
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

Navazuje na pracovní sílu z [populace](population.md) – Práce (na polích a stavbách jen dospělý
1 člověkoden za den; starší 0,5 jen na denní minimum své domácnosti, výrostci 7–13 let jen pasou).
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
   ([oxen.md](oxen.md) – Seno) a porážka s uzením ([diet.md](diet.md)).
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

| Práce                      | Kdy – ozim     | Kdy – jař                                   | Člověkodny / ha | Zdroj                 |
| -------------------------- | -------------- | ------------------------------------------- | --------------- | --------------------- |
| kopání motykou             | září–říjen     | podzim (září–listopad), zbytek březen–duben | 100 (50)        | Semjonov 1974         |
| setí a zahrabání           | září–říjen     | březen–duben                                | 10              | nedohledáno           |
| pletí (jen jař – jednou)   | neplete se     | květen                                      | 8 (5)           | Martin 25. 10. 2026   |
| sklizeň srpem a vázání     | červenec–srpen | srpen                                       | 20 (15)         | Halstead a Jones 1989 |
| odnos úrody v nůších       | červenec–srpen | srpen                                       | 10              | nedohledáno           |
| výmlat cepem a převívání   | srpen–září     | září                                        | 15 (10)         | Clark 2007 (EB 1911)  |
| **celkem na osetý hektar** |                |                                             | **163 (100)**   |                       |

Ozim a jař se liší kalendářem (viz Ozim a jař) a pletím – ozim se neplete (Pletí jednou a rychle);
ostatní sazby práce, osivo a úroda jsou stejné. Žeň ozimu (i luštěnin a lnu) jde v červenci, co
červenec nestihne, v srpnu, a mlátí se hned po žni – červencová v srpnu, srpnová v září (Žně
i v srpnu). Pletí dřív 30 (15) čd/ha v květnu–červnu (FAO).

Žeň 24. 10. 2026 zlevnila (Martin schválil, Žně všemi rukama): sklizeň srpem a vázání 30 → 20
podle [rešerše](research/2026-10-17-zemedelstvi-populace.md) (doporučení 3: ≈ 20), odnos v nůších
20 → 10 – návrh Clauda bez opory v rešerši (údaj se nepodařilo dohledat).

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

#### Žně všemi rukama

Ves v ideální krajině hladověla s volnýma rukama – úzká byla okna žní, na poli bylo jen 10 ze 17
dospělých (diagnóza 24. 10. 2026). Martin (24. 10. 2026): „Teď žije vesnice v ideální krajině …
vesnice populačně roste i bez zásahu hráče, za předpokladu, že má dostatečnou rozlohu polí.“ a ke
žním: „Dílny i vojvodova rodina.“

- **Žňový den** = den v oknech žní a výmlatu kterékoli plodiny (červenec – žeň ozimu, luštěnin
  a lnu; srpen – výmlat ozimu a luštěnin, žeň jaře a zbytku ozimu, luštěnin a lnu; září – výmlat
  jaře a srpnové žně – Žně i v srpnu), kdy má ves v okně ještě
  co sklízet nebo **opravdu jde mlátit** (snopy a humno s kapacitou, nebo nouzový výmlat; ves
  bez humna se snopy, které nesmí mlátit, žňový den nemá – řemeslo a výcvik běží).
- Ve žňový den jdou na žeň a výmlat i **řemeslníci se syny** ([crafts.md](crafts.md) –
  Řemeslníci na žních; řemeslo ten den stojí, ženy řemeslníků dál domácnost a lehčí práce) a
  **cvičící muži vojvodovy rodiny** ([lord.md](lord.md) – Kdy jde rodina na pole, bod 3; ženy
  rodiny dál jen domácnost). Mimo žňové dny dělají řemeslo a cvičí.
- **Výrostci a starší** (Martin 24. 10. 2026): výrostci od 10 let a starší dají ve žňový den po
  **0,5 člověkodne celkem** – vázání, odnos, paběrky ([rešerše](research/2026-10-17-zemedelstvi-populace.md)
  §5: dítě 7–13 let 0,3, starší 0,5). Chlapci a starší cvičící vojvodovy rodiny ne (cvičí, kryjí
  dvorec). Je to **celkem** 0,5 čd, ne navíc k tomu, co už dělají: starší, kteří kryjí denní minimum
  domácnosti, žeň nepřidají (dají jen to, co jim nad minimum zbude), výrostek pasoucí stáda dá
  žeň jen do 0,5 čd (po odečtení pasení). Cvičící muži vojvodovy rodiny na poli ve žňový den
  nejezdí na koních (kůň stojí).
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
  nestačí „Humno nestačí na výmlat“ – jen když humno stálo celé okno výmlatu). Výhled jídla, plán
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
    v **březnu–dubnu**, sklizeň v **srpnu**, výmlat v **září**.
  - Pletí jen jaře v **květnu**, ozim se neplete (Pletí jednou a rychle, Martin 25. 10. 2026).
    Stejné osivo (175 kg/ha), stejná úroda i ostatní sazby práce; vymrzání ozimu zatím ne
    (přijde s počasím).
- **Podzimní kopání:** díly v osevu se kopou na podzim (září–listopad); na jaře se kope jen to,
  co podzim nestihl – nahrazuje pevné dělení „polovina kopání na jaře“. Na podzim ves kope
  nejdřív ozim (musí být zasetý do konce října), pak jař.
- ~~**Ves rozhodne k 1. 9.**~~ (nahrazeno 25. 10. 2026 – plodinu určí postup dílu, Osevní postup
  po dílech, bod 1)
  při plánu osevu (viz Kolik ves oseje): díly bere v pořadí přílohové
  soustavy, dokud nepokryje cíl osevu (potřeba + rezerva, beze změny), a každý dá do **ozimu**,
  pokud podzimní práce stihne jeho vrácení z přílohu, kopání a setí do konce října (po sklizni
  jablek – ta jde v září–říjnu první, viz [sad](orchard.md)) a jeho sklizeň v červenci; jinak do
  **jaře**, pokud se jař vejde do zbytku podzimu (kopání), do jarní práce (setí a kopání, které
  podzim nestihl) a do srpnové sklizně. Co se nevejde nikam, ves letos neoseje. Seje se, co je
  zkopané do včerejška, proto plán v oknech setí (podzim ozimu, jaro) počítá s jedním dnem
  méně – zaseje se i pruh zkopaný poslední den. Sklizeň obilí v modelu končí 31. 8., takže do
  podzimní práce nic nepřetéká.
- ~~**Díly hotové po 1. 9.**~~ (nahrazeno 25. 10. 2026 – hotový díl je na řadě s prvním osevem,
  Osevní postup po dílech, bod 1)
  (do konce dubna) jdou do plánu jako jař, pokud se vejdou do zbývající
  práce – počítají se jen dny, které z oken ještě zbývají, a práce, kterou plán ještě má.
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
- ~~**Kolik ves oseje (k 1. 9.):**~~ (od 25. 10. 2026 zůstává cíl luštěnin jako potřeba, díly berou
  místo jaře od domu – Osevní postup po dílech, body 1 a 3)
  cíl luštěnin = kolik jich ves chce sníst za rok bez toho, co ze
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
- **Zásoba luštěnin** (kg): sklizeň **31. 7.** (po jídle dne, jako ozim; co červenec nestihne,
  se trhá v srpnu a do snopů jde 31. 8. – Žně i v srpnu), nevymlácená část se
  1. 3. zkazí jako u obilí. Ztráta skladováním jako obilí (10 %, s hrnčířem 5 % ročně – zrnokaz
     napadá semena na poli, ve skladu se nemnoží). Jí se rovným dílem celý rok do příští sklizně.
- **Ve scéně** hrách tvoří nízkou hustou rohož – zelený kvetoucí v květnu–červnu, zralý hnědý
  v červenci; po sklizni místo panáků hromádky vytrhaného hrachu a skoro holá zem. Panel pole
  ukáže díly luštěnin (ikona a počet).

### Len

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
- ~~**Kolik ves oseje (k 1. 9.):**~~ (od 25. 10. 2026 zůstává potřeba lnu, díly berou místo jaře
  od konce – Osevní postup po dílech, body 1 a 3)
  cíl lnu = potřeba vsi na rok. Ves nejdřív vybere obilí na celý cíl
  osevu, pak len dostane díly toho výběru **od konce** (nejdál od domu – jeho delší příloh pak
  neleží domům v cestě; díly, které měly len loni, až nakonec; když se práce dílu nevejde – třeba
  sklizeň jaře v červenci plném ozimu –, zkusí další díl) a obilí doplní celou energii dílu (len se
  nejí); pak luštěniny od domu. Když obilí doplnit nejde (chybí půda nebo práce), **len ubere obilí
  nejvýš o svou plochu** (≈ 1–2 % osevu) – i se zásobami pod pojistkou (Len napřed). Když len
  potřebu ani tak nepokryje, jde **len napřed** – před obilím (Len napřed níž). Zkrácení rozjetého
  plánu (Osev podle zásob) ani osev navíc len neubírají. Díly hotové během roku jdou jen do jaře.
- ~~**Len napřed**~~ (od 25. 10. 2026 je díl lnu vždy nutný – Osevní postup po dílech, bod 3)
  (Martin, 20. 10. 2026: „Prosím tě, občas mi to píše chybí len na oděv“ – k pravidlu
  „na částech pole musí být zasetý len“; podrobnosti **návrh Clauda**). **Proč:** Vlkov (34 lidí,
  ≈ 40 ha polí, orá rádlem) měl od roku 786 skoro každý rok „Chybí len na oděv“ – 31. 7. sklidil
  0–18 kg lnu z potřeby 32–48 kg; plán k 1. 9. 799 neměl ani díl lnu. Ves seje obilí, kolik stihne
  práce (cíl osevu nepokryje): sklizeň ozimu zaplní červenec, jař srpen. Díl lnu za obilím se tak
  vejde jen výměnou za díl ozimu, a i to jen, když volná práce v červenci pokryje rozdíl (trhání
  lnu 55 čd/ha je pracnější než žeň ozimu) – a obilí, které za díl lnu ves hned doplní, uvolněnou
  práci zase zabere; po pár dílech se len nevejde nikam. Pokud plán obilí nedosáhl roční potřeby,
  zastavila len navíc i pojistka (len smí obilí ubrat jen ze zásob nad pojistku – a ty Vlkov
  neměl). Pravidla:
  - **Len je povinný** (oděv) a jde **napřed** – před luštěninami, osevem navíc i obilím, které
    na něj nezbude. Malý díl lnu dostane ves i se zásobami pod pojistkou: obilí za díl lnu
    ubere nejvýš o úrodu toho dílu (dřív jen ze zásob nad pojistku).
  - Když len za obilím potřebu nepokryje (ves nemá volnou práci), ves **vyhradí díly a práci lnu
    napřed** a obilí vybere až po něm na práci, která zbude. Kandidáti jako dřív – díly výběru
    obilí od konce (nejdál od domu napřed, bližší potom), za nimi ostatní díly od domu, díly s loňským
    lnem až nakonec, nouzový příloh pod 70 % ne. **Když se práce dílu nevejde, zkusí další –
    bližší (méně chůze) nebo menší.** Obilí přijde o práci, kterou len vezme – zhruba o plochu
    lnu (trhání je pracnější než žeň ozimu, ves bez volné práce v červenci proto ubere obilí až
    ≈ 1,6× víc, než by len dal obilím; u Vlkova 34–72 kg obilí ze 4–4,4 t plánu, 0,8–1,6 %).
  - **Ves, které len za obilím vycházel, má plán beze změny** (hlídá zlatý otisk v testech).
  - **Vlkov** (kopie stavu z 20. 10. 2026, 3 roky od 1. 9. 800): plán k 1. 9. má **9–10 dílů lnu
    (0,19–0,22 ha)** a 55–64 kg lnu z potřeby 53–60 kg (dřív 5, 1 a 0 dílů – 31, 4 a 0 kg) a 31. 7.
    sklidí celý – oděv má každý rok celý, „Chybí len na oděv“ už nepřijde. Obilí 1. 9. 803 o 148 kg
    (2,7 %) méně, lidí stejně.
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
    6. Mimo okno se osivo zvlášť nedrží.
       Nákup osiva (Osivo pro ves bez zásob) kupuje osivo na díly na řadě; osivo zakladatelů si ves
       při šetření přídělem nechá na díly na řadě příštího okna (návrh Clauda).
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
      (úlovek dne se nedá dopředu) – s těmi nepočítá, jsou rezerva navíc. K zrnu přidá ztráty
      skladováním do žní (zrno leží v průměru půl doby do žní). Dřív počítala jen s potřebou
      z pole (0,9 × denní potřeba z pole × (dny do žní − `slack`)) – mléko a maso byly rezerva navíc
      a ves s mlékem a masem si nechala víc zrna, než potřebovala.
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
    - **Ves si osivo koupí u sousedů** ([obchod](trade.md) – Nákup osiva): **1. 9.** (před setím
      ozimu) a **1. 3.** (před setím jaře) spočítá osivo nutných dílů plánu, které čeká na setí
      (bez dílů nad potřebu; chybějící luštěniny za obilí), a odečte osivo, které smí do země, i zrno
      a luštěniny v nevymlácených snopech (výmlat je dá – oprava, návrh Clauda 6. 11. 2026).
      Chybí-li aspoň 5 kg, koupí **jen chybějící osivo** – nejvýš kolik obilí sousedé letos ještě
      mají (po zlém roce kraje méně) – a zaplatí, **čím může bez ohrožení: hřivnami, pak kravami
      nad ty, které ves drží na mléko a voly** – jako porážka: chovné krávy (kráva na 2 domácnosti,
      s ohradou volů i krávy na obměnu volů) a krávy na telata do výcviku (`surplusCows`; **změna 2. 11. 2026**, návrh Clauda, Martin: „Ostatní jsi rozhodl dobře“ – dřív krávy nad dvě,
      TRADE.keepCows, takže ves v pasti osiva prodávala krávy, které drží na voly, a voli nikdy
      nevznikli), **nejvýš jednu za nákup** (SEED_BUYING.maxCows, návrh Clauda; cena jako v obchodu, po zlém roce kraje nižší). Jídlem ani voly neplatí.
      Přeplatek za poslední kus dá soused v obilí do zásob (k jídlu), kolik ho ještě má. Zboží se
      vymění hned (bez cesty nosičů). Nekoupí-li dost (nemá čím zaplatit, sousedé nemají), díly
      bez osiva **nezaseje** a kronika to zapíše (upozornění „Chybí osivo na setí“). Důvod
      v kronice: **platba**, když za ni ves dostane méně obilí, než sousedé mají, jinak **zásoba
      sousedů** (oprava 2. 11. 2026 – dřív „sousedé nemají“, kdykoli neměli celé chybějící
      množství, i když ves neměla čím zaplatit ani to, co měli).
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
  Když nevystačí, obyvatelé rozdělí to, co zbývá, rovnoměrně do sklizně – nasycení je podíl
  zásob a potřeby do sklizně (návrh Clauda). Ves tak hladoví postupně, ne ze dne na den.
  Příští sklizní je **sklizeň ozimu 31. 7.**, když ji ves čeká a podle odhadu uživí ves v srpnu
  do sklizně jaře; jinak sklizeň jaře 31. 8. (viz Ozim a jař).
- **Start:** osadníci přinesli zásoby na **18 měsíců** potřeby (návrh Clauda) a k nim osivo na
  první osev – **půl roční potřeby** (od 27. 10. 2026, kdy osivo bere setí ze zásob; návrh Clauda)
  – ves přežije i založení těsně po jarním setí.
  - **Zakladatelé první vsi – velká zásoba** (Martin 2. 11. 2026: „Ta úplně první ves –
    zakladatelé budou mít velkou zásobu jídla/osiva. Ber to analogicky, jako když přišel praotec
    Čech do Čech“; čísla návrh Clauda z měření správce): úplně první ves hráče (vojvoda
    s manželkami – [vojvoda](lord.md), Zakladatelé) přinese jídlo na **3 roky** potřeby
    zakladatelů a **osivo na 2 roky** potřeby (`FOUNDERS_STORES`; 5 dospělých × 180 kg = 900 kg:
    2 700 kg jídla a 1 800 kg osiva ≈ 10 ha osevu, dřív 1 800 kg celkem). Osivo je **jen na setí**
    (rezerva jako osivo osadníků – Osivo pro ves bez zásob), **15 let od založení** se neuvolní
    1. 6. ani 1. 12. a cíle osevu ho nepočítají za jídlo – slouží na víc osevů, dokud nedorostou
       první děti; sní se jen ve skutečném hladu. Ztráty skladováním (10 % ročně bez hrnčíře) jdou
       z celé zásoby obilí – rezerva osiva je nejvýš tolik, kolik obilí zbývá; za první rok tak ves
       ztratí ≈ 450 kg a jídlo bez sklizně vydrží kratší dobu než 3 roky. Proč: prvních ≈ 15 let pracuje jen 5
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
    (stejně jako Kdy jde rodina na pole – lord.md). Když nestačí, ukáže díl ikonu práce
    s chybějícími člověkodny červeně a v popisku u kurzoru okna a kroky („Práce nestačí: příprava
    a setí do konce dubna – chybí 40 člověkodnů“). Díl hlásí jen kroky, které sám ještě nemá
    hotové (zasetý díl setí nehlásí). Díl nad potřebu (jen z volné práce po stavbách) varování
    nemá – práci mu dají stavby, ne okno. Pod půl člověkodne se nehlásí.
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
| Polní práce 163 (s řemesly 100) člověkodní/ha: kopání 100 (50), pletí 8 (5), sklizeň 20 (15) + odnos 10, výmlat 15 (10) – od 25. 10. 2026                                                                                                                                 | Martin – oprava podle rešerše 17. 10. 2026           |
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
