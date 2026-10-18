# Obyvatelstvo a obydlí vesnice

Stav: schváleno 17. 10. 2026 (Martin: „asi ok, doladíme později“), týž den upraveno umístění
obydlí a společná pole (Martin) a odemčení nového obydlí – hráč staví, kdy chce (Martin). Týž den
oprava čísel podle rešerše (Martin – úmrtnost dospělých, porody od 16 let, životnost zemnice;
[rešerše](research/2026-10-17-zemedelstvi-populace.md)). 18. 10. 2026 Martin změnil pravidlo
hladu: lidé umírají hlady a ves může vymřít; komu vymřou všechny vsi, ten začíná znovu (viz Hlad
a vymření). Týž den: začít znovu jde i sám z nabídky hry (Martin) a dospělé děti z přeplněné
domácnosti osídlí úplně prázdné obydlí (Martin, detaily návrh Clauda – viz Nové obydlí)
a neobydlené budovy chátrají rychleji (Martin, čísla návrh Clauda) a svobodní z různých domů se
berou (Martin, detaily návrh Clauda – viz Sňatky mezi domy).
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
- **Anti-cíl:** čísla typu „4,37 člověka“ – lidé jsou celí.

## Pojmy

- **Ves** – jedno sídlo hráče; drží společné zásoby (zatím práci, později jídlo, vodu, dřevo).
- **Obyvatel** – jednotlivec s datem narození (bez jména a pohlaví – návrh Clauda). Věkové
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

## Pravidla

### Založení vsi

- Hráč v krajině svého sídla umístí půdorys první zemnice (viz Umístění obydlí) – tím ves
  založí. Přijdou **4 lidé**: dva dospělí (kolem 25 let) a dva dospívající (12 a 13 let – návrh
  Clauda, aby první nová domácnost mohla vzniknout do pár let; zůstávají i s porody od 16 let –
  Martin). Ves dostane navržené staročeské jméno, které hráč může kdykoli změnit.
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
- Obydlí nesmí stát ve vodě ani se překrývat s jiným obydlím nebo polem (návrh Clauda).
- **Polozemnice stojí na pozemku velkém jako jedno políčko pole** (Martin, 18. 10. 2026):
  15 × 15 m v mřížce políček jako čtverec pole, celý obehnaný polským plotem. Dům stojí
  **uprostřed, nebo v jednom ze čtyř rohů** – 5 variant jednoho stavení (Martin); hráč je při
  umisťování přepíná klávesami [ a ] (místo otáčení), vchod míří vždy k brance na přední straně
  pozemku (návrh Clauda). Pozemek musí být volná louka – ne voda, zatím ani les, bez skalního
  výchozu, bez posvátného dubu a čtverce dubového háje (dům ani pod korunou dubu ze sousedství –
  jako u obydlí, [happiness.md](happiness.md)), nezabraný polem, hřbitovem, sadem ani jiným
  obydlím či pozemkem; rovná zem
  (≤ 0,5 m) se hlídá jen pod domem. Překážky na pozemku platí jako na čtverci pole (všechny kusy
  na políčku), dospělé stromy z něj dají klády (návrh Clauda). Zemnice pozemek nemá a staví se
  volně.
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
  místě dál bez pozemku. Totéž platí pro zemnici přestavovanou na polozemnici.
- **Překážky** na místě, např. kameny, osadníci odstraní, ale stavba stojí víc člověkodní
  (Martin). Totéž **v lese** – stromy je třeba skácet a vykopat pařezy. Ceny překážek a mýcení
  jsou jedna tabulka pro celou hru ve [fields.md](fields.md) (návrh Clauda). Kontrola umístění
  cenu spočítá už při umisťování a rozhraní ji ukáže u kurzoru ikonami s čísly: práce celkem
  (stavba, překážky a kácení dřeva, které nedá hromada klád) a počet stromů ke kácení; když
  obydlí na místo nejde, místo ceny krátký červený důvod (fields.md – Co hráč vidí).
- Odstraněné kameny a stromy z krajiny sídla zmizí natrvalo – krajina sídla je vygenerovaná
  krajina plus změny, které v ní udělali lidé (návrh Clauda).

### Práce

- Pracovní síla za den: dospělý 1 člověkoden, starší 0,5, dítě 7–13 let 0,3, mladší 0
  (návrh Clauda).
- Pole jsou společná, a proto se práce počítá **za celou ves** – dospělí všech domácností
  pracují pro ves. Pořadí (denní minimum domácností, polní práce, opravy obydlí, domácí výroba,
  zbytek **společná práce vsi**) popisuje [fields.md](fields.md).
