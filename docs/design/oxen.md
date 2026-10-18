# Orání rádlem – voli, ohrada, seno

Stav: schváleno 18. 10. 2026 (Martin: „Takhle je to ok“), **implementováno 18. 10. 2026** –
jádro `domain/village/oxen.ts` (ohrady, spřežení, výcvik, vracení orby motyce), `plough.ts`
(sazby orby, co rádlo zvládne), `hay.ts` (seč, zásoba, zimní krmení), orba v plánu osevu
(`year-plan.ts`, `CropWork.plough`); scéna kreslí ohradu, zvířata v ní a spřežení na čele orby
(modely z `tools/blender/plough.py` a `pen.py`). Rozhodnutí z implementace jsou v části
Implementace a v tabulce Rozhodnutí jako „rozhodnutí kontroléru“.

## Proč

Raní Slované orali rádlem taženým voly (rešerše – Beranová, Březno: kosti volů od 7. století).
Rádlo zpracuje hektar za zlomek práce motyky, ale potřebuje sehrané spřežení, ohradu, pastvu
a na zimu seno. Hráč tak dostane velkou úlevu od jarní dřiny – za cenu dlouhé přípravy a další
půdy na seno. Dobytek, dosud jen ozdoba, se tím poprvé zapojí do hry.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** spřežení volů s rádlem nahradí kopání motykou na polích v oběhu (Martin – směr).
- **Cíl:** voli se vychovají z vlastních telat a cvičí se zhruba **2 roky** (Martin – směr; Reynolds).
- **Cíl:** voli potřebují **ohradu s přístřeškem**, pastvu a na zimu **seno** (Martin).
- **Cíl:** louky na seno a úhor jako pastvina dostanou smysl.
- **Ne-cíl (teď):** mléko, maso, kůže, obchod s dobytkem, nemoci, pluh s odhrnovačkou, koně.
- **Anti-cíl:** dobytek v obydlí – raní Slované v 6.–9. století chlévy ani ustájení v zemnicích
  nedokládají, dobytek byl venku v ohradách (rešerše 18. 10. 2026 – Donat, Dostál; Martin).

## Ohrada s přístřeškem (staví hráč)

- **Stavba po čtvercích** jako pozemek polozemnice: jeden čtverec 15 × 15 m na louce, obehnaný
  **pleteným plotem se zakulacenými rohy** (Martin), v rohu jednoduchý přístřešek na sloupech
  s doškovou střechou a žlab; branka (návrh Clauda).
- Cena: **40 člověkodní a 6 stromů** (kůly, přístřešek – [les](forest.md)) (návrh Clauda).
- Jedna ohrada pojme **jedno spřežení** (2 voli) a k tomu chovné krávy a telata (stádo, které dnes
  ve hře je – jedna kráva na 2 domácnosti) (návrh Clauda).
- V létě se dobytek pase venku (úhor, louky po seči – jako dnes), přes zimu stojí v ohradě a žere
  seno.

## Spřežení (cvičí hráč)

- V ohradě hráč zadá **„Vycvičit spřežení“** – z telat vlastního stáda se za **2 roky** vycvičí pár
  volů (Martin – směr). Mezitím je potřeba je krmit (pastva, v zimě seno); práce na péči je malá –
  pasou je děti jako dnes (návrh Clauda).
- **Rádlo** vyrobí vesničané: **1 strom a 5 člověkodní** (návrh Clauda); se železnou špičkou od
  kováře se orá rychleji – viz Účinek.
- Spřežení slouží **≈ 10 let**, pak voli zestárnou a je třeba vycvičit nové (návrh Clauda) – ohrada
  s chovnými kravami tak cvičí další pár včas, když to hráč zadá.
- **Náhradu jde cvičit jen v posledních 2 letech služby** (Martin, 18. 10. 2026 – předtím se
  v jeho vsi začal cvičit nový pár po roce služby a nový pár pak starý tříletý bez varování
  vyřadil na maso): výcvik začne nejdřív 8 let po vycvičení současného spřežení, takže náhrada je
  hotová, právě když starý pár doslouží. Dřív tlačítko zašedne s důvodem „Spřežení slouží ještě
  X let.“ Kdo chce dvě spřežení, postaví druhou ohradu.

## Seno

- Voli přes zimu (listopad–březen, ≈ 150 dní) sežerou **≈ 1,5 t sena na vola**, tedy **≈ 3 t na
  spřežení** (návrh Clauda – ≈ 10 kg denně).
