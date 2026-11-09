# Obyvatelstvo a obydlí vesnice

Stav: schváleno 17. 10. 2026 (Martin: „asi ok, doladíme později“), týž den upraveno umístění
obydlí a společná pole (Martin) a odemčení nového obydlí – hráč staví, kdy chce (Martin). Týž den
oprava čísel podle rešerše (Martin – úmrtnost dospělých, porody od 16 let, životnost zemnice;
[rešerše](research/2026-10-17-zemedelstvi-populace.md)). 18. 10. 2026 Martin změnil pravidlo
hladu: lidé umírají hlady a ves může vymřít; komu vymřou všechny vsi, ten začíná znovu (viz Hlad
a vymření). Týž den: začít znovu jde i sám z nabídky hry (Martin) a dospělé děti z přeplněné
domácnosti osídlí úplně prázdné obydlí (Martin, detaily návrh Clauda – viz Nové obydlí)
a neobydlené budovy chátrají rychleji (Martin, čísla návrh Clauda), svobodní z různých domů se
berou (Martin, detaily návrh Clauda – viz Sňatky mezi domy) a nejstarší dítě z přeplněného domu
smí odejít samo (Martin, výklad návrh Clauda – viz Nové obydlí). Týž den Martin schválil
**příbuzenství a pohlaví** ([kinship.md](kinship.md)): lidé mají pohlaví, matku, otce a manžela,
děti rodí jen manželské páry a pravidla domácností níže platí pro rodiny – sňatky, nové
domácnosti a rozpad podle kinship.md. 19. 10. 2026 Martin: „Vdova by se měla snažit co nejdříve
vdát, ideálně ve vesnici. Obecně by měla být pravidla nastavena tak, aby se populace co nejvíce
rozrůstala.“ – vdovy se vdávají hned, k ženě bez ženicha se přižení muž z okolí, porody podle
věku ženy s rozestupem (návrh Clauda, [rešerše](research/2026-10-19-population-growth.md); viz
Růst populace a Sňatky) a týž den Martin schválil, že ženatý pár, který dům nedrží, smí odejít do
nového domu kdykoli, ne jen z plné domácnosti (viz Nové obydlí).
Implementace jádra: `packages/game/src/domain/village/`.

## Proč

Hráč začíná jednou slovanskou vesnicí a její hlavní bohatství jsou lidé – přesněji jejich
práce. Jedna domácnost si základní potřeby (jídlo, látky, keramiku, jednoduché železné předměty)
obstará sama, ale na společné projekty vsi (např. opevnění) jí skoro nezbývá čas. Hra je tedy
o tom, aby ves rostla a výroba jídla byla co nejefektivnější – aby postupně ve vsi mohli být
i lidé, kteří se jídlem nezabývají vůbec nebo jen menší část času (Martin).

Tento dokument popisuje, jak ves roste: domácnosti, obydlí, porody a úmrtí, stavbu nových
obydlí hráčem a jejich chátrání a přestavby obyvateli.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** hráč založí ves jednou zemnicí se čtyřmi lidmi a sleduje, jak se rodina rozrůstá;
  kdy postaví další obydlí, rozhodne sám – jakmile je domácnost plná, do nového obydlí se
  přestěhuje mladý pár a ves se rozroste o novou domácnost.
- **Cíl:** po návratu do hry (i po týdnu, tedy skoro po generaci) hráč pochopí, co se ve vsi
  mezitím stalo – kronika porodů, úmrtí, přestaveb.
- **Cíl:** práce (člověkodny) je společná měna vsi – stavby a opravy ji spotřebují a zbytek
  půjde později do veřejných projektů.
- **Ne-cíl (teď):** jiné stavby než obydlí, výroba jídla a pole (vlastní dokument, viz
  Navazuje), těžba dřeva, voda, jednotliví lidé se jmény, sňatky mezi vesnicemi (uvnitř vsi
  se berou – viz Sňatky mezi domy), rod hráče, více vesnic. **Příchozí z okolí zatím ne** – narušilo by to budoucí mechaniky (Martin).
- **Anti-cíl:** ves, která se bez hráče rozpadne nebo vymře jen proto, že hráč pár dní nebyl
  online. Nestavění zpomalí růst, ale neruinuje ves. Pole obdělávají osadníci sami – ves, která
  má dost polí, bez hráče nehladoví. Hlad ji zabít může (Martin, 18. 10. 2026 – Hlad a vymření).
- **Cíl:** ves s dostatkem polí roste sama (Martin 24. 10. 2026: „Teď žije vesnice v ideální
  krajině … vesnice populačně roste i bez zásahu hráče, za předpokladu, že má dostatečnou rozlohu
  polí.“) – dost polí ≈ 2,0–2,6 ha na člověka při úrodnosti 56 (diagnóza 24. 10. 2026, návrh
  Clauda); úzkým hrdlem byly žně ([pole](fields.md) – Žně všemi rukama).
- **Anti-cíl:** čísla typu „4,37 člověka“ – lidé jsou celí.

## Pojmy

- **Ves** – jedno sídlo hráče; drží společné zásoby (zatím práci, později jídlo, vodu, dřevo).
- **Obyvatel** – jednotlivec s datem narození, pohlavím, matkou, otcem a manželem / manželkou
  ([kinship.md](kinship.md); bez jména – návrh Clauda). Věkové
  skupiny: **dítě** 0–13 let, **dospělý** 14–44 (děti může mít až od 16 let), **starší** 45+.
- **Domácnost** – lidé jednoho obydlí. Každé obydlí je právě jedna domácnost.
- **Obydlí** – zatím dva typy:

  | Typ         | Míst | Nová stavba    | Typická životnost |
  | ----------- | ---- | -------------- | ----------------- |
  | zemnice     | 6    | 60 člověkodní  | ≈ 18 let          |
  | polozemnice | 8    | 220 člověkodní | ≈ 20–25 let       |

  Životnost zemnice je oprava podle rešerše (dřív ≈ 15 let): pravěké dřevěné stavby vydržely
  běžně 20–30 let bez ohledu na založení (Fries-Knoblach 2007), rekonstrukce zahloubeného domu
  stála 13 let bez oprav a vydržela by déle (Waldhauser 2008).

  Polozemnice je sušší a teplejší – dětem v ní je lépe (nižší dětská úmrtnost). Pro čerstvě
  plnou domácnost trvá zemnice zhruba jedno roční období, polozemnice celý herní rok – hráč volí
  mezi rychlou úlevou pro rodinu v těsnu a lepším domem, na který se čeká (návrh Clauda). Čísla
  jsou výchozí a doladí se měřením (viz Kalibrace).

- **Plná domácnost** – žije v ní tolik lidí, kolik má obydlí míst. **Přeplněná** – víc.
- **Člověkoden** – práce jednoho dospělého za herní den.
- **Výrostek** – dítě 7–13 let; pase stáda, do práce vsi nejde (Práce).

## Pravidla

### Založení vsi

- Hráč v krajině svého sídla umístí půdorys první zemnice (viz Umístění obydlí) – tím ves
  založí. Přijdou **4 lidé**: dva dospělí (kolem 25 let) a dva dospívající (12 a 13 let – návrh
  Clauda, aby první nová domácnost mohla vzniknout do pár let; zůstávají i s porody od 16 let –
  Martin). Jsou to **dva páry** ([kinship.md](kinship.md)): manželé 25 let a chlapec 13 a dívka
  12 let, kteří nejsou příbuzní (rodiče neznámí) a vezmou se, až dorostou. Ves dostane navržené staročeské jméno, které hráč může kdykoli změnit.
  **Návrh issue #9 fáze 1** (Martin, 24. 10. 2026 – implementováno, [village-people.md](../code/village-people.md)): ves založí **vojvoda
  se 4 manželkami** (5 lidí bez dětí, všichni v první zemnici); vedlejší manželky odcházejí do
  vlastních obydlí, až když se dvorec přeplní – [vojvodova rodina](lord.md), Rod vojvody –
  Zakladatelé, Manželky.
- **První zemnici si osadníci postaví sami** (Martin, 17. 10. 2026: „první zemnice byla
  postavena hrozně rychle – nebyl vidět průběh stavby“): je to stavba jako každá jiná – roste
  ze společné práce vsi a hráč vidí její fáze. Startovní domácnosti zbývá ≈ 1,2 člověkodne
  společné práce denně, takže zemnice (60 člověkodní) stojí asi za 50 herních dní (≈ 1 h 10 min
  skutečného času), s prvním polem déle – obě stavby se o práci dělí. Do dostavění osadníci
  bydlí na staveništi (bez vlivu na úmrtnost), pak se do zemnice nastěhují (návrh Clauda).
- **První pole není podmínkou založení** (Martin, 17. 10. 2026: „Hráč sám rozhodne kdy a co bude
  stavět, jako v každé RTS.“) – pole jsou samostatná a společná pro celou ves a hráč je zakládá,
  kdy chce ([fields.md](fields.md)). Ves bez pole žije ze zásob na 18 měsíců a pak hladoví –
  děti umírají hlady; hájení v prvních 30 letech chrání dospělé (neumírají ani hladem), po něm
  ves bez jídla do dvou měsíců vymře (Hlad a vymření).

### Umístění obydlí

- Hráč vidí **půdorys** obydlí a umístí ho volně, kamkoli, kde je **země dost rovná** (Martin) –
  ne po políčkách. Výchozí: rozdíl výšky terénu pod půdorysem nejvýš 0,5 m; zemnice má půdorys
  zhruba 4 × 4 m, polozemnice 5 × 5 m (návrh Clauda).
- Obydlí nesmí stát ve vodě ani se překrývat s jiným obydlím nebo hřbitovem (návrh Clauda). Na
  pole a do sadu smí – pole a sad se zmenší (Martin, 18. 10. 2026 – viz Obydlí na poli a v sadu).
  Do lesa smí – les se vyklučí (Martin, 19. 10. 2026 – viz Stavba v lese).
- **Polozemnice stojí na pozemku velkém jako jedno políčko pole** (Martin, 18. 10. 2026):
  15 × 15 m v mřížce políček jako čtverec pole, celý obehnaný polským plotem. Dům stojí
  **uprostřed, nebo v jednom ze čtyř rohů** – 5 variant jednoho stavení (Martin); hráč je při
  umisťování přepíná klávesou Tab (klávesy [ a ] pozemek otáčejí – viz Natočený pozemek níž),
  vchod míří vždy k brance na přední straně pozemku (návrh Clauda). Pozemek musí být volná louka nebo les (les se vyklučí – viz Stavba v lese) – ne voda, bez skalního
  výchozu, bez posvátného dubu a čtverce dubového háje (dům ani pod korunou dubu ze sousedství –
  jako u obydlí, [happiness.md](happiness.md)), nezabraný hřbitovem ani jiným obydlím či
  pozemkem – čtverec pole nebo sadu smí (viz Obydlí na poli a v sadu); rovná zem
  (≤ 0,5 m) se hlídá jen pod domem. Překážky na pozemku platí jako na čtverci pole (všechny kusy
  na políčku), dospělé stromy z něj dají klády (návrh Clauda). Zemnice pozemek nemá a staví se
  volně.
- **Natočený pozemek** (Martin, 18. 10. 2026: „Je to 3D, takže všechny stavby by měly jít natáčet
  po 15 stupních“ – u pozemku **varianta a: natočí se celý pozemek**, místo domu přepíná Tab):
  klávesy [ a ] otáčejí celým pozemkem po 15° kolem jeho středu, **Tab** (se Shiftem zpět)
  přepíná variantu – kde na pozemku dům stojí. Bez natočení a po 90° je pozemek políčko pod
  kurzorem jako dřív (jen dům míří jinam), jinak natočený čtverec 15 × 15 m se **středem
  kdekoli pod kurzorem** (na cm), ne v mřížce políček. Plot se zakulacenými rohy, branka na přední
  straně, záhony, cestička i dům se otočí s ním. Kontroly (návrh Clauda) jdou přes natočený
  čtverec: louka a voda podle 5 × 5 bodů pod ním (do vody nesmí žádný, v lese nesmí ležet
  většina), skalní výchoz, posvátný dub (kmen ve čtverci) a háj (políčko háje pod čtvercem)
  i kolize se stavbami podle skutečného překryvu ploch; na poli a v sadu vezme dílům a čtvercům
  jen **průnik** (díl pod 20 % políčka zmizí jako u obydlí bez pozemku), překážky čtverce platí
  kromě těch na poli a v sadu. Pozemky z doby před natáčením zůstávají políčky.