- Společná práce se nedá schovat na později – každý den jde do rozestavěných staveb (stavby
  hráče i přestavby obyvatel, rovným dílem), a když žádná není, propadne.

### Růst populace

- **Porody:** každý pár (dva lidé **16–44 let** v jedné domácnosti – svobodní z různých domů se
  vezmou, viz Sňatky mezi domy) má zhruba jedno dítě za
  3 roky (intervaly mezi porody 24–39 měsíců – Macfarlane 2002). Porody od 16 let jsou oprava
  podle rešerše (dřív od 14 – plodnost od 14 je optimistická); pro práci, odemčení nového obydlí
  a rozpad domácnosti je dospělý dál od 14. Hlad porody tlumí až zastaví, přeplněnost je
  výrazně sníží.
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
- **Rozpad domácnosti** (návrh Clauda): domácnost bez dospělého 14–44 let (jen děti nebo
  starší) a osamělý dospělý bez dětí se přestěhují do domácnosti s nejvíc volnými místy (smí
  ji i přeplnit) – jinak by domácnost, kde zbyl jeden dospělý, už nikdy neměla děti. Kronika
  to zapíše.
  Opuštěné obydlí se neopravuje a chátrá rychleji (zemnice ≈ 5 let, polozemnice ≈ 8 let – viz
  Nové obydlí); při stavu 0 zanikne a políčko se uvolní.

### Sňatky mezi domy

Martin, 18. 10. 2026: „Ano, přidej sňatky mezi domy“. Proč: porody potřebují pár v jednom domě.
Ve Vlkově (rok 612) žilo 10 lidí – polozemnice 63, 49, 27, 12, 10, 6 a zemnice 42, 19, 2, 1;
27letý a 19letý, každý v jiném domě, by se nikdy nedali dohromady, jediný pár (42 a 19) za pár let
skončí a ves vymírala (za 15 let 11 úmrtí a 6 porodů). Detaily jsou návrh Clauda.

- **Svobodný** je člověk 16–44 let, který je ve své domácnosti jediný takový – nemá v domě
  protějšek (obyvatelé nemají pohlaví, pár jsou dva lidé 16–44). Když jsou ve dvou různých
  domácnostech dva svobodní, **vezmou se**: jeden se přestěhuje k druhému a vznikne pár.
- **Kdo se stěhuje:** ten, jehož domácnost se odchodem nerozpadne (Rozpad domácnosti) – jinak by
  rozpad zbytek večer přestěhoval a rozpad vsi by se rozjel. Když by se nerozpadla ani jedna,
  stěhuje se do domu s víc volnými místy (kapacita − lidé), při shodě se stěhuje mladší. Když by
  se rozpadly obě, nestěhuje se nikdo – počkají.
- **Místo:** do přeplněného domu se nestěhuje; plný dům smí – po svatbě je o jednoho přes
  kapacitu. Bez svatby by pár nebyl vůbec; přeplněný dům pak řeší dospělé děti do prázdného
  obydlí a upozornění „Domácnost je plná“ (viz Nové obydlí).
- **Kdo s kým:** svobodní od nejstaršího – nejdřív ten, komu se plodný věk krátí – a každý si
  vezme dalšího svobodného v tomtéž pořadí (nejbližšího věkem mezi zbylými), se kterým svatba
  jde. Jeden sňatek na člověka denně; svatby se rozhodují každý den po obsazení prázdných obydlí
  (krok simulace 6), bez náhody, takže nezávisí na tom, po jakých kouscích se ves dopočítá.
- Kronika zapíše **svatbu** (z kterého domu do kterého), rozhraní ukáže krátký mizející řádek
  „Svatba“ (fakt, bez rady). Lidé k osídlení se nemění – svatba novou domácnost nezakládá.
- **S okolními vsemi** se lidé budou brát i odjinud (přivdat, přiženit) – zatím ne, až přijdou
  sousední vsi (ne-cíl, viz Cíle).

### Hlad a vymření

Martin, 18. 10. 2026: „Koukám do hry, jídlo došlo, nasycení 0 %, ale lidé si furt vesele žijí
místo aby zemřeli.“ Na návrh Clauda (nahromaděný hlad, smrt do ≈ 2 měsíců bez jídla, hájení
zůstává, ochrana posledních dvou dospělých padá): „Ano, když hráči vymřou všechny vesnice (časem
jich bude moci mít více), tak pro něj hra končí – musí začínat znovu.“ Čísla jsou návrh Clauda.

