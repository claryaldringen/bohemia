# Pozvánky a vazalství – první verze

Stav: **návrh ke schválení (přepracováno podle odpovědí 2. 11. 2026)**. Implementace zatím není.
Navazuje na [vizi](vision.md) – Hráči a vazalství, na [účty](accounts.md) (pozvánkové kódy byly
mimo rozsah „přijdou s mechanikou vazalství“) a na [seniorát](seniorate.md) (#9, fáze 4 –
nástupnictví bez losu za pozvaného hráče). Historické opory:
[rešerše](research/2026-11-02-vassalage-seniorate.md). Martinovy odpovědi jsou citované
v oddílu [Odpovědi Martina 2. 11. 2026](#odpovědi-martina-2-11-2026); co níž není výslovně
Martinovo, je návrh Clauda.

## Proč

- **Vize** (Martin – „Registrace, sdílený svět, vazalství přes pozvánky“): pozvaný hráč začíná
  jako vazal toho, kdo ho pozval; vazalství není navždy; pozvat hráče se vyplácí.
- **Na začátku jsou si všichni rovni** – Martin 2. 11. 2026: „**Na začátku na vrcholu nestojí
  nikdo. Všichni hráči jsou si rovni a pokud se chce někdo dostat na vrchol, musí si nějakým
  způsobem podrobit ostatní. V tom ta hra vlastně spočívá.**“
- **Pomoc v nouzi nemá zdroj.** Martin 1. 11. 2026 k pomoci pána vsi v nouzi: „**zatím nemáme
  feudální systém. Není odkud brát**“. Vazalství dá pomoci zdroj – pánovu ves, slíbí-li ji pán
  v podmínkách.
- **Seniorát potřebuje pozvaného hráče** – za každého pozvaného hráče jedno nástupnictví bez
  losu ([seniorát](seniorate.md)).
- **Kostra světa potřebuje jednu mřížku map** – kde začíná nový hráč, „patří do návrhu vazalství
  a světa“ ([prémiové krajiny](premium-landscapes.md) – Kostra světa).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** na začátku nikdo nahoře – svět je **les stromů**, každý nezávislý hráč je kořen
  svého stromu (Martin 2. 11. 2026).
- **Cíl:** pozvaný začíná jako vazal toho, kdo ho pozval (Martin – vize; 2. 11. 2026).
- **Cíl:** hráč bez pozvánky je **úplně nezávislý** (Martin 2. 11. 2026).
- **Cíl:** vazalství je **dohoda dvou hráčů** – pán navrhne a stanoví podmínky, druhý přijme,
  odmítne nebo jedná (Martin 2. 11. 2026).
- **Cíl:** vazal smí odejít **kdykoli** (Martin 2. 11. 2026).
- **Ne-cíl (první verze):** podrobení silou, vzpoura, obrana a svolání vazalů – až s
  [válkou](war.md); sňatky mezi rody, služby (povoz, stavba hradiště), prestiž a tituly, volné
  zprávy mezi hráči, NPC vazalové.
- **Anti-cíl:** dávka, která vazala vyhladoví, zatímco spí – každá ves si nechá pojistku (Plnění
  podmínek).
- **Anti-cíl:** podmínky, které jedna strana změní sama – změna jen novou dohodou.
- **Anti-cíl:** výhoda za falešné účty – nástupnictví bez losu dá jen pozvaný, který začal hrát.
- **Anti-cíl:** vazal bez vlastního souhlasu – vazalem se hráč stane jen pozvánkou, kterou sám
  použil, nebo přijetím nabídky.

## Les stromů – na začátku nikdo nahoře (Martin 2. 11. 2026)

- Každý hráč je buď **nezávislý**, nebo **vazal právě jednoho pána**. Nezávislý hráč je kořen
  svého stromu – nikomu nic neodvádí a nikdo mu nic nedluží. Žádný nehráčský kníže ani jiný
  společný kořen není.
- Kdo chce na vrchol, musí si ostatní podrobit (Martin). V první verzi jen **dohodou** – nabídkou
  vazalství s podmínkami (níž). Podrobení silou (nájezd, porážka, podmínky vítěze) přijde
  s [válkou](war.md); do té doby je nátlak jen hrozbou do budoucna (návrh Clauda).
- **Kdo začal dřív, má výhodu** (Martin: „Ano – ti co začali dříve, budou mít jistou výhodu“) –
  větší rod, víc vsí a zásob, a tedy lepší podmínky v jednání.
- **Vazal vazala není vazalem pána** (návrh Clauda): dávky a pomoc jdou jen mezi přímým pánem
  a vazalem. Vazal si své vazaly nechává, i když změní pána – podrobí-li si hráč kořen stromu,
  stojí nad celým jeho stromem (otázka 3).
- **Bez kruhu:** pánem nesmí být hráč, který je ve stromu pod budoucím vazalem.

## Kdo je pán a vazal (návrh Clauda)

- Vazalství je vztah dvou **hráčů – rodů**, ne vsí ani jednotlivých mužů. Platí pro **všechny
  vsi rodu** (rodové panství – [seniorát](seniorate.md)) a trvá přes generace, dokud ho jedna
  strana neukončí (Konec vazalství).
- Za pána jedná hráč (jeho muž – vojvoda vlastní vsi, [seniorát](seniorate.md)); dávka jde do
  **vlastní vsi pána**, pomoc z ní odchází.
- Počet vazalů omezený není.

## Pozvánkový kód (návrh Clauda)

- **Kdo vydává:** hráč s živým rodem – nezávislý i vazal.
- **Kolik:** nejvýš **3 nevyužité kódy** najednou; využitý, propadlý nebo zrušený kód místo
  uvolní.
- **Podoba:** 8 znaků z písmen a číslic bez zaměnitelných (bez O, I, L, 0, 1), zobrazený po
  čtyřech – `BH7K-M2QX`; k němu odkaz na registraci s vyplněným kódem.
- **Jednorázový**, platí **14 skutečných dní** (≈ 38 herních let); vydavatel ho smí zrušit.
- **Použití:** jen při registraci – volitelné pole „Pozvánka“ (i u přihlášení přes Google, kód
  z odkazu se zapamatuje). Server kód ověří a zarezervuje; spotřebuje ho první vstup do hry –
  v tu chvíli vznikne vazalství. Neplatný kód: „Pozvánka neplatí.“ u pole; registrace jde i bez
  něj a hráč je pak nezávislý.
- **Stávající hráč** kód nepoužívá – vazalem se stane přijetím nabídky (Nabídka vazalství).

## Pozvaný hráč (Martin 2. 11. 2026: „Ano, začíná jako vazal“)

- Začíná jako **vazal toho, kdo ho pozval**, s mapou blízko pána (Místo na mapě světa).
- **Výchozí podmínky: žádné** (návrh Clauda) – bez dávky a bez slíbené pomoci; nováček nemá
  z čeho odvádět a podmínkám ještě nerozumí. Kód podmínky nenese. Pán smí kdykoli navrhnout
  nové podmínky (Změna podmínek) a pozvaný je přijme, odmítne nebo jedná; poslat obilí ručně
  smí pán vždy.
- Odejít smí **kdykoli** jako každý vazal (Konec vazalství).
- **Nástupnictví bez losu** (Martin 2. 11. 2026: „Jedno nástupnictví za pozvaného“): každý
  pozvaný hráč, který **začal hrát**, připíše tomu, kdo ho pozval, jedno nástupnictví bez losu
  ([seniorát](seniorate.md) – Nástupnictví hráče). Připíše se jednou za pozvaný účet a platí,
  i když pozvaný později od pána odejde nebo přestane hrát.
- **„Začal hrát“** (návrh Clauda) = pozvaný byl ve hře aspoň **3 různé skutečné dny** – jeden
  falešný účet na jedno přihlášení nestačí.

## Hráč bez pozvánky – nezávislý (Martin 2. 11. 2026)

- Martin: „**Bude úplně nezávislý – buď svou nezávislost uhájí nebo ho některý z ostatních
  hráčů donutí stát se jeho vazalem.**“
- Žádné přidělení pána. Nováček je kořen vlastního stromu; vazalem se stane, jen když přijme
  nabídku. Donutit ho v první verzi nejde – jen přesvědčit podmínkami (dar, pomoc v nouzi);
  donucení přijde s válkou (návrh Clauda).

## Místo na mapě světa (návrh Clauda)

- **Předpoklad:** jedna **mřížka světa** pro všechny hráče místo vlastní mřížky každého hráče
  ([prémiové krajiny](premium-landscapes.md) – Kostra světa). Vsi rodu (odchody synů) dál
  vznikají vedle mapy, ze které se odchází ([stěhování](migration.md)).
- **Pozvaný** začíná na volném políčku **nejblíž mapě vlastní vsi pána**, aspoň **2 políčka** od
  map ostatních hráčů (sousední políčka tak zůstanou [sousedům](trade.md) pro obchod).
  Vzdálenost je počet kroků mřížkou v 8 směrech, při shodě pevné pořadí směrů.
- **Nezávislý nováček** začíná na volném políčku nejblíž středu světa, aspoň **3 políčka** od map
  ostatních hráčů – svět se plní od středu ven, kdo přijde později, začíná na okraji osídlení.
- Změna pána ani odchod mapu nemění – kdo se stane vazalem vzdáleného pána, má k němu dlouhou
  cestu (Plnění podmínek).
- Typ prémiové krajiny se nemění (premium-landscapes.md). Rozmístění NPC a kostra řek a stezek –
  návrh světa (Později).

## Nabídka vazalství a jednání (Martin 2. 11. 2026; podrobnosti návrh Clauda)

Martin: „**Hráč navrhne jinému hráči, aby se stal jeho vazalem a stanoví podmínky. Druhý hráč
to buď přijme, odmítne nebo se bude jednat o podmínkách.**“ O dávkách rozhoduje pán (Martin:
„O dávkách rozhoduje pán“) – v první verzi tím, že je napíše do nabídky.

### Podmínky (první verze)

Nabídka je sada podmínek z pevného výběru – každá je ikona s čísly, žádná není povinná
(nabídka bez podmínek je holá přísaha):

> **Dávky podle Martina 2. 11. 2026 (nahrazuje návrh níž, podrobnosti dopracovat):** „Vazal bude
> posílat roční dávky. Jejich výše se sjedná při založení vazalství, přičemž vazal uvidí svůj
> ekonomický výkon a kolik kterého zboží může ročně postrádat, aby ho to nepoložilo. Na základě
> toho pak učiní nabídku budoucímu pánovi. Ten to buď odsouhlasí nebo dá protinabídku a takto to
> bude, dokud se neshodnou. Vazalovi se pak jednou ročně objeví dialog, ve kterém odsouhlasí
> poslání zboží pánovi – v tom dialogu může poslat i míň nebo víc zboží než bylo domluveno
> a připojit k tomu vzkaz. Pánovi se příjem poplatku zobrazí v notifikacích.“ – dávku tedy
> **nabízí vazal** podle výhledu přebytku, **neodchází sama** (Plnění níž), ale vazal ji jednou
> ročně potvrdí (víc, míň, se vzkazem).
>
> **Neodpoví-li vazal na roční dialog:** „c)“ – dialog počká, dokud vazal nepřijde (Martin 2. 11. 2026).
>
> **Druhy dávek – jen makrokomodity** (Martin 2. 11. 2026: „Měli bychom brát v úvahu jen zboží,
> které lze obchodovat za celou ves – např. nástroje a keramiku si nakupuje každý sám. Měli bychom
> to rozdělit na makrokomodity, které řeší celá obec/vojvoda atd. a mikrokomodity, které si lidé
> řeší sami a v ekonomických ukazatelích se neobjevují.“; výčet: „**Makrokomodity – obilí, seno,
> dobytek, koně, klády, lidé, práce.**“). Mikrokomodity (nástroje, keramika, uhlí, ruda, hlína,
> maso, sýr) do dávek nepatří. Rozdělení zatím platí pro vazalství; zbytek ekonomiky (obchod se
> sousedy, horní lišta) beze změny – návrh Clauda.
>
> **Doprava** (Martin 2. 11. 2026: „U každé komodity uvažuj i náklady na dopravu – např. vazal bude
> mít přebytek klád, ale počet klád bude omezen prací lidí a vozů, které musí klády k pánovi
> dopravit.“): dávku dopravuje vazal stejně jako výpravu k sousedům ([obchod](trade.md) –
> Doprava): nosič 25 kg, kláda 100 kg = dva nosiči, vůz 400 / 800 kg s voly a vozkou, honák na
> 10 kusů dobytka, lidé a práce jdou po svých; cesta tam i zpět stojí práci (lidé × dny – 2 herní
> dny na políčko vzdálenosti, návrh Clauda) a vozy s voly ten čas neorou. Výhled „kolik můžu
> postrádat“ proto ukazuje u každé komodity **nejvýš tolik, kolik ves zvládne i dopravit** –
> menší z přebytku a z dopravy podle volné práce a vozů v měsíci odvodu; blízký vazal odvede víc
> než vzdálený.