- **Branka nesmí vést do cizího pozemku** (Martin, 19. 10. 2026: „Ano, zakaž to“ – na otázku,
  jestli zakázat umístění domu, jehož branka vede do cizího pozemku; ve Vlkově vedla branka
  polozemnice do pozemku dvorce a domácnost neměla kudy chodit): místo před brankou pozemku nebo
  před vchodem volného obydlí a dílny – stejné místo, odkud vychází síť pěšin ([paths.md](paths.md)
  – Vchody) – nesmí padnout do pozemku nebo půdorysu jiného obydlí (i dvora dvorce, rozestavěného
  i jiné vsi na mapě), do modly či svatyně, do hřbitova, ohrady ani do vody. Pole, sad, les
  a louka branku neblokují – pole je krajina. Opačně nová stavba (obydlí, pozemek, dílna, ohrada,
  hřbitov, modla, svatyně) nesmí zatarasit branku obydlí, které už stojí. Důvod u kurzoru:
  „Branka by vedla do cizího pozemku.“ (do jiného obydlí, na modlu, do svatyně, do hřbitova, do
  ohrady, do vody; u volného obydlí „Vchod by vedl …“), „Zatarasí sousedům branku.“ Stejně
  hledají místo vesničané sami (přestavba na novém pozemku, přestěhování, místo nové vsi). Domy
  postavené dřív se nemění – jejich domácnost vyjde z volného místa kolem obydlí (paths.md –
  Vchody). Podrobnosti návrh Clauda.
- **Polozemnice postavené před pozemky dostanou pozemek** (Martin, 18. 10. 2026): při načtení
  vsi (jednou, před dopočtem) dostane každá polozemnice bez pozemku – hotová i rozestavěná –
  políčko, na kterém stojí střed domu, když je volné (žádný díl pole, čtverec hřbitova ani sadu,
  jiný pozemek či obydlí, posvátný dub, háj, voda ani skalní výchoz). Varianta podle toho, kde na
  políčku dům stojí (uprostřed, nebo nejbližší roh); dům blíž místu varianty než 2 m se na něj
  posune, jinak zůstane, kde je, i s natočením – plot se pak u domu přeruší (stěna domu je
  ohradou) a vede-li vchod ven z ohrazení, pozemek nemá branku. Překážky na políčku zmizí jako
  u nového pozemku, dospělé stromy nevyhrazené jinou stavbou dají klády (převod práci nestojí).
  Polozemnice na obsazeném políčku zůstane bez pozemku až do **příští přestavby**: ta ji postaví
  na nejbližším volném políčku s pozemkem do 50 m od domu (jako novou stavbu – překážky, klády,
  rovina pod domem), a domácnost se po dostavění přestěhuje; bez volného políčka se přestaví na
  místě dál bez pozemku. Totéž platí pro zemnici přestavovanou na polozemnici. Volné políčko je
  i bez pole a sadu – obyvatelé si pozemek na poli ani v sadu sami nevezmou, to rozhoduje jen
  hráč (návrh Clauda).
- **Překážky** na místě, např. kameny, osadníci odstraní, ale stavba stojí víc člověkodní
  (Martin). Totéž **v lese** – stromy je třeba skácet a vykopat pařezy (viz Stavba v lese). Ceny
  překážek a mýcení jsou jedna tabulka pro celou hru ve [fields.md](fields.md) (návrh Clauda).
  Kontrola umístění
  cenu spočítá už při umisťování a rozhraní ji ukáže u kurzoru ikonami s čísly: práce celkem
  (stavba, překážky a kácení dřeva, které nedá hromada klád) a počet stromů ke kácení; když
  obydlí na místo nejde, místo ceny krátký červený důvod (fields.md – Co hráč vidí).
- Odstraněné kameny a stromy z krajiny sídla zmizí natrvalo – krajina sídla je vygenerovaná
  krajina plus změny, které v ní udělali lidé (návrh Clauda).

### Varianty rozměrů

