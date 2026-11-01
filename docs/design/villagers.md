# Lidé ve vsi (postavy)

Stav: Martin schválil 18. 10. 2026 („Jo, postavičky vypadají dobře. Zapoj je do hry.“ – po
ukázce postav z 0 A.D.). Implementováno 18. 10. 2026: rozdělení práce dne v jádře
`packages/game/src/domain/village/labor-report.ts`, rozmístění postav
`apps/web/lib/scene/villager-plan.ts`, pohyb `villager-motion.ts`, vykreslení `villagers.ts`.

## Proč

Hráč má vidět, **kde ves dnes pracuje** – kam jde práce lidí, kterou počítá simulace (fields.md
– Práce). Postavy jsou jen zobrazení: **žádná nová pravidla**, nic z nich nejde zpět do hry.

## Co postavy znamenají

- **Jedna postava ≈ jeden pracující** (člověkoden dne). Postavy vycházejí z rozdělení práce
  posledního odsimulovaného dne – ze stejného výpočtu, který použila simulace (pořadí: denní
  minimum → výpravy → potřebné sezónní úlohy → společná práce do staveb → opravy obydlí; dojení,
  péče o zvířata a domácí výroba žen jdou bokem, mimo práci vsi, a ukazují se jen jako postavy –
  population.md, Práce).
- **Nejvýš 60 pracujících** – větší ves se poměrně zmenší. Lidé pracují pohromadě: v každé
  činnosti po skupinách až čtyř tam, kde je práce nejvíc (ne každý na jiném z desítek polí).
- **Stavba neroste sama od sebe** (Martin, 18. 10. 2026): u každé stavby, která dnes dostala práci
  (obydlí i první zemnice, přestavba, zakládání pole, výsadba sadu, hřbitov i rozšíření, modla
  a svatyně), stojí aspoň jeden člověk – i když by po zaokrouhlení, skupinách po čtyřech nebo
  omezení na 60 nikdo nezbyl (ubere se z největší skupiny). Dřevorubci u stromů vyhrazených pro
  stavbu jsou její stavitelé. Stavba bez dnešní práce neroste a nikdo u ní nestojí.
- **Kde kdo je:**
  - pole – řady lidí na osévaných čtvercích: okopávání motykou (kopání i vracení přílohu), setí
    z nůše, pletí v předklonu, žeň srpem; skupiny se po pár dnech posunou po poli dál,
  - odnos úrody – nosiči s nůší mezi polem a nejbližším obydlím (sklizeň 30 + odnos 20 člověkodní
    na hektar – fields.md) – po pěšinách, na vzdálený díl po pěšině k poli a pak přes pole,
  - zakládání pole – dřevorubci u stromů na zakládaném čtverci, ostatní okopávají drn,
  - výmlat – v zimě u vsi na udusaném místě mimo pole (cep zatím nahrazuje palička),
  - stavba obydlí – nejdřív dřevorubci u stromů vyhrazených pro stavbu (forest.md), přebyteční
    nosí dřevo ke staveništi; pak stavitelé kolem staveniště (v první čtvrtině kopou jámu),
    u polozemnice na pozemku uvnitř pozemku u domu a na konci u plotu,
  - opravy a přestavba – u obydlí, výsadba sadu – okopávání čtverců, které se sázejí, sklizeň
    a péče – pod jabloněmi, hřbitov – na obvodu ohrazovaných čtverců (nikdy na hrobech),
  - rudiště kováře (crafts.md – Uhlí a ruda kováře) – kovář a synové od 14 let stojí s motykou na
    valu nejčerstvější jámy čelem do ní; kdo kope, ví rozdělení práce (`LaborShare.ages` – věky),
  - domácí práce – ženy před vchodem, některé chodí kousek od domu (pro vodu a dřevo chodí
    provoz na cestách – níž),
  - nevyužitá společná práce – dvojice postávající u domů.
- **Venku je jen část domácí práce** (domácí výroba se dělá uvnitř – v létě polovina, v zimě
  čtvrtina) a v zimě jen třetina nečinných. V zimě je tak venku méně lidí: výmlat, kácení,
  stavby, péče o sad.
- **Navíc, mimo práci vsi:** starší u domů (na dva jednoho, nejvýš čtyři, v zimě polovina; šediny)
  a děti jako pasáčci – jedno u každého stáda, když ves děti má.
- **Vzhled:** muži a ženy podle činnosti (jádro pohlaví nezná – kromě pletí: podíl žen u pletí
  dospělých dává jádro, plejí napřed ženy vsi; seč hlavně muži – fields.md, Pletí jednou
  a rychle), oděv nebarvený, hnědý nebo okrový,
  vdané ženy s lněným nebo mořenou barveným šátkem. Pod každou postavou měkký stín. Postavy jsou
  stylizovaně o 20 % větší než skutečná výška (jako domácí zvířata), aby byly z kamery vidět
  (Martin, 18. 10. 2026); rozestupy se zvětšují s nimi.
- **Nikdo nestojí ve vodě, v domě, v jámě, na oploceném pozemku polozemnice ani na hrobech;** kdo chodí,
  obchází domy.
- **Vymřelá ves** (ani lidé, ani práce) – nikdo.

## Provoz na cestách

Martin (19. 10. 2026): „A další věc – chci vidět vesničany a vozy na cestách. Chci vidět
vesničany, jak chodí pro vodu nebo na pole. Pokud budou mít k dispozici vůz, ať na pole, pro vodu
nebo pro dřevěné uhlí jede vůz.“ Podrobnosti jsou návrh Clauda, jen zobrazení – pravidla (cesty pro
vodu a dřevo, vozy) už jsou v jádru.

- **Proč je dřív nebylo vidět** (Vlkov, 19. 10. 2026): pro vodu chodila jen každá třetí žena
  z domácí práce (v zimě se tak ven dostaly 1–2 postavy), na pole se nechodilo vůbec – lidé
  stáli rovnou v řadách. A Vlkov má 40 ha pole: čelo žně leží 350 m od domů, mimo rastr schůdné
  země kolem vsi (340 m), takže tam nestál nikdo. Nosiči úrody neměli cestu (z branky pozemku
  mezi sousedními pozemky, přes vodu rovně) a žali na poli.
- **Proud lidí, ne „ráno tam, večer zpět“:** herní den trvá ≈ 86 s, cesta k vodě skutečnou chůzí
  ≈ 10–15 minut. Lidé jdou po pěšinách přirozenou chůzí ve skutečném čase (jako zvířata a ostatní
  postavy); kolik jich je na cestě, určují cesty za den v simulaci jako proud – cesty dne vycházejí
  rovnoměrně za 15 minut (`TRAFFIC_DAY_S` 900 s), na cestě je tedy cesty × doba cesty ÷ 900 s lidí
  (Littlův zákon). U vzdálené vody víc, u blízké méně, vždy úměrně cestám.
- **Pro vodu** – 0,4 cesty na člověka domácnosti a den (`WATER_FETCHING.tripsPerPerson`), po
  pěšině domácnosti k vodě; s vahadlem a dvěma vědry tam i zpět (klipy `carry-water`
  a `water-idle` – ruce drží provazy), u vody chvíli stojí. Hlavně ženy a děti. **Ve dny, kdy vodu
  veze vůz v sudech** (wagons.md – Co vozy vozí), jde pěšky jen tolik, kolik vůz domácnosti
  nepřivezl (`SceneLabor.homes[].cartWater` – týž plán jako simulace, domácnostem nejdál od vody
  první).
- **K lesu pro dřevo** – cesty na domácnost jako síť pěšin (léto 0,5, zima 1,2); tam s prázdnýma
  rukama, zpět s otepí. Martin (24. 10. 2026): „Když jde někdo pro dřevo, tak musí dojít
  k nejbližší větší skupince stromů či okraji lesa, tam to nasbírat, a pak s tím dojít až domů.“
  Podrobnosti návrh Clauda: **cíl je nejbližší větší skupinka stromů nebo okraj lesa** – větší
  skupinka = aspoň 6 stojících dospělých stromů do 15 m od jednoho z nich (`WOOD_GROVE`; osamělý
  strom ani dvojice u cesty ne, okraj lesa podmínku splní vždy). Hledá se z vrstvy překážek se
  stavem vsi (pokácené a odstraněné stromy se nepočítají – kde ves les vykácela, jde se k novému
  okraji) do 250 m vzdušnou čarou od vchodu (`WOOD_SEARCH_M`); ze tří nejbližších skupinek
  a konce pěšiny pro dřevo ze sítě pěšin (okraj lesa z jádra) vyhraje nejkratší trasa po
  pěšinách. Postava se zastaví na volném místě na kraji skupinky, chvíli sbírá (shýbá se –
  klip `weed`, 12 s – dřív 6 s) a s otepí jde až domů. **Mez 400 m po pěšině** (dřív 220 m; `ERRAND_MAX_M`)
  – jádro chodí pro dřevo nejvýš za cenu `ERRAND_MAX_COST` 450 (cena ≥ délka, do kopce a lesem
  víc), dál méně často a proud se nekreslí.
- ~~**Na pole a zpět** – jedna cesta za den na člověkoden polní práce~~ – od 31. 10. 2026 proud
  na pole není (Martin 31. 10. 2026: „Ano“ – cesta na pole a domů je součást práce): pracovník
  jde ode dveří svého domu k řadě na poli a na konci činnosti domů (Činnosti od začátku do konce,
  úloha 4), nosiči úrody z domu k panákům a s nůší zpět.
- **Kolik nejvýš:** 24 lidí na cestách (`MAX_TRAFFIC`, nad to poměrně méně). Každý druh cesty,
  po které někdo chodí, má aspoň jednoho člověka. Vlkov (28 lidí, voda ≈ 500 m od domů) ve žních:
  7 pro vodu a 6 nosičů úrody, kteří teď chodí celých 470 m (dřív i 4 na pole); v prosinci 8 pro vodu
  a 1 pro dřevo; v létě s dvoukolákem, který vodu většině domácností přiveze, 2 pro vodu.
- **Lidé v proudu** jsou rozestoupení (fáze se zlatým řezem – přibude-li člověk, ostatní zůstanou,
  kde byli), doma mezi cestami na chvíli zmizí (zajdou dovnitř). Vyjdou z nejbližšího volného
  místa u vchodu – u pozemků vedle sebe i o pár metrů dál.
- **Pochůzka se dokončí** – Martin (24. 10. 2026): „Postavy musí svou činnost dokončit. Například
  ženy nesoucí vodu nesmí z cesty náhle zmizet, ale musí dojít domů a do toho domu vejít.“
  Podrobnosti návrh Clauda:
  - **Pochůzka je celý cyklus:** vyjde z domu (volné místo u vchodu) → jde k cíli → u cíle pracuje
    (voda – nabírá, dřevo – sbírá, milíř – chvíli postojí) → vrací se s nákladem → vejde do
    domu. Postava nikdy nezmizí ani neskočí uprostřed cyklu.
  - **Při změně plánu** (nový den, jiný počet lidí v proudu, jiná trasa, jiný člověk v postavě –
    los lidí je na každý den jiný): kdo je na cestě, svůj **rozběhnutý cyklus dokončí** po dosavadní
    trase a zmizí až ve dveřích; další cyklus jde podle nového plánu. Klesne-li proud, přebyteční
    svou cestu dojdou a zůstanou doma; stoupne-li, noví **vyjdou z domu**, až na ně podle fáze
    přijde řada (ne uprostřed cesty). Proud tak zůstane plynulý – nový člověk vyjde zhruba tehdy,
    kdy by vyšel ten předchozí.
  - **Nikdo dvakrát:** člověk, který dokončuje cestu, se v novém plánu ukáže až po návratu – na
    další cestu vyjde nejdřív s dalším cyklem, k jiné práci dojde od dveří.
  - První zobrazení vsi ukáže proud rozběhnutý (svět běžel i předtím) – lidé jsou na cestě všude
    po trase.
