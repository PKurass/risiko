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
npm run karte -- pfad/zu/andere.svg
npm run karte:gezeichnet   # ohne SVG, siehe unten
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

### Welche Karte steckt gerade drin?

Aktuell die **selbstgezeichnete Ersatzkarte** aus
`archiv/risiko-karte-gezeichnet.js` – der Kartenblock, der früher ungenutzt in
`risiko.html` lag. Grob, aber vollständig (42/42) und ohne Internet.

Sie ist nur die Rückfallebene, weil `Risk.svg` noch nicht im Repo liegt. Sobald
die SVG da ist:

```bash
npm run karte
```

und die Ersatzkarte ist ersetzt. Den Kopf von `risiko-daten.js` verrät jederzeit,
aus welcher Quelle die aktuelle Fassung gebacken wurde.

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

`Risk.svg` liegt (noch) nicht im Repo. Sie wird nur zum Backen gebraucht, nicht
zum Spielen – gehört aber hinein, damit die Karte reproduzierbar bleibt.

## Stand und nächste Schritte

Lokal spielbar: 3D-Karte, frei dreh-, kipp-, verschieb- und zoombar,
Spielstand wird automatisch im Browser gespeichert.

Offene Punkte (ausführlich in DOKUMENTATION.md Abschnitt 8 und 9):

- **Optik** – als Nächstes dran.
- **`Risk.svg` fehlt im Repo**, deshalb läuft gerade die Ersatzkarte.
- **Der Hausregel-Schalter `chain` wirkt nicht.** `opts.chain` wird in
  `createGame` gespeichert, aber nirgends ausgewertet; die
  Zwischenland-Regel ist dadurch immer aktiv, egal wie der Haken im
  Startmenü steht.
- **Kein Test-Harness.** `RiskEngine` kommt ohne HTML und ohne Three.js aus,
  ist also unverändert testbar – nur ist gerade nichts verdrahtet.
- **Online-Multiplayer:** vorbereitet durch die Trennung Regelkern/Darstellung,
  aber noch nicht gebaut.
