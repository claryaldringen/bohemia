# Přírodní pohromy – zlé roky, kroupy, povodně, požár, smršť

Stav: **schváleno Martinem 27. 10. 2026** (noční návrh Clauda prošel otázku po otázce, s úpravami;
tornádo doplnil týž den). Nic z toho zatím není v kódu – plán implementace:
[2026-10-27-disasters.md](../superpowers/plans/2026-10-27-disasters.md). Navazuje na
[pole](fields.md) (úroda, pojistka zásob, obilné jámy), [stravu a dobytek](diet.md), [orání
rádlem](oxen.md) (seno), [obyvatelstvo](population.md) (hlad, hájení), [divokou zvěř](wildlife.md)
(škody na dílech), [obchod](trade.md) (sousedé), [les](forest.md) a [krajinu](landscape.md) (niva
potoka). Čísla zdůvodňuje [rešerše](research/2026-10-27-disasters.md). Co níž není výslovně
Martinovo (citace s datem), je návrh Clauda – Martin ho schválil v celku 27. 10. 2026
(„všechny části“).

## Proč

Martin, 24. 10. 2026: „Teď žije vesnice v ideální krajině – nedějí se jí žádné přírodní
pohromy, žádná neúroda atd.“

Martin, 26. 10. 2026: „Teď si musíme vystačit s dvojpolím a zkalibrovat to, aby vesnice za
normálních okolností nehladověla, protože až přidáme přírodní katastrofy, bude to hukot.“

Dnes dá stejná práce na stejné půdě vždy stejnou úrodu ([pole](fields.md) – Úroda: „Bez
náhody … Dobré a špatné roky přijdou až s mechanikou počasí; hájení z populace se pak rozšíří
i na neúrodu“, Martin). Pojistka zásob (0,5 roční potřeby celé energie) čeká na hubené roky:
„Hubené roky (pohromy, neúroda) přijdou později; pojistka se pak doladí s nimi.“ Raně středověká
ves žila od žní ke žním – jeden zlý rok ji vyčerpal, dva za sebou přinesly hlad (Čechy
1281–1282, rešerše §1). Bez pohrom nemají pojistka, obilné jámy, dobytek jako živá zásoba ani
obchod se sousedy skutečnou zkoušku.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** **zlé roky počasí** sdílené celým krajem – mapou (sucho, deštivé léto, krutá zima)
  a **místní pohromy** jedné vsi (kroupy, povodeň potoka, požár, smršť) – jen přes existující
  mechaniky: úroda dílů, seno a pastva, zásoby, hlad, stav staveb, stromy, sousedé.
- **Cíl:** **krajina rozhoduje** – stejný zlý rok dopadne jinak na velký nerozdělený lán a jinak
  na pole mezi stromy, v nivě nebo na vršku (ochrana dílu níž). Martin, 27. 10. 2026: „Sucho by
  mělo mít různé dopady podle typu krajiny.“
- **Cíl:** ves **za normálních okolností nehladoví** (Martin, 26. 10. 2026); s plnou pojistkou
  **přežije jeden krutý rok** bez úmrtí hladem; **dva kruté roky za sebou** přinesou hlad
  a úmrtí, ale ves nevymře (rešerše – 1281–1282, Campbell a Ó Gráda).
- **Cíl:** **deterministicky** – počasí, výška povodně a smršť ze seedu počasí mapy a roku,
  kroupy a požár ze seedu vsi a roku; stejný stav a den dá vždy stejný výsledek, nezávisle na dopočtu
  po kouscích.
- **Cíl:** hráč i ves se mohou **připravit** – pojistka, obilné jámy, ozim i jař, stromy mezi
  poli, rozptýlená pole mimo nivu, seno s rezervou, rozestupy domů, obchod. Žádná nová velká
  mechanika.
- **Cíl:** pohroma je **vidět a vysvětlit** – ve scéně, v kronice, v odhadu úrody dílu.
- **Ne-cíl (teď):** dobytčí mor (fáze 2 – Martin, 27. 10. 2026), epidemie lidí, sarančata,
  **pevné historické události** (Martin, 27. 10. 2026: „Ne, pevné historické události zatím
  nebudou“), pozdní mráz v květu sadu, vichřice mimo smršť, požár lesa, myší roky, předpověď
  počasí, změna krajiny povodní.
- **Anti-cíl:** pohroma, která vyhladí ves za jeden rok; náhoda, kterou nejde vysvětlit; hašení
  jako klikací minihra (vesničané hasí sami); pohroma, proti které nejde nic udělat; vesničané,
  kteří na zlý rok nereagují (seč, osev, porážka, hašení reagují samy – „Vesničané sami
  používají, co jim ulehčí práci“, Martin).

## Které pohromy

| Pohroma                       | Doklad (rešerše)                                                     | Fáze                      |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------- |
| Sucho                         | nejčastější extrém počasí v Čechách (Brázdil 2013), Kosmas – neúrody | **1**                     |
| Deštivé léto a mokré žně      | neúrody 1315–1317 (Zbraslavská kronika)                              | **1**                     |
| Krutá zima – holomráz, dlouhá | agronomie (vymrzání ozimu), _neověřeno_                              | **1**                     |
| Kroupy                        | agronomie (úzký pás), _neověřeno_                                    | **1**                     |
| Povodeň potoka                | Kosmas si všímá povodní; seznam povodní od 1118                      | **1**                     |
| Požár                         | hlad i po požáru zásob (Dvořáčková-Malá 2021)                        | **1** (Martin 27. 10.)    |
| Smršť (tornádo)               | Kosmas, Vyšehrad 30. 7. 1119 (Brázdil 2020 – F3)                     | **1** (Martin 27. 10.)    |
| Dobytčí mor                   | 10–14 nákaz 750–950, 809–810 (Newfield); 1319–1320 ≈ 62 % skotu      | **2** (Martin 27. 10.)    |
| Sarančata                     | v Čechách až od 1338 (Brázdil)                                       | později – ne pevně        |
| Epidemie lidí                 | Justiniánův mor v Bavorsku (6. st.), v Čechách nedoložen             | později                   |
| Chladná léta 536 – ≈ 660      | pozdně antická doba ledová (Büntgen 2016)                            | ne – bez pevných událostí |

