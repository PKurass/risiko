<?php
/* ===================================================================
   ZUGANGSDATEN ZUR DATENBANK

   Die vier Angaben stehen im IONOS-Kundenmenü unter "Datenbanken".
   Ersetze überall das, was mit HIER- anfängt. Die Anführungszeichen
   müssen stehen bleiben.

   Beispiel, wie es ausgefüllt aussieht:

     "dsn" => "mysql:host=db5012345678.hosting-data.io;dbname=dbs12345678;charset=utf8mb4",
     "benutzer" => "dbu1234567",
     "kennwort" => "meinGeheimesPasswort",

   ACHTUNG, das wird gern verwechselt:
     host=   ist der HOSTNAME  (die lange db....hosting-data.io-Adresse)
     dbname= ist der DATENBANKNAME (fängt meist mit dbs an)
   =================================================================== */
return [
    "dsn"      => "mysql:host=HIER-HOSTNAME;dbname=HIER-DATENBANKNAME;charset=utf8mb4",
    "benutzer" => "HIER-BENUTZERNAME",
    "kennwort" => "HIER-PASSWORT",
];
