# Válka – nájezd na sousední ves

Stav: návrh k 18. 10. 2026, čeká na schválení. Implementace zatím není.

## Proč

Raně slovanská válka byla hlavně nájezd: muži ze vsi vyrazí na sousedy, vezmou zásoby, dobytek
a lidi a vrátí se. Hráč tak má další cestu, jak ves posílit – za cenu mužů, kteří mezitím chybí
doma, a rizika, že padnou (Martin). Nájezd zároveň otevírá svět: sousední mapy a první vsi navíc
k panství.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč vezme ze vsi **libovolný počet mužů** a vtrhne do sousední vsi; práce doma se
  **úměrně zpomalí** (Martin).
- **Cíl:** padlí muži mohou ves ekonomicky položit až k vymření (Martin).
- **Cíl:** **kovárna** dává mužům bonus v boji (Martin).
- **Cíl:** útočníci postupují **dům od domu**; osamělé domy se neubrání, **sevřená ves** se
  shromáždí a postaví se – výhoda proti roztroušeným samotám (Martin).
- **Cíl:** obránci se mohou **bránit, vzdát nebo utéct do lesů**; vzdaný dům útočník pobije nebo
  odvede (Martin).
- **Cíl:** útočníky **vždy řídí hráč** – nájezd se hraje živě, hráč může výpravu **kdykoli
  odvolat** (Martin).
- **Cíl:** sousední vsi ovládá **NPC vojvoda, který hraje jako skutečný hráč**; když hráč zvítězí,
  vojvoda se svou vsí se stane jeho **vazalem** (Martin).
- **Ne-cíl (teď):** hradiště a obléhání, družina, zbraně jako suroviny, diplomacie, příměří,
  výkupné, vazalské povinnosti, námořní výpravy.
- **Anti-cíl:** ves zničená, zatímco hráč spí, bez šance – obránci se řídí postojem, který si
  hráč nastavil.

## Svět – sousední mapy (Martin)

- Krajiny sídel leží v **mřížce**: každé sídlo má 8 sousedů (S, SV, V, JV, J, JZ, Z, SZ).
- Vojsko vytáhne k jednomu z okrajů své mapy; **za hranicí se načte sousední mapa** se sousední
  vsí. Kdo odešel na jih, objeví se na sousední mapě na severu (Martin).
- **Přechod = cesta:** přechod na sousední mapu trvá **1–3 herní dny** (podle terénu – návrh
  Clauda; načítání mapy je jen zobrazení cesty, herní čas běží dál).
- **Kdo na sousední mapě je:** jiný hráč, nebo ves **NPC vojvody**, který ji vede jako skutečný
  hráč – staví, zakládá pole, roste a brání se (Martin); jeho ves počítá stejná simulace jako
  hráčovy, rozhodnutí místo hráče dělá jednoduchá umělá inteligence (návrh Clauda). Nebo pustá
  krajina.
- **Mlha války:** útočník cizí mapu **nevidí** – objevuje ji postupně, kam dohlédnou jeho muži
  (Martin; dohled ≈ 150 m, v lese míň – návrh Clauda). Objevené místo zůstane na mapě, ale co se
  tam děje, vidí jen v dohledu.
- **Terén:** muži projdou skoro vším; **hustým lesem se prodírají velmi pomalu** (≈ 1/4 rychlosti
  – návrh Clauda) a **vodu překonají jen po brodech** (Martin). Brody krajina už zná (mělká a úzká
  místa potoka).
- Vojsko si nese **jídlo na cestu** (obilí, maso) – bez něj se po 3 dnech vrací (návrh Clauda).

## Vojsko

- Hráč vybere počet mužů (14–44 let) posuvníkem; ves bez nich ztratí jejich práci (úměrně –
  Martin). Ženy, děti a starší zůstávají.
- **Síla muže** = 1 × (1 + **0,5** s kovárnou a plným pokrytím nástroji – železné sekery a hroty –
  návrh Clauda) × štěstí vsi (0,8–1,1 jako práce – návrh Clauda).
- Vojsko je ve scéně vidět – postavy mužů jdou krajinou (modely postav už jsou). Hráč jim velí
  jako v 0 A.D. – výběr, kliknutí kam jít, na co zaútočit (Martin – útočníky vždy řídí hráč).