Martin, 27. 10. 2026: „Pojďme na požár“ (požár v první fázi, dobytčí mor ve druhé). „Přidej
i tornádo. Máme ho doložené z Kosmovy kroniky. Jen dej pravděpodobnost obvyklou pro střední
Evropu.“

## Kraj a ochrana nové vsi

- **Kraj = mapa.** Martin, 27. 10. 2026: „První možnost“ – **počasí roku je společné celé mapě**
  (všechny vsi hráče na jedné mapě mají stejné léto i zimu, sousedé v témž kraji také);
  **kroupy, povodeň a požár jsou po vsích** (ze seedu vsi). Smršť má stopu přes mapu (ze seedu
  počasí mapy) a zasáhne ty vsi, přes které přejde (návrh Clauda – dvě vsi na jedné mapě uvidí
  tutéž smršť).
- **Výška povodně je společná pro celý kraj.** Martin, 27. 10. 2026: „Ano a ano“ – tentýž potok
  má v celém kraji tutéž roční nejvyšší vodu (ze společného počasí kraje). **Škody** podle
  políček a **pětiletá ochrana** nové vsi zůstávají po vsích.
- **Seed počasí mapy** (návrh Clauda): každá mapa (sídlo) má vlastní náhodný **seed počasí**
  uložený na serveru. Není to seed krajiny – ten zná i prohlížeč (krajinu a překážky počítá
  sám) a kód je veřejný, takže by šlo spočítat budoucí počasí. Seed počasí se klientovi nikdy
  neposílá; klient dostane jen počasí, které už je vidět (sloupec „Kdy je vidět“).
- **Ochrana nové vsi.** Martin, 27. 10. 2026: „Pětiletou ochranu“ – **prvních 5 let vsi žádné
  místní pohromy** (kroupy, povodeň, požár, smršť). **Počasí kraje platí i pro novou ves naplno** –
  poloviční síla počasí v prvních 30 letech z nočního návrhu **není**. Osadníci přicházejí se
  zásobami na 18 měsíců; hájení dospělých před smrtí hladem ([populace](population.md) – Hájení)
  zůstává, jak je.

## Počasí roku – kraj

Počasí roku je čistá funkce **seedu počasí mapy a herního roku**. Má dvě části – **zimu**
(prosinec–březen, patří k roku, ve kterém končí) a **léto** (duben–srpen).

### Léto

| Léto                  | Četnost | Ozim  | Jařiny¹ | Seno  | Pastva | Kdy je vidět |
| --------------------- | ------- | ----- | ------- | ----- | ------ | ------------ |
| dobré                 | 25 %    | ×1,15 | ×1,15   | ×1,10 | ×1     | 1. 6.        |
| normální              | 46 %    | ×1    | ×1      | ×1    | ×1     | –            |
| suché                 | 10 %    | ×0,90 | ×0,75   | ×0,70 | ×0,8   | 1. 5.        |
| **kruté sucho**       | 4 %     | ×0,75 | ×0,50   | ×0,45 | ×0,6   | 1. 5.        |
| deštivé               | 11 %    | ×0,85 | ×0,85   | ×0,75 | ×1     | 1. 6.        |
| **mokré žně** (kruté) | 4 %     | ×0,60 | ×0,60   | ×0,60 | ×1     | 1. 6.²       |

¹ Jařiny = jař, luštěniny a len (setí na jaře).
² 1. 6. je vidět deštivé léto; že jsou žně mokré (kruté), se ukáže 15. 7. (návrh Clauda).

- **Sucho** – Martin schválil četnost 14 % let (z toho 4 % kruté) a dopady z tabulky; sucho bije
  hlavně jař (mělké kořeny, 73,7 % suchých měsíců je duben–září, Brázdil 2013), ozim dozraje dřív.
- **Deštivé léto** – Martin, 27. 10. 2026: „Jo“ – 15 % let (11 % mírné, 4 % kruté – mokré žně);
  obilí ×0,85 / ×0,6, seno ×0,75 / ×0,6 (hnije při sušení), **výmlat +20 % práce** (vlhké snopy);
  pastvě neškodí.
- **Zlé roky se shlukují** (Bekar 2019 – neúroda zvýší šanci příští o 20–30 %): po zlém létě
  (suché, kruté sucho, deštivé, mokré žně) jsou šance zlých let příští rok **×1,25** na úkor
  normálního.
- **Násobí se hrubá úroda** dílu při sklizni (stejně jako nedodělaná práce a škoda zvěře);
  osivo (175 kg/ha) se odkládá celé, takže **čistá úroda klesne víc** – při úrodě 585 kg/ha dá
  hrubá ×0,625 jen ≈ 190 kg místo 410 kg čistého (−53 %). Tak vypadá raně středověký hladový rok
  při výnosu 1 : 3 (rešerše §2).

### Zima

| Zima          | Četnost | Dopad                                                                                                                      | Kdy je vidět |
| ------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- | ------------ |
| normální      | 82 %    | –                                                                                                                          | –            |
| holomrazná    | 9 %     | mráz bez sněhu, **ozim ×0,65** (vymrzne třetina), zeleň pomáhá, vyvýšené díly hůř                                          | 1. 2.        |
| dlouhá sněžná | 9 %     | seno se krmí **o 30 dní déle** (do 30. 4., pastva od 1. 5.), **osev jaře o 2–3 týdny později**, jarní povodeň o stupeň výš | 1. 3.        |

Martin, 27. 10. 2026: „Ano“. Ozim i jař tak **rozkládají riziko**: holomráz bije ozim, sucho jař –
ves, která seje obojí (osevní postup to dělá sám), nepřijde o všechno naráz. Dlouhá zima posune
začátek okna setí jařin o 3 týdny a jeho konec o 2 týdny (návrh Clauda).

### Ochrana dílu – zeleň a vlhkost

Martin, 27. 10. 2026: „Sucho by mělo mít různé dopady podle typu krajiny … velká nerozdělená
plocha polí … stromy mezi poli … solitérní stromy … algoritmus“ – a k návrhu: „Takhle to sedí,
zahrň i vlhkost půdy.“ A po prvním přepočtu Vlkova (zeleň vycházela příliš štědře, holých jen 9 %
dílů): „ochrana polí jak říkáš“ (27. 10. 2026) – zpřísnění níž je návrh Clauda.

