# Pozvánky a vazalství – první verze

Stav: **návrh ke schválení** (2. 11. 2026). Implementace zatím není. Navazuje na
[vizi](vision.md) – Hráči a vazalství, na [účty](accounts.md) (pozvánkové kódy byly mimo rozsah
„přijdou s mechanikou vazalství“) a na [seniorát](seniorate.md) (#9, fáze 4 – výhoda pozvaného
hráče v nástupnictví). Historické opory: [rešerše](research/2026-11-02-vassalage-seniorate.md).
Co níž není výslovně Martinovo, je návrh Clauda.

## Proč

- **Vize** (Martin – „Registrace, sdílený svět, vazalství přes pozvánky“): pozvaný hráč začíná
  jako vazal toho, kdo ho pozval; hráč bez pozvánky se automaticky stane vazalem některého ze
  stávajících hráčů; svět je strom vazalství; vazalství není navždy (osamostatnění, vzpoura,
  přísaha jinému pánovi); pozvat hráče se vyplácí.
- **Pomoc v nouzi nemá zdroj.** Martin 1. 11. 2026 k pomoci pána vsi v nouzi: „**zatím nemáme
  feudální systém. Není odkud brát**“. Vazalství dá pomoci zdroj – pánovu ves, kam plynou dávky.
- **Seniorát potřebuje pozvaného hráče** – kdo přivedl hráče, o svou ves losem nepřijde (zadání
  issue #9, [seniorát](seniorate.md)).
- **Kostra světa potřebuje jednu mřížku map** – kde začíná nový hráč, „patří do návrhu vazalství
  a světa“ ([prémiové krajiny](premium-landscapes.md) – Kostra světa).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** pozvánkový kód – pozvaný začíná jako vazal toho, kdo ho pozval (Martin – vize).
- **Cíl:** hráč bez pozvánky dostane pána sám (Martin – vize), tak, aby strom zůstal vyvážený.
- **Cíl:** vazalství něco znamená už v první verzi: **dávka** nahoru, **pomoc v nouzi** dolů.
- **Cíl:** vazalství **není trvalé** (Martin – vize): přísaha jinému pánovi a osamostatnění.
- **Ne-cíl (první verze):** vzpoura, obrana a svolání vazalů – až s [válkou](war.md); sňatky mezi
  rody, služby (povoz, stavba hradiště), prestiž a tituly, zprávy mezi hráči, NPC vazalové.
- **Anti-cíl:** dávka, která vazala vyhladoví – odvádí se jen z přebytku.
- **Anti-cíl:** výhoda za falešné účty – počítá se jen vazal, který opravdu hraje.
- **Anti-cíl:** vazal, který změní pána, zatímco spí – sám nikdy neodejde bez své akce; změnit
  pána může jen propuštění pánem nebo vymření rodu.

## Kdo je pán a vazal (návrh Clauda)

- Vazalství je vztah dvou **hráčů – rodů**, ne vsí ani jednotlivých mužů. Platí pro **všechny
  vsi rodu** (rodové panství – [seniorát](seniorate.md)) a trvá přes generace.
- Svět je strom: pán, jeho vazalové, jejich vazalové… Kdo je nahoře, viz Vrchol stromu.
- Za pána jedná hráč (jeho muž – vojvoda vlastní vsi, [seniorát](seniorate.md)); dávka jde do
  **vlastní vsi pána**.

## Vrchol stromu (návrh Clauda; otázka 1)

- Na vrcholu stojí **kníže** – nehráčský kořen stromu, bez vsi a bez simulace. Hráči přímo pod
  ním jsou **svobodní páni**.
- V první verzi kníže nic nežádá a nic nedává: svobodní páni neodvádějí dávku a pomoc nedostávají.
- **Proč:** při ostrém spuštění 1. 1. 2027 v 00:00 nerozhoduje, kdo klikne první; kníže může
  později dostat vlastní doménu (hradiště, dávky) a historicky sedí na místě přemyslovského
  knížete (rešerše – Hradská soustava).

## Pozvánkový kód (návrh Clauda)

- **Kdo vydává:** hráč s živým rodem.
- **Kolik:** nejvýš **3 nevyužité kódy** najednou; využitý, propadlý nebo zrušený kód místo
  uvolní. Počet vazalů omezený není.
- **Podoba:** 8 znaků z písmen a číslic bez zaměnitelných (bez O, I, L, 0, 1), zobrazený po
  čtyřech – `BH7K-M2QX`; k němu odkaz na registraci s vyplněným kódem.
- **Jednorázový**, platí **14 skutečných dní** (≈ 38 herních let); vydavatel ho smí zrušit.
- **Použití:** při registraci volitelné pole „Pozvánka“ (i u přihlášení přes Google, kód z odkazu
  se zapamatuje). Server kód ověří a zarezervuje; spotřebuje ho první vstup do hry – v tu chvíli
  vznikne vazalství. Neplatný kód: „Pozvánka neplatí.“ u pole; registrace jde i bez něj (pak
  Přidělení bez pozvánky).
- **Stávající hráč** použije kód jen v okně přísahy (Konec vazalství) – kód je souhlas nového
  pána.
- **Bez kruhu:** kód nejde použít, je-li vydavatel ve stromu pod tím, kdo ho použije.

## Přidělení bez pozvánky (návrh Clauda; otázka 2)

- **Do šířky od vrcholu.** Pánem se stane **činný hráč s živým rodem**, který má **méně než 5
  přidělených vazalů** (pozvaní se nepočítají); mezi nimi ten **nejblíž vrcholu** (nejméně pánů
  nad sebou), pak s nejméně přidělenými vazaly, pak ten, kdo hraje nejdéle, pak nižší id.
- **Kníže má také 5 míst** – prvních pět hráčů bez pozvánky jsou svobodní páni, další dostanou za
  pána některého z nich. Nemá-li žádný činný hráč volné místo (nebo žádný činný není), jde hráč
  pod knížete i nad jeho 5 míst.
- **Činný hráč** = byl ve hře aspoň **3 různé skutečné dny z posledních 14**.
- **Proč:** strom zůstane vyvážený, nováček dostane pána, který hraje, a nikdo nezbohatne na
  náhodných nováčcích – pozvaní jdou nad limit, takže zvát se dál vyplácí.

## Místo na mapě světa (návrh Clauda)

- **Předpoklad:** jedna **mřížka světa** pro všechny hráče místo vlastní mřížky každého hráče
  ([prémiové krajiny](premium-landscapes.md) – Kostra světa). Vsi rodu (odchody synů) dál
  vznikají vedle mapy, ze které se odchází ([stěhování](migration.md)).
- **Vazal** začíná na volném políčku **nejblíž mapě vlastní vsi pána**, aspoň **2 políčka** od
  map ostatních hráčů (sousední políčka tak zůstanou [sousedům](trade.md) pro obchod). Vzdálenost
  je počet kroků mřížkou v 8 směrech, při shodě pevné pořadí směrů.
- **Svobodný pán** začíná na volném políčku nejblíž středu světa, aspoň **3 políčka** od map
  ostatních hráčů.
- Typ prémiové krajiny se nemění (premium-landscapes.md). Rozmístění NPC a kostra řek a stezek –
  návrh světa (Později).

## Co vazalství znamená v první verzi

### Dávka – vazal pánovi (návrh Clauda; otázka 3)

- **Kdy:** **1. 11.** každého roku – po výmlatu, ve stejný den, kdy sousedé obnovují zásoby
  ([obchod](trade.md)).
- **Kolik:** každá ves rodu vazala odvede **desetinu obilí nad dvě roční potřeby** své vsi; osivo
  se nepočítá (nejí se). Ves se zásobou 3,4 roční potřeby odvede 0,14 roční potřeby, ves pod dvěma
  ročními potřebami nic. **Proč dvě:** dva zlé roky za sebou přinášejí hlad (rešerše
  [pohrom](research/2026-10-27-disasters.md)) – dávka vazala nikdy nepřipraví o zásobu na dva
  roky.
- **Kam:** do vlastní vsi pána. Cesta **2 herní dny na každé políčko vzdálenosti** (přechod mapy
  1–3 dny – [válka](war.md)); v první verzi jen jako náklad, bez vozu ve scéně.
- Ves na cestě, opuštěná nebo vymřelá neodvádí. Svobodný pán neodvádí.
- **Jen o patro výš:** pán z přijaté dávky odvede svému pánovi až příští 1. 11. podle svého
  přebytku – dávka přichází po 1. 11.
- **Kronika:** vazalova ves „Pánovi odvedeno 180 kg obilí“, pánova ves „Dávka od Ctibora: 180 kg
  obilí“.

### Pomoc v nouzi – pán vazalovi (návrh Clauda)

- **Sama, bez rozkazu:** má-li ves vazala **hlad** (upozornění hladu – [obyvatelstvo](population.md),
  Hlad a vymření), pošle jí vlastní ves pána obilí na **60 dní** jídla hladové vsi – jen
  z pánova obilí **nad dvě roční potřeby** (pán svou ves neohrozí), nejvýš **jednou za rok** pro
  každou ves. Cesta jako u dávky.
- **Ručně:** pán smí kdykoli poslat obilí kterékoli vsi vazala, i bez hladu a i ze zásoby pod dvě
  roční potřeby – rozhodnutí hráče. Po 100 kg.
- **Přepínač Pomoc vazalům** – pán smí samočinnou pomoc vypnout. Hladověla-li pak ves vazala bez
  pomoci, ač pán obilí nad dvě roční potřeby měl, otevře se vazalovi okno přísahy (Konec
  vazalství).
- Pomoc se nevrací.
- **Kronika:** „Pán poslal 300 kg obilí“.

### Co první verze nemá

- obranu, svolání vazalů k nájezdu a zákaz nájezdu na pána – až s [válkou](war.md);
- sňatky mezi rody, služby, prestiž – Později.

## Pozvaný hráč a nástupnictví (návrh Clauda; otázka 5)

- Zadání issue #9 (Martin): „**Pokud hráč přivede jiného hráče, tak po smrti vojvody přebírá
  vesnici nejstarší syn … a hráč pokračuje ve hře za něj**“.
- **„Přivedl hráče“** = hráč má v den, kdy se zpracuje smrt jeho muže, aspoň jednoho **činného
  přímého vazala, kterého sám pozval** kódem. Pak hráč pokračuje za nástupce vsi bez losu
  ([seniorát](seniorate.md) – Nástupnictví hráče).
- **Proč činný a stále vazal:** jinak by stačil jeden falešný účet; pozvaný, který od pána
  odešel, výhodu nedává – pán o vazala přišel. Přidělený vazal výhodu nedává.

## Konec vazalství (návrh Clauda; otázka 4)

Vazalství není trvalé (Martin – vize). Bez války v první verzi takto:

- **Okno přísahy** – přísaha je osobní (rešerše): zemře-li hráčův muž vazala nebo hráčův muž jeho
  pána, má vazal **3 skutečné dny** (≈ 8 herních let) na změnu. V okně smí:
  - **přísahat jinému pánovi** – zadá jeho pozvánkový kód (souhlas nového pána); ne pánovi, který
    je ve stromu pod ním;
  - **osamostatnit se** – přejde pod knížete, jen má-li jeho rod **víc lidí** než rod pána (ve
    všech vsích rodu);
  - nic neudělat – vazalství trvá.
- **Okno se otevře i**, když pán **14 skutečných dní** nebyl ve hře, nebo když vazalova ves
  hladověla bez pomoci, ač pán obilí měl (Pomoc v nouzi). Pak smí vazal osamostatnit se i bez
  převahy lidí.
- **Pán vazala propustí** kdykoli (s potvrzením) – vazal přejde k pánovu pánovi (od knížete je
  svobodný).
- **Vymře-li rod vazala** (konec hry): jeho vazalové přejdou k jeho pánovi a otevře se jim okno
  přísahy. Začne-li hráč znovu, je nový rod vazalem téhož pána (žije-li jeho rod, jinak
  Přidělení bez pozvánky) a okno přísahy se otevře i jemu.
- **Vymře-li rod pána:** jeho vazalové přejdou k jeho pánovi a otevře se jim okno přísahy;
  začne-li pán znovu, vazaly nemá – mohou se k němu vrátit jeho kódem.
- **Vzpoura** – až s válkou.
- **Proč okno:** vazalství drží, ale každá generace (≈ 9 skutečných dní) ho může změnit – strom
  se hýbe, ale ne každou hodinu.

## Co hráč vidí (UI jako 0 A.D.)

- **Registrace:** pole „Pozvánka“ (formulář mimo hru, s popisky jako dnes – [účty](accounts.md)).
- **Horní lišta:** ikona **sepjatých rukou** (přísaha) s počtem vazalů → panel vazalství.
- **Panel vazalství:**
  - nahoře **pán** – portrét jeho muže, popisek „Bořivoj – Lhota“; nad svobodným pánem korunka
    knížete (popisek „Kníže“);
  - řada **vazalů** – portrét, počet lidí, klas s loňskou dávkou (kg), ikona hladu, když
    hladoví; praporec u pozvaných;
  - po kliku na vazala **Poslat obilí** (vůz s klasem, množství) a **Propustit** (rozetnutý
    řetěz, potvrzení);
  - **Pozvánky** – pečeť s počtem volných míst; klik vydá kód, ukáže kód a odkaz s tlačítkem
    kopírovat (výjimka – kód je text); vydané kódy s přesýpacími hodinami a zbývajícími dny,
    křížek kód zruší;
  - **Pomoc vazalům** – přepínač s ikonou sýpky, zapnutý svítí;
  - **okno přísahy** – u pána přesýpací hodiny se zbývajícími dny, tlačítko **Přísahat** (pole
    pro kód) a **Osamostatnit se** (zašedlé s důvodem u kurzoru „Tvůj rod je menší než pánův.“).
- **Upozornění** jako ostatní ve hře: „Ctibor hladoví.“ (vazal), „Můžeš zvolit pána.“, „Bořivoj
  tě propustil.“, „Ctibor přísahal jinému pánovi.“
- Dávka a pomoc se projeví v zásobách a kronice; ve scéně nic (vůz Později).

## Čísla (návrh Clauda – do `rules-vassalage.ts`)

| Co                                     | Číslo                                                |
| -------------------------------------- | ---------------------------------------------------- |
| Nevyužité kódy najednou                | 3                                                    |
| Platnost kódu                          | 14 skutečných dní                                    |
| Činný hráč                             | 3 dny ve hře z posledních 14                         |
| Přidělení vazalové na pána (i knížete) | nejvýš 5                                             |
| Mapa vazala / svobodného pána          | aspoň 2 / 3 políčka od ostatních hráčů               |
| Dávka                                  | 1/10 obilí nad 2 roční potřeby, 1. 11.               |
| Cesta dávky a pomoci                   | 2 herní dny na políčko vzdálenosti                   |
| Samočinná pomoc                        | 60 dní jídla, jen nad 2 roční potřeby pána, 1× ročně |
| Okno přísahy                           | 3 skutečné dny                                       |
| Nečinný pán                            | 14 skutečných dní mimo hru                           |

## Pro implementaci (poznámky, ne kód)

- **DB:** `invite_code` (kód, vydavatel, vytvořen, platí do, rezervace, využil, zrušen),
  `vassalage` (pán, vazal, od, jak vzniklo – pozvánka / přidělení / přísaha), dny ve hře
  hráče; adaptéry portů v `packages/db/src/adapters/`. Kníže je pevný kořen (bez řádku hráče).
- **Use-casy:** `issueInvite`, `revokeInvite`, `redeemInvite` (v `enterGame`), `assignLord`,
  `swearFealty`, `becomeIndependent`, `releaseVassal`, `sendAid`, `setAidToVassals`.
  Přihlašování zůstává mimo hexagon – doména zná jen id hráčů a strom.
- **Dávka a pomoc jsou vnější události:** ves v simulaci 1. 11. odečte dávku do odchozí schránky
  (jen ze svého stavu – deterministicky); hlad zapíše do stavu. Use-case `deliverShipments` po
  dopočtu (web i worker) odešle pomoc z pánovy vsi dnes a doručí náklad v den příjezdu, nejdřív
  dnes – jako `settleStewardDepartures`, idempotentně podle id zásilky. Výsledek každé vsi tak
  nezávisí na kouscích dopočtu.
- **Mřížka světa:** `settlement.grid_x` / `grid_y` se stanou souřadnicemi společné mřížky; vývojová
  sídla se do ostrého světa nepřenášejí (premium-landscapes.md).
- Testy: kód (platnost, rezervace, jednorázovost, kruh), přidělení do šířky, dávka jen nad dvě
  roční potřeby, samočinná pomoc, okno přísahy, propuštění, vymření rodu pána i vazala.

## Později

- **Válka:** obrana vazala, svolání vazalů k nájezdu, zákaz nájezdu na pána a spoluvazaly,
  vzpoura, NPC vojvoda jako vazal po porážce ([válka](war.md)).
- **Sňatky mezi rody** – nevěsty z rodu pána nebo vazala místo „z okolí“ (lord.md – Manželky).
- **Dávky v dalším zboží** (dobytek, hřivny, kožešiny) a **služby** – povoz, stavba a opravy
  pánova hradiště (rešerše – Hradská soustava).
- **Družina** pána živená z dávek (rešerše – Ibrahim ibn Jakub).
- **Kníže s doménou** a hradská soustava; prestiž a tituly podle vazalů.
- Pohled do scény vazalovy vsi; vůz s dávkou ve scéně; obchod mezi vsemi hráčů.
- Návrh světa: rozmístění NPC vsí a kostra řek a stezek ve společné mřížce.

## Navazuje

- [Seniorát](seniorate.md) – hráčův muž, vlastní ves, výhoda pozvaného hráče.
- [Účty](accounts.md) – registrace s pozvánkou.
- [Prémiové krajiny](premium-landscapes.md) – společná mřížka světa.
- [Válka](war.md) – vzpoura a obrana.

## Otázky na Martina

1. **Kdo stojí na vrcholu stromu?** Doporučení: **nehráčský kníže** – prvních pět hráčů bez
   pozvánky jsou svobodní páni pod ním, při spuštění tak nerozhoduje, kdo klikne první.
   Možnosti: a) kníže; b) první hráč světa; c) Martin.
