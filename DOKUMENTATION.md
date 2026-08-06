# Risiko – Hausregel-Edition · Technische Dokumentation

Stand dieser Doku: aktueller Entwicklungsstand (3D-Karte aus SVG, lokal spielbar).
Zielgruppe: Entwickler:in (JavaScript) und Webdesigner:in, die das Projekt fortführen.

---

## 1. Was ist das Projekt?

Ein browserbasiertes Risiko-Spiel mit eigenen **Hausregeln**, gedacht zum
Spielen mit Freunden. Aktuell läuft es als reine Webapp (eine HTML-Datei plus
zwei JS-Dateien), **hotseat** – alle Spieler an einem Gerät, reihum. Der
Online-Mehrspieler-Modus ist vorbereitet, aber noch nicht gebaut (siehe Abschnitt 9).

Kein Framework, kein Build-Schritt, keine Installation. Öffnen genügt.
Einzige externe Abhängigkeit zur Laufzeit: **Three.js** (3D), einmalig per CDN.

---

## 2. Dateien im Ordner

| Datei | Zweck | Pflicht |
|------|-------|---------|
| `risiko.html` | Enthält Regelkern, Oberfläche (UI) und die 3D-Darstellung (Three.js) | ja |
| `risiko-karte.js` | Karten-Modul `SvgMap`: liest die SVG ein, wandelt sie in Polygone, cacht sie | ja |
| `risiko-daten.js` | **Erzeugt.** Die gebackene Karte. Wird beim Start automatisch geladen und hat Vorrang vor Cache und SVG-Auswahl | ja |
| `vendor/three.min.js` | Three.js r128, lokal statt per CDN | ja |
| `Risk.svg` | Die Ausgangs-Weltkarte, 42 benannte Flächen. Nur zum Backen nötig, nicht zum Spielen | nein |
| `werkzeug/karte-backen.mjs` | Backt `Risk.svg` → `risiko-daten.js`, headless | nein |
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
> ausgewählt werden muss. Das ist überholt: die Karte wird jetzt vorab
> gebacken und liegt als `risiko-daten.js` im Repo (Abschnitt 5.4).

> Hinweis: Ein Browser lädt lokale Dateien aus Sicherheitsgründen nicht per
> `fetch()`. Deshalb wird die SVG **einmal manuell ausgewählt** und danach
> dauerhaft gespeichert – nicht bei jedem Start neu.

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
3. **Testbarkeit.** Der Regelkern lässt sich ohne Anzeige prüfen (es gab dafür
   einen Selbsttest; er ist in der aktuellen 3D-Fassung nicht mehr verdrahtet,
   die Funktion `RiskEngine` ist aber unverändert testbar).

---

## 4. Der Regelkern `RiskEngine` (in `risiko.html`, „TEIL 1")

Ein IIFE, das ein Objekt mit reinen Funktionen zurückgibt. **Unveränderlich
behandeln:** `apply()` verändert nie den Eingabezustand, sondern klont ihn
(`JSON.parse(JSON.stringify(...))`) und gibt einen neuen zurück.

### 4.1 Zustandsobjekt (state)

```js
{
  players: [{name, color, alive}],   // Reihenfolge = Zugreihenfolge
  owner:   { terrId: playerIndex | -1 },   // -1 (NONE) = herrenlos (nur in Aufstellung)
  armies:  { terrId: number },
  opts:    { cap3, chain, cards, draft },  // Hausregel-Schalter (siehe 4.4)
  cur:     playerIndex,              // wer ist dran
  phase:   "claim"|"deploy"|"reinforce"|"attack"|"fortify",
  reinf:   number,                   // noch zu setzende Verstärkungen
  toPlace: [number per player],      // Starttruppen in der Aufstellung
  hands:   [ [ {sym} ] ],            // Handkarten je Spieler; sym: inf|kav|art|wild
  deck: [], discard: [],
  tradeCount: number,                // wie oft schon Karten getauscht (Wertstaffel)
  conquered: bool,                   // hat cur diesen Zug erobert? (Karten-Zug am Zugende)
  pending: null | {type:"occupy", from, to, max},  // offene Eroberung
  fortCap: { terrId: number },       // Rest-Verschiebekontingent je Land (Hausregel)
  winner:  null | playerIndex,
  rng:     number,                   // Zustand des Zufallsgenerators (reproduzierbar!)
  log:     [ {t, c, d} ]             // Verlaufszeilen: Text, CSS-Klasse, optional Würfel
}
```

### 4.2 Der Zufallsgenerator ist deterministisch

`createGame(players, opts, seed)` bekommt einen Startwert. Alle Würfel und
Mischvorgänge laufen über `rnd(s)` mit diesem `seed`. **Gleicher Startwert =
exakt gleicher Spielverlauf.** Das ist die Grundlage dafür, dass später alle
Online-Mitspieler garantiert dieselben Würfel sehen, ohne dass jeder Wurf
einzeln übers Netz muss.

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
| `ATTACK` | `from`, `to` | Phase 2: angreifen (würfelt intern) |
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

