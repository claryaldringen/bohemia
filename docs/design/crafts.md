# Řemesla – uhlíř, kovář, hrnčíř (a tesař)

Stav: **schváleno 18. 10. 2026 (Martin), implementováno 18. 10. 2026**. Návrh ze 17. 10. 2026 týž
den přepracován podle Martina (řemeslník na plný úvazek, účinky jako meze produktivity) a podle
[rešerše](research/2026-10-17-remesla-drevo-sad.md). Jádro: `packages/game/src/domain/village/crafts.ts`
(výroba, pokrytí, opotřebení, půdorys dílny a milíře), uhlíř v `charcoal.ts`, meze
v `productivity.ts`, čísla v `rules.ts`; co se při implementaci rozhodlo navíc, je v části
[Implementace](#implementace). **Uhlíř z buku** (Martin 18. 10. 2026, [rešerše
uhlířství](research/2026-10-18-charcoal.md)) – část [Uhlíř](#uhlíř--buky-milíř-a-obnova-lesa),
implementováno 18. 10. 2026. **Tesař** (Martin 19. 10. 2026) má vlastní návrh – [vozy a tesař](wagons.md),
shrnutí v části [Tesař](#tesař).

## Proč

Ves, která má nadvýrobu jídla, ji může proměnit v pokrok: uživí řemeslníky, kteří nepracují na
poli, a jejich výrobky zvednou produktivitu celé vsi (Martin). Hráč tak řeší, kdy už je ves
dost silná, aby si řemeslníka dovolila.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** kovář vyrábí železné nástroje a **zvyšuje produktivitu práce celé vsi** (Martin) –
  snižuje pracnost od nejhorší meze k nejlepší.
- **Cíl:** hrnčíř posouvá **produktivitu výroby potravin** – ztráty zásob a denní minimum
  domácností (Martin).
- **Cíl:** uhlíř pálí dřevo na uhlí pro kováře (Martin).
- **Cíl:** řemeslník pracuje v dílně **na plný úvazek**, nikdy na poli – **zbytek vsi musí mít
  nadvýrobu, aby ho uživil** (Martin).
- **Ne-cíl (teď):** obchod (přebytky zatím zůstávají v zásobě – od 18. 10. 2026 je jde vyměnit se
  sousedy po zemské stezce, [trade.md](trade.md)), peníze, horník a doly, další
  řemesla, kvalita výrobků, zbraně, odemykání řemesel podle letopočtu (doba se zatím neřeší –
  Martin).
- **Anti-cíl:** řemeslo jako čisté plus bez ceny – každý řemeslník je o domácnost míň na poli.

## Meze produktivity (Martin)

Martin (17. 10. 2026): „U řemeslníků uvažuj, že svůj job dělají na fulltime. Ta produktivita má
nějaké meze. Bez řemeslníků ber tu nejhorší hranici, s řemeslníky tu nejlepší.“

- Každá práce nebo ztráta, kde literatura dává rozpětí, má **nejhorší mez** (nejvíc člověkodní,
  nejvyšší ztráty – ves bez řemeslníků) a **nejlepší mez** (nejméně člověkodní, nejnižší ztráty –
  plně pokrytá potřeba výrobků řemeslníků). Řemeslníci **zvyšují produktivitu, tedy snižují
  pracnost** od nejhorší meze k nejlepší **lineárně podle pokrytí** 0–1. Kde literatura dává
  jedno číslo, platí obojí (seznam mezí: [pole a jídlo](fields.md) – Meze produktivity).
- **Pokrytí nástroji** = nástroje ve vybavení domácností ÷ potřeba vsi (nejvýš 1 – od 20. 10.
  2026 nástroje nejsou zásoba, ale vybavení, [výrobní řetězy](production-chains.md) – Kovář),
  **pokrytí nádobami** = zásoba keramiky ÷ potřeba (potřeby viz Účinek).
- Bez řemesel (dnes) platí všude nejhorší mez.

## Budovy

Vzhled podle Martina (modely se připravují v `tools/blender/`):

| Budova | Základ      | Navíc                                                     |
| ------ | ----------- | --------------------------------------------------------- |
| Hrnčíř | polozemnice | ještě víc předsazená střecha vpředu, pod ní hrnčířská pec |
| Kovář  | polozemnice | totéž, pod střechou výheň a kovadlina                     |
| Uhlíř  | zemnice     | zelená střecha krytá mechem; milíř stojí u skácených buků |

- **Dílna je zároveň obydlí** (Martin): bydlí v ní domácnost a ta řemeslo provozuje. Stavba
  stojí jako základní obydlí + **30 % navíc** za pec nebo výheň (návrh Clauda), dřevo podle
  [lesa](forest.md) (také + 30 %). **Uhlíř stojí jako zemnice** (návrh Clauda, 20. 10. 2026):
  přirážka byla za milíř u zemnice – milíř je teď samostatná stavba u každé dávky buků a staví ho
  uhlíř z práce milíře ([Milíř u skácených buků](#milíř-u-skácených-buků)). Umisťuje se jako
  obydlí.
- **Kdo se nastěhuje:** stejně jako do nového obydlí – mladý pár z přeplněné domácnosti
  ([populace](population.md)). Prázdná dílna nic nevyrábí (Martin). Dílnu jde postavit i bez rodiny k osídlení (Martin 8. 11. 2026: „A“) – stojí pak
  prázdná, dokud se do ní někdo nenastěhuje (přednost mají dočasně ubytovaní). Když domácnost vymře nebo
  odejde, řemeslo přebírá další, kdo se nastěhuje – řemeslo patří budově. Lidé se stěhují až po
  práci dne, proto dílna v den nastěhování v dílně ještě nepracuje – panel ukáže „Právě se
  nastěhovali – v dílně začnou zítra“ (ne „Prázdná“ – Martin 20. 10. 2026: „Proč mi tesař hlásí, že
  tam nikdo nebydlí, když je tam muž a žena?“).
- **Chátrání a přestavba** jako u základního obydlí; přestavba zachová řemeslo.
- **Varianty rozměrů** jako u obydlí (Martin, GitHub #1: „Toto pravidlo aplikuj i na obydlí
  řemeslníků.“ – [population.md](population.md#varianty-rozměrů)): plocha, poměr stěn a výška
  dílny jiné nejvýš o 10 % podle polohy. Přístřešek s pecí, výhní nebo tesařským pracovištěm se
  podél nenatahuje – jen se posune se štítem (jako šíje), napříč je široký jako dům; místa
  řemeslníků i dým pod ním jdou s ním. Milíř uhlíře je samostatná stavba a variantu nemá (návrh
  Clauda).

## Práce a jídlo

- **Řemeslník pracuje v dílně na plný úvazek, dokud je co dělat** (Martin): dospělí **muži**
  domácnosti dílny dávají řemeslu všechnu svou práci po denním minimu (domácí výroba jde bokem –
  population.md, Práce). Jedí ze společných zásob jako všichni.
- **Kdo dělá řemeslo** (Martin 22. 10. 2026: „Ženy řemeslníků pracují v domácnosti, tj. starají se
  o ni. Nedělají řemeslo. To dělají jen synové. Nelze mít u kovářovy ženy, že kuje, nebo u uhlířovy
  ženy, že kácí buky.“ A upřesnění: „Řemeslo dělá jen řemeslník a jeho synové. Ženy řemeslníků se
  starají o domácnost a k tomu dělají lehčí polní práce se vsí – setí, žně, mlácení zrna,
  v případě potřeby i okopávání motykou. Nekovou, nekácí, neorou, nestaví.“): řemeslo (kování,
  tavba, měch, milíř, kácení pro uhlí, hrnčířství, tesařina) dělá jen řemeslník a jeho synové
  (`craftHands`); měch šlape syn nebo muž z domácnosti, jinak kovář sám pomaleji. Ženy kryjí
  denní minimum domácnosti a **zbytek své práce dávají vsi** (`WorkshopLabor.light`, do kapacity
  vsi v kroku práce) – návrh Clauda: samostatný zásobník lehké práce, který pokryje jen setí,
  okopávání, žně a výmlat (orbu, kácení ani stavby nikdy), ve scéně ho zastanou ženy u těchto prací; praxi v řemesle ženy nezískávají a výkon dílny podle ní neurčují. Domácnost
  bez muže schopného práce (vdova s dětmi) drží dílnu celá, ať nestojí.
- **Řemeslníci na žních** (Martin 24. 10. 2026: „Dílny i vojvodova rodina“): ve **žňový den**
  ([pole](fields.md) – Žně všemi rukama: okna žní a výmlatu červenec–září, dokud je co sklízet
  nebo mlátit) jde řemeslník se syny na žeň a výmlat – jejich práce po denním minimu domácnosti
  (`WorkshopLabor.harvest`) pokryje jen žeň a výmlat, před prací vsi; řemeslo ten den stojí
  (pálící milíř dohoří sám). Co žně nespotřebují, propadne (návrh Clauda). Ženy řemeslníků dál
  domácnost a lehčí práce jako jindy. Mimo žňové dny řemeslo.
- **Volný čas pracují pro ves** (Martin 18. 10. 2026: „Ano, pokud uhlíř a kovář budou mít volný
  čas, ať pracují na poli jako zbytek vesnice.“): když řemeslník nemá v dílně co dělat, jeho
  domácnost ten den pracuje jako ostatní domácnosti – pole, stavby, společná práce vsi (část
  [Podle potřeby](#podle-potřeby-a-volný-čas)).
- ~~Co ves nespotřebuje, zůstane v zásobě – výroba se nezastaví, když je potřeba vsi pokrytá~~ –
  zrušeno (Martin, 18. 10. 2026): řemeslník vyrábí podle potřeby vsi, přebytky prodá až
  finanční systém.
- **Bez vstupu nevyrábí** (Martin): kovář bez uhlí a uhlíř nebo hrnčíř bez dřeva nevyrábějí – jejich
  domácnost má volný čas a pracuje se vsí (výklad Martinova „volného času“ – návrh Clauda;
  dřív práce propadla), dílna hlásí, na co čeká.
- ~~Řemeslník vyrábí do zásoby na 2 roky, pak pracuje ve společné práci vsi~~ – zrušeno, řemeslník
  pracuje na plný úvazek (Martin).

## Výroba

**Strom = velký dospělý strom** (≈ 0,7–1,5 m³ dřeva) – jedna jednotka pro stavby
([les](forest.md)), uhlí i keramiku (Martin – oprava podle rešerše).

- **Uhlíř:** kácí **buky** v nejbližším lese stejně jako stavby ([les](forest.md) – kácení,
  vzdálenost, pařezy, obnova), skládá milíř a pálí – podrobně část [Uhlíř](#uhlíř--buky-milíř-a-obnova-lesa).
  Celkem ≈ **10 kg uhlí za člověkoden** (sedí, konzervativně – FAO 1987), strom dá **≈ 120 kg
  uhlí** (sedí pro velký strom – dřevo : uhlí 4–8 : 1). Když není z čeho kácet, uhlí nevzniká.
- **Kovář:** sbírá bahenní rudu v mokřadech u potoka, taví ji v jednoduché peci a kuje
  (Martin: železo si taví sám, žádný horník ani obchod; koupené železo od sousedů – trade.md –
  bylo krátce ve hře a 19. 10. 2026 ho Martin zrušil: „Nech jen společné suroviny, nezaváděj
  nové.“ – se sousedem jde vyměnit hotové nástroje, ne železo; od 20. 10. 2026 vlastní hřivny –
  [výrobní řetězy](production-chains.md) – Kovář). **1 kg nástrojů = 10 člověkodní
  a 50 kg uhlí** celým řetězem – tavba v redukční peci, překování houby na hřivny a kování
  nástrojů (rozdělení v [Kovář – houba, hřivny a vybavení](#kovář--houba-hřivny-a-vybavení)) (oprava podle rešerše, dřív 4 člověkodny a 30 kg: Crew 1991 – ≈ 25 člověkodní
  a ≈ 100 kg uhlí na 1 kg tyčového železa v malé pravěké peci, Salter ≈ 60 kg uhlí; raně
  středověké pece byly výkonnější). Rudu kope na rudišti v mokřině u potoka – **8 kg rudy na kg
  nástrojů**, uhlí a rudu nosí jeho synové ([Uhlí a ruda kováře](#uhlí-a-ruda-kováře), od 20. 10. 2026; dřívější přirážka +1 % za 10 m nad 100 m od dílny k potoku u kováře zmizela –
  nahradila ji skutečná cesta na rudiště).
- **Hrnčíř:** kope hlínu u potoka, tvaruje a vypaluje nádoby. **1 kg keramiky = 1 člověkoden**
  (nedohledáno, návrh Clauda), topí dřevem z lesa: **1 strom na 500 kg** vypálené keramiky
  (oprava podle rešerše, dřív 400 – tradiční pece spálí 0,8–1,2 kg dřeva na kg keramiky, Adubah
  2025). Hlínu kope na hliništi u potoka a nosí ji v koších, nebo ji přiveze vůz se sedlákem –
  **1,5 kg hlíny na kg keramiky** ([Hlína hrnčíře](#hlína-hrnčíře), od 20. 10. 2026; dřívější
  přirážka +1 % za 10 m nad 100 m od dílny k potoku zmizela – nahradila ji skutečná cesta na
  hliniště).

## Uhlíř – buky, milíř a obnova lesa

Martin (18. 10. 2026): „Uhlíř vyráběl uhlí z buku, takže by měl dělat několik věcí – vybírat
a kácet vhodné stromy, stavět milíř a pálit uhlí, starat se o obnovu lesa, tj. opět sázet mladé
buky. Navíc se mýtina kolem uhlíře bude stále zvětšovat a uhlíř bude muset chodit dál.“ Čísla
z [rešerše uhlířství](research/2026-10-18-charcoal.md).

- **Jen buky** (Martin): uhlíř kácí jen dospělé buky (druh stromu z vrstvy překážek –
  `species.ts`), vždy nejbližší, které nepatří jiné stavbě ani dílně a nejsou posvátné (duby
  a háje se nekácí, stromy u cest nejsou ve vrstvě – nekácí se). Mladý buk z obnovy jde po
  dorůstání znovu do milíře.
- **Milíř = dávka 15 buků** (≈ 18 prm, ≈ 1,8 t uhlí – jako model milíře Ø ≈ 4,6 m; běžné
  milíře 15–25 prm, Albiez 1976, Gronke 2012). Buky dávky se vyberou a vyhradí najednou.
- **Práce po fázích** (rozdělení návrh Clauda, celek drží ≈ 10 kg uhlí na čd):
  1. **kácení a doprava** k milíři – 2 čd na buk + 1 % za 10 m nad 100 m ([les](forest.md)),
  2. **příprava dřeva** (odvětvení, krácení na polena, štípání) – 6 čd na buk,
  3. **stavba milíře** (věnec, polena kolem fíry, kryt z chvojí, drnů a hlíny) – 2 čd na buk,
  4. **pálení** – 8 dní (20 prm ≈ 8 dní, Gronke 2012), milíř se hlídá ve dne i v noci: celá
     práce domácnosti uhlíře,
  5. **vytahání, třídění a odnos uhlí** – 2 čd na buk (120 kg uhlí); vypálený milíř se
     rozebírá postupně, jak kovář uhlí odebírá ([Milíř stojí vždy](#milíř-stojí-vždy),
     [Rovnováha uhlíř – kovář](#rovnováha-uhlíř--kovář)). Rozebraný milíř zmizí a zůstane po
     něm milířiště. **S vozem** (wagons.md – Co vozy vozí; Martin 19. 10. 2026: „Pokud budou mít k dispozici vůz, ať … pro dřevěné uhlí jede vůz.“): když
     ves má vůz, jehož voli dnes neorají a vůz nesváží úrodu, seno ani klády, a vůz k milíři
     dojede (do 12 m – do lesa jen po pevné cestě), odnos v koších (pětina vytahání) nahradí jízdy
     vozu – 300 kg na jízdu; vůz se vezme, jen když je jízda levnější než odnos. Od 20. 10. 2026
     odnos dělá kovářova domácnost a s vozem jede sedlák ([Uhlí a ruda kováře](#uhlí-a-ruda-kováře)).
- ~~**Kde milíř stojí**: leží-li první buk dávky do 150 m od milíře u zemnice, pálí uhlíř doma
  a dřevo dováží, dál staví milíř v lese u prvního buku dávky.~~ – nahrazeno 20. 10. 2026: milíř je
  samostatná stavba u skácených buků ([Milíř u skácených buků](#milíř-u-skácených-buků)).
- **Mýtina roste, uhlíř chodí dál** (Martin): vykácené buky nechají pařezy, další dávka je dál –
  milíř stojí dál od zemnice a přirážka za chůzi roste.
- **Obnova lesa – mladé buky** (Martin; čísla návrh Clauda podle rešerše): na pařez každého
  skáceného buku uhlíř zasadí mladý buk (semenáček z lesa, **0,1 čd** na sazenici + přirážka
  vzdálenosti od zemnice), jen v **oknech výsadby** – jaro (březen–duben) a podzim (září–listopad,
  jako sad). Sazenice je hned mladý stromek a **za 60 let** dospělý buk (dolní mez rešerše
  60–80 let – na pasece nečeká na nálet; pařeziny buku se těžily po 10–40 letech, ale tenčí
  dřevo). Pařez, na který nikdo nezasadí, dorůstá z náletu jako dosud (30 let pařez, za 70 let
  strom – [les](forest.md)).
- ~~**Pálí jen kolik je potřeba** (návrh Clauda, 18. 10. 2026): uhlíř začne nový milíř, jen když
  zásoba uhlí i s rozdělanými milíři nestačí na rok spotřeby kovářů; bez kováře nepálí.~~ –
  nahrazeno 19. 10. 2026: milíř stojí vždy a zásobou uhlí je vypálený milíř
  ([Milíř stojí vždy](#milíř-stojí-vždy)).
- **Kolik buků pro jednoho kováře** (sonda 18. 10. 2026 – ještě s pálením do zásoby na rok,
  skutečná krajina sídla, uhlíř 60 m od lesa): ≈ 18
  buků ročně skácí a zasadí; mýtina (90 % pařezů) roste ≈ 115 m → 190 m za 10 let → 275 m za
  30 let → 345 m za 60 let, lesní milíře od ≈ 7. roku; v 61. roce dospějí první zasazené buky
  a uhlíř se vrátí k dílně (≈ 145 m).

### Milíř stojí vždy

Martin (19. 10. 2026): „Uhlíř: měl by vždy postavit milíř, z hotového milíře by se mělo kouřit
a pak by jej měl rozebírat podle toho, jak mu bude uhlí odebírat kovář.“ Detaily níž jsou návrh
Clauda; čísla v `rules.ts` (`CHARCOAL_KILN`).

- **Milíř stojí vždy** (Martin): uhlíř, který má z čeho pálit (dospělé buky), má vždy svůj
  milíř. Dokud ho nemá postavený, kácí a připravuje buky a staví ho. ~~Uhlíř má **jeden milíř**:
  nový začne, až je starý rozebraný.~~ – nahrazeno 20. 10. 2026: najednou smí stát dva milíře,
  další začne včas podle spotřeby kovářů ([Rovnováha uhlíř – kovář](#rovnováha-uhlíř--kovář)).
  Dřívější pálení do zásoby na rok spotřeby kovářů tím odpadá – zásobou uhlí je vypálený milíř.
- **Kouří jen při pálení** (Martin): postavený milíř se zapálí a 8 dní pálí – celou dobu z něj
  stoupá dým jako z obydlí a uhlíř ho hlídá ve dne i v noci. Vypálený milíř už nekouří.
- **Rozebírá se podle odběru** (Martin): uhlí se z vypáleného milíře nevytahá najednou – milíř
  stojí pod krytem z hlíny a uhlíř z něj bere, jak kovář uhlí spotřebuje. ~~Když uhlí u kováře
  nestačí na dnešní kování, uhlíř ten den vytahá uhlí na 30 dní kování.~~ – nahrazeno 20. 10.
  2026: kovář si drží zásobu a donese dávku na 60 dní
  ([Rovnováha uhlíř – kovář](#rovnováha-uhlíř--kovář)). Práce 2 čd na 120 kg (na buk) bez pětiny
  odnosu v koších – ten od 20. 10. 2026 dělá kovářova domácnost, nebo vůz se sedlákem
  ([Uhlí a ruda kováře](#uhlí-a-ruda-kováře)); s přirážkou za chůzi ze zemnice k milíři. Uhlíř tak vytahá uhlí jednou za čas po celém dni a mezitím jeho domácnost pracuje se
  vsí – domácnost řemeslníka pracuje celý den buď v dílně, nebo se vsí, takže hrst uhlí každý den
  by vsi vzala celou domácnost.
- **Zásoba uhlí vsi** = uhlí ve vypálených milířích + uhlí u kováře (co uhlíř donesl a kovář ještě
  nespálil, uhlí koupené od souseda, zásoba ze starších vsí). Tak ji ukazuje lišta i panel dílny.
- **Rozebraný milíř** (vytahané poslední uhlí) zmizí a zůstane po něm milířiště. ~~**Zbytek
  vytahá včas:** zbývá-li v milíři a u kováře jen tolik uhlí,
  kolik kováři spálí, než uhlíř připraví a vypálí další milíř, vytahá uhlíř zbytek celý ke kováři
  (den po dni, kolik stihne) a začne nový. Spotřeba kovářů = uhlí na nástroje, které ves za rok
  opotřebí, a na to, co chybí do zásoby nástrojů (nejvýš kolik kováři vykovají na plný úvazek),
  doba = práce dávky jako u dosavadního milíře (kácení a dovoz, příprava, stavba, s přirážkou za
  chůzi) při dnešní práci uhlíře + 8 dní pálení. Bez toho kovář na nový milíř čekal (sonda níž:
  12 % dní bez uhlí místo 3 %). U kováře je tak uhlí nejvýš na 30 dní kování z poslední dávky,
  nebo zbytek milíře na dobu přípravy nového (u vsi s jedním kovářem obvykle 100–300 kg).~~ –
  nahrazeno 20. 10. 2026: další milíř začne uhlíř včas, zatímco vypálený se rozebírá
  ([Rovnováha uhlíř – kovář](#rovnováha-uhlíř--kovář)).
- **Bez kováře** (rozhodnutí Clauda): uhlí nikdo neodebírá – vypálený milíř stojí a čeká a uhlíř
  další nestaví, uhlí není kam dát. Proč: uhlí je jen pro kováře, další milíř by zbytečně skácel
  15 buků (mýtina by rostla bez užitku) a domácnost uhlíře je pro ves užitečnější na poli. První
  milíř ale postaví a vypálí i bez kováře (milíř stojí vždy) – kovář, který přijde, má uhlí hned.
  Uhlí ves smí **prodat sousedovi** ([obchod](trade.md) – uhlí je společná surovina): bere se
  napřed u kováře, pak z vypáleného milíře, který se tím rozebírá (vytahají ho nosiči výpravy,
  v práci výpravy); rozebraný milíř uhlíř postaví znovu. Koupené uhlí jde ke kováři.
- **Kdy uhlíř pracuje v dílně:** vyklízí milířiště, kácí a připravuje buky, staví milíř, pálí,
  vytahá uhlí pro kováře (dávka pro kováře) a v okně výsadby sází mladé buky. Jinak – vypálený
  milíř, uhlí ve vsi stačí na cyklus dalšího milíře a rezervu – pracuje se vsí; bez dospělých
  buků, když milíř nemá, taky (čeká na dřevo).
- **Uhlí neubývá** – ani v milíři pod krytem, ani u kováře (jako dosud; opotřebení se týká
  nástrojů a nádob). Ves uhlí u sousedů nekupuje ([Nákup u sousedů](#nákup-u-sousedů) – uhlí je
  jen pro kováře; kovář bez uhlí se nepočítá a ves koupí nástroje).
- **Starší vsi** (převod při prvním dopočítaném dni, jednou): milíř, ze kterého se uhlí zrovna
  vytahovalo, je vypálený milíř s celou dávkou uhlí (rozdělané vytahání se zapomene – to uhlí
  ještě nebylo doma); uhlí v zásobě je uhlí u kováře. Uhlíř, který dřív s plnou zásobou odpočíval,
  začne nový milíř. Převod na samostatné milíře – [Milíř u skácených buků](#milíř-u-skácených-buků).
- **Sonda** (19. 10. 2026, ves z testů na syntetickém bukovém lese, 30 lidí, uhlíř a kovář po
  2 dospělých a dítěti, 20 let – před změnou → po ní): uhlíř pracuje se vsí 81,9 → 83,2 % dní,
  kovář bez uhlí 2,3 → 2,8 % dní, buků ročně 10,1 → 9,3, pokrytí nástroji 0,95 → 0,96, uhlí ve vsi
  na konci 2,1 t → 0,25 t (dřív hromada na rok dopředu, teď jen vypálený milíř).
- **Ve scéně**: příprava dřeva – vytyčený kruh, milířiště a rostoucí hráň polen; stavba po
  fázích staveniště; pálení – hotový milíř s dýmem; vypálený – bez dýmu a trochu sesedlý;
  rozebírání – milíř se zmenšuje podle podílu uhlí, které v něm zbývá (nižší a užší), vedle koše
  na uhlí; rozebraný – černé milířiště, které zarůstá.

### Milíř u skácených buků

Martin (20. 10. 2026), na otázku, jestli má uhlíř začít další milíř dřív (1), nebo si má kovář
držet větší zásobu (2):

> „Šlo by udělat 1. i 2. ? Uhlíř i kovář přece mjsí za ty roky vědět, jaká je nabídka a poptávka
> a dosáhnout tak rovnovážného stavu. Vyčleň milíř jako samostatnou stavbu. Doprava lehkého uhlí
> je jednodušší než těžkého dřeva, navíc ve složitém terénu, takže uhlíř udělá milíř na místě,
> kde na něj skácel buky a k tomu místu pak také přijdou/přijeddou lidé, co jdou pro uhlí. Uhlíř
> bude k milíři chodit ze svého domku“

Tím se mění pravidlo „uhlíř má jeden milíř“ – teď smí stát dva: jeden se rozebírá a druhý se
připravuje nebo pálí ([Rovnováha uhlíř – kovář](#rovnováha-uhlíř--kovář)). Podrobnosti jsou
návrh Clauda (čísla `KILN_SITE` v `rules.ts`).

- **Milíř je samostatná stavba** na místě dávky: uhlíř vybere dávku 15 buků (první buk nejblíž své
  zemnici, dávka = buky nejblíž k němu) a milíř postaví na **rovném volném místě uprostřed nich** –
  od středu dávky po kružnicích po 2 m do 40 m. Místo není na poli, v sadu, na hřbitově, v ohradě,
  na pozemku, na modle ani svatyni, před brankou, aspoň 20 m od domů,
  12 m od jiného milíře, kruh milíře (+ 1 m) ne na pevné cestě (2 m od osy), ne na skalním
  výchozu, pod posvátným dubem ani na háji, ne ve vodě a ne na svahu (rozdíl výšek pod milířem
  jako u obydlí). Když volné místo není, stojí milíř uprostřed dávky (rozhodnutí Clauda).
- **Milíř je vidět z výchozí kamery** (návrh Clauda, 20. 10. 2026 – milíř na místě dávky byl
  celý pod korunami): výchozí kamera stojí na jihu a dívá se šikmo k severu (41° pod vodorovnou),
  takže strom 20 m vysoký zakryje, co je do ≈ 23 m za ním. Místo milíře proto má přednost tam, kde
  v pruhu 6 m na obě strany a **26 m k jihu** za pasekou nestojí dospělý strom ani souš (okraj lesa,
  paseka, louka) – nejbližší takové do **60 m** od středu dávky (buky dávky padnou, buk 60 m daleko
  se k milíři dál nosí za 2 čd). Když takové místo není, nejbližší místo do 40 m s nejmenším počtem
  stromů v pruhu.
- **Milířiště je paseka** – uhlíř ho napřed vyklidí: v kruhu milíře (4,6 m) ostatní stromy, keře,
  kameny a pařezy po kusech jako u staveb, a skácí dospělé stromy a souše, jejichž **koruna
  zasahuje nad milíř nebo do 6 m kolem něj** (koruna 4 m × měřítko stromu, kupa 3 m – kmeny ≈ do
  13 m; 3 čd za strom); buky dávky skácí na milíř, posvátné a vyhrazené stromy nechá. Dospělé
  stromy dají klády na hromadu.
- **Dřevo se netahá daleko:** kácení a doprava od buku k milíři jen pár metrů (2 čd na buk), bez
  dřívější přirážky „milíř v lese daleko od dílny“.
- **Uhlíř chodí k milíři ze zemnice:** za chůzi po pevných cestách s půdou (mokřina, brody –
  `paths/walking.ts`; bez krajiny vzdušně) platí přirážku vzdálenosti (+1 % za 10 m nad 100 m)
  na veškerou práci u milíře – vyklízení, kácení a přípravu, stavbu i vytahání. V síti pěšin vede
  od zemnice k milíři pěšina a ve scéně uhlíř chodí mezi nimi.
- **Pro uhlí se chodí k milíři:** synové kováře nebo kovář nosí uhlí od milíře do kovárny
  ([Uhlí a ruda kováře](#uhlí-a-ruda-kováře)), vůz se sedlákem jede, jen kam k milíři vede vozová
  síť (do lesa jen po pevné cestě), jinak se nosí. K milíři vznikne pěšina z kovárny.
- **Dílna uhlíře je jen zemnice** – bez milířiště, hráně polen a lopaty u domu (model
  `uhlir.glb` bez hromady polen); stojí jako zemnice. Přes milíř se nestaví (`Stojí tu milíř.`).
- **Rozebraný milíř** zmizí a zůstane po něm **milířiště** – černá kruhová plocha uhlíkaté
  zeminy, která za **10 let** zaroste (jako zbytky jam obydlí). Jen vzhled.
- **Starší vsi** (převod jednou, v prvním dopočítaném dni): dnešní milíř u zemnice nebo v lese se
  dodělá a rozebere na svém místě (milíř u zemnice stojí dál kus od ní – MILIR.offset), další
  milíře už stojí u dávky. Milíř dostane id.
- **Co hráč vidí:** klik na milíř nebo milířiště ho vybere; panel ukáže fázi (kácení a příprava
  buků – připravené / v dávce, stavba, pálení, rozebírání – uhlí v milíři / z celého), průběh,
  cestu ze zemnice uhlíře a z kovárny, kdo sem dnes chodí pro uhlí (syn kováře s věkem, kovář,
  vůz se sedlákem), jestli tu dnes pracuje uhlíř, a tlačítko uhlíře (vybere dílnu). Panel dílny
  uhlíře má milíře jako tlačítka. Ve scéně milíř po fázích u skácených buků, černé milířiště
  zarůstá. Ukázky: /dev/panels?panel=milir (milir-stavba, milir-vuz, milirste), /dev/buildings
  – Cyklus milíře.

### Rovnováha uhlíř – kovář

Martin (20. 10. 2026): „Uhlíř i kovář přece mjsí za ty roky vědět, jaká je nabídka a poptávka
a dosáhnout tak rovnovážného stavu.“ Podrobnosti návrh Clauda, čísla `CHARCOAL_BALANCE`
v `rules.ts`.

- **Oba vědí, kolik uhlí se spotřebuje:** spotřeba uhlí kovářů se měří klouzavě za posledních
  **365 dní** (po obdobích 30 dní, ve stavu vsi, jen ve vsi s uhlířem). Měří se poptávka – i uhlí,
  které by kovář spálil, kdyby ho měl. Nová ves (prvních 30 dní) začne odhadem z opotřebení
  nástrojů (`smithsCharcoalPerYear`).
- **Doba cyklu milíře** = průměr posledních **3 cyklů** od výběru buků po vypálení; bez měření
  odhad z práce dávky (vyklizení, kácení, příprava, stavba s přirážkou za chůzi) při dnešní práci
  domácnosti uhlíře + 8 dní pálení.
- **Uhlíř začne další milíř dřív (1):** jakmile uhlí ve vsi (u kováren, ve vypálených milířích
  a v milířích, které se teprve chystají) stačí při spotřebě jen na dobu cyklu + **15 dní**
  rezervy, pustí se do dalšího milíře – i když vypálený ještě stojí. Najednou smí stát **dva
  milíře** (jeden se rozebírá, druhý se připravuje nebo pálí). Když kováři spotřebují méně, uhlíř
  odpočívá a pracuje se vsí.
- **Kovář si drží zásobu (2):** pro uhlí jde, když mu zásoba v kovárně vystačí jen na cestu pro
  uhlí + 15 dní (nebo když nestačí na dnešní kování). Donese dávku na **60 dní** spotřeby (místo
  30 dní na plný úvazek – cest není zbytečně moc), nejvýš kolik v milířích je; od nejstaršího
  vypáleného milíře. Uhlíř ji vytahá den po dni, kolik stihne (`charcoalOrderKg`), kovář nosí, co
  je vytahané. Pálící milíř uhlíř hlídá celý den – ten den se nevytahá (rezerva to pokryje).
- **Bez kováře** se spotřeba nepočítá – uhlí se nevytahá a další milíř se nezačne (první milíř
  stojí vždy).
- **Cíl:** v rovnováze kovář prakticky nečeká (Vlkov – níž).

### Vlkov – milíř u skácených buků

Sonda na čerstvém stavu Vlkova z 12. 2. 801 (uhlíř u lesa, kovář ≈ 270 m od něj se synem, vůz se
spřežením; ve vsi 514 kg uhlí – vypálený milíř u zemnice s 412 kg a 102 kg v kovárně), simulace
dva a tři roky se starým a novým pravidlem:

| Co                                   | dřív (jeden milíř)                | teď (milíř u buků, rovnováha)                                                                      |
| ------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Kovář bez uhlí za 2 roky             | 50 dní (61.–107. a 563.–565. den) | 56 dní (61.–116. den)                                                                              |
| Z toho po náběhu (od prvního milíře) | 3 dny                             | 0                                                                                                  |
| Milíře za 2 roky                     | žádný nový                        | 2 nové (cyklus 116 a 119 dní), dva najednou 189 dní                                                |
| Kde milíře stály                     | u zemnice (9 m)                   | na pasece u buků 95–100 m od zemnice (chůze 90–95 m), 182–242 m od kovárny; z výchozí kamery vidět |
| Uhlíř v dílně / se vsí za 2 roky     | 214 / 516 dní                     | 251 / 479 dní (práce u milíře 123 → 125 čd, navíc paseka)                                          |
| Nošení uhlí za 2 roky                | syn 4,0 čd, vůz 0,2 čd            | syn 2,2 čd, vůz 0,1 čd (dávky na 60 dní)                                                           |

- **Náběh** (56 dní na začátku) dělá stav ze starého pravidla: když se pravidlo změnilo, bylo ve
  vsi jen 514 kg uhlí (≈ 60 dní kování) a nový milíř i s pasekou trvá ≈ 116 dní – kovář čeká na
  první milíř u buků jako dřív. Pak už nečeká nikdy: uhlíř začne další milíř, jakmile uhlí stačí na cyklus
  a 15 dní, a vypálený milíř a rozdělaný stojí najednou.
- **Spotřeba** kovářů Vlkova ≈ 2,6 kg uhlí denně (≈ 70–90 kg za 30 dní; ve dnech čekání se měří
  i nesplněná poptávka) – milíř 1,8 t vydrží ≈ 2 roky, uhlíř tak pracuje v dílně ≈ 18 dní ročně
  víc než dřív (paseka milířiště ≈ 10–15 dní na milíř, uhlí do zásoby o cyklus dopředu).

### Rozhodnutí – milíř a rovnováha

| Rozhodnutí                                                                                         | Kdo                   |
| -------------------------------------------------------------------------------------------------- | --------------------- |
| Uhlíř začne další milíř dřív a kovář si drží zásobu – oba podle nabídky a poptávky                 | Martin (20. 10. 2026) |
| Milíř je samostatná stavba na místě, kde uhlíř skácel buky; pro uhlí se chodí / jezdí k němu       | Martin (20. 10. 2026) |
| Uhlíř chodí k milíři ze svého domku – přirážka za chůzi na veškerou práci u milíře                 | Martin (20. 10. 2026) |
| Najednou smí stát dva milíře (jeden se rozebírá, druhý se připravuje nebo pálí)                    | Martin (20. 10. 2026) |
| Místo milíře: střed dávky, volné rovné místo po kružnicích do 40 m, 20 m od domů, 12 m od milíře   | návrh Clauda          |
| Milířiště je paseka – v kruhu milíře vše, stromy s korunou nad milířem nebo do 6 m kolem po kusech | návrh Clauda          |
| Místo milíře má přednost tam, kde ho z výchozí kamery (od jihu) nezakryjí stromy – do 60 m         | návrh Clauda          |
| Spotřeba klouzavě za 365 dní (poptávka i nesplněná), prvních 30 dní odhad; cyklus z 3 posledních   | návrh Clauda          |
| Další milíř při uhlí na cyklus + 15 dní; kovář pro uhlí při zásobě na cestu + 15 dní, dávka 60 dní | návrh Clauda          |
| Dávku uhlíř vytahá den po dni, kolik stihne; pálící milíř hlídá celý den – ten den nevytahá        | rozhodnutí Clauda     |
| Dílna uhlíře je jen zemnice a stojí jako zemnice (přirážka 30 % byla za milíř u zemnice)           | návrh Clauda          |
| Milířiště po rozebraném milíři – černá zem, zaroste za 10 let (jen vzhled)                         | návrh Clauda          |
| Bez volného místa stojí milíř uprostřed dávky; starší milíř se dodělá na svém místě                | rozhodnutí Clauda     |

## Uhlí a ruda kováře

Martin (20. 10. 2026): „Kovář si vychovává nástupce. Pokud ve vesnici není vůz kovář si musí
chodit pro uhlí k uhlíři. Pokud má dostatečně starého syna nebo syny , pošle pro uhlí jeho/je.
Taky musí někam chodit kopat rudu. To místo, kde kope rudu, chci na mapě vidět. Pokud bude ve
vesnici vůz, tak kováři přiveze uhlí sedlák s vozem (a odečte se jeho práce). To samé u těžení
rudy. Kovář a sedlák s vozem dojedou na místo, kde se ruda těží, kovář (nebo jeho synové) nakopou
rudu a pak s plným vozem přijedou zase do kovárny.“

Na doplňující otázky Martin odpověděl:

- **Nástupce:** synové od určitého věku pomáhají otci, nosí uhlí, kopou rudu a jsou u výhně.
  Kovárnu pak drží nejstarší syn, který zůstane doma – to už řeší dědic domu
  ([příbuzenství](kinship.md)), nic se nemění.
- **Věk:** uhlí nosí synové **od 10 let**, rudu kopou **od 14 let**. Ve dnech, kdy pomáhají,
  nepasou dobytek.

Podrobnosti níž jsou návrh Clauda (čísla `SMITH_SUPPLY` a `CART_JOBS` v `rules.ts`, podle rešerše
[2026-10-20-bog-ore.md](research/2026-10-20-bog-ore.md) – většina čísel je odhad, primární práce
nejsou ověřené).

### Uhlí ke kováři

- **Kdo uhlí odnáší:** uhlíř z vypáleného milíře uhlí vytahá a protřídí (kdy a kolik –
  [Rovnováha uhlíř – kovář](#rovnováha-uhlíř--kovář)), do kovárny ho v koších donese **kovářova
  domácnost** – pro uhlí se chodí k milíři u skácených buků. Pětina dřívější
  práce uhlíře (odnos – `CART_JOBS.charcoal.carryShare`) tím z uhlíře odpadla.
- **Pěšky:** koš uhlí 15 kg (objem – koš ≈ 60 l, dřevěné uhlí ≈ 250 kg/m³), tam a zpět po pevných
  cestách s půdou (mokřina, brody – vzdálenost chůze kovárna ↔ milíř),
  s košem 1 m/s, naložení a složení 2 minuty. Vzdálenost se spočítá při prvním nošení a uloží
  u milíře (`CharcoalKiln.carry`). Uhlí jde do nejbližší kovárny.
- **Kdo nosí:** napřed **synové 10–13 let** (kluci kovářovy domácnosti, jejichž otec nebo matka
  v ní bydlí) – syn ten den nepase (`herdingDay` s ním nepočítá) a udělá 40 % práce dospělého
  (jako pasák); nosí jen tolik synů, kolik je třeba. Co nestačí, donese domácnost z práce dílny –
  synové od 14 let, pak kovář; kovář ten den kove méně.
  - **Rozhodnutí Clauda:** zadání chtělo napřed syny 14–15 let, „kteří už nepasou a nejsou
    dospělí“. Ve hře je ale dospělý každý od 14 let (`AGE.adult`) a pracuje v dílně jako kovář –
    jeho nošení by bylo stejně z práce dílny. Proto napřed synové 10–13 (jejich práce není práce
    vsi ani dílny, jen ten den nepasou) a pak domácnost; synové od 14 let jdou mezi domácností
    první (jsou vidět jako nosiči).
  - Kovář, který ten den pracuje se vsí (plná zásoba nástrojů) a uhlíř mu přesto vytahal zbytek
    milíře: co nedonesou synové, nese domácnost z práce vsi.
- **S vozem:** sedlák s vozem přiveze uhlí z **práce vsi** (Martin – „odečte se jeho práce“) –
  jízda domluvená předem jde jako výpravy po denním minimu, před úlohami dne (`carting`
  v `allocateDay`; ze společné práce by v polních sezónách nejel nikdy a vůz by zbytečně blokoval
  osivo). Přednost vozů (`CART_JOBS.order`) a „vůz jede jen tam, kde ušetří práci“ zůstávají –
  úspora proti nošení kovářovou domácností. Komu vůz uhlí přiveze, nenosí ([vozy](wagons.md) –
  Co vozy vozí).
- **Bez uhlí:** kovář `no-charcoal` jen tehdy, když uhlí není ani v milíři (jako dosud).

### Ruda a rudiště

- **Spotřeba:** **8 kg bahenní rudy na kg nástrojů** (rešerše 4–9 kg – odhad). Ruda leží v kovárně
  (`Workshop.oreKg`); **bez rudy kovář nekove** – kove nejvýš kolik dovolí práce, uhlí i ruda.
- **Kopání, praní a pražení:** **60 kg rudy za člověkoden** (odhad 40–100 kg) a přirážka za chůzi na
  rudiště jako uhlíř k milíři (+1 % za 10 m nad 100 m). Kopou dospělí kovářovy domácnosti a synové
  od 14 let – z práce dílny, před kováním (kope-li se, je dílna „Kope rudu“).
- **Dávky:** když ruda v kovárně nestačí na dnešní kování na plný úvazek, začne kovář dávku **na
  30 dní kování** (`SMITH_SUPPLY.oreBatchDays`; aspoň jeden koš) – vykopanou rudu
  hned nosí v koších po **25 kg** (váha, odhad 20–30 kg) do kovárny. Má-li ves vůz doma a jízda
  k rudišti ušetří práci, kope **na celý dvoukolák** (400 kg – `CARTS.loadKg`) a začne dřív, dokud
  mu ruda vystačí na kopání dávky a 15 dní kování (`CART_JOBS.ore.reserveDays`) – vykopaná ruda
  leží na hromadě u jámy.
- **S vozem** (Martin): kovář (nebo syn od 14) a sedlák s vozem dojedou k hromadě u jámy, naloží ji
  a vrátí se s plným vozem – sedlák z práce vsi (jako u uhlí), kovář z práce dílny, jízda tam
  a zpět i nakládka a složení (15 minut). Vůz jede, jen když jízda obou stojí méně než nošení
  v koších. **Rozhodnutí Clauda:** sedlák nečeká, než kovář nakope – 400 kg je 5–7 dní kopání,
  vůz by se nevyplatil nikdy a Martin by ho nikdy neviděl; ruda se kope napřed a leží na hromadě
  (rešerše: ruda se nechá odtéct a vysušit, praží se u ložiska), vůz pro ni přijede, jakmile je
  dávka vykopaná. Nepřijede-li den po vykopání a kovář nemá rudu na dnešek, donese ji pěšky.
- **Přirážka za rudu u kováře zmizela** – nahradila ji skutečná cesta na rudiště. U hrnčíře od 20. 10. 2026 taky ([Hlína hrnčíře](#hlína-hrnčíře)) – `oreFactor` je pryč.
- **Rudiště:** buňka mokřiny u potoka (`PATH_WETLAND` terénu pěšin – suchá rovina do 3 buněk od
  vody) **nejblíž kovárně** vzdušnou čarou; bez mokřiny suchý břeh (`PATH_WATER_SPOT`); přednost má
  místo na očích mimo les a koruny ([níž](#rudiště-a-hliniště-na-očích)). Ne na poli,
  v sadu, na hřbitově, v ohradě, v lese vsi ani do 12 m od domů (rozhodnutí Clauda – jámy v poli
  by vypadaly divně). Vzdálenost chůze po pevných cestách s půdou krajiny – vede-li tam cesta,
  je kratší. Vybere se při prvním kopání a uloží (`Workshop.oreSite` – poloha, vytěženo, den,
  vzdálenost chůze, jízda vozu). Bez mokřiny i vody nemá kovář kde kopat – `no-ore`, pracuje se
  vsí, upozornění „Kovář nemá rudu“.
- **Ložisko:** vydrží **3 t rudy** (odhad – hutě na Moravě se stěhovaly po 50–70 letech podle
  vyčerpání suroviny a paliva); pak kovář vybere další místo v mokřině **aspoň 20 m** od
  vyčerpaného (`oreSitesUsed`). Vesnický kovář s ≈ 400 kg rudy ročně vydrží na jednom místě
  ≈ 7 let.
- **Jámy:** každá dávka otevře **jámu** kousek kolem místa (do 6 m, poloha ze seedu vsi –
  `VillageState.orePits`: poloha, kolik rudy z ní vzešlo, den posledního kopání). Jámy
  **zarůstají** a po **10 letech** zmizí (jako zbytky jam obydlí).
- **Cesty:** kopání a nošení jde v síti pěšin z kovárny (jen domácnost kováře) – k rudišti
  a k milíři vznikne pěšina; jízdy vozu pro rudu a uhlí jdou do ročního provozu cest (vyjeté
  cesty). Kovář, který jede s vozem, pěšinu nevyšlape.

### Rudiště a hliniště na očích

Martin (20. 10. 2026): „**To místo, kde kope rudu, chci na mapě vidět.**“ Nejbližší mokřina ale
mohla vyjít v lese u potoka pod korunami stromů – jámy shora nebyly vidět. Návrh Clauda
(`DUG_SITE_VIEW` v `rules.ts`, `chooseDugSite`):

- Nové rudiště i hliniště má přednost **mimo les** (`PATH_FOREST` terénu pěšin) a **mimo koruny** –
  žádný dospělý strom do **8 m** od místa (koruna ≈ 4–5 m a jámy kolem místa): stromy vrstvy
  překážek, které dnes stojí (pokácený strom je pařez), stromy u cest i les vsi. Louka, mokřina
  i břeh bez stromů.
- Napřed volná mokřina, pak volný břeh – **nejvýš o polovinu dál** než nejbližší místo (a aspoň
  o 30 m dál). Když volné místo tak blízko není, kope se v lese nebo pod korunou jako dřív.
- Už vybraná místa ve starších vsích se nemění (jsou uložená u dílny) – pravidlo platí až pro
  nové ložisko.

### Starší vsi a ves bez kováře

- Kovárna bez `oreKg` (z doby před rudou) dostane v prvním dni kroku práce zásobu **na jednu dávku**
  (30 dní kování při dnešní práci dílny), aby kovář nepřestal hned kovat; rudiště se vybere až při
  prvním kopání.
- **Ves bez kováře se nemění bit po bitu** (zlatý otisk – test `smith-golden.test.ts`, uhlíř,
  hrnčíř, tesař a vůz se spřežením 2 roky).

### Vlkov – před a po

Sonda na čerstvém stavu Vlkova z 11. 8. 800 (34 lidí, kovář 36 let se synem 11 let, uhlíř ≈ 270 m
od něj s vypáleným milířem, dvoukolák a spřežení), dva roky simulace se starým a novým pravidlem:

- **Rudiště** vyšlo v mokřině u potoka ≈ 520 m vzdušně od kovárny (kovárna je 510 m od vody),
  chůze po cestách **423 m**; za dva roky dvě dávky po 400 kg (jámy).
- **Práce na kg nástrojů:** dřív **14,1 čd** (10 čd × přirážka 1,41 za 510 m k vodě), teď
  **10,3 čd** z práce dílny (kování 10 + kopání 0,25 + nošení rudy a jízda 0,01) + 0,07 čd syna.
  Kovář vykoval za dva roky stejně (≈ 70 kg) – kováním 989 → 706 čd, kopáním 17,6 čd; domácnost
  kováře tak pomáhala vsi o ≈ 130 dní víc. U kováře blízko vody (100–150 m) je to zhruba stejné
  jako dřív (10–10,5 čd na kg).
- **Syn (11 let)** nosil uhlí od milíře 21× (≈ 0,23 čd za dávku, 4,7 čd za dva roky) – ty dny
  nepásl. **Vůz** přivezl uhlí 7× (v zimě a v srpnu, sedlák 0,36 čd), v polních sezónách vozí
  úrodu a orá – tehdy nosí syn. **Ruda vozem** jednou (srpen 801, sedlák a kovář po 0,07 čd);
  první dávku (září 800) donesl kovář pěšky (0,43 čd) – vůz ten den oral ozim.
- **Kovář bez uhlí** 21 → 46 dní za dva roky – kove rychleji (bez přirážky), uhlí z jednoho milíře
  mu vystačí na kratší dobu.

### Co hráč vidí

- **Panel kovárny:** ruda v kovárně (kg), rudiště – cesta z kovárny (m, v bublině kolik rudy
  v ložisku zbývá) a kdo nosí uhlí: syn (věk), kovář sám, nebo vůz se sedlákem; činnosti „Kope
  rudu“ a „Nemá rudu“. Upozornění jen „Kovář nemá rudu“ (jako „Kovář nemá uhlí“).
- **Výběr rudiště** (Martin, 20. 10. 2026: „Půjde rudiště také označit?“): klik na jámy nebo
  hromadu rudy rudiště vybere a obtáhne obrysem kolem jam a hromady; panel dole ukáže portrét
  **Rudiště**, rudu v ložisku (zbývá / 3 000 kg), hromadu vykopané rudy u jámy, počet jam, kovárnu
  (ikona – kliknutím ji vybere), cestu z ní a rudu v ní a kdo tu dnes pracuje – kovář a synové
  s věkem (v bublině kope, nosí, jede s vozem) a vůz se sedlákem. Jámy vyčerpaných ložisek
  k rudišti nepatří a nevybírají se. Ukázka `/dev/panels?panel=rudiste` (i `rudiste-vuz`).
- **Ve scéně:** rudiště – mělké jámy v drnu s valem vykopané hlíny, rezavou stěnou a vodou na dně,
  které léty zarůstají (val se slehne, voda vyschne, zezelenají), u místa hromádka rezavé rudy;
  kopáči u jámy s motykou, nosiči s koši mezi kovárnou a milířem nebo rudištěm (synové jako menší
  postavy) a vůz s hromadou rudy (villagers.md, wagons.md). Ukázka na `/dev/landscape` – tlačítko
  **Rudiště** (pěšky, vůz).

### Rozhodnutí – uhlí a ruda

| Rozhodnutí                                                                                  | Kdo                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Kovář nosí uhlí od uhlíře; má-li syny, pošle je; kope rudu na místě, které je vidět na mapě | Martin (20. 10. 2026)                                                         |
| S vozem přiveze uhlí sedlák (jeho práce se odečte), stejně u rudy – kovář a sedlák s vozem  | Martin (20. 10. 2026)                                                         |
| Synové nosí uhlí od 10 let, rudu kopou od 14 let, ten den nepasou; kovárnu drží dědic domu  | Martin (20. 10. 2026)                                                         |
| 8 kg rudy na kg nástrojů, 60 kg rudy za čd + přirážka za chůzi, koš uhlí 15 kg a rudy 25 kg | návrh Clauda (odhad)                                                          |
| Rudiště: mokřina nejblíž kovárně, ložisko 3 t, další aspoň 20 m, jámy zarostou za 10 let    | návrh Clauda (odhad)                                                          |
| Dávky rudy na 30 dní kování, s vozem na celý dvoukolák (začne dřív, hromada počká 15 dní)   | návrh Clauda                                                                  |
| Napřed synové 10–13 (mimo práci dílny), pak domácnost – 14letí jsou ve hře dospělí          | návrh Clauda, Martin („Jo, souhlasím s tím, jak jsi to navrhl“, 20. 10. 2026) |
| Sedlák z práce vsi před úlohami dne (jako výprava), ne ze společné práce                    | návrh Clauda, Martin („Jo, souhlasím s tím, jak jsi to navrhl“, 20. 10. 2026) |
| Sedlák nečeká na kopání – ruda leží na hromadě u jámy, vůz přijede pro vykopanou dávku      | návrh Clauda, Martin („Jo, souhlasím s tím, jak jsi to navrhl“, 20. 10. 2026) |
| Rudiště ne na poli, v sadu, na hřbitově, v ohradě, v lese vsi ani u domů                    | rozhodnutí Clauda                                                             |
| Přirážka za rudu u kováře zmizela (cesta na rudiště), u hrnčíře zůstává                     | návrh Clauda                                                                  |
| Rudiště jde vybrat – panel s ložiskem, hromadou, jámami, kovárnou a dnešními kopáči         | Martin (20. 10. 2026), podoba panelu návrh Clauda                             |
| Rudiště a hliniště na očích – mimo les a koruny, les jen když volné není o polovinu dál     | Martin („chci na mapě vidět“, 20. 10. 2026), pravidlo návrh Clauda            |

## Hlína hrnčíře

Martin (20. 10. 2026) k návrhu nových nákladů vozů ([vozy](wagons.md) – Co se vozí a na čem):
„**Ano, udělej to jak říkáš**“ – hlína pro hrnčíře od potoka, hrnčíř kope, vůz se sedlákem.
Návrh Clauda: hlínu stejným vzorem jako rudu ([Uhlí a ruda kováře](#uhlí-a-ruda-kováře)) – hlína se
nakope napřed na hromadu u jámy a vůz pro ni přijede; kolik hlíny hrnčíř potřebuje, jde podle
výkonu dílny podle praxe ([Učení řemesla](#učení-řemesla)), jako ostatní výroba. Čísla návrh
Clauda (odhad, `CLAY` v `rules.ts`).

- **Kolik hlíny:** **1,5 kg vlhké hlíny na kg vypálené keramiky** (voda ≈ 20 % a ztráta žíháním,
  čištění od kamínků a kořenů, zmetky při sušení a výpalu). Hrnčíř točí a vypaluje jen z hlíny,
  kterou má u dílny (`Workshop.clayKg`); bez ní stojí.
- **Kopání:** **300 kg hlíny za člověkoden** (hlína se jen vykope a naloží do košů – plavení,
  hnětení a ostřivo jsou v práci hrnčíře 1 čd na kg) a přirážka za chůzi na hliniště jako u rudy
  (+1 % za 10 m nad 100 m). Kopou dospělí hrnčířovy domácnosti a synové od 14 let – z práce
  dílny, před hrnčířstvím (kope-li se, je dílna „Kope hlínu“). Výkon podle praxe kopání
  nezrychluje (jako u rudy) – jen to, kolik hlíny dílna za den spotřebuje.
- **Dávky:** když hlína u dílny nestačí na dnešní hrnčířství na plný úvazek (práce × výkon podle
  praxe ÷ 1 čd na kg × 1,5 kg), začne hrnčíř dávku **na 30 dní hrnčířství** (aspoň jeden koš) –
  vykopanou hlínu hned nosí v koších po **25 kg** do dílny. S vozem doma, když jízda k hliništi
  ušetří práci, kope **na celý dvoukolák** (400 kg) a začne dřív, dokud mu hlína vystačí na
  kopání dávky a 15 dní hrnčířství (`CART_JOBS.clay.reserveDays`) – hlína leží na hromadě u jámy.
- **S vozem:** hrnčíř (nebo syn od 14) a sedlák s vozem dojedou k hromadě u jámy, naloží ji
  a vrátí se – sedlák z práce vsi před úlohami dne (jako u uhlí a rudy), hrnčíř z práce dílny;
  vůz jede, jen když jízda obou stojí méně než nošení v koších. V pořadí jízd mimo svoz po rudě
  (`CART_JOBS.order`: uhlí – ruda – hlína – osivo – voda); jen dvoukolákem.
- **Hliniště:** jako rudiště – mokřina u potoka (bez ní suchý břeh) **nejblíž dílně**, ne na
  poli, v sadu, na hřbitově, v ohradě, v lese vsi ani u domů, a **aspoň 20 m od míst, kde kopou
  jiné dílny** (rudiště a hliniště se nepřekrývají – rozhodnutí Clauda; platí i pro nové rudiště).
  Vydrží **20 t hlíny** (jílové vrstvy u potoka jsou mocné – vesnický hrnčíř s ≈ 300–600 kg
  keramiky ročně vydrží na jednom místě desítky let), pak další aspoň 20 m od vyčerpaného
  (`Workshop.claySite`, `claySitesUsed`). Bez mokřiny i vody – `no-clay`, hrnčíř pracuje se vsí,
  upozornění „Hrnčíř nemá hlínu“. Na očích jako rudiště ([Rudiště a hliniště na
  očích](#rudiště-a-hliniště-na-očích)).
- **Jámy:** každá dávka otevře jámu hlíny kousek kolem hliniště (`VillageState.orePits` s `clay`),
  zarůstá a po 10 letech zmizí jako jámy rudiště.
- **Kód:** rudu i hlínu kope jedna funkce `workDug` (`smith-supply.ts` – `DugMaterial`: zásoba,
  místo, dávka a čísla po surovinách), hrnčíř `workPotter` (`crafts.ts`), vůz `oreCartOffer`
  a `oreCartDrive` s druhem suroviny (`cart-jobs.ts`), jízdy `planCartJobs` (job `clay`).

### Starší vsi – hlína

- Dílna hrnčíře bez `clayKg` (z doby před hlínou) dostane v prvním dni kroku práce zásobu **na
  jednu dávku** (30 dní hrnčířství při dnešní práci a praxi – `migratePotter`), hliniště se vybere
  až při prvním kopání.
- **Hrnčíř se tím mění** – přirážka za vodu daleko zmizela a hlínu kope a nosí. Zlatý otisk vsi bez
  kováře (`smith-golden.test.ts`) proto hrnčíře už nemá; ves bez kováře a hrnčíře vyšla kódem před
  hlínou i s ní stejně.

### Vlkov – hlína

Vlkov hrnčíře nemá; sonda na kopii Vlkova z 19. 1. 801 s přidanou dílnou hrnčíře 25 m od kovárny
(vyučený pár, dva roky): hliniště vyšlo v mokřině ≈ **522 m** chůze od dílny, vůz k němu 741 m po
louce; hrnčíř kopal na celý dvoukolák (2 dávky po 400 kg, 3,8 čd kopání za dva roky), hlínu
přivezl **sedlák s vozem** (2 jízdy, hrnčíř jel s ním), pěšky nenosil nic. Keramika došla na cílovou
zásobu (≈ 270 kg) za ≈ 9 měsíců, pak hrnčíř odpočíval a pomáhal vsi.

### Co hráč vidí – hlína

- **Panel dílny hrnčíře:** hlína v dílně (kg, ikona `resources/clay`), hliniště – cesta z dílny
  (m, v bublině kolik hlíny zbývá), vůz se sedlákem; činnosti „Kope hlínu“ a „Nemá hlínu“.
- **Výběr hliniště** (jako rudiště – návrh Clauda): klik na jámy hlíny nebo hromadu hlíny
  hliniště vybere a obtáhne obrysem; panel ukáže portrét **Hliniště**, hlínu v hliništi (zbývá /
  20 000 kg), hromadu vykopané hlíny u jámy, počet jam, dílnu hrnčíře (ikona – kliknutím ji
  vybere), cestu z ní a hlínu u ní a kdo tu dnes pracuje – hrnčíř a synové s věkem (kope, nosí,
  jede s vozem) a vůz se sedlákem. Jámy rudiště k hliništi nepatří a naopak. Ukázka
  `/dev/panels?panel=hliniste`.
- **Ve scéně:** jámy hliniště jako jámy rudiště, jen se šedookrovou stěnou jílu, a hromada hlíny
  u jámy; kopáči u jámy, nosiči s koši a vůz s hromadou hlíny (`wagon2-clay` – hladké hroudy
  seříznuté rýčem, `tools/blender/wagons_from_0ad.py`).

### Rozhodnutí – hlína

| Rozhodnutí                                                                                     | Kdo                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Hlína pro hrnčíře od potoka – hrnčíř kope, vůz se sedlákem                                     | návrh Clauda, Martin („Ano, udělej to jak říkáš“) |
| Hlína stejným vzorem jako ruda – hromada u jámy, vůz pro ni přijede; potřeba podle praxe dílny | návrh Clauda                                      |
| 1,5 kg hlíny na kg keramiky, 300 kg za čd + přirážka za chůzi, koš 25 kg, hliniště 20 t        | návrh Clauda (odhad)                              |
| Přirážka za vodu daleko u hrnčíře zmizela (cesta na hliniště)                                  | návrh Clauda                                      |
| Rudiště a hliniště aspoň 20 m od míst, kde kopou jiné dílny                                    | rozhodnutí Clauda                                 |
| Hlína jen dvoukolákem, v pořadí jízd po rudě                                                   | rozhodnutí Clauda                                 |
| Hliniště jde vybrat jako rudiště – stejný panel s hlínou a dílnou hrnčíře                      | návrh Clauda                                      |

## Kovář – houba, hřivny a vybavení

Martin (20. 10. 2026): „Kovař si donese/doveze dřevěné uhlí a železnou rudu. Pak vytaví železnou
houbu v redukční peci za pomocí ručního měchadla, houbu překove v železnou hřivnu/hřivny, ze
kterých může vyrábět nástroje nebo mohou jít na obchod.“ – „V liště jenom hřivny“. Celý návrh je
ve [výrobních řetězech](production-chains.md) – Kovář; tady jak to ve vsi běží (čísla `IRON`
v `rules.ts`, rešerše [2026-10-20-production-chains.md](research/2026-10-20-production-chains.md)
– Kovář).

- **Řetěz kovárny** (dnešní cena 10 čd a 50 kg uhlí na kg nástrojů rozdělená – návrh Clauda):
  - **tavba** v redukční peci – 60 % práce a 80 % uhlí: na kg železné houby **3 čd, 20 kg uhlí
    a 4 kg rudy** (výtěžek 25 % rudy),
  - **překování houby na hřivny** – 25 % práce a 15 % uhlí: na kg hřiven **2,08 čd, 6,25 kg uhlí
    a 1,67 kg houby** (0,6 kg hřiven z kg houby),
  - **kování nástrojů z hřiven** – 15 % práce a 5 % uhlí: na kg nástrojů **1,5 čd, 2,5 kg uhlí
    a 1,2 kg hřiven**.
    Celkem jako dřív **8 kg rudy, 10 čd a 50 kg uhlí na kg nástrojů**.
- **Pořadí dne:** kovář napřed kove nástroje z hřiven do vybavení domácností (do potřeby), pak
  překove houbu na hřivny, pak ruda (kopání a nošení – novou dávku jen, když bude tavit) a zbytek
  práce taví. Houba z tavby se překove až další den („tavba trvá den“).
- **Měch:** u tavby šlape měch druhý člověk – **dospělý z domácnosti kováře** (napřed nejmladší;
  jeho práce je v práci dílny), jinak **syn 10–13 let**, který ten den nenosí uhlí – **ten den
  nepase** a v rozdělení práce stojí u kovárny. **Kovář sám taví polovičním tempem** (návrh
  Clauda) – nezastaví se, proto žádné „čeká na měchaře“.
- **Kolik:** vybavení domácností do **potřeby vsi** (3 kg na pracujícího), **hřivny na rok obnovy
  vybavení** (potřeba × 30 % × 1,2 kg) a k nim zakázky kování k vozům (Kování vozů ve
  [vozech](wagons.md)); houba jen na hřivny, které chybí – **přebytky netaví**. Kovárna jde do
  dílny, až chybějící nástroje, hřivny a houba dají **práci aspoň na celý den** dílny – jinak
  domácnost pracuje se vsí (návrh Clauda – vybavení klesne nejvýš o den práce, práce dílny
  nepropadá).
- **Nástroje jsou vybavení domácností** (`toolEquipmentKg`): opotřebí se v užívání 30 % ročně
  jako dřív, pokrytí nástroji = vybavení ÷ potřeba; hřivny pokrytí nedávají. Nákup nástrojů
  u sousedů je přidá do vybavení. Kování vozu bere hřivny – 1,2 kg na kg kování.
- **Stojí bez uhlí nebo rudy:** „Čeká na uhlí“ (`no-charcoal`), a když musí tavit a nemá rudu ani
  kde ji kopat, „Nemá rudu“ (`no-ore`) – s upozorněním jako dřív. S hřivnami nebo houbou kove
  a překovává i bez rudy.
- **Činnost dne** v panelu: krok, na který šlo nejvíc práce – taví (`smelting`), překovává
  (`refining`), kove nástroje (`producing`), kope rudu (`digging`).
- **Rovnováha s uhlířem:** odhad spotřeby kovářů zůstal (5 kg uhlí na čd – průměr řetězu), měří
  se skutečná poptávka (tavba spálí 6,7 kg na čd, kování 1,7 kg).
- **Starší vsi** (návrh Clauda): zásoba nástrojů se při načtení rozdělí do vybavení do potřeby
  vsi, přebytek nad ni na hřivny (kg ÷ 1,2); kovárny pracují dál. Ves bez kováře se nemění (zlaté
  otisky `smith-golden`, `craft-skill-golden` vyšly bit po bitu).
- **Co hráč vidí:** v liště hřivny (ikona sekerovitých hřiven), v panelu kovárny hřivny
  v zásobě, železná houba, hřivny, které kovář drží (rok obnovy a zakázky), nástroje ve vybavení
  domácností s pokrytím potřeby a kdo šlape měch (syn a věk, člen domácnosti, nebo „kovář taví
  sám – polovičním tempem“).
- **Ve scéně** (návrh Clauda): před kovárnou stojí redukční pec – nízká hliněná šachta s ručním
  měchem u paty. Při tavbě z ní šlehá žár a jiskry a stoupá dým, kovář sype rudu a uhlí z koše do
  hrdla a měchař klečí u měchu (sám kovář jen u pece); při překování a kování kove u kovadliny
  a kouří výheň. Vedle pece leží hroudy houby, pod přístřeškem hromádka hřiven – obojí po pár
  stupních podle zásoby. U hrnčíře je před dílnou mělká jáma s hlínou (hladina podle zásoby)
  a kdo vyrábí, hlínu v ní šlape.

## Učení řemesla

Martin (20. 10. 2026): „Každý řemeslník vychovává svého nástupce - syna. Pokud je řemeslník úplně
nový, trvá mu, než se řemeslo naučí“

Platí pro všechna řemesla – hrnčíře, kováře, uhlíře i tesaře. Podrobnosti jsou návrh Clauda
(čísla `CRAFT_SKILL` v `rules.ts`).

- **Praxe** je u člověka v letech (`Person.practice` – po řemeslech, nejvýš 5 let). Dospělý muž
  z domácnosti dílny (14–44 let), který v dílně pracuje, ji získává **za dny, kdy dílna pracuje** –
  ne ve dnech, kdy řemeslník odpočívá a pracuje se vsí (plná zásoba, chybí vstup).
- **Syn řemeslníka** (otec nebo matka v domácnosti dílny – jako synové kováře) se učí **od 10 let**,
  dokud v domácnosti žije: ve dny, kdy dílna pracuje, a u kováře i ve dny, kdy nosí uhlí od milíře,
  i když kovář sám ten den pracuje se vsí. Dcery se řemeslu neučí a ženy z domácnosti dílny praxi nezískávají (od 22. 10. 2026 řemeslo
  dělají jen muži – Kdo dělá řemeslo).
- **Výkon dílny** jde podle **nejzkušenějšího dospělého** z domácnosti, který je doma: **50 %** bez
  praxe, lineárně do **100 % po 5 letech** praxe. Násobí jen práci řemesla, vedle meze nástrojů:
  - kovář – kování (práce na kg nástrojů ÷ výkon), nošení uhlí a kopání rudy ne,
  - hrnčíř – točení a vypalování, kácení dřeva na pec ne,
  - uhlíř – všechnu práci u milíře (příprava, stavba, pálení a rozebírání),
  - tesař – vozy, dřevěné nářadí i vedení party na stavbách (`carpenterWorkFactor` ÷ výkon),
    kácení ne.

  Denní minimum domácnosti ani práce, když řemeslník pracuje se vsí, se nemění.

- **Nový řemeslník:** kdo se nastěhuje do dílny bez praxe – mladý pár do nové dílny, cizí rodina do
  prázdné dílny – začne na 50 %.
- **Nástupce:** syn, který dílnu převezme (dědic domu – [příbuzenství](kinship.md)), má praxi za roky
  učení; po 5 letech učení (od 10 do 15 let, když dílna pracuje) jede naplno hned po otci.
- **Starší vsi** (převod `withCraftSkill`, jednou): dnešní řemeslníci jsou vyučení – dospělí
  a synové od 10 let dílen z doby před učením dostanou praxi za dobu, co domácnost dílnu drží
  (podle kroniky – dostavění dílny nebo nastěhování domácnosti; dílna starší než kronika 5 let),
  nejvýš kolik let jim je přes 10. Dílna z doby před učením do převodu pracuje jako vyučená.
  **Ves bez dílny je beze změny bit po bitu** (zlatý otisk `craft-skill-golden.test.ts`) a ves
  s vyučenými řemeslníky simuluje stejně jako dřív (otisk `smith-golden.test.ts` bez nových polí).

### Vlkov – učení řemesla

Čerstvý stav Vlkova ze 7. 1. 801 (34 lidí): tesař (20 let) má dílnu od 29. 6. 800 – **praxe
0,53 roku, výkon 55 %**; kovář (36 let) a uhlíř jsou vyučení (100 %), kovářův syn (11 let) se učí
(praxe 1 rok). Za dva roky: tesař 2,4 roku praxe (74 %) – třetí vůz dodělal o 8 dní později než
vyučený; syn kováře 2 roky praxe (kovář s plnou zásobou nástrojů často pracuje se vsí, syn se pak
neučí).

### Co hráč vidí – učení

- **Panel dílny:** zkušenost řemeslníka – ikona `skill` (dřevěná palička zkřížená s dlátem)
  a výkon v % (červeně, dokud se řemeslník učí; v bublině praxe v letech), a kdo se učí – syn nebo
  synové (věk; v bublině praxe). Práce za den a výroba za den v panelu už výkon podle praxe
  zahrnují.

### Rozhodnutí – učení řemesla

| Rozhodnutí                                                                                        | Kdo                   |
| ------------------------------------------------------------------------------------------------- | --------------------- |
| Řemeslník vychovává nástupce – syna; nový řemeslník se řemeslo teprve učí                         | Martin (20. 10. 2026) |
| Praxe v letech u člověka; dospělí ji získávají za dny, kdy dílna pracuje                          | návrh Clauda          |
| Syn řemeslníka se učí od 10 let, u kováře i ve dny, kdy nosí uhlí                                 | návrh Clauda          |
| Výkon podle nejzkušenějšího dospělého: 50 % bez praxe, 100 % po 5 letech, lineárně                | návrh Clauda          |
| Výkon násobí výrobu kováře a hrnčíře, práci u milíře a práci tesaře; kácení, nošení a kopání ne   | rozhodnutí Clauda     |
| Učí se jen ve dny, kdy dílna pracuje – u kováře i ve dny nošení uhlí, i když kovář pracuje se vsí | rozhodnutí Clauda     |
| Učí se syn, kterému v dílně bydlí otec nebo matka (jako synové kováře); dcery ne                  | rozhodnutí Clauda     |
| Starší vsi: praxe za dobu, co domácnost dílnu drží (kronika), jinak 5 let                         | rozhodnutí Clauda     |

## Podle potřeby a volný čas

Martin (18. 10. 2026): „Ano, pokud uhlíř a kovář budou mít volný čas, ať pracují na poli jako
zbytek vesnice. Až budeme mít víc vesnic, tak může vyrábět i pro ně – nemusí být kovář v každé
vesnici. A časem, až bude finanční systém, bude přebytky prodávat.“

- **Kovář a hrnčíř vyrábějí do zásoby na rok** (návrh Clauda): zásoba = potřeba vsi a k ní
  opotřebení za rok – nástroje **potřeba × 1,3** (od 20. 10. 2026 jen pro nákup u sousedů – kovář
  drží vybavení na potřebě a rok obnovy v hřivnách, [Kovář – houba, hřivny a
  vybavení](#kovář--houba-hřivny-a-vybavení)), keramika **potřeba × 1,4**. S takovou zásobou
  má ves potřebu pokrytou i po roce opotřebení. Když zásoba dosáhne hranice, řemeslník přestane
  a jeho domácnost pracuje pro ves; jakmile se zásoba opotřebením nebo růstem vsi sníží, vyrábí
  dál. Rozhoduje se na začátku dne ze včerejších zásob.
- **Uhlíř** má vždy milíř a z vypáleného vytahá uhlí, jak ho kovář spotřebuje; další milíř začne
  včas podle spotřeby kovářů (části [Milíř stojí vždy](#milíř-stojí-vždy),
  [Rovnováha uhlíř – kovář](#rovnováha-uhlíř--kovář)) – jinak sází mladé buky, a když není co
  sázet, pracuje pro ves.
- **Volný čas = práce pro ves:** domácnost řemeslníka, který dnes nemá v dílně co dělat (plná
  zásoba, nebo chybí vstup – uhlí, dřevo), pracuje jako ostatní domácnosti – v rozdělení práce
  dne je na poli a na stavbách. Do plánu osevu (k 1. 9.) se řemeslníci nepočítají – ves s nimi
  na polních pracích počítat nemůže, pomáhají navíc.
- **Kolik ves potřebuje a kolik práce řemeslníci vrátí** (sonda: skutečná krajina sídla, 6 domácností
  na poli + kovář, hrnčíř, uhlíř po 2 dospělých a 2 dětech – 36 lidí, 18 pracujících, 20 let):
  nástroje potřeba 54 kg, opotřebení ≈ 16 kg ročně (zásoba drží ≈ 70 kg); keramika 180 kg, rozbije
  se ≈ 72 kg ročně (zásoba ≈ 255 kg); uhlí ≈ 0,8 t ročně (≈ 7 buků). Kovář je v dílně ≈ 42 % dní
  a vsi vrátí ≈ 250 čd ročně, hrnčíř ≈ 19 % dní a vrátí ≈ 350 čd, uhlíř ≈ 24 % dní a vrátí
  ≈ 335 čd – dohromady ≈ 930 čd ročně (≈ 2,5 domácnosti na poli).
- **Do budoucna (Martin, neimplementováno):** až bude víc vsí, kovář (i ostatní řemeslníci) může
  vyrábět i pro ostatní vsi hráče – kovář nemusí být v každé vsi; až bude finanční systém, bude
  přebytky prodávat.

## Účinek

- **Nástroje:** každý pracující (od 14 let) potřebuje **3 kg nástrojů**, nástroje se opotřebují
  o **30 % ročně** (nedohledáno, návrh Clauda; Karlsson 2015: středověká usedlost ztratila ≈ 1 kg
  železa ročně jen opotřebením rádla). **Kovář snižuje pracnost všech prací s mezemi**
  od nejhorší meze k nejlepší podle pokrytí nástroji: polní práce na osetý hektar **205 → 120
  člověkodní**, založení pole na louce 100 → 90, na skutečných křovinách 100 → 60 a v lese
  250 → 150, vracení přílohu 100 → 90 (příloh je pastvina – drn jako louka; nálet ani les na něm
  nebude, Martin 18. 10. 2026). Stavby,
  kácení a domácí výroba mají zatím jedno číslo (rozpětí nedohledáno) – meze se doplní, až se
  najdou.
- **Keramika:** každý člověk potřebuje **5 kg nádob**, ročně se **40 %** rozbije (nedohledáno,
  návrh Clauda). **Hrnčíř posouvá podle pokrytí nádobami ztráty zásob 10 → 5 % ročně a denní
  minimum domácnosti 0,5 → 0,45 člověkodne** (rozpětí návrh Clauda – utěsněné obilní jámy
  ztrácejí málo, Butser; denní minimum 0,5–0,6 dne, FAO); jablka v nádobách vydrží do **1. 5.**
  místo 1. 3. ([sad](orchard.md)).
- ~~Nástroje +30 % ke všem pracím, keramika −15 % spotřeby obilí~~ – zrušeno, účinky jsou meze
  produktivity (Martin); −15 % nemělo oporu – obilí se skladovalo v jamách a sýpkách, ne
  v keramice (rešerše).
- Uhlí samo nic nezlepšuje – je jen pro kováře.

**Pro představu:** ves se 40 pracujícími a 60 lidmi potřebuje ročně ≈ 36 kg nástrojů
(≈ 360 člověkodní kováře, ≈ 1 800 kg uhlí ≈ 180 člověkodní uhlíře a ≈ 15 velkých stromů)
a ≈ 120 kg keramiky (≈ 120 člověkodní hrnčíře, ≈ ¼ stromu). Řemeslnická domácnost dá řemeslu
≈ 300–800 člověkodní ročně podle složení, takže jeden kovář obslouží i větší ves a co
nespotřebuje, jde do zásoby. Malá ves ze dvou domácností ho ale neuživí – a teprve s plně
pokrytými nástroji ušetří na polní práci až ≈ 40 %.

## Tesař

Podrobně [vozy a tesař](wagons.md) (Tesař, Jak je postavené – fáze 1); tady jen, jak zapadá mezi
řemesla (návrh Clauda, 19. 10. 2026):

- **Dílna** jako hrnčíř a kovář – polozemnice s přístřeškem, obydlí + 30 %, zkratka [T].
- **Vstup:** klády z hromady, bez nich si skácí strom sám (jako hrnčíř); nástroje od kováře –
  všechna jeho práce podle pokrytí nástroji (meze 1,5 → 1).
- **Podle potřeby a volný čas** jako kovář a hrnčíř: pomáhá stavbám (dřevěná část práce staveb
  1 → 0,6 podle pokrytí tesařem), vyrábí vozy (dvoukolák na spřežení, se stezkou čtyřkolák)
  a **dřevěné nářadí** do zásoby (4 kg na pracujícího, 30 % ročně, zásoba × 1,3). Odpočívá, jen
  když nemá co vyrábět ani komu pomáhat.
- **Pokrytí dřevěným nářadím** násobí veškerou práci vsi (1 → 0,95) vedle nástrojů kováře.
- V pořadí výroby dne je tesař poslední – jeho pomoc stavbám se rozdělí už před stavbami dne.

## Nákup u sousedů

Martin (19. 10. 2026): „Nástroje ať vesničané obchodují individuálně. Např. pokud ve vedlejší
vesnici kovář je a u nás ne, ať si vesničané od něj koupí nástroje za něco z toho, co vesnice
produkuje. Sami si spočítají, jestli se jim to vyplatí. Až bude kovář u nás, budou pravděpodobněji
nakupovat u něj, protože si ušetří cestu. S ostatními řemesly to bude stejné.“ Detaily níž jsou
návrh Clauda; čísla v `rules.ts` (`CRAFT_BUYING`), rešerše
[2026-10-19-craft-buying.md](research/2026-10-19-craft-buying.md), jádro `craft-buying.ts`.

- **Kdo má řemeslníky:** soused v každém z 8 směrů má řemeslníky podle toho, čím se živí
  ([obchod](trade.md) – druhy sousedů): **řemeslníci** mají kováře, hrnčíře i tesaře **jistě**,
  ostatní **někdy** – obilnáři kováře s pravděpodobností 50 %, hrnčíře 40 %, tesaře 30 %; pastevci
  30 / 40 / 20 %; lesní ves 40 / 20 / 60 % (dřevaři mají tesaře). Deterministicky ze seedu vsi
  a směru. Řemeslníci jsou kolem každé vsi dvakrát, takže každé řemeslo jde koupit.
- **Co ves kupuje:** nástroje (kovář), keramiku (hrnčíř) a dřevěné nářadí (tesař) – výrobky,
  které posouvají meze produktivity. Uhlí ne (je jen pro kováře), vozy zatím ne.
- **Kdy:** jednou za rok **15. 11.** – po sklizni, ozimu, sklizni jablek a porážce, kdy je
  volno a přebytek (Martin: září až listopad). Starší vsi se do té doby nemění.
- **Vlastní řemeslník má přednost:** ves kupuje jen výrobek, na který nemá pracujícího
  řemeslníka – dílna bez obyvatel, nebo bez vstupů (kovář bez uhlí, hrnčíř a tesař bez dřeva) se
  nepočítá. Až kovář ve vsi bude, nákup nástrojů u souseda ustane.
- **Kolik:** jen do zásoby jako řemeslník (`craftTargets` – potřeba a opotřebení za rok), menší
  nákup než 0,5 kg ne.
- **U koho:** u nejbližšího souseda s řemeslníkem – nejméně dní cesty: po hotové **zemské
  stezce** jako výprava (2–6 dní a den za krajem mapy); bez stezky jdou lidé **krajinou rovně ke
  kraji mapy** – cesta o polovinu delší a den navíc. Stejný soused – jedna cesta.
- **Cena:** hodnota výrobku v kg obilí jako v obchodu (nabízené zboží za 0,96 hodnoty –
  nástroje 57,6, keramika 2,88, dřevěné nářadí 1,92 kg obilí za kg). Platí se **tím, co ves
  pěstuje – obilím nebo luštěninami**, nejlevnějším v práci (cena jídla v práci – `foodCosts`,
  i s nošením) a **jen z přebytku nad pojistkou zásob** (co zbude k příští sklizni nad pojistku –
  history/fields-history.md, Osev podle zásob). Bez přebytku ves nekupuje. Obilí na platbu ves vypěstuje znovu –
  u nástrojů už s nimi (cena jídla v práci při pokrytí po nákupu).
- **Cesta:** malá skupina – **polovina dospělých, nejvýš 8** – nese platbu tam a výrobky zpět po
  25 kg na člověka; kdo nese víc, jde vícekrát, ale přes zimu **nejvýš 60 dní** – víc ves koupí
  příští rok (nástroje si tak ves pořizuje po částech). Lidé jsou celé dny pryč – jejich práce
  vsi chybí od prvního dne (jako navrhovaná výprava s předností – [obchod](trade.md), Jak je
  postavené: výprava bez volné práce by stála, nákup jde vždy).
- **Rozhodnutí:** ves porovná práci, kterou výrobek ušetří **za dobu služby** (1 ÷ opotřebení let
  – nástroje a dřevěné nářadí ≈ 3,3 roku, keramika 2,5), s prací za platbu a cestu (lidé × dny tam
  a zpět). Co výrobek ušetří (meze produktivity – Účinek): **nástroje** polní práci dílů v osevu
  a seč (cena jídla v práci při pokrytí před a po), **keramika** ztráty zásob a denní minimum
  domácností, **dřevěné nářadí** práci celé vsi. Kupuje, jen když ušetří víc, než stojí.
- **Pořadí nákupu:** přebytek je jeden, proto ves platí napřed výrobek, který **ušetří nejvíc
  práce na práci, kterou stojí** (poměr ušetřené práce k práci za platbu a cestu), a ostatní pak
  podle toho, co z přebytku zbylo (rozhodnutí Clauda, 19. 10. 2026 – dřív pevné pořadí nástroje →
  keramika → dřevěné nářadí: z malého přebytku ves koupila keramiku, i když dřevěné nářadí by
  ušetřilo několikrát víc).
- **Kronika a upozornění:** „Vesničané koupili nástroje a keramiku u souseda (sever) – zaplatili
  766 kg obilí.“, krátký řádek „Vesničané koupili nástroje u souseda (sever)“ – jen fakt.
- **Rozhraní (jen ikony):** v panelu dvorce řádek výrobků – šipka k sousedovi, u kterého ves
  kupuje (✓ vlastní řemeslník), a nákup na cestě (šipka a dny do návratu); v panelu dílny bez vstupů
  ikona výrobku se šipkou, že ves dokupuje u souseda. Věty jen v popiscích.
- **Ve scéně:** skupina jde jako karavana výpravy ([obchod](trade.md) – Ve scéně) – nosiči
  s platbou tam a s výrobky zpátky, po hotové stezce, jinak rovně krajinou od dvorce ke kraji mapy;
  jde-li vícekrát, karavana jde každou cestu zvlášť.
- **Námět (zatím ne):** nákup u hráčovy vlastní vsi v sousední mapě, když tam řemeslník je –
  simulace jedné vsi o jiných mapách neví (vsi na téže mapě od 1. 11. 2026 nejsou – jedna ves,
  jedna mapa); šlo
  by přidat podobný snímek sousedních map v `updateVillage`. Do té doby simulace počítá i ve směru
  vlastní vsi se sousedem bez simulace.

## Doba (neřeší se)

Rešerše: keramika pražského typu se v 6.–9. století dělala v ruce a pálila na ohništi, dílna
s pecí a hrnčířským kruhem se šíří až v 10.–11. století (Válka 2014). Martin: co předbíhá dobu,
zatím neřešit – letopočet začátku hry se může posunout.

## Co hráč vidí

- V panelu staveb ikony hrnčíře, kováře a uhlíře (tooltip: název a cena); tlačítko je zašedlé
  jen podle surovin (dřevo – [les](forest.md)).
- V horní liště zásoba **hřiven** (ikona + číslo; nástroje jsou vybavení domácností – ukáže je
  panel kovárny; Martin 20. 10. 2026: „V liště jenom hřivny“). Martin 24. 10. 2026: „Z lišty
  odeber uhlí – zobrazuj u uhlíře, keramiku a dřevěné nástroje nemusíš zobrazovat nikde, to si
  řeší každá domácnost sama.“ Uhlí je v panelu uhlíře, keramika a nářadí nikde.
- U vybrané dílny: domácnost, co právě dělá (vyrábí / čeká na uhlí), zásoba výrobku; uhlíř:
  kácí a připravuje buky (kolik z dávky), staví milíř, pálí (průběh), rozebírá milíř a třídí
  uhlí pro kováře (kolik uhlí v milířích zbývá), sází mladé buky, má vypálený milíř a pomáhá vsi;
  milíře jako tlačítka (vyberou milíř) a pařezy, které čekají na sazenici; kovář: kope rudu, ruda
  v kovárně, cesta na rudiště a kdo nosí uhlí ([Uhlí a ruda kováře](#uhlí-a-ruda-kováře)).
- Vybraný milíř nebo milířiště – [Milíř u skácených buků](#milíř-u-skácených-buků).
- Ve scéně: dým z pece a výhně, když se pracuje, a z milíře, když pálí; pařezy a rostoucí mladé
  buky, mýtina kolem uhlíře, milíř u skácených buků po fázích (vypálený se při rozebírání
  zmenšuje), černé milířiště po rozebraném milíři, uhlíř u buků, u milíře, cestou ze zemnice
  a se sazenicemi.

## Implementace

Rozhodnutí kontroléru při implementaci (18. 10. 2026) – kde návrh nechával volnost:

- **Dílna = obydlí s řemeslem** (`Dwelling.workshop`): hrnčíř a kovář polozemnice, uhlíř zemnice.
  Cena **286 člověkodní a 23 stromů** (hrnčíř, kovář) – základní obydlí + 30 %, zaokrouhleno –
  a **60 člověkodní a 7 stromů** (uhlíř – jako zemnice, od 20. 10. 2026; dřív 78 a 9 s milířem
  u zemnice). Umisťuje se volně jako zemnice (bez pozemku); půdorys hrnčíře a kováře je
  o přístřešek (3,2 m) delší vpředu. ~~**Milíř** se staví spolu se zemnicí uhlíře a stojí 9 m
  stranou a 3 m vpřed od ní~~ – od 20. 10. 2026 samostatná stavba u skácených buků
  ([Milíř u skácených buků](#milíř-u-skácených-buků)).
- **Celá domácnost dílny pracuje v dílně** – dospělí (starší kryjí denní minimum domácnosti,
  výrostci pasou – population.md, Práce); po denním minimu (meze podle nádob) dostane řemeslo
  všechno, nikdy pole ani společnou práci. **Opravy dílny platí ves** (jako u ostatních obydlí –
  opravy jdou po stavbách). Do sil vsi pro plán osevu se domácnosti dílen nepočítají.
- **Výroba den po dni** (na kouscích nezávisí): uhlíř a hrnčíř vyberou nejbližší stojící dospělý
  strom, který nepatří jiné stavbě ani dílně a není posvátný (vyhradí ho), skácí ho (2 čd + 1 %
  za 10 m nad 100 m – uhlíř od milíře u dávky, hrnčíř od dílny, zůstane pařez) a teprve pak z něj vyrábějí
  (120 kg uhlí po 10 kg za čd; 500 kg keramiky po 1 čd za kg). Kovář kuje z uhlí ze zásob
  (dílny pracují v pořadí uhlíř → hrnčíř → kovář, dnešní uhlí jde hned do výhně). Vzdálenost
  dílny k vodě (od políčka dílny k nejbližšímu políčku vody) už práci nepřirážkuje – kovář
  i hrnčíř chodí na rudiště a hliniště ([Uhlí a ruda kováře](#uhlí-a-ruda-kováře),
  [Hlína hrnčíře](#hlína-hrnčíře)); bez krajiny je to vzdálenost místa, kde kopou. Uhlí
  neubývá.
- **Opotřebení jen toho, co ves používá**: denně 30 % / 365 nástrojů a 40 % / 365 nádob z toho, co
  je v užívání (nejvýš potřeba) – ves, která potřebu drží pokrytou, ročně nahradí právě 30 % a 40 %
  (40 pracujících ≈ 36 kg nástrojů); přebytek v zásobě leží.
- **Pokrytí se počítá na začátku dne ze včerejších zásob** a platí pro všechny meze dne. Práce
  plánu osevu (polní práce, vracení přílohu) se počítá podle pokrytí v den plánu (1. 9.) a u dílů
  přidaných do plánu v den přidání – na celý hospodářský rok. Založení pole podle pokrytí v den
  zahájení stavby (i cena v nabídce a u kurzoru).
- **Jablka v nádobách poměrně**: den zkažení = 1. 3. + pokrytí nádobami × 61 dní (zaokrouhleno),
  s plným pokrytím 1. 5.; pokrytí se bere den po dni, jablka shnijí, jakmile den zkažení podle
  dnešního pokrytí nastal.
- **Přestavba dílny** zachová řemeslo i typ obydlí (uhlíř se nepřestaví na polozemnici) a stojí
  jako nová dílna (+ 30 %, uhlíř jako zemnice).
- **Rozhraní:** v nabídce staveb hrnčíř [F], kovář [G], uhlíř [H]; v horní liště jen hřivny v kg
  (jen ves s dílnou nebo zásobou). Panel výběru dílny:
  co dělá (vyrábí, kácí, čeká na uhlí, čeká na dřevo, nemá kdo, prázdná), práce za den, zásoba
  výrobku a pokrytí. Upozornění „Kovář nemá uhlí“ a „Dílna nemá co kácet“. Ve scéně model dílny
  po fázích stavby, dým z pece, výhně a milíře, když dílna vyrábí, uhlíř kácí u svého stromu.

## Rozhodnutí

| Rozhodnutí                                                                                               | Kdo                                          |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Uhlíř pálí uhlí pro kováře; kovář dělá nástroje → produktivita práce celé vsi                            | Martin                                       |
| Hrnčíř zvyšuje produktivitu výroby potravin                                                              | Martin                                       |
| Dílna je obydlí, řemeslo provozuje domácnost, která v ní bydlí; prázdná nic nevyrábí                     | Martin                                       |
| Řemeslník nepracuje na poli – ves ho musí uživit z nadvýroby                                             | Martin                                       |
| Kovář si železo taví sám z bahenní rudy, žádný horník ani obchod                                         | Martin                                       |
| Vzhled budov (hrnčíř, kovář, uhlíř s milířem)                                                            | Martin                                       |
| Řemeslník na plný úvazek; přebytek do zásoby, bez vstupu stojí (místo výroby na 2 roky)                  | Martin (17. 10. 2026)                        |
| Účinky jako meze produktivity – bez řemesel nejhorší mez, s plným pokrytím nejlepší (místo +30 / −15 %)  | Martin (17. 10. 2026)                        |
| 1 kg nástrojů = 10 čd a 50 kg uhlí; keramika 1 strom na 500 kg; strom = velký strom                      | Martin – oprava podle rešerše 17. 10. 2026   |
| Hrnčíř: ztráty zásob 10 → 5 %, denní minimum 0,5 → 0,45                                                  | Martin – oprava podle rešerše 17. 10. 2026   |
| Cena dílny +30 %                                                                                         | návrh Clauda                                 |
| Výkony 10 kg uhlí/čd, 120 kg uhlí ze stromu, 1 čd na 1 kg keramiky                                       | návrh Clauda                                 |
| Potřeby: 3 kg nástrojů na pracujícího (−30 %/rok), 5 kg nádob na člověka (−40 %/rok)                     | návrh Clauda                                 |
| Doba (keramika v ruce do 10. st.) se neřeší – letopočet začátku se může posunout                         | Martin (17. 10. 2026)                        |
| Implementační rozhodnutí (milíř, celá domácnost v dílně, opotřebení, jablka poměrně…) – viz Implementace | kontrolér (18. 10. 2026)                     |
| Uhlíř pálí jen buky, staví milíř, sází mladé buky; mýtina roste a chodí dál                              | Martin (18. 10. 2026)                        |
| Milíř = 15 buků; práce: kácení 2, příprava 6, stavba 2, pálení 8 dní, vytahání 2 čd/buk                  | návrh Clauda podle rešerše 18. 10. 2026      |
| ~~Milíř u dílny do 150 m, dál v lese u dávky s přirážkou za chůzi~~ – nahrazeno: milíř u skácených buků  | návrh Clauda podle rešerše 18. 10. 2026      |
| Sazenice buku 0,1 čd v oknech výsadby, dospělá za 60 let                                                 | návrh Clauda podle rešerše 18. 10. 2026      |
| ~~Uhlíř pálí jen do zásoby na rok spotřeby kovářů~~ – nahrazeno: milíř stojí vždy                        | návrh Clauda (18. 10. 2026)                  |
| Řemeslník s volným časem pracuje na poli jako zbytek vsi; vyrábí podle potřeby (místo výroby bez konce)  | Martin (18. 10. 2026)                        |
| Kovář a hrnčíř vyrábějí do zásoby = potřeba + opotřebení za rok (× 1,3 nástroje, × 1,4 keramika)         | návrh Clauda (18. 10. 2026)                  |
| Bez vstupu (uhlí, dřevo) má řemeslník volný čas a pracuje se vsí                                         | návrh Clauda – výklad Martina (18. 10. 2026) |
| Do budoucna: řemeslník vyrábí i pro ostatní vsi hráče, s financemi prodává přebytky                      | Martin (18. 10. 2026)                        |
| Tesař – vozy, dřevěné nářadí, pomoc stavbám (wagons.md)                                                  | Martin (19. 10. 2026)                        |
| Výrobky řemeslníků vesničané kupují u sousedů sami, když se jim to vyplatí; vlastní řemeslník přednost   | Martin (19. 10. 2026)                        |
| Řemeslník vychovává nástupce – syna; nový se řemeslo učí (výkon 50 → 100 % za 5 let praxe)               | Martin (20. 10. 2026)                        |
| Nákup 15. 11., u nejbližšího souseda, platba obilím z přebytku, skupina s předností, doba služby         | návrh Clauda (19. 10. 2026)                  |
| Pořadí nákupu podle poměru ušetřené práce k ceně (z jednoho přebytku)                                    | rozhodnutí Clauda (19. 10. 2026)             |
| Milíř stojí vždy, kouří při pálení, vypálený se rozebírá podle toho, jak kovář uhlí odebírá              | Martin (19. 10. 2026)                        |
| ~~Jeden milíř na uhlíře, nový až po rozebrání; uhlí na 30 dní kování~~ – nahrazeno: rovnováha            | návrh Clauda (19. 10. 2026)                  |
| ~~Zbytek milíře před novým uhlíř vytahá celý~~ – nahrazeno: další milíř začne včas, smí stát dva         | návrh Clauda (19. 10. 2026)                  |
| Bez kováře vypálený milíř čeká, další se nestaví; uhlí z milíře jde prodat sousedovi                     | rozhodnutí Clauda (19. 10. 2026)             |
| ~~Uhlí z milíře ke kováři vozem – odnos (pětina vytahání) nahradí jízdy, posádka z domácnosti uhlíře~~   | návrh Clauda (19. 10. 2026)                  |
| Uhlí a ruda kováře – synové, rudiště, vůz se sedlákem (podrobně v části Uhlí a ruda kováře)              | Martin (20. 10. 2026)                        |
| Milíř u skácených buků a rovnováha uhlíř – kovář (podrobně v částech Milíř u skácených buků, Rovnováha)  | Martin (20. 10. 2026)                        |
| Kovář taví houbu, překove na hřivny, kove nástroje do vybavení; v liště hřivny                           | Martin (20. 10. 2026)                        |
| Rozdělení ceny kování na tavbu, překování a kování, výtěžky 25 % a 60 %, 1,2 kg hřiven na kg nástrojů    | návrh Clauda (20. 10. 2026)                  |
| Měchař – dospělý z domácnosti nebo syn 10–13 (nepase), sám kovář polovičním tempem                       | návrh Clauda (20. 10. 2026)                  |
| Vybavení do potřeby, hřivny na rok obnovy, kovárna jde do dílny až s prací na celý den                   | návrh Clauda (20. 10. 2026)                  |
| Starší vsi: zásoba nástrojů do vybavení do potřeby, přebytek na hřivny (÷ 1,2)                           | návrh Clauda (20. 10. 2026)                  |