1. **Dávka – vazal pánovi:**
   - **co:** jedno zboží z [obchodu se sousedy](trade.md) – obilí, luštěniny, maso, sýr, klády,
     keramika, uhlí, hřivny; dobytek Později (žene se, druhy a chovné jádro);
   - **kolik:** pevné množství **z každé vsi rodu vazala** za rok (např. 150 kg obilí) –
     s rodem vazala roste i dávka; historicky se odvádělo z každého dvora (rešerše);
   - **kdy:** 1. den měsíce, který pán zvolí, jednou ročně; výchozí **1. 11.** – po výmlatu, ve
     stejný den, kdy sousedé obnovují zásoby ([obchod](trade.md)).
   - Víc dávek (různé zboží) smí nabídka mít víc, každou zvlášť.
2. **Pomoc v nouzi – pán vazalovi:** má-li ves vazala **hlad** (upozornění hladu –
   [obyvatelstvo](population.md), Hlad a vymření), pošle jí vlastní ves pána sama obilí na
   **30, 60 nebo 90 dní** jídla hladové vsi (pán zvolí), nejvýš **jednou za rok** pro každou ves.
3. ~~**Dar při přijetí**~~ – **zrušeno** (Martin 2. 11. 2026: „Dar je píčovina.“).

Vojenská služba, svolání, ochrana proti nájezdu, sňatky a povoz – Později (s [válkou](war.md)).

