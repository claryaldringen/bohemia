# Zlato a klenoty – rýžování, šperkař, mincovna (issue #13)

Stav: **schváleno, plán 6 hotový 27. 11. 2026** (větev `feat/gold-6`, issue #13; Rozhodnutí plánu 6 níž) – Martin 22. 11. 2026 na otázku „Schvaluješ oba návrhy a takové pořadí?“ (obchod s trhy a mincemi, zlato a klenoty; šest plánů: konec smyšlených sousedů, trh bez mincí, vesničané a správce na trhu, kupci a mince, otroci, zlato): „Ano“. Co řekl Martin, je u bodu s datem; ostatní je návrh
Clauda. Stojí na mincích z [obchodu](markets.md) a na prémiové krajině Zlatonosný potok
([prémiové krajiny](premium-landscapes.md), [krajina](landscape.md) – 3–6 náplavů zlatonosného písku).

## Proč

Martin, issue #13 „Zlato a klenoty“ (22. 11. 2026): „Jak už jsme řekli u obchodu, zavedeme mince; Hráči, kteří budou
mít na mapě zlatonosnou řeku nebo potok mohou začít rýžovat zlato - bude na to speciální řemeslník; Toto zlato buď půjde
přímo vyměnit za mince 1:1 váhově nebo ho může použít jako surovinu klenotník; Klenotník jako surovinu může použít zlato
nebo mince; Klenoty lze použít k placení místo mincí, proto pokud má hráč klenotníka, vše, co by platil mincemi má o 50%
levnější“. Prémiové krajiny už počítají s tím, že „zlato z potoka půjde rýžovat“ od začátku, hlubinná ložiska až
s hornictvím (premium-landscapes.md).

## Martinova rozhodnutí (22. 11. 2026)

- **Zlato za mince:** „Zlato lze měnt za mince s kýmkoliv, kdo ty mince má. Jen od roku 950 bude možné použít zlato
  zároveň jako surovinu pro domácí mincovnu“ (k tomu u obchodu: „Slované začali razit vlastní mince až kolem roku
  950“).
- **Šperkař:** na otázku, zda má mít šperk hodnotu 1,5násobku svého zlata (platba o třetinu levnější), nebo dvojnásobku
  (o polovinu levnější): „Na obě strany stejně. Šperky však nebudou vedené jako samostatná komodita, šperkař bude
  prostš fungovat jen jako jakýsi zlevňovač při nákupu a zdražvač při prodeji zlata“. Kupci šperky berou jako „zlato,
  ale o polovinu dráž“ (Martin u obchodu) – výklad Clauda: násobek 1,5 v obou směrech.
- **Šperkař mezi vsemi a kapacita:** na otázku, zda má výhoda šperkaře platit jen s kupci z daleka, nebo i mezi vsemi:
  „I mezi vesnicemi. Ještě jde o kapacitu - 1 šperkař nesmí při velkém množství zlata plošně zlevnit všechno - výroba
  šperku je dost náročná a dlouhp trvá“.
- Shrnutí (rýžovník, zlato za mince 1:1, mincovna od 950, šperkař jako výhoda; řemeslníci s dílnou a učněm, rýžování
  v teplých měsících, omezená kapacita šperkaře) Martin odsouhlasil: „Ano“.

## Pravidla (návrh Clauda)

1. **Rýžovník** – nový řemeslník ([řemesla](crafts.md) – jako ostatní: dílna, učeň, nástupce): rýžuje zlato na náplavech
   zlatonosného potoka nebo řeky na mapě vsi, jen v teplých měsících (voda, bez ledu); kolik zlata za den a jak se náplav
   vyčerpá (zásoba v krajině – premium-landscapes.md, velikost naleziště), určí rešerše (čísla v `rules`).
2. **Zlato** je zboží (zásoba vsi v gramech nebo kg) a **mění se za mince pevně 1:1 váhově s kýmkoli, kdo mince má**
   (Martin) – na trhu i s kupci; jeho cena v mincích je tedy vždy 1:1 (zlato je mezi vsemi jako peníze – návrh Clauda).
   Od 27. 11. 2026 váží mince 2,4 g, za minci jsou tedy 2,4 g zlata (Mince 2,4 g zlata za 90 kg obilí níž).
3. **Mincovna** (od roku 950 – Martin): stavba ve vsi, která ze zlata razí mince 1:1 váhově; práce a stavba podle rešerše.
   Vlastní mince přibydou do oběhu – víc mincí, inflace (markets.md – mince jako zboží).
4. **Šperkař** – řemeslník s dílnou a učněm: šperky nejsou zboží (Martin). Když ves platí zlatem nebo mincemi, šperkař
   „zlevní“: zlato a mince použité k placení mají hodnotu 1,5násobku (ves zaplatí o třetinu méně); když ves prodává
   zlato, šperkař „zdraží“: dostane 1,5násobek. Platí **i mezi vsemi**, nejen s kupci (Martin). **Kapacita** (Martin –
   výroba šperku je náročná a dlouho trvá): výhoda platí jen pro tolik zlata, kolik šperkař za dobu práce zpracuje –
   šperkařovo zpracované zlato přibývá jeho prací (rešerše: kolik gramů za den), platba nebo prodej s výhodou ho ubírá;
   nad to se platí zlatem 1:1.
5. **Kupci** vykupují zlato (s šperkařem dráž) a platí mincemi (markets.md). **Stav po plánu 4 obchodu (26. 11. 2026):** mince už obíhají – přicházejí s cizími kupci na stezkách a ves je hromadí a utrácí hráč a správce (markets.md – Rozhodnutí plánu 4); po plánu 6 kupují i zlato (1 000 g, první v seznamu; měšec 60 mincí zůstal) a platí za ně mincemi; zlato, šperkař a mincovna jsou plán 6 (Rozhodnutí plánu 6).

## Co se ověří

- Ves se zlatonosným potokem: kolik zlata za rok a co za ně ves koupí (zbroj od kupců, zboží na trhu).
- Inflace z mincovny: ceny v mincích v okolí rostou s vlastní ražbou.
- **Test světa – dvě vsi, zlato a cizí kupci tři roky po dnech (plán 6, návrh Clauda). Ověřeno 27. 11. 2026** –
  `market-gold-years.test.ts` (pomalý; vzor plánů 4 a 5). Přípravky: obě vsi vyrostly ze stejné vsi řízené správcem
  od 1. 3. 929 do 28. 2. 949 (krajina 1). **T** leží na kupecké stezce (jedna zastávka z `trailStops`) a má 20 t obilí
  navíc. **G** (táž ves s jiným seedem, 20 t obilí navíc, T v okolí) stojí na téže krajině s typem zlatonosný potok –
  typ jen označí 6 náplavů, ostatní vrstvy jsou bit po bitu stejné (test to ověří) – a dostala u dvorce obydlenou dílnu
  rýžovníka (vyučený muž 30 let se synem 14 let) a šperkaře (vyučený muž 35 let), 1. 1. 950 obydlenou mincovnu (muž 30
  let). Ke všem náplavům se dojde, nejbližší je 210 m po cestách. G na první den kupců každého herního roku pošle do T
  výpravu hráče se vším zlatem a mincemi a seznamem meč, na třetí den kupců s mincemi a seznamem 20 nástrojů (6 výprav).
  Kontrolní běh bez mincovny je jinak stejný. Test po každém dni tvrdí: zlato světa (`goldOfWorld` – vsi, náklad
  a výsledky výprav, kupci do odjezdu) = začátek + vyrýžované − vyražené − zlato, se kterým kupci odjeli; vyražené mince
  G jsou totéž zlato, které G ubylo, gram za minci, před mincovnou a bez ní nula; mince světa se mění jen příjezdem
  a odjezdem kupců jako v plánu 4 a ražbou; mezi vsemi a výpravami se zboží i zlato jen přesouvá; náplav dá nejvýš
  1 500 g a od listopadu do března se nerýžuje; použitelná kapacita šperkaře G nepřeroste kov G, kapacita výpravy při
  odjezdu nepřeroste mince a zlato v nákladu a na trhu ubude nejvýš o kov, který výprava opravdu dala; žádné `NaN`,
  záporná zásoba ani smrt hladem; dopočet obou vsí po 90 dnech (G i ve dny výprav a vložení mincovny) dá týž stav.
  Výsledek – s mincovnou / bez ní (zlato a kapacita šperkaře v gramech, na konci roku):

  | Rok | Vyrýžováno | Vyraženo | Zlato G   | Mince G   | Kapacita šperkaře G | Hladina T   | Meč u T (mince) |
  | --- | ---------- | -------- | --------- | --------- | ------------------- | ----------- | --------------- |
  | 949 | 263 / 263  | 0 / –    | 95 / 95   | 168 / 168 | 204 / 204           | 1,11 / 1,11 | 133 / 133       |
  | 950 | 232 / 231  | 326 / –  | 0,4 / 146 | 405 / 259 | 358 / 358           | 1,41 / 1,39 | 170 / 167       |
  | 951 | 0 / 0      | 0 / –    | 0,4 / 26  | 292 / 267 | 292 / 293           | 1,68 / 1,57 | 202 / 189       |
  - **Kolik zlata za rok:** rýžovník se synem vyrýžoval 263 g za sezónu 949 (214 dní) a 232 g v roce 950, celkem 494 g
    z nejbližšího náplavu (zbývá na něm 1 006 g). 2. 11. 950 si rýžovník (31 let) vzal vdovu, která drží dvorec, a podle
    pravidla sňatků (kinship.md – Sňatky: kdo drží dvorec, k tomu se druhý stěhuje) se i se synem přestěhoval do dvorce –
    dílna od té doby stojí prázdná a v roce 951 se nerýžovalo.
  - **Co za ně ves koupí:** obě výpravy roku 949 jely prázdné – 13. 3. 949 ještě nebylo co rýžovat a 25. 8. ves neměla
    mince (zlato vyměnila až později výprava správce, která vezla všechno zlato a mince vsi a nic za ně nekoupila). G
    koupila od kupců 2 meče: 3. 3. 950 za 89 mincí a 22. 2. 951 za 113 (bez mincovny 112) – se šperkařem o třetinu méně,
    než je cena dne. Nástroje nekoupila: T je nemá (nemá kováře), výpravy se vrátily s celým měšcem.
  - **Zlato kupcům a u hostitele:** G kupcům přímo neprodala nic – hostitel prodává první a kupci měšec utratí u T, takže
    výhoda šperkaře při prodeji zlata se nepoužila, jen při placení. U T vyměnila G 168 g zlata (výprava správce 949), bez
    mincovny ještě 180 g (950) a 120 g (951); T to zlato prodala kupcům gram za minci (s mincovnou 168 g, bez ní 468 g).
  - **Inflace z mincovny:** vyražených 326 mincí zvedlo hladinu T na konci roku 951 na 1,68 proti 1,57 bez mincovny
    (mince světa 505 proti 447). Hladina T roste i bez mincovny – mince přicházejí i z výměny zlata a výpravy G je nosí
    na trh –, mincovna ten růst zrychlí. Na konci 15 + 19 lidí (bez mincovny 15 + 17), nikdo hladem.

- **Přepočet Vlkova po plánu 6** (Vlkov nemá zlatonosný potok ani dílny zlata). **Ověřeno 27. 11. 2026** (živý stav
  z databáze `bohemia` – jen čtení, 10 let po dnech od 4. 1. 920, sonda plánů 1–5; návrh Clauda): stav po plánu 6
  (`feat/gold-6`) je **bit po bitu týž** jako na `feat/landscape` – shodný otisk celého stavu všech 3 653 dní i konečný
  stav, i plán a stavby správce (Vlkov řídí správce); kodek bez rozdílu (30 kontrol – tytéž bajty obou částí stavu
  a převod tam a zpět beze změny), chyby ani `NaN` nejsou. Druhý běh s uměle přidanou zastávkou kupců (jedna zastávka
  se seedem jako v plánech 4 a 5) a objednávkou jednoho meče, jednou bez šperkaře a jednou s obydlenou dílnou šperkaře
  u dvorce (vyučený muž 35 let jako v testu světa). V roce 920 kupci projeli čtyřikrát, pokaždé s měšcem 60 mincí:

  | Kupci a objednávka meče | Meč koupen                | Zaplaceno (cena dne) | Mince předtím | Kapacita šperkaře předtím |
  | ----------------------- | ------------------------- | -------------------- | ------------- | ------------------------- |
  | bez šperkaře            | 16. 5. 920 (2. den kupců) | 120 (120)            | 60            | –                         |
  | se šperkařem            | 16. 5. 920 (2. den kupců) | 90 (120)             | 60            | 60 g                      |
  - **Kdy:** v obou bězích týž den – druhý den kupců, kdy ves měla 60 mincí z prvního průjezdu a týž den utržila za med
    a kožešiny dalších 60. Šperkař nákup neuspíšil: první den kupců (1. 2. 920) ves předem neměla nic a i s plnou
    kapacitou šperkaře by na meč potřebovala aspoň 80 mincí.
  - **Za kolik:** se šperkařem o 30 mincí méně – o čtvrtinu, ne o třetinu. Použitelná kapacita šperkaře nepřeroste kov
    vsi (Pravidla 4) a před tím dnem měla ves jen 60 mincí: s výhodou 1,5× platilo jen těch 60 (za 90) a zbylých 30 ves
    zaplatila 1:1 z mincí utržených týž den, které šperkař ještě nezpracoval.
  - **Dál:** šperkař zpracuje 1,5 g za den, takže jeho kapacita drží krok s mincemi, které ves pomalu hromadí (na konci
    roku je skoro rovna mincím vsi):

  | Rok (31. 12.) | Bez šperkaře: lidé (rod) | Mince | Hladina | Se šperkařem: lidé (rod) | Mince | Kapacita šperkaře g | Hladina |
  | ------------- | ------------------------ | ----- | ------- | ------------------------ | ----- | ------------------- | ------- |
  | 920           | 26 (8)                   | 120   | 1       | 26 (7)                   | 150   | 126                 | 1       |
  | 921           | 22 (6)                   | 360   | 1       | 24 (6)                   | 386   | 367                 | 1       |
  | 922           | 25 (7)                   | 481   | 1,17    | 27 (6)                   | 506   | 506                 | 1,17    |
  | 923           | 26 (8)                   | 502   | 1,35    | 29 (7)                   | 562   | 562                 | 1,51    |
  | 924           | 28 (8)                   | 535   | 1,66    | 31 (9)                   | 603   | 603                 | 1,67    |
  | 925           | 29 (7)                   | 591   | 1,94    | 30 (9)                   | 657   | 657                 | 1,80    |
  | 926           | 31 (8)                   | 657   | 2,23    | 31 (9)                   | 709   | 709                 | 1,96    |
  | 927           | 31 (8)                   | 721   | 2,38    | 32 (10)                  | 778   | 758                 | 2,07    |
  | 928           | 31 (9)                   | 927   | 2,38    | 32 (10)                  | 867   | 835                 | 2,33    |
  | 929           | 34 (9)                   | 1 006 | 2,48    | 32 (10)                  | 950   | 916                 | 2,42    |

  Lidé a rod bez šperkaře jsou tytéž jako bez kupců (kupcům ves prodá jen přebytek medu, vosku a kožešin). Se
  šperkařem má ves muže navíc a běh se dál liší jiným průběhem náhody vsi (sňatky, porody, rod) – i jinými tržbami
  (za 10 let 1 040 mincí proti 1 126). Nikdo hladem. Běh bez šperkaře má i na `feat/landscape` (plán 5) tatáž čísla
  a týž konečný stav – liší se jen zápis příjezdu kupců, který po plánu 6 jmenuje i zlato (kupci vykupují 1 000 g).
  Poslední den běhu (4. 1. 930) se šperkař ve 45 letech přestěhoval do dvorce – domácnost bez nikoho mezi 16 a 44 lety
  se rozpadne ([kinship.md](kinship.md) – Rozpad domácnosti) a dílna pak stojí prázdná, jako dílna rýžovníka po sňatku
  v testu světa.

## Rozhodnutí plánu 6 (návrh Clauda, 26. 11. 2026)

Plán 6 přinesl zlato: zboží `gold`, tři dílny (rýžovník, šperkař, mincovna), zlato v mincovní fázi trhu, kapacitu šperkaře na výpravách, poštu a odchod, správce, rozhraní, scénu, test světa a přepočet Vlkova. Rozhodnutí níž jsou **návrh Clauda**, kromě slov Martina z 22. 11. 2026 (oddíl Martinova rozhodnutí) a z 25. 11. 2026 ([obchod](markets.md) – „Mince utrácí jen vojvoda/správce“, „berou si úplně vše“); jejich plné znění je v plánu `docs/superpowers/plans/2026-11-26-gold-6-panning-jeweller-mint.md`.

1. **Mince váží gram** (`GOLD.coinGrams` = 1): 1 g zlata = 1 mince = 15 kg obilí, `carryKg: 0` jako mince. Herní mince odpovídá pražskému denáru kolem roku 965 (≈ 1 g). Podle Martinova „1:1 váhově“ je zlato proti skutečnosti zhruba dvanáctkrát levnější. **Od 27. 11. 2026 mince váží 2,4 g zlata a má hodnotu 90 kg obilí** (Martin – Mince 2,4 g zlata za 90 kg obilí níž).
2. **Zlato je zboží `gold`** v `TRADE_GOODS` před medem (Martinovo pořadí); cena je pevná, 1 mince za gram na každém trhu; do zápočtu ani do hladiny trhu nepatří (výměna je kov za kov, ne poptávka po zboží).
3. **Výměna s kýmkoli, kdo mince má** (Martin): zlato kupují cizí kupci, výpravy, které ho mají v „Dostaneš“, a hostitel svými mincemi 1:1, po kupcích a po objednané zbroji. Zbroj hostitel kupcům doplatí napřed mincemi, pak celými gramy zlata. Kde nikdo nemá mince, zlato nic nekoupí.
4. **Rýžovník:** jen duben–říjen, 1 g na člověkoden vyučeného (učeň půl gramu; herní číslo, ne měření), na nejbližším dosažitelném náplavu s **1 500 g** (nedoplňuje se); mapa se 3–6 náplavy má 4,5–9 kg, rýžovník se synem ji vyrýžuje za 15–30 let. Bez náplavu se zlatem se dílna nepostaví.
5. **Šperkař:** zpracuje 1,5 g zlata nebo mincí za člověkoden vyučeného do kapacity výhody `JEWELLER.factor` = 1,5 (se šperkařem je prodej zlata o polovinu dráž (1,5 mince za gram) a platba mincemi o třetinu levnější), nejvýš do kovu vsi; šperky nejsou zboží (Martin). Požár beze změny.
6. **Šperkař na výpravě:** výprava veze kapacitu `min(šperky, mince + zlato v nákladu)`, použije ji a nepoužitou přiveze zpět.
7. **Mincovna od roku 950** (Martin): razí všechno zlato vsi, **200 g na člověkoden** vyučeného, gram za minci.
8. **Kupci:** `wants` = zlato 1 000 g, med, vosk, kožešiny, otroci; měšec 60 mincí se nemění. **Od 27. 11. 2026 má kupec měšec bez dna** (Martin: „Kupcům neomezuj měšec.“ – [markets.md](markets.md), Měšec kupců bez dna): za průjezd vykoupí až 1 000 g zlata.
9. **Pošta a odchod:** zlato jde z výsledku pro zaniklou ves hostiteli jako mince; odchod celé vsi bere zlato i kapacitu šperkaře („berou si úplně vše“, Martin 25. 11. 2026), syn a část lidí je nechají.
10. **Správce** platí obilí v nouzi zlatem až nakonec, na roční výpravu přidá zlato, chybí-li mince; dílny zlata nestaví (`workshopValue` dá 0).
11. **Rozhraní a scéna** jako 0 A.D.: tři tlačítka dílen (zkratky 3–5), zlato a šperky ve dvorci, zlato v panelu Trh; dílny zlata používají dnešní modely.
12. **Kronika:** nový zápis `placer-exhausted`, ostatní dnešní zápisy s novým zbožím.
13. **Převod stavu žádný** – nová pole jsou volitelná.
14. **Pořadí úloh** 1a–14 podle plánu.

**Doplněno z provádění (návrh Clauda):**

- **Zaniklá domovská ves výpravy:** hostitel dostane zlato výpravy `unsold.gold + bought.gold` – peníze nemizí.
- **Kapacita kupujícího se šperkařem** = kov, který za zboží opravdu odešel, včetně zaokrouhlení na celou minci.
- **Hladina trhu se počítá jen z mincí:** platí-li ves zbroj zlatem, může hladina klesnout.
- **MINT 200 g denně je opatrné číslo:** rešerše dává ≈ 100 ks za hodinu z jiné doby, bez přípravy střížků.

### Oznámit Martinovi (návrhy Clauda, které mění pravidla)

1. **Mince váží gram:** gram zlata je jedna mince, tedy 15 kg obilí; zlato je ve hře zhruba dvanáctkrát levnější než ve skutečnosti (Rozhodnutí 1). Martin 27. 11. 2026 rozhodl: „1 mince = 2.4g zlata = 90 kg obilí“ (Mince 2,4 g zlata za 90 kg obilí níž).
2. **Rýžovník rýžuje od dubna do října** gram zlata denně (učeň půl gramu; herní číslo); náplav má 1,5 kg a nedoplňuje se, mapa 4,5–9 kg se vyrýžuje za 15–30 let, pak dílna stojí (Rozhodnutí 4).
3. **Zlato se mění za mince, ne za zboží:** na trhu stojí minci za gram, kupují ho kupci, výpravy a **každá ves, která má mince** (Martin 22. 11. 2026: „s kýmkoliv, kdo ty mince má“). Je to kov za kov, „Mince utrácí jen vojvoda/správce“ (25. 11. 2026) dál platí pro zboží; objednanou zbroj hostitel kupcům doplatí i zlatem. Kde nikdo nemá mince (do roku 950 skoro všude mimo stezky), zlato nic nekoupí (Rozhodnutí 3).
4. **Kupci kupují zlato první**, ale měšec 60 mincí se nemění – za průjezd koupí nejvýš 60 g zlata, šperků 40 g; hlavní odbyt je výměna ve vsích s mincemi a od roku 950 mincovna (Rozhodnutí 8). Martin 27. 11. 2026: „Kupcům neomezuj měšec.“ – od té doby kupec za průjezd vykoupí až 1 000 g zlata.
5. **Šperkař zpracuje 1,5 g denně** do kapacity výhody; prodávající dostane o třetinu mincí méně, než je cena; kapacita platí i na výpravách a nepřeroste kov vsi (Rozhodnutí 5 a 6).
6. **Mincovna od roku 950 razí všechno zlato vsi** (200 g denně); vlastní mince zvedají ceny tam, kde je ves utratí (Rozhodnutí 7).
7. **Dílny zlata vypadají jako dnešní dílny** (rýžovník jako zemnice uhlíře, šperkař a mincovna jako kovárna); vlastní modely až na pokyn (Rozhodnutí 11).
8. **Správce platí i zlatem až nakonec** a dílny zlata nestaví (Rozhodnutí 10).
9. **Zlato je mezi vsemi jako mince:** jde jen poštou, zanikne-li ves, dostane ho hostitel i s koupeným zlatem výpravy; odejde-li celá ves, bere si zlato i šperky (Rozhodnutí 9).
10. **Hostitel zaniklé vsi dostane všechno zlato výpravy** (`unsold.gold + bought.gold`), peníze nemizí.
11. **Kapacita šperkaře kupujícího** = kov, který za zboží opravdu odešel, včetně zaokrouhlení na celou minci.
12. **Hladina trhu se počítá jen z mincí** – platí-li ves zbroj zlatem, může hladina klesnout.
13. **Mincovna 200 g denně je opatrné číslo** (rešerše ≈ 100 ks za hodinu z jiné doby, bez přípravy střížků); lze zvýšit.

## Mince 2,4 g zlata za 90 kg obilí (27. 11. 2026)

Martin 27. 11. 2026: „Dej průměrnou hmotnost mince 2.4g.“ K Rozhodnutí 1 se zeptal: „Zlato ve hře koupí asi 12× méně obilí než ve skutečnosti - proč jsi to takhle udělal?“ Claude odpověděl, že to vzniklo spojením ceny mince z obchodu (15 kg obilí podle stříbrného denáru) s „1:1 váhově“ a mincí o váze denáru – zlato bylo ve skutečnosti asi 12× dražší než stříbro – a že se měl zeptat. Martin: „Ok, ty mince byly velmi různorodé, my z toho tedy uděláme prmůěr - jedna mince bude mít těch 2.4g a hdnotu jako 2.4g krát 6 zlata“; na upřesňující otázku Clauda „Kolik zlata má mít hodnotu jedna taková mince?“: „1 mince = 2.4g zlata = 90 kg obilí“.

Rozhodnutí níž jsou **návrh Clauda** k provedení (mění Rozhodnutí 1 a kurz mince v [obchodu](markets.md)):

1. **Mince = 2,4 g zlata = 90 kg obilí** (`GOLD.coinGrams` = 2,4, `MARKET.grainKgPerCoin` = 90 – Martin). Gram zlata má hodnotu 37,5 kg obilí; proti skutečnosti (asi 150–180 kg) je zlato zhruba čtyřikrát levnější. „1:1 váhově“ platí dál.
2. **Ceny v mincích jsou šestkrát nižší** – meč 20 mincí, kroužková košile 80, helma 40, otrok 4 mince; zápočet (zboží za zboží) se nemění.
3. **Převod stavu:** ceny, které si trhy a vsi pamatují (v mincích), se jednou vydělí šesti. Počty mincí ve vsích, na výpravách ani v poště se nepřevádějí – mince je mince.
4. **Zlato za mince jen po celých mincích:** za minci 2,4 g zlata, od šperkaře prodávajícího 1,6 g (o polovinu dráž); zbytek pod jednu minci zůstane prodávajícímu a nikdo nepřeplatí zaokrouhlením. Zásoba zlata tak smí mít zlomky gramu, rozhraní je ukáže na desetiny.
5. **Mincovna** razí celé mince: 200 g za člověkoden = 83 mincí, zbytek zlata počká.
6. **Šperkař** zpracuje dál 1,5 g kovu za člověkoden; mince do toho počítá po 2,4 g.
7. **Rýžovník a náplav** v gramech beze změny (1 g za člověkoden = 37,5 kg obilí).
8. **Mince v „Dáš“ po jedné** (dřív po deseti – mince je šestkrát cennější).
9. **Zboží v kg za celé mince dolů:** výprava, správce i hostitel, kteří platí mincemi, vezmou jen tolik kg, kolik celé
   mince pokryjí – nikdo nepřeplatí až minci (90 kg obilí) zaokrouhlením nahoru. Kusy a platby kupců vsi zůstávají
   nahoru (u kupců ve prospěch vsi); nákup pod jednu minci se dál nekoná – drobnosti řeší zápočet.

**Ověřeno 27. 11. 2026 – přepočet Vlkova** (živý stav z databáze `bohemia` – jen čtení, 10 let po dnech od 15. 10. 920, 3 652 dní; návrh Clauda): Vlkov nemá trh vsi, zprávy o trzích, obchodní výpravy ani výsledky výprav ve schránce – žádnou cenu v mincích, takže ho převod `coin-rate` nemění a značku `coinKg` nedostane. Stav po minci 90 kg obilí (`feat/coins-web`) je proto **bit po bitu týž** jako na `feat/landscape` – shodný otisk celého stavu i každé jeho části všech 3 652 dní, konečný stav (31 lidí, z toho 9 z rodu; 17 narození, 12 úmrtí, nikdo hladem) i plán a stavby správce (Vlkov řídí správce). Kodek bez rozdílu: bajty z databáze dekódované a znovu zakódované jsou tytéž a 30 kontrol dává v obou stromech tytéž bajty obou částí stavu a převod tam a zpět beze změny; chyby, `NaN` ani `Infinity` nejsou.

## Otevřené / Pro Martina

Pravidla plánu 6 nechávají otevřené jen dvě obecná pravidla mimo plán, která se při testech ukázala (úlohy 13a a 13b), plán je nemění:

- **Řemeslník, který si vezme vdovu držící dvorec**, se přestěhuje do dvorce (`weddingHome`, [kinship.md](kinship.md) – Sňatky) a jeho dílna zůstane prázdná. V testu světa to potkalo rýžovníka 2. 11. 950.
- **Osamělý řemeslník po rozpadu domácnosti** (≥ 45 let) dílnu opustí (`dissolveHouseholds`, [kinship.md](kinship.md) – Rozpad domácnosti). V přepočtu Vlkova to potkalo šperkaře ve 45 letech.

Rozhodnout je na Martinovi; třeba dílna zůstane obsazená jiným mužem nebo se řemeslník nestěhuje. Do rozhodnutí platí současné chování.

## Nechává se na stavitele

Čísla (zlato za den, vyčerpání náplavu, kapacita šperkaře, stavba mincovny) s rešerší, rozhraní (ikony, panel dílny),
scéna (rýžovník u náplavu, dílna šperkaře, mincovna), převod stavu, pořadí úloh.
