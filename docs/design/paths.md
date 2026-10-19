# Vyšlapané pěšiny

Stav: Martin schválil 18. 10. 2026 („Ano, takhle to zní dobře. Zkusme to a uvidíme, jak to bude
vypadat ve hře.“). Stromy podél cest přes pole – Martin 18. 10. 2026 (v Estonsku a Dánsku stál
statek uprostřed svých polí a cesta k němu vedla přes pole, obvykle lemovaná stromy) – mají od 18. 10. 2026 jen **pevné cesty** ([roads.md](roads.md)), pěšiny dne ne. **Pěšiny ovlivňují práci** – Martin 18. 10. 2026 („Tam, kde bude vyšlapaná cesta, ať
se chodí o něco lépe než tam, kde není.“). **Vzhled pěšin dne** – Martin 19. 10. 2026 („denní
pěšina ať je nevýrazná. Vyšlapanou cestu nechme jako teď“), viz Jak pěšiny vznikají – Síla
pěšiny. **Po pevné cestě bez ohledu na povrch** – Martin 19. 10. 2026 („Když už někde vyšlapaná
cesta je, ať po ní lidé chodí bez ohledu na to, na čem ta stezka leží.“), viz Jak pěšiny vznikají
– Kudy. **Vchody** – Martin 19. 10. 2026 („A ještě, každá budova by měla mít nějaký vchod, od
kterého cesta povede.“), viz Vchody. **Pro vodu se chodí vždy** – Martin 19. 10. 2026 („Ve Vlkově
nikde nevidím vyšlapanou cestu k potoku. Ale vesničané tam přece musí chodit nějak pro vodu a musí
jim to zabírat čas.“, návrh schválil „Ano“), viz Pochůzky pro vodu. Síť počítá herní jádro
(`packages/game/src/domain/village/paths/` – `terrain.ts`, `network.ts`, `walking.ts`,
`village.ts`, `entrances.ts`) stejně na serveru i v prohlížeči; scéna `apps/web/lib/scene/path-renderer.ts`,
`path-ribbon.ts`, `path-router.ts`. Pevné cesty a stromy u nich: [roads.md](roads.md).

## Proč

Ves má být vidět jako místo, kde se žije: kudy lidé denně chodí, tudy je tráva vyšlapaná.
A po vyšlapané pěšině se chodí lépe – cesta na vzdálené pole po ní stojí méně práce.

## Jak pěšiny vznikají

- **Pěšiny spojují místa, kam lidé chodí každý den:** od brány domu pro vodu k potoku, pro
  dřevo k okraji lesa, na pole, do sadu, ke hřbitovu, k posvátným dubům, hájům, modle a svatyni,
  k hromadě klád, na staveniště, k ohradě (krmení dobytka), v době seče na přirozené louky
  (oxen.md – Seno) a k sousedům; pasáci ženou stáda na úhor.
- **Kolik se kam chodí:** voda podle lidí v domácnosti – vždy k nejbližší vodě, ať je jakkoli
  daleko (Pochůzky pro vodu), dřevo na domácnost (v zimní půlce roku víc), na pole, do sadu
  a na stavby podle dnešní práce (rozdělení práce dne z jádra, jeden
  člověkoden = jedna cesta) a k zavedeným místům trochu navíc, ať pěšina mezi pracemi nezaroste.
  Ke hřbitovu se chodí podle počtu lidí – hroby předků raní Slované navštěvovali pravidelně
  (obětiny, hostiny za mrtvé): 0,15 cesty za den na člověka, každá domácnost k nejbližšímu
  hřbitovu (Martin schválil, návrh Clauda; ves se 7 lidmi ≈ 1 cesta denně, se 40 lidmi ≈ 6).
  K zavedeným místům – posvátnému dubu, háji, modle, svatyni, hřbitovu a sadu – chodí každá
  domácnost jen k nejbližšímu místu daného druhu (Martin: lidé chodí jen k nejbližším věcem;
  nejbližší vzdušnou čarou od domu – návrh Clauda); práce dne (pole, stavby, kácení, práce
  v sadu) jde tam, kde se dnes pracuje – vylepšení pevné cesty a práce u jabloní podél ní
  ([roads.md](roads.md)) k polovině úseku.
  Pro dřevo se daleko chodí méně často (nad 130 m chůze úměrně méně, nejvýš 450 m) – pěšina
  k lesu vznikne, až když se cesty víc domácností slijí. ~~Daleko (voda, les) se chodí méně
  často.~~ Pro vodu ne – Pochůzky pro vodu. Ohrada (oxen.md) má k práci dne trochu navíc jako
  zavedené místo – jen
  ohrada se zvířaty (do prázdné se krmit nechodí – [abandonment.md](abandonment.md)). Stáda (diet.md – ovce
  s kozami po 20 kusech, krávy po 6, jako ve scéně) se denně vyženou na úhor a zpět – jedna cesta
  na stádo: mladý úhor vždy, louka na seno až po seči (srpen–listopad); v zimě stojí krávy
  v ohradě, prasata jdou do lesa (návrh Clauda).