### Kdo komu smí nabídnout

- Nabídku posílá **budoucí pán** (Martin) – hráč s živým rodem jinému hráči s živým rodem, který
  není jeho přímým vazalem a není ve stromu nad ním (bez kruhu). Zda smí o vazalství požádat
  i budoucí vazal: otázka 1.
- Adresát může být **nezávislý i vazal jiného pána** – přijetím od dosavadního pána odejde
  (vize: „přísahat jinému pánovi“); vazal smí odejít kdykoli, takže jde jen o jeden krok místo
  dvou.
- Svému přímému vazalovi pán neposílá nabídku, ale **nové podmínky** (Změna podmínek).

### Jak jednání probíhá

- **Odeslání:** pán vybere hráče, sestaví podmínky a pošle. Nabídka platí **3 skutečné dny**
  (≈ 8 herních let – dost i pro hráče, který den nehraje); pak propadne. Odesílatel ji smí
  stáhnout, dokud není přijatá.
- **Adresát** může:
  - **přijmout** – vazalství vznikne hned s těmito podmínkami (server ověří: oba rody žijí,
    nevznikne kruh);
  - **odmítnout** – jednání končí;
  - **protinávrh** – upraví podmínky (stejný formulář předvyplněný nabídkou) a pošle zpět.
    Protinávrh nahradí nabídku a platí znovu 3 dny; role se nemění – vazalem by byl pořád
    adresát první nabídky.
