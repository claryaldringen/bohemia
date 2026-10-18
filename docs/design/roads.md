# Pevné cesty – stromy podél nich a vylepšení

Stav: schváleno 18. 10. 2026 (Martin: „Ano, spusť to takhle“). **Fáze 1 hotová** (18. 10. 2026 –
pevné cesty a stromy u nich, viz [Fáze 1 – jak je postavená](#fáze-1--jak-je-postavená)),
**fáze 2 hotová** (výběr, vylepšení a rychlejší chůze – [Fáze 2](#fáze-2--jak-je-postavená)),
**fáze 3 hotová** (jabloně podél cesty – [Fáze 3](#fáze-3--jak-je-postavená)). Navazuje na
[vyšlapané pěšiny](paths.md) (jen vzhled) a nahrazuje v nich stromy podél pěšin.

## Proč

Stromy podél pěšin dnes přeskakují: rozmisťují se znovu při každém přepočtu denní sítě pěšin,
která se mění s prací dne (rozbor 18. 10. 2026). Martin: stromy mají záviset na **pomalé
složce**, růst **postupně – napřed jako keř** – a kde jednou vyrostou, **stojí, dokud samy
neodumřou**. Kde vznikne taková pevná cesta, **hráč ji vybere kurzorem a vylepší** (Martin).
Cesta se tím stává herní věcí: pamatuje si, kudy vede, a zkracuje lidem chůzi.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** pevná cesta vzniká sama z dlouhodobého provozu a nehýbe se; denní pěšiny se k ní
  stahují.
- **Cíl:** stromy u pevné cesty jsou herní data – vyrostou z keře, stojí na místě a odumřou
  stářím (Martin).
- **Cíl:** hráč pevnou cestu vybere a vylepší ve **třech stupních** – vyšlapaná → upravená →
  hať a lávka (Martin) – a **nezávisle** na nich podél ní **vysadí jabloně** (Martin).
- **Cíl:** vylepšená cesta **zrychlí chůzi** – vzdálená pole, les a sady stojí méně práce
  (Martin).
- **Ne-cíl (teď):** vozy a tažná zvířata na cestách, obchod, cesty mezi vsemi a mapami (přijde
  s [válkou](war.md) a světem), mosty pro vozy, údržba cest, mýto.
- **Anti-cíl:** cesta nebo strom, které se pohnou samy od sebe; hráč, který musí cesty kreslit
  (cesty vznikají chozením, hráč je jen vylepšuje).

## Dvě vrstvy cest

- **Pěšiny dne** ([paths.md](paths.md)) zůstávají jen vzhled – vedou tam, kam ves dnes chodí,
  a mění se s prací. Nově jdou raději po pevné cestě (sleva jako po silné pěšině), takže se
  k ní stahují. Stromy podél nich zmizí – stromy mají jen pevné cesty.
- **Pevné cesty** počítá a ukládá simulace vsi (server):
  - **Jednou za rok** (1. 11., po sklizni jablek – návrh Clauda) spočítá síť z **celoroční
    práce** (člověkodny za rok po místech, voda, dřevo, sousedé – průměr na den), ne z dnešní.
    Výpočet je stejný jako u pěšin dne, jen s ročním provozem.
  - Úsek, kterým se **dva roky po sobě** chodí aspoň **3× denně** (roční průměr – zhruba síla
    0,55 dnešních pěšin), se stane **pevnou cestou** (návrh Clauda). Uloží se jeho osa
    a od té doby se nehýbe. Nová trasa, která vede blízko pevné cesty, se k ní přimkne (sleva
    za pevnou cestu), takže se síť jen rozrůstá, nepřekresluje.
  - Pevná cesta je **úsek mezi rozcestími a konci** – po ní se vybírá a vylepšuje. Kde se
    potkávají jen dva úseky (falešné rozcestí – odbočka zarostla, nová cesta navázala na konec
    jiné), spojí se do jednoho (Martin, 18. 10. 2026 – viz [Úseky a rozcestí](#úseky-a-rozcestí)).
    Rozcestí je ve scéně udusaný plácek – nejvyšlapanější místo cesty.
  - **Zarůstání:** vyšlapaná cesta, kterou se **5 let po sobě** chodí pod polovinu prahu,
    zaroste a zmizí (návrh Clauda). Upravená cesta a hať nezarůstají. Stromy u zarostlé cesty
    stojí dál, dokud neodumřou.

## Stromy u pevných cest

- **Kde:** po obou stranách pevné cesty v polní krajině (podél pole nebo louky – ne v lese, ve
  vsi, na pozemcích, hřbitově ani v sadu), 2,5–4 m od osy, místa po 12–20 m střídavě vlevo
  a vpravo, trochu nepravidelně, dva stromy nejméně 8 m od sebe (jako dnes – návrh Clauda).
  Místa se určí jednou, když cesta vznikne, deterministicky ze seedu vsi a polohy.
- **Uchycení:** na volném místě u cesty starší **5 let** se strom uchytí s pravděpodobností
  **10 % ročně** (náletem na neoraném okraji – návrh Clauda; los z seedu vsi a roku).
- **Druhy:** polovina dubů, zbytek jilmy a topoly (jako dnes).
- **Růst (Martin – napřed keř):** **keř** do 8 let (model keře), pak **mladý strom** (30 %
  velikosti), plná velikost ve **40 letech** (návrh Clauda).
- **Stojí, dokud neodumře (Martin):** délka života podle druhu – **topol 60–100 let, jilm
  100–200, dub 200–400** (los při uchycení – návrh Clauda). Po smrti zbude **souš** na 10 let,
  pak **pařez** na 10 let a místo je znovu volné.
- **Vesničané je na dřevo nekácí** – stojí, dokud neodumřou (Martin). Výjimka: když přes strom
  hráč postaví pole, dům, sad nebo hřbitov, skácí se jako ostatní stromy a dá kládu (návrh
  Clauda).

## Vylepšení cesty (staví hráč)

Hráč klikne na pevnou cestu – vybere se úsek, v panelu je stupeň, délka, stáří, stromy
a jabloně a tlačítka vylepšení (ikony, cena v popisku – jako v 0 A.D.). Vylepšení je stavba ze
společné práce vsi; stromy bere jako obydlí (klády z hromady, pak nejbližší dospělé stromy).

| Stupeň                     | Co se udělá                                                          | Cena (návrh Clauda)                                       | Rychlost chůze (návrh Clauda)             |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------- |
| 1. **Vyšlapaná cesta**     | vznikne sama                                                         | –                                                         | 1,2× proti louce                          |
| 2. **Upravená cesta**      | vyrovnaná, odvodňovací strouha po straně, kameny do bláta a do brodu | **15 člověkodní na 100 m**                                | 1,5×                                      |
| 3. **Hať a lávka** (po 2.) | povalový chodník přes mokřinu, lávka z kmenů přes potok              | hať **1 strom a 2 čd na 2 m**, lávka **4 stromy a 15 čd** | mokřina 1,5× místo 0,5×; brod bez zdržení |

- **Stupeň 3** jde jen na úseku, který vede mokřinou (rovina podél potoka) nebo brodí potok –
  jinak se nenabízí.
- **Vysazení jabloní** (nezávislé na stupni – Martin): podél úseku po obou stranách po
  **10 m** (střídavě, na volných místech – kde stojí strom, jabloň nebude). Jako
  [sad](orchard.md) na strom: výsadba **0,45 čd** (80 čd/ha při ≈ 180 stromech/ha) jen v oknech
  jara a podzimu, péče v zimě, sklizeň v září–říjnu, úroda **≈ 17 kg jablek na strom** při plné
  úrodě (≈ 3 t/ha), plody od 6. roku, život ≈ 60 let – pak souš a místo je volné; „Vysadit
  jabloně“ znovu doplní mezery (návrh Clauda). Jablka jdou do zásoby ovoce jako ze sadu.

## Rychlejší chůze (Martin – efekt vylepšení)

- Dnes práce zdražuje **vzdušná vzdálenost** od obydlí: +1 % za každých 10 m nad 100 m (pole
  a sad – [fields.md](fields.md); kácení a palivo – [forest.md](forest.md)).
- Nově se měří **chůzí** (návrh Clauda): délka trasy, kudy lidé skutečně jdou (roční síť),
  a úsek po cestě se započítá zkráceně podle rychlosti (po upravené cestě 300 m jako 200 m).
  Mokřina se počítá dvojnásobně (bahno), brod + 30 m (zout se, přebrodit). Vzdálenosti se
  přepočítají jednou za rok a po dokončení vylepšení.
- Pole za potokem nebo za mokřinou tak bez cesty zdraží, s hatí a lávkou zlevní. Pole 400 m
  daleko bez cesty ≈ +30 %, s upravenou cestou ≈ +20 % (příklad).

## Co hráč vidí

- **Pevná cesta** je silnější a stálá – vyšlapaná hlína (dnešní silná pěšina), upravená cesta
  širší se strouhou po straně a kameny, hať z kmenů napříč, lávka přes potok (modely nové).
- **Stromy** u cest od keře po plný strom, souše a pařezy; jabloně s jablky od srpna.
- **Výběr** pevné cesty kliknutím (zvýrazní se úsek), panel: stupeň (ikona), délka, stáří,
  stromy a jabloně (ikony + čísla), tlačítka vylepšení.
- Kronika: vznikla pevná cesta, vylepšení dokončeno, jabloně vysazeny.

## Rozhodnutí

| Rozhodnutí                                                                               | Kdo          |
| ---------------------------------------------------------------------------------------- | ------------ |
| Stromy jen u pevných cest z pomalé složky; růst od keře; stojí, dokud samy neodumřou     | Martin       |
| Pevnou cestu hráč vybere kurzorem a vylepší                                              | Martin       |
| Tři stupně: vyšlapaná → upravená → hať a lávka; efekt rychlejší chůze                    | Martin       |
| Nezávislé vylepšení: vysazení jabloní podél cesty                                        | Martin       |
| Roční síť k 1. 11., práh 3 cesty za den 2 roky, zarůstání vyšlapané po 5 letech          | návrh Clauda |
| Uchycení 10 %/rok po 5 letech cesty, keř 8 let, plný strom 40 let, životy topol/jilm/dub | návrh Clauda |
| Ceny a rychlosti stupňů, jabloně po 10 m jako sad na strom                               | návrh Clauda |
| Vzdálenost práce chůzí místo vzdušnou čarou, mokřina ×2, brod +30 m                      | návrh Clauda |
| Fáze 1 – rok cest, porovnání s loňskem, připojení a dělení úseků, provoz cesty (níž)     | návrh Clauda |
| Fáze 1 – místa na stromy, strom jako překážka (kláda od 20 let), cesta přes pole zůstává | návrh Clauda |
| Fáze 2 – mokřina, výběr, ceny bez přirážky, okno chůze, kácení chůzí po pevných cestách  | návrh Clauda |
| Fáze 3 – místa jabloní, výsadba jako stavba, souš 10 let, jabloně zůstanou i bez cesty   | návrh Clauda |
| Úsek mezi rozcestími: dva úseky v uzlu bez odbočky se spojí; rozcestí je udusaný plácek  | Martin       |
| Spojení – id a den vzniku staršího, provoz vážený délkou; různý stupeň zůstane rozdělen  | návrh Clauda |

## Fáze 1 – jak je postavená

Návrh Clauda (detaily, které návrh výš nechal otevřené – 18. 10. 2026):

- **Rok cest a roční součty práce:** rok cest běží od jedné roční kontroly k další (1. 11. – 31. 10.). Simulace každý den přičte rozdělení práce dne po místech (pole, staveniště, sady,
  hřbitovy, kácení stromů pro stavby; práce „ve vsi“ ne) a roční síť bere průměr na den. Součty
  jsou ve stavu vsi, takže nezávisí na tom, po jakých kouscích se ves dopočítá.
- **Práh a „dva roky po sobě“:** roční síť se počítá stejnou funkcí jako pěšiny dne (voda, dřevo
  podle průměru roku, sousedé, práce, ohrady, stáda na pastvě – krávy, které v zimě stojí
  v ohradě, poměrně k měsícům pastvy). Úsek osy, kde je síla aspoň síla 3 cest za den (≈ 0,55), je
  letos nad prahem; pevná cesta vznikne z bodů, které leží do 6 m od loňského úseku nad prahem
  a nevedou po pevné cestě (do 5 m od její osy – tam jde trasa po cestě). Kratší úsek než 15 m
  cestou není. Osa se uloží na centimetry a zjednoduší (0,25 m).
- **Připojení a úseky:** kde nový úsek navazuje na pevnou cestu, připojí se k ní (do 10 m): blízko
  jejího konce (4 m) přímo do konce, jinak do nejbližšího bodu osy a pevná cesta se tam
  **rozdělí** na dva úseky (oba si nechají den vzniku, stupeň, provoz a místa na stromy podle
  polohy). Body osy se tím nemění – cesta se nehýbe. Rozcestí sdílí přesně stejný bod.
- **Provoz cesty (zarůstání):** medián provozu roční sítě (cest za den) v bodech osy po 3 m (vždy
  nejvyšší z buněk kolem bodu – trasa vede po cestě nebo těsně vedle); pamatuje se posledních
  5 let. ~~Když zaroste úsek mezi dvěma jinými, ty se nespojují (rozcestí zůstane).~~ Od 18. 10. 2026 se spojí – [Úseky a rozcestí](#úseky-a-rozcestí).
- **Sleva za pevnou cestu** v síti dne i v roční síti: buňky pod osou cesty jako plná pěšina
  (poloviční cena) – pěšiny dne se k cestě stahují. Ve scéně se pěšina dne v pevné cestě ztrácí
  (do 1,4 m od osy se nekreslí, od 3,2 m plně), pevná cesta se kreslí z dat jako plně vyšlapaná
  pěšina, volný konec (brána, pole) se vytrácí.
- **Místa na stromy** (při vzniku úseku, ze seedu vsi a konců úseku): po 12–20 m střídavě vlevo
  a vpravo 2,5–4 m od osy, ne do 6 m od konců úseku, ne do 2,2 m od osy jiné cesty, aspoň 8 m od
  jiných míst a stromů, ne v lese a do 6 m od jeho okraje, ne ve vodě, v brodu ani na srázu, ne
  do 2,5 m od překážky krajiny (kmen, keř, kámen), ne na dílu pole, v sadu, na hřbitově, v háji
  ani na pozemku a v ohradě (ani 1,5 m kolem), ne do 16 m od obydlí, staveniště a zbytku jámy
  (i na jeho pozemku), ne u modly a svatyně (+ 3 m), milíře a posvátného dubu (6 m). Volné místo, přes které později povede nová cesta,
  zmizí; na místě pod pozdější stavbou se strom neuchytí.
- **Uchycení:** los z seedu vsi, roku a místa – nezávisí na ostatních místech. Druh: dub 50 %,
  jilm 28 %, topol 22 % (jako stromy podél pěšin). Délka života los v rozmezí druhu.
- **Strom jako překážka stavby:** keř je keř, strom do 20 let mladý stromek (bez klády), od 20 let
  dospělý strom (kláda na hromadu), pak souš a pařez – ceny podle tabulky překážek (fields.md).
  Stromy u cest mají id nad rozsahem vrstvy překážek; stavba je odstraní jako ostatní překážky
  (cena u kurzoru je stejná v prohlížeči i na serveru) – i obydlí na poli (strom na zakládaném
  dílu, který obydlí zabere, odklidí stavba obydlí s kládou). Strom odstraněný stavbou a pařez po
  20 letech od smrti zmizí ze stavu při roční kontrole.
- **Cesta přes pole:** když hráč postaví pole přes pevnou cestu, cesta zůstává (kreslí se dál
  a po ní se chodí) – zrušení cesty stavbou může přijít s fází 2.
- **Kronika:** „Kudy se chodí léta, vyšlapala se pevná cesta.“ a „Nepoužívaná cesta zarostla.“
- **Rychlost:** roční kontrola ≈ 6–8 ms (Node, ves 27 lidí, 6 úseků), přeskok 10 let
  s krajinou ≈ 0,55 s (bez krajiny 0,15 s – rozdíl jsou pěšiny dne i pevné cesty). Stav pevných
  cest ≈ 3 kB.

## Fáze 2 – jak je postavená

Návrh Clauda (18. 10. 2026):

- **Mokřina** = suchá rovina (sklon nejvýš 0,04) do 3 buněk terénu pěšin (≈ 11 m) od vody –
  podmáčený břeh a niva potoka. **Brod** = mělký úzký úsek potoka (průchozí voda – paths.md).
  Kde úsek vede mokřinou a přes brody, se určí z krajiny při vzniku úseku (starší úseky si to
  doplní při roční kontrole); rozdělení úseku rozdělí i mokřinu a brody.
- **Výběr:** kliknutí do 2,5 m od osy vybere úsek (po obydlí, posvátných místech, pozemku
  a ohradě, před polem); zvýrazní se čarami po obou stranách pásu. Panel: portrét stupně, délka,
  stáří, stromy u úseku, mokřina a brody, průběh rozestavěného vylepšení a tlačítka vylepšení
  (ikony, v popisku název, práce a dřevo; zašedlé s důvodem červeně – „Nejdřív je potřeba cestu
  upravit.“, „Cesta se už vylepšuje.“, „Na hať a lávku chybí dřevo.“).
- **Ceny** podle tabulky výš: upravená cesta 15 čd na 100 m délky úseku (bez přirážky za
  vzdálenost – pracuje se na cestě), hať 1 strom a 2 čd na 2 m mokřiny (stromy nahoru na celé),
  lávka 4 stromy a 15 čd na brod; dřevo jako obydlí – celé klády z hromady, zbytek nejbližší
  dospělé stromy k polovině úseku (kácení v ceně). Hať a lávka se nabízí, jen když úsek vede
  mokřinou nebo přes brod, a jde až po upravené cestě.
- **Vylepšení je stavba** ze společné práce (lidé pracují podél úseku u čela práce); úsek během
  stavby nezaroste; když se rozdělí, stavba platí pro oba kusy. Po dokončení dostane úsek nový
  stupeň a kronika „Cesta je vylepšená – chodí se po ní rychleji.“
- **Chůze** (walking.ts – jediné místo výpočtu): po pevné cestě podle stupně (vyšlapaná 1,2×,
  upravená i hať a lávka 1,5×), mokřinou 0,5× (po hati 1,5×), brod + 30 m (po lávce nic);
  mokřina a brod platí i pro chůzi rovně mimo cestu a po pěšinách dne. Okno terénu pro chůzi je
  pevné – 1,4 × 1,4 km kolem místa vsi (stejné na serveru i v prohlížeči).
- **Vzdálenost práce chůzí:** díly pole a čtverce sadu z nejbližšího obydlí po pěšinách
  a pevných cestách, palivo z obydlí k nejbližšímu okraji lesa, kácení dřeva staveb od stavby ke
  stromu po pevných cestách (bez pěšin dne – cena u kurzoru tak sedí se serverem). Přepočítá se
  se změnou rozložení vsi – pevné cesty a jejich stupeň jsou v klíči, takže hned po vylepšení
  a po roční kontrole. Bez krajiny (kalibrace) vzdušnou čarou jako dřív.
- **Příklad:** pole 400 m od vsi, kam se jde 300 m po cestě přes 20 m mokřiny a brod a 100 m
  rovně: bez cesty 450 m chůze (+35 % práce), vyšlapaná cesta ≈ 403 m (+30 %), upravená ≈ 357 m
  (+26 %), s hatí a lávkou 300 m (+20 %).
- **Scéna:** upravená cesta je pás 2,6 m s udusanou hlínou skoro po celé šířce, strouha 1,75 m
  vlevo od osy (přes brod ne), kameny v mokřině a u brodu hustě, jinde řídce; hať jsou kmeny
  napříč po 0,24 m, lávka 5,2 m ze tří kmenů na prazích a kůlech se zábradlím (modely
  `tools/blender/roads.py`). Rozestavěné vylepšení: vytyčení kolíky a provázkem od zadání
  (Martin), úprava roste od začátku úseku, kmeny hatě se kladou po mokřině podle průběhu, lávka
  nejdřív kůly a prahy (od 25 %), celá od 90 %. Ikony `cesta`, `cesta-upravena`, `hat`.

## Fáze 3 – jak je postavená

Návrh Clauda (18. 10. 2026):

- **Místa** (`roadAppleSpots`): po 10 m podél úseku střídavě po stranách, 2,6–3,4 m od osy (bez
  6 m na koncích úseku). Jabloň nestojí v lese, ve vodě ani v brodu, na stavbě vsi (obydlí,
  pole, sad, hřbitov, ohrada – jako stromy u cest), do 2,2 m od osy jiné pevné cesty, do 2,5 m od
  překážky krajiny (kmen, keř, kámen), do 6 m od stromu u cesty a do 8 m od jiné jabloně – proto
  „Vysadit jabloně“ po letech doplní jen mezery a nesází naproti stojící jabloni. Místa jsou
  deterministická (seed vsi a úseku).
- **Výsadba je stavba** `road-apples` ze společné práce: 0,44 čd na jabloň (80 čd/ha při
  180 stromech/ha), bez přirážky za vzdálenost (jako výsadba sadu); pracuje se jen v oknech
  výsadby (září–listopad, březen–duben), mimo ně stavba čeká (v panelu ikona „Sází se na jaře
  a na podzim“). Jabloně se sázejí po řadě podél úseku – každá, na kterou práce došla, dostane den
  výsadby. Úsek ve výsadbě nezaroste. Kronika „Jabloně podél cesty jsou vysazené.“
- **Úroda a práce** jako sad na strom (1/180 ha): plody od 6. roku, plná úroda ≈ 16,7 kg od 25.
  roku, péče v zimě a sklizeň v září–říjnu jdou se sady (`orchardWork`), jablka do zásoby ovoce
  (`applesKg`). Přirážka za vzdálenost u péče a sklizně podle vzdušné vzdálenosti jabloně od
  nejbližšího obydlí při výsadbě (jabloň stojí u cesty – chůze by se lišila málo).
- **Život:** strom do 60 let, pak souš 10 let a místo je volné. Jako překážka je jabloň do 20 let
  mladý strom (kácení bez klády), pak strom (kláda), souš jako souš; stavba přes jabloň ji
  odstraní. U jabloně se strom u cesty neuchytí (do 6 m). Jabloně zůstanou, i když vyšlapaná cesta
  zaroste (jako stromy u cest); při rozdělení úseku patří bližší části.
- **Panel cesty:** počet jabloní (v závorce plodící, když nejsou všechny), průběh výsadby
  a tlačítko „Vysadit jabloně“ (ikona `jablone`, v popisku práce a počet jabloní; zašedlé
  s důvodem – „Jabloně se tu už sázejí.“, „Podél cesty není volné místo.“). Server výsadbu
  ověří znovu (use-case `plantApplesAlongRoad`).
- **Scéna:** jabloně ze sadu (`apple-1…4`, s jablky `apple-fruit-1…4`) s velikostí podle stáří
  jako v sadu (sazenice 30 %, plná za 12 let, první 3 roky u kůlu), jablka od srpna do sklizně,
  roční období jako sad (květ, podzimní listí, holé koruny – meshe `pathside-apple-*`); souš jako
  u stromů u cest. Místa, která čekají na výsadbu, jsou od zadání vytyčená kolíkem a provázkem
  po straně cesty (Martin – u všech staveb). Lidé česají a ošetřují jabloně úseku a sázejí u míst,
  která čekají.
- **Příklad:** úsek 200 m s volnými místy po celé délce dá ≈ 19 jabloní – výsadba ≈ 8,4 čd (na
  jaře nebo na podzim), od 25. roku ≈ 317 kg jablek ročně (výživou ≈ 45 kg obilí), sklizeň
  ≈ 0,8 čd a péče ≈ 1,1 čd za zimu (do 100 m od obydlí bez přirážky).

## Úseky a rozcestí

Martin (18. 10. 2026, ves Vlkov): „úsek mezi dvěma rozcestími je v pohodě, ale ve hře jsou
evidentně falešná rozcestí“ a „rozcestí by mělo být nejvyšlapanější plochou, teď vlastně chybí“.
Ve Vlkově bylo z 23 úseků 13 uzlů, kde se potkávají jen dva úseky – zbytky po rozdělení cesty,
když odbočka zarostla, a cesty navázané na konec jiné v různých letech.

- **Spojení úseků** (`mergeRoadChains`, návrh Clauda): kde končí právě dva úseky (uzel bez
  odbočky), spojí se do jednoho – osa za sebou (směr staršího úseku zůstane), místa na stromy,
  jabloně, mokřina a brody na ose, provoz posledních let (vážený délkou), den vzniku a id
  staršího úseku. Stromy u cesty se nemění. Stavby na úsecích – výsadba jabloní a vylepšení, které
  platí pro oba úseky – přejdou na spojený úsek.
- **Zůstanou rozdělené:** úseky různého stupně (vyšlapaná a upravená – skutečná hranice
  vylepšení) a úseky, z nichž se vylepšuje jen jeden (nebo každý jinou stavbou) – po dokončení
  vylepšení se spojí, mají-li stejný stupeň. Uzavřený okruh z jednoho úseku zůstane.
- **Kdy:** v roční kontrole po zarůstání a vzniku nových cest (zarostlá odbočka uzel uvolní),
  po dokončení vylepšení a jednou při načtení starší vsi (`withMergedRoads` – bez falešného
  rozcestí vrátí týž stav). Simulace pak falešná rozcestí sama nevytváří, takže výsledek
  nezávisí na kouscích dopočtu.
- **Vlkov po převodu:** z 23 úseků zbude 11 – jediný uzel se dvěma úseky je hranice upravené
  a vyšlapané cesty, skutečná rozcestí 2 (tři a čtyři úseky), zbytek jsou konce.
- **Rozcestí ve scéně** (návrh Clauda): kde končí aspoň tři úseky, je plácek udusané hlíny – kruh
  o poloměru 1,3× šířky přicházející cesty s nepravidelným okrajem, plné síly; vbíhá-li do něj upravená
  cesta, je v jejím širším pásu (`roadJunctions` v `road-works-layout.ts`). Totéž rozcestí pěšin
  dne ([paths.md](paths.md)).

## Na stavitelích

- Výpočet sítě je v herním jádru (`domain/village/paths/`), volá ho simulace (roční síť) i scéna
  (pěšiny dne) – herní logika jednou. Pevné cesty: `paths/roads.ts`, stromy `road-trees.ts`.
- Stav vsi má pevné cesty, jejich stromy a roční součty práce po místech; staré vsi začnou bez
  pevných cest (vzniknou do dvou let). Jabloně jsou v `VillageRoads.apples` (chybí = žádné).
- Pořadí implementace: (1) pevné cesty a stromy – **hotovo**, (2) výběr, vylepšení a chůze –
  **hotovo**, (3) jabloně – **hotovo**.
