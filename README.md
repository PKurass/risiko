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

## Dateien

| Datei | Zweck |
|---|---|
| `risiko.html` | Regelkern (`RiskEngine`), Oberfläche und 3D-Darstellung (`Board3D`) |
| `risiko-karte.js` | Karten-Modul `SvgMap`: liest die SVG ein, wandelt sie in Polygone |
| `risiko-daten.js` | **Erzeugt.** Die gebackene Karte. Nicht von Hand ändern |
| `vendor/three.min.js` | Three.js r128, lokal eingebunden |
| `werkzeug/karte-backen.mjs` | Backt die Karte headless |
| `DOKUMENTATION.md` | Technische Dokumentation |
| `archiv/` | Nicht eingebundene Stände, siehe [archiv/README.md](archiv/README.md) |

`Risk.svg` liegt mit im Repo. Zum Spielen wird sie nicht gebraucht, nur zum
Backen – aber nur so bleibt die Karte reproduzierbar.

## Stand und nächste Schritte

Lokal spielbar: 3D-Karte, frei dreh-, kipp-, verschieb- und zoombar,
Spielstand wird automatisch im Browser gespeichert.

Offene Punkte (ausführlich in DOKUMENTATION.md Abschnitt 8 und 9):

- **Optik** – als Nächstes dran.
- **Der Hausregel-Schalter `chain` wirkt nicht.** `opts.chain` wird in
  `createGame` gespeichert, aber nirgends ausgewertet; die
  Zwischenland-Regel ist dadurch immer aktiv, egal wie der Haken im
  Startmenü steht.
- **Kein Test-Harness.** `RiskEngine` kommt ohne HTML und ohne Three.js aus,
  ist also unverändert testbar – nur ist gerade nichts verdrahtet.
- **Online-Multiplayer:** vorbereitet durch die Trennung Regelkern/Darstellung,
  aber noch nicht gebaut.