- **Strany se střídají** – na protinávrh odesílatel přijme, odmítne, nebo pošle další protinávrh.
  Počet kol omezený není; jednání skončí přijetím, odmítnutím, stažením nebo propadnutím.
- **Meze proti zahlcení:** mezi dvěma hráči nejvýš **jedno otevřené jednání**; hráč smí mít
  nejvýš **5 otevřených nabídek**, které sám poslal; po odmítnutí smí tentýž hráč témuž adresátovi
  poslat novou až po **1 skutečném dni**.
- **Kronika** obou vsí hráčů: „Bořivoj nabídl vazalství“, „Ctibor přijal Bořivoje za pána“,
  „Ctibor odmítl“.

### Změna podmínek

- Kterákoli strana stávajícího vazalství smí navrhnout **nové podmínky** – stejný formulář
  a stejné jednání (přijetí / odmítnutí / protinávrh, 3 dny).
- **Dokud druhá strana nepřijme, platí staré podmínky.** Odmítnutí vazalství neukončí – pán smí
  vazala propustit a vazal smí odejít (Konec vazalství), obojí kdykoli.

### Plnění podmínek

- **Plní se samo** – server, ne kliknutí hráče; svět běží i bez přihlášených hráčů. Dávka odejde
  v den splatnosti, pomoc v den hladu, dar v den přijetí.