Martin (GitHub #1 „Vylepšení zemnic a polozemnic“, 20. 10. 2026): „Teď jsou všechny zemnice
a polozemnice (myšleno samotné stavby) stejné. Udělejme různé kombinace výšky, poměru stěn
a plochy. Oproti současnému stavu smí být každý z těchto rozměrů jiný max o 10%. Vznikne nám tak
hromada různých typů jednoho stavení a vesnice budou působit přirozeněji a ne unifikovaně. Toto
pravidlo aplikuj i na obydlí řemeslníků.“

- Každá zemnice, polozemnice a dílna (hrnčíř, kovář, tesař, uhlíř) má svou **plochu**, **poměr
  stěn** (délka podél hřebene : šířka) a **výšku** stěn a střechy – každý rozměr jiný nejvýš
  o 10 % proti dnešnímu tvaru, rovnoměrně v celém rozpětí. Dvorec ne – je jen jeden.
- Varianta je **čistá funkce polohy stavby** (souřadnice na cm): stejný tvar spočítá server
  i prohlížeč a hráč ho vidí už u kurzoru, dřív než stavba dostane id. Natočení na tvar nemá vliv
  (při otáčení klávesami [ a ] se dům nemění).
- **Přestavba na stejném místě dá stejný tvar** – rodina staví znovu dům, jaký tu stál, a dům se
  vejde, kam se vešel (větší varianta by mohla zasáhnout stavbu postavenou mezitím vedle).
  Přestavba na novém pozemku je nový dům – dostane variantu nového místa.
- **Mění se jen vzhled a místo, které stavba zabere** – kapacita, cena stavby, dřevo ani pravidla
  ne. Půdorys, vyklízená plocha (překážky, les, kus pole či sadu, který stavba zabere), kontrola
  umístění, obdélník domu pro pěšiny a brána počítají se skutečným tvarem varianty – dům tak
  nestojí v jiné stavbě a překážky odpovídají ploše.
- **Dveře, schody a šíje se nenatahují:** pás dveří (0,84 m) zůstává stejně široký, prodlouží se
  jen stěny za ním; vstupní šíje se schody má stejnou šířku, délku i schody a jen se posune se
  štítem; jáma pod terénem má stejnou hloubku (výška se mění jen nad terénem).
- **Pozemek polozemnice:** dům zůstane uvnitř plotu a záhony se mu vyhnou. Dům v rohu pozemku má
  k plotu napříč jen ≈ 0,35 m – smí se rozšířit nejvýš 1,07× (škála šířky); větší varianta se mu
  zmenší na ploše, poměr stěn a výška zůstanou. Dům uprostřed má variantu celou.
- **Starší vsi** (uložené před variantami) dostanou variantu stavby ze své polohy (jednou při
  načtení, hotové i rozestavěné). Kdyby větší varianta zasáhla jinou stavbu (obydlí, pozemek,
  modlu, svatyni, milíř, hřbitov, ohradu, branku souseda), skalní výchoz nebo posvátné místo,
  zůstane stavba v dnešním tvaru (příznak, i pro její zbytek jámy). Překážky, které větší
  staveniště volného domu nově zabere, zmizí (dům v nich nesmí stát; práci převod nestojí, dospělé
  stromy dají klády jako u převodu na pozemky); už vyklizené překážky menšího domu se nevracejí.
  Pole a sad u starého domu se kvůli větší variantě nezmenší – ustoupily už jeho původní ploše.
- **Ve scéně** jde všechno kolem domu podle varianty jedním zobrazením: model hotového domu, díly
  staveniště i rozpadu, jáma a řez terénu se šíjí a schody, hlína u vchodu, trsy pod okapem, dým
  z dýmníku, rekvizity staveniště, místa řemeslníků pod přístřeškem, výběr a obrys, minimapa,
  slepice a postavy kolem domu (i vchod, odkud vycházejí průvody pohřbu a svatby) i zbytek jámy
  po zániku. Přístřešek dílny se podél nenatahuje –
  jen se posune se štítem (jako šíje), napříč je široký jako dům. Ukázka: `/dev/buildings` – **Varianty** (řady zemnic, polozemnic a dílen,
  vlevo dnešní tvar).

| Rozhodnutí                                                                        | Kdo                |
| --------------------------------------------------------------------------------- | ------------------ |
| Plocha, poměr stěn a výška každého obydlí a dílny jiné nejvýš o 10 %; dvorec ne   | Martin (GitHub #1) |
| Varianta z polohy na cm, rovnoměrně v rozpětí; natočení na ni nemá vliv           | návrh Clauda       |
| Přestavba na stejném místě má stejný tvar, na novém pozemku tvar nového místa     | návrh Clauda       |
| Mění se jen vzhled a místo (půdorys, vyklízená plocha); kapacita a cena ne        | návrh Clauda       |
| Pás dveří a šíje se schody se nenatahují, jáma má stejnou hloubku                 | návrh Clauda       |
| Plocha = škála půdorysu, poměr = délka : šířka (podél hřebene), výška nad terénem | návrh Clauda       |
| Dům v rohu pozemku nejvýš 1,07× širší – větší plocha se zmenší                    | návrh Clauda       |
| Starší stavby dostanou variantu, srážka s jinou stavbou → dnešní tvar (příznak)   | návrh Clauda       |
| Nově zabrané překážky staršího domu zmizí bez práce, vyklizené se nevracejí       | návrh Clauda       |

### Stavba v lese

Martin (19. 10. 2026): „Oprav – obydlí může jít postavit i v lese – les se prostě vyklučí.“
Podrobnosti návrh Clauda:

- **Do lesa smí** obydlí (zemnice volně, polozemnice s pozemkem), řemeslné dílny i s milířem
  a stejně i ostatní stavby – modla, svatyně, ohrada, sad a hřbitov. Les krajiny i **les vsi**
  ([fields.md](fields.md) – Les vsi) se vyklučí stejně. **Skalní výchoz, voda a prudký svah** stavbu
  dál nedovolí, **posvátné duby a háje** se nekácí nikdy ([happiness.md](happiness.md)).
- **Cena – sazba lesa jako u dílu pole** (sjednoceno s polem): za plochu lesa, kterou stavba
  vyklučí, 250 člověkodní na hektar (s kovovými nástroji 150 – meze produktivity). Stromy, mladé
  stromky, souše, padlé kmeny, pařezy i podrost jsou v sazbě (po kusech se neplatí), kameny
  a balvany po kusech. Vyklučení pařezů je v sazbě – rešerše ji uvádí právě s klučením pařezů
  (Rösch a kol. 2017: 250 čd/ha „sedí jako horní mez s klučením“, žďár bez klučení ≈ 120–150);
  dům se zahlubuje, kořeny pod ním musí pryč. Po kusech podle tabulky by les vyšel ≈ 3× dráž
  (≈ 243 dospělých stromů na hektar ve vrstvě překážek × 3 čd ≈ 735 čd/ha) a stavba v lese by
  stála víc než stejné mýcení pro pole – jedna cena lesa pro celou hru. Na louce se dál platí po
  kusech (osamělé stromy u okraje lesa).
- **Co se vyklučí:** volně stojící stavba (obydlí, dílna, modla, svatyně) vyklízenou plochu
  (staveniště, půdorys, kruh milíře) a v lese i **pruh pod korunami** okolních stromů – 4 m kolem
  ní (koruna ≈ 50 m² jako u posvátného dubu; dům pod korunami by stál ve stínu a vlhku a hráč by
  ho ve scéně neviděl). Pruh jen v lese – louka, pole a sad kolem zůstanou, jak jsou. Pozemek,
  ohrada, sad a hřbitov celé své čtverce jako díl pole.
- **Dospělé stromy dají klády** na hromadu jako mýcení pro pole ([forest.md](forest.md)) – stavba
  je hned vezme, takže dům v lese se kácením dřeva pro sebe zlevní. Les vsi, ze kterého stavby
  odstranily všechny stromy, zmizí jako pod polem.
- **Pole v lese:** díl pole ve vymýceném lese je pole, ne les – stavba na něm (i na natočeném
  poli) za les neplatí, protože ho pole už vymýtilo (zakládaný díl ho vymýtí sám), jen pole se
  zmenší (Obydlí na poli a v sadu). Stejně čtverec sadu v lese pod obydlím.
- **Obyvatelé sami les nevyklučí:** přestavba na novém pozemku, převod starších polozemnic na
  pozemek a místo nové vsi vedle (vývojové tlačítko) hledají dál jen louku.
- **Ve scéně:** stromy na vyklučené ploše zmizí (3D i impostory), plocha korun nad pasekou zapadne
  podle jejího tvaru (i u malé paseky obydlí bez pozemku), ztmavení trávy pod stromy se přepočítá,
  podrost lesa vsi pod stavbou neroste. Les kolem zůstane. Palivo a pěšiny počítají vzdálenost
  jako jinde – dům v lese má palivo u dveří.

### Obydlí na poli a v sadu

Martin (18. 10. 2026): „domy by měly jít stavět na polích a v sadech. Pole a sad se prostě
zmenší o plochu domu“. Podrobnosti jsou návrh Clauda:

- **Polozemnice s pozemkem** smí na čtverec pole i sadu (pozemek je celé políčko ve stejné
  mřížce). Díl pole nebo čtverec sadu pod pozemkem z pole či sadu **zmizí** – pole či sad se
  o čtverec zmenší; byl-li to poslední čtverec, pole či sad zanikne. Natočený pozemek nebo pole
  či sad v jiné mřížce (fields.md – Natočené stavby) berou jen průnik ploch jako obydlí bez
  pozemku. Zbytek zůstane jedním polem či
  sadem, i kdyby se tím rozpadl na nesouvislé části – nic se nedělí.
- **Zemnice a další obydlí bez pozemku** (i řemeslné dílny) smí přes díly polí a čtverce sadu.
  Každý dotčený díl či čtverec se **zmenší o průnik vyklízené plochy obydlí** (staveniště
  s hromadou hlíny a předsazenou střechou, u uhlíře i kruh kolem milíře) se svým čtvercem. Díl,
  kterému zbude **méně než 20 % políčka** (45 m²), zmizí celý – zbytek u domu by nikdo
  neobdělával. Plocha se odečítá z průniku s každým domem zvlášť (dva domy, jejichž vyklízené
  plochy se na dílu překrývají, mu ten kus uberou dvakrát – zjednodušení).
- **Hřbitov** dál ne (hroby). Ostatní kontroly obydlí platí beze změny – posvátný dub a háj,
  skalní výchoz, rovná zem pod domem, jiná obydlí a pozemky.
- **I ostatní stavby** smí na pole (Martin, 18. 10. 2026 – [fields.md](fields.md), Pole jako
  krajina: „cokoliv kromě jiného pole“): sad, hřbitov, ohrada, modla, svatyně, jabloně a stromy
  u cest – pole ustoupí stejným pravidlem. Do sadu smí dál jen obydlí.
- **Úroda a práce** jdou s plochou: díl odebraný z pole zmizí i z ročního plánu osevu a z pořadí
  práce (i z orby rádlem a ze seče sena na úhoru – [oxen.md](oxen.md)), zmenšený díl dá úměrně
  menší úrodu i seno a chce úměrně méně práce; ostatním dílům zůstane, co na nich bylo hotové
  (čelo práce i seče se nepohne). Sklizená plodina (úroda už je v zásobách) se
  nemění. Rozestavěné založení pole se zmenší úměrně (cena i odvedená práce), zakládaný díl pod
  pozemkem zmizí s ním. Čtverec sadu dá úměrně méně jablek a sezónní práce (sklizeň, péče)
  i výsadby; jabloně pod domem ve scéně chybí, stejně tak obilí pod vyklízenou plochou.
- **Překážky** na založeném dílu a vysazeném čtverci už nejsou – obydlí tam mýcení neplatí, cena
  u kurzoru to ukazuje (stejné funkce jako na serveru). Zakládaný díl či nevysazený čtverec, který
  dům sebere celý, předá své překážky staveništi domu – odklidí se s ním bez práce navíc,
  dospělé stromy dají klády.
- **Při umisťování** je u kurzoru oranžové varování „Pole se zmenší“ (nebo „Pole zanikne“, když
  mu dům sebere poslední díl), u sadu „Sad se zmenší“ / „Sad zanikne“ – stavbu neblokuje.
- **Kronika:** pole či sad ustoupil stavbě obydlí (o kolik m², nebo zanikl). Upozornění
  v rozhraní není.
- Když dům později zanikne (chátrání), plocha se do pole ani sadu sama nevrací. Zemnice při
  založení vsi se chová stejně – ves tehdy pole ani sad ještě nemá.

### Práce

Martin (19. 10. 2026): „Vesničané se snaží vyrobit co nejvíce jídla (později přibudou nejspíš
i jiné suroviny), ale pokud se něco staví, tak čas věnují primárně té stavbě – zemědělství jenom
natolik, aby vesnice neměla hlad.“ A k pořadí práce: „Zvířata a pasáci – to obstarají výrostci,
takže do práce je nemusíme počítat, jsou úplně bokem. Domácí výrobu z většiny obstarají ženy,
takže to do práce stavby taky nemusíme počítat. Opravy obydlí zařaď až za stavbu.“ A dál: „Když
bude ve vsi málo vhodných dětí na pasení, tak to omezí i velikost stád.“ a „Dojení a péče
o zvířata – to obvykle dělají ženy. Starší lidé se zase starají o malé děti, a uvolňují práci
zbytku rodiny.“

- **Pracovní síla vsi** (pole, stavby, opravy) za den: **dospělý 1 člověkoden** (venku podle
  délky dne – Skladba dne podle ročního období), nikdo jiný –
  jen ve žňový den dají výrostci od 10 let a starší po 0,5 člověkodne na žeň a výmlat
  ([pole](fields.md) – Žně všemi rukama, Martin 24. 10. 2026).
  - **Starší** dají 0,5 člověkodne, ale jen na **denní minimum své domácnosti** – hlídání malých
    dětí, oheň, vaření (návrh Clauda). Dospělí domácnosti dají na denní minimum jen zbytek:
    max(0, minimum domácnosti − 0,5 × starší v domácnosti). Co starším nad minimum zbude, do
    práce vsi nejde a propadne – ves, kde má každá domácnost nejvýš jednoho staršího, má na
    polích a stavbách stejně práce jako dřív, ves s víc staršími v domě o jejich přebytek
    přijde.
  - **Děti 7–13 let (výrostci)** jen pasou – do práce vsi nejdou vůbec (dřív 0,3 člověkodne;
    návrh Clauda). Jejich počet omezuje velikost stád ([diet.md](diet.md) – Pasáci).
  - Mladší děti nepracují.
- **Chůze pro vodu je práce** (Martin 19. 10. 2026: „Ve Vlkově nikde nevidím vyšlapanou cestu
  k potoku. Ale vesničané tam přece musí chodit nějak pro vodu a musí jim to zabírat čas.“; čísla
  návrh Clauda – [paths.md](paths.md), Pochůzky pro vodu): k dennímu minimu domácnosti se přičte
  chůze pro vodu nad 100 m – 0,4 cesty (tam a zpět) na člověka domácnosti a den, 1 m/s po louce,
  den 10 h: cesty × 2 × (chůze k vodě − 100 m, nejméně 0) ÷ 1 m/s ÷ 10 h. Prvních 100 m je
  v ceně minima. Patří do denního minima – starší ji kryjí jako jeho zbytek, platí i v plánu
  osevu a v dílnách. Bez krajiny (kalibrace) se chůze neměří a přirážka není. **S vozem**
  ([wagons.md](wagons.md) – Co vozy vozí): vodu, kterou přivezl vůz v sudech, domácnost nenosí
  a místo toho platí díl práce posádky vozu – vůz vozí jen domácnostem, kterým to ušetří práci
  (domácnosti dílen nosí dál samy).
- **Bokem – mimo práci vsi:** dojení a péče o zvířata (ženy), pasení (výrostci) a domácí výroba
  (z většiny ženy – i zpracování vlny a lnu na oděv a palivo, forest.md – Palivo). Práci vsi
  neberou; ve scéně jsou ženy dál u domů a dojí, výrostci u stád (jen zobrazení).
- **Pletí – hlavně ženy a děti** (Martin 25. 10. 2026: „Ve středověku se plelo jednou, rychle
  a dělaly to hlavně ženy a děti“): pletí bere práci napřed z dětí 7–13 let, které nepasou, pak
  z žen – jejich podíl na práci vsi –, muži doplejí jen, co ženy a děti nestihnou, a **až po
  stavbách** (Martin 9. 11. 2026: „pletí obstarají ženy a děti“) – [fields.md](fields.md), Pletí
  jednou a rychle. Ostatní polní práce má přednost před stavbami (fields.md – Osevní postup po
  dílech, bod 3).
- Pole jsou společná, a proto se práce počítá **za celou ves** – dospělí všech domácností
  pracují pro ves. Pořadí práce dne (denní minimum domácností, lidé na výpravách k sousedům,
  potřebné sezónní úlohy, **společná práce vsi** do staveb, opravy obydlí, zbytek) popisuje
  [fields.md](fields.md) – Práce.
- Společná práce se nedá schovat na později – každý den jde napřed do rozestavěných staveb
  (stavby hráče i přestavby obyvatel, rovným dílem), co stavby nespotřebují, do oprav obydlí,
  a co zbude i po nich, propadne (místo pro polní práci navíc – [fields.md](fields.md), Kolik
  ves oseje, Osev navíc).

### Skladba dne podle ročního období (9. 11. 2026, implementováno)

Martin 9. 11. 2026: „Jde mi o tu skladbu dne v létě a v zimě. Jde o to, že zatím co v létě byli
všichni co nejdéle venku a o žnách sklízeli obilí, za zimních večerů předli, tkali, vyráběli
drobné předměty atd. Další věc – v létě se nosí voda, v zimě se nosí dřevo – pokud je sníh, voda
se nosit nemusí (ani nemůže, protože vodní zdroj je zamrzlý)“ a ke žním: „O žních si ženy braly
děti na pole. Byla to fakt ta největší práce (a v zemědělství dodnes je) v roce. V té době se
omezuje i vaření. Nošení vody – pokud je tam pauza, jako tady mezi ozimí a jaří, měla by se
nanosit voda do zásoby. Navíc v průběhu žní se nenosí voda domů, ale spíš na pole.“ Schváleno
(„Já měl za to, že jsme to teď podrobně probrali“). Podrobnosti a čísla jsou návrh Clauda.

- **Venkovní práce podle světla:** dnes dá dospělý každý den 1 člověkoden (10 h). Nově se práce
  vsi venku (pole, stavby, cesty, kácení, vozy) řídí délkou světlého dne v Čechách (50° s. š.)
  bez jídla a přestávek: prosinec–leden ≈ 7 h, listopad a únor ≈ 8–9 h, březen a září ≈ 10–11 h,
  květen ≈ 13 h, červen–srpen 13–14 h – den dá (hodiny ÷ 10) dnešního člověkodne (zima ≈ 0,7,
  žně ≈ 1,4). Sazby prací na hektar zůstávají – vznikly z měření po hodinách přepočtených na 10 h
  (srp ≈ 60–80 m² za hodinu – rešerše 2026-10-17).
- **Zimní večery** patří domácí výrobě (předení, tkaní, drobné předměty) – ta už teď práci vsi
  nebere (bokem, Martin 19. 10. 2026); mění se jen scéna (ženy v zimě doma).
- **Denní minimum podle období:**
  - **léto:** vaření, oheň, malé děti a nošení vody (jako dnes);
  - **žňové dny:** vaří se méně (minimum ≈ poloviční) a voda se nosí na pole, ne domů – chůze pro
    vodu se do minima nepočítá (nosí ji děti a pomocníci se žní); ženy berou malé děti na pole;
  - **přestávka mezi žní ozimu a jaře:** volná práce nanosí vodu do zásoby na žňové dny;
  - **zima:** místo vody se nosí dříví na topení – chůze k okraji lesa (`forestWalkM`) se přičte
    jako dnes voda; **když leží sníh**, voda se nenosí (rozpouští se sníh, potok je zamrzlý).
    Sníh v simulaci podle stejného výpočtu jako ve scéně (roční období).

**Implementace (9. 11. 2026, čísla návrh Clauda – `DAYLIGHT_WORK`, `DAY_CHORES` v
`rules-people.ts`):**

- **Hodiny venkovní práce** v polovině měsíce (leden … prosinec): 7 / 8,5 / 10 / 11,5 / 13 / 14 /
  14 / 13 / 11 / 9,5 / 8 / 7 h – světlý den na 50° s. š. (v polovině měsíce 8,5 / 10 / 11,8 /
  13,6 / 15,2 / 16,2 / 15,8 / 14,4 / 12,6 / 10,9 / 9,2 / 8,2 h) bez jídla a přestávek (v zimě
  ≈ 1–1,5 h, v létě ≈ 2–2,5 h s polední přestávkou), nejvýš 14 h. **Mezi polovinami měsíců
  lineárně** (návrh Clauda): bez skoku o 1,5–2 h prvního dne v měsíci – plán by jinak počítal
  okna, která 1. den v měsíci skokem zkrátí nebo prodlouží. Rok vychází ≈ 10,5 h (× 1,05).
- **Co je venkovní práce** (návrh Clauda): práce vsi, která zbude po pracích „za den“ – pole,
  stavby, cesty, kácení, opevnění, opravy, seč, hlídka, pasení dospělým, ryby –, zásobníky polní
  práce (lehká práce žen řemeslníků, žňové ruce, děti při pletí, práce žen při pletí, pomoc
  vojvodovy rodiny ve žních), robota hostů a kapacita spřežení (voli orají za světla). **Za den**
  (nenásobí se): denní minimum domácností (vaření, oheň, malé děti, voda – trvá celý den, ať je
  světla kolik chce), péče o koně, kování, lidé na výpravách (jsou pryč celé dny) a sedláci
  s vozy pro uhlí a rudu kováře (jízda domluvená na celý den). Řemeslo v dílně a domácí výroba se
  nemění (pod střechou, zimní večery). Kolik jízd vůz za den udělá, se zatím nemění.
- **Žňový den** (`harvestHandsDay`): denní minimum × 0,5 a bez přirážky za vodu – i u starších,
  kteří tím dají žni víc, u dílen a ve dvorci.
- **Přestávka mezi žní ozimu a jaře** (návrh Clauda): zásoba vody na žně se z volné práce
  přestávky neodečítá – přirážka za vodu je u domácnosti setiny člověkodne, za žně dohromady
  desetiny, a dny přestávky jsou ve vsi ty s nejvíc volnou prací; samostatná evidence zásoby vody
  by stála víc, než váží.
- **Topná sezóna listopad–březen:** 1 cesta pro dříví na domácnost a den tam a zpět k okraji lesa
  (`forestWalkM`, otep klestí ≈ 20–30 kg na ohniště, které v zimě spálí ≈ 15–25 kg denně),
  prvních 100 m v ceně minima, 1 m/s, den 10 h – jako voda. Vůz s vodou ji neušetří.
- **Sníh leží**, když je sníh scény (`snowCover` – stopa sněhu, dlouhá zima ji opozdí, holomráz ji
  vezme) aspoň 0,5: v normální zimě ≈ 30. 11. – 2. 3., v dlouhé zimě do ≈ 23. 3., v holomrazu od
  ≈ 3. 2. bez sněhu. Výpočet je jeden (`snow.ts` v jádře), scéna ho importuje.
- **Scéna:** ve žních a se sněhem nikdo nenosí vodu (`waterHouseholdsToday` podle skladby dne).
  Ženy v zimě doma – zatím ne (námět: postavy žen ve scéně v zimních měsících jen u domů).

### Růst populace

- **Porody:** každý **manželský pár** v jedné domácnosti (žena **16–44 let**, muž od 16 let bez
  horní meze – [kinship.md](kinship.md); chlapců se rodí 105 na 100 dívek). **Plodnost podle věku
  ženy** (od 19. 10. 2026 – návrh Clauda podle [rešerše](research/2026-10-19-population-growth.md);
  dřív 1/3 dítěte ročně v každém věku): přirozená manželská plodnost (Coale a Trussell, Henryho
  průměr) × 0,85 – porodů na vdanou ženu za rok 16–19 let 0,35, 20–24 0,39, 25–29 0,37, 30–34
  0,34, 35–39 0,27, 40–44 0,14; manželská plodnost 20–44 let ≈ 7,5 dítěte. **Rozestup porodů:** po
  porodu žena 21 měsíců nerodí (9 těhotenství + rok kojení), po svatbě 9 měsíců (i zakladatelé
  od založení vsi); potom rodí s denní šancí, při které průměrný odstup vyjde 1 / plodnost věku
  (ve 20–24 letech ≈ 31 měsíců – intervaly mezi porody 24–39 měsíců, Macfarlane 2002). Vsi uložené
  dřív se počítají od nejmladšího žijícího dítěte. Porody od 16 let jsou oprava podle rešerše (dřív
  od 14 – plodnost od 14 je optimistická); pro práci, odemčení nového obydlí a rozpad domácnosti
  je dospělý dál od 14. Porody tlumí až zastaví jen opravdový hlad – **energie** (podíl kalorií proti potřebě) pod 95 %,
  při 50 % a méně se nerodí; jednotvárná strava je nebrzdí (Martin, 25. 10. 2026: „Ok, ať porody
  brzdí jen opravdový hlad.“ – návrh Clauda, schválený). Přeplněnost je výrazně sníží (beze změny).
- **Úmrtí:** zhruba 40 % dětí se nedožije 14 let (v polozemnici méně než v zemnici; Lahovice:
  41 % do 20 let – Zazvonilová a kol. 2020); dospělí umírají asi **2 % ročně** (oprava podle
  rešerše, dřív 1,5 % – v Lahovicích umírali muži v průměru ve 43–47 a ženy ve 39–43 letech),
  starší víc (kolem 8 % ročně). Hlad a přeplněnost úmrtnost zvýší.
- **Přeplněnost** sama nastaví strop: populace domácnosti se ustálí kolem kapacity obydlí
  (+1–2), takže ves bez nových staveb přestane růst, ale nevymře.
- **Hygiena** (bez ukazatele) zvyšuje úmrtnost, když ves nemá pohřebiště, je plné nebo leží moc
  blízko obydlí či vody – [cemetery.md](cemetery.md) (Martin).
- **Jídlo** vstupuje jako **nasycení vsi** 0–1 – počítá ho [fields.md](fields.md). Dnešní hlad
  zvýší běžnou úmrtnost, nahromaděný hlad zabíjí – lidé umírají hlady, dokud jich nezbude tolik,
  kolik zásoby uživí, a bez jídla ves vymře (Hlad a vymření).
- Porody a úmrtí jsou **jednotlivé náhodné události**, ale opakovatelné: náhoda se odvozuje
  ze seedu světa, vsi a herního data. Stejný stav ve stejný den dá vždy stejný výsledek.
- Lidé stárnou podle data narození; s věkem přecházejí mezi skupinami.
- **Hájení:** prvních 30 herních let od založení vsi jí přeje štěstí (Martin) – dospělí
  neumírají (ani hladem) a dětí umírá polovina oproti běžné úmrtnosti a hladem žádné (podoba
  štěstí je návrh Clauda, doladí se kalibrací). Malá ves tak nevymře hned na začátku a všichni hráči
  mají srovnatelný start. Po hájení už nikoho zvlášť nechrání – ani poslední dva dospělé
  (do 18. 10. 2026 je hlad nezvyšoval).
- **Rozpad domácnosti** ([kinship.md](kinship.md) – Domácnosti): domácnost, ve které nikdo není
  16–44 let (jen děti, nebo jen starší), se přestěhuje **k nejbližším příbuzným** – do domu syna,
  pak dcery, pak sourozence někoho z ní –, a když žádné nejsou, do domácnosti s nejvíc volnými
  místy. **Jen když tam dům nepřeplní** (Martin, 19. 10. 2026: „Pokud by byla domácnost kam přijde
  přeplněná, ať radši zůstane ve starém domě. I jeden obyvatel domu by jej měl být schopný
  udržovat, dokud nezemře. Pomáhají mu v tom sousedé“) – jinak zůstane doma, dům je obydlený
  a nechátrá. Samotné děti (nikdo od 16 let) jdou i do přeplněného domu (návrh Clauda – samy
  bydlet nemohou). Kronika přestěhování zapíše. **Osamělý člověk 16–44 zůstává** – je svobodný
  a vezme se (návrh Clauda k Martinovu „nejstarší dítě může odejít“, 18. 10. 2026; dřív se
  stěhoval taky a domácnost držel pohromadě už člověk 14–44).
  Opuštěné obydlí se neopravuje a chátrá rychleji (zemnice ≈ 5 let, polozemnice ≈ 8 let – viz
  Nové obydlí); při stavu 0 zanikne a políčko se uvolní.

### Sňatky

Pravidla sňatků jsou v [kinship.md](kinship.md) (Martin, 18. 10. 2026; detaily návrh Clauda):
berou se svobodný muž od 16 let a svobodná žena 16–44, kteří nejsou blízcí příbuzní (do
bratranců), s věkovým rozdílem nejvýš ≈ 15 let; **žena se stěhuje k muži**. Kdo ve vsi nemá
s kým se vzít, toho bere nebo dává okolí – svobodný muž od 18 let si s ≈ 30 % ročně přivede
nevěstu z okolí.

**Od 19. 10. 2026** (Martin: „Vdova by se měla snažit co nejdříve vdát, ideálně ve vesnici.
Obecně by měla být pravidla nastavena tak, aby se populace co nejvíce rozrůstala.“; detaily návrh
Clauda – [kinship.md](kinship.md), [rešerše](research/2026-10-19-population-growth.md)):

- **Vdova se vdává hned** – i s malými dětmi (dřív se vdova s dětmi do 14 let nevdávala); vdovy
  a vdovci mají při párování ve vsi přednost a rozdíl věku u nich smí být 20 let.
- **Děti do 16 let jdou s rodičem**, který se stěhuje. Žena jde k muži, i do přeplněného domu
  (Martin); **když drží dům ona a on ne, přižení se on k ní** (Martin) – drží-li ho oba, stěhuje
  se ten, u koho bude méně těsno. Přeplněný dům ani rozpad domácnosti nevěsty svatbě nebrání.
- **Ženich z okolí:** k ženě od 18 let bez ženicha ve vsi se přižení muž z okolí – k vdově,
  dědičce, která drží dům, a k ženě z domu bez mužů s ≈ 50 % ročně (pryč se nevdává), k ostatním
  s ≈ 10 % ročně; jinak se s ≈ 20 % ročně vdá pryč (dřív 30 % ročně, jen pryč).
- V hladu a do přeplněného domu z okolí nikdo nepřijde.

Dřívější „sňatky mezi domy“ (Martin, 18. 10. 2026: „Ano, přidej sňatky mezi domy“ – svobodní 16–44
ze dvou domů, kdokoli s kýmkoli) nahradily sňatky muže a ženy podle příbuzenství. Proč vznikly:
ve Vlkově (rok 612) žili 27letý a 19letý každý v jiném domě a nikdy by se nedali dohromady.

### Hlad a vymření

Martin, 18. 10. 2026: „Koukám do hry, jídlo došlo, nasycení 0 %, ale lidé si furt vesele žijí
místo aby zemřeli.“ Na návrh Clauda (nahromaděný hlad, smrt do ≈ 2 měsíců bez jídla, hájení
zůstává, ochrana posledních dvou dospělých padá): „Ano, když hráči vymřou všechny vesnice (časem
jich bude moci mít více), tak pro něj hra končí – musí začínat znovu.“ Čísla jsou návrh Clauda.

- **Hladem se umírá z energie, ne z pestrosti** ([strava](diet.md), od 18. 10. 2026): nahromaděný
  hlad i přirážka úmrtnosti za dnešní hlad počítají s pokrytím energie; nasycení se stravou
  (energie × pestrost) řídí štěstí; porody od 25. 10. 2026 řídí jen energie (viz Porody). Ves jen
  s obilím (80 %) hladem neumírá a množí se naplno, je jen méně šťastná.
- **Nahromaděný hlad** vsi se měří ve **dnech bez jídla**: každý den přibude
  max(0, 0,9 − energie) / 0,9 – den bez jídla je celý den, den o polovičním přídělu ≈ 0,44
  a při 80 % ≈ 0,11 (mírný nedostatek tělo snese – návrh Clauda, upraveno 18. 10. 2026). Když
  ves jí aspoň z 90 %, hlad ubývá o den denně až k nule – jedna hranice pro přibývání
  i zotavení, žádné pásmo, kde by hlad stál. Víc než 60 dní se nehromadí (dál už to nemá vliv).
- **Úmrtí hladem:** k běžnému dennímu riziku (věk, přeplněnost, dnešní hlad, hygiena) se přičte
  riziko z nahromaděného hladu – nula do prahu, pak strmě roste: ((hlad − práh) / (jistá smrt −
  práh))³. Dospělí: práh 20 dní, jistá smrt 60. Děti a starší: práh 12, jistá smrt 45. Bez jídla
  tak ze sytosti vymřou všichni do 60 dní, děti a starší do 45 (polovina lidí zhruba za měsíc).
- **Ves se srovná sama:** příděl se dělí rovně do sklizně ([fields.md](fields.md)), takže
  každé úmrtí zvedne příděl ostatním. Při polovičním přídělu začnou děti a starší umírat po
  ≈ 5–6 týdnech, ves se během dalších ≈ 6 týdnů zmenší na ≈ 45–50 % lidí a zbylí jsou sytí. Mírný
  nedostatek (80 % přídělu) začne zabíjet děti a starší až po ≈ 4–5 měsících a za rok stojí
  ≈ 15 % lidí. Porody se zastaví už při energii 0,5 (Růst populace).
- **Napřed nouzová porážka:** ves, které výhled do sklizně nevychází, nejdřív porazí zvířata
  navíc a teprve pak ubírá z přídělu ([strava](diet.md) – Nouzová porážka, Martin 19. 10. 2026).
- **Stupně upozornění** (Martin, 19. 10. 2026; příděl = rovný díl zásob do sklizně podle výhledu):
  **„Ves šetří jídlem“**, když ves ubírá z přídělu, ale jí se 90–100 % – mírný tón (zpráva, ne
  varování), stačí ikona nasycení; **„Ves hladoví“** pod 90 % – od té hranice se sčítá
  nahromaděný hlad; **„Lidé umírají hlady“**, jen když opravdu hrozí smrt hladem (nahromaděný hlad
  přes práh dětí a starších). Ukáže se vždy jen nejvyšší stupeň a ohlásí se, jen když se hlad
  zhorší (zlepšení je vidět na ikoně nasycení). Totéž z jiné vsi hráče („Budeč: ves šetří jídlem“)
  a v seznamu vsí.
- **Hájení** chrání dospělé a starší i před smrtí hladem. Hlad v něm dál přibývá, ale nejvýš
  den pod prahem skupiny (dospělí 19, děti a starší 11 dní) – děti v hájení hladem neumírají
  (běžné riziko se jim půlí) a po konci hájení lidé umírají postupně, ne všichni druhý den
  (návrh Clauda, 18. 10. 2026).
- **Vymření:** když zemře poslední člověk, ves **vymřela** – kronika to zapíše a ves se dál
  nesimuluje: pole, stavby, zásoby i klády zůstanou, jak byly (scéna bez dýmu a zvířat, hlína
  u obydlí zarůstá). Do vymřelé vsi nejde stavět ani ji přejmenovat (server odmítne „Ves
  vymřela – nikdo v ní nežije.“).
- **Konec hry:** komu vymřou všechny vsi (dnes má hráč jednu, pravidlo platí obecně pro víc
  vsí), tomu hra končí – obrazovka porážky jako v 0 A.D. přes zamrzlou scénu: „Rod vymřel“, jméno
  vsi, roky jejího života a jediné tlačítko **Začít znovu**. To staré sídlo i s vymřelou vsí
  odloží do archivu a hráč dostane **nové sídelní sídlo s novou krajinou** – zakládá ves od
  první zemnice jako nový hráč (návrh Clauda; vazalství a rod se vyřeší s jejich mechanikami).
  **Návrh issue #9 fáze 1** (Martin, 24. 10. 2026): hra končí i tehdy, když **vymře rod vojvody po
  meči** (zemře poslední muž rodu, i dítě) – obrazovka „Rod vymřel“, vsi se přestanou dopočítávat
  a zaniknou jako opuštěné, Začít znovu beze změny ([vojvodova rodina](lord.md) – Konec rodu).
- **Začít znovu z nabídky** (Martin, 18. 10. 2026: „Měl bych mít k dispozici menu, ve kterém
  bych mohl restartovat hru.“): nabídka hry jako v 0 A.D. (tlačítko vpravo v horní liště, F10)
  má **Začít znovu**, **Odhlásit** a **Zpět do hry**. Začít znovu jde i se živou vsí – po
  potvrzení v nabídce („Ves i rod zaniknou, začneš v nové krajině.“) jde sídlo i s živou vsí do
  archivu (ves se dál nedopočítává) a hráč dostane nové sídelní sídlo s novou krajinou jako po
  konci hry. Dokud ves není (zakládání), není co začínat znovu. Opakované i souběžné potvrzení
  založí jediné nové sídlo; o všem rozhoduje server (návrh Clauda).

### Nové obydlí (rozhoduje hráč)

- **Vystěhovaná domácnost má přednost** (demolition.md – Obydlí): obyvatelé opuštěného nebo
  zbouraného obydlí bydlí dočasně v cizích obydlích a do nového (nebo vráceného prázdného) obydlí
  se nastěhují jako první, před rodinou ženatého syna. Počítá se jako dům, který čeká
  („Rodina čeká na dům“).
- O každé nové stavbě rozhoduje hráč (Martin) – vybere typ a místo (viz Umístění obydlí).
- **Hráč staví kdy chce** (Martin, 17. 10. 2026: „Hráč sám rozhodne kdy a co bude stavět, jako
  v každé RTS.“) – kdy začne, rozhoduje hráč; brání mu jen to, co stavba potřebuje předem
  (suroviny, lidé k osídlení – viz níže). Rozestavěné stavby se dělí o společnou práci vsi
  rovným dílem, takže víc staveb najednou roste pomaleji.
- **Zrušení rozestavěné stavby** (Martin, 23. 10. 2026: „Potřebuju mít možnost stavbu
  zrušit.“): jde zrušit jen **rozestavěná** stavba, kterou začal hráč – nové obydlí a dílna,
  pole, hřbitov, sad, modla, svatyně, ohrada a humno, i rozestavěné rozšíření (další čtverec
  hřbitova či ohrady). Hotové stavby se nebourají. Vytýčení zmizí (nehotové díly pole, čtverce
  sadu, hřbitova a ohrady, humno) a práce na stavbě skončí. **Nespotřebované suroviny se vrátí**
  do zásob (Martin: „suroviny, které se ještě nezabudovaly, se vrátí“): klády vzaté z hromady
  a už skácené stromy se vrátí na hromadu, bez té části, která se podle odvedené práce už
  zabudovala (dřevo stavby × odvedená práce / cena práce, dolů). Odvedená práce, zabudovaný
  materiál, odstraněné překážky a pole či sady, které stavba zmenšila, propadnou. Zrušení
  nehotového hřbitova nebo ohrady zruší i rozšíření, které na něj navazovalo. Návrh Claude:
  nezrušitelná je první zemnice zakladatelů, přestavby, obnova sadu, opravy a rádla (dělají
  vesničané sami) a zatím i stavby cest (vylepšení, vozová cesta, stezka, jabloně). V rozhraní
  je to tlačítko s křížkem v panelu výběru rozestavěné stavby, slova jen v popisce.
- **Odemčení surovinami** (Martin, 17. 10. 2026: „Odemykání bude samozřejmě také – pokud nebudu
  mít suroviny na postavení stavby, bude její tlačítko v panelu disabled.“): stavba může mít
  kromě práce i **cenu předem** v surovinách ze zásob vsi; když je ves nemá, tlačítko stavby je
  zašedlé a v popisku je chybějící část červeně (jako v 0 A.D.). Dnes žádná stavba suroviny
  předem nestojí (práce se platí postupně) – mechanismus je připravený pro dřevo a kámen
  (`packages/game/src/domain/village/costs.ts`).
- **Lidé k osídlení** (Martin, 17. 10. 2026: „Také mi to nabízí stavbu obytných budov, i když je
  nemám kým osadit.“; **od 8. 11. 2026 už nejsou cenou předem obydlí** – Martin: „A“, viz
  [demolition.md](demolition.md) – Rozhodnutí): **lidé k osídlení** = možné nové domácnosti –
  rodiny ženatých synů, které se mohou oddělit (z jakéhokoli domu – Martin, 19. 10. 2026),
  a svobodní nejstarší synové plných domů (viz Po dokončení, [kinship.md](kinship.md)) –, minus
  prázdná obydlí, minus rozestavěná nová obydlí – každé už jednu domácnost čeká. Obydlí (zemnice,
  polozemnice) jde postavit **i bez nich**: je-li ve vsi rodina k oddělení, stavba ji zamluví
  a nastěhuje se jako dřív; jinak dům po dostavění zůstane prázdný, dokud se do něj někdo
  nenastěhuje. Tlačítko obydlí tedy zašedne jen kvůli dřevu. **Totéž platí pro řemeslné
  dílny** (Martin 8. 11. 2026: „A“): stojí jen dřevo, po dostavění čekají prázdné a nevyrábějí,
  dokud se do nich nenastěhuje rodina (stejným krokem jako do prázdného obydlí, přednost mají
  dočasně ubytovaní). Pole jdou vždy. První zemnici při založení vsi osídlí sami zakladatelé.
- **Cena:** člověkodny ze společné práce vsi (dřevo viz Zjednodušení). Stavba roste den po dni
  podle toho, kolik společné práce přitéká; hráč vidí postup.
- **Po dokončení** nové obydlí osídlí **rodina ženatého syna** – muž, jeho žena a jejich svobodné
  děti (Martin: „plná domácnost → nová domácnost v novém obydlí“; převod na rodiny
  [kinship.md](kinship.md) – návrh Clauda, Martin schválil). **Z jakéhokoli domu, i neplného**
  (Martin, 19. 10. 2026 – schválený návrh Clauda: „ženatý pár, který dům nedrží, smí odejít do
  nového nebo prázdného domu kdykoli, ne jen z plného domu“; ve Vlkově nešla postavit dílna
  uhlíře – dvě ženy od souseda by se vdaly do neplného domu a pár z něj nesměl). Dřív
  (rozhodnutí 18. 10. 2026) jen z plné nebo přeplněné domácnosti a jen dokud dům zůstával plný –
  kvůli stěhování tam a zpět, které s příbuzenstvím odpadlo. **Nejstarší ženatý syn zůstává
  s rodiči** jako dědic; v domě bez ženatého syna drží dům vdova s vlastními dětmi (Martin, 19. 10. 2026 – návrh Clauda) a ženatí smí odejít všichni; jinak (ženatí bratři po smrti rodičů) zůstává
  nejstarší z ženatých mužů; ženatý muž bez rodičů v domě vedle dědice se oddělí. Rodina neodejde, když by se zbytek domácnosti rozpadl (zůstali by jen starší
  a děti). Z více rodin jde ta z nejvíc přeplněné domácnosti, v ní nejstarší muž. Když žádná
  rodina odejít nemůže, zůstane obydlí **prázdné** – postavené „do zásoby“.
- **Prázdné obydlí** obsadí sama první rodina, která se může oddělit (z nejvíc přeplněného domu,
  v něm od nejstaršího muže); co zůstane prázdné, osídlí **svobodný nejstarší syn z plného
  domu** (Martin, 18. 10. 2026: „pokud se lidé v domě tísní a je tam nejstarší dítě, nejstarší
  dítě může odejít do nového domu“, „ať prázdný dům obsadí i plná domácnost“) – od 16 let, sám,
  a ožení se tam (sňatkem ve vsi nebo z okolí). Svobodný syn dál jen z plného domu (návrh Clauda, 19. 10. 2026: odchodem nic nezíská – ženit se smí i doma – a zabral by dům, na který čeká
  rodina). **Dědic u neplodných rodičů** (Martin, 18. 10. 2026: „Pokud
  už jsou rodiče neplodní, tak ano, má“): když v domě ještě není ženatý syn a matka synů už nemůže
  rodit, zůstává nejstarší syn a odejít smí druhý nejstarší; se ženatým dědicem smí odejít
  nejstarší svobodný syn. Bez svobodného syna jde jiný svobodný muž od 16 let bez rodičů v domě,
  který není otcem nikoho z domu (Martin, 19. 10. 2026 – přeplněný dům ve Vlkově, návrh Clauda).
  **Dcery odcházejí sňatkem**, samy ne. Dřívější „dospělé děti
  z přeplněné domácnosti“ (Martin, 18. 10. 2026 – dva nejmladší ze 4 dospělých, dospělé děti po
  dvou, jednotlivci z různých domů spolu) se s příbuzenstvím převedly na synovy rodiny.
- **Pořadí:** nejdřív rodiny pro všechna prázdná obydlí (obydlí podle id), pak svobodní synové –
  bez náhody, takže na kouscích dopočtu nezáleží. Kronika zapíše založení domácnosti.
- **Prázdné obydlí chátrá rychleji** (Martin, 18. 10. 2026: neobydlené budovy chátrají
  rychleji): dokud čeká, neopravuje se – stav ubývá o celou potřebu oprav podle stáří – a navíc
  o pevný díl stavu denně, protože se nevytápí, došky hnijí, dřevo v zemi trouchniví a nikdo
  nespraví střechu. Nová prázdná **zemnice spadne z plného stavu na nulu za ≈ 5 let**,
  **polozemnice za ≈ 8 let** (čísla návrh Clauda; složka podle stáří je u nového domu
  zanedbatelná, staré prázdné obydlí zanikne dřív). Dřív jen bez oprav vydržela zemnice ≈ 16 let
  a polozemnice ≈ 26 let – déle než obydlený dům do přestavby. Po znovuosídlení se stav dál
  nesnižuje (obyvatelé dům opravují – Chátrání a přestavba), ale ani nezvedá – co zbylo, zůstane;
  přestavbu rozhodne stáří. Rozestavěná přestavba prázdného obydlí se ruší.
- Hráč dostane upozornění „Rodina čeká na dům“ (do 19. 10. 2026 „Domácnost je plná“ – rodiny teď
  odcházejí i z neplného domu), když na rodinu ženatého syna (nebo svobodného nejstaršího syna
  z plného domu) nečeká žádné nové obydlí (fakt – zároveň s ním se odemkne stavba obydlí).
- Když hráč nestaví, přeplněná domácnost žije v těsnu – méně porodů, víc úmrtí, ves přestane
  růst (Martin potvrdil).

### Chátrání a přestavba (rozhodují obyvatelé)

- Každé obydlí má **stav** 0–100 % a stárne. Potřeba oprav (člověkodny za rok) roste s věkem
  – zpočátku malá, ke konci životnosti velká (Martin): roční potřeba na konci životnosti
  × (věk / životnost)². S delší životností zemnice (18 let místo 15) se křivka sama roztáhla:
  na konci života dál 15 člověkodní ročně a za celý život 90 místo 75.
- **Chátrá jen prázdné obydlí** (Martin, 18. 10. 2026: „obydlená budova nechátrá – obyvatelé ji
  opravují. Chátrá jenom prázdná.“): obydlené obydlí stav neztrácí. Prázdné se neopravuje – stav
  ubývá o celou potřebu oprav podle stáří a navíc pevným dílem stavu – zemnice ≈ 5 let,
  polozemnice ≈ 8 let (viz Nové obydlí – Prázdné obydlí chátrá rychleji).
- Opravy obydleného domu jdou z práce vsi hned po polních pracích ([fields.md](fields.md)), takže
  stárnoucí domy ubírají společnou práci vsi. Když na opravy práce nestačí, zbytek se prostě
  neudělá – stav domu to nesníží a nic se neodkládá na později (návrh Clauda; dřív stav klesal
  o nedodělek a dům se pak přestavoval dřív).
- Ke konci životnosti stojí opravy obydlí zhruba polovinu toho, co jeho domácnost přidá do
  společné práce vsi (návrh Clauda) –
  stárnoucí domy citelně ubírají vsi práci.
- **Přestavba:** když se opravy přestanou vyplácet – obydlí dožije (životnost), obyvatelé se
  **sami** rozhodnou dům zbourat a na stejném místě postavit nový (Martin). Rozhoduje jen stáří –
  obydlený dům na nulu nespadne. Hráč o tom nerozhoduje.
- Obyvatelé staví **vždy lepší** obydlí než dosud (zemnice → polozemnice), pokud na to ves má
  suroviny – jinak stejné (Martin). „Má na to“: **roční průměr** denní společné práce vsi stačí,
  aby stavba skončila do jednoho roku (návrh Clauda), a **dřevo** – klády na hromadě a dospělé
  stromy, které jde skácet – pokryje stromy lepšího obydlí. Roční průměr je klouzavý
  (exponenciální, časová konstanta jeden rok), vede se den po dni; starší ves začne průměrem
  posledních 30 dní. Oprava podle hlášení Martina 18. 10. 2026: dřív se rozhodovalo podle
  posledních 30 dní, takže v zimě (výmlat) nebo o žních vypadala ves chudá a nejstarší zemnice se
  přestavěla zase na zemnici, i když ves měla v průměru přes 6 člověkodní společné práce denně.
  Typ úplně nové stavby vybírá hráč.
- Během přestavby domácnost bydlí dál (stavba se abstrahuje, starý dům zmizí až s dokončením
  nového – návrh Clauda).
- **Po zániku – zbytek jámy** (Martin, 18. 10. 2026; podoba a čísla návrh Clauda): obydlí, které
  zchátrá na nulu (prázdné), nebo jehož domácnost se při přestavbě přestěhuje na nový pozemek
  (starý dům se zboří), nechá na svém místě zarostlou prohlubeň s kopřivami a pár trámy. Ta
  **≈ 10 let** postupně zarůstá – prohlubeň se zasypává, trámy hnijí, valy se srovnají – a pak
  zmizí. Je to jen vzhled: na místo zříceniny jde stavět a stavba (obydlí, pole, hřbitov, sad,
  ohrada, modla, svatyně – i přestavba na novém pozemku) zbytek jámy odstraní. Vsi uložené dřív žádné
  zbytky jam nemají.

### Kronika

- Ves vede kroniku událostí s herním datem: narození, úmrtí (dítě / dospělý / starší, hladem
  zvlášť), založení domácnosti, svatba ve vsi (vdova, ženich se přiženil), nevěsta a ženich
  z okolí, dcera vdaná pryč, dokončení stavby,
  rozhodnutí obyvatel o přestavbě a vymření vsi.
  Po návratu ji hráč otevře sám panelem Kronika (kniha v liště).
- Kronika drží **posledních 500 událostí**, starší se zahazují (návrh Clauda – stav vsi za
  1000 let jinak roste bez konce; simulace kroniku nečte, takže na průběh vsi to nemá vliv).

## Zjednodušení do dalších mechanik

- **Dřevo:** dokud nebude navržená těžba (les, kácení), dřevo se neeviduje – kácení a dovoz
  jsou zahrnuté v ceně stavby v člověkodnech (návrh Clauda; Martin chtěl dřevo ze společných
  zásob, přijde s mechanikou lesa).
- **Jídlo a práce na obživu** řeší [fields.md](fields.md) (nasycení ze zásob obilí, práce za
  celou ves).
- **Voda:** zatím bez vlivu.

## Kalibrace

Čísla výše jsou výchozí. Jako u generátoru krajiny vznikne měřicí skript, který nasimuluje
stovky vsí a ověří cíle:

- první plná domácnost (= první lidé k osídlení, tedy první možnost stavět obydlí; pole jdou
  kdykoli; od 18. 10. 2026 i dospělé děti z přeplněné domácnosti – skript měří první kladné lidé
  k osídlení, měření s tím zatím neproběhlo) přijde u 90 % vsí do **≈ 8 herních let** (≈ 3
  skutečné dny) – Martin:
  „zkusíme to“; hrubá simulace s hájením: medián 3 roky, 90 % do 7, 99 % do 20,
- čerstvě plná domácnost postaví zemnici zhruba za roční období, polozemnici za herní rok,
- zemnice se přestavuje typicky po ≈ 18 letech (do opravy podle rešerše ≈ 15), polozemnice po
  ≈ 20–25; ke konci životnosti stojí opravy zhruba polovinu toho, co domácnost přidá do
  společné práce,
- ves, kde hráč staví, kdykoli může, vymře do roku 1500 jen výjimečně (hrubá simulace: 0,6 %);
  za pár dní nepřítomnosti se nic takového nestane (anti-cíl). Jak často vymře jediná
  domácnost bez nových staveb, je jen informace, ne cíl (hrubá simulace ≈ 90 % do 1000 let,
  měření níže).

**Naměřeno** (`packages/game/scripts/measure-village.ts 200 60`, 17. 10. 2026 po opravě podle
rešerše – úmrtnost 2 %, porody od 16 let, zemnice 18 let a opravy polí z [fields.md](fields.md);
v závorce měření před opravou; vymření 30 vsí × 1000 let je ještě ze starších měření):

- první možnost stavět: medián 4,6 roku (3,9), 90 % vsí do 8,9 roku (7,8), 99 % do 38 let
  (38) – **MIMO** (cíl ≈ 8 let): dospívající ze startu mají děti až od 16 let (dřív tvořili pár
  už ve 14) a ves víc hladoví, takže porody jsou řidší,
- čerstvě plná domácnost postaví zemnici za ≈ 156 dní (77), polozemnici za ≈ 592 dní (295) –
  **MIMO**: společnou práci si bere i zakládání polí, které je dražší (louka 100 místo 40
  člověkodní na hektar) a pole musí být větší (≈ 5,3× osevu místo 3,3×),
- zemnice se přestavuje po 18 letech (15), polozemnice po 22; dřív zchátrá 3,7 % zemnic (0,8 %)
  – splněno,
- opravy na konci životnosti: kalibrace je snížila na 15 (zemnice) a 17 (polozemnice)
  člověkodní ročně z 35 a 40 (s 35 zemnice chátrala na nulu už po ≈ 12 letech – ve špičkách
  polních prací na opravy nezbývá práce). Domácnost má od 10. roku vsi ≈ 51 člověkodní
  společné práce ročně (46), takže opravy jsou jen ≈ 0,30 a 0,34 (0,33 a 0,37) – cíl ≈ ½
  **zatím ne**; návrh: opravy na konci životnosti zemnice ≈ 25, polozemnice ≈ 28 člověkodní
  (čeká na schválení a nové měření),
- ves, kde hráč staví, kdykoli může, má po 60 letech medián 3 domácnosti a 15 lidí (6 a 31);
  za 60 let nevymřela žádná z 200,
- jediná domácnost bez nových staveb: za 60 let vymře 0,5 % (0,5 %), žijící mají medián 7 lidí
  (9),
- vymření do roku 1500 (starší měření, před finální revizí a před opravou podle rešerše): ves,
  kde hráč staví, kdykoli může, nevymřela žádná (0 z 30; na konci medián 33 domácností a 142
  lidí – když dojde půda, hlad drží ves u toho, co pole uživí). Cíl ≤ 1 % to ale
  **nepotvrzuje**: při 0 z 30 je 95% horní mez podílu vymřelých vsí ≈ 10 % (pravidlo tří:
  3 / n) – potvrdit ≤ 1 % by chtělo ≈ 300 vsí × 1000 let; skript proto u vymření vypisuje
  i velikost vzorku,
- jediná domácnost bez nových staveb (jen informace, starší měření): do 1000 let vymře ≈ 33 %
  (10 z 30, medián po ≈ 530 letech) – přestavba na polozemnici jí dá 8 míst a domácnost kolem
  8–9 lidí je odolná.

**Po zavedení hladovění** (18. 10. 2026, `measure-village.ts 200 60`, bez ladění čísel; původní
pravidla → první verze hladu (1 − nasycení za den, hájení bez stropu) → dnešní):

- bez jídla ze sytosti (syntetické vsi po hájení, 6–150 lidí): polovina mrtvá za ≈ 34 dní,
  poslední dospělý nejpozději 57. den, poslední dítě nebo starší 43. den; poloviční příděl:
  přežije ≈ 45 % lidí, úmrtí hladem od ≈ 6. do ≈ 13. týdne,
- první možnost stavět: p90 7,8 → 9,3 → 7,8 let (medián 3,9 → 4,3 → 3,9, p99 38 → přes 60 → 38)
  – mírný nedostatek už startovní děti nezabíjí, cíl ≈ 8 let zase splněn,
- vymření jediné domácnosti bez staveb do 60 let: 0,5 % → 6,5 % → 5,5 % (příčina neověřená –
  nejspíš chybí ochrana posledních dvou dospělých),
- ves, kde hráč staví: vymření 0 z 200 ve všech třech; na konci domácností medián 6 → 4 → 5,
  lidí 30 → 23 → 28; nasycení ≥ 0,95 celý rok 93,8 → 95,0 → 94,1 % let,
- zbytek (stavby, přestavby, pole, oběh, sad) beze změny,
- „dnešní“ čísla jsou ještě s pásmem 90–95 %, kde hlad nepřibýval ani neubýval (příděl
  ustálený po vlně úmrtí v tom pásmu nechal hlad nad prahem dětí a starších a ty měsíce pomalu
  umíraly). Pásmo je pryč – hlad se od 90 % zotavuje; celé měření se po tom už neopakovalo.

**Naměřeno 19. 10. 2026 – růst obyvatelstva** (Martin: „aby se populace co nejvíce
rozrůstala“; vdovy, ženich z okolí, porody podle věku s rozestupem a odchod ženatého páru
i z neplného domu – [kinship.md](kinship.md), [rešerše](research/2026-10-19-population-growth.md)).
`measure-village.ts 20 60` a `20 20` (20 vsí – přes den jen malý vzorek; `100 100` zbývá na noc),
před → po:

- **ves, kde hráč staví:** lidí po 20 letech medián 12 → 13, po 40 letech 17 → 23, po 60 letech
  25 → 40 (p10 7 → 29, p90 35 → 52), domácností po 60 letech 5 → 8; vymření 1 → 0 z 20; porodů za
  60 let na ves 40 → 60, úmrtí dětí 13 → 18, dospělých 7 → 9, starších 5 → 7, hladem 0,2 → 0,6,
- **jediná domácnost bez staveb:** vymření 4 → 0 z 20, lidí po 60 letech 8 → 10, porodů 18 → 24,
- **sňatky na ves za 60 let (hráč staví):** ve vsi 4,4 → 7,5, nevěsty z okolí 7,3 → 7,0, ženichové
  z okolí 0 → 4,5, ženy vdané pryč 4,3 → 2,7,
- **vdovy 16–44:** znovu se vdalo 32 → 89 %, doba do sňatku medián 2,2 → 0,1 roku (p90 11 → 2,4);
  vdovci 16–59: 90 → 88 %, medián 1,2 → 0,9 roku,
- **pohlaví:** dospělých mužů na 100 žen 80 → 96 (ženy už tolik neodcházejí, vdovy se vdávají),
- **nasycení** ≥ 0,95 celý rok 97,1 → 98,7 % let (OK), nasycení se stravou medián 0,94 beze změny,
- **první možnost stavět:** medián 5,3 → 4,0 roku, p90 9,1 → 4,0 (teď OK – pár zakladatelských
  dětí smí odejít z neplného domu); zemnice čerstvě plnou domácností 199 → 160 dní (MIMO, v 20 × 20
  109 – OK), polozemnice 729 → 626 dní (MIMO),
- **stěhování tam a zpět:** jedna ves ze 20 měla už před změnou 499 rozpadů domácností za 60 let
  (starší pár se stěhoval do prázdného domu, rozpadl se a vrátil); po změně to dělalo 5 vsí,
  oprava – rodina i svobodný muž odejdou, jen když nový dům udrží (někdo 16–44) – po ní nejvýš
  5 rozpadů na ves.

**Žně všemi rukama a osev navíc v oběhu (24. 10. 2026,** [pole](fields.md) **– Žně všemi rukama,
Osev navíc; návrh Clauda, Martin schválil):** zralý Vlkov (47,9 ha, 31 lidí) za 10 let 31 → 5
lidí → 31 → 11, sklizeň za 10 let 17,5 → 24,8 t, osetá plocha průměrně 6,3 → 9,8 ha; úmrtí hladem
dál ≈ 25 (přílohy už pod 70 %, osev navíc v oběhu vyčerpanou ves nezachrání – brání jen dalšímu
vyčerpání). Čerstvé vsi `measure-village.ts 8 30` beze změny: 8/8 roste, lidí po 20 letech medián
13, po 30 letech 20,5, hladem 0.

Ověření na noc (dlouhá kalibrace jen v noci):

```bash
npx tsx packages/game/scripts/measure-village.ts 100 100 --out night-100x100.jsonl
npx tsx packages/game/scripts/measure-village.ts 100 100 --out night-100x100.jsonl --report-only
```

Sledovat: kolik vsí roste bez zásahu hráče, lidé po 20, 30, 60 a 100 letech, úmrtí hladem a vlny
hladu po ≈ 6 letech, osetá plocha ÷ pole a zásoby ÷ potřeba po 20. roce.

## Co hráč vidí

- V krajině: umístění první zemnice a dalších obydlí, rozestavěné stavby. **Modely obydlí jsou
  vlastní** (procedurálně v Blenderu s texturami z 0 A.D. – 0 A.D. slovanská obydlí nemá):
  zemnice i polozemnice mají **omazané stěny a střechu ze slámových došků** (Martin), na
  hřebeni jen nízké převázání bez „bakule“, aby byla vidět **zkřížená štítová prkna („kozy“)**;
  **před vchodem vyšlapaná hlína**, která měkce přechází do okolní trávy, a **podél okapu, kde se
  střecha dotýká země, hustší trsy trávy** – stéká tam víc vody (Martin). **Zemnice je opravdu
  jáma v zemi** (terén se pod ní otevře, vchod sestupuje do jámy), polozemnice mělčí; **stavba má
  víc fází** (vytyčení, sejmutí drnu, kopání jámy, sloupy, krokve, stěny, mazanice, došky, kozy
  a dýmník); ze zemnic **občas stoupá dým**; střecha je **předsazená vepředu i vzadu**, aby zakryla
  vchod svažující se do jámy (Martin). **Vedle obydlí není vyskládaná hráň polen** – tak
  vyskládané dřevo tehdy lidé neměli, navíc na dešti (Martin). **Polozemnice stojí na
  oploceném pozemku** (Martin, 18. 10. 2026): celé políčko obehnané polským plotem – řidší kůly
  s vodorovně proplétanými větvemi (střídavě před a za kůlem), **rohy zakulacené** (v polském
  plotu se hranaté rohy dělají špatně – platí pro každý pletený plot ve hře, i pro plot hřbitova,
  který je týž plot, jen hustší), branka proti vchodu
  a od ní cestička ke dveřím; ve zbytku pozemku vyvýšené záhony – zelí, řepa, cibule a kopr.
  Dům uprostřed nebo v rohu (5 variant). Po domě se staví plot (nejdřív kůly, pak se proplétají
  větve) a nakonec záhony; při zadání stavby je vytyčený kolíky a provázkem celý pozemek.
  Vybraná polozemnice označí celý pozemek, ne jen stavbu (Martin). Slepice zůstávají uvnitř
  plotu, cizí zvířata ani lidé do pozemku nechodí. Stavby
  z módu Millennium A.D. (ruské sruby, severské domy) se nepoužijí – jiná doba či region
  a nejistá licence (Martin); nanejvýš jako předloha tvarů pro pozdější roubené chalupy.
- **Dům se viditelně rozpadá** (Martin, 18. 10. 2026: „domy by měly mít různé stavy destrukce –
  jako se nový dům postupně staví, tak starý a opuštěný dům se musí postupně rozpadat“; stupně
  a podoba návrh Clauda). Rozpadá se jen **prázdné** obydlí podle svého stavu – obydlené je vždy
  celé (Martin: „obydlená budova nechátrá – obyvatelé ji opravují“), i znovu osídlený zchátralý
  dům (návrh Clauda):
  1. **100–70 %** – celý dům (bez dýmu, vchod zarůstá).
  2. **70–45 % – sešlý:** došky prořídlé a vybledlé, místy díry, mech a tráva na střeše, omítka
     místy opadaná (vidět výplet, u polozemnice trámy srubu).
  3. **45–20 % – propadá se:** část došků pryč, vidět latě a krokve, hřeben prověšený a nakřivo;
     u polozemnice padá i plot pozemku (chybí větve, kůly nakřivo) a záhony zarůstají plevelem,
     kolem domu kopřivy.
  4. **20–0 % – zřícený:** střecha spadlá do jámy, trčí krokve a sloupy, stěny rozpadlé (ze štítů
     zemnice nízké pahýly, ze srubu polozemnice spodní řady trámů); z plotu zbyly pahýly, záhony
     zarostlé.
  5. **Po zániku – zbytek jámy:** zarostlá prohlubeň s kopřivami, pár trámy a nízkým zarostlým
     valem po okraji, ≈ 10 let postupně zarůstá a pak zmizí (Chátrání a přestavba – Po zániku).

  Řemeslné dílny (hrnčíř, kovář, uhlíř) zatím zůstávají celé – jejich díly rozpadu přijdou
  později (stojí na tvarech obydlí, ale přístřešek, pec, výheň a milíř potřebují vlastní).
  Kronika ani upozornění kvůli rozpadu nic nového nehlásí.

- Rozhraní jako v 0 A.D. (Martin, 17. 10. 2026: „Ovládací prvky a layout udělej jako u 0AD.
  Odstraň všechny popisky – hráč nepotřebuje průvodce. Nevoď hráče za ručičku.“): horní lišta
  se jménem vsi a ikonami s čísly (lidé, obilí, volná práce – práce, která ves dnes zbude na
  stavby, ne průměr; Martin 19. 10. 2026 –, nasycení, datum), minimapa, panel
  vybraného obydlí (obyvatelé s věkem, stav, stáří, průběh stavby) a mřížka staveb. Žádný
  průvodce ani nápovědy.
- Krátké mizející upozornění, že rodina čeká na dům, že ves šetří jídlem, hladoví a že lidé
  umírají hlady (jen nejvyšší stupeň – Hlad a vymření), že byla svatba a že přišla nevěsta či
  ženich z okolí (fakt, ne rada).
- Obrazovka porážky, když hráči vymřou všechny vsi (Hlad a vymření).
- **Panel Kronika** (implementováno, návrh Clauda – Martin 8. 11. 2026: „může si přece sám
  zobrazit panel s notifikacemi a kroniku“, [nepřítomnost](absence.md)): kniha v liště otevře
  zápisy kroniky zobrazené vsi od nejnovějších, po herních letech, starší roky po stránkách.

## Navazuje

- **Jídlo a pole** – [fields.md](fields.md): společná pole, sklizeň podle ročních období,
  zásoby, nasycení a práce na obživu.
- **Les a dřevo**, veřejné projekty (opevnění), rod hráče a sňatky.

## Na stavitelovi

- Přesné vzorce porodů, úmrtí, chátrání a oprav – tak, aby splnily cíle v Kalibraci.
- Krok simulace (den, měsíc) a jak se ves dopočítá, když nikdo není online. Svět běží
  nepřetržitě; než vznikne `apps/worker`, může se ves dopočítat při načtení. Výsledek nesmí
  záviset na tom, kdy se dopočítává.
- Datový model, podoba panelu a kroniky.

## Rozhodnutí

| Rozhodnutí                                                                            | Kdo                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------ |
| Ves jako zásobárna aktiv: jídlo, voda, dřevo a hlavně lidé / člověkohodiny            | Martin                                     |
| Start: 4 lidé v jedné zemnici, hráč vybere místo                                      | Martin                                     |
| První zemnici si osadníci postaví sami, průběh stavby je vidět                        | Martin (17. 10. 2026)                      |
| Dost jídla → populace roste; cílem je efektivní výroba jídla                          | Martin                                     |
| Obydlí zatím zemnice a polozemnice                                                    | Martin                                     |
| Obydlí se umisťuje volně (půdorys) na dost rovné zemi; překážky a les zdraží          | Martin                                     |
| Pole jsou samostatná a společná pro celou ves                                         | Martin                                     |
| Vlastní modely obydlí: omazané stěny, slámové došky; Millennium A.D. ne               | Martin                                     |
| Nová obydlí vždy staví hráč; plná domácnost → nová domácnost v novém obydlí           | Martin                                     |
| Hráč staví kdy chce (bez odemčení plnou domácností), ves zakládá zemnicí              | Martin (17. 10. 2026)                      |
| Odemčení surovinami předem – bez nich je tlačítko stavby zašedlé                      | Martin (17. 10. 2026)                      |
| ~~Obydlí jen, když je kým ho osadit~~; od 8. 11. 2026 i bez lidí k osídlení (i dílny) | Martin (17. 10., zrušeno 8. 11. 2026)      |
| Obydlí chátrají, opravy rostou; přestavbu (i na lepší) rozhodují obyvatelé            | Martin                                     |
| Bez staveb ves přestane růst, ale nerozpadne se (hlad ji ale zabít může)              | návrh Clauda, Martin potvrdil              |
| Přestavba vždy na lepší obydlí, pokud jsou suroviny; typ nové stavby hráč             | Martin                                     |
| „Má na to“ podle ročního průměru společné práce a dřeva (ne posledních 30 dní)        | Martin – hlášení chyby 18. 10. 2026        |
| Hájení: prvních 30 herních let vsi přeje štěstí; žádní příchozí z okolí               | Martin                                     |
| Lidé umírají hlady, ves může vymřít; bez vsí hráč začíná znovu                        | Martin (18. 10. 2026)                      |
| Nahromaděný hlad, prahy 20 / 12 dní, smrt bez jídla do 60 / 45 dní                    | návrh Clauda                               |
| Hlad přibývá pod 90 % přídělu, od 90 % ubývá; v hájení den pod prahem                 | návrh Clauda                               |
| Restart: staré sídlo do archivu, nové sídelní sídlo s novou krajinou                  | návrh Clauda                               |
| Začít znovu jde i se živou vsí – z nabídky hry (F10), po potvrzení                    | Martin (18. 10. 2026)                      |
| Podoba hájení: dospělí neumírají, poloviční dětská úmrtnost                           | návrh Clauda                               |
| Kapacity 6 / 8, ceny 60 / 220 člověkodní (roční období / rok), životnosti             | návrh Clauda                               |
| Porodnost, úmrtnost, opravy až polovina příspěvku domácnosti                          | návrh Clauda                               |
| Dospělí umírají 2 % ročně (dřív 1,5 %)                                                | Martin – oprava podle rešerše 17. 10. 2026 |
| Porody od 16 let; dospělý pro práci, odemčení a domácnost zůstává 14–44               | Martin – oprava podle rešerše 17. 10. 2026 |
| Životnost zemnice ≈ 18 let (dřív ≈ 15); opravy na konci dál 15 čd ročně               | Martin – oprava podle rešerše 17. 10. 2026 |
| Startovní dospívající 12 a 13 let zůstávají                                           | Martin (17. 10. 2026)                      |
| ~~Stěhuje se pár z plné domácnosti se 4 dospělými; dva nejmladší~~                    | návrh Clauda                               |
| Rozpad domácnosti, prázdná obydlí čekají na plnou domácnost                           | návrh Clauda                               |
| Přeplněná domácnost s dospělými dětmi osídlí úplně prázdné obydlí                     | Martin (18. 10. 2026)                      |
| ~~Dospělé děti = 14–44 kromě dvou nejstarších od 14; všechny, nejvýš kapacita~~       | návrh Clauda                               |
| ~~Aspoň dva (jednotlivci z různých domácností spolu)~~; zbytek se nesmí rozpadnout    | návrh Clauda                               |
| ~~Nejdřív mladý pár, pak dospělé děti~~; lidé k osídlení počítají obojí               | návrh Clauda                               |
| U neplodných rodičů (oba 45+) zůstává nejstarší dospělé dítě doma jako dědic          | Martin (18. 10. 2026)                      |
| Sňatky mezi domy – svobodní 16–44 ze dvou domů se vezmou                              | Martin (18. 10. 2026)                      |
| ~~Stěhuje se, komu se dům nerozpadne; jinak do víc míst, mladší; na volné místo~~     | návrh Clauda                               |
| ~~Svobodní od nejstaršího, protějšek další v pořadí~~; denně v kroku 6                | návrh Clauda                               |
| Nejstarší dítě z přeplněného domu smí odejít do nového domu samo                      | Martin (18. 10. 2026)                      |
| Prázdný (i nový) dům obsadí i plná domácnost – svobodný syn i z plného domu           | Martin (18. 10. 2026)                      |
| ~~Novou domácnost (i lidi k osídlení) dává jen plná nebo přeplněná domácnost~~        | návrh Clauda (podle Martinových pravidel)  |
| Samo jen od 16 let, až po párech; osamělý 16–44 se nerozpadá (svobodný)               | návrh Clauda                               |
| ~~Svatba nikdy nepřeplní dům~~ – s rodinami do plného domu smí (kinship.md)           | návrh Clauda                               |
| Příbuzenství a pohlaví – rodiny, sňatky ve vsi a s okolím ([kinship.md](kinship.md))  | Martin (18. 10. 2026)                      |
| Novou domácnost zakládá ženatý syn, nejstarší dědí, svobodný nejstarší syn smí sám    | návrh Clauda, Martin schválil              |
| Rozpad k příbuzným (syn, dcera, sourozenec); domácnost drží člověk 16–44              | návrh Clauda                               |
| Neobydlené budovy chátrají rychleji                                                   | Martin (18. 10. 2026)                      |
| Prázdná zemnice zanikne za ≈ 5 let, polozemnice za ≈ 8 let (úbytek navíc)             | návrh Clauda                               |
| Obyvatelé bez jmen (~~a pohlaví~~), náhoda ze seedu, kronika                          | návrh Clauda                               |
| Dřevo zatím v ceně práce                                                              | návrh Clauda (dočasné)                     |
| Polozemnice na pozemku = políčko pole s polským plotem, dům uprostřed / v rohu        | Martin, 18. 10. 2026                       |
| Rohy polského plotu zakulacené; výběr polozemnice označí celý pozemek                 | Martin, 18. 10. 2026                       |
| Starší polozemnice dostanou pozemek při načtení, jinak při přestavbě do 50 m          | Martin, 18. 10. 2026                       |
| Vchod k brance vpředu, [ a ] přepínají variantu, rovno jen pod domem                  | návrh Clauda                               |
| Obydlí jde stavět na pole a do sadu – pole a sad se zmenší o plochu domu              | Martin, 18. 10. 2026                       |
| Pozemek bere celý čtverec, obydlí bez pozemku průnik vyklízené plochy                 | návrh Clauda                               |
| Díl či čtverec pod 20 % políčka zmizí; zbytek pole či sadu se nedělí                  | návrh Clauda                               |
| Úroda, práce a založení úměrně ploše; plocha se po zániku domu nevrací                | návrh Clauda                               |
| Přestavba obyvatel si pozemek na poli ani v sadu nevezme; hřbitov dál ne              | návrh Clauda                               |
| Dům se viditelně rozpadá, jako se staví – stupně podle stavu prázdného domu           | Martin, 18. 10. 2026                       |
| Obydlený dům nechátrá (obyvatelé ho opravují), chátrá jen prázdný                     | Martin, 18. 10. 2026                       |
| Nedodělek oprav obydleného domu se neodkládá; znovu osídlený dům ukázat celý          | návrh Clauda                               |
| Stupně 70 / 45 / 20 %, jejich podoba; plot a záhony od propadající se střechy         | návrh Clauda                               |
| Zbytek jámy po zaniklém obydlí ≈ 10 let zarůstá; stavba přes něj ho odstraní          | návrh Clauda                               |
| Vdova se vdává co nejdřív, nejlépe ve vsi; populace má co nejvíc růst                 | Martin (19. 10. 2026)                      |
| Ženatý pár, který dům nedrží, smí odejít do nového domu kdykoli                       | Martin (19. 10. 2026), návrh Clauda        |
| Porody podle věku ženy (přirozená plodnost × 0,85), rozestup 21 / 9 měsíců            | návrh Clauda (19. 10. 2026)                |
| Ženich z okolí (k vdově 50 % ročně), pryč 20 %; „Rodina čeká na dům“                  | návrh Clauda (19. 10. 2026)                |
| Obydlí (i ostatní stavby) smí do lesa – les se vyklučí                                | Martin, 19. 10. 2026                       |
| Les pod stavbou za sazbu lesa jako díl pole, pařezy v ní; v lese i pruh 4 m           | návrh Clauda                               |
| Obyvatelé sami les nevyklučí; stavba na poli v lese za les neplatí                    | návrh Clauda                               |
| Upozornění na hlad ve stupních: šetří jídlem (90–100 %), hladoví (pod 90 %), umírají  | Martin (19. 10. 2026)                      |
| Jen nejvyšší stupeň, ohlásí se při zhoršení; „šetří jídlem“ mírně jako zpráva         | návrh Clauda                               |
| Práce: stavby mají přednost před polem navíc; opravy obydlí až po stavbách            | Martin, 19. 10. 2026                       |
| Zvířata (dojení, péče – ženy; pasení – výrostci) a domácí výroba bokem, mimo práci    | Martin, 19. 10. 2026                       |
| Výrostci 7–13 let jen pasou, mimo práci vsi; jejich počet omezuje stáda               | Martin, 19. 10. 2026 (mimo práci – Claude) |
| Starší jen na denní minimum své domácnosti (0,5 čd), přebytek propadne                | návrh Clauda                               |
| Pro vodu se chodí vždy k nejbližší vodě a chůze se počítá do práce                    | Martin, 19. 10. 2026                       |
| Přirážka minima za vodu nad 100 m chůze: 0,4 cesty na člověka, 1 m/s, den 10 h        | návrh Clauda                               |
| Branka ani vchod nového obydlí nesmí vést do cizího pozemku („Ano, zakaž to“)         | Martin, 19. 10. 2026                       |
| Branku blokuje obydlí, modla, svatyně, hřbitov, ohrada, voda; stavba ji nezataraší    | návrh Clauda                               |
| Varianty rozměrů obydlí a dílen (plocha, poměr stěn, výška ±10 %)                     | Martin, GitHub #1                          |
