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
- **Vzhled:** muži a ženy podle činnosti (jádro pohlaví nezná), oděv nebarvený, hnědý nebo okrový,
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
- **Na pole a zpět** – jedna cesta za den na člověkoden polní práce (kopání, setí, pletí, žeň,
  seč na dílu, zakládání); od domu, ke kterému díly dnešní fronty patří (holdings.ts), k jeho
  prvnímu dílu.
- **Kolik nejvýš:** 24 lidí na cestách (`MAX_TRAFFIC`, nad to poměrně méně). Každý druh cesty,
  po které někdo chodí, má aspoň jednoho člověka. Vlkov (28 lidí, voda ≈ 500 m od domů) ve žních:
  7 pro vodu, 4 na pole a 6 nosičů úrody, kteří teď chodí celých 470 m; v prosinci 8 pro vodu
  a 1 pro dřevo; v létě s dvoukolákem, který vodu většině domácností přiveze, 2 pro vodu.
- **Lidé v proudu** jsou rozestoupení (fáze se zlatým řezem – přibude-li člověk, ostatní zůstanou,
  kde byli), doma mezi cestami na chvíli zmizí (zajdou dovnitř). Vyjdou z nejbližšího volného
  místa u vchodu – u pozemků vedle sebe i o pár metrů dál.
- **Pochůzka se dokončí** – Martin (24. 10. 2026): „Postavy musí svou činnost dokončit. Například
  ženy nesoucí vodu nesmí z cesty náhle zmizet, ale musí dojít domů a do toho domu vejít.“
  Podrobnosti návrh Clauda:
  - **Pochůzka je celý cyklus:** vyjde z domu (volné místo u vchodu) → jde k cíli → u cíle pracuje
    (voda – nabírá, dřevo – sbírá, milíř a pole – chvíli postojí) → vrací se s nákladem → vejde do
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

## Zjednodušení a co chybí

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
