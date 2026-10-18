# Dvorec vojvody, zemská stezka a obchod se sousedy

Stav: schváleno 18. 10. 2026 (Martin: „Ano, spusť to takhle“; obchod se sousedem bez simulace –
varianta „a“). Implementace zatím není.

## Proč

Ves má mít svého pána. Martin: „Jedna z obytných staveb by měla být větší a honosnější než
zbylé – to bude obydlí vojvody. Když na něj kliknu, uvidím tam ‚upgrady‘ pro celou vesnici.
Úplně prvním z nich bude možnost vybudovat cestu do některé ze sousedních vesnic (celkem 8
směrů). Pokud vybudujeme cestu do sousední vesnice, budeme s ní moci obchodovat.“ Obchod dá vsi
to, co sama nemá (sůl, železo, med), a smysl přebytkům (keramika, sýr, dřevo).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** jedno obydlí vsi je **dvorec vojvody** – větší a honosnější (Martin).
- **Cíl:** klik na dvorec ukáže **vylepšení celé vsi**; první je **zemská stezka** do jednoho
  z 8 směrů (Martin).
- **Cíl:** po stezce ves **obchoduje se sousední vsí** v tom směru (Martin).
- **Cíl:** soused je zatím **bez simulace** (stálá povaha, nabídka a poptávka); až budou skutečné
  vsi NPC vojvodů ([válka](war.md)), obchod převezmou ony (Martin – varianta a).
- **Ne-cíl (teď):** peníze a ceny na trhu, vozy, cla a mýto, obchodníci z daleka, válka o stezku,
  další vylepšení vsi (hradiště, družina, trh – přijdou později do stejného panelu).
- **Anti-cíl:** obchod bez práce a bez času (zboží se teleportuje), nebo nekonečný zdroj (soused
  nemá zásoby bez omezení).

## Dvorec vojvody

- **Kde se vezme** (návrh Clauda): v nové vsi se dvorcem stane první zemnice zakladatelů (bydlí
  v ní vojvodova rodina – s [příbuzenstvím](kinship.md) rodina hlavy rodu); ve stávající vsi
  nejstarší obydlí. Když dvorec dožije, obyvatelé ho přestaví na **dvorec** (nový typ obydlí).
- **Dvorec** (nový typ obydlí – návrh Clauda): delší a vyšší polozemnice / dům se zdobenými
  štíty (vyřezávané konce střešních trámů – koňské hlavy), větší pozemek (2 políčka) s plotem
  a branou, kapacita 10 lidí. Cena a dřevo jako polozemnice × 1,5. Jeden na ves.
- Vojvoda může v dvorci bydlet i ve zemnici (na začátku) – vylepšení vsi jdou odtud vždy.
- Panel výběru dvorce: obyvatelé jako u obydlí + **vylepšení vsi** (ikony, cena v popisku,
  zašedlé s důvodem – jako v 0 A.D.).

## Zemská stezka (první vylepšení)

- Hráč zvolí **směr** (8 šipek – S, SV, V, JV, J, JZ, Z, SZ). Stezka vede od dvorce ke kraji
  mapy v tom směru – trasu najde síť cest (nejlevnější chůze, brody, svahy), osa se uloží.
- Stavba = pevná cesta stupně **upravená** po celé délce ([roads.md](roads.md) – 15 čd na 100 m),
  plus hať a lávka, kde vede mokřinou nebo přes potok. Kde už pevná cesta je, platí se jen
  vylepšení. Staví se ze společné práce vsi, po úsecích od vsi ven (vytyčení hned).
- Hotová stezka je pevná cesta (nezaroste), stromy u ní rostou jako u ostatních pevných cest.
- Víc stezek = víc sousedů (každá stavba zvlášť).

## Sousedé (bez simulace – varianta a)

- V každém z 8 směrů je soused s **povahou** určenou deterministicky ze seedu světa a směru
  (návrh Clauda): 2–3 druhy zboží **nabízí** (přebytek – levně), 2–3 **shání** (dražší).
  Zboží souseda: obilí, maso, sýr, luštěniny, dobytek (kusy), klády, keramika, nástroje, uhlí
  a **zboží zvenku**: **sůl, železo, med, kožešiny**.
- Zásoby souseda: každého nabízeného zboží má na rok omezené množství (doplní se 1. 11.);
  poptávka je taky omezená (kolik toho za rok vezme).
- Jméno souseda (vsi) navrhne hra (`suggestVillageName`), vojvoda zatím nemá tvář.

## Obchod

- **Výměnou, ne za peníze** (návrh Clauda). Každé zboží má hodnotu v kg obilí (např. sýr 4,
  maso 3, med 6, sůl 8, železo 30, nástroje 60, keramika 3, klády 40 za kus, kráva 600 za kus…
  – čísla doplní stavitel z rešerše o raně středověkých poměrech hodnot a zapíše). Soused
  bere s přirážkou **≈ 20 %**; co shání, za to dá o ≈ 20 % víc, co nabízí, dá o ≈ 20 % levněji.
- **Doprava:** zboží nesou lidé po stezce – **≈ 25 kg na člověka a cestu** (dobytek se žene);
  cesta tam a zpět trvá **2–6 dní** podle délky stezky (+ cesta za krajem mapy 1 den). Práce
  nosičů = lidé × dny (ze společné práce vsi, jako stavba); zboží dorazí, až se nosiči vrátí.
- **Panel obchodu** (dvorec, po dostavění stezky): soused (jméno, směr), ikony zboží – co dáš,
  co dostaneš, posuvníky, bilance hodnoty (musí být ≥ 0 pro souseda), cena v práci a dny cesty.
  Potvrdit → výprava vyrazí. Jedna výprava na souseda naráz.
- **Ve scéně:** nosiči odejdou po stezce ke kraji mapy a vrátí se s nákladem (postavy jako
  ostatní – `villager-plan`).
- **Zboží zvenku ve vsi** (návrh Clauda): sůl, železo, med, kožešiny jsou zásoby v horní liště
  (ikony – jen když nějaké jsou). **Železo** může kovář použít místo vlastní rudy (dnes jen
  bahenní ruda – [řemesla](crafts.md)). **Med** se jí (energie, štěstí jako ovoce). **Sůl**
  a **kožešiny** zatím přidávají štěstí; sůl později prodlouží trvanlivost masa a sýra.
- Kronika: stezka dostavěna, výprava odešla / vrátila se (co přinesla).

## Rozhodnutí

| Rozhodnutí                                                                                 | Kdo          |
| ------------------------------------------------------------------------------------------ | ------------ |
| Dvorec vojvody – větší a honosnější obydlí; klik ukáže vylepšení vsi                       | Martin       |
| První vylepšení: cesta do sousední vsi v jednom z 8 směrů; po ní obchod                    | Martin       |
| Soused zatím bez simulace (stálá povaha), později skutečné vsi NPC vojvodů                 | Martin (a)   |
| Dvorec = první / nejstarší obydlí, přestavba na dvorec, kapacita 10, cena ×1,5, jeden      | návrh Clauda |
| Stezka = upravená cesta ke kraji mapy (+ hať a lávka), po úsecích od vsi                   | návrh Clauda |
| Povaha souseda ze seedu: 2–3 nabízí, 2–3 shání; roční zásoby a poptávka                    | návrh Clauda |
| Výměna podle hodnot v kg obilí, přirážka ≈ 20 %; nosiči 25 kg, 2–6 dní, práce vsi          | návrh Clauda |
| Zboží zvenku: sůl, železo (pro kováře), med (jídlo), kožešiny; štěstí                      | návrh Clauda |
