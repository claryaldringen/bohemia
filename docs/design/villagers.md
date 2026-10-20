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
- **K lesu pro dřevo** – cesty na domácnost jako síť pěšin (léto 0,5, zima 1,2), jen do 220 m po
  pěšině; tam s prázdnýma rukama, zpět s otepí.
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
- **Schůdná země přes celou krajinu** (pole do 800 m od obydlí): buňky po 4 m se počítají až při
  prvním dotazu a pamatují se (`lazyWalkable`).
- **Vozy** s vodou, uhlím a osivem jezdí po vozové síti tam a zpět tempem volů ve skutečném čase
  (svoz úrody dál v okně herního dne – ladicí); voda v sudech, uhlí a osivo jako zboží
  (wagons.md – Co vozy vozí).
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

## Zjednodušení a co chybí

- Noc se nemodeluje – lidé pracují pořád (herní den trvá ≈ 86 s).
- Pohyb běží ve skutečném čase jako u domácích zvířat – ve zrychleném světě se lidé nehýbou
  rychleji. Klipy se střídají střihem (zapečené animace Babylonu prolínání neumějí).
- Animace z 0 A.D.: žeň je klečící práce srpem (`gather_meat`), pletí sběr bobulí, výmlat
  palička (`citizen/build`), sklizeň jablek nízký sběr ovoce – vlastní animace (žeň vestoje,
  cep, česání z žebříku, sezení starších) přijdou později.
- Postava neví, komu patří – domácnosti a jména se nezobrazují.
- Provoz na cestách je proud, ne jednotliví lidé domácnosti – člověk v proudu může jít pro vodu
  i ve chvíli, kdy jeho postava zároveň stojí na poli.
