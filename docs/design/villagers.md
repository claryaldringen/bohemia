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

## Činnosti od začátku do konce (návrh Clauda; Martin 31. 10. 2026)

Stav: **návrh ke schválení** – v kódu zatím nic.

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
- **Tři druhy činností:**
  1. **Pochůzka** – pevná délka, **vždy celá**: vyjde ze dveří → jde k cíli → u cíle pracuje →
     vrací se s nákladem → vejde. Voda, dřevo, nosiči úrody, nosiči kováře a hrnčíře, dřevo ke
     staveništi.
  2. **Práce na místě** – pružná délka: řada na poli, stavba, kácení, sad, hřbitov, výmlat,
     dílna, domácí práce u domu, nečinní, starší, pasáček, cvičiště. Začne příchodem pěšky (ode
     dveří nebo z minulého místa) a trvá, **dokud ji obsazení dne člověku dává**; místo se posouvá
     s frontou práce (čtverec hotový → další, strom padl → další) – vždy pěšky.
  3. **Doma** – postava není vidět (zašla dovnitř).
- **Ve frontě je jen další činnost:** přelom herního dne rozběhnutou činnost nepřeruší. Když
  činnost skončí, člověk si vezme **další podle obsazení dne, který je právě teď** – ne podle dne,
  kdy na ni vznikla práce. Doslovná fronta (každý den přidá svou práci) by rostla ≈ 10× rychleji,
  než ji scéna stihne zahrát, a za skutečný den by scéna zaostávala o týdny.
- **Práce na místě drží aspoň 2 minuty** (`MIN_BOUT_S`, ≈ 1,4 herního dne), ať se lidé při
  kolísání práce ze dne na den nepřesouvají sem a tam. Pak skončí na nejbližším přelomu dne, kdy
  ji obsazení člověku nedává – dojde krok v řadě a jde k další činnosti.
- **Směna** (`SHIFT_S` 30 minut ≈ 21 herních dní): rozvrh každého člověka je rozdělený na směny
  posunuté losem podle člověka (seed vsi a id), ať se nestřídají všichni naráz. **Na začátku
  a konci směny je člověk doma** – poslední činností směny je cesta domů a pochůzka, která by se
  do konce směny nevešla, nezačne (člověk zbytek dělá u domu, nebo je doma). Směna je delší než
  nejdelší pochůzka (nosič úrody z dílu 800 m od obydlí ≈ 21 minut). Díky ní je rozvrh **čistá
  funkce**: co člověk dělá teď, záleží jen na jeho současné směně, ne na celé historii.
- **Úlohy u jiného objektu** – pasáček u stáda, oráč a honák u spřežení, vozka u vozu, první
  stavitel u stavby s dnešní prací – konec směny nemají: drží je, dokud je obsazení dne dává
  (objekt je ve scéně celý den), a teprve pak jdou domů. Stavba tak dál „neroste sama od sebe“
  (Martin 18. 10. 2026).
- **Příklad** (Vlkov ve žních): žena rolníka začne směnu v 10:00 a jde pro vodu (500 m). Vrátí se
  v 10:11 – mezitím uběhlo 8 herních dní a simulace přešla ze žně na výmlat. Vezme si práci podle
  dnešního obsazení, výmlat u vsi, a dojde k mlatu. V 10:28 odejde domů, v 10:30 vejde a s novou
  směnou zase vyjde.

### Kolik postav a jak scéna nezaostává

- **Postava zastupuje práci, ne každý člověkoden.** Kolik lidí co dělá, určuje obsazení dne jako
  dnes (člověkodny → postavy, nejvýš 60 pracujících a 24 na cestách), ne počet pochůzek, které
  simulace za den udělá. Vlkov: ≈ 11 cest pro vodu za herní den, ve scéně 7 žen, které chodí jedna
  za druhou – za jednu jejich cestu simulace odbaví ≈ 90.
- **Scéna zaostává nejvýš o jednu pochůzku** (Vlkov voda 8–10 herních dní, blízké cíle 2–5 dní);
  práce na místě nejvýš o `MIN_BOUT_S`. Nic se nekupí – kdo dojde, vezme si, co je teď.
- **Kdy se rozběhnutá činnost zkrátí nebo přeskočí:**
  - jiné místo práce (fronta pole se posunula, strom padl, stavba je hotová) – práce na místě
    pokračuje na novém místě, kam člověk dojde pěšky; **pěšky i dál než 90 m** (dnes se objeví),
  - jiné roční období nebo konec práce (doseto, dožato) – práce na místě skončí na prvním přelomu
    dne bez ní (po `MIN_BOUT_S`); pochůzka se dojde, další už se nevybere,
  - vůz přiveze vodu (`cartWater`) – rozběhnutá cesta pro vodu se dojde, další ne,
  - zbořený dům cíle – člověk dojde k místu dveří a zmizí (jako dnes),
  - smrt, odchod a další události – níž.