Každý díl pole i louky dostane **1. 4.** (jednou za rok – zeleň se mezitím mění kácením, sadem,
jabloněmi u cest) **ochranu 0–1**:

- **Zeleň** – vzdálenost středu dílu k **nejbližší zeleni** _d_: do **15 m plná** (1; zhruba
  výška stromu), dál lineárně ubývá, ve **100 m nula** (zeleň = (100 − _d_) ÷ 85, oříznuto na
  0–1). K tomu **každý solitér do 50 m +0,25**. Zeleň dílu nejvýš 1.
- **Vlhkost** – díl **u vody +0,2**, **vyvýšený díl −0,2**.
- **Ochrana** = zeleň + vlhkost, oříznuto na 0–1.
- **Ztráta suchem × (1 − 0,5 × ochrana)** – násobek dílu = 1 − (1 − násobek roku) × (1 − 0,5 ×
  ochrana). Kruté sucho na jaři (×0,50) dá dílu bez ochrany ×0,50, dílu u lesa ×0,75.

Co je co (návrh Clauda):

- **Zeleň** = stromy a **remízky** mezi poli a na mezích (skupina aspoň 3 stojících stromů nebo
  keřů z vrstvy překážek do 15 m od sebe), sad vsi a jabloně u cest. **Okraj velkého lesa**
  (políčka lesa krajiny a les vsi, tatáž maska jako u zvěře) chrání **jen díly, které s ním přímo
  sousedí** (do 15 m od okraje) – dál se les nepočítá, jeho stín a vlhkost do polí nedosáhnou.
- **Solitér** = stojící strom z vrstvy překážek bez dalšího stromu do 15 m a **jabloň u cesty**.
- **U vody** = střed dílu do 60 m od vodního políčka nebo v nivě (do 1,5 m nad potokem).
  **Vyvýšený** = střed dílu víc než 6 m nad potokem a na hřbetu (výš než průměr políček do 45 m).
- **Bez krajiny** (kalibrace, testy) má každý díl ochranu 0,25 (typická ves).

Proto **velký nerozdělený lán trpí suchem nejvíc** a pole mezi stromy, u lesa a v nivě méně.
Ve Vlkově (3783 dílů) po zpřísnění: zeleň dílů v průměru 0,50, holých (bez zeleně) 25 %.
Stromy na mezích a jabloně u cest jsou hráčova pojistka – stejně jako rozptýlená pole proti
kroupám.

**Deštivé léto – krajina obráceně** (Martin, 27. 10. 2026: „Jo“): ochrana proti mokru je
**niva −0,2, svah +0,2** (voda steče), **zeleň se nepočítá**; ztráta × (1 − 0,5 × ochrana) –
v nivě je ztráta o desetinu větší, na svahu o desetinu menší. Svah = převýšení k sousednímu
políčku aspoň 1,5 m (10 %, návrh Clauda).

**Holomráz** (Martin, 27. 10. 2026: „Ano“): **zeleň pomáhá** (drží sníh a láme vítr),
**vyvýšené −0,2**, voda se nepočítá; ztráta ozimu × (1 − 0,5 × ochrana).

### Co z toho plyne

- **Průměr let:** hrubá úroda ≈ **0,95** dnešní (dobré roky vyrovnají část zlých). **Plán osevu
  počítá s průměrem** (0,95) – ves zaseje o ≈ 5 % víc než dnes a v normálním roce si pojistku
  doplní. Bez toho by ves v průměru ujídala z pojistky.
- **Zlý rok** (hrubá úroda vsi pod 90 % normální): ≈ 1 rok ze 3 (≈ 1,1 dne skutečného času).
- **Krutý rok** (pod 70 %: kruté sucho, mokré žně, holomráz se zlým létem): ≈ **1 rok z 10–12**
  (≈ 4 dny skutečného času).
- **Dva kruté roky za sebou:** ≈ 1 % ročně – **zhruba jednou za století** (≈ 37 dní skutečného
  času, za rok hry ≈ 10×). Krutý rok a po něm zlý: ≈ 4 % ročně.
- Ochrana dílu průměr trochu zvedne (ves se stromy mezi poli projde suchem lépe) – čísla výš
  platí pro ves bez ochrany.

## Místní pohromy – jedna ves

Kroupy a požár ze **seedu vsi a roku**; výška povodně z počasí kraje (škody po vsích), smršť ze
seedu počasí mapy (stopa přes mapu).
**Prvních 5 let vsi žádné** (Martin, 27. 10. 2026: „Pětiletou ochranu“).

### Kroupy

Martin, 27. 10. 2026: „Stromy by měly pole před kroupami částečně chránit“ – k návrhu „ano“.

- **Kdy:** jeden den **června až srpna**, šance **6 % ročně** (≈ 1 z 16 let).
- **Kde:** pruh **300 m** široký přes celé okolí vsi (směr a posun ze seedu). Díly, jejichž střed
  leží v pruhu, přijdou o **60 % nesklizené úrody** (ozim před žněmi, jařiny, nesklizené louky);
  **okraje pruhu** (vnějších 50 m z každé strany, návrh Clauda) o **30 %**. Sklizené díly a louky
  po seči nic.
- **Stromy chrání:** ztráta dílu × (**1 − 0,4 × zeleň**) – jen zeleň z ochrany dílu, bez vlhkosti.
  **Bez směru** – nepočítá se, odkud bouře přišla; strom chrání z kterékoli strany.
- **Sad** v pruhu **−40 % letošních jablek**; **střechy staveb** v pruhu **zchátrají o rok**
  (stav − roční chátrání stavby).
- **Kolik:** pruh zasáhne typicky 10–25 % polí – ves přijde o ≈ 10 % úrody roku. **Rozptýlená
  pole** jsou pojistka (hráč volí, kde zakládá pole – jako u zvěře les).
- Škoda jde do úrody dílu stejně jako škoda zvěře (podíl hrubé úrody po dílech).

### Povodeň potoka

Martin, 27. 10. 2026: „Velikost povodně by se měla lišit. Jednou za 100 let … stoleté …
dvousetleté … pětisetleté … tisícileté vody. Naplavenina by měla hnojit víc.“ – k návrhu „Ano“.

**Roční nejvyšší voda** podle doby návratu (výška nad hladinou potoka):

