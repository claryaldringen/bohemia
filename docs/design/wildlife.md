# Divoká zvěř – stavy, škody, obrana, lov a ryby

Stav: **schváleno** (Martin 24. 10. 2026: „Schvaluji“). **Implementováno** (sloučeno ≈ 26.–28. 10. 2026, kód viz [village-wildlife.md](../code/village-wildlife.md)). Navazuje na
[koně](horses.md), [vojvodovu rodinu](lord.md), [stravu a dobytek](diet.md), [pole](fields.md)
a [les](forest.md). Čísla zdůvodňuje [rešerše](research/2026-10-24-wildlife.md). Co níž není
výslovně Martinovo, je návrh Clauda. Otevřené otázky Martin uzavřel 24. 10. 2026 (sekce
[Odpovědi Martina](#odpovědi-martina-24-10-2026)).

## Proč

Martin, 22. 10. 2026 ([koně](horses.md)): divoká prasata „budou ničit úrodu a bez koně budou
téměř neulovitelná“ – kůň a výcvik rodu dnes nic nepřinášejí, užitek jim dá až lov a válka.

Martin, 24. 10. 2026:

- **Druhy:** divoké prase, jelen (jeleni i laně), vlk a medvěd, zajíc, liška, ptáci, ryby – vše
  jako **součást simulace** (server počítá stavy, škody a lov, scéna zobrazuje).
- **Stáda jako počty:** „Samozřejmě by bylo hezké, kdyby stádo mělo rozmnožovací mechaniku, ale
  zase to nechci na úkor přílišné náročnosti.“
- **Lov:** „Loví vojvoda a jeho synové. Ti ze dvorce na koních, pokud je mají, ti ostatní pěšky
  s oštěpy a psy. Neurození vesničané jen drobné zvířectvo autonomně. Pokud vesničané půjdou na
  ryby, měli by být vidět u loviště ryb s prutem.“
- **Obrana polí před prasaty a jeleny:** lov z koně, hlídání polí, psi – **ne ploty kolem polí**.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** zvěř je **počet kusů po druzích** (jeleni / laně / kolouši, dospělá prasata / selata),
  **jeden roční přepočet** (rozmnožení, úmrtnost, strop) – nenáročné na výpočet (Martin).
- **Cíl:** **strop podle lesa** – kácení a mýcení stavy snižuje; ves, která les vymýtí, má méně
  škod, ale i méně lovu.
- **Cíl:** prasata a jeleni **škodí na polích u lesa**, vlci na dobytku, liška na slepicích; brání
  se **lovem z koně, hlídáním polí a psy** (Martin).
- **Cíl:** hráč vidí stavy zvěře **hrubě** (ikona s odhadem), ne přesná čísla.
- **Cíl:** výcvik rodu (luk, boj, jízda) a koně konečně něco dávají – **úlovek, maso a menší
  škody**; lov sám je výcvik.
- **Cíl:** vesničané sami chytají **drobnou zvěř a ryby**, rybáři stojí ve scéně **u loviště
  s prutem** (Martin).
- **Ne-cíl (teď):** srnec, tur, zubr, los, rys, bobr (modely v 0 A.D. chybí), kůže a kožešiny jako
  surovina (Martin, 24. 10. 2026: „Zatím mimo hru“; navíc nechce nové suroviny –
  [obchod](trade.md), Jen společné suroviny), sokolnictví,
  ploty kolem polí (Martin), vlčí jámy a pasti, zvěř přecházející mezi mapami, lovecké právo vůči
  sousedům, nemoci zvěře, zvířata po kusech se jmény.
- **Anti-cíl:** zvěř jako pohroma, která ves vyhladí – škody jsou desetiny úrody, ne celá; lov
  jako klikací minihra; neurození vesničané na vysoké zvěři (Martin – jen drobné).

## Kde zvěř žije a kolik jí je (návrh Clauda)

Mapa sídla má 128 × 128 políček po 15 m (≈ 1,9 × 1,9 km, 369 ha), les ≈ 55–70 % plochy
([krajina](landscape.md)). Zvěř **patří vsi** jako stáda – nová volitelná část stavu vsi. Strop se
počítá z krajiny **do 1 km od středu vsi** (≈ 314 ha – u vsi uprostřed skoro celá mapa; víc vsí
na jedné mapě se překryje a překryv se zanedbá – zjednodušení). **Les** = povrch les krajiny bez
vykácených a vymýcených čtverců (pole, stavby, paseky), jen souvislý les od 1 ha – malé háje
v loukách se nepočítají.

| Druh           | Strop (do 1 km od vsi)                                                    | Kde žije                                  | Typická ves (les 190 ha)            |
| -------------- | ------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------- |
| jelení zvěř    | **5 kusů na 100 ha lesa**                                                 | les, za soumraku louky a pole u lesa      | 10 – 2 jeleni, 5 laní, 3 kolouši    |
| divoká prasata | **5 na 100 ha lesa**, který nezabírají prasata vsi (1 ha na prase – diet) | les (žaludy, bukvice), v noci pole u lesa | 8 – 4 dospělá, 4 selata (30 prasat) |
| zajíci         | **15 na 100 ha** louky, přílohu a polí                                    | louky, příloh, strniště                   | 18                                  |
| lišky          | **1 na 100 ha** lesa a luk, nejvýš 4                                      | okraj lesa, za soumraku kraj vsi          | 3                                   |
| vlci           | **0 pod 100 ha lesa, 5 od 200 ha**, mezi tím poměrně                      | přicházejí z okolí, smečka loví v kraji   | 4,5                                 |
| medvěd         | **1, když lesa je aspoň 150 ha**; spí v prosinci–březnu                   | hluboký les                               | 1                                   |
| ryby           | **300 kg na ha vody** – potok a tůně                                      | tůně a klidná voda potoka                 | ≈ 750 kg (≈ 2,5 ha vody)            |
| ptáci (vrány)  | bez stavu: **1 hejno + 1 na 10 ha osetých polí**, nejvýš 5                | okraj lesa, pole po setí a žních          | 2 hejna                             |

- **Proč tak málo velké zvěře:** mapa je 3,7 km², kdežto smečka vlků potřebuje ≈ 160 km²
  (rešerše) – na mapě je jen kousek jejich revíru, proto „přicházejí“. Hustoty jelenů a prasat
  odpovídají pralesu s vlky (Bělověž – jelen 2–3,5, v národním parku i přes 10 na km²; rešerše),
  zvolil jsem střed, aby jedna ves viděla jedno stádo a jednu rotu.
- **Ryby jako biomasa v kg**, ne kusy – loví se kila. Hustotu ryb v potoce jsem neověřil (návrh).
- **Ptáci:** vrány jsou v simulaci jen škodou na zrajícím obilí a počtem hejn pro scénu, stav
  nemají. Káně zůstává ozdobou scény.
- **Nová ves** začne se zvěří na stropu – svět roku 500 je divočina.

## Roční přepočet – 1. 5. (návrh Clauda)

Jednou ročně, 1. 5. (po narození mláďat – jelení kolouši v květnu–červnu, selata březen–květen),
v pevném pořadí kroků dne a bez náhody. Během roku stav ubírá jen lov rodu, oka a rybolov
vesničanů.

- **Jelení zvěř:** loňští kolouši dospějí – půl na jeleny, půl na laně; **nových kolouchů = laně ×
  0,6** (březost a přežití prvních týdnů); dospělých ubude **10 % + 1 % za každého vlka** (5 vlků
  → 15 %; rešerše – v Bělověži přežije 71 % dospělých ročně, hlavně kvůli vlkům, u nás je i lov
  rodu). Nad stropem odejdou napřed kolouši a laně poměrně.
- **Divoká prasata:** loňská selata dospějí; dospělých ubude **20 %**; **nových selat = dospělí ×
  1** (půl jsou bachyně × ≈ 4 selata × přežití ½ – rešerše 4,7–5,9 plodů na bachyni). Bez lovu tak
  rota každý rok **dorůstá ke stropu** – proto jsou prasata „neuhubitelná“ bez soustavného lovu.
- **Zajíci:** × 2 (víc vrhů za rok, úmrtnost v tom), nejvýš strop.
- **Lišky:** vždy na stropu (rod je neloví, oka na ně nejsou).
- **Vlci:** přibude **polovina toho, co chybí do stropu** (vlčata a vlci z okolí) – vylovené okolí
  se vzpamatuje za 2–3 roky.
- **Medvěd:** ulovený medvěd se vrátí (přijde jiný) **za 3 roky**, je-li lesa dost.
- **Ryby:** přírůstek **biomasa × (1 − biomasa ÷ strop)** – nejrychleji rostou v polovině
  stropu (nejvíc ≈ čtvrtina stropu ročně, typicky ≈ 190 kg).
- **Paseky se nepočítají** (zjednodušení, návrh Clauda, W1): les je povrch les krajiny a les vsi
  bez čtverců polí, sadů, hřbitovů, ohrad a obydlí; pokácené stromy v něm ho nezmenšují.
- **Strop klesá s lesem:** přepočet bere les k 1. 5.; ves, která přes rok vymýtí 30 ha, má o 1–2
  jeleny a prasata méně.

## Škody (návrh Clauda)

### Prasata a jeleni na polích

- **Kdy:** od **1. 6.** (obilí v klasu a mléčné zralosti) **do sklizně dílu** – ozim do žní
  v červenci (co červenec nestihne, v srpnu), jař do srpna – jař, kterou srpen nedosklidí, i v září,
  dokud ji ves nedožne ([pole](fields.md) – Ozim a jař, Žeň jaře i v září). Mimo okno zvěř na polích nic
  významného nezničí (zjednodušení – škody na osevu a ozimu v zimě se nepočítají).
- **Kolik:** za den v okně – **dospělé prase 1 kg obilí, sele 0,3 kg, jelen 0,6 kg, laň 0,5 kg,
  kolouch 0,15 kg** (sežere a pošlape; neověřeno, návrh). Typická ves (8 prasat, 10 kusů jelení
  zvěře) tak bez obrany přijde za okno o **≈ 650 kg obilí** – při ≈ 9 t úrody vsi na 30 lidí
  **≈ 7 %**, jsou-li všechna pole u lesa.
- **Kde – podle vzdálenosti od lesa:** denní škoda se rozdělí na osetá, ještě nesklizená pole
  podle **plochy × váhy**: váha **1 do 50 m od okraje lesa, k 250 m klesá na 0** (rešerše: 90 %
  rytí divočáků do 50 m od okraje, nejdál 150 m). Díl přijde za sezónu nejvýš o **50 % úrody**;
  co se na pole u lesa nevejde, zvěř spásla v lese (propadne). **Pole daleko od lesa jsou
  v bezpečí** – hráč volí, kde zakládá pole.
- **Vrány:** **2 % úrody** každého nehlídaného osetého dílu za okno (bez ohledu na les; neověřeno,
  návrh – malé, ať je hlídání vidět).
- Škoda sníží úrodu dílu stejně jako nedodělaná práce ([pole](fields.md) – Úroda) – bez náhody.
- **Malá ves u lesa** (Martin 26. 10. 2026: škoda se násobí min(1; plocha polí u lesa ÷ 10 ha)):
  návrh Clauda – „plocha polí u lesa“ je součet **plocha × váha** ohrožených dílů, takže pole
  250 m od lesa se nepočítá a pole 150 m od lesa počítá půlkou. Denní kg zvěře se tím násobí, než
  se rozdělí na díly. Návrh Clauda (oprava 26. 10. 2026): součet se bere **jen z dosud
  nesklizených dílů**, jinak by po sklizni ozimu šla celá dávka na méně dílů a škoda jaře na ha
  by se zdvojnásobila.
- **Osev a očekávaná škoda (přijato, návrh Clauda):** plán osevu (`sowingTargets`) s očekávanou
  škodou nepočítá. _Historie:_ `sowingTargets` i cíl osevu zrušené 9. 11. 2026 – ves seje všechny
  díly na řadě ([pole](fields.md) – Osevní postup po dílech, bod 3), škoda osev neovlivní. Rezerva osevu unese ≈ 7 % úrody, škody jsou desetiny úrody a hlídky je
  snižují, takže ves kvůli zvěři neseje víc; loňskou škodu (`damage.lastYearKg`) do osevu
  nezapočítáváme.
- **Plodiny:** jen obilí – ozim a jař (do 9. 11. 2026 i díly nad potřebu – zrušené); luštěniny a len ne (návrh Clauda –
  návrh počítá „kg obilí“). Škodí se jen na dílech, které ves letos zaseje (do 1. 6. dosel).
- **Co s ≈ 650 kg:** čísla výše platí pro žně, které se protáhnou do poloviny července a srpna;
  zvěř krmí jen dosud nesklizené díly, takže po sklizni dílu škoda na jeho úrodě končí. Kalibrace
  na Vlkově (26. 10. 2026, bez obrany): **≈ 8 % úrody** (435–522 kg ročně), hlad žádný.

### Vlci na dobytku

- **Roční ztráty stáda už vlky obsahují** (ovce 12 %, kozy 10 %, prasata 12 %, skot 6 % – nemoci,
  vlci, úrazy; [strava](diet.md) – Roční ztráty stáda). Návrh: z nich se **vyčlení vlčí díl – ovce
  a kozy 3 %, prasata 2 %, skot 1 % při 5 vlcích** – a ten se násobí vlci ÷ 5; základ klesne na
  9 / 7 / 10 / 5 %. Ves s plnou smečkou tak má ztráty jako dnes (kalibrace beze změny), ves bez
  vlků (vylovené okolí, vymýcený les) o ně přijde.
- Jen stáda **na pastvě** (duben–říjen) a **prasata v lese** (celý rok); ovce a kozy u domů a skot
  v ohradě v zimě vlci neberou. Ztráta je podíl stáda den po dni jako dosud; celé kusy se
  odečítají do kroniky („Vlci strhli ovci“).
- **Medvěd:** k vlčímu dílu přidá **2 prasata ročně** z prasat v lese (duben–listopad), je-li.
- **Provedení W3** (návrh Clauda, 26. 10. 2026): vlčí díl se přidá k základu tak, aby součet při
  5 vlcích dal přesně dosavadní 12 / 10 / 12 / 6 % (roční zbytek vlky = (1 − základ − díl) ÷ (1 −
  základ), rozpočtený na dny, kdy je stádo venku). Medvěd bere prasata **absolutně** (2 ročně, ne
  podíl stáda) a **jen z prasat nad chovný pár** (`keepPigs` = 2: stádo 2 prasat medvěd
  nechá, ze 3 vezme nejvýš 1; oprava po recenzi, návrh Clauda). Ves bez údajů o zvěři má
  5 vlků a žádnou lišku (beze změny). Ves, které selhal převod krajiny, je **bez zvěře** (bez
  medvěda, lišek, jelenů a prasat; 5 vlků jako dřív) – chová se jako před zvěří. Do kroniky
  jdou kusy strhnuté šelmami **po měsících** (jedna událost za druh a šelmu poslední den
  měsíce), ať u velkých stád nevytlačí z kroniky důležité události. Vlci berou jen stádo
  (`herds`), ne mláďata a porážku (`young`, `culling`) – ta se zmenší stejným podílem, ale
  kronika hlásí jen kusy ze stáda, tedy o něco méně (vědomé zjednodušení).

### Liška na slepicích

- Slepice nejsou stádo (pevný počet u obydlí – [strava](diet.md)). **Každá liška ubere 2 %
  vajec** (domácnost ztracenou slepici nahradí z kuřat) – typicky 6 %, nejvýš 8 %. Jestřáb je
  v tom (návrh – jedno číslo).

### Nebezpečí pro lidi (skromně)

- Zvěř **nikoho nezabije** ani nezraní mimo lov – medvěd i vlci se lidem vyhýbají (ve scéně
  utíkají). **Jediná výjimka je výjezd vojvody:** osamělého vojvodu nebo malou družinu (nejvýš
  dva muži) v hustém lese napadne medvěd nebo vlci, a to **týmiž čísly jako na lovu** (zranění
  i smrt níže; vlci čísly lovu prasat) – [lord-control.md](lord-control.md) – Nebezpečí, bod 3.
- **Na lovu** může být lovec zraněn: na lovu prasat **0,5 %**, na lovu medvěda **5 % × (1 −
  boj ÷ 200)** na lovce a den, náhodou ze seedu vsi a dne. Zraněný **60 dní** necvičí, neloví ani
  nepracuje.
- **Vzácně i smrt** (Martin, 24. 10. 2026: „Vzácně i smrt“; čísla návrh Clauda): na lovu prasat
  **0,02 %**, na lovu medvěda **0,3 %** na lovce a den (jelen, zajíc a vlk bez šance na smrt),
  vynásobeno **(2 − boj ÷ 100)** (vyšší při nízké dovednosti) a **× 2 pěšky bez koně**; los ze
  stejného seedu vsi a dne jako zranění, nezávisle na něm. Typicky tak rod přijde o lovce
  **jednou za několik desítek let** (zima se třemi lovci ≈ 1 %). Zabít může i vojvodu a dědice –
  nástupnictví podle [vojvodovy rodiny](lord.md) (Rod vojvody); **vymře-li rod po meči, hra
  končí** (Rod vojvody – Konec rodu), takže lov může konec hry způsobit. Kronika: „Bořivoj zahynul
  na lovu divočáka“.

## Obrana polí (Martin – lov z koně, hlídání, psi; čísla návrh Clauda)

Celková škoda dílu = škoda × (1 − jezdecká hlídka) × (1 − noční hlídka).

### Jezdecká hlídka – objížďka polí

- **Denní objížďka** jezdců rodu už existuje ([koně](horses.md) – Kdy a kam se jezdí) – v okně
  zrání se z ní stane **hlídka**: jezdci zvěř od polí odhání a občas uloví.
- **Síla jezdce** = co jezdec na koni dokáže (horses.md: jízda ÷ 100 × (0,4 + 0,6 × výcvik koně)).
  Hlídka sníží škodu na všech polích o **min(60 %; 25 % × součet sil jezdců × (1 + 0,1 × psi
  dvorce, nejvýš 1,5))**. Vojvoda a jeden vycvičený syn se 3 psy ≈ 55 %, se dvěma syny strop
  60 %.
- **Úlovek z hlídky:** k akumulátoru prasat se přičte **0,01 × součet sil × prasata ÷ strop**
  denně (≈ 1–2 prasata za léto).
- **Kdo jede (návrh Clauda, oprava po recenzi):** jen jezdci z objížďky – **kdo ten den loví, hlídku
  nejede** a **zraněný taky ne** (ani se nepočítá do síly). Hlídka dne se spočte **jednou** (před
  škodou polí) a stejnou hodnotu čte škoda i úlovek z hlídky, takže zranění na lovu téhož dne ji
  nezmění.

### Noční hlídka vesničanů – kombinace (Martin, 24. 10. 2026)

Martin, 24. 10. 2026: „Kombinace“ – napřed hlídají staří a výrostci, dospělí z práce vsi jen tam,
kde to nestačí.

- **Kdy a kde:** každou noc okna zrání, na dílech, kterým by **bez hlídky hrozilo aspoň 10 %
  úrody** za sezónu (odhad 1. 6. ze stavu zvěře, **bez jezdecké hlídky** – ta kolísá ode dne ke dni podle koní, hladu
  a výprav, plán proto počítá konzervativně; snímek hlídačů a dílů platí celou sezónu – ves to pozná sama, hráč nic
  nezadává; Martin – vesničané sami používají, co jim ulehčí práci).
- **1. stupeň – zdarma, mimo práci vsi:** hlídají **staří a výrostci** (ti, kdo jinak pasou nebo
  dělají práci, která propadá – [populace](population.md), Práce), **1 hlídač na 5 ha**
  hlídaných dílů, jako pasení, bez člověkodnů z práce vsi. Díly s největší hrozbou škody napřed.
- **2. stupeň – dospělí z práce vsi:** kde po 1. stupni zbývá **hrozba škody ≥ 10 % úrody** dílu
  a hlídačů nemá kdo dodat, přidají se **dospělí**: **1 hlídač na 5 ha**, **0,3 člověkodne za
  noc** (hlídač ráno dospí – návrh). Patří do **potřebných sezónních úloh** (krok 3 pořadí práce,
  za polními úlohami dne a **za nutnou sečí** – seno pro voly a krávy je životně důležité, hlídka
  mu práci nevezme; návrh Clauda) – v žních tak soupeří se sklizní, což je zamýšlená volba. Hlídka
  zůstává před rybami a okami: ty jsou ze zbytku práce nad potřebu (Martin, 26. 10. 2026).
  Chtěné člověkodny se počítají i ve dnech, kdy ves na hlídku nedala nic.
- **Účinek:** škoda prasat a jelenů na hlídaném dílu **−60 %** (oheň, řehtačky, křik), vrány
  **celé** (hlídač je i ve dne – děti s řehtačkou; jen zobrazení).

### Psi – smečka dvorce

- **Kdo je chová:** **dvorec** – lovečtí psi rodu. Chce **1 psa na lovce rodu + 1**, nejvýš 8.
  Psi pasáků jsou dál jen v číslech pasení ([strava](diet.md) – Pasáci), hra je nevede.
- **Krmení:** **0,3 kg obilí denně na psa** (≈ 110 kg ročně; zbytek kryjí droby a kosti z porážky
  a úlovků – návrh). Bez obilí smečka nedoroste.
- **Počet:** existující dvorec bez smečky ji **založí hned** (návrh Clauda, oprava po recenzi:
  první zima se psy, ne až po 1. 5.) na chtěný počet; dál k 1. 5. přibudou nejvýš **2 štěňata** do počtu, který dvorec chce, ubude **10 %**
  ročně (pes žije ≈ 10 let). Péče je bokem (rodina).
- **Užitek:** pěší lovec se psem loví za dva (níž), psi na objížďce zesílí hlídku (výš).

## Lov rodu (Martin – kdo a čím; kdy a kolik návrh Clauda)

### Kdo

- **Ze dvorce na koních** (Martin): vojvoda, jeho synové a vnuci od 14 let ve výcviku – na koni,
  mají-li ho ([koně](horses.md) – kdo na kterém koni).
- **Děti na lov nechodí** (Martin, 27. 10. 2026: „Děti na lov nechodí“): chlapci 10–13 let v den
  lovu (kalendářního i navíc) cvičí doma jako jindy – jízda, luk a boj podle věku, objížďka polí.
  Dřív jeli s koněm jako doprovod s polovinou síly (návrh Clauda, zrušeno).
- **Ostatní pěšky s oštěpy a psy** (Martin): muži dvorce bez koně a **synové rodu, kteří po
  sňatku z dvorce odešli** a pracují jako rolníci ([vojvodova rodina](lord.md) – Synové po
  sňatku). Den lovu jim chybí v práci vsi (v zimě, kdy práce většinou propadá).
- **Rodina na poli při hladu** ([vojvodova rodina](lord.md) – Kdy jde rodina na pole) **neloví –
  ani na koních, ani pěšky** (návrh Clauda, oprava po recenzi): hladová ves ji potřebuje v práci.
  Odešlí synové smějí. Rodina strhnutá polem až v den lovu (práce dne pole zabrala) se z lovu
  vyřadí také.
- **Slabý jezdec jde pěšky** (návrh Clauda): člen rodu jede na koni jen tehdy, když mu kůň přinese
  víc než pěší lov se psem (příspěvek na prasata i jeleny podle koeficientů níž); jinak jde pěšky
  a kůň zůstane ve stáji. Jezdec s jízdou ≈ 3 tak lov nepokazí.

### Kdy

- **Velký lov – obojí** (Martin, 24. 10. 2026: „Obojí“): rod loví **sám podle kalendáře –
  listopad–únor, každý 7. den** (od 1. 11.; ≈ 17 dní), celý den místo výcviku. Zima je doba lovu
  (po žních, zvěř je vykrmená, ve sněhu jsou stopy). **A hráč může na dvorci vyhlásit lov
  navíc**, např. když prasata škodí (viz níž).
- **Lov navíc na pokyn hráče** (návrh Clauda): tlačítko na panelu dvorce ve stylu 0 A.D. (ikona
  oštěpu, bez popisku, důvod odepření u kurzoru; popisek jen v tooltipu). Vyhlásí **jeden den
  lovu** – celý den místo výcviku, stejná pravidla úlovku a rizika jako kalendářní lov. Smí se
  **v sezóně i mimo ni**, jen ne **březen–květen** (hájení mláďat – selata a kolouši, ne pro
  medvěda se nic nemění) a **nejvýš jednou za 3 dny**; lovců je nejvýš tolik, kolik jich je
  zdravých a bez práce v nejbližším kroku dne. Mimo zimu den lovu chybí v hlídce, výcviku
  a práci odešlých synů ve vsi – to je cena hráčova rozhodnutí. Kalendářní lov hráč nevypíná.
  Správce vsi vyhlásí lov navíc touž akcí, jen když zvěř škodí na polích (Martin 8. 11. 2026:
  „A“ – [správce](steward.md), Obilí a lov v nouzi).
- **Letní hlídka:** červen–říjen v bloku jízdy (výš) – menší úlovky, hlavně menší škody.
- **Výcvik:** den lovu se počítá jako výcvik (6 h): jezdec **jízda 3 h a luk 3 h**, pěší **luk 2 h
  a boj 4 h** (oštěp); kůň se cvičí jako při jízdě. Odešlým synům lov zpomalí úbytek dovedností.

### Kolik

- **Síla lovce:** jezdec = síla jezdce × (0,5 + 0,5 × luk ÷ 100); pěší = (luk + boj) ÷ 200, **bez
  psa poloviční** (psi se rozdělí pěším).
- **Úlovek se počítá akumulátorem** (bez náhody, jako zlomky stáda): každý den lovu se k „naději“
  druhu přičte síla × základ × stav ÷ strop, **celé kusy se uloví** a odečtou.

| Druh                     | Základ na den lovu                               | Maso do zásoby vsi                |
| ------------------------ | ------------------------------------------------ | --------------------------------- |
| divoká prasata           | **0,15 × (jezdci + 0,3 × pěší)** – bez koně málo | **45 kg** dospělé, **15 kg** sele |
| jelení zvěř              | **0,10 × (jezdci + 0,5 × pěší)**                 | **90 kg** jelen, **50 kg** laň    |
| vlci                     | **0,05 × (jezdci + 0,5 × pěší)**                 | – (bez masa)                      |
| medvěd (jen v listopadu) | **0,2 × pěší** – všichni pěšky se psy            | **100 kg**                        |

- **Přednost (Martin – jeleni, ne laně):** na jelení zvěř se loví **jen jeleni**, dokud je jich
  aspoň **1 na 3 laně**; laně jen nad stropem; kolouši nikdy. Prasata napřed dospělá, selata až
  bez dospělých.
- **Cíl dne:** velký lov jde na prasata a jeleny zároveň; **vlci** dostanou den místo nich, když
  za posledních 30 dní strhli aspoň 2 kusy dobytka; **medvěd** v listopadu, je-li.
- **Typický rod** (vojvoda a 2 synové na vycvičených koních, dovednosti ≈ 85, jeden odešlý syn
  pěšky se psem): za zimu **≈ 4 prasata a 1–2 jeleni**, v létě 1–2 prasata – **≈ 350–400 kg masa
  ročně** (maso ≈ 3–4 dospělých). Prasata 1. 5. dorostou jen na ≈ 60 % stropu → letní škoda klesne
  o ≈ 40 %. Bez koní by typický rod (3 lovci, dovednosti ≈ 85, psi) ulovil za zimu ≈ 1 prase (změřeno po opravě; koeficient pěších 0,2 → 0,3, návrh Clauda – s 0,2 vycházelo prase za 2–3 zimy, tj. třetina návrhu). Jelení zvěř omezuje spíš stav stáda (jeleni ≥ ⅓ laní) než lovci, takže jelen vychází spíš jednou za 2–3 zimy než každou.
- **Maso** jde do **zásoby masa vsi** ([strava](diet.md) – uzení, kažení 20 % ročně) a počítá se do
  výhledu jako maso z porážky. Kůže a parohy se nevedou (ne-cíl).

## Drobná zvěř a ryby – vesničané sami (návrh Clauda)

- **Kdy se vyplatí:** jen když ves **chce víc bílkovin**, než dá obilí, luštěniny, mléko, vejce
  a maso stád ([strava](diet.md) – výhled), nebo **hladoví** – jinak ne (vesničané sami používají,
  co jim ulehčí práci).
- **Kdo:** napřed práce, která by propadla – **starší** nad denním minimem své domácnosti (dnes
  propadá – [populace](population.md), Práce), **výrostci**, kteří ten den nepasou, a **zbytek
  společné práce vsi** po stavbách a opravách. **Při hladu** i dospělí v kroku 3 za polními
  úlohami, před stavbami.
- **Co:** **duben–listopad ryby** (voda bez ledu), **prosinec–březen oka na zajíce** (stopy ve
  sněhu).
- **Úlovek:** ryby **0,4 kg za hodinu × biomasa ÷ strop** (1 kg ryby = 0,6 kg masa – jedlý podíl);
  oka **0,05 zajíce za hodinu × zajíci ÷ strop** (zajíc 2 kg masa). Rybaří se, dokud se chytá
  jen do **roční kvóty podle přírůstku** (viz W7) a nad polovinou stropu – vodu tak ves nevyloví.
  Totéž oka: zajíci nad polovinou stropu a nad tím, co za rok přibude.
- **Kolik to dá:** voda typické vsi ≈ **150–200 kg ryb ročně** a oka ≈ **20 kg masa** – doplněk
  pro 1–2 lidi (≈ 150–250 kg masa ročně podle vody), ne náhrada stád ([strava](diet.md) – lov a rybolov „později jako doplněk“).
- **Loviště:** **tůně potoka** ([krajina](landscape.md) – 2–4 tůně) do 1 km, nejbližší ke vsi
  napřed, nejvýš 3 rybáři na tůň; když tůň nestačí, i mělčina pod ní. Rybník v1 krajina
  negeneruje – až bude, je loviště i on.

## Ve scéně (návrh Clauda)

- **Modely z 0 A.D.** (ověřeno v repozitáři 0ad/0ad): `boar`, `deer` (samice; samec s parožím
  `deer_antlers` jako prop – sloučit do jednoho meshe jelena), `wolf`, `bear_brown`, `fox_red`,
  `rabbit1` (jako zajíc), `mastiff` (pes). Vrány, káně a ryby už ve scéně jsou (`crow.glb`,
  `hawk.glb`, `fish.glb`). Převod jako dobytek (`tools/blender/fauna_from_0ad.py` – morph targety
  `stride_a`, `stride_b`, `graze`), licence CC BY-SA 3.0 do `LICENSES.md`. `deer1–3` jsou jen
  statické pózy – nepoužít.
- **Kolik vidět = stav ze simulace**, nejvýš: jelení 12 (stádo laní s kolouchy, jeleni zvlášť –
  v říji září–říjen se stádem), prasata 10 (jedna rota), zajíci 4, liška 1, vlci 5, medvěd 1,
  psi dvorce všichni. Hejna ryb v tůních = dosavadní počet × biomasa ÷ strop, hejna vran z jádra.
- **Kde a kdy:** ve dne jelení zvěř a prasata **na okraji lesa** a v hájích (jako prasata vsi
  −7 až +5 m od hranice), za soumraku a v noci **na loukách**, v okně zrání **na polích u lesa –
  na dílu, kde jádro počítá největší škodu** (škoda je vidět). Zajíci na loukách a strništích,
  liška za soumraku u kraje vsi, vlci jen **v zimě v noci** u okraje lesa, medvěd duben–listopad
  vzácně na okraji lesa. Poloha deterministicky ze seedu vsi a dne.
- **Útěk:** k člověku, jezdci nebo psovi blíž než 30 m zvíře uteče během (rychlejší krok ze
  stejných morph targetů – žádný nový atribut) – jen scéna.
- **Lovci:** v den velkého lovu vyjedou jezdci a vyjdou pěší se psy branou k okraji lesa u roty
  a vrátí se (jako jezdci v bloku jízdy – [koně](horses.md), Ve scéně); prasata před nimi utíkají.
  Hlídka v létě = dosavadní objížďka. Lov jde ve skutečném čase (1. 11. 2026, návrh Clauda –
  villagers.md, Činnosti od začátku do konce): vyrazí od šera dne lovu v nejbližší chvíli, kdy
  rodina vyjíždí na jízdu cyklu (lord.md – Ve scéně, Den rodiny ve skutečném čase; lovci k ní dojdou
  ke kůlu chůzí), a trvá 10 minut (≈ 7 herních dní); cesta k lesu smí trvat nejvýš 70 % půlky lovu – pěší svižnou chůzí dojdou ≈ 300 m, jezdci
  klusem ≈ 630 m. Les u zvěře dál než to jdou lovci k nejbližšímu okraji lesa, a když ani ten nestihnou, jen ke
  kraji svého dosahu – nikdy se neotočí v půlce cesty.
- **Rybáři:** stojí na břehu tůně (dosavadní póza stání) s **prutem** – nová rekvizita (vlastní CC0
  model ≈ 3 m, vlasec jako čára), samostatná instance natočená podle postavy, **žádný nový vertex
  atribut** (postava má právě 8 bufferů). Počet z jádra (hodiny rybaření ÷ délka dne), nejvýš 3 na
  tůň. Oka se nekreslí – lidé, kteří je v zimě kladou, klečí s okem na okraji lesa nejblíž vsi
  (villagers.md – Fáze činností, Rybář; úloha 12 scény). Ves bez tůně do dosahu jádro rybaří
  na své vodě (`waterHa`) jako na jedné tůni – rybáři pak stojí na břehu potoka v místě nejblíž vsi; voda bez potoka (jen
  políčka vody) rybáře nekreslí.
- **Psi:** u dvorce (stojí, leží), s pěšími lovci a s jezdci na objížďce; na začátku a konci
  lovu 3 s dobíhají od dvorce k lovcům a zpět (neskočí).
- **Děti s řehtačkou:** scéna kreslí na každém hlídaném dílu ve dne vždy dítě s řehtačkou, bez
  ohledu na to, kdo hlídá v jádru (v noci staří a výrostci, pak dospělí) – hra noc nemá, noční
  hlídače u ohně scéna nekreslí. Děti se berou až po pasácích, pasáci tak nezůstanou bez postavy.
- **Ve hře (W10, návrh Clauda):** kusy podle stupně stavu (jelení 4/8/12, prasata 4/7/10, zajíci
  1/2/4, vlci 2/3/5); hra zatím nemá noc (den a noc jen v náhledu krajiny), takže zóny se řídí
  jen měsícem a noční louky přijdou s denní dobou ve hře; vzácní (vlci, medvěd, liška) jsou
  vidět jen v části 20minutových úseků skutečného času – na začátku úseku vyjdou krokem z lesa
  a na konci do něj odejdou, neobjeví se ani nezmizí naráz (návrh Clauda 27. 10. 2026 po nočním
  ověření); po útěku skupina chvíli stojí a krokem se
  vrátí. Podrobnosti: `docs/code/scene-village.md` – Divoká zvěř ve scéně.
- **Výkon:** jeden mesh `wild-*` na druh v instancích jako fauna (`fauna.ts`), 3 morph targety jako
  kráva (WebGPU limit 8 vertex bufferů ověřit u každého druhu). Pohyb ve skutečném čase
  (`livestockClock`), animace v `animate()` v taktu `WATER_FPS`, jen skupiny v záběru, při
  omezeném pohybu stojí; rozmístění se přepočítá jen při změně dne nebo stavu (`needsRender`).

## Co hráč vidí (UI jako 0 A.D.)

- **Klik na divoké zvíře** vybere jeho druh: ikona druhu s **hrubým odhadem stavu** (Martin, 24. 10. 2026 nechal na Claudovi; návrh Clauda): tři stupně plnosti ikony podle stavu ÷ strop
  (**málo** do ⅓ stropu, **středně** do ⅔, **hodně** nad ⅔; nad stropem „plno“), slova a bližší
  údaje (např. „Les uživí 10“, loňská škoda v kg obilí, strhnutý dobytek) jen v tooltipu –
  přesné počty kusů (jelen 2 · laň 5) hráč nevidí.
- **Panel dvorce:** tlačítko **lov navíc** (výš), řádek lovu – ikony úlovků letos s čísly a maso
  v kg; **psi** – ikona psa
  „6 / 7“ (v popisku obilí psů za den, červeně bez obilí).
- **Panel dílu pole:** ikona prasete a **škoda letos v %** (červeně od 10 %), ikona ohně, když se
  díl hlídá; v popisku vzdálenost k lesu.
- **Horní lišta:** nic nového (maso a obilí už ukazuje).
- **Upozornění:** „Divoká prasata ničí úrodu“ (škoda letos nad 5 % úrody polí u lesa), „Vlci
  strhávají dobytek“ (2 kusy za 30 dní), „Psi jsou bez obilí“.
- **Kronika:** úlovek rodu se jménem („Bořivoj ulovil divočáka“), ulovený medvěd nebo vlk, zranění
  na lovu, souhrn škod po žních („Zvěř zničila 640 kg obilí“), strhnutý dobytek, „Medvěd se vrátil“.

## Pro implementaci (poznámky, ne kód)

- **Stav:** volitelná část stavu vsi `wildlife` – jelení (jeleni, laně, kolouši), prasata
  (dospělá, selata), zajíci, vlci, medvěd (0/1, roky do návratu), ryby (kg), akumulátory úlovků,
  smečka psů, škody letos po dílech. Lišky a vrány se odvodí z krajiny a polí. **Převod starších
  vsí:** stav na stropu, jednou a idempotentně.
- **Pořadí dne** (`simulate.ts`): 1. 5. roční přepočet zvěře na začátku dne; lov a hlídka v kroku
  rodiny; noční hlídka v kroku 3; škody zvěře po práci dne; vlčí díl ve ztrátách stáda; ryby a oka
  ze zbytku práce na konci dne. Výsledek nezávisí na kouscích dopočtu (akumulátory, žádný los
  kromě zranění ze seedu vsi a dne).
- Čísla do `rules-wildlife.ts` s odkazem sem; vzdálenost dílu od okraje lesa z vrstvy překážek
  a vykácených čtverců jako palivo ([les](forest.md)).
- **Dopad na kalibraci:** škody sníží úrodu vsí s poli u lesa o ≈ 5–10 % bez obrany, hlídání vezme
  v žních práci, lov a ryby přidají maso; vlčí díl ztrát je při plné smečce stejný jako dnes.
  Ověřit `measure-village` – jen na Martinův pokyn.

## Navazuje

- [Koně](horses.md) a [vojvodova rodina](lord.md) – síla jezdce, dovednosti, objížďka.
- [Strava a dobytek](diet.md) – zásoba masa, ztráty stáda, prasata v lese, slepice.
- [Pole](fields.md) – úroda, okna zrání, pořadí práce; [les](forest.md) – kácení snižuje stropy.
- Později: [válka](war.md) (stejná síla jezdce), sokolnictví (model `hawk`), bobr a srnec
  (modely chybí), kožešiny, až bude obchod se zbožím zvenku.

## Rozhodnutí

| Rozhodnutí                                                                                                                               | Kdo                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Jezdecká hlídka bez pravidla „kůň jen když je silnější“ (jede, kdo jede objížďku)                                                        | návrh Clauda (W6)                                      |
| Noční hlídka: staří a výrostci se počítají 1. 6. na celou sezónu, dospělí denně                                                          | návrh Clauda (W6)                                      |
| Plán hlídky bez jezdecké hlídky; hlídka dospělých za nutnou sečí; lovci a zranění hlídku nejedou, hlídka dne se počítá jednou            | návrh Clauda (W6, po recenzi)                          |
| Divoké prase, jelen a laň, vlk, medvěd, zajíc, liška, ptáci, ryby – součást simulace                                                     | Martin (24. 10. 2026)                                  |
| Stáda jako počty s rozmnožováním, ne na úkor náročnosti                                                                                  | Martin (24. 10. 2026)                                  |
| Loví vojvoda a synové – ze dvorce na koních, ostatní pěšky s oštěpy a psy; vesničané jen drobné a ryby s prutem                          | Martin (24. 10. 2026)                                  |
| Obrana polí lovem z koně, hlídáním a psy, ne ploty                                                                                       | Martin (24. 10. 2026)                                  |
| Prasata ničí úrodu a bez koně jsou téměř neulovitelná                                                                                    | Martin (22. 10. 2026)                                  |
| Zvěř patří vsi, strop z lesa do 1 km; jeden přepočet 1. 5.                                                                               | návrh Clauda                                           |
| Stropy: jelení 5 a prasata 5 na 100 ha lesa (bez lesa prasat vsi), zajíci 15 na 100 ha luk a polí, lišky 1                               | návrh Clauda (rešerše)                                 |
| Vlci 0–5 podle lesa 100–200 ha, doplní polovinu chybějícího ročně; medvěd od 150 ha lesa, vrací se za 3 roky                             | návrh Clauda (rešerše)                                 |
| Kolouši = laně × 0,6, úmrtnost 10 % + 1 % na vlka; selata = dospělí × 1, úmrtnost 20 %; zajíci × 2                                       | návrh Clauda (rešerše)                                 |
| Škoda 1. 6. – sklizeň: prase 1 kg, jelen 0,6 kg denně; váha 1 do 50 m od lesa, 0 od 250 m; nejvýš 50 % dílu                              | návrh Clauda (rešerše)                                 |
| Vlčí díl dosavadních ztrát stáda (3 / 3 / 2 / 1 %) podle počtu vlků; liška 2 % vajec                                                     | návrh Clauda                                           |
| Jezdecká hlídka do 60 %, noční hlídka vesničanů −60 % za 0,3 čd na 5 ha, kde hrozí ≥ 10 %                                                | návrh Clauda                                           |
| Smečka dvorce 1 pes na lovce + 1 (nejvýš 8), 0,3 kg obilí denně                                                                          | návrh Clauda                                           |
| Velký lov listopad–únor každý 7. den jako výcvik; akumulátor úlovku; jeleni ne laně                                                      | návrh Clauda                                           |
| Při hladu jde chytání ryb a ok před stavby (výjimka z „zbytku práce“)                                                                    | Martin 26. 10. 2026: „Ano, nech to tak“                |
| Roční kvóta ryb a zajíců podle přírůstku (ryby nejvýš ¼ stropu, nad ½ stropu); maso z nich čerstvé                                       | návrh Clauda                                           |
| Ryby a oka jen při potřebě bílkovin nebo hladu, z práce, která by propadla; rybáři s prutem u tůní                                       | návrh Clauda                                           |
| Zvěř nezabíjí mimo lov; zranění jen na lovu, 60 dní                                                                                      | návrh Clauda                                           |
| Noční hlídka: kombinace – napřed staří a výrostci zdarma, kde hrozí ≥ 10 % a nemá kdo, dospělí z práce vsi                               | Martin (24. 10. 2026)                                  |
| Lov smí člena rodu vzácně i zabít; šance prasata 0,02 %, medvěd 0,3 % na den, vyšší bez koně a při nízkém boji                           | Martin (24. 10. 2026), čísla návrh Clauda              |
| Velký lov obojí: rod loví sám v zimě každý 7. den a hráč může vyhlásit lov navíc (mimo březen–květen, 1× za 3 dny)                       | Martin (24. 10. 2026), pravidla návrh Clauda           |
| Kůže a kožešiny zatím mimo hru                                                                                                           | Martin (24. 10. 2026)                                  |
| Stavy zvěře hráči hrubě: ikona o třech stupních podle stropu, slova jen v tooltipu                                                       | návrh Clauda (Martin nechal na Claudovi, 24. 10. 2026) |
| Škoda zvěře na polích se násobí min(1; plocha polí u lesa ÷ 10 ha) – malá ves nepřijde o půl úrody                                       | Martin (26. 10. 2026: „Souhlasím se všemi návrhy“)     |
| Ryby a oka jen z práce, která zbude po dílech nad potřebu a po seči navíc                                                                | Martin (26. 10. 2026: „Souhlasím se všemi návrhy“)     |
| Velká zvěř jako porážka (1 člověkoden na 20 kg masa, pak uzení); ryby a zajíci čerstvé bez práce navíc                                   | Martin (26. 10. 2026: „Souhlasím se všemi návrhy“)     |
| Psi vždy k pěším lovcům od nejsilnějšího; medvěd jen na každý druhý listopadový lov, všichni pěšky (ať listopad neztratí lov na prasata) | návrh Clauda                                           |
| Jelen se loví, je-li ho před úlovkem aspoň ⅓ počtu laní; laně jen nad stropem; úlovek se dělí stavem ÷ strop (nejvýš 1)                  | návrh Clauda                                           |
| Smečka bez obilí nedoroste (štěňata jen z nakrmené); psi jedí až po lidech a koních                                                      | návrh Clauda                                           |

## Odpovědi Martina (24. 10. 2026)

Všech pět otázek je uzavřeno; pravidla jsou zapsána výš.

1. **Noční hlídka:** Martin: „Kombinace“ – hlídají napřed staří a výrostci (bez práce vsi), a kde
   to nestačí (hrozí škoda ≥ 10 % a nemá kdo), přidají se dospělí z práce vsi (0,3 čd na 5 ha za
   noc). → Noční hlídka vesničanů.
2. **Smrt na lovu:** Martin: „Vzácně i smrt“ – lov smí člena rodu i zabít; čísla (0,02 % prasata,
   0,3 % medvěd, vyšší bez koně a při nízkém boji) jsou návrh Clauda, kronika, vymření rodu může
   ukončit hru ([vojvodova rodina](lord.md) – Konec rodu). → Nebezpečí pro lidi.
3. **Spouštění lovu:** Martin: „Obojí“ – rod loví sám podle kalendáře a hráč může vyhlásit lov
   navíc; tlačítko, omezení (mimo březen–květen, jednou za 3 dny) navrhl Claude. → Kdy.
4. **Kůže a kožešiny:** Martin: „Zatím mimo hru“. → Cíle, ne-cíle, anti-cíle.
5. **Stavy zvěře hráči:** hrubě (ikona s odhadem, slova jen v tooltipu) – Martin nechal na
   Claudovi, návrh Clauda. → Co hráč vidí.

## Odpovědi Martina (26. 10. 2026)

Martin: „Souhlasím se všemi návrhy“ – tři otázky z plánu jsou uzavřeny:

1. **Škoda u malé vsi:** škoda zvěře na polích se násobí min(1; plocha polí u lesa ÷ 10 ha).
   → Škody.
2. **Ryby a oka:** dělají se jen z práce, která zbude po dílech nad potřebu a po seči navíc.
   → Drobná zvěř a ryby.
3. **Maso z úlovku:** velká zvěř se zpracuje jako porážka (1 člověkoden na 20 kg masa a pak
   uzení); ryby a zajíci se jedí čerstvé bez práce navíc. → Lov rodu, Kolik.

## Rozhodnutí při implementaci W5 (26. 10. 2026, návrh Clauda)

- **Zranění a smrt jen na lovu prasat a medvěda.** Jelen, zajíc a vlk nemají šanci ani na zranění,
  ani na smrt. Lov „na prasata a jeleny zároveň“ nese riziko prasete, pokud ve vsi nějaká prasata
  jsou.
- **Děti na lovu nezahynou ani se nezraní** (chlapci-doprovod 10–13 let; návrh Clauda). Los smrti
  i zranění se losuje, ale týká se jen dospělých a starců. Od 27. 10. 2026 děti na lov nechodí
  vůbec (Martin – Lov rodu: Kdo), pravidlo zůstává jen jako pojistka.
- **Zraněný vojvoda zůstává vojvodou**, jen 60 dní necvičí, neloví ani nepracuje (první den po
  zranění je den 1).
- **Smrt před zraněním:** kdo při témže losu zahyne, zraněn není. Oba losy se losují vždy, ať
  výsledek jednoho lovce nemění losy dalších.
- **Lov navíc platí zítra:** hráč ho vyhlásí dnes (dnešní den je už odsimulovaný). Zítřejší den,
  který je už kalendářním lovem, se znovu vyhlásit nedá. Jezdci lovu nejedou objížďku polí a pěší
  chybí v práci vsi.
- **Ikona lovu** na panelu dvorce je oštěp; důvod odepření (hájení, 3 dny, není kdo, už vyhlášeno)
  je červeně v popisku.

## Rozhodnutí při implementaci W7 (26. 10. 2026, návrh Clauda)

- **Zdroj práce:** v klidu ryby a oka jen ze **zbytku společné práce** po stavbách, opravách, dílech
  nad potřebu a seči navíc (Odpovědi Martina 26. 10. 2026, bod 2) – starší nad denním minimem
  a nepasoucí výrostci jsou v té společné práci už započtení, zvláštní zásobník nemají. **Při
  hladu** (`hungry`) jde práce na ryby a oka hned za polními úlohami, před stavbami (Martin 26. 10. 2026 na otázku, zda hladová ves smí na ryby a oka ještě před stavbami: „Ano, nech to tak“).
- **Kolik lidí:** nejvýš 3 na tůň (`land.pools`; bez tůní, ale s vodou 1 loviště). V zimě oka
  stejný strop lidí.
- **Úlovek a roční kvóta:** úlovek jak v návrhu, ale **za rok se vyloví nejvýš tolik, kolik
  přiroste**. Kvótu spočte `yearlyQuota` 1. 5. po přírůstku (při chybějící při prvním chytání roku)
  a uloží do `smallGame.quota`. Ryby: přírůstek `ryba · (1 − ryba / strop)` je nejvyšší na
  polovině stropu, takže kvóta = min(zásoba − ½ stropu; ¼ stropu); ustálený stav pendluje
  mezi ½ a ¾ stropu bez kolísání boom–bust (typická ves ≈ 250 kg masa z ryb ročně).
  Zajíci: zásoba nad polovinou stropu a nad tím, co za rok zdvojnásobí. Pod polovinou stropu
  nebo po vyčerpání kvóty se nechytá. Maso jde jako **čerstvé** (`freshMeatKg`, jí se ten den
  napřed, zbytek se udí), bez práce porážky – ryby a zajíci se nekazí v uzené zásobě.
- **Chce bílkoviny:** roční potřeba masa po obilí, mléku, vejcích a luštěninách je větší než maso
  stád (`yearlyMeatPerHead` × stáda) + maso z velkého lovu (větší z **loňského**, uloženého při
  přepočtu 1. 5., a **letošního**) + **letošní** maso z ryb a ok. Loňské ryby a oka se neočekávají
  (chytá se podle poptávky) – jinak by ves po dobrém roce celé léto nechytala a pak chytala
  nárazově (návrh Clauda, oprava po závěrečné recenzi 26. 10. 2026).
- **Pro scénu (W11):** `wildlife.smallGame.today` (rybáři po tůních) a podíly práce `fish` (cíl
  `pool` – pořadí tůně) a `snare`; „rybář s prutem u loviště“ (Martin 24. 10. 2026).

## Rozhodnutí při implementaci W11 (26. 10. 2026, návrh Clauda)

- **Lov trvá 3–21 h herního dne** a lovci jdou k lesu rychleji (jezdci až 6 m/s, pěší až 3,2 m/s) –
  den má 86 s, krokem by k lesu nedošli. Dál než ≈ 100 m pěší les nestihnou a v půlce dne se otočí.
  **Nahrazeno 1. 11. 2026** (Martin: „Občas ve hře vidím nějakého vesničana, jak brutálně
  sprintuje“): lov jde ve skutečném čase 10 minut, pěší chůzí, jezdci nejvýš klusem (výš – Lovci).
- **Úlovek nese pěší lovec** cestou zpět (klip `carry-meat`), jen když jádro ten den ulovilo –
  bez nového modelu; kus na koni by potřeboval mršinu natočenou podle koně.
- **Oštěp** je v `man.glb` jen v klipu `spear-thrust` – pěší lovci ho drží, když v lese stojí;
  při chůzi ho nemají (klip chůze s oštěpem by potřeboval nový převod z 0 A.D.).
- **Noční hlídka se nekreslí** – hra nemá noc a oheň za plného světla by vypadal jako požár; ve
  dne na hlídaných dílech děti s řehtačkou (vrány), noční hlídku ukazuje ikona v panelu (W9).

## Ověření (W12, 26. 10. 2026)

Skripty mimo repo (`scratchpad/diag-wildlife/w12.mts`), dosavadní kód = `feat/landscape` před
sloučením zvěře (56d5f030), stejné vstupy.

**Vlkov 3 roky bez zásahu hráče** (start 5. 6. 820, 43 lidí; stav 1. 5. na konci období, kusy /
strop):

| období          | 1. 5. jelení / prasata / vlci | škoda kg (% úrody) | dní objížďky | lov rodu kg (prasata / jeleni) | ryby kg | zajíci | obilí psů kg | vejce kg (dosavadní) | dny hladu |
| --------------- | ----------------------------- | ------------------ | ------------ | ------------------------------ | ------- | ------ | ------------ | -------------------- | --------- |
| 5. 6. 820 – 821 | 6/6 · 3/3 · 0,6               | 0 (0 %)            | 33           | 0                              | 438     | 10,2   | 192          | 113 (118)            | 0         |
| 1. 5. 821 – 822 | 6/6 · 2/2 · 0,6               | 450 (7,1 %)        | 37           | 135 (1 / 1)                    | 402     | 10,2   | 219          | 125 (130)            | 0         |
| 1. 5. 822 – 823 | 6/6 · 2/2 · 0,6               | 314 (6,1 %)        | 37           | 90 (0 / 1)                     | 106     | 10,2   | 219          | 131 (137)            | 0         |

- Úroda (bez škody) 7066 / 5903 / 4831 kg proti dosavadním 7066 / 6307 / 5383 kg; úroda se
  škodou 6353 a 5145 kg – druhý rok o 238 kg méně i bez škody (práce na rybách a hlídkách).
- Noční hlídka v žních 0 čd (Vlkov má pole daleko od lesa, ohrožené díly nestojí za hlídku),
  strhnutý dobytek 0, úmrtí hladem i na lovu 0 (1 zranění na lovu), lidí 43 → 46 jako dosud.
- **Lov rodu 90–135 kg ročně** – pod cílem 350–400 kg: Vlkov má malý strop zvěře (jelení 6,
  prasata 2–3), lovit není co. Prasata 1. 5. na stropu (2 z 2) – cíl „pod 70 % stropu“ se při
  tak malých číslech neprojeví.
- **Determinismus:** po 1 dni (30×), 1 den + 29 dní a 30 dní naráz stejný otisk stavu.
- **Výkon:** rok Vlkova naráz 27,91 s proti 27,75 s (+0,6 %, nejlepší ze dvou).

**Čerstvé vsi 4 × 14 let** (skutečná krajina, seed 101–104, první pole 1,7 ha, les 194–215 m od
vsi, bez rodu – bez lovu a objížďky):

- Škoda 2,0 / 4,3 / 5,4 / 5,9 % úrody za 14 let (nejhorší rok 6,8 %), noční hlídka 0–13 čd.
- Ryby 4,7–6,1 t za 14 let (≈ 340–435 kg ročně – nad odhadem 150–200 kg), zajíci 6–8 ročně,
  strhnuto 0–26 kusů dobytka za 14 let, úmrtí hladem 0.
- **Bez hráče** (ves bez staveb a nových polí, do 8 lidí na 1,7 ha) hladoví ves stavbou: 2930–3300
  dní hladu za 14 let proti dosavadním 2520–2910 – zvěř hlad prodlouží o ≈ 10–25 %. **S hráčem**
  (kalibrace `measure-village` 4 × 14 let – hráč staví i nestaví) beze změny: nasycení ≥ 0,95
  ve 100 % let, bez hladu, porody 9,0 a úmrtí dětí 0,5 na ves jako dosud.

**Ve scéně** (vývojová ukázka `/dev/landscape`, `e2e/wildlife-scene.spec.ts` s
`WILDLIFE_DEV_URL`, WebGL 2 i WebGPU bez chyb konzole; běžný e2e `village.spec.ts` – modely
`wild-*` se načtou, klik na zvíře otevře panel druhu):

- Prasata na dílu se škodou a selata – velikost vůči lidem dobrá; psi u kůlu i na začátku lovu
  dobíhají k lovcům bez skoku; jezdec lovu vyjíždí od kůlu.
- **Jelení na okraji lesa** (pás −7 až +5 m od hranice lesa, stejný jako prasata vsi) jsou při
  přiblížení **pod korunami** – zakryté; náprava = vlastní pás zvěře venku z lesa (např. 0 až
  +8 m) – větší zásah do rastru pastvin, zatím ne.
- Rybáře a děti s řehtačkou ukázka nevykreslila (ukázková ves nemá podíl práce `fish` ani volné
  výrostky) – ověřeno jen testy plánů (`anglers.test.ts`).
