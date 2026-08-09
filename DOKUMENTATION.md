# Risiko – Hausregel-Edition · Technische Dokumentation

Stand dieser Doku: aktueller Entwicklungsstand (3D-Karte aus SVG, lokal spielbar).
Zielgruppe: Entwickler:in (JavaScript) und Webdesigner:in, die das Projekt fortführen.

---

## 1. Was ist das Projekt?

Ein browserbasiertes Risiko-Spiel mit eigenen **Hausregeln**, gedacht zum
Spielen mit Freunden. Aktuell läuft es als reine Webapp, **hotseat** – alle
Spieler an einem Gerät, reihum. Der Online-Mehrspieler-Modus ist vorbereitet,
aber noch nicht gebaut (siehe Abschnitt 9).

Kein Framework, kein Build-Schritt, keine Installation, **kein Internet**.
Öffnen genügt. Three.js liegt als `vendor/three.min.js` bei, die Karte fertig
gebacken als `risiko-daten.js`.

---

## 2. Dateien im Ordner

| Datei | Zweck | Pflicht |
|------|-------|---------|
| `risiko.html` | Oberfläche (UI) und 3D-Darstellung (Three.js), plus das Grundgerüst | ja |
| `risiko-regeln.js` | Regelkern `RiskEngine` – die gesamte Spiellogik, ohne HTML und ohne Karte | ja |
| `risiko-karte.js` | Karten-Modul `SvgMap`: liest die SVG ein, wandelt sie in Polygone, cacht sie | ja |
| `risiko-daten.js` | **Erzeugt.** Die gebackene Karte. Wird beim Start automatisch geladen und hat Vorrang vor Cache und SVG-Auswahl | ja |
| `vendor/three.min.js` | Three.js r128, lokal statt per CDN | ja |
| `Risk.svg` | Die Ausgangs-Weltkarte, 42 benannte Flächen (Illustrator-Export, `viewBox 0 0 1983.16 1516.84`). Nur zum Backen nötig, nicht zum Spielen | nein |
| `grafik/land-textur.js` | **Erzeugt.** Die gemalte Weltkarte als data-URL (`window.RISIKO_TEX`). Fehlt sie, bleibt das Brett einfarbig | nein |
| `grafik/Risk_tex.png` | Die Malerei in voller Auflösung. Nur zum Backen nötig, nicht zum Spielen | nein |
| `werkzeug/karte-backen.mjs` | Backt `Risk.svg` → `risiko-daten.js`, headless | nein |
| `werkzeug/textur-backen.mjs` | Prüft und backt die Malerei → `grafik/land-textur.js` | nein |
| `werkzeug/regeln-testen.mjs` | Tests für den Regelkern (`npm test`) | nein |
| `werkzeug/regeln-laden.mjs` | Lädt `risiko-regeln.js` in Node | nein |
| `werkzeug/einzeldatei-bauen.mjs` | Packt alles in eine verschickbare HTML-Datei | nein |
| `archiv/risiko-karte_STABIL-v1.js` | Beschriftete Sicherungskopie des Karten-Moduls | nein |
| `archiv/risiko-karte-gezeichnet.js` | Selbstgezeichnete Weltkarte, Ersatzquelle zum Backen | nein |
| `archiv/risiko-welt.js` | Verworfene Kartenvariante `WorldMapGeo` aus echten Geodaten | nein |

Die Pflichtdateien müssen **beieinander** liegen (`vendor/` als Unterordner
daneben). Öffnen: `risiko.html` per Rechtsklick → „Öffnen mit" → Chrome
(oder anderer moderner Browser). Kein Auswählen, kein Internet.

Der Ordner `archiv/` enthält ausschließlich Stände, die **nicht** eingebunden
sind – nichts darin wird von `risiko.html` geladen (siehe `archiv/README.md`).
`werkzeug/` enthält Entwicklerwerkzeuge; zum Spielen wird davon nichts
gebraucht.

> Frühere Fassungen dieser Doku beschrieben, dass die SVG einmal von Hand
> ausgewählt werden muss. Das ist überholt: die Karte wird vorab gebacken und
> liegt als `risiko-daten.js` im Repo (Abschnitt 5.4).
>
> Der Grund für die frühere Auswahl bleibt gültig und erklärt, warum es
> `risiko-daten.js` überhaupt gibt: ein Browser lädt lokale Dateien aus
> Sicherheitsgründen nicht per `fetch()`. Ein `<script src>` darf er dagegen
> laden – deshalb ist die Karte eine JS-Datei und keine JSON-Datei.

---

## 3. Architektur-Grundidee: Regelkern getrennt von Darstellung

Das ist die wichtigste Designentscheidung. Der Code besteht aus drei Schichten,
die klar getrennt sind:

```
┌─────────────────────────────────────────────┐
│  TEIL 1: RiskEngine   (reine Spiellogik)      │  kennt kein HTML, kein Three.js
│    - Zustand (state)                          │
│    - validate(state, action) -> {ok, error}   │
│    - apply(state, action)    -> {ok, state}   │
├─────────────────────────────────────────────┤
│  TEIL 2: SvgMap       (Kartendaten)           │  liefert Polygone/Farben/Mittelpunkte
├─────────────────────────────────────────────┤
│  TEIL 3: Oberfläche + Board3D (Darstellung)   │  zeichnet, nimmt Klicks entgegen,
│    - render(), Board3D (Three.js)             │  ruft NUR RiskEngine.apply() auf
└─────────────────────────────────────────────┘
```