- **Pojistka vsi** (anti-cíl): dávka nesáhne na osivo a jídlo vsi nesníží pod **dvě roční
  potřeby** – dva zlé roky za sebou přinášejí hlad (rešerše
  [pohrom](research/2026-10-27-disasters.md)). Pomoc v nouzi stejně neohrozí pána – jde jen
  z jídla vlastní vsi pána nad dvě roční potřeby. Ostatní zboží (klády, keramika, uhlí, hřivny)
  ves odvede, jen co má.
- **Nedoplatek:** nemá-li ves na dávku nad pojistku, odvede, co jde, a zbytek se zapíše jako
  **nedoplatek** – v kronice obou a u vazala v panelu (zlomená pečeť s počtem). Nedoplatek se
  nepřenáší a nic dalšího nespouští. Stejně **nepomohl-li pán**, protože pod pojistkou nic neměl
  – zapíše se „Pán nepomohl“ u pána.
- **Co když pán (nebo vazal) podmínky nedodrží:** jinak než nedostatkem to nejde – podmínky
  nikdo nemůže obejít ani změnit sám. Na nedoplatek nebo nepomoc druhá strana odpoví tím, co smí
  vždy: vazal odejde, pán vazala propustí, nebo jeden z nich navrhne nové podmínky. Trest silou
  až s válkou.
- **Cesta:** **2 herní dny na každé políčko vzdálenosti** (přechod mapy 1–3 dny –
  [válka](war.md)); v první verzi jen jako náklad, bez vozu ve scéně. Co je na cestě, dojde
  i po konci vazalství.
- **Dávka se odvádí jen o patro výš:** co pán přijal, je jeho zásoba – svému pánovi odvede podle
  svých podmínek.
- Ves na cestě (výprava), opuštěná nebo vymřelá neodvádí a pomoc nedostane.
- **Ručně:** pán smí kdykoli poslat obilí kterékoli vsi vazala, i bez hladu a i ze zásoby pod
  pojistkou – rozhodnutí hráče. Po 100 kg.
- **Kronika:** vazalova ves „Pánovi odvedeno 150 kg obilí“, pánova ves „Dávka od Ctibora: 150 kg
  obilí“, „Pán poslal 300 kg obilí“, „Nedoplatek 40 kg obilí“.

## Konec vazalství (Martin 2. 11. 2026: „Kdykoli“; podrobnosti návrh Clauda)

Vazalství není trvalé (Martin – vize). Bez války v první verzi takto:

- **Vazal odejde kdykoli** – tlačítko s potvrzením, platí hned; vazal se stane nezávislým a své
  vazaly si nechá.
- **Pán vazala propustí** kdykoli (s potvrzením) – vazal se stane nezávislým.
- **Přijetí jiné nabídky** = odchod a nové vazalství v jednom kroku.
- **Podmínky zaniknou s vazalstvím:** dávky ani pomoc už nejdou, nedoplatky se mažou; zásilky na
  cestě dojdou; dar ani pomoc se nevracejí. Rozjednané nové podmínky propadnou.
- **Vymře-li rod vazala** (konec hry): vazalství zanikne a vazalové vymřelého rodu se stanou
  nezávislými – nikdo se nestane vazalem bez souhlasu, ani pána svého pána.
- **Vymře-li rod pána:** jeho vazalové se stanou nezávislými.
- **Začne-li hráč znovu** (po vymření nebo z nabídky hry – [obyvatelstvo](population.md)): nový
  rod je nezávislý jako hráč bez pozvánky; vazalství starého rodu zanikla s ním.
