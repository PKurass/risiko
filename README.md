# ⚔️ Risiko – Hausregel-Edition

Browserbasiertes Risiko mit eigenen Hausregeln, hotseat (alle Spieler an einem
Gerät). Kein Framework, kein Build-Schritt, keine Installation – `risiko.html`
im Browser öffnen genügt.

Die ausführliche technische Beschreibung steht in **[DOKUMENTATION.md](DOKUMENTATION.md)**.
Wer am Code arbeitet, sollte dort mindestens Abschnitt 3 (Architektur) und
Abschnitt 4 (Regelkern) gelesen haben.

## Loslegen

Repo klonen, `risiko.html` in Chrome öffnen. Das war's – kein Auswählen, kein
Internet, kein Cache.

Möglich ist das, weil zwei Dinge fest im Repo liegen:

- **`risiko-daten.js`** – die fertig gebackene Karte. `risiko.html` lädt sie
  beim Start von selbst.
- **`vendor/three.min.js`** – die 3D-Bibliothek (Three.js r128), lokal statt
  per CDN.

## Die Karte neu backen

Nötig, sobald sich die `Risk.svg` ändert. Einmalig die Werkzeuge einrichten:

```bash
npm install
npx playwright install chromium
```

Dann:

```bash
npm run karte              # nimmt ./Risk.svg
npm run karte:fein         # feinere Abtastung, siehe unten
npm run karte -- pfad/zu/andere.svg
npm run karte:gezeichnet   # ohne SVG, Notfallkarte
```

Das Werkzeug startet ein unsichtbares Chromium und lässt dort das
**unveränderte** `risiko-karte.js` laufen – dieselbe Logik wie früher der
Knopf „Karte sichern", nur ohne Klicken. Ergebnis ist eine neue
`risiko-daten.js`, die eingecheckt gehört.

Warum überhaupt ein Browser? `SvgMap` tastet die SVG-Pfade mit
`getTotalLength()` / `getPointAtLength()` ab und liest die Füllfarbe per
`getComputedStyle()`. Diese Kurvenmathematik steckt in der Browser-Engine;
in reinem Node gibt es sie nicht. Deshalb wird sie dort ausgeführt, wo sie
existiert – statt sie nachzubauen und zwei Fassungen zu pflegen.

Erkennt das Werkzeug weniger als 42 Territorien, bricht es ab und nennt die
fehlenden beim Namen; es schreibt dann nichts. Fast immer passt dann eine `id`
in der SVG nicht zur Namensliste `NAME2ID` in `risiko-karte.js`
(siehe DOKUMENTATION.md Abschnitt 5.1 und 5.3).

### Wie detailtreu wird die Karte?

`importSvg` tastet jeden SVG-Pfad in Punkten ab und vereinfacht die Punktfolge
danach. Wie fein, steht in der Konstante `FEINHEIT` in `risiko-karte.js`:

| | `punkte` | `glaettung` | `risiko-daten.js` |
|---|---|---|---|
| Voreinstellung (`npm run karte`) | 500 | 1.3 | 37 kB |
| `npm run karte:fein` | 2500 | 0.35 | 77 kB |

Bei der aktuellen `Risk.svg` liegen beide Fassungen praktisch deckungsgleich
übereinander (54 Teilflächen in beiden, keine Insel geht verloren). Die
Voreinstellung genügt also – `--fein` lohnt erst, wenn eine überarbeitete Karte
sehr feine Küstenlinien bekommt.

Den Kopf von `risiko-daten.js` verrät jederzeit, aus welcher Quelle und in
welcher Stufe die aktuelle Fassung gebacken wurde.

## Die gemalte Weltkarte

Über den Platten liegt eine hauchdünne zweite Lage: die von Hand gemalte
Weltkarte (`grafik/Risk_tex.png`). Sie ersetzt die Einfärbung nicht, sie
arbeitet mit ihr zusammen — je nach Ansicht:

- **Kontinente** – die Malerei in ihren eigenen Farben, unverändert.
- **Besitzer** – dieselbe Malerei entfärbt, als Pinselstruktur über der
  Spielerfarbe. Die gemalte Anmutung bleibt, und man sieht trotzdem sofort,
  wem was gehört.

Neu gebacken wird sie mit:

```bash
npm run textur -- grafik/Risk_tex.png
```

| Datei | Wozu |
|---|---|
| `textur-pruefung.png` | Die eingepasste Malerei mit den Umrissen aus `risiko-daten.js` in Magenta darüber. Zum Draufschauen, nicht eingecheckt. |
| `grafik/land-textur.png` | Die fertige Textur als Bild (2048 px Kantenlänge). Ebenfalls nicht eingecheckt. |
| `grafik/land-textur.js` | Dasselbe als data-URL. **Die** lädt das Spiel. |

### Die Einpassung

Photoshop-Malerei und `Risk.svg` zeigen dieselbe Welt, aber selten im exakt
selben Ausschnitt — die erste Fassung war rund 13 % zu groß und entsprechend
verschoben. Von Hand ist das Gefummel, deshalb rechnet das Werkzeug es aus: es
sucht die Dehnung und Verschiebung, bei der bemalte Fläche und Spielfläche am
besten übereinanderliegen, und backt die Textur gleich begradigt aus.