2. **Komu se přidělí hráč bez pozvánky?** Doporučení: **do šířky od vrcholu** – činnému hráči
   nejblíž vrcholu, každý pán nejvýš 5 přidělených. Možnosti: a) do šířky; b) nejsilnějšímu rodu;
   c) náhodně mezi činnými hráči.
3. **Jakou dávku odvádí vazal?** Doporučení: **desetinu obilí nad dvě roční potřeby, 1. 11.**
   – vazala nevyhladoví, bohatý vazal dá víc. Možnosti: a) desetina přebytku; b) pevná dávka
   podle počtu lidí; c) v první verzi žádná dávka, jen pomoc pána.
4. **Kdy smí vazal od pána odejít?** Doporučení: **jen v okně přísahy** – 3 dny po smrti
   vojvody jedné ze stran, při nečinném pánovi nebo nepomoci v hladu. Možnosti: a) okno přísahy;
   b) kdykoli; c) v první verzi nikdy (až vzpourou ve válce).
5. **Kdy hráč „přivedl jiného hráče“** (seniorát – bez losu)? Doporučení: **má činného vazala,
   kterého sám pozval** – výhoda trvá, dokud vazal hraje a zůstává jeho. Možnosti: a) činný
   pozvaný vazal; b) stačí jednou kohokoli pozvat – navždy; c) každý pozvaný dá jedno nástupnictví
   bez losu.
