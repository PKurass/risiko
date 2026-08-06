# Archiv

Hier liegen Stände, die **nicht** eingebunden sind. `risiko.html` lädt aus
diesem Ordner nichts – die Dateien sind Nachschlagewerk und Rückfallebene.
Wer eine davon wieder aktivieren will, muss sie in den Hauptordner kopieren
und den `<script src>` in `risiko.html` anpassen.

| Datei | Was es ist |
|---|---|
| `risiko-karte_STABIL-v1.js` | Beschriftete Sicherungskopie des Karten-Moduls `SvgMap`. Inhaltlich gleich zu `../risiko-karte.js`, nur ohne die ausführlichen Kommentare. Gedacht als Rückfallebene, falls eine Änderung am Karten-Modul schiefgeht. |
| `risiko-karte-gezeichnet.js` | Die selbstgezeichnete Weltkarte (Modul `WorldMap`): Umrisse der Landmassen plus ein Ankerpunkt je Territorium, daraus wird gerastert und die Grenzen werden verfolgt. Lag bis zur SVG-Karte unbenutzt in `risiko.html`. Braucht kein Internet und keine SVG und ist deshalb die Ersatzquelle von `werkzeug/karte-backen.mjs --gezeichnet`. Einziger Unterschied zur Fassung aus der HTML: das Rückgabe-Objekt reicht zusätzlich `polys` nach außen. |
| `risiko-welt.js` | Frühere Kartenvariante `WorldMapGeo`: baut die 42 Gebiete aus echten Geodaten (world-atlas, 1:110 Mio), verschmilzt Staaten zu Gebieten und verfolgt die Außenkanten aus einem Raster. Verworfen zugunsten der SVG-Karte, weil die Formen sich schlechter kontrollieren ließen. Braucht zur Laufzeit Internet (lädt TopoJSON per `fetch`). |

Beide Module erwarten, dass `RiskEngine` bereits geladen ist – sie greifen beim
Auswerten direkt auf `RiskEngine.TERR` zu.