- **Člověk, kterého obsazení dne nemá** (proud klesl, ves se zmenšila), dokončí rozběhnutou
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
- **Zima** – rozběhnuté pochůzky se dojdou, práce na poli skončí přelomem dne bez ní; venku je
  pak méně lidí podle obsazení jako dnes.
- **Přeskok času** (vývojový skok, jiné hodiny světa) rozvrhy spočítá znovu pro nový čas – tady
  je skok dovolený.

### Determinismus a načtení stránky

- Rozvrh člověka je **čistá funkce** začátku směny (seed vsi, id člověka, skutečný čas), obsazení
  dnů od začátku směny a délek činností (ze sítě pěšin – Cesty postav). Stejný okamžik = stejná
  póza; za snímek se nic nepočítá krokově.
- **Po načtení stránky** se každý člověk „dohraje“: spočítá se jen jeho současná směna od začátku
  (≤ 30 minut, pár činností) a postava stojí, kde má – uprostřed cesty k vodě, v řadě na poli –
  bez přehrávání historie (svět běžel i předtím, jako dnes u proudu).
- **Obsazení dnů, které prohlížeč neviděl** (před načtením stránky), nahradí nejstarší známé, tedy
  dnešní. Prohlížeč otevřený celou dobu a nově načtený se tak mohou lišit nejvýš do konce směny
  každého člověka (≤ 30 minut), pak ukazují totéž. Úplná shoda hned po načtení by potřebovala
  rozdělení práce posledních ≈ 21 dnů ze serveru (otázka 2).
- **Co už běží, se nepřepočítá:** rozběhnutá činnost si drží trasu a časy, se kterými začala
  (i když dorazí síť pěšin nebo na trase vyroste dům); nové údaje platí od další činnosti.
- **Los, kdo co dělá** (`DayRoster`), se mění jednou za roční období, ne každý den (otázka 3) –
  stejná žena nosí vodu a stejní muži žnou, dokud se práce nezmění; obsazení dne se pak mění jen
  tam, kde se změnila práce.

### Výběr postavy

- Postava **je** rozvrh jednoho člověka, panel (`lib/person-activity.ts`) proto čte činnost a úsek
  přímo z rozvrhu: „žena rolníka – jde pro vodu“ platí celou cestu tam, „nabírá vodu“ u vody
  a „nese vodu“ až ke dveřím, i když simulace mezitím přešla na výmlat; pak „doma“ a s další
  činností to, co dělá dál.
- Panel se mění jen se změnou činnosti nebo úseku (`onPersonState` jako dnes), ne s přelomem dne.
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
- Obsazení dnů před načtením stránky se odhadne dnešním (shoda do konce směny).
- Lidé, kteří se stěhují k sousedovi nebo od něj, a lidé z okolí na svatbě rozvrh nemají (nejsou
  lidé vsi) – chodí jako dnes.
- Rozestupy v proudu dává los začátků směn (zlatý řez fází odpadne) – lidé občas jdou ve dvojici.
- Stavba, ke které první stavitel teprve jde (dokončuje pochůzku), může první den krátce růst bez
  něj – nejvýš po dobu jedné pochůzky.
- Smrt na cestě – postava zmizí (jediná výjimka z „činnost se dokončí“). Klipy dál střihem.

### Pro implementaci

Úlohy po sobě, každá ≤ 150 kroků, s testy (pravidla CLAUDE.md – Scéna; Ves: typy z jádra
a `lib/village-view.ts`, rozvrh je znovu nedefinuje – `PersonJob`, `LaborActivity` zůstávají):

1. **Rozvrh člověka – čisté funkce** (nový `apps/web/lib/scene/villager-schedule.ts`
   a `__tests__/villager-schedule.test.ts`, bez Babylonu): `SHIFT_S`, `MIN_BOUT_S`,
   `shiftStart(seed, personId, t)`, typ činnosti (`errand` / `bout` / `home` – začátek, konec,
   `PersonJob`, místo či trasa), `scheduleAt(personId, t, castOf, lengthOf)` podle pravidel výš.
   Testy: přelom dne pochůzku nepřeruší, další činnost podle dne, kdy začne, stejný čas = stejný
   výsledek, pochůzka, která se do směny nevejde, nezačne, úloha u objektu bez konce směny.
2. **Obsazení dne jako člověk → úloha** (`villager-plan.ts` – `planVillagersWithCrew`,
   `dayRoster`; `villager-plan-cast.ts` – `cast`, `figure`; `villager-roster.ts` – `DayRoster`):
   navíc vrátit mapu id člověka → úloha, póza nebo trasa, místo; los jednou za roční období (sůl
   ze seedu a čísla období místo dne). Testy ve `__tests__/villager-people.test.ts`
   a `villager-plan.test.ts` – los stejný přes dny období, obsazení se mění jen se změnou práce.