| Voda        | Šance za rok | Výška |
| ----------- | ------------ | ----- |
| žádná       | 43,2 %       | –     |
| malá        | 30 %         | 0,3 m |
| pětiletá    | 20 %         | 0,7 m |
| dvacetiletá | 5 %          | 1,2 m |
| stoletá     | 1 %          | 2,0 m |
| dvousetletá | 0,5 %        | 2,4 m |
| pětisetletá | 0,2 %        | 3,0 m |
| tisíciletá  | 0,1 %        | 3,5 m |

- **Po dlouhé sněžné zimě** (jarní voda) **a v deštivém létě nebo při mokrých žních** (letní voda)
  je voda **o stupeň výš** (žádná → malá, …, tisíciletá zůstává). Obojí naráz jen o jeden stupeň
  (návrh Clauda). Kvůli tomu posunu vychází **stoletá a vyšší voda efektivně ≈ 3 % let**, ne
  1,8 % z tabulky (tabulka platí pro roky bez posunu).
- **Kdy** (návrh Clauda): **jarní** (tání, 1.–20. 3.) nebo **letní** (bouřky, 15. 6. – 15. 8.);
  po dlouhé zimě jarní, v deštivém létě letní, jinak ze seedu počasí mapy půl na půl. Voda stojí
  3 dny.
- **Pro celý kraj** (Martin, 27. 10. 2026: „Ano a ano“): stupeň vody i její den jsou součást
  **počasí roku kraje** – dvě vsi na témže potoce mají v jednom roce stejně vysokou vodu týž den
  (den návrh Clauda). Kolik vsi zatopí, záleží na jejích políčkách a výšce nad potokem; nová ves
  má 5 let žádné škody.
- **Zatopené políčko:** výška nad potokem (`heightAboveStream` – tatáž výška, která dává nivě
  vyšší úrodnost) je menší než výška vody; **hloubka** = výška vody − výška nad potokem.
  **Krajina se nemění** – po ostrém spuštění se vrstva nesmí změnit; voda je jen ve scéně a škoda
  ve stavu vsi.
- **Škody podle hloubky** (stupně Martin schválil, čísla návrh Clauda):

| Hloubka   | Nesklizená úroda a louky | Ozim (jarní voda) | Stavby | Zemnice  | Naplavenina |
| --------- | ------------------------ | ----------------- | ------ | -------- | ----------- |
| do 0,5 m  | ×0,7                     | ×0,85             | −10 %  | −30 %    | +10 %       |
| 0,5–1,5 m | ×0,3                     | ×0,5              | −30 %  | −60 %    | +20 %       |
| nad 1,5 m | ×0                       | ×0,2              | −60 %  | zřítí se | +30 %       |

- **Stavby:** stav klesne o tolik; co dojde na nulu, spadne (zbytek jámy jako po rozpadu,
  [populace](population.md) – Po zániku); obydlený dům obyvatelé opraví prací vsi jako jindy.
  **Obilná jáma v zatopeném políčku:** zrno −25 % (zateče) – a nová jáma se nekope níž než
  dvacetiletá voda (1,2 m nad potokem).
- **Úmrtí** (Martin, 27. 10. 2026: „A ať zabíjí tak jak navrhuješ“): **od pětisetleté vody výš**
  (pětisetletá a tisíciletá, 3 m a víc) zemře každý obyvatel zatopeného obydlí s šancí **2 %**.
- **Naplavenina hnojí:** úrodnost zatopeného dílu **+10 / +20 / +30 %** přirozené podle hloubky,
  **nejvýš 130 % přirozené**. Ubývá osevem jako jiná úrodnost (návrh Clauda).
- **Pole v nivě** jsou úrodnější a ohroženější – volba hráče.

### Požár

Martin, 27. 10. 2026: „Pojďme na požár“.

- **Šance:** **0,4 % na stavbu a rok** (ves s 15 domy ≈ 6 % ročně, ≈ 1 z 17 let). Násobky:
  **suché léto ×2, kruté sucho ×3** (duben–srpen), **kovárna, milíř a pec ×3**, **zemnice ×½**,
  **zima víc** (listopad–únor ×1,5 – topí se), **mokré léto míň** (×½). Den ze seedu.
- **Co hoří** (návrh Clauda): obydlí, dílny a dvorec vojvody; milíř je jen zdroj ohně, ne cíl.
- **Přeskok:** stavba do **6 m** chytí s šancí **70 %**, do **12 m** s **40 %** (vzdálenost
  obrysů); **zeleň mezi domy** (strom, keř nebo sad na spojnici) šanci **půlí**. Oheň přeskakuje
  **řetězově** – každá stavba, která chytí, zkusí své sousedy jednou, dokud ho rozestupy, zeleň
  a řetěz s vědry nezastaví (Martin, 27. 10. 2026: „Ano a ano“). Rozestupy domů jsou na hráči.
- **Co shoří:** stavba (stav 0 → zbytek jámy jako po rozpadu) a **zásoby domu**: zrno mimo jámy,
  maso a sýr **÷ počet obydlí**. **Zrno v zapečetěné jámě přečká.** **Stoh do 12 m** od hořící
  stavby shoří (seno ÷ počet stohů). Obyvatelé bydlí u příbuzných (Rozpad domácnosti) a **sami
  dům přestaví** (Přestavba – rozhodují obyvatelé).
- **Lidé neumírají** – smrt přijde jen z hladu po ztrátě zásob.

### Hašení – řetěz s vědry

Martin, 27. 10. 2026: „Chci, aby všichni dospělí hasili. Ať udělají řetěz s vědry od nejbližší
vody.“ A: „Lidé musí být rozložení ve stejných vzdálenostech … ten poslední chodí.“ – k návrhu
„Ano“.

- **Kdo:** **všichni dospělí vsi**; ten den nedělají nic jiného (pole, stavby, péče). Děti
  a staří ne (návrh Clauda).
- **Řetěz:** od **nejbližší vody** (potok) k hořící stavbě, lidé **rovnoměrně po celé cestě**:
  **rozestup = vzdálenost ÷ počet dospělých**.
- **Do 2,5 m** si vědra **podávají** z ruky do ruky; **víc** – **každý nosí** vědro tam a zpět po
  svém úseku.
- **Účinnost = min(1; 2,5 ÷ rozestup)** – 40 dospělých na 100 m od vody hasí naplno, 20 dospělých
  na 100 m s polovinou.
