# Válka

Stav: **schváleno** – Martin 3. 11. 2026 na otázku „Schvaluješ návrhy seniorátu, vazalství a války jako celek, abych podle nich připravil plán implementace?“: „ano“. Původní stav:
Stav: **návrh** (3. 11. 2026). **Implementováno** (sloučeno ≈ 7. 11. 2026, kód viz [war.md](../code/war.md)). Tělo je přepsané podle oddílu
[Odpovědi Martina 2. 11. 2026](#odpovědi-martina-2-11-2026) (několik odpovědí je z 3. 11.) – ty
jsou závazné. Co z nájezdu na sousední ves platí dál, je označené „Martin 18. 10.“; co níž není
výslovně Martinovo, je **návrh Clauda**. Navazuje na [vazalství](vassalage.md) (jednání
s podmínkami, vojenská služba a svolání, ochrana, vypovězení, rozsudek), [vojvodovu
rodinu](lord.md) (výcvik), [koně](horses.md), [divokou zvěř](wildlife.md) (lov),
[stěhování](migration.md) (mřížka map) a [obchod](trade.md) (dvorec, zemská stezka). Opevnění
popisuje samostatný návrh [fortifications.md](fortifications.md) (schválen 3. 11. 2026) – válka
z něj bere ~~násobky obrany~~ obranu hradeb (od 8. 11. 2026 bez násobku – [fortifications.md](fortifications.md#hradby-a-obrana-8-11-2026)), útočiště
a prolomení; hradby a obrana jsou implementované 8. 11. 2026
([plán hradeb](../superpowers/plans/2026-11-08-ramparts.md); kód [docs/code/war.md](../code/war.md) –
Přechod hradby, Prolomení, Obránci na hradbě, Brány v bitvě, NPC velitel). Historické opory:
[rešerše](research/2026-11-02-war.md).

## Proč

- Martin 2. 11. 2026: „**Na začátku na vrcholu nestojí nikdo. Všichni hráči jsou si rovni a pokud
  se chce někdo dostat na vrchol, musí si nějakým způsobem podrobit ostatní. V tom ta hra vlastně
  spočívá.**“
- Hráč bez pozvánky (Martin 2. 11. 2026): „**Bude úplně nezávislý – buď svou nezávislost uhájí
  nebo ho některý z ostatních hráčů donutí stát se jeho vazalem.**“
- Vojenská služba: „**Ano. Bude to hlavní věc na vazalství.**“ (Martin 2. 11. 2026) – válka je
  to, k čemu pán vazaly potřebuje.
- Vazalství ani mír nedrží žádné pravidlo (Martin 2. 11. 2026: „**žádné herní pravidlo nenutí
  vazalství dodržet**“), jen síla: **válka je nátlak**, který z nabídky míru s podmínkami dělá
  nabídku, jaká se neodmítá. Historicky stejně – tribut za mír, kdo platit přestal, toho pán
  napadl znovu (rešerše 5 – Boleslav I. a Ota I.).
- Hráč je většinu času offline (herní rok ≈ 8 h 46 min) – tažení musí jít hrát živě a zároveň
  **obrana musí fungovat bez obránce**.

## Co se mění proti verzím z 18. 10. a 2. 11. 2026

| Bylo                                                     | Nově                                                                                         | Kdo                |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| Válce musí předcházet výzva a lhůta 24 h                 | **Opověď** smí, nemusí; přepadení bez opovědi jen věcně v kronice                            | Martin 2. 11.      |
| Nejvýš jeden nájezd rodu na ves za herní rok             | **Bez omezení** – brzdí roční doba, zima, zásoby a délka tažení                              | Martin 2. 11.      |
| Vesničan síla 1, muž rodu 1–2 podle boje a luku          | Dvě stupnice: vesničan **pevně 0,4**, muž rodu **1–3** podle vojenské zkušenosti             | Martin 2. 11.      |
| Výcvik do 100                                            | Strop: výcvik doma **50**, lov **70**, nad 70 jen **válka**                                  | Martin 2. 11.      |
| Do pánovy války jen muži rodu, vesničané jen vlastní ves | Vesničané smějí i do útoku se slabou silou; vazalové ve službě dál jen muži rodu             | Martin 2. 11.      |
| Útočníky vždy řídí hráč; bez něj vojsko stojí a vrátí se | Živě jen tažení vedené **hráčovým mužem**; jinak rozkaz a NPC; bez **zástupce** se rozpadne  | Martin 2. 11.      |
| Cíl do 3 políček z mapy okolí; mezilehlé mapy jen čas    | **Mapu po mapě** – každou mapou se jde; panel Vojsko **textový, bez mapy**                   | Martin 2. 11.      |
| Po cizí mapě 1 km za herní den                           | **≈ 3–4 m/s** ve skutečném čase, 1 km ≈ 4–5 min ≈ 3 herní dny, táž poloha ve scéně i serveru | Martin 2. 11.      |
| Střet jedním výpočtem síly skupin                        | **Muž po muži** se zdravím; hráč řídí svého muže, ostatní **rozkaz před bitvou**             | Martin 2. 11.      |
| Postoj „do posledního“                                   | **Bránit se** do **bodu zlomu** (30 % ztrát v útoku, 45 % v obraně, po skupinách)            | Martin 3. 11.      |
| Muži rodu se nevzdávají                                  | V bezvýchodné situaci se často vzdají – **zajetí a výkupné**                                 | Martin 2. 11.      |
| Utéct jen do lesa do 300 m; ztratí se podíl zásob        | **Včasný útěk** se zásobami a stády do nejbližšího lesa, jámy skryté; útěk při bodu zlomu    | Martin 2. 11.      |
| Konec války přijetím výzvy = vazalství; mír bez podmínek | **Mírové jednání**: poplatek, vazalství, tribut, postoupení vsí; mír na dobu neurčitou       | Martin 2. 11.      |
| Palisáda kolem dvorce jako hotový návrh                  | Opevnění samostatně ([fortifications.md](fortifications.md)) – násobky, útočiště, prolomení  | Martin 2. a 3. 11. |
| Násobek obrany za opevněním                              | **Hradba jako překážka** – žebříky, oheň, kopání, ochoz, souboj u žebříku, obsazení          | Martin 8. 11.      |
| Průchod a střet s třetím rodem – Později                 | Průchod neutrálním územím smí, s **ohlášením**                                               | Martin 2. 11.      |

**Platí dál (Martin 18. 10. 2026):** dobrovolníci a rozkaz; libovolný počet mužů a práce doma
úměrně zpomalí; padlí mohou ves položit až k vymření; kovárna dává bonus; postup dům od domu,
sevřená ves se brání společně, samoty ne; vzdaný dům útočník pobije, nebo odvede; mlha války;
hustý les velmi pomalu, voda jen po brodech; napadený se o vojsku dozví, až ho spatří vesničan;
přítomný hráč velí obraně sám; mřížka map s přechodem okrajem.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** rod si podrobí jiný rod – **mírem s podmínkami** (vazalství, tribut, poplatek,
  postoupení vsí); vazalem se nikdo nestane bez vlastního rozhodnutí (Martin 2. 11. 2026).
- **Cíl:** nezávislý hráč **může nezávislost uhájit** – obranou, útěkem, odvetou (Martin 2. 11.).
- **Cíl:** tažení hraje **živě** ten, jehož muž ho vede – jako hrdinu v 0 A.D.; ostatní tažení
  jdou podle rozkazu (Martin 2. 11. 2026).
- **Cíl:** **obrana funguje bez obránce** – postoj vsi nastavený dopředu (Martin 3. 11. 2026).
- **Cíl:** tažení **není dílem okamžiku** – shromáždění, cesta mapu po mapě, zásoby, roční doba
  (Martin 2. 11. 2026).
- **Cíl:** síla vychází z toho, co už ve hře je – výcvik a lov, koně, kovárna, štěstí, počet mužů;
  rozdíl mezi vesničanem, slabě a dobře vycvičeným mužem rodu je znatelný (Martin 2. 11. 2026).
- **Cíl:** pán do války **svolá vazaly** – přijdou jen muži jejich rodů – a vazalovi na žádost
  pošle **ochranu** ([vazalství](vassalage.md) – Služby, Povinnosti pána).
- **Ne-cíl (první verze):** NPC vojvodové jako cíl, družina, obléhání hladem, věže a kamenné
  hradby ([opevnění](fortifications.md) – Později), pálení vsí, zbraně a zbroj jako věci, prodej
  zajatců.
- **Anti-cíl:** hráč, který spí, přijde o celou hru – **poslední muž rodu doma vždy uteče**
  (Martin 2. 11. 2026).
- **Anti-cíl:** nováček rozdrcený první den – ochrana 7 dní (Martin 2. 11. 2026).
- **Anti-cíl:** hra hodnotí hráče („zrádce“, „zbabělec“) – kronika zapisuje jen události, soudí
  hráči (Martin 3. 11. 2026).

## Kdo s kým válčí

- **Válka je vztah dvou rodů** – platí pro **všechny vsi** obou rodů, každou jde přepadnout zvlášť
  (Martin 2. 11. 2026 – „Ano“).
- **Platí oběma směry** – napadený smí táhnout také (návrh Clauda).
- **Žádný zemský mír** – válka i mezi vazaly téhož pána a s vlastním pánem nebo vazalem: „**Ano,
  hra to nezakazuje**“ (Martin 2. 11. 2026). Pán zasáhne po svém – ochranou, pomocí, rozsudkem,
  vypovězením ([vazalství](vassalage.md) – Mír a spory).
- **Bývalý pán proti vazalovi, který vypověděl**, smí táhnout kdykoli jako proti komukoli jinému –
  žádné zvláštní pravidlo; výpověď je v kronice (Martin 2. 11. 2026 – „Ano smí“).
- **Přinucení k poslušnosti** (Martin 2. 11. 2026: pán vazala „přinutí k poslušnosti“): vazala,
  který neplní (dávky, splátky, svolání, rozsudek – [vazalství](vassalage.md), Neformální
  výpověď), pán napadne jako kohokoli. Opověď smí nést požadavek **splnit dlužné**; splní-li ho
  vazal, válka skončí (návrh Clauda).
- **Kdo táhne:** rod; tažení připraví hráč – **vůdce tažení** (Velení níž). Vsi rodu, které vede
  NPC [správce](steward.md), se brání podle postoje a samy nevyrážejí. Ze vsi, kterou hráč
  spravuje pro cizího držitele, ne – válka není běžné řízení ([vazalství](vassalage.md) – Hráč
  jako správce cizí vsi) (návrh Clauda).
- **Dosah bez pevné meze** – brzdí ho cesta mapu po mapě, zásoby a čas; Martin 2. 11. 2026: „Bude
  tak jednodušší plenit příhraniční vesnice a těžší probít se k centru dominia“ (zrušení meze
  3 políček je návrh Clauda).
- **Nelze:** napadnout rod v ochraně ani novou ves v ochraně (Ochrana níž).

## Začátek války – opověď, nebo přepadení

- Martin 2. 11. 2026: „**Formální vyhlášení či opověď je dobré, ale nikoli nezbytné**“ – válka
  smí začít i bez opovědi.
- **Opověď** (podoba návrh Clauda): vzkaz rodu „Chci na vás jít“ (rešerše 8 – Svjatoslav). Válka
  začne **odesláním**, bez lhůty. Opověď smí nést **požadavek** se stejnými podmínkami jako mír
  (Konec války níž) – přijme-li ho opovězený, válka hned skončí mírem s těmi podmínkami; protinávrh
  je mírové jednání; odmítnutí nebo mlčení nic nemění. Opověď s požadavkem je jednání
  ([vazalství](vassalage.md) – Meze: mezi dvěma hráči jedno jednání naráz).
- **Přepadení bez opovědi:** válka začne **prvním útokem** vojska na lidi, dobytek nebo zásoby
  druhého rodu (návrh Clauda – kdy přesně). Žádný herní trest – jen věcný zápis do kronik obou
  rodů: „Bořivoj z Lhoty přepadl Kněžice bez opovědi.“ (Martin 2. 11. 2026 – „Jak říkáš“).
- **Kdy** vojsko přijde, obránce neví ani po opovědi – dozví se, až ho spatří vesničan
  (Martin 18. 10.).
- **Válka trvá** do míru (Konec války níž), nebo do vymření jednoho z rodů. Bez střetu **3 herní
  roky** (≈ 26 h) válka **utichne** – zápis „Válka s Bořivojem utichla.“; další útok je nová válka
  (návrh Clauda – aby horní lišta a panel nedržely mrtvé války).

## Ochrana nového hráče

- **Nový rod – 7 skutečných dní od registrace** (≈ 19 herních let – synové zakladatelů dospějí)
  ho nikdo nesmí napadnout (Martin 2. 11. 2026 – „ok“). Ochrana **skončí dřív, když sám
  napadne** – pošle opověď, nebo jeho vojsko zaútočí. Platí i po Začít znovu
  ([obyvatelstvo](population.md)) – nový rod je nový začátek (návrh Clauda).
- **Průchod** chráněným územím smí – průchod není útok (návrh Clauda).
- **Nová ves rodu** (syn odchází na novou mapu – lord.md, Dělení vsi): prvních **5 herních let**
  ji nikdo nenapadne – stejně jako ji nezasáhne pohroma (Martin 27. 10. 2026 k pohromám:
  „Pětiletou ochranu“; převzetí do války je návrh Clauda).
- Rozkaz k útoku na chráněnou ves je zašedlý s důvodem u kurzoru (Rozhraní).

## Nájezdy bez omezení – roční doba a zima

- **Kolikrát chce** – Martin 2. 11. 2026: „**Ono to válečné tažení jde reálně podniknout jen
  v některé části roku. Zimní tažení sice bude možné, ale extrémně náročné. Vojenské tažení také
  není dílem okamžiku**“. Žádný roční klid ani mez na tutéž ves.
- **Roční doba:** tažení trvá desítky herních dní (Pohyb níž) a muži mezitím chybí doma – za žní
  a setí to ves pocítí nejvíc (práce úměrně – Martin 18. 10.). Hra nic nezakazuje (návrh Clauda).
- **Zima** (od 1. 12. do konce února – [kalendář](calendar.md)) – Martin 2. 11. 2026: „**Vojsko
  jde pomaleji. Musí sebou vézt zásoby píce pro koně. Pokud je tažení vícedenní, vojsko potřebuje
  víc času na ubytování**“ (čísla návrh Clauda):
  - **pochod sněhem × 0,75**;
  - **únava z mrazu** (Martin 3. 11. 2026: „Středověké vojsko to zpravidla udělalo tak, že se
    snažilo přenocovat v nějaké vesnici. Jen si to nedokážu představit z hlediska herní mechaniky,
    když neuznáváme noc“; čísla návrh Clauda): vojsko, které je v zimě venku, ztrácí každý herní
    den **3 zdraví a 2 % síly**; zastávka ve vsi (vlastní, neutrální, která ho pustí, nebo dobytá)
    mráz zastaví a muži se zotaví – **+10 zdraví a +5 % síly za den** (i po zimě, dokud únavu
    nedohoní – návrh Clauda). Tažení tak vede od vsi ke vsi; zimní ležení ve třetině dne odpadá,
    tempo v zimě je jen sníh × 0,75;
  - **píce:** koně na tažení dostávají seno, kdykoli by ho dostávali doma (listopad–březen,
    **6 kg denně**, kůň bez obilí 7 kg – [koně](horses.md)); tažení ho veze s sebou.

## Vojsko

- **Muži rodu od 16 let** (vojvoda, synové, bratři, vnuci – i hráčův muž) na **svých koních**
  ([koně](horses.md) – každý jezdecký kůň má svého jezdce). Smějí padnout – „legitimní způsob
  smrti“ ([vazalství](vassalage.md) – Vojenská služba).
- **Vesničané** – Martin 2. 11. 2026: „**Vesničané (muži) mohou mít určité zkušenosti z lovu.
  Takže ano, lze je zapojit do boje, a to i do útočného, ale jejich bojová hodnota bude
  nevalná**“: muži 16–44 ze vsí vůdcova rodu, které tažení vybere, smějí na tažení i do obrany se
  slabou silou (Síla). Ženy, děti a starší na tažení nejdou (Martin 18. 10.).
- **Dobrovolníci a rozkaz** (Martin 18. 10. 2026; čísla návrh Clauda – beze změny), v každé
  vybrané vsi zvlášť:
  - muž, který **má v cílové vsi blízké příbuzné** (rodiče, sourozence, děti, ženu odtamtud nebo
    její rodinu), **nechce** (Martin); jinak se přihlásí s pravděpodobností ≈ 30 % + 0,5 % za
    bod štěstí nad 50, ves s hladem víc (kořist), čerstvě vdovská domácnost méně;
  - **rozkaz:** ostatním může hráč nařídit, aby šli – nucení mají nízkou bojovou hodnotu (Síla),
    **dezertují** (≈ 5 % denně, s příbuznými v cíli ≈ 15 %; dezertér s příbuznými v cíli může cíl
    varovat), při bodu zlomu utečou první a nařídit muži útok na jeho příbuzné sníží štěstí vsi
    (≈ −5 na rok za každého) (Martin: „Můžu si tak, lidově řečeno, nasrat do bot.“);
  - hráč vidí počet dobrovolníků a ochotných / neochotných (ikony + čísla), ne jména.
- **Muži vazalů ve službě** – jen muži rodu, Martin 2. 11. 2026: „**vazal musí poslat muže schopné
  vojenské služby, tj. příslušníky svého rodu, protože nikdo jiný vojenské zkušenosti nemá**“.
  Vesničané vazala do pánovy války nechodí. Na svolání ([vazalství](vassalage.md) – Svolání)
  přijdou ke **shromaždišti**, velí jim vůdce; na tažení jedí z jeho zásob, ve vsi je živí ves,
  kde slouží (návrh Clauda).
- **Výzbroj** – Martin 2. 11. 2026: „**Zatím jen koeficient. Reálné věci budeme řešit někdy
  později vlastní mechanikou**“ – co muži mají, vystihuje **kovárna** (Síla).
- **Doma:** ves bez mužů ztratí jejich práci úměrně (Martin 18. 10.).

## Velení a příprava tažení

- **Vůdce tažení** je hráč. Martin 2. 11. 2026: „**Záleží jak velké tažení podniká. Rozhodne,
  kteří vazalové půjdou (ze kterých vsí) a u které vsi rodu se vojsko shromáždí.**“
- **Příprava** (textový panel Vojsko – Rozhraní):
  1. **velitel** – muž rodu od 16 let, kterého hráč určí (i jeho vlastní muž, syn, bratr) (Martin);
  2. **zástupce velitele** – volitelně další muž vůdcova rodu ve vojsku (Martin – „měl by na
     začátku určit svého nástupce. Samozřejmě nemusí“);
  3. **vsi rodu**, odkud jdou muži rodu a vesničané, a **vazalové** ke svolání (Martin);
  4. **shromaždiště** – ves vůdcova rodu; vojsko vyrazí, když hráč dá pokyn – kdo do té doby
     nedorazil, čeká ve shromaždišti a vrátí se po dnech služby (návrh Clauda);
  5. **skupiny a jejich rozkazy** (Boj níž);
  6. **jídlo a píce**, nosiči, koně a vozy (Pohyb níž);
  7. **cíl** – ves rodu, kterou tažení napadne; u tažení vedeného NPC je rozkazem, u živého
     vedení jen odhadem cesty (návrh Clauda);
  8. u tažení vedeného NPC **co se vzdanými** – pobít / odvést / nechat; šlechtice NPC vždy zajme
     (návrh Clauda – Martin: „Cílem útočníka je nepřátelského šlechtice spíš zajmout“);
  9. **ohlášení průchodu** rodům na cestě (Pohyb níž).
- **Vede hráčův muž** → hráč řídí **živě** cestu, útok i ústup (Martin 2. 11. 2026 – „Přesně
  tak“).
- **Vede jiný muž** → hráč dá jen rozkaz na začátku a „**v tom případě nemá na tažení žádný vliv**“
  (Martin 2. 11. 2026); smí se jen dívat. **NPC velitel** (návrh Clauda) jde po mřížce map
  nejkratší cestou (les obejde, řeky po brodech), na mapě cíle napadá skupiny domů od nejslabší
  v dohledu, bere kořist a obrátí se, když jeho skupina dosáhne bodu zlomu, když padne nebo uteče
  polovina vojska, když je nosnost plná, nebo když jídla zbývá jen na cestu domů.
- **Hráč odejde od tažení** – zavře hru nebo je mimo mapu vojska déle než **1 herní den**
  (≈ 86 s; návrh Clauda – krátký pohled domů tažení nezničí):
  - **se zástupcem** vede zástupce podle rozkazu (NPC); po návratu hráč velení převezme (Martin);
  - **bez zástupce** se výprava **rozpadne** – Martin 2. 11. 2026: „**pokud pak odejde nebo umře,
    výprava se rozpadne a lidé se pokusí vrátit zpátky**“.
- **Padne-li nebo je-li zajat velitel**, velení přejde na **zástupce** a vede NPC podle rozkazu
  (hráč už vliv nemá); bez zástupce, nebo padne-li i zástupce, se výprava rozpadne (Martin; druhý
  případ návrh Clauda). Mění rozhodnutí 18. 10. „vojsko stojí a po dni se vrátí“.
- **Rozpad** (návrh Clauda): lidé se vracejí domů po hloučcích podle vsí nejkratší cestou, nesou,
  co mají, a nebojují – jen se brání; ranění jdou s nimi. Kronika: „Výprava Bořivoje se
  rozpadla.“
- **Podrobnosti NPC velitele a rozpadu** (návrh Clauda, Ú6.12):
  - **napadne** skupinu domů, má-li vojsko (součet sil mužů v boji) aspoň **1,5 × sílu jejích
    obránců** (~~× násobek obrany – u domu 1,5, za opevněním 1,5 × násobek opevnění~~ – násobek
    zrušen 8. 11. 2026, i u domu; jako přesila u vzdání; opevněnou ves napadne, trvá-li
    nejrychlejší postup přes hradbu nejvýš 1 herní den –
    [fortifications.md](fortifications.md#hradby-a-obrana-8-11-2026), 8. 11. 2026); „v dohledu“ = do 150 m od kteréhokoli muže vojska; nevidí-li nikoho, jde ke vsi;
  - **nenapadne-li ani nejslabší skupinu:** stojí-li všichni obránci za opevněním, vezme, co je
    venku (útočiště i s tím, co do něj lidé odnesli, zůstane nedobyté); brání-li se silná skupina
    bez opevnění, obrátí se bez kořisti – venku nic nehlídaného není;
  - **polovina vojska** = padlí, zajatí, dezertéři a v boji prchající ÷ všichni muži tažení (ranění
    se nepočítají); **plná nosnost** = kořist jídla dosáhne nosnosti (25 kg na muže na nohou spolu
    s vlastním jídlem); **jídlo na cestu domů** = vzdušnou čarou do shromaždiště tempem 3,5 m/s;
  - **přítomnost** = otevřené tažení ve hře nebo jakýkoli pokyn hráče; 1 herní den ≈ 345 taktů
    (≈ 86 s); vede-li jiný muž, hráč tažení neobrátí (nemá vliv);
  - **hlouček** se sejde u skupiny svého prvního muže; kořist, stádo a odvedení jdou s hloučkem vsi
    shromaždiště (jako při návratu); zápis o rozpadu dostanou domovské vsi i shromaždiště,
    upozornění „Výprava se rozpadla.“ vůdce i vazalové, jejichž muži šli;
  - **raněný velitel** velí dál; v boji, dokud leží, řídí NPC zástupce.

## Síla

- **Výcvik a zkušenost** – Martin 2. 11. 2026: „**Muž se cvičením doma může dostat max na 50 %
  tréninku, pokud loví tak na 70 % a zbytek zkušeností může získat jedině válkou. To, že zkušenost
  klesá, když muž necvičí, neloví nebo neválčí je dobré. Je však potřeba zohlednit, že musí být
  rozdíl mezi vesničanem, vojvodou vycvičeným na 10 % a vojvodou vycvičeným třeba na 60 %.**“
  - **Stropy dovedností** (luk, boj, jízda – [vojvodova rodina](lord.md), Výcvik a zkušenost):
    výcvik doma (cvičiště, objížďka polí) nejvýš **50**, lov ([divoká zvěř](wildlife.md)) nejvýš
    **70**, nad 70 jen **válka** (do 100). Úbytek bez výcviku zůstává (lord.md – 5 % ročně, nejníž
    polovina nejvyšší dosažené). Strop podle věku platí dál – rozhoduje nižší (návrh Clauda).
  - **Válka cvičí** (návrh Clauda): den na tažení se počítá jako **2 h** výcviku luku a boje
    (jezdcům i jízdy), den se soubojem jako **6 h**, se stropem 100 a sazbou růstu z lord.md.
  - **Vojenská zkušenost** muže rodu = **(boj + luk) ÷ 2** (návrh Clauda); jízda je v násobku koně.
  - **Den lovu** (návrh Clauda): lov rodu je výcvik jako dosud ([divoká zvěř](wildlife.md) – Lov
    rodu: jezdec luk a jízda, pěší luk a boj), ale **se stropem 70**; hodiny dne lovu zůstávají
    podle wildlife.md (6 h), jízda i luk rostou sazbou z lord.md.
  - **Vesničan** – Martin 3. 11. 2026: „Nebudeme to řešit, všichni vesničané budou mít víceméně
    stejnou (a malou) bojovou hodnotu.“ Dovednost lov u vesničanů se **nezavádí**; vesničan má
    pevnou sílu (návrh Clauda: **0,4**).

| Kdo / co                                  | Síla                                                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vesničan (muž 16–44) pěšky                | **0,4**, pevně (Martin 3. 11.; číslo návrh Clauda)                                                                                                                                  |
| Muž rodu pěšky                            | **1 + 2 × vojenská zkušenost ÷ 100** – od 1 do 3 (Martin 2. 11.)                                                                                                                    |
| Muž rodu na koni                          | × **(1 + 0,5 × jízda na koni ÷ 100)**, jízda na koni = jízda × (0,4 + 0,6 × výcvik koně) ([koně](horses.md)) – až **× 1,5** (Martin 2. 11.)                                         |
| Vesničan na koni                          | nebojuje (Martin 2. 11.)                                                                                                                                                            |
| Výzbroj – kovárna                         | × **1,5** s plným pokrytím nástroji (Martin 18. 10. a 2. 11. – zatím koeficient)                                                                                                    |
| Štěstí vsi (vesničané)                    | × **0,8–1,1** jako práce (18. 10.)                                                                                                                                                  |
| Nucený vesničan                           | × **0,5** (Martin 3. 11.), s příbuznými v cílové vsi × **0,3** (18. 10.)                                                                                                            |
| Ženy, starší a chlapci 14–15 let v obraně | **0,1**, brání se jen u domu (návrh Clauda)                                                                                                                                         |
| Obrana u domu                             | ~~× **1,5** (18. 10. – znají místo)~~ – **zrušeno 8. 11.** (Martin „a“): výhodu obránce nese bod zlomu 45 %, útěk a jámy                                                            |
| Za opevněním (Opevnění)                   | ~~× 1,5 × násobek opevnění~~ – **bez násobku** (Martin 8. 11.): překážka, ochoz, souboj u žebříku, únava po valu ([fortifications.md](fortifications.md#hradby-a-obrana-8-11-2026)) |

Příklady (Martin 2. 11. 2026: „i vojvoda vycvičený na 10 musí být výš, než lovící vesničan“):
vesničan 0,4, nucený 0,2; muž rodu se zkušeností 10 → 1,2, s 50 (strop výcviku doma) → 2, se 70
(lov) → 2,4, s 90 (válka) → 2,8. Na vycvičeném koni s jízdou 60 × 1,3 (zkušenost 60 → 2,2 × 1,3
≈ 2,9); nejvýš 3 × 1,5 = 4,5.

Vojsko: vojvoda a dva synové se zkušeností 60 na vycvičených koních (≈ 2,9 každý = 8,6)
a 12 vesničanů (8 dobrovolníků po 0,4, 4 nucení po 0,2 = 4,0), s kovárnou (8,6 + 4,0) × 1,5
≈ **19** – tři muži rodu jsou víc než celá ves. Síla je odhad v panelu a základ zásahu v souboji
(Boj), ne výsledek bitvy.

## Pohyb – mapu po mapě

- Martin 2. 11. 2026: „**Hráč musí k cíli dojít mapu po mapě. Bude tak jednodušší plenit
  příhraniční vesnice a těžší probít se k centru dominia**“.
- **Přechod okrajem:** vojsko dojde k okraji a objeví se na opačném okraji sousední mapy
  (Martin 18. 10.); v 8 směrech jako mřížka vazalství (návrh Clauda). **Každou mapou se jde** i na
  mezilehlých mapách – žádný skok ani čas cesty bez scény (Martin 2. 11. 2026).
- **Tempo** – Martin 2. 11. 2026: „**Ten kompromis zní dobře**“: svižná chůze jako jednotky
  v 0 A.D., **≈ 3–4 m/s ve skutečném čase**, 1 km ≈ **4–5 min ≈ 3 herní dny**. Mapa má
  ≈ 1,9 km ([krajina](landscape.md)) – přes celou mapu ≈ 9 min (≈ 6 dní), od okraje ke vsi
  uprostřed ≈ 4–5 min (≈ 3 dny). **Poloha vojska je táž ve scéně i v simulaci** – výjimka
  z „Bez časosběru“ (vojáci jdou rychleji než lidé ve vsi).
- **Terén** (Martin 18. 10.): **hustý les ≈ 1/4** tempa, **voda jen po brodech**; pevná cesta
  a zemská stezka × 1,5 ([cesty](roads.md), [obchod](trade.md)) (návrh Clauda).
- **Skupina jde tempem nejpomalejšího** (návrh Clauda): skupina jen z jezdců × 1,5; se stádem
  × 0,5 (18. 10.); s pěšími raněnými × 0,75 (Ztráty); zima výš.
- **Zásoby tažení** (Martin 2. 11. 2026 – „Ano“): jídlo pro muže (v zimě i seno pro koně) na
  nosičích, koních nebo vozech, ze zásob vsí, odkud muži jdou (návrh Clauda):
  - **denní potřeba** jako doma – ≈ 1 kg obilí na muže (≈ 3 400 kcal – [strava](diet.md)),
    luštěniny, sýr a maso jako jeho podíl (návrh Clauda);
  - **nosnost:** muž **25 kg** – vlastní zásoby a kořist dohromady (18. 10.); kůň bez jezdce
    ≈ 80 kg (návrh Clauda); dvoukolák ≈ 400 kg ([vozy](wagons.md)) – jen mimo hustý les a přes
    brody, tempem spřežení (návrh Clauda);
  - **když dojde**, vojsko se vrátí, nebo si jídlo vezme v napadené vsi jako kořist (Martin).
- **Příklad** (návrh Clauda): Bořivoj táhne ze Lhoty na Kněžice o 2 políčka dál, v létě. Ze Lhoty
  k okraji ≈ 3 dny, přes mezilehlou mapu ≈ 6 dní, ke Kněžicím ≈ 3 dny, střety ≈ 3 dny, zpět se
  stádem ≈ 24 dní – **≈ 40 herních dní ≈ 1 h skutečného času** a ≈ 40 kg jídla na muže, víc, než
  unese – proto koně, vůz, nebo kořist. V zimě dvakrát déle.
- **Průchod územím neutrálního rodu** – projít smí. Martin 2. 11. 2026: „**Neutrálnímu rodu by
  mělo jít dát vědět, že chci táhnout přes jeho území. On se k tomu sice může vyjádřit, ale nic
  to neznamená. Nicméně však nebude překvapen, až se u jeho vesnice objeví cizí vojsko a může dát
  předem vesnici vědět, že vojsko jen prochází a nehrozí jí nebezpečí. Správce tak nezačne
  vesnici opevňovat ani neuteče s vesničany do lesa**“:
  - **ohlášení průchodu** – vzkaz rodu (které mapy, zhruba kdy); odpověď je vzkaz a nic
    nezavazuje;
  - ohlášení se vsím rodu **předá samo** – ohlášené vojsko berou za neškodné, nebrání se ani
    neutíkají; neutrální hráč smí v odpovědi zvolit **Nevěřit** a jeho vsi se pak zachovají
    podle postoje (návrh Clauda – spící hráč nemusí nic dělat);
  - **bez ohlášení** se ves zachová podle postoje (Obránci);
  - kronika věcně: „Bořivoj ohlásil průchod.“, „Vojsko Bořivoje prošlo kolem Kněžic.“
- **Útok po ohlášeném průchodu** hra nezakazuje – Martin 3. 11. 2026: „**Ať se o tom (stejně jako
  o všem) udělá záznam, ale řešení bude na hráčích**“. Kronika zapíše jen události (ohlášený
  průchod, útok), žádné hodnocení; útok začne válku bez opovědi a ohlášení tím přestane platit
  pro všechny vsi rodu (návrh Clauda).
- **Platnost ohlášení** (Martin 7. 11. 2026: ohlášení platí jen pro jedno tažení – po návratu
  domů skončí): ohlášení kryje ohlášené mapy jen pro jedno tažení; až se tažení vrátí domů (nebo
  se rozpadne), ohlášení skončí a na další průchod se musí ohlásit znovu. Ohlášení před vysláním
  čeká a naváže se na první vyslané tažení rodu; ohlášení jiného tažení se nepřenáší. Dřív
  skončí válkou mezi rody (útok i opověď, návrh Clauda); „zhruba kdy“ je jen informace pro hráče.
  Ve válce průchod ohlásit nejde. Bez odpovědi ohlášení platí (spící hráč nic nedělá); odpovědět jde jednou.
- **Vlastní vojska** (návrh Clauda): vojsko vlastního rodu a muži pána nebo vazalů ve službě či
  na ochraně jsou pro ves vždy neškodní; jiné neohlášené vojsko je cizí.

## Boj

- **Kompromis** – Martin 2. 11. 2026: „**Hráč může ovládat vojvodu a ostatní jeho vazalové se
  budou držet nějakého rozkazu, který dostali před bitvou – typicky držet se vévody a bránit ho,
  nebo agresivně útočit na všechno co se hýbe.**“ Boj probíhá **muž po muži ve skutečném čase**.
- **Hráč živě řídí jen svého muže** – výběr, kam jít, na koho zaútočit, jako hrdinu v 0 A.D.
  Ostatní se řídí rozkazem své skupiny.
- **Skupiny** – vojsko jde rozdělit (Martin 2. 11. 2026: „část dostane rozkaz, že jde s velitelem
  a část, že bude hlídat nějaké místo“). Každá skupina má jeden rozkaz:
  - **držet se velitele a bránit ho** – jdou s ním a útočí na toho, kdo na něj útočí;
  - **útočit na vše** – na každého nepřítele, který se brání, i na prchající; vzdané nechají
    (o nich rozhodne velitel – Vzdaní) (návrh Clauda);
  - **držet místo** (brod, brána, kraj lesa) – brání určené místo a nevzdálí se od něj víc než
    ≈ 30 m (návrh Clauda). Napadá jen nepřítele, na kterého z místa dosáhne – střelou, nebo
    zblízka přes hradbu, přes kterou se tak dá bít (plot); za hradbu kvůli nikomu nechodí, nepřeleze
    ji ani neprolomí (návrh Clauda, 8. 11. 2026).
- **Ustoupit není rozkaz** – Martin 2. 11. 2026: „**když ustoupí velitel, jeho muži spořádaně
  ustoupí s ním**“.
- **Změna rozkazu** (návrh Clauda): před bitvou kterékoli skupině; během boje jen skupině, u níž je
  velitel na doslech (≈ 30 m) – rozkazy nesou hlasy, ne kurzor. NPC velitel stejně.
- **Souboj mužů** (Martin 2. 11. 2026 – „ok“; čísla návrh Clauda):
  - každý má **zdraví 100**; zásah ubere **10 × síla útočníka** – ~~÷ násobek obrany (u domu 1,5,
    za opevněním 1,5 × násobek opevnění)~~ – **násobek zrušen 8. 11. 2026** (Martin: „Násobek obrany
    je píčovina. Ta mechanika musí fungovat jinak.“; u domu „a“); výhodu za hradbou nese
    [fortifications.md](fortifications.md#hradby-a-obrana-8-11-2026) – menší viditelná plocha za
    předprsní, lezec × 0,5, únava po valu, obsazení;
  - **luk na dálku** (20–60 m) – poloviční zásah ≈ každé 4 s; luk mají jen muži rodu, vesničané
    bojují zblízka, z ochozu hradby házejí kameny a oštěpy do ≈ 15 m (Martin 8. 11. 2026); **zblízka oštěp nebo sekera** – plný zásah ≈ každé 2 s;
  - **šance na zásah na dálku** podle dovednosti střelce a viditelné plochy cílů v kruhu rozptylu
    (Martin 8. 11. 2026 – [fortifications.md](fortifications.md), Střelba a viditelná plocha;
    hlouček je snadný cíl, šíp smí trefit i vlastního);
  - zda rána padne, určí **los ze seedu** války, tažení a okamžiku – server počítá
    deterministicky, výsledek nezávisí na tom, kdo se dívá;
  - příklad: muž rodu se silou 2 srazí vesničana se silou 0,4 pěti ranami, vesničan jeho
    pětadvaceti.
- **Na nule zdraví** padlý, nebo raněný – los **1 : 1**; muž rodu raněný ve **2 ze 3** (návrh
  Clauda – Martin: šlechtice „spíš zajmout než zabít“). Raněný leží; kdo bojiště udrží, zajme
  raněné muže rodu protivníka (Zajetí) a o raněných vesničanech rozhodne jako o vzdaných.
- **Bod zlomu** – Martin 2. 11. 2026: „**K útěku (bod zlomu) by mělo dojít při 30 % ztrátách
  pokud hráč útočí a při 45 % ztrátách, pokud se brání.**“
  - **za každou skupinu zvlášť** (Martin – „Za každou skupinu zvlášť“); ztráty = padlí, ranění
    a zajatí ÷ počet mužů skupiny, kteří do boje vstoupili – podle počtu, ne podle síly (Martin 3. 11. 2026: „podle počtu“);
  - **30 %** platí pro skupiny tažení (i když je napadnou), **45 %** pro obránce na území
    vlastního rodu a muže, kteří ho chrání (návrh Clauda);
  - **muži rodu utíkají jako ostatní** ve skupině; **velitel neuteče sám** – ustoupí jen na pokyn
    hráče nebo podle rozkazu NPC (Martin – „Jak navrhuješ“);
  - prchající se nebrání; pronásledují je jen skupiny „útočit na vše“. Prchající útočníci jdou
    domů jako při rozpadu, prchající obránci do nejbližšího lesa (návrh Clauda).
- **Dům od domu** (Martin 18. 10.): domy blíž než **40 m** od sebe tvoří **skupinu domů**; její
  obránci se seběhnou a brání společně, samota se neubrání.
- **Mlha války** (Martin 18. 10.): útočník vidí, kam dohlédnou jeho muži (≈ 150 m, v lese míň);
  objevené zůstane, dění vidí jen v dohledu.

## Obránci – postoje a útěk

- **Postoj vsi** nastaví hráč **dopředu** u každé vsi a ves se podle něj zachová, když vesničan
  spatří cizí vojsko (Martin 3. 11. 2026 – „ano“):
  - **Bránit se** (stěna štítů) – lidé se seběhnou do skupin domů a brání se do **bodu zlomu**
    (45 %). Martin 3. 11. 2026: „**do posledního – to nebude fungovat, lidé v jednu chvíli utečou
    sami od sebe**“;
  - **Vzdát se při přesile** (bílá vlajka) – skupina se vzdá, je-li útočníků v dohledu víc než
    **1,5×** jejích obránců (počet mužů, jezdec za dva – návrh Clauda), jinak se brání;
  - **Raději utéct** (stromy) – **výchozí** (Martin 2. 11. 2026 – „ok“), i ve vsi správce.
- **Kdy:** vesničan spatří cizí vojsko (≈ 150 m – Martin 18. 10.), nebo přijde zpráva, že k vsi
  směřuje – posel z jiné vsi rodu, kterou vojsko prošlo (Martin 2. 11. 2026: „a nebo že k ní
  směřují“; posel návrh Clauda).
- **Včasný útěk** – Martin 2. 11. 2026: „**vesnice už na začátku, když zjistí, že se u ní
  objevili útočníci (a nebo že k ní směřují) rozhodne, že se radši schová v nejbližším lese –
  pobere zásoby všechna zvířata a schová se v lese**“:
  - s sebou **dospělý 25 kg** zásob, dítě 7–15 let 10 kg, mladší nic (Martin – „dítě méně“;
    čísla návrh Clauda); **dobytek celý**;
  - zbytek v domech vezme útočník; **zapečetěné jámy** s obilím zůstanou skryté – útočník, který
    ve skupině domů pobude aspoň 1 herní den, najde každou s pravděpodobností **30 %** (los ze
    seedu; Martin – „s určitou pravděpodobností“, číslo návrh Clauda);
  - **nejbližší les** (souvislý les vrstvy překážek) – cesta k němu je vidět a útočník smí
    utíkající dohnat; v lese je najde jen na ≈ 30 m (návrh Clauda – rešerše 1: les je jejich
    výhoda); má-li ves opevnění, napřed do jeho útočiště, kdo se vejde a stihne
    ([fortifications.md](fortifications.md) – Postoje vsi s opevněním, Útočiště). Kde na mapě les
    není, skupina se zachová jako „vzdát se při přesile“ (návrh Clauda);
  - lidé se vrátí 1 herní den po odchodu cizího vojska z mapy (návrh Clauda).
- **Útěk při bodu zlomu** (Martin 2. 11. 2026 – „uteče během obrany“): bránící skupina při 45 %
  ztrát uteče do lesa bez zásob; kdo nemůže (ranění, obklíčení), vzdá se.
- **Přítomný hráč** dostane upozornění a smí velet sám (Martin 3. 11. 2026): postoj po skupinách
  domů, útěk, vlastní výpad – svého muže řídí živě, ostatní rozkazem; bod zlomu platí vždy.
- **Ves během nájezdu nepracuje** – dokud je cizí vojsko na mapě, lidé mimo les a útočiště se
  skrývají – ztracené dny práce (návrh Clauda).
- **Ochrana pánem:** muži, které pán poslal vazalovi na žádost ([vazalství](vassalage.md) –
  Ochrana vojskem), se brání s vsí podle jejího postoje. Návrh Clauda: stojí u dvorce (prvního
  obydlí) jako muži rodu s lukem, s jeho skupinou domů jdou do útočiště, do lesa nebo se vzdají;
  „posledním mužem rodu doma“ nejsou (doma nejsou). Padlí zemřou doma bez pohřbu (muž rodu =
  nástupnictví), zajatí jdou k útočníkovi jako muži rodu, obojí ochranu ve vsi ukončí; ranění
  zůstanou hosty a léčí se ve chráněné vsi.
- **Muži ze svolání:** muži, které do vsi přivedli vazalové na svolání a kteří tam čekají, se s ní
  při útoku brání podle jejího postoje stejně jako muži z ochrany (Martin 7. 11. 2026: „ano,
  samozřejmě“); ti, kdo už odešli s tažením, jsou na tažení a nebrání.
- **Ohlášení průchodu z panelu války** (návrh Clauda): mapy = trasa od sídla rodu k sídlu
  nepřítele (nejvýš 24 map), den = dnes – vojsko smí vyrazit hned.

## Vzdaní, zajetí a výkupné

- **Vzdaní:** útočník u vzdaného domu vybere **pobít**, **odvést** do své vsi (Martin 18. 10.),
  nebo **nechat být** – vezme jen kořist (Martin 2. 11. 2026 – „Ano“).
- **Muži rodu se vzdávají** – Martin 2. 11. 2026: „**muži a chlapci rodu mají velkou
  pravděpodobnost vzdání se, pokud považují svou situaci za bezvýchodnou. Cílem útočníka je
  nepřátelského šlechtice spíš zajmout než zabít, protože za něj může požadovat výkupné**“
  (nahrazuje „muži rodu se nevzdávají“). Bezvýchodná situace (návrh Clauda): jeho skupina se
  vzdala, nebo je raněný či pěšky obklíčený a útočník je blíž než les – pak se vzdá
  s pravděpodobností **80 %** (los ze seedu); jezdec s volnou cestou uteče. U vzdaného šlechtice
  volí útočník stejně – **zajmout** (odvést), pobít, nechat.
- **Výkupné** (Martin 2. 11. 2026 – „ok“): zajatý šlechtic žije ve **dvorci věznitele** (jí z jeho
  zásob, nepracuje, necvičí – návrh Clauda); věznitel pošle rodu zajatce **požadavek** stejným
  jednáním jako u vazalství (zboží, lidé, i vazalství); přijetí / odmítnutí / protinávrh; po
  zaplacení **propuštění** – zajatec jde domů mapu po mapě (návrh Clauda). Nezaplatí-li rod,
  věznitel smí zajatce **držet**, **propustit**, nebo **popravit** – kronika věcně.
- **Zajatý hráčův muž** (Martin 2. 11. 2026 – „ok“): hráč dál řídí své vsi (formální správce –
  syn, [vazalství](vassalage.md) – Správce a tři role) a jedná o výkupném; nevede vojsko ani
  necestuje, dokud zajetí neskončí; poprava = smrt, rozhodne nástupnictví
  ([seniorát](seniorate.md)).

## Ztráty

- **Padlí** chybí natrvalo; ves může zchudnout až k hladu a vymření (Martin 18. 10.). Padlí
  obránci se pohřbí na hřbitově vsi jako ostatní mrtví; padlí útočníci zůstanou na cizí mapě.
- **Ranění** (Martin 2. 11. 2026 – „ok“): **60 herních dní** (≈ 1 h 26 min) nepracují ani
  necvičí a **1 z 5** do 30 dní zemře na rány (los ze seedu). Raněný útočník jde s vojskem domů
  a zpomalí ho – pěší ranění × 0,75, na koni nebo voze ne (návrh Clauda).
- **Padlý muž rodu** – smrt jako každá jiná: nástupnictví podle lord.md a
  [seniorátu](seniorate.md) (padne-li hráčův muž, rozhodne nástupnictví hráče).
- **Poslední muž rodu doma** (Martin 2. 11. 2026 – „Ok“): při nájezdu na vsi rodu **vždy uteče** –
  neklesne pod 10 zdraví, nevzdá se a nezajme se, i když ho řídí hráč (návrh Clauda – jak);
  rod spícímu hráči nájezd nevyhladí. **Na tažení padnout i být zajat smí.** „Posledním“ je muž,
  jehož smrtí by rod skončil ([vojvodova rodina](lord.md) – Konec rodu).
- **Odvedení** (vzdaní) jdou s vojskem a ve vsi vítěze přibudou jako lidé – usadí se do volných
  míst, nebo založí domácnost, až bude dům (Martin 18. 10.; rešerše 6 – Hedčané).

## Kořist

Martin 2. 11. 2026 – „ok“ (podrobnosti návrh Clauda):

- **Jídlo ze zásob** (obilí, luštěniny, maso, sýr) kolik unesou – **25 kg na muže** spolu
  s vlastními zásobami, s koňmi a vozy víc (Pohyb). Z dobyté, vzdané nebo opuštěné skupiny domů
  útočník bere podíl zásob vsi podle podílu lidí skupiny (18. 10.); po včasném útěku jen to, co
  v domech zůstalo, a jámy, které najde.
- **Nehlídaný dobytek a koně** mimo útočiště opevnění – stádo zpomalí návrat na polovinu
  (18. 10.). Zásoby, dobytek a jámy v útočišti, které útočník nedobyl, zůstanou obráncům
  ([fortifications.md](fortifications.md) – Útočiště).
- **Odvedení lidé** a **zajatí šlechtici**.
- Osivo, klády, nástroje a keramika zůstanou; **domy, pole a sady se zatím nepálí** (Později).
- Podrobnosti výpočtu (návrh Clauda, Ú6.10): když se jídlo nevejde do nosnosti, berou ze všech
  druhů ve stejném poměru; raněný kořist nenese; zapečetěné jámy jsou skryté při každém postoji;
  útočiště je dobyté, když v něm někdo bojoval, nebo se vzdal; vzdané útočník bez rozkazu odvede.
  Koně a voli se zatím neberou.

## Konec války – mírové jednání

- Martin 2. 11. 2026: „**Tak válka nemusí být jen ohledně vazalství. Pokud chce napadený jednat
  o míru, mělo by se to zobrazit útočníkovi a měli by si dohodnout podmínky – jednorázový
  poplatek, vazalství, tribut nebo postoupení vesnic**“.
- **Mír nabídne kterákoli strana** stejným jednáním jako vazalství ([vazalství](vassalage.md) –
  Jak jednání probíhá): přijetí / odmítnutí / protinávrh; druhé straně se nabídka ukáže
  v upozornění („Ctibor nabízí mír.“).
- **Podmínky** (smějí se kombinovat a mír smí být i bez podmínek – návrh Clauda):
  - **jednorázový poplatek** – zboží, dobytek, lidé; doprava jako u dávek;
  - **vazalství** s podmínkami ([vazalství](vassalage.md) – Podmínky dohody);
  - **tribut** – opakovaná platba bez vazalství; chodí v ročním dialogu 1. 11. jako dávky
    (návrh Clauda); neplnění se zapíše a řešení je na hráčích;
  - **postoupení vsí** – ves přejde celá (lidé, stavby, pole, zásoby), muži rodu poraženého v ní
    se s rodinami odstěhují do jiné vsi svého rodu, novým držitelem je vítěz a ves dostane jeho
    správce; Martin 2. 11. 2026: „**Pokud rod jinou ves nemá, nebude postoupení vsi v nabídce,
    pouze vazalství**“;
  - **propuštění zajatců** (návrh Clauda).
- **Mír je na dobu neurčitou** – Martin 2. 11. 2026: „**Ne, tohle řešit nebudeme. Mír je na dobu
  neurčitou**“. Žádná lhůta ani podmínka délky; další útok je nová válka a kronika ho zapíše
  věcně.
- **Nikdo se nestane vazalem automaticky**; porážka vsi sama nic nemění – rozhoduje, kolik kdo
  unese (Martin 2. 11. – přijme, odmítne, jedná).
- **Udržení:** kdo tribut nebo dávky neplní, toho smí druhý napadnout znovu; vazal může vypovědět
  (Kdo s kým válčí).

## Spory a rozsudek pána (Martin 2. 11. 2026; zavádí se s válkou)

- Žaloba vazala na jiného pánova vazala → vyjádření → **rozsudek pána** (náhrada zbožím,
  dobytkem, vrácením lidí, mír, nebo zamítnutí) → splnění dialogem (celé, míň, nic); podrobnosti
  ve [vazalství](vassalage.md) – Mír a spory.
- Martin: „**Vyřeší se tím de iure stránka sporu, de facto se bude řešit až následně (sankce,
  válka, atd.)**“ – kdo rozsudek nesplní, zapíše se „Ctibor neposlechl pána“ a pán ho smí
  přinutit k poslušnosti (Kdo s kým válčí). Rozsudek „mír“ válku nezakáže – jen ji zapíše jako
  neposlušnost (návrh Clauda).

## Opevnění

- Martin 2. 11. 2026: „**Typy hrazení bychom asi měli probrat zvlášť, je to dost rozsáhlé
  téma**“ – opevnění je samostatný návrh **[fortifications.md](fortifications.md)**, schválený
  Martinem 3. 11. 2026 („ano“). Zástupná palisáda kolem dvorce, se kterou válka počítala do té
  doby, odpadá.
- **Válka z něj bere** (čísla jen v `FORTIFICATIONS`, válka je neopakuje):
  - ~~**násobek obrany** – obránce uvnitř obvodu proti útočníkovi vně má × 1,5 × násobek úseku~~ –
    nahrazeno 8. 11. 2026 (Martin: „Násobek obrany je píčovina. Ta mechanika musí fungovat
    jinak.“): **hradba jako překážka** – kudy a jak dlouho ji útočník přechází, kdo přes ni koho
    zasáhne, ochoz, souboj u žebříku, únava po valu a obsazení ≈ 5 m na obránce ([fortifications.md](fortifications.md#hradby-a-obrana-8-11-2026));
    útočník uvnitř obvodu bojuje jako u domů;
  - **útočiště** – plocha z obvodu, 10 m² na člověka a 20 m² na kus dobytka; kdo stihne doběhnout
    a vejde se, schová se se zásobami a dobytkem; brány se zavřou, když je první útočník do 30 m;
  - **postoje vsi** platí dál – opevnění je pro všechny tři úkrytem bližším než les; přesila
    ~~u „vzdát se“ se poměří s násobkem opevnění~~ – za opevněním se skupina nevzdá, dokud
    útočník nestojí uvnitř (8. 11. 2026);
  - **prolomení** – útočník projde jen branou, mezerou nebo průlomem; brána plotu hned, brána
    palisády ≈ 3 h a palisáda ≈ 1 den se 4 muži, val útokem do kopce čtvrtinovým tempem; od 8. 11. 2026 i žebříky, oheň, odkopání, podkop a zasypání příkopu;
  - **NPC velitel** útočí na nejslabší místo, nebo silné opevnění nenapadne a vezme, co je venku.
- Průlom zůstane po odchodu vojska ve vsi jako mezera a obyvatelé ho přednostně přestaví;
  nájezdy a cizí vojska spatřená u vsi zvedají **hrozbu**, podle které staví opevnění správce
  ([fortifications.md](fortifications.md) – Správce).

## Varování, poslové a útěk do hradiště (schváleno 9. 11. 2026 – implementace čeká)

Vychází z rešerše, kterou Martin přinesl 9. 11. 2026 (proč slovanské vsi neměly palisádu – útočištěm
kraje bylo hradiště: „Obyvatelé okolních neopevněných vesnic v případě nebezpečí sbalili dobytek,
zásoby a cennosti a utekli do nejbližšího hradiště“).

- **Kdo smí do hradiště:** vlastní vsi pána **i vsi jeho vazalů** – Martin 9. 11. 2026: „I vsi
  vazalů – ochrana je základem středověké společenské smlouvy mezi šlechtou a poddanými“.
- **Varování:** ves se o vojsku dozví, až ho spatří vesničan (Martin 18. 10. 2026) – kdekoli na
  mapě, i v lese; ten pak doběhne do vsi a varuje ji. Martin 9. 11. 2026: „Napadená vesnice může
  klidně stihnout utéct i celá (např. pokud se o nepřátelském vojsku v lese dozví uhlíř, který
  stihne doběhnout do vesnice).“
- **Poslové:** „O vyslání posla rozhoduje hráč nebo správce. Každá vesnice, kterou posel projde, se
  dozví o hrozícím nebezpečí a zařídí se podle toho.“ (Martin 9. 11. 2026)
- **Kam utéct:** „Pak je otázkou, jestli se vesničany pokusí hráč evakuovat do nějaké sousední
  vesnice, či je ukryje někde v lese na mapě.“ (Martin 9. 11. 2026) – volba hráče.
- **Správce za nepřítomného hráče** (návrh Clauda, Martin 9. 11. 2026: „ano platí“): jakmile ves
  vojsko spatří, pošle posla do hradiště pána; lidi evakuuje do hradiště, když tam podle
  vzdálenosti stihnou dojít dřív než vojsko, jinak je ukryje v lese na mapě.
- **Co si vezmou:** Martin 9. 11. 2026: „To rozhodne hráč. Někdy může rozhodnout, ať se evakuují
  jenom lidé (spasí holý život), pokud usoudí, že je dost času, tak nechá lidi vzít vše, co unesou,
  a sehnat dobytek.“ – dvě volby: **jen lidé** (rychle), nebo **lidé s tím, co unesou, a stáda**
  (pomaleji; vozy se spřežením naloží víc – návrh Clauda); co zůstane ve vsi, může nájezdník vzít.
  Správce volí podle času (návrh Clauda): stihnou-li to i se stády, vezmou vše, jinak jen lidé.
- **Pobyt v hradišti** (návrh Clauda, Martin 9. 11. 2026: „Ano“): uprchlíci jedí, co si přinesli,
  pak je živí hradiště ze svých zásob (ochrana je povinnost pána); bydlí v útočišti za hradbou
  hradiště; domů se vrátí, až vojsko odtáhne z jejich mapy – rozhodne hráč, za nepřítomného správce.

**Podrobnosti k provedení (návrh Clauda, Martin 9. 11. 2026 „Ano“ k celku):**

- **Vesničan, který vojsko spatří** (do 150 m od kteréhokoli muže vojska – dohled jako dnes), běží
  do vsi rychlostí běhu (≈ 2× chůze); ves je varovaná, až doběhne. Do té doby lidé pracují dál.
- **Posel** je dospělý muž vsi, běží nejkratší cestou po stezkách (pochodová mřížka jako vojsko,
  ≈ 2× rychleji než pochod vojska) do hradiště pána; každá ves na mapách, kterými proběhne, je
  varovaná. Hradiště pak pošle posly do vsí domény, ke kterým vojsko míří (správce hradiště
  vždy, hráč rozhodne). Posla může vojsko zajmout nebo zabít, když ho má v dohledu.
- **Evakuace** jde jako skupina po stezkách (stáda zpomalí na tempo dobytka); kde ji vojsko dostihne,
  platí pravidla útěku (vzdání, zajetí, kořist) jako v lese. Prázdnou ves nájezdník vyplení
  o to, co v ní zůstalo (zásoby, nesehnaný dobytek); domy zůstanou.
- **Místo v hradišti:** útočiště hradiště (10 m² na člověka, 20 m² na kus dobytka jako útočiště
  vsi); co se nevejde, stojí u hradiště venku (stáda první). Útočí-li vojsko na hradiště, brání ho
  i muži uprchlíků (přidají se k obráncům – obsazenost hradby).
- **Bez hradiště pána** (pán ho nemá, nebo je dál, než se stihne dojít) zbývá les na mapě.
- **NPC rody** dělají totéž přes správce.
- **Rozhraní:** při varování v panelu vsi ikony **Poslat posla**, **Ukrýt v lese**, **Do hradiště –
  jen lidé**, **Do hradiště – se vším** (zašedlé s důvodem, když nejde – „Pán nemá hradiště“,
  „Nestihnou to“ s odhadem času), po útěku **Vrátit se**; ve scéně průvod uprchlíků se stády k okraji
  mapy, na mapě tažení ikona skupiny.

## Co hráč vidí (UI jako 0 A.D.)

- **Horní lišta** (Martin 2. 11. 2026 – „ok, zkusme to“): **zkřížené oštěpy** s počtem válek
  (v míru zašedlé, klik = panel války); v ochranné lhůtě **štít s přesýpacími hodinami**
  a zbývajícími dny.
- **Panel války** (Martin – „ok“): řádek na každý rod ve válce – portrét vojvody, jméno rodu,
  poslední střet (lebka s padlými, klas s kořistí), tlačítko **Nabídnout mír** (jednání);
  **svolání vazalů** ikonou rohu; u vazalů štít s počtem mužů schopných služby (návrh Clauda).
- **Opověď** (návrh Clauda): v panelu „Rod a vazalové“ ([vazalství](vassalage.md)) u rodu
  tlačítko zkřížených oštěpů – požadavek (podmínky jako mír) a vzkaz; zašedlé s důvodem
  u kurzoru: „Ctibor je pod ochranou ještě 3 dny.“, „Jednáte už.“
- **Panel Vojsko** ve dvorci – Martin 2. 11. 2026: „**Tohle by mělo být textové, bez mapy**“
  (výjimka z pravidla „bez popisků“): cíl (ves, rod, směr a počet políček), velitel a zástupce
  (portréty, v popisku boj, luk, jízda a kůň), muži rodu a vazalové, skupiny s rozkazem, vesničané
  po vsích (dobrovolníci zeleně, nucení oranžově), shromaždiště, jídlo a píce (klas, seno, dny),
  nosiči, koně a vozy, **odhad síly** (meč s číslem), odhad cesty ve dnech, ohlášení průchodu.
- **Postoj vsi:** tři ikony v panelu dvorce každé vsi – stěna štítů, bílá vlajka, stromy; popis
  v bublině (Martin 3. 11. 2026).
- **Na mapě s vojskem** (návrh Clauda): hráčův muž se vybírá a řídí jako hrdina v 0 A.D.; nad
  skupinou ikona rozkazu (štít u velitele, zkřížené oštěpy, praporec); u skupiny domů počet
  obránců v dohledu (odhad); po vzdání tři ikony **Pobít / Odvést / Nechat**; rozkaz k útoku na
  chráněnou ves zašedlý s důvodem.
- **Zajatci** (návrh Clauda): v panelu dvorce věznitele portrét s pouty – klik = jednání
  o výkupném, Propustit, Popravit.
- **Upozornění** (Martin – „ok“): „Cizí vojsko u Kněžic!“, „Kněžice poraženy.“, „Ctibor nabízí
  mír.“, „Bořivoj svolává.“, „Ctibor poslal 3 muže.“, „Bořivoj ohlásil průchod.“, „Zajat:
  Ctibor.“; klik otevře panel nebo dialog. Navíc (návrh Clauda): „Bořivoj opověděl válku.“,
  „Výprava se rozpadla.“, „Ochrana končí za 1 den.“
- **Kronika** (Martin 2. 11. 2026 – „ok“): věcné zápisy bez hodnocení do kronik obou rodů –
  „Nájezd Bořivoje z Lhoty na Kněžice bez opovědi: padli 3, raněni 2, odvedeno 5, vzato 400 kg
  obilí a 6 ovcí.“, „Bořivoj ohlásil průchod.“, „Mír s Bořivojem: tribut 200 kg obilí ročně.“

### Ve scéně

Martin 2. 11. 2026 – „ok“ (doplňky návrh Clauda):

- **Vojsko** – muži jako dnešní postavy s **oštěpem, štítem a lukem** z 0 A.D. (licence do
  `LICENSES.md`), muži rodu **na koních**; hloučky podle skupin svižnou chůzí.
- **Boj** – střílejí, srážejí se, padají; padlí leží do konce dne, ranění sedí u domů
  a nepracují.
- **Mlha války** na cizí mapě; vlastní vsi útočník vidí jen na své mapě.
- **Zima** – vojsko venku je v zimě unavené od mrazu, zastavuje se ve vsích (návrh Clauda).
- **Napadená ves** – prázdná pole a pastviny; při včasném útěku lidé se zásobami a stády k lesu;
  odehnané stádo jde s vojskem.
- **Opevnění** – zavřené brány, prolamování (sekery, podhrabání) a průlom podle
  [fortifications.md](fortifications.md) – Ve scéně.

## Čísla (návrh Clauda – do `rules-war.ts`, kde není uvedeno jinak)

| Co                             | Číslo                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ochrana nového rodu            | 7 skutečných dní, končí vlastním útokem nebo opovědí (Martin)                                                                                                                                                                          |
| Ochrana nové vsi               | 5 herních let                                                                                                                                                                                                                          |
| Válka utichne                  | 3 herní roky bez střetu                                                                                                                                                                                                                |
| Tempo vojska                   | ≈ 3–4 m/s skutečného času, 1 km ≈ 4–5 min ≈ 3 herní dny (Martin)                                                                                                                                                                       |
| Terén a náklad                 | les 1/4, cesta a stezka × 1,5, jezdci × 1,5, stádo × 0,5, ranění × 0,75                                                                                                                                                                |
| Mřížka pochodu                 | buňka 10 m; hustý les = les se 3 stromy v okolí 30 × 30 m; brod = mělčina                                                                                                                                                              |
| Takty tažení                   | 4 za sekundu; záměr hráče platí od taktu teď + 2; kontrolní bod po 40                                                                                                                                                                  |
| Zima (1. 12. – konec února)    | sníh × 0,75; venku −3 zdraví a −2 % síly za den, ve vsi +10 a +5 %                                                                                                                                                                     |
| Píce v zimě                    | 6 kg sena na koně denně (horses.md)                                                                                                                                                                                                    |
| Jídlo                          | ≈ 1 kg obilí na muže a den                                                                                                                                                                                                             |
| Nosnost                        | muž 25 kg, kůň bez jezdce 80 kg, dvoukolák 400 kg                                                                                                                                                                                      |
| Dobrovolníci (nábor)           | 30 % + 0,5 % za bod štěstí nad 50, hlad +15 %, vdovská domácnost × 0,5, nejvýš 95 % (návrh Clauda)                                                                                                                                     |
| Dezerce nucených               | 5 % denně, s příbuznými v cíli 15 % (návrh Clauda – výchozí z 18. 10.)                                                                                                                                                                 |
| Hráč mimo tažení               | 1 herní den, pak zástupce, nebo rozpad                                                                                                                                                                                                 |
| NPC velitel                    | ≥ 1,5 × síla obránců (bez násobku – 8. 11.); hradbu při postupu ≤ 1 den (8. 11.); obrat při ztrátě ½ vojska                                                                                                                            |
| Stropy dovedností              | výcvik doma 50, lov 70, válka 100 (Martin)                                                                                                                                                                                             |
| Válka jako výcvik              | den tažení 2 h, den se soubojem 6 h; lov rodu se stropem 70                                                                                                                                                                            |
| Síla vesničana                 | 0,4, nucený × 0,5, štěstí × 0,8–1,1 (Martin 3. 11.)                                                                                                                                                                                    |
| Síla muže rodu                 | 1 + 2 × (boj + luk) ÷ 200 (Martin; průměr návrh Clauda)                                                                                                                                                                                |
| Kůň                            | × (1 + 0,5 × jízda na koni ÷ 100), až × 1,5 (Martin)                                                                                                                                                                                   |
| Zdraví a zásah                 | 100; 10 × síla (násobek obrany zrušen 8. 11.); luk polovina                                                                                                                                                                            |
| Násobek obrany                 | ~~u domu 1,5; za opevněním 1,5 × násobek opevnění~~ – zrušeno 8. 11. i u domu (Martin „a“)                                                                                                                                             |
| Rány                           | zblízka ≈ 2 s, luk ≈ 4 s na 20–60 m                                                                                                                                                                                                    |
| Na nule zdraví                 | padlý / raněný 1 : 1, muž rodu raněný 2 : 3                                                                                                                                                                                            |
| Bod zlomu                      | 30 % v útoku, 45 % v obraně, po skupinách; padlí a ranění ÷ muži                                                                                                                                                                       |
| Vzdát se při přesile           | útočníků víc než 1,5× obránců (Martin), jezdec za dva; za opevněním až s útočníkem uvnitř obvodu (8. 11.)                                                                                                                              |
| Muž rodu v bezvýchodné situaci | vzdá se s pravděpodobností 80 %                                                                                                                                                                                                        |
| Včasný útěk                    | dospělý 25 kg (Martin), dítě 7–15 let 10 kg, dobytek celý                                                                                                                                                                              |
| Nalezení jámy                  | 30 % za jámu po 1 herním dni ve skupině domů                                                                                                                                                                                           |
| Ranění                         | 60 dní bez práce, 1 z 5 zemře (Martin)                                                                                                                                                                                                 |
| Poslední muž rodu doma         | neklesne pod 10 zdraví, vždy uteče (Martin)                                                                                                                                                                                            |
| Doslech rozkazu                | 30 m                                                                                                                                                                                                                                   |
| Dosah zblízka                  | 3 m – oštěp a sekera dosáhnou přes plot, ~~i přes palisádu~~ přes palisádu ne (Martin 8. 11.)                                                                                                                                          |
| Zda rána padne                 | zblízka los 1 : 1 každé rány (návrh Clauda); na dálku kruh rozptylu `(2 − 1,5 × dovednost ÷ 100) × vzdálenost ÷ 30` m, šance = viditelné plochy v kruhu ÷ plocha kruhu, vesničan jako dovednost 20 (Martin 8. 11., čísla návrh Clauda) |
| Dohled v lese                  | 50 m (jinak ≈ 150 m; návrh Clauda)                                                                                                                                                                                                     |
| Varování a útěk do hradiště    | vesničan i posel běží 2× tempem vojska; dostižení do 30 m; hráč volí 1 herní den (344 taktů), pak správce; hradiště do 8 políček, cesta = vzdušná čára × 1,3; doména do 3 políček, nejvýš 4 posly                                      |

Z 18. 10. beze změny: skupina domů 40 m, dohled 150 m, nosnost 25 kg, ochota a dezerce, kovárna
× 1,5, ~~obrana u domu × 1,5~~ (zrušeno 8. 11. 2026), nucený × 0,5 / 0,3, štěstí × 0,8–1,1.

## Pro implementaci (poznámky, ne kód)

- **Předpoklady:** společná mřížka světa a víc hráčů na ní ([vazalství](vassalage.md) – Místo na
  mapě světa), mřížka map ze stěhování, [příbuzenství](kinship.md) pro dobrovolníky, dovednosti
  rodu (lord.md), nová dovednost lov u vesničanů a [opevnění](fortifications.md) (stavba, brány
  v síti cest, ~~násobky~~ obrana hradeb a útočiště).
- **První mechanika ve skutečném čase:** tažení a boj počítá server **po taktech** (např. 4 za
  sekundu) deterministicky ze seedu války a čísla taktu – worker je dopočítává, i když nikdo není
  online; poloha vojska je funkce taktu, klient ji jen kreslí a posílá záměry (pohyb hráčova
  muže, změna rozkazu skupiny), server je ověří (doslech, mlha války, ochrana).
- **Ves a tažení:** než vojsko vstoupí na mapu vsi, ves se dopočítá do toho okamžiku (zámek vsi
  kvůli souběhu web × worker); dny vsi běží dál s příznakem nájezdu a výsledky boje (padlí,
  ranění, odvedení, kořist, útěk, skryté jámy) přicházejí jako **vnější události** s herním
  okamžikem a id – simulace je použije jednou a idempotentně, jako dávku ve vazalství.
- **Pohyb na cizí mapě** jen na vrstvě překážek (les, brody) deterministickou matematikou
  (`det-math.ts`) jako síť cest; na mapě vsi navíc hotové úseky opevnění jako překážka s branami,
  mezerami a průlomy ([fortifications.md](fortifications.md) – Pro implementaci).
- **Opevnění v boji:** tažení dostane při vstupu na mapu opevnění se stavem vsi (obvod, úseky
  a jejich stav, brány); boj bere ~~násobek obrany~~ překážku hradby, ochoz a dosahy (8. 11.
  2026), vstup do útočiště a práci prolomení z
  `domain/village/fortification` – válka čísla opevnění neopakuje. Průlom, zavřené brány
  a signály hrozby (nájezd, spatřené vojsko) jdou do vsi jako vnější události.
- **Use-casy:** `declareWar` (opověď s požadavkem), `offerPeace` / `answerPeace` (jednání
  z vazalství), `announcePassage` / `answerPassage`, `planCampaign` (velitel, zástupce, vsi,
  vazalové, shromaždiště, skupiny, jídlo, cíl), `launchCampaign`, `commandLeader` (pohyb a útok
  hráčova muže), `setGroupOrder`, `stepCampaigns` (takt workeru – pohyb, boj, bod zlomu, rozpad),
  `chooseSurrendered`, `setDefenseStance`, `demandRansom` / `answerRansom`, `decidePrisoner`,
  `sendProtection`, `summonVassals`, `judgeDispute`.
- **DB:** `war` (rody, od, jak začala, stav), `campaign` (velitel, zástupce, skupiny a rozkazy,
  poloha, zásoby, kořist, odvedení, stav), `campaign_member` (muž – zdraví, poloha), `passage`
  (ohlášení a odpověď), `prisoner`; mír, tribut a výkupné jako dohody a jednání z vazalství.
- **Nové části stavu volitelné:** zranění u člověka (do kdy), lov u vesničana, postoj vsi, muži na
  tažení, zajatci ve dvorci, útěk vsi (kde jsou lidé, zásoby a stáda), skryté jámy; starší vsi se
  převedou jednou a idempotentně.
- **Stropy dovedností** (lord.md) mění dnešní vsi: dovednosti nad 70 se při převodu jednou ořežou
  na 70 (nikdo zatím neválčil) a změní se kalibrace lovu ([divoká zvěř](wildlife.md) – Síla
  lovce) (návrh Clauda).
- **Testy:** opověď a přepadení (kronika), ochrana nového rodu a vsi, válka uvnitř stromu
  dovolená, tempo a zima, zásoby a návrat, ohlášený průchod a Nevěřit, souboj a determinismus
  (stejný výsledek po libovolných kouscích), bod zlomu po skupinách, zástupce a rozpad, postoje
  a včasný útěk (25 kg, jámy), útok na opevnění (~~násobek~~ žebříky, oheň, obsazení, útočiště podle plochy, brána palisády
  ≈ 3 h a zeď ≈ 1 den se 4 muži, průlom ve vsi), vzdání mužů rodu a zajetí, výkupné, pojistka
  posledního muže rodu, kořist do nosnosti, mír s podmínkami (poslední ves nejde postoupit),
  svolání (jen muži rodu), ochrana pánem, rozsudek.

## Později

- **NPC vojvodové** jako cíl (Martin 18. 10. – hrají jako hráč; čeká na simulaci sousedů).
- **Obléhání hladem**, hlad v útočišti, ~~zapálení palisády~~ (oheň v návrhu hradeb 8. 11. 2026)
  – [opevnění](fortifications.md), Později.
- **Zbraně, štíty a zbroj** jako věci – „Reálné věci budeme řešit někdy později vlastní mechanikou“
  (Martin 2. 11. 2026).
- **Družina** – vycvičení vesničané v dvorci, živení z dávek (rešerše 4 – Ibrahim).
- Pálení vsí a polí; prodej zajatců kupcům (rešerše 6); útěk a výměna zajatců; sňatek jako mír.
- Noc a menší dohled v boji; vesničané na lovu vysoké zvěře.

## Navazuje

- [Vazalství](vassalage.md) – jednání s podmínkami (mír, výkupné, opověď), vojenská služba
  a svolání, ochrana, vypovězení a neplnění, rozsudek pána, přehled o stromu pod sebou.
- [Vojvodova rodina](lord.md) a [seniorát](seniorate.md) – výcvik a jeho stropy, nástupnictví po
  padlém nebo popraveném.
- [Koně](horses.md) – jízda a výcvik koně v síle jezdce, seno.
- [Divoká zvěř](wildlife.md) – lov rodu a oka vesničanů jako zdroj zkušenosti.
- [Stěhování](migration.md), [obchod](trade.md), [vozy](wagons.md) – mřížka map, zemská stezka,
  náklad.
- [Pohromy](disasters.md) – ochrana nové vsi.
- [Opevnění](fortifications.md) – ~~násobky obrany~~ obrana hradeb (8. 11. 2026), útočiště, brány,
  prolomení, hrozba pro správce.

## Rozhodnutí

| Rozhodnutí                                                                                                                     | Kdo                   |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| Vazalem se stává jednáním; vypovědět smí hned; neplnícího vazala pán přinutí nebo vypoví                                       | Martin 2. 11.         |
| Válka je vztah dvou rodů, všechny vsi; bez zemského míru; bývalý pán smí táhnout kdykoli                                       | Martin 2. 11.         |
| Opověď smí, nemusí; přepadení bez opovědi bez trestu, jen v kronice                                                            | Martin 2. 11.         |
| Ochrana nového hráče 7 dní, končí vlastním útokem; nájezdy bez omezení                                                         | Martin 2. 11.         |
| Zima: pomalejší pochod, píce; zásoby tažení, bez nich návrat nebo kořist                                                       | Martin 2. 11.         |
| Zima: únava z mrazu místo ležení, zastávky ve vsích, sníh × 0,75; bod zlomu podle počtu mužů                                   | Martin 3. 11.         |
| Vesničan pevná síla 0,4, nucený × 0,5; dovednost lov vesničana se nezavádí                                                     | Martin 3. 11.         |
| Vesničané smějí i do útoku se slabou silou; vazalové ve službě jen muži rodu                                                   | Martin 2. 11.         |
| Vůdce vybere vazaly, vsi a shromaždiště; živě jen tažení vedené hráčovým mužem, jinak NPC                                      | Martin 2. 11.         |
| Zástupce velitele; bez něj se výprava při odchodu hráče nebo smrti velitele rozpadne                                           | Martin 2. 11.         |
| Stropy výcviku 50 / lov 70 / válka; dvě stupnice síly; kůň až × 1,5; výzbroj zatím koeficient                                  | Martin 2. 11.         |
| Tempo ≈ 3–4 m/s, 1 km ≈ 3 dny, táž poloha ve scéně i simulaci; mapu po mapě                                                    | Martin 2. 11.         |
| Boj muž po muži se zdravím; hráč řídí svého muže, ostatní rozkaz před bitvou; skupiny                                          | Martin 2. 11.         |
| Bod zlomu 30 % / 45 % po skupinách; muži rodu utíkají jako ostatní, velitel jen na pokyn                                       | Martin 2. 11.         |
| Včasný útěk s 25 kg a stády do lesa, jámy skryté; útěk při bodu zlomu                                                          | Martin 2. 11.         |
| Muži rodu se v bezvýchodné situaci vzdávají; zajetí a výkupné jednáním; zajatý hráčův muž                                      | Martin 2. 11.         |
| Ranění 60 dní, 1 z 5 zemře; poslední muž rodu doma vždy uteče; kořist                                                          | Martin 2. 11.         |
| Mírové jednání – poplatek, vazalství, tribut, postoupení vsí (poslední ne); mír na dobu neurčitou                              | Martin 2. 11.         |
| Průchod neutrálním územím s ohlášením; útok po něm jen věcně v kronice                                                         | Martin 2.–3. 11.      |
| Postoje dopředu i při obraně: bránit se do bodu zlomu, vzdát se při 1,5×, raději utéct (výchozí)                               | Martin 3. 11.         |
| Opevnění samostatně (`fortifications.md`); horní lišta, panel války, textový panel Vojsko                                      | Martin 2. 11.         |
| ~~Násobky~~, útočiště, brány a prolomení z [opevnění](fortifications.md)                                                       | Martin 3. 11.         |
| Upozornění, kronika věcně, scéna                                                                                               | Martin 2. 11.         |
| Ochrana vojskem na žádost vazala; rozsudek pána řeší spor de iure                                                              | Martin 2. 11.         |
| Dobrovolníci a rozkaz, dům od domu, sevřená ves, pobít nebo odvést, mlha války, les a brody                                    | Martin 18. 10.        |
| Podoba opovědi, začátek války prvním útokem, válka utichne po 3 letech                                                         | návrh Clauda          |
| Ochrana nové vsi 5 let; zrušení dosahu 3 políčka                                                                               | návrh Clauda          |
| Zimní čísla, jídlo 1 kg, nosnost koně a vozu, tempo skupin                                                                     | návrh Clauda          |
| Rozkazy skupin, doslech 30 m, zdraví a zásah, luk, padlý / raněný, 30 % pro tažení                                             | návrh Clauda          |
| Vojenská zkušenost = průměr boje a luku; válka jako výcvik; den lovu se stropem 70                                             | návrh Clauda          |
| Zimní únava −3 zdraví a −2 % síly za den, ve vsi +10 a +5 %; vesničan 0,4                                                      | návrh Clauda          |
| NPC velitel, rozpad, hráč mimo tažení 1 den                                                                                    | návrh Clauda          |
| Ohlášení se vsím předá samo, Nevěřit; vlastní vojska neškodná                                                                  | návrh Clauda          |
| Ohlášení platí jen pro jedno tažení – po návratu domů skončí (Martin 7. 11.); jedna odpověď; svolání: jedno čekající na dohodu | Martin / návrh Clauda |
| Dítě 10 kg, jáma 30 %, bez lesa jako při přesile, posel; vzdání muže rodu 80 %                                                 | návrh Clauda          |
| Tribut v dialogu 1. 11., propuštění zajatců jako podmínka                                                                      | návrh Clauda          |
| ~~Obránce za opevněním × 1,5 × násobek opevnění;~~ zástupnou palisádu nahradil `fortifications.md`                             | návrh Clauda          |
| Násobek obrany za opevněním zrušen – hradba jako překážka (fortifications.md – Hradby a obrana)                                | Martin 8. 11.         |

## Odpovědi Martina 2. 11. 2026

Záznam procházení návrhu bod po bodu 2.–3. 11. 2026 (odpovědi z 3. 11. jsou označené). **Tělo
dokumentu výš je podle nich přepsané (3. 11. 2026)**; při rozporu platí tento záznam.

- **Výzva před válkou:** „Formální vyhlášení či opověď je dobré, ale nikoli nezbytné“ – válka
  smí začít i bez výzvy (přepadení); výzva / opověď je možnost, ne povinnost.
- **Přepadení bez opovědi:** žádný herní trest, ale veřejný zápis do kronik obou rodů „přepadení
  bez opovědi“ – „Jak říkáš“.
- **Ochrana nového hráče:** 7 skutečných dní od registrace, končí dřív, když sám napadne – „ok“.
- **Opakované nájezdy na tutéž ves:** bez omezení – „Kolikrát chce. Ono to válečné tažení jde
  reálně podniknout jen v některé části roku. Zimní tažení sice bude možné, ale extrémně náročné.
  Vojenské tažení také není dílem okamžiku“.
- **Zimní tažení:** „Vojsko jde pomaleji. Musí sebou vézt zásoby píce pro koně. Pokud je tažení
  vícedenní, vojsko potřebuje víc času na ubytování – zatímco v létě může spát pod širákem nebo
  v lehkém přístřešku, v zimě je potřeba postavit na noc bytelnější přístřešky nebo alespoň
  rozdělat hodně ohňů“ – zimní pomalejší pochod, píce (seno) pro koně s sebou, delší večerní
  ležení (méně hodin pochodu za den).
- **Zásoby tažení:** jídlo pro muže (v zimě i seno pro koně) na nosičích, koních nebo vozech; když
  dojde, vojsko se vrátí, nebo si jídlo vezme v napadené vsi jako kořist – „Ano“.
- **Poslední muž rodu doma:** při nájezdu vždy uteče (rod spícímu hráči nájezd nevyhladí); na
  tažení padnout smí – „Ok“.
- **Bývalý pán proti vazalovi, který vypověděl:** smí ho napadnout kdykoli jako kohokoli jiného,
  žádné zvláštní pravidlo; výpověď je v kronice – „Ano smí“.
- **Vesničané v boji:** „Vesničané (muži) mohou mít určité zkušenosti z lovu. Takže ano, lze je
  zapojit do boje, a to i do útočného, ale jejich bojová hodnota bude nevalná“ – muži vesničané
  smějí do obrany i na tažení se slabou silou (zkušenost z lovu; vojenská služba vazala pánovi dál
  jen muži rodu – vazalství).
- **Válka mezi rody:** vztah dvou rodů, platí pro všechny jejich vsi, každou jde přepadnout zvlášť
  – „Ano“.
- **Odkud tažení vyrazí:** „Záleží jak velké tažení podniká. Rozhodne, kteří vazalové půjdou (ze
  kterých vsí) a u které vsi rodu se vojsko shromáždí.“ – vůdce tažení vybere vazaly a vsi,
  odkud muži jdou, a **shromaždiště** u některé vsi svého rodu; odtud vojsko vyrazí.
- **Kdo vojsko vede:** muž rodu, kterého určí hráč (i jeho vlastní muž, syn, bratr); padne-li,
  velení přejde na dalšího muže rodu ve vojsku – „Ano, ale v tom případě nemá na tažení žádný vliv“
  (vede-li tažení jiný muž než hráčův, hráč tažení neřídí – upřesňuje se níž).
- **Řízení tažení:** vede-li tažení jiný muž než hráčův, hráč dá jen rozkaz na začátku (cíl, kdo
  jde, shromaždiště) a dál řídí NPC podle rozkazu; živě (cesty, útok, ústup) řídí hráč jen tažení,
  které vede jeho vlastní muž – „Přesně tak“.
- **Výcvik a zkušenost:** „Muž se cvičením doma může dostat max na 50 % tréninku, pokud loví tak na
  70 % a zbytek zkušeností může získat jedině válkou. To, že zkušenost klesá, když muž necvičí,
  neloví nebo neválčí je dobré. Je však potřeba zohlednit, že musí být rozdíl mezi vesničanem,
  vojvodou vycvičeným na 10 % a vojvodou vycvičeným třeba na 60 %. A to do toho ještě
  nezahrnujeme ani výzbroj a výstroj“ – strop dovedností: výcvik doma 50, lov 70, nad 70 jen
  válka (mění [lord.md](lord.md) – Výcvik, strop dnes 100); síla musí růst s dovedností znatelně;
  výzbroj a výstroj zvlášť.
- **Síla pěšky – dvě stupnice:** vesničan pevně 0,4 (Martin 3. 11.); muž rodu 1 + 2 × vojenská zkušenost ÷ 100 (1–3) – nejslabší muž rodu je nad nejlepším
  vesničanem lovcem („i vojvoda vycvičený na 10 musí být výš, než lovící vesničan“; vesničan 0,4 – Martin 3. 11.); kůň
  a výzbroj zvlášť – „ano“.
- **Kůň:** násobí sílu muže rodu až 1,5× podle jízdy a výcviku koně (zkušenost 60 na dobrém koni
  ≈ 3,3); vesničané na koních nebojují – „ano“.
- **Výzbroj a výstroj:** „Zatím jen koeficient. Reálné věci budeme řešit někdy později vlastní
  mechanikou“ – zůstává násobek za kovárnu (× 1,5 s plným pokrytím), věci Později.
- **Hráč odejde od tažení:** pokračuje NPC podle rozkazu, hráč po návratu převezme velení – „Ano,
  ale v tom případě by měl na začátku určit svého nástupce. Samozřejmě nemusí, ale pokud pak
  odejde nebo umře, výprava se rozpadne a lidé se pokusí vrátit zpátky“ – na začátku tažení hráč
  smí určit **zástupce velitele**; bez něj se výprava při odchodu hráče nebo smrti velitele
  rozpadne a lidé se snaží vrátit domů (mění rozhodnutí 18. 10. „vojsko stojí a po dni se
  vrátí“).
- **Tempo vojska na cizí mapě:** kompromis jako jednotky v 0 A.D. – svižná chůze ≈ 3–4 m/s ve
  skutečném čase, 1 km ≈ 4–5 minut ≈ 3 herní dny; poloha vojska je táž ve scéně i v simulaci
  (výjimka z „Bez časosběru“ – vojáci jdou rychleji než lidé ve vsi) – „Ten kompromis zní dobře“.
- **Boj – kompromis:** „Měl by to být nějaký kompromis. Hráč může ovládat vojvodu a ostatní jeho
  vazalové se budou držet nějakého rozkazu, který dostali před bitvou – typicky držet se vévody
  a bránit ho, nebo agresivně útočit na všechno co se hýbe.“ – hráč řídí živě jen svého muže,
  ostatní muži se řídí **rozkazem před bitvou** (např. držet se velitele a bránit ho / útočit na
  vše); boj tedy probíhá muž po muži ve skutečném čase, ne jedním výpočtem skupiny.
- **Souboj mužů:** každý má zdraví, které v boji ubývá podle síly protivníka; luk na dálku, oštěp
  či sekera zblízka; na nule padlý nebo raněný (los); server počítá deterministicky – „ok“.
- **Rozkazy před bitvou:** držet se velitele a bránit ho, útočit na vše, držet místo (brod, brána);
  rozkaz „ustoupit“ ne – „Ustoupení vynech – když ustoupí velitel, jeho muži spořádaně ustoupí
  s ním. Vojsko by mělo jít rozdělit – tj. např. část dostane rozkaz, že jde s velitelem a část,
  že bude hlídat nějaké místo. K útěku (bod zlomu) by mělo dojít při 30 % ztrátách pokud hráč
  útočí a při 45 % ztrátách, pokud se brání.“ – vojsko jde rozdělit na skupiny s vlastním
  rozkazem; **bod zlomu** (útěk) při ztrátě 30 % v útoku, 45 % v obraně.
- **Bod zlomu po skupinách:** počítá se za každou skupinu zvlášť – „Za každou skupinu zvlášť“.
- **Muži rodu a bod zlomu:** utíkají jako ostatní ve skupině; velitel neuteče sám, ustoupí jen na
  pokyn hráče nebo rozkazu NPC – „Jak navrhuješ“.
- **Útěk obránců – dvě situace:** „vesnice už na začátku, když zjistí, že se u ní objevili útočníci
  (a nebo že k ní směřují) rozhodne, že se radši schová v nejbližším lese – pobere zásoby všechna
  zvířata a schová se v lese. Druhá možnost je, že uteče během obrany“ – **včasný útěk** se
  zásobami a stády do nejbližšího lesa, nebo **útěk při bodu zlomu** během obrany.
- **Co se odnese při včasném útěku:** dospělý 25 kg zásob, dítě méně, dobytek celý; zbytek v domech
  vezme útočník; obilí v zapečetěných jamách zůstane skryté a útočník ho najde jen s určitou
  pravděpodobností – „Tak jak říkáš“.
- **Vzdaní:** útočník u vzdaného domu vybere pobít / odvést / nechat být – „Ano, ale muži a chlapci
  rodu mají velkou pravděpodobnost vzdání se, pokud považují svou situaci za bezvýchodnou. Cílem
  útočníka je nepřátelského šlechtice spíš zajmout než zabít, protože za něj může požadovat
  výkupné“ – muži rodu se v bezvýchodné situaci často vzdají; **zajetí šlechtice a výkupné**
  (nahrazuje „muži rodu se nevzdávají“).
- **Výkupné:** zajatý šlechtic žije ve dvorci věznitele; věznitel pošle rodu zajatce požadavek
  stejným jednáním jako u vazalství (zboží, lidé, i vazalství); přijetí / odmítnutí / protinávrh,
  po zaplacení propuštění; nezaplatí-li, věznitel smí držet, propustit, nebo popravit (kronika) –
  „ok“.
- **Zajatý hráčův muž:** hráč dál řídí své vsi (formální správce – syn) a jedná o výkupném;
  nevede vojsko ani necestuje, dokud zajetí neskončí; poprava = smrt, rozhodne nástupnictví – „ok“.
- **Ranění:** 60 herních dní nepracují ani necvičí, 1 z 5 do 30 dní zemře; raněný útočník jde
  s vojskem domů a zpomalí ho – „ok“.
- **Kořist:** jídlo ze zásob (obilí, luštěniny, maso, sýr) kolik unesou – 25 kg na muže, s vozy
  víc; nehlídaný dobytek a koně mimo palisádu (stádo zpomalí návrat); odvedení lidé; domy, pole
  a sady se zatím nepálí – „ok“.
- **Postoje vsi bez hráče:** do posledního / vzdát se při přesile (útočníků víc než 1,5× obránců) /
  raději utéct (včas do lesa nebo za palisádu se zásobami a stády); výchozí „raději utéct“ – „ok“.
- **Opevnění:** „Typy hrazení bychom asi měli probrat zvlášť, je to dost rozsáhlé téma“ –
  palisáda níž je jen zástupný návrh; opevnění bude samostatný návrh (`fortifications.md`).
- **Konec války – mírové jednání:** „Tak válka nemusí být jen ohledně vazalství. Pokud chce
  napadený jednat o míru, mělo by se to zobrazit útočníkovi a měli by si dohodnout podmínky –
  jednorázový poplatek, vazalství, tribut nebo postoupení vesnic“ – napadený (i útočník) smí
  nabídnout **mír** stejným jednáním; podmínky: jednorázový poplatek, vazalství, tribut
  (opakovaná platba bez vazalství), postoupení vsí; nikdo se nestane vazalem automaticky.
- **Postoupení vsi:** ves přejde celá (lidé, stavby, pole, zásoby), muži rodu poraženého v ní se
  s rodinami odstěhují do jiné vsi svého rodu; novým držitelem je vítěz a ves dostane jeho
  správce – „Pokud rod jinou ves nemá, nebude postoupení vsi v nabídce, pouze vazalství“ –
  poslední ves rodu postoupit nejde.
- **Délka míru:** „Ne, tohle řešit nebudeme. Mír je na dobu neurčitou“ – mír nemá lhůtu ani
  podmínku délky.
- **Horní lišta:** zkřížené oštěpy s počtem válek (v míru zašedlé, klik = panel války); v ochranné
  lhůtě štít s přesýpacími hodinami a zbývajícími dny – „ok, zkusme to“.
- **Panel války:** řádek na každý rod ve válce – portrét vojvody, jméno rodu, poslední střet (lebka
  s padlými, klas s kořistí), tlačítko „Nabídnout mír“ (jednání); svolání vazalů ikonou rohu –
  „ok“.
- **Panel Vojsko:** „Tohle by mělo být textové, bez mapy“ – přípravu tažení (cíl, muži rodu
  a vazalové, skupiny a rozkazy, vesničané, shromaždiště, zástupce, jídlo, odhad síly) panel
  ukáže textově, bez mapy okolí (výjimka z pravidla „bez popisků“).
- **Cesta k cíli:** „Hráč musí k cíli dojít mapu po mapě. Bude tak jednodušší plenit příhraniční
  vesnice a těžší probít se k centru dominia“ – cíl se nevybírá ze seznamu; vojsko jde mapu po
  mapě (směr na okraji jako 18. 10.), mezilehlé mapy se procházejí (ne jen čas cesty).
- **Průchod územím neutrálního rodu:** projít smí; „Neutrálnímu rodu by mělo jít dát vědět, že chci
  táhnout přes jeho území. On se k tomu sice může vyjádřit, ale nic to neznamená. Nicméně však
  nebude překvapen, až se u jeho vesnice objeví cizí vojsko a může dát předem vesnici vědět, že
  vojsko jen prochází a nehrozí jí nebezpečí. Správce tak nezačne vesnici opevňovat ani neuteče
  s vesničany do lesa“ – **ohlášení průchodu** (vzkaz, odpověď nic nezavazuje); ohlášené vojsko
  vsi označí za neškodné, takže se nebrání ani neutíká; bez ohlášení se ves zachová podle postoje;
  zápis „cizí vojsko prošlo“.
- **Útok po ohlášeném průchodu:** hra nezakazuje; „zradil ohlášený průchod – tohle zní úplně
  strašně debilně. Ať se o tom (stejně jako o všem) udělá záznam, ale řešení bude na hráčích“
  (Martin 3. 11. 2026) – jen věcný záznam událostí (ohlášený průchod, útok), žádné hodnoticí
  nálepky; řešení je na hráčích.
- **Postoj „do posledního“ nejde:** „do posledního – to nebude fungovat, lidé v jednu chvíli utečou
  sami od sebe“ (Martin 3. 11. 2026) – postoj se jmenuje **bránit se** a platí do bodu zlomu
  (45 % ztrát v obraně).
- **Postoje – dopředu i při obraně:** postoj se nastaví dopředu u každé vsi (bránit se – stěna
  štítů, vzdát se při přesile – bílá vlajka, raději utéct – stromy; popis v bublině) a ves se podle
  něj zachová, když vesničan spatří cizí vojsko (utéct hned se zásobami a stády / seběhnout se do
  skupin / vzdát se při přesile 1,5×); přítomný hráč dostane upozornění a smí velet sám (postoj po
  skupinách, útěk, vlastní výpad); bod zlomu platí vždy – „ano“ (Martin 3. 11. 2026).
- **Upozornění:** krátké zprávy („Cizí vojsko u Kněžic!“, „Kněžice poraženy.“, „Ctibor nabízí mír.“,
  „Bořivoj svolává.“, „Ctibor poslal 3 muže.“, „Bořivoj ohlásil průchod.“, „Zajat: Ctibor.“), klik
  otevře panel nebo dialog – „ok“.
- **Kronika války:** věcné zápisy bez hodnocení do kronik obou rodů (nájezd s padlými, raněnými,
  odvedenými a kořistí; ohlášený průchod; mír a jeho podmínky) – „ok“.
- **Scéna:** muži jako dnešní postavy s oštěpem, štítem a lukem z 0 A.D., muži rodu na koních;
  hloučky podle skupin svižnou chůzí; v boji střílejí, srážejí se, padají; padlí leží do konce dne,
  ranění sedí u domů; mlha války – „ok“.
- **Lovecká zkušenost vesničana:** „Nebudeme to řešit, všichni vesničané budou mít víceméně stejnou
  (a malou) bojovou hodnotu“ (Martin 3. 11. 2026) – dovednost lov u vesničanů se nezavádí;
  vesničan má pevnou malou sílu (návrh Clauda: 0,4, nucený × 0,5).
- **Zimní noc – bez noci:** Martin 3. 11. 2026: „Středověké vojsko to zpravidla udělalo tak, že se
  snažilo přenocovat v nějaké vesnici. Jen si to nedokážu představit z hlediska herní mechaniky,
  když neuznáváme noc“ → **únava z mrazu**: vojsko v zimě venku každý herní den ztrácí trochu síly
  a zdraví; zastávka ve vsi (vlastní, neutrální, která ho pustí, nebo dobytá) mráz zastaví a muži
  se zotaví; tažení tak vede od vsi ke vsi; sníh zpomalí pochod; zimní ležení ve třetině dne pryč
  – „ano“.
- **Bod zlomu podle počtu mužů** (padlí a ranění ÷ muži skupiny), ne podle síly – „podle počtu“
  (Martin 3. 11. 2026).

## Otázky na Martina

Otevřené od 8. 11. 2026 jsou jen otázky k obraně hradeb – [fortifications.md – Otevřené otázky
k hradbám](fortifications.md#otevřené-otázky-k-hradbám); ~~pro válku je hlavní **otázka 1: zůstane
obráncům u domu násobek × 1,5?**~~ – rozhodnuto 8. 11. 2026 (Martin: „a“): násobek u domu se ruší
také – výhodu obránce nese bod zlomu 45 % proti 30 %, útěk a skryté jámy.

Otázky z 2. 11. 2026 jsou zodpovězené výš; poslední tři (lovecká zkušenost
vesničana, zimní noc, bod zlomu podle počtu mužů) Martin zodpověděl 3. 11. 2026 (viz Odpovědi
výše): vesničan má pevnou sílu, zima = únava z mrazu, bod zlomu podle počtu mužů.