- **Hladem se umírá z energie, ne z pestrosti** ([strava](diet.md), od 18. 10. 2026): nahromaděný
  hlad i přirážka úmrtnosti za dnešní hlad počítají s pokrytím energie; nasycení se stravou
  (energie × pestrost) řídí porody a štěstí. Ves jen s obilím (80 %) se množí pomaleji, ale
  hladem neumírá.
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
  ≈ 15 % lidí. Porody se zastaví už při nasycení 0,5 (Růst populace).
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
- **Začít znovu z nabídky** (Martin, 18. 10. 2026: „Měl bych mít k dispozici menu, ve kterém
  bych mohl restartovat hru.“): nabídka hry jako v 0 A.D. (tlačítko vpravo v horní liště, F10)
  má **Začít znovu**, **Odhlásit** a **Zpět do hry**. Začít znovu jde i se živou vsí – po
  potvrzení v nabídce („Ves i rod zaniknou, začneš v nové krajině.“) jde sídlo i s živou vsí do
  archivu (ves se dál nedopočítává) a hráč dostane nové sídelní sídlo s novou krajinou jako po
  konci hry. Dokud ves není (zakládání), není co začínat znovu. Opakované i souběžné potvrzení
  založí jediné nové sídlo; o všem rozhoduje server (návrh Clauda).

### Nové obydlí (rozhoduje hráč)

- O každé nové stavbě rozhoduje hráč (Martin) – vybere typ a místo (viz Umístění obydlí).
- **Hráč staví kdy chce** (Martin, 17. 10. 2026: „Hráč sám rozhodne kdy a co bude stavět, jako
  v každé RTS.“) – kdy začne, rozhoduje hráč; brání mu jen to, co stavba potřebuje předem
  (suroviny, lidé k osídlení – viz níže). Rozestavěné stavby se dělí o společnou práci vsi
  rovným dílem, takže víc staveb najednou roste pomaleji.
- **Odemčení surovinami** (Martin, 17. 10. 2026: „Odemykání bude samozřejmě také – pokud nebudu
  mít suroviny na postavení stavby, bude její tlačítko v panelu disabled.“): stavba může mít
  kromě práce i **cenu předem** v surovinách ze zásob vsi; když je ves nemá, tlačítko stavby je
  zašedlé a v popisku je chybějící část červeně (jako v 0 A.D.). Dnes žádná stavba suroviny
  předem nestojí (práce se platí postupně) – mechanismus je připravený pro dřevo a kámen
  (`packages/game/src/domain/village/costs.ts`).
- **Lidé k osídlení** (Martin, 17. 10. 2026: „Také mi to nabízí stavbu obytných budov, i když je
  nemám kým osadit.“): obydlí (zemnice, polozemnice a později řemeslné dílny) jde začít, jen
  když je kým ho osadit. Je to další položka ceny předem ve stejném mechanismu jako suroviny,
  ne skryté pravidlo: **lidé k osídlení** = možné nové domácnosti – domácnosti, ze kterých se
  může oddělit mladý pár (plná domácnost se 4 dospělými 14–44, viz Po dokončení), a z ostatních
  přeplněných domácností každá s aspoň dvěma dospělými dětmi jedna a jednotlivá dospělá děti po
  dvou (zaokrouhleno dolů, viz Prázdné obydlí) –, minus prázdná obydlí, minus rozestavěná nová
  obydlí – každé už jednu domácnost čeká. Obydlí stojí jednu domácnost k osídlení;
  stavba ji jen zamluví, nikoho neodebírá. Když lidé k osídlení nejsou, tlačítko obydlí je
  zašedlé, nejde spustit ani zkratkou a v popisku jsou chybějící lidé k osídlení červeně (jako
  v 0 A.D., bez dalšího textu); server stavbu odmítne („Nové obydlí nemá kdo osídlit.“). Pole
  jdou vždy. První zemnici při založení vsi osídlí sami zakladatelé – před založením je vždy
  k dispozici.
- **Cena:** člověkodny ze společné práce vsi (dřevo viz Zjednodušení). Stavba roste den po dni
  podle toho, kolik společné práce přitéká; hráč vidí postup.
