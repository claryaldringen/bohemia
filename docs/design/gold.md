# Zlato a klenoty – rýžování, šperkař, mincovna (issue #13)

Stav: **schváleno** – Martin 22. 11. 2026 na otázku „Schvaluješ oba návrhy a takové pořadí?“ (obchod s trhy a mincemi, zlato a klenoty; šest plánů: konec smyšlených sousedů, trh bez mincí, vesničané a správce na trhu, kupci a mince, otroci, zlato): „Ano“. Co řekl Martin, je u bodu s datem; ostatní je návrh
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
3. **Mincovna** (od roku 950 – Martin): stavba ve vsi, která ze zlata razí mince 1:1 váhově; práce a stavba podle rešerše.
   Vlastní mince přibydou do oběhu – víc mincí, inflace (markets.md – mince jako zboží).
4. **Šperkař** – řemeslník s dílnou a učněm: šperky nejsou zboží (Martin). Když ves platí zlatem nebo mincemi, šperkař
   „zlevní“: zlato a mince použité k placení mají hodnotu 1,5násobku (ves zaplatí o třetinu méně); když ves prodává
   zlato, šperkař „zdraží“: dostane 1,5násobek. Platí **i mezi vsemi**, nejen s kupci (Martin). **Kapacita** (Martin –
   výroba šperku je náročná a dlouho trvá): výhoda platí jen pro tolik zlata, kolik šperkař za dobu práce zpracuje –
   šperkařovo zpracované zlato přibývá jeho prací (rešerše: kolik gramů za den), platba nebo prodej s výhodou ho ubírá;
   nad to se platí zlatem 1:1.
5. **Kupci** vykupují zlato (s šperkařem dráž) a platí mincemi (markets.md). **Stav po plánu 4 obchodu (26. 11. 2026):** mince už obíhají – přicházejí s cizími kupci na stezkách a ves je hromadí a utrácí hráč a správce (markets.md – Rozhodnutí plánu 4); kupci zatím kupují jen med, vosk a kožešiny, **za zlato je neplatí** – zlato, šperkař a mincovna jsou plán 6.

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

## Nechává se na stavitele

Čísla (zlato za den, vyčerpání náplavu, kapacita šperkaře, stavba mincovny) s rešerší, rozhraní (ikony, panel dílny),
scéna (rýžovník u náplavu, dílna šperkaře, mincovna), převod stavu, pořadí úloh.