- **Plný řetěz zastaví přeskok se 70 %** – šance přeskoku × (1 − 0,7 × účinnost).
- **Hořící stavba** se při plném řetězu **jen poškodí o 50 %** místo zřícení – stav klesne
  o 1 − 0,5 × účinnost (bez hašení na nulu); zásoby domu shoří ve stejném poměru (návrh Clauda).
- Řetěz vede k první hořící stavbě; jeho účinnost platí pro všechny stavby, které ten den hoří
  (návrh Clauda). Vědra ves má (žádná nová surovina).
- **Ve scéně:** řada lidí s vědry od potoka k ohni (jako v 0 A.D.).

### Smršť (tornádo)

Martin, 27. 10. 2026: „Přidej i tornádo. Máme ho doložené z Kosmovy kroniky. Jen dej
pravděpodobnost obvyklou pro střední Evropu.“ Kosmas zapsal k 30. 7. 1119 vichr, který na
Vyšehradě pobořil části knížecího paláce, „sám satan v podobě víru“ (rešerše §6).

**Četnost** (rešerše §6 – výpočet, návrh Clauda): ve střední Evropě ≈ **0,5 tornáda na
10 000 km² za rok** (Česko: 2–5 zaznamenaných ročně). Mapa kraje (128 × 15 m = 1,92 km) to
dává:

- **přes mapu kraje** ≈ **0,10 % ročně** – jednou za ≈ 980 herních let; za skutečný rok hry
  (1000 let) aspoň jedno s **64 %**,
- **přes jádro vsi** (≈ 300 × 300 m) ≈ **0,017 % ročně** – jednou za ≈ 5 900 let; ves, která
  přežije celých 1000 let, ji zažije s **15 %**.

Martin chce skutečnou pravděpodobnost, i když je velmi vzácná – žádné zvýšení pro hru. Martin, 27. 10. 2026: „Takhle vzácné tornádo je dobré.“

**Pravidla** (návrh Clauda):

- **Stopa** ze **seedu počasí mapy a roku** – všechny vsi mapy vidí tutéž: den (květen–srpen,
  nejvíc červenec), síla, **směr převážně od jihozápadu k severovýchodu** (české stopy leží v pásech
  JZ–SV, Brázdil 2020), délka a šířka podle síly (průměr z ESWD ±50 %):

| Síla | Podíl | Délka stopy | Šířka stopy |
| ---- | ----- | ----------- | ----------- |
| F0   | 40 %  | 2,6 km      | 35 m        |
| F1   | 35 %  | 6,9 km      | 82 m        |
| F2   | 20 %  | 10,2 km     | 124 m       |
| F3   | 4,5 % | 17,5 km     | 343 m       |
| F4   | 0,5 % | 23,1 km     | 383 m       |

- **Ochrana nové vsi** 5 let jako u ostatních místních pohrom – stopa přejde, škody se nepočítají.
- **Škody v pásu podle síly:**

| Síla | Stavby (stav)   | Zemnice  | Nesklizená úroda | Stromy vyvrácené | Stohy       | Úmrtí v zasažených obydlích |
| ---- | --------------- | -------- | ---------------- | ---------------- | ----------- | --------------------------- |
| F0   | −15 % (střechy) | −5 %     | −20 %            | 10 %             | půl rozmetá | –                           |
| F1   | −40 %           | −15 %    | −50 %            | 30 %             | rozmetané   | –                           |
| F2   | zřítí se        | −40 %    | −80 %            | 70 %             | rozmetané   | –                           |
| F3   | zřítí se        | zřítí se | −100 %           | všechny          | rozmetané   | 1 % na člověka              |
| F4   | zřítí se        | zřítí se | −100 %           | všechny          | rozmetané   | 3 % na člověka              |

- **Stromy** v pásu se vyvrátí – z vrstvy překážek zmizí jako pokácené (kmen leží na zemi, ves ho
  zpracuje jako kládu bez kácení – [les](forest.md)); vyvrácené ovocné stromy sadu a jabloně
  u cest ves obnoví jako staré.
- **Zemnice** odolá lépe (je zahloubená). Zřícená stavba = zbytek jámy a přestavba jako po
  požáru; **úmrtí jen u F3 a F4** (Brázdil 2020: 108 významných tornád za 900 let, ≥ 8 mrtvých).
- **Ve hře:** hráči se říká **„Smršť“** (dobové slovo; síla jen v popisku – „Silná smršť“).

## Dopady na existující mechaniky

- **Úroda** ([pole](fields.md) – Úroda): hrubá úroda dílu × počasí dílu (s ochranou) ×
  (1 − kroupy) × (1 − povodeň) × (1 − smršť) × (1 − zvěř). Odhad úrody dílu v panelu ukazuje
  i počasí, jakmile je vidět.
- **Seno a pastva** ([orání rádlem](oxen.md) – Seno, [strava](diet.md) – Zimní krmení): výnos
  seče × seno roku (s ochranou dílu louky). **Seč 1. 6. plánuje s letošním výnosem** – v suchém
  roce ves poseče víc luk (víc práce), dokud louky stačí. Nosnost pastvy v létě × pastva roku
  (bez ochrany – pastva je celé vsi). Dlouhá zima prodlouží krmení do 30. 4. – co seno nevydrží,
  řeší dnešní porážka v zimě.
- **Seno s rezervou:** plán seče **+15 %** (rezerva na dlouhou zimu a suchý rok). Stojí ≈ 15 %
  práce seče navíc.
- **Zásoby a pojistka** ([pole](fields.md) – Osev podle zásob): pojistka zůstává **0,5 roční
  potřeby celé energie** – s průměrem let v plánu osevu ji ves v normálních letech udrží.
  **Paměť hladu:** po krutém roce drží ves **10 let pojistku 0,75** (seje víc sama – vesničané
  si zlý rok pamatují), pak zase 0,5.
- **Hlad** ([populace](population.md) – Hlad a vymření): beze změny – nouzová porážka, šetření,
  hlad a úmrtí přijdou samy z menších zásob.
- **Hájení** ([populace](population.md) – Hájení): zůstává, jak je (dospělí v prvních letech
  neumírají hladem). Počasí na ně nebere ohled; místní pohromy prvních 5 let ne (výš).
