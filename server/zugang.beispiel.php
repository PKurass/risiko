<?php
/* Vorlage. Kopie als server/zugang.php anlegen und ausfuellen – die
   richtige Datei gehoert NICHT ins Repo (steht in .gitignore).

   Bei IONOS stehen die Werte im Kundenmenue unter "Datenbanken". */
return [
    "dsn"      => "mysql:host=db1234.hosting-data.io;dbname=dbs123456;charset=utf8mb4",
    "benutzer" => "dbu123456",
    "kennwort" => "hier-das-kennwort",
];