3. **Napojení ve scéně** (`villagers.ts` – `update`, `rebuild`, `animate`, `setPaths`): obsazení
   dnů v paměti (nejvýš 24 dnů), rozvrhy lidí místo postav dne, pevná zásoba instancí; pryč
   `carryErrands` a `WALK_OVER_M` (`villager-errands.ts` zůstane pro cykly pochůzek); výběr
   a `onPersonState` z rozvrhu (`lib/person-activity.ts`). e2e `apps/web/e2e/village.spec.ts` –
   vybraná postava drží činnost přes přelom dne.
4. **Cesta na pole jako součást práce** (podle otázky 4; `villager-plan-traffic.ts` –
   `trafficFigures` bez druhu „na pole a zpět“, `villager-plan-fields.ts` – `fieldRows`,
   `carriers` s příchodem ode dveří po `fieldPath`; `road-traffic.ts` –
   `FIELD_TRIPS_PER_MAN_DAY`), texty v Provozu na cestách.
5. **Události přerušují** (`funeral-plan.ts`, `wedding-plan.ts`, `villager-plan-fire.ts`,
   `caravan.ts`; `flood-water.ts` jen pro rozlitou vodu): událost přepíše rozvrh od svého začátku
   (příchod pěšky, opozdilci rovnou na místo), k požáru jen lidé ve vsi, z povodně domů. Test na
   každou událost.
6. **Délka ze sítě pěšin, přesná trasa jen v záběru** (`villager-plan-traffic.ts` – `errandPath`,
   `activeSeconds`; `villager-motion.ts` – `shuttle`, `alongRoute` s tempem podle poměru délek;
   `villagers.ts` – přesná trasa při vstupu do záběru a výběru), měření na Vlkově (přelom dne,
   snímek), zápis do `docs/code/village-people.md` (Postavy – lidé ve vsi) a sem („Implementováno
   …“).

| Rozhodnutí (návrh Clauda)                                     | Proč                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Postava = člověk napříč dny s vlastním rozvrhem               | výběr postavy sedí s tím, co postava dělá                  |
| Ve frontě jen další činnost, vybraná, až je na řadě           | doslovná fronta by rostla ≈ 10× rychleji, než se dá zahrát |
| Pochůzka vždy celá, práce na místě pružná (aspoň 2 min)       | pochůzka má začátek a konec (Martin 24. 10. 2026), řada ne |
| Směna 30 min, začátek a konec doma, posun losem podle člověka | čistá funkce bez historie, delší než nejdelší pochůzka     |
| Stádo, spřežení, vůz a první stavitel bez konce směny         | objekt je ve scéně celý den, stavba neroste sama od sebe   |
| Na nové místo vždy pěšky, i dál než 90 m                      | žádné skoky – dnes se vzdálenější postava objeví           |
| Délka činnosti ze sítě pěšin, přesná trasa jen v záběru       | stejné časy všude, přesná trasa jen tam, kde je vidět      |
| Noc a zima nepřerušují                                        | noc je zlomek herního dne, zimu ukáže obsazení dne         |
| Smrt postavu skryje hned                                      | mrtvý nechodí ani nejde vybrat (jako dnes)                 |
| K požáru jen lidé ve vsi                                      | vzdálení by k ohni nedošli, než dohoří                     |

**Otevřené otázky pro Martina:**

1. **Smí scéna zaostat o jednu pochůzku?** Žena, která vyšla pro vodu ve žních, ji donese, i když
   simulace mezitím (8–10 herních dní) přešla na výmlat; práce na poli se ukazuje nejvýš ≈ 2
   minuty po svém konci. Návrh Clauda: ano – to je „od začátku do konce“; kratší zpoždění by šlo
   jen rychlejší chůzí, a ta by nebyla skutečná.
2. **Mají dva prohlížeče ukázat totéž hned po načtení?** Bez historie se nově načtený od
   otevřeného liší nejvýš do konce směny (≤ 30 minut). Úplná shoda = server posílá rozdělení práce
   posledních ≈ 21 dnů (stav vsi o pár desítek kB větší). Návrh Clauda: zatím bez historie,
   doplnit, až se na jednu ves budou dívat dva hráči (pán a vazal).
3. **Kdo co dělá – los jednou za roční období místo každý den?** Stejná žena nosí vodu a stejní
   muži žnou celé období, dokud se nezmění práce. Návrh Clauda: ano – jinak by si lidé práci
   měnili po každé činnosti.
4. **Cesta na pole a domů jako součást práce?** Kdo pracuje na poli, jde tam ode dveří a na konci
   směny domů; samostatný proud „na pole a zpět“ zanikne. Na vzdáleném poli je pak v řadě méně
   lidí a víc na pěšinách (Vlkov, pole 350 m: čtvrtina až třetina polních dělníků na cestě).
   Návrh Clauda: ano – Martin 19. 10. 2026 chtěl vidět lidi, jak chodí na pole.

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