- **Stavby** ([populace](population.md) – Chátrání a přestavba): povodeň a kroupy ubírají stav,
  požár a smršť stavby zničí – přes dnešní stav, chátrání, zbytek jámy a přestavbu.
- **Les** ([les](forest.md)): smršť vyvrátí stromy jako kácení; kmeny jdou na klády.
- **Obchod** ([obchod](trade.md) – Sousedé): sousedé jsou ve stejném kraji. Při doplnění **1. 11.**
  po zlém roce mají **poloviční zásobu obilí** a obilí je **o polovinu dražší** (ostatní zboží
  v kg obilí ×0,67); po krutém roce **čtvrtinovou zásobu** a obilí **dvakrát dražší** (×0,5) –
  ceny v hladovém roce na dvoj- až trojnásobek (Ó Gráda 2005). Dobytek je pak levný – ves bez
  sena ho prodá, ves s pojistkou nakoupí. Hřivny jsou uložená hodnota na zlý rok.
- **Zvěř:** po holomrazné nebo dlouhé zimě 1. 5. ubude navíc 10 % jelení zvěře a 15 % prasat;
  v krutém suchu (málo žaludů) jen poloviční počet selat.
- **Krajina:** beze změny – niva je už dnes v `floodplain.ts`, povodeň ji jen využije.

## Kalibrace

**Cíle:**

1. **Normální okolnosti** (všechny roky normální): ves po hájení **nikdy nehladoví** – žádné
   „Ves hladoví“ (energie pod 90 %), „Ves šetří jídlem“ nejvýš výjimečně v rostoucí vsi
   (Martin, 26. 10. 2026). To je úkol dvojpolí a čísel úrody – musí platit **před** pohromami.
2. **Jeden krutý rok s plnou pojistkou:** žádné úmrtí hladem; nejvýš „Ves šetří jídlem“ před
   žněmi, nouzová porážka smí.
3. **Dva kruté roky za sebou:** „Ves hladoví“, umírají děti a starší – ves ztratí **≈ 10–25 %
   lidí**, ale nevymře; v hájení dospělí neumírají.
4. **S pohromami v průměru:** ≥ 95 % let bez hladu (energie ≥ 0,9).
5. **Nová ves** (osadnické zásoby na 18 měsíců) přežije krutý rok v prvních letech bez úmrtí
   hladem dospělých – poloviční síla počasí už ji nechrání.

**Proč by to mělo vyjít:** ves jí ≈ 70 % energie z pole ([pole](fields.md) – pojistka). Krutý
rok ubere ≈ 50 % čisté úrody → ≈ 35 % roční energie; pojistka 0,5 to pokryje a zbyde ≈ 15 %
(plus maso z porážky bez sena). Druhý krutý rok ubere dalších ≈ 35 % – chybí ≈ 15–20 % roční
energie, ves jí ≈ 80–85 % přídělu a podle [populace](population.md) („Mírný nedostatek (80 %
přídělu) … za rok stojí ≈ 15 % lidí“) přijde o zhruba desetinu až pětinu lidí.

**Jak se to ověří (bez dlouhé kalibrace – ta jen na Martinův pokyn):**

- **Unit testy jádra:** počasí přes 10 000 let dá četnosti z tabulek (±1 %) a shlukování;
  vynucený sled let (jen testy a dev) na ustálené testovací vsi: [krutý] → 0 úmrtí hladem,
  [krutý, krutý] → úmrtí 10–25 %, ves žije, [normální × 10] → bez hladu.
- **`village-calculator.ts`** (ustálený stav, rychlý): přepínač `--weather` s průměrnou úrodou
  0,95 – kolik osevu a práce stojí průměr let.
- **Vlkov a nové vsi:** dev mód **„Vynutit zlý rok“** a **„Vynutit pohromu“** vedle skoku v čase
  ([účty](accounts.md) – dev mód) – Martin projde krutý rok, dva za sebou, povodeň, požár
  a smršť ve hře a sleduje nasycení, porážku, hašení, kroniku.
- **`measure-village`** jen na Martinův pokyn (`--variant disasters`).

## Obrana a příprava (bez nových velkých mechanik)

| Co                             | Proti čemu                  | Kdo                             | Stav                     |
| ------------------------------ | --------------------------- | ------------------------------- | ------------------------ |
| Pojistka zásob 0,5 (0,75)      | zlý a krutý rok             | ves sama                        | je; nově paměť hladu     |
| Obilné jámy                    | požár, ztráty skladováním   | ves sama                        | je; nově ne pod 1,2 m    |
| Ozim i jař                     | holomráz × sucho            | ves sama (osevní postup)        | je                       |
| Stromy mezi poli, sad, jabloně | sucho, holomráz, kroupy     | **hráč** (co nechá a co vysadí) | nově ochrana dílu        |
| Rozptýlená pole mimo nivu      | kroupy, povodeň, mokré léto | **hráč** (kde zakládá pole)     | je                       |
| Seno s rezervou +15 %          | sucho, dlouhá zima          | ves sama                        | nové pravidlo            |
| Dobytek jako živá zásoba       | zlý rok                     | ves sama (nouzová porážka)      | je                       |
| Rozestupy staveb, zeleň mezi   | šíření požáru               | **hráč** (kde staví)            | je                       |
| Řetěz s vědry                  | požár                       | ves sama (všichni dospělí)      | nové                     |
| Obchod, hřivny                 | zlý rok, chybějící seno     | **hráč**                        | je; nově ceny podle roku |

## Co hráč vidí (UI jako 0 A.D.)

- **Horní lišta:** ikona počasí roku (prasklá zem, mrak s deštěm, sněhová vločka s mrazem), jen
  když léto nebo zima nejsou normální a už jsou vidět (sloupec „Kdy je vidět“); slova
  v `Tooltip` („Kruté sucho – jař a seno o polovinu slabší“). Dobré léto: klas se sluncem.
- **Upozornění** (krátká, mizející, jako „Ves šetří jídlem“): „Sucho – nejvíc trpí pole bez
  stromů“ (Martin schválil 27. 10. 2026), „Mokré žně“, „Holomráz – ozim vymrzá“, „Kroupy
  potloukly obilí“, „Povodeň“ (velikost vody v popisku – „Stoletá voda“), „Hoří!“, „Vyhořel dům“,
  „Smršť“. Z jiné vsi hráče s jejím jménem.