- **Po dokončení** se do nového obydlí přestěhují **dva nejmladší dospělí** z domácnosti, která
  je plná a má aspoň **4 dospělé** 14–44 let (z více takových z nejvíc přeplněné), a založí
  novou domácnost. Děti zůstávají (návrh Clauda). Starší se do čtyř dospělých nepočítají –
  kdyby odešli dva dospělí a zůstali jen starší s dětmi, domácnost by se rozpadla
  a přestěhovala za nimi. Když podmínku v tu chvíli nesplňuje žádná domácnost, osídlí obydlí
  ještě týž den dospělé děti z přeplněné domácnosti (viz Prázdné obydlí); když ani ty nejsou,
  zůstane **prázdné** – postavené „do zásoby“.
- **Prázdné obydlí** obsadí sama první domácnost, která podmínku splní – dva nejmladší dospělí
  se do něj přestěhují (návrh Clauda).
- **Dospělé děti z přeplněné domácnosti** (Martin, 18. 10. 2026: „pokud je ve vesnici nějaký dům
  přelidněný a je v něm ‚dospělé‘ dítě a zároveň je ve vesnici úplně prázdný dům, ať do něj tyhle
  dospělé děti odejdou a osídlí ho“): když po předchozím pravidle zůstane obydlí **úplně prázdné**
  (nikdo v něm nebydlí), osídlí ho dospělé děti z **přeplněné** domácnosti (lidí víc než míst).
  Přeplněná domácnost se 4 dospělými 14–44 splňuje už předchozí pravidlo – nové pomáhá hlavně
  domácnostem se staršími rodiči, s jedním rodičem nebo se třemi dospělými. Detaily (návrh
  Clauda):
  - **Dospělé děti** jsou lidé 14–44 let kromě **dvou nejstarších lidí domácnosti od 14 let
    výš** – rodičů či hlavy domácnosti (počítají se i starší nad 44; obyvatelé nemají rodičovské
    vazby ani pohlaví). Odejdou všechny dospělé děti domácnosti, nejvýš kolik má obydlí míst (při
    přebytku zůstanou nejstarší z nich); rodiče a děti pod 14 zůstanou.
  - **Dědic u neplodných rodičů** (Martin, 18. 10. 2026: „Pokud už jsou rodiče neplodní, tak ano,
    má“): když jsou oba rodiče (dva nejstarší lidé domácnosti od 14 let) už mimo plodný věk
    (45+), **nejstarší dospělé dítě zůstane doma** jako dědic a odejdou jen ostatní – podle
    pravidel níže (aspoň dva, jinak s protějškem z jiné domácnosti). Rodiče 50 a 47 se dvěma
    dospělými dětmi tak nikoho nepošlou (mladší čeká na protějšek), se třemi odejdou dva mladší.
    S aspoň jedním plodným rodičem dědic není.
  - **Aspoň dva:** jediný člověk by se v obydlí hned rozpadl (Rozpad domácnosti) a druhý den by se
    stěhoval znovu. Domácnost s jediným dospělým dítětem ho proto pošle s jedním dospělým dítětem
    jiné takové přeplněné domácnosti (svatba mezi rody) a odejdou spolu; jinak jedno dospělé dítě
    čeká.
  - **Zbytek domácnosti se nerozpadne:** domácnost, ve které by po odchodu dospělých dětí zůstali
    jen starší a děti, je nepošle – rozpad by ji večer přestěhoval jinam a stěhovalo by se tam
    a zpět (stejná pojistka jako u mladého páru). S dědicem u neplodných rodičů to už nenastane –
    zůstává jako pojistka.
  - **Pořadí:** nejdřív mladý pár pro všechna prázdná obydlí, pak dospělé děti pro ta, která
    zůstala prázdná – obydlí podle id, zdroje od nejvíc přeplněné domácnosti (při shodě starší
    obydlí), bez náhody. Kronika zapíše založení domácnosti jako u páru.
- **Prázdné obydlí chátrá rychleji** (Martin, 18. 10. 2026: neobydlené budovy chátrají
  rychleji): dokud čeká, neopravuje se – stav ubývá o celou potřebu oprav podle stáří – a navíc
  o pevný díl stavu denně, protože se nevytápí, došky hnijí, dřevo v zemi trouchniví a nikdo
  nespraví střechu. Nová prázdná **zemnice spadne z plného stavu na nulu za ≈ 5 let**,
  **polozemnice za ≈ 8 let** (čísla návrh Clauda; složka podle stáří je u nového domu
  zanedbatelná, staré prázdné obydlí zanikne dřív). Dřív jen bez oprav vydržela zemnice ≈ 16 let
  a polozemnice ≈ 26 let – déle než obydlený dům do přestavby. Po znovuosídlení se opravy vrací
  od stavu, který zbyl (stav se nezvedá); rozestavěná přestavba prázdného obydlí se ruší.
