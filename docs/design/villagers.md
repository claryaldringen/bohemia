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
  minimum → polní a sadové práce → opravy → domácí výroba → společná práce do staveb).
- **Nejvýš 60 pracujících** – větší ves se poměrně zmenší. Lidé pracují pohromadě: v každé
  činnosti po skupinách až čtyř tam, kde je práce nejvíc (ne každý na jiném z desítek polí).
- **Kde kdo je:**
  - pole – řady lidí na osévaných čtvercích: okopávání motykou (kopání i vracení přílohu), setí
    z nůše, pletí v předklonu, žeň srpem; skupiny se po pár dnech posunou po poli dál,
  - odnos úrody – nosiči s nůší mezi polem a nejbližším obydlím (sklizeň 30 + odnos 20 člověkodní
    na hektar – fields.md),
  - zakládání pole – dřevorubci u stromů na zakládaném čtverci, ostatní okopávají drn,
  - výmlat – v zimě u vsi na udusaném místě mimo pole (cep zatím nahrazuje palička),
  - stavba obydlí – nejdřív dřevorubci u stromů vyhrazených pro stavbu (forest.md), přebyteční
    nosí dřevo ke staveništi; pak stavitelé kolem staveniště (v první čtvrtině kopou jámu),
  - opravy a přestavba – u obydlí, výsadba sadu – okopávání čtverců, které se sázejí, sklizeň
    a péče – pod jabloněmi, hřbitov – na obvodu ohrazovaných čtverců (nikdy na hrobech),
  - domácí práce – ženy před vchodem, některé chodí pro vodu a dřevo kousek od domu,
  - nevyužitá společná práce – dvojice postávající u domů.
- **Venku je jen část domácí práce** (domácí výroba se dělá uvnitř – v létě polovina, v zimě
  čtvrtina) a v zimě jen třetina nečinných. V zimě je tak venku méně lidí: výmlat, kácení,
  stavby, péče o sad.
- **Navíc, mimo práci vsi:** starší u domů (na dva jednoho, nejvýš čtyři, v zimě polovina; šediny)
  a děti jako pasáčci – jedno u každého stáda, když ves děti má.
- **Vzhled:** muži a ženy podle činnosti (jádro pohlaví nezná), oděv nebarvený, hnědý nebo okrový,
  vdané ženy s lněným nebo mořenou barveným šátkem. Pod každou postavou měkký stín.
- **Nikdo nestojí ve vodě, v domě, v jámě, v oplocené zahrádce ani na hrobech;** kdo chodí,
  obchází domy.
- **Vymřelá ves** (ani lidé, ani práce) – nikdo.

## Zjednodušení a co chybí

- Noc se nemodeluje – lidé pracují pořád (herní den trvá ≈ 86 s).
- Pohyb běží ve skutečném čase jako u domácích zvířat – ve zrychleném světě se lidé nehýbou
  rychleji. Klipy se střídají střihem (zapečené animace Babylonu prolínání neumějí).
- Animace z 0 A.D.: žeň je klečící práce srpem (`gather_meat`), pletí sběr bobulí, výmlat
  palička (`citizen/build`), sklizeň jablek nízký sběr ovoce – vlastní animace (žeň vestoje,
  cep, česání z žebříku, sezení starších) přijdou později.
- Postava neví, komu patří – domácnosti a jména se nezobrazují.