- **Kudy:** lidé obcházejí prudké svahy, vodu (kromě mělkých brodů), domy se zahrádkami,
  kmeny, keře, balvany a skály, plot ohrady a hřbitova, lesem a zarůstajícím přílohem (křoviny,
  mladý les) neradi. ~~Přes oseté pole nechodí (jdou po jeho okraji).~~ ~~Pole lidi nezdržuje
  (Martin, 19. 10. 2026: „Ať lidé chodí vždy nejkratší možnou cestou a oseté pole ať neřeší.“)~~
  **Pole je cena, ne zákaz** (Martin, 19. 10. 2026: „Pole, které zrovna neleží ladem: 0.5.“,
  „Neber strniště jako louku, ale dej mu drobný postih. Ber to třeba jako 0.8.“ a „nejkratší cesta
  je ta nejrychlejší. Tj. může se stát, že někde bude jednodušší jít přes pole, než ho obcházet
  i když je cesta přes pole pomalejší.“): **ceny buněk** = 1 / rychlost chůze proti louce
  (roads.md – Rychlejší chůze, `walk-speed.ts`) – louka, úhor, příloh a zakládaný díl 1, díl
  v osevu od orby nebo kopání po sklizeň 2 (rychlost 0,5), strniště 1,25 (0,8), mokřina 2 (0,5),
  pevná cesta podle stupně (vyšlapaná a vyježděná 1 / 1,5, upravená, hať a lávka 1 / 1,7 – přes
  mokřinu vyšlapaná a upravená 2, hať 1 / 1,7); plná pěšina dne 1 / 1,3 krát cena buňky (slabší
  úměrně síle), přes díl v osevu pěšina nezrychlí. Nejpomalejší z mokřiny a pole platí. Díl pozná
  síť podle vzhledu (`look` – jako scéna, `partWalkSpeed`). Síť hledá nejrychlejší cestu: díl
  v osevu obejde, když je obcházení krátké, a jde přes něj, když je dlouhé. Vozy přes osetý díl
  dál nejezdí ([wagons.md](wagons.md)) – Martin mluvil o lidech. **Po pevné cestě ([roads.md](roads.md)) se jde
  bez ohledu na to, na čem leží** (Martin, 19. 10. 2026, Vlkov: „Je tam vidět, že na nový hřbitov
  vedla nejkratší cesta, kolem které dokonce byly nějaké stromy (jabloně) a ta zanikla a lidé to
  začali obcházet divnou delší cestou.“ a „Když už někde vyšlapaná cesta je, ať po ní lidé chodí
  bez ohledu na to, na čem ta stezka leží.“): pevná cesta přes osetý díl, zoranou zem, sad, les
  nebo svah stojí jako cesta přes louku – je to mez, po které se chodí. Dál platí jen brod
  a neprůchodná místa a ploty a stavby (hřbitov, ohrada, svatyně, domy a pozemky) – podrobnosti
  v [roads.md – Cesta je cesta](roads.md#cesta-je-cesta--povrch-pod-ní-a-zarůstání).
- **Vozy** ([wagons.md](wagons.md) – Vozová síť; Martin, 19. 10. 2026: „ve svahu, kde lidé
  zvládnou chodit rovně, vůz bude muset vyjezdit serpentiny“) mají vlastní síť na stejné mřížce
  (`paths/cart.ts`): sklon ve směru jízdy nejvýš 10 %, směr jízdy v hledání (poloměr otáčení),
  les jen po pevné cestě, voda jen brodem. Vyjeté vozové cesty jsou pevné cesty s příznakem vozová
  ([roads.md](roads.md) – Vozové cesty) – lidé po nich chodí jako po každé pevné cestě, síť pěšin se
  kvůli vozům nemění (ves bez vozů beze změny bit po bitu).
- **Slévání:** vyšlapaná pěšina je pohodlnější (až o polovinu), takže kdo jde po ní, jde i kus
  oklikou – trasy sousedů se slijí do společné pěšiny a vznikne síť. **Žádné souběžné pěšiny**
  (Martin, 18. 10. 2026: „Pokud už cesta vede tím směrem, lidé by měli použít tu, ne si prošlapat
  vlastní souběžnou.“): ke společnému cíli (pole, sad, staveniště…) jde každá domácnost zvlášť,
  nejvytíženější první, a další se k pěšině, kterou ta před ní právě vyšlapala, přidá – dřív
  hledalo jedno hledání trasy ke všem branám naráz a dva sousední domy (12–24 m od sebe) měly
  každý vlastní souběžnou pěšinu na pole. Po **pevné cestě**
  ([roads.md](roads.md)) se jde jako po plné pěšině, takže se k ní pěšiny dne stahují; kde vedou
  po ní, ztratí se v ní (kreslí se jen cesta).
- **Síla pěšiny** roste s počtem cest za den (pomalu – s odmocninou), jednotlivé cesty nic
  nevyšlapou. **Pěšina dne je nevýrazná** (Martin, 19. 10. 2026: „denní pěšina ať je
  nevýrazná“) – slabě prošlapaná tráva: pás 0,6–1,2 m podle síly (dřív 0,9–1,9 m), krytí
  0,2–0,45 (dřív 0,5–0,95), holá hlína jen u silné pěšiny, nanejvýš úzká (do 0,35 m) a slabá
  (návrh Clauda). Pevná cesta ([roads.md](roads.md)) je vedle ní jasně výraznější – plný pás
  1,9 m, upravená 3 m. **Rozcestí** (sejdou se aspoň tři pěšiny) je nejvyšlapanější místo
  (Martin, 18. 10. 2026): plácek – kruh, síla nejsilnější přicházející pěšiny + 30 % síly
  ostatních (nejvýš plná), pásy do něj vbíhají bez zúžení (`ribbonJunctions` v `path-ribbon.ts`).
  U pěšin dne jen jemně – poloměr jako šířka pěšiny a krytí o 15 % slabší (návrh Clauda, 19. 10. 2026); udusaný plácek o poloměru 1,3× šířky mají pevné cesty ([roads.md](roads.md)).
- **Objevuje se a mizí:** spojení nového obydlí se vyšlapává dva roky, zrušené místo pěšinu
  ztratí (v prototypu hned). Práce se mění s rokem – pěšina na pole je v žních silnější.
- **Vidět jsou i v polích:** pěšina se kreslí nad poli – přes úhor a pastvinu jako prošlapaný
  pás; přes osetý díl jen úzká stopa (Martin: stromy u cesty bez cesty mátly). Od 19. 10. 2026
  vedou pěšiny přes pole nejrychlejší cestou – přes díl v osevu, jen když je obcházení delší
  (Kudy – pole je cena, ne zákaz).
- **Roční období:** tráva v pěšinách usychá jako louka, v zimě je zasype sníh – stopa pěšiny
  dne ve sněhu pořád trochu prosvítá (sníh ji zasype jen ze 30 %, pevnou cestu z 55 % – ta
  prosvítá zřetelně).
- **Stromy podél pěšin** už nejsou – rozmisťovaly se znovu s každou změnou sítě dne a přeskakovaly
  (rozbor 18. 10. 2026). Nahradily je **stromy u pevných cest** ([roads.md](roads.md)): herní
  data, která vyrostou z keře, stojí na místě a odumřou stářím.
- **Lidé chodí po pěšinách:** nosiči z pole, nosiči dřeva ke stavbě a ženy pro vodu a dřevo jdou
  na nejbližší pěšinu, po ní a z ní k cíli; kde pěšina nevede (nebo by byla velká oklika), jdou
  rovnou. Po pěšině jdou viditelně rychleji (a rychleji kráčí).

## Vchody

Martin (19. 10. 2026): „A ještě, každá budova by měla mít nějaký vchod, od kterého cesta
povede.“ Podrobnosti návrh Clauda.

- **Každá stavba má vchod a pěšina vede k němu** – ne kamkoli k plotu. Vchod počítá jedna funkce
  herního jádra (`paths/entrances.ts`) pro síť pěšin (server i prohlížeč) i pro scénu, která tam
  kreslí branku – vchod v síti a branka ve scéně se nerozejdou.
- **Obydlí:** brána před koncem šíje, u pozemku polozemnice branka v plotu proti vchodu domu, u
  dvorce vojvody brána na vzdálené straně dvora, u dílen hrnčíře a kováře vchod pod přístřeškem
  (brána 1 m před domem leží pod ním), u uhlíře vchod do zemnice – tak to síť dělala už dřív
  (`gateOf`) a se scénou to sedí (ověřeno). **Brána do souseda:** padne-li brána do cizího
  pozemku nebo domu (Vlkov, 19. 10. 2026: polozemnice přední stranou k pozemku dvorce – domácnost
  vypadla ze sítě a neměla žádnou pochůzku, ani pro vodu a dřevo), vyjde domácnost z nejbližšího
  volného místa do 7,5 m kolem svého obydlí (`gateAround`, návrh Clauda). Bez volného místa kolem
  (obydlí celé obestavěné) zůstává mimo síť. **Nová obydlí to mít nesmí** (Martin, 19. 10. 2026:
  „Ano, zakaž to“): kontrola umístění se ptá stejného místa (`dwellingGatePoint`) a odmítne
  branku či vchod do cizího pozemku, obydlí, modly, svatyně, hřbitova, ohrady i vody – a novou
  stavbu, která by branku stojícího obydlí zatarasila ([population.md](population.md) – Umístění
  obydlí).
- **Hřbitov:** branka v pleteném plotu na rovném úseku nejblíž k nejbližšímu hotovému obydlí (od
  středu hotových čtverců), aspoň kůl od zakulaceného rohu. Dřív ji počítala jen scéna a nikde se
  neukládala – teď ji počítá jádro (`cemeteryEntrance`) a scéna ji převezme. Hotový hřbitov má
  branku v plotu hotových čtverců (rozšíření ve stavbě branku nemá – dokud se staví, branka
  zůstává na místě), zakládaný v plotu všech čtverců. Branka se dál posune, když se postaví
  obydlí blíž, nebo když se rozšíření dostaví – jako dřív ve scéně.
- **Ohrada:** branka ze žerdí na straně k nejbližšímu obydlí, posunutá po té straně k němu
  (`penEntrance`) – u natočené ohrady v jejích osách.
- **Modla:** vstup na předku (+z modelu, kam hledí tváře a stojí obětiny) na okraji půdorysu
  4 × 4 m. **Svatyně:** příkop nemá přerušení – vstup je na předku přes hrot okvětí, kde je příkop
  nejužší, za valem 13,5 m od středu (`sacredEntrance`).
- **Sad, pole a louky** budovy nejsou a vchod nemají: sad nemá plot, pracuje se v něm všude
  (česání, péče u každého stromu), takže pěšina vede k nejbližšímu okraji jako dřív (rozhodnutí
  Clauda).
- **Kdo jde vchodem:** pěšiny dne i roční síť (pevné cesty) – návštěvy hřbitova, krmení dobytka
  a práce v hotové ohradě, návštěvy a oprava modly a svatyně. **Staveniště** (zakládaný hřbitov
  a jeho rozšíření, ohrada ve stavbě, rozestavěná modla a svatyně) mají práci ze všech stran jako
  dřív – plot nebo příkop teprve vzniká. Postavy přes plot nechodily ani dřív (stavitelé a krmiči
  stojí za plotem, hroby a ohrady obcházejí, zvířata v ohradě stojí na svých místech), takže se
  jich změna netýká.
- **Rozcestí a staré vsi:** pěšina k vchodu se napojí jako u brány domu a pevné cesty se k ní
  stáhnou samy (sleva za pevnou cestu). Staré vsi se načtou beze změny, síť se přepočítá podle
  klíče rozložení vsi (`walkLayoutKey` – hotový hřbitov má klíč jako dřív, nový je jen u
  zakládaného hřbitova a rozšíření). Pevné cesty, které dnes končí jinde u plotu, se nechají být:
  provoz se přesune k vchodu, cesta k vchodu vznikne z provozu sama a nepoužívaná vyšlapaná cesta
  zaroste podle stávajících pravidel ([roads.md](roads.md)) – měnit hráči cesty naráz by bylo
  proti pravidlu, že se cesta nikdy nehýbe sama od sebe.

## Pochůzky pro vodu

Stav: Martin 19. 10. 2026 – „Ve Vlkově nikde nevidím vyšlapanou cestu k potoku. Ale vesničané tam
přece musí chodit nějak pro vodu a musí jim to zabírat čas.“ Návrh níže schválil („Ano“),
podrobnosti a čísla návrh Clauda.

Ve Vlkově stály všechny domy 465–790 m od vody vzdušnou čarou, pochůzky ale sahaly jen do 450 m
chůze po louce (a za 130 m se chodilo úměrně méně často) – pro vodu se nechodilo vůbec, pěšina ani
pevná cesta k potoku nevznikla a čas na vodu byl jen v pevném denním minimu.

- **Kam:** vždy k nejbližší vodě – suchý břeh u potoka (místo na břehu mimo stavby vsi), bez
  horní meze vzdálenosti. **Okno sítě pěšin sahá vždy k vodě** (Martin chce pěšinu k potoku
  vidět vždy): leží-li nejbližší vodní políčko některého obydlí mimo okno staveb (stavby ± 240 m),
  okno se rozšíří jen k němu (± 45 m kolem středu políčka, zaokrouhleno na 90 m) – ne o celé okolí
  (`villagePathBounds`, stejně na serveru, v roční síti i ve scéně). Voda dál než 1 000 m od obydlí
  se do okna nebere (výpočet zůstane krátký) – taková ves pro vodu nechodí nikam. Ves 525 m od
  vody bez staveb k ní: okno 540 × 630 m → 540 × 900 m, síť ≈ 2 → 12 ms; Vlkov (voda v okně už
  byla) beze změny.
- **Kolik:** 0,4 cesty (tam a zpět) na člověka domácnosti a den – i daleko naplno, v denní
  i roční síti stejně (`WATER_FETCHING` v `rules.ts`). Pro dřevo beze změny.
- **Pěšina a cesta:** pochůzky domácností se slévají na společnou pěšinu jako dřív; kudy se chodí
  aspoň 3× denně dva roky, vznikne pevná cesta k vodě ([roads.md](roads.md)). Vlkov: pěšina
  k potoku hned, pevná cesta k vodě (≈ 425 m) po dvou ročních kontrolách.
- **Čas je práce:** chůze pro vodu nad 100 m se přičte k dennímu minimu domácnosti
  ([population.md](population.md) – Práce, [fields.md](fields.md) – Práce): cesty × 2 × (chůze
  k vodě − 100 m, nejméně 0) ÷ rychlost ÷ délka dne. Prvních 100 m je v ceně denního minima (WHO:
  voda do 100 m nebo 5 minut je „intermediate access“ – Howard a Bartram 2003). Rychlost 1 m/s po
  louce tam a zpět s vodou (pohodlná chůze po rovině 1,3–1,4 m/s – Bohannon 1997; WHO: do 1 km
  nebo 30 minut sběru tam a zpět ≈ 1,1 m/s i s čerpáním), den 10 h (jako přepočty rešerše
  2026-10-17). Domácnost 6 lidí s vodou 440 m chůze daleko: 2,4 cesty × 2 × 340 m ≈ 27 minut ≈
  0,045 člověkodne denně; celý Vlkov (24 lidí) ≈ 0,18 člověkodne denně. Starší ji kryjí jako
  zbytek minima.
- **Chůze k vodě** (`Dwelling.waterWalkM`) se měří z obydlí k místu na břehu nejblíž vzdušnou
  čarou stejně jako palivo (Pěšiny a práce) – po pěšinách dne a pevných cestách podle rychlostí
  chůze, rovně s mokřinou, brody a poli. Jedna funkce (`waterWalkDistance`) – jde počítat i jen po
  pevných cestách nebo rovně krajinou (kdyby pěšiny dne zmizely). Bez krajiny (kalibrace) se
  neměří a přirážka není.
- **Co hráč vidí:** přirážku jen přes práci – volná práce v liště, rozdělení práce dne (víc žen
  u domácí práce). Ve scéně ženy chodí pro vodu po pěšině domácnosti i k vzdálené vodě (pro dřevo
  jen do 220 m od domu).
- **Voda vozem** ([wagons.md](wagons.md) – Co vozy vozí; Martin 19. 10. 2026: „Pokud budou mít
  k dispozici vůz, ať na pole, pro vodu nebo pro dřevěné uhlí jede vůz.“): má-li ves volný
  dvoukolák se spřežením, vozí vodu v sudech (300 l na jízdu, 10 l na člověka a den) domácnostem,
  kterým jízda ušetří práci – přirážka za vodu se zmenší o přivezenou vodu a přičte se díl práce
  posádky (jízda vozovou sítí na suchý břeh, kam vůz sjede, nabírání a rozlití). Vyplatí se
  ≈ 170–200 m od vody a dál; kam vůz nesjede, nosí se. Jízdy jdou do ročního provozu cest (k vodě
  může vzniknout vyježděná cesta). Pochůzky domácností v síti pěšin zůstávají (zjednodušení –
  postavy na cestách jsou samostatný úkol).

## Pěšiny a práce

Stav: Martin 18. 10. 2026 („Tam, kde bude vyšlapaná cesta, ať se chodí o něco lépe než tam, kde
není.“), rychlosti Martin 19. 10. 2026 („berme louku za výchozí: 1 vyšlapaná denní cesta 1.3 stálá
vyšlapaná cesta 1.5. Pole, které zrovna neleží ladem: 0.5. Upravená cesta: 1.7 – tyhle hodnoty se
týkají chůze.“ – tabulka v [roads.md](roads.md) – Rychlejší chůze), zbytek návrh Clauda.

- **Po plně prošlapané pěšině dne se chodí 1,3× rychleji než po louce** (slabší úměrně méně
  podle síly – úsek stojí (1 − (1 − 1 / 1,3) × síla) × délka; `PATH_WALK` v `rules.ts`), přes díl
  v osevu pěšina nezrychlí. Po pevné cestě podle stupně, mokřina a brody – [roads.md](roads.md) –
  Rychlejší chůze. Síť pěšin (Kudy – ceny buněk) i vzdálenost chůze jdou stejně rychle.
- **Vzdálenost dílu pole pro práci** (fields.md – Vzdálenost) se měří chůzí z nejbližšího
  obydlí: rovně, nebo rovně k pěšině, po ní a rovně od ní na díl – kratší z obou. Rovně se počítá
  mokřina (0,5×), brody (+ 30 m) a pole – díl v osevu 0,5×, strniště 0,8× (`withFieldWalk` podle
  vzhledu dílů); les, svah a sad chůzi pro práci nezdražují, po pevné cestě rozhoduje jen stupeň,
  mokřina a brody na ose (Martin, 19. 10. 2026 – po cestě bez ohledu na to, na čem leží). Díl za
  potokem nebo uprostřed oseté plochy tak může být dál než vzdušnou čarou. Stejně se měří čtverce
  sadu a palivo (obydlí → okraj lesa).
- **Kdy se přepočítá:** když se změní rozložení vsi – nové obydlí nebo staveniště, nová pole
  a díly, sady, hřbitovy, posvátná místa, pevné cesty, ohrady, stáda, kdo kde bydlí a stáří
  spojení (nová pěšina se vyšlapává dva roky). **Stadia dílů (osev, úhor, pastva na úhoru) se
  promítají jen jednou za měsíc – k 1. dni měsíce** (i rychlost chůze přes díl – v osevu,
  strniště: `walkStageKey`) (Martin, 18. 10. 2026: chůze se přepočítává
  měsíčně – osev a zakládání postupují po dílech den po dni a síť se přepočítávala každých pár
  dní). Simulace to kontroluje den po dni, výsledek tak nezávisí na tom, po jakých kouscích se ves
  dopočítá. Do sítě jde i práce posledního dne (kam ves chodí) a stadia dílů v den přepočtu, ale
  kvůli nim samotným se nepřepočítává.
- **Uložení:** vzdálenost chůze každého dílu a čtverce sadu (`walkDistanceM`) a obydlí k okraji
  lesa (`forestWalkM`) a k vodě (`waterWalkM` – Pochůzky pro vodu); vsi uložené dřív si je
  spočítají při prvním dopočítání s krajinou.
  Kalibrace (bez krajiny) počítá dál s přímou vzdáleností.
- Server i prohlížeč počítají stejnou funkcí – pěšiny ve scéně jsou tytéž, po kterých se
  počítá práce (v prohlížeči z dnešní práce dne, na serveru z rozložení při poslední změně).

## Zjednodušení a co chybí

- Síť si historii nepamatuje: síla je z práce posledního dne a stáří obydlí (u vsí bez stáří
  obydlí jako by stála odjakživa); opuštěná pěšina hned zmizí, nezarůstá postupně. Pamatují si ji
  až pevné cesty ([roads.md](roads.md)) – vznikají z celoročního provozu a zarůstají za 5 let.
- Ke hromadě klád se pěšina nekreslí (její místo zná jen scéna).
- Stáří pole server zatím neposílá – nově zakládané pole má pěšinu napoloviční.
- Brody jsou jen mělké úzké úseky potoka; lávku staví hráč na pevné cestě ([roads.md](roads.md)),
  mosty pro vozy nejsou.
- Pěšina sama nic neodstraní (keře a kameny na ní stojí dál – jen se jim vyhne).