- **Schůdná země přes celou krajinu** (pole do 800 m od obydlí): buňky po 4 m se počítají až při
  prvním dotazu a pamatují se (`lazyWalkable`).
- **Nosiči kováře** (crafts.md – Uhlí a ruda kováře; Martin 20. 10. 2026: „Pokud má dostatečně
  starého syna nebo syny, pošle pro uhlí jeho/je.“) – další druh pochůzky: kdo dnes nese uhlí od
  milíře nebo rudu z rudiště (věky z rozdělení práce – synové 10–13 let jsou **menší postavy**
  dětí, synové od 14 a kovář dospělí), jde z kovárny po pěšinách k milíři či jámě bez nákladu
  a zpátky s košem (klip `carry`), u milíře a jámy chvíli nakládá, doma na chvíli zmizí. **Každý
  nosič je jedna postava** (nejvýš 3 na cestu – `fetchCarriers`), ne proud podle cest za den:
  syn nosí sám celý den tam a zpět a proud by z jednoho chlapce udělal deset. Kovář, který jede
  s vozem pro rudu, jde s vozem – pěšky se nekreslí.
- **Vozy** s vodou, uhlím, rudou a osivem jezdí po vozové síti tam a zpět tempem volů ve
  skutečném čase (svoz úrody dál v okně herního dne – ladicí); voda v sudech, uhlí a osivo jako
  zboží, ruda jako hromada rezavých hrud (wagons.md – Co vozy vozí).
- **Výkon** (Vlkov, Chromium s WebGL 2, M1 Pro): přestavba lidí po změně vsi 6–11 ms (dřív
  4–8 ms s polovinou postav – bez lidí na vzdáleném poli), zápis póz za snímek pod 0,1 ms; zoom
  bez nových dlouhých snímků. Trasy po pěšinách si hledání pamatuje.

## Pohřeb

Martin (20. 10. 2026): „Když je pohřeb, chtěl bych vidět průvod lidí na hřbitov a pak na hřbitově
hranici.“ Pravidla a časy obřadu jsou v [cemetery.md](cemetery.md) – Pohřeb ve scéně, tady jen
postavy (návrh Clauda, jen zobrazení).

- **Průvod** vychází od vchodu domu zemřelého po pěšinách a cestách k brance hřbitova a k hranici:
  vpředu **čtyři muži s márami na ramenou** (zemřelý zabalený v plátně – máry jsou samostatný
  díl, který se pohybuje mezi nimi), za nimi po dvou **domácnost zemřelého** a **1–2 lidé
  z každé další domácnosti** (pohlaví a věk z jádra – ženy v šátcích, starší s šedinami), nejvýš
  24 postav; **za vojvodu a jeho ženu celá ves**, nejvýš 40.
- Jde se pomalu (0,6 m/s, ke vzdálenému hřbitovu rychleji – nejvýš 1,1 m/s) skutečnou chůzí jako
  ostatní postavy; kdo se do řady ještě nevešel, čeká před domem a zařadí se, jak průvod
  postupuje.
- U hranice nosiči položí máry nahoru a ostatní obejdou hranici **do kruhu kolem ní** (ne na
  mohyly, ne na plot); stojí, dokud hoří. Druhý den, když uhlíky dohasínají, **odcházejí** –
  domácnost zemřelého po trase průvodu domů, ostatní od branky každý ke svému domu – a doma
  zmizí.
- Postavy pohřbu jdou **mimo rozpočet 60 pracujících**; ve dnech obřadu se o ně sníží počet
  pracujících postav (stavby si člověka nechají).
- Nosiči mají klip chůze – klip s rukama nahoře na márách by znamenal nové GLB postav (a další
  větve na postavách běží souběžně); přijde později.

## Svatba