2. **`chain` – Ketten-Verschieben / Zwischenland-Regel.** Beim Verschieben
   (Phase 3) darf **jedes Land pro Zug nur so viele Truppen abgeben, wie es zu
   Beginn der Phase hatte** (minus 1, die bleibt immer). Umsetzung: beim Wechsel
   in `fortify` wird `fortCap[id] = armies[id] - 1` als Deckel eingefroren; jede
   `FORTIFY`-Aktion zieht vom Deckel ab (`fortifyCapOf`, `fortifyMaxOf`).
   Effekt: Truppen „wandern" über mehrere Züge nach vorne, statt in einem Zug
   quer über die Karte zu teleportieren. Der Spieler wählt pro Verschiebung die
   Anzahl selbst (Dialog).

3. **`cards` – Spielkarten & Tausch.** Nach einem Zug mit Eroberung zieht man
   eine Karte. 3 gleiche oder 3 verschiedene Symbole (★ = Joker) ergeben
   Bonustruppen mit steigender Wertstaffel: **4, 6, 8, 10, 12, 15, dann +5**
   (`tradeValue`). Ab 5 Karten Tauschpflicht zu Zugbeginn. Wer einen Spieler
   ausschaltet, übernimmt dessen Handkarten.

4. **`draft` – Startaufstellung selbst wählen.** Länder werden reihum gewählt
   (`CLAIM`), danach Starttruppen reihum gesetzt (`DEPLOY`). Ausgeschaltet:
   alles wird zufällig verteilt (`AUTO_SETUP`).

### 4.5 Weltdaten im Regelkern

`TERR` (42 Territorien mit Name + Kontinent), `ADJ` (Nachbarschaften,
beidseitig), `CONTINENTS` (Kontinent-Boni: Nordamerika 5, Südamerika 2,
Europa 5, Afrika 3, Asien 7, Australien 2). Die Nachbarschaften entsprechen
dem klassischen Risiko-Brett. **Die IDs hier sind die kanonischen Schlüssel**,
auf die sich Karte und UI beziehen.

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
normiert auf Breite 1200. Farbe je Territorium via `getComputedStyle(path).fill`.
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
- **Beschriftung/Truppen:** Ein zweites `<canvas id="labels">` liegt über dem
  WebGL-Canvas. Pro Frame werden die 3D-Mittelpunkte per `camera.project()` auf
  den Bildschirm projiziert und Name + Truppenzahl-Plakette gezeichnet.
- **Einfärbung:** `colorHex(id)` – herrenlos = volle Kontinentfarbe aus der SVG,
  im Besitz = mit Spielerfarbe gemischt; `recolor()` setzt zusätzlich Auswahl
  (weiß), Angriffsziele (hell) und Hover (aufgehellt).
- **Klicken:** Raycasting (`THREE.Raycaster`) – ein Strahl von der Kamera trifft
  direkt die Platte, `mesh.userData.id`. Zuverlässiger als jede Rückrechnung.

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

- **Kein Test-Harness in der 3D-Fassung.** Der frühere Selbsttest des
  Regelkerns ist nicht mehr verdrahtet; die Logik selbst ist unverändert.
- **Der Hausregel-Schalter `chain` wirkt nicht.** `opts.chain` wird in
  `createGame` gespeichert, aber an keiner Stelle gelesen: `END_PHASE` friert
  beim Wechsel in `fortify` den Deckel `fortCap` bedingungslos ein. Die
  Zwischenland-Regel (Abschnitt 4.4, Punkt 2) ist dadurch **immer aktiv**,
  unabhängig vom Haken im Startmenü. Zu entscheiden: Schalter wirksam machen
  oder Regel fest verdrahten und den Haken entfernen.
- **`Risk.svg` liegt nicht im Repo.** Gebacken ist gerade die selbstgezeichnete
  Ersatzkarte aus `archiv/risiko-karte-gezeichnet.js`. Der Kopf von
  `risiko-daten.js` nennt die jeweilige Quelle.
- **Formqualität** der Territorien hängt an der SVG und an `rdp`-Epsilon in
  `importSvg` (aktuell 1.3). Kleiner = detaillierter, größer = glatter.
- **Nicht in jedem Browser getestet.** Entwickelt/gedacht für Chrome.

---

## 9. Nächster großer Schritt: Online-Multiplayer

Vorbereitet durch die Trennung Regelkern/Darstellung. Empfohlener Weg
(ohne eigenen Server): **Supabase** (Postgres + Realtime) für Lobby, Raumcode
und Zustands-Synchronisierung, Veröffentlichung über **Vercel** oder GitHub
Pages. Da alle Aktionen deterministische Pakete sind und der Zufall an einem
`seed` hängt, genügt es, Aktionen (nicht ganze Zustände) zu übertragen und bei
jedem Client durch denselben `RiskEngine.apply` laufen zu lassen. Serverseitige
Validierung über dasselbe `validate()` verhindert Schummeln.

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
