# Strava a dobytek – obilí, maso, ovoce

Stav: návrh k 18. 10. 2026, čeká na schválení. Implementace zatím není.

## Proč

Raně středověká strava nebyla jen obilí. Plné nasycení potřebuje kombinaci **obilí, masa a ovoce**
(Martin). Dobytek, dosud jen ozdoba, se tím stává zdrojem masa – a jeho chov navazuje na pastvu na
úhoru, louky na seno, les (žaludy) a ohradu z [orání rádlem](oxen.md).

## Cíle, ne-cíle, anti-cíle

- **Cíl:** samo obilí ani samo ovoce **nikdy úplně nenasytí** – je potřeba kombinace
  obilí–maso–ovoce (Martin).
- **Cíl:** ovoce zvyšuje nasycení i štěstí – je sladké (Martin).
- **Cíl:** maso dává **dobytek** – prasata vykrmená žaludy v lese, přebytečné kusy ovcí, koz
  a krav; slepice dávají vejce (Martin potvrdil směr).
- **Ne-cíl (teď):** lov a rybolov (později jako doplněk), mléko a sýry jako zvláštní potravina,
  zelenina ze zahrádek, sůl a uzení jako suroviny, nemoci dobytka.
- **Anti-cíl:** ves, která vymře jen proto, že nemá maso – nedostatek pestrosti strávníky oslabí,
  ale hladem se umírá jen z nedostatku energie (viz Hlad).

## Pojmy

- **Jablka → ovoce** – v rozhraní se přejmenují na **ovoce**, ikona zůstane (Martin). Sad dál
  plodí jablka; „ovoce“ je zásoba.
- **Energie** – kolik jídla (v obilních ekvivalentech) lidé snědí proti potřebě. **Obilí 1,
  maso 0,6, ovoce 1/7** (maso ≈ 2 000 kcal/kg proti obilí ≈ 3 400; jablka jako dnes – návrh
  Clauda).
- **Nasycení** – co hráč vidí (0–100 %): energie **a** pestrost stravy (níže).

## Pravidla (návrh Clauda, doladí se hraním)

### Podíly ve stravě

- Plná strava = **75 % energie z obilí, 20 % z masa, 5 % z ovoce**.
- **Nasycení = pokrytí energie × pestrost**, kde pestrost = 0,80 + 0,14 × pokrytí masa +
  0,06 × pokrytí ovoce (pokrytí = snědené ÷ podíl ve stravě, nejvýš 1):
  - jen obilí (dost energie) → **nasycení 80 %**,
  - obilí + maso → **94 %**,
  - obilí + ovoce → **86 %**,
  - obilí + maso + ovoce → **100 %** (Martin – kombinace).
- **Ovoce nikdy nestačí samo:** ovoce smí pokrýt nejvýš **25 % energie**, maso nejvýš **40 %** –
  zbytek musí být obilí (Martin). Ovoce se jí přednostně, dokud nezkazí (k 1. 3. – [sad](orchard.md)),
  maso po něm, obilí dorovná.
- **Ovoce a štěstí:** když lidé jedí ovoce, štěstí **+5** (sladké – Martin; [štěstí](happiness.md)).

### Hlad

- **Hladem se umírá z energie, ne z pestrosti:** nahromaděný hlad ([populace](population.md) –
  Hlad a vymření) roste jen z nedostatku **energie** (pod 90 %).
- **Nasycení** (energie × pestrost) dál řídí porody (pod 50 % se nerodí, plně od 95 %) a štěstí
  (hlad ubírá štěstí, pod 90 %). Ves jen s obilím (80 %) se tedy množí pomaleji a je méně šťastná,
  ale neumírá.

### Dobytek – stáda a maso

- **Výchozí stádo** (dnes ozdoba – stane se skutečným): na domácnost 3 ovce, 1 koza, 2 prasata,
  slepice u obydlí; jedna kráva na 2 domácnosti. Stáda **rostou** (ovce a kozy +40 % ročně,
  prasata +100 %, krávy +20 % – mláďata; návrh Clauda) až do **nosnosti**:
  - **ovce, kozy, krávy:** pastva na úhoru a loukách – ≈ **1 ha na krávu, 0,2 ha na ovci
    nebo kozu**; krávy (a voli) navíc potřebují na zimu **seno** ([orání rádlem](oxen.md) – 1,5 t
    na kus),
  - **prasata:** les do 600 m od vsi – ≈ **1 ha lesa na prase** (žaludy a bukvice).
- **Porážka na podzim** (listopad): co přeroste nosnost a mladé kusy navíc jdou na maso:
  **prase ≈ 50 kg, ovce ≈ 15 kg, koza ≈ 12 kg, kráva ≈ 120 kg** masa (návrh Clauda). Ves si nechá
  chovné kusy (nejméně pár od každého druhu).
- **Vejce:** slepice dají celý rok ≈ **5 kg vajec na slepici** (počítají se jako maso – návrh
  Clauda).
- **Zásoba masa** se **uzí a suší** – ztratí **20 % ročně** (návrh Clauda). Potřeba masa ve
  stravě ≈ **20 kg na dospělého a rok** (dítě 12, starší 15) = 20 % energie.
- **Práce:** pasou děti – žádná práce (Martin); porážka a uzení ≈ **1 člověkoden na 20 kg masa**;
  seno podle [orání rádlem](oxen.md).
- **Ohrada:** krávy a voli přes zimu v ohradě s přístřeškem ([orání rádlem](oxen.md)); ovce, kozy
  a prasata přezimují u domů (návrh Clauda).

## Co hráč vidí

- V horní liště **obilí, maso, ovoce** (ikony + čísla) a nasycení; tooltip nasycení ukáže
  podíly (ikony obilí / maso / ovoce s procenty).
- Stáda ve scéně odpovídají skutečnému počtu zvířat; na podzim porážka (krátká zpráva).
- V panelu ohrady a u stád počty zvířat a nosnost (ikony + čísla).

## Rozhodnutí

| Rozhodnutí                                                                                    | Kdo                  |
| --------------------------------------------------------------------------------------------- | -------------------- |
| Jablka → „ovoce“ (ikona zůstane); ovoce zvyšuje nasycení i štěstí                             | Martin               |
| Plné nasycení jen z kombinace obilí–maso–ovoce; samo obilí ani ovoce nestačí                  | Martin               |
| Maso z dobytka (prasata v lese, přebytky ovcí, koz, krav), vejce; lov a rybolov později       | Martin potvrdil směr |
| Podíly 75 / 20 / 5 %, pestrost 0,80 + 0,14 × maso + 0,06 × ovoce; strop ovoce 25 %, masa 40 % | návrh Clauda         |
| Hladem se umírá jen z nedostatku energie, pestrost řídí porody a štěstí                       | návrh Clauda         |
| Růst stád, nosnost (pastva, les, seno), porážka a výtěžnost masa, vejce, uzení 20 %/rok       | návrh Clauda         |