- Seno dávají **všechny louky** (Martin, 18. 10. 2026): přirozené louky z krajiny do **600 m**
  od obydlí (políčka louky, která nezabírá pole, sad, hřbitov, pozemek, ohrada ani obydlí)
  a úhor ve fázi louky (pastvina) – ≈ **1,5 t/ha** ročně (nehnojená louka – návrh Clauda), tedy
  ≈ **2 ha luk na spřežení**. Seče se **od nejbližší louky k obydlí a jen tolik, kolik je
  potřeba**. Sečení, sušení a stohování stojí **6 člověkodní/ha** v červnu–červenci.
- **Bez sena** voli zeslábnou: na jaře orají jen podíl odpovídající pokrytí sena (zbytek se dokope
  motykou); když sena chybí přes polovinu, jeden vůl uhyne a spřežení se rozpadne (návrh Clauda).

## Účinek na práci

- **Zpracování půdy na dílech v oběhu** (zkopaný díl po sklizni, mladý úhor 1–2 roky): místo kopání
  motykou (**100 → 50 člověkodní/ha** podle nástrojů) **orba rádlem 10 → 6 člověkodní/ha**
  (rešerše: 5–15 člověkodní/ha; meze produktivity – nejhorší dřevěná radlice, nejlepší se železnou
  špičkou od kováře podle pokrytí nástroji, [řemesla](crafts.md)). Orá oráč a honáček (2 lidé).
- **Drn rádlo nezvládne** (rešerše – rádla selhávala na panenském drnu): zakládání pole na louce,
  v křovinách a v lese a vracení úhoru ve fázi louky (3+ roky) dál stojí jako dnes (motyka, mýcení).
- **Kapacita spřežení:** ≈ **0,3 ha za den** (orba křížem – dva průchody; návrh Clauda) – za jarní
  okno (březen–duben) ≈ 18 ha, za podzim víc. Jedno spřežení stačí běžné vsi; větší ves může mít víc
  ohrad a spřežení.
- Postavičky: na rozpracovaném čtverci orá spřežení (model je hotový) místo řady s motykami.

## Implementace (18. 10. 2026)

Rozhodnutí kontroléru tam, kde návrh nedává postup (Martin je může změnit):

- **Ohrada** se staví jako pozemek polozemnice – jeden čtverec louky (ne voda, les, skalní
  výchoz, posvátné místo ani zabrané políčko – čtverec pole ano: z pole zmizí,
  Martin 18. 10. 2026 – [fields.md](fields.md), Pole jako krajina), v nabídce staveb zkratka O.
  Cena jako u obydlí: 40 člověkodní v sobě mají kácení 6 stromů u blízkého lesa – stavba vezme klády z hromady,
  zbytek stromů vyhradí a skácí (dál než 100 m dráž), překážky na čtverci zaplatí prací navíc.
  Osadníci nejsou potřeba. Ohrady blokují ostatní stavby po čtvercích jako pole.
- **Výcvik:** dvě telata ze stáda krav – ves musí mít **aspoň 3 krávy** (chovná kráva zůstane).
  Rádlo je stavba ze společné práce: 5 člověkodní a strom (kláda z hromady, nebo strom ke kácení
  u ohrady). Spřežení orá, až uplynou 2 roky výcviku **a** je hotové rádlo. Ohrada se spřežením
  smí cvičit náhradu až v posledních 2 letech jeho služby (`trainingBlock` –
  `serviceYearsBeforeTraining`); nové spřežení vystřídá staré (staré jde na maso), spřežení
  starší 10 let zestárne a jde na maso (2 × 120 kg) – náhrada zadaná hned, jak smí, naváže týž
  den.
- **Seno:** 1. 6. ves naplánuje seč – seno pro krávy a voly na zimu (≈ 1,5 t na kus, ohrada bez
  spřežení a výcviku počítá se dvěma voly – výcvik jde zadat kdykoli) bez zásoby, z dílů úhoru ve
  fázi louky a z přirozených luk do 600 m od nejbližší k obydlí – vzdálenost je **chůze po
  pěšinách** jako u polních prací ([paths.md](paths.md) – Pěšiny a práce; díl úhoru
  `partWalkDistance`, políčko přirozené louky přes síť pěšin vsi a pevné cesty podle stupně –
  [roads.md](roads.md), bez sítě rovně), při shodě díly
  úhoru a pak po políčkách; simulace k tomu dostává krajinu. Vzdálenost louky se uloží s plánem
  a podle ní je i práce seče. Seče se
  v červnu–červenci po dílech a políčkách jako polní práce, seno přibývá poměrně k práci.
  **Louky na seno ve scéně jsou data** (`SceneVillage.hayMeadows` – políčka přirozených luk
  v seči se vzhledem `meadow` / `mown` / `haystacks` po čele práce); dekorativní louky na seno
  zůstaly jen ve vývojové ukázce. K políčkům, kde se ten den seče, vede pěšina (sekáči – práce
  dne), pevné cesty sčítají seč za rok jako jedno místo. V listopadu–březnu žere každý kus ≈ 10 kg denně, voli první.
  Zimní krmení, voda a kydání krav a volů je práce ([strava – Práce se zvířaty](diet.md)).
