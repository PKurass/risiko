# Arbeitsanweisung für Claude Code

Browserbasiertes Risiko mit Hausregeln. Details in `README.md`, Technik in
`DOKUMENTATION.md`. Diese Datei ist die Kurzfassung fürs Arbeiten – sie soll
kurz bleiben, damit sie in jeder Sitzung mitgelesen werden kann.

## Grundsätze, die nicht zur Debatte stehen

- **Kein Build-Schritt, kein Framework, kein CDN.** `risiko.html` im Browser
  öffnen muss genügen. Three.js liegt lokal in `vendor/`.
- **Regelkern und Darstellung bleiben getrennt.** `risiko-regeln.js` kennt
  kein HTML und kein Three.js. Alles, was Spiellogik ist, gehört dorthin –
  auch wenn es in der Oberfläche kürzer wäre.
- **Kommentare auf Deutsch, ohne Umlaute im Code** (die Dateien sind
  gemischt-kodiert gewachsen). Kommentare erklären das **Warum**, nicht das
  Was. Besonders wertvoll: festhalten, was schon einmal *nicht* funktioniert
  hat und warum.
- **Vor jedem Commit `npm test`.** 28 Tests, unter einer Sekunde.

## Befehle

```bash
npm test                              # Regelkern, ohne Browser
npm run karte                         # Risk.svg -> risiko-daten.js
npm run textur -- grafik/Risk_tex.png # Malerei -> grafik/land-textur.js
npm run einzeldatei                   # eine verschickbare HTML-Datei
npm run artefakt                      # dieselbe ohne Dokumentrahmen (Web)
```

## Erzeugte Dateien – nie von Hand ändern

`risiko-daten.js`, `grafik/land-textur.js`, `risiko-komplett.html`,
`risiko-artefakt.html`, `textur-pruefung.png`.

## Optik-Arbeit: sparsam prüfen

Screenshots sind der mit Abstand teuerste Teil einer Sitzung. Deshalb:

1. **Erst messen, dann schauen.** Zahlen aus der Seite heraus (Größe in
   Bildpunkten, Anzahl, Position, Deckungsgrad) beantworten die meisten
   Fragen und kosten fast nichts. Ein Bild erst, wenn es um Geschmack geht.
2. **Klein aufnehmen.** `deviceScaleFactor: 1`, Breite um 900 px, und auf den
   fraglichen Ausschnitt zuschneiden. Für die Beurteilung von Form und Farbe
   reicht das; ein Vollbild in doppelter Auflösung kostet ein Vielfaches.
3. **Einzelteile isoliert ansehen**, nicht auf dem ganzen Brett
   (`werkzeug/form-vorschau.mjs`).
4. **Alle Änderungswünsche in einem Durchgang** umsetzen, dann ein Bild –
   nicht Änderung, Bild, Änderung, Bild.

## Wenn etwas unsichtbar bleibt

Das ist in diesem Projekt mehrfach vorgekommen und hatte jedes Mal eine
andere Ursache. Diese Liste vor dem Suchen durchgehen:

- **Höhe:** Die Fase zählt zur Plattenhöhe. Die Oberseite liegt auf
  `DECKEL = PLATE + FASE_DICKE`, nicht auf `PLATE`.
- **Größe:** Bei normalem Zoom sind 0,4 Welteinheiten rund drei Bildpunkte.
- **Farbe:** In der Besitzer-Ansicht hat die Fläche *genau* die
  Spielerfarbe. Alles, was in Spielerfarbe darauf liegt, verschwindet.
- **Verdeckt:** Die Zahlenplakette sitzt über der Landesmitte.
- **Schatten:** `shadowMap.autoUpdate` ist aus. Wer nach dem Aufbau
  Geometrie hinzufügt, muss `needsUpdate` setzen.
- **UV:** `ExtrudeGeometry` legt die UVs der Seitenwände in Welteinheiten an,
  nicht auf 0..1 normiert.

## Was als Nächstes ansteht

`README.md`, Abschnitt „Stand und nächste Schritte". Der große offene Punkt
ist der Online-Mehrspieler-Modus (`DOKUMENTATION.md` Abschnitt 9) – **dort
gilt: gewürfelt wird auf dem Server.** Wer den vollen Zustand hat, kann
jeden Wurf vorab ausrechnen; der Sichtfilter `viewFor` steht dafür bereit.