- Hráč dostane upozornění, když je domácnost plná (se 4 dospělými) nebo přeplněná s dospělými
  dětmi a žádné nové obydlí pro ni nečeká (fakt – zároveň s ním se odemkne stavba obydlí).
- Když hráč nestaví, přeplněná domácnost žije v těsnu – méně porodů, víc úmrtí, ves přestane
  růst (Martin potvrdil).

### Chátrání a přestavba (rozhodují obyvatelé)

- Každé obydlí má **stav** 0–100 % a stárne. Potřeba oprav (člověkodny za rok) roste s věkem
  – zpočátku malá, ke konci životnosti velká (Martin): roční potřeba na konci životnosti
  × (věk / životnost)². S delší životností zemnice (18 let místo 15) se křivka sama roztáhla:
  na konci života dál 15 člověkodní ročně a za celý život 90 místo 75. Prázdné obydlí chátrá
  navíc pevným dílem stavu – zemnice ≈ 5 let, polozemnice ≈ 8 let (viz Nové obydlí – Prázdné
  obydlí chátrá rychleji).
- Opravy jdou z práce vsi hned po polních pracích ([fields.md](fields.md)), takže stárnoucí
  domy ubírají společnou práci vsi. Když na opravy práce nestačí, stav klesá rychleji.
- Ke konci životnosti stojí opravy obydlí zhruba polovinu toho, co jeho domácnost přidá do
  společné práce vsi (návrh Clauda) –
  stárnoucí domy citelně ubírají vsi práci.
- **Přestavba:** když se opravy přestanou vyplácet (typicky kolem konce životnosti) nebo stav
  klesne na 0, obyvatelé se **sami** rozhodnou dům zbourat a na stejném místě postavit nový
  (Martin). Hráč o tom nerozhoduje.
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

### Kronika

- Ves vede kroniku událostí s herním datem: narození, úmrtí (dítě / dospělý / starší, hladem
  zvlášť), založení domácnosti, svatba mezi domy, dokončení stavby, rozhodnutí obyvatel
  o přestavbě a vymření vsi.
  Po návratu ji hráč uvidí jako první.
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
- Rozhraní jako v 0 A.D. (Martin, 17. 10. 2026: „Ovládací prvky a layout udělej jako u 0AD.
  Odstraň všechny popisky – hráč nepotřebuje průvodce. Nevoď hráče za ručičku.“): horní lišta
  se jménem vsi a ikonami s čísly (lidé, obilí, volná práce, nasycení, datum), minimapa, panel
  vybraného obydlí (obyvatelé s věkem, stav, stáří, průběh stavby) a mřížka staveb. Žádný
  průvodce ani nápovědy.
- Krátké mizející upozornění, že je domácnost plná, že ves hladoví, že lidé umírají hlady a že
  byla svatba (fakt, ne rada).
- Obrazovka porážky, když hráči vymřou všechny vsi (Hlad a vymření).
- Kronika zůstává v datech vsi, v rozhraní zatím není.

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