- **Pokrytí sena** se rozhodne **1. 3.**: co voli za zimu dostali a co jim ze zásoby zbývá na
  březen, proti potřebě celé zimy. Pod polovinu jeden vůl (nebo tele ve výcviku) uhyne,
  spřežení i výcvik se rozpadnou a druhý vůl jde na maso. Mezi polovinou a plným pokrytím vrátí
  slabí voli motyce podíl zbývající orby (celé díly od konce řady orby).
- **Co rádlo zorá:** díly bez drnu – díl po sklizni, mladý příloh a díl, kterému drn rozrušilo
  založení. Díl, který se vrací z přílohu ve fázi pastviny (vrácení stojí práci navíc), kope dál
  motyka (vrácení i kopání). Plán osevu (1. 9. i díly přidané během roku) dá spřežení díly, které
  rádlo zvládne, když ves má vycvičené spřežení; setí jde za zkopanou i zoranou částí podle vah
  dílů. Orba běží v oknech kopání, spřežení zvládnou nejvýš 0,3 ha × sazba orby (člověkodny) za
  den (obě plodiny dohromady). Když ves přijde o poslední spřežení, zbylou orbu (i rozpracovaný
  díl) kopou motyky – vrácené díly jdou na konec řady kopání.
- **Ve scéně** stojí spřežení na čele orby (díl, přes který dnes orba postoupila) a otáčí se na
  souvratích; voli spřežení jsou jinak v ohradě, telata ve výcviku taky, krávy v zimě.

## Co hráč vidí

- V nabídce staveb **ohrada** (název a cena v tooltipu).
- V panelu ohrady: zvířata (ikony + čísla), průběh cvičení spřežení, zásoba sena na zimu; kolik
  let spřežení ještě slouží a kolik dní výcviku zbývá – ikona přesýpacích hodin (Martin: slunce
  nebylo srozumitelné).
- V horní liště **seno** (ikona + číslo), když ves má dobytek v ohradě.
- Ve scéně: ohrada s přístřeškem, v zimě voli a krávy v ohradě, stohy sena, na jaře spřežení orá
  pole čtverec po čtverci.

## Rozhodnutí

| Rozhodnutí                                                                                  | Kdo                           |
| ------------------------------------------------------------------------------------------- | ----------------------------- |
| Orání rádlem s voly; voli z vlastních telat, výcvik ≈ 2 roky; pastva a seno; rádlo ze dřeva | návrh Clauda, Martin – směr   |
| Ohrada s přístřeškem z pleteného plotu se zakulacenými rohy (žádný dobytek v obydlí)        | Martin (rešerše 18. 10. 2026) |
| Ohrada 1 čtverec, 40 čd + 6 stromů; 1 spřežení na ohradu; spřežení slouží ≈ 10 let          | návrh Clauda                  |
| Seno 1,5 t na vola za zimu, louka 1,5 t/ha, sečení 6 čd/ha; bez sena slabší orba / úhyn     | návrh Clauda                  |
| Orba 10 → 6 čd/ha místo kopání 100 → 50; drn rádlo nezvládne; spřežení ≈ 0,3 ha/den         | návrh Clauda (rešerše)        |
| Výcvik z aspoň 3 krav; rádlo jako stavba; seč 1. 6. pro krávy a 2 voly na ohradu            | rozhodnutí kontroléru         |
| Náhrada spřežení jen v posledních 2 letech služby; dvě spřežení = druhá ohrada              | Martin (18. 10. 2026)         |
| Zbývající služba a dny výcviku s ikonou přesýpacích hodin (místo slunce)                    | Martin (18. 10. 2026)         |
| Pokrytí sena k 1. 3.; vracení orby motyce po celých dílech                                  | rozhodnutí kontroléru         |
| Seno ze všech luk – přirozené louky i úhor ve fázi louky, od nejbližší, jen kolik je třeba  | Martin (18. 10. 2026)         |
| Přirozené louky do 600 m od obydlí; louky na seno ve scéně z dat                            | návrh Clauda                  |
| Ohrada smí na pole – čtverec pole pod ní z pole zmizí                                       | Martin (18. 10. 2026)         |