- **Kronika:** „Rok 812 – kruté sucho, úroda o třetinu menší“, „Kroupy potloukly 4 díly
  (−1 200 kg)“, „Stoletá voda zaplavila 3 díly a 2 obydlí“, „Vyhořel dům Radoslavův – hasila
  celá ves“, „Silná smršť zbořila 3 domy a vyvrátila 140 stromů“, „Sousedé hladoví – obilí
  zdražilo“.
- **Díl pole:** **ikona ochrany** (zeleň a vlhkost – lístky 0–4, popisek „Stromy chrání před
  suchem“), v odhadu úrody řádky „Sucho −25 %“, „Kroupy −60 %“, „Povodeň −70 %“ (jako škoda
  zvěře); naplavenina jako vyšší úrodnost.
- **Obchod:** u obilí ikona zdražení, když je kraj po zlém roce.
- **Povodeň** v popisku i výška nad běžnou hladinou („Stoletá voda – 2 m nad hladinou“).
- **Scéna** – sekce Ve scéně níž.

## Ve scéně

Martin, 27. 10. 2026: „Jinak je to dobré“ – s dvěma doplňky: „Když je sucho, šlo by nějak
zintenzivnit světlo ve scéně? Ať to vypadá, že slunce opravdu praží?“ a „Když přijde bouřka
s kroupami, chci, aby scéna potemněla a blýskalo se.“ Zbytek je návrh Clauda, schválený týmiž
slovy.

Jen když pohroma nastane – **výchozí letní vzhled (`REFERENCE_DAY`) se v normálním roce nemění**.
**Animace jen v den pohromy**, jinak se **kreslí jen při změně** (vzhled počasí se mění nejvýš
jednou za herní den jako roční období). Světlo navazuje na světlo, roční období a den a noc scény
([mapa kódu – scéna](../code/scene.md): `season-look.ts`, `day-light.ts`, `sun-shadows.ts`) –
počasí je další násobek světla a barev období, ne nové osvětlení.

- **Sucho**
  - Pole a louky **žloutnou a hnědnou podle síly sucha**; **chráněné díly za stromy zůstávají
    zelenější** (ochrana dílu jde do barvy dílu).
  - Obilí je nižší a řidší, v potoce méně vody, tůně se zmenší.
  - **Slunce praží** (Martin): silnější a teplejší slunce – jasnější, žlutější světlo a ostřejší
    stíny, vybledlá obloha a opar, případně tetelení vzduchu nad poli v poledne.
- **Deštivé léto**
  - Ve dnech deště prší (částice), je zataženo a šedé světlo.
  - Kaluže na cestách a v nivě.
  - Tmavší a sytější barvy, před žněmi polehlé obilí.
- **Holomráz:** jinovatka bez sněhu; na jaře řídký, místy žlutý ozim, kde vymrzl, prosvítá hlína.
- **Dlouhá zima:** sníh do dubna, pozdní jaro (listí a tráva o 3 týdny později).
- **Kroupy**
  - V den bouřky tmavá mračna a bílé kroupy v pruhu.
  - **Scéna potemní a blýská se** (Martin) – záblesky světla celé scény, ne jen obloha; hrom.
  - Potom pruh potlučených a polehlých polí, sad bez jablek, poškozené střechy.
- **Povodeň**
  - Voda rozlitá do výšky dané povodně několik dní (3 dny), pak ustupuje.
  - Potom hnědé bahno a naplavenina na polích a loukách (2 týdny), naplavené větve, zřícené domy
    v hluboké vodě.
- **Požár**
  - Oheň a kouř nad domem – znovu použitý oheň z klučení (`clearing-fire.ts`) a dým vsi.
  - **Řetěz lidí s vědry** od nejbližší vody, rovnoměrně rozestavěných: kde je rozestup do 2,5 m,
    podávají si vědra, jinak chodí každý po svém úseku (jako v 0 A.D.).
  - Hořící stoh; potom ohořelé trosky, dokud se dům neobnoví.
- **Smršť**
  - Tmavý trychtýř s vířícím prachem přejde po stopě za pár sekund.
  - Potom pruh vyvrácených stromů (padlé kmeny), rozmetané stohy, polehlá pole a poškozené nebo
    zřícené stavby.
- **Všude:** upozornění, kronika a škoda v panelu dílu; u povodně výška nad běžnou hladinou.
- **Zvuky** (volitelně): déšť, hrom a kroupy, praskání ohně, hukot smrště.

## Pro implementaci (poznámky, ne kód)

Podrobně v [plánu](../superpowers/plans/2026-10-27-disasters.md).

- **Čísla** v novém `rules-disasters.ts` (`WEATHER`, `PROTECTION`, `HAIL`, `FLOOD`, `FIRE`,
  `FIREFIGHTING`, `TORNADO`, `DISASTER_TRADE`) s odkazy na sekce tohoto návrhu; změna čísla =
  i text zde.
- **Doména:** `weather.ts` – počasí roku ze seedu počasí mapy (čistá funkce; shlukování přes
  předchozí roky omezené na pár let zpět, ať je to O(1)); `part-protection.ts` – ochrana dílu;
  `disasters-*.ts` – kroupy, povodeň, požár, hašení, smršť. Pořadí v `simulate.ts` pevné.
- **Stav:** volitelné `VillageState.weatherSeed` (kopie seedu počasí mapy – každá ves počítá
  počasí sama, bez sdíleného stavu) a `VillageState.disasters` (ochrana dílů, škody po dílech,
  dnešní požár a řetěz, paměť hladu). Starší vsi se převedou při načtení jednou a idempotentně.
- **Server je autorita** – klient dostane jen počasí, které už je vidět, nikdy budoucí ani seed.
- **Scéna:** typy z jádra a `lib/village-view.ts`; `season-look.ts` dostane vstup počasí roku
  (sucho, mokro, sníh) – při normálním roce beze změny vzhledu; voda povodně jako samostatná
  plocha nad zatopenými políčky (`needsRender` při změně), oheň a dým z existujících tříd.

## Navazuje