```
Einpassung: Dehnung 1.1273 / 1.1230, Versatz -6.37 % / -6.06 %
Ueberschneidung (IoU): 57.8 %  ->  97.1 %
Bemalte Spielflaeche:  83.5 %  ->  99.1 %
```

Gemessen wird an der **Überschneidung** (IoU), nicht an der Deckung allein –
sonst wäre „Bild riesig ziehen, bis alles zugeklebt ist" die beste Lösung.
Bleibt die bemalte Spielfläche danach unter etwa 88 %, haben Malerei und
Umrisse unterschiedliche *Formen*; das lässt sich durch Dehnen und Schieben
nicht beheben, und `textur-pruefung.png` zeigt, wo. Mit `--roh` bleibt das
Bild unangetastet.

Warum die JavaScript-Datei? Chrome verbietet einer per Doppelklick geöffneten
Seite, eine Bilddatei aus dem Nachbarordner als Textur zu benutzen – ein
`<script src>` darf sie dagegen laden. Denselben Trick benutzt schon
`risiko-daten.js`, und die Einzeldatei-Fassung bekommt die Textur so ohne
Zusatzarbeit mit.

Fehlt `grafik/land-textur.js`, läuft das Spiel wie bisher, nur einfarbig.

## Tests

```bash
npm test
```

Prüft den Regelkern ohne Browser: Weltdaten (beidseitige Nachbarschaften,
Kontinent-Zuordnung), Einkommen und Boni, Kartenstaffel, den zweistufigen
Kampf, die Hausregeln, Aufstellung, Phasenwechsel und den Determinismus.
28 Tests, unter einer Sekunde.

## Eine Datei zum Verschicken

```bash
npm run einzeldatei
```

Packt `risiko.html` samt Karten-Modul, gebackener Karte und Three.js in eine
einzige `risiko-komplett.html` (rund 675 kB). Die läuft per Doppelklick aus
jedem beliebigen Ordner – ohne Repo, ohne Nachbardateien, ohne Internet.
Praktisch zum Ausprobieren und zum Herumschicken, solange es noch keine
Online-Fassung gibt.

Zum Weiterentwickeln bleibt `risiko.html` das Original; die verpackte Fassung
ist ein Wegwerf-Ergebnis und deshalb nicht eingecheckt.

```bash
npm run artefakt
```

Baut zusätzlich `risiko-artefakt.html`: derselbe Inhalt ohne `<html>`, `<head>`
und `<body>`. Das braucht man beim Veröffentlichen als Webseite, weil der Host
seinen eigenen Dokumentrahmen darum legt – mit unserem eigenen wären es zwei
ineinander. Ebenfalls nicht eingecheckt.

## Dateien

| Datei | Zweck |
|---|---|
| `risiko.html` | Oberfläche und 3D-Darstellung (`Board3D`) |
| `risiko-regeln.js` | Regelkern `RiskEngine` – die gesamte Spiellogik |
| `risiko-karte.js` | Karten-Modul `SvgMap`: liest die SVG ein, wandelt sie in Polygone |
| `risiko-daten.js` | **Erzeugt.** Die gebackene Karte. Nicht von Hand ändern |
| `vendor/three.min.js` | Three.js r128, lokal eingebunden |
| `grafik/land-textur.js` | **Erzeugt.** Die gemalte Weltkarte als data-URL. Darf fehlen |
| `werkzeug/karte-backen.mjs` | Backt die Karte headless |
| `werkzeug/textur-backen.mjs` | Prüft und backt die Landtextur (`npm run textur`) |
| `werkzeug/regeln-testen.mjs` | Tests für den Regelkern (`npm test`) |
| `werkzeug/einzeldatei-bauen.mjs` | Packt alles in eine verschickbare HTML-Datei (`--fragment` für die Web-Fassung) |
| `DOKUMENTATION.md` | Technische Dokumentation |
| `archiv/` | Nicht eingebundene Stände, siehe [archiv/README.md](archiv/README.md) |

`Risk.svg` liegt mit im Repo. Zum Spielen wird sie nicht gebraucht, nur zum
Backen – aber nur so bleibt die Karte reproduzierbar.

## Spielsteine

Die Truppen liegen als Steine auf dem Land, nachgebildet nach der Ausgabe von
1983: **flache Sternprismen, und die Zackenzahl sagt den Wert** – drei Zacken
sind eine Truppe, vier sind fünf, fünf sind zehn. 23 Truppen sind also zwei
Zehner und drei Einer, fünf Steine statt dreiundzwanzig.

Die Form ist nicht „Kreis mit Kerben", sondern **runde Arme mit einer
Hohlkehle dazwischen**: jeder Arm ist ein Balken der Breite `armBreite` mit
runder Kappe, und wo zwei Arme zusammentreffen, sitzt eine Hohlkehle vom
Radius `kehle`. Die Armflanken sind die Tangenten dazwischen und ergeben sich
von selbst. Alle drei Steine hängen an denselben beiden Reglern.