- **Vzpoura** a podrobení silou – až s válkou.

## Co hráč vidí (UI jako 0 A.D.)

- **Registrace:** pole „Pozvánka“ (formulář mimo hru, s popisky jako dnes – [účty](accounts.md)).
- **Horní lišta:** ikona **sepjatých rukou** (přísaha) s počtem vazalů → panel vazalství; čeká-li
  nabídka na odpověď, svítí na ikoně pečeť.
- **Panel vazalství:**
  - nahoře **pán** – portrét jeho muže, popisek „Bořivoj – Lhota“, vedle ikony podmínek (klas
    s kg a měsícem, sýpka s dny pomoci) a tlačítko **Odejít** (rozetnutý řetěz, potvrzení);
    nezávislý hráč má místo pána **praporec svého rodu** (popisek „Nezávislý“);
  - řada **vazalů** – portrét, počet lidí, ikony podmínek, klas s loňskou dávkou (kg), zlomená
    pečeť s nedoplatky, ikona hladu, když hladoví; praporec u pozvaných;
  - po kliku na vazala **Poslat obilí** (vůz s klasem, množství), **Nové podmínky** (pečeť
    s perem) a **Propustit** (rozetnutý řetěz, potvrzení);
  - **Hráči** – ostatní hráči podle vzdálenosti map: portrét, počet lidí, ikona pána (nebo
    praporec nezávislého); klik → **Nabídnout vazalství** (pečeť) – zašedlé s důvodem u kurzoru
    („Je nad tebou.“, „Jednáte už.“, „Odmítl – zkus zítra.“);
  - **Jednání** – řádky podmínek jako ikony s čísly: klas a zboží s kg, měsíc, sýpka s 30 / 60 /
    90 dny, vůz s darem a šipkou, kdo komu; přesýpací hodiny se zbývajícími dny; tlačítka
    **Přijmout** (podaná ruka), **Odmítnout** (křížek), **Protinávrh** (pero – úprava čísel
    a poslat zpět), u odesílatele **Stáhnout**;
  - **Pozvánky** – pečeť s počtem volných míst; klik vydá kód, ukáže kód a odkaz s tlačítkem
    kopírovat (výjimka – kód je text); vydané kódy s přesýpacími hodinami a zbývajícími dny,
    křížek kód zruší; u pozvaných, kteří začali hrát, ikona nástupnictví.
- **Upozornění** jako ostatní ve hře: „Bořivoj ti nabízí vazalství.“, „Ctibor přijal.“, „Ctibor
  odmítl.“, „Ctibor navrhuje jiné podmínky.“, „Ctibor odešel.“, „Bořivoj tě propustil.“,
  „Ctibor hladoví.“
- Dávka, dar a pomoc se projeví v zásobách a kronice; ve scéně nic (vůz Později).

## Čísla (návrh Clauda – do `rules-vassalage.ts`)

| Co                             | Číslo                                                   |
| ------------------------------ | ------------------------------------------------------- |
| Nevyužité kódy najednou        | 3                                                       |
| Platnost kódu                  | 14 skutečných dní                                       |
| Pozvaný „začal hrát“           | 3 různé skutečné dny ve hře                             |
| Mapa pozvaného / nezávislého   | aspoň 2 / 3 políčka od ostatních hráčů                  |
| Platnost nabídky a protinávrhu | 3 skutečné dny                                          |
| Otevřené nabídky jednoho hráče | nejvýš 5; mezi dvěma hráči 1                            |
| Nová nabídka po odmítnutí      | po 1 skutečném dni                                      |
| Dávka                          | pán zvolí zboží, kg z každé vsi, měsíc (výchozí 1. 11.) |
| Pojistka vsi                   | osivo a jídlo na 2 roční potřeby                        |
| Pomoc v nouzi                  | 30 / 60 / 90 dní jídla, 1× ročně na ves                 |
| Cesta dávky, daru a pomoci     | 2 herní dny na políčko vzdálenosti                      |
| Ruční pomoc                    | po 100 kg                                               |

## Pro implementaci (poznámky, ne kód)