**Warum diese Trennung?** Jede Spielaktion ist ein einfaches Datenpaket, z. B.
`{type:"ATTACK", from:"china", to:"india"}`. Die Oberfläche entscheidet nichts
selbst – sie schickt nur Aktionen an den Regelkern und zeichnet den
zurückgegebenen Zustand. Das bringt drei Vorteile:

1. **Die Darstellung ist austauschbar.** Wir haben die Karte im Projektverlauf
   mehrfach komplett ersetzt (flach 2D → isometrisch → 3D), ohne eine einzige
   Regel anzufassen.
2. **Online-Multiplayer wird ein Anbau, kein Umbau.** Genau diese Aktions-Pakete
   verschickt man später übers Netz.
3. **Testbarkeit.** Der Regelkern lässt sich ohne Anzeige prüfen. `npm test`
   führt `werkzeug/regeln-testen.mjs` aus – 28 Tests, ohne Browser, ohne
   Karte, ohne Three.js, in unter einer Sekunde.

---

## 4. Der Regelkern `RiskEngine` (`risiko-regeln.js`)

Ein IIFE, das ein Objekt mit reinen Funktionen zurückgibt.

Die Datei ist bewusst gewöhnliches Browser-JavaScript ohne Modul-Syntax:
`risiko.html` bindet sie per `<script src>` ein, ganz ohne Build-Schritt.
Wer den Kern in Node braucht – die Tests, das Backwerkzeug, später der
Server – lädt ihn über `werkzeug/regeln-laden.mjs`, das den Quelltext liest
und auswertet. Dadurch läuft überall **derselbe** Code; es gibt keine
zweite Fassung, die auseinanderlaufen könnte.

**Unveränderlich behandeln:** `apply()` verändert nie den Eingabezustand,
sondern klont ihn (`JSON.parse(JSON.stringify(...))`) und gibt einen neuen
zurück.

### 4.1 Zustandsobjekt (state)

```js
{
  players: [{name, color, alive}],   // Reihenfolge = Zugreihenfolge
  owner:   { terrId: playerIndex | -1 },   // -1 (NONE) = herrenlos (nur in Aufstellung)
  armies:  { terrId: number },
  opts:    { cap3, cards, draft, dice },   // Hausregel-Schalter (siehe 4.4)
  cur:     playerIndex,              // wer ist dran
  phase:   "claim"|"deploy"|"reinforce"|"attack"|"fortify",
  reinf:   number,                   // noch zu setzende Verstärkungen
  toPlace: [number per player],      // Starttruppen in der Aufstellung
  hands:   [ [ {sym} ] ],            // Handkarten je Spieler; sym: inf|kav|art|wild
  deck: [], discard: [],
  tradeCount: number,                // wie oft schon Karten getauscht (Wertstaffel)
  conquered: bool,                   // hat cur diesen Zug erobert? (Karten-Zug am Zugende)
  pending: null | {type:"defend", from, to, aDice, max}   // Wurf liegt, Abwehr fehlt
                | {type:"occupy", from, to, max},        // offene Eroberung
  fortCap: { terrId: number },       // Rest-Verschiebekontingent je Land (Hausregel)
  winner:  null | playerIndex,
  rng:     number,                   // Zustand des Zufallsgenerators (reproduzierbar!)
  log:     [ {t, c, d} ]             // Verlaufszeilen: Text, CSS-Klasse, optional Würfel
}
```

### 4.2 Der Zufallsgenerator ist deterministisch

`createGame(players, opts, seed)` bekommt einen Startwert. Alle Würfel und
Mischvorgänge laufen über `rnd(s)` mit diesem `seed`. **Gleicher Startwert =
exakt gleicher Spielverlauf.** Für Tests ist das Gold wert: ein Fehler lässt
sich mit demselben Startwert beliebig oft nachstellen.

Für den Online-Betrieb war ursprünglich gedacht, damit alle Mitspieler
dieselben Würfel sehen zu lassen, ohne jeden Wurf zu übertragen. Das geht so
**nicht auf** – wer den Zustand hat, kann den nächsten Wurf vorausberechnen.
Warum das ein Problem ist und was daraus folgt, steht in Abschnitt 9.

### 4.3 Aktionen (die einzige Art, den Zustand zu ändern)

`RiskEngine.apply(state, action)` gibt `{ok:true, state:neu}` oder
`{ok:false, error:"...", state:alt}` zurück. `validate()` prüft vorab.

| Aktion | Felder | Bedeutung |
|--------|--------|-----------|
| `CLAIM` | `terr` | Aufstellung: freies Land wählen |
| `DEPLOY` | `terr` | Aufstellung: Starttruppe setzen |
| `AUTO_SETUP` | – | Rest der Aufstellung zufällig füllen |
| `PLACE` | `terr` | Phase 1: Verstärkung setzen |
| `TRADE` | `cards:[i,i,i]` | Phase 1: 3 Handkarten gegen Truppen tauschen |
| `ATTACK` | `from`, `to`, `dice?` | Phase 2: angreifen. Würfelt **nur** für den Angreifer |
| `DEFEND` | `dice` | Abwehr wählen; erst hier wird der Kampf ausgewertet |
| `OCCUPY` | `count` | nach Eroberung: 1..max Truppen nachziehen |
| `FORTIFY` | `from`, `to`, `count?` | Phase 3: verschieben (ohne count = Maximum) |
| `END_PHASE` | – | nächste Phase / nächster Spieler |