- **Odvolání:** hráč může výpravu kdykoli odvolat – muži se vrátí stejnou cestou s tím, co mají
  (Martin).

## Boj (návrh Clauda, doladí se hraním)

- Útočníci postupují **od nejbližšího domu**. Domy blíž než **40 m** od sebe tvoří **skupinu** –
  obránci celé skupiny se shromáždí a brání se společně (Martin – sevřená ves).
- **Obránci:** dospělí muži skupiny × 1 a ženy a starší × 0,3; obrana u domu × 1,5 (znají místo);
  kovárna a štěstí obránců jako u útočníků.
- **Střet skupiny:** poměr sil rozhodne – silnější strana vyhraje, ztráty obou stran úměrné síle
  protivníka (≈ 10–40 % mužů podle poměru – návrh Clauda); náhoda deterministická ze seedu světa.
- **Volba obránců** před střetem: **bránit se / vzdát se / utéct do lesa** – rozhoduje postoj
  nastavený hráčem („do posledního“, „vzdát se při přesile“, „raději utéct“) a poměr sil;
  **když je hráč přítomen, velí sám** (Martin).
- **Utečení do lesa:** lidé se zachrání (vrátí se po odchodu útočníků), domy zůstanou, zásoby
  a dobytek skupiny padnou útočníkům (Martin).
- **Vzdání se domu:** útočník vybere – **pobít**, nebo **odvést** do své vsi (přibudou jako lidé;
  usadí se do volných míst nebo založí domácnost, až bude dům) (Martin).
- **Vítězství nad vsí:** když se ves vzdá nebo nemá kdo bránit, její **vojvoda se stane vazalem**
  vítěze – NPC i hráč (Martin; vazalské povinnosti přijdou s mechanikou vazalství).
- **Kořist:** zásoby skupiny (obilí, maso, ovoce) do nosnosti – **25 kg na muže** – a dobytek
  (stádo se žene, zpomalí návrat) (návrh Clauda). Co se neunese, zůstane.

## Návrat a následky

- Vojsko se vrací stejnou cestou (1–3 dny na mapu), s kořistí a zajatci.
- Padlí chybí doma natrvalo – ves může zchudnout až k hladu a vymření (Martin).
- **Ohlášení až po spatření:** napadený hráč (nebo NPC vojvoda) se o útoku dozví, **až útočníky
  spatří některý z vesničanů** (Martin) – dohled vesničanů na poli, u domů, v lese; do té doby
  vesnice o vojsku neví.

## Co hráč vidí

- Tlačítko **Vojsko**: posuvník mužů, směr výpravy (8 šipek), postoj obrany vsi.
- Na cestě a v cizí vsi: vojsko ve scéně, skupiny domů a volby při vzdání (pobít / odvést /
  připojit ves).
- Zprávy: výprava vyrazila, dorazila, střet (ikony + čísla padlých), kořist, návrat.

## Rozhodnutí

| Rozhodnutí                                                                                      | Kdo          |
| ----------------------------------------------------------------------------------------------- | ------------ |
| Libovolný počet mužů, práce doma úměrně zpomalí; padlí mohou ves položit                        | Martin       |
| Kovárna = bonus v boji                                                                          | Martin       |
| Postup dům od domu; sevřené domy se brání společně, samoty ne                                   | Martin       |
| Obránci: bránit / vzdát / utéct do lesa; vzdaný dům pobít nebo odvést                           | Martin       |
| Útočníky vždy řídí hráč, výpravu může kdykoli odvolat; mlha války – mapu objevuje               | Martin       |
| Ohlášení až když útočníky spatří vesničan                                                       | Martin       |
| Hustý les velmi pomalu, voda jen po brodech                                                     | Martin       |
| Sousední vsi vede NPC vojvoda jako hráč; po vítězství se stane vazalem                          | Martin       |
| Vesničané rozhodují podle postoje; přítomný hráč velí sám                                       | Martin       |
| Svět jako mřížka map, přechod okrajem na sousední mapu (opačný okraj), cesta 1–3 dny            | Martin       |
| Síla, bonus kovárny +50 %, obrana × 1,5, skupina do 40 m, ztráty, nosnost 25 kg, jídlo na cestu | návrh Clauda |
| Dohled 150 m, les 1/4 rychlosti, jednoduchá AI vojvody                                          | návrh Clauda |