- **DB:** `invite_code` (kód, vydavatel, vytvořen, platí do, rezervace, využil, zrušen),
  `vassalage` (pán, vazal, podmínky, od, jak vzniklo – pozvánka / nabídka), `vassal_offer` (pán,
  vazal, kdo je na tahu, podmínky, platí do, stav, předchozí kolo), dny ve hře hráče,
  `succession_credit` (hráč, pozvaný, připsáno, spotřebováno – [seniorát](seniorate.md));
  adaptéry portů v `packages/db/src/adapters/`. Strom nemá společný kořen – nezávislý hráč je
  hráč bez řádku `vassalage` jako vazal.
- **Use-casy:** `issueInvite`, `revokeInvite`, `redeemInvite` (v `enterGame`), `offerVassalage`,
  `counterOffer`, `acceptOffer`, `rejectOffer`, `withdrawOffer`, `proposeTerms`, `leaveLord`,
  `releaseVassal`, `sendAid`, `deliverShipments`. Přihlašování zůstává mimo hexagon – doména zná
  jen id hráčů, strom a podmínky. Kontrola kruhu a mezí jednání je doménová funkce.
- **Podmínky jako akce nad vsí:** přijetím (i změnou nebo koncem vazalství) se podmínky zapíší do
  stavu každé vsi rodu vazala jako akce v ten den, po dopočtu na dnešek – jako akce hráče. Ves
  v simulaci v den splatnosti odečte dávku nad pojistkou do odchozí schránky jen ze svého stavu
  (deterministicky) a nedoplatek zapíše do kroniky; hlad zapíše do stavu. Nová ves rodu podmínky
  zdědí od mateřské vsi.
- **Zásilky jsou vnější události:** `deliverShipments` po dopočtu (web i worker) odešle pomoc
  a dar z pánovy vsi dnes a doručí náklad v den příjezdu, nejdřív dnes – jako
  `settleStewardDepartures`, idempotentně podle id zásilky. Výsledek každé vsi tak nezávisí na
  kouscích dopočtu.
- **Mřížka světa:** `settlement.grid_x` / `grid_y` se stanou souřadnicemi společné mřížky; vývojová
  sídla se do ostrého světa nepřenášejí (premium-landscapes.md).
- Testy: kód (platnost, rezervace, jednorázovost), pozvaný bez podmínek, nástupnictví až po
  3 dnech pozvaného a jen jednou, nabídka – přijetí, odmítnutí, protinávrhy, propadnutí,
  stažení, kruh a meze; změna podmínek (staré platí do přijetí), dávka nad pojistkou
  a nedoplatek, samočinná pomoc, odchod, propuštění, přetažení cizího vazala, vymření rodu pána
  i vazala, začít znovu.

## Později

- **Válka:** podrobení silou (porážka → vazalství s podmínkami vítěze), obrana vazala, svolání
  vazalů k nájezdu, zákaz nájezdu na pána a spoluvazaly, vzpoura, NPC vojvoda jako vazal po
  porážce ([válka](war.md)); podmínky „vojenská služba“ a „ochrana“.
- **Pověst** – kdo kolikrát odešel, propustil, nezaplatil nebo nepomohl, viditelné ostatním.
- **Sňatky mezi rody** – nevěsty z rodu pána nebo vazala místo „z okolí“ (lord.md – Manželky).
- **Dávky v dobytku** a **služby** – povoz, stavba a opravy pánova hradiště (rešerše – Hradská
  soustava).
- **Družina** pána živená z dávek (rešerše – Ibrahim ibn Jakub).
- Prestiž a tituly podle velikosti stromu; hradská soustava.
- Pohled do scény vazalovy vsi; vůz s dávkou ve scéně; obchod mezi vsemi hráčů.
- Návrh světa: rozmístění NPC vsí a kostra řek a stezek ve společné mřížce.

## Navazuje

- [Seniorát](seniorate.md) – hráčův muž, vlastní ves, nástupnictví bez losu za pozvaného.
- [Účty](accounts.md) – registrace s pozvánkou.
- [Prémiové krajiny](premium-landscapes.md) – společná mřížka světa.
- [Obchod](trade.md) – zboží dávek.
- [Válka](war.md) – podrobení silou, vzpoura a obrana.

## Odpovědi Martina 2. 11. 2026

