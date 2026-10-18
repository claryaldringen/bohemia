# Štěstí obyvatel a posvátná místa

Stav: schváleno 18. 10. 2026 (Martin: „Ano, takhle je to dobré“). Implementace zatím není.

## Proč

Ves není jen pracovní síla – lidé, kteří hladoví, pohřbívají děti a dřou na doraz, pracují hůř.
Štěstí obyvatel dává hráči další páku na produktivitu (Martin) a otevírá posvátná místa raných
Slovanů: posvátné duby, dubové háje, dřevěné modly a nakonec svatyni jako v Perynu.

## Cíle, ne-cíle, anti-cíle

- **Cíl:** štěstí ovlivňuje produktivitu práce celé vsi (Martin).
- **Cíl:** štěstí zvyšují posvátná místa (Martin); snižuje ho hlad, úmrtí, přeplněnost a dřina
  (Martin potvrdil).
- **Cíl:** posvátné duby a háje vznikají samy – vesničané je při mýcení nechají stát (Martin).
- **Ne-cíl (teď):** kněží a obřady jako mechanika, svátky, víra jako surovina, křesťanství.
- **Anti-cíl:** ukazatel, který se mění skokem a hráč ho musí neustále hlídat – štěstí se mění
  pomalu.

## Štěstí

- Číslo **0–100**, výchozí **50** (návrh Clauda). Hráč ho vidí v horní liště (ikona + číslo).
- **Cílová hodnota** = 50 + posvátná místa + dobré zásoby − hlad − úmrtí − přeplněnost − dřina,
  oříznutá na 0–100. Skutečné štěstí se k cíli **posouvá pomalu** – o 10 % rozdílu za měsíc (návrh
  Clauda), takže jedna špatná zima ves nezlomí a jedna socha ji hned nespasí.
- **Co ubírá** (návrh Clauda, doladí se hraním):
  - **hlad:** nasycení pod 0,9 ubere až **40** (lineárně k nulovému nasycení),
  - **úmrtí** za poslední rok: dospělý −3, dítě −5, dohromady nejvýš **−20**,
  - **přeplněnost:** podíl lidí v přeplněných domácnostech × **15**,
  - **dřina:** podíl dní za posledních 60, kdy ves nestihla práci v období (polní práce se
    nedodělala), × **15**.
- **Co přidává:** posvátná místa (níže), dobré zásoby (zásoby na víc než rok) **+5**.
- **Účinek na práci** (Martin – „nechme to tak, doladíme později“): veškerá práce vsi se násobí
  - štěstí 0 → **× 0,8**, štěstí 50 → **× 1**, štěstí 100 → **× 1,1** (mezi tím lineárně).
  - Násobí se s mezemi produktivity od řemeslníků ([řemesla](crafts.md)).

## Posvátná místa

Každé místo přidá k cílovému štěstí; posvátná místa dohromady nejvýš **+40** (návrh Clauda).

### Posvátný dub (vzniká sám)

- **Velký solitérní dub** – dospělý dub z vrstvy překážek, který je velký (horní třetina velikosti
  dubů v krajině – návrh Clauda) a nestojí v souvislém lese (Martin: „pokud na nějaký takový při
  mýcení lesa narazí, nechají ho stát, i když kolem bude třeba pole“).
- Když se mýtí čtverec (pole, sad, hřbitov, staveniště) a stojí na něm takový dub, **vesničané ho
  nechají stát** – nepokácí ho a nedá kládu. Čtverec pole se oseje kolem (plocha pod korunou ≈ 50 m²
  se do dílu nepočítá). Pro kácení na stavby se takový dub nebere.
- Dub se tím **stane stavbou** – jde vybrat a ve scéně má u kmene drobné obětiny (kameny, stužky).
  Přidá **+5** štěstí, započítají se nejvýš **3** duby.
- Hráč dub ochránit nemusí; na posvátný dub se pak nedá stavět ani ho pokácet.

### Dubový háj (vzniká sám)

- **Háj** = místo v lese, kde roste aspoň **6 dospělých dubů** v okruhu **25 m** (návrh Clauda).
- Když se mýtí les kolem, **vesničané háj nechají** a vykácejí jen les okolo (Martin). Čtverce
  háje se z pole (nebo jiné stavby) vyjmou a celý háj se **změní ve stavbu po čtvercích** – jako
  sad (Martin). Jde vybrat, ve scéně má na okraji kamenný kruh a obětiny.
- Přidá **+10** štěstí a **+1 za každé 2 duby nad 6**, nejvýš **+15** za háj; započítají se nejvýš
  **2** háje.

### Dřevěná modla (staví hráč)

- Jednoduchá dřevěná socha na kůlu (inspirace: modly ze Zbruče a Wolinu, Martin – wiki), kolem malý
  udusaný kruh. Staví se jako obydlí – půdorys **4 × 4 m** kamkoli na louku (návrh Clauda).
- Cena: **30 člověkodní a 1 dospělý dub** (kmen na modlu – dřevo podle [lesa](forest.md)).
- Přidá **+8** štěstí, započítají se nejvýš **2** modly.

### Svatyně (staví hráč – nejvyšší úroveň)

- Podle svatyně Peruna v Perynu u Novgorodu (Martin): kruhový okrsek ≈ **21 m** v průměru,
  obehnaný příkopem s **osmi výběžky**, v každém ohniště, uprostřed modla. Půdorys
  **30 × 30 m** na louce, rovný terén (≤ 1 m převýšení – návrh Clauda).
- Cena: **400 člověkodní a 3 dospělé duby** (návrh Clauda). Žádná odemykací podmínka kromě surovin
  (Martin – odemykání jen surovinami).
- Přidá **+25** štěstí; jedna svatyně na ves.
- Ve scéně z ohnišť občas stoupá dým (jako z obydlí).

## Co hráč vidí

- V horní liště ikona štěstí s číslem (tooltip „Štěstí“).
- V nabídce staveb **modla** a **svatyně** (název + cena v tooltipu).
- Posvátné duby a háje se objeví samy, když se kolem mýtí – jdou vybrat; panel výběru ukáže,
  kolik přidávají (ikona štěstí + číslo).
- Upozornění (fakt): „Vesničané ušetřili posvátný dub“ / „… dubový háj“.

## Navazuje

- Kněží a obřady, svátky v kalendáři (Kupadla, Koleda), oběti z úrody.
- Christianizace (od 9. století) – kostel místo svatyně.

## Rozhodnutí

| Rozhodnutí                                                                             | Kdo                                       |
| -------------------------------------------------------------------------------------- | ----------------------------------------- |
| Štěstí obyvatel ovlivňuje produktivitu práce; zvyšují ho sakrální stavby               | Martin                                    |
| Snižuje ho hlad, úmrtí, přeplněnost a dřina                                            | návrh Clauda, Martin potvrdil             |
| Štěstí 0 → práce × 0,8, 50 → × 1, 100 → × 1,1                                          | návrh Clauda, Martin potvrdil (doladí se) |
| Velké solitérní duby a dubové háje vesničané při mýcení nechají; stanou se stavbou     | Martin                                    |
| Dřevěná modla; svatyně podle Perynu jako nejvyšší úroveň                               | Martin                                    |
| Čísla (výchozí 50, posun 10 %/měsíc, příspěvky a stropy, ceny, rozměry, definice háje) | návrh Clauda                              |