Martin (GitHub issue #2, 20. 10. 2026): „Jako máme pohřeb, udělej i svatbu. Svatebčané půjdou na
některé z posvátných míst v okolí, kde budou oddáni.“ Místo, časy a kdo jde jsou v
[kinship.md](kinship.md) – Svatba ve scéně, tady jen postavy (návrh Clauda, jen zobrazení).

- **Průvod** od vchodu domu nevěsty po pěšinách k posvátnému místu: vpředu **nevěsta s věncem
  z kvítků v běleném lnu a ženich**, za nimi po dvou svatebčané v **pestřejších šatech** (barva
  instance). Nevěsta nebo ženich z okolí jde se svými lidmi od kraje mapy; obě skupiny dojdou
  naráz.
- U místa obřadu stojí svatebčané **v podkově kolem páru** a hledí na něj; pár hledí k modle,
  kmeni dubu, do háje nebo do ohně, pak k sobě. Po obřadu jde pár s domácností nového domova
  průvodem domů, ostatní každý ke svému domu, lidé z okolí spolu ke kraji mapy – a zmizí.
- Postavy svatby (klíč `wedding:`) jdou **mimo rozpočet 60 pracujících**; lidé vsi na svatbě ubírají
  z pracujících postav ve dnech, kdy jsou vidět. Svatebčan je **konkrétní člověk vsi** (Výběr
  postavy) – jde vybrat kliknutím; v panelu „jde na svatbu“, „je oddávána“ / „je oddáván“
  (nevěsta a ženich u místa obřadu), „stojí u obřadu“ a „vrací se ze svatby“. Lidé z okolí, kteří
  přišli s nevěstou nebo ženichem, nejsou lidé vsi a vybrat nejdou; nevěsta nebo ženich z okolí
  je od svatby člověk vsi.
- Věnec je kód vlasů v barvě instance (shader maluje kvítky po masce vlasů) – nový atribut
  vrcholů nejde (WebGPU – 8 vertex bufferů). Hudebníci nejsou – sada klipů nemá hru na nástroj.

## Výběr postavy

Martin (20. 10. 2026):

> „Jak moc náročné by bylo moci označit jednotlivé lidi ve vsi a vidět, co zrovna dělají?“

> „Já měl na mysli spíš jak to bude náročné z pohledu hry. Jestli to nezabije výkon. Stačí mi
> jenom vědět info typu - žena rolníka, jde pro vodu. kovář - jde pro uhlí, uhlíř - staví milíř,
> tesař - jde do vesnice XY pro kování k vozu (protože ve vsi není kovář)“

Na návrh zařazení: „Ano.“ Podrobnosti jsou návrh Clauda – jen zobrazení, pravidla simulace se
nemění.

- **Postava = konkrétní člověk.** Server posílá scéně úsporně lidi vsi (`SceneLabor.persons` – id,
  věk, pohlaví, domácnost a hotová role; `lib/person-view.ts`, ≈ 60 B na člověka) a scéna každé
  postavě dne přiřadí skutečného člověka (`villager-roster.ts`): nikdo není ve dvou postavách
  naráz, pohlaví a velikost postavy jsou jeho, vdaná žena nosí šátek, starší šediny. Přiřazení
  sedí s fakty dne – v tomto pořadí:
  1. průvod pohřbu (lidé za márami podle id z jádra, máry nesou muži vsi) a svatba (nevěsta,
     ženich a svatebčané podle id z jádra – jen ve dnech, kdy jsou vidět; lidé z okolí, kteří
     přišli s nevěstou nebo ženichem, nejsou lidé vsi),
  2. karavany – tesař nebo jeho syn na cestě pro kování (id z jádra – tam i zpátky je to on),
     nosiči a pomocníci u vozů výprav a nákupu (dospělí vsi); lidé, kteří se stěhují k sousedovi
     nebo od něj přicházejí, nejsou lidé vsi (postava je, vybrat nejde),
  3. synové kováře a hrnčíře, kteří nosí uhlí, rudu a hlínu (podle věku z jádra),
  4. výrostci 7–13 let, kteří dnes pasou (kolik – z jádra),
  5. lidé u spřežení a vozů (Výběr spřežení a vozu níž) – oráč a honák u každého spřežení
     s rádlem, vozka u každého zapřaženého vozu (vozka vozu výpravy jde už s karavanou),
  6. domácnosti dílen, které dnes pracují v dílně, kopou nebo nosí – jen u své práce, do práce
     vsi ne,
  7. u každé stavby s dnešní prací první člověk, pak ostatní práce vsi (dospělí 14–44 let),
  8. provoz na cestách – člověk z domácnosti, od jejíchž dveří proud vychází (pro vodu i výrostci),
  9. domácí práce, dojení, péče o zvířata a nečinní – kdo zbude (u domu přednostně z toho domu),
  10. starší u domů (u svého domu).
- **Na koho nezbude člověk, ta postava není.** Domácí výroba žen jde bokem (mimo práci vsi)
  a postavy ji ukazovaly navíc – ve vsi s málo lidmi tak bylo víc postav, než mohlo být venku
  lidí. Teď je postav nejvýš tolik, kolik je lidí, kteří ten den můžou být venku; napřed odpadnou
  domácí práce a nečinní (Vlkov, 34 lidí, v den měření bez provozu na cestách 26 → 20 postav).
- **Deterministicky:** pořadí lidí je los ze seedu vsi a dne – během herního dne stejné.
  Přiřazení se počítá s rozmístěním postav jednou za herní den (a když dorazí síť pěšin – pak se
  přidá provoz na cestách), nikdy za snímek. Bez lidí ve scéně (dřívější pohled, vývojové
  ukázky) jsou postavy jako dřív a vybrat nejdou.
- **Role** (`lib/person-roles.ts`) z domácnosti, pohlaví, věku a příbuzenství:

  | Kdo                                                                    | Role                                        |
  | ---------------------------------------------------------------------- | ------------------------------------------- |
  | hlava dvorce (jako u mohyl: nejstarší muž od 14 let i ve stáří) a žena | vojvoda, vojvodova žena                     |
  | starší od 45 let                                                       | stařec, stařena                             |
  | dítě do 7 let                                                          | dítě                                        |
  | hlava dílny – nejstarší muž 14–44 s praxí v řemesle, jinak nejstarší   | kovář, hrnčíř, uhlíř, tesař                 |
  | jeho žena, syn a dcera (i vnuci)                                       | kovářova žena, kovářův syn, kovářova dcera… |
  | hlava ostatních domácností – nejstarší muž 14–44 let, žena, děti       | rolník, žena rolníka, syn a dcera rolníka   |
  | žena bez manžela s dítětem                                             | vdova                                       |
  | manžel syna či dcery hlavy                                             | snacha, zeť                                 |
  | z okolí (nevěsta, ženich, od souseda) – jen když nic lepšího           | nevěsta z okolí, ženich z okolí             |
  | výrostek 7–13 let, který dnes pase                                     | pasáček, pasačka                            |

  Ostatní muži jsou rolníci, vdané ženy ženy rolníka, svobodné dcery rolníka.

- **Činnost** (`lib/person-activity.ts`) – krátká věta z úlohy postavy a úseku pochůzky: „jde pro
  vodu“ / „nabírá vodu“ / „nese vodu“, „seje“, „žne“, „seče“, „pase ovce“, „staví zemnici“,
  „kácí strom“, „nese uhlí od uhlíře“, „kope rudu“, „kope hlínu“, „staví milíř“, „hlídá milíř“,
  „rozebírá milíř“, „orá“, „vede spřežení“, „veze uhlí ke kováři“, „jde do vesnice Olšany pro
  kování k vozu“, „jde v pohřebním průvodu“, „nese
  máry“, „stojí u pohřební hranice“, „vrací se domů“, „jde na svatbu“, „je oddávána“ / „je
  oddáván“, „stojí u obřadu“, „vrací se ze svatby“, „odpočívá“. Jméno vsi se neskloňuje („do vesnice Olšany“). Postava, která vešla domů,
  je „doma“, karavana za krajem mapy „pryč – ve vesnici Olšany“; člověk bez postavy dne „doma“.
- **Výběr:** kliknutí na postavu ji vybere (`{ kind: 'person', id }`) – postavy mají přednost před
  stavbami pod nimi; hledá se nejbližší vidět postava ke kurzoru do 12 px od jejího průmětu od
  nohou po hlavu (`villager-pick.ts`, polohy z posledního zápisu póz). Vybraná postava má pod
  nohama žlutý kroužek, který ji sleduje. Když postava zmizí, výběr zůstane a panel řekne „doma“
  nebo „pryč“; Esc nebo klik jinam výběr zruší, zemřelý člověk výběr zruší sám.
- **Panel postavy** (jako ostatní, bez dalších slov): portrét podle pohlaví a věku (muž, žena,
  dítě, starší), role pod portrétem, činnost na jednom řádku, věk, tlačítko domu (vybere obydlí)
  a u pasáka ikona zvířete stáda. Ukázka `/dev/panels?panel=postava` (i `postava-tesar`,
  `postava-pasacek`), ve vsi `/dev/landscape` tlačítko **Lidé** (ukázkoví lidé po domech).
- **Výkon** (Martin se ptal výslovně; Vlkov 20. 10. 2026, Chromium s WebGL 2, M1 Pro): přiřazení
  jednou za herní den ≈ 0,03 ms (34 lidí), ves 10× větší ≈ 0,6 ms (cíl ≤ 2 ms); rozmístění postav
  i s přiřazením 0,8 ms (dřív 0,76 ms), přestavba lidí v prohlížeči po novém dni 3–5 ms jako dřív;
  zápis póz za snímek i s kroužkem ≤ 0,2 ms jako dřív; čas snímku a nejdelší snímek bez změny
  (klid 16,8 ms, nový den 116,7 ms před i po). Výběr jen při kliknutí (O(postav)), kroužek je
  jedna instance, žádný nový atribut na vrchol postav (WebGPU limit 8 vertex bufferů), stav
  vybraného člověka scéna hlásí jen při změně (vejde domů, vyjde, nový den). Lidé navíc ve
  scéně ≈ 60 B na člověka (Vlkov +2 kB).

| Rozhodnutí (návrh Clauda)                                                        | Proč                                                            |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Roli počítá server, scéna dostane jen hotovou                                    | úsporně (bez rodičů a manželů), stejná pravidla jako ve hře     |
| Postava bez volného člověka není                                                 | postava = člověk; dřív měla malá ves víc postav než lidí        |
| Pořadí: pevné místo dne → dílny → stavby → práce → cesty → domácí práce → starší | kdo co dnes dělá podle jádra má přednost, domácí práce je bokem |
| Lidé, kteří se stěhují k sousedovi nebo od něj, nejdou vybrat                    | nejsou lidé vsi                                                 |
| Hlava dvorce jako u mohyl (i starší), hlava dílny a rolníka 14–44                | vojvoda zůstává vojvodou, pracující řemeslník je dospělý        |
| Snacha a zeť navíc k rolím ze zadání                                             | žena syna hlavy by jinak byla „žena rolníka“ vedle matky        |
| Jméno vsi „do vesnice Olšany“                                                    | jména vsí nejdou skloňovat                                      |

### Výběr spřežení a vozu

Martin (20. 10. 2026):

> „nešlo mi kliknout na volské spřežení ani na člověka, co jej vedl“

Oráče, honáka a vozku nekreslí postavy vsi, ale spřežení s rádlem a vůz (plough-team-renderer.ts,
cart-renderer.ts) – proto nešli vybrat. Podrobnosti jsou návrh Clauda – jen zobrazení.

- **Klik na voly, rádlo nebo vůz** vybere spřežení (`{ kind: 'plough-team', team }` – pořadí
  spřežení dne) či vůz (`{ kind: 'cart', id }`); **klik na oráče, honáka nebo vozku** vybere
  člověka vsi (`{ kind: 'person' }`). Spřežení a vůz mají přednost před stavbami pod nimi;
  s postavou vsi rozhoduje bližší průmět ke kurzoru. Díly jsou pro výběr válce (vůl podél těla,
  rádlo s ojí, korba vozu i s nákladem, lidé jako čára od nohou po hlavu – `draft-pick.ts`)
  promítnuté na plátno, jen při kliknutí; u stejné vzdálenosti má člověk přednost před dílem,
  ve kterém stojí. Vůz za krajem mapy vybrat nejde.
- **Kroužek** (`selection-ring.ts`, jedna instance jako u postav) sleduje pohyb: kolem celého
  spřežení či vozu elipsa od hlav volů po oráče / zadek korby, pod oráčem, honákem a vozkou malý
  kroužek. Stav (co dělá) hlásí scéna jen při změně – i když je spřežení mimo záběr.
- **Lidé u spřežení a vozů jsou lidé vsi** (`planVillagersWithCrew`, `DraftCrew`): oráč je
  dospělý muž (jinak žena), honák výrostek nejblíž 12 letům (oxen.md – honáček; jinak dospělý),
  vozka dospělý muž. Spřežení a vozy jsou ve scéně vidět celý den, proto patří k lidem s pevným
  místem dne – hned po pasácích (vozka vozu výpravy s karavanou), před dílnami a prací vsi; jejich
  podíl práce (orba, svoz) už postavy nemá. Kolik spřežení a vozů je, řekne ves, která je kreslí
  (`VillageRenderer.draftCrews`). Bez volného člověka (malá ves) zůstane místo prázdné – klik na
  oráče pak vybere celé spřežení.
- **Co dělá** (`lib/draft-activity.ts`): spřežení „orá díl pole“, „jde na pole“, „přechází na
  další díl“, „vrací se do ohrady“, „stojí u ohrady“; oráč „orá“, honák „vede spřežení“, oba
  „vede spřežení na pole / do ohrady“. Vůz i vozka podle nákladu a úseku jízdy (k cíli, u cíle,
  zpátky, u ohrady): „jede pro uhlí k milíři“ – „nakládá uhlí“ – „veze uhlí ke kováři“ – „skládá
  uhlí“, snopy, seno, klády („veze klády ke stavbě“), ruda, hlína, voda („nabírá vodu“, „veze
  vodu“), osivo („veze osivo na pole“), jablka; výprava „veze zboží do vesnice Olšany“, „vrací se
  z vesnice Olšany“, za krajem mapy „pryč – ve vesnici Olšany“; vůz bez jízdy „stojí u ohrady“.
- **Panel spřežení:** portrét vola, „Spřežení“, co dělá, voli, tlačítka dílu pole, který orá,
  ohrady volů (voli venku patří ohradám v pořadí id – napřed volové vozů, pak páry spřežení),
  oráče a honáka. **Panel vozu:** portrét vozu, druh (dvoukolák, čtyřkolák), co dělá, stav vozu,
  voli, co právě veze (ikona – jen naložený), tlačítka ohrady a vozky. **Panel oráče, honáka
  a vozky** jako u ostatních lidí a navíc tlačítko spřežení či vozu. Ukázky
  `/dev/panels?panel=sprezeni` (i `vuz`, `vuz-stoji`, `postava-orac`, `postava-vozka`), ve vsi
  `/dev/landscape` – orba přes cestu, vozy ve svahu a karavana mají ukázkové lidi po domech.
- **Výkon** (Vlkov 20. 10. 2026 – den orby, kamera na spřežení, Chromium s WebGL 2, M1 Pro,
  dva běhy před / po / po s vybraným spřežením): nejdelší snímek v klidu 16,8 ms ve všech třech,
  nový den každých 5 s 116,7–133,4 ms před i po (přestavba vsi), zoom s novým dnem ≈ 400 ms před
  i po; spřežení, vozy a zvířata v ohradách za snímek p50 0,1 ms jako dřív. Postav ve vsi o dvě
  méně (20 → 18) – oráč a honák už nejsou zároveň jinde. Výběr jen při kliknutí (O(spřežení
  - vozů)), kroužek jedna instance, žádný nový atribut na vrchol (WebGPU limit 8 vertex bufferů),
    za snímek jen stav jednoho vybraného spřežení či vozu navíc.

| Rozhodnutí (návrh Clauda)                                               | Proč                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| Spřežení podle pořadí dne, vůz podle id                                 | spřežení nemá vlastní id (pár volů z ohrady), vůz ano        |
| Klik na voly / rádlo / korbu vybere spřežení či vůz, na člověka člověka | oba výběry se doplňují – tlačítka přecházejí mezi nimi       |
| Oráč, honák a vozka hned po pasácích                                    | spřežení a vůz jsou vidět celý den – musí u nich být člověk  |
| Honák výrostek nejblíž 12 letům, jinak dospělý                          | ve scéně je to honáček; jádro orbu počítá do práce dospělých |
| Spřežení na konci trasy „stojí u ohrady“                                | trasa končí u ohrady na cestě, ne uvnitř                     |
| Výběr spřežení zmizí, když se dnes neorá                                | spřežení není ve scéně; vůz zmizí s vozem (doslouží)         |

## Činnosti od začátku do konce (návrh Clauda; Martin 31. 10. 2026)

Stav: **schváleno** (Martin 31. 10. 2026: „Ano, začni“; nové animace: „Ověř 0 A.D., pak Blender“) – v kódu úlohy 1–6
(rozvrh, obsazení jako člověk → úloha, postavy podle rozvrhu, cesta na pole jako součást práce,
události přerušují, délky ze sítě pěšin); úlohy 7–10 (fáze, rekvizity, animace) jsou hotové
jako koncept ke schválení očima, úlohy 11–12 zbývají.

Martin (31. 10. 2026): „Nevím jak je to teď, ale obecně by měla být vizuální stránka oddělena od
herní mechaniky. Ve vykreslování by lidé měli dělat své činnosti od začátku do konce, bez ohledu
na to, že např. cesta pro vodu trvá třeba několik dní. Z hlediska hry by se to počítalo jako teď
tj. že to zabere jen malou část dne.“

Simulace se nemění – cesta pro vodu dál zabere malou část herního dne a nic ze scény nejde zpět
do hry. Mění se jen to, jak scéna z rozdělení práce dělá postavy. Podrobnosti jsou návrh Clauda.

### Jak je to dnes

- **Plán postav platí jeden herní den.** Klient se na ves ptá na začátku každého herního dne
  (≈ 86 s) a se změnou práce dne scéna postavy rozmístí znovu (`villagers.ts` – `rebuild` →
  `planVillagersWithCrew`): z rozdělení práce posledního dne (`SceneVillage.labor`) udělá postavy
  a každé přiřadí člověka (`DayRoster` – los ze seedu vsi **a dne**, zítra je tedy v „téže“
  postavě často jiný člověk).
- **Přes přelom dne vedou dvě záplaty:** postava, jejíž nové místo je 2,5–90 m od starého, tam
  dojde pěšky (`walkThen`, `WALK_OVER_M`); bližší se posune a **vzdálenější se na novém místě
  rovnou objeví**. Pochůzky (voda, dřevo, pole, nosiči) jsou cykly ve skutečném čase a rozběhnutý
  cyklus se dojde po staré trase (`carryErrands` – Pochůzka se dokončí výš); nový člověk v proudu
  vyjde ze dveří, až na něj přijde řada.
- **Tempo:** chůze 1,2–1,5 m/s (rychlost klipu × měřítko postavy 1,2). Cesta pro vodu 500 m tam
  a zpět (Vlkov) trvá ≈ 11–14 minut, tedy **8–10 herních dní** – za tu dobu simulace „udělá“
  ≈ 90 cest pro vodu. Proud to už dnes řeší poměrem: cesty jednoho dne se rozloží do 15 minut
  (`TRAFFIC_DAY_S`), na cestě je cesty × doba cesty ÷ 900 s lidí.
- **Pohřeb, svatba a karavany** mají vlastní čas: začnou se svým herním dnem a hrají se ve
  skutečném čase přes několik dní (pohřeb ≈ 3 minuty – scéna dostává pohřby posledních 7 dnů).
- **Co nesedí s Martinovým přáním:** každých 86 s se celé obsazení rozhodne znovu – lidé
  přeskakují mezi poli, z řady na poli se stane nosič vody a panel vybrané ženy během pár minut
  řekne „žne“, „doma“, „nese vodu“ a „seje“. Postava dnes znamená **práci dne**, ne člověka a jeho
  činnost. A není to ani čistá funkce času: `carryErrands` závisí na plánu, který prohlížeč viděl
  naposled, takže dva prohlížeče se chvíli liší.

### Divadlo – scénář, herci a činnosti

- **Scénář dává simulace:** rozdělení práce dne (`SceneVillage.labor`), lidé vsi (`persons`)
  a události (pohřby, svatby, požár, povodeň, výpravy, odchod). **Obsazení dne** z něj udělá scéna
  stejnými pravidly jako dnes (pořadí z Výběru postavy, `MAX_WORKERS`, proud podle
  `TRAFFIC_DAY_S`) – výsledek je ale **člověk → úloha** (`PersonJob` a místo), ne seznam postav.
- **Herec je člověk vsi napříč dny** – postava se váže na id člověka, ne na pořadí postav dne.
  Každý člověk má vlastní **rozvrh ve skutečném čase**: řadu celých činností.
- **Činnost** (Martin 31. 10. 2026): „Činnost typicky začíná tím, že postava vyjde z domu a končí
  tím, že postava do domu zajde (tím se zruší i případné označení, pokud se nejedná o vojvodu).
  To je typické období činnosti a u různých činností tak může být různě dlouhé.“ Jednotka
  přidělení je tedy **jedna činnost od vyjití z domu po návrat do domu**, po celou dobu tentýž
  člověk; při dalším vyjití se znovu rozhodne, kdo a co (podle obsazení dne, jaké je právě
  teď). Pevná „směna“ neexistuje.
- **Tři druhy činností:**
  1. **Pochůzka** – délka ze sítě pěšin, **vždy celá**: vyjde ze dveří → jde k cíli → u cíle
     pracuje → vrací se s nákladem → vejde. Voda, dřevo, nosiči úrody, nosiči kováře a hrnčíře,
     dřevo ke staveništi.
  2. **Práce na místě** – vyjde ze dveří → **dojde pěšky** (ode dveří, cesta na pole je součástí
     práce) → pracuje → **vrátí se domů**. Délka práce je los v rozsahu druhu (`WORK_RANGE_S`,
     návrh Clauda): řada na poli, stavba, kácení, sad, hřbitov, výmlat a dílna 3–8 minut, domácí
     práce u domu, nečinní, starší a cvičiště 2–5 minut. Místo se v průběhu práce posouvá
     s frontou práce (čtverec hotový → další, strom padl → další) – vždy pěšky.
  3. **Doma** – postava není vidět (zašla dovnitř), 30–90 s (los), pak vyjde znovu. Člověk, kterého
     obsazení dne nemá, zůstane doma.
- **Ve frontě je jen další činnost:** přelom herního dne rozběhnutou činnost nepřeruší. Když se
  člověk vrátí domů, další činnost se vybere **podle obsazení dne, který je právě teď** – ne
  podle dne, kdy na ni vznikla práce. Doslovná fronta (každý den přidá svou práci) by rostla ≈ 10×
  rychleji, než ji scéna stihne zahrát, a za skutečný den by scéna zaostávala o týdny.
- **Délka činnosti je čistá funkce** jejího druhu, losu podle člověka a začátku (Determinismus
  níž): pochůzka 2–14 minut (Vlkov), práce na místě ≈ 5–20 minut včetně chůze, nejdelší nosič
  úrody z dílu 800 m od obydlí ≈ 21 minut.
- **Úlohy u jiného objektu** – pasáček u stáda, oráč a honák u spřežení, vozka u vozu, první
  stavitel u stavby s dnešní prací – nemají losovanou délku práce: drží ji, dokud je obsazení
  dne dává (objekt je ve scéně celý den), pak jdou pěšky domů. Stavba tak dál „neroste sama od
  sebe“ (Martin 18. 10. 2026).
- **Příklad** (Vlkov ve žních): žena rolníka v 10:00 vyjde pro vodu (500 m). Vrátí se v 10:11 –
  mezitím uběhlo 8 herních dní a simulace přešla ze žně na výmlat – a vejde do domu (výběr
  postavy, je-li vybraná, se zruší). V 10:12 vyjde znovu, tentokrát podle dnešního obsazení
  jde k mlatu u vsi (150 m, 2 minuty), 5 minut pracuje a 2 minuty se vrací domů; v 10:21 je
  doma.

### Kolik postav a jak scéna nezaostává

- **Postava zastupuje práci, ne každý člověkoden.** Kolik lidí co dělá, určuje obsazení dne jako
  dnes (člověkodny → postavy, nejvýš 60 pracujících a 24 na cestách), ne počet pochůzek, které
  simulace za den udělá. Vlkov: ≈ 11 cest pro vodu za herní den, ve scéně 7 žen, které chodí jedna
  za druhou – za jednu jejich cestu simulace odbaví ≈ 90.
- **Scéna zaostává nejvýš o jednu pochůzku** (Vlkov voda 8–10 herních dní, blízké cíle 2–5 dní);
  práce na místě nejvýš o délku jedné činnosti. Nic se nekupí – kdo se vrátí, vezme si, co je teď.
- **Kdy se rozběhnutá činnost zkrátí nebo přeskočí:**
  - jiné místo práce (fronta pole se posunula, strom padl, stavba je hotová) – práce na místě
    pokračuje na novém místě, kam člověk dojde pěšky; **pěšky i dál než 90 m** (dnes se objeví),
  - jiné roční období nebo konec práce (doseto, dožato) – rozběhnutá činnost se dokončí
    (i práce na místě, nejvýš pár minut), další už se nevybere,
  - vůz přiveze vodu (`cartWater`) – rozběhnutá cesta pro vodu se dojde, další ne,
  - zbořený dům cíle – člověk dojde k místu dveří a zmizí (jako dnes),
  - smrt, odchod a další události – níž.
- **Člověk, kterého obsazení dne při vyjití nemá** (proud klesl, ves se zmenšila), dokončí rozběhnutou
  činnost a zůstane doma. Postav je tak nejvýš o pár víc, než dává obsazení, a jen po dobu jedné
  pochůzky.

### Události

**Přeruší hned** – člověk nechá činnost, kde je, a jde pěšky k události:

- **Pohřeb** (cemetery.md – Pohřeb ve scéně): lidé průvodu (id z jádra) dojdou k domu zemřelého;
  průvod nečeká – kdo nestihne vyjít s ním, dojde rovnou ke kruhu u hranice. Po obřadu domů a dál
  podle rozvrhu.
- **Svatba** (kinship.md – Svatba ve scéně): stejně – pár a svatebčané k domu nevěsty, opozdilci
  rovnou k místu obřadu.
- **Požár – hašení:** k řetězu s vědry jdou dospělí, kteří jsou ve vsi (doma, u domů, na mlatu);
  kdo je na vzdáleném poli nebo u vody, svou činnost dokončí – k ohni by nedošel, než dohoří.
- **Povodeň:** kdo má cíl nebo trasu na rozlité vodě, otočí se a jde domů; nové činnosti vedou jen
  po suché zemi (nikdo nestojí ve vodě).
- **Odchod do nové vsi:** odcházející jdou rovnou k vozům; kdo je daleko, dojde později po stejné
  cestě.
- **Karavana** (výprava, nákup, kování): nosiči, pomocníci a tesař jdou ke karavaně; karavana jede
  dál podle herního času.
- **Smrt:** postava zmizí hned (jako dnes) – mrtvý nechodí ani nejde vybrat.

**Nepřeruší:**

- **Noc** – trvá zlomek herního dne (kratší než jedna cesta k vodě) a zatím je jen
  v `/dev/landscape`; lidé dál pracují (Zjednodušení níž).
- **Zima** – rozběhnuté činnosti se dokončí, další se vybírají podle zimního obsazení; venku je
  pak méně lidí podle obsazení jako dnes.
- **Přeskok času** (vývojový skok, jiné hodiny světa) rozvrhy spočítá znovu pro nový čas – tady
  je skok dovolený.

### Determinismus a načtení stránky

- Rozvrh člověka je **čistá funkce** řetězu činností: druh činnosti dá obsazení dne v okamžiku
  vyjití, **délku dá druh a los** `hash(seed vsi, id člověka, začátek)` (pochůzka celá ze sítě
  pěšin; práce na místě = cesta tam + práce losem v rozsahu druhu + cesta zpět; úlohy u objektu
  jdou domů, až je obsazení dne nedává). Pauza doma je 30–90 s (los). Další vyjití = konec
  činnosti + pauza, **začátky i konce zaokrouhlené na mřížku `GRID_S` 30 s**. Stejný okamžik =
  stejná póza; za snímek se nic nepočítá krokově.
- **Po načtení stránky** se řetěz každého člověka dopočítá od `t − HISTORY_S` (60 minut ≈ 42
  herních dní, déle než nejdelší činnost) a postava stojí, kde má – uprostřed cesty k vodě,
  v řadě na poli. Řetězy započaté v různých okamžicích **splynou**, jakmile padnou na týž bod
  mřížky (po pár činnostech), takže po načtení vychází totéž co v prohlížeči otevřeném celou
  dobu; test to hlídá na stovkách lidí a časů. Kdyby někde nesplynuly, liší se póza nejvýš po
  dobu jedné činnosti, pak je shoda.
- **Zvon** (návrh Clauda – bez něj řetězy v testu nesplývají: pochůzky mají pevnou délku a pauza
  30–90 s je na splynutí málo; **jednou za hodinu** – Martin 31. 10. 2026: „Podle tvého
  doporučení“): každý člověk má po 55 minutách (`BELL_S`, < `HISTORY_S` 60 minut) vlastní
  okamžik, kdy je doma. Činnost, která by ho přesáhla, nezačne (práce na místě se zkrátí, pochůzka
  počká doma), po zvonu vyjde každý řetěz v týž okamžik – řetězy splynou nejpozději u prvního
  zvonu. Úlohy u objektu zvon nepřeruší (splynou svým koncem). Cena: dlouhé pochůzky (12 minut)
  jsou venku ≈ 86 % času místo ≈ 90 % (bez zvonu), 6minutové ≈ 77 % místo ≈ 83 %; po načtení
  stránky se dopočítá hodina zpětně (zanedbatelné).
- **Kdo co dělá napříč dny:** pořadí lidí (`DayRoster`) je los ze seedu vsi a id člověka, ne dne
  (návrh Clauda) – při podobném rozdělení práce dělá tentýž člověk totéž a dvě činnosti různých
  dnů se na jednom místě (řada na poli, strom) nesejdou; mění se se změnou práce dne.
- **Obsazení dnů, které prohlížeč neviděl** (před načtením stránky), nahradí nejstarší známé,
  tedy dnešní (Martin 31. 10. 2026: dva prohlížeče „zatím stačí srovnat“). Úplná shoda by
  potřebovala rozdělení práce posledních ≈ 42 dnů ze serveru – až se na jednu ves budou dívat
  dva hráči.
- **Co už běží, se nepřepočítá:** rozběhnutá činnost si drží trasu a časy, se kterými začala
  (i když dorazí síť pěšin nebo na trase vyroste dům); nové údaje platí od další činnosti.
- **Kdo co dělá** (`DayRoster`) se rozhoduje při každém vyjití z domu (Martin 31. 10. 2026:
  „Činnost typicky začíná tím, že postava vyjde z domu a končí tím, že postava do domu zajde“):
  žena, která donesla vodu, si doma odpočine a při dalším vyjití dostane úlohu podle obsazení
  dne, jaké je právě teď. Rozdělení lidí k úlohám tak zůstává věrné obsazení dne a nemění se
  uprostřed činnosti.

### Výběr postavy

- Postava **je** rozvrh jednoho člověka, panel (`lib/person-activity.ts`) proto čte činnost a úsek
  přímo z rozvrhu: „žena rolníka – jde pro vodu“ platí celou cestu tam, „nabírá vodu“ u vody
  a „nese vodu“ až ke dveřím, i když simulace mezitím přešla na výmlat; pak „doma“ a s další
  činností to, co dělá dál.
- Panel se mění jen se změnou činnosti nebo úseku (`onPersonState` jako dnes), ne s přelomem dne.
- **Když postava zajde do domu, výběr se zruší** (Martin 31. 10. 2026) – panel se zavře, postava
  v domě není vidět. **Výjimka je vojvoda:** jeho výběr zůstane a panel říká „doma“, dokud
  nevyjde.
- Člověk bez rozvrhu (obsazení ho nemá a nic nedokončuje) je „doma“ jako dnes.

### Cesty postav

- Simulace dává jen **cíle a cenu** (kam se chodí pro vodu a dřevo, díly polí domácnosti, cena
  pochůzky `ERRAND_MAX_COST`); nic z tras nečte.
- **Délka činnosti se počítá ze sítě pěšin** – délka po síti, stejná ve všech prohlížečích i pro
  lidi mimo záběr, levná. **Přesnou trasu** (obchází domy a ploty, brody – `walkRoute`) počítá
  prohlížeč **jen pro postavu v záběru nebo vybranou**, jednou za činnost, a postava po ní jde
  tak, aby dorazila ve stejný čas (tempo chůze o pár procent jinak, ať nohy neklouzají – jako dnes
  po vyšlapané pěšině).
- Trasy si prohlížeč pamatuje a přepočítá je **jen při postavení nebo zániku stavby**
  (optimalizace tras – Martin 31. 10. 2026); rozběhnutá činnost jde po své trase dál.

### Výkon

- **Za snímek** jako dnes: póza jen pro postavy v záběru (`animate()` v taktu `WATER_FPS`, při
  omezeném pohybu postavy stojí), `needsRender` jen když se v záběru něco pohnulo.
- **Za herní den** jen obsazení nového dne (`planVillagersWithCrew` bez stavby postav, dnes
  ≈ 0,8 ms) – postavy se už nestaví znovu (dnes 6–11 ms po změně vsi). Novou činnost vybírají
  jen lidé, kterým právě skončila (Vlkov: 60 lidí, činnost 2–14 minut → pár za minutu).
- **Mimo záběr** se rozvrh posouvá jen délkami ze sítě pěšin – bez přesných tras a póz; ty se
  dopočítají, až postava vejde do záběru nebo ji hráč vybere.
- **Instance postav jsou pevná zásoba** (nejvýš `MAX_WORKERS` 60 + `MAX_TRAFFIC` 24 + starší,
  pasáci a události); kdo je doma, je skrytý – žádná nová pole matic s každým dnem. Žádný nový
  atribut na vrchol (WebGPU – 8 vertex bufferů).
- Cíl: přelom dne nejvýš 2 ms navíc, snímek beze změny (klid 16,8 ms) – změřit na Vlkově před
  a po.

### Co zůstane zjednodušené

- Noc se dál nemodeluje (lidé pracují i potmě).
- Karavany výprav a svoz úrody vozy jedou dál podle herního času (postup výpravy, okno dne) – na
  rozvrh se napojí jen lidé, kteří k nim jdou a od nich se vracejí.
- Obsazení dnů před načtením stránky se odhadne dnešním (shoda po splynutí řetězu činností).
- Lidé, kteří se stěhují k sousedovi nebo od něj, a lidé z okolí na svatbě rozvrh nemají (nejsou
  lidé vsi) – chodí jako dnes.
- Rozestupy v proudu dává los začátků činností (zlatý řez fází odpadne) – lidé občas jdou ve dvojici.
- Stavba, ke které první stavitel teprve jde (dokončuje pochůzku), může první den krátce růst bez
  něj – nejvýš po dobu jedné pochůzky.
- Smrt na cestě – postava zmizí (jediná výjimka z „činnost se dokončí“). Klipy dál střihem.

### Fáze činností (Martin 31. 10. 2026)

Martin (31. 10. 2026) k tabulce fází činností (co dělá kovář, uhlíř, rolník, žena…): „Tak ty
kroky v animacích, které chybí, sis tam už vpasal sám, tak je můžeš rovnou doplnit.“ Každá
činnost (Divadlo – tři druhy) tedy ve scéně prochází svými fázemi **od vyjití z domu po návrat**;
simulace se nemění, fáze jsou jen vizuální. Podklad: mezery ve scéně z `activities.md` (sestaveno 31. 10. 2026 z kódu, neověřeno ve hře). Návrhy animací, rekvizit a jejich zdrojů jsou **návrh
Clauda**.

**Co máme (ověřeno v repu):**

- **Klipy** (`VillagerClip`, `villager-motion.ts`; zdroj `tools/blender/people.json`, převod
  `tools/blender/people_from_0ad.py`): z 0 A.D. (`art/animation/biped/`) se berou `citizen/`
  `walk_relax_{f,m}`, `idle_relax_{f,m_a}`, `build` a `gatherer/` `gather_meat` (= `reap`,
  `butcher`), `farming` (= `hoe`, `winnow`), `seeding`, `gather_berries` (= `weed`, `bleed`),
  `carry_grain_{f,m}`, `carry_wood_{f,m}`, `gather_wood` (= `fell`), `gather_fruit_{f,m}`,
  `gather_mine` (= `thresh`), `slaughter` (= `gut`), `carry_meat_{f,m}`, `idle_carry_meat_{f,m}`;
  jen muž navíc jezdecké (`pace_relax`, `trot_relax`, `idle_relax_01`) a bojové (`idle_ready`,
  `attack_ranged`, `attack_melee_01`, `attack_melee_shield_01`, `idle_ready_shield_01`,
  `walk_relax`). Řada klipů je jen **jiný název téže animace s jinou rekvizitou** (`fish`, `carry-water`,
  `walk-rattle` = chůze či stání + prop) – tak vznikají „nové“ fáze bez nové animace.
- **Rekvizity** (props v `man.glb` / `woman.glb`, vázané na kost): `head`, `sickle`, `hoe`,
  `basket`, `axe`, `mallet`, `wood`, `yoke` (vahadlo s vědry), `knife`, `meat`, `bowl`,
  `fishing-rod`, `thresh-stick` (cep), `shovel`, `rattle`; jen muž `bow`, `training-sword`,
  `wicker-shield`, `spear`. Srp, vahadlo, miska, nůž a podobné jsou vlastní jednoduché modely
  (skript) s texturou z 0 A.D.; `LICENSES.md` v `apps/web/public/models/people/` to uvádí.
- **Neexistují jako rekvizita:** hrnčířský kruh, přeslice, stav, hrábě, vidle, povříslo (snop),
  džber na mléko, hrnec a vařečka, štípací špalek, síto na rudu, kladivo a kleště kováře (kování
  dnes jede přes `hoe`, viz `villager-plan-crafts.ts`), hudební nástroje. Hrnčířský kruh a pec,
  kovadlina a měchy, milíř a vůz jsou **objekty scény** (`crafts/*.glb`, `wagons/`), ne rekvizity
  v ruce – zda má `hrncir.glb` kruh jako samostatný uzel, **ověřit v modelu**.
- **Další animace 0 A.D. (citizen, female):** data 0 A.D. **nejsou v repu ani lokálně**
  (v tomto počítači není nalezen žádný adresář s hrou), proto nelze vypsat, co obsahují
  `art/animation/biped/` navíc. Ze skriptu je známo jen to, co už se bere (výš). Zda existují
  klipy pro sezení, tanec či hudbu, vaření, předení nebo dojení, **ověřit v datech 0 A.D.**; do té
  doby se u takových fází počítá s „nová animace“. Zdroj nové animace: **vlastní v Blenderu nad
  kostrou bipeda 0 A.D.** (48 kostí, `people_from_0ad.py`) – licence CC BY-SA 3.0, Wildfire Games
  (kostra), případně CC0 podklad; ne cizí kostra.

Stav: **je** = klip i rekvizita ve scéně; **nové** = nová fáze z existujícího klipu (případně
s novou rekvizitou); **nová animace – chybí v 0 A.D.** = žádný vhodný klip, nutná animace.
Cesta ode dveří na místo a zpět (`walk`, nosiči `carry`) je u každé role první a poslední fáze
(Martin 31. 10. 2026: „Ano“ – součást práce); dále ji neopakuji.

**Rolník (žně, svoz, seno)**

| Fáze                      | Kde                 | Animace a rekvizita                            | Stav                                           |
| ------------------------- | ------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Cesta na pole             | ode dveří po pěšině | `walk`, srp / motyka na zádech                 | je (nově jako součást práce)                   |
| Orba, setí, pletí         | pole                | `hoe`, `seed` + `basket`, `weed`               | je                                             |
| Žně                       | pole                | `reap` + `sickle`                              | je                                             |
| Vázání snopů              | pole                | `weed` (sehnutí) + povříslo ve ruce            | nové (rekvizita povříslo/snop nová)            |
| Nakládání snopů na vůz    | pole u vozu         | `fruit` (zdvih nahoru) + snop                  | nové (rekvizita snop)                          |
| Vůz se snopy jede k humnu | pěšina → humno      | `walk` vedle voznice, vůz se spřežením         | nové (cíl cesty; vůz a spřežení jsou)          |
| Mlácení a prohazování     | humno               | `thresh` + `thresh-stick`, `winnow` + `shovel` | je                                             |
| Hrabání sena              | louka               | `hoe` (tažení) + hrábě                         | nové (rekvizita hrábě)                         |
| Kupy a stoh               | louka               | `fruit` (nahazování) + vidle                   | nové (rekvizita vidle, stoh jako objekt scény) |
| Odvoz sena                | louka → dvůr        | `walk` u vozu se senem                         | nové (vůz s nákladem sena)                     |
| Cesta domů                | pěšina              | `walk` / `carry`                               | je (nově jako součást práce)                   |

**Žena**

| Fáze                         | Kde            | Animace a rekvizita                                                   | Stav                                                 |
| ---------------------------- | -------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Voda: cesta, nabrání, návrat | studna / potok | `carry-water` + `yoke`, `water-idle`                                  | je                                                   |
| Vaření a oheň                | před domem     | `weed` (skloněná nad ohništěm) + vařečka, hrnec u ohně                | nové (dnes jen stojí; rekvizita nová)                |
| Dojení                       | ohrada, chlév  | sed u krávy, džber                                                    | nová animace – chybí v 0 A.D. (dnes zástupné `weed`) |
| Předení                      | před domem     | stoj / sed, přeslice                                                  | nová animace – chybí v 0 A.D.                        |
| Tkaní (len, vlna)            | v domě / před  | stoj u stavu                                                          | nová animace – chybí v 0 A.D.                        |
| Péče o děti                  | před domem     | `idle` s dítětem (menší postava), případně `carry-meat-idle` bez masa | nové (postava dítěte je, pozice nová)                |
| Pomoc o žních (vázání, svoz) | pole           | jako rolník                                                           | nové (žena v řadě žňů)                               |
| Nošení jídla, sad, pletí     | pole, sad      | `carry`, `fruit`, `weed`                                              | je                                                   |

**Děti a starší**

| Fáze                                        | Kde        | Animace a rekvizita                                     | Stav                                        |
| ------------------------------------------- | ---------- | ------------------------------------------------------- | ------------------------------------------- |
| Hlídání dílu s řehtačkou                    | pole       | `walk-rattle`, `idle-rattle`                            | je                                          |
| Pomoc o žních (výrostci od 10 let i starší) | pole       | paběrky `weed`, vázání `weed` + povříslo, odnos `carry` | nové (stejné klipy jako rolník)             |
| Starší sedí u domu                          | před domem | sed na lavici                                           | nová animace – chybí v 0 A.D. (dnes `idle`) |
| Lehké práce u domu                          | dvůr       | `weed`, `carry`                                         | je                                          |

**Kovář**

| Fáze                         | Kde                      | Animace a rekvizita              | Stav                                                  |
| ---------------------------- | ------------------------ | -------------------------------- | ----------------------------------------------------- |
| Přínos uhlí a rudy           | milíř, rudiště → kovárna | `carry` / vůz                    | je (`smithFetchFigures`)                              |
| Praní rudy                   | u potoka / korytě        | `weed` (sehnutí) + síto / koš    | nové (rekvizita síto)                                 |
| Pražení rudy                 | u pece                   | `weed` nad ohněm + `shovel`      | nové                                                  |
| Tavba: sypání, měchy         | redukční pec             | `seed` / `hoe`, druhý šlape měch | je (v `villager-plan-crafts.ts`)                      |
| Překování houby na hřivny    | kovadlina                | `build` + `mallet`, těžší tempo  | nové (dnes jedna animace; odlišit tempem a množstvím) |
| Kování nástrojů              | kovadlina                | `build` + `mallet` / kladivo     | nové (rekvizita kladivo, kleště)                      |
| Odnos nástrojů do domácností | kovárna → domy           | `carry` s košem nástrojů         | nové (cíl cesty; rekvizita koš s nástroji)            |

**Uhlíř a milíř**

| Fáze                    | Kde             | Animace a rekvizita                      | Stav                                                      |
| ----------------------- | --------------- | ---------------------------------------- | --------------------------------------------------------- |
| Kácení a nošení dřeva   | les → milíř     | `fell` + `axe`, `carry-wood`             | je                                                        |
| Štípání dřeva           | u milíře        | `fell` + `axe` na špalku                 | nové (rekvizita špalek)                                   |
| Stavění milíře (sypání) | milíř           | `hoe`, `build`                           | je                                                        |
| Pálení a hlídání milíře | milíř           | `idle` stoj, občas `hoe` (zahrnutí)      | nové (klip u milíře dosud nezjištěn, viz `activities.md`) |
| Vytahování uhlí         | milíř           | `hoe` (hrabání) + hrábě, `carry` do koše | nové (rekvizita hrábě)                                    |
| Odnos uhlí kováři       | milíř → kovárna | `carry` / vůz                            | je                                                        |

**Hrnčíř**

| Fáze                      | Kde          | Animace a rekvizita                       | Stav                                                                              |
| ------------------------- | ------------ | ----------------------------------------- | --------------------------------------------------------------------------------- |
| Kopání a nošení hlíny     | hliniště     | `hoe`, `carry`                            | je                                                                                |
| Točení na kruhu           | dílna        | sed u kruhu, ruce na hlíně                | nová animace – chybí v 0 A.D. (dnes zástupná; kruh jako uzel `hrncir.glb` ověřit) |
| Sušení nádob              | před dílnou  | `weed` (pokládání) + nádoba               | nové (rekvizita nádoba)                                                           |
| Vsazení a pálení v peci   | pec          | `fruit` / `weed` ke vsazení, `idle` hlídá | nové                                                                              |
| Odnos nádob do domácností | dílna → domy | `carry` s košem nádob                     | nové (rekvizita nádoby)                                                           |

**Tesař**

| Fáze                | Kde         | Animace a rekvizita                                           | Stav                                                        |
| ------------------- | ----------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Kácení a ořez kmenů | les, dvůr   | `fell` + `axe`                                                | je                                                          |
| Stavba              | staveniště  | `build` + `mallet`                                            | je                                                          |
| Výroba vozu         | dvůr tesaře | `build` + `mallet`; vůz vzniká po dílech (kola, ložní plocha) | nové (vůz ve scéně dosud nevzniká – model dílů v `wagons/`) |

**Vozka**

| Fáze                         | Kde      | Animace a rekvizita                           | Stav                               |
| ---------------------------- | -------- | --------------------------------------------- | ---------------------------------- |
| Chůze u spřežení, jízda vozu | cesty    | `walk` vedle voznice                          | je                                 |
| Nakládání                    | u zdroje | `fruit` / `carry` + náklad (snop, pytel, koš) | nové (náklad jde na vůz po kusech) |
| Vykládání                    | cíl      | `carry` z vozu                                | je (nosiči)                        |

**Rybář**

| Fáze          | Kde           | Animace a rekvizita            | Stav                                        |
| ------------- | ------------- | ------------------------------ | ------------------------------------------- |
| Cesta k tůni  | pěšina → tůň  | `walk`, prut na rameni         | nové (dnes se objeví u vody)                |
| Lov           | tůň, potok    | `fish` (stání) + `fishing-rod` | je                                          |
| Oka na zajíce | zvěřní stezka | `weed` (kladení) + oko         | nové (dnes se nekreslí; rekvizita oko)      |
| Odnos úlovku  | tůň → dvůr    | `carry-meat` / koš s rybami    | nové (klip `carry-meat` je; rekvizita ryby) |

**Vojvoda a synové**

| Fáze                       | Kde             | Animace a rekvizita                                                     | Stav                            |
| -------------------------- | --------------- | ----------------------------------------------------------------------- | ------------------------------- |
| Výcvik jízdy               | dvorek          | `ride`, `ride-trot`, `ride-idle`                                        | je (dvorek jako místo)          |
| Střelba, oštěp, meč a štít | cvičiště        | `bow-draw`/`bow-release`, `spear-thrust`, `sword-strike`/`shield-block` | je                              |
| Cvičící muži o žních       | cvičiště → pole | po cvičení `reap`, vázání `weed` + povříslo                             | nové (muži z cvičiště pomáhají) |

**Svatba**

| Fáze                   | Kde         | Animace a rekvizita             | Stav                                                          |
| ---------------------- | ----------- | ------------------------------- | ------------------------------------------------------------- |
| Průvod, obřad, hostina | ves, dvorec | `walk`, `idle`                  | je (`wedding-plan.ts`)                                        |
| Hudebníci              | u hostiny   | hra na píšťalu / buben ve stoje | nová animace – chybí v 0 A.D. (nebo tanec 0 A.D., **ověřit**) |

**Souhrn:** nových fází celkem 33 (z toho 6 s **novou animací** – chybí v 0 A.D.,
ostatní jsou existující klip s novou rekvizitou či místem) a nové rekvizity: povříslo
(snop), hrábě, vidle, kladivo a kleště, špalek, síto, nádoby, koš s nástroji, oka, ryby, vařečka
s hrncem, džber, přeslice, stav, píšťala a buben, hrnčířský kruh (pokud není uzel `hrncir.glb`).
Zdroje: tvary rekvizit vlastní v Blenderu (jednoduché, jako srp a vahadlo – CC BY-SA 3.0 s texturou
z 0 A.D.), nebo CC0; nové animace vlastní nad kostrou 0 A.D., pokud se v datech 0 A.D. (ověřit)
nenajde vhodný klip. Každý nový zdroj do `LICENSES.md` vedle souboru.

### Pro implementaci

Úlohy po sobě, každá ≤ 150 kroků, s testy (pravidla CLAUDE.md – Scéna; Ves: typy z jádra
a `lib/village-view.ts`, rozvrh je znovu nedefinuje – `PersonJob`, `LaborActivity` zůstávají):

1. **Rozvrh člověka – čisté funkce** (nový `apps/web/lib/scene/villager-schedule.ts`
   a `__tests__/villager-schedule.test.ts`, bez Babylonu): `GRID_S`, `HISTORY_S`, `WORK_RANGE_S`,
   `nextStart(seed, personId, endT)`, typ činnosti (`errand` / `bout` / `home` – začátek, konec,
   `PersonJob`, místo či trasa), `activityLength(kind, seed, personId, startT, lengthOf)`,
   `scheduleAt(personId, t, castOf, lengthOf)` podle pravidel výš. Testy: přelom dne činnost
   nepřeruší, další činnost podle dne, kdy začne, stejný čas = stejný výsledek, řetězy z různých
   počátků (`t − HISTORY_S` a dřívější) splynou před `t` (stovky lidí a časů), úloha u objektu
   bez losované délky.
2. **Obsazení dne jako člověk → úloha** (`villager-plan.ts` – `planVillagersWithCrew`,
   `dayRoster`; `villager-plan-cast.ts` – `cast`, `figure`; `villager-roster.ts` – `DayRoster`):
   navíc vrátit mapu id člověka → úloha, póza nebo trasa, místo; kdo co dělá se rozhoduje **při
   každém vyjití z domu** (los ze seedu vsi, id člověka a začátku činnosti), ne po dnech ani
   obdobích. Testy ve `__tests__/villager-people.test.ts` a `villager-plan.test.ts` – stejný
   začátek = stejná úloha, rozdělení lidí odpovídá obsazení dne.
3. **Napojení ve scéně** (`villagers.ts` – `update`, `rebuild`, `animate`, `setPaths`): obsazení
   dnů v paměti (nejvýš 30 dnů), rozvrhy lidí místo postav dne, pevná zásoba instancí; pryč
   `carryErrands` a `WALK_OVER_M` (`villager-errands.ts` zůstane pro cykly pochůzek); výběr
   a `onPersonState` z rozvrhu (`lib/person-activity.ts`), zrušení výběru, když vybraný zajde
   do domu (kromě vojvody). e2e `apps/web/e2e/village.spec.ts` – vybraná postava drží činnost
   přes přelom dne a po návratu domů výběr zmizí.
   **Implementováno 31. 10. 2026** (`villager-timetable.ts`; mapa kódu `village-people.md`):
   postava každého člověka podle rozvrhu, výběr a zrušení výběru, testy přelomu dne, výběru
   a popisku jako unit testy (`villager-timetable.test.ts` – e2e by muselo čekat minuty skutečného
   času). Návrh Clauda – do úlohy 5 zůstávají postavy dne: lidé na události (požár, karavana,
   pohřeb, svatba, porážka) a jezdci s trasou (kůň jede podle bloků dne); jejich postava
   z rozvrhu je mezitím skrytá. `carryErrands` zůstává jen pro cizí a ukázky bez lidí, pryč
   `walkThen` při přeplánování. Instance se dál přidělují při přeplánování (postavy dne se mění).
4. **Cesta na pole a domů jako součást práce** (Martin 31. 10. 2026: „Ano“; `villager-plan-traffic.ts` –
   `trafficFigures` bez druhu „na pole a zpět“, `villager-plan-fields.ts` – `fieldRows`,
   `carriers` s příchodem ode dveří po `fieldPath`; `road-traffic.ts` –
   `FIELD_TRIPS_PER_MAN_DAY`), texty v Provozu na cestách. Vozy po svozu snopů jedou k humnu
   (Zjednodušení a co chybí).
   **Implementováno 31. 10. 2026:** proud „na pole a zpět“ zanikl (`TRAFFIC_LOOK.field`,
   `FIELD_COMMUTE` pryč; `FIELD_TRIPS_PER_MAN_DAY` → `KILN_TRIPS_PER_MAN_DAY` – zůstává jen uhlíř
   k milíři). Řady na poli a nosiči úrody jdou z rozvrhu ode dveří svého domu (práce na místě –
   `bout`): nosič dojde k nosičům u panáků, nosí a na konci činnosti jde domů (návrh Clauda –
   nosič úrody zůstává prací na místě s několika cestami, ne pochůzkou: díl patří nejbližšímu
   domu, nosič ale bydlí kdekoli). Vozy k humnu – zatím ne (úloha 8).
5. **Události přerušují** (`funeral-plan.ts`, `wedding-plan.ts`, `villager-plan-fire.ts`,
   `caravan.ts`; `flood-water.ts` jen pro rozlitou vodu): událost přepíše rozvrh od svého začátku
   (příchod pěšky, opozdilci rovnou na místo), k požáru jen lidé ve vsi, z povodně domů. Test na
   každou událost.
   **Implementováno 31. 10. 2026** (`villager-schedule.ts` – `settle`, `nextActivity`,
   `interruptOf`; testy `villager-events.test.ts`): události jsou úlohy obsazení dne
   s `PersonTask.interrupt` – pohřeb, svatba, karavana (i odchod do nové vsi – role `leaving`)
   a jízda vojvodovy rodiny `all`, požár `near` (`FIRE_REACH_M` 150 m od místa, kde člověk
   v okamžik vzplanutí je – návrh Clauda). Od přelomu dne, kdy obsazení událost dá, se rozběhnutá
   činnost utne (`Activity.cut`), člověk jde pěšky **z místa, kde ho zastihla** (`Activity.from`),
   k póze události v okamžik příchodu (opozdilec tak dojde rovnou, kde průvod právě je), drží ji,
   dokud ji obsazení dává, a jde domů; skončí-li póza události doma (průvod domů), cesta zpět se
   nekreslí. Povodeň: `ScheduleInput.wet` (`StormRenderer.floodedAt` – stejná hladina jako plocha
   vody): kdo má místo práce pod vodou, od přelomu dne jde domů (`Activity.retreat`), na místo
   pod vodou nikdo nevyjde. Postavy dne pro lidi vsi zanikly (pryč `EVENT_KEY` a `away`) – lidé
   na událostech i jezdci jdou z rozvrhu. **Jezdci s trasou** drží úlohu dne jako úlohu u objektu
   a v bloku jízdy sedí na koni vždy (`VillageVillagers.mounted` – kůň nejede bez jezdce, i kdyby
   jezdec ještě nedošel; návrh Clauda). Porážka (`slaughter-crew`) nepřerušuje – úloha u objektu
   od vyjití. Smrt: člověk vypadne z `labor.persons`, postava zmizí s novým stavem vsi
   (`Timetable.retain`). Místo úlohy (`PersonTask.at`) je póza na začátku dne (dřív v t = 0).
6. **Délka ze sítě pěšin, přesná trasa jen v záběru** (`villager-plan-traffic.ts` – `errandPath`,
   `activeSeconds`; `villager-motion.ts` – `shuttle`, `alongRoute` s tempem podle poměru délek;
   `villagers.ts` – přesná trasa při vstupu do záběru a výběru), měření na Vlkově (přelom dne,
   snímek), zápis do `docs/code/village-people.md` (Postavy – lidé ve vsi) a sem („Implementováno
   …“).
   **Implementováno 31. 10. 2026:** délka chůze práce na místě, úlohy u objektu, cesty k události
   a z povodně domů = odhad po síti pěšin (`VillagerPaths.walkLength` v `path-router.ts` –
   `walkGraph` a `walkingDistances` z jádra nad osami uložených tras plnou silou pěšiny;
   `Timetable.setEstimate`) ÷ tempo chůze – stejné časy ve všech prohlížečích i mimo záběr; bez
   sítě rovně. Přesná trasa (`walkRoute` – po pěšinách, kolem domů, po suchu, na vzdálený díl
   `fieldPath`; `planVillagersWithCrew` → `walk`, `Timetable.setRouter`) se hledá **až když se
   póza kreslí** (ves v záběru, vybraná postava), jednou za úsek činnosti (`activityPose` –
   `PoseWalk`); postava po ní dojde v čase z odhadu, tempo nohou podle poměru délky trasy a času
   (0,6–1,8×). Návrh Clauda – zjednodušení: odhad zatím bez půdy krajiny (mokřina, les, brod
   rovně jako louka) a bez pevných cest (jen pěšiny uložených tras); pochůzky (voda, dřevo, nosiči
   kováře) dál chodí celý cyklus po trase z plánu dne (`shuttle`), která se počítá pro všechny
   domácnosti jako dosud. Měření na Vlkově (přelom dne, snímek) zbývá.
7. **Rozvrh postav napřed, fáze potom** (navazuje na úlohy 1–3 – bez nich fáze nemají kam
   zapadnout): do typu činnosti z úlohy 1 (`villager-schedule.ts`) přidat **seznam fází** (druh,
   délka podílem, místo) jako čistou funkci druhu činnosti a losu; `scheduleAt` vrací i aktuální
   fázi a klip. Testy ve `__tests__/villager-schedule.test.ts`: součet fází = délka činnosti,
   stejný čas = stejná fáze, první fáze chůze ode dveří a poslední návrat.
   **Implementováno 1. 11. 2026** (`villager-phases.ts`; mapa kódu `village-people.md` – Fáze
   činností): `activityPhases` – cesta ode dveří, práce v místě po krocích role (podíly losem
   podle člověka a začátku činnosti), návrat; kroky jinde (odnos do cizí domácnosti, řada žnečů)
   s cestou tam a zpět, jen když se vejde (jinak práce úlohy u místa). Návrh Clauda – `scheduleAt`
   vrací dál jen činnost (volá ho řetěz rozvrhu, fáze by se počítaly zbytečně); fázi a klip vrací
   `schedulePhaseAt`, ve scéně se fáze počítají líně s pózou (`Timetable.phase`). Úloha u objektu
   a pochůzka mají jen jednu fázi práce (póza úlohy či cyklus pochůzky).
8. **Fáze z existujících klipů** (rolník, kovář, uhlíř, hrnčíř, vozka, rybář, vojvoda a synové –
   stav „nové“ bez nové animace): `villager-plan-fields.ts`, `villager-plan-crafts.ts`,
   `villager-plan-traffic.ts`, `villager-plan-fire.ts` (jen kontrola) a `villagers.ts` – fáze
   mapují na stávající `VillagerClip`; vůz se snopy a senem jede k humnu a na dvůr, rybář k tůni
   a s úlovkem zpět, kování rozlišené tempem. Testy `villager-plan.test.ts`; panel vybrané
   postavy (`lib/person-activity.ts`) fázi řekne.
   **Implementováno 1. 11. 2026** (role `villager-plan-phases.ts`, klipy `PHASE_STEPS`; podíly
   kroků jsou návrh Clauda, doladit hraním): rolník – žně a vázání snopů (sehnutí `weed`), louka
   seč, hrabání (`hoe`) a kupky (`fruit`), nakladač u vozu (`fruit`), **vůz se snopy k humnu**
   (Zjednodušení a co chybí); kovář – při tavbě praní (`weed`) a pražení rudy (`winnow`
   s lopatou), překování pomalejším `build` (tempo 0,7) vs. kování nástrojů rychlejším (1,3)
   a odnos nástrojů s košem do cizí domácnosti; uhlíř podle stavu milíře – štípání (`fell`),
   zahrnutí (`hoe`), hlídání (`idle`), vytahování uhlí (`hoe`) a do koše (`fruit`); hrnčíř –
   sušení (`weed`), vsazení do pece (`fruit`), hlídání ohně (`idle`), odnos nádob; rybář jde
   k tůni ode dveří (rozvrh – úloha 3) a nese úlovek domů v koši (`carry`); vozka – nakládání
   dělá nakladač u vozu (vozku kreslí vůz); o žních cvičící muži (žne `reap`, váže `weed`),
   starší a nečinní (paběrky `weed`) u řady žnečů – výrostci jako nečinní (věk úloha nezná).
   Lov – nosič úlovku už nese maso (`carry-meat` v póze lovu – `villager-plan-lord.ts`). Panel
   řekne fázi (`PHASE_TEXTS`). Martin 31. 10. 2026: „Z OAD použij vše, co je pro nás
   použitelné“ – **v GLB nejsou** (ověřeno v `tools/blender/people.json`):
   varianty postávání (`idle_relax_m_b…l`, `idle_relax_f_short/long`, shrbení `idle_relax_h_*`),
   modlitba `pray`, vladař `idle_minister_*`, chůze s nářadím `walk_axe/hoe/shovel` a nošení rudy
   `carry_ore_*` – starší u domu dál `idle`, modlitba u modly a vladař čekají na úlohu
   s přegenerováním GLB. Seno na dvůr a `carry-meat-idle` zatím bez místa.
9. **Nové rekvizity** (povříslo, hrábě, vidle, kladivo a kleště, špalek, síto, nádoby, koš
   s nástroji, oka, ryby, vařečka s hrncem, džber): `tools/blender/people_from_0ad.py`
   (funkce po vzoru srpu a vahadla), `tools/blender/people.json` (props a klipy s `props`),
   regenerace `man.glb` a `woman.glb` v `apps/web/public/models/people/`, zápis do
   `LICENSES.md`; test `VILLAGER_CLIPS` proti GLB. WebGPU limit 8 vertex bufferů – rekvizity jsou
   klouby kostry, ne nový atribut.
   **Hotovo (1. 11. 2026 – ke schválení očima, ve scéně neověřeno):** z 0 A.D. vidle, kladivo,
   kleště a sekera ke štípání; ostatní vlastní jednoduché modely (CC0 tvar, textury 0 A.D.):
   povříslo se snopem, hrábě, štípací špalek, síto, nádoby na zemi, nůše s nástroji / nádobami
   / rybami, oko, vařečka s hrncem na ohništi, džber, přeslice, stav, píšťala a buben. Klipy jsou
   stávající animace s novou rekvizitou (`bind`, `rake`, `pitch`, `forge`, `split`, `sieve`,
   `pots`, `carry-tools`, `carry-pots`, `carry-fish`, `snare`, `cook`), vlastní klipy dostaly
   rekvizitu přímo. Návrh Clauda: snopy na vůz a seno se podávají vidlemi (`pitch` – klip `farming`,
   ne dlouhý `fruit`, šetří VAT), vsazení do pece je sehnutí nad nádobami jako sušení, štípání je
   úder krumpáče 0 A.D. se sekerou (shora na špalek), předení bez vřetena (z dálky neviditelné),
   vaří čtvrtina žen u dveří (`COOK_SHARE`), prohazování zrna zůstává s lopatou (Martin 21. 10.
   2026). Oko je v GLB, ale nezapojené (oka se ve scéně nekreslí – wildlife.md), stav jen při
   tkaní (úloha 12). Volné rekvizity (snop, špalek, síto, hrnec, džber, stav, buben…) jsou propy
   postavy, ne objekty scény – žádný další draw call.
10. **Nové animace** (dojení, předení, tkaní, sezení starších, točení na kruhu, hudebníci;
    napřed **ověřit v datech 0 A.D.**, zda vhodný klip není): vlastní v Blenderu nad kostrou
    bipeda 0 A.D. (`people_from_0ad.py`, nový typ klipu bez zdroje `.dae`), nové názvy
    v `VillagerClip` a `VILLAGER_CLIPS` (`villager-motion.ts`), `lib/person-activity.ts`
    a zástupné klipy (dojení = `weed`, sezení = `idle`) po dokončení nahradit. Každý klip zvlášť
    ověřit očima ve scéně; nejdřív dojení a točení na kruhu (dnes zástupné).
    **Hotovo (koncept, 1. 11. 2026 – ke schválení očima):** Martin 31. 10. 2026 k šesti
    animacím: „Ověř 0 A.D., pak Blender.“ – 0 A.D. žádnou z nich nemá (`0ad-animations.md`), takže
    jsou vlastní (CC0) z klíčových póz skriptem (`people.json` – klíč `keys`, `keyed_frames`):
    `milk` (dojení na špalku), `spin` (předení s vřetenem ve stoje), `weave` (tkaní – člunek
    zleva doprava a přiražení útku nahoru), `sit` (starší na špalku, rozhlíží se), `wheel` (sed
    u kruhu, ruce na hrnci, noha roztáčí kruh), `pipe` a `drum` (píšťala, buben ve stoje).
    Špalek pod sedící postavou je nový prop (návrh Clauda – bez něj by seděla ve vzduchu).
    Z 0 A.D. přibyly modlitba `pray`, léčení `heal`, varianty stání `rest-a`–`e`, chůze
    s motykou a sekerou `walk-hoe` / `walk-axe` a vladař `lord-idle-a`–`c`, `walk-lord`;
    `idle_relax_h_*` / `walk_relax_h_*` nejsou shrbení starci, ale hrdinové („hero“ – ověřeno
    náhledem), proto vynechány; nošení rudy čeká na rekvizitu (úloha 9), `idle_hoe/axe_*` jsou
    10–14 s dlouhé (velká textura VAT). Zapojeno: dojení, kruh, sezení a modlitba starších
    (návrh Clauda – starší mimo žně sedí, postojí a zajdou k nejbližší hotové modle či svatyni),
    předení žen u dveří, vojvoda jako vladař, cesta s nářadím. Tkaní, hudba a léčení jsou
    v GLB, zapojí je úloha 12 (stav, hudebníci na svatbě) a nemoc, až ji simulace bude mít.
    Ve scéně zatím neověřeno (Vlkov).
11. **Tesař – vznikající vůz a stoh/seno** (`villager-plan-crafts.ts`, `wagons/` GLB,
    `scene-village.md`): díly vozu po fázích ve scéně, stoh a kupy sena jako objekty scény;
    zápis do `docs/code/village-crafts.md` a `village-fields.md`. Tuto úlohu lze dělat až po 8.
12. **Žena, děti a svatba** (vaření, péče o děti, pomoc o žních, hudebníci; `villager-plan.ts`,
    `villager-plan-cast.ts`, `wedding-plan.ts`): po úlohách 9 a 10; e2e `apps/web/e2e/village.spec.ts`
    a zápis do `docs/code/village-people.md` („Implementováno …“).

| Rozhodnutí                                                                                                 | Proč                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Scéna smí zaostat o jednu pochůzku (Martin 31. 10. 2026: „Nevadí“)                                         | „od začátku do konce“; kratší zpoždění by šlo jen rychlejší chůzí        |
| Dva prohlížeče zatím jen srovnat, bez historie (Martin 31. 10. 2026)                                       | úplná shoda až s více hráči na jedné vsi                                 |
| Jednotka přidělení = činnost od vyjití z domu po návrat (Martin 31. 10. 2026)                              | kdo a co se rozhoduje při každém vyjití; různě dlouhá podle činnosti     |
| Cesta na pole a domů je součást práce (Martin 31. 10. 2026: „Ano“)                                         | lidé chodí na pole (Martin 19. 10. 2026)                                 |
| Postava = člověk napříč dny s vlastním rozvrhem (návrh Clauda)                                             | výběr postavy sedí s tím, co postava dělá                                |
| Při návratu domů se zruší výběr postavy, kromě vojvody (Martin 31. 10. 2026)                               | postava v domě není vidět; vojvodu hráč sleduje                          |
| Ve frontě jen další činnost, vybraná při vyjití (návrh Clauda)                                             | doslovná fronta by rostla ≈ 10× rychleji, než se dá zahrát               |
| Délka činnosti: pochůzka celá, práce na místě losem v rozsahu druhu (návrh Clauda)                         | čistá funkce druhu a losu podle člověka a začátku; bez pevné směny       |
| Řetěz činností se dohraje od `t − HISTORY_S` a splývá na mřížce (návrh Clauda)                             | po načtení stránky stejná póza jako v otevřeném prohlížeči, bez historie |
| Stádo, spřežení, vůz a první stavitel bez losované délky (návrh Clauda)                                    | objekt je ve scéně celý den, stavba neroste sama od sebe                 |
| Na nové místo vždy pěšky, i dál než 90 m (návrh Clauda)                                                    | žádné skoky – dnes se vzdálenější postava objeví                         |
| Délka činnosti ze sítě pěšin, přesná trasa jen v záběru (návrh Clauda)                                     | stejné časy všude, přesná trasa jen tam, kde je vidět                    |
| Noc a zima nepřerušují, smrt postavu skryje hned, k požáru jen lidé ve vsi (návrh Clauda)                  | zlomek herního dne; mrtvý nechodí; vzdálení by nedošli                   |
| Zvon jednou za hodinu: `BELL_S` 55 min, `HISTORY_S` 60 min (Martin 31. 10. 2026: „Podle tvého doporučení“) | dlouhá pochůzka venku ≈ 86 % času; po načtení hodina zpětně              |

**Otevřené otázky pro Martina** (nově z odpovědí 31. 10. 2026):

1. **Rozsahy délky práce na místě** (3–8 minut u pole, stavby, kácení, dílny a sadu; 2–5 minut
   u domácí práce, starších a cvičiště) a pauza doma 30–90 s jsou odhad. Návrh Clauda: začít
   těmito čísly a doladit hraním na Vlkově; Martin řekne jen, zda mají lidé spíš „pendlovat“
   (kratší činnosti, víc chůze) nebo „dlouho dělat“ (delší práce, méně chůze).
2. **Pasáček, oráč, honák, vozka a první stavitel** jdou domů, až jim obsazení dne úlohu
   nedává (ne po losované délce) – dřív se u stáda nebo spřežení nikdo nestřídá. Návrh Clauda:
   ano, objekt je ve scéně celý den; střídání by šlo přidat později.

## Zjednodušení a co chybí

- **Vozy po svozu snopů jedou k humnu** (návrh Clauda; Martin 31. 10. 2026 – patří k
  „divadlu“; **implementováno 1. 11. 2026**, úloha 8): s hotovým humnem jede vůz prázdný k poli,
  nakládá, plný k humnu, tam skládá a prázdný se vrací k ohradě; pěší nosiči na humno chodí dál.
  Bez humna, nebo když k němu vůz nedojede, jako dřív (plný zpět k ohradě). Počty a čas svozu dál
  řídí simulace (`scene-village.md` – Humno ve scéně). **Seno na dvůr zatím ne** – vůz se senem
  jede plný k ohradě (stoh jako objekt scény je úloha 11).
- Noc se nemodeluje – lidé pracují pořád (herní den trvá ≈ 86 s).
- **Žně všemi rukama** ([pole](fields.md); Martin 24. 10. 2026): výrostci od 10 let a starší dají
  ve žňový den **celkem** 0,5 člověkodne na žeň a výmlat (vázání, odnos, paběrky; starší po minimu
  domácnosti, výrostek po pasení), stejně jdou na žně
  řemeslníci se syny a cvičící muži vojvodovy rodiny. Ve scéně zatím nemají vlastní postavy na
  poli – žeň a výmlat ukazují postavy podle rozdělení práce vsi (návrh Clauda, doplnit později).
- Pohyb běží ve skutečném čase jako u domácích zvířat – ve zrychleném světě se lidé nehýbou
  rychleji. Klipy se střídají střihem (zapečené animace Babylonu prolínání neumějí).
- Animace z 0 A.D.: žeň je klečící práce srpem (`gather_meat`), pletí sběr bobulí, výmlat
  palička (`citizen/build`), sklizeň jablek nízký sběr ovoce – vlastní animace (žeň vestoje,
  cep, česání z žebříku, sezení starších) přijdou později.
- Jména lidí se nezobrazují – panel postavy ukáže roli, činnost, věk a dům.
- Provoz na cestách je proud (kolik lidí je na cestě, určí cesty za den a délka cesty) – postava
  v proudu je člověk z té domácnosti, ale jeho práce na poli se pak neukazuje.