- [Pole](fields.md) – Úroda („Bez náhody“ končí), Osev podle zásob (pojistka, průměr let), Obilné
  jámy; [orání rádlem](oxen.md) – Seno; [strava](diet.md) – Zimní krmení, Nouzová porážka,
  Náměty – Nákazy (dobytčí mor ve fázi 2); [populace](population.md) – Hlad a vymření, Hájení,
  Přestavba; [zvěř](wildlife.md) – Škody (stejný model škod po dílech, vzdálenost od lesa);
  [les](forest.md) – kácení a klády; [obchod](trade.md) – Sousedé; [krajina](landscape.md) – niva
  potoka; [válka](war.md) – vypálení vsi později stejnou cestou jako požár.

## Rozhodnutí

| Rozhodnutí                                                                                                                  | Kdo                                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Ves zatím v ideální krajině, bez pohrom a neúrody                                                                           | Martin (24. 10. 2026)                                  |
| Napřed dvojpolí a kalibrace, ať ves za normálních okolností nehladoví; pak pohromy                                          | Martin (26. 10. 2026)                                  |
| Úroda bez náhody, dobré a špatné roky až s počasím; hájení se pak rozšíří i na neúrodu                                      | Martin                                                 |
| Pojistka 0,5 se doladí s hubenými roky                                                                                      | Martin (19. 10. 2026)                                  |
| Počasí pro celý kraj (mapu), kroupy, povodeň a požár po vsích                                                               | Martin (27. 10. 2026)                                  |
| Nová ves 5 let bez místních pohrom; počasí naplno, bez poloviční síly 30 let                                                | Martin (27. 10. 2026)                                  |
| Fáze 1: sucho, deštivé léto, krutá zima, kroupy, povodeň, požár; dobytčí mor ve fázi 2                                      | Martin (27. 10. 2026)                                  |
| Bez pevných historických událostí                                                                                           | Martin (27. 10. 2026)                                  |
| Sucho 14 % (4 % kruté); ochrana dílu ze zeleně (30 → 150 m, solitéry +0,25) a vlhkosti (±0,2); ztráta × (1 − 0,5 × ochrana) | Martin (27. 10. 2026)                                  |
| Deštivé léto 15 % (11 + 4); niva −0,2, svah +0,2, zeleň ne; výmlat +20 %                                                    | Martin (27. 10. 2026)                                  |
| Holomráz 9 % (ozim ×0,65, zeleň pomáhá, vyvýšené −0,2); dlouhá zima 9 % (seno +30 dní, osev později)                        | Martin (27. 10. 2026)                                  |
| Kroupy 6 %, VI–VIII, pruh 300 m, −60 % (okraje −30 %), × (1 − 0,4 × zeleň), bez směru; sad −40 %, střechy o rok             | Martin (27. 10. 2026)                                  |
| Povodeň podle doby návratu (malá až tisíciletá), o stupeň výš po dlouhé zimě / v mokrém létě                                | Martin (27. 10. 2026)                                  |
| Škody povodně po stupních hloubky; od pětisetleté vody 2 % úmrtí v zatopeném domě; naplavenina +10/20/30 %, strop 130 %     | Martin (27. 10. 2026)                                  |
| Požár 0,4 %/stavbu/rok s násobky; přeskok 70 % / 40 %, zeleň půlí; stoh do 12 m; lidé neumírají                             | Martin (27. 10. 2026)                                  |
| Hasí všichni dospělí řetězem s vědry od nejbližší vody, rovnoměrně, účinnost min(1; 2,5 ÷ rozestup)                         | Martin (27. 10. 2026)                                  |
| Smršť (tornádo) v první fázi s obvyklou středoevropskou četností                                                            | Martin (27. 10. 2026)                                  |
| Smršť: stopa ze seedu mapy, 0,5 / 10 000 km² ročně, síly F0–F4, úmrtí jen F3–F4 („Takhle vzácné tornádo je dobré“)          | Martin (27. 10. 2026), čísla návrh Clauda (rešerše §6) |
| Ve scéně: návrh Clauda („Jinak je to dobré“); v suchu slunce praží, při kroupách scéna potemní a blýská se                  | Martin (27. 10. 2026)                                  |
| Četnosti léta a zimy v tabulkách; zlé roky se shlukují ×1,25; násobí se hrubá úroda, osivo celé                             | návrh Clauda (rešerše), schváleno                      |
| Osev počítá s průměrem let 0,95; paměť hladu – pojistka 0,75 na 10 let po krutém roce                                       | návrh Clauda, schváleno                                |
| Seno s rezervou +15 %; seč plánuje s letošním výnosem                                                                       | návrh Clauda, schváleno                                |
| Sousedé po zlém roce: poloviční zásoba obilí a ×1,5 cena; po krutém čtvrtinová a ×2                                         | návrh Clauda (rešerše), schváleno                      |
| Seed počasí mapy na serveru (ne seed krajiny), klient vidí jen počasí, které už nastalo                                     | návrh Clauda                                           |
| Požár přeskakuje řetězově z každé stavby, která chytí (12 m 40 %, 6 m 70 %, zeleň ½, řetěz s vědry ho zastaví)              | Martin (27. 10. 2026)                                  |
| Výška povodně společná pro celý kraj (tentýž potok) z počasí kraje; škody a 5letá ochrana po vsích                          | Martin (27. 10. 2026)                                  |
| Čísla škod povodně a smrště; den povodně v kraji; co je zeleň, solitér, u vody, vyvýšené a svah                             | návrh Clauda                                           |

## Otázky pro Martina – rozhodnuto 27. 10. 2026

1. **Kraj** – „První možnost“: počasí pro celou mapu, kroupy, povodeň a požár po vsích.
2. **Hájení** – „Pětiletou ochranu“: 5 let bez místních pohrom, bez poloviční síly počasí.
3. **Požár, nebo dobytčí mor** – „Pojďme na požár“: požár v první fázi, mor ve druhé.
4. **Dějiny v kalendáři** – „Ne, pevné historické události zatím nebudou“.
5. **Síla** – Martin prošel a schválil četnosti každé pohromy zvlášť (sucho, deštivé léto, krutá
   zima, kroupy, povodeň, požár); tornádo s obvyklou středoevropskou četností.

6. **Požár a povodeň** – „Ano a ano“: požár přeskakuje řetězově z každé stavby, která chytí;
   výška povodně je společná pro celý kraj (tentýž potok), škody a ochrana nové vsi po vsích.

**Drobnosti návrhu Clauda, které se ověří při implementaci** (Martin je může kdykoli změnit):
čísla škod povodně podle hloubky a škody smrště podle síly.