Na otázky první verze návrhu (kníže, přidělení do šířky, desetina přebytku, okno přísahy, činný
pozvaný vazal):

1. **Vrchol stromu:** „**Na začátku na vrcholu nestojí nikdo. Všichni hráči jsou si rovni a pokud
   se chce někdo dostat na vrchol, musí si nějakým způsobem podrobit ostatní. V tom ta hra
   vlastně spočívá. Ano – ti co začali dříve, budou mít jistou výhodu**“ – kníže zrušen, svět je
   les stromů.
2. **Hráč bez pozvánky:** „**Bude úplně nezávislý – buď svou nezávislost uhájí nebo ho některý
   z ostatních hráčů donutí stát se jeho vazalem.**“ – přidělení pána zrušeno.
3. **Dávka:** „**O dávkách rozhoduje pán**“ – dávka je podmínka v nabídce, ne pevné pravidlo.
4. **Odchod vazala:** „**Kdykoli**“ – okno přísahy zrušeno.
5. **Jak se hráč stane vazalem bez pozvánky:** „**Hráč navrhne jinému hráči, aby se stal jeho
   vazalem a stanoví podmínky. Druhý hráč to buď přijme, odmítne nebo se bude jednat
   o podmínkách**“ – Nabídka vazalství a jednání.
6. **Pozvaný hráč:** „**Ano, začíná jako vazal**“.
7. **Nástupnictví za pozvaného** (seniorát): „**Jedno nástupnictví za pozvaného**“ – každý
   pozvaný hráč, který začal hrát, dá jedno nástupnictví bez losu.

- **Žádost o vazalství od budoucího vazala** (otevřená otázka 1): „Ano, stejným jednáním“
  (Martin 2. 11. 2026).
- **Dar při přijetí:** „Dar je píčovina.“ (Martin 2. 11. 2026) – zrušen, otázka 2 odpadá.
- **Dávky** – viz citace v Podmínkách (Martin 2. 11. 2026): nabízí vazal podle výhledu přebytku,
  jednou ročně je potvrdí v dialogu (víc / míň / vzkaz), pán dostane upozornění.

- **Platnost nabídky:** „Ať visí do nekonečna. Oba se k tomu musí nějak postavit“ (Martin 2. 11. 2026) – nabídka nepropadá; trvá, dokud ji strany nevyřídí.

- **Stažení nabídky:** odesílatel ji smí vzít zpět, dokud druhý neodpověděl – „Ano“ (Martin 2. 11. 2026).

## Otevřené otázky

1. **Smí o vazalství požádat i budoucí vazal?** Martin popsal nabídku od budoucího pána. Bez
   žádosti z druhé strany nemá hladový nebo ohrožený hráč jak si říct o ochranu – musí čekat, až
   ho někdo osloví. Doporučení: **ano** – stejné jednání, jen ho otevře budoucí vazal („Přijmi mě
   za vazala“ s podmínkami, které nabízí); o podmínkách dál rozhoduje pán tím, že je přijme nebo
   upraví. Možnosti: a) obě strany; b) jen budoucí pán.
2. **Odchod hned po daru nebo pomoci.** Vazal smí odejít kdykoli, tedy i den po daru při přijetí
   nebo po pomoci v hladu – „vezmi a uteč“. Doporučení: **bez ceny** – riziko nese pán, dar je
   jeho rozhodnutí; odchod se jen zapíše do kroniky obou rodů a pověst nebo trest přijdou
   s válkou. Možnosti: a) bez ceny; b) kdo odejde do 5 herních let po daru nebo pomoci, vrátí
   je; c) dar při přijetí v první verzi nebude.
3. **Patří k pánovi i vazalové jeho vazalů?** Návrh: vazal si své vazaly nechá i při změně pána,
   dávky jdou jen o patro výš – kdo si podrobí kořen stromu, stojí nad celým stromem, ale od
   jeho vazalů nic nedostává a oni s ním nic nesjednali. Doporučení: **ano, strom se skládá** –
   cesta na vrchol vede přes podrobení silných pánů, ne každého hráče zvlášť. Možnosti: a) strom
   se skládá; b) vazalové odcházejícího vazala se stanou nezávislými.