Der Ablauf eines Zuges: `reinforce` → `attack` → `fortify` → (Karte ziehen,
falls erobert) → nächster Spieler → `reinforce` …

### 4.4 Die Hausregeln (das Herz des Projekts)

Konfigurierbar im Startmenü über `opts`:

1. **`cap3` – Eroberung auf max. 3 begrenzen.** Nach gewonnenem Kampf dürfen nur
   1–3 Truppen ins eroberte Land nachrücken (Standard-Risiko: bis zu alle).
   Umsetzung: in `apply` bei `ATTACK` wird `pending.max = min(3, armies-1)`
   gesetzt; der Spieler wählt per `OCCUPY`.

2. **Zwischenland-Regel (fest verdrahtet, kein Schalter).** Beim Verschieben
   (Phase 3) darf **jedes Land pro Zug nur so viele Truppen abgeben, wie es zu
   Beginn der Phase hatte** (minus 1, die bleibt immer). Umsetzung: beim Wechsel
   in `fortify` wird `fortCap[id] = armies[id] - 1` als Deckel eingefroren; jede
   `FORTIFY`-Aktion zieht vom Deckel ab (`fortifyCapOf`, `fortifyMaxOf`).

   Wozu das gut ist: In dieser Fassung darf man beliebig oft verschieben, aber
   nur zwischen Nachbarn. Ohne Deckel könnte man dieselben Truppen im selben Zug
   von A nach B, dann nach C und weiter reichen – ein Land in der Mitte wäre
   bloße Durchgangsstation („Zwischenland"), und Truppen legten in einem Zug die
   halbe Karte zurück. Mit Deckel bleiben frisch angekommene Truppen bis zum
   nächsten Zug stehen: **Nachschub marschiert, statt zu teleportieren.**

   Beispiel: Ontario 10, Alberta 1, Alaska 1. Zu Phasenbeginn darf Ontario 9
   abgeben, Alberta 0. Schiebt man 9 nach Alberta, hat Alberta zwar 10 Truppen,
   sein Kontingent steht aber weiter auf 0 – nach Alaska geht diesen Zug nichts
   mehr. Im nächsten eigenen Zug ist Alberta wieder beweglich.

   Der Spieler wählt pro Verschiebung die Anzahl selbst (Dialog).

3. **`cards` – Spielkarten & Tausch.** Nach einem Zug mit Eroberung zieht man
   eine Karte. 3 gleiche oder 3 verschiedene Symbole (★ = Joker) ergeben
   Bonustruppen mit steigender Wertstaffel: **4, 6, 8, 10, 12, 15, dann +5**
   (`tradeValue`). Ab 5 Karten Tauschpflicht zu Zugbeginn. Wer einen Spieler
   ausschaltet, übernimmt dessen Handkarten.

4. **`draft` – Startaufstellung selbst wählen.** Länder werden reihum gewählt
   (`CLAIM`), danach Starttruppen reihum gesetzt (`DEPLOY`). Ausgeschaltet:
   alles wird zufällig verteilt (`AUTO_SETUP`).

5. **`dice` – Würfelanzahl selbst wählen.** Der Angreifer entscheidet, mit wie
   vielen Würfeln er antritt (1 bis `attackMaxOf` = `min(3, Truppen−1)`), nicht
   automatisch mit dem Maximum. Sein Wurf wird **offengelegt**, und erst danach
   entscheidet der Verteidiger, mit wie vielen Würfeln er kontert
   (1 bis `defendMaxOf` = `min(2, Truppen)`).

   Der Sinn: Würfelt der Angreifer 6-6-6, wäre es teuer, mit zwei Würfeln
   dagegenzuhalten – man verliert dann zwei Truppen statt einer. Umgekehrt
   lohnt die volle Abwehr, wenn der Angreifer schwach würfelt. Verglichen
   werden immer nur so viele Paare, wie die **kleinere** Würfelzahl hergibt;
   deshalb begrenzt die Gegenseite den eigenen Höchstverlust, und genau das
   steht auch auf den Knöpfen im Dialog.

   Umsetzung: Der Angriff zerfällt in zwei Aktionen. `ATTACK` würfelt nur für
   den Angreifer und hinterlässt `pending = {type:"defend", aDice, max}` –
   die Truppen bleiben dabei unangetastet. `DEFEND` würfelt für die Abwehr
   und ruft `resolveCombat`, das die Verluste verrechnet und bei Bedarf auf
   `pending = {type:"occupy", …}` weiterschaltet. Solange eine Abwehr aussteht,
   lässt `validate` **nur** `DEFEND` zu.

   Gibt es nichts zu entscheiden – Hausregel aus, oder der Verteidiger hat nur
   eine Truppe –, wertet `ATTACK` sofort aus und setzt gar kein `defend`-pending.
   Der Ablauf bleibt dann exakt der klassische.

   Für den späteren Online-Betrieb ändert sich nichts am Prinzip: `DEFEND` ist
   ein Aktionspaket wie jedes andere und läuft durch dasselbe `validate`.
   Bemerkenswert ist nur, dass hier erstmals ein **anderer** Spieler als
   `state.cur` am Zug ist – wer entscheiden muss, steht in `owner[pending.to]`.

### 4.5 Weltdaten im Regelkern

`TERR` (42 Territorien mit Name + Kontinent), `ADJ` (Nachbarschaften,
beidseitig), `CONTINENTS` (Kontinent-Boni: Nordamerika 5, Südamerika 2,
Europa 5, Afrika 3, Asien 7, Australien 2). Die Nachbarschaften entsprechen
dem klassischen Risiko-Brett. **Die IDs hier sind die kanonischen Schlüssel**,
auf die sich Karte und UI beziehen.

---

### 4.6 Die Sicht eines Spielers: `viewFor(state, pi)`

Der volle Zustand enthält drei Dinge, die kein einzelner Spieler wissen darf:

| Feld | warum geheim |
|---|---|
| `rng` | Wer ihn hat, ruft `apply()` selbst auf und kennt jeden kommenden Wurf |
| `deck` | die Reihenfolge des Stapels verrät die nächsten Karten |
| `hands[andere]` | die Handkarten der Mitspieler |
| `discard` | verriete im Umkehrschluss, was noch im Stapel steckt |

Im Hotseat ist das belanglos – alle sitzen vor demselben Bildschirm, und die
Oberfläche zeigt ohnehin nur die Hand des aktuellen Spielers. Sobald der
Zustand aber übers Netz an mehrere Geräte geht, ist es ein Leck.

`viewFor(state, pi)` liefert eine bereinigte Kopie: `rng` wird `null`,
Stapel, Ablage und fremde Hände werden zu Rückseiten (`{sym:null,hidden:true}`).
**Längen bleiben erhalten**, denn Kartenzahlen sind öffentlich und die
Oberfläche zeigt sie an – sie kann mit einer Sicht unverändert arbeiten.
Zusätzlich stehen `you` (wessen Sicht) und `redacted: true` darin. Mit
`pi = -1` bekommt man eine reine Zuschauersicht. Der Eingabezustand bleibt
unberührt.

Gemessen über 2000 Kämpfe: mit dem vollen Zustand trifft eine Vorhersage des
nächsten Wurfs in **100 %** der Fälle, aus der Sicht nur noch in **2,0 %** –
und das ist genau die Zufallserwartung (1/56 ≈ 1,8 % für drei sortierte
Würfel). Ein Test hält das fest.

> `viewFor` schützt beim **Versand**. Es ersetzt keine serverseitige Prüfung:
> gewürfelt werden muss dort, wo der volle Zustand liegt. Siehe Abschnitt 9.

---

## 5. Das Karten-Modul `SvgMap` (`risiko-karte.js`)

Wandelt deine `Risk.svg` in spielbare Daten. Schnittstelle:

```js
SvgMap.load()          // Promise<bool>; true wenn aus risiko-daten.js ODER Cache geladen
SvgMap.importSvg(text) // SVG-Text einlesen (beim einmaligen Auswählen)
SvgMap.serialize()     // JSON-String der Karte (für den "Karte sichern"-Export)
SvgMap.polys           // { terrId: [ [ [x,y], ... ] ] }  Umrisse (mehrere Ringe = Inseln)
SvgMap.center          // { terrId: {x,y} }  Beschriftungspunkt
SvgMap.color           // { terrId: [r,g,b] }  Grundfarbe aus der SVG
SvgMap.W, SvgMap.H     // normierte Zeichenmaße (W=1200)
```

### 5.1 Anforderungen an die SVG (WICHTIG für Designer:innen)

- Jedes der **42 Territorien** ist eine eigene Fläche.
- Besteht ein Territorium aus mehreren Teilen (Inseln), werden diese zu **einer
  Gruppe `<g id="Name">`** zusammengefasst; Einzelflächen sind ein `<path id="Name">`.
- Der **`id` trägt den deutschen Namen** (siehe Zuordnungstabelle unten).
- Jedes Territorium sollte eine **eigene, deutlich unterscheidbare Füllfarbe**
  haben – daraus zieht das Spiel die Grundfarbe.
- `viewBox` muss gesetzt sein (aktuelle SVG: `0 0 1983.16 1516.84`).

### 5.2 Wie die Umrisse entstehen

`importSvg` hängt die SVG unsichtbar ins Dokument, nutzt die browsereigene
Kurvenmathematik (`getTotalLength` / `getPointAtLength`), um jeden Pfad in eine
Punktfolge abzutasten, vereinfacht sie (Ramer-Douglas-Peucker, `rdp`) und
normiert auf Breite 1200. Wie fein das geschieht, steht in der Konstante
`FEINHEIT` am Kopf von `importSvg` (`punkte`, `minSchritt`, `glaettung`,
`minFlaeche`); `importSvg(text, feinheit)` nimmt optional abweichende Werte.
Ohne zweites Argument bleibt es beim eingespielten Stand. Farbe je Territorium via `getComputedStyle(path).fill`.
Ergebnis wird in `localStorage` (Key `risiko.svgmap.v1`) gecacht.

### 5.3 Namenszuordnung SVG-`id` → Spiel-`id`

```
Alaska→alaska           Nordwest-Territorium→nwterr   Groenland→greenland
Alberta→alberta         Ontario→ontario               Quebeck→quebec
Weststaaten→westus      Oststaaten→eastus             Mittelamerika→centralam
Venezuela→venezuela     Peru→peru                     Brasilien→brazil
Argentinien→argentina   Island→iceland                Großbritannien→greatbritain
Skandinavien→scandinavia Mitteleuropa→northerneu      Westeuropa→westerneu
Suedeuropa→southerneu   Ukraine→ukraine               Nordwestafrika→northafrica
Aegypten→egypt          Ostafrika→eastafrica          Kongo→congo
Suedafrika→southafrica  Madagaskar→madagascar         Ural→ural
Sibirien→siberia        Jakutien→yakutsk              Kamtschatka→kamchatka
Irkutsk→irkutsk         Mongolei→mongolia             Japan→japan
Afghanistan→afghanistan China→china                   Mittlerer_Osten→middleeast
Indien→india            Siam→siam                     Indonesien→indonesia
Neuguinea→newguinea     Westaustralien→westaustralia  Ostaustralien→eastaustralia
```

Wird ein Name nicht gefunden, meldet der Einrichtungs-Bildschirm genau dieses
Territorium (`SvgMap.missing()`). Dann stimmt die `id` in der SVG nicht.

### 5.4 Die Karte backen (statt sie im Browser auszuwählen)

`SvgMap.load()` sucht die Karte in dieser Reihenfolge:

1. `window.RISIKO_MAP` aus **`risiko-daten.js`** – hat immer Vorrang,
2. sonst der `localStorage`-Cache `risiko.svgmap.v1`,
3. sonst gar nichts → der Einrichtungs-Bildschirm erscheint.

Im Normalfall greift Stufe 1, und die Stufen 2 und 3 kommen nie zum Zug.
`risiko-daten.js` wird **vorab erzeugt und eingecheckt**:

```bash
npm install && npx playwright install chromium   # einmalig
npm run karte                                    # nimmt ./Risk.svg
npm run karte:fein                               # feinere Abtastung
npm run karte:gezeichnet                         # Ersatzkarte, ohne SVG
```

`werkzeug/karte-backen.mjs` startet ein unsichtbares Chromium und lässt dort
das **unveränderte** `risiko-karte.js` laufen. Es gibt also weiterhin genau
eine Implementierung des Einlesens – das Werkzeug baut nichts nach, es führt
nur aus. Den Regelkern schneidet es sich dafür aus `risiko.html` heraus
(`SvgMap` braucht `RiskEngine.TERR`); passen die Markierungen nicht mehr,
bricht es hörbar ab, statt mit einer veralteten Kopie weiterzuarbeiten.

Werden weniger als 42 Territorien erkannt, schreibt das Werkzeug **nichts** und
nennt die fehlenden beim Namen. Dann stimmt eine `id` in der SVG nicht mit
`NAME2ID` überein (Abschnitt 5.3).

Den Knopf **„Karte sichern"** in der Oberfläche gibt es weiterhin; er lädt
dieselbe Datei aus dem laufenden Browser herunter. Er ist jetzt aber nur noch
der Notnagel für den Fall, dass man ohne Werkzeugkette dasteht – der reguläre
Weg ist `npm run karte`, weil er reproduzierbar ist und im Repo landet.

---

## 6. Die Oberfläche und `Board3D` (`risiko.html`, „TEIL 3")

### 6.1 Zusammenspiel

- `dispatch(action)` ist der einzige Weg zum Regelkern: ruft
  `RiskEngine.apply`, bei Erfolg neuer `G`, dann `render()` + `save()`.
- `render()` aktualisiert Seitenleiste, Verlauf, Phasenanzeige, Karten,
  Dialoge und ruft `drawBoard()` → `Board3D.refresh()`.
- `clickTerr(id)` übersetzt einen Land-Klick je nach Phase in die passende
  Aktion (CLAIM/DEPLOY/PLACE/ATTACK/FORTIFY).

### 6.2 `Board3D` (Three.js)

- **Extrusion:** Jedes Territorium-Polygon wird per `THREE.Shape` +
  `ExtrudeGeometry` zu einer Platte mit Höhe (`PLATE`), flach auf die Bodenebene
  gedreht (`rotateX(-90°)`). Material: Oberseite = Territoriumsfarbe (Index 0),
  Seitenwände = braune Klippe (Index 1), beide `DoubleSide`.
- **Koordinaten:** `mapPt(x,y) = [(x-W/2)*S, -(y-H/2)*S]`, Maßstab `S=0.09`.
  Achtung: durch die Extrusion liegt die Welt-Z bei `-mapPt.y`; Beschriftungen
  müssen dasselbe Vorzeichen benutzen (in `drawLabels` bereits berücksichtigt).
- **Grenzlinien:** Zu jeder Platte gehört ein `LineLoop` knapp über der
  Oberseite (`userData.kante`). Ohne ihn verschmelzen zwei benachbarte Länder
  desselben Spielers optisch zu einer Fläche. Die Linie dient zugleich als
  Träger der Hervorhebung.
- **Cel-Shading:** Ober- und Seitenflächen nutzen `MeshToonMaterial` mit
  einer schmalen Verlaufstextur (`toonStufen`). `NearestFilter` verhindert
  das Blenden zwischen den Stufen – daher die harten Lichtkanten und die
  gemalte Anmutung statt eines weichen Verlaufs. Die Stufenwerte sind
  bewusst gedämpft (nicht bis 255), sonst bleichen die Länderfarben aus.
- **Gerundete Plateaukante:** `ExtrudeGeometry` mit schmaler Fase
  (`bevelSize 0.22`). Die Fase erbt das Klippenmaterial, wodurch oben ein
  warmer Saum entsteht. Breiter gesetzt wird daraus schnell ein Rahmen.
- **Kontur:** zwei Lagen. Die `LineLoop` liefert die scharfe Linie, ein
  schmales Band knapp innerhalb der Kante (`bandGeometrie` mit negativer
  Breite) legt einen weichen dunklen Saum darüber. Eine 1px-Linie allein
  trägt bei gemalter Anmutung zu wenig.
- **Licht und Schatten:** Hemisphärenlicht als Grundhelligkeit, ein
  Richtungslicht von schräg vorn links wirft die Schatten, ein schwaches
  Gegenlicht hellt die Schattenseite der Klippen auf. Erst die Schatten geben
  den Platten sichtbare Höhe.

  Zwei Entscheidungen zur Rechenzeit, beide gemessen (Software-Rendering,
  also Worst Case, Vergleichswert ohne Schatten ≈ 22 fps):
  `rend.shadowMap.autoUpdate = false` – Platten und Licht stehen fest, der
  Schattenwurf ist in jedem Bild derselbe und wird einmalig berechnet.
  Und `BasicShadowMap` statt der weichen Varianten: deren weiche Kante wird
  pro Bildpunkt mit vielen Abtastungen erkauft und halbierte die Bildrate
  (11 gegen 16 fps) bei kaum sichtbarem Unterschied.
- **Oberflächen:** Land und Klippen bekommen prozedurale `CanvasTexture`n
  (`landTextur`, `klippenTextur`) – weiche Flecken oben, senkrechte
  Felsstreifen an den Seiten, nach unten dunkler. Bewusst kontrastarm und um
  Helligkeit 1 herum, denn sie werden mit der Länderfarbe **multipliziert**
  und sollen Struktur beitragen, nicht die Farbe verschieben. Erzeugt statt
  als Bilddatei beigelegt, damit das Projekt ohne Anhängsel auskommt.
- **Meer:** eine `CanvasTexture` mit radialem Verlauf, in der Mitte heller, zu
  den Rändern tief. Dazu `scene.fog`, damit ferne Ränder auslaufen.
- **Schaumsaum und Flachwasser:** ein schmales Band rund um jede Platte auf
  Höhe der Wasseroberfläche (`schaumBand`), innen weiße Gischt, dann helles
  Flachwasser, nach außen auslaufend – alles in einer Textur.

  Entscheidend ist, dass es **nur an echten Küsten** liegt. Ein Umriss grenzt
  teils ans Meer, teils an Nachbarländer; Schaum an einer Binnengrenze wäre
  Unsinn. `trifftLand` tastet je Umrisspunkt ein Stück nach außen und prüft
  gegen alle anderen Polygone (mit Rahmen-Vorprüfung, damit das trotz 42
  Ländern schnell bleibt). Nur Segmente, deren beide Enden am Wasser liegen,
  werden überhaupt erzeugt.

  Schaumsaum und Kantensaum entstehen je Umriss, werden aber vor dem
  Einhängen mit `verschmelzen` zu je einem Objekt vereinigt – aus gut hundert
  Zeichenaufrufen werden zwei. Gemessen im Software-Rendering brachte das
  nichts (dort begrenzt die Füllrate, nicht die Zahl der Aufrufe); auf echter
  Grafikhardware und besonders auf Mobilgeräten zählt es.

  Das Band liegt in einer **eigenen Gruppe neben** `group`: dort sucht das
  Raycasting nach angeklickten Ländern, und ein Treffer auf dem Saum hätte
  keine Land-Id. Aus demselben Grund bekommen die Grenzlinien
  `kante.raycast = function(){}` – sonst gingen Klicks nahe einer Grenze
  ins Leere.
- **Beschriftung/Truppen:** Ein zweites `<canvas id="labels">` liegt über dem
  WebGL-Canvas; es bekommt die echte Geräteauflösung (`devicePixelRatio`),
  gerechnet wird in CSS-Pixeln (`labW`/`labH`). Pro Frame werden die
  3D-Mittelpunkte per `camera.project()` projiziert.

  Gezeichnet wird in zwei Runden, weil die Beschriftung sonst übereinander
  liegt: **zuerst alle Truppenzahlen** – sie sind spielentscheidend und
  weichen nie –, **dann die Namen**, jeder nur dort, wo er nichts überdeckt.
  Für jeden Namen werden vier Plätze rund um die Plakette probiert (oben,
  unten, rechts, links); passt keiner, entfällt er. Sortiert wird nach
  Bildschirmtiefe, damit bei Platznot der Vordergrund gewinnt. Die Schriftgröße
  skaliert mit dem Zoom (`95/dist`), sonst klebt sie als gleich großer Block
  über einer winzigen oder riesigen Karte.
- **Einfärbung:** `colorHex(id)` – herrenlos = volle Kontinentfarbe aus der SVG,
  im Besitz = mit Spielerfarbe gemischt. `recolor()` hebt hervor, **ohne die
  Füllfarbe zu ersetzen**: ein Glimmen (`material.emissive`) plus eine
  eingefärbte Grenzlinie – weiß für die Auswahl, gold für mögliche Ziele.
  Früher wurde das gewählte Land schlicht weiß übermalt, womit die
  Spielerfarbe verschwand und man nicht mehr sah, wem es gehört.
- **Zwei Färbungen:** `faerbung` schaltet zwischen `"besitz"` (Spielerfarbe
  wird mit `BESITZ_ANTEIL` untergemischt) und `"kontinent"` (Farben der SVG
  unverändert). Umgeschaltet über `Board3D.setFaerbung()` und den Knopf
  „Färbung" über dem Brett. Die Kontinent-Ansicht bringt die klassische
  Kodierung der Vorlage zur Geltung, die in der Besitz-Ansicht überdeckt wird.
- **Gemalte Weltkarte:** liegt als eigene, flache `ShapeGeometry` knapp über
  der Platte (`MALEREI_HOEHE`), `userData.malerei`. Bewusst **nicht** als
  Textur der Platte selbst: die Fugen zwischen den Ländern sind im Bild
  Löcher (Transparenz, keine gemalten Linien), also muss etwas Eingefärbtes
  darunter liegen, das dort durchscheint. Malerei oben, Besitz unten.
  `recolor()` lässt diese Lage in Ruhe – sie zeigt die Malerei, nicht den
  Besitz.
  Die UV-Koordinaten kommen aus `weltUv(geo)`: jeder Punkt bekommt die Stelle,
  an der er auf der **Gesamtkarte** liegt, gerechnet aus der Weltposition
  zurück in Kartenkoordinaten. Ohne das bekäme jede der 54 Teilflächen das
  ganze Bild einzeln aufgedrückt statt ihren Ausschnitt daraus.
  Quelle ist `window.RISIKO_TEX` aus `grafik/land-textur.js` (erzeugt von
  `werkzeug/textur-backen.mjs`). Fehlt die Datei, entfällt die Lage
  ersatzlos – deshalb hat ihr Script-Tag ein `onerror`.
- **Klicken:** Raycasting (`THREE.Raycaster`) – ein Strahl von der Kamera trifft
  direkt die Platte, `mesh.userData.id`. Zuverlässiger als jede Rückrechnung.
  Grenzlinie und gemalte Lage haben deshalb ein leeres `raycast` – sonst
  fingen sie den Strahl ab und lieferten keine Land-Id.

### 6.3 Steuerung (aktuell)

- **Linke Maustaste ziehen** = drehen; **einfacher Linksklick** = Land wählen.
- **Rechte Maustaste ziehen** = verschieben (Pan; Vertikale „greifend"
  umgedreht). Mausrad-Klick tut dasselbe.
- **Mausrad** = zoomen.
- Knöpfe **Nord/Ost/Süd/West** = Kamera in 90°-Schritten mit weicher Animation,
  zentrieren zugleich (Pan-Reset). **Kippen** wechselt steile/flache Sicht.
- Kamera-Animation: `loop()` interpoliert `ang/tilt/dist` sanft zu `tAng/…`.

---

## 7. Speichern

- **Spielstand:** nach jedem Zug automatisch in `localStorage`
  (Key `risiko.save.v3`). Im Startmenü „Gespeichertes Spiel fortsetzen".
- **Karte:** Cache `risiko.svgmap.v1`, bzw. fest via `risiko-daten.js`.
- Alle Speicherzugriffe sind in try/catch – schlägt localStorage fehl (z. B.
  strenge Browser-Einstellung), läuft das Spiel weiter, nur ohne Speichern.

---

## 8. Bekannte Grenzen / Stolpersteine

- **Die Oberfläche ist nicht automatisch geprüft.** `npm test` deckt den
  Regelkern ab; für `Board3D` und die Dialoge gibt es keinen Testlauf.
  Bisher wurde dort von Hand mit Playwright geprüft.
- **Die Zwischenland-Regel gilt immer.** Sie hatte einmal einen Haken im
  Startmenü, der nichts bewirkte – `opts.chain` wurde gespeichert, aber nie
  gelesen. Der Haken ist entfernt und die Regel bewusst fest verdrahtet.
  Wer sie doch abschaltbar will, hängt eine Bedingung an die
  `fortCap`-Initialisierung in `END_PHASE`.
- **Kleine Teilflächen** unter `FEINHEIT.minFlaeche` werden als
  Abtast-Splitter verworfen. Bei der aktuellen `Risk.svg` gehen dadurch keine
  Inseln verloren (54 Teilflächen in beiden Feinheitsstufen); bei einer
  überarbeiteten Karte mit sehr kleinen Inseln wäre das zu prüfen.
- **Formqualität** der Territorien hängt an der SVG und an `FEINHEIT` in
  `risiko-karte.js`. Voreingestellt sind 500 Abtastpunkte je Pfad und
  Glättung 1.3. `npm run karte:fein` backt mit 2500 Punkten und Glättung
  0.35: rund doppelt so große `risiko-daten.js`, im Bild aber praktisch
  deckungsgleich – die Voreinstellung genügt also.
- **Nicht in jedem Browser getestet.** Entwickelt/gedacht für Chrome.

---

## 9. Nächster großer Schritt: Online-Multiplayer

Vorbereitet durch die Trennung Regelkern/Darstellung. Empfohlener Weg
(ohne eigenen Server): **Supabase** (Postgres + Realtime) für Lobby, Raumcode
und Zustands-Synchronisierung, Veröffentlichung über **Vercel** oder GitHub
Pages. Da alle Aktionen deterministische Pakete sind und der Zufall an einem
`seed` hängt, genügt es, Aktionen (nicht ganze Zustände) zu übertragen und bei
jedem Client durch denselben `RiskEngine.apply` laufen zu lassen. Serverseitige
Validierung über dasselbe `validate()` verhindert Schummeln – seit der
Trennung in `risiko-regeln.js` lässt sich der Kern dafür unverändert in Node
laden.

> **Vorher zu klären: der Zufall darf nicht vorhersehbar sein.**
> `rng` liegt im Zustand, den bei diesem Entwurf jeder Client vollständig
> besitzt, und `rnd()` ist eine reine Funktion davon. Jeder Mitspieler könnte
> also den nächsten Wurf ausrechnen, **bevor** er fällt. Im Hotseat ist das
> belanglos; online ist es ein Totalausfall – und die Hausregel `dice`
> verschärft es, weil dort Entscheidungen bewusst an verdeckter Zufälligkeit
> hängen: ein Verteidiger könnte beide Optionen durchrechnen und die bessere
> nehmen.
>
> Der Zustand verrät ohnehin mehr, als er darf: `deck` und die `hands` aller
> Spieler stehen darin. Beides zusammen führt zur selben Antwort – der Server
> hält die Wahrheit, jeder Spieler bekommt nur eine gefilterte Sicht.
>
> Konsequenz: entweder würfelt der Server (er hält `rng` und liefert nur die
> gefallenen Augen), oder die Würfe werden per Commit-Reveal abgesichert.
> Das ist eine Architekturentscheidung **vor** der ersten Zeile Netzwerkcode,
> denn davon hängt ab, ob der Server nur validiert oder die Wahrheit hält.
> Commit-Reveal käme ohne vertrauenswürdigen Server aus, kostet aber eine
> zusätzliche Runde pro Wurf und hilft gegen das Kartenleck gar nicht.

**Vorhanden ist bereits** `viewFor(state, pi)` (Abschnitt 4.6): es macht aus
dem vollen Zustand die Sicht eines einzelnen Spielers. Damit ist der Teil,
der zum Regelkern gehört, unabhängig von der Serverwahl festgezurrt.

Wenn der Server ohnehin den Zustand verschickt, wird der Rest **einfacher**
als der ursprüngliche Entwurf: Aktions-Wiedergabe und Determinismus werden
für die Synchronisierung gar nicht mehr gebraucht. Der deterministische
Zufall bleibt trotzdem wertvoll – als Testwerkzeug, weil sich jeder Fehler
mit demselben Startwert beliebig oft nachstellen lässt.

---

## 10. Projekt-Historie (Kurzfassung)

1. Prototyp mit vereinfachter Testkarte, Hausregeln implementiert.
2. Klassische 42-Länder-Weltkarte + Karten-Tausch.
3. **Refactor:** Regelkern (`RiskEngine`) sauber von der Darstellung getrennt.
4. Verschieben mit wählbarer Anzahl (Zwischenland-Deckel als Dialog).
5. Startaufstellung, Spielstand-Speicherung, Kartenübernahme beim Ausschalten.
6. Diverse Karten-Darstellungen erprobt (flach, isometrisch-Kacheln,
   selbstgezeichnet, Geodaten) – verworfen zugunsten:
7. **Aktuell:** Karte aus benannter SVG → 3D-Platten (Three.js), frei dreh-,
   kipp-, verschieb- und zoombar; feste Einbindung via `risiko-daten.js`.

---

## 11. Schnellstart für Entwickler:innen

1. Repo klonen, `risiko.html` in Chrome öffnen. Mehr nicht – die Karte liegt
   fertig als `risiko-daten.js` daneben.
2. Code-Einstiegspunkte:
   - Regeln ändern → `RiskEngine` in `risiko.html` (TEIL 1).
   - Kartenerkennung/Namen → `risiko-karte.js`.
   - Aussehen/3D/Steuerung → `Board3D` in `risiko.html` (TEIL 3).
   - Layout/Design/CSS → `<style>`-Block oben in `risiko.html`.
3. Kein Build nötig – speichern und Seite neu laden (Strg+F5).
4. Nur wenn sich die **Karte** ändert, ist ein Schritt nötig:
   `npm run karte` (einmalig vorher `npm install && npx playwright install chromium`).
   Die erzeugte `risiko-daten.js` gehört mit eingecheckt.