| Rozhodnutí                                                                     | Kdo                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| Ves jako zásobárna aktiv: jídlo, voda, dřevo a hlavně lidé / člověkohodiny     | Martin                                     |
| Start: 4 lidé v jedné zemnici, hráč vybere místo                               | Martin                                     |
| První zemnici si osadníci postaví sami, průběh stavby je vidět                 | Martin (17. 10. 2026)                      |
| Dost jídla → populace roste; cílem je efektivní výroba jídla                   | Martin                                     |
| Obydlí zatím zemnice a polozemnice                                             | Martin                                     |
| Obydlí se umisťuje volně (půdorys) na dost rovné zemi; překážky a les zdraží   | Martin                                     |
| Pole jsou samostatná a společná pro celou ves                                  | Martin                                     |
| Vlastní modely obydlí: omazané stěny, slámové došky; Millennium A.D. ne        | Martin                                     |
| Nová obydlí vždy staví hráč; plná domácnost → nová domácnost v novém obydlí    | Martin                                     |
| Hráč staví kdy chce (bez odemčení plnou domácností), ves zakládá zemnicí       | Martin (17. 10. 2026)                      |
| Odemčení surovinami předem – bez nich je tlačítko stavby zašedlé               | Martin (17. 10. 2026)                      |
| Obydlí jen, když je kým ho osadit (lidé k osídlení jako cena předem)           | Martin (17. 10. 2026)                      |
| Obydlí chátrají, opravy rostou; přestavbu (i na lepší) rozhodují obyvatelé     | Martin                                     |
| Bez staveb ves přestane růst, ale nerozpadne se (hlad ji ale zabít může)       | návrh Clauda, Martin potvrdil              |
| Přestavba vždy na lepší obydlí, pokud jsou suroviny; typ nové stavby hráč      | Martin                                     |
| „Má na to“ podle ročního průměru společné práce a dřeva (ne posledních 30 dní) | Martin – hlášení chyby 18. 10. 2026        |
| Hájení: prvních 30 herních let vsi přeje štěstí; žádní příchozí z okolí        | Martin                                     |
| Lidé umírají hlady, ves může vymřít; bez vsí hráč začíná znovu                 | Martin (18. 10. 2026)                      |
| Nahromaděný hlad, prahy 20 / 12 dní, smrt bez jídla do 60 / 45 dní             | návrh Clauda                               |
| Hlad přibývá pod 90 % přídělu, od 90 % ubývá; v hájení den pod prahem          | návrh Clauda                               |
| Restart: staré sídlo do archivu, nové sídelní sídlo s novou krajinou           | návrh Clauda                               |
| Začít znovu jde i se živou vsí – z nabídky hry (F10), po potvrzení             | Martin (18. 10. 2026)                      |
| Podoba hájení: dospělí neumírají, poloviční dětská úmrtnost                    | návrh Clauda                               |
| Kapacity 6 / 8, ceny 60 / 220 člověkodní (roční období / rok), životnosti      | návrh Clauda                               |
| Porodnost, úmrtnost, opravy až polovina příspěvku domácnosti                   | návrh Clauda                               |
| Dospělí umírají 2 % ročně (dřív 1,5 %)                                         | Martin – oprava podle rešerše 17. 10. 2026 |
| Porody od 16 let; dospělý pro práci, odemčení a domácnost zůstává 14–44        | Martin – oprava podle rešerše 17. 10. 2026 |
| Životnost zemnice ≈ 18 let (dřív ≈ 15); opravy na konci dál 15 čd ročně        | Martin – oprava podle rešerše 17. 10. 2026 |
| Startovní dospívající 12 a 13 let zůstávají                                    | Martin (17. 10. 2026)                      |
| Stěhuje se pár z plné domácnosti se 4 dospělými; dva nejmladší                 | návrh Clauda                               |
| Rozpad domácnosti, prázdná obydlí čekají na plnou domácnost                    | návrh Clauda                               |
| Přeplněná domácnost s dospělými dětmi osídlí úplně prázdné obydlí              | Martin (18. 10. 2026)                      |
| Dospělé děti = 14–44 kromě dvou nejstarších od 14; všechny, nejvýš kapacita    | návrh Clauda                               |
| Aspoň dva (jednotlivci z různých domácností spolu); zbytek se nesmí rozpadnout | návrh Clauda                               |
| Nejdřív mladý pár, pak dospělé děti; lidé k osídlení počítají obojí            | návrh Clauda                               |
| U neplodných rodičů (oba 45+) zůstává nejstarší dospělé dítě doma jako dědic   | Martin (18. 10. 2026)                      |
| Sňatky mezi domy – svobodní 16–44 ze dvou domů se vezmou                       | Martin (18. 10. 2026)                      |
| Stěhuje se, komu se dům nerozpadne; jinak do víc míst, mladší; ne do přeplněna | návrh Clauda                               |
| Svobodní od nejstaršího, protějšek další v pořadí; denně v kroku 6             | návrh Clauda                               |
| Neobydlené budovy chátrají rychleji                                            | Martin (18. 10. 2026)                      |
| Prázdná zemnice zanikne za ≈ 5 let, polozemnice za ≈ 8 let (úbytek navíc)      | návrh Clauda                               |
| Obyvatelé bez jmen a pohlaví, náhoda ze seedu, kronika                         | návrh Clauda                               |
| Dřevo zatím v ceně práce                                                       | návrh Clauda (dočasné)                     |
| Polozemnice na pozemku = políčko pole s polským plotem, dům uprostřed / v rohu | Martin, 18. 10. 2026                       |
| Rohy polského plotu zakulacené; výběr polozemnice označí celý pozemek          | Martin, 18. 10. 2026                       |
| Starší polozemnice dostanou pozemek při načtení, jinak při přestavbě do 50 m   | Martin, 18. 10. 2026                       |
| Vchod k brance vpředu, [ a ] přepínají variantu, rovno jen pod domem           | návrh Clauda                               |