Die Steine liegen an Plätzen, die je Land einmal ausgewürfelt und gemerkt
werden – verstreut, aber weit genug vom Rand, damit keiner über der Klippe
hängt. Der Startwert kommt aus dem Landesnamen, damit dieselbe Streuung in
jedem Spiel wieder herauskommt; hüpfende Steine bei jedem Zug würden Bewegung
vortäuschen, wo keine ist.

Gezeichnet wird mit `InstancedMesh`: ein Aufruf an die Grafikkarte je Spieler
und Wert statt einer je Stein. Dazu ein dunkler Rand aus derselben Form,
etwas breiter und nur mit den Rückseiten gezeichnet – ein fester Farbauf- oder
-abschlag reicht nicht, weil die Fläche darunter je nach Spieler mal hell und
mal dunkel ist.

Die Truppenzahl bleibt als Plakette darüber stehen – wer angreift, muss sie
genau kennen, und ab zwölf Steinen zählt niemand mehr nach.

## Spielerfarben

Im Startmenü hat jeder Spieler eine Farbpalette unter dem Namensfeld. Die
gewählte Farbe trägt einen hellen Ring; auf den Farben, die schon jemand
anderem gehören, steht dessen Nummer. Ein Klick darauf **tauscht** mit ihm –
kürzer erklärt als jede Sperre, und niemand bleibt ohne Farbe zurück.

Zehn Farben stehen zur Wahl, sechs davon sind die Voreinstellung. Alle sind
auf der eingefärbten Karte deutlich auseinanderzuhalten (kein zweites Rot,
kein zweites Blau).

## Hausregeln

Im Startmenü einzeln abschaltbar:

- **Eroberung auf max. 3 begrenzen** – nach gewonnenem Kampf rücken höchstens
  3 Truppen ins eroberte Land nach.
- **Spielkarten & Tausch** – Wertstaffel 4, 6, 8, 10, 12, 15, dann +5.
- **Startaufstellung selbst wählen** – Länder reihum wählen statt zufällig.
- **Würfelanzahl selbst wählen** – der Angreifer entscheidet über 1 bis 3
  Würfel; sein Wurf wird offengelegt, und **danach** entscheidet der
  Verteidiger über 1 oder 2. Wer 6-6-6 vor sich sieht, hält nicht mit zwei
  Würfeln dagegen.

Dazu die **Zwischenland-Regel**, die immer gilt und deshalb keinen Schalter
hat: verschieben darf man beliebig oft, aber nur zwischen Nachbarn, und jedes
Land gibt pro Zug höchstens so viel ab, wie es zu Beginn der Verschiebephase
besaß. Frisch angekommene Truppen bleiben stehen – Nachschub marschiert über
mehrere Züge nach vorne, statt in einem Zug quer über die Karte gereicht zu
werden.

Details zu allen Regeln in DOKUMENTATION.md Abschnitt 4.4.

## Bedienung

- **Würfel und Kampf** – echte Würfel mit Augen, die sichtbar rollen. Nach dem
  Wurf zeigt ein Kampffenster Paar für Paar, welcher Würfel welchen schlägt:
  der Verlierer fällt zurück, der Gewinner tritt hervor, daneben steht, wer die
  Truppe verliert. Unten die Bilanz. Das Fenster geht von selbst zu – wer
  schneller ist, klickt.
- **Kartenblatt** – jede Handkarte mit Symbol und Namen; ein Hinweis sagt, ob
  ein Tausch möglich ist und wie viele Truppen er bringt. **Set vorschlagen**
  wählt eine gültige Dreierkombination aus. Ab 5 Karten erscheint die
  Tauschpflicht als Warnung, statt erst beim Weiterklicken zu erscheinen.
- **Kontinente** – Liste mit Bonus, dem eigenen Fortschritt (`4/9`) und einem
  Punkt in der Farbe dessen, der den Kontinent vollständig hält.
- **Färbung umschalten** – Knopf über dem Brett:
  *Kontinente* zeigt die gemalte Weltkarte in ihren eigenen Farben
  (Nordamerika gelb, Europa blau, Asien grün …), *Besitzer* legt dieselbe
  Malerei entfärbt über die Spielerfarbe.

## Stand und nächste Schritte

Lokal spielbar: 3D-Karte, frei dreh-, kipp-, verschieb- und zoombar,
Spielstand wird automatisch im Browser gespeichert.

Offene Punkte (ausführlich in DOKUMENTATION.md Abschnitt 8 und 9):

- **Optik** – gemalte Weltkarte liegt auf, Klippen laufen ungleichmäßig hoch,
  das Meer hat Flachwasser entlang der Küsten, der Schaumsaum schwankt und
  reißt stellenweise ab. Feinschliff jederzeit möglich.
- **Online-Multiplayer:** vorbereitet durch die Trennung Regelkern/Darstellung,
  aber noch nicht gebaut. Der Sichtfilter `viewFor` steht bereits
  (DOKUMENTATION.md 4.6); offen ist die Serverwahl. **Wichtig dabei:**
  gewürfelt werden muss auf dem Server – wer den vollen Zustand hat, kann
  jeden Wurf vorab ausrechnen. Siehe Abschnitt 9.
